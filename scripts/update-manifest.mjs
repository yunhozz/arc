import {isDynamicReferencePath} from '../lib/installer/superpowers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const i = process.argv.indexOf('--root');
const root = i < 0 ? fileURLToPath(new URL('../', import.meta.url)) : path.resolve(process.argv[i + 1]);
const mutable = new Set(['codex/skill/models.toml', 'claude/skill/models.toml']);
const excluded = new Set(['.DS_Store', '__pycache__', 'build']);
const files = new Set();
function visit(relative) {
  if(isDynamicReferencePath(relative)) return;
  const filename = path.join(root, relative);
  if (!fs.existsSync(filename)) return;
  const stat = fs.lstatSync(filename);
  if (stat.isSymbolicLink()) throw new Error(`Protected payload contains symlink: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(filename).sort()) if (!excluded.has(name)) visit(`${relative}/${name}`);
  } else if (stat.isFile() && !mutable.has(relative)) files.add(relative);
  else if (!stat.isFile()) throw new Error(`Protected payload is not regular: ${relative}`);
}
for (const entry of ['README.md', 'install.command', 'package.json', 'bin', 'lib', 'native/binding.c', 'native/binding.gyp', 'scripts', 'vendor', 'prebuilds', 'codex/skill', 'codex/agents', 'claude/skill', 'claude/agents']) visit(entry);
const content = [...files].sort().map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')}  ${name}\n`).join('');
const manifest = path.join(root, 'MANIFEST.sha256');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(manifest) || fs.readFileSync(manifest, 'utf8') !== content) { console.error('Protected payload manifest is stale'); process.exitCode = 1; }
  else console.log(`Protected payload manifest verified (${files.size} files)`);
} else { fs.writeFileSync(manifest, content); console.log(`Updated manifest (${files.size} files)`); }
