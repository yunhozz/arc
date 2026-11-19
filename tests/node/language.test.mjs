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

test('settings serialize v1 bytes unchanged', () => {
  for (const language of ['en', 'ko']) {
    const expected = Buffer.from('version = 1\nlanguage = "' + language + '"\n');
    assert.deepEqual(api.serializeSettings({language}), expected);
    assert.deepEqual(api.serializeSettings({language, runMode: 'supervised'}), expected);
    assert.deepEqual(api.serializeLanguage(language), expected);
  }
});

test('settings serialize full-auto v2', () => {
  const bytes = api.serializeSettings({language: 'ko', runMode: 'full-auto'});
  assert.deepEqual(bytes, Buffer.from('version = 2\nlanguage = "ko"\nrun_mode = "full-auto"\n'));
  assert.deepEqual(api.parseSettings(bytes), {version: 2, language: 'ko', runMode: 'full-auto'});
});

test('settings parse v1', () => {
  const bytes = Buffer.from('version = 1\nlanguage = "en"\n');
  assert.deepEqual(api.parseSettings(bytes), {version: 1, language: 'en', runMode: 'supervised'});
});

test('settings parse v2 supervised accepted', () => {
  const bytes = Buffer.from('version = 2\nlanguage = "en"\nrun_mode = "supervised"\n');
  const settings = api.parseSettings(bytes);
  assert.deepEqual(settings, {version: 2, language: 'en', runMode: 'supervised'});
  assert.deepEqual(api.serializeSettings(settings), Buffer.from('version = 1\nlanguage = "en"\n'));
});

test('settings reject unsupported schemas and values', () => {
  for (const text of [
    'version = 1\nlanguage = "en"\nrun_mode = "full-auto"\n',
    'version = 2\nlanguage = "en"\n',
    'version = 1\nlanguage = "en"\nextra = 1\n',
    'version = 1\nextra = 1\n',
    'version = 2\nlanguage = "en"\nextra = 1\n',
    'version = 3\nlanguage = "en"\nrun_mode = "full-auto"\n',
  ]) {
    assert.throws(() => api.parseSettings(Buffer.from(text)), /Invalid ARC settings schema or version/);
  }
  const invalidRunMode = Buffer.from('version = 2\nlanguage = "en"\nrun_mode = "auto"\n');
  assert.throws(() => api.parseSettings(invalidRunMode), /Invalid run mode: auto/);
  assert.throws(() => api.serializeSettings({language: 'en', runMode: 'auto'}), /Invalid run mode: auto/);
});

test('settings reject non-Buffer inputs and invalid UTF-8', () => {
  assert.throws(() => api.parseSettings('version = 1\nlanguage = "en"\n'), /Language settings must be bytes/);
  const invalidUtf8 = Buffer.concat([Buffer.from('version = 1\nlanguage = "en"\n# '), Buffer.from([0xff, 0xfe])]);
  assert.throws(() => api.parseSettings(invalidUtf8), {code: 'ERR_ENCODING_INVALID_ENCODED_DATA'});
});

test('parseLanguage wrapper preserves the language-only result for both versions', () => {
  const v1 = Buffer.from('version = 1\nlanguage = "en"\n');
  const v2 = Buffer.from('version = 2\nlanguage = "ko"\nrun_mode = "full-auto"\n');
  assert.deepEqual(api.parseLanguage(v1), {version: 1, language: 'en'});
  assert.deepEqual(api.parseLanguage(v2), {version: 2, language: 'ko'});
});

test('validateRunMode accepts only the supported run modes', () => {
  assert.deepEqual(api.RUN_MODES, ['supervised', 'full-auto']);
  assert.equal(Object.isFrozen(api.RUN_MODES), true);
  assert.equal(api.validateRunMode('supervised'), 'supervised');
  assert.equal(api.validateRunMode('full-auto'), 'full-auto');
  assert.throws(() => api.validateRunMode('auto'), /Invalid run mode: auto/);
});

test('renderRunModePolicy replaces exactly one marker with the specified policy bytes', () => {
  const expectedPolicies = {
    supervised: "**Run mode:** Supervised. Every approval and choice gate in this skill and its references requires the user's explicit answer; Orchestrator does not auto-decide gates.",
    'full-auto': "**Run mode:** Full Auto. Orchestrator decides the gates listed in [planning](references/planning.md#full-auto-run-mode) itself: it completes that gate's required checks first, then chooses the recommended option; without a recommendation and supporting evidence, it asks the user. New product decisions outside the original request, external actions, failures, partial completion, holds, unknown state, ownership conflicts, preservation-rule Git actions, permission or sandbox approvals, and unknown slots or exhausted capacity still go to the user. Plan depth, local commit rules, QA, Reviewer and acceptance are unchanged. Record each decision as `auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence` in a user-visible progress message and in the canonical handoff record. If the user asks in this chat to stop auto-deciding or to use Supervised, apply Supervised from the next gate; this overrides the installed default, and earlier auto-decisions stay recorded.",
  };
  const marker = '{{ARC_RUN_MODE_POLICY}}';
  const template = Buffer.from('a\n' + marker + '\nb');
  for (const [runMode, policy] of Object.entries(expectedPolicies)) {
    assert.equal(api.runModePolicy(runMode), policy);
    const rendered = api.renderRunModePolicy(template, runMode);
    assert.deepEqual(rendered, Buffer.from('a\n' + policy + '\nb'));
    assert.equal(rendered.includes(marker), false);
  }
});

test('renderRunModePolicy rejects missing or repeated markers and invalid modes', () => {
  const marker = '{{ARC_RUN_MODE_POLICY}}';
  for (const text of ['no marker', marker + '\n' + marker]) {
    assert.throws(
      () => api.renderRunModePolicy(Buffer.from(text), 'supervised'),
      /Expected exactly one ARC run mode policy marker/,
    );
  }
  assert.throws(() => api.renderRunModePolicy(Buffer.from(marker), 'x'), /Invalid run mode: x/);
});
