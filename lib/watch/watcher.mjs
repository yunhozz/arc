import path from 'node:path';
import fsp from 'node:fs/promises';
import {WATCH_LIMITS as L, MESSAGE_KINDS} from './model.mjs';
import {sanitizeText, sanitizeMessage, isVisible} from './policy.mjs';
import {topLabel, childLabel, dispatchLabel, roleFromName} from './labels.mjs';
import {createCodexState, normalizeCodexLine, codexLineCwd} from './normalize-codex.mjs';
import {createClaudeState, normalizeClaudeLine, parseClaudeAgentMeta, claudeLineCwd} from './normalize-claude.mjs';
import {createTail, readTail, readHead, readLatestCwd} from './tail.mjs';
import {refreshScope, inScope, claudeDirPrefixes, realPath} from './scope.mjs';
import {listCodexRollouts, readCodexMeta} from './discover-codex.mjs';
import {createClaudeDiscovery, readClaudeHead} from './discover-claude.mjs';
import {createDispatchIndex} from './dispatch.mjs';
import {resolveDispatchStore} from './anchor-store.mjs';
import {DEFAULT_PLATFORM_REGISTRY} from '../runtime/platform-registry.mjs';
import {GIT_ALLOWED} from './git.mjs';

/** Read-only, timer-free merger. The caller owns scheduling and output. */
export function createWatcher({options, homes, scope: initialScope, git, now, registry = DEFAULT_PLATFORM_REGISTRY, dependencies = {}}) {
  const {readClaudeHead: claudeHead = readClaudeHead, readCodexMeta: codexMeta = readCodexMeta,
    lstat = fsp.lstat, maxKnown = L.maxKnown, createClaudeDiscovery: claudeDiscovery = createClaudeDiscovery, createDispatchIndex: dispatchIndex = createDispatchIndex} = dependencies;
  const platforms = options.platforms ?? registry.byDisplayOrder().filter(d => d.capabilities.watch.state==='verified').map(d => d.id);
  const verbose = Boolean(options.verbose);
  const tailCount = options.tail ?? L.defaultTail;
  let scope = initialScope, closed = false, started = false;
  let lastDiscovery = -Infinity, lastRefresh = now(), capped = false;
  const followed = new Map(), pending = new Map(), ignored = new Map(), detached = new Map();
  const seenAtStart = new Map(), heads = new Map(), metas = new Map(), agentMetas = new Map(), childLists = new Map();
  const known = new Map(), latestCwds = new Map();
  const compressed = new Set(), missingDispatch = new Set();
  const rootsByCwd = new Map(), gitTopByCwd = new Map(), shellRoots = new Map();
  const nestedChecks = new Map(), nestedFailures = new Map();
  let lastNestedRefresh = -Infinity;
  let shellCursor = 0;
  let dispatch;
  const claude = homes.claude ? claudeDiscovery({claudeHome:homes.claude}) : null;
  const stamp = () => new Date(now()).toISOString();
  const notice = text => ({v:1,ts:stamp(),observedAt:stamp(),source:'watch',label:'watch',kind:'notice',text});
  const debug = (out, text) => { if (verbose) out.push(notice(text)); };
  const sort = events => events.sort((a,b) => (Date.parse(a.ts) || 0) - (Date.parse(b.ts) || 0));
  const clean = event => {
    const e = {...event};
    if (e.text !== undefined) e.text = MESSAGE_KINDS.includes(e.kind) ? sanitizeMessage(e.text) : sanitizeText(e.text);
    if (e.tool !== undefined) e.tool = sanitizeText(e.tool);
    if (e.skill !== undefined) e.skill = sanitizeText(e.skill);
    if (e.plugin !== undefined) e.plugin = sanitizeText(e.plugin);
    delete e.skillOnly;
    if (e.paths) e.paths = e.paths.map(sanitizeText);
    return e;
  };
  const dispatchInScope = ref => ref.inScope && (ref.cwd ? inScope(scope,ref.cwd)
    : [...followed.values()].some(row=>ref.sessionIds.includes(row.id) && cwdInScope(row.cwd)));
  function mapped(row) {
    const ref = dispatch.bySession(row.id);
    return ref && ref.inScope && (ref.cwd ? inScope(scope,ref.cwd) : cwdInScope(row.cwd)) ? ref : null;
  }
  const selectedRoot = cwd => path.resolve(cwd)===scope.roots[0] || realPath(cwd)===scope.roots[0];
  function cwdInScope(cwd) {
    if (!cwd || !inScope(scope,cwd)) return false;
    return scope.kind!=='repo' || selectedRoot(cwd) || nestedChecks.get(cwd)?.inside===true;
  }
  async function verifyCwd(cwd, out) {
    if (scope.kind!=='repo' || !cwd || !inScope(scope,cwd) || selectedRoot(cwd) || nestedChecks.has(cwd)) return;
    if (now()-(nestedFailures.get(cwd)??-Infinity)<L.discoveryMs) return;
    let result;
    try { result=(await git(cwd,GIT_ALLOWED[0]))?.trim(); }
    catch { /* A failed check remains outside until the next discovery interval. */ }
    if (!result) {nestedFailures.set(cwd,now());return;}
    const top=realPath(result), inside=top===scope.roots[0];
    nestedFailures.delete(cwd);
    if (nestedChecks.size>=L.maxRepos) nestedChecks.delete(nestedChecks.keys().next().value);
    nestedChecks.set(cwd,{inside});
    // Reuse successful lookups for root/shell identity without caching failures here.
    if (gitTopByCwd.size>=L.maxRepos) gitTopByCwd.delete(gitTopByCwd.keys().next().value);
    gitTopByCwd.set(cwd,top);
    if (!inside && now()-lastNestedRefresh>=L.discoveryMs) {
      scope=await refreshScope(scope,git);
      lastRefresh=now();lastNestedRefresh=lastRefresh;
    }
  }
  const anyCwdInScope = row => cwdInScope(row.cwd) || cwdInScope(row.latestCwd);
  const parentOf = row => followed.get(row.parentId) ?? known.get(row.parentId);
  function rememberKnown(row) {
    const {id,platform,origin,parentId,agent,depth}=row;
    known.delete(id);
    known.set(id,{id,platform,origin,parentId,agent,depth});
    while (known.size>maxKnown) known.delete(known.keys().next().value);
  }
  function ancestry(row) {
    const seen=new Set([row.id]);
    let desktop=false;
    for (let steps=0; row.parentId && steps<maxKnown; steps++) {
      const parent=parentOf(row);
      if (!parent || seen.has(parent.id)) return {resolved:false,desktop};
      desktop ||= parent.origin==='Codex Desktop';
      seen.add(parent.id);
      row=parent;
    }
    return {resolved:!row.parentId,desktop};
  }
  function lineGate(row) {
    return Boolean(mapped(row)) || cwdInScope(row.cwd);
  }
  async function setCwd(row, cwd, out) {
    row.state.cwd=cwd;
    if (row.cwd===cwd) return;
    row.cwd=cwd;
    row.gitTop=await gitTop(cwd);
    row.root=await sessionRoot(cwd);
  }
  async function ensureShellRoot(row, out) {
    if (row.gitTop && !shellRoots.has(row.gitTop) && shellRoots.size < L.maxRepos) {
      const state = {snapshot:null,pending:false,pendingSince:undefined,lastTriggerAt:-Infinity,
        lastScanAt:-Infinity,prevScanAt:-Infinity,claims:new Map(),candidates:new Map(),failures:0,off:false};
      shellRoots.set(row.gitTop,state);
      await scanRoot(row.gitTop,state,out);
    }
  }
  function label(row, seen = new Set()) {
    if (seen.has(row.id)) return topLabel(row);
    seen.add(row.id);
    const ref = mapped(row);
    if (ref) return dispatchLabel(ref.rawRole, ref.dispatchId);
    const parent = parentOf(row);
    return parent ? childLabel(label(parent, seen), row.agent) : topLabel({platform:row.platform,origin:row.origin,sessionId:row.id});
  }
  function identity(row) {
    const ref = mapped(row), parent = parentOf(row);
    return {
      v:1, observedAt:stamp(), platform:row.platform,
      source:ref ? 'bridge' : parent ? 'subagent' : 'session',
      origin:row.origin, sessionId:row.id, label:label(row), cwd:row.cwd,
      ...(row.root ? {root:row.root} : {}),
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
  async function normalize(row, lines, live = false, out = []) {
    const events = [];
    let sawInScope=false, firstSession;
    for (const line of lines) {
      const cwd=row.platform==='codex'?codexLineCwd(line):claudeLineCwd(line);
      if (cwd) await setCwd(row,cwd,out);
      await verifyCwd(row.cwd,out);
      if (row.gitTop===undefined && gitTopByCwd.has(row.cwd)) {
        row.gitTop=await gitTop(row.cwd);
        row.root=await sessionRoot(row.cwd);
      }
      const inside=lineGate(row), entering=row.inScopeNow===false && inside;
      if (entering) events.push(clean({...identity(row),ts:line.timestamp??stamp(),kind:'session',text:sessionText(row)}));
      if (row.inScopeNow===true && !inside) debug(out,`session ${row.id.slice(0,8)} left scope: cwd=${row.cwd}`);
      row.inScopeNow=inside;
      row.codexState.cwd=row.cwd;
      const normalized = row.platform === 'codex'
        ? normalizeCodexLine(line,row.codexState,{codexHome:homes.codex,userHome:homes.user})
        : normalizeClaudeLine(line,row.state);
      if (inside) {
        await ensureShellRoot(row,out); sawInScope=true;
        const shell=shellRoots.get(row.gitTop);
        if (live && shell && !shell.off) {
          shell.pending=true; shell.pendingSince ??= now(); shell.lastTriggerAt=now();
          shell.candidates.set(row.id,{ts:now(),identity:identity(row)});
        }
      }
      for (const e of normalized) {
        if (['turn_end','turn_failed'].includes(e.kind)) row.active = false;
        else if (['turn_start','user','agent','reasoning','command','tool','tool_failed','file_change','file_create','file_delete','spawn','approval'].includes(e.kind)) row.active = true;
        if (!inside) continue;
        if (e.kind==='command' && e.skillOnly && !verbose) continue;
        const shell = shellRoots.get(row.gitTop);
        if (live && shell && !shell.off && ['file_change','file_create','file_delete'].includes(e.kind)) {
          for (const file of e.paths ?? []) {
            const absolute=path.resolve(row.cwd,file);
            shell.claims.set(path.join(realPath(path.dirname(absolute)),path.basename(absolute)),now());
          }
        }
        if (!isVisible(e.kind,verbose) || (e.kind === 'notice' && !verbose)) continue;
        firstSession ??= clean({...identity(row),ts:e.ts??stamp(),kind:'session',text:sessionText(row)});
        if (entering && e.kind==='session') continue;
        events.push(clean({...identity(row),...e,ts:e.ts ?? stamp(),...(e.kind === 'session' ? {text:sessionText(row)} : {})}));
      }
    }
    return {events,sawInScope,firstSession};
  }
  function emit(row, events, out) {
    if (row.holdUntil !== undefined && !mapped(row) && now() < row.holdUntil) row.held.push(...events);
    else {
      // Held events receive the final identity only when released.
      out.push(...row.held.map(e=>{
        const atLine={...row,cwd:e.cwd,root:e.root};
        return clean({...e,...identity(atLine),...(e.kind==='session'?{text:sessionText(atLine)}:{})});
      }),...events);
      row.held=[]; delete row.holdUntil;
    }
  }
  async function scanDispatch() {
    return dispatch.scan({gitCommonDirs:scope.gitCommonDir ? [scope.gitCommonDir] : []});
  }
  function dispatchEvents(updates, startup, out) {
    for (const {ref,first} of updates) {
      if (!dispatchInScope(ref)) continue;
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
    if (row.parentId) {
      const chain=ancestry(row);
      if (chain.desktop) {ignored.set(row.file,row.size);return false;}
      return chain.resolved && anyCwdInScope(row);
    }
    const ref = mapped(row);
    return Boolean(ref) || anyCwdInScope(row);
  }
  async function attach(row, startup, out) {
    const previous = detached.get(row.file) ?? (!startup && !pending.has(row.file) ? seenAtStart.get(row.file) : undefined);
    let history;
    try { history = previous ? {endOffset:previous.offset} : await readTail(row.file); }
    catch (error) { debug(out,`session file unreadable: ${row.id.slice(0,8)} (${error.code ?? 'error'})`); ignored.set(row.file,row.size); return; }
    row.headCwd=row.cwd;
    row.tail=createTail(row.file,{offset:previous?.offset ?? history.endOffset});
    row.state=createClaudeState(); row.codexState=createCodexState(); row.active=false; row.held=[]; row.lastActivity=row.mtimeMs;
    row.cwd=undefined;
    await setCwd(row,previous?.cwd??row.headCwd,out);
    await verifyCwd(row.cwd,out);
    followed.set(row.id,row); pending.delete(row.file); detached.delete(row.file);
    if (!startup && !previous && !row.parentId && !mapped(row) && (row.origin==='codex_exec'||row.platform==='claude') && now()-row.mtimeMs<=L.holdCreatedWithinMs) row.holdUntil=now()+L.holdMs;
    const showHistory = startup ? tailCount > 0 && now()-row.mtimeMs<=L.historyWindowMs : !previous;
    const {events,firstSession}=await normalize(row,history.lines??[],false,out);
    if (showHistory) {
      if (!events.some(e=>e.kind==='session')) {
        const initialSession=firstSession ?? (lineGate(row)
          ? clean({...identity(row),ts:stamp(),kind:'session',text:sessionText(row)}) : undefined);
        if (initialSession) events.unshift(initialSession);
      }
      emit(row,events,out);
    }
    if (row.inScopeNow===undefined) row.inScopeNow=lineGate(row);
    if (lineGate(row)) await ensureShellRoot(row,out);
    if (seenAtStart.has(row.file)) seenAtStart.get(row.file).cwd=row.cwd;
  }
  async function gitTop(cwd) {
    if (!cwd) return undefined;
    if (scope.kind==='repo' && inScope(scope,cwd)) {
      // setCwd needs the same check before it can populate root/shell identity.
      await verifyCwd(cwd);
      if (selectedRoot(cwd)) return scope.roots[0];
      if (nestedFailures.has(cwd)) return undefined;
    }
    if (gitTopByCwd.has(cwd)) return gitTopByCwd.get(cwd);
    let top;
    try {
      const result = (await git(cwd,GIT_ALLOWED[0]))?.trim();
      if (result) top = realPath(result);
    }
    catch { /* Missing Git is equivalent to a non-repository session. */ }
    if (gitTopByCwd.size >= L.maxRepos) gitTopByCwd.delete(gitTopByCwd.keys().next().value);
    gitTopByCwd.set(cwd,top);
    return top;
  }
  async function sessionRoot(cwd) {
    if (!cwd) return undefined;
    try {
      const matches = (scope.roots ?? []).filter(root => inScope({kind:'dir',roots:[root]},cwd));
      if (matches.length) return matches.sort((a,b) => Math.max(path.resolve(b).length,realPath(b).length) - Math.max(path.resolve(a).length,realPath(a).length))[0];
      if (rootsByCwd.has(cwd)) return rootsByCwd.get(cwd);
      const root = await gitTop(cwd) || cwd;
      if (rootsByCwd.size >= L.maxRepos) rootsByCwd.delete(rootsByCwd.keys().next().value);
      rootsByCwd.set(cwd,root);
      return root;
    } catch { return cwd; }
  }
  function rememberStart(item, startup) {
    if (startup) seenAtStart.set(item.file,{...item,offset:item.size,cwd:item.latestCwd??item.cwd});
  }
  async function details(file) {
    try { const {size,mtimeMs} = await fsp.stat(file); return {size,mtimeMs}; }
    catch (error) { if (['ENOENT','ENOTDIR','EACCES'].includes(error.code)) return null; throw error; }
  }
  async function cachedHead(cache, item, read) {
    const cached = cache.get(item.file);
    if (cached && cached.size === item.size && cached.mtimeMs === item.mtimeMs) return cached.value;
    const value = await read(item.file);
    cache.set(item.file,{size:item.size,mtimeMs:item.mtimeMs,value});
    return value;
  }
  async function childrenFor(item, startup) {
    const dir = path.join(item.file.slice(0,-6),'subagents');
    const stat = await details(dir);
    if (!stat) { childLists.delete(item.file); return []; }
    let cached = childLists.get(item.file);
    if (!cached || cached.mtimeMs !== stat.mtimeMs) {
      let entries;
      try { entries = await fsp.readdir(dir,{withFileTypes:true}); }
      catch (error) { if (['ENOENT','ENOTDIR','EACCES'].includes(error.code)) return []; throw error; }
      cached = {mtimeMs:stat.mtimeMs,names:entries.filter(entry=>entry.isFile() && /^agent-.+\.jsonl$/.test(entry.name)).map(entry=>entry.name)};
      childLists.set(item.file,cached);
    }
    const children = [];
    for (const name of cached.names) {
      const file = path.join(dir,name), stat = await details(file);
      if (!stat) continue;
      const child = {file,...stat,agentId:name.slice(6,-6)};
      // Remember old child offsets without opening their transcript or metadata.
      if (!skipHead(item,startup) && !skipHead(child,startup)) {
        const metaFile = file.replace(/\.jsonl$/,'.meta.json'), metaStat = await details(metaFile);
        if (metaStat) child.meta = await cachedHead(agentMetas,{file:metaFile,...metaStat},async file=>parseClaudeAgentMeta(await readHead(file,{
          maxBytes:L.claudeHeadBytes,accept:obj=>parseClaudeAgentMeta(obj)!==null,
        })));
      }
      children.push(child);
    }
    return children;
  }
  function skipHead(item, startup) {
    return ignored.get(item.file) === item.size || (startup && now()-item.mtimeMs>L.attachWindowMs)
      || (!startup && !heads.has(item.file) && !metas.has(item.file)
        && seenAtStart.get(item.file)?.size === item.size && !pending.has(item.file)
        && ![...followed.values()].some(row=>row.file===item.file));
  }
  async function codexCandidates(startup) {
    if (!startup) {
      const files = new Map((await listCodexRollouts({codexHome:homes.codex,now:now(),startup:false})).map(item=>[item.file,item]));
      for (const [file,item] of new Map([...seenAtStart,...detached])) {
        if (item.platform !== 'codex' || files.has(file) || [...followed.values()].some(row=>row.file===file)) continue;
        const stat = await details(file);
        if (stat) files.set(file,{...item,...stat,file});
      }
      return [...files.values()];
    }
    // Non-startup discovery exposes old files too. Each call covers two days.
    const files = new Map();
    for (let back=0;back<=L.lookbackDays;back+=2) {
      const date = new Date(now());
      date.setDate(date.getDate()-back);
      for (const item of await listCodexRollouts({codexHome:homes.codex,now:date.getTime(),startup:false})) files.set(item.file,item);
    }
    return [...files.values()];
  }
  async function discover(startup, out) {
    const rows=[];
    const updates = await scanDispatch();
    for (const file of pending.keys()) if (!await details(file)) pending.delete(file);
    if (homes.codex && platforms.includes('codex')) {
      for (const item of await codexCandidates(startup)) {
        rememberStart({...item,platform:'codex'},startup);
        if (item.compressed) {
          if (!compressed.has(item.file)) debug(out,`compressed session skipped: ${path.basename(item.file)}`);
          compressed.add(item.file); continue;
        }
        if ([...followed.values()].some(r=>r.file===item.file)) continue;
        if (skipHead(item,startup)) continue;
        const meta=await cachedHead(metas,item,codexMeta);
        if (!meta) continue;
        const row={...item,id:meta.threadId,platform:'codex',origin:meta.originator,cwd:meta.cwd,version:meta.cliVersion,parentId:meta.parentId,depth:meta.depth,agent:{agentRole:meta.agentRole,nickname:meta.agentNickname}};
        rememberKnown(row);rows.push(row);
      }
    }
    if (claude && platforms.includes('claude')) {
      const prefixes=dispatch.list().some(ref=>ref.inScope)?null:claudeDirPrefixes(scope);
      const mains=await claude.scan({prefixes:startup?null:prefixes,now:now(),startup:false});
      for (const item of mains) {
        rememberStart(item,startup);
        const children=await childrenFor(item,startup);
        for (const child of children) rememberStart(child,startup);
        if (skipHead(item,startup)) continue;
        const head=await cachedHead(heads,item,claudeHead);
        if (!head) {
          const wait=pending.get(item.file) ?? {...item,until:now()+L.claudeCwdWaitMs,cwdWaiting:true};
          if (now()<wait.until) pending.set(item.file,wait); else {pending.delete(item.file);ignored.set(item.file,item.size);}
          continue;
        }
        pending.delete(item.file);
        const main={...item,id:head.sessionId,platform:'claude',origin:head.entrypoint,cwd:head.cwd,version:head.version};
        rememberKnown(main);
        if (!followed.has(main.id)) rows.push(main);
        for (const child of children) {
          if (skipHead(child,startup)) continue;
          const childHead=await cachedHead(heads,child,claudeHead);
          const row={...child,id:`agent-${child.agentId}`,platform:'claude',origin:head.entrypoint,cwd:childHead?.cwd??head.cwd,version:childHead?.version??head.version,parentId:main.id,agent:{agentType:child.meta?.agentType}};
          rememberKnown(row);rows.push(row);
        }
      }
    }
    rows.sort((a,b)=>b.mtimeMs-a.mtimeMs||a.file.localeCompare(b.file));
    let remaining=rows.filter(row=> {
      if (followed.has(row.id) || ignored.get(row.file)===row.size) return false;
      if (startup) return now()-row.mtimeMs<=L.attachWindowMs;
      const previous=detached.get(row.file) ?? seenAtStart.get(row.file);
      return !previous || row.size>previous.size || pending.has(row.file);
    });
    for (const row of remaining) {
      const previous=detached.get(row.file) ?? seenAtStart.get(row.file);
      if (startup || !previous || row.size>previous.size) {
        const extract=row.platform==='codex'?codexLineCwd:claudeLineCwd;
        row.latestCwd=await cachedHead(latestCwds,row,file=>readLatestCwd(file,extract));
      }
      rememberStart(row,startup);
      await verifyCwd(row.cwd,out);
      await verifyCwd(row.latestCwd,out);
    }
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
          followed.delete(oldest.id); detached.set(oldest.file,{file:oldest.file,platform:oldest.platform,offset:oldest.tail.offset,size:oldest.size,cwd:oldest.cwd});
        }
        await attach(row,startup,out);progress=true;
      }
      remaining=next;
    }
    for (const row of remaining) {
      const chain=ancestry(row);
      const missingParent=!chain.resolved;
      if (row.parentId && (!missingParent || chain.desktop)) pending.delete(row.file);
      if (row.parentId && row.origin!=='Codex Desktop' && missingParent && !chain.desktop) {
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
    lastDiscovery=now();
  }
  async function poll(out) {
    for (const [id,row] of followed) {
      let result;
      try { result=await row.tail.poll(); }
      catch (error) {
        followed.delete(id);ignored.set(row.file,row.size);
        debug(out,`session file unreadable: ${row.id.slice(0,8)} (${error.code??'error'})`);continue;
      }
      if (result.gone) {followed.delete(id);debug(out,`session file removed: ${row.id.slice(0,8)}`);continue;}
      if (result.reset) {
        row.state=createClaudeState();row.codexState=createCodexState();row.active=false;
        await setCwd(row,row.headCwd,out);row.inScopeNow=lineGate(row);
        debug(out,`session restarted from the beginning: ${row.id.slice(0,8)}`);
      }
      if (result.overflowed && !row.overflowed) debug(out,`line over 4 MiB skipped in ${row.id.slice(0,8)}`);
      row.overflowed=result.overflowed;
      row.size=row.tail.offset;
      const {events,sawInScope}=await normalize(row,result.lines,true,out);
      if (sawInScope) row.lastActivity=now();
      emit(row,events,out);
      if (now()-row.lastActivity>=L.idleDetachMs && !row.held.length) {
        followed.delete(id);detached.set(row.file,{file:row.file,platform:row.platform,offset:row.tail.offset,size:row.size,cwd:row.cwd});debug(out,`detached idle session ${row.id.slice(0,8)}`);
      }
    }
  }
  async function scanRoot(top, state, out) {
    const scanStart = now();
    for (const [file,ts] of state.claims) if (scanStart - ts > L.shellClaimTtlMs) state.claims.delete(file);
    const disable = reason => {
      state.off=true;
      out.push(notice(`shell change detection off for ${top}: ${reason}`));
    };
    const listing = await git(top,GIT_ALLOWED[3]);
    if (listing === null) {
      state.failures++;
      if (state.failures >= L.shellScanFailureMax) disable(`git ls-files failed ${L.shellScanFailureMax} times`);
    } else {
      state.failures=0;
      const files=listing.split('\0').filter(Boolean);
      if (files.length > L.shellScanMaxFiles) disable(`more than ${L.shellScanMaxFiles} files`);
      else {
        const previous=state.snapshot, snapshot=new Map();
        const paths=[...new Set([...files.map(file=>path.join(top,file)),...(previous?.keys() ?? [])])];
        for (let i=0;i<paths.length;i+=L.shellLstatBatch) {
          await Promise.all(paths.slice(i,i+L.shellLstatBatch).map(async file=>{
            try {
              const stat=await lstat(file);
              if (!stat.isDirectory()) snapshot.set(file,`${stat.mtimeMs}:${stat.size}:${stat.ino}:${stat.mode}`);
            } catch (error) {
              if (!['ENOENT','ENOTDIR'].includes(error.code) && previous?.has(file)) snapshot.set(file,previous.get(file));
            }
          }));
        }
        const changes={file_create:[],file_change:[],file_delete:[]};
        if (previous) {
          for (const file of paths) {
            let kind;
            if (!previous.has(file) && snapshot.has(file)) kind='file_create';
            else if (previous.has(file) && !snapshot.has(file)) kind='file_delete';
            else if (previous.get(file) !== snapshot.get(file)) kind='file_change';
            if (!kind) continue;
            const claim=state.claims.get(file);
            if (claim !== undefined && claim <= scanStart) { state.claims.delete(file); continue; }
            changes[kind].push(file);
          }
        }
        state.snapshot=snapshot;
        const candidate=[...state.candidates].filter(([id,value])=>followed.has(id) && value?.identity).sort((a,b)=>b[1].ts-a[1].ts)[0];
        if (candidate) {
          const row=followed.get(candidate[0]);
          const events=Object.entries(changes).filter(([,files])=>files.length).map(([kind,files])=>
            clean({...candidate[1].identity,observedAt:stamp(),ts:stamp(),kind,paths:files.sort(),inferred:true}));
          emit(row,events,out);
        }
      }
    }
    state.prevScanAt=state.lastScanAt; state.lastScanAt=now();
    state.pending=false; state.pendingSince=undefined; state.candidates.clear();
  }
  async function scanShell(out) {
    const roots=[...shellRoots];
    let scans=0;
    for (let visited=0;visited<roots.length && scans<L.shellScansPerTick;visited++) {
      const [top,state]=roots[shellCursor % roots.length];
      shellCursor=(shellCursor+1) % roots.length;
      if (!state.pending || state.off || now()-state.lastScanAt<L.shellScanMinIntervalMs
        || (now()-state.lastTriggerAt<L.shellScanDelayMs && now()-state.pendingSince<L.shellScanMinIntervalMs)) continue;
      await scanRoot(top,state,out);scans++;
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
      const store = await resolveDispatchStore({homes, registry});
      // Keep observing the legacy path even when its first lease arrives after startup.
      const storeDir = store.kind === 'none' && homes.codex && registry.isPlatformId('codex')
        ? path.join(homes.codex, 'arc-role-dispatch') : store.dir;
      dispatch = dispatchIndex({storeDir});
      const description=`scope ${scope.roots[0]}`+(scope.kind==='repo'?` (${scope.roots.length} worktrees)`:'');
      const out=[];
      if (store.kind === 'ambiguous') out.push(notice('dispatch store ambiguous'));
      await discover(true,out);
      const history=sort(out.filter(e=>e.source!=='watch')).slice(-tailCount || Infinity);
      const diagnostics=out.filter(e=>e.source==='watch');
      return markEmitted([notice(`arc watch: ${description} · ${platforms.map(name => name.toUpperCase()).join('+')} · Ctrl-C to stop`),...diagnostics,...(tailCount?history:[]),notice('live')]);
    },
    async tick() {
      if (!started||closed) return [];
      const out=[];
      if (now()-lastRefresh>=L.worktreeRefreshMs) {scope=await refreshScope(scope,git);lastRefresh=now();}
      if (now()-lastDiscovery>=L.discoveryMs||pending.size||[...followed.values()].some(row=>row.holdUntil!==undefined)) await discover(false,out);
      await poll(out);
      await scanShell(out);
      return markEmitted(sort(out));
    },
    busy() {return [...followed.values()].some(row=>row.active && (row.inScopeNow || mapped(row)) && now()-row.lastActivity<=L.spinnerIdleMs);},
    async close() {closed=true;followed.clear();pending.clear();},
  };
}
