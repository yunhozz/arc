import test from 'node:test';
import assert from 'node:assert/strict';
import {WATCH_KINDS, VERBOSE_KINDS} from '../../lib/watch/model.mjs';
import {sanitizeMessage, sanitizeText, maskSecrets, clipCodePoints, isVisible} from '../../lib/watch/policy.mjs';

test('sanitizeText strips terminal control sequences and collapses whitespace', () => {
  assert.equal(sanitizeText('a\n\tb\x1b[31mc\x1b]0;t\x07 d\u009b'), 'a bc d');
  assert.equal(sanitizeText(undefined), '');
  assert.equal(sanitizeText('\x1b]8;;https://evil.test\x1b\\link\x1b]8;;\x1b\\\u009b31m!\u0000\u0085'), 'link!');
});
test('maskSecrets masks each spec pattern', () => {
  for (const [input, secret] of [
    ['curl -H "Authorization: Bearer abc.def-ghi"', 'abc.def-ghi'],
    ['sk-ant-api03-' + 'A'.repeat(24), 'A'.repeat(24)],
    ['ghp_' + 'a'.repeat(36), 'a'.repeat(36)],
    ['github_pat_' + 'b'.repeat(30), 'b'.repeat(30)],
    ['xoxb-1234567890-abcdef', '1234567890-abcdef'],
    ['AKIA' + 'ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'],
    ['AIza' + 'c'.repeat(35), 'c'.repeat(35)],
    ['-----BEGIN RSA PRIVATE KEY-----\nMIIEow', 'MIIEow'],
    ['PASSWORD=hunter2', 'hunter2'], ['api_key: abc123', 'abc123'],
    ['--token abc123', 'abc123'], ['GITHUB_TOKEN="x y"', 'x y'],
    ['passwd=abc123', 'abc123'], ['MY_private_key=abc123', 'abc123'],
    ['Authorization: Basic abc123', 'abc123'],
    ['https://user:pw@host/x', 'user:pw'],
  ]) {
    const output = maskSecrets(input);
    assert.ok(!output.includes(secret), input);
    assert.ok(output.includes('***'), input);
  }
  assert.equal(maskSecrets('https://user:pw@host/x'), 'https://***@host/x');
});
test('maskSecrets leaves ordinary text unchanged', () => {
  for (const text of ['git status --short --branch', 'author: Kim', 'tokenizer tests pass', 'node --test tests/node/watch-policy.test.mjs']) assert.equal(maskSecrets(text), text);
});
test('clipCodePoints counts code points and marks truncation', () => {
  assert.deepEqual(clipCodePoints('abcdef', 4), {text:'abc…', truncated:true});
  assert.deepEqual(clipCodePoints('abc', 4), {text:'abc', truncated:false});
  assert.deepEqual(clipCodePoints('😀😀😀', 2), {text:'😀…', truncated:true});
  assert.deepEqual(clipCodePoints('a', 0), {text:'', truncated:true});
});
test('verbose-only kinds are hidden by default', () => {
  for (const kind of VERBOSE_KINDS) {
    assert.equal(isVisible(kind, false), false);
    assert.equal(isVisible(kind, true), true);
  }
  for (const kind of WATCH_KINDS.filter(kind => !VERBOSE_KINDS.includes(kind))) {
    assert.equal(isVisible(kind, false), true);
    assert.equal(isVisible(kind, true), true);
  }
});


test('R1 L1 equals flags and JSON secret keys mask only secret values', () => {
 for(const [input,expected] of [
  ['--password=hunter2','--password=***'], ['--api-key=abc','--api-key=***'], ['--auth=x','--auth=***'],
  ['{"password":"hunter2"}','{"password":***}'], ['"api_key": "abc"','"api_key": ***'],
 ]) assert.equal(maskSecrets(input),expected);
 for(const text of ['author: Kim','tokenizer tests pass','--author=Kim']) assert.equal(maskSecrets(text),text);
});


test('sanitizeMessage keeps line structure and indentation', () => {
  assert.equal(sanitizeMessage('\n\nfirst  \n  - item\n\n  code\n\n'), 'first\n  - item\n\n  code');
});
test('sanitizeMessage strips escapes and controls and normalizes newlines and tabs', () => {
  assert.equal(sanitizeMessage('a\r\nb\rc\u2028d\u2029e'), 'a\nb\nc\nd\ne');
  assert.equal(sanitizeMessage('\tx'), '    x');
  assert.equal(sanitizeMessage('a\x1b[2Jb\x1b]8;;http://x\x07c\x9b31md\x07\x00e'), 'abcde');
});
test('sanitizeMessage masks secrets on any line including PEM blocks', () => {
  assert.equal(sanitizeMessage('ok\nGITHUB_TOKEN=abc\nauthor: Kim'), 'ok\nGITHUB_TOKEN=***\nauthor: Kim');
  assert.equal(sanitizeMessage('keep\n-----BEGIN RSA PRIVATE KEY-----\nAAA\nBBB'), 'keep\n***');
  assert.match(sanitizeMessage('x\nBearer abcdef0123456789'), /\nBearer \*\*\*$/);
  assert.equal(sanitizeMessage('token=\nauthor: Kim'), 'token=\nauthor: Kim');
  assert.equal(sanitizeMessage('token="abc\nnext line"\nauthor: Kim'), 'token=***\nnext line"\nauthor: Kim');
});
test('sanitizeMessage of blank-only text is empty', () => {
  assert.equal(sanitizeMessage(' \n\t\n '), '');
  assert.equal(sanitizeMessage(null), '');
});
test('sanitizeMessage is idempotent', () => {
  const s = sanitizeMessage('a\r\n\tb\nGITHUB_TOKEN=x');
  assert.equal(sanitizeMessage(s), s);
});
