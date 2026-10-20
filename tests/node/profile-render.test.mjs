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
import {hookFrontmatter,buildClaudeHookCommand} from '../../lib/policy/claude-hook.mjs';
test('Claude model rendering preserves the managed hook and rejects unsupported hook structures',()=>{
 const input=profiles('claude'),name='arc-coder.md';const text=input[name].toString();
 const hook=hookFrontmatter();input[name]=Buffer.from(text);
 const result=api.renderProfiles(input,settings('claude')).get(name).toString();assert.ok(result.includes(hook));
 const bad={...input,[name]:Buffer.from(input[name].toString().replace('matcher: Bash','matcher: Read'))};assert.throws(()=>api.renderProfiles(bad,settings('claude')));
});

// Removing either managed entry validation must fail these consumer boundary cases.
for(const eol of ['\n','\r\n'])test(`Claude generated two-gate model round-trip preserves custom frontmatter and hooks with ${JSON.stringify(eol)}`,()=>{
 const input=profiles('claude',eol),name='arc-coder.md';
 const custom=['    - matcher: Custom','      hooks:','        - type: command','          command: "echo preserved"'].join(eol);
 const post=['  PostToolUse:','    - matcher: Custom','      hooks:','        - type: command','          command: \"echo observed\"'].join(eol);
 const original=input[name].toString().replace(eol+'---'+eol,eol+post+eol+'---'+eol).replace('hooks:'+eol,'custom: preserved'+eol+'hooks:'+eol).replace('  PreToolUse:'+eol,'  PreToolUse:'+eol+custom+eol);
 input[name]=Buffer.from(original);
 const result=api.renderProfiles(input,settings('claude')).get(name);
 const mask=text=>text.replace(/^(model|effort):[^\r\n]*/gm,'$1: MASK');
 assert.equal(mask(result.toString()),mask(original));assert.ok(result.toString().includes(custom));
 assert.deepEqual(api.renderProfiles({...input,[name]:result},settings('claude')).get(name),result);
});
test('Claude consumer requires one strict Bash guard and rejects active runtime wiring',()=>{
 const input=profiles('claude'),name='arc-coder.md',original=input[name].toString();
 const guard=hookFrontmatter().split('\n').slice(2).join('\n');
 for(const changed of [original.replace(guard,''),original.replace(guard,guard+'\n'+guard),original.replace('onFailure: block','onFailure: ignore'),original.replace('matcher: Bash','matcher: Read'),original.replace('        - type: command','        - type: prompt')])assert.throws(()=>api.renderProfiles({...input,[name]:Buffer.from(changed)},settings('claude')),{code:'ARC_MODEL_VALIDATION'});
});

for(const [command,failure] of [['node -e "Buffer.from(\'data\')"',undefined],['echo preserved','continue'],['echo preserved','block']])test(`Claude preserves custom command ${JSON.stringify(command)} with failure ${failure??'default'}`,()=>{
 const input=profiles('claude'),name='arc-coder.md';
 const custom=['    - matcher: Custom','      hooks:','        - type: command',`          command: ${JSON.stringify(command)}`,...(failure?[`          onFailure: ${failure}`]:[])].join('\n');
 const original=input[name].toString().replace('  PreToolUse:\n','  PreToolUse:\n'+custom+'\n');input[name]=Buffer.from(original);
 const rendered=api.renderProfiles(input,settings('claude')).get(name).toString();
 const mask=text=>text.replace(/^(model|effort):[^\r\n]*/gm,'$1: MASK');assert.equal(mask(rendered),mask(original));
});
test('Claude rejects invalid custom failure behavior and fake ARC managed paths',()=>{
 const input=profiles('claude'),name='arc-coder.md';
 for(const [command,failure] of [['echo preserved','ignore'],['node /tmp/hooks/runtime-gate.mjs','block'],['node /tmp/hooks/role-git-guard.mjs','continue']]){
  const custom=['    - matcher: Custom','      hooks:','        - type: command',`          command: ${JSON.stringify(command)}`,`          onFailure: ${failure}`].join('\n');
  const text=input[name].toString().replace('  PreToolUse:\n','  PreToolUse:\n'+custom+'\n');
  assert.throws(()=>api.renderProfiles({...input,[name]:Buffer.from(text)},settings('claude')),{code:'ARC_MODEL_VALIDATION'});
 }
});
