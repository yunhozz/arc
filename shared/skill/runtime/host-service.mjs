import childProcess from 'node:child_process';
import {constants, readFileSync, realpathSync} from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {CANCEL_GRACE_MS, PROBE_TIMEOUT_MS} from './role-dispatch-policy.mjs';

export const HOST_SERVICES = Object.freeze({
  'browser-cdp': Object.freeze({kind: 'cdp'}),
  'browser-playwright-chromium': Object.freeze({kind: 'playwright', browser: 'chromium'}),
  'browser-playwright-firefox': Object.freeze({kind: 'playwright', browser: 'firefox'}),
  'browser-playwright-webkit': Object.freeze({kind: 'playwright', browser: 'webkit'}),
});
export const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
export const hostDirFor = dispatchId => `/private/tmp/arc-host-${dispatchId.replaceAll('-', '').slice(0, 8)}`;

export function resolveGlobalPlaywright({run = childProcess.spawnSync} = {}) {
  const probe = run('npm', ['root', '-g'], {cwd: '/private/tmp', encoding: 'utf8', timeout: PROBE_TIMEOUT_MS});
  const root = probe.stdout?.trim();
  if (probe.status !== 0 || !root || !path.isAbsolute(root)) return null;
  for (const name of ['playwright', 'playwright-core']) {
    try {
      const {version} = JSON.parse(readFileSync(path.join(root, name, 'package.json'), 'utf8'));
      if (typeof version === 'string' && version.length > 0) return {root, name, version};
      return null;
    } catch (error) {
      if (error.code !== 'ENOENT') return null;
    }
  }
  return null;
}

export async function hostServicePreflight({services, io = {}}) {
  const hold = 'permission_scope_unverified';
  for (const id of services) {
    try {
      switch (HOST_SERVICES[id]?.kind) {
        case 'cdp': {
          const access = io.access ?? fsp.access;
          await access(CHROME_EXECUTABLE, constants.X_OK);
          await access(SANDBOX_EXEC, constants.X_OK);
          break;
        }
        case 'playwright':
          if (!(io.resolveGlobalPlaywright ?? resolveGlobalPlaywright)()) return hold;
          break;
        default:
          return hold;
      }
    } catch { return hold; }
  }
  return null;
}

function profilePath(filename) {
  const unsafe = /["\\\n\r]/;
  if (unsafe.test(filename)) throw Error('invalid sandbox profile path');
  const resolved = realpathSync(filename);
  if (unsafe.test(resolved)) throw Error('invalid sandbox profile path');
  return resolved;
}

export function renderSandboxProfile({kind, userHome, dataDir}) {
  if (kind === 'playwright') throw Error('playwright sandbox profile unmeasured (MI-B)');
  if (kind !== 'cdp') throw Error('unknown host service kind');
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-read* file-write* (subpath "${profilePath(userHome)}"))`,
    '(deny process-exec (regex #"GoogleUpdater"))',
    `(allow file-read* file-write* (subpath "${profilePath(dataDir)}"))`,
    '(deny network-outbound)',
    '(allow network-outbound (remote ip "localhost:*"))',
    '',
  ].join('\n');
}

const startFailed = () => Object.assign(Error('Host service failed to start'), {reasonCode: 'execution_failed'});

async function waitForCdpPort(dataDir, timeoutMs, exited, wait) {
  const deadline = performance.now() + timeoutMs;
  while (!exited() && performance.now() < deadline) {
    const bytes = await fsp.readFile(path.join(dataDir, 'DevToolsActivePort'), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return '';
    });
    const first = bytes.split('\n', 1)[0].trim();
    const port = Number(first);
    if (!exited() && /^\d+$/.test(first) && port > 0 && port <= 65535) return port;
    const remaining = deadline - performance.now();
    if (remaining > 0 && !exited()) await wait(Math.min(25, remaining));
  }
  throw startFailed();
}

export async function startHostService({id, dispatchId, userHome, timeoutMs = PROBE_TIMEOUT_MS, onSpawn, io = {}}) {
  // Playwright launches remain disabled until each engine's isolation is measured.
  if (HOST_SERVICES[id]?.kind !== 'cdp') throw startFailed();
  const hostDir = hostDirFor(dispatchId);
  const dir = path.join(hostDir, id), dataDir = path.join(dir, 'udd'), profile = path.join(dir, 'chrome.sb');
  const wait = io.sleep ?? sleep, kill = io.kill ?? process.kill;
  let child, created = false, exited = false, cleanup;
  const stop = () => cleanup ??= (async () => {
    let warning = false;
    const signalGroup = signal => {
      try { kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') warning = true; }
    };
    let groupExists = Boolean(child?.pid);
    if (groupExists && exited) {
      try { kill(-child.pid, 0); } catch (error) {
        if (error.code === 'ESRCH') groupExists = false;
        else warning = true;
      }
    }
    if (groupExists) {
      signalGroup('SIGTERM');
      try { await wait(CANCEL_GRACE_MS); } catch { warning = true; }
      signalGroup('SIGKILL');
    }
    // The supervisor removes the complete hostDir after collecting evidence.
    if (created && io.removeDir) {
      try { await io.removeDir(dir); } catch { warning = true; }
    }
    return warning ? 'warning' : 'ok';
  })();
  try {
    // The supervisor reserves the host directory for the dispatch before starting any service.
    await fsp.mkdir(dir, {mode: 0o700});
    created = true;
    await fsp.mkdir(dataDir, {mode: 0o700});
    await fsp.writeFile(profile, renderSandboxProfile({kind: 'cdp', userHome, dataDir}), {flag: 'wx', mode: 0o600});
    child = (io.spawn ?? childProcess.spawn)(SANDBOX_EXEC, [
      '-f', profile, CHROME_EXECUTABLE,
      '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
      `--user-data-dir=${dataDir}`, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--use-mock-keychain', '--no-sandbox', '--disable-gpu',
      '--proxy-server=127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', 'about:blank',
    ], {cwd: hostDir, detached: true, stdio: 'ignore', shell: false});
    const markExited = () => { exited = true; };
    child.once('error', markExited);
    child.once('exit', markExited);
    if (child.pid) onSpawn?.(child.pid);
    const port = await waitForCdpPort(dataDir, timeoutMs, () => exited, wait);
    return {id, started: true, endpoint: {port, url: `http://127.0.0.1:${port}`}, stop};
  } catch {
    const cleanup = await stop();
    throw Object.assign(startFailed(), {cleanup});
  }
}

export async function writeServicesFile(scratch, records) {
  const endpoints = Object.fromEntries(records.map(({id, endpoint}) => [id, endpoint]));
  await fsp.writeFile(path.join(scratch, 'services.json'), JSON.stringify(endpoints) + '\n', {flag: 'wx', mode: 0o600});
}
