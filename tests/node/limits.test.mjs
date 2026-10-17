import test from 'node:test';
import assert from 'node:assert/strict';
test('omitted limits resolve to total 100 and concurrent 5', async () => {
 const api = await import('../../lib/limits.mjs').catch(() => ({}));
 assert.equal(typeof api.resolveLimits, 'function', 'limit resolver is available');
 assert.deepEqual(api.resolveLimits({existing:null,overrides:{}}), {version:1,max_total_subagents:100,max_concurrent_subagents:5});
});
test('limit input rejects non positive ASCII safe integers and preserves partial overrides', async () => {
 const api=await import('../../lib/limits.mjs');
 assert.equal(typeof api.parsePositiveLimit,'function');
 assert.equal(api.parsePositiveLimit(' 100 ','total'),100);
 for(const raw of ['0','-1','+1','1.0','1e2','５','','9007199254740992']) assert.throws(()=>api.parsePositiveLimit(raw,'total'));
 assert.deepEqual(api.resolveLimits({existing:{version:1,max_total_subagents:2,max_concurrent_subagents:9},overrides:{max_total_subagents:3}}),{version:1,max_total_subagents:3,max_concurrent_subagents:9});
 assert.deepEqual(api.resolveLimits({existing:null,overrides:{max_total_subagents:2,max_concurrent_subagents:9}}),{version:1,max_total_subagents:2,max_concurrent_subagents:9});
 assert.throws(()=>api.resolveLimits({overrides:{max_total_subagents:0}}));
});
test('persistent limits round trip without accepting invalid schema or UTF-8',async()=>{
 const api=await import('../../lib/installer/limits.mjs').catch(()=>({}));
 assert.equal(typeof api.parseLimits,'function');
 const value={version:1,max_total_subagents:100,max_concurrent_subagents:5};
 assert.deepEqual(api.parseLimits(api.serializeLimits(value)),value);
 for(const text of ['version=2\nmax_total_subagents=100\nmax_concurrent_subagents=5','version=1\nmax_total_subagents="100"\nmax_concurrent_subagents=5','version=1\nmax_total_subagents=100\nmax_concurrent_subagents=5\nusage=0'])assert.throws(()=>api.parseLimits(Buffer.from(text)));
 assert.throws(()=>api.parseLimits(Buffer.from([255])));
});
