// Maintainer-only live probe, intentionally separate from deterministic npm test.
import fs from 'node:fs';
import {fixture} from './fixtures/packed-consumer.mjs';
const cleanup=[];
const fixtureState=fixture({after:fn=>cleanup.push(fn)},{live:true});
try{
 const result=fixtureState.run('traps',['--target','codex','--preset','balanced'],{timeout:45000});
 if(result.status!==0){console.error('UNVERIFIED: live upstream acquisition did not complete successfully.');console.error(result.stderr||result.stdout||String(result.error));process.exitCode=1;}
 else{const target=result.home+'/.codex/skills/arc/models.toml';if(!fs.existsSync(target))throw Error('Live install did not publish the ARC payload');console.log('VERIFIED: packed Codex Balanced installation used live upstream without Python/compiler traps.');}
}finally{for(const fn of cleanup.reverse())fn();}
