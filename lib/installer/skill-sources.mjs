export const SHARED_SKILL_PREFIX='shared/skill/';
export const GENERATED_SKILL_FILES=Object.freeze(['SKILL.md','models.toml','settings.toml','limits.toml']);

export function composeSkillSources(files,platform,context={}){
 if(!(files instanceof Map))throw Error('Invalid skill source files');
 const descriptor=installerRegistryOf(context).getPlatform(platform);if(!descriptor)throw Error(`Invalid skill source platform: ${platform}`);
 const shared=new Map(),selected=new Map(),prefix=descriptor.payloadPrefix+'/skill/';
 for(const [name,bytes]of files){
  if(name.startsWith(SHARED_SKILL_PREFIX))shared.set(name.slice(SHARED_SKILL_PREFIX.length),bytes);
  else if(name.startsWith(prefix))selected.set(name.slice(prefix.length),bytes);
 }
 const compare=(a,b)=>a<b?-1:a>b?1:0,sharedNames=[...shared.keys()].sort(compare);
 for(const name of sharedNames)if(selected.has(name))throw Error(`Skill source conflict (C1 same path): ${name}`);
 for(const name of sharedNames)if(GENERATED_SKILL_FILES.some(generated=>name===generated||name.startsWith(generated+'/')))throw Error(`Skill source conflict (C2 generated file): ${name}`);
 const union=new Map([...shared,...selected]),names=[...union.keys()].sort(compare);
 for(const name of names){
  const parts=name.split('/');for(let i=1;i<parts.length;i++){
   const parent=parts.slice(0,i).join('/');
   if(union.has(parent)&&(shared.has(parent)||shared.has(name)))throw Error(`Skill source conflict (C3 file/directory prefix): ${parent} vs ${name}`);
  }
 }
 return new Map(names.map(name=>[name,Buffer.from(union.get(name))]));
}
import {installerRegistryOf} from '../platforms/index.mjs';
