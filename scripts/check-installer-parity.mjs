import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const root = path.resolve(arg('--root', fileURLToPath(new URL('../', import.meta.url))));
const task = arg('--task', 'T7');
try {
  const ledger = JSON.parse(fs.readFileSync(path.join(root, 'tests/installer-parity.json'), 'utf8'));
  const ids = new Set();
  for (const file of ['tests/test_install.py', 'tests/test_target_install.py']) {
    if (!fs.existsSync(path.join(root, file))) continue;
    let group;
    for (const line of fs.readFileSync(path.join(root, file), 'utf8').split('\n')) {
      const cls = /^class (\w+)/.exec(line); if (cls) group = cls[1];
      const method = /^    def (test_\w+)\(/.exec(line); if (method) ids.add(`${file}::${group}::${method[1]}`);
    }
  }
  const seen = new Set();
  for (const entry of ledger.entries) {
    if (seen.has(entry.legacy)) throw new Error(`Duplicate legacy assertion: ${entry.legacy}`);
    seen.add(entry.legacy);
    if (!entry.destination?.file || !entry.destination?.test || !/^T[1-7]$/.test(entry.task)) throw new Error(`Missing destination: ${entry.legacy}`);
    if (entry.status === 'verified') {
      const file = path.join(root, entry.destination.file);
      if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes(entry.destination.test)) throw new Error(`Missing mapped test: ${entry.legacy}`);
    } else if (entry.status !== 'pending' || Number(entry.task.slice(1)) <= Number(task.slice(1))) throw new Error(`Unverified legacy assertion: ${entry.legacy}`);
  }
  for (const id of ids) if (!seen.has(id)) throw new Error(`Missing legacy assertion: ${id}`);
  console.log(`Parity ledger: ${seen.size} assertions inventoried for ${task}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
