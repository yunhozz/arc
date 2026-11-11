import path from 'node:path';
import {WATCH_LIMITS as L} from './model.mjs';
import {sanitizeText, isVisible} from './policy.mjs';
import {topLabel, childLabel, dispatchLabel, roleFromName} from './labels.mjs';
import {normalizeCodexLine} from './normalize-codex.mjs';
import {createClaudeState, normalizeClaudeLine} from './normalize-claude.mjs';
import {createTail, readTail} from './tail.mjs';
import {refreshScope, inScope, claudeDirPrefixes} from './scope.mjs';
import {listCodexRollouts, readCodexMeta} from './discover-codex.mjs';
import {createClaudeDiscovery, readClaudeHead} from './discover-claude.mjs';
import {createDispatchIndex} from './dispatch.mjs';
import {GIT_ALLOWED} from './git.mjs';

/** Read-only, timer-free merger. The caller owns scheduling and output. */
export function createWatcher({options, homes, scope: initialScope, git, now}) {
  const platforms = options.platforms ?? ['codex','claude'];
  const session = options.session ?? null, verbose = Boolean(options.verbose);
  const tailCount = options.tail ?? L.defaultTail;
  let scope = initialScope, closed = false, started = false;
  let lastDiscovery = -Infinity, lastRefresh = now(), capped = false, waiting = false;
  const followed = new Map(), pending = new Map(), ignored = new Map(), detached = new Map();
  const compressed = new Set(), missingDispatch = new Set(), repos = new Map();
  const dispatch = createDispatchIndex({codexHome:homes.codex});
  const claude = homes.claude ? createClaudeDiscovery({claudeHome:homes.claude}) : null;
  const stamp = () => new Date(now()).toISOString();
  const notice = text => ({v:1,ts:stamp(),observedAt:stamp(),source:'watch',label:'watch',kind:'notice',text});
  const debug = (out, text) => { if (verbose) out.push(notice(text)); };
  const sort = events => events.sort((a,b) => (Date.parse(a.ts) || 0) - (Date.parse(b.ts) || 0));
  const clean = event => {
    const e = {...event};
    for (const key of ['text','tool']) if (e[key] !== undefined) e[key] = sanitizeText(e[key]);
    if (e.paths) e.paths = e.paths.map(sanitizeText);
    return e;
  };
  const selectedDispatch = ref => !session || ref.dispatchId === session || ref.sessionIds.includes(session);
  const allowedDispatch = ref => ref.inScope && selectedDispatch(ref);
  function mapped(row) {
    const ref = dispatch.bySession(row.id);
    return ref && ref.inScope ? ref : null;
  }
  function label(row, seen = new Set()) {
    if (seen.has(row.id)) return topLabel(row);
    seen.add(row.id);
    const ref = mapped(row);
    if (ref) return dispatchLabel(ref.rawRole, ref.dispatchId);
    const parent = followed.get(row.parentId);
    return parent ? childLabel(label(parent, seen), row.agent) : topLabel({platform:row.platform,origin:row.origin,sessionId:row.id});
  }
  function identity(row) {
    const ref = mapped(row), parent = followed.get(row.parentId);
    return {
      v:1, observedAt:stamp(), platform:row.platform,
      source:ref ? 'bridge' : parent ? 'subagent' : 'session',
      origin:row.origin, sessionId:row.id, label:label(row), cwd:row.cwd,
      ...(row.parentId ? {parentId:row.parentId,depth:row.depth ?? (parent?.depth ?? 0)+1} : {}),
      ...(ref ? {dispatchId:ref.dispatchId, ...(ref.workflowId ? {workflowId:ref.workflowId} : {}), ...(ref.role ? {role:ref.role} : {})} : {}),
      ...(!ref && roleFromName(row.agent?.agentRole ?? row.agent?.agentType) ? {role:roleFromName(row.agent.agentRole ?? row.agent.agentType)} : {}),
    };
  }
  function sessionText(row) {
    const ref = mapped(row);
    return [row.id.slice(0,8),row.origin,row.version,row.cwd ? `cwd=${row.cwd}` : '',
      ...(ref ? ['dispatch',ref.dispatchId,ref.workflowId] : [])].filter(Boolean).join(' ');
  }
  function normalize(row, lines) {
    const out = [];
    for (const line of lines) {
      const events = row.platform === 'codex' ? normalizeCodexLine(line) : normalizeClaudeLine(line,row.state);
      for (const e of events) {
        if (!isVisible(e.kind,verbose)) continue;
        out.push(clean({...identity(row),...e,ts:e.ts ?? stamp(),...(e.kind === 'session' ? {text:sessionText(row)} : {})}));
      }
    }
    return out;
  }
  function emit(row, events, out) {
    if (row.holdUntil !== undefined && !mapped(row) && now() < row.holdUntil) row.held.push(...events);
    else {
      // Held events receive the final identity only when released.
      out.push(...row.held.map(e=>clean({...e,...identity(row),...(e.kind==='session'?{text:sessionText(row)}:{})})),...events);
      row.held=[]; delete row.holdUntil;
    }
  }
  async function rememberRepo(cwd) {
    if (scope.kind !== 'all' && scope.kind !== 'session') return;
    if (repos.has(cwd) || repos.size >= L.maxRepos) return;
    repos.set(cwd, await git(cwd,GIT_ALLOWED[1]));
  }
  async function scanDispatch() {
    const dirs = [...new Set([scope.gitCommonDir,...repos.values()].filter(Boolean).map(s=>s.trim()))];
    return dispatch.scan({gitCommonDirs:dirs,includeAllLeases:scope.kind==='all'||scope.kind==='session'});
  }
  function dispatchEvents(updates, startup, out) {
    for (const {ref,first} of updates) {
      if (!allowedDispatch(ref)) continue;
      if (startup && (tailCount === 0 || now()-Date.parse(ref.updatedAt) > L.historyWindowMs || !Number.isFinite(Date.parse(ref.updatedAt)))) continue;
      const followedRow = [...followed.values()].find(row=>ref.sessionIds.includes(row.id));
      const platform = ref.childPlatform ?? followedRow?.platform;
      if (platform ? !platforms.includes(platform) : platforms.length < 2) continue;
      const e = {v:1,ts:ref.updatedAt ?? stamp(),observedAt:stamp(),source:'dispatch',label:dispatchLabel(ref.rawRole,ref.dispatchId),kind:'dispatch',dispatchId:ref.dispatchId};
      for (const key of ['workflowId','role','state','reasons','route','hostPlatform']) if (ref[key] !== undefined && ref[key] !== null) e[key]=ref[key];
      if (platform) e.platform=platform;
      out.push(clean(e));
      if (first && !followedRow && !missingDispatch.has(ref.dispatchId)) {
        debug(out,`transcript not found for dispatch ${ref.dispatchId}`); missingDispatch.add(ref.dispatchId);
      }
    }
  }
  function eligible(row) {
    if (!platforms.includes(row.platform) || row.origin === 'Codex Desktop') return false;
    if (row.parentId) return followed.has(row.parentId);
    const ref = mapped(row);
    if (session) return row.id === session || Boolean(ref && selectedDispatch(ref));
    return Boolean(ref) || (row.cwd && inScope(scope,row.cwd));
  }
  async function attach(row, startup, out) {
    let history;
    try { history = await readTail(row.file); }
    catch (error) { debug(out,`session file unreadable: ${label(row)} (${error.code ?? 'error'})`); ignored.set(row.file,row.size); return; }
    const previous = detached.get(row.file);
    row.tail=createTail(row.file,{offset:previous?.offset ?? history.endOffset});
    row.state=createClaudeState(); row.held=[]; row.lastActivity=row.mtimeMs;
    followed.set(row.id,row); pending.delete(row.file); detached.delete(row.file);
    if (!startup && !previous && !mapped(row) && (row.origin==='codex_exec'||row.platform==='claude') && now()-row.mtimeMs<=L.holdCreatedWithinMs) row.holdUntil=now()+L.holdMs;
    const showHistory = startup ? tailCount > 0 && now()-row.mtimeMs<=L.historyWindowMs : !previous;
    if (showHistory) {
      const events=normalize(row,history.lines);
      if (!events.some(e=>e.kind==='session')) events.unshift(clean({...identity(row),ts:events[0]?.ts??stamp(),kind:'session',text:sessionText(row)}));
      emit(row,events,out);
    }
  }
  async function discover(startup, out) {
    const rows=[], updates=await scanDispatch();
    if (homes.codex && platforms.includes('codex')) {
      for (const item of await listCodexRollouts({codexHome:homes.codex,now:now(),startup})) {
        if (item.compressed) {
          if (!compressed.has(item.file)) debug(out,`compressed session skipped: ${path.basename(item.file)}`);
          compressed.add(item.file); continue;
        }
        if ([...followed.values()].some(r=>r.file===item.file)) continue;
        const meta=await readCodexMeta(item.file);
        if (!meta) continue;
        rows.push({...item,id:meta.threadId,platform:'codex',origin:meta.originator,cwd:meta.cwd,version:meta.cliVersion,parentId:meta.parentId,depth:meta.depth,agent:{agentRole:meta.agentRole,nickname:meta.agentNickname}});
      }
    }
    if (claude && platforms.includes('claude')) {
      const prefixes=dispatch.list().some(ref=>ref.inScope)?null:claudeDirPrefixes(scope);
      const mains=await claude.scan({prefixes,now:now(),startup});
      for (const item of mains) {
        const head=await readClaudeHead(item.file);
        if (!head) {
          const wait=pending.get(item.file) ?? {...item,until:now()+L.claudeCwdWaitMs,cwdWaiting:true};
          if (now()<wait.until) pending.set(item.file,wait); else {pending.delete(item.file);ignored.set(item.file,item.size);}
          continue;
        }
        pending.delete(item.file);
        const main={...item,id:head.sessionId,platform:'claude',origin:head.entrypoint,cwd:head.cwd,version:head.version};
        if (!followed.has(main.id)) rows.push(main);
        for (const child of await claude.subagents(item.file)) {
          const childHead=await readClaudeHead(child.file);
          rows.push({...child,id:childHead?.sessionId??child.agentId,platform:'claude',origin:head.entrypoint,cwd:childHead?.cwd??head.cwd,version:childHead?.version??head.version,parentId:main.id,agent:{agentType:child.meta?.agentType}});
        }
      }
    }
    for (const row of rows) await rememberRepo(row.cwd);
    updates.push(...await scanDispatch());
    rows.sort((a,b)=>b.mtimeMs-a.mtimeMs||a.file.localeCompare(b.file));
    let remaining=rows.filter(row=>!followed.has(row.id)&&ignored.get(row.file)!==row.size&&(!detached.has(row.file)||row.size>detached.get(row.file).size));
    let progress=true;
    while(progress) {
      progress=false;
      const next=[];
      for(const row of remaining) {
        if (!eligible(row)) {next.push(row);continue;}
        if (followed.size>=L.maxFollowed) {
          const oldest=[...followed.values()].sort((a,b)=>a.mtimeMs-b.mtimeMs)[0];
          if (!capped) {out.push(notice('following the newest 64 sessions; others are skipped'));capped=true;}
          if (oldest.mtimeMs>=row.mtimeMs || row.parentId===oldest.id) continue;
          followed.delete(oldest.id); detached.set(oldest.file,{offset:oldest.tail.offset,size:oldest.size});
        }
        await attach(row,startup,out);progress=true;
      }
      remaining=next;
    }
    for (const row of remaining) {
      if (row.parentId && row.origin!=='Codex Desktop') {
        const wait=pending.get(row.file) ?? {...row,until:now()+L.holdMs};
        if (now()>=wait.until) {pending.delete(row.file);ignored.set(row.file,row.size);debug(out,`parent session not found for ${row.id}`);}
        else pending.set(row.file,wait);
      }
    }
    // Mapping may arrive after a session has already produced output.
    for (const row of followed.values()) {
      const ref=mapped(row);
      if (ref && row.dispatchId!==ref.dispatchId) {
        if (row.emitted) out.push(notice(`session ${row.id.slice(0,8)} is dispatch ${ref.dispatchId} (${ref.role??'dispatch'})`));
        row.dispatchId=ref.dispatchId;
      }
      emit(row,[],out);
    }
    dispatchEvents(updates,startup,out);
    if (session && !waiting && ![...followed.values()].some(row=>row.id===session||mapped(row)?.dispatchId===session) && !dispatch.byId(session)?.inScope) {
      out.push(notice(`waiting for session ${session}`));waiting=true;
    }
    lastDiscovery=now();
  }
  async function poll(out) {
    for (const [id,row] of followed) {
      let result;
      try { result=await row.tail.poll(); }
      catch (error) {
        followed.delete(id);ignored.set(row.file,row.size);
        debug(out,`session file unreadable: ${label(row)} (${error.code??'error'})`);continue;
      }
      if (result.gone) {followed.delete(id);debug(out,`session file removed: ${label(row)}`);continue;}
      if (result.reset) {row.state=createClaudeState();debug(out,`session restarted from the beginning: ${label(row)}`);}
      if (result.overflowed && !row.overflowed) debug(out,`line over 4 MiB skipped in ${label(row)}`);
      row.overflowed=result.overflowed;
      if (row.tail.offset!==row.size) row.lastActivity=now();
      row.size=row.tail.offset;
      emit(row,normalize(row,result.lines),out);
      if (now()-row.lastActivity>=L.idleDetachMs && !row.held.length) {
        followed.delete(id);detached.set(row.file,{offset:row.tail.offset,size:row.size});debug(out,`detached idle session ${label(row)}`);
      }
    }
  }
  function markEmitted(events) {
    for (const e of events) if (e.sessionId && followed.has(e.sessionId)) followed.get(e.sessionId).emitted=true;
    return events.map(clean);
  }
  return {
    async start() {
      if (started||closed) return [];
      started=true;
      const description=session?`session ${session}`:scope.kind==='repo'?`repo ${scope.roots[0]} (${scope.roots.length} worktrees)`:scope.kind==='dir'?`dir ${scope.roots[0]}`:'all';
      const out=[];await discover(true,out);
      const history=sort(out.filter(e=>e.source!=='watch')).slice(-tailCount || Infinity);
      const diagnostics=out.filter(e=>e.source==='watch');
      return markEmitted([notice(`arc watch: scope ${description} · ${platforms.join('+')} · Ctrl-C to stop`),...diagnostics,...(tailCount?history:[]),notice('live')]);
    },
    async tick() {
      if (!started||closed) return [];
      const out=[];
      if (now()-lastRefresh>=L.worktreeRefreshMs) {scope=await refreshScope(scope,git);lastRefresh=now();}
      if (now()-lastDiscovery>=L.discoveryMs||pending.size||[...followed.values()].some(row=>row.holdUntil!==undefined)) await discover(false,out);
      await poll(out);
      return markEmitted(sort(out));
    },
    async close() {closed=true;followed.clear();pending.clear();},
  };
}
