import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRoutingFixture} from './role-fixtures.mjs';
import * as cli from '../../lib/runtime/local-cli.mjs';

const result = (authStatus, reason) => ({platform:'codex',authStatus,...(reason?{reason}:{})});
async function setup(t, authStatus) {
 const f=await createRoutingFixture(t), recordPath=path.join(f.base,'app-server.jsonl');
 await f.cli('codex',{authStatus,appServerRecordPath:recordPath});
 const context=cli.resolveLocalCli('codex',{cwd:f.cwd,userHome:f.userHome,env:f.env});
 return {f,context,recordPath};
}
async function probe(context, options) {
 assert.equal(typeof cli.probeCodexAuthStatus,'function');
 const value=await cli.probeCodexAuthStatus(context,options);
 assert.equal(JSON.stringify(value).includes('fixture-token-SECRET'),false);
 assert.equal(JSON.stringify(value).includes('refresh token'),false);
 return value;
}
// Wait for the fake's synchronous startup record, rather than guessing its startup time.
async function waitForStart(recordPath, {timeoutMs = 5000} = {}) {
 const deadline = Date.now() + timeoutMs;
 while (Date.now() < deadline) {
  let bytes;
  try { bytes = await fs.readFile(recordPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (bytes?.includes('\n')) {
   const record = JSON.parse(bytes.slice(0, bytes.indexOf('\n')));
   assert.equal(record.event, 'start');
   assert.ok(Number.isInteger(record.pid) && record.pid > 0);
   return record;
  }
  await new Promise(resolve => setTimeout(resolve, 10));
 }
 assert.fail('fake app-server did not record startup within the bound');
}
test('reports authenticated for chatgpt and apikey tokens and sends initialize, initialized, getAuthStatus with includeToken and refreshToken true',async t=>{
 for(const mode of ['chatgpt-ok','apikey-ok']) {
  const {context,recordPath}=await setup(t,mode);
  assert.deepEqual(await probe(context),result('authenticated'));
  const records=(await fs.readFile(recordPath,'utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.method);
  assert.deepEqual(records.map(x=>x.method),['initialize','initialized','getAuthStatus']);
  assert.deepEqual(records[0].params,{clientInfo:{name:'arc',title:'ARC',version:'1.0.0'}});
  assert.deepEqual(records[2].params,{includeToken:true,refreshToken:true});
 }
});
for(const [name,mode,status,reason] of [
 ['maps a chatgpt account whose token is withheld after refresh to unauthorized token_rejected','revoked','unauthorized','token_rejected'],
 ['maps a logged-out account to unauthorized not_logged_in','logged-out','unauthorized','not_logged_in'],
 ['treats a provider without OpenAI auth as authenticated','no-auth-required','authenticated'],
 ['treats host-owned credentials without an exported token as authenticated','pat-null','authenticated'],
 ['maps another auth method without a token to unknown auth_unverified','other-null','unknown','auth_unverified']
]) test(name,async t=>{const {context}=await setup(t,mode);assert.deepEqual(await probe(context),result(status,reason));});
test('never reports authenticated when the probe cannot decide',async t=>{
 for(const [mode,status,reason] of [['error','unknown','status_command_failed'],['malformed','unknown','invalid_response'],['oversize','unknown','invalid_response'],['exit','unknown','cli_execution_error'],['notify-first','authenticated']]) {
  const {context}=await setup(t,mode);assert.deepEqual(await probe(context),result(status,reason),mode);
 }
});
test('times out a hanging app-server within the bound and leaves no child',async t=>{
 const {context,recordPath}=await setup(t,'hang');
 const timeoutMs=1500,start=Date.now(),pending=probe(context,{timeoutMs});
 let pid;
 try { ({pid}=await waitForStart(recordPath,{timeoutMs})); } finally { await pending; }
 assert.deepEqual(await pending,result('unknown','timeout'));
 assert.ok(Date.now()-start<timeoutMs+2000);
 assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});
test('returns aborted for an aborted signal and invalid_context for an unknown context',async t=>{
 const {context}=await setup(t,'chatgpt-ok');
 assert.deepEqual(await probe(context,{signal:AbortSignal.abort()}),result('unknown','aborted'));
 assert.deepEqual(await probe({platform:'codex'}),result('unknown','invalid_context'));
 assert.deepEqual(await probe({platform:'codex',reason:'cli_not_found'}),result('unknown','cli_not_found'));
});
test('platform auth rejects non-Claude contexts without starting a child',async t=>{
 const {f,context,recordPath}=await setup(t,'chatgpt-ok');
 assert.deepEqual(await cli.probePlatformAuth(context),result('unknown','invalid_context'));
 assert.deepEqual(await cli.probePlatformAuth({platform:'other',reason:'cli_not_found'}),{platform:'other',authStatus:'unknown',reason:'invalid_context'});
 for(const filename of [recordPath,path.join(f.binDir,'.record-codex.jsonl')]) {
  await assert.rejects(fs.access(filename),{code:'ENOENT'});
 }
});
test('aborting an active app-server stops the child without leaking its response',async t=>{
 const {context,recordPath}=await setup(t,'hang'),controller=new AbortController();
 const pending=probe(context,{signal:controller.signal});
 let pid;
 try {
  ({pid}=await waitForStart(recordPath));
  controller.abort();
  assert.deepEqual(await pending,result('unknown','aborted'));
 } finally { controller.abort(); await pending; }
 assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});

for(const [name,response,status,reason] of [
 ['logged-out',{authMethod:null,authToken:null,requiresOpenaiAuth:null},'unauthorized','not_logged_in'],
 ['token-present',{authMethod:'chatgpt',authToken:'fixture-token-SECRET',requiresOpenaiAuth:null},'authenticated']
]) test(`accepts nullable OpenAI auth requirement for ${name} responses without leaking tokens`,async t=>{
 const {FAKE_CODEX_APP_SERVER}=await import('./role-fixtures.mjs');
 const {f,context}=await setup(t,'chatgpt-ok');
 const source=FAKE_CODEX_APP_SERVER.replace('result:{authMethod,authToken,requiresOpenaiAuth}',`result:${JSON.stringify(response)}`);
 await fs.writeFile(path.join(f.binDir,'codex'),`#!${process.execPath}\n${source}\nappServer({});\n`);
 assert.deepEqual(await probe(context),result(status,reason));
});
test('validates response shapes and ignores host-owned token withholding without promoting unknown methods',async t=>{
 const {FAKE_CODEX_APP_SERVER}=await import('./role-fixtures.mjs');
 for(const [response,status,reason] of [
  [{authMethod:'headers',authToken:null,requiresOpenaiAuth:true},'authenticated'],
  [{authMethod:'agentIdentity',authToken:null,requiresOpenaiAuth:true},'authenticated'],
  [{authMethod:'chatgptAuthTokens',authToken:null,requiresOpenaiAuth:true},'unknown','auth_unverified'],
  [{authMethod:'bedrockAccessKeys',authToken:null,requiresOpenaiAuth:true},'unknown','auth_unverified'],
  [{authMethod:'chatgpt',authToken:'',requiresOpenaiAuth:true},'unknown','invalid_response'],
  [{authMethod:'chatgpt',requiresOpenaiAuth:true},'unknown','invalid_response'],
  [{authMethod:42,authToken:null,requiresOpenaiAuth:true},'unknown','invalid_response'],
  [{authMethod:null,authToken:null,requiresOpenaiAuth:'false'},'unknown','invalid_response'],
  [{authMethod:null,authToken:null,requiresOpenaiAuth:0},'unknown','invalid_response'],
  [{authMethod:'chatgpt',authToken:'fixture-token-SECRET'},'unknown','invalid_response'],
  [null,'unknown','invalid_response'],
  [[], 'unknown','invalid_response']
 ]) {
  const {f,context}=await setup(t,'chatgpt-ok');
  const source=FAKE_CODEX_APP_SERVER.replace('result:{authMethod,authToken,requiresOpenaiAuth}',`result:${JSON.stringify(response)}`);
  await fs.writeFile(path.join(f.binDir,'codex'),`#!${process.execPath}\n${source}\nappServer({});\n`);
  assert.deepEqual(await probe(context),result(status,reason));
 }
});
test('rejects unknown response ids and initialization errors without exposing server details',async t=>{
 const {FAKE_CODEX_APP_SERVER}=await import('./role-fixtures.mjs');
 for(const [from,to,reason] of [
  ['send({id:request.id,result:{authMethod,authToken,requiresOpenaiAuth}})', 'send({id:999,result:{authMethod,authToken,requiresOpenaiAuth}})', 'invalid_response'],
  ["result:{userAgent:'fake',platformFamily:'unix',platformOs:'macos'}", "error:{code:-32603,message:'fixture-token-SECRET fixture-account@example.com'}", 'status_command_failed'],
  ["result:{userAgent:'fake',platformFamily:'unix',platformOs:'macos'}", 'result:null', 'invalid_response']
 ]) {
  const {f,context}=await setup(t,'chatgpt-ok');
  await fs.writeFile(path.join(f.binDir,'codex'),`#!${process.execPath}\n${FAKE_CODEX_APP_SERVER.replace(from,to)}\nappServer({});\n`);
  const value=await probe(context);assert.deepEqual(value,result('unknown',reason));assert.doesNotMatch(JSON.stringify(value),/fixture-account@example.com/);
 }
});
test('kills a hanging app-server that ignores SIGTERM within the cleanup allowance',async t=>{
 const {f,context,recordPath}=await setup(t,'hang');
 const filename=path.join(f.binDir,'codex');
 await fs.writeFile(filename,(await fs.readFile(filename,'utf8')).replace("const args=process.argv.slice(2);","process.on('SIGTERM',()=>{});\nconst args=process.argv.slice(2);"));
 // Allow process startup under load while retaining the same timeout + 2000ms bound.
 const timeoutMs=3000,start=Date.now(),pending=probe(context,{timeoutMs});
 let pid;
 try { ({pid}=await waitForStart(recordPath,{timeoutMs})); } finally { await pending; }
 assert.deepEqual(await pending,result('unknown','timeout'));
 assert.ok(Date.now()-start<timeoutMs+2000);
 assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});
