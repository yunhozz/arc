import {renderManifest,LOCAL_UPDATER_PATH} from '../lib/installer/manifest.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const i = process.argv.indexOf('--root');
const root = i < 0 ? fileURLToPath(new URL('../', import.meta.url)) : path.resolve(process.argv[i + 1]);
const mutable = new Set(['codex/skill/models.toml', 'claude/skill/models.toml']);
const excluded = new Set(['.DS_Store', '__pycache__', 'build']);
const files = new Map();
function visit(relative) {
  const filename = path.join(root, relative);
  let stat;try { stat = fs.lstatSync(filename); } catch (error) { if(error.code==='ENOENT')return;throw error; }
  if (stat.isSymbolicLink()) throw new Error(`Protected payload contains symlink: ${relative}`);
  if(relative===LOCAL_UPDATER_PATH){if(!stat.isFile())throw new Error('Local updater wrapper must be a regular file');return;}
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(filename).sort()) if (!excluded.has(name)) visit(`${relative}/${name}`);
  } else if (stat.isFile() && !mutable.has(relative)) files.set(relative,fs.readFileSync(filename));
  else if (!stat.isFile()) throw new Error(`Protected payload is not regular: ${relative}`);
}
for (const entry of ['README.md', 'install.command', 'package.json', 'bin', 'lib', 'native/binding.c', 'native/binding.gyp', 'scripts', 'vendor', 'prebuilds', 'codex/skill', 'codex/agents', 'claude/skill', 'claude/agents']) visit(entry);
const content = renderManifest(files);
const manifest = path.join(root, 'MANIFEST.sha256');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(manifest) || !fs.readFileSync(manifest).equals(content)) { console.error('Protected payload manifest is stale'); process.exitCode = 1; }
  else console.log(`Protected payload manifest verified (${files.size} files)`);
} else { fs.writeFileSync(manifest, content); console.log(`Updated manifest (${files.size} files)`); }
