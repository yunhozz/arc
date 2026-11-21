import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateWorkflowId} from './scope.mjs';
import {dispatchVerify, VerifyError, VERIFY_COMMANDS} from './final-verify.mjs';

export async function runVerifyCommand(args, io = {}) {
  const output = io.output ?? process.stdout;
  let workflowId = null;
  let result;
  let exit;
  try {
    const [command, ...rest] = args;
    const env = io.env ?? process.env;
    if (VERIFY_COMMANDS.includes(command) && Object.hasOwn(env, 'ARC_BRIDGE_CHILD')) {
      throw new VerifyError('bridge_child');
    }

    let cwd;
    let input;
    try {
      if (!VERIFY_COMMANDS.includes(command)) throw Error('Expected verify command');
      const options = {};
      for (let i = 0; i < rest.length; i += 2) {
        const key = rest[i];
        if (!['--cwd', '--workflow', '--input'].includes(key) || Object.hasOwn(options, key) || typeof rest[i+1] !== 'string') {
          throw Error('Invalid verify option');
        }
        options[key] = rest[i+1];
      }
      workflowId = validateWorkflowId(options['--workflow']);
      cwd = options['--cwd'];
      if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || path.normalize(cwd) !== cwd || cwd.includes('\0')) {
        throw Error('Absolute workspace required');
      }
      if (options['--input'] !== '-') throw Error('Verify commands require --input -');
    } catch (error) {
      throw new VerifyError('invalid_request', 'deny', {message: error.message});
    }
    const text = io.input ?? fs.readFileSync(0, 'utf8');
    try {
      input = JSON.parse(text);
    } catch {
      throw new VerifyError('invalid_request', 'deny', {message: 'Expected JSON input'});
    }
    result = await dispatchVerify(command, {cwd, workflowId, input, env});
  } catch (error) {
    if (error instanceof VerifyError) result = error.result;
    else {
      exit = 1;
      result = {decision: 'hold', code: 'verify_error', message: error.message};
    }
  }
  output.write(JSON.stringify({workflowId, ...result}) + '\n');
  return exit ?? {allow: 0, deny: 2, hold: 3}[result.decision];
}

if (process.argv[1] && fs.realpathSync(process.argv[1], {throwIfNoEntry: false}) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runVerifyCommand(process.argv.slice(2));
}
