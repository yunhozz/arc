import {writeFakeGrokCli} from './fixtures/platforms/grok-off.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {mixedConfig} from './fixtures/install-mode.mjs';
const fixturePath=fileURLToPath(new URL('./fixtures/grok/',import.meta.url))+':/usr/bin:/bin';
const available=process.platform==='darwin'&&spawnSync('which',['expect']).status===0;
const withoutSgr=output=>output.replace(/\x1b\[[0-9;]*m/g,'');
const packageVersion=JSON.parse((await import('node:fs')).readFileSync(new URL('../../package.json',import.meta.url))).version;
const url=new URL('../../lib/tui/app.mjs',import.meta.url).href;
const modelsUrl=new URL('../../lib/models/index.mjs',import.meta.url).href,packageUrl=new URL('../../',import.meta.url);
async function drive(t,steps,{execute='return{code:0,results:[]};',plans='[]',observe='',prepare='',canUpgrade=true,latestVersion=canUpgrade?'1.10.0':'1.9.0',latestError=null,absentPlatforms=[],catalog=null,installState={mode:'standalone',platforms:[]},codexAuth='authenticated',currentConfig=null,zetaVariant=null,env={...process.env,PATH:fixturePath}}={}){
 const program=`import {createZetaRegistries,ZETA_CAPABILITY_OFF} from ${JSON.stringify(new URL('./fixtures/platforms/zeta.mjs',import.meta.url).href)};import {migrationRegistries} from ${JSON.stringify(new URL('./fixtures/legacy-composite.mjs',import.meta.url).href)};import {runTui} from ${JSON.stringify(url)};import {readFileSync} from 'node:fs';import {loadModelConfig} from ${JSON.stringify(modelsUrl)};const statuses=['codex','claude'].map(platform=>({platform,state:${JSON.stringify(absentPlatforms)}.includes(platform)?'absent':'installed',settings:{runMode:'supervised',language:'en',modelConfig:loadModelConfig(readFileSync(new URL(platform+'/skill/models.toml',${JSON.stringify(packageUrl.href)}),'utf8'),platform),limits:{max_total_subagents:100,max_concurrent_subagents:5}},diagnostics:[],authentication:{authStatus:platform==='codex'?${JSON.stringify(codexAuth)}:'authenticated'},cliVersion:{version:'1.0.0'}}));if(${JSON.stringify(zetaVariant)})statuses.push({platform:'zeta',state:'absent',authentication:{authStatus:'unknown',reason:'auth_unverified'},cliVersion:{version:'1.0.0'}});${observe}let calls=0,prepares=0,preparedOptions;const before=process.stdin.isRaw;const code=await runTui({context:{env:{PATH:process.env.PATH},...(${JSON.stringify(zetaVariant)}?createZetaRegistries(${JSON.stringify(zetaVariant==='off')}?ZETA_CAPABILITY_OFF:undefined):{}),packageRoot:${JSON.stringify(fileURLToPath(packageUrl))},...(${JSON.stringify(installState.legacyAnchor===true)}?migrationRegistries():{})},services:{...(${JSON.stringify(currentConfig)}?{readCompositeConfig:async()=>(${JSON.stringify(currentConfig)})}:{}),currentInstallState:()=>(${JSON.stringify(installState)}),collectStatus:async()=>statuses,...( ${JSON.stringify(catalog)} ? {loadCatalog:async()=>(${JSON.stringify(catalog)})} : {}),prepareOperation:async(c,o)=>{prepares++;preparedOptions=o;${prepare}return{kind:o.kind,options:o,plans:${plans},state:{targets:[{target:{platform:'codex'}}]},currentVersion:'1.9.0',latestVersion:${JSON.stringify(latestVersion)},latestError:${JSON.stringify(latestError)},canUpgrade:${canUpgrade}};},executeOperation:async context=>{calls++;${execute}}}});console.log('OPTIONS='+JSON.stringify(preparedOptions));console.log('CODE='+code+' CALLS='+calls+' PREPARES='+prepares+' RESTORED='+(before===process.stdin.isRaw));`;
 const q=v=>"'"+v.replaceAll("'","'\\''")+"'";
 const command=`stty rows 40 cols 120; before=$(stty -g); ${q(process.execPath)} --input-type=module -e ${q(program)}; after=$(stty -g); test "$before" = "$after" && echo TERMIOS_RESTORED; stty -a`;
 // Drain completed frames between consecutive inputs so PTY output cannot block writes.
 steps=steps.replace(/expect -exact \{Total subagents\}\n/g,'expect -exact {Total subagents}\nexpect -exact {Type/Paste Input}\n').replace(/expect -exact \{Total subagents\}\n(?=send)/g,'expect -exact {Total subagents}\nexpect -re {Esc Home}\n').replace(/down\n(?=down)/g,'down\nexpect -re {Esc (Home|Exit)}\n').replace(/after 80\n(?=send|down|enter)/g,'after 80\nexpect -re {Esc Home}\n');
 const script=`set timeout 10\nexpect_before timeout {puts stderr {PTY expectation timed out}; exit 91}\nspawn -noecho /bin/sh -c {${command}}\nproc down {} {send -- "\\033\\\[B"; after 80}\nproc enter {} {send -- "\\r"; after 80}\nproc back {} {send -- "\\033"; after 80}\nexpect -exact {Esc Exit}\n${steps}\nexpect eof\nset result [wait]\nexit [lindex $result 3]`;
 const child=spawn('expect',['-c',script],{env});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);const timer=setTimeout(()=>child.kill('SIGKILL'),14000);t.after(()=>clearTimeout(timer));
 const status=await new Promise(resolve=>child.on('close',resolve));output=withoutSgr(output);assert.equal(status,0,output);assert.doesNotMatch(output,/Operation unavailable|Change\x20Models/);assert.match(output,/RESTORED=true/);assert.match(output,/TERMIOS_RESTORED/);assert.doesNotMatch(output,/-icanon/);return output;
}

const entry='enter\nexpect -exact {Configure}\nexpect -exact {┌─ > Scouter}\nexpect -exact {Apply - }\nexpect -exact {Esc Home}\n';
const moves=n=>Array(n).fill('down\n').join('');
const finish='expect -exact {Result}\nenter\nexpect -exact {Esc Exit}\nback';
test('Status runs only grok --version through Status Configure and Uninstall in PTY',{skip:!available},async t=>{
 const fs=await import('node:fs'),{compositeContext}=await import('./fixtures/install-mode.mjs');
 const context=await compositeContext(t),marker=context.userHome+'/grok-executed';
 writeFakeGrokCli({bin:context.userHome+'/bin',marker});
 const observe=`const {collectStatus:collectGrokStatus}=await import(${JSON.stringify(new URL('../../lib/management/status.mjs',import.meta.url).href)});const {safeFs:statusSafeFs}=await import(${JSON.stringify(new URL('./fixtures/install-mode.mjs',import.meta.url).href)});statuses.push((await collectGrokStatus({...${JSON.stringify({userHome:context.userHome,cwd:context.cwd,env:context.env})},safeFs:statusSafeFs})).find(status=>status.platform==='grok'));`;
 const output=await drive(t,'down\nenter\nexpect -exact {Status}\nexpect -exact {Esc Home}\nback\nexpect -exact {Esc Exit}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {Esc Exit}\n'+entry+'back\nexpect -exact {Esc Exit}\ndown\ndown\nenter\nexpect -exact {Grok  (not installed)}\nexpect -exact {Esc Home}\nback\nexpect -exact {Esc Exit}\nback',{observe,env:{...process.env,PATH:context.env.PATH}});
 assert.match(output,/Grok +Available · auth unverified/);assert.match(output,/Grok  \(not installed\)/);assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);const lines=fs.readFileSync(marker,'utf8').trimEnd().split('\n');assert.ok(lines.length>=1);assert.ok(lines.every(line=>line==='--version'));
});
const input=entry+moves(8)+'expect -exact {> Total subagents}\nexpect -exact {Esc Home}\nenter\nexpect -exact {Type/Paste Input}\n';
const clear='send -- "\\177"\nexpect -exact {Type/Paste Input}\nsend -- "\\177"\nexpect -exact {Type/Paste Input}\nsend -- "\\010"\nexpect -exact {Type/Paste Input}\n';
const inputToApply=moves(2)+'expect -exact {> Apply}\nenter\n';
const choosePair='down\nenter\nexpect -exact {Model — Scouter}\nexpect -exact {Esc Home}\nenter\nexpect -exact {Effort — Scouter}\nexpect -exact {Esc Home}\nenter\nexpect -exact {Scouter}\nexpect -exact {Esc Home}\ndown\ndown\nenter\nexpect -exact {Configure}\nexpect -exact {Esc Home}\n';
test('actual app Status returns home and restores PTY with no execution',{skip:!available},async t=>{
 // Status spans contain SGR codes: synchronize on the footer and assert the stripped content below.
 const output=await drive(t,'down\nenter\nexpect -exact {Status}\nexpect -exact {Esc Home}\nback\nexpect -exact {Esc Exit}\nback',{env:{...process.env,PATH:fixturePath,NO_COLOR:undefined}});assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);assert.match(output,/Version +1\.9\.0 → 1\.10\.0/);assert.match(output,/Claude +Available[\s\S]*Codex +Available/);assert.match(output,/Installed on {11}Claude, Codex[\s\S]*Run mode {15}Supervised[\s\S]*Language {15}English[\s\S]*Total subagents {8}100[\s\S]*Concurrent subagents {3}5/);assert.match(output,/Configure[\s\S]*Status[\s\S]*Uninstall[\s\S]*Exit/);
});
test('legacy Apply preview shows the move line in PTY',{skip:!available},async t=>{
 const output=await drive(t,'enter\nexpect -exact {Mixed routing files will move to the Claude home.}\nback\nexpect -exact {Esc Exit}\nback',{
  installState:{mode:'composite',platforms:['claude','codex'],anchor:'codex',legacyAnchor:true},
  currentConfig:await mixedConfig('legacy-pty'),
 });
 assert.match(output,/Apply - Mixed \(Claude \+ Codex\)/);
 assert.match(output,/Mixed routing files will move to the Claude home\./);
 assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('install opens the diagram immediately with mode in Apply and platform order',{skip:!available},async t=>{
 const output=await drive(t,entry+'back\nexpect -exact {Esc Exit}\nback');assert.match(output,/┌─ > Scouter/);assert.match(output,/Apply - Claude/);assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('queued Enter never reaches install Apply',{skip:!available},async t=>{
 const output=await drive(t,'send -- "\\r\\r\\r"\nexpect -exact {Configure}\nafter 100\nsend -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('install skips blank spacer and Apply runs once without review',{skip:!available},async t=>{
 const output=await drive(t,entry+moves(10)+'expect -exact {> Apply}\nsend -- "\\r\\r\\r"\n'+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Review Install|Confirm Install/);
});
test('role chooser edits draft without executing',{skip:!available},async t=>{
 const output=await drive(t,entry+'enter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\n'+choosePair+'send -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('Back from role editor returns to diagram',{skip:!available},async t=>{
 const output=await drive(t,entry+'enter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Back}\nenter\nexpect -exact {┌─ > Scouter}\nexpect -exact {Esc Home}\nsend -- "\\003"');assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});
test('edited role Apply needs its own Enter and runs once',{skip:!available},async t=>{
 const output=await drive(t,entry+'enter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\n'+choosePair+moves(10)+'expect -exact {> Apply}\nenter\n'+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.doesNotMatch(output,/Are you sure/);
});
test('Status exposes a real selected upgrade row and applies once',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Version                1.9.0 → 1.10.0}\nexpect -exact {> Back}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Upgrade}\nenter\n'+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/Result/);assert.match(output,/ARC updated: 1\.9\.0 → 1\.10\.0\./);assert.doesNotMatch(output,/Review Update|Confirm Update/);
});
test('version without an upgrade selects Back and Enter returns home',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Version                1.9.0 · up to date}\nexpect -exact {> Back}\nenter\nexpect -exact {Esc Exit}\nback',{canUpgrade:false});assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);assert.doesNotMatch(output,/> Upgrade/);
});
test('Everything warning defaults Back, Back retains selection and Escape returns home',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {> Claude}\ndown\ndown\ndown\ndown\nenter\nexpect -exact {Remove ARC from all platforms and the arc CLI?}\nexpect -exact {> Back}\nenter\nexpect -exact {> Everything (incl. CLI)}\nenter\nexpect -exact {> Back}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('uninstall absent platform cannot open confirmation in PTY',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {Claude  (not installed)}\nenter\nexpect -exact {Claude  (not installed)}\ndown\nexpect -exact {> Codex}\nenter\nexpect -exact {Remove ARC from Codex?}\nback\nexpect -exact {Esc Exit}\nback',{absentPlatforms:['claude']});
 assert.doesNotMatch(output,/Remove ARC from Claude\?/);assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('composite uninstall warning and result keep management message first in PTY',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {> Claude}\nenter\nexpect -exact {Remove ARC from Claude?}\nexpect -exact {Mixed routing will be turned off.}\nexpect -exact {> Back}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Remove}\nenter\nexpect -exact {Mixed routing turned off.}\nexpect -exact {Removed from Claude.}\n'+finish.replace('expect -exact {Result}\n',''),{installState:{mode:'composite',platforms:['claude','codex'],anchor:'claude'},execute:"return{code:0,messages:['Mixed routing turned off.'],results:[{platform:'claude',status:'uninstalled'}]};"});
 assert.match(output,/Mixed routing turned off\.[\s\S]*Removed from Claude\./);assert.match(output,/"switchFromComposite":true/);
});
test('version lookup failure shows one diagnostic and only Back in PTY',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Version                1.9.0 · latest unavailable}\nexpect -exact {offline}\nexpect -exact {> Back}\nenter\nexpect -exact {Esc Exit}\nback',{canUpgrade:false,latestVersion:null,latestError:{message:'offline\nhidden detail'}});
 assert.doesNotMatch(output,/hidden detail|> Upgrade/);assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);
});
for(const trigger of ['Ctrl+C','SIGINT','SIGTERM'])test('actual app reports cleanup after restoring PTY on '+trigger,{skip:!available},async t=>{
 const execute=`${trigger==='Ctrl+C'?'':`setTimeout(()=>process.kill(process.pid,${JSON.stringify(trigger)}),100);`}await new Promise(resolve=>context.signal.addEventListener('abort',resolve,{once:true}));await new Promise(resolve=>setTimeout(resolve,20));return{code:130,results:[{platform:'codex',status:'installed',rollback:'not-needed'},{platform:'claude',status:'failed',rollback:'failed',residualPaths:['/tmp/pty-recovery'],error:Error('cleanup failed')}]};`;
 const observe=`const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{if(String(chunk).includes('Residual path:'))original('REPORT_RESTORED='+!process.stdin.isRaw+'\\n');return original(chunk,...args);};`;
 const output=await drive(t,`down\nenter\nexpect -exact {> Back}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Upgrade}\nenter\nexpect -exact {Working}\n${trigger==='Ctrl+C'?'send -- "\\003"':''}`,{execute,observe});
 assert.match(output,new RegExp(`ARC ${packageVersion.replaceAll('.','\\.')} installed for Codex\\.`));assert.match(output,/claude: failed/);assert.match(output,/Residual path: \/tmp\/pty-recovery/);assert.match(output,/cleanup failed/);assert.match(output,/CODE=130 CALLS=1/);assert.match(output,/REPORT_RESTORED=true/);
});
test('Settings platform selection executes once and preserves CLI explicitly',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {> Claude}\nenter\nexpect -exact {Remove ARC from Claude?}\nexpect -exact {> Back}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Remove}\nenter\n'+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"kind":"uninstall","target":"claude","removeCli":false/);
});
test('Everything requires deliberate Remove and executes once despite queued Enter',{skip:!available},async t=>{
 const output=await drive(t,'down\ndown\nenter\nexpect -exact {> Claude}\ndown\ndown\ndown\ndown\nenter\nexpect -exact {> Back}\nsend -- "\\033\\[A"\nafter 80\nexpect -exact {> Remove}\nsend -- "\\r\\r\\r"\n'+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"target":"all","removeCli":true/);
});
test('EOF restores the terminal without preparing or executing',{skip:!available},async t=>{const output=await drive(t,'send -- "\\004"');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);});
test('hidden Apply is blocked after each shrink and runs after the final resize',{skip:!available},async t=>{
 const observe=`import {spawnSync} from 'node:child_process';let resized=false;const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{const result=original(chunk,...args);if(!resized&&String(chunk).includes('> Apply')){resized=true;for(const [delay,rows,cols,marker] of [[100,'3','20','NARROW'],[450,'40','120','WIDE'],[750,'3','20','NARROW2'],[1050,'40','120','WIDE2']])setTimeout(()=>{spawnSync('stty',['rows',rows,'cols',cols],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original(marker+'\\n'),50);},delay);}return result;};`;
 const output=await drive(t,entry+moves(10)+'expect -exact {NARROW}\nenter\nexpect -exact {WIDE}\nexpect -exact {NARROW2}\nenter\nexpect -exact {WIDE2}\nenter\n'+finish,{observe});assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);
});
test('input DEL and BS edit while Back discards text and keeps Configure values',{skip:!available},async t=>{
 const output=await drive(t,input+'send -- "\\177"\nafter 80\nsend -- "\\010"\nafter 80\nsend -- "7"\nafter 80\ndown\nexpect -exact {> Back}\nenter\nexpect -re {Total subagents +100}\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('input paste Apply validates and executes once with lowercase settings',{skip:!available},async t=>{
 const output=await drive(t,input+clear+'send -- "\\033\\[200~42\\033\\[201~"\nexpect -exact {Type/Paste Input}\nenter\nexpect -re {Total subagents +42}\nexpect -exact {Esc Home}\n'+inputToApply+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"maxTotalSubagents":42/);assert.match(output,/"language":"en"/);
});
test('invalid input Apply preserves editable text then correction executes once',{skip:!available},async t=>{
 const output=await drive(t,input+clear+'send -- "0"\nexpect -exact {Type/Paste Input}\nenter\nexpect -exact {Invalid limit}\nexpect -exact {Enter a positive whole number.}\nenter\nexpect -exact {Type/Paste Input}\nsend -- "\\010"\nexpect -exact {Type/Paste Input}\nsend -- "9"\nexpect -exact {Type/Paste Input}\nenter\nexpect -re {Total subagents +9}\nexpect -exact {Esc Home}\n'+inputToApply+finish);assert.match(output,/CODE=0 CALLS=1 PREPARES=1/);assert.match(output,/"maxTotalSubagents":9/);
});
for(const screen of ['input','chooser','settings-target'])test('Escape from '+screen+' returns directly home in PTY',{skip:!available},async t=>{
 const steps=screen==='settings-target'?'down\ndown\nenter\nexpect -exact {> Claude}\nenter\nexpect -exact {Remove ARC from Claude?}':screen==='input'?input:entry+'enter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\ndown\nenter\nexpect -exact {Model — Scouter}';
 const output=await drive(t,steps+'\nback\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
for(const [name,steps] of [['Configure',entry],['Uninstall','down\ndown\nenter\nexpect -exact {> Claude}\n']])test('target Back returns home from '+name,{skip:!available},async t=>{
 const output=await drive(t,steps+'send -- "\\033\\[A"\nafter 80\nexpect -exact {> Back}\nenter\nexpect -exact {Esc Exit}\nback');assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('Configure Back preserves the edited language across reopening',{skip:!available},async t=>{
 const output=await drive(t,entry+moves(7)+'expect -re {> Language +< English >}\nexpect -exact {Esc Home}\nenter\nexpect -re {> Language +< Korean >}\nexpect -exact {Esc Home}\n'+moves(4)+'expect -exact {> Back}\nenter\nexpect -exact {Esc Exit}\n'+entry+moves(7)+'expect -re {> Language +< Korean >}\nback\nexpect -exact {Esc Exit}\nback',{env:{...process.env,TERM:'dumb'}});assert.match(output,/CODE=0 CALLS=0 PREPARES=0/);
});
test('role edits reach Run mode without triggering Apply',{skip:!available},async t=>{
 const catalog={status:'ready',catalog:{platform:'claude',pairs:[{model:'fixture-model',effort:'high'}],unavailable:[]}};
 let steps=entry;
 for(const name of ['Scouter','Planner','Implementer','QA','Reviewer'])steps+='enter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\ndown\nenter\nexpect -exact {Model — '+name+'}\nexpect -exact {Esc Home}\nenter\nexpect -exact {Effort — '+name+'}\nexpect -exact {Esc Home}\nenter\nexpect -exact {'+name+'}\nexpect -exact {Esc Home}\ndown\ndown\nenter\nexpect -exact {Configure}\nexpect -exact {Esc Home}\ndown\nexpect -exact {Esc Home}\n';
 const output=await drive(t,steps+'down\nexpect -exact {> Run mode}\nsend -- "\\003"',{catalog});assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);assert.doesNotMatch(output,/entitlement|permission.{0,30}(?:unverified|not verified)/i);
});
test('diagram resize blocks editing and role picker retains pending effort',{skip:!available},async t=>{
 const catalog={status:'ready',catalog:{platform:'claude',pairs:[{model:'fixture-model',effort:'high'},{model:'fixture-model',effort:'low'}],unavailable:[]}};
 const observe=`import {spawnSync} from 'node:child_process';let resized=false,effortResized=false;const original=process.stdout.write.bind(process.stdout);process.stdout.write=(chunk,...args)=>{const result=original(chunk,...args);if(!resized&&String(chunk).includes('┌─ > Scouter')){resized=true;setTimeout(()=>{spawnSync('stty',['rows','12','cols','30'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');},300);setTimeout(()=>{spawnSync('stty',['rows','40','cols','120'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');},1200);}if(!effortResized&&String(chunk).includes('> low')){effortResized=true;setTimeout(()=>{spawnSync('stty',['rows','12','cols','40'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');original('EFFORT_NARROW\\n');},100);setTimeout(()=>{spawnSync('stty',['rows','40','cols','120'],{stdio:['inherit','pipe','pipe']});process.kill(process.pid,'SIGWINCH');setTimeout(()=>original('EFFORT_WIDE\\n'),100);},600);}return result;};`;
 const output=await drive(t,entry+'down\nexpect -exact {Menu requires}\nenter\nexpect -exact {┌─ > Planner}\nexpect -exact {Esc Home}\nenter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\ndown\nenter\nexpect -exact {Model — Planner}\nenter\nexpect -exact {Effort — Planner}\ndown\nexpect -exact {EFFORT_NARROW}\nexpect -exact {EFFORT_WIDE}\nenter\nexpect -exact {Effort}\nsend -- "\\003"',{catalog,observe});assert.match(output,/CODE=130 CALLS=0 PREPARES=0/);
});

test('composite Status keeps platform status and Installed on in display order',{skip:!available},async t=>{
 const output=await drive(t,'down\nenter\nexpect -exact {Status}\nexpect -exact {Esc Home}\nback\nexpect -exact {Esc Exit}\nback',{installState:{mode:'composite',platforms:['claude','codex'],anchor:'claude'},codexAuth:'unauthorized'});
 assert.match(withoutSgr(output),/Claude +Available[\s\S]*Codex +Unauthorized/);assert.match(output,/Installed on {11}Mixed \(Claude \+ Codex\)/);assert.doesNotMatch(withoutSgr(output),/Claude & Codex: Available/);assert.match(output,/CODE=0 CALLS=0 PREPARES=1/);
});


test('auth none Hosts renders auth unverified in PTY',{skip:!available},async t=>{
 const output=await drive(t,entry+moves(5)+'enter\nexpect -exact {Zeta (auth unverified)}\nback\nexpect -exact {Esc Exit}\nback',{zetaVariant:'none'});
 assert.match(output,/Zeta \(auth unverified\)/);
});
test('capability off platform row is visible in PTY',{skip:!available},async t=>{
 const output=await drive(t,entry+'enter\nexpect -exact {Platform}\nexpect -exact {Esc Home}\nenter\nexpect -exact {Zeta - Unavailable  (capability not verified)}\nback\nexpect -exact {Esc Exit}\nback',{zetaVariant:'off'});
 assert.match(output,/Zeta - Unavailable  \(capability not verified\)/);
});

test('Status lookup busy Ctrl-C exits 130 without execution',{skip:!available},async t=>{
 const prepare="await new Promise((resolve,reject)=>c.signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'ARC_CANCELLED'})),{once:true}));";
 const output=await drive(t,'down\nenter\nexpect -exact {Working}\nsend -- "\\003"',{prepare});
 assert.match(output,/CODE=130 CALLS=0 PREPARES=1/);assert.doesNotMatch(output,/Operation unavailable/);
});
