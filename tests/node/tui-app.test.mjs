import {grokOffRegistries} from './fixtures/platforms/grok-off.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {runInstallFlow} from '../../lib/tui/setup.mjs';
import {selectCatalogPair} from '../../lib/tui/custom-preset.mjs';
import {renderScreen,cellWidth,escapeTerminalText,wrapDetailRows} from '../../lib/tui/render.mjs';
const fixturePath=fileURLToPath(new URL('./fixtures/grok/',import.meta.url));
const previewConfig=loadModelConfig(readFileSync(new URL('../../codex/skill/models.toml',import.meta.url)),'codex');
const load=()=>import('../../lib/tui/app.mjs');
const packageVersion=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url))).version;
function terminal(events,{columns=120}={}){const screens=[];return{screens,viewport(){return{columns,rows:40};},render(s){screens.push(s);return{selectionEnabled:true};},discardInput(){},setBusy(){},dispose(){this.closed=true;},async nextEvent(){return events.shift()??{name:'eof'};}};}
const installedStatuses=()=>['claude','codex'].map(platform=>({platform,state:'installed'}));
const down=n=>Array.from({length:n},()=>({name:'down'})),enter={name:'enter'},back={name:'escape'};
test('Grok Status is Not verified without repeated Notes and Uninstall is not installed',async()=>{
 const {getPlatform}=await import('../../lib/runtime/platform-registry.mjs');assert.ok(getPlatform('grok'),'Grok descriptor is required');
 const statuses=[...installedStatuses(),{platform:'grok',state:'absent',authentication:{authStatus:'unknown',reason:'capability_not_verified'},cliVersion:{version:null,reason:'capability_not_verified'},diagnostics:[]}];
 const session=terminal([...down(1),enter,back,...down(1),enter,back,back]);
 const {runTui}=await load();await runTui({session,context:{env:{PATH:fixturePath},...grokOffRegistries()},services:{collectStatus:async()=>statuses,currentInstallState:()=>({mode:'standalone',platforms:[]}),prepareOperation:async()=>{throw Error('offline');}}});
 const status=session.screens.find(s=>s.title==='Status');assert.ok(status);assert.match(status.rows.join('\n'),/Grok +Not verified/);assert.doesNotMatch(status.rows.join('\n'),/capability not verified/);
 assert.ok(session.screens.some(s=>s.title==='Uninstall'&&s.rows.includes('Grok  (not installed)')));
});
test('operational Grok Status is Available with auth unverified without repeated Notes and Uninstall is not installed',async()=>{
 const {getPlatform}=await import('../../lib/runtime/platform-registry.mjs');assert.ok(getPlatform('grok'),'Grok descriptor is required');
 const statuses=[...installedStatuses(),{platform:'grok',state:'absent',authentication:{authStatus:'unknown',reason:'auth_unverified'},cliVersion:{version:'1.0.89'},diagnostics:[]}];
 const session=terminal([...down(1),enter,back,...down(1),enter,back,back]);
 const {runTui}=await load();await runTui({session,context:{env:{PATH:fixturePath}},services:{collectStatus:async()=>statuses,currentInstallState:()=>({mode:'standalone',platforms:[]}),prepareOperation:async()=>{throw Error('offline');}}});
 const status=session.screens.find(s=>s.title==='Status');assert.ok(status);assert.match(status.rows.join('\n'),/Grok +Available · auth unverified/);assert.doesNotMatch(status.rows.join('\n'),/capability not verified/);
 assert.ok(session.screens.some(s=>s.title==='Uninstall'&&s.rows.includes('Grok  (not installed)')));
});
const blockingNotice='Force finish marks the native/reserved entries cancelled. Native agents in other sessions are not stopped.';
const blockingEntry={home:'/home/codex',dispatchId:'12345678-native',role:'arc_implementer',workflowId:'work',route:'native',state:'reserved',hostPlatform:'codex',updatedAt:'2026-11-17T00:00:00.000Z',forceFinishable:true};
async function blockedTui({kind='composite',entries=[blockingEntry],events=[enter,enter,back],result,retryResult,forceResult={finished:[blockingEntry.dispatchId],skipped:[],residualPaths:[]},forceError,prepareError,uninstall=false,columns=120}={}){
 const {runTui}=await load(),roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}]));
 const session=terminal([...(uninstall?[...down(2),enter,enter,{name:'up'},enter]:[enter,...down(10),enter]),...events],{columns});
 const requests=[],preparations=[],executions=[],forces=[],order=[];let busy=false;
 session.setBusy=value=>{busy=value;};
 const blocked=result??{code:1,results:[],error:Object.assign(Error('Active dispatches block this operation'),{blockingDispatches:entries})};
 const code=await runTui({session,context:{env:{PATH:fixturePath}},output:{write(){}},services:{
  currentInstallState:()=>({mode:'composite',platforms:['claude','codex'],anchor:'claude'}),
  collectStatus:async()=>['codex','claude'].map(platform=>({platform,state:'installed',authentication:{authStatus:'authenticated'},cliVersion:{version:'1.0.0'}})),
  readCompositeConfig:async()=>({version:2,revision:'saved',platforms:['claude','codex'],roles}),
  loadCatalog:async platform=>({status:'ready',catalog:{platform,pairs:[{model:platform==='codex'?'gpt-6-luna':'sonnet',effort:'high'}]}}),
  prepareOperation:async(context,request)=>{requests.push({context,request,busy});order.push('prepare');if(requests.length===2&&prepareError)throw prepareError;const prepared={kind,options:request};preparations.push(prepared);return prepared;},
  executeOperation:async(context,prepared)=>{executions.push({context,prepared,busy});order.push('execute');return executions.length===1?blocked:retryResult??blocked;},
  forceFinishBlockingDispatches:async(context,entries)=>{forces.push({context,entries,busy});order.push('force');if(forceError)throw forceError;return forceResult;}
 }});
 return{session,code,requests,preparations,executions,forces,order};
}
test('blocked composite shows active dispatches and back cancels without force finishing',async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2026-11-17T12:00:00.000Z'));
 const entries=[0,60000,3600000,86400000].map((age,index)=>({...blockingEntry,dispatchId:`1234567${index}-native`,updatedAt:new Date(Date.now()-age).toISOString()}));
 const {session,code,forces,executions}=await blockedTui({entries});
 const screen=session.screens.find(screen=>screen.title==='Active dispatches');assert.ok(screen);
 assert.deepEqual(screen.rows,[
  '4 active dispatches block this change. 4 can be force finished.','',
  'ID        Role         Workflow  Route   State     Age',
  '12345670  Implementer  work      native  reserved  <1m',
  '12345671  Implementer  work      native  reserved  1m',
  '12345672  Implementer  work      native  reserved  1h 0m',
  '12345673  Implementer  work      native  reserved  1d 0h',
  '','Force finish and retry','Back'
 ]);
 assert.deepEqual(screen.notices,[blockingNotice]);
 assert.equal(screen.rows[screen.selected],'Back');assert.equal(forces.length,0);assert.equal(executions.length,1);assert.equal(code,1);
 assert.deepEqual(session.screens.filter(screen=>['Active dispatches','Result'].includes(screen.title)).map(screen=>screen.title),['Active dispatches','Result']);
 for(const [name,options]of [['no details',{result:{code:1,results:[],error:Error('Cannot read dispatches')}}],['install kind',{kind:'install'}],['interrupted',{result:{code:130,error:{message:'Interrupted',blockingDispatches:entries}}}],['session ended',{result:{code:1,exitSession:true,error:{message:'Ended',blockingDispatches:entries}}}]])await t.test(name,async()=>{
  const run=await blockedTui(options);assert.equal(run.session.screens.some(screen=>screen.title==='Active dispatches'),false);assert.equal(run.forces.length,0);assert.equal(run.executions.length,1);
 });
 await t.test('Escape returns home without a Result page',async()=>{const run=await blockedTui({events:[back,back]});assert.equal(run.forces.length,0);assert.equal(run.executions.length,1);assert.equal(run.session.screens.at(-1).title,'ARC');assert.equal(run.session.screens.some(screen=>screen.title==='Result'),false);});
});
test('force finish runs once, retries once, and does not offer it again',async t=>{
 for(const kind of ['composite','switch'])for(const success of [false,true])await t.test(kind+' retry '+(success?'succeeds':'is blocked again'),async()=>{
  const run=await blockedTui({kind,uninstall:kind==='switch',events:[{name:'up'},enter,enter,back],...(success?{retryResult:{code:0,results:[],messages:['Retry completed.']}}:{})});
  assert.equal(run.forces.length,1);assert.deepEqual(run.forces[0].entries,[blockingEntry]);assert.equal(run.forces[0].busy,true);
  assert.equal(run.requests.length,2);assert.equal(run.requests[1].request,run.requests[0].request);
  if(kind==='switch')assert.deepEqual(run.requests[1].request,{kind:'uninstall',target:'claude',removeCli:false,switchFromComposite:true});
  else{assert.equal(run.requests[1].request.target,'composite');assert.deepEqual(run.requests[1].request.platforms,['claude','codex']);}
  assert.equal(run.executions.length,2);assert.equal(run.executions[0].prepared,run.preparations[0]);assert.equal(run.executions[1].prepared,run.preparations[1]);assert.notEqual(run.preparations[0],run.preparations[1]);
  assert.ok([...run.requests,...run.executions].every(call=>call.busy&&call.context===run.forces[0].context));
  assert.deepEqual(run.order,['prepare','execute','force','prepare','execute']);
  assert.equal(run.session.screens.filter(screen=>screen.title==='Active dispatches'&&screen.rows[screen.selected]==='Back').length,1);
  const result=run.session.screens.filter(screen=>screen.title==='Result');assert.equal(result.length,1);assert.equal(run.code,success?0:1);assert.ok(result[0].rows.includes(success?'Retry completed.':'Exit code: 1'));
 });
});
test('force finish and re-prepare preserve cancellation and navigation control errors',async t=>{
 for(const stage of ['forceError','prepareError'])for(const code of ['ARC_CANCELLED','ARC_TUI_EOF','ARC_TUI_HOME'])await t.test(stage+' '+code,async()=>{
  const run=await blockedTui({[stage]:Object.assign(Error('Control flow'),{code}),events:[{name:'up'},enter,back]});
  assert.equal(run.session.screens.some(screen=>['Force finish','Operation unavailable','Result'].includes(screen.title)),false);
  assert.equal(run.code,code==='ARC_CANCELLED'?130:1);
  assert.equal(run.executions.length,1);assert.equal(run.forces.length,1);
  assert.equal(run.requests.length,stage==='prepareError'?2:1);
  assert.equal(run.session.closed,true);
  if(code==='ARC_TUI_HOME')assert.equal(run.session.screens.at(-1).title,'ARC');
 });
});
test('blocked dispatches show unknown for an invalid updatedAt',async()=>{
 const run=await blockedTui({entries:[{...blockingEntry,updatedAt:'invalid'}]});
 const screen=run.session.screens.find(screen=>screen.title==='Active dispatches');
 assert.equal(screen.rows[3],'12345678  Implementer  work      native  reserved  unknown');
});
test('no eligible entries shows a Back menu with only live bridge guidance',async()=>{
 const entry={...blockingEntry,dispatchId:'bridge-running',route:'bridge',state:'running',forceFinishable:false};
 const {session,forces,executions}=await blockedTui({entries:[entry]});
 const screen=session.screens.find(screen=>screen.title==='Active dispatches');assert.ok(screen);assert.equal(screen.mode,undefined);
 assert.deepEqual(screen.notices,['* Live bridge is not force finished. Cancel it first:','  node /home/codex/skills/arc/runtime/cli.mjs cancel --cwd <project> --workflow work --input -']);
 assert.equal(screen.rows[0],'1 active dispatch blocks this change. None can be force finished here.');
 assert.equal(screen.rows[screen.selected],'Back');assert.equal(screen.rows.includes('Force finish and retry'),false);
 assert.equal(screen.rowTones[3],'note');assert.match(screen.rows[3],/bridge\*/);
 assert.equal(forces.length,0);assert.equal(executions.length,1);
 assert.deepEqual(session.screens.filter(screen=>['Active dispatches','Result'].includes(screen.title)).map(screen=>screen.title),['Active dispatches','Result']);
});
test('active dispatches matches the approved 80 column native preview',async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2026-11-17T12:00:00.000Z'));
 const entries=[['0e757d6d','arc_planner','step3-adp-validation',372],['1889c800','arc_reviewer','step3-adp-validation',340],['403356e1','arc_planner','step4-consent-batch',1359],['9d06c5f5','arc_planner','step4-consent-batch',455],['c2e2d644','arc_reviewer','step4-consent-batch',390]].map(([dispatchId,role,workflowId,minutes])=>({...blockingEntry,dispatchId,role,workflowId,state:'running',updatedAt:new Date(Date.now()-minutes*60000).toISOString()}));
 const {session}=await blockedTui({entries,columns:80}),screen=session.screens.find(screen=>screen.title==='Active dispatches');
 assert.deepEqual(screen.rows,[
  '5 active dispatches block this change. 5 can be force finished.','',
  'ID        Role      Workflow              Route   State    Age',
  '0e757d6d  Planner   step3-adp-validation  native  running  6h 12m',
  '1889c800  Reviewer  step3-adp-validation  native  running  5h 40m',
  '403356e1  Planner   step4-consent-batch   native  running  22h 39m',
  '9d06c5f5  Planner   step4-consent-batch   native  running  7h 35m',
  'c2e2d644  Reviewer  step4-consent-batch   native  running  6h 30m',
  '','Force finish and retry','Back'
 ]);
 assert.deepEqual(screen.notices,[blockingNotice]);assert.equal(screen.rows[screen.selected],'Back');
 const rendered=renderScreen(screen,session.viewport()),lines=rendered.text.split('\n');
 assert.deepEqual(wrapDetailRows(screen.notices,80),['Force finish marks the native/reserved entries cancelled. Native agents in','other sessions are not stopped.']);
 for(const row of wrapDetailRows(screen.notices,80)){const line=lines.indexOf('  '+row);assert.ok(line>=0);assert.ok(rendered.styles.find(style=>style.line===line)?.runs.every(run=>run.role==='warn'));}
});
test('mixed live bridge rows are marked yellow and cancel commands deduplicate by home and workflow',async t=>{
 t.mock.method(Date,'now',()=>Date.parse('2026-11-17T00:01:00.000Z'));
 const bridge={...blockingEntry,dispatchId:'bridge01-live',role:'arc_reviewer',route:'bridge',state:'running',forceFinishable:false};
 const entries=[blockingEntry,bridge,{...bridge,dispatchId:'bridge02-live'},{...bridge,dispatchId:'bridge03-live',home:'/home/claude'},{...bridge,dispatchId:'bridge04-live',workflowId:'other'},{...bridge,dispatchId:'bridge05-reserved',state:'reserved',forceFinishable:true}];
 const {session}=await blockedTui({entries,columns:80}),screen=session.screens.find(screen=>screen.title==='Active dispatches');
 assert.equal(screen.rows[0],'6 active dispatches block this change. 2 can be force finished.');
 assert.deepEqual(screen.rows.slice(2,9),[
  'ID        Role         Workflow  Route    State     Age',
  '12345678  Implementer  work      native   reserved  1m',
  'bridge01  Reviewer     work      bridge*  running   1m',
  'bridge02  Reviewer     work      bridge*  running   1m',
  'bridge03  Reviewer     work      bridge*  running   1m',
  'bridge04  Reviewer     other     bridge*  running   1m',
  'bridge05  Reviewer     work      bridge   reserved  1m'
 ]);
 assert.deepEqual(screen.rowTones.slice(3,9),[undefined,'note','note','note','note',undefined]);
 assert.deepEqual(screen.notices,['* Live bridge is not force finished. Cancel it first:',
  '  node /home/codex/skills/arc/runtime/cli.mjs cancel --cwd <project> --workflow work --input -',
  '  node /home/claude/skills/arc/runtime/cli.mjs cancel --cwd <project> --workflow work --input -',
  '  node /home/codex/skills/arc/runtime/cli.mjs cancel --cwd <project> --workflow other --input -',blockingNotice]);
 const rendered=renderScreen(screen,session.viewport()),lines=rendered.text.split('\n');
 for(const row of screen.rows.filter(row=>row.includes('bridge*'))){const line=lines.indexOf('  '+row);assert.ok(line>=0);assert.deepEqual(rendered.styles.find(style=>style.line===line)?.runs.map(run=>run.role),['warn']);}
});
test('active dispatch summary handles singular eligible and plural ineligible entries',async()=>{
 const single=await blockedTui();assert.equal(single.session.screens.find(screen=>screen.title==='Active dispatches').rows[0],'1 active dispatch blocks this change. 1 can be force finished.');
 const entries=[blockingEntry,{...blockingEntry,dispatchId:'other'}].map(entry=>({...entry,route:'bridge',forceFinishable:false}));
 const none=await blockedTui({entries});assert.equal(none.session.screens.find(screen=>screen.title==='Active dispatches').rows[0],'2 active dispatches block this change. None can be force finished here.');
 const escaped=await blockedTui({entries,events:[back,back]});assert.equal(escaped.session.screens.some(screen=>screen.title==='Result'),false);assert.equal(escaped.session.screens.at(-1).title,'ARC');
});
test('active dispatch roles use install display names and preserve unknown roles',async()=>{
 const roles=['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer','custom_role'];
 const {session}=await blockedTui({entries:roles.map(role=>({...blockingEntry,role}))});
 const screen=session.screens.find(screen=>screen.title==='Active dispatches');
 assert.deepEqual(screen.rows.slice(3,9).map(row=>row.split(/ {2,}/)[1]),['Scouter','Planner','Implementer','QA','Reviewer','custom_role']);
});
test('narrow active dispatch table shortens workflow first and then truncates row ends by cell width',async t=>{
 const width=text=>[...escapeTerminalText(text)].reduce((sum,character)=>sum+cellWidth(character),0);
 for(const role of ['arc_planner','unusually_long_unknown_role'])await t.test(role,async()=>{
  const {session}=await blockedTui({columns:60,entries:[{...blockingEntry,role,workflowId:'very-long-workflow-validation',updatedAt:'invalid'}]});
  const screen=session.screens.find(screen=>screen.title==='Active dispatches'),header=screen.rows.findIndex(row=>row.startsWith('ID ')),table=screen.rows.slice(header,header+2);
  assert.equal(table.length,2);assert.ok(table.every(row=>width(row)<=57));assert.match(table[1],/…/);
  if(role==='arc_planner')assert.equal(table[1],'12345678  Planner  very-long…  native  reserved  unknown');
  else assert.match(table[1],/12345678  unusually_long_unknown_role  very-l…  native.*…$/);
  assert.deepEqual(wrapDetailRows(table,60),table);
 });
 await t.test('wide and escaped values',async()=>{
  const {session}=await blockedTui({columns:60,entries:[{...blockingEntry,role:'QA',workflowId:'검증\t작업-with-a-long-suffix',updatedAt:'invalid'}]});
  const screen=session.screens.find(screen=>screen.title==='Active dispatches'),header=screen.rows.findIndex(row=>row.startsWith('ID ')),table=screen.rows.slice(header,header+2);
  assert.ok(table.every(row=>width(row)<=57));assert.match(table[1],/검증\\x09.*…/);assert.deepEqual(wrapDetailRows(table,60),table);
 });
});
test('skipped or failed force finish reports and does not retry',async t=>{
 const cases=[
  ['changed',{forceResult:{finished:['other'],skipped:[{dispatchId:blockingEntry.dispatchId,reason:'changed'}],residualPaths:[]}},['Finished: other','Skipped: 12345678-native (changed)']],
  ['residual',{forceResult:{finished:[blockingEntry.dispatchId],skipped:[],residualPaths:['/x.lock']}},['Finished: 12345678-native','Residual path: /x.lock']],
  ['force error',{forceError:Object.assign(Error('Lock release failed'),{residualPaths:['/x.lock']})},['Lock release failed','Residual path: /x.lock']],
  ['partial force error',{forceError:Object.assign(Error('Cannot read next lease'),{forceFinish:{finished:['already-finished'],skipped:[]},residualPaths:['/x.lock']})},['Finished: already-finished','Cannot read next lease','Residual path: /x.lock']],
  ['prepare error',{prepareError:Error('Cannot prepare retry')},['Cannot prepare retry']]
 ];
 for(const [name,options,rows]of cases)await t.test(name,async()=>{
  const run=await blockedTui({...options,events:[{name:'up'},enter,enter,back]});
  const screen=run.session.screens.find(screen=>screen.title==='Force finish');assert.ok(screen);assert.deepEqual(screen.rows,[...rows,'Configure was not retried.']);
  assert.equal(run.forces.length,1);assert.equal(run.executions.length,1);assert.equal(run.requests.length,name==='prepare error'?2:1);assert.equal(run.code,1);
  assert.equal(run.session.screens.some(screen=>['Result','Operation unavailable'].includes(screen.title)),false);
 });
});
for(const columns of [100,40])test('Status groups migration notes and aligns wrapped table values at '+columns+' columns',async()=>{
 const {runTui}=await load(),session=terminal([...down(1),enter,enter,back]);session.viewport=()=>({columns,rows:40});
 const message='Mixed routing will move to the Claude home the next time you apply Configure.';
 const statuses=['gemini','codex','claude'].map(platform=>({platform,state:'installed',cliVersion:{version:'0.68.0'},authentication:platform==='gemini'?{authStatus:'unknown',reason:'auth_unverified'}:{authStatus:'authenticated'},diagnostics:platform==='gemini'?[]:[{message}]}));
 await runTui({session,context:{env:{PATH:fixturePath}},services:{collectStatus:async()=>statuses,currentInstallState:()=>({mode:'composite',platforms:['claude','codex']}),prepareOperation:async(_context,request)=>{assert.deepEqual(request,{kind:'update'});return statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false});},executeOperation:async()=>assert.fail('Status cannot execute')}});
 const screen=session.screens.find(screen=>screen.title==='Status');
 const notes=columns===100?['• '+message+' (Claude, Codex)']:['• Mixed routing will move to the','  Claude home the next time you apply','  Configure. (Claude, Codex)'];
 const gemini=columns===100?['Gemini         Available · auth unverified']:['Gemini         Available · auth','               unverified'];
 assert.deepEqual(screen.rows,['Installed on   Mixed (Claude + Codex)','','Claude         Available','Codex          Available',...gemini,'','Version        1.0.0 · up to date','','Notes',...notes,'','Back']);
 assert.equal(screen.rows[screen.selected],'Back');assert.equal(session.screens.at(-1).title,'ARC');
 const rendered=renderScreen(screen,session.viewport()),lines=rendered.text.split('\n');
 const colors=rendered.styles.flatMap(style=>style.runs.filter(run=>['ok','warn','error','muted'].includes(run.role)).map(run=>[lines[style.line].slice(run.from,run.to),run.role]));
 assert.deepEqual(colors.slice(0,3),[['Available','ok'],['Available','ok'],['Available','warn']]);
 assert.ok(colors.slice(3).every(([,role])=>role==='warn'));assert.equal(colors.length,3+notes.length);
});
test('Status humanizes and deduplicates authentication notes and omits repeated state reasons',async()=>{
 const {runTui}=await load(),session=terminal([...down(1),enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[
  {platform:'codex',state:'installed',authentication:{authStatus:'unknown',reason:'auth_check_failed'},diagnostics:[{message:'auth check failed'}]},
  {platform:'claude',state:'installed',authentication:{authStatus:'unauthorized',reason:'unauthorized'},diagnostics:[]}
 ]}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Status').rows,['Installed on   Claude, Codex','','Claude         Unauthorized','Codex          Incomplete','','Version        1.0.0 · up to date','','Notes','• auth check failed (Codex)','','Back']);
});
test('Status humanizes embedded authentication codes while preserving diagnostic paths verbatim',async()=>{
 const {runTui}=await load(),session=terminal([...down(1),enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[
  {platform:'codex',state:'installed',authentication:{authStatus:'unknown',reason:'auth_unverified: probe failed; not_installed'},diagnostics:[{message:'Cannot read /tmp/role_config.json'},{message:'Diagnostic: role_config'}]},
  {platform:'gemini',state:'installed',cliVersion:{version:'0.68.0'},authentication:{authStatus:'unknown',reason:'auth_unverified'},diagnostics:[]}
 ]}});
 const rows=session.screens.find(screen=>screen.title==='Status').rows;
 assert.deepEqual(rows.filter(row=>row.startsWith('• ')),['• Cannot read /tmp/role_config.json (Codex)','• Diagnostic: role_config (Codex)','• auth unverified: probe failed; not installed (Codex)']);
 assert.doesNotMatch(rows.join('\n'),/auth_unverified|not_installed/);
});
for(const platform of ['codex','gemini'])test('Status converts whole diagnostic codes before row-repeat suppression for '+platform,async()=>{
 const {runTui}=await load(),session=terminal([...down(1),enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[
  {platform,state:'installed',cliVersion:{version:'0.68.0'},authentication:platform==='gemini'?{authStatus:'unknown',reason:'auth_unverified'}:{authStatus:'authenticated'},diagnostics:[{message:'auth_unverified'},{message:' auth_unverified '}]}
 ]}});
 const rows=session.screens.find(screen=>screen.title==='Status').rows;
 assert.deepEqual(rows.filter(row=>row.startsWith('• ')),platform==='codex'?['• auth unverified (Codex)']:[]);
 assert.equal(rows.includes('Notes'),platform==='codex');
 assert.doesNotMatch(rows.join('\n'),/auth_unverified/);
});
test('uninstall rows follow display order and mark not installed without selecting them',async()=>{
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,...down(1),enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:'codex',state:'incomplete'},{platform:'claude',state:'absent'}],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[{platform:'codex',status:'uninstalled'}]})}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Uninstall').rows,['Claude  (not installed)','Codex','Gemini  (not installed)','Grok  (not installed)','Everything (incl. CLI)','Back']);
 assert.ok(!session.screens.some(screen=>screen.rows.includes('Remove ARC from Claude?')));
 assert.deepEqual(prepared,{kind:'uninstall',target:'codex',removeCli:false});
 assert.ok(session.screens.some(screen=>screen.title==='Result'&&screen.rows.includes('Removed from Codex.')));
});
test('uninstall uses injected registry display order and labels for four platforms',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{runTui}=await load(),session=terminal([...down(2),enter,...down(2),enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{env:{PATH:fixturePath},platforms:createTestRegistries(['eta','zeta','codex','claude']).platforms},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:'eta',state:'absent'},{platform:'zeta',state:'installed'},{platform:'codex',state:'installed'},{platform:'claude',state:'installed'}],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[{platform:'zeta',status:'uninstalled'}]})}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Uninstall').rows,['Claude','Codex','Zeta','Eta  (not installed)','Everything (incl. CLI)','Back']);
 assert.ok(session.screens.some(screen=>screen.rows[0]==='Remove ARC from Zeta?'));
 assert.equal(prepared.target,'zeta');assert.ok(session.screens.some(screen=>screen.title==='Result'&&screen.rows.includes('Removed from Zeta.')));
});
for(const target of ['zeta','all'])test('uninstall '+target+' outside composite participants does not request a switch',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{runTui}=await load(),session=terminal([...down(2),enter,...down(target==='all'?3:2),enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{env:{PATH:fixturePath},platforms:createTestRegistries().platforms},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex'],anchor:'claude'}),currentInstallMode:()=> 'composite',collectStatus:async()=>[...installedStatuses(),{platform:'zeta',state:'installed'}],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[]})}});
 assert.deepEqual(prepared,{kind:'uninstall',target,removeCli:target==='all'});
 const confirmation=session.screens.find(screen=>screen.rows.includes('Remove'));assert.ok(confirmation);assert.deepEqual(confirmation.rows,[target==='all'?'Remove ARC from all platforms and the arc CLI?':'Remove ARC from Zeta?','','Remove','Back']);
});
test('result wording preserves management message order, registry labels and failure diagnostics',async t=>{
 const {resultRows}=await load(),{createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),registry=createTestRegistries().platforms;
 await t.test('single removal',()=>assert.deepEqual(resultRows({code:0,results:[{platform:'codex',status:'uninstalled'}]}),['Removed from Codex.']));
 await t.test('injected removal label',()=>assert.deepEqual(resultRows({code:0,results:[{target:{platform:'zeta'},status:'uninstalled'}]},registry),['Removed from Zeta.']));
 await t.test('injected install label preserves routing message',()=>assert.deepEqual(resultRows({code:0,results:[{platform:'zeta',status:'installed'}],messages:['Mixed routing on: Claude + Zeta.']},registry),['Mixed routing on: Claude + Zeta.','ARC installed for Zeta.']));
 for(const [status,message]of [['removed','Removed ARC and CLI.'],['absent','Removed ARC.']])await t.test('Everything CLI '+status,()=>assert.deepEqual(resultRows({code:0,messages:['Mixed routing turned off.','Dispatch history stays in /old/arc-role-dispatch.'],results:[{platform:'claude',status:'uninstalled'},{platform:'codex',status:'uninstalled'}],cli:{status}}),['Mixed routing turned off.','Dispatch history stays in /old/arc-role-dispatch.',message]));
 await t.test('failure keeps one-line errors and deduplicated residuals',()=>assert.deepEqual(resultRows({code:7,messages:['Mixed routing turned off.','Residual path: /tmp/remains'],results:[{platform:'codex',status:'uninstalled'},{platform:'claude',status:'failed',error:Error('failure\nsecond line'),residualPaths:['/tmp/remains','/tmp/other']}],error:Error('operation failed\nmore detail')}),['Mixed routing turned off.','Residual path: /tmp/remains','Removed from Codex.','claude: failed','Residual path: /tmp/other','Error: failure','Error: operation failed','Exit code: 7']));
});
test('install result rows prefer result version then supplied version and preserve unknown-version output',async()=>{
 const {resultRows}=await load(),{createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),registry=createTestRegistries().platforms;
 for(const [version,options,want]of [['1.2.3',{version:'9.9.9'},'ARC 1.2.3 installed for Zeta.'],[null,{version:'2.3.4'},'ARC 2.3.4 installed for Zeta.'],[undefined,{},'ARC installed for Zeta.']]){
  const result={code:0,version,results:[{target:{platform:'zeta'},status:'installed'}]};
  assert.deepEqual(resultRows(result,registry,options),[want]);
 }
});
test('Status upgrade success reports the prepared latest version',async()=>{
 const {runTui}=await load();for(const exitSession of [false,true]){const session=terminal([...down(1),enter,{name:'up'},enter,enter,back]);let output='';
 await runTui({session,output:{write:text=>{output+=text;}},context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},currentVersion:'0.3.5',latestVersion:'0.3.6',canUpgrade:true}),executeOperation:async()=>({code:0,exitSession,results:[]})}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Result').rows,['ARC updated: 0.3.5 → 0.3.6.']);if(exitSession)assert.equal(output,'ARC updated: 0.3.5 → 0.3.6.\n');}
});
test('menu reevaluates dynamic info with selection and resized viewport while preserving array info',async()=>{
 const{createTuiInterface}=await load();let viewport={columns:80,rows:24};const events=[{name:'down'},{name:'resize',viewport:{columns:60,rows:18}},{name:'down'},{name:'up'},enter],session=terminal([]),calls=[];session.viewport=()=>viewport;session.nextEvent=async()=>{const event=events.shift();if(event.viewport)viewport=event.viewport;return event;};let selected;
 await assert.doesNotReject(async()=>{selected=await createTuiInterface(session).menu('Menu',['One','Two','Three'],{info:state=>{calls.push({...state});return['Item '+state.selected];}});});assert.equal(selected,1);assert.deepEqual(calls.map(call=>call.selected),[0,1,1,2,1]);assert.deepEqual(calls[2],{selected:1,columns:60,rows:18});assert.equal(session.screens.at(-1).rows[0],'Item 1');
 const plain=terminal([enter]);assert.equal(await createTuiInterface(plain).menu('Menu',['One'],{info:['Details']}),0);assert.deepEqual(plain.screens[0].rows,['Details','','One']);
});
for(const target of ['codex','claude'])test('TUI install '+target+' preview reads the same model source as Apply',async()=>{
 const{runTui}=await load(),config=loadModelConfig(readFileSync(new URL('../../'+target+'/skill/models.toml',import.meta.url)),target);config.roles.arc_planner.model='custom-model';
 const session=terminal([enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath},packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:target,state:'installed',settings:{modelConfig:config}}],prepareOperation:async()=>assert.fail('editor must not prepare'),executeOperation:async()=>assert.fail('editor must not execute')}});
 const editor=session.screens.find(screen=>screen.title==='Configure');assert.ok(editor);assert.match(editor.rows.join('\n'),/custom-model/);
});

test('home navigation never executes and retains failure until a new execution',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,{name:'up'},enter,enter,back,...down(2),enter]);let calls=0;const code=await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>{calls++;return{code:1,results:[{platform:'codex',status:'failed',rollback:'complete',residualPaths:['/tmp/remains']}]};}}});assert.equal(calls,1);assert.equal(code,1);assert.ok(session.screens.some(s=>s.rows.includes('Configure')));assert.ok(session.screens.some(s=>s.title==='Result'&&s.rows.some(r=>r.includes('claude: failed')||r.includes('codex: failed'))));assert.equal(session.closed,true);});
test('global replacement exits before rendering home again',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,{name:'up'},enter]);const code=await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code:0,exitSession:true,results:[]})}});assert.equal(code,0);assert.equal(session.screens.filter(s=>s.title==='ARC').length,2);assert.equal(session.screens.at(-1).title,'Result');});
test('interrupt during Status selection exits 130 without execution',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,{name:'interrupt'}]);let calls=0;assert.equal(await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>{calls++;}}}),130);assert.equal(calls,0);assert.equal(session.closed,true);});
test('Ctrl+C during asynchronous execution aborts the service and exits 130',async()=>{const{EventEmitter}=await import('node:events');const{runTui}=await load();const input=new EventEmitter(),session=terminal([...down(1),enter,{name:'up'},enter]);const code=await runTui({input,session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async context=>{const waiting=new Promise(resolve=>context.signal?.addEventListener('abort',()=>resolve({code:130,results:[]}),{once:true}));input.emit('data',Buffer.from('\x03'));return Promise.race([waiting,new Promise(resolve=>setTimeout(()=>resolve({code:0,results:[]}),50))]);}}});assert.equal(code,130);assert.equal(input.listenerCount('data'),0);});
test('mixed target result keeps success alongside failed rollback and residual paths',async()=>{
 const{runTui}=await load();
 const session=terminal([...down(1),enter,{name:'up'},enter,enter,...down(2),enter]);
 const code=await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',
  collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),
  executeOperation:async()=>({code:1,exitSession:false,results:[
   {platform:'codex',status:'installed',rollback:'not-needed',residualPaths:[]},
   {platform:'claude',status:'failed',rollback:'complete',residualPaths:['/tmp/claude-residual'],error:Error('fixture target failure')}
  ]})
 }});
 const rows=session.screens.filter(s=>s.title==='Result').flatMap(s=>s.rows).join('\n');
 assert.match(rows,new RegExp(`ARC ${packageVersion.replaceAll('.','\\.')} installed for Codex\\.`));
 assert.match(rows,/claude: failed/);
 assert.match(rows,/Residual path: \/tmp\/claude-residual/);
 assert.match(rows,/fixture target failure/);
 assert.equal(code,1);
});

test('global update child diagnostics remain visible in the TUI result',async()=>{
 const{runTui}=await load();const session=terminal([...down(1),enter,{name:'up'},enter]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code:1,exitSession:true,results:[],stdout:'codex: installed; rollback: not-needed\nclaude: failed; rollback: failed\nResidual path: /tmp/recovery\n',stderr:'Error: restore failed; manual recovery required\n'})}});
 const rows=session.screens.at(-1).rows.join('\n');assert.match(rows,/codex: installed/);assert.match(rows,/claude: failed/);assert.match(rows,/Residual path: \/tmp\/recovery/);assert.match(rows,/manual recovery required/);
});
test('interrupted execution reports completed cleanup after terminal restoration for Ctrl+C and signals',async()=>{
 const{EventEmitter}=await import('node:events');const{runTui}=await load();
 for(const trigger of ['Ctrl+C','SIGINT','SIGTERM']){
  const signals=new EventEmitter(),input=new EventEmitter(),session=terminal([...down(1),enter,{name:'up'},enter]);let output='';
  const code=await runTui({signals,input,session,output:{write(text){assert.equal(session.closed,true);output+=text;}},context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async context=>{if(trigger==='Ctrl+C')input.emit('data',Buffer.from('\x03'));else signals.emit(trigger);assert.equal(context.signal.aborted,true);return{code:130,results:[{platform:'codex',status:'installed',rollback:'not-needed'},{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/cancel-recovery'],error:Error('cleanup failed')},{platform:'other',status:'not-started'}]};}}});
  assert.equal(code,130);assert.match(output,new RegExp(`ARC ${packageVersion.replaceAll('.','\\.')} installed for Codex\\.`));assert.match(output,/claude: failed/);assert.match(output,/Residual path: \/tmp\/cancel-recovery/);assert.match(output,/cleanup failed/);assert.match(output,/other: not-started/);assert.match(output,/Exit code: 130/);assert.doesNotMatch(output,/rollback/i);
 }
});
test('post-disposal reports escape terminal controls while retaining diagnostic rows',async()=>{
 const{runTui}=await load();
 for(const code of [1,130]){
  const session=terminal([...down(1),enter,{name:'up'},enter]);let output='';
  const actualCode=await runTui({session,output:{write(text){assert.equal(session.closed,true);output+=text;}},context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code,exitSession:true,stdout:'codex: installed\nchild: \x1b[2Jkeep\rdiagnostic\n',stderr:'Error: child\x07 failure\n',results:[{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/\x1b[31mrecovery\rpath'],error:Error('restore\x08 failed')}]})}});
  assert.equal(actualCode,code);assert.ok(output.startsWith('codex: installed\nchild: \\x1b[2Jkeep\\x0ddiagnostic\nError: child\\x07 failure\n'));
  assert.ok(output.includes('Residual path: /tmp/\\x1b[31mrecovery\\x0dpath\n'));assert.ok(output.includes('Error: restore\\x08 failed\n'));assert.ok(output.includes('Exit code: '+code+'\n'));
  assert.doesNotMatch(output,/[\x00-\x09\x0b-\x1f\x7f]/);assert.ok(output.endsWith('\n'));
 }
});

test('home menu is exactly four actions with no information below the logo',async()=>{
 const{runTui}=await load();const session=terminal([back]);let calls=0;
 const code=await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{calls++;},executeOperation:async()=>{calls++;},listWorkflows:async()=>assert.fail('hidden Workflow must not run')}});
 assert.equal(code,0);assert.equal(calls,0);assert.equal(session.closed,true);assert.equal(session.screens.length,1);
 assert.deepEqual(session.screens[0].rows.slice(session.screens[0].selected),['Configure','Status','Uninstall','Exit']);assert.equal(session.screens[0].selected,0);assert.equal(session.screens[0].wordmark,true);assert.equal(session.screens[0].rowTones,undefined);assert.doesNotMatch(session.screens[0].rows.join('\n'),/Available|Mode:/);assert.match(session.screens[0].hint,/Esc Exit/);
});
test('install goes straight to diagram',async()=>{
 const{runTui}=await load(),session=terminal([enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath},packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[]}});
 assert.deepEqual(session.screens.map(s=>s.title),['ARC','Configure','ARC']);
 assert.match(session.screens[1].rows.join('\n'),/┌─ > Scouter/);assert.ok(session.screens[1].rows.some(row=>row.startsWith('Apply - ')));assert.equal(session.closed,true);
});

test('idle Escape uses home control signal from all interface screens',async()=>{const{createTuiInterface}=await load();for(const mode of ['menu','text','page']){const ui=createTuiInterface(terminal([back]));await assert.rejects(()=>ui[mode]('Task',mode==='text'?'100':['One']),{code:'ARC_TUI_HOME'});}assert.equal(await createTuiInterface(terminal([back])).menu('ARC',['Exit'],{backLabel:'exit'}),null);});
test('Status preparation failure shows a note without exposing Apply or executing',async()=>{
 const{runTui}=await load();const session=terminal([...down(1),enter,{name:'up'},enter,back]);let executes=0;assert.equal(await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{throw Error('fixture preparation failed');},executeOperation:async()=>{executes++;}}}),0);assert.equal(executes,0);assert.ok(session.screens.some(s=>s.rows.includes('• fixture preparation failed')));assert.ok(!session.screens.some(s=>s.title.startsWith('Review ')));
});
test('all screen types use contextual compact hints while retaining existing navigation',async()=>{
 const{createTuiInterface}=await load();const session=terminal([back,back,back,back,back]);const ui=createTuiInterface(session);
 for(const action of [()=>ui.menu('Configure',['Configure','Status']),()=>ui.text('Maximum total subagents','100'),()=>ui.page('Result',['Exit code: 0']),()=>ui.page('Operation unavailable',['fixture failure'])])await assert.rejects(action,{code:'ARC_TUI_HOME'});await ui.busy(async()=>({code:0}));
 const hints=Object.fromEntries(session.screens.map(screen=>[screen.title,screen.hint]));
 assert.equal(hints.Configure,'↑/↓: Select · Enter Continue · Esc Home');assert.equal(hints['Maximum total subagents'],'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home');assert.equal(hints.Result,'↑/↓: Scroll · Enter Back · Esc Home');assert.equal(hints['Operation unavailable'],'↑/↓: Scroll · Enter Back · Esc Home');assert.equal(hints.Working,'Ctrl+C Interrupt');
});

for(const ending of [enter,back])test('Status preserves ordered information and returns home without operations on '+ending.name,async()=>{
 const{runTui}=await load(),session=terminal([...down(1),enter,ending,back]);
 const code=await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:'codex',state:'incomplete',diagnostics:[Error('bad config\x1b[2J')]},{platform:'claude',state:'installed',diagnostics:[]}],prepareOperation:async(_context,request)=>{assert.deepEqual(request,{kind:'update'});return statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false});},executeOperation:async()=>assert.fail('Status must not execute')}});
 assert.equal(code,0);const status=session.screens.find(screen=>screen.title==='Status');assert.ok(status);assert.deepEqual(status.rows,['Installed on   Claude','','Claude         Available','Codex          Incomplete','','Version        1.0.0 · up to date','','Notes','• bad config\\x1b[2J (Codex)','','Back']);assert.deepEqual(status.rowTones,[undefined,undefined,'platform-status','platform-status',undefined,undefined,undefined,undefined,'note',undefined,undefined]);assert.equal(status.selected,10);assert.equal(status.wordmark,false);
 assert.equal(session.screens.at(-1).title,'ARC');assert.equal(session.screens.at(-1).rows[session.screens.at(-1).selected],'Status');assert.ok(session.screens.filter(screen=>screen.title==='ARC').every(screen=>screen.rows.length===4&&screen.rowTones===undefined));
});
test('Status with one collected target does not invent the missing target',async()=>{
 const{runTui}=await load(),session=terminal([...down(1),enter,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:'codex',state:'absent',diagnostics:[]}]}});assert.deepEqual(session.screens.find(screen=>screen.title==='Status').rows,['Installed on   Not installed','','Codex          Not Available','','Version        1.0.0 · up to date','','Back']);
});

test('home exposes direct lifecycle actions in approved order',async()=>{const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[]}});assert.deepEqual(session.screens[0].rows.slice(session.screens[0].selected),['Configure','Status','Uninstall','Exit']);});
test('menu keeps actions adjacent and separates info by one blank',async()=>{const{createTuiInterface}=await load();const session=terminal([...down(1),enter]);assert.equal(await createTuiInterface(session).menu('Check',['Upgrade'],{backRow:true,info:['1.9.0 → 1.10.0']}),null);assert.deepEqual(session.screens[0].rows,['1.9.0 → 1.10.0','','Upgrade','Back']);assert.equal(session.screens[0].selected,2);assert.equal(session.screens.at(-1).selected,3);const trailing=terminal([enter]);assert.equal(await createTuiInterface(trailing).menu('Menu',['One'],{info:['A','']}),0);assert.deepEqual(trailing.screens[0].rows,['A','','One']);const plain=terminal([enter]);assert.equal(await createTuiInterface(plain).menu('Menu',['One'],{backRow:true}),0);assert.deepEqual(plain.screens[0].rows,['One','Back']);});
test('empty actions ignore Enter and navigation with no pointer until Escape',async()=>{const{createTuiInterface}=await load();const session=terminal([enter,...down(1),{name:'up'},back]);await assert.rejects(()=>createTuiInterface(session).menu('Status',[],{info:['Up to date (1.10.0)']}),{code:'ARC_TUI_HOME'});assert.equal(session.screens.length,4);assert.ok(session.screens.every(s=>s.selected===undefined));});
test('hidden Apply cannot run until resized to show the selected row',async()=>{const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([enter,back]);session.viewport=()=>({columns:12,rows:2});session.render=s=>{session.screens.push(s);return renderScreen(s,session.viewport());};await assert.rejects(()=>createTuiInterface(session).menu('Configure',['Run mode','Apply'],{selected:1}),{code:'ARC_TUI_HOME'});});
test('Status upgrade defaults Back and is a selected row and executes the displayed snapshot without review',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,{name:'up'},enter,enter,back]);const prepared={kind:'update',state:{targets:[{target:{platform:'codex'}}]},currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true};let preparations=0,executed;await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{preparations++;return prepared;},executeOperation:async(c,p)=>{executed=p;return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executed,prepared);const screen=session.screens.find(s=>s.title==='Status');assert.equal(screen.rows[screen.selected],'Back');assert.deepEqual(screen.rows,['Installed on   Not installed','','','Version        1.9.0 → 1.10.0','','Upgrade','Back']);assert.ok(session.screens.some(s=>s.title==='Status'&&s.rows[s.selected]==='Upgrade'));assert.ok(!session.screens.some(s=>s.title.startsWith('Review')));});
test('unavailable version selects Back and Enter returns home without execution',async()=>{const{runTui}=await load();for(const latestVersion of ['1.9.0','1.8.0',null]){const session=terminal([...down(1),enter,enter,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},currentVersion:'1.9.0',latestVersion,canUpgrade:false}),executeOperation:async()=>assert.fail('no upgrade')}});for(const screen of session.screens.filter(s=>s.title==='Status')){assert.equal(screen.rows[screen.selected],'Back');assert.deepEqual(screen.rows.slice(-2),['','Back']);assert.ok(!screen.rows.includes('Version Upgrade'));}}});

test('CLI uninstall status and error remain visible beside harness partial results',async()=>{const{resultRows}=await load();const rows=resultRows({code:1,exitSession:true,results:[{platform:'codex',status:'uninstalled'}],cli:{status:'failed',error:Error('npm failure')}}).join('\n');assert.match(rows,/CLI: failed/);assert.match(rows,/npm failure/);assert.match(rows,/CLI removal ended this session/);});

test('generic text Save returns edited string and Back returns null while editing selected actions',async()=>{const{createTuiInterface}=await load();const session=terminal([{name:'backspace'},{name:'paste',text:'€'},{name:'down'},{name:'text',text:'x'},{name:'backspace'},{name:'up'},enter]);assert.equal(await createTuiInterface(session).text('Input','12'),'1€');assert.deepEqual(session.screens[0].rows,['12','','Save','Back','']);assert.equal(session.screens[0].selected,2);assert.ok(session.screens.every(screen=>['Save','Back'].includes(screen.rows[screen.selected])));const cancel=terminal([{name:'down'},{name:'text',text:'discard'},enter]);assert.equal(await createTuiInterface(cancel).text('Input','old'),null);assert.equal(cancel.screens.at(-1).selected,3);assert.equal(cancel.screens.at(-1).rows[cancel.screens.at(-1).selected],'Back');});
test('Backspace on menu and page never navigates',async()=>{const{createTuiInterface}=await load();for(const mode of ['menu','page']){const session=terminal([{name:'backspace'},enter]);assert.equal(await createTuiInterface(session)[mode]('Task',['One']),mode==='menu'?0:true);assert.equal(session.screens.length,2);}});
test('viewport menu window follows selected action on resize without dropping required information',async()=>{const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([...down(11),enter]);session.viewport=()=>({columns:100,rows:9});session.render=s=>{session.screens.push(s);return renderScreen(s,session.viewport());};assert.equal(await createTuiInterface(session).menu('Menu',Array.from({length:12},(_,i)=>'Action '+i)),11);assert.equal(session.screens.at(-1).rows.at(-1),'Action 11');assert.ok(session.screens.at(-1).position);});
test('input Save returns to Configure without preparing or executing an install',async()=>{const{runTui}=await load();const session=terminal([enter,...down(8),enter,{name:'backspace'},{name:'backspace'},{name:'backspace'},{name:'text',text:'42'},enter,back,back]);let prepares=0,executes=0;await runTui({session,context:{env:{PATH:fixturePath},packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{prepares++;return{kind:'install'};},executeOperation:async()=>{executes++;return{code:0,results:[]};}}});assert.equal(prepares,0);assert.equal(executes,0);assert.ok(session.screens.some(s=>s.title==='Configure'&&s.rows.some(row=>/^Total subagents +42$/.test(row))));assert.equal(session.screens.filter(s=>s.title==='Working').length,0)});

test('idle Escape reaches home from every nested lifecycle screen without executing prepared actions',async()=>{
 const{runTui}=await load(),{fileURLToPath}=await import('node:url'),packageRoot=fileURLToPath(new URL('../../',import.meta.url));const scenarios=[
 ['diagram',[enter]],['Configure Run mode',[enter,...down(6),enter]],['chooser',[enter,enter,...down(1),enter]],['input',[enter,...down(8),enter]],
 ['uninstall target',[...down(2),enter]],['global choice',[...down(2),enter,enter]],
 ['error',[...down(1),enter]],['Result',[...down(1),enter,{name:'up'},enter]]
 ];
 for(const[name,events]of scenarios){const session=terminal([...events,back,back]);let executed=0;await runTui({session,context:{env:{PATH:fixturePath},packageRoot},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>installedStatuses(),prepareOperation:async(c,o)=>{if(name==='error')throw Error('fixture');return{kind:o.kind,options:o,plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true};},executeOperation:async()=>{executed++;return{code:0,results:[]};}}});assert.equal(executed,name==='Result'?1:0,name);assert.equal(session.screens.at(-1).title,'ARC',name);assert.equal(session.screens.filter((s,i)=>s.title==='ARC'&&session.screens[i-1]?.title!=='ARC').length,2,name);assert.ok(!session.screens.some(s=>s.title==='Operation unavailable')||name==='error',name);}
});

test('common Back follows the last action without a spacer',async()=>{const{createTuiInterface}=await load();for(const events of [[...down(2),enter],[{name:'up'},enter]]){const session=terminal(events),rows=['One','Two'];assert.equal(await createTuiInterface(session).menu('Target',rows,{backRow:true}),null);assert.deepEqual(rows,['One','Two']);assert.deepEqual(session.screens.at(-1).rows,['One','Two','Back']);assert.ok(session.screens.every(s=>s.rows[s.selected]!==''));}const session=terminal([{name:'up'},{name:'up'},enter]);assert.equal(await createTuiInterface(session).menu('Target',['One','Two'],{backRow:true}),1);});
test('interface exposes only menu text page busy and renderer has no confirmation contract',async()=>{const{createTuiInterface}=await load();assert.deepEqual(Object.keys(createTuiInterface(terminal([]))).sort(),['busy','menu','page','text']);});
test('ordinary page scrolls wraps escaped text and Enter returns without Back rows',async()=>{const{createTuiInterface}=await load();const session=terminal([...down(50),enter]);session.viewport=()=>({columns:24,rows:8});assert.equal(await createTuiInterface(session).page('Result',['note\x1b[2J',...Array.from({length:20},(_,i)=>'row'+i)]),true);assert.ok(session.screens.some(s=>s.rows.includes('row19')));assert.ok(session.screens.every(s=>!s.rows.includes('Back')));assert.ok(session.screens[0].rows.includes('note\\x1b[2J'));});

for(const platform of [0,1])test('Settings target '+platform+' executes only settings once',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(platform),enter,{name:'up'},enter,enter,back]);const prepared={kind:'uninstall'};let preparations=0,executions=0;await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>installedStatuses(),prepareOperation:async(c,o)=>{preparations++;assert.deepEqual(o,{kind:'uninstall',target:['claude','codex'][platform],removeCli:false});return prepared;},executeOperation:async(c,p)=>{executions++;assert.equal(p,prepared);return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executions,1);assert.deepEqual(session.screens.find(s=>s.title==='Uninstall').rows,['Claude','Codex','Gemini  (not installed)','Grok  (not installed)','Everything (incl. CLI)','Back']);assert.ok(session.screens.some(s=>s.rows[0]===`Remove ARC from ${['Claude','Codex'][platform]}?`&&s.rows.includes('Remove')));assert.ok(!session.screens.some(s=>s.rows.includes('Both targets')));});
for(const cancel of [[enter],[back]])test('Everything confirmation cancellation '+JSON.stringify(cancel)+' never prepares',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(4),enter,...cancel,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>assert.fail('cancel cannot prepare')}});const warning=session.screens.find(s=>s.rows[0]==='Remove ARC from all platforms and the arc CLI?');assert.deepEqual(warning.rows,['Remove ARC from all platforms and the arc CLI?','','Remove','Back']);assert.equal(warning.rows[warning.selected],'Back');if(cancel[0]===enter){const menus=session.screens.filter(s=>s.title==='Uninstall'&&s.rows.includes('Everything (incl. CLI)'));assert.equal(menus.at(-1).rows[menus.at(-1).selected],'Everything (incl. CLI)');}else assert.equal(session.screens.at(-1).title,'ARC');});
test('Everything Remove alone prepares all targets and executes identical snapshot once',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(4),enter,{name:'up'},enter,enter,back]);const prepared={kind:'uninstall'};let preparations=0,executions=0;await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async(c,o)=>{preparations++;assert.deepEqual(o,{kind:'uninstall',target:'all',removeCli:true});return prepared;},executeOperation:async(c,p)=>{executions++;assert.equal(p,prepared);return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executions,1);});
test('concise lifecycle result rows preserve diagnostics without rollback',async()=>{const{resultRows}=await load();assert.deepEqual(resultRows({code:0,results:[{platform:'codex',status:'installed',rollback:'not-needed'}]}),['ARC installed for Codex.']);assert.deepEqual(resultRows({code:0,results:[{platform:'claude',status:'uninstalled',rollback:'restored'}]}),['Removed from Claude.']);for(const [status,message]of [['removed','Removed ARC and CLI.'],['absent','Removed ARC.']]){const rows=resultRows({code:0,results:[{platform:'codex',status:'uninstalled'},{platform:'claude',status:'uninstalled'}],cli:{status},exitSession:status==='removed'});assert.ok(rows.includes(message));if(status==='removed')assert.ok(rows.includes('CLI removal ended this session.'));assert.doesNotMatch(rows.join('\n'),/rollback|Run arc again|Open a new agent/);}const rows=resultRows({code:7,stdout:'claude: failed; rollback: failed\nResidual path: /tmp/remains\n',results:[{platform:'claude',status:'failed',rollback:'failed',error:Error('failure'),residualPaths:['/tmp/remains']}]});assert.ok(rows.includes('claude: failed'));assert.ok(rows.includes('Error: failure'));assert.ok(rows.includes('Exit code: 7'));assert.doesNotMatch(rows.join('\n'),/rollback/);});

test('custom editor keeps long model choices selectable at 40 columns',async()=>{
 const model='fixture-'+('x'.repeat(200)),catalog={platform:'codex',pairs:[{model,effort:'medium'}]};let calls=0;
 const result=await selectCatalogPair({roleName:'Scouter',current:{model,effort:'medium'},catalog,ui:{menu:async(title,rows,options)=>{
  calls++;const state={selected:0,columns:40,rows:18},body=options.renderBody(state);assert.equal(renderScreen({title,rows:body.rows,notices:body.notices,selected:body.selected,compactFooter:body.compactFooter},{columns:40,rows:18}).selectionEnabled,true);let detail='';for(let page=0;page<body.detailPages;page++){const frame=options.renderBody(state);detail+=frame.notices.slice(0,frame.notices.findIndex(row=>row.startsWith('←/→: Details'))).join('');options.onHorizontal({...state,direction:'right'});}assert.ok(detail.includes(model));return 0;
 },page:async()=>assert.fail('unexpected page')}});assert.deepEqual(result,{model,effort:'medium'});assert.equal(calls,2);
});

test('TUI role selection prepares only role pairs and keeps environment secrets off screen',async()=>{
 const {runTui}=await load(),secret='fixture-sensitive-key',session=terminal([enter,...down(10),enter,enter,back]);let prepared;
 await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url)),env:{PATH:fixturePath,ANTHROPIC_API_KEY:secret}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'install',plans:[]};},executeOperation:async()=>({code:0,results:[]})}});
 assert.equal(Object.keys(prepared.roles).length,5);assert.doesNotMatch(JSON.stringify(prepared),/fixture-sensitive-key/);assert.doesNotMatch(JSON.stringify(session.screens),/fixture-sensitive-key/);
});
for(const firstCode of [0,1])test('role draft '+(firstCode?'survives failed execution':'is cleared after successful execution'),async()=>{
 const {runTui}=await load();const events=[enter,enter,...down(2),{name:'left'},...down(1),enter,...down(10),enter,enter,enter,...down(10),enter,enter,back];
 const session=terminal(events),prepared=[];let executed=0;
 await runTui({session,context:{env:{PATH:fixturePath},packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async(_c,options)=>{prepared.push(structuredClone(options));return{kind:'install',plans:[]};},executeOperation:async()=>({code:executed++===0?firstCode:0,results:[]})}});
 assert.equal(prepared.length,2);assert.equal(prepared[0].roles.arc_scouter.model,'sonnet');assert.equal(prepared[0].roles.arc_scouter.effort,'low');assert.equal(prepared[1].roles.arc_scouter.effort,firstCode?'low':'medium');
});

test('idle refresh redraws while retaining one pending input and stops after Enter',async()=>{
 const {createTuiInterface}=await load();let resolveEvent,reads=0;const session=terminal([]);session.nextEvent=()=>{reads++;return new Promise(resolve=>{resolveEvent=resolve;});};
 const result=createTuiInterface(session).menu('Blink',['role'],{refreshMs:15,renderBody:({selected,blink})=>({rows:[`${selected}:${blink}`],selected:0})});
 await new Promise(resolve=>setTimeout(resolve,40));assert.ok(session.screens.length>=2);assert.equal(reads,1);assert.notEqual(session.screens[0].rows[0],session.screens[1].rows[0]);resolveEvent(enter);assert.equal(await result,0);const count=session.screens.length;await new Promise(resolve=>setTimeout(resolve,35));assert.equal(session.screens.length,count);
});

test('diagram idle frames blink only the focused border while keeping its label',async()=>{
 const {createTuiInterface}=await load(),session=terminal([]),times=[];let resolveEvent;
 session.nextEvent=()=>new Promise(resolve=>{resolveEvent=resolve;});session.render=screen=>{session.screens.push(screen);times.push(Date.now());return{selectionEnabled:true};};
 const roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'model-a',effort:'high'}]));
 const editing=runInstallFlow({ui:createTuiInterface(session),statuses:[],draft:{roles,hosts:['codex']},installState:{mode:'standalone',platforms:[]},loadCatalog:async()=>({status:'ready',catalog:{platform:'codex',pairs:[{model:'model-a',effort:'high'}]}})});
 await new Promise(resolve=>setTimeout(resolve,700));resolveEvent(back);await assert.rejects(editing,{code:'ARC_TUI_HOME'});
 assert.ok(session.screens.length>=2);assert.ok(times[1]-times[0]>=550&&times[1]-times[0]<1000);
 const [first,second]=session.screens.map(screen=>screen.rows);assert.match(first[0],/Scouter/);assert.match(second[0],/Scouter/);assert.notEqual(first[0],second[0]);assert.deepEqual(first.slice(5),second.slice(5));for(let row=1;row<=3;row++){assert.equal(first[row].slice(1,22),second[row].slice(1,22));assert.equal(first[row].slice(24),second[row].slice(24));}
});
test('diagram role focus hides the outer selection line but remains selectable',async()=>{
 const {runTui}=await load(),session=terminal([enter,enter,back,back]);session.render=screen=>{session.screens.push(screen);return renderScreen(screen,session.viewport());};
 await runTui({session,context:{env:{PATH:fixturePath},packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[]}});
 const screen=session.screens.find(item=>item.title==='Configure'),rendered=renderScreen(screen,session.viewport());assert.equal(rendered.selectionEnabled,true);assert.ok(!rendered.styles.some(style=>style.color==='selected'));assert.match(rendered.text,/┌─ > Scouter/);assert.doesNotMatch(rendered.text,/^> /m);assert.ok(session.screens.some(item=>item.title==='Scouter'));
});

test('Status shows Available, Not Available and Unauthorized labels',async()=>{
 const{runTui}=await load();
 const cases=[
  [[{platform:'claude',state:'installed',diagnostics:[],authentication:{platform:'claude',authStatus:'authenticated'}},{platform:'codex',state:'absent',diagnostics:[]}],['Claude         Available','Codex          Not Available']],
  [[{platform:'codex',state:'installed',diagnostics:[],authentication:{platform:'codex',authStatus:'unknown',reason:'cli_not_found'}},{platform:'claude',state:'installed',diagnostics:[],authentication:{platform:'claude',authStatus:'unauthorized'}}],['Claude         Unauthorized','Codex          Not Available']]
 ];
 for(const [statuses,expected] of cases){const session=terminal([...down(1),enter,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>statuses}});assert.deepEqual(session.screens.find(screen=>screen.title==='Status').rows.slice(2,4),expected);}
});

test('uninstall confirmation during composite adds the turn-off line and switch flag',async()=>{
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex']}),collectStatus:async()=>installedStatuses(),prepareOperation:async(_ctx,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[]})}});
 assert.ok(session.screens.some(s=>s.title==='Uninstall'&&s.rows.includes('Mixed routing will be turned off.')));assert.equal(prepared.switchFromComposite,true);
});

for(const lookup of ['default','missing','throws','unverified'])test('state lookup '+lookup+' keeps diagram usable and blocks unverified Apply',async()=>{
 const {runTui}=await load(),session=terminal([enter,...down(10),enter,back,...down(1),enter,back,back]);
 const services={collectStatus:async()=>[],prepareOperation:async(_context,request)=>{assert.deepEqual(request,{kind:'update'});return statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false});},executeOperation:async()=>assert.fail('unverified cannot execute')};
 if(lookup==='missing')services.currentInstallState=undefined;
 if(lookup==='throws')services.currentInstallState=async()=>{throw Error('state inspection failed');};
 if(lookup==='unverified')services.currentInstallState=()=>({mode:'unverified',platforms:[]});
 assert.equal(await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url)),userHome:'/private/tmp/arc-task16-state-probe',env:{PATH:fixturePath},safeFs:{openRoot(){throw Error('state inspection failed');}}},services}),0);
 assert.ok(session.screens.some(s=>s.title==='Configure'&&s.rows.some(row=>row.includes('Scouter'))));assert.ok(session.screens.some(s=>s.title==='Operation unavailable'&&s.rows.includes('Mixed routing configuration cannot be verified.')));assert.ok(session.screens.find(screen=>screen.title==='Status').rows.includes('Installed on   Unverified'));
});
test('unverified Apply lists real management residual paths without preparing',async t=>{
 const {compositeContext,targets}=await import('./fixtures/install-mode.mjs');
 const {mkdirSync,writeFileSync}=await import('node:fs'),{join}=await import('node:path');
 const context=await compositeContext(t),home=targets(context).codex.home;
 const residualPaths=['arc-role-platform-routing.prepared.json','agents/arc-routing-qa.toml'].map(name=>join(home,name));
 mkdirSync(join(home,'agents'),{recursive:true});for(const filename of residualPaths)writeFileSync(filename,'{}');
 const {runTui}=await load(),session=terminal([enter,...down(10),enter,back,back]);let preparations=0;
 assert.equal(await runTui({session,context,services:{collectStatus:async()=>[],prepareOperation:async()=>{preparations++;assert.fail('unverified cannot prepare');},executeOperation:async()=>assert.fail('unverified cannot execute')}}),0);
 assert.equal(preparations,0);
 assert.ok(session.screens.some(screen=>screen.title==='Configure'));
 const screen=session.screens.find(screen=>screen.title==='Operation unavailable');assert.ok(screen);
 const pageText=screen.rows.join('');
 assert.match(pageText,/Residual path:/);for(const filename of residualPaths)assert.ok(pageText.includes(filename));
 assert.ok(screen.rows.includes('No changes were applied.'));
});
test('Status lists each platform and Installed on line',async()=>{
 const {runTui}=await load();for(const [mode,auth,want] of [['composite','authenticated','Installed on   Mixed (Claude + Codex)'],['standalone','authenticated','Installed on   Claude, Codex'],['composite','unauthorized','Installed on   Mixed (Claude + Codex)']]){
  const session=terminal([...down(1),enter,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode,platforms:['claude','codex']}),collectStatus:async()=>['codex','claude'].map(platform=>({platform,state:'installed',authentication:{authStatus:platform==='codex'?auth:'authenticated'},diagnostics:platform==='claude'?[{message:'diagnostic'}]:[]}))}});
  const screen=session.screens.find(screen=>screen.title==='Status');assert.equal(screen.rows[0],want);assert.deepEqual(screen.rows.slice(1,5),['','Claude         Available','Codex          '+(auth==='unauthorized'?'Unauthorized':'Available'),'']);assert.deepEqual(screen.rows.slice(7,9),['Notes','• diagnostic (Claude)']);
 }
});

test('Working screen has no body text',async()=>{const{createTuiInterface}=await load();const session=terminal([]);assert.equal(await createTuiInterface(session).busy(async()=>42),42);assert.deepEqual(session.screens[0].rows,[]);assert.equal(session.screens[0].hint,'Ctrl+C Interrupt');});
test('result rows hide a zero exit code and show nonzero ones',async()=>{const{resultRows}=await load();assert.deepEqual(resultRows({code:0,messages:['done']}),['done']);assert.deepEqual(resultRows({code:1,messages:['failed']}),['failed','Exit code: 1']);});
test('composite result messages use the new copy',async t=>{const{compositeContext,publish}=await import('./fixtures/install-mode.mjs');const ctx=await compositeContext(t);const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));assert.deepEqual(result.messages,['Mixed routing on: Claude + Codex.','After upgrading ARC, run Configure again.']);});
test('Status shows current → latest, Up to date, or the unavailable lines',async()=>{const{runTui}=await load();for(const [latestVersion,canUpgrade,latestError,want] of [['1.10.0',true,undefined,['Installed on   Not installed','','','Version        1.9.0 → 1.10.0','','Upgrade','Back']],['1.9.0',false,undefined,['Installed on   Not installed','','','Version        1.9.0 · up to date','','Back']],[null,false,Error('offline'),['Installed on   Not installed','','','Version        1.9.0 · latest unavailable','','Notes','• offline','','Back']],['1.8.0',false,undefined,['Installed on   Not installed','','','Version        1.9.0 · up to date','','Back']]]){const session=terminal([...down(1),enter,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},currentVersion:'1.9.0',latestVersion,canUpgrade,latestError})}});assert.deepEqual(session.screens.find(s=>s.title==='Status').rows,want);}});
for(const target of [0,1,4])test('Esc on confirmation '+target+' returns home',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(target),enter,back,back]);await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>installedStatuses(),prepareOperation:async()=>assert.fail('Esc must not prepare')}});assert.equal(session.screens.at(-1).title,'ARC');assert.equal(session.screens.filter(s=>s.rows.includes('Everything (incl. CLI)')).length,target+1);});

test('unverified operation rejection displays residual paths',async()=>{
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,{name:'up'},enter]);
 const error=Object.assign(Error('Mixed routing configuration cannot be verified.'),{residualPaths:['/tmp/unverified-marker']});
 await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallMode:()=>'unverified',collectStatus:async()=>installedStatuses(),prepareOperation:async()=>{throw error;},executeOperation:async()=>assert.fail('rejected operation must not execute')}});
 const screen=session.screens.find(s=>s.title==='Operation unavailable');assert.ok(screen);assert.ok(screen.rows.includes('Residual path: /tmp/unverified-marker'));assert.ok(screen.rows.includes('No changes were applied.'));
});

test('home capacity follows wordmarkRows in a 17-row terminal',async()=>{
 const{createTuiInterface}=await load(),session=terminal([...down(3),enter]);let last,screen;session.viewport=()=>({columns:80,rows:17});session.render=value=>{screen=value;last=renderScreen(screen,session.viewport());return last;};
 assert.equal(await createTuiInterface(session).menu('ARC',['Configure','Status','Uninstall','Exit'],{wordmark:true,info:['Status','Diagnostic','Diagnostic','Diagnostic']}),3);assert.equal(last.selectionEnabled,true);assert.equal(screen.position,undefined);assert.equal(screen.rows.slice(-4).filter(row=>['Configure','Status','Uninstall','Exit'].includes(row)).length,4);
});

test('Status passes platform and note tones without changing the home menu',async()=>{
 const{runTui}=await load(),session=terminal([...down(1),enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex']}),currentInstallMode:()=> 'composite',collectStatus:async()=>['claude','codex'].map(platform=>({platform,state:'installed',authentication:{authStatus:'authenticated'},diagnostics:platform==='claude'?[{message:'diagnostic'}]:[]})),prepareOperation:async()=>({kind:'update',state:{targets:[{target:{platform:'codex'}}]},currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false})}});
 const screen=session.screens.find(screen=>screen.title==='Status');assert.deepEqual(screen.rows,['Installed on   Mixed (Claude + Codex)','','Claude         Available','Codex          Available','','Version        1.0.0 · up to date','','Notes','• diagnostic (Claude)','','Back']);assert.deepEqual(screen.rowTones,[undefined,undefined,'platform-status','platform-status',undefined,undefined,undefined,undefined,'note',undefined,undefined]);
 assert.ok(session.screens.filter(screen=>screen.wordmark).every(screen=>screen.rowTones===undefined));
 const unknown=terminal([...down(1),enter,back,back]);await runTui({session:unknown,context:{env:{PATH:fixturePath}},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'unverified',platforms:[]}),collectStatus:async()=>[{platform:'codex',state:'installed',authentication:{authStatus:'unknown',reason:'probe failed'}}]}});assert.deepEqual(unknown.screens.find(screen=>screen.title==='Status').rows,['Installed on   Unverified','','Codex          Incomplete','','Version        1.0.0 · up to date','','Notes','• probe failed (Codex)','','Back']);assert.deepEqual(unknown.screens.find(screen=>screen.title==='Status').rowTones,[undefined,undefined,'platform-status',undefined,undefined,undefined,undefined,'note',undefined,undefined]);
});
test('wrapped info keeps tones per display line',async()=>{
 const{createTuiInterface}=await load(),session=terminal([enter]);session.viewport=()=>({columns:30,rows:40});
 await createTuiInterface(session).menu('ARC',['Exit'],{info:['Codex: Available / Claude: Not Available','Codex: '+ 'x'.repeat(50),''],infoTones:['status','diagnostic',undefined]});
 assert.deepEqual(session.screens[0].rows,['Codex: Available / Claude:','Not Available','Codex: '+ 'x'.repeat(20),'x'.repeat(27),'xxx','','Exit']);assert.deepEqual(session.screens[0].rowTones,['status','status','diagnostic','diagnostic-cont','diagnostic-cont',undefined,undefined]);
 const replaced=terminal([enter]);await createTuiInterface(replaced).menu('Configure',['Back'],{info:['Codex: boom'],infoTones:['diagnostic'],renderBody:()=>({rows:['Back'],selected:0})});assert.equal(replaced.screens[0].rowTones,undefined);
});

test('home ticks repaint with increasing frames and one pending read',async()=>{
 const{createTuiInterface}=await load(),session=terminal([]),frames=[];let resolveEvent,reads=0;session.frameMs=15;session.repaint=screen=>{frames.push(screen.frame);return{selectionEnabled:true};};session.nextEvent=()=>{reads++;return new Promise(resolve=>{resolveEvent=resolve;});};
 const result=createTuiInterface(session).menu('ARC',['Exit'],{wordmark:true});await new Promise(resolve=>setTimeout(resolve,65));resolveEvent(enter);assert.equal(await result,0);assert.ok(frames.length>=3);assert.deepEqual(frames,frames.map((_,index)=>index+1));assert.equal(session.screens.length,1);assert.equal(reads,1);const count=frames.length;await new Promise(resolve=>setTimeout(resolve,35));assert.equal(frames.length,count);
});
test('menu without frameMs never ticks on home',async()=>{
 const{createTuiInterface}=await load(),session=terminal([]);let resolveEvent;session.nextEvent=()=>new Promise(resolve=>{resolveEvent=resolve;});const result=createTuiInterface(session).menu('ARC',['Exit'],{wordmark:true});await new Promise(resolve=>setTimeout(resolve,40));resolveEvent(enter);await result;assert.equal(session.screens.length,1);
});
test('home ticks subscribe only once to the pending event promise',async()=>{
 const{createTuiInterface}=await load(),session=terminal([]),subscriptions=new WeakMap(),originalThen=Promise.prototype.then;let resolveEvent,ticks=0,maximum=0,reads=0;
 session.frameMs=1;session.nextEvent=()=>{reads++;return new Promise(resolve=>{resolveEvent=resolve;});};session.repaint=()=>{if(++ticks===12)resolveEvent(enter);return{selectionEnabled:true};};
 Promise.prototype.then=function(...args){const count=(subscriptions.get(this)??0)+1;subscriptions.set(this,count);maximum=Math.max(maximum,count);return originalThen.apply(this,args);};
 try{assert.equal(await createTuiInterface(session).menu('ARC',['Exit'],{wordmark:true}),0);}finally{Promise.prototype.then=originalThen;}
 assert.equal(ticks,12);assert.equal(reads,1);assert.equal(maximum,1);
});
test('busy awaits the action after a spinner repaint failure',async()=>{
 const{createTuiInterface}=await load(),session=terminal([]);let repaints=0,finished=false;session.frameMs=1;session.repaint=()=>{repaints++;throw Error('paint failed');};
 assert.equal(await createTuiInterface(session).busy(async()=>{await new Promise(resolve=>setTimeout(resolve,30));finished=true;return 42;}),42);
 assert.equal(finished,true);assert.equal(repaints,1);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(repaints,1);
});
test('home keeps wrapped state fragments in their original status tone',async()=>{
 const{createTuiInterface}=await load(),session=terminal([enter]);session.viewport=()=>({columns:35,rows:24});
 await createTuiInterface(session).menu('ARC',['Exit'],{wordmark:true,info:['Claude: Available / Codex: Not Available'],infoTones:['status']});
 const screen=session.screens[0],result=renderScreen(screen,session.viewport()),lines=result.text.split('\n');assert.deepEqual(screen.rows.slice(0,2),['Claude: Available / Codex: Not','Available']);
 const states=result.styles.flatMap(style=>style.runs.filter(run=>['ok','muted','warn','error'].includes(run.role)).map(run=>[lines[style.line].slice(run.from,run.to),run.role]));
 assert.deepEqual(states,[['Available','ok'],['Not','muted'],['Available','muted']]);
});
for(const ending of ['return','throw'])test('busy spinner stops before leaving busy on '+ending,async()=>{
 const{createTuiInterface}=await load(),session=terminal([]),calls=[];session.frameMs=10;session.setBusy=value=>calls.push(value);session.repaint=screen=>calls.push(screen.frame);
 const result=createTuiInterface(session).busy(async()=>{await new Promise(resolve=>setTimeout(resolve,45));if(ending==='throw')throw Error('action failed');return 42;});if(ending==='throw')await assert.rejects(result,/action failed/);else assert.equal(await result,42);
 const frames=calls.filter(value=>typeof value==='number');assert.ok(frames.length>=2);assert.deepEqual(frames,frames.map((_,index)=>index+1));assert.equal(calls.at(-1),false);const count=calls.length;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls.length,count);
});
for(const ending of ['escape','eof','error'])test('home animation clears its timer on '+ending,async()=>{
 const{createTuiInterface}=await load(),session=terminal([]),frames=[];let resolveEvent;session.frameMs=10;session.repaint=screen=>frames.push(screen.frame);session.nextEvent=()=>new Promise(resolve=>{resolveEvent=resolve;});const result=createTuiInterface(session).menu('ARC',['Exit'],{wordmark:true});await new Promise(resolve=>setTimeout(resolve,25));resolveEvent(ending==='error'?{name:'error',error:Error('read failed')}:{name:ending});await assert.rejects(result,ending==='escape'?{code:'ARC_TUI_HOME'}:ending==='eof'?{code:'ARC_TUI_EOF'}:/read failed/);const count=frames.length;await new Promise(resolve=>setTimeout(resolve,25));assert.equal(frames.length,count);
});

test('Status uses injected registry labels and display order for four platforms',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{runTui}=await load(),session=terminal([...down(1),enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath},platforms:createTestRegistries(['eta','zeta','codex','claude']).platforms},services:{prepareOperation:async()=>statusPrepared({currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false}),currentInstallState:()=>({mode:'composite',platforms:['eta','zeta','codex','claude']}),collectStatus:async()=>['eta','zeta','codex','claude'].map(platform=>({platform,state:'installed',diagnostics:[{message:platform+' detail'}]}))}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Status').rows,['Installed on   Mixed (Claude + Codex + Zeta + Eta)','','Claude         Available','Codex          Available','Zeta           Available · auth unverified','Eta            Not verified','','Version        1.0.0 · up to date','','Notes','• claude detail (Claude)','• codex detail (Codex)','• zeta detail (Zeta)','• eta detail (Eta)','','Back']);
});
test('app loads current composite config and prepares diagram snapshot under busy',async()=>{
 const {runTui}=await load(),roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}]));
 const session=terminal([enter,...down(10),enter,enter,back]),catalogLoads=[],prepared=[];let configLoads=0,busy=false;
 session.setBusy=value=>{busy=value;};
 const code=await runTui({session,context:{env:{PATH:fixturePath}},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex'],anchor:'claude'}),collectStatus:async()=>['codex','claude'].map(platform=>({platform,state:'installed',authentication:{authStatus:'authenticated'},cliVersion:{version:'1.0.0'}})),readCompositeConfig:async()=>{configLoads++;return {version:2,revision:'saved',platforms:['claude','codex'],roles};},loadCatalog:async platform=>{catalogLoads.push(platform);return {status:'ready',catalog:{platform,pairs:[{model:platform==='codex'?'gpt-6-luna':'sonnet',effort:'high'}]}};},prepareOperation:async(context,options)=>{assert.equal(busy,true);assert.ok(context.signal);prepared.push(options);return{kind:'composite',options};},executeOperation:async(_context,operation)=>{assert.equal(busy,true);assert.equal(operation.options,prepared[0]);return{code:0,results:[]};}}});
 assert.equal(code,0);assert.equal(configLoads,1);assert.deepEqual([...catalogLoads].sort(),['claude','codex']);assert.equal(prepared.length,1);assert.equal(prepared[0].target,'composite');assert.deepEqual(prepared[0].config.roles,roles);assert.deepEqual(prepared[0].platforms,['claude','codex']);
});

test('menu uses the checklist navigation hint',async()=>{
 const{createTuiInterface}=await load(),session=terminal([enter]);assert.equal(await createTuiInterface(session).menu('Hosts',['Claude'],{hint:'checklist'}),0);assert.equal(session.screens[0].hint,'↑/↓: Select · Enter Toggle · Esc Home');
});
for(const wordmark of [false,true])test('menu frame ticks preserve an independent blink period with wordmark '+wordmark,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const{createTuiInterface}=await load(),session=terminal([]),states=[];let resolveEvent;session.frameMs=80;session.motion=true;session.nextEvent=()=>new Promise(resolve=>{resolveEvent=resolve;});
 const result=createTuiInterface(session).menu('Controls',['Language'],{wordmark,onHorizontal(){},refreshMs:200,renderBody:state=>{states.push(state);return{rows:['Language'],selected:0};}});
 for(let tick=0;tick<5;tick++){t.mock.timers.tick(80);await new Promise(resolve=>setImmediate(resolve));}
 resolveEvent(enter);assert.equal(await result,0);assert.deepEqual(states.map(({frame})=>frame),[0,1,2,3,4,5]);assert.deepEqual(states.map(({blink})=>blink),[true,true,true,false,false,true]);assert.deepEqual(states[0],{selected:0,blink:true,frame:0,columns:120,rows:40});
});
for(const motion of [undefined,false])test('horizontal controls stay static without motion '+motion,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const{createTuiInterface}=await load(),session=terminal([]),states=[];let resolveEvent;session.frameMs=80;session.motion=motion;session.nextEvent=()=>new Promise(resolve=>{resolveEvent=resolve;});
 const result=createTuiInterface(session).menu('Controls',['Language'],{onHorizontal(){},renderBody:state=>{states.push(state);return{rows:['Language'],selected:0};}});t.mock.timers.tick(400);await new Promise(resolve=>setImmediate(resolve));resolveEvent(enter);assert.equal(await result,0);assert.deepEqual(states.map(({frame})=>frame),[0]);assert.equal(session.screens.length,1);
});


test('dynamic bottom notices keep choices at the same lines and reserve scroll space',async()=>{
 const {createTuiInterface}=await load(),session=terminal([...down(2),enter]),frames=[];
 session.viewport=()=>({columns:40,rows:10});
 session.render=screen=>{const rendered=renderScreen(screen,session.viewport());session.screens.push(screen);frames.push(rendered);return rendered;};
 const notices=[[],['Short warning'],['A longer warning that wraps across multiple lines on this terminal']];
 assert.equal(await createTuiInterface(session).menu('Menu',['One','Two','Three'],{notice:({selected,columns,rows})=>{assert.equal(columns,40);assert.equal(rows,10);return notices[selected];}}),2);
 for(const frame of frames){const lines=frame.text.split('\n');for(const [index,label] of ['One','Two','Three'].entries())assert.equal(lines.findIndex(line=>line.trim()===label||line.trim()==='> '+label),index+1);assert.equal(frame.selectionEnabled,true);}
 assert.deepEqual(session.screens.map(screen=>screen.rows),Array(3).fill(['One','Two','Three']));
 const short=terminal([...down(11),enter]);short.viewport=()=>({columns:40,rows:9});short.render=screen=>{short.screens.push(screen);return renderScreen(screen,short.viewport());};
 assert.equal(await createTuiInterface(short).menu('Menu',Array.from({length:12},(_,i)=>'Action '+i),{notice:['Warning wraps over two lines for the selected action']}),11);
 const rendered=renderScreen(short.screens.at(-1),short.viewport());assert.equal(rendered.selectionEnabled,true);assert.match(rendered.text,/> Action 11/);assert.match(rendered.text,/selected action/);
});

test('renderBody notices replace menu notices without becoming selectable rows',async()=>{
 const {createTuiInterface}=await load(),session=terminal([enter]);
 await createTuiInterface(session).menu('Editor',['Done'],{notice:['Old'],renderBody:()=>({rows:['Done'],selected:0,notices:['New']})});
 assert.deepEqual(session.screens[0].notices,['New']);assert.deepEqual(session.screens[0].rows,['Done']);
});

test('Hosts rows cut at 40 columns stay selectable and Enter shows their feedback',async()=>{
 const {createTuiInterface}=await load(),{editHosts}=await import('../../lib/tui/setup.mjs');
 const events=[{name:'down'},{name:'enter'},{name:'escape'}],screens=[];
 const session={viewport:()=>({columns:40,rows:20}),render(screen){const rendered=renderScreen(screen,{columns:40,rows:20});screens.push({screen,rendered});return rendered;},async nextEvent(){return events.shift()??{name:'eof'};}};
 await assert.rejects(editHosts({ui:createTuiInterface(session),hosts:[],rolePlatforms:['claude','claude','claude','claude','claude'],availabilityOf:id=>id==='codex'?{selectable:false,reason:'unauthorized'}:{selectable:true}}),{code:'ARC_TUI_HOME'});
 const cut=screens.find(({screen})=>screen.selected===1);
 assert.ok(cut.screen.rows[1].startsWith('[-] Codex')&&cut.screen.rows[1].endsWith('…'));assert.equal(cut.rendered.selectionEnabled,true);
 assert.ok(screens.at(-1).screen.notices.some(line=>/Codex/.test(line)));
});


// These cases catch a skipped lookup, a misleading version, and an accidental default Upgrade.
const statusPrepared=(overrides={})=>({kind:'update',currentVersion:'0.4.2',latestVersion:'0.4.3',canUpgrade:true,state:{targets:[{target:{platform:'codex'}}]},...overrides});
async function statusRun({prepared=statusPrepared(),failed,events=[enter,back],exitSession=false}={}){
 const {runTui}=await load(),session=terminal([...down(1),enter,...events]),executions=[],requests=[];let busy=false;
 session.setBusy=value=>{busy=value;};
 const code=await runTui({session,context:{env:{PATH:fixturePath}},output:{write(){}},services:{
  currentInstallState:()=>({mode:'standalone',platforms:['codex']}),
  collectStatus:async()=>[{platform:'codex',state:'installed',authentication:{authStatus:'authenticated'},diagnostics:[{message:'platform detail'}]}],
  prepareOperation:async(_context,request)=>{requests.push({request,busy});if(failed)throw failed;return prepared;},
  executeOperation:async(_context,snapshot)=>{executions.push({snapshot,busy});return{code:0,exitSession,results:[]};}
 }});
 return{code,session,screen:session.screens.find(s=>s.title==='Status'),executions,requests};
}
test('home has Configure, Status, Uninstall, Exit',async()=>{
 const {runTui}=await load(),session=terminal([back]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{collectStatus:async()=>[],currentInstallState:()=>({mode:'standalone',platforms:[]})}});
 assert.deepEqual(session.screens[0].rows,['Configure','Status','Uninstall','Exit']);
});
test('status up to date shows version row and Back only',async()=>{
 for(const latestVersion of ['0.4.2','0.4.1']){
  const run=await statusRun({prepared:statusPrepared({latestVersion,canUpgrade:false})});
  assert.ok(run.screen.rows.includes('Version        0.4.2 · up to date'));
  assert.deepEqual(run.screen.rows.slice(-1),['Back']);assert.equal(run.screen.rows[run.screen.selected],'Back');
  assert.equal(run.screen.selected,run.screen.rows.length-1);assert.equal(run.executions.length,0);
  assert.deepEqual(run.requests,[{request:{kind:'update'},busy:true}]);
 }
});
test('status upgrade available selects Back by default and Upgrade executes the prepared snapshot',async()=>{
 for(const exitSession of [false,true]){
  const prepared=statusPrepared(),run=await statusRun({prepared,exitSession,events:[{name:'up'},enter,enter,back]});
  assert.ok(run.screen.rows.includes('Version        0.4.2 → 0.4.3'));
  assert.deepEqual(run.screen.rows.slice(-2),['Upgrade','Back']);assert.equal(run.screen.rows[run.screen.selected],'Back');
  assert.equal(run.executions.length,1);assert.equal(run.executions[0].snapshot,prepared);assert.equal(run.executions[0].busy,true);
  assert.equal(run.requests.length,1);assert.equal(run.code,0);
  assert.deepEqual(run.session.screens.find(s=>s.title==='Result').rows,['ARC updated: 0.4.2 → 0.4.3.']);
  assert.equal(run.session.screens.at(-1).title,exitSession?'Result':'ARC');
 }
 const cancelled=await statusRun();assert.equal(cancelled.executions.length,0);assert.equal(cancelled.screen.rows[cancelled.screen.selected],'Back');
});
test('status harness 0 with newer version',async()=>{
 const run=await statusRun({prepared:statusPrepared({canUpgrade:false,state:{targets:[]}})});
 assert.ok(run.screen.rows.includes('Version        0.4.2 → 0.4.3'));
 assert.ok(run.screen.rows.includes('• No installed ARC harness; run Configure first.'));
 assert.doesNotMatch(run.screen.rows.join('\n'),/up to date/i);assert.equal(run.screen.rows.includes('Upgrade'),false);
 assert.equal(run.screen.rows[run.screen.selected],'Back');assert.equal(run.executions.length,0);
});
test('status latestError',async()=>{
 const run=await statusRun({prepared:statusPrepared({latestVersion:null,canUpgrade:false,latestError:Error('offline\nhidden detail')})});
 assert.ok(run.screen.rows.includes('Version        0.4.2 · latest unavailable'));
 assert.deepEqual(run.screen.rows.filter(row=>row.startsWith('•')),['• platform detail (Codex)','• offline']);
 assert.doesNotMatch(run.screen.rows.join('\n'),/hidden detail/);assert.equal(run.screen.rows.includes('Upgrade'),false);
 assert.equal(run.session.screens.some(s=>s.title==='Operation unavailable'),false);assert.equal(run.executions.length,0);
});
test('status prepare exception keeps platform rows',async()=>{
 const run=await statusRun({failed:Error('Run arc from a verified global ARC installation or npx\nhidden detail')});
 assert.ok(run.screen.rows.includes('Codex          Available'));
 assert.ok(run.screen.rows.includes('Version        '+packageVersion+' · latest unavailable'));
 assert.deepEqual(run.screen.rows.filter(row=>row.startsWith('•')),['• platform detail (Codex)','• Run arc from a verified global ARC installation or npx']);
 assert.equal(run.session.screens.some(s=>s.title==='Operation unavailable'),false);assert.equal(run.screen.rows.includes('Upgrade'),false);
 assert.equal(run.code,0);assert.equal(run.executions.length,0);
});
test('status propagates cancel, eof and home from prepare',async()=>{
 for(const [code,want]of [['ARC_CANCELLED',130],['ARC_TUI_EOF',0],['ARC_TUI_HOME',0]]){
  const run=await statusRun({failed:Object.assign(Error('control signal'),{code}),events:[back]});
  assert.equal(run.code,want);assert.equal(run.screen,undefined);assert.equal(run.executions.length,0);
  assert.equal(run.session.screens.some(s=>s.title==='Operation unavailable'),false);assert.equal(run.session.closed,true);
 }
});
test('status Installed on uses the home mode value and omits unavailable settings',async()=>{
 const {homeModeLine,statusInfo}=await import('../../lib/tui/mode.mjs');
 const state={mode:'standalone',platforms:[]};
 const empty=statusInfo(state,[]);
 assert.deepEqual(empty.info,['Installed on   Not installed','']);
 const statuses=[{platform:'claude',state:'installed'}];
 const installed=statusInfo({...state,platforms:['claude']},statuses);
 assert.deepEqual(installed.info,['Installed on   Claude','','Claude         Available']);
 assert.equal(installed.info[0].slice(15),homeModeLine({...state,platforms:['claude']},statuses));
});
test('status settings rows share the platform and Version value column',async()=>{
 const {statusInfo}=await import('../../lib/tui/mode.mjs');
 const state={mode:'standalone',platforms:['claude']};
 const settings={runMode:'full-auto',language:'ko',limits:{max_total_subagents:100,max_concurrent_subagents:5}};
 const version={currentVersion:'0.4.2',latestVersion:'0.4.3',canUpgrade:true};
 const display=statusInfo(state,[{platform:'claude',state:'installed',settings}],undefined,{version});
 assert.deepEqual(display.info,[
  'Installed on           Claude',
  'Run mode               Full Auto',
  'Language               Korean',
  'Total subagents        100',
  'Concurrent subagents   5',
  '',
  'Claude                 Available',
  '',
  'Version                0.4.2 → 0.4.3'
 ]);
 assert.deepEqual(display.infoTones,[undefined,undefined,undefined,undefined,undefined,undefined,'platform-status',undefined,undefined]);
});
test('status settings mark only differing values as mixed',async()=>{
 const {statusInfo}=await import('../../lib/tui/mode.mjs');
 const state={mode:'composite',platforms:['claude','codex']};
 const statuses=[
  {platform:'claude',state:'installed',settings:{runMode:'supervised',language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5}}},
  {platform:'codex',state:'installed',settings:{runMode:'full-auto',language:'en',limits:{max_total_subagents:80,max_concurrent_subagents:5}}}
 ];
 assert.deepEqual(statusInfo(state,statuses).info.slice(1,6),[
  'Run mode               mixed','Language               English','Total subagents        mixed','Concurrent subagents   5',''
 ]);
});
test('status settings ignore incomplete and absent platforms',async()=>{
 const {statusInfo}=await import('../../lib/tui/mode.mjs');
 const state={mode:'standalone',platforms:['claude']};
 const settings={runMode:'full-auto',language:'ko',limits:{max_total_subagents:80,max_concurrent_subagents:4}};
 const statuses=[
  {platform:'claude',state:'installed',settings:{runMode:'supervised',language:'en',limits:{max_total_subagents:100,max_concurrent_subagents:5}}},
  {platform:'codex',state:'incomplete',settings},
  {platform:'gemini',state:'absent',settings}
 ];
 assert.deepEqual(statusInfo(state,statuses).info.slice(1,6),[
  'Run mode               Supervised','Language               English','Total subagents        100','Concurrent subagents   5',''
 ]);
});
test('statusInfo aligns Version with platform labels',async()=>{
 const mode=await import('../../lib/tui/mode.mjs'),state={mode:'standalone',platforms:['codex']},statuses=[{platform:'codex',state:'installed'}];
 assert.deepEqual(mode.statusInfo(state,statuses),{info:['Installed on   Codex','','Codex          Available'],infoTones:[undefined,undefined,'platform-status']});
 assert.equal(typeof mode.statusVersion,'function');
 const version=mode.statusVersion({prepared:statusPrepared(),packageVersion}),display=mode.statusInfo(state,statuses,undefined,{version});
 assert.deepEqual(version,{currentVersion:'0.4.2',latestVersion:'0.4.3',canUpgrade:true,newerWithoutHarness:false,message:null});
 assert.deepEqual(display,{info:['Installed on   Codex','','Codex          Available','','Version        0.4.2 → 0.4.3'],infoTones:[undefined,undefined,'platform-status',undefined,undefined]});
 assert.equal(display.info[0].indexOf('Codex'),display.info[4].indexOf('0.4.2'));
 const failed=mode.statusVersion({failed:Error('offline\nprivate'),packageVersion:'0.4.2'});
 assert.deepEqual(failed,{currentVersion:'0.4.2',latestVersion:null,canUpgrade:false,newerWithoutHarness:false,message:'offline'});
 const withNote=mode.statusInfo(state,[{platform:'codex',state:'installed',diagnostics:[{message:'offline'},{message:'offline'}]}],undefined,{version:failed});
 assert.deepEqual(withNote.info.slice(-3),['Notes','• offline (Codex)','• offline']);assert.equal(withNote.infoTones.at(-1),'note');
});
test('isNewerVersion preserves numeric triplet ordering',async()=>{
 const update=await import('../../lib/management/update.mjs');assert.equal(typeof update.isNewerVersion,'function');
 for(const [left,right,want]of [['1.10.0','1.9.0',true],['2.0.0','1.99.99',true],['1.2.4','1.2.3',true],['1.2.3','1.2.3',false],['1.2.3','1.3.0',false],['9007199254740993.0.0','9007199254740992.0.0',true]])assert.equal(update.isNewerVersion(left,right),want);
});

test('text input emits confirm and cancel kinds without changing its result',async()=>{
 const {createTuiInterface}=await load(),session=terminal([enter]);
 assert.equal(await createTuiInterface(session).text('Input','value'),'value');
 assert.deepEqual(session.screens[0].rowKinds,[undefined,undefined,'confirm','cancel',undefined]);
});
test('app screens mark only their specified action rows',async()=>{
 const blocked=await blockedTui();
 const active=blocked.session.screens.find(screen=>screen.title==='Active dispatches');
 assert.deepEqual(active.rowKinds,[...active.rows.slice(0,-2).map(()=>undefined),'confirm','cancel']);
 for(const canUpgrade of [true,false]){
  const run=await statusRun({prepared:statusPrepared({canUpgrade})});
  const screen=run.screen;
  assert.deepEqual(screen.rowKinds,[...screen.rows.slice(0,canUpgrade?-2:-1).map(()=>undefined),...(canUpgrade?['confirm']:[]),'cancel']);
  for(const home of run.session.screens.filter(screen=>screen.title==='ARC'))assert.ok(!home.rowKinds||home.rowKinds.every(kind=>kind===undefined));
 }
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,back,back]);
 await runTui({session,context:{env:{PATH:fixturePath}},services:{collectStatus:async()=>installedStatuses(),currentInstallState:()=>({mode:'standalone',platforms:['claude']})}});
 const screens=session.screens.filter(screen=>screen.title==='Uninstall');
 assert.deepEqual(screens[0].rowKinds,[undefined,undefined,undefined,undefined,undefined,'cancel']);
 assert.deepEqual(screens[1].rowKinds,[undefined,undefined,'danger','cancel']);
});
