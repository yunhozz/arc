import path from 'node:path';
import {fingerprintRequest} from './store.mjs';
import {validateGitPreflight,validateGitCommitResult} from './git-evidence.mjs';
import {within} from './scope.mjs';
const reconciliations=new WeakMap();
export function verifiedCooperativeReconciliation(decision,state){const proof=reconciliations.get(decision);return !!proof&&proof.before===fingerprintRequest(state)&&proof.after===fingerprintRequest(decision.proposedTransition);}
const completed=(state,id)=>state.tasks?.some(t=>t.id===id&&t.status==='committed'&&!t.invalidated)&&state.commits?.some(c=>c.taskId===id&&c.observationSource==='local-git'&&state.intents.some(i=>i.operation==='commit'&&i.requestId===c.requestId&&i.taskId===id&&i.status==='succeeded'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=v=>typeof v==='string'&&v.length>0;
const list=v=>Array.isArray(v)&&v.every(text)&&new Set(v).size===v.length;
const exact=(a,b)=>list(a)&&list(b)&&same([...a].sort(),[...b].sort());
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const semanticLimit='Semantically unrelated hunks inside the same file require Orchestrator inspection; path and byte evidence cannot distinguish them automatically.';
const base=state=>({expectedRevision:state?.revision??0,coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false},semanticLimit,requiredEvidence:[],nextActions:[],proposedTransition:null});
const hold=(state,reason)=>({...base(state),decision:'hold',ruleIds:['cooperative.acceptance'],reason});
const allow=(state,transition)=>({...base(state),decision:'allow',ruleIds:['cooperative.acceptance'],proposedTransition:transition});
const approval=(state,id)=>state.records.filter(r=>r.kind==='approval'&&(!r.data.affectedTaskIds||r.data.affectedTaskIds.includes(id))).at(-1);
function authorized(state,task){const a=approval(state,task?.id);return state.mode==='plan'&&task&&!task.invalidated&&a?.source==='operator-attested'&&a.targetVersion===state.targetVersion&&task.targetVersion===state.targetVersion&&task.scopeVersion===a.scopeVersion&&task.approvalRef===a.messageRef&&task.approvalVersion===a.data.approvalVersion&&task.documentVersion===a.data.documentVersion;}
function checkEvidence(state,task,a,changes){
 if(!same(a.criteria,task.criteria)||!task.criteria.length||!list(a.checkIds)||!list(a.findingIds)||a.changeFingerprint!==changes?.tasks?.[task.id])return false;
 const checks=state.checks.filter(c=>c.scope==='task'&&c.taskId===task.id);
 const latest=task.requiredChecks.map(d=>checks.filter(c=>same(c.descriptor,d)).at(-1));
 if(!task.requiredChecks.length||latest.some(c=>!c||c.stale||c.status!=='passed'||c.verdict!=='proven'||!text(c.resultRef)||c.source!=='operator-attested'||c.verificationActor?.role!=='qa'||!text(c.verificationActor.id)||state.assignments.some(a=>a.agentId===c.verificationActor.id)||c.changeFingerprint!==a.changeFingerprint)||!exact(a.checkIds,latest.map(c=>c?.id)))return false;
 const findings=state.findings.filter(f=>f.scope==='task'&&f.taskId===task.id);
 return exact(a.findingIds,findings.map(f=>f.id))&&findings.every(f=>f.status==='closed'&&text(f.resolutionRef)&&text(f.recheckRef)&&f.resolutionActor?.role==='coder'&&f.recheckActor?.role==='qa'&&f.changeFingerprint===a.changeFingerprint);
}
function waitingFor(state,task,predecessor){
 if(task.status!=='pending'||state.intents.some(i=>i.taskId===task.id&&i.operation==='assign-agent'&&['prepared','unknown','mismatch','succeeded'].includes(i.status)))return false;
 const seen=new Set(),queue=[...(task.dependencies??[])];while(queue.length){const id=queue.pop();if(id===predecessor)return true;if(seen.has(id))continue;seen.add(id);queue.push(...(state.tasks.find(t=>t.id===id)?.dependencies??[]));}return false;
}
function dirtyOtherTask(state,task,git){return git.stagedPaths?.some(name=>state.tasks.some(t=>t.id!==task.id&&!completed(state,t.id)&&!waitingFor(state,t,task.id)&&t.paths.some(p=>within(p,path.join(state.target.realpath,...name.split('/'))))));}
function freshAcceptance(state,task,acceptance,changes){return acceptance&&!acceptance.stale&&authorized(state,task)&&acceptance.taskFingerprint===fingerprintRequest({...task,status:'pending'})&&same(acceptance.approval,approval(state,task.id))&&same(acceptance.target,state.target)&&same(acceptance.versions,state.versions)&&checkEvidence(state,task,acceptance,changes);}
/** Operator attests semantic sufficiency; code binds exact current evidence only. */
export function evaluateCooperativeAcceptance({state,request,evidence}={}){
 const task=state?.tasks?.find(t=>t.id===request?.taskId),a=request?.arguments,g=evidence?.git;
 if(request?.expectedRevision!==state?.revision||request.actor?.role!=='orchestrator'||!authorized(state,task)||task.status!=='pending'||state.acceptances.some(v=>v.taskId===task.id&&!v.stale)||state.commits.some(v=>v.taskId===task.id))return hold(state,'Current pending approved task and Orchestrator acceptance required');
 if(!fields(a,['messageRef','criteria','checkIds','findingIds','changeFingerprint'])||!text(a.messageRef)||!checkEvidence(state,task,a,evidence?.changes)||state.checks.some(c=>a.checkIds?.includes(c.id)&&c.verificationActor?.id===request.actor.id))return hold(state,'Exact criteria, current required QA checks and closed findings required');
 const descriptor={kind:'task',parent:state.target.head,indexTree:g?.indexTree,fingerprint:g?.stagedFingerprint,paths:g?.stagedPaths};
 const invalid=validateGitPreflight({target:state.target,descriptor,scope:task.paths,gitEvidence:g});
 if(invalid||dirtyOtherTask(state,task,g))return hold(state,invalid??'Index includes another task changes');
 return allow(state,{acceptance:{...structuredClone(a),id:request.requestId,taskId:task.id,actor:structuredClone(request.actor),source:'operator-attested',descriptor:structuredClone(descriptor),taskFingerprint:fingerprintRequest({...task,status:'pending'}),approval:structuredClone(approval(state,task.id)),target:structuredClone(state.target),versions:structuredClone(state.versions)}});
}
/** Prepares a durable intent; never stages or executes a commit. */
export function prepareCooperativeCommit({state,request,gitEvidence,evidence}={}){
 const task=state?.tasks?.find(t=>t.id===request?.taskId),a=state?.acceptances?.find(a=>a.id===request?.arguments?.acceptanceId&&a.taskId===request.taskId);
 if(request?.expectedRevision!==state?.revision||request.actor?.role!=='orchestrator'||!fields(request.arguments,['acceptanceId'])||task?.status!=='accepted'||!freshAcceptance(state,task,a,evidence?.changes)||state.commits.some(c=>c.taskId===task.id)||state.intents.some(i=>i.operation==='commit'&&i.taskId===task.id&&['prepared','unknown','mismatch'].includes(i.status)))return hold(state,'Exact current acceptance and no prior task commit or unresolved commit required');
 const invalid=validateGitPreflight({target:state.target,descriptor:a.descriptor,scope:task.paths,gitEvidence});
 if(invalid||dirtyOtherTask(state,task,gitEvidence))return hold(state,invalid??'Index includes another task changes');
 const expected={parent:a.descriptor.parent,tree:a.descriptor.indexTree,paths:[...a.descriptor.paths],fingerprint:a.descriptor.fingerprint,remainingPaths:[...new Set([...gitEvidence.workingPaths,...gitEvidence.untrackedPaths])].sort()};
 return allow(state,{intent:{requestId:request.requestId,operation:'commit',taskId:task.id,status:'prepared',acceptanceId:a.id,acceptanceFingerprint:fingerprintRequest(a),expected,target:structuredClone(state.target),versions:structuredClone(state.versions),fingerprint:fingerprintRequest(request),source:'operator-attested'}});
}
/** Results are local Git observations, correlated with an operator statement.
 * Mismatch observations remain historical evidence and never rebind the target. */
export function reconcileCooperativeCommit({state,intent,result,gitEvidence}={}){
 if(!intent||intent.operation!=='commit'||!['prepared','unknown','mismatch'].includes(intent.status)||state.commits.some(c=>c.taskId===intent.taskId))return hold(state,'Matching unresolved commit intent required; replay cannot authorize another effect');
 const task=state.tasks.find(t=>t.id===intent.taskId),a=state.acceptances.find(a=>a.id===intent.acceptanceId),g=gitEvidence;
 const observation=g?structuredClone(g):null;
 const transition={observation,result:{...structuredClone(result),status:'mismatch',source:'operator-attested'}};
 const reject=reason=>({...hold(state,reason),proposedTransition:transition});
 if(!result||!text(result.messageRef)||!fields(result.data,['commit'])||!['succeeded','failed','unknown','mismatch'].includes(result.status))return reject('Exact commit result statement required');
 if(result.status!=='succeeded'){transition.result.status=result.status;return reject('Execution did not establish a successful commit');}
 if(task?.status!=='accepted'||!authorized(state,task)||a?.stale||!a||intent.acceptanceFingerprint!==fingerprintRequest(a)||a.taskFingerprint!==fingerprintRequest({...task,status:'pending'})||!same(a.approval,approval(state,task.id))||!checkEvidence(state,task,a,{tasks:{[task.id]:a.changeFingerprint}})||!same(intent.target,state.target)||!same(intent.versions,state.versions)||!g?.commit||result.data.commit!==g.commit.commit||g.stagedPaths?.length||g.indexTree!==g.commit.tree)return reject('Acceptance, observed commit or clean resulting index mismatch');
 const actual={...g.commit,target:g.target,remainingPaths:[...new Set([...g.workingPaths??[],...g.untrackedPaths??[]])].sort()};
 const invalid=validateGitCommitResult({target:state.target,expected:intent.expected,result:actual,scope:task.paths});
 if(invalid)return reject(invalid);
 transition.result.status='succeeded';transition.commit={...actual,taskId:task.id,requestId:intent.requestId,acceptanceId:a.id,source:'operator-attested',observationSource:'local-git',fingerprint:a.changeFingerprint};transition.target=structuredClone(g.target);
 const decision=allow(state,transition);reconciliations.set(decision,{before:fingerprintRequest(state),after:fingerprintRequest(transition)});return decision;
}
