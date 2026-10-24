import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';
const available=process.platform==='darwin'&&spawnSync('which',['expect']).status===0;
const url=new URL('../../lib/tui/app.mjs',import.meta.url).href;
async function drive(t,steps,{execute='return{code:0,results:[]};',plans='[]',observe='',canUpgrade=true}={}){
 const program=`import {runTui} from ${JSON.stringify(url)};${observe}let calls=0,prepares=0;const before=process.stdin.isRaw;const code=await runTui({context:{},services:{collectStatus:async()=>[],prepareOperation:async(c,o)=>{prepares++;return{kind:o.kind,options:o,plans:${plans},currentVersion:'1.9.0',latestVersion:'1.10.0',canUpgrade:${canUpgrade}};},executeOperation:async context=>{calls++;${execute}}}});console.log('CODE='+code+' CALLS='+calls+' PREPARES='+prepares+' RESTORED='+(before===process.stdin.isRaw));`;
 const q=v=>"'"+v.replaceAll("'","'\\''")+"'";
 const command=`stty rows 40 cols 120; before=$(stty -g); ${q(process.execPath)} --input-type=module -e ${q(program)}; after=$(stty -g); test "$before" = "$after" && echo TERMIOS_RESTORED; stty -a`;
 const script=`set timeout 10\nexpect_before timeout {puts stderr {PTY expectation timed out}; exit 91}\nspawn -noecho /bin/sh -c {${command}}\nproc down {} {send -- "\\033\\\[B"; after 80}\nproc enter {} {send -- "\\r"; after 80}\nproc back {} {send -- "\\033"; after 80}\nexpect -exact {Esc Exit}\n${steps}\nexpect eof\nset result [wait]\nexit [lindex $result 3]`;
 const child=spawn('expect',['-c',script]);let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);const timer=setTimeout(()=>child.kill('SIGKILL'),14000);t.after(()=>clearTimeout(timer));
 assert.equal(await new Promise(resolve=>child.on('close',resolve)),0,output);assert.match(output,/RESTORED=true/);assert.match(output,/TERMIOS_RESTORED/);assert.doesNotMatch(output,/-icanon/);return output;
}
test('actual app restores PTY after home Escape with no execution',{skip:!available},async t=>{
 const output=await drive(t,'back');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('queued Enter never reaches install Execute',{skip:!available},async t=>{
 const output=await drive(t,'send -- "\\r\\r\\r"\nexpect -exact {Install / Update}\nafter 100\nsend -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('install skips blank spacer and Execute runs once without review',{skip:!available},async t=>{
 const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\ndown\ndown\ndown\nexpect -exact {> Execute}\nsend -- "\\r\\r\\r"\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Install|Confirm Install/);
});
test('preset chooser edits draft and returns focus to Apply without executing',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Change Preset}\nenter\nexpect -exact {> Apply}\nsend -- "\\033\\[A"\nafter 80\nenter\nexpect -exact {Performance preset}\ndown\nenter\nexpect -exact {Preset: smart}\nexpect -exact {> Apply}\nsend -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('preset Apply needs its own Enter and runs once',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Change Preset}\nenter\nexpect -exact {> Apply}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Change Preset/);
});
test('Check Version exposes a real selected upgrade row and applies once',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {Current version: 1.9.0}\nexpect -exact {Latest version: 1.10.0}\nexpect -exact {Continue?}\nexpect -exact {> Version Upgrade}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Update|Confirm Update/);
});
test('version with no actions ignores Enter until Escape',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {Latest version}\nenter\nenter\nback\nexpect -exact {Esc Exit}\nback',{canUpgrade:false});assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);assert.doesNotMatch(output,/> Version Upgrade/);
});
test('Uninstall Edit and Escape retain target and global choice',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\ndown\nexpect -exact {> Uninstall}\nenter\nexpect -exact {Uninstall target}\ndown\nenter\nexpect -exact {Global ARC instructions}\ndown\nenter\nexpect -exact {Review Uninstall}\ndown\nenter\nexpect -exact {> Preserve ARC blocks}\nenter\nexpect -exact {Review Uninstall}\nback\nexpect -exact {> Preserve ARC blocks}\nback\nexpect -exact {> Claude}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=2/);
});
for(const trigger of ['Ctrl+C','SIGINT','SIGTERM'])test('actual app reports cleanup after restoring PTY on '+trigger,{skip:!available},async t=>{
 const execute=`${trigger==='Ctrl+C'?'':`setTimeout(()=>process.kill(process.pid,${JSON.stringify(trigger)}),100);`}await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));await new Promise(resolve=>setTimeout(resolve,20));return{code:130,results:[{platform:'codex',status:'installed',rollback:'not-needed'},{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/pty-recovery'],error:Error('cleanup failed')}]};`;
 const observe=`const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{if(String(chunk).includes('Residual path:'))original('REPORT_RESTORED='+!process.stdin.isRaw+'\\n');return original(chunk,...args);};`;
 const output=await drive(t,`down\ndown\nenter\nexpect -exact {> Version Upgrade}\nenter\nexpect -exact {Working}\n${trigger==='Ctrl+C'?'send -- "\\003"':''}`,{execute,observe});
 assert.match(output,/codex: installed; rollback: not-needed/);assert.match(output,/claude: failed; rollback: failed/);assert.match(output,/Residual path: \/tmp\/pty-recovery/);assert.match(output,/cleanup failed/);assert.match(output,/CODE=130 CALLS=1/);assert.match(output,/REPORT_RESTORED=true/);
});
test('long required Details resets after resize and Escape never applies',{skip:!available},async t=>{
 const observe=`import {spawnSync} from 'node:child_process';let resized=false;const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{const result=original(chunk,...args);if(!resized&&String(chunk).includes('Review all changes')){resized=true;setTimeout(()=>{spawnSync('stty',['rows','3','cols','30'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original('NARROW\\n'),50);},100);setTimeout(()=>{spawnSync('stty',['rows','40','cols','120'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original('WIDE\\n'),50);},500);}return result;};`;
 const plans=`[{target:{platform:'codex',home:'/tmp'},removals:Array.from({length:14},(_,i)=>'/tmp/'+('segment/').repeat(15)+'file'+i+'END')}]`;
 const output=await drive(t,'down\ndown\ndown\nexpect -exact {> Uninstall}\nenter\nexpect -exact {Uninstall target}\nenter\nexpect -exact {Global ARC instructions}\nenter\nexpect -exact {Review Uninstall}\ndown\ndown\nenter\nexpect -exact {NARROW}\nenter\nexpect -exact {WIDE}\nenter\nexpect -exact {file13END}\nenter\nexpect -exact {Confirm Uninstall}\nback\nexpect -exact {Review Uninstall}\nenter\nexpect -exact {Esc Exit}\nback',{plans,observe});
 assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);assert.match(output,/Resize terminal/);
});

test('EOF restores the terminal without preparing or executing',{skip:!available},async t=>{const output=await drive(t,'send -- "\\004"');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);});
test('hidden Execute ignores Enter during narrow viewport and runs after resize',{skip:!available},async t=>{
 const observe=`import {spawnSync} from 'node:child_process';let resized=false;const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{const result=original(chunk,...args);if(!resized&&String(chunk).includes('> Execute')){resized=true;setTimeout(()=>{spawnSync('stty',['rows','3','cols','20'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original('NARROW\\n'),50);},100);setTimeout(()=>{spawnSync('stty',['rows','40','cols','120'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original('WIDE\\n'),50);},500);}return result;};`;
 const output=await drive(t,'enter\nexpect -exact {Install / Update}\nenter\nexpect -exact {Settings}\ndown\ndown\ndown\ndown\ndown\nexpect -exact {NARROW}\nenter\nexpect -exact {WIDE}\nenter\nexpect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback',{observe});assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);
});
