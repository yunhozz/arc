import os from 'node:os';
import {readFileSync} from 'node:fs';
import {parseWatchArgs} from './args.mjs';
import {resolveConfigHome} from '../runtime/local-cli.mjs';
import {DEFAULT_PLATFORM_REGISTRY} from '../runtime/platform-registry.mjs';
import {createWatcher} from './watcher.mjs';
import {groupActivity, parseWorktreeList, resolveScope, scopeForWorktree, selectableWorktrees} from './scope.mjs';
import {createGitRunner, GIT_ALLOWED} from './git.mjs';
import {renderHuman, renderJson} from './render.mjs';
import {watchLocationLabel, statusBlockLines} from './status-line.mjs';
import {WATCH_LIMITS as L} from './model.mjs';
import {earlierPageLines, renderBrief} from './brief.mjs';

const packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

export {parseWatchArgs};
export const WATCH_HELP = `Usage: arc watch [options]

Follow session activity of supported platforms in one read-only stream.

Scope:
  In a Git repository, first choose the worktree to watch from git worktree list, wherever it was created; the current worktree is selected, recent session activity is shown, and worktrees without recent activity are dimmed. Outside Git the current directory is watched. Then check the platforms to watch; all supported platforms are checked by default. Requires an interactive terminal.

Output:
  --tail <n>          First show the last <n> events from recently active sessions (default 20, 0 = new only)
  --verbose           Also show reasoning, settings, turn starts and diagnostics
  --json              Write one JSON object per line
  --width <n>         Maximum line width; one-line events are clipped, messages and file lists wrap (default: terminal width, or 200)
  --help              Show this help

Events are scoped by each session's working directory at that point; a session that moves into another worktree appears in that worktree's watch.
Skills and plugin tools in use are shown as SKILL and PLUGIN lines.
User messages, agent messages, prompts and file paths are shown in full; other events use one line.
PROMPT is an agent-generated prompt sent to a child session (kind "prompt" in JSON).
Color TTY output renders Markdown in AGENT and PROMPT messages. NO_COLOR, piped output and --json keep the Markdown source text.
Tool and command outputs are never shown; common secret patterns are masked.
A summary box at the start shows the scope, platforms and keys (TTY only).
A status block on the last lines shows the watched path and, while a turn is in progress, a spinner (TTY only).
Press Ctrl-H to show earlier events from the history loaded at start, 20 at a time, Ctrl-L to clear the screen and Ctrl-C to stop. Ctrl-H and Ctrl-L work in a TTY only.
Terminals that send ^H for Backspace also show earlier events on Backspace.`;

function resolveWatchHomes({registry,userHome,env,cwd}) {
  const homes = {}, homeErrors = {};
  for (const {id} of registry.byAnchorOrder()) {
    try { homes[id] = resolveConfigHome(id,{userHome,env,cwd,runtimePlatforms:registry}); }
    catch (cause) { homes[id] = null; homeErrors[id] = cause.message; }
  }
  return {homes,homeErrors};
}

async function probeWorktrees({worktrees,scope,homes,userHome,git,now,registry}) {
  const platforms = registry.byDisplayOrder().filter(row=>row.capabilities.watch.state==='verified').map(row=>row.id);
  const probe = createWatcher({
    options:{probe:true,platforms,tail:0},homes:{...homes,user:userHome},git,now,registry,
    scope:{kind:'repo',roots:worktrees.map(tree=>tree.root),excludedRoots:[],gitCommonDir:scope.gitCommonDir},
  });
  try {
    await probe.start();
    const time = now();
    return {groups:groupActivity(worktrees,probe.listActivity(),{now:time}),now:time};
  } finally {
    await probe.close();
  }
}

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
  const cwd = io.cwd ?? process.cwd(), env = io.env ?? process.env, userHome = io.userHome ?? os.homedir();
  const git = io.git ?? createGitRunner({env}), now = io.now ?? Date.now;
  const {homes,homeErrors} = resolveWatchHomes({registry,userHome,env,cwd});
  let porcelain, scope;
  try {
    scope = await resolveScope({dir:cwd,git:async (dir,args)=>{
      if (args!==GIT_ALLOWED[2]) return git(dir,args);
      try { porcelain = await git(dir,args); } catch { porcelain = null; }
      // A missing list should not turn a confirmed Git worktree into a directory scope.
      return porcelain ?? '';
    }});
  } catch (cause) {
    error.write(`Error: ${String(cause.message ?? cause).replace(/[\r\n]+/g,' ')}\n`);
    return 1;
  }
  if (io.signal?.aborted) return 0;
  const choose = io.choosePlatforms ?? (await import('./menu.mjs')).chooseWatchPlatforms;
  let platforms;
  try {
    if (scope.kind==='repo' && porcelain) {
      const currentRoot = scope.roots[0];
      let picker;
      try {
        const {worktrees,mainRoot} = selectableWorktrees(parseWorktreeList(porcelain));
        if (worktrees.some(tree=>tree.root===currentRoot)) {
          scope = scopeForWorktree(scope,worktrees,currentRoot,{home:userHome});
          picker = {worktrees,mainRoot,...await probeWorktrees({worktrees,scope,homes,userHome,git,now,registry})};
        }
      } catch {
        // A corrupt list or unreadable probe leaves the current worktree selected.
      }
      if (io.signal?.aborted) return 0;
      if (picker) {
        const {chooseWatchWorktree} = await import('./worktree-menu.mjs');
        const root = await chooseWatchWorktree({input,output,env,signals:io.process,registry,currentRoot,home:userHome,...picker});
        if (root===null) return 0;
        scope = scopeForWorktree(scope,picker.worktrees,root,{home:userHome});
      }
    }
    platforms = await choose({input,output,env,signals:io.process,registry});
  } catch (cause) {
    if (cause.code === 'ARC_CANCELLED') return 130;
    throw cause;
  }
  if (platforms === null) return 0;
  return followWatch(options,{...io,input,output,error,registry,platforms,scope,homes,homeErrors,git});
}

export async function followWatch(options, io = {}) {
  if (io.signal?.aborted) return 0;
  const input = io.input ?? process.stdin;
  const output = io.output ?? process.stdout, error = io.error ?? process.stderr;
  const cwd = io.cwd ?? process.cwd(), env = io.env ?? process.env;
  const registry = io.registry ?? DEFAULT_PLATFORM_REGISTRY;
  const userHome = io.userHome ?? os.homedir();
  const {homes,homeErrors} = io.homes ? {homes:io.homes,homeErrors:io.homeErrors ?? {}}
    : resolveWatchHomes({registry,userHome,env,cwd});
  const disabled = Object.entries(homeErrors).filter(([platform])=>io.platforms.includes(platform))
    .map(([platform,message])=>`${platform} disabled: ${message}`);
  const platforms = io.platforms.filter(platform => homes[platform] !== null);
  if (!platforms.length) { error.write('Error: no usable watch source.\n'); return 1; }
  const now = io.now ?? Date.now, git = io.git ?? createGitRunner({env});
  const proc = io.process ?? process, schedule = io.setInterval ?? setInterval, unschedule = io.clearInterval ?? clearInterval;
  let width, watcher, timer, stopped = false, active;
  const wrap = Boolean(!options.json && (output.isTTY || options.width != null));
  const color = Boolean(output.isTTY && !options.json && !env.NO_COLOR);
  const blockEnabled = Boolean(output.isTTY && !options.json);
  const fancy = color && env.TERM !== 'dumb';
  const label = io.scope?.display ?? watchLocationLabel({dir:cwd,home:userHome});
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
  const blockWidth = () => Math.min(width, output.columns || width);
  resize();
  return new Promise(resolve => {
    const signals = ['SIGINT','SIGTERM','SIGHUP'];
    let rawModeEnabled = false, startupComplete = false;
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
        const lines = statusBlockLines({label,busy,glyph:frames[frame],tick,color,fancy,width:blockWidth()});
        if (busy) frame = (frame + 1) % frames.length;
        drawnLines = lines.length;
        output.write(lines.join('\n'));
      }
    };
    const onKey = chunk => {
      for (const byte of Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) {
        if (stopped) break;
        if (byte === 0x03) stop();
        else if (byte === 0x08 && startupComplete) {
          const {events,remaining} = watcher.earlier(L.earlierPage);
          const {start,end} = earlierPageLines({shown:events.length,remaining});
          const separator = line => {
            const clipped = line.slice(0, Math.max(0, blockWidth() - 1));
            return color ? `\x1b[2m${clipped}\x1b[0m` : clipped;
          };
          write(events,[separator(start)],end === undefined ? undefined : separator(end));
        } else if (byte === 0x0c) {
          output.write('\x1b[H\x1b[2J\x1b[3J');
          drawnLines = 0;
          drawBlock();
        }
      }
    };
    const write = (events, leadingLines, trailingLine) => {
      if (stopped) return;
      eraseBlock();
      if (leadingLines?.length) output.write(leadingLines.join('\n') + '\n');
      for (const event of events) {
        if (stopped) break;
        output.write((options.json ? renderJson(event) : renderHuman(event,{width,color,verbose:options.verbose,wrap})) + '\n');
      }
      if (!stopped && trailingLine !== undefined) output.write(trailingLine + '\n');
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
      const scope = io.scope ?? await resolveScope({dir:cwd,git});
      if (stopped) return;
      watcher = createWatcher({options:{...options,platforms,earlier:keysEnabled},homes:{...homes,user:userHome},scope,git,now,registry});
      const disabledEvents = [];
      for (const text of disabled) {
        const ts = new Date(now()).toISOString();
        const event = {v:1,ts,observedAt:ts,source:'watch',kind:'notice',label:'watch',text};
        if (blockEnabled) disabledEvents.push(event);
        else write([event]);
      }
      const startup = await watcher.start();
      if (blockEnabled) {
        const [header, ...events] = startup;
        const keys = keysEnabled ? ['Ctrl-C stop','Ctrl-H earlier','Ctrl-L clear'] : ['Ctrl-C stop'];
        const lines = renderBrief(header.brief, {version:packageVersion,keys,width:blockWidth(),color});
        write([...disabledEvents,...events.filter(event => event.startup !== 'live')], lines);
      } else write(startup);
      startupComplete = true;
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
