import {runChild} from '../lib/cli/upgrade.mjs';
try{let bytes=Buffer.alloc(0);for await(const chunk of process.stdin){bytes=Buffer.concat([bytes,chunk]);if(bytes.length>4096)throw Error('Invalid private upgrade request');}process.exitCode=await runChild(JSON.parse(bytes.toString('utf8')));}
catch{process.stderr.write('Error: Invalid private upgrade request\n');process.exitCode=2;}
