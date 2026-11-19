import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const harnesses = {claude: 'claude/skill/references/', codex: 'codex/skill/references/'};
const read = (harness, file) => readFile(new URL('../../' + harnesses[harness] + file, import.meta.url), 'utf8');
const section = text => {
  const start = text.indexOf('## Composite Platform Role Dispatch');
  if (start < 0) return '';
  const rest = text.slice(start + 1);
  const end = rest.search(/\n(?:<a id=|## |# )/);
  return end < 0 ? text.slice(start) : text.slice(start, start + 1 + end);
};
const normalize = body => body.replaceAll(/Claude/g, '@A').replaceAll(/Codex/g, '@B').replaceAll(/claude/g, '@a').replaceAll(/codex/g, '@b')
  .split(/\n+|(?<=[.!?])\s+/).map(line => line.trim()).filter(Boolean).map(line => line.replaceAll('@A', '<P1>').replaceAll('@B', '<P2>').replaceAll('@a', '<p1>').replaceAll('@b', '<p2>')).sort();

for (const harness of Object.keys(harnesses)) {
  test(`${harness} skill places the role routing gate immediately after the role gate and before shared terms`, async () => {
    const skill = await readFile(new URL(`../../${harness}/skill/SKILL.md`, import.meta.url), 'utf8');
    const gate = '**Role routing gate:** Before any specialist creation or assignment, check whether `../../arc-role-platform-routing.prepared.json` exists relative to this skill directory. If it exists, run `routing-status` and follow [coordination](references/coordination.md#composite-platform-role-dispatch) for every role, using only the returned native profile or bridge. NEVER substitute a generic or built-in agent (for example `general-purpose`, `fork` or `default`), an `arc-<role>`/`arc_<role>` name, another model or another platform. If routing is unavailable, held or unverified, hold that role and report it. Without the marker, use the standalone role names.';
    assert.ok(skill.includes(gate), `${harness} missing approved Role routing gate`);
    const roleGate = skill.split('\n').find(line => line.startsWith('**Role gate:**'));
    assert.ok(roleGate && skill.includes(`${roleGate}\n\n${gate}\n\n`), `${harness} routing gate must directly follow Role gate`);
    assert.ok(skill.indexOf(gate) < skill.indexOf('## Shared terms'), `${harness} routing gate must precede Shared terms`);
  });

  test(`${harness} skill records the pre-action gate after routing and links planning judgments`, async () => {
    const skill = await readFile(new URL(`../../${harness}/skill/SKILL.md`, import.meta.url), 'utf8');
    const gate = "**Pre-action gate record:** Before a task's first specialist creation or assignment, its first repository edit, or any decision to skip the Planner design stage, read the applicable references first, then post one line in a user-visible progress message with `mode` (standalone, or composite with routing revision), `run` (Run mode in effect: `supervised` or `full-auto`), `class` (work type), `path` (direct with all F1–F8 proven, Spike, Bounded or Architectural), `design` (Planner design required, approved or omitted, and why), `depth` (plan required, or the omission reason), `risk` (level and reason) and `refs` (reference sections actually read). A field that a later stage decides (for example `path` or `depth` before Planner design) is recorded as `pending` with that stage; for work with no edits or design, such as Scouter-only research, `path`, `design` and `depth` are `n/a` with the reason; any other empty or unverified field holds that action. Post a new line when a recorded fact changes. Feature, behavior and bug-fix implementation starts with Planner design unless the direct path is selected with all F1–F8 proven.";
    assert.ok(skill.includes(gate), `${harness} missing approved Pre-action gate record`);
    const routingGate = skill.split('\n').find(line => line.startsWith('**Role routing gate:**'));
    assert.ok(routingGate && skill.includes(`${routingGate}\n\n${gate}\n\n`), `${harness} pre-action gate must directly follow Role routing gate`);
    assert.ok(skill.indexOf(gate) < skill.indexOf('## Shared terms'), `${harness} pre-action gate must precede Shared terms`);
    const planning = await read(harness, 'planning.md');
    assert.ok(planning.includes('4. Record dependencies/depth reasons; also post the design path, depth and risk judgments in the SKILL.md Pre-action gate record.'), `${harness} planning must link judgments to Pre-action gate record`);
  });
}

test('execution mode precedes standalone names and forbids standalone names in composite mode', async () => {
  const paragraphs = {};
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    const mode = text.indexOf('### Execution mode'), standalone = text.indexOf(harness === 'claude' ? 'Standalone native names:' : 'Standalone aliases:');
    const composite = text.indexOf('Composite native names'), adapter = text.indexOf('<a id="instruction-and-execution-adapter"');
    assert.ok(mode > 0 && mode < standalone && standalone < composite && composite < adapter, harness);
    assert.ok(text.includes('NEVER invoke `arc-<role>` or `arc_<role>` names in this mode, even if they are listed.'), harness);
    assert.ok(text.includes('`../../arc-role-platform-routing.prepared.json`'), harness);
    assert.doesNotMatch(text, /Claude native names:|\nAliases:/);
    paragraphs[harness] = text.slice(mode, standalone);
    const skill = await readFile(new URL(`../../${harness}/skill/SKILL.md`, import.meta.url), 'utf8');
    assert.doesNotMatch(skill.split('\n').find(l => l.startsWith('**Role gate:**')), /`arc[-_]planner`/);
  }
  assert.equal(paragraphs.claude, paragraphs.codex);
});

test('both coordination references define Composite Platform Role Dispatch with the six commands, native names and planning link', async () => {
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    assert.doesNotMatch(text, /Composite Platform Role Preflight/);
    const body = section(text);
    assert.ok(body, harness + ' section missing');
    for (const command of ['routing-status', 'prepare-dispatch', 'run-dispatch', 'observe', 'resume', 'cancel']) assert.ok(body.includes('`' + command + '`') || body.includes(command + ' '), harness + ' ' + command);
    assert.ok(body.includes(harness === 'claude' ? 'arc-routing-' : 'arc_routing_'), harness + ' native name');
    assert.match(body, /planning\.md#approved-cooperative-execution-path-within-the-repository/);
    // exact input keys
    for (const key of ['hostPlatform', 'executionEnvironment', 'expectedRevision', 'requestId', 'taskId', 'allowedPaths', 'dispatchId', 'brief', 'waitMs', 'event', 'nativeAgentId']) assert.ok(body.includes('`' + key), harness + ' key ' + key);
    // exit codes, gates, limits
    assert.match(body, /allow 0, deny 2, hold 3, error 1/);
    for (const needle of ['permission_scope_unverified', 'host_sandbox_blocked', 'delegation_observed', 'environment_unverified', 'native_profile_reload_unverified', 'new session', 'model argument', 'rev ', 'Active bridge dispatches', 'CLI versions are not restricted', '60 minutes', '30 minutes', '20 minutes', '30 days', 'cancelling', 'terminal_state_unverified', 'completed` or `failed']) assert.ok(body.includes(needle), harness + ' needle ' + needle);
    assert.match(body, /no automatic (?:fallback|substitution)/i);
    assert.match(body, /short polling loop/i);
    assert.match(body, /each (?:call|time)[^.]*escalation|escalation approval[^.]*each/i);
    assert.match(body, /manual cleanup/i);
    assert.match(body, /never (?:deleted|released) automatically|does not (?:delete|release)[^.]*automatically/i);
    const names = text.slice(0, text.indexOf('<a id="instruction-and-execution-adapter"')).match(/Composite native names[^\n]*/);
    assert.ok(names && names[0].includes('arc-routing-<suffix>') && names[0].includes('arc_routing_<suffix>'), harness + ' native name mapping near ownership names');
  }
});

test('the two harness sections state the same rules', async () => {
  const [claude, codex] = await Promise.all(['claude', 'codex'].map(async harness => normalize(section(await read(harness, 'coordination.md')))));
  assert.ok(claude.length > 10);
  assert.deepEqual(claude, codex);
});

test('both harnesses require escalation for every runtime command as an Orchestrator obligation', async () => {
  const expected = '- On a Codex host ask the user for escalation approval each time any runtime command (`routing-status`, `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`) runs, because each may write `CODEX_HOME`. The runtime does not check this approval; asking for it is an Orchestrator obligation. Without approval or on failure the result is `host_sandbox_blocked`.';
  const lines = [];
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    const line = text.split('\n').find(line => line.startsWith('- On a Codex host ask the user for escalation approval'));
    assert.equal(line, expected, harness);
    assert.ok(line.includes('`routing-status`'));
    assert.ok(line.includes('Orchestrator obligation'));
    lines.push(line);
  }
  assert.equal(lines[0], lines[1]);
});

test('every harness states the same Grok host approval obligation', async () => {
  const expected = '- On a Grok host start the session with `grok --permission-mode default` (ask), keep the platform-default sandbox off, and ask the user for approval each time any runtime command (`routing-status`, `prepare-dispatch`, `run-dispatch`, `observe`, `resume`, `cancel`) runs; NEVER use auto-review, `--always-approve` or `--yolo`, and DO NOT choose `Always allow`, which saves `permission_mode = "always-approve"` to the Grok config. Spawn with `spawn_subagent` only roles whose route is `native`; Grok can also list Claude `arc-routing-*` profiles, which remain bridge roles. The runtime does not check this approval; asking for it is an Orchestrator obligation. A host whose sandbox is on, or a denied write, is `host_sandbox_blocked`.';
  for (const harness of ['claude', 'codex', 'gemini', 'grok']) {
    const text = await readFile(new URL(`../../${harness}/skill/references/coordination.md`, import.meta.url), 'utf8');
    const body = section(text);
    assert.ok(body.includes('`grok-cli`'), harness + ' Grok host environment');
    const lines = body.split('\n').filter(line => line.startsWith('- On a Grok host start the session'));
    assert.deepEqual(lines, [expected], harness);
  }
});

test('every harness states the same host home probe rule', async () => {
  const expected = '- On a Grok or Gemini host, bridge `prepare-dispatch`, `run-dispatch` and `resume` first check that the target platform home is writable: a denied write is `host_sandbox_blocked`, a missing home is `activation_unverified`, and a probe file that cannot be removed is reported in `residualPaths`.';
  for (const harness of ['claude', 'codex', 'gemini', 'grok']) {
    const text = await readFile(new URL(`../../${harness}/skill/references/coordination.md`, import.meta.url), 'utf8');
    const lines = section(text).split('\n').filter(line => line.startsWith('- On a Grok or Gemini host, bridge'));
    assert.deepEqual(lines, [expected], harness);
  }
});

test('incorrect statements are removed', async () => {
  for (const harness of Object.keys(harnesses)) {
    const text = await read(harness, 'coordination.md');
    assert.doesNotMatch(text, /does not[^.]*start the peer CLI/);
    assert.doesNotMatch(text, /this command holds before launch with reason `execution_identity_unverified`/);
    assert.doesNotMatch(text, /held \/ unverified/);
    const body = section(text);
    assert.match(body, /`execution_identity_unverified`[^.]*observe[^.]*resume/);
    assert.match(body, /authentication and version probes? (?:start|run|execute)s? (?:a )?child process/i);
  }
});

test('limits and handoff references mention bridge counting, unknown slot retention, fixed timeouts, 30-day pruning, resultPath and stdin-only brief', async () => {
  for (const harness of Object.keys(harnesses)) {
    const limits = await read(harness, 'limits.md');
    assert.doesNotMatch(limits, /Current role routing is held before reservation/);
    for (const needle of ['bridge dispatch', 'ledger', '`max_concurrent_subagents`', '`max_total_subagents`', '`unknown`', 'slot', '60 minutes', '30 minutes', '20 minutes', '30 days']) assert.ok(limits.includes(needle), harness + ' limits ' + needle);
    const handoff = await read(harness, 'handoff.md');
    for (const needle of ['`resultPath`', 'stdin', 'fixed brief order']) assert.ok(handoff.includes(needle), harness + ' handoff ' + needle);
    assert.match(handoff, /bridge[^.]*final message[^.]*`resultPath`|`resultPath`[^.]*final message/i);
    assert.match(handoff, /stdin only|only (?:through|via|on) stdin|stdin-only/i);
  }
});

test('operations return current routing status messages', async t => {
  const {compositeContext,publish}=await import('./fixtures/install-mode.mjs');
  const result=await publish(await compositeContext(t));
  assert.equal(result.code,0,JSON.stringify(result));
  assert.deepEqual(result.messages,['Mixed routing on: Claude + Codex.','After upgrading ARC, run Configure again.']);
});

test('instruction facts match the runtime behavior (observe keys, Desktop, G2, G3, versions, cancel, resume, brief)', async () => {
  for (const harness of Object.keys(harnesses)) {
    const body = section(await read(harness, 'coordination.md'));
    assert.match(body, /`nativeAgentId` is required with `started` and forbidden with every other event/);
    assert.doesNotMatch(body, /is recorded\.|until the manual checklist/);
    assert.match(body, /Desktop[^.]*held as `environment_unverified` in this release/);
    assert.match(body, /every role \(native and bridge\) is held as `environment_unverified` in this release/);
    assert.match(body, /checklist[^.]*future ARC update/);
    assert.match(body, /CODEX_HOME[^.]*denied[^.]*\(G2\)[^.]*not held in advance[^.]*per-call escalation approval[^.]*refused approval or a denied write is `host_sandbox_blocked`/);
    assert.doesNotMatch(body, /conservatively held|currently held/);
    assert.match(body, /detached[^.]*survival[^.]*observed under variant conditions/i);
    assert.match(body, /re-delegation of a Codex child is not blocked[^.]*`delegation_observed`/);
    assert.match(body, /`execution_identity_unverified`[^.]*recorded by the supervisor after exit[^.]*exposed by `observe`[^.]*`resume` holds/);
    assert.doesNotMatch(body, /reason of the `run-dispatch`/);
    assert.match(body, /reused PID or missing child information[^.]*left unchanged[^.]*hold/);
    assert.doesNotMatch(body, /keeps the lease `unknown`/);
    const limits = await read(harness, 'limits.md');
    assert.match(limits, /`resume` rechecks only `max_concurrent_subagents`[^.]*does not increase/);
    const handoff = await read(harness, 'handoff.md');
    assert.match(handoff, /dispatches\/<dispatchId>\/brief\.md`[^.]*0600/);
    assert.match(handoff, /audit/);
  }
  const operations = await readFile(new URL('../../lib/management/operations.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(operations, /cooperative-[89]/, 'operations.mjs must not hardcode the runtime version');
});

test('execution environment rules use the actual session and agree byte-for-byte across harnesses', async () => {
  const rules = [];
  for (const harness of Object.keys(harnesses)) {
    const body = section(await read(harness, 'coordination.md'));
    const rule = body.match(/Choose `executionEnvironment` by where the session actually runs:.*When unsure, declare the CLI value\./)?.[0];
    assert.ok(rule, harness + ' execution environment rule missing');
    rules.push(rule);
    assert.doesNotMatch(body, /`supportStatus` stays `unverified`/);
  }
  assert.equal(rules[0], rules[1]);
  for (const text of rules) {
    assert.match(text, /terminal CLI or TUI session.*IDE integrated terminal.*`codex-cli`, `claude-cli` or `grok-cli`/);
    assert.match(text, /Desktop values apply only to Codex and Claude\. Use them only for a session confirmed to run inside the corresponding Desktop app\./);
    assert.match(text, /NEVER infer the environment from paths or directory names/);
    assert.match(text, /When unsure, declare the CLI value/);
  }
});

test('follow-up facts: reserved native cancel, Codex bridge permission cap, ref detection limits, bridge-child guard, and G1 scope', async () => {
  for (const harness of Object.keys(harnesses)) {
    const body = section(await read(harness, 'coordination.md'));
    assert.match(body, /`reserved` lease \(native or bridge\) becomes `cancelled` at once/);
    assert.match(body, /`cancelled` event is also accepted for a `reserved` native lease/);
    assert.match(body, /Codex bridge[^.]*`permissions` claim is at most `operator-attested`[^.]*`user-config-mcp-not-controlled`/);
    assert.match(body, /Branch, tag and other ref creation, deletion or movement during a run is a `permission_violation_observed`/);
    assert.match(body, /Changes to Git-ignored paths are outside post-run detection/);
    assert.match(body, /`ARC_BRIDGE_CHILD`[^.]*routing commands are denied/);
    assert.match(body, /re-running `codex exec` or `claude -p` through a shell is not a detected `delegation_observed`/i);
    assert.match(body, /orphaned process group[^.]*reaped/);
    assert.match(body, /Claude bridge `arc_implementer` and `arc_qa` on a Codex host run with recorded sandbox settings and are held as `permission_scope_unverified` only when an injected G1 fails or settings are missing \(G1\)/);
    assert.doesNotMatch(body, /`claude-cli` hosts are supported\./);
  }
});
