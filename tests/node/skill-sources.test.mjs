import test from 'node:test';
import assert from 'node:assert/strict';
import {composeSkillSources} from '../../lib/installer/skill-sources.mjs';

const sources=entries=>new Map(entries.map(([name,text])=>[name,Buffer.from(text)]));

test('composes shared and platform files as a sorted union',()=>{
 const files=sources([['codex/skill/references/b.md','platform'],['claude/skill/x','other'],['shared/skill/references/a.md','shared'],['codex/skill/SKILL.md','skill']]);
 const result=composeSkillSources(files,'codex');
 assert.deepEqual([...result.keys()],['SKILL.md','references/a.md','references/b.md']);
 for(const [name,source,text]of [['SKILL.md','codex/skill/SKILL.md','skill'],['references/a.md','shared/skill/references/a.md','shared'],['references/b.md','codex/skill/references/b.md','platform']]){
  assert.equal(result.get(name).toString(),text);assert.notEqual(result.get(name),files.get(source));
 }
 result.get('references/a.md')[0]=0;assert.equal(files.get('shared/skill/references/a.md').toString(),'shared');
});
test('C1 rejects identical shared and platform path',()=>{
 assert.throws(()=>composeSkillSources(sources([['shared/skill/references/a.md','same'],['codex/skill/references/a.md','same']]),'codex'),/C1.*references\/a\.md/);
});
test('C2 rejects shared generated files and their subpaths',()=>{
 for(const name of ['SKILL.md','models.toml','settings.toml','limits.toml'])for(const suffix of ['','/x']){
  assert.throws(()=>composeSkillSources(sources([['shared/skill/'+name+suffix,'bad']]),'codex'),error=>error.message.includes('C2')&&error.message.includes(name+suffix));
 }
});
test('C3 rejects file/directory prefix conflicts in both directions',()=>{
 for(const entries of [
  [['shared/skill/references','file'],['codex/skill/references/x.md','child']],
  [['codex/skill/runtime','file'],['shared/skill/runtime/x.mjs','child']],
  [['shared/skill/references','file'],['shared/skill/references/x.md','child']],
 ])assert.throws(()=>composeSkillSources(sources(entries),'codex'),/C3.*(?:references|runtime)/);
 assert.deepEqual([...composeSkillSources(sources([['shared/skill/ref','one'],['codex/skill/references/x.md','two']]),'codex').keys()],['ref','references/x.md']);
});
test('rejects invalid platform and non-Map input',()=>{
 for(const platform of ['shared',undefined])assert.throws(()=>composeSkillSources(new Map(),platform),/Invalid skill source platform:/);
 for(const files of [undefined,{}])assert.throws(()=>composeSkillSources(files,'codex'),/Invalid skill source files/);
});
test('ignores other platform files',()=>{
 const files=sources([['shared/skill/references/a.md','shared'],['codex/skill/x','codex'],['claude/skill/x','claude']]);
 assert.deepEqual([...composeSkillSources(files,'codex')].map(([name,bytes])=>[name,bytes.toString()]),[['references/a.md','shared'],['x','codex']]);
 assert.deepEqual([...composeSkillSources(files,'claude')].map(([name,bytes])=>[name,bytes.toString()]),[['references/a.md','shared'],['x','claude']]);
});
test('is order independent',()=>{
 const entries=[['shared/skill/z','last'],['codex/skill/a','first'],['shared/skill/A','uppercase']];
 const first=composeSkillSources(sources(entries),'codex');
 assert.deepEqual([...first.keys()],['A','a','z']);
 assert.deepEqual(composeSkillSources(sources([...entries].reverse()),'codex'),first);
});
test('checks conflicts in C1 then C2 then C3 order',()=>{
 const entries=[['shared/skill/references','prefix'],['codex/skill/references/a.md','child'],['shared/skill/settings.toml','generated'],['codex/skill/settings.toml','duplicate']];
 assert.throws(()=>composeSkillSources(sources(entries),'codex'),/C1.*settings\.toml/);
 assert.throws(()=>composeSkillSources(sources(entries.filter(([name])=>name!=='codex/skill/settings.toml')),'codex'),/C2.*settings\.toml/);
});
