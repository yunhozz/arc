# 브리지 테스트 ps stub 구현 계획 (Bounded, 1 task)

- 상태: 승인 요청 중 (Planner 첫 초안, Orchestrator 검토 반영)
- 근거: `.git/arc/workflows/bridge-sandbox-scope/design-approved.md` "(a)" 절 (2026-11-19 사용자 명시 승인). Written spec 불필요(Bounded).
- Source: `/Users/ma-24-007/Desktop/workspace/arc`, master `ea1a3a2` clean
- Target: managed worktree `.claude/worktrees/bridge-ps-stub`, branch `fix/bridge-ps-stub`, base `ea1a3a2`
- Risk: ordinary~significant(PID identity 테스트 의미 변경) → fresh QA 1회, 최종 Reviewer 1회

## 목표

Codex bridge sandbox처럼 `ps`가 거부되는 환경에서도 `npm test`에 ps 기인 실패가 없어야 한다. 실제 ps가 되는 환경에서는 실제 ps identity 테스트가 계속 실행되어야 한다. runtime의 fail-closed 동작은 테스트로 고정한다.

## 범위

- 테스트 전용 ps stub(커밋, 실행 비트), 공용 helper, stub 계약 테스트, fail-closed 테스트
- 실제 ps 테스트 분리와 사유를 명시한 skip
- routing fixture의 PATH 주입

## 제외

- runtime 변경 없음: `lib/runtime/*`(`role-bridge-args.mjs` 포함), `shared/skill/runtime/*` diff 0
- (b) 게이트 측정 Spike
- `pkill` 기반 cleanup의 sandbox 동작(결과를 무시하는 코드이므로 범위 밖)

## 확인된 ps 의존 위치

- runtime의 ps 호출은 `lib/runtime/role-supervisor.mjs:81-86` `processStartTime` 한 곳이다. `spawnSync('ps', …, {env: {PATH: process.env.PATH, LC_ALL: 'C'}})`로 실행되어 다른 env는 전달되지 않는다.
- 호출 측:
  - `startSupervisor`(:142-143)는 **테스트 프로세스**에서 실행된다. null이면 SIGKILL 후 throw → `role-bridge.mjs:61-62` hold `host_sandbox_blocked`(lease는 `reserved` 유지).
  - supervisor 자식 :357은 **context.env PATH**로 `child.startTime ?? 'unavailable'`을 기록한다.
  - `role-bridge.mjs:79/208/211/214`의 `processAlive`는 **테스트 프로세스**에서 실행된다.
- 따라서 stub은 `process.env.PATH`와 `context.env.PATH` **양쪽**에 같은 순서로 들어가야 identity가 일치한다.
- `role-dispatch-store.mjs:15`는 `startTime`이 비어 있지 않은 문자열인지만 검사한다. `stub <pid>`는 통과한다.
- 테스트 쪽 직접 의존:
  - `tests/node/role-bridge-run.test.mjs`: :31 `ps -axo` leftover 검사, :87 `startInProcess`, :307-327 PID reuse
  - `tests/node/role-bridge-resume.test.mjs`: :34 `ps -axo` leftover 검사, :71, :296, :335(null이면 `writeLease` 검증에서 throw), :352/:357
- supervisor 경유 파일:
  - gemini/grok: `runSupervisor` in-process, starter 고정값 `'fixture-supervisor'`, :357은 `'unavailable'`도 허용. 직접 의존 미확인.
  - anchor-flip: starter 고정값, `createRoutingFixture` 사용 → D3로 자동 적용.
  - role-routing-anchor: :31 자체 env, :175/:237은 `createRoutingFixture` 사용.
  - 이 네 파일의 수정 여부는 Step 0 재현 결과로 결정한다.

## 정확한 파일 목록 (Implementer allowedPaths)

**기본(필수)**

1. `tests/fixtures/bin/ps` — 신규, mode 755, node 스크립트
2. `tests/node/fixtures/ps-stub.mjs` — 신규 공용 helper
3. `tests/node/ps-stub.test.mjs` — 신규 stub·helper 계약 테스트
4. `tests/node/role-fixtures.mjs` — 수정: `createRoutingFixture` env PATH(:74), `installPsStub()` 호출
5. `tests/node/role-bridge-run.test.mjs` — 수정: leftover 검사(:30-33), 실제 ps 테스트 추가, fail-closed 테스트 2개 추가
6. `tests/node/role-bridge-resume.test.mjs` — 수정: leftover 검사(:33-36)

**조건부**(Step 0에서 ps 기인 실패가 확인된 파일만 Orchestrator가 allowedPaths에 추가)

- `tests/node/gemini-bridge.test.mjs`(:120 env), `tests/node/grok-bridge.test.mjs`(:105 env), `tests/node/role-routing-anchor.test.mjs`(:31 env)
- 수정 방식은 같다: 파일 상단에서 `installPsStub()`, env PATH는 `psStubPath(...)`.

## stub과 helper 명세

**`tests/fixtures/bin/ps`**

- 쉬뱅 `#!/usr/bin/env node`.
- import/require 없이 전역 `process`만 사용한다(확장자 없는 파일이 CJS/ESM 어느 쪽으로 판정돼도 동작).
- 인자가 정확히 `-o lstart= -p <pid>`(`/^[1-9]\d*$/`)가 아니면 stderr `ps stub: unsupported arguments`, exit 2.
- `process.kill(pid, 0)`이 성공하거나 `EPERM`이면 존재로 보고 stdout `stub <pid>\n`, exit 0.
- 그 밖의 오류(ESRCH 등)는 exit 1.
- 실행 비트는 Implementer가 `chmod 755`로 설정. 커밋 시 Orchestrator가 `git ls-files -s`에서 `100755` 확인.

**`tests/node/fixtures/ps-stub.mjs` export**

- `PS_STUB_DIR`: `tests/fixtures/bin` 절대경로
- `ORIGINAL_PATH`: import 시점 `process.env.PATH`(어떤 변경보다 먼저 캡처)
- `NODE_SHIM_DIR`: import 시 `mkdtemp`로 만들고 `node` → `process.execPath` 심링크 하나만 둔다. `process.on('exit')`에서 `rmSync`.
- `psStubPath(base)`: `[PS_STUB_DIR, NODE_SHIM_DIR, base].join(path.delimiter)`
- `installPsStub()`: 멱등. `process.env.PATH`가 이미 `PS_STUB_DIR`로 시작하면 아무것도 하지 않음.
- `psAvailable()`: 메모이즈. `ORIGINAL_PATH`로 `ps -o lstart= -p <process.pid>` 실행, status 0이고 stdout이 비어 있지 않으면 true.
- `realPs(args)`: `ORIGINAL_PATH`로 `spawnSync('ps', args, …)`.
- `withPath(value, fn)`: async. `process.env.PATH`를 잠시 바꾸고 `finally`에서 복원.
- `writeFailingPs(dir, recordFile)`: `#!/bin/sh`로 `$4`(pid)를 절대경로 `recordFile`에 append하고 `exit 1`, mode 755. 런타임 tmp 전용.
- import 시 `fs.accessSync(stub, X_OK)` 실패하면 "tests/fixtures/bin/ps is not executable" throw(런타임 chmod로 고치지 않음).

**PATH 주입**

- `createRoutingFixture`가 `installPsStub()`를 호출하고 `env.PATH = psStubPath(\`${binDir}:/usr/bin:/bin\`)`로 둔다.
- node `--test`는 파일별 별도 프로세스이므로 `process.env` 변경은 그 파일 안에만 영향을 준다.

## Task T1 — 테스트 ps stub 도입과 실제 ps/fail-closed 테스트 분리

- **선행**: Orchestrator Step 0 완료, prepared target 검증
- **파일**: 위 기본 6개 + 해당 시 조건부 파일

**단계 (TDD)**

- [ ] **Step 0 — 재현 (Orchestrator, 호스트, Implementer dispatch 전).** 결과로 allowedPaths를 확정한다.
  ```
  S=<scratchpad>/psfail; mkdir -p "$S"; printf '#!/bin/sh\nexit 1\n' > "$S/ps"; chmod 755 "$S/ps"
  F="tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/gemini-bridge.test.mjs tests/node/grok-bridge.test.mjs tests/node/anchor-flip.test.mjs tests/node/role-routing-anchor.test.mjs"
  node --test $F > base.txt 2>&1
  PATH="$S:$PATH" node --test $F > sim.txt 2>&1
  ```
  - 실패 목록 차이(sim − base)를 파일별로 기록한다.
  - 한계: 변경 전에는 fixture env(`/usr/bin:/bin`)가 실제 ps를 찾으므로 supervisor 자식 쪽 재현은 부분적이다. Codex bridge 실재현은 Step 5에서 보강한다.
- [ ] **Step 1 — RED (Implementer).** `tests/node/ps-stub.test.mjs` 작성: stub 실행 비트, 살아 있는 `process.pid`에 `stub <pid>`·exit 0, `2147483000`에 exit 1, 지원하지 않는 인자에 exit 2, `psStubPath` 순서, `installPsStub` 멱등성. `node --test tests/node/ps-stub.test.mjs` → stub·helper가 없어 실패해야 한다.
- [ ] **Step 2 — fail-closed 테스트 추가 (`role-bridge-run.test.mjs`).** runtime이 이미 fail-closed이므로 characterization 테스트이며 추가 직후 PASS 예상.
  - (a) `writeFailingPs` dir를 `withPath`로 맨 앞에 두고 `startSupervisor({codexHome: f.claudeHome, dispatchId: 'nonexistent', cwd: f.cwd, userHome: f.userHome, env: f.env})` 호출. 기대: `/Supervisor start time unavailable/`로 reject, record 파일의 pid가 `waitDead(pid)`로 사라짐.
  - (b) 같은 조건에서 기본 starter로 `run(f, id)`. 기대: `decision === 'hold'`, `codes === ['host_sandbox_blocked']`, lease `state === 'reserved'`, `supervisor === null`, 500ms 뒤 `records(f.codex).length === 0`.
- [ ] **Step 3 — GREEN.** stub(755), helper, `role-fixtures.mjs` 주입 구현. Step 1 테스트 통과 확인.
- [ ] **Step 4 — 실제 ps 분리.**
  - `role-bridge-run.test.mjs`에 `processStartTime uses real ps lstart` 추가, 옵션 `{skip: psAvailable() ? false : 'real ps unavailable (sandbox/PATH): identity tests use tests/fixtures/bin/ps stub'}`.
  - 본문은 `withPath(ORIGINAL_PATH)` 안에서: `processStartTime(process.pid)`가 `/^\w{3} \w{3} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/`에 맞음, `processStartTime(2147483000) === null`, 자기 lstart로 `processAlive` true, 다른 lstart로 false.
  - 기존 :307-327 테스트는 그대로 두고 stub 기반으로 실행. 바뀐 의미를 주석 한 줄로 남긴다.
  - leftover 검사 2곳은 `realPs(['-axo','pid=,command='])`로 바꾸고 `!psAvailable()`이면 사유를 `console.log`로 남기고 건너뛴다. stdout null guard 포함.
- [ ] **Step 5 — Implementer 대상 실행 (Codex sandbox).** sandbox에서 실제 ps가 거부되므로 실환경 재현이 된다.
  ```
  node --test tests/node/ps-stub.test.mjs tests/node/role-bridge-run.test.mjs tests/node/role-bridge-resume.test.mjs
  ```
  결과, 실제 ps 테스트 skip 사유, stub의 `process.kill` 동작(R1)을 보고. ps 기인이 아닌 실패는 고치지 않고 보고.
- [ ] **Step 6 — 호스트 검증 (Orchestrator).** 아래 AC 명령 실행.
- [ ] **Step 7 — fresh QA (Codex bridge dispatch).** AC-a5.

**수용 기준과 검증 명령**

| AC | 기준 | 명령 / 증거 | 실행 주체 |
|---|---|---|---|
| AC-a1 | failing-ps PATH 시뮬레이션에서 ps 기인 실패 0, 실제 ps 테스트는 사유와 함께 skip, baseline 대비 새 실패 0 | master `ea1a3a2`에서 `npm test > base-full.txt`, target에서 `PATH="$S:$PATH" npm test > sim-full.txt`, 실패 목록 비교 신규 0, sim-full.txt에 skip 사유 존재. 의심 항목 단독 재실행 | Orchestrator(호스트) |
| AC-a2 | ps 가능 환경에서 실제 ps identity 테스트가 실행되어 통과 | target에서 `node --test tests/node/role-bridge-run.test.mjs`, 해당 테스트 pass(skip 아님) | Orchestrator(호스트) |
| AC-a3 | fail-closed 테스트 2개 통과 | Step 5 출력과 AC-a2 실행 출력 | Implementer + Orchestrator |
| AC-a4 | runtime diff 0 | `git diff --stat ea1a3a2 -- lib/runtime shared/skill/runtime` 출력 비어 있음 | Orchestrator |
| AC-a5 | 실제 Codex bridge QA dispatch에서 full `npm test` 실행, ps 기인 실패 없음 | QA 보고서: 전체 출력 요약, 실패 목록, baseline 대조, skip 사유 | QA(fresh) |

- 추가 체크: `git ls-files -s tests/fixtures/bin/ps`가 `100755`(Orchestrator, staging 후).
- QA/Reviewer: T1 구현 → fresh QA(AC-a5, 필요 시 재확인) → Orchestrator 수용과 focused commit 1개 → 최종 전체 변경 Reviewer 1회(중점: PID identity 의미 변경, PATH 주입 범위, leftover 검사 약화 여부). Reviewer 지적은 Implementer → Reviewer로 재확인하며 QA를 다시 배정하지 않는다.
- 보류 조건: Step 0에서 기본 목록 밖 파일에 ps 기인 실패가 나오면 allowedPaths 추가 결정 전까지 해당 부분 보류. R1이 발생하면 대안 결정 전까지 수용 보류.

## 설계 대비 보완 (승인된 방법의 구체화)

- **D1** node 실행 경로는 런타임 shim(`NODE_SHIM_DIR`, `node` 심링크 하나)으로 공급한다. `path.dirname(process.execPath)`를 PATH에 직접 넣으면 같은 디렉터리의 실제 codex/claude가 드러나 "CLI 없음" 테스트가 오염될 수 있기 때문이다.
- **D2** 항상 실패하는 ps는 커밋하지 않고 테스트가 런타임 tmp에 생성하며, pid 기록으로 SIGKILL 정리를 실증한다.
- **D3** 주입 지점은 `createRoutingFixture` 하나다. 테스트 프로세스와 supervisor 자식이 같은 ps를 써서 identity가 일치한다.
- **D4** stub 계약 테스트는 신규 파일 `tests/node/ps-stub.test.mjs`에 둔다.
- **D5** ps가 없는 환경에서 leftover 검사(`ps -axo`)는 사유를 남기고 건너뛴다. 현재도 sandbox에서는 stdout이 빈 문자열이라 사실상 검사하지 않고 통과하고 있다.

## 리스크

- **R1 (미실측)** Codex sandbox가 stub의 `process.kill(pid, 0)`을 허용하는지 모름. EPERM은 존재로 처리하므로 거부가 EPERM이면 안전. stub 실행 자체가 막히거나 EPERM이 아닌 오류로 실패하면 Step 5에서 바로 보고. 존재 확인 없는 `stub <pid>` 반환은 gone-pid 테스트(:357, :309) 의미를 깨므로 쓰지 않고, 설계 재검토를 Orchestrator에 반환.
- **R2** stub identity는 pid만으로 정해져 PID 재사용 판별 능력이 없음. 이 판별은 실제 ps 테스트(AC-a2)만 검증. Reviewer 중점.
- **R3** `role-dispatch-store.mjs:15`는 비어 있지 않은 문자열이면 통과(확인).
- **R4** `createRoutingFixture`가 `process.env.PATH`를 바꾸므로 이 fixture를 쓰는 다른 파일(`role-routing-dispatch`, `role-bridge-observe-wait`, `role-bridge-support`, `codex-auth-probe`, `management-status`, `role-routing-install`, `role-bridge-args`)도 stub을 쓰게 됨. AC-a1 전체 suite로 확인.
- **R5** fail-closed 테스트 (b)에서 SIGKILL 전에 supervisor 자식이 codex를 띄우는 이론상 race. 가능성 낮음. flake면 단독 재실행.
- **R6** `process.execPath` 경로 공백은 심링크 방식이라 영향 없음.

## 진행 기록

| 단계 | 상태 | 증거 | 비고 |
|---|---|---|---|
| Step 0 재현 | 대기 | base.txt / sim.txt 차이 | allowedPaths 확정 |
| Step 1 RED | 대기 | | |
| Step 2 fail-closed | 대기 | | |
| Step 3 GREEN | 대기 | | |
| Step 4 실제 ps 분리 | 대기 | | |
| Step 5 sandbox 대상 실행 | 대기 | | R1 실측 |
| Step 6 호스트 AC-a1/a2/a4 | 대기 | | |
| Step 7 QA AC-a5 | 대기 | | |
| 수용 / commit | 대기 | | |
| 최종 Reviewer | 대기 | | |

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
