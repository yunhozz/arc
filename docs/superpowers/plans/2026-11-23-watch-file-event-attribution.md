# watch 파일 이벤트 귀속(누락·중복) 수정 구현 계획

> **For agentic workers:** 이 계획은 ARC Orchestrator가 조정한다. 태스크마다 Implementer → fresh QA → Orchestrator 수락 → focused commit 1개 순서로 진행한다. Implementer·QA는 Git 상태를 바꾸지 않는다. 하위 체크박스는 진행 추적용이며 커밋 단위가 아니다.

- 상태: v4 (v3 + 한계 L4·L6 문구 정정, 2026-11-23)
- 설계: 승인 설계(사용자 2026-11-23: O2 승인, 순수 셸 귀속 "command 우선", 새 worktree). 별도 spec 문서 없이 아래 "설계 요약"에 담는다.
- workflow: `watch-file-attribution`
- 대상: `/Users/ma-24-007/Desktop/workspace/arc/.claude/worktrees/watch-file-event-attribution`, 브랜치 `fix/watch-file-event-attribution`, base `f786e4a1155287eff80d4abe56f7cebaf6598e3b`
- 깊이: Bounded(플랜 필요). 커밋 메시지는 저장소 관례 `type(scope): 한국어 설명`. 승인된 plan은 첫 Implementer 전에 문서 전용 커밋으로 먼저 커밋한다(Orchestrator).
- 실패 판정: base `f786e4a1`에 기존 실패(51–55)와 부하 flake가 있다. "base 대비 새 실패 없음"으로 판정한다. 새 실패 의심 테스트는 단독 1회만 재실행하고, 계속 실패하면 base에서 같은 테스트로 분류한다. 정적 분류는 `git diff --name-only f786e4a1` + untracked.
- 운영 주의: T1·T2는 같은 파일(`lib/watch/watcher.mjs`, `tests/node/watch-watcher.test.mjs`, `MANIFEST.sha256`)을 고치므로 순차로만 진행하고 같은 파일에 동시 Implementer를 두지 않는다. Implementer·QA 실행 중에는 Orchestrator가 그 worktree에 쓰지 않는다.

## 설계 요약

### 원인 (코드 분석 기반, 실측 아님)
1. 중복: 명시 이벤트(Claude Write·rm은 `tool_result`, Codex FileChange/PatchApply는 `item_completed`)가 파일 변경 **뒤에** 기록된다. 그 사이 다른 세션 줄로 scan이 먼저 돌면 claim이 없어 최근 후보(다른 플랫폼일 수 있음)에 `inferred` emit(`watcher.mjs:554-566`), 이후 명시 이벤트가 또 나온다(`:239-243`).
2. 누락: 소비 안 된 claim이 TTL 120s(`:520`) 동안 남아 다른 세션의 실제 변경 1건을 조용히 억제한다(`:555`). 경로 (a) 늦은 claim, (b) Claude Edit 계열 `tool_use` 시점 claim(`normalize-claude.mjs:207-208`)이 실패·거부 후에도 남음(`:150-152`).
3. 보조 중복: `rm -r dir` claim 키=디렉터리 vs snapshot 키=파일(`normalize-claude.mjs:94-105`, `watcher.mjs:535, 548-556`). claim이 파일 소속 root가 아니라 세션 `gitTop` shell 상태에 기록(`watcher.mjs:238`).

### 방식 O2 = O1(claim 위생) + 확인 유예
- O1 (T1)
  - (a) post claim(변경 뒤 기록: Claude Write·rm, Codex 전부)은 기록 후 **첫 scan에서만** 유효, 불일치 시 그 scan 끝에 폐기.
  - (b) pre claim: Claude Edit 계열 이벤트에 내부 `claimBefore:true` → 기존 120s TTL 유지, `clean`에서 제거.
  - (c) 실패 Edit 해제: normalize-claude가 Edit tool id·경로를 state에 기억(`toolCacheMax` 상한), `is_error` 결과의 `tool_failed`에 내부 `releasePaths` → watcher가 claim 삭제, `clean`에서 제거.
  - (d) 디렉터리 claim: claim 키 하위(`claim + path.sep`) snapshot 파일 **삭제**도 억제.
  - (e) root 라우팅: claim은 경로가 속한 shell root(가장 긴 top 접두사)에, 없으면 `row.gitTop` root.
- 확인 유예 + command 우선 귀속 (T2)
  - scan의 claim 없는 변경은 즉시 emit하지 않고 `state.unconfirmed`에 보관.
  - post claim 기록 시 같은 경로(또는 하위)가 unconfirmed에 있으면 그 항목을 삭제하고 claim도 저장한다(post는 다음 비교 scan 1회) → 명시 이벤트만 남고, 같은 도구의 후속 파일 상태 변화도 다음 scan에서 소비된다. pre claim(`claimBefore`, 변경 전 기록)은 unconfirmed를 지우지 않고 claim만 저장한다(그 시점 보류 변경은 다른 주체의 것이므로 확정 시 inferred로 표시).
  - `WATCH_LIMITS.shellConfirmMs`(2000) 경과 항목 emit. 확정은 `scanShell`에서 transcript 활동 없이, 추가 git 호출 없이.
  - 후보 범위는 타임스탬프로 구분한다. shell state에 각 scan의 시작 시각(`rangeStart`=마지막 scan의 `scanStart`)을 기록하고, 범위를 닫을 때(scan 끝·확정 뒤·post claim이 보류를 지운 뒤 unconfirmed가 비었을 때) `ts <= rangeStart`인 후보만 제거하고, 남는 후보의 `lastCommandAt <= rangeStart`도 제거한다. 마지막 scan 뒤 활동한 후보와 그 command는 다음 범위로 이어진다.
  - 유예 중 재변경은 경로당 1건, kind는 처음 발견 직전 snapshot 값(`base`) 대비 순변경, 순변경 없으면 버림.
  - 귀속: 후보 중 `command` 이벤트를 낸 followed 후보가 있으면 가장 최근 `lastCommandAt` 후보, 없으면 U7대로 가장 최근 활동 후보. 계속 `inferred:true`, 플랫폼 id 분기 없음.

### 유지(범위 밖)
- H5(선택 안 한 플랫폼 변경 귀속)는 기존 한계(`docs/superpowers/specs/2026-11-22-watch-unattributed-changes-design.md` §3.3).
- 범위 밖 줄 claim 금지(AC-W38). Claude Edit EDIT 표시 시점 현행 유지.
- JSON 필드 집합·`inferred` 의미 유지, `lib/watch`는 tui import 금지.

### 알려진 한계·후속(이번 범위 밖)
- L1: CLI별 transcript 기록 지연 미실측. 명시 이벤트가 `shellConfirmMs`보다 늦으면 중복이 남는다(그 claim은 다음 scan 뒤 폐기되어 누락으로 번지지 않음).
- L2: `shellConfirmMs` 2000ms는 실측 조정 전. 셸 변경 표시가 최대 약 2s 늦다.
- L3: 대소문자 비구분 FS의 claim·snapshot 경로 표기 차이 미확인.
- L4: pre claim(Edit)은 보류 변경을 지우지 않으므로, Edit 직전에 같은 파일에 생긴 다른 세션의 셸 변경은 inferred로, Edit 자체는 명시 EDIT로 각각 보인다. Edit가 실패하면 claim만 해제된다. 역순 경쟁: Edit 자신의 변경이 `tool_use` 줄을 읽기 전에 scan에 잡히면 그 변경은 보류 뒤 inferred로 확정되어 명시 EDIT와 함께 중복 1건이 되고, 소비되지 않은 pre claim이 120s 동안 남아 그 사이 다른 세션의 같은 경로 변경 1건을 숨길 수 있다(base에도 있던 경로, 권한 대기 Edit와 구분할 수 없어 이번 범위 밖).
- L5: 확정 유예(2s)가 scan 최소 간격(3s)보다 짧아, 확정 전 어떤 scan도 관찰하지 못한 재변경은 확정 뒤 별도 이벤트로 표시된다(WD7은 확정 전 scan이 관찰한 재변경에만 적용). 확정 전 재scan은 WD6(추가 git 0회)과 충돌하므로 하지 않는다.
- L6: 조상 디렉터리를 `file_path`로 준 합성 Edit 입력은 보류된 하위 파일 처리에서 잔여 항목을 남길 수 있다(실제 Claude 생성 여부 미확인). tick이 드물어 확정과 다음 scan 사이에 보류가 비지 않으면 후보 범위가 이어지고, 그 동안 그 범위에서 가장 최근 command를 낸 세션이 우선된다(WD14 정의 안의 동작).

## 수락 기준 (확정)

| ID | 기준 (측정 방법) |
|---|---|
| WD1 | 명시·추정 중복 없음. Codex FileChange, Claude Write, Claude `rm` 각각에서 변경이 scan에 먼저 잡히고 `shellConfirmMs` 안에 명시 이벤트가 기록되면, 확정 대기 끝까지 그 경로 file 이벤트는 명시 1건, `inferred:true` 0건. |
| WD2 | 다른 플랫폼 오귀속 없음. WD1 시나리오에서 다른 플랫폼 세션이 더 최근에 활동해도 그 `sessionId`의 해당 경로 이벤트 0건. |
| WD3 | 늦은 claim 뒤 누락 없음. 일치 변경 없는 post claim의 첫 scan 이후 같은 경로가 셸로 바뀌면 inferred 1건(120s 안이어도). |
| WD4 | 실패 Edit 뒤 누락 없음. Edit `tool_use` 뒤 `is_error:true` 결과가 오면 120s 안의 같은 경로 셸 변경도 inferred 1건. |
| WD5 | 권한 대기 Edit 유지. `tests/node/watch-watcher.test.mjs` "shell claims survive unchanged scans until a pending Claude Edit lands"(base :1686), "unobserved shell claims remain valid through two minutes and then expire"(base :1704)가 단언 변경 없이 통과(헬퍼 내부 확정 대기만 허용). |
| WD6 | 무활동 확정·추가 git 없음. scan 뒤 append 없이 `shellConfirmMs` 진행 후 tick하면 inferred가 나오고 그 tick의 `s.calls` 증가 0. scan tick의 inferred 0건. |
| WD7 | 유예 중 재변경 1건·순변경(create 뒤 수정 → `file_create` 1건, create 뒤 삭제 → 0건). |
| WD8 | `rm -r dir` 성공 뒤 하위 tracked 파일 삭제 inferred 0건, 명시 `file_delete [dir]` 1건. |
| WD9 | claim root 라우팅. 세션 `gitTop`이 root A일 때 root B(A 안 중첩 포함) 소속 파일 명시 변경은 root B scan에서 inferred 0건. |
| WD10 | 귀속 회귀 없음. command 없는 범위는 가장 최근 활동 후보(U7). 기존 귀속 테스트(base :1305-1575, :1754, :1656, :594-610, :480)는 확정용 `advance`/`tick` 추가 외 단언 불변. |
| WD11 | `renderJson` 필드 집합 불변(`tests/node/watch-render.test.mjs` base :438), emit 이벤트에 `claimBefore`·`releasePaths` 없음, `lib/watch`에 tui import 없음. |
| WD12 | 플랫폼 id 분기 없음. diff의 `lib/watch` 추가 줄에 플랫폼 id 문자열(`'claude'`,`'codex'`,`'gemini'`,`'grok'`) 비교 신규 없음. command 우선 테스트는 플랫폼을 바꾼 두 방향 모두 통과. |
| WD13 | `npm run check:manifest` 통과. `docs/harness-operation.md` Shell detection 행(base :144) 영어로 갱신, 한글 없음(문서 한글 금지 검사 통과). |
| WD14 | command 우선 귀속. 같은 후보 범위에 followed 세션 P(셸 `command` 이벤트)와 Q(command 없이 P보다 나중 활동)가 있으면 확정 inferred의 `sessionId`는 P. 여럿이면 `lastCommandAt` 최대. 이전 범위(candidates 비움 전) command와 `skillOnly` command는 세지 않음. |

## T1. claim 위생 (post 1회 유효, pre 표시, 실패 Edit 해제, 디렉터리 claim, root 라우팅)

- 목표: 설계 O1 (a)–(e). 확인 유예는 넣지 않는다(T2).
- Files (Implementer allowedPaths)
  - `lib/watch/watcher.mjs` (`clean` :98-107, claim 기록 :238-244, `scanRoot` claim TTL·매칭 :518-572)
  - `lib/watch/normalize-claude.mjs` (state 초기화 :114-116, `tool_result` :144-160, Edit 계열 :207-208)
  - `tests/node/watch-watcher.test.mjs`
  - `tests/node/watch-normalize-claude.test.mjs`
  - `MANIFEST.sha256`
- 선행: 없음
- Interfaces (T2가 사용)
  - `state.claims: Map<string,{ts:number,before:boolean}>`, 키는 현행 `path.join(realPath(path.dirname(abs)),path.basename(abs))`.
  - watcher 클로저 헬퍼 `claimKey(row, file) -> string`, `claimRoot(key, row) -> shellState|undefined`: `!off` shellRoots 중 `key===top || key.startsWith(top+path.sep)`인 가장 긴 top, 없으면 `shellRoots.get(row.gitTop)`(off면 `undefined`). 새 shell root는 만들지 않는다(AC-W38).
  - normalize-claude: `state.edits: Map<toolId,string[]>`(`toolCacheMax` 상한), Edit 계열 `file_change`에 `claimBefore:true`, 실패 `tool_failed`에 `releasePaths:string[]`(Edit 기억이 있을 때만).
- 단계
  - [x] RED 단위(`tests/node/watch-normalize-claude.test.mjs`):
    - `Edit, MultiEdit and NotebookEdit file changes are marked claimBefore`: 세 이름 각각 `{kind:'file_change',paths:[p],claimBefore:true}`. Write 결과 `file_change`/`file_create`, rm 결과 `file_delete`에는 없음.
    - `a failed Edit result carries releasePaths; a successful one does not`: `is_error:true`이면 `{kind:'tool_failed',tool:'Edit',releasePaths:[p]}`, 성공·Edit 아닌 도구 실패에는 없음.
    - `edit path cache is bounded by toolCacheMax`: `toolCacheMax+1`개 기록 뒤 가장 오래된 id 실패에는 `releasePaths` 없음.
    - Edit 이벤트를 `deepEqual`하는 기존 단언은 `claimBefore:true` 추가로만 고치고, 고친 테스트 이름을 보고한다.
  - [x] RED 통합(`tests/node/watch-watcher.test.mjs`):
    - RT2 `post claims are discarded after their first scan and do not hide a later change` (WD3)
    - RT3 `a failed Claude Edit releases its claim` (WD4)
    - RT4 `rm -r dir suppresses inferred deletions under the directory` (WD8)
    - RT5 `claims route to the shell root that owns the path` (WD9): 중첩 worktree 포함, `top`을 dir 함수로 지정해 shell root 두 개.
    - `internal claim fields are not emitted` (WD11)
    - `node --test tests/node/watch-normalize-claude.test.mjs tests/node/watch-watcher.test.mjs`에서 새 테스트(와 기대만 바꾼 단위 테스트)만 실패하는지 확인, 실패 이름 보고.
  - [x] GREEN 구현:
    - normalize-claude: `state.edits` 지연 초기화, Edit 계열 `claimBefore:true` + id가 문자열이면 경로 기억, `tool_result`에서 꺼내 지우고 `is_error`면 `releasePaths`.
    - watcher: 기록 시 `{ts:now(),before:e.claimBefore===true}`를 `claimRoot`에 저장. `tool_failed.releasePaths`는 같은 키 계산으로 해당 root에서 delete(`live`·`inside`·`!off` 조건 동일). `clean`에서 두 내부 필드 delete.
    - `scanRoot`: TTL 만료는 `before` claim에만. `file_delete`는 정확 키가 없을 때 `file.startsWith(C+path.sep)`인 claim C로도 억제(정확 키 일치는 현행대로 delete). scan 끝에 `!before && ts<=scanStart` claim 모두 삭제.
  - [x] GREEN: 관련 테스트 명령 통과, 기존 실패는 base와 동일.
  - [x] `node scripts/update-manifest.mjs`: `lib/watch/watcher.mjs`, `lib/watch/normalize-claude.mjs` 해시만 변경·추가/삭제 없음. 다르면 hold.
  - [x] 커밋(Orchestrator, 수락 뒤): `fix(watch): 셸 claim을 첫 scan·실패 Edit·소속 root 기준으로 정리해 누락을 막음`
- 관련 테스트와 이유
  - `tests/node/watch-normalize-claude.test.mjs`: `claimBefore`·`releasePaths`·캐시 상한, Edit 이벤트 형태 회귀.
  - `tests/node/watch-watcher.test.mjs`: claim 매칭·TTL·라우팅·디렉터리 억제, WD5·귀속 회귀.
  - `tests/node/watch-render.test.mjs`: 내부 필드 비노출·renderJson 화이트리스트 회귀.
  - `tests/node/watch-normalize-codex.test.mjs`: Codex 이벤트 형태 불변(post claim 전제) 회귀.
  - `tests/node/manifest.test.mjs`: MANIFEST 갱신.
- 명령: `node --test tests/node/watch-normalize-claude.test.mjs tests/node/watch-watcher.test.mjs tests/node/watch-render.test.mjs tests/node/watch-normalize-codex.test.mjs tests/node/manifest.test.mjs`, `npm run check:manifest`
- 수락 기준: WD3, WD4, WD5, WD8, WD9, WD11, WD12(T1 diff 범위), WD13(manifest 부분)
- 보류 조건: WD5·기존 귀속 테스트 단언 변경 필요; `normalize-codex.mjs`·`render.mjs`·`scope.mjs` 수정 필요; 이벤트 표시 시점 변경; MANIFEST 변경이 위 두 해시 밖.
- 자체 검토
  - [x] 확인 유예 코드가 들어가지 않았다.
  - [x] off root·범위 밖 줄은 claim·release 모두 하지 않는다.
  - [x] 내부 필드 2개가 `clean`에서 제거된다.

## T2. 확인 유예와 command 우선 귀속 (+문서)

- 목표: 확인 유예와 command 우선 귀속, 기존 테스트 타이밍 조정, `docs/harness-operation.md` 갱신.
- Files (Implementer allowedPaths)
  - `lib/watch/watcher.mjs` (`ensureShellRoot` state :176-178, candidates 기록 :228-231, claim 기록, `scanRoot` :546-572, `scanShell` :574-583)
  - `lib/watch/model.mjs` (`WATCH_LIMITS`에 `shellConfirmMs:2000`)
  - `tests/node/watch-watcher.test.mjs`
  - `docs/harness-operation.md` (:144)
  - `MANIFEST.sha256`
- 선행: T1 수락·커밋(`{ts,before}` claim 구조, `claimKey`/`claimRoot`).
- Interfaces
  - shell state 추가 `unconfirmed: Map<string,{kind:'file_create'|'file_change'|'file_delete',firstSeenAt:number,base:string|undefined}>`(`base`는 처음 발견 때 `previous.get(file)`).
  - candidates 값 `{ts:number,identity:object,lastCommandAt?:number}`; 줄마다 갱신 시 이전 `lastCommandAt` 보존. 이벤트 루프 `skillOnly` skip 뒤 `e.kind==='command' && !e.skillOnly`이면 같은 shell 후보에 `lastCommandAt=now()`(`live`·`inside`·`!off`).
  - `pickCandidate(state) -> [id,value]|undefined`: followed·identity 있는 후보 중 `lastCommandAt` 있는 후보가 있으면 `lastCommandAt` 내림차순(동률 `ts` 내림차순), 없으면 `ts` 내림차순(U7).
  - `confirmRoot(state, out)`: `now()-firstSeenAt>=L.shellConfirmMs` 항목을 kind별 정렬 paths로 묶어 `pickCandidate` 후보에 `inferred:true` emit(후보 없으면 현행처럼 미출력). unconfirmed가 비면 `candidates.clear()`. git 호출 없음.
- 단계
  - [x] RED(`tests/node/watch-watcher.test.mjs`):
    - RT1 `late explicit events replace a held inferred change` (WD1, WD2): Codex FileChange / Claude Write / Claude rm 3 변형.
    - RT6a `held changes confirm without transcript activity or extra listings` (WD6)
    - RT6b `a re-change while held emits one net event` (WD7): create 뒤 수정 1건, create 뒤 삭제 0건.
    - RT-C `held shell changes prefer the session that ran a shell command` (WD14): 플랫폼 두 방향, 이전 범위 command 미반영, `skillOnly` 미반영 변형.
    - 새 테스트만 실패하는지 확인, 이름 보고.
  - [x] GREEN 구현:
    - `scanRoot`: claim으로 억제되지 않은 변경은 unconfirmed에 넣는다. 이미 있으면 `base`와 현재 snapshot으로 kind 재계산, 순변경 없으면 delete, `firstSeenAt` 유지.
    - scan 끝 `candidates.clear()`는 `unconfirmed.size===0`일 때만(`pending` 초기화는 그대로).
    - claim 기록 시 대상 root `unconfirmed`에 정확 키 또는 `key+path.sep` 하위 항목이 있으면 그 항목들을 삭제하고, claim은 항상 저장한다(post/pre 유효 규칙은 T1 그대로).
    - `scanShell`: 기존 scan 루프 뒤 모든 shell root에 `confirmRoot`(`pending`·`off` 무관, `shellScansPerTick` 미포함).
  - [x] 타이밍 조정: `shellActivity` 헬퍼(base :1253)와 `attributionSetup.change`(base :1275)가 scan tick 뒤 `advance(WATCH_LIMITS.shellConfirmMs)` + tick을 더해 두 출력을 합쳐 반환. 헬퍼 밖 scan 직후 inferred 단언 테스트(예: base :1656, :1679, :1575)에는 확정용 `advance`/`tick`만 추가. 단언 내용(kind·paths·sessionId·개수·`scans` 수) 불변. 바꾼 테스트 목록 보고.
  - [x] `docs/harness-operation.md` :144 Shell detection 행 끝에 영어 문장 추가(제안): "Unclaimed shell changes wait about 2 seconds before display so a late tool event can replace them; the inferred owner is the most recent session that ran a shell command in that window, otherwise the most recently active session." 한글 금지.
  - [x] GREEN: 관련 테스트 명령 통과(새 실패 없음).
  - [x] `node scripts/update-manifest.mjs`: `lib/watch/watcher.mjs`, `lib/watch/model.mjs` 해시만 변경(`docs/harness-operation.md`는 manifest 대상 아님, 확인됨). 다르면 hold.
  - [x] 커밋(Orchestrator, 수락 뒤): `fix(watch): 셸 변경을 잠시 보류해 늦은 명시 이벤트와 중복을 없애고 셸 명령 세션에 우선 귀속`
- 관련 테스트와 이유
  - `tests/node/watch-watcher.test.mjs`: 유예·확정·순변경·command 우선, 귀속 타이밍 회귀(WD10).
  - `tests/node/watch-cli.test.mjs`: `WATCH_LIMITS` import, 문서 한글 금지 검사(WD13) 위치 확인.
  - `tests/node/watch-render.test.mjs`: 확정 이벤트 human/JSON 형식 회귀.
  - `tests/node/watch-normalize-claude.test.mjs`: T1 결과 회귀.
  - `tests/node/manifest.test.mjs`: MANIFEST 갱신.
  - `docs/harness-operation.md`를 읽는 다른 테스트를 Implementer가 grep으로 찾아 있으면 이유와 함께 추가.
- 명령: `node --test tests/node/watch-watcher.test.mjs tests/node/watch-cli.test.mjs tests/node/watch-render.test.mjs tests/node/watch-normalize-claude.test.mjs tests/node/manifest.test.mjs`, `npm run check:manifest`
- 수락 기준: WD1, WD2, WD6, WD7, WD10, WD11, WD12, WD13, WD14 (WD5 회귀 유지)
- 보류 조건: 기존 테스트의 타이밍 외 단언 변경 필요; `shellConfirmMs`≠2000 필요; confirm의 git 호출 필요; 플랫폼 id 분기 필요; 확정 시 후보 부재 등 새 제품 결정; tui/consumer 변경 필요.
- 자체 검토
  - [x] scan tick에서 inferred가 나오지 않고 confirm tick은 git 0회.
  - [x] `lastCommandAt`이 줄마다 보존되고 candidates 비움과 함께 사라진다.
  - [x] JSON 필드 집합 불변, 문서 영어 전용.

## 최종 검증 (T1·T2 수락·커밋 뒤, fresh QA 1회)

- verified HEAD에서 수행. 시작·종료 `git status --porcelain`이 clean이 아니면 보류. task QA가 통과한 관련 테스트는 재실행하지 않는다.
1. (a) 계약 테스트: `tests/node/test-scope-contract.test.mjs`, `tests/node/plan-level-records-contract.test.mjs`, `tests/node/run-mode-contract.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/test_harness_contract.py`
2. (b) check: `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`
3. (c) 재변경 파일(`lib/watch/watcher.mjs`, `tests/node/watch-watcher.test.mjs`, `MANIFEST.sha256`) 재확인: 최종 HEAD에서 `node --test tests/node/watch-*.test.mjs` 1회 + `lib/watch/`를 import하는 다른 테스트(grep).
4. 전체 회귀 잠정 판정: 실행하지 않음. 근거: 변경이 `lib/watch` 내부 동작·테스트·문서 한 행·MANIFEST에 한정, 공유 생성기·runtime 설치 경로·설정·공개 JSON 필드 불변, base 이후 merge 없음 예상. 트리거: diff가 범위 밖, MANIFEST 변경이 예상 밖, (b) runtime-assets/parity 실패, QA 판단 불가 → 전체 회귀 1회 후 base 실패 목록과 비교(새 실패 없음 기준, 의심 테스트 단독 1회 재실행).
5. final Reviewer: 전 태스크 수락 뒤 base `f786e4a1`..HEAD 전체 변경 1회. 초점: claim 수명과 unconfirmed 상호작용, candidates 비움 시점, 순변경 계산, 플랫폼 중립, 내부 필드 비노출. 지적은 Implementer → Reviewer 재확인, 수락 뒤 후속 커밋 1개.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-23 (사용자 플랜 승인, 커밋 cb1a9534 전) | initial | T1, T2 | 최초 승인 |
| v2 | 2026-11-23T01:14:43Z | contract | T2 | T2 QA가 재현한 WD1·WD2 중복(보류 항목 삭제 시 claim 미저장) 해소를 위해 claim 저장 규칙 변경, 한계 L4 갱신·L5·L6 추가 |
| v3 | 2026-11-23T01:28:03Z | contract | 최종 Reviewer 후속(T2 영역) | 최종 Reviewer F1(확정 시 다음 범위 후보까지 비워 셸 변경 누락)·F2(이전 범위 lastCommandAt 이월)·F3(pre claim이 다른 세션 보류 변경 삭제) 해소: 후보 범위 타임스탬프 경계, pre claim 보류 보존, L4 갱신. 회귀 테스트 3건 추가. 수락 기준 불변. 최종 QA 판정에 따라 전체 회귀 트리거(1)(MANIFEST 공유 데이터) 성립 — 최종 상태에서 1회 실행 |
| v4 | 2026-11-23T01:42:23Z | mechanical | 없음(문서) | 최종 Reviewer 재확인 N1·N2: L4에 역순 경쟁(중복 1건·120s 억제 가능) 추가, L6 문구를 실제 동작(가장 최근 command 세션, 범위가 이어지는 조건)에 맞게 정정 |

## 위험·깊이 근거

- 깊이 Bounded: `lib/watch` 안의 두 단계 변경, 공개 인터페이스 불변. T2가 T1 claim 구조에 의존하므로 플랜 필요.
- 위험 중간: 타이밍 테스트 flake 가능(헬퍼로 대기 집중), 셸 변경 표시 최대 약 2s 지연(의도·문서화), command 우선 귀속의 미세 변화(WD10·WD14로 고정).
- 의존·준비: T2 → T1(claim 구조·라우팅 헬퍼, 같은 파일). 설계 초안의 T3(문서·MANIFEST)는 분리하지 않는다 — MANIFEST는 코드 변경 태스크마다 갱신해야 각 태스크가 단독으로 `check:manifest`를 통과하고, `docs/harness-operation.md`는 manifest 대상이 아니며 T2 동작 설명이다. 같은 파일 동시 Implementer 금지, T1 커밋 뒤 T2 시작.
