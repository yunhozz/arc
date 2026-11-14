# Codex 호스트 Claude bridge 승격 조건부 허용과 실행 환경 판단 규칙 구현 계획

> **실행 주체 안내:** ARC 역할 경로로 실행합니다. Implementer는 작업마다 `/Users/yunho/.claude/skills/arc/references/test-driven-development.md`를 따라 RED → 구현 → GREEN 순서로 진행하고, Git 상태는 바꾸지 않습니다(stage·commit·branch 금지). 작업마다 fresh QA를 거친 뒤 Orchestrator가 수락하고 집중 커밋 하나를 만듭니다. 체크박스(`- [ ]`)는 진행 추적용이며 커밋 단위가 아닙니다.

**목표:** 사용자가 승인한 방향 A–E를 반영합니다.
- ① Orchestrator가 `executionEnvironment`를 근거 없이 `-desktop`으로 선언하지 않도록 판단 규칙을 지침에 명시합니다.
- ② Codex 호스트에서 Claude bridge를 G2로 미리 보류하지 않습니다. 대신 매 호출 사용자 승격 승인을 받을 때만 실행합니다.
- ③ 런타임 버전을 `cooperative-9`로 올리고 문서·재설치 안내를 갱신합니다.

**배경:** 사용자는 Codex CLI(rollout `originator: "codex-tui"`)에서 ARC 통합 모드를 쓰다가 차단됐습니다. Codex Orchestrator가 근거 없이 `executionEnvironment: "codex-desktop"`을 선언해 모든 역할이 `environment_unverified`로 보류됐습니다. 또 `codex-cli`로 선언하더라도 Claude bridge(Planner·Reviewer)는 G2 `host_sandbox_blocked`로 항상 보류됩니다.

**기준:** `/Users/yunho/Desktop/project/arc`, 브랜치 `refactor/shared-platform-assets`(PR #61), HEAD `62e72e2`.

**위험:** significant(보류 게이트 완화, 런타임 해시·버전 계약, 설치 바이트). 작업별 fresh QA를 거치고, 모든 작업이 수락된 뒤 전체 변경을 Reviewer가 1회 검토합니다.

**기준선 판정:** `npm test`는 HEAD `62e72e2`에서 이미 69건이 실패합니다(환경 요인 포함). T1 시작 전에 실패 테스트 이름 목록을 기준선으로 기록합니다. 각 작업과 최종 검증은 "기준선 대비 신규 실패 없음"과 "작업에 나열된 관련 테스트 파일 전부 통과"로 판정합니다.

**커밋 메시지 형식:** `type(scope): 한국어 설명`

## 승인된 설계 결정

- D1 실행 환경 판단 규칙. 두 `coordination.md`에 같은 문단을 둡니다.
  - 터미널 CLI/TUI 세션(IDE 통합 터미널 포함)은 `codex-cli`/`claude-cli`로 선언합니다.
  - Desktop 앱 안에서 실행 중임이 확인될 때만 `-desktop`으로 선언합니다.
  - 경로·디렉터리 이름(예: `~/Desktop/...`)으로 추정하지 않습니다.
  - 불확실하면 CLI 값으로 선언합니다.
  - 런타임 자동 감지는 범위 밖입니다.
- D2 `BRIDGE_GATE_RESULTS.G2`를 `'fail'`에서 `'escalation'`으로 바꿉니다.
  - 의미: 매 호출 승격 승인을 받으면 조건부로 통과하며, 미검증 상태입니다.
  - `bridgeGateReasons`의 `gates.G2 === 'fail'` 조건(`lib/runtime/role-dispatch-policy.mjs:82`)은 그대로 둡니다. 따라서 기본 정책에서는 사전 `host_sandbox_blocked`가 사라지고, 명시적으로 `G2:'fail'`인 정책에서는 기존대로 보류합니다.
  - `prepare-dispatch`(`role-routing.mjs:208`)와 `run-dispatch`/`resume` 재검사(`role-bridge.mjs:140`)가 같은 함수를 쓰므로 함께 풀립니다(의도된 일관성).
- D3 승격 거부나 `CODEX_HOME` EACCES는 기존 런타임 분류(`role-routing.mjs:131`, `role-bridge.mjs:30·51·153`)대로 `host_sandbox_blocked`가 됩니다. 코드는 바꾸지 않고 테스트로 고정합니다.
- D4 다음은 그대로 유지합니다.
  - G1: Claude bridge `arc_implementer`/`arc_qa`는 `permission_scope_unverified`.
  - Desktop 보류: `DESKTOP_CHECKLIST_PASSED` 두 값 모두 `false`이므로 `environment_unverified`.
  - `host_sandbox_blocked` releaseCondition 문구.
- D5 `environment_unverified` releaseCondition에 "Desktop 앱이 아니면 CLI 값으로 재선언" 안내를 넣습니다:
  `'Desktop hosts are held in this release. If this session is not running inside a Desktop app (for example a terminal or IDE terminal session), declare codex-cli or claude-cli instead; otherwise use a CLI host or a later ARC update that changes the support status.'`
- D6 런타임 버전 라벨을 `cooperative-9`로 올립니다(`lib/runtime/bootstrap.mjs:21`). 런타임 바이트가 바뀌므로 `runtime-versions.test.mjs`의 `baselineHash`를 다시 고정합니다. 이전 값 `sha256:f24d913a…fe5d`는 `previousRuntimeHash`로 옮깁니다.
- D7 (2026-11-15 사용자 결정으로 개정) `supportOf`(`role-bridge.mjs:21`) 판정 로직은 바꾸지 않습니다. Codex 호스트 Claude bridge는 다섯 claim(identity·model·effort·permissions·terminal)이 모두 `runtime-observed`이고 사유 없이 완료되면 `verified`가 될 수 있으며(`role-observe.mjs:106`, `role-supervisor.mjs:278-284`), 이를 허용합니다. claude-cli 호스트 Codex bridge와 같은 기준입니다. G2는 호스트 샌드박스 문제로 자식 세션 검증과 별개입니다. Desktop의 `unverified` 상한은 유지합니다. 문서의 "`supportStatus` stays `unverified`" 류 서술은 이 결정에 맞춥니다.
- D8 문서는 영어로만 씁니다. `docs/superpowers/` 이력 문서는 수정하지 않습니다. watch의 Codex Desktop 세션 제외는 범위 밖입니다.
- D9 `lib/runtime`이 원본입니다. `shared/skill/runtime`은 `node scripts/update-runtime-assets.mjs`, `MANIFEST.sha256`은 `node scripts/update-manifest.mjs`, 설치 레이아웃 golden(`tests/node/fixtures/installed-layout-golden.json`)은 `node tests/node/fixtures/installed-layout.mjs --write`로만 재생성합니다.

## 작업 분해

런타임 바이트를 바꾸면 고정 `baselineHash`, shared 동기화, MANIFEST, golden이 함께 깨집니다. 그래서 버전 라벨·재생성은 T1에 포함하고, 런타임 릴리스 단위(T1)와 지침·문서 단위(T2) 두 작업으로 나눕니다.

| 파일 | T1 | T2 | 책임 |
|---|---|---|---|
| `lib/runtime/role-dispatch-policy.mjs` | 수정 | — | `G2:'escalation'`, 상단 주석, `environment_unverified` 문구(D5) |
| `lib/runtime/bootstrap.mjs` | 수정 | — | `runtime:'cooperative-9'` |
| `shared/skill/runtime/role-dispatch-policy.mjs`, `shared/skill/runtime/bootstrap.mjs` | 재생성 | — | 생성 사본 |
| `tests/node/role-routing-dispatch.test.mjs` | 수정 | — | 고정값, Codex 호스트 허용/보류, Desktop, EACCES |
| `tests/node/runtime-versions.test.mjs` | 수정 | — | `cooperative-9`, 해시 재고정 |
| `tests/node/composite-live.test.mjs` | 수정 | — | 버전 상수·주석, Codex→Claude 기대 변경 |
| `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md` | — | 수정 | D1 문단, G2 서술 변경(같은 문장 유지) |
| `docs/harness-operation.md` | — | 수정 | 지원 등급 표, 환경 판단 규칙, `cooperative-9` 마이그레이션, watch 단락 |
| `README.md` | — | 수정 | Watch·Execution support 문장 |
| `lib/watch/index.mjs` | — | 수정 | 도움말 33행 |
| `docs/images/watch-flow.svg` | — | 수정 | 46행 노트 문구 |
| `tests/node/composite-instructions.test.mjs` | — | 수정 | 문구·버전 단언 |
| `tests/node/watch-cli.test.mjs` | — | 수정 | 도움말·README 단언 |
| `tests/node/fixtures/installed-layout-golden.json` | 재생성 | 재생성 | 설치 바이트 해시 |
| `MANIFEST.sha256` | 재생성 | 재생성 | 패키지 해시 |

---

## T1 — 런타임: G2 승격 조건부 허용, releaseCondition, `cooperative-9`

**선행:** `npm test` 기준선(실패 목록) 기록.

**범위**
- `role-dispatch-policy.mjs`
  - 2행을 `G2: 'escalation'`으로 바꿉니다.
  - 1행 주석에 의미를 덧붙입니다(예: `G2 'escalation' means the bridge runs only with per-call user escalation approval on a Codex host; it is not a verified pass.`).
  - 46행 `environment_unverified` 문구를 D5로 바꿉니다.
  - 82행 조건과 다른 값은 그대로 둡니다.
- `bootstrap.mjs:21`을 `'cooperative-9'`로 바꿉니다.
- `shared/skill/runtime`을 재생성합니다.
- `runtime-versions.test.mjs:15·34`를 `'cooperative-9'`로 바꿉니다. `previousRuntimeHash`에 기존 `baselineHash` 값을 넣고, `baselineHash`는 새 값으로 다시 고정합니다. `historicalRuntimeHash`는 그대로 둡니다.
- `composite-live.test.mjs`
  - 10·20행 버전을 `cooperative-9`로 바꿉니다.
  - 178–191행 테스트를 교체합니다(skip 아님).
    - 대상: `roleOn('claude', ['arc_planner','arc_reviewer','arc_scouter'])`.
    - 이름: `host codex to claude bridge: read-only role is allowed, or host_sandbox_blocked inside a Codex sandbox`.
    - `prepare('codex','codex-cli', …)`가 status 0이면 `allow`/`bridge`/`supportStatus 'unverified'`/`dispatchId` 존재를 단언합니다. 만들어진 reserved lease는 기존 cleanup이 취소합니다.
    - status 3이면 사유 코드가 정확히 `['host_sandbox_blocked']`이고 `dispatchId === null`인지 단언합니다.
    - `run-dispatch`는 호출하지 않습니다.
  - 주석은 G2 `escalation` 의미로 고칩니다.
  - Implementer `permission_scope_unverified` 테스트는 그대로 둡니다.
- golden과 MANIFEST를 재생성합니다.

**allowedPaths**
- `lib/runtime/role-dispatch-policy.mjs`
- `lib/runtime/bootstrap.mjs`
- `shared/skill/runtime/role-dispatch-policy.mjs`
- `shared/skill/runtime/bootstrap.mjs`
- `tests/node/role-routing-dispatch.test.mjs`
- `tests/node/runtime-versions.test.mjs`
- `tests/node/composite-live.test.mjs`
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**단계**
- [ ] 1. RED `role-routing-dispatch.test.mjs`: 다음 테스트를 추가합니다.
  - 고정값:
    - `BRIDGE_GATE_RESULTS`가 `{G1:'fail',G2:'escalation',G3:'pass',G4:'pass',G5:'wide',G6:'strict',G7:'pass',G8:'pass'}`이고 frozen입니다.
    - `DESKTOP_CHECKLIST_PASSED`가 `{'claude-desktop':false,'codex-desktop':false}`입니다.
    - `DEFAULT_POLICY.gates === BRIDGE_GATE_RESULTS`입니다.
  - `bridgeGateReasons` 단위:
    - Claude `arc_planner` + Codex 호스트, 기본 정책 → `[]`.
    - 같은 입력에 `G2:'fail'`(G1 pass) → `['host_sandbox_blocked']`.
    - `arc_qa` 기본 정책 → `['permission_scope_unverified']`.
  - 기본 정책 Codex 호스트 fixture(`roles:{arc_planner,arc_reviewer,arc_implementer,arc_qa:'claude'}`):
    - planner·reviewer는 `allow`/`bridge`/`unverified`/codes `[]`이고, 끝나면 cancel합니다.
    - implementer·qa는 `hold`이고 codes가 정확히 `['permission_scope_unverified']`입니다.
  - Desktop:
    - Codex 호스트 `codex-desktop` 기본 정책에서 planner(bridge)와 scouter(native)는 `hold`이고, codes에 `environment_unverified`가 있으며 `host_sandbox_blocked`는 없습니다.
    - Claude 호스트 `claude-desktop`도 `environment_unverified`입니다.
  - `reason('environment_unverified').releaseCondition`이 `/not running inside a Desktop app/`, `/codex-cli or claude-cli/`에 매치합니다.
  - 기본 정책 EACCES(skipRoot): Codex 호스트 planner:claude에서 dispatch 디렉터리 또는 `codexHome`을 0o500으로 바꾸면 `hold`이고 codes가 `['host_sandbox_blocked']`입니다. finally에서 권한을 복원합니다.
  - 기존 명시적 `G2:'fail'` 테스트는 그대로 통과해야 합니다.
- [ ] 2. RED `runtime-versions.test.mjs:15·34`를 `'cooperative-9'`로 바꿉니다.
- [ ] 3. `node --test tests/node/role-routing-dispatch.test.mjs tests/node/runtime-versions.test.mjs`로 RED 증거를 기록합니다.
- [ ] 4. 구현: `role-dispatch-policy.mjs`(2행, 1행 주석, 46행), `bootstrap.mjs:21`.
- [ ] 5. `node scripts/update-runtime-assets.mjs`를 실행하고 `--check`가 통과하는지 확인합니다.
- [ ] 6. `runtime-versions.test.mjs`의 해시를 재고정합니다.
  - `baselineHash`는 새 값으로 바꿉니다.
  - `previousRuntimeHash`는 `'sha256:f24d913ad8866ec89fcd38cb26e7dbebc0b0243a9763df88af7a95861a02fe5d'`로 바꿉니다.
- [ ] 7. `composite-live.test.mjs`를 수정하고 `node --check`로 문법을 확인합니다.
- [ ] 8. D7: `supportOf`는 변경하지 않습니다. `role-routing-dispatch.test.mjs` 또는 기존 support 테스트 파일 범위에서, Codex 호스트 Claude bridge lease(`hostPlatform:'codex'`, `executionEnvironment:'codex-cli'`, `route:'bridge'`, `state:'completed'`, 사유 없음, 다섯 claim `runtime-observed`)가 `verified`이고 하나라도 `unverified`이면 `unverified`, `codex-desktop`이면 `unverified`임을 단언할 수 있으면 추가합니다(공개 API로 가능한 경우에만; 불가능하면 근거만 기록).
- [ ] 9. `node tests/node/fixtures/installed-layout.mjs --diff`를 실행합니다. 차이는 `runtime/role-dispatch-policy.mjs`, `runtime/bootstrap.mjs` 줄만 있어야 하며, 확인한 뒤 `--write`로 재생성합니다.
- [ ] 10. `node scripts/update-manifest.mjs`를 실행하고 `--check`가 통과하는지 확인합니다.
- [ ] 11. GREEN 검증을 실행합니다.

**검증 명령**
```
node --test tests/node/role-routing-dispatch.test.mjs tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/status-labels.test.mjs tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/role-bridge-support.test.mjs tests/node/role-bridge-args.test.mjs tests/node/role-observe.test.mjs tests/node/manifest.test.mjs tests/node/composite-live.test.mjs
node --test --test-timeout=180000 tests/node/installed-layout-golden.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs --check
node tests/node/fixtures/installed-layout.mjs --diff   # 재생성 후 출력 없음
npm test                                               # 기준선 대비 신규 실패 없음
```

**수용 기준**
- AC1 기본 정책 고정값이 D2·D4와 일치하고 테스트로 고정되어 있습니다.
- AC2 기본 정책·`codex-cli`에서 Claude bridge `arc_planner`/`arc_reviewer`의 prepare-dispatch가 `allow`이고 `supportStatus 'unverified'`입니다. `arc_implementer`/`arc_qa`는 `['permission_scope_unverified']`로만 보류됩니다.
- AC3 `codex-desktop`·`claude-desktop`은 기본 정책에서 `environment_unverified`로 보류됩니다.
- AC4 기본 정책 Codex 호스트에서 EACCES는 `['host_sandbox_blocked']`입니다. 명시적 `G2:'fail'`은 기존대로 사전 보류합니다.
- AC5 `environment_unverified` releaseCondition에 CLI 재선언 안내가 있습니다.
- AC6 `cooperativeVersions().runtime === 'cooperative-9'`이고 lib/shared 해시가 일치하며 `baselineHash`가 재고정되어 있습니다.
- AC7 shared, MANIFEST, golden이 생성기 출력과 같습니다.
- AC8 composite-live의 Codex→Claude 기대가 "allow, 또는 샌드박스 안에서는 `host_sandbox_blocked`"이며, 기본 `npm test`에서는 skip되고 문법 검사를 통과합니다.
- AC9 기준선 대비 신규 실패가 없습니다.

**QA 증거:** RED/GREEN 출력, `--check`/`--diff` 결과, D7 단언 또는 근거, golden diff 줄 목록, `npm test` 실패 목록과 기준선의 차집합(비어 있음).

**보류 조건:** 다음 경우에는 고치지 말고 보고합니다.
- 다른 해시 고정 테스트가 예상 밖으로 깨진 경우.

**커밋 메시지:** `fix(runtime): Codex 호스트 Claude bridge의 G2 사전 보류를 호출별 승격 승인 조건으로 바꾸고 cooperative-9로 올림`

---

## T2 — 지침·문서·watch 도움말: 실행 환경 판단 규칙과 승격 안내

**선행:** T1 수락·커밋.

**범위**
- 두 `coordination.md`(문장은 바이트 단위로 같게 유지)
  - 117행의 `... are caller-provided claims, not host attestations.` 뒤에 다음을 추가합니다.
    > Choose `executionEnvironment` by where the session actually runs: a terminal CLI or TUI session, including one in an IDE integrated terminal, is `codex-cli` or `claude-cli`; use `codex-desktop` or `claude-desktop` only when the session is confirmed to run inside the Desktop app. NEVER infer the environment from paths or directory names (for example `~/Desktop/...`). When unsure, declare the CLI value.
  - First-release 문단의 G2 관련 두 문장을 다음으로 바꿉니다. 나머지 문장(G3·G5·Desktop·checklist)은 유지합니다.
    > Claude bridge `arc_implementer` and `arc_qa` on a Codex host (the only host with a Claude bridge) are held as `permission_scope_unverified` because the injected sandbox is not verified (G1). In a Codex host sandbox writes to `CODEX_HOME` are denied (G2), so a Codex-host bridge is not held in advance but runs only with the per-call escalation approval below; a refused approval or a denied write is `host_sandbox_blocked`. Detached supervisor survival itself was observed under variant conditions, and native routes there remain supported.
  - 승격 승인 규칙 줄은 그대로 둡니다.
- `docs/harness-operation.md`
  - `codex-cli` 행을 다음으로 바꿉니다.
    > Native routes supported. Claude bridge `arc_scouter`, `arc_planner` and `arc_reviewer` run only after the user approves escalation for each call (G2 is recorded as `escalation`): writes to `CODEX_HOME` are denied in the Codex host sandbox, so without approval, or when a write is still denied, the result is `host_sandbox_blocked`; detached supervisor survival itself was observed under variant conditions. Claude bridge `arc_implementer` and `arc_qa` on a Codex host stay held as `permission_scope_unverified` because the injected sandbox is not verified (G1). A completed Claude bridge reports `supportStatus` `verified` only when every claim is runtime-observed
  - 표 바로 뒤에 `Choosing executionEnvironment:` 단락을 추가합니다. 문장은 coordination.md와 같게 씁니다.
  - 마이그레이션 단락 앞부분을 다음으로 바꿉니다. `The runtime version changed, ...`부터는 그대로 둡니다.
    > `cooperative-9` migration: This version no longer holds Codex-host bridges in advance as `host_sandbox_blocked` (G2 is recorded as `escalation`; every call still needs explicit escalation approval), and documents how to choose `executionEnvironment`, including a release condition for `environment_unverified` that points to the CLI value.
  - watch 단락의 Codex-host bridge 문장을 다음으로 바꿉니다.
    > Codex-host bridges appear once they run after per-call escalation approval; a refused approval is `host_sandbox_blocked`, and Claude bridge Implementer and QA stay held as `permission_scope_unverified`; without a lease there is no dispatch to display.
- `README.md`
  - 45행:
    > - **Excluded:** Codex Desktop sessions. Bridge roles on Codex hosts need per-call escalation approval (otherwise `host_sandbox_blocked`) and appear once they run.
  - 58행:
    > - **Execution support:** `claude-cli` hosts run native roles and Codex bridges. `codex-cli` hosts run native roles and Claude bridges for Scouter, Planner and Reviewer after per-call escalation approval (a refused approval or denied `CODEX_HOME` write is `host_sandbox_blocked`); Claude bridge Implementer and QA roles stay held as `permission_scope_unverified`. Declare `codex-cli` or `claude-cli` for terminal sessions, including IDE terminals; use a `-desktop` value only inside a Desktop app, never because of a path such as `~/Desktop`. On Desktop, every role (native and bridge) is held as `environment_unverified` pending a future ARC update. After upgrading to `cooperative-9`, run Install / Update again.
- `lib/watch/index.mjs:33`:
  > `Bridge roles on a Codex host run only after per-call escalation approval (otherwise host_sandbox_blocked) and appear once they run.`
- `docs/images/watch-flow.svg:46`:
  > `Masking is not complete. Bridge roles on Codex hosts need per-call escalation approval (host_sandbox_blocked otherwise).`

  렌더 폭이 넘치면 문장을 줄이고 QA가 확인합니다.
- golden과 MANIFEST를 재생성합니다.

**allowedPaths**
- `claude/skill/references/coordination.md`
- `codex/skill/references/coordination.md`
- `docs/harness-operation.md`
- `README.md`
- `lib/watch/index.mjs`
- `docs/images/watch-flow.svg`
- `tests/node/composite-instructions.test.mjs`
- `tests/node/watch-cli.test.mjs`
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**단계**
- [ ] 1. RED `composite-instructions.test.mjs`
  - `/cooperative-8/`를 `/cooperative-9/`로 바꾸고, `cooperative-8`이 없다는 단언을 추가합니다.
  - G2 정규식을 escalation 문구로 바꾸고, `conservatively held`/`currently held` 문구가 없다는 단언을 추가합니다.
  - 두 harness 본문과 docs에 다음 문구가 있는지 단언합니다.
    - `terminal CLI or TUI session … IDE integrated terminal … codex-cli or claude-cli`
    - `only when the session is confirmed to run inside the Desktop app`
    - `NEVER infer the environment from paths or directory names`
    - `When unsure, declare the CLI value`
  - 두 harness의 규칙 문장이 서로 같은지 단언합니다.
  - docs에 `G2 is recorded as escalation`과 `cooperative-9 migration`이 있는지 단언합니다.
  - `operations.mjs`에 cooperative-8과 cooperative-9가 모두 없는지 단언합니다.
- [ ] 2. RED `watch-cli.test.mjs`
  - help가 `/per-call escalation approval/`에 매치하고 `/currently held/`에 매치하지 않는지 단언합니다.
  - README 섹션이 `/per-call escalation approval/`에 매치하고 ``/stay held as `host_sandbox_blocked`/``에 매치하지 않는지 단언합니다.
  - 기존 단언은 유지합니다.
- [ ] 3. `node --test tests/node/composite-instructions.test.mjs tests/node/watch-cli.test.mjs`로 RED를 확인합니다.
- [ ] 4. 문서·지침·도움말·SVG를 수정합니다. 영어만 씁니다.
- [ ] 5. `installed-layout.mjs --diff`를 실행합니다. 차이는 `references/coordination.md` 줄만 있어야 하며, 확인한 뒤 `--write`로 재생성합니다.
- [ ] 6. `node scripts/update-manifest.mjs`를 실행하고 `--check`가 통과하는지 확인합니다.
- [ ] 7. GREEN 검증을 실행합니다.

**검증 명령**
```
node --test tests/node/composite-instructions.test.mjs tests/node/watch-cli.test.mjs tests/node/instruction-layout.test.mjs tests/node/package-references.test.mjs tests/node/agent-fragments.test.mjs tests/node/manifest.test.mjs
node --test --test-timeout=180000 tests/node/installed-layout-golden.test.mjs
node scripts/update-manifest.mjs --check
node tests/node/fixtures/installed-layout.mjs --diff   # 출력 없음
grep -n "currently held\|conservatively held\|cooperative-8" README.md docs/harness-operation.md claude/skill/references/coordination.md codex/skill/references/coordination.md lib/watch/index.mjs docs/images/watch-flow.svg   # 결과 없음
npm test                                               # 기준선 대비 신규 실패 없음
```

**수용 기준**
- AC10 두 `coordination.md`에 같은 실행 환경 판단 규칙(D1)이 있고, docs와 README에도 같은 취지가 있습니다.
- AC11 지침·문서가 Codex 호스트 bridge를 "매 호출 승격 승인 조건부 실행, 거부·쓰기 거부 시 `host_sandbox_blocked`"로 서술합니다. G1·Desktop 서술은 유지되고, `supportStatus`는 D7(모든 claim 관찰 시에만 `verified`, Desktop은 `unverified` 상한)과 일치하게 서술됩니다.
- AC12 마이그레이션 단락과 README 재설치 안내가 `cooperative-9`이고, 기존 마이그레이션 단언이 통과합니다.
- AC13 watch 도움말·README Watch 섹션·SVG에 "currently held" 류 문구가 없습니다.
- AC14 golden과 MANIFEST가 생성기 출력과 같습니다.
- AC15 기준선 대비 신규 실패가 없습니다.

**QA 증거:** RED/GREEN 출력, 두 `coordination.md` 문단의 동일성, grep 결과, golden diff 줄 목록, `npm test` 차집합.

**보류 조건:** 다른 해시 고정 테스트가 `coordination.md` 변경으로 실패하면 고치지 말고 보고합니다.

**커밋 메시지:** `docs(coordination): 실행 환경 판단 규칙과 Codex 호스트 bridge 호출별 승격 안내 반영`

---

## 최종 검증

- 전체 변경(`62e72e2..HEAD`)을 독립 Reviewer가 1회 검토합니다. 중점:
  - G2 `escalation`이 다른 경로(`role-observe.mjs:190` 등)에 미치는 영향.
  - 82행 조건 유지.
  - Desktop·G1 보류 유지.
  - 문서·지침·도움말과 런타임 동작의 일치.
  - 생성물과 원본의 일치.
- Reviewer 지적은 Implementer → Reviewer 재확인으로 처리하고, 해소 후 후속 집중 커밋을 만듭니다.
- 사용자 안내:
  - 머지·업데이트 후 두 하네스 모두 Install / Update를 다시 실행해야 합니다.
  - Codex CLI 세션에서는 `codex-cli`로 선언하고, bridge 호출마다 승격을 승인합니다.

## 확인 사항

- Q1 해소: `build/native/darwin-arm64`가 있고 현재 `installed-layout.mjs --diff` 출력이 없어 golden을 재생성할 수 있습니다.
- Q2 해소(2026-11-15): Codex 호스트 Claude bridge의 `verified` 도달을 허용합니다(D7 개정).
- Q3: 실비용 live smoke(`ARC_LIVE_CLI_TESTS=1`)는 수용 조건에 넣지 않습니다.
- 위험 고지: "불확실하면 CLI로 선언" 규칙 때문에 실제 Desktop 세션이 CLI로 잘못 선언되면 Desktop 보류를 우회할 수 있습니다. 런타임 자동 감지는 후속 과제 후보입니다.
