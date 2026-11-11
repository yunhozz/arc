import fs from 'node:fs';
import path from 'node:path';
import {GIT_ALLOWED} from './git.mjs';

const scopeCaches = new WeakMap();

// Resolve the existing ancestor too: a transcript cwd can name a deleted child.
function realPath(file) {
  let current = path.resolve(file);
  const suffix = [];
  for (;;) {
    try { return path.join(fs.realpathSync(current), ...suffix); }
    catch (error) {
      if (!['ENOENT','ENOTDIR'].includes(error.code)) return path.resolve(file);
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(file);
      suffix.unshift(path.basename(current)); current = parent;
    }
  }
}

function worktreeRoots(output) {
  return [...new Set(output.split('\0').filter(field => field.startsWith('worktree ')).map(field => realPath(field.slice(9))))];
}

export async function resolveScope({mode, dir, session, git}) {
  if (mode === 'all') return {kind:'all', roots:[], gitCommonDir:null, description:'All sessions'};
  if (mode === 'session') return {kind:'session', roots:[], gitCommonDir:null, description:`Session ${session}`};
  const root = realPath(dir), top = await git(root, GIT_ALLOWED[0]);
  if (top !== null) {
    const common = await git(root, GIT_ALLOWED[1]), trees = await git(root, GIT_ALLOWED[2]);
    if (common !== null && trees !== null) {
      const roots = worktreeRoots(trees);
      return {kind:'repo', roots:roots.length ? roots : [realPath(top.trim())], gitCommonDir:realPath(common.trim()), description:`Repository ${top.trim()}`};
    }
  }
  return {kind:'dir', roots:[root], gitCommonDir:null, description:`Directory ${root}`};
}

export async function refreshScope(scope, git) {
  if (scope.kind !== 'repo') return scope;
  const output = await git(scope.roots[0], GIT_ALLOWED[2]);
  if (output === null) return scope;
  const roots = worktreeRoots(output);
  return roots.length ? {...scope, roots} : scope;
}

export function inScope(scope, cwd) {
  if (scope.kind === 'all' || scope.kind === 'session') return true;
  let cache = scopeCaches.get(scope);
  if (!cache) { cache = new Map(); scopeCaches.set(scope, cache); }
  if (cache.has(cwd)) return cache.get(cwd);
  const candidates = [path.resolve(cwd), realPath(cwd)];
  const inside = scope.roots.some(root => [path.resolve(root), realPath(root)].some(base => candidates.some(candidate => candidate === base || candidate.startsWith(base.endsWith(path.sep) ? base : base + path.sep))));
  cache.set(cwd, inside);
  return inside;
}

export const normalizeSlug = value => value.replace(/[^A-Za-z0-9]/g, '-');

export function claudeDirPrefixes(scope) {
  if (scope.kind === 'all' || scope.kind === 'session') return null;
  return [...new Set(scope.roots.flatMap(root => [normalizeSlug(root), normalizeSlug(realPath(root))]))];
}
