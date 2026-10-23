import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {runPostinstall} from '../../lib/cli/postinstall.mjs';
for(const env of [{},{npm_lifecycle_event:'postinstall',npm_config_global:'true'},{CI:'true'},{npm_command:'exec'},{npm_lifecycle_event:'postinstall',npm_config_ignore_scripts:'true'}])for(const tty of [true,false])test('postinstall is guidance only '+JSON.stringify(env)+' tty='+tty,async()=>{
 let text='';const deny=()=>assert.fail('postinstall must not inspect npm, open a terminal or run installer');
 assert.equal(await runPostinstall({packageRoot:'/missing/package',env,cwd:'/missing/cwd',input:{isTTY:tty},output:{isTTY:tty,write:s=>text+=s},error:{write:deny},deps:{inspectNpmContext:deny,openInstallerTerminal:deny,runCli:deny}}),0);
 assert.equal(text,'Run arc to install or manage the ARC harness.\n');
});
test('postinstall script works without installer TUI native filesystem or network side effects',()=>{
 const r=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';import cp from 'node:child_process';import net from 'node:net';import{syncBuiltinESMExports,registerHooks}from'node:module';const deny=()=>{throw Error('Forbidden side effect');};for(const k of ['writeFileSync','mkdirSync','renameSync','rmSync'])fs[k]=deny;for(const k of ['spawn','spawnSync','exec','execFile','fork'])cp[k]=deny;net.connect=deny;globalThis.fetch=deny;syncBuiltinESMExports();registerHooks({resolve(s,c,next){if(/installer|tui|safe-fs|npm\\//.test(s))throw Error('Forbidden import: '+s);return next(s,c);}});await import('./scripts/postinstall.mjs');`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'Run arc to install or manage the ARC harness.\n');assert.equal(r.stderr,'');
});
