import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as api from '../../lib/models/index.mjs';
import * as configApi from '../../lib/models/config.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
const roles = ['arc_scouter','arc_planner','arc_implementer','arc_qa','arc_reviewer'];
const defaults = {
 codex: [['gpt-6-luna','high'],['gpt-6.1-sol','xhigh'],['gpt-6.1-sol','medium'],['gpt-6.1-terra','high'],['gpt-6.1-sol','high']],
 claude: [['haiku','high'],['sonnet','xhigh'],['sonnet','medium'],['haiku','high'],['sonnet','high']],
};
for (const platform of ['codex','claude']) {
 const field=platform==='codex'?'model_reasoning_effort':'effort';
 const legacy=fs.readFileSync(new URL(`../fixtures/models-${platform}-v1.toml`,import.meta.url),'utf8');
 const source=()=>fs.readFileSync(new URL(`../../${platform}/skill/models.toml`,import.meta.url),'utf8');
 test(`${platform} loadModelConfig converts v1 and v2 active presets and custom to v3 roles`,()=>{
  for(const version of [1,2]) for(const preset of ['economy','balanced','smart','custom']) {
   const custom=Object.fromEntries(roles.map(role=>[role,{model:platform==='codex'?'legacy-custom':'sonnet',[field]:'low'}]));
   const text=legacy.replace('version = 1',`version = ${version}`).replace('preset = "balanced"',`preset = "${preset}"`)+(preset==='custom'?roles.map(role=>`\n[custom.${role}]\nmodel = "${custom[role].model}"\n${field} = "low"\n`).join(''):'');
   if(version===1&&preset==='custom'){assert.throws(()=>api.loadModelConfig(text,platform));continue;}
   const parsed=configApi.parseToml(text), loaded=api.loadModelConfig(text,platform);
   assert.equal(loaded.version,3);
   assert.deepEqual(loaded.roles,preset==='custom'?custom:Object.fromEntries(roles.map(role=>[role,{...parsed.roles[role][preset]}])));
   assert.deepEqual(api.loadModelConfig(api.serializeModelConfig(loaded),platform),loaded);
  }
 });
 test(`${platform} serializeModelConfig writes version 3 without preset`,()=>{
  const config=api.loadModelConfig(source(),platform),text=api.serializeModelConfig(config);
  assert.match(text,/^version = 3$/m);assert.doesNotMatch(text,/preset/);
  assert.equal((text.match(/\[roles\.arc_/g)||[]).length,5);
  assert.deepEqual(api.loadModelConfig(text,platform),config);
 });
 test(`${platform} package defaults equal the former balanced values and exist in the static catalog`,async()=>{
  const config=api.loadModelConfig(source(),platform),catalog=await loadStaticModelCatalog(platform);
  assert.equal(config.version,3);assert.equal(configApi.readModelFileVersion(source()),3);
  assert.deepEqual(roles.map(role=>[config.roles[role].model,config.roles[role][field]]),defaults[platform]);
  for(const role of roles)assert.ok(catalog.catalog.pairs.some(p=>p.model===config.roles[role].model&&p.effort===config.roles[role][field]));
 });
 test(`${platform} v3 rejects exact schema violations and invalid inactive legacy values`,()=>{
  const config=api.loadModelConfig(source(),platform);
  for(const mutate of [c=>c.version=4,c=>c.preset='balanced',c=>delete c.roles.arc_qa,c=>c.roles.extra={},c=>c.roles.arc_qa.extra=true,c=>c.roles.arc_qa.model=' bad ',c=>c.roles.arc_qa[field]='']){
   const invalid=structuredClone(config);mutate(invalid);assert.throws(()=>api.serializeModelConfig(invalid),{code:'ARC_MODEL_VALIDATION'});
  }
  assert.throws(()=>api.loadModelConfig(legacy.replace('model = "'+(platform==='codex'?'gpt-6-luna':'haiku')+'"','model = ""'),platform));
  for(const text of ['version = [',source()+'\nversion = 3',source().replace(/version = [123]/,'version = 3.0')])assert.throws(()=>api.loadModelConfig(text,platform));
 });
 test(`${platform} withRoles clones and renders selected role values`,()=>{
  const config=api.loadModelConfig(source(),platform),before=structuredClone(config),selected=structuredClone(config.roles);
  selected.arc_planner[field]='high';const updated=api.withRoles(config,selected);
  assert.deepEqual(api.resolveModelSettings(updated),{platform,roles:selected});assert.deepEqual(config,before);
  selected.arc_planner.model='changed';assert.notEqual(updated.roles.arc_planner.model,'changed');
 });
}
test('PRESETS and preset helpers are gone',()=>{
 for(const key of ['PRESETS','applyPreset','applyCustomRoles'])assert.equal(configApi[key],undefined);
});
test('unknown platform is rejected',()=>assert.throws(()=>api.loadModelConfig('', 'other'),{code:'ARC_MODEL_VALIDATION'}));
test('vendor check rejects parser drift against the exact pinned source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-vendor-')); t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(`${root}/node_modules/smol-toml/dist`,{recursive:true});
  fs.writeFileSync(`${root}/package.json`,JSON.stringify({devDependencies:{'smol-toml':'1.9.1'}}));
  fs.writeFileSync(`${root}/node_modules/smol-toml/package.json`,JSON.stringify({name:'smol-toml',version:'1.9.1',type:'module'}));
  fs.writeFileSync(`${root}/node_modules/smol-toml/LICENSE`,'BSD license'); fs.writeFileSync(`${root}/node_modules/smol-toml/dist/index.js`,'export const parse = true;');
  const script = new URL('../../scripts/vendor-toml.mjs',import.meta.url).pathname;
  let run=spawnSync(process.execPath,[script,'--root',root],{encoding:'utf8'}); assert.equal(run.status,0,run.stderr);
  run=spawnSync(process.execPath,[script,'--root',root,'--check'],{encoding:'utf8'}); assert.equal(run.status,0,run.stderr);
  fs.writeFileSync(`${root}/vendor/toml/dist/index.js`,'tampered'); run=spawnSync(process.execPath,[script,'--root',root,'--check'],{encoding:'utf8'}); assert.equal(run.status,1); assert.match(run.stderr,/vendor/i);
});
test('public ModelConfig includes platform while TOML remains platform field-free', () => {
  for (const platform of ['codex','claude']) {
    const source=fs.readFileSync(new URL(`../../${platform}/skill/models.toml`,import.meta.url),'utf8');
    const config=api.loadModelConfig(source,platform); assert.equal(config.platform,platform);
    assert.doesNotMatch(api.serializeModelConfig(config),/^platform\s*=/m);
    assert.throws(()=>api.serializeModelConfig({...config,platform:platform==='codex'?'claude':'codex'}),{code:'ARC_MODEL_VALIDATION'});
  }
});
test('vendor generator normalizes only trailing horizontal JS whitespace and records the rule', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'arc-vendor-normalize-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(`${root}/node_modules/smol-toml/dist`,{recursive:true});
  fs.writeFileSync(`${root}/package.json`,JSON.stringify({devDependencies:{'smol-toml':'1.9.1'}}));
  fs.writeFileSync(`${root}/node_modules/smol-toml/package.json`,JSON.stringify({name:'smol-toml',version:'1.9.1'}));
  fs.writeFileSync(`${root}/node_modules/smol-toml/LICENSE`,'license  \n');
  const original='export const text = "inner  "; \t\r\nexport const answer = 42;\t\n// end \t';
  fs.writeFileSync(`${root}/node_modules/smol-toml/dist/index.js`,original);
  const script=new URL('../../scripts/vendor-toml.mjs',import.meta.url).pathname;
  let run=spawnSync(process.execPath,[script,'--root',root],{encoding:'utf8'}); assert.equal(run.status,0,run.stderr);
  const generated=fs.readFileSync(`${root}/vendor/toml/dist/index.js`,'utf8');
  assert.equal(generated,'export const text = "inner  ";\r\nexport const answer = 42;\n// end');
  assert.equal(fs.readFileSync(`${root}/vendor/toml/LICENSE`,'utf8'),'license  \n');
  assert.equal(fs.readFileSync(`${root}/node_modules/smol-toml/dist/index.js`,'utf8'),original);
  const provenance=JSON.parse(fs.readFileSync(`${root}/vendor/toml/provenance.json`));
  assert.equal(provenance.normalization.javascript,'strip-trailing-horizontal-whitespace-v1'); assert.equal(provenance.normalization.preserveLineEndings,true);
  assert.equal(original.replace(new RegExp(provenance.normalization.pattern, provenance.normalization.flags), ''), generated);
  assert.match(provenance.sourceFiles['dist/index.js'],/^[a-f0-9]{64}$/);
  run=spawnSync(process.execPath,[script,'--root',root,'--check'],{encoding:'utf8'}); assert.equal(run.status,0,run.stderr);
  fs.appendFileSync(`${root}/vendor/toml/dist/index.js`,'drift'); run=spawnSync(process.execPath,[script,'--root',root,'--check'],{encoding:'utf8'}); assert.equal(run.status,1);
});
test('normalized vendored TOML preserves pinned upstream parser and serializer behavior', async () => {
  const upstream=await import('smol-toml'); const vendored=await import('../../vendor/toml/dist/index.js');
  for (const text of ['name = "\\u0041\\U0001F600"\n','value = 1_234\narray = [true, false, 3.5]\n','[nested]\ntext = """one\ntwo"""\n']) assert.deepEqual(vendored.parse(text),upstream.parse(text));
  for (const text of ['value = "\\u00xz"','value = "\\U00110000"','x = 1\nx = 2']) {
    const errorOf=parser=>{try{parser(text);}catch(error){return [error.name,error.message];} assert.fail('Invalid fixture must fail');};
    assert.deepEqual(errorOf(vendored.parse),errorOf(upstream.parse));
  }
  const settings={version:5,roles:{arc_implementer:{model:'gpt-6.1-sol',model_reasoning_effort:'medium'}}}; assert.equal(vendored.stringify(settings),upstream.stringify(settings));
});

for (const platform of ['codex','claude']) test(`${platform} rejects unsupported implementation model keys without mutating input`,()=>{
 const text=fs.readFileSync(new URL(`../../${platform}/skill/models.toml`,import.meta.url),'utf8');
 const config=api.loadModelConfig(text,platform),before=structuredClone(config);
 assert.deepEqual(api.loadModelConfig(api.serializeModelConfig(config),platform),config);
 const invalid=structuredClone(config);invalid.roles.arc_unknown=invalid.roles.arc_implementer;delete invalid.roles.arc_implementer;
 assert.throws(()=>api.loadModelConfig(text.replaceAll('arc_implementer','arc_unknown'),platform),{code:'ARC_MODEL_VALIDATION'});
 assert.throws(()=>api.serializeModelConfig(invalid),{code:'ARC_MODEL_VALIDATION'});
 assert.deepEqual(config,before);
});
