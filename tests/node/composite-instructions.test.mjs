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
    for (const needle of ['permission_scope_unverified', 'host_sandbox_blocked', 'delegation_observed', 'environment_unverified', 'native_profile_reload_unverified', 'new session', 'model argument', 'rev ', 'Active bridge dispatches', '>=2.1.322 <2.2.0', '>=0.167.0 <0.168.0', '60 minutes', '30 minutes', '20 minutes', '30 days', 'cancelling', 'terminal_state_unverified', 'completed` or `failed']) assert.ok(body.includes(needle), harness + ' needle ' + needle);
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

test('operations source and docs no longer report held / unverified and describe migration and support grades', async () => {
  const operations = await readFile(new URL('../../lib/management/operations.mjs', import.meta.url), 'utf8');
  assert.ok(!operations.includes('held / unverified'));
  assert.ok(operations.includes('Role execution: per-role status via routing-status.'));
  const docs = await readFile(new URL('../../docs/harness-operation.md', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /Every role remains `held \/ unverified`/);
  assert.doesNotMatch(docs, /All current composite role routes remain `held \/ unverified`/);
  for (const text of [docs, readme]) { assert.match(text, /cooperative-7/); assert.match(text, /Install \/ Update/); }
  for (const needle of ['claude-cli', 'codex-cli', 'codex-desktop', 'claude-desktop', 'host_sandbox_blocked', 'permission_scope_unverified', 'environment_unverified']) assert.ok(docs.includes(needle), 'docs ' + needle);
  for (const needle of ['host CLI discovery', 'authentication sharing', 'same worktree', 'supervisor survival', 'escalation', 'native tag']) assert.ok(docs.includes(needle), 'checklist ' + needle);
});

test('instruction facts match the runtime behavior (observe keys, Desktop, G2, G3, versions, cancel, resume, brief)', async () => {
  for (const harness of Object.keys(harnesses)) {
    const body = section(await read(harness, 'coordination.md'));
    assert.match(body, /`nativeAgentId` is required with `started` and forbidden with every other event/);
    assert.doesNotMatch(body, /is recorded\.|until the manual checklist/);
    assert.match(body, /Desktop[^.]*held as `environment_unverified` in this release/);
    assert.match(body, /every role \(native and bridge\) is held as `environment_unverified` in this release/);
    assert.match(body, /checklist[^.]*future ARC update/);
    assert.match(body, /CODEX_HOME[^.]*denied[^.]*\(G2\)[^.]*conservatively[^.]*`host_sandbox_blocked`/);
    assert.match(body, /detached[^.]*survival[^.]*observed under variant conditions/);
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
  const docs = await readFile(new URL('../../docs/harness-operation.md', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  for (const text of [docs, readme]) { assert.doesNotMatch(text, /until the manual checklist/); assert.match(text, /future ARC update/); assert.match(text, /every role \(native and bridge\)/); assert.doesNotMatch(text, /Desktop bridge dispatch|Desktop[^.]*bridge dispatch is held/); }
  assert.match(docs, /every plan-mode command of an existing workflow, including status, holds with `cooperative\.versions`/);
  assert.match(docs, /only results are recorded[^.]*`versions-changed`[^.]*unresolved/);
  assert.match(docs, /no automatic migration/);
  const operations = await readFile(new URL('../../lib/management/operations.mjs', import.meta.url), 'utf8');
  assert.ok(!operations.includes('cooperative-7'), 'operations.mjs must read the runtime version instead of hardcoding it');
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
    assert.match(body, /Claude bridge `arc_implementer` and `arc_qa` on a Codex host[^.]*? are held as `permission_scope_unverified`[^.]*\(G1\)/);
    assert.doesNotMatch(body, /`claude-cli` hosts are supported\./);
  }
  const docs = await readFile(new URL('../../docs/harness-operation.md', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(docs, /\| `claude-cli` host \| Supported\. Claude bridge `arc_implementer`/);
  assert.doesNotMatch(readme, /`claude-cli` hosts are supported \(Claude bridge Implementer and QA/);
  for (const text of [docs, readme]) assert.match(text, /Claude bridge[^.]*(?:Implementer and QA|`arc_implementer` and `arc_qa`)[^.]*Codex host/);
  for (const needle of ['user-config-mcp-not-controlled', 'ARC_BRIDGE_CHILD', 'Git-ignored']) assert.ok(docs.includes(needle), 'docs ' + needle);
});
