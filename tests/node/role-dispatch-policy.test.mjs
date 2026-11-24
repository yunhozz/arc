import test from 'node:test';
import assert from 'node:assert/strict';
import {CODEX_PROFILE_ARGS_FORM, ROLE_TIMEOUT_MINUTES} from '../../lib/runtime/role-dispatch-policy.mjs';

test('arc_tester timeout is 60 minutes', () => {
  assert.equal(ROLE_TIMEOUT_MINUTES.arc_tester, 60);
  assert.equal(Object.hasOwn(ROLE_TIMEOUT_MINUTES, 'arc_qa'), false);
});

test('Codex profile argv uses the accepted exec form', () => {
  // Codex 0.170.0, 2026-11-24, MI-1
  assert.equal(CODEX_PROFILE_ARGS_FORM, 'B');
});
