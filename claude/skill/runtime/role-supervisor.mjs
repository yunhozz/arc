// Detached supervisor for bridge dispatches: the only code that starts a bridge child CLI.
// It records state transitions under the routing lock, observes the child stream, enforces timeout/cancel, and writes the terminal state only after the child's exit is observed.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULT_POLICY, reason} from './role-dispatch-policy.mjs';
import {readLease, writeLease, writeHeartbeat, cancelRequested, TERMINAL_STATES} from './role-dispatch-store.mjs';
import {withRoutingLock, readActivation} from './role-routing.mjs';
import {observeCooperativeTarget} from './scope.mjs';
import {resolveConfigHome, resolveLocalCli, localCliEnvironment} from './local-cli.mjs';
import {parseCompositeProfile, buildClaudeArgs, buildCodexArgs, argsDigest, ROLE_BRIDGE_PERMISSIONS} from './role-bridge-args.mjs';
import {createLineParser, normalizeClaudeStreamEvent, normalizeCodexStreamEvent, eventRecord, evaluateClaudeInit, evaluateCodexContext, readClaudeTranscriptEffort, readCodexTurnContext, classifyFailure, snapshotWorktree, detectViolations} from './role-observe.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const STDERR_LIMIT = 65536;

/** `ps -o lstart=` start time; used with the pid to tell a live process from a reused pid. Null when ps is unavailable or the pid is gone. */
export function processStartTime(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {encoding: 'utf8', env: {PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL: 'C'}, timeout: 5000});
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().replace(/\s+/g, ' ') || null;
}
export function processAlive({pid, startTime} = {}) {
  const current = processStartTime(pid);
  return current !== null && current === startTime;
}

/** Worktree root and git common dir for a cwd that may be a subdirectory of the worktree. */
export async function resolveWorktree(cwd) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const result = spawnSync('git', ['--no-pager', 'rev-parse', '--show-toplevel'], {cwd, env: {...env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0'}, encoding: 'utf8', timeout: 10000});
  if (result.error || result.status !== 0 || !result.stdout.endsWith('\n')) throw Error('Worktree root unavailable');
  return observeCooperativeTarget(result.stdout.slice(0, -1));
}
export const artifactDirectory = (target, workflowId, dispatchId) => path.join(target.gitCommonDir, 'arc', 'workflows', workflowId, 'dispatches', dispatchId);
/** Segment 0 (the first run) keeps its files in the dispatch directory; resumed segments use segments/<n>/. */
export const segmentDirectory = (target, workflowId, dispatchId, segment) => segment > 0 ? path.join(artifactDirectory(target, workflowId, dispatchId), 'segments', String(segment)) : artifactDirectory(target, workflowId, dispatchId);

/** Builds the child CLI arguments from the hash-verified target profile. Errors carry reasonCode. */
export async function buildBridgeInvocation({lease, config, homes, worktree, resultPath, policy = DEFAULT_POLICY}) {
  const fail = (reasonCode, message) => Object.assign(Error(message), {reasonCode});
  const requested = config.roles[lease.role], platform = requested.platform;
  const file = path.join(homes[platform], 'agents', `arc-routing-${lease.role.slice('arc_'.length)}.${platform === 'codex' ? 'toml' : 'md'}`);
  let bytes;
  try { bytes = await fsp.readFile(file); } catch { throw fail('activation_unverified', 'Profile unreadable'); }
  if (sha256(bytes) !== lease.profileHash) throw fail('activation_unverified', 'Profile hash differs from the reserved lease');
  let profile, args;
  try {
    profile = parseCompositeProfile(platform, bytes);
    args = platform === 'claude' ? buildClaudeArgs({role: lease.role, profile, sessionId: lease.sessionId, policy}) : buildCodexArgs({role: lease.role, profile, worktree, resultPath, threadId: lease.sessionId, policy});
  } catch { throw fail('permission_scope_unverified', 'Profile arguments unavailable'); }
  const permissions = ROLE_BRIDGE_PERMISSIONS[platform][lease.role];
  const expected = platform === 'claude'
    ? {model: requested.model, effort: requested.effort, tools: profile.tools, permissionMode: permissions.permissionMode}
    : {model: requested.model, effort: requested.effort, sandboxMode: permissions.sandboxMode, approvalPolicy: 'never'};
  return {platform, args, argsDigest: argsDigest(args), expected, requested};
}

/** Starts this module as a detached supervisor process (own session, stdio ignored, unref'd). env defaults to the inherited environment. */
export async function startSupervisor({codexHome, dispatchId, cwd, userHome, env = process.env}) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), codexHome, dispatchId, cwd, userHome], {detached: true, stdio: 'ignore', env, cwd});
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  const startTime = processStartTime(child.pid);
  if (startTime === null) { try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ } throw Error('Supervisor start time unavailable'); }
  return {pid: child.pid, startTime};
}

export async function runSupervisor(options) {
  const {codexHome, dispatchId, cwd, userHome, env = process.env, policy = DEFAULT_POLICY} = options;
  const heartbeatMs = options.heartbeatMs ?? policy.heartbeatMs, graceMs = options.graceMs ?? policy.cancelGraceMs;
  const eventsMax = options.eventsMaxBytes ?? policy.eventsMaxBytes, codexWaitMs = options.codexWaitMs ?? 10000;
  const lockRetryMs = options.lockRetryMs ?? policy.lockRetryMs, lockDeadlineMs = options.lockDeadlineMs ?? 30000;
  const startedAt = new Date().toISOString();

  // Lease writes retry a busy lock; the supervisor never gives up a terminal write because of a short contention.
  const locked = async fn => {
    const deadline = Date.now() + lockDeadlineMs;
    for (;;) {
      try { return await withRoutingLock(codexHome, fn, {retryMs: lockRetryMs}); } catch (error) {
        if (error?.code === 'ARC_ROUTING_LOCK_RELEASE' && !error.failure) return error.value;
        if (error?.code === 'ARC_ROUTING_LOCK_BUSY' && Date.now() < deadline) continue;
        throw error;
      }
    }
  };
  const context = {cwd, userHome, env};
  const homes = {codex: resolveConfigHome('codex', context), claude: resolveConfigHome('claude', context)};
  const target = await resolveWorktree(cwd);
  let lease = await readLease(codexHome, dispatchId);
  if (!lease || lease.route !== 'bridge') return;
  const artifactDir = segmentDirectory(target, lease.workflowId, dispatchId, lease.segment), resultFile = path.join(artifactDir, 'result.md');
  const mine = current => current && current.state === 'starting' && current.supervisor?.pid === process.pid;
  let config;
  const guarded = await locked(async () => {
    const current = await readLease(codexHome, dispatchId);
    if (!mine(current)) return false;
    lease = current;
    try { config = await readActivation(homes, lease.revision); } catch { config = null; }
    return true;
  });
  if (!guarded) return; // not the supervisor registered for this dispatch

  const timers = new Set();
  let hbBusy = false;
  const beat = async () => { if (hbBusy) return; hbBusy = true; try { await writeHeartbeat(codexHome, dispatchId, {at: Date.now(), pid: process.pid}); } catch { /* heartbeat loss is detected by observe */ } finally { hbBusy = false; } };
  await beat();
  timers.add(setInterval(beat, heartbeatMs));

  const writeRecord = async body => {
    const file = path.join(artifactDir, 'record.json');
    await fsp.writeFile(file, JSON.stringify({version: 1, dispatchId, role: lease.role, startedAt, endedAt: new Date().toISOString(), ...body}, null, 2) + '\n', {mode: 0o600});
    await fsp.chmod(file, 0o600);
  };
  const commit = async (state, codes, claims, extra = {}) => {
    await locked(async () => {
      const current = await readLease(codexHome, dispatchId);
      if (!current || TERMINAL_STATES.includes(current.state)) return;
      await writeLease(codexHome, {...current, state, claims: claims ?? current.claims, reasons: [...new Set(codes)].map(reason), sessionId: extra.sessionId ?? current.sessionId, resultPath: extra.resultPath ?? null});
    });
  };
  const earlyFailure = async (code, spawned = null) => {
    const claims = {...(lease.claims ?? {}), terminal: {level: 'runtime-observed', source: 'supervisor'}};
    await writeRecord({state: 'failed', reasons: [code], spawned: spawned !== null, ...(spawned !== null ? {childPid: spawned} : {})}).catch(() => {});
    await commit('failed', [code], claims);
  };

  let child = null, eventsFd = null, killTimers = [], terminating = null, termAt = 0;
  const killGroup = signal => { if (child?.pid) { try { (options.signalGroup ?? process.kill)(-child.pid, signal); } catch { /* group already gone */ } } };
  const groupAlive = () => { try { process.kill(-child.pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
  // Terminal states are recorded only after the whole process group is observed gone: SIGKILL goes to the group after the grace period even when the leader already exited.
  const reapGroup = async () => {
    if (!child?.pid || !termAt) return true;
    const killAt = termAt + graceMs, giveUp = killAt + Math.max(graceMs, 500);
    for (;;) {
      if (!groupAlive()) return true;
      const now = Date.now();
      if (now >= killAt) killGroup('SIGKILL');
      if (now >= giveUp) return false;
      await sleep(25);
    }
  };
  try {
    if (config === null) return await earlyFailure('activation_unverified');
    const requested = config.roles[lease.role], platform = requested.platform;
    let invocation;
    try { invocation = await buildBridgeInvocation({lease, config, homes, worktree: target.realpath, resultPath: resultFile, policy}); } catch (error) { return await earlyFailure(error.reasonCode ?? 'activation_unverified'); }
    if (invocation.argsDigest !== lease.argsDigest) return await earlyFailure('activation_unverified');
    const brief = await fsp.readFile(path.join(artifactDir, 'brief.md'), 'utf8');
    const cli = resolveLocalCli(platform, context);
    if (cli.reason) return await earlyFailure(cli.reason === 'cli_not_found' ? 'Not Avaliable' : 'execution_failed');
    let before;
    try { before = await snapshotWorktree(target.realpath); } catch { return await earlyFailure('execution_failed'); }

    eventsFd = fs.openSync(path.join(artifactDir, 'events.jsonl'), 'a', 0o600);
    // The child is a process-group leader so one signal reaches its descendants. brief goes to stdin only.
    child = spawn(cli.executable, invocation.args, {cwd: target.realpath, env: {...localCliEnvironment(cli), ARC_BRIDGE_CHILD: dispatchId}, detached: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false});
    let exitResolve, exited = false;
    const exitPromise = new Promise(resolve => { exitResolve = resolve; });
    child.on('exit', (code, signal) => { exited = true; exitResolve({code, signal}); });
    child.on('error', () => { exited = true; exitResolve({code: null, signal: null, spawnError: true}); });
    child.stdin.on('error', () => {});
    if (options.afterSpawn) await options.afterSpawn(child); // test injection point for post-spawn failures
    child.stdin.end(brief);
    const stdoutClosed = new Promise(resolve => { child.stdout.on('close', resolve); child.stdout.on('error', resolve); });

    const state = {init: null, initEval: null, threadId: null, codexEval: null, terminal: false, terminalError: false, resultText: undefined, messages: [], mismatch: null, internal: null};
    let eventsBytes = 0, eventsTruncated = false, stderrLength = 0, contextTask = null;
    const stderrParts = [];
    const terminate = why => {
      if (terminating) return;
      terminating = why; termAt = Date.now(); killGroup('SIGTERM');
      killTimers.push(setTimeout(() => {
        killGroup('SIGKILL');
        killTimers.push(setTimeout(() => exitResolve({code: null, signal: null, unobserved: true}), graceMs));
      }, graceMs));
    };
    const deadline = options.timeoutMs ?? lease.timeoutMinutes * 60000;
    timers.add(setTimeout(() => terminate('timeout'), deadline));
    let cancelBusy = false;
    timers.add(setInterval(async () => {
      if (cancelBusy || terminating || exited) return;
      cancelBusy = true;
      try { if (await cancelRequested(codexHome, dispatchId)) terminate('cancel'); } catch { /* retried on the next tick */ } finally { cancelBusy = false; }
    }, Math.min(heartbeatMs, 200)));

    const writeEvent = normalized => {
      if (eventsTruncated) return;
      const line = JSON.stringify(eventRecord(normalized)) + '\n', size = Buffer.byteLength(line);
      if (eventsBytes + size > eventsMax) { eventsTruncated = true; return; }
      fs.writeSync(eventsFd, line); eventsBytes += size;
    };
    const readContext = async () => readCodexTurnContext({codexHome: homes.codex, threadId: state.threadId, delegationNames: policy.codexDelegationCallNames});
    const watchContext = async () => {
      const limit = Date.now() + codexWaitMs;
      for (;;) {
        const context_ = await readContext();
        if (context_) {
          const evaluation = evaluateCodexContext({context: context_, expected: invocation.expected, policy});
          state.codexEval = evaluation;
          if (evaluation.reason && !state.mismatch) { state.mismatch = evaluation.reason; terminate('mismatch'); }
          return;
        }
        if (exited || Date.now() >= limit) return;
        await sleep(100);
      }
    };
    const handle = raw => {
      const normalized = platform === 'claude' ? normalizeClaudeStreamEvent(raw) : normalizeCodexStreamEvent(raw);
      if (!normalized) return;
      writeEvent(normalized);
      if (normalized.kind === 'init') {
        state.init = normalized; state.initEval = evaluateClaudeInit({init: normalized, expected: invocation.expected});
        if (state.initEval.reason && !state.mismatch) { state.mismatch = state.initEval.reason; terminate('mismatch'); }
      } else if (normalized.kind === 'result') {
        state.terminal = true; state.terminalError = normalized.isError === true; state.resultText = normalized.resultText;
        if (state.terminalError && typeof normalized.resultText === 'string') state.messages.push(normalized.resultText);
      } else if (normalized.kind === 'thread') {
        if (normalized.threadId && !state.threadId) { state.threadId = normalized.threadId; contextTask = watchContext().catch(() => {}); }
      } else if (normalized.kind === 'turn_completed') state.terminal = true;
      else if (normalized.kind === 'turn_failed') { state.terminal = true; state.terminalError = true; if (normalized.message) state.messages.push(normalized.message); }
      else if (normalized.kind === 'warning' && normalized.message) state.messages.push(normalized.message);
    };
    const parser = createLineParser(raw => { try { handle(raw); } catch { /* an unexpected event shape never stops observation */ } });
    child.stdout.on('data', chunk => { try { parser.push(chunk); } catch { /* keep the supervisor alive */ } });
    child.stderr.on('data', chunk => { if (stderrLength < STDERR_LIMIT) { stderrParts.push(chunk); stderrLength += chunk.length; } });

    // Output listeners must be attached before any await: Node drains and discards unread stdio once the child exits.
    try {
      const startTime = child.pid ? processStartTime(child.pid) ?? 'unavailable' : null;
      if (startTime === null) throw Error('Child did not start');
      await locked(async () => {
        const current = await readLease(codexHome, dispatchId);
        if (!mine(current)) throw Error('Lease changed before the child was recorded');
        await writeLease(codexHome, {...current, state: 'running', child: {pid: child.pid, startTime}});
      });
    } catch { state.internal = 'execution_failed'; terminate('internal'); }


    let exit = await exitPromise;
    // A cancel request whose own SIGTERM stopped the child before the marker poll ran still counts as a cancel, and the group is reaped the same way.
    if (!terminating && !exit.unobserved && (exit.signal || !state.terminal) && await cancelRequested(codexHome, dispatchId)) { terminating = 'cancel'; termAt = Date.now(); }
    // A leader that exited on its own may leave descendants in the process group: they are stopped (SIGTERM, grace, SIGKILL) before the post-run snapshot is taken.
    let orphanGroupReaped = false;
    if (!termAt && !exit.unobserved && child?.pid && groupAlive()) { orphanGroupReaped = true; termAt = Date.now(); killGroup('SIGTERM'); }
    if (termAt && !exit.unobserved && !await reapGroup()) exit = {code: null, signal: null, unobserved: true};
    await Promise.race([stdoutClosed, sleep(1000)]);
    parser.end();
    if (contextTask) await contextTask;
    for (const timer of timers) { clearInterval(timer); clearTimeout(timer); }
    for (const timer of killTimers) clearTimeout(timer);
    timers.clear(); killTimers = [];
    fs.closeSync(eventsFd); eventsFd = null;

    if (exit.unobserved) {
      // The child was signalled but its exit was never observed: the slot stays occupied.
      const claims = {...lease.claims, terminal: {level: 'unverified', source: 'none'}};
      await writeRecord({state: 'unknown', reasons: [...(terminating === 'timeout' ? ['timeout'] : []), 'terminal_state_unverified'], terminatedBy: terminating, eventsTruncated, ignoredLines: parser.ignored, lineOverflow: parser.overflow}).catch(() => {});
      await locked(async () => {
        const current = await readLease(codexHome, dispatchId);
        if (current && !TERMINAL_STATES.includes(current.state)) await writeLease(codexHome, {...current, state: 'unknown', claims, reasons: [...(terminating === 'timeout' ? ['timeout'] : []), 'terminal_state_unverified'].map(reason)});
      });
      return;
    }

    let after = null;
    try { after = await snapshotWorktree(target.realpath); } catch { after = null; }
    const violations = after ? detectViolations({role: lease.role, allowedPaths: lease.allowedPaths, before, after}) : {reason: null, changedPaths: [], headChanged: false, refsChanged: false};
    const codes = [];
    if (state.mismatch) codes.push(state.mismatch);
    if (state.internal) codes.push(state.internal);
    let claims, effortMismatch = false;
    const terminalClaim = {level: 'runtime-observed', source: 'supervisor-exit', observed: {exitCode: exit.code, signal: exit.signal}};
    let sessionId = lease.sessionId;
    if (platform === 'claude') {
      const evaluation = state.initEval ?? evaluateClaudeInit({init: null, expected: invocation.expected});
      const observed = await readClaudeTranscriptEffort({claudeHome: homes.claude, sessionId: state.init?.sessionId});
      const effort = observed === null ? {level: 'unverified', source: 'none', requested: requested.effort, observed: null, label: 'model_effort_unverified'}
        : {level: observed === requested.effort ? 'runtime-observed' : 'unverified', source: 'claude-transcript', requested: requested.effort, observed};
      effortMismatch = observed !== null && observed !== requested.effort;
      claims = {...evaluation.claims, effort, terminal: terminalClaim};
      sessionId = state.init?.sessionId ?? sessionId;
    } else {
      let finalContext = null;
      if (state.threadId) finalContext = await readContext().catch(() => null);
      const evaluation = finalContext ? evaluateCodexContext({context: finalContext, expected: invocation.expected, policy}) : state.codexEval ?? evaluateCodexContext({context: null, expected: invocation.expected, policy});
      if (evaluation.reason && !codes.includes(evaluation.reason)) codes.push(evaluation.reason);
      claims = {identity: state.threadId ? {level: 'runtime-observed', source: 'codex-stream-thread', observed: state.threadId} : {level: 'unverified', source: 'none'}, ...evaluation.claims, terminal: terminalClaim};
      sessionId = state.threadId ?? sessionId;
    }
    if (effortMismatch) codes.push('model_effort_mismatch');
    if (violations.reason) codes.push(violations.reason);
    if (after === null) claims.permissions = {level: 'unverified', source: 'worktree-snapshot', details: 'post-run snapshot unavailable'};
    else if (violations.reason) claims.permissions = {...claims.permissions, level: 'unverified', details: 'permission violation observed'};
    if (terminating === 'timeout') codes.push('timeout');

    let resultPath = null;
    if (platform === 'claude') {
      if (state.terminal && !state.terminalError && typeof state.resultText === 'string') { await fsp.writeFile(resultFile, state.resultText, {mode: 0o600}); resultPath = resultFile; }
    } else if (fs.existsSync(resultFile)) resultPath = resultFile;
    if (resultPath) await fsp.chmod(resultPath, 0o600);

    let finalState = 'failed';
    const observedSession = platform === 'claude' ? state.init?.sessionId : state.threadId;
    if (!codes.length && terminating === 'cancel') finalState = 'cancelled';
    else if (!codes.length) {
      const failure = classifyFailure({exitCode: exit.code, signal: exit.signal, terminal: state.terminal, terminalError: state.terminalError, messages: [...state.messages, Buffer.concat(stderrParts).toString('utf8')]});
      if (failure) codes.push(failure);
      else if (!resultPath) codes.push('invalid_output');
      finalState = codes.length ? 'failed' : 'completed';
      if (finalState === 'completed' && !observedSession) {
        // Without a session id the execution identity cannot be tied to this dispatch: the slot stays occupied.
        finalState = 'unknown'; codes.push('execution_identity_unverified');
        claims.identity = {level: 'unverified', source: 'none'};
      }
    }
    if (lease.sessionId && observedSession && observedSession !== lease.sessionId && finalState !== 'cancelled') {
      // A resumed segment must continue the recorded session; a different observed id leaves the slot occupied.
      finalState = 'unknown'; sessionId = lease.sessionId; if (!codes.includes('execution_identity_unverified')) codes.push('execution_identity_unverified');
      claims.identity = {level: 'unverified', source: 'none'};
    }
    if (exit.spawnError && !codes.length) { codes.push('execution_failed'); finalState = 'failed'; }
    await writeRecord({state: finalState, reasons: [...new Set(codes)], exit: {code: exit.code, signal: exit.signal}, terminatedBy: terminating, eventsTruncated, ignoredLines: parser.ignored, lineOverflow: parser.overflow, violations: {changedPaths: violations.changedPaths, headChanged: violations.headChanged, refsChanged: violations.refsChanged}, ...(orphanGroupReaped ? {orphanGroupReaped: true} : {}), argsDigest: invocation.argsDigest, resultPath});
    await commit(finalState, codes, claims, {sessionId, resultPath});
  } catch {
    // Unexpected failure after the child started: stop it, then record a failed state if the child is gone.
    const spawnedPid = child?.pid ?? null;
    let stopped = true;
    if (spawnedPid) { if (!termAt) { termAt = Date.now(); killGroup('SIGTERM'); } stopped = await reapGroup().catch(() => false); }
    for (const timer of timers) { clearInterval(timer); clearTimeout(timer); }
    for (const timer of killTimers) clearTimeout(timer);
    if (eventsFd !== null) { try { fs.closeSync(eventsFd); } catch { /* closed */ } }
    if (stopped) await earlyFailure('execution_failed', spawnedPid).catch(() => {});
    else {
      const codes = ['execution_failed', 'terminal_state_unverified'];
      await writeRecord({state: 'unknown', reasons: codes, spawned: true, childPid: spawnedPid}).catch(() => {});
      await locked(async () => {
      const current = await readLease(codexHome, dispatchId);
      if (current && !TERMINAL_STATES.includes(current.state)) await writeLease(codexHome, {...current, state: 'unknown', reasons: codes.map(reason)});
      }).catch(() => {});
    }
  } finally {
    for (const timer of timers) { clearInterval(timer); clearTimeout(timer); }
  }
}

const isMain = () => { try { return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const [, , codexHome, dispatchId, cwd, userHome] = process.argv;
  runSupervisor({codexHome, dispatchId, cwd, userHome, env: process.env}).then(() => process.exit(0), () => process.exit(1));
}
