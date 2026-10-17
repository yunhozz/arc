// Maintainer-only live probe, intentionally separate from deterministic npm test.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './fixtures/packed-consumer.mjs';
const cleanup=[];
const state=fixture({after:fn=>cleanup.push(fn)},{live:true});
try{
 const result=state.run('traps',['--target','all','--preset','balanced'],{timeout:90000});
 if(result.status!==0){console.error('UNVERIFIED: live upstream acquisition did not complete successfully.');console.error(result.stderr||result.stdout||String(result.error));process.exitCode=1;}
 else{
  // Local files remain usable once the Git launcher is removed.
  fs.unlinkSync(state.environments.traps.PATH+'/git');
  for(const platform of ['codex','claude']){
   const root=result.home+'/.'+platform+'/skills/arc/references/superpowers',p=JSON.parse(fs.readFileSync(root+'/provenance.json'));
   for(const[name,hash]of Object.entries(p.files))if(createHash('sha256').update(fs.readFileSync(root+'/'+name)).digest('hex')!==hash)throw Error('Live reference hash mismatch');
   for(const name of ['brainstorming/SKILL.md','brainstorming/visual-companion.md','brainstorming/scripts/start-server.sh','writing-plans/SKILL.md','test-driven-development/SKILL.md','test-driven-development/writing-good-tests.md','LICENSE'])if(!fs.readFileSync(root+'/'+name).length)throw Error('Live reference is empty');
   if(fs.existsSync(result.home+'/.'+platform+'/skills/brainstorming'))throw Error('Unexpected global superpowers installation');
   console.log(`VERIFIED: packed ${platform} install, revision ${p.revision}, complete local references and LICENSE; no Python/compiler traps.`);
  }
 }
}finally{for(const fn of cleanup.reverse())fn();}
