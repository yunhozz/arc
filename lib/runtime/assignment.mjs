import {normalizeRole} from './operations.mjs';
import {fingerprintRequest} from './store.mjs';
import {absolute,within} from './scope.mjs';
const completed=(state,id)=>state.tasks?.some(t=>t.id===id&&t.status==='committed'&&!t.invalidated)&&state.commits?.some(c=>c.taskId===id&&c.observationSource==='local-git'&&state.intents.some(i=>i.operation==='commit'&&i.requestId===c.requestId&&i.taskId===id&&i.status==='succeeded'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=value=>typeof value==='string'&&value.length>0;
const version=value=>Number.isSafeInteger(value)&&value>0;
const setEqual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&new Set(a).size===a.length&&new Set(b).size===b.length&&same([...a].sort(),[...b].sort());
const base=state=>({expectedRevision:state?.revision??0,coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false},requiredEvidence:[],nextActions:[],proposedTransition:null});
const hold=(state,id,reason)=>({...base(state),decision:'hold',ruleIds:['cooperative.'+id],reason});
/** Pure gate. observations are supplied by trusted local readers, never JSON input. */
export function prepareCooperativeAssignment({policy,state,request,observations}={}){
 if(policy!==undefined&&policy.workflowKind!=='cooperative')return hold(state,'contract','Explicit cooperative contract required');
 const args=request?.arguments;
 if(state?.mode!=='plan'||request?.operation!=='assign-agent'||!args)return hold(state,'unsupported','Only explicit plan assignment is supported');
 const allowed=['role','paths','operations','documents','approvalRef','approvalVersion','documentVersion','correlation'];
 if(Object.keys(args).some(k=>!allowed.includes(k))||normalizeRole(args.role)!=='implementer'||!text(request.taskId)||!text(request.requestId)||!text(args.correlation)||!text(args.approvalRef)||!version(args.approvalVersion)||!version(args.documentVersion)||!Array.isArray(args.paths)||!args.paths.length||new Set(args.paths).size!==args.paths.length||args.paths.some(p=>!absolute(p)||!within(state.target.realpath,p))||!Array.isArray(args.operations)||!args.operations.length||args.operations.some(o=>o!=='edit'))return hold(state,'assignment','Invalid assignment or unsupported historical agent import');
 if(!same(observations?.target,state.target)||!same(observations?.git?.target,state.target))return hold(state,'target','Re-observe target and renew approval after drift');
 if(request.expectedRevision!==state.revision)return hold(state,'revision','Stale assignment request');
 if(state.records.some(r=>r.data?.priorExecution===true)||state.assignments.some(a=>a.source!=='operator-attested'))return hold(state,'history','Earlier execution remains unverified; a late commit cannot authorize it');
 if(state.intents.some(i=>i.operation==='assign-agent'&&['prepared','unknown','mismatch','succeeded'].includes(i.status)&&(i.taskId===request.taskId||i.correlation===args.correlation||!(i.status==='succeeded'&&completed(state,i.taskId))&&i.paths?.some(p=>args.paths.some(q=>within(p,q)||within(q,p))))))return hold(state,'assignment-active','Resolve the existing dispatch before preparing another');
 const task=state.tasks?.find(t=>t.id===request.taskId);
 if(task&&(task.invalidated||task.status==='held'||task.dependencies?.some(id=>{const predecessor=state.tasks.find(t=>t.id===id);return !predecessor||predecessor.invalidated||!['accepted','committed'].includes(predecessor.status);})))return hold(state,'task-stale','Affected task or predecessor requires renewed readiness and approval');
 const scope=state.scopes?.findLast(s=>s.scopeVersion===state.scopeVersion&&(!s.data.affectedTaskIds||s.data.affectedTaskIds.includes(request.taskId)));
 if(!task||!task.paths?.length||args.paths.some(p=>!task.paths.some(base=>within(base,p)))||scope&&args.paths.some(p=>!scope.data.paths?.some(base=>within(base,p))))return hold(state,'assignment-scope','Assignment must stay inside approved task and recorded scope');
 const documents=args.documents,git=observations.git;
 if(!Array.isArray(documents)||documents.length!==2||!setEqual(documents.map(d=>d.kind),['spec','plan'])||!git.docsCommit||!setEqual(git.docsCommit.paths,documents.map(d=>d.gitPath))||!same(git.docsCommit.documents,documents)||documents.some(d=>d.commit!==git.docsCommit.commit)||!Array.isArray(git.documents)||git.documents.length!==2||documents.some(d=>!git.documents.some(o=>o.path===d.path&&o.gitPath===d.gitPath&&o.kind===d.kind&&o.observedHash===d.contentHash&&o.currentHash===d.contentHash)))return hold(state,'documents','Exact committed spec and plan plus current bytes must match approval');
 const approval=state.records.filter(r=>r.kind==='approval'&&(!r.data.affectedTaskIds||r.data.affectedTaskIds.includes(request.taskId))).at(-1);
 if(task.approvalRef!==args.approvalRef||task.approvalVersion!==args.approvalVersion||task.documentVersion!==args.documentVersion||task.scopeVersion!==state.scopeVersion||task.targetVersion!==state.targetVersion||!approval||approval.source!=='operator-attested'||approval.messageRef!==args.approvalRef||approval.targetVersion!==state.targetVersion||approval.scopeVersion!==state.scopeVersion||approval.data.approvalVersion!==args.approvalVersion||approval.data.documentVersion!==args.documentVersion||!same(approval.data.documents,documents)||documents.some(d=>d.approvalRef!==args.approvalRef))return hold(state,'approval','Current document and approval versions must match');
 const intent={requestId:request.requestId,taskId:request.taskId,operation:request.operation,status:'prepared',role:normalizeRole(args.role),paths:[...args.paths],operations:[...args.operations],correlation:args.correlation,documents:structuredClone(documents),docsCommit:git.docsCommit.commit,approvalRef:args.approvalRef,approvalVersion:args.approvalVersion,documentVersion:args.documentVersion,target:structuredClone(state.target),targetVersion:state.targetVersion,scopeVersion:state.scopeVersion,revision:state.revision+1,fingerprint:fingerprintRequest(request),source:'operator-attested'};
 return {...base(state),decision:'allow',ruleIds:['cooperative.assignment-prepared'],proposedTransition:{intent}};
}
/** A native response is an operator statement, not authenticated identity or compliance. */
export function recordCooperativeAssignmentResult({state,intent,result,observations}={}){
 if(!intent||intent.operation!=='assign-agent')return hold(state,'intent','No matching assignment intent');
 if(!['prepared','unknown','mismatch'].includes(intent.status))return hold(state,'assignment-terminal','Preserve the prior terminal native response');
 if(!result||!['succeeded','failed','unknown','mismatch'].includes(result.status)||!text(result.messageRef)||!result.data)return hold(state,'assignment-result','Invalid native result statement');
 if(result.status==='succeeded'&&(state.assignments.some(a=>a.agentId===result.data.agentId&&a.taskId!==intent.taskId)||state.intents?.some(i=>i.verificationActor?.id===result.data.agentId)||state.checks?.some(c=>c.verificationActor?.id===result.data.agentId)))return hold(state,'assignment-freshness','Implementer actor statements cannot cross tasks');
 let status=result.status;
 if(!same(intent.target,observations?.target)||result.data.correlation!==intent.correlation||result.data.taskId!==intent.taskId||status==='succeeded'&&!text(result.data.agentId))status='mismatch';
 const entry={...structuredClone(result),status,requestId:intent.requestId,source:'operator-attested'};
 return {...base(state),decision:['succeeded','failed'].includes(status)?'allow':'hold',ruleIds:['cooperative.assignment-'+status],proposedTransition:{result:entry}};
}
