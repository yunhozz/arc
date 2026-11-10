import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRoutingFixture} from './role-fixtures.mjs';
import {DEFAULT_POLICY} from '../../lib/runtime/role-dispatch-policy.mjs';
import {dispatchDirectory, listLeases, readLease, writeLease, createLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {prepareRoleDispatch, routingStatus} from '../../lib/runtime/role-routing.mjs';

const DAY = 86400000;
const policyWith = (over = {}) => ({...DEFAULT_POLICY, probeTimeoutMs: 10000, lockRetryMs: 300, ...over, gates: {...DEFAULT_POLICY.gates, ...over.gates}});
let counter = 0;
const request = (role, extra = {}) => { counter += 1; return {role, requestId: `req-${counter}`, taskId: `T${counter}`, ...(role === 'arc_implementer' ? {allowedPaths: ['src/']} : {}), ...extra}; };
// policyWith defaults to a generous probe timeout so CPU load cannot cause a spurious hold; only the hang scenario overrides it.
const prepare = (f, assignment, {policy = policyWith(), now, context} = {}) => prepareRoleDispatch({context: context ?? f.context(), assignment, expectedRevision: f.revision, now, policy});
const codes = result => result.reasons.map(reason => reason.code);
const leaseCount = async f => { try { return (await fs.readdir(dispatchDirectory(f.codexHome))).length; } catch (error) { if (error.code === 'ENOENT') return 0; throw error; } };
const okClis = async (f, claudeVersion = '2.1.322 (Claude Code)', codexVersion = 'codex-cli 0.167.0') => { await f.cli('claude', {version: claudeVersion}); await f.cli('codex', {version: codexVersion}); };
const skipRoot = t => process.getuid?.() === 0 && t.skip('root ignores directory permissions');

test('routing-status returns revision, per-role routes, profile names and auth without creating leases', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const status = await routingStatus({context: f.context(), policy: policyWith()});
  assert.equal(status.decision, 'allow');
  assert.equal(status.revision, f.revision);
  assert.equal(status.hostPlatform, 'claude');
  assert.equal(status.roles.arc_qa.route, 'bridge');
  assert.equal(status.roles.arc_qa.platform, 'codex');
  assert.equal(status.roles.arc_qa.profileName, 'arc_routing_qa');
  assert.equal(status.roles.arc_qa.revisionTag, `[arc-routing rev ${f.revision}]`);
  assert.equal(status.roles.arc_planner.route, 'native');
  assert.equal(status.roles.arc_planner.profileName, 'arc-routing-planner');
  assert.equal(status.platforms.codex.authentication.status, 'Avaliable');
  assert.equal(status.platforms.codex.cliVersion.version, '0.167.0');
  assert.equal(status.platforms.claude.cliVersion.supported, true);
  assert.deepEqual(status.pruned, {removed: 0, errors: 0});
  assert.deepEqual(status.reasons, []);
  assert.equal(await leaseCount(f), 0);
  assert.equal(JSON.stringify(status).includes('Logged in'), false);
});

test('routing-status holds activation_unverified on marker hash mismatch', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const file = path.join(f.claudeHome, 'agents/arc-routing-planner.md'), bytes = await fs.readFile(file);
  await fs.writeFile(file, Buffer.concat([bytes, Buffer.from(' ')]));
  const status = await routingStatus({context: f.context(), policy: policyWith()});
  assert.equal(status.decision, 'hold');
  assert.deepEqual(codes(status), ['activation_unverified']);
  assert.ok(status.reasons[0].releaseCondition);
  assert.equal(await leaseCount(f), 0);
});

test('prepare-dispatch allows native and bridge with reserved lease and initial claims', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex', arc_implementer: 'codex'}});
  await okClis(f);
  const native = await prepare(f, request('arc_planner')), qa = await prepare(f, request('arc_qa')), impl = await prepare(f, request('arc_implementer'));
  for (const result of [native, qa, impl]) {
    assert.equal(result.decision, 'allow');
    assert.equal(result.routeStatus, 'reserved');
    assert.equal(result.supportStatus, 'unverified');
    assert.deepEqual(result.reasons, []);
    assert.match(result.dispatchId, /^[A-Za-z0-9._-]+$/);
  }
  assert.equal(native.route, 'native');
  assert.equal(native.profileName, 'arc-routing-planner');
  assert.equal(qa.route, 'bridge');
  assert.equal(qa.profileName, 'arc_routing_qa');
  for (const level of Object.values(native.claims).map(claim => claim.level)) assert.equal(level, 'operator-attested');
  assert.equal(native.claims.permissions.source, 'prompt-contract');
  assert.equal(native.claims.identity.source, 'orchestrator');
  for (const claim of Object.values(qa.claims)) assert.equal(claim.level, 'unverified');
  const leases = {native: await readLease(f.codexHome, native.dispatchId), qa: await readLease(f.codexHome, qa.dispatchId), impl: await readLease(f.codexHome, impl.dispatchId)};
  assert.equal(leases.native.timeoutMinutes, 20);
  assert.equal(leases.qa.timeoutMinutes, 30);
  assert.equal(leases.impl.timeoutMinutes, 60);
  assert.equal(leases.impl.state, 'reserved');
  assert.deepEqual(leases.impl.allowedPaths, ['src/']);
  assert.equal(leases.impl.revision, f.revision);
  assert.equal(leases.impl.workflowId, 'wf-1');
  assert.match(leases.impl.profileHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal((await fs.stat(path.join(dispatchDirectory(f.codexHome), `${qa.dispatchId}.json`))).mode & 0o777, 0o600);
  await assert.rejects(fs.access(path.join(f.codexHome, 'arc-role-platform-routing.lock')), {code: 'ENOENT'});
});

test('prepare-dispatch never emits native_provider_unavailable, capacity_unverified or model_effort_observer_unavailable', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const seen = [];
  for (const role of ['arc_planner', 'arc_qa']) seen.push(...codes(await prepare(f, request(role))));
  await f.cli('codex', {auth: 'unauthorized', version: 'codex-cli 0.167.0'});
  seen.push(...codes(await prepare(f, request('arc_qa'))));
  await f.cli('codex', {version: 'garbage'});
  seen.push(...codes(await prepare(f, request('arc_qa'))));
  assert.ok(seen.length > 0);
  for (const code of ['native_provider_unavailable', 'capacity_unverified', 'model_effort_observer_unavailable']) assert.equal(seen.includes(code), false, code);
});

test('prepare-dispatch maps CLI absence, unauthorized and probe failure to Not Avaliable, Unauthorized, Incomplete holds', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await f.cli('claude', {version: '2.1.322'});
  let result = await prepare(f, request('arc_qa'));
  assert.equal(result.decision, 'hold');
  assert.equal(result.authentication.status, 'Not Avaliable');
  assert.ok(codes(result).includes('Not Avaliable'));
  assert.equal(result.dispatchId, null);
  for (const [auth, status] of [['unauthorized', 'Unauthorized'], ['error', 'Incomplete'], ['hang', 'Incomplete']]) {
    await f.cli('codex', {auth, version: 'codex-cli 0.167.0'});
    result = await prepare(f, request('arc_qa'), {policy: policyWith({probeTimeoutMs: 500})}); // the hang scenario needs a short probe timeout
    assert.equal(result.decision, 'hold', auth);
    assert.equal(result.routeStatus, 'held');
    assert.equal(result.authentication.status, status, auth);
    assert.ok(codes(result).includes(status), auth);
    assert.ok(result.reasons.every(reason => reason.releaseCondition));
  }
  assert.equal(await leaseCount(f), 0);
});

test('bridge CLI version range is enforced per platform and native is unaffected', async t => {
  const passing = policyWith({gates: {G1: 'pass', G2: 'pass'}});
  const claudeHost = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  for (const [version, allowed] of [['codex-cli 0.167.0', true], ['codex-cli 0.167.9', true], ['codex-cli 0.168.0', false], ['codex-cli 0.166.9', false], ['garbage', false]]) {
    await claudeHost.cli('claude', {version: 'garbage'}); await claudeHost.cli('codex', {version});
    const bridge = await prepare(claudeHost, request('arc_qa'), {policy: passing});
    assert.equal(bridge.decision, allowed ? 'allow' : 'hold', version);
    if (!allowed) assert.ok(codes(bridge).includes('permission_scope_unverified'), version);
    assert.equal((await prepare(claudeHost, request('arc_planner'), {policy: passing})).decision, 'allow', `native with ${version}`);
  }
  const codexHost = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_planner: 'claude'}});
  for (const [version, allowed] of [['2.1.322 (Claude Code)', true], ['2.1.999', true], ['2.2.0', false], ['2.1.321', false], ['garbage', false]]) {
    await codexHost.cli('codex', {version: 'garbage'}); await codexHost.cli('claude', {version});
    const bridge = await prepare(codexHost, request('arc_planner'), {policy: passing});
    assert.equal(bridge.decision, allowed ? 'allow' : 'hold', version);
    if (!allowed) assert.ok(codes(bridge).includes('permission_scope_unverified'), version);
    assert.equal((await prepare(codexHost, request('arc_scouter'), {policy: passing})).decision, 'allow', `native with ${version}`);
  }
});

test('desktop environments hold environment_unverified until checklist passes', async t => {
  const f = await createRoutingFixture(t);
  await okClis(f);
  const context = f.context({executionEnvironment: 'claude-desktop'});
  const held = await prepare(f, request('arc_planner'), {context});
  assert.equal(held.decision, 'hold');
  assert.deepEqual(codes(held), ['environment_unverified']);
  const passed = await prepare(f, request('arc_planner'), {context, policy: policyWith({desktopChecklist: {'claude-desktop': true, 'codex-desktop': false}})});
  assert.equal(passed.decision, 'allow');
  assert.equal(passed.supportStatus, 'unverified');
});

test('gate results hold only the affected role, platform and host', async t => {
  // G1 fail: Claude bridge Implementer and QA hold, other Claude bridge roles allow.
  const g1 = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_implementer: 'claude', arc_qa: 'claude', arc_planner: 'claude'}});
  await okClis(g1);
  const g1Policy = policyWith({gates: {G1: 'fail', G2: 'pass'}});
  for (const role of ['arc_implementer', 'arc_qa']) { const r = await prepare(g1, request(role), {policy: g1Policy}); assert.equal(r.decision, 'hold', role); assert.deepEqual(codes(r), ['permission_scope_unverified'], role); }
  assert.equal((await prepare(g1, request('arc_planner'), {policy: g1Policy})).decision, 'allow');
  // G2 fail with a Codex host: bridge hosts_sandbox_blocked, native allowed.
  const g2 = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_planner: 'claude'}});
  await okClis(g2);
  const g2Policy = policyWith({gates: {G1: 'pass', G2: 'fail'}});
  const blocked = await prepare(g2, request('arc_planner'), {policy: g2Policy});
  assert.equal(blocked.decision, 'hold');
  assert.deepEqual(codes(blocked), ['host_sandbox_blocked']);
  assert.equal((await prepare(g2, request('arc_scouter'), {policy: g2Policy})).decision, 'allow');
  // G2 fail does not affect a Claude host.
  const claudeHost = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(claudeHost);
  assert.equal((await prepare(claudeHost, request('arc_qa'), {policy: g2Policy})).decision, 'allow');
  // G4 fail: every Codex bridge role holds.
  const g4 = await createRoutingFixture(t, {roles: Object.fromEntries(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer'].map(role => [role, 'codex']))});
  await okClis(g4);
  for (const role of ['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer']) {
    const r = await prepare(g4, request(role), {policy: policyWith({gates: {G4: 'fail'}})});
    assert.equal(r.decision, 'hold', role); assert.deepEqual(codes(r), ['permission_scope_unverified'], role);
  }
  // G3 fail and G5 wide are not hold reasons.
  const g35 = policyWith({gates: {G3: 'fail', G5: 'wide', G6: 'none'}});
  assert.equal((await prepare(claudeHost, request('arc_qa'), {policy: g35})).decision, 'allow');
});

test('duplicate requestId and duplicate non-terminal task-role are denied', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const first = await prepare(f, {role: 'arc_qa', requestId: 'r-1', taskId: 'T-1'});
  assert.equal(first.decision, 'allow');
  const sameRequest = await prepare(f, {role: 'arc_planner', requestId: 'r-1', taskId: 'T-9'});
  assert.equal(sameRequest.decision, 'deny');
  assert.deepEqual(codes(sameRequest), ['duplicate_dispatch']);
  const sameTaskRole = await prepare(f, {role: 'arc_qa', requestId: 'r-2', taskId: 'T-1'});
  assert.equal(sameTaskRole.decision, 'deny');
  assert.equal(sameTaskRole.dispatchId, null);
  assert.equal((await listLeases(f.codexHome)).length, 1);
  await writeLease(f.codexHome, {...(await readLease(f.codexHome, first.dispatchId)), state: 'completed'});
  assert.equal((await prepare(f, {role: 'arc_qa', requestId: 'r-3', taskId: 'T-1'})).decision, 'allow');
});

test('bridge concurrency and workflow total come from host limits.toml and unknown leases count', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex', arc_scouter: 'codex', arc_reviewer: 'codex'}, limits: {total: 100, concurrent: 2}});
  await okClis(f);
  const a = await prepare(f, request('arc_scouter'), {policy: policyWith()}), b = await prepare(f, request('arc_reviewer'), {policy: policyWith()});
  assert.equal(a.decision, 'allow'); assert.equal(b.decision, 'allow');
  let third = await prepare(f, request('arc_qa'), {policy: policyWith()});
  assert.equal(third.decision, 'hold');
  assert.deepEqual(codes(third), ['capacity_exhausted']);
  await writeLease(f.codexHome, {...(await readLease(f.codexHome, a.dispatchId)), state: 'unknown'});
  third = await prepare(f, request('arc_qa'), {policy: policyWith()});
  assert.deepEqual(codes(third), ['capacity_exhausted']);
  assert.equal((await prepare(f, request('arc_planner'), {policy: policyWith()})).decision, 'allow');
  await writeLease(f.codexHome, {...(await readLease(f.codexHome, a.dispatchId)), state: 'completed'});
  assert.equal((await prepare(f, request('arc_qa'), {policy: policyWith()})).decision, 'allow');

  const g = await createRoutingFixture(t, {roles: {arc_qa: 'codex', arc_scouter: 'codex', arc_reviewer: 'codex'}, limits: {total: 3, concurrent: 5}});
  await okClis(g);
  for (const role of ['arc_scouter', 'arc_reviewer', 'arc_qa']) {
    const r = await prepare(g, request(role), {policy: policyWith()}); assert.equal(r.decision, 'allow', role);
    await writeLease(g.codexHome, {...(await readLease(g.codexHome, r.dispatchId)), state: 'completed'});
  }
  const over = await prepare(g, request('arc_scouter'), {policy: policyWith()});
  assert.equal(over.decision, 'hold');
  assert.deepEqual(codes(over), ['capacity_exhausted']);
  assert.equal((await prepare(g, request('arc_planner'), {policy: policyWith()})).decision, 'allow');
  await fs.writeFile(path.join(g.claudeHome, 'skills/arc/limits.toml'), 'version = 2\n');
  const broken = await prepare(g, request('arc_scouter'), {policy: policyWith()});
  assert.deepEqual(codes(broken), ['activation_unverified']);
});

test('allowedPaths validation', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex', arc_implementer: 'codex'}});
  await okClis(f);
  const deny = async assignment => { const r = await prepare(f, assignment); assert.equal(r.decision, 'deny', JSON.stringify(assignment)); assert.deepEqual(codes(r), ['invalid_request']); };
  await deny({role: 'arc_implementer', requestId: 'a1', taskId: 'a1'});
  for (const bad of [[], ['/abs/file'], ['../escape'], ['src/../../x'], [''], 'src/', [1]]) await deny({role: 'arc_implementer', requestId: 'a2', taskId: 'a2', allowedPaths: bad});
  await deny({role: 'arc_planner', requestId: 'a3', taskId: 'a3', allowedPaths: ['src/']});
  await deny({role: 'arc_scouter', requestId: 'a4', taskId: 'a4', allowedPaths: []});
  await deny({role: 'unknown_role', requestId: 'a5', taskId: 'a5'});
  await deny({role: 'arc_qa', requestId: '', taskId: 'a6'});
  assert.equal((await prepare(f, {role: 'arc_qa', requestId: 'ok1', taskId: 'ok1'})).decision, 'allow');
  assert.equal((await prepare(f, {role: 'arc_qa', requestId: 'ok2', taskId: 'ok2', allowedPaths: ['tests/', 'lib/a.mjs']})).decision, 'allow');
  const bad = await prepareRoleDispatch({context: f.context({hostPlatform: 'claude', executionEnvironment: 'codex-cli'}), assignment: request('arc_planner'), expectedRevision: f.revision, policy: policyWith()});
  assert.equal(bad.decision, 'deny');
  assert.equal(await leaseCount(f), 2);
});

test('EACCES on dispatch directory or lock maps to host_sandbox_blocked', async t => {
  skipRoot(t);
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  await fs.mkdir(dispatchDirectory(f.codexHome), {mode: 0o700});
  await fs.chmod(dispatchDirectory(f.codexHome), 0o500);
  try {
    const dirResult = await prepare(f, request('arc_qa'), {policy: policyWith()});
    assert.equal(dirResult.decision, 'hold');
    assert.deepEqual(codes(dirResult), ['host_sandbox_blocked']);
  } finally { await fs.chmod(dispatchDirectory(f.codexHome), 0o700); }
  await fs.chmod(dispatchDirectory(f.codexHome), 0o700);
  await fs.chmod(f.codexHome, 0o500);
  try {
    const lockResult = await prepare(f, request('arc_qa'), {policy: policyWith()});
    assert.equal(lockResult.decision, 'hold');
    assert.deepEqual(codes(lockResult), ['host_sandbox_blocked']);
  } finally { await fs.chmod(f.codexHome, 0o700); }
});

const writeForeignLock = async f => { const lock = path.join(f.codexHome, 'arc-role-platform-routing.lock'); await fs.writeFile(lock, JSON.stringify({version: 1, operationId: 'other-operation', pid: 1, createdAt: new Date().toISOString()}) + '\n', {mode: 0o600}); return lock; };

test('lock busy beyond retry window holds activation_unverified with residual lock path and keeps the lock file', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const lock = await writeForeignLock(f), started = Date.now();
  const result = await prepare(f, request('arc_qa'), {policy: policyWith({lockRetryMs: 300})});
  assert.ok(Date.now() - started >= 250);
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['activation_unverified']);
  assert.deepEqual(result.residualPaths, [lock]);
  assert.ok((await fs.readFile(lock, 'utf8')).includes('other-operation'));
  assert.equal(await leaseCount(f), 0);
  const status = await routingStatus({context: f.context(), policy: policyWith({lockRetryMs: 100})});
  assert.equal(status.decision, 'hold');
  assert.deepEqual(status.residualPaths, [lock]);
});

test('lock released within retry window allows', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const lock = await writeForeignLock(f);
  setTimeout(() => fs.unlink(lock).catch(() => {}), 300);
  const result = await prepare(f, request('arc_qa'), {policy: policyWith({lockRetryMs: 2000})});
  assert.equal(result.decision, 'allow');
});

test('prune failure does not change the decision and old terminal leases are pruned under the lock', async t => {
  skipRoot(t);
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const now = Date.parse('2026-06-30T00:00:00.000Z');
  const old = {version: 1, dispatchId: 'old', workflowId: 'wf-0', taskId: 'T0', requestId: 'req-old', role: 'arc_qa', route: 'bridge', hostPlatform: 'claude', executionEnvironment: 'claude-cli', revision: 'rev-0', profileHash: 'sha256:' + 'b'.repeat(64), argsDigest: null, state: 'completed', supervisor: null, child: null, sessionId: null, timeoutMinutes: 30, claims: null, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: new Date(now - 40 * DAY).toISOString(), updatedAt: new Date(now - 40 * DAY).toISOString()};
  await createLease(f.codexHome, old);
  const pruned = await routingStatus({context: f.context(), now, policy: policyWith()});
  assert.deepEqual(pruned.pruned, {removed: 1, errors: 0});
  assert.equal(await readLease(f.codexHome, 'old'), null);
  await createLease(f.codexHome, old);
  await fs.chmod(dispatchDirectory(f.codexHome), 0o500);
  t.after(() => fs.chmod(dispatchDirectory(f.codexHome), 0o700).catch(() => {}));
  const status = await routingStatus({context: f.context(), now, policy: policyWith()});
  assert.equal(status.decision, 'allow');
  assert.deepEqual(status.pruned, {removed: 0, errors: 1});
  await f.cli('codex', {auth: 'unauthorized', version: 'codex-cli 0.167.0'});
  const held = await prepare(f, request('arc_qa'), {now});
  assert.equal(held.decision, 'hold');
  assert.deepEqual(codes(held), ['Unauthorized']);
  await fs.chmod(dispatchDirectory(f.codexHome), 0o700);
  const reallowed = await (async () => { await f.cli('codex', {version: 'codex-cli 0.167.0'}); return prepare(f, request('arc_qa'), {now}); })();
  assert.equal(reallowed.decision, 'allow');
  assert.equal(await readLease(f.codexHome, 'old'), null);
});

test('existing dirty and untracked worktree files never affect pre-start decisions', async t => {
  const f = await createRoutingFixture(t);
  await okClis(f);
  await fs.writeFile(path.join(f.cwd, 'tracked.txt'), 'one\n');
  const {spawnSync} = await import('node:child_process');
  spawnSync('git', ['add', 'tracked.txt'], {cwd: f.cwd}); spawnSync('git', ['commit', '-q', '-m', 'add'], {cwd: f.cwd});
  await fs.writeFile(path.join(f.cwd, 'tracked.txt'), 'two\n');
  await fs.writeFile(path.join(f.cwd, 'untracked.txt'), 'new\n');
  for (const role of ['arc_scouter', 'arc_reviewer']) assert.equal((await prepare(f, request(role))).decision, 'allow', role);
  assert.equal(await fs.readFile(path.join(f.cwd, 'tracked.txt'), 'utf8'), 'two\n');
});

const runCli = (f, command, input, extraEnv = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(f.codexHome, 'skills/arc/runtime/cli.mjs'), command, '--cwd', f.cwd, '--workflow', 'wf-1', '--input', '-'], {env: {...f.env, ...extraEnv}, stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '', stderr = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
  child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
  child.on('error', reject);
  child.on('close', code => { clearTimeout(timer); resolve({code, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout.trim().split('\n').at(-1)) : null}); });
  child.stdin.end(JSON.stringify(input));
});

test('installed cli.mjs maps allow/hold/deny to exit 0/3/2', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const base = {hostPlatform: 'claude', executionEnvironment: 'claude-cli'};
  const status = await runCli(f, 'routing-status', base);
  assert.equal(status.code, 0, status.stderr);
  assert.equal(status.json.workflowId, 'wf-1');
  assert.equal(status.json.revision, f.revision);
  assert.equal(await leaseCount(f), 0);
  const allow = await runCli(f, 'prepare-dispatch', {...base, role: 'arc_planner', expectedRevision: f.revision, requestId: 'c1', taskId: 'c1'});
  assert.equal(allow.code, 0, allow.stderr);
  assert.equal(allow.json.decision, 'allow');
  assert.equal(allow.json.routeStatus, 'reserved');
  const duplicate = await runCli(f, 'prepare-dispatch', {...base, role: 'arc_planner', expectedRevision: f.revision, requestId: 'c1', taskId: 'c2'});
  assert.equal(duplicate.code, 2);
  assert.deepEqual(codes(duplicate.json), ['duplicate_dispatch']);
  const unknownKey = await runCli(f, 'prepare-dispatch', {...base, role: 'arc_planner', expectedRevision: f.revision, requestId: 'c3', taskId: 'c3', extra: 1});
  assert.equal(unknownKey.code, 2);
  assert.deepEqual(codes(unknownKey.json), ['invalid_request']);
  const missingKey = await runCli(f, 'routing-status', {hostPlatform: 'claude'});
  assert.equal(missingKey.code, 2);
  const staleRevision = await runCli(f, 'prepare-dispatch', {...base, role: 'arc_planner', expectedRevision: 'other', requestId: 'c4', taskId: 'c4'});
  assert.equal(staleRevision.code, 3);
  assert.deepEqual(codes(staleRevision.json), ['activation_unverified']);
});

test('duplicate requestId is global across workflows while task-role duplication stays per workflow', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex'}});
  await okClis(f);
  const first = await prepare(f, {role: 'arc_planner', requestId: 'shared-req', taskId: 'T-1'});
  assert.equal(first.decision, 'allow');
  const other = await prepare(f, {role: 'arc_scouter', requestId: 'shared-req', taskId: 'T-2'}, {context: f.context({workflowId: 'wf-other'})});
  assert.equal(other.decision, 'deny');
  assert.deepEqual(codes(other), ['duplicate_dispatch']);
  const sameTaskOtherWorkflow = await prepare(f, {role: 'arc_planner', requestId: 'fresh-req', taskId: 'T-1'}, {context: f.context({workflowId: 'wf-other'})});
  assert.equal(sameTaskOtherWorkflow.decision, 'allow');
  await writeLease(f.codexHome, {...(await readLease(f.codexHome, first.dispatchId)), state: 'completed'});
  assert.equal((await prepare(f, {role: 'arc_scouter', requestId: 'shared-req', taskId: 'T-3'}, {context: f.context({workflowId: 'wf-other'})})).decision, 'deny');
});

test('an unparsable lease file holds activation_unverified and points at the lease records', async t => {
  const f = await createRoutingFixture(t);
  await okClis(f);
  await fs.mkdir(dispatchDirectory(f.codexHome), {mode: 0o700});
  await fs.writeFile(path.join(dispatchDirectory(f.codexHome), 'broken.json'), '{nope');
  const result = await prepare(f, request('arc_planner'));
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['activation_unverified']);
  assert.match(result.reasons[0].releaseCondition, /arc-role-dispatch/);
  assert.match(result.reasons[0].releaseCondition, /lease/i);
});

test('CLAUDE_SANDBOX_SETTINGS is a recorded JSON object only when G1 passes and otherwise null', async t => {
  const policyModule = await import('../../lib/runtime/role-dispatch-policy.mjs');
  assert.equal(policyModule.CLAUDE_SANDBOX_SETTINGS, null);
  assert.equal(policyModule.DEFAULT_POLICY.claudeSandboxSettings, null);
  assert.equal(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'fail'}, claudeSandboxSettings: {sandbox: {enabled: true}}}), null);
  assert.equal(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'pass'}, claudeSandboxSettings: {}}), null);
  assert.equal(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'pass'}, claudeSandboxSettings: null}), null);
  const recorded = {sandbox: {enabled: true}};
  assert.deepEqual(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'pass'}, claudeSandboxSettings: recorded}), recorded);
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_implementer: 'claude', arc_qa: 'claude', arc_planner: 'claude'}});
  await okClis(f);
  const noJson = policyWith({gates: {G1: 'pass', G2: 'pass'}, claudeSandboxSettings: null});
  for (const role of ['arc_implementer', 'arc_qa']) { const r = await prepare(f, request(role), {policy: noJson}); assert.equal(r.decision, 'hold', role); assert.deepEqual(codes(r), ['permission_scope_unverified'], role); }
  assert.equal((await prepare(f, request('arc_planner'), {policy: noJson})).decision, 'allow');
  const withJson = policyWith({gates: {G1: 'pass', G2: 'pass'}, claudeSandboxSettings: recorded});
  for (const role of ['arc_implementer', 'arc_qa']) assert.equal((await prepare(f, request(role), {policy: withJson})).decision, 'allow', role);
});

test('parallel prepare-dispatch calls create exactly one lease per duplicate key and never exceed bridge limits', async t => {
  const wide = policyWith({lockRetryMs: 15000});
  const f = await createRoutingFixture(t, {roles: {arc_qa: 'codex', arc_scouter: 'codex'}, limits: {total: 100, concurrent: 2}});
  await okClis(f);
  const taskRole = await Promise.all(Array.from({length: 6}, (_, i) => prepare(f, {role: 'arc_planner', requestId: `par-a-${i}`, taskId: 'T-par'}, {policy: wide})));
  assert.equal(taskRole.filter(r => r.decision === 'allow').length, 1);
  assert.ok(taskRole.filter(r => r.decision !== 'allow').every(r => r.decision === 'deny' || r.decision === 'hold'));
  assert.equal((await listLeases(f.codexHome)).length, 1);
  const sameRequest = await Promise.all(Array.from({length: 6}, (_, i) => prepare(f, {role: 'arc_planner', requestId: 'par-b', taskId: `T-b-${i}`}, {policy: wide})));
  assert.equal(sameRequest.filter(r => r.decision === 'allow').length, 1);
  assert.equal((await listLeases(f.codexHome)).length, 2);
  const bridges = await Promise.all(Array.from({length: 6}, (_, i) => prepare(f, {role: i % 2 ? 'arc_qa' : 'arc_scouter', requestId: `par-c-${i}`, taskId: `T-c-${i}`}, {policy: wide})));
  assert.equal(bridges.filter(r => r.decision === 'allow').length, 2);
  assert.ok(bridges.filter(r => r.decision !== 'allow').every(r => r.decision === 'hold' && codes(r).includes('capacity_exhausted')));
  assert.equal((await listLeases(f.codexHome)).filter(lease => lease.route === 'bridge').length, 2);
});

test('parallel child processes reserve the same requestId exactly once', async t => {
  const f = await createRoutingFixture(t);
  await okClis(f);
  const input = {hostPlatform: 'claude', executionEnvironment: 'claude-cli', role: 'arc_planner', expectedRevision: f.revision, requestId: 'proc-1', taskId: 'T-proc'};
  const results = await Promise.all(Array.from({length: 4}, () => runCli(f, 'prepare-dispatch', input)));
  assert.equal(results.filter(r => r.json.decision === 'allow').length, 1, JSON.stringify(results.map(r => r.json)));
  assert.ok(results.filter(r => r.json.decision !== 'allow').every(r => [2, 3].includes(r.code)));
  assert.equal((await listLeases(f.codexHome)).length, 1);
});
