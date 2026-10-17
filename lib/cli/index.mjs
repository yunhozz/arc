import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
import{parsePositiveLimit}from'../limits.mjs';
const usage='Usage: arc install --target <claude|codex|all> --preset <economy|balanced|smart>\n  [--max-total-subagents <count>] [--max-concurrent-subagents <count>]\n  [--check | --dry-run] [--skip-global] [--help] [--version]\n  --max-total-subagents: positive integer (default: 100)\n  --max-concurrent-subagents: positive integer (default: 5)';
function inputError(message){return Object.assign(new Error(message),{code:'ARC_CLI_INPUT'});}
function cancelled(){return Object.assign(new Error('Installation cancelled.'),{code:'ARC_CANCELLED'});}
export function parseArgs(args){
 const options={},seen=new Set();const names={'--max-total-subagents':'maxTotalSubagents','--max-concurrent-subagents':'maxConcurrentSubagents','--target':'target','--preset':'preset','--skip-global':'skipGlobal','--check':'check','--dry-run':'dryRun','--help':'help','--version':'version'};
 for(let i=0;i<args.length;i++){const flag=args[i],key=Object.hasOwn(names,flag)?names[flag]:undefined;if(!key)throw inputError(`Unknown argument: ${flag}`);if(seen.has(flag))throw inputError(`Duplicate argument: ${flag}`);seen.add(flag);if(key==='maxTotalSubagents'||key==='maxConcurrentSubagents'){try{options[key]=parsePositiveLimit(args[++i],flag);}catch(cause){throw inputError(cause.message);}}else if(key==='target'||key==='preset'){const value=args[++i],allowed=key==='target'?['claude','codex','all']:['economy','balanced','smart'];if(!allowed.includes(value))throw inputError(`Invalid ${key}: ${value??'missing value'}`);options[key]=value;}else options[key]=true;}
 if(options.check&&options.dryRun)throw inputError('--check and --dry-run cannot be combined');return options;
}
export async function selectChoices(options,io){return(await import('./choices.mjs')).selectChoices(options,io);}
export async function runCli(args=process.argv.slice(2),{input=process.stdin,output=process.stdout,error=process.stderr}={}){
 let controller,onInterrupt,progress;
 try{
  const options=parseArgs(args);if(options.help){output.write(usage+'\n');return 0;}if(options.version){output.write(JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'))).version+'\n');return 0;}
  await selectChoices(options,{input,output});
  const {startProgress}=await import('./progress.mjs');
  progress=startProgress({output,label:options.check?'Checking ARC…':options.dryRun?'Preparing ARC dry run…':'Installing ARC…'});
  controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);
  const {loadNative}=await import('../safe-fs/native.mjs');const native=loadNative();
  const [{openRoot},{verifyPayload},{resolveTarget},{buildInstallPlan,validatePlanSet}]=await Promise.all([import('../safe-fs/index.mjs'),import('../installer/manifest.mjs'),import('../installer/targets.mjs'),import('../installer/plan.mjs')]);
  const safeFs={openRoot:p=>openRoot(p,{native})},payload=verifyPayload({packageRoot,safeFs});
  const platforms=options.target==='all'?['codex','claude']:[options.target];
  const {previewLimits}=await import('../installer/plan.mjs');const selections=platforms.map(platform=>{const target=resolveTarget(platform,{userHome:os.homedir(),env:process.env});return{target,preview:previewLimits({target,safeFs})};});
  if(input.isTTY&&output.isTTY){progress.stop();const{selectLimits}=await import('./choices.mjs');await selectLimits(options,selections,{input,output});progress=startProgress({output,label:options.check?'Checking ARC…':options.dryRun?'Preparing ARC dry run…':'Installing ARC…'});}
  const plans=selections.map(({target,preview})=>buildInstallPlan({payload,target,preset:options.preset,skipGlobal:options.skipGlobal,safeFs,limitsPreview:preview,limits:{...(options.maxTotalSubagents===undefined?{}:{max_total_subagents:options.maxTotalSubagents}),...(options.maxConcurrentSubagents===undefined?{}:{max_concurrent_subagents:options.maxConcurrentSubagents})},concurrentExplicit:options.maxConcurrentSubagents!==undefined||Boolean(options.concurrentSelected)}));const {attachShellCompletion}=await import('../installer/shell-completion.mjs');attachShellCompletion(plans,{safeFs});validatePlanSet(plans);
  progress.write(`Target: ${options.target}; preset: ${options.preset}\n`);for(const plan of plans){progress.write(`${plan.target.platform}: ${plan.target.home}\n`);for(const note of plan.summary)progress.write(note+'\n');}
  if(options.dryRun)for(const plan of plans){
   for(const name of plan.generated.skill.keys())progress.write(`Would write file: ${path.join(plan.target.home,'skills/arc',name)}\n`);
   for(const name of plan.generated.profiles.keys())progress.write(`Would write file: ${path.join(plan.target.home,'agents',name)}\n`);
   for(const change of plan.globalChanges)progress.write(`Would update global file: ${change.path}\n`);
  }
  if(options.check||options.dryRun){progress.stop();output.write(options.check?'Check completed. No changes made.\n':'Dry run completed. No changes made.\n');return 0;}
  const [{installTargets},{acquireExternalSkills}]=await Promise.all([import('../installer/install.mjs'),import('../installer/acquisition.mjs')]);
  const result=await installTargets(plans,{safeFs,signal:controller.signal,acquisition:async()=>{const work=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-acquire-'));const acquired=await acquireExternalSkills({work,safeFs,signal:controller.signal});const dispose=acquired.dispose;return{...acquired,dispose:async()=>{await dispose();fs.rmdirSync(work);}};}});
  progress.stop();
  for(const item of result.results){output.write(`${item.platform}: ${item.status}; rollback: ${item.rollback}\n`);for(const recovery of item.residualPaths)output.write(`Residual path: ${recovery}\n`);if(item.error)error.write(`Error: ${item.error.message}\n`);}
  if(result.interrupted)return 130;return result.results.every(item=>item.status==='installed'&&!item.error)?0:1;
 }catch(cause){progress?.stop();error.write(`Error: ${cause.message}\n`);if(cause.code==='ARC_CLI_INPUT'){error.write(usage+'\n');return 2;}if(cause.code==='ARC_CANCELLED')return 130;return ['ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE','ARC_TARGET_CONFIGURATION'].includes(cause.code)?2:1;
 }finally{progress?.stop();if(onInterrupt)process.removeListener('SIGINT',onInterrupt);}
}
