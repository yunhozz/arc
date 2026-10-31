import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const required=['--scratch-root','--cli','--home','--codex-home','--workspace'];
function directory(value){
 if(!path.isAbsolute(value))throw Error('Probe directories must be absolute');
 const resolved=path.resolve(value),real=fs.realpathSync(resolved),stat=fs.lstatSync(resolved);
 if(!stat.isDirectory()||stat.isSymbolicLink()||real!==resolved)throw Error('Probe directory must be a real directory');
 return real;
}
function inside(root,target){const relative=path.relative(root,target);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
try{
 const args=process.argv.slice(2);
 const values={};
 for(let index=0;index<args.length;index+=2){const name=args[index],value=args[index+1];if(!required.includes(name)||!value||value.startsWith('--')||Object.hasOwn(values,name))throw Error('Unknown, duplicate, or incomplete probe option');values[name]=value;}
 for(const name of required)if(!values[name])throw Error(`Explicit ${name} is required`);
 const scratch=directory(values['--scratch-root']);
 const scratchStat=fs.statSync(scratch);
 if(typeof process.getuid!=='function'||scratchStat.uid!==process.getuid()||(scratchStat.mode&0o077)!==0)throw Error('Scratch root must be private and owned by the current user');
 const systemTemp=fs.realpathSync('/tmp'),temp=fs.realpathSync(os.tmpdir()),tempStat=fs.statSync(temp),temps=[systemTemp],accountHome=fs.realpathSync(os.userInfo().homedir);
 if(temp!==systemTemp&&typeof process.getuid==='function'&&tempStat.isDirectory()&&tempStat.uid===process.getuid()&&(tempStat.mode&0o077)===0)temps.push(temp);
 if(!temps.some(temp=>inside(temp,scratch))||scratch===accountHome||inside(accountHome,scratch)||inside(scratch,accountHome))throw Error('A dedicated temporary scratch root is required');
 for(const name of ['--home','--codex-home','--workspace']){values[name]=directory(values[name]);if(!inside(scratch,values[name]))throw Error('Probe targets must be inside the scratch root');}
 if(!path.isAbsolute(values['--cli']))throw Error('An absolute Codex CLI path is required');
 const cli=fs.realpathSync(values['--cli']);
 if(!fs.statSync(cli).isFile())throw Error('Codex CLI must be a file');
 fs.accessSync(cli,fs.constants.X_OK);
 const version=spawnSync(cli,['--version'],{cwd:values['--workspace'],encoding:'utf8',timeout:5000,maxBuffer:8192,env:{PATH:path.dirname(process.execPath),HOME:values['--home'],CODEX_HOME:values['--codex-home']}});
 const match=/^codex-cli (\d+\.\d+\.\d+)\s*$/.exec(version.stdout??'');
 if(version.status!==0||!match)throw Error('Codex CLI version unavailable');
 console.log(JSON.stringify({status:'preflight-ready',hostEvidence:'unverified',cli:{path:values['--cli'],realpath:cli,version:match[1]},target:{scratchRoot:scratch,home:values['--home'],codexHome:values['--codex-home'],workspace:values['--workspace']},host:{registration:'unverified',entrypoint:'unverified',trust:'unverified',callback:'unverified'}}));
}catch(error){console.error(error.message);process.exitCode=1;}
