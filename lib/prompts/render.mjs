import { parseToml } from '../models/config.mjs';
const EXPECTED = {
  "claude/agents/arc-implementer.md": [
    "common.brief-boundary",
    "common.specialist-basics",
    "common.preservation-choice-inspection",
    "claude.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "claude.profile-guidance",
    "implementer.execution-steps"
  ],
  "claude/agents/arc-planner.md": [
    "common.brief-boundary",
    "common.specialist-basics",
    "common.preservation-choice-inspection",
    "claude.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "claude.profile-guidance",
    "planner.target-evidence",
    "planner.workflow-contract",
    "planner.task-shape",
    "planner.commit-boundary",
    "planner.visual-question",
    "planner.final-plan-recheck"
  ],
  "claude/agents/arc-qa.md": [
    "common.brief-boundary",
    "common.specialist-basics",
    "common.preservation-choice-inspection",
    "claude.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "claude.profile-guidance",
    "qa.contract-intro",
    "common.verification-reference",
    "qa.verification-steps"
  ],
  "claude/agents/arc-reviewer.md": [
    "common.brief-boundary",
    "common.specialist-basics",
    "common.preservation-choice-inspection",
    "claude.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "claude.profile-guidance",
    "reviewer.contract-intro",
    "common.verification-reference",
    "reviewer.review-steps",
    "common.read-only-no-mutations",
    "reviewer.final-plan-findings"
  ],
  "claude/agents/arc-scouter.md": [
    "common.brief-boundary",
    "common.specialist-basics",
    "common.preservation-choice-inspection",
    "claude.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "claude.profile-guidance",
    "scouter.research-brief",
    "scouter.research-mode",
    "common.read-only-no-mutations",
    "scouter.additional-boundaries"
  ],
  "codex/agents/arc-implementer.toml": [
    "common.brief-boundary",
    "common.specialist-basics",
    "common.preservation-choice-inspection",
    "common.optional-read-exception",
    "implementer.execution-steps"
  ],
  "codex/agents/arc-planner.toml": [
    "common.brief-boundary",
    "common.specialist-basics",
    "codex.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "planner.target-evidence",
    "planner.workflow-contract",
    "planner.task-shape",
    "planner.commit-boundary",
    "planner.visual-question",
    "planner.final-plan-recheck"
  ],
  "codex/agents/arc-qa.toml": [
    "common.brief-boundary",
    "common.specialist-basics",
    "codex.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "qa.contract-intro",
    "common.verification-reference",
    "qa.verification-steps"
  ],
  "codex/agents/arc-reviewer.toml": [
    "common.brief-boundary",
    "common.specialist-basics",
    "codex.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "reviewer.contract-intro",
    "common.verification-reference",
    "reviewer.review-steps",
    "common.read-only-no-mutations",
    "reviewer.final-plan-findings"
  ],
  "codex/agents/arc-scouter.toml": [
    "common.brief-boundary",
    "common.specialist-basics",
    "codex.incident-prefix",
    "common.optional-read-exception",
    "common.resume-gates",
    "scouter.research-brief",
    "scouter.research-mode",
    "common.read-only-no-mutations",
    "scouter.additional-boundaries"
  ]
};

const marker = /\{\{ARC_AGENT_FRAGMENT:([a-z][a-z0-9.-]*)\}\}/g;
function keys(value, names) {
  return value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...names].sort());
}
export function validateAgentRegistry(registry) {
  if (!keys(registry, ['schemaVersion', 'fragments', 'targets']) || registry.schemaVersion !== 1 || !Array.isArray(registry.fragments) || !Array.isArray(registry.targets)) throw Error('Invalid fragment registry');
  const ids = new Set(Object.values(EXPECTED).flat());
  const fragments = new Map();
  for (const item of registry.fragments) {
    if (!keys(item, ['id', 'text']) || !ids.has(item.id) || fragments.has(item.id) || typeof item.text !== 'string' || !item.text || /ARC_AGENT_FRAGMENT|ARC_OUTPUT_LANGUAGE_POLICY|\[ARC role policy: contract (?:begin|end)\]/.test(item.text) || item.text.includes('\r')) throw Error('Invalid fragment');
    fragments.set(item.id, item.text);
  }
  if (fragments.size !== ids.size || registry.targets.length !== Object.keys(EXPECTED).length) throw Error('Incomplete fragment inventory');
  const seen = new Set();
  for (const target of registry.targets) {
    if (!keys(target, ['path', 'fragments']) || !Object.hasOwn(EXPECTED, target.path) || seen.has(target.path) || JSON.stringify(target.fragments) !== JSON.stringify(EXPECTED[target.path])) throw Error('Invalid fragment target');
    seen.add(target.path);
  }
  return fragments;
}
function bounds(path, text) {
  if (path.startsWith('claude/')) {
    const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) throw Error('Invalid Claude frontmatter');
    return [match[0].length, text.length];
  }
  parseToml(text);
  const match = /^developer_instructions\s*=\s*"""/m.exec(text);
  if (!match) throw Error('Invalid Codex instructions');
  const start = match.index + match[0].length;
  const end = text.indexOf('"""', start);
  if (end < 0) throw Error('Unterminated Codex instructions');
  return [start, end];
}
export function renderAgentProfile(path, input, registry) {
  const fragments = validateAgentRegistry(registry);
  if (!Object.hasOwn(EXPECTED, path) || !Buffer.isBuffer(input)) throw Error('Invalid profile input');
  const text = new TextDecoder('utf-8', {fatal: true}).decode(input);
  const [start, end] = bounds(path, text);
  const matches = [...text.matchAll(marker)];
  if (JSON.stringify(matches.map(m => m[1])) !== JSON.stringify(EXPECTED[path]) || matches.some(m => m.index < start || m.index + m[0].length > end)) throw Error('Invalid profile markers');
  const stripped = text.replace(marker, '');
  if (stripped.includes('ARC_AGENT_FRAGMENT')) throw Error('Malformed fragment marker');
  const crlf = text.includes('\r\n');
  const output = text.replace(marker, (_, id) => crlf ? fragments.get(id).replaceAll('\n', '\r\n') : fragments.get(id));
  if (path.startsWith('codex/')) parseToml(output);
  return Buffer.from(output);
}
export function validateAgentTemplates(templates, registry) {
  if (!(templates instanceof Map) || templates.size !== Object.keys(EXPECTED).length) throw Error('Invalid template set');
  for (const path of Object.keys(EXPECTED)) renderAgentProfile(path, templates.get(path), registry);
}
