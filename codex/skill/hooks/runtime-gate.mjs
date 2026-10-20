import {runCodexGate,renderCodexDecision} from '../runtime/adapters/codex.mjs';
/** Native installation must provide trusted context separately; stdin is only
 * the platform event. Missing provider denies and never trusts event assertions. */
export async function main(input,context){
 try{return await runCodexGate(JSON.parse(input),context);}catch{return renderCodexDecision({decision:'deny',reason:'Malformed runtime hook event'});}
}
if(import.meta.url===new URL(process.argv[1], 'file:').href){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 process.stdout.write(JSON.stringify(await main(input))+'\n');
}
