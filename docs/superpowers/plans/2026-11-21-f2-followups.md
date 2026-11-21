# F2 후속 과제 구현 계획 (reviewer 검증 주체, final-plan-recheck, bridge 잔여 프로세스, JSDoc)

- 상태: plan v6(v1 사용자 승인(2026-11-21T11:54:55+09:00). 열린 질문 Q1–Q7은 Orchestrator가 정했다(아래 "Orchestrator 결정"). v2는 Q1 결정과 어긋난 잔여 문구 정정이다. v3는 실제 ps 검증 절차 추가다(사용자 결정). v4는 T3 QA finding에 따른 신호 대상 판정 강화다. v5는 T4 추적 조건(계보 전용)과 `descendants.json` 형식 확정이다. v6는 T4 QA finding 5건 보강이다.)
- 승인 spec: `docs/superpowers/specs/2026-11-21-f2-followups-design.md` (sha256 `5182babdee09e43fff6879a23b2d06abb2b54a0d7e04e781f44c73ec517e5c18`)
- 구현 위치: branch `fix/bridge-fetch-tolerance`, managed worktree `.claude/worktrees/bridge-fetch-tolerance`
- approved base
  - 코드 기준: `690e9aa4`
  - spec과 plan은 그 위의 문서 커밋 하나에 들어간다. 이 커밋은 문서만 바꾸므로 코드는 `690e9aa4`와 같다.
  - 실제 커밋 SHA는 canonical handoff record에 적는다.
- 깊이: Architectural
  - T4가 high-risk다. 프로세스를 종료하고, 네 플랫폼이 공유하는 supervisor를 바꾼다. 그래서 작업 전체를 significant로 본다.
  - task마다 fresh QA → Orchestrator 수락 → 집중 커밋 1개 순서로 진행한다.
  - 모든 task를 수락한 뒤 최종 Reviewer가 1회 검토한다.
- handoff 기록 위치: `<git-common-dir>/arc/handoff/f2-followups/`

## 승인 설계 요약
- **과제 1**
  - `reviewer.review-steps`의 "QA owns functional/test verification; …"를 "QA owns task functional/test verification; Orchestrator runs final verification and owns overall completion and acceptance."로 바꾼다.
- **과제 3 (D1(b))**
  - `review.final-plan-recheck` rule의 "Separate QA findings follow Implementer → QA."를 spec 문장으로 바꾼다.
  - `reviewer.final-plan-findings` 끝에 문장 하나를 붙인다.
  - `planner.final-plan-recheck`와 `verification.md`의 비관리 문단은 바꾸지 않는다.
- **과제 6**
  - `detectViolations` JSDoc의 괄호 문장을 spec 문장으로 바꾼다. 주석만 바꾼다.
- **과제 5(b)**
  - `createRoutingFixture`의 정리 hook 하나에서 다음 순서로 처리한다.
    1. 실제 ps로 base 경로가 든 프로세스와 `.pids`에 기록된 pid를 찾는다.
    2. lstart를 다시 대조한다.
    3. SIGTERM, grace, SIGKILL 순으로 보낸다.
    4. chmod와 rm을 한다.
- **과제 5(a): A + D + E**
  - A: 계보 샘플링(`descendantSampleMs` 1000, 상한 256)
  - D: `descendants.json`에 기록하고, supervisor가 없을 때 명시적 cancel에서 정리한다.
  - E: signal handler(SIGTERM, SIGINT, SIGHUP)
  - D4(a): 자동 종료는 supervisor가 끝날 때만 한다. lost 판정만으로는 종료하지 않는다.
  - D5(a): `escapedDescendants`는 기록만 한다.

## 코드 확인 사실 (plan 근거)
- **runtime hash 입력**
  - `tests/node/runtime-versions.test.mjs:20-36`의 `expectedModules`에 다음이 들어 있다.
    - `role-observe.mjs`
    - `role-supervisor.mjs`
    - `role-bridge.mjs`
    - `role-dispatch-policy.mjs`
    - `local-cli.mjs`
  - `role-policy.json`은 runtime hash 입력이 아니다. `policyHash`로 따로 계산된다(`lib/runtime/bootstrap.mjs:21`).
  - 따라서 T1은 `baselineHash`를 바꾸지 않는다. T2와 T4는 바꾼다.
- **`review.final-plan-recheck`가 생성되는 곳**
  - 생성 대상은 `POLICY_TARGETS`(`lib/policy/render.mjs:33-37`)다. 이 rule은 다음 두 경로로 들어간다.
    - rule의 `roles`가 specialist 5역할을 모두 포함한다(`role-policy.json:365-373`). 그래서 플랫폼별 `agents/arc-*.{md,toml}` 5개에 들어간다.
    - projection `planning`, `handoff`, `verification`이 이 rule을 포함한다(`lib/policy/placement.mjs:2,6,7,9`). 그래서 `skill/references/{planning,handoff,verification}.md`에 들어간다.
  - 합계는 4 플랫폼 × 8 = 32개 파일이다.
  - `SKILL.md`(core), `coordination.md`, `handoff-prep.md`, `commit.md`에는 들어가지 않는다.
- **MANIFEST**
  - `lib/runtime/*`, `shared/skill/runtime/*`, `lib/policy/role-policy.json`을 포함한다(`MANIFEST.sha256:139,169,172,264,265,268`).
  - `tests/`는 포함하지 않는다. 그래서 T3는 MANIFEST를 바꾸지 않는다.
- **installed golden**
  - `tests/node/fixtures/installed-layout-golden.json`에 `role-observe`, `role-supervisor`, `role-policy`, `arc-reviewer` 항목이 있다(grep 56건).
- **ps stub**
  - stub은 `tests/fixtures/bin/ps`이고, `-o lstart= -p <pid>`만 지원한다. 다른 인자에는 exit 2를 낸다(1-6행). 시작 시각으로는 `stub <pid>`를 출력한다(13행).
  - `createRoutingFixture`는 다음 두 가지로 stub을 쓰게 만든다.
    - `installPsStub()`(`role-fixtures.mjs:42`, `ps-stub.mjs:24-28`)이 테스트 프로세스의 `process.env.PATH` 앞에 stub을 넣는다.
    - fixture env의 PATH도 stub으로 시작한다(`role-fixtures.mjs:76`).
  - 실제 ps는 `realPs()`(`ps-stub.mjs:30-32`, `ORIGINAL_PATH`)로 부르고, 쓸 수 있는지는 `psAvailable()`로 확인한다.
  - `role-bridge-run.test.mjs:20,27-40`에는 이미 다음이 있다.
    - 파일 단위 잔여 검사: `realPs(['-axo','pid=,command='])`
    - `pkill -f base` 정리
- **in-process supervisor 테스트 주입점**
  - `runSupervisor(options)`는 `signalGroup`, `afterSpawn`, `timeoutMs`, `graceMs`, `heartbeatMs`를 주입받는다(`role-supervisor.mjs:234,311`, `role-bridge-run.test.mjs:309,683-684,733`).
- **가짜 CLI 세 종류**
  - codex·claude: `FAKE_SOURCE`(`role-fixtures.mjs:126-160`)
  - gemini: `tests/node/fixtures/gemini/fake-gemini.mjs`. env로 hang을 지정한다(32-34행).
  - grok: `tests/node/fixtures/grok/fake-grok.mjs`. scenario `hang`(23-25행)
  - gemini·grok fixture는 각 테스트 파일의 `fixture()`에 있고, 정리는 rm뿐이다(`gemini-bridge.test.mjs:87-89`, `grok-bridge.test.mjs:75`).
  - gemini fixture env의 PATH는 `bin`, node, `/usr/bin`, `/bin`이다. stub이 없으므로 실제 ps를 쓴다(`gemini-bridge.test.mjs:120`).
- **dispatch artifact 위치**
  - `artifactDirectory(target, workflowId, dispatchId)`는 `gitCommonDir` 기준이다(`role-supervisor.mjs:93`). 그래서 같은 repo의 모든 worktree에서 같은 경로로 풀린다.
  - resume은 `segmentDirectory`를 쓴다(95행).
  - cancel은 `context`를 가지므로 `resolveWorktree(context.cwd)`로 이 경로를 다시 계산할 수 있다(`role-bridge.mjs:55-56`과 같은 패턴).
- **cancel 경로**
  - supervisor가 살아 있으면 marker를 남기고 group에 SIGTERM을 보낸다(`role-bridge.mjs:216-220`).
  - supervisor가 없을 때의 직접 경로는 다음과 같다.
    - 222행: child가 살아 있으면 SIGTERM을 보낸다.
    - 223행: child와 group이 모두 없으면 `identified:false`로 둔다.
    - 230-235행: grace를 두고 SIGKILL을 보낸다.
    - 236-250행: `cancelled`로 기록한다.
- **`DEFAULT_POLICY`**
  - `role-dispatch-policy.mjs:47-62`에 있고 frozen이다.
  - 키 목록을 고정하는 테스트는 없다(grep 0건).

## Global Constraints
- **범위**
  - task별 allowedPaths만 바꾼다.
  - 다음은 바꾸지 않는다.
    - `lib/policy/render.mjs`, `placement.mjs`
    - `scripts/*`
    - upstream 사본
    - `tests/installer-parity.json`
    - `tests/fixtures/bin/ps`(stub)
    - `protected` fixture
    - `agentProfileBaseline.revision`
- **protected fixture**
  - 기준선에서 38개 중 21개가 이미 낡아 있다. 이를 검사하는 테스트(`profile models, permissions, canonical policy and CLI/runtime bytes are preserved`)는 기준선 실패다.
  - 갱신하지 않고, 결과는 테스트 이름 단위로만 비교한다.
- **SHA 갱신 규칙**
  - 기준선에서 통과하던 SHA 테스트가 이번 변경 때문에 실패할 때만 기대값을 갱신한다.
  - 기준선에서 이미 실패하던 SHA는 갱신하지 않는다.
- **생성물 재생성 순서**
  - 각 task의 원천을 바꾼 뒤 아래 순서로 실행하고, task마다 그 task의 diff로 한정되는지 확인한다.
    1. `node scripts/update-role-policy.mjs` (T1만)
    2. `node scripts/update-runtime-assets.mjs`
    3. `node tests/node/fixtures/installed-layout.mjs --write`
    4. `node scripts/update-manifest.mjs`
  - 생성물을 공유하므로 T1 → T2 → T3 → T4 순서는 바꾸지 않는다.
- **플랫폼 대칭**
  - 원천은 하나다(fragment, policy, supervisor).
  - T4 테스트는 네 플랫폼 가짜 CLI에 같은 env 이름의 탈출 시나리오를 넣어 검증한다.
- **실제 프로세스를 쓰는 테스트**
  - 프로세스를 띄우는 모든 새 테스트는 다음 두 가지를 반드시 둔다.
    - 자기 `t.after` 정리 hook
    - 파일 단위 잔여 검사. `realPs`를 쓰고, `psAvailable()`이 거짓이면 그 이유를 출력하고 건너뛴다.
  - 실제 ps가 필요한 단언도 `psAvailable()`이 거짓이면 `t.skip(REAL_PS_SKIP 문구)`로 건너뛰고, 그 사실을 결과에 남긴다.
- **실제 ps 검증 절차 (v3, 사용자 결정 2026-11-21):** Codex bridge sandbox에서는 실제 `ps`가 실행되지 않는다(`psAvailable()` 거짓, `realPs` status `null`). 그래서 실제 ps가 필요한 T3·T4 테스트는 다음 절차로 증거를 만든다.
  1. Implementer 1단계: 테스트만 작성한다(구현 전). 주입 ps로 돌아가는 단위 테스트는 Implementer가 RED를 관찰한다.
  2. Orchestrator: 실제 ps가 되는 자기 세션에서 새 테스트 파일을 백그라운드로 실행해 RED를 기록한다.
  3. Implementer 2단계(같은 dispatch resume): 구현하고 bridge에서 실행 가능한 관련 테스트를 돌린다.
  4. Orchestrator: 새 테스트와 task 관련 테스트 전체를 실제 ps 환경에서 실행해 GREEN, 기준선 대비 새 실패, 실행 전후 잔여 프로세스를 기록한다. 로그는 handoff `f2-followups/` 아래 `t3-*`, `t4-*`.
  5. fresh QA: 코드를 독립 검토하고, bridge에서 실행 가능한 테스트를 다시 돌리고, Orchestrator 로그를 검토한다. 실제 ps 테스트를 QA가 직접 재실행하지 못한 사실은 한계로 기록한다.
- **커밋:** task마다 Orchestrator가 하나씩 만든다. 형식은 `type(scope): 한국어 설명`이다.

### Implementer·QA 브리프 환경 규칙
- heredoc, 임시 스크립트 파일, 프로세스 치환은 쓰지 않는다. `node --input-type=module -e "…"` 형태의 한 줄 명령은 쓸 수 있다.
- Git 조회에는 `git --no-optional-locks`를 붙인다. `.git`을 바꾸는 명령은 쓰지 않는다.
- 실행 형식
  - node: `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec <files>`
  - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v <files>`
- `build/native`는 이미 있다. 지우거나 다시 빌드하지 않는다.
- allowedPaths 밖의 파일이 필요해지면 멈추고 보고한다.
- 관련 테스트 선택은 브리프 목록이 최소 범위다. 세 범주에 해당하는 항목만 이유를 적어 추가할 수 있다.
  - (a) 수정한 모듈을 직접 다루는 테스트
  - (b) 수정 때문에 갱신이 필요해진 계약 테스트
  - (c) 해당 check 스크립트
- 간헐 실패가 의심될 때 단독 재실행 상한은 3회다.
- 테스트 중 남은 프로세스를 발견하면 정리하기 전에 pid와 command를 기록하고 보고한다. 자동으로 다시 실행하지 않는다.

## 기준선 (구현 시작 전, Orchestrator)
- **revision:** approved base 문서 커밋에서 HEAD 일치와 clean working tree를 확인한다.
- **선행 조건**
  - `build/native`가 있는지 확인한다.
  - node·python3 버전, `PYTHONDONTWRITEBYTECODE=1`, cwd(worktree 루트)를 기록한다.
  - 실제 `ps` 가용성(`psAvailable()`과 같은 조건)을 기록한다.
  - 기준선 실행 전에 남은 fixture 프로세스가 있는지 확인한다. 명령은 `ps -axo pid=,command=`에서 `arc-route-`, `arc-gemini-`, `arc-grok-` 경로를 찾는 것이다. 결과는 기록만 하고 정리하지 않는다. 정리가 필요하면 Orchestrator가 사용자에게 보고한다.
- **명령** (각 결과를 테스트 이름 단위로 기록한다)
  1. 전체 node suite: `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/*.test.mjs`
  2. 전체 Python suite: `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p 'test_*.py' -v`
  3. check 스크립트
     - `npm run check:manifest`
     - `npm run check:role-policy`
     - `node scripts/check-installer-parity.mjs`
     - `node scripts/update-runtime-assets.mjs --check`
  4. 기준선 실행이 끝난 뒤 남은 fixture 프로세스를 1과 같은 방법으로 확인하고 기록한다. T3 효과와 비교할 기준이 된다.
- **기록 위치:** `<git-common-dir>/arc/handoff/f2-followups/`. 실패 이름 목록은 `baseline-fail.txt`에 둔다.
- **baseline-incomplete**
  - 테스트 이름 없이 파일 단위로 실패한 파일은 baseline-incomplete로 표시한다.
  - 처리 방법은 둘 중 하나다. 선행 조건을 갖춰 다시 기록하거나, 그 파일의 현재 실패를 새 실패 후보로 보고 하나씩 확인한다.
  - 어느 경우든 기준선 실패로 흡수하지 않는다.
- **알려진 기준선 실패:** F1 최종 기록 기준으로 node 3270건 중 35건, Python FAIL/ERROR 553건이다. `protected` 테스트와 `plan.test.mjs` rendering baseline 8건이 포함된다. 이번 기록에서 다시 확인한다.
- 기준선 기록이 끝나기 전에는 dependent task를 시작하지 않는다.

## 전체 회귀 예비 판정 (Planner)
- **(1) 공용 모듈: 해당**
  - `lib/prompts/agent-fragments.json`: 네 플랫폼 20개 프로필 target의 생성 원천이다.
  - `lib/policy/role-policy.json`: 네 플랫폼 32개 managed 섹션의 원천이다. runtime도 읽는다(`bootstrap.mjs:19`, `role-routing.mjs:102`).
  - `role-observe.mjs`, `role-supervisor.mjs`, `role-bridge.mjs`, `role-dispatch-policy.mjs`: 네 플랫폼 bridge 경로가 공유하는 runtime이다.
  - `tests/node/role-fixtures.mjs`: 20개 넘는 테스트 파일이 import한다.
- **(2) 통합: 해당 예정 없음.** base 이후 merge, rebase, cherry-pick 계획이 없다.
- **(3) 의존성·설정: 해당 없음.** fixture helper 변경은 테스트 설정 변경이 아니다. 새 테스트 파일은 기존 glob에 자동으로 포함된다.
- **(4) 공개 인터페이스: 해당 없음.** export 추가와 선택적 option 추가만 있고, 삭제·이름 변경·시그니처 변경은 없다.
- **예비 결론:** (1)에 해당하므로 실행한다. 최종 판정은 Orchestrator가 실제 diff `690e9aa4..HEAD`와 이력을 보고 내린다.

## 검토 초점 (최종 Reviewer)
- managed rule, `reviewer.final-plan-findings`, `verification.md` Final verification 문단 세 곳이 서로 모순되지 않는가(AC3-5).
- JSDoc이 `observeHeadAdvance` 610-615행, `detectViolations` 656-663행과 맞는가(AC6-1).
- 자손 정리 안전 장치 1-5가 코드에 모두 있는가. 특히 다음을 본다.
  - `(pid, lstart)`를 신호 직전에 같은 출처로 다시 대조하는가
  - supervisor 자신과 그 조상을 제외하는가
  - 상한
  - `spawnSync`를 쓰지 않는가
- D4(a)를 지키는가. lost 판정만으로 종료하는 경로가 없어야 한다.
- D5(a)를 지키는가. `survived`가 state를 바꾸지 않아야 한다.
- fixture 정리 hook이 base 경로와 `.pids` 밖의 프로세스에 신호를 보내지 않는가.
- 기존 group 정리(234-247, 429-432, 513행)의 의미와 record 필드가 그대로인가.

---

### T1: reviewer fragment와 final-plan-recheck 문구 (과제 1, 3)

**목표:** fragment 두 곳과 policy rule 한 곳의 문구를 spec대로 바꾸고, 생성물과 해시를 갱신한다.

**선행:** 기준선 기록 완료.

**allowedPaths**
- `lib/prompts/agent-fragments.json`
- `lib/policy/role-policy.json`
- `shared/skill/runtime/role-policy.json` (update-runtime-assets가 생성)
- role-policy managed 섹션 32개
  - `{claude,codex,gemini,grok}/agents/arc-{scouter,planner,implementer,qa,reviewer}.{md|toml}`. codex만 `.toml`이다.
  - `{claude,codex,gemini,grok}/skill/references/{planning,handoff,verification}.md`
- `tests/node/fixtures/instruction-contracts.json`: `agentProfileBaseline.profiles`만(20개 모두 갱신 대상, Q1 결정)
- `tests/node/test-scope-contract.test.mjs` (F1 계약 테스트에 단언 추가)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**단계** (문서·데이터 변경 예외 + 구조 계약 RED. 행동 TDD라고 주장하지 않는다.)
- [ ] **T1-0 선행 조사(편집 전):** `tests/` 전체에서 다음 문자열을 단언하는 곳이 있는지 grep으로 확인하고 보고한다.
  - 바뀌는 문장 조각: `Separate QA findings follow`, `QA owns functional/test verification`, `before this final stage`
  - 대상 파일: `tests/test_arc_policy.py:428,1412`, `tests/test_harness_contract.py:722`. 둘 다 `role-policy.json` rules를 읽는다.
  - 단언하는 곳이 있으면 관련 테스트 (b)에 이유와 함께 추가한다.
- [ ] **T1-1 계약 단언 추가:** `test-scope-contract.test.mjs`에 다음을 추가한다.
  - **policy rule**
    - `lib/policy/role-policy.json`의 `review.final-plan-recheck` text에 spec 새 문장이 정확히 1회 있다.
    - `Separate QA findings follow Implementer → QA.`가 없다.
    - `id`, `roles`, `effect`, `controls`가 기준선 값과 같다.
  - **렌더한 reviewer ×4**
    - 렌더 방법은 `renderAgentProfile`이다(`agent-fragments.test.mjs:32` 패턴).
    - 과제 1의 새 문장과 과제 3의 fragment 추가 문장이 각각 정확히 1회 있다.
    - 옛 문장 `QA owns functional/test verification`이 없다.
  - **managed 섹션 32개:** 각 파일에 새 rule 문장이 정확히 1회 있다.
- [ ] **T1-2 RED 관찰:** 추가한 단언이 실패하는지 확인하고 기록한다.
- [ ] **T1-3 fragment 수정** (`agent-fragments.json`)
  - 90행 `reviewer.review-steps`: `QA owns functional/test verification; Orchestrator owns overall completion and acceptance.`를 `QA owns task functional/test verification; Orchestrator runs final verification and owns overall completion and acceptance.`로 바꾼다.
  - 94행 `reviewer.final-plan-findings`: text 끝에 ` New failures from final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck.`를 붙인다.
  - fragment ID, 개수(26), 순서, target별 개수는 그대로 둔다.
- [ ] **T1-4 policy 수정** (`role-policy.json` `review.final-plan-recheck` text)
  - 바꿀 문장: `Separate QA findings follow Implementer → QA.`
  - 새 문장: `Separate QA findings and new failures from final verification, which may run concurrently with the final Reviewer, follow Implementer → QA; Reviewer evidence for affected files then needs a refreshed-diff recheck.`
  - text의 다른 문장과 다른 필드는 그대로 둔다.
- [ ] **T1-5 생성물 갱신**
  1. `node scripts/update-role-policy.mjs`를 실행한다. 변경 파일이 위 32개로 한정되는지 `git --no-optional-locks diff --stat`으로 확인한다.
  2. `node scripts/update-runtime-assets.mjs`를 실행한다. `shared/skill/runtime/role-policy.json`만 바뀌어야 한다.
- [ ] **T1-6 GREEN 확인**
- [ ] **T1-7 hash fixture 갱신**
  - 아래 명령의 출력으로 `profiles` 값을 교체한다(Q1 결정). agents 원본 20개 모두에 `review.final-plan-recheck` managed 섹션이 들어 있으므로(Orchestrator가 grep으로 확인, 20개), T1-5 뒤에는 20개 해시가 모두 바뀌는 것이 예상 결과다.

    `node --input-type=module -e "import fs from 'node:fs';import {createHash} from 'node:crypto';import {renderAgentProfile} from './lib/prompts/render.mjs';const r=JSON.parse(fs.readFileSync('lib/prompts/agent-fragments.json'));for(const t of r.targets)console.log(t.path,createHash('sha256').update(renderAgentProfile(t.path,fs.readFileSync(t.path),r)).digest('hex'))"`

  - `protected`와 `revision`은 바꾸지 않는다.
  - reviewer 외 16개 프로필은 managed policy 섹션 밖의 바이트가 바뀌지 않았음을 `git --no-optional-locks diff`로 확인하고 보고한다. 그래야 fragment 변경이 reviewer 4개에만 적용됐다는 AC1-2(개정)가 성립한다.
  - 기준선에서 통과하던 해시만 갱신한다(SHA 갱신 규칙).
- [ ] **T1-8:**
  1. `node tests/node/fixtures/installed-layout.mjs --write`를 실행한다. golden diff가 이 task에서 바꾼 파일의 설치 사본으로 한정되는지 확인한다.
  2. `node scripts/update-manifest.mjs`를 실행한다.

**AC 매핑**

| AC | 확인 방법 |
|---|---|
| AC1-1 | T1-1 단언 |
| AC1-2(개정) | T1-1의 렌더 단언(새 fragment 문장은 reviewer 4개에만 존재)과 T1-7의 16개 프로필 diff가 managed 섹션 안에 한정되는지 확인 |
| AC1-3 | `agent-fragments.test.mjs:26-28` |
| AC3-1 | T1-1 단언 |
| AC3-2 | `npm run check:role-policy` |
| AC3-3 | `node scripts/update-runtime-assets.mjs --check`와 바이트 비교 |
| AC3-4 | T1-1 단언 |
| AC3-5 | 최종 Reviewer |

**관련 테스트와 선택 이유**
- **(a) 직접 대상**
  - `tests/node/agent-fragments.test.mjs`: fragment 개수와 render hash
  - `tests/node/role-policy.test.mjs`: policy 생성과 배치
  - `tests/node/test-scope-contract.test.mjs`: 새 단언
  - `tests/test_arc_policy.py`, `tests/test_harness_contract.py`: `role-policy.json` rules를 읽고, codex profile을 단언한다.
- **(b) 갱신이 필요해진 계약**
  - `tests/node/instruction-layout.test.mjs`: managed 섹션 배치, protected(기준선 실패)
  - `tests/node/installed-layout-golden.test.mjs`
  - `tests/node/manifest.test.mjs`: stale policy, 88-92행
  - `tests/node/parity-check.test.mjs`: policy를 읽는다(44행).
  - `tests/node/instruction-language.test.mjs`: `role-policy.json`을 목록으로 읽는다(43행).
  - `tests/node/runtime-assets.test.mjs`: shared 사본
- **(c) check 스크립트**
  - `npm run check:manifest`
  - `npm run check:role-policy`
  - `node scripts/check-installer-parity.mjs`
  - `node scripts/update-runtime-assets.mjs --check`
- **명령**
  - `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/{agent-fragments,role-policy,test-scope-contract,instruction-layout,installed-layout-golden,manifest,parity-check,instruction-language,runtime-assets}.test.mjs`
  - `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v tests/test_arc_policy.py tests/test_harness_contract.py`

**QA(fresh)**
- 위 관련 테스트와 check 스크립트를 실행하고, 결과를 기준선과 테스트 이름 단위로 비교한다.
- 네 플랫폼에서 생성된 문구가 같은지 확인한다.
- 생성물 diff가 allowedPaths 안에만 있는지 확인한다.

**보류 조건**
- 기준선 기록이 끝나지 않았다.
- `contracts[].text`, `protected`, `render.mjs`, `placement.mjs`를 바꿔야만 통과한다.
- golden diff에 이 task 밖 파일이 섞였다.
- reviewer 외 프로필에서 managed policy 섹션 밖의 바이트가 바뀌었다.

---

### T2: `detectViolations` JSDoc (과제 6)

**목표:** 주석만 실제 동작에 맞추고, runtime hash 관련 생성물을 갱신한다.

**선행:** T1 수락·커밋. 생성물(golden, MANIFEST)을 순서대로 다시 만들기 위해서다.

**allowedPaths**
- `lib/runtime/role-observe.mjs` (627-629행 주석만)
- `shared/skill/runtime/role-observe.mjs`
- `tests/node/runtime-versions.test.mjs` (11행 `baselineHash`만)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`

**단계** (주석 변경 예외. 행동이 바뀌지 않으므로 RED 테스트는 없다. 대신 hash 계약이 RED가 된다.)
- [ ] **T2-1:** 627-629행의 괄호 문장 `Implementer and QA may change only allowedPaths (QA may change no paths when the list is empty or missing).`를 spec 문장으로 바꾼다. JSDoc 줄 바꿈 형식(` * `)을 지킨다.
- [ ] **T2-2 RED 관찰:** `runtime-versions.test.mjs`가 `baselineHash` 불일치로 실패하는지 확인하고 기록한다.
- [ ] **T2-3 생성물 갱신**
  1. `node scripts/update-runtime-assets.mjs`
  2. 새 hash 확인: `node --input-type=module -e "const a=await import('./lib/runtime/bootstrap.mjs');console.log((await a.cooperativeVersions()).runtimeHash)"`. 이 값으로 `baselineHash`를 교체한다. `historicalRuntimeHash`, `previousRuntimeHash`, `cooperative-9`은 바꾸지 않는다.
  3. `installed-layout.mjs --write`
  4. `update-manifest.mjs`
- [ ] **T2-4 주석 한정 확인:** `git --no-optional-locks diff -U0 -- lib/runtime/role-observe.mjs`의 모든 `+`/`-` 줄이 ` *`로 시작하는지 확인한다.

**AC 매핑**

| AC | 확인 방법 |
|---|---|
| AC6-1 | 최종 Reviewer가 610-615, 656-663행과 대조한다. |
| AC6-2 | T2-4와 관련 테스트 통과 |

**관련 테스트와 선택 이유**
- **(a)** `tests/node/role-observe.test.mjs`: 변경 모듈. 동작이 그대로인지 본다.
- **(b)**
  - `tests/node/runtime-versions.test.mjs`
  - `tests/node/runtime-assets.test.mjs`
  - `tests/node/installed-layout-golden.test.mjs`
  - `tests/node/manifest.test.mjs`
- **(c)** `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`
- **명령:** `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/{role-observe,runtime-versions,runtime-assets,installed-layout-golden,manifest}.test.mjs`

**QA(fresh):** 위 테스트와 check를 기준선과 이름 단위로 비교하고, 주석 한정 diff를 확인한다.

**보류 조건**
- T1이 수락되지 않았다.
- 주석 밖의 바이트가 바뀌었다.
- golden diff에 role-observe 사본 외 항목이 섞였다.

---

### T3: 테스트 fixture 프로세스 정리 (과제 5(b))

**목표:** `createRoutingFixture`를 쓰는 모든 테스트가 끝날 때 fixture가 띄운 supervisor, 가짜 CLI, grandchild가 남지 않게 한다. 대상 프로세스는 base 경로와 `.pids`로 식별한다.

**선행:** T2 수락·커밋. spec이 정한 순서다. 실제 의존은 없다.

**allowedPaths**
- `tests/node/role-fixtures.mjs`
- `tests/node/role-fixtures-cleanup.test.mjs` (신규)
- `tests/node/gemini-bridge.test.mjs`, `tests/node/grok-bridge.test.mjs`의 `fixture()` 정리 hook만(Q2 결정: `reapFixtureProcesses(base)`를 rm 앞에서 부른다)
- MANIFEST, golden, 해시는 바뀌지 않는다. `tests/`는 MANIFEST 대상이 아니다.

**설계 (구현 지침)**
- `role-fixtures.mjs`에 `export async function reapFixtureProcesses(base, {graceMs = 200, timeoutMs = 3000} = {})`를 둔다.
  1. **표 읽기:** `realPs(['-axo','pid=,pgid=,lstart=,command='])`로 표를 읽는다.
     - stub을 우회하는 기존 helper이고, `ORIGINAL_PATH`를 쓴다. spec의 "`/bin/ps` 절대 경로"를 대체한다(Q4).
     - lstart는 공백으로 나눈 5개 토큰이다(macOS·Linux 공통 형식). 그 뒤 나머지가 command다.
  2. **대상**
     - (i) command에 `base`가 들어간 프로세스
     - (ii) `<base>/bin/.pids`에 기록된 pid 중 표에 있고 command에 `base`가 들어간 것(v4: 숫자 pid만으로는 재사용된 pid를 구별할 수 없으므로 신호 대상 판정은 command의 base 포함으로만 한다. `.pids`는 조회 보조로만 쓴다)
     - 테스트 자신(`process.pid`)과 ps 자신은 제외한다.
  3. **신호**
     - 각 대상에 `process.kill(pid,'SIGTERM')`을 보낸다. `pgid===pid`이면 `process.kill(-pid,'SIGTERM')`도 보낸다.
     - `graceMs` 뒤 표를 다시 읽는다. `(pid, lstart)`가 같은 것에만 SIGKILL을 보낸다(group도 같은 방식).
     - `timeoutMs` 안에 사라지는지 폴링한다.
  4. **반환:** `{signalled, survived}`. 실패해도 throw하지 않는다.
  5. `psAvailable()`이 거짓이면 아무것도 하지 않고 `{skipped:true}`를 돌려준다.
- **hook 교체:** 45행 hook을 `t.after(async () => { await reapFixtureProcesses(base); spawnSync('chmod', ['-R','u+rwx',base]); await fs.rm(base, {recursive:true, force:true}); })`로 바꾼다. 종료를 먼저 하고 rm을 나중에 한다.
- **`.pids` 기록:** `FAKE_SOURCE` 시작부(127행 근처)에서 자기 pid를 `path.join(path.dirname(process.argv[1]),'.pids')`에 한 줄씩 append한다.
  - 기록 형식은 pid 숫자와 줄바꿈이다. lstart는 정리할 때 표에서 다시 읽는다.
  - grandchild(152행)는 `grandchildPidFile` 여부와 상관없이 같은 파일에 append한다. 기존 `grandchildPidFile` 동작은 유지한다.
  - v4: grandchild의 실행 인자에 base 경로 표시(예: 추가 argv)를 넣어 command에 base가 나타나게 한다. 그래야 (ii)의 base 포함 조건으로 식별된다.
  - `.pids`는 base 아래에 있으므로 rm으로 함께 지워진다.
- `role-bridge-run.test.mjs`의 기존 `pkill -f base`와 잔여 검사(27-40행)는 그대로 둔다. 중복이지만 해가 없고, 범위를 줄이기 위해서다.

**단계** (TDD)
- [ ] **T3-1 RED 테스트 작성:** `tests/node/role-fixtures-cleanup.test.mjs`
  - `psAvailable()`이 거짓이면 `REAL_PS_SKIP` 사유로 skip한다.
  - **AC5b-1 테스트**
    - 바깥 `test` 안의 subtest에서 `createRoutingFixture(sub)`와 `f.cli('codex', …)`를 만든다.
    - 다음 네 프로세스를 `spawn(path.join(f.binDir,'codex'), …, {detached:true, stdio:'ignore', env:f.env})`로 직접 띄운다. 이 방식이 supervisor child와 같은 독립 group을 모사한다.
      - hang 시나리오
      - grandchild 시나리오
      - ignoreSigterm + hang 시나리오
      - auth hang 시나리오(`login status`)
    - 추가로 `startSupervisor`로 detached supervisor 하나를 띄운다. 대상 dispatch는 존재하지 않는 id여도 된다. 목적은 base 경로가 든 command 하나를 만드는 것이다.
    - pid는 바깥 test의 목록에 모아 둔다.
    - subtest가 끝난 뒤(fixture hook 실행 후) 다음을 단언한다.
      - `realPs`로 본 command 중 base가 든 줄이 0개다.
      - 모은 pid가 모두 죽었다. 신호 0으로 확인하고 `ESRCH`이면 죽은 것이다.
  - **AC5b-2 테스트**
    - base와 무관한 미끼 프로세스(`node -e setInterval`, 일반 group)를 띄운다. `.pids`에는 넣지 않는다.
    - subtest 정리 뒤에도 살아 있는지 단언한다.
    - 바깥 test의 `t.after`에서 미끼를 SIGKILL한다.
  - **파일 단위 `test.after`:** 이 파일이 만든 base 목록의 잔여 프로세스가 0개인지 검사한다(`role-bridge-run.test.mjs:33-40` 패턴).
- [ ] **T3-2 RED 관찰:** hook이 rm만 하므로 AC5b-1 단언이 실패하는지 확인하고 기록한다. 바깥 test의 `t.after`가 남은 pid를 SIGKILL로 정리해 프로세스가 남지 않는지도 확인한다.
- [ ] **T3-3 구현:** 위 설계대로 구현한다.
- [ ] **T3-4 GREEN 확인:** 관련 테스트를 실행한다. 실행 후 `realPs(['-axo','pid=,command='])`로 `arc-route-` 잔여 프로세스가 0인지 확인하고 기록한다.

**AC 매핑**

| AC | 확인 방법 |
|---|---|
| AC5b-1 | T3-1 첫 테스트와 T3-4 잔여 확인 |
| AC5b-2 | T3-1 미끼 테스트 |

**관련 테스트와 선택 이유**
- **(a) 직접 대상**
  - `tests/node/role-fixtures-cleanup.test.mjs`
  - `role-fixtures.mjs`를 import하는 테스트 파일 중 프로세스를 띄우는 것: `role-bridge-run`, `role-bridge-resume`, `role-bridge-observe-wait`, `role-bridge-support`, `role-bridge-args`, `codex-auth-probe`, `host-gemini-grok`, `dispatch-lease-v2`, `role-routing-dispatch`, `role-routing-anchor`, `anchor-flip`
- **(b)** 없음. 계약 해시가 바뀌지 않는다.
- **(c)** 없음. MANIFEST 대상이 아니다.
- **제외와 그 이유**
  - `install-mode*`, `management-*`, `role-routing-install`도 fixture를 import한다.
  - 이들은 프로세스를 띄우지 않는 설치 경로이고, hook 순서 변경 외에는 영향이 없다. 그래서 최종 검증의 전체 회귀로 넘긴다.
  - QA가 이 판단을 다르게 보면 범주 (a)로 추가하고 이유를 적는다.
- **명령:** `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/{role-fixtures-cleanup,role-bridge-run,role-bridge-resume,role-bridge-observe-wait,role-bridge-support,role-bridge-args,codex-auth-probe,host-gemini-grok,dispatch-lease-v2,role-routing-dispatch,role-routing-anchor,anchor-flip}.test.mjs`
- **실행 후 확인:** 남은 fixture 프로세스를 확인하고, 기준선 4번 항목과 비교한다.

**QA(fresh)**
- 위 테스트를 실행하고 기준선과 이름 단위로 비교한다.
- 실행 후 남은 프로세스가 0인지 확인한다.
- 정리 hook이 신호를 보내는 대상이 base 경로와 `.pids`로 한정되는지 코드로 확인한다.

**보류 조건**
- T2가 수락되지 않았다.
- Orchestrator 세션에서도 실제 ps를 쓸 수 없다. 이때는 AC5b가 unverified이고 사용자에게 보고한다.
- 정리 대상에 base와 무관한 프로세스가 포함됐다.
- 기존 테스트의 실행 시간이 크게 늘었다. 비교 근거는 기준선 실행 시간이다. 이때는 graceMs 조정을 보고한다.

---

### T4: runtime 탈출 자손 추적과 정리 (과제 5(a), high-risk)

**목표**
- supervisor가 child의 탈출한 자손을 샘플링해 `descendants.json`에 기록한다.
- supervisor가 끝날 때, signal을 받았을 때, supervisor가 없는 상태에서 명시적 cancel을 할 때 `(pid, lstart)`를 대조해 정리한다.
- 네 플랫폼 공통 경로에 둔다.

**선행:** T3 수락·커밋. T3의 fixture 정리가 T4 테스트의 잔여 프로세스를 막는다. T2의 `baselineHash` 갱신 위에 다시 계산해야 한다.

**allowedPaths**
- `lib/runtime/role-supervisor.mjs`
- `lib/runtime/role-bridge.mjs` (cancel 직접 경로만)
- `lib/runtime/role-dispatch-policy.mjs`
- `shared/skill/runtime/{role-supervisor,role-bridge,role-dispatch-policy}.mjs`
- `tests/node/runtime-versions.test.mjs` (`baselineHash`만)
- `tests/node/fixtures/installed-layout-golden.json`
- `MANIFEST.sha256`
- 테스트 fixture: `tests/node/role-fixtures.mjs` (`FAKE_SOURCE`에 탈출 시나리오), `tests/node/fixtures/gemini/fake-gemini.mjs`, `tests/node/fixtures/grok/fake-grok.mjs`
- 신규 테스트: `tests/node/role-supervisor-descendants.test.mjs`
- 새 runtime 모듈은 만들지 않는다. spec은 "필요하면" 만들 수 있게 했지만, 만들면 inventory·`expectedModules`·`RUNTIME_MODULE_PATHS`에 등록해야 해서 위험이 커진다. 그래서 helper는 `role-supervisor.mjs`에서 export한다. `role-bridge.mjs`는 이미 이 모듈에서 import한다(9행).

**설계 (구현 지침)**
- **`role-dispatch-policy.mjs`**
  - `DESCENDANT_SAMPLE_MS = 1000`, `DESCENDANT_LIMIT = 256`을 export한다.
  - `DEFAULT_POLICY`(47-62행)에 `descendantSampleMs`, `descendantLimit`를 추가한다.
- **`role-supervisor.mjs` export**
  - `parseProcessTable(stdout)`
    - 각 줄을 `{pid, ppid, pgid, startTime}`으로 만든다.
    - lstart는 `processStartTime`과 같이 공백을 정규화한다(85행).
    - 형식이 깨진 줄은 버린다.
  - `sampleProcessTable({timeoutMs = 5000} = {})`
    - 비동기 `execFile('ps', ['-A','-o','pid=,ppid=,pgid=,lstart='])`로 실행한다. env는 `{PATH: process.env.PATH ?? '/usr/bin:/bin', LC_ALL:'C'}`로, 83행과 같은 규칙이다.
    - 실패하면 `null`을 돌려준다.
    - `spawnSync`는 쓰지 않는다.
  - `createDescendantTracker({rootPid, rootPgid, selfPid, limit})`
    - `update(table)`: 알려진 집합을 기준으로 fixpoint까지 반복해 추가한다. 추가 조건은 `ppid`가 알려진 pid(시작 시각 일치)인 것 하나뿐이다(v5: 계보 전용. `pgid === rootPgid`만으로는 편입하지 않는다. 같은 group 구성원은 기존 group 정리가 처리한다).
    - supervisor 자신(`selfPid`)과 `process.ppid` 조상 사슬은 제외한다.
    - 상한을 넘으면 `truncated`가 된다.
    - `escaped()`: `pgid !== rootPgid`이고 root가 아닌 항목
  - `reapDescendants(entries, {sample, kill = process.kill, graceMs, timeoutMs})`
    1. 직전에 sample한다.
    2. `(pid, startTime)`이 일치하는 항목에만 SIGTERM을 보낸다. 항목이 group leader이면 `-pid`에도 보낸다.
    3. grace 뒤 다시 sample한다. 일치하는 항목에만 SIGKILL을 보낸다.
    4. 마지막 sample로 `{observed, reaped, survived, truncated}`를 계산한다.
    - `EPERM`은 survived로 센다.
    - 대조는 같은 출처의 sample끼리만 한다. stub이 낸 `stub <pid>` 시작 시각과 섞지 않는다.
- **`runSupervisor` 추가 option**
  - option 목록
    - `descendantSampleMs`(기본 `policy.descendantSampleMs`)
    - `descendantLimit`
    - `sampleProcesses`(기본 `sampleProcessTable`, 테스트 주입점)
    - `killProcess`(기본 `process.kill`)
    - `stopSignal`(AbortSignal)
  - **샘플링 시작:** child 기록 직후(415-423행 뒤)에 시작한다.
    - 즉시 1회 sample한다.
    - 이후 `setInterval`을 `timers`에 넣는다. 이전 sample이 진행 중이면 건너뛴다.
    - 집합이 바뀌면 `descendants.json`(0600, tmp 파일에 쓰고 rename)을 `artifactDir`에 쓴다(Q3).
    - v5 형식: `{"version":1,"rootPid":<n>,"rootPgid":<n>,"truncated":<bool>,"entries":[{"pid":<n>,"ppid":<n>,"pgid":<n>,"startTime":"<lstart 정규화>"}]}`. `entries`는 root를 제외한 추적 자손 전부(같은 group 포함)다. cancel 경로는 이 중 `pgid !== rootPgid`인 escaped 항목만 정리한다. 형식이 맞지 않으면 무시한다.
    - v6 보강(T4 QA finding):
      - (F1) `descendants.json`에 `dispatchId`, `segment`, `rootStartTime`을 더한다. cancel은 이 값이 lease의 dispatchId, segment, `child.pid`와 일치할 때만 기록을 쓴다. 같은 uid 사용자가 파일을 변조하는 경우는 위협 모델 밖이다. 같은 uid는 어차피 직접 신호를 보낼 수 있기 때문이다. 이 판단은 한계로 기록한다.
      - (F2) group 신호(`kill(-pgid)`)는 직전 sample에서 그 pgid의 구성원이 모두 추적 중인 자손이고 identity가 일치할 때만 보낸다. 미추적 구성원, self, 조상, 다른 uid가 하나라도 있으면 개별 pid에만 보낸다.
      - (F3) `reapGroup`으로 원래 group이 사라진 것을 확인하면, 자손 정리를 시작하기 전에 원래 group용 SIGKILL 타이머를 해제한다. 원래 group 정리가 끝난 뒤에 signal handler가 호출되면 원래 pgid에 다시 신호를 보내지 않는다.
      - (F4) child 종료를 관찰했으면, 자손 정리를 시작하기 전에 실행 deadline 타이머를 해제한다. 자손 정리 시간 때문에 `timeout` reason이 붙으면 안 된다.
      - (F5) `lstart`는 1초 단위라서, 같은 초에 pid가 재사용되면 구별할 수 없다. 보강책으로 root를 sample할 때마다 `ppid === selfPid`인지와 `pgid === rootPgid`인지 확인하고, 하나라도 다르면 root로 취급하지 않는다. sample을 찍은 뒤 신호를 보내기까지의 짧은 구간에 대상이 바뀌는 경우와 같은 초 재사용은 남는 한계로 기록한다.
      - 기준선 `1ecf9cf9`부터 있던 문제가 하나 있다. 직접 cancel 경로가 원래 group에 SIGKILL을 보낼 때 pgid 재사용을 확인하지 않는다(`role-bridge.mjs:222-235`). 이 문제는 pre-existing으로 기록하고 이번 범위에서는 고치지 않는다.
  - **정상 종료 경로:** 432행 `reapGroup` 뒤, 433행 앞에 둔다.
    1. 최종 sample을 하고 `update`한다.
    2. escaped 항목에 `reapDescendants`를 실행한다.
    3. 결과를 record 필드 `escapedDescendants`에 넣는다(507행 writeRecord). 넣는 조건은 Q5를 따른다.
    4. 이 처리는 post-run snapshot(453행)보다 앞이다. 429행 주석의 의도와 같다.
    5. state 판정(483-504행)은 바꾸지 않는다(D5(a)).
  - **`exit.unobserved` 경로(441-449행), 예외 경로(509-524행):** best-effort로 같은 정리를 한다. 각 path의 기존 writeRecord에 필드를 더한다. state는 바꾸지 않는다.
  - **`stopSignal`**
    - abort되면 `terminate('supervisor_signal')`을 부른다(319-326행). 이후 흐름은 기존 경로를 그대로 탄다.
    - record의 `terminatedBy`는 `supervisor_signal`이다.
    - reason code는 기존 분류(`classifyFailure`)를 따른다. 새 code는 만들지 않는다(Q6).
  - **진입점(531-535행)**
    - `AbortController`를 만들고 `SIGTERM`, `SIGINT`, `SIGHUP`에 `process.once`로 handler를 건다. handler는 `controller.abort()`를 부른다.
    - `stopSignal`로 넘긴다.
- **`role-bridge.mjs` cancel 직접 경로(222-250행)**
  - 222행이나 223행에서 `direct`가 정해지고 group 대기 루프(231-235행)가 끝나면 다음을 한다.
    1. `resolveWorktree(context.cwd)`와 `segmentDirectory(target, lease.workflowId, dispatchId, lease.segment ?? 0)`로 경로를 계산한다.
    2. `descendants.json`을 읽는다. 파일이 없거나 형식이 틀리면 건너뛴다.
    3. `reapDescendants`를 실행한다.
  - `survived`는 cancel 결과를 바꾸지 않는다. 결과 view에 `escapedDescendants` 수치만 붙인다(Q7).
  - `markLostIfDue`(79-91행)와 supervisor가 살아 있는 경로(216-220행)는 바꾸지 않는다(D4(a)).
- **네 플랫폼 가짜 CLI 탈출 시나리오** (같은 env 이름을 쓴다)
  - 대상
    - `FAKE_SOURCE`(codex, claude)
    - `fake-gemini.mjs`
    - `fake-grok.mjs`
  - 동작: `ARC_FAKE_ESCAPE_PID_FILE`이 있으면 다음을 한다.
    1. `spawn(process.execPath, ['-e','setInterval(()=>{},1000)'], {detached:true, stdio:'ignore'}).unref()`로 손자를 띄운다.
    2. 손자 pid를 그 파일에 쓰고, T3의 `.pids`에도 append한다(FAKE_SOURCE만 해당).
    3. `ARC_FAKE_ESCAPE_RELEASE_FILE`이 있으면 그 파일이 생길 때까지 20 ms 간격으로 기다린 뒤 정상 이벤트를 출력하고 끝난다(`role-bridge-run.test.mjs:721` 패턴).
- **ps stub과의 관계**
  - stub(`tests/fixtures/bin/ps`)은 바꾸지 않는다.
  - in-process supervisor 테스트에서는 `process.env.PATH`가 stub으로 시작한다. 그래서 기본 `sampleProcessTable`은 stub의 exit 2로 실패하고 `null`이 된다. 이 경우 추적이 비활성화되므로 기존 테스트의 동작과 record는 그대로다(AC5a-5).
  - 새 테스트는 실제 ps가 필요할 때 다음 중 하나를 쓴다.
    - `withPath(ORIGINAL_PATH, …)`
    - `sampleProcesses` 주입. 내부에서 `realPs(['-A','-o','pid=,ppid=,pgid=,lstart='])`를 쓴다.
  - `psAvailable()`이 거짓이면 skip한다.
  - gemini·grok fixture env에는 stub이 없으므로 subprocess supervisor도 실제 ps를 쓴다.
  - `processStartTime`(stub 값)으로 기록되는 `lease.child.startTime`과 자손의 lstart는 서로 비교하지 않는다.

**단계** (TDD)
- [ ] **T4-0 선행 조사(편집 전)**
  - record 전체를 `deepEqual`로 단언하는 테스트가 있는지 확인한다. 검색어는 `recordOf`, `dispatchRecord`, `record.json`이다.
  - 대상 파일: `role-bridge-run`, `role-bridge-resume`, `gemini-bridge`, `grok-bridge`, `host-gemini-grok`
  - 결과에 따라 Q5(필드를 언제 넣을지)의 영향을 보고한다.
- [ ] **T4-1 단위 RED** (`role-supervisor-descendants.test.mjs`. 실제 프로세스를 쓰지 않고, 주입한 표와 kill을 쓴다)
  - `parseProcessTable`이 macOS·Linux 형식 예시와 깨진 줄을 처리한다.
  - tracker의 동작
    - ppid 사슬 fixpoint
    - `pgid===rootPgid` 포함
    - 부모가 죽어 ppid=1이 된 뒤에도 알려진 항목을 유지한다.
    - `selfPid`와 조상을 제외한다.
    - 상한 256에서 `truncated`
  - **AC5a-2:** `reapDescendants`는 다음 대상에 kill을 부르지 않는다. 주입한 `killProcess` 호출 기록으로 단언한다.
    - lstart가 바뀐 pid(재사용)
    - 자손이 아닌 pid
  - SIGTERM에 반응하지 않는 항목에는 grace 뒤 SIGKILL을 보낸다.
  - 집계 `{observed, reaped, survived, truncated}`가 맞다.
- [ ] **T4-2 통합 RED: 정상 종료 (AC5a-1, 네 플랫폼)**
  - `psAvailable()`이 거짓이면 skip한다.
  - 각 플랫폼 fixture를 쓴다.
    - codex·claude: `createRoutingFixture`
    - gemini: `gemini-bridge` 패턴. 새 파일 안에서 같은 구성을 쓰거나, 필요하면 해당 test 파일에 case를 추가한다(Q2와 함께 결정).
    - grok: `grok-bridge` 패턴
  - in-process `runSupervisor`에 `descendantSampleMs: 20`과 `sampleProcesses` wrapper를 주입한다. wrapper의 동작은 다음과 같다.
    1. `realPs` 표를 반환한다.
    2. 표에 탈출 손자 pid가 보이면 `ARC_FAKE_ESCAPE_RELEASE_FILE`을 만든다.
    - 이렇게 하면 "샘플된 뒤에야 leader가 끝난다"가 관찰로 보장되므로 타이밍에 기대지 않는다.
  - 단언
    - 손자가 죽었다.
    - `record.escapedDescendants.reaped >= 1`, `survived === 0`이다.
    - lease state가 기존 성공 시나리오와 같다.
  - 정리: 각 test의 `t.after`에서 손자 pid를 SIGKILL한다.
- [ ] **T4-3 통합 RED: signal (AC5a-3)**
  - `startSupervisor`로 실제 detached supervisor를 띄운다. fixture는 gemini 또는 grok 패턴이다. 이 fixture env에는 stub이 없어 subprocess가 실제 ps를 쓴다.
  - child는 hang과 탈출 시나리오를 같이 쓴다.
  - `descendants.json`에 손자 pid가 나타날 때까지 폴링한다. 상한은 10 s이고 기본 sampleMs는 1000이다. 시간이 아니라 관찰을 조건으로 쓰는 것이다.
  - 그다음 supervisor에 SIGTERM을 보낸다.
  - 단언
    - supervisor가 끝났다.
    - child group과 손자가 죽었다.
    - record에 `terminatedBy: 'supervisor_signal'`과 `escapedDescendants.reaped >= 1`이 있다.
- [ ] **T4-4 통합 RED: SIGKILL 뒤 lost와 cancel (AC5a-4)**
  - T4-3과 같이 준비한 뒤 supervisor에 SIGKILL을 보낸다.
  - `recordRoleObservation`을 작은 `supervisorLostMs` policy로 실행해 lease를 `unknown`으로 만든다. 이때 손자가 살아 있는지 단언한다(lost만으로는 종료하지 않음).
  - 이어서 `cancelRoleDispatch`를 실행하고 다음을 단언한다.
    - 손자와 child group이 죽었다.
    - lease가 `cancelled`다.
    - 결과에 `escapedDescendants`가 있다.
- [ ] **T4-5 D5 (AC5a-6)**
  - 주입한 `killProcess`가 아무것도 하지 않게 해서 `survived > 0`을 만든다.
  - 같은 시나리오에서 주입하지 않았을 때와 lease state, reasons가 같은지 단언한다.
- [ ] **T4-6 RED 관찰:** T4-1~T4-5가 실패하는지 확인하고 기록한다. export가 없거나 정리가 없어서 실패해야 한다.
- [ ] **T4-7 구현:** 위 설계대로 구현한다.
- [ ] **T4-8 GREEN 확인과 회귀 확인 (AC5a-5)**
  - 새 테스트와 기존 bridge 테스트가 통과한다.
  - 기존 테스트의 record와 state가 기준선과 같다.
- [ ] **T4-9 생성물 갱신**
  1. `update-runtime-assets`
  2. `baselineHash` 교체(T2-3의 명령)
  3. `installed-layout.mjs --write`
  4. `update-manifest`
  - golden diff가 세 runtime 사본으로 한정되는지 확인한다.
- [ ] **T4-10 잔여 확인:** 관련 테스트를 실행한 뒤 `arc-route-`, `arc-gemini-`, `arc-grok-` 잔여 프로세스가 0인지 확인하고 기록한다.

**AC 매핑**

| AC | 확인 방법 |
|---|---|
| AC5a-1 | T4-2 (네 플랫폼) |
| AC5a-2 | T4-1 |
| AC5a-3 | T4-3 |
| AC5a-4 | T4-4 |
| AC5a-5 | T4-8. 기존 bridge 테스트는 기준선과 이름 단위로 비교한다. |
| AC5a-6 | T4-5 |

**관련 테스트와 선택 이유**
- **(a) 직접 대상**
  - `role-supervisor-descendants`(신규)
  - `role-bridge-run`, `role-bridge-resume`, `role-bridge-observe-wait`: supervisor와 cancel
  - `gemini-bridge`, `grok-bridge`, `host-gemini-grok`, `dispatch-lease-v2`: 플랫폼별 supervisor 경로와 대칭
  - `role-fixtures-cleanup`: 가짜 CLI 변경이 정리에 미치는 영향
- **(b) 갱신이 필요해진 계약**
  - `runtime-versions`
  - `runtime-assets`
  - `installed-layout-golden`
  - `manifest`
- **(c) check 스크립트**
  - `npm run check:manifest`
  - `node scripts/update-runtime-assets.mjs --check`
  - `node scripts/check-installer-parity.mjs`: runtime 사본이 설치 대상이다.
- **명령:** `PYTHONDONTWRITEBYTECODE=1 node --test --test-reporter=spec tests/node/{role-supervisor-descendants,role-bridge-run,role-bridge-resume,role-bridge-observe-wait,gemini-bridge,grok-bridge,host-gemini-grok,dispatch-lease-v2,role-fixtures-cleanup,runtime-versions,runtime-assets,installed-layout-golden,manifest}.test.mjs`

**QA(fresh)**
- 위 테스트와 check를 실행하고 기준선과 이름 단위로 비교한다.
- 실제 ps를 쓸 수 없어 skip된 항목은 unverified로 보고한다.
- 실행 후 잔여 프로세스가 0인지 확인한다.
- 코드에서 안전 장치 1-5와 D4(a)·D5(a)를 지키는 위치를 행 번호로 보고한다.

**보류 조건**
- T3가 수락되지 않았다.
- Orchestrator 세션에서도 실제 ps를 쓸 수 없다. AC5a-1, -3, -4는 unverified이고 사용자에게 보고한다.
- 기존 record나 state가 기준선과 달라졌다. 특히 Q5 관련이다.
- 새 runtime 모듈, inventory, stub 변경이 필요해졌다.
- 테스트가 시간에 기대야만 결정적으로 돈다.
- 실행 후 잔여 프로세스가 남는다. pid와 command를 기록하고 보고한다.

---

## 최종 검증
모든 task를 수락한 뒤 한 번 실행한다. task의 선행 조건이 아니다.

- **실행 주체:** Orchestrator가 백그라운드 프로세스로 직접 실행한다. QA에 배정하지 않는다. 그동안 최종 Reviewer 배정 같은 독립 작업을 진행한다.
- **범위**
  1. **관련 테스트 합집합**
     - node: `agent-fragments`, `role-policy`, `test-scope-contract`, `instruction-layout`, `installed-layout-golden`, `manifest`, `parity-check`, `instruction-language`, `runtime-assets`, `role-observe`, `runtime-versions`, `role-fixtures-cleanup`, `role-bridge-run`, `role-bridge-resume`, `role-bridge-observe-wait`, `role-bridge-support`, `role-bridge-args`, `codex-auth-probe`, `host-gemini-grok`, `dispatch-lease-v2`, `role-routing-dispatch`, `role-routing-anchor`, `anchor-flip`, `gemini-bridge`, `grok-bridge`, `role-supervisor-descendants`
     - Python: `tests/test_arc_policy.py`, `tests/test_harness_contract.py`, 그리고 T1-0에서 추가된 항목
  2. **모든 계약 테스트:** `tests/node/`의 계약 테스트 전부
  3. **모든 check 스크립트**
     - `npm run check:manifest`
     - `npm run check:role-policy`
     - `node scripts/check-installer-parity.mjs`
     - `node scripts/update-runtime-assets.mjs --check`
- **전체 회귀**
  - 예비 판정은 trigger (1)에 해당해 실행이다.
  - 기준선과 같은 명령을 쓴다: 전체 node suite와 전체 Python suite.
  - 같은 run의 결과를 합집합 판정에 재사용할 수 있다.
  - Orchestrator가 `690e9aa4..HEAD`를 보고 네 조건을 최종 판정하고, 그 이유를 기록한다.
- **결과 판정**
  - 기준선과 테스트 이름 단위로 비교한다. 새로 생긴 실패만 finding이고, 기준선 실패는 따로 보고한다.
  - baseline-incomplete 파일에서 나온 실패는 새 실패 후보로 보고 하나씩 확인한다.
  - 간헐 실패가 의심되면 그 테스트만 단독으로 최대 3회 다시 실행한다. "passes in isolation: yes/no, N/M"을 기록한다. 단독 실행에서 통과해도 원래 실패를 지우지 않는다.
  - 실행 후 남은 fixture 프로세스를 확인하고 기준선 4번 항목과 비교한다.
  - 새 실패 finding은 최종 Reviewer가 이미 시작했더라도 해당 task의 Implementer → QA로 처리한다. 영향받는 파일에 대한 Reviewer 근거는 낡은 것이 되므로, 갱신된 diff로 재확인한다.
- **최종 Reviewer 1회**
  - 독립 Reviewer가 전체 변경 `690e9aa4..HEAD`를 한 번 검토한다. Reviewer는 테스트를 실행하지 않는다.
  - "검토 초점"과 spec 수용 기준에 대조한다.
  - finding은 Implementer가 고치고 Reviewer가 재확인한다. QA는 다시 배정하지 않는다.
  - 재확인이 끝날 때까지 수정을 커밋하지 않고, 끝나면 follow-up 커밋 하나로 만든다.
- 최종 검증 결과와 Reviewer 판정은 plan-level progress record 규칙을 따른다.

## Orchestrator 결정 (Planner 열린 질문 Q1–Q7)

모두 Planner 추천을 채택했다. 단, Q1은 "바뀔 수 있다"가 아니라 확인된 사실이므로 spec AC1-2를 개정했다. Q2는 사용자 요청("codex에 한정하지 말고")에 맞춰 범위에 넣었다.

| ID | 질문 | 결정 |
|---|---|---|
| Q1 | agents 원본에 managed 섹션이 들어 있다. 그래서 T1에서 policy를 다시 생성하면 reviewer 외 프로필 16개의 렌더 해시도 바뀔 수 있다. 이는 AC1-2("reviewer 4개만")와 충돌할 수 있다. | 확인된 사실이다(20개 원본 모두 managed 섹션 포함). `profiles` 20개를 모두 갱신 대상으로 하고, spec AC1-2를 "fragment 문장은 reviewer 4개 렌더에만, 나머지 16개는 managed 섹션 밖 바이트 불변"으로 개정했다. |
| Q2 | gemini·grok fixture(`gemini-bridge.test.mjs:89`, `grok-bridge.test.mjs`)의 정리도 rm뿐이다. spec (b)는 `createRoutingFixture`만 다룬다. | 플랫폼 대칭을 위해 T3에서 두 fixture의 hook도 `reapFixtureProcesses(base)`를 먼저 부르게 한다. 한 줄씩 추가하는 것이고 allowedPaths가 늘어난다. |
| Q3 | `descendants.json`의 위치. spec은 "dispatch artifact"라고만 한다. | `segmentDirectory`(artifactDir, `gitCommonDir` 기준)에 둔다. cancel은 `resolveWorktree(context.cwd)`로 같은 경로를 다시 계산한다. dispatch store sidecar(anchor home)는 lease 목록 검증과 충돌할 위험을 확인하지 않았으므로 쓰지 않는다. |
| Q4 | spec (b)의 "`/bin/ps` 절대 경로" | 기존 `realPs`(`ORIGINAL_PATH`, `ps-stub.mjs:30-32`)로 대체한다. 목적(stub 우회)은 같고, Linux에서 ps 위치가 달라도 동작한다. |
| Q5 | `escapedDescendants` record 필드를 넣는 조건 | `observed > 0`이거나 `truncated`일 때만 넣는다. 기존 record 형태를 지키기 위해서다(T4-0에서 확인). spec 문구("넣는다")를 이렇게 좁혀 해석하는 것이다. |
| Q6 | signal 종료(E)의 reason code | 새 code를 만들지 않는다. `terminatedBy:'supervisor_signal'`과 기존 실패 분류를 따른다. |
| Q7 | supervisor가 없는 cancel에서 `survived > 0`일 때 | cancel 결과는 그대로 두고 `escapedDescendants` 수치만 결과에 붙인다. D5(a)를 cancel 경로로 넓힌 것이다. |

## Revision history
| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-21T11:54:55+09:00 | 최초 승인 | T1, T2, T3, T4 | 최초 plan |
| v2 | 2026-11-21T12:16:28+09:00 | 문구 정정(범위 변화 없음) | T1 | T1 QA finding: T1 allowedPaths와 Q1 표에 Q1 결정 이전 문구("reviewer target 4개만")가 남아 있어 승인된 Q1 결정에 맞춰 정정 |
| v3 | 2026-11-21T12:24:04+09:00 | 검증 절차 변경(사용자 결정) | T3, T4 | Codex bridge sandbox에서 실제 ps 불가. 실제 ps 테스트의 RED/GREEN은 Orchestrator가 실행하고 QA는 코드와 로그를 검토 |
| v4 | 2026-11-21T12:35:13+09:00 | 설계 보강(범위 변화 없음) | T3 | T3 QA finding(높음): `.pids`의 숫자 pid가 재사용되면 무관한 프로세스에 신호 가능. 신호 대상을 command에 base가 들어간 프로세스로 한정하고 grandchild argv에 base 표시 추가 |
| v5 | 2026-11-21T12:51:11+09:00 | 설계 명확화(범위 변화 없음) | T4 | T4 Implementer 질의: plan의 `pgid === rootPgid` 편입 조건이 spec 안전 장치(계보 전용)와 충돌 → 계보 전용으로 정정. `descendants.json` 최상위 형식 미정 → 확정 |
| v6 | 2026-11-21T13:05:58+09:00 | 설계 보강(범위 변화 없음) | T4 | T4 QA finding: 기록 출처 미검증(높음), group 신호 우회(높음), 사라진 group 재신호(높음), 정리 중 timeout(중간), 같은 초 pid 재사용(중간) 보강. 기준선 cancel 경로 pgid 재사용은 pre-existing 기록 |
