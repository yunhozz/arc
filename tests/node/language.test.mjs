import test from 'node:test';import assert from 'node:assert/strict';
const api=await import('../../lib/installer/language.mjs').catch(()=>({}));
test('language settings round trip en and ko with strict schema validation',()=>{
 assert.equal(typeof api.parseLanguage,'function');
 for(const language of ['en','ko']){assert.deepEqual(api.parseLanguage(Buffer.from(`version = 1\nlanguage = "${language}"\n`)),{version:1,language});assert.equal(api.serializeLanguage(language).toString(),`version = 1\nlanguage = "${language}"\n`);}
 for(const text of ['version = 2\nlanguage = "en"','version = 1\nlanguage = "fr"','version = 1\nlanguage = "ko"\nextra = 1','invalid','version = 1'])assert.throws(()=>api.parseLanguage(Buffer.from(text)));
});
test('shared selection uses equal existing language and otherwise English',()=>{
 assert.equal(typeof api.defaultLanguage,'function');
 for(const [existing,want]of [[[null],'en'],[['ko'],'ko'],[['ko','ko'],'ko'],[['ko','en'],'en'],[['ko',null],'en']])assert.equal(api.defaultLanguage(existing),want);
});
test('generated policies replace exactly one marker and preserve explicit user overrides',()=>{
 assert.equal(typeof api.renderLanguagePolicy,'function');
 for(const [language,want]of [['en','English'],['ko','Korean']]){const rendered=api.renderLanguagePolicy(Buffer.from('before\n{{ARC_OUTPUT_LANGUAGE_POLICY}}\nafter'),language).toString();assert.match(rendered,new RegExp(want));assert.match(rendered,/explicit.*user|user.*explicit/i);assert.doesNotMatch(rendered,/\{\{ARC/);}
 for(const text of ['no marker','{{ARC_OUTPUT_LANGUAGE_POLICY}}{{ARC_OUTPUT_LANGUAGE_POLICY}}'])assert.throws(()=>api.renderLanguagePolicy(Buffer.from(text),'en'));
});
