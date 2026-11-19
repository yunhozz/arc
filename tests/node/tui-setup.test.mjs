import {grokOffRegistries} from './fixtures/platforms/grok-off.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectStatus} from '../../lib/management/status.mjs';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
import * as setup from '../../lib/tui/setup.mjs';
import {cellWidth,wrapDetailRows} from '../../lib/tui/render.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {migrationRegistries} from './fixtures/legacy-composite.mjs';
const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
const roles=['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'];
const names=['Scouter','Planner','Implementer','QA','Reviewer'];
const models=Object.fromEntries(['codex','claude'].map(p=>[p,loadModelConfig(readFileSync(new URL(`../../${p}/skill/models.toml`,import.meta.url)),p)]));
const catalogs=Object.fromEntries(await Promise.all(['codex','claude'].map(async p=>[p,(await loadStaticModelCatalog(p)).catalog])));
const statuses=['codex','claude'].map(platform=>({platform,state:'installed',settings:{language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5},modelConfig:models[platform]}}));

test('Grok Hosts and platform chooser are unavailable and role editor arrows skip Grok',async()=>{
 const {platforms:registry}=grokOffRegistries();assert.ok(registry.getPlatform('grok'),'Grok descriptor is required');
 const {platformAvailability}=await import('../../lib/platforms/availability.mjs');
 const {editRole,selectPlatform}=await import('../../lib/tui/custom-preset.mjs');
 const availabilityOf=id=>platformAvailability(id,{registry,usage:'role',status:{platform:id,state:'installed',authentication:{authStatus:'authenticated'},cliVersion:{version:'0.68.0'}}});
 let calls=0;assert.deepEqual(await setup.editHosts({registry,hosts:[],rolePlatforms:[],availabilityOf,ui:{menu:async(_title,rows)=>{assert.match(rows[3],/^\[-\] Grok +- Unavailable  \(capability not verified\)$/);return calls++===0?3:4;}}}),[]);assert.equal(calls,2);
 calls=0;assert.equal(await selectPlatform({registry,roleName:'Planner',current:'codex',availabilityOf,ui:{menu:async(_title,rows)=>{assert.equal(rows[3],'Grok - Unavailable  (capability not verified)');return calls++===0?3:null;}}}),null);assert.equal(calls,2);
 const value=await editRole({registry,roleName:'Planner',current:{platform:'gemini',model:'gemini-model',effort:'default'},availabilityOf,loadCatalog:async()=>({pairs:[{model:'model',effort:'default'}]}),defaultsFor:async()=>({model:'model',effort:'default'}),ui:{menu:async(_title,_rows,options)=>{options.onHorizontal({selected:0,direction:'right',columns:120,rows:40});assert.equal(options.renderBody({selected:0,columns:120,rows:40}).rows[0],'Platform < Claude >');return 3;}}});assert.equal(value.platform,'claude');
});

function scripted(steps,pages=[]){return {menu:async(title,rows,options)=>{const step=steps.shift();assert.ok(step,'unexpected '+title);assert.equal(title,step[0]);step[2]?.(rows,options);return step[1];},page:async(title,rows)=>pages.push({title,rows})};}

test('legacy preview line appears once and Apply prepares the migration without confirmation',async()=>{
 const {platforms:registry}=migrationRegistries();
 const steps=[['Configure',10,(_rows,options)=>{
  assert.deepEqual(options.notice,['Mixed routing files will move to the Claude home.']);
  const screen=options.renderBody({selected:10,columns:120,rows:40});
  assert.equal(screen.notices.filter(row=>row==='Mixed routing files will move to the Claude home.').length,1);
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
 const ui=scripted([['Configure',null,(_rows,options)=>{const text=installBody(options).rows.join('\n');assert.match(text,new RegExp(source==='draft'?draft.roles.arc_scouter.model:source==='installed'?installed.arc_scouter.model:models[target].roles.arc_scouter.model));}]]);
 await installFlow({statuses,draft,loadRoleDefaults:p=>setup.loadRoleDefaults({context:{packageRoot},statuses:saved,target:p}),ui});
});
test('session draft wins over current composite config and Back prepares nothing',async()=>{
 const draft=installDraft('codex',['codex','claude']),before=structuredClone(draft.roles);
 const result=await installFlow({draft,installState:{mode:'composite',platforms:['claude','codex'],anchor:'claude'},currentConfig:{roles:installRoles('claude')},loadRoleDefaults:()=>assert.fail('draft wins'),ui:scripted([['Configure',null]]),prepare:()=>assert.fail('Back must not prepare')});
 assert.equal(result,null);assert.deepEqual(draft.roles,before);
});
for(const platform of ['codex','claude'])test(platform+' malformed later catalog pair blocks Apply and caches failure',async()=>{
 let loads=0;const steps=[['Configure',10],['Configure',10],['Configure',null,(_rows,options)=>assert.match(installBody(options).notices.join('\n'),/catalog error/)]];
 await installFlow({draft:installDraft(platform),loadCatalog:()=>{loads++;return {status:'ready',catalog:{platform,pairs:[catalogs[platform].pairs[0],{model:'',effort:'unknown'}]}};},ui:scripted(steps),prepare:()=>assert.fail('invalid catalog cannot prepare')});assert.equal(loads,1);assert.equal(steps.length,0);
});
test('catalog exception keeps diagram and Back available without preparing',async()=>{
 const steps=[['Configure',10],['Configure',null,(_rows,options)=>assert.match(installBody(options).notices.join('\n'),/catalog error/)]];
 await installFlow({draft:installDraft('codex'),loadCatalog:()=>{throw Error('offline');},ui:scripted(steps),prepare:()=>assert.fail('catalog error cannot prepare')});assert.equal(steps.length,0);
});
test('Back traverses role, platform, model, effort, hosts and Configure inputs without prepare',async()=>{
 const steps=[['Configure',0],['Scouter',0],['Platform — Scouter',null],['Scouter',1],['Model — Scouter',0],['Effort — Scouter',null],['Model — Scouter',null],['Scouter',null],['Configure',5],['Hosts — CLIs where you start ARC sessions',null],['Configure',6],['Configure',7],['Configure',8],['Configure',9],['Configure',null]],ui=scripted(steps);
 ui.text=async()=>null;
 await installFlow({ui,prepare:()=>assert.fail('Back cannot prepare')});assert.equal(steps.length,0);
});
test('Configure input Back discards unconfirmed text and keeps language and role draft',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),draft=installDraft('claude');draft.roles.arc_scouter={platform:'claude',model:'fable',effort:'low'};
 const steps=[['Configure',7],['Configure',8],['Configure',null]],ui=scripted(steps);
 ui.text=async(_title,initial)=>{const events=[{name:'text',text:'999'},{name:'down'},{name:'enter'}],screens=[];const result=await createTuiInterface({viewport:()=>({columns:120,rows:40}),render:s=>{screens.push(s);return{selectionEnabled:true};},nextEvent:async()=>events.shift()}).text('Total subagents',initial);assert.equal(screens.at(-1).rows[0],'100999');return result;};
 await installFlow({draft,ui,prepare:()=>assert.fail('Back cannot prepare')});assert.equal(draft.settings.language,'ko');assert.equal(draft.settings.maxTotalSubagents,100);assert.deepEqual(draft.roles.arc_scouter,{platform:'claude',model:'fable',effort:'low'});
});
test('Configure validates limits and composite Apply sends settings to S',async()=>{
 const steps=[['Configure',7],['Configure',8],['Configure',9],['Configure',10]],pages=[],ui=scripted(steps,pages),inputs=['0','-1','１２','9007199254740992','7','3'];ui.text=async()=>inputs.shift();
 const result=await installFlow({draft:installDraft('codex',['claude','codex']),ui});assert.equal(result.settings.language,'ko');assert.equal(result.settings.maxTotalSubagents,7);assert.equal(result.settings.maxConcurrentSubagents,3);assert.equal(result.settings.skipGlobal,false);assert.equal(result.settings.concurrentSelected,true);assert.deepEqual(pages,Array.from({length:4},()=>({title:'Invalid limit',rows:['Enter a positive whole number.']})));
});
test('editing one composite role preserves other roles and returns canonical fields',async()=>{
 const draft=installDraft('codex',['claude','codex']),before=structuredClone(draft.roles),steps=[['Configure',1],['Planner',0],['Platform — Planner',0],['Planner',1],['Model — Planner',0],['Effort — Planner',0],['Planner',3],['Configure',10]];
 const result=await installFlow({draft,ui:scripted(steps)});assert.deepEqual(result.config.roles.arc_planner,{platform:'claude',...catalogs.claude.pairs[0]});for(const role of roles.filter(r=>r!=='arc_planner'))assert.deepEqual(result.config.roles[role],before[role]);for(const role of roles)assert.deepEqual(Object.keys(result.config.roles[role]).sort(),['effort','model','platform']);
});
for(const platform of ['codex','claude'])test(platform+' edited role serializes its native effort field',async()=>{
 const steps=[['Configure',0],['Scouter',1],['Model — Scouter',0],['Effort — Scouter',0],['Scouter',3],['Configure',10]],before=structuredClone(models[platform]);
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
const installBody=(options,selected=10,columns=120,rows=40)=>options.renderBody({selected,columns,rows,blink:true});

test('Hosts emits only the specified action kinds',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs');
 let screen;const ui=createTuiInterface({viewport:()=>({columns:120,rows:40}),render(value){screen=value;return {selectionEnabled:true};},nextEvent:async()=>({name:'escape'})});
 await assert.rejects(()=>setup.editHosts({ui,hosts:[],rolePlatforms:[],availabilityOf:()=>({selectable:true})}),{code:'ARC_TUI_HOME'});
 assert.deepEqual(screen.rowKinds,[undefined,undefined,undefined,undefined,'confirm','cancel']);
});
test('Configure kinds track full, compact, scrolled and guard bodies',async()=>{
 await installFlow({ui:scripted([['Configure',null,(_rows,options)=>{
  assert.deepEqual(installBody(options).rowKinds.slice(-7),[undefined,undefined,undefined,undefined,undefined,'confirm','cancel']);
  for(const [columns,rows]of [[120,40],[80,24],[80,16],[40,16]]){
   const body=installBody(options,11,columns,rows);
   assert.deepEqual(body.rowKinds,body.rows.map(row=>row.startsWith('Apply - ')?'confirm':row==='Back'?'cancel':undefined));
   assert.equal(body.rowKinds.at(-1),'cancel');
  }
  const guard=installBody(options,11,20,10);assert.equal(guard.selected,undefined);assert.equal(guard.rowKinds,undefined);
 }]])});
});
test('Switch confirmation emits Continue confirm and Back cancel',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs');let screen;const events=[{name:'up'},{name:'enter'}];
 const capture=createTuiInterface({viewport:()=>({columns:120,rows:40}),render(value){screen=value;return {selectionEnabled:true};},nextEvent:async()=>events.shift()});
 await installFlow({draft:installDraft('codex'),installState:{mode:'composite',platforms:['claude','codex']},ui:{menu:async(title,rows,options)=>{
  if(title!=='Configure')return capture.menu(title,rows,options);
  assert.equal(rows[10],'Apply - Codex');return 10;
 }}});
 assert.deepEqual(screen.rowKinds,[undefined,undefined,'confirm','cancel']);
});

test('Configure rows are in order on the first screen',async()=>{
 const loaded=[],steps=[['Configure',null,(rows,options)=>{
  assert.deepEqual(rows,[...names,'Hosts: Claude','Run mode              Supervised','Language              English','Total subagents       100','Concurrent subagents  5','Apply - Claude']);
  assert.equal('editInstallSettings' in setup,false);assert.equal(options.backRow,true);assert.equal(options.refreshMs,600);
  const body=installBody(options,0);assert.match(body.rows.join('\n'),/┌─ > Scouter/);assert.match(body.rows.join('\n'),/Orchestrator/);
  assert.deepEqual(options.notice,[]);assert.ok(body.rows.includes('Hosts: Claude'));assert.ok(body.rows.includes('Apply - Claude'));
 }]];
 assert.equal(await installFlow({ui:scripted(steps),loadCatalog:async p=>{loaded.push(p);return {status:'ready',catalog:catalogs[p]};}}),null);
 assert.deepEqual(loaded,['claude']);assert.equal(steps.length,0);
});

test('Configure limit input retries invalid values and passes the concurrent selection',async()=>{
 const steps=[['Configure',7],['Configure',8],['Configure',9],['Configure',10]],pages=[],ui=scripted(steps,pages);
 const inputs=[['Total subagents','100','0'],['Total subagents','0','7'],['Concurrent subagents','5','3']];
 ui.text=async(title,raw)=>{const [label,initial,value]=inputs.shift();assert.equal(title,label);assert.equal(raw,initial);return value;};
 const draft=installDraft(),result=await installFlow({draft,ui});
 assert.equal(result.skipGlobal,false);assert.equal(result.runMode,'supervised');assert.equal(result.language,'ko');assert.equal(result.maxTotalSubagents,7);assert.equal(result.maxConcurrentSubagents,3);assert.equal(result.concurrentSelected,true);
 assert.deepEqual([...draft.settings.touched],['language','maxTotalSubagents','maxConcurrentSubagents']);
 assert.deepEqual(pages,[{title:'Invalid limit',rows:['Enter a positive whole number.']}]);assert.equal(inputs.length,0);assert.equal(steps.length,0);
});

const mixedStatuses=()=>[installStatuses[0],{...installStatuses[1],settings:{runMode:'full-auto',language:'ko',limits:{max_total_subagents:20,max_concurrent_subagents:2}}}];
const uninstalledHostStatuses=()=>mixedStatuses().map(status=>status.platform==='codex'?{...status,state:'absent'}:status);
const fullAutoNotice='Full Auto: ARC auto-approves specs, plans, choices; push/merge/holds ask you.';
test('install settings draft defaults missing run mode and detects mixed values',()=>{
 const saved=mixedStatuses(),settings=setup.installSettingsDraft(saved,['codex','claude']);
 assert.equal(settings.runMode,'supervised');
 assert.deepEqual([...settings.mixed],['runMode','language','maxTotalSubagents','maxConcurrentSubagents']);assert.equal(settings.touched.size,0);
 assert.deepEqual(setup.installSettingsDraft([],['codex']),{runMode:'supervised',language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5,mixed:new Set(),touched:new Set()});
});

test('install settings draft inherits all four values from the installed platform',()=>{
 const saved=uninstalledHostStatuses();
 assert.deepEqual(setup.installSettingsDraft(saved,['codex','claude']),{
  runMode:'full-auto',language:'ko',maxTotalSubagents:20,maxConcurrentSubagents:2,mixed:new Set(),touched:new Set(),
 });
});

test('install settings draft inherits all four values when a platform has no status',()=>{
 const saved=mixedStatuses().filter(status=>status.platform==='claude');
 assert.deepEqual(setup.installSettingsDraft(saved,['codex','claude']),{
  runMode:'full-auto',language:'ko',maxTotalSubagents:20,maxConcurrentSubagents:2,mixed:new Set(),touched:new Set(),
 });
});

test('install settings draft compares an incomplete platform without settings using defaults',()=>{
 const saved=[mixedStatuses()[1],{platform:'codex',state:'incomplete'}];
 const settings=setup.installSettingsDraft(saved,['claude','codex']);
 assert.deepEqual([...settings.mixed],['runMode','language','maxTotalSubagents','maxConcurrentSubagents']);
});

test('install settings draft uses settings fields available on an incomplete platform',()=>{
 const saved=[mixedStatuses()[1],{platform:'codex',state:'incomplete',settings:{language:'ko',limits:{max_total_subagents:20}}}];
 const settings=setup.installSettingsDraft(saved,['claude','codex']);
 assert.deepEqual([...settings.mixed],['runMode','maxConcurrentSubagents']);
});

test('Configure omits mixed run mode from Apply when an incomplete installation has Full Auto',async t=>{
 const userHome=realpathSync(mkdtempSync(path.join(tmpdir(),'arc-configure-incomplete-')));
 t.after(()=>rmSync(userHome,{recursive:true,force:true}));
 const arc=path.join(userHome,'.codex/skills/arc');
 mkdirSync(arc,{recursive:true});
 writeFileSync(path.join(arc,'settings.toml'),'version = 2\nlanguage = "en"\nrun_mode = "full-auto"\n');
 const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:root=>openRoot(root,{native})};
 const incomplete=(await collectStatus({userHome,cwd:userHome,env:{},safeFs})).find(status=>status.platform==='codex');
 assert.equal(incomplete.state,'incomplete');
 const claude=installStatuses.find(status=>status.platform==='claude');
 const installed={...claude,settings:{...claude.settings,runMode:'supervised'}};
 const platforms=['claude','codex'];
 const settings=setup.installSettingsDraft([installed,incomplete],platforms);
 assert.deepEqual([...settings.mixed],['runMode']);
 const plan={rule:'D1-c',platforms,anchor:'claude'};
 const result=setup.installPrepareOptions(plan,{...installDraft('claude',platforms),settings},catalogs);
 assert.deepEqual(result.settings,{skipGlobal:false,language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5});
});

test('adding an uninstalled Host displays and prepares the inherited composite settings',async()=>{
 const draft=installDraft('claude');
 let settingsRows;
 const steps=[['Configure',5],['Hosts — CLIs where you start ARC sessions',1],['Hosts — CLIs where you start ARC sessions',4],['Configure',10,rows=>{settingsRows=rows.slice(6,10);}]];
 const result=await installFlow({statuses:uninstalledHostStatuses(),draft,installState:{mode:'standalone',platforms:['claude']},ui:scripted(steps)});
 assert.equal(result.target,'composite');
 assert.deepEqual(result.platforms,['claude','codex']);
 assert.deepEqual(result.settings,{skipGlobal:false,runMode:'full-auto',language:'ko',maxTotalSubagents:20,maxConcurrentSubagents:2});
 assert.deepEqual(settingsRows,['Run mode              Full Auto','Language              Korean','Total subagents       20','Concurrent subagents  2']);
});

test('Configure updates the Full Auto notice within one menu on either arrow',async()=>{
 await installFlow({draft:installDraft(),ui:scripted([['Configure',null,(_rows,options)=>{
  const supervised=installBody(options,6,80,25);
  options.onHorizontal({selected:6,direction:'right'});
  const fullAuto=installBody(options,6,80,25);
  const compact=installBody(options,11,40,16);
  options.onHorizontal({selected:6,direction:'left'});
  const reverted=installBody(options,6,80,25);

  assert.deepEqual([supervised.notices,fullAuto.notices,reverted.notices],[[],[fullAutoNotice],[]]);
  assert.equal(wrapDetailRows([fullAutoNotice],80).length,1);
  assert.match(supervised.rows[0],/^┌─ /);
  assert.match(fullAuto.rows[0],/^Scouter: /);
  assert.equal(compact.rows[compact.selected],'Back');
  assert.ok(compact.rows.length<11);
  assert.deepEqual(reverted,supervised);
 }]])});
});

test('Configure shows the full diagram at 25 rows for Supervised and 26 rows for Full Auto at 80 columns',async()=>{
 await installFlow({draft:installDraft(),ui:scripted([['Configure',null,(_rows,options)=>{
  assert.match(installBody(options,6,80,24).rows[0],/^Scouter: /);
  assert.match(installBody(options,6,80,25).rows[0],/^┌/);
  options.onHorizontal({selected:6,direction:'right'});
  assert.match(installBody(options,6,80,25).rows[0],/^Scouter: /);
  assert.match(installBody(options,6,80,26).rows[0],/^┌/);
 }]])});
});

test('Configure appends the Full Auto notice after existing notices when Enter cycles a mixed Run mode',async()=>{
 const reason='! Hosts: Codex - Unavailable (unauthorized)';
 const saved=mixedStatuses().map(status=>status.platform==='codex'?{...status,authentication:{authStatus:'unauthorized'}}:status);
 const notices=[];
 const capture=(_rows,options)=>notices.push(installBody(options).notices);
 const steps=[['Configure',6,capture],['Configure',6,capture],['Configure',6,capture],['Configure',null,capture]];
 await installFlow({statuses:saved,draft:installDraft('claude',['claude','codex']),ui:scripted(steps)});
 assert.deepEqual(notices,[[reason],[reason],[reason,fullAutoNotice],[reason]]);
});

test('(mixed) field untouched is omitted, touched applies to S',async()=>{
 const saved=mixedStatuses(),draft=installDraft('codex',['codex','claude']),plan={rule:'D1-c',platforms:['claude','codex'],anchor:'claude'};
 const untouched=await installFlow({statuses:saved,draft,ui:scripted([['Configure',10,rows=>assert.deepEqual(rows.slice(6,10),[
  'Run mode              (mixed)','Language              (mixed)','Total subagents       (mixed)','Concurrent subagents  (mixed)',
 ])]])});
 assert.deepEqual(untouched.settings,{skipGlobal:false});

 const steps=[['Configure',6],['Configure',7],['Configure',8],['Configure',9],['Configure',10]],ui=scripted(steps);
 const inputs=['9','4'];ui.text=async(_title,raw)=>{assert.equal(raw,'');return inputs.shift();};
 const options=await installFlow({statuses:saved,draft,ui});
 assert.deepEqual(options.settings,{skipGlobal:false,runMode:'supervised',language:'en',maxTotalSubagents:9,maxConcurrentSubagents:4,concurrentSelected:true});assert.deepEqual(options.platforms,['claude','codex']);
 for(const rule of ['D1-c','D1-d','D1-e']){const value=setup.installPrepareOptions({...plan,rule},draft,catalogs);assert.equal(value.target,'composite');assert.equal(value.config.version,2);assert.deepEqual(value.config.roles,draft.roles);assert.ok(value.config.revision);}
 const single=setup.installPrepareOptions({rule:'D1-b',platforms:['codex'],anchor:'codex'},draft,catalogs);assert.equal(single.switchFromComposite,true);assert.deepEqual(single.roles,models.codex.roles);assert.strictEqual(single.verifiedCatalog,catalogs.codex);assert.equal(single.skipGlobal,false);assert.equal(single.runMode,'supervised');
});

test('Configure cancels mixed limit input without applying a value',async()=>{
 const draft=installDraft('codex',['claude','codex']);
 const ui=scripted([['Configure',8],['Configure',10]]);
 ui.text=async(title,raw)=>{assert.equal(title,'Total subagents');assert.equal(raw,'');return null;};
 const result=await installFlow({statuses:mixedStatuses(),draft,ui});
 assert.equal(draft.settings.touched.has('maxTotalSubagents'),false);
 assert.equal(draft.settings.maxTotalSubagents,20);
 assert.deepEqual(result.settings,{skipGlobal:false});
});

test('touched run mode survives a Hosts change',async()=>{
 const draft=installDraft('claude'),steps=[['Configure',6],['Configure',5],['Hosts — CLIs where you start ARC sessions',1],['Hosts — CLIs where you start ARC sessions',4],['Configure',10,(rows,options)=>{
  assert.equal(options.selected,5);
  assert.equal(rows[6],'Run mode              Full Auto');
 }]];
 const result=await installFlow({draft,ui:scripted(steps)});
 assert.deepEqual(result.platforms,['claude','codex']);assert.equal(result.settings.runMode,'full-auto');assert.equal(draft.settings.touched.has('runMode'),true);
});

test('hosts lock role platforms and preview mode in Apply',async()=>{
 const steps=[['Configure',5],['Hosts — CLIs where you start ARC sessions',1,(rows)=>{assert.equal(rows[0],'[ ] Claude');assert.equal(rows[1],'[■] Codex   (used by Scouter, Planner, Implementer, QA, Reviewer)');assert.equal(rows[2],'[-] Gemini  - Unavailable  (capability not verified)');assert.equal(rows[3],'[-] Grok    - Unavailable  (capability not verified)');}],['Hosts — CLIs where you start ARC sessions',0,rows=>assert.match(rows[1],/^\[■\]/)],['Hosts — CLIs where you start ARC sessions',4],['Configure',10,(_rows,options)=>{assert.deepEqual(options.notice,[]);assert.deepEqual(installBody(options).rows.slice(-7),['Hosts: Claude, Codex','Run mode              < Supervised >','Language              < English >','Total subagents       100','Concurrent subagents  5','Apply - Mixed (Claude + Codex)','Back']);}]];
 const result=await installFlow({draft:installDraft(),ui:scripted(steps)});assert.deepEqual(result.platforms,['claude','codex']);assert.equal(result.target,'composite');assert.equal(result.settings.skipGlobal,false);assert.deepEqual(result.config.roles,installRoles('codex'));assert.equal(steps.length,0);
});

test('D1-b asks confirmation; Back sends nothing',async()=>{
 let calls=0;const steps=[['Configure',10],['Switch to Codex',null,(rows,options)=>{assert.deepEqual([...rows,...(options.backRow?['Back']:[])],['Continue','Back']);assert.deepEqual(options.info,['Mixed routing will be turned off.']);}],['Configure',null]];
 assert.equal(await installFlow({draft:installDraft('codex',[]),installState:{mode:'composite',platforms:['claude','codex']},ui:scripted(steps),prepare:async()=>{calls++;}}),null);assert.equal(calls,0);assert.equal(steps.length,0);
 const result=await installFlow({draft:installDraft('codex',[]),installState:{mode:'composite',platforms:['claude','codex']},ui:scripted([['Configure',10],['Switch to Codex',0]])});assert.equal(result.switchFromComposite,true);
});

test('D1-f shows Operation unavailable',async()=>{
 const pages=[],steps=[['Configure',10,(_rows,options)=>assert.ok(installBody(options).rows.includes('Apply - Unverified'))],['Configure',null]];
 await installFlow({installState:{mode:'unverified',platforms:[],residualPaths:['/fixture/routing.json']},ui:scripted(steps,pages),prepare:()=>assert.fail('D1-f must not prepare')});
 assert.deepEqual(pages,[{title:'Operation unavailable',rows:['Mixed routing configuration cannot be verified.','Residual path: /fixture/routing.json','No changes were applied.']}]);
});

test('catalog failure outside S does not block Apply; inside S blocks with catalog error',async()=>{
 for(const inside of [false,true]){
  const loads=[],pages=[],steps=[['Configure',0],['Scouter',3,(_rows,options)=>{options.onHorizontal({selected:0,direction:'left'});const body=options.renderBody({selected:0,columns:120,rows:40});assert.match(body.rows[0],/Codex/);}],['Configure',0],['Scouter',3],['Configure',10,(_rows,options)=>{const body=installBody(options);assert.equal(body.notices.some(row=>row.includes('catalog error')),inside);}]];
  if(inside)steps.push(['Configure',null,(_rows,options)=>{const body=installBody(options);assert.match(body.notices.join(' '),/Unavailable \(catalog error\)/);assert.match(body.rows[body.selected],/^Apply/);}]);
  const result=await installFlow({draft:installDraft('codex',inside?['codex','claude']:['codex']),ui:scripted(steps,pages),loadCatalog:async p=>{loads.push(p);if(p==='claude')throw Error('offline');return {status:'ready',catalog:catalogs[p]};},prepare:async options=>{assert.equal(inside,false);return options;}});
  assert.equal(result?.target??null,inside?null:'codex');assert.deepEqual(loads.sort(),['claude','codex']);assert.deepEqual(pages,[]);assert.equal(steps.length,0);
 }
});

test('initial platform is Claude when both standalone',async()=>{
 const result=await installFlow({ui:scripted([['Configure',10]])});assert.equal(result.target,'claude');assert.deepEqual(result.roles,models.claude.roles);assert.equal(result.switchFromComposite,undefined);
});

test('Configure compact and guard boundaries preserve access to the controls',async()=>{
 await installFlow({ui:scripted([['Configure',null,(_rows,options)=>{
  for(const [columns,rows] of [[40,17],[60,20],[80,24]]){
   const body=installBody(options,10,columns,rows);assert.match(body.rows[0],/^Scouter: Claude \/ /);assert.deepEqual(options.notice,[]);assert.deepEqual(body.rows.slice(-7),['Hosts: Claude','Run mode              < Supervised >','Language              < English >','Total subagents       100','Concurrent subagents  5','Apply - Claude','Back']);assert.equal(body.rows[body.selected],'Apply - Claude');assert.ok(body.rows.length+5<=rows);
  }
  const full=installBody(options,0,80,25);assert.match(full.rows[0],/^┌─ > Scouter/);
  const compact=installBody(options,11,40,16);assert.equal(compact.position,'2-12/12');assert.equal(compact.rows[compact.selected],'Back');
  for(const [columns,rows] of [[39,16],[40,15]]){
   const guard=installBody(options,0,columns,rows);assert.equal(guard.rows.join(' '),'Menu requires 40 columns and 16 rows.');assert.equal(guard.selected,undefined);
  }
 }]])});
});

test('install hosts use injected registry labels, order and reason detail',async()=>{
 assert.equal(typeof setup.editHosts,'function');const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries(['codex','claude','zeta','eta']);
 const hosts=['eta'],steps=[['Hosts — CLIs where you start ARC sessions',3,(rows,options)=>{assert.deepEqual(rows.slice(0,4),['[ ] Claude','[■] Codex   (used by Scouter, Planner, Implementer, QA, Reviewer)','[ ] Zeta','[-] Eta     - Unavailable  (capability not verified)']);assert.deepEqual(options.notice({selected:3,columns:120,rows:40}),["Roles' platforms are always included.",'Eta: capability not verified']);}],['Hosts — CLIs where you start ARC sessions',3,rows=>assert.match(rows[3],/^\[-\]/)],['Hosts — CLIs where you start ARC sessions',2,rows=>assert.match(rows[3],/^\[-\]/)],['Hosts — CLIs where you start ARC sessions',4]];
 const result=await setup.editHosts({ui:scripted(steps),hosts,rolePlatforms:['codex','codex','codex','codex','codex'],availabilityOf:id=>({selectable:id!=='eta',reason:id==='eta'?'capability_not_verified':null}),registry});assert.deepEqual(result,['codex','zeta']);assert.deepEqual(hosts,['eta']);assert.equal(steps.length,0);
 assert.deepEqual(await setup.editHosts({ui:scripted([['Hosts — CLIs where you start ARC sessions',4]]),hosts:[],rolePlatforms:[],availabilityOf:()=>({selectable:true}),registry}),[]);
 assert.equal(await setup.editHosts({ui:scripted([['Hosts — CLIs where you start ARC sessions',0],['Hosts — CLIs where you start ARC sessions',null]]),hosts:[],rolePlatforms:[],availabilityOf:()=>({selectable:true}),registry}),null);
});

test('initial composite roles and hosts come from currentConfig and D1-e prepares without confirmation',async()=>{
 const currentConfig={version:2,revision:'saved',platforms:['claude','codex'],roles:installRoles('claude')},steps=[['Configure',5,(_rows,options)=>assert.ok(installBody(options).rows.includes('Hosts: Claude, Codex'))],['Hosts — CLIs where you start ARC sessions',1],['Hosts — CLIs where you start ARC sessions',4],['Configure',10],['Switch to Claude',0]];
 const result=await installFlow({currentConfig,installState:{mode:'composite',platforms:['claude','codex']},ui:scripted(steps)});assert.equal(result.target,'claude');assert.equal(result.switchFromComposite,true);assert.deepEqual(currentConfig.roles,installRoles('claude'));
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries();
 const changed=await installFlow({draft:installDraft('codex',['codex','claude']),registry,installState:{mode:'composite',platforms:['codex','zeta']},ui:scripted([['Configure',10]])});assert.equal(changed.target,'composite');assert.deepEqual(changed.platforms,['claude','codex']);
});

test('uninstalled initial platform uses role availability then display order fallback',async()=>{
 for(const unavailable of [false,true]){
  const saved=installStatuses.map(status=>({...status,state:'absent',authentication:{authStatus:unavailable||status.platform==='claude'?'unauthorized':'authenticated'}}));
  const result=await installFlow({statuses:saved,ui:scripted([['Configure',10]])});assert.equal(result.target,unavailable?'claude':'codex');
 }
});

test('role editor Done updates the diagram draft and standalone prepare roles',async()=>{
 const draft=installDraft('claude'),steps=[['Configure',0],['Scouter',3,(_rows,options)=>options.onHorizontal({selected:1,direction:'right'})],['Configure',10,(_rows,options)=>assert.match(installBody(options).rows.join('\n'),/claude-fable-5-1/)] ];
 const result=await installFlow({draft,ui:scripted(steps)});assert.equal(result.roles.arc_scouter.model,'claude-fable-5-1');assert.equal(draft.roles.arc_scouter.model,'claude-fable-5-1');assert.deepEqual(result.roles.arc_planner,models.claude.roles.arc_planner);
});

test('composite gates distinguish role and host usage and standalone ignores authentication',async()=>{
 for(const hostOnly of [false,true]){
  const saved=installStatuses.map(status=>status.platform==='claude'?{...status,authentication:{authStatus:'unauthorized',reason:'fixture denial'}}:status),draft=installDraft('codex',['codex','claude']);
  if(!hostOnly)draft.roles.arc_reviewer={...installRoles('claude').arc_reviewer};
  const steps=[['Configure',10,(_rows,options)=>{assert.ok(options.notice.includes(`! ${hostOnly?'Hosts':'Reviewer'}: Claude - Unavailable (unauthorized)`));const body=installBody(options,4,40,19);assert.equal(body.rows[4].startsWith('Reviewer !:'),!hostOnly);assert.ok(body.rows.includes('Back'));}],['Configure',null,(_rows,options)=>{const body=installBody(options);assert.match(body.notices.join(' '),/unauthorized/);assert.match(body.rows[body.selected],/^Apply/);}]];
  await installFlow({statuses:saved,draft,ui:scripted(steps),prepare:()=>assert.fail('unavailable composite cannot prepare')});
 }
 const saved=installStatuses.map(status=>({...status,authentication:{authStatus:'unauthorized',reason:'cli_not_found'}}));
 const result=await installFlow({statuses:saved,draft:installDraft(),ui:scripted([['Configure',10]])});assert.equal(result.target,'codex');
});

test('injected third host produces a version 2 routing config and registry labels',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries(),draft=installDraft('codex',['zeta','claude','codex']);
 const result=await installFlow({draft,registry,statuses:[...installStatuses,{platform:'zeta',state:'absent',authentication:{authStatus:'unknown'}}],loadCatalog:async p=>({status:'ready',catalog:p==='zeta'?{platform:'zeta',pairs:[{model:'opus',effort:'high'}]}:catalogs[p]}),ui:scripted([['Configure',10,(_rows,options)=>assert.deepEqual(options.notice,['Zeta: auth unverified'])]])});
 assert.deepEqual(result.platforms,['claude','codex','zeta']);assert.equal(result.config.version,2);assert.deepEqual(result.config.platforms,['claude','codex','zeta']);assert.equal(result.settings.skipGlobal,false);
});

test('compact blocked screen keeps Back selectable through the real UI',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const events=[...Array.from({length:11},()=>({name:'down'})),{name:'enter'}],screens=[],viewport={columns:40,rows:16};
 const ui=createTuiInterface({viewport:()=>viewport,render:screen=>{const rendered=renderScreen(screen,viewport);screens.push({screen,rendered});return rendered;},nextEvent:async()=>events.shift()??{name:'eof'}});
 const result=await installFlow({draft:installDraft('codex',['codex','claude']),loadCatalog:async p=>p==='claude'?{status:'catalog_error'}:{status:'ready',catalog:catalogs[p]},ui,prepare:()=>assert.fail('Back cannot prepare')});
 assert.equal(result,null);assert.equal(screens.at(-1).screen.rows.at(-1),'Back');assert.equal(screens.at(-1).rendered.selectionEnabled,true);assert.ok(screens.at(-1).rendered.text.includes('Apply - Mixed (Claude + Codex)'));
});


test('Configure cycles Run mode and Language and pulses only the selected row',async()=>{
 const draft=installDraft();
 const steps=[['Configure',6,(_rows,options)=>{
  const render=(selected,frame)=>options.renderBody({selected,frame,columns:80,rows:25}).rows;
  assert.equal(render(6,0)[14],'Run mode              < Supervised >');
  assert.equal(render(6,5)[14],'Run mode               <Supervised> ');
  assert.equal(render(7,5)[14],'Run mode              < Supervised >');
  assert.equal(render(7,5)[15],'Language               <English> ');
  assert.equal(render(6,5)[15],'Language              < English >');
  options.onHorizontal({selected:5,direction:'right'});
  assert.equal(draft.settings.touched.size,0);
  options.onHorizontal({selected:6,direction:'right'});
  const fullAuto=options.renderBody({selected:6,frame:0,columns:80,rows:25});
  assert.equal(fullAuto.rows[fullAuto.selected],'Run mode              < Full Auto >');
  assert.equal(draft.settings.touched.has('runMode'),true);
 }],['Configure',7,(rows,options)=>{
  assert.equal(options.selected,6);assert.equal(rows[6],'Run mode              Supervised');
  options.onHorizontal({selected:7,direction:'left'});
  assert.equal(options.renderBody({selected:7,frame:0,columns:80,rows:25}).rows[15],'Language              < Korean >');
  assert.equal(draft.settings.touched.has('language'),true);
 }],['Configure',null,(rows,options)=>{
  assert.equal(options.selected,7);assert.equal(rows[7],'Language              English');
 }]];
 await installFlow({draft,ui:scripted(steps)});
 assert.deepEqual([...draft.settings.touched],['runMode','language']);
});

for(const state of ['locked','unavailable','mixed'])test(`Hosts ${state} rows suppress cursor reasons until Enter when none can change`,async()=>{
 const notice='No host can be changed now: all platforms are used by roles or unavailable.';
 const {DEFAULT_INSTALLER_REGISTRY}=await import('../../lib/platforms/index.mjs');
 const rolePlatforms=state==='locked'?DEFAULT_INSTALLER_REGISTRY.platformIds():state==='mixed'?['claude']:[];
 const availabilityOf=id=>({selectable:state==='locked'||state==='mixed'&&id==='claude',reason:state==='locked'||state==='mixed'&&id==='claude'?null:'unauthorized',status:{authentication:{reason:'fixture denial'}}});
 const steps=[['Hosts — CLIs where you start ARC sessions',0,(_rows,options)=>{
  for(const selected of [0,1,2,3,4,5])assert.deepEqual(options.notice({selected}),[notice]);
  assert.equal(options.hint,'checklist');assert.equal(options.backRow,true);
 }],['Hosts — CLIs where you start ARC sessions',1,(_rows,options)=>{
  assert.deepEqual(options.notice({selected:0}),[notice,state==='unavailable'?'Claude: unauthorized: fixture denial':"Change those roles' platform to remove Claude."]);
  assert.equal(options.info,undefined);
  for(const selected of [1,2,3,4,5])assert.deepEqual(options.notice({selected}),[notice]);
  assert.equal(options.hint,'checklist');
 }],['Hosts — CLIs where you start ARC sessions',4,(_rows,options)=>{
  assert.deepEqual(options.notice({selected:1}),[notice,state==='locked'?"Change those roles' platform to remove Codex.":'Codex: unauthorized: fixture denial']);
  assert.deepEqual(options.notice({selected:0}),[notice]);assert.equal(options.info,undefined);
 }]];
 assert.deepEqual(await setup.editHosts({ui:scripted(steps),hosts:[],rolePlatforms,availabilityOf}),rolePlatforms);
 assert.equal(steps.length,0);
});

test('Hosts glyphs distinguish locked, unavailable and toggleable rows even when checked',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{platforms:registry}=createTestRegistries(['claude','codex','zeta','eta']);
 const steps=[['Hosts — CLIs where you start ARC sessions',2,(rows)=>{
  assert.deepEqual(rows.slice(0,4).map(row=>row.slice(0,3)),['[■]','[-]','[x]','[ ]']);
 }],['Hosts — CLIs where you start ARC sessions',3,(rows)=>assert.equal(rows[2],'[ ] Zeta')],['Hosts — CLIs where you start ARC sessions',4,(rows)=>assert.equal(rows[3],'[x] Eta')]];
 assert.deepEqual(await setup.editHosts({registry,hosts:['codex','zeta'],rolePlatforms:['claude'],availabilityOf:id=>({selectable:!['claude','codex'].includes(id),reason:'unauthorized'}),ui:scripted(steps)}),['claude','codex','eta']);
 assert.equal(steps.length,0);
});

test('Hosts locked and unavailable suffixes start at the same display column',async()=>{
 const steps=[['Hosts — CLIs where you start ARC sessions',null,rows=>{
  const locked=rows.find(row=>row.startsWith('[■] Codex'));
  const unavailable=rows.find(row=>row.startsWith('[-] Gemini'));
  const columns=[[locked,'(used by '],[unavailable,'- Unavailable']].map(([row,suffix])=>{
   assert.ok(row);const start=row.indexOf(suffix);assert.ok(start>=0);
   return [...row.slice(0,start)].reduce((total,character)=>total+cellWidth(character),0);
  });
  assert.deepEqual(columns,[12,12]);
 }]];
 await setup.editHosts({ui:scripted(steps),hosts:[],rolePlatforms:['codex'],availabilityOf:id=>({selectable:id!=='gemini',reason:id==='gemini'?'capability_not_verified':null})});
 assert.equal(steps.length,0);
});

test('Hosts suffixes align by label display width including wide and combining characters',async()=>{
 const {createZetaRegistries,ZETA_AUTH_NONE}=await import('./fixtures/platforms/zeta.mjs');
 for(const [label,want] of [['界界界界',['[■] Claude    (used by Scouter)','[-] Codex     - Unavailable  (unauthorized)','[-] 界界界界  - Unavailable  (unauthorized)']],['e\u0301',['[■] Claude  (used by Scouter)','[-] Codex   - Unavailable  (unauthorized)','[-] e\u0301       - Unavailable  (unauthorized)']]]){
  const {platforms:registry}=createZetaRegistries({...ZETA_AUTH_NONE,label});
  await setup.editHosts({registry,hosts:[],rolePlatforms:['claude'],availabilityOf:id=>({selectable:id==='claude',reason:id==='claude'?null:'unauthorized'}),ui:scripted([['Hosts — CLIs where you start ARC sessions',null,rows=>assert.deepEqual(rows.slice(0,3),want)]])});
 }
});

test('Hosts identifies roles in install order and locked Enter explains how to remove the host',async()=>{
 const draft=installDraft('claude',['codex','claude']);
 draft.roles.arc_planner=installRoles('codex').arc_planner;
 draft.roles.arc_qa=installRoles('codex').arc_qa;
 const steps=[['Configure',5],['Hosts — CLIs where you start ARC sessions',1,(rows,options)=>{
  assert.equal(rows[1],'[■] Codex   (used by Planner, QA)');
  assert.deepEqual(options.notice({selected:1}),['No host can be changed now: all platforms are used by roles or unavailable.']);
  assert.equal(options.hint,'checklist');
 }],['Hosts — CLIs where you start ARC sessions',4,(rows,options)=>{
  assert.equal(rows[1],'[■] Codex   (used by Planner, QA)');
  assert.deepEqual(options.notice({selected:1}),['No host can be changed now: all platforms are used by roles or unavailable.',"Change those roles' platform to remove Codex."]);
  assert.equal(options.info,undefined);
 }],['Configure',null]];
 await installFlow({draft,ui:scripted(steps)});assert.equal(steps.length,0);
});

test('Hosts unavailable Enter highlights the reason without adding an unavailable host',async()=>{
 const steps=[['Hosts — CLIs where you start ARC sessions',1],['Hosts — CLIs where you start ARC sessions',4,(rows,options)=>{
  assert.match(rows[1],/^\[-\] Codex/);
  assert.deepEqual(options.notice({selected:1}),["Roles' platforms are always included.",'Codex: unauthorized: fixture denial']);
  assert.equal(options.info,undefined);
 }]];
 const result=await setup.editHosts({ui:scripted(steps),hosts:[],rolePlatforms:[],availabilityOf:id=>({selectable:id!=='codex',reason:id==='codex'?'unauthorized':null,status:{authentication:{reason:'fixture denial'}}})});
 assert.deepEqual(result,[]);assert.equal(steps.length,0);
});


for(const columns of [80,40])test(`Hosts feedback stays below fixed choices at ${columns} columns`,async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const viewport={columns,rows:20},frames=[],events=[{name:'enter'},{name:'down'},{name:'down'},{name:'down'},{name:'down'},{name:'enter'}];
 const ui=createTuiInterface({viewport:()=>viewport,render(screen){const result=renderScreen(screen,viewport);frames.push({screen,...result});return result;},nextEvent:async()=>events.shift()??{name:'eof'}});
 assert.deepEqual(await setup.editHosts({ui,hosts:[],rolePlatforms:['claude','codex','gemini'],availabilityOf:()=>({selectable:true})}),['claude','codex','gemini']);
 for(const frame of frames){
  assert.equal(frame.screen.rows.length,6);assert.equal(frame.screen.rows[4],'Done');assert.equal(frame.screen.rows[5],'Back');
  assert.equal(frame.text.split('\n').findIndex(line=>line.trim().replace(/^> /,'')==='Done'),6);assert.equal(frame.text.split('\n')[8],'');assert.equal(frame.selectionEnabled,true);
 }
 assert.ok(frames[1].screen.notices.some(row=>row.includes("Change those roles' platform")));assert.equal(frames[2].screen.notices.length,1);
});

test('compact migration and blocking notices reserve scroll space for every install choice',async()=>{
 const {createTuiInterface}=await import('../../lib/tui/app.mjs'),{renderScreen}=await import('../../lib/tui/render.mjs');
 const viewport={columns:40,rows:16},frames=[],events=[...Array.from({length:11},()=>({name:'down'})),{name:'enter'}];
 const ui=createTuiInterface({viewport:()=>viewport,render(screen){const result=renderScreen(screen,viewport);frames.push({screen,...result});return result;},nextEvent:async()=>events.shift()??{name:'eof'}});
 const {platforms:registry}=migrationRegistries(),draft=installDraft('codex',['claude','codex']);draft.roles.arc_reviewer=installRoles('claude').arc_reviewer;
 const statuses=installStatuses.map(status=>status.platform==='claude'?{...status,authentication:{authStatus:'unauthorized'}}:status);
 assert.equal(await installFlow({ui,registry,draft,statuses,installState:{mode:'composite',platforms:['claude','codex'],anchor:'codex',legacyAnchor:true},prepare:()=>assert.fail('Back cannot prepare')}),null);
 assert.ok(frames.every(frame=>frame.selectionEnabled));assert.match(frames.at(-1).text,/> Back/);
 assert.match(frames.at(-1).text,/Mixed routing files will move/);assert.match(frames.at(-1).text,/unauthorized/);
});

test('operational Grok chooser and role editor expose auth unverified', async () => {
 const {DEFAULT_INSTALLER_REGISTRY:registry}=await import('../../lib/platforms/index.mjs');
 const {platformAvailability}=await import('../../lib/platforms/availability.mjs');
 const {selectPlatform,editRole}=await import('../../lib/tui/custom-preset.mjs');
 const status={platform:'grok',state:'installed',cliVersion:{version:'1.0.89'},authentication:{authStatus:'unknown',reason:'auth_unverified'}};
 assert.equal(platformAvailability('grok',{registry,usage:'standalone'}).selectable,true);
 const availabilityOf=id=>platformAvailability(id,{registry,usage:'role',status:id==='grok'?status:{platform:id,state:'installed',cliVersion:{version:'0.68.0'},authentication:{authStatus:'authenticated'}}});
 assert.equal(await selectPlatform({registry,roleName:'Planner',current:'grok',availabilityOf,ui:{menu:async(_title,rows,options)=>{
  assert.equal(rows[3],'Grok');
  assert.deepEqual(options.notice({selected:3}),['Grok: auth unverified — ARC cannot confirm Grok CLI login.']);return 3;
 }}}),'grok');
 const value=await editRole({registry,roleName:'Planner',current:{platform:'grok',model:'grok-4.6',effort:'default'},availabilityOf,loadCatalog:async()=>({pairs:[{model:'grok-4.6',effort:'default'}]}),defaultsFor:async()=>({model:'grok-4.6',effort:'default'}),ui:{menu:async(_title,_rows,options)=>{
  assert.deepEqual(options.notice({selected:0}),['Grok: auth unverified — ARC cannot confirm Grok CLI login.']);return 3;
 }}});
 assert.equal(value.platform,'grok');
 await setup.editHosts({registry,hosts:['grok'],rolePlatforms:[],availabilityOf,ui:{menu:async(_title,rows)=>{assert.match(rows[3],/Grok +\(auth unverified\)$/);return null;}}});
});
