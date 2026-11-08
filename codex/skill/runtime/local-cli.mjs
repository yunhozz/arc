import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

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
    try { child = spawn(context.executable, platform === 'codex' ? ['login', 'status'] : ['auth', 'status', '--json'], { cwd: context.cwd, env: localCliEnvironment(context), stdio: ['ignore', 'pipe', 'pipe'], shell: false }); }
    catch { finish(result('unknown', 'cli_execution_error')); return; }
    child.stdout.on('data', chunk => { if (output.length + chunk.length > 65536) overflow = true; else if (!overflow) output += chunk.toString(); });
    child.stderr.on('data', chunk => { if (stderr.length + chunk.length > 65536) overflow = true; else if (!overflow) stderr += chunk.toString(); });
    child.on('error', () => finish(result('unknown', 'cli_execution_error')));
    child.on('close', (code, exitSignal) => {
      if (exitSignal || overflow) return finish(result('unknown', overflow ? 'invalid_response' : 'cli_execution_error'));
      if (platform === 'codex') return finish(code === 0 ? result('authenticated') : code === 1 && stderr.trim() === 'Not logged in' ? result('unauthorized', 'not_logged_in') : result('unknown', 'status_command_failed'));
      let parsed; try { parsed = JSON.parse(output); } catch { return finish(result('unknown', 'invalid_response')); }
      if (parsed?.loggedIn === true && code === 0) return finish(result('authenticated'));
      if (parsed?.loggedIn === false && code === 1) return finish(result('unauthorized', 'not_logged_in'));
      finish(result('unknown', 'status_mismatch'));
    });
    if (signal?.aborted) abort();
  });
}
