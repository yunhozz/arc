import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

function documentParts(platform, name, root) {
  const relative = name === 'core' ? 'SKILL.md' : `references/${name}.md`;
  const platformText = fs.readFileSync(path.join(root, platform, 'skill', relative), 'utf8');
  if (name === 'core') return [platformText];
  const shared = path.join(root, 'shared', 'skill', 'references', `${name}-common.md`);
  return fs.existsSync(shared) ? [platformText, fs.readFileSync(shared, 'utf8')] : [platformText];
}

export function effectiveText(platform, name, root = repository) {
  return documentParts(platform, name, root).join('\n');
}

function sections(text, heading) {
  const level = heading.match(/^#+/)[0].length;
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (let start = 0; start < lines.length; start++) {
    if (lines[start] !== heading) continue;
    let end = start + 1;
    while (end < lines.length && !new RegExp(`^#{1,${level}}[ \\t]+`).test(lines[end])) end++;
    matches.push(lines.slice(start, end).join('\n'));
  }
  return matches;
}

export function effectiveSection(platform, name, heading, root = repository) {
  const [local, shared] = documentParts(platform, name, root);
  const [section] = sections(local, heading);
  if (section === undefined) throw new Error(`Missing heading in ${platform}/${name}: ${heading}`);
  return [section, ...sections(shared ?? '', heading)].join('\n');
}
