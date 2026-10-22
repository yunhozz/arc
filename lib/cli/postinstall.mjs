import path from 'node:path';
import {inspectNpmContext,resolveInvocationCwd} from '../npm/context.mjs';
import {openInstallerTerminal} from './terminal.mjs';
import {runCli} from './index.mjs';
export async function runPostinstall({packageRoot,env=process.env,cwd=process.cwd(),input=process.stdin,output=process.stdout,error=process.stderr,deps={}}){
 let terminal;
 try{
  if(env.npm_lifecycle_event!=='postinstall'){output.write('Run arc to install the ARC harness.\n');return 0;}
  const context=await(deps.inspectNpmContext??inspectNpmContext)({packageRoot,entryPath:path.join(packageRoot,'scripts/postinstall.mjs'),env,cwd});
  if(context.kind!=='global'){output.write('Run arc to install the ARC harness.\n');return 0;}
  terminal=(deps.openInstallerTerminal??openInstallerTerminal)({env,input,output,error});
  if(terminal.kind==='skip'){output.write('Run arc to install the ARC harness.\n');return 0;}
  const invocationCwd=resolveInvocationCwd({env,cwd,lifecycle:true});
  return await(deps.runCli??runCli)([],{...terminal.io,cwd:invocationCwd,env});
 }catch(cause){(terminal?.io.error??error).write(`Error: ${cause.message}\n`);return 1;}
 finally{terminal?.dispose?.();}
}
