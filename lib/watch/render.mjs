import {WATCH_LIMITS, VERBOSE_KINDS} from './model.mjs';
import {sanitizeText, clipCodePoints} from './policy.mjs';

export function kindTag(event) {
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
  const rawLabel = sanitizeText(event.label ?? (event.source === 'watch' ? 'watch' : ''));
  const labelPoints = [...rawLabel];
  const label = (labelPoints.length > WATCH_LIMITS.labelWidth
    ? '~' + labelPoints.slice(-(WATCH_LIMITS.labelWidth - 1)).join('') : rawLabel).padEnd(WATCH_LIMITS.labelWidth);
  const tag = sanitizeText(kindTag(event)).padEnd(8);
  const prefix = `${time} ${platform} ${label} ${tag} `;
  const text = eventText(event, verbose);
  const plain = clipCodePoints(prefix + text, width).text;
  if (!color || [...prefix].length > width) return plain;
  const failure = ['turn_failed','tool_failed','error'].includes(event.kind) || (event.kind === 'command' && event.exitCode != null && event.exitCode !== 0);
  const paint = (value, code) => `\x1b[${code}m${value}\x1b[0m`;
  const tagColor = failure ? 31 : event.kind === 'user' ? 1 : VERBOSE_KINDS.includes(event.kind) ? 2 : 36;
  const clippedText = [...plain].slice([...prefix].length).join('');
  return `${time} ${paint(platform, event.platform === 'codex' ? 36 : event.platform === 'claude' ? 35 : 2)} ${label} ${paint(tag, tagColor)} ${failure && clippedText ? paint(clippedText, 31) : clippedText}`;
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
    if (key === 'text') {
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
