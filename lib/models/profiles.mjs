import {validateClaudeHookCommand} from '../policy/claude-hook.mjs';
import { parseToml, exactKeys, validateRoles, effortField, ROLES, fail } from './config.mjs';
const tools = {
  arc_scouter: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'],
  arc_planner: ['Read', 'Grep', 'Glob'],
  arc_implementer: ['Read', 'Grep', 'Glob', 'Bash', 'Write', 'Edit'],
  arc_qa: ['Read', 'Grep', 'Glob', 'Bash'],
  arc_reviewer: ['Read', 'Grep', 'Glob'],
};
function decode(buffer) {
  if (!Buffer.isBuffer(buffer)) fail('Profile input must be a verified Buffer');
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) fail('Profile must not start with a UTF-8 BOM');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { fail('Profile must contain valid UTF-8'); }
}
function linesOf(text) { return text.match(/[^\n]*\n|[^\n]+$/g) ?? []; }
// Track TOML strings and value nesting so instructions, inline tables and array
// continuations cannot be mistaken for root assignments. The parser validates
// syntax independently; the scanner only locates narrowly editable lines.
function locateRootFields(lines) {
  let quote = null, depth = 0, root = true, firstTable = null;
  const fields = new Map();
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    if (quote === null && depth === 0 && root) {
      if (/^[ \t]*\[/.test(line)) { root = false; firstTable = lineNumber; }
      else {
        const assignment = /^[ \t]*((?:[A-Za-z0-9_-]+)|(?:"(?:\\.|[^"\\])*"|'[^']*'))[ \t]*=/.exec(line);
        if (assignment) {
          const rawKey = assignment[1]; const parsed = parseToml(`${rawKey} = ""`); const key = Object.keys(parsed)[0];
          if (['model', 'model_reasoning_effort'].includes(key)) {
            if (![key, `"${key}"`, `'${key}'`].includes(rawKey) || fields.has(key)) fail('Unsupported root model assignment');
            fields.set(key, lineNumber);
          }
        }
      }
    }
    for (let i = 0; i < line.length;) {
      if (quote !== null) {
        if (quote.startsWith('"') && line[i] === '\\') { i += 2; continue; }
        if (line.startsWith(quote, i)) {
          if (quote.length === 3) { const char = quote[0]; let end = i + 3; while (line[end] === char) end++; i = end; }
          else i++;
          quote = null;
        } else i++;
      } else if (line[i] === '#') break;
      else if (line[i] === '"' || line[i] === "'") { quote = line.startsWith(line[i].repeat(3), i) ? line[i].repeat(3) : line[i]; i += quote.length; }
      else { if ('[{'.includes(line[i])) depth++; else if (']}'.includes(line[i])) depth--; i++; }
    }
  }
  return { fields, firstTable };
}
function renderCodex(text, role, settings) {
  const parsed = parseToml(text); if (parsed.name !== role) fail('Codex profile name does not match role filename');
  const lines = linesOf(text), { fields, firstTable } = locateRootFields(lines);
  const missing = [];
  for (const key of ['model', 'model_reasoning_effort']) {
    if (!Object.hasOwn(parsed, key)) { if (fields.has(key)) fail('Ambiguous root model field'); missing.push(key); continue; }
    if (typeof parsed[key] !== 'string' || !fields.has(key)) fail('Root model field must be an editable one-line quoted string');
    const index = fields.get(key);
    const match = /^([ \t]*(?:model|model_reasoning_effort|"model"|"model_reasoning_effort"|'model'|'model_reasoning_effort')[ \t]*=[ \t]*)("(?:\\.|[^"\\\r\n])*"|'[^'\r\n]*')([ \t]*(?:#[^\r\n]*)?)(\r?\n)?$/.exec(lines[index]);
    if (!match) fail('Root model field must be an editable one-line quoted string');
    if (parsed[key] !== settings[key]) lines[index] = match[1] + JSON.stringify(settings[key]) + match[3] + (match[4] ?? '');
  }
  let output = lines.join('');
  if (missing.length) {
    const eol = /\r?\n/.exec(text)?.[0] ?? '\n';
    let addition = missing.map(key => `${key} = ${JSON.stringify(settings[key])}${eol}`).join('');
    const offset = firstTable === null ? output.length : lines.slice(0, firstTable).join('').length;
    if (offset && !/[\r\n]$/.test(output.slice(0, offset))) addition = eol + addition;
    output = output.slice(0, offset) + addition + output.slice(offset);
  }
  const checked = parseToml(output);
  if (checked.name !== role || Object.entries(settings).some(([key, value]) => checked[key] !== value)) fail('Rendered Codex profile does not match settings');
  return Buffer.from(output);
}
// Validate the consumed hook subset without rewriting any hook/user bytes.
// The two ARC entries are exact contracts; user command entries remain data.
function validateClaudeHooks(lines){
 const managed=new Map();let event;const events=new Set();
 if(lines[0]!=='hooks:')fail('Unsupported managed Claude hooks');
 for(let i=1;i<lines.length;){
  const heading=/^  (PreToolUse|PostToolUse|SubagentStart):$/.exec(lines[i]);
  if(heading){event=heading[1];if(events.has(event))fail('Duplicate Claude hook event');events.add(event);i++;continue;}
  if(!event)fail('Unsupported Claude hook event');
  const matcher=/^    - matcher: (.+)$/.exec(lines[i]);
  let parsedMatcher,command;
  try{
   if(!matcher)throw Error('Missing matcher');
   parsedMatcher=matcher[1].startsWith('"')?JSON.parse(matcher[1]):matcher[1];
   if(typeof parsedMatcher!=='string'||!parsedMatcher||/[\r\n\x00]/.test(parsedMatcher)||(!matcher[1].startsWith('"')&&!/^[A-Za-z][A-Za-z0-9_|]*$/.test(parsedMatcher)))throw Error('Invalid matcher');
   if(lines[i+1]!=='      hooks:'||lines[i+2]!=='        - type: command'||!lines[i+3]?.startsWith('          command: '))throw Error('Unsupported command entry');
   command=JSON.parse(lines[i+3].slice('          command: '.length));
   if(typeof command!=='string'||!command||/[\r\n\x00]/.test(command))throw Error('Invalid command');
  }catch{fail('Unsupported managed Claude hooks');}
  let isManaged=false;
  try{validateClaudeHookCommand(command);isManaged=true;}catch{}
  const hasFailure=lines[i+4]?.startsWith('          onFailure:');
  if(isManaged){
   if(lines[i+4]!=='          onFailure: block')fail('Unsupported managed Claude failure behavior');
   const encoded=/"([A-Za-z0-9+/]+={0,2})"$/.exec(command)[1];
   const url=new URL(Buffer.from(encoded,'base64').toString('utf8'));const file=url.pathname.split('/').at(-1);
   const expected=file==='runtime-gate.mjs'?'"*"':'Bash';
   if(event!=='PreToolUse'||matcher[1]!==expected||!hasFailure||managed.has(file))fail('Malformed or duplicate managed Claude hooks');
   managed.set(file,url.href.slice(0,url.href.lastIndexOf('/')+1));
  }else{
   if(hasFailure&&!['          onFailure: continue','          onFailure: block'].includes(lines[i+4]))fail('Unsupported Claude failure behavior');
   if(/runtime-gate\.mjs|role-git-guard\.mjs/.test(command))fail('Unrecognized managed Claude hook command');
  }
  i+=hasFailure?5:4;
 }
 if(managed.size!==1||!managed.has('role-git-guard.mjs'))fail('Missing or mismatched managed Claude hooks');
}
function renderClaude(text, role, settings) {
  const lines = linesOf(text); if (lines[0]?.replace(/\r?\n$/, '') !== '---') fail('Missing opening Claude frontmatter');
  const fields = {}, indices = {}; let current, closed = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r?\n$/, ''); if (line === '---') { closed = true; break; }
    if(line==='hooks:') {
      if(Object.hasOwn(fields,'hooks'))fail('Duplicate Claude hooks');
      let end=i+1;while(end<lines.length&&/^[ \t]/.test(lines[end]))end++;
      validateClaudeHooks(lines.slice(i,end).map(x=>x.replace(/\r?\n$/,'')));
      fields.hooks=true;indices.hooks=i;i=end-1;current='hooks';continue;
    }
    const item = /^  - ([A-Za-z][A-Za-z0-9]*)$/.exec(line);
    if (item && current === 'tools') { fields.tools.push(item[1]); continue; }
    const match = /^([a-z][a-zA-Z0-9_-]*):(?: (.+))?$/.exec(line);
    if (!match || Object.hasOwn(fields, match[1])) fail('Malformed or duplicate Claude frontmatter');
    const [, key, value] = match; current = key; indices[key] = i;
    if (key === 'tools') { if (value !== undefined) fail('Claude tools must be an explicit list'); fields.tools = []; }
    else { if (!value || value !== value.trim() || /[\t\x00{}\[\]#&*!|>"']/.test(value) || value.includes(': ')) fail('Claude frontmatter requires plain scalar values'); fields[key] = value; }
  }
  if (!closed || !['name', 'description', 'model', 'effort', 'tools', 'hooks'].every(key => Object.hasOwn(fields, key)) || fields.name !== role.replace('_', '-') || JSON.stringify(fields.tools) !== JSON.stringify(tools[role])) fail('Invalid Claude profile identity or role tools');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(fields.model) || !['low','medium','high','xhigh','max'].includes(fields.effort)) fail('Invalid Claude profile model or effort');
  for (const key of ['model', 'effort']) { const index = indices[key], eol = /\r?\n$/.exec(lines[index])?.[0] ?? ''; lines[index] = `${key}: ${settings[key]}${eol}`; }
  return Buffer.from(lines.join(''));
}
export function renderProfiles(profileBuffers, config) {
  exactKeys(config, ['platform', 'roles'], 'effective model settings');
  const platform = config.platform, validated = {roles: validateRoles(config.roles, platform)}, extension = platform === 'codex' ? 'toml' : 'md';
  if (profileBuffers instanceof Map) profileBuffers = Object.fromEntries(profileBuffers);
  profileBuffers = { ...profileBuffers };
  const legacy = `arc-coder.${extension}`, canonical = `arc-implementer.${extension}`;
  if (Object.hasOwn(profileBuffers, legacy)) {
    if (Object.hasOwn(profileBuffers, canonical)) fail('Conflicting legacy and canonical profiles');
    const original = decode(profileBuffers[legacy]);
    const renamed = platform === 'codex'
      ? original.replace(/^(\s*name\s*=\s*)(["'])arc_coder\2/m, '$1"arc_implementer"')
      : original.replace(/^name: arc-coder(?=\r?$)/m, 'name: arc-implementer');
    profileBuffers[canonical] = Buffer.from(renamed);
    delete profileBuffers[legacy];
  }
  const names = ROLES.map(role => `${role.replace('_', '-')}.${extension}`);
  if (!profileBuffers || Object.keys(profileBuffers).length !== names.length || names.some(name => !Object.hasOwn(profileBuffers, name))) fail('Profile set must contain exactly the five platform role files');
  return new Map(names.map((name, index) => {
    const role = ROLES[index], text = decode(profileBuffers[name]);
    return [name, platform === 'codex' ? renderCodex(text, role, validated.roles[role]) : renderClaude(text, role, validated.roles[role])];
  }));
}
