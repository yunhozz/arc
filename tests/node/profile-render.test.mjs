import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const api = await import('../../lib/models/index.mjs').catch(() => ({}));
const roles = ['scouter', 'planner', 'coder', 'qa', 'reviewer'];
function profiles(platform, eol = '\n') { return Object.fromEntries(roles.map(role => { const name = `arc-${role}.${platform === 'codex' ? 'toml' : 'md'}`; return [name, Buffer.from(fs.readFileSync(new URL(`../../${platform}/agents/${name}`, import.meta.url), 'utf8').replace(/\r?\n/g, eol))]; })); }
function settings(platform) { return api.resolveModelSettings(api.applyPreset(api.loadModelConfig(fs.readFileSync(new URL(`../../${platform}/skill/models.toml`, import.meta.url), 'utf8'), platform), 'smart')); }
for (const platform of ['codex', 'claude']) for (const eol of ['\n','\r\n']) test(`${platform} renderer preserves non-model bytes with ${JSON.stringify(eol)}`, () => {
  const input = profiles(platform, eol); const config = settings(platform); const result = api.renderProfiles(input, config);
  for (const [name, original] of Object.entries(input)) {
    assert.ok(Buffer.isBuffer(result.get(name))); const role = name.replace(/\.(toml|md)$/, '').replace('-', '_');
    if (platform === 'codex') {
      const cleaned = result.get(name).toString().replace(/^model(?:_reasoning_effort)? = .*\r?\n/gm, ''); assert.equal(cleaned, original.toString());
      assert.match(result.get(name).toString(), new RegExp(`model = "${config.roles[role].model}"`));
    } else {
      const mask = bytes => bytes.toString().replace(/^(model|effort):[^\r\n]*/gm, '$1: MASK'); assert.equal(mask(result.get(name)), mask(original));
      assert.ok(result.get(name).toString().includes(`model: ${config.roles[role].model}${eol}`));
    }
    assert.deepEqual(api.renderProfiles(result, config).get(name), result.get(name)); assert.deepEqual(input[name], original);
  }
});
test('Codex model-looking text inside instructions is preserved', () => {
  const input = profiles('codex'); input['arc-coder.toml'] = Buffer.from('name = "arc_coder"\r\ndescription = "x"\r\ndeveloper_instructions = """\r\nmodel = "leave-me"\r\nmodel_reasoning_effort = "leave-me"\r\n"""\r\n[nested]\r\nmodel = "nested"\r\n');
  const result = api.renderProfiles(input, settings('codex')).get('arc-coder.toml').toString();
  assert.ok(result.includes('model = "leave-me"\r\nmodel_reasoning_effort = "leave-me"')); assert.ok(result.endsWith('[nested]\r\nmodel = "nested"\r\n'));
});
test('Codex existing root field edits preserve indentation, comments and nested fields', () => {
  const input = profiles('codex'); input['arc-coder.toml'] = Buffer.from('name = "arc_coder"\nmodel = "old" # keep\n\t"model_reasoning_effort" = \'low\'  # keep too\n[nested]\nmodel = "nested"\n');
  const out = api.renderProfiles(input, settings('codex')).get('arc-coder.toml').toString();
  assert.ok(out.includes('model = "gpt-6-astra" # keep\n')); assert.ok(out.includes('\t"model_reasoning_effort" = "high"  # keep too\n')); assert.ok(out.endsWith('[nested]\nmodel = "nested"\n'));
});
for (const platform of ['codex','claude']) test(`${platform} invalid/missing profile set fails without output`, () => {
  const input = profiles(platform); const name = Object.keys(input)[0]; delete input[name]; assert.throws(() => api.renderProfiles(input, settings(platform)), { code: 'ARC_MODEL_VALIDATION' });
  input[name] = Buffer.from(platform === 'codex' ? 'name = "wrong"' : '---\nname: wrong\n---\nbody'); assert.throws(() => api.renderProfiles(input, settings(platform)), { code: 'ARC_MODEL_VALIDATION' });
});
test('manifest generator protects vendored runtime files and license', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'arc-vendor-manifest-')); t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(`${root}/vendor/toml`,{recursive:true}); fs.writeFileSync(`${root}/vendor/toml/index.js`,'export const parser = true;'); fs.writeFileSync(`${root}/vendor/toml/LICENSE`,'license');
  const run = spawnSync(process.execPath,['scripts/update-manifest.mjs','--root',root],{encoding:'utf8'}); assert.equal(run.status,0,run.stderr);
  const manifest=fs.readFileSync(`${root}/MANIFEST.sha256`,'utf8'); assert.match(manifest,/  vendor\/toml\/index\.js\n/); assert.match(manifest,/  vendor\/toml\/LICENSE\n/);
});
test('public renderProfiles returns a Map of profile names to buffers', () => {
  const config=api.loadModelConfig(fs.readFileSync(new URL('../../codex/skill/models.toml',import.meta.url),'utf8'),'codex');
  const rendered=api.renderProfiles(profiles('codex'),api.resolveModelSettings(config)); assert.ok(rendered instanceof Map); assert.ok(Buffer.isBuffer(rendered.get('arc-coder.toml')));
});
for (const platform of ['codex','claude']) test(`${platform} rejects a BOM instead of silently removing non-model bytes`, () => {
  const input=profiles(platform); const name=Object.keys(input)[0]; input[name]=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),input[name]]);
  assert.throws(()=>api.renderProfiles(input,settings(platform)),{code:'ARC_MODEL_VALIDATION'});
});
test('model changes preserve policy blocks and Codex feature settings together',()=>{
 const input=profiles('codex');
 const original=input['arc-coder.toml'];
 input['arc-coder.toml']=Buffer.concat([original,Buffer.from('\n[features]\nshell_tool = true\n')]);
 const rendered=api.renderProfiles(input,settings('codex')).get('arc-coder.toml').toString();
 assert.ok(rendered.endsWith('[features]\nshell_tool = true\n'));
 const start=original.toString().indexOf('[ARC role policy: contract begin]');
 const end=original.toString().indexOf('[ARC role policy: contract end]')+'[ARC role policy: contract end]'.length;
 assert.ok(start>=0); assert.ok(rendered.includes(original.toString().slice(start,end)));
});
