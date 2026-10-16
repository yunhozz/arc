# npm Node.js ARC installer implementation plan

> **For agentic workers:** Follow the user-approved specification and repository ARC role rules. Coder owns implementation, QA performs assigned checks, and CEO coordinates and accepts each task. Commit one focused commit after each accepted top-level task. Do not start dependent work before CEO acceptance.

**Goal:** Provide a Python-free npm/Node.js ARC installer with English target and preset choices while preserving existing installation boundaries, backups, rollback, and race protection.

**Architecture:** JavaScript ESM owns the CLI, model configuration, presets, and install orchestration. A prebuilt Node-API addon provides descriptor-relative filesystem operations. The npm package includes the runtime code, platform payload, license files, and supported native prebuilds.

**Tech Stack:** Node.js >=22, npm, JavaScript ESM, Node-API C addon, node:test, locked smol-toml runtime dependency. node-gyp, Python, and a compiler are permitted only in maintainer or CI native-build environments.

**Spec:** /Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-16-npm-node-installer-design.md

## Global constraints

- CLI questions, choices, help, status, errors, completion, and recovery guidance are in English.
- Targets are displayed as Claude, Codex, and All; accepted values are claude, codex, and all.
- Presets are displayed as Economy, Balanced (default), and Smart; accepted values are economy, balanced, and smart.
- Target has no default. In an interactive prompt, Enter selects Balanced for the preset.
- Ask only when stdin and stdout are both TTYs. Invalid input receives an English retry prompt.
- Non-TTY execution requires both --target and --preset and never waits for input.
- All preflights both targets, then installs Codex followed by Claude. First-target failure stops the second. Second-target failure leaves the first success installed and rolls back only Claude.
- --check and --dry-run perform no writes, subprocess calls, or network access.
- Runtime install, preset application, check, and dry-run do not require or invoke Python, a compiler, or native downloads.
- Preserve the existing npx skills@latest command, isolated environment, exact result validation, and timeout behavior.
- Do not add npm lifecycle hooks that compile native code or mutate user configuration.
- Keep apply-models.py and its model_config.py modules as optional post-install tools. Retain unrelated Python tools.
- Keep install.command as a Node entrypoint with existing argument forwarding. Retire direct python3 install.py invocation only after parity acceptance.
- Do not publish, push, create a PR, or merge before the approved execution target and required implementation review. Do not merge the PR.
- Before source edits, inspect the selected execution target and preserve user changes.

### Supported environments and exit codes

| Area | Contract |
|---|---|
| Node.js | Minimum 22; verify on 22 and 24 |
| macOS | arm64 and x64; minimum macOS 13 |
| Linux | arm64 and x64; glibc 2.28 baseline |
| Unsupported | Windows, musl, other CPUs; fail before writes |
| Native failure | Fail before writes; no path-based JavaScript fallback |

| Outcome | Exit code |
|---|---:|
| Successful install, check, or dry-run | 0 |
| Usage, runtime, environment, target-path configuration error, or unavailable native addon | 2 |
| Manifest/profile validation, acquisition, install, drift, or rollback failure | 1 |
| User cancel or interrupt after successful required rollback | 130 |

All partial success exits 1 and reports each target status. An interrupt whose rollback fails exits 1 and reports recovery paths. Help and version do not load the native addon.

### Approved role presets

Role order is Scouter, Planner, Coder, QA, Reviewer. Cells are model/effort.

| Platform and preset | Role values in the order above |
|---|---|
| Codex Economy | gpt-6-luna/high, gpt-6.1-sol/medium, gpt-6.1-sol/low, gpt-6-luna/high, gpt-6.1-sol/medium |
| Codex Balanced | gpt-6.1-sol/medium, gpt-6.1-sol/high, gpt-6.1-sol/medium, gpt-6.1-sol/medium, gpt-6.1-sol/high |
| Codex Smart | gpt-6.1-sol/high, gpt-6-astra/high, gpt-6-astra/high, gpt-6.1-sol/high, gpt-6-astra/high |
| Claude Economy | haiku/high, sonnet/medium, sonnet/low, haiku/high, sonnet/medium |
| Claude Balanced | sonnet/medium, sonnet/high, sonnet/medium, sonnet/medium, sonnet/high |
| Claude Smart | sonnet/high, opus/high, opus/high, sonnet/high, opus/high |

Economy reads each platform's existing models.toml; the table is a regression expectation, not a second runtime source. Preserve Codex schema version 5 and model_reasoning_effort, and Claude schema version 1 and effort.

## File and interface map

| Path | Responsibility |
|---|---|
| native/binding.c, native/binding.gyp | Descriptor-relative Node-API operations |
| lib/safe-fs/native.mjs, lib/safe-fs/index.mjs | Native selection, verification, safe handles |
| scripts/build-native.mjs | Maintainer native build |
| .github/workflows/native-prebuilds.yml | Four-tuple build and provenance artifacts |
| prebuilds/index.json, prebuilds/<tuple>/arc_safe_fs.node | Runtime binaries and hash/provenance |
| lib/models/*.mjs | Model schemas, presets, renderers |
| codex/skill/presets.toml, claude/skill/presets.toml | Balanced and Smart overlays |
| lib/installer/*.mjs | Manifest, targets, global plans, acquisition, transactions |
| lib/cli/*.mjs, bin/arc-install.mjs | CLI parsing, prompts, output, entrypoint |
| tests/node/*.test.mjs | Node behavior, safety, CLI, and package tests |
| tests/installer-parity.json | Legacy test assertion migration ledger |
| tests/test_codex_models.py, tests/test_arc_policy.py | Preserved optional-helper and ARC-policy Python tests |
| package.json, package-lock.json, install.command, README.md, MANIFEST.sha256 | Packaging, entrypoint, docs, protected files |

Core interfaces:

- Safe filesystem: openRoot(path) returns DirectoryHandle; handles expose stat, readDir, lstat, readlink, openDir, openFile, mkdir, renameTo, unlink, rmdir, chmod, setTimes, sync where applicable, and close.
- Handle names are one path component only; reject empty, dot, dot-dot, slash, and NUL.
- Model layer: loadModelConfig(text, platform), applyPreset(config, preset, overlay), serializeModelConfig(config), renderProfiles(profileBuffers, config).
- Installer layer: verifyPayload(packageRoot, safeFs), resolveTarget(platform, environment), buildInstallPlan(inputs), validatePlanSet(plans), acquireExternalSkills(inputs), installTargets(plans, dependencies).
- CLI layer: runCli(argv, injectedIOAndEnvironment) returns the approved exit code.
- Renderers consume verified original buffers rather than reopening profile paths.
- Snapshot device, inode, size, mode, and timestamp metadata needed for comparisons.
- Inject spawn, clock, and fault hooks for tests only; never expose them as CLI options.
- If a producer/consumer contract changes, update both sides and tests within the same accepted task.

## Execution and acceptance rules

- Task order is T1 through T7. A dependent task starts only after CEO accepts its predecessor.
- Each task follows RED, implementation, GREEN, assigned QA, CEO acceptance, and one focused commit.
- Update the protected-file manifest in the task that changes protected files.
- Local host native evidence, artifact acquisition, and final cross-platform execution are separate gates.
- Never treat a binary header or hash check as proof that a binary runs on another operating system.
- Publish or push only after checking available authorization and after the user-selected execution target is established.

## T1. Descriptor-safe filesystem layer

**Goal:** Build the shared safe filesystem API, package skeleton, native build contract, and test inventory without switching public entrypoints.

**Files:** Create native/binding.c, native/binding.gyp, lib/safe-fs modules, scripts/build-native.mjs, package.json, package-lock.json, native build workflow, manifest checker, parity ledger and checker, and focused safe-fs/native-loader tests. Update MANIFEST.sha256 as needed.

**Depends on:** None.

**Interfaces and safety:**

- openRoot traverses from the filesystem root without following symlink components.
- DirectoryHandle operations stay relative to held descriptors. FileHandle operations verify regular-file type and identity.
- Open file operations must not block on a swapped FIFO; combine non-following/nonblocking open flags with fstat validation.
- Reject unsupported behavior instead of falling back to path-based JavaScript operations.
- Native bootstrap checks Node version, OS, CPU, libc, binary type, and expected hash before loading the packaged addon directly. Check and dry-run create no temporary copies or other files. Treat package code as the process trust boundary; this check detects a preexisting mismatch but does not claim atomic protection against a concurrent rewrite of the package itself. Managed target paths still require the full descriptor-based race protection below.
- Payload descriptor verification occurs after native load. Treat the package code trust boundary separately from user target-directory race protection.
- Add exact node-gyp dev dependency and lockfile in this task. No npm lifecycle hooks.
- Build workflow records binary hash, source commit, native input digest, Node-API version, compiler, headers, and sysroot. Build Linux against glibc 2.28 and macOS with deployment target 13.0. Do not push merely to trigger the workflow.

**TDD steps:**

1. Add failing tests for invalid components, symlink parents/leaves, FIFO/socket rejection, metadata, descriptor-relative rename, closed handles, and error cleanup.
2. Run the focused test command and confirm the expected failures.
3. Implement the C addon and constrained JavaScript wrappers.
4. Add deterministic parent/leaf replacement tests; assert an outside sentinel is never read or changed.
5. Add loader tests for missing/tampered binaries and unsupported OS/CPU/libc; assert failure precedes writes.
6. Build the host tuple and run the safe-fs and loader tests.
7. Inventory every test ID in tests/test_install.py and tests/test_target_install.py in the parity ledger, assigning its future Node equivalent or Python preservation file.
8. Add manifest generation and check mode while retaining the existing installer manifest requirements.

Focused checks:

    node scripts/build-native.mjs --tuple <host-tuple> --output build/native/<host-tuple>
    node --test tests/node/safe-fs.test.mjs tests/node/native-loader.test.mjs
    node scripts/check-installer-parity.mjs --task T1
    node scripts/update-manifest.mjs --check
    git diff --check

**Acceptance and QA:** Host-native safety and race tests pass; no path fallback exists; native artifact metadata is complete. QA checks sentinel and fail-before-write evidence. Other platform execution remains a final gate.

**Stop if:** Outside contents can be read or changed, descriptor safety is unavailable, build inputs cannot be identified, or runtime needs compilation.

**Commit:** feat(installer): descriptor 기반 안전 파일 계층 추가

## T2. Model schemas and performance presets

**Goal:** Implement pure platform model parsing, preset application, and profile rendering.

**Files:** Create lib/models modules, both platform presets.toml files, and model/profile tests. Update package.json, package-lock.json, manifest, and parity ledger.

**Depends on:** T1 package skeleton and lockfile.

**Runtime dependency:** Add an exact smol-toml dependency and lock it in T2. Confirm the packed package obtains the dependency through the normal npm dependency path without Python or compilation.

**TDD steps:**

1. Add failing tests for valid platform schemas, malformed TOML, duplicate keys/roles, wrong versions, missing/unknown roles, invalid model/effort fields, and unsupported presets.
2. Run the focused model test and confirm RED.
3. Implement platform validation and preset overlay. Economy loads from the existing models.toml; store only Balanced and Smart overlays.
4. Add table-driven assertions for all 30 approved values and exact Economy equivalence.
5. Add renderer tests proving only model/effort fields change and descriptions, tools, body text, and line endings remain intact.
6. Reparse generated model and profile output and verify it represents the selected preset.
7. Run model/profile tests, update the manifest and parity ledger.

Focused checks:

    node --test tests/node/models.test.mjs tests/node/profile-render.test.mjs
    node scripts/check-installer-parity.mjs --task T2
    node scripts/update-manifest.mjs --check
    git diff --check

**Acceptance and QA:** All 30 values match; Economy is not duplicated; invalid roles fail before install output; renderers preserve non-model content.

**Stop if:** Existing profile semantics cannot be preserved, the dependency requires runtime compilation/download outside npm dependency installation, or the parser cannot distinguish invalid schemas.

**Commit:** feat(models): 역할별 성능 프리셋 추가

## T3. Payload verification, targets, and read-only preflight

**Goal:** Produce a verified payload and read-only target/global installation plan.

**Files:** Create manifest, targets, global-config, and plan modules with corresponding Node tests. Update manifest and parity ledger.

**Depends on:** T1 and T2.

**TDD steps:**

1. Add failing manifest tests for escape paths, duplicate/missing/extra entries, hash mismatch, file types, mutable models exceptions, and missing runtime assets.
2. Confirm RED, then implement payload verification through safe-fs handles.
3. Add failing target tests for CODEX_HOME, Claude default path and CLAUDE_CONFIG_DIR, single-target isolation, overlapping write roots, symlink parents, and special files.
4. Confirm RED, then implement target resolution. A single-target run must not inspect the other platform's environment or home.
5. Add and run global-config tests for managed markers, malformed/legacy markers, idempotency, CRLF, invalid UTF-8, and Codex wait settings.
6. Implement global planning that preserves all bytes outside managed blocks and validates semantic TOML edits.
7. Add preflight tests for missing optional external skills, unsafe destinations, and All write-path collisions.
8. Assert plan construction makes no filesystem changes and invokes no subprocess/network.

Focused checks:

    node --test tests/node/manifest.test.mjs tests/node/targets.test.mjs tests/node/global-config.test.mjs tests/node/plan.test.mjs
    node scripts/check-installer-parity.mjs --task T3
    node scripts/update-manifest.mjs --check
    git diff --check

**Acceptance and QA:** Invalid payload/config/target fails before acquisition or writes; other target remains uninspected; global user bytes are preserved; plan generation is read-only.

**Stop if:** The plan needs to inspect an unselected target, user-owned content is lost, or mutable manifest exceptions expand.

**Commit:** feat(installer): 무결성 검사와 대상별 사전 계획 추가

## T4. Isolated external skill acquisition

**Goal:** Port the existing npx skill acquisition contract without shell evaluation or credential leakage.

**Files:** Create acquisition module, fake-npx fixture and acquisition tests. Update manifest and parity ledger.

**Depends on:** T1; execute after T3 acceptance.

**Contract:** Use the existing exact npx command and argv, isolated temporary HOME/config/cache/npmrc/gitconfig, allowlisted environment, 300-second timeout, 5-second termination grace, descendant cleanup, and exact three-skill JSON validation.

**TDD steps:**

1. Add failing tests for argv, child environment, isolated paths, timeout/cancel, and descendant cleanup; confirm RED.
2. Implement spawn with executable plus argv array, never a shell string.
3. Add tests for exact status/source/ref/scope/agents/mode/path fields and reject duplicate, missing, extra, malformed, or unsafe records.
4. Validate required files and acquired trees, including internal link handling and rejection of root/escape/dangling/cyclic links and special files.
5. Add failing cleanup tests for nonzero exit, malformed JSON, timeout, cancellation, and missing required files; implement cleanup.
6. Run the focused acquisition suite; verify fake commands cannot access user credentials or persistent user state.

Focused checks:

    node --test tests/node/acquisition.test.mjs
    node scripts/check-installer-parity.mjs --task T4
    node scripts/update-manifest.mjs --check
    git diff --check

**Acceptance and QA:** Existing acquisition command/schema is preserved, no acquired script is executed, and no descendant remains after cancellation. Fake npx results are not presented as proof of live upstream behavior.

**Stop if:** Upstream schema changes, environment isolation fails, or any Python command is invoked. Do not silently change acquisition source/version.

**Commit:** feat(installer): 격리된 외부 스킬 취득 포팅

## T5. Transaction, rollback, and All targets

**Goal:** Connect verified plans and acquisition to safe snapshots, backup, staging, replacement, rollback, and target-ordered All behavior.

**Files:** Create transaction/install modules and focused transaction/install/All tests. Update manifest and parity ledger.

**Depends on:** T1 through T4.

**TDD steps:**

1. Add failing snapshot, same-filesystem staging, backup-bytes/metadata, normal install, and rollback tests; confirm RED.
2. Implement each filesystem action through safe-fs handles and record an action log.
3. Add fault injection before and after every mutation boundary. Verify prior content is restored, new targets are removed only when identity is known, and user-owned profiles remain unchanged.
4. Add Claude link tests for the single allowed leaf-link pattern, preservation of original link text, independent copy, and rollback restoration.
5. Add drift tests for target/global/link changes during acquisition and immediately before replacement.
6. Add All preflight failure, Codex-first success, first-target failure, and Claude failure tests. A second-target failure must not roll back Codex.
7. Add recovery-failure tests proving staged/backup material remains and absolute recovery paths are reported.
8. Run focused tests with the real native layer and fault injection.

Focused checks:

    node --test tests/node/transaction.test.mjs tests/node/install.test.mjs tests/node/all-targets.test.mjs
    node scripts/check-installer-parity.mjs --task T5
    node scripts/update-manifest.mjs --check
    git diff --check

**Acceptance and QA:** No mutation uses unchecked multi-component paths; drift fails closed; target backups/rollback are independent; partial All status and recovery information are accurate.

**Stop if:** Any uncertain target is deleted, a first-target success is rolled back due to second-target failure, or safe-fs is bypassed.

**Commit:** feat(installer): 트랜잭션 복구와 all 대상 지원

## T6. CLI, npm package, and Node entrypoint

**Goal:** Expose the accepted engine through npm and preserve the shell wrapper contract.

**Files:** Create CLI modules and bin; finalize package metadata and lockfile; update install.command; add CLI, PTY, and package tests.

**Depends on:** T1 through T5 and availability of matching-source native artifacts for all supported tuples.

**Native artifact acquisition:**

1. Build the four target tuples on matching supported environments using the workflow from T1.
2. Import only artifacts with matching tuple, source commit/native-input digest, and SHA-256 provenance.
3. Reject missing, duplicate, stale, or wrong-architecture artifacts. Never copy one host binary under another tuple name.
4. If remote workflow/artifact access is unavailable, stop this task and report the precise blocker; do not push solely to make the workflow run.

**TDD steps:**

1. Add failing argument tests for valid values, duplicates, unknown flags, mutually exclusive modes, TTY missing-choice behavior, non-TTY missing flags, EOF, and help/version.
2. Confirm RED; implement runCli and a thin executable bin.
3. Add PTY tests for exact English prompts, no target default, Balanced-on-Enter, retry, cancellation, summary, and approved exit codes.
4. Verify --help and --version work without loading native code; unsupported platform errors occur before writes.
5. Implement check/dry-run with proof of no writes, subprocess, or network.
6. Set engines.node >=22, bin.arc-install, explicit files, locked smol-toml and node-gyp dependencies, npm scripts, and maintainer-only native build scripts. Do not add install lifecycle hooks.
7. Verify npm pack contents include runtime, payload, licenses, manifest, and all four binaries; exclude tests, build output, Git metadata, and install.py.
8. Change install.command to forward args and exit status to the Node bin.

Focused checks:

    node --test tests/node/cli.test.mjs tests/node/cli-pty.test.mjs tests/node/package.test.mjs
    npm pack --dry-run --json
    node scripts/update-manifest.mjs --check
    git diff --check

**Acceptance and QA:** CLI labels/defaults match the approved spec; npm lifecycle does not touch user state; pack contents are complete; shell wrapper forwards arguments and status unchanged.

**Stop if:** Any required binary is missing, install compiles/downloads native code, or package/runtime needs Python.

**Commit:** feat(cli): npm 대화형 설치 명령 추가

## T7. Python test preservation, packed consumer proof, and docs

**Goal:** Remove the Python installer only after Node parity and prove the actual npm tarball runs without Python.

**Files:** Add Node consumer/parity tests; split and retain tests/test_codex_models.py and tests/test_arc_policy.py; update README and MANIFEST.sha256; remove install.py, tests/test_install.py, and tests/test_target_install.py only after their installer assertions are covered. Retain tests/test_claude_payload.py, tests/test_token_usage.py, and optional helper/model modules.

**Depends on:** T1 through T6 accepted.

**Legacy test inventory and preservation:**

- Map every test ID from test_install.py and test_target_install.py to a Node test or a preserved Python suite in the parity ledger.
- Move ModelSettingsTests and ApplyModelsTests into test_codex_models.py. Load optional model_config modules directly; the preserved suite must not import install.py or test_install.py.
- Move TaskCommitPolicyTests, ConditionalReferenceTests, and other ARC policy checks into test_arc_policy.py or an existing independently maintained policy suite.
- Installer assertions that use global-block or manifest functions must have named Node replacements before removing the Python installer tests.
- Preserve all Claude payload/helper assertions and unrelated token-usage tests.
- Remove only assertions explicitly made obsolete by the approved CLI contract; record each removal and reason in the ledger.
- Confirm no preserved test imports install.py or a deleted test module.
- Delete old installer files only after all mapped or preserved assertions pass.

**Packed-consumer TDD:**

1. Add failing consumer tests for two isolated environments: no Python on PATH, and a Python/python3 trap that fails if called. Add node-gyp/compiler traps.
2. Pack the project and install/run only the tarball in a temporary directory whose path contains spaces; block access to the source checkout and development node_modules.
3. Use the actual Node installer/native layer and real temporary target homes. Fake only the external npx acquisition in deterministic tests.
4. Exercise help, check, dry-run, each target/preset combination, All, rollback, and no-write boundaries. Use absolute real npm for outer package installation so the fake npx is limited to skill acquisition.
5. Add a separate live upstream smoke check for Python-free execution. A network failure is reported as unverified, not passed.
6. Update README with npm and shell commands, English choices, Balanced default, supported OS/CPU/libc, Python-free installer requirements, optional Python helper requirements, backups, and recovery.
7. Regenerate and check MANIFEST.sha256 after removing install.py and adding runtime artifacts.

Focused checks:

    npm test
    node scripts/check-installer-parity.mjs --complete
    python3 -m unittest discover -s tests -p 'test_codex_models.py'
    python3 -m unittest discover -s tests -p 'test_arc_policy.py'
    python3 -m unittest discover -s tests -p 'test_claude_payload.py'
    node scripts/update-manifest.mjs --check
    npm pack --dry-run --json
    git diff --check

Python commands above are maintainer regression checks only. They are not package installation requirements.

**Acceptance and QA:** The packed artifact works outside the checkout without Python; traps never fire; all legacy installer assertions have Node equivalents and mixed non-installer assertions remain; README and manifest match the artifact; QA checks the packed consumer tree and parity ledger.

**Stop if:** Native provenance is missing, Python/compiler/native download is invoked at runtime, test assertions are lost, upstream acquisition changes, or Node safety diverges.

**Commit:** docs(installer): Python 설치 요구와 선택 도구 구분

## Final cross-platform verification and review

After T1 through T7 are accepted:

- Run the complete npm suite, package/manifest/parity checks, and retained Python regression suites.
- Load production binaries on Node 22 and 24 for all four tuples.
- Execute packed check, dry-run, install, rollback, and All on macOS 13 and glibc 2.28 minimum environments as well as supported current runners.
- Prove unsupported OS/CPU/libc and missing/tampered native fail before writes.
- Tie execution evidence to source digest, commit, binary hashes, and tarball hash.
- If access to runners, minimum environments, or artifact publication is missing, mark the evidence incomplete and do not claim full completion.
- After task acceptance and final checks, request one independent Reviewer pass over the whole branch diff, address findings, and rerun affected checks.
- Update the canonical handoff with accepted commits, verification evidence, selected worktree/branch, and remaining limits. Do not commit the handoff record.
- Create the Korean PR only after implementation and review; do not merge.

## Plan self-review

- The approved labels are Economy, Balanced (default), and Smart. No additional “current configuration” wording is shown in the CLI.
- All 30 platform/role/model/effort combinations are covered, and Economy remains sourced from existing models.toml.
- T1 creates package/lock infrastructure; T2 adds the TOML dependency; T6 consumes native artifacts; T7 handles Python parity and consumer proof.
- TDD red/green steps precede behavior implementation in each task.
- Mixed tests are separated and preserved before deleting installer-only files.
- Local host validation, artifact acquisition, and final four-platform execution are distinct gates.
- No code, test, package, branch, commit, push, or PR work begins before execution target selection.
