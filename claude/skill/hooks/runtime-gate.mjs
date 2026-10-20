import {runClaudeGate,renderClaudeDecision} from '../runtime/adapters/claude.mjs';
/** Native installation must provide trusted context separately; stdin is only
 * the platform event. Missing provider denies and never trusts event assertions. */
export async function main(input,context){
 try{return await runClaudeGate(JSON.parse(input),context);}catch{return renderClaudeDecision({decision:'deny',reason:'Malformed runtime hook event'});}
}
export async function runHook(){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 process.stdout.write(JSON.stringify(await main(input))+'\n');
}

if(process.argv[1]&&import.meta.url===new URL(process.argv[1], 'file:').href)await runHook();
