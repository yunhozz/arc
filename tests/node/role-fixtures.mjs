// Shared helpers for composite role dispatch tests. Not a test file.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {applyPreset, loadModelConfig, renderProfiles, resolveModelSettings} from '../../lib/models/index.mjs';
import {renameCompositeProfile} from '../../lib/installer/role-routing.mjs';
import {ROUTING_ROLES, serializeRoleRoutingConfig} from '../../lib/runtime/role-routing-config.mjs';
import {cooperativeVersions} from '../../lib/runtime/bootstrap.mjs';

const root = new URL('../../', import.meta.url).pathname;
const digest = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const VALUES = {claude: {model: 'haiku', effort: 'low'}, codex: {model: 'gpt-6-luna', effort: 'low'}};

async function copyRuntime(home) {
  const target = path.join(home, 'skills', 'arc', 'runtime');
  await fs.mkdir(target, {recursive: true});
  await fs.cp(path.join(root, 'lib/runtime'), target, {recursive: true});
  await fs.copyFile(path.join(root, 'lib/policy/role-policy.json'), path.join(target, 'role-policy.json'));
}

async function renderPlatform(platform, config) {
  const ext = platform === 'codex' ? 'toml' : 'md', field = platform === 'codex' ? 'model_reasoning_effort' : 'effort';
  const inputs = {};
  for (const role of ['scouter', 'planner', 'implementer', 'qa', 'reviewer']) {
    const name = `arc-${role}.${ext}`;
    inputs[name] = await fs.readFile(path.join(root, platform, 'agents', name));
  }
  const base = loadModelConfig(await fs.readFile(path.join(root, platform, 'skill/models.toml'), 'utf8'), platform);
  const settings = resolveModelSettings(applyPreset(base, 'smart'));
  for (const role of ROUTING_ROLES) if (config.roles[role].platform === platform) settings.roles[role] = {model: config.roles[role].model, [field]: config.roles[role].effort};
  const rendered = renderProfiles(inputs, settings), result = {};
  for (const role of ROUTING_ROLES) if (config.roles[role].platform === platform) result[role] = renameCompositeProfile(rendered.get(`${role.replace('_', '-')}.${ext}`), platform, role);
  return result;
}

/** roles: {arc_qa:'codex'} assigns that role to a platform; every other role stays on hostPlatform. */
export async function createRoutingFixture(t, {roles = {}, hostPlatform = 'claude', limits = {total: 100, concurrent: 5}, revision = 'rev-1'} = {}) {
  const base = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'arc-route-'));
  // Tests may chmod directories; restore permissions before removing so a failing test leaves nothing behind.
  t.after(async () => { spawnSync('chmod', ['-R', 'u+rwx', base]); await fs.rm(base, {recursive: true, force: true}); });
  const userHome = path.join(base, 'home'), codexHome = path.join(userHome, '.codex'), claudeHome = path.join(userHome, '.claude');
  const cwd = path.join(base, 'repo'), binDir = path.join(base, 'bin');
  for (const dir of [codexHome, claudeHome, cwd, binDir]) await fs.mkdir(dir, {recursive: true});
  for (const args of [['init', '-q'], ['config', 'user.email', 't@example.com'], ['config', 'user.name', 't'], ['commit', '-q', '--allow-empty', '-m', 'init']]) {
    const r = spawnSync('git', args, {cwd, encoding: 'utf8'}); if (r.status !== 0) throw Error(r.stderr);
  }
  const config = {version: 1, revision, roles: {}};
  for (const role of ROUTING_ROLES) { const platform = roles[role] ?? hostPlatform; config.roles[role] = {platform, ...VALUES[platform]}; }
  const configBytes = Buffer.from(serializeRoleRoutingConfig(config)), activePath = path.join(codexHome, 'arc-role-platform-routing.json');
  await fs.writeFile(activePath, configBytes);
  const versions = await cooperativeVersions(), homes = {codex: codexHome, claude: claudeHome};
  for (const platform of ['codex', 'claude']) {
    const home = homes[platform];
    await copyRuntime(home);
    await fs.mkdir(path.join(home, 'agents'), {recursive: true});
    const profiles = {}, rendered = await renderPlatform(platform, config);
    for (const [role, bytes] of Object.entries(rendered)) {
      const relative = `agents/arc-routing-${role.slice(4)}.${platform === 'codex' ? 'toml' : 'md'}`;
      await fs.writeFile(path.join(home, relative), bytes);
      profiles[role] = {path: relative, hash: digest(bytes)};
    }
    const policy = await fs.readFile(path.join(home, 'skills/arc/runtime/role-policy.json'));
    const marker = {version: 1, revision, platform, targetHome: home, activeConfigPath: activePath, configHash: digest(configBytes), runtime: {version: versions.runtime, hash: versions.runtimeHash, policyHash: digest(policy)}, profiles};
    await fs.writeFile(path.join(home, 'arc-role-platform-routing.prepared.json'), JSON.stringify(marker, null, 2) + '\n');
  }
  const {serializeLimits} = await import('../../lib/installer/limits.mjs');
  await fs.mkdir(path.join(homes[hostPlatform], 'skills/arc'), {recursive: true});
  await fs.writeFile(path.join(homes[hostPlatform], 'skills/arc/limits.toml'), serializeLimits({version: 1, max_total_subagents: limits.total, max_concurrent_subagents: limits.concurrent}));
  const env = {PATH: `${binDir}${path.delimiter}/usr/bin${path.delimiter}/bin`, HOME: userHome, CODEX_HOME: codexHome};
  const fixture = {base, userHome, codexHome, claudeHome, cwd, binDir, env, revision, config, hostPlatform, activePath, homes,
    context: (overrides = {}) => ({cwd, userHome, env: fixture.env, hostPlatform, executionEnvironment: `${hostPlatform}-cli`, workflowId: 'wf-1', ...overrides}),
    cli(platform, scenario = {}) { const cli = installFakeCli(t, binDir, platform, scenario); return cli.then(value => { fixture.env = {...fixture.env, [value.envName]: value.scenarioPath}; return value; }); }
  };
  return fixture;
}

const FAKE_SOURCE = `#!${process.execPath}
const fs=require('node:fs'),cp=require('node:child_process');
const platform=process.env.ARC_FAKE_CLI_PLATFORM_NAME||require('node:path').basename(process.argv[1]);
const scenarioFile=process.env['ARC_FAKE_CLI_SCENARIO_'+platform.toUpperCase()];
const scenario=scenarioFile&&fs.existsSync(scenarioFile)?JSON.parse(fs.readFileSync(scenarioFile,'utf8')):{};
const args=process.argv.slice(2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const auth=args[0]==='auth'&&args[1]==='status'||args[0]==='login'&&args[1]==='status';
 if(auth){
  const mode=scenario.auth??'ok';
  if(mode==='hang')return setInterval(()=>{},1000);
  if(mode==='error'){process.stderr.write('boom');process.exit(2);}
  if(platform==='codex'){if(mode==='ok'){process.stdout.write('Logged in');process.exit(0);}process.stderr.write('Not logged in');process.exit(1);}
  process.stdout.write(JSON.stringify({loggedIn:mode==='ok'}));process.exit(mode==='ok'?0:1);
 }
 if(args.length===1&&args[0]==='--version'){process.stdout.write(String(scenario.version??'0.0.0'));process.exit(0);}
 let stdin='';try{stdin=fs.readFileSync(0,'utf8');}catch{}
 if(scenario.recordPath)fs.appendFileSync(scenario.recordPath,JSON.stringify({argv:args,stdin,cwd:process.cwd(),pid:process.pid,bridgeChild:process.env.ARC_BRIDGE_CHILD||null})+'\\n');
 if(scenario.outputFile!==undefined){const at=args.indexOf('-o');if(at>=0)fs.writeFileSync(args[at+1],scenario.outputFile);}
 if(scenario.ignoreSigterm)process.on('SIGTERM',()=>{});
 for(const file of scenario.writes??[])fs.mkdirSync(require('node:path').dirname(file.path),{recursive:true}),fs.writeFileSync(file.path,file.content);
 if(scenario.grandchild){const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});if(scenario.grandchildPidFile)fs.writeFileSync(scenario.grandchildPidFile,String(child.pid));}
 if(scenario.delayMs)await sleep(scenario.delayMs);
 for(const line of scenario.events??[])process.stdout.write((typeof line==='string'?line:JSON.stringify(line))+'\\n');
 if(scenario.stderr)process.stderr.write(scenario.stderr);
 await new Promise(r=>process.stdout.write('',r));await new Promise(r=>process.stderr.write('',r));
 if(scenario.hang)return setInterval(()=>{},1000);
 process.exit(scenario.exitCode??0);
})();
`;

/** Installs a fake CLI executable. Scenario JSON is re-read on each call from ARC_FAKE_CLI_SCENARIO_<PLATFORM>. */
export async function installFakeCli(t, binDir, platform, scenario = {}) {
  await fs.mkdir(binDir, {recursive: true});
  const scenarioPath = path.join(binDir, `.scenario-${platform}.json`), recordPath = path.join(binDir, `.record-${platform}.jsonl`);
  const setScenario = async value => fs.writeFile(scenarioPath, JSON.stringify({...value, recordPath}));
  await setScenario(scenario);
  await fs.writeFile(path.join(binDir, platform), FAKE_SOURCE, {mode: 0o755});
  return {recordPath, scenarioPath, envName: `ARC_FAKE_CLI_SCENARIO_${platform.toUpperCase()}`, setScenario};
}
