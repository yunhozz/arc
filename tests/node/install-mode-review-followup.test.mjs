import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as api from '../../lib/management/operations.mjs';
import {collectStatus} from '../../lib/management/status.mjs';
import {collectInstalledState} from '../../lib/installer/upgrade-state.mjs';
import {loadModelConfig} from '../../lib/models/index.mjs';
import {loadStaticModelCatalog} from '../../lib/models/static-catalog.mjs';
import {resultRows} from '../../lib/tui/app.mjs';
import {compositeContext,standalone,publish,profileFiles,targets} from './fixtures/install-mode.mjs';

for(const mode of ['composite','unverified'])test(`all install and preset refuse ${mode} without writes`,async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);assert.equal((await publish(ctx)).code,0);
 if(mode==='unverified')fs.appendFileSync(ctx.userHome+'/.codex/arc-role-platform-routing.json','invalid');
 const before=profileFiles(ctx),models=['codex','claude'].map(p=>fs.readFileSync(ctx.userHome+'/.'+p+'/skills/arc/models.toml'));
 for(const kind of ['install','preset'])for(const switchFromComposite of [false,true])await t.test(`${kind} switch=${switchFromComposite}`,async()=>assert.rejects(api.prepareOperation(ctx,{kind,target:'all',switchFromComposite}),{code:'ARC_TARGET_CONFIGURATION',message:mode==='composite'?'Claude & Codex is active; confirm the switch first':'Claude & Codex configuration cannot be verified.'}));
 assert.deepEqual(profileFiles(ctx),before);for(const [i,p]of ['codex','claude'].entries())assert.deepEqual(fs.readFileSync(ctx.userHome+'/.'+p+'/skills/arc/models.toml'),models[i]);
 // Everything retains the removal path even when verification fails.
 assert.equal((await api.prepareOperation(ctx,{kind:'uninstall',target:'all',removeCli:false})).kind,'uninstall');
});

for(const platform of ['codex','claude'])test(`${platform} Change Models preserves unowned profiles and reports residuals without blocking`,async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const target=targets(ctx)[platform],dir=path.join(target.home,'agents'),ext=platform==='codex'?'toml':'md';
 const contractless=path.join(dir,'arc-scouter.'+ext),renamed=path.join(dir,'arc-planner.'+ext),link=path.join(dir,'arc-qa.'+ext),outside=path.join(ctx.userHome,'outside');
 fs.writeFileSync(contractless,'');fs.writeFileSync(renamed,fs.readFileSync(renamed,'utf8').replace(platform==='codex'?'name = "arc_planner"':'name: arc-planner',platform==='codex'?'name = "arc_qa"':'name: arc-qa'));fs.writeFileSync(outside,'user data');fs.unlinkSync(link);fs.symlinkSync(outside,link);
 const saved=fs.readFileSync(renamed),catalog=(await loadStaticModelCatalog(platform)).catalog,pair=catalog.pairs.find(p=>p.model==='gpt-6.1-sol')??catalog.pairs[0],modelsPath=path.join(target.home,'skills/arc/models.toml'),config=loadModelConfig(fs.readFileSync(modelsPath),platform);
 const roles=Object.fromEntries(Object.keys(config.roles).map(r=>[r,{model:pair.model,[platform==='codex'?'model_reasoning_effort':'effort']:pair.effort}]));
 const prepared=await api.prepareOperation(ctx,{kind:'preset',target:platform,roles,verifiedCatalog:catalog});
 const result=await api.executeOperation(ctx,prepared);assert.equal(result.code,0,JSON.stringify(result));assert.deepEqual(result.results[0].residualPaths.sort(),[contractless,renamed,link].sort());
 assert.equal(fs.readFileSync(contractless,'utf8'),'');assert.deepEqual(fs.readFileSync(renamed),saved);assert.equal(fs.readlinkSync(link),outside);assert.equal(fs.readFileSync(outside,'utf8'),'user data');
 assert.deepEqual(loadModelConfig(fs.readFileSync(modelsPath),platform).roles,roles);const good=fs.readFileSync(path.join(dir,'arc-implementer.'+ext),'utf8');assert.ok(good.includes(pair.model));
 const status=(await collectStatus(ctx)).find(s=>s.platform===platform);assert.equal(status.state,'installed');assert.deepEqual(status.residualPaths.sort(),[contractless,renamed,link].sort());
 const state=collectInstalledState(ctx),entry=state.targets.find(e=>e.target.platform===platform);assert.ok(entry);assert.deepEqual(entry.residualPaths.sort(),[contractless,renamed,link].sort());
});

for(const platform of ['codex','claude'])test(`${platform} explicit install roles repair corrupt installed models`,async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const filename=path.join(targets(ctx)[platform].home,'skills/arc/models.toml'),roles=loadModelConfig(fs.readFileSync(filename),platform).roles,catalog=(await loadStaticModelCatalog(platform)).catalog;
 fs.writeFileSync(filename,'broken = [');const prepared=await api.prepareOperation(ctx,{kind:'install',target:platform,roles,verifiedCatalog:catalog});const result=await api.executeOperation(ctx,prepared);assert.equal(result.code,0);assert.deepEqual(loadModelConfig(fs.readFileSync(filename),platform).roles,roles);
});

test('standalone to composite Install displays each residual path once',async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const filename=ctx.userHome+'/.claude/agents/arc-qa.md';fs.writeFileSync(filename,'user profile');const result=await publish(ctx);assert.equal(result.code,0,JSON.stringify(result));assert.equal(resultRows(result).filter(row=>row==='Residual path: '+filename).length,1);
});

for(const platform of ['codex','claude'])test(`${platform} occupied unowned profile paths remain installed and are residuals`,async t=>{
 const ctx=await compositeContext(t);await standalone(ctx);const target=targets(ctx)[platform],filename=path.join(target.home,'agents',target.profileNames[0]);
 for(const kind of ['empty','symlink'])await t.test(kind,async()=>{
  fs.unlinkSync(filename);if(kind==='empty')fs.writeFileSync(filename,'');else fs.symlinkSync(path.join(ctx.userHome,'missing-user-target'),filename);
  const status=(await collectStatus(ctx)).find(s=>s.platform===platform);assert.equal(status.state,'installed');assert.deepEqual(status.residualPaths,[filename]);
  const entry=collectInstalledState(ctx).targets.find(e=>e.target.platform===platform);assert.ok(entry);assert.deepEqual(entry.residualPaths,[filename]);
 });
});

for(const platform of ['codex','claude'])test(`${platform} unowned profile on an absent target survives the other platform upgrade`,async t=>{
 const {buildUpgradePlans}=await import('../../lib/installer/upgrade.mjs'),{installTargets}=await import('../../lib/installer/install.mjs'),{verifyPayload}=await import('../../lib/installer/manifest.mjs');
 const ctx=await compositeContext(t);await standalone(ctx);assert.equal((await api.executeOperation(ctx,await api.prepareOperation(ctx,{kind:'uninstall',target:platform,removeCli:false}))).code,0);
 const target=targets(ctx)[platform],filename=path.join(target.home,'agents',target.profileNames[0]);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,'user profile');
 const state=collectInstalledState(ctx);assert.deepEqual(state.residualPaths,[filename]);const plans=buildUpgradePlans({payload:verifyPayload(ctx),state,safeFs:ctx.safeFs});assert.deepEqual(plans.map(plan=>plan.target.platform),[platform==='codex'?'claude':'codex']);
 const result=await installTargets(plans,{safeFs:ctx.safeFs});assert.ok(result.results.every(item=>item.status==='installed'&&!item.error));assert.equal(fs.readFileSync(filename,'utf8'),'user profile');assert.equal(fs.existsSync(path.join(target.home,'skills/arc')),false);
});
