const usage='Usage: arc upgrade [--help]';
export async function runCli(args=process.argv.slice(2),io={},deps={}){
 const output=io.output??process.stdout,error=io.error??process.stderr;let onInterrupt;
 try{
  if(args.length===1&&args[0]==='--help'){output.write(usage+'\nUpdates the global CLI and installed harness; npm exec updates the harness only.\n');return 0;}
  if(args.length){error.write('Error: Expected no arguments or --help\n'+usage+'\n');return 2;}
  const api=await import('../management/update.mjs'),controller=new AbortController();onInterrupt=()=>controller.abort();process.once('SIGINT',onInterrupt);process.once('SIGTERM',onInterrupt);
  const context={...deps,env:io.env??process.env,cwd:io.cwd??process.cwd(),signal:controller.signal};
  const result=await api.executeUpdate(context,await api.prepareUpdate(context));
  for(const message of result.messages??[])output.write(message);
  if(result.stdout)output.write(result.stdout);if(result.stderr)error.write(result.stderr);
  if(result.error)api.failure(result.error,error);
  else if(result.version)api.report(result,output,error);
  else if(result.code!==0)error.write('CLI was updated but the harness update did not complete. Retry arc upgrade or npx --yes @yunhozz/arc@latest upgrade.\n');
  if(result.error&&result.exitSession)error.write('CLI state may have changed. Retry arc upgrade; if it is unavailable, run npx --yes @yunhozz/arc@latest upgrade.\n');
  return result.code;
 }catch(cause){const{failure}=await import('../management/update.mjs');return failure(cause,error);}
 finally{if(onInterrupt){process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onInterrupt);}}
}
export async function runChild(...args){return(await import('../management/update.mjs')).runChild(...args);}
