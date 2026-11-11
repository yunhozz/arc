import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../../lib/safe-fs/index.mjs';
import {loadNative} from '../../lib/safe-fs/native.mjs';
import {staticPackageFixture,sourceRoot} from './fixtures/static-references.mjs';
import {installFakeCli} from './role-fixtures.mjs';
import * as api from '../../lib/management/operations.mjs';
import {resolveTarget} from '../../lib/installer/targets.mjs';
import {isOwnedStandaloneProfile,readInstallMode,inspectStandaloneProfile} from '../../lib/installer/install-mode.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {buildUpgradePlans} from '../../lib/installer/upgrade.mjs';
import {installTargets} from '../../lib/installer/install.mjs';
import {verifyPayload} from '../../lib/installer/manifest.mjs';
import {prepareCompositeDeactivation} from '../../lib/installer/role-routing.mjs';
import {renderLanguagePolicy} from '../../lib/installer/language.mjs';
import {safeFs,roles,compositeContext,targets,agents,mixedConfig,standalone,publish,profileFiles,standaloneNames,switched,assertStandalone} from './fixtures/install-mode.mjs';

test('uninstall one platform during composite leaves the other standalone',async t=>{
 for(const platform of ['codex','claude']){const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const result=await switched(ctx,'uninstall',{target:platform});assert.equal(result.code,0,JSON.stringify(result));const other=platform==='codex'?'claude':'codex';assert.equal(fs.existsSync(ctx.userHome+'/.'+platform+'/skills/arc'),false);assert.deepEqual(agents(ctx,platform),[]);assert.deepEqual(agents(ctx,other),standaloneNames(other));assert.equal((await collectStatus(ctx)).find(s=>s.platform===other).state,'installed');}
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const prepared=await api.prepareOperation(ctx,{kind:'uninstall',target:'all',removeCli:false});assert.equal(prepared.kind,'uninstall');assert.equal((await api.executeOperation(ctx,prepared)).code,0);
});
test('composite single uninstall preserves unowned profiles as residuals',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);await publish(ctx);const filename=ctx.userHome+'/.codex/agents/arc-qa.toml';fs.writeFileSync(filename,'mine\n');const result=await switched(ctx,'uninstall');assert.equal(result.code,0,JSON.stringify(result));assert.equal(fs.readFileSync(filename,'utf8'),'mine\n');assert.ok(result.results[0].residualPaths.includes(filename));
});
