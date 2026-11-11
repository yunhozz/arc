import fsp from 'node:fs/promises';
import path from 'node:path';
import {createTail} from './tail.mjs';
import {roleFromName} from './labels.mjs';

export function parseLeaseLenient(text) {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value.dispatchId !== 'string') return null;
  const lease = {};
  for (const key of ['dispatchId', 'workflowId', 'role', 'route', 'hostPlatform', 'state', 'sessionId', 'nativeAgentId', 'createdAt', 'updatedAt']) {
    if (typeof value[key] === 'string') lease[key] = value[key];
  }
  lease.reasons = Array.isArray(value.reasons) ? value.reasons.filter(reason => typeof reason === 'string') : [];
  return lease;
}

async function entries(dir) {
  try { return (await fsp.readdir(dir, {withFileTypes:true})).sort((a, b) => a.name.localeCompare(b.name, 'en', {numeric:true})); }
  catch (error) {
    if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error;
    return [];
  }
}

export function createDispatchIndex({codexHome}) {
  const refs = new Map(), leases = new Map(), tails = new Map(), records = new Map(), signatures = new Map();

  async function readLeases() {
    const dir = path.join(codexHome, 'arc-role-dispatch'), seen = new Set();
    for (const entry of await entries(dir)) {
      if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.endsWith('.json') || entry.name.endsWith('.heartbeat.json')) continue;
      const file = path.join(dir, entry.name);
      seen.add(file);
      try {
        const {mtimeMs} = await fsp.stat(file);
        if (leases.get(file)?.mtimeMs === mtimeMs) continue;
        const value = parseLeaseLenient(await fsp.readFile(file, 'utf8'));
        if (value) leases.set(file, {mtimeMs, value});
      } catch (error) {
        if (!['ENOENT', 'EACCES'].includes(error.code)) throw error;
      }
    }
    for (const file of leases.keys()) if (!seen.has(file)) leases.delete(file);
    return new Map([...leases.values()].map(({value}) => [value.dispatchId, value]));
  }

  async function readRecord(dir) {
    const file = path.join(dir, 'record.json');
    try {
      const value = parseLeaseLenient(JSON.stringify({...JSON.parse(await fsp.readFile(file, 'utf8')), dispatchId:path.basename(dir)}));
      if (value) records.set(file, value);
    } catch (error) {
      if (!(error instanceof SyntaxError) && !['ENOENT', 'EACCES'].includes(error.code)) throw error;
    }
    return records.get(file);
  }

  async function readEvents(dir, ref) {
    const file = path.join(dir, 'events.jsonl');
    if (!tails.has(file)) tails.set(file, createTail(file));
    let result;
    try { result = await tails.get(file).poll(); }
    catch (error) {
      if (error.code !== 'EACCES') throw error;
      return;
    }
    for (const event of result.lines) {
      const sessionId = event?.kind === 'thread' ? event.threadId : event?.kind === 'init' ? event.sessionId : null;
      if (typeof sessionId !== 'string') continue;
      if (!ref.sessionIds.includes(sessionId)) ref.sessionIds.push(sessionId);
      ref.childPlatform = event.kind === 'thread' ? 'codex' : 'claude';
    }
  }

  function ensure(id) {
    if (!refs.has(id)) refs.set(id, {dispatchId:id, role:null, reasons:[], sessionIds:[], childPlatform:null, inScope:false, artifactDir:null});
    return refs.get(id);
  }

  return {
    async scan({gitCommonDirs, includeAllLeases}) {
      if (codexHome === null) return [];
      const currentLeases = await readLeases(), artifacts = new Map();
      for (const gcd of gitCommonDirs) {
        const workflows = path.join(gcd, 'arc', 'workflows');
        for (const workflow of await entries(workflows)) {
          if (!workflow.isDirectory()) continue;
          const dispatches = path.join(workflows, workflow.name, 'dispatches');
          for (const dispatch of await entries(dispatches)) {
            if (!dispatch.isDirectory()) continue;
            const dir = path.join(dispatches, dispatch.name), ref = ensure(dispatch.name);
            let record = await readRecord(dir);
            await readEvents(dir, ref);
            const segments = path.join(dir, 'segments');
            for (const segment of await entries(segments)) {
              if (!segment.isDirectory() || !/^\d+$/.test(segment.name)) continue;
              const segmentDir = path.join(segments, segment.name);
              record = await readRecord(segmentDir) ?? record;
              await readEvents(segmentDir, ref);
            }
            artifacts.set(dispatch.name, {dir, workflowId:workflow.name, record});
          }
        }
      }
      for (const id of currentLeases.keys()) ensure(id);
      const updates = [];
      for (const [id, ref] of refs) {
        const artifact = artifacts.get(id), lease = currentLeases.get(id), value = lease ?? artifact?.record;
        ref.inScope = Boolean(artifact || (includeAllLeases && lease));
        ref.artifactDir = artifact?.dir ?? null;
        if (!lease && !artifact) continue;
        for (const key of ['workflowId', 'rawRole', 'route', 'hostPlatform', 'state', 'updatedAt']) delete ref[key];
        if (artifact) ref.workflowId = artifact.workflowId;
        if (value) {
          for (const key of ['workflowId', 'route', 'hostPlatform', 'state', 'updatedAt']) {
            if (value[key] !== undefined) ref[key] = value[key];
          }
          if (value.role !== undefined) ref.rawRole = value.role;
          if (value.sessionId !== undefined && !ref.sessionIds.includes(value.sessionId)) ref.sessionIds.push(value.sessionId);
        }
        ref.role = roleFromName(ref.rawRole);
        ref.reasons = value?.reasons ?? [];
        const signature = JSON.stringify([ref.state, ref.reasons]), first = !signatures.has(id);
        if (first || signatures.get(id) !== signature) updates.push({ref, first});
        signatures.set(id, signature);
      }
      return updates;
    },
    bySession(sessionId) { return [...refs.values()].find(ref => ref.sessionIds.includes(sessionId)) ?? null; },
    byId(id) { return refs.get(id) ?? null; },
    list() { return [...refs.values()]; },
  };
}
