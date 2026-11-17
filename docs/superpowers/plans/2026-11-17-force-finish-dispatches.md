# Install / Update 차단 dispatch 강제 종료 후 재시도 구현 계획

> **실행 방식:** ARC Orchestrator가 작업마다 새 Implementer(Codex 브리지)를 배정하고, fresh QA 수용 후 작업당 커밋 1개를 만듭니다. 모든 작업 수용 후 독립 Reviewer가 전체 변경을 1회 검토합니다.

**Goal:** Install / Update(composite)나 switch가 활성 dispatch 때문에 막혔을 때, TUI에서 자격이 있는 lease를 `cancelled`로 강제 종료하고 한 번 재시도할 수 있게 합니다.

**Architecture:** 설치기 차단 오류에 `blockingDispatches` 상세를 붙입니다. 새 `forceFinishDispatches`는 routing lock을 잡은 상태에서 lease를 다시 읽은 뒤 조건부로 다시 씁니다. management 계층은 대상만 걸러 이 함수를 부르고, TUI `execute`는 선택지를 보여 준 뒤 같은 요청으로 `prepareOperation`을 다시 호출해 새 `prepared`로 1회 재실행합니다(설치 스냅샷 검사 때문에 기존 `prepared`는 재사용할 수 없음). 프로세스 신호는 보내지 않으며 CLI 동작은 바꾸지 않습니다.

**Tech Stack:** Node.js ESM, `node:test`

**Spec:** 별도 written spec 없음(Bounded, 짧은 설계 승인). 설계 기록: `.git/arc/workflows/force-finish-dispatches/approved-design.md` (2026-11-17 사용자 승인)

**작업 대상:** `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `feat/force-finish-dispatches` (base master `f433c75`)

## Global Constraints
- 종료 상태는 `state:'cancelled'`, `claims.terminal = {level:'operator-attested', source:'installer-force-finish', observed:'cancelled'}`, `reasons:[]`입니다. 기존 `claims`의 나머지 키는 유지합니다.
- 강제 종료 대상은 `forceFinishable = (route==='native' && NON_TERMINAL_STATES.includes(state)) || (route==='bridge' && state==='reserved')`인 lease뿐입니다. bridge `starting`/`running`/`unknown`은 차단과 안내만 합니다. 프로세스 신호는 보내지 않습니다.
- `skipped`나 `residualPaths`가 하나라도 있으면 재시도하지 않고 결과만 보고합니다.
- 기존 오류 메시지 문자열, `error.activeDispatches`(중복 제거된 id 배열, 읽기 실패 시 `null`), management `messages`(`Active dispatches: …`, `Active bridge dispatches: …`)는 바꾸지 않습니다.
- lease 읽기 실패(`activeDispatches=null`) 오류에는 `blockingDispatches`를 붙이지 않습니다.
- `lib/cli/root.mjs`를 포함한 비대화형 CLI는 수정하지 않습니다(exit 1 유지).
- watch 모듈은 tui를 import하지 않습니다. 이번 변경은 watch를 건드리지 않습니다.
- 판정: 대상 테스트 파일은 전부 통과해야 합니다. 저장소 전체 suite는 기존 baseline 실패 외에 새 실패가 없어야 하며, 의심 실패는 단독으로 다시 돌립니다. 전체 suite 실행은 Orchestrator가 맡습니다.

## 설계 해석 (Orchestrator 확정)
- **A1 (lock 순서):** lock은 home이 `entries`에 처음 나타난 순서로 겁니다. moving 경로의 `blockingDispatches`는 이미 anchor 순서(`sortByAnchor`)로 만들어지고 management 필터가 순서를 보존하므로 publish 경로(`lib/installer/role-routing.mjs:144-147`)와 같은 순서가 됩니다.
- **A2 (skipped 사유):** lease 없음, terminal, `state`/`updatedAt` 불일치는 모두 `reason:'changed'`입니다. 재판정 자격 불충족은 `reason:'not_eligible'`입니다.
- **A3 (cancel 안내의 `--cwd`):** lease에 프로젝트 cwd 필드가 없으므로 `--cwd <project>` placeholder로 표시합니다.
- **A4 (해제 실패 오류 형태):** lock 해제 실패는 throw로 표현합니다. 오류에는 `residualPaths`, `lockReleaseFailed=true`, `forceFinish={finished,skipped}`를 붙입니다. TUI는 이 throw를 직접 잡습니다.

## Review Focus
1. non-moving composite의 재시도: `executeCompositeOperation`은 non-moving일 때 publish 가드보다 먼저 `ready()`(install이면 `installTargets`)를 실행합니다(`lib/management/operations.mjs:139-140`). 첫 실행이 home 메타데이터를 바꾸므로 같은 `prepared` 재실행은 `assertPlanSnapshot`(`lib/installer/transaction.mjs:21-24`)에서 `Install target changed`로 거부됩니다(v2 T1 실행에서 관찰). 따라서 재시도는 같은 요청으로 다시 prepare한 새 `prepared`로 하며, 그때 code 0이어야 합니다. 스냅샷 검사는 완화하지 않습니다(T-b, T-f(ii)(iii)).
2. moving 경로에서 같은 dispatchId가 두 home에 있는 경우: `blockingDispatches`에는 home별로 각각 남기고, `activeDispatches`는 중복 제거 상태를 유지합니다(T-a).
3. 강제 종료 중 lock 해제 실패: 이미 쓴 lease는 되돌리지 않습니다. `residualPaths`와 함께 실패를 보고하고 재시도하지 않습니다(T-e, U-d).
4. 차단 오류가 아닌 실패(읽기 실패, 기타 오류): 선택지 없이 기존 Result 페이지로 갑니다(U-a 보조 단언).
5. 재실행이 다시 실패하는 경우: 선택지를 다시 보여 주지 않습니다(U-b).

---

## Task T1: 설치기 차단 상세, `forceFinishDispatches`, management `forceFinishBlockingDispatches`

**Files:**
- Modify: `lib/installer/role-routing.mjs`
  - `:15` import에 `readLease`, `writeLease` 추가
  - `:114-120` `assertNoActiveBridgeDispatch`, `:121-127` `assertNoActiveMovingDispatches`
  - 새 export `forceFinishDispatches` (`:127` 뒤 권장)
- Modify: `lib/management/operations.mjs`
  - import에 `forceFinishDispatches` 추가, 새 export `forceFinishBlockingDispatches`
  - catch(`:143`, `:163`)는 수정하지 않음(error 전달 유지)
- Test: `tests/node/install-mode-n-platform.test.mjs` (기존 헬퍼 `moveLease`(`:646`), `zetaLease`, `compositeFilesFixture`, `prepareSetChange`, `homeBytes`, `routingLock` 재사용)
- Implementer allowedPaths: `lib/installer/role-routing.mjs`, `lib/management/operations.mjs`, `tests/node/install-mode-n-platform.test.mjs`, `MANIFEST.sha256` (생성물: `node scripts/update-manifest.mjs`로만 갱신)

**선행:** 없음

**Interfaces (Produces, T2가 사용):**
- 차단 오류의 `error.blockingDispatches: Array<{home, dispatchId, role, workflowId, route, state, hostPlatform, updatedAt, forceFinishable:boolean}>`
  - non-moving/switch 경로(`assertNoActiveBridgeDispatch`): 해당 `codexHome`의 bridge non-terminal lease
  - moving 경로: 각 home에서 `listLeases`를 따로 호출해 home을 보존한 non-terminal lease. 순서는 `homes` 인자 순서(anchor 순서), 그 안에서는 `listLeases` 순서
- `export async function forceFinishDispatches({context, entries, now = Date.now()}) -> Promise<{finished:string[], skipped:Array<{dispatchId, reason:'changed'|'not_eligible'}>, residualPaths:string[]}>` (`lib/installer/role-routing.mjs`)
- `export async function forceFinishBlockingDispatches(context, entries) -> Promise<같은 반환형>` (`lib/management/operations.mjs`): `entries.filter(e => e.forceFinishable)`만 넘기고, 비면 lock 없이 `{finished:[], skipped:[], residualPaths:[]}` 반환

**구현 결정:**
- `forceFinishable` 판정은 내부 헬퍼 하나(예: `forceFinishableLease(lease)`)로 두고 두 assert 함수와 `forceFinishDispatches` 재판정에서 공유합니다.
- `forceFinishDispatches` 처리 순서:
  1. entries를 `home` 기준으로 묶습니다(A1 순서).
  2. 각 home에 `acquireRoleRoutingLock(home)`을 차례로 겁니다. 하나라도 실패하면 이미 잡은 lock을 역순으로 풀고 원래 오류를 throw합니다. lease는 쓰지 않습니다.
  3. lock 안에서 entry마다 `readLease(home, dispatchId, {runtimePlatforms})`로 다시 읽습니다.
     - `null`, terminal, `state`/`updatedAt` 불일치: `skipped {reason:'changed'}`
     - 재판정 `forceFinishable` false: `skipped {reason:'not_eligible'}`
     - 그 외: `writeLease(home, {...lease, state:'cancelled', claims:{...(lease.claims ?? {}), terminal:{level:'operator-attested', source:'installer-force-finish', observed:'cancelled'}}, reasons:[]}, {now, runtimePlatforms})`
  4. `finally`에서 모든 lock을 역순으로 풉니다. 해제 실패 시 해당 lock 경로를 수집합니다.
  5. 수집된 lock 경로가 있으면 `TargetConfigurationError('Dispatch lock ownership could not be verified')`를 throw합니다(A4 필드 포함).
- 정상 반환의 `residualPaths`는 항상 `[]`입니다.

**Steps:**
- [ ] **Step 1: 실패 테스트 작성** (`tests/node/install-mode-n-platform.test.mjs`)
  - **T-a** `blocking details report home and forceFinishable`
    - moving 경로(`:700-716` 패턴): claude/codex home에 native `reserved`와 bridge `running`을 만들고, 같은 dispatchId를 두 home에 둔 경우를 포함합니다. 각 항목 키가 정확히 9개, `home`이 실제 home, native→`true`, bridge running→`false`, 중복 id는 home별 2건, `activeDispatches`는 중복 제거, 메시지 불변을 단언합니다.
    - non-moving(`:857-868` 패턴): bridge `reserved`→`true`, `running`→`false`.
    - lease JSON을 깨뜨린 읽기 실패: `activeDispatches===null`, `blockingDispatches===undefined`.
  - **T-b** `force finish cancels blocking native leases and the same prepared move succeeds`
    - `:884-900` 패턴으로 native `reserved`를 둔 뒤 차단 확인 → `management.forceFinishBlockingDispatches(ctx, result.error.blockingDispatches)`가 `{finished:[id], skipped:[], residualPaths:[]}` → lease JSON `state==='cancelled'`, `claims.terminal` deepEqual, `reasons` deepEqual `[]`, 기존 claims 키 보존 → 같은 요청으로 `prepareOperation`을 다시 호출한 새 `prepared`로 `executeCompositeOperation`(또는 `executeOperation`) 재호출 시 `code===0`, `currentInstallState(ctx).anchor==='claude'`.
  - **T-c** `force finish skips a running bridge lease as not_eligible without writing`: 위조 entry(`forceFinishable:true`)로 `forceFinishDispatches` 직접 호출 → `skipped` deepEqual `[{dispatchId, reason:'not_eligible'}]`, `finished` `[]`, `arc-role-dispatch` 바이트 불변.
  - **T-d** `force finish skips a lease whose updatedAt changed`: entry 수집 후 `writeLease`로 `updatedAt` 갱신 → `skipped` deepEqual `[{dispatchId, reason:'changed'}]`, lease bytes가 갱신 직후와 같음.
  - **T-e** `force finish fails when the routing lock is held and leaves leases unchanged`: `routingLock(home)` 파일 선생성 → `assert.rejects`, lease bytes 불변, lock 파일 그대로 존재(정리 단계에서 삭제).
  - **T-f** `non-moving and switch paths force finish a reserved bridge lease`
    - (i) `:857-868` fixture에 bridge `reserved` → `publishCompositeFiles` reject → `forceFinishBlockingDispatches`가 `finished:[id]` → 같은 prepared로 `publishCompositeFiles` 재호출 `published===true`.
    - (ii) `:778-789` F1 패턴 anchor(claude) home에 bridge `reserved` → `management.executeOperation(ctx, prepared)`가 `code===1`, `result.error.blockingDispatches[0].forceFinishable===true`, `messages`에 `Active bridge dispatches: <id>` → 강제 종료 후 같은 요청으로 다시 prepare한 새 prepared로 재호출 `code===0`.
    - (iii) Review Focus 1: non-moving composite install(install operation 포함)에서 강제 종료 후 같은 요청으로 다시 prepare한 새 prepared 실행이 code 0. 같은 prepared 재사용은 이 테스트의 대상이 아닙니다.
- [ ] **Step 2: 실패 확인** — `node --test tests/node/install-mode-n-platform.test.mjs`; T-a~T-f FAIL, 기존 테스트 PASS
- [ ] **Step 3: 구현** (위 구현 결정대로)
- [ ] **Step 4: manifest 재생성 및 통과 확인** — `node scripts/update-manifest.mjs` 실행 후 `node --test tests/node/install-mode-n-platform.test.mjs`, `node --test tests/node/management-operations.test.mjs`, `node --test tests/node/install-mode-publication.test.mjs`, `node --test tests/node/install-mode-switch.test.mjs` 전부 PASS (기존 메시지 단언 `management-operations.test.mjs:61`, `install-mode-publication.test.mjs:37`, `install-mode-n-platform.test.mjs:711,862` 유지)
- [ ] **Step 5: 수용 후 커밋** (Orchestrator) — 예: `feat(installer): report blocking dispatch details and force finish eligible leases`

**수용 기준:** T-a~T-f와 위 4개 파일 통과; 기존 오류 메시지·`activeDispatches`·management `messages` 불변; `lib/cli/root.mjs` 변경 없음; 프로세스 신호 API 미사용; 전체 suite 새 실패 없음.

**필수 체크:** fresh QA — 위 테스트 실행 결과, `git diff --stat`이 allowedPaths 4개 파일로 한정, 신호 API 미사용 grep.

---

## Task T2: TUI execute 강제 종료·재시도 흐름

**Files:**
- Modify: `lib/tui/app.mjs`
  - `:4` import에 `forceFinishBlockingDispatches` 추가
  - `:58` `api` 기본값에 `forceFinishBlockingDispatches` 추가(`...options.services`로 덮어쓰기 가능)
  - `:64-70` `execute` 수정
  - 모듈 내부 헬퍼 `formatElapsed(ms)`, `blockingRows(entries, now)` 추가
- Test: `tests/node/tui-app.test.mjs` (기존 services stub 패턴 `:58`, `:73`; `prepareOperation` stub이 `{kind:'switch'}` 또는 `{kind:'composite'}` 반환)
- Implementer allowedPaths: `lib/tui/app.mjs`, `tests/node/tui-app.test.mjs`, `MANIFEST.sha256` (생성물: `node scripts/update-manifest.mjs`로만 갱신)

**선행:** T1 수용·커밋

**Interfaces (Consumes):** T1의 `blockingDispatches` 항목 형식, `forceFinishBlockingDispatches(context, entries) -> {finished, skipped, residualPaths}`, 실패 시 throw되는 `error.residualPaths`

**구현 결정:**
- 요청 기억: `api.prepareOperation` 호출을 감싸는 내부 함수(예: `prepareRequest(options)`)를 두고, install 흐름의 `prepare:settings=>…`(`:85`)와 uninstall의 prepare(`:77`)가 이를 쓰게 해 마지막 요청 `options`를 기억합니다.
- 시그니처: `execute(prepared, {retried = false, request} = {})` (호출부는 기억한 요청을 넘김)
- `result`를 받은 직후, 기존 draft 정리·rows 생성 전에 `!retried && ['composite','switch'].includes(prepared.kind) && result.error?.blockingDispatches?.length`를 검사합니다. `code===130`이거나 `result.exitSession`이면 분기하지 않습니다.
- `rows = blockingRows(entries, Date.now())`
  - entry마다 `${dispatchId.slice(0,8)}  ${role}  ${workflowId}  ${route}  ${state}  ${formatElapsed(now - Date.parse(updatedAt))} ago`
  - 대상이 아닌 bridge entry 아래에 `  Live bridge process may still run; cancel it: node ${home}/skills/arc/runtime/cli.mjs cancel --cwd <project> --workflow ${workflowId} --input -`
  - 마지막에 빈 줄과 `Force finish marks the native/reserved entries cancelled. Native agents in other sessions are not stopped.`
- `formatElapsed`: 1분 미만 `<1m`, 1시간 미만 `${m}m`, 1일 미만 `${h}h ${m}m`, 그 이상 `${d}d ${h}h`
- 대상이 있을 때: `ui.menu('Active dispatches', ['Force finish and retry'], {backRow:true, selected:1, info:rows})`
  - `null`(뒤로): force 미호출, 기존 Result 페이지. Escape는 기존대로 home.
  - `0`: `ui.busy(() => api.forceFinishBlockingDispatches(context, entries))`를 try/catch로 감쌉니다.
    - throw: `ui.page('Force finish', [error.message, ...residualPaths.map(p => 'Residual path: ' + p), 'Install / Update was not retried.'])` 후 `false` 반환
    - `skipped.length || residualPaths.length`: `ui.page('Force finish', [...finished.map(id => 'Finished: ' + id), ...skipped.map(s => \`Skipped: ${s.dispatchId} (${s.reason})\`), ...residual 행, 'Install / Update was not retried.'])` 후 `false` 반환
    - 전부 finished: `const next = await ui.busy(() => api.prepareOperation(context, request))` 후 `return execute(next, {retried:true, request})`. 재 prepare가 throw하면 오류 메시지와 `Install / Update was not retried.`를 'Force finish' 페이지로 보여 주고 `false` 반환. 요청이 없으면(기억 실패) 재시도하지 않고 같은 페이지로 안내합니다.
- 대상이 없을 때: `ui.page('Active dispatches', rows)` 후 기존 Result 페이지

**Steps:**
- [ ] **Step 1: 실패 테스트 작성** (`tests/node/tui-app.test.mjs`)
  - **U-a** `blocked composite shows active dispatches and back cancels without force finishing`: 'Active dispatches' 화면에 id 앞 8자와 고지 문구, force 0회, `executeOperation` 1회, 이후 'Result'. 보조: `blockingDispatches` 없는 오류이거나 `kind:'install'`이면 'Active dispatches' 미렌더.
  - **U-b** `force finish runs once, retries once, and does not offer it again`: force 1회, `prepareOperation` stub이 두 번째로 같은 요청 options로 호출되고, `executeOperation` 2회(두 번째 prepared는 재 prepare 결과 객체), 메뉴 렌더 1회, 마지막 'Result'.
  - **U-c** `no eligible entries shows a guidance page with the runtime cancel command`: bridge `running` 하나 → page rows에 `runtime/cli.mjs cancel --cwd`와 `Live bridge process`, force 0회, 메뉴 미표시, 이후 'Result'.
  - **U-d** `skipped or failed force finish reports and does not retry`: ① skipped `changed` 반환, ② `residualPaths:['/x.lock']`를 가진 Error throw → 'Force finish' 페이지에 해당 행과 `Install / Update was not retried.`, `executeOperation` 1회.
- [ ] **Step 2: 실패 확인** — `node --test tests/node/tui-app.test.mjs`; U-a~U-d FAIL, 기존 PASS
- [ ] **Step 3: 구현**
- [ ] **Step 4: manifest 재생성 및 통과 확인** — `node scripts/update-manifest.mjs` 실행 후 `node --test tests/node/tui-app.test.mjs` (다른 tui 테스트가 `execute` 경로를 쓰면 `node --test tests/node/tui-*.test.mjs`) 전부 PASS
- [ ] **Step 5: 수용 후 커밋** (Orchestrator) — 예: `feat(tui): offer force finish and one retry for blocked install updates`

**수용 기준:** U-a~U-d와 `tests/node/tui-app.test.mjs` 통과; `kind`가 composite/switch가 아니거나 `blockingDispatches`가 없으면 기존 동작 동일; 재시도 최대 1회; skipped/residual/throw 시 재시도 없음; CLI 파일·watch import 변경 없음; 전체 suite 새 실패 없음.

**필수 체크:** fresh QA — 위 테스트 결과, `git diff --stat`이 allowedPaths 3개 파일로 한정, 화면 문구가 설계와 일치.

---

## 최종 검증 (모든 태스크 수용 후 1회)
- Orchestrator가 저장소 전체 suite를 실행해 baseline 실패 외 새 실패가 없는지 확인합니다.
- 독립 Reviewer 1회가 전체 변경(`f433c75..HEAD`)을 검토합니다. 중점: lock 순서와 해제, 재읽기 비교의 race, claims shape, 재시도 시 재 prepare 경로(같은 요청 사용)와 스냅샷 검사 유지, 메시지와 `activeDispatches` 불변, 신호 미사용.
- Reviewer 지적은 Implementer → Reviewer 재확인으로 해결하고, 후속 커밋 1개로 마무리합니다.
- 기능 완료 후 사용자가 TUI로 기존 5개 lease를 정리합니다(plan 범위 밖, 수동 정리 없음).

## 진행 기록
| Task | 상태 | Implementer | QA | 커밋 |
|---|---|---|---|---|
| T1 | 수용 | 3deadbf0 (c444b8aa 중단 후 v3로 교체) | 2aad1518: T-a~T-f, Q1-Q3, Q5-Q6 proven; Q4 lock 해제 실패 throw는 정적 확인만(최종 Reviewer 중점) | 이 커밋 |
| T2 | 대기 | - | - | - |

## Revision history
| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-17 (user message "plan 승인, 진행해줘") | initial | T1, T2 | 최초 승인 |
| v2 | 2026-11-17 (user selection "승인 (Recommended)") | mechanical | T1, T2 | MANIFEST.sha256이 수정 대상 lib 파일 해시를 포함하므로 allowedPaths에 추가하고 Step 4에 manifest 재생성 추가 |
| v3 | 2026-11-17 (user selection "승인 (Recommended)") | contract | T1, T2 | 같은 prepared 재사용이 assertPlanSnapshot에서 거부되므로 재시도는 같은 요청으로 prepareOperation을 다시 호출 |
