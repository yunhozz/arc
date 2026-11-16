import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as setup from '../../lib/tui/setup.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {migrationRegistries} from './fixtures/legacy-composite.mjs';
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
const roles=['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'];
const names=['Scouter','Planner','Implementer','QA','Reviewer'];
const models=Object.fromEntries(['codex','claude'].map(p=>[p,loadModelConfig(readFileSync(new URL(`../../${p}/skill/models.toml`,import.meta.url)),p)]));
const catalogs=Object.fromEntries(await Promise.all(['codex','claude'].map(async p=>[p,(await loadStaticModelCatalog(p)).catalog])));
const statuses=['codex','claude'].map(platform=>({platform,state:'installed',settings:{language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5},modelConfig:models[platform]}}));

function scripted(steps,pages=[]){return {menu:async(title,rows,options)=>{const step=steps.shift();assert.ok(step,'unexpected '+title);assert.equal(title,step[0]);step[2]?.(rows,options);return step[1];},page:async(title,rows)=>pages.push({title,rows})};}

test('legacy preview line appears once and Apply prepares the migration without confirmation',async()=>{
 const {platforms:registry}=migrationRegistries();
 const steps=[['Install / Update',7,(_rows,options)=>{
  assert.deepEqual(options.info,['Hosts: Claude, Codex','Mode:  Mixed (Claude + Codex)','Mixed routing files will move to the Claude home.']);
  const screen=options.renderBody({selected:7,columns:120,rows:40});
  assert.equal(screen.rows.filter(row=>row==='Mixed routing files will move to the Claude home.').length,1);
 }]];
 const result=await installFlow({registry,installState:{mode:'composite',platforms:['claude','codex'],anchor:'codex',legacyAnchor:true},currentConfig:{roles:installRoles('codex')},ui:scripted(steps)});
 assert.equal(result.target,'composite');assert.deepEqual(result.platforms,['claude','codex']);assert.equal(steps.length,0);
});

test('role editor uses the static catalog without starting a model discovery child',async()=>{
 const {loadCustomCatalog}=await import('../../lib/tui/custom-preset.mjs');let calls=0;
 const result=await loadCustomCatalog({platform:'codex',listCodexModels:async()=>{calls++;assert.fail('static lookup must not invoke discovery');}});
 assert.equal(result.status,'ready');assert.deepEqual(result.catalog,catalogs.codex);assert.equal(calls,0);
});
test('no preset strings remain in the TUI',()=>{
 for(const name of readdirSync(new URL('../../lib/tui/',import.meta.url)).filter(n=>n.endsWith('.mjs')))assert.doesNotMatch(readFileSync(new URL('../../lib/tui/'+name,import.meta.url),'utf8'),/Economy|Balanced|Smart|Custom preset|Performance preset|Preset:/);
});
test('picker explains catalog models without effort capabilities',async()=>{
 const {selectCatalogPair}=await import('../../lib/tui/custom-preset.mjs');let notice='',calls=0;
 const catalog={platform:'codex',pairs:[{model:'fixture-model',effort:'high'}],unavailable:[{model:'unknown-model',reason:'Effort capability is unavailable.'}]};
 await selectCatalogPair({roleName:'Scouter',current:{model:'fixture-model',effort:'high'},catalog,ui:{menu:async(_title,rows)=>{if(calls++===0){assert.ok(rows.some(row=>row.includes('Unavailable')));return 1;}return null;},page:async(_title,rows)=>{notice=rows.join(' ');}}});
 assert.match(notice,/unknown-model/);assert.match(notice,/Effort capability/);
});

for(const target of ['codex','claude'])for(const source of ['draft','installed','package'])test(`install ${target} initial roles prefer ${source}`,async()=>{
 const installed=structuredClone(models[target].roles);installed.arc_scouter.model=target==='codex'?'gpt-6-luna':'sonnet';
 const saved=source==='package'?[]:[{platform:target,state:'installed',settings:{modelConfig:{platform:target,version:3,roles:installed}}}];
 const draft=source==='draft'?installDraft(target):{};if(draft.roles)draft.roles.arc_scouter.model=target==='codex'?'gpt-6-astra':'fable';
 // An absent alternate platform keeps package fallback deterministic for both targets.
 const statuses=[...saved,...(source==='package'?[{platform:target,state:'absent',authentication:{authStatus:'authenticated'},cliVersion:{version:'1.0.0'}}]:[]),{platform:target==='codex'?'claude':'codex',state:'absent',authentication:{authStatus:'unauthorized'}}];
 const ui=scripted([['Install / Update',null,(_rows,options)=>{const text=installBody(options).rows.join('\n');assert.match(text,new RegExp(source==='draft'?draft.roles.arc_scouter.model:source==='installed'?installed.arc_scouter.model:models[target].roles.arc_scouter.model));}]]);
 await installFlow({statuses,draft,loadRoleDefaults:p=>setup.loadRoleDefaults({context:{packageRoot},statuses:saved,target:p}),ui});
});
test('session draft wins over current composite config and Back prepares nothing',async()=>{
 const draft=installDraft('codex',['codex','claude']),before=structuredClone(draft.roles);
 const result=await installFlow({draft,installState:{mode:'composite',platforms:['claude','codex'],anchor:'claude'},currentConfig:{roles:installRoles('claude')},loadRoleDefaults:()=>assert.fail('draft wins'),ui:scripted([['Install / Update',null]]),prepare:()=>assert.fail('Back must not prepare')});
 assert.equal(result,null);assert.deepEqual(draft.roles,before);
});
for(const platform of ['codex','claude'])test(platform+' malformed later catalog pair blocks Apply and caches failure',async()=>{
 let loads=0;const steps=[['Install / Update',7],['Install / Update',7],['Install / Update',null,(_rows,options)=>assert.match(installBody(options).rows.join('\n'),/catalog error/)]];
 await installFlow({draft:installDraft(platform),loadCatalog:()=>{loads++;return {status:'ready',catalog:{platform,pairs:[catalogs[platform].pairs[0],{model:'',effort:'unknown'}]}};},ui:scripted(steps),prepare:()=>assert.fail('invalid catalog cannot prepare')});assert.equal(loads,1);assert.equal(steps.length,0);
});
test('catalog exception keeps diagram and Back available without preparing',async()=>{
 const steps=[['Install / Update',7],['Install / Update',null,(_rows,options)=>assert.match(installBody(options).rows.join('\n'),/catalog error/)]];
 await installFlow({draft:installDraft('codex'),loadCatalog:()=>{throw Error('offline');},ui:scripted(steps),prepare:()=>assert.fail('catalog error cannot prepare')});assert.equal(steps.length,0);
});
test('Back traverses role, platform, model, effort, hosts and Settings without prepare',async()=>{
 const steps=[['Install / Update',0],['Scouter',0],['Platform — Scouter',null],['Scouter',1],['Model — Scouter',0],['Effort — Scouter',null],['Model — Scouter',null],['Scouter',null],['Install / Update',5],['Hosts — CLIs you will work in',null],['Install / Update',6],['Settings',0],['Settings',1],['Settings',2],['Settings',null],['Install / Update',null]],ui=scripted(steps);
 ui.text=async()=>null;
 await installFlow({ui,prepare:()=>assert.fail('Back cannot prepare')});assert.equal(steps.length,0);
});
test('Settings input Back discards unconfirmed text and keeps language and role draft',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),draft=installDraft('claude');draft.roles.arc_scouter={platform:'claude',model:'fable',effort:'low'};
 const steps=[['Install / Update',6],['Settings',0],['Settings',1],['Settings',null],['Install / Update',null]],ui=scripted(steps);
 ui.text=async(_title,initial)=>{const events=[{name:'text',text:'999'},{name:'down'},{name:'enter'}],screens=[];const result=await createTuiInterface({viewport:()=>({columns:120,rows:40}),render:s=>{screens.push(s);return{selectionEnabled:true};},nextEvent:async()=>events.shift()}).text('Total subagents',initial);assert.equal(screens.at(-1).rows[0],'100999');return result;};
 await installFlow({draft,ui,prepare:()=>assert.fail('Back cannot prepare')});assert.equal(draft.settings.language,'ko');assert.equal(draft.settings.maxTotalSubagents,100);assert.deepEqual(draft.roles.arc_scouter,{platform:'claude',model:'fable',effort:'low'});
});
test('Settings validates limits and composite Apply sends settings to S',async()=>{
 const steps=[['Install / Update',6],['Settings',0],['Settings',1],['Settings',2],['Settings',null],['Install / Update',7]],pages=[],ui=scripted(steps,pages),inputs=['0','-1','１２','9007199254740992','7','3'];ui.text=async()=>inputs.shift();
 const result=await installFlow({draft:installDraft('codex',['claude','codex']),ui});assert.equal(result.settings.language,'ko');assert.equal(result.settings.maxTotalSubagents,7);assert.equal(result.settings.maxConcurrentSubagents,3);assert.equal(result.settings.skipGlobal,false);assert.equal(result.settings.concurrentSelected,true);assert.deepEqual(pages,Array.from({length:4},()=>({title:'Invalid limit',rows:['Enter a positive whole number.']})));
});
test('editing one composite role preserves other roles and returns canonical fields',async()=>{
 const draft=installDraft('codex',['claude','codex']),before=structuredClone(draft.roles),steps=[['Install / Update',1],['Planner',0],['Platform — Planner',0],['Planner',1],['Model — Planner',0],['Effort — Planner',0],['Planner',3],['Install / Update',7]];
 const result=await installFlow({draft,ui:scripted(steps)});assert.deepEqual(result.config.roles.arc_planner,{platform:'claude',...catalogs.claude.pairs[0]});for(const role of roles.filter(r=>r!=='arc_planner'))assert.deepEqual(result.config.roles[role],before[role]);for(const role of roles)assert.deepEqual(Object.keys(result.config.roles[role]).sort(),['effort','model','platform']);
});
for(const platform of ['codex','claude'])test(platform+' edited role serializes its native effort field',async()=>{
 const steps=[['Install / Update',0],['Scouter',1],['Model — Scouter',0],['Effort — Scouter',0],['Scouter',3],['Install / Update',7]],before=structuredClone(models[platform]);
 const result=await installFlow({draft:installDraft(platform),ui:scripted(steps)});assert.deepEqual(result.roles.arc_scouter,{model:catalogs[platform].pairs[0].model,[platform==='codex'?'model_reasoning_effort':'effort']:catalogs[platform].pairs[0].effort});assert.deepEqual(models[platform],before);
});

// Task 15: missing diagram entry, wrong gates, or lost settings must fail these flows.
const installStatuses=statuses.map(status=>({...status,authentication:{authStatus:'authenticated'},cliVersion:{version:'1.0.0'}}));
const installRoles=platform=>Object.fromEntries(roles.map(role=>[role,{platform,model:models[platform].roles[role].model,effort:models[platform].roles[role][platform==='codex'?'model_reasoning_effort':'effort']} ]));
const installDraft=(platform='codex',hosts=[platform])=>({roles:installRoles(platform),hosts});
function installFlow(options){
 assert.equal(typeof setup.runInstallFlow,'function','Task 15 exports the install flow');
 return setup.runInstallFlow({statuses:installStatuses,draft:{},installState:{mode:'standalone',platforms:[]},loadRoleDefaults:p=>structuredClone(models[p].roles),loadCatalog:async p=>({status:'ready',catalog:catalogs[p]}),prepare:async options=>options,...options});
}
const installBody=(options,selected=7,columns=120,rows=40)=>options.renderBody({selected,columns,rows,blink:true});

test('diagram is the first screen',async()=>{
 const loaded=[],steps=[['Install / Update',null,(rows,options)=>{
  assert.deepEqual(rows,[...names,'Hosts','Settings','Apply']);assert.equal(options.backRow,true);assert.equal(options.refreshMs,600);
  const body=installBody(options,0);assert.match(body.rows.join('\n'),/┌─ Scouter/);assert.match(body.rows.join('\n'),/Orchestrator/);
  assert.ok(body.rows.includes('Hosts: Claude'));assert.ok(body.rows.includes('Mode:  Claude'));
 }]];
 assert.equal(await installFlow({ui:scripted(steps),loadCatalog:async p=>{loaded.push(p);return {status:'ready',catalog:catalogs[p]};}}),null);
 assert.deepEqual(loaded,['claude']);assert.equal(steps.length,0);
});

test('settings rows have no Global and skipGlobal is false',async()=>{
 const steps=[['Install / Update',6],['Settings',0,rows=>assert.deepEqual(rows,['Language              ‹EN›','Total subagents       100','Concurrent subagents  5','Back'])],['Settings',1],['Settings',2],['Settings',3],['Install / Update',7]],ui=scripted(steps),inputs=['0','7','3'],pages=[];
 ui.page=async(title,rows)=>pages.push({title,rows});ui.text=async()=>inputs.shift();
 const result=await installFlow({ui});assert.equal(result.skipGlobal,false);assert.equal(result.language,'ko');assert.equal(result.maxTotalSubagents,7);assert.equal(result.maxConcurrentSubagents,3);assert.equal(result.concurrentSelected,true);
 assert.deepEqual(pages,[{title:'Invalid limit',rows:['Enter a positive whole number.']}]);assert.equal(steps.length,0);
});

test('(mixed) field untouched is omitted, touched applies to S',async()=>{
 assert.equal(typeof setup.installSettingsDraft,'function');assert.equal(typeof setup.installPrepareOptions,'function');
 const saved=[installStatuses[0],{...installStatuses[1],settings:{language:'ko',limits:{max_total_subagents:20,max_concurrent_subagents:2}}}],settings=setup.installSettingsDraft(saved,['codex','claude']);
 assert.deepEqual([...settings.mixed],['language','maxTotalSubagents','maxConcurrentSubagents']);assert.equal(settings.touched.size,0);
 assert.deepEqual(setup.installSettingsDraft([],['codex']),{language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5,mixed:new Set(),touched:new Set()});
 const draft={...installDraft('codex',['codex','claude']),settings},plan={rule:'D1-c',platforms:['claude','codex'],anchor:'claude'};
 assert.deepEqual(setup.installPrepareOptions(plan,draft,catalogs).settings,{skipGlobal:false});
 const steps=[['Settings',0,(rows,options)=>{assert.match(rows[0],/\(mixed\)/);options.onHorizontal({selected:0,direction:'right'});}],['Settings',1],['Settings',2],['Settings',3]],ui=scripted(steps);let input=0;
 ui.text=async()=>['9','4'][input++];await setup.editInstallSettings({ui,settings});
 const options=setup.installPrepareOptions(plan,draft,catalogs);assert.deepEqual(options.settings,{skipGlobal:false,language:'en',maxTotalSubagents:9,maxConcurrentSubagents:4,concurrentSelected:true});assert.deepEqual(options.platforms,['claude','codex']);
 for(const rule of ['D1-c','D1-d','D1-e']){const value=setup.installPrepareOptions({...plan,rule},draft,catalogs);assert.equal(value.target,'composite');assert.equal(value.config.version,2);assert.deepEqual(value.config.roles,draft.roles);assert.ok(value.config.revision);}
 const single=setup.installPrepareOptions({rule:'D1-b',platforms:['codex'],anchor:'codex'},draft,catalogs);assert.equal(single.switchFromComposite,true);assert.deepEqual(single.roles,models.codex.roles);assert.strictEqual(single.verifiedCatalog,catalogs.codex);assert.equal(single.skipGlobal,false);
});

test('hosts lock role platforms and preview Mode',async()=>{
 const steps=[['Install / Update',5],['Hosts — CLIs you will work in',1,(rows)=>{assert.equal(rows[0],'[ ] Claude');assert.equal(rows[1],'[x] Codex          (used by roles)');}],['Hosts — CLIs you will work in',0,rows=>assert.match(rows[1],/^\[x\]/)],['Hosts — CLIs you will work in',2],['Install / Update',7,(_rows,options)=>{assert.deepEqual(options.info,['Hosts: Claude, Codex','Mode:  Mixed (Claude + Codex)']);}]];
 const result=await installFlow({draft:installDraft(),ui:scripted(steps)});assert.deepEqual(result.platforms,['claude','codex']);assert.equal(result.target,'composite');assert.equal(result.settings.skipGlobal,false);assert.deepEqual(result.config.roles,installRoles('codex'));assert.equal(steps.length,0);
});

test('D1-b asks confirmation; Back sends nothing',async()=>{
 let calls=0;const steps=[['Install / Update',7],['Switch to Codex',null,(rows,options)=>{assert.deepEqual([...rows,...(options.backRow?['Back']:[])],['Continue','Back']);assert.deepEqual(options.info,['Mixed routing will be turned off.']);}],['Install / Update',null]];
 assert.equal(await installFlow({draft:installDraft('codex',[]),installState:{mode:'composite',platforms:['claude','codex']},ui:scripted(steps),prepare:async()=>{calls++;}}),null);assert.equal(calls,0);assert.equal(steps.length,0);
 const result=await installFlow({draft:installDraft('codex',[]),installState:{mode:'composite',platforms:['claude','codex']},ui:scripted([['Install / Update',7],['Switch to Codex',0]])});assert.equal(result.switchFromComposite,true);
});

test('D1-f shows Operation unavailable',async()=>{
 const pages=[],steps=[['Install / Update',7,(_rows,options)=>assert.ok(options.info.includes('Mode:  Unverified'))],['Install / Update',null]];
 await installFlow({installState:{mode:'unverified',platforms:[],residualPaths:['/fixture/routing.json']},ui:scripted(steps,pages),prepare:()=>assert.fail('D1-f must not prepare')});
 assert.deepEqual(pages,[{title:'Operation unavailable',rows:['Mixed routing configuration cannot be verified.','Residual path: /fixture/routing.json','No changes were applied.']}]);
});

test('catalog failure outside S does not block Apply; inside S blocks with catalog error',async()=>{
 for(const inside of [false,true]){
  const loads=[],pages=[],steps=[['Install / Update',0],['Scouter',3,(_rows,options)=>{options.onHorizontal({selected:0,direction:'left'});const body=options.renderBody({selected:0,columns:120,rows:40});assert.match(body.rows[0],/Codex/);}],['Install / Update',0],['Scouter',3],['Install / Update',7,(_rows,options)=>{const body=installBody(options);assert.equal(body.rows.some(row=>row.includes('catalog error')),inside);}]];
  if(inside)steps.push(['Install / Update',null,(_rows,options)=>{const body=installBody(options);assert.match(body.rows[body.selected],/Unavailable \(catalog error\)/);}]);
  const result=await installFlow({draft:installDraft('codex',inside?['codex','claude']:['codex']),ui:scripted(steps,pages),loadCatalog:async p=>{loads.push(p);if(p==='claude')throw Error('offline');return {status:'ready',catalog:catalogs[p]};},prepare:async options=>{assert.equal(inside,false);return options;}});
  assert.equal(result?.target??null,inside?null:'codex');assert.deepEqual(loads.sort(),['claude','codex']);assert.deepEqual(pages,[]);assert.equal(steps.length,0);
 }
});

test('initial platform is Claude when both standalone',async()=>{
 const result=await installFlow({ui:scripted([['Install / Update',7]])});assert.equal(result.target,'claude');assert.deepEqual(result.roles,models.claude.roles);assert.equal(result.switchFromComposite,undefined);
});

test('compact layout keeps Hosts/Mode/controls',async()=>{
 await installFlow({ui:scripted([['Install / Update',null,(_rows,options)=>{
  for(const [columns,rows] of [[40,16],[60,20],[80,23]]){
   const body=installBody(options,7,columns,rows);assert.match(body.rows[0],/^Scouter: Claude \/ /);assert.ok(body.rows.includes('Hosts: Claude'));assert.ok(body.rows.includes('Mode:  Claude'));assert.deepEqual(body.rows.slice(-4),['Hosts','Settings','Apply','Back']);assert.equal(body.rows[body.selected],'Apply');assert.ok(body.rows.length+5<=rows);
  }
  const guard=installBody(options,0,39,16);assert.match(guard.rows.join(' '),/40.*16/);
 }]])});
});

test('install hosts use injected registry labels, order and reason detail',async()=>{
 assert.equal(typeof setup.editHosts,'function');const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries(['codex','claude','zeta','eta']);
 const hosts=['eta'],steps=[['Hosts — CLIs you will work in',3,(rows,options)=>{assert.deepEqual(rows.slice(0,4),['[ ] Claude','[x] Codex          (used by roles)','[ ] Zeta','[x] Eta - Unavailable  (capability not verified)']);assert.deepEqual(options.info({selected:3,columns:120,rows:40}),['Eta: capability not verified']);}],['Hosts — CLIs you will work in',3,rows=>assert.match(rows[3],/^\[ \]/)],['Hosts — CLIs you will work in',2,rows=>assert.match(rows[3],/^\[ \]/)],['Hosts — CLIs you will work in',4]];
 const result=await setup.editHosts({ui:scripted(steps),hosts,rolePlatforms:['codex'],availabilityOf:id=>({selectable:id!=='eta',reason:id==='eta'?'capability_not_verified':null}),registry});assert.deepEqual(result,['codex','zeta']);assert.deepEqual(hosts,['eta']);assert.equal(steps.length,0);
 assert.deepEqual(await setup.editHosts({ui:scripted([['Hosts — CLIs you will work in',4]]),hosts:[],rolePlatforms:[],availabilityOf:()=>({selectable:true}),registry}),[]);
 assert.equal(await setup.editHosts({ui:scripted([['Hosts — CLIs you will work in',0],['Hosts — CLIs you will work in',null]]),hosts:[],rolePlatforms:[],availabilityOf:()=>({selectable:true}),registry}),null);
});

test('initial composite roles and hosts come from currentConfig and D1-e prepares without confirmation',async()=>{
 const currentConfig={version:2,revision:'saved',platforms:['claude','codex'],roles:installRoles('claude')},steps=[['Install / Update',5,(_rows,options)=>assert.ok(options.info.includes('Hosts: Claude, Codex'))],['Hosts — CLIs you will work in',1],['Hosts — CLIs you will work in',2],['Install / Update',7],['Switch to Claude',0]];
 const result=await installFlow({currentConfig,installState:{mode:'composite',platforms:['claude','codex']},ui:scripted(steps)});assert.equal(result.target,'claude');assert.equal(result.switchFromComposite,true);assert.deepEqual(currentConfig.roles,installRoles('claude'));
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries();
 const changed=await installFlow({draft:installDraft('codex',['codex','claude']),registry,installState:{mode:'composite',platforms:['codex','zeta']},ui:scripted([['Install / Update',7]])});assert.equal(changed.target,'composite');assert.deepEqual(changed.platforms,['claude','codex']);
});

test('uninstalled initial platform uses role availability then display order fallback',async()=>{
 for(const unavailable of [false,true]){
  const saved=installStatuses.map(status=>({...status,state:'absent',authentication:{authStatus:unavailable||status.platform==='claude'?'unauthorized':'authenticated'}}));
  const result=await installFlow({statuses:saved,ui:scripted([['Install / Update',7]])});assert.equal(result.target,unavailable?'claude':'codex');
 }
});

test('role editor Done updates the diagram draft and standalone prepare roles',async()=>{
 const draft=installDraft('claude'),steps=[['Install / Update',0],['Scouter',3,(_rows,options)=>options.onHorizontal({selected:1,direction:'right'})],['Install / Update',7,(_rows,options)=>assert.match(installBody(options).rows.join('\n'),/claude-fable-5-1/)] ];
 const result=await installFlow({draft,ui:scripted(steps)});assert.equal(result.roles.arc_scouter.model,'claude-fable-5-1');assert.equal(draft.roles.arc_scouter.model,'claude-fable-5-1');assert.deepEqual(result.roles.arc_planner,models.claude.roles.arc_planner);
});

test('composite gates distinguish role and host usage and standalone ignores authentication',async()=>{
 for(const hostOnly of [false,true]){
  const saved=installStatuses.map(status=>status.platform==='claude'?{...status,authentication:{authStatus:'unauthorized',reason:'fixture denial'}}:status),draft=installDraft('codex',['codex','claude']);
  if(!hostOnly)draft.roles.arc_reviewer={...installRoles('claude').arc_reviewer};
  const steps=[['Install / Update',7,(_rows,options)=>{assert.ok(options.info.includes(`! ${hostOnly?'Hosts':'Reviewer'}: Claude - Unavailable (unauthorized)`));const body=installBody(options,4,40,16);assert.equal(body.rows[4].startsWith('Reviewer !:'),!hostOnly);assert.ok(body.rows.includes('Back'));}],['Install / Update',null,(_rows,options)=>{const body=installBody(options);assert.match(body.rows[body.selected],/unauthorized/);}]];
  await installFlow({statuses:saved,draft,ui:scripted(steps),prepare:()=>assert.fail('unavailable composite cannot prepare')});
 }
 const saved=installStatuses.map(status=>({...status,authentication:{authStatus:'unauthorized',reason:'cli_not_found'}}));
 const result=await installFlow({statuses:saved,draft:installDraft(),ui:scripted([['Install / Update',7]])});assert.equal(result.target,'codex');
});

test('injected third host produces a version 2 routing config and registry labels',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries(),draft=installDraft('codex',['zeta','claude','codex']);
 const result=await installFlow({draft,registry,statuses:[...installStatuses,{platform:'zeta',state:'absent',authentication:{authStatus:'unknown'}}],loadCatalog:async p=>({status:'ready',catalog:p==='zeta'?{platform:'zeta',pairs:[{model:'opus',effort:'high'}]}:catalogs[p]}),ui:scripted([['Install / Update',7,(_rows,options)=>assert.deepEqual(options.info,['Hosts: Claude, Codex, Zeta','Mode:  Mixed (Claude + Codex + Zeta)','Zeta: auth unverified'])]])});
 assert.deepEqual(result.platforms,['claude','codex','zeta']);assert.equal(result.config.version,2);assert.deepEqual(result.config.platforms,['claude','codex','zeta']);assert.equal(result.settings.skipGlobal,false);
});

test('compact blocked screen keeps Back selectable through the real UI',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const events=[...Array.from({length:8},()=>({name:'down'})),{name:'enter'}],screens=[],viewport={columns:40,rows:16};
 const ui=createTuiInterface({viewport:()=>viewport,render:screen=>{const rendered=renderScreen(screen,viewport);screens.push({screen,rendered});return rendered;},nextEvent:async()=>events.shift()??{name:'eof'}});
 const result=await installFlow({draft:installDraft('codex',['codex','claude']),loadCatalog:async p=>p==='claude'?{status:'catalog_error'}:{status:'ready',catalog:catalogs[p]},ui,prepare:()=>assert.fail('Back cannot prepare')});
 assert.equal(result,null);assert.equal(screens.at(-1).screen.rows.at(-1),'Back');assert.equal(screens.at(-1).rendered.selectionEnabled,true);assert.ok(screens.at(-1).rendered.text.includes('Mode:  Mixed (Claude + Codex)'));
});
