import {WATCH_LIMITS} from './model.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string';

export function createClaudeState() {
  return {modelSeen:false, tools:new Map(), writes:new Map()};
}

export function parseClaudeHead(obj) {
  try {
    if (!object(obj) || !string(obj.cwd) || !string(obj.sessionId)) return null;
    const head = {sessionId:obj.sessionId, cwd:obj.cwd};
    for (const key of ['entrypoint','version']) if (string(obj[key])) head[key] = obj[key];
    return head;
  } catch { return null; }
}

export function parseClaudeAgentMeta(obj) {
  try {
    if (!object(obj)) return null;
    const meta = {};
    for (const key of ['agentType','description']) if (string(obj[key])) meta[key] = obj[key];
    return Object.keys(meta).length ? meta : null;
  } catch { return null; }
}

function userText(content) {
  const text = string(content) ? content : Array.isArray(content)
    ? content.filter(block => block?.type === 'text' && string(block.text)).map(block => block.text).join('') : '';
  return text.replace(/<(system-reminder|command-[\w-]+|local-command-[\w-]+|task-notification|bash-input|bash-stdout|bash-stderr)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
}

/** State contains the first-model flag and bounded tool-name and pending-Write caches. */
export function normalizeClaudeLine(obj, state) {
  try {
    if (!object(obj) || !['user','assistant'].includes(obj.type) || !object(obj.message)) return [];
    if (!object(state) || !(state.tools instanceof Map)) return [];
    if (!(state.writes instanceof Map)) state.writes = new Map();
    const events = [];
    const emit = (kind, fields={}) => {
      const event = {kind, ...fields};
      if (string(obj.timestamp)) event.ts = obj.timestamp;
      events.push(event);
    };
    const message = obj.message;
    const blocks = Array.isArray(message.content) ? message.content : [];
    if (obj.type === 'user') {
      if (obj.isCompactSummary === true) {
        const text = string(message.content) ? message.content : blocks
          .filter(block => block?.type === 'text' && string(block.text)).map(block => block.text).join('');
        emit('notice', {text:`compact summary (${text.length} chars)`});
        return events;
      }
      // Results never contribute text, even when the line also has toolUseResult.
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue;
        const id = block.tool_use_id, pending = state.writes.has(id), path = state.writes.get(id);
        state.writes.delete(id);
        if (block.is_error === true) {
          const tool = state.tools.get(id);
          emit('tool_failed', string(tool) ? {tool} : {});
        } else if (pending) {
          const result = obj.toolUseResult;
          const paths = [...new Set([string(result?.filePath) ? result.filePath : path].filter(string))].slice(0,WATCH_LIMITS.pathsMax);
          emit(result?.type === 'create' ? 'file_create' : 'file_change', {paths});
        }
      }
      if (!obj.isMeta && !Object.hasOwn(obj, 'toolUseResult')) {
        const text = userText(message.content);
        if (/^\[Request interrupted by user(?: for tool use)?\]$/.test(text.trim())) emit('turn_end', {text:'interrupted by user'});
        else if (text.trim()) emit('user', {text});
      }
      return events;
    }
    if (!state.modelSeen && string(message.model) && message.model) {
      state.modelSeen = true;
      emit('settings', {model:message.model});
    }
    for (const block of blocks) {
      if (!object(block)) continue;
      if (block.type === 'text' && string(block.text)) emit('agent', {text:block.text});
      else if (block.type === 'thinking' && string(block.thinking) && block.thinking) emit('reasoning', {text:block.thinking});
      else if (block.type === 'tool_use' && string(block.name)) {
        const name = block.name;
        if (string(block.id)) {
          state.tools.delete(block.id);
          state.tools.set(block.id, name);
          while (state.tools.size > WATCH_LIMITS.toolCacheMax) state.tools.delete(state.tools.keys().next().value);
        }
        const input = object(block.input) ? block.input : {};
        if (name === 'Bash') emit('command', string(input.command) ? {text:input.command} : {});
        else if (name === 'Write') {
          if (string(block.id)) {
            state.writes.delete(block.id);
            state.writes.set(block.id, string(input.file_path) ? input.file_path : undefined);
            while (state.writes.size > WATCH_LIMITS.toolCacheMax) state.writes.delete(state.writes.keys().next().value);
          }
        } else if (['Edit','MultiEdit','NotebookEdit'].includes(name)) {
          emit('file_change', {paths:[...new Set([input.file_path,input.notebook_path].filter(string))].slice(0,WATCH_LIMITS.pathsMax)});
        } else if (['Agent','Task'].includes(name)) {
          const agent = string(input.subagent_type) ? input.subagent_type : '';
          const description = string(input.description) ? input.description : '';
          emit('spawn', {text:agent && description ? `${agent}: ${description}` : agent || description});
        } else if (['Read','Grep','Glob','WebFetch','WebSearch'].includes(name)) {
          const target = [input.file_path,input.pattern,input.path,input.url,input.query].find(string);
          emit('tool', {tool:name, ...(target === undefined ? {} : {text:target})});
        } else emit('tool', {tool:name});
      }
    }
    if (message.stop_reason === 'end_turn') emit('turn_end');
    return events;
  } catch { return []; }
}
