import test from 'node:test';import assert from 'node:assert/strict';
const load=()=>import('../../lib/tui/app.mjs');
function terminal(events){const screens=[];return{screens,viewport(){return{columns:120,rows:40};},render(s){screens.push(s);return{applyEnabled:true};},discardInput(){},setBusy(){},dispose(){this.closed=true;},async nextEvent(){if(events[0]==='readAll'){if(screens.at(-1)?.title==='Review all changes')return{name:'enter'};events.shift();}return events.shift()??{name:'eof'};}};}
const down=n=>Array.from({length:n},()=>({name:'down'})),enter={name:'enter'},back={name:'escape'};
test('home navigation never executes and retains failure until a new execution',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,enter,enter,back,...down(2),enter]);let calls=0;const code=await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>{calls++;return{code:1,results:[{platform:'codex',status:'failed',rollback:'complete',residualPaths:['/tmp/remains']}]};}}});assert.equal(calls,1);assert.equal(code,1);assert.ok(session.screens.some(s=>s.rows.includes('Install / Update')));assert.ok(session.screens.some(s=>s.title==='Result'&&s.rows.some(r=>r.includes('rollback: complete'))));assert.equal(session.closed,true);});
test('global replacement exits before rendering home again',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,enter]);const code=await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code:0,exitSession:true,results:[]})}});assert.equal(code,0);assert.equal(session.screens.filter(s=>s.title==='ARC').length,3);assert.equal(session.screens.at(-1).title,'Result');});
test('review shows every prepared managed path before final apply',async()=>{const{createTuiInterface}=await load();const session=terminal([...down(2),enter,'readAll',...down(1),enter]);const ui=createTuiInterface(session);const result=await ui.review('Install / Reconfigure',{kind:'install',options:{target:'codex'},plans:[{target:{platform:'codex',home:'/tmp/home'},managedPaths:Array.from({length:12},(_,i)=>'/tmp/home/file'+i),globalChanges:[{path:'/tmp/home/.zshrc',action:'remove managed completion'}],summary:['global cleanup planned']}]});assert.equal(result,'apply');assert.ok(session.screens.some(s=>s.rows.some(r=>r.includes('/tmp/home/file11'))));assert.ok(session.screens.some(s=>s.rows.some(r=>r.includes('remove managed completion'))));});
test('interrupt during version selection exits 130 without execution',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,{name:'interrupt'}]);let calls=0;assert.equal(await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>{calls++;}}}),130);assert.equal(calls,0);assert.equal(session.closed,true);});
test('Ctrl+C during asynchronous execution aborts the service and exits 130',async()=>{const{EventEmitter}=await import('node:events');const{runTui}=await load();const input=new EventEmitter(),session=terminal([...down(2),enter,enter]);const code=await runTui({input,session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async context=>{const waiting=new Promise(resolve=>context.signal?.addEventListener('abort',()=>resolve({code:130,results:[]}),{once:true}));input.emit('data',Buffer.from('\x03'));return Promise.race([waiting,new Promise(resolve=>setTimeout(()=>resolve({code:0,results:[]}),50))]);}}});assert.equal(code,130);assert.equal(input.listenerCount('data'),0);});
test('uninstall review reflects explicit preservation of global ARC blocks',async()=>{const{createTuiInterface}=await load();const session=terminal([enter]);await createTuiInterface(session).review('Uninstall',{kind:'uninstall',options:{target:'codex',skipGlobal:true},plans:[]});const rows=session.screens[0].rows.join('\n');assert.match(rows,/Preserve ARC global instruction blocks/);assert.doesNotMatch(rows,/Remove selected ARC global instruction blocks/);});
test('mixed target result keeps success alongside failed rollback and residual paths',async()=>{
 const{runTui}=await load();
 const session=terminal([...down(2),enter,enter,enter,...down(2),enter]);
 const code=await runTui({session,context:{},services:{
  collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),
  executeOperation:async()=>({code:1,exitSession:false,results:[
   {platform:'codex',status:'installed',rollback:'not-needed',residualPaths:[]},
   {platform:'claude',status:'failed',rollback:'complete',residualPaths:['/tmp/claude-residual'],error:Error('fixture target failure')}
  ]})
 }});
 const rows=session.screens.filter(s=>s.title==='Result').flatMap(s=>s.rows).join('\n');
 assert.match(rows,/codex: installed; rollback: not-needed/);
 assert.match(rows,/claude: failed; rollback: complete/);
 assert.match(rows,/Residual path: \/tmp\/claude-residual/);
 assert.match(rows,/fixture target failure/);
 assert.equal(code,1);
});

test('global update child diagnostics remain visible in the TUI result',async()=>{
 const{runTui}=await load();const session=terminal([...down(2),enter,enter]);
 await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code:1,exitSession:true,results:[],stdout:'codex: installed; rollback: not-needed\nclaude: failed; rollback: failed\nResidual path: /tmp/recovery\n',stderr:'Error: restore failed; manual recovery required\n'})}});
 const rows=session.screens.at(-1).rows.join('\n');assert.match(rows,/codex: installed/);assert.match(rows,/claude: failed; rollback: failed/);assert.match(rows,/Residual path: \/tmp\/recovery/);assert.match(rows,/manual recovery required/);
});
test('interrupted execution reports completed cleanup after terminal restoration for Ctrl+C and signals',async()=>{
 const{EventEmitter}=await import('node:events');const{runTui}=await load();
 for(const trigger of ['Ctrl+C','SIGINT','SIGTERM']){
  const signals=new EventEmitter(),input=new EventEmitter(),session=terminal([...down(2),enter,enter]);let output='';
  const code=await runTui({signals,input,session,output:{write(text){assert.equal(session.closed,true);output+=text;}},context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async context=>{if(trigger==='Ctrl+C')input.emit('data',Buffer.from('\x03'));else signals.emit(trigger);assert.equal(context.signal.aborted,true);return{code:130,results:[{platform:'codex',status:'installed',rollback:'not-needed'},{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/cancel-recovery'],error:Error('cleanup failed')},{platform:'other',status:'not-started'}]};}}});
  assert.equal(code,130);assert.match(output,/codex: installed/);assert.match(output,/claude: failed; rollback: failed/);assert.match(output,/Residual path: \/tmp\/cancel-recovery/);assert.match(output,/cleanup failed/);assert.match(output,/other: not-started/);assert.match(output,/Exit code: 130/);
 }
});
test('post-disposal reports escape terminal controls while retaining diagnostic rows',async()=>{
 const{runTui}=await load();
 for(const code of [1,130]){
  const session=terminal([...down(2),enter,enter]);let output='';
  const actualCode=await runTui({session,output:{write(text){assert.equal(session.closed,true);output+=text;}},context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),executeOperation:async()=>({code,exitSession:true,stdout:'codex: installed\nchild: \x1b[2Jkeep\rdiagnostic\n',stderr:'Error: child\x07 failure\n',results:[{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/\x1b[31mrecovery\rpath'],error:Error('restore\x08 failed')}]})}});
  assert.equal(actualCode,code);assert.ok(output.startsWith('codex: installed\nchild: \\x1b[2Jkeep\\x0ddiagnostic\nError: child\\x07 failure\n'));
  assert.ok(output.includes('Residual path: /tmp/\\x1b[31mrecovery\\x0dpath\n'));assert.ok(output.includes('Error: restore\\x08 failed\n'));assert.ok(output.includes('Exit code: '+code+'\n'));
  assert.doesNotMatch(output,/[\x00-\x09\x0b-\x1f\x7f]/);assert.ok(output.endsWith('\n'));
 }
});

test('home has five actions, exits on Escape and never calls Workflow',async()=>{
 const{runTui}=await load();const session=terminal([back]);let calls=0;
 const code=await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>{calls++;},executeOperation:async()=>{calls++;},listWorkflows:async()=>assert.fail('hidden Workflow must not run')}});
 assert.equal(code,0);assert.equal(calls,0);assert.equal(session.closed,true);assert.equal(session.screens.length,1);
 assert.deepEqual(session.screens[0].rows,['Install / Update','Change Preset','Check Version','Uninstall','Exit']);assert.match(session.screens[0].hint,/Esc Exit/);
});
test('Install Escape returns home before home Escape disposes',async()=>{
 const{runTui}=await load();const session=terminal([enter,back,back]);await runTui({session,context:{},services:{collectStatus:async()=>[]}});
 assert.deepEqual(session.screens.map(s=>s.title),['ARC','Install / Update','ARC']);assert.equal(session.closed,true);
});
test('idle Escape uses home control signal from all interface screens',async()=>{const{createTuiInterface}=await load();for(const mode of ['menu','text','page','review']){const ui=createTuiInterface(terminal([back]));await assert.rejects(()=>mode==='review'?ui.review('Task',{kind:'uninstall',plans:[]}):ui[mode]('Task',mode==='text'?'100':['One']),{code:'ARC_TUI_HOME'});}assert.equal(await createTuiInterface(terminal([back])).menu('ARC',['Exit'],{backLabel:'exit'}),null);});
test('Uninstall Edit preserves target and global selection and prepares anew',async()=>{
 const{runTui}=await load();const session=terminal([...down(3),enter,down(1)[0],enter,down(1)[0],enter,down(1)[0],enter,enter,enter,back]);const options=[];
 await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async(c,o)=>{options.push(o);return{kind:o.kind,options:o,plans:[]};},executeOperation:async()=>assert.fail('Cancel cannot execute')}});
 assert.equal(options.length,2);assert.deepEqual(options[0],options[1]);assert.equal(options[0].target,'claude');assert.equal(options[0].skipGlobal,true);
 const globals=session.screens.filter(s=>s.title==='Global ARC instructions');assert.equal(globals.at(-1).selected,1);
});

test('Details starts with scope and deduplicated counts then retains all labeled items and descriptions',async()=>{
 const{createTuiInterface}=await load();const session=terminal([...down(3),enter,enter,enter]);
 await createTuiInterface(session).review('Uninstall',{kind:'uninstall',options:{target:'all',skipGlobal:true},plans:[
 {target:{platform:'codex',home:'/c'},managedPaths:['/c/a','/c/b','/c/global'],removals:['/c/a','/c/./a'],globalChanges:[{path:'/c/global',action:'remove ARC block'},{path:'/c/global',action:'retain other sections'}],preserved:['/c/user'],summary:['Native settings are preserved.']},
 {target:{platform:'claude',home:'/d'},removals:['/d/a'],globalChanges:[]}
 ]});
 const details=session.screens.find(s=>s.title==='Change details').rows.join('\n');
 assert.match(details,/Operation: uninstall/);assert.match(details,/Targets: codex, claude/);assert.match(details,/codex: Changes: 1.*Deletions: 1.*Preserved: 1/);
 assert.ok(details.indexOf('Operation:')<details.indexOf('Destination:'));assert.match(details,/Changes/);assert.match(details,/Deletions/);assert.match(details,/Preserved/);assert.match(details,/Notes/);
 assert.match(details,/remove ARC block/);assert.match(details,/retain other sections/);assert.doesNotMatch(details,/managedPaths|globalChanges|skipGlobal/);
});
test('unknown Update scope stays unknown and uses installed-state target information',async()=>{
 const{createTuiInterface}=await load();const session=terminal([...down(2),enter,enter,enter]);await createTuiInterface(session).review('Update',{kind:'update',state:{targets:[{target:{platform:'claude',home:'/d'}}]}});
 const text=session.screens.filter(s=>s.title==='Change details').flatMap(s=>s.rows).join('\n');assert.match(text,/Targets: claude/);assert.doesNotMatch(text,/Changes: 0|Deletions: 0|Preserved: 0/);assert.match(text,/not supplied/);assert.match(text,/If the global CLI is replaced/);assert.match(text,/settings are preserved/);
});
test('required details cannot skip unread beginning and resize restarts review',async()=>{
 const{createTuiInterface}=await load();let calls=0;const screens=[];let viewport={columns:80,rows:8};
 const session={viewport:()=>viewport,render(s){screens.push(s);return{applyEnabled:true};},async nextEvent(){calls++;if(calls<18)return{name:'down'};if(calls===18)return{name:'enter'};if(calls===19){viewport={columns:90,rows:9};return{name:'resize'};}return{name:calls===20?'escape':'eof'};}};
 await assert.rejects(()=>createTuiInterface(session).page('Review all changes',Array.from({length:24},(_,i)=>'row'+i),{requireRead:true}),{code:'ARC_TUI_HOME'});
 assert.ok(!screens.some(s=>s.rows.includes('row23')),'cannot scroll past the sequential unread boundary');assert.equal(screens.at(-1).rows[0],'row0');
});
test('preparation failure shows error without exposing Apply or executing',async()=>{
 const{runTui}=await load();const session=terminal([...down(2),enter,enter,back]);let executes=0;assert.equal(await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>{throw Error('fixture preparation failed');},executeOperation:async()=>{executes++;}}}),1);assert.equal(executes,0);assert.ok(session.screens.some(s=>s.rows.includes('fixture preparation failed')));assert.ok(!session.screens.some(s=>s.title.startsWith('Review ')));
});
test('all long paths and external descriptions survive complete Details pagination',async()=>{
 const{createTuiInterface}=await load();const paths=Array.from({length:14},(_,i)=>'/tmp/'+('segment/').repeat(15)+'file'+i+'END');const session=terminal([...down(3),enter,...down(80),enter,enter]);session.viewport=()=>({columns:80,rows:12});
 await createTuiInterface(session).review('Install',{kind:'install',options:{target:'codex'},plans:[{target:{platform:'codex',home:'/tmp'},managedPaths:paths,summary:['note\nnext\x1b[2J']} ]});
 const details=session.screens.filter(s=>s.title==='Change details');const rows=details.flatMap(s=>s.rows);assert.ok(rows.some(r=>r.includes('file13END')));assert.ok(rows.some(r=>r.includes('note\\x0anext\\x1b[2J')));assert.ok(details.length>14);
});
test('review summary wraps at standard terminal width so Apply remains available',async()=>{
 const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([down(1)[0],back]);session.viewport=()=>({columns:80,rows:24});
 session.render=s=>{session.screens.push(s);const rendered=renderScreen(s,session.viewport());if(s.selected===s.rows.indexOf('Apply'))assert.equal(rendered.applyEnabled,true,rendered.text);return rendered;};
 await assert.rejects(()=>createTuiInterface(session).review('Update',{kind:'update',plans:[],currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true}),{code:'ARC_TUI_HOME'});
});
test('review keeps package retention and preservation impacts visible for both targets',async()=>{
 const{createTuiInterface}=await load();const session=terminal([enter]);await createTuiInterface(session).review('Uninstall',{kind:'uninstall',options:{target:'all'},plans:['codex','claude'].map(platform=>({target:{platform,home:'/tmp/'+platform},removals:['/tmp/'+platform+'/arc'],globalChanges:[]}))});
 const rows=session.screens[0].rows;assert.ok(rows.includes('Remove the verified global CLI only after all selected harnesses succeed.'));assert.ok(rows.includes('Preserve native concurrency, user files, other skills and workflow audit state.'));
});
test('all screen types use contextual compact hints while retaining existing navigation',async()=>{
 const{createTuiInterface}=await load();const session=terminal([back,back,back,back,back]);const ui=createTuiInterface(session);
 for(const action of [()=>ui.menu('Configure',['Install / Reconfigure','Change Preset']),()=>ui.text('Maximum total subagents','100'),()=>ui.page('Result',['Exit code: 0']),()=>ui.page('Operation unavailable',['fixture failure']),()=>ui.review('Update',{kind:'update',plans:[]})])await assert.rejects(action,{code:'ARC_TUI_HOME'});await ui.busy(async()=>({code:0}));
 const hints=Object.fromEntries(session.screens.map(screen=>[screen.title,screen.hint]));
 assert.equal(hints.Configure,'↑/↓: Select · Enter Continue · Esc Home');assert.equal(hints['Maximum total subagents'],'↑/↓: Select · Type/Paste Input · Backspace Delete · Enter Continue · Esc Home');assert.equal(hints.Result,'↑/↓: Scroll · Enter Back · Esc Home');assert.equal(hints['Operation unavailable'],'↑/↓: Scroll · Enter Back · Esc Home');assert.equal(hints['Review Update'],'↑/↓: Select · Enter Continue · Esc Home');assert.equal(hints.Working,'Ctrl+C Interrupt');
});

test('home status orders Claude then Codex on one line, preserves diagnostics and separates menu selection',async()=>{
 const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{},services:{collectStatus:async()=>[{platform:'codex',state:'incomplete',diagnostics:[Error('bad config\x1b[2J')]},{platform:'claude',state:'installed',diagnostics:[]}]}});
 const home=session.screens[0];assert.equal(home.rows[0],'Claude: Installed / Codex: Incomplete');assert.match(home.rows[1],/Codex: bad config/);assert.equal(home.rows[home.selected-1],'');assert.equal(home.rows[home.selected],'Install / Update');assert.equal(home.selected,3);
});
test('home status with one collected target does not invent the missing target',async()=>{
 const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{},services:{collectStatus:async()=>[{platform:'codex',state:'absent',diagnostics:[]}]}});assert.deepEqual(session.screens[0].rows.slice(0,3),['Codex: Not installed','','Install / Update']);assert.equal(session.screens[0].selected,2);
});

test('home exposes direct lifecycle actions in approved order',async()=>{const{runTui}=await load();const session=terminal([back]);await runTui({session,context:{},services:{collectStatus:async()=>[]}});assert.deepEqual(session.screens[0].rows,['Install / Update','Change Preset','Check Version','Uninstall','Exit']);});
test('menu inserts one unselectable spacer and skips it in both directions',async()=>{const{createTuiInterface}=await load();const session=terminal([down(1)[0],enter]);assert.equal(await createTuiInterface(session).menu('Settings',['Preset','Execute'],{separatorBefore:1}),1);assert.deepEqual(session.screens.at(-1).rows,['Preset','','Execute']);assert.equal(session.screens.at(-1).selected,2);const reverse=terminal([{name:'up'},enter]);assert.equal(await createTuiInterface(reverse).menu('Settings',['Preset','Apply'],{separatorBefore:1,selected:1}),0);});
test('empty actions ignore Enter and navigation with no pointer until Escape',async()=>{const{createTuiInterface}=await load();const session=terminal([enter,...down(1),{name:'up'},back]);await assert.rejects(()=>createTuiInterface(session).menu('Check Version',[],{info:['Current version: 1.10.0','Latest version: 1.9.0']}),{code:'ARC_TUI_HOME'});assert.equal(session.screens.length,4);assert.ok(session.screens.every(s=>s.selected===undefined));});
test('hidden Execute cannot run until resized to show the selected row',async()=>{const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([enter,back]);session.viewport=()=>({columns:12,rows:2});session.render=s=>{session.screens.push(s);return renderScreen(s,session.viewport());};await assert.rejects(()=>createTuiInterface(session).menu('Settings',['Preset','Execute'],{selected:1,separatorBefore:1}),{code:'ARC_TUI_HOME'});});
test('version upgrade is a selected row and executes the displayed snapshot without review',async()=>{const{runTui}=await load();const session=terminal([...down(2),enter,enter,enter,back]);const prepared={kind:'update',currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:true};let preparations=0,executed;await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>{preparations++;return prepared;},executeOperation:async(c,p)=>{executed=p;return{code:0,results:[]};}}});assert.equal(preparations,1);assert.equal(executed,prepared);const screen=session.screens.find(s=>s.title==='Check Version');assert.equal(screen.rows[screen.selected],'Version Upgrade');assert.ok(screen.rows.includes('Current version: 1.9.0'));assert.ok(screen.rows.includes('Latest version: 1.10.0'));assert.ok(screen.rows.includes('Continue?'));assert.ok(!session.screens.some(s=>s.title.startsWith('Review')));});
test('unavailable version has no upgrade row or pointer and Enter cannot execute',async()=>{const{runTui}=await load();for(const latestVersion of ['1.9.0','1.8.0',null]){const session=terminal([...down(2),enter,enter,back,back]);await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async()=>({kind:'update',currentVersion:'1.9.0',latestVersion,canUpgrade:false}),executeOperation:async()=>assert.fail('no upgrade')}});for(const screen of session.screens.filter(s=>s.title==='Check Version')){assert.equal(screen.selected,undefined);assert.ok(!screen.rows.includes('Version Upgrade'));}}});

test('CLI uninstall status and error remain visible beside harness partial results',async()=>{const{resultRows}=await load();const rows=resultRows({code:1,exitSession:true,results:[{platform:'codex',status:'uninstalled'}],cli:{status:'failed',error:Error('npm failure')}}).join('\n');assert.match(rows,/CLI: failed/);assert.match(rows,/npm failure/);assert.match(rows,/CLI removal ended this session/);});

test('generic text Apply returns edited string and Back returns null while editing selected actions',async()=>{const{createTuiInterface}=await load();const session=terminal([{name:'backspace'},{name:'paste',text:'한'},{name:'down'},{name:'text',text:'x'},{name:'backspace'},{name:'up'},enter]);assert.equal(await createTuiInterface(session).text('Input','12'),'1한');assert.deepEqual(session.screens[0].rows,['12','Apply','Back']);assert.equal(session.screens[0].selected,1);const cancel=terminal([{name:'down'},{name:'text',text:'discard'},enter]);assert.equal(await createTuiInterface(cancel).text('Input','old'),null);});
test('Backspace on menu and page never navigates',async()=>{const{createTuiInterface}=await load();for(const mode of ['menu','page']){const session=terminal([{name:'backspace'},enter]);assert.equal(await createTuiInterface(session)[mode]('Task',['One']),mode==='menu'?0:true);assert.equal(session.screens.length,2);}});
test('viewport menu window follows selected action on resize without dropping required information',async()=>{const{createTuiInterface}=await load();const{renderScreen}=await import('../../lib/tui/render.mjs');const session=terminal([...down(11),enter]);session.viewport=()=>({columns:100,rows:9});session.render=s=>{session.screens.push(s);return renderScreen(s,session.viewport());};assert.equal(await createTuiInterface(session).menu('Menu',Array.from({length:12},(_,i)=>'Action '+i)),11);assert.equal(session.screens.at(-1).rows.at(-1),'Action 11');assert.ok(session.screens.at(-1).position);});
test('input Apply prepares and executes once without a second Settings Apply',async()=>{const{runTui}=await load();const session=terminal([enter,enter,...down(2),enter,{name:'backspace'},{name:'backspace'},{name:'backspace'},{name:'text',text:'42'},enter,back,back]);let prepares=0,executes=0;await runTui({session,context:{},services:{collectStatus:async()=>[],prepareOperation:async(c,o)=>{prepares++;assert.equal(o.maxTotalSubagents,42);return{kind:o.kind,options:o};},executeOperation:async()=>{executes++;return{code:0,results:[]};}}});assert.equal(prepares,1);assert.equal(executes,1);assert.ok(!session.screens.some(s=>s.title==='Operation unavailable'));});

test('idle Escape reaches home from every nested lifecycle screen without executing prepared actions',async()=>{
 const{runTui}=await load();const scenarios=[
 ['target',[enter]],['Settings',[enter,enter]],['chooser',[enter,enter,enter]],['input',[enter,enter,...down(2),enter]],
 ['Both mismatch',[enter,...down(2),enter]],['uninstall target',[...down(3),enter]],['global choice',[...down(3),enter,enter]],
 ['review',[...down(3),enter,enter,enter]],['Details',[...down(3),enter,enter,enter,...down(3),enter]],
 ['Confirm',[...down(3),enter,enter,enter,...down(2),enter,'readAll']],['error',[...down(2),enter]],['Result',[...down(2),enter,enter]]
 ];
 for(const[name,events]of scenarios){const session=terminal([...events,back,back]);let executed=0;await runTui({session,context:{},services:{collectStatus:async()=>name==='Both mismatch'?[{platform:'codex',settings:{modelConfig:{preset:'smart'}}}]:[],prepareOperation:async(c,o)=>{if(name==='error')throw Error('fixture');return{kind:o.kind,options:o,plans:[],canUpgrade:true};},executeOperation:async()=>{executed++;return{code:0,results:[]};}}});assert.equal(executed,name==='Result'?1:0,name);assert.equal(session.screens.at(-1).title,'ARC',name);assert.equal(session.screens.filter((s,i)=>s.title==='ARC'&&session.screens[i-1]?.title!=='ARC').length,2,name);assert.ok(!session.screens.some(s=>s.title==='Operation unavailable')||name==='error',name);}
});
