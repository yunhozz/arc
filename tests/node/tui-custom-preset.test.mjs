import test from 'node:test';
import assert from 'node:assert/strict';
import { editCustomPreset } from '../../lib/tui/custom-preset.mjs';

const initial=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'model-a',model_reasoning_effort:'high'}]));
const catalog={platform:'codex',pairs:[{model:'model-a',effort:'high'},{model:'model-a',effort:'medium'},{model:'model-b',effort:'low'}]};
test('model choices are unique and only confirmed supported effort updates a role',async()=>{
 const before=structuredClone(initial);let step=0;
 const result=await editCustomPreset({config:{platform:'codex'},initialRoles:initial,catalog,ui:{menu:async(title,rows,options)=>{
  if(title==='Custom preset'){if(step++===0)return 0;assert.equal(options.selected,0);return 5;}
  if(title.startsWith('Select model')){assert.deepEqual(rows,['model-a','model-b']);assert.match(options.info({selected:0,columns:100,rows:30}).join(' '),/high.*medium/);return 1;}
  if(title.startsWith('Select effort')){assert.deepEqual(rows,['low']);assert.deepEqual(initial,before);return 0;}
  assert.fail(title);
 },page:async()=>assert.fail('unexpected unavailable')}});
 assert.equal(result.arc_scouter.model,'model-b');assert.equal(result.arc_scouter.model_reasoning_effort,'low');assert.deepEqual(initial,before);
});

test('role editor presents the diagram with focus and preserves it after editing',async()=>{
 let visits=0;await editCustomPreset({config:{platform:'codex'},initialRoles:initial,catalog,ui:{menu:async(title,rows,options)=>{
  if(title==='Custom preset'){assert.equal(typeof options.renderBody,'function');const body=options.renderBody({selected:2,blink:true,columns:120,rows:30});assert.match(body.rows.join('\n'),/Orchestrator/);assert.match(body.rows.join('\n'),/> Implementer/);assert.equal(options.refreshMs,600);return visits++===0?2:null;}
  if(title.startsWith('Select model'))return 0;if(title.startsWith('Select effort'))return 0;assert.fail(title);
 },page:async()=>{}}});
});

test('model details retain the full identifier and all supported efforts',async()=>{
 const model='long-'+('x'.repeat(120)),pairs=[{model,effort:'high'},{model,effort:'medium'}];let visits=0;
 await editCustomPreset({config:{platform:'codex'},initialRoles:initial,catalog:{platform:'codex',pairs},ui:{menu:async(title,rows,options)=>{
  if(title==='Custom preset')return visits++?null:0;
  if(title.startsWith('Select model')){const info=options.info({selected:0,columns:30,rows:24}).join('');assert.ok(info.includes(model));assert.match(info,/high.*medium/);return null;}
  assert.fail(title);
 },page:async()=>{}}});
});
