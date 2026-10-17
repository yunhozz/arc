import {parseToml} from '../models/config.mjs';
import {resolveLimits} from '../limits.mjs';
function validate(data) {
 const keys=['version','max_total_subagents','max_concurrent_subagents'];
 if(!data||Object.keys(data).length!==3||keys.some(key=>!Object.hasOwn(data,key))||data.version!==1n&&data.version!==1)throw new Error('Invalid limits schema or version');
 const value={version:1};
 for(const key of keys.slice(1)) {
  const raw=data[key];
  if(typeof raw!=='bigint'&&typeof raw!=='number'||raw<1||raw>Number.MAX_SAFE_INTEGER)throw new Error(`Invalid ${key}`);
  value[key]=Number(raw);
 }
 return resolveLimits({existing:value});
}
export function parseLimits(bytes) {
 if(!Buffer.isBuffer(bytes))throw new Error('Limits must be bytes');
 return validate(parseToml(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)));
}
export function serializeLimits(limits) {
 const value=validate(limits);
 return Buffer.from(`version = 1\nmax_total_subagents = ${value.max_total_subagents}\nmax_concurrent_subagents = ${value.max_concurrent_subagents}\n`);
}
