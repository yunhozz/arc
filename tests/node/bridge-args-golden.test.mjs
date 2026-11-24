import assert from 'node:assert/strict';
import test from 'node:test';
import {buildBridgeArgs} from '../../lib/runtime/role-bridge-args.mjs';
import {bridgeArgsCases, readBridgeArgsGolden} from './fixtures/bridge-args-golden.mjs';

test('read-role and non-adapter argv equal base 6244a8af golden', async t => {
  const {base, combinations} = readBridgeArgsGolden();
  const cases = [...bridgeArgsCases()];
  assert.equal(base, '6244a8af');
  assert.deepEqual(Object.keys(combinations).sort(), cases.map(({key}) => key).sort());
  for (const {key, platform, inputs} of cases) {
    if (platform === 'claude' && inputs.role === 'arc_scouter') {
      await t.test(`${key} adds the B12 WebFetch and WebSearch allowance`, t => {
        t.todo('T4 adds the B12 allowance');
        const expected = [...combinations[key]];
        const mode = expected.indexOf('--permission-mode');
        assert.equal(expected[mode + 1], 'default');
        expected.splice(mode + 2, 0, '--allowedTools', 'WebFetch,WebSearch');
        assert.deepEqual(buildBridgeArgs(platform, inputs), expected);
      });
    } else {
      assert.deepEqual(buildBridgeArgs(platform, inputs), combinations[key], key);
    }
  }
});
