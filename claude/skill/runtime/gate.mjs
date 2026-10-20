import path from 'node:path';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const oid=value=>typeof value==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const gitPath=value=>typeof value==='string'&&value.length>0&&!/[\\\x00\r\n:]/.test(value)&&!value.startsWith('/')&&!value.split('/').some(p=>!p||p==='.'||p==='..');
const validPaths=values=>Array.isArray(values)&&values.every(gitPath)&&new Set(values).size===values.length;
const samePaths=(a,b)=>validPaths(a)&&validPaths(b)&&same([...a].sort(),[...b].sort());
const within=(base,file)=>{const relative=path.relative(base,file);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
const targetValid=t=>t&&path.isAbsolute(t.realpath)&&path.normalize(t.realpath)===t.realpath&&path.isAbsolute(t.gitCommonDir)&&oid(t.head)&&(t.branch===null||typeof t.branch==='string'&&t.branch);

/** Git-specific validation ONLY. Trusted adapters must separately satisfy T2
 * evaluate() role/identity/approval policy and transactWorkflow() persistence.
 * Inputs here are provider observations, never facts accepted from tool input.
 * Preflight permission does not mean execution or completed commit. */
export async function runGate({phase,state,request,gitEvidence,expectedCommit,result}={}){
 const hold=(reason,id='runtime.git-evidence')=>({decision:'hold',ruleIds:[id],reason,requiredEvidence:['observed-git-state'],expectedRevision:state?.revision??0,proposedTransition:null,coverage:{enforcement:'git-validation-only'}});
 const allow=(reason,extra={})=>({...hold(reason),decision:'allow',requiredEvidence:[],...extra});
 try{
  if(!state||!targetValid(state.target)||!Number.isSafeInteger(state.revision)||state.revision<0||!request||request.operation!=='commit'||typeof request.requestId!=='string'||!request.requestId||request.cwd!==state.target.realpath)return hold('Invalid Git gate input');
  const actors=state.identities?.filter(i=>i.actorRef===request.actorRef);
  const leases=state.leases?.filter(l=>l.actorRef===request.actorRef&&l.taskId===request.taskId&&l.status==='active');
  if(actors?.length!==1||actors[0].role!=='orchestrator'||actors[0].taskId!==request.taskId||leases?.length!==1)return hold('Only the observed active Orchestrator may request commit','git.specialists-deny');
  const task=state.tasks?.find(t=>t.id===request.taskId);
  const d=request.descriptor;
  if(!task||!d||!['documents','task'].includes(d.kind)||!oid(d.parent)||!oid(d.indexTree)||!hash(d.fingerprint)||!validPaths(d.paths)||!d.paths.length||d.parent!==state.target.head||d.parent.length!==d.indexTree.length)return hold('Incomplete or stale commit descriptor');
  if(!Array.isArray(request.paths)||!samePaths(request.paths.map(file=>{
   if(typeof file!=='string'||!path.isAbsolute(file)||!within(state.target.realpath,file)||path.normalize(file)!==file)throw Error('Requested path escapes target');
   return path.relative(state.target.realpath,file).split(path.sep).join('/');
  }),d.paths))return hold('Request paths differ from commit paths');
  if(d.kind==='documents'){
   if(state.mode!=='plan'||state.documents?.length!==2||!samePaths(state.documents.map(x=>x.kind),['spec','plan'])||!samePaths(d.paths,state.documents.map(x=>x.gitPath)))return hold('Complete exact approved spec and plan set required','runtime.docs-commit');
   for(const document of state.documents){
    const approvals=state.approvals?.filter(a=>a.id===document.approvalRef);
    if(!hash(document.contentHash)||document.path!==path.join(state.target.realpath,...document.gitPath.split('/'))||approvals?.length!==1||!['user-message','human-confirmation'].includes(approvals[0].source)||!approvals[0].messageRef||approvals[0].contentHash!==document.contentHash)return hold('Approved document hash unavailable','runtime.docs-commit');
   }
  }else{
   const accepted=state.acceptances?.filter(a=>a.taskId===task.id&&a.fingerprint===d.fingerprint&&state.identities.some(i=>i.actorRef===a.actorRef&&i.role==='orchestrator'));
   if(task.status!=='accepted'||accepted?.length!==1||!task.criteria?.length||!same(accepted[0].criteria,task.criteria)||!Array.isArray(accepted[0].checkIds)||!task.requiredChecks?.every(id=>accepted[0].checkIds.includes(id))||!Array.isArray(accepted[0].findingIds)||state.commits?.some(c=>c.kind==='task'&&c.taskId===task.id))return hold('Exact accepted task diff required','git.orchestrator-accept-commit');
   const allowed=task.paths;
   if(!Array.isArray(allowed)||request.paths.some(file=>!allowed.some(base=>path.isAbsolute(base)&&within(base,file))))return hold('Commit contains another task or unrelated changes','git.orchestrator-accept-commit');
  }
  if(phase==='preflight'){
   const g=gitEvidence;
   if(!g||!same(g.target,state.target)||g.indexTree!==d.indexTree||g.stagedFingerprint!==d.fingerprint||!samePaths(g.stagedPaths,d.paths)||!validPaths(g.workingPaths)||!validPaths(g.untrackedPaths))return hold('Actual Git target index diff and exact paths required');
   const dirty=[...g.workingPaths,...g.untrackedPaths];
   const scope=d.kind==='documents'?state.documents.map(x=>x.path):task.paths;
   if(dirty.some(file=>scope.some(base=>within(base,path.join(state.target.realpath,...file.split('/'))))))return hold('Unstaged or untracked task changes invalidate acceptance');
   if(d.kind==='documents'){
    if(!Array.isArray(g.documents)||!samePaths(g.documents.map(x=>x.gitPath),d.paths)||state.documents.some(document=>!g.documents.some(observed=>observed.gitPath===document.gitPath&&observed.path===document.path&&observed.contentHash===document.contentHash&&observed.observedHash===document.contentHash)))return hold('Observed document bytes differ from approved hashes','runtime.docs-commit');
   }
   return allow('Git preflight passed; observed commit result still required',{expectedCommit:{requestId:request.requestId,taskId:task.id,kind:d.kind,parent:d.parent,tree:d.indexTree,paths:[...d.paths],fingerprint:d.fingerprint,target:structuredClone(state.target),remainingPaths:[...new Set(dirty)].sort()}});
  }
  if(phase!=='reconcile')return hold('Unknown Git gate phase');
  const expected=expectedCommit;
  if(!expected||expected.requestId!==request.requestId||expected.taskId!==task.id||expected.parent!==d.parent||expected.tree!==d.indexTree||expected.fingerprint!==d.fingerprint||!samePaths(expected.paths,d.paths)||expected.kind!==undefined&&expected.kind!==d.kind||expected.target!==undefined&&!same(expected.target,state.target))return hold('Preflight correlation unavailable');
  if(!result||!oid(result.commit)||result.commit===expected.parent||result.commit.length!==expected.parent.length||result.parent!==expected.parent||result.tree!==expected.tree||!samePaths(result.paths,expected.paths)||result.head!==result.commit||!same(result.target,{...state.target,head:result.commit})||!validPaths(result.remainingPaths))return hold('Commit result unavailable or differs from expected parent tree paths and HEAD');
  const scopedPaths=d.kind==='documents'?state.documents.map(x=>x.path):task.paths;
  if(result.remainingPaths.some(file=>scopedPaths.some(base=>within(base,path.join(state.target.realpath,...file.split('/'))))))return hold('Committed task still has remaining changes');
  if(expected.remainingPaths!==undefined&&!samePaths(result.remainingPaths,expected.remainingPaths))return hold('Remaining changes differ from preflight observation');
  const next=structuredClone(state);next.target.head=result.commit;
  next.commits=[...state.commits??[],{requestId:request.requestId,taskId:task.id,kind:d.kind,commit:result.commit,parent:result.parent,tree:result.tree,paths:[...result.paths],fingerprint:d.fingerprint,actorRef:request.actorRef}];
  if(d.kind==='task')next.tasks.find(t=>t.id===task.id).status='committed';
  else for(const document of next.documents)document.commit=result.commit;
  return allow('Observed commit matches preflight',{proposedTransition:next});
 }catch(error){return hold('Git validation failed: '+error.message);}
}
