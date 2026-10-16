import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const i = process.argv.indexOf('--root');
const root = i < 0 ? fileURLToPath(new URL('../', import.meta.url)) : path.resolve(process.argv[i + 1]);
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const source = path.join(root, 'node_modules/smol-toml');
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.devDependencies?.['smol-toml'] ?? '') || sourceManifest.version !== manifest.devDependencies['smol-toml']) throw new Error('Vendor source must match the exact smol-toml dev dependency');
  const expected = new Map();
  const sourceFiles = {};
  // This reproducible formatting adjustment changes no executable tokens in the
  // pinned source. Preserve line endings and every non-JS file byte-for-byte.
  const normalization = { javascript: 'strip-trailing-horizontal-whitespace-v1', pattern: '[ \\t]+(?=\\r?$)', flags: 'gm', preserveLineEndings: true };
  for (const name of fs.readdirSync(path.join(source, 'dist')).sort()) if (name.endsWith('.js')) {
    const original = fs.readFileSync(path.join(source, 'dist', name));
    sourceFiles[`dist/${name}`] = crypto.createHash('sha256').update(original).digest('hex');
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(original);
    expected.set(`dist/${name}`, Buffer.from(text.replace(/[ \t]+(?=\r?$)/gm, '')));
  }
  expected.set('LICENSE', fs.readFileSync(path.join(source, 'LICENSE')));
  expected.set('package.json', Buffer.from(JSON.stringify({ name: 'smol-toml', version: sourceManifest.version, type: 'module', license: 'BSD-3-Clause' }, null, 2) + '\n'));
  const hashes = Object.fromEntries([...expected].map(([name, data]) => [name, crypto.createHash('sha256').update(data).digest('hex')]));
  const lockPath = path.join(root, 'package-lock.json');
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath)) : undefined;
  expected.set('provenance.json', Buffer.from(JSON.stringify({ name: 'smol-toml', version: sourceManifest.version, normalization, sourceFiles, integrity: lock?.packages?.['node_modules/smol-toml']?.integrity ?? null, files: hashes }, null, 2) + '\n'));
  const destination = path.join(root, 'vendor/toml');
  if (process.argv.includes('--check')) {
    const actual = [];
    function list(dir, relative = '') { if (!fs.existsSync(dir)) return; for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const name = relative + entry.name; if (entry.isDirectory()) list(path.join(dir, entry.name), `${name}/`); else actual.push(name); } }
    list(destination);
    if (actual.length !== expected.size || actual.some(name => !expected.has(name)) || [...expected].some(([name, bytes]) => !fs.existsSync(path.join(destination, name)) || !fs.readFileSync(path.join(destination, name)).equals(bytes))) throw new Error('Vendored TOML runtime differs from the exact pinned source');
    console.log(`Vendored smol-toml ${sourceManifest.version} verified (${expected.size} files)`);
  } else {
    for (const [name, bytes] of expected) { const file = path.join(destination, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
    console.log(`Vendored smol-toml ${sourceManifest.version} (${expected.size} files)`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
