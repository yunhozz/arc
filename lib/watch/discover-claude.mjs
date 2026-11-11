import fsp from 'node:fs/promises';
import path from 'node:path';
import {WATCH_LIMITS} from './model.mjs';
import {normalizeSlug} from './scope.mjs';
import {parseClaudeHead, parseClaudeAgentMeta} from './normalize-claude.mjs';
import {readHead} from './tail.mjs';

const absent = error => ['ENOENT','EACCES'].includes(error.code);

export function createClaudeDiscovery({claudeHome}) {
  const directories = new Map();
  async function entries(dir) {
    try {
      const stat = await fsp.stat(dir), cached = directories.get(dir);
      if (cached?.mtimeMs === stat.mtimeMs) return cached.entries;
      const entries = await fsp.readdir(dir, {withFileTypes:true});
      directories.set(dir, {mtimeMs:stat.mtimeMs, entries});
      return entries;
    } catch (error) {
      if (!absent(error)) throw error;
      directories.delete(dir); return [];
    }
  }
  async function details(file) {
    try {
      const stat = await fsp.stat(file);
      return {file, mtimeMs:stat.mtimeMs, size:stat.size, birthtimeMs:stat.birthtimeMs};
    } catch (error) { if (absent(error)) return null; throw error; }
  }
  return {
    async scan({prefixes, now, startup}) {
      const projects = path.join(claudeHome, 'projects'), found = [];
      for (const project of await entries(projects)) {
        if (!project.isDirectory() || (prefixes !== null && !prefixes.some(prefix => normalizeSlug(project.name).startsWith(prefix)))) continue;
        const dir = path.join(projects, project.name);
        for (const entry of await entries(dir)) {
          if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
          const row = await details(path.join(dir, entry.name));
          if (row && (!startup || row.mtimeMs >= now - WATCH_LIMITS.attachWindowMs)) found.push({...row, sessionId:entry.name.slice(0,-6)});
        }
      }
      return found;
    },
    async subagents(sessionFile) {
      const dir = path.join(sessionFile.slice(0,-6), 'subagents'), found = [];
      for (const entry of await entries(dir)) {
        if (!entry.isFile() || !/^agent-.+\.jsonl$/.test(entry.name)) continue;
        const row = await details(path.join(dir, entry.name));
        if (!row) continue;
        const obj = await readHead(path.join(dir, entry.name.replace(/\.jsonl$/, '.meta.json')), {
          maxBytes:WATCH_LIMITS.claudeHeadBytes, accept:obj => parseClaudeAgentMeta(obj) !== null,
        });
        found.push({...row, agentId:entry.name.slice(6,-6), meta:parseClaudeAgentMeta(obj)});
      }
      return found;
    },
  };
}

export async function readClaudeHead(file) {
  const obj = await readHead(file, {maxBytes:WATCH_LIMITS.claudeHeadBytes, accept:obj => parseClaudeHead(obj) !== null});
  return parseClaudeHead(obj);
}
