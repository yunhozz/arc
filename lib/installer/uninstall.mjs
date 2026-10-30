import path from 'node:path';
import {inspectPath,sameIdentity,TargetConfigurationError} from './targets.mjs';
import {SKILLS,snapshotSkill} from './superpowers.mjs';
import {validatePlanSet} from './plan.mjs';
import {removeManagedBlock} from './global-config.mjs';
import {attachShellCompletionCleanup} from './shell-completion.mjs';
import {removeNativeHooks} from './native-hooks.mjs';
import {parseClaudeSettings} from './runtime-config.mjs';
import {assertPlanSnapshot,applyUninstallTransaction,findNativeReferences,inspectRetainedNativeReferences} from './transaction.mjs';
export function buildUninstallPlan({target,safeFs,skipGlobal=false,removeCompletion=true}){
 const snapshot=new Map(),removals=[],managedPaths=[path.join(target.home,'skills/arc'),...target.profileNames.map(name=>path.join(target.home,'agents',name))],globalChanges=[];
 for(const filename of managedPaths){const directory=filename===managedPaths[0];const found=inspectPath(safeFs,filename,{kind:directory?'directory':'file',tree:directory,allowLinks:directory,snapshot});if(found.exists)removals.push(filename);}
 const linkedSkills=new Set(),arc=managedPaths[0];
 for(const[filename,entry]of snapshot){if(entry?.type!=='symlink')continue;
  const relative=path.relative(arc,filename),parts=relative.split('/'),skill=parts[2];
  if(parts[0]!=='references'||parts[1]!=='superpowers'||!SKILLS.includes(skill)||parts.length<4||!entry.link||path.isAbsolute(entry.link)||entry.link.includes('\\')||entry.link.includes('\0'))throw new TargetConfigurationError('Unsafe ARC removal link');
  linkedSkills.add(skill);
 }
 for(const skill of linkedSkills){const root=arc+'/references/superpowers/'+skill,directory=safeFs.openRoot(root);try{if(!sameIdentity(snapshot.get(root),directory.stat()))throw new TargetConfigurationError('Removal reference root changed');snapshotSkill(directory,root,[]);}finally{directory.close();}}
 const retainedReferences=[],retainedPaths=[],notes=[];let nativeChange=null;
 const retain=(reference,reason)=>{if(reference&&!retainedReferences.includes(reference))retainedReferences.push(reference);if(!retainedPaths.includes(arc))retainedPaths.push(arc);const index=removals.indexOf(arc);if(index!==-1)removals.splice(index,1);notes.push(reason);};
 const scanNativeReferences=()=>{const found=inspectPath(safeFs,target.runtimeConfigPath,{kind:'file',read:true,snapshot});if(!managedPaths.includes(target.runtimeConfigPath))managedPaths.push(target.runtimeConfigPath);if(!found.exists)return[];const files=[...snapshot].filter(([name,entry])=>entry?.type==='file'&&name.startsWith(arc+'/')).map(([name])=>name);try{return findNativeReferences({platform:target.platform,original:found.bytes,files});}catch{throw Error('Native settings are invalid or unparseable');}};
 const retainUnowned=reason=>{retain(null,reason);if(!skipGlobal)try{for(const reference of scanNativeReferences())retain(reference,'Unowned native hook may reference ARC assets');}catch(error){notes.push('Native settings could not be inspected: '+error.message);}};
 if(removals.includes(arc)){
  const owner=inspectPath(safeFs,arc+'/native-hooks.json',{kind:'file',read:true,snapshot});
  if(owner.exists){let record;try{record=parseClaudeSettings(new TextDecoder('utf-8',{fatal:true}).decode(owner.bytes));}catch{retainUnowned('Native hook ownership record is invalid');}
   if(record){const reference=typeof record.entryPoint==='string'&&record.entryPoint?record.entryPoint:null;
    if(skipGlobal)retain(reference,'Native hook cleanup skipped; ARC assets retained');
    else if(!reference||!path.isAbsolute(reference)||path.relative(arc,reference)===''||path.relative(arc,reference)==='..'||path.relative(arc,reference).startsWith('../')||path.isAbsolute(path.relative(arc,reference)))retainUnowned('Native hook entry point is outside the ARC tree');
    else if(record.settingsPath!==target.runtimeConfigPath)retainUnowned('Native hook settings path differs from ownership record');
    else try{const found=inspectPath(safeFs,target.runtimeConfigPath,{kind:'file',read:true,snapshot});managedPaths.push(target.runtimeConfigPath);const removed=removeNativeHooks({platform:target.platform,original:found.exists?found.bytes:null,record});if(!removed.removed)retainUnowned('Native hook ownership conflict: '+removed.conflicts.join('; '));else{nativeChange={path:target.runtimeConfigPath,content:removed.content,reference,arc};globalChanges.push({path:nativeChange.path,content:nativeChange.content});}}catch(error){retainUnowned('Native hook cleanup could not be planned: '+error.message);}
   }
  }else if(!skipGlobal){
   try{for(const reference of scanNativeReferences())retain(reference,'Unowned native hook may reference ARC assets');}
   catch(error){retain(null,'Native settings could not be inspected: '+error.message);}
  }
 }
 if(!skipGlobal){const filename=target.instructionPath??target.globalPaths[0],found=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});managedPaths.push(filename);if(found.exists){const removed=removeManagedBlock(found.bytes);if(removed.changed)globalChanges.push({path:filename,content:removed.content});}}
 const plan={target,skipGlobal,snapshot,removals,managedPaths,externalPaths:[],globalChanges,nativeChange,retainedReferences,retainedPaths,retainedReasons:notes,summary:[target.platform==='codex'?'Codex config.toml wait settings and native concurrency key are preserved.':'Claude settings.json native concurrency key is preserved.',...notes]};
 if(removeCompletion)attachShellCompletionCleanup([plan],{safeFs});return plan;
}
export async function uninstallTargets(plans,{safeFs,signal,hooks={}}){
 const results=plans.map(plan=>({platform:plan.target.platform,status:'not-started',rollback:'not-needed',residualPaths:[...plan.retainedPaths],retainedReferences:[...plan.retainedReferences],retainedReasons:[...plan.retainedReasons],error:null}));let invalid=false;
 // Each standalone preview retains its snapshot; only the first plan owns the shared shell write.
 for(const plan of plans.slice(1)){const filename=path.join(plans[0].target.userHome,'.zshrc');plan.managedPaths=plan.managedPaths.filter(name=>name!==filename);plan.globalChanges=plan.globalChanges.filter(change=>change.path!==filename);plan.snapshot.delete(filename);}
 try{validatePlanSet(plans);}catch(error){return{results:results.map(item=>({...item,status:'failed',error})),interrupted:false};}
 for(let i=0;i<plans.length;i++)try{assertPlanSnapshot(plans[i],{safeFs});}catch(error){const retained=plans[i].nativeChange?inspectRetainedNativeReferences(plans[i],{safeFs}):{residualPaths:[],retainedReferences:[],retainedReasons:[]};results[i]={...results[i],status:'failed',residualPaths:[...new Set([...results[i].residualPaths,...retained.residualPaths])],retainedReferences:[...new Set([...results[i].retainedReferences,...retained.retainedReferences])],retainedReasons:[...results[i].retainedReasons,...retained.retainedReasons],error};invalid=true;}
 if(invalid)return{results,interrupted:false};

 for(let i=0;i<plans.length;i++){
  if(signal?.aborted)return{results,interrupted:true};const plan=plans[i];
  try{assertPlanSnapshot(plan,{safeFs});const applied=applyUninstallTransaction(plan,{safeFs,signal,hooks});results[i]={...results[i],status:plan.retainedPaths.length||applied.partial||applied.cleanupError?'partial':'uninstalled',residualPaths:[...new Set([...results[i].residualPaths,...applied.residualPaths])],retainedReferences:[...new Set([...results[i].retainedReferences,...(applied.retainedReferences??[])])],retainedReasons:[...results[i].retainedReasons,...(applied.retainedReasons??[])],error:applied.cleanupError??null};if(applied.cleanupError)break;}
  catch(error){const retained=plan.nativeChange&&!error.nativeRetentionInspected?inspectRetainedNativeReferences(plan,{safeFs}):{residualPaths:[],retainedReferences:[],retainedReasons:[]};results[i]={...results[i],status:'failed',rollback:error.rollback??'not-needed',residualPaths:[...new Set([...results[i].residualPaths,...(error.residualPaths??[]),...retained.residualPaths])],retainedReferences:[...new Set([...results[i].retainedReferences,...(error.retainedReferences??[]),...retained.retainedReferences])],retainedReasons:[...results[i].retainedReasons,...(error.retainedReasons??[]),...retained.retainedReasons],error};return{results,interrupted:Boolean(signal?.aborted)};}
 }
 return{results,interrupted:false};
}
