import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const available=process.platform==='darwin'&&spawnSync('which',['expect']).status===0;
const url=new URL('../../lib/tui/app.mjs',import.meta.url).href;
const modelsUrl=new URL('../../lib/models/index.mjs',import.meta.url).href,packageUrl=new URL('../../',import.meta.url);
async function drive(t,steps,{execute='return{code:0,results:[]};',plans='[]',observe='',canUpgrade=true,catalog=null}={}){
 const program=`import {runTui} from ${JSON.stringify(url)};import {readFileSync} from 'node:fs';import {loadModelConfig} from ${JSON.stringify(modelsUrl)};const statuses=['codex','claude'].map(platform=>({platform,state:'installed',settings:{language:'en',modelConfig:loadModelConfig(readFileSync(new URL(platform+'/skill/models.toml',${JSON.stringify(packageUrl.href)}),'utf8'),platform),limits:{max_total_subagents:100,max_concurrent_subagents:5}},diagnostics:[]}));${observe}let calls=0,prepares=0,preparedOptions;const before=process.stdin.isRaw;const code=await runTui({context:{packageRoot:${JSON.stringify(fileURLToPath(packageUrl))}},services:{collectStatus:async()=>statuses,loadCatalog:async()=>(${JSON.stringify(catalog)}),prepareOperation:async(c,o)=>{prepares++;preparedOptions=o;return{kind:o.kind,options:o,plans:${plans},currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:${canUpgrade}};},executeOperation:async context=>{calls++;${execute}}}});console.log('OPTIONS='+JSON.stringify(preparedOptions));console.log('CODE='+code+' CALLS='+calls+' PREPARES='+prepares+' RESTORED='+(before===process.stdin.isRaw));`;
 const q=v=>"'"+v.replaceAll("'","'\\''")+"'";
 const command=`stty rows 40 cols 120; before=$(stty -g); ${q(process.execPath)} --input-type=module -e ${q(program)}; after=$(stty -g); test "$before" = "$after" && echo TERMIOS_RESTORED; stty -a`;
 // Drain completed frames between consecutive inputs so PTY output cannot block writes.
 steps=steps.replace(/expect -exact \{Maximum total subagents\}\n(?=send)/g,'expect -exact {Maximum total subagents}\nexpect -re {Esc Home}\n').replace(/down\n(?=down)/g,'down\nexpect -re {Esc (Home|Exit)}\n').replace(/after 80\n(?=send|down|enter)/g,'after 80\nexpect -re {Esc Home}\n');
 const script=`set timeout 10\nexpect_before timeout {puts stderr {PTY expectation timed out}; exit 91}\nspawn -noecho /bin/sh -c {${command}}\nproc down {} {send -- "\\033\\\[B"; after 80}\nproc enter {} {send -- "\\r"; after 80}\nproc back {} {send -- "\\033"; after 80}\nexpect -exact {Esc Exit}\n${steps}\nexpect eof\nset result [wait]\nexit [lindex $result 3]`;
 const child=spawn('expect',['-c',script]);let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);const timer=setTimeout(()=>child.kill('SIGKILL'),14000);t.after(()=>clearTimeout(timer));
 assert.equal(await new Promise(resolve=>child.on('close',resolve)),0,output);assert.doesNotMatch(output,/Operation unavailable/);assert.match(output,/RESTORED=true/);assert.match(output,/TERMIOS_RESTORED/);assert.doesNotMatch(output,/-icanon/);return output;
}
test('actual app restores PTY after home Escape with no execution',{skip:!available},async t=>{
 const output=await drive(t,'back');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('queued Enter never reaches install Apply',{skip:!available},async t=>{
 const output=await drive(t,'send -- "\\r\\r\\r"\nexpect -exact {Install / Update}\nafter 100\nsend -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('install skips blank spacer and Apply runs once without review',{skip:!available},async t=>{
 const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\ndown\ndown\ndown\nexpect -exact {> Apply}\nsend -- "\\r\\r\\r"\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Install|Confirm Install/);
});
test('preset chooser edits draft and returns focus to Apply without executing',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Change Preset}\nexpect -exact {> Codex}\nenter\nexpect -exact {> Preset: Balanced}\nenter\nexpect -exact {Performance preset}\ndown\nexpect -exact {> Smart}\nenter\nexpect -exact {Preset: Smart}\nexpect -exact {> Apply}\nsend -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('preset Apply needs its own Enter and runs once',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Change Preset}\nexpect -exact {> Codex}\nenter\nexpect -exact {> Preset: Balanced}\ndown\nexpect -exact {> Apply}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Change Preset/);
});
test('Check Version exposes a real selected upgrade row and applies once',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {Current version: 1.9.0}\nexpect -exact {Latest version: 1.10.0}\nexpect -exact {Continue?}\nexpect -exact {> Version Upgrade}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Update|Confirm Update/);
});
test('version without an upgrade selects Back and Enter returns home',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {Latest version}\nexpect -exact {> Back}\nenter\nexpect -exact {Esc Exit}\nback',{canUpgrade:false});assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);assert.doesNotMatch(output,/> Version Upgrade/);
});
test('Remove CLI warning defaults Back and Escape retains menu selection',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\ndown\nenter\nexpect -exact {> Settings}\ndown\nenter\nexpect -exact {Removes ARC settings for Codex and Claude, then removes the ARC CLI.}\nexpect -exact {> Back}\nenter\nexpect -exact {> Remove CLI}\nenter\nexpect -exact {> Back}\nback\nexpect -exact {> Remove CLI}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
for(const trigger of ['Ctrl+C','SIGINT','SIGTERM'])test('actual app reports cleanup after restoring PTY on '+trigger,{skip:!available},async t=>{
 const execute=`${trigger==='Ctrl+C'?'':`setTimeout(()=>process.kill(process.pid,${JSON.stringify(trigger)}),100);`}await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));await new Promise(resolve=>setTimeout(resolve,20));return{code:130,results:[{platform:'codex',status:'installed',rollback:'not-needed'},{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/pty-recovery'],error:Error('cleanup failed')}]};`;
 const observe=`const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{if(String(chunk).includes('Residual path:'))original('REPORT_RESTORED='+!process.stdin.isRaw+'\\n');return original(chunk,...args);};`;
 const output=await drive(t,`down\ndown\nenter\nexpect -exact {> Version Upgrade}\nenter\nexpect -exact {Working}\n${trigger==='Ctrl+C'?'send -- "\\003"':''}`,{execute,observe});
 assert.match(output,/ARC installed for Codex\./);assert.match(output,/claude: failed/);assert.match(output,/Residual path: \/tmp\/pty-recovery/);assert.match(output,/cleanup failed/);assert.match(output,/CODE=130 CALLS=1/);assert.match(output,/REPORT_RESTORED=true/);
});
test('Settings platform selection executes once and preserves CLI explicitly',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\ndown\nenter\nexpect -exact {> Settings}\nenter\nexpect -exact {Uninstall settings}\ndown\nexpect -exact {> Claude}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"kind":"uninstall","target":"claude","removeCli":false/);
});
test('Remove CLI requires deliberate Continue and executes once despite queued Enter',{skip:!available},async t=>{const output=await drive(t,'down\ndown\ndown\nenter\nexpect -exact {> Settings}\ndown\nenter\nexpect -exact {> Back}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Continue}\nsend -- "\\r\\r\\r"\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"target":"all","removeCli":true/);});

test('EOF restores the terminal without preparing or executing',{skip:!available},async t=>{const output=await drive(t,'send -- "\\004"');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);});
test('hidden Apply is blocked after each shrink and runs after the final resize',{skip:!available},async t=>{
 const observe=`import {spawnSync} from 'node:child_process';let resized=false;const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{const result=original(chunk,...args);if(!resized&&String(chunk).includes('> Apply')){resized=true;for(const [delay,rows,cols,marker] of [[100,'3','20','NARROW'],[450,'40','120','WIDE'],[750,'3','20','NARROW2'],[1050,'40','120','WIDE2']])setTimeout(()=>{spawnSync('stty',['rows',rows,'cols',cols],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original(marker+'\\n'),50);},delay);}return result;};`;
 const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\ndown\ndown\ndown\nexpect -exact {NARROW}\nenter\nexpect -exact {WIDE}\nexpect -exact {NARROW2}\nenter\nexpect -exact {WIDE2}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback',{observe});assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);
});

test('input DEL and BS edit while Back discards text and keeps Settings values',{skip:!available},async t=>{const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\nenter\nexpect -exact {Maximum total subagents}\nsend -- "\\177"\nafter 80\nsend -- "\\010"\nafter 80\nsend -- "7"\nafter 80\ndown\nexpect -exact {> Back}\nenter\nexpect -exact {Total subagents: 100}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);});
test('input paste Apply validates and executes once with lowercase settings',{skip:!available},async t=>{const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\nenter\nexpect -exact {Maximum total subagents}\nsend -- "\\177"\nafter 80\nsend -- "\\177"\nafter 80\nsend -- "\\010"\nafter 80\nsend -- "\\033\\[200~42\\033\\[201~"\nafter 80\ndown\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Save}\nenter\nexpect -exact {Total subagents: 42}\ndown\ndown\ndown\nexpect -exact {> Apply}\nenter\nexpect -exact {Result}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"maxTotalSubagents":42/);assert.match(output,/"preset":"balanced","language":"en"/);});
test('invalid input Apply preserves editable text then correction executes once',{skip:!available},async t=>{const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\nenter\nexpect -exact {Maximum total subagents}\nsend -- "\\177"\nafter 80\nsend -- "\\177"\nafter 80\nsend -- "\\177"\nafter 80\nsend -- "0"\nafter 80\nenter\nexpect -exact {Invalid limit}\nenter\nexpect -exact {Maximum total subagents}\nexpect -exact {  0}\nsend -- "\\010"\nafter 80\nsend -- "9"\nafter 80\nenter\nexpect -exact {Total subagents: 9}\ndown\ndown\ndown\nexpect -exact {> Apply}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"maxTotalSubagents":9/);});
for(const screen of ['input','chooser','settings-target'])test('Escape from '+screen+' returns directly home in PTY',{skip:!available},async t=>{const steps=screen==='settings-target'?'down\ndown\ndown\nenter\nexpect -exact {> Settings}\nenter\nexpect -exact {Uninstall settings}':screen==='input'?'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\nenter\nexpect -exact {Maximum total subagents}':'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\nenter\nexpect -exact {Performance preset}';const output=await drive(t,steps+'\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);});

for(const [name,moves] of [['Install / Update',''],['Change Preset','down\n'],['Uninstall','down\ndown\ndown\n']])test('target Back returns home from '+name,{skip:!available},async t=>{
 const ready=name==='Change Preset'?'expect -exact {> Codex}\n':name==='Uninstall'?'expect -exact {> Settings}\n':'';
 const output=await drive(t,moves+'enter\nexpect -exact {'+name+'}\n'+ready+'send -- "\\033\\[A"\nafter 80\nexpect -exact {> Back}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('Settings and chooser Back preserve Claude settings and target selection',{skip:!available},async t=>{
 const output=await drive(t,'enter\nexpect -exact {Install / Update}\ndown\nenter\nexpect -exact {Settings — claude}\nenter\nexpect -exact {Performance preset}\ndown\nexpect -exact {> Smart}\ndown\nexpect -exact {> Custom}\ndown\nexpect -exact {> Back}\nenter\nexpect -exact {Preset: Balanced}\ndown\nenter\nexpect -exact {Harness output language}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Back}\nenter\nexpect -exact {Harness language: EN}\nsend -- "\\033\\[A"\nafter 80\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Back}\nenter\nexpect -exact {Install / Update}\nexpect -exact {> Claude}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});

test('Custom role edits reach Settings but do not apply before Apply',{skip:!available},async t=>{
 const catalog={status:'ready',catalog:{platform:'codex',pairs:[{model:'fixture-model',effort:'high'}],unavailable:[]}};
 const output=await drive(t,`enter
expect -exact {Install / Update}
enter
expect -exact {Settings}
enter
expect -exact {Performance preset}
down
expect -exact {> Smart}
down
expect -exact {> Custom}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
enter
expect -exact {Select model}
expect -exact {Esc Home}
enter
expect -exact {Select effort}
expect -exact {Esc Home}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
down
expect -exact {> Planner}
enter
expect -exact {Select model}
expect -exact {Esc Home}
enter
expect -exact {Select effort}
expect -exact {Esc Home}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
down
expect -exact {> Implementer}
enter
expect -exact {Select model}
expect -exact {Esc Home}
enter
expect -exact {Select effort}
expect -exact {Esc Home}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
down
expect -exact {> QA}
enter
expect -exact {Select model}
expect -exact {Esc Home}
enter
expect -exact {Select effort}
expect -exact {Esc Home}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
down
expect -exact {> Reviewer}
enter
expect -exact {Select model}
expect -exact {Esc Home}
enter
expect -exact {Select effort}
expect -exact {Esc Home}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
down
expect -exact {> Done}
enter
expect -exact {Preset: Custom}
send -- "\\003"`,{catalog});
 assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);assert.doesNotMatch(output,/entitlement|permission.{0,30}(?:unverified|not verified)|(?:unverified|not verified).{0,30}permission/i);
});

test('Custom resize blocks editing until diagram fits and retains focused pending pair',{skip:!available},async t=>{
 const catalog={status:'ready',catalog:{platform:'codex',pairs:[{model:'fixture-model',effort:'high'},{model:'fixture-model',effort:'low'}],unavailable:[]}};
 const observe=`import {spawnSync} from 'node:child_process';let resized=false,effortResized=false;const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{const result=original(chunk,...args);if(!resized&&String(chunk).includes('> Planner')){resized=true;setTimeout(()=>{spawnSync('stty',['rows','23','cols','70'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');},100);setTimeout(()=>{spawnSync('stty',['rows','40','cols','120'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');},1200);}if(!effortResized&&String(chunk).includes('> low')){effortResized=true;setTimeout(()=>{spawnSync('stty',['rows','12','cols','40'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');original('EFFORT_NARROW\\n');},100);setTimeout(()=>{spawnSync('stty',['rows','40','cols','120'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original('EFFORT_WIDE\\n'),100);},600);}return result;};`;
 const output=await drive(t,`enter
expect -exact {Install / Update}
enter
expect -exact {Settings}
enter
expect -exact {Performance preset}
down
expect -exact {> Smart}
down
expect -exact {> Custom}
enter
expect -exact {Custom preset}
expect -exact {Esc Home}
down
expect -exact {Diagram requires}
enter
expect -exact {> Planner}
enter
expect -exact {Select model — Planner}
enter
expect -exact {Select effort — Planner}
down
expect -exact {EFFORT_NARROW}
expect -exact {EFFORT_WIDE}
enter
expect -exact {> Planner}
expect -exact {fixture-model}
expect -exact {effort: low}
send -- "\\003"`,{catalog,observe});
 assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
