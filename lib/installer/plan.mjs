import {installClaudeHook} from '../policy/claude-hook.mjs';
import {validateGitPolicy} from '../../claude/skill/hooks/role-git-guard.mjs';
import{parseLanguage,serializeLanguage,renderLanguagePolicy,validateLanguage}from'./language.mjs';
import{resolveLimits}from'../limits.mjs';import{parseLimits,serializeLimits}from'./limits.mjs';import{readRuntimeConcurrency,renderCodexConcurrency,renderClaudeConcurrency}from'./runtime-config.mjs';import{assertPlanSnapshot}from'./transaction.mjs';
import{validateModelConfig}from'../models/config.mjs';
import path from'node:path';import{loadModelConfig,applyPreset,serializeModelConfig,renderProfiles,resolveModelSettings}from'../models/index.mjs';import{inspectPath,TargetConfigurationError}from'./targets.mjs';import{renderManagedBlock,renderWaitSettings,agentsBlockBody,renderRuntimeObserverHooks}from'./global-config.mjs';
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
function renderModelAssets({payload,target,preset,modelConfig,language}){
 const input=payload.modelInputs[target.platform];if(!input)fail('Selected payload platform is unavailable');
 const config=modelConfig===undefined?applyPreset(loadModelConfig(input.models,target.platform),preset):validateModelConfig(modelConfig);if(config.platform!==target.platform)fail('Model config platform does not match target');const profiles=renderProfiles(input.profiles,resolveModelSettings(config));for(const[name,bytes]of profiles)profiles.set(name,renderLanguagePolicy(bytes,language));const modelBytes=Buffer.from(serializeModelConfig(config));
 if(target.platform==='claude'){try{const script=payload.files.get('claude/skill/hooks/role-git-guard.mjs'),policy=payload.files.get('claude/skill/hooks/git-policy.json');if(!Buffer.isBuffer(script)||!script.length||!Buffer.isBuffer(policy))throw Error('Missing hook assets');validateGitPolicy(JSON.parse(policy.toString('utf8')));for(const[name,bytes]of profiles)profiles.set(name,installClaudeHook(bytes,path.join(target.home,'skills/arc')));}catch(cause){fail(`Invalid Claude Git guard: ${cause.message}`);}}
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
   try{rendered=renderRuntimeObserverHooks({platform:target.platform,original:rendered.content??base,skillPath:path.join(home,'skills/arc')});}catch(cause){fail(`Cannot merge Planner observation hooks: ${cause.message}`);}
   summary.push(`${filename}: native concurrency ${previous??'missing'} -> ${limits.max_concurrent_subagents}`);
  }
  if(rendered.content!==null&&(original===null||!rendered.content.equals(original)))globalChanges.push({path:filename,original,content:rendered.content,action:rendered.action});
  for(const note of rendered.notes??[])summary.push(`${filename}: ${note}`);
 }
 return globalChanges;
}
export function buildInstallPlan({payload,target,preset,skipGlobal=false,safeFs,limits,concurrentExplicit=false,limitsPreview,language='en',languagePreview,modelConfig}){
 validateLanguage(language);
 if(languagePreview)assertPlanSnapshot({snapshot:languagePreview.snapshot},{safeFs});
 const languageState=languagePreview??previewLanguage({target,safeFs});
 if(limitsPreview)assertPlanSnapshot({snapshot:limitsPreview.snapshot},{safeFs});
 const preview=limitsPreview??previewLimits({target,safeFs});
 limits=resolveLimits({existing:preview.existing,overrides:limits??{}});
 const {profiles,modelBytes}=renderModelAssets({payload,target,preset,modelConfig,language});
 const skill=renderSkillPayload({payload,target,language,modelBytes,limits});
 const snapshot=new Map(),home=target.home;const skills=path.join(home,'skills'),agents=path.join(home,'agents'),arc=path.join(skills,'arc');
 for(const name of [home,skills,agents])inspectPath(safeFs,name,{kind:'directory',snapshot});
 inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
 const profilePaths=target.profileNames.map(name=>path.join(agents,name));for(const name of profilePaths)inspectPath(safeFs,name,{kind:'file',snapshot});
 const externalPaths=[],summary=['Verified packaged Superpowers references will be installed inside ARC'];
 summary.push(`ARC limits: total ${limits.max_total_subagents}; concurrent ${limits.max_concurrent_subagents} (policy: ${arc}/limits.toml)`);
 const globalChanges=renderNativeChanges({target,safeFs,snapshot,skipGlobal,preview,concurrentExplicit,limits,summary,language});
 const managedPaths=[arc,...profilePaths,...(skipGlobal?[]:target.globalPaths)];
 for(const [filename,metadata]of preview.snapshot)snapshot.set(filename,metadata);
 for(const [filename,metadata]of languageState.snapshot)snapshot.set(filename,metadata);
 summary.push(`ARC output language: ${language}`);
 const plan={target,language,preset,skipGlobal,limits,concurrentExplicit,generated:{models:modelBytes,profiles,skill},globalChanges,managedPaths,externalPaths,snapshot,summary};validatePlanSet([plan]);return plan;
}
function overlaps(a,b){return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
export function validatePlanSet(plans){
 const paths=[];for(let i=0;i<plans.length;i++){const plan=plans[i];if(!plan.target?.home||!path.isAbsolute(plan.target.home)||plan.target.home==='/')fail('Unsafe install home');for(let j=0;j<i;j++)if(overlaps(plan.target.home,plans[j].target.home))fail('Selected platform homes overlap');
 for(const value of [...plan.managedPaths,...plan.externalPaths]){if(typeof value!=='string'||!path.isAbsolute(value)||value==='/'||path.normalize(value)!==value)fail('Unsafe planned write path');for(const previous of paths)if(overlaps(value,previous.path))fail(`Install write paths collide: ${value}`);paths.push({path:value,plan:i});}}
}
