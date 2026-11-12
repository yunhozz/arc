import {WATCH_LIMITS} from './model.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string';
const strings = values => values.filter(string);
const optional = fields => Object.fromEntries(Object.entries(fields).filter(([,value]) => value !== undefined));

export function parseCodexMeta(obj) {
  try {
    if (obj?.type !== 'session_meta' || !object(obj.payload)) return null;
    const p = obj.payload;
    if (![p.id, p.originator, p.cwd].every(string)) return null;
    const spawn = p.source?.subagent?.thread_spawn;
    const fields = {threadId:p.id, originator:p.originator, cwd:p.cwd};
    for (const [key, value] of Object.entries({
      cliVersion:p.cli_version, timestamp:p.timestamp,
      parentId:p.parent_thread_id ?? spawn?.parent_thread_id,
      agentRole:p.agent_role ?? spawn?.agent_role,
      agentNickname:p.agent_nickname ?? spawn?.agent_nickname,
      agentPath:p.agent_path ?? spawn?.agent_path,
    })) if (string(value)) fields[key] = value;
    const depth = p.depth ?? spawn?.depth;
    if (Number.isFinite(depth)) fields.depth = depth;
    return fields;
  } catch { return null; }
}

function commandText(command) {
  if (string(command)) return command;
  if (!Array.isArray(command)) return undefined;
  if (command.length === 3 && command[1] === '-lc' && string(command[2])) return command[2];
  return strings(command).join(' ');
}

function changePaths(changes) {
  const paths = [];
  if (Array.isArray(changes)) {
    for (const change of changes) paths.push(change?.path, change?.file);
  } else if (object(changes)) {
    for (const [path, change] of Object.entries(changes)) paths.push(path, change?.move_path);
  }
  return [...new Set(strings(paths))].slice(0, WATCH_LIMITS.pathsMax);
}

function splitChangePaths(changes) {
  const added = [], changed = [];
  const isAdd = change => object(change) && (change.type === 'add' || change.kind?.type === 'add' || Object.hasOwn(change,'add'));
  if (Array.isArray(changes)) {
    for (const change of changes) {
      (isAdd(change) ? added : changed).push(change?.path, change?.file);
      changed.push(change?.move_path);
    }
  } else if (object(changes)) {
    for (const [path, change] of Object.entries(changes)) {
      (isAdd(change) ? added : changed).push(path);
      changed.push(change?.move_path);
    }
  }
  const unique = paths => [...new Set(strings(paths))].slice(0,WATCH_LIMITS.pathsMax);
  return {added:unique(added),changed:unique(changed)};
}

/** Normalize one parsed rollout line; no I/O or transcript state. */
export function normalizeCodexLine(obj) {
  try {
    if (!object(obj)) return [];
    const emit = (kind, fields={}) => [optional({ts:string(obj.timestamp) ? obj.timestamp : undefined, kind, ...fields})];
    const text = value => string(value) ? value : undefined;
    if (obj.type === 'session_meta') return parseCodexMeta(obj) ? emit('session') : [];
    const p = obj.payload;
    if (!object(p)) return [];
    if (obj.type === 'response_item') {
      if (!['function_call','custom_tool_call'].includes(p.type) || !string(p.name) || !p.name.includes('spawn_agent')) return [];
      let args;
      try { args = JSON.parse(p.arguments); } catch { /* Unparseable calls still identify the tool. */ }
      const agent = text(args?.agent_type) ?? '';
      const task = text(args?.task_name);
      return emit('spawn', {tool:p.name, text:agent && task ? `${agent}: ${task}` : agent});
    }
    if (obj.type !== 'event_msg') return [];
    switch (p.type) {
      case 'thread_settings_applied': {
        const settings = p.thread_settings;
        return emit('settings', {model:text(settings?.model), effort:text(settings?.reasoning_effort), approval:text(settings?.approval_policy)});
      }
      case 'task_started': return emit('turn_start');
      case 'task_complete': return p.error ? emit('turn_failed', {text:text(p.error.message)}) : emit('turn_end');
      case 'turn_aborted': return emit('turn_end', {text:`aborted: ${text(p.reason) ?? ''}`});
      case 'exec_approval_request': return emit('approval', {text:commandText(p.command)});
      case 'apply_patch_approval_request': return emit('approval', {paths:changePaths(p.changes)});
      case 'error': return emit('error', {text:text(p.message)});
      case 'item_completed': break;
      default: return [];
    }
    const item = p.item;
    if (!object(item) || !string(item.type)) return [];
    switch (item.type) {
      case 'UserMessage':
      case 'AgentMessage':
        return emit(item.type === 'UserMessage' ? 'user' : 'agent', {text:Array.isArray(item.content) ? strings(item.content.map(part => part?.text)).join('') : ''});
      case 'Reasoning': {
        const summary = Array.isArray(item.summary_text) ? strings(item.summary_text).join('') : '';
        return summary ? emit('reasoning', {text:summary}) : [];
      }
      case 'CommandExecution': return emit('command', {text:commandText(item.command), exitCode:Number.isFinite(item.exit_code) ? item.exit_code : undefined});
      case 'FileChange':
      case 'PatchApply': {
        const {added,changed} = splitChangePaths(item.changes);
        if (!added.length) return emit('file_change', {paths:changePaths(item.changes)});
        return [...emit('file_create', {paths:added}), ...(changed.length ? emit('file_change', {paths:changed}) : [])];
      }
      case 'McpToolCall': return emit('tool', {tool:strings([item.server,item.tool]).join('.')});
      case 'Extension':
        return item.kind === 'web.search' ? emit('tool', {tool:'web.search', text:text(item.query)}) : emit('other', {text:`Extension:${text(item.kind) ?? ''}`});
      default: return emit('other', {text:item.type});
    }
  } catch { return []; }
}
