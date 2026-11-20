import os from 'node:os';
import {parseWatchArgs} from './args.mjs';
import {resolveConfigHome} from '../runtime/local-cli.mjs';
import {DEFAULT_PLATFORM_REGISTRY} from '../runtime/platform-registry.mjs';
import {createWatcher} from './watcher.mjs';
import {resolveScope} from './scope.mjs';
import {createGitRunner} from './git.mjs';
import {renderHuman, renderJson} from './render.mjs';
import {watchLocationLabel, statusBlockLines} from './status-line.mjs';
import {WATCH_LIMITS as L} from './model.mjs';

export {parseWatchArgs};
export const WATCH_HELP = `Usage: arc watch [options]

Follow session activity of supported platforms in one read-only stream.

Scope:
  Choose All or one platform in the menu. Every choice watches the current Git worktree, or the current directory outside Git. Requires an interactive terminal.

Output:
  --tail <n>          First show the last <n> events from recently active sessions (default 20, 0 = new only)
  --verbose           Also show reasoning, settings, turn starts and diagnostics
  --json              Write one JSON object per line
  --width <n>         Maximum line width; one-line events are clipped, messages and file lists wrap (default: terminal width, or 200)
  --help              Show this help

Events are scoped by each session's working directory at that point; a session that moves into another worktree appears in that worktree's watch.
Skills and plugin tools in use are shown as SKILL and PLUGIN lines.
User and agent messages and file paths are shown in full; other events use one line.
Tool and command outputs are never shown; common secret patterns are masked.
A status block on the last lines shows the watched path and, while a turn is in progress, a spinner (TTY only).
Press Ctrl-L to clear the screen (TTY only) and Ctrl-C to stop.`;

export async function runWatch(argv, io = {}) {
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout, error = io.error ?? process.stderr;
  const parsed = parseWatchArgs(argv);
  if (!parsed.ok) { error.write('Error: '+parsed.message+'. Run arc watch --help for usage.\n'); return 2; }
  const options = parsed.options;
  if (options.help) { output.write(WATCH_HELP + '\n'); return 0; }
  if (io.signal?.aborted) return 0;
  if (!(input.isTTY && output.isTTY)) {
    error.write('Error: arc watch needs an interactive terminal to choose platforms.\n');
    return 2;
  }
  const registry = io.registry ?? DEFAULT_PLATFORM_REGISTRY;
  const choose = io.choosePlatforms ?? (await import('./menu.mjs')).chooseWatchPlatforms;
  let platforms;
  try {
    platforms = await choose({input,output,env:io.env,signals:io.process,registry});
  } catch (cause) {
    if (cause.code === 'ARC_CANCELLED') return 130;
    throw cause;
  }
  if (platforms === null) return 0;
  return followWatch(options,{...io,input,output,error,registry,platforms});
}

export async function followWatch(options, io = {}) {
  if (io.signal?.aborted) return 0;
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout, error = io.error ?? process.stderr;
  const cwd = io.cwd ?? process.cwd(), env = io.env ?? process.env;
  const registry = io.registry ?? DEFAULT_PLATFORM_REGISTRY;
  const userHome = io.userHome ?? os.homedir(), disabled = [];
  const homes = Object.fromEntries(registry.byAnchorOrder().map(({id}) => [id,null]));
  for (const {id:platform} of registry.byAnchorOrder()) {
    try { homes[platform] = resolveConfigHome(platform, {userHome,env,cwd,runtimePlatforms:registry}); }
    catch (cause) { if (io.platforms.includes(platform)) disabled.push(`${platform} disabled: ${cause.message}`); }
  }
  const platforms = io.platforms.filter(platform => homes[platform] !== null);
  if (!platforms.length) { error.write('Error: no usable watch source.\n'); return 1; }
  const now = io.now ?? Date.now, git = io.git ?? createGitRunner({env});
  const proc = io.process ?? process, schedule = io.setInterval ?? setInterval, unschedule = io.clearInterval ?? clearInterval;
  let width, watcher, timer, stopped = false, active;
  const wrap = Boolean(!options.json && (output.isTTY || options.width != null));
  const color = Boolean(output.isTTY && !options.json && !env.NO_COLOR);
  const blockEnabled = Boolean(output.isTTY && !options.json);
  const fancy = color && env.TERM !== 'dumb';
  const label = watchLocationLabel({dir:cwd,home:userHome});
  const keysEnabled = Boolean(input.isTTY && output.isTTY && !options.json && typeof input.setRawMode === 'function');
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let drawnLines = 0, frame = 0, tick = 0;
  const eraseBlock = () => {
    if (!drawnLines) return;
    const erase = '\r\x1b[2K' + '\x1b[1A\x1b[2K'.repeat(drawnLines - 1);
    drawnLines = 0;
    output.write(erase);
  };
  const resize = () => { width = options.width ?? (output.isTTY ? Math.max(L.ttyWidthMin, output.columns || L.ttyWidthMin) : L.nonTtyWidth); };
  resize();
  return new Promise(resolve => {
    const signals = ['SIGINT','SIGTERM','SIGHUP'];
    let rawModeEnabled = false;
    const stop = (code = 0, cause) => {
      if (stopped) return;
      stopped = true;
      if (rawModeEnabled) {
        rawModeEnabled = false;
        input.removeListener('data', onKey);
        try { input.setRawMode(false); } catch {}
        input.pause();
      }
      eraseBlock();
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
    const drawBlock = () => {
      if (!stopped && blockEnabled) {
        const busy = Boolean(watcher?.busy?.());
        const blockWidth = Math.min(width, output.columns || width);
        const lines = statusBlockLines({label,busy,glyph:frames[frame],tick,color,fancy,width:blockWidth});
        if (busy) frame = (frame + 1) % frames.length;
        drawnLines = lines.length;
        output.write(lines.join('\n'));
      }
    };
    const onKey = chunk => {
      for (const byte of Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) {
        if (stopped) break;
        if (byte === 0x03) stop();
        else if (byte === 0x0c) {
          output.write('\x1b[H\x1b[2J\x1b[3J');
          drawnLines = 0;
          drawBlock();
        }
      }
    };
    const write = events => {
      if (stopped) return;
      eraseBlock();
      for (const event of events) {
        if (stopped) break;
        output.write((options.json ? renderJson(event) : renderHuman(event,{width,color,verbose:options.verbose,wrap})) + '\n');
      }
      drawBlock();
    };
    for (const signal of signals) proc.on(signal, onSignal);
    output.on('error', onError);
    output.on('resize', resize);
    io.signal?.addEventListener('abort', onSignal, {once:true});
    let ticking = false, nextPollAt;
    active = (async () => {
      if (keysEnabled) {
        rawModeEnabled = true;
        input.setRawMode(true);
        input.resume();
        input.on('data', onKey);
      }
      const scope = await resolveScope({dir:cwd,git});
      if (stopped) return;
      watcher = createWatcher({options:{...options,platforms},homes:{...homes,user:userHome},scope,git,now,registry});
      for (const text of disabled) {
        const ts = new Date(now()).toISOString();
        write([{v:1,ts,observedAt:ts,source:'watch',kind:'notice',label:'watch',text}]);
      }
      write(await watcher.start());
      if (stopped) return;
      nextPollAt = now() + L.filePollMs;
      timer = schedule(() => {
        if (stopped || ticking) return;
        tick++;
        if (now() < nextPollAt) {
          if (watcher.busy()) {
            eraseBlock();
            drawBlock();
          }
          return;
        }
        nextPollAt = now() + L.filePollMs;
        ticking = true;
        active = (async () => { try { write(await watcher.tick()); } finally { ticking = false; } })();
        active.catch(onError);
        return active;
      }, blockEnabled ? 100 : L.filePollMs);
    })();
    active.catch(onError);
  });
}
