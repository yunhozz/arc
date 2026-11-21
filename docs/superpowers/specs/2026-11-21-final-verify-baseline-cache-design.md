# 최종 검증 기준선 캐시·clean worktree·백그라운드 기준선 설계 (spec)

- 날짜: 2026-11-21
- 상태: v9 승인 (2026-11-22, 개정 이력 참조)
- workflow: wf-final-verify-cache
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/final-verify-baseline-cache`, 브랜치 `feat/final-verify-baseline-cache`, base `68ef36c864f7dfe6fa1bebffc15906f2d95a16a7`
- 경로·위험: Architectural, significant (검증 정책·새 runtime 명령)
- 승인 근거: `.git/arc/handoff/2026-11-21-final-verify-models-watch.md` "## A." 절(설계 승인 2026-11-21, Q1/Q3/Q4 답, 전제 승인). spec 단계 결정(2026-11-21): 진입점은 별도 `verify-cli.mjs`(§4), 자식 env는 허용 목록만 전달(§6.3), 두 단계 캐시 키(§6.1)는 정확성 조정으로 Orchestrator 수용.

## 1. 의도와 배경

ARC 최종 검증에서 가장 오래 걸리는 두 단계는 approved base의 기준선 기록과 HEAD의 전체 회귀다. 이 저장소에서 node 전체 526초, Python 46초, check 4종 0.2초, 준비 3.4초를 측정했다.

목표는 **검사 범위를 줄이지 않고** 이 시간을 줄이는 것이다.

1. 기준선을 base 승인 직후 백그라운드에서 미리 기록한다(R1).
2. 같은 조건의 기준선은 다시 실행하지 않고 재사용한다(R2).
3. HEAD도 base와 같은 준비를 거친 clean worktree에서 실행한다(R3). 메인 checkout에만 있는 git-ignored·미추적 파일 때문에 생기는 가짜 새 실패가 사라진다. 관측 사례: ignored `scripts/update-superpowers-local.sh` 하나 때문에 `manifest.test.mjs`에서 16건이 HEAD에서만 실패했다.

도구는 ARC를 쓰는 어떤 저장소에서든 언어·테스트 프레임워크와 무관하게 동작하고, 네 host(claude/codex/gemini/grok)에서 같은 의미를 가져야 한다.

## 2. 목표 · 비목표 · 반목표

**목표 (A-C1~A-C9)**
- A-C1 검사 범위 불변: 실행 명령·테스트 집합·check 스크립트를 줄이지 않는다.
- A-C2 간헐 실패를 숨기지 않는다. 기준선 실패, 새 실패, 간헐 후보를 따로 보고한다. 단독 재실행은 최대 3회이고 "passes in isolation: yes/no"와 횟수를 보고한다. 단독 통과는 원래 실패를 지우지 않는다.
- A-C3 캐시 정확성: 키가 하나라도 다르거나 판정할 수 없으면 재사용하지 않는다.
- A-C4 R1 백그라운드 clean worktree 기준선. 결과 비교 전에만 완료를 요구하고, 실행 부하를 기록한다.
- A-C5 R2 기준선 캐시: §6의 키, `<git-common-dir>/arc/verify` 저장, 머신 간 공유 없음.
- A-C6 R3 HEAD 전체 회귀를 같은 준비를 거친 clean worktree에서 실행한다.
- A-C7 테스트 이름 단위 비교가 프레임워크와 무관하게 동작한다. 파일 단위 load 실패에는 baseline-incomplete 규칙을 그대로 적용한다.
- A-C8 느린 상위 N개를 정보로 보고한다.
- A-C9 네 플랫폼 사본·생성 정책·manifest·parity·계약 테스트가 일관되고, 서술은 host 중립이다.

**비목표:** 테스트 자체의 속도 개선(fsync 53% 등은 별도 과제), 머신 간 캐시 공유, CI 연동, 검사 범위 축소.

**반목표 (동작해도 실패로 보는 경우)**
- 캐시 오적중으로 실제 새 실패가 기준선 실패로 흡수됨.
- 이름 없는 실패·파싱 불가 결과가 "기준선과 같음"으로 처리됨.
- 도구가 사용자 파일, 다른 worktree, 사용자가 만든 worktree를 지우거나 바꿈.
- 도구가 자동으로 재시도·재시작해 실패를 덮음.

**범위 밖(사용자 결정, A-S8):** R4 RAM 디스크/tmpfs 옵트인. base·HEAD 동시 실행 기본값(비권장, 겹치면 도구가 줄을 세운다, §10.1). 기준선 생략(HEAD 실패만 base에서 재실행, 지원하지 않음).

## 3. 제약

- 플랫폼 대칭, host 중립 서술. 네 host 사본은 같은 의미.
- preservation rule: 자동 stash·reset·clean·삭제·branch 생성 없음. 원본 checkout의 ref, index, 작업 파일은 바꾸지 않는다.
- 최종 검증 실행 주체는 Orchestrator. `ARC_BRIDGE_CHILD`가 있으면 모든 명령을 거부한다(기존 패턴 `lib/runtime/command.mjs:15-16`).
- runtime payload는 `lib/runtime/**/*.mjs`만 미러링한다(`scripts/update-runtime-assets.mjs:14-21`). 새 모듈은 `lib/runtime` 밖(`lib/safe-fs` 등)을 import하지 않는다.
- 기존 계약 문장 보존(`tests/node/test-scope-contract.test.mjs:11,19,25-36,179-191`, `tests/node/composite-instructions.test.mjs`의 coordination 문장).

## 4. 접근

| 옵션 | 내용 | 트레이드오프 | 결과 |
|---|---|---|---|
| 1 정책만 + 수동 절차 | 문서에 절차를 적고 Orchestrator가 셸로 수행 | 비용 최저. 키 계산·비교·간헐 판정이 사람마다 달라 A-C3 보장 불가 | 기각 |
| 2 ARC runtime `verify-*` 명령 | 키·worktree·runner·파서·비교·보고를 runtime이 담당 | 구현량이 크지만 네 host 동일 동작, 결정적 키, 테스트 가능 | **승인** |
| 3 외부 스크립트 | 저장소별 스크립트 | 일반 적용(A-C7) 불가, 플랫폼 대칭 깨짐 | 기각 |

**진입점(결정 2026-11-21): 별도 진입 모듈 `lib/runtime/verify-cli.mjs`.** `COOPERATIVE_RUNTIME_MODULES`(`lib/runtime/bootstrap.mjs:7-12`)에는 넣지 않는다. runtimeHash와 `cooperative-9`가 그대로라서 기존 workflow와 composite 활성화에 영향이 없다(근거: `tests/node/runtime-versions.test.mjs:40-50`, install-only 추가는 baseline hash 보존). `lib/runtime/command.mjs`·`cli.mjs`는 수정하지 않는다. 호출: `node <skill>/runtime/verify-cli.mjs <verify-command> --cwd <abs> --workflow <id> --input -`.

## 5. 명령 인터페이스 (A-S1)

### 5.1 공통

- 형식: `<command> --cwd <절대 정규 경로> --workflow <workflowId> --input -`, stdin은 JSON 객체 하나. 옵션 파싱·검증은 `command.mjs:17-20`과 같은 규칙, `validateWorkflowId`는 `scope.mjs:19` 재사용.
- 입력 검증: 최상위와 모든 중첩 객체(배열 요소 포함)에 **정확한 키 집합** 검사. 필수 키 누락, 모르는 키, 타입·범위 오류는 deny `invalid_request`.
- 출력: stdout에 JSON 한 줄. 공통 필드 `{decision: "allow"|"deny"|"hold", code, workflowId, message?, ...payload}`.
- 종료 코드: allow 0, deny 2, hold 3, 예기치 못한 예외 1(`decision:"hold", code:"verify_error"`). 기존 `command.mjs:33-36`과 같은 대응.
- `ARC_BRIDGE_CHILD` 설정 시 모든 `verify-*`는 deny `bridge_child`.
- 공통 enum
  - `hostPlatform`: `claude|codex|gemini|grok`
  - `executionEnvironment`: `platform-registry.mjs` 값(`claude-cli`, `claude-desktop`, `codex-cli`, `codex-desktop`, `gemini-cli`, `grok-cli`). host와 짝이 맞지 않으면 `invalid_request`.
  - `sandboxMode`: `none|sandboxed|escalated|unknown`. ARC는 sandbox를 감지하지 않으므로 operator 증언값이다(`coordination.md:168`).

### 5.2 `verify-start`

- 필수 키: `hostPlatform`, `executionEnvironment`, `sandboxMode`, `role`(`baseline|head`), `revision`(소문자 40/64자리 hex 전체 OID), `commands`(비어 있지 않은 배열), `keyInputs`, `detach`(boolean).
- 선택 키: `prepare`(배열, 기본 `[]`), `seedFiles`(배열, 기본 `[]`), `declaredConcurrent`(boolean, 기본 false), `snapshotWorkingTree`(boolean, 기본 false, `role:"head"`만 허용).
- 중첩 객체(정확한 키)
  - `prepare[]`: 필수 `{executable, args}`, 선택 `{cwd, env, timeoutMs}`
  - `commands[]`: 필수 `{id, executable, args, results}`, 선택 `{cwd, env, timeoutMs, isolate}`
    - `id`: `^[a-z0-9][a-z0-9_-]{0,31}$`, 배열 안에서 유일
    - `args[]`: 각 요소는 문자열 또는 `{glob: string}`
    - `timeoutMs`: 기본 3600000, 상한 21600000
  - `results`: 필수 `{format}`(`junit-xml|tap|regex|none`)
    - `junit-xml`: `path`(worktree 기준 상대 glob) 또는 `stream`(`stdout|stderr`) 중 정확히 하나
    - `tap`: `stream`(`stdout|stderr`) 또는 `path` 중 정확히 하나
    - `regex`: `stream`(`stdout|stderr|both`), `pattern`, `statusMap` 필수. `statusMap`은 `{pass:[..], fail:[..], skip:[..]}` 필수, `fileError:[..]` 선택
    - `none`: 다른 키 없음
  - `isolate`: `{args}`. 자리표시자 `{file}`, `{name}`, `{namePattern}`, `{testId}`.
  - `keyInputs`: `{envNames, toolVersionCommands, dependencyPaths, artifactPaths}` 모두 필수(빈 배열 허용). `toolVersionCommands[]`는 `{executable, args}`. `dependencyPaths`는 worktree 밖 절대경로(전역 설치 등). `artifactPaths`는 worktree 기준 상대경로·glob.
  - `seedFiles[]`: `{source, dest}`. `source`는 cwd checkout 안 절대경로, `dest`는 worktree 기준 상대경로. revision에서 추적 중인 경로면 deny `seed_conflicts_tracked`.
- 치환 규칙
  - 자리표시자 `{worktree}`(args, cwd, env 값)와 `{arcNodeReporter}`(args만)를 치환한다. 셸 없음(`shell:false`).
  - `{arcNodeReporter}`는 `verify-cli.mjs`와 같은 디렉터리에 설치된 `node-test-reporter.mjs`의 절대 realpath다(§9.2). 이 파일 바이트는 다른 verify 모듈과 함께 키의 runtime 바이트에 포함된다.
  - `executable`은 실행 env의 PATH로 절대 realpath를 얻는다. 실패하면 deny `executable_not_found`.
  - `{glob}`은 revision tree(`git ls-tree -r`)에서 펼친다. 문법 `*`, `**`, `?`, 결과 정렬. 매치 0개면 hold `glob_empty`.
- 검증·deny: commit으로 해석되지 않는 `revision`은 deny `unknown_revision`. `snapshotWorkingTree:true`인데 cwd HEAD가 `revision`과 다르면 deny `revision_mismatch`. `role:"baseline"`과 `snapshotWorkingTree:true` 조합은 `invalid_request`.
- 출력(allow): `{runId, role, state, revision, commit, tree, cacheKeyPhase1, cacheKey|null, cacheable, uncacheableReasons[], cacheHit: true|false|"pending", reusedFrom?, worktree: {path}|null, snapshot?: {commit, tree, included[{status,path}], excluded{ignored[], submodules[]}}, queuedBehind[]}`. `detach:true`면 runner 시작 직후 `state`(queued/preparing)를 반환하고, `detach:false`면 끝날 때까지 실행한 뒤 `verify-status`와 같은 형태로 반환한다.

### 5.3 `verify-status`

- 필수 `runId`, 선택 `waitMs`(0~600000, 기본 0). 상태가 종료(`succeeded|failed`)나 `unknown`이 되거나 waitMs가 지나면 반환한다.
- 출력(allow): `{runId, role, state, phases[{name, startedAt, endedAt, ms}], load{class, cpus, start{loadavg}, samples[], overlaps[], declaredConcurrent}, summary{commands[{id, exitCode, signal, timedOut, wallMs, tests{total,passed,failed,skipped}, incomplete[{scope:"file"|"command", path?, reason}]}]}, cacheable, uncacheableReasons, cacheHit, heartbeatAt, pid, worktree{path, state}}`
- 상태 정의
  - `queued`: 같은 저장소에 활성 verify run이 있어 대기
  - `preparing`: worktree 생성·검증과 prepare
  - `running`: commands 실행
  - `succeeded`: 모든 command가 끝까지 실행됨(테스트 실패·타임아웃·incomplete도 결과로 포함)
  - `failed`: 인프라 실패(worktree·OID·clean 검증 실패, prepare 비0 종료, 저장 실패). 결과를 쓸 수 없음
  - `unknown`: 비종료 상태인데 heartbeat가 오래됨(§10.1) 또는 run.json을 읽을 수 없음
- deny `unknown_run`.

### 5.4 `verify-compare`

- 필수 `baseRunId`, `headRunId`. 선택 `topN`(1~100, 기본 10).
- 출력(allow): `{reportJson, reportMd, verdict: "no-new-failures"|"new-failures"|"candidates", counts{...}}`. 필드는 §9.6.

### 5.5 `verify-rerun`

- 필수 `runId`, `testId`, `attempt`(1부터 정수), `sandboxMode`. 선택 `limit`(1~10, 기본 3; brief가 다른 상한을 정할 때).
- 명시 호출 때만, foreground 동기 실행. 해당 run의 worktree에서 그 command의 `isolate.args`로 실행하고 시간 상한은 command `timeoutMs`.
- 출력(allow): `{runId, testId, attempt, limit, runStatus: "passed"|"failed"|"inconclusive"|"not-run", reason?, attempts[{attempt, status, ms}], passesInIsolation: "yes"|"no"|null}`. `isolate`가 없으면 `runStatus:"not-run"`, `reason:"no_isolation_template"`(종료 0). `passesInIsolation`은 기록된 시도 중 하나라도 `passed`면 `yes`, 그렇지 않고 `failed` 시도가 있으면 `no`, 미실행이거나 결론 있는 시도(`passed`·`failed`)가 없으면 `null`(v8 보완 반영).
- (v8) 시도의 통과 판정: 종료 코드만으로 정하지 않는다. 그 command의 `results`로 시도 출력을 파싱해 대상 테스트(`testId`의 file·suite·name)가 passed로 나와야 `passed`다. 대상이 결과에 없으면(필터가 0건을 고른 경우 등) 그 시도의 `status`는 `no_match`이고 통과로 세지 않는다. 파싱 결과가 incomplete이면 `status`는 `incomplete`이고 역시 통과로 세지 않는다. 시도가 모두 `no_match`·`incomplete`이면 `passesInIsolation`은 `null`이다.
- (v8 보완) 대상이 `skipped`로 파싱되면 그 시도의 `status`는 `skipped`이고 통과로도 실패로도 세지 않는다. 시도 `status`가 `failed`인 경우는 대상이 failed로 파싱된 때뿐이다. 최상위 `runStatus`는 이번 시도 기준 `passed`(대상 passed), `failed`(대상 failed), `inconclusive`(`no_match`·`incomplete`·`skipped`), `not-run`(isolate 없음) 중 하나다. 재실행 기록이 없는 테스트의 `passesInIsolation`은 compare 보고서에서도 `null`이다.

### 5.6 `verify-cleanup`

- 필수 `dryRun`(boolean), 그리고 `runId` 또는 `cacheKey` 중 정확히 하나.
- 출력(allow): `{dryRun, targets[{kind:"worktree"|"cache-record", path}], removed[], residualPaths[], cleanup{state}}`. 대상 판정·동작은 §8.5.

### 5.7 hold·deny 사유 코드

| 코드 | decision | 명령 | 해제 조건 |
|---|---|---|---|
| `invalid_request` | deny | 전부 | 입력 수정 |
| `bridge_child` | deny | 전부 | Orchestrator 프로세스에서 호출 |
| `unknown_revision` / `revision_mismatch` | deny | start | 올바른 OID 또는 HEAD 일치 |
| `executable_not_found` / `seed_conflicts_tracked` | deny | start | 입력 수정 |
| `unknown_run` | deny | status·compare·rerun·cleanup | 올바른 runId |
| `glob_empty` | hold | start | glob 수정 또는 파일 확인 |
| `storage_unavailable` | hold | 전부 | `<git-common-dir>/arc/verify`나 system temp에 쓸 수 있게 됨(host 승인 필요 가능) |
| `host_sandbox_blocked` | hold | 전부 | 쓰기 거부 원인 해소와 host 승인 |
| `snapshot_failed` | hold | start | 원인 확인 후 새 start(원본 상태 불변) |
| `unsafe_temp_path` | hold | start | 도구 임시 디렉터리와 상위 경로의 소유자·모드·심볼릭 링크 여부를 점검한 뒤 새 start(v8) |
| `run_incomplete` | hold | compare·rerun | 대상 run이 `succeeded` |
| `run_failed` | hold | compare | 새 start로 재기록(operator 결정) |
| `run_unknown` | hold | compare·cleanup | operator 확인 후 새 start, cleanup은 pid 종료 확인 |
| `role_mismatch` | hold | compare | base는 baseline, head는 head |
| `command_set_mismatch` | hold | compare | 양쪽 command id·템플릿 동일 |
| `prepare_mismatch` | hold | compare | prepare·seedFiles 다이제스트 동일 |
| `execution_mismatch` | hold | compare·rerun | sandboxMode·host·머신 식별자 동일 |
| `attempt_out_of_order` | deny | rerun | attempt = 기록된 시도 수 + 1 |
| `rerun_limit` | deny | rerun | 없음(상한 도달) |
| `run_active` | hold | cleanup | run이 종료 상태가 됨 |
| `not_tool_owned` | deny | cleanup | 없음(도구가 만든 것이 아님) |
| `cleanup_unsafe_path` | hold | cleanup | 도구 디렉터리의 소유자·모드·심볼릭 링크 여부를 점검한 뒤 재호출(v7) |
| `nested_worktree` | hold | cleanup | operator가 `nestedPaths`의 worktree·저장소를 옮기거나 정리한 뒤 재호출(v5) |
| `cleanup_partial` | hold | cleanup | residualPaths 점검 후 operator가 명시적으로 다시 호출 |
| `worktree_unclean` / `worktree_oid_mismatch` / `prepare_dirtied_tree` | run `failed` 사유 | start runner | 원인 확인 후 새 start |

## 6. 캐시 키 (A-S2)

### 6.1 구성 (두 단계, Orchestrator 수용)

두 단계 모두 정규화 JSON의 SHA-256(소문자 hex)이다.

**phase1 (worktree 없이 계산)**
- `commit` OID, `tree` OID
- `commands` 전체 기술자: id, executable realpath, args(펼친 파일 목록 포함), cwd, env, timeoutMs, results 전체, isolate
- `prepare` 전체 기술자, `seedFiles`(dest와 source 내용 SHA-256)
- `os.platform/arch/release`, `process.version`
- `{worktree}`를 참조하지 않는 `toolVersionCommands`: executable realpath, args, exit code, stdout+stderr SHA-256
- revision tree 안의 lockfile·`dependencyPaths` 대응 경로 blob OID (아래 dependency 해시와 별개)
- worktree 밖 `dependencyPaths` 각각의 내용 해시(§6.2)
- 실행 env 전체 값(§6.3)
- `TMPDIR` realpath와 `fs.statfsSync(TMPDIR).type`
- `hostPlatform`, `executionEnvironment`, `sandboxMode`
- `git --version`, `git config --get-regexp '^filter\.'` 출력 해시
- verify runtime 버전: `verify-cli.mjs`·`final-verify.mjs`·`test-results.mjs` 바이트 SHA-256과 파서 스키마 버전 상수
- 머신 식별자(§6.4)

**phase2 (prepare 후 worktree에서 계산)**
- `artifactPaths` 해시
- `{worktree}`를 참조하는 `toolVersionCommands` 출력 해시
- (v3) `{worktree}`를 포함한 PATH로 찾는 실행 파일의 realpath. 이 실행 파일은 worktree가 있어야 확인할 수 있다. 따라서 이런 실행 파일이 있으면 phase2가 비어 있지 않은 것으로 보고, 캐시 적중을 확인할 때도 worktree를 만든다. 적중하면 commands는 실행하지 않는다.
- prepare 후 `git status --porcelain=v1 --ignored` 요약 해시

**전체 키와 조회 순서**
- `cacheKey = SHA-256(phase1 ∥ phase2)`, phase2가 비어 있으면 `cacheKey = phase1`.
- phase2가 비어 있으면 start에서 바로 조회하고, 적중하면 worktree 없이 즉시 반환한다.
- phase2가 있으면 worktree 생성·prepare 후 조회한다. 적중하면 commands를 생략하고, miss면 같은 worktree에서 계속 실행한다(prepare 비용은 측정상 약 3.4초).

### 6.2 정규화

- JSON 키 사전순 정렬, 공백 없는 UTF-8.
- 순서가 의미 있는 배열(args, commands, prepare)은 순서 유지. 집합 의미 배열(envNames, dependencyPaths, artifactPaths 펼침 결과)은 정렬.
- worktree realpath로 시작하는 문자열은 `{worktree}`로 바꾸고, 경로 구분자는 POSIX(`/`)로 바꾼다.
- 경로 해시: 파일 `sha256(상대경로 \0 mode \0 내용)`, 디렉터리는 정렬된 하위 해시를 연결해 다시 해시, symlink는 대상 문자열을 해시(대상이 worktree·대상 루트 밖이면 uncacheable), 없는 경로는 `"absent"`.

### 6.3 실행 env (결정 2026-11-21: 허용 목록만 전달)

- runner가 자식 프로세스에 넘기는 env는 다음뿐이다.
  - 기본 목록 `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `TZ`, `PYTHONDONTWRITEBYTECODE` 중 설정된 것
  - `keyInputs.envNames`
  - command·prepare의 `env`
- 그 값 전부가 키에 들어간다. 나머지 상속 env는 넘기지 않으므로 키 밖 env가 결과에 영향을 줄 수 없다. `ARC_BRIDGE_CHILD`도 넘기지 않는다.
- 다른 env(예: `JAVA_HOME`, `CI`)가 필요한 저장소는 `envNames`에 적는다. 정책 새 절에 이 점을 적는다(§11 (5)).
- envNames에 지정한 변수가 없으면 `"absent"`로 기록한다(판정 가능).

### 6.4 머신 식별자

`sha256(machine.json.randomId, os.hostname(), os.platform(), os.arch(), os.cpus()[0].model, os.cpus().length, os.totalmem(), os.userInfo().uid, realpath(os.homedir()))`. `randomId`는 처음 쓸 때 `<git-common-dir>/arc/verify/machine.json`에 UUID v4로 만든다. `.git`이 다른 머신으로 복사되면 hostname·하드웨어 값이 달라 키가 갈리고, 같은 이름의 다른 머신은 randomId가 달라 갈린다.

### 6.5 uncacheable 조건 (재기록, 이 run은 캐시 재사용 대상에서 제외)

1. `sandboxMode: "unknown"`
2. `toolVersionCommands`가 비0 종료 또는 시간 초과(30초)
3. `dependencyPaths`/`artifactPaths`를 읽을 수 없음(권한 등) 또는 symlink가 범위 밖
4. `TMPDIR` realpath나 statfs를 얻을 수 없음
5. git 명령 실패로 tree나 filter 설정 판정 불가
6. 펼친 glob이 파일 수 상한(100000) 초과
7. 머신 식별자 계산 실패(`machine.json` 읽기·쓰기 실패)

uncacheable이어도 run은 실행하며 결과는 이번 비교에 쓸 수 있다.

### 6.6 재사용 금지 조건 (키가 같아도)

조회된 record는 다음을 모두 만족할 때만 적중이다.
- 요청이 `role:"baseline"`(head run은 이력에만 남고 재사용하지 않음)
- record의 run이 `succeeded`
- `load.class === "quiet"`(Q3: contended/unknown 기준선은 이번 비교에만 사용)
- 어떤 command에도 `timedOut`·`incomplete`·`output_truncated`가 없음
- record.json의 result 해시와 result.json 실제 해시가 일치(불일치는 miss, `cache_corrupt` 사유 보고)
- record가 cleanup으로 무효화되지 않음

## 7. 저장

- 위치 `<git-common-dir>/arc/verify/`(`git rev-parse --git-common-dir`의 realpath)
  - `runs/<runId>/run.json`, `raw/`(command별 stdout·stderr, 결과 파일 사본), `result.json`, `heartbeat.json`, `snapshot.index`
  - `cache/<cacheKey>/record.json`, `history.jsonl`
  - `cache/by-phase1/<phase1>.jsonl`(phase1에서 후보 키를 찾는 색인)
  - `reports/<baseRunId>..<headRunId>.json`, `.md`
  - `machine.json`
- 쓰기는 같은 디렉터리 임시 파일 → fsync → rename. 디렉터리 0700, 파일 0600. 구현은 `lib/runtime` 안 모듈만 쓴다.
- `runId`: `<UTC yyyymmddTHHMMSSZ>-<8 hex random>`.
- raw 스트림 상한 command당 64 MiB. 넘으면 잘라내고 `output_truncated`로 표시하며 그 command는 incomplete.
- 공유·동기화 없음.

## 8. clean worktree 수명 (A-S3)

### 8.1 위치

`<realpath(os.tmpdir())>/arc-verify/<repoHash>/<runId>/`(`repoHash`는 git-common-dir realpath SHA-256 앞 16자). 하위에 `owner.json`(`{tool:"arc-verify", runId, repoHash, commonDir, createdAt}`), `wt/`(worktree), `no-hooks/`(빈 디렉터리). 소유 표지는 worktree 밖에 있어 clean 판정에 영향이 없다.

### 8.2 생성

`git -c core.hooksPath=<runDir>/no-hooks worktree add --detach --lock --reason "arc-verify:<runId>" <wt> <commit>`. hook을 꺼 post-checkout이 실행되지 않고, lock으로 다른 곳의 prune에서 보호하며, branch는 만들지 않는다. `<git-common-dir>/worktrees/<name>` 등록은 사용자가 Q1에서 승인한 Git 상태 변경이며 Orchestrator 호출로만 일어난다.

(v8) 생성 시점 소유 전제: §8.5 판정 6과 같은 조건을 worktree 생성 전에 강제한다. `<tmp>/arc-verify`와 `<repoHash>`는 없으면 0700으로 만들고, 이미 있으면 심볼릭 링크가 아닌 실제 디렉터리이고 현재 사용자 소유이며 모드가 0700인지 `lstat`으로 확인한다. `<runId>`는 새로 만들어야 하며(이미 있으면 실패) 0700이다. 루트부터 `<tmp>/arc-verify`의 부모까지의 상위 디렉터리도 판정 6과 같은 조건(현재 사용자나 root 소유, group·other 쓰기가 없거나 sticky bit)을 만족해야 한다. `git worktree add` 직후 `wt`도 심볼릭 링크가 아닌 현재 사용자 소유 디렉터리여야 하며 모드를 0700으로 맞춘다. 하나라도 어긋나면 command를 실행하지 않고 hold `unsafe_temp_path`를 반환한다. worktree 생성 전에 걸리면 worktree를 만들지 않는다. 생성 뒤에 걸리면 §8.5 "start 쪽 실패" 규칙대로 남긴다.

### 8.3 미커밋 HEAD 스냅샷 (`snapshotWorkingTree: true`)

1. 원본 cwd에서 `GIT_INDEX_FILE=<runDir>/snapshot.index git read-tree <HEAD>`.
2. `git add -A -- .`(미추적 비무시 파일 포함, 삭제 반영).
3. `git write-tree`로 tree.
4. `git commit-tree <tree> -p <HEAD> -m "arc-verify snapshot"`(v4: 메시지 고정, runId는 `run.json`에 기록). author/committer는 고정 `arc-verify`, 날짜는 HEAD committer date(같은 HEAD·tree면 같은 OID).
5. 바뀌는 것은 object DB의 loose object뿐이다. ref, 원본 index, 작업 파일, reflog는 바뀌지 않는다. 스냅샷 commit은 worktree HEAD가 참조하므로 gc 대상이 아니다.
6. 보고: `included`는 `git diff-tree -r --name-status <HEAD> <tree>`, `excluded.ignored`는 `git ls-files --others --ignored --exclude-standard --directory`, `excluded.submodules`는 내용이 dirty한 submodule 경로(gitlink만 반영).
7. 실패하면 hold `snapshot_failed`, 임시 index는 진단용으로 남긴다.
8. (v8) 범위: 1~6의 Git 명령은 `--cwd`가 저장소의 하위 디렉터리여도 `git rev-parse --show-toplevel`의 작업 트리 최상위에서 실행한다. 그래서 스냅샷과 `included`·`excluded` 보고는 항상 작업 트리 전체를 다룬다.

### 8.4 clean·OID 검증 (위반이면 run `failed`, 자동 복구 없음)

- 생성 직후: `git -C wt rev-parse HEAD`가 `commit`과 같지 않으면 `worktree_oid_mismatch`. `git -C wt status --porcelain=v1 --untracked-files=all --ignored`가 비어 있지 않으면 `worktree_unclean`.
- seedFiles 복사 후: 그 경로만 미추적이어야 한다.
- prepare 후: 추적 파일 변경은 `prepare_dirtied_tree`. 새 ignored 경로 최상위 목록은 run.json에 기록.
- commands 후: status 요약은 보고만.

### 8.5 정리 (`verify-cleanup`, 명시 호출만, 자동 삭제 없음)

**대상 판정(모두 만족, 아니면 deny `not_tool_owned`)**
1. run.json의 worktree 경로 realpath가 `<tmp>/arc-verify/<repoHash>/<runId>/wt`와 같음
2. `owner.json`의 `tool`·`runId`·`repoHash` 일치
3. `git worktree list --porcelain`에 그 경로가 detached·기록 OID·lock reason `arc-verify:<runId>`로 있음
4. run 상태가 종료. 활성이면 hold `run_active`. unknown이면 `process.kill(pid, 0)`이 ESRCH일 때만 허용, 그 밖에는 hold `run_unknown`
5. (v5) 중첩 보호: 아래 중 하나라도 있으면 아무것도 지우지 않고 hold `nested_worktree`를 반환하며 발견 경로를 `nestedPaths`로 보고한다.
   - `git worktree list --porcelain`에 도구 worktree 경로 아래로 등록된 다른 worktree
   - 도구 worktree 안에서 루트가 아닌 위치에 있는 `.git` 파일 또는 디렉터리(다른 저장소의 worktree·clone)
   - (v6) 도구 worktree 안에서 Git 저장소 형태를 가진 디렉터리(`HEAD` 파일과 `objects/`·`refs/` 디렉터리를 함께 가진 bare 저장소 등)
   - 검사를 끝낼 수 없으면(읽기 실패 등) 같은 hold로 처리한다.
   - dryRun에서도 같은 검사를 하고 결과를 보고한다.
   - (v6) 실제 정리에서는 `git worktree unlock` 직후, `remove` 직전에 이 검사를 다시 한다.
   - (v6) 보장 범위와 한계: 도구 worktree는 도구가 만든 임시 디렉터리이므로, 위 감지에 걸리지 않는 일반 파일은 도구 소유로 보고 함께 지운다. 마지막 검사와 `remove` 사이에 다른 Git 프로세스가 중첩 worktree를 등록하는 경합은 원자적으로 막을 수 없으며 알려진 한계로 둔다.
6. (v7) 디렉터리 소유 전제: 삭제 전에 `<tmp>/arc-verify`, `<repoHash>`, `<runId>`, `wt`가 모두 심볼릭 링크가 아닌 실제 디렉터리이고 현재 사용자 소유이며 모드가 0700인지 확인한다(`lstat`). 하나라도 아니면 아무것도 지우지 않고 hold `cleanup_unsafe_path`를 반환한다. 이 전제에서 도구 디렉터리를 바꿀 수 있는 주체는 같은 사용자뿐이다. 이 전제를 강제하기 위해 루트부터 `<tmp>/arc-verify`의 부모까지 각 상위 디렉터리도 `lstat`으로 확인한다. 각 디렉터리는 현재 사용자나 root 소유여야 하고, group·other 쓰기가 없거나 sticky bit가 있어야 한다. 하나라도 어긋나면 같은 hold로 처리한다(v7 보완, 사용자 확인 2026-11-21). Git 재귀 삭제 중에 같은 사용자 프로세스가 하위 디렉터리를 심볼릭 링크로 바꿔치기하는 경합은 v6 경합 한계에 포함한다.

**동작**
- `dryRun:true`는 대상만 나열.
- 실제 정리 순서: `git worktree unlock` → `git worktree remove --force <wt>`(도구가 만든 테스트 산출물 포함) → `<runId>` 디렉터리의 `owner.json`·`no-hooks` 제거 → 빈 상위 디렉터리 제거. `runs/<runId>/` 증거 기록은 남긴다.
- `cacheKey` 대상은 `record.json`을 `record.removed.json`으로 rename해 무효화하고 `history.jsonl`은 남긴다.
- 디렉터리가 이미 없고 등록만 남은 경우 전역 `git worktree prune`을 쓰지 않는다. 등록 경로를 `residualPaths`에 넣고 hold `cleanup_partial`.

**부분 완료:** run.json에 `cleanup:{state:"partial", removed[], residualPaths[]}`를 기록하고 hold `cleanup_partial`. 자동 재시도 없음, operator 점검 후 명시 재호출(이미 지운 항목은 건너뜀).

**start 쪽 실패:** worktree를 만든 뒤 실패하면 worktree는 남기고 run.json에 `worktree.state:"retained"`와 실패 단계를 기록한다. 정리는 `verify-cleanup`으로만.

## 9. 결과 파서·비교·보고 (A-S4)

### 9.1 식별자

`file::suite1/suite2::name#k`. `file`은 worktree 기준 POSIX 상대경로(절대경로·`file://`·worktree realpath 접두사 제거, 모르면 `-`), `suite`는 중첩 suite 이름을 `/`로 연결(없으면 빈 문자열), `k`는 같은 command 안 같은 (file, suite, name)의 순번(1부터). 비교 단위는 `(commandId, testId)`.

(v9) `suite`와 `name` 안에 worktree 경로가 나타나면 `{worktree}`로 바꾼 뒤 식별자를 만든다. 대상은 worktree realpath와, realpath를 거치기 전의 `os.tmpdir()` 기준 경로다(예: macOS의 `/var/...`와 `/private/var/...`). 이 경로는 run마다 다르므로, 바꾸지 않으면 같은 테스트가 run마다 다른 식별자를 갖는다. 예를 들어 Python subTest 매개변수에 파일 경로가 들어가면 기준선 실패가 '새 실패'와 '사라진 테스트'의 쌍으로 갈라진다. 바꾸는 범위는 이 경로 문자열뿐이고 나머지 이름은 그대로 둔다. 순번 `k`는 바꾼 뒤의 (file, suite, name)으로 센다. 보고서의 이름도 바꾼 값으로 쓴다. 경로의 시작과 끝은 다음 규칙으로 정한다.
- 시작: 문자열 시작, 또는 공백·인용부호·`=`·`(`·`:`·`,`·`[`·`{`·`file://` 바로 뒤.
- 끝: 경로 구분자 뒤는 늘 경로의 일부다. 인용부호로 시작한 경로는 같은 인용부호에서만 끝난다. 인용부호가 없으면 문자열 끝이나 공백에서 끝나고, 괄호 문맥에서는 닫는 괄호나 `,`에서도 끝난다.
- 그래서 `'…/wt,other'`, `'…/wt other'`, `'…/wt:other'`는 worktree 경로가 아니므로 바꾸지 않는다.
- 인용된 값 안에서도 쉼표나 공백 뒤는 새 경로의 시작으로 본다. 경로 목록이 들어간 값(예: `'/a,<worktree>/b'`)에서 worktree 경로를 빠뜨리지 않기 위해서다. 이 규칙 때문에 쉼표·공백을 포함한 다른 경로의 일부가 바뀔 수 있다.
- 한계: 인용부호 없이 `<worktree>.`·`<worktree>;`처럼 위 끝 규칙에 없는 문자로 끝나는 경로는 바꾸지 않는다. 이런 이름은 run마다 달라서 새 실패·사라진 테스트의 쌍으로 보고될 수 있다. 실패를 숨기는 방향은 아니다.

치환 충돌: 바꾸기 전 원래 표기가 서로 다른 테스트가 바꾼 뒤 같은 (file, suite, name)이 될 수 있다. 원래 표기는 suite의 각 요소와 name을 모두 포함한다. 예를 들어 경로 표기만 다르거나, 위의 쉼표·공백 규칙으로 다른 경로 일부가 바뀐 경우다. 이 경우 순번 `k`는 run 안의 출현 순서에만 기대므로, 기준선과 HEAD 사이에서 구성이나 순서가 바뀌면 다른 테스트끼리 짝지어질 수 있다. 그래서 어느 한 run에서라도 이런 충돌이 생긴 (commandId, file, suite, name)에 속한 HEAD 실패는 `baselineReproduced`로 흡수하지 않는다. 대신 `newFailureCandidates`에 사유 `normalized_name_collision`으로 올린다(§9.4-4). 원래 suite와 name이 완전히 같은 중복 테스트는 치환 충돌이 아니므로 이 규칙의 대상이 아니다. 재실행할 때는 저장해 둔 원래 이름(바꾸기 전 경로 표기)으로 isolate 인자를 만든다. 재실행 출력의 결과는 원래 표기(suite의 각 요소와 name)가 대상과 같을 때만 그 대상의 attempt로 인정한다. 바꾼 뒤 이름이 같아진 다른 테스트(다른 `k`)의 결과만 있으면 attempt는 `no_match`다.

### 9.2 파서 4종 (`lib/runtime/test-results.mjs`)

**junit-xml**(의존성 없는 최소 파서)
- 수용: XML 선언, 주석, PI(건너뜀), CDATA, 요소 `testsuites`/`testsuite`(중첩)/`testcase`와 자식 `failure`/`error`/`skipped`, 속성 `name`·`classname`·`file`·`time`, 엔티티 5종과 숫자 문자 참조.
- `<!DOCTYPE`/외부 엔티티 거부. 파싱 오류는 그 command incomplete `parse_error`.
- 분류: `failure`·`error`는 failed, `skipped`는 skipped, 나머지 passed.
- `file` 출처 우선순위: testcase@file → 상위 testsuite@file → 경로처럼 보이고 worktree에 있는 testsuite@name → `-`.
- (v8 보완) 이름·location에서 파일을 추론할 때 "worktree에 있는 파일"은 worktree 안의 경로이고, 그 경로와 중간 경로 요소 어느 것도 심볼릭 링크가 아닌 일반 파일이라는 뜻이다(`lstat`). worktree 안을 가리키는 심볼릭 링크도 `-`이다. tap 추론에도 같은 판정을 쓴다. (v8 보완 N5) 하위 테스트가 없는 실패 test point의 설명이나 location이 worktree 안의 심볼릭 링크 경로(경로 자체나 중간 요소가 링크)로 해석되면, 파일 정체성으로 쓰지 않는다. 대신 그 command를 incomplete `symlinked_test_file`로 둔다. 파일 load 실패를 이름 있는 실패로 남겨 기준선에 흡수하지 않기 위해서다. "worktree 안"은 정규화한 경로가 worktree 안이라는 뜻이다. 링크 대상의 위치(worktree 밖)나 존재 여부(끊긴 링크, 링크된 디렉터리 아래의 없는 파일)와 관계없이 적용한다. `suite`는 중첩 testsuite@name과 classname.
- testcase 없이 `error`가 있거나 errors>0인 testsuite는 그 파일 incomplete `file_error`.

**tap**(13/14)
- 수용: `TAP version`, plan `1..N`, `ok`/`not ok` [번호] [- 설명], `# SKIP`/`# TODO`, 4칸 들여쓰기 하위 테스트와 `# Subtest:`, YAML `---`…`...`의 `duration_ms`·`location`(`path:line:col`).
- `not ok`+TODO는 failed가 아니다. SKIP은 skipped.
- `file`: YAML `location` 경로 → 경로인 최상위 하위 테스트 이름 → `-`. node 내장 tap은 통과 test point에 `location`이 없으므로 node:test에는 ARC node reporter를 쓴다.
- 하위 테스트 없이 실패한 test point로서 설명이나 location이 worktree 파일로 해석되면 그 파일 incomplete `file_error`.
- `Bail out!`, plan 수 불일치는 command incomplete.
- (v8) 최상위 plan `1..N`이 없으면 command incomplete `plan_missing`.

**ARC node reporter**(`lib/runtime/node-test-reporter.mjs`, 결정 2026-11-21)
- 배경: node 22 내장 reporter(tap, junit)는 실패한 test point에만 파일 위치를 적는다(node v22.18.0 실측 2026-11-21). 통과 테스트는 파일을 알 수 없어, 다른 파일의 같은 이름 테스트를 구분하지 못한다.
- node:test custom reporter(기본 export, 이벤트 async generator)다. `node:` 내장 모듈만 import한다. 사용 예: `node --test --test-reporter={arcNodeReporter} --test-reporter-destination=stdout <files>`. 결과 형식은 `junit-xml`, `stream:"stdout"`이다.
- 출력: `testsuites` 루트 아래 `describe`(suite)마다 중첩 `testsuite name`을 두고, 각 test는 `testcase name file time`이다. `file`은 이벤트 `data.file`의 절대경로이고 파서가 §9.1로 정규화한다. `time`은 초 단위다. 실패는 `<failure message>`, skip은 `<skipped/>`, todo는 `<skipped message="todo"/>`다.
- 파일 load 실패(그 파일의 최상위 실패 test로서 하위 테스트가 없고 이름이 그 파일 경로인 경우)는 `<testsuite name=<file> file=<file> errors="1">`에 `<error>`만 두고 testcase는 두지 않는다. 그러면 junit-xml 규칙에 따라 그 파일이 incomplete `file_error`가 된다.
- node:test 외 프레임워크는 각자의 junit 출력(예: pytest `--junitxml`, jest-junit, go-junit-report) 또는 tap/regex를 쓴다.

**regex**
- 줄 단위로 `pattern`(JS RegExp, 플래그 없음) 적용. 명명 그룹 `status`·`name` 필수, `file`·`suite`·`duration`(ms) 선택.
- `status`는 `statusMap` 목록으로 분류. `fileError`면 그 `file` incomplete. 어느 목록에도 없으면 무시하고 `unmappedStatusCount`에 센다.
- 예(Python unittest -v, stderr): `^(?<name>\w+) \((?<suite>[\w.]+)\) \.\.\. (?<status>ok|FAIL|ERROR|skipped)`(정확한 패턴은 plan에서 확정).

**none:** 종료 코드만. 0이면 command pass, 그 밖은 command fail.

### 9.3 incomplete/unattributed 판정 (none 제외)

- 비0 종료·signal·timeout인데 파싱된 failed가 0이면 command incomplete `unattributed`.
- (v8) timeout이나 signal 종료는 파싱된 failed 수와 상관없이 항상 command incomplete다(`timeout`, `signal`). 끝까지 실행되지 않은 command의 결과는 완전한 결과로 보지 않는다.
- (v8) 파서 안의 예기치 않은 예외는 그 command incomplete `parse_error`로 기록하고 run은 계속 진행한다.
- 파싱 결과 0건은 command incomplete `no_results`.
- 파싱 오류·결과 파일 없음·출력 잘림은 command incomplete(`parse_error`, `results_missing`, `output_truncated`).
- 종료 0인데 failed가 있으면 그대로 기록.

### 9.4 비교 분류 (`verify-compare`)

**전제(아니면 hold):** 두 run 모두 `succeeded`, base는 `baseline`·head는 `head`, 같은 repoHash·머신 식별자·`sandboxMode`·`hostPlatform`, command id 집합과 템플릿 동일(glob 펼침 전 기준), prepare·seedFiles 다이제스트 동일.

**분류(command id별)**
1. `newFailures`(finding): head에서 failed인데 base에서 passed·skipped이거나 base에 없는 테스트(완전한 파일에 한함)
2. `baselineReproduced`: 양쪽 failed
3. `baselineNotReproduced`: base failed, head passed(보고만)
4. `newFailureCandidates`(흡수 금지): base에서 incomplete인 파일·command에 속한 head 실패, head에서 incomplete인 파일·command(이름 대신 incomplete 사유), none 형식 command가 head에서 실패(base도 실패했어도 명령 단위 후보), (v9) base·head 중 한쪽이라도 치환 충돌(§9.1)이 있는 (file, suite, name)에 속하고, 이 규칙이 없으면 `baselineReproduced`로 분류됐을 head 실패(사유 `normalized_name_collision`). 충돌 여부는 각 run의 저장 결과에 기록해서 캐시로 재사용한 기준선에서도 판정한다.
5. `disappearedTests`, `addedTests`(완전한 파일 기준, 보고만)
6. `addedFiles`, `removedFiles`(glob 펼침 차이)
7. `intermittentCandidates`(§9.5)

**verdict:** `newFailures` 1건 이상이면 `new-failures`, 아니고 후보(4 또는 7)가 있으면 `candidates`, 둘 다 없으면 `no-new-failures`. 최종 판정(disposition)은 Orchestrator.

### 9.5 간헐 후보

- 판정(하나라도 해당): 같은 `cacheKey`의 `history.jsonl` 안 succeeded run 사이에서 같은 `(commandId, testId)` 결과가 다름, 같은 테스트의 `verify-rerun` 시도 사이 결과가 다름, 원 실패 뒤 단독 재실행에서 통과.
- (v8 보완) rerun 시도 사이 비교는 `status`가 `passed`·`failed`인 시도만 쓴다. `no_match`·`incomplete`·`skipped` 시도는 결과가 다른 것으로 세지 않는다.
- 별도 섹션에 run별 결과·load class와 `passesInIsolation`·시도 수를 보고한다.
- 단독 통과는 원 실패를 지우지 않는다. 원래 분류(new/baseline)를 유지하고 후보 표지만 붙인다. head 테스트의 단독 재실행 실패는 `newFailures` 근거로 남는다.

### 9.6 보고서

**JSON:** `schemaVersion`, `base{runId,commit,tree,load,cacheHit,reusedFrom}`, `head{...}`, `conditions{machineId,os,node,sandboxMode,hostPlatform,executionEnvironment,tmpdir{realpath,fsType},envNames,prepareDigest,seedDigest}`, `commands[{id, base{exitCode,wallMs,tests,incomplete}, head{...}}]`, `newFailures[]`, `baselineReproduced[]`, `baselineNotReproduced[]`, `newFailureCandidates[{commandId,testId|null,reason}]`, `intermittentCandidates[{commandId,testId,history[],reruns[],passesInIsolation}]`, `disappearedTests[]`, `addedTests[]`, `addedFiles[]`, `removedFiles[]`, `slowest{files[],tests[],phases[]}`(각 상위 `topN`), `verdict`, `generatedAt`.

**md 순서:** 기록 조건, 명령별 합계·wall, 새 실패, 기준선 재현, 미재현, 간헐 후보, 새 실패 후보(incomplete·none·이름 있는 후보), 사라진·새 테스트, 느린 상위 N(파일·테스트·prepare 단계).

## 10. runner·부하·host (A-S5)

### 10.1 runner 수명

- `detach:true`: `final-verify.mjs`가 자신을 runner 진입점으로 띄운다. `spawn(process.execPath, [<final-verify.mjs>, "--run", runDir], {detached:true, stdio:"ignore", env:<§6.3 허용 목록 + runner 내부 변수>, cwd:runDir})`, `unref()`(패턴 근거 `lib/runtime/role-supervisor.mjs:321-325`).
- `detach:false`: 같은 프로세스에서 동기 실행.
- 단계 전환마다 run.json 갱신, `heartbeat.json {at, pid}`를 2초마다 기록. 비종료 상태에서 heartbeat가 15초 넘게 갱신되지 않으면 status는 `unknown`(상수, 테스트로 고정).
- 자식 command는 `shell:false`, `detached:true`(프로세스 그룹). timeout이면 그룹에 SIGTERM, 10초 뒤 남아 있으면 SIGKILL, `timedOut` 기록. 자식 pid는 run.json에 기록.
- (v8) runner 안의 예기치 않은 예외(§9.3 파서 예외 제외)는 run을 `failed`로 바꾸고 실패 단계와 메시지를 run.json에 기록한 뒤 heartbeat를 멈춘다. 비종료 상태로 남기지 않는다. `detach:false` 호출은 같은 `failed` 상태를 `verify-status` 형태로 반환한다.
- runner 비정상 종료 결과는 `unknown`이며 남은 자식 pid 목록을 보고한다. 자동 재시작·재시도·자동 kill 없음. 새 기록 여부는 operator가 정한다.
- 같은 repoHash에 활성 run(비종료이고 heartbeat 생존)이 있으면 새 run은 `queued`로 기다린다(기본 비동시). `declaredConcurrent:true`도 큐를 우회하지 않고 부하 표지만 바꾼다. foreground run도 같은 큐를 따른다.

### 10.2 부하 기록과 분류

- 기록: 시작 전 `os.loadavg()`와 `os.cpus().length`, 실행 중 30초마다 loadavg·freemem 표본(참고용), 실행 구간이 겹친 다른 verify run의 runId, `declaredConcurrent`.
- 분류(상수는 unit test로 고정)
  - `unknown`: loadavg 사용 불가(win32 `[0,0,0]`) 또는 표본 누락(runner unknown)
  - `contended`: `declaredConcurrent`, 겹친 verify run, 시작 loadavg1/cpus ≥ 0.5, 실행 중 표본 loadavg1 > cpus × 1.5 중 하나라도 해당
  - `quiet`: 그 밖
- Orchestrator가 무거운 검사를 따로 동시에 돌릴 계획이면 `declaredConcurrent:true`로 증언한다(§11).

### 10.3 host별 동작

| host | 호출 승인 | sandboxMode | detach |
|---|---|---|---|
| claude | ARC 고유 호출별 승인 규칙 없음(host 도구 권한) | 보통 `none` | 기존 bridge supervisor가 같은 detached 패턴으로 동작. verify runner 생존은 dogfood로 재확인 |
| codex | `verify-*` 호출마다 escalation 승인(`.git`과 system temp에 씀). 승인 호출은 `escalated` | `escalated` 또는 `sandboxed`(쓰기 거부 시 `host_sandbox_blocked`) | supervisor 생존은 변형 조건 관측(`coordination.md:154`), verify runner와 sandbox 안 `.git` 쓰기는 미확인(§13) |
| grok | `verify-*` 호출마다 승인(`coordination.md:168`과 같은 형식) | `none`/`unknown`(감지 없음) | 미확인, 기본 `detach:false` |
| gemini | ARC 고유 규칙 없음, host 명령 확인을 따름 | `none`/`unknown` | 미확인, 기본 `detach:false` |

- 호출 수 최소화: start 1회, status(`waitMs` 최대 600000) n회, compare 1회. rerun·cleanup은 필요할 때만.
- foreground 실행을 host 자체 백그라운드 기능으로 돌리는 것은 Orchestrator의 선택이다.
- task QA brief는 진행 중인 기준선 runId를 인용할 수 있고 비교만 완료를 기다린다.

## 11. 정책 문서 변경 (A-S6, 영어 문장)

네 사본 `{claude,codex,gemini,grok}/skill/references/verification.md`의 `## Test scope and result comparison` 절에 같은 위치·같은 문장으로 넣는다. 기존 문장은 모두 그대로 둔다.

**(1) Final verification 문단:** "Orchestrator then performs the result comparison below" 바로 앞. 문단 끝(`and records the verdict. ${finalFailureRule}`)은 건드리지 않는다(`test-scope-contract.test.mjs:179-184`).
> Run it in a clean detached worktree of the verified HEAD commit, prepared with the same prerequisites as the baseline, for example through the runtime [final verification commands](#final-verification-runtime-commands); uncommitted changes MAY be captured as a snapshot commit without changing refs, the index or working files, reporting included and excluded paths.

**(2) Full regression 문단 끝:**
> Full regression uses the same clean worktree and prerequisites as the baseline.

**(3) Baseline 문단:** "NEVER absorb them as baseline failures." 뒤. 기존 구간 `commands, environment, revision and failures by test name, covering … A file-level load`는 보존(`:186-190`).
> Orchestrator MAY record the baseline in the background in a separate clean worktree immediately after base approval while continuing independent work, but MUST complete it before the result comparison. Record its load (quiet, contended or unknown), and by default DO NOT run baseline and HEAD verification concurrently. Reuse a cached baseline only when every cache key input matches and the cached run was quiet and complete; a missing, unreadable or differing input requires a fresh record, and a contended or unknown baseline serves only the current comparison.

**(4) Result comparison 문단:** "Report baseline failures separately." 뒤. 단독 재실행 문장들은 그대로.
> Identify tests by name from structured results such as JUnit XML, TAP or a declared line pattern; a failure without a test name, or in a command or file whose results are incomplete, is a new-failure candidate, never a baseline failure. Report intermittent candidates, tests whose outcomes differ across runs with the same inputs, separately from baseline and new failures. Report the slowest files and tests (default ten) for information only.

**(5) 새 절:** Result comparison 문단 뒤, `<a id="risk-scaled-execution"></a>` 앞(test-scope 본문은 다음 `<a id="`에서 끝나므로 기존 `sectionPhrases`는 본문 안에 남음, `:48-52`).

```
<a id="final-verification-runtime-commands"></a>
## Final verification runtime commands

Orchestrator MAY run `node <skill>/runtime/verify-cli.mjs <command> --cwd <workspace> --workflow <id> --input -` with `verify-start`, `verify-status`, `verify-compare`, `verify-rerun` or `verify-cleanup`. The commands reject bridge children, never retry, restart or delete automatically, create worktrees only under the system temporary directory and store records under `<git-common-dir>/arc/verify`. Commands receive only a fixed environment allowlist plus declared `envNames` and command `env`, all of which enter the cache key; declare any other variable a check needs. Use `detach: true` only on a host whose detached-process survival is verified in [coordination](coordination.md); otherwise run with `detach: false`, through the host's own background facility where available. `verify-rerun` runs one isolated attempt per call within the rerun limit, and `verify-cleanup` removes only worktrees the tool created and recorded, on explicit request.
```

**(6) `handoff-prep.md` `### Verification brief inputs`(:95) 기존 문장 뒤:**
> While a background baseline run is still active, the brief MAY cite its `runId` and recording conditions instead of the completed record; the executor's comparison waits for its completion.

**(7) `coordination.md`:** 기존 문장은 바꾸지 않고(`composite-instructions.test.mjs`가 단언) 바로 다음에 bullet 추가.
- Codex(claude 사본 :153, codex 사본 :151):
  > On a Codex host ask for the same escalation approval each time a `verify-*` command (`verify-start`, `verify-status`, `verify-compare`, `verify-rerun`, `verify-cleanup`) runs, because it writes `<git-common-dir>/arc/verify` and the system temporary directory; record an approved call as `sandboxMode: "escalated"`. Detached survival of the verify runner is unverified; use `detach: false` until it is verified.
- Grok(:168):
  > On a Grok host ask the user for approval the same way each time a `verify-*` command runs. Detached survival of the verify runner is unverified; use `detach: false`.
- Gemini:
  > Detached survival of the verify runner is unverified on a Gemini host; use `detach: false`.
- Claude: 해당 블록에 생존 관측 문장(dogfood 결과 후 확정; 미확인이면 Gemini와 같은 형식의 미확인 문장).

**`lib/policy/role-policy.json`: 변경하지 않는다.** 관련 규칙은 `review.final-plan-recheck`와 `scope.non-escalation`(baseline/current 분류)뿐이고, 실행 위치·캐시와 충돌하지 않으며 실행 주체(Orchestrator)와 비교 원칙(테스트 이름)도 바뀌지 않는다. `check:role-policy` 생성물 변경 없음.

## 12. 영향 파일 · 테스트 · 인수 기준 (A-S7)

### 12.1 영향 파일

- 신규 원본: `lib/runtime/verify-cli.mjs`(진입점·옵션·키 검증·종료 코드), `lib/runtime/final-verify.mjs`(키·저장·worktree·snapshot·runner·부하·캐시·rerun·cleanup), `lib/runtime/test-results.mjs`(파서 4종·식별자·비교·보고서), `lib/runtime/node-test-reporter.mjs`(ARC node reporter, §9.2)
- 생성 미러: `shared/skill/runtime/{verify-cli,final-verify,test-results,node-test-reporter}.mjs`(`node scripts/update-runtime-assets.mjs`)
- 인벤토리: `lib/installer/runtime-assets.mjs` `RUNTIME_MODULE_PATHS`에 네 경로를 정렬 위치에 추가. `COOPERATIVE_RUNTIME_MODULES`(`bootstrap.mjs:7-12`)에는 추가하지 않는다(gate 판정에 쓰이지 않음, install-only는 runtimeHash 보존). `cooperative-9`와 baselineHash 불변.
- 수정하지 않음: `lib/runtime/command.mjs`, `lib/runtime/cli.mjs`.
- 문서: 네 사본 `verification.md`, `handoff-prep.md`, `coordination.md`.
- manifest·설치: `MANIFEST.sha256` 재생성, `tests/node/fixtures/installed-layout-golden.json`(각 설치 항목에 `skills/arc/runtime/` 세 파일 해시 추가, `node tests/node/fixtures/installed-layout.mjs --write`), installer parity(`scripts/check-installer-parity.mjs`) 통과. 새 런타임 파일이 parity 목록에 자동 포함되는지는 plan에서 확인.

### 12.2 테스트 전략

**ARC node reporter:** 실제 `node --test --test-reporter=<reporter>`를 픽스처 파일에 실행한다. 두 파일의 같은 이름 테스트가 서로 다른 `file`을 갖고, `describe` 중첩이 suite가 되며, load 실패 파일이 `file_error`가 되고, skip/todo가 분류되는지 확인한다. 출력은 junit-xml 파서를 거쳐 검증한다.

**단위(신규 `tests/node/runtime-test-results.test.mjs`):** junit-xml(정상, 중첩, 엔티티, CDATA, DOCTYPE 거부, file_error), tap(13/14, node `# Subtest`, YAML `location`/`duration_ms`, TODO/SKIP, Bail out, plan 불일치), regex(statusMap, fileError, unmapped), none, 식별자 정규화와 `#k`, unattributed/no_results, 비교 분류 전 항목과 verdict, 간헐 후보(이력·rerun), 보고서 필드와 topN.

**단위·통합(신규 `tests/node/runtime-final-verify.test.mjs`):** tmp git 저장소 픽스처, 명령은 `process.execPath -e`로 TAP/JUnit 출력.
- 입력 검증: 명령별 정확 키, 중첩 키, deny `invalid_request`, `bridge_child`
- 캐시 키: 정규화 결정성, 각 키 항목을 하나씩 바꾸면 miss, uncacheable 7조건, 재사용 금지 6조건(contended·unknown·head·timeout·corrupt·removed)
- env 허용 목록: 목록 밖 env가 자식에 전달되지 않음, envNames 값 변경이 miss를 만듦
- worktree: `--detach`·lock 등록, hook 비활성(post-checkout 픽스처), clean·OID 위반이면 failed
- snapshot: 원본 index·ref·작업 파일 바이트와 mtime 불변, included·excluded 보고, 같은 tree면 같은 OID
- 비대칭 회귀: 메인 checkout의 ignored 파일 때문에 실패하는 픽스처 테스트가 clean worktree head run에서는 통과(`manifest.test` 16건 사례의 축소판)
- runner: detach 시작, heartbeat, runner 강제 종료 시 `unknown`·자동 재시작 없음, timeout 그룹 SIGTERM/SIGKILL, queued 직렬화
- 부하 분류: loadavg·표본 주입으로 상수 경계 확인
- cleanup: dryRun, 남이 만든 worktree deny `not_tool_owned`, 활성 run hold, partial, 캐시 무효화. 원본 checkout·사용자 worktree 불변

**계약·기존 테스트 갱신:** `tests/node/test-scope-contract.test.mjs`(새 문장 4개와 새 절의 앵커·위치·1회 등장, 기존 단언 유지), `tests/node/composite-instructions.test.mjs`(기존 문장 유지와 새 bullet), `tests/node/runtime-assets.test.mjs`(`expectedPaths`), `tests/node/runtime-versions.test.mjs`(변경 없이 통과: baselineHash 불변이 진입점 결정의 핵심 증거), manifest·installed-layout golden 검증 테스트(plan에서 파일 지정).

**check 4종:** `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`.

**dogfood 실측(최종 검증 단계, Orchestrator)**
1. 이 저장소 base에서 `verify-start`(role baseline): node 전체(ARC node reporter, junit-xml stdout), Python(regex), check 4종(none).
2. 같은 입력으로 다시 start해 cacheHit 확인.
3. HEAD로 head run 실행 후 compare.
4. 기록: 수동 기준선과 실패 이름 목록 일치, 메인 checkout ignored 파일이 있어도 manifest 가짜 실패 0건, 시간과 부하 class, host별 detach 생존(가능한 host만).

### 12.3 인수 기준

- AC-1(A-C1): 입력 commands를 그대로 실행한다(생략·필터·샤딩 없음). 펼친 파일 목록이 보고서에 남는다.
- AC-2(A-C2): 보고서에 기준선 실패·새 실패·후보·간헐 후보가 별도 필드로 있다. rerun은 3회(또는 limit) 이하, yes/no와 횟수 보고. 단독 통과 뒤에도 원 분류 유지.
- AC-3(A-C3): §6.5·§6.6 각 조건마다 miss 또는 uncacheable이 되는 단위 테스트 통과.
- AC-4(A-C4): detach 기준선이 진행되는 동안 다른 명령 사용 가능. 미완료 compare는 hold `run_incomplete`. 부하 class 기록.
- AC-5(A-C5): 저장 위치 `<git-common-dir>/arc/verify`, 머신 식별자가 다르면 miss.
- AC-6(A-C6): 비대칭 회귀 테스트와 dogfood에서 가짜 새 실패 0건.
- AC-7(A-C7): 파서 4종 단위 테스트 통과, 파일 단위 실패는 incomplete.
- AC-8(A-C8): `slowest`에 파일·테스트·단계 상위 N.
- AC-9(A-C9): 네 사본 같은 문장, 계약 테스트·check 4종 통과, role-policy 무변경, runtime-versions baselineHash 불변.
- AC-10(preservation): 모든 테스트에서 원본 checkout의 ref, index, 작업 파일, 사용자 worktree 불변.

### 12.4 전체 회귀 잠정 판단

실행. trigger 1: 정책 문서는 에이전트가 실행 시 읽는 공유 입력이고, `RUNTIME_MODULE_PATHS`·MANIFEST·golden·생성 미러는 installer·manifest 경로가 함께 소비한다. 기존 공개 인터페이스를 제거·변경하지 않으므로 trigger 4는 해당하지 않는다.

## 13. 미확인 사항 (plan 단계 확인 항목)

1. Codex host: sandbox 안 `<git-common-dir>`·`os.tmpdir()` 쓰기 가능 여부 근거 없음(정책은 호출마다 escalation 전제). verify runner detached 생존 미확인.
2. Grok·Gemini host: detached 생존 근거 없음, 기본 foreground. (Grok 승인 서술 위치 `coordination.md:168`은 확인됨.)
3. (해결) `COOPERATIVE_RUNTIME_MODULES`: gate 판정 모듈과 전이 의존만 대상, install-only 제외(`runtime-versions.test.mjs:19-50`, `bootstrap.mjs:7-21`).
4. 디렉터리가 사라진 lock 등록에 대한 `git worktree remove` 동작(git 버전별).
5. (해결 2026-11-21) node v22.18.0 내장 tap은 실패 test point에만 `location`이 있다. load 실패는 하위 테스트 없는 `not ok`이고 설명과 location이 그 파일이다. ARC node reporter로 해결한다(§9.2).
6. installer parity 목록과 installed-layout golden 검증 테스트의 정확한 파일명.
7. win32 loadavg `[0,0,0]` → unknown 경로와 프로세스 그룹 kill 동작. (v8) win32에는 `process.geteuid`가 없으므로 §8.2·§8.5 판정 6의 소유자 검사가 통과하지 못한다. 그래서 `verify-start`는 hold `unsafe_temp_path`, cleanup은 hold `cleanup_unsafe_path`가 된다(소스 추론, 미실측). win32 지원은 후속 과제이며 이번 범위에서는 알려진 한계다.
8. (v9) 파서 schema가 다른 run 사이의 compare·rerun 제한은 후속 과제다(Reviewer V9-7). 알려진 한계 두 가지가 있다. 첫째, v8 형식 base와 v9 head를 직접 비교하면 경로가 든 이름은 서로 다른 규칙의 testId가 되어 가짜 새 실패로 보고될 수 있다. 둘째, `originalSuiteParts`가 없는 이전 형식 result의 중첩 suite 테스트를 재실행하면 원래 표기가 맞지 않아 attempt가 늘 `no_match`(`runStatus:"inconclusive"`)가 된다(Reviewer V9-9). 두 경우 모두 실패를 흡수하는 방향은 아니다. 이전 형식 run이 대상이면 `verify-start`로 새로 기록한다.

## 14. builder 재량

§12.1 범위 안에서 모듈 내부 함수 구성·상수 이름·파일 분할, glob 최소 구현, XML/TAP 파서 방식(정규식·상태기계), 이 저장소 dogfood 입력 JSON(regex 패턴, reporter 인자), md 보고서 세부 서식.

## Revision history

| Version | Date | Change | Approval |
|---|---|---|---|
| v1 | 2026-11-21 | Planner 첫 완성본. Orchestrator가 진입점(2a)·env 허용 목록 결정과 두 단계 키 수용을 반영, 정책 새 절에 env 문장 추가 | 사용자 승인 2026-11-21 |
| v2 | 2026-11-21 | plan T1 Step 0 hold(node tap이 통과 test에 location 없음) 후 ARC node reporter 추가: §5.2 `{arcNodeReporter}` 자리표시자와 junit-xml `stream`, §9.2 reporter, §12 파일·테스트·dogfood, §13-5 해결 | 사용자 승인 2026-11-21 |
| v3 | 2026-11-21 | plan T2 QA finding 후 §6.1 보완: `{worktree}` PATH로 찾는 실행 파일 realpath는 phase2 입력이고, 이 경우 적중 확인에도 worktree가 필요함을 명시(구현 동작과 일치, 코드 변경 없음) | 사용자 승인 2026-11-21 |
| v4 | 2026-11-21 | plan T3 Implementer hold 후 §8.3 정정: 스냅샷 commit 메시지에서 runId를 빼 `arc-verify snapshot`으로 고정(같은 HEAD·tree면 같은 OID 요구와의 모순 해소) | 사용자 승인 2026-11-21 |
| v5 | 2026-11-21 | plan T4 Implementer 안전성 hold 후 §8.5 대상 판정 5 중첩 보호와 §5.7 `nested_worktree` 추가(도구 worktree 안의 사용자 worktree·저장소가 `remove --force`로 지워지는 경로 차단) | 사용자 승인 2026-11-21 |
| v6 | 2026-11-21 | T4 재시작 Implementer 안전성 hold 후 §8.5 판정 5 보강: bare 저장소 형태 감지 추가, unlock 직후·remove 직전 재검사, 보장 범위(일반 파일은 도구 소유)와 경합 창 한계 명시 | 사용자 승인 2026-11-21 |
| v7 | 2026-11-21 | T4 세 번째 Implementer 안전성 hold(Git 재귀 삭제 중 symlink 교체 경합) 후 §8.5 판정 6 추가: 도구 디렉터리 경로 전체의 실제 디렉터리·현재 사용자 소유·0700 확인, 실패 시 hold `cleanup_unsafe_path`. 같은 사용자 경합은 v6 한계에 포함 | 사용자 승인 2026-11-21 |
| v8 | 2026-11-21 | 통합 브랜치 최종 Reviewer finding과 dogfood 결함 보완: §8.2 생성 시점 소유 전제와 §5.7 `unsafe_temp_path`(F1), §9.3 timeout·signal 항상 incomplete와 §9.2 TAP `plan_missing`(F2), §5.5 rerun 통과는 대상 테스트 파싱으로 판정·`no_match`(F3), §8.3-8 스냅샷은 작업 트리 최상위 기준(F7), §9.3 파서 예외는 `parse_error`·§10.1 runner 예외는 run `failed`(dogfood: `ctx.fileExists` 누락 예외로 run이 `running`에 고정). 머리말 상태 표기 정정(F10). 재검토 보완(같은 v8): §9.2 파일 추론은 심볼릭 링크 제외(QA), §5.5 `skipped`·`runStatus:"inconclusive"`·재실행 없음은 `null`(N1·N3), §9.5 rerun 비교는 passed·failed만(N2), §13-7 win32 한계(N4), §9.2 symlink 경로 load 실패는 command incomplete `symlinked_test_file`(N5), §5.5 출력 enum 정정(N6) | 사용자 결정 2026-11-21("둘 다 spec 보완 후 수정", "F3·F7도 함께 수정", "중간+N1–N3 수정, N4 한계", N5 "수정") |
| v9 | 2026-11-22 | dogfood 비교에서 Python subTest 이름에 run별 worktree 절대경로가 들어가 기준선 실패 10건이 가짜 새 실패로 분류됨(AC-6 unmet): §9.1에 suite·name 안 worktree 경로를 `{worktree}`로 치환하는 규칙 추가. QA 반례(인용된 형제 경로 오탐, 동명 테스트 재실행 통과 오판)에 따라 경로 끝 판정과 재실행 결과 대조 규칙 보완. 인용된 값 안 쉼표·공백 뒤 경로 시작은 의도된 동작으로 명시. Reviewer V9-1·V9-2에 따라 경계 규칙을 구현대로 명시하고 한계를 적음. 치환 충돌 key의 head 실패를 `newFailureCandidates`(`normalized_name_collision`)로 올림(§9.1, §9.4-4). 충돌 비교에 suite 원래 표기 포함, md 후보 절 제목 일반화(§9.6), 재실행 대상 대조에 suite 원래 표기 포함. 이전 형식 run의 비교·재실행 한계를 §13-8에 적음(V9-7·V9-9) | 사용자 결정 2026-11-22("이름 정규화 수정 후 재실행", "둘 다 수정", "의도된 동작으로 명시", "보수적 검출 추가", "V9-5·V9-6 수정, V9-7 후속", "spec대로 수정", "spec 한계로 적고 커밋") |
