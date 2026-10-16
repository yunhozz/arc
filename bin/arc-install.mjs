#!/usr/bin/env node
import {runCli} from '../lib/cli/index.mjs';
process.exitCode=await runCli();
