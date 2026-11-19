# Configure Run mode(Supervised / Full Auto) 토글, Settings 하위 메뉴 제거, Status 설정 표시 — 설계 명세

- 작성일: 2026-11-19
- 상태: 승인됨(2026-11-19 08:59 KST, 사용자 명시 승인). 설계는 2026-11-19 사용자 명시 승인.
- 소스: `/Users/ma-24-007/Desktop/workspace/arc`, `master` @ `74df988`, clean. 실행 대상: 현재 checkout의 새 브랜치 `feat/configure-run-mode`(사용자 명시 선택, 74df988에서 생성).
- 경로: Architectural. spec 승인 후 `references/writing-plans.md`에 따른 구현 계획 작성.

## 0. 결정 추적표

| # | 결정(사용자 승인 설계, 2026-11-19) | 절 |
|---|---|---|
| D1 | 모드 이름 `Supervised`(현행)·`Full Auto`(신규), 화면 라벨 `Run mode`, 저장값 `run_mode = "supervised" \| "full-auto"` | 3, 4 |
| D2 | Configure에서 Settings 하위 메뉴(`editInstallSettings`) 삭제, control 행 `Hosts → Run mode → Language → Total subagents → Concurrent subagents → Apply → Back` | 4 |
| D3 | Language 표시값 `English`/`Korean`(Configure·Status), 저장값 `en`/`ko` 불변 | 4, 5 |
| D4 | `skills/arc/settings.toml` 확장: supervised는 현행 v1과 바이트 동일, full-auto는 v2. 기본값 supervised. 구버전 CLI의 v2 `incomplete` 하위호환 제약 수용·문서화 | 3 |
| D5 | 전파: TUI draft·prepare options·operations(standalone/composite)·buildInstallPlan(미지정 시 기존값 보존→없으면 supervised)·upgrade 보존·status | 6 |
| D6 | Status: `Mode` 행 → `Installed on`, 설정 4종 표시, 플랫폼별 상이 시 `mixed` | 5 |
| D7 | CLI 플래그 추가 없음 | 2 |
| D8 | 에이전트 전달 방식 A: SKILL.md marker `{{ARC_RUN_MODE_POLICY}}` + `renderRunModePolicy`, Supervised에도 짧은 문단, Full Auto일 때만 managed block 한 줄, 모드 무관 정적 규칙 `[approval.run-mode]`, 프로필 모드별 렌더링 없음, fragment 금지 regex에 marker 추가, MANIFEST 갱신, "Explicit choice" 문장에 Full Auto 예외 | 7 |
| D9 | Full Auto 의미·auto gate·사용자 유지 gate·불변 항목·기록·중단 | 8 |
| D10 | FR 후속(2026-11-19 사용자 지시): Full Auto 선택 시 Configure info 주의 문구, Host 추가 시 새 플랫폼이 설치된 플랫폼의 설정을 이어받음(`(mixed)` 아님), planning.md 적용 조건 문구·질문 행 우선순위 명시 | 4.1, 4.3, 7.6 |
| — | 범위 밖: 프로젝트 단위 모드, runtime 구조화 필드, CLI 플래그 | 2 |

## 1. 목표

1. G1: Configure 한 화면에서 Run mode, Language, 두 subagent 한도를 직접 편집한다(하위 메뉴 없음).
2. G2: Run mode를 설치 단위로 저장·보존한다. 기존·신규 설치의 기본 동작(Supervised)은 바뀌지 않는다.
3. G3: 설치된 ARC skill이 Full Auto일 때 Orchestrator가 승인된 gate 범위 안에서 권장안으로 자체 결정하고 기록한다.
4. G4: Status 화면에 `Installed on`과 설치 설정 4종을 표시한다.

## 2. 범위와 비범위

범위:
- `lib/tui/setup.mjs`, `lib/tui/mode.mjs`
- `lib/installer/language.mjs`, `lib/installer/plan.mjs`, `lib/installer/global-config.mjs`, `lib/installer/upgrade-state.mjs`, `lib/installer/upgrade.mjs`
- `lib/management/operations.mjs`, `lib/management/status.mjs`
- `lib/policy/role-policy.json`, `lib/policy/placement.mjs`, `lib/policy/render.mjs`(필수 규칙 목록)
- `lib/prompts/render.mjs`(fragment 금지 regex), `lib/prompts/agent-fragments.json`(Explicit choice 문장)
- 4개 플랫폼 `claude/`, `codex/`, `gemini/`, `grok/`의 `skill/SKILL.md`, `skill/references/planning.md`, 생성 managed 섹션(agent 프로필 포함)
- `MANIFEST.sha256`, `README.md`, `docs/harness-operation.md`, 관련 테스트·fixture

비범위(변경 없음):
- CLI 플래그(언어·한도 플래그도 현재 없음)
- 프로젝트 단위 모드
- runtime 구조화 필드(`lib/runtime/assignment.mjs` approvalRef는 자유텍스트 유지)
- 프로필의 모드별 렌더링
- 언어 기본값 동작(standalone `buildInstallPlan`의 `language='en'` 기본 인자 유지, 6.2)
- plan depth 판단, local commit 규칙, QA/Reviewer/수락 흐름
- 설치 요약(summary) 문구(Run mode 요약 줄 추가 없음, 14절 Q3)

## 3. 저장 계약: `skills/arc/settings.toml`

### 3.1 문법

v1(supervised, 현행과 바이트 동일):
```
version = 1
language = "<en|ko>"
```
v2(full-auto):
```
version = 2
language = "<en|ko>"
run_mode = "full-auto"
```
줄바꿈 `\n`, 파일 끝 개행 1개, 키 순서 위와 같음, BOM 없음.

### 3.2 API(`lib/installer/language.mjs`)

- `RUN_MODES = ['supervised','full-auto']`, `validateRunMode(value)`: 목록 밖이면 `Error('Invalid run mode: <value>')`.
- `parseSettings(bytes) -> {version:1|2, language, runMode}`
  - Buffer가 아니거나 UTF-8(fatal) 디코딩 실패 시 거부. 기존 `parseLanguage`와 같은 디코딩·`parseToml` 사용.
  - v1: 키 정확히 `version`,`language` 2개, `version`이 `1`/`1n`. `runMode`는 `'supervised'`.
  - v2: 키 정확히 `version`,`language`,`run_mode` 3개, `version`이 `2`/`2n`, `run_mode`가 `validateRunMode` 통과.
  - 그 외(v1에 `run_mode`, v2에 `run_mode` 누락, 추가 키, version 3 이상)는 `Error('Invalid ARC settings schema or version')`.
- `serializeSettings({language, runMode='supervised'})`: supervised면 v1 바이트(= 현행 `serializeLanguage`), full-auto면 v2 바이트.
- `parseLanguage(bytes)`는 wrapper로 유지: `parseSettings`를 호출해 v1이면 `{version:1,language}`(현행 형태), v2면 `{version:2,language}`. `serializeLanguage(language)`는 `serializeSettings({language})`와 동일(바이트 불변).
- 이 wrapper로 `lib/installer/preset.mjs:19`, `lib/installer/role-routing.mjs:229`의 `parseLanguage` 호출은 수정 없이 v2에서도 동작한다.

### 3.3 하위호환

구버전 CLI의 `parseLanguage`(`language.mjs:7`)는 키 2개·version 1만 허용하므로 v2 파일에서 status는 `incomplete`(`status.mjs:17,19`), upgrade-state는 `Invalid installed ARC settings`(`upgrade-state.mjs:27`)로 실패한다. 이 제약을 수용하고, 다운그레이드 전 Supervised로 재설치하라는 안내를 README와 `docs/harness-operation.md`에 쓴다.

## 4. Configure 화면 계약(`lib/tui/setup.mjs`)

### 4.1 설정 키와 draft

- `installSettingKeys = ['runMode','language','maxTotalSubagents','maxConcurrentSubagents']`
- `installSettingsDraft`: 플랫폼별 값에 `runMode: settings?.runMode ?? 'supervised'` 추가. 기본 `{runMode:'supervised',language:'en',maxTotalSubagents:100,maxConcurrentSubagents:5}`. (v2) 값과 `mixed`는 `plan.platforms` 중 `state==='installed'`인 플랫폼만으로 계산한다. 설치되지 않은 플랫폼(새로 추가한 Host·역할 플랫폼)은 값 계산에서 빠지고 draft 값을 그대로 이어받는다. 설치된 플랫폼이 없으면 기본값. 네 키 모두 같은 규칙. 그래서 Full Auto 설치에 Host를 추가해도 `(mixed)`가 아니라 `Full Auto`로 보이고 Apply 시 새 플랫폼에도 적용된다.
- `installPrepareOptions`: 현행 반복문(`setup.mjs:38`)이 키 목록을 따르므로, runMode가 mixed가 아니거나 touched이면 standalone 결과(`...settings`)에 `runMode`, composite에 `settings.runMode`가 들어간다.
- 루프마다 touched 값을 재적용하는 동작(`setup.mjs:139`)이 runMode에도 적용된다.

### 4.2 행과 선택 인덱스

라벨 폭 22칸(현행 Settings 화면 패딩과 동일).

| choice | 행 텍스트 | rowKind | 동작 |
|---|---|---|---|
| 0–4 | 역할 다이어그램(Scouter…Reviewer) | — | 현행 `editRole` |
| 5 | `Hosts: <labels>` | undefined | 현행 `editHosts` |
| 6 | `Run mode              <value>` | undefined | ←/→/Enter 순환 |
| 7 | `Language              <value>` | undefined | ←/→/Enter 순환 |
| 8 | `Total subagents       <value>` | undefined | Enter → `ui.text('Total subagents', raw)` |
| 9 | `Concurrent subagents  <value>` | undefined | Enter → `ui.text('Concurrent subagents', raw)` |
| 10 | `Apply - <plan.modeLabel>` | `'confirm'` | 현행 Apply 분기(기존 choice 7) |
| null | `Back`(backRow) | `'cancel'` | `return null` |

- 값 표시: mixed이고 touched가 아니면 `(mixed)`. 그 외 runMode `Supervised`/`Full Auto`, language `English`/`Korean`, 한도 `String(value)`.
- 깜빡임: 행 6·7 값은 `arrowValue(label, state.frame, state.selected===6|7)`(현행 `setup.mjs:53` 방식). `refreshMs:600` 유지.
- 순환: `onHorizontal:({selected})=>{if(selected===6)cycleRunMode();else if(selected===7)cycleLanguage();}`. Enter로 6/7 선택 시 같은 순환 후 선택 위치 유지. `cycleRunMode`는 `supervised↔full-auto` 전환 + `touched.add('runMode')`. 시작값은 draft 값(현행 언어 순환과 동일).
- 한도 입력: mixed·미touched면 `''`, 아니면 `String(value)`에서 시작. `parsePositiveLimit` 실패 시 `ui.page('Invalid limit',['Enter a positive whole number.'])` 후 재입력, `null`이면 취소, 성공 시 값 반영 + `touched` 추가(현행 `setup.mjs:62-66` 이전).
- `controls` 배열: `[hostsRow, runModeRow, languageRow, totalRow, concurrentRow, applyRow, 'Back']`, menu 항목 `[...installRoleNames, ...controls.slice(0,-1)]`.
- rowKinds는 controls에서 생성: diagramBody 뒤에 `controls.map((_,i)=>i===controls.length-2?'confirm':i===controls.length-1?'cancel':undefined)`. 하드코딩 `[undefined,undefined,'confirm','cancel']`(`setup.mjs:162`) 대체.
- `footerRows`는 현행 식 `wrapDetailRows(info).length + controls.length` 유지. controls 4→7로 compact/guard 전환 높이가 3행 이동하며 테스트로 고정.
- 선택 매핑 식(`setup.mjs:160`)과 스크롤 offset 계산은 유지.
- `editInstallSettings`(export 포함)와 `languageLabel`(`'KR'/'EN'`) 삭제.

### 4.3 Full Auto 주의 문구(v2)

- 화면 Run mode 값이 `Full Auto`(mixed·미touched가 아님)이면 Configure notice 끝에 다음 info 한 줄을 붙인다(정확한 영문):
  `Full Auto: the Orchestrator approves specs, plans and choices on its own; push, merge, holds and permissions still need you.`
- 기존 info(anchor 이동, 차단 사유/auth 경고) 뒤에 온다. ←/→/Enter로 Run mode를 바꾸면 같은 메뉴 안에서 즉시 나타나거나 사라진다(renderBody가 notices·footerRows·capacity를 같은 목록으로 계산).
- Supervised 또는 `(mixed)`이면 표시하지 않으며, 그때의 notice·행 배치는 현행과 같다.

## 5. Status 화면 계약(`lib/tui/mode.mjs` `statusInfo`)

- 첫 행 라벨 `Mode` → `Installed on`. 값은 `homeModeLine(...)` 그대로. `homeModeLine` 함수명·다른 호출처 불변.
- 설정 행: `state==='installed'`이고 `settings`가 있는 status가 1개 이상이면 `Installed on` 바로 아래 4행:
  1. `Run mode` — `Supervised` | `Full Auto`
  2. `Language` — `English` | `Korean`
  3. `Total subagents` — `settings.limits.max_total_subagents`
  4. `Concurrent subagents` — `settings.limits.max_concurrent_subagents`
  - 대상 status 간 값이 다르면 해당 행 값 `mixed`.
- 그 뒤 빈 행 1개, 이어서 기존 플랫폼 행.
- `labelWidth` 계산에 새 라벨 포함(최장 `Concurrent subagents`, 20칸). 기존 플랫폼·Version 행 값 열도 같이 밀린다(의도된 변화).
- `infoTones`에 새 행마다 `undefined`를 넣어 길이를 맞춘다.
- 설치된 플랫폼이 없으면 설정 4행 생략, `Installed on`(`Not installed`)과 빈 행만 남김.
- 데이터: `collectStatus`(`status.mjs:17`)의 `settings`에 `runMode` 추가, `parseSettings(mandatory('settings.toml'))`로 `language`·`runMode` 획득.

## 6. 설치·업그레이드 전파

### 6.1 `buildInstallPlan`(`plan.mjs:65`)

- 새 인자 `runMode`(기본 인자 없음). 결정 순서: 주어지면 validate 후 사용 → 없으면 `languageState.existingRunMode` → 없으면 `'supervised'`.
- `previewLanguage`(`plan.mjs:18-23`)는 기존 `existing`(언어|null)을 유지하고 `existingRunMode`(`'supervised'|'full-auto'|null`)를 추가 반환. 파싱은 `parseSettings`. 오류 접두어 `Invalid ARC language settings:` 유지.
- `renderSkillPayload`: `SKILL.md = renderRunModePolicy(renderLanguagePolicy(src, language), runMode)`, `settings.toml = serializeSettings({language, runMode})`.
- `renderNativeChanges` → `agentsBlockBody(home, userHome, language, platform, runMode)`.
- plan 객체에 `runMode` 추가. summary 불변.

### 6.2 확인 결과: `language='en'` 기본 인자는 기존값을 보존하지 않는다

- `plan.mjs:65` 기본값 `'en'`은 `previewLanguage`의 `existing`(`plan.mjs:21,68`)을 쓰지 않는다. 그 값은 snapshot·drift 검사(`plan.mjs:67,86`)에만 쓰인다.
- standalone 경로(`operations.mjs:53`)는 `language:options.language`를 그대로 넘기므로 값이 없으면 `'en'`.
- 그러나 install 요청은 TUI(`setup.mjs:44,48`)에서만 생성되고, standalone은 플랫폼 1개라 mixed가 없어 draft의 기존 언어가 항상 전달된다. 실제로는 보존된다.
- composite(`operations.mjs:99`)는 기존 파일 값을 읽어 명시적으로 보존한다.
- 결론: runMode는 `buildInstallPlan` 안에서 preview로 기존값을 보존한다(D5). 언어 기본값 동작은 범위 밖.

### 6.3 operations(`lib/management/operations.mjs`)

- standalone(L53): `buildInstallPlan({...,runMode:options.runMode})`. 없으면 6.1로 보존.
- composite(L98-100): `const parsed = languageFile.exists ? parseSettings(languageFile.bytes) : null; language = options.settings?.language ?? parsed?.language ?? 'en'; runMode = options.settings?.runMode ?? parsed?.runMode ?? 'supervised'` 후 `buildInstallPlan({...,runMode})`.
- preset 경로(L104-107)는 변경 없음.

### 6.4 upgrade

- `upgrade-state.mjs:27`: `parseSettings`로 `language`·`runMode`를 얻고 L34 target entry에 `runMode` 추가. stateToken 계산 불변.
- `upgrade.mjs:15-19`: entry의 `runMode`를 `buildInstallPlan`과 L19 `agentsBlockBody(...,language,target.platform,runMode)`에 전달.

### 6.5 managed instruction block(`global-config.mjs:42-43`)

- 시그니처: `agentsBlockBody(home,userHome,language='en',platform='codex',runMode='supervised')`.
- supervised: 현행과 바이트 동일.
- full-auto: 현행 bullet 뒤 마지막 줄로 추가:
```
- ARC Run mode is Full Auto: Orchestrator auto-decides only the gates listed in the installed ARC skill, records each decision, and asks the user for everything else.
```

## 7. 에이전트 전달 계약

### 7.1 marker와 `renderRunModePolicy`

- marker: `{{ARC_RUN_MODE_POLICY}}`.
- 위치: 4개 `*/skill/SKILL.md`에서 `{{ARC_OUTPUT_LANGUAGE_POLICY}}` 줄(L8) 다음 빈 줄 1개 뒤 단독 줄.
- `runModePolicy(runMode)`는 7.2 문단 반환.
- `renderRunModePolicy(bytes, runMode)`: UTF-8(fatal) 디코딩, `text.split(MARKER).length!==2`이면 `Error('Expected exactly one ARC run mode policy marker')`, 정확히 1개일 때만 치환(`renderLanguagePolicy`, `language.mjs:13`과 같은 형태).
- SKILL.md에만 적용, 프로필에는 적용하지 않는다.
- `lib/prompts/render.mjs:145` fragment 금지 regex에 `ARC_RUN_MODE_POLICY` 추가(fragment에 marker가 있으면 실패).

### 7.2 SKILL.md 렌더링 문단(정확한 영문)

Supervised:
```
**Run mode:** Supervised. Every approval and choice gate in this skill and its references requires the user's explicit answer; Orchestrator does not auto-decide gates.
```

Full Auto:
```
**Run mode:** Full Auto. Orchestrator decides the gates listed in [planning](references/planning.md#full-auto-run-mode) itself: it completes that gate's required checks first, then chooses the recommended option; without a recommendation and supporting evidence, it asks the user. New product decisions outside the original request, external actions, failures, partial completion, holds, unknown state, ownership conflicts, preservation-rule Git actions, permission or sandbox approvals, and unknown slots or exhausted capacity still go to the user. Plan depth, local commit rules, QA, Reviewer and acceptance are unchanged. Record each decision as `auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence` in a user-visible progress message and in the canonical handoff record. If the user asks in this chat to stop auto-deciding or to use Supervised, apply Supervised from the next gate; this overrides the installed default, and earlier auto-decisions stay recorded.
```

### 7.3 SKILL.md 정적 문장 변경(4개 사본, 모드 무관)

- L10 Execution-target gate: `record explicit user target choice` → `record explicit user target choice (or a Full Auto auto-decision under the Run mode policy)`.
- L16 Pre-action gate record: 필드 목록의 `mode` 다음에 `` `run` (Run mode in effect: `supervised` or `full-auto`) `` 추가.
- L30 Explicit choice:
```
- **Explicit choice:** Only clear user selection counts, except a recorded Full Auto auto-decision for a gate the installed Run mode permits. Planning approval, silence, refusal of another option and ambiguous replies do not.
```

### 7.4 "Explicit choice" 문장 출처 확인 결과

- Orchestrator용: 4개 `*/skill/SKILL.md:30` 수기 사본 → 7.3으로 모두 수정.
- 역할 프로필용: `lib/prompts/agent-fragments.json:14` 공용 fragment(`Only a clear user selection counts. ...`)에서 생성 → 다음으로 수정:
```
- **Explicit choice:** Only a clear user selection counts, or a recorded Full Auto auto-decision under [approval.run-mode]. Planning approval, silence, refusal of another option and ambiguous replies do not.
```
- 정적 문장이므로 D8의 "프로필 모드별 렌더링 없음"과 충돌하지 않는다.
- `references/git-recovery.md:8`, `references/handoff-prep.md:28`은 shared term 참조라 수정하지 않는다(git-recovery는 사용자 유지 영역).
- fixture `tests/node/fixtures/instruction-contracts.json:33,145`의 SKILL.md 문장 사본도 갱신.

### 7.5 `[approval.run-mode]` 규칙(`lib/policy/role-policy.json`)

`external.explicit-user-authority` 바로 뒤에 추가:
```json
{
  "id": "approval.run-mode",
  "roles": ["orchestrator","scouter","planner","implementer","qa","reviewer"],
  "effect": "require",
  "operations": ["gate-decision"],
  "evidence": ["user-choice-or-recorded-full-auto-decision"],
  "authority": "user",
  "text": "The installed ARC Run mode is Supervised unless the installed skill states Full Auto. In Full Auto, an Orchestrator decision recorded as `auto-decided (Full Auto)` with gate, choice, reason and evidence counts as the explicit choice or approval for that listed gate only; briefs cite it as `full-auto:<doc>@<version>` or the recorded decision. It never authorizes new product decisions outside the original request, external actions, resolution of failures, holds, unknown state or ownership conflicts, preservation-rule Git actions, permission or sandbox changes, or unknown slots and exhausted capacity, and it changes no plan-depth, commit, QA, Reviewer or acceptance rule. A user request to stop or use Supervised applies from the next gate.",
  "controls": {"codex":"prompt","claude":"prompt","gemini":"prompt","grok":"prompt"}
}
```
- `lib/policy/placement.mjs`: `core`와 `planning` projection에 `'approval.run-mode'` 추가(모든 규칙이 projection에 포함돼야 하는 검사 `placement.mjs:24` 충족).
- `lib/policy/render.mjs:23` 필수 규칙 목록에 `'approval.run-mode'` 추가.
- 출력 순서는 `policy.rules` 순서(`render.mjs:48-49`): SKILL.md core에서 `[external.explicit-user-authority]`와 `[role.orchestrator-boundary]` 사이. roles 6개 전부라 specialist 프로필 managed 섹션에도 들어간다.
- 4개 플랫폼 SKILL.md, references(planning projection 포함), agent 프로필은 기존 managed 섹션 재생성 절차로 다시 만든다. 손 편집 금지.
- 필드 `operations`/`evidence` 값은 검증 형식용 신규 문자열이며 runtime이 참조하지 않는다. 검증 스키마가 다른 형식을 요구하면 plan 단계에서 맞춘다.

### 7.6 `## Full Auto run mode` 섹션(4개 `*/skill/references/planning.md`)

파일 끝에 추가(정확한 영문):

```markdown
<a id="full-auto-run-mode"></a>
## Full Auto run mode

Applies only when the installed SKILL.md contains `**Run mode:** Full Auto.` and the user has not asked in this chat to stop auto-deciding or to use Supervised. Orchestrator first completes every review obligation of the gate, then selects the recommended option. Without a recommendation and supporting evidence, ask the user (fail-safe). Gates not listed as auto stay with the user. `user` and `unchanged` rows take precedence over `auto` rows: an auto question row (`Planner options and questions`, `AskUserQuestion`) answers only questions whose subject no `user` or `unchanged` row covers; otherwise ask the user.

| Gate | Full Auto | Rule |
|---|---|---|
| Execution-target choice | auto | Clean work tree → new task branch in the current checkout; unrelated changes present → managed worktree; detached HEAD, unknown state or unclear ownership → user |
| Branch name collision | auto | Next numeric suffix (`-2`, `-3`, …) |
| Planner options and questions | auto | Recommended option; record assumptions in the brief |
| Design and short-design approval | auto | After Orchestrator review |
| Written spec approval | auto | After Orchestrator review |
| Plan approval | auto | Only with zero open decisions; otherwise user |
| Spec/plan revision within the original scope | auto | Scope-expanding revisions → user |
| Direct-path F1–F8 scope approval | auto | All F1–F8 still proven |
| `AskUserQuestion` | auto | Recommended option |
| Visual companion offer | skipped | Not offered |
| Visual interpretation approval ([verification](verification.md#visual-evidence-and-adjudication)) | user | Not an auto gate |
| New product decision outside the original request | user | — |
| Push, merge, deploy, publish, external messages | user | — |
| Failure, partial completion, hold, unknown state, ownership conflict | user | — |
| Preservation-rule Git actions | unchanged | Still prohibited; stop and report |
| Permission or sandbox approval | user | — |
| Unknown slot or exhausted capacity | user | — |
| Plan depth, local commit, QA, Reviewer, acceptance | unchanged | — |

Records:
- Each auto decision: user-visible progress message `auto-decided (Full Auto): <gate> → <choice>; reason; alternatives; evidence`, plus the same entry in the canonical handoff record.
- Pre-action gate record: `run` field (`supervised` or `full-auto`).
- Revision-history `Approval time`: `auto-approved (Full Auto) <time>`.
- Runtime `approvalRef` (free text): `full-auto:<doc>@<version>`.
- Completion report: list every auto decision.

Stopping: a user request in this chat to stop or switch to Supervised overrides the installed default and applies from the next gate; earlier auto decisions remain recorded.
```

(앵커 `verification.md#visual-evidence-and-adjudication`의 실제 존재는 plan 단계에서 확인하고, 없으면 실제 앵커로 맞춘다.)

## 8. Full Auto 의미 요약(D9)

7.2·7.5·7.6 영문은 승인 설계의 "Full Auto 의미"를 옮긴 것이다. 추가 판단은 하나: 승인 설계 auto 목록에 없는 "visual interpretation approval"을 fail-safe에 따라 user로 분류했다(14절 Q1).

## 9. 사용자 시각 확인 gate 확인 결과

- UI 수락에 사용자 직접 시각 확인 gate는 없다. `references/verification.md:6`은 UI 수락 전 reference 읽기 규칙, `verification.md:13`은 QA의 승인 출처 비교 증거 규칙이다.
- 사용자 관련 요소는 `verification.md:13`·`arc-visual-companion.md:26`의 "interpretation approval이 없으면 비교 보류"뿐이며 auto 목록에 없어 7.6에서 user로 두었다.
- visual companion 제안은 승인 설계대로 Full Auto에서 생략.

## 10. 플랫폼·생성물·문서 전파

| 대상 | 변경 |
|---|---|
| `claude/`, `codex/`, `gemini/`, `grok/` `skill/SKILL.md` | marker 줄(7.1), 정적 문장(7.3), core managed 섹션 재생성 |
| 4개 `skill/references/planning.md` | `## Full Auto run mode`(7.6), planning managed 섹션 재생성 |
| 4개 플랫폼 agent 프로필 | managed 섹션 재생성(규칙 1줄), fragment Explicit choice 문장 |
| 그 밖의 references | projection에 규칙 없음 → 변경 없음 |
| `lib/prompts/render.mjs:145` | 금지 regex에 marker 추가 |
| `MANIFEST.sha256` | `node scripts/update-manifest.mjs`로 재생성, `npm run check:manifest`로 확인 |
| `README.md` | Configure 행 구성, Run mode 설명, Status 행, settings.toml v2·다운그레이드 제약 |
| `docs/harness-operation.md` | Full Auto gate 요약(planning.md 참조), 설정 파일 문법, 보존, 중단 방법 |

## 11. 수용 기준

저장
- AC-S1: `serializeSettings({language:'en'|'ko'})`·`serializeSettings({language,runMode:'supervised'})`가 현행 `serializeLanguage` 결과와 바이트 동일.
- AC-S2: full-auto는 3.1 v2 바이트와 정확히 같고 `parseSettings`로 왕복된다.
- AC-S3: 3.2 거부 사례(v1+run_mode, v2 run_mode 누락, 잘못된 run_mode, 추가 키, version 3, 비Buffer, 잘못된 UTF-8) 모두 오류.
- AC-S4: `parseLanguage`가 v2에서 언어를 반환하고, v1은 `{version:1,language}`로 현행과 같다.

설치·보존
- AC-P1: 기존 v2(full-auto) 설치에 `runMode` 없이 `buildInstallPlan` 실행 시 full-auto 보존. 파일 없음·v1이면 supervised. 명시값이 기존값보다 우선.
- AC-P2: composite 설치는 플랫폼별 기존 runMode를 보존하고, `options.settings.runMode`가 있으면 모든 대상에 적용.
- AC-P3: upgrade는 플랫폼별 runMode(settings.toml, SKILL.md 문단, managed block 줄)를 보존.
- AC-P4: `renderRunModePolicy`는 marker 0개·2개 이상이면 오류, 1개면 7.2 문단으로 치환하고 결과에 marker가 남지 않는다.
- AC-P5: managed block은 supervised에서 현행과 바이트 동일, full-auto에서만 6.5 줄이 마지막 bullet로 붙는다.
- AC-P6: fragment에 `{{ARC_RUN_MODE_POLICY}}`가 있으면 프로필 렌더링 실패.

TUI
- AC-U1: Configure menu 항목이 4.2 표의 순서·인덱스와 같다(Apply 10, Back null).
- AC-U2: 6·7에서 ←/→/Enter로 순환하고 `touched`가 기록된다. 값 표시 `Supervised`/`Full Auto`, `English`/`Korean`, mixed `(mixed)`.
- AC-U3: 8·9에서 Enter → text 입력, 잘못된 값이면 `Invalid limit` 후 재입력, mixed면 `''`에서 시작, null이면 취소.
- AC-U4: rowKinds가 Apply=`confirm`, Back=`cancel`, 나머지 control 행 undefined.
- AC-U5: compact/guard 전환 높이가 controls 7행 기준으로 고정(테스트에 정확한 경계 행 수).
- AC-U6: `installPrepareOptions`가 standalone/composite 모두 4.1 규칙대로 runMode 전달.
- AC-U7: `editInstallSettings`와 `'Settings'` 행이 없다.
- AC-U8(v2): Run mode가 `Full Auto`면 4.3 문구가 notice 끝에 보이고, 순환으로 Supervised가 되면 같은 메뉴 안에서 사라진다. Supervised·`(mixed)`에서는 notice가 현행과 같다.
- AC-U9(v2): Full Auto(또는 Korean·한도 변경)로 설치된 플랫폼에 미설치 Host를 추가하면 해당 값이 `(mixed)`가 아니라 설치값으로 보이고, `installPrepareOptions`가 그 값을 composite `settings`에 담는다. 설치된 두 플랫폼 값이 다르면 기존처럼 `(mixed)`.

Status
- AC-T1: 첫 행 라벨 `Installed on`, 값은 현행 `homeModeLine`과 같다.
- AC-T2: 설치된 플랫폼이 있으면 5절 4행이 순서대로 보이고, 값이 다르면 `mixed`.
- AC-T3: `collectStatus` settings에 `runMode`가 있다.

정책·생성물
- AC-G1: `role-policy.json` 검증 통과, `approval.run-mode`가 필수 규칙이며 core·planning projection에 포함.
- AC-G2: 4개 플랫폼 SKILL.md·planning.md·프로필의 managed 섹션이 재생성 결과와 일치(기존 생성 일치 검사 통과).
- AC-G3: 4개 SKILL.md에 marker 정확히 1개와 7.3 문장, 4개 planning.md에 7.6 섹션.
- AC-G4: `npm run check:manifest` 통과.
- AC-G6(v2): 4개 planning.md Full Auto 절 첫 문단이 7.6의 v2 문구와 정확히 같다.
- AC-G5: README.md·docs/harness-operation.md에 10절 내용.

회귀
- AC-R1: supervised 설치 결과를 기준(74df988)과 비교 시 `settings.toml`, `limits.toml`, `models.toml`, native config, managed instruction block, 이번에 바뀌지 않은 references는 바이트 동일. 달라지는 파일은 SKILL.md(문단·정적 문장·규칙 줄), planning.md, agent 프로필(규칙 줄·fragment 문장)뿐.
- AC-R2: 테스트 스위트에 새 실패가 없다(기존 실패·부하성 flaky는 baseline으로 별도 기록).

## 12. 검증

변경·추가 테스트(grep으로 확인한 위치; 정확한 기대값은 plan·구현 단계에서 확정)
- `tests/node/language.test.mjs`: L9-15 marker·defaultLanguage 검사 유지, AC-S1–S4·AC-P4 추가.
- `tests/node/plan.test.mjs`: L7·L72 marker 참조, L75·L158-159 preview 시나리오. AC-P1·AC-P5·settings.toml 바이트.
- `tests/node/upgrade-state.test.mjs`, `upgrade-harness.test.mjs`(L6, L17), `install-mode-models-upgrade.test.mjs`(L29): AC-P3.
- `tests/node/management-operations.test.mjs`, `install-mode*.test.mjs`: AC-P2.
- `tests/node/management-status.test.mjs`: AC-T3.
- `tests/node/tui-setup.test.mjs`: L78-97, L115, L138-168, L200, L261의 `'Settings'`·`editInstallSettings` 참조 재작성. AC-U1–U7.
- `tests/node/tui-app.test.mjs`: `'Mode` 단언(L206, 219, 367-378, 468-521, 562, 687-691), `'Settings'`(L377, 386, 390, 521). AC-T1–T2, AC-U5.
- `tests/node/tui-render.test.mjs`(L30, 41, 261 `KR`), `tui-terminal.test.mjs`(L37-153 `'Settings'`), `tui-custom-preset.test.mjs`(`'Mode`): 행·높이 기대값 갱신.
- `tests/node/role-policy.test.mjs`: AC-G1.
- `tests/node/instruction-language.test.mjs`, `fixtures/instruction-contracts.json`(L14, 33, 126, 145), `gemini-install.test.mjs:46`, `grok-install.test.mjs:52`: marker·문장.
- `tests/node/hardcoding-residual.test.mjs:115`, `tests/test_claude_payload.py:339,353`: 영향 확인 후 필요 시 갱신.
- `tests/node/manifest.test.mjs`, `npm run check:manifest`: AC-G4.

회귀 검사
- 같은 fixture home에서 기준 커밋과 변경본으로 supervised 설치를 만들어 파일 단위 비교(AC-R1).
- 전체 스위트는 Orchestrator가 실행하고 baseline 실패와 구분(AC-R2).

## 13. 위험과 확인 결과

| 항목 | 결과 |
|---|---|
| Explicit choice 문장 출처 | SKILL.md 4개 수기 사본, 프로필용은 `agent-fragments.json:14` fragment, fixture `instruction-contracts.json:33,145`(7.4) |
| `language='en'` 기본 인자 | 기존값 미보존이나 TUI가 항상 값을 넘겨 실제로는 보존. runMode는 preview로 보존(6.2) |
| UI 수락 사용자 시각 gate | 없음. interpretation approval만 user 유지(9) |
| 구버전 CLI의 v2 읽기 | `incomplete`. 수용·문서화(3.3) |
| footerRows 증가 | compact/guard 경계 3행 이동, 테스트 고정(AC-U5) |
| Status 라벨 폭 | 20칸으로 늘어 플랫폼 행 정렬 변경(의도) |
| 정책 텍스트 효과 | 텍스트 존재가 준수를 증명하지 않는다. 정적 검사는 구조만 증명 |

## 14. 열린 질문(초안 기본값)

- Q1: Full Auto에서 visual interpretation approval(`verification.md:13`)을 auto로 할지. 기본값: user 유지(fail-safe).
- Q2: v2에 손으로 쓴 `run_mode = "supervised"`를 받아들일지. 기본값: 받아들임(serializer는 정규 형태만 출력).
- Q3: 설치 확인 요약에 `ARC run mode: …` 줄을 넣을지. 기본값: 넣지 않음.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19 08:59 KST (사용자 명시 승인) | 초기 승인 | — | Q1–Q3 기본값 포함 승인 |
| v2 | 2026-11-19 (사용자 지시로 범위 확정: FR 지적 1·2 조치, 3은 Full Auto info 문구로, Host 추가 시 mixed 수정) | FR 후속 개정 | T8, T9 | D10. 4.1·4.3·7.6·AC-U8·U9·G6 |
