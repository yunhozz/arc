import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const api = await import('../../lib/models/index.mjs').catch(() => ({}));
const roles = ['arc_scouter', 'arc_planner', 'arc_coder', 'arc_qa', 'arc_reviewer'];
const expected = {
  codex: {
    economy: [['gpt-6-luna','high'],['gpt-6.1-sol','medium'],['gpt-6.1-sol','low'],['gpt-6-luna','high'],['gpt-6.1-sol','medium']],
    balanced: [['gpt-6.1-sol','medium'],['gpt-6.1-sol','high'],['gpt-6.1-sol','medium'],['gpt-6.1-sol','medium'],['gpt-6.1-sol','high']],
    smart: [['gpt-6.1-sol','high'],['gpt-6-astra','high'],['gpt-6-astra','high'],['gpt-6.1-sol','high'],['gpt-6-astra','high']],
  },
  claude: {
    economy: [['haiku','high'],['sonnet','medium'],['sonnet','low'],['haiku','high'],['sonnet','medium']],
    balanced: [['sonnet','medium'],['sonnet','high'],['sonnet','medium'],['sonnet','medium'],['sonnet','high']],
    smart: [['sonnet','high'],['opus','high'],['opus','high'],['sonnet','high'],['opus','high']],
  },
};
for (const platform of ['codex', 'claude']) {
  const source = fs.readFileSync(new URL(`../../${platform}/skill/models.toml`, import.meta.url), 'utf8');
  const effort = platform === 'codex' ? 'model_reasoning_effort' : 'effort';
  test(`${platform} validates existing schema and round trips all settings`, () => {
    assert.equal(typeof api.loadModelConfig, 'function'); const config = api.loadModelConfig(source, platform);
    assert.equal(config.version, platform === 'codex' ? 5 : 1); assert.deepEqual(Object.keys(config.roles).sort(), [...roles].sort());
    assert.deepEqual(api.loadModelConfig(api.serializeModelConfig(config), platform), config);
  });
  for (const preset of ['economy', 'balanced', 'smart']) test(`${platform} ${preset} applies five approved role settings without changing source`, () => {
    const config = api.loadModelConfig(source, platform); const original = structuredClone(config);
    const overlay = preset === 'economy' ? undefined : fs.readFileSync(new URL(`../../${platform}/skill/presets.toml`, import.meta.url), 'utf8');
    const selected = api.applyPreset(config, preset, overlay);
    roles.forEach((role, i) => assert.deepEqual([selected.roles[role].model, selected.roles[role][effort]], expected[platform][preset][i]));
    assert.deepEqual(config, original); if (preset === 'economy') assert.deepEqual(selected, config);
    assert.deepEqual(api.loadModelConfig(api.serializeModelConfig(selected), platform), selected);
  });
  test(`${platform} Economy preserves custom source models exactly`, () => {
    const custom = source.replace(/model = "[^"]+"/, 'model = "custom/provider-v1"'); const config = api.loadModelConfig(custom, platform);
    assert.deepEqual(api.applyPreset(config, 'economy'), config);
  });
  const invalid = [
    ['malformed TOML', 'version = ['], ['duplicate keys', source + '\nversion = 5\nversion = 5'],
    ['duplicate role', source + '\n[roles.arc_scouter]\nmodel = "x"'],
    ['wrong version', source.replace(/version = \d/, 'version = 99')],
    ['float version', source.replace(/version = \d/, `version = ${platform === 'codex' ? '5.0' : '1.0'}`)],
    ['missing role', source.replace(/\[roles.arc_reviewer\][\s\S]*/, '')],
    ['unknown role', source.replaceAll('arc_qa', 'arc_unknown')],
    ['unknown field', source + '\nextra = true'],
    ['wrong model type', source.replace(/model = "[^"]+"/, 'model = 5')],
    ['blank effort', source.replace(new RegExp(`${effort} = "[^"]+"`), `${effort} = ""`)],
    ['surrounding whitespace', source.replace(/model = "[^"]+"/, 'model = " bad "')],
    ['control character', source.replace(/model = "[^"]+"/, 'model = "bad\\u0001id"')],
  ];
  for (const [label, text] of invalid) test(`${platform} rejects ${label}`, () => assert.throws(() => api.loadModelConfig(text, platform), { code: 'ARC_MODEL_VALIDATION' }));
  test(`${platform} rejects unsupported presets and malformed overlays`, () => {
    const config = api.loadModelConfig(source, platform); assert.throws(() => api.applyPreset(config, 'fast'), /preset/i);
    assert.throws(() => api.applyPreset(config, 'balanced', {}), /preset/i);
    assert.throws(() => api.loadPresets('version = 1\n[presets.balanced.roles]', platform), /preset/i);
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
test('applyPreset consumes verified overlay text directly', () => {
  const config=api.loadModelConfig(fs.readFileSync(new URL('../../codex/skill/models.toml',import.meta.url),'utf8'),'codex');
  const overlayText=fs.readFileSync(new URL('../../codex/skill/presets.toml',import.meta.url),'utf8');
  const smart=api.applyPreset(config,'smart',overlayText); assert.equal(smart.roles.arc_coder.model,'gpt-6-astra'); assert.equal(smart.platform,'codex');
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
