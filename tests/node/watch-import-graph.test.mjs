import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lib = new URL('../../lib/',import.meta.url);
const forbidden = /^(?:management|installer|safe-fs)\//;
const imports = /\b(?:import\s*(?:\(\s*|(?:[^'";]*?\bfrom\s*)?)|export\s+(?:\*[^'";]*|\{[^}]*\})\s+from\s*)['"](\.[^'"]+)['"]/g;

test('watch import graph stays independent of management, installer and safe-fs', () => {
  const visited = new Set();
  function visit(url, chain = []) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const name = url.href.startsWith(lib.href) ? url.href.slice(lib.href.length) : url.href;
    const trail = [...chain,name];
    assert.doesNotMatch(name,forbidden,trail.join(' -> '));
    for (const match of fs.readFileSync(url,'utf8').matchAll(imports)) {
      visit(new URL(match[1],url),trail);
    }
  }
  visit(new URL('watch/index.mjs',lib));
  assert.ok(visited.has(new URL('watch/menu.mjs',lib).href),'watch menu must be covered by the graph');
  assert.ok(visited.has(new URL('tui/interface.mjs',lib).href),'terminal interface must be covered by the graph');
});
