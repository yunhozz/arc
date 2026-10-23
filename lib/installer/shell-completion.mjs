import path from 'node:path';
import {inspectPath,TargetConfigurationError} from './targets.mjs';
const start='# >>> arc completion >>>',end='# <<< arc completion <<<';
export function removeShellCompletion(original){
 let text;try{text=original===null?'':new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(original);}catch{throw new TargetConfigurationError('.zshrc must be valid UTF-8');}
 const starts=[...text.matchAll(/# >>> arc completion >>>/g)],ends=[...text.matchAll(/# <<< arc completion <<</g)];
 const malformed=()=>{throw new TargetConfigurationError('Malformed ARC completion markers');};
 if(starts.length!==ends.length||starts.length>1)malformed();
 if(!starts.length)return{changed:false,content:original};
 const first=starts[0].index,last=ends[0].index;let stop=last+end.length;
 if(first>=last||(first>0&&text[first-1]!=='\n')||(last>0&&text[last-1]!=='\n')||!['','\n','\r\n'].includes(text.slice(stop,stop+2).startsWith('\r')?text.slice(stop,stop+2):text.slice(stop,stop+1)))malformed();
 if(text.slice(stop,stop+2)==='\r\n')stop+=2;else if(text[stop]==='\n')stop++;
 return{changed:true,content:Buffer.from(text.slice(0,first)+text.slice(stop))};
}
export function attachShellCompletionCleanup(plans,{safeFs}){
 const plan=plans[0];if(!plan)return;
 const filename=path.join(plan.target.userHome,'.zshrc'),current=inspectPath(safeFs,filename,{kind:'file',read:true,snapshot:plan.snapshot}),original=current.bytes??null;
 const removed=removeShellCompletion(original);
 for(const item of plans){item.managedPaths=item.managedPaths.filter(name=>name!==filename);item.globalChanges=item.globalChanges.filter(change=>change.path!==filename);if(item!==plan)item.snapshot.delete(filename);}
 if(!removed.changed)return;
 const metadata=plan.snapshot.get(filename);if(metadata&&(metadata.mode&0o222n)===0n)throw new TargetConfigurationError('.zshrc is not writable');
 plan.managedPaths.push(filename);plan.globalChanges.push({path:filename,original,content:removed.content,action:'remove managed completion'});
 plan.summary.push(`${filename}: remove managed ARC completion block`);
}
