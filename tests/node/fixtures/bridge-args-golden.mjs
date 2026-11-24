import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildBridgeArgs} from '../../../lib/runtime/role-bridge-args.mjs';

const goldenPath = new URL('./bridge-args-golden.json', import.meta.url);
const profiles = {
  claude: {model: 'm', effort: 'low', tools: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'], instructions: 'I'},
  codex: {model: 'm', effort: 'low', instructions: 'I'},
  gemini: {model: 'm', instructions: 'I'},
  grok: {model: 'm', instructions: 'I'},
};
const readRoles = ['arc_scouter', 'arc_planner', 'arc_reviewer'];
const writeRoles = ['arc_implementer', 'arc_tester'];
const sessionId = '00000000-0000-4000-8000-000000000000';

export function* bridgeArgsCases() {
  for (const [platform, profile] of Object.entries(profiles)) {
    const roles = platform === 'gemini' || platform === 'grok' ? [...readRoles, ...writeRoles] : readRoles;
    for (const role of roles) {
      for (const resume of [false, true]) {
        const key = `${platform}/${role}/${resume ? 'resume' : 'new'}`;
        const inputs = {
          role, profile, worktree: '/w', resultPath: '/r/result.md', policyFile: '/p/policy.toml',
          promptFile: '/r/prompt.md', sandboxProfile: 'arc-bridge-0123abcd',
          sessionId: platform === 'claude' && !resume ? null : sessionId,
          threadId: resume ? 'thread-1' : null, resume,
        };
        yield {key, platform, inputs};
      }
    }
  }
}

export function readBridgeArgsGolden() {
  return JSON.parse(readFileSync(goldenPath, 'utf8'));
}

function main(mode) {
  if (!['--write', '--diff'].includes(mode)) throw new Error('Usage: bridge-args-golden.mjs --write | --diff');
  const combinations = Object.fromEntries(Array.from(bridgeArgsCases(), ({key, platform, inputs}) =>
    [key, buildBridgeArgs(platform, inputs)]));
  if (mode === '--write') {
    writeFileSync(goldenPath, JSON.stringify({base: '6244a8af', combinations}, null, 2) + '\n');
    return;
  }
  const {combinations: golden} = readBridgeArgsGolden();
  for (const key of new Set([...Object.keys(golden), ...Object.keys(combinations)])) {
    if (!Object.hasOwn(golden, key)) console.log(`+ ${key}`);
    else if (!Object.hasOwn(combinations, key)) console.log(`- ${key}`);
    else if (JSON.stringify(golden[key]) !== JSON.stringify(combinations[key])) console.log(`~ ${key}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]);
