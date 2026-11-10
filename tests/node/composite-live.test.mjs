// Opt-in live smoke for composite role execution (spec AC8, AC11, AC17).
//
// COST AND SIDE EFFECTS: this file starts REAL `claude` and `codex` CLI processes through the installed ARC runtime
// and therefore makes real model calls on the user's accounts. Each bridge dispatch uses the model and effort of the
// ACTIVE composite configuration (the bridge reads its arguments only from the installed arc-routing profile), so
// choose the cheapest model for the roles under test before enabling it. Briefs are kept to one short sentence to
// minimize tokens. Terminal leases it creates under <CODEX_HOME>/arc-role-dispatch are pruned by ARC after 30 days.
//
// It is skipped unless ARC_LIVE_CLI_TESTS=1, and additionally skipped (with a printed reason) when the real user home
// has no active composite configuration whose prepared markers match the current runtime (`cooperative-7`).
// The default `npm test` run never executes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

const SKIP_DEFAULT = 'opt-in live smoke: set ARC_LIVE_CLI_TESTS=1 (makes real model calls and incurs cost)';
const RUNTIME_VERSION = 'cooperative-7';
const TERMINAL = ['completed', 'failed', 'cancelled', 'unknown'];

if (process.env.ARC_LIVE_CLI_TESTS !== '1') {
  test.skip('composite live smoke', {skip: SKIP_DEFAULT}, () => {});
} else {
  const home = os.homedir();
  const codexHome = process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(home, '.codex');
  const claudeHome = process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(home, '.claude');
  const homes = {codex: codexHome, claude: claudeHome};
  const entry = path.join(codexHome, 'skills', 'arc', 'runtime', 'cli.mjs');
  const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

  const unmet = (() => {
    const config = readJson(path.join(codexHome, 'arc-role-platform-routing.json'));
    if (!config?.roles) return 'no active composite configuration at ' + path.join(codexHome, 'arc-role-platform-routing.json');
    if (!fs.existsSync(entry)) return 'installed runtime entry missing: ' + entry;
    for (const platform of ['codex', 'claude']) {
      const marker = readJson(path.join(homes[platform], 'arc-role-platform-routing.prepared.json'));
      if (!marker) return 'missing prepared marker for ' + platform + '; run Install / Update';
      if (marker.revision !== config.revision) return 'prepared marker revision differs for ' + platform + '; run Install / Update';
      if (marker.runtime?.version !== RUNTIME_VERSION) return `prepared marker for ${platform} is ${marker.runtime?.version}, not ${RUNTIME_VERSION}; run Install / Update`;
    }
    return null;
  })();

  if (unmet) {
    console.log('composite live smoke skipped: ' + unmet);
    test.skip('composite live smoke', {skip: unmet}, () => {});
  } else {
    const config = readJson(path.join(codexHome, 'arc-role-platform-routing.json'));
    const roleOn = (platform, candidates) => candidates.find(role => config.roles[role]?.platform === platform);
    const workflow = 'live-smoke-' + process.pid;
    const worktree = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-live-smoke-')));
    const git = (...args) => spawnSync('git', args, {cwd: worktree, encoding: 'utf8', timeout: 60000});
    git('init', '-q');
    fs.writeFileSync(path.join(worktree, 'README.md'), 'live smoke\n');
    git('add', '.');
    git('-c', 'user.name=arc-live', '-c', 'user.email=arc-live@example.invalid', 'commit', '-q', '-m', 'init');
    test.after(() => fs.rmSync(worktree, {recursive: true, force: true}));

    // Asynchronous with a hard timeout so a hung CLI cannot outlive the test timeout; the whole process group is killed.
    const started = new Set();
    const arc = (command, input, timeoutMs = 600000) => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [entry, command, '--cwd', worktree, '--workflow', workflow, '--input', '-'], {env: process.env, detached: true, stdio: ['pipe', 'pipe', 'pipe']});
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } reject(new Error(command + ' timed out')); }, timeoutMs);
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', status => {
        clearTimeout(timer);
        const line = stdout.trim().split('\n').filter(Boolean).at(-1);
        try { resolve({status, body: line ? JSON.parse(line) : null, stderr}); } catch (error) { reject(error); }
      });
      child.stdin.end(JSON.stringify(input));
    });
    const ids = (host, environment) => ({hostPlatform: host, executionEnvironment: environment});
    // observe waits up to 540s per call (no short polling). The budget stays below the test timeout (75 minutes) and
    // above the fixed role timeouts (Implementer 60, others 20 minutes): pass the larger budget for the Implementer.
    const settle = async (host, environment, dispatchId, budgetMs = 35 * 60 * 1000) => {
      const deadline = Date.now() + budgetMs;
      let last;
      do {
        last = await arc('observe', {...ids(host, environment), dispatchId, waitMs: 540000});
        if (TERMINAL.includes(last.body?.routeStatus)) break;
      } while (Date.now() < deadline);
      return last;
    };
    // Every dispatch this file starts is tracked. After each test (also after a failure or timeout) non-terminal ones
    // are cancelled and observed until terminal; any lease id still not terminal is printed for manual cleanup.
    const track = (host, environment, dispatchId) => { started.add(JSON.stringify([host, environment, dispatchId])); return dispatchId; };
    let cleaning = null;
    const cleanupDispatches = () => cleaning ??= cleanupAll().finally(() => { cleaning = null; });
    const cleanupAll = async () => {
      for (const entryText of started) {
        const [host, environment, dispatchId] = JSON.parse(entryText);
        try {
          let state = lease(dispatchId)?.state;
          if (state && !['completed', 'failed', 'cancelled'].includes(state)) {
            await arc('cancel', {...ids(host, environment), dispatchId}, 60000);
            for (let attempt = 0; attempt < 3 && !['completed', 'failed', 'cancelled'].includes(state); attempt++) {
              await arc('observe', {...ids(host, environment), dispatchId, waitMs: 30000}, 60000);
              state = lease(dispatchId)?.state;
            }
            if (!['completed', 'failed', 'cancelled'].includes(state)) console.log(`composite live smoke: dispatch ${dispatchId} is still ${state}; clean it up manually in ${path.join(codexHome, 'arc-role-dispatch')}`);
          }
        } catch (error) { console.log(`composite live smoke: cleanup of ${dispatchId} failed: ${error.message}`); }
        started.delete(entryText);
      }
    };
    const lease = dispatchId => readJson(path.join(codexHome, 'arc-role-dispatch', dispatchId + '.json'));
    const find = (directory, pattern) => {
      const found = [];
      const walk = current => { for (const item of fs.existsSync(current) ? fs.readdirSync(current, {withFileTypes: true}) : []) { const next = path.join(current, item.name); if (item.isDirectory()) walk(next); else if (pattern.test(item.name)) found.push(next); } };
      walk(directory);
      return found;
    };
    // No recursion: the child transcript or rollout contains no tool call that loads the ARC SKILL.md.
    const assertNoArcSkillLoad = (platform, sessionId) => {
      assert.ok(sessionId, 'session id recorded');
      const files = platform === 'codex' ? find(path.join(codexHome, 'sessions'), new RegExp(`rollout-.*${sessionId}\\.jsonl$`)) : find(path.join(claudeHome, 'projects'), new RegExp(`^${sessionId}\\.jsonl$`));
      assert.equal(files.length, 1, `exactly one ${platform} transcript for ${sessionId}: ${files.join(', ')}`);
      for (const text of fs.readFileSync(files[0], 'utf8').split('\n').filter(Boolean)) {
        let entryObject; try { entryObject = JSON.parse(text); } catch { continue; }
        const calls = platform === 'codex'
          ? (['function_call', 'local_shell_call', 'custom_tool_call'].includes(entryObject.payload?.type) ? [entryObject.payload] : [])
          : (Array.isArray(entryObject.message?.content) ? entryObject.message.content.filter(block => block.type === 'tool_use') : []);
        for (const call of calls) assert.doesNotMatch(JSON.stringify(call), /skills[\\/]+arc[\\/]+SKILL\.md|"skill":"arc"/, 'child loaded the ARC skill');
      }
    };
    const prepare = async (host, environment, role, extra = {}) => {
      const result = await arc('prepare-dispatch', {...ids(host, environment), role, expectedRevision: config.revision, requestId: `${workflow}-${role}-${Math.random().toString(16).slice(2)}`, taskId: 'live-smoke', ...extra});
      if (result.body?.dispatchId) track(host, environment, result.body.dispatchId);
      return result;
    };

    // Host claude -> codex bridge (gates: G1 irrelevant for Codex, G3 detection and G5 wide apply).
    // The bridge runs the role routed to codex; read-only prefers Planner, then Reviewer, then Scouter.
    const readOnlyOnCodex = roleOn('codex', ['arc_planner', 'arc_reviewer', 'arc_scouter']);
    test('host claude to codex bridge: read-only role completes with runtime-observed model, resumes once, no ARC skill load', {skip: readOnlyOnCodex ? false : 'no read-only role is routed to codex in the active configuration', timeout: 75 * 60 * 1000}, async t => {
      t.after(cleanupDispatches); // also runs when node:test times the test out; the finally below covers normal and failing exits
      try {
      const prepared = await prepare('claude', 'claude-cli', readOnlyOnCodex);
      assert.equal(prepared.status, 0, JSON.stringify(prepared.body));
      assert.equal(prepared.body.route, 'bridge');
      const runResult = await arc('run-dispatch', {...ids('claude', 'claude-cli'), dispatchId: prepared.body.dispatchId, brief: 'Reply with the single word OK. Use no tools.'});
      assert.ok(runResult.body.resultPath, JSON.stringify(runResult.body));
      const done = await settle('claude', 'claude-cli', prepared.body.dispatchId);
      assert.equal(done.body.routeStatus, 'completed', JSON.stringify(done.body));
      assert.equal(done.body.claims.model.level, 'runtime-observed', JSON.stringify(done.body.claims));
      assert.ok(fs.statSync(done.body.resultPath).size > 0);
      assert.equal(git('status', '--porcelain').stdout.trim(), '', 'read-only role changed the worktree');
      const sessionId = lease(prepared.body.dispatchId)?.sessionId;
      const resumed = await arc('resume', {...ids('claude', 'claude-cli'), dispatchId: prepared.body.dispatchId, brief: 'Reply with the single word DONE. Use no tools.'});
      assert.ok(resumed.status === 0 || resumed.status === 3, JSON.stringify(resumed.body));
      const resumedDone = await settle('claude', 'claude-cli', prepared.body.dispatchId);
      assert.equal(resumedDone.body.routeStatus, 'completed', JSON.stringify(resumedDone.body));
      assertNoArcSkillLoad(config.roles[readOnlyOnCodex].platform, sessionId);
      } finally { await cleanupDispatches(); }
    });

    const implementerOnCodex = roleOn('codex', ['arc_implementer']);
    test('host claude to codex bridge: Implementer writes one file inside allowedPaths and completes', {skip: implementerOnCodex ? false : 'arc_implementer is not routed to codex in the active configuration', timeout: 75 * 60 * 1000}, async t => {
      t.after(cleanupDispatches); // also runs when node:test times the test out; the finally below covers normal and failing exits
      try {
      const prepared = await prepare('claude', 'claude-cli', 'arc_implementer', {allowedPaths: ['live-smoke.txt']});
      assert.equal(prepared.status, 0, JSON.stringify(prepared.body));
      await arc('run-dispatch', {...ids('claude', 'claude-cli'), dispatchId: prepared.body.dispatchId, brief: 'Create the file live-smoke.txt in the working directory containing the single word ok. Change nothing else.'});
      const done = await settle('claude', 'claude-cli', prepared.body.dispatchId, 68 * 60 * 1000);
      assert.equal(done.body.routeStatus, 'completed', JSON.stringify(done.body));
      assert.equal(done.body.claims.model.level, 'runtime-observed', JSON.stringify(done.body.claims));
      assert.equal(fs.readFileSync(path.join(worktree, 'live-smoke.txt'), 'utf8').trim(), 'ok');
      assert.equal(git('status', '--porcelain').stdout.trim(), '?? live-smoke.txt');
      assertNoArcSkillLoad(config.roles.arc_implementer.platform, lease(prepared.body.dispatchId)?.sessionId);
      } finally { await cleanupDispatches(); }
    });

    // Host codex -> claude bridge. Gates G2 (CODEX_HOME writes are denied in the Codex host sandbox, so bridges are conservatively held) and G1 (Claude sandbox
    // injection unverified) failed, so these cases assert the recorded holds. No model is called.
    const anyOnClaude = roleOn('claude', ['arc_planner', 'arc_reviewer', 'arc_scouter', 'arc_implementer', 'arc_qa']);
    test('host codex to claude bridge is held as host_sandbox_blocked (G2) before any model call', {skip: anyOnClaude ? false : 'no role is routed to claude in the active configuration', timeout: 5 * 60 * 1000}, async t => {
      t.after(cleanupDispatches); // also runs when node:test times the test out; the finally below covers normal and failing exits
      try {
      const extra = anyOnClaude === 'arc_implementer' ? {allowedPaths: ['live-smoke.txt']} : {};
      const prepared = await prepare('codex', 'codex-cli', anyOnClaude, extra);
      assert.equal(prepared.status, 3, JSON.stringify(prepared.body));
      assert.equal(prepared.body.decision, 'hold');
      assert.match(JSON.stringify(prepared.body.reasons), /host_sandbox_blocked/);
      assert.equal(prepared.body.dispatchId, null);
      } finally { await cleanupDispatches(); }
    });

    const implementerOnClaude = roleOn('claude', ['arc_implementer']);
    test('Claude bridge Implementer is held as permission_scope_unverified (G1) before any model call', {skip: implementerOnClaude ? false : 'arc_implementer is not routed to claude in the active configuration', timeout: 5 * 60 * 1000}, async t => {
      t.after(cleanupDispatches); // also runs when node:test times the test out; the finally below covers normal and failing exits
      try {
      const prepared = await prepare('codex', 'codex-cli', 'arc_implementer', {allowedPaths: ['live-smoke.txt']});
      assert.equal(prepared.status, 3, JSON.stringify(prepared.body));
      assert.match(JSON.stringify(prepared.body.reasons), /permission_scope_unverified/);
      assert.equal(prepared.body.dispatchId, null);
      } finally { await cleanupDispatches(); }
    });
  }
}
