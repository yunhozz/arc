import {RUNTIME_MODULE_PATHS} from '../lib/installer/runtime-assets.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COOPERATIVE_RUNTIME_MODULES} from '../lib/runtime/bootstrap.mjs';
const args=process.argv.slice(2);const i=args.indexOf('--root');
const root=i<0?fileURLToPath(new URL('../',import.meta.url)):path.resolve(args[i+1]);
const check=args.includes('--check');
function safe(filename,directory=false){
 const relative=path.relative(root,filename);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Payload outside root');
 let cursor=root;for(const part of relative.split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);let stat;try{stat=fs.lstatSync(cursor);}catch(error){if(error.code==='ENOENT')continue;throw error;}if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))throw Error(`Unsafe runtime asset: ${cursor}`);}
 if(fs.existsSync(filename)){const s=fs.lstatSync(filename);if(directory?!s.isDirectory():!s.isFile())throw Error(`Unexpected runtime asset type: ${filename}`);}
}
function sources(relative){const dir=path.join(root,relative);safe(dir,true);const result=[];for(const entry of fs.readdirSync(dir).sort()){const rel=path.join(relative,entry);const file=path.join(root,rel);safe(file,fs.lstatSync(file).isDirectory());if(fs.lstatSync(file).isDirectory())result.push(...sources(rel));else if(entry.endsWith('.mjs'))result.push(rel);else throw Error(`Unexpected canonical runtime file: ${rel}`);}return result;}
try{
 safe(root,true);const modules=sources('lib/runtime').map(name=>name.split(path.sep).join('/')).sort();
 for(const name of COOPERATIVE_RUNTIME_MODULES)if(!modules.includes(`lib/runtime/${name}`))throw Error(`Missing runtime module: ${name}`);
 if(modules.length!==RUNTIME_MODULE_PATHS.length||modules.some((name,index)=>name!==RUNTIME_MODULE_PATHS[index]))throw Error('Runtime asset inventory does not match canonical modules');
 const entries=modules.map(name=>[name.slice('lib/runtime/'.length),fs.readFileSync(path.join(root,name))]);
 const policy=path.join(root,'lib/policy/role-policy.json');safe(policy);entries.push(['role-policy.json',fs.readFileSync(policy)]);
 const outputs=[];for(const platform of ['codex','claude'])for(const [name,bytes]of entries){const filename=path.join(root,platform,'skill/runtime',name);safe(filename);outputs.push({filename,bytes});}
 const portable=['operations.mjs','path-core.mjs','schema-core.mjs','policy-core.mjs'];
 for(const name of portable)outputs.push({filename:path.join(root,'claude/plugin/hooks/runtime',name),bytes:fs.readFileSync(path.join(root,'lib/runtime',name))});
 const cooperative=fs.readFileSync(path.join(root,'lib/runtime/cooperative-schema.mjs'),'utf8');
 const sourceImports="import {assertSecretFree} from './external.mjs';\nimport {object,text,validatePlannerLedger} from './schema.mjs';\nimport {absolute,validateWorkflowId} from './scope.mjs';";
 if(!cooperative.includes(sourceImports))throw Error('Portable cooperative schema imports changed');
 const adapted=cooperative.replace(sourceImports,"import {assertSecretFree,object,text,validatePlannerLedger,absolute,validateWorkflowId} from './cooperative-compat.mjs';");
 outputs.push({filename:path.join(root,'claude/plugin/hooks/runtime/cooperative-schema.mjs'),bytes:Buffer.from(adapted)});
 let drift=false;for(const {filename,bytes}of outputs){if(!fs.existsSync(filename)||!fs.readFileSync(filename).equals(bytes)){drift=true;if(!check){fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);}}}
 if(check&&drift){console.error('Runtime payload drift');process.exitCode=1;}else console.log(`Runtime payload ${check?'verified':'generated'} (${outputs.length} files)`);
}catch(error){console.error(error.message);process.exitCode=1;}
