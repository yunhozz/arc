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
 const menus=[['target',['Claude','Codex','All'],['claude','codex','all'],0],['preset',['Economy','Balanced','Smart'],['economy','balanced','smart'],1]].filter(([key])=>!options[key]);
 const wasRaw=input.isRaw,wasFlowing=input.readableFlowing,listeners=new Map(['data','newListener'].map(event=>[event,input.listeners(event)]));
 let menu=0,index=menus[0][3];
 const draw=(redraw=false)=>{const [key,labels]=menus[menu];if(redraw)output.write('\x1b[3A\r');else output.write(`Select ${key==='target'?'an installation target':'a performance preset'}:\n`);output.write(labels.map((label,i)=>`\x1b[2K${i===index?'>':' '} ${label}`).join('\n')+'\n\x1b[2KUse Up/Down and Enter.');};
 let onKey,onEnd,onError,abort;
 try{return await new Promise((resolve,reject)=>{
  abort=()=>reject(cancelled());onEnd=abort;onError=reject;
  onKey=(str,key={})=>{try{if(key.name==='c'&&key.ctrl||key.name==='d'&&key.ctrl)return abort();if(key.name==='up'||key.name==='down'){index=(index+(key.name==='up'?-1:1)+3)%3;draw(true);}else if(key.name==='return'||key.name==='enter'){const [name,,values]=menus[menu];options[name]=values[index];output.write('\n');if(++menu===menus.length){input.removeListener('keypress',onKey);resolve(options);}else{index=menus[menu][3];draw();}}}catch(error){reject(error);}};
  input.on('keypress',onKey);input.once('end',onEnd);input.once('error',onError);process.once('SIGINT',abort);
  readline.emitKeypressEvents(input);if(input.setRawMode)input.setRawMode(true);input.resume();draw();
 });}finally{
  input.removeListener('keypress',onKey);input.removeListener('end',onEnd);input.removeListener('error',onError);process.removeListener('SIGINT',abort);
  for(const [event,before]of listeners)for(const listener of input.listeners(event))if(!before.includes(listener))input.removeListener(event,listener);
  if(input.setRawMode)input.setRawMode(Boolean(wasRaw));if(wasFlowing!==true)input.pause();
 }
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
  if(options.dryRun)for(const plan of plans){
   for(const name of plan.generated.skill.keys())output.write(`Would write file: ${path.join(plan.target.home,'skills/arc',name)}\n`);
   for(const name of plan.generated.profiles.keys())output.write(`Would write file: ${path.join(plan.target.home,'agents',name)}\n`);
   for(const change of plan.globalChanges)output.write(`Would update global file: ${change.path}\n`);
  }
  if(options.check||options.dryRun){output.write(options.check?'Check completed. No changes made.\n':'Dry run completed. No changes made.\n');return 0;}
  controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);
  const [{installTargets},{acquireExternalSkills}]=await Promise.all([import('../installer/install.mjs'),import('../installer/acquisition.mjs')]);
  const result=await installTargets(plans,{safeFs,signal:controller.signal,acquisition:async()=>{const work=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'arc-acquire-'));const acquired=await acquireExternalSkills({work,safeFs,signal:controller.signal});const dispose=acquired.dispose;return{...acquired,dispose:async()=>{await dispose();fs.rmdirSync(work);}};}});
  for(const item of result.results){output.write(`${item.platform}: ${item.status}; rollback: ${item.rollback}\n`);if(item.backupPath)output.write(`Backup: ${item.backupPath}\n`);for(const recovery of item.recoveryPaths)output.write(`Recovery: ${recovery}\n`);if(item.error)error.write(`Error: ${item.error.message}\n`);}
  if(result.interrupted)return 130;return result.results.every(item=>item.status==='installed'&&!item.error)?0:1;
 }catch(cause){error.write(`Error: ${cause.message}\n`);if(cause.code==='ARC_CLI_INPUT'){error.write(usage+'\n');return 2;}if(cause.code==='ARC_CANCELLED')return 130;return ['ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE','ARC_TARGET_CONFIGURATION'].includes(cause.code)?2:1;
 }finally{if(onInterrupt)process.removeListener('SIGINT',onInterrupt);}
}
