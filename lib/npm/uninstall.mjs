import {inspectGlobalArc} from './context.mjs';
import {runNpm as defaultRunNpm} from './process.mjs';
export function sameGlobalArc(left,right){return['kind','npmCli','prefix','packageRoot','version','packageToken'].every(key=>left?.[key]===right?.[key]);}
export async function uninstallGlobal({context,env=process.env,cwd=process.cwd(),signal,runNpm=defaultRunNpm}){
 let started=false,result;
 try{
  const current=await inspectGlobalArc({context,env,cwd,runNpm});
  if(!sameGlobalArc(context,current))throw Object.assign(Error('Global ARC installation changed; prepare uninstall again'),{code:'ARC_TARGET_CONFIGURATION'});
  if(signal?.aborted)throw Object.assign(Error('Uninstall interrupted'),{code:'ARC_NPM_CANCELLED'});
  if(current.kind==='absent')return{packageStatus:'absent',code:0,started:false,stdout:'',stderr:''};
  started=true;
  result=await runNpm(current.npmCli,['uninstall','--global','@yunhozz/arc','--prefix',current.prefix,'--ignore-scripts'],{env,cwd,signal});
  if(result.code!==0||result.signal)throw Error('Global CLI removal failed; the package may have changed');
  if((await inspectGlobalArc({context:current,env,cwd,runNpm})).kind!=='absent')throw Error('Global ARC remains after npm uninstall');
  return{...result,packageStatus:'removed',started};
 }catch(error){const interrupted=['ARC_CANCELLED','ARC_NPM_CANCELLED'].includes(error.code)||Boolean(signal?.aborted);return{...result,packageStatus:'failed',code:interrupted?130:result?.code||1,interrupted,started,error};}
}
