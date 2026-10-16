import path from 'node:path';

// This gate is deliberately pure: rejected lifecycle contexts never load the
// native runtime or inspect a user's startup files.
export function getNpmCompletionContext({env,platform,packageRoot,uid,home}){
 const skip=reason=>({eligible:false,reason});
 if(env.npm_lifecycle_event!=='postinstall'||env.npm_config_global!=='true')return skip('not a global npm postinstall');
 const prefix=env.npm_config_global_prefix??env.npm_config_prefix;
 if(typeof prefix!=='string'||!path.isAbsolute(prefix)||typeof packageRoot!=='string'||path.resolve(packageRoot)!==path.join(path.resolve(prefix),'lib/node_modules/arc-harness'))return skip('not the final global package location');
 if(!['darwin','linux'].includes(platform))return skip('unsupported platform');
 if(!Number.isInteger(uid)||uid<=0||env.SUDO_UID!==undefined||env.SUDO_USER!==undefined||env.SUDO_COMMAND!==undefined)return skip('root, elevated, or unknown user');
 if(typeof home!=='string'||!path.isAbsolute(home)||home==='/'||typeof env.HOME!=='string'||!path.isAbsolute(env.HOME)||path.resolve(env.HOME)!==path.resolve(home))return skip('user home cannot be identified');
 if(typeof env.SHELL!=='string'||!path.isAbsolute(env.SHELL)||path.basename(env.SHELL)!=='zsh')return skip('shell is not zsh');
 if(env.ZDOTDIR!==undefined&&(!path.isAbsolute(env.ZDOTDIR)||path.resolve(env.ZDOTDIR)!==path.resolve(home)))return skip('separate ZDOTDIR');
 return{eligible:true,userHome:path.resolve(home)};
}

export async function runNpmCompletionPostinstall({env,platform,packageRoot,uid,home,register,stderr=process.stderr}){
 const manual='For this zsh session: eval "$(arc completion zsh)"';
 const report=message=>stderr.write(`ARC completion: ${message}\n${manual}\n`);
 const context=getNpmCompletionContext({env,platform,packageRoot,uid,home});
 if(!context.eligible){report(`skipped (${context.reason}).`);return{status:'skipped',reason:context.reason};}
 try{
  if(!register){
   const [{openRoot},{loadNative},{registerShellCompletion}]=await Promise.all([import('../safe-fs/index.mjs'),import('../safe-fs/native.mjs'),import('./shell-completion.mjs')]);
   const native=loadNative();register=userHome=>registerShellCompletion(userHome,{safeFs:{openRoot:p=>openRoot(p,{native})}});
  }
  const result=await register(context.userHome);
  report(`${result.status}; opens automatically in a new zsh session.`);
  if(result.cleanupError)report(result.cleanupError.message);
  for(const residual of result.residualPaths??[])stderr.write(`Residual path: ${residual}\n`);
  return result;
 }catch(error){
  report(`failed (${error.message}).`);
  for(const residual of error.residualPaths??[])stderr.write(`Residual path: ${residual}\n`);
  return{status:'failed',error};
 }
}
