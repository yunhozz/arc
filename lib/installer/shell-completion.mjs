import path from 'node:path';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
const start='# >>> arc completion >>>',end='# <<< arc completion <<<';
const body='if command -v arc >/dev/null 2>&1; then\n  eval "$(arc completion zsh)"\nfi';
export function renderShellCompletion(original){
 let text;try{text=original===null?'':new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(original);}catch{throw new TargetConfigurationError('.zshrc must be valid UTF-8');}
 const starts=[...text.matchAll(/# >>> arc completion >>>/g)],ends=[...text.matchAll(/# <<< arc completion <<</g)];
 if(starts.length!==ends.length||starts.length>1)throw new TargetConfigurationError('Malformed ARC completion markers');
 const newline=text.includes('\r\n')?'\r\n':'\n',block=start+newline+body.replaceAll('\n',newline)+newline+end;
 if(starts.length){const first=starts[0].index,last=ends[0].index;if(first>=last||(first>0&&text[first-1]!=='\n')||(last>0&&text[last-1]!=='\n')||!['','\n','\r'].includes(text[last+end.length]??''))throw new TargetConfigurationError('Malformed ARC completion markers');return Buffer.from(text.slice(0,first)+block+text.slice(last+end.length));}
 return Buffer.concat([original??Buffer.alloc(0),Buffer.from((text&&!text.endsWith('\n')?newline:'')+block+newline)]);
}
export function attachShellCompletion(plans,{safeFs}){
 const plan=plans[0];if(!plan||plan.skipGlobal)return;
 const filename=path.join(plan.target.userHome,'.zshrc'),current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot:plan.snapshot}),original=current.bytes??null;
 const metadata=plan.snapshot.get(filename);if(metadata&&(metadata.mode&0o222n)===0n)throw new TargetConfigurationError('.zshrc is not writable');
 const content=renderShellCompletion(original);plan.managedPaths.push(filename);
 if(original===null||!content.equals(original))plan.globalChanges.push({path:filename,original,content,action:'register completion'});
 plan.summary.push(`${filename}: zsh completion; opens automatically in a new zsh session. For this session: eval "$(arc completion zsh)"`);
}
