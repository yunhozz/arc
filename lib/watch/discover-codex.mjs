import fsp from 'node:fs/promises';
import path from 'node:path';
import {WATCH_LIMITS} from './model.mjs';
import {parseCodexMeta} from './normalize-codex.mjs';
import {readHead} from './tail.mjs';

function dateFolder(date, utc) {
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = utc ? date.getUTCDate() : date.getDate();
  return path.join(String(year), String(month).padStart(2,'0'), String(day).padStart(2,'0'));
}

export async function listCodexRollouts({codexHome, now, startup}) {
  const folders = new Set(), found = [];
  for (const utc of startup ? [false] : [false,true]) {
    for (let back = 0; back <= (startup ? WATCH_LIMITS.lookbackDays : 1); back++) {
      const date = new Date(now);
      if (utc) date.setUTCDate(date.getUTCDate() - back); else date.setDate(date.getDate() - back);
      folders.add(dateFolder(date, utc));
    }
  }
  for (const folder of folders) {
    const dir = path.join(codexHome, 'sessions', folder);
    let entries;
    try { entries = await fsp.readdir(dir, {withFileTypes:true}); }
    catch (error) { if (['ENOENT','EACCES'].includes(error.code)) continue; throw error; }
    for (const entry of entries) {
      if (!entry.isFile() || !/^rollout-.+\.jsonl(?:\.zst)?$/.test(entry.name)) continue;
      const file = path.join(dir, entry.name);
      let stat;
      try { stat = await fsp.stat(file); }
      catch (error) { if (['ENOENT','EACCES'].includes(error.code)) continue; throw error; }
      if (startup && stat.mtimeMs < now - WATCH_LIMITS.attachWindowMs) continue;
      const threadId = entry.name.replace(/^rollout-(?:\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-)?/, '').replace(/\.jsonl(?:\.zst)?$/, '');
      found.push({file, threadId, mtimeMs:stat.mtimeMs, size:stat.size, birthtimeMs:stat.birthtimeMs, compressed:entry.name.endsWith('.zst')});
    }
  }
  return found;
}

export async function readCodexMeta(file) {
  const obj = await readHead(file, {maxBytes:WATCH_LIMITS.codexMetaBytes, accept:obj => parseCodexMeta(obj) !== null});
  return parseCodexMeta(obj);
}
