import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {renderAgentProfile} from '../../lib/prompts/render.mjs';
import {effectiveSection, effectiveText} from './fixtures/effective-doc.mjs';
import rulePins from './fixtures/rule-pins.json' with { type: 'json' };

const platforms = ['claude', 'codex', 'gemini', 'grok'];
const anchorId = 'id="test-scope-and-result-comparison"';
const anchor = `<a ${anchorId}></a>`;
const heading = '## Test scope and result comparison';
const riskAnchor = '<a id="risk-scaled-execution"></a>';
const modeField = '`mode: task | final`';
const substituteHeading = '**Trigger substitute checks**';
const undeterminableReport = 'item, cause, substitute checks run and remaining unverified scope';
const runtimeCommandsAnchor = 'final-verification-runtime-commands';
const finalPlanRecheckId = 'review.final-plan-recheck';
const oldFinalPlanRecheckSentence = 'Separate Tester findings follow Implementer → Tester.';
const pinText = id => rulePins.rules.find(rule => rule.id === id).text;
const plannerFinalPlanRecheckSentence = pinText('RP-582');
const reviewerVerificationSentence = pinText('RP-583');
const reviewerFindingsSentence = pinText('RP-584');
const finalPlanRecheckSentence = pinText('RP-785');
const finalPlanRecheckSequence = ['RP-786', 'RP-785', 'RP-787'].map(pinText).join(' ');
const oldReviewerVerificationPhrase = 'Tester owns functional/test verification';
const profileRoles = ['scouter', 'planner', 'implementer', 'tester', 'reviewer'];
const wholePlanReviewerRule = pinText('RP-586');
const retiredPhrases = [
  'Final verification is run by Orchestrator',
  "Compare failures with the brief's baseline",
  'Orchestrator runs final verification',
  'In final verification list the union',
  "full regression only in Orchestrator's final verification",
  'full regression only in final QA verification when triggered.',
  'full regression only in final Tester verification when triggered.',
  'runs it once without further authorization',
  'provisional full-regression trigger judgment',
  'Full regression failures follow the base check below.',
  '**Full regression** runs once within final verification',
  "plus full regression once when the brief's provisional judgment",
];
const retiredFinalOrderPhrases = [
  'MAY run concurrently',
  'even after the final Reviewer has started',
  'which may run concurrently with the final Reviewer',
  'while Reviewer and independent work continue',
];
const testScopeLink = /\[[^\]\n]+\]\(verification\.md#test-scope-and-result-comparison\)/g;
const sectionPhrases = [
  'related to the change',
  substituteHeading,
  'A shared module is',
  'in isolation',
  'rerun count',
  're-changed',
  'base worktree',
  'new-failure candidate',
  'fresh Tester assignment',
  'diagnosis, not an automatic retry',
  'shard manifest',
];

export function assertTestScopeSection(text, body) {
  const lines = text.split('\n').map(line => line.trimEnd());
  assert.equal(text.split(anchorId).length - 1, 1, 'test-scope anchor must occur once');
  assert.equal(lines.filter(line => line === heading).length, 1, 'test-scope heading must occur once');
  const anchorIndex = lines.indexOf(anchor);
  const headingIndex = lines.indexOf(heading);
  const riskIndex = lines.indexOf(riskAnchor);
  assert.ok(anchorIndex >= 0, 'test-scope anchor tag must be present');
  assert.equal(headingIndex, anchorIndex + 1, 'heading must follow its anchor');
  assert.ok(headingIndex < riskIndex, 'test scope must precede risk-scaled execution');
  for (const phrase of sectionPhrases) {
    assert.ok(body.includes(phrase), `test-scope body must include ${phrase}`);
  }
}

export function assertTestScopeLink(text, name) {
  assert.equal([...text.matchAll(testScopeLink)].length, 1, `${name} must contain exactly one complete test-scope link`);
}

function assertOccursOnce(text, phrase) {
  assert.equal(text.split(phrase).length - 1, 1, `must contain exactly once: ${phrase}`);
}

const profileSteps = {
  tester: ['1. Use the shared brief,', '5. Structural checks'],
  implementer: ['7. Connect criteria'],
  planner: ['Return one complete plan draft'],
};

export function assertProfileTestScope(text, role) {
  const lines = text.split('\n');
  for (const label of profileSteps[role]) {
    assert.equal(lines.filter(line => line.startsWith(label)).length, 1, label);
  }
}

const registrySource = readFileSync(new URL('../../lib/prompts/agent-fragments.json', import.meta.url), 'utf8');
const registry = JSON.parse(registrySource);
const readAgent = path => readFileSync(new URL(`../../${path}`, import.meta.url));
const renderAgent = path => renderAgentProfile(path, readAgent(path), registry).toString();
const readPlatformReference = effectiveText;
const renderPlatformProfile = (platform, role) =>
  renderAgent(`${platform}/agents/arc-${role}.${platform === 'codex' ? 'toml' : 'md'}`);
const verification = platform => readPlatformReference(platform, 'verification');
const testScope = platform => effectiveSection(platform, 'verification', heading);
const findParagraph = (text, prefix) => text.split('\n\n').find(paragraph => paragraph.startsWith(prefix)) ?? '';
function scopeStructure(platform) {
  const local = readAgent(`${platform}/skill/references/verification.md`).toString();
  const scope = local.slice(local.indexOf(anchor), local.indexOf(riskAnchor) + riskAnchor.length);
  return scope.split('\n').filter(line => /^(#{1,6} |<a id=")/.test(line));
}

function assertPhrases(text, phrases, source) {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `${source} must include ${phrase}`);
  }
}

test('mode field and single-mode assignment', () => {
  for (const platform of platforms) {
    const brief = readPlatformReference(platform, 'handoff-prep').split('### Verification brief inputs\n\n')[1] ?? '';
    for (const [name, content] of [
      ['verification test scope', testScope(platform)],
      ['Verification brief inputs', brief],
      ['rendered Tester', renderPlatformProfile(platform, 'tester')],
    ]) {
      assertPhrases(content, [modeField], `${platform} ${name}`);
    }
  }
});

test('task mode forbids full regression and reverse dependency search', () => {
  for (const platform of platforms) {
    assert.ok(findParagraph(testScope(platform), '**Task mode**'), platform);
  }
});

test('final mode lists four categories and affected tool conditions', () => {
  const expectedStructure = scopeStructure(platforms[0]);
  for (const platform of platforms) {
    const section = testScope(platform);
    assert.ok(findParagraph(section, '**Final mode**'), platform);
    assert.ok(findParagraph(section, 'Read-only reverse dependency search'), platform);
    assert.deepEqual(scopeStructure(platform), expectedStructure, `${platform} test-scope headings and anchors`);
  }
});

test('foreground command execution rule is confined to the prescribed Implementer and Tester steps', () => {
  const command = pinText('RP-540');
  const steps = {
    implementer: '4. ',
    tester: '2. ',
  };
  for (const platform of platforms) {
    for (const role of profileRoles) {
      const profile = renderPlatformProfile(platform, role);
      const label = `${platform} ${role}`;
      const lineStart = steps[role];
      assert.equal(profile.split(command).length - 1, lineStart ? 1 : 0, label);
      if (lineStart) {
        const matchingLines = profile.split('\n').filter(line => line.includes(command));
        assert.equal(matchingLines.length, 1, label);
        assert.ok(matchingLines[0].startsWith(lineStart), label);
      }
    }
  }
});

test('retired long command wait rule is absent from the registry and all rendered profiles', () => {
  const retiredRule = /Wait once for long commands/;
  assert.doesNotMatch(registrySource, retiredRule);
  for (const platform of platforms) {
    for (const role of profileRoles) {
      assert.doesNotMatch(renderPlatformProfile(platform, role), retiredRule, `${platform} ${role}`);
    }
  }
});

test('command execution paragraph immediately follows Final mode in each reference', () => {
  for (const platform of platforms) {
    const matches = verification(platform).split('\n\n')
      .filter(paragraph => paragraph.startsWith('**Command execution:**'));
    assert.equal(matches.length, 1, platform);
    const paragraphs = testScope(platform).split('\n\n');
    const finalModeIndex = paragraphs.findIndex(paragraph => paragraph.startsWith('**Final mode**'));
    assert.ok(finalModeIndex >= 0, platform);
    assert.ok(paragraphs[finalModeIndex + 1]?.startsWith('**Command execution:**'), platform);
  }
});

test('suite parallelism paragraph immediately follows Command execution in each reference', () => {
  for (const platform of platforms) {
    const paragraphs = testScope(platform).split('\n\n');
    const matches = paragraphs.filter(paragraph => paragraph.startsWith('**Suite parallelism:**'));
    assert.equal(matches.length, 1, platform);
    const commandIndex = paragraphs.findIndex(paragraph => paragraph.startsWith('**Command execution:**'));
    assert.ok(commandIndex >= 0, platform);
    assert.ok(paragraphs[commandIndex + 1]?.startsWith('**Suite parallelism:**'), platform);
    assert.ok(paragraphs[commandIndex + 2]?.startsWith('Read-only reverse dependency search'), platform);
  }
});

test('trigger substitute checks table', () => {
  const cases = [
    ['(1) Shared module', ['reverse dependencies', 'static import, require, load and path-string references', 'mirrors and generated outputs', 'nearest package manifest directory', 'otherwise the test directory', 'suspected dynamic reference']],
    ['(2) Integrated changes', ['incoming changes and conflict-resolution files', 'commit or tree hash', 'uncertain integration history']],
    ['(3) Dependencies', ['lockfile diff', 'resolved version changed', 'transitive dependencies', 'missing or unreadable lockfile']],
    ['(3) Language, runtime, build or test configuration', ['one representative test per package or test directory', 'project-declared smoke tests first', 'lexicographically first test file', 'record why', 'unidentifiable package or test layout']],
    ['(4) Public interface', ['identifiers, CLI option strings and configuration keys', 'all contract tests', 'consumers outside the repository are unverified', 'suspected dynamic reference']],
  ];
  for (const platform of platforms) {
    const section = testScope(platform);
    assert.ok(findParagraph(section, substituteHeading), platform);
    assert.ok(findParagraph(section, 'Planner records a provisional trigger judgment'), platform);
    const table = findParagraph(section, '| Trigger | Substitute check |');
    for (const [trigger, phrases] of cases) {
      const row = table.split('\n').find(line => line.startsWith(`| ${trigger} |`)) ?? '';
      assertPhrases(row, phrases, `${platform} ${trigger}`);
    }
  }
});

test('impact procedure order', () => {
  const steps = [
    'same commit or tree hash',
    'affected tool',
    'reverse dependencies',
    'expand the boundary one step',
    'report as undeterminable (unverified)',
  ];
  for (const platform of platforms) {
    const section = testScope(platform);
    const impact = findParagraph(section, '1. Reuse evidence');
    const lines = impact.split('\n');
    assert.equal(lines.length, steps.length, platform);
    let previousIndex = -1;
    for (const [index, phrase] of steps.entries()) {
      assert.ok(lines[index].startsWith(`${index + 1}. `), `${platform} step ${index + 1}`);
      const position = impact.indexOf(phrase);
      assert.ok(position > previousIndex, `${platform} impact procedure order: ${phrase}`);
      assertPhrases(lines[index], [phrase], platform);
      previousIndex = position;
    }
    assertOccursOnce(section, pinText('RP-560'));
  }
});

test('undeterminable report and disposition', () => {
  for (const platform of platforms) {
    assertPhrases(findParagraph(testScope(platform), '**Undeterminable scope**'), [
      undeterminableReport,
      '(i) approve full regression',
      '(ii) substitute the project CI full test results',
      '(iii) disposition as unverified',
    ], platform);
    assertOccursOnce(renderPlatformProfile(platform, 'tester'), undeterminableReport);
    assertOccursOnce(verification(platform), pinText('RP-564'));
  }
});

test('approved full regression follow-up', () => {
  const expiredApproval = pinText('RP-569').split('. ')[1];
  for (const platform of platforms) {
    const paragraph = findParagraph(testScope(platform), '**Approved full regression**');
    assert.ok(paragraph.includes('lease.timeoutMinutes'), platform);
    assertOccursOnce(verification(platform), expiredApproval);
    assertOccursOnce(verification(platform), pinText('RP-570'));
  }
});

test('full regression shards paragraph sits between Approved full regression and CI substitution', () => {
  for (const platform of platforms) {
    const paragraphs = testScope(platform).split('\n\n');
    const matches = paragraphs.filter(paragraph => paragraph.startsWith('**Full regression shards:**'));
    assert.equal(matches.length, 1, platform);
    const approvedIndex = paragraphs.findIndex(paragraph => paragraph.startsWith('**Approved full regression**'));
    assert.ok(approvedIndex >= 0, platform);
    assert.ok(paragraphs[approvedIndex + 1]?.startsWith('**Full regression shards:**'), platform);
    assert.ok(paragraphs[approvedIndex + 2]?.startsWith('**CI substitution**'), platform);
  }
});

test('ci substitution conditions', () => {
  for (const platform of platforms) {
    assert.ok(findParagraph(testScope(platform), '**CI substitution**'), platform);
  }
});

test('planner and brief inputs', () => {
  for (const platform of platforms) {
    assertProfileTestScope(renderPlatformProfile(platform, 'planner'), 'planner');
    const brief = effectiveSection(platform, 'handoff-prep', '### Verification brief inputs');
    assert.ok(brief.includes(modeField), platform);
  }
});

test('final-mode results are not cooperative checks', () => {
  for (const platform of platforms) {
    const section = effectiveSection(platform, 'verification', '## Verification lifecycle in the cooperative CLI');
    assertPhrases(section, ['`operation: "review"`', '`scope: "final"`'], platform);
  }
});

test('ARC agent fragments omit the project suite instruction', () => {
  assert.doesNotMatch(registrySource, /project suite/i);
});

test('canonical final-plan-recheck policy routes final verification failures to Tester', () => {
  const policy = JSON.parse(readAgent('lib/policy/role-policy.json'));
  const rules = policy.rules.filter(rule => rule.id === finalPlanRecheckId);
  assert.equal(rules.length, 1);
  const [{id, roles, effect, controls, text}] = rules;
  assert.deepEqual({id, roles, effect, controls}, {
    id: finalPlanRecheckId,
    roles: ['orchestrator', 'scouter', 'planner', 'implementer', 'tester', 'reviewer'],
    effect: 'require',
    controls: {codex: 'prompt', claude: 'prompt', gemini: 'prompt', grok: 'prompt'},
  });
  assert.ok(!text.includes(oldFinalPlanRecheckSentence));
  assertOccursOnce(text, finalPlanRecheckSentence);
  assert.ok(text.includes(finalPlanRecheckSequence));
});

test('failure disposition steps keep their order in the canonical rule and its projections', () => {
  const policy = JSON.parse(readAgent('lib/policy/role-policy.json'));
  const canonical = policy.rules.find(rule => rule.id === 'scope.non-escalation').text;
  const sources = [['canonical', canonical]];
  for (const [platform, extension] of [['codex', 'toml'], ['claude', 'md']]) {
    const core = `${platform}/skill/SKILL.md`;
    sources.push([core, readAgent(core).toString()]);
    for (const role of profileRoles) {
      const profile = `${platform}/agents/arc-${role}.${extension}`;
      sources.push([profile, readAgent(profile).toString()]);
    }
  }
  const steps = ['RP-791', 'RP-792', 'RP-793', 'RP-794', 'RP-795'].map(pinText);
  for (const [source, text] of sources) {
    const body = text.replace(/\s+/g, ' ');
    let end = 0;
    for (const step of steps) {
      const start = body.indexOf(step, end);
      assert.ok(start >= 0, `${source}: missing or out-of-order step ${step}`);
      end = start + step.length;
    }
  }
});

test('policy and fragment sources omit the retired final order phrases', () => {
  for (const path of [
    'lib/policy/role-policy.json',
    'lib/prompts/agent-fragments.json',
    'shared/skill/runtime/role-policy.json',
  ]) {
    const source = readAgent(path).toString();
    for (const phrase of retiredFinalOrderPhrases) {
      assert.ok(!source.includes(phrase), `${path} must omit ${phrase}`);
    }
  }
});

for (const platform of platforms) {
  const references = new URL(`../../${platform}/skill/references/`, import.meta.url);
  const readReference = name => readFileSync(new URL(name, references), 'utf8');
  const extension = platform === 'codex' ? 'toml' : 'md';
  const profilePath = role => `${platform}/agents/arc-${role}.${extension}`;

  test(`${platform} planner render places the final-plan-recheck sentence exactly once`, () => {
    assertOccursOnce(renderAgent(profilePath('planner')), plannerFinalPlanRecheckSentence);
  });

  test(`${platform} reviewer render places the final verification sentences exactly once`, () => {
    const reviewer = renderAgent(profilePath('reviewer'));
    assertOccursOnce(reviewer, reviewerVerificationSentence);
    assertOccursOnce(reviewer, reviewerFindingsSentence);
    assert.ok(!reviewer.includes(oldReviewerVerificationPhrase));
    assert.ok(reviewer.includes(`after required Tester/focused checks and Tester rechecks. ${reviewerVerificationSentence}\n`));
    assert.ok(reviewer.includes(`before this final stage. ${reviewerFindingsSentence}\n`));
  });

  test(`${platform} non-reviewer renders omit the reviewer verification sentences`, () => {
    for (const role of profileRoles.filter(role => role !== 'reviewer')) {
      const rendered = renderAgent(profilePath(role));
      assert.ok(!rendered.includes(reviewerVerificationSentence), profilePath(role));
      assert.ok(!rendered.includes(reviewerFindingsSentence), profilePath(role));
    }
  });

  const policyPaths = [
    ...profileRoles.map(profilePath),
    ...['planning', 'handoff', 'verification'].map(name => `${platform}/skill/references/${name}.md`),
  ];
  for (const path of policyPaths) {
    test(`${path} places the final-plan-recheck sentence in its managed rule exactly once`, () => {
      const source = readAgent(path).toString();
      assert.ok(!source.includes(oldFinalPlanRecheckSentence));
      assertOccursOnce(source, finalPlanRecheckSentence);
      const managed = source.split('[ARC role policy: contract begin]')[1]?.split('[ARC role policy: contract end]')[0];
      assertOccursOnce(managed ?? '', `- [${finalPlanRecheckId}] `);
      const rule = managed?.split('\n').find(line => line.startsWith(`- [${finalPlanRecheckId}] `));
      assert.ok(rule?.includes(finalPlanRecheckSequence));
    });
  }

  test(`${platform} verification defines test scope before risk-scaled execution`, () => {
    assertTestScopeSection(readReference('verification.md'), effectiveSection(platform, 'verification', heading));
  });

  test(`${platform} test scope paragraphs match the approved text`, () => {
    const verification = effectiveText(platform, 'verification');
    const paragraphs = verification.split('\n\n');
    for (const prefix of ['**Final mode**', substituteHeading, '**Baseline:**', '**Result comparison:**']) {
      assert.equal(paragraphs.filter(text => text.startsWith(prefix)).length, 1, prefix);
    }
    const structuredResults = ['RP-446', 'RP-447', 'RP-448'].map(pinText).join(' ');
    assertOccursOnce(verification, structuredResults);
    const resultComparison = findParagraph(verification, '**Result comparison:**');
    assert.ok(resultComparison.includes([pinText('RP-445'), structuredResults, pinText('RP-449')].join(' ')));
  });

  test(`${platform} verification omits the runtime commands section`, () => {
    const reference = readReference('verification.md');
    for (const phrase of [runtimeCommandsAnchor, '## Final verification runtime commands', 'verify-cli', 'arc/verify']) {
      assert.ok(!reference.includes(phrase), `must omit ${phrase}`);
    }
    const lines = reference.split('\n');
    const riskIndex = lines.indexOf(riskAnchor);
    assert.equal(lines[riskIndex - 1], '');
    assert.ok(lines[riskIndex - 2]?.startsWith('**Result comparison:**'));
  });

  test(`${platform} handoff-prep brief inputs cite the approved base`, () => {
    const reference = readReference('handoff-prep.md');
    const section = effectiveSection(platform, 'handoff-prep', '### Verification brief inputs');
    assertPhrases(section, [modeField, '`mode: task`', '`mode: final`'], platform);
    assert.ok(!reference.includes('runId'));
    assert.ok(!reference.includes('baseline record reference'));
  });

  test(`${platform} final Reviewer starts only after final-mode Tester work concludes`, () => {
    const verification = effectiveText(platform, 'verification');
    const finalReview = ['RP-416', 'RP-417', 'RP-418'].map(pinText);
    for (const sentence of finalReview) assertOccursOnce(verification, sentence);
    assert.ok(findParagraph(testScope(platform), '**Final mode**')
      .endsWith([pinText('RP-415'), ...finalReview].join(' ')));
  });

  test(`${platform} base verdict sentences sit in place`, () => {
    const baseline = findParagraph(testScope(platform), '**Baseline:**');
    assert.ok(baseline.includes(['RP-437', 'RP-438', 'RP-439'].map(pinText).join(' ')));
    assert.ok(!baseline?.includes('never under `.claude/worktrees/` or inside the execution target worktree'));
  });

  test(`${platform} preservation rule allows only the ARC-owned base worktree exception`, () => {
    const skill = readAgent(`${platform}/skill/SKILL.md`).toString();
    const preservation = skill.split('\n').find(line => line.startsWith('- **Preservation rule:**'));
    const link = /\]\(references\/verification\.md#test-scope-and-result-comparison\)/g;
    assert.equal([...(preservation ?? '').matchAll(link)].length, 1, platform);
    assertOccursOnce(skill, pinText('RP-103'));
    assert.ok(preservation?.includes(['RP-102', 'RP-103'].map(pinText).join(' ')));
  });

  test(`${platform} final plan acceptance places the whole-plan Reviewer within final verification`, () => {
    const reference = readReference('verification.md');
    assertOccursOnce(reference, wholePlanReviewerRule);
    const acceptanceSection = reference.split('## Task acceptance and final plan acceptance\n')[1]?.split('\n<a id="')[0];
    assert.ok(acceptanceSection?.includes(`State final integration scope/timing separately. ${wholePlanReviewerRule} task commits`));
  });

  test(`${platform} handoff, planning and handoff preparation link to test scope`, () => {
    for (const name of ['handoff.md', 'planning.md', 'handoff-prep.md']) {
      assertTestScopeLink(readReference(name), name);
    }
  });

  test(`${platform} ARC references omit the project suite instruction`, () => {
    for (const name of readdirSync(references).filter(name => name.endsWith('.md'))) {
      assert.doesNotMatch(readReference(name), /project suite/i, name);
    }
  });

  for (const role of Object.keys(profileSteps)) {
    test(`${platform} ${role} places each test-scope rule exactly once`, () => {
      assertProfileTestScope(renderAgent(profilePath(role)), role);
    });
  }

  test(`${platform} sources and rendered profiles omit the retired verification sentences`, () => {
    for (const name of ['verification.md', 'handoff-prep.md', 'planning.md']) {
      for (const phrase of retiredPhrases) {
        assert.ok(!readReference(name).includes(phrase), `${name} must omit ${phrase}`);
      }
    }
    for (const phrase of retiredPhrases) {
      assert.ok(!registrySource.includes(phrase), `fragment registry must omit ${phrase}`);
    }
    for (const role of profileRoles) {
      const path = profilePath(role);
      const rendered = renderAgent(path);
      for (const phrase of retiredPhrases) {
        assert.ok(!rendered.includes(phrase), `${path} rendering must omit ${phrase}`);
      }
    }
    const path = profilePath('implementer');
    const template = readAgent(path).toString();
    for (const phrase of retiredPhrases) {
      assert.ok(!template.includes(phrase), `${path} template must omit ${phrase}`);
    }
  });

  test(`${platform} sources and rendered profiles omit the retired final order phrases`, () => {
    const sources = [
      [`${platform}/skill/SKILL.md`, readAgent(`${platform}/skill/SKILL.md`).toString()],
      ...['verification.md', 'planning.md', 'handoff.md'].map(name => [name, readReference(name)]),
      ...profileRoles.map(role => [profilePath(role), renderAgent(profilePath(role))]),
    ];
    for (const [path, source] of sources) {
      for (const phrase of retiredFinalOrderPhrases) {
        assert.ok(!source.includes(phrase), `${path} must omit ${phrase}`);
      }
    }
  });

  test(`${platform} agent templates and rendered profiles omit the project suite instruction`, () => {
    const directory = new URL(`../../${platform}/agents/`, import.meta.url);
    for (const entry of readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isFile())) {
      const path = `${platform}/agents/${entry.name}`;
      assert.doesNotMatch(readAgent(path).toString(), /project suite/i, path);
      assert.doesNotMatch(renderAgent(path), /project suite/i, `rendered ${path}`);
    }
  });
}
