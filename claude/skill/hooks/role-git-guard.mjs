import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const deny = reason => ({allowed:false,reason});
const isGit = word => /(?:^|[\\/])git(?:\.exe)?$/i.test(word);
export function validateGitPolicy(policy) {
  if (!policy || policy.schemaVersion !== 1 || !Array.isArray(policy.globalValueOptions) || !Array.isArray(policy.globalFlags) || !policy.commands || typeof policy.commands !== 'object' || Array.isArray(policy.commands)) throw Error('Invalid Git policy');
  const strings = list => Array.isArray(list) && list.every(x=>typeof x === 'string' && x.startsWith('-'));
  if (!strings(policy.globalValueOptions) || !strings(policy.globalFlags) || !Object.keys(policy.commands).length) throw Error('Invalid Git policy');
  for (const rule of Object.values(policy.commands)) if (!rule || !strings(rule.flags) || !strings(rule.values) || !['any','none','query','list'].includes(rule.positionals)) throw Error('Invalid Git command policy');
  return policy;
}
// This deliberately supports a small shell grammar, rather than executing a shell.
function tokenize(command) {
  const tokens=[]; let word='', started=false, quote=null;
  for(let i=0;i<command.length;i++) {
    const char=command[i];
    if(quote) {
      if(char===quote){quote=null;continue;}
      if(quote==='"' && /[$`]/.test(char)) throw Error('Dynamic shell syntax');
      // Preserve Windows paths in quoted executable names.
      if(char==='\\' && quote==='"' && /["\\$`]/.test(command[i+1]??'')){word+=command[++i];continue;}
      word+=char;continue;
    }
    if(char==='"'||char==="'"){quote=char;started=true;continue;}
    if(/[\r\n\x00<>`$(){}&]/.test(char) && !(char==='&'&&command[i+1]==='&')) throw Error('Unsupported shell syntax');
    if(char===';'||char==='|'||char==='&') {
      if(started){tokens.push(word);word='';started=false;}
      const operator=command.slice(i,i+2); if(operator==='&&'||operator==='||')i++;
      tokens.push({operator:operator==='&&'||operator==='||'?operator:char});continue;
    }
    if(/\s/.test(char)){if(started){tokens.push(word);word='';started=false;}continue;}
    if(char==='\\') {if(i+1>=command.length)throw Error('Incomplete escape'); word+=command[++i];started=true;continue;}
    if(char==='#')throw Error('Unsupported shell comment');
    word+=char;started=true;
  }
  if(quote)throw Error('Unclosed quote'); if(started)tokens.push(word);return tokens;
}
function classifyWords(words,policy,depth) {
  if(!words.length)return deny('Empty shell segment');
  const executable=words[0].split(/[\\/]/).at(-1).toLowerCase();
  if(['sh','bash','sh.exe','bash.exe'].includes(executable)) {
    if(depth>=4 || words.length!==3 || words[1]!=='-c')return deny('Unsupported shell wrapper');
    return classifyGitCommand(words[2],policy,depth+1);
  }
  if(!isGit(words[0]))return words.some(isGit)?deny('Unsupported indirect Git invocation'):{allowed:true};
  let i=1;
  while(i<words.length && words[i].startsWith('-')) {
    const option=words[i++],equal=option.indexOf('='),key=equal<0?option:option.slice(0,equal);
    if(policy.globalFlags.includes(option))continue;
    if(!policy.globalValueOptions.includes(key))return deny('Unknown Git global option');
    if(equal<0 && (i>=words.length || words[i++].startsWith('-')))return deny('Missing Git option value');
    if(equal>=0 && !option.slice(equal+1))return deny('Missing Git option value');
  }
  const combined=`${words[i]} ${words[i+1]}`;
  const name=Object.hasOwn(policy.commands,combined)?(i+=2,combined):words[i++];
  const rule=Object.hasOwn(policy.commands,name)?policy.commands[name]:null; if(!rule)return deny('Git mutation or unknown subcommand');
  let positions=0,query=false,list=false,paths=false;
  for(;i<words.length;i++) {
    const arg=words[i];
    if(arg==='--' && rule.positionals==='any'){paths=true;continue;}
    if(!paths && arg.startsWith('-')) {
      if(/^-[0-9]+$/.test(arg)&&rule.flags.includes('-<count>'))continue;
      const equal=arg.indexOf('='),key=equal<0?arg:arg.slice(0,equal);
      if(rule.values.includes(key)) {if(equal<0 && (i+1>=words.length||words[++i].startsWith('-')))return deny('Missing query option value'); if(equal>=0&&!arg.slice(equal+1))return deny('Missing query option value');continue;}
      if(!rule.flags.includes(arg))return deny('Unknown or mutating Git option');
      if(['--get','--get-all','--get-regexp','--list','-l'].includes(arg))query=true;
      if(['--list','-l','--show-current'].includes(arg))list=true;
    } else positions++;
  }
  if(rule.positionals==='none'&&positions || rule.positionals==='query'&&(!query||positions>1) || rule.positionals==='list'&&positions&&!list)return deny('Git write or unsupported arguments');
  return {allowed:true};
}
export function classifyGitCommand(command,policy,depth=0) {
  try {
    validateGitPolicy(policy);
    if(typeof command!=='string'||!command.trim())return deny('Missing shell command');
    const tokens=tokenize(command); let words=[];
    for(const token of [...tokens,{operator:'end'}]) {
      if(typeof token==='string'){words.push(token);continue;}
      const result=classifyWords(words,policy,depth);if(!result.allowed)return result;words=[];
    }
    return {allowed:true};
  } catch {return deny('Invalid policy or unsupported command syntax');}
}
export function evaluateHookEvent(event,policy) {
  const result=event?.hook_event_name!=='PreToolUse' ? deny('Invalid hook event') : event?.tool_name!=='Bash' ? deny('Missing Bash event') : classifyGitCommand(event?.tool_input?.command,policy);
  return result.allowed?{}:{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:`ARC specialist Git guard: ${result.reason}. Return the operation to Orchestrator.`}};
}
export function runHook() {
  let response;
  try {const policy=validateGitPolicy(JSON.parse(fs.readFileSync(new URL('./git-policy.json',import.meta.url),'utf8')));response=evaluateHookEvent(JSON.parse(fs.readFileSync(0,'utf8')),policy);}
  catch {response={hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:'ARC specialist Git guard: invalid input or policy asset. Stop and report to Orchestrator.'}};}
  process.stdout.write(JSON.stringify(response)+'\n');
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url)runHook();
