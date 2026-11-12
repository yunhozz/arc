import {WATCH_LIMITS, MESSAGE_KINDS} from './model.mjs';
import {sanitizeText, sanitizeMessage, clipCodePoints} from './policy.mjs';

export const PLATFORM_COLORS = Object.freeze({codex:'36', claude:'38;5;208', other:'2'});

export function tagColor(event) {
  if (event.kind === 'command') return event.exitCode == null || event.exitCode === 0 ? '38;5;242' : '31';
  return ({user:'1;35', agent:'32', file_change:'33', tool:'2', spawn:'38;5;141',
    dispatch:'38;5;137', approval:'1;4', turn_failed:'31', error:'31', tool_failed:'31'})[event.kind] ?? '2';
}

export function bodyColor(event) {
  const code = tagColor(event);
  return code.startsWith('38;5;') ? code : code.split(';').filter(value => value !== '1' && value !== '4').join(';');
}

export function kindTag(event) {
  if (event.kind === 'agent') {
    const name = event.role || (event.source === 'subagent' && event.label?.includes('/') ? event.label.split('/').at(-1) : '');
    const safeName = clipCodePoints(sanitizeText(name), WATCH_LIMITS.agentNameMax).text;
    return safeName ? `AGENT(${safeName})` : 'AGENT';
  }
  if (event.kind === 'command') return event.exitCode == null ? 'CMD' : `CMD(${event.exitCode})`;
  return ({session:'SESSION', settings:'SETTINGS', turn_start:'TURN', turn_end:'END',
    turn_failed:'FAIL', user:'USER', agent:'AGENT', reasoning:'THINK', tool:'TOOL',
    tool_failed:'TOOL!', file_change:'EDIT', spawn:'SPAWN', approval:'APPROVE',
    dispatch:'DISPATCH', error:'ERROR', other:'ITEM', notice:'NOTICE'})[event.kind] ?? 'ITEM';
}

function eventText(event, verbose) {
  if (event.kind === 'tool' || event.kind === 'tool_failed') {
    return [event.tool, event.text].map(sanitizeText).filter(Boolean).join(' ');
  }
  if (event.kind === 'file_change') {
    return [event.text, ...(event.paths ?? [])].map(sanitizeText).filter(Boolean).join(' ');
  }
  if (event.kind !== 'dispatch') return sanitizeText(event.text);
  return sanitizeText([event.state, event.route, event.workflowId,
    event.reasons?.join(','), verbose && event.hostPlatform ? `host=${event.hostPlatform}` : undefined,
  ].filter(Boolean).join(' '));
}

export function renderHuman(event, {width, color, verbose}) {
  let date = new Date(event.ts);
  if (Number.isNaN(date.getTime())) date = new Date(event.observedAt);
  const time = Number.isNaN(date.getTime()) ? '00:00:00' : date.toLocaleTimeString('en-GB', {hour12:false});
  const platform = sanitizeText(event.source === 'watch' ? 'watch' : event.platform ?? 'arc').slice(0,6).padEnd(6);
  const tag = sanitizeText(kindTag(event)).padEnd(8);
  const prefix = `${time} ${platform} ${tag} `;
  const message = MESSAGE_KINDS.includes(event.kind);
  const text = message ? sanitizeMessage(event.text) : eventText(event, verbose);
  const messageBody = text.split('\n').map((line, i) => !line ? '' : (i ? ' '.repeat([...prefix].length) : '') + line).join('\n');
  const plain = message ? (text ? prefix + messageBody : prefix.trimEnd()) : clipCodePoints(prefix + text, width).text;
  if (!color || (!message && [...prefix].length > width)) return plain;
  const code = bodyColor(event);
  const paint = (value, code) => `\x1b[${code}m${value}\x1b[0m`;
  const platformColor = event.source === 'watch' ? PLATFORM_COLORS.other : PLATFORM_COLORS[event.platform] ?? PLATFORM_COLORS.other;
  const paintedTag = paint(tag.trimEnd(), tagColor(event));
  const padding = tag.slice(tag.trimEnd().length);
  const clippedText = message ? messageBody : [...plain].slice([...prefix].length).join('');
  if (message && !text) return `${time} ${paint(platform, platformColor)} ${paintedTag}`;
  const body = message ? text.split('\n').map((line, i) => !line ? '' : (i ? ' '.repeat([...prefix].length) : '') + (code ? paint(line, code) : line)).join('\n')
    : code && clippedText ? paint(clippedText, code) : clippedText;
  return `${time} ${paint(platform, platformColor)} ${paintedTag}${padding} ${body}`;
}

export function renderJson(event) {
  const fields = ['ts','observedAt','platform','source','origin','sessionId','parentId','depth',
    'label','role','dispatchId','workflowId','kind','text','truncated','exitCode','tool','paths',
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
      output[key] = (key === 'paths' ? value.slice(0, WATCH_LIMITS.pathsMax) : value)
        .filter(item => item != null).map(item => sanitizeText(item));
    } else {
      output[key] = typeof value === 'string' ? sanitizeText(value) : value;
    }
  }
  return JSON.stringify(output);
}
