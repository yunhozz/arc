import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
const usage='Usage: arc-install --target <claude|codex|all> --preset <economy|balanced|smart>\n  [--check | --dry-run] [--skip-global] [--help] [--version]';
function inputError(message){return Object.assign(new Error(message),{code:'ARC_CLI_INPUT'});}
function cancelled(){return Object.assign(new Error('Installation cancelled.'),{code:'ARC_CANCELLED'});}
export function parseArgs(args){
 const options={},seen=new Set();const names={'--target':'target','--preset':'preset','--skip-global':'skipGlobal','--check':'check','--dry-run':'dryRun','--help':'help','--version':'version'};
 for(let i=0;i<args.length;i++){const flag=args[i],key=Object.hasOwn(names,flag)?names[flag]:undefined;if(!key)throw inputError(`Unknown argument: ${flag}`);if(seen.has(flag))throw inputError(`Duplicate argument: ${flag}`);seen.add(flag);if(key==='target'||key==='preset'){const value=args[++i],allowed=key==='target'?['claude','codex','all']:['economy','balanced','smart'];if(!allowed.includes(value))throw inputError(`Invalid ${key}: ${value??'missing value'}`);options[key]=value;}else options[key]=true;}
 if(options.check&&options.dryRun)throw inputError('--check and --dry-run cannot be combined');return options;
}
export async function selectChoices(options,{input=process.stdin,output=process.stdout}={}){
 if(options.target&&options.preset)return options;
 if(!input.isTTY||!output.isTTY)throw inputError('Non-interactive execution requires --target and --preset');
 const rl=readline.createInterface({input,crlfDelay:Infinity,terminal:false}),lines=rl[Symbol.asyncIterator]();let interrupted=false;
 const abort=()=>{interrupted=true;rl.close();};process.once('SIGINT',abort);
 try{for(const [key,labels,values]of [['target',['Claude','Codex','All'],['claude','codex','all']],['preset',['Economy','Balanced (default)','Smart'],['economy','balanced','smart']]]){if(options[key])continue;while(true){output.write(`Select ${key==='target'?'an installation target':'a performance preset'}:\n${labels.map((label,i)=>`${i+1}. ${label}`).join('\n')}\nEnter a choice [1-3]${key==='preset'?' (default: 2)':''}: `);const next=await lines.next();if(next.done||interrupted)throw cancelled();const answer=next.value.trim(),index=key==='preset'&&answer===''?1:['1','2','3'].indexOf(answer);if(index>=0){options[key]=values[index];break;}output.write('Invalid choice. Enter 1, 2, or 3.\n');}}return options;}finally{rl.close();process.removeListener('SIGINT',abort);}
}
export async function runCli(args=process.argv.slice(2),{input=process.stdin,output=process.stdout,error=process.stderr}={}){
 let controller,onInterrupt;
 try{
  const options=parseArgs(args);if(options.help){output.write(usage+'\n');return 0;}if(options.version){output.write(JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'))).version+'\n');return 0;}
  const {loadNative}=await import('../safe-fs/native.mjs');const native=loadNative();
  await selectChoices(options,{input,output});
  const [{openRoot},{verifyPayload},{resolveTarget},{buildInstallPlan,validatePlanSet}]=await Promise.all([import('../safe-fs/index.mjs'),import('../installer/manifest.mjs'),import('../installer/targets.mjs'),import('../installer/plan.mjs')]);
  const safeFs={openRoot:p=>openRoot(p,{native})},payload=verifyPayload({packageRoot,safeFs});
  const platforms=options.target==='all'?['codex','claude']:[options.target];const plans=platforms.map(platform=>buildInstallPlan({payload,target:resolveTarget(platform,{userHome:os.homedir(),env:process.env}),preset:options.preset,skipGlobal:options.skipGlobal,safeFs}));validatePlanSet(plans);
  output.write(`Target: ${options.target}; preset: ${options.preset}\n`);for(const plan of plans){output.write(`${plan.target.platform}: ${plan.target.home}\n`);for(const note of plan.summary)output.write(note+'\n');}
  if(options.check||options.dryRun){output.write(options.check?'Check completed. No changes made.\n':'Dry run completed. No changes made.\n');return 0;}
  controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);
  const [{installTargets},{acquireExternalSkills}]=await Promise.all([import('../installer/install.mjs'),import('../installer/acquisition.mjs')]);
  const result=await installTargets(plans,{safeFs,signal:controller.signal,acquisition:async()=>{const work=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-acquire-'));const acquired=await acquireExternalSkills({work,safeFs,signal:controller.signal});const dispose=acquired.dispose;return{...acquired,dispose:async()=>{await dispose();fs.rmdirSync(work);}};}});
  for(const item of result.results){output.write(`${item.platform}: ${item.status}; rollback: ${item.rollback}\n`);if(item.backupPath)output.write(`Backup: ${item.backupPath}\n`);for(const recovery of item.recoveryPaths)output.write(`Recovery: ${recovery}\n`);if(item.error)error.write(`Error: ${item.error.message}\n`);}
  if(result.interrupted)return 130;return result.results.every(item=>item.status==='installed'&&!item.error)?0:1;
 }catch(cause){error.write(`Error: ${cause.message}\n`);if(cause.code==='ARC_CLI_INPUT'){error.write(usage+'\n');return 2;}if(cause.code==='ARC_CANCELLED')return 130;return ['ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE','ARC_TARGET_CONFIGURATION'].includes(cause.code)?2:1;
 }finally{if(onInterrupt)process.removeListener('SIGINT',onInterrupt);}
}
