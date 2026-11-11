import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {makeHomes} from './fixtures/watch/homes.mjs';
import {createTail, readTail, readHead} from '../../lib/watch/tail.mjs';

function fixture(t, contents = '') {
  const homes = makeHomes(t), file = path.join(homes.root, 'tail.jsonl');
  fs.writeFileSync(file, contents);
  return file;
}

test('tail joins a line split across two appends', async t => {
  const file = fixture(t), tail = createTail(file);
  fs.appendFileSync(file, '{"a":');
  assert.deepEqual((await tail.poll()).lines, []);
  fs.appendFileSync(file, '1}\n');
  assert.deepEqual((await tail.poll()).lines, [{a:1}]);
  assert.equal(tail.offset, fs.statSync(file).size);
  assert.deepEqual((await tail.poll()).lines, []);
});
test('tail restarts from zero when the file shrinks', async t => {
  const file = fixture(t, '{"i":1}\n{"i":2}\n{"i":3}\n'), tail = createTail(file);
  assert.equal((await tail.poll()).lines.length, 3);
  fs.writeFileSync(file, '{"i":4}\n');
  const result = await tail.poll();
  assert.equal(result.reset, true);
  assert.deepEqual(result.lines, [{i:4}]);
});
test('tail reports gone after removal', async t => {
  const file = fixture(t), tail = createTail(file);
  fs.unlinkSync(file);
  assert.equal((await tail.poll()).gone, true);
});
test('tail skips a 5 MiB line and reads at most 1 MiB per poll', async t => {
  const file = fixture(t, 'x'.repeat(5 * 1024 * 1024) + '\n{"ok":1}\n'), tail = createTail(file);
  const lines = []; let overflowed = false;
  while (tail.offset < fs.statSync(file).size) {
    const before = tail.offset, result = await tail.poll();
    assert.ok(tail.offset > before && tail.offset - before <= 1048576);
    overflowed ||= result.overflowed;
    lines.push(...result.lines);
  }
  assert.equal(overflowed, true);
  assert.deepEqual(lines, [{ok:1}]);
});
test('readTail returns the last 256 KiB without the partial first line', async t => {
  const contents = Array.from({length:100000}, (_, i) => JSON.stringify({i})).join('\n') + '\n';
  const file = fixture(t, contents), result = await readTail(file);
  const start = Buffer.byteLength(contents) - 262144;
  const expected = contents.slice(contents.indexOf('\n', start) + 1).trim().split('\n').map(JSON.parse);
  assert.deepEqual(result.lines, expected);
  assert.ok(result.lines[0].i > 0);
  assert.equal(result.endOffset, fs.statSync(file).size);
});
test('readTail on a sparse 64 MiB file reads only the tail', async t => {
  const file = fixture(t), fd = fs.openSync(file, 'r+');
  fs.ftruncateSync(fd, 64 * 1024 * 1024); fs.closeSync(fd);
  fs.appendFileSync(file, '\n{"i":1}\n{"i":2}\n{"i":3}\n');
  const start = performance.now(), result = await readTail(file);
  assert.deepEqual(result.lines, [{i:1},{i:2},{i:3}]);
  assert.ok(performance.now() - start < 1000);
});
test('readHead stops at maxBytes', async t => {
  const file = fixture(t, '{"skip":1}\n{"cwd":"/repo"}\n');
  assert.equal(await readHead(file, {maxBytes:12, accept:obj => !!obj.cwd}), null);
  assert.deepEqual(await readHead(file, {maxBytes:100, accept:obj => !!obj.cwd}), {cwd:'/repo'});
});
test('tail starts at the supplied byte offset', async t => {
  const file = fixture(t, '{"i":0}\n{"i":1}\n');
  assert.deepEqual((await createTail(file, {offset:8}).poll()).lines, [{i:1}]);
});
test('readTail leaves an unterminated final line for the live tail', async t => {
  const file = fixture(t, '{"a":1}\n{"b":');
  const result = await readTail(file);
  assert.deepEqual(result.lines, [{a:1}]);
  assert.equal(result.endOffset, 8);
  const tail = createTail(file, {offset:result.endOffset});
  fs.appendFileSync(file, '2}\n');
  assert.deepEqual((await tail.poll()).lines, [{b:2}]);
});
test('readTail consumes nothing when the parsing window has no complete line', async t => {
  const file = fixture(t, '{"b":');
  assert.deepEqual(await readTail(file), {lines:[], endOffset:0});
  fs.writeFileSync(file, 'discarded\n{"b":');
  assert.deepEqual(await readTail(file, {maxBytes:8}), {lines:[], endOffset:10});
});
