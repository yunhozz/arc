import {verifyReleaseArtifact} from '../lib/release/artifact.mjs';
const args=process.argv.slice(2);
try{
 if(args.length!==6||args[0]!=='--out-dir'||args[2]!=='--name'||args[4]!=='--version')throw Error('Usage: node scripts/verify-release.mjs --out-dir <absolute-output-directory> --name <package-name> --version <version>');
 console.log(JSON.stringify(await verifyReleaseArtifact({outDir:args[1],expectedName:args[3],expectedVersion:args[5]}),null,2));
}catch(error){console.error('Release verification error: '+error.message);process.exitCode=1;}
