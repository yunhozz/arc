import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {runInstallFlow} from '../../lib/tui/setup.mjs';
import {selectCatalogPair} from '../../lib/tui/custom-preset.mjs';
import {renderScreen} from '../../lib/tui/render.mjs';
const previewConfig=loadModelConfig(readFileSync(new URL('../../codex/skill/models.toml',import.meta.url)),'codex');
const load=()=>import('../../lib/tui/app.mjs');
function terminal(events){const screens=[];return{screens,viewport(){return{columns:120,rows:40};},render(s){screens.push(s);return{selectionEnabled:true};},discardInput(){},setBusy(){},dispose(){this.closed=true;},async nextEvent(){return events.shift()??{name:'eof'};}};}
const installedStatuses=()=>['claude','codex'].map(platform=>({platform,state:'installed'}));
const down=n=>Array.from({length:n},()=>({name:'down'})),enter={name:'enter'},back={name:'escape'};
test('uninstall rows follow display order and mark not installed without selecting them',async()=>{
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,...down(1),enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:'codex',state:'incomplete'},{platform:'claude',state:'absent'}],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[{platform:'codex',status:'uninstalled'}]})}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Uninstall').rows,['Claude  (not installed)','Codex','Everything (incl. CLI)','Back']);
 assert.ok(!session.screens.some(screen=>screen.rows.includes('Remove ARC from Claude?')));
 assert.deepEqual(prepared,{kind:'uninstall',target:'codex',removeCli:false});
 assert.ok(session.screens.some(screen=>screen.title==='Result'&&screen.rows.includes('Removed from Codex.')));
});
test('uninstall uses injected registry display order and labels for four platforms',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{runTui}=await load(),session=terminal([...down(2),enter,...down(2),enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{platforms:createTestRegistries(['eta','zeta','codex','claude']).platforms},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:'eta',state:'absent'},{platform:'zeta',state:'installed'},{platform:'codex',state:'installed'},{platform:'claude',state:'installed'}],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[{platform:'zeta',status:'uninstalled'}]})}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Uninstall').rows,['Claude','Codex','Zeta','Eta  (not installed)','Everything (incl. CLI)','Back']);
 assert.ok(session.screens.some(screen=>screen.rows[0]==='Remove ARC from Zeta?'));
 assert.equal(prepared.target,'zeta');assert.ok(session.screens.some(screen=>screen.title==='Result'&&screen.rows.includes('Removed from Zeta.')));
});
for(const target of ['zeta','all'])test('uninstall '+target+' outside composite participants does not request a switch',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{runTui}=await load(),session=terminal([...down(2),enter,...down(target==='all'?3:2),enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{platforms:createTestRegistries().platforms},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex'],anchor:'claude'}),currentInstallMode:()=> 'composite',collectStatus:async()=>[...installedStatuses(),{platform:'zeta',state:'installed'}],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[]})}});
 assert.deepEqual(prepared,{kind:'uninstall',target,removeCli:target==='all'});
 const confirmation=session.screens.find(screen=>screen.rows.includes('Remove'));assert.ok(confirmation);assert.deepEqual(confirmation.rows,[target==='all'?'Remove ARC from all platforms and the arc CLI?':'Remove ARC from Zeta?','','Remove','Back']);
});
test('result wording preserves management message order, registry labels and failure diagnostics',async t=>{
 const {resultRows}=await load(),{createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),registry=createTestRegistries().platforms;
 await t.test('single removal',()=>assert.deepEqual(resultRows({code:0,results:[{platform:'codex',status:'uninstalled'}]}),['Removed from Codex.']));
 await t.test('injected removal label',()=>assert.deepEqual(resultRows({code:0,results:[{target:{platform:'zeta'},status:'uninstalled'}]},registry),['Removed from Zeta.']));
 await t.test('injected install label preserves activated message',()=>assert.deepEqual(resultRows({code:0,results:[{platform:'zeta',status:'installed'}],messages:['Mixed (Claude + Zeta) activated.']},registry),['Mixed (Claude + Zeta) activated.','ARC installed for Zeta.']));
 for(const [status,message]of [['removed','Removed ARC and CLI.'],['absent','Removed ARC.']])await t.test('Everything CLI '+status,()=>assert.deepEqual(resultRows({code:0,messages:['Mixed routing turned off.','Dispatch history stays in /old/arc-role-dispatch.'],results:[{platform:'claude',status:'uninstalled'},{platform:'codex',status:'uninstalled'}],cli:{status}}),['Mixed routing turned off.','Dispatch history stays in /old/arc-role-dispatch.',message]));
 await t.test('failure keeps one-line errors and deduplicated residuals',()=>assert.deepEqual(resultRows({code:7,messages:['Mixed routing turned off.','Residual path: /tmp/remains'],results:[{platform:'codex',status:'uninstalled'},{platform:'claude',status:'failed',error:Error('failure\nsecond line'),residualPaths:['/tmp/remains','/tmp/other']}],error:Error('operation failed\nmore detail')}),['Mixed routing turned off.','Residual path: /tmp/remains','Removed from Codex.','claude: failed','Residual path: /tmp/other','Error: failure','Error: operation failed','Exit code: 7']));
});
test('check version success reports the prepared latest version',async()=>{
 const {runTui}=await load();for(const exitSession of [false,true]){const session=terminal([...down(1),enter,enter,enter,back]);let output='';
 await runTui({session,output:{write:text=>{output+=text;}},context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',currentVersion:'0.3.5',latestVersion:'0.3.6',canUpgrade:true}),executeOperation:async()=>({code:0,exitSession,results:[]})}});
 assert.deepEqual(session.screens.find(screen=>screen.title==='Result').rows,['Upgraded to 0.3.6.']);if(exitSession)assert.equal(output,'Upgraded to 0.3.6.\n');}
});
test('menu reevaluates dynamic info with selection and resized viewport while preserving array info',async()=>{
 const{createTuiInterface}=await load();let viewport={columns:80,rows:24};const events=[{name:'down'},{name:'resize',viewport:{columns:60,rows:18}},{name:'down'},{name:'up'},enter],session=terminal([]),calls=[];session.viewport=()=>viewport;session.nextEvent=async()=>{const event=events.shift();if(event.viewport)viewport=event.viewport;return event;};let selected;
 await assert.doesNotReject(async()=>{selected=await createTuiInterface(session).menu('Menu',['One','Two','Three'],{info:state=>{calls.push({...state});return['Item '+state.selected];}});});assert.equal(selected,1);assert.deepEqual(calls.map(call=>call.selected),[0,1,1,2,1]);assert.deepEqual(calls[2],{selected:1,columns:60,rows:18});assert.equal(session.screens.at(-1).rows[0],'Item 1');
 const plain=terminal([enter]);assert.equal(await createTuiInterface(plain).menu('Menu',['One'],{info:['Details']}),0);assert.deepEqual(plain.screens[0].rows,['Details','','One']);
});
for(const target of ['codex','claude'])test('TUI install '+target+' preview reads the same model source as Apply',async()=>{
 const{runTui}=await load(),config=loadModelConfig(readFileSync(new URL('../../'+target+'/skill/models.toml',import.meta.url)),target);config.roles.arc_planner.model='custom-model';
 const session=terminal([enter,back,back]);
 await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[{platform:target,state:'installed',settings:{modelConfig:config}}],prepareOperation:async()=>assert.fail('editor must not prepare'),executeOperation:async()=>assert.fail('editor must not execute')}});
 const editor=session.screens.find(screen=>screen.title==='Install / Update');assert.ok(editor);assert.match(editor.rows.join('\n'),/custom-model/);
});

test('home navigation never executes and retains failure until a new execution',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,enter,enter,back,...down(2),enter]);let calls=0;const code=await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>{calls++;return{code:1,results:[{platform:'codex',status:'failed',rollback:'complete',residualPaths:['/tmp/remains']}]};}}});assert.equal(calls,1);assert.equal(code,1);assert.ok(session.screens.some(s=>s.rows.includes('Install / Update')));assert.ok(session.screens.some(s=>s.title==='Result'&&s.rows.some(r=>r.includes('claude: failed')||r.includes('codex: failed'))));assert.equal(session.closed,true);});
test('global replacement exits before rendering home again',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,enter]);const code=await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code:0,exitSession:true,results:[]})}});assert.equal(code,0);assert.equal(session.screens.filter(s=>s.title==='ARC').length,2);assert.equal(session.screens.at(-1).title,'Result');});
test('interrupt during version selection exits 130 without execution',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,{name:'interrupt'}]);let calls=0;assert.equal(await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>{calls++;}}}),130);assert.equal(calls,0);assert.equal(session.closed,true);});
test('Ctrl+C during asynchronous execution aborts the service and exits 130',async()=>{const{EventEmitter}=await import('node:events');const{runTui}=await load();const input=new EventEmitter(),session=terminal([...down(1),enter,enter]);const code=await runTui({input,session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async context=>{const waiting=new Promise(resolve=>context.signal?.addEventListener('abort',()=>resolve({code:130,results:[]}),{once:true}));input.emit('data',Buffer.from('\x03'));return Promise.race([waiting,new Promise(resolve=>setTimeout(()=>resolve({code:0,results:[]}),50))]);}}});assert.equal(code,130);assert.equal(input.listenerCount('data'),0);});
test('mixed target result keeps success alongside failed rollback and residual paths',async()=>{
 const{runTui}=await load();
 const session=terminal([...down(1),enter,enter,enter,...down(2),enter]);
 const code=await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',
  collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),
  executeOperation:async()=>({code:1,exitSession:false,results:[
   {platform:'codex',status:'installed',rollback:'not-needed',residualPaths:[]},
   {platform:'claude',status:'failed',rollback:'complete',residualPaths:['/tmp/claude-residual'],error:Error('fixture target failure')}
  ]})
 }});
 const rows=session.screens.filter(s=>s.title==='Result').flatMap(s=>s.rows).join('\n');
 assert.match(rows,/ARC installed for Codex\./);
 assert.match(rows,/claude: failed/);
 assert.match(rows,/Residual path: \/tmp\/claude-residual/);
 assert.match(rows,/fixture target failure/);
 assert.equal(code,1);
});

test('global update child diagnostics remain visible in the TUI result',async()=>{
 const{runTui}=await load();const session=terminal([...down(1),enter,enter]);
 await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code:1,exitSession:true,results:[],stdout:'codex: installed; rollback: not-needed\nclaude: failed; rollback: failed\nResidual path: /tmp/recovery\n',stderr:'Error: restore failed; manual recovery required\n'})}});
 const rows=session.screens.at(-1).rows.join('\n');assert.match(rows,/codex: installed/);assert.match(rows,/claude: failed/);assert.match(rows,/Residual path: \/tmp\/recovery/);assert.match(rows,/manual recovery required/);
});
test('interrupted execution reports completed cleanup after terminal restoration for Ctrl+C and signals',async()=>{
 const{EventEmitter}=await import('node:events');const{runTui}=await load();
 for(const trigger of ['Ctrl+C','SIGINT','SIGTERM']){
  const signals=new EventEmitter(),input=new EventEmitter(),session=terminal([...down(1),enter,enter]);let output='';
  const code=await runTui({signals,input,session,output:{write(text){assert.equal(session.closed,true);output+=text;}},context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async context=>{if(trigger==='Ctrl+C')input.emit('data',Buffer.from('\x03'));else signals.emit(trigger);assert.equal(context.signal.aborted,true);return{code:130,results:[{platform:'codex',status:'installed',rollback:'not-needed'},{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/cancel-recovery'],error:Error('cleanup failed')},{platform:'other',status:'not-started'}]};}}});
  assert.equal(code,130);assert.match(output,/ARC installed for Codex\./);assert.match(output,/claude: failed/);assert.match(output,/Residual path: \/tmp\/cancel-recovery/);assert.match(output,/cleanup failed/);assert.match(output,/other: not-started/);assert.match(output,/Exit code: 130/);assert.doesNotMatch(output,/rollback/i);
 }
});
test('post-disposal reports escape terminal controls while retaining diagnostic rows',async()=>{
 const{runTui}=await load();
 for(const code of [1,130]){
  const session=terminal([...down(1),enter,enter]);let output='';
  const actualCode=await runTui({session,output:{write(text){assert.equal(session.closed,true);output+=text;}},context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code,exitSession:true,stdout:'codex: installed\nchild: \x1b[2Jkeep\rdiagnostic\n',stderr:'Error: child\x07 failure\n',results:[{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/\x1b[31mrecovery\rpath'],error:Error('restore\x08 failed')}]})}});
  assert.equal(actualCode,code);assert.ok(output.startsWith('codex: installed\nchild: \\x1b[2Jkeep\\x0ddiagnostic\nError: child\\x07 failure\n'));
  assert.ok(output.includes('Residual path: /tmp/\\x1b[31mrecovery\\x0dpath\n'));assert.ok(output.includes('Error: restore\\x08 failed\n'));assert.ok(output.includes('Exit code: '+code+'\n'));
  assert.doesNotMatch(output,/[\x00-\x09\x0b-\x1f\x7f]/);assert.ok(output.endsWith('\n'));
 }
});

test('home menu is exactly four actions',async()=>{
 const{runTui}=await load();const session=terminal([back]);let calls=0;
 const code=await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{calls++;},executeOperation:async()=>{calls++;},listWorkflows:async()=>assert.fail('hidden Workflow must not run')}});
 assert.equal(code,0);assert.equal(calls,0);assert.equal(session.closed,true);assert.equal(session.screens.length,1);
 assert.deepEqual(session.screens[0].rows.slice(session.screens[0].selected),['Install / Update','Check Version','Uninstall','Exit']);assert.match(session.screens[0].hint,/Esc Exit/);
});
test('install goes straight to diagram',async()=>{
 const{runTui}=await load(),session=terminal([enter,back,back]);
 await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[]}});
 assert.deepEqual(session.screens.map(s=>s.title),['ARC','Install / Update','ARC']);
 assert.match(session.screens[1].rows.join('\n'),/┌─ Scouter/);assert.ok(session.screens[1].rows.some(row=>row.startsWith('Mode:')));assert.equal(session.closed,true);
});

test('idle Escape uses home control signal from all interface screens',async()=>{const{createTuiInterface}=await load();for(const mode of ['menu','text','page']){const ui=createTuiInterface(terminal([back]));await assert.rejects(()=>ui[mode]('Task',mode==='text'?'100':['One']),{code:'ARC_TUI_HOME'});}assert.equal(await createTuiInterface(terminal([back])).menu('ARC',['Exit'],{backLabel:'exit'}),null);});
test('preparation failure shows error without exposing Apply or executing',async()=>{
 const{runTui}=await load();const session=terminal([...down(1),enter,enter,back]);let executes=0;assert.equal(await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{throw Error('fixture preparation failed');},executeOperation:async()=>{executes++;}}}),1);assert.equal(executes,0);assert.ok(session.screens.some(s=>s.rows.includes('fixture preparation failed')));assert.ok(!session.screens.some(s=>s.title.startsWith('Review ')));
});
test('all screen types use contextual compact hints while retaining existing navigation',async()=>{
 const{createTuiInterface}=await load();const session=terminal([back,back,back,back,back]);const ui=createTuiInterface(session);
 for(const action of [()=>ui.menu('Configure',['Install / Update','Check Version']),()=>ui.text('Maximum total subagents','100'),()=>ui.page('Result',['Exit code: 0']),()=>ui.page('Operation unavailable',['fixture failure'])])await assert.rejects(action,{code:'ARC_TUI_HOME'});await ui.busy(async()=>({code:0}));
 const hints=Object.fromEntries(session.screens.map(screen=>[screen.title,screen.hint]));
 assert.equal(hints.Configure,'↑/↓: Select · Enter Continue · Esc Home');assert.equal(hints['Maximum total subagents'],'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home');assert.equal(hints.Result,'↑/↓: Scroll · Enter Back · Esc Home');assert.equal(hints['Operation unavailable'],'↑/↓: Scroll · Enter Back · Esc Home');assert.equal(hints.Working,'Ctrl+C Interrupt');
});

test('home status orders Claude then Codex on one line, preserves diagnostics and separates menu selection',async()=>{
 const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[{platform:'codex',state:'incomplete',diagnostics:[Error('bad config\x1b[2J')]},{platform:'claude',state:'installed',diagnostics:[]}]}});
 const home=session.screens[0];assert.equal(home.rows[0],'Claude: Available / Codex: Incomplete');assert.equal(home.rows[1],'Mode: Claude');assert.match(home.rows[2],/Codex: bad config/);assert.equal(home.rows[home.selected-1],'');assert.equal(home.rows[home.selected],'Install / Update');assert.equal(home.selected,4);
});
test('home status with one collected target does not invent the missing target',async()=>{
 const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[{platform:'codex',state:'absent',diagnostics:[]}]}});assert.deepEqual(session.screens[0].rows.slice(0,4),['Codex: Not Available','Mode: Not installed','','Install / Update']);assert.equal(session.screens[0].selected,3);
});

test('home exposes direct lifecycle actions in approved order',async()=>{const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[]}});assert.deepEqual(session.screens[0].rows.slice(session.screens[0].selected),['Install / Update','Check Version','Uninstall','Exit']);});
test('menu keeps actions adjacent and separates info by one blank',async()=>{const{createTuiInterface}=await load();const session=terminal([...down(1),enter]);assert.equal(await createTuiInterface(session).menu('Check',['Upgrade'],{backRow:true,info:['1.9.0 → 1.10.0']}),null);assert.deepEqual(session.screens[0].rows,['1.9.0 → 1.10.0','','Upgrade','Back']);assert.equal(session.screens[0].selected,2);assert.equal(session.screens.at(-1).selected,3);const trailing=terminal([enter]);assert.equal(await createTuiInterface(trailing).menu('Menu',['One'],{info:['A','']}),0);assert.deepEqual(trailing.screens[0].rows,['A','','One']);const plain=terminal([enter]);assert.equal(await createTuiInterface(plain).menu('Menu',['One'],{backRow:true}),0);assert.deepEqual(plain.screens[0].rows,['One','Back']);});
test('empty actions ignore Enter and navigation with no pointer until Escape',async()=>{const{createTuiInterface}=await load();const session=terminal([enter,...down(1),{name:'up'},back]);await assert.rejects(()=>createTuiInterface(session).menu('Check Version',[],{info:['Up to date (1.10.0)']}),{code:'ARC_TUI_HOME'});assert.equal(session.screens.length,4);assert.ok(session.screens.every(s=>s.selected===undefined));});
test('hidden Execute cannot run until resized to show the selected row',async()=>{const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([enter,back]);session.viewport=()=>({columns:12,rows:2});session.render=s=>{session.screens.push(s);return renderScreen(s,session.viewport());};await assert.rejects(()=>createTuiInterface(session).menu('Settings',['Preset','Execute'],{selected:1}),{code:'ARC_TUI_HOME'});});
test('version upgrade is a selected row and executes the displayed snapshot without review',async()=>{const{runTui}=await load();const session=terminal([...down(1),enter,enter,enter,back]);const prepared={kind:'update',currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true};let preparations=0,executed;await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{preparations++;return prepared;},executeOperation:async(c,p)=>{executed=p;return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executed,prepared);const screen=session.screens.find(s=>s.title==='Check Version');assert.equal(screen.rows[screen.selected],'Upgrade');assert.deepEqual(screen.rows,['1.9.0 → 1.10.0','','Upgrade','Back']);assert.ok(!session.screens.some(s=>s.title.startsWith('Review')));});
test('unavailable version selects Back and Enter returns home without execution',async()=>{const{runTui}=await load();for(const latestVersion of ['1.9.0','1.8.0',null]){const session=terminal([...down(1),enter,enter,back,back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',currentVersion:'1.9.0',latestVersion,canUpgrade:false}),executeOperation:async()=>assert.fail('no upgrade')}});for(const screen of session.screens.filter(s=>s.title==='Check Version')){assert.equal(screen.rows[screen.selected],'Back');assert.deepEqual(screen.rows.slice(-2),['','Back']);assert.ok(!screen.rows.includes('Version Upgrade'));}}});

test('CLI uninstall status and error remain visible beside harness partial results',async()=>{const{resultRows}=await load();const rows=resultRows({code:1,exitSession:true,results:[{platform:'codex',status:'uninstalled'}],cli:{status:'failed',error:Error('npm failure')}}).join('\n');assert.match(rows,/CLI: failed/);assert.match(rows,/npm failure/);assert.match(rows,/CLI removal ended this session/);});

test('generic text Save returns edited string and Back returns null while editing selected actions',async()=>{const{createTuiInterface}=await load();const session=terminal([{name:'backspace'},{name:'paste',text:'€'},{name:'down'},{name:'text',text:'x'},{name:'backspace'},{name:'up'},enter]);assert.equal(await createTuiInterface(session).text('Input','12'),'1€');assert.deepEqual(session.screens[0].rows,['12','','Save','Back','']);assert.equal(session.screens[0].selected,2);assert.ok(session.screens.every(screen=>['Save','Back'].includes(screen.rows[screen.selected])));const cancel=terminal([{name:'down'},{name:'text',text:'discard'},enter]);assert.equal(await createTuiInterface(cancel).text('Input','old'),null);assert.equal(cancel.screens.at(-1).selected,3);assert.equal(cancel.screens.at(-1).rows[cancel.screens.at(-1).selected],'Back');});
test('Backspace on menu and page never navigates',async()=>{const{createTuiInterface}=await load();for(const mode of ['menu','page']){const session=terminal([{name:'backspace'},enter]);assert.equal(await createTuiInterface(session)[mode]('Task',['One']),mode==='menu'?0:true);assert.equal(session.screens.length,2);}});
test('viewport menu window follows selected action on resize without dropping required information',async()=>{const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([...down(11),enter]);session.viewport=()=>({columns:100,rows:9});session.render=s=>{session.screens.push(s);return renderScreen(s,session.viewport());};assert.equal(await createTuiInterface(session).menu('Menu',Array.from({length:12},(_,i)=>'Action '+i)),11);assert.equal(session.screens.at(-1).rows.at(-1),'Action 11');assert.ok(session.screens.at(-1).position);});
test('input Save returns to Settings without preparing or executing an install',async()=>{const{runTui}=await load();const session=terminal([enter,...down(6),enter,...down(1),enter,{name:'backspace'},{name:'backspace'},{name:'backspace'},{name:'text',text:'42'},enter,back,back]);let prepares=0,executes=0;await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>{prepares++;return{kind:'install'};},executeOperation:async()=>{executes++;return{code:0,results:[]};}}});assert.equal(prepares,0);assert.equal(executes,0);assert.ok(session.screens.some(s=>s.title==='Settings'&&s.rows.some(row=>/^Total subagents +42$/.test(row))));assert.equal(session.screens.filter(s=>s.title==='Working').length,0)});

test('idle Escape reaches home from every nested lifecycle screen without executing prepared actions',async()=>{
 const{runTui}=await load(),{fileURLToPath}=await import('node:url'),packageRoot=fileURLToPath(new URL('../../',import.meta.url));const scenarios=[
 ['diagram',[enter]],['Settings',[enter,...down(6),enter]],['chooser',[enter,enter,...down(1),enter]],['input',[enter,...down(6),enter,...down(1),enter]],
 ['uninstall target',[...down(2),enter]],['global choice',[...down(2),enter,enter]],
 ['error',[...down(1),enter]],['Result',[...down(1),enter,enter]]
 ];
 for(const[name,events]of scenarios){const session=terminal([...events,back,back]);let executed=0;await runTui({session,context:{packageRoot},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>installedStatuses(),prepareOperation:async(c,o)=>{if(name==='error')throw Error('fixture');return{kind:o.kind,options:o,plans:[],canUpgrade:true};},executeOperation:async()=>{executed++;return{code:0,results:[]};}}});assert.equal(executed,name==='Result'?1:0,name);assert.equal(session.screens.at(-1).title,'ARC',name);assert.equal(session.screens.filter((s,i)=>s.title==='ARC'&&session.screens[i-1]?.title!=='ARC').length,2,name);assert.ok(!session.screens.some(s=>s.title==='Operation unavailable')||name==='error',name);}
});

test('common Back follows the last action without a spacer',async()=>{const{createTuiInterface}=await load();for(const events of [[...down(2),enter],[{name:'up'},enter]]){const session=terminal(events),rows=['One','Two'];assert.equal(await createTuiInterface(session).menu('Target',rows,{backRow:true}),null);assert.deepEqual(rows,['One','Two']);assert.deepEqual(session.screens.at(-1).rows,['One','Two','Back']);assert.ok(session.screens.every(s=>s.rows[s.selected]!==''));}const session=terminal([{name:'up'},{name:'up'},enter]);assert.equal(await createTuiInterface(session).menu('Target',['One','Two'],{backRow:true}),1);});
test('interface exposes only menu text page busy and renderer has no confirmation contract',async()=>{const{createTuiInterface}=await load();assert.deepEqual(Object.keys(createTuiInterface(terminal([]))).sort(),['busy','menu','page','text']);});
test('ordinary page scrolls wraps escaped text and Enter returns without Back rows',async()=>{const{createTuiInterface}=await load();const session=terminal([...down(50),enter]);session.viewport=()=>({columns:24,rows:8});assert.equal(await createTuiInterface(session).page('Result',['note\x1b[2J',...Array.from({length:20},(_,i)=>'row'+i)]),true);assert.ok(session.screens.some(s=>s.rows.includes('row19')));assert.ok(session.screens.every(s=>!s.rows.includes('Back')));assert.ok(session.screens[0].rows.includes('note\\x1b[2J'));});

for(const platform of [0,1])test('Settings target '+platform+' executes only settings once',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(platform),enter,{name:'up'},enter,enter,back]);const prepared={kind:'uninstall'};let preparations=0,executions=0;await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>installedStatuses(),prepareOperation:async(c,o)=>{preparations++;assert.deepEqual(o,{kind:'uninstall',target:['claude','codex'][platform],removeCli:false});return prepared;},executeOperation:async(c,p)=>{executions++;assert.equal(p,prepared);return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executions,1);assert.deepEqual(session.screens.find(s=>s.title==='Uninstall').rows,['Claude','Codex','Everything (incl. CLI)','Back']);assert.ok(session.screens.some(s=>s.rows[0]===`Remove ARC from ${['Claude','Codex'][platform]}?`&&s.rows.includes('Remove')));assert.ok(!session.screens.some(s=>s.rows.includes('Both targets')));});
for(const cancel of [[enter],[back]])test('Everything confirmation cancellation '+JSON.stringify(cancel)+' never prepares',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(2),enter,...cancel,back,back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>assert.fail('cancel cannot prepare')}});const warning=session.screens.find(s=>s.rows[0]==='Remove ARC from all platforms and the arc CLI?');assert.deepEqual(warning.rows,['Remove ARC from all platforms and the arc CLI?','','Remove','Back']);assert.equal(warning.rows[warning.selected],'Back');if(cancel[0]===enter){const menus=session.screens.filter(s=>s.title==='Uninstall'&&s.rows.includes('Everything (incl. CLI)'));assert.equal(menus.at(-1).rows[menus.at(-1).selected],'Everything (incl. CLI)');}else assert.equal(session.screens.at(-1).title,'ARC');});
test('Everything Remove alone prepares all targets and executes identical snapshot once',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(2),enter,{name:'up'},enter,enter,back]);const prepared={kind:'uninstall'};let preparations=0,executions=0;await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async(c,o)=>{preparations++;assert.deepEqual(o,{kind:'uninstall',target:'all',removeCli:true});return prepared;},executeOperation:async(c,p)=>{executions++;assert.equal(p,prepared);return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executions,1);});
test('concise lifecycle result rows preserve diagnostics without rollback',async()=>{const{resultRows}=await load();assert.deepEqual(resultRows({code:0,results:[{platform:'codex',status:'installed',rollback:'not-needed'}]}),['ARC installed for Codex.']);assert.deepEqual(resultRows({code:0,results:[{platform:'claude',status:'uninstalled',rollback:'restored'}]}),['Removed from Claude.']);for(const [status,message]of [['removed','Removed ARC and CLI.'],['absent','Removed ARC.']]){const rows=resultRows({code:0,results:[{platform:'codex',status:'uninstalled'},{platform:'claude',status:'uninstalled'}],cli:{status},exitSession:status==='removed'});assert.ok(rows.includes(message));if(status==='removed')assert.ok(rows.includes('CLI removal ended this session.'));assert.doesNotMatch(rows.join('\n'),/rollback|Run arc again|Open a new agent/);}const rows=resultRows({code:7,stdout:'claude: failed; rollback: failed\nResidual path: /tmp/remains\n',results:[{platform:'claude',status:'failed',rollback:'failed',error:Error('failure'),residualPaths:['/tmp/remains']}]});assert.ok(rows.includes('claude: failed'));assert.ok(rows.includes('Error: failure'));assert.ok(rows.includes('Exit code: 7'));assert.doesNotMatch(rows.join('\n'),/rollback/);});

test('custom editor keeps long model choices selectable at 40 columns',async()=>{
 const model='fixture-'+('x'.repeat(200)),catalog={platform:'codex',pairs:[{model,effort:'medium'}]};let calls=0;
 const result=await selectCatalogPair({roleName:'Scouter',current:{model,effort:'medium'},catalog,ui:{menu:async(title,rows,options)=>{
  calls++;const state={selected:0,columns:40,rows:18},body=options.renderBody(state);assert.equal(renderScreen({title,rows:body.rows,selected:body.selected,compactFooter:body.compactFooter},{columns:40,rows:18}).selectionEnabled,true);let detail='';for(let page=0;page<body.detailPages;page++){const frame=options.renderBody(state);detail+=frame.rows.slice(0,frame.rows.findIndex(row=>row.startsWith('←/→: Details'))).join('');options.onHorizontal({...state,direction:'right'});}assert.ok(detail.includes(model));return 0;
 },page:async()=>assert.fail('unexpected page')}});assert.deepEqual(result,{model,effort:'medium'});assert.equal(calls,2);
});

test('TUI role selection prepares only role pairs and keeps environment secrets off screen',async()=>{
 const {runTui}=await load(),secret='fixture-sensitive-key',session=terminal([enter,...down(7),enter,enter,back]);let prepared;
 await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url)),env:{ANTHROPIC_API_KEY:secret}},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async(_context,options)=>{prepared=options;return{kind:'install',plans:[]};},executeOperation:async()=>({code:0,results:[]})}});
 assert.equal(Object.keys(prepared.roles).length,5);assert.doesNotMatch(JSON.stringify(prepared),/fixture-sensitive-key/);assert.doesNotMatch(JSON.stringify(session.screens),/fixture-sensitive-key/);
});
for(const firstCode of [0,1])test('role draft '+(firstCode?'survives failed execution':'is cleared after successful execution'),async()=>{
 const {runTui}=await load();const events=[enter,enter,...down(2),{name:'left'},...down(1),enter,...down(7),enter,enter,enter,...down(7),enter,enter,back];
 const session=terminal(events),prepared=[];let executed=0;
 await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async(_c,options)=>{prepared.push(structuredClone(options));return{kind:'install',plans:[]};},executeOperation:async()=>({code:executed++===0?firstCode:0,results:[]})}});
 assert.equal(prepared.length,2);assert.equal(prepared[0].roles.arc_scouter.model,'haiku');assert.equal(prepared[0].roles.arc_scouter.effort,'medium');assert.equal(prepared[1].roles.arc_scouter.effort,firstCode?'medium':'high');
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
 await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url))},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),collectStatus:async()=>[]}});
 const screen=session.screens.find(item=>item.title==='Install / Update'),rendered=renderScreen(screen,session.viewport());assert.equal(rendered.selectionEnabled,true);assert.ok(!rendered.styles.some(style=>style.color==='selected'));assert.match(rendered.text,/┌─ Scouter/);assert.doesNotMatch(rendered.text,/^> /m);assert.ok(session.screens.some(item=>item.title==='Scouter'));
});

test('home status shows Available, Not Available and Unauthorized labels',async()=>{
 const{runTui}=await load();
 const cases=[
  [[{platform:'claude',state:'installed',diagnostics:[],authentication:{platform:'claude',authStatus:'authenticated'}},{platform:'codex',state:'absent',diagnostics:[]}],'Claude: Available / Codex: Not Available'],
  [[{platform:'codex',state:'installed',diagnostics:[],authentication:{platform:'codex',authStatus:'unknown',reason:'cli_not_found'}},{platform:'claude',state:'installed',diagnostics:[],authentication:{platform:'claude',authStatus:'unauthorized'}}],'Claude: Unauthorized / Codex: Not Available']
 ];
 for(const [statuses,expected] of cases){const session=terminal([back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>statuses}});assert.equal(session.screens[0].rows[0],expected);}
});

test('uninstall confirmation during composite adds the turn-off line and switch flag',async()=>{
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,{name:'up'},enter,enter,back]);let prepared;
 await runTui({session,context:{},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex']}),collectStatus:async()=>installedStatuses(),prepareOperation:async(_ctx,options)=>{prepared=options;return{kind:'uninstall',options};},executeOperation:async()=>({code:0,results:[]})}});
 assert.ok(session.screens.some(s=>s.title==='Uninstall'&&s.rows.includes('Mixed routing will be turned off.')));assert.equal(prepared.switchFromComposite,true);
});

for(const lookup of ['default','missing','throws','unverified'])test('state lookup '+lookup+' keeps diagram usable and blocks unverified Apply',async()=>{
 const {runTui}=await load(),session=terminal([enter,...down(7),enter,back,back]);
 const services={collectStatus:async()=>[],prepareOperation:async()=>assert.fail('unverified cannot prepare'),executeOperation:async()=>assert.fail('unverified cannot execute')};
 if(lookup==='missing')services.currentInstallState=undefined;
 if(lookup==='throws')services.currentInstallState=async()=>{throw Error('state inspection failed');};
 if(lookup==='unverified')services.currentInstallState=()=>({mode:'unverified',platforms:[]});
 assert.equal(await runTui({session,context:{packageRoot:fileURLToPath(new URL('../../',import.meta.url)),userHome:'/private/tmp/arc-task16-state-probe',env:{},safeFs:{openRoot(){throw Error('state inspection failed');}}},services}),0);
 assert.ok(session.screens.some(s=>s.title==='Install / Update'&&s.rows.some(row=>row.includes('Scouter'))));assert.ok(session.screens.some(s=>s.title==='Operation unavailable'&&s.rows.includes('Mixed routing configuration cannot be verified.')));assert.ok(session.screens[0].rows.includes('Mode: Unverified'));
});
test('unverified Apply lists real management residual paths without preparing',async t=>{
 const {compositeContext,targets}=await import('./fixtures/install-mode.mjs');
 const {mkdirSync,writeFileSync}=await import('node:fs'),{join}=await import('node:path');
 const context=await compositeContext(t),home=targets(context).codex.home;
 const residualPaths=['arc-role-platform-routing.prepared.json','agents/arc-routing-qa.toml'].map(name=>join(home,name));
 mkdirSync(join(home,'agents'),{recursive:true});for(const filename of residualPaths)writeFileSync(filename,'{}');
 const {runTui}=await load(),session=terminal([enter,...down(7),enter,back,back]);let preparations=0;
 assert.equal(await runTui({session,context,services:{collectStatus:async()=>[],prepareOperation:async()=>{preparations++;assert.fail('unverified cannot prepare');},executeOperation:async()=>assert.fail('unverified cannot execute')}}),0);
 assert.equal(preparations,0);
 assert.ok(session.screens.some(screen=>screen.title==='Install / Update'));
 const screen=session.screens.find(screen=>screen.title==='Operation unavailable');assert.ok(screen);
 const pageText=screen.rows.join('');
 for(const filename of residualPaths)assert.ok(pageText.includes('Residual path: '+filename));
 assert.ok(screen.rows.includes('No changes were applied.'));
});
test('status line lists each platform and Mode line',async()=>{
 const {runTui}=await load();for(const [mode,auth,want] of [['composite','authenticated','Mode: Mixed (Claude + Codex)'],['standalone','authenticated','Mode: Claude, Codex'],['composite','unauthorized','Mode: Mixed (Claude + Codex)']]){
  const session=terminal([back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode,platforms:['claude','codex']}),collectStatus:async()=>['codex','claude'].map(platform=>({platform,state:'installed',authentication:{authStatus:platform==='codex'?auth:'authenticated'},diagnostics:platform==='claude'?[{message:'diagnostic'}]:[]}))}});
  assert.equal(session.screens[0].rows[0],'Claude: Available / Codex: '+(auth==='unauthorized'?'Unauthorized':'Available'));assert.equal(session.screens[0].rows[1],want);assert.equal(session.screens[0].rows[2],'Claude: diagnostic');
 }
});

test('Working screen has no body text',async()=>{const{createTuiInterface}=await load();const session=terminal([]);assert.equal(await createTuiInterface(session).busy(async()=>42),42);assert.deepEqual(session.screens[0].rows,[]);assert.equal(session.screens[0].hint,'Ctrl+C Interrupt');});
test('result rows hide a zero exit code and show nonzero ones',async()=>{const{resultRows}=await load();assert.deepEqual(resultRows({code:0,messages:['done']}),['done']);assert.deepEqual(resultRows({code:1,messages:['failed']}),['failed','Exit code: 1']);});
test('composite result messages use the new copy',async t=>{const{compositeContext,publish}=await import('./fixtures/install-mode.mjs');const ctx=await compositeContext(t);const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));assert.deepEqual(result.messages,['Mixed (Claude + Codex) activated.','After upgrading ARC, run Install / Update again.']);});
test('Check Version shows current → latest, Up to date, or the unavailable lines',async()=>{const{runTui}=await load();for(const [latestVersion,canUpgrade,latestError,want] of [['1.10.0',true,undefined,['1.9.0 → 1.10.0','','Upgrade','Back']],['1.9.0',false,undefined,['Up to date (1.9.0)','','Back']],[null,false,Error('offline'),['1.9.0 (latest unavailable)','offline','','Back']],['1.8.0',false,undefined,['Up to date (1.9.0)','','Back']]]){const session=terminal([...down(1),enter,back,back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',currentVersion:'1.9.0',latestVersion,canUpgrade,latestError})}});assert.deepEqual(session.screens.find(s=>s.title==='Check Version').rows,want);}});
for(const target of [0,1,2])test('Esc on confirmation '+target+' returns home',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,...down(target),enter,back,back]);await runTui({session,context:{},services:{currentInstallState:()=>({mode:'standalone',platforms:[]}),currentInstallMode:()=>'standalone',collectStatus:async()=>installedStatuses(),prepareOperation:async()=>assert.fail('Esc must not prepare')}});assert.equal(session.screens.at(-1).title,'ARC');assert.equal(session.screens.filter(s=>s.rows.includes('Everything (incl. CLI)')).length,target+1);});

test('unverified operation rejection displays residual paths',async()=>{
 const {runTui}=await load(),session=terminal([...down(2),enter,enter,{name:'up'},enter]);
 const error=Object.assign(Error('Mixed routing configuration cannot be verified.'),{residualPaths:['/tmp/unverified-marker']});
 await runTui({session,context:{},services:{currentInstallMode:()=>'unverified',collectStatus:async()=>installedStatuses(),prepareOperation:async()=>{throw error;},executeOperation:async()=>assert.fail('rejected operation must not execute')}});
 const screen=session.screens.find(s=>s.title==='Operation unavailable');assert.ok(screen);assert.ok(screen.rows.includes('Residual path: /tmp/unverified-marker'));assert.ok(screen.rows.includes('No changes were applied.'));
});

test('home capacity follows wordmarkRows in a 17-row terminal',async()=>{
 const{createTuiInterface}=await load(),session=terminal([...down(3),enter]);let last,screen;session.viewport=()=>({columns:80,rows:17});session.render=value=>{screen=value;last=renderScreen(screen,session.viewport());return last;};
 assert.equal(await createTuiInterface(session).menu('ARC',['Install / Update','Check Version','Uninstall','Exit'],{wordmark:true,info:['Status','Diagnostic','Diagnostic','Diagnostic']}),3);assert.equal(last.selectionEnabled,true);assert.equal(screen.position,undefined);assert.equal(screen.rows.filter(row=>['Install / Update','Check Version','Uninstall','Exit'].includes(row)).length,4);
});

test('home passes status and diagnostic tones without changing row text',async()=>{
 const{runTui}=await load(),session=terminal([...down(1),enter,back,back]);
 await runTui({session,context:{},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex']}),currentInstallMode:()=> 'composite',collectStatus:async()=>['claude','codex'].map(platform=>({platform,state:'installed',authentication:{authStatus:'authenticated'},diagnostics:platform==='claude'?[{message:'diagnostic'}]:[]})),prepareOperation:async()=>({kind:'update',currentVersion:'1.0.0',latestVersion:'1.0.0',canUpgrade:false})}});
 const screen=session.screens[0];assert.deepEqual(screen.rows,['Claude: Available / Codex: Available','Mode: Mixed (Claude + Codex)','Claude: diagnostic','','Install / Update','Check Version','Uninstall','Exit']);assert.deepEqual(screen.rowTones,['status',undefined,'diagnostic',undefined,undefined,undefined,undefined,undefined]);
 assert.ok(session.screens.filter(screen=>!screen.wordmark).every(screen=>screen.rowTones===undefined));
 const unknown=terminal([back]);await runTui({session:unknown,context:{},services:{currentInstallState:()=>({mode:'unverified',platforms:[]}),collectStatus:async()=>[{platform:'codex',state:'installed',authentication:{authStatus:'unknown',reason:'probe failed'}}]}});assert.deepEqual(unknown.screens[0].rows.slice(0,3),['Codex: Incomplete','Mode: Unverified','Codex: probe failed']);assert.deepEqual(unknown.screens[0].rowTones.slice(0,3),['status',undefined,'diagnostic']);
});
test('wrapped info keeps tones per display line',async()=>{
 const{createTuiInterface}=await load(),session=terminal([enter]);session.viewport=()=>({columns:30,rows:40});
 await createTuiInterface(session).menu('ARC',['Exit'],{info:['Codex: Available / Claude: Not Available','Codex: '+ 'x'.repeat(50),''],infoTones:['status','diagnostic',undefined]});
 assert.deepEqual(session.screens[0].rows,['Codex: Available / Claude: ','Not Available','Codex: '+ 'x'.repeat(20),'x'.repeat(27),'xxx','','Exit']);assert.deepEqual(session.screens[0].rowTones,['status','status','diagnostic','diagnostic-cont','diagnostic-cont',undefined,undefined]);
 const replaced=terminal([enter]);await createTuiInterface(replaced).menu('Settings',['Back'],{info:['Codex: boom'],infoTones:['diagnostic'],renderBody:()=>({rows:['Back'],selected:0})});assert.equal(replaced.screens[0].rowTones,undefined);
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
 const screen=session.screens[0],result=renderScreen(screen,session.viewport()),lines=result.text.split('\n');assert.deepEqual(screen.rows.slice(0,2),['Claude: Available / Codex: Not A','vailable']);
 const states=result.styles.flatMap(style=>style.runs.filter(run=>['ok','muted','warn','error'].includes(run.role)).map(run=>[lines[style.line].slice(run.from,run.to),run.role]));
 assert.deepEqual(states,[['Available','ok'],['Not A','muted'],['vailable','muted']]);
});
for(const ending of ['return','throw'])test('busy spinner stops before leaving busy on '+ending,async()=>{
 const{createTuiInterface}=await load(),session=terminal([]),calls=[];session.frameMs=10;session.setBusy=value=>calls.push(value);session.repaint=screen=>calls.push(screen.frame);
 const result=createTuiInterface(session).busy(async()=>{await new Promise(resolve=>setTimeout(resolve,45));if(ending==='throw')throw Error('action failed');return 42;});if(ending==='throw')await assert.rejects(result,/action failed/);else assert.equal(await result,42);
 const frames=calls.filter(value=>typeof value==='number');assert.ok(frames.length>=2);assert.deepEqual(frames,frames.map((_,index)=>index+1));assert.equal(calls.at(-1),false);const count=calls.length;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(calls.length,count);
});
for(const ending of ['escape','eof','error'])test('home animation clears its timer on '+ending,async()=>{
 const{createTuiInterface}=await load(),session=terminal([]),frames=[];let resolveEvent;session.frameMs=10;session.repaint=screen=>frames.push(screen.frame);session.nextEvent=()=>new Promise(resolve=>{resolveEvent=resolve;});const result=createTuiInterface(session).menu('ARC',['Exit'],{wordmark:true});await new Promise(resolve=>setTimeout(resolve,25));resolveEvent(ending==='error'?{name:'error',error:Error('read failed')}:{name:ending});await assert.rejects(result,ending==='escape'?{code:'ARC_TUI_HOME'}:ending==='eof'?{code:'ARC_TUI_EOF'}:/read failed/);const count=frames.length;await new Promise(resolve=>setTimeout(resolve,25));assert.equal(frames.length,count);
});

test('home uses injected registry labels and display order for four platforms',async()=>{
 const {createTestRegistries}=await import('./fixtures/platforms/zeta.mjs'),{runTui}=await load(),session=terminal([back]);
 await runTui({session,context:{platforms:createTestRegistries(['eta','zeta','codex','claude']).platforms},services:{currentInstallState:()=>({mode:'composite',platforms:['eta','zeta','codex','claude']}),collectStatus:async()=>['eta','zeta','codex','claude'].map(platform=>({platform,state:'installed',diagnostics:[{message:platform+' detail'}]}))}});
 assert.deepEqual(session.screens[0].rows.slice(0,6),['Claude: Available / Codex: Available / Zeta: Available / Eta: Available','Mode: Mixed (Claude + Codex + Zeta + Eta)','Claude: claude detail','Codex: codex detail','Zeta: zeta detail','Eta: eta detail']);
});
test('app loads current composite config and prepares diagram snapshot under busy',async()=>{
 const {runTui}=await load(),roles=Object.fromEntries(['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'].map(role=>[role,{platform:'codex',model:'gpt-6-luna',effort:'high'}]));
 const session=terminal([enter,...down(7),enter,enter,back]),catalogLoads=[],prepared=[];let configLoads=0,busy=false;
 session.setBusy=value=>{busy=value;};
 const code=await runTui({session,context:{},services:{currentInstallState:()=>({mode:'composite',platforms:['claude','codex'],anchor:'claude'}),collectStatus:async()=>['codex','claude'].map(platform=>({platform,state:'installed',authentication:{authStatus:'authenticated'},cliVersion:{version:'1.0.0'}})),readCompositeConfig:async()=>{configLoads++;return {version:2,revision:'saved',platforms:['claude','codex'],roles};},loadCatalog:async platform=>{catalogLoads.push(platform);return {status:'ready',catalog:{platform,pairs:[{model:platform==='codex'?'gpt-6-luna':'sonnet',effort:'high'}]}};},prepareOperation:async(context,options)=>{assert.equal(busy,true);assert.ok(context.signal);prepared.push(options);return{kind:'composite',options};},executeOperation:async(_context,operation)=>{assert.equal(busy,true);assert.equal(operation.options,prepared[0]);return{code:0,results:[]};}}});
 assert.equal(code,0);assert.equal(configLoads,1);assert.deepEqual([...catalogLoads].sort(),['claude','codex']);assert.equal(prepared.length,1);assert.equal(prepared[0].target,'composite');assert.deepEqual(prepared[0].config.roles,roles);assert.deepEqual(prepared[0].platforms,['claude','codex']);
});
