import{parseLanguage,serializeLanguage,renderLanguagePolicy,validateLanguage}from'./language.mjs';
import{resolveLimits}from'../limits.mjs';import{parseLimits,serializeLimits}from'./limits.mjs';import{readRuntimeConcurrency,renderCodexConcurrency,renderClaudeConcurrency}from'./runtime-config.mjs';import{assertPlanSnapshot,findNativeReferences}from'./transaction.mjs';
import{validateModelConfig}from'../models/config.mjs';
import{assertCatalogRoles}from'../models/catalog.mjs';
import {createHash} from 'node:crypto';import {buildNativeHookDefinitions,renderNativeHooks} from './native-hooks.mjs';
import path from'node:path';import{loadModelConfig,applyPreset,applyCustomRoles,serializeModelConfig,renderProfiles,resolveModelSettings}from'../models/index.mjs';import{inspectPath,TargetConfigurationError}from'./targets.mjs';import{renderManagedBlock,renderWaitSettings,agentsBlockBody}from'./global-config.mjs';
function fail(message){throw new TargetConfigurationError(message);}
export function previewLimits({target,safeFs}){
 const snapshot=new Map(),filename=path.join(target.home,'skills/arc/limits.toml');
 const current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});
 let existing=null;try{if(current.exists)existing=parseLimits(current.bytes);}catch(cause){fail(`Invalid ARC limits: ${cause.message}`);}
 return{existing,snapshot};
}
export function previewLanguage({target,safeFs}){
 const snapshot=new Map(),filename=path.join(target.home,'skills/arc/settings.toml');
 const current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot});
 let existing=null;try{if(current.exists)existing=parseLanguage(current.bytes).language;}catch(cause){fail(`Invalid ARC language settings: ${cause.message}`);}
 return{existing,snapshot};
}
function renderModelAssets({payload,target,preset,modelConfig,language,customRoles,preservedCustomRoles,verifiedCatalog}){
 const input=payload.modelInputs[target.platform];if(!input)fail('Selected payload platform is unavailable');
 let config;if(modelConfig!==undefined)config=validateModelConfig(modelConfig);else{const base=loadModelConfig(input.models,target.platform);if(preset==='custom'){assertCatalogRoles({platform:target.platform,roles:customRoles,catalog:verifiedCatalog});config=applyCustomRoles(base,customRoles);}else {if(customRoles!==undefined)assertCatalogRoles({platform:target.platform,roles:customRoles,catalog:verifiedCatalog});config=applyPreset(customRoles!==undefined?applyCustomRoles(base,customRoles):preservedCustomRoles!==undefined?applyCustomRoles(base,preservedCustomRoles):base,preset);}}if(config.platform!==target.platform)fail('Model config platform does not match target');const profiles=renderProfiles(input.profiles,resolveModelSettings(config));for(const[name,bytes]of profiles)profiles.set(name,renderLanguagePolicy(bytes,language));const modelBytes=Buffer.from(serializeModelConfig(config));
 return{profiles,modelBytes};
}
function renderSkillPayload({payload,target,language,modelBytes,limits}){
 const skill=new Map();for(const[name,bytes]of payload.files)if(name.startsWith(target.payloadPrefix+'/skill/'))skill.set(name.slice((target.payloadPrefix+'/skill/').length),Buffer.from(bytes));skill.set('SKILL.md',renderLanguagePolicy(skill.get('SKILL.md'),language));skill.set('settings.toml',serializeLanguage(language));skill.set('models.toml',modelBytes);skill.set('limits.toml',serializeLimits(limits));
 return skill;
}
function renderNativeChanges({target,safeFs,snapshot,skipGlobal,preview,concurrentExplicit,limits,summary,language}){
 const home=target.home;
 const globalChanges=[];
 if(limits.max_concurrent_subagents>limits.max_total_subagents)summary.push(`Effective concurrency is at most ${limits.max_total_subagents} for a fresh ARC session; it may be lower after cumulative use or due to native capacity.`);
 if(skipGlobal)summary.push('Native concurrency update skipped (--skip-global).');
 else for(const filename of target.globalPaths){
  const current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot}),original=current.bytes??null;
  let rendered;
  if(filename===target.instructionPath)rendered=renderManagedBlock(original,agentsBlockBody(home,target.userHome,language,target.platform));
  else{
   let previous;try{previous=readRuntimeConcurrency(target.platform,original);}catch(cause){fail(`Invalid native configuration: ${cause.message}`);}
   if(preview.existing&&previous!==null&&previous!==preview.existing.max_concurrent_subagents&&!concurrentExplicit)fail(`Native concurrency drift at ${filename}; explicitly select --max-concurrent-subagents to update it`);
   let base=original;if(target.platform==='codex'){const wait=renderWaitSettings(original);base=wait.content??original;if(wait.content===null)summary.push(`${filename}: ${wait.action}`);}
   try{rendered=target.platform==='codex'?renderCodexConcurrency(base,limits.max_concurrent_subagents):renderClaudeConcurrency(base,limits.max_concurrent_subagents);}catch(cause){fail(`Cannot merge native concurrency: ${cause.message}`);}
   summary.push(`${filename}: native concurrency ${previous??'missing'} -> ${limits.max_concurrent_subagents}`);
  }
  if(rendered.content!==null&&(original===null||!rendered.content.equals(original)))globalChanges.push({path:filename,original,content:rendered.content,action:rendered.action});
  for(const note of rendered.notes??[])summary.push(`${filename}: ${note}`);
 }
 return globalChanges;
}
export function buildInstallPlan({payload,target,preset,skipGlobal=false,safeFs,limits,concurrentExplicit=false,limitsPreview,language='en',languagePreview,modelConfig,customRoles,preservedCustomRoles,verifiedCatalog,nativeCli,nodePath=process.execPath,updateNativeHook=false}){
 validateLanguage(language);
 if(languagePreview)assertPlanSnapshot({snapshot:languagePreview.snapshot},{safeFs});
 const languageState=languagePreview??previewLanguage({target,safeFs});
 if(limitsPreview)assertPlanSnapshot({snapshot:limitsPreview.snapshot},{safeFs});
 const preview=limitsPreview??previewLimits({target,safeFs});
 limits=resolveLimits({existing:preview.existing,overrides:limits??{}});
 const {profiles,modelBytes}=renderModelAssets({payload,target,preset,modelConfig,language,customRoles,preservedCustomRoles,verifiedCatalog});
 const skill=renderSkillPayload({payload,target,language,modelBytes,limits});
 const snapshot=new Map(),home=target.home;const skills=path.join(home,'skills'),agents=path.join(home,'agents'),arc=path.join(skills,'arc');
 for(const name of [home,skills,agents])inspectPath(safeFs,name,{kind:'directory',snapshot});
 inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
 const profilePaths=target.profileNames.map(name=>path.join(agents,name));for(const name of profilePaths)inspectPath(safeFs,name,{kind:'file',snapshot});
 const externalPaths=[],summary=['Verified packaged Superpowers references will be installed inside ARC'];
 summary.push(`ARC limits: total ${limits.max_total_subagents}; concurrent ${limits.max_concurrent_subagents} (policy: ${arc}/limits.toml)`);
 const globalChanges=renderNativeChanges({target,safeFs,snapshot,skipGlobal,preview,concurrentExplicit,limits,summary,language});
 let nativeHooks;
 if(target.platform==='codex'&&skipGlobal&&!updateNativeHook){
  const ownerPath=path.join(arc,'native-hooks.json'),owner=inspectPath(safeFs,ownerPath,{kind:'file',read:true,snapshot});
  if(!owner.exists)snapshot.delete(ownerPath);
  if(owner.exists){
   let record;try{record=JSON.parse(owner.bytes);}catch{fail('Invalid native hook ownership record');}
   const runtime=skill.get('runtime/native-hook.mjs');
   if(record.platform!=='codex'||record.mode!=='diagnostic'||record.entryPoint!==path.join(arc,'runtime/native-hook.mjs')||!runtime||createHash('sha256').update(runtime).digest('hex')!==record.runtimeHash)fail('Cannot preserve native hook during skip-global');
   skill.set('native-hooks.json',owner.bytes);
  }
 }
 if(target.platform==='codex'&&(!skipGlobal||updateNativeHook)&&nativeCli?.status==='unknown'){
  const owner=inspectPath(safeFs,path.join(arc,'native-hooks.json'),{kind:'file',read:true,snapshot});
  if(owner.exists)fail('Cannot update owned native hook with unknown Codex CLI');
  nativeHooks={status:'unsupported'};summary.push('Codex diagnostic hook unsupported: CLI version unavailable');
 }
 if(target.platform==='codex'&&(!skipGlobal||updateNativeHook)&&nativeCli?.status==='detected'){
  const settingsPath=path.join(home,'config.toml'),entryPoint=path.join(arc,'runtime/native-hook.mjs'),runtime=skill.get('runtime/native-hook.mjs');
  if(!runtime)fail('Native diagnostic entrypoint is missing');
  const owner=inspectPath(safeFs,path.join(arc,'native-hooks.json'),{kind:'file',read:true,snapshot});
  let previousRecord;try{if(owner.exists)previousRecord=JSON.parse(owner.bytes);}catch{fail('Invalid native hook ownership record');}
  if(previousRecord){const oldEntry=previousRecord.entryPoint,relative=typeof oldEntry==='string'?path.relative(arc,oldEntry):'..';if(!path.isAbsolute(oldEntry??'')||!relative||relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))fail('Invalid native hook entrypoint');const installed=inspectPath(safeFs,oldEntry,{kind:'file',read:true,snapshot});if(!installed.exists||createHash('sha256').update(installed.bytes).digest('hex')!==previousRecord.runtimeHash)fail('Native hook runtime drift');}
  const current=inspectPath(safeFs,settingsPath,{kind:'file',read:true,snapshot});
  const existing=globalChanges.find(change=>change.path===settingsPath),base=existing?.content??current.bytes??null;
  const definitions=buildNativeHookDefinitions({platform:'codex',entryPoint,nodePath,cli:nativeCli,settingsPath});
  const rendered=renderNativeHooks({platform:'codex',original:base,definitions,previousRecord});
  if(rendered.conflicts.length)fail('Native hook conflict: '+rendered.conflicts.join(', '));
  if(previousRecord&&previousRecord.entryPoint!==entryPoint&&findNativeReferences({platform:'codex',original:rendered.content,files:[previousRecord.entryPoint]}).length)fail('Native hook conflict: previous entrypoint remains referenced');
  const record={...rendered.record,runtimeHash:createHash('sha256').update(runtime).digest('hex')};
  skill.set('native-hooks.json',Buffer.from(JSON.stringify(record,null,2)+'\n'));
  if(existing)existing.content=rendered.content;else if(!current.bytes||!rendered.content.equals(current.bytes))globalChanges.push({path:settingsPath,original:current.bytes??null,content:rendered.content,action:rendered.action});
  nativeHooks={definitions,record,settingsPath,entryPoint,expectedSettings:rendered.content};
 }
 const managedPaths=[arc,...profilePaths,...(skipGlobal?[]:target.globalPaths)];
 if(updateNativeHook&&nativeHooks?.record&&!managedPaths.includes(nativeHooks.settingsPath))managedPaths.push(nativeHooks.settingsPath);
 for(const [filename,metadata]of preview.snapshot)snapshot.set(filename,metadata);
 for(const [filename,metadata]of languageState.snapshot)snapshot.set(filename,metadata);
 summary.push(`ARC output language: ${language}`);
 const plan={target,language,preset,skipGlobal,limits,concurrentExplicit,generated:{models:modelBytes,profiles,skill},globalChanges,managedPaths,externalPaths,snapshot,summary,nativeHooks};validatePlanSet([plan]);return plan;
}
function overlaps(a,b){return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
export function validatePlanSet(plans){
 const paths=[];for(let i=0;i<plans.length;i++){const plan=plans[i];if(!plan.target?.home||!path.isAbsolute(plan.target.home)||plan.target.home==='/')fail('Unsafe install home');for(let j=0;j<i;j++)if(overlaps(plan.target.home,plans[j].target.home))fail('Selected platform homes overlap');
 for(const value of [...plan.managedPaths,...plan.externalPaths]){if(typeof value!=='string'||!path.isAbsolute(value)||value==='/'||path.normalize(value)!==value)fail('Unsafe planned write path');for(const previous of paths)if(overlaps(value,previous.path))fail(`Install write paths collide: ${value}`);paths.push({path:value,plan:i});}}
}
