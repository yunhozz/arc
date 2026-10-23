import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {runRoot} from '../../lib/cli/root.mjs';
for(const [inputTTY,outputTTY]of [[false,false],[true,false],[false,true]])test('root rejects missing terminal side without touching streams '+inputTTY+'/'+outputTTY,async()=>{
 let error='';const deny=()=>assert.fail('terminal must not be opened');const code=await runRoot([],{input:{isTTY:inputTTY,on:deny,setRawMode:deny},output:{isTTY:outputTTY,write:deny,on:deny},error:{write:s=>error+=s}});assert.equal(code,2);assert.match(error,/interactive terminal/);
});
test('non-TTY root never loads TUI native or installer',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`import{registerHooks}from'node:module';registerHooks({resolve(s,c,next){if(/tui|safe-fs|installer/.test(s))throw Error('Unexpected terminal dependency');return next(s,c);}});const{runRoot}=await import('./lib/cli/root.mjs');process.exitCode=await runRoot([]);`],{encoding:'utf8'});assert.equal(result.status,2,result.stderr);assert.match(result.stderr,/interactive terminal/);
});
