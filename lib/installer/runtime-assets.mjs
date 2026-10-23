// Installation inventory uses repository-root-relative POSIX paths.
// Keep install-only additions separate from cooperative runtime hash inputs.
export const RUNTIME_MODULE_PATHS = Object.freeze([
 'lib/runtime/acceptance.mjs',
 'lib/runtime/adapters/claude.mjs',
 'lib/runtime/adapters/codex.mjs',
 'lib/runtime/assignment.mjs',
 'lib/runtime/bootstrap.mjs',
 'lib/runtime/capabilities.mjs',
 'lib/runtime/cli.mjs',
 'lib/runtime/command.mjs',
 'lib/runtime/cooperative-schema.mjs',
 'lib/runtime/cooperative.mjs',
 'lib/runtime/evaluate.mjs',
 'lib/runtime/external.mjs',
 'lib/runtime/gate.mjs',
 'lib/runtime/git-evidence.mjs',
 'lib/runtime/git-query.mjs',
 'lib/runtime/identity.mjs',
 'lib/runtime/operations.mjs',
 'lib/runtime/schema.mjs',
 'lib/runtime/scope.mjs',
 'lib/runtime/store.mjs',
 'lib/runtime/verification.mjs'
]);
