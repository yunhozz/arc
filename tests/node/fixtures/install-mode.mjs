import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openRoot} from '../../../lib/safe-fs/index.mjs';
import {loadNative} from '../../../lib/safe-fs/native.mjs';
import {staticPackageFixture,sourceRoot} from './static-references.mjs';
import {installFakeCli} from '../role-fixtures.mjs';
import * as api from '../../../lib/management/operations.mjs';
import {resolveTarget} from '../../../lib/installer/targets.mjs';
import {isOwnedStandaloneProfile,readInstallMode,inspectStandaloneProfile} from '../../../lib/installer/install-mode.mjs';
import {collectStatus} from '../../../lib/management/status.mjs';
import {collectInstalledState} from '../../../lib/installer/upgrade-state.mjs';
import {buildUpgradePlans} from '../../../lib/installer/upgrade.mjs';
import {installTargets} from '../../../lib/installer/install.mjs';
import {verifyPayload} from '../../../lib/installer/manifest.mjs';
import {prepareCompositeDeactivation} from '../../../lib/installer/role-routing.mjs';
import {renderLanguagePolicy} from '../../../lib/installer/language.mjs';
const native=loadNative({artifactDirectory:'build/native'}),safeFs={openRoot:p=>openRoot(p,{native})};
const roles=['scouter','planner','implementer','qa','reviewer'];
async function compositeContext(t){
 const userHome=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'arc-mode-')));t.after(()=>fs.rmSync(userHome,{recursive:true,force:true}));
 const context={packageRoot:staticPackageFixture(t),userHome,cwd:userHome,env:{PATH:userHome+'/bin:/usr/bin:/bin'},safeFs};
 for(const platform of ['codex','claude'])await installFakeCli(t,userHome+'/bin',platform);
 return context;
}
const targets=ctx=>Object.fromEntries(['codex','claude'].map(p=>[p,resolveTarget(p,ctx)]));
const agents=(ctx,p)=>fs.readdirSync(ctx.userHome+'/.'+p+'/agents').sort();
async function mixedConfig(revision){
 const {loadStaticModelCatalog}=await import('../../../lib/models/static-catalog.mjs');const pairs={};for(const p of ['codex','claude'])pairs[p]=(await loadStaticModelCatalog(p)).catalog.pairs[0];
 return{version:1,revision,roles:Object.fromEntries(roles.map(r=>{const platform=['planner','reviewer'].includes(r)?'claude':'codex';return['arc_'+r,{platform,...pairs[platform]}];}))};
}
async function standalone(ctx){assert.equal((await api.executeOperation(ctx,await api.prepareOperation(ctx,{kind:'install',target:'all',language:'en'}))).code,0);}
async function publish(ctx,revision='mode-1',kind='install'){return api.executeOperation(ctx,await api.prepareCompositeOperation(ctx,{kind,config:await mixedConfig(revision)}));}


const profileFiles=ctx=>Object.fromEntries(['codex','claude'].flatMap(p=>agents(ctx,p).map(n=>[p+'/'+n,fs.readFileSync(ctx.userHome+'/.'+p+'/agents/'+n).toString('hex')])));
const standaloneNames=p=>roles.map(r=>'arc-'+r+(p==='codex'?'.toml':'.md')).sort();









async function switched(ctx,kind='install',extra={}){return api.executeOperation(ctx,await api.prepareOperation(ctx,{kind,target:'codex',language:'en',removeCli:false,switchFromComposite:true,...extra}));}
function assertStandalone(ctx){assert.equal(readInstallMode({...ctx,targets:targets(ctx)}).mode,'standalone');for(const p of ['codex','claude'])assert.deepEqual(agents(ctx,p),standaloneNames(p));}
export {safeFs,roles,compositeContext,targets,agents,mixedConfig,standalone,publish,profileFiles,standaloneNames,switched,assertStandalone};
