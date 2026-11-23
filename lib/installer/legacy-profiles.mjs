import path from 'node:path';
import {openRoot} from '../safe-fs/index.mjs';
import {installerRegistryOf} from '../platforms/index.mjs';
import {standaloneProfileFile,routingProfileFile} from '../runtime/platform-registry.mjs';
import {inspectPath} from './targets.mjs';

export const legacyRole = 'arc_qa';

function profileNames(descriptor) {
 const {profile}=descriptor.runtime;
 return {
  standalone: new Set([standaloneProfileFile(descriptor.runtime,legacyRole),`${profile.standaloneName(legacyRole)}.${profile.ext}`]),
  routing: new Set([routingProfileFile(descriptor.runtime,legacyRole),`${profile.routingName(legacyRole)}.${profile.ext}`]),
 };
}

export function legacyProfileNames(platform,{platforms}={}) {
 const descriptor=installerRegistryOf({platforms}).getPlatform(platform);
 if(!descriptor)return [];
 const {standalone,routing}=profileNames(descriptor);
 return [...new Set([...standalone,...routing])];
}

export function legacyRoutingNames(platform,context) {
 const descriptor=installerRegistryOf(context).getPlatform(platform);
 return descriptor?[...profileNames(descriptor).routing]:[];
}

// Planning entry points are synchronous and share the ownership snapshot with the transaction.
export function inspectLegacyProfiles({platform,agentsDir,mode,safeFs={openRoot},snapshot=new Map(),platforms}) {
 const remove=[],residual=[],descriptor=installerRegistryOf({platforms}).getPlatform(platform);
 if(!descriptor)return {remove,residual};
 const {standalone,routing}=profileNames(descriptor);
 const candidates=new Map();
 for(const name of new Set([...standalone,...routing])) {
  const filename=path.resolve(agentsDir,name);
  const file=inspectPath(safeFs,filename,{kind:'file',read:true,allowLeafLink:true,snapshot:candidates});
  if(!file.exists)continue;
  const metadata=candidates.get(filename);
  snapshot.set(filename,metadata);
  const owned=file.type==='file'&&(routing.has(name)
   ? filename===mode?.profile?.path&&'sha256:'+metadata.sha256===mode.profile.hash
   : descriptor.profiles.isOwnedStandalone(file.bytes,legacyRole,{legacy:true}));
  (owned?remove:residual).push(filename);
 }
 return {remove,residual};
}

export async function classifyLegacyProfiles(options) {
 return inspectLegacyProfiles(options);
}
