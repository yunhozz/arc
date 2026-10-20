import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

import {validateGitPolicy,classifyGitCommand} from '../runtime/git-query.mjs';
export {validateGitPolicy,classifyGitCommand};
const deny=reason=>({allowed:false,reason});
export function evaluateHookEvent(event,policy) {
  const result=event?.hook_event_name!=='PreToolUse' ? deny('Invalid hook event') : event?.tool_name!=='Bash' ? deny('Missing Bash event') : classifyGitCommand(event?.tool_input?.command,policy);
  return result.allowed?{}:{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:`ARC specialist Git guard: ${result.reason}. Return the operation to Orchestrator.`}};
}
export function runHook() {
  let response;
  try {const policy=validateGitPolicy(JSON.parse(fs.readFileSync(new URL('./git-policy.json',import.meta.url),'utf8')));response=evaluateHookEvent(JSON.parse(fs.readFileSync(0,'utf8')),policy);}
  catch {response={hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'ARC specialist Git guard: invalid input or policy asset. Stop and report to Orchestrator.'}};}
  process.stdout.write(JSON.stringify(response)+'\n');
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url)runHook();
