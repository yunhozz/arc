import test from 'node:test';import assert from 'node:assert/strict';
test('setup preserves per-target settings and requires explicit common values for differing targets',async()=>{const{initialSettings,setupOptions}=await import('../../lib/tui/setup.mjs');const statuses=[{platform:'codex',state:'installed',settings:{language:'ko',limits:{max_total_subagents:20,max_concurrent_subagents:2},modelConfig:{preset:'smart'}}},{platform:'claude',state:'installed',settings:{language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5},modelConfig:{preset:'balanced'}}}];const draft=initialSettings(statuses);assert.equal(draft.codex.language,'ko');assert.equal(draft.codex.maxTotalSubagents,20);assert.throws(()=>setupOptions(draft,'all'),/differ/);assert.equal(setupOptions(draft,'codex').preset,'smart');});
test('back from settings keeps changes and does not execute',async()=>{const{runSetup}=await import('../../lib/tui/setup.mjs');const answers=[0,0,2,null,null];const ui={menu:async()=>answers.shift(),text:async()=>'',page:async()=>{},review:async()=>false};const draft={};await runSetup({ui,statuses:[],draft,kind:'install',prepare:async()=>assert.fail('must not prepare until review')});assert.equal(draft.codex.preset,'smart');assert.equal(draft.codex.language,'en');});

test('Edit retains settings and target while explicit Cancel stops setup',async()=>{
 const{runSetup}=await import('../../lib/tui/setup.mjs');const answers=[1,0,2,5,5];const screens=[],prepared=[];let reviews=0;
 const ui={menu:async(title,rows,options)=>{screens.push({title,rows,options});return answers.shift()??null;},review:async()=>++reviews===1?'edit':'cancel'};const draft={};
 assert.equal(await runSetup({ui,statuses:[],draft,kind:'install',prepare:async o=>{prepared.push(o);return o;}}),null);
 assert.equal(prepared.length,2);assert.equal(prepared[1].target,'claude');assert.equal(prepared[1].preset,'smart');assert.equal(draft.codex.preset,'balanced');
});
test('returning to target selection retains selected target and canceled input retains value',async()=>{
 const{runSetup}=await import('../../lib/tui/setup.mjs');const answers=[1,2,null,1,null,null];const targets=[];const draft={};
 const ui={menu:async(title,rows,options)=>{if(title==='Install / Reconfigure')targets.push(options?.selected);return answers.shift();},text:async()=>null};
 await runSetup({ui,statuses:[],draft,kind:'install',prepare:async()=>assert.fail('no review')});assert.deepEqual(targets,[0,1,1]);assert.equal(draft.claude.maxTotalSubagents,100);
});
