/** Canonical semantic operations, independent of platform tool aliases. */
export const ROLES = Object.freeze(['orchestrator','scouter','planner','implementer','tester','reviewer']);
export const GIT_OPERATIONS = Object.freeze(['stage','commit','push','merge','rebase','reset','branch-create','branch-switch','worktree-create','worktree-remove']);
export const EXTERNAL_OPERATIONS = Object.freeze(['push','merge','deploy','publish','external-message']);
export const OPERATIONS = Object.freeze(['read','draft','write','check','test','review','temporary-write','operational-query','install','prepare-target','request-approval','assign-agent','accept','transition','scope-expansion','indirect-bypass',...new Set([...GIT_OPERATIONS,...EXTERNAL_OPERATIONS])]);
export const LEGACY_OPERATIONS = Object.freeze({qa: 'test'});
export const LEGACY_COOPERATIVE_ROLES = Object.freeze({qa: 'tester'});
export const ROLE_OPERATIONS = Object.freeze({orchestrator:['read','write','check','prepare-target','request-approval','assign-agent','accept','transition','install',...GIT_OPERATIONS,...EXTERNAL_OPERATIONS],scouter:['read'],planner:['read','draft'],implementer:['read','write','check'],tester:['read','check','temporary-write'],reviewer:['read','review']});

/** Compare a stored role without rewriting historical evidence. */
export function canonicalCooperativeRole(role) {
 return typeof role === 'string' && Object.hasOwn(LEGACY_COOPERATIVE_ROLES, role) ? LEGACY_COOPERATIVE_ROLES[role] : role;
}

export const isLegacyOperation = operation => typeof operation === 'string' && Object.hasOwn(LEGACY_OPERATIONS, operation);
const currentOperation = operation => isLegacyOperation(operation) ? LEGACY_OPERATIONS[operation] : operation;

/** Interpret only the operation fields of stored state. Request inputs stay strict. */
export function normalizeStoredOperations(state) {
 const normalizeList = operations => Array.isArray(operations) && operations.some(isLegacyOperation) ? operations.map(currentOperation) : operations;
 const approvals = state.approvals.map(entry => {
  const operations = normalizeList(entry?.scope?.operations);
  return operations === entry?.scope?.operations ? entry : {...entry, scope: {...entry.scope, operations}};
 });
 const assignments = state.assignments.map(entry => {
  const operations = normalizeList(entry?.operations);
  return operations === entry?.operations ? entry : {...entry, operations};
 });
 const audit = state.audit.map(entry => isLegacyOperation(entry?.operation) ? {...entry, operation: currentOperation(entry.operation)} : entry);
 if (approvals.some((entry, i) => entry !== state.approvals[i]) || assignments.some((entry, i) => entry !== state.assignments[i]) || audit.some((entry, i) => entry !== state.audit[i])) return {...state, approvals, assignments, audit};
 return state;
}
