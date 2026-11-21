# 최종 검증 기준선 캐시·clean worktree·백그라운드 기준선 구현 계획 (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 날짜: 2026-11-21 · 상태: v9 승인 (2026-11-22, 개정 이력 참조) · workflow: wf-final-verify-cache
- 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/final-verify-baseline-cache`, 브랜치 `feat/final-verify-baseline-cache`, base `68ef36c864f7dfe6fa1bebffc15906f2d95a16a7`
- 경로·위험: Architectural, significant

**Goal:** 검사 범위는 그대로 두고, 기준선 기록·재사용과 HEAD 전체 회귀를 clean worktree에서 실행하는 ARC runtime `verify-*` 명령과 정책 문서를 추가한다.

**Architecture:** 진입점 `lib/runtime/verify-cli.mjs`가 옵션·입력을 검증하고 `lib/runtime/final-verify.mjs`(키·저장·worktree·snapshot·runner·부하·캐시·rerun·cleanup)를 부른다. 결과 파싱·비교·보고는 순수 모듈 `lib/runtime/test-results.mjs`가 맡는다. 세 모듈은 install-only이고 `COOPERATIVE_RUNTIME_MODULES`에는 넣지 않는다. 네 host 사본 문서에 같은 문장을 넣는다.

**Tech Stack:** Node.js ESM(`node:` 내장 모듈만), git CLI, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-21-final-verify-baseline-cache-design.md` (v1, 사용자 승인 2026-11-21). 이 plan은 spec의 절 번호(§)를 인용하며, 실행자는 두 문서를 함께 읽는다.

## Global Constraints

- 새 모듈 네 개(`node-test-reporter.mjs` 포함)는 `node:` 내장 모듈과 같은 디렉터리의 `./*.mjs`만 import한다(`lib/runtime` 밖, 예를 들어 `lib/safe-fs` import 금지, spec §3).
- `lib/runtime/command.mjs`, `lib/runtime/cli.mjs`, `lib/runtime/bootstrap.mjs`, `lib/policy/role-policy.json`은 수정하지 않는다. `runtime-versions` baselineHash와 `cooperative-9`는 그대로 둔다.
- 자식 프로세스는 모두 `shell:false`로 실행한다. 치환하는 자리표시자는 `{worktree}`(args·cwd·env), `{arcNodeReporter}`(args만, spec §5.2)와 isolate용 `{file}` `{name}` `{namePattern}` `{testId}`뿐이다.
- 자식 env는 허용 목록(`PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `TZ`, `PYTHONDONTWRITEBYTECODE` 중 설정된 것) + `keyInputs.envNames` + command·prepare `env`만 넘긴다. `ARC_BRIDGE_CHILD`는 넘기지 않는다(§6.3).
- 종료 코드는 allow 0, deny 2, hold 3, 예외 1(`hold`/`verify_error`)이다. `ARC_BRIDGE_CHILD`가 있으면 모든 명령을 deny `bridge_child`로 거부한다.
- 저장 위치는 `<realpath(git rev-parse --git-common-dir)>/arc/verify`이고 worktree 위치는 `<realpath(os.tmpdir())>/arc-verify/<repoHash16>/<runId>/wt`다. 디렉터리 0700, 파일 0600으로 만들고, 쓰기는 임시 파일 → fsync → rename 순서로 한다.
- 고정 상수(테스트로 고정): heartbeat 2000ms, stale 15000ms, 부하 표본 30000ms, timeoutMs 기본 3600000·상한 21600000, kill 유예 10000ms, raw 상한 64 MiB/command, glob 상한 100000, toolVersion 시간 상한 30000ms, 부하 경계 시작 loadavg1/cpus ≥ 0.5, 표본 loadavg1 > cpus×1.5, rerun 기본 limit 3(1~10), topN 기본 10(1~100), waitMs 0~600000.
- runId 형식은 `<UTC yyyymmddTHHMMSSZ>-<8 hex>`, command id 형식은 `^[a-z0-9][a-z0-9_-]{0,31}$`, revision은 소문자 40/64자리 hex다.
- 자동 stash·reset·clean·prune·branch 생성·자동 재시도·자동 재시작·자동 kill·자동 삭제는 하지 않는다. 원본 checkout의 ref·index·작업 파일과 사용자 worktree는 바꾸지 않는다(AC-10).
- git 호출 env에서는 상속된 `GIT_*` 변수를 제거한다(`scope.mjs:23` 패턴). 사용자 global/system config는 유지한다. filter 설정이 checkout에 영향을 주고 키에도 들어가기 때문이다(가정 A3).
- 테스트는 실제 저장소의 git common dir을 쓰지 않는다. 모두 `os.tmpdir()` 아래 임시 git 저장소 픽스처를 쓴다. CLI를 spawn하는 테스트는 자식 env에서 `ARC_BRIDGE_CHILD`를 지운다(Implementer·QA가 Codex bridge 안에서 실행되므로). 예외는 `bridge_child` 테스트뿐이다.
- 런타임 모듈을 추가·변경하는 task는 같은 task 안에서 아래 생성물을 다시 만든다. 순서는 `node scripts/update-runtime-assets.mjs` → `node tests/node/fixtures/installed-layout.mjs --write` → `node scripts/update-manifest.mjs`다. 문서 task도 golden과 MANIFEST를 다시 만든다(golden에는 runtime 파일과 references 해시가 16조합 모두 들어 있다).
- 정책 문장은 영어로, 네 사본에 같은 바이트로 넣는다. 위치는 spec §11에 적힌 곳뿐이다.

## Review Focus

1. 경로 별칭: macOS `os.tmpdir()`가 `/var/...`(실제 `/private/var/...`)이어도 worktree realpath 기준으로 `{worktree}` 정규화와 testId 파일 접두사 제거가 맞아야 한다. 테스트는 T2 `normalizes worktree prefix through tmpdir symlink`, T1 `strips worktree realpath and file:// prefixes`.
2. bridge 안에서의 실행: QA·Implementer 프로세스에 `ARC_BRIDGE_CHILD`가 있어도, 테스트 자식에서 지우면 정상 동작해야 하고 runner가 띄운 command 자식에도 전달되지 않아야 한다. 테스트는 T2 `child env excludes ARC_BRIDGE_CHILD and unlisted variables`.
3. glob 경계: `tests/node/*.test.mjs`가 하위 디렉터리를 매치하지 않고, `**`는 0개 이상 디렉터리를 매치하며, 결과는 정렬되고, 0개면 hold `glob_empty`, 100000개를 넘으면 uncacheable이어야 한다. 테스트는 T2 `expandGlob star does not cross slash`, `glob_empty hold`.
4. 동시 start 경합: 두 프로세스가 동시에 start하면 `machine.json`이 한 번만 만들어지고(배타 생성) 한쪽은 `queued`가 되어야 한다. 테스트는 T3 `concurrent starts serialize and share machine id`.
5. 손상·부분 기록: run.json이 잘리거나 JSON이 아니면 status는 `unknown`이어야 하고, compare는 hold `run_unknown`, cache record 해시가 다르면 miss(`cache_corrupt`)여야 한다. 테스트는 T3 `unreadable run.json reports unknown`, T2 `corrupt result hash is a miss`.

## 파일 구조

| 파일 | 책임 | task |
|---|---|---|
| `lib/runtime/test-results.mjs` (신규) | 식별자 정규화, junit-xml/tap/regex/none 파서, §9.3 판정, 비교 분류, 보고서 JSON/md | T1(+T4에서 간헐 이력 입력 보강 가능) |
| `lib/runtime/final-verify.mjs` (신규) | 입력 검증, 키 phase1/phase2, 저장, 머신 id, glob, env, worktree·seed·prepare, runner(foreground·detach), heartbeat, 큐, 부하, 캐시, snapshot, compare 연결, rerun, cleanup, `--run` 진입 | T2·T3·T4 |
| `lib/runtime/node-test-reporter.mjs` (신규) | node:test custom reporter, 모든 test에 `file`을 담은 junit-xml 출력(spec §9.2) | T1 |
| `lib/runtime/verify-cli.mjs` (신규) | 옵션 파싱, `validateWorkflowId` 재사용, `ARC_BRIDGE_CHILD` 거부, 명령 분기, JSON 한 줄 출력, 종료 코드 | T2 |
| `shared/skill/runtime/{test-results,node-test-reporter,final-verify,verify-cli}.mjs` (생성) | 미러 | 해당 task |
| `lib/installer/runtime-assets.mjs` | `RUNTIME_MODULE_PATHS` 정렬 삽입 | T1·T2 |
| `tests/node/runtime-test-results.test.mjs` (신규) | 파서·비교·보고 단위 테스트 | T1·T4 |
| `tests/node/runtime-final-verify.test.mjs` (신규) | 입력·키·env·worktree·runner·snapshot·cleanup 통합 테스트 | T2·T3·T4 |
| `tests/node/runtime-assets.test.mjs` | `expectedPaths` 갱신 | T1·T2 |
| `{claude,codex,gemini,grok}/skill/references/{verification,handoff-prep,coordination}.md` | 정책 문장 | T5 |
| `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs` | 계약 단언 추가 | T5 |
| `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json` (생성) | manifest·설치 golden | 전 task |

`RUNTIME_MODULE_PATHS` 정렬 위치(`lib/installer/runtime-assets.mjs:3-39`, `tests/node/runtime-assets.test.mjs:7-15`도 같은 순서): `lib/runtime/final-verify.mjs`는 `external.mjs`와 `gate.mjs` 사이, `lib/runtime/node-test-reporter.mjs`는 정렬 순서상 알맞은 위치(Implementer가 실제 목록으로 확정), `lib/runtime/test-results.mjs`는 `target-preparation.mjs`와 `verification.mjs` 사이, `lib/runtime/verify-cli.mjs`는 `verification.mjs` 뒤(마지막)에 들어간다. 생성기는 canonical 파일 목록과 인벤토리가 정확히 같아야 통과하므로(`scripts/update-runtime-assets.mjs:16-18`), 모듈 파일을 만드는 task가 인벤토리와 `expectedPaths`도 함께 바꿔야 한다. 이 셋은 분리할 수 없다.

## 가정

- A1 command·prepare의 `cwd` 기본값은 `{worktree}`다. 상대 cwd는 worktree 기준으로 해석한다. 치환 뒤 worktree 밖이면 `invalid_request`다. (Q5: Orchestrator 수용)
- A2 win32에서는 음수 pid 그룹 kill을 쓸 수 없다. 이때 timeout은 `child.kill('SIGTERM')`과 유예 뒤 `child.kill('SIGKILL')`로 처리하고 run.json command에 `groupKill:false`를 기록한다(Q3: 이 방식 채택, win32 실제 실행은 미확인으로 보고).
- A3 git 호출은 상속 `GIT_*`만 지우고 global/system config는 유지한다.
- A4 cleanup에서 worktree 디렉터리가 없으면 `git worktree unlock`·`remove`를 호출하지 않는다. 등록 경로를 `residualPaths`에 넣고 hold `cleanup_partial`로 보고한다. git 버전마다 동작이 다를 수 있어서 피한다(spec §13-4).
- A5 이 저장소 dogfood의 `prepare`는 `npm ci --ignore-scripts`, `npm run build:native` 두 개다(Q4: Orchestrator 확정). 근거: clean worktree에는 git-ignored `node_modules/`·`build/`가 없고, 2026-11-21 수동 기준선도 같은 두 준비 뒤에 기록했다(`/Users/yunho/Desktop/project/arc/.git/arc/handoff/baseline-68ef36c8/``baseline.md`). 측정한 준비 시간 약 3.4초는 worktree 생성 0.1초 + `npm ci` 0.3초 + build-native 3초다.

---

### Task 1: 결과 파서·식별자·비교·보고서·ARC node reporter (`test-results.mjs`, `node-test-reporter.mjs`)

**목표·범위:** spec §9 전부를 구현한다. `test-results.mjs`는 순수 함수다(입출력은 문자열과 객체, 파일·프로세스 접근 없음). `node-test-reporter.mjs`는 node:test custom reporter다(spec §9.2, v2). 결과 파일 읽기와 glob 탐색은 T2에서 호출자가 맡는다.

**Files (bridge `allowedPaths`와 같음):**
- Create: `lib/runtime/test-results.mjs`, `lib/runtime/node-test-reporter.mjs`, `shared/skill/runtime/test-results.mjs`·`shared/skill/runtime/node-test-reporter.mjs`(생성), `tests/node/runtime-test-results.test.mjs`
- Modify: `lib/installer/runtime-assets.mjs`, `tests/node/runtime-assets.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`

**선행:** 없음.

**Interfaces — Produces:**
- `export const PARSER_SCHEMA_VERSION = 1`, `export const REPORT_SCHEMA_VERSION = 1`
- `export function normalizeTestFile(raw: string|null, worktreeRealpath: string): string`: 절대경로·`file://`·worktree 접두사를 제거하고 POSIX로 바꾼다. 알 수 없으면 `'-'`.
- `export function assignTestIds(tests: {file,suite,name,status,durationMs}[]): {testId,file,suite,name,k,status,durationMs}[]`: `file::suite::name#k`, (file,suite,name)별 k는 1부터.
- `export function parseJunitXml(text, ctx) / parseTap(text, ctx) / parseRegex(text, ctx, results)`: 반환값은 `{tests[], incomplete[{scope:'file'|'command', path?, reason}], unmappedStatusCount}`. `ctx = {worktree: string, fileExists(rel): boolean}`.
- `export function summarizeCommand({format, results, streams:{stdout,stderr}, resultFiles:[{path,text}]|null, exit:{code,signal,timedOut}, truncated:boolean, ctx}): {format, exitCode, signal, timedOut, tests[], counts{total,passed,failed,skipped}, incomplete[], unmappedStatusCount, status?:'pass'|'fail'}`: §9.3 규칙 적용. `none`은 `status`만 채운다.
- `export function compareRuns({base, head, history?, reruns?}): {newFailures[], baselineReproduced[], baselineNotReproduced[], newFailureCandidates[{commandId,testId|null,reason}], intermittentCandidates[{commandId,testId,history[],reruns[],passesInIsolation}], disappearedTests[], addedTests[], addedFiles[], removedFiles[], verdict}`. `base`/`head` = `{commands:[{id, format, expandedFiles:string[], summary}]}`. `history` = `[{runId, loadClass, commands}]`(같은 cacheKey의 succeeded run들). `reruns` = `[{commandId,testId,attempts[{attempt,status}]}]`.
- `export function buildReport({base, head, comparison, conditions, phases, topN, generatedAt}): {json: object, md: string}`: §9.6 필드와 md 순서.
- `lib/runtime/node-test-reporter.mjs`: `export default async function* arcNodeReporter(source)`. node:test 이벤트(`test:pass`, `test:fail`, `test:start` 등)를 받아 spec §9.2 형식의 junit-xml 문자열 조각을 yield한다. 파일별 중첩 suite 구성은 이벤트의 `data.file`·`data.nesting`·`data.details.type`을 쓴다.

- [x] **Step 0: §13-5 실측 픽스처 확보**(v1 실행 결과: node v22.18.0에서 (a) 거짓 — 실패 test point에만 `location`, (b) 참. v2에서 ARC node reporter로 해결. 아래 원문은 기록용) — Implementer가 임시 디렉터리에 세 파일(통과·실패 각 1개와 `describe` 중첩 1개가 있는 파일, import 시점에 throw하는 파일, 통과 파일)을 만들고, 실제 `node --test --test-reporter=tap a.test.mjs b.test.mjs c.test.mjs` 출력을 테스트 파일 안 문자열 상수 `NODE22_TAP_FIXTURE`로 옮긴다(절대경로는 `/WT/`로 바꾼다). node 버전을 주석으로 남긴다. 확인할 것은 두 가지다. (a) 각 test point YAML에 `location: '<path>:<line>:<col>'`가 있는가. (b) load 실패 파일이 하위 테스트 없는 `not ok`이고 설명 또는 location이 그 파일 경로인가. **(a)가 거짓이면** 같은 이름의 테스트가 파일 간에 순번으로만 짝지어지므로 Step 1 이후를 멈추고 Orchestrator에 보고한다(spec 결정 필요, T1 hold).
- [x] **Step 1: 실패하는 테스트 작성** (`tests/node/runtime-test-results.test.mjs`). 테스트 이름과 단언 요지:
  - `junit-xml parses nested suites, entities, CDATA and classifies failure/error/skipped`: `&lt;&amp;&#65;`가 `<&A`로 풀리고, failure·error는 failed, skipped는 skipped, 나머지는 passed다.
  - `junit-xml rejects DOCTYPE as parse_error`: command incomplete `parse_error`가 된다.
  - `junit-xml file precedence testcase@file > testsuite@file > path-like testsuite@name > '-'`
  - `junit-xml testsuite with errors and no testcase marks file_error`
  - `tap parses node subtests with YAML location and duration_ms` (Step 0 픽스처 사용): 실패 test의 testId는 `a.test.mjs::…#1` 형태이고, location이 없는 통과 test의 file은 `-`이며, durationMs는 숫자다.
  - `arc node reporter gives every test its file`: 임시 디렉터리에 세 파일을 둔다. `a`에는 통과, 실패, `describe('outer')` 안의 `inner`를 넣고, `b`는 import 때 throw하게 하며, `c`에는 통과하는 `passes`를 넣는다. 각 파일에 `test.skip`과 `test.todo`를 1개씩 둔다. 실제 `node --test --test-reporter=<lib 경로> --test-reporter-destination=stdout`을 실행한다. 출력을 `parseJunitXml`로 읽었을 때 다음이 성립해야 한다. `a.test.mjs::::passes#1`과 `c.test.mjs::::passes#1`이 서로 다르다. `a.test.mjs::outer::inner#1`이 있다. `b.test.mjs`는 incomplete `file_error`다. skip과 todo는 skipped다. `durationMs`는 숫자다.
  - `arc node reporter escapes XML special characters in names and messages`: 이름과 메시지에 `<&"'`가 들어 있어도 출력이 파싱되고 원문으로 복원된다.
  - `tap load failure without subtests marks file incomplete file_error` (Step 0 픽스처 사용)
  - `tap TODO not ok is not failed and SKIP is skipped`
  - `tap Bail out and plan mismatch mark command incomplete`
  - `regex maps statusMap, fileError and counts unmapped`: 매핑되지 않은 status 2줄이면 `unmappedStatusCount===2`다.
  - `regex requires named groups status and name`: 그룹이 없으면 `invalid_request`용 오류를 던진다(`validateRegexSpec(results)`를 export해 T2 입력 검증에서 재사용).
  - `none passes on exit 0 and fails otherwise`
  - `strips worktree realpath and file:// prefixes`, `duplicate names get #k in order`
  - `nonzero exit without parsed failures is unattributed`, `zero results is no_results`, `missing result file is results_missing`, `truncated output is output_truncated`, `exit 0 with failures is recorded as is`
  - `compare classifies new, reproduced, not reproduced, candidates, disappeared, added, file diffs`: 한 픽스처에 §9.4의 1~6 항목이 각각 1건 이상 있다.
  - `failure in base-incomplete file is a candidate, never baseline`
  - `none command failing in head is a command candidate even if base failed`
  - `verdict precedence new-failures > candidates > no-new-failures`
  - `intermittent from history mismatch and from rerun pass keeps original classification`: 단독 통과한 head 실패는 `newFailures`에 남고 `intermittentCandidates`에도 `passesInIsolation:'yes'`로 나타난다.
  - `report json has every §9.6 field and slowest topN`, `report md sections follow §9.6 order`: md 섹션 제목 순서를 단언한다.
- [x] **Step 2: RED 확인** — `node --test tests/node/runtime-test-results.test.mjs`. 기대 결과: 모듈이 없어서 import 실패.
- [x] **Step 3: 구현** — `lib/runtime/test-results.mjs`. XML·TAP는 의존성 없는 상태기계나 정규식으로 구현한다(§14 builder 재량). regex 패턴은 `new RegExp(pattern)`이고 플래그는 없다. 분류 키는 `(commandId, testId)`다.
- [x] **Step 4: 인벤토리·생성물** — `RUNTIME_MODULE_PATHS`와 `expectedPaths`에 `lib/runtime/test-results.mjs`와 `lib/runtime/node-test-reporter.mjs`를 정렬 위치에 넣고, 생성물 3종을 Global Constraints 순서로 다시 만든다.
- [x] **Step 5: GREEN 확인** — 아래 관련 테스트와 check가 모두 통과해야 한다.
- [x] **Step 6: 커밋**(Orchestrator가 수락한 뒤): `feat(runtime): 최종 검증 결과 파서와 비교 보고 모듈 추가`

**기준:** AC-7(파서 4종, 파일 단위 incomplete), AC-2의 분류 필드 부분, AC-8의 `slowest` 계산, A-C7, A-S4.

**관련 테스트(이유):** `tests/node/runtime-test-results.test.mjs`(신규 모듈을 직접 검증), `tests/node/runtime-assets.test.mjs`(인벤토리 변경), `tests/node/runtime-versions.test.mjs`(install-only 추가 뒤 baselineHash 불변 확인), `tests/node/installed-layout-golden.test.mjs`(golden 재생성), `tests/node/manifest.test.mjs`(MANIFEST 재생성). check: `node scripts/update-runtime-assets.mjs --check`, `node scripts/update-manifest.mjs --check`.

**필수 QA·증거:** fresh QA(Codex bridge)가 위 관련 테스트와 check 2종을 다시 실행하고 실패를 테스트 이름별로 보고한다. reporter 테스트를 실행한 node 버전도 증거로 첨부한다. **Hold:** `runtime-versions`가 실패하면 T1 수락과 T2 이후를 hold한다.

---

### Task 2: 진입점·입력 검증·키·저장·worktree·foreground runner·캐시 (`verify-cli.mjs`, `final-verify.mjs`)

**목표·범위:** `verify-start`(`detach:false`만, `snapshotWorkingTree:false`만)와 `verify-status`가 끝까지 동작하게 한다. §5.1~§5.3, §5.7 중 start·status 코드, §6 전부, §7, §8.1·§8.2·§8.4, §10.1 중 foreground·자식 timeout, §10.2 분류 함수(시작 loadavg와 declaredConcurrent 기준)를 구현한다. `detach:true`, `snapshotWorkingTree:true`, `verify-compare`·`verify-rerun`·`verify-cleanup`은 이 task에서 deny `invalid_request`가 아니라 `hold`/`verify_error`(`message:"not implemented"`)를 반환하는 자리만 둔다(T3·T4에서 채운다).

**Files:**
- Create: `lib/runtime/verify-cli.mjs`, `lib/runtime/final-verify.mjs`, `shared/skill/runtime/verify-cli.mjs`, `shared/skill/runtime/final-verify.mjs`(생성), `tests/node/runtime-final-verify.test.mjs`
- Modify: `lib/installer/runtime-assets.mjs`, `tests/node/runtime-assets.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`. 필요하면 `lib/runtime/test-results.mjs`, `shared/skill/runtime/test-results.mjs`(T1 인터페이스 보완만)

**선행:** T1 수락.

**Interfaces — Consumes:** T1의 `summarizeCommand`, `validateRegexSpec`, `PARSER_SCHEMA_VERSION`, `scope.mjs`의 `validateWorkflowId`.
**Interfaces — Produces:**
- `verify-cli.mjs`: `export async function runVerifyCommand(args: string[], io?: {output?, input?: string, env?}): Promise<0|1|2|3>`. 직접 실행할 때 `process.exitCode = await runVerifyCommand(process.argv.slice(2))`. 옵션 규칙은 `command.mjs:17-20`과 같고, `--input -`은 필수다.
- `final-verify.mjs`:
  - `export const VERIFY_COMMANDS = ['verify-start','verify-status','verify-compare','verify-rerun','verify-cleanup']`
  - Global Constraints의 상수를 모두 named export한다(`HEARTBEAT_INTERVAL_MS`, `HEARTBEAT_STALE_MS`, `LOAD_SAMPLE_MS`, `DEFAULT_TIMEOUT_MS`, `MAX_TIMEOUT_MS`, `KILL_GRACE_MS`, `RAW_STREAM_CAP`, `GLOB_FILE_LIMIT`, `TOOL_VERSION_TIMEOUT_MS`, `ENV_BASE_ALLOWLIST`, `LOAD_START_RATIO`, `LOAD_SAMPLE_RATIO`, `RERUN_DEFAULT_LIMIT`).
  - `export function validateVerifyInput(command, input): object`: 정확한 키 집합 검사(중첩·배열 요소 포함), 기본값 채우기, host와 environment 짝 검사(`platform-registry.mjs` 값). 실패하면 `VerifyError('invalid_request')`를 던진다.
  - `export class VerifyError extends Error { constructor(code, decision='deny', extra) }`
  - `export function canonicalJson(value): string`, `export function sha256Hex(data): string`
  - `export function expandGlob(pattern: string, trackedPaths: string[]): string[]`
  - `export function buildChildEnv({parentEnv, envNames, extraEnv}): Record<string,string>`
  - `export function classifyLoad({platform, cpus, startLoadavg, samples, overlaps, declaredConcurrent, samplesMissing}): 'quiet'|'contended'|'unknown'`
  - `export async function verifyStart({cwd, workflowId, input, env}): result` / `verifyStatus({cwd, workflowId, input, env, now?})`
  - `export async function dispatchVerify(command, ctx): result`: verify-cli가 부르는 단일 분기.
  - 저장 구조(§7)를 그대로 따른다. `run.json` 필드: `{schemaVersion, runId, role, state, revision, commit, tree, input(정규화), cacheKeyPhase1, cacheKey, cacheable, uncacheableReasons, cacheHit, reusedFrom, worktree{path,state}, phases[], load{...}, pid, children[], ignoredAfterPrepare[], failure?{code,phase}}`. `result.json`: `{commands:[{id, format, expandedFiles, summary}]}`. `record.json`: `{cacheKey, runId, resultSha256, loadClass, createdAt}`. `history.jsonl` 한 줄은 `{runId, role, state, loadClass, resultSha256}`.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/node/runtime-final-verify.test.mjs`). 공용 헬퍼 `makeRepo(t)`는 tmp git 저장소를 만들고 커밋 2개, `.gitignore`, `tests/a.test.mjs` 등을 넣는다. `runCli(args, input, env)`는 `process.execPath lib/runtime/verify-cli.mjs`를 spawn하며 env에서 `ARC_BRIDGE_CHILD`를 지운다. 명령 픽스처는 `process.execPath -e`로 TAP·JUnit을 출력한다.
  - 입력: `rejects unknown and missing keys at every nesting level`(top, prepare[], commands[], results, isolate, keyInputs, toolVersionCommands[], seedFiles[] 각각이 deny `invalid_request`이고 종료 코드 2), `rejects host/environment mismatch`, `rejects baseline with snapshotWorkingTree`, `rejects duplicate or malformed command ids`, `rejects timeoutMs above 21600000`, `bridge child env denies every verify command`(5개 명령 모두 `bridge_child`·2), `unknown revision denies`, `executable_not_found denies`, `seed_conflicts_tracked denies`, `glob_empty holds with exit 3`.
  - 출력·종료: `emits one JSON line with decision, code, workflowId`, `unexpected exception is hold verify_error exit 1`.
  - glob: `expandGlob star does not cross slash`, `double star matches zero or more directories`, `results are sorted and come from revision tree not working tree`(작업 트리에만 있는 파일은 제외된다).
  - 키: `canonical JSON sorts keys and keeps ordered arrays`, `set arrays are sorted before hashing`, `normalizes worktree prefix through tmpdir symlink`, `changing each phase1 input changes the key`(commit, command args, env 값, envNames 값, timeoutMs, results, prepare, seed 내용, os 필드 주입, toolVersion 출력, dependencyPaths 내용, TMPDIR, host, sandboxMode, filter config, runtime 바이트, machine id를 하나씩 바꿈), `phase2 change misses after prepare`(artifactPaths 내용, `{worktree}` 참조 toolVersion, prepare 후 ignored 요약).
  - uncacheable 7조건: `sandboxMode unknown`, `toolVersion nonzero or timeout`(timeout은 상수 주입 없이 `-e "setTimeout(()=>{},31000)"`을 쓰지 않고 내부 옵션 `toolVersionTimeoutMs`로 단축), `unreadable dependency path or out-of-root symlink`, `TMPDIR unresolvable`, `git failure for filter config`, `glob over limit`(내부 옵션 `globLimit`로 단축), `machine.json unwritable`. 각 테스트는 `cacheable:false`이고 `uncacheableReasons`에 해당 사유가 있으며 run은 실행된다.
  - 재사용 금지: `head run is never reused`, `contended baseline is not reused`(`declaredConcurrent:true`), `unknown-load baseline is not reused`(loadavg 주입 `[0,0,0]`), `timed out command prevents reuse`, `corrupt result hash is a miss`(`cache_corrupt` 보고), `removed record is a miss`(`record.removed.json`으로 rename된 경우).
  - 적중: `second identical quiet baseline start is a cache hit without worktree`(phase2 없음이면 `worktree:null`, `reusedFrom`이 첫 runId), `phase2 hit skips commands after prepare`.
  - env: `child env excludes ARC_BRIDGE_CHILD and unlisted variables`(부모 env에 `ARC_BRIDGE_CHILD`·`SECRET_X`를 두면 자식이 출력한 env에 둘 다 없다), `absent envNames value is recorded as "absent"`.
  - worktree: `creates detached locked worktree under tmp arc-verify with owner.json`(`git worktree list --porcelain`에 `detached`, `locked arc-verify:<runId>`가 있다), `post-checkout hook does not run`(hook이 마커 파일을 쓰는 픽스처), `oid mismatch or unclean worktree fails run`(내부 훅 `afterCreate`로 파일 주입 → `failed`·`worktree_unclean`, worktree는 `retained`), `prepare touching tracked file is prepare_dirtied_tree`, `seed files are the only untracked paths`.
  - 비대칭 회귀(AC-6): `ignored file in source checkout does not leak into head run`. 원본 checkout에 ignored 파일을 두면 실패하는 테스트(`fs.existsSync`로 확인)가 원본에서는 실패하고, `role:"head"` clean worktree run에서는 통과한다.
  - runner: `timeout sends SIGTERM to group then SIGKILL after grace`(SIGTERM을 무시하는 자식은 `timedOut:true`, grace는 내부 옵션 `killGraceMs`로 단축), `raw stream over cap marks output_truncated`(내부 옵션 `rawCap`), `status reports phases and summary`.
  - 부하: `classifyLoad boundaries`(cpus 8, 시작 3.99는 quiet이고 4.0은 contended, 표본 12.0은 quiet이고 12.01은 contended, win32 `[0,0,0]`은 unknown, samplesMissing은 unknown, declaredConcurrent는 contended, overlaps 비어 있지 않음은 contended).
  - 저장: `store lives under realpath git-common-dir arc/verify with 0700/0600`, `machine id differs when randomId differs`(AC-5), `runId format`.
  - 경계: `new modules import only node builtins and sibling files`(세 파일의 import 문을 정규식으로 검사).
  - 보존(AC-10): 모든 통합 테스트의 `t.after`에서 원본 픽스처 저장소의 `git rev-parse HEAD`, refs 목록, `.git/index` 바이트, 추적·미추적 작업 파일 바이트가 시작 시점과 같은지 단언하는 `assertSourceUnchanged(snapshot)`.
- [x] **Step 2: RED 확인** — `node --test tests/node/runtime-final-verify.test.mjs`. 기대 결과: 모듈이 없어서 실패.
- [x] **Step 3: 구현** — 내부 테스트 옵션(`toolVersionTimeoutMs`, `globLimit`, `rawCap`, `killGraceMs`, `loadavg`, `afterCreate`)은 `verifyStart`의 두 번째 인자 `internal`로만 받는다. CLI에서는 접근할 수 없다. 머신 id는 §6.4 순서를 따르고 `machine.json`은 `wx` 배타 생성(EEXIST면 읽기)으로 만든다. worktree 생성은 §8.2 명령을 그대로 쓴다. phase2가 비어 있으면 start에서 바로 조회한다(§6.1). 캐시 기록은 `role:"baseline"`이고 §6.6을 만족할 때만 `record.json`을 쓴다. `history.jsonl`은 run마다 append한다(같은 키의 head run 포함).
- [x] **Step 4: 인벤토리·생성물** — `final-verify.mjs`·`verify-cli.mjs`를 정렬 위치에 넣고 생성물 3종을 다시 만든다.
- [x] **Step 5: GREEN 확인** — 아래 관련 테스트와 check를 실행한다.
- [x] **Step 6: 커밋**(Orchestrator 수락 후): `feat(runtime): verify-start·verify-status와 기준선 캐시 키 추가`

**기준:** AC-1(commands를 생략 없이 실행, 펼친 파일 목록 기록), AC-3, AC-5, AC-6(단위 부분), AC-10, AC-4의 부하 class 기록, A-C1·A-C3·A-C5·A-C6, A-S1(start·status)·A-S2·A-S3(생성·검증), §5.7 start·status 코드.

**관련 테스트(이유):** `tests/node/runtime-final-verify.test.mjs`(신규 모듈), `tests/node/runtime-test-results.test.mjs`(T1 인터페이스를 보완했다면), `tests/node/runtime-assets.test.mjs`(인벤토리), `tests/node/runtime-versions.test.mjs`(baselineHash 불변, `scope.mjs` import가 runtimeHash에 영향 없음), `tests/node/runtime-cli.test.mjs`(`command.mjs`·`cli.mjs` 무수정 확인용 회귀, 새 진입점이 기존 CLI와 분리되었다는 증거), `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`. check: `node scripts/update-runtime-assets.mjs --check`, `node scripts/update-manifest.mjs --check`.

**필수 QA·증거:** fresh QA가 관련 테스트와 check를 실행하고, `git diff --stat 68ef36c8 -- lib/runtime/command.mjs lib/runtime/cli.mjs lib/runtime/bootstrap.mjs lib/policy/role-policy.json`이 비어 있음을 증거로 낸다. **Hold:** runtime-versions가 실패하면 T2 수락을 hold하고 진입점 결정 재검토를 Orchestrator에 올린다. bridge 안에서 worktree 생성(`git worktree add`, 쓰기 대상은 tmp 저장소의 `.git`)이 sandbox 때문에 거부되면 환경 문제로 분류해 해당 테스트만 hold하고, Orchestrator가 host에서 직접 그 파일을 실행해 판정한다.

---

### Task 3: 미커밋 snapshot·detach runner·heartbeat·큐·부하 표본

**목표·범위:** §8.3(snapshot), §10.1 중 detach·heartbeat·unknown·큐, §10.2 실행 중 표본·overlaps를 구현한다. start 출력의 `snapshot`·`queuedBehind` 필드를 채운다.

**Files:**
- Modify: `lib/runtime/final-verify.mjs`, `shared/skill/runtime/final-verify.mjs`(생성), `tests/node/runtime-final-verify.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`

**선행:** T2 수락.

**Interfaces — Consumes:** T2의 `verifyStart`/`verifyStatus`, 저장 구조, `classifyLoad`, 상수.
**Interfaces — Produces:** `final-verify.mjs` 직접 실행 `node final-verify.mjs --run <runDir>`(runner 진입), `export async function runRunner(runDir): Promise<void>`, `export async function createSnapshot({cwd, head, runDir}): {commit, tree, included[{status,path}], excluded{ignored[],submodules[]}}`.

- [x] **Step 1: 실패하는 테스트 작성**
  - snapshot: `snapshot leaves refs, index, reflog and working files byte- and mtime-identical`(수정·삭제·미추적·ignored 파일이 섞인 픽스처), `snapshot reports included and excluded ignored paths`, `same tree yields same snapshot OID`(두 번 호출 시 commit OID 같음), `snapshot with HEAD mismatch denies revision_mismatch`, `snapshot failure holds snapshot_failed and keeps temp index`(내부 훅으로 `write-tree` 실패 주입), `dirty submodule content is reported in excluded.submodules`(gitlink 픽스처).
  - detach: `detach start returns queued or preparing immediately and status waits to succeeded`(`waitMs` 사용), `other commands work while detached run is active`(AC-4: 진행 중 status 호출이 즉시 반환. v4: cleanup dryRun 확인은 T4로 이동), `heartbeat updates while running`.
  - unknown: `killed runner reports unknown with child pids and no restart`(runner pid에 SIGKILL을 보낸 뒤 heartbeat.json의 `at`을 과거로 바꾸고 `now` 주입 → `unknown`, 15초 경과 후에도 새 프로세스가 없음), `stale heartbeat boundary 15000ms`(14999는 비종료 그대로, 15001은 unknown), `unreadable run.json reports unknown`.
  - 큐: `second start queues behind active run`(`queuedBehind`에 첫 runId), `declaredConcurrent does not bypass queue but marks contended`, `concurrent starts serialize and share machine id`(Promise.all로 CLI 2개 spawn), `foreground run follows the same queue`.
  - 부하: `overlapping runs are recorded in overlaps`, `samples are recorded at LOAD_SAMPLE_MS`(내부 옵션 `sampleMs` 단축).
- [x] **Step 2: RED 확인** — `node --test --test-name-pattern "snapshot|detach|unknown|queue|overlap|samples" tests/node/runtime-final-verify.test.mjs`. 기대 결과: T2 자리표시자 `verify_error`로 실패.
- [x] **Step 3: 구현** — detach는 `role-supervisor.mjs:321-325` 패턴을 따른다(`spawn(process.execPath,[selfPath,'--run',runDir],{detached:true,stdio:'ignore',env:allowlist+내부변수,cwd:runDir}).unref()`). 큐 판정은 `<store>/runs/*/run.json` 중 비종료이고 heartbeat가 살아 있는 run을 보며, 판정 경합은 `<store>/queue.lock`(`wx` 배타 생성, 짧게 잡고 바로 해제)으로 직렬화한다. snapshot 작성자 날짜는 HEAD committer date를 `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`로 주고 이름·메일은 `arc-verify`로 고정한다.
- [x] **Step 4: 생성물** — 3종을 다시 만든다.
- [x] **Step 5: GREEN 확인**, **Step 6: 커밋**(Orchestrator 수락 후): `feat(runtime): verify 미커밋 스냅샷과 백그라운드 runner·큐 추가`

**기준:** AC-4, AC-10(snapshot 불변), A-C4, A-C6(snapshot 경로), A-S3(§8.3), A-S5(§10.1·§10.2).

**관련 테스트(이유):** `tests/node/runtime-final-verify.test.mjs`(변경 모듈), `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`(생성물). check: `node scripts/update-runtime-assets.mjs --check`, `node scripts/update-manifest.mjs --check`.

**필수 QA·증거:** fresh QA는 위 테스트를 실행하고 detach 테스트의 runner pid 종료 여부(테스트 뒤 남은 프로세스 없음)를 보고한다. bridge 환경에서는 `ps`를 쓸 수 없을 수 있으므로 테스트 안에서 `process.kill(pid,0)` ESRCH 단언으로 대신한다. **Hold:** bridge sandbox에서 detached 자식이 바로 죽어 detach 테스트만 실패하면 환경 사유로 분류한다. 그 테스트만 hold하고 Orchestrator가 host(claude)에서 직접 실행해 판정한다. 이 경우 T4는 detach와 무관한 부분부터 진행할 수 있다.

---

### Task 4: verify-compare·verify-rerun·verify-cleanup과 보고서 저장

**목표·범위:** §5.4~§5.6, §8.5, §9.4~§9.6 연결(T1 함수를 run 기록에 적용), §5.7의 compare·rerun·cleanup 코드를 구현한다.

**Files:**
- Modify: `lib/runtime/final-verify.mjs`, `shared/skill/runtime/final-verify.mjs`, `tests/node/runtime-final-verify.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`. 필요하면 `lib/runtime/test-results.mjs`, `shared/skill/runtime/test-results.mjs`, `tests/node/runtime-test-results.test.mjs`(간헐 이력 입력 보완만)

**선행:** T3 수락. T3 detach 테스트가 환경 hold 상태여도 compare·rerun·cleanup은 foreground run으로 검증할 수 있으므로, Orchestrator 판단으로 T3 수락 직후 진행한다.

**Interfaces — Consumes:** T1 `compareRuns`, `buildReport`, T2·T3 저장·runner.
**Interfaces — Produces:** `export async function verifyCompare(ctx)`, `verifyRerun(ctx)`, `verifyCleanup(ctx)`. isolate 치환: `{file}`=testId의 file, `{name}`=name, `{namePattern}`=`'^'+escapeRegExp(name)+'$'`, `{testId}`=testId 원문. 보고서 경로는 `<store>/reports/<baseRunId>..<headRunId>.{json,md}`.

- [x] **Step 1: 실패하는 테스트 작성**
  - (v4, T3에서 이동) `cleanup dryRun returns immediately while detached run is active`(AC-4).
  - compare 전제: `compare holds run_incomplete while base is running`(AC-4), `run_failed`, `run_unknown`, `role_mismatch`, `command_set_mismatch`(id 또는 glob 템플릿 차이), `prepare_mismatch`(prepare·seed 다이제스트), `execution_mismatch`(sandboxMode·host·machine id), `unknown_run denies`.
  - compare 결과: `compare writes report json and md and returns verdict`(새 실패 1, 기준선 재현 1, 후보 1이 있는 픽스처로 §9.6 필드 존재와 `verdict:'new-failures'`), `expanded file lists appear in report`(AC-1), `slowest has files, tests and phases topN`(AC-8, topN 2), `history mismatch under same cacheKey yields intermittent candidate`.
  - rerun(AC-2): `rerun passes attempt in isolation and reports passesInIsolation yes`, `attempt out of order denies`, `fourth attempt with default limit denies rerun_limit`, `limit option up to 10`, `no isolate template returns not-run exit 0`, `rerun on non-succeeded run holds run_incomplete`, `rerun with different sandboxMode holds execution_mismatch`, `isolated pass keeps newFailures classification in next compare`.
  - cleanup(§8.5, AC-10): `dryRun lists targets without changes`, `removes tool worktree and keeps runs evidence`(`runs/<runId>/` 유지, `git worktree list`에서 제거), `user-created worktree denies not_tool_owned`(같은 저장소의 사용자 worktree와 경로를 위조한 run.json), `owner.json mismatch denies not_tool_owned`, `active run holds run_active`, `unknown run allowed only when pid is gone`(살아 있는 pid면 hold `run_unknown`), `missing worktree directory is residual and cleanup_partial without prune`(디렉터리를 외부에서 삭제 → `residualPaths`에 경로가 있고 `git worktree list`에 등록이 그대로 남음, 가정 A4), `partial cleanup records state and re-call skips removed items`, `cacheKey cleanup renames record to record.removed.json and keeps history`, `source checkout and user worktree unchanged after cleanup`, (v5) `nested registered worktree holds nested_worktree and deletes nothing`, `nested foreign .git holds nested_worktree`, `dryRun reports nestedPaths`, (v6) `nested bare repository holds nested_worktree`, `nested check reruns after unlock before remove`, (v7) `unsafe tool directory holds cleanup_unsafe_path`(symlink, 다른 모드 각각).
- [x] **Step 2: RED 확인** — `node --test --test-name-pattern "compare|rerun|cleanup" tests/node/runtime-final-verify.test.mjs`
- [x] **Step 3: 구현** — compare는 두 run의 `result.json`을 읽어 T1 `compareRuns`에 넘기고 같은 cacheKey의 `history.jsonl`·rerun 기록을 붙인다. rerun 시도는 `runs/<runId>/reruns.jsonl`에 append한다. cleanup은 §8.5 순서를 따르되 디렉터리가 없으면 git 호출을 건너뛴다(A4).
- [x] **Step 4: 생성물**, **Step 5: GREEN 확인**, **Step 6: 커밋**(Orchestrator 수락 후): `feat(runtime): verify 비교·단독 재실행·정리 명령 추가`

**기준:** AC-1(보고서의 펼친 파일), AC-2, AC-4(compare hold), AC-8, AC-10, A-C2·A-C8, A-S1(compare·rerun·cleanup)·A-S3(§8.5)·A-S4 연결.

**관련 테스트(이유):** `tests/node/runtime-final-verify.test.mjs`(변경 모듈), `tests/node/runtime-test-results.test.mjs`(T1 보완 시), `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`. check: `node scripts/update-runtime-assets.mjs --check`, `node scripts/update-manifest.mjs --check`.

**필수 QA·증거:** fresh QA, 테스트 이름별 결과, cleanup 테스트 뒤 tmp 아래 `arc-verify` 잔여 경로 목록. **Hold:** `not_tool_owned` 판정이 사용자 worktree를 지울 수 있는 경로가 하나라도 발견되면 T4 수락을 hold한다(반목표).

---

### Task 5: 정책 문서 네 사본과 계약 테스트

**목표·범위:** spec §11 (1)~(7)의 문장을 정해진 위치에 넣고 계약 테스트로 고정한다. role-policy.json은 바꾸지 않는다.

**Files:**
- Modify: `claude/skill/references/verification.md`, `codex/skill/references/verification.md`, `gemini/skill/references/verification.md`, `grok/skill/references/verification.md`, 같은 네 디렉터리의 `handoff-prep.md`·`coordination.md`(합계 12개), `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`

**선행:** T4 수락(문서가 실제 명령 이름·필드를 인용하므로).

**정확한 위치(claude 사본 기준, 네 사본은 같은 구조):**
- `verification.md:22` Final verification 문단: `Orchestrator then performs the result comparison below` 바로 앞에 (1)을 넣는다(앞 문장과 공백 하나로 구분). 문단 끝 `and records the verdict. ${finalFailureRule}`은 그대로 둔다.
- `:24` Full regression 문단 끝에 (2).
- `:26` Baseline 문단 `NEVER absorb them as baseline failures.` 뒤에 (3).
- `:28` Result comparison 문단 `Report baseline failures separately.` 뒤에 (4). 단독 재실행 문장은 그대로 둔다.
- `:29`(빈 줄)와 `:30` `<a id="risk-scaled-execution"></a>` 사이에 (5)의 앵커·제목·문단과 앞뒤 빈 줄.
- `handoff-prep.md:95` 문단 끝에 (6). 새 문장에 `verification.md#test-scope-and-result-comparison` 링크를 넣지 않는다(`assertTestScopeLink`가 정확히 1개를 요구).
- `coordination.md` Host rules의 host 블록(`claude:146-170`, codex 사본은 2행 앞): **Claude** 블록은 `- Approval: No per-call ARC approval gate.` 다음, **Codex**는 `- On a Codex host ask the user for escalation approval ...` bullet 다음(claude :153, codex :151, gemini·grok :153), **Gemini**는 `- Approval: Hold the host ...` 다음, **Grok**는 `- On a Grok host start the session ...` bullet 다음에 (7)의 bullet을 넣는다. composite 절은 네 사본이 바이트 단위로 같아야 하므로(`composite-instructions.test.mjs:89-105`) 네 사본에 같은 4개 bullet을 넣는다. Claude bullet 문구는 `- Detached survival of the verify runner is unverified on a Claude host; use \`detach: false\` until it is verified.`이다(질문 Q2: dogfood 뒤 관측 문장으로 바꿀지).

- [x] **Step 1: 실패하는 계약 테스트 작성**
  - `test-scope-contract.test.mjs`에 상수 `cleanWorktreeSentence`, `fullRegressionWorktreeSentence`, `backgroundBaselineSentence`, `structuredResultsSentence`(spec §11 (1)~(4) 원문)와 `runtimeCommandsAnchor = '<a id="final-verification-runtime-commands"></a>'`, `runtimeCommandsHeading = '## Final verification runtime commands'`, `runtimeCommandsParagraph`((5) 원문), `handoffRunIdSentence`((6))를 추가한다. 플랫폼별로 새 테스트 3개:
    - `${platform} final verification runs in a clean worktree`: 4개 문장이 각각 1회 나타나고, Final verification 문단에 `${cleanWorktreeSentence} Orchestrator then performs the result comparison below`가 있고, Full regression 문단이 `fullRegressionWorktreeSentence`로 끝나며, Baseline 문단에 `NEVER absorb them as baseline failures. ${backgroundBaselineSentence}`, Result comparison 문단에 `Report baseline failures separately. ${structuredResultsSentence} If a failure looks intermittent`가 있다.
    - `${platform} runtime commands section sits between test scope and risk-scaled execution`: 앵커가 1회 나타나고, 제목이 앵커 바로 다음 줄이며, 문단이 일치하고, `riskAnchor` 앞에 있다. 기존 `assertTestScopeSection`은 그대로 통과해야 한다.
    - `${platform} handoff-prep allows citing an active baseline runId`: (6)이 `### Verification brief inputs` 문단 끝에 1회 나타난다.
  - `composite-instructions.test.mjs`: `every coordination reference states verify-* host rules`. 네 사본 모두에서 Codex·Grok·Gemini·Claude bullet이 각각 1회 나타나고 정해진 기존 bullet 바로 다음 줄에 있다. 기존 문장 단언은 수정하지 않는다.
- [x] **Step 2: RED 확인** — `node --test tests/node/test-scope-contract.test.mjs tests/node/composite-instructions.test.mjs`. 기대 결과: 새 테스트만 실패하고 기존 테스트는 통과.
- [x] **Step 3: 문서 수정** — 12개 파일에 문장을 넣는다(바이트 동일).
- [x] **Step 4: 생성물** — `node tests/node/fixtures/installed-layout.mjs --write`, `node scripts/update-manifest.mjs`. `node scripts/update-role-policy.mjs --check`가 변경 없이 통과하는지 확인한다.
- [x] **Step 5: GREEN 확인**, **Step 6: 커밋**(Orchestrator 수락 후): `docs(verification): 최종 검증 clean worktree·기준선 캐시 정책과 verify 명령 안내 추가`

**기준:** AC-9, A-C9, A-S6.

**관련 테스트(이유):** `tests/node/test-scope-contract.test.mjs`·`tests/node/composite-instructions.test.mjs`(직접 갱신하는 계약), `tests/node/instruction-layout.test.mjs`(references 구조를 소비할 가능성이 있음; QA가 파일을 읽어 references를 검사하지 않음을 확인하면 제외 가능, 이유 보고), `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`. check: `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`.

**필수 QA·증거:** fresh QA, 네 사본 diff가 같다는 증거(`git diff` 파일별 hunk 비교), `git diff --quiet 68ef36c8 -- lib/policy/role-policy.json`. **Hold:** 기존 계약 단언이 하나라도 수정되어야 통과한다면 T5 수락을 hold하고 Orchestrator에 보고한다(spec §3 기존 문장 보존 위반).

---

## 최종 검증 (모든 task 수락 뒤, Orchestrator가 직접 실행)

**범위·시점:** 아래는 task 선행 조건이 아니라 T1~T5 수락 뒤 한 번 실행하는 단계다. 개별 task 수락을 늦추지 않는다.

1. **관련 테스트 합집합:** `tests/node/runtime-test-results.test.mjs`, `tests/node/runtime-final-verify.test.mjs`, `tests/node/runtime-assets.test.mjs`, `tests/node/runtime-versions.test.mjs`, `tests/node/runtime-cli.test.mjs`, `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`, `tests/node/test-scope-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`(T5에서 포함했을 때).
2. **전체 계약 테스트:** 전체 회귀가 실행되므로 `tests/node/*.test.mjs` 전체가 모든 계약 테스트를 포함한다.
3. **check 4종:** `node scripts/update-manifest.mjs --check`, `node scripts/update-role-policy.mjs --check`, `node scripts/check-installer-parity.mjs`, `node scripts/update-runtime-assets.mjs --check`.
4. **전체 회귀 잠정 판단: 실행.** trigger 1을 적용한다. 정책 references는 모든 host의 에이전트가 실행 중 읽는 공유 입력이고, `RUNTIME_MODULE_PATHS`·`shared/skill/runtime/*`·MANIFEST·golden은 installer와 manifest 경로가 함께 소비하는 생성 입력·출력이다. trigger 2·3·4는 해당하지 않는다. 다른 사람의 변경을 통합하지 않았고, 의존성·설정을 바꾸지 않았고, 기존 공개 인터페이스를 제거·변경하지 않았다(새 진입점 추가만). 최종 판단은 Orchestrator가 실제 diff로 한다. 전체 회귀는 node 전체(`node --test tests/node/*.test.mjs`)와 Python(`PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p 'test_*.py' -v`)이다.
5. **기준선:** base `68ef36c8`의 clean worktree 수동 기준선 `/Users/yunho/Desktop/project/arc/.git/arc/handoff/baseline-68ef36c8/` (`baseline.md`, `node-fail.txt` 35건, `py-fail.txt` 554줄, check 4종 통과, 간헐 후보 3건)을 비교 기준으로 쓴다. 메인 checkout 측정(`scratchpad/m/head1/*`)의 manifest.test 16건·local-updater 1건은 ignored 파일 유래 가짜 실패로 이미 판명되어 이 기준선에는 없다.
6. **dogfood 실측:** 아래 절차. Orchestrator 결정(Q1)에 따라 위 4의 전체 회귀 실행을 겸할 수 있다.
7. **최종 Reviewer 1회:** significant이므로 모든 task 수락과 필수 QA가 끝난 뒤 base `68ef36c8`..HEAD 전체 변경을 독립 Reviewer가 한 번 검토한다. 위험 기반 확인 항목: 캐시 오적중 경로(§6.6), `not_tool_owned` 판정, env 허용 목록, snapshot 불변, 네 사본 일치. 최종 검증 실행과 동시에 진행할 수 있다. Reviewer 지적은 Implementer → Reviewer로 처리하고(QA 재배정 없음), 최종 검증의 새 실패는 Implementer → QA로 처리한 뒤 영향 파일 Reviewer 증거를 refreshed-diff로 다시 확인한다.

### 최종 검증 보정 (v8, 통합 브랜치 `feat/final-verify-models-watch`)

**배경:** 최종 Reviewer(dispatch dddbe4f8) finding F1·F2·F3·F7과, dogfood baseline run의 결함 D1·D2를 spec v8로 보완했다. 사용자 결정(2026-11-21): "둘 다 spec 보완 후 수정", "F3·F7도 함께 수정". 나머지 낮음 finding(F4·F5·F6·F8)과 B 낮음 3건은 후속 과제로 남긴다. F9는 최종 검증에서 skip 수를 확인하는 것으로 처리한다. F10은 spec·plan 머리말 정정으로 처리했다.

- D1: `final-verify.mjs:1997`이 `summarizeCommand`에 `ctx: {worktree, commandId}`만 넘긴다. `test-results.mjs:42,292,297`은 `ctx.fileExists`를 호출한다. 그래서 junit-xml·tap 결과 파싱이 `ctx.fileExists is not a function`으로 실패했다. 단위 테스트는 이 연결을 끝까지 검증하지 못했다.
- D2: 위 예외 뒤에 run.json이 `running` 상태로 남았다. `detach:false` 호출은 hold `verify_error`로 끝났다(run `20261121T133730Z-b82839b2`).

**Files:** `lib/runtime/{final-verify,test-results}.mjs`와 `shared/skill/runtime/` 미러, `tests/node/runtime-final-verify.test.mjs`, `tests/node/runtime-test-results.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`. 정책 문서와 `role-policy.json`은 바꾸지 않는다.

- [x] **Step 1: 실패하는 테스트 작성**
  - (D1) `foreground run with junit-xml stream infers files via worktree`: 실제 `verifyStart`가 `{arcNodeReporter}` junit-xml 출력을 파싱하고, `fileExists`가 worktree 기준으로 동작한다. 모의 ctx가 아니라 runner 경로를 끝까지 거친다. tap `location`·이름 경로 추론도 같은 경로로 확인한다.
  - (D2) `runner exception marks run failed and stops heartbeat`: 파서가 아닌 runner 단계에서 예외를 주입하면 run이 `failed`가 되고 실패 단계와 메시지가 기록된다. `verify-status`가 `failed`를 반환한다. (§9.3) `parser exception records parse_error and run succeeds`.
  - (F1) `start holds unsafe_temp_path`: 기존 `<tmp>/arc-verify`가 심볼릭 링크인 경우, 다른 모드(예: 0777)인 경우, 상위 디렉터리에 sticky 없는 other 쓰기가 있는 경우를 각각 확인한다. 생성 전에 걸리면 worktree 등록이 없어야 한다. `wt` 모드가 0700이 되는지도 확인한다. 테스트는 `TMPDIR`을 테스트 전용 디렉터리로 바꿔 실행한다. 다른 사용자 소유 경우는 root 없이 만들 수 없으므로 판정 함수 단위 테스트로 확인한다.
  - (F2) `timeout with parsed failure is command incomplete`, `signal exit with parsed failure is command incomplete`, `tap without plan is plan_missing`. compare verdict가 `no-new-failures`가 되지 않는지도 확인한다.
  - (F3) `rerun with filter matching zero tests is no_match and not a pass`, `rerun passes only when target test parsed as passed`.
  - (F7) `snapshot from subdirectory cwd includes changes outside cwd`.
- [x] **Step 2: RED 확인** — 새 테스트만 실패하고 기존 테스트는 통과한다.
- [x] **Step 3: 구현** — spec v8 §5.5, §5.7, §8.2, §8.3-8, §9.2, §9.3, §10.1.
- [x] **Step 4: 생성물** — `node scripts/update-runtime-assets.mjs`, `node tests/node/fixtures/installed-layout.mjs --write`, `node scripts/update-manifest.mjs`.
- [x] **Step 5: GREEN 확인** — 관련 테스트(아래)와 check 4종.
- [x] **Step 6: 커밋**(Orchestrator 수락 후): `fix(runtime): verify 생성 경로 소유 검사·중단 command incomplete·rerun 대상 판정·파서 연결 보완`, trailer `Plan-Revision: v7 -> v8`.

**기준:** A-S1·A-S3·A-S4·A-S5 보완, AC-2(F3), AC-6(D1 뒤 dogfood), AC-7(F2), AC-10(F1·F7).

**관련 테스트:** `tests/node/runtime-final-verify.test.mjs`, `tests/node/runtime-test-results.test.mjs`, `tests/node/runtime-assets.test.mjs`, `tests/node/runtime-versions.test.mjs`, `tests/node/installed-layout-golden.test.mjs`, `tests/node/manifest.test.mjs`.

**검증 순서:** 같은 Implementer에서 Reviewer finding(F1·F2·F3·F7) 재검토는 Implementer → Reviewer로 진행한다. dogfood 결함(D1·D2)은 최종 검증의 새 실패이므로 Implementer → fresh QA로 확인한다. 그다음 Reviewer가 refreshed-diff를 확인한다. 수정은 재검토가 끝날 때까지 커밋하지 않는다. 그 뒤 Orchestrator가 dogfood와 전체 회귀를 다시 처음부터 실행한다.

**결과(2026-11-21):**
- Implementer `e4226604`(세그먼트 0~3)가 수정했다.
- fresh QA `2fc37edd`가 D1·D2를 proven으로, symlink 판정을 resolved로 확인했다. 실제 dogfood 출력을 다시 파싱한 결과는 3,366건 중 fail 35, skip 15, 예외 0이다.
- 같은 Reviewer가 네 차례 재검토했다. F1·F2·F3·F7과, 재검토 중 나온 N1~N3·N5~N7을 모두 resolved로 판정했다(N6은 spec 문구 정정). N4(win32)는 spec §13-7의 한계로 남겼다.
- host 관련 9개 파일은 423/423 통과, skip 0이다. check 4종은 0이다.

### 최종 검증 보정 2 (v9, 통합 브랜치)

**배경:** 22d8126b dogfood에서 baseline run `20261121T144438Z-45f20beb`와 head run `20261121T145444Z-a04507c0`을 비교했다. verdict는 `new-failures` 12건이었다.
- Python 10건은 가짜다. `test_profiles_bound_recovery_without_relaxing_role_authority`의 subTest 이름 `(path='<tmp>/arc-verify/<hash>/<runId>/wt/...')`에 run별 경로가 들어 있었다. 그래서 같은 기준선 실패가 새 실패와 사라진 테스트로 갈렸다(AC-6 unmet).
- node 2건은 verify-rerun 단독 실행에서 통과했다. 간헐 후보로 최종 보고에 남긴다.
- 사용자 결정(2026-11-22): "이름 정규화 수정 후 재실행".

**Files:** `lib/runtime/test-results.mjs`(필요하면 `final-verify.mjs`에서 ctx 전달)와 각 `shared/skill/runtime/` 미러, `tests/node/runtime-test-results.test.mjs`, `tests/node/runtime-final-verify.test.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`.

- [x] **Step 1: 실패하는 테스트 작성** — 아래 (a)–(i)를 쓴다. (f)는 현재 동작을 고정하는 테스트라 RED가 없다.
  - (a) `names containing worktree path normalize to {worktree} placeholder`: 파서 4종이 대상이다. realpath 형태와 tmpdir 비-realpath 형태를 둘 다 넣는다.
  - (b) `same test with run-specific worktree path in subTest name reproduces baseline in compare`: 서로 다른 worktree 경로를 가진 두 run이 `baselineReproduced`로 나오고 `newFailures`와 `disappearedTests`가 비어야 한다.
  - (c) runner 경로를 끝까지 거쳐, 실제 `verifyStart` 결과의 이름이 치환되는지 확인한다(D1 교훈).
  - (d) QA 반례 1(사용자 결정 "둘 다 수정"): 인용된 `…/wt,other`, `…/wt other`, `…/wt:other`는 바뀌지 않는다.
  - (e) QA 반례 2: 바꾼 뒤 이름이 같은 `#1`·`#2` 가운데 `#2`를 재실행했는데 출력에 `#1`만 있으면 attempt는 `no_match`다.
  - (f) QA 재확인 사례(사용자 결정 "의도된 동작으로 명시"): 인용된 `'/outside,<worktree>/a'`와 `'/outside <worktree>/a'`는 `{worktree}`로 바뀐다. 이 테스트는 현재 동작을 고정한다.
  - (g) Reviewer V9-1(사용자 결정 "보수적 검출 추가"): 원래 이름이 다른 두 테스트가 바꾼 뒤 같은 (file, suite, name)이 되고 base·head 사이에 구성이나 순서가 바뀐다. 이때 head 실패는 `baselineReproduced`가 아니라 `newFailureCandidates`(`normalized_name_collision`)로 나온다. 원래 이름이 완전히 같은 중복은 대상이 아니다. 캐시로 재사용한 base에서도 같게 판정한다.
  - (h) Reviewer V9-5·V9-6(사용자 결정 "V9-5·V9-6 수정, V9-7 후속"): suite 원래 표기만 다른 충돌(예: junit `testsuite name="<real>/s"`와 `"<alias>/s"`, tap `# Subtest`)도 (g)와 같이 후보로 나온다. md 보고서의 후보 절 제목은 "새 실패 후보"다.
  - (i) Reviewer V9-8(사용자 결정 "spec대로 수정"): suite 원래 표기만 다른 `#1`·`#2` 가운데 `#2`를 재실행했는데 출력에 `#1`만 있으면 attempt는 `no_match`다. 재실행 대상 대조는 suite와 name의 원래 표기를 모두 비교한다.
- [x] **Step 2: RED 확인**
- [x] **Step 3: 구현** — spec v9 §9.1, §9.4-4, §9.6 md 순서.
- [x] **Step 4: 생성물**
- [x] **Step 5: GREEN 확인** — 관련 테스트와 check 4종을 돌린다.
- [x] **Step 6: 커밋**(Orchestrator 수락 후): `fix(runtime): verify 테스트 식별자에서 run별 worktree 경로 정규화`, trailer `Plan-Revision: v8 -> v9`.

**검증 순서:**
1. 최종 검증의 새 실패이므로 Implementer → fresh QA 순서로 확인한다. QA는 실제 head·baseline raw 출력에 수정된 파서를 적용했을 때 Python 10건이 기준선 재현으로 바뀌는지 확인한다.
2. 이어서 같은 Reviewer가 refreshed diff를 확인한다.
3. 커밋한다.
4. 커밋 뒤 Orchestrator가 dogfood baseline·head를 다시 기록하고 비교한다.

**결과(2026-11-22):**
- Implementer `49ffc979`(세그먼트 0~7)가 수정했다. 세그먼트 0~1은 RED 실행 도구 거부와 fixture 입력 누락으로 멈췄다가 재개했다.
- fresh QA `b373e73f`: AC-6 proven. 실제 raw 재파싱에서 Python 공통 testId 630, 새 실패 10 → 0, node 분류 변화 없음. QA 반례 2건은 수정했고 resolved다. 재확인 사례 1건은 의도된 동작으로 명시했다(f).
- 같은 Reviewer가 네 차례 재검토했다. V9-1·V9-2·V9-4·V9-5·V9-6·V9-8은 resolved다. V9-3(file 별칭), V9-7(schema가 다른 run의 비교 제한), V9-9(이전 형식 run의 중첩 suite 재실행)는 후속 과제이며 spec §13-8에 한계로 적었다.
- `PARSER_SCHEMA_VERSION`을 3으로 올렸다.
- host 관련 9개 파일 445/445 통과, skip 0. check 4종 모두 0.

### dogfood 절차 (§12.2, Orchestrator, claude host)

호출: `node /Users/yunho/Desktop/project/arc/.claude/worktrees/final-verify-baseline-cache/lib/runtime/verify-cli.mjs <command> --cwd /Users/yunho/Desktop/project/arc/.claude/worktrees/final-verify-baseline-cache --workflow wf-final-verify-cache --input -`

1. 무거운 다른 검사가 동시에 돌지 않는지 확인한다(`declaredConcurrent:false`). 최종 Reviewer는 읽기 전용이라 경합으로 보지 않지만, Orchestrator가 판단해 필요하면 `true`로 증언한다.
2. baseline start(`detach:true`, claude host에서 detach 생존 관측). 입력 초안:

```json
{"hostPlatform":"claude","executionEnvironment":"claude-cli","sandboxMode":"none",
 "role":"baseline","revision":"68ef36c864f7dfe6fa1bebffc15906f2d95a16a7","detach":true,
 "prepare":[{"executable":"npm","args":["ci","--ignore-scripts"]},{"executable":"npm","args":["run","build:native"]}],
 "commands":[
  {"id":"node","executable":"node","args":["--test","--test-reporter={arcNodeReporter}","--test-reporter-destination=stdout",{"glob":"tests/node/*.test.mjs"}],
   "results":{"format":"junit-xml","stream":"stdout"},
   "isolate":{"args":["--test","--test-reporter={arcNodeReporter}","--test-reporter-destination=stdout","--test-name-pattern","{namePattern}","{file}"]}},
  {"id":"python","executable":"python3","args":["-B","-m","unittest","discover","-s","tests","-p","test_*.py","-v"],
   "env":{"PYTHONDONTWRITEBYTECODE":"1"},
   "results":{"format":"regex","stream":"stderr",
    "pattern":"^\\s*\\w+ \\((?<name>[\\w.]+)\\)(?: \\(.*\\))? \\.\\.\\. (?<status>ok|FAIL|ERROR|skipped|expected failure|unexpected success)",
    "statusMap":{"pass":["ok","expected failure"],"fail":["FAIL","ERROR","unexpected success"],"skip":["skipped"]}},
   "isolate":{"args":["-B","-m","unittest","-v","{name}"],"cwd":"{worktree}/tests"}},
  {"id":"check-manifest","executable":"node","args":["scripts/update-manifest.mjs","--check"],"results":{"format":"none"}},
  {"id":"check-role-policy","executable":"node","args":["scripts/update-role-policy.mjs","--check"],"results":{"format":"none"}},
  {"id":"check-parity","executable":"node","args":["scripts/check-installer-parity.mjs"],"results":{"format":"none"}},
  {"id":"check-runtime-assets","executable":"node","args":["scripts/update-runtime-assets.mjs","--check"],"results":{"format":"none"}}
 ],
 "keyInputs":{"envNames":["PYTHONDONTWRITEBYTECODE"],
  "toolVersionCommands":[{"executable":"node","args":["--version"]},{"executable":"python3","args":["--version"]}],
  "dependencyPaths":[],"artifactPaths":[]}}
```

   Python 패턴 근거는 `scratchpad/m/head1/py.out` 1~4행이다. 일반 줄은 `test_x (mod.Class.test_x) ... FAIL`, subTest 줄은 들여쓰기와 `(params)`가 붙고, 부모 줄은 `... `로 끝나 상태가 없으므로 매치하지 않는다. `name`은 점 표기 전체 id이고 subTest는 `#k`로 구분한다. 패턴 확정은 spec §14 builder 재량이고 이 dogfood에서 검증한다.
3. `verify-status`를 `waitMs:600000`으로 `succeeded`가 될 때까지 호출한다. 단계 시간과 load class를 기록한다.
4. **파서 교차 검증:** tool baseline의 failed testId 이름 집합(file::name 기준)을 clean 수동 기준선(`/Users/yunho/Desktop/project/arc/.git/arc/handoff/baseline-68ef36c8/``node-fail.txt` 35건)과 비교한다. 차이로 허용되는 것은 간헐 후보 3건(`baseline.md`)뿐이며 따로 표시한다. Python은 `py-fail.txt`의 FAIL·ERROR 줄 수(554, 경로 정규화)와 parsed failed 수가 같아야 하고 `unmappedStatusCount`도 기록한다. 그 밖의 차이가 있으면 compare 결과를 판정에 쓰지 않고 파서 결함으로 Implementer → QA에 보낸다.
5. 같은 입력으로 다시 start한다. 3의 load class가 `quiet`이면 `cacheHit:true`, `worktree:null`, `reusedFrom`=첫 runId여야 한다. `contended`·`unknown`이면 `cacheHit:false`가 정상이므로 기록만 한다.
6. head start: `role:"head"`, `revision`=수락된 마지막 task commit의 전체 OID, `detach:false`, 그 밖에는 2와 같은 입력이다. 시작 전에 `git status`로 미커밋 변경이 없는지 확인한다. 있으면 `snapshotWorkingTree:true`를 쓰고 included·excluded를 기록한다.
7. `verify-compare`(topN 10) → verdict, 새 실패, 후보, 간헐 후보, slowest를 기록한다. 기준 결과: manifest 가짜 새 실패 0건(AC-6).
8. 간헐 후보가 있으면 그 testId로 `verify-rerun`을 1회씩, limit 3 이하로 명시 호출하고 yes/no와 횟수를 기록한다.
9. `verify-cleanup`을 run별로 `dryRun:true`로 먼저 호출하고, 그다음 `dryRun:false`로 호출한다(도구 생성 worktree만 대상, Q1 승인 범위). `runs/` 증거는 남긴다.
10. 기록할 것: node·Python·check wall time, prepare 단계 시간, 부하 class, cacheHit, claude host에서 detach runner가 Orchestrator 턴이 끝난 뒤에도 살아 있었는지(heartbeat 연속성). Codex·Grok·Gemini host는 이 세션에서 실측할 수 없으므로 미확인으로 남긴다.

## Planner 질문 결정 (Orchestrator, 승인 시 함께 확정)

- Q1 dogfood가 최종 검증을 겸한다. 조건은 dogfood 4 파서 교차 검증 통과다. 불일치하면 tool 결과를 판정에 쓰지 않고, 수동 전체 회귀(`node --test tests/node/*.test.mjs`, Python 전체, check 4종)로 최종 검증을 수행한다.
- Q2 T5의 Claude bullet은 미확인 문장으로 둔다. dogfood에서 detach 생존을 관측하면 결과만 보고하고, 문장 변경은 별도 사용자 결정 전까지 하지 않는다.
- Q3 가정 A2 채택.
- Q4 가정 A5 확정(prepare 2개).
- Q5 가정 A1 수용.

## 인수 기준 대응표

| 항목 | task |
|---|---|
| A-C1 / AC-1 | T2(실행), T4(보고서 펼친 목록) |
| A-C2 / AC-2 | T1(분류), T4(rerun·유지) |
| A-C3 / AC-3 | T2 |
| A-C4 / AC-4 | T2(부하 기록), T3(detach·병행 명령), T4(run_incomplete) |
| A-C5 / AC-5 | T2 |
| A-C6 / AC-6 | T2(비대칭 회귀), T3(snapshot), 최종 dogfood 7 |
| A-C7 / AC-7 | T1 |
| A-C8 / AC-8 | T1(계산), T4(보고 연결) |
| A-C9 / AC-9 | T5, T1·T2(인벤토리·baselineHash), 최종 check 4종 |
| AC-10 | T2·T3·T4 보존 단언 |
| A-S1 | T2(start·status), T4(compare·rerun·cleanup) |
| A-S2 | T2 |
| A-S3 | T2(§8.1·8.2·8.4), T3(§8.3), T4(§8.5) |
| A-S4 | T1, T4 |
| A-S5 | T2(foreground·timeout), T3(detach·heartbeat·큐·부하) |
| A-S6 | T5 |
| A-S7 | 전 task 파일·테스트, 최종 검증 |
| A-S8 | 범위 밖: R4·동시 실행 기본값·기준선 생략은 구현하지 않음. 큐가 동시 실행을 막는다(T3) |

## spec §13 미확인 항목 확인 계획

| # | 확인 task·방법 | 확인 실패 시 hold |
|---|---|---|
| 1 Codex sandbox 쓰기·detach 생존 | 이 plan에서는 실측하지 않는다(Codex host 세션 없음). T5 문서는 호출마다 escalation하고 `detach:false`를 쓰도록 적는다. bridge QA 안에서 T2·T3 테스트가 tmp 저장소 `.git`·tmpdir 쓰기와 detached 자식을 쓰므로, 그 결과는 bridge 자식 조건의 간접 관측으로 기록한다. 이것은 host 증거가 아니다 | 문서 서술은 미확인 그대로 두므로 hold할 작업이 없다. bridge 안에서 테스트가 sandbox 때문에 실패하면 해당 테스트만 환경 hold하고 Orchestrator가 직접 실행한다(T2·T3 Hold) |
| 2 Grok·Gemini detach | 실측하지 않는다. T5에서 `detach:false`를 기본으로 문서화한다 | hold 없음 |
| 4 lock 등록 + 디렉터리 없음 | T4 `missing worktree directory is residual and cleanup_partial without prune`. 가정 A4로 git 호출을 건너뛰어 버전 의존성을 없앤다. QA는 `git --version`을 함께 기록한다 | 테스트가 실패하면 T4 수락 hold |
| 5 node tap location·load 실패 형태 | T1 Step 0 실측 픽스처, dogfood 4 교차 검증 | location이 없으면 T1과 그 이후 hold, Orchestrator에 spec 결정 요청. dogfood 4가 불일치하면 compare 판정 사용을 보류하고 파서를 수정 |
| 6 parity·golden 파일명 | plan 단계에서 확인함. `scripts/check-installer-parity.mjs`는 legacy 단언 원장(`tests/installer-parity.json`)만 검사하고 runtime 파일 목록을 갖지 않으므로 변경이 필요 없다(`:13-46`). golden은 `tests/node/fixtures/installed-layout-golden.json`(16조합 모두에 runtime·references 해시 포함), 검증은 `tests/node/installed-layout-golden.test.mjs`, manifest는 `tests/node/manifest.test.mjs` | 해결됨 |
| 7 win32 loadavg·그룹 kill | T2 `classifyLoad boundaries`에서 `platform:'win32'`·`[0,0,0]` 주입 → unknown. 그룹 kill은 가정 A2(Q3) | 실제 win32 실행 증거는 없다. 보고서에 미확인으로 남기고 hold하지 않는다 |

## 의존 관계

T1 → T2 → T3 → T4 → T5 → 최종 검증(+최종 Reviewer). T1~T4가 같은 파일(`final-verify.mjs`, MANIFEST, golden)을 이어서 바꾸므로 순차로 진행한다. task 하나가 focused commit 하나다.

## Revision history

| Version | Date | Change | Approval |
|---|---|---|---|
| v1 | 2026-11-21 | Planner 첫 완성본. Orchestrator 검토: 기준선을 clean worktree 기록으로 교체, dogfood prepare 확정(Q4), Q1~Q5 결정 기록 | 사용자 승인 2026-11-21 |
| v2 | 2026-11-21 | T1 Step 0 hold(node tap 통과 test에 location 없음) 후 ARC node reporter를 T1에 추가, `{arcNodeReporter}` 자리표시자, dogfood node 명령을 junit-xml로 변경 (spec v2와 함께) | 사용자 승인 2026-11-21 |
| v3 | 2026-11-21 | T2 QA finding 처분: spec v3 §6.1 보완(`{worktree}` PATH 실행 파일은 phase2 입력)에 맞춰 T2 기준 A-S2 해석을 갱신. task·파일 범위 불변 | 사용자 승인 2026-11-21 |
| v4 | 2026-11-21 | T3 Implementer hold 후: spec v4 §8.3 스냅샷 메시지 고정 반영, AC-4의 cleanup dryRun 동시 호출 확인을 T3에서 T4로 이동(T3는 status만) | 사용자 승인 2026-11-21 |
| v5 | 2026-11-21 | T4 Implementer 안전성 hold 후: spec v5 §8.5 중첩 worktree 보호(`nested_worktree`)를 T4 테스트와 구현에 추가 | 사용자 승인 2026-11-21 |
| v6 | 2026-11-21 | T4 재시작 Implementer hold 후: spec v6 bare 저장소 감지·재검사 테스트 2건 추가, 경합 창은 알려진 한계 | 사용자 승인 2026-11-21 |
| v7 | 2026-11-21 | T4 세 번째 Implementer hold 후: spec v7 도구 디렉터리 소유·0700·비symlink 확인(`cleanup_unsafe_path`) 테스트 추가 | 사용자 승인 2026-11-21 |
| v8 | 2026-11-21 | 통합 브랜치 최종 검증에서: 최종 Reviewer F1·F2·F3·F7과 dogfood 결함 D1(`ctx.fileExists` 누락)·D2(runner 예외 뒤 `running` 고정)를 "최종 검증 보정 (v8)" 절로 추가 (spec v8과 함께). 머리말 상태 정정 | 사용자 결정 2026-11-21 |
| v9 | 2026-11-22 | dogfood 비교의 가짜 새 실패(식별자에 worktree 경로)를 "최종 검증 보정 2 (v9)" 절로 추가 (spec v9와 함께) | 사용자 결정 2026-11-22 |
