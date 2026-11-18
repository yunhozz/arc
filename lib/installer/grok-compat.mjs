import {isDeepStrictEqual} from 'node:util';
import {parseToml} from '../models/config.mjs';

const MANAGED_KEYS = ['agents', 'skills', 'rules'];
const managedKey = /^[ \t]*(agents|skills|rules)[ \t]*=[ \t]*(true|false)[ \t]*#[ \t]*arc:managed[ \t]*(\r?\n)?$/;
const managedHeader = /^[ \t]*\[[ \t]*compat[ \t]*\.[ \t]*claude[ \t]*\][ \t]*#[ \t]*arc:managed[ \t]*(\r?\n)?$/;
const header = /^[ \t]*\[[ \t]*compat[ \t]*\.[ \t]*claude[ \t]*\][ \t]*(?:#[^\r\n]*)?(\r?\n)?$/;
const subtable = /^[ \t]*\[[ \t]*compat[ \t]*\.[ \t]*claude[ \t]*\./;
const fail = message => {throw new Error(message);};
const table = value => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
function read(original) {
  let text;
  try {text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(original);}
  catch {fail('config.toml is not UTF-8');}
  let data;
  try {data = parseToml(text);} catch {fail('TOML parse failed');}
  return {text, data, lines: text.match(/[^\n]*\n|[^\n]+$/g) ?? []};
}
const lineForMatch = (lines, index) => index === 0 ? lines[index].replace(/^\uFEFF/, '') : lines[index];
function sections(lines) {
  const result = [];
  for (let start = 0; start < lines.length; start++) if (header.test(lineForMatch(lines, start))) {
    let end = start + 1;
    while (end < lines.length && !/^[ \t]*\[/.test(lineForMatch(lines, end))) end++;
    result.push({start, end});
  }
  return result;
}
function verify(updated, expected) {
  let actual;
  try {actual = parseToml(updated);} catch {fail('cannot verify the safe edit');}
  if (!isDeepStrictEqual(actual, expected)) fail('cannot verify the safe edit');
}
export function renderGrokCompat(original) {
  const {text, data, lines} = read(original ?? Buffer.alloc(0));
  const eol = /\r?\n/.exec(text)?.[0] ?? '\n', ranges = sections(lines);
  if (data.compat !== undefined && !table(data.compat) || data.compat?.claude !== undefined && !table(data.compat.claude)) fail('[compat.claude] uses an unsupported representation');
  if (data.compat?.claude !== undefined && !ranges.length && !lines.some((line, index) => subtable.test(lineForMatch(lines, index)))) fail('[compat.claude] uses an unsupported representation');
  const entries = new Map();
  for (const key of MANAGED_KEYS) {
    if (data.compat?.claude?.[key] === undefined) continue;
    if (typeof data.compat.claude[key] !== 'boolean') fail(`[compat.claude] ${key} must be a boolean`);
    const matches = [];
    for (const {start, end} of ranges) for (let i = start + 1; i < end; i++) if (new RegExp(`^[ \\t]*${key}[ \\t]*=`).test(lines[i])) matches.push(i);
    if (matches.length !== 1) fail(`[compat.claude] ${key} uses an unsupported representation`);
    entries.set(key, matches[0]);
  }
  const notes = [], written = [], missing = [];
  for (const key of MANAGED_KEYS) {
    const index = entries.get(key);
    if (index === undefined) {missing.push(key); written.push(key); continue;}
    if (managedKey.test(lines[index])) {
      if (data.compat.claude[key]) {
        lines[index] = lines[index].replace(/(=[ \t]*)true/, '$1false');
        notes.push(`[compat.claude] ${key} reset to false (arc:managed)`);
        written.push(key);
      }
    } else {
      if (data.compat.claude[key]) fail(`[compat.claude] ${key} = true is set by the user; set it to false or remove it`);
      notes.push(`[compat.claude] ${key} = false is user-owned and kept`);
    }
  }
  if (missing.length) {
    const end = ranges[0]?.end ?? lines.length;
    if (end && !lines[end - 1].endsWith('\n')) lines[end - 1] += eol;
    lines.splice(end, 0, ...(!ranges.length ? [`[compat.claude] # arc:managed${eol}`] : []), ...missing.map(key => `${key} = false # arc:managed${eol}`));
  }
  const updated = lines.join(''), expected = parseToml(text);
  if (written.length) {
    expected.compat ??= parseToml('[compat.claude]\n').compat;
    expected.compat.claude ??= parseToml('[compat.claude]\n').compat.claude;
    for (const key of written) expected.compat.claude[key] = false;
  }
  verify(updated, expected);
  const changed = updated !== text;
  if (changed) notes.push(`set [compat.claude] ${written.join(', ')} = false (arc:managed)`);
  return {content: Buffer.from(updated), action: changed ? 'set Grok Claude compatibility' : 'unchanged', notes};
}
export function removeGrokCompat(original) {
  if (original === null) return {content: null, notes: []};
  const {text, data: expected, lines} = read(original), deleted = new Set();
  let removedHeader = false;
  for (const {start, end} of sections(lines)) {
    for (let i = start + 1; i < end; i++) {
      const match = managedKey.exec(lines[i]);
      if (match) {
        if (!table(expected.compat?.claude)) fail('cannot verify the safe edit');
        deleted.add(i); delete expected.compat.claude[match[1]];
      }
    }
    const hasKeys = lines.slice(start + 1, end).some((line, offset) => !deleted.has(start + 1 + offset) && /^[ \t]*[^#\r\n \t][^\r\n]*=/.test(line));
    if (managedHeader.test(lineForMatch(lines, start)) && !hasKeys) {
      if (!table(expected.compat?.claude)) fail('cannot verify the safe edit');
      deleted.add(start); removedHeader = true;
    }
  }
  if (!deleted.size) return {content: null, notes: []};
  const updated = (deleted.has(0) && text.startsWith('\uFEFF') ? '\uFEFF' : '') + lines.filter((line, index) => !deleted.has(index)).join('');
  if (removedHeader && Object.keys(expected.compat.claude).length === 0) delete expected.compat.claude;
  if (removedHeader && Object.keys(expected.compat).length === 0) {
    let actual;
    try {actual = parseToml(updated);} catch {fail('cannot verify the safe edit');}
    if (!Object.hasOwn(actual, 'compat')) delete expected.compat;
  }
  verify(updated, expected);
  return {content: Buffer.from(updated), notes: ['restored [compat.claude] managed lines']};
}
