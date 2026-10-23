import {selectChoices} from './choices.mjs';
const usage='Usage: arc preset [economy|balanced|smart] --target <codex|claude|all> [--check | --dry-run] [--help]';
const inputError=message=>Object.assign(new Error(message),{code:'ARC_CLI_INPUT'});
export function parseArgs(args){
 const options={},seen=new Set();
 for(let i=0;i<args.length;i++){
  const arg=args[i];if(['economy','balanced','smart'].includes(arg)){if(options.preset)throw inputError('Duplicate preset');options.preset=arg;continue;}
  if(!['--target','--check','--dry-run','--help'].includes(arg))throw inputError(`Unknown argument: ${arg}`);if(seen.has(arg))throw inputError(`Duplicate argument: ${arg}`);seen.add(arg);
  if(arg==='--target'){const value=args[++i];if(!['codex','claude','all'].includes(value))throw inputError('Invalid target');options.target=value;}else options[arg==='--dry-run'?'dryRun':arg.slice(2)]=true;
 }
 if(options.check&&options.dryRun)throw inputError('--check and --dry-run cannot be combined');return options;
}
export async function runCli(args=process.argv.slice(2),{input=process.stdin,output=process.stdout,error=process.stderr}={}){
 let onInterrupt;
 try{
  const options=parseArgs(args);if(options.help){output.write(usage+'\n');return 0;}
  await selectChoices(options,{input,output});
  const{createManagementContext,prepareOperation,executeOperation}=await import('../management/operations.mjs');
  const context=await createManagementContext(),prepared=await prepareOperation(context,{...options,kind:'preset'}),plans=prepared.plans;
  if(options.check||options.dryRun){for(const plan of plans){output.write(`${plan.target.platform}: ${plan.specs.length} file(s) would change\n`);if(options.dryRun)for(const spec of plan.specs)output.write(`Would write: ${spec.path}\n`);}output.write('Check completed. No changes made.\n');return 0;}
  const controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);const result=await executeOperation({...context,signal:controller.signal},prepared);
  for(const item of result.results){output.write(`${item.platform}: ${item.status}; rollback: ${item.rollback}\n`);for(const name of item.residualPaths)output.write(`Residual path: ${name}\n`);if(item.error)error.write(`Error: ${item.error.message}\n`);}
  output.write('Open a new session to use the selected preset.\n');return result.interrupted?130:result.results.every(item=>['updated','unchanged'].includes(item.status)&&!item.error)?0:1;
 }catch(cause){error.write(`Error: ${cause.message}\n`);if(cause.code==='ARC_CLI_INPUT'){error.write(usage+'\n');return 2;}return cause.code==='ARC_CANCELLED'?130:['ARC_UNSUPPORTED_RUNTIME','ARC_NATIVE_UNAVAILABLE','ARC_TARGET_CONFIGURATION'].includes(cause.code)?2:1;}finally{if(onInterrupt)process.removeListener('SIGINT',onInterrupt);}
}
