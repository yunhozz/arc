import {buildReleaseArtifact,resolveNpmCli,releaseSourceRoot} from '../lib/release/artifact.mjs';
const args=process.argv.slice(2),controller=new AbortController();
const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
 if(args.length!==2||args[0]!=='--out-dir')throw Error('Usage: npm run pack:release -- --out-dir <absolute-output-directory>');
 const result=await buildReleaseArtifact({sourceRoot:releaseSourceRoot,outDir:args[1],npmCli:resolveNpmCli(),signal:controller.signal});
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Release artifact error: '+error.message);process.exitCode=controller.signal.aborted?130:1;}
finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
