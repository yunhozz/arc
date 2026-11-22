import path from 'node:path';
import {WATCH_LIMITS, MESSAGE_KINDS} from './model.mjs';
import {sanitizeText, sanitizeMessage, clipCodePoints} from './policy.mjs';
import {realPath} from './scope.mjs';
import {renderMarkdown} from './markdown.mjs';
import {displayWidth, wrapLine} from './text-width.mjs';

export {displayWidth, wrapLine} from './text-width.mjs';

const roleLabels = new Map([
  ['scouter','SCOUTER'], ['planner','PLANNER'], ['implementer','IMPLEMENTER'],
  ['qa','QA'], ['reviewer','REVIEWER'], ['orchestrator','ORCHESTRATOR'],
]);
const roleBadgeColors = new Map([
  ['scouter','1;38;5;16;48;5;117'], ['planner','1;38;5;231;48;5;98'],
  ['implementer','1;38;5;16;48;5;214'], ['qa','1;38;5;16;48;5;228'],
  ['reviewer','1;38;5;231;48;5;161'], ['orchestrator','1;38;5;16;48;5;255'],
]);
export const PLATFORM_COLORS = Object.freeze({codex:'36', claude:'38;5;208', gemini:'38;5;135', other:'2'});

// Compare both the lexical root and its real path (e.g. /tmp and /private/tmp).
export function displayPath(file, root) {
  if (!root || !path.isAbsolute(root) || !path.isAbsolute(file)) return file;
  for (const base of [path.resolve(root), realPath(root)]) {
    if (file === base || file.startsWith(base.endsWith(path.sep) ? base : base + path.sep)) {
      const relative = path.relative(base,file).split(path.sep).join('/');
      return path.basename(root) + (relative ? '/' + relative : '');
    }
  }
  return file;
}

export function tagColor(event) {
  if (event.kind === 'tool' && event.skill) return '38;5;110';
  if (event.kind === 'tool' && event.plugin) return '38;5;175';
  return ({command:'38;5;242', user:'1;97', prompt:'1;35', agent:'32', file_change:'33', file_create:'38;5;69', file_delete:'31', tool:'38;5;101', spawn:'38;5;141',
    dispatch:'38;5;137', approval:'1;4', turn_failed:'31', error:'31', tool_failed:'31'})[event.kind] ?? '2';
}

export function bodyColor(event) {
  const code = tagColor(event);
  return code.startsWith('38;5;') ? code : code.split(';').filter(value => value !== '1' && value !== '4').join(';');
}

export function kindTag(event) {
  if (event.kind === 'tool' && event.skill) return 'SKILL';
  if (event.kind === 'tool' && event.plugin) return 'PLUGIN';
  return ({command:'CMD', session:'SESSION', settings:'SETTINGS', turn_start:'TURN', turn_end:'END',
    turn_failed:'FAIL', user:'USER', prompt:'PROMPT', agent:'AGENT', reasoning:'THINK', tool:'TOOL',
    tool_failed:'TOOL!', file_change:'EDIT', file_create:'CREATE', file_delete:'DELETE', spawn:'SPAWN', approval:'APPROVE',
    dispatch:'DISPATCH', error:'ERROR', other:'ITEM', notice:'NOTICE'})[event.kind] ?? 'ITEM';
}

function eventText(event, verbose) {
  if (event.kind === 'tool' || event.kind === 'tool_failed') {
    if (event.kind === 'tool' && event.skill) return sanitizeText(event.skill);
    if (event.kind === 'tool' && event.plugin) return [event.plugin, event.tool].map(sanitizeText).filter(Boolean).join(' ');
    if (event.kind === 'tool_failed' && (event.skill || event.plugin)) return [event.tool, event.skill || event.plugin].map(sanitizeText).filter(Boolean).join(' ');
    return [event.tool, event.text].map(sanitizeText).filter(Boolean).join(' ');
  }
  if (event.kind !== 'dispatch') return sanitizeText(event.text);
  return sanitizeText([event.state, event.route, event.workflowId,
    event.reasons?.join(','), verbose && event.hostPlatform ? `host=${event.hostPlatform}` : undefined,
  ].filter(Boolean).join(' '));
}

export function renderHuman(event, {width, color, verbose, wrap = false}) {
  let date = new Date(event.ts);
  if (Number.isNaN(date.getTime())) date = new Date(event.observedAt);
  const time = Number.isNaN(date.getTime()) ? '00:00:00' : date.toLocaleTimeString('en-GB', {hour12:false});
  const platform = sanitizeText(event.source === 'watch' ? 'watch' : event.platform?.toUpperCase() ?? 'arc').slice(0,6).padEnd(6);
  const tag = sanitizeText(kindTag(event)).padEnd(8);
  const prefix = `${time} ${platform} ${tag} `;
  const message = MESSAGE_KINDS.includes(event.kind);
  const fullLine = message || event.kind === 'file_change' || event.kind === 'file_create' || event.kind === 'file_delete';
  const text = message ? sanitizeMessage(event.text) : eventText(event, verbose);
  const roleName = event.kind === 'agent' ? roleLabels.get(event.role) : undefined;
  const indent = ' '.repeat([...prefix].length);
  const avail = width - Math.max([...prefix].length, displayWidth(prefix));
  const canWrap = wrap && avail >= WATCH_LIMITS.wrapMinBody;
  const paint = (value, code) => `\x1b[${code}m${value}\x1b[0m`;
  const paintedPrefix = () => {
    const platformColor = event.source === 'watch' ? PLATFORM_COLORS.other : PLATFORM_COLORS[event.platform] ?? PLATFORM_COLORS.other;
    return `${time} ${paint(platform, platformColor)} ${paint(tag.trimEnd(), tagColor(event))}`;
  };
  const padding = tag.slice(tag.trimEnd().length);
  const roleBadge = () => paint(` ${roleName} `,roleBadgeColors.get(event.role));
  if (color && fullLine && (event.kind === 'agent' || event.kind === 'prompt')) {
    const lines = text ? renderMarkdown(text, {width:canWrap ? avail : Infinity, baseCode:bodyColor(event)}) : [];
    if (text && roleName) lines.unshift(roleBadge());
    const body = lines.map((line,i) => i && line ? indent + line : line).join('\n');
    return body ? `${paintedPrefix()}${padding} ${body}` : paintedPrefix();
  }

  const paths = fullLine && !message ? (event.paths ?? []).map(file => sanitizeText(displayPath(file,event.root))).filter(Boolean) : [];
  const listPaths = paths.length >= 2;
  const inferred = event.inferred === true ? '(inferred)' : '';
  const pathLines = listPaths ? paths.map(file => '- ' + file) : paths.map(file => [file,inferred].filter(Boolean).join(' '));
  const bodyLines = message ? (text ? text.split('\n') : []) : fullLine
    ? [listPaths && inferred, sanitizeText(event.text), ...pathLines].filter(Boolean) : [];
  if (roleName && bodyLines.length) bodyLines.unshift(roleName);
  const lines = canWrap ? bodyLines.flatMap((line,i) =>
    listPaths && paths.length && i >= bodyLines.length - paths.length
      ? wrapLine(line.slice(2),avail-2).map((piece,j) => (j ? '  ' : '- ') + piece)
      : wrapLine(line,avail)) : bodyLines;
  const bodyText = paintLine => lines.map((line,i) => !line ? '' : (i ? indent : '') + paintLine(line,i)).join('\n');
  const plain = fullLine ? (message && !lines.length ? prefix.trimEnd() : prefix + bodyText(line => line)) : clipCodePoints(prefix + text, width).text;
  if (!color || (!fullLine && [...prefix].length > width)) return plain;
  const code = bodyColor(event);
  const clippedText = [...plain].slice([...prefix].length).join('');
  if (message && !text) return paintedPrefix();
  const body = fullLine ? bodyText(line => code ? paint(line,code) : line)
    : code && clippedText ? paint(clippedText, code) : clippedText;
  return `${paintedPrefix()}${padding} ${body}`;
}

export function renderJson(event) {
  const fields = ['ts','observedAt','platform','source','origin','sessionId','parentId','depth',
    'label','role','dispatchId','workflowId','kind','text','truncated','exitCode','tool','skill','plugin','paths','inferred',
    'model','effort','approval','state','reasons','route','hostPlatform','cwd'];
  const output = {v:1};
  for (const key of fields) {
    const value = event[key];
    if (value == null) continue;
    if (key === 'platform' && event.source === 'watch') continue;
    if (key === 'truncated' && MESSAGE_KINDS.includes(event.kind)) continue;
    if (key === 'text' && MESSAGE_KINDS.includes(event.kind)) {
      output.text = sanitizeMessage(value);
    } else if (key === 'text') {
      const clipped = clipCodePoints(sanitizeText(value), WATCH_LIMITS.jsonTextMax);
      output.text = clipped.text;
      if (clipped.truncated) output.truncated = true;
    } else if (key === 'truncated') {
      if (value || output.truncated) output.truncated = true;
    } else if (Array.isArray(value)) {
      output[key] = value.filter(item => item != null).map(item => sanitizeText(item));
    } else {
      output[key] = typeof value === 'string' ? sanitizeText(value) : value;
    }
  }
  return JSON.stringify(output);
}
