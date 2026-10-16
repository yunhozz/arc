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
 assert.deepEqual(rows.slice(0,5),['Select an installation target:','  Claude','> Codex','  All','Use Up/Down and Enter.']);
});
test('Enter selects Claude and Balanced initially',async()=>{const io=terminal(['\r\r']);assert.deepEqual(await api.selectChoices({},io),{target:'claude',preset:'balanced'});});
test('EOF cancels instead of silently selecting choices',async()=>{assert.equal(typeof api.selectChoices,'function');await assert.rejects(api.selectChoices({},terminal([])),{code:'ARC_CANCELLED'});});
test('real PTY selects Codex with Down and Balanced with Enter',async t=>{
 const {spawn}=await import('node:child_process'),fs=(await import('node:fs')).default,os=(await import('node:os')).default,path=(await import('node:path')).default;
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-pty-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const driver=process.platform==='darwin'?'expect':'script';
 const command=process.platform==='darwin'?['-c',`set timeout 5
expect_before timeout {exit 124}
spawn -noecho {${process.execPath}} bin/arc.mjs install --check
expect -exact {Use Up/Down and Enter.}
send -- "\\033\\133B\\r"
expect -exact {Select a performance preset:}
send -- "\\r"
expect eof
set result [wait]
exit [lindex $result 3]`]:['-qec',`${process.execPath} bin/arc.mjs install --check`,'/dev/null'];
 const child=spawn(driver,command,{env:{...process.env,HOME:home,CODEX_HOME:home+'/.codex',CLAUDE_CONFIG_DIR:home+'/.claude'},stdio:['pipe','pipe','pipe']});let text='',stage=0;const timer=setTimeout(()=>child.kill('SIGKILL'),15000);t.after(()=>clearTimeout(timer));child.stdout.on('data',chunk=>{text+=chunk;if(driver==='expect')return;if(stage===0&&text.includes('Use Up/Down and Enter.')){stage++;child.stdin.write('\x1b[B\r');}else if(stage===1&&text.includes('Select a performance preset:')){stage++;child.stdin.write('\r');}});child.stderr.on('data',chunk=>{text+=chunk;});const status=await new Promise(resolve=>child.on('close',resolve));assert.equal(status,0,text);assert.match(text,/Target: codex; preset: balanced/);assert.match(text,/Check completed/);assert.deepEqual(fs.readdirSync(home),[]);
});
test('interactive EOF returns cancellation exit code',async()=>{const {runCli}=await import('../../lib/cli/index.mjs');const io=terminal([]);assert.equal(await runCli([],{...io,error:io.output}),130);assert.match(io.text(),/Installation cancelled/);});
test('provided choices are preserved and only missing preset is prompted',async()=>{const io=terminal(['\x1b[B\r']);assert.deepEqual(await api.selectChoices({target:'claude'},io),{target:'claude',preset:'smart'});assert.ok(!io.text().includes('installation target'));});

for(const side of ['input','output'])test(`missing choices reject when only ${side} is a TTY`,async()=>{const io=terminal([]);io[side==='input'?'output':'input'].isTTY=false;await assert.rejects(api.selectChoices({},io),{code:'ARC_CLI_INPUT'});assert.equal(io.text(),'');});
test('complete choices bypass terminal requirements',async()=>{const io=terminal([]);io.input.isTTY=false;io.output.isTTY=false;assert.deepEqual(await api.selectChoices({target:'codex',preset:'balanced'},io),{target:'codex',preset:'balanced'});assert.equal(io.text(),'');});
