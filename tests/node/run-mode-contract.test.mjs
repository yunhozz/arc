import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {agentsBlockBody} from '../../lib/installer/global-config.mjs';
import {validateAgentRegistry} from '../../lib/prompts/render.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const platforms = ['claude', 'codex', 'gemini', 'grok'];
const runModeMarker = '{{ARC_RUN_MODE_POLICY}}';
const skillPhrases = [
  'record explicit user target choice (or a Full Auto auto-decision under the Run mode policy)',
  '`mode` (standalone, or composite with routing revision), `run` (Run mode in effect: `supervised` or `full-auto`),',
  '- **Explicit choice:** Only clear user selection counts, except a recorded Full Auto auto-decision for a gate the installed Run mode permits. Planning approval, silence, refusal of another option and ambiguous replies do not.',
];
const planningHeading = '<a id="full-auto-run-mode"></a>\n## Full Auto run mode\n';
const planningSection = `<a id="full-auto-run-mode"></a>
## Full Auto run mode

Applies only when the installed SKILL.md contains \`**Run mode:** Full Auto.\` and the user has not asked in this chat to stop auto-deciding or to use Supervised. Orchestrator first completes every review obligation of the gate, then selects the recommended option. Without a recommendation and supporting evidence, ask the user (fail-safe). Gates not listed as auto stay with the user. \`user\` and \`unchanged\` rows, and user conditions inside an \`auto\` row's Rule (\`→ user\`, \`otherwise user\`), take precedence over \`auto\` rows: an auto question row (\`Planner options and questions\`, \`AskUserQuestion\`) answers only questions that none of them covers; otherwise ask the user.

| Gate | Full Auto | Rule |
|---|---|---|
| Execution-target choice | auto | Clean work tree → new task branch in the current checkout; unrelated changes present → managed worktree; detached HEAD, unknown state or unclear ownership → user |
| Branch name collision | auto | Next numeric suffix (\`-2\`, \`-3\`, …) |
| Planner options and questions | auto | Recommended option; record assumptions in the brief |
| Design and short-design approval | auto | After Orchestrator review |
| Architectural start confirmation | auto | Scope only within the original request, otherwise user; target follows the Execution-target choice row |
| Architectural spec+plan combined approval | auto | Only with zero open decisions; otherwise user |
| Plan approval | auto | Only with zero open decisions; otherwise user |
| Spec/plan revision within the original scope | auto | Scope-expanding revisions → user |
| Non-blocking final Reviewer finding disposition | auto | Fix or no-fix decision only: recommended disposition within approved scope; scope-expanding fixes → user; Reviewer recheck and acceptance stay unchanged |
| Direct-path F1–F8 scope approval | auto | All F1–F8 still proven; otherwise user |
| \`AskUserQuestion\` | auto | Recommended option |
| Visual companion offer | skipped | Not offered |
| Visual interpretation approval ([verification](verification.md#visual-evidence-and-adjudication)) | user | Not an auto gate |
| New product decision outside the original request | user | — |
| Push, merge, deploy, publish, external messages | user | — |
| Failure, partial completion, hold, unknown state, ownership conflict | user | — |
| Preservation-rule Git actions | unchanged | Still prohibited; stop and report |
| Permission or sandbox approval | user | — |
| Unknown slot or exhausted capacity | user | — |
| Plan depth, local commit, Tester, Reviewer, acceptance | unchanged | — |

Records:
- Each auto decision: user-visible progress message \`auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence\`, plus the same entry in the canonical handoff record.
- Pre-action gate record: \`run\` field (\`supervised\` or \`full-auto\`).
- Revision-history \`Approval time\`: \`auto-approved (Full Auto) <time>\`.
- Runtime \`approvalRef\` (free text): \`full-auto:<doc>@<version>\`.
- Completion report: list every auto decision.

Stopping: a user request in this chat to stop or switch to Supervised overrides the installed default and applies from the next gate; earlier auto decisions remain recorded.
`;

for (const platform of platforms) {
  test(`${platform} SKILL.md has the Run mode marker exactly once after the language marker`, () => {
    const skill = read(`${platform}/skill/SKILL.md`);
    assert.equal(skill.split(runModeMarker).length - 1, 1);
    assert.ok(skill.includes(`\n{{ARC_OUTPUT_LANGUAGE_POLICY}}\n\n${runModeMarker}\n\n`));
  });

  test(`${platform} SKILL.md includes each static Run mode clause once`, () => {
    const skill = read(`${platform}/skill/SKILL.md`);
    for (const phrase of skillPhrases) {
      assert.equal(skill.split(phrase).length - 1, 1, phrase);
    }
  });

  test(`${platform} planning.md ends with one approved Full Auto section`, () => {
    const planning = read(`${platform}/skill/references/planning.md`);
    assert.equal(planning.split(planningHeading).length - 1, 1);
    assert.ok(planning.endsWith(`\n\n${planningSection}`));
  });
}

test('one specialist fragment includes the approved Run mode choice clause', () => {
  const {fragments} = JSON.parse(read('lib/prompts/agent-fragments.json'));
  const clause = '- **Explicit choice:** Only a clear user selection counts, or a recorded Full Auto auto-decision under [approval.run-mode]. Planning approval, silence, refusal of another option and ambiguous replies do not.';
  assert.equal(fragments.filter(({text}) => text.split('\n').includes(clause)).length, 1);
});

test('agentsBlockBody appends the Full Auto line only in full-auto', () => {
  const args = ['/tmp/user/.codex', '/tmp/user', 'en', 'codex'];
  const fullAutoLine = '- ARC Run mode is Full Auto: Orchestrator auto-decides only the gates listed in the installed ARC skill, records each decision, and asks the user for everything else.\n';
  const defaultBody = agentsBlockBody(...args);
  assert.equal(agentsBlockBody(...args, 'supervised'), defaultBody);
  assert.doesNotMatch(defaultBody, /ARC Run mode is Full Auto/);
  assert.equal(agentsBlockBody(...args, 'full-auto'), defaultBody + fullAutoLine);
  assert.throws(() => agentsBlockBody(...args, 'auto'), /Invalid run mode/);
});

test('agent registry rejects the Run mode marker in a fragment', () => {
  const original = JSON.parse(read('lib/prompts/agent-fragments.json'));
  const modified = structuredClone(original);
  modified.fragments[0].text += ` ${runModeMarker}`;
  assert.doesNotThrow(() => validateAgentRegistry(original));
  assert.throws(() => validateAgentRegistry(modified), /Invalid fragment/);
});
