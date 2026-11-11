import test from 'node:test';
import assert from 'node:assert/strict';
import {roleFromName, topLabel, childLabel, dispatchLabel, asciiToken} from '../../lib/watch/labels.mjs';

const topCases = [
  [{platform:'codex', origin:'codex-tui', sessionId:'01a1c7e8-9172-7963-ab8d-054239cce2e8'}, 'tui#e2e8'],
  [{platform:'codex', origin:'codex_exec', sessionId:'e2e8'}, 'exec#e2e8'],
  [{platform:'codex', origin:'my origin', sessionId:'e2e8'}, 'my-origin#e2e8'],
  [{platform:'claude', origin:'cli', sessionId:'…-834bbf7c0f77'}, 'main#0f77'],
  [{platform:'claude', origin:'sdk-cli', sessionId:'…-834bbf7c0f77'}, 'main:sdk-cli#0f77'],
  [{platform:'claude', sessionId:'…-834bbf7c0f77'}, 'main#0f77'],
];
const childCases = [
  ['tui#e2e8', {agentRole:'arc_routing_qa'}, 'tui#e2e8/qa'],
  ['tui#e2e8', {agentRole:'explorer', nickname:'Aristotle'}, 'tui#e2e8/Aristotle'],
  ['tui#e2e8', {agentRole:'explorer'}, 'tui#e2e8/explorer'],
  ['main#0f77', {agentType:'general-purpose'}, 'main#0f77/general-purpose'],
  ['main#0f77', {agentType:'arc-routing-planner'}, 'main#0f77/planner'],
  ['planner@b9a1', {agentRole:'arc_qa'}, 'planner@b9a1/qa'],
];
const dispatchCases = [['arc_planner','b9a1c3d4-xx','planner@b9a1'], ['arc_qa','d-3f2a9','qa@d3f2'], [null,'b9a1c3','dispatch@b9a1']];
test('roleFromName accepts arc and arc_routing forms on both platforms', () => {
  for (const [name, role] of [['arc_qa','qa'], ['arc_routing_qa','qa'], ['arc-routing-planner','planner'], ['arc-implementer','implementer'], ['arc_scouter','scouter']]) assert.equal(roleFromName(name), role);
  for (const name of ['general-purpose','arc_orchestrator','',null]) assert.equal(roleFromName(name), null);
});
test('topLabel builds kind#last4 for each origin', () => {
  for (const [input, want] of topCases) assert.equal(topLabel(input), want);
});
test('childLabel prefers role, then nickname, then raw names', () => {
  for (const [parent, input, want] of childCases) assert.equal(childLabel(parent, input), want);
});
test('dispatchLabel uses the short role and the first four alphanumerics', () => {
  for (const [role, id, want] of dispatchCases) assert.equal(dispatchLabel(role, id), want);
});
test('labels are printable ASCII', () => {
  for (const label of [...topCases.map(([input]) => topLabel(input)), ...childCases.map(([parent,input]) => childLabel(parent,input)), ...dispatchCases.map(([role,id]) => dispatchLabel(role,id)), topLabel({platform:'codex',origin:'한 글\x1b',sessionId:'abcd'})]) assert.match(label, /^[\x21-\x7e]+$/);
  assert.equal(asciiToken('한 글///a--b'), '-a-b');
});
