import fs from 'node:fs';
import path from 'node:path';
import {runNpm as defaultRunNpm} from './process.mjs';
const unsupported=reason=>({kind:'unsupported',reason});
function realDirectory(value){if(typeof value!=='string'||!path.isAbsolute(value))throw Error('Expected an absolute directory');const real=fs.realpathSync(value);if(!fs.statSync(real).isDirectory())throw Error('Expected a directory');return real;}
function npmExecutable(env){
 const candidates=env.npm_execpath?[env.npm_execpath]:(env.PATH??'').split(path.delimiter).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,'npm'));
 for(const candidate of candidates)try{if(!path.isAbsolute(candidate))continue;const cli=fs.realpathSync(candidate),root=path.dirname(path.dirname(cli));if(path.basename(cli)==='npm-cli.js'&&path.basename(path.dirname(cli))==='bin'&&JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name==='npm'&&fs.statSync(cli).isFile())return cli;}catch{}
 throw Error('Cannot verify npm CLI');
}
export function resolveInvocationCwd({env={},cwd,lifecycle=false}){
 if(lifecycle){
  if(env.INIT_CWD!==undefined)return realDirectory(env.INIT_CWD);
  if(env.CODEX_HOME!==undefined&&!path.isAbsolute(env.CODEX_HOME)&&env.CODEX_HOME!=='~'&&!env.CODEX_HOME.startsWith('~/'))throw Error('Original invocation directory (INIT_CWD) is required for relative CODEX_HOME');
 }
 return realDirectory(cwd);
}
export async function inspectNpmContext({packageRoot,entryPath,env=process.env,cwd=process.cwd(),execPath=process.execPath,runNpm=defaultRunNpm}){
 try{
  if(fs.realpathSync(execPath)!==fs.realpathSync(process.execPath))return unsupported('Node executable does not match this runtime');
  const root=realDirectory(packageRoot),entry=fs.realpathSync(entryPath);
  if(!entry.startsWith(root+path.sep)||!fs.statSync(entry).isFile()||JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name!=='@yunhozz/arc')return unsupported('ARC entry is outside the package');
  const npmCli=npmExecutable(env);
  async function query(args){const result=await runNpm(npmCli,args,{cwd,env});if(result.code!==0||result.signal)throw Error('npm context query failed');const value=result.stdout.trim();if(!path.isAbsolute(value)||value.includes('\n'))throw Error('npm returned an invalid context path');try{return fs.realpathSync(value);}catch(error){if(error.code!=='ENOENT')throw error;return path.resolve(value);}}
  const prefix=await query(['prefix','--global']),npmRoot=await query(['root','--global']);
  if([path.join(prefix,'lib/node_modules'),path.join(prefix,'node_modules')].includes(npmRoot)&&root===path.join(npmRoot,'@yunhozz/arc'))return{kind:'global',packageRoot:root,entryPath:entry,prefix,npmCli};
  if(env.npm_command==='exec'){
   const cache=realDirectory(await query(['config','get','cache'])),relative=path.relative(path.join(cache,'_npx'),root),parts=relative.split(path.sep);
   if(parts.length===4&&parts[0]&&parts[0]!=='.'&&parts[0]!=='..'&&parts.slice(1).join('/')==='node_modules/@yunhozz/arc'){
    const bin=path.join(cache,'_npx',parts[0],'node_modules/.bin'),paths=(env.PATH??'').split(path.delimiter);
    if(paths.some(value=>{try{return realDirectory(value)===realDirectory(bin);}catch{return false;}})&&realDirectory(env.INIT_CWD))return{kind:'npx',packageRoot:root,entryPath:entry,npmCli};
   }
  }
  return unsupported('ARC is not in a verified global or npm exec installation');
 }catch{return unsupported('Cannot verify npm installation context');}
}
