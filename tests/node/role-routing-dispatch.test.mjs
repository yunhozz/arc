import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRoutingFixture, legacyDispatchCases, legacyDispatchFixture} from './role-fixtures.mjs';
import {BRIDGE_GATE_RESULTS, CLAUDE_SANDBOX_SETTINGS, DESKTOP_CHECKLIST_PASSED, DEFAULT_POLICY, bridgeGateReasons, reason} from '../../lib/runtime/role-dispatch-policy.mjs';
import {dispatchDirectory, listLeases, readLease, writeLease, createLease} from '../../lib/runtime/role-dispatch-store.mjs';
import {prepareRoleDispatch, routingStatus} from '../../lib/runtime/role-routing.mjs';
import {cancelRoleDispatch, recordRoleObservation, runBridgeDispatch} from '../../lib/runtime/role-bridge.mjs';
import {buildBridgeInvocation} from '../../lib/runtime/role-supervisor.mjs';
import {resolveWorktree} from '../../lib/runtime/role-observe.mjs';
import {createDispatchIndex} from '../../lib/watch/dispatch.mjs';
import {dispatchLabel} from '../../lib/watch/labels.mjs';
import {renderHuman} from '../../lib/watch/render.mjs';

const DAY = 86400000;
const policyWith = (over = {}) => ({...DEFAULT_POLICY, probeTimeoutMs: 10000, lockRetryMs: 300, ...over, gates: {...DEFAULT_POLICY.gates, ...over.gates}});
let counter = 0;
const request = (role, extra = {}) => { counter += 1; return {role, requestId: `req-${counter}`, taskId: `T${counter}`, ...(role === 'arc_implementer' ? {allowedPaths: ['src/']} : {}), ...extra}; };
// policyWith defaults to a generous probe timeout so CPU load cannot cause a spurious hold; only the hang scenario overrides it.
const prepare = (f, assignment, {policy = policyWith(), now, context} = {}) => prepareRoleDispatch({context: context ?? f.context(), assignment, expectedRevision: f.revision, now, policy});
const cancel = (f, dispatchId) => cancelRoleDispatch({context: f.context(), dispatchId});
const codes = result => result.reasons.map(reason => reason.code);
const leaseCount = async f => { try { return (await fs.readdir(dispatchDirectory(f.claudeHome))).length; } catch (error) { if (error.code === 'ENOENT') return 0; throw error; } };
const okClis = async (f, claudeVersion = '2.1.322 (Claude Code)', codexVersion = 'codex-cli 0.167.0') => { await f.cli('claude', {version: claudeVersion}); await f.cli('codex', {version: codexVersion}); };
const skipRoot = t => process.getuid?.() === 0 && t.skip('root ignores directory permissions');

test('legacy dispatch observe cancel and watch label', async t => {
  const f = await legacyDispatchFixture(t);
  const index = createDispatchIndex({storeDir: f.storeDir});
  for (const {hostPlatform, targetPlatform, profileName} of legacyDispatchCases) {
    await t.test(hostPlatform, async () => {
      const context = f.context({hostPlatform, executionEnvironment: hostPlatform + '-cli'});
      const records = [['arc_qa', 'old1'], ['arc-routing-qa', 'old2'], ['arc_tester', 'new1']];
      for (const [role, prefix] of records) {
        await f.seed({hostPlatform, targetPlatform, role, dispatchId: prefix + '-' + hostPlatform});
      }
      await index.scan({gitCommonDirs: []});
      for (const [role, prefix] of records) {
        const dispatchId = prefix + '-' + hostPlatform;
        const observed = await recordRoleObservation({context, dispatchId});
        const cancelled = await cancelRoleDispatch({context, dispatchId});
        assert.equal(observed.decision, 'allow', role);
        assert.equal(observed.routeStatus, 'reserved', role);
        assert.equal(cancelled.decision, 'allow', role);
        assert.equal(cancelled.routeStatus, 'cancelled', role);
        assert.equal((await readLease(f.claudeHome, dispatchId)).role, role);
        const ref = index.byId(dispatchId);
        const label = dispatchLabel(ref.rawRole, dispatchId);
        const rendered = renderHuman({kind: 'agent', role: ref.role, label, text: 'dispatch result'}, {width: 100, color: false});
        assert.equal(label, 'tester@' + prefix, role);
        assert.match(rendered, /\bTESTER\b/, role);
        for (const output of [observed, cancelled]) {
          assert.equal(output.role, 'arc_tester', role);
          assert.equal(output.profileName, profileName, role);
        }
      }
    });
  }
  const dispatchId = 'legacy-reserved';
  const file = await f.seed({dispatchId, role: 'arc_qa', hostPlatform: 'claude', targetPlatform: 'codex'});
  const before = await fs.readFile(file);
  const result = await runBridgeDispatch({context: f.context(), dispatchId, brief: 'start',
    startSupervisor: async () => assert.fail('legacy dispatch must not start a supervisor')});
  assert.equal(result.decision, 'deny');
  assert.deepEqual(await fs.readFile(file), before);
});

test('default bridge policy passes G1 and GK1, holds Desktop and requires per-call escalation for G2', () => {
  assert.deepEqual(BRIDGE_GATE_RESULTS, {G1: 'pass', G2: 'escalation', G3: 'pass', G4: 'pass', G5: 'wide', G6: 'strict', G7: 'pass', G8: 'pass', GG1: 'fail', GG2: 'fail', GK1: 'pass', GK2: 'approval'});
  assert.equal(Object.isFrozen(BRIDGE_GATE_RESULTS), true);
  assert.deepEqual(DESKTOP_CHECKLIST_PASSED, {'claude-desktop': false, 'codex-desktop': false});
  assert.equal(DEFAULT_POLICY.gates, BRIDGE_GATE_RESULTS);
});

test('CLAUDE_SANDBOX_SETTINGS records the measured D2 object, deep-frozen', () => {
  assert.deepEqual(CLAUDE_SANDBOX_SETTINGS, {
    permissions: {deny: ['Edit(./.git/**)', 'Write(./.git/**)']},
    sandbox: {
      enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, failIfUnavailable: true,
      filesystem: {denyWrite: ['./.git']},
    },
  });
  assert.equal(Object.isFrozen(CLAUDE_SANDBOX_SETTINGS), true);
  assert.equal(Object.isFrozen(CLAUDE_SANDBOX_SETTINGS.permissions), true);
  assert.equal(Object.isFrozen(CLAUDE_SANDBOX_SETTINGS.permissions.deny), true);
  assert.equal(Object.isFrozen(CLAUDE_SANDBOX_SETTINGS.sandbox), true);
  assert.equal(Object.isFrozen(CLAUDE_SANDBOX_SETTINGS.sandbox.filesystem), true);
  assert.equal(Object.isFrozen(CLAUDE_SANDBOX_SETTINGS.sandbox.filesystem.denyWrite), true);
  assert.equal(DEFAULT_POLICY.claudeSandboxSettings, CLAUDE_SANDBOX_SETTINGS);
});

test('default Codex host permits Claude bridge gates and honors injected G1 and G2 failures', () => {
  const input = {platform: 'claude', role: 'arc_planner', hostPlatform: 'codex'};
  assert.deepEqual(bridgeGateReasons(input), []);
  assert.deepEqual(bridgeGateReasons({...input, policy: policyWith({gates: {G1: 'pass', G2: 'fail'}})}), ['host_sandbox_blocked']);
  for (const role of ['arc_implementer', 'arc_tester']) {
    assert.deepEqual(bridgeGateReasons({...input, role}), [], role);
    assert.deepEqual(bridgeGateReasons({...input, role, policy: policyWith({gates: {G1: 'fail'}})}), ['permission_scope_unverified'], role);
  }
});

test('default Codex CLI policy allows Claude bridge roles and injected G1 failure holds writing roles', async t => {
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_planner: 'claude', arc_reviewer: 'claude', arc_implementer: 'claude', arc_tester: 'claude'}});
  await okClis(f);
  for (const role of ['arc_planner', 'arc_reviewer', 'arc_implementer', 'arc_tester']) {
    const result = await prepare(f, request(role), {policy: DEFAULT_POLICY});
    try {
      assert.equal(result.decision, 'allow', role);
      assert.equal(result.route, 'bridge', role);
      assert.equal(result.supportStatus, 'unverified', role);
      assert.deepEqual(codes(result), [], role);
      assert.ok(result.dispatchId, role);
    } finally { if (result.dispatchId) await cancel(f, result.dispatchId); }
  }
  for (const role of ['arc_implementer', 'arc_tester']) {
    const result = await prepare(f, request(role), {policy: policyWith({gates: {G1: 'fail'}})});
    assert.equal(result.decision, 'hold', role);
    assert.deepEqual(codes(result), ['permission_scope_unverified'], role);
  }
});

test('default Desktop policy holds Codex native and bridge roles and Claude hosts for environment verification', async t => {
  const codex = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_planner: 'claude'}});
  await okClis(codex);
  for (const [role, route] of [['arc_planner', 'bridge'], ['arc_scouter', 'native']]) {
    const result = await prepare(codex, request(role), {policy: DEFAULT_POLICY, context: codex.context({executionEnvironment: 'codex-desktop'})});
    assert.equal(result.decision, 'hold', role);
    assert.equal(result.route, route, role);
    assert.deepEqual(codes(result), ['environment_unverified'], role);
    assert.equal(codes(result).includes('host_sandbox_blocked'), false, role);
  }
  const claude = await createRoutingFixture(t);
  await okClis(claude);
  const result = await prepare(claude, request('arc_planner'), {policy: DEFAULT_POLICY, context: claude.context({executionEnvironment: 'claude-desktop'})});
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['environment_unverified']);
});

test('Desktop release condition tells terminal sessions to redeclare a CLI environment', () => {
  assert.deepEqual(reason('environment_unverified'), {
    code: 'environment_unverified',
    releaseCondition: 'Desktop hosts are held in this release. If this session is not running inside a Desktop app (for example a terminal or IDE terminal session), declare a CLI environment (claude-cli or codex-cli or gemini-cli or grok-cli) instead; otherwise use a CLI host or a later ARC update that changes the support status.',
  });
});

test('default Codex host maps Claude planner dispatch-directory and Claude-anchor-home EACCES to host_sandbox_blocked', async t => {
  if (skipRoot(t)) return;
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_planner: 'claude'}});
  await okClis(f);
  await fs.mkdir(dispatchDirectory(f.claudeHome), {mode: 0o700});
  for (const directory of [dispatchDirectory(f.claudeHome), f.claudeHome]) {
    await fs.chmod(directory, 0o500);
    try {
      const result = await prepare(f, request('arc_planner'), {policy: DEFAULT_POLICY});
      assert.equal(result.decision, 'hold');
      assert.deepEqual(codes(result), ['host_sandbox_blocked']);
    } finally { await fs.chmod(directory, 0o700); }
  }
});

test('routing-status returns revision, per-role routes, profile names and auth without creating leases', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const status = await routingStatus({context: f.context(), policy: policyWith()});
  assert.equal(status.decision, 'allow');
  assert.equal(status.revision, f.revision);
  assert.equal(status.hostPlatform, 'claude');
  assert.equal(status.roles.arc_tester.route, 'bridge');
  assert.equal(status.roles.arc_tester.platform, 'codex');
  assert.equal(status.roles.arc_tester.profileName, 'arc_routing_tester');
  assert.equal(status.roles.arc_tester.revisionTag, `[arc-routing rev ${f.revision}]`);
  assert.equal(status.roles.arc_planner.route, 'native');
  assert.equal(status.roles.arc_planner.profileName, 'arc-routing-planner');
  assert.equal(status.platforms.codex.authentication.status, 'Available');
  assert.equal(status.platforms.codex.cliVersion.version, '0.167.0');
  assert.deepEqual(status.platforms.claude.cliVersion, {version: '2.1.322'});
  assert.deepEqual(status.pruned, {removed: 0, errors: 0});
  assert.deepEqual(status.reasons, []);
  assert.equal(await leaseCount(f), 0);
  assert.equal(JSON.stringify(status).includes('Logged in'), false);
});

test('routing-status holds activation_unverified on marker hash mismatch', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
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
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex', arc_implementer: 'codex'}});
  await okClis(f);
  const native = await prepare(f, request('arc_planner')), tester = await prepare(f, request('arc_tester')), impl = await prepare(f, request('arc_implementer'));
  for (const result of [native, tester, impl]) {
    assert.equal(result.decision, 'allow');
    assert.equal(result.routeStatus, 'reserved');
    assert.equal(result.supportStatus, 'unverified');
    assert.deepEqual(result.reasons, []);
    assert.match(result.dispatchId, /^[A-Za-z0-9._-]+$/);
  }
  assert.equal(native.route, 'native');
  assert.equal(native.profileName, 'arc-routing-planner');
  assert.equal(tester.route, 'bridge');
  assert.equal(tester.profileName, 'arc_routing_tester');
  for (const level of Object.values(native.claims).map(claim => claim.level)) assert.equal(level, 'operator-attested');
  assert.equal(native.claims.permissions.source, 'prompt-contract');
  assert.equal(native.claims.identity.source, 'orchestrator');
  for (const claim of Object.values(tester.claims)) assert.equal(claim.level, 'unverified');
  const leases = {native: await readLease(f.claudeHome, native.dispatchId), tester: await readLease(f.claudeHome, tester.dispatchId), impl: await readLease(f.claudeHome, impl.dispatchId)};
  assert.equal(leases.native.timeoutMinutes, 20);
  assert.equal(leases.tester.timeoutMinutes, 60);
  assert.equal(leases.impl.timeoutMinutes, 60);
  assert.equal(leases.impl.state, 'reserved');
  assert.deepEqual(leases.impl.allowedPaths, ['src/']);
  assert.equal(leases.impl.revision, f.revision);
  assert.equal(leases.impl.workflowId, 'wf-1');
  assert.match(leases.impl.profileHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal((await fs.stat(path.join(dispatchDirectory(f.claudeHome), `${tester.dispatchId}.json`))).mode & 0o777, 0o600);
  await assert.rejects(fs.access(path.join(f.claudeHome, 'arc-role-platform-routing.lock')), {code: 'ENOENT'});
});

test('prepare-dispatch never emits native_provider_unavailable, capacity_unverified or model_effort_observer_unavailable', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const seen = [];
  for (const role of ['arc_planner', 'arc_tester']) seen.push(...codes(await prepare(f, request(role))));
  await f.cli('codex', {auth: 'unauthorized', version: 'codex-cli 0.167.0'});
  seen.push(...codes(await prepare(f, request('arc_tester'))));
  await f.cli('codex', {version: 'garbage'});
  seen.push(...codes(await prepare(f, request('arc_tester'))));
  assert.ok(seen.length > 0);
  for (const code of ['native_provider_unavailable', 'capacity_unverified', 'model_effort_observer_unavailable']) assert.equal(seen.includes(code), false, code);
});

test('prepare-dispatch maps CLI absence, unauthorized and probe failure to Not Available, Unauthorized, Incomplete holds', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await f.cli('claude', {version: '2.1.322'});
  let result = await prepare(f, request('arc_tester'));
  assert.equal(result.decision, 'hold');
  assert.equal(result.authentication.status, 'Not Available');
  assert.ok(codes(result).includes('Not Available'));
  assert.equal(result.dispatchId, null);
  for (const [auth, status] of [['unauthorized', 'Unauthorized'], ['error', 'Incomplete'], ['hang', 'Incomplete']]) {
    await f.cli('codex', {auth, version: 'codex-cli 0.167.0'});
    result = await prepare(f, request('arc_tester'), {policy: policyWith({probeTimeoutMs: 500})}); // the hang scenario needs a short probe timeout
    assert.equal(result.decision, 'hold', auth);
    assert.equal(result.routeStatus, 'held');
    assert.equal(result.authentication.status, status, auth);
    assert.ok(codes(result).includes(status), auth);
    assert.ok(result.reasons.every(reason => reason.releaseCondition));
  }
  assert.equal(await leaseCount(f), 0);
});

test('bridge CLI versions are reported but never gate dispatch', async t => {
  const passing = policyWith({gates: {G1: 'pass', G2: 'pass'}});
  const claudeHost = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  for (const [version, parsed] of [['codex-cli 0.167.0', '0.167.0'], ['codex-cli 0.169.0', '0.169.0'], ['codex-cli 0.166.9', '0.166.9'], ['garbage', null]]) {
    await claudeHost.cli('claude', {version: 'garbage'}); await claudeHost.cli('codex', {version});
    const bridge = await prepare(claudeHost, request('arc_tester'), {policy: passing});
    assert.equal(bridge.decision, 'allow', version);
    assert.ok(!codes(bridge).includes('permission_scope_unverified'), version);
    assert.deepEqual(bridge.cliVersion, parsed ? {version: parsed} : {version: null, reason: 'version_unparsed'}, version);
    await cancel(claudeHost, bridge.dispatchId);
    assert.equal((await prepare(claudeHost, request('arc_planner'), {policy: passing})).decision, 'allow', `native with ${version}`);
  }
  const codexHost = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_planner: 'claude'}});
  for (const [version, parsed] of [['2.1.322 (Claude Code)', '2.1.322'], ['2.2.0', '2.2.0'], ['2.1.321', '2.1.321'], ['garbage', null]]) {
    await codexHost.cli('codex', {version: 'garbage'}); await codexHost.cli('claude', {version});
    const bridge = await prepare(codexHost, request('arc_planner'), {policy: passing});
    assert.equal(bridge.decision, 'allow', version);
    assert.ok(!codes(bridge).includes('permission_scope_unverified'), version);
    assert.deepEqual(bridge.cliVersion, parsed ? {version: parsed} : {version: null, reason: 'version_unparsed'}, version);
    await cancel(codexHost, bridge.dispatchId);
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
  // G1 fail: Claude bridge Implementer and Tester hold, other Claude bridge roles allow.
  const g1 = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_implementer: 'claude', arc_tester: 'claude', arc_planner: 'claude'}});
  await okClis(g1);
  const g1Policy = policyWith({gates: {G1: 'fail', G2: 'pass'}});
  for (const role of ['arc_implementer', 'arc_tester']) { const r = await prepare(g1, request(role), {policy: g1Policy}); assert.equal(r.decision, 'hold', role); assert.deepEqual(codes(r), ['permission_scope_unverified'], role); }
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
  const claudeHost = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(claudeHost);
  assert.equal((await prepare(claudeHost, request('arc_tester'), {policy: g2Policy})).decision, 'allow');
  // G4 fail: every Codex bridge role holds.
  const g4 = await createRoutingFixture(t, {roles: Object.fromEntries(['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_tester', 'arc_reviewer'].map(role => [role, 'codex']))});
  await okClis(g4);
  for (const role of ['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_tester', 'arc_reviewer']) {
    const r = await prepare(g4, request(role), {policy: policyWith({gates: {G4: 'fail'}})});
    assert.equal(r.decision, 'hold', role); assert.deepEqual(codes(r), ['permission_scope_unverified'], role);
  }
  // G3 fail and G5 wide are not hold reasons.
  const g35 = policyWith({gates: {G3: 'fail', G5: 'wide', G6: 'none'}});
  assert.equal((await prepare(claudeHost, request('arc_tester'), {policy: g35})).decision, 'allow');
});

test('duplicate requestId and duplicate non-terminal task-role are denied', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const first = await prepare(f, {role: 'arc_tester', requestId: 'r-1', taskId: 'T-1'});
  assert.equal(first.decision, 'allow');
  const sameRequest = await prepare(f, {role: 'arc_planner', requestId: 'r-1', taskId: 'T-9'});
  assert.equal(sameRequest.decision, 'deny');
  assert.deepEqual(codes(sameRequest), ['duplicate_dispatch']);
  const sameTaskRole = await prepare(f, {role: 'arc_tester', requestId: 'r-2', taskId: 'T-1'});
  assert.equal(sameTaskRole.decision, 'deny');
  assert.equal(sameTaskRole.dispatchId, null);
  assert.equal((await listLeases(f.claudeHome)).length, 1);
  await writeLease(f.claudeHome, {...(await readLease(f.claudeHome, first.dispatchId)), state: 'completed'});
  assert.equal((await prepare(f, {role: 'arc_tester', requestId: 'r-3', taskId: 'T-1'})).decision, 'allow');
});

test('bridge concurrency and workflow total come from host limits.toml and unknown leases count', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex', arc_scouter: 'codex', arc_reviewer: 'codex'}, limits: {total: 100, concurrent: 2}});
  await okClis(f);
  const a = await prepare(f, request('arc_scouter'), {policy: policyWith()}), b = await prepare(f, request('arc_reviewer'), {policy: policyWith()});
  assert.equal(a.decision, 'allow'); assert.equal(b.decision, 'allow');
  let third = await prepare(f, request('arc_tester'), {policy: policyWith()});
  assert.equal(third.decision, 'hold');
  assert.deepEqual(codes(third), ['capacity_exhausted']);
  await writeLease(f.claudeHome, {...(await readLease(f.claudeHome, a.dispatchId)), state: 'unknown'});
  third = await prepare(f, request('arc_tester'), {policy: policyWith()});
  assert.deepEqual(codes(third), ['capacity_exhausted']);
  assert.equal((await prepare(f, request('arc_planner'), {policy: policyWith()})).decision, 'allow');
  await writeLease(f.claudeHome, {...(await readLease(f.claudeHome, a.dispatchId)), state: 'completed'});
  assert.equal((await prepare(f, request('arc_tester'), {policy: policyWith()})).decision, 'allow');

  const g = await createRoutingFixture(t, {roles: {arc_tester: 'codex', arc_scouter: 'codex', arc_reviewer: 'codex'}, limits: {total: 3, concurrent: 5}});
  await okClis(g);
  for (const role of ['arc_scouter', 'arc_reviewer', 'arc_tester']) {
    const r = await prepare(g, request(role), {policy: policyWith()}); assert.equal(r.decision, 'allow', role);
    await writeLease(g.claudeHome, {...(await readLease(g.claudeHome, r.dispatchId)), state: 'completed'});
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
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex', arc_implementer: 'codex'}});
  await okClis(f);
  const deny = async assignment => { const r = await prepare(f, assignment); assert.equal(r.decision, 'deny', JSON.stringify(assignment)); assert.deepEqual(codes(r), ['invalid_request']); };
  await deny({role: 'arc_implementer', requestId: 'a1', taskId: 'a1'});
  for (const bad of [[], ['/abs/file'], ['../escape'], ['src/../../x'], [''], 'src/', [1]]) await deny({role: 'arc_implementer', requestId: 'a2', taskId: 'a2', allowedPaths: bad});
  await deny({role: 'arc_planner', requestId: 'a3', taskId: 'a3', allowedPaths: ['src/']});
  await deny({role: 'arc_scouter', requestId: 'a4', taskId: 'a4', allowedPaths: []});
  await deny({role: 'unknown_role', requestId: 'a5', taskId: 'a5'});
  await deny({role: 'arc_tester', requestId: '', taskId: 'a6'});
  assert.equal((await prepare(f, {role: 'arc_tester', requestId: 'ok1', taskId: 'ok1'})).decision, 'allow');
  assert.equal((await prepare(f, {role: 'arc_tester', requestId: 'ok2', taskId: 'ok2', allowedPaths: ['tests/', 'lib/a.mjs']})).decision, 'allow');
  const bad = await prepareRoleDispatch({context: f.context({hostPlatform: 'claude', executionEnvironment: 'codex-cli'}), assignment: request('arc_planner'), expectedRevision: f.revision, policy: policyWith()});
  assert.equal(bad.decision, 'deny');
  assert.equal(await leaseCount(f), 2);
});

test('EACCES on dispatch directory or lock maps to host_sandbox_blocked', async t => {
  skipRoot(t);
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  await fs.mkdir(dispatchDirectory(f.claudeHome), {mode: 0o700});
  await fs.chmod(dispatchDirectory(f.claudeHome), 0o500);
  try {
    const dirResult = await prepare(f, request('arc_tester'), {policy: policyWith()});
    assert.equal(dirResult.decision, 'hold');
    assert.deepEqual(codes(dirResult), ['host_sandbox_blocked']);
  } finally { await fs.chmod(dispatchDirectory(f.claudeHome), 0o700); }
  await fs.chmod(dispatchDirectory(f.claudeHome), 0o700);
  await fs.chmod(f.claudeHome, 0o500);
  try {
    const lockResult = await prepare(f, request('arc_tester'), {policy: policyWith()});
    assert.equal(lockResult.decision, 'hold');
    assert.deepEqual(codes(lockResult), ['host_sandbox_blocked']);
  } finally { await fs.chmod(f.claudeHome, 0o700); }
});

const writeForeignLock = async f => { const lock = path.join(f.claudeHome, 'arc-role-platform-routing.lock'); await fs.writeFile(lock, JSON.stringify({version: 1, operationId: 'other-operation', pid: 1, createdAt: new Date().toISOString()}) + '\n', {mode: 0o600}); return lock; };

test('lock busy beyond retry window holds activation_unverified with residual lock path and keeps the lock file', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const lock = await writeForeignLock(f), started = Date.now();
  const result = await prepare(f, request('arc_tester'), {policy: policyWith({lockRetryMs: 300})});
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
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const lock = await writeForeignLock(f);
  setTimeout(() => fs.unlink(lock).catch(() => {}), 300);
  const result = await prepare(f, request('arc_tester'), {policy: policyWith({lockRetryMs: 2000})});
  assert.equal(result.decision, 'allow');
});

test('prune failure does not change the decision and old terminal leases are pruned under the lock', async t => {
  skipRoot(t);
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const now = Date.parse('2026-06-30T00:00:00.000Z');
  const old = {version: 1, dispatchId: 'old', workflowId: 'wf-0', taskId: 'T0', requestId: 'req-old', role: 'arc_tester', route: 'bridge', hostPlatform: 'claude', executionEnvironment: 'claude-cli', revision: 'rev-0', profileHash: 'sha256:' + 'b'.repeat(64), argsDigest: null, state: 'completed', supervisor: null, child: null, sessionId: null, timeoutMinutes: 30, claims: null, reasons: [], allowedPaths: [], resultPath: null, segment: 0, nativeAgentId: null, createdAt: new Date(now - 40 * DAY).toISOString(), updatedAt: new Date(now - 40 * DAY).toISOString()};
  await createLease(f.claudeHome, old);
  const pruned = await routingStatus({context: f.context(), now, policy: policyWith()});
  assert.deepEqual(pruned.pruned, {removed: 1, errors: 0});
  assert.equal(await readLease(f.claudeHome, 'old'), null);
  await createLease(f.claudeHome, old);
  await fs.chmod(dispatchDirectory(f.claudeHome), 0o500);
  t.after(() => fs.chmod(dispatchDirectory(f.claudeHome), 0o700).catch(() => {}));
  const status = await routingStatus({context: f.context(), now, policy: policyWith()});
  assert.equal(status.decision, 'allow');
  assert.deepEqual(status.pruned, {removed: 0, errors: 1});
  await f.cli('codex', {auth: 'unauthorized', version: 'codex-cli 0.167.0'});
  const held = await prepare(f, request('arc_tester'), {now});
  assert.equal(held.decision, 'hold');
  assert.deepEqual(codes(held), ['Unauthorized']);
  await fs.chmod(dispatchDirectory(f.claudeHome), 0o700);
  const reallowed = await (async () => { await f.cli('codex', {version: 'codex-cli 0.167.0'}); return prepare(f, request('arc_tester'), {now}); })();
  assert.equal(reallowed.decision, 'allow');
  assert.equal(await readLease(f.claudeHome, 'old'), null);
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

async function snapshotTree(directory) {
  const snapshot = [];
  for (const name of (await fs.readdir(directory)).sort()) {
    const file = path.join(directory, name);
    snapshot.push([name, (await fs.lstat(file)).isDirectory() ? await snapshotTree(file) : await fs.readFile(file)]);
  }
  return snapshot;
}

test('prepare-dispatch rejects arc_qa without writes', async t => {
  const f = await legacyDispatchFixture(t);
  const {gitCommonDir} = await resolveWorktree(f.cwd);
  const workflows = path.join(gitCommonDir, 'arc', 'workflows');
  const workflow = path.join(workflows, 'wf-1');
  await fs.mkdir(workflow, {recursive: true});
  await fs.writeFile(path.join(workflow, 'state.json'), '{"revision":"untouched"}\n');
  const before = await snapshotTree(workflows);
  const beforeLeases = await snapshotTree(f.storeDir);
  for (const {hostPlatform} of legacyDispatchCases) {
    await t.test(hostPlatform, async () => {
      const input = {hostPlatform, executionEnvironment: hostPlatform + '-cli', role: 'arc_qa',
        expectedRevision: f.revision, requestId: 'old-request', taskId: 'old-task'};
      const {code, json, stderr} = await runCli(f, 'prepare-dispatch', input);
      assert.deepEqual(await snapshotTree(workflows), before);
      assert.deepEqual(await snapshotTree(f.storeDir), beforeLeases);
      assert.equal(code, 2, stderr);
      assert.equal(json.decision, 'deny');
      assert.equal(json.dispatchId, null);
      assert.deepEqual(codes(json), ['legacy_role_arc_qa']);
    });
  }
  const dispatchId = 'legacy-store';
  const file = await f.seed({dispatchId, role: 'arc_qa', hostPlatform: 'claude', targetPlatform: 'codex'});
  const legacy = JSON.parse(await fs.readFile(file, 'utf8'));
  await assert.rejects(createLease(f.claudeHome, {...legacy, dispatchId: 'new-lease'}), /legacy dispatch role/);
  await assert.rejects(fs.access(path.join(f.storeDir, 'new-lease.json')), {code: 'ENOENT'});
});

test('installed cli.mjs maps allow/hold/deny to exit 0/3/2', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
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
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex'}});
  await okClis(f);
  const first = await prepare(f, {role: 'arc_planner', requestId: 'shared-req', taskId: 'T-1'});
  assert.equal(first.decision, 'allow');
  const other = await prepare(f, {role: 'arc_scouter', requestId: 'shared-req', taskId: 'T-2'}, {context: f.context({workflowId: 'wf-other'})});
  assert.equal(other.decision, 'deny');
  assert.deepEqual(codes(other), ['duplicate_dispatch']);
  const sameTaskOtherWorkflow = await prepare(f, {role: 'arc_planner', requestId: 'fresh-req', taskId: 'T-1'}, {context: f.context({workflowId: 'wf-other'})});
  assert.equal(sameTaskOtherWorkflow.decision, 'allow');
  await writeLease(f.claudeHome, {...(await readLease(f.claudeHome, first.dispatchId)), state: 'completed'});
  assert.equal((await prepare(f, {role: 'arc_scouter', requestId: 'shared-req', taskId: 'T-3'}, {context: f.context({workflowId: 'wf-other'})})).decision, 'deny');
});

test('an unparsable lease file holds activation_unverified and points at the lease records', async t => {
  const f = await createRoutingFixture(t);
  await okClis(f);
  await fs.mkdir(dispatchDirectory(f.claudeHome), {mode: 0o700});
  await fs.writeFile(path.join(dispatchDirectory(f.claudeHome), 'broken.json'), '{nope');
  const result = await prepare(f, request('arc_planner'));
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['activation_unverified']);
  assert.match(result.reasons[0].releaseCondition, /arc-role-dispatch/);
  assert.match(result.reasons[0].releaseCondition, /lease/i);
});

test('Claude sandbox settings require both a passing G1 and a recorded object', async t => {
  const policyModule = await import('../../lib/runtime/role-dispatch-policy.mjs');
  assert.equal(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'fail'}, claudeSandboxSettings: {sandbox: {enabled: true}}}), null);
  assert.equal(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'pass'}, claudeSandboxSettings: {}}), null);
  assert.equal(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'pass'}, claudeSandboxSettings: null}), null);
  const recorded = {sandbox: {enabled: true}};
  assert.deepEqual(policyModule.effectiveClaudeSandboxSettings({gates: {G1: 'pass'}, claudeSandboxSettings: recorded}), recorded);
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_implementer: 'claude', arc_tester: 'claude', arc_planner: 'claude'}});
  await okClis(f);
  const noJson = policyWith({gates: {G1: 'pass', G2: 'pass'}, claudeSandboxSettings: null});
  for (const role of ['arc_implementer', 'arc_tester']) { const r = await prepare(f, request(role), {policy: noJson}); assert.equal(r.decision, 'hold', role); assert.deepEqual(codes(r), ['permission_scope_unverified'], role); }
  assert.equal((await prepare(f, request('arc_planner'), {policy: noJson})).decision, 'allow');
  const withJson = policyWith({gates: {G1: 'pass', G2: 'pass'}, claudeSandboxSettings: recorded});
  for (const role of ['arc_implementer', 'arc_tester']) assert.equal((await prepare(f, request(role), {policy: withJson})).decision, 'allow', role);
});

test('parallel prepare-dispatch calls create exactly one lease per duplicate key and never exceed bridge limits', async t => {
  const wide = policyWith({lockRetryMs: 15000});
  const f = await createRoutingFixture(t, {roles: {arc_tester: 'codex', arc_scouter: 'codex'}, limits: {total: 100, concurrent: 2}});
  await okClis(f);
  const taskRole = await Promise.all(Array.from({length: 6}, (_, i) => prepare(f, {role: 'arc_planner', requestId: `par-a-${i}`, taskId: 'T-par'}, {policy: wide})));
  assert.equal(taskRole.filter(r => r.decision === 'allow').length, 1);
  assert.ok(taskRole.filter(r => r.decision !== 'allow').every(r => r.decision === 'deny' || r.decision === 'hold'));
  assert.equal((await listLeases(f.claudeHome)).length, 1);
  const sameRequest = await Promise.all(Array.from({length: 6}, (_, i) => prepare(f, {role: 'arc_planner', requestId: 'par-b', taskId: `T-b-${i}`}, {policy: wide})));
  assert.equal(sameRequest.filter(r => r.decision === 'allow').length, 1);
  assert.equal((await listLeases(f.claudeHome)).length, 2);
  const bridges = await Promise.all(Array.from({length: 6}, (_, i) => prepare(f, {role: i % 2 ? 'arc_tester' : 'arc_scouter', requestId: `par-c-${i}`, taskId: `T-c-${i}`}, {policy: wide})));
  assert.equal(bridges.filter(r => r.decision === 'allow').length, 2);
  assert.ok(bridges.filter(r => r.decision !== 'allow').every(r => r.decision === 'hold' && codes(r).includes('capacity_exhausted')));
  assert.equal((await listLeases(f.claudeHome)).filter(lease => lease.route === 'bridge').length, 2);
});

test('parallel child processes reserve the same requestId exactly once', async t => {
  const f = await createRoutingFixture(t);
  await okClis(f);
  const input = {hostPlatform: 'claude', executionEnvironment: 'claude-cli', role: 'arc_planner', expectedRevision: f.revision, requestId: 'proc-1', taskId: 'T-proc'};
  const results = await Promise.all(Array.from({length: 4}, () => runCli(f, 'prepare-dispatch', input)));
  assert.equal(results.filter(r => r.json.decision === 'allow').length, 1, JSON.stringify(results.map(r => r.json)));
  assert.ok(results.filter(r => r.json.decision !== 'allow').every(r => [2, 3].includes(r.code)));
  assert.equal((await listLeases(f.claudeHome)).length, 1);
});

test('routing-status and prepare-dispatch report Unauthorized for a withheld Codex token without leaking token or error text',async t=>{
 const f=await createRoutingFixture(t,{roles:{arc_tester:'codex'}});await f.cli('claude',{version:'2.1.322'});
 for(const [authStatus,status,reason] of [['revoked','Unauthorized','token_rejected'],['chatgpt-ok','Available'],['error','Incomplete','status_command_failed']]) {
  await f.cli('codex',{authStatus,version:'codex-cli 0.167.0'});
  const value=await routingStatus({context:f.context(),policy:policyWith()});
  assert.deepEqual(value.platforms.codex.authentication,{status,...(reason?{reason}:{})});
  assert.doesNotMatch(JSON.stringify(value),/fixture-token-SECRET|refresh token/);
  if(status!=='Available') {
   const held=await prepare(f,request('arc_tester'));assert.equal(held.decision,'hold');assert.ok(codes(held).includes(status));
   assert.doesNotMatch(JSON.stringify(held),/fixture-token-SECRET|refresh token/);
  }
 }
 assert.equal(await leaseCount(f),0);
});

test('prepare holds permission_scope_unverified when allowedPaths cover a control file', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_implementer: 'codex', arc_tester: 'claude'}});
  await okClis(f);
  await t.test('native prepare allows a control-covering path', async () => {
    const result = await prepare(f, request('arc_tester', {allowedPaths: ['.claude/settings.json']}));
    assert.equal(result.route, 'native');
    assert.equal(result.decision, 'allow');
    assert.equal((await readLease(f.claudeHome, result.dispatchId)).state, 'reserved');
  });
  for (const entry of ['.claude/settings.json', '.git/hooks/', '.codex/config.toml']) {
    const result = await prepare(f, request('arc_implementer', {allowedPaths: [entry]}));
    assert.equal(result.decision, 'hold', entry);
    assert.ok(codes(result).includes('permission_scope_unverified'), entry);
    assert.equal(result.dispatchId, null, entry);
  }
  assert.equal(await leaseCount(f), 1);
});

test('buildBridgeInvocation rejects control-covering allowedPaths before reading the profile', async t => {
  const f = await createRoutingFixture(t, {roles: {arc_implementer: 'codex'}});
  await assert.rejects(buildBridgeInvocation({
    lease: {role: 'arc_implementer', allowedPaths: ['.claude/settings.json']},
    config: {roles: {arc_implementer: {platform: 'codex'}}},
    homes: {codex: path.join(f.codexHome, 'missing')},
  }), {reasonCode: 'permission_scope_unverified'});
});

test('prepare holds Claude writing bridges for widening settings at the worktree root', async t => {
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_implementer: 'claude', arc_planner: 'claude'}});
  await okClis(f);
  const cwd = path.join(f.cwd, 'src');
  await fs.mkdir(cwd);
  await fs.mkdir(path.join(f.cwd, '.claude'));
  await fs.writeFile(path.join(f.cwd, '.claude/settings.json'), '{"permissions":{"additionalDirectories":["../outside"]}}');
  const result = await prepare(f, request('arc_implementer'), {context: f.context({cwd})});
  assert.equal(result.route, 'bridge');
  assert.equal(result.decision, 'hold');
  assert.deepEqual(codes(result), ['permission_scope_unverified']);
  assert.equal(result.dispatchId, null);
  assert.equal(await leaseCount(f), 0);
});

test('prepare allows a native Claude writing role and a Claude read bridge with widening settings', async t => {
  for (const [hostPlatform, role, route] of [['claude', 'arc_implementer', 'native'], ['codex', 'arc_planner', 'bridge']]) {
    const f = await createRoutingFixture(t, {hostPlatform, roles: {[role]: 'claude'}});
    await okClis(f);
    await fs.mkdir(path.join(f.cwd, '.claude'));
    await fs.writeFile(path.join(f.cwd, '.claude/settings.json'), '{"permissions":{"additionalDirectories":["../outside"]}}');
    const result = await prepare(f, request(role));
    assert.equal(result.route, route);
    assert.equal(result.decision, 'allow');
    assert.equal((await readLease(f.claudeHome, result.dispatchId)).state, 'reserved');
  }
});

test('buildBridgeInvocation holds Claude Tester run and resume when local settings contain hooks', async t => {
  const f = await createRoutingFixture(t, {hostPlatform: 'codex', roles: {arc_tester: 'claude'}});
  await fs.mkdir(path.join(f.cwd, '.claude'));
  await fs.writeFile(path.join(f.cwd, '.claude/settings.local.json'), '{"hooks":{}}');
  for (const segment of [0, 1]) {
    await assert.rejects(buildBridgeInvocation({
      lease: {role: 'arc_tester', segment}, config: f.config, homes: f.homes, worktree: f.cwd,
    }), {reasonCode: 'permission_scope_unverified', message: /settings\.local\.json.*hooks/});
  }
});
