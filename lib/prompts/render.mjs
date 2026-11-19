import { parseToml } from '../models/config.mjs';
import {installerRegistryOf} from '../platforms/index.mjs';
import {standaloneProfileFile} from '../runtime/platform-registry.mjs';
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
    "planner.exploration-density",
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
    "planner.exploration-density",
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
  ],
  "gemini/agents/arc-implementer.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "implementer.execution-steps"],
  "gemini/agents/arc-planner.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "planner.target-evidence", "planner.workflow-contract", "planner.exploration-density", "planner.task-shape", "planner.commit-boundary", "planner.visual-question", "planner.final-plan-recheck"],
  "gemini/agents/arc-qa.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "qa.contract-intro", "common.verification-reference", "qa.verification-steps"],
  "gemini/agents/arc-reviewer.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "reviewer.contract-intro", "common.verification-reference", "reviewer.review-steps", "common.read-only-no-mutations", "reviewer.final-plan-findings"],
  "gemini/agents/arc-scouter.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "scouter.research-brief", "scouter.research-mode", "common.read-only-no-mutations", "scouter.additional-boundaries"],
  "grok/agents/arc-implementer.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "implementer.execution-steps"],
  "grok/agents/arc-planner.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "planner.target-evidence", "planner.workflow-contract", "planner.exploration-density", "planner.task-shape", "planner.commit-boundary", "planner.visual-question", "planner.final-plan-recheck"],
  "grok/agents/arc-qa.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "qa.contract-intro", "common.verification-reference", "qa.verification-steps"],
  "grok/agents/arc-reviewer.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "reviewer.contract-intro", "common.verification-reference", "reviewer.review-steps", "common.read-only-no-mutations", "reviewer.final-plan-findings"],
  "grok/agents/arc-scouter.md": ["common.brief-boundary", "common.specialist-basics", "common.preservation-choice-inspection", "common.optional-read-exception", "common.resume-gates", "scouter.research-brief", "scouter.research-mode", "common.read-only-no-mutations", "scouter.additional-boundaries"]
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
    if (!keys(item, ['id', 'text']) || !ids.has(item.id) || fragments.has(item.id) || typeof item.text !== 'string' || !item.text || /ARC_AGENT_FRAGMENT|ARC_OUTPUT_LANGUAGE_POLICY|ARC_RUN_MODE_POLICY|\[ARC role policy: contract (?:begin|end)\]/.test(item.text) || item.text.includes('\r')) throw Error('Invalid fragment');
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
  if (path.endsWith('.md')) {
    const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) throw Error('Invalid Markdown frontmatter');
    return [match[0].length, text.length];
  }
  parseToml(text);
  let quote = null, depth = 0, root = true, offset = 0, start = null, inInstructions = false;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    let opener = -1;
    if (quote === null && depth === 0 && root) {
      if (/^[ \t]*\[/.test(line)) root = false;
      else {
        const match = /^[ \t]*developer_instructions[ \t]*=[ \t]*"""/.exec(line);
        if (match) { start = offset + match[0].length; opener = match[0].length - 3; }
      }
    }
    for (let i = 0; i < line.length;) {
      if (quote !== null) {
        if (quote.startsWith('"') && line[i] === '\\') { i += 2; continue; }
        if (line.startsWith(quote, i)) {
          let end = i + quote.length;
          if (quote.length === 3) while (line[end] === quote[0]) end++;
          if (inInstructions) return [start, offset + end - 3];
          quote = null; i = end;
        } else i++;
      } else if (line[i] === '#') break;
      else if (line[i] === '"' || line[i] === "'") {
        quote = line.startsWith(line[i].repeat(3), i) ? line[i].repeat(3) : line[i];
        inInstructions = i === opener;
        i += quote.length;
      } else {
        if ('[{'.includes(line[i])) depth++; else if (']}'.includes(line[i])) depth--;
        i++;
      }
    }
    offset += line.length;
  }
  throw Error('Invalid Codex instructions');
}
function templateSources(context) {
  const sources = new Map();
  for (const {runtime, payloadPrefix, agentTemplates} of installerRegistryOf(context).byAnchorOrder()) {
    const source = agentTemplates?.expectationsFrom ?? runtime.id;
    for (const role of ['scouter', 'planner', 'implementer', 'qa', 'reviewer']) {
      const expected = Object.keys(EXPECTED).find(name => name.startsWith(`${source}/agents/arc-${role}.`));
      sources.set(`${payloadPrefix}/agents/${standaloneProfileFile(runtime, `arc_${role}`)}`, expected);
    }
  }
  // Preserve the default template validation order and its first error.
  return new Map([...Object.keys(EXPECTED).filter(name => sources.has(name)).map(name => [name, sources.get(name)]), ...[...sources].filter(([name]) => !Object.hasOwn(EXPECTED, name))]);
}
export function renderAgentProfile(path, input, registry, context = {}) {
  const fragments = validateAgentRegistry(registry);
  const source = templateSources(context).get(path);
  if (!source || !Buffer.isBuffer(input)) throw Error('Invalid profile input');
  const text = new TextDecoder('utf-8', {fatal: true}).decode(input);
  const [start, end] = bounds(source, text);
  const matches = [...text.matchAll(marker)];
  if (JSON.stringify(matches.map(m => m[1])) !== JSON.stringify(EXPECTED[source]) || matches.some(m => m.index < start || m.index + m[0].length > end)) throw Error('Invalid profile markers');
  const stripped = text.replace(marker, '');
  if (stripped.includes('ARC_AGENT_FRAGMENT')) throw Error('Malformed fragment marker');
  const crlf = text.includes('\r\n');
  const output = text.replace(marker, (_, id) => crlf ? fragments.get(id).replaceAll('\n', '\r\n') : fragments.get(id));
  if (source.startsWith('codex/')) parseToml(output);
  return Buffer.from(output);
}
export function validateAgentTemplates(templates, registry, context = {}) {
  const sources = templateSources(context);
  if (!(templates instanceof Map) || templates.size !== sources.size) throw Error('Invalid template set');
  for (const path of sources.keys()) renderAgentProfile(path, templates.get(path), registry, context);
}
