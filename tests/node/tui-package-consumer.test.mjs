import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createNpmSandbox} from './fixtures/npm-sandbox.mjs';
import {referenceFixture} from './fixtures/fake-git.mjs';

const source=fs.realpathSync('.');
const workspace=process.env.ARC_TEST_TUI_WORKSPACE?fs.realpathSync(process.env.ARC_TEST_TUI_WORKSPACE):null;
function command(file,args,options={}){
 const result=spawnSync(process.execPath,[file,...args],{encoding:'utf8',timeout:30000,...options});
 assert.equal(result.status,0,result.stdout+result.stderr);return result;
}

test('release consumer opens TUI only on explicit launch and installs independent platform endpoints',async t=>{
 const s=await createNpmSandbox(t),artifact=await s.packReleaseFixture(source);s.addPackage(artifact);
 const original=JSON.parse(fs.readFileSync(source+'/package.json'));
 assert.deepEqual(original.bin,{arc:'bin/arc.mjs'});assert.equal(original.scripts.postinstall,undefined);
 assert.equal(artifact.metadata.scripts.postinstall,'node scripts/postinstall.mjs');
 const installed=await s.runNpm(['i','-g','@yunhozz/arc','--foreground-scripts']);
 assert.equal(installed.code,0,installed.stdout+installed.stderr);assert.match(installed.stdout,/Run arc to install or manage/);
 assert.doesNotMatch(installed.stdout,/Configure|\x1b\[\?1049h/);assert.deepEqual(fs.readdirSync(s.home),[]);
 const root=s.prefix+'/lib/node_modules/@yunhozz/arc',isolated=s.root+'/isolated package';fs.cpSync(root,isolated,{recursive:true});
 assert.equal(fs.existsSync(isolated+'/node_modules'),false);
 t.diagnostic('generated tarball '+artifact.tarball+' copied installed package '+isolated);
 const pty=await s.runPty(['exec','--offline','--','arc'],[{wait:'Install / Update',send:'\x03'}],{extraEnv:{PATH:s.prefix+'/bin'+path.delimiter+s.env.PATH}});
 assert.equal(pty.code,130,pty.text);assert.match(pty.text,/ARC_TERMINAL_RESTORED/);assert.doesNotMatch(pty.text,/ARC_TERMINAL_CHANGED/);
 assert.deepEqual(fs.readdirSync(s.home),[]);
 const api=await import(pathToFileURL(isolated+'/lib/management/operations.mjs'));
 const ctx=await api.createManagementContext({packageRoot:isolated,userHome:s.home,cwd:s.cwd,env:s.env,acquisition:async()=>({references:referenceFixture()})});
 const fresh=await api.executeOperation(ctx,await api.prepareOperation(ctx,{kind:'install',target:'all',preset:'balanced',language:'en'}));
 assert.equal(fresh.code,0,JSON.stringify(fresh));assert.equal(fs.existsSync(s.home+'/.zshrc'),false);
 const shell='export KEEP_ME=1\n# >>> arc completion >>>\neval "$(arc completion zsh)"\n# <<< arc completion <<<\nexport AFTER=1\n';
 fs.writeFileSync(s.home+'/.zshrc',shell);
 const prepared=await api.prepareOperation(ctx,{kind:'install',target:'all',preset:'smart',language:'en'});
 assert.equal(fs.readFileSync(s.home+'/.zshrc','utf8'),shell);
 const updated=await api.executeOperation(ctx,prepared);assert.equal(updated.code,0,JSON.stringify(updated));
 assert.equal(fs.readFileSync(s.home+'/.zshrc','utf8'),'export KEEP_ME=1\nexport AFTER=1\n');
 const {resultRows}=await import(pathToFileURL(isolated+'/lib/tui/app.mjs'));
 assert.match(resultRows(updated).join('\n'),/Open a new agent session/);
 await t.test('installed workflow status in Orchestrator-prepared isolated Git workspace',{skip:!workspace?'Set ARC_TEST_TUI_WORKSPACE to an Orchestrator-prepared Git fixture for endpoint acceptance':false},async()=>{
 for(const platform of ['codex','claude']){
  const runtime=s.home+'/.'+platform+'/skills/arc/runtime',entry=runtime+'/cli.mjs',workflow='consumer-'+platform+'-'+process.pid;
  assert.ok(fs.existsSync(entry));const args=['--cwd',workspace,'--workflow',workflow],opts={cwd:s.cwd,env:{...s.env,PATH:process.env.PATH}};
  command(entry,['init',...args,'--input','-'],{...opts,input:JSON.stringify({mode:'plan',actor:{id:'operator'},selection:{messageRef:'target',contentHash:'sha256:'+'a'.repeat(64)}})});
  const status=JSON.parse(command(entry,['status',...args],opts).stdout);assert.equal(status.persisted,true);assert.equal(status.revision,0);
  fs.appendFileSync(runtime+'/command.mjs','\n// tampered runtime\n');
  const tampered=spawnSync(process.execPath,[entry,'status',...args],{...opts,encoding:'utf8'});assert.equal(tampered.status,3);assert.equal(JSON.parse(tampered.stdout).decision,'hold');
 }
 });
 const {verifyPayload}=await import(pathToFileURL(isolated+'/lib/installer/manifest.mjs'));
 for(const name of ['codex/skill/runtime/cli.mjs','claude/skill/runtime/command.mjs','claude/skill/runtime/role-policy.json','lib/tui/setup.mjs','lib/management/workflow.mjs']){
  const filename=isolated+'/'+name,bytes=fs.readFileSync(filename),manifest=fs.readFileSync(isolated+'/MANIFEST.sha256');
  fs.appendFileSync(filename,'\nchanged\n');assert.throws(()=>verifyPayload(ctx),/Payload|hash|mismatch/i);fs.writeFileSync(filename,bytes);
  fs.unlinkSync(filename);
  // Rebuilding a manifest must not make a missing required dependency acceptable.
  command(isolated+'/scripts/update-manifest.mjs',['--root',isolated]);
  assert.throws(()=>verifyPayload(ctx),/missing|Payload/i,name);
  fs.writeFileSync(filename,bytes);fs.writeFileSync(isolated+'/MANIFEST.sha256',manifest);
 }
});
