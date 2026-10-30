import {forTarget} from './path-core.mjs';
import {createRuntimeSchema} from './schema-core.mjs';
export const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const text=value=>typeof value==='string'&&value.length>0;
export function absolute(value){try{const path=forTarget(value);return path.isAbsolute(value)&&path.normalize(value)===value;}catch{return false;}}
export function validateWorkflowId(id){if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id))throw Error('Invalid workflow ID');return id;}
const paths={isAbsolute:value=>{try{return forTarget(value).isAbsolute(value);}catch{return false;}},normalize:value=>{try{return forTarget(value).normalize(value);}catch{return value;}},join:(base,...parts)=>forTarget(base).join(base,...parts),relative:(base,value)=>forTarget(base).relative(base,value),separator:base=>forTarget(base).sep};
export const {validatePlannerLedger}=createRuntimeSchema(paths);
export function assertSecretFree(value){
 if(typeof value==='string'){
  if(/(?:[a-z][a-z0-9+.-]*:\/\/|^)[^\s/]+:[^\s/]+@|[?&#](?:access[_-]?token|token|key|password|secret|signature|credential|auth)=|\b(?:Bearer|Basic)\s+\S+/i.test(value))throw Error('Secret-free identifiers required');
 }else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){
  if(/^(?:password|passwd|token|accessToken|access_token|secret|credentials?|authorization|apiKey|api_key|privateKey)$/i.test(key))throw Error('Secret-free identifiers required');assertSecretFree(item);
 }
}
