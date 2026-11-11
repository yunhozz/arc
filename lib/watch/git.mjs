import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {WATCH_LIMITS} from './model.mjs';

const execFileAsync = promisify(execFile);
export const GIT_ALLOWED = Object.freeze([
  Object.freeze(['rev-parse','--show-toplevel']),
  Object.freeze(['rev-parse','--path-format=absolute','--git-common-dir']),
  Object.freeze(['worktree','list','--porcelain','-z']),
]);

export function createGitRunner({env = process.env, timeoutMs = WATCH_LIMITS.gitTimeoutMs} = {}) {
  const cleanEnv = Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(cleanEnv, {
    GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_OPTIONAL_LOCKS:'0', GIT_NO_REPLACE_OBJECTS:'1', GIT_NO_LAZY_FETCH:'1', GIT_TERMINAL_PROMPT:'0',
  });
  return async (cwd, args) => {
    if (!Array.isArray(args) || !GIT_ALLOWED.some(allowed => allowed.length === args.length && allowed.every((arg,i) => arg === args[i]))) {
      throw Error('git command not allowed');
    }
    try {
      const {stdout} = await execFileAsync('git', ['--no-pager','-c','core.fsmonitor=false',...args], {
        cwd, env:cleanEnv, shell:false, encoding:'utf8', timeout:timeoutMs,
      });
      return stdout;
    } catch { return null; }
  };
}
