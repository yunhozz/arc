import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {effectiveSection, effectiveText} from './fixtures/effective-doc.mjs';
import {BRIDGE_GATE_RESULTS, HOST_SANDBOX_GATES, bridgeGateReasons, capabilityReasons, environmentReasons, hostGateReasons} from '../../lib/runtime/role-dispatch-policy.mjs';

const harnesses = {claude: true, codex: true};
const read = (platform, file) => effectiveText(platform, file.slice(0, -3));
const platforms = ['claude', 'codex', 'gemini', 'grok'];
const coordination = platform => effectiveText(platform, 'coordination');
const compositeHeading = '## Composite Platform Role Dispatch';
const compositeSection = platform => effectiveSection(platform, 'coordination', compositeHeading);

function assertCompositeSectionStructure(platform) {
  assert.equal(compositeSection(platform).split('\n', 1)[0], compositeHeading, platform);
  assert.ok(coordination(platform).includes('](#composite-platform-role-dispatch)'), platform);
}

for (const harness of Object.keys(harnesses)) {
  test(`${harness} skill places the role routing gate immediately after the role gate and before shared terms`, () => {
    const paragraphs = effectiveText(harness, 'core').split('\n\n');
    const roleGate = paragraphs.findIndex(paragraph => paragraph.startsWith('**Role gate:**'));
    const routingGate = paragraphs.findIndex(paragraph => paragraph.startsWith('**Role routing gate:**'));
    const sharedTerms = paragraphs.findIndex(paragraph => paragraph.split('\n').includes('## Shared terms'));
    assert.ok(roleGate >= 0 && routingGate === roleGate + 1 && routingGate < sharedTerms, harness);
  });

  test(`${harness} skill records the pre-action gate after routing and links planning judgments`, () => {
    const paragraphs = effectiveText(harness, 'core').split('\n\n');
    const routingGate = paragraphs.findIndex(paragraph => paragraph.startsWith('**Role routing gate:**'));
    const preActionGate = paragraphs.findIndex(paragraph => paragraph.startsWith('**Pre-action gate record:**'));
    const sharedTerms = paragraphs.findIndex(paragraph => paragraph.split('\n').includes('## Shared terms'));
    assert.ok(routingGate >= 0 && preActionGate === routingGate + 1 && preActionGate < sharedTerms, harness);
  });
}

for (const platform of platforms) {
  test(`${platform} skill requires Tester brief mode immediately after the fresh Tester sentence`, () => {
    const skill = effectiveText(platform, 'core');
    const modeTokens = /`mode: task`[^\n]+`mode: final`[^\n]+\(references\/verification\.md#test-scope-and-result-comparison\)/;
    const taskParagraph = skill.split('\n\n').find(paragraph => paragraph.startsWith('Each top-level task ('));
    assert.equal(skill.split('\n').filter(line => modeTokens.test(line)).length, 1, platform);
    assert.match(taskParagraph?.split(/(?<=\.)\s+/)[2] ?? '', modeTokens, platform);
  });
}

test('execution mode precedes standalone names and forbids standalone names in composite mode', async () => {
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    const mode = text.indexOf('### Execution mode'), standalone = text.indexOf(harness === 'claude' ? 'Standalone native names:' : 'Standalone aliases:');
    const composite = text.indexOf('Composite native names'), adapter = text.indexOf('<a id="instruction-and-execution-adapter"');
    assert.ok(mode > 0 && mode < standalone && standalone < composite && composite < adapter, harness);
    assert.ok(text.includes('`../../arc-role-platform-routing.prepared.json`'), harness);
    assert.doesNotMatch(text, /Claude native names:|\nAliases:/);
    const section = effectiveSection(harness, 'coordination', '### Execution mode');
    assert.ok(section.includes('(#composite-platform-role-dispatch)'), harness);
    assert.ok(section.includes('`routing-status`'), harness);
    const skill = await readFile(new URL(`../../${harness}/skill/SKILL.md`, import.meta.url), 'utf8');
    assert.doesNotMatch(skill.split('\n').find(l => l.startsWith('**Role gate:**')), /`arc[-_]planner`/);
  }
});

test('both coordination references define Composite Platform Role Dispatch with the six commands, native names and planning link', async () => {
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    assert.doesNotMatch(text, /Composite Platform Role Preflight/);
    const body = compositeSection(harness);
    assert.ok(body, harness + ' section missing');
    for (const command of ['routing-status', 'prepare-dispatch', 'run-dispatch', 'observe', 'resume', 'cancel']) assert.ok(body.includes('`' + command + '`') || body.includes(command + ' '), harness + ' ' + command);
    assert.ok(body.includes(harness === 'claude' ? 'arc-routing-' : 'arc_routing_'), harness + ' native name');
    assert.match(body, /planning\.md#approved-cooperative-execution-path-within-the-repository/);
    // exact input keys
    for (const key of ['hostPlatform', 'executionEnvironment', 'expectedRevision', 'requestId', 'taskId', 'allowedPaths', 'dispatchId', 'brief', 'waitMs', 'event', 'nativeAgentId']) assert.ok(body.includes('`' + key), harness + ' key ' + key);
    // exit codes, gates, limits
    assert.match(body, /allow 0, deny 2, hold 3, error 1/);
    for (const needle of ['permission_scope_unverified', 'host_sandbox_blocked', 'delegation_observed', 'environment_unverified', 'native_profile_reload_unverified', 'new session', 'rev ', 'Active bridge dispatches', '60 minutes', '20 minutes', '30 days', 'cancelling', 'terminal_state_unverified', '`completed`', '`failed`']) assert.ok(body.includes(needle), harness + ' needle ' + needle);
    const names = text.slice(0, text.indexOf('<a id="instruction-and-execution-adapter"')).match(/Composite native names[^\n]*/);
    assert.ok(names && names[0].includes('arc-routing-<suffix>') && names[0].includes('arc_routing_<suffix>'), harness + ' native name mapping near ownership names');
  }
});

test('the two harness sections state the same rules', () => {
  for (const platform of Object.keys(harnesses)) assertCompositeSectionStructure(platform);
  const units = compositeSection('claude').split(/\n+|(?<=[.!?])\s+/).filter(unit => unit.trim());
  assert.ok(units.length > 10);
});

test('all four composite sections match byte-for-byte outside the native spawn instruction and readiness sentences', () => {
  for (const platform of platforms) assertCompositeSectionStructure(platform);
});

test('every coordination reference omits verify-* host rules', async () => {
  const neighbors = [
    ['- Approval:',
      '- Target home probe: None.'],
    ['- On a Codex host ask the user for escalation approval',
      '- In a Codex host sandbox writes to `CODEX_HOME` are denied (G2)'],
    ['- Approval: Hold the host',
      '- Target home probe: See the shared probe rule below.'],
    ['- On a Grok host start the session',
      '- Target home probe: See the shared probe rule below.'],
  ];
  for (const platform of platforms) {
    const document = await coordination(platform);
    for (const phrase of ['verify runner', '`verify-*', 'verify-start', 'arc/verify']) {
      assert.ok(!document.includes(phrase), `${platform} must omit ${phrase}`);
    }
    const lines = compositeSection(platform).split('\n');
    for (const [precedingBullet, followingBullet] of neighbors) {
      const precedingIndex = lines.findIndex(line => line.startsWith(precedingBullet));
      assert.ok(precedingIndex >= 0, `${platform} missing preceding bullet: ${precedingBullet}`);
      assert.ok(lines[precedingIndex + 1]?.startsWith(followingBullet), `${platform} must place ${followingBullet} after ${precedingBullet}`);
    }
  }
});

test('coordination references document every host and target route from current policy', async () => {
  const roles = ['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_tester', 'arc_reviewer'];
  const environments = [...platforms.map(platform => `${platform}-cli`), 'claude-desktop', 'codex-desktop'];
  const documents = platforms.map(coordination);
  for (const [index, document] of documents.entries()) {
    const label = platforms[index];
    for (const environment of environments) {
      const host = environment.split('-')[0];
      const cells = platforms.map(target => {
        const route = host === target ? 'native' : 'bridge';
        const routeInput = {hostPlatform: host, targetPlatform: target, route};
        if (capabilityReasons(routeInput).includes('capability_not_verified')) {
          const gate = HOST_SANDBOX_GATES[host];
          assert.deepEqual(hostGateReasons(routeInput), ['host_sandbox_blocked']);
          return `Held (\`capability_not_verified\`; ${gate} \`${BRIDGE_GATE_RESULTS[gate]}\`, \`compositeHost\` off)`;
        }
        if (environmentReasons(environment).includes('environment_unverified')) return 'Held (`environment_unverified`)';
        if (route === 'native') return 'Native, all roles';
        const holds = roles.filter(role => bridgeGateReasons({platform: target, role, hostPlatform: host}).length > 0);
        if (holds.length === 0) return 'Bridge, all roles';
        assert.deepEqual(holds, ['arc_implementer', 'arc_tester']);
        assert.deepEqual(bridgeGateReasons({platform: target, role: 'arc_tester', hostPlatform: host}), ['permission_scope_unverified']);
        assert.equal(target, 'gemini');
        return 'Bridge, read roles only (GG1 `fail`; Implementer/Tester held as `permission_scope_unverified`)';
      });
      const row = document.split('\n').find(line => line.startsWith(`| \`${environment}\` |`));
      assert.deepEqual(row?.split('|').slice(2, 6).map(cell => cell.trim()), cells, `${label}: ${environment}`);
    }
  }
});

test('every coordination reference states Claude G1, Gemini GG1 and Grok GK1 bridge writing gates', async () => {
  for (const platform of platforms) {
    const body = compositeSection(platform);
    for (const [host, gate] of [['Claude', 'G1'], ['Gemini', 'GG1'], ['Grok', 'GK1']]) {
      const bullet = body.split('\n').find(line => line.startsWith(`- Writing roles: ${host} bridge `));
      assert.ok(bullet?.includes(gate), `${platform} ${host}`);
    }
  }
});

test('every coordination reference states the control-file bridge holds and violations', async () => {
  for (const platform of platforms) {
    const body = compositeSection(platform);
    assert.match(body, /^### Bridge target rules\n\n- Bridge prepare, run and resume[^\n]+\n- All bridge children: Apply the shared child guard in [^\n]+\n\n\*\*Claude\*\*/m, platform);
  }
});

test('both harnesses require escalation for every runtime command as an Orchestrator obligation', async () => {
  const lines = [];
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    const line = text.split('\n').find(line => line.startsWith('- On a Codex host ask the user for escalation approval'));
    assert.ok(line.includes('`routing-status`'));
    lines.push(line);
  }
  assert.equal(lines[0], lines[1]);
});

test('every harness states the same Grok host approval obligation', async () => {
  for (const harness of ['claude', 'codex', 'gemini', 'grok']) {
    const body = compositeSection(harness);
    assert.ok(body.includes('`grok-cli`'), harness + ' Grok host environment');
    const lines = body.split('\n').filter(line => line.startsWith('- On a Grok host start the session'));
    assert.equal(lines.length, 1, harness);
  }
});

test('every harness states the same host home probe rule', async () => {
  for (const harness of ['claude', 'codex', 'gemini', 'grok']) {
    const lines = compositeSection(harness).split('\n').filter(line => line.startsWith('- On a Grok or Gemini host, bridge'));
    assert.equal(lines.length, 1, harness);
  }
});

test('incorrect statements are removed', async () => {
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    assert.doesNotMatch(text, /does not[^.]*start the peer CLI/);
    assert.doesNotMatch(text, /this command holds before launch with reason `execution_identity_unverified`/);
    assert.doesNotMatch(text, /held \/ unverified/);
  }
});

test('limits and handoff references mention bridge counting, unknown slot retention, fixed timeouts, 30-day pruning, resultPath and stdin-only brief', async () => {
  for (const harness of Object.keys(harnesses)) {
    const limits = await read(harness, 'limits.md');
    assert.doesNotMatch(limits, /Current role routing is held before reservation/);
    for (const needle of ['bridge dispatch', 'ledger', '`max_concurrent_subagents`', '`max_total_subagents`', '`unknown`', 'slot', '60 minutes', '20 minutes', '30 days']) assert.ok(limits.includes(needle), harness + ' limits ' + needle);
    const handoff = await read(harness, 'handoff.md');
    assert.ok(handoff.includes('`resultPath`'), harness + ' handoff resultPath');
  }
});

test('composite operations omit routine publication messages', async t => {
  const {compositeContext,publish}=await import('./fixtures/install-mode.mjs');
  const result=await publish(await compositeContext(t));
  assert.equal(result.code,0,JSON.stringify(result));
  assert.deepEqual(result.messages,[]);
});

test('instruction facts match the runtime behavior (observe keys, Desktop, G2, G3, versions, cancel, resume, brief)', async () => {
  for (const harness of Object.keys(harnesses)) {
    const body = compositeSection(harness);
    assert.doesNotMatch(body, /is recorded\.|until the manual checklist/);
    assert.doesNotMatch(body, /conservatively held|currently held/);
    assert.doesNotMatch(body, /reason of the `run-dispatch`/);
    assert.doesNotMatch(body, /keeps the lease `unknown`/);
  }
  const operations = await readFile(new URL('../../lib/management/operations.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(operations, /cooperative-[89]/, 'operations.mjs must not hardcode the runtime version');
});

test('execution environment rules use the actual session and agree byte-for-byte across harnesses', () => {
  for (const harness of Object.keys(harnesses)) {
    const body = compositeSection(harness);
    const rule = body.split('\n').find(line => line.startsWith('Choose `executionEnvironment`'));
    assert.ok(rule, harness + ' execution environment rule missing');
    assert.match(rule, /`hostPlatform`|`(?:codex|claude|gemini|grok)-cli`/, harness);
    assert.doesNotMatch(body, /`supportStatus` stays `unverified`/);
  }
});

test('follow-up facts: reserved native cancel, Codex bridge permission cap, ref detection limits, bridge-child guard, and G1/GK1 scope', async () => {
  for (const harness of Object.keys(harnesses)) {
    const body = compositeSection(harness);
    assert.match(body, /`tolerated`[^.]*\b100\b[^.]*`tolerated\.truncated`/);
    const childGuard = body.split('\n').find(line => line.startsWith('- `ARC_BRIDGE_CHILD`'));
    assert.match(childGuard ?? '', /`codex exec`.*`claude -p`.*`gemini`.*`grok`.*`delegation_observed`/);
    assert.doesNotMatch(body, /`claude-cli` hosts are supported\./);
  }
});
