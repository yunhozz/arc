import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runWorkflowCommand} from './command.mjs';
export {runWorkflowCommand};
// Importing the installed entry is safe for callers that own their own IO.
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 process.exitCode=await runWorkflowCommand(process.argv.slice(2));
}
