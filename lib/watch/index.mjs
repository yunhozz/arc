import os from 'node:os';
import path from 'node:path';
import {parseWatchArgs} from './args.mjs';
import {resolveConfigHome} from '../runtime/local-cli.mjs';
import {createWatcher} from './watcher.mjs';
import {resolveScope} from './scope.mjs';
import {createGitRunner} from './git.mjs';
import {renderHuman, renderJson} from './render.mjs';
import {WATCH_LIMITS as L} from './model.mjs';

export {parseWatchArgs};
export const WATCH_HELP = `Usage: arc watch [options]

Follow Claude Code and Codex session activity in one read-only stream.

Scope (default: every worktree of the current Git repository, or the current directory):
  --cwd <dir>         Watch the repository or directory at <dir>
  --all               Watch sessions from every directory
  --session <id>      Follow one session or ARC dispatch and its subagents
  --platform <name>   codex or claude (default: both)

Output:
  --tail <n>          First show the last <n> events from recently active sessions (default 20, 0 = new only)
  --verbose           Also show reasoning, settings, turn starts and diagnostics
  --json              Write one JSON object per line
  --width <n>         Maximum width of one-line events (default: terminal width, or 200)
  --help              Show this help

User and agent messages are shown in full; other events use one line.
Tool and command outputs are never shown; common secret patterns are masked.
Codex Desktop sessions are not included.
Bridge roles on a Codex host are currently held (host_sandbox_blocked) and appear once they run.
Press Ctrl-C to stop.`;

export async function runWatch(argv, io = {}) {
  const output = io.output ?? process.stdout, error = io.error ?? process.stderr;
  const cwd = io.cwd ?? process.cwd(), env = io.env ?? process.env;
  // Resolve relative --cwd without changing the process cwd shared by other callers.
  const args = argv.map((arg, i) => {
    if (arg.startsWith('--cwd=') && arg.length > 6) return '--cwd=' + path.resolve(cwd, arg.slice(6));
    if (i > 0 && argv[i-1] === '--cwd' && arg && !arg.startsWith('--')) return path.resolve(cwd, arg);
    return arg;
  });
  const parsed = parseWatchArgs(args);
  if (!parsed.ok) { error.write(`Error: ${parsed.message}. Run arc watch --help for usage.\n`); return 2; }
  const options = parsed.options;
  if (options.help) { output.write(WATCH_HELP + '\n'); return 0; }
  if (io.signal?.aborted) return 0;
  const userHome = io.userHome ?? os.homedir(), homes = {codex:null,claude:null}, disabled = [];
  for (const platform of new Set([...options.platforms,'codex'])) {
    try { homes[platform] = resolveConfigHome(platform, {userHome,env,cwd}); }
    catch (cause) { if (options.platforms.includes(platform)) disabled.push(`${platform} disabled: ${cause.message}`); }
  }
  options.platforms = options.platforms.filter(platform => homes[platform] !== null);
  if (!options.platforms.length) { error.write('Error: no usable watch source.\n'); return 1; }
  const now = io.now ?? Date.now, git = io.git ?? createGitRunner({env});
  const proc = io.process ?? process, schedule = io.setInterval ?? setInterval, unschedule = io.clearInterval ?? clearInterval;
  let width, watcher, timer, stopped = false, active;
  const resize = () => { width = options.width ?? (output.isTTY ? Math.max(L.ttyWidthMin, output.columns || L.ttyWidthMin) : L.nonTtyWidth); };
  resize();
  return new Promise(resolve => {
    const signals = ['SIGINT','SIGTERM','SIGHUP'];
    const stop = (code = 0, cause) => {
      if (stopped) return;
      stopped = true;
      if (timer !== undefined) unschedule(timer);
      for (const signal of signals) proc.removeListener(signal, onSignal);
      io.signal?.removeEventListener('abort', onSignal);
      output.removeListener('resize', resize);
      // Retain the error handler until pending writes and reads have settled.
      Promise.resolve(active).catch(() => {}).then(async () => {
        try { await watcher?.close(); }
        catch (failure) { if (code === 0) { code = 1; cause = failure; } }
        output.removeListener('error', onError);
        if (code && cause) error.write(`Error: ${String(cause.message ?? cause).replace(/[\r\n]+/g,' ')}\n`);
        resolve(code);
      });
    };
    const onSignal = () => stop();
    const onError = cause => stop(cause.code === 'EPIPE' ? 0 : 1, cause);
    const write = events => {
      for (const event of events) {
        if (stopped) break;
        output.write((options.json ? renderJson(event) : renderHuman(event,{width,color:Boolean(output.isTTY && !options.json && !env.NO_COLOR),verbose:options.verbose})) + '\n');
      }
    };
    for (const signal of signals) proc.on(signal, onSignal);
    output.on('error', onError);
    output.on('resize', resize);
    io.signal?.addEventListener('abort', onSignal, {once:true});
    let ticking = false;
    active = (async () => {
      const scope = await resolveScope({mode:options.mode,dir:options.dir ?? cwd,session:options.session,git});
      if (stopped) return;
      watcher = createWatcher({options,homes,scope,git,now});
      for (const text of disabled) {
        const ts = new Date(now()).toISOString();
        write([{v:1,ts,observedAt:ts,source:'watch',kind:'notice',label:'watch',text}]);
      }
      write(await watcher.start());
      if (stopped) return;
      timer = schedule(() => {
        if (stopped || ticking) return;
        ticking = true;
        active = (async () => { try { write(await watcher.tick()); } finally { ticking = false; } })();
        active.catch(onError);
        return active;
      }, L.filePollMs);
    })();
    active.catch(onError);
  });
}
