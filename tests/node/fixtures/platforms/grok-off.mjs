import fs from 'node:fs';
import path from 'node:path';
import {createPlatformRegistry, DEFAULT_PLATFORM_REGISTRY} from '../../../../lib/runtime/platform-registry.mjs';
import {createInstallerRegistry, DEFAULT_INSTALLER_REGISTRY} from '../../../../lib/platforms/index.mjs';

export const GROK_OFF_REASONS = Object.freeze({
  install: 'install layout not verified', nativeProfile: 'native profile format not verified',
  catalog: 'catalog not verified', standalone: 'standalone not verified',
  bridge: 'bridge contract not verified', compositeRole: 'composite role not verified',
  compositeHost: 'composite host not verified', authProbe: 'no official auth status command',
  watch: 'watch support out of scope',
});

export function grokOffRegistries() {
  const runtimePlatforms = createPlatformRegistry(DEFAULT_PLATFORM_REGISTRY.platforms.map(runtime => runtime.id === 'grok' ? {
    ...runtime, capabilities: Object.fromEntries(Object.entries(GROK_OFF_REASONS).map(([key, reason]) => [key, {state: 'off', reason}])),
  } : runtime));
  const platforms = createInstallerRegistry({runtime: runtimePlatforms, descriptors: runtimePlatforms.platforms.map(runtime => ({
    ...DEFAULT_INSTALLER_REGISTRY.getPlatform(runtime.id), runtime,
  }))});
  return {runtimePlatforms, platforms};
}

export function writeFakeGrokCli({bin, marker, version = '1.0.89'}) {
  const filename = path.join(bin, 'grok');
  fs.mkdirSync(bin, {recursive: true});
  fs.writeFileSync(filename, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${marker}'\nprintf 'grok ${version} (test)\\n'\n`, {mode: 0o755});
  return filename;
}
