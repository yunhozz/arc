import path from 'node:path';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { spawn } from 'node:child_process';
import { DEFAULT_POLICY } from './role-dispatch-policy.mjs';

const environments = new WeakMap();
export function resolveConfigHome(platform, { userHome, env = {}, cwd } = {}) {
  if (!['codex', 'claude'].includes(platform)) throw Error('Target must be codex or claude');
  if (typeof userHome !== 'string' || !path.isAbsolute(userHome) || !userHome.trim()) throw Error('userHome must be an absolute user directory');
  userHome = path.resolve(userHome);
  if (!env || typeof env !== 'object') throw Error('env must be an environment object');
  const expand = value => value === '~' ? userHome : value.startsWith('~/') ? path.join(userHome, value.slice(2)) : value;
  let home;
  if (platform === 'codex') {
    const raw = env.CODEX_HOME;
    if (raw !== undefined && (typeof raw !== 'string' || !raw.trim())) throw Error('CODEX_HOME is empty or invalid');
    const expanded = expand(raw ?? path.join(userHome, '.codex'));
    if (path.isAbsolute(expanded)) home = path.resolve(expanded);
    else { const base = cwd ?? process.cwd(); if (typeof base !== 'string' || !path.isAbsolute(base)) throw Error('cwd must be absolute for relative CODEX_HOME'); home = path.resolve(base, expanded); }
  } else {
    home = path.join(userHome, '.claude'); const raw = env.CLAUDE_CONFIG_DIR;
    if (raw !== undefined && (typeof raw !== 'string' || !raw.trim() || !path.isAbsolute(expand(raw)) || path.resolve(expand(raw)) !== home)) throw Error('CLAUDE_CONFIG_DIR must select the default ~/.claude directory');
  }
  if (home === '/' || home === userHome) throw Error('Target home must not be the filesystem or user-home root');
  return home;
}
export function resolveLocalCli(platform, { cwd, userHome, env = process.env } = {}) {
  if (!['codex', 'claude'].includes(platform)) return { platform, reason: 'unsupported_platform' };
  let home;
  try {
    if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || path.resolve(cwd) !== cwd || !fs.statSync(cwd).isDirectory()) return { platform, reason: 'invalid_cwd' };
    home = resolveConfigHome(platform, { cwd, userHome, env });
  } catch { return { platform, reason: 'invalid_context' }; }
  const dirs = typeof env.PATH === 'string' ? env.PATH.split(path.delimiter) : [];
  let executable;
  for (const dir of dirs) {
    const candidate = path.resolve(cwd, dir || '.', platform);
    try { if (fs.statSync(candidate).isFile()) { fs.accessSync(candidate, fs.constants.X_OK); executable = candidate; break; } } catch { /* continue PATH search */ }
  }
  if (!executable) return { platform, reason: 'cli_not_found' };
  const context = Object.freeze({ platform, executable, cwd, configHome: home });
  environments.set(context, Object.freeze({ ...env, [platform === 'codex' ? 'CODEX_HOME' : 'CLAUDE_CONFIG_DIR']: home }));
  return context;
}
export function localCliEnvironment(context) { const env = environments.get(context); if (!env) throw Error('Invalid CLI context'); return { ...env }; }
/** Refreshes Codex authentication; only a token-presence boolean survives parsing. */
export async function probeCodexAuthStatus(context, { signal, timeoutMs = 10000 } = {}) {
  const result = (authStatus, reason) => ({ platform: 'codex', authStatus, ...(reason ? { reason } : {}) });
  if (!environments.has(context) || context.platform !== 'codex') return result('unknown', context?.reason ?? 'invalid_context');
  if (signal?.aborted) return result('unknown', 'aborted');
  let child;
  try { child = spawn(context.executable, ['app-server'], { cwd: context.cwd, env: localCliEnvironment(context), stdio: ['pipe', 'pipe', 'pipe'], shell: false }); }
  catch { return result('unknown', 'cli_execution_error'); }
  let closed = false, failure, pending, nextId = 0, buffer = '', outputBytes = 0;
  const decoder = new StringDecoder('utf8');
  let resolveClosed;
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  const fail = reason => { failure ??= reason; if (pending) { const {reject} = pending; pending = null; reject(); } };
  const onClose = () => { closed = true; resolveClosed(); fail('cli_execution_error'); };
  const onError = () => fail('cli_execution_error');
  const onAbort = () => fail('aborted');
  const countOutput = chunk => { outputBytes += chunk.length; if (outputBytes > 1048576) { fail('invalid_response'); return false; } return !failure; };
  const classify = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.requiresOpenaiAuth !== 'boolean' ||
        !(value.authMethod === null || typeof value.authMethod === 'string') ||
        !(value.authToken === null || typeof value.authToken === 'string')) return result('unknown', 'invalid_response');
    const hasToken = typeof value.authToken === 'string' && value.authToken.length > 0;
    if (value.requiresOpenaiAuth === false || typeof value.authMethod === 'string' && hasToken) return result('authenticated');
    if (value.authMethod === null) return result('unauthorized', 'not_logged_in');
    if (value.authToken !== null) return result('unknown', 'invalid_response');
    if (value.authMethod === 'chatgpt') return result('unauthorized', 'token_rejected');
    if (['headers', 'agentIdentity', 'personalAccessToken'].includes(value.authMethod)) return result('authenticated');
    return result('unknown', 'auth_unverified');
  };
  const onData = chunk => {
    if (!countOutput(chunk)) { buffer = ''; return; }
    buffer += decoder.write(chunk);
    let newline;
    while (!failure && (newline = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { line = ''; buffer = ''; fail('invalid_response'); return; }
      line = '';
      if (message && typeof message === 'object' && !Array.isArray(message) &&
          (Object.hasOwn(message, 'method') || !Object.hasOwn(message, 'id'))) { message = null; continue; }
      if (!message || !pending || message.id !== pending.id) { message = null; fail('invalid_response'); return; }
      if (Object.hasOwn(message, 'error')) { message = null; fail('status_command_failed'); return; }
      if (!Object.hasOwn(message, 'result')) { message = null; fail('invalid_response'); return; }
      const value = pending.method === 'initialize'
        ? (message.result && typeof message.result === 'object' && !Array.isArray(message.result) && typeof message.result.userAgent === 'string' && message.result.userAgent.length > 0 ? true : false)
        : classify(message.result);
      message = null;
      const {resolve} = pending; pending = null; resolve(value);
    }
  };
  const onStderr = chunk => { countOutput(chunk); };
  child.on('close', onClose); child.on('error', onError);
  child.stdout.on('data', onData); child.stderr.on('data', onStderr);
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream.on('error', onError);
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(() => fail('timeout'), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
  const send = message => { if (failure || closed) throw new Error('Codex authentication unavailable'); child.stdin.write(JSON.stringify(message) + '\n'); };
  const request = (method, params) => new Promise((resolve, reject) => {
    if (failure || closed) { reject(); return; }
    const id = ++nextId; pending = {id, method, resolve, reject};
    try { send({id, method, params}); } catch { fail('cli_execution_error'); }
  });
  let authentication;
  try {
    if (!await request('initialize', {clientInfo: {name: 'arc', title: 'ARC', version: '1.0.0'}})) fail('invalid_response');
    send({method: 'initialized', params: {}});
    authentication = await request('getAuthStatus', {includeToken: true, refreshToken: true});
    if (failure) authentication = result('unknown', failure);
  } catch { authentication = result('unknown', failure ?? 'cli_execution_error'); }
  finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    buffer = ''; pending = null;
    try { child.stdin.end(); } catch { /* cleanup only */ }
    if (!closed) { try { child.kill('SIGTERM'); } catch { /* still wait for close */ } }
    const wait = async ms => {
      if (closed) return true;
      let timerId;
      const done = await Promise.race([closedPromise.then(() => true), new Promise(resolve => { timerId = setTimeout(() => resolve(false), ms); })]);
      clearTimeout(timerId); return done;
    };
    if (!await wait(1000)) {
      try { child.kill('SIGKILL'); } catch { /* bounded cleanup */ }
      if (!await wait(1000)) authentication = result('unknown', 'cli_execution_error');
    }
    child.stdout.removeListener('data', onData); child.stderr.removeListener('data', onStderr);
    child.removeListener('close', onClose);
    // Keep error guards on streams until destruction, including late pipe errors.
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.destroy();
  }
  return authentication;
}
export async function probePlatformAuth(context, { signal, timeoutMs = 10000 } = {}) {
  const platform = context?.platform;
  const result = (authStatus, reason) => ({ platform, authStatus, ...(reason ? { reason } : {}) });
  if (!environments.has(context)) return result('unknown', context?.reason ?? 'invalid_context');
  if (signal?.aborted) return result('unknown', 'aborted');
  return new Promise(resolve => {
    let child, output = '', stderr = '', overflow = false, done = false, reason;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); };
    const abort = () => { reason = 'aborted'; child?.kill(); finish(result('unknown', reason)); };
    const timer = setTimeout(() => { reason = 'timeout'; child?.kill(); finish(result('unknown', reason)); }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
    signal?.addEventListener('abort', abort, { once: true });
    try { child = spawn(context.executable, ['auth', 'status', '--json'], { cwd: context.cwd, env: localCliEnvironment(context), stdio: ['ignore', 'pipe', 'pipe'], shell: false }); }
    catch { finish(result('unknown', 'cli_execution_error')); return; }
    child.stdout.on('data', chunk => { if (output.length + chunk.length > 65536) overflow = true; else if (!overflow) output += chunk.toString(); });
    child.stderr.on('data', chunk => { if (stderr.length + chunk.length > 65536) overflow = true; else if (!overflow) stderr += chunk.toString(); });
    child.on('error', () => finish(result('unknown', 'cli_execution_error')));
    child.on('close', (code, exitSignal) => {
      if (exitSignal || overflow) return finish(result('unknown', overflow ? 'invalid_response' : 'cli_execution_error'));
      let parsed; try { parsed = JSON.parse(output); } catch { return finish(result('unknown', 'invalid_response')); }
      if (parsed?.loggedIn === true && code === 0) return finish(result('authenticated'));
      if (parsed?.loggedIn === false && code === 1) return finish(result('unauthorized', 'not_logged_in'));
      finish(result('unknown', 'status_mismatch'));
    });
    if (signal?.aborted) abort();
  });
}
export function compareVersions(a, b) {
  const left = String(a).split('.').map(Number), right = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) { const x = left[i] ?? 0, y = right[i] ?? 0; if (x !== y) return x < y ? -1 : 1; }
  return 0;
}
/** Runs `<cli> --version`; keeps only the parsed version, never the raw output. */
export async function probeCliVersion(context, { signal, timeoutMs = 10000, policy = DEFAULT_POLICY } = {}) {
  const platform = context?.platform;
  const result = (version, supported, reason) => ({ version, supported, ...(reason ? { reason } : {}) });
  if (!environments.has(context) || signal?.aborted) return result(null, false, 'cli_execution_error');
  return new Promise(resolve => {
    let child, output = '', overflow = false, done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(value); };
    const abort = () => { child?.kill(); finish(result(null, false, 'cli_execution_error')); };
    const timer = setTimeout(() => { child?.kill(); finish(result(null, false, 'timeout')); }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
    signal?.addEventListener('abort', abort, { once: true });
    try { child = spawn(context.executable, ['--version'], { cwd: context.cwd, env: localCliEnvironment(context), stdio: ['ignore', 'pipe', 'pipe'], shell: false }); }
    catch { finish(result(null, false, 'cli_execution_error')); return; }
    child.stdout.on('data', chunk => { if (output.length + chunk.length > 65536) overflow = true; else if (!overflow) output += chunk.toString(); });
    child.stderr.on('data', chunk => { if (chunk.length > 65536) overflow = true; });
    child.on('error', () => finish(result(null, false, 'cli_execution_error')));
    child.on('close', (code, exitSignal) => {
      if (exitSignal || code !== 0 || overflow) return finish(result(null, false, 'cli_execution_error'));
      const version = /\d+\.\d+\.\d+/.exec(output)?.[0] ?? null;
      if (!version) return finish(result(null, false, 'version_unparsed'));
      const range = policy?.supportedVersions?.[platform];
      const supported = Boolean(range) && compareVersions(version, range.min) >= 0 && compareVersions(version, range.below) < 0;
      finish(supported ? result(version, true) : result(version, false, 'version_unsupported'));
    });
  });
}
