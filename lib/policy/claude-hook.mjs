import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Only this fixed bootstrap is executed. The separately encoded path is data.
const bootstrap="import(Buffer.from(process.argv[1],'base64').toString('utf8')).then(module=>module.runHook()).catch(()=>{process.stderr.write('ARC Git guard failed to load\\n');process.exitCode=2;});";
const prefix=`node -e "eval(Buffer.from('${Buffer.from(bootstrap).toString('base64')}','base64').toString('utf8'))" `;
export function buildClaudeHookCommand(scriptPath) {
  if(typeof scriptPath!=='string'||/[\x00-\x1f]/.test(scriptPath)||!path.isAbsolute(scriptPath)&&!path.win32.isAbsolute(scriptPath))throw Error('Claude hook requires an absolute script path');
  let url;
  if(path.win32.isAbsolute(scriptPath)&&/^[A-Za-z]:[\\/]/.test(scriptPath)) {
    const normalized=path.win32.normalize(scriptPath).replaceAll('\\','/');url='file:///'+normalized.split('/').map((part,i)=>i===0?part:encodeURIComponent(part)).join('/');
  } else {if(!path.isAbsolute(scriptPath)||path.normalize(scriptPath)!==scriptPath)throw Error('Invalid absolute hook path');url=pathToFileURL(scriptPath).href;}
  return prefix+`"${Buffer.from(url).toString('base64')}"`;
}
export const templateHookCommand=buildClaudeHookCommand('/__ARC_INSTALLED_SKILL__/hooks/role-git-guard.mjs');
export function validateClaudeHookCommand(command) {
  if(typeof command!=='string'||!command.startsWith(prefix))throw Error('Unmanaged Claude hook command');
  const encoded=/^"([A-Za-z0-9+/]+={0,2})"$/.exec(command.slice(prefix.length));if(!encoded)throw Error('Invalid Claude hook command');
  const decoded=Buffer.from(encoded[1],'base64');if(decoded.toString('base64')!==encoded[1])throw Error('Invalid hook path encoding');
  const url=new URL(decoded.toString('utf8'));if(url.protocol!=='file:'||url.host||!['/hooks/role-git-guard.mjs','/hooks/runtime-gate.mjs'].some(suffix=>url.pathname.endsWith(suffix))||url.search||url.hash)throw Error('Invalid hook file URL');
  return command;
}
function entry(command,matcher,eol){
 validateClaudeHookCommand(command);
 return [`    - matcher: ${matcher}`,'      hooks:','        - type: command',`          command: ${JSON.stringify(command)}`,'          onFailure: block'].join(eol);
}
function entries(skillPath,eol){
 return entry(buildClaudeHookCommand(path.join(skillPath,'hooks/runtime-gate.mjs')),'"*"',eol)+eol+entry(buildClaudeHookCommand(path.join(skillPath,'hooks/role-git-guard.mjs')),'Bash',eol);
}
export function hookFrontmatter(command=templateHookCommand,eol='\n') {
 validateClaudeHookCommand(command);
 // Preserve the public command parameter while pairing it with the runtime gate.
 const encoded=/"([A-Za-z0-9+/]+={0,2})"$/.exec(command)[1];
 const url=new URL(Buffer.from(encoded,'base64').toString('utf8'));
 url.pathname=url.pathname.replace(/[^/]+$/,'runtime-gate.mjs');
 const runtime=prefix+`"${Buffer.from(url.href).toString('base64')}"`;
 return ['hooks:','  PreToolUse:',entry(runtime,'"*"',eol),entry(command,'Bash',eol)].join(eol);
}
function update(text,skillPath,requireManaged){
 const eol=/\r?\n/.exec(text)?.[0]??'\n';
 const fm=/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(text);
 if(!fm)throw Error('Missing Claude frontmatter for hook generation');
 let lines=fm[1].split(/\r?\n/);
 const headers=lines.flatMap((line,i)=>/^hooks:/.test(line)?[i]:[]);
 if(headers.length>1)throw Error('Duplicate Claude hooks');
 let count=0;
 if(headers.length){
  const h=headers[0];if(lines[h]!=='hooks:')throw Error('Malformed Claude hooks');
  let end=h+1;while(end<lines.length&&(/^[ \t]/.test(lines[end])||lines[end]===''))end++;
  const indexes=[];for(let i=h+1;i<end;i++)if(/^  PreToolUse:/.test(lines[i]))indexes.push(i);
  if(indexes.length>1)throw Error('Duplicate PreToolUse');
  if(indexes.length){
   const pre=indexes[0];if(lines[pre]!=='  PreToolUse:')throw Error('Malformed PreToolUse');
   let finish=pre+1;while(finish<end&&!/^  \S/.test(lines[finish]))finish++;
   const kept=[];const seen=new Set();
   for(let i=pre+1;i<finish;){
    if(lines[i]===''){kept.push(lines[i++]);continue;}
    if(!/^    - /.test(lines[i]))throw Error('Malformed Claude hook entry');
    let j=i+1;while(j<finish&&!/^    - /.test(lines[j]))j++;
    const chunk=lines.slice(i,j),body=chunk.join('\n');
    const commands=chunk.filter(line=>/^          command: /.test(line));
    const managed=commands.some(line=>{try{validateClaudeHookCommand(JSON.parse(line.slice('          command: '.length)));return true;}catch{return false;}});
    if(managed){
     if(commands.length!==1)throw Error('Malformed managed Claude hook');
     const command=JSON.parse(commands[0].slice('          command: '.length));
     const encoded=/"([A-Za-z0-9+/]+={0,2})"$/.exec(command)[1];const file=new URL(Buffer.from(encoded,'base64').toString('utf8')).pathname.split('/').at(-1);
     if(seen.has(file))throw Error('Duplicate managed Claude hook');seen.add(file);count++;
     const matcher=file==='runtime-gate.mjs'?'    - matcher: "*"':'    - matcher: Bash';
     const base=[matcher,'      hooks:','        - type: command',commands[0]];
     // Legacy four-line guard upgrades once; malformed failure behavior is never repaired silently.
     if(JSON.stringify(chunk)!==JSON.stringify(base)&&JSON.stringify(chunk)!==JSON.stringify([...base,'          onFailure: block']))throw Error('Malformed managed Claude hook');
    }else{
     if(body.includes(prefix)||/role-git-guard\.mjs|runtime-gate\.mjs/.test(body))throw Error('Malformed managed Claude hook command');
     kept.push(...chunk);
    }
    i=j;
   }
   lines.splice(pre+1,finish-pre-1,...kept,...entries(skillPath,eol).split(eol));
  }else lines.splice(end,0,'  PreToolUse:',...entries(skillPath,eol).split(eol));
 }else lines.push('hooks:','  PreToolUse:',...entries(skillPath,eol).split(eol));
 if(requireManaged&&!count)throw Error('Missing managed Claude hook');
 const replacement='---'+eol+lines.join(eol)+eol+'---';
 return replacement+text.slice(fm[0].length);
}
export function installClaudeHook(bytes,skillPath){return Buffer.from(update(bytes.toString('utf8'),skillPath,true));}
export function renderSourceClaudeHook(text){return update(text,'/__ARC_INSTALLED_SKILL__',false);}
