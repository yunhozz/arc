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

test('model picker shows the full identifier and all supported efforts',async()=>{
 const model='long-'+('x'.repeat(120)),pairs=[{model,effort:'high'},{model,effort:'medium'}];let visits=0;
 await editCustomPreset({config:{platform:'codex'},initialRoles:initial,catalog:{platform:'codex',pairs},ui:{menu:async(title,rows,options)=>{
  if(title==='Custom preset')return visits++?null:0;
  if(title.startsWith('Select model')){assert.deepEqual(rows,[model]);const info=options.info({selected:0,columns:30,rows:24}).join('');assert.ok(info.includes(model));assert.match(info,/high.*medium/);return null;}
  assert.fail(title);
 },page:async()=>{}}});
});

test('model and effort detail stays in place with placeholders on Back',async()=>{
 let customVisits=0,modelVisits=0;
 await editCustomPreset({config:{platform:'codex'},initialRoles:initial,catalog,ui:{menu:async(title,rows,options)=>{
  if(title==='Custom preset')return customVisits++===0?0:null;
  if(title==='Select model — Scouter'){
   assert.deepEqual(options.info({selected:0,columns:100,rows:30}).slice(-3),['Model: model-a','Effort: high, medium','']);
   assert.deepEqual(options.info({selected:rows.length,columns:100,rows:30}),['Model: -','Effort: -','']);
   return modelVisits++===0?0:null;
  }
  if(title==='Select effort — Scouter'){
   assert.deepEqual(options.info({selected:rows.length,columns:100,rows:30}),['Model: model-a','Effort: -','']);
   return null;
  }
  assert.fail(title);
 },page:async()=>assert.fail('unexpected unavailable')}});
});

test('diagram marks only the role whose current pair is unavailable',async()=>{
 const roles=structuredClone(initial);roles.arc_planner={model:'missing-model',model_reasoning_effort:'high'};
 await editCustomPreset({config:{platform:'codex'},initialRoles:roles,catalog,ui:{menu:async(title,rows,options)=>{
  assert.equal(title,'Custom preset');const lines=options.renderBody({selected:0,blink:true,columns:120,rows:30}).rows;
  assert.match(lines[1],/Planner !/);assert.equal((lines.join('\n').match(/!/g)??[]).length,1);return null;
 },page:async()=>{}}});
});

test('model detail resize guidance blocks Enter and retains role and model selection',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const model='candidate-'+('x'.repeat(198)),roles=structuredClone(initial),catalog={platform:'codex',pairs:[{model,effort:'high'},{model,effort:'low'}],unavailable:[{model:'old',reason:'unsupported'}]};
 let viewport={columns:120,rows:40};const screens=[],events=[{name:'enter'},{name:'resize',viewport:{columns:40,rows:12}},{name:'enter'},{name:'resize',viewport:{columns:120,rows:40}},{name:'enter'},{name:'enter'},{name:'escape'}];
 const session={viewport:()=>viewport,render(screen){const result=renderScreen(screen,viewport);screens.push({screen,viewport:{...viewport},...result});return result;},nextEvent:async()=>{const event=events.shift();if(event?.viewport)viewport=event.viewport;return event??{name:'eof'};}};
 await assert.rejects(editCustomPreset({ui:createTuiInterface(session),config:{platform:'codex'},initialRoles:roles,catalog}),{code:'ARC_TUI_HOME'});
 const narrow=screens.filter(item=>item.screen.title==='Select model — Scouter'&&item.viewport.columns===40);assert.equal(narrow.length,2);assert.match(narrow[0].text,/requires/i);assert.equal(narrow[0].selectionEnabled,false);
 const wide=screens.find(item=>item.screen.title==='Select model — Scouter'&&item.viewport.columns===120);assert.ok(wide.screen.rows.slice(wide.screen.selected).join('').includes(model));assert.match(wide.text,/high, low/);assert.equal(wide.selectionEnabled,true);
 assert.ok(screens.some(item=>item.screen.title==='Select effort — Scouter'));assert.deepEqual(roles,initial);
});

test('effort detail resize guidance blocks Enter and preserves pending selection',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const model='candidate-'+('x'.repeat(198)),roles=structuredClone(initial),catalog={platform:'codex',pairs:[{model,effort:'high'},{model,effort:'low'}]};
 let viewport={columns:120,rows:40};const screens=[],events=[{name:'enter'},{name:'enter'},{name:'down'},{name:'resize',viewport:{columns:40,rows:12}},{name:'enter'},{name:'resize',viewport:{columns:120,rows:40}},{name:'enter'},{name:'resize',viewport:{columns:800,rows:40}},{name:'escape'}];
 const session={viewport:()=>viewport,render(screen){const result=renderScreen(screen,viewport);screens.push({screen,viewport:{...viewport},...result});return result;},nextEvent:async()=>{const event=events.shift();if(event?.viewport)viewport=event.viewport;return event??{name:'eof'};}};
 await assert.rejects(editCustomPreset({ui:createTuiInterface(session),config:{platform:'codex'},initialRoles:roles,catalog}),{code:'ARC_TUI_HOME'});
 const narrow=screens.filter(item=>item.screen.title==='Select effort — Scouter'&&item.viewport.columns===40);assert.equal(narrow.length,2);assert.match(narrow[0].text,/requires/i);assert.equal(narrow[0].selectionEnabled,false);
 const wide=screens.filter(item=>item.screen.title==='Select effort — Scouter'&&item.viewport.columns===120).at(-1);assert.match(wide.text,/> low/);assert.ok(wide.text.replace(/\n  /g,'').includes(model));assert.equal(wide.selectionEnabled,true);
 assert.ok(screens.some(item=>item.screen.title==='Custom preset'&&item.screen.rows.join('\n').includes('effort: low')));assert.deepEqual(roles,initial);
});
