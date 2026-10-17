import fs from 'node:fs';
import {renderCompletion} from './completion.mjs';
const usage='Usage: arc <install|uninstall|completion> [options]\n  arc install --help\n  arc uninstall --help\n  arc completion <zsh|bash>\n  arc --help | --version';
const completionUsage='Usage: arc completion <zsh|bash>';
export async function runRoot(args=process.argv.slice(2),io={}){
 const output=io.output??process.stdout,error=io.error??process.stderr;
 const [command,...rest]=args;
 if(command===undefined||(command==='--help'&&!rest.length)){output.write(usage+'\n');return 0;}
 if(command==='--version'&&!rest.length){output.write(JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url))).version+'\n');return 0;}
 if(command==='preset')return(await import('./preset.mjs')).runCli(rest,io);
 if(command==='install')return(await import('./index.mjs')).runCli(rest,io);
 if(command==='uninstall')return(await import('./uninstall.mjs')).runCli(rest,io);
 if(command==='completion'){
  if(rest.length===1&&rest[0]==='--help'){output.write(completionUsage+'\n');return 0;}
  if(rest.length===1&&['zsh','bash'].includes(rest[0])){output.write(renderCompletion(rest[0]));return 0;}
  error.write('Error: Expected a completion shell (zsh or bash).\n'+completionUsage+'\n');return 2;
 }
 error.write(`Error: Unknown command: ${command}\n${usage}\n`);return 2;
}
