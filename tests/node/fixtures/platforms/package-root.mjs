import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {staticPackageFixture, refreshManifest} from '../static-references.mjs';
import {createTestRegistries} from './zeta.mjs';
import {installFakeCli} from '../../role-fixtures.mjs';
import {safeFs} from '../install-mode.mjs';
import {renderManifest, verifyPayload, LOCAL_UPDATER_PATH} from '../../../../lib/installer/manifest.mjs';
import {resolveTarget} from '../../../../lib/installer/targets.mjs';
import {buildInstallPlan} from '../../../../lib/installer/plan.mjs';
import {installTargets} from '../../../../lib/installer/install.mjs';

export function zetaPackageFixture(t) {
  const root = staticPackageFixture(t), {platforms} = createTestRegistries();
  fs.cpSync(path.join(root, 'claude'), path.join(root, 'zeta'), {recursive: true});
  refreshManifest(root);
  const files = new Map(), excluded = new Set(['.DS_Store', '__pycache__', 'build']);
  function visit(relative) {
    const filename = path.join(root, relative);
    if (!fs.existsSync(filename)) return;
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) throw Error(`Protected payload contains symlink: ${relative}`);
    if (relative === LOCAL_UPDATER_PATH) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(filename).sort()) if (!excluded.has(name)) visit(`${relative}/${name}`);
    } else if (stat.isFile()) files.set(relative, fs.readFileSync(filename));
    else throw Error(`Protected payload is not regular: ${relative}`);
  }
  for (const name of ['README.md', 'install.command', 'package.json', 'native/binding.c', 'native/binding.gyp', 'bin', 'lib', 'scripts', 'vendor', 'prebuilds', 'shared/skill', ...platforms.byAnchorOrder().flatMap(({payloadPrefix}) => [`${payloadPrefix}/skill`, `${payloadPrefix}/agents`])]) visit(name);
  fs.writeFileSync(path.join(root, 'MANIFEST.sha256'), renderManifest(files, {platforms}));
  return root;
}

export async function zetaContext(t) {
  const userHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'arc-zeta-')));
  t.after(() => fs.rmSync(userHome, {recursive: true, force: true}));
  const bin = path.join(userHome, 'bin');
  for (const id of ['codex', 'claude']) await installFakeCli(t, bin, id);
  fs.writeFileSync(path.join(bin, 'zeta'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
  return {packageRoot: zetaPackageFixture(t), userHome, cwd: userHome, safeFs, ...createTestRegistries(), env: {HOME: userHome, CODEX_HOME: path.join(userHome, '.codex'), ZETA_HOME: path.join(userHome, '.zeta'), PATH: `${bin}:/usr/bin:/bin`}};
}

export async function installAll(ctx, ids) {
  const payload = verifyPayload(ctx);
  const plans = ids.map(id => buildInstallPlan({...ctx, payload, target: resolveTarget(id, ctx)}));
  const result = await installTargets(plans, ctx);
  for (const item of result.results) assert.equal(item.status, 'installed', item.error?.stack);
  return result;
}
