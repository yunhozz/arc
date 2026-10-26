import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Deliberate scope: authored ARC guidance and its generated policy asset only.
// Vendored references, historical documents, and language settings are separate contracts.
const instructionFiles = [
  'codex/skill/SKILL.md',
  'claude/skill/SKILL.md',
  'codex/skill/references/arc-visual-companion.md',
  'codex/skill/references/commit.md',
  'codex/skill/references/coordination.md',
  'codex/skill/references/git-recovery.md',
  'codex/skill/references/handoff-prep.md',
  'codex/skill/references/handoff-worktree.md',
  'codex/skill/references/handoff.md',
  'codex/skill/references/limits.md',
  'codex/skill/references/planning.md',
  'codex/skill/references/verification.md',
  'claude/skill/references/arc-visual-companion.md',
  'claude/skill/references/commit.md',
  'claude/skill/references/coordination.md',
  'claude/skill/references/git-recovery.md',
  'claude/skill/references/handoff-prep.md',
  'claude/skill/references/handoff.md',
  'claude/skill/references/limits.md',
  'claude/skill/references/planning.md',
  'claude/skill/references/verification.md',
  'codex/agents/arc-implementer.toml',
  'codex/agents/arc-planner.toml',
  'codex/agents/arc-qa.toml',
  'codex/agents/arc-reviewer.toml',
  'codex/agents/arc-scouter.toml',
  'claude/agents/arc-implementer.md',
  'claude/agents/arc-planner.md',
  'claude/agents/arc-qa.md',
  'claude/agents/arc-reviewer.md',
  'claude/agents/arc-scouter.md',
  'docs/harness-operation.md',
  'docs/runtime/planner-hook-context.md',
  'lib/policy/role-policy.json',
  'claude/skill/hooks/git-policy.json',
];

for (const file of instructionFiles) {
  test(`${file} contains English guidance without Hangul`, () => {
    const text = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(text, /[A-Za-z]/, `${file}: expected nonempty English content`);
    const line = text.split('\n').findIndex(value => /\p{Script=Hangul}/u.test(value));
    assert.equal(line, -1, `${file}:${line + 1}: unexpected Hangul in English instructions`);
  });
}
