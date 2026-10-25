import {runCodexGate,renderCodexDecision} from '../runtime/adapters/codex.mjs';
import {recordPlannerHookObservation} from '../runtime/cooperative.mjs';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
/** Native installation must provide trusted context separately; stdin is only
 * the platform event. Missing provider denies and never trusts event assertions. */
export async function main(input,context,{observationOnly=false}={}){
 if(observationOnly){try{const event=JSON.parse(input);await recordPlannerHookObservation({cwd:event.cwd,input:event,platform:'codex'});return {};}catch(error){return {systemMessage:'ARC Planner observation unavailable: '+error.message};}}
 try{return await runCodexGate(JSON.parse(input),context);}catch{return renderCodexDecision({decision:'deny',reason:'Malformed runtime hook event'});}
}
export async function runHook({observationOnly=false}={}){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 process.stdout.write(JSON.stringify(await main(input,undefined,{observationOnly}))+'\n');
}
let invoked=false;try{invoked=Boolean(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url));}catch{}
if(invoked)await runHook({observationOnly:process.argv.includes('--observe-only')});
