// Pure helpers that turn an installed arc-routing profile into role-specific Claude/Codex CLI arguments. No processes are started here.
import crypto from 'node:crypto';
import path from 'node:path';
import {DEFAULT_POLICY, effectiveClaudeSandboxSettings} from './role-dispatch-policy.mjs';

const ROLES = ['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_qa', 'arc_reviewer'];
const deepFreeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child); return Object.freeze(value); };
export const ROLE_BRIDGE_PERMISSIONS = deepFreeze({
  claude: {
    arc_scouter: {permissionMode: 'default', sandbox: false}, arc_planner: {permissionMode: 'default', sandbox: false},
    arc_implementer: {permissionMode: 'acceptEdits', sandbox: true}, arc_qa: {permissionMode: 'default', sandbox: true}, arc_reviewer: {permissionMode: 'default', sandbox: false}
  },
  codex: {
    arc_scouter: {sandboxMode: 'read-only', search: true}, arc_planner: {sandboxMode: 'read-only', search: false},
    arc_implementer: {sandboxMode: 'workspace-write', search: false}, arc_qa: {sandboxMode: 'workspace-write', search: false}, arc_reviewer: {sandboxMode: 'read-only', search: false}
  }
});

const bad = message => { throw Error(`Invalid composite profile: ${message}`); };
const unquote = raw => {
  const value = raw.trim();
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) { try { return JSON.parse(value); } catch { bad('unsupported string escape'); } }
  if (/^'[^']*'$/.test(value)) return value.slice(1, -1);
  return value;
};

function parseClaude(text) {
  const lines = text.split('\n').map(line => line.replace(/\r$/, ''));
  if (lines[0] !== '---') bad('missing frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) bad('unterminated frontmatter');
  const fields = {}; let tools = null, inTools = false;
  for (const line of lines.slice(1, end)) {
    const item = /^[ \t]+-[ \t]+(\S.*?)[ \t]*$/.exec(line);
    if (item) { if (!inTools) bad('unexpected list item'); tools.push(unquote(item[1])); continue; }
    const field = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!field) { if (line.trim() === '') continue; bad('unrecognized frontmatter line'); }
    inTools = false;
    if (field[1] === 'tools') { if (field[2] !== '') bad('tools must be a block list'); if (tools !== null) bad('duplicate tools'); tools = []; inTools = true; continue; }
    if (Object.hasOwn(fields, field[1])) bad(`duplicate ${field[1]}`);
    fields[field[1]] = unquote(field[2]);
  }
  for (const key of ['name', 'description', 'model', 'effort']) if (typeof fields[key] !== 'string' || fields[key] === '') bad(`missing ${key}`);
  if (tools !== null && tools.length === 0) bad('empty tools');
  const instructions = lines.slice(end + 1).join('\n');
  if (instructions.trim() === '') bad('empty instructions');
  return {name: fields.name, description: fields.description, model: fields.model, effort: fields.effort, tools, instructions};
}

const ESCAPES = {b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\'};
// Decodes a TOML multiline basic string body; returns null when it is not terminated by """ on the same logical line.
function readMultiline(lines, index, rest) {
  let out = '', buffer = rest, line = index;
  for (;;) {
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch === '"' && buffer.startsWith('"""', i)) {
        if (!/^(?:"{0,2})[ \t]*(?:#.*)?$/.test(buffer.slice(i + 3))) bad('unsupported developer_instructions terminator');
        return {value: out + buffer.slice(i + 3).match(/^"*/)[0], next: line + 1};
      }
      if (ch !== '\\') { out += ch; continue; }
      const next = buffer[i + 1];
      if (next === undefined) { // line-ending backslash trims following whitespace and newlines
        let j = line + 1; while (j < lines.length && /^[ \t]*$/.test(lines[j])) j++;
        if (j >= lines.length) bad('unterminated developer_instructions');
        out += ''; buffer = lines[j].replace(/^[ \t]+/, ''); line = j; i = -1; continue;
      }
      if (Object.hasOwn(ESCAPES, next)) { out += ESCAPES[next]; i++; continue; }
      const width = next === 'u' ? 4 : next === 'U' ? 8 : 0, hex = buffer.slice(i + 2, i + 2 + width);
      if (!width || !new RegExp(`^[0-9A-Fa-f]{${width}}$`).test(hex)) bad('invalid escape in developer_instructions');
      try { out += String.fromCodePoint(parseInt(hex, 16)); } catch { bad('invalid code point in developer_instructions'); }
      i += 1 + width;
    }
    line++;
    if (line >= lines.length) bad('unterminated developer_instructions');
    out += '\n'; buffer = lines[line];
  }
}
function parseCodex(text) {
  const lines = text.split('\n').map(line => line.replace(/\r$/, '')), fields = {};
  let instructions = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^[ \t]*\[/.test(line)) break;
    const multi = /^developer_instructions[ \t]*=[ \t]*"""(.*)$/.exec(line);
    if (multi) {
      if (instructions !== null) bad('duplicate developer_instructions');
      const rest = multi[1], result = readMultiline(lines, i, rest === '' ? '' : rest);
      // A newline directly after the opening delimiter is trimmed; readMultiline starts at an empty remainder, so skip that join.
      instructions = rest === '' ? result.value.replace(/^\n/, '') : result.value; i = result.next - 1; continue;
    }
    if (/^developer_instructions[ \t]*=/.test(line)) bad('developer_instructions must be a multiline string');
    const single = /^(name|description|model|model_reasoning_effort)[ \t]*=[ \t]*("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/.exec(line);
    if (single) { if (Object.hasOwn(fields, single[1])) bad(`duplicate ${single[1]}`); fields[single[1]] = unquote(single[2]); continue; }
    if (/^(name|description|model|model_reasoning_effort)[ \t]*=/.test(line)) bad(`${line.split('=')[0].trim()} must be a one-line string`);
  }
  for (const key of ['name', 'description', 'model', 'model_reasoning_effort']) if (typeof fields[key] !== 'string' || fields[key] === '') bad(`missing ${key}`);
  if (instructions === null || instructions.trim() === '') bad('missing developer_instructions');
  return {name: fields.name, description: fields.description, model: fields.model, effort: fields.model_reasoning_effort, tools: null, instructions};
}

/** Narrow extractor: the installed runtime cannot import lib/models, so only the managed profile shapes are accepted. */
export function parseCompositeProfile(platform, bytes) {
  if (platform !== 'claude' && platform !== 'codex') bad('unknown platform');
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(buffer); } catch { bad('not valid UTF-8'); }
  if (text.charCodeAt(0) === 0xfeff) bad('unexpected BOM');
  return platform === 'claude' ? parseClaude(text) : parseCodex(text);
}

const permissionsFor = (platform, role) => {
  if (!ROLES.includes(role)) throw Error(`Unknown role: ${role}`);
  return ROLE_BRIDGE_PERMISSIONS[platform][role];
};
const requireText = (value, label) => { if (typeof value !== 'string' || value === '') throw Error(`Missing ${label}`); return value; };

export function buildClaudeArgs({role, profile, sessionId = null, policy = DEFAULT_POLICY}) {
  const permissions = permissionsFor('claude', role);
  if (!Array.isArray(profile?.tools) || profile.tools.length === 0) throw Error('Claude profile tools are required');
  const args = ['-p', '--safe-mode', '--output-format', 'stream-json', '--verbose', '--model', requireText(profile.model, 'model'), '--effort', requireText(profile.effort, 'effort'),
    '--append-system-prompt', requireText(profile.instructions, 'instructions'), '--tools', profile.tools.join(','), '--permission-mode', permissions.permissionMode];
  if (permissions.sandbox) {
    const settings = effectiveClaudeSandboxSettings(policy);
    if (settings === null) throw Error('Claude sandbox settings are not available for this role');
    args.push('--settings', JSON.stringify(settings));
  }
  if (policy?.gates?.G6 === 'strict') args.push('--strict-mcp-config');
  if (sessionId !== null) args.push('--resume', requireText(sessionId, 'sessionId'));
  return args;
}

export function buildCodexArgs({role, profile, worktree, resultPath, threadId = null, policy = DEFAULT_POLICY}) {
  void policy;
  const permissions = permissionsFor('codex', role);
  if (typeof resultPath !== 'string' || !path.isAbsolute(resultPath)) throw Error('Absolute resultPath required');
  const settings = ['-m', requireText(profile?.model, 'model'), '-c', `model_reasoning_effort=${JSON.stringify(requireText(profile.effort, 'effort'))}`,
    '-c', `developer_instructions=${JSON.stringify(requireText(profile.instructions, 'instructions'))}`, '-c', `sandbox_mode=${JSON.stringify(permissions.sandboxMode)}`,
    '-c', 'approval_policy="never"', '-o', resultPath, '-'];
  if (threadId !== null) {
    if (typeof threadId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(threadId)) throw Error('Invalid threadId');
    return [...(permissions.search ? ['--search'] : []), 'exec', 'resume', threadId, '--json', ...settings];
  }
  if (typeof worktree !== 'string' || !path.isAbsolute(worktree)) throw Error('Absolute worktree required');
  return [...(permissions.search ? ['--search'] : []), 'exec', '--json', '-C', worktree, ...settings];
}

export const argsDigest = args => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');
