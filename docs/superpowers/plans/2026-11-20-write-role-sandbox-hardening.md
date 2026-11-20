# 쓰기 역할 sandbox 경계 보강 구현 계획 (Architectural, 3 task: T1·T2·T4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: v5 승인 (2026-11-20). v4: T4를 C-3+C-2로 변경. v5: C-3 (i)에 `.claude` 디렉터리 링크 포함. v2: T2 prepare 경로 보류 위치 정정. v3: `runtime-versions.test.mjs` 추가. Planner v0 + Orchestrator 반영: O1 쓰기 역할만, O2 해소, O4 `.codex` 사전 보류 추가.
- 작업 위치: `/Users/ma-24-007/Desktop/workspace/arc`, branch `fix/write-role-sandbox-hardening`, base `master` @ `b75d25a` (사용자 선택)
- Risk: high. T2·T4는 task마다 fresh QA, 전체 수용 뒤 최종 Reviewer 1회.
- 범위: spec §10의 T1, T2, T4. **T3(K-1 Grok deny, Grok P-1, L3, AC1)는 Grok 측정(M-K5–M-K16) 뒤 별도 plan으로 진행(보류).**
- Spec: `docs/superpowers/specs/2026-11-20-write-role-sandbox-hardening-design.md` v4 (사용자 승인 2026-11-20)

**Goal:** README를 실제 게이트 상태(G1/GK1 `pass`)에 맞춘다. 모든 bridge 역할에서 제어 파일(`.git` config·hooks·info, Claude/Codex 설정, Grok 사용자 설정) 변경을 사후 감지해 fail-closed 처리한다. Claude 쓰기 역할이 `.git`에 쓰지 못하고 project/local settings 병합으로 범위가 넓어지지 않게 한다. 정상 작업(파일 편집, `node --test`, git 읽기)은 모든 플랫폼에서 그대로 동작해야 한다.

**Architecture:**
- P-2 감지는 `role-observe.mjs`에 `snapshotControlFiles`를 추가하고 `detectViolations`를 확장한다. 새 모듈 없음.
- supervisor는 기존 worktree snapshot과 같은 try 블록에서 before/after를 찍는다.
- P-3은 prepare·run·resume이 함께 쓰는 `buildBridgeInvocation`에 넣는다 (이전 D8 `grokProfileCovered`와 같은 위치).
- K-2 Grok config 보안 키 projection은 `grok-sandbox.mjs`에 두고, `role-observe`는 `extra[].project` 함수를 주입받아 platform 중립을 유지한다.
- T4는 D1을 D2로 바꾸고 Claude 쓰기 역할 인자에 `--setting-sources user`를 더한다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, `node:fs/promises`(lstat/readdir/readlink), `scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs`, `tests/node/fixtures/installed-layout.mjs`

## Global Constraints

- **D2 Claude settings** (T4, 의미 그대로, deep-freeze):
  `{"permissions":{"deny":["Edit(./.git/**)","Write(./.git/**)"]},"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false,"failIfUnavailable":true,"filesystem":{"denyWrite":["./.git"]}}}`
- **C-1 인자 (v4 폐기):** `--setting-sources user`는 project CLAUDE.md 로딩을 끄므로 쓰지 않는다 (spec §11 L4 (c)). 대신 **C-3**: bridge route의 Claude `arc_implementer`/`arc_qa`는 worktree `.claude/settings.json`·`.claude/settings.local.json` 중 하나라도 (i) symlink이거나 일반 파일이 아님(v5: `.claude` 디렉터리 자체가 symlink이거나 디렉터리가 아니면 설정 파일 유무와 관계없이 보류), (ii) JSON 파싱 실패, (iii) 비어 있지 않은 `permissions.additionalDirectories`, (iv) `permissions.allow`에 `Edit(`/`Write(`/`MultiEdit(`/`NotebookEdit(`로 시작하는 항목, (v) `hooks` 키, (vi) `sandbox` 키, (vii) `permissions.defaultMode` 키가 있으면 `permission_scope_unverified`로 보류한다. 파일이 없으면 통과.
- **측정 근거 버전:** Claude 2.1.327, Codex 0.170.0, macOS, 2026-11-20 (spec §11).
- **reason code:** 새 코드 없음. 사전 보류 `permission_scope_unverified`, 사후 관측 `permission_violation_observed`, before snapshot 실패 `execution_failed`(spawn 없음).
- **제어 파일 라벨** (record에는 위치만, 내용 없음): `git:config`, `git:config.worktree`, `git:hooks/<상대경로>`, `git:info/<상대경로>`, 상한 초과 시 `git:hooks` 또는 `git:info`, `worktree:.claude/settings.json`, `worktree:.claude/settings.local.json`, `worktree:.codex/config.toml`, `grok-home:config.toml`, `grok-home:sandbox.toml`.
- **감지 제외:** `<gitCommonDir>/arc/**`, `objects`, `refs`, `index`, `logs`, walk 안의 `*.lock` 이름. walk 대상은 config, config.worktree, hooks/**, info/**뿐이다.
- **hooks/info 상한:** 트리마다 1000개까지 개별 라벨, 1001개 이상이면 그 트리 전체를 상태 `overflow` 하나로 둔다.
- **편집 위치:** runtime은 `lib/runtime/`만 편집, `shared/skill/runtime/`은 `node scripts/update-runtime-assets.mjs`로 생성, 설치본은 편집하지 않는다.
- **사용자 파일 불변(AC8):** `~/.grok/*`, `~/.claude*`, `~/.codex/config.toml`, 이 저장소 `.git/*`는 건드리지 않는다. 테스트는 임시 HOME과 임시 git 저장소(`os.tmpdir()`)만 쓴다.
- **자동 복구 금지:** 감지한 변경은 기록하고 실패 처리만 한다.
- **실행 규칙:** bridge 실행 중 커밋 금지. 커밋 메시지 `type(scope): 한국어 설명`. top-level task 1개 = focused commit 1개, Orchestrator가 수용 뒤 커밋. `node --test` 옵션은 파일 경로 앞에.
- **실행 환경 분담:** Implementer·QA는 Codex bridge child다. 아래 focused 테스트만 실행한다. `role-bridge-run.test.mjs`, `grok-bridge.test.mjs`(supervisor spawn, `ps` 필요), 전체 `npm test`, live 확인은 Orchestrator가 host에서 실행하고 출력을 QA에 전달한다.

## Review Focus

| ID | 확인할 상황 | 기대 결과 | 담당 |
|---|---|---|---|
| RF1 | allowedPaths 표기 변형: `./.git/config`, `.GIT/hooks/`, `.claude`, `.codex/`, `.`, `./` | 모두 P-3 보류. `.gitignore`, `.github/`, `.claude/agents/x.md`, `.claude-plugin/x`, `.codexrc`는 통과 | T2 |
| RF2 | child의 정상 git 사용(`git status`/`diff`/`log`)이 `index`, `logs/HEAD`, `objects/**`, `arc/**`, `info/*.lock`을 바꿈 | 제어 파일 위반 없음 | T2 |
| RF3 | 연결 worktree에서 공용 `<common>/hooks` 변경, `<gitDir>/config.worktree` 변경 | 각각 `git:hooks/<f>`, `git:config.worktree`로 감지 | T2 |
| RF4 | `~/.grok/config.toml`의 비보안 키만 변경 / `permission_mode`·`[compat.claude]` 변경 / multiline 문자열 포함 | 비보안 키 통과, 보안 키 위반, multiline이면 전체 해시 fallback | T2 |
| RF5 | 같은 내용의 새 파일로 교체(ino 변경), symlink 교체, `.claude` 부재→부재 | 교체는 위반, 부재→부재는 통과 | T2 |

---

## B0. Baseline 기록 (Orchestrator, 커밋 없음, 모든 task 전)

- [ ] host 전체 테스트: `npm test > <scratchpad>/b0-host-full.txt 2>&1`. 미커밋 파일은 spec과 plan뿐이어야 한다. 실패 이름 집합을 `B0-host`로, tests/fail/skip 수와 함께 기록.
- [ ] 생성물 상태 (기대: exit 0, diff 없음. 다르면 baseline으로 기록): `node scripts/update-runtime-assets.mjs --check`, `node scripts/update-manifest.mjs --check`, `node tests/node/fixtures/installed-layout.mjs --diff`
- [ ] S-2/AC8 해시를 읽기 전용으로 기록 (부재도 상태).
- QA 실패 분류는 이전 plan(`docs/superpowers/plans/2026-11-19-bridge-gate-g1-gk1.md` "QA 실패 분류 규칙") (a)–(d)를 따른다. 현재 실패가 하나라도 있으면 해당 task 수용을 보류한다.

---

### Task T1: README 게이트 상태 정정(F2)과 정합성 테스트

**목표:** README 호스트 표의 Claude 행과 Grok 행을 G1/GK1 `pass`에 맞추고, 이후 게이트 값과 README가 어긋나면 실패하는 테스트를 둔다.
**배정:** H2, AC6(README 두 행, 정합성 테스트). **선행:** B0.
**allowedPaths:** `README.md`(tracked), `tests/node/readme-gate-consistency.test.mjs`(신규), `MANIFEST.sha256`(tracked, manifest 대상일 때만 변경).
**Interfaces:** Consumes `BRIDGE_GATE_RESULTS`(`lib/runtime/role-dispatch-policy.mjs`). T2·T4가 README 행을 다시 고쳐도 이 테스트는 계속 통과해야 한다.

- [ ] **Step 1 (RED):** `tests/node/readme-gate-consistency.test.mjs` 작성, 테스트 이름 `README host table matches recorded bridge gate results`.
  - README에서 `| Claude |`, `| Grok |`, `| Gemini |`로 시작하는 호스트 표 행을 각각 정확히 1개 찾는다 (0개나 2개 이상이면 실패).
  - `[platform, gate, heldPattern]` 표: `['Claude','G1',/Implementer\/QA held/]`, `['Grok','GK1',/write roles held/]`, `['Gemini','GG1',/write roles held/]`.
  - `BRIDGE_GATE_RESULTS[gate] === 'pass'`이면 행에 `heldPattern`이 없고 `` `${gate}` ``를 포함함을 단언, 아니면 `heldPattern`이 있음을 단언.
- [ ] **Step 2:** `node --test tests/node/readme-gate-consistency.test.mjs` → Claude·Grok FAIL 확인.
- [ ] **Step 3:** `README.md` 두 행의 4열만 고친다.
  - Claude 행: ``Scouter/Planner/Reviewer on Codex after per-call escalation; Implementer/QA run with the recorded sandbox settings (`G1` pass) and are held with `permission_scope_unverified` if settings injection fails``
  - Grok 행: ``Read roles enabled (not live-verified); write roles run with a per-dispatch sandbox profile confirmed by `ProfileApplied` (`GK1` pass, live-verified on Grok 1.0.89 macOS); `~/.grok/config.toml` and `~/.grok/sandbox.toml` are not in the deny list; Configure sets `[compat.claude]` agents/skills/rules to false in `~/.grok/config.toml` (session effect unverified)``
- [ ] **Step 4:** Step 2 명령 → PASS.
- [ ] **Step 5:** `node scripts/update-manifest.mjs --check`. 실패하면 `node scripts/update-manifest.mjs` 후 `--check` exit 0 확인.
- [ ] **Step 6 (Orchestrator):** 변경·untracked 파일이 allowedPaths 안인지 확인, host `npm test`가 `B0-host` 대비 새 실패 0건.
- [ ] **Step 7:** 수용·커밋 `docs(readme): G1·GK1 pass 반영과 게이트 정합성 테스트`

**QA:** 없음 (문서와 테스트 하나뿐인 저위험 변경, Step 6 host 확인으로 대신하고 최종 Reviewer 범위에 포함).
**Hold 조건:** README 다른 행 변경, 새 실패.

---

### Task T2: 제어 파일 사후 감지(P-2, K-2)와 allowedPaths 충돌 보류(P-3)

**목표:** 모든 bridge 역할 실행 전후로 제어 파일 상태를 비교해, 바뀌면 `allowedPaths`와 관계없이 `failed` + `permission_violation_observed`. Grok 쓰기 역할은 `~/.grok/config.toml`(보안 키)과 `~/.grok/sandbox.toml`도 비교. 제어 파일을 덮는 `allowedPaths`는 prepare·run·resume에서 보류.
**배정:** H4(P-2, P-3), H1의 K-2, H9, H10(`.codex` 사전 보류), AC3, AC4, AC5(P-3 부분, C-3 미채택), AC6(harness-operation 감지 보장·한계, README Grok 행), AC7, AC8.
**선행:** T1 수용·커밋.
**allowedPaths:** `lib/runtime/role-observe.mjs`, `lib/runtime/role-supervisor.mjs`, `lib/runtime/grok-sandbox.mjs`, `lib/runtime/role-routing.mjs`(v2), `shared/skill/runtime/role-observe.mjs`, `shared/skill/runtime/role-supervisor.mjs`, `shared/skill/runtime/grok-sandbox.mjs`, `shared/skill/runtime/role-routing.mjs`(v2), `tests/node/role-observe.test.mjs`, `tests/node/grok-sandbox.test.mjs`, `tests/node/role-routing-dispatch.test.mjs`, `tests/node/role-bridge-run.test.mjs`(host 실행), `tests/node/grok-bridge.test.mjs`(host 실행), `tests/node/runtime-versions.test.mjs`(v3, 모듈 해시 고정값 갱신만), `README.md`, `docs/harness-operation.md`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`.

**Interfaces (Produces):**
- `role-observe.mjs`: `export async function snapshotControlFiles({gitCommonDir, gitDir, worktree, extra = []}) -> Promise<Map<string, string>>`
  - `extra: Array<{label: string, path: string, project?: (bytes: Buffer) => string | null}>`
  - 반환 Map: 라벨 → 상태 문자열. 파일은 `<contentDigest 규칙의 값>:<dev>:<ino>`. 부재, symlink(대상 문자열), 디렉터리, 읽기 불가는 기존 `contentDigest` 값.
  - `project`가 있으면 `sha256('projection:' + project(bytes))`를 쓰고 dev/ino를 붙이지 않는다. `project`가 `null`이면 전체 내용 해시로 fallback.
  - throw(before 실패로 처리): 세 경로 중 하나가 절대 경로가 아님, `gitCommonDir`가 디렉터리가 아님, `hooks`·`info` readdir가 `ENOENT`/`ENOTDIR` 외 오류로 실패.
  - walk: `fsp.lstat`만, symlink 미추적. `hooks`·`info` 자체가 symlink나 파일이면 그 상태 하나만(라벨 `git:hooks`/`git:info`). 디렉터리 항목 라벨은 끝에 `/`, 값 `directory:<dev>:<ino>`. `.lock`으로 끝나는 이름은 건너뛴다.
  - 대상: `<gitCommonDir>/config`, `<gitDir>/config.worktree`(없으면 `deleted`, 라벨은 항상 존재), `<gitCommonDir>/hooks/**`, `<gitCommonDir>/info/**`, `<worktree>/.claude/settings.json`, `<worktree>/.claude/settings.local.json`, `<worktree>/.codex/config.toml`, `extra`.
- `detectViolations({role, allowedPaths, before, after})`: 반환에 `controlChanged: string[]`(정렬) 추가. `before.control`·`after.control` 중 하나라도 있으면 비교하고 없는 쪽은 빈 Map. `controlChanged.length > 0`이면 `reason = 'permission_violation_observed'`.
- `role-observe.mjs`: `export function allowedPathsCoverControl(allowedPaths: string[]) -> boolean`. 각 entry를 `path.posix.normalize`, 끝 `/` 제거, 소문자화한 값 `e`에 대해 다음 중 하나면 true:
  - `e === '.'`
  - `e === '.git'` 또는 `e.startsWith('.git/')`
  - `e`가 `.claude`, `.claude/settings.json`, `.claude/settings.local.json` 중 하나
  - `e === '.codex'` 또는 `e === '.codex/config.toml'` (O4 사용자 결정)
- `grok-sandbox.mjs`: `export function grokConfigSecurityProjection(bytes: Buffer) -> string | null`
  - UTF-8(fatal) 디코딩 실패나 `"""`·`'''` 포함 시 `null`.
  - 줄 단위로 현재 table header(`[x]`/`[[x]]`, 공백 제거)를 추적하고 다음 줄만 남긴다: table이 `compat.claude`이거나 `compat.claude.`로 시작, table이 `sandbox`이거나 `sandbox.`로 시작, 어느 table이든 `=` 앞 key(trim, 따옴표 제거)가 `/^(permission_mode|sandbox[\w-]*)$/`에 맞거나 `compat.claude`로 시작.
  - 남긴 줄을 `` `${table}\t${line.trim()}` ``으로 만들어 `\n`으로 잇는다.
- `role-supervisor.mjs`:
  - before/after: `{...await snapshotWorktree(target.realpath), control: await snapshotControlFiles({gitCommonDir: target.gitCommonDir, gitDir: target.gitDir, worktree: target.realpath, extra})}`. 위치는 기존 `:277`과 `:447`의 같은 try 블록.
  - `extra`는 `invocation.grokSandbox`일 때만 `[{label: 'grok-home:config.toml', path: path.join(homes.grok, 'config.toml'), project: grokConfigSecurityProjection}, {label: 'grok-home:sandbox.toml', path: path.join(homes.grok, 'sandbox.toml')}]`, 그 외 `[]`.
  - record에는 `controlChanged`가 비어 있지 않을 때만 최상위에 `controlFiles: {changed: [...]}` 추가.
  - `buildBridgeInvocation`의 permissions 계산(`:121`) 바로 뒤, Grok 블록 앞에 `if (Array.isArray(lease.allowedPaths) && allowedPathsCoverControl(lease.allowedPaths)) throw fail('permission_scope_unverified', 'allowedPaths cover a control file')` (run·resume 경로).
- `role-routing.mjs` (v2): `prepareRoleDispatch`는 `buildBridgeInvocation`을 호출하지 않으므로, route가 `bridge`로 정해진 뒤 lease 예약(`createLease`) 전에 `allowedPathsCoverControl(assignment.allowedPaths ?? [])`이 참이면 `permission_scope_unverified`로 hold하고 lease를 만들지 않는다. native route에는 적용하지 않는다 (사후 감지가 bridge 전용이고, native에서는 정당한 `.claude/settings.json` 편집 작업을 막게 되므로).

- [ ] **Step 1 (RED): `tests/node/role-observe.test.mjs`** 에 추가. 기존 임시 저장소 helper를 재사용하고, 각 사례는 fresh before를 찍고 `role: 'arc_implementer'`, `allowedPaths: ['src/a.js']`로 `detectViolations` 호출.
  1. `control snapshot labels hook add, modify and delete; config; info/exclude; config.worktree` — 각각 `reason === 'permission_violation_observed'`, `controlChanged`가 `['git:hooks/pre-commit']`, `['git:config']`, `['git:info/exclude']`, `['git:config.worktree']`. `config.worktree` 사례는 before 전에 `git config extensions.worktreeConfig true`로 setup.
  2. `git-ignored .claude/settings.local.json creation is a control violation with no changedPaths` — `.gitignore`에 경로를 넣고, `changedPaths` `[]`, `controlChanged` `['worktree:.claude/settings.local.json']`.
  3. `.codex/config.toml creation is labelled worktree:.codex/config.toml`
  4. `extra entries are compared under their label` — 임시 HOME 파일을 `{label: 'grok-home:config.toml'}`로 넘겨 바꾸면 `['grok-home:config.toml']`. `project: () => 'same'`인 extra는 내용이 바뀌어도 `[]`.
  5. `replacement by an identical new file or a symlink is detected` — 같은 바이트 rename 교체와 symlink 교체 모두 `['git:hooks/pre-commit']`.
  6. `more than 1000 hook entries collapse to one overflow state` — before 1000개, after 1개 추가 → `controlChanged`에 `'git:hooks'`.
  7. `arc, index, objects, logs and lock files are ignored` (RF2) — `<common>/arc/x`, `git add`로 `index` 갱신(대상 파일은 allowedPaths 안), `logs/HEAD` append, `objects/` 아래 파일, `info/exclude.lock` → `controlChanged` `[]`.
  8. `unchanged control files and absent .claude/.codex give no reason` (RF5) — `reason === null`, `controlChanged` `[]`.
  9. `allowedPaths and read roles do not exempt control files` — `allowedPaths: ['.claude/']`인 arc_implementer와 arc_reviewer가 `.claude/settings.json`을 바꾸면 둘 다 위반.
  10. `linked worktree sees common hooks and its own config.worktree` (RF3) — `git worktree add` 뒤 worktree target으로 snapshot, `<common>/hooks/post-checkout` → `['git:hooks/post-checkout']`.
  11. `snapshotControlFiles rejects relative paths, a missing gitCommonDir and an unreadable hooks directory` — hooks `chmod 0o000`, `process.getuid?.() === 0`이면 skip, 끝나면 권한 복원.
  12. `allowedPathsCoverControl` 표 테스트 (RF1) — true: `['.git/']`, `['.git']`, `['.git/hooks/pre-commit']`, `['./.git/config']`, `['.GIT/hooks/']`, `['.claude/']`, `['.claude']`, `['.claude/settings.json']`, `['.claude/settings.local.json']`, `['.Claude/Settings.json']`, `['.codex/']`, `['.codex/config.toml']`, `['.']`, `['./']`. false: `['src/a.js']`, `['.claude/agents/x.md']`, `['.github/']`, `['.gitignore']`, `['.claude-plugin/x']`, `['.codexrc']`, `[]`.
- [ ] **Step 2 (RED): `tests/node/grok-sandbox.test.mjs`** 에 `grokConfigSecurityProjection keeps only security keys` (RF4).
  - 같은 projection: `model = "a"` → `"b"`, 주석 줄 추가, `[ui]` table 추가.
  - 다른 projection: `permission_mode = "ask"` → `"always-approve"`, `[compat.claude]` 아래 `agents = false` → `true`, 새 `sandbox_profile = "x"`, `[sandbox]` table 항목 추가.
  - `"""` 포함이나 잘못된 UTF-8이면 `null`.
- [ ] **Step 3 (RED): `tests/node/role-routing-dispatch.test.mjs`** 에 추가.
  - `prepare holds permission_scope_unverified when allowedPaths cover a control file` — (v2: `role-routing.mjs` 검사로 충족, native route는 허용됨을 함께 단언) 기존 bridge prepare fixture로 arc_implementer에 `['.claude/settings.json']`, `['.git/hooks/']`, `['.codex/config.toml']` 각각. `decision === 'hold'`, reasons에 `permission_scope_unverified`, dispatch 미시작.
  - `buildBridgeInvocation rejects control-covering allowedPaths before reading the profile` — codex arc_implementer 최소 lease/config로 직접 호출, `reasonCode === 'permission_scope_unverified'` (supervisor·resume 경로 확인).
- [ ] **Step 4:** `node --test tests/node/role-observe.test.mjs tests/node/grok-sandbox.test.mjs tests/node/role-routing-dispatch.test.mjs` → 새 테스트 FAIL.
- [ ] **Step 5 (GREEN):** Interfaces대로 `role-observe.mjs`, `grok-sandbox.mjs`, `role-supervisor.mjs` 구현. `detectViolations` doc comment에 "control files are compared regardless of allowedPaths and role" 추가.
- [ ] **Step 6:** Step 4 명령 → PASS, 기존 테스트 새 실패 없음.
- [ ] **Step 7 (통합 테스트 작성, 실행은 Orchestrator host):**
  - `tests/node/role-bridge-run.test.mjs`:
    - `writing role changing a git hook fails permission_violation_observed with a controlFiles label and keeps the file` — codex scenario `writes`로 `path.join(f.cwd, '.git/hooks/pre-commit')`, arc_implementer, `allowedPaths: ['a.txt']`. 기대: `routeStatus === 'failed'`, codes `['permission_violation_observed']`, `record.controlFiles.changed` `['git:hooks/pre-commit']`, 파일 보존.
    - `read role creating .claude/settings.local.json fails permission_violation_observed` — claude arc_reviewer, fake claude scenario에 쓰기 수단이 없으면 codex arc_reviewer.
    - `unreadable hooks directory before spawn fails execution_failed without spawning` — `chmod 0o000 .git/hooks`, root면 skip, 권한 복원. 기대: codes `['execution_failed']`, fake child 호출 흔적 없음(기존 spawn 확인 방식 재사용).
    - `clean run with git status inside the child completes` (RF2) — child가 `git status`를 실행하는 scenario가 있으면 그것으로, 없으면 `index` 갱신만으로 확인. 기대 `completed`.
  - `tests/node/grok-bridge.test.mjs`:
    - `Grok write role changing permission_mode in grok-home config.toml fails permission_violation_observed` — 라벨 `grok-home:config.toml`.
    - `Grok write role adding a non-security key to grok-home config.toml completes`.
- [ ] **Step 8:** 문서.
  - `docs/harness-operation.md` G1/GK1 영역에 기존 형식·언어로: 제어 파일 감지 대상과 라벨; 사후 감지라는 한계(정당한 수정도 fail-closed, `core.hooksPath`가 가리키는 바깥 디렉터리 내용은 보지 않음, after snapshot 실패 시 판정 없음은 기존 동작); P-3 보류; **bridge 실행 중 host에서 `.git/config`를 쓰는 명령(`git config`, `git push -u` 등)과 커밋 금지**.
  - `README.md` Grok 행의 "`~/.grok/config.toml` and `~/.grok/sandbox.toml` are not in the deny list"를 "... are not in the deny list; their security-relevant changes are detected after the run (`permission_violation_observed`)"로.
- [ ] **Step 9:** 생성물.
  - `node scripts/update-runtime-assets.mjs` 후 `--check` exit 0. 바뀐 shared 파일은 allowedPaths의 세 개뿐 (다르면 hold).
  - `node tests/node/fixtures/installed-layout.mjs --write` 후 `--diff` 출력 없음.
  - `node scripts/update-manifest.mjs` 후 `--check` exit 0.
  - `node --test tests/node/readme-gate-consistency.test.mjs tests/node/installed-layout-golden.test.mjs` PASS.
- [ ] **Step 10 (Orchestrator host):** `node --test tests/node/role-bridge-run.test.mjs tests/node/grok-bridge.test.mjs`, 전체 `npm test`(새 실패 0건), AC8 해시 재확인. 출력은 QA에 전달.
- [ ] **Step 11 (fresh QA):** Step 4 명령 독립 재실행, Step 10 host 출력 분류, RF1–RF5 테스트 존재와 단언 확인, record에 라벨만 있고 내용 없음, before 실패 경로에 spawn 없음, Grok 프로필 생성 실패·정리 경로와의 순서(`failWithProfileCleanup` 유지).
- [ ] **Step 12:** 수용·커밋 `feat(runtime): 제어 파일 사후 감지와 allowedPaths 충돌 보류`

**QA:** 필수(fresh). 위험 high. 정상 작업 중 오탐이 생기면 모든 역할이 실패하므로 RF2·RF5가 핵심.
**Hold 조건:** shared 생성물이 allowedPaths 밖에서 변경, host 통합 테스트 새 실패, RF2 정상 경로 오탐.

---

### Task T3 (보류): Grok deny 보강(K-1, P-1 Grok), L3, AC1

Grok 측정(M-K5–M-K16, spec §11 보류) 뒤 별도 plan. 측정 재개 시 K-1 후보에 `~/.grok/hooks`, `hooks-paths`, `trusted_folders.toml`, `managed_config.toml`, `requirements.toml`을 포함한다 (spec §11 관찰). K-2 보안 키 집합(O3)도 M-K10·M-K16 결과로 재검토한다.

---

### Task T4: Claude 쓰기 역할 settings 보강(C-2 D2, C-1 `--setting-sources user`)

> **v4 보충 (이 절의 C-1 관련 내용보다 우선):**
> - `buildClaudeArgs`는 D2 `--settings`만 붙이고 `--setting-sources`는 붙이지 않는다. 테스트 `Claude writing roles get D2 settings ...`는 `--setting-sources`가 없음을 단언한다.
> - C-3: `role-observe.mjs`에 `export async function claudeProjectSettingsWidenScope(worktree) -> Promise<string|null>` (보류 사유 문자열 또는 null, Global Constraints의 (i)–(vii), lstat·O_NOFOLLOW로 읽기). `role-routing.mjs` prepare(bridge route, target platform `claude`, 쓰기 역할, lease 예약 전)와 `role-supervisor.mjs`의 `buildBridgeInvocation`(run·resume)에서 null이 아니면 `permission_scope_unverified`.
> - 추가 allowedPaths: `lib/runtime/role-observe.mjs`, `lib/runtime/role-routing.mjs`, `lib/runtime/role-supervisor.mjs`와 각 `shared/skill/runtime/` 생성본, `tests/node/role-observe.test.mjs`.
> - 추가 테스트: (i)–(vii) 각각 보류, 파일 부재·무해한 설정(`permissions.allow:["Bash(npm test)"]`, `env`)은 통과, native route와 읽기 역할은 영향 없음, buildBridgeInvocation 보류.
> - coordination 4종 문장(v4): ``Claude Implementer/QA bridges also deny writes under `.git` (permission rules and sandbox `denyWrite`), and are held as `permission_scope_unverified` when the worktree `.claude/settings.json` or `.claude/settings.local.json` would widen their scope (additional directories, Edit/Write allow rules, hooks, sandbox or defaultMode).`` `composite-instructions.test.mjs` 정규식도 이에 맞춘다.
> - L4 재확인: (a)·(b)는 D2만으로, (b)의 trusted project 설정은 C-3 보류로 dispatch 전에 막히는지 확인하고, (c) CLAUDE.md 로드를 확인한다.

**목표:** Claude Implementer/QA bridge가 D2 settings로 Write·Edit·Bash 모두에서 `.git` 쓰기를 거부하고, user settings만 로드해 project/local settings가 Edit/Write 범위를 넓히지 못하게 한다. 일반 Edit, `node --test`, git 읽기는 정상 동작 (spec §11 FINAL).
**배정:** H3(C-1+C-2, C-3 불필요), H7, AC2, AC6(harness-operation G1 행, coordination 4종, `composite-instructions.test.mjs` 정규식), AC7, AC10 L4.
**선행:** T2 수용·커밋.
**allowedPaths:** `lib/runtime/role-dispatch-policy.mjs`, `lib/runtime/role-bridge-args.mjs`, `shared/skill/runtime/role-dispatch-policy.mjs`, `shared/skill/runtime/role-bridge-args.mjs`, `tests/node/role-bridge-args.test.mjs`, `tests/node/role-routing-dispatch.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/runtime-versions.test.mjs`(v3, 모듈 해시 고정값 갱신만), `tests/node/role-bridge-run.test.mjs`(Claude 인자·argsDigest를 정확히 단언하는 경우에만, host 실행), `docs/harness-operation.md`, `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`, `gemini/skill/references/coordination.md`, `grok/skill/references/coordination.md`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`.

**Interfaces:**
- `RECORDED_CLAUDE_SANDBOX_SETTINGS`는 D2와 deepEqual, deep-frozen. 주석은 "Claude 2.1.327, 2026-11-20, T0 M-C10/M-C11/M-C12/FINAL".
- `CLAUDE_SANDBOX_SETTINGS`, `effectiveClaudeSandboxSettings`, `bridgeGateReasons` 로직은 그대로.
- `buildClaudeArgs`: `permissions.sandbox`가 true인 역할에서 settings 확인(null이면 기존 throw) 뒤 `'--setting-sources', 'user'`, `'--settings', <json>` 순서로 push.

- [ ] **Step 1 (RED):**
  - `role-routing-dispatch.test.mjs`: 기존 D1 단언을 `CLAUDE_SANDBOX_SETTINGS`가 D2와 deepEqual이고 `permissions.deny`, `sandbox.filesystem.denyWrite`까지 `Object.isFrozen`으로 변경.
  - `role-bridge-args.test.mjs`:
    - `Claude writing roles get D2 settings and --setting-sources user exactly once` — arc_implementer·arc_qa에서 `--setting-sources` 1회, 다음 값 `'user'`, 위치는 `--settings` 직전, `JSON.parse(--settings 값)`이 D2와 deepEqual.
    - `Claude read roles get neither --settings nor --setting-sources` — scouter, planner, reviewer.
    - `G1 fail still holds Claude writing roles` — 기존 테스트 유지.
  - `composite-instructions.test.mjs`: coordination 4종에 `` `--setting-sources user` ``와 `` `.git` ``을 포함한 G1 문장이 있는지 정규식 추가.
- [ ] **Step 2:** `node --test tests/node/role-bridge-args.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/composite-instructions.test.mjs` → 새 단언 FAIL.
- [ ] **Step 3 (GREEN):** `role-dispatch-policy.mjs` D2, `role-bridge-args.mjs` 구현.
- [ ] **Step 4:** 문서.
  - coordination 4종의 기존 G1 문장 바로 뒤: ``Claude Implementer/QA bridges also deny writes under `.git` (permission rules and sandbox `denyWrite`) and load only user settings (`--setting-sources user`), so project or local `.claude/settings*.json` cannot widen their write scope.``
  - `docs/harness-operation.md` G1 행: D2, 측정 근거(2.1.327, M-C5b 확대 실측, M-C10/M-C11/M-C12/FINAL), 한계(사용자 `~/.claude/settings.json`의 넓은 allow는 신뢰 경계 안, 측정은 macOS뿐).
- [ ] **Step 5:** Step 2 명령 → PASS.
- [ ] **Step 6:** 생성물 — `update-runtime-assets` 후 `--check` exit 0, 바뀐 shared 파일은 두 개뿐; `installed-layout.mjs --write` 후 `--diff` 없음; `update-manifest` 후 `--check` exit 0; `node --test tests/node/installed-layout-golden.test.mjs tests/node/readme-gate-consistency.test.mjs` PASS.
- [ ] **Step 7 (Orchestrator host):** `node --test tests/node/role-bridge-run.test.mjs` (Claude 인자·argsDigest 단언이 깨지면 Implementer에게 반환), 전체 `npm test` 새 실패 0건.
- [ ] **Step 8 (L4, Orchestrator host, 수용 전 필수, 커밋 없음):** scratch 저장소(`mktemp -d`, spec S-1–S-3)에서 `lib/runtime/role-bridge-args.mjs`를 import해 arc_implementer 프로필로 만든 인자를 그대로 쓴다.
  - (a) M-C10 재확인: Write·Edit·Bash 모두 `.git/hooks/pre-commit`, `.git/config`, `.git/info/exclude` 쓰기 거부. 일반 Edit, 파일 생성, `node --test`, `git status`/`diff`/`log` 정상.
  - (b) M-C11 재확인: trusted project `allow:["Edit(./.git/**)","Write(./.git/**)"]`가 있어도 거부, 바깥 경로 Write도 거부(C-1 효과).
  - (c) CLAUDE.md 로딩: scratch 루트 `CLAUDE.md`에 무작위 토큰 지시를 두고 child에게 출력하게 한다. `--setting-sources user` 유무 결과를 기록.
  - (d) M-C14 재확인: 정상 1회 실행 전후 scratch `.claude/settings.local.json`과 `~/.claude/settings.json` 해시 불변 (T0에서는 7회 실행 동안 불변, Claude가 만든 것은 감지 대상 밖의 `.claude/.cc-writes/`뿐).
  - (e) 가능하면 bridge 1회 dispatch로 Claude Implementer가 파일 편집, `node --test`, git 읽기를 수행 (실행 중 커밋 없음).
  - 결과는 spec §11에 기록 (Orchestrator). (c)에서 `--setting-sources user`로 CLAUDE.md가 로드되지 않으면 T4 수용을 보류하고 사용자 결정을 받는다.
- [ ] **Step 9 (fresh QA):** Step 2 명령 재실행, D2 의미가 spec §11과 일치, 읽기 역할 인자 불변, Step 7·L4 출력 분류, coordination 4종 문장 동일.
- [ ] **Step 10:** 수용·커밋 `fix(runtime): Claude 쓰기 역할 .git 쓰기 금지와 setting-sources user 적용`

**QA:** 필수(fresh). 위험 high. 인자가 틀리면 Claude 쓰기 역할 전체가 실패하거나 경계가 넓어진다.
**Hold 조건:** L4 (a)–(d) 중 하나라도 실패, CLAUDE.md 미로딩, argsDigest 변경 외의 lease 동작 변화.

---

## 최종 검증 (T1·T2·T4 수용 뒤, Orchestrator)

- [ ] host 전체 `npm test`, `B0-host` 대비 baseline 실패와 현재 실패를 구분 기록, 새 실패 0건 (AC9).
- [ ] `update-runtime-assets --check`, `update-manifest --check`, `installed-layout --diff` 모두 깨끗 (AC7).
- [ ] S-2/AC8 해시가 B0와 동일.
- [ ] 독립 최종 Reviewer 1회로 `b75d25a..HEAD` 전체 검토. 초점: RF1–RF5, fail-closed 경로, 정상 작업 오탐, record 내용 누출, argsDigest 영향. 최종 Reviewer finding은 Implementer → Reviewer로 처리(QA 재배정 없음), 수정은 recheck 완료까지 미커밋, 수용 뒤 follow-up commit 1개.

## AC 배정표

| AC | task |
|---|---|
| AC1 | T3(보류) |
| AC2 | T4 |
| AC3 | T2 |
| AC4 | T2 |
| AC5 | T2 (P-3, C-3 미채택) |
| AC6 | T1(README, 정합성 테스트), T2(harness 감지, README Grok), T4(G1 행, coordination, composite 정규식) |
| AC7 | T2, T4, 최종 |
| AC8 | T2, 최종 |
| AC9 | 최종 |
| AC10 | T4 L4. L3는 T3(보류) |

## 진행 기록

| 항목 | 상태 | 커밋 | QA | 비고 |
|---|---|---|---|---|
| B0 | 완료 | — | — | 2026-11-20 host: tests 3073, fail 35, skip 15. 생성물 3종 clean, S-2 불변 |
| T1 | 완료 | 이 커밋 | 없음(Orchestrator 확인) | Implementer codex bridge b994161d. host: 새 실패 0건(부하 flake 2건 단독 재실행 pass) |
| T2 | 완료 | 이 커밋 | fresh QA 78172122(재확인 2회) | Implementer 62e2c464(v1 범위 중단) → dc294ba4(v2) → 1a861fb1(v3 hash) → 836fc9a5(QA 수정: 중간 symlink, HOME 격리, multiline·AC4 unknown 테스트, Grok 홈 부모 확인, 비원자 순회 문서화). host 통합 108 pass, 전체 3110/35 fail = B0 동일 |
| T3 | 보류 | — | — | Grok 측정 대기 |
| T4 | 완료 | 이 커밋 | fresh QA bc414593(재확인 1회) | Implementer 9d5af5ce(v3 C-1) → e520e1d4(v4 C-3+C-2) → 082d82a9(v5 `.claude` 링크 테스트·문서). L4: v3 인자에서 CLAUDE.md 미로딩으로 C-1 폐기, v4 인자 재측정 통과. host role-bridge-run 42 pass, 전체 3129/35 fail = B0 동일 |
| 최종 Reviewer | 대기 | — | — | |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v0 | — | 초안 | 전체 | Planner 최초 작성 |
| v1 | 2026-11-20 | 승인 | T2, T4 | Orchestrator 반영: O1 쓰기 역할만(사용자 결정), O2 T0 증거로 해소, O4 `.codex` 사전 보류 추가(사용자 결정), O7 운영 규칙 문서화 명시 |
| v2 | 2026-11-20 | 승인 | T2 | prepare 경로가 `buildBridgeInvocation`을 거치지 않음(Implementer 보고, Orchestrator 확인 `role-routing.mjs:168-175,274`). `role-routing.mjs`와 생성본을 allowedPaths에 추가하고 bridge route 한정 prepare 보류를 명시. 사용자 승인, 남은 T2는 fresh Implementer |
| v3 | 2026-11-20 | 승인 | T2, T4 | host 전체 테스트에서 `tests/node/runtime-versions.test.mjs`의 모듈 해시 고정값 3건 실패(모듈 변경의 예정된 결과). T2·T4 allowedPaths에 추가, 고정값 갱신만 허용. 사용자 승인, 남은 T2는 fresh Implementer |
| v4 | 2026-11-20 | 승인 | T4 | L4 (c) 실패로 C-1 폐기, C-3 추가(사용자 결정). T4 Interfaces·allowedPaths·테스트·문서 문장 변경(아래 T4 v4 보충). 남은 T4는 fresh Implementer |
| v5 | 2026-11-20 | 승인 | T4 | T4 QA: `.claude` 링크 시 파일 부재여도 보류하는 구현을 기준으로 채택(사용자 결정). 테스트 1건과 문서 문구 보정, fresh Implementer |
