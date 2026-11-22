import fs from 'node:fs';
import path from 'node:path';
import {GIT_ALLOWED} from './git.mjs';
import {WATCH_LIMITS as L} from './model.mjs';
import {sanitizeText} from './policy.mjs';
import {watchLocationLabel} from './status-line.mjs';
import {displayWidth} from './text-width.mjs';

const scopeCaches = new WeakMap();

// Resolve the existing ancestor too: a transcript cwd can name a deleted child.
export function realPath(file) {
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

export async function resolveScope({dir, git}) {
  const root = realPath(dir), top = await git(root, GIT_ALLOWED[0]);
  if (top !== null) {
    const common = await git(root, GIT_ALLOWED[1]), trees = await git(root, GIT_ALLOWED[2]);
    if (common !== null && trees !== null) {
      const selected = realPath(top.trim());
      return {kind:'repo', roots:[selected], excludedRoots:worktreeRoots(trees).filter(root=>root!==selected), gitCommonDir:realPath(common.trim()), description:`Worktree ${selected}`};
    }
  }
  return {kind:'dir', roots:[root], gitCommonDir:null, description:`Directory ${root}`};
}

export async function refreshScope(scope, git) {
  if (scope.kind !== 'repo') return scope;
  const output = await git(scope.roots[0], GIT_ALLOWED[2]);
  if (output === null) return scope;
  return {...scope, excludedRoots:worktreeRoots(output).filter(root=>!scope.roots.includes(root))};
}

export function inScope(scope, cwd) {
  let cache = scopeCaches.get(scope);
  if (!cache) { cache = new Map(); scopeCaches.set(scope, cache); }
  if (cache.has(cwd)) return cache.get(cwd);
  const candidates = [path.resolve(cwd), realPath(cwd)];
  const contains = root => [path.resolve(root), realPath(root)].some(base => candidates.some(candidate => candidate === base || candidate.startsWith(base.endsWith(path.sep) ? base : base + path.sep)));
  const inside = scope.roots.some(contains) && !(scope.excludedRoots ?? []).some(root=>scope.roots.some(base=>root.startsWith(base+path.sep)) && contains(root));
  cache.set(cwd, inside);
  return inside;
}

export const normalizeSlug = value => value.replace(/[^A-Za-z0-9]/g, '-');

export function claudeDirPrefixes(scope) {
  const roots = scope.kind === 'repo' ? [...scope.roots, ...scope.excludedRoots ?? []] : scope.roots;
  return [...new Set(roots.flatMap(root => [normalizeSlug(root), normalizeSlug(realPath(root))]))];
}

export function parseWorktreeList(output) {
  if (!output || !output.endsWith('\0\0')) throw Error('Invalid Git worktree list');
  return output.slice(0,-2).split('\0\0').map(record => {
    const [location,...fields] = record.split('\0');
    const dir = location.slice(9);
    if (!location.startsWith('worktree ') || !path.isAbsolute(dir)) throw Error('Invalid Git worktree entry');
    return {
      root:realPath(dir),
      head:fields.find(field=>field.startsWith('HEAD '))?.slice(5),
      branch:fields.find(field=>field.startsWith('branch '))?.slice(7).replace(/^refs\/heads\//,''),
      detached:fields.includes('detached'),
      locked:fields.some(field=>field==='locked'||field.startsWith('locked ')),
      prunable:fields.some(field=>field==='prunable'||field.startsWith('prunable ')),
      bare:fields.includes('bare'),
    };
  });
}

export function selectableWorktrees(list, {isDirectory = root => fs.statSync(root).isDirectory()} = {}) {
  const worktrees = list.filter(({root,bare,prunable}) => {
    if (bare || prunable) return false;
    try { return isDirectory(root); } catch { return false; }
  });
  return {worktrees,mainRoot:list[0]?.bare ? null : list[0]?.root ?? null};
}

function pathForms(file) {
  return [...new Set([realPath(file),path.resolve(file)])];
}

function matchingPaths(bases, locations) {
  for (const base of bases) {
    const prefix = base.endsWith(path.sep) ? base : base+path.sep;
    for (const location of locations) {
      if (location===base || location.startsWith(prefix)) return {base,location,relative:path.relative(base,location)};
    }
  }
}

function abbreviateWorktree(locations, home) {
  const match = home && matchingPaths(pathForms(home),locations);
  return match ? watchLocationLabel({dir:match.location,home:match.base}) : watchLocationLabel({dir:locations[0]});
}

export function sameWorktree(root, other) {
  return Boolean(other && (root===other || pathForms(root).some(form=>pathForms(other).includes(form))));
}

export function worktreeDisplayPath(root, {mainRoot,home,width=Infinity}) {
  const locations = pathForms(root);
  const match = mainRoot && matchingPaths(pathForms(mainRoot),locations);
  const label = match?.relative
    ? sanitizeText(path.basename(match.base)+path.sep+match.relative)
    : abbreviateWorktree(locations,home);
  if (displayWidth(label)<=width) return label;
  const parts = label.split(path.sep);
  const last = parts.at(-1) || label;
  const candidates = [
    [parts[0],'…',...parts.slice(-2)].join(path.sep),
    [parts[0],'…',last].join(path.sep),
    ['…',last].join(path.sep),
  ];
  const wholeSegments = candidates.find(candidate=>displayWidth(candidate)<=width);
  if (wholeSegments) return wholeSegments;
  const ellipsisWidth = displayWidth('…');
  if (width<ellipsisWidth) return '';
  let end = '', remaining = width-ellipsisWidth;
  for (const character of [...last].reverse()) {
    remaining -= displayWidth(character);
    if (remaining<0) break;
    end = character+end;
  }
  return '…'+end;
}

export function worktreeBranch(worktree) {
  return worktree.detached ? 'detached '+worktree.head?.slice(0,7) : worktree.branch;
}

export function scopeForWorktree(scope, worktrees, root, {home}) {
  const locations = pathForms(root);
  const trees = worktrees.map(tree=>({tree,forms:pathForms(tree.root)}));
  const sameRoot = ({forms})=>forms.some(form=>locations.includes(form));
  const chosen = trees.find(sameRoot)?.tree;
  const canonical = locations[0];
  return {...scope, roots:[canonical], excludedRoots:trees.filter(tree=>!sameRoot(tree)).map(({forms})=>forms[0]),
    branch:chosen && worktreeBranch(chosen),display:abbreviateWorktree(locations,home),description:`Worktree ${canonical}`};
}

export function groupActivity(worktrees, activity, {now}) {
  const roots = worktrees.map(({root})=>({root,forms:pathForms(root)}));
  const groups = new Map();
  for (const {platform,mtimeMs,cwd} of activity) {
    if (!cwd || now-mtimeMs>L.attachWindowMs) continue;
    const locations = pathForms(cwd);
    let root, distance = Infinity;
    for (const candidate of roots) {
      const match = matchingPaths(candidate.forms,locations);
      if (!match) continue;
      const levels = match.relative ? match.relative.split(path.sep).length : 0;
      if (levels<distance) { root = candidate.root; distance = levels; }
    }
    if (!root) continue;
    const group = groups.get(root) ?? {sessions:0,platforms:new Set(),lastActivity:mtimeMs};
    group.sessions++;
    group.platforms.add(platform);
    group.lastActivity = Math.max(group.lastActivity,mtimeMs);
    groups.set(root,group);
  }
  return groups;
}

export function orderWorktrees(worktrees, groups, {currentRoot,mainRoot,home}) {
  const decorated = worktrees.map(tree=>({
    tree,here:sameWorktree(tree.root,currentRoot),last:groups.get(tree.root)?.lastActivity ?? -Infinity,
    display:worktreeDisplayPath(tree.root,{mainRoot,home}),
  }));
  decorated.sort((a,b)=>Number(b.here)-Number(a.here) || b.last-a.last || a.display.localeCompare(b.display,'en'));
  return {shown:decorated.slice(0,L.worktreePickerMax).map(row=>row.tree),hidden:Math.max(0,decorated.length-L.worktreePickerMax)};
}
