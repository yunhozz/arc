import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildReleaseArtifact} from '../../../lib/release/artifact.mjs';
const quote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
const sourceRoot=fileURLToPath(new URL('../../../',import.meta.url));
const npmCli=fs.realpathSync(spawnSync('/bin/sh',['-c','command -v npm'],{encoding:'utf8'}).stdout.trim());
export async function createNpmSandbox(t){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc npm sandbox '))),home=root+'/home',prefix=root+'/prefix with spaces',cache=root+'/cache',cwd=root+'/invocation with spaces',bin=root+'/bin';
 for(const dir of [home,cwd,bin])fs.mkdirSync(dir);
 const packages=new Map(),registryAudit=[];let latest;
 const server=http.createServer((req,res)=>{
  registryAudit.push({method:req.method,path:req.url});const url=decodeURIComponent(req.url.split('?')[0]);
  if(url.startsWith('/tarballs/')){const pkg=[...packages.values()].find(item=>'/tarballs/'+item.metadata.version+'/'+path.basename(item.tarball)===url);if(pkg){res.end(fs.readFileSync(pkg.tarball));return;}}
  if(url==='/@yunhozz/arc'){
   const versions={};for(const [version,item]of packages)versions[version]={...item.metadata,dist:{tarball:registry+'/tarballs/'+version+'/'+path.basename(item.tarball),integrity:'sha512-'+createHash('sha512').update(fs.readFileSync(item.tarball)).digest('base64')}};
   res.setHeader('content-type','application/json');res.end(JSON.stringify({name:'@yunhozz/arc','dist-tags':{latest},versions}));return;
  }res.statusCode=404;res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const registry=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 fs.writeFileSync(root+'/user.npmrc',`registry=${registry}/\nprefix=${prefix}\ncache=${cache}\nforeground-scripts=false\naudit=false\nfund=false\nupdate-notifier=false\n`);fs.writeFileSync(root+'/global.npmrc','');fs.writeFileSync(root+'/gitconfig','');
 const env={PATH:bin+path.delimiter+process.env.PATH,HOME:home,ZDOTDIR:home,CODEX_HOME:home+'/.codex',CLAUDE_CONFIG_DIR:home+'/.claude',SHELL:'/bin/bash',TERM:'xterm',NODE_DISABLE_COMPILE_CACHE:'1',LANG:'C.UTF-8',TMPDIR:root,npm_config_userconfig:root+'/user.npmrc',npm_config_globalconfig:root+'/global.npmrc',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:root+'/gitconfig'};
 fs.writeFileSync(bin+'/git',`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(sourceRoot+'tests/node/fixtures/fake-git.mjs')} valid "$@"\n`,{mode:0o755});
 function sync(executable,args,options={}){const result=spawnSync(executable,args,{cwd,env,encoding:'utf8',timeout:120000,...options});if(result.status!==0)throw Error(result.stderr||result.stdout||String(result.error));return result;}
 function inputCopy(source,{version,extraFiles={}}={}){
  const copy=fs.mkdtempSync(root+'/source copy '),pkg=JSON.parse(fs.readFileSync(source+'/package.json'));
  for(const name of new Set(['README.md','package.json','package-lock.json','MANIFEST.sha256',...pkg.files]))if(fs.existsSync(source+'/'+name))fs.cpSync(source+'/'+name,copy+'/'+name,{recursive:true});
  if(version){pkg.version=version;fs.writeFileSync(copy+'/package.json',JSON.stringify(pkg,null,2)+'\n');const lock=JSON.parse(fs.readFileSync(copy+'/package-lock.json'));lock.version=lock.packages[''].version=version;fs.writeFileSync(copy+'/package-lock.json',JSON.stringify(lock,null,2)+'\n');}
  for(const[name,value]of Object.entries(extraFiles)){fs.mkdirSync(path.dirname(copy+'/'+name),{recursive:true});fs.writeFileSync(copy+'/'+name,value);}
  sync(process.execPath,['scripts/update-manifest.mjs'],{cwd:copy});return copy;
 }
 function packSourceFixture(source,options={}){
  const copy=inputCopy(source,options),output=JSON.parse(sync(process.execPath,[npmCli,'pack',copy,'--cache',root+'/pack-cache','--ignore-scripts','--offline','--json','--pack-destination',root]).stdout),record=Array.isArray(output)?output[0]:output['@yunhozz/arc'],tarball=path.join(root,record.filename);
  return{tarball,metadata:JSON.parse(sync('tar',['-xOf',tarball,'package/package.json']).stdout)};
 }
 async function packReleaseFixture(source,options={}){
  const copy=inputCopy(source,options),outDir=root+'/release-'+Math.random().toString(16).slice(2),receipt=await buildReleaseArtifact({sourceRoot:copy,outDir,npmCli});
  t.diagnostic('release artifact sha512 '+receipt.sha512);
  return{tarball:receipt.tarballPath,metadata:JSON.parse(sync('tar',['-xOf',receipt.tarballPath,'package/package.json']).stdout),receipt};
 }
 function addPackage({tarball,metadata}){packages.set(metadata.version,{tarball,metadata});latest??=metadata.version;}
 function runNpm(args,options={}){return new Promise(resolve=>{const child=spawn(process.execPath,[npmCli,...args],{cwd,env:{...env,...options.env},detached:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,stdout,stderr});});});}
 async function runPty(args,interaction,{extraEnv={},disconnect=false}={}){
  // Darwin sets PENDIN when libuv returns to canonical mode. It records pending
  // input reprinting, not a persistent user setting. Compare every other bit,
  // baud and control character after npm has consumed the interaction input.
  const comparison=process.platform==='darwin'?`${quote(process.execPath)} -e ${quote("const normalize=s=>s.replace(/:lflag=([0-9a-f]+)/,(_,h)=>':lflag='+(BigInt('0x'+h)&~0x20000000n).toString(16));process.exit(normalize(process.argv[1])===normalize(process.argv[2])?0:1);")} "$arc_before" "$arc_after"`:'[ "$arc_before" = "$arc_after" ]';
  const command=`arc_before=$(stty -g); ${quote(process.execPath)} ${quote(npmCli)} ${args.map(quote).join(' ')}; arc_status=$?; arc_after=$(stty -g); if ${comparison}; then printf '\\nARC_TERMINAL_RESTORED\\n'; else printf '\\nARC_TERMINAL_CHANGED %s %s\\n' "$arc_before" "$arc_after"; fi; exit "$arc_status"`;
  const driver=process.platform==='darwin'?'expect':'script';let driverArgs;
  if(driver==='expect'){
   const literal=value=>'{'+value.replaceAll('\\','\\\\').replaceAll('{','\\{').replaceAll('}','\\}')+'}';
   // Pass the shell command as an argv item so Tcl never reinterprets its quoting.
   let program='set timeout 45\nexpect_before timeout {exit 124}\nspawn -noecho /bin/bash -c [lindex $argv 0]\n';
   for(const step of interaction)program+=`expect -exact ${literal(step.wait)}\nsend -- [binary format H* ${Buffer.from(step.send).toString('hex')}]\n`;
   if(disconnect)program+='close\nexit 0\n';else program+='expect eof\nset result [wait]\nexit [lindex $result 3]\n';
   const file=root+'/driver-'+Math.random().toString(16).slice(2)+'.exp';fs.writeFileSync(file,program);driverArgs=[file,command];
  }else driverArgs=['-qefc',command,'/dev/null'];
  return await new Promise(resolve=>{const child=spawn(driver,driverArgs,{cwd,env:{...env,...extraEnv},stdio:['pipe','pipe','pipe']});let text='',stage=0,offset=0;const timer=setTimeout(()=>child.kill('SIGKILL'),60000);
   child.stdout.on('data',chunk=>{text+=chunk;if(driver==='expect')return;while(stage<interaction.length){const step=interaction[stage],at=text.indexOf(step.wait,offset);if(at<0)break;offset=at+step.wait.length;stage++;child.stdin.write(step.send);if(disconnect&&stage===interaction.length){child.kill('SIGKILL');break;}}});child.stderr.on('data',chunk=>{text+=chunk;});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({code,signal,text,driver});});
  });
 }
 return{root,home,prefix,cache,cwd,env,npmCli,registryAudit,packSourceFixture,packReleaseFixture,addPackage,setLatest(version){latest=version;},runNpm,runPty};
}
