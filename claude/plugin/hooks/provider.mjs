import {validateCooperativeState} from './runtime/cooperative-schema.mjs';
const text=value=>typeof value==='string'&&value.length>0;
const hash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const list=value=>Array.isArray(value)&&value.length>0&&value.every(text)&&new Set(value).size===value.length;
const canonicalPath=value=>typeof value==='string'&&value.startsWith('/')&&!/[\\\x00\r\n]/.test(value)&&(value==='/'||!value.endsWith('/'))&&!value.slice(1).split('/').some(part=>!part||part==='.'||part==='..');
const within=(base,p)=>canonicalPath(base)&&canonicalPath(p)&&(base==='/'||base===p||p.startsWith(base+'/'));
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(canonical);
 if(value&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 throw Error('Scope must contain JSON data');
}
function validate(scope){
 const t=scope?.target;
 if(!text(scope?.workflowId)||!text(scope.taskId)||!t||!text(t.realpath)||!text(t.gitCommonDir)||!text(t.gitDir)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(t.head)||!(t.branch===null||text(t.branch))||!Array.isArray(scope.documents)||!scope.documents.length||scope.documents.some(d=>!text(d.path)||!hash(d.hash))||!list(scope.paths)||!list(scope.operations)||!text(scope.role)||!(scope.parentBinding===null||text(scope.parentBinding))||!(scope.parentLease===null||scope.parentLease===undefined||text(scope.parentLease))||!text(scope.assignment)||!(scope.lease===null||text(scope.lease))||!Number.isSafeInteger(scope.revision)||scope.revision<0||!hash(scope.policyHash))throw Error('Incomplete proposal scope');
 return canonical(scope);
}
async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return 'sha256:'+Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export function providerStatus(){return {source:'implemented',hostIntegrity:'unverified',activation:'unavailable'};}
// This private session store has no production writer before E1/E2 validates
// the host confirmation boundary. Cooperative state never populates it.
const nativeRecords=new Map();
const nativeSource={read:async ({sessionId,agentId})=>nativeRecords.get(JSON.stringify([sessionId,agentId]))??null};
/** Resolver input comes from host observations and a private native source. */
export async function resolveToolBinding(observation,event,source=nativeSource){
 try{
  if(!text(observation?.sessionId)||!text(observation?.cwd)||!text(event?.tool_use_id)||observation.agentId!==(event.agentId??null))return {status:'unavailable'};
  const record=await source.read({sessionId:observation.sessionId,agentId:observation.agentId}),binding=record?.binding;
  const actor=record?.state?.identities?.find(item=>item.actorRef===binding?.actorRef),lease=record?.state?.leases?.find(item=>item.actorRef===binding?.actorRef);
  const proof=record?.evidence?.provenance?.find(item=>item.id===actor?.observationRef);
  if(record?.integrity!=='verified'||binding?.status!=='active'||binding.sessionId!==observation.sessionId||binding.agentId!==observation.agentId||!text(binding.actorRef)||!text(binding.taskId)||!text(binding.leaseId)||actor?.taskId!==binding.taskId||lease?.status!=='active'||lease.taskId!==binding.taskId||lease.leaseId!==binding.leaseId||proof?.source!=='platform-event'||proof.actorRef!==binding.actorRef||proof.platform!=='claude'||proof.eventRef!==event.tool_use_id||proof.verification?.status!=='verified'||proof.verification.sourceRef!==event.tool_use_id)return {status:'unavailable'};
  return {status:'ready',binding,policy:record.policy,state:record.state,evidence:record.evidence};
 }catch{return {status:'unavailable'};}
}
export async function createProposal(scope,{now=Date.now(),generation}={}){
 const normalized=validate(scope);if(!Number.isSafeInteger(now)||!text(generation))throw Error('Invalid proposal generation');
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 return {status:'proposed',scope:normalized,scopeHash:await digest(normalized),nonce,generation,createdAt:now,expiresAt:now+300000,consumed:false};
}
export async function checkProposal(proposal,current,{now=Date.now(),generation}={}){
 try{const scope=validate(current);if(proposal?.status!=='proposed'||proposal.consumed!==false||!text(proposal.nonce)||proposal.generation!==generation||!Number.isSafeInteger(now)||!Number.isSafeInteger(proposal.expiresAt)||now>=proposal.expiresAt||now<proposal.createdAt||await digest(scope)!==proposal.scopeHash||await digest(validate(proposal.scope))!==proposal.scopeHash)return {status:'invalid'};return {status:'valid',scopeHash:proposal.scopeHash};}catch{return {status:'invalid'};}
}
export function checkChildAssignment(parent,assignment,requested){
 const keys=['parentBinding','parentActor','parentLease','taskId','role','paths','operations'];
 if(!parent||parent.status!=='active'||!assignment||!requested||!text(parent.bindingId)||!text(parent.taskId)||!text(parent.actorRef)||!text(parent.leaseId)||parent.lease?.status!=='active'||parent.lease.leaseId!==parent.leaseId||parent.lease.taskId!==parent.taskId||parent.lease.actorRef!==parent.actorRef||assignment.parentBinding!==parent.bindingId||assignment.parentActor!==parent.actorRef||assignment.parentLease!==parent.leaseId||assignment.taskId!==parent.taskId||!text(assignment.role)||!list(assignment.paths)||!list(assignment.operations)||keys.some(key=>JSON.stringify(assignment[key])!==JSON.stringify(requested[key])))return {status:'mismatch'};
 return {status:'matched'};
}
/** A proposal can be consumed once, but consumption never grants authority. */
export function createProposalStore(){
 const generation=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');let current=null,queue=Promise.resolve();
 const serial=fn=>{const result=queue.then(fn,fn);queue=result.then(()=>{},()=>{});return result;};
 return {
  propose:scope=>serial(async()=>{current=await createProposal(scope,{generation});return structuredClone(current);}),
  consume:(nonce,scope)=>serial(async()=>{if(!current||current.nonce!==nonce||(await checkProposal(current,scope,{generation})).status!=='valid')return {status:'invalid'};current.consumed=true;return {status:'consumed-unverified',scopeHash:current.scopeHash,hostIntegrity:'unverified',activation:'unavailable'};}),
  clear:()=>serial(()=>{current=null;})
 };
}

/** Cooperative state is read-only proposal input, never native provenance. */
export function selectRootProposal({workflowId,taskId,state,target}){
 validateCooperativeState(state);
 if(state.workflowId!==workflowId||!text(taskId)||!target||['realpath','gitCommonDir','gitDir','head','branch'].some(key=>state.target[key]!==target[key]))throw Error('Workflow target unavailable or changed');
 const tasks=state.tasks.filter(t=>t.id===taskId&&!t.invalidated&&!['held','accepted','committed'].includes(t.status)),intents=state.intents.filter(i=>i.taskId===taskId&&i.operation==='assign-agent'&&i.status==='prepared'&&i.source==='operator-attested');
 if(tasks.length!==1||intents.length!==1)throw Error('Exact proposed assignment unavailable');
 const task=tasks[0],intent=intents[0],scopes=state.scopes.filter(s=>s.scopeVersion===state.scopeVersion&&(!s.data?.affectedTaskIds||s.data.affectedTaskIds.includes(taskId)));
 if(scopes.length!==1||!list(task.paths)||!list(intent.paths)||!list(intent.operations)||intent.operations.some(operation=>operation!=='edit')||intent.role!=='implementer'||!text(intent.requestId)||!text(intent.correlation)||intent.paths.some(p=>!within(target.realpath,p)||!task.paths.some(base=>within(base,p))||!scopes[0].data.paths?.some(base=>within(base,p))))throw Error('Exact task scope unavailable');
 const approvals=state.records.filter(r=>r.kind==='approval'&&(!r.data?.affectedTaskIds||r.data.affectedTaskIds.includes(taskId))),approval=approvals.at(-1);
 if(!approval||approval.source!=='operator-attested'||task.approvalRef!==intent.approvalRef||approval.messageRef!==intent.approvalRef||task.approvalVersion!==intent.approvalVersion||approval.data.approvalVersion!==intent.approvalVersion||task.documentVersion!==intent.documentVersion||approval.data.documentVersion!==intent.documentVersion||task.scopeVersion!==state.scopeVersion||intent.scopeVersion!==state.scopeVersion||approval.scopeVersion!==state.scopeVersion||task.targetVersion!==state.targetVersion||intent.targetVersion!==state.targetVersion||approval.targetVersion!==state.targetVersion||JSON.stringify(intent.target)!==JSON.stringify(state.target))throw Error('Proposal provenance changed');
 const sourceDocuments=approval.data.documents;
 if(!Array.isArray(sourceDocuments)||sourceDocuments.length!==2||!['spec','plan'].every(kind=>sourceDocuments.some(d=>d.kind===kind))||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(intent.docsCommit??'')||sourceDocuments.some(d=>d.approvalRef!==intent.approvalRef||d.commit!==intent.docsCommit)||JSON.stringify(intent.documents)!==JSON.stringify(sourceDocuments))throw Error('Document approval changed');
 const documents=sourceDocuments.map(d=>({path:d.path,hash:d.contentHash}));
 if(documents.some(d=>!within(target.realpath,d.path)))throw Error('Document outside target');
 return validate({workflowId,taskId,target,documents,paths:intent.paths,operations:intent.operations,role:intent.role,parentBinding:null,parentLease:null,assignment:intent.requestId,lease:null,revision:state.revision,policyHash:state.versions.policyHash,source:'operator-attested-proposal'});
}
export function resolveRootProposalScope({workflowId,taskId,state,target,documentHashes}){
 const scope=selectRootProposal({workflowId,taskId,state,target});
 if(scope.documents.some(d=>documentHashes?.[d.path]!==d.hash))throw Error('Document bytes changed');
 return scope;
}
