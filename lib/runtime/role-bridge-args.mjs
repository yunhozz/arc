// Pure helpers that turn an installed arc-routing profile into role-specific Claude/Codex CLI arguments. No processes are started here.
import crypto from 'node:crypto';
import path from 'node:path';
import {GROK_CONTRACT} from './grok-stream.mjs';
import {GEMINI_CONTRACT} from './gemini-stream.mjs';
import {CODEX_PROFILE_ARGS_FORM, CODEX_PROFILE_GIT_ENTRIES, DEFAULT_POLICY, effectiveClaudeSandboxSettings} from './role-dispatch-policy.mjs';
import {TOOL_PATHS, TOOL_UNIX_SOCKETS} from './tool-access.mjs';

const ROLES = ['arc_scouter', 'arc_planner', 'arc_implementer', 'arc_tester', 'arc_reviewer'];
const deepFreeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child); return Object.freeze(value); };
export const ROLE_BRIDGE_PERMISSIONS = deepFreeze({
  claude: {
    arc_scouter: {permissionMode: 'default', sandbox: false, allowedTools: ['WebFetch', 'WebSearch']},
    arc_planner: {permissionMode: 'default', sandbox: false},
    arc_implementer: {permissionMode: 'acceptEdits', sandbox: true}, arc_tester: {permissionMode: 'default', sandbox: true}, arc_reviewer: {permissionMode: 'default', sandbox: false}
  },
  gemini: {
    arc_scouter: {approvalMode: 'plan', sandbox: false}, arc_planner: {approvalMode: 'plan', sandbox: false},
    arc_implementer: {approvalMode: 'auto_edit', sandbox: true}, arc_tester: {approvalMode: 'auto_edit', sandbox: true}, arc_reviewer: {approvalMode: 'plan', sandbox: false}
  },
  grok: {
    arc_scouter: {permissionMode: 'plan', sandbox: 'read-only', deny: GROK_CONTRACT.readOnlyDeny},
    arc_planner: {permissionMode: 'plan', sandbox: 'read-only', deny: GROK_CONTRACT.readOnlyDeny},
    arc_reviewer: {permissionMode: 'plan', sandbox: 'read-only', deny: GROK_CONTRACT.readOnlyDeny},
    arc_implementer: {permissionMode: 'acceptEdits', sandbox: 'custom', deny: []},
    arc_tester: {permissionMode: 'acceptEdits', sandbox: 'custom', deny: []},
  },
  codex: {
    arc_scouter: {sandboxMode: 'read-only', search: true}, arc_planner: {sandboxMode: 'read-only', search: false},
    arc_implementer: {sandboxMode: 'workspace-write', search: false}, arc_tester: {sandboxMode: 'workspace-write', search: false}, arc_reviewer: {sandboxMode: 'read-only', search: false}
  }
});

const BRIDGE_IMPLEMENTATIONS = new Map([
  ['claude', {parse: parseClaude, buildArgs: buildClaudeArgs}],
  ['codex', {parse: parseCodex, buildArgs: buildCodexArgs}],
  ['gemini', {parse: parseGemini, buildArgs: buildGeminiArgs}],
  ['grok', {parse: parseGrok, buildArgs: buildGrokArgs}],
]);
export const BRIDGE_PLATFORM_IDS = Object.freeze([...BRIDGE_IMPLEMENTATIONS.keys()]);

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

// Managed Gemini profiles use scalar-only frontmatter. Keep this independent of installer imports.
function parseGemini(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(text);
  if (!match || !match[2].trim()) bad('missing Gemini frontmatter or instructions');
  const fields = {};
  const nonStringScalar = /^(?:~|null|true|false|yes|no|on|off|[-+]?(?:\.inf|\.nan|0[xob][0-9a-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:e[-+]?\d+)?)|\d{4}-\d{2}-\d{2}(?:[Tt ].*)?)$/i;
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([a-z][a-zA-Z0-9_-]*): (.+)$/.exec(line);
    if (!entry || Object.hasOwn(fields, entry[1])) bad('malformed or duplicate Gemini field');
    const value = entry[2];
    if (value !== value.trim() || /[\p{Cc}\u2028\u2029{}#&*!|>"']/u.test(value)
      || /^(?:[-?:](?:\s|$)|[\[\],%@`])/.test(value) || value.includes(': ') || nonStringScalar.test(value)) bad('unsupported Gemini scalar');
    fields[entry[1]] = value;
  }
  for (const key of ['name', 'description', 'model']) if (!fields[key]) bad(`missing ${key}`);
  if (Object.hasOwn(fields, 'effort')) bad('Gemini effort must be omitted');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(fields.model)) bad('invalid Gemini model');
  return {name: fields.name, description: fields.description, model: fields.model, effort: 'default', tools: null, instructions: match[2].replaceAll('\r\n', '\n')};
}

// ARC Grok metadata uses the same scalar grammar with an exact key set.
export function parseGrok(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(text);
  if (!match || !match[2].trim()) bad('missing Grok frontmatter or instructions');
  const fields = {};
  const nonStringScalar = /^(?:~|null|true|false|yes|no|on|off|[-+]?(?:\.inf|\.nan|0[xob][0-9a-f_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:e[-+]?\d+)?)|\d{4}-\d{2}-\d{2}(?:[Tt ].*)?)$/i;
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([a-z][a-zA-Z0-9_-]*): (.+)$/.exec(line);
    if (!entry || Object.hasOwn(fields, entry[1])) bad('malformed or duplicate Grok field');
    const value = entry[2];
    if (value !== value.trim() || /[\p{Cc}\u2028\u2029{}#&*!|>"']/u.test(value)
      || /^(?:[-?:](?:\s|$)|[\[\],%@`])/.test(value) || value.includes(': ') || nonStringScalar.test(value)) bad('unsupported Grok scalar');
    fields[entry[1]] = value;
  }
  for (const key of ['name', 'description', 'model']) if (!fields[key]) bad(`missing ${key}`);
  if (Object.keys(fields).length !== 3) bad('Grok fields must be exactly name, description, model');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(fields.model)) bad('invalid Grok model');
  return {name: fields.name, description: fields.description, model: fields.model, effort: 'default', tools: null, instructions: match[2].replaceAll('\r\n', '\n')};
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
  const implementation = BRIDGE_IMPLEMENTATIONS.get(platform);
  if (!implementation) bad('unknown platform');
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
  let text;
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(buffer); } catch { bad('not valid UTF-8'); }
  if (text.charCodeAt(0) === 0xfeff) bad('unexpected BOM');
  return implementation.parse(text);
}

export function buildBridgeArgs(platform, options) {
  const implementation = BRIDGE_IMPLEMENTATIONS.get(platform);
  if (!implementation) bad('unknown platform');
  return implementation.buildArgs(options);
}

const permissionsFor = (platform, role) => {
  if (!ROLES.includes(role)) throw Error(`Unknown role: ${role}`);
  return ROLE_BRIDGE_PERMISSIONS[platform][role];
};
const requireText = (value, label) => { if (typeof value !== 'string' || value === '') throw Error(`Missing ${label}`); return value; };

function claudeSettingsFor(base, toolContext) {
  if (toolContext === null) return {...base};
  const {grants, scratch, forbidden, secretEnvNames} = toolContext;
  const permissions = {...base.permissions};
  const filesystem = {...base.sandbox.filesystem};
  if (grants.network === 'domains') {
    const reads = [...forbidden.readWhenExternal].sort((a, b) => a.path < b.path ? -1 : Number(a.path > b.path));
    // Claude 2.1.327, 2026-11-24, MI-7
    const readRules = reads.map(({path: name, kind}) => `Read(/${name}${kind === 'dir' ? '/**' : ''})`);
    permissions.deny = [...permissions.deny, ...readRules];
    // Claude 2.1.327, 2026-11-24, MI-9
    filesystem.denyRead = reads.map(entry => entry.path);
  }
  if (grants.paths.length) filesystem.allowWrite = grants.paths.map(id => TOOL_PATHS[id]).sort();
  const sandbox = {...base.sandbox, filesystem};
  if (grants.network !== null) {
    // Claude 2.1.327, 2026-11-24, MI-5
    sandbox.network = {
      allowedDomains: ['localhost', '127.0.0.1', ...[...grants.domains].sort()],
      allowLocalBinding: true,
      allowUnixSockets: [path.join(scratch, 'sock'), ...grants.unixSockets.map(id => TOOL_UNIX_SOCKETS[id]).sort()],
    };
  }
  // Claude 2.1.327, 2026-11-24, MI-6
  const values = new Map([...toolContext.env, ...secretEnvNames.map(name => [name, ''])]);
  const env = Object.fromEntries([...values.keys()].sort().map(name => [name, values.get(name)]));
  return {permissions, sandbox, env};
}

export function buildClaudeArgs({role, profile, sessionId = null, policy = DEFAULT_POLICY, toolContext = null}) {
  const permissions = permissionsFor('claude', role);
  if (!Array.isArray(profile?.tools) || profile.tools.length === 0) throw Error('Claude profile tools are required');
  const args = ['-p', '--safe-mode', '--output-format', 'stream-json', '--verbose', '--model', requireText(profile.model, 'model'), '--effort', requireText(profile.effort, 'effort'),
    '--append-system-prompt', requireText(profile.instructions, 'instructions'), '--tools', profile.tools.join(','), '--permission-mode', permissions.permissionMode];
  if (permissions.allowedTools) {
    if (!permissions.allowedTools.every(tool => profile.tools.includes(tool))) throw Error('Claude allowedTools must be listed in profile tools');
    args.push('--allowedTools', permissions.allowedTools.join(','));
  }
  if (permissions.sandbox) {
    const settings = effectiveClaudeSandboxSettings(policy);
    if (settings === null) throw Error('Claude sandbox settings are not available for this role');
    args.push('--settings', JSON.stringify(claudeSettingsFor(settings, toolContext)));
  }
  if (policy?.gates?.G6 === 'strict') args.push('--strict-mcp-config');
  if (sessionId !== null) args.push('--resume', requireText(sessionId, 'sessionId'));
  return args;
}

const codexProtectionPaths = worktree => [path.join(worktree, '.git'), path.join(worktree, '.codex')];

export function assertCodexProtection(entries, worktree) {
  if (!codexProtectionPaths(worktree).every((name, index) =>
    entries[index]?.[0] === name && entries[index]?.[1] === 'read' && entries[index]?.length === 2)) {
    throw Error('Codex profile protection entries missing');
  }
}

export function codexFilesystemEntries({worktree, gitDir, gitCommonDir, hostDir, grants, forbidden}, toolPaths = TOOL_PATHS) {
  const protectedPaths = codexProtectionPaths(worktree);
  if (CODEX_PROFILE_GIT_ENTRIES) protectedPaths.push(...[gitDir, gitCommonDir].filter(Boolean));
  const entries = [...new Set(protectedPaths)].map(name => [name, 'read']);
  if (hostDir) entries.push([hostDir, 'read']);
  for (const name of grants.paths.map(id => toolPaths[id]).sort()) {
    if (!path.isAbsolute(name)) throw Error('Absolute tool path required');
    entries.push([name, 'write']);
  }
  if (grants.network === 'domains') {
    for (const name of [...new Set(forbidden.readWhenExternal.map(entry => entry.path))].sort()) entries.push([name, 'none']);
  }
  return entries;
}

export function renderCodexTable(entries) {
  return '{' + entries.map(([key, value]) => JSON.stringify(key) + '=' + JSON.stringify(value)).join(',') + '}';
}

function codexProfileSettings(toolContext, worktree, toolPaths) {
  const {grants, scratch} = toolContext;
  const entries = codexFilesystemEntries(toolContext, toolPaths);
  assertCodexProtection(entries, worktree);
  const profile = 'permissions.arc_bridge';
  const settings = ['-c', `${profile}.extends=":workspace"`, '-c', `${profile}.filesystem=${renderCodexTable(entries)}`];
  if (grants.network !== null) {
    const domains = ['127.0.0.1', ...[...grants.domains].sort()].map(name => [name, 'allow']);
    const sockets = [path.join(scratch, 'sock'), ...grants.unixSockets.map(id => TOOL_UNIX_SOCKETS[id]).sort()].map(name => [name, 'allow']);
    settings.push('-c', `${profile}.network.enabled=true`,
      '-c', `${profile}.network.domains=${renderCodexTable(domains)}`,
      '-c', `${profile}.network.allow_local_binding=true`,
      '-c', `${profile}.network.unix_sockets=${renderCodexTable(sockets)}`);
  }
  return settings;
}

export function buildCodexArgs({role, profile, worktree, resultPath, threadId = null, policy = DEFAULT_POLICY, toolContext = null},
  {toolPaths = TOOL_PATHS} = {}) {
  void policy;
  const permissions = permissionsFor('codex', role);
  if (typeof resultPath !== 'string' || !path.isAbsolute(resultPath)) throw Error('Absolute resultPath required');
  const writerContext = permissions.sandboxMode === 'workspace-write' ? toolContext : null;
  const profileMode = writerContext?.grants.mechanisms.includes('codexProfile');
  const settings = [];
  if (profileMode) {
    if (CODEX_PROFILE_ARGS_FORM === 'B') {
      settings.push('-c', 'default_permissions="arc_bridge"');
      if (writerContext.grants.network !== null) settings.push('-c', 'features.network_proxy=true');
    } else {
      settings.push('-P', 'arc_bridge');
      if (writerContext.grants.network !== null) settings.push('--enable', 'network_proxy');
    }
  }
  settings.push('-m', requireText(profile?.model, 'model'), '-c', `model_reasoning_effort=${JSON.stringify(requireText(profile.effort, 'effort'))}`,
    '-c', `developer_instructions=${JSON.stringify(requireText(profile.instructions, 'instructions'))}`);
  if (profileMode) settings.push(...codexProfileSettings(writerContext, worktree, toolPaths));
  else settings.push('-c', `sandbox_mode=${JSON.stringify(permissions.sandboxMode)}`);
  settings.push('-c', 'approval_policy="never"');
  for (const [key, value] of writerContext?.env ?? []) {
    settings.push('-c', `shell_environment_policy.set.${key}=${JSON.stringify(value)}`);
  }
  if (profileMode && writerContext.grants.network === 'domains') {
    settings.push('-c', `shell_environment_policy.exclude=${JSON.stringify(writerContext.forbidden.envWhenExternal)}`);
  }
  settings.push('-o', resultPath, '-');
  if (threadId !== null) {
    if (typeof threadId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(threadId)) throw Error('Invalid threadId');
    return [...(permissions.search ? ['--search'] : []), 'exec', 'resume', threadId, '--json', ...settings];
  }
  if (typeof worktree !== 'string' || !path.isAbsolute(worktree)) throw Error('Absolute worktree required');
  return [...(permissions.search ? ['--search'] : []), 'exec', '--json', '-C', worktree, ...settings];
}

export const argsDigest = args => 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex');

/** L5 verifies run/observe/cancel and isolation; UUID resume remains unverified. */
export function buildGeminiArgs({role, model, profile, sessionId, policyFile, promptFlag = GEMINI_CONTRACT.prompt, resume = false}) {
  const permissions = permissionsFor('gemini', role);
  if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw Error('Gemini sessionId must be a UUID');
  if (typeof policyFile !== 'string' || !path.isAbsolute(policyFile)) throw Error('Absolute policyFile required');
  if (promptFlag !== GEMINI_CONTRACT.prompt) throw Error('Unsupported Gemini prompt');
  const selectedModel = requireText(model ?? profile?.model, 'model');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(selectedModel) || selectedModel === 'yolo') throw Error('Invalid Gemini model');
  const args = ['-p', promptFlag, '-m', selectedModel, '-o', 'stream-json', '--session-id', sessionId,
    '--approval-mode', permissions.approvalMode, '--policy', policyFile];
  if (permissions.sandbox) args.push('--sandbox');
  args.push(...GEMINI_CONTRACT.isolationArgs);
  if (resume) args.push(GEMINI_CONTRACT.resumeFlag, sessionId);
  return args;
}

export function buildGrokArgs({role, profile, sessionId, promptFile, sandboxProfile}) {
  const permissions = permissionsFor('grok', role);
  if (typeof promptFile !== 'string' || !path.isAbsolute(promptFile)) throw Error('Absolute promptFile required');
  if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw Error('Grok sessionId must be a UUID');
  const model = requireText(profile?.model, 'model');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(model)) throw Error('Invalid Grok model');
  const sandbox = permissions.sandbox === 'custom' ? sandboxProfile : permissions.sandbox;
  if (permissions.sandbox === 'custom' && (typeof sandbox !== 'string' || !/^arc-bridge-[0-9a-f]{8}$/.test(sandbox))) throw Error('Invalid Grok sandbox profile');
  return ['--prompt-file', promptFile, '--output-format', GROK_CONTRACT.outputFormat, '-m', model, '--session-id', sessionId,
    '--permission-mode', permissions.permissionMode, '--sandbox', sandbox,
    ...permissions.deny.flatMap(rule => ['--deny', rule]), ...GROK_CONTRACT.isolationArgs];
}
