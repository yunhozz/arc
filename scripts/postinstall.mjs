import {runPostinstall} from '../lib/cli/postinstall.mjs';
process.exitCode=await runPostinstall({});
