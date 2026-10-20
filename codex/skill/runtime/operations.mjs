/** Canonical semantic operations, independent of platform tool aliases. */
export const ROLES = Object.freeze(['orchestrator','scouter','planner','coder','qa','reviewer']);
export const GIT_OPERATIONS = Object.freeze(['stage','commit','push','merge','rebase','reset','branch-create','branch-switch','worktree-create','worktree-remove']);
export const EXTERNAL_OPERATIONS = Object.freeze(['push','merge','deploy','publish','external-message']);
export const OPERATIONS = Object.freeze(['read','draft','write','check','qa','review','temporary-write','operational-query','install','prepare-target','request-approval','assign-agent','accept','transition','scope-expansion','indirect-bypass',...new Set([...GIT_OPERATIONS,...EXTERNAL_OPERATIONS])]);
export const ROLE_OPERATIONS = Object.freeze({orchestrator:['read','write','check','prepare-target','request-approval','assign-agent','accept','transition','install',...GIT_OPERATIONS,...EXTERNAL_OPERATIONS],scouter:['read'],planner:['read','draft'],coder:['read','write','check'],qa:['read','check','temporary-write'],reviewer:['read','review']});
