import {referenceFixture} from './fixtures/fake-git.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openRoot} from '../../lib/safe-fs/index.mjs';import {loadNative} from '../../lib/safe-fs/native.mjs';import {assertPlanSnapshot} from '../../lib/installer/transaction.mjs';
const api=await import('../../lib/installer/shell-completion.mjs').catch(()=>({}));const native=loadNative(),safeFs={openRoot:p=>openRoot(p,{native})};
function fixture(t){const home=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-shell-')));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return home;}
function plan(home,skipGlobal=false){return{target:{userHome:home,home:home+'/.codex'},skipGlobal,globalChanges:[],managedPaths:[],externalPaths:[],snapshot:new Map(),summary:[]};}
const block='# >>> arc completion >>>\nold\n# <<< arc completion <<<';
test('cleanup preserves unrelated bytes, CRLF, BOM and terminal newlines',()=>{
 assert.equal(typeof api.removeShellCompletion,'function');
 assert.deepEqual(api.removeShellCompletion(null),{changed:false,content:null});
 for(const [original,want] of [
  ['mine','mine'],['mine\r\n','mine\r\n'],['',''],
  [block,''],[block+'\n',''],[block+'\n\n','\n'],
  ['before\n'+block+'\nafter','before\nafter'],
  ['\ufeffbefore\r\n'+block.replaceAll('\n','\r\n')+'\r\nafter\r\n','\ufeffbefore\r\nafter\r\n']
 ]){const bytes=Buffer.from(original),result=api.removeShellCompletion(bytes);assert.equal(result.changed,original.includes('# >>>'));assert.deepEqual(result.content,Buffer.from(want));assert.equal(api.removeShellCompletion(result.content).changed,false);}
});
test('cleanup refuses malformed markers and invalid UTF-8',()=>{
 assert.equal(typeof api.removeShellCompletion,'function');
 for(const content of ['# >>> arc completion >>>','# <<< arc completion <<<','# <<< arc completion <<<\n# >>> arc completion >>>',block+'\n'+block,'prefix '+block,block+' tail',block+'\rjunk',Buffer.from([255])])assert.throws(()=>api.removeShellCompletion(Buffer.from(content)));
});
test('cleanup preview never creates a missing shell file or rewrites an unmarked file',t=>{
 const home=fixture(t);assert.equal(typeof api.attachShellCompletionCleanup,'function');
 for(const original of [null,Buffer.from('mine\r\n')]){if(original)fs.writeFileSync(home+'/.zshrc',original);const plans=[plan(home)];api.attachShellCompletionCleanup(plans,{safeFs});assert.deepEqual(plans[0].globalChanges,[]);assert.deepEqual(plans[0].managedPaths,[]);assert.equal(fs.existsSync(home+'/.zshrc'),original!==null);if(original)assert.deepEqual(fs.readFileSync(home+'/.zshrc'),original);}
});
test('cleanup owns shared shell only once, independently of skipGlobal, and detects drift',t=>{
 const home=fixture(t),filename=home+'/.zshrc',original=Buffer.from('mine\n'+block+'\n');fs.writeFileSync(filename,original);
 const plans=[plan(home,true),plan(home)];for(const p of plans){p.managedPaths.push(filename);p.snapshot.set(filename,null);}
 api.attachShellCompletionCleanup(plans,{safeFs});assert.deepEqual(plans.map(p=>p.globalChanges.length),[1,0]);assert.deepEqual(plans.map(p=>p.managedPaths.includes(filename)),[true,false]);assert.equal(plans[1].snapshot.has(filename),false);assert.deepEqual(fs.readFileSync(filename),original);assert.deepEqual(plans[0].globalChanges[0].content,Buffer.from('mine\n'));
 assertPlanSnapshot(plans[0],{safeFs});fs.writeFileSync(filename,'changed');assert.throws(()=>assertPlanSnapshot(plans[0],{safeFs}),{code:'ARC_INSTALL_DRIFT'});
});
test('cleanup refuses unsafe shell destinations without writes',t=>{
 const home=fixture(t),filename=home+'/.zshrc';
 fs.symlinkSync('/dev/null',filename);assert.throws(()=>api.attachShellCompletionCleanup([plan(home)],{safeFs}));fs.unlinkSync(filename);
 fs.mkdirSync(filename);assert.throws(()=>api.attachShellCompletionCleanup([plan(home)],{safeFs}));fs.rmdirSync(filename);
 fs.writeFileSync(filename,block,{mode:0o400});assert.throws(()=>api.attachShellCompletionCleanup([plan(home)],{safeFs}),/not writable/);assert.equal(fs.readFileSync(filename,'utf8'),block);
});
async function setup(t){const {capturePlanSnapshot}=await import('../../lib/installer/transaction.mjs');const home=fixture(t);fs.writeFileSync(home+'/.zshrc','mine\r\n'+block+'\n',{mode:0o640});return{home,plans:['codex','claude'].map(platform=>{const p=plan(home,true);p.target={...p.target,platform,home:home+'/.'+platform,externalPolicy:{skills:[],includeShared:false}};p.generated={skill:new Map([['SKILL.md',Buffer.from('ARC')]]),profiles:new Map()};p.managedPaths=[p.target.home+'/skills/arc'];capturePlanSnapshot(p,{safeFs});return p;})};}
const acquisition=async()=>({references:referenceFixture(),skills:new Map()});
test('shell cleanup rolls back publication, preserves mode and survives later target failure',async t=>{
 const {installTargets}=await import('../../lib/installer/install.mjs'),{home,plans}=await setup(t),filename=home+'/.zshrc',original=fs.readFileSync(filename);api.attachShellCompletionCleanup(plans,{safeFs});
 const failed=await installTargets(plans,{safeFs,acquisition,hooks:{fault(e){if(e.phase==='after-publish'&&e.path===filename)throw Error('shell failure');}}});assert.equal(failed.results[0].status,'failed');assert.equal(failed.results[0].rollback,'restored');assert.deepEqual(fs.readFileSync(filename),original);
 const fresh=await setup(t);api.attachShellCompletionCleanup(fresh.plans,{safeFs});const result=await installTargets(fresh.plans,{safeFs,acquisition,hooks:{fault(e){if(e.phase==='after-publish'&&e.plan.target.platform==='claude')throw Error('second failure');}}});assert.deepEqual(result.results.map(r=>r.status),['installed','failed']);assert.equal(fs.readFileSync(fresh.home+'/.zshrc','utf8'),'mine\r\n');assert.equal(fs.statSync(fresh.home+'/.zshrc').mode&0o777,0o640);
});
test('shell cleanup reports stage cleanup failure and stops later targets',async t=>{
 const {installTargets}=await import('../../lib/installer/install.mjs'),{home,plans}=await setup(t),filename=home+'/.zshrc';api.attachShellCompletionCleanup(plans,{safeFs});
 const result=await installTargets(plans,{safeFs,acquisition,hooks:{fault(e){if(e.phase==='after-publish'&&e.path===filename){const stage=fs.readdirSync(home).find(n=>n.startsWith('.arc-stage-'));fs.writeFileSync(home+'/'+stage+'/unknown','keep');}}}});assert.deepEqual(result.results.map(r=>r.status),['installed','not-started']);assert.equal(result.results[0].error.code,'ARC_INSTALL_CLEANUP');assert.ok(result.results[0].residualPaths.length);assert.equal(fs.readFileSync(filename,'utf8'),'mine\r\n');assert.equal(fs.readFileSync(result.results[0].residualPaths.find(p=>path.dirname(p)===home)+'/unknown','utf8'),'keep');
});
