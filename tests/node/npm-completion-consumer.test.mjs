import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
// The hook must actually be wired into npm; removing postinstall would leave
// installation successful but omit the managed block.
test('packed global npm installation registers once and local/scripts-disabled installs do not',t=>{
 let failed=false;const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-npm-consumer-')));t.after(()=>{if(process.env.ARC_KEEP_FAILED_CONSUMER==='1'&&failed)t.diagnostic('preserved consumer fixture: '+root);else fs.rmSync(root,{recursive:true,force:true});});
 const realStartup=path.join(os.userInfo().homedir,'.zshrc'),realBefore=fs.existsSync(realStartup)?fs.readFileSync(realStartup):null;
 t.after(()=>{assert.deepEqual(fs.existsSync(realStartup)?fs.readFileSync(realStartup):null,realBefore);});
 const home=root+'/home',prefix=root+'/prefix',cache=root+'/cache';fs.mkdirSync(home);const preload=root+'/identity.mjs';
 fs.writeFileSync(preload,`import os from 'node:os';import {syncBuiltinESMExports} from 'node:module';const original=os.userInfo;os.userInfo=(...args)=>({...original(...args),homedir:process.env.HOME});syncBuiltinESMExports();`);
 const bin=root+'/bin';fs.mkdirSync(bin);const realGit=spawnSync('/bin/sh',['-c','command -v git'],{encoding:'utf8'}).stdout.trim();const fakeGit=root+'/fake-git.mjs';fs.copyFileSync(new URL('./fixtures/fake-git.mjs',import.meta.url),fakeGit);fs.writeFileSync(bin+'/git',`#!/bin/sh\nexec '${process.execPath}' '${fakeGit}' valid "$@"\n`,{mode:0o755});
 const env={PATH:bin+':'+process.env.PATH,TERM:process.env.TERM??'xterm',LANG:process.env.LANG??'en_US.UTF-8',npm_config_userconfig:root+'/user.npmrc',npm_config_globalconfig:root+'/global.npmrc',npm_config_offline:'true',HOME:home,SHELL:'/bin/zsh',ZDOTDIR:home,npm_config_cache:cache,NODE_OPTIONS:`--import=${preload}`};for(const key of ['SUDO_UID','SUDO_USER','SUDO_COMMAND'])delete env[key];
 function npm(args,cwd=root){const r=spawnSync('npm',args,{cwd,env,encoding:'utf8',timeout:120000});if(r.status!==0){failed=true;t.diagnostic('npm failure cwd='+cwd+' args='+JSON.stringify(args)+' stdout='+r.stdout+' stderr='+r.stderr);}assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return r;}
 const packed=npm(['pack',process.cwd(),'--json','--ignore-scripts']);const tarball=root+'/'+JSON.parse(packed.stdout)[0].filename;
 npm(['install','-g','--prefix',prefix,'--foreground-scripts',tarball]);const filename=home+'/.zshrc';assert.ok(fs.existsSync(filename),'global install registers completion');const first=fs.readFileSync(filename);assert.equal((first.toString().match(/# >>> arc completion >>>/g)??[]).length,1);
 assert.equal(fs.realpathSync(prefix+'/bin/arc'),prefix+'/lib/node_modules/@yunhozz/arc/bin/arc.mjs');
 const version=spawnSync(prefix+'/bin/arc',['--version'],{env,encoding:'utf8'});assert.equal(version.status,0,version.stderr);assert.equal(version.stdout.trim(),'0.1.0');
 const pty=spawnSync('python3',['-c',String.raw`import os,pty,select,time,signal
pid,fd=pty.fork()
if pid==0: os.execvpe('zsh',['zsh','-i'],os.environ)
def read_for(seconds):
 data=b''; end=time.monotonic()+seconds
 while time.monotonic()<end:
  if select.select([fd],[],[],max(0,end-time.monotonic()))[0]:
   try: data+=os.read(fd,65536)
   except OSError: break
 return data
output=read_for(0.5)
os.write(fd,b'arc \t\t')
output+=read_for(0.8)
os.write(fd,b'\x03exit\n')
output+=read_for(0.2)
os.waitpid(pid,0)
print(output.decode(errors='replace'))`],{env:{...env,NODE_OPTIONS:'',PATH:prefix+'/bin:'+env.PATH},encoding:'utf8',timeout:10000});
 t.diagnostic('zsh PTY: '+JSON.stringify(pty.stdout));assert.equal(pty.status,0,pty.stderr);for(const command of ['install','uninstall','completion'])assert.ok(pty.stdout.includes(command),pty.stdout);
 npm(['install','-g','--prefix',prefix,'--force',tarball]);assert.deepEqual(fs.readFileSync(filename),first);
 npm(['uninstall','-g','--prefix',prefix,'@yunhozz/arc']);assert.deepEqual(fs.readFileSync(filename),first);
 fs.unlinkSync(filename);npm(['install','-g','--prefix',prefix,'--ignore-scripts',tarball]);assert.equal(fs.existsSync(filename),false);
 const local=root+'/local';fs.mkdirSync(local);fs.writeFileSync(local+'/package.json','{"private":true}');npm(['install',tarball],local);assert.equal(fs.existsSync(filename),false);
 const executed=npm(['exec','--yes','--package='+tarball,'--','arc','--version']);assert.match(executed.stdout,/0\.1\.0/);assert.equal(fs.existsSync(filename),false);
 const gitRoot=root+'/git-source';fs.mkdirSync(gitRoot);
 function command(name,args,cwd=gitRoot,extraEnv={}){const result=spawnSync(name,args,{cwd,env:{...env,...extraEnv},encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);return result;}
 command('tar',['-xf',tarball,'--strip-components=1']);command(realGit,['init','--quiet']);command(realGit,['add','.']);command(realGit,['-c','user.name=ARC Test','-c','user.email=arc@example.invalid','commit','--quiet','-m','local consumer fixture']);
 const preparation=command(process.execPath,['scripts/npm-postinstall.mjs'],gitRoot,{npm_config_global:'true',npm_lifecycle_event:'postinstall',npm_config_prefix:prefix});assert.match(preparation.stderr,/not the final global package location/);assert.equal(fs.existsSync(filename),false);
 t.diagnostic('Git fixture root: '+gitRoot+'; tracked hook: '+command(realGit,['ls-files','scripts/npm-postinstall.mjs']).stdout);
 assert.equal(fs.existsSync(filename),false);
 assert.deepEqual(fs.readdirSync(home).filter(name=>name.startsWith('.arc-stage-')),[]);
 t.diagnostic('local fixture only; global install/reinstall/uninstall, --ignore-scripts, local dependency, npx/npm exec, and inherited-global Git preparation all exit 0; final local Git URL and remote T5 not verified');

});
