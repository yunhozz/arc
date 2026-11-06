const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=value=>typeof value==='string'&&value.length>0;
const relative=value=>text(value)&&!/[\\\x00\r\n:]/.test(value)&&!value.startsWith('/')&&!value.split('/').some(part=>!part||part==='.'||part==='..');

export async function readTargetPreparationEvidence({state,targetIntent,destination,observe=observeCooperativeTarget,readChanges=readCooperativeChanges,gitRunner}={}){
 const sourceTarget=await observe(state.target.realpath);
 const snapshot=await readChanges({state:{...state,target:sourceTarget},...(gitRunner?{gitRunner}:{})});
 const stage=state.plannerLedger?.stages?.find(s=>s.id===targetIntent?.firstStageId);
 const source={target:sourceTarget,fingerprint:snapshot.final,snapshot:snapshot.transitionSnapshot,preserved:!!targetIntent?.sourceSnapshot&&same(snapshot.transitionSnapshot,targetIntent.sourceSnapshot),inputVersion:stage?.inputVersion,candidate:targetIntent?.candidate,base:targetIntent?.base};
 if(!destination)return {source};
 const target=await observe(destination.realpath),tasks=state.tasks.map(task=>({...task,paths:task.paths.map(p=>{if(!within(state.target.realpath,p))throw Error('Task path escapes source');return path.join(target.realpath,path.relative(state.target.realpath,p));})})),destinationSnapshot=await readChanges({state:{...state,target,tasks},...(gitRunner?{gitRunner}:{})}),result={target,snapshot:destinationSnapshot.transitionSnapshot};
 source.preserved=source.preserved&&same(destinationSnapshot.transitionSnapshot,targetIntent.sourceSnapshot);
 if(target.realpath!==state.target.realpath){
  const query=await (gitRunner??defaultRunner)({cwd:sourceTarget.realpath,args:['worktree','list','--porcelain','-z']});
  if(query?.status!==0||query.error||!Buffer.isBuffer(query.stdout))throw Error('Worktree registration query failed');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(query.stdout);if(raw&&!raw.endsWith('\0\0'))throw Error('Incomplete worktree registration');
  const entries=raw?raw.slice(0,-2).split('\0\0').map(entry=>entry.split('\0')):[];
  result.registered=entries.some(entry=>entry.includes('worktree '+target.realpath)&&entry.includes('HEAD '+target.head)&&entry.includes('branch refs/heads/'+target.branch));
  const attachment=state.records?.find(r=>r.kind==='note'&&r.messageRef===destination.attachmentRef&&r.targetVersion===state.targetVersion&&r.source==='operator-attested'&&r.data?.type==='worktree-attachment'&&r.data.realpath===target.realpath&&r.data.gitDir===target.gitDir&&r.data.gitCommonDir===target.gitCommonDir);
  if(attachment)result.attachmentRef=attachment.messageRef;
 }
 if(destination.path!==undefined){
  if(!relative(destination.path))throw Error('Invalid destination path');
  const filename=path.join(target.realpath,...destination.path.split('/'));
  if(!within(target.realpath,filename))throw Error('Destination path escapes workspace');
  await inspectPath(filename);const handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  let bytes,after;
  try{const before=await handle.stat();if(!before.isFile())throw Error('Destination must be a regular file');bytes=await handle.readFile();after=await handle.stat();const named=await fs.lstat(filename);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.mode!==after.mode||after.dev!==named.dev||after.ino!==named.ino)throw Error('Destination changed while reading');}finally{await handle.close();}
  await inspectPath(filename);if(!within(target.realpath,await fs.realpath(filename)))throw Error('Destination path escapes workspace');
  result.document={path:destination.path,hash:'sha256:'+createHash('sha256').update(bytes).digest('hex'),mode:0o100000|(after.mode&0o777),verification:{status:'verified',source:'local-bytes'}};
 }
 return {source,destination:result};
}

export function validateTargetPreparationRecord(kind,data){
 if(!data||data.type!==kind||!['intent','checkpoint','transition','destination'].includes(kind))throw Error('Invalid target preparation type');
 if(kind==='intent'&&(!text(data.id)||!text(data.workflowId)||!data.sourceTarget||!Number.isSafeInteger(data.sourceTargetVersion)||!text(data.selectionRef)||!['current','branch','worktree'].includes(data.kind)||!text(data.candidate)||!text(data.base)||!text(data.firstStageId)||!Array.isArray(data.documents)||!data.documents.length||data.documents.some(d=>!['spec','plan'].includes(d.kind)||!relative(d.path))||new Set(data.documents.map(d=>d.kind)).size!==data.documents.length))throw Error('Invalid target preparation intent');
 if(kind==='intent'&&(!Number.isSafeInteger(data.sourceTargetVersion)||data.sourceTargetVersion<1||!['realpath','gitCommonDir','gitDir'].every(k=>typeof data.sourceTarget[k]==='string'&&path.isAbsolute(data.sourceTarget[k])&&path.normalize(data.sourceTarget[k])===data.sourceTarget[k])||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(data.sourceTarget.head)||!(data.sourceTarget.branch===null||text(data.sourceTarget.branch))||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(data.base)||new Set(data.documents.map(d=>d.path)).size!==data.documents.length))throw Error('Invalid target preparation intent identity');
 if(kind==='checkpoint'&&(!text(data.intentId)||!text(data.stageId)||!text(data.resultRef)||!text(data.selfReviewRef)))throw Error('Invalid target preparation checkpoint');
 if(kind==='transition'&&(!text(data.intentId)||!text(data.checkpointRef)||!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision<0))throw Error('Invalid target preparation transition');
 if(kind==='destination'&&(!text(data.intentId)||!text(data.transitionRef)||!text(data.stageId)||!text(data.resultRef)||!text(data.selfReviewRef)||!relative(data.path)||!/^sha256:[a-f0-9]{64}$/.test(data.hash)||![0o100644,0o100755].includes(data.mode)||!text(data.reviewRef)||!text(data.approvalRef)||!Number.isSafeInteger(data.targetVersion)||data.targetVersion<1))throw Error('Invalid target preparation destination');
 return data;
}

export function evaluateTargetPreparation({state,request,evidence}={}){
 const hold=reason=>({decision:'hold',ruleIds:['cooperative.target-preparation'],reason});
 try{validateTargetPreparationRecord(request?.type,request);}catch{return hold('Invalid target preparation record');}
 if(request.type==='intent'){
  if(state.targetIntents?.some(intent=>!state.targetTransitions?.some(transition=>transition.intentId===intent.id)))return hold('Existing target preparation intent is still active');
  const approval=state.records?.find(r=>r.kind==='approval'&&r.messageRef===request.approvalRef&&r.source==='operator-attested'&&r.actor?.role==='orchestrator'&&r.targetVersion===state.targetVersion&&r.scopeVersion===state.scopeVersion);
  const approved=approval?.data?.targetPreparation;
  if(!['Bounded','Architectural'].includes(request.depth)||(request.depth==='Architectural'&&(!request.documents.some(d=>d.kind==='spec')||!request.documents.some(d=>d.kind==='plan'))))return hold('Approved depth requires its complete document set');
  if(!text(request.approvalRef)||!text(request.depth)||['depth','selectionRef','kind','candidate','base','workflowId','firstStageId','sourceTargetVersion'].some(k=>approved?.[k]!==request[k])||!same(approved?.sourceTarget,request.sourceTarget)||!same(approved?.documents,request.documents)||request.workflowId!==state.workflowId||request.sourceTargetVersion!==state.targetVersion||!same(request.sourceTarget,state.target)||!same(evidence?.source?.target,state.target)||!text(evidence?.source?.fingerprint)||!state.selections?.some(s=>s.messageRef===request.selectionRef&&s.targetVersion===state.targetVersion)||state.targetIntents?.some(i=>i.id===request.id)||request.base!==state.target.head)return hold('Current approval, document set, source, explicit choice and preservation snapshot required');
  return {decision:'allow',ruleIds:['cooperative.target-preparation'],proposedTransition:{intent:{...structuredClone(request),scopeVersion:state.scopeVersion,sourceFingerprint:evidence.source.fingerprint,...(evidence.source.snapshot?{sourceSnapshot:structuredClone(evidence.source.snapshot)}:{}),source:'operator-attested'}}};
 }
 if(request.type==='transition'){
  const intent=state?.targetIntents?.find(i=>i.id===request.intentId),checkpoint=state?.targetCheckpoints?.find(c=>c.intentId===request.intentId&&c.messageRef===request.checkpointRef);
  const source=evidence?.source,destination=evidence?.destination?.target;
  if(state.plannerLedger?.stages?.some(s=>s.pending||s.calls?.some(c=>['reserved','unknown'].includes(c.status))))return hold('Pending or unknown Planner execution');
  const stage=state.plannerLedger?.stages?.find(s=>s.id===intent?.firstStageId),result=stage?.result,chat=result?.chatDraft;
  if(!intent||intent.scopeVersion!==state.scopeVersion||stage?.scopeVersion!==state.scopeVersion||stage.targetVersion!==state.targetVersion||!state.records?.some(r=>r.kind==='approval'&&r.messageRef===intent.approvalRef&&r.scopeVersion===state.scopeVersion&&r.targetVersion===state.targetVersion&&r.actor?.role==='orchestrator'&&r.source==='operator-attested'))return hold('Current scope approval and source stage required');
  if(!stage||stage.targetIntentId!==intent.id||checkpoint?.stageId!==stage.id||checkpoint.resultRef!==result?.ref||checkpoint.selfReviewRef!==chat?.selfReviewRef||checkpoint.candidate!==intent.candidate||checkpoint.base!==intent.base||checkpoint.inputVersion!==stage.inputVersion||result.status!=='succeeded'||chat?.intentId!==intent.id||chat.complete!==true||!text(chat.draftRef)||!stage.calls?.some(c=>c.requestId===result.requestId&&c.status==='succeeded'))return hold('Checkpoint source result changed');
  if(!intent||!checkpoint||state.targetTransitions?.some(t=>t.intentId===intent.id)||request.expectedRevision!==state.revision||intent.sourceTargetVersion!==state.targetVersion||!same(intent.sourceTarget,state.target)||!same(evidence?.versions,state.versions)||!source?.preserved||!destination||source.target?.realpath!==state.target.realpath||source.target?.gitCommonDir!==state.target.gitCommonDir||source.target?.gitDir!==state.target.gitDir||destination.gitCommonDir!==state.target.gitCommonDir||state.unresolved?.some(u=>!u.resolvedBy)||state.assignments?.some(a=>a.status==='active')||state.intents?.some(i=>['prepared','unknown','mismatch'].includes(i.status)))return hold('Current checkpoint, preservation and independent target evidence required');
  if(intent.kind==='branch'&&!(destination.realpath===state.target.realpath&&destination.gitDir===state.target.gitDir&&destination.branch===intent.candidate&&destination.head===intent.base&&source.target.branch===intent.candidate&&source.target.head===intent.base))return hold('Branch target differs from intent');
  if(intent.kind==='current'&&(!same(destination,state.target)||destination.branch!==intent.candidate||destination.head!==intent.base))return hold('Current target changed');
  if(intent.kind==='worktree'&&!(same(source.target,state.target)&&destination.realpath!==state.target.realpath&&destination.gitDir!==state.target.gitDir&&destination.branch===intent.candidate&&destination.head===intent.base&&evidence.destination.registered===true&&text(evidence.destination.attachmentRef)&&state.records?.some(r=>r.kind==='note'&&r.messageRef===evidence.destination.attachmentRef&&r.targetVersion===state.targetVersion&&r.source==='operator-attested'&&r.data?.type==='worktree-attachment'&&r.data.realpath===destination.realpath&&r.data.gitDir===destination.gitDir&&r.data.gitCommonDir===destination.gitCommonDir)))return hold('Worktree registration and attachment required');
  return {decision:'allow',ruleIds:['cooperative.target-preparation'],proposedTransition:{target:structuredClone(destination),intentId:intent.id,checkpointRef:request.checkpointRef,sourceTargetVersion:state.targetVersion,expectedRevision:state.revision,validation:{request:structuredClone(request),evidence:structuredClone(evidence)}}};
 }
 if(request.type==='destination'){
  const intent=state.targetIntents?.find(i=>i.id===request.intentId),document=intent?.documents?.find(d=>d.path===request.path),transition=state.targetTransitions?.find(t=>t.intentId===request.intentId&&t.messageRef===request.transitionRef&&t.targetVersion===state.targetVersion),checkpoint=state.targetCheckpoints?.find(c=>c.intentId===request.intentId&&c.messageRef===transition?.checkpointRef),stage=state.plannerLedger?.stages?.find(s=>s.id===request.stageId),chat=stage?.result?.chatDraft,observed=evidence?.destination?.document;
  const review=state.records?.find(r=>r.kind==='planner-review'&&r.messageRef===request.reviewRef&&r.targetVersion===state.targetVersion&&r.source==='operator-attested'),approval=state.records?.find(r=>r.kind==='approval'&&r.messageRef===request.approvalRef&&r.targetVersion===state.targetVersion&&r.source==='operator-attested');
  if(!intent||!document||intent.firstStageId!==request.stageId||!transition||!same(transition.target,state.target)||request.targetVersion!==state.targetVersion||!checkpoint||checkpoint.stageId!==request.stageId||checkpoint.resultRef!==request.resultRef||checkpoint.selfReviewRef!==request.selfReviewRef||stage?.targetIntentId!==intent.id||stage.result?.ref!==request.resultRef||stage.result.status!=='succeeded'||chat?.intentId!==intent.id||chat.complete!==true||chat.selfReviewRef!==request.selfReviewRef||!same(evidence?.destination?.target,state.target)||observed?.verification?.status!=='verified'||observed.verification.source!=='local-bytes'||observed.path!==request.path||observed.hash!==request.hash||observed.mode!==request.mode)return hold('Current transition, source attestation and observed destination bytes required');
  if(review?.data?.resultRef!==request.resultRef||review.data.full!==true||review.data.complete!==true||review.data.hash!==request.hash||!Array.isArray(stage.criteria)||!Array.isArray(review.data.criteria)||review.data.criteria.length!==stage.criteria.length||new Set(review.data.criteria.map(c=>c.id)).size!==stage.criteria.length||review.data.criteria.some(c=>!stage.criteria.some(s=>s.id===c.id)||c.status!=='resolved'||!text(c.judgmentRef))||approval?.data?.kind!==document.kind||approval.data.contentHash!==request.hash||approval.data.path!==request.path)return hold('Current full review and document approval required');
  return {decision:'allow',ruleIds:['cooperative.target-preparation'],proposedTransition:{destination:{...structuredClone(request),sourceLink:'operator-attested',verification:{status:'verified',source:'local-bytes'}}}};
 }
 if(request?.type!=='checkpoint')return hold('Unsupported target preparation request');
 const intent=state?.targetIntents?.find(i=>i.id===request.intentId);
 const stage=state?.plannerLedger?.stages?.find(s=>s.id===request.stageId);
 const source=evidence?.source,result=stage?.result,chat=result?.chatDraft;
 if(!intent||intent.scopeVersion!==state.scopeVersion||stage?.scopeVersion!==state.scopeVersion||stage.targetVersion!==state.targetVersion||!state.records?.some(r=>r.kind==='approval'&&r.messageRef===intent.approvalRef&&r.scopeVersion===state.scopeVersion&&r.targetVersion===state.targetVersion&&r.actor?.role==='orchestrator'&&r.source==='operator-attested'))return hold('Current scope approval and source stage required');
 if(!intent||!stage||intent.firstStageId!==stage.id||stage.targetIntentId!==intent.id||intent.sourceTargetVersion!==state.targetVersion||!same(intent.sourceTarget,state.target)||!same(source?.target,state.target)||source.preserved!==true||source.inputVersion!==stage.inputVersion||source.candidate!==intent.candidate||source.base!==intent.base)return hold('Current source and intent evidence required');
 if(stage.pending||result?.ref!==request.resultRef||result?.status!=='succeeded'||!stage.calls?.some(c=>c.requestId===result.requestId&&c.status==='succeeded')||stage.calls.some(c=>['reserved','unknown'].includes(c.status))||chat?.intentId!==intent.id||!chat.draftRef||!chat.selfReviewRef||chat.selfReviewRef!==request.selfReviewRef||chat.complete!==true)return hold('Complete confirmed chat draft and self-review required');
 return {decision:'allow',ruleIds:['cooperative.target-preparation'],reason:'Chat checkpoint attested',proposedTransition:{checkpoint:{intentId:intent.id,stageId:stage.id,resultRef:result.ref,selfReviewRef:chat.selfReviewRef,candidate:intent.candidate,base:intent.base,inputVersion:stage.inputVersion}}};
}

export function applyTargetPreparationTransition({state,decision}={}){
 const next=structuredClone(state),transition=decision?.proposedTransition;
 if(decision?.decision!=='allow'||!transition?.target||transition.sourceTargetVersion!==state.targetVersion||transition.expectedRevision!==state.revision||state.targetTransitions?.some(t=>t.intentId===transition.intentId))return next;
 if(!transition.validation)return next;
 const checked=evaluateTargetPreparation({state,...transition.validation});
 if(checked.decision!=='allow'||!same(checked.proposedTransition,transition))return next;
 const intent=state.targetIntents?.find(i=>i.id===transition.intentId),checkpoint=state.targetCheckpoints?.find(c=>c.intentId===transition.intentId&&c.messageRef===transition.checkpointRef);
 if(!intent||!checkpoint||intent.sourceTargetVersion!==state.targetVersion||!same(intent.sourceTarget,state.target))return next;
 next.target=structuredClone(transition.target);next.targetVersion++;
 (next.targetTransitions??=[]).push({...structuredClone(transition),targetVersion:next.targetVersion});
 return next;
}
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectPath,within,observeCooperativeTarget} from './scope.mjs';
import {readCooperativeChanges} from './verification.mjs';
import {spawnSync} from 'node:child_process';
function defaultRunner({cwd,args}){
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'});
 return spawnSync('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd,env,encoding:'buffer',timeout:10000,maxBuffer:1024*1024});
}
