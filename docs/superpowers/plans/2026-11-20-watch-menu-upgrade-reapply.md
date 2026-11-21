# watch 메뉴·업그레이드 재적용 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** composite 설치 업그레이드 시 혼합 라우팅을 자동 재적용하고, `arc watch`를 플랫폼 선택 메뉴로 시작해 현재 worktree 범위로 고정하며, 하위 세션 메시지(PROMPT)를 구분하고 AGENT·PROMPT를 Markdown으로 렌더링한다.

**Architecture:** R1은 새 패키지 코드로 도는 업그레이드 자식(`runChild`)이 하네스 갱신 성공 후, TUI Configure가 쓰는 초안·요청 생성 함수(`lib/tui/setup.mjs`, `lib/tui/derive-install-plan.mjs`)로 "변경 없는 Apply" 요청을 만들어 `prepareOperation`→`executeOperation`으로 실행한다(composite는 marker·routing profile 새 revision 게시, standalone은 플랫폼별 install). R2는 TUI 메뉴 원시 기능을 management 의존 없는 모듈로 추출해 watch에서 재사용하고 registry `watch` capability로 플랫폼을 정한다. R3은 watcher `clean` 단계에서 분류하고, R4는 의존성 없는 `lib/watch/markdown.mjs`가 color human 출력에만 스타일을 입힌다.

**Tech Stack:** Node.js ≥22 ESM, `node:test`, 저장소 내부 TUI(`lib/tui/terminal.mjs`), safe-fs/installer transaction.

**Spec:** 없음(Bounded, plan 필수). 아래 "설계 요지"가 승인 설계 v1(2026-11-20 사용자 승인)의 결정이다.

## 설계 요지(승인 설계 v1 결정)

- **R1(2026-11-20 사용자 지시로 standalone 포함):** 업그레이드 자식에서 `upgradeInstalledTargets` 성공 후, 사용자가 Configure 화면에서 아무것도 바꾸지 않고 Apply를 누른 것과 같은 요청을 실행한다. composite면 현재 composite 설정(플랫폼·roles·settings)으로 composite Apply 1회(revision만 새로 생성), standalone이면 설치된 standalone 플랫폼마다 그 플랫폼의 현재 설정(roles·language·run mode·limits)으로 standalone Apply 1회. 설치 없음은 재적용하지 않고 출력도 바꾸지 않는다. 하네스 갱신 실패 시 재적용하지 않는다. active dispatch 보류와 기타 재적용 오류는 안내 후 exit 1, 인터럽트 130. 부분 publish 없음. 다음 실행 시 "재적용 필요" 감지 표시는 범위 밖.
- **R2:** TTY에서 `arc watch`는 제목이 `Which platform to watch?`(사용자 지시: 최대한 짧은 의문문)인 메뉴를 먼저 띄운다. 항목은 `All` + registry 표시 순서 플랫폼이며, watch 미지원은 `(not supported)` 표시·선택 불가. 모든 항목은 현재 worktree 범위. `--cwd/--all/--session/--platform` 제거(Unknown option, exit 2). 비TTY는 안내 + exit 2(`--json` 포함). 메뉴 단계에서도 native/installer/management를 불러오지 않는다.
- **R3:** `kind==='user'`이고 `parentId` 또는 `dispatchId`가 있으면 `prompt`(PROMPT, `1;35`), 나머지 USER는 태그 `1;97`·본문 `97`.
- **R4:** AGENT·PROMPT만, color human 출력에서만 Markdown 렌더링. USER·비color·`--json`은 원문. 표는 정렬 표로 그리고, 폭을 넘으면 셀 안 줄바꿈, 그래도 안 되면 카드 형태(v3, 사용자 지시).

## Global Constraints

- 플랫폼 대칭: 새 코드에 `codex`/`claude` 목록을 하드코딩하지 않는다. 플랫폼은 `DEFAULT_PLATFORM_REGISTRY`(watch) 또는 installer registry(R1)에서 얻는다. 문서·help 문구는 host 중립.
- watch 경로: `lib/watch/**`와 그 import 그래프는 `lib/management/`, `lib/installer/`, `lib/safe-fs/`를 정적·동적으로 불러오지 않는다(`docs/harness-operation.md:149`).
- `lib/` 아래 파일을 바꾸거나 만드는 작업은 그 작업 안에서 `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`를 재생성하고 `npm run check:manifest`를 통과한다.
- 테스트·스크립트는 `PYTHONDONTWRITEBYTECODE=1`로 실행한다. 실행 후 git-ignored `__pycache__`가 생기면 payload 해시 테스트가 깨질 수 있으므로 지우고 다시 돌린다.
- **검증 범위(v2, 2026-11-20 사용자 지시):** 각 작업의 QA(최초 검증과 결함 수정 후 재검증 모두)와 Implementer 작업 단위 검증은 수정된 부분과 관련 테스트 묶음만 실행한다. 전체 `npm test` 회귀는 "최종 검증"에서 1회만 실행한다.
- **Baseline 실패:** master(12aa9a3)에는 원래 있던 테스트 실패가 있을 수 있다. 각 작업은 먼저 같은 명령의 baseline 실패 집합을 기록하고, 새 실패만 current로 분류해 보고한다.
- 런타임 모듈(`shared/skill/runtime/**`)은 바꾸지 않는다. 바뀌면 hold하고 Orchestrator에 보고한다(`runtime-versions` baselineHash·parity 영향).
- 작업 하나 = focused commit 하나(Orchestrator가 수행), 메시지 `type(scope): 한국어 설명`.
- 실행 위치: `/Users/yunho/Desktop/project/arc/.claude/worktrees/watch-menu-upgrade-reapply`, 브랜치 `feat/watch-menu-upgrade-reapply`, base `12aa9a3bbf9dc30243d69cb85a10b685d1162328`.

## Review Focus

1. composite 업그레이드 직후 다른 프로세스가 Configure를 실행한 경우: snapshot drift로 재적용 보류(exit 1), 부분 게시 없음(T1 `reapply snapshot drift holds without partial publish`).
2. 메뉴에서 Ctrl-C·Back: 터미널(raw mode, alt screen) 복원, watch 미시작(T2 `menu cancel restores terminal and never starts watcher`).
3. 메뉴 선택 후 dispose(`\x1b[?1049l`)가 첫 watch 출력보다 먼저(T2 `menu dispose precedes watch raw mode and first output`).
4. Markdown 입력의 ESC·제어문자가 출력에 나오지 않음(T4 `markdown never emits input-originated escapes`).
5. 닫히지 않은 code fence, `a*b*c`, `snake_case` 오탐 없음(T4 `markdown avoids emphasis false positives and tolerates open fence`).

## 미해결 U1~U5 해소 결과

- **U1 kind:** Planner 초안은 `kind:'preset'`을 권했으나, 사용자 지시("Configure > Apply도 같이", standalone 포함)에 따라 **Configure Apply와 같은 `kind:'install'` 요청**을 쓴다. marker runtime/policy hash는 operation 종류와 무관하게 `publishCompositeFiles`가 재계산하므로(`lib/installer/role-routing.mjs:179-187`; 검증 `lib/runtime/role-routing.mjs:103`) install로도 `activation_unverified`가 풀린다. Apply 요청은 `skipGlobal:false`로 global instructions·native 동시성 설정도 현재 설정값으로 다시 쓴다(`lib/tui/setup.mjs:42-55`, `operations.mjs:95-106`). 이는 사용자가 수동 Apply할 때와 같은 결과다.
- **U2 stateToken·lock:** stateToken은 기존대로 하네스 쓰기 전 `runChild`에서 검사(`lib/management/update.mjs:31`). 재적용은 `prepareCompositeOperation` snapshot(`operations.mjs:110,112`) → `executeCompositeOperation` snapshot·availability 재확인(`:129-130`) → `publishCompositeFiles`의 role-routing lock(`role-routing.mjs:174`)·active dispatch 검사(`:175`)·snapshot 재확인(`:178`) 후 transaction 게시. 추가 lock 불필요.
- **U3 테스트·MANIFEST:** 단위 `tests/node/upgrade-cli.test.mjs`(`runChild` deps 주입 패턴 `:15`), 통합 새 파일 `tests/node/upgrade-reapply.test.mjs`. MANIFEST `node scripts/update-manifest.mjs` / `npm run check:manifest`. 전체 `npm test` = `node --test tests/node/*.test.mjs`.
- **U4 dispose 순서:** `createTerminalSession`은 raw mode·alt screen·SIGINT/SIGTERM 리스너 설정(`lib/tui/terminal.mjs:31-96`), `dispose`가 리스너 해제·raw 원복·pause·alt screen 종료(`:45-54`). 메뉴 `finally`에서 `session.dispose()` 후 `followWatch` 시작, `followWatch`가 `setRawMode(true)`/`resume` 재수행(`lib/watch/index.mjs:146-150`).
- **U5:** `<task-notification>` 등 상위 세션 시스템 생성 user 메시지는 parentId/dispatchId가 없어 USER로 남는다. 범위 밖(후속 과제).

---

### Task T1: 업그레이드 시 Configure Apply 자동 재적용 (R1)

**목표·범위:** 업그레이드 자식이 하네스 갱신 성공 후 현재 설치 모드에 맞는 "변경 없는 Configure Apply"를 실행한다(composite 1회, standalone은 설치된 플랫폼마다 1회). npx bootstrap은 새 패키지에 해당 export가 있으면 그 경로, 없으면 기존 경로.

**Files:**
- Create: `lib/management/reapply.mjs`
- Modify: `lib/management/update.mjs:10-14`(`runtime`에 reapply 모듈 추가), `:24-36`(`runChild`), 새 export `upgradeAndReapply`; `lib/npm/upgrade.mjs:42-51`(bootstrap: `management.upgradeAndReapply` 있으면 사용, 없으면 기존 `report(upgradeInstalledTargets…)`); `docs/harness-operation.md:159`(Update 행), `:185`(Upgrade 결과 행); `MANIFEST.sha256`
- Test: `tests/node/upgrade-cli.test.mjs`, Create `tests/node/upgrade-reapply.test.mjs`

**Interfaces:**
- `reapplyConfiguration({packageRoot, userHome, cwd, env, safeFs, signal, platforms, runtimePlatforms, loadCatalog}) → Promise<{status:'skipped'} | {status:'applied', mode:'composite'|'standalone', platforms:string[], residualPaths:string[], code:0|1, error?} | {status:'held', mode, code:1|130, error, activeDispatches?:string[], residualPaths:string[], applied?:string[]}>` (`lib/management/reapply.mjs`):
  1. `createManagementContext({...})` → `currentInstallState(context)`, `collectStatus(context)`. mode가 composite도 standalone도 아니면(설치 없음·unverified) `skipped`.
  2. Apply 요청 생성은 TUI Configure와 같은 함수를 재사용한다(`lib/tui/setup.mjs` `loadRoleDefaults`·`installSettingsDraft`·`installPrepareOptions`, `lib/tui/derive-install-plan.mjs` `deriveInstallPlan`). 사용자 변경(touched)이 없는 초안이다. 필요하면 `runInstallFlow`의 초안 초기화 부분(`setup.mjs:107-116`)을 UI 없는 export 함수로 추출해 TUI와 공용으로 쓴다(TUI 동작 불변).
     - composite: `draft.roles = readCompositeConfig(context).roles`(null이면 `TargetConfigurationError('Mixed routing configuration is missing')`), `draft.hosts = state.platforms`. `installPrepareOptions`가 만드는 `{kind:'install', target:'composite', platforms, config(새 revision), settings}`를 1회 실행.
     - standalone: 설치된(`state==='installed'`) 각 플랫폼 `id`마다(registry 표시 순서) `draft.roles`를 그 플랫폼 `loadRoleDefaults` 결과로, `draft.hosts=[id]`로 두고 `{kind:'install', target:id, roles, verifiedCatalog, ...settings}` 1회 실행.
     - `verifiedCatalog`는 TUI와 같은 catalog loader(`loadCatalog`, deps 주입 가능)로 얻는다. catalog가 `ready`가 아니면 해당 플랫폼은 Apply하지 않고 held(오류 `Model catalog unavailable for <Label>`).
  3. `prepareOperation(context, request)` → `executeOperation(context, prepared)`. composite는 `activation==='published'`이면 성공. standalone은 플랫폼마다 성공/실패를 모아 하나라도 실패하면 `held`(이미 적용된 플랫폼은 `applied`에 기록, 되돌리지 않음). `error.activeDispatches` 전달. `prepared.kind==='switch'` 등 Apply가 확인 질문을 요구하는 결과는 실행하지 않고 held.
- `upgradeAndReapply({api, root, state, output, error, signal, env, cwd, userHome}) → Promise<number>` (`lib/management/update.mjs`): `report(await api.upgradeInstalledTargets(...))`가 0이 아니면 그 코드 반환(재적용 안 함), 0이면 `api.reapplyConfiguration(...)`. `runChild`와 새 npx bootstrap이 공용.
- 출력 문구(고정): 성공 composite `Configuration re-applied: Mixed routing (<Label> + <Label>).`, standalone `Configuration re-applied: <Label>, <Label>.`(`sortByDisplay`+`platformLabel`, registry 기반) 후 `Residual path: …`. 보류 공통 첫 줄(stderr) `Configuration was not re-applied.`(standalone 일부 성공 시 `Configuration was re-applied only for: <Label>, ….`을 먼저 출력); active dispatch면 `Active bridge dispatches (<N>): <id>, …` + `After they finish, run arc → Configure → Apply.`; 기타 오류면 `Error: <message>` + `Run arc → Configure → Apply to re-apply the configuration.`. exit: 보류 1, 인터럽트(`signal.aborted`) 130, cleanup 오류 시 1.

**선행:** 없음.

**수용 기준:**
- AC1-1: composite 설치에서 `runChild`가 0으로 끝나고, 모든 참여 home의 marker `runtime.hash`/`policyHash`가 현재 패키지 값, `revision`이 새 값이며, settings(language·run mode·limits)·roles(platform/model/effort)가 유지되고, routing 판정이 `activation_unverified`가 아니다.
- AC1-2: standalone 설치(1개 또는 여러 플랫폼)에서 `runChild`가 0으로 끝나고, 플랫폼마다 Configure Apply와 같은 install이 실행되어 `models.toml`·`settings.toml`·`limits.toml`의 설정값이 유지되며, 결과가 같은 초안으로 TUI Apply를 실행한 결과와 같다(동일 request 객체 비교). 설치 없음은 `skipped`, stdout/stderr가 기존과 바이트 동일.
- AC1-3: `report`가 0이 아니거나 인터럽트되면 `reapplyConfiguration`을 호출하지 않는다.
- AC1-4: composite active bridge dispatch 시 위 문구 + exit 1, 기타 오류 exit 1, 인터럽트 130. composite 보류 시 active config·marker·profile 바이트가 재적용 전과 동일(부분 게시 없음). standalone 일부 실패 시 실패 플랫폼은 바이트 불변이고 성공 플랫폼 목록이 출력된다.
- AC1-5: stateToken 불일치는 하네스 쓰기 전 거부(기존 테스트 유지). npx bootstrap은 `upgradeAndReapply` 있으면 사용, 없으면 기존 경로.

**단계(TDD):**
- [x] baseline: `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/upgrade-cli.test.mjs` 및 `PYTHONDONTWRITEBYTECODE=1 npm test` baseline 실패 집합 기록.
- [x] RED 1: `tests/node/upgrade-cli.test.mjs`의 `dependencies()`에 `reapplyConfiguration` 주입(events에 `'reapply'`) 후 `child reapplies configuration only after harness success`(events `['harness','reapply']`, `Configuration re-applied:` 출력), `child skips reapply when nothing is installed and keeps output unchanged`, `child never reapplies after harness failure or interrupt`, `child reports held reapply with active dispatches and exits 1`, `child reports partial standalone reapply and exits 1`, `child reports other reapply errors with exit 1 and interrupt with 130`.
- [x] RED 2: `tests/node/upgrade-reapply.test.mjs` — 임시 HOME fixture(`tests/node/management-operations.test.mjs`·`tests/node/install-mode-n-platform.test.mjs`의 fixture helper·status stub·catalog stub 재사용):
  - composite: marker `runtime.hash`를 다른 유효 hash로 바꿔 구버전 흉내, 재적용 전 routing 판정 `activation_unverified` 확인(baseline), 재적용 후 AC1-1 assert; `reapply snapshot drift holds without partial publish`(prepare 후 settings.toml 변경 → held, 바이트 불변).
  - standalone: 단일·다중 플랫폼 standalone 설치에서 재적용 후 AC1-2 assert(설정 파일 값 유지, `reapplyConfiguration`이 만든 request가 같은 상태에서 `installPrepareOptions`로 만든 request와 같음); catalog 실패 플랫폼은 held·바이트 불변.
- [x] RED 확인: `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/upgrade-cli.test.mjs tests/node/upgrade-reapply.test.mjs` → 새 테스트 FAIL.
- [x] GREEN: `lib/management/reapply.mjs`, `upgradeAndReapply`, `runChild` 연결, npx bootstrap 분기. `runtime()`의 `Promise.all`에 `import('./reapply.mjs')` 추가, deps로 덮어쓰기 가능. 초안 초기화를 `lib/tui/setup.mjs`에서 export 함수로 추출한 경우 `tests/node/tui-app.test.mjs`·`tests/node/tui-*.test.mjs` 회귀 PASS.
- [x] GREEN 확인: 같은 명령 PASS.
- [x] 문서: `docs/harness-operation.md:159,185`에 "업그레이드 후 현재 설정으로 Configure Apply를 자동 재실행(composite·standalone), 보류 시 Configure → Apply"와 O2 한계("이전 버전에서 npx로 업그레이드한 첫 회는 Configure → Apply 필요")를 host 중립으로 추가.
- [x] 패키징: `node scripts/update-manifest.mjs` → `npm run check:manifest` PASS.
- [x] 회귀: `PYTHONDONTWRITEBYTECODE=1 npm test` — baseline 대비 새 실패 없음.
- [x] 커밋(Orchestrator): `feat(upgrade): 업그레이드 시 Configure Apply 자동 재적용`
  - 진행 기록(2026-11-20): Implementer 618994f9(codex bridge) 구현, fresh QA 48ead9a4 — 최초 QA에서 AC1-4 결함 2건(게시 후 lock 실패 오보, 게시 후 SIGINT 모순 출력) 수정·재검증 pass. AC1-1~AC1-5 pass. 관련 테스트 `upgrade-cli`+`upgrade-reapply` 31 pass, `check:manifest` pass. 회귀(초기 지시): npm test 실패가 기준선 58건과 동일, 추가 실패는 `role-bridge-run` auth probe `Incomplete`(실행마다 달라짐, 환경 판정) — v2에 따라 최종 검증에서 재확인.

**QA(fresh, 필수, 임시 HOME 설치 fixture):**
1. scratchpad 임시 디렉터리에 `HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`(registry `home.env`)을 지정.
2. worktree 패키지로 composite install(테스트 fixture helper 또는 management API, auth/status는 fixture stub).
3. 각 marker `runtime.hash`를 다른 64자리 hex로 변경(구버전 흉내).
4. anchor home의 설치 runtime으로 routing-status 실행: `printf '%s' '{"hostPlatform":"claude","executionEnvironment":"claude-cli"}' | node "<anchor home>/skills/arc/runtime/cli.mjs" routing-status --cwd <임시 git 저장소> --workflow qa-reapply --input -` → `activation_unverified` 확인(baseline). anchor가 Codex면 `hostPlatform`/`executionEnvironment`를 `codex`/`codex-cli`로.
5. 업그레이드 자식 경로 실행(`runChild`에 global `inspectNpmContext` 주입, 실제 `upgradeInstalledTargets`·`reapplyConfiguration`, catalog는 fixture stub).
6. routing-status 재실행 → `activation_unverified` 아님, marker revision 변경, settings/models 설정값 유지.
7. active dispatch lease fixture를 두고 재실행 → exit 1·보류 문구·바이트 불변.
8. 별도 임시 HOME에 standalone 설치(단일, 그리고 두 플랫폼) → 업그레이드 자식 경로 실행 → exit 0, `Configuration re-applied:` 출력, 설정 파일 값 유지, 이후 같은 HOME에서 TUI Configure → Apply와 같은 request가 만들어졌음을 확인.
한계: 실제 `npm i -g` 교체와 실제 모델 catalog 네트워크 조회는 제외.

**보류 조건:** `readCompositeConfig`의 `roles`를 Apply 초안으로 그대로 쓸 수 없음, Apply 요청 생성에 UI 상호작용이 필수여서 비대화형 재사용이 불가능함, 런타임 모듈 변경 필요 — Orchestrator에 보고.

---

### Task T2: `arc watch` 플랫폼 선택 메뉴와 범위 옵션 제거 (R2)

**목표·범위:** TTY에서 `Which platform to watch?` 메뉴로 플랫폼 선택 후 현재 worktree 범위로 watch. 비TTY exit 2. `--cwd/--all/--session/--platform`과 내부 경로(`scope.kind` `'all'`/`'session'`, `options.session`, `mode`) 제거. `createTuiInterface`를 management 의존 없는 모듈로 추출.

**Files:**
- Create: `lib/tui/interface.mjs`(`createTuiInterface`와 `goHome`/`interrupted` 헬퍼를 `lib/tui/app.mjs:12-48`에서 이동, import는 `./render.mjs`만), `lib/watch/menu.mjs`
- Modify: `lib/tui/app.mjs:1-48`(interface에서 import·re-export), `lib/watch/args.mjs`(전체), `lib/watch/index.mjs:14-70`(help, runWatch 분리), `lib/watch/scope.mjs:26-28,47-48,61-62`, `lib/watch/watcher.mjs`(`:22,50-61,105,206,212,233,369,451-453,469` 부근 session/all 분기), `lib/watch/status-line.mjs:16-20`, `lib/cli/root.mjs:2,5`, `README.md:34,61`, `docs/harness-operation.md:192,194`, `MANIFEST.sha256`
- Test: `tests/node/watch-cli.test.mjs`, `tests/node/watch-scope.test.mjs`, `tests/node/watch-watcher.test.mjs`, `tests/node/watch-dispatch.test.mjs`, `tests/node/tui-app.test.mjs`(회귀), Create `tests/node/watch-import-graph.test.mjs`

**Interfaces:**
- `parseWatchArgs(argv) → {ok:true, options:{tail, verbose, json, width, help}} | {ok:false, message}` — 허용 `tail`, `width`(값 필요), `verbose`, `json`, `help`만. 그 외 `Unknown option: --<name>`.
- `watchMenuRows(registry) → Array<{label:string, platforms:string[]|null}>` — 첫 행 `{label:'All', platforms:<지원 id, 표시 순서>}`, 이어 `registry.byDisplayOrder()` 각 descriptor. 지원 기준 `capabilities.watch.state==='verified'`. 미지원은 `label + '  (not supported)'`, `platforms:null`.
- `chooseWatchPlatforms({input, output, env, signals, registry, createSession?}) → Promise<string[]|null>`(`lib/watch/menu.mjs`): `createTerminalSession` + `createTuiInterface(session,{input}).menu('Which platform to watch?', labels, {backRow:true})`. 미지원 행 Enter → 같은 행 선택 유지, notice `<Label> is not supported by arc watch.`로 재표시. Back/Escape/EOF → `null`, interrupt → `ARC_CANCELLED` throw. `finally`에서 `session.dispose()`.
- `followWatch(options, io) → Promise<number>`(`lib/watch/index.mjs`, export): 기존 `runWatch` 본문에서 인자 해석 제거. `io.platforms`(string[]) 사용, scope는 항상 `resolveScope({dir:cwd, git})`.
- `runWatch(argv, io)`: 파싱 오류 2 → help 0 → `io.signal?.aborted` 0 → `!(input.isTTY && output.isTTY)`면 stderr `Error: arc watch needs an interactive terminal to choose platforms.` + 2 → `(io.choosePlatforms ?? chooseWatchPlatforms)(...)`; null이면 0, `ARC_CANCELLED`면 130 → `followWatch(options,{...io, platforms})`.
- `resolveScope({dir, git})`: mode/session 매개변수 제거, kind `'repo'|'dir'`만.
- home 해석: `homes`를 `Object.fromEntries(registry.byAnchorOrder().map(d=>[d.id,null]))`로(하드코딩 제거). 모든 registry 플랫폼 anchor 탐색 동작 유지(`watch-cli.test.mjs:58`).
- `WATCH_HELP`: 첫 줄 "Follow session activity of supported platforms in one read-only stream.", Scope 섹션 "Choose All or one platform in the menu. Every choice watches the current Git worktree, or the current directory outside Git. Requires an interactive terminal."

**선행:** 없음(T1과 독립). MANIFEST 충돌 회피를 위해 T1 다음 순차 실행.

**수용 기준:**
- AC2-1: TTY 메뉴 제목 `Which platform to watch?`, 행 `All`, `Claude`, `Codex`, `Gemini  (not supported)`, `Grok  (not supported)`, `Back`(기본 registry 기준, 테스트는 registry에서 계산). 미지원 행 선택 시 watch 미시작.
- AC2-2: `All`/개별 선택 모두 scope가 현재 worktree(`repo`/`dir`). `options.platforms`는 `All`이면 지원 id 전체, 개별이면 해당 id 하나.
- AC2-3: `--cwd x`, `--all`, `--session s`, `--platform codex` 각각 `Error: Unknown option: --<name>. Run arc watch --help for usage.` + exit 2.
- AC2-4: 비TTY(stdin 또는 stdout, `--json` 포함)는 위 안내 + exit 2, stdout 비어 있음. `--help`는 비TTY에서도 0.
- AC2-5: `lib/watch/index.mjs` import 그래프에 `lib/management/`, `lib/installer/`, `lib/safe-fs/` 없음. dispose의 raw false·`\x1b[?1049l`이 watch `setRawMode(true)`·첫 이벤트 출력보다 앞섬. help·README·docs·root help가 새 동작을 host 중립으로 설명. `tests/node/tui-app.test.mjs`·`tests/node/tui-package-consumer.test.mjs` 통과.

**단계(TDD):**
- [x] baseline: `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-*.test.mjs tests/node/tui-*.test.mjs` 실패 집합 기록.
- [x] 기존 테스트 이전: `watch-cli.test.mjs`의 비TTY `runWatch(args, io)` 호출을 helper `follow(args, io, platforms)` = `followWatch(parseWatchArgs(args).options, {...io, platforms})`로 교체(기본 `platforms`는 registry에서 계산). `--cwd/--all/--session/--platform` 사례(예: `:186`, `:190`)는 삭제 또는 기본 worktree 사례로 변경. scope·watcher·dispatch 테스트의 all/session 사례 제거.
- [x] RED: `watch-cli.test.mjs`에 `removed scope options are unknown`, `non-TTY and json require an interactive terminal`, `menu rows come from registry watch capability`, `unsupported row is not selectable`, `menu cancel restores terminal and never starts watcher`, `menu dispose precedes watch raw mode and first output`(fake TTY가 `setRawMode` 호출·write 순서 기록). `watch-import-graph.test.mjs`: `lib/watch/index.mjs`부터 정적 `import … from '…'`·`import('…')` 상대경로를 재귀 추적해 금지 디렉터리 없음 확인.
- [x] RED 확인: `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-*.test.mjs tests/node/tui-app.test.mjs` → 새 테스트 FAIL.
- [x] GREEN: interface 추출, menu, args, index, scope, watcher, status-line 정리, help 문구.
- [x] GREEN 확인: 같은 명령 PASS. `rg -n "'session'|'all'|options\.session|--cwd|--platform" lib/watch` 결과 비어 있음(event source 값으로 쓰이는 `'session'` 등은 예외로 보고).
- [x] 문서: README·`docs/harness-operation.md:192,194`(all/session Scope 문구 제거), `lib/cli/root.mjs` help.
- [x] 패키징: `node scripts/update-manifest.mjs` → `npm run check:manifest`.
- [x] 회귀(관련 테스트만, v2): `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-*.test.mjs tests/node/tui-*.test.mjs` — baseline 대비 새 실패 없음.
- [x] 커밋(Orchestrator): `feat(watch): 플랫폼 선택 메뉴 도입과 범위 옵션 제거`
  - 진행 기록(2026-11-20): Implementer 9a215a7e(codex bridge; 중간에 테스트 파일 부분 변경 복구, Codex 사용량 한도 초과로 중단 후 재개) 구현, fresh QA 6d79e604 — AC2-1~AC2-4 실제 PTY로 pass, AC2-5 import 그래프·dispose 순서·host 중립 문서·tui-app pass. watch-*·tui-* 785 중 784 pass. 유일 실패 `tui-package-consumer`는 Orchestrator가 호스트에서 재실행해 12aa9a3·123e38a에서도 동일 assertion(HOME에 `.claude`/`.gemini` 생성)으로 실패함을 확인 → 기준선 실패. `check:manifest` 288 pass. README의 `docs/images/watch-flow.svg` 참조 제거(최종 Reviewer 확인 대상).

**QA(fresh, 필수):** TTY에서 worktree의 `node bin/arc.mjs watch` 실행(가능하면 `script`/pty로): 메뉴 항목·`(not supported)`·미지원 선택 불가, `All`/개별 선택 후 현재 worktree 이벤트만, Back·Ctrl-C 후 터미널 복원, `node bin/arc.mjs watch | cat`·`--json` 비TTY exit 2, 제거 옵션 4개 exit 2. TTY 조작 불가 시 fake TTY 테스트 결과와 함께 한계 보고.

**보류 조건:** `createTuiInterface` 추출 후 `tui-app.test.mjs`·`tui-package-consumer.test.mjs` 실패, dispatch 추적이 all/session 경로 없이 현재 worktree dispatch를 놓침 — Orchestrator에 보고.

---

### Task T3: USER / PROMPT 구분 (R3)

**목표·범위:** 하위 에이전트 세션·bridge dispatch 세션의 user 메시지를 `prompt`로 분류하고 USER/PROMPT 색 구분.

**Files:**
- Modify: `lib/watch/model.mjs:1-2,38`(`WATCH_KINDS`, `MESSAGE_KINDS`, typedef에 `prompt`), `lib/watch/watcher.mjs:40-42`(`clean`에서 분류), `:176`(active 목록에 `'prompt'`), `lib/watch/render.mjs:81,94`(`tagColor` `user:'1;97'`, `prompt:'1;35'`; `kindTag` `prompt:'PROMPT'`), `MANIFEST.sha256`
- Test: `tests/node/watch-watcher.test.mjs`, `tests/node/watch-cli.test.mjs`

**Interfaces:**
- `classifyMessageKind(event) → string`(`lib/watch/model.mjs`): `event.kind==='user' && (event.parentId || event.dispatchId) ? 'prompt' : event.kind`.
- `clean`은 sanitize 전에 `e.kind = classifyMessageKind(e)` 적용(identity 병합 후 호출되는 `:189,200` 경로 포함).

**선행:** T2(같은 watcher 파일).

**수용 기준:**
- AC3-1: 상위 세션 user → `USER`. Claude subagent(`parentId`)·Codex 하위 thread(`parentId`)·bridge dispatch 세션(`dispatchId`) user → `PROMPT`. `normalize-*.mjs` diff 없음.
- AC3-2: color 출력에서 USER 태그 `\x1b[1;97m`·본문 `\x1b[97m`, PROMPT 태그 `\x1b[1;35m`·본문 `\x1b[35m`.
- AC3-3: `--json`에서 `"kind":"prompt"`, text 전문 유지. prompt 이벤트는 세션을 active로 표시.

**단계(TDD):**
- [x] RED: `subagent and dispatch user messages become prompt`(watcher fixture 3종 + 상위 세션 대조), `user and prompt colors differ`, `json keeps prompt kind and full text`, `rg -n "'user'" lib/watch`로 찾은 소비 지점 중 prompt도 처리해야 하는 곳(tail, status-line busy 등) 회귀 테스트.
- [x] RED 확인: `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-watcher.test.mjs tests/node/watch-cli.test.mjs` → FAIL.
- [x] GREEN 구현 → 같은 명령 PASS → 관련 테스트 `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-*.test.mjs` baseline 대비 새 실패 없음(v2: 전체 npm test는 최종 검증에서만).
- [x] 패키징: `node scripts/update-manifest.mjs` → `npm run check:manifest`.
- [x] 커밋(Orchestrator): `feat(watch): 하위 세션 사용자 메시지를 PROMPT로 구분`
  - 진행 기록(2026-11-20): Implementer f5a46d09(codex bridge) 구현, fresh QA c989d6d7 — AC3-1~AC3-3 pass(실제 형식 JSONL·dispatch 기록을 `followWatch --tail`로 재생, ANSI·`--json` 확인, normalize-* diff 없음). watch-* 386→390 pass, 새 실패 없음. `check:manifest` 288 pass.

**QA(fresh, 필수):** 실제 세션 transcript fixture(subagent 있는 Claude 세션, Codex 하위 thread, bridge dispatch)를 `--tail`로 재생해 태그·색과 `--json` kind 확인.

**보류 조건:** 상위 세션 이벤트에 parentId가 붙는 경로가 있어 오분류가 생기면 Orchestrator에 보고.

---

### Task T4: AGENT·PROMPT Markdown 렌더링 (R4)

**목표·범위:** 의존성 없는 Markdown 렌더러를 만들고 color human 출력의 AGENT·PROMPT 본문에만 적용.

**Files:**
- Create: `lib/watch/markdown.mjs` (순환 import 시 `lib/watch/text-width.mjs`도 Create)
- Modify: `lib/watch/render.mjs:112-150`(`renderHuman` 본문 경로), `MANIFEST.sha256`
- Test: Create `tests/node/watch-markdown.test.mjs`, 회귀 `tests/node/watch-cli.test.mjs`

**Interfaces:**
- `renderMarkdown(text, {width, baseCode}) → string[]`: 들여쓰기·prefix 없는 시각 줄 배열, 각 줄은 SGR로 시작해 `\x1b[0m`으로 끝. `width`가 `Infinity`면 줄바꿈 없음. `displayWidth`/`wrapLine`은 `./render.mjs`에서 import(순환 문제 시 `lib/watch/text-width.mjs`로 옮기고 `render.mjs`에서 re-export).
- 규칙: 헤딩 `#{1,6} ` 기호 제거 + `1;4`; 목록 `-`/`*`/`+` → `• `, 중첩은 입력 2칸당 2칸, 줄바꿈 줄은 본문 시작 열 정렬, 번호 목록 `N. ` 유지; `**x**` → `1`, `*x*` → `3`(양끝 비공백일 때만, `_x_` 미지원); `` `x` `` 백틱 제거 + `38;5;180`; fenced code는 fence 줄 제거, `2` 스타일, 2칸 들여쓰기, 강제 줄바꿈, 닫히지 않은 fence는 끝까지 code; `> ` → `│ ` + `2`; `---`/`***`/`___` 단독 줄 → `─` × `min(width, 40)`; 링크 `[t](u)` → `t (u)`; 표는 아래 "표 렌더링(v3)" 규칙; 기본 색 `baseCode`(agent `32`, prompt `35`)를 모든 span에 합성.
- `renderHuman`: `color && fullLine && ['agent','prompt'].includes(event.kind)`일 때만 `renderMarkdown(text,{width: wrap && avail>=WATCH_LIMITS.wrapMinBody ? avail : Infinity, baseCode})`. 역할 배지 줄·기존 indent 유지. plain 경로(`:135`), USER, `--json` 불변.

**표 렌더링(v3, 2026-11-20 사용자 지시):**
- 인식: 헤더 행 + 구분자 행(`|---|`, `:---`/`---:`/`:---:` 정렬 표기)이 있고 이어지는 `|` 행들이 있는 블록만 표로 본다. 헤더 행은 `|`로 시작해야 한다(앞 공백 허용, v4 F5). 구분자 행이 없으면 원문. 셀은 이스케이프된 `\|`와 인라인 코드 안의 `|`로 나누지 않는다. 셀 수가 헤더와 다르면 부족분은 빈 셀, 초과분은 마지막 셀에 합친다.
- 정렬 표: 테두리 `┌ ┬ ┐ ├ ┼ ┤ └ ┴ ┘ │ ─`(baseCode 색, 테두리는 `2` dim 합성 가능). 헤더 셀은 굵게(`1`), 헤더 아래와 각 데이터 행 사이에 `├─┼─┤` 구분선. 셀 내용은 인라인 서식(굵게·기울임·코드·링크) 적용, 정렬 표기(left/center/right) 반영, 셀 좌우 1칸 여백.
- 폭: 열 자연 폭(`displayWidth`, CJK 포함)의 합 + 테두리·여백이 `width` 이하면 그대로. 넘으면 가장 넓은 열부터 줄여 맞추고(열 최소 폭 6), 줄어든 셀은 셀 안에서 단어 경계 우선·필요 시 강제 줄바꿈해 여러 시각 줄로 그린다(행 높이 = 그 행에서 가장 많은 줄 수).
- 카드 폴백: 열 수 × 최소 폭 + 테두리·여백이 `width`를 넘으면 카드 형태로 그린다 — 행마다 `▸ <헤더1>: <값1>` 다음 줄부터 `  <헤더N>: <값N>`, 행 사이 빈 줄, 값은 들여쓰기 열에 맞춰 줄바꿈.
- `width`가 `Infinity`(줄바꿈 없음)면 자연 폭 정렬 표.

**선행:** T3(PROMPT kind와 `render.mjs` 겹침).

**수용 기준:**
- AC4-1: 위 요소가 지정 SGR·기호로 렌더링.
- AC4-4(v3): 표가 "표 렌더링(v3)" 규칙대로 렌더링된다 — 정렬 표(헤더 굵게, 셀 인라인 서식), 폭 초과 시 셀 안 줄바꿈으로 표 모양 유지, 최소 폭도 안 되면 카드 형태. 모든 시각 줄 plain 폭 ≤ width(CJK 포함), 줄마다 `\x1b[0m` 종료. 구분자 행이 없는 `|` 줄은 원문.
- AC4-2: 각 시각 줄 plain(SGR 제거) `displayWidth` ≤ `width`(CJK 포함), 모든 줄 `\x1b[0m`으로 끝나 스타일이 줄을 넘지 않음, 역할 배지·들여쓰기 유지.
- AC4-3: 비color human과 `--json`은 기존과 바이트 동일, USER 원문, 입력 ESC·제어문자는 `sanitizeMessage` 이후 렌더링되어 출력에 없음.

**단계(TDD):**
- [x] RED: `watch-markdown.test.mjs` 요소별(`heading`, `nested bullets`, `numbered`, `bold italic code`, `fenced code`, `quote`, `rule`, `link`, `table aligned`, `table wraps cells when narrow`, `table falls back to cards`, `table without delimiter stays raw`, `table cells keep escaped pipes and inline code`), `wrap respects CJK width and resets each line`, `markdown never emits input-originated escapes`, `markdown avoids emphasis false positives and tolerates open fence`; `watch-cli.test.mjs`에 `non-color and json output stay raw`, `user stays raw while agent and prompt render`.
- [x] RED 확인: `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-markdown.test.mjs tests/node/watch-cli.test.mjs` → FAIL.
- [x] GREEN 구현 → 같은 명령 PASS → 관련 테스트 `PYTHONDONTWRITEBYTECODE=1 node --test tests/node/watch-*.test.mjs` baseline 대비 새 실패 없음(v2: 전체 npm test는 최종 검증에서만).
- [x] 패키징: `node scripts/update-manifest.mjs` → `npm run check:manifest`.
- [x] 커밋(Orchestrator): `feat(watch): AGENT·PROMPT 메시지 Markdown 렌더링`
  - 진행 기록(2026-11-20): Implementer d11dabf4(초기 구현, 빈 줄 회귀 자체 수정) → 계획 v3(표 렌더링) 개정으로 fresh Implementer 1807e44c(QA 결함 2건: 한글 조사 강조·코드 블록 빈 줄, 표 정렬·셀 줄바꿈·카드 폴백). fresh QA 1f220075: 최초 AC4-1·AC4-2 FAIL → 수정 후 렌더러·seam·실제 PTY(60/160열) 재검증에서 AC4-1~AC4-4 pass, AC4-3 NO_COLOR·파이프·`--json` 바이트 동일. watch-* 390→414 pass, 새 실패 없음. `check:manifest` 290 pass. 81,021자 메시지 약 61~67ms.

**QA(fresh, 필수):** TTY(가능하면 `script`/pty)에서 Markdown이 많은 agent 응답 transcript를 `--tail`로 재생: 좁은 폭(60열)·넓은 폭, 한글 혼합 본문, `NO_COLOR=1`·`| cat`에서 원문.

**보류 조건:** 긴 메시지 체감 지연, `render.mjs` 순환 import 미해결 — Orchestrator에 보고.

---

## 최종 검증(모든 작업 수용 후, 작업 선행 조건 아님)

- [x] 전체 변경에 대해 1회: `PYTHONDONTWRITEBYTECODE=1 npm test`, `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs --complete`, `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests` — 각각 base(12aa9a3) baseline 실패 집합과 비교해 새 실패 없음.
- [x] 독립 Reviewer가 최종 전체 변경(base `12aa9a3`..HEAD)을 1회 리뷰. 중점: R1 transaction·lock, watch 계약(native 미로딩, 터미널 복원). Reviewer 지적은 Implementer → Reviewer로 재검.

### 최종 Reviewer 후속 수정(v4, 2026-11-20 사용자 지시: non-blocking 9건 모두 수정)

final Reviewer 지적이므로 Implementer → Reviewer 재검으로 반복하고 QA는 재배정하지 않는다. 수정은 재검 동안 미커밋으로 두고, 해소 후 후속 커밋 1개로 묶는다. 검증은 v2 규칙대로 수정 부분과 관련 테스트만 실행한다.

- [x] F1(N1, 문서): `docs/harness-operation.md` 업그레이드 절에 적는다. 자동 재적용은 수동 Configure → Apply와 같은 경로이며, 현재 설정 값으로 global instructions와 native 동시성 설정을 다시 기록한다. 사용자가 직접 바꾼 해당 값은 ARC 설정 값으로 덮인다. 문구는 host 중립으로 쓴다. 동작은 바꾸지 않는다.
- [x] F2(N2): 하네스 갱신이 성공한 직후, 재적용을 시작하기 전에 인터럽트되면(`lib/management/update.mjs` `if(signal?.aborted)return 130;` 지점) 종료 코드 130을 유지한다. 그리고 `Configuration was not re-applied.`와 Configure → Apply 안내를 stderr에 출력한다. 테스트를 추가한다.
- [x] F3(N3): standalone 재적용에서 한 플랫폼 결과가 unknown이면 다음 플랫폼으로 진행하지 않고 즉시 멈춘다(`lib/management/reapply.mjs` 반복문). 이미 적용된 플랫폼 보고와 unknown 출력은 기존 문구를 유지한다. 테스트를 추가한다.
- [x] F4(N4): 재적용 성공 경로에서도 실행 결과의 history·anchor 이동 안내 메시지(`Residual path: ` 제외)를 버리지 않고 출력한다. 기존 Configure Apply가 같은 메시지를 내는 형식을 따른다. 테스트를 추가한다.
- [x] F5(N5): 표가 아닌 문단에 `|`가 있어도 원문으로 바꾸지 않고 일반 문단처럼 인라인 서식과 단어 경계 줄바꿈을 적용한다. 표 후보는 `|`로 시작하는(앞 공백 허용) 줄과 바로 다음 구분자 행이 있는 경우만이다. 구분자 행이 없는 `|`로 시작하는 줄은 v3대로 원문으로 두되, 줄바꿈은 단어 경계를 우선한다. 테스트를 추가한다.
- [x] F6(N6): 앞 글자에 붙은 `**x**`를 인식한다(예: `이것은**중요**합니다` → `이것은중요합니다`, `중요`만 굵게). `*x*` 기울임의 기존 오탐 방지(`a*b*c`, `snake_case`)는 유지한다. 테스트를 추가한다.
- [x] F7(N7): `docs/harness-operation.md` watch 절과 WATCH_HELP(`lib/watch/index.mjs`)에 PROMPT 종류(하위 세션에 보낸 agent 생성 prompt)와 TTY Markdown 렌더링(NO_COLOR·파이프·`--json`은 원문)을 반영한다. `--json` 출력의 `kind` 값에 `prompt`가 있다는 점도 문서에 적는다. 문구는 host 중립으로 쓴다.
- [x] F8(N8): 아무 데서도 쓰지 않는 `docs/images/watch-flow.svg`를 삭제한다. 참조가 남지 않았는지 확인하고, MANIFEST·package files에 포함돼 있으면 함께 갱신한다.
- [x] F9(N9): 메뉴에서 미지원 항목 안내는 커서가 그 항목에 있을 때만 보인다. 다른 행으로 옮기면 지운다(`lib/watch/menu.mjs`). 테스트를 추가한다.
- 진행 기록(2026-11-20): 최종 전체 검사(HEAD 3d4b7c5) 기준선 12aa9a3 대비 새 실패 0(role-bridge-run 2건은 Codex 인증 probe `Incomplete`, 단독 재실행 pass). 최종 Reviewer approve, non-blocking 9건 → fresh Implementer 1d02c2e3가 F1–F9 수정(RED 8 → GREEN 8, 관련 묶음 516/518 → 523/525, 동일 EMFILE 1). Reviewer 재검에서 B1(KIND 표 분리) 1건 → 같은 Implementer가 수정 → Reviewer approve. 참고 지적 N-a(`2**3**4` 굵게, CommonMark와 동일)·N-c(skipped 상태에서도 F2 안내)는 수정하지 않음. N-b는 표 인식 규칙에 반영.
- 검증: 관련 테스트 묶음(`upgrade-*`, `watch-*`, 메뉴·markdown·render), `npm run check:manifest`, `npm run check:role-policy`를 실행한다. 전체 `npm test`는 실행하지 않는다(v2). 수정 후 Reviewer가 F1–F9 해소를 재확인한다.

## 기록된 결정·한계

- O1(해소): routing-status 실행 형식은 T1 QA 4단계에 명시. 자동 테스트는 `lib/runtime/role-routing.mjs` marker 검증 함수를 직접 호출하는 기존 방식(`tests/node/role-routing-anchor.test.mjs`) 재사용.
- O2(수용 한계): npx bootstrap은 이전 패키지가 만든다(`lib/npm/upgrade.mjs:35-53`). 0.4.6 이하에서 npx로 이번 버전에 처음 올라올 때는 재적용되지 않으며 문서에 Configure → Apply 안내를 남긴다. global 경로는 즉시 적용.
- O3(후속): U5 `<task-notification>` 등 분류.
- O4(해소): Python 테스트 `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`.
- O5: 재적용 성공·보류 문구, 미지원 notice 문구, inline code 색 `38;5;180`은 위 고정값 채택.
- O6: 메뉴 Back/Escape/EOF exit 0, Ctrl-C 130(`lib/tui/app.mjs:144` 관례).

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-20T12:05Z 무렵 (사용자 승인, 커밋 bd255d9 직전) | 초기 승인 | T1–T4 | 최초 계획 |
| v2 | 2026-11-20T13:42:59Z | 검증 범위 변경 | T1(recheck)–T4 | 사용자 지시: 작업별 QA·recheck·Implementer 검증은 수정 부분·관련 테스트만, 전체 npm test는 최종 검증 1회 |
| v3 | 2026-11-20T14:25:56Z | 범위·수용 기준 변경 | T4 | 사용자 지시: Markdown 표를 정렬 표(셀 안 줄바꿈, 폭 부족 시 카드)로 변환. AC4-1에서 "표 원문" 제거, AC4-4 추가 |
| v4 | 2026-11-20T15:15:00Z | 범위 추가(후속 수정) | 최종 검증 | 사용자 지시: 최종 Reviewer non-blocking N1–N9 모두 수정. F1–F9 추가 |
