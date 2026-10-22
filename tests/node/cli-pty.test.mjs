import test from 'node:test';import assert from 'node:assert/strict';import {Readable,Writable} from 'node:stream';
const api=await import('../../lib/cli/index.mjs').catch(()=>({}));
function terminal(lines){const input=Readable.from(lines);input.isTTY=true;let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});output.isTTY=true;return{input,output,text:()=>text};}
test('arrow menus wrap and confirm the highlighted choices without numbered labels',async()=>{const io=terminal(['\x1b[A\r\x1b[B\x1b[B\x1b[A\r']);assert.deepEqual(await api.selectChoices({},io),{target:'all',preset:'smart'});assert.doesNotMatch(io.text(),/\d\. |\(default\)/);});
test('repeated arrow redraws preserve the title and option rows',async()=>{
 const io=terminal(['\x1b[B\x1b[B\x1b[A\r']);await api.selectChoices({preset:'balanced'},io);
 const rows=[''];let row=0,column=0;
 for(const token of io.text().match(/\x1b\[\d+[AK]|[\s\S]/g)){
  if(token.endsWith('A')&&token.startsWith('\x1b['))row-=Number(token.slice(2,-1));
  else if(token==='\x1b[2K')rows[row]='';
  else if(token==='\r')column=0;
  else if(token==='\n'){row++;column=0;}
  else{rows[row]=(rows[row]??'').padEnd(column,' ').slice(0,column)+token+(rows[row]??'').slice(column+1);column++;}
 }
 assert.deepEqual(rows.slice(0,4),['Select an installation target [Up/Down]:','  Claude','> Codex','  All']);
});
test('Enter selects Claude and Balanced initially',async()=>{const io=terminal(['\r\r']);assert.deepEqual(await api.selectChoices({},io),{target:'claude',preset:'balanced'});});
test('EOF cancels instead of silently selecting choices',async()=>{assert.equal(typeof api.selectChoices,'function');await assert.rejects(api.selectChoices({},terminal([])),{code:'ARC_CANCELLED'});});
test('real PTY selects Codex with Down and Balanced with Enter',async t=>{
 const {spawn}=await import('node:child_process'),fs=(await import('node:fs')).default,os=(await import('node:os')).default,path=(await import('node:path')).default;
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-pty-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const driver=process.platform==='darwin'?'expect':'script';
 const command=process.platform==='darwin'?['-c',`set timeout 5
expect_before timeout {exit 124}
spawn -noecho {${process.execPath}} bin/arc.mjs --check
expect -exact {Select an installation target [Up/Down]:}
send -- "\\033\\133B\\r"
expect -exact {Select a performance preset [Up/Down]:}
send -- "\\r"
expect -exact {Maximum total subagents}
send -- "\\r"
expect -exact {Maximum concurrent subagents}
send -- "\\r"
expect -exact {Select an output language [Up/Down]:}
send -- "\\r"
expect eof
set result [wait]
exit [lindex $result 3]`]:['-qec',`${process.execPath} bin/arc.mjs --check`,'/dev/null'];
 const child=spawn(driver,command,{env:{...process.env,HOME:home,CODEX_HOME:home+'/.codex',CLAUDE_CONFIG_DIR:home+'/.claude'},stdio:['pipe','pipe','pipe']});let text='',stage=0;const timer=setTimeout(()=>child.kill('SIGKILL'),15000);t.after(()=>clearTimeout(timer));child.stdout.on('data',chunk=>{text+=chunk;if(driver==='expect')return;if(stage===0&&text.includes('Select an installation target [Up/Down]:')){stage++;child.stdin.write('\x1b[B\r');}else if(stage===1&&text.includes('Select a performance preset [Up/Down]:')){stage++;child.stdin.write('\r');}else if(stage===2&&text.includes('Maximum total subagents')){stage++;child.stdin.write('\r');}else if(stage===3&&text.includes('Maximum concurrent subagents')){stage++;child.stdin.write('\r');}else if(stage===4&&text.includes('Select an output language [Up/Down]:')){stage++;child.stdin.write('\r');}});child.stderr.on('data',chunk=>{text+=chunk;});const status=await new Promise(resolve=>child.on('close',resolve));assert.equal(status,0,text);assert.match(text,/Install: codex · balanced · English/);assert.match(text,/Check completed/);assert.deepEqual(fs.readdirSync(home),[]);
});
test('interactive EOF returns cancellation exit code',async()=>{const {runCli}=await import('../../lib/cli/index.mjs');const io=terminal([]);assert.equal(await runCli([],{...io,error:io.output}),130);assert.match(io.text(),/Installation cancelled/);});
test('provided choices are preserved and only missing preset is prompted',async()=>{const io=terminal(['\x1b[B\r']);assert.deepEqual(await api.selectChoices({target:'claude'},io),{target:'claude',preset:'smart'});assert.ok(!io.text().includes('installation target'));});

for(const side of ['input','output'])test(`missing choices reject when only ${side} is a TTY`,async()=>{const io=terminal([]);io[side==='input'?'output':'input'].isTTY=false;await assert.rejects(api.selectChoices({},io),{code:'ARC_CLI_INPUT'});assert.equal(io.text(),'');});
test('complete choices bypass terminal requirements',async()=>{const io=terminal([]);io.input.isTTY=false;io.output.isTTY=false;assert.deepEqual(await api.selectChoices({target:'codex',preset:'balanced'},io),{target:'codex',preset:'balanced'});assert.equal(io.text(),'');});

test('progress starts after final choice, advances during acquisition and cleans up every result path',async t=>{
 const {registerHooks}=await import('node:module');const {PassThrough}=await import('node:stream');
 const fs=(await import('node:fs')).default,os=(await import('node:os')).default,path=(await import('node:path')).default;
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-progress-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const previous={HOME:process.env.HOME,CODEX_HOME:process.env.CODEX_HOME,CLAUDE_CONFIG_DIR:process.env.CLAUDE_CONFIG_DIR};Object.assign(process.env,{HOME:home,CODEX_HOME:home+'/.codex',CLAUDE_CONFIG_DIR:home+'/.claude'});t.after(()=>{for(const [key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
 const hook=registerHooks({load(url,context,next){if(url.endsWith('/installer/install.mjs'))return{format:'module',shortCircuit:true,source:'export const installTargets=(plans,options)=>globalThis.arcProgressInstall(plans,options);'};return next(url,context);}});t.after(()=>{hook.deregister();delete globalThis.arcProgressInstall;});
 const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval;let tick,active=0;globalThis.setInterval=callback=>{tick=callback;active++;return 77;};globalThis.clearInterval=id=>{assert.equal(id,77);active--;};t.after(()=>{globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear;});
 for(const mode of ['success','acquisition','transaction','cleanup','cancel']){
  let release,entered;const barrier=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
  globalThis.arcProgressInstall=async(plans,{signal})=>{entered();await barrier;if(mode==='acquisition')throw Error('acquisition failed');if(mode==='cancel'){assert.equal(signal.aborted,true);return{interrupted:true,results:[{platform:'codex',status:'failed',rollback:'completed',residualPaths:[],error:Error('cancelled')}]};}return{results:[{platform:'codex',status:mode==='transaction'?'failed':'installed',rollback:mode==='transaction'?'completed':'not-needed',residualPaths:mode==='cleanup'?['retained-stage']:[],error:['transaction','cleanup'].includes(mode)?Error(mode+' failed'):undefined}]};};
  const input=new PassThrough();input.isTTY=true;const io=terminal([]);const before=process.listenerCount('SIGINT');const running=api.runCli([],{input,output:io.output,error:io.output});
  await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(io.text(),/Installing ARC/);input.write('\x1b[B\r');await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(io.text(),/Installing ARC/);input.write('\r');const deadline=Date.now()+5000;while(!io.text().includes('Maximum total subagents')){assert.ok(Date.now()<deadline,io.text());await new Promise(resolve=>setImmediate(resolve));}input.write('\r\r');while(!io.text().includes('Select an output language [Up/Down]:')){assert.ok(Date.now()<deadline,io.text());await new Promise(resolve=>setImmediate(resolve));}input.write('\r');await started;
  assert.match(io.text(),/Installing ARC…/);const frame=io.text();tick();assert.notEqual(io.text(),frame);if(mode==='cancel')process.emit('SIGINT');release();assert.equal(await running,mode==='success'?0:mode==='cancel'?130:1);assert.equal(active,0);assert.equal(process.listenerCount('SIGINT'),before);assert.match(io.text(),mode==='acquisition'?/acquisition failed/:mode==='success'?/ARC version [^\s]+ installed! \[codex\]/:/codex: (installed|failed)/);if(mode==='cleanup')assert.match(io.text(),/Residual path: retained-stage/);
 }
});

test('payload validation failure stops progress and preserves the error and exit status',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['--input-type=module','-e',`
 import assert from 'node:assert/strict';
 import {registerHooks} from 'node:module';
 import {runCli} from './lib/cli/index.mjs';
 let text='',active=0,started=false;
 const output={isTTY:true,write(value){text+=value;}};
 globalThis.setInterval=()=>{started=true;active++;return 91;};
 globalThis.clearInterval=id=>{assert.equal(id,91);active--;};
 const hook=registerHooks({load(url,context,next){
  if(url.endsWith('/installer/manifest.mjs'))return{format:'module',shortCircuit:true,source:"export function verifyPayload(){if(!globalThis.payloadProgressStarted())throw Error('Progress not started');throw Error('deterministic payload validation failure');}"};
  return next(url,context);
 }});
 globalThis.payloadProgressStarted=()=>started;
 const before=process.listenerCount('SIGINT');
 const status=await runCli(['--target','codex','--preset','balanced','--language','en'],{output,error:output});
 hook.deregister();
 assert.equal(status,1);
 assert.equal(started,true);
 assert.equal(active,0);
 assert.equal(process.listenerCount('SIGINT'),before);
 assert.match(text,/Installing ARC…/);
 assert.ok(text.endsWith('Error: deterministic payload validation failure\\n'),text);
 assert.ok(text.indexOf('Installing ARC…')<text.indexOf('Error:'));
 `],{encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);
});
test('numeric prompts show defaults and validate replacement input',async()=>{
 const{selectLimits}=await import('../../lib/cli/choices.mjs');const selections=[{target:{platform:'codex'},preview:{existing:{max_total_subagents:20,max_concurrent_subagents:2}}},{target:{platform:'claude'},preview:{existing:null}}];
 const io=terminal(['\r0\r7\r']);const options={};await selectLimits(options,selections,io);assert.equal(options.maxTotalSubagents,undefined);assert.equal(options.maxConcurrentSubagents,7);assert.equal(options.concurrentSelected,true);assert.match(io.text(),/Maximum total subagents \[Default=100\]:/);assert.match(io.text(),/Maximum concurrent subagents \[Default=5\]:/);assert.doesNotMatch(io.text(),/Current:|codex=|claude=|Default:|Enter keeps each/);assert.match(io.text(),/positive/);
});
for(const text of ['\x03','\x04'])test('numeric input cancellation restores listeners',async()=>{const{selectLimits}=await import('../../lib/cli/choices.mjs');const io=terminal([text]);const before=process.listenerCount('SIGINT');await assert.rejects(selectLimits({},[{target:{platform:'codex'},preview:{existing:null}}],io),{code:'ARC_CANCELLED'});assert.equal(process.listenerCount('SIGINT'),before);});
test('numeric defaults and EOF restore raw mode and existing data listeners',async()=>{
 const{selectLimits}=await import('../../lib/cli/choices.mjs');
 for(const lines of [['\r\r'],[]]){const io=terminal(lines);io.input.isRaw=true;const modes=[];io.input.setRawMode=value=>{modes.push(value);io.input.isRaw=value;};const existing=()=>{};io.input.on('data',existing);const before=io.input.listeners('data');const options={};const selection=[{target:{platform:'codex'},preview:{existing:null}}];
 if(lines.length){await selectLimits(options,selection,io);assert.equal(options.concurrentSelected,true);assert.equal(options.maxTotalSubagents,undefined);assert.match(io.text(),/Maximum total subagents \[Default=100\]:/);assert.match(io.text(),/Maximum concurrent subagents \[Default=5\]:/);assert.doesNotMatch(io.text(),/codex=|claude=/);}else await assert.rejects(selectLimits(options,selection,io),{code:'ARC_CANCELLED'});
 assert.equal(io.input.isRaw,true);assert.deepEqual(io.input.listeners('data'),before);assert.deepEqual(modes,[true,true]);}
});
test('language menu wraps two choices and restores raw mode and listeners on selection or cancellation',async()=>{
 const choices=await import('../../lib/cli/choices.mjs');assert.equal(typeof choices.selectLanguage,'function');
 for(const [lines,want]of [[['\x1b[A\r'],'ko'],[['\x1b[B\x1b[B\r'],'en'],[[] ,null],[['\x03'],null]]){const io=terminal(lines);io.input.isRaw=false;io.input.setRawMode=value=>{io.input.isRaw=value;};const before=process.listenerCount('SIGINT'),options={};if(want){await choices.selectLanguage(options,'en',io);assert.equal(options.language,want);}else await assert.rejects(choices.selectLanguage(options,'en',io),{code:'ARC_CANCELLED'});assert.equal(io.input.isRaw,false);assert.equal(process.listenerCount('SIGINT'),before);}
});
test('a second menu decodes keys on the same input after first-menu cleanup',async()=>{
 const{PassThrough}=await import('node:stream');const{selectLanguage}=await import('../../lib/cli/choices.mjs');const io=terminal([]);io.input=new PassThrough();io.input.isTTY=true;
 const first=selectLanguage({},'en',io);io.input.write('\r');await first;assert.equal(io.input.listenerCount('data'),0);
 const selected={};const second=selectLanguage(selected,'en',io);io.input.write('\x1b[B\r');let timer;try{assert.equal(await Promise.race([second.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),100);})]),true);}finally{clearTimeout(timer);io.input.end();await second.catch(()=>{});}assert.equal(selected.language,'ko');assert.equal(io.input.listenerCount('data'),0);
});
