import test from 'node:test';import assert from 'node:assert/strict';import {Readable,Writable} from 'node:stream';
const api=await import('../../lib/cli/index.mjs').catch(()=>({}));
function terminal(lines){const input=Readable.from(lines);input.isTTY=true;let text='';const output=new Writable({write(chunk,encoding,done){text+=chunk;done();}});output.isTTY=true;return{input,output,text:()=>text};}
test('interactive choices retry empty target and invalid preset, with Balanced on Enter',async()=>{assert.equal(typeof api.selectChoices,'function');const io=terminal(['\ninvalid\n3\nwrong\n\n']);assert.deepEqual(await api.selectChoices({},io),{target:'all',preset:'balanced'});assert.match(io.text(),/1\. Claude\n2\. Codex\n3\. All/);assert.match(io.text(),/Balanced \(default\)/);assert.match(io.text(),/Invalid choice/);});
test('EOF cancels instead of silently selecting choices',async()=>{assert.equal(typeof api.selectChoices,'function');await assert.rejects(api.selectChoices({},terminal([])),{code:'ARC_CANCELLED'});});
test('real PTY retries target, selects Balanced on Enter and prints check summary',async t=>{
 const {spawn}=await import('node:child_process'),fs=(await import('node:fs')).default,os=(await import('node:os')).default,path=(await import('node:path')).default;
 const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-pty-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const driver=process.platform==='darwin'?'expect':'script';
 const command=process.platform==='darwin'?['-c',`set timeout 5
expect_before timeout {exit 124}
spawn -noecho {${process.execPath}} bin/arc-install.mjs --check
expect -exact {Enter a choice [1-3]: }
send -- "\\r"
expect -exact {Invalid choice.}
send -- "2\\r"
expect -exact {(default: 2): }
send -- "\\r"
expect eof
set result [wait]
exit [lindex $result 3]`]:['-qec',`${process.execPath} bin/arc-install.mjs --check`,'/dev/null'];
 const child=spawn(driver,command,{env:{...process.env,HOME:home,CODEX_HOME:home+'/.codex',CLAUDE_CONFIG_DIR:home+'/.claude'},stdio:['pipe','pipe','pipe']});let text='',stage=0;const timer=setTimeout(()=>child.kill('SIGKILL'),15000);t.after(()=>clearTimeout(timer));child.stdout.on('data',chunk=>{text+=chunk;if(driver==='expect')return;if(stage===0&&text.includes('Enter a choice [1-3]:')){stage++;child.stdin.write('\n');}else if(stage===1&&text.includes('Invalid choice.')){stage++;child.stdin.write('2\n');}else if(stage===2&&text.includes('(default: 2):')){stage++;child.stdin.write('\n');}});child.stderr.on('data',chunk=>{text+=chunk;});const status=await new Promise(resolve=>child.on('close',resolve));assert.equal(status,0,text);assert.match(text,/Target: codex; preset: balanced/);assert.match(text,/Check completed/);assert.deepEqual(fs.readdirSync(home),[]);
});
test('interactive EOF returns cancellation exit code',async()=>{const {runCli}=await import('../../lib/cli/index.mjs');const io=terminal([]);assert.equal(await runCli([],{...io,error:io.output}),130);assert.match(io.text(),/Installation cancelled/);});
test('provided choices are preserved and only missing preset is prompted',async()=>{const io=terminal(['3\n']);assert.deepEqual(await api.selectChoices({target:'claude'},io),{target:'claude',preset:'smart'});assert.ok(!io.text().includes('installation target'));});

for(const side of ['input','output'])test(`missing choices reject when only ${side} is a TTY`,async()=>{const io=terminal([]);io[side==='input'?'output':'input'].isTTY=false;await assert.rejects(api.selectChoices({},io),{code:'ARC_CLI_INPUT'});assert.equal(io.text(),'');});
test('complete choices bypass terminal requirements',async()=>{const io=terminal([]);io.input.isTTY=false;io.output.isTTY=false;assert.deepEqual(await api.selectChoices({target:'codex',preset:'balanced'},io),{target:'codex',preset:'balanced'});assert.equal(io.text(),'');});
