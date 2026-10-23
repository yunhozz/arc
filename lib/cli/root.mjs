import fs from 'node:fs';
const usage='Usage: arc\n       arc --help\n       arc --version';
export async function runRoot(args=process.argv.slice(2),io={}){
 const input=io.input??process.stdin,output=io.output??process.stdout,error=io.error??process.stderr;
 if(args.length===1&&args[0]==='--help'){output.write(usage+'\n\nOpen ARC Management in an interactive terminal to install or manage the harness.\n');return 0;}
 if(args.length===1&&args[0]==='--version'){output.write(JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url))).version+'\n');return 0;}
 if(args.length){error.write('Error: Unsupported arguments. Open arc to manage the harness.\n'+usage+'\n');return 2;}
 if(!input.isTTY||!output.isTTY){error.write('Error: arc requires an interactive terminal. Run arc directly in a terminal.\n');return 2;}
 const {runTui}=await import('../tui/app.mjs');
 return runTui({...io,input,output,contextOptions:{...io.contextOptions,...(io.cwd?{cwd:io.cwd}:{}),...(io.env?{env:io.env}:{})}});
}
