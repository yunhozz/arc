#!/usr/bin/env node
import {runCli} from '../lib/cli/uninstall.mjs';
process.exitCode=await runCli();
