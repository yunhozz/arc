import {accessSync, constants, realpathSync, statSync} from 'node:fs';
import {delimiter, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

export async function detectNativeCli({platform,env,cwd,runVersion}) {
 if(platform!=='claude'&&platform!=='codex') throw new Error('Unknown native platform');
 let executablePath=null,realpath=null,version=null;
 for(const part of (env.PATH??'').split(delimiter)) {
  if(!part) continue;
  const candidate=resolve(cwd,part,platform);
  try {accessSync(candidate,constants.X_OK); if(!statSync(candidate).isFile()) continue; realpath=realpathSync(candidate); executablePath=candidate; break;} catch {}
 }
 if(executablePath) {
  try {
   const output=String(await (runVersion??((path)=>execFileSync(path,['--version'],{encoding:'utf8',env,cwd,timeout:5000})))(executablePath));
   const matches=[...output.matchAll(/(?<![\w.])\d+\.\d+\.\d+(?![\w.\-])/g)];
   if(matches.length===1) version=matches[0][0];
  } catch {}
 }
 const parts=version?.split('.').map(Number);
 const failureBlocking=platform==='claude'&&!!parts&&(parts[0]>2||parts[0]===2&&(parts[1]>1||parts[1]===1&&parts[2]>=295));
 return {status:version?'detected':'unknown',executablePath,realpath,version,failureBlocking};
}
