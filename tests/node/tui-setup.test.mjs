import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as setup from '../../lib/tui/setup.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
const roles=['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'];
const names=['Scouter','Planner','Implementer','QA','Reviewer'];
const models=Object.fromEntries(['codex','claude'].map(p=>[p,loadModelConfig(readFileSync(new URL(`../../${p}/skill/models.toml`,import.meta.url)),p)]));
const catalogs=Object.fromEntries(await Promise.all(['codex','claude'].map(async p=>[p,(await loadStaticModelCatalog(p)).catalog])));
const statuses=['codex','claude'].map(platform=>({platform,state:'installed',settings:{language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5},modelConfig:models[platform]}}));
const runSetup=options=>setup.runSetup({statuses,draft:{},loadRoleDefaults:p=>structuredClone(models[p].roles),loadCatalog:async p=>({status:'ready',catalog:catalogs[p]}),loadInstallMode:()=> 'standalone',...options});
function scripted(steps,pages=[]){return {menu:async(title,rows,options)=>{const step=steps.shift();assert.ok(step,'unexpected '+title);assert.equal(title,step[0]);step[2]?.(rows,options);return step[1];},page:async(title,rows)=>pages.push({title,rows})};}

test('Install Codex opens the role editor right after the platform and Apply prepares once',async()=>{
 let calls=0;const steps=[['Install / Update',0],['Codex',6,rows=>{assert.equal(rows[5],'Settings');assert.equal(rows[6],'Apply');}]];
 const result=await runSetup({kind:'install',ui:scripted(steps),prepare:async o=>{calls++;return o;}});
 assert.equal(calls,1);assert.deepEqual(result.roles,models.codex.roles);assert.equal(result.target,'codex');assert.equal(steps.length,0);
});
test('Change Models editor has no Settings row',async()=>{
 const result=await runSetup({kind:'preset',ui:scripted([['Change Models',1],['Claude',5,rows=>assert.ok(!rows.includes('Settings'))]]),prepare:async o=>o});assert.deepEqual(result.roles,models.claude.roles);
});
test('Settings row opens Settings — Codex with Language, limits and Global config',async()=>{
 const pages=[],steps=[['Install / Update',0],['Codex',5],['Settings — Codex',0,rows=>assert.deepEqual(rows,['Language: EN','Total subagents: 100','Concurrent subagents: 5','Global config: On','Back'])],['Language',1,rows=>assert.deepEqual(rows,['EN','KR'])],['Settings — Codex',1],['Settings — Codex',2],['Settings — Codex',3],['Settings — Codex',null],['Codex',6]],ui=scripted(steps,pages),inputs=['0','-1','１２','9007199254740992','7','3'];
 ui.text=async(title)=>{assert.equal(title,inputs.length===1?'Concurrent subagents':'Total subagents');return inputs.shift();};
 const result=await runSetup({kind:'install',ui,prepare:async o=>o});assert.equal(result.language,'ko');assert.equal(result.maxTotalSubagents,7);assert.equal(result.maxConcurrentSubagents,3);assert.equal(result.skipGlobal,true);assert.equal(result.concurrentSelected,true);assert.deepEqual(pages,Array.from({length:4},()=>({title:'Invalid limit',rows:['Enter a positive whole number.']})));
});
test('composite editor lets every role pick Codex or Claude and lists only that catalog',async()=>{
 for(const platform of ['codex','claude']){
 const steps=[['Install / Update',2]];for(const [i,name] of names.entries())steps.push(['Claude & Codex',i],[`Platform — ${name}`,platform==='codex'?0:1,rows=>assert.deepEqual(rows,['Codex','Claude'])],[`Model — ${name}`,0,rows=>assert.deepEqual(rows,[...new Set(catalogs[platform].pairs.map(p=>p.model))])],[`Effort — ${name}`,0,rows=>assert.deepEqual(rows,[...new Set(catalogs[platform].pairs.filter(p=>p.model===catalogs[platform].pairs[0].model).map(p=>p.effort))])]);steps.push(['Claude & Codex',6]);
 const result=await runSetup({kind:'install',ui:scripted(steps),prepare:async o=>o});for(const role of roles)assert.deepEqual(result.config.roles[role],{platform,...catalogs[platform].pairs[0]});
 }
});
test('Back from Model returns to Platform in composite and to the editor in single mode',async()=>{
 for(const composite of [false,true]){
 const title=composite?'Claude & Codex':'Codex',steps=[['Install / Update',composite?2:0],[title,0]];
 if(composite)steps.push(['Platform — Scouter',0]);steps.push(['Model — Scouter',0],['Effort — Scouter',null],['Model — Scouter',null]);if(composite)steps.push(['Platform — Scouter',null]);steps.push([title,null],['Install / Update',null]);
 await runSetup({kind:'install',ui:scripted(steps),prepare:()=>assert.fail('Back prepares nothing')});assert.equal(steps.length,0);
 }
});
test('editor initial values follow the precedence table',async()=>{
 const installed=structuredClone(models.codex.roles);installed.arc_planner.model='installed-model';
 assert.deepEqual(setup.loadRoleDefaults({context:{packageRoot},statuses:[{platform:'codex',settings:{modelConfig:{platform:'codex',version:3,roles:installed}}}],target:'codex'}),installed);
 assert.deepEqual(setup.loadRoleDefaults({context:{packageRoot},statuses:[],target:'codex'}),models.codex.roles);
 const draft={codex:{...setup.initialSettings([]).codex,roles:structuredClone(models.codex.roles)}};draft.codex.roles.arc_planner.model='draft-model';
 await runSetup({kind:'install',draft,loadRoleDefaults:()=>assert.fail('draft wins'),ui:scripted([['Install / Update',0],['Codex',null,rows=>assert.ok(rows[1].includes('draft-model'))],['Install / Update',null]]),prepare:()=>assert.fail('Back')});
 const existing={version:1,revision:'existing',roles:Object.fromEntries(roles.map(r=>[r,{platform:'claude',model:'sonnet',effort:'high'}]))};
 const result=await runSetup({kind:'preset',loadCompositeConfig:()=>existing,ui:scripted([['Change Models',2],['Claude & Codex',5]]),prepare:async o=>o});assert.deepEqual(result.config.roles,existing.roles);
 const fallback=await runSetup({kind:'preset',ui:scripted([['Change Models',2],['Claude & Codex',5]]),prepare:async o=>o});assert.equal(fallback.config.roles.arc_planner.platform,'claude');assert.equal(fallback.config.roles.arc_scouter.platform,'codex');
});
test('missing pair blocks Apply with Unavailable selection',async()=>{
 const unavailable=structuredClone(models.codex.roles);unavailable.arc_qa.model='missing-model';const pages=[];
 await runSetup({kind:'preset',loadRoleDefaults:()=>unavailable,ui:scripted([['Change Models',0],['Codex',5,rows=>assert.match(rows[3],/ !/)],['Codex',null],['Change Models',null]],pages),prepare:()=>assert.fail('unavailable prepares nothing')});assert.deepEqual(pages,[{title:'Unavailable selection',rows:['Choose an available model for roles marked !.']}]);
});
test('catalog failure returns to the platform list after Catalog unavailable',async()=>{
 const pages=[];await runSetup({kind:'install',loadCatalog:()=>({status:'unavailable'}),ui:scripted([['Install / Update',0],['Install / Update',null]],pages),prepare:()=>assert.fail('catalog missing')});assert.deepEqual(pages,[{title:'Catalog unavailable',rows:['Codex model catalog is missing or invalid.']}]);
});
test('composite Install Settings apply to both plans',async()=>{
 const steps=[['Install / Update',2],['Claude & Codex',5],['Settings — Claude & Codex',0],['Language',1],['Settings — Claude & Codex',1],['Settings — Claude & Codex',2],['Settings — Claude & Codex',3],['Settings — Claude & Codex',null],['Claude & Codex',6]],ui=scripted(steps),values=['7','3'];ui.text=async()=>values.shift();const result=await runSetup({kind:'install',ui,prepare:async o=>o});assert.deepEqual(result.settings,{language:'ko',maxTotalSubagents:7,maxConcurrentSubagents:3,skipGlobal:true,concurrentSelected:true});
});
test('no preset strings remain in the TUI',()=>{
 for(const name of readdirSync(new URL('../../lib/tui/',import.meta.url)).filter(n=>n.endsWith('.mjs')))assert.doesNotMatch(readFileSync(new URL('../../lib/tui/'+name,import.meta.url),'utf8'),/Economy|Balanced|Smart|Custom preset|Performance preset|Preset:/);
});
test('composite mode shows Switch to Codex before the Codex flow and Back prepares nothing',async()=>{
 const steps=[['Install / Update',0],['Switch to Codex',null,(rows,options)=>{assert.deepEqual(rows,['Continue']);assert.deepEqual(options.info,['Claude & Codex will be turned off.']);assert.equal(options.selected,1);}],['Install / Update',null]];
 await runSetup({kind:'install',loadInstallMode:()=> 'composite',ui:scripted(steps),prepare:()=>assert.fail('Back cannot prepare')});assert.equal(steps.length,0);
});
test('Continue on Switch to Codex prepares with switchFromComposite',async()=>{
 const result=await runSetup({kind:'install',loadInstallMode:()=> 'composite',ui:scripted([['Install / Update',0],['Switch to Codex',0],['Codex',6]]),prepare:async o=>o});assert.equal(result.switchFromComposite,true);
});

test('preview retains long model values in compact rows and escapes terminal controls',()=>{
 const rows=Object.entries(models.codex.roles).map(([role,value],i)=>({role:names[i],model:value.model,effort:value.model_reasoning_effort})),longModel='custom-model-with-a-name-longer-than-the-box';rows[0].model=longModel;let preview=setup.presetPreviewRows(rows,{columns:200,rows:30});assert.ok(preview.join('\n').includes(longModel));assert.ok(preview.some(row=>row.includes('┌')));rows[0].model='unsafe\x1b[2Jmodel';preview=setup.presetPreviewRows(rows,{columns:200,rows:30});assert.ok(preview.join('\n').includes('unsafe\\x1b[2Jmodel'));for(const row of preview)assert.doesNotMatch(row,/[\p{Cc}\p{Cf}]/u);
});

test('compact preset preview shows all roles without hierarchy glyphs and keeps a blank row below',()=>{
 const roleRows=[{role:'Scouter',model:'scouter-model',effort:'high'},{role:'Planner',model:'planner-model',effort:'medium'},{role:'Implementer',model:'implementer-model',effort:'medium'},{role:'QA',model:'qa-model',effort:'high'},{role:'Reviewer',model:'reviewer-model',effort:'medium'}];
 assert.deepEqual(setup.presetPreviewRows(roleRows,{columns:60,rows:18,compact:true}),[
  'Scouter: scouter-model / high','Planner: planner-model / medium','Implementer: implementer-model / medium',
  'QA: qa-model / high','Reviewer: reviewer-model / medium','',
 ]);
});

test('role editor uses the static catalog without starting a model discovery child',async()=>{
 const {loadCustomCatalog}=await import('../../lib/tui/custom-preset.mjs');let calls=0;
 const result=await loadCustomCatalog({platform:'codex',tempDir:process.cwd(),listCodexModels:async()=>{calls++;assert.fail('static lookup must not invoke discovery');}});
 assert.equal(result.status,'ready');assert.deepEqual(result.catalog,catalogs.codex);assert.equal(calls,0);
});

test('picker explains catalog models without effort capabilities',async()=>{
 const {editPlatformRoles}=await import('../../lib/tui/custom-preset.mjs');
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{model:'fixture-model',model_reasoning_effort:'high'}]));
 const catalog={platform:'codex',pairs:[{model:'fixture-model',effort:'high'}],unavailable:[{model:'unknown-model',reason:'Effort capability is unavailable.'}]};let call=0,notice='';
 await editPlatformRoles({platform:'codex',title:'Codex',initialRoles:roles,catalog,ui:{menu:async(title,rows)=>{call++;if(call===1)return 0;if(call===2){assert.ok(rows.some(row=>row.includes('Unavailable')));return 1;}return null;},page:async(_title,rows)=>{notice=rows.join(' ');}}});
 assert.match(notice,/unknown-model/);assert.match(notice,/Effort capability/);
});


test('long role values use a compact preview when the full diagram does not fit',()=>{
 const roles=Object.entries(models.codex.roles).map(([role,value],i)=>({role:names[i],model:value.model,effort:value.model_reasoning_effort}));roles[0].model='a-very-long-model-identifier-that-must-remain-visible';
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


test('setup rejects unsupported targets and keeps platform settings independent',()=>{
 const settings=setup.initialSettings([{platform:'codex',settings:{language:'ko',limits:{max_total_subagents:20,max_concurrent_subagents:2}}}]);
 assert.deepEqual(settings.codex,{language:'ko',maxTotalSubagents:20,maxConcurrentSubagents:2,skipGlobal:false});
 assert.deepEqual(settings.claude,{language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5,skipGlobal:false});
 for(const target of ['all','other','',null,undefined])assert.throws(()=>setup.setupOptions(settings,target),{code:'ARC_CLI_INPUT'});
});
for(const platform of ['codex','claude'])test(platform+' rejects malformed later catalog pairs before opening the editor',async()=>{
 const pages=[],title='Install / Update';
 await runSetup({kind:'install',loadCatalog:()=>({status:'ready',catalog:{platform,pairs:[catalogs[platform].pairs[0],{model:'',effort:'unknown'}]}}),ui:scripted([[title,platform==='codex'?0:1],[title,null]],pages),prepare:()=>assert.fail('invalid catalog')});
 assert.deepEqual(pages,[{title:'Catalog unavailable',rows:[(platform==='codex'?'Codex':'Claude')+' model catalog is missing or invalid.']}]);
});

test('composite session draft precedes the saved routing configuration',async()=>{
 const saved=Object.fromEntries(roles.map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}]));
 const result=await runSetup({kind:'preset',draft:{composite:saved},loadCompositeConfig:()=>assert.fail('session draft must win'),ui:scripted([['Change Models',2],['Claude & Codex',5]]),prepare:async o=>o});assert.deepEqual(result.config.roles,saved);
});
for(const installed of ['codex','claude','none'])test('composite Settings initial values prefer '+installed,async()=>{
 const statuses=installed==='none'?[]:[{platform:'claude',state:'installed',settings:{language:'ko',limits:{max_total_subagents:7,max_concurrent_subagents:3}}},...(installed==='codex'?[{platform:'codex',state:'installed',settings:{language:'en',limits:{max_total_subagents:20,max_concurrent_subagents:2}}}]:[])];
 const expected=installed==='codex'?{language:'en',maxTotalSubagents:20,maxConcurrentSubagents:2,skipGlobal:false}:installed==='claude'?{language:'ko',maxTotalSubagents:7,maxConcurrentSubagents:3,skipGlobal:false}:{language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5,skipGlobal:false};
 const result=await runSetup({kind:'install',statuses,ui:scripted([['Install / Update',2],['Claude & Codex',6]]),prepare:async o=>o});assert.deepEqual(result.settings,expected);
});

// C1: dropping a chooser's Back connection must fail this full setup traversal.
for(const target of ['codex','claude','composite'])for(const kind of ['install','preset'])test(`QA C1 common Back across ${target} ${kind} setup choosers`,async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs');
 const title=target==='composite'?'Claude & Codex':target==='codex'?'Codex':'Claude',root=kind==='install'?'Install / Update':'Change Models';
 const steps=[[root,target==='composite'?2:target==='claude'?1:0],[title,0]];
 if(target==='composite')steps.push(['Platform — Scouter',1]);
 steps.push(['Model — Scouter',0],['Effort — Scouter',0]);
 if(kind==='install')steps.push([title,5],['Settings — '+title,0],['Language',null],['Settings — '+title,1],['Settings — '+title,2],['Settings — '+title,4]);
 steps.push([title,null],[root,null]);const ui=scripted(steps),visited=new Set(),menu=ui.menu;
 ui.menu=async(title,rows,options)=>{
  visited.add(title);
  if(title.startsWith('Settings — ')){
   assert.equal(options.backRow,undefined,'Settings owns its explicit footer');assert.equal(rows.at(-1),'Back');assert.equal(options.separatorBefore,4);
  }else{assert.equal(options.backRow,true,title);assert.ok(!rows.includes('Back'),title+' must use common Back');}
  return menu(title,rows,options);
 };
 ui.text=async(title,initial)=>{
  visited.add(title);const screens=[],events=[{name:'down'},{name:'enter'}];
  const real=createTuiInterface({viewport:()=>({columns:120,rows:40}),render:screen=>{screens.push(screen);return{selectionEnabled:true};},nextEvent:async()=>events.shift()});
  assert.equal(await real.text(title,initial),null);assert.deepEqual(screens[0].rows,[initial,'','Save','Back','']);assert.equal(screens.at(-1).rows[screens.at(-1).selected],'Back');return null;
 };
 await runSetup({kind,ui,prepare:()=>assert.fail('Back cannot prepare')});assert.equal(steps.length,0);
 for(const screen of [root,title,'Model — Scouter','Effort — Scouter',...(target==='composite'?['Platform — Scouter']:[]),...(kind==='install'?['Settings — '+title,'Language','Total subagents','Concurrent subagents']:[])])assert.ok(visited.has(screen),screen);
});

test('QA C2 input Back discards unconfirmed text while Settings Back retains target and role draft',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),draft={},before=structuredClone(models.claude),steps=[
  ['Install / Update',1],['Claude',0],['Model — Scouter',0],['Effort — Scouter',0],['Claude',5],['Settings — Claude',0],['Language',1],['Settings — Claude',1],['Settings — Claude',4],
  ['Claude',null,rows=>assert.match(rows[0],/fable \/ low/)],['Install / Update',1,(_rows,options)=>assert.equal(options.selected,1)],
  ['Claude',5,rows=>assert.match(rows[0],/fable \/ low/)],['Settings — Claude',4,rows=>{assert.equal(rows[0],'Language: KR');assert.equal(rows[1],'Total subagents: 100');}],['Claude',6]
 ],ui=scripted(steps);let inputs=0;
 ui.text=async(title,initial)=>{
  inputs++;assert.equal(title,'Total subagents');assert.equal(initial,'100');const screens=[],events=[{name:'text',text:'999'},{name:'down'},{name:'enter'}];
  const real=createTuiInterface({viewport:()=>({columns:120,rows:40}),render:screen=>{screens.push(screen);return{selectionEnabled:true};},nextEvent:async()=>events.shift()});
  const result=await real.text(title,initial);assert.equal(result,null);assert.equal(screens.at(-1).rows[0],'100999');return result;
 };
 const result=await runSetup({kind:'install',draft,ui,prepare:async o=>o});assert.equal(inputs,1);assert.equal(result.target,'claude');assert.equal(result.maxTotalSubagents,100);assert.equal(result.language,'ko');assert.deepEqual(result.roles.arc_scouter,{model:'fable',effort:'low'});assert.deepEqual(models.claude,before);assert.equal(steps.length,0);
});

test('QA C3 composite Claude edits keep Codex roles and both standalone drafts independent',async()=>{
 const draft={codex:{...setup.initialSettings(statuses).codex,roles:qaRoleValues('codex','draft')},claude:{...setup.initialSettings(statuses).claude,roles:qaRoleValues('claude','draft')},composite:Object.fromEntries(roles.map((role,i)=>[role,[1,4].includes(i)?{platform:'claude',model:'opus',effort:'high'}:{platform:'codex',model:'gpt-6-astra',effort:'xhigh'}]))},before=structuredClone(draft);
 const result=await runSetup({kind:'install',draft,ui:scripted([['Install / Update',2],['Claude & Codex',1],['Platform — Planner',1],['Model — Planner',0],['Effort — Planner',0],['Claude & Codex',6]]),prepare:async o=>o});
 assert.deepEqual(draft.codex,before.codex);assert.deepEqual(draft.claude,before.claude);assert.deepEqual(result.config.roles.arc_planner,{platform:'claude',model:'fable',effort:'low'});
 for(const role of ['arc_scouter','arc_implementer','arc_qa','arc_reviewer'])assert.deepEqual(result.config.roles[role],before.composite[role]);
 for(const role of roles)assert.deepEqual(Object.keys(result.config.roles[role]).sort(),['effort','model','platform']);
});
test('QA C3 standalone Claude and Codex edited role drafts use independent platform effort fields',async()=>{
 const draft={},before=structuredClone(models),steps=[['Install / Update',0],['Codex',0],['Model — Scouter',0],['Effort — Scouter',0],['Codex',5],['Settings — Codex',4],['Codex',null],['Install / Update',1],['Claude',0],['Model — Scouter',0],['Effort — Scouter',0],['Claude',5],['Settings — Claude',4],['Claude',6]];
 const result=await runSetup({kind:'install',draft,ui:scripted(steps),prepare:async o=>o});
 assert.deepEqual(draft.codex.roles.arc_scouter,{model:'gpt-6-astra',model_reasoning_effort:'low'});assert.deepEqual(draft.claude.roles.arc_scouter,{model:'fable',effort:'low'});assert.deepEqual(result.roles,draft.claude.roles);
 assert.notStrictEqual(draft.codex.roles,draft.claude.roles);assert.deepEqual(draft.codex.roles,{...before.codex.roles,arc_scouter:{model:'gpt-6-astra',model_reasoning_effort:'low'}});assert.deepEqual(draft.claude.roles,{...before.claude.roles,arc_scouter:{model:'fable',effort:'low'}});assert.deepEqual(models,before);assert.equal(steps.length,0);
});

function qaRoleValues(platform,source){
 const values=structuredClone(models[platform].roles);
 values.arc_scouter=platform==='codex'?source==='installed'?{model:'gpt-6-astra',model_reasoning_effort:'low'}:{model:'gpt-6.1-sol',model_reasoning_effort:'medium'}:source==='installed'?{model:'opus',effort:'low'}:{model:'fable',effort:'medium'};
 return values;
}
// E3: exercise the actual defaults loader, not a stub returning expected values.
for(const target of ['codex','claude'])for(const kind of ['install','preset'])for(const source of (kind==='install'?['draft','installed','package']:['draft','installed']))test(`QA E3 ${target} ${kind} initial roles prefer ${source}`,async()=>{
 const installed=qaRoleValues(target,'installed'),session=qaRoleValues(target,'draft'),saved=source==='package'?[]:[{platform:target,state:'installed',settings:{modelConfig:{platform:target,version:3,roles:installed}}}],draft=source==='draft'?{[target]:{...setup.initialSettings(saved)[target],roles:session}}:{},expected=source==='draft'?session:source==='installed'?installed:models[target].roles;
 const result=await runSetup({kind,statuses:saved,draft,loadRoleDefaults:p=>setup.loadRoleDefaults({context:{packageRoot},statuses:saved,target:p}),ui:scripted([[kind==='install'?'Install / Update':'Change Models',target==='codex'?0:1],[target==='codex'?'Codex':'Claude',kind==='install'?6:5]]),prepare:async o=>o});assert.deepEqual(result.roles,expected);
});
for(const source of ['draft','routing','installed','codex-only','claude-only','package'])test(`QA E3 composite initial roles prefer ${source} without borrowing standalone drafts`,async()=>{
 const saved=source==='package'?[]:['codex','claude'].filter(platform=>!source.endsWith('-only')||source===platform+'-only').map(platform=>({platform,state:'installed',settings:{modelConfig:{platform,version:3,roles:qaRoleValues(platform,'installed')}}}));
 const routing=Object.fromEntries(roles.map(role=>[role,{platform:'claude',model:'opus',effort:'high'}])),session=Object.fromEntries(roles.map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'medium'}]));
 const draft={codex:{...setup.initialSettings(saved).codex,roles:qaRoleValues('codex','draft')},claude:{...setup.initialSettings(saved).claude,roles:qaRoleValues('claude','draft')},...(source==='draft'?{composite:session}:{})};
 const result=await runSetup({kind:'preset',statuses:saved,draft,loadRoleDefaults:p=>setup.loadRoleDefaults({context:{packageRoot},statuses:saved,target:p}),loadCompositeConfig:()=>source==='draft'||source==='routing'?{version:1,revision:'qa-saved',roles:routing}:null,ui:scripted([['Change Models',2],['Claude & Codex',5]]),prepare:async o=>o});
 if(source==='draft'||source==='routing')assert.deepEqual(result.config.roles,source==='draft'?session:routing);
 else for(const [i,role] of roles.entries()){
  const platform=[1,4].includes(i)?'claude':'codex',value=(saved.some(status=>status.platform===platform)?qaRoleValues(platform,'installed'):models[platform].roles)[role];
  assert.deepEqual(result.config.roles[role],{platform,model:value.model,effort:value[platform==='codex'?'model_reasoning_effort':'effort']});
 }
});
for(const target of ['codex','claude'])for(const kind of ['install','preset'])test(`QA E3 composite switch to ${target} ${kind} starts from installed active roles`,async()=>{
 const installed=qaRoleValues(target,'installed'),saved=[{platform:target,state:'installed',settings:{modelConfig:{platform:target,version:3,roles:installed}}}],draft={[target]:{...setup.initialSettings(saved)[target],roles:qaRoleValues(target,'draft')},composite:Object.fromEntries(roles.map(role=>[role,{platform:'claude',model:'fable',effort:'low'}]))},title=target==='codex'?'Codex':'Claude';
 const result=await runSetup({kind,statuses:saved,draft,loadInstallMode:()=> 'composite',loadRoleDefaults:p=>setup.loadRoleDefaults({context:{packageRoot},statuses:saved,target:p}),ui:scripted([[kind==='install'?'Install / Update':'Change Models',target==='codex'?0:1],['Switch to '+title,0],[title,kind==='install'?6:5]]),prepare:async o=>o});
 assert.equal(result.switchFromComposite,true);assert.deepEqual(result.roles,installed);
});
