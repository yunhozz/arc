import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCatalogPair, editRole } from '../../lib/tui/custom-preset.mjs';

const initial={model:'model-a',effort:'high'};
const catalog={platform:'codex',pairs:[{model:'model-a',effort:'high'},{model:'model-a',effort:'medium'},{model:'model-b',effort:'low'}]};
test('model choices are unique and only confirmed supported effort updates a role',async()=>{
 const before=structuredClone(initial);
 const result=await selectCatalogPair({roleName:'Scouter',current:initial,catalog,ui:{menu:async(title,rows,options)=>{
  if(title.startsWith('Model')){assert.deepEqual(rows,['model-a','model-b']);assert.match(options.info({selected:0,columns:100,rows:30}).join(' '),/high.*medium/);return 1;}
  if(title.startsWith('Effort')){assert.deepEqual(rows,['low']);assert.deepEqual(initial,before);return 0;}
  assert.fail(title);
 },page:async()=>assert.fail('unexpected unavailable')}});
 assert.equal(result.model,'model-b');assert.equal(result.effort,'low');assert.deepEqual(initial,before);
});

test('model picker shows the full identifier and all supported efforts',async()=>{
 const model='long-'+('x'.repeat(120)),pairs=[{model,effort:'high'},{model,effort:'medium'}];
 await selectCatalogPair({roleName:'Scouter',current:initial,catalog:{platform:'codex',pairs},ui:{menu:async(title,rows,options)=>{
  if(title.startsWith('Model')){assert.deepEqual(rows,[model]);const info=options.info({selected:0,columns:30,rows:24}).join('');assert.ok(info.includes(model));assert.match(info,/high.*medium/);return null;}
  assert.fail(title);
 },page:async()=>{}}});
});

test('model and effort detail stays in place with placeholders on Back',async()=>{
 let modelVisits=0;
 await selectCatalogPair({roleName:'Scouter',current:initial,catalog,ui:{menu:async(title,rows,options)=>{
  if(title==='Model — Scouter'){
   assert.deepEqual(options.info({selected:0,columns:100,rows:30}).slice(-3),['Model: model-a','Effort: high, medium','']);
   assert.deepEqual(options.info({selected:rows.length,columns:100,rows:30}),['Model: -','Effort: -','']);
   return modelVisits++===0?0:null;
  }
  if(title==='Effort — Scouter'){
   assert.deepEqual(options.info({selected:rows.length,columns:100,rows:30}),['Model: model-a','Effort: -','']);
   return null;
  }
  assert.fail(title);
 },page:async()=>assert.fail('unexpected unavailable')}});
});

test('model detail resize guidance blocks Enter and retains role and model selection',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const model='candidate-'+('x'.repeat(198)),current={platform:'codex',...initial},catalog={platform:'codex',pairs:[{model,effort:'high'},{model,effort:'low'}],unavailable:[{model:'old',reason:'unsupported'}]};
 let viewport={columns:120,rows:40};const screens=[],events=[{name:'down'},{name:'enter'},{name:'resize',viewport:{columns:40,rows:12}},{name:'enter'},{name:'resize',viewport:{columns:120,rows:40}},{name:'enter'},{name:'enter'},{name:'escape'}];
 const session={viewport:()=>viewport,render(screen){const result=renderScreen(screen,viewport);screens.push({screen,viewport:{...viewport},...result});return result;},nextEvent:async()=>{const event=events.shift();if(event?.viewport)viewport=event.viewport;return event??{name:'eof'};}};
 await assert.rejects(editRole({ui:createTuiInterface(session),roleName:'Scouter',current,availabilityOf:id=>({selectable:id==='codex',reason:id==='codex'?null:'unauthorized'}),loadCatalog:async()=>({status:'ready',catalog}),defaultsFor:async()=>initial}),{code:'ARC_TUI_HOME'});
 const narrow=screens.filter(item=>item.screen.title==='Model — Scouter'&&item.viewport.columns===40);assert.equal(narrow.length,2);assert.match(narrow[0].text,/requires/i);assert.equal(narrow[0].selectionEnabled,false);
 const wide=screens.find(item=>item.screen.title==='Model — Scouter'&&item.viewport.columns===120);assert.ok(wide.screen.rows.slice(wide.screen.selected).join('').includes(model));assert.match(wide.text,/high, low/);assert.equal(wide.selectionEnabled,true);
 assert.ok(screens.some(item=>item.screen.title==='Effort — Scouter'));assert.deepEqual(current,{platform:'codex',...initial});
});

test('effort detail resize guidance blocks Enter and preserves pending selection',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const model='candidate-'+('x'.repeat(198)),current={platform:'codex',...initial},catalog={platform:'codex',pairs:[{model,effort:'high'},{model,effort:'low'}]};
 let viewport={columns:120,rows:40};const screens=[],events=[{name:'down'},{name:'enter'},{name:'enter'},{name:'down'},{name:'resize',viewport:{columns:40,rows:12}},{name:'enter'},{name:'resize',viewport:{columns:120,rows:40}},{name:'enter'},{name:'resize',viewport:{columns:800,rows:40}},{name:'escape'}];
 const session={viewport:()=>viewport,render(screen){const result=renderScreen(screen,viewport);screens.push({screen,viewport:{...viewport},...result});return result;},nextEvent:async()=>{const event=events.shift();if(event?.viewport)viewport=event.viewport;return event??{name:'eof'};}};
 await assert.rejects(editRole({ui:createTuiInterface(session),roleName:'Scouter',current,availabilityOf:id=>({selectable:id==='codex',reason:id==='codex'?null:'unauthorized'}),loadCatalog:async()=>({status:'ready',catalog}),defaultsFor:async()=>initial}),{code:'ARC_TUI_HOME'});
 const narrow=screens.filter(item=>item.screen.title==='Effort — Scouter'&&item.viewport.columns===40);assert.equal(narrow.length,2);assert.match(narrow[0].text,/requires/i);assert.equal(narrow[0].selectionEnabled,false);
 const wide=screens.filter(item=>item.screen.title==='Effort — Scouter'&&item.viewport.columns===120).at(-1);assert.match(wide.text,/> low/);assert.ok(wide.text.replace(/\n  /g,'').includes(model));assert.equal(wide.selectionEnabled,true);
 assert.ok(screens.some(item=>item.screen.title==='Scouter'&&item.screen.rows.join('\n').includes('Effort ‹ low ›')));assert.deepEqual(current,{platform:'codex',...initial});
});


test('compact detail menu puts one blank after the pager row and none before Back',async()=>{
 await selectCatalogPair({roleName:'Scouter',current:initial,catalog,ui:{menu:async(title,rows,options)=>{
  assert.equal(title,'Model — Scouter');const body=options.renderBody({selected:0,columns:60,rows:20}),pagerRow=body.rows.find(row=>row.startsWith('←/→: Details '));
  assert.ok(pagerRow);assert.equal(body.rows[body.rows.indexOf(pagerRow)+1],'');assert.equal(body.rows.at(-1),'Back');assert.notEqual(body.rows.at(-2),'');assert.equal(body.rows[body.selected],'model-a');
  const back=options.renderBody({selected:rows.length,columns:60,rows:20});assert.equal(back.rows[back.selected],'Back');return null;
 },page:async()=>assert.fail('unexpected unavailable')}});
});

test('full model menu has no blank before Back',async()=>{
 await selectCatalogPair({roleName:'Scouter',current:initial,catalog,ui:{menu:async(title,rows,options)=>{
  assert.equal(title,'Model — Scouter');const body=options.renderBody({selected:rows.length,columns:120,rows:40});assert.equal(body.rows[body.selected],'Back');assert.notEqual(body.rows[body.selected-1],'');return null;
 },page:async()=>assert.fail('unexpected unavailable')}});
});

// These scripts catch skipped gates, lost resets, wrong field transitions and picker routing.
const roleEditor = await import('../../lib/tui/custom-preset.mjs');
const {createTestRegistries} = await import('./fixtures/platforms/zeta.mjs');
const {diagramRegistry} = await import('./fixtures/platforms/diagram.mjs');
const selectable = {selectable:true,reason:null,warning:null};
const unauthorized = {selectable:false,reason:'unauthorized',warning:null};
const editorCurrent = {platform:'claude',model:'model-a',effort:'high'};
const editorState = (selected=0,columns=100) => ({selected,columns,rows:30});
function menuScript(steps) {
 let index=0;
 return {menu:async(title,rows,options)=>{
  assert.ok(index<steps.length,`Unexpected menu: ${title}`);
  return steps[index++](title,rows,options);
 },page:async()=>assert.fail('unexpected page'),done:()=>assert.equal(index,steps.length)};
}
async function runRoleEditor(ui,options={}) {
 assert.equal(typeof roleEditor.editRole,'function');
 return roleEditor.editRole({ui,roleName:'Planner',current:editorCurrent,availabilityOf:()=>selectable,
  loadCatalog:async platform=>({status:'ready',catalog:{...catalog,platform}}),
  defaultsFor:async()=>({model:'model-a',effort:'medium'}),...options});
}
const bodyRows = (options,selected=0,columns=100) => options.renderBody(editorState(selected,columns)).rows;

test('left/right skips unavailable platforms in registry display order',async()=>{
 const registry=createTestRegistries(['eta','zeta','claude','codex']).platforms;
 const ui=menuScript([(title,rows,options)=>{
  assert.equal(title,'Planner');
  for(const [direction,label] of [['right','Zeta'],['right','Eta'],['left','Zeta'],['left','Claude']]){
   options.onHorizontal({...editorState(),direction});
   assert.equal(bodyRows(options)[0],`Platform ‹ ${label} ›`);
  }
  return 3;
 }]);
 assert.deepEqual(await runRoleEditor(ui,{registry,availabilityOf:id=>id==='codex'?unauthorized:selectable}),{platform:'claude',model:'model-a',effort:'medium'});ui.done();
});

test('cycling with only the current platform selectable keeps values and reset marks unchanged',async()=>{
 const ui=menuScript([(title,rows,options)=>{
  for(const direction of ['left','right'])options.onHorizontal({...editorState(),direction});
  assert.deepEqual(bodyRows(options),['Platform ‹ Claude ›','Model ‹ model-a ›','Effort ‹ high ›','Done','Back']);return 3;
 }]);
 assert.deepEqual(await runRoleEditor(ui,{availabilityOf:id=>id==='claude'?selectable:unauthorized}),editorCurrent);ui.done();
});

test('platform change resets to role defaults and user field changes clear only their reset mark',async()=>{
 const ui=menuScript([(title,rows,options)=>{
  options.onHorizontal({...editorState(),direction:'right'});
  assert.deepEqual(bodyRows(options),['Platform ‹ Codex ›','Model ‹ model-a › (reset)','Effort ‹ medium › (reset)','Done','Back']);
  options.onHorizontal({...editorState(2),direction:'left'});
  assert.equal(bodyRows(options)[1],'Model ‹ model-a › (reset)');assert.equal(bodyRows(options)[2],'Effort ‹ high ›');
  options.onHorizontal({...editorState(1),direction:'right'});
  assert.equal(bodyRows(options)[1],'Model ‹ model-b ›');assert.equal(bodyRows(options)[2],'Effort ‹ low › (reset)');return 3;
 }]);
 const before=structuredClone(editorCurrent);
 const result=await runRoleEditor(ui,{defaultsFor:async(id,role)=>{assert.equal(role,'Planner');return {model:'model-a',effort:'medium'};}});
 assert.deepEqual(result,{platform:'codex',model:'model-b',effort:'low'});assert.deepEqual(editorCurrent,before);ui.done();
});

test('platform change falls back to the first catalog pair when defaults are absent from the catalog',async()=>{
 const ui=menuScript([(title,rows,options)=>{
  options.onHorizontal({...editorState(),direction:'right'});
  assert.deepEqual(bodyRows(options).slice(1,3),['Model ‹ model-a › (reset)','Effort ‹ high › (reset)']);return 3;
 }]);
 assert.deepEqual(await runRoleEditor(ui,{defaultsFor:()=>({model:'missing',effort:'high'})}),{platform:'codex',model:'model-a',effort:'high'});ui.done();
});

test('model change resets missing effort but preserves an effort supported by the next model',async()=>{
 const ui=menuScript([(title,rows,options)=>{
  options.onHorizontal({...editorState(1),direction:'right'});
  assert.deepEqual(bodyRows(options).slice(1,3),['Model ‹ model-b ›','Effort ‹ low › (reset)']);
  options.onHorizontal({...editorState(1),direction:'right'});
  assert.deepEqual(bodyRows(options).slice(1,3),['Model ‹ model-c ›','Effort ‹ low › (reset)']);
  options.onHorizontal({...editorState(2),direction:'left'});
  assert.equal(bodyRows(options)[2],'Effort ‹ high ›');return 3;
 }]);
 assert.deepEqual(await runRoleEditor(ui,{loadCatalog:async platform=>({status:'ready',catalog:{platform,pairs:[...catalog.pairs,{model:'model-c',effort:'high'},{model:'model-c',effort:'low'}]}})}),{platform:'claude',model:'model-c',effort:'high'});ui.done();
});

test('enter opens platform and catalog lists from both model and effort rows',async()=>{
 const ui=menuScript([
  ()=>0,
  (title,rows)=>{assert.equal(title,'Platform — Planner');assert.deepEqual(rows,['Claude','Codex','Gemini']);return 1;},
  (title,rows,options)=>{assert.match(bodyRows(options)[1],/\(reset\)/);assert.equal(options.selected,0);return 1;},
  (title,rows,options)=>{assert.equal(title,'Model — Planner');assert.deepEqual(rows,['model-a','model-b']);assert.match(options.info(editorState()).join(' '),/high, medium/);assert.equal(typeof options.onHorizontal,'function');return 1;},
  (title,rows)=>{assert.equal(title,'Effort — Planner');assert.deepEqual(rows,['low']);return 0;},
  (title,rows,options)=>{assert.equal(options.selected,1);assert.deepEqual(bodyRows(options).slice(1,3),['Model ‹ model-b ›','Effort ‹ low ›']);return 2;},
  (title)=>{assert.equal(title,'Model — Planner');return 0;},
  (title,rows)=>{assert.equal(title,'Effort — Planner');assert.deepEqual(rows,['high','medium']);return 1;},
  (title,rows,options)=>{assert.equal(options.selected,2);return 3;},
 ]);
 assert.deepEqual(await runRoleEditor(ui),{platform:'codex',model:'model-a',effort:'medium'});ui.done();
});

test('platform list keeps fixed order and rejects unavailable Enter while showing reason detail',async()=>{
 assert.equal(typeof roleEditor.selectPlatform,'function');
 const ui=menuScript([
  (title,rows,options)=>{
   assert.equal(title,'Platform — Planner');assert.deepEqual(rows,['Claude','Codex - Unavailable  (unauthorized)','Gemini']);assert.equal(options.backRow,true);assert.equal(options.selected,1);
   assert.deepEqual(options.info(editorState(1)),['Codex: unauthorized']);assert.deepEqual(options.info(editorState(0)),[]);assert.deepEqual(options.info(editorState(2)),[]);return 1;
  },
  (title,rows,options)=>{assert.equal(options.selected,1);return 0;},
 ]);
 assert.equal(await roleEditor.selectPlatform({ui,roleName:'Planner',current:'codex',availabilityOf:id=>id==='codex'?unauthorized:selectable}),'claude');ui.done();
});

test('platform list uses fake registry labels and order without moving available rows first',async()=>{
 assert.equal(typeof roleEditor.selectPlatform,'function');
 const registry=createTestRegistries(['eta','zeta','codex','claude']).platforms;
 const ui=menuScript([(title,rows,options)=>{
  assert.deepEqual(rows,['Claude - Unavailable  (unauthorized)','Codex','Zeta','Eta']);
  assert.equal(options.selected,2);return null;
 }]);
 assert.equal(await roleEditor.selectPlatform({ui,roleName:'QA',current:'zeta',availabilityOf:id=>id==='claude'?unauthorized:selectable,registry}),null);ui.done();
});

test('platform list truncates registry labels and reason detail on one line',async()=>{
 assert.equal(typeof roleEditor.selectPlatform,'function');
 const registry=diagramRegistry('가'.repeat(50)+'\nZeta');
 const ui=menuScript([(title,rows,options)=>{
  const state=editorState(0,30),info=options.info(state),body=options.renderBody(state);
  assert.equal(info.length,1);assert.match(info[0],/…$/);assert.ok(!info[0].includes('\n'));
  assert.equal(body.rows.length,3);assert.match(body.rows[1],/…$/);
  return null;
 }]);
 assert.equal(await roleEditor.selectPlatform({ui,roleName:'QA',current:'zeta',availabilityOf:()=>unauthorized,registry}),null);ui.done();
});

test('unavailable current platform permits model and effort editing except catalog_error',async()=>{
 const ui=menuScript([(title,rows,options)=>{
  assert.equal(bodyRows(options)[0],'Platform ‹ Codex - Unavailable (unauthorized) ›');
  options.onHorizontal({...editorState(1),direction:'right'});assert.equal(bodyRows(options)[1],'Model ‹ model-b ›');return 2;
 },(title)=>{assert.equal(title,'Model — Planner');return 0;},()=>1,()=>3]);
 assert.deepEqual(await runRoleEditor(ui,{current:{...editorCurrent,platform:'codex'},availabilityOf:()=>unauthorized}),{platform:'codex',model:'model-a',effort:'medium'});ui.done();
 const blocked=menuScript([(title,rows,options)=>{options.onHorizontal({...editorState(1),direction:'right'});options.onHorizontal({...editorState(2),direction:'right'});return 1;},()=>2,(title,rows,options)=>{assert.equal(bodyRows(options)[1],'Model ‹ model-a ›');assert.equal(bodyRows(options)[2],'Effort ‹ high ›');return 3;}]);
 assert.deepEqual(await runRoleEditor(blocked,{availabilityOf:()=>({selectable:false,reason:'catalog_error',warning:null}),loadCatalog:()=>assert.fail('catalog_error must not load')}),editorCurrent);blocked.done();
});

test('Back discards pending role edits and picker cancellation preserves field values',async()=>{
 const ui=menuScript([(title,rows,options)=>{options.onHorizontal({...editorState(1),direction:'right'});return 1;},()=>null,(title,rows,options)=>{assert.equal(bodyRows(options)[1],'Model ‹ model-b ›');return null;}]);
 assert.equal(await runRoleEditor(ui),null);assert.deepEqual(editorCurrent,{platform:'claude',model:'model-a',effort:'high'});ui.done();
});

test('narrow editor omits arrows and uses registry labels',async()=>{
 const ui=menuScript([(title,rows,options)=>{
  const narrow=bodyRows(options,0,39);assert.deepEqual(narrow,['Platform: Zeta custom','Model: model-a','Effort: high','Done','Back']);
  assert.equal(bodyRows(options,0,40)[0],'Platform ‹ Zeta custom ›');return null;
 }]);
 assert.equal(await runRoleEditor(ui,{registry:diagramRegistry('Zeta custom'),current:{...editorCurrent,platform:'zeta'}}),null);ui.done();
});

test('role editor updates rendered rows through the existing ui key contract',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs');
 const events=['right','down','right','down','right','down','enter'],screens=[];
 const session={viewport:()=>({columns:100,rows:30}),render:screen=>{screens.push(screen);return {selectionEnabled:true};},nextEvent:async()=>({name:events.shift()??'eof'})};
 assert.deepEqual(await runRoleEditor(createTuiInterface(session)),{platform:'codex',model:'model-b',effort:'low'});
 assert.ok(screens.some(screen=>screen.rows[0]==='Platform ‹ Codex ›'&&screen.rows[1]==='Model ‹ model-a › (reset)'));
 assert.equal(screens.at(-1).rows[2],'Effort ‹ low › (reset)');
});

for(const ending of ['escape','interrupt','eof','error'])test('role editor propagates '+ending+' through the terminal interface',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),before=structuredClone(editorCurrent),screens=[];
 const session={viewport:()=>({columns:100,rows:30}),render:screen=>{screens.push(screen);return{selectionEnabled:true};},nextEvent:async()=>ending==='error'?{name:'error',error:Error('terminal read failed')}:{name:ending}};
 await assert.rejects(runRoleEditor(createTuiInterface(session)),ending==='error'?/terminal read failed/:{code:ending==='escape'?'ARC_TUI_HOME':ending==='interrupt'?'ARC_CANCELLED':'ARC_TUI_EOF'});
 assert.deepEqual(editorCurrent,before);assert.match(screens[0].hint,/←\/→: Change/);
});
