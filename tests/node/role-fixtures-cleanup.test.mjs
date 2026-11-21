import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {createRoutingFixture} from './role-fixtures.mjs';
import {psAvailable, realPs} from './fixtures/ps-stub.mjs';
import {startSupervisor} from '../../lib/runtime/role-supervisor.mjs';

const REAL_PS_SKIP = 'real ps unavailable (sandbox/PATH): identity tests use tests/fixtures/bin/ps stub';
const bases = [];

function processList() {
  return realPs(['-axo', 'pid=,command=']);
}

function fixtureProcesses(paths) {
  const result = processList();
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return result.stdout.split('\n').filter(line =>
    Number(line.trim().split(/\s+/, 1)[0]) !== result.pid && paths.some(base => line.includes(base)));
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

async function waitFor(check, message) {
  const deadline = Date.now() + 5000;
  do {
    const value = await check();
    if (value) return value;
    await delay(25);
  } while (Date.now() < deadline);
  assert.fail(message);
}

async function waitForFile(file) {
  return waitFor(async () => {
    try {
      return await fs.readFile(file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return '';
    }
  }, `fixture did not write ${file}`);
}

async function spawnTracked(pids, executable, args, options) {
  const child = spawn(executable, args, {stdio: 'ignore', ...options});
  await once(child, 'spawn');
  pids.add(child.pid);
  child.unref();
  return child.pid;
}

function cleanupTracked(t, pids) {
  t.after(async () => {
    const survivors = [...pids].filter(pidIsAlive);
    if (!survivors.length) return;
    const rows = (processList().stdout ?? '').split('\n');
    for (const pid of survivors) {
      const row = rows.find(line => Number(line.trim().split(/\s+/, 1)[0]) === pid);
      t.diagnostic(`SIGKILL test process: ${row?.trim() ?? `${pid} (command unavailable)`}`);
      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await waitFor(() => survivors.every(pid => !pidIsAlive(pid)), 'test-owned processes survived fallback cleanup');
  });
}

test('AC5b-1 fixture cleanup stops the supervisor, fake CLIs and grandchild', async t => {
  if (!psAvailable()) return t.skip(REAL_PS_SKIP);
  const pids = new Set();
  cleanupTracked(t, pids);
  let base;
  await t.test('start fixture processes', async sub => {
    const f = await createRoutingFixture(sub);
    base = f.base;
    bases.push(base);
    const codex = await f.cli('codex');
    const executable = path.join(f.binDir, 'codex');
    const options = {detached: true, env: f.env};
    const grandchildPidFile = path.join(base, 'grandchild.pid');
    for (const [name, scenario] of [
      ['hang', {hang: true}],
      ['grandchild', {grandchild: true, grandchildPidFile, hang: true}],
      ['ignore-sigterm', {ignoreSigterm: true, hang: true}],
    ]) {
      const ready = path.join(base, `ready-${name}`);
      await codex.setScenario({...scenario, writes: [{path: ready, content: 'ready'}]});
      await spawnTracked(pids, executable, [], options);
      if (scenario.grandchild) {
        const pid = Number(await waitForFile(grandchildPidFile));
        assert.ok(Number.isSafeInteger(pid) && pid > 1, 'fake CLI recorded the grandchild PID');
        pids.add(pid);
      }
      await waitForFile(ready);
    }

    const authRecord = path.join(base, 'auth.jsonl');
    await codex.setScenario({auth: 'hang', appServerRecordPath: authRecord});
    await spawnTracked(pids, executable, ['login', 'status'], options);
    await waitForFile(authRecord);

    // A nonexistent dispatch normally exits immediately. Keep its supervisor in startup for the hook.
    const preload = encodeURIComponent('await new Promise(resolve => setTimeout(resolve, 30000))');
    const supervisor = await startSupervisor({
      codexHome: f.claudeHome,
      dispatchId: 'nonexistent',
      cwd: f.cwd,
      userHome: f.userHome,
      env: {...f.env, NODE_OPTIONS: `--import=data:text/javascript,${preload}`},
    });
    pids.add(supervisor.pid);
    assert.deepEqual([...pids].filter(pid => !pidIsAlive(pid)), [], 'all fixture processes are alive before cleanup');
  });
  assert.deepEqual({
    commands: fixtureProcesses([base]),
    pids: [...pids].filter(pidIsAlive),
  }, {commands: [], pids: []}, 'fixture cleanup left processes running');
});

test('AC5b-2 fixture cleanup leaves an unrelated process alive', async t => {
  if (!psAvailable()) return t.skip(REAL_PS_SKIP);
  const pids = new Set();
  cleanupTracked(t, pids);
  const decoy = await spawnTracked(pids, process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  await t.test('close an unrelated fixture', async sub => {
    const f = await createRoutingFixture(sub);
    bases.push(f.base);
  });
  assert.ok(pidIsAlive(decoy), 'fixture cleanup killed an unrelated process');
});

test('fixture cleanup leaves an unrelated process listed in .pids alive', async t => {
  if (!psAvailable()) return t.skip(REAL_PS_SKIP);
  const pids = new Set();
  cleanupTracked(t, pids);
  const decoy = await spawnTracked(pids, process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {detached: true});
  await t.test('close a fixture with a reused PID in its registry', async sub => {
    const f = await createRoutingFixture(sub);
    bases.push(f.base);
    await fs.appendFile(path.join(f.binDir, '.pids'), `${decoy}\n`);
    assert.ok(pidIsAlive(decoy), 'unrelated process is alive before fixture cleanup');
  });
  assert.ok(pidIsAlive(decoy), 'fixture cleanup killed an unrelated process listed in .pids');
});

test.after(() => {
  if (!psAvailable()) {
    console.log(`Skipping leftover fixture process check: ${REAL_PS_SKIP}`);
    return;
  }
  assert.deepEqual(fixtureProcesses(bases), [], 'leftover fixture processes');
});
