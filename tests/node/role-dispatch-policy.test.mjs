import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_TIMEOUT_MINUTES} from '../../lib/runtime/role-dispatch-policy.mjs';

test('arc_tester timeout is 60 minutes', () => {
  assert.equal(ROLE_TIMEOUT_MINUTES.arc_tester, 60);
  assert.equal(Object.hasOwn(ROLE_TIMEOUT_MINUTES, 'arc_qa'), false);
});
