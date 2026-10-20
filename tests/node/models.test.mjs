import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const api = await import('../../lib/models/index.mjs').catch(() => ({}));
const roles = ['arc_scouter', 'arc_planner', 'arc_coder', 'arc_qa', 'arc_reviewer'];
const expected = {
  codex: {
    economy: [['gpt-6-luna','high'],['gpt-6.1-sol','medium'],['gpt-6.1-sol','medium'],['gpt-6-luna','high'],['gpt-6.1-sol','medium']],
    balanced: [['gpt-6-luna','high'],['gpt-6.1-sol','high'],['gpt-6.1-sol','high'],['gpt-6-luna','max'],['gpt-6.1-sol','high']],
    smart: [['gpt-6-luna','max'],['gpt-6-astra','high'],['gpt-6-astra','high'],['gpt-6.1-sol','medium'],['gpt-6-astra','high']],
  },
  claude: {
    economy: [['haiku','high'],['sonnet','medium'],['sonnet','medium'],['haiku','high'],['sonnet','medium']],
    balanced: [['haiku','high'],['sonnet','high'],['sonnet','high'],['haiku','max'],['sonnet','high']],
    smart: [['haiku','max'],['opus','high'],['opus','high'],['sonnet','medium'],['opus','high']],
  },
};
for (const platform of ['codex', 'claude']) {
  const source = fs.readFileSync(new URL(`../../${platform}/skill/models.toml`, import.meta.url), 'utf8');
  const effort = platform === 'codex' ? 'model_reasoning_effort' : 'effort';
  test(`${platform} unified config preserves every role and preset and round trips`, () => {
    const config = api.loadModelConfig(source, platform);
    assert.equal(config.version, 1); assert.equal(config.preset, 'balanced');
    assert.deepEqual(api.loadModelConfig(api.serializeModelConfig(config), platform), config);
    for (const preset of ['economy', 'balanced', 'smart']) {
      const before = structuredClone(config), selected = api.applyPreset(config, preset);
      assert.equal(selected.preset, preset); assert.deepEqual(selected.roles, config.roles);
      const effective = api.resolveModelSettings(selected);
      assert.deepEqual(Object.keys(effective.roles).sort(), [...roles].sort());
      roles.forEach((role, i) => assert.deepEqual([effective.roles[role].model, effective.roles[role][effort]], expected[platform][preset][i]));
      assert.deepEqual(config, before);
      assert.deepEqual(api.loadModelConfig(api.serializeModelConfig(selected), platform), selected);
    }
  });
  test(`${platform} rejects invalid inactive presets and exact schema violations`, () => {
    const valid = api.loadModelConfig(source, platform);
    const mutations = [c => c.version = 5, c => c.preset = 'fast', c => delete c.preset,
      c => c.extra = true, c => delete c.roles.arc_qa, c => c.roles.extra = {},
      c => delete c.roles.arc_qa.smart, c => c.roles.arc_qa.extra = {},
      c => c.roles.arc_qa.smart.model = 5, c => c.roles.arc_qa.smart[effort] = '',
      c => c.roles.arc_qa.smart.model = ' bad ', c => c.roles.arc_qa.smart.extra = true];
    for (const mutate of mutations) { const value = structuredClone(valid); mutate(value); assert.throws(() => api.serializeModelConfig(value), {code: 'ARC_MODEL_VALIDATION'}); }
    for (const version of [1, 5]) {
      const legacy = `version = ${version}\n` + roles.map(role => `[roles.${role}]\nmodel = "old"\n${effort} = "low"\n`).join('');
      assert.throws(() => api.loadModelConfig(legacy, platform), {code: 'ARC_MODEL_VALIDATION'});
    }
    for (const text of ['version = [', source + '\nversion = 1', source.replace('version = 1', 'version = 1.0')]) assert.throws(() => api.loadModelConfig(text, platform), {code: 'ARC_MODEL_VALIDATION'});
    assert.throws(() => api.applyPreset(valid, 'fast'), /preset/i);
  });
}
test('unknown platform is rejected', () => assert.throws(() => api.loadModelConfig('', 'other'), { code: 'ARC_MODEL_VALIDATION' }));
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
  const settings={version:5,roles:{arc_coder:{model:'gpt-6.1-sol',model_reasoning_effort:'medium'}}}; assert.equal(vendored.stringify(settings),upstream.stringify(settings));
});
