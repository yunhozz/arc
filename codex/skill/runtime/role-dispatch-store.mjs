// Global dispatch lease storage. Every write assumes the caller holds arc-role-platform-routing.lock.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const NON_TERMINAL_STATES = Object.freeze(['reserved', 'starting', 'running', 'unknown']);
export const TERMINAL_STATES = Object.freeze(['completed', 'failed', 'cancelled']);
const KEYS = ['version', 'dispatchId', 'workflowId', 'taskId', 'requestId', 'role', 'route', 'hostPlatform', 'executionEnvironment', 'revision', 'profileHash', 'argsDigest', 'state', 'supervisor', 'child', 'sessionId', 'timeoutMinutes', 'claims', 'reasons', 'allowedPaths', 'resultPath', 'segment', 'nativeAgentId', 'createdAt', 'updatedAt'];
const ID = /^[A-Za-z0-9._-]{1,128}$/;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const nullableText = value => value === null || text(value);
const process_ = value => value === null || isObject(value) && Object.keys(value).length === 2 && Number.isInteger(value.pid) && value.pid > 0 && text(value.startTime);

export const dispatchDirectory = codexHome => path.join(codexHome, 'arc-role-dispatch');
const leasePath = (codexHome, dispatchId) => {
  if (typeof dispatchId !== 'string' || !ID.test(dispatchId) || dispatchId.startsWith('.')) throw Error('Invalid dispatch id');
  return path.join(dispatchDirectory(codexHome), `${dispatchId}.json`);
};
export function validateLease(value) {
  if (!isObject(value) || Object.keys(value).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(value, key))) throw Error('Invalid lease keys');
  const ok = value.version === 1 && typeof value.dispatchId === 'string' && ID.test(value.dispatchId) && !value.dispatchId.startsWith('.')
    && ['workflowId', 'taskId', 'requestId', 'role', 'executionEnvironment', 'revision', 'createdAt', 'updatedAt'].every(key => text(value[key]))
    && ['native', 'bridge'].includes(value.route) && ['codex', 'claude'].includes(value.hostPlatform)
    && nullableText(value.profileHash) && nullableText(value.argsDigest) && nullableText(value.sessionId) && nullableText(value.resultPath) && nullableText(value.nativeAgentId)
    && [...NON_TERMINAL_STATES, ...TERMINAL_STATES].includes(value.state) && process_(value.supervisor) && process_(value.child)
    && Number.isInteger(value.timeoutMinutes) && value.timeoutMinutes > 0 && Number.isInteger(value.segment) && value.segment >= 0
    && (value.claims === null || isObject(value.claims)) && Array.isArray(value.reasons) && Array.isArray(value.allowedPaths) && value.allowedPaths.every(text);
  if (!ok) throw Error('Invalid lease values');
  return structuredClone(value);
}
export async function createLease(codexHome, lease) {
  const value = validateLease(lease), directory = dispatchDirectory(codexHome);
  await fsp.mkdir(directory, {recursive: true, mode: 0o700});
  const handle = await fsp.open(leasePath(codexHome, value.dispatchId), 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  return value;
}
export async function readLease(codexHome, dispatchId) {
  let bytes;
  try { bytes = await fsp.readFile(leasePath(codexHome, dispatchId), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return validateLease(JSON.parse(bytes));
}
export async function writeLease(codexHome, lease, {now = Date.now()} = {}) {
  const value = validateLease({...lease, updatedAt: new Date(now).toISOString()}), target = leasePath(codexHome, value.dispatchId);
  const temp = path.join(dispatchDirectory(codexHome), `.${value.dispatchId}.${crypto.randomUUID()}.tmp`);
  try {
    const handle = await fsp.open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
    await fsp.rename(temp, target);
  } catch (error) { await fsp.unlink(temp).catch(() => {}); throw error; }
  return value;
}
const HEARTBEAT_SUFFIX = '.heartbeat.json';
const leaseFiles = async codexHome => {
  try { return (await fsp.readdir(dispatchDirectory(codexHome))).filter(name => name.endsWith('.json') && !name.endsWith(HEARTBEAT_SUFFIX) && !name.startsWith('.')).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
export async function listLeases(codexHome) {
  const leases = [];
  for (const name of await leaseFiles(codexHome)) leases.push(validateLease(JSON.parse(await fsp.readFile(path.join(dispatchDirectory(codexHome), name), 'utf8'))));
  return leases;
}
/** Removes only terminal leases whose updatedAt is older than retentionMs. Failures are counted, never thrown. */
export async function pruneTerminalLeases(codexHome, {now = Date.now(), retentionMs}) {
  let removed = 0, errors = 0, names;
  try { names = await leaseFiles(codexHome); } catch { return {removed, errors: 1}; }
  for (const name of names) {
    const file = path.join(dispatchDirectory(codexHome), name);
    try {
      const lease = validateLease(JSON.parse(await fsp.readFile(file, 'utf8')));
      const updated = Date.parse(lease.updatedAt);
      if (!TERMINAL_STATES.includes(lease.state) || !Number.isFinite(updated) || now - updated <= retentionMs) continue;
      await fsp.unlink(file); removed += 1;
      for (const extra of [`${lease.dispatchId}${HEARTBEAT_SUFFIX}`, `${lease.dispatchId}.cancel`]) await fsp.unlink(path.join(dispatchDirectory(codexHome), extra)).catch(() => {});
    } catch { errors += 1; }
  }
  return {removed, errors};
}
/** Reads only the three keys written by serializeLimits; any other content is rejected. */
export function readHostLimits(hostHome) {
  const values = {};
  for (const raw of fs.readFileSync(path.join(hostHome, 'skills', 'arc', 'limits.toml'), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([a-z_]+)[ \t]*=[ \t]*(\d{1,15})[ \t]*(?:#.*)?$/.exec(line);
    if (!match || !['version', 'max_total_subagents', 'max_concurrent_subagents'].includes(match[1]) || Object.hasOwn(values, match[1])) throw Error('Invalid limits file');
    values[match[1]] = Number(match[2]);
  }
  if (Object.keys(values).length !== 3 || values.version !== 1 || values.max_total_subagents < 1 || values.max_concurrent_subagents < 1) throw Error('Invalid limits file');
  return {maxTotal: values.max_total_subagents, maxConcurrent: values.max_concurrent_subagents};
}

const sidecarPath = (codexHome, dispatchId, suffix) => path.join(dispatchDirectory(codexHome), `${path.basename(leasePath(codexHome, dispatchId), '.json')}${suffix}`);
/** The supervisor alone writes its heartbeat; no routing lock is needed because the file is replaced atomically and holds no lease state. */
export async function writeHeartbeat(codexHome, dispatchId, {at, pid}) {
  if (!Number.isFinite(at) || !Number.isInteger(pid) || pid <= 0) throw Error('Invalid heartbeat');
  const target = sidecarPath(codexHome, dispatchId, HEARTBEAT_SUFFIX), temp = path.join(dispatchDirectory(codexHome), `.${dispatchId}.${crypto.randomUUID()}.hb.tmp`);
  try {
    const handle = await fsp.open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({at, pid}) + '\n'); } finally { await handle.close(); }
    await fsp.rename(temp, target);
  } catch (error) { await fsp.unlink(temp).catch(() => {}); throw error; }
}
export async function readHeartbeat(codexHome, dispatchId) {
  try {
    const value = JSON.parse(await fsp.readFile(sidecarPath(codexHome, dispatchId, HEARTBEAT_SUFFIX), 'utf8'));
    return isObject(value) && Number.isFinite(value.at) && Number.isInteger(value.pid) ? {at: value.at, pid: value.pid} : null;
  } catch { return null; }
}
/** Marker file asking the supervisor to stop the child; the supervisor polls for it. */
export async function requestCancel(codexHome, dispatchId) {
  const handle = await fsp.open(sidecarPath(codexHome, dispatchId, '.cancel'), 'a', 0o600);
  await handle.close();
}
export async function cancelRequested(codexHome, dispatchId) {
  try { await fsp.access(sidecarPath(codexHome, dispatchId, '.cancel')); return true; } catch { return false; }
}
