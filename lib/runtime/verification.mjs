import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fingerprintRequest} from './store.mjs';
import {absolute,within,inspectPath} from './scope.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const text=v=>typeof v==='string'&&v.length>0;
const hash=v=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const list=v=>Array.isArray(v)&&v.every(text)&&new Set(v).size===v.length;
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const base=state=>({expectedRevision:state?.revision??0,coverage:{enforcement:'cooperative',provenance:'operator-attested',nativeVerified:false},requiredEvidence:[],nextActions:[],proposedTransition:null});
const hold=(state,id,reason)=>({...base(state),decision:'hold',ruleIds:['cooperative.'+id],reason});
const allow=(state,transition)=>({...base(state),decision:'allow',ruleIds:['cooperative.verification'],proposedTransition:transition});
const current=(state,scope,taskId,changes)=>scope==='final'?changes?.final:changes?.tasks?.[taskId];
const approval=(state,taskId)=>state.records.filter(r=>r.kind==='approval'&&(!r.data.affectedTaskIds||r.data.affectedTaskIds.includes(taskId))).at(-1);
function authorized(state,task){
 const a=approval(state,task?.id);
 return task&&!task.invalidated&&a&&a.source==='operator-attested'&&a.targetVersion===state.targetVersion&&task.scopeVersion===a.scopeVersion&&task.targetVersion===state.targetVersion&&task.approvalRef===a.messageRef&&task.approvalVersion===a.data.approvalVersion&&task.documentVersion===a.data.documentVersion;
}
function descriptorValid(state,d,operation){
 if(operation==='review')return fields(d,['kind','paths'])&&d.kind==='source-review'&&list(d.paths)&&d.paths.length>0&&d.paths.every(p=>absolute(p)&&within(state.target.realpath,p));
 return fields(d,['executable','args','cwd','env','outputs'])&&absolute(d.executable)&&Array.isArray(d.args)&&d.args.every(v=>typeof v==='string')&&absolute(d.cwd)&&within(state.target.realpath,d.cwd)&&fields(d.env,Object.keys(d.env??{}))&&Object.values(d.env).every(v=>typeof v==='string')&&Array.isArray(d.outputs)&&d.outputs.every(p=>absolute(p)&&within(state.target.realpath,p));
}
const assignedCoder=(state,id,taskId)=>state.assignments.some(a=>a.agentId===id&&a.taskId===taskId&&a.status==='active');
function independent(state,actor,taskId){
 if(!fields(actor,['id','role'])||!text(actor.id))return false;
 if(state.assignments.some(a=>a.agentId===actor.id))return false;
 return !(state.intents??[]).some(i=>i.verificationActor?.id===actor.id&&(i.verificationActor.role!==actor.role||actor.role==='qa'&&i.taskId!==taskId))&&!(state.checks??[]).some(c=>c.verificationActor?.id===actor.id&&(c.verificationActor.role!==actor.role||actor.role==='qa'&&c.taskId!==taskId));
}
/** Invalidate only the affected dependency closure; preserve all historical evidence. */
export function invalidateAffectedEvidence({state,changedVersions={},affectedTaskIds}={}){
 const next=structuredClone(state),ids=new Set(affectedTaskIds??next.tasks.map(t=>t.id));
 let changed=true;while(changed){changed=false;for(const t of next.tasks)if(!ids.has(t.id)&&t.dependencies?.some(id=>ids.has(id))){ids.add(t.id);changed=true;}}
 for(const t of next.tasks)if(ids.has(t.id)){t.invalidated=true;t.status='held';t.invalidatedBy=structuredClone(changedVersions);t.invalidatedAt=state.revision+1;}
 for(const key of ['checks','acceptances'])for(const entry of next[key]??[])if(entry.scope==='final'||ids.has(entry.taskId)){entry.stale=true;entry.invalidatedBy=structuredClone(changedVersions);}
 for(const intent of next.intents??[])if(['check','review'].includes(intent.operation)&&(intent.scope==='final'||ids.has(intent.taskId)))intent.stale=true;
 // Old approval statements remain immutable; no change creates renewed authority.
 if(Number.isSafeInteger(changedVersions.scopeVersion))next.scopeVersion=changedVersions.scopeVersion;
 return next;
}
function record({state,request,evidence}){
 const entry=request.evidence,d=entry?.data;
 if(!entry||!text(entry.messageRef)||!d)return hold(state,'verification-record','Structured evidence required');
 if(entry.kind==='acceptance-evidence'&&d.kind==='task'){
  const t=d.task,previous=state.tasks.find(task=>task.id===t?.id),a=approval(state,t?.id);
  if(previous?.invalidated&&(!a||!Number.isSafeInteger(a.revision)||a.revision<previous.invalidatedAt||a.scopeVersion!==state.scopeVersion))return hold(state,'task-approval-stale','Invalidated task requires a renewed approval statement');
  if(!fields(t,['id','paths','criteria','requiredChecks','dependencies','approvalRef','approvalVersion','documentVersion','scopeVersion','targetVersion','status'])||!text(t.id)||!list(t.paths)||!t.paths.length||!t.paths.every(p=>absolute(p)&&within(state.target.realpath,p))||!list(t.criteria)||!t.criteria.length||!list(t.dependencies)||t.dependencies.includes(t.id)||t.dependencies.some(id=>!state.tasks.some(task=>task.id===id))||!Array.isArray(t.requiredChecks)||!t.requiredChecks.length||!t.requiredChecks.every(c=>descriptorValid(state,c,'check'))||!['pending',undefined].includes(t.status)||state.tasks.some(task=>task.id===t.id&&['accepted','committed'].includes(task.status))||!authorized(state,t))return hold(state,'task-contract','Current approval and explicit pending task contract required');
  return allow(state,{task:{...structuredClone(t),status:'pending',source:'operator-attested',messageRef:entry.messageRef}});
 }
 if(entry.kind!=='finding')return hold(state,'unsupported','Check and review outcomes require durable intent/result');
 if(d.action==='open'){
  const check=state.checks.find(c=>c.id===d.checkId&&!c.stale);
  if(!fields(d,['action','id','checkId','message'])||!text(d.id)||!text(d.message)||state.findings.some(f=>f.id===d.id)||!check)return hold(state,'finding','Finding must link an existing check or review');
  return allow(state,{finding:{id:d.id,checkId:check.id,scope:check.scope,taskId:check.taskId,origin:check.scope==='final'&&check.operation==='review'?'final-review':'check',status:'open',message:d.message,messageRef:entry.messageRef,source:'operator-attested'}});
 }
 const finding=state.findings.find(f=>f.id===d.id);
 const affected=finding?.scope==='final'?state.tasks.map(t=>t.id):[finding?.taskId];
 if(!fields(d,['action','id','actor','changeFingerprint'])||d.action!=='resolve'||!finding||finding.status==='closed'||!fields(d.actor,['id','role'])||d.actor.role!=='coder'||!affected.some(id=>assignedCoder(state,d.actor.id,id))||!hash(d.changeFingerprint)||d.changeFingerprint!==current(state,finding.scope,finding.taskId,evidence?.changes))return hold(state,'finding-resolution','Assigned Coder correction at the current fingerprint required');
 return allow(state,{finding:{...finding,status:'resolved',resolutionRef:entry.messageRef,resolutionActor:structuredClone(d.actor),changeFingerprint:d.changeFingerprint}});
}
/** Pure cooperative gate: verifies recorded consistency, never identity or semantic sufficiency. */
export function evaluateCooperativeVerification({state,request,evidence}={}){
 if(state?.mode!=='plan')return hold(state,'unsupported','Only the complete spec and plan path is supported');
 if(!request||request.expectedRevision!==state.revision)return hold(state,'revision','Stale verification request');
 if(request.actor?.role!=='orchestrator')return hold(state,'verification-actor','Orchestrator statement required');
 if(request.operation==='verification-record')return record({state,request,evidence});
 if(request.operation==='verification-result')return outcome({state,request,evidence});
 if(!['check','review'].includes(request.operation))return hold(state,'unsupported','Unsupported verification operation');
 const a=request.arguments,t=state.tasks.find(t=>t.id===request.taskId);
 if(!fields(a,['scope','actor','descriptor','changeFingerprint','findingIds'])||!['task','final'].includes(a.scope)||!hash(a.changeFingerprint)||a.changeFingerprint!==current(state,a.scope,request.taskId,evidence?.changes)||!descriptorValid(state,a.descriptor,request.operation))return hold(state,'verification-fingerprint','Exact scope descriptor and current fingerprint required');
 if(a.scope==='task'&&(!authorized(state,t)||t.status==='held'||request.operation==='review'||!t.requiredChecks.some(d=>same(d,a.descriptor))))return hold(state,'verification-task','Current task approval and exact assigned check required; Reviewer is final only');
 if(a.scope==='final'&&(request.taskId!==undefined||request.operation!=='review'||!state.tasks.length||state.tasks.some(t=>!authorized(state,t)||!['accepted','committed'].includes(t.status))))return hold(state,'verification-final','Final review follows accepted tasks and required task checks');
 const finalCorrection=a.scope==='final'&&state.findings.some(f=>f.origin==='final-review'&&f.status==='resolved'&&a.findingIds?.includes(f.id));
 if(a.scope==='final'&&!finalCorrection&&state.tasks.some(task=>task.requiredChecks.some(descriptor=>!state.checks.some(c=>c.scope==='task'&&c.taskId===task.id&&c.operation==='check'&&!c.stale&&c.status==='passed'&&c.verdict==='proven'&&text(c.resultRef)&&c.verificationActor?.role==='qa'&&same(c.descriptor,descriptor)&&c.changeFingerprint===evidence.changes?.tasks?.[task.id]))))return hold(state,'verification-final-checks','Initial final review requires current task QA evidence');
 if(a.actor?.role!==(request.operation==='review'?'reviewer':'qa')||a.actor.id===request.actor.id||!independent(state,a.actor,request.taskId))return hold(state,'verification-independence','Independent actor statement and fresh task QA required');
 const findings=state.findings.filter(f=>f.status!=='closed'&&(a.scope==='final'||f.scope==='task'&&f.taskId===request.taskId));
 if(a.findingIds!==undefined&&(!list(a.findingIds)||a.findingIds.some(id=>!findings.some(f=>f.id===id))))return hold(state,'finding-recheck','Unknown finding recheck');
 if(findings.some(f=>f.status!=='resolved'||!text(f.resolutionRef)||f.resolutionActor?.role!=='coder'||f.changeFingerprint!==a.changeFingerprint||!a.findingIds?.includes(f.id)||f.origin==='final-review'&&request.operation!=='review'||f.origin!=='final-review'&&request.operation!=='check'))return hold(state,'finding-recheck','Coder resolution and the required QA or final Reviewer recheck required');
 if(state.intents.some(i=>['check','review'].includes(i.operation)&&['prepared','unknown','mismatch'].includes(i.status)&&i.scope===a.scope&&i.taskId===request.taskId&&same(i.descriptor,a.descriptor)&&!i.stale))return hold(state,'verification-active','Reconcile the existing verification intent');
 const intent={requestId:request.requestId,operation:request.operation,status:'prepared',scope:a.scope,taskId:request.taskId,verificationActor:structuredClone(a.actor),descriptor:structuredClone(a.descriptor),changeFingerprint:a.changeFingerprint,findingIds:[...(a.findingIds??[])],scopeVersion:state.scopeVersion,targetVersion:state.targetVersion,versions:structuredClone(state.versions),target:structuredClone(state.target),approval:structuredClone(approval(state,request.taskId)),taskFingerprint:fingerprintRequest(a.scope==='final'?state.tasks:t),fingerprint:fingerprintRequest(request),source:'operator-attested'};
 return allow(state,{intent});
}
function outcome({state,request,evidence}){
 const intent=state.intents.find(i=>i.requestId===request.intentId),r=request.result,d=r?.data;
 if(!intent||!['check','review'].includes(intent.operation)||!['prepared','unknown','mismatch'].includes(intent.status))return hold(state,'verification-intent','Matching unresolved verification intent required');
 const valid=r&&['succeeded','failed','unknown','mismatch'].includes(r.status)&&text(r.messageRef)&&fields(d,['actor','descriptor','scope','taskId','changeFingerprint','verdict'])&&['proven','unmet','unverified'].includes(d.verdict)&&same(d.actor,intent.verificationActor)&&same(d.descriptor,intent.descriptor)&&d.scope===intent.scope&&d.taskId===intent.taskId&&d.changeFingerprint===intent.changeFingerprint;
 const fresh=!intent.stale&&intent.changeFingerprint===current(state,intent.scope,intent.taskId,evidence?.changes)&&(intent.scope==='task'||intent.scopeVersion===state.scopeVersion)&&intent.targetVersion===state.targetVersion&&same(intent.target,state.target)&&same(intent.versions,state.versions)&&independent(state,intent.verificationActor,intent.taskId)&&same(intent.approval,approval(state,intent.taskId))&&intent.taskFingerprint===fingerprintRequest(intent.scope==='final'?state.tasks:state.tasks.find(t=>t.id===intent.taskId));
 const status=!valid?'mismatch':r.status;
 const check={id:intent.requestId,operation:intent.operation,scope:intent.scope,taskId:intent.taskId,descriptor:structuredClone(intent.descriptor),verificationActor:structuredClone(intent.verificationActor),changeFingerprint:intent.changeFingerprint,resultRef:r?.messageRef,verdict:valid?d.verdict:'unverified',status:fresh&&status==='succeeded'&&d.verdict==='proven'?'passed':status==='failed'||d?.verdict==='unmet'?'failed':'unverified',stale:!fresh,source:'operator-attested'};
 const findings=[];
 if(check.status==='failed')findings.push({id:intent.requestId+':failure',checkId:check.id,scope:intent.scope,taskId:intent.taskId,origin:intent.operation==='review'?'final-review':'check',status:'open',source:'operator-attested',messageRef:r.messageRef});
 if(check.status==='passed')for(const id of intent.findingIds){const f=state.findings.find(f=>f.id===id);if(!f||f.status!=='resolved'||f.changeFingerprint!==intent.changeFingerprint)return hold(state,'finding-recheck','Finding changed after prepare');findings.push({...f,status:'closed',recheckRef:r.messageRef,recheckActor:structuredClone(d.actor)});}
 const transition={result:{...structuredClone(r),status,source:'operator-attested'},check,findings};
 return check.status==='passed'?allow(state,transition):{...hold(state,'verification-'+status,'Recorded outcome does not establish passing current evidence'),proposedTransition:transition};
}
function defaultRunner({cwd,args}){
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.toUpperCase().startsWith('GIT_')));
 Object.assign(env,{GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'});
 return spawnSync('git',['--no-pager','--literal-pathspecs','-c','core.fsmonitor=false',...args],{cwd,env,encoding:'buffer',timeout:10000,maxBuffer:16*1024*1024});
}
/** Read tracked/untracked regular bytes, deletions and modes without staging or execution.
 * The snapshot is cooperative evidence at observation time, not an atomic execution sandbox. */
export async function readCooperativeChanges({state,gitRunner=defaultRunner}){
 const inventory=await gitRunner({cwd:state.target.realpath,args:['ls-files','--cached','--others','--exclude-standard','-z']});
 if(inventory?.status!==0||inventory.error||!Buffer.isBuffer(inventory.stdout))throw Error('Verification inventory query failed');
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(inventory.stdout);
 if(raw&&!raw.endsWith('\0'))throw Error('Incomplete verification inventory');
 const index=await gitRunner({cwd:state.target.realpath,args:['ls-files','--stage','-z']});
 if(index?.status!==0||index.error||!Buffer.isBuffer(index.stdout))throw Error('Verification index query failed');
 const indexText=new TextDecoder('utf-8',{fatal:true}).decode(index.stdout),indexRows=[];
 if(indexText&&!indexText.endsWith('\0'))throw Error('Incomplete verification index');
 for(const entry of indexText?indexText.slice(0,-1).split('\0'):[]){const match=/^(100644|100755) ([a-f0-9]{40}|[a-f0-9]{64}) 0\t([\s\S]+)$/.exec(entry);if(!match)throw Error('Verification requires regular stage-0 index entries');indexRows.push({path:path.join(state.target.realpath,match[3]),entry});}
 const names=[...new Set(raw?raw.slice(0,-1).split('\0'):[])].sort(),rows=[];
 for(const name of names){
  if(!name||name.includes('\\')||name.includes('\n')||name.includes('\r')||path.isAbsolute(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Invalid verification path');
  const file=path.join(state.target.realpath,...name.split('/'));
  try{await inspectPath(file);const stat=await fs.lstat(file);if(!stat.isFile())throw Error('Verification requires regular files');rows.push({path:file,mode:stat.mode&0o777,hash:'sha256:'+createHash('sha256').update(await fs.readFile(file)).digest('hex')});}
  catch(error){if(error.code!=='ENOENT')throw error;rows.push({path:file,deleted:true});}
 }
 const tasks={};for(const task of state.tasks){if(!list(task.paths)||!task.paths.every(p=>absolute(p)&&within(state.target.realpath,p)))throw Error('Invalid task paths');tasks[task.id]=fingerprintRequest({scope:'task',taskId:task.id,target:state.target,paths:task.paths,index:indexRows.filter(row=>task.paths.some(p=>within(p,row.path))),rows:rows.filter(row=>task.paths.some(p=>within(p,row.path)))});}
 return {tasks,final:fingerprintRequest({scope:'final',target:state.target,index:indexRows,rows})};
}
