import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../../lib/installer/npm-completion.mjs').catch(()=>({}));
const supported={env:{npm_lifecycle_event:'postinstall',npm_config_global:'true',npm_config_prefix:'/opt/npm',SHELL:'/bin/zsh',HOME:'/users/test'},platform:'darwin',packageRoot:'/opt/npm/lib/node_modules/arc-harness',uid:501,home:'/users/test'};
// A missing or permissive lifecycle gate would either suppress supported installs
// or let a temporary/local checkout read the user's dotfiles.
test('only the final global package for an identifiable ordinary zsh user is eligible',()=>{
 assert.equal(typeof api.getNpmCompletionContext,'function');
 assert.deepEqual(api.getNpmCompletionContext(supported),{eligible:true,userHome:'/users/test'});
 for(const delta of [{packageRoot:'/tmp/git-checkout'},{platform:'win32'},{uid:0},{uid:undefined},{home:'/different'},{env:{npm_config_global:'false'}},{env:{npm_lifecycle_event:'prepare'}},{env:{npm_config_prefix:'relative'}},{env:{SHELL:''}},{env:{SHELL:'/bin/bash'}},{env:{ZDOTDIR:'/elsewhere'}},{env:{SUDO_UID:'501'}}]){
  const input={...supported,...delta,env:{...supported.env,...delta.env}};
  assert.equal(api.getNpmCompletionContext(input).eligible,false,JSON.stringify(delta));
 }
});
// Rejecting contexts must never reach native/dotfile registration; a failed
// registration must not turn the additive completion hook into install failure.
test('postinstall skips before registration and reports registration failures nonfatally',async()=>{
 assert.equal(typeof api.runNpmCompletionPostinstall,'function');let calls=0,output='';const stderr={write:s=>{output+=s;}};
 const skipped=await api.runNpmCompletionPostinstall({...supported,packageRoot:'/tmp/git',register:()=>{calls++;},stderr});assert.equal(skipped.status,'skipped');assert.equal(calls,0);
 const failed=await api.runNpmCompletionPostinstall({...supported,register:()=>{throw Object.assign(Error('native unavailable'),{residualPaths:['/users/test/.arc-stage-held']});},stderr});assert.equal(failed.status,'failed');assert.match(output,/native unavailable/);assert.match(output,/Residual path: \/users\/test\/\.arc-stage-held/);assert.match(output,/arc completion zsh/);
 const registered=await api.runNpmCompletionPostinstall({...supported,register:()=>({status:'registered'}),stderr});assert.equal(registered.status,'registered');
});
