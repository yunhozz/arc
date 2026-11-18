import {inspectStandaloneProfile} from './install-mode.mjs';
import {installerRegistryOf} from '../platforms/index.mjs';
import {renderAgentProfile} from '../prompts/render.mjs';
import {PayloadValidationError} from './manifest.mjs';
import {composeSkillSources} from './skill-sources.mjs';
import{parseLanguage,serializeLanguage,renderLanguagePolicy,validateLanguage}from'./language.mjs';
import{resolveLimits}from'../limits.mjs';import{parseLimits,serializeLimits}from'./limits.mjs';import{assertPlanSnapshot}from'./transaction.mjs';
import{validateModelConfig}from'../models/config.mjs';
import{assertCatalogRoles}from'../models/catalog.mjs';
import path from'node:path';import{loadModelConfig,withRoles,serializeModelConfig,renderProfiles,resolveModelSettings}from'../models/index.mjs';import{inspectPath,TargetConfigurationError}from'./targets.mjs';import{renderManagedBlock,agentsBlockBody}from'./global-config.mjs';
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
function renderModelAssets({payload,target,roles,modelConfig,language,verifiedCatalog,platforms,runtimePlatforms}){
 const input=payload.modelInputs[target.platform];if(!input)fail('Selected payload platform is unavailable');
 const base=modelConfig!==undefined?validateModelConfig(modelConfig,{runtimePlatforms}):loadModelConfig(input.models,target.platform,{runtimePlatforms});
 if(roles!==undefined)assertCatalogRoles({platform:target.platform,roles,catalog:verifiedCatalog,runtimePlatforms});
 const config=roles!==undefined?withRoles(base,roles,{runtimePlatforms}):base;
 if(config.platform!==target.platform)fail('Model config platform does not match target');const settings=resolveModelSettings(config,{runtimePlatforms}),profileOptions={runtimePlatforms,renderProfile:installerRegistryOf({platforms}).getPlatform(target.platform).profiles.render},profiles=renderProfiles(input.profiles,settings,profileOptions);try{for(const[name,bytes]of profiles){const expanded=renderAgentProfile(`${target.payloadPrefix??target.platform}/agents/${name}`,bytes,payload.agentRegistry,{platforms});const final=renderLanguagePolicy(expanded,language);if(final.toString('utf8').includes('ARC_AGENT_FRAGMENT'))throw Error('Unresolved fragment marker');profiles.set(name,final);}const checked=renderProfiles(profiles,settings,profileOptions);if(checked.size!==profiles.size||[...profiles].some(([name,bytes],i)=>{const entry=[...checked][i];return !entry||entry[0]!==name||!entry[1].equals(bytes);}))throw Error('Final profile model settings changed');}catch(cause){throw new PayloadValidationError(`Payload profile rendering failed: ${cause.message}`,{cause});}const modelBytes=Buffer.from(serializeModelConfig(config,{runtimePlatforms}));
 return{profiles,modelBytes};
}
export function renderStandaloneProfiles({payload,target,modelConfig,language,platforms,runtimePlatforms}){return renderModelAssets({payload,target,modelConfig,language,platforms,runtimePlatforms}).profiles;}
function renderSkillPayload({payload,target,language,modelBytes,limits,platforms}){
 let skill;try{skill=composeSkillSources(payload.files,target.platform,{platforms});}catch(cause){throw new PayloadValidationError(`Payload skill composition failed: ${cause.message}`,{cause});}
 skill.set('SKILL.md',renderLanguagePolicy(skill.get('SKILL.md'),language));skill.set('settings.toml',serializeLanguage(language));skill.set('models.toml',modelBytes);skill.set('limits.toml',serializeLimits(limits));
 return skill;
}
function renderNativeChanges({target,safeFs,snapshot,skipGlobal,preview,concurrentExplicit,limits,summary,language,platforms}){
 const home=target.home;
 const globalChanges=[];
 if(limits.max_concurrent_subagents>limits.max_total_subagents)summary.push(`Effective concurrency is at most ${limits.max_total_subagents} for a fresh ARC session; it may be lower after cumulative use or due to native capacity.`);
 const runtimeConfig=installerRegistryOf({platforms}).getPlatform(target.platform).runtimeConfig;
 if(skipGlobal){summary.push('Native concurrency update skipped (--skip-global).');if(typeof runtimeConfig.globalRender==='function')summary.push(`${target.runtimeConfigPath}: compatibility settings update skipped (--skip-global).`);}
 else for(const filename of target.globalPaths){
  if(filename!==target.instructionPath&&!runtimeConfig.renderConcurrency&&typeof runtimeConfig.globalRender!=='function')continue;
  const current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot}),original=current.bytes??null;
  let rendered;
  if(filename===target.instructionPath)rendered=renderManagedBlock(original,agentsBlockBody(home,target.userHome,language,target.platform));
  else{
   if(typeof runtimeConfig.globalRender==='function'){
    try{rendered=runtimeConfig.globalRender(original);}catch(cause){fail(`Cannot update ${filename}: ${cause.message}; fix it or use --skip-global`);}
   }else{
   let previous;try{previous=runtimeConfig.readConcurrency(original);}catch(cause){fail(`Invalid native configuration: ${cause.message}`);}
   if(preview.existing&&previous!==null&&previous!==preview.existing.max_concurrent_subagents&&!concurrentExplicit)fail(`Native concurrency drift at ${filename}; explicitly select --max-concurrent-subagents to update it`);
   let base=original;if(runtimeConfig.extraRender){const extra=runtimeConfig.extraRender(original);base=extra.content??original;if(extra.content===null)summary.push(`${filename}: ${extra.action}`);}
   try{rendered=runtimeConfig.renderConcurrency(base,limits.max_concurrent_subagents);}catch(cause){fail(`Cannot merge native concurrency: ${cause.message}`);}
   summary.push(`${filename}: native concurrency ${previous??'missing'} -> ${limits.max_concurrent_subagents}`);
   }
  }
  if(rendered.content!==null&&(original===null||!rendered.content.equals(original)))globalChanges.push({path:filename,original,content:rendered.content,action:rendered.action});
  for(const note of rendered.notes??[])summary.push(`${filename}: ${note}`);
 }
 return globalChanges;
}
export function buildInstallPlan({payload,target,roles,profiles:profileMode='write',skipGlobal=false,safeFs,limits,concurrentExplicit=false,limitsPreview,language='en',languagePreview,modelConfig,verifiedCatalog,platforms,runtimePlatforms}){
 validateLanguage(language);
 if(languagePreview)assertPlanSnapshot({snapshot:languagePreview.snapshot},{safeFs});
 const languageState=languagePreview??previewLanguage({target,safeFs});
 if(limitsPreview)assertPlanSnapshot({snapshot:limitsPreview.snapshot},{safeFs});
 const preview=limitsPreview??previewLimits({target,safeFs});
 limits=resolveLimits({existing:preview.existing,overrides:limits??{}});
 const modelSnapshot=new Map();
 if(modelConfig===undefined&&roles===undefined){const installed=inspectPath(safeFs,path.join(target.home,'skills/arc/models.toml'),{kind:'file',read:true,snapshot:modelSnapshot});if(installed.exists)modelConfig=loadModelConfig(installed.bytes,target.platform,{runtimePlatforms});}
 const {profiles,modelBytes}=renderModelAssets({payload,target,roles,modelConfig,language,verifiedCatalog,platforms,runtimePlatforms});
 const skill=renderSkillPayload({payload,target,language,modelBytes,limits,platforms});
 const snapshot=new Map(),home=target.home;const skills=path.join(home,'skills'),agents=path.join(home,'agents'),arc=path.join(skills,'arc');
 for(const name of [home,skills,agents])inspectPath(safeFs,name,{kind:'directory',snapshot});
 inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
 const profilePaths=[],profileWrites=new Map(),residualPaths=[];
 if(profileMode!=='omit')for(const [name,bytes]of profiles){const found=inspectStandaloneProfile({safeFs,target,role:name.split('.')[0].replace('-','_'),snapshot,platforms});if(found.exists&&!found.owned){residualPaths.push(found.path);continue;}profilePaths.push(found.path);profileWrites.set(name,bytes);}
 const externalPaths=[],summary=['Verified packaged Superpowers references will be installed inside ARC'];
 summary.push(`ARC limits: total ${limits.max_total_subagents}; concurrent ${limits.max_concurrent_subagents} (policy: ${arc}/limits.toml)`);
 const globalChanges=renderNativeChanges({target,safeFs,snapshot,skipGlobal,preview,concurrentExplicit,limits,summary,language,platforms});
 const managedPaths=[arc,...profilePaths,...globalChanges.map(change=>change.path)];
 for(const [filename,metadata]of preview.snapshot)snapshot.set(filename,metadata);
 for(const [filename,metadata]of languageState.snapshot)snapshot.set(filename,metadata);
 summary.push(`ARC output language: ${language}`);
 for(const item of modelSnapshot)snapshot.set(...item);
 const plan={target,language,roles,skipGlobal,limits,concurrentExplicit,profileWrites,residualPaths,generated:{models:modelBytes,profiles,skill},globalChanges,managedPaths,externalPaths,snapshot,summary};validatePlanSet([plan]);return plan;
}
function overlaps(a,b){return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
export function validatePlanSet(plans){
 const paths=[];for(let i=0;i<plans.length;i++){const plan=plans[i];if(!plan.target?.home||!path.isAbsolute(plan.target.home)||plan.target.home==='/')fail('Unsafe install home');for(let j=0;j<i;j++)if(overlaps(plan.target.home,plans[j].target.home))fail('Selected platform homes overlap');
 for(const value of [...plan.managedPaths,...plan.externalPaths]){if(typeof value!=='string'||!path.isAbsolute(value)||value==='/'||path.normalize(value)!==value)fail('Unsafe planned write path');for(const previous of paths)if(overlaps(value,previous.path))fail(`Install write paths collide: ${value}`);paths.push({path:value,plan:i});}}
}
