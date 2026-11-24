import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {TOOL_ACCESS_SERVICES} from '../../lib/runtime/tool-access.mjs';

const moduleUrl = new URL('../../lib/runtime/host-service.mjs', import.meta.url);
async function hostService() {
  return import(moduleUrl).catch(error => {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== moduleUrl.href) throw error;
    assert.fail('host-service module is missing');
  });
}

const cdp = 'browser-cdp';
const playwright = 'browser-playwright-chromium';
const hold = 'permission_scope_unverified';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sandbox = '/usr/bin/sandbox-exec';
const port = 41999;
const endpoint = {port, url: 'http://127.0.0.1:41999'};
const startupFailure = {reasonCode: 'execution_failed'};

test('HOST_SERVICES keys equal TOOL_ACCESS_SERVICES', async () => {
  const {HOST_SERVICES} = await hostService();
  assert.deepEqual(Object.keys(HOST_SERVICES).sort(), [...TOOL_ACCESS_SERVICES].sort());
});

test('preflight holds when Chrome, sandbox-exec or global playwright is missing', async () => {
  const {hostServicePreflight, resolveGlobalPlaywright} = await hostService();
  for (const missing of [chrome, sandbox]) {
    const io = {access: async filename => {
      if (filename === missing) throw Object.assign(Error('missing executable'), {code: 'ENOENT'});
    }};
    assert.equal(await hostServicePreflight({services: [cdp], io}), hold, missing);
    assert.equal(await hostServicePreflight({services: [cdp], io: {access: async () => {}}}), null);
  }

  const root = await fs.mkdtemp(path.join(tmpdir(), 'arc-t5-global-'));
  const run = (command, args, options) => {
    assert.equal(command, 'npm');
    assert.deepEqual(args, ['root', '-g']);
    assert.equal(options.timeout, 10000);
    return {status: 0, stdout: root + '\n', stderr: ''};
  };
  const io = {resolveGlobalPlaywright: () => resolveGlobalPlaywright({run})};
  assert.equal(await hostServicePreflight({services: [playwright], io}), hold);
  for (const name of ['playwright-core', 'playwright']) {
    await fs.mkdir(path.join(root, name));
    await fs.writeFile(path.join(root, name, 'package.json'), JSON.stringify({name, version: '1.2.3'}));
    assert.deepEqual(resolveGlobalPlaywright({run}), {root, name, version: '1.2.3'});
    assert.equal(await hostServicePreflight({services: [playwright], io}), null);
  }
});

async function cdpFixture(t, {source, removeFails = false} = {}) {
  const {hostDirFor, startHostService} = await hostService();
  const dispatchId = randomUUID();
  const hostDir = '/private/tmp/arc-host-' + dispatchId.slice(0, 8);
  assert.equal(hostDirFor(dispatchId), hostDir);
  await fs.mkdir(hostDir, {mode: 0o700});
  t.after(() => fs.rmdir(hostDir));
  const home = await fs.mkdtemp(path.join(tmpdir(), 'arc-t5-home-'));
  const dir = path.join(hostDir, cdp);
  const dataDir = path.join(dir, 'udd');
  const signals = [];
  let child;
  const io = {
    spawn(executable, args, options) {
      assert.equal(executable, sandbox);
      assert.equal(options.cwd, hostDir);
      assert.equal(options.detached, true);
      assert.deepEqual(args, ['-f', path.join(dir, 'chrome.sb'), chrome,
        '--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
        '--user-data-dir=' + dataDir, '--no-first-run', '--no-default-browser-check',
        '--disable-extensions', '--use-mock-keychain', '--no-sandbox', '--disable-gpu',
        '--proxy-server=127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost', 'about:blank']);
      const script = source ?? `require('node:fs').writeFileSync(process.argv[1], '${port}\\n/devtools/browser/test\\n'); setInterval(() => {}, 1000);`;
      child = spawn(process.execPath, ['-e', script, path.join(dataDir, 'DevToolsActivePort')], options);
      return child;
    },
    kill(pid, signal) {
      assert.ok(pid < 0);
      signals.push(signal);
      return process.kill(pid, signal);
    },
    sleep: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 30))),
    async removeDir(filename) {
      assert.equal(filename, dir);
      await fs.rm(filename, {recursive: true});
      if (removeFails) throw Object.assign(Error('fixture removal failure'), {code: 'EACCES'});
    },
  };
  const start = (timeoutMs = 2000) => startHostService({id: cdp, dispatchId, userHome: home, timeoutMs, io});
  return {start, dir, dataDir, home, signals, get child() { return child; }};
}

test('cdp start reads DevToolsActivePort and returns endpoint', async t => {
  const {start, dir, dataDir, home} = await cdpFixture(t);
  const record = await start();
  try {
    assert.deepEqual({id: record.id, started: record.started, endpoint: record.endpoint}, {id: cdp, started: true, endpoint});
    assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
    assert.equal(await fs.readFile(path.join(dir, 'chrome.sb'), 'utf8'),
      '(version 1)\n(allow default)\n' +
      `(deny file-read* file-write* (subpath "${await fs.realpath(home)}"))\n` +
      '(deny process-exec (regex #"GoogleUpdater"))\n' +
      `(allow file-read* file-write* (subpath "${await fs.realpath(dataDir)}"))\n` +
      '(deny network-outbound)\n' +
      '(allow network-outbound (remote ip "localhost:*"))\n');
  } finally {
    assert.equal(await record.stop(), 'ok');
  }
  await assert.rejects(fs.lstat(dir), {code: 'ENOENT'});
});

test('start failure and timeout are execution_failed and clean up the group', async t => {
  for (const [name, source, timeout, expectedSignals] of [
    ['exit', 'process.exit(1)', 2000, [0]],
    ['timeout', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);", 250, ['SIGTERM', 'SIGKILL']],
  ]) {
    await t.test(name, async t => {
      const {start, dir, signals} = await cdpFixture(t, {source});
      await assert.rejects(start(timeout), startupFailure);
      assert.deepEqual(signals, expectedSignals);
      await assert.rejects(fs.lstat(dir), {code: 'ENOENT'});
    });
  }
});

test('stop skips termination signals when the exited CDP group no longer exists', async t => {
  const fixture = await cdpFixture(t);
  const record = await fixture.start();
  const exit = once(fixture.child, 'exit');
  fixture.child.kill('SIGTERM');
  await exit;
  assert.equal(await record.stop(), 'ok');
  assert.deepEqual(fixture.signals, [0]);
  await assert.rejects(fs.lstat(fixture.dir), {code: 'ENOENT'});
});

test('stop returns warning when removal fails', async t => {
  const {start} = await cdpFixture(t, {removeFails: true});
  assert.equal(await (await start()).stop(), 'warning');
});

test('services file is written 0600 and refuses an existing file', async () => {
  const {writeServicesFile} = await hostService();
  const scratch = await fs.mkdtemp(path.join(tmpdir(), 'arc-t5-services-'));
  const file = path.join(scratch, 'services.json');
  await writeServicesFile(scratch, [{id: cdp, endpoint}]);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), {[cdp]: endpoint});
  await assert.rejects(writeServicesFile(scratch, []), {code: 'EEXIST'});
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), {[cdp]: endpoint});
});

test('renderSandboxProfile rejects quotes and newlines in paths', async () => {
  const {renderSandboxProfile} = await hostService();
  const root = await fs.mkdtemp(path.join(tmpdir(), 'arc-t5-profile-'));
  for (const character of ['"', '\\', '\n', '\r']) {
    const bad = path.join(root, `bad${character}path`);
    await fs.mkdir(bad);
    assert.throws(() => renderSandboxProfile({kind: 'cdp', userHome: bad, dataDir: root}), /invalid sandbox profile path/);
    assert.throws(() => renderSandboxProfile({kind: 'cdp', userHome: root, dataDir: bad}), /invalid sandbox profile path/);
  }
});

test('Playwright profile is unavailable while MI-B is unmeasured', async () => {
  const {renderSandboxProfile} = await hostService();
  assert.throws(() => renderSandboxProfile({kind: 'playwright'}), {message: 'playwright sandbox profile unmeasured (MI-B)'});
});

test('Playwright start fails without spawning while MI-B is unmeasured', async t => {
  const {startHostService} = await hostService();
  const spawn = t.mock.fn();
  await assert.rejects(startHostService({id: playwright, dispatchId: randomUUID(), io: {spawn}}), startupFailure);
  assert.equal(spawn.mock.callCount(), 0);
});
