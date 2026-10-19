import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';

// npm Git preparation inherits global configuration. Lifecycle hooks would make
// its nested install replace the same global package before packing completes.
test('Git global install and reinstall preserve an executable CLI with inherited global configuration',t=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url)));
 for(const hook of ['preinstall','install','postinstall','prepare','prepack'])assert.equal(pkg.scripts[hook],undefined,hook);
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-git-consumer-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const home=root+'/home',prefix=root+'/prefix',cache=root+'/cache',gitRoot=root+'/git-source';for(const dir of [home,gitRoot])fs.mkdirSync(dir);
 const env={PATH:process.env.PATH,HOME:home,SHELL:'/bin/zsh',ZDOTDIR:home,npm_config_cache:cache,npm_config_userconfig:root+'/user.npmrc',npm_config_globalconfig:root+'/global.npmrc',npm_config_offline:'true',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:root+'/gitconfig'};
 function command(name,args,cwd=root,extra={}){const result=spawnSync(name,args,{cwd,env:{...env,...extra},encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr+'\n'+result.stdout);return result.stdout;}
 const result=JSON.parse(command('npm',['pack',path.resolve('.'),'--json','--ignore-scripts']));
 const packed=Array.isArray(result)?result[0]:result[pkg.name];
 command('tar',['-xf',root+'/'+packed.filename,'--strip-components=1'],gitRoot);
 command('git',['init','--quiet'],gitRoot);command('git',['add','.'],gitRoot);command('git',['-c','user.name=ARC Test','-c','user.email=arc@example.invalid','commit','--quiet','-m','consumer fixture'],gitRoot);
 const install=['install','-g','--allow-git=all','--prefix',prefix,'--no-audit','--no-fund','git+file://'+gitRoot];
 for(let attempt=0;attempt<2;attempt++){
  command('npm',install,root,{npm_config_global:'true'});
  const executable=prefix+'/bin/arc';assert.ok(fs.statSync(fs.realpathSync(executable)).isFile());
  assert.equal(command(executable,['--version']).trim(),pkg.version);
  const completion=command(executable,['completion','zsh']);
  const probe=completion+'\ncompadd() { print -rl -- "${candidates[@]}"; }\nwords=(arc ""); CURRENT=2; _arc';
  assert.deepEqual(command('zsh',['-f','-c',probe]).trim().split('\n'),['preset','uninstall']);
  assert.equal(fs.existsSync(home+'/.zshrc'),false,'npm installs the CLI; harness installation registers completion');
 }
 assert.equal(fs.existsSync(home+'/.codex'),false);assert.equal(fs.existsSync(home+'/.claude'),false);
});
