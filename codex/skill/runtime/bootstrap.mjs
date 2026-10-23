import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateCooperativeCommand,validateCooperativeState} from './cooperative-schema.mjs';
import {observeCooperativeTarget,validateObservedTarget,validateWorkflowId,workflowStatePath,inspectPath} from './scope.mjs';
import {saveDurableState} from './store.mjs';
export const COOPERATIVE_RUNTIME_MODULES=Object.freeze([
 'cli.mjs','command.mjs','bootstrap.mjs','cooperative-schema.mjs','cooperative.mjs','evaluate.mjs',
 'scope.mjs','store.mjs','git-evidence.mjs','assignment.mjs','verification.mjs','acceptance.mjs','external.mjs'
]);
export const cooperativeCoverage=()=>({enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false});
export function commandResult({workflowId,state,input,decision='allow',ruleId='cooperative.recorded',persisted=false,...extra}){
 return {decision,ruleIds:[ruleId],workflowId,taskId:input?.taskId??null,requestId:input?.requestId??null,revision:state?.revision??0,coverage:cooperativeCoverage(),requiredEvidence:[],nextActions:[],persisted,...extra};
}
export async function cooperativeVersions(){
 const hash=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
 let policy;try{policy=await fs.readFile(new URL('../policy/role-policy.json',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;policy=await fs.readFile(new URL('./role-policy.json',import.meta.url));}
 const runtime=await Promise.all(COOPERATIVE_RUNTIME_MODULES.map(file=>fs.readFile(new URL(file,import.meta.url))));
 return {policy:'1',runtime:'cooperative-1',policyHash:hash(policy),runtimeHash:hash(Buffer.concat(runtime))};
}
export async function initializeCooperativeWorkflow({cwd,workflowId,input,observe=observeCooperativeTarget,storage={}}){
 validateWorkflowId(workflowId);validateCooperativeCommand({command:'init',input});
 if(input.mode!=='plan')return commandResult({workflowId,input,decision:'hold',ruleId:'cooperative.unsupported'});
 const target=await validateObservedTarget(cwd,await observe(cwd));const statePath=await workflowStatePath(target,workflowId);
 const parent=path.dirname(statePath);await fs.mkdir(parent,{recursive:true,mode:0o700});await inspectPath(parent,{directory:true});
 const lockPath=statePath+'.lock';let lock;
 try{
  lock=await fs.open(lockPath,'wx',0o600);await inspectPath(statePath,{missing:true});
  const state={schemaVersion:1,workflowKind:'cooperative',contractVersion:1,workflowId,revision:0,mode:'plan',coverage:cooperativeCoverage(),versions:await cooperativeVersions(),target,targetVersion:1,scopeVersion:0};
  for(const key of ['actors','selections','assignments','identities','leases','scopes','approvals','documents','tasks','requests','intents','results','checks','findings','acceptances','commits','audit','unresolved','records','targetHistory'])state[key]=[];
  state.actors.push({actor:input.actor,source:'operator-attested'});state.selections.push({...input.selection,actor:input.actor,source:'operator-attested',targetVersion:1});
  state.audit.push({command:'init',revision:0,source:'operator-attested',actor:input.actor});validateCooperativeState(state);
  await saveDurableState({statePath,state,create:true,storage});return commandResult({workflowId,state,input,persisted:true,ruleId:'cooperative.initialized'});
 }finally{if(lock){await lock.close();await fs.unlink(lockPath);}}
}
