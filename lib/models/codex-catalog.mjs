import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const ENV_KEYS = ['PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME'];
const validText = value => typeof value === 'string' && value.length > 0 && value === value.trim() && !/[\p{Cc}\u2028\u2029]/u.test(value);
const failure = () => new Error('Codex catalog is unavailable.');

export async function listCodexModelCapabilities({ env = process.env, cwd, spawnImpl = spawn, signal, timeoutMs = 10000 } = {}) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || path.normalize(cwd) !== cwd || typeof spawnImpl !== 'function' || signal?.aborted) throw failure();
  const childEnv = Object.fromEntries(ENV_KEYS.filter(key => typeof env?.[key] === 'string').map(key => [key, env[key]]));
  const secrets = [env?.OPENAI_API_KEY, env?.ANTHROPIC_API_KEY].filter(value => typeof value === 'string' && value.length);
  const containsSecret = value => secrets.some(secret => value.includes(secret));
  let child;
  try { child = spawnImpl('codex', ['app-server'], { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], shell: false }); }
  catch { throw failure(); }
  if (!child?.stdin || !child?.stdout || !child?.stderr || typeof child.on !== 'function' || typeof child.kill !== 'function') throw failure();

  let closed = false, interrupted = false, cancelled = false, nextId = 0, buffer = '';
  const pending = new Map(), decoder = new StringDecoder('utf8');
  let resolveClosed;
  const closedPromise = new Promise(resolve => { resolveClosed = resolve; });
  const rejectPending = () => { interrupted = true; for (const entry of pending.values()) entry.reject(failure()); pending.clear(); };
  const onClose = () => { closed = true; resolveClosed(); rejectPending(); };
  const onError = () => rejectPending();
  const onData = chunk => {
    buffer += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    if (buffer.length > 1048576) { rejectPending(); return; }
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message; try { message = JSON.parse(line); } catch { rejectPending(); return; }
      if (message?.id === undefined) continue;
      const entry = pending.get(message.id);
      if (!entry) { rejectPending(); return; }
      pending.delete(message.id);
      if (message.error || !Object.hasOwn(message, 'result')) entry.reject(failure()); else entry.resolve(message.result);
    }
  };
  child.on('close', onClose); child.on('error', onError);
  child.stdout.on('data', onData); child.stdout.on('error', onError); child.stdin.on('error', onError); child.stderr.on('error', onError); child.stderr.resume();
  const onAbort = () => { cancelled = true; rejectPending(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  const timer = setTimeout(onAbort, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
  const send = value => { if (interrupted || closed) throw failure(); child.stdin.write(JSON.stringify(value) + '\n'); };
  const request = (method, params) => new Promise((resolve, reject) => {
    if (interrupted || closed) { reject(failure()); return; }
    const id = ++nextId; pending.set(id, { resolve, reject });
    try { send({ id, method, params }); } catch { pending.delete(id); reject(failure()); }
  });
  let result, error;
  try {
    const initialized = await request('initialize', { clientInfo: { name: 'arc', title: 'ARC', version: '1.0.0' } });
    if (!initialized || typeof initialized !== 'object' || Array.isArray(initialized) || !validText(initialized.userAgent)) throw failure();
    send({ method: 'initialized', params: {} });
    const models = new Map(), cursors = new Set(); let cursor;
    for (let pageNumber = 0; pageNumber < 1000; pageNumber++) {
      const page = await request('model/list', { limit: 100, includeHidden: true, ...(cursor ? { cursor } : {}) });
      if (interrupted) throw failure();
      if (!page || !Array.isArray(page.data) || !page.data.length || !(page.nextCursor === null || validText(page.nextCursor))) throw failure();
      for (const descriptor of page.data) {
        if (!descriptor || !validText(descriptor.model) || containsSecret(descriptor.model) || !Array.isArray(descriptor.supportedReasoningEfforts)) throw failure();
        let efforts = models.get(descriptor.model);
        if (!efforts) { efforts = []; models.set(descriptor.model, efforts); }
        for (const option of descriptor.supportedReasoningEfforts) {
          if (!validText(option?.reasoningEffort) || containsSecret(option.reasoningEffort)) throw failure();
          if (!efforts.includes(option.reasoningEffort)) efforts.push(option.reasoningEffort);
        }
      }
      if (page.nextCursor === null) { result = [...models].map(([model, efforts]) => ({ model, efforts })); break; }
      if (cursors.has(page.nextCursor)) throw failure();
      cursors.add(page.nextCursor); cursor = page.nextCursor;
    }
    if (!result) throw failure();
  } catch { error = failure(); }
  finally {
    rejectPending();
    try { child.stdin.end(); } catch { error = failure(); }
    if (!closed) { try { child.kill('SIGTERM'); } catch { error = failure(); } }
    const wait = async ms => { if (closed) return true; let timerId; const timeout = new Promise(resolve => { timerId = setTimeout(() => resolve(false), ms); }); const value = await Promise.race([closedPromise.then(() => true), timeout]); clearTimeout(timerId); return value; };
    if (!await wait(1000)) {
      try { child.kill('SIGKILL'); } catch { error = failure(); }
      if (!await wait(1000)) error = failure();
    }
    if (!closed) {
      // A failed close may still emit late errors; keep only a guard until close.
      const guard = () => {};
      const streams = [child.stdin, child.stdout, child.stderr];
      child.on('error', guard); for (const stream of streams) stream.on('error', guard);
      child.once('close', () => { child.removeListener('error', guard); for (const stream of streams) stream.removeListener('error', guard); });
      for (const stream of streams) stream.destroy();
    }
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    if (cancelled) error = failure();
    child.stdout.removeListener('data', onData); child.stdout.removeListener('error', onError); child.stdin.removeListener('error', onError); child.stderr.removeListener('error', onError);
    child.removeListener('close', onClose); child.removeListener('error', onError);
  }
  if (error) throw error;
  return result;
}
