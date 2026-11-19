# 브리지 게이트 G1·GK1 pass 전환 구현 계획 (Architectural, 3 task)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: 승인됨(v3, 2026-11-20)
- 작업 위치: `/Users/yunho/Desktop/project/arc`, 현재 checkout `fix/bridge-ps-stub` @ `d5bae6a`(사용자 선택)
- Risk: high. task마다 fresh QA를 두고, 모든 task를 수용한 뒤 최종 Reviewer가 전체 변경을 1회 검토합니다.

**Goal:** Claude bridge 쓰기 역할은 측정한 sandbox settings로 실행합니다(G1 `pass`). Grok bridge 쓰기 역할은 dispatch마다 만드는 사용자 정의 프로필로 실행하고 `ProfileApplied`로 적용을 확인합니다(GK1 `pass`).

**Architecture:**
- G1은 `role-dispatch-policy.mjs`의 상수 기록만 바꿉니다. 인자 생성과 hold 로직은 이미 있습니다.
- Grok 관련 상수, 렌더, 검사, 생성, 정리, 적용 판정은 새 모듈 `lib/runtime/grok-sandbox.mjs`에 모읍니다. `role-bridge-args.mjs`와 `role-supervisor.mjs`는 이 모듈을 호출만 합니다.
- T2에서는 GK1을 `fail`로 둔 채 생명주기를 넣습니다. T3에서 적용 확인을 넣으면서 GK1을 `pass`로 바꿉니다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, `node:fs`(`O_EXCL|O_NOFOLLOW`), `scripts/update-runtime-assets.mjs`, `scripts/update-manifest.mjs`, `tests/node/fixtures/installed-layout.mjs`

**Spec:** `docs/superpowers/specs/2026-11-19-bridge-gate-g1-gk1-design.md`. v1은 2026-11-19T10:49:50Z에 승인됐습니다. v2(기계적 정정)는 2026-11-19T10:59:30Z에 이 plan과 함께 승인됐습니다.

## Global Constraints

- **G1 settings(D1)**: `{"sandbox":{"enabled":true,"autoAllowBashIfSandboxed":true,"allowUnsandboxedCommands":false,"failIfUnavailable":true}}`이고 deep-freeze합니다.
- **reason code**: 새 코드는 만들지 않습니다.
  - 사전 hold: `permission_scope_unverified`
  - 사후 적용 확인 실패: `permission_scope_mismatch`
  - 사후 변조나 소실: `permission_violation_observed`
- **Grok 프로필 이름과 파일**: 이름은 `arc-bridge-<dispatchId 앞 8자>`이고 `/^arc-bridge-[0-9a-f]{8}$/`에 맞아야 합니다. 파일은 `<worktree>/.grok/sandbox.toml`, 모드 0444입니다.
- **`GROK_SANDBOX_DENY`**: 아래 순서로 고정한 24개입니다. T0 실측 toml과 같은 표기이며 Orchestrator가 대조를 마쳤습니다.
  `".grok/sandbox.toml"`, `"~/.grok/skills"`, `"~/.grok/agents"`, `"~/.grok/rules"`, `"~/.grok/workflows"`, `"~/.grok/plugins"`, `"~/.grok/installed-plugins"`, `"~/.grok/plugin-data"`, `"~/.grok/personas"`, `"~/.grok/memory"`, `"~/.grok/memory-v2"`, `"~/.grok/AGENTS.md"`, `"~/.grok/statusline.sh"`, `"~/.grok/lsp.json"`, `"~/.grok/bin"`, `"~/.grok/downloads"`, `"~/.grok/bundled"`, `"~/.grok/bundles"`, `"~/.grok/settings.json"`, `"~/.grok/pager.toml"`, `"~/.grok/mcp_credentials.json"`, `"~/.grok/worktrees"`, `"~/.grok/workspaces"`, `"~/.grok/daemon"`
- **바꾸지 않는 값**: `EVENTS_MAX_BYTES` = 4194304는 기존 값을 그대로 씁니다. Grok `cli.supportedVersions` `>=1.0.0 <1.1.0`과 `permissions` claim level도 그대로 둡니다.
- **편집 위치**: runtime은 `lib/runtime/`에서만 편집합니다. `shared/skill/runtime/`은 `node scripts/update-runtime-assets.mjs`로 생성합니다. 설치본은 편집하지 않습니다.
- **사용자 설정 불변**: `~/.grok/sandbox.toml`, `~/.grok/config.toml`, `~/.claude*`는 수정하지 않습니다. runtime은 `~/.grok/sessions`에 쓰지 않으며, 테스트는 임시 HOME만 씁니다.
- **실행 규칙**:
  - Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행합니다.
  - bridge dispatch가 실행 중이면 커밋하지 않습니다.
  - 커밋 메시지는 `type(scope): 한국어 설명` 형식입니다.
  - top-level task 하나를 focused commit 하나로 남깁니다. B0와 T0b는 커밋하지 않습니다.
- **이벤트 timestamp**: 실측 형식은 마이크로초 정밀도 ISO입니다(`2026-11-19T10:22:45.232832Z`). `Date.parse`는 밀리초로 해석하므로 `>= spawnAtMs` 필터를 그대로 씁니다(Planner Q1 해소).

## Review Focus

| ID | 확인할 상황 | 기대 결과 | 담당 |
|---|---|---|---|
| RF1 | `.grok/`가 저장소 `.gitignore`에 들어 있어 snapshot에서 빠짐 | 해시 검사(E14)로 `permission_violation_observed`가 나옴 | T2 |
| RF2 | 사용자의 `.grok/` 디렉터리가 미리 있음 | 파일만 만들고 지우며 디렉터리와 다른 파일은 남김(`dirCreated:false`) | T2 |
| RF3 | 이벤트 파일이 spawn 전에 없음(`exists:false` 기준점) | 후보가 1건이면 통과 | T3 |
| RF4 | 적용 뒤 취소됨 | 유효한 후보 1건이면 `cancelled`와 `applied`를 기록하고, 무효한 후보면 `permission_scope_mismatch` | T3 |
| RF5 | spawnAtMs와 같은 밀리초의 timestamp | 통과(`>=`)하고, 1ms 이전은 제외 | T3 |

---

## B0. Baseline 기록 (Orchestrator, 커밋 없음, 모든 task보다 먼저)

- [ ] 현재 상태 `d5bae6a`에서 호스트 전체 테스트를 실행합니다. 이때 미커밋 파일은 spec과 plan뿐입니다.
  - 명령: `PYTHONDONTWRITEBYTECODE=1 npm test > <scratchpad>/b0-host-full.txt 2>&1`
  - 실패한 테스트 이름 집합을 `B0-host`로 기록하고, tests/fail/skip 수도 함께 남깁니다.
- [ ] 생성물 상태를 확인합니다. 기대 결과는 exit 0이고 diff가 없어야 합니다. 다르면 baseline으로 기록합니다.
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/update-manifest.mjs --check`
  - `node tests/node/fixtures/installed-layout.mjs --diff`
- [ ] AC12 기준 해시를 읽기 전용으로 기록합니다. 없는 파일은 부재로 적습니다.
  - 명령: `shasum -a 256 ~/.grok/sandbox.toml ~/.grok/config.toml ~/.claude/settings*.json`
- [ ] (선택) Codex bridge QA가 같은 전체 실행을 해서 `B0-sandbox` 실패 집합을 기록합니다.

**QA 실패 분류 규칙 (모든 task의 QA에 적용)**

QA가 보고한 실패는 다음 순서로 분류합니다.

- (a) `B0-host`에 있는 이름이면 baseline입니다.
- (b) `B0-sandbox`가 있고 그 안에 있는 이름이면 sandbox baseline입니다.
- (c) `B0-sandbox`가 없으면, 다음 세 조건을 모두 만족할 때만 sandbox baseline입니다.
  - 오류 메시지가 알려진 sandbox 제약 범주와 일치합니다. 범주는 `.git/arc` 쓰기 `EPERM`, runtime-claude/codex 관찰 이벤트 부재, `EMFILE`이며, 근거는 `2026-11-19-bridge-ps-stub.md:164`에 기록된 14건입니다.
  - Orchestrator가 같은 리비전의 호스트에서 다시 실행하면 통과합니다.
  - 그 테스트 파일이 이번 task의 변경 파일이 아닙니다.
- (d) 위에 해당하지 않으면 현재 실패입니다. 하나라도 있으면 해당 task의 수용을 보류합니다.

QA 보고에는 출력 요약, 실패 목록, 분류 근거(메시지 발췌, 호스트 재실행 결과)를 포함합니다.

## T0b. M-C4 trusted 측정과 판정 (커밋 없음, T1 선행)

- [ ] 사용자가 `m-c4-trusted.sh`를 실행하고, Orchestrator가 결과를 기록합니다.
- [ ] 판정이 "넓혀지지 않음"이면 T1을 시작합니다. 결과는 T1 문서에 반영합니다.
- [ ] 판정이 "넓혀짐"이면(E18) T1을 hold하고, 범위 변경으로 보고 사용자 결정을 받습니다. T2는 내용상 G1과 독립이지만 생성 파일이 겹치므로, 순서를 바꿀지는 Orchestrator가 결정합니다.

### Task T0c: baseline installed-layout golden 재생성 (T1 선행)

**목표:** baseline부터 어긋나 있던 `tests/node/fixtures/installed-layout-golden.json`을 현재 HEAD 기준으로 다시 만듭니다. 이렇게 해 두면 T1–T3의 golden diff에는 각 task의 변경분만 나타납니다.

**배경:** B0에서 `node tests/node/fixtures/installed-layout.mjs --diff`가 104줄을 출력했습니다. 차이는 `skills/arc/SKILL.md`, `references/planning.md`, `references/superpowers-provenance.json`, `runtime/role-policy.json`, `agents/arc-*`에 있습니다. golden은 `413bc8d` 이후 재생성되지 않았고, 그 뒤로 `ec866c6`, `ee9b335`, `d63c1cc`의 policy 변경이 들어왔습니다. 2026-11-19 사용자 결정에 따라 별도 task로 분리합니다.

**배정:** B0 drift 해소. AC를 새로 만들지 않습니다.

**선행:** B0

**allowedPaths:** `tests/node/fixtures/installed-layout-golden.json`

- [ ] **Step 1:** `node tests/node/fixtures/installed-layout.mjs --diff`를 실행합니다. 출력은 위 배경에 적은 파일 범위 안에만 있어야 하며, 줄 수는 B0와 같은 104줄이어야 합니다.
- [ ] **Step 2:** `node tests/node/fixtures/installed-layout.mjs --write`를 실행한 뒤 `--diff`를 다시 실행합니다. 출력이 없어야 합니다.
- [ ] **Step 3:** `node --test tests/node/installed-layout-golden.test.mjs`가 PASS여야 합니다. 이어서 `npm test` 전체를 실행합니다. 실패 집합은 `B0-host`에서 golden 관련 실패만 빠진 것이어야 하고, 새 실패는 0건이어야 합니다.
- [ ] **Step 4 (Orchestrator):** 다음을 확인합니다.
  - `git diff --name-only`가 allowedPaths와 일치합니다.
  - 바뀐 키가 Step 1 범위 밖에 없습니다.
- [ ] **Step 5:** 수용하고 커밋합니다. 커밋 메시지는 `test(fixture): baseline installed-layout golden 재생성`입니다. 이 커밋에 plan v2 pending revision과 trailer를 함께 넣습니다.

**QA:** 위험도가 낮은 기계적 재생성입니다. 별도 QA는 두지 않습니다. Orchestrator가 Step 3–4의 호스트 검증으로 대신합니다. 최종 Reviewer 범위에는 포함합니다.

**Hold:**
- `--diff`가 배경에 적은 범위 밖의 차이를 보이는 경우
- 전체 테스트에서 새 실패가 나오는 경우

---

### Task T1: G1 pass 전환

**목표:** D1을 기록해서 기본 policy에서 Claude `arc_implementer`/`arc_qa` bridge가 `--settings`와 함께 실행되게 합니다. 주입 fail 경로는 그대로 유지합니다.

**배정:** D1–D3, AC1(G1 부분), AC2, AC3, AC9(G1, M2, coordination, composite 테스트), AC11, AC13, AC14, E17, L1

**선행:** B0, T0b("넓혀지지 않음" 판정), T0c 수용과 커밋

**allowedPaths:**
- `lib/runtime/role-dispatch-policy.mjs`
- `shared/skill/runtime/role-dispatch-policy.mjs`
- `tests/node/role-routing-dispatch.test.mjs`
- `tests/node/role-bridge-args.test.mjs`
- `tests/node/composite-instructions.test.mjs`
- `claude/skill/references/coordination.md`
- `codex/skill/references/coordination.md`
- `gemini/skill/references/coordination.md`
- `grok/skill/references/coordination.md`
- `docs/harness-operation.md`
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**Interfaces:**
- `BRIDGE_GATE_RESULTS.G1 === 'pass'`
- `CLAUDE_SANDBOX_SETTINGS`는 D1과 deepEqual이고 deep-frozen입니다.
- `effectiveClaudeSandboxSettings`와 `bridgeGateReasons`는 바꾸지 않습니다.

- [ ] **Step 1 (RED): 테스트 작성**
  - `role-routing-dispatch.test.mjs`
    - :24-29의 기대값을 `G1: 'pass'`로 바꿉니다. 나머지 키는 그대로이고 GK1은 `'fail'`을 유지합니다.
    - 새 테스트 `CLAUDE_SANDBOX_SETTINGS records the measured D1 object, deep-frozen`을 추가합니다. 확인 내용은 D1과 deepEqual, 객체와 `.sandbox`가 모두 frozen, `DEFAULT_POLICY.claudeSandboxSettings === CLAUDE_SANDBOX_SETTINGS`입니다.
    - :31-36은 기본 policy에서 claude `arc_qa`/`arc_implementer`의 reason이 `[]`이고, 주입 `G1:'fail'`에서는 `['permission_scope_unverified']`라고 단언하도록 바꿉니다(AC3).
    - :38- 의 기본 policy 기대는 쓰기 역할이 allow되도록 바꿉니다. 같은 fixture에 주입 `G1:'fail'` 변형을 추가해서 기존 hold 단언을 유지합니다.
    - :471-485의 null 분기는 그대로 둡니다(AC2).
  - `role-bridge-args.test.mjs`
    - 기본 policy 쓰기 역할에서 `--settings`가 정확히 1회 나오고, 그 다음 인자가 `JSON.stringify(D1)`인지 확인합니다.
    - scouter, planner, reviewer에는 `--settings`가 없는지 확인합니다.
    - 기존 주입 fail throw 테스트는 유지합니다.
  - `composite-instructions.test.mjs:186`의 정규식을 새 G1 문장에 맞게 고칩니다.
- [ ] **Step 2: RED 확인**
  - 실행: `node --test tests/node/role-routing-dispatch.test.mjs tests/node/role-bridge-args.test.mjs tests/node/composite-instructions.test.mjs`
  - 기대: 새로 넣거나 바꾼 단언이 FAIL합니다.
- [ ] **Step 3 (GREEN): policy 수정**
  - :3 `G1: 'pass'`
  - :5 `RECORDED_CLAUDE_SANDBOX_SETTINGS`에 deep-freeze한 D1을 넣습니다. deepFreeze는 파일 안의 지역 함수로 만들고, 순환 import를 하지 않습니다.
  - :4 주석에는 측정 버전(Claude 2.1.328, 2026-11-19, macOS Seatbelt)과 예외(`/private/tmp/claude-<uid>`, exit 71 명령 단위 실패, M-C4 결과)를 영어 한 줄로 적습니다.
  - :7과 :9는 바꾸지 않습니다.
- [ ] **Step 4: 문서 수정**
  - coordination 4종의 G1 문장을 pass 의미로 바꿉니다. 내용은 "Codex host의 Claude bridge 쓰기 역할은 기록된 sandbox settings로 실행하고, 주입 fail이나 settings가 없을 때만 `permission_scope_unverified`로 hold된다"입니다. 4개 파일 모두 같은 문장을 씁니다.
  - `docs/harness-operation.md:89` G1 행에는 `pass`, settings 요약, 한계(`/private/tmp/claude-<uid>` 쓰기 허용, sandbox를 쓸 수 없으면 Bash가 명령마다 exit 71로 실패하고 Claude는 exit 0, M-C4 결과, 네트워크 미측정)를 영어로 적습니다. 기존 표와 같은 간결한 문체를 씁니다.
  - :229에 도입 문장 `On failure or partial completion, apply these steps in order:`를 넣습니다(M2). :230 목록 앞이며, 빈 줄은 유지합니다.
- [ ] **Step 5: 생성물 갱신**
  - `node scripts/update-runtime-assets.mjs`
  - `node tests/node/fixtures/installed-layout.mjs --diff`로 예상한 항목만 바뀌었는지 확인한 다음 `--write`
  - `node scripts/update-manifest.mjs`
- [ ] **Step 6: GREEN 확인 (Implementer)**
  - 실행:
    - `node --test tests/node/role-routing-dispatch.test.mjs tests/node/role-bridge-args.test.mjs tests/node/composite-instructions.test.mjs tests/node/gemini-bridge.test.mjs tests/node/runtime-assets.test.mjs tests/node/installed-layout-golden.test.mjs`
    - `--check` 2종
  - 기대: 모두 PASS입니다.
  - 전체 `PYTHONDONTWRITEBYTECODE=1 npm test` 결과를 보고합니다. 범위 밖 실패는 고치지 않습니다.
- [ ] **Step 7: 호스트 검증 (Orchestrator)**
  - `cmp`로 복제본을 비교합니다.
  - 전체 `npm test` 결과를 B0와 비교합니다. 새 실패가 0건이어야 합니다.
  - 변경 파일이 allowedPaths 안에만 있는지 확인합니다.
- [ ] **Step 8: L1 실측 (Orchestrator)**
  - 기본 policy `buildClaudeArgs(arc_implementer)` 인자 그대로 임시 저장소에서 `claude -p`를 실행합니다.
  - worktree 쓰기는 허용되어야 합니다. `~/`와 `/private/tmp/` 직하 쓰기는 `operation not permitted`여야 합니다.
  - 실행 전후 AC12 해시가 B0와 같아야 합니다.
- [ ] **Step 9: fresh QA (Codex bridge)**
  - Step 6 명령과 전체 실행 결과를 B0 규칙으로 분류합니다.
  - `cmp`와 `--check` 2종을 확인합니다.
- [ ] **Step 10: 수용과 커밋**
  - 실행 중 dispatch가 없음을 확인합니다.
  - 커밋 메시지: `feat(runtime): G1 Claude bridge sandbox settings 기록과 pass 전환`

**수용 기준:** AC1(G1 `pass`, GK1 `fail`, frozen), AC2, AC3, AC9 G1 부분, AC11, AC13, AC14, L1 통과, AC12 해시 불변

**Hold 조건:**
- T0b 판정이 "넓혀짐"인 경우
- L1에서 거부되어야 할 쓰기가 허용된 경우
- golden diff에 예상 밖 항목이 있는 경우
- allowedPaths 밖 파일을 고쳐야 하는 경우

---

### Task T2: Grok 쓰기 역할 프로필 생명주기 (GK1 `fail` 유지)

**목표:**
- grok 쓰기 역할의 인자를 `--sandbox arc-bridge-<8hex>`로 바꿉니다.
- supervisor가 dispatch마다 프로필 파일을 만들고, 검증하고, 정리하게 합니다.
- 기본 policy에서 grok 쓰기 역할은 계속 hold됩니다.

**배정:** D4–D10, D15, AC4, AC5, AC6, AC8(T2 시점), AC11, AC13, AC14, E1–E10, E14–E16, RF1, RF2

**선행:** T1 수용과 커밋. 생성 파일이 겹치므로 순차로 진행합니다.

**allowedPaths:**
- runtime:
  - `lib/runtime/grok-sandbox.mjs`(신규), `shared/skill/runtime/grok-sandbox.mjs`
  - `lib/runtime/role-bridge-args.mjs`, `shared/skill/runtime/role-bridge-args.mjs`
  - `lib/runtime/role-supervisor.mjs`, `shared/skill/runtime/role-supervisor.mjs`
  - `lib/runtime/bootstrap.mjs`, `shared/skill/runtime/bootstrap.mjs`
  - `lib/installer/runtime-assets.mjs`
- 테스트:
  - `tests/node/grok-sandbox.test.mjs`(신규)
  - `tests/node/role-bridge-args.test.mjs`
  - `tests/node/grok-composite.test.mjs`
  - `tests/node/grok-bridge.test.mjs`
  - `tests/node/runtime-assets.test.mjs`
  - `tests/node/runtime-versions.test.mjs`
- 생성물: `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`
- 조건부: `lib/runtime/role-bridge.mjs`와 복제본. 필요하다고 판단되면 Orchestrator가 추가를 결정합니다.

**Interfaces(`lib/runtime/grok-sandbox.mjs`):**

| 이름 | 동작 |
|---|---|
| `GROK_SANDBOX_DENY` | 24개, frozen |
| `GROK_SANDBOX_RELATIVE` | `'.grok/sandbox.toml'` |
| `grokSandboxProfileName(dispatchId)` | `arc-bridge-<8>`을 반환하고, 형식에 맞지 않으면 `null` |
| `renderGrokSandboxProfile(name)` | Buffer `[profiles.<name>]\nextends = "workspace"\ndeny = [<JSON 문자열, ", " join>]\n`을 반환하고, 이름이 형식에 맞지 않으면 throw |
| `grokProfileCovered(allowedPaths)` | 지역 함수로 구현합니다. `allowedBy`와 같은 규칙(`/`로 끝나면 prefix, 아니면 같은 문자열)에, 항목이 `.grok`과 같거나 `.grok/`로 시작하는 경우를 더합니다. role-observe는 수정하지 않습니다 |
| `inspectGrokProfileSlot(worktree)` | `sandbox.toml`이 ENOENT가 아니면 throw합니다. `.grok`이 있는데 symlink가 아닌 디렉터리가 아니어도 throw합니다. 오류의 `reasonCode`는 `permission_scope_unverified`입니다 |
| `checkGrokHome({grokHome, userHome, childEnv})` | D10의 세 조건을 boolean으로 반환 |
| `createGrokSandboxProfile({worktree, bytes})` | `{path, sha256, dirCreated}`를 반환합니다. 실패하면 `reasonCode`를 붙여 throw하고, 쓰기 단계 실패면 정리부터 합니다 |
| `removeGrokSandboxProfile({path, sha256, dirCreated})` | `{removed, dirRemoved, violation}` 반환 |
| `grokEventsBaseline(grokHome)` | `{exists:false,size:0}` 또는 `{exists:true,dev,ino,size}`를 반환하고, 일반 파일이 아니면 throw합니다. lstat만 합니다 |

**다른 파일의 인터페이스 변경:**
- `buildGrokArgs({..., sandboxProfile})`: 쓰기 역할은 이름을 검증한 뒤 `--sandbox <name>`을 넣습니다. 읽기 역할은 지금과 같습니다.
- `ROLE_BRIDGE_PERMISSIONS.grok.arc_implementer/arc_qa.sandbox`를 `'custom'`으로 바꿉니다.
- `buildBridgeInvocation`은 grok 쓰기 역할일 때 `grokSandbox: {name, path, bytes}`를 반환합니다.
- `earlyFailure(code, spawned = null, extra = {})`에 `extra` 인자를 더합니다.

- [ ] **Step 1 (RED): `grok-sandbox.test.mjs`의 순수 함수 부분**
  - `GROK_SANDBOX_DENY`: 독립 literal 배열과 같은지, frozen인지 확인합니다.
  - `renderGrokSandboxProfile('arc-bridge-0123abcd')`: 독립 literal fixture와 Buffer가 같아야 합니다. `extends = "workspace"`가 있고, `strict`가 없고, 끝이 `\n`이어야 합니다(AC5). 대문자, 7자리, 빈 문자열 이름은 throw해야 합니다.
  - `grokSandboxProfileName`: 정상 UUID이면 `arc-bridge-0123abcd`이고, 대문자, 비hex, 짧은 입력이면 `null`입니다(E6).
  - `grokProfileCovered`:
    - 참: `['.grok/sandbox.toml']`, `['.grok/']`, `['.grok']`, `['.grok/x']`
    - 거짓: `['src/']`, `['.grokfoo']`, `[]`
    - lease 검증이 루트 전체를 뜻하는 항목을 허용한다면, 그 형식도 참이어야 합니다(E2).
- [ ] **Step 2 (RED): 파일시스템 부분 (임시 디렉터리)**
  - `inspectGrokProfileSlot`
    - `sandbox.toml`이 일반 파일, symlink, 디렉터리이면 throw하고, 사용자 파일 sha256은 그대로여야 합니다(E3).
    - `.grok`이 파일이거나 symlink이면 throw합니다(E4).
  - `createGrokSandboxProfile`
    - 파일 모드 0444, 바이트 일치, `dirCreated:true`, 디렉터리 모드 0700이어야 합니다.
    - 파일이 미리 있으면 throw하고 사용자 바이트를 유지해야 합니다(E5).
  - `removeGrokSandboxProfile`
    - 정상이면 `{removed:true, dirRemoved:true}`입니다.
    - `.grok`에 다른 파일이 있으면 `dirRemoved:false`이고 다른 파일은 남아야 합니다(RF2).
    - 파일이 삭제됐거나, 내용이 바뀌었거나, symlink로 교체됐으면 `violation:true, removed:false`이고 파일을 보존해야 합니다(E14).
  - `checkGrokHome`: child env `GROK_HOME`이 `grokHome`과 다르거나(없음 포함), `HOME` realpath가 다르거나, grokHome이 symlink이면 false이고, `GROK_HOME === grokHome`인 정상 상태면 true입니다(E7, spec v3 D10).
  - `grokEventsBaseline`: 파일이 없으면 `exists:false`, 일반 파일이면 dev/ino/size, 디렉터리나 symlink이면 throw입니다(E9).
- [ ] **Step 3 (RED): 인자와 invocation**
  - `buildGrokArgs`
    - 쓰기 역할에 `sandboxProfile`을 주면 `--sandbox <name>`이 들어가고 `'workspace'`는 없어야 합니다.
    - 이름이 없거나 잘못되면 throw해야 합니다.
    - 읽기 역할은 기존 인자와 deepEqual이어야 합니다(AC4).
  - 기존 테스트 가운데 grok 쓰기 역할 `--sandbox workspace`를 단언하는 곳은 새 기대값으로 바꿉니다.
  - `buildBridgeInvocation`(주입 `GK1:'pass'`)
    - 같은 lease로 두 번 호출하면 `argsDigest`가 같고, name은 `'arc-bridge-' + dispatchId.slice(0,8)`이어야 합니다.
    - E2, E3, E4, E6 각각에서 `permission_scope_unverified`가 나와야 합니다.
- [ ] **Step 4 (RED): prepare와 supervisor 통합 (fake grok, 임시 HOME)**
  - prepare(아래 E2–E6의 "prepare"는 `run-dispatch` 준비 단계, 즉 `role-bridge.mjs:57`의 `buildBridgeInvocation` 호출입니다. `role-routing.mjs`는 고치지 않습니다)
    - 기본 policy에서 `arc_qa`와 `arc_implementer`는 hold되고 reason은 `['permission_scope_unverified']`이며 lease가 없어야 합니다(E1, AC8). 기존 :137-149 테스트는 그대로 유지합니다.
    - 주입 `GK1:'pass'`에서 E2, E3, E4 조건이면 prepare가 hold되고 사용자 파일 해시는 그대로여야 합니다.
  - 주입 `GK1:'pass'` supervisor, 정상 실행
    - 결과가 `completed`여야 합니다.
    - 실행 중에는 프로필 파일이 0444로 있고, 실행 뒤에는 파일과 `.grok`이 없어야 합니다.
    - record `grokSandboxProfile`은 `{name, path, sha256, dirCreated:true, created:true, removed:true, dirRemoved:true, eventsBaseline, applied:null}`이어야 합니다.
  - 주입 `GK1:'pass'` supervisor, 예외 경로

    | 경우 | 기대 결과 |
    |---|---|
    | E5 prepare 뒤에 파일이 생김 | `failed` + `permission_scope_unverified`, 사용자 파일 유지 |
    | E7 child env에 `GROK_HOME` 주입 | `failed` + `permission_scope_unverified`, 프로필 미생성 |
    | E9 이벤트 경로가 디렉터리 | `failed` + `permission_scope_unverified`, 프로필 정리 |
    | E10 prompt 단계 early failure | `execution_failed`, 프로필 정리 |
    | E14 fake grok이 프로필 변조 | `failed` + `permission_violation_observed`, 파일 보존 |
    | RF1 `.grok/` ignore + 변조 | `permission_violation_observed` 포함 |
    | E15 종료 미관측 | `unknown` + `terminal_state_unverified`, 파일 보존, `removed:false, reason:'child_unobserved'` |
    | E16 catch 경로에서 미정지 | 파일 보존 |
- [ ] **Step 5: RED 확인**
  - 실행: `node --test tests/node/grok-sandbox.test.mjs tests/node/role-bridge-args.test.mjs tests/node/grok-bridge.test.mjs tests/node/grok-composite.test.mjs`
  - 기대: FAIL합니다.
- [ ] **Step 6 (GREEN): `grok-sandbox.mjs` 구현**
  - 파일 생성은 `openSync(O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW, 0o444)` → write → `fchmodSync` → close 순서입니다.
  - 디렉터리는 `mkdir(0o700)`로 만들고 recursive는 쓰지 않습니다. EEXIST이면 다시 lstat합니다.
  - 정리는 일반 파일이고 해시가 같을 때만 unlink합니다. `dirCreated`이면 rmdir하고, ENOTEMPTY이면 그대로 둡니다.
  - grokHome 아래는 lstat만 합니다.
- [ ] **Step 7 (GREEN): `role-bridge-args.mjs`**
  - :23-24 쓰기 역할의 `sandbox`를 `'custom'`으로 바꿉니다.
  - `buildGrokArgs`는 `sandboxProfile`을 검증한 뒤 사용합니다.
- [ ] **Step 8 (GREEN): `role-supervisor.mjs`**
  - `buildBridgeInvocation`: :117 게이트 확인 뒤, :127 인자 생성 앞에 §3.2의 1–4단계를 넣습니다. 이 경로는 grok이고 `sandbox === 'custom'`일 때만 탑니다.
  - `earlyFailure`(:200)에 `extra` 병합을 추가합니다.
  - `runSupervisor`
    - :231 뒤, snapshot 앞: `checkGrokHome`을 실행하고, 이어서 `createGrokSandboxProfile`을 실행합니다.
    - 생성 뒤에 생기는 early failure는 모두 "정리 후 `earlyFailure(code, null, {grokSandboxProfile})`" 지역 헬퍼로 처리합니다(E10).
    - :244 뒤, spawn 앞: `grokEventsBaseline`을 실행합니다. 실패하면 정리한 뒤 `permission_scope_unverified`로 끝냅니다. 그 다음 `spawnAtMs = Date.now()`를 기록합니다.
    - :382-391 unobserved 경로에서는 정리하지 않고 `removed:false, reason:'child_unobserved'`를 남깁니다.
    - :408 뒤, :413 앞: `removeGrokSandboxProfile`을 실행합니다. `violation`이면 `permission_violation_observed`를 붙이고 permissions claim을 unverified로 처리합니다(:410 방식).
    - :437 record에 `grokSandboxProfile`을 넣습니다. 이 task에서는 `applied: null`입니다.
    - :439 catch 경로는 `stopped`일 때만 정리합니다.
- [ ] **Step 9: 등록과 생성물**
  - `bootstrap.mjs:11`에서 `'grok-stream.mjs'` 뒤에 `'grok-sandbox.mjs'`를 넣습니다.
  - `runtime-assets.mjs`에 정렬 위치를 맞춰 추가합니다.
  - `runtime-assets.test.mjs`와 `runtime-versions.test.mjs`의 literal 기대값을 갱신합니다.
  - `update-runtime-assets` → golden `--diff`(신규 1개와 변경 모듈만) → `--write` → `update-manifest` 순서로 실행합니다.
- [ ] **Step 10: GREEN 확인 (Implementer)**
  - 실행:
    - `node --test tests/node/grok-sandbox.test.mjs tests/node/role-bridge-args.test.mjs tests/node/grok-bridge.test.mjs tests/node/grok-composite.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs tests/node/installed-layout-golden.test.mjs tests/node/role-routing-dispatch.test.mjs`
    - `--check` 2종
  - 기대: PASS이고 `GK1 === 'fail'`입니다.
  - 전체 실행 결과를 보고합니다.
- [ ] **Step 11: 호스트 검증 (Orchestrator)**
  - `cmp`로 복제본을 비교합니다.
  - 전체 테스트 결과를 B0와 비교합니다.
  - 변경 파일이 allowedPaths 안에만 있는지 확인합니다.
  - `grep -n sessions lib/runtime/grok-sandbox.mjs lib/runtime/role-supervisor.mjs`로 sessions 경로에 쓰는 곳이 없는지 확인합니다.
- [ ] **Step 12: fresh QA**
  - B0 규칙으로 분류합니다.
  - E3/E5 사용자 파일 해시, 0444 모드, 정리 결과를 증거로 남깁니다.
- [ ] **Step 13: 수용과 커밋**
  - 커밋 메시지: `feat(runtime): Grok 쓰기 역할 dispatch별 sandbox 프로필 생명주기 추가`

**수용 기준:** AC4, AC5, AC6, AC8(T2 시점 hold), AC11, AC13, AC14, RF1, RF2

**Hold 조건:**
- `role-bridge.mjs`를 고쳐야 하는 경우
- policy나 HOME을 주입할 경로가 없어서 시그니처를 추가로 바꿔야 하는 경우
- golden diff에 예상 밖 항목이 있는 경우
- `localCliEnvironment`가 `HOME`을 바꾸는 등 D10 판정이 spec과 다르게 동작하는 경우

---

### Task T3: ProfileApplied 적용 확인과 GK1 pass

**목표:** 실행 뒤 전역 이벤트 파일에서 이번 dispatch의 `ProfileApplied`를 확인합니다. 확인하지 못하면 `completed`가 될 수 없게 하고, GK1을 `pass`로 바꿉니다.

**배정:** D11–D14, D16, AC1(GK1 부분), AC7, AC8(T3 뒤), AC9(GK1), AC10, AC11, AC12, AC13, AC14, E11–E13, RF3–RF5, L2

**선행:** T2 수용과 커밋

**allowedPaths:**
- runtime:
  - `lib/runtime/grok-sandbox.mjs`, `shared/skill/runtime/grok-sandbox.mjs`
  - `lib/runtime/role-supervisor.mjs`, `shared/skill/runtime/role-supervisor.mjs`
  - `lib/runtime/role-dispatch-policy.mjs`, `shared/skill/runtime/role-dispatch-policy.mjs`
- 테스트:
  - `tests/node/grok-sandbox.test.mjs`
  - `tests/node/grok-composite.test.mjs`
  - `tests/node/grok-bridge.test.mjs`
  - `tests/node/grok-capability-evidence.test.mjs`
  - `tests/node/role-routing-dispatch.test.mjs`
  - `tests/node/composite-instructions.test.mjs`
- 문서:
  - `docs/harness-operation.md`
  - coordination 4종
- 생성물: `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`

**Interfaces:**
- `evaluateGrokProfileApplied({text, baseline, current: {exists, regular, dev, ino, size}, spawnAtMs, name, worktreeRealpath, maxBytes = EVENTS_MAX_BYTES})`
  - 반환값은 `{ok, reason, candidates, applied}`입니다.
  - `reason`은 `not_regular`, `rotated`, `truncated`, `too_large`, `timestamp_invalid`, `no_candidate`, `multiple_candidates`, `not_enforced`, `inherited`, `deny_missing` 중 하나입니다.
- `readGrokProfileApplied({grokHome, baseline, spawnAtMs, name, worktreeRealpath})`
  - lstat로 크기를 확인한 뒤 `O_RDONLY`로 엽니다. fstat 결과의 dev/ino가 lstat과 같은지 확인하고, `[baseline.size, size)` 구간만 읽어서 evaluate에 넘깁니다.

- [ ] **Step 1 (RED): 순수 판정 fixture 테스트**
  - 기준 fixture는 T0 실측 줄 형식을 씁니다. timestamp도 마이크로초 ISO로 둡니다.
  - 통과해야 하는 경우:
    - 후보 1건 → `ok:true`, `applied`가 기록됨
    - 파싱할 수 없는 줄이 섞여 있음
    - 개행 없는 마지막 줄(무시)
    - profile이나 workspace가 다른 줄이 섞여 있음
    - RF3: `baseline {exists:false,size:0}`에 후보 1건
    - RF5: timestamp가 spawnAtMs와 같은 밀리초
  - 실패해야 하는 경우:

    | 입력 | reason |
    |---|---|
    | 후보 0건 | `no_candidate` |
    | 후보 2건 | `multiple_candidates` |
    | 다른 profile만 있음 | `no_candidate` |
    | 다른 workspace만 있음 | `no_candidate` |
    | spawn 이전 줄만 있음(1ms 이전 포함) | `no_candidate` |
    | timestamp 파싱 불가 | `timestamp_invalid` |
    | `enforced:false` 또는 `enforced` 없음 | `not_enforced` |
    | `inherited:true` | `inherited` |
    | `deny_paths` 없음, 배열 아님, `expectedDeny` 미포함 | `deny_missing` |
    | ino 변경 | `rotated` |
    | 크기 감소 | `truncated` |
    | 크기 초과 | `too_large` |
    | 일반 파일 아님 | `not_regular` |
- [ ] **Step 2 (RED): supervisor 통합**
  - fake grok은 임시 HOME의 이벤트 파일에 줄을 append합니다. workspace는 `target.realpath`, profile은 `--sandbox` 값을 씁니다.

    | 경우 | 기대 결과 |
    |---|---|
    | 이벤트 정상 | `completed`, `applied` 기록 |
    | 줄 없음 | `failed` + `permission_scope_mismatch` |
    | `enforced:false` | `failed` + `permission_scope_mismatch` |
    | E11 exit 1이고 줄 없음 | `execution_failed`와 `permission_scope_mismatch` |
    | E13 취소 + 0건 | `cancelled`, 코드 없음, `applied:null` |
    | RF4 취소 + 유효 1건 | `cancelled`, `applied` 기록 |
    | RF4 취소 + 무효 후보 | `permission_scope_mismatch` |
    | E12 이벤트 파일 회전 또는 잘림 | `permission_scope_mismatch` |

  - 모든 경우에 정리 동작은 T2 규칙을 따라야 합니다. 실제 `~/.grok`에는 쓰지 않습니다.
- [ ] **Step 3 (RED): 게이트, 증거, 문서 테스트**
  - `role-routing-dispatch.test.mjs:25`의 기대값을 `GK1: 'pass'`로 바꿉니다(AC1 최종 값).
  - `grok-capability-evidence.test.mjs`
    - `UNVERIFIED_CONTRACTS`에서 `permission-sandbox-effect`를 빼서 5개로 만듭니다.
    - `VERIFIED_CONTRACTS`에 `{id:'permission-sandbox-effect', risk:'R4', roles:['arc_implementer','arc_qa']}`를 추가합니다.
    - :39-42는 "five"와 `read-role-permission-effect` 포함 여부를 단언합니다.
    - :59-64는 `GK1 'pass'`, `GK2 'fail'`, `resume 'off'`를 단언합니다(AC10).
  - `grok-composite.test.mjs:137-149`는 주입 `GK1:'fail'`로 hold를 유지합니다. 여기에 기본 policy에서 `arc_qa` prepare가 allow되는 테스트를 새로 추가합니다(AC8).
  - `composite-instructions.test.mjs`에 coordination 4종의 GK1 문장을 확인하는 단언을 추가합니다.
- [ ] **Step 4: RED 확인**
  - 실행: `node --test tests/node/grok-sandbox.test.mjs tests/node/grok-composite.test.mjs tests/node/grok-bridge.test.mjs tests/node/grok-capability-evidence.test.mjs tests/node/role-routing-dispatch.test.mjs tests/node/composite-instructions.test.mjs`
- [ ] **Step 5 (GREEN): 구현**
  - `grok-sandbox.mjs`에 두 함수를 추가합니다. 쓰기 API는 쓰지 않습니다.
  - `role-supervisor.mjs`: :394 after snapshot 뒤, T2 정리 앞에서 `readGrokProfileApplied`를 호출합니다.
    - `ok`이면 `applied`를 기록합니다.
    - `!ok && !(terminating === 'cancel' && candidates === 0)`이면 `permission_scope_mismatch`를 붙입니다.
    - claim level은 바꾸지 않습니다.
  - `role-dispatch-policy.mjs:3`을 `GK1: 'pass'`로 바꾸고, :2 주석에 GK1 근거(Grok 1.0.89, 2026-11-19, 쓰기 역할 한정, ProfileApplied 확인 필수)를 적습니다.
- [ ] **Step 6: 문서**
  - `docs/harness-operation.md`의 G1 행 다음에 GK1 `pass` 행을 넣습니다. 내용은 dispatch별 프로필(`extends="workspace"` + deny 24개), ProfileApplied 확인 필수, 한계(목록에 없는 `~/.grok/*`, `~/.grok/sessions`, temp 쓰기 허용, 읽기 무제한, 네트워크 허용, 1.0.89 macOS에서만 측정)입니다.
  - coordination 4종의 G1 문장 뒤에 같은 의미의 GK1 문장을 넣고, 읽기 역할은 바뀌지 않는다고 명시합니다.
- [ ] **Step 7: 생성물**
  - `update-runtime-assets` → golden `--diff` → `--write` → `update-manifest`
- [ ] **Step 8: GREEN 확인 (Implementer)**
  - Step 4 명령에 `installed-layout-golden`과 `runtime-assets` 테스트를 더하고, `--check` 2종도 함께 실행합니다.
  - 전체 실행 결과를 보고합니다.
- [ ] **Step 9: 호스트 검증 (Orchestrator)**
  - `cmp`로 복제본을 비교합니다.
  - 전체 테스트 결과를 B0와 비교합니다.
  - 변경 파일이 allowedPaths 안에만 있는지 확인합니다.
  - AC12: `sessions` 경로는 lstat, `O_RDONLY` open, read로만 접근하는지 grep으로 확인합니다.
- [ ] **Step 10: L2 실측 (Orchestrator)**
  - 임시 저장소에서 runtime 헬퍼로 만든 프로필과 `buildGrokArgs` 인자로 실제 grok 1.0.89를 실행합니다.
  - 확인할 것:
    - `readGrokProfileApplied`가 `ok:true`
    - `cat .grok/sandbox.toml`과 `mkdir ~/.grok/skills`가 거부됨
    - worktree 쓰기는 허용되고 home 쓰기는 거부됨
    - 프로필 해시가 그대로이고 실행 뒤 정리됨
  - 가능하면 bridge 경로로 1회 dispatch해서 `completed`와 record를 확인합니다.
  - dispatch가 끝난 뒤에만 다음 단계로 넘어갑니다. 실행 전후 AC12 해시가 같아야 합니다.
- [ ] **Step 11: fresh QA**
  - B0 규칙으로 분류합니다.
  - AC7 분기별 결과를 증거로 남깁니다.
- [ ] **Step 12: 수용과 커밋**
  - 커밋 메시지: `feat(runtime): Grok ProfileApplied 적용 확인과 GK1 pass 전환`

**수용 기준:** AC1(최종 값), AC7, AC8, AC9 GK1, AC10, AC11, AC12, AC13, AC14, E11–E13, RF3–RF5, L2 통과

**Hold 조건:**
- L2의 ProfileApplied 형식이 T0와 다른 경우
- 거부되어야 할 동작이 허용된 경우
- 실측에서 `inherited` 필드 때문에 판정 규칙을 바꿔야 하는 경우
- golden diff에 예상 밖 항목이 있는 경우

---

## 최종 검증 (모든 task 수용 뒤)

- [ ] Orchestrator가 확인합니다.
  - 호스트 전체 테스트를 B0와 비교했을 때 새 실패가 0건
  - `--check` 2종 통과
  - golden `--diff` 출력 없음
  - `git diff --stat d5bae6a -- lib/runtime shared/skill/runtime`의 범위가 spec §7과 같음
- [ ] 독립 최종 Reviewer가 `d5bae6a..HEAD`를 1회 검토합니다. 중점은 다음과 같습니다.
  - fail-closed 누락(생성 뒤 early failure와 catch 경로의 정리)
  - `O_EXCL|O_NOFOLLOW`와 lstat 사이의 TOCTOU
  - `~/.grok/sessions` 쓰기가 없는지
  - offset과 timestamp 필터가 동시 세션에서도 견디는지
  - D12의 범위
  - G1 문서에 적은 예외가 정확한지
  - RF1–RF5
  - runtimeHash 변경
- [ ] Reviewer 지적은 Implementer와 Reviewer 사이에서 다시 확인합니다. QA는 다시 배정하지 않습니다. 확인을 마치기 전에는 커밋하지 않고, 수용한 뒤 follow-up commit 1개로 남깁니다.

## AC와 E 배정표

| 항목 | task |
|---|---|
| AC1 | T1(G1), T3(GK1, 최종) |
| AC2, AC3 | T1 |
| AC4, AC5, AC6 | T2 |
| AC7 | T3 |
| AC8 | T2(hold), T3(pass) |
| AC9 | T1(G1, M2, coordination), T3(GK1) |
| AC10 | T3 |
| AC11, AC13, AC14 | T1, T2, T3 |
| AC12 | B0(기준), T1(L1), T2(grep), T3(L2, grep) |
| E1–E10, E14–E16 | T2 |
| E11–E13 | T3 |
| E17 | T1 |
| E18 | T0b |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19T10:59:30Z | 최초 승인 | 전체 | plan 승인 |
| v2 | 2026-11-19T11:08:39Z | contract | T0c(신규), T1 | B0에서 golden이 baseline부터 104줄 어긋나 있음을 확인. 무관한 차이가 섞이지 않도록 재생성 task를 T1 앞에 분리(사용자 결정) |
| v3 | 2026-11-20 | contract | T2 | spec v3 D10 정정을 `checkGrokHome` 기대값에 반영(사용자 결정). T2 Step 4의 prepare가 run-dispatch 준비 단계임을 명시 |
