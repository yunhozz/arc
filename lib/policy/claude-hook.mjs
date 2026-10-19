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
  const url=new URL(decoded.toString('utf8'));if(url.protocol!=='file:'||url.host||!url.pathname.endsWith('/hooks/role-git-guard.mjs')||url.search||url.hash)throw Error('Invalid hook file URL');
  return command;
}
export function hookFrontmatter(command=templateHookCommand,eol='\n') {
  validateClaudeHookCommand(command);
  return ['hooks:','  PreToolUse:','    - matcher: Bash','      hooks:','        - type: command',`          command: ${JSON.stringify(command)}`].join(eol);
}
export function installClaudeHook(bytes,skillPath) {
  const text=bytes.toString('utf8'),eol=/\r?\n/.exec(text)?.[0]??'\n';
  const pattern=/^hooks:\r?\n  PreToolUse:\r?\n    - matcher: Bash\r?\n      hooks:\r?\n        - type: command\r?\n          command: ("[^\r\n]+")(?=\r?$)/gm;
  const matches=[...text.matchAll(pattern)];if(matches.length!==1)throw Error('Missing or duplicate managed Claude hook');
  validateClaudeHookCommand(JSON.parse(matches[0][1]));
  return Buffer.from(text.replace(pattern,()=>hookFrontmatter(buildClaudeHookCommand(path.join(skillPath,'hooks/role-git-guard.mjs')),eol)));
}
export function renderSourceClaudeHook(text) {
  const eol=/\r?\n/.exec(text)?.[0]??'\n';
  const frontmatter=/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/.exec(text);
  if(!frontmatter)throw Error('Missing Claude frontmatter for hook generation');
  if(/^hooks:/m.test(frontmatter[1]))return installClaudeHook(Buffer.from(text),'/__ARC_INSTALLED_SKILL__').toString('utf8');
  const closing=frontmatter[0].lastIndexOf(eol+'---');
  return text.slice(0,closing)+eol+hookFrontmatter(templateHookCommand,eol)+text.slice(closing);
}
