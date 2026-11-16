import path from 'node:path';
import {WATCH_LIMITS, MESSAGE_KINDS} from './model.mjs';
import {sanitizeText, sanitizeMessage, clipCodePoints} from './policy.mjs';
import {realPath} from './scope.mjs';

const graphemes = new Intl.Segmenter(undefined, {granularity:'grapheme'});
const roleLabels = new Map([
  ['scouter','SCOUTER'], ['planner','PLANNER'], ['implementer','IMPLEMENTER'],
  ['qa','QA'], ['reviewer','REVIEWER'], ['orchestrator','ORCHESTRATOR'],
]);
const roleBadgeColors = new Map([
  ['scouter','1;38;5;159;48;5;23'], ['planner','1;38;5;189;48;5;60'],
  ['implementer','1;38;5;153;48;5;24'], ['qa','1;38;5;194;48;5;22'],
  ['reviewer','1;38;5;225;48;5;53'], ['orchestrator','1;38;5;255;48;5;238'],
]);
const zeroWidth = /^[\u0300-\u036f\u200b-\u200f\ufe00-\ufe0f]+$/u;
const wide = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]/u;
function graphemeWidth(text) {
  if (zeroWidth.test(text)) return 0;
  if (wide.test(text) || /\p{Emoji_Presentation}/u.test(text) || (/[\u200d\ufe0f]/u.test(text) && /\p{Extended_Pictographic}/u.test(text))) return 2;
  return 1;
}

export function displayWidth(text) {
  let width = 0;
  for (const {segment} of graphemes.segment(text)) width += graphemeWidth(segment);
  return width;
}

export function wrapLine(text, avail) {
  if (avail <= 0) return [text];
  const parts = [...graphemes.segment(text)].map(({segment}) => segment);
  const widths = parts.map(graphemeWidth);
  const lines = [];
  let start = 0;
  while (start < parts.length) {
    let end = start, cols = 0, space = -1, hasContent = false;
    while (end < parts.length && cols + widths[end] <= avail) {
      if (parts[end] === ' ') { if (hasContent) space = end; }
      else hasContent = true;
      cols += widths[end++];
    }
    if (end === parts.length) {
      const piece = parts.slice(start).join('');
      if (piece.trim()) lines.push(piece);
      break;
    }
    // A space immediately after a full line can be discarded as the boundary.
    if (parts[end] === ' ' && hasContent) space = end;
    let piece;
    if (space >= 0) {
      piece = parts.slice(start,space).join('');
      start = space + 1;
    } else {
      end = Math.max(start + 1,end);
      piece = parts.slice(start,end).join('');
      start = end;
    }
    if (piece.trim()) lines.push(piece);
  }
  return lines.length ? lines : [''];
}

export const PLATFORM_COLORS = Object.freeze({codex:'36', claude:'38;5;208', other:'2'});

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
  return ({command:'38;5;242', user:'1;35', agent:'32', file_change:'33', file_create:'38;5;69', file_delete:'31', tool:'2', spawn:'38;5;141',
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
    turn_failed:'FAIL', user:'USER', agent:'AGENT', reasoning:'THINK', tool:'TOOL',
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
  const bodyLines = message ? (text ? text.split('\n') : []) : fullLine
    ? [event.text, ...(event.paths ?? []).map(file => displayPath(file,event.root))].map(sanitizeText).filter(Boolean) : [];
  const roleName = event.kind === 'agent' ? roleLabels.get(event.role) : undefined;
  if (roleName && bodyLines.length) bodyLines[0] = `${roleName} ${bodyLines[0]}`;
  const indent = ' '.repeat([...prefix].length);
  const avail = width - Math.max([...prefix].length, displayWidth(prefix));
  const lines = wrap && avail >= WATCH_LIMITS.wrapMinBody ? bodyLines.flatMap(line => wrapLine(line,avail)) : bodyLines;
  const bodyText = paintLine => lines.map((line,i) => !line ? '' : (i ? indent : '') + paintLine(line,i)).join('\n');
  const plain = fullLine ? (message && !lines.length ? prefix.trimEnd() : prefix + bodyText(line => line)) : clipCodePoints(prefix + text, width).text;
  if (!color || (!fullLine && [...prefix].length > width)) return plain;
  const code = bodyColor(event);
  const paint = (value, code) => `\x1b[${code}m${value}\x1b[0m`;
  const platformColor = event.source === 'watch' ? PLATFORM_COLORS.other : PLATFORM_COLORS[event.platform] ?? PLATFORM_COLORS.other;
  const paintedTag = paint(tag.trimEnd(), tagColor(event));
  const padding = tag.slice(tag.trimEnd().length);
  const clippedText = [...plain].slice([...prefix].length).join('');
  if (message && !text) return `${time} ${paint(platform, platformColor)} ${paintedTag}`;
  const body = fullLine ? bodyText((line,i) => {
    if (roleName && i === 0) {
      line = paint(roleName,roleBadgeColors.get(event.role)) + (code ? `\x1b[${code}m` : '') + line.slice(roleName.length);
    }
    return code ? paint(line,code) : line;
  })
    : code && clippedText ? paint(clippedText, code) : clippedText;
  return `${time} ${paint(platform, platformColor)} ${paintedTag}${padding} ${body}`;
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
