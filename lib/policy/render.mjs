import {renderSourceClaudeHook} from './claude-hook.mjs';
import {POLICY_PROJECTIONS, validatePolicyProjections} from './placement.mjs';
import {validateGitPolicy} from '../../claude/skill/hooks/role-git-guard.mjs';
import source from './role-policy.json' with {type: 'json'};
const ROLES = ['orchestrator','scouter','planner','implementer','qa','reviewer'];
const CONTROLS = ['prompt','capability','hook'];
const fail = message => { throw new Error(`Role policy: ${message}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) && value.length > 0 && value.every(x => typeof x === 'string' && x.length > 0) && new Set(value).size === value.length;
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function validateRolePolicy(input) {
  if (!object(input) || input.schemaVersion !== 1 || !Array.isArray(input.roles) || !same(input.roles.map(x=>x?.id),ROLES) || input.roles.some(x=>typeof x.description !== 'string' || !x.description)) fail('expected six known roles in canonical order');
  if (!Array.isArray(input.rules) || !input.rules.length) fail('rules are required');
  const ids = new Set();
  for (const rule of input.rules) {
    if (!object(rule) || typeof rule.id !== 'string' || !/^[a-z][a-z0-9.-]+$/.test(rule.id) || ids.has(rule.id)) fail('invalid or duplicate rule ID');
    ids.add(rule.id);
    if (!strings(rule.roles) || rule.roles.some(x=>!ROLES.includes(x)) || !['allow','deny','require'].includes(rule.effect) || !strings(rule.operations) || !strings(rule.evidence) || !['user','orchestrator'].includes(rule.authority) || typeof rule.text !== 'string' || !rule.text || /[\r\n]/.test(rule.text)) fail(`invalid rule ${rule.id}`);
    if (!object(rule.controls) || !same(Object.keys(rule.controls).sort(),['claude','codex']) || Object.values(rule.controls).some(x=>!CONTROLS.includes(x))) fail(`invalid control level for ${rule.id}`);
  }
  for (const id of ['scope.non-escalation','git.specialists-deny','git.orchestrator-accept-commit','external.explicit-user-authority',...ROLES.map(x=>({orchestrator:'role.orchestrator-boundary',scouter:'role.scouter-read-only',planner:'role.planner-draft-only',implementer:'role.implementer-implementation',qa:'role.qa-verification',reviewer:'role.reviewer-independent'})[x]),'review.significant-no-plan','review.significant-plan','review.final-plan-recheck']) if(!ids.has(id)) fail(`missing required rule ${id}`);
  for (const platform of ['codex','claude']) if (!object(input.platforms?.[platform]) || !CONTROLS.includes(input.platforms[platform].level) || typeof input.platforms[platform].notice !== 'string' || !input.platforms[platform].notice) fail(`invalid ${platform} controls`);
  // These are workflow invariants, not customizable scheduling options.
  const routes = {noPlan:['implementer','qa','reviewer','orchestrator-accept'],planTask:['implementer','fresh-qa','orchestrator-accept','orchestrator-commit'],planFinal:['required-qa','reviewer'],planFinding:['implementer','reviewer']};
  if (!object(input.review) || Object.keys(input.review).length !== 4 || Object.entries(routes).some(([key,value])=>!same(input.review[key],value))) fail('invalid review routing');
  try {validateGitPolicy(input.git);} catch {fail('invalid Git policy');}
  if (!object(input.runtime) || input.runtime.schemaVersion !== 1 || !same(input.runtime.roles,ROLES) || !strings(input.runtime.requiredEvidence) || !strings(input.runtime.ruleIds) || ['platform-identity','user-approval','current-target-versions','resolved-paths'].some(x=>!input.runtime.requiredEvidence.includes(x)) || ['runtime.schema','runtime.policy','runtime.identity','runtime.target','runtime.assignment','runtime.approval','runtime.paths','runtime.docs-commit','runtime.mode','runtime.transition'].some(x=>!input.runtime.ruleIds.includes(x)) || input.runtime.status !== 'decision-only') fail('invalid runtime policy');
  return input;
}
export const defaultRolePolicy = source;
export const POLICY_TARGETS = ['codex','claude'].flatMap(platform => [
  {path:`${platform}/skill/SKILL.md`,platform,audience:'orchestrator',projection:'core'},
  ...ROLES.slice(1).map(audience=>({path:`${platform}/agents/arc-${audience}.${platform==='codex'?'toml':'md'}`,platform,audience})),
  ...Object.entries({coordination:'assignment',planning:'planning',handoff:'handoff','handoff-prep':'preparation',commit:'commit',verification:'verification'}).map(([name,projection])=>({path:`${platform}/skill/references/${name}.md`,platform,audience:'orchestrator',projection})),
]);
POLICY_TARGETS.splice(POLICY_TARGETS.length-1,0,{path:'claude/skill/hooks/git-policy.json',platform:'claude',audience:'specialists',asset:'git'});
export function renderPolicySection(policy, {platform, audience, section = 'contract', skillPath, projection = 'full'} = {}) {
  validateRolePolicy(policy);
  if (!['codex','claude'].includes(platform) || !ROLES.includes(audience) || !['contract','global'].includes(section)) fail('unknown render target');
  let selected;
  if (projection !== 'full') {
    if (!Object.hasOwn(POLICY_PROJECTIONS, projection)) fail('unknown policy projection');
    if (audience !== 'orchestrator') fail('specialist rendering requires full projection');
    validatePolicyProjections(policy);
    selected = new Set(POLICY_PROJECTIONS[projection]);
  }
  const rules = policy.rules.filter(rule=>selected ? selected.has(rule.id) : section === 'global' || audience === 'orchestrator' || rule.roles.includes(audience));
  const lines = ['Generated from lib/policy/role-policy.json; do not edit this managed section manually.', ...rules.map(rule=>`- [${rule.id}] ${rule.text}`), ...(section === 'global' ? [] : [`- [platform.${platform}] ${policy.platforms[platform].notice}`])];
  if (skillPath !== undefined) { if(typeof skillPath !== 'string' || !skillPath || /[\r\n]/.test(skillPath)) fail('invalid skill path'); lines.push(`- Policy details: \`${skillPath}\`.`); }
  return lines.join('\n');
}
export function replaceManagedPolicyBlocks(text, blocks) {
  if(typeof text !== 'string' || !object(blocks) || !Object.keys(blocks).length) fail('invalid managed block input');
  const tokens = [...text.matchAll(/\[ARC role policy: ([a-z-]+) (begin|end)\]/g)];
  if (tokens.length !== Object.keys(blocks).length * 2 || tokens.some(x=>!Object.hasOwn(blocks,x[1]))) fail('missing or unexpected managed marker');
  const ranges=[];
  for(const [name,body] of Object.entries(blocks)) {
    if(!/^[a-z-]+$/.test(name) || typeof body !== 'string' || body.includes('[ARC role policy:')) fail('invalid managed section');
    const matches=tokens.filter(x=>x[1]===name);
    if(matches.length!==2 || matches[0][2]!=='begin' || matches[1][2]!=='end') fail(`duplicate, missing or reversed ${name} markers`);
    const start=matches[0].index+matches[0][0].length,end=matches[1].index;
    const eol=/\r?\n/.exec(text)?.[0]??'\n';
    if(tokens.some(x=>x.index>=start && x.index<end)) fail('nested managed markers');
    ranges.push({start,end,body:eol+body.replace(/\r?\n/g,eol)+eol});
  }
  let result=text;
  for(const {start,end,body} of ranges.sort((a,b)=>b.start-a.start)) result=result.slice(0,start)+body+result.slice(end);
  return result;
}
export function buildPolicyOutputs(inputs, policy = source) {
  validateRolePolicy(policy);
  if (!(inputs instanceof Map) || inputs.size !== POLICY_TARGETS.length) fail('expected complete target map');
  const outputs=new Map();
  for(const target of POLICY_TARGETS) {
    const bytes=inputs.get(target.path); if(!Buffer.isBuffer(bytes)) fail(`missing target ${target.path}`);
    let text; try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{fail(`invalid UTF-8 target ${target.path}`);}
    if(target.asset==='git') {try{JSON.parse(text);}catch{fail('invalid Git policy asset');}outputs.set(target.path,Buffer.from(JSON.stringify(policy.git,null,2)+'\n'));continue;}
    let rendered=replaceManagedPolicyBlocks(text,{contract:renderPolicySection(policy,{...target,section:'contract'})});
    if(target.platform==='claude' && target.path.startsWith('claude/agents/')) {try{rendered=renderSourceClaudeHook(rendered);}catch{fail('invalid Claude hook wiring');}}
    outputs.set(target.path,Buffer.from(rendered));
  }
  return outputs;
}
