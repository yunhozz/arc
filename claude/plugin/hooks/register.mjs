import {createProposalStore,resolveRootProposalScope,selectRootProposal,providerStatus,resolveToolBinding} from './provider.mjs';
import {assessToolCheck} from './mod-adapter.mjs';
import {validateCooperativeState} from './runtime/cooperative-schema.mjs';

// Provider identity and host ordering are not yet verified. No option can turn
// these observations into an active approval, binding, identity or lease.
const store=createProposalStore();
const unavailable='ARC provider is unavailable: host provenance is unverified';
const paneId='arc-proposal';
let paneProposal=null;
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
function oneLine(result){const text=result?.stdout;if(result?.exitCode!==0||typeof text!=='string'||!text.endsWith('\n')||text.slice(0,-1).includes('\n'))throw Error('Git observation unavailable');return text.slice(0,-1);}
// The source parameter is used only by a direct fixture call. The registered
// hook supplies none and therefore always uses the private native source.
export async function handleToolCheck($,e,next,source){
 const host=await next(e);
 if(host?.decision==='deny'||host?.decision==='ask')return host;
 try{
  const observation={sessionId:await $.session.id(),cwd:await $.session.cwd(),agentId:e.agentId??null};
  const resolution=await resolveToolBinding(observation,e,source);
  const decision=assessToolCheck(e,observation,resolution);
  if(host?.decision==='allow'&&decision.decision==='allow')return host;
 }catch{/* Invalid inputs cannot grant authority. */}
 return {decision:'deny',reason:unavailable};
}
export function register(on,options){
 on('session.start',async ($,e,next)=>{
  await store.clear();paneProposal=null;
  try{await $.command.register({name:'arc-bind',description:'Prepare an unverified ARC scope proposal',argumentHint:'<workflowId> <taskId>'});}catch{/* A command collision does not grant authority. */}
  return next(e);
 });
 on('session.end',async ($,e,next)=>{await store.clear();paneProposal=null;return next(e);});
 on('command.run',{command:'arc-bind'},async ($,e)=>{
  if(e?.origin?.kind!=='composer')return {text:'ARC proposal requires a composer command.'};
  const args=typeof e.args==='string'?e.args.trim().split(/\s+/):[];
  if(args.length!==2||!validId(args[0])||!validId(args[1]))return {text:'Usage: /arc-bind <workflowId> <taskId>. Provider activation is unavailable.'};
  try{
   const root=oneLine(await $.process.run(['git','rev-parse','--show-toplevel']));
   const common=oneLine(await $.process.run(['git','rev-parse','--path-format=absolute','--git-common-dir']));
   const gitDir=oneLine(await $.process.run(['git','rev-parse','--absolute-git-dir']));
   const head=oneLine(await $.process.run(['git','rev-parse','HEAD']));
   const branchResult=await $.process.run(['git','symbolic-ref','--quiet','--short','HEAD']);
   const branch=branchResult.exitCode===1?null:oneLine(branchResult);
   if(!root.startsWith('/')||!common.startsWith('/')||!gitDir.startsWith('/'))throw Error('Absolute target unavailable');
   const sourcePath=common+'/arc/workflows/'+args[0]+'/state.json',sourceStat=await $.fs.stat(sourcePath,{resolve:true});if(sourceStat.kind!=='file'||sourceStat.isLink||sourceStat.realPath!==sourcePath||sourceStat.size>1048576)throw Error('Unsafe workflow source');
   const sourceText=await $.fs.read(sourcePath);if(typeof sourceText!=='string'||sourceText.length>1048576)throw Error('Invalid workflow source');const state=validateCooperativeState(JSON.parse(sourceText));
   const target={realpath:root,gitCommonDir:common,gitDir,head,branch},selection=selectRootProposal({workflowId:args[0],taskId:args[1],state,target});
   const documentHashes={};for(const document of selection.documents){if(typeof document.path!=='string'||!document.path.startsWith(root+'/')||document.path.includes('/../'))throw Error('Unsafe document path');const stat=await $.fs.stat(document.path,{resolve:true});if(stat.kind!=='file'||stat.isLink||stat.realPath!==document.path||stat.size>1048576)throw Error('Unsafe document source');const file=await $.fs.read(document.path,{as:'bytes'});if(typeof file?.base64!=='string'||file.base64.length>1398104)throw Error('Invalid document bytes');const raw=atob(file.base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));const digest=await crypto.subtle.digest('SHA-256',bytes);documentHashes[document.path]='sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
   const scope=resolveRootProposalScope({workflowId:args[0],taskId:args[1],state,target,documentHashes});
   const proposal=await store.propose(scope);
   paneProposal=proposal;
   await $.ui.open({id:paneId,title:'ARC proposal'});
   return {text:'Unverified ARC proposal (no approval or binding): '+JSON.stringify({scope:proposal.scope,scopeHash:proposal.scopeHash,expiresAt:proposal.expiresAt,provider:providerStatus()})};
  }catch{paneProposal=null;await store.clear();return {text:'ARC proposal unavailable; verify workflow scope and host integrity. No approval or binding was created.'};}
 });
 on('ui.render',{component:'Pane'},async ($,e,next)=>{
  if(e.requestId!==paneId)return next(e);
  const {Box,Text,Button}=$.ui.resolve(e),proposal=paneProposal;
  if(!proposal)return Text({children:['No ARC proposal. Provider activation is unavailable.']});
  return Box({flexDirection:'column',children:[
   Text({children:['Unverified proposal. No approval or binding is active.']}),
   Text({children:[JSON.stringify(proposal.scope)]}),
   Text({children:['Scope hash: '+proposal.scopeHash]}),
   Text({children:['Confirm is unavailable until host integrity is verified.']}),
   Button({key:'confirm',label:'Confirm unavailable',onPress:()=>{$.ui.invalidate('ui.render');}}),
   Button({key:'cancel',label:'Cancel',onPress:async()=>{if(paneProposal!==proposal)return;paneProposal=null;await store.clear();await $.ui.close({id:paneId});}})
  ]});
 });
 on('tool.check',async ($,e,next)=>handleToolCheck($,e,next)).catch(async()=>({decision:'deny',reason:unavailable}));
 on('agent.spawn',async()=>({deny:unavailable})).catch(async()=>({deny:unavailable}));
}
