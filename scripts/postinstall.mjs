import {fileURLToPath} from 'node:url';
import {runPostinstall} from '../lib/cli/postinstall.mjs';
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
process.exitCode=await runPostinstall({packageRoot,cwd:packageRoot});
