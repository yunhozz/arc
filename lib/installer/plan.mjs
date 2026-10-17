import path from'node:path';import{loadModelConfig,applyPreset,serializeModelConfig,renderProfiles,resolveModelSettings}from'../models/index.mjs';import{inspectPath,TargetConfigurationError}from'./targets.mjs';import{renderManagedBlock,renderWaitSettings,agentsBlockBody}from'./global-config.mjs';
function fail(message){throw new TargetConfigurationError(message);}
export function buildInstallPlan({payload,target,preset,skipGlobal=false,safeFs}){
 const input=payload.modelInputs[target.platform];if(!input)fail('Selected payload platform is unavailable');
 const config=applyPreset(loadModelConfig(input.models,target.platform),preset),profiles=renderProfiles(input.profiles,resolveModelSettings(config));const modelBytes=Buffer.from(serializeModelConfig(config));
 const skill=new Map();for(const[name,bytes]of payload.files)if(name.startsWith(target.payloadPrefix+'/skill/'))skill.set(name.slice((target.payloadPrefix+'/skill/').length),Buffer.from(bytes));skill.set('models.toml',modelBytes);
 const snapshot=new Map(),home=target.home;const skills=path.join(home,'skills'),agents=path.join(home,'agents'),arc=path.join(skills,'arc');
 for(const name of [home,skills,agents])inspectPath(safeFs,name,{kind:'directory',snapshot});
 inspectPath(safeFs,arc,{kind:'directory',tree:true,allowLinks:true,snapshot});
 const profilePaths=target.profileNames.map(name=>path.join(agents,name));for(const name of profilePaths)inspectPath(safeFs,name,{kind:'file',snapshot});
 const externalPaths=[],summary=['Fresh superpowers references will be acquired inside ARC'];
 const globalChanges=[];if(!skipGlobal){for(let i=0;i<target.globalPaths.length;i++){const filename=target.globalPaths[i],current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot}),original=current.bytes??null;const rendered=i===0?renderManagedBlock(original,agentsBlockBody(home,target.userHome)):renderWaitSettings(original);if(rendered.content!==null&&(original===null||!rendered.content.equals(original)))globalChanges.push({path:filename,original,content:rendered.content,action:rendered.action});for(const note of rendered.notes??[])summary.push(`${filename}: ${note}`);if(rendered.content===null)summary.push(`${filename}: ${rendered.action}`);}}
 const managedPaths=[arc,...profilePaths,...(skipGlobal?[]:target.globalPaths)];
 const plan={target,preset,skipGlobal,generated:{models:modelBytes,profiles,skill},globalChanges,managedPaths,externalPaths,snapshot,summary};validatePlanSet([plan]);return plan;
}
function overlaps(a,b){return a===b||a.startsWith(b+'/')||b.startsWith(a+'/');}
export function validatePlanSet(plans){
 const paths=[];for(let i=0;i<plans.length;i++){const plan=plans[i];if(!plan.target?.home||!path.isAbsolute(plan.target.home)||plan.target.home==='/')fail('Unsafe install home');for(let j=0;j<i;j++)if(overlaps(plan.target.home,plans[j].target.home))fail('Selected platform homes overlap');
 for(const value of [...plan.managedPaths,...plan.externalPaths]){if(typeof value!=='string'||!path.isAbsolute(value)||value==='/'||path.normalize(value)!==value)fail('Unsafe planned write path');for(const previous of paths)if(overlaps(value,previous.path))fail(`Install write paths collide: ${value}`);paths.push({path:value,plan:i});}}
}
