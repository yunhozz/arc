# F2 후속 과제 설계 (reviewer 검증 주체, final-plan-recheck 정리, bridge 잔여 프로세스, JSDoc)

- 상태: 사용자 승인(2026-11-21). 사용자 결정 D1, D4, D5를 반영했다.
- 기준: `fix/bridge-fetch-tolerance` @ `690e9aa4`
- 범위: F1 후속 과제 중 사용자가 고른 번호 1, 3, 5, 6. 4(watch 표시)는 사용자 결정으로 제외했고, 2(L5)는 처음부터 범위 밖이다.
- test-scope 규칙: 설치된 ARC `references/verification.md`의 "Test scope and result comparison"을 따른다.
- 플랫폼: claude, codex, gemini, grok을 대칭으로 다룬다. 원천(fragment, policy, supervisor)은 하나이므로 네 플랫폼에 같은 결과가 생성된다.
- 초안: Planner. 검토·수정: Orchestrator.

## 0. 공통 영향 (생성물·해시)

| 바뀌는 입력 | 다시 생성하거나 갱신할 것 |
|---|---|
| `lib/prompts/agent-fragments.json` | `tests/node/fixtures/instruction-contracts.json`의 `agentProfileBaseline.profiles` 중 해당 target, 설치 golden(`node tests/node/fixtures/installed-layout.mjs --write`), `MANIFEST.sha256`(`node scripts/update-manifest.mjs`) |
| `lib/policy/role-policy.json` | `node scripts/update-role-policy.mjs`(네 플랫폼의 managed 섹션), `node scripts/update-runtime-assets.mjs`(`shared/skill/runtime/role-policy.json` 사본), golden, MANIFEST |
| `lib/runtime/*.mjs` | `tests/node/runtime-versions.test.mjs`의 `baselineHash`, `shared/skill/runtime/` 사본, golden, MANIFEST |
| `tests/node/role-fixtures.mjs` 등 테스트 코드 | 없음 |

- `protected` fixture는 기준선부터 38개 중 21개가 낡아 있고, 이를 검사하는 테스트는 기준선 실패다. 따라서 갱신하지 않는다.
- 정책 문구나 fragment 원문을 직접 고정한 테스트는 없다. `lib/` 원천 두 파일만 그 문구를 갖고 있다. 그래서 문구를 바꾸면 해시와 생성물만 영향받는다.

---

## 과제 1: reviewer fragment의 검증 주체 문구 (F1 L4)

**문제**
- `lib/prompts/agent-fragments.json:90`(`reviewer.review-steps`)에는 "QA owns functional/test verification; Orchestrator owns overall completion and acceptance."라고 되어 있다.
- F1 이후 최종 검증은 Orchestrator가 직접 실행한다(`verification.md:22`, `qa.verification-steps`). 그래서 지금 문구는 QA가 최종 테스트 검증까지 맡는 것처럼 읽힌다.

**결정**
- 해당 문장을 아래 문장으로 바꾼다.

  "QA owns task functional/test verification; Orchestrator runs final verification and owns overall completion and acceptance."

**수용 기준**
- AC1-1: 새 문구가 정확히 1회 있고, 옛 원문은 없다.
- AC1-2: fragment 변경(과제 1과 D1(b))은 reviewer target 4개의 렌더 결과에만 들어간다. agents 원본 20개에 모두 `review.final-plan-recheck` managed 섹션이 있으므로, policy 재생성으로 `profiles` 해시 20개가 모두 바뀌는 것은 예상된 결과다. reviewer 외 16개는 managed 섹션 밖의 바이트가 그대로여야 한다. (plan 검토 중 개정, 2026-11-21)
- AC1-3: fragment ID, 개수(26), 순서, target별 fragment 개수가 유지된다.

## 과제 3: `[review.final-plan-recheck]`와 최종 검증 실패 경로 (F1 M1, 재확인 nit 1)

**문제**
- `verification.md`(4개)는 "A new failure from final verification follows Implementer → QA even after the final Reviewer has started; …"라고 한다.
- 그런데 managed rule `review.final-plan-recheck`(`lib/policy/role-policy.json:365`)는 "Complete required QA and QA failure rechecks before the initial final overall Reviewer review"라고만 한다.
- 실제 규칙이 충돌하지는 않는다. 최종 검증 실패는 Reviewer finding이 아니기 때문이다. 다만 rule에 그 사실이 적혀 있지 않아 문구상 긴장이 생긴다.

**결정 (사용자 결정 D1(b): rule과 reviewer fragment를 함께 고친다)**
- rule `text`의 "Separate QA findings follow Implementer → QA." 부분을 아래 문장으로 바꾼다. id, roles, effect, controls는 바꾸지 않는다.

  "Separate QA findings and new failures from final verification, which may run concurrently with the final Reviewer, follow Implementer → QA; Reviewer evidence for affected files then needs a refreshed-diff recheck."

- `reviewer.final-plan-findings` fragment(`agent-fragments.json:94`) 끝에 아래 문장을 붙인다.

  " New failures from final verification follow Implementer → QA; affected evidence needs a refreshed-diff recheck."

- `planner.final-plan-recheck`와 `verification.md`의 비관리 문단은 바꾸지 않는다. 둘 다 새 rule과 뜻이 맞는다.

**수용 기준**
- AC3-1: rule text가 위 문구와 같고, rule의 다른 필드는 바뀌지 않는다.
- AC3-2: `npm run check:role-policy`가 통과한다. managed 섹션이 모두 다시 생성됐다는 뜻이다.
- AC3-3: `shared/skill/runtime/role-policy.json`이 `lib/policy/role-policy.json`과 바이트 단위로 같고, `node scripts/update-runtime-assets.mjs --check`가 통과한다.
- AC3-4: reviewer fragment 문장이 정확히 1회 있다.
- AC3-5: managed rule과 `verification.md` Final verification 문단 사이에 모순이 없다. 최종 Reviewer가 판정한다.

## 과제 5: bridge 잔여 프로세스 정리 (네 플랫폼 공통)

### 문제와 근거
- 네 플랫폼 child는 모두 `lib/runtime/role-supervisor.mjs:305`에서 같은 방식(`spawn(… {detached: true})`)으로 띄운다. 따라서 정리 로직은 supervisor 한 곳에 플랫폼 중립으로 둔다.
- supervisor는 child의 process group(`-child.pid`)만 정리한다(234–247, 429–432, 513행).
  - 자손이 `detached`나 `setsid`로 새 group 또는 session을 만들면 정리 대상에서 빠진다.
- supervisor 진입점(531–535행)에는 signal handler가 없다.
  - supervisor가 SIGTERM, SIGHUP 등으로 죽으면 child group이 그대로 살아남는다.
  - lease의 lost 판정(`role-bridge.mjs:79–91`)도 child를 종료하지 않는다.
  - supervisor가 없을 때 child를 종료하는 경로는 명시적 cancel(`role-bridge.mjs:222`, `:230–234`)뿐이다. 이 경로도 group 밖으로 나간 자손은 다루지 않는다.
- 테스트 fixture에도 원인이 있다.
  - `tests/node/role-fixtures.mjs:45`의 `t.after`는 chmod와 rm만 한다.
  - hang(141, 157행), grandchild(152행), ignoreSigterm(150행) 시나리오의 가짜 CLI와 detached supervisor는 종료하지 않는다.
  - fixture env는 `{PATH, HOME, CODEX_HOME}`으로 다시 만들어진다(76행). 그래서 바깥 dispatch의 `ARC_BRIDGE_CHILD` 표지가 전파되지 않는다.
- 실제 사례: QA bridge 안에서 실행한 테스트가 `/private/tmp/arc-t1-qa-*/arc-route-*/bin/codex`를 12–13시간 동안 남겼다. 이번 세션에서 30개 넘게 정리했다.

### 결정: runtime 층 (a). A + D + E 조합

추천안 A + D + E를 채택했다. B(env 표지 스캔)는 env가 정리되면 표지가 사라지고, 다른 프로세스의 env(비밀 포함)를 읽게 되므로 쓰지 않는다. C(OS 격리)는 native 구현이 필요하고 macOS와 대칭을 맞출 수 없으므로 쓰지 않는다.

- **A. 계보 샘플링**
  - child가 실행되는 동안 `descendantSampleMs`(기본 1000 ms)마다 `ps -A -o pid=,ppid=,pgid=,lstart=`를 비동기로 한 번 실행한다.
  - `child.pid`에서 ppid를 따라 내려가 자손 집합을 만들고, 각 항목의 `{pid, pgid, startTime}`을 누적한다.
  - 실행이 끝나면 먼저 child group을 정리한다. 그 뒤 누적한 자손 중 `(pid, lstart)`가 지금도 같은 것에만 SIGTERM을 보내고, grace 뒤 SIGKILL을 보낸다.
  - 자손이 group leader이면 그 group에도 신호를 보낸다.
- **D. 기록과 복구 정리**
  - 샘플한 자손 목록을 dispatch artifact `descendants.json`(0600)에 남긴다.
  - supervisor가 없을 때 명시적 cancel을 하면, 이 목록에서도 `(pid, lstart)`가 일치하는 항목을 종료한다.
- **E. supervisor signal handler**
  - supervisor가 SIGTERM, SIGINT, SIGHUP을 받으면 child group과 샘플한 자손을 정리하고 record를 남긴 뒤 끝낸다.
  - SIGKILL로 죽는 경우는 막을 수 없으므로 D가 보완한다.
- **자동 종료 범위 (사용자 결정 D4(a))**
  - supervisor가 끝날 때: 자기가 샘플한 자손을 자동으로 종료한다.
  - supervisor가 이미 없을 때: 명시적 cancel을 할 때만 기록된 자손을 종료한다.
  - lost 판정만으로는 종료하지 않는다.
- **안전 장치**
  1. 종료 대상은 샘플 시점에 `child.pid`에서 ppid로 이어진 자손뿐이다. supervisor 자신과 그 조상은 제외한다.
  2. 신호를 보내기 직전에 `(pid, lstart)`를 다시 대조해 pid 재사용을 막는다.
  3. 같은 uid의 프로세스만 대상으로 한다. `EPERM`이면 건너뛰고 기록한다.
  4. 자손 수에 상한(기본 256)을 둔다. 상한을 넘으면 `truncated`를 기록한다.
  5. 샘플링에는 `spawnSync`를 쓰지 않는다. 비동기 `execFile`로 실행하고 timeout을 두며, 이전 샘플이 진행 중이면 이번 샘플은 건너뛴다.
- **기록 (사용자 결정 D5(a))**
  - dispatch record에 `escapedDescendants: {observed, reaped, survived, truncated}`를 넣는다.
  - `survived > 0`이어도 state 판정은 바꾸지 않는다. 기록만 한다.
- **정책 상수**
  - `DEFAULT_POLICY`(`lib/runtime/role-dispatch-policy.mjs`)에 `descendantSampleMs: 1000`과 자손 상한 256을 추가한다(D7).

### 결정: 테스트 fixture 층 (b)
- `createRoutingFixture`의 정리 hook 하나에서 프로세스를 먼저 종료하고, 그다음 rm을 한다.
  1. **식별:** stub을 우회하는 기존 helper `realPs`(`ORIGINAL_PATH`)로 실제 ps를 실행한다(plan 검토 중 개정: Linux 경로 차이 대응). 테스트 env의 ps stub을 피하기 위해서다. command에 fixture 고유의 `base` 경로(mkdtemp)가 들어간 프로세스를 찾는다. 대상은 가짜 CLI와 supervisor다.
  2. **pid 기록:** `FAKE_SOURCE`가 자기 pid와 grandchild pid를 언제나 `<binDir>/.pids`에 남기게 한다.
  3. **종료:** 대상마다 lstart를 다시 대조한 뒤 SIGTERM, 짧은 grace, SIGKILL을 보낸다. 대상이 group leader이면 group에도 보낸다.
  4. 그다음 chmod와 rm을 한다.
- 네 플랫폼의 가짜 CLI는 같은 `FAKE_SOURCE`를 쓰므로 정리도 대칭이다.

### 수용 기준
- AC5b-1: hang, auth hang, grandchild, ignoreSigterm 시나리오를 쓴 테스트가 끝난 뒤 다음 프로세스가 하나도 살아 있지 않다.
  - command에 base 경로가 들어간 프로세스
  - `.pids`에 기록된 pid
- AC5b-2: 정리 hook은 base 경로와 무관하고 기록에도 없는 프로세스에 신호를 보내지 않는다.
- AC5a-1: 가짜 CLI가 `detached: true`로 장기 실행 손자를 띄우고 스스로 끝나면, supervisor가 끝날 때 손자도 종료된다.
  - record에서 `escapedDescendants.reaped >= 1`이다.
  - 네 플랫폼에서 각각 확인한다.
- AC5a-2: pid가 재사용된 경우(lstart 불일치)와 자손이 아닌 프로세스에는 신호를 보내지 않는다. 주입한 kill 함수로 관찰한다.
- AC5a-3: supervisor가 SIGTERM을 받으면 child group과 샘플한 자손을 정리하고 record를 남긴다.
- AC5a-4: supervisor가 SIGKILL로 죽은 뒤 cancel을 하면, `descendants.json`에 있는 자손 중 `(pid, lstart)`가 같은 것이 종료된다. lost 판정만으로는 종료되지 않는다.
- AC5a-5: 샘플링 중에도 stdout 이벤트 처리와 cancel polling이 늦어지지 않는다. 기존 bridge 테스트가 통과한다.
- AC5a-6: `survived > 0`이어도 state가 바뀌지 않는다.

## 과제 6: `detectViolations` JSDoc (보류 nit)

**문제**
- `lib/runtime/role-observe.mjs:627–629`에는 "QA may change no paths when the list is empty or missing"이라고 되어 있다.
- 실제로는 목록이 비었거나 없는 QA도 검증된 fast-forward commit 경로를 경로 제한 없이 받아들인다(610–615, 656–663행). 이 예외가 문구에 빠져 있다.

**결정**
- 괄호 문장을 아래 문장으로 바꾼다. 동작은 바꾸지 않는다.

  "Implementer and QA may change only allowedPaths in the worktree; with an empty or missing list they may change no worktree paths. Fast-forward commit paths must stay within allowedPaths for Implementer and for QA with a non-empty list; QA with an empty or missing list, like read-only roles, may land a verified fast-forward touching any path."

**수용 기준**
- AC6-1: JSDoc이 실제 동작과 맞는다. Reviewer가 대조한다.
- AC6-2: diff에는 주석 줄만 있다. `baselineHash`, 사본, MANIFEST, golden은 갱신한다.

---

## Task 분할과 검증

| ID | 내용 | 선행 |
|---|---|---|
| T1 | 과제 1과 과제 3. fragment, policy, 생성물, 해시 | 없음 |
| T2 | 과제 6. JSDoc | T1 (생성물을 순서대로 다시 만들기 위해) |
| T3 | 과제 5(b). fixture 정리 | T2 |
| T4 | 과제 5(a). runtime 자손 추적과 정리 | T3 |

- **깊이:** T4는 high-risk다(프로세스 종료, 네 플랫폼 공통). 그래서 작업 전체를 significant로 본다.
  - 각 task는 fresh QA를 거친 뒤 수용하고 커밋한다.
  - 모든 task를 수용한 뒤 최종 Reviewer가 전체 변경을 한 번 검토한다.
- **D6:** JSDoc(T2)은 T4에 합치지 않는다.
- **최종 검증:** Orchestrator가 백그라운드로 실행한다.
  - 범위: 모든 task 관련 테스트의 합집합, 모든 계약 테스트, 모든 check script
  - 전체 회귀 예비 판정: 조건 (1)에 해당한다. fragment, policy, supervisor, fixture가 모두 shared 모듈이다.
- **기준선:** approved base에서 기록한다. 전체 suite를 포함한다. `build/native`가 있는 상태에서 기록한다.

## 사용자 결정 기록

| ID | 결정 |
|---|---|
| D1 | (b) rule과 reviewer fragment를 함께 고친다 |
| D2·D3 | 과제 4 제외로 해당 없음 |
| D4 | (a) supervisor가 끝날 때 자동 종료한다. supervisor가 없으면 명시적 cancel에서만 종료한다 |
| D5 | (a) 남은 자손은 기록만 하고 state는 바꾸지 않는다 |
| D6 | JSDoc은 별도 task로 둔다 (추천안 채택) |
| D7 | 샘플 주기 1000 ms, 자손 상한 256 (추천안 채택) |

## 남은 불확실성 (구현할 때 확인)
- 12–13시간 동안 프로세스가 남은 정확한 경로는 확정하지 못했다. 후보는 셋이다.
  - supervisor가 죽은 뒤 child가 살아남았다.
  - auth/app-server probe가 hang에 빠졌다.
  - deadline이 긴 hang이었다.
- 설계는 세 경우를 모두 덮는다.
  - fixture 정리(b): base 경로로 찾아서 종료한다.
  - runtime(a): E가 signal 종료를, D가 SIGKILL 뒤 cancel을 맡는다.
- ps stub(`tests/node/fixtures/ps-stub.mjs`)이 새 `ps -A -o …` 인자를 지원하는지는 구현할 때 확인한다.
- runtime 모듈을 새로 만들면 `COOPERATIVE_RUNTIME_MODULES`와 `expectedModules`에 등록해야 한다.
