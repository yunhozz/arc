import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as setup from '../../lib/tui/setup.mjs';
import {createTuiInterface} from '../../lib/tui/app.mjs';
import {renderScreen} from '../../lib/tui/render.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
const {initialSettings,setupOptions}=setup;
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
const modelText=Object.fromEntries(['codex','claude'].map(platform=>[platform,readFileSync(new URL('../../'+platform+'/skill/models.toml',import.meta.url),'utf8')]));
const models=Object.fromEntries(['codex','claude'].map(platform=>[platform,loadModelConfig(modelText[platform],platform)]));
const runSetup=options=>setup.runSetup({...options,loadPreviewConfig:options.loadPreviewConfig??(target=>models[target])});
const statuses=[{platform:'codex',settings:{language:'ko',limits:{max_total_subagents:20,max_concurrent_subagents:2},modelConfig:{...models.codex,preset:'smart'}}},{platform:'claude',settings:{language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5},modelConfig:models.claude}}];

test('preset role preview resolves every platform and preset without changing the source',()=>{
 assert.equal(typeof setup.presetRoleRows,'function');
 const names=['Scouter','Planner','Implementer','QA','Reviewer'];
 const expected={codex:{economy:[['gpt-6-luna','high'],['gpt-6.1-sol','medium'],['gpt-6.1-terra','medium'],['gpt-6-luna','high'],['gpt-6.1-sol','medium']],balanced:[['gpt-6-luna','high'],['gpt-6.1-sol','high'],['gpt-6.1-sol','medium'],['gpt-6-luna','max'],['gpt-6.1-sol','high']],smart:[['gpt-6-luna','max'],['gpt-6-astra','high'],['gpt-6-astra','high'],['gpt-6.1-sol','medium'],['gpt-6-astra','high']]},claude:{economy:[['haiku','high'],['sonnet','medium'],['sonnet','medium'],['haiku','high'],['sonnet','medium']],balanced:[['haiku','high'],['sonnet','high'],['sonnet','medium'],['haiku','max'],['sonnet','high']],smart:[['haiku','max'],['opus','high'],['opus','high'],['sonnet','medium'],['opus','high']]}};
 for(const platform of ['codex','claude']){const before=structuredClone(models[platform]);for(const preset of ['economy','balanced','smart'])assert.deepEqual(setup.presetRoleRows(models[platform],preset),expected[platform][preset].map(([model,effort],index)=>({role:names[index],model,effort})));assert.deepEqual(models[platform],before);}
});
test('preview source matches install package defaults and preset installed settings',()=>{
 assert.equal(typeof setup.loadPresetPreviewConfig,'function');
 for(const target of ['codex','claude']){const installed=structuredClone(models[target]);installed.roles.arc_planner.smart.model='custom-model';const statuses=[{platform:target,settings:{modelConfig:installed}}];const selected=setup.loadPresetPreviewConfig({context:{packageRoot},statuses,kind:'preset',target,readText:()=>assert.fail('preset must not read package defaults')});assert.equal(selected.roles.arc_planner.smart.model,'custom-model');const bundled=setup.loadPresetPreviewConfig({context:{packageRoot},statuses,kind:'install',target});assert.equal(bundled.roles.arc_planner.smart.model,target==='codex'?'gpt-6-astra':'opus');}
});
test('preview rejects missing invalid or mismatched configuration instead of fallback',()=>{
 assert.equal(typeof setup.loadPresetPreviewConfig,'function');
 const invoke=options=>setup.loadPresetPreviewConfig({context:{packageRoot},statuses:[],kind:'preset',target:'codex',...options});
 assert.throws(()=>invoke({}),/model config|configuration/i);
 assert.throws(()=>invoke({kind:'install',readText:()=> 'not = [valid'}),{code:'ARC_MODEL_VALIDATION'});
 for(const target of ['all','other',undefined])assert.throws(()=>invoke({target}),{code:'ARC_CLI_INPUT'});
 assert.throws(()=>invoke({statuses:[{platform:'codex',settings:{modelConfig:models.claude}}]}),{code:'ARC_MODEL_VALIDATION'});
});
test('Change Preset opens Performance preset immediately after the platform selection',async()=>{
 const screens=[],draft={};let prepares=0;
 const result=await runSetup({statuses,draft,kind:'preset',ui:{menu:async(title)=>{
  screens.push(title);
  if(title==='Change Preset')return 0;
  if(title==='Performance preset'){assert.equal(screens.at(-2),'Change Preset');return 2;}
  if(title==='Settings — codex')return screens.includes('Performance preset')?1:0;
  assert.fail(title);
 }},prepare:async options=>{prepares++;return options;}});
 assert.deepEqual(screens,['Change Preset','Performance preset','Settings — codex']);
 assert.equal(result.preset,'smart');assert.equal(prepares,1);
});
test('Back from the entry Performance preset returns to the platform chooser',async()=>{
 const screens=[];let targetVisits=0;
 await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async title=>{
  screens.push(title);
  if(title==='Change Preset')return targetVisits++===0?0:null;
  if(title==='Performance preset'||title==='Settings — codex')return null;
  assert.fail(title);
 }},prepare:async()=>assert.fail('Back cannot prepare')});
 assert.deepEqual(screens,['Change Preset','Performance preset','Change Preset']);
});
test('Back from a Performance preset opened in Settings returns to Settings',async()=>{
 const screens=[];let targetVisits=0,settingsVisits=0,presetVisits=0;
 await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async title=>{
  screens.push(title);
  if(title==='Change Preset')return targetVisits++===0?0:null;
  if(title==='Performance preset')return presetVisits++===0?2:null;
  if(title==='Settings — codex')return settingsVisits++===0?0:2;
  assert.fail(title);
 }},prepare:async()=>assert.fail('Back cannot prepare')});
 assert.deepEqual(screens,['Change Preset','Performance preset','Settings — codex','Performance preset','Settings — codex','Change Preset']);
});
for(const kind of ['install','preset'])for(const target of ['codex','claude'])test(kind+' '+target+' preview follows hover without changing draft before Enter and Apply',async()=>{
 const targetIndex=target==='codex'?0:1,answers=kind==='preset'?[targetIndex,2,1]:[targetIndex,0,2,5],draft={},views=[];let prepares=0,loads=0;
 const result=await runSetup({statuses,draft,kind,loadPreviewConfig:selected=>{assert.equal(selected,target);loads++;return models[target];},ui:{menu:async(title,rows,options)=>{if(title==='Performance preset'){assert.equal(typeof options.info,'function');assert.equal(options.selected,target==='codex'?2:1);const before=structuredClone(draft);for(const selected of [options.selected,0,1,2,3]){views.push(options.info({selected,columns:120,rows:30}));assert.deepEqual(draft,before);assert.equal(prepares,0);}assert.deepEqual(views.at(-1),views[0]);assert.match(views[1].join('\n'),/effort: medium/);assert.match(views[2].join('\n'),/effort: max/);assert.match(views[3].join('\n'),target==='codex'?/gpt-6-astra/:/opus/);assert.equal(options.backRow,true);}return answers.shift()??null;}},prepare:async settings=>{prepares++;return settings;}});
 assert.equal(loads,1);assert.equal(prepares,1);assert.equal(result.preset,'smart');assert.equal(result.target,target);assert.equal(draft[target==='codex'?'claude':'codex'].preset,target==='codex'?'balanced':'smart');
});
test('hovering another preset then Back leaves the current draft selection intact',async()=>{
 let targetVisits=0,previews=0;const draft={};
 await runSetup({statuses,draft,kind:'preset',ui:{menu:async(title,rows,options)=>{
  if(title==='Change Preset')return targetVisits++===0?0:null;
  if(title==='Performance preset'){
   assert.equal(typeof options.info,'function');const smart=options.info({selected:2,columns:80,rows:24});options.info({selected:0,columns:80,rows:24});assert.deepEqual(options.info({selected:3,columns:80,rows:24}),smart);previews++;return null;
  }
  if(title==='Settings — codex')return null;
  assert.fail(title);
 }},prepare:()=>assert.fail('Back cannot prepare')});
 assert.equal(previews,1);assert.equal(draft.codex.preset,'smart');
});

test('Performance preset uses a compact diagram when the full diagram does not fit',async()=>{
 let targetVisits=0,presetVisits=0;
 await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows,options)=>{
  if(title==='Change Preset')return targetVisits++===0?0:null;
  if(title==='Performance preset'){
   const preview=options.info({selected:0,columns:60,rows:18}).join('\n');
   assert.match(preview,/Scouter:/);assert.doesNotMatch(preview,/Orchestrator|[├└]─/);assert.match(preview,/Reviewer:/);assert.doesNotMatch(preview,/Diagram requires/);
   presetVisits++;return null;
  }
  if(title==='Settings — codex')return null;
  assert.fail(title);
 },page:async()=>assert.fail('unexpected page')},prepare:async()=>assert.fail('Back cannot prepare')});
 assert.equal(presetVisits,1);
});
test('preview retains long model values in compact rows and escapes terminal controls',()=>{
 const rows=setup.presetRoleRows(models.codex,'balanced'),longModel='custom-model-with-a-name-longer-than-the-box';rows[0].model=longModel;let preview=setup.presetPreviewRows(rows,{columns:200,rows:30});assert.ok(preview.join('\n').includes(longModel));assert.ok(preview.some(row=>row.includes('┌')));rows[0].model='unsafe\x1b[2Jmodel';preview=setup.presetPreviewRows(rows,{columns:200,rows:30});assert.ok(preview.join('\n').includes('unsafe\\x1b[2Jmodel'));for(const row of preview)assert.doesNotMatch(row,/[\p{Cc}\p{Cf}]/u);
});
test('compact preset preview shows all roles without hierarchy glyphs and keeps a blank row below',()=>{
 const roleRows=[{role:'Scouter',model:'scouter-model',effort:'high'},{role:'Planner',model:'planner-model',effort:'medium'},{role:'Implementer',model:'implementer-model',effort:'medium'},{role:'QA',model:'qa-model',effort:'high'},{role:'Reviewer',model:'reviewer-model',effort:'medium'}];
 assert.deepEqual(setup.presetPreviewRows(roleRows,{columns:60,rows:18,compact:true}),[
  'Scouter: scouter-model / high','Planner: planner-model / medium','Implementer: implementer-model / medium',
  'QA: qa-model / high','Reviewer: reviewer-model / medium','',
 ]);
});
test('install Apply alone prepares once with a display-only spacer and no review',async()=>{const answers=[0,0,2,1,1,4,5],screens=[];let prepares=0;const ui={menu:async(title,rows,options)=>{screens.push({title,rows,options});return answers.shift()??null;},review:async()=>assert.fail('install has no review')};const draft={};const prepared=await runSetup({ui,statuses:[],draft,kind:'install',prepare:async options=>{prepares++;return options;}});assert.equal(prepares,1);assert.equal(prepared.preset,'smart');assert.equal(prepared.language,'ko');assert.equal(prepared.skipGlobal,true);const screen=screens.filter(s=>s.title.startsWith('Settings')).at(-1);assert.deepEqual(screen.rows.slice(-2),['Apply','Back']);assert.equal(screen.options.separatorBefore,5);assert.equal(screen.rows.includes(''),false);});
test('preset chooser changes only draft, then focused Apply prepares exactly once preserving other settings',async()=>{const screens=[];let prepares=0;const draft={};const ui={menu:async(title,rows,options)=>{screens.push({title,rows,options});if(title==='Change Preset')return 0;if(title==='Performance preset'){assert.equal(prepares,0);return 2;}if(title==='Settings — codex')return 1;assert.fail(title);},review:async()=>assert.fail('preset has no review')};const prepared=await runSetup({ui,statuses,draft,kind:'preset',prepare:async options=>{prepares++;return options;}});assert.equal(prepares,1);assert.equal(prepared.preset,'smart');assert.equal(prepared.language,'ko');assert.equal(prepared.maxConcurrentSubagents,2);assert.equal(draft.claude.preset,'balanced');assert.deepEqual(screens.map(screen=>screen.title),['Change Preset','Performance preset','Settings — codex']);const settings=screens.filter(s=>s.title.startsWith('Settings'));for(const screen of settings){assert.deepEqual(screen.rows.slice(-2),['Apply','Back']);assert.equal(screen.options.separatorBefore,1);}assert.deepEqual(settings.map(screen=>screen.options.selected),[1]);});
test('preset selection and canceled chooser never prepare before explicit Apply',async()=>{let calls=0;const draft={};await runSetup({ui:{menu:async title=>{if(title==='Change Preset')return calls++===0?0:null;if(title==='Performance preset')return 2;if(title==='Settings — codex')return null;assert.fail(title);}},statuses:[],draft,kind:'preset',prepare:async()=>assert.fail('must not prepare')});assert.equal(draft.codex.preset,'smart');});
test('back from install settings retains edits and target without preparing',async()=>{const answers=[1,0,2,null,1,2,null,null],targets=[];const draft={};await runSetup({ui:{menu:async(title,rows,options)=>{if(title==='Install / Update')targets.push(options.selected);return answers.shift()??null;},text:async()=>null},statuses:[],draft,kind:'install',prepare:async()=>assert.fail('no Apply')});assert.deepEqual(targets,[0,1,1]);assert.equal(draft.claude.preset,'smart');assert.equal(draft.claude.maxTotalSubagents,100);});

test('input Save validates and stores before the outer Settings Apply prepares once',async()=>{const screens=[],answers=[0,2,5],values=['0','-1','１２','9007199254740992','42'],initials=[];let count=0;const draft={};const result=await runSetup({statuses,draft,kind:'install',ui:{menu:async(title,rows)=>{screens.push({title,rows});return answers.shift()??null;},text:async(title,initial)=>{initials.push(initial);return values.shift();},page:async()=>{}},prepare:async options=>{assert.ok(screens.filter(s=>s.title.startsWith('Settings')).length>=2);count++;return options;}});assert.equal(count,1);assert.equal(result.maxTotalSubagents,42);assert.equal(result.preset,'smart');assert.equal(result.language,'ko');assert.deepEqual(initials,['20','0','-1','１２','9007199254740992']);assert.ok(screens.some(s=>s.rows.includes('Preset: Smart')&&s.rows.includes('Harness language: KR')));assert.equal(draft.claude.maxTotalSubagents,100);});
test('input Back discards only unconfirmed text and Settings Back retains target and drafts',async()=>{const answers=[1,0,2,2,6,null],targets=[];const draft={};await runSetup({statuses:[],draft,kind:'install',ui:{menu:async(title,rows,options)=>{if(title==='Install / Update')targets.push(options.selected);return answers.shift()??null;},text:async()=>null},prepare:async()=>assert.fail('Back cannot prepare')});assert.deepEqual(targets,[0,1]);assert.equal(draft.claude.preset,'smart');assert.equal(draft.claude.maxTotalSubagents,100);});

test('all setup choosers request common Back while Settings keeps its explicit footer',async()=>{const answers=[0,0,null,1,null,6,null],screens=[],draft={};await runSetup({statuses,draft,kind:'install',ui:{menu:async(title,rows,options)=>{screens.push({title,rows,options});return answers.shift()??null;}},prepare:async()=>assert.fail('Back never prepares')});for(const screen of screens){if(screen.title.startsWith('Settings')){assert.equal(screen.options.backRow,undefined);assert.deepEqual(screen.rows.slice(-2),['Apply','Back']);assert.equal(screen.options.separatorBefore,5);}else{assert.equal(screen.options.backRow,true,screen.title);assert.ok(!screen.rows.includes('Back'));if(screen.title==='Install / Update')assert.deepEqual(screen.rows,['Codex','Claude']);}}assert.equal(draft.codex.preset,'smart');assert.equal(draft.codex.language,'ko');assert.equal(draft.claude.preset,'balanced');});

for(const kind of ['install','preset'])test(kind+' offers only independent platform targets and never merges drafts',async()=>{const screens=[],draft={};await runSetup({statuses,draft,kind,ui:{menu:async(title,rows)=>{screens.push({title,rows});return null;}},prepare:async()=>assert.fail('canceled target')});assert.deepEqual(screens[0].rows,['Codex','Claude']);assert.equal(draft.codex.language,'ko');assert.equal(draft.claude.language,'en');});

test('setup rejects all and unsupported targets without copying platform settings',()=>{const draft=initialSettings(statuses);for(const target of ['all','other','',undefined,null])assert.throws(()=>setupOptions(draft,target),{code:'ARC_CLI_INPUT'});assert.equal(draft.codex.language,'ko');assert.equal(draft.claude.language,'en');for(const target of ['codex','claude'])assert.equal(setupOptions(draft,target).target,target);});

for(const kind of ['install','preset'])test(kind+' Custom selection edits role pairs only after Enter and applies the draft',async()=>{
 const draft={}, screens=[];let loads=0, prepares=0, role=0;
 const catalog={platform:'codex',pairs:[{model:'fixture-model',effort:'high'}],unavailable:[]};
 const ui={menu:async(title,rows,options)=>{
  screens.push({title,rows});
  if(title==='Install / Update'||title==='Change Preset')return 0;
  if(title.startsWith('Settings'))return draft.codex.preset==='custom'?(kind==='install'?5:1):0;
  if(title==='Performance preset'){
   assert.deepEqual(rows,['Economy','Balanced','Smart','Custom']);
   options.info({selected:3,columns:80,rows:24});assert.equal(loads,0);assert.equal(prepares,0);
   return 3;
  }
  if(title==='Custom preset')return role<5?role++:5;
  if(title.startsWith('Select model')||title.startsWith('Select effort'))return 0;
  assert.fail('unexpected menu '+title);
 },page:async()=>{},busy:async action=>action()};
 const result=await runSetup({ui,statuses,draft,kind,loadCatalog:async platform=>{assert.equal(platform,'codex');loads++;return{status:'ready',catalog};},prepare:async options=>{prepares++;return options;}});
 assert.equal(loads,1);assert.equal(prepares,1);assert.equal(result.preset,'custom');
 for(const value of Object.values(result.customRoles))assert.deepEqual(value,{model:'fixture-model',model_reasoning_effort:'high'});
 assert.deepEqual(result.verifiedCatalog,catalog);assert.equal(draft.claude.preset,'balanced');
 assert.ok(screens.some(screen=>screen.title==='Custom preset'));
});

test('custom editor blocks missing pairs, preserves the input and discards canceled edits',async()=>{
 const custom=await import('../../lib/tui/custom-preset.mjs').catch(()=>({}));assert.equal(typeof custom.editCustomPreset,'function');
 const initial=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'old-alias',model_reasoning_effort:'high'}]));
 const before=structuredClone(initial),catalog={platform:'codex',pairs:[{model:'real-model',effort:'medium'}],unavailable:[]};let blocked=0;
 const answers=[5,0,0,null];
 const edited=await custom.editCustomPreset({config:models.codex,initialRoles:initial,catalog,ui:{menu:async()=>answers.shift()??null,page:async()=>{blocked++;}}});
 assert.equal(edited,null);assert.equal(blocked,1);assert.deepEqual(initial,before);
});

test('Codex custom catalog uses a projectless temporary directory and removes it',async()=>{
 const custom=await import('../../lib/tui/custom-preset.mjs').catch(()=>({}));assert.equal(typeof custom.loadCustomCatalog,'function');
 const fs=await import('node:fs/promises'),path=await import('node:path');let cwd;
 const result=await custom.loadCustomCatalog({platform:'codex',env:{},listCodexModels:async options=>{cwd=options.cwd;assert.ok(path.isAbsolute(cwd));assert.notEqual(cwd,process.cwd());assert.equal((await fs.stat(cwd)).isDirectory(),true);return[{model:'fixture-model',efforts:['high']}];}});
 assert.equal(result.status,'ready');assert.deepEqual(result.catalog.pairs,[{model:'fixture-model',effort:'high'}]);await assert.rejects(fs.stat(cwd),{code:'ENOENT'});
});

test('malformed ready catalog leaves built-in presets usable',async()=>{
 const answers=[0,3,0,0,1],draft={};let notices=0;
 const result=await runSetup({statuses,draft,kind:'preset',loadCatalog:async()=>({status:'ready',catalog:{platform:'codex',pairs:[{}]}}),ui:{busy:async action=>action(),menu:async(title)=>{assert.notEqual(title,'Custom preset');return answers.shift()??null;},page:async()=>{notices++;}},prepare:async options=>options});
 assert.equal(notices,1);assert.equal(result.preset,'economy');
});

test('custom draft survives built-in selection and canceled re-edit without changing source',async()=>{
 const draft={},original=structuredClone(models.codex),catalog={platform:'codex',pairs:[{model:'gpt-6-luna',effort:'max'},{model:'gpt-6-astra',effort:'high'},{model:'gpt-6.1-sol',effort:'medium'},{model:'fixture-model',effort:'high'}],unavailable:[]};
 let loads=0,presetChoice=0,editor=0,pair=0;
 const ui={busy:async action=>action(),page:async()=>assert.fail('all pairs should be available'),menu:async(title,rows)=>{
  if(title==='Change Preset')return 0;
  if(title.startsWith('Settings'))return presetChoice<4?0:1;
  if(title==='Performance preset')return [3,0,3,3][presetChoice++];
  if(title==='Custom preset'){
   editor++;
   if(editor===1)return 0;
   if(editor===2)return 5;
   if(editor===3){assert.match(rows[0],/fixture/);return 1;}
   if(editor===4)return null;
   if(editor===5){assert.match(rows[0],/fixture/);assert.match(rows[1],/gpt-6-astra/);return 5;}
  }
  if(title.startsWith('Select model')){pair++;return 3;}
  if(title.startsWith('Select effort'))return 0;
  assert.fail('unexpected '+title);
 }};
 const result=await runSetup({ui,statuses,draft,kind:'preset',loadCatalog:async()=>{loads++;return{status:'ready',catalog};},prepare:async options=>options});
 assert.equal(loads,1);assert.equal(pair,2);assert.equal(result.preset,'custom');assert.equal(result.customRoles.arc_scouter.model,'fixture-model');assert.equal(result.customRoles.arc_planner.model,'gpt-6-astra');assert.deepEqual(models.codex,original);assert.equal(draft.claude.preset,'balanced');
});

test('picker explains catalog models without effort capabilities',async()=>{
 const {editCustomPreset}=await import('../../lib/tui/custom-preset.mjs');
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'fixture-model',model_reasoning_effort:'high'}]));
 const catalog={platform:'codex',pairs:[{model:'fixture-model',effort:'high'}],unavailable:[{model:'unknown-model',reason:'Effort capability is unavailable.'}]};let call=0,notice='';
 await editCustomPreset({config:models.codex,initialRoles:roles,catalog,ui:{menu:async(title,rows)=>{call++;if(call===1)return 0;if(call===2){assert.ok(rows.some(row=>row.includes('Unavailable')));return 1;}return null;},page:async(_title,rows)=>{notice=rows.join(' ');}}});
 assert.match(notice,/unknown-model/);assert.match(notice,/Effort capability/);
});

test('Claude Custom pairs use Claude effort fields and preserve the Codex draft',async()=>{
 const draft={},catalog={platform:'claude',pairs:[{model:'claude-fixture',effort:'medium'}],unavailable:[]};let role=0;
 const result=await runSetup({statuses,draft,kind:'preset',loadCatalog:async platform=>{assert.equal(platform,'claude');return{status:'ready',catalog};},ui:{busy:async action=>action(),page:async()=>assert.fail('unexpected error'),menu:async(title)=>{
  if(title==='Change Preset')return 1;if(title.startsWith('Settings'))return draft.claude.preset==='custom'?1:0;
  if(title==='Performance preset')return 3;if(title==='Custom preset')return role<5?role++:5;if(title.startsWith('Select model')||title.startsWith('Select effort'))return 0;assert.fail(title);
 }},prepare:async options=>options});
 assert.equal(result.preset,'custom');for(const value of Object.values(result.customRoles))assert.deepEqual(value,{model:'claude-fixture',effort:'medium'});assert.equal(draft.codex.preset,'smart');
});

test('Codex lookup refuses a project directory without starting a child',async()=>{
 const {loadCustomCatalog}=await import('../../lib/tui/custom-preset.mjs');let calls=0;
 const result=await loadCustomCatalog({platform:'codex',env:{},tempDir:process.cwd(),listCodexModels:async()=>{calls++;return[];}});
 assert.equal(result.status,'unavailable');assert.equal(calls,0);
});

test('Claude malformed later pair is rejected before editor and built-ins remain usable',async()=>{
 const answers=[1,3,0,0,1],draft={};let notices=0;
 const result=await runSetup({statuses,draft,kind:'preset',loadCatalog:async()=>({status:'ready',catalog:{platform:'claude',pairs:[{model:'claude-good',effort:'high'},{model:'bad model',effort:'unknown'}]}}),ui:{busy:async action=>action(),menu:async(title)=>{assert.notEqual(title,'Custom preset');return answers.shift()??null;},page:async()=>{notices++;}},prepare:async options=>options});
 assert.equal(notices,1);assert.equal(result.preset,'economy');
});

test('applying an active saved Custom rechecks its catalog without entering editor',async()=>{
 const custom=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'saved-model',model_reasoning_effort:'high'}])),config={...structuredClone(models.codex),preset:'custom',custom},saved=[{platform:'codex',settings:{modelConfig:config}}],draft={};let loads=0;
 const result=await runSetup({statuses:saved,draft,kind:'preset',loadPreviewConfig:()=>config,loadCatalog:async()=>{loads++;return{status:'ready',catalog:{platform:'codex',pairs:[{model:'saved-model',effort:'high'}]}};},ui:{busy:async action=>action(),menu:async(title)=>title==='Change Preset'?0:title==='Performance preset'?null:1,page:async()=>assert.fail('unexpected error')},prepare:async options=>options});
 assert.equal(loads,1);assert.deepEqual(result.customRoles,custom);assert.equal(result.preset,'custom');
});

test('completed Custom draft accompanies a subsequent built-in Apply with its catalog',async()=>{
 const draft={},catalog={platform:'codex',pairs:[{model:'fixture-model',effort:'high'}]},answers=[0,3,0,0,1,0,2,0,3,0,4,0,5,0,0,0,1];let selections=0;
 const result=await runSetup({statuses,draft,kind:'preset',loadCatalog:async()=>({status:'ready',catalog}),ui:{busy:async action=>action(),page:async()=>assert.fail('unexpected error'),menu:async(title)=>{if(title==='Custom preset'&&selections++<5)return selections-1;if(title==='Custom preset')return 5;if(title.startsWith('Select model')||title.startsWith('Select effort'))return 0;if(title==='Change Preset')return 0;if(title.startsWith('Settings'))return selections>=6?(draft.codex.preset==='economy'?1:0):0;if(title==='Performance preset')return selections>=6?0:3;assert.fail(title);}},prepare:async options=>options});
 assert.equal(result.preset,'economy');assert.deepEqual(result.verifiedCatalog,catalog);assert.equal(result.customRoles.arc_scouter.model,'fixture-model');
});

test('Codex catalog resolves relative CODEX_HOME against invocation cwd',async()=>{
 const {loadCustomCatalog}=await import('../../lib/tui/custom-preset.mjs');const path=await import('node:path');let received;
 const result=await loadCustomCatalog({platform:'codex',env:{CODEX_HOME:'relative-codex'},invocationCwd:'/fixture/project',userHome:'/fixture/home',listCodexModels:async options=>{received=options;return[{model:'fixture-model',efforts:['high']}];}});
 assert.equal(result.status,'ready');assert.equal(received.env.CODEX_HOME,path.resolve('/fixture/project','relative-codex'));assert.notEqual(received.cwd,'/fixture/project');
});

test('built-in Apply does not load a catalog for an unchanged saved Custom',async()=>{
 const custom=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'stale-model',model_reasoning_effort:'high'}])),config={...structuredClone(models.codex),custom},draft={};
 const result=await runSetup({statuses:[{platform:'codex',settings:{modelConfig:config}}],draft,kind:'preset',loadPreviewConfig:()=>config,loadCatalog:async()=>assert.fail('unchanged inactive Custom must not load catalog'),ui:{menu:async(title)=>title==='Change Preset'?0:1},prepare:async options=>options});
 assert.equal(result.preset,'balanced');assert.equal(result.customRoles,undefined);assert.equal(result.verifiedCatalog,undefined);
});

test('built-in Install carries the saved inactive Custom without catalog access',async()=>{
 const custom=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'saved-model',model_reasoning_effort:'high'}])),config={...structuredClone(models.codex),custom},draft={};
 const result=await runSetup({statuses:[{platform:'codex',settings:{modelConfig:config}}],draft,kind:'install',loadCatalog:async()=>assert.fail('saved inactive Custom must not load catalog'),ui:{menu:async title=>title==='Install / Update'?0:5},prepare:async options=>options});
 assert.equal(result.preset,'balanced');assert.deepEqual(result.preservedCustomRoles,custom);assert.equal(result.verifiedCatalog,undefined);
});

test('long role values use a compact preview when the full diagram does not fit',()=>{
 const roles=setup.presetRoleRows(models.codex,'balanced');roles[0].model='a-very-long-model-identifier-that-must-remain-visible';
 const small=setup.presetPreviewRows(roles,{columns:80,rows:24,compact:true}).join('\n');assert.doesNotMatch(small,/requires.*columns/i);assert.match(small,/Scouter:/);assert.match(small,/Reviewer:/);assert.doesNotMatch(small,/Orchestrator|[├└]─/);assert.ok(small.includes('a-very-long-model-identifier-that-must-remain-visible'));
 const large=setup.presetPreviewRows(roles,{columns:200,rows:30}).join('\n');assert.match(large,/┌/);assert.match(large,/a-very-long-model-identifier-that-must-remain-visible/);
});

test('platform-labelled rows keep the diagram at 80x24 and the compact fallback format',()=>{
 const rows=['Scouter','Planner','Implementer','QA','Reviewer'].map((role,index)=>({role,platform:[1,4].includes(index)?'claude':'codex',model:index===1?'claude-sonnet-5-5':'gpt-6.1-terra',effort:'high'}));
 const wide=setup.presetPreviewRows(rows,{columns:80,rows:24,compact:true});
 assert.ok(wide.some(row=>row.includes('┌─')));assert.ok(wide.join('\n').includes('Orchestrator'));assert.match(wide.join('\n'),/┌─ Codex ─/);assert.match(wide.join('\n'),/┌─ Claude ─/);assert.ok(wide.every(row=>row.length<=77));
 const hidden=setup.presetPreviewRows(rows,{columns:80,rows:24,selectedRole:0,blink:false}).join('\n');assert.match(hidden,/Codex/);
 const narrow=setup.presetPreviewRows(rows,{columns:60,rows:24,compact:true}).join('\n');assert.match(narrow,/Scouter: Codex \/ gpt-6\.1-terra/);assert.doesNotMatch(narrow,/┌/);
});

async function openCompositeScreen(){
 const events=[{name:'down'},{name:'down'},{name:'enter'},...Array.from({length:8},()=>({name:'down'})),{name:'enter'},{name:'down'},{name:'enter'}],screens=[],catalogLoads=[],viewport={columns:200,rows:40};
 const session={viewport:()=>viewport,render:screen=>{const rendered=renderScreen(screen,viewport);screens.push({screen,rendered});return rendered;},nextEvent:async()=>events.shift()??{name:'eof'},setBusy(){},discardInput(){}};
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:role==='arc_planner'?'claude':'codex',model:role==='arc_planner'?'sonnet':'gpt-6-luna',effort:'high'}]));
 await runSetup({ui:createTuiInterface(session),statuses,draft:{},kind:'install',loadCatalog:async platform=>{catalogLoads.push(platform);return platform==='codex'?{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'}],unavailable:[]}}:{status:'unavailable',code:'missing_api_key'};},loadCompositeConfig:async()=>({version:1,revision:'fixture',roles}),prepare:async()=>assert.fail('Back must not apply')});
 return {screen:screens.find(({screen})=>screen.title==='Claude & Codex').screen,catalogLoads};
}

test('composite menu keeps Apply adjacent to Back',async()=>{
 const rows=(await openCompositeScreen()).screen.rows,apply=rows.lastIndexOf('Apply');
 assert.ok(apply>=0);assert.equal(rows[apply+1],'Back');
});

test('composite menu renders the Codex and Claude role diagram',async()=>{
 const {screen}=await openCompositeScreen(),rows=screen.rows.join('\n');
 assert.match(screen.rows[0],/^┌/);assert.doesNotMatch(rows,/(?:Codex|Claude): |Claude catalog:|Role execution:/);
 assert.match(rows,/┌/);assert.match(rows,/Orchestrator/);assert.match(rows,/┌─ Codex ─/);assert.match(rows,/gpt-6-luna/);assert.match(rows,/┌─ Claude ─/);assert.doesNotMatch(rows,/Codex \/ gpt-6-luna/);
});

test('composite mode accepts a manually entered Claude model when its API catalog is unavailable',async()=>{
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}])),catalogLoads=[];let compositeVisits=0;
 const prepared=await runSetup({statuses,draft:{},kind:'install',ui:{busy:action=>action(),menu:async(title,rows)=>{
  if(title==='Install / Update')return 2;
  if(title==='Claude & Codex')return compositeVisits++===0?0:rows.indexOf('Apply');
  if(title.startsWith('Platform —'))return 1;
  if(title.startsWith('Claude model —')){assert.deepEqual(rows,['Enter model manually']);return 0;}
  if(title.startsWith('Claude effort —'))return 2;
  assert.fail('Unexpected menu '+title);
 },text:async title=>{assert.equal(title,'Claude model identifier');return 'claude-sonnet-4-20250514';},page:async()=>assert.fail('manual Claude entry should remain available')},loadCatalog:async platform=>{catalogLoads.push(platform);return platform==='codex'?{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'}],unavailable:[]}}:{status:'unavailable',code:'missing_api_key'};},loadCompositeConfig:async()=>({version:1,revision:'fixture',roles}),prepare:async options=>options});
 assert.deepEqual(catalogLoads,['codex','claude']);assert.equal(prepared.target,'composite');assert.deepEqual(prepared.config.roles.arc_scouter,{platform:'claude',model:'claude-sonnet-4-20250514',effort:'high'});
});

for(const kind of ['install','preset'])test(`composite ${kind} starts with the requested platform roles and their preset values`,async()=>{
 const prepared=await runSetup({statuses,draft:{},kind,loadPreviewConfig:platform=>({...models[platform],preset:platform==='codex'?'economy':'smart'}),ui:{menu:async(title,rows)=>{if(title!=='Claude & Codex')return 2;assert.ok(rows.includes('Preset: Balanced'));assert.ok(!rows.some(row=>/^(Codex|Claude) preset:/.test(row)));return rows.indexOf('Apply');},page:async()=>assert.fail('preset values should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'},{model:'gpt-6.1-sol',effort:'medium'},{model:'gpt-6.1-terra',effort:'high'}]}},loadCompositeConfig:async()=>null,prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,{
  arc_scouter:{platform:'codex',model:'gpt-6-luna',effort:'high'},
  arc_planner:{platform:'claude',model:'sonnet',effort:'xhigh'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'medium'},
  arc_qa:{platform:'codex',model:'gpt-6.1-terra',effort:'high'},
  arc_reviewer:{platform:'claude',model:'sonnet',effort:'high'},
 });
});

for(const kind of ['install','preset'])for(const scenario of [
 {preset:'Economy',expected:{arc_scouter:{platform:'codex',model:'gpt-6-luna',effort:'medium'},arc_planner:{platform:'claude',model:'sonnet',effort:'high'},arc_implementer:{platform:'codex',model:'gpt-6.1-terra',effort:'medium'},arc_qa:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_reviewer:{platform:'claude',model:'sonnet',effort:'medium'}}},
 {preset:'Smart',expected:{arc_scouter:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},arc_planner:{platform:'claude',model:'opus',effort:'high'},arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},arc_qa:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},arc_reviewer:{platform:'claude',model:'sonnet',effort:'xhigh'}}},
])test(`composite ${kind} merges ${scenario.preset} across platforms without a Claude catalog`,async()=>{
 let visits=0;
 const prepared=await runSetup({statuses,draft:{},kind,ui:{menu:async(title,rows)=>{
  if(title===(kind==='install'?'Install / Update':'Change Preset'))return 2;
  if(title==='Claude & Codex'){
   assert.ok(!rows.some(row=>/^(Codex|Claude) preset:/.test(row)));const index=visits++===0?rows.findIndex(row=>row.startsWith('Preset:')):rows.indexOf('Apply');
   assert.ok(index>=0,'integrated preset must be selectable');return index;
  }
  if(title==='Preset'){assert.deepEqual(rows,['Economy','Balanced','Smart']);return rows.indexOf(scenario.preset);}
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('selected Codex pairs should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'medium'},{model:'gpt-6.1-terra',effort:'medium'},{model:'gpt-6-luna',effort:'high'},{model:'gpt-6.1-sol',effort:'high'}]}},loadCompositeConfig:async()=>null,prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,scenario.expected);
});

test('composite keeps existing role assignments and values when no preset is selected',async()=>{
 const roles={arc_scouter:{platform:'claude',model:'claude-manual',effort:'max'},arc_planner:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_implementer:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_qa:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_reviewer:{platform:'claude',model:'claude-other',effort:'low'}},before=structuredClone(roles);
 const prepared=await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows)=>title==='Claude & Codex'?rows.indexOf('Apply'):2,page:async()=>assert.fail('existing configuration should be valid')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'}]}},loadCompositeConfig:async()=>({version:1,revision:'existing',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,before);assert.deepEqual(roles,before);
});

test('composite legacy all-Codex values remain unchanged without a preset selection',async()=>{
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}])),before=structuredClone(roles);
 const prepared=await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows)=>title==='Claude & Codex'?rows.indexOf('Apply'):2,page:async()=>assert.fail('existing configuration should be valid')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'}]}},loadCompositeConfig:async()=>({version:1,revision:'legacy',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,before);assert.deepEqual(roles,before);
});

test('composite preset selection preserves an existing mixed platform assignment',async()=>{
 const roles={arc_scouter:{platform:'claude',model:'claude-manual',effort:'max'},arc_planner:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_implementer:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_qa:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_reviewer:{platform:'claude',model:'claude-other',effort:'low'}},before=structuredClone(roles);let visits=0;
 const prepared=await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows)=>{
  if(title==='Change Preset')return 2;
  if(title==='Claude & Codex'){assert.ok(rows.includes('Use default role mapping'));const index=visits++===0?rows.findIndex(row=>row.startsWith('Preset:')):rows.indexOf('Apply');assert.ok(index>=0);return index;}
  if(title==='Preset')return rows.indexOf('Smart');
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('selected Codex values should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-astra',effort:'high'},{model:'gpt-6.1-sol',effort:'high'}]}},loadCompositeConfig:async()=>({version:1,revision:'mixed',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,{
  arc_scouter:{platform:'claude',model:'sonnet',effort:'high'},
  arc_planner:{platform:'codex',model:'gpt-6-astra',effort:'high'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_qa:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_reviewer:{platform:'claude',model:'sonnet',effort:'xhigh'},
 });assert.deepEqual(roles,before);
});

for(const scenario of [
 {preset:'Smart',expected:{
  arc_scouter:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_planner:{platform:'codex',model:'gpt-6-astra',effort:'high'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_qa:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_reviewer:{platform:'codex',model:'gpt-6.1-sol',effort:'xhigh'},
 }},
 {preset:'Economy',expected:{
  arc_scouter:{platform:'codex',model:'gpt-6-luna',effort:'medium'},
  arc_planner:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-terra',effort:'medium'},
  arc_qa:{platform:'codex',model:'gpt-6-luna',effort:'high'},
  arc_reviewer:{platform:'codex',model:'gpt-6.1-sol',effort:'medium'},
 }},
])test(`composite legacy all-Codex mapping stays intact when ${scenario.preset} is selected`,async()=>{
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}])),before=structuredClone(roles);let visits=0;
 const prepared=await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows)=>{
  if(title==='Change Preset')return 2;
  if(title==='Claude & Codex'){const index=visits++===0?rows.findIndex(row=>row.startsWith('Preset:')):rows.indexOf('Apply');assert.ok(index>=0);return index;}
  if(title==='Preset')return rows.indexOf(scenario.preset);
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('merged Codex values should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'},{model:'gpt-6-luna',effort:'medium'},{model:'gpt-6.1-sol',effort:'medium'},{model:'gpt-6.1-sol',effort:'high'},{model:'gpt-6.1-sol',effort:'xhigh'},{model:'gpt-6-astra',effort:'high'},{model:'gpt-6.1-terra',effort:'medium'}]}},loadCompositeConfig:async()=>({version:1,revision:'legacy',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,scenario.expected);assert.deepEqual(roles,before);
});

test('composite explicitly restores the default role mapping using the selected integrated preset',async()=>{
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}])),before=structuredClone(roles);let visits=0;
 const prepared=await runSetup({statuses,draft:{},kind:'preset',loadPreviewConfig:platform=>platform==='codex'?{...models.codex,preset:'economy'}:models.claude,ui:{menu:async(title,rows)=>{
  if(title==='Change Preset')return 2;
  if(title==='Claude & Codex'){
   const step=visits++;
   if(step===0){const index=rows.findIndex(row=>row.startsWith('Preset:'));assert.ok(index>=0);return index;}
   if(step===1){assert.ok(rows.includes('Use default role mapping'));return rows.indexOf('Use default role mapping');}
   assert.ok(!rows.includes('Use default role mapping'));return rows.indexOf('Apply');
  }
  if(title==='Preset')return rows.indexOf('Smart');
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('merged Codex values should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6.1-sol',effort:'high'}]}},loadCompositeConfig:async()=>({version:1,revision:'legacy',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,{
  arc_scouter:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_planner:{platform:'claude',model:'opus',effort:'high'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_qa:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_reviewer:{platform:'claude',model:'sonnet',effort:'xhigh'},
 });assert.deepEqual(roles,before);
});

test('composite default role mapping uses Balanced when no integrated preset has been selected',async()=>{
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}]));let visits=0;
 const prepared=await runSetup({statuses,draft:{},kind:'preset',loadPreviewConfig:platform=>({...models[platform],preset:platform==='codex'?'economy':'smart'}),ui:{menu:async(title,rows)=>{
  if(title==='Change Preset')return 2;
  if(title==='Claude & Codex')return visits++===0?rows.indexOf('Use default role mapping'):rows.indexOf('Apply');
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('Balanced Codex values should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'},{model:'gpt-6-luna',effort:'medium'},{model:'gpt-6.1-sol',effort:'medium'},{model:'gpt-6.1-terra',effort:'high'},{model:'gpt-6.1-terra',effort:'medium'}]}},loadCompositeConfig:async()=>({version:1,revision:'legacy',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,{
  arc_scouter:{platform:'codex',model:'gpt-6-luna',effort:'high'},
  arc_planner:{platform:'claude',model:'sonnet',effort:'xhigh'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'medium'},
  arc_qa:{platform:'codex',model:'gpt-6.1-terra',effort:'high'},
  arc_reviewer:{platform:'claude',model:'sonnet',effort:'high'},
 });
});

test('composite default role mapping keeps the selected preset after a manual role edit',async()=>{
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}]));let visits=0;
 const prepared=await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows)=>{
  if(title==='Change Preset')return 2;
  if(title==='Claude & Codex'){
   const step=visits++;if(step===0){const index=rows.findIndex(row=>row.startsWith('Preset:'));assert.ok(index>=0);return index;}
   if(step===1)return 0;if(step===2)return rows.indexOf('Use default role mapping');return rows.indexOf('Apply');
  }
  if(title==='Preset')return rows.indexOf('Smart');
  if(title==='Platform — Scouter')return 0;
  if(title==='Codex model — Scouter')return rows.indexOf('gpt-6-luna');
  if(title==='Codex effort — Scouter')return rows.indexOf('high');
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('Smart Codex values should be available')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'},{model:'gpt-6.1-sol',effort:'high'},{model:'gpt-6.1-sol',effort:'xhigh'},{model:'gpt-6-astra',effort:'high'}]}},loadCompositeConfig:async()=>({version:1,revision:'legacy',roles}),prepare:async options=>options});
 assert.deepEqual(prepared.config.roles,{
  arc_scouter:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_planner:{platform:'claude',model:'opus',effort:'high'},
  arc_implementer:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_qa:{platform:'codex',model:'gpt-6.1-sol',effort:'high'},
  arc_reviewer:{platform:'claude',model:'sonnet',effort:'xhigh'},
 });
});

test('composite default mapping action and footer retain correct selection in wide and compact views',async()=>{
 const roles={arc_scouter:{platform:'claude',model:'claude-manual',effort:'max'},arc_planner:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_implementer:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_qa:{platform:'codex',model:'gpt-6-luna',effort:'high'},arc_reviewer:{platform:'claude',model:'claude-other',effort:'low'}};let targets=0,observed=false;
 await runSetup({statuses,draft:{},kind:'preset',ui:{menu:async(title,rows,options)=>{
  if(title==='Change Preset')return targets++===0?2:null;
  if(title==='Claude & Codex'){
   observed=true;assert.ok(rows.includes('Use default role mapping'));
   for(const viewport of [{columns:200,rows:40},{columns:40,rows:16}]){
    for(let selected=0;selected<=rows.length;selected++){
     const body=options.renderBody({selected,blink:true,...viewport}),rendered=renderScreen({title:'Claude & Codex',...body},viewport);
     assert.equal(rendered.selectionEnabled,true,JSON.stringify({viewport,selected,row:body.rows[body.selected]}));
     if(selected<5){const role=['Scouter','Planner','Implementer','QA','Reviewer'][selected];assert.match(body.rows[body.selected],new RegExp(viewport.columns===200?`> ${role}`:`^${role}:`));}
     else assert.equal(body.rows[body.selected],selected===rows.length?'Back':rows[selected]);
     const apply=body.rows.indexOf('Apply');assert.equal(body.rows[apply+1],'Back');
    }
   }
   return null;
  }
  assert.fail('Unexpected menu '+title);
 },page:async()=>assert.fail('catalog should be valid')},loadCatalog:async platform=>platform==='claude'?{status:'unavailable',code:'missing_api_key'}:{status:'ready',catalog:{platform:'codex',pairs:[{model:'gpt-6-luna',effort:'high'}]}},loadCompositeConfig:async()=>({version:1,revision:'mixed',roles}),prepare:async()=>assert.fail('Back must not apply')});
 assert.ok(observed);
});

test('composite custom preset preview keeps role values aligned when keys are reversed',()=>{
 const config={...structuredClone(models.claude),version:2,preset:'custom',custom:{
  arc_reviewer:{model:'reviewer-model',effort:'max'},
  arc_qa:{model:'qa-model',effort:'xhigh'},
  arc_implementer:{model:'implementer-model',effort:'high'},
  arc_planner:{model:'planner-model',effort:'medium'},
  arc_scouter:{model:'scouter-model',effort:'low'},
 }};
 assert.deepEqual(setup.presetRoleRows(config,'custom'),[
  {role:'Scouter',model:'scouter-model',effort:'low'},
  {role:'Planner',model:'planner-model',effort:'medium'},
  {role:'Implementer',model:'implementer-model',effort:'high'},
  {role:'QA',model:'qa-model',effort:'xhigh'},
  {role:'Reviewer',model:'reviewer-model',effort:'max'},
 ]);
});

test('composite mode shows Switch to Codex before the Codex flow and Back prepares nothing',async()=>{
 const screens=[];let visits=0;
 await runSetup({statuses,draft:{},kind:'install',loadInstallMode:()=> 'composite',ui:{menu:async(title,rows,options)=>{screens.push(title);if(title==='Install / Update')return visits++===0?0:null;if(title==='Switch to Codex'){assert.deepEqual(rows,['Continue']);assert.deepEqual(options.info,['Claude & Codex will be turned off.']);assert.equal(options.selected,1);return null;}assert.fail(title);}},prepare:async()=>assert.fail('Back cannot prepare')});
 assert.deepEqual(screens,['Install / Update','Switch to Codex','Install / Update']);
});
test('Continue on Switch to Codex prepares with switchFromComposite',async()=>{
 const result=await runSetup({statuses,draft:{},kind:'install',loadInstallMode:()=> 'composite',ui:{menu:async title=>{if(title==='Install / Update'||title==='Switch to Codex')return 0;if(title==='Settings — codex')return 5;assert.fail(title);}},prepare:async options=>options});assert.equal(result.switchFromComposite,true);
});
