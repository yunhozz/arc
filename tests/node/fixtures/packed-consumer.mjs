import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fs.realpathSync(fileURLToPath(new URL('../../../',import.meta.url)));
const npm=fs.realpathSync(spawnSync('/bin/sh',['-c','command -v npm'],{encoding:'utf8'}).stdout.trim());
function command(executable,args,options={}){const result=spawnSync(executable,args,{encoding:'utf8',timeout:120000,...options});assert.equal(result.status,0,result.stderr||result.stdout);return result;}
export function fixture(t,{live=false}={}){
 const base=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc packed consumer ')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const packed=JSON.parse(command(process.execPath,[npm,'pack','--json','--pack-destination',base],{cwd:source,env:{...process.env,HOME:base,npm_config_cache:path.join(base,'npm-cache'),NODE_PATH:'',NODE_OPTIONS:''}}).stdout)[0];
 const consumer=path.join(base,'consumer installation');fs.mkdirSync(consumer);fs.writeFileSync(path.join(consumer,'package.json'),'{"private":true}');
 command(process.execPath,[npm,'install','--ignore-scripts','--omit=dev','--no-audit','--no-fund',path.join(base,packed.filename)],{cwd:consumer,env:{...process.env,HOME:base,npm_config_cache:path.join(base,'npm-cache'),NODE_PATH:'',NODE_OPTIONS:''}});
 const root=path.join(consumer,'node_modules/arc-harness');
 const guard=path.join(base,'guard.mjs');fs.writeFileSync(guard,`import fs from 'node:fs';import {syncBuiltinESMExports,registerHooks} from 'node:module';import {fileURLToPath} from 'node:url';const source=${JSON.stringify(source)};const deny=value=>{let p=value instanceof URL?fileURLToPath(value):typeof value==='string'?value:null;if(p&&(p===source||p.startsWith(source+'/')))throw Error('Source checkout access forbidden: '+p);};for(const name of ['readFileSync','openSync','statSync','lstatSync','readdirSync','realpathSync']){const original=fs[name];fs[name]=function(value,...args){deny(value);return original.call(this,value,...args);};}syncBuiltinESMExports();registerHooks({resolve(specifier,context,next){const result=next(specifier,context);if(result.url.startsWith('file:'))deny(new URL(result.url));return result;}});`);
 const upstream=path.join(base,'fake-npx.mjs');fs.copyFileSync(path.join(source,'tests/node/fixtures/fake-npx.mjs'),upstream);
 const realNpx=path.join(path.dirname(npm),'npx-cli.js');
 const environments={};for(const kind of ['absent','traps']){const bin=path.join(base,kind+' bin');fs.mkdirSync(bin);fs.symlinkSync(process.execPath,path.join(bin,'node'));fs.writeFileSync(path.join(bin,'npx'),`#!/bin/sh\nprintf 'npx\\n' >> '${path.join(base,'acquisition-audit')}'\nexec '${process.execPath.replaceAll("'","'\\''")}' '${upstream.replaceAll("'","'\\''")}' valid "$@"\n`,{mode:0o755});const marker=path.join(base,kind+'-trap');for(const name of ['node-gyp','cc','c++','gcc','clang','make',...(kind==='traps'?['python','python3']:[])])fs.writeFileSync(path.join(bin,name),`#!/bin/sh\nprintf '%s\\n' '${name}' >> '${marker}'\nexit 99\n`,{mode:0o755});if(live){fs.writeFileSync(path.join(bin,'npx'),`#!/bin/sh\nexec '${process.execPath}' '${realNpx}' \"$@\"\n`);fs.symlinkSync('/usr/bin/git',path.join(bin,'git'));fs.symlinkSync('/bin/sh',path.join(bin,'sh'));}environments[kind]={PATH:bin,marker};}
 function run(kind,args,extra={}){const userHome=extra.home??fs.mkdtempSync(path.join(base,'target home '));const env={HOME:userHome,CODEX_HOME:userHome+'/.codex',CLAUDE_CONFIG_DIR:userHome+'/.claude',PATH:environments[kind].PATH,TMPDIR:base,LANG:'C.UTF-8'};const result=spawnSync(process.execPath,['--import',guard,extra.entry??path.join(root,'bin/arc-install.mjs'),...args],{encoding:'utf8',timeout:30000,killSignal:'SIGINT',cwd:consumer,env,...extra});assert.equal(fs.existsSync(environments[kind].marker),false,'Python/compiler trap invoked');return{...result,home:userHome};}
 return{base,root,guard,run,environments};
}
