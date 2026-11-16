import fs from 'node:fs';
import path from 'node:path';
import {createInstallerRegistry} from '../../../lib/platforms/index.mjs';
import {createPlatformRegistry} from '../../../lib/runtime/platform-registry.mjs';
import {resolveTargets} from '../../../lib/installer/targets.mjs';
import {readInstallMode} from '../../../lib/installer/install-mode.mjs';
import * as management from '../../../lib/management/operations.mjs';
import {mixedConfig} from './install-mode.mjs';
import {zetaContext, installAll} from './platforms/package-root.mjs';
import {createTestRegistries} from './platforms/zeta.mjs';

export function migrationRegistries() {
  const original = createTestRegistries();
  const runtimePlatforms = createPlatformRegistry(original.runtimePlatforms.byAnchorOrder().map(descriptor => ({
    ...descriptor, anchorOrder: descriptor.id === 'claude' ? 0 : descriptor.id === 'codex' ? 1 : descriptor.anchorOrder,
  })));
  const platforms = createInstallerRegistry({runtime: runtimePlatforms, descriptors: runtimePlatforms.byAnchorOrder().map(runtime => ({
    ...original.platforms.getPlatform(runtime.id), runtime,
  }))});
  return {platforms, runtimePlatforms};
}

export const activePath = (context, id) => path.join(resolveTargets(context).targets[id].home, 'arc-role-platform-routing.json');
export const markerPath = (context, id) => path.join(resolveTargets(context).targets[id].home, 'arc-role-platform-routing.prepared.json');
export const legacyState = context => readInstallMode({...context, ...resolveTargets(context)});

export async function legacyComposite(t, {operational = false} = {}) {
  const context = await zetaContext(t);
  await installAll(context, ['codex', 'claude', 'zeta']);
  const prepared = await management.prepareCompositeOperation(context, {kind: 'install', platforms: ['codex', 'claude'], config: await mixedConfig('legacy-v1')});
  const result = await management.executeCompositeOperation(context, prepared);
  if (result.code !== 0) throw result.error ?? Error('Legacy fixture publication failed');
  if (!operational) Object.assign(context, migrationRegistries());
  return context;
}

export function homeBytes(home) {
  const result = {};
  function visit(relative) {
    const filename = path.join(home, relative), stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) result[relative] = ['link', fs.readlinkSync(filename)];
    else if (stat.isDirectory()) { result[relative] = ['directory']; for (const name of fs.readdirSync(filename).sort()) visit(path.join(relative, name)); }
    else result[relative] = ['file', fs.readFileSync(filename).toString('hex')];
  }
  if (fs.existsSync(home)) visit('');
  return result;
}

export const legacyLease = (dispatchId, state = 'reserved', route = 'native', version = 1) => ({
  version, ...(version === 2 ? {targetPlatform: route === 'native' ? 'claude' : 'codex'} : {}),
  dispatchId, workflowId: 'legacy', taskId: 'T7', requestId: dispatchId, role: 'arc_planner', route,
  hostPlatform: 'claude', executionEnvironment: 'claude-cli', revision: 'legacy-v1', profileHash: null, argsDigest: null,
  state, supervisor: null, child: null, sessionId: null, timeoutMinutes: 20, claims: null, reasons: [], allowedPaths: [],
  resultPath: null, segment: 0, nativeAgentId: null, createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z',
});
