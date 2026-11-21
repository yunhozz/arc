import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {spawnSync} from 'node:child_process';
import {openRoot} from '../../lib/safe-fs/index.mjs'; import {loadNative} from '../../lib/safe-fs/native.mjs';
import {buildInstallPlan} from '../../lib/installer/plan.mjs';import {resolveTarget} from '../../lib/installer/targets.mjs';
import {flattenFixtureReferences,referencePaths} from './fixtures/static-references.mjs';
const api=await import('../../lib/installer/manifest.mjs').catch(()=>({}));
const native=loadNative({artifactDirectory:'build/native'}); const safeFs={openRoot:p=>openRoot(p,{native})};
const source=new URL('../../',import.meta.url).pathname;
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-payload-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const name of ['README.md','install.command','package.json','package-lock.json','bin','lib','scripts','vendor','shared','codex','claude','gemini','grok'])fs.cpSync(path.join(source,name),path.join(root,name),{recursive:true});flattenFixtureReferences(root);fs.mkdirSync(`${root}/prebuilds`);const artifacts={};for(const tuple of ['darwin-arm64','darwin-x64','linux-arm64-gnu','linux-x64-gnu']){fs.mkdirSync(`${root}/prebuilds/${tuple}`);fs.writeFileSync(`${root}/prebuilds/${tuple}/arc_safe_fs.node`,'native fixture');artifacts[tuple]={napi:8};}fs.writeFileSync(`${root}/prebuilds/index.json`,JSON.stringify({artifacts}));refresh(root);return root;}
function refresh(root){const r=spawnSync(process.execPath,[`${source}/scripts/update-manifest.mjs`,'--root',root],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
function verify(root){return api.verifyPayload({packageRoot:root,safeFs});}
function compositionFixture(t){const root=fixture(t);fs.rmSync(`${root}/scripts/update-superpowers-local.sh`,{force:true});refresh(root);return root;}
function renderComposition(root,name,bytes){const payload=verify(root);payload.files.set('shared/skill/'+name,bytes);return buildInstallPlan({payload,target:resolveTarget('codex',{userHome:root,env:{},cwd:root}),safeFs,skipGlobal:true}).generated.skill;}
test('payload rejects shared and platform duplicate skill path (C1)',t=>{
 const root=compositionFixture(t);assert.throws(()=>renderComposition(root,'references/limits.md',fs.readFileSync(`${root}/codex/skill/references/limits.md`)),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/Payload skill composition failed:.*C1/.test(error.message)&&error.message.includes('references/limits.md'));
 fs.mkdirSync(`${root}/shared/skill/references`,{recursive:true});fs.copyFileSync(`${root}/codex/skill/references/limits.md`,`${root}/shared/skill/references/limits.md`);refresh(root);
 assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/C1/.test(error.message)&&error.message.includes('references/limits.md'));
});
test('payload rejects shared generated skill file (C2)',t=>{
 const root=compositionFixture(t);assert.throws(()=>renderComposition(root,'settings.toml',Buffer.from('generated')),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/Payload skill composition failed:.*C2/.test(error.message)&&error.message.includes('settings.toml'));
 fs.mkdirSync(`${root}/shared/skill`,{recursive:true});fs.writeFileSync(`${root}/shared/skill/settings.toml`,'language = "en"\n');refresh(root);
 assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/C2/.test(error.message)&&error.message.includes('settings.toml'));
});
test('payload rejects shared file/directory prefix conflict (C3)',t=>{
 const root=compositionFixture(t);assert.throws(()=>renderComposition(root,'references/limits.md/child',Buffer.from('file')),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/Payload skill composition failed:.*C3/.test(error.message)&&error.message.includes('references'));
 fs.mkdirSync(`${root}/shared/skill/references/limits.md`,{recursive:true});fs.writeFileSync(`${root}/shared/skill/references/limits.md/child`,'file');refresh(root);
 assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/C3/.test(error.message)&&error.message.includes('references'));
});
test('payload ignores a regular shared .DS_Store',t=>{
 const root=compositionFixture(t);fs.mkdirSync(`${root}/shared/skill`,{recursive:true});fs.writeFileSync(`${root}/shared/skill/.DS_Store`,'ignored');fs.writeFileSync(`${root}/shared/skill/shared.txt`,'shared bytes');refresh(root);
 const result=verify(root);assert.ok(result.files instanceof Map);assert.equal(result.files.get('shared/skill/shared.txt')?.toString(),'shared bytes');assert.equal(result.files.has('shared/skill/.DS_Store'),false);
 assert.equal(renderComposition(root,'extra.txt',Buffer.from('extra')).get('shared.txt').toString(),'shared bytes');
});
test('payload requires lib/installer/skill-sources.mjs even with a regenerated manifest',t=>{
 const root=compositionFixture(t);fs.rmSync(`${root}/lib/installer/skill-sources.mjs`,{force:true});refresh(root);
 assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes('Required runtime asset is missing: lib/installer/skill-sources.mjs'));
});
test('descriptor-verifies bytes and mutable model inputs',t=>{const root=fixture(t);assert.equal(typeof api.verifyPayload,'function');const p=verify(root);assert.ok(p.files instanceof Map);assert.deepEqual(p.modelInputs.codex.models,fs.readFileSync(`${root}/codex/skill/models.toml`));assert.equal(p.modelInputs.claude.profiles.size,5);});
for(const [label,change] of [
 ['escape',r=>fs.appendFileSync(`${r}/MANIFEST.sha256`,`${'0'.repeat(64)}  ../outside\n`)],
 ['duplicate',r=>fs.appendFileSync(`${r}/MANIFEST.sha256`,fs.readFileSync(`${r}/MANIFEST.sha256`,'utf8').split('\n')[0]+'\n')],
 ['missing',r=>fs.writeFileSync(`${r}/MANIFEST.sha256`,fs.readFileSync(`${r}/MANIFEST.sha256`,'utf8').split('\n').filter(l=>!l.endsWith('  README.md')).join('\n'))],
 ['extra',r=>{fs.writeFileSync(`${r}/extra.txt`,'extra');fs.appendFileSync(`${r}/MANIFEST.sha256`,`${'0'.repeat(64)}  extra.txt\n`);}],
 ['unlisted payload',r=>fs.writeFileSync(`${r}/codex/skill/unlisted.txt`,'unlisted')],
 ['hash',r=>fs.appendFileSync(`${r}/README.md`,'changed')],
 ['symlink',r=>{fs.unlinkSync(`${r}/README.md`);fs.symlinkSync('/etc/passwd',`${r}/README.md`);}],
 ['mutable model listed',r=>fs.appendFileSync(`${r}/MANIFEST.sha256`,`${'0'.repeat(64)}  codex/skill/models.toml\n`)],
 ['invalid mutable model',r=>fs.writeFileSync(`${r}/claude/skill/models.toml`,'version = 99')],
 ['unsafe mutable exception',r=>fs.writeFileSync(`${r}/MANIFEST.sha256`,fs.readFileSync(`${r}/MANIFEST.sha256`,'utf8').split('\n').filter(l=>!l.endsWith('  codex/skill/scripts/model_config.py')).join('\n'))],
 ['missing runtime asset',r=>{fs.unlinkSync(`${r}/bin/arc.mjs`);refresh(r);}],
 ['missing installer module',r=>{fs.unlinkSync(`${r}/lib/installer/plan.mjs`);refresh(r);} ],
 ['special payload file',r=>{fs.unlinkSync(`${r}/README.md`);assert.equal(spawnSync('mkfifo',[`${r}/README.md`]).status,0);}],
 ['DS_Store directory',r=>{fs.rmSync(`${r}/codex/skill/.DS_Store`,{force:true});fs.mkdirSync(`${r}/codex/skill/.DS_Store`);}],
])test(`payload rejects ${label}`,t=>{const root=fixture(t);change(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
test('mutable models may change only within their validated schemas',t=>{const root=fixture(t);const file=`${root}/codex/skill/models.toml`;fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('gpt-6.2-sol','custom/model'));assert.match(verify(root).modelInputs.codex.models.toString(),/custom\/model/);});
test('manifest reference coverage rejects missing entries and changed hashes',t=>{const root=fixture(t);const manifest=`${root}/MANIFEST.sha256`,originalManifest=fs.readFileSync(manifest);for(const base of ['codex/skill/references','shared/skill/references'])for(const name of fs.readdirSync(`${root}/${base}`).filter(n=>n.endsWith('.md'))){const relative=`${base}/${name}`,file=`${root}/${relative}`,original=fs.readFileSync(file);fs.writeFileSync(manifest,originalManifest.toString().split('\n').filter(line=>!line.endsWith('  '+relative)).join('\n'));assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});fs.writeFileSync(manifest,originalManifest);fs.appendFileSync(file,'changed');assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});fs.writeFileSync(file,original);}});
test('payload leaf replacement cannot read an outside regular-file sentinel',t=>{const root=fixture(t),outside=`${root}-outside`;fs.writeFileSync(outside,'private sentinel');t.after(()=>fs.rmSync(outside,{force:true}));const identity=fs.statSync(outside,{bigint:true});let swapped=false,readOutside=false;
 function wrap(handle){return new Proxy(handle,{get(target,key){if(key==='openDir')return name=>wrap(target.openDir(name));if(key==='openFile')return(name,options)=>{if(name==='README.md'&&!swapped){swapped=true;fs.unlinkSync(`${root}/README.md`);fs.linkSync(outside,`${root}/README.md`);}return wrap(target.openFile(name,options));};if(key==='readAll')return()=>{const current=target.stat();if(current.dev===identity.dev&&current.ino===identity.ino)readOutside=true;return target.readAll();};const member=target[key];return typeof member==='function'?member.bind(target):member;}});}
 assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs:{openRoot:p=>wrap(safeFs.openRoot(p))}}),{code:'ARC_PAYLOAD_VALIDATION'});assert.equal(swapped,true);assert.equal(readOutside,false);
});
test('current payload rejects legacy installer entries and every missing protected runtime file',t=>{const root=fixture(t),manifest=`${root}/MANIFEST.sha256`,original=fs.readFileSync(manifest);assert.ok(verify(root).files instanceof Map);fs.appendFileSync(manifest,`${'0'.repeat(64)}  install.py\n`);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});fs.writeFileSync(manifest,original);for(const line of original.toString().trim().split('\n')){const name=line.slice(66),file=`${root}/${name}`,bytes=fs.readFileSync(file);fs.unlinkSync(file);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'},name);fs.writeFileSync(file,bytes);}});
for(const name of ['codex/skill/references/limits.md','claude/skill/references/limits.md','lib/limits.mjs','lib/installer/limits.mjs','lib/installer/runtime-config.mjs'])test(`payload requires ${name} even with a regenerated manifest`,t=>{
 const root=fixture(t);fs.unlinkSync(`${root}/${name}`);refresh(root);
 assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});
});
import {refreshPackageReferences} from '../../lib/installer/package-references.mjs';import {referenceFixture} from './fixtures/fake-git.mjs';
test('static refresh protects every imported file while adjacent ARC policy stays protected',async t=>{const root=fixture(t);await refreshPackageReferences({packageRoot:root,safeFs,acquisition:async()=>({references:referenceFixture('B')})});const result=verify(root);assert.equal(result.referenceTree.provenance.revision,'b'.repeat(40));for(const[,name]of referencePaths){const key='shared/skill/references/'+name;assert.ok(result.files.has(key),key);assert.match(fs.readFileSync(root+'/MANIFEST.sha256','utf8'),new RegExp('  '+key+'\\n'));}fs.appendFileSync(root+'/codex/skill/references/planning.md','changed');assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const[label,change]of [
 ['unlisted static file',root=>fs.writeFileSync(root+'/codex/skill/references/unlisted','bad')],
 ['unlisted shared static file',root=>fs.writeFileSync(root+'/shared/skill/references/unlisted','bad')],
 ['changed imported bytes',root=>fs.appendFileSync(root+'/shared/skill/references/brainstorming.md','bad')],
 ['missing license',root=>fs.unlinkSync(root+'/shared/skill/references/superpowers-LICENSE')],
 ['malformed provenance',root=>fs.writeFileSync(root+'/shared/skill/references/superpowers-provenance.json','{}')],
 ['escaping reference link',root=>fs.symlinkSync('/etc/passwd',root+'/codex/skill/references/escape')],
 ['escaping shared reference link',root=>fs.symlinkSync('/etc/passwd',root+'/shared/skill/references/escape')],
])test(`static payload rejects ${label}`,t=>{const root=fixture(t);change(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const[,name]of referencePaths)test(`static payload requires shared/${name} after manifest regeneration`,t=>{const root=fixture(t);fs.unlinkSync(root+'/shared/skill/references/'+name);refresh(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const platform of ['codex','claude'])test(`reintroduced ${platform} imported copy fails C1`,t=>{const root=compositionFixture(t);fs.copyFileSync(root+'/shared/skill/references/brainstorming.md',root+'/'+platform+'/skill/references/brainstorming.md');refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/C1/.test(error.message)&&error.message.includes('references/brainstorming.md'));});
test('reintroduced platform runtime copy fails C1',t=>{for(const platform of ['codex','claude']){const root=compositionFixture(t),name=platform+'/skill/runtime/cli.mjs';fs.mkdirSync(path.dirname(root+'/'+name),{recursive:true});fs.copyFileSync(root+'/shared/skill/runtime/cli.mjs',root+'/'+name);refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/C1/.test(error.message)&&error.message.includes('runtime/cli.mjs'));}});
for(const prefix of ['shared','codex','claude','gemini','grok'])test(`payload rejects nested ${prefix} reference tree`,t=>{const root=compositionFixture(t),base=root+'/'+prefix+'/skill/references/superpowers';fs.mkdirSync(base,{recursive:true});fs.writeFileSync(base+'/x.md','nested');refresh(root);assert.throws(()=>verify(root),/nested/i);});
test('payload rejects missing shared/skill tree',t=>{const root=compositionFixture(t);fs.rmSync(root+'/shared/skill',{recursive:true});refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&/Required flat reference file is missing/.test(error.message));});
const localUpdater='scripts/update-superpowers-local.sh';
function wrapper(root){fs.writeFileSync(root+'/'+localUpdater,'#!/bin/sh\nexit 99\n');refresh(root);}
test('package rules reject a local wrapper without valid source evidence',t=>{const root=fixture(t);wrapper(root);assert.throws(()=>verify(root),/local updater|wrapper/i);});
for(const marker of ['directory','worktree'])test(`auto source mode excludes the exact regular wrapper with ${marker} marker`,t=>{const root=fixture(t);if(marker==='directory')fs.mkdirSync(root+'/.git');else fs.writeFileSync(root+'/.git','gitdir: /unused/worktree/metadata\n');wrapper(root);const payload=verify(root);assert.equal(payload.files.has(localUpdater),false);assert.equal(fs.readFileSync(root+'/'+localUpdater,'utf8'),'#!/bin/sh\nexit 99\n');assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs,payloadMode:'package'}),/local updater|wrapper/i);});
test('explicit source validation excludes only the exact regular wrapper',t=>{const root=fixture(t);wrapper(root);fs.writeFileSync(root+'/scripts/unrelated.sh','protected');refresh(root);const result=api.verifyPayload({packageRoot:root,safeFs,payloadMode:'source'});assert.equal(result.files.has(localUpdater),false);assert.equal(result.files.get('scripts/unrelated.sh').toString(),'protected');fs.appendFileSync(root+'/scripts/unrelated.sh','changed');assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs,payloadMode:'source'}),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const[label,change]of [['malformed',r=>fs.writeFileSync(r+'/.git','not a git marker')],['symlink',r=>fs.symlinkSync('/unused/private/git',r+'/.git')],['lock mismatch',r=>{fs.mkdirSync(r+'/.git');const file=r+'/package-lock.json',lock=JSON.parse(fs.readFileSync(file));lock.packages[''].version='99.0.0';fs.writeFileSync(file,JSON.stringify(lock));}],['lifecycle hook',r=>{fs.mkdirSync(r+'/.git');const file=r+'/package.json',pkg=JSON.parse(fs.readFileSync(file));pkg.scripts.prepare='exit 99';fs.writeFileSync(file,JSON.stringify(pkg));refresh(r);}]] )test(`auto source mode rejects ${label} evidence`,t=>{const root=fixture(t);wrapper(root);change(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
test('source wrapper exception never allows a symlink',t=>{const root=fixture(t);fs.symlinkSync('/unused/private/shell',root+'/'+localUpdater);assert.throws(()=>api.verifyPayload({packageRoot:root,safeFs,payloadMode:'source'}),{code:'ARC_PAYLOAD_VALIDATION'});});
for(const name of ['lib/policy/role-policy.json','lib/policy/render.mjs','scripts/update-role-policy.mjs'])test(`payload rejects missing policy asset even with refreshed manifest: ${name}`,t=>{const root=fixture(t);fs.unlinkSync(`${root}/${name}`);refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && error.message.includes(`Required runtime asset is missing: ${name}`));});
test('payload rejects invalid shared policy after refreshed manifest',t=>{const root=fixture(t);fs.writeFileSync(`${root}/lib/policy/role-policy.json`,'{}');refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && /Role policy:/.test(error.message));});
test('payload rejects stale generated policy even when hashes match',t=>{const root=fixture(t);const name=`${root}/codex/agents/arc-implementer.toml`;fs.writeFileSync(name,fs.readFileSync(name,'utf8').replace('Generated from lib/policy/role-policy.json','Stale source'));refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && /Stale role policy output/.test(error.message));});

test('payload rejects stale role policy output even after manifest refresh',t=>{const root=fixture(t),name=root+'/lib/policy/role-policy.json';const changed=JSON.parse(fs.readFileSync(name));changed.platforms.claude.notice+=' Changed notice.';fs.writeFileSync(name,JSON.stringify(changed));refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION' && /Stale role policy output/.test(error.message));});
for(const platform of ['codex','claude']){
 const name=`${platform}/skill/references/coordination.md`;
 test(`payload requires ${name} after manifest refresh`,t=>{
  const root=fixture(t);assert.ok(verify(root).files.has(name));fs.unlinkSync(path.join(root,name));refresh(root);
  assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes(`missing target ${name}`));
 });
 test(`payload rejects stale ${name} after manifest refresh`,t=>{
  const root=fixture(t),file=path.join(root,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('- [git.specialists-deny]','- [stale.rule]'));refresh(root);
  assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes(`Stale role policy output: ${name}`));
 });
}

const requiredRuntimePaths = [
 'lib/runtime/acceptance.mjs','lib/runtime/adapters/claude.mjs','lib/runtime/adapters/codex.mjs',
 'lib/runtime/assignment.mjs','lib/runtime/bootstrap.mjs','lib/runtime/capabilities.mjs','lib/runtime/cli.mjs','lib/runtime/command.mjs',
 'lib/runtime/cooperative-schema.mjs','lib/runtime/cooperative.mjs','lib/runtime/evaluate.mjs',
 'lib/runtime/external.mjs','lib/runtime/gate.mjs','lib/runtime/git-evidence.mjs',
 'lib/runtime/git-query.mjs','lib/runtime/identity.mjs','lib/runtime/local-cli.mjs','lib/runtime/operations.mjs',
 'lib/runtime/role-bridge-args.mjs','lib/runtime/role-bridge.mjs','lib/runtime/role-dispatch-policy.mjs','lib/runtime/role-dispatch-store.mjs','lib/runtime/role-observe.mjs','lib/runtime/role-routing-config.mjs','lib/runtime/role-routing.mjs','lib/runtime/role-supervisor.mjs',
 'lib/runtime/schema.mjs','lib/runtime/scope.mjs','lib/runtime/store.mjs','lib/runtime/verification.mjs'
];
test('regenerating the manifest cannot hide any required canonical or installed runtime asset',t=>{
 const root=fixture(t);const required=['shared/skill/runtime/role-policy.json',...requiredRuntimePaths,...requiredRuntimePaths.map(name=>'shared/skill/runtime/'+name.slice('lib/runtime/'.length)),'lib/installer/runtime-assets.mjs'];
 for(const name of required){const file=path.join(root,name);assert.ok(fs.existsSync(file),name);const bytes=fs.readFileSync(file);fs.unlinkSync(file);refresh(root);assert.throws(()=>verify(root),error=>error.code==='ARC_PAYLOAD_VALIDATION'&&error.message.includes('Required runtime asset is missing: '+name),name);fs.writeFileSync(file,bytes);}
 refresh(root);assert.ok(verify(root).files instanceof Map);
});
for(const name of ['lib/prompts/agent-fragments.json','lib/prompts/render.mjs'])test(`payload requires fragment asset after manifest regeneration: ${name}`,t=>{const root=fixture(t);fs.unlinkSync(`${root}/${name}`);refresh(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
test('payload rejects malformed fragment mapping after manifest regeneration',t=>{const root=fixture(t),name=`${root}/lib/prompts/agent-fragments.json`,registry=JSON.parse(fs.readFileSync(name));registry.targets[0].fragments.reverse();fs.writeFileSync(name,JSON.stringify(registry));refresh(root);assert.throws(()=>verify(root),{code:'ARC_PAYLOAD_VALIDATION'});});
