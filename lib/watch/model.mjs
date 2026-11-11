export const WATCH_KINDS = Object.freeze(['session','settings','turn_start','turn_end','turn_failed','user','agent','reasoning','command','tool','tool_failed','file_change','spawn','approval','dispatch','error','other','notice']);
export const VERBOSE_KINDS = Object.freeze(['settings','turn_start','reasoning','other']);
export const ROLE_NAMES = Object.freeze(['scouter','planner','implementer','qa','reviewer']);

export const WATCH_LIMITS = Object.freeze({
  filePollMs:500, discoveryMs:2000, worktreeRefreshMs:30000, holdMs:2000,
  holdCreatedWithinMs:10000, attachWindowMs:1800000, historyWindowMs:600000,
  idleDetachMs:1800000, maxFollowed:64, maxReadBytesPerTick:1048576,
  maxLineBytes:4194304, historyBytes:262144, maxRepos:32, claudeHeadBytes:1048576,
  claudeCwdWaitMs:10000, codexMetaBytes:4194304, lookbackDays:7,
  jsonTextMax:1000, pathsMax:20, toolCacheMax:512, defaultTail:20,
  maxTail:1000, widthMin:40, widthMax:2000, ttyWidthMin:60, nonTtyWidth:200,
  labelWidth:22, gitTimeoutMs:10000,
});

/**
 * Normalized event. Omit absent fields rather than assigning null.
 * Unknown dispatch platforms and watch notices omit platform; never infer it from hostPlatform.
 * @typedef {object} WatchEvent
 * @property {1} v
 * @property {string} ts Source timestamp, or observation time if absent.
 * @property {string} observedAt
 * @property {'codex'|'claude'} [platform]
 * @property {'session'|'subagent'|'bridge'|'dispatch'|'watch'} source
 * @property {string} [origin]
 * @property {string} [sessionId]
 * @property {string} [parentId]
 * @property {number} [depth]
 * @property {string} label
 * @property {'scouter'|'planner'|'implementer'|'qa'|'reviewer'|'orchestrator'} [role]
 * @property {string} [dispatchId]
 * @property {string} [workflowId]
 * @property {'session'|'settings'|'turn_start'|'turn_end'|'turn_failed'|'user'|'agent'|'reasoning'|'command'|'tool'|'tool_failed'|'file_change'|'spawn'|'approval'|'dispatch'|'error'|'other'|'notice'} kind
 * @property {string} [text] Sanitized, masked text; JSON is capped at 1000 code points.
 * @property {boolean} [truncated]
 * @property {number} [exitCode]
 * @property {string} [tool]
 * @property {string[]} [paths] At most 20 paths.
 * @property {string} [model]
 * @property {string} [effort]
 * @property {string} [approval]
 * @property {string} [state]
 * @property {string[]} [reasons]
 * @property {string} [route]
 * @property {string} [hostPlatform]
 * @property {string} [cwd]
 */
