#!/usr/bin/env node
import {runRoot} from '../lib/cli/root.mjs';
process.exitCode=await runRoot();
