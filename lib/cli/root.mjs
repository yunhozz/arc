import fs from 'node:fs';
import {renderCompletion} from './completion.mjs';
const usage='Usage: arc [installation options]\n  arc preset [economy|balanced|smart] --target <codex|claude|all>\n  arc uninstall --target <codex|claude|all>\n  arc completion <zsh|bash>  (shell setup)\n  arc --help | --version';
const completionUsage='Usage: arc completion <zsh|bash>';
export async function runRoot(args=process.argv.slice(2),io={}){
 const output=io.output??process.stdout,error=io.error??process.stderr;
 const [command,...rest]=args;
 if(command==='--help'&&!rest.length){output.write(usage+'\n\n');return(await import('./index.mjs')).runCli(args,io);}
 if(command==='--version'&&!rest.length){output.write(JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url))).version+'\n');return 0;}
 if(command==='preset')return(await import('./preset.mjs')).runCli(rest,io);
 if(command==='install'){error.write('Error: The install subcommand was removed. Run npx --yes @yunhozz/arc [installation options].\n');return 2;}
 if(command===undefined||command.startsWith('--'))return(await import('./index.mjs')).runCli(args,io);
 if(command==='uninstall')return(await import('./uninstall.mjs')).runCli(rest,io);
 if(command==='completion'){
  if(rest.length===1&&rest[0]==='--help'){output.write(completionUsage+'\n');return 0;}
  if(rest.length===1&&['zsh','bash'].includes(rest[0])){output.write(renderCompletion(rest[0]));return 0;}
  error.write('Error: Expected a completion shell (zsh or bash).\n'+completionUsage+'\n');return 2;
 }
 error.write(`Error: Unknown command: ${command}\n${usage}\n`);return 2;
}
