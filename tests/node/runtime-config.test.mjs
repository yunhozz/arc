import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToml} from '../../lib/models/config.mjs';
test('Codex concurrency edits preserve other values, comments, line endings and are idempotent',async()=>{
 const api=await import('../../lib/installer/runtime-config.mjs').catch(()=>({}));
 assert.equal(typeof api.renderCodexConcurrency,'function');
 for(const original of [null,Buffer.from('# hi\r\n[agents]\r\nmax_concurrent_threads_per_session = 9 # keep\r\nother = "yes"'),Buffer.from('name="hello"\n[agents.roles]\na="b"')]) {
  const result=api.renderCodexConcurrency(original,5);
  assert.equal(api.readRuntimeConcurrency('codex',result.content),5);
  assert.deepEqual(api.renderCodexConcurrency(result.content,5).content,result.content);
  const data=parseToml(result.content.toString());
  if(original?.includes(Buffer.from('# keep'))) {assert.match(result.content.toString(),/# keep/);assert.equal(data.agents.other,'yes');assert.match(result.content.toString(),/\r\n/);}
 }
});
test('Claude concurrency preserves unknown settings and emits an idempotent string setting',async()=>{
 const api=await import('../../lib/installer/runtime-config.mjs');
 assert.equal(typeof api.renderClaudeConcurrency,'function');
 for(const original of [null,Buffer.from('{"env":{"TOKEN":"secret","CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS":"9"},"permissions":{"allow":["Read"]}}')]) {
  const result=api.renderClaudeConcurrency(original,5);
  const data=JSON.parse(result.content);assert.equal(data.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS,'5');
  if(original){assert.equal(data.env.TOKEN,'secret');assert.deepEqual(data.permissions,{allow:['Read']});}
  assert.equal(api.readRuntimeConcurrency('claude',result.content),5);
  assert.deepEqual(api.renderClaudeConcurrency(result.content,5).content,result.content);
 }
});
test('unsafe native configurations fail without mutating input bytes',async()=>{
 const api=await import('../../lib/installer/runtime-config.mjs');
 for(const [platform,fixtures] of [['codex',['[agents]\nmax_concurrent_threads_per_session="5"','[agents]\n[agents]','agents = {max_concurrent_threads_per_session=9}','[agents]\n"max_concurrent_threads_per_session"=9','[agents','agents=5']],['claude',['[]','null','{"env":null}','{"env":[]}','{"env":{"CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS":5}}','{"env":{},"env":{}}','{"a":9007199254740993}','{']]]) {
  for(const text of fixtures){const bytes=Buffer.from(text);assert.throws(()=>platform==='codex'?api.renderCodexConcurrency(bytes,5):api.renderClaudeConcurrency(bytes,5),text);assert.equal(bytes.toString(),text);}
  assert.throws(()=>api.readRuntimeConcurrency(platform,Buffer.from([255])));
 }
});
test('Claude settings parser returns unrelated settings and rejects duplicate keys',async()=>{
 const {parseClaudeSettings}=await import('../../lib/installer/runtime-config.mjs');
 const input='{"env":{"TOKEN":"fixture"},"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"fixture"}]}]},"permissions":{"allow":["Read"]}}';
 assert.deepEqual(parseClaudeSettings(input),JSON.parse(input));
 assert.throws(()=>parseClaudeSettings('{"hooks":{},"hooks":{}}'),/Duplicate Claude settings key/);
});
