# TUI 동작 행 구분, Codex GPT-6.2·`ultra` 카탈로그, watch 반짝임 — 설계 명세

- 작성일: 2026-11-19
- 상태: 사용자 승인(written spec, 2026-11-19). 설계 사용자 승인 2026-11-19(결정 D1–D8 확정).
- 소스: `/Users/yunho/Desktop/project/arc`, 브랜치 `feat/grok-support`, HEAD `d013cf0`, 작업 트리 clean. 사용자가 현재 checkout에서 이어서 작업하기로 선택했다.
- 경로: Bounded. 이 spec이 승인되면 구현 계획 `docs/superpowers/plans/2026-11-19-tui-action-buttons-gpt62.md`를 작성한다.
- 관련 명세: `docs/superpowers/specs/2026-11-09-static-model-catalog-design.md`(이하 "카탈로그 명세"). 이 명세는 카탈로그 명세를 **수정하지 않으며**, 근거 수준이 다른 추가분을 따로 기록한다(4.3).

## 0. 결정 추적표

| # | 결정(사용자, 2026-11-19) | 절 |
|---|---|---|
| D1 | R1 방식 A: 텍스트·선택 인덱스·반환값·키 이동은 그대로 두고, 역할별 색과 동작 그룹 앞 빈 줄을 쓴다 | 3 |
| D2 | 색 없는 터미널(depth `none`)에서는 빈 줄로만 구분한다. 텍스트 표식은 넣지 않는다 | 3.3 |
| D3 | 기존 `none` effort 쌍을 유지한다 | 4.1 |
| D4 | Home `Exit`는 기본색이다(동작 행 아님). Uninstall 확인 `Remove`는 `danger`다 | 3.4 |
| D5 | 6.2 두 모델을 카탈로그 맨 위에 `gpt-6.2-astra`, `gpt-6.2-sol` 순서로 둔다 | 4.1 |
| D6 | `ultra`를 넣는 모델: 6.2-astra, 6.2-sol, 6.1-sol, 6.1-terra, 6-astra, 6-sol, 5.6-sol, 5.6-terra. luna 2종은 제외한다 | 4.1 |
| D7 | watch 반짝임: 1칸/tick, sweep 13 tick, 휴지 5 tick, 주기 18 tick. watch 전용 함수로 구현하고 `palette.mjs` `shimmerIntensity`와 TUI는 바꾸지 않는다 | 5 |
| D8 | 빈 줄은 일반 메뉴와 동작 그룹 사이에만 넣는다. 동작 행 사이에는 넣지 않는다 | 3.2 |
| — | 프리셋(`codex/skill/models.toml`의 Economy/Balanced/Smart)은 바꾸지 않는다 | 2 |

사실 정정: 설계 승인 요청에서 카탈로그 쌍 수를 "66쌍"으로 적었으나, 현재 카탈로그가 48쌍이 아니라 46쌍이므로 최종 쌍 수는 **64쌍**이다(46 + 12 + 6). 추가되는 쌍의 집합은 D5·D6 결정과 같다.

## 1. 목표

1. R1: 모든 TUI 화면에서 확정 계열(Apply/Done/Save/Continue/Upgrade/Force finish), 취소 계열(Back), 위험 계열(Remove) 행을 일반 메뉴 항목과 시각적으로 구분한다.
2. R2: Codex 정적 카탈로그에 `gpt-6.2-astra`, `gpt-6.2-sol`을 추가한다.
3. R3: D6 범위의 모델에 Codex effort `ultra`를 추가한다.
4. R4: `arc watch`의 `working…` 반짝임이 더 자주 나타나되, 글자를 지나가는 속도는 느려지게 한다.

## 2. 범위와 비범위

범위: `lib/tui/render.mjs`, `lib/tui/terminal.mjs`, `lib/tui/app.mjs`, `lib/tui/setup.mjs`, `lib/tui/custom-preset.mjs`, `lib/models/codex-models.json`, `MANIFEST.sha256`, `lib/watch/status-line.mjs`, 관련 테스트.

비범위(아래 항목은 바꾸지 않는다):
- 프리셋 `codex/skill/models.toml`과 프리셋 테스트 기대값
- `lib/color/palette.mjs`의 `shimmerIntensity`, TUI wordmark 애니메이션(`render.mjs:83,85`), TUI `frameMs`
- Claude effort 열거: `lib/runtime/platform-registry.mjs:106`, `shared/skill/runtime/platform-registry.mjs:106`, `lib/models/profiles.mjs:96`, `lib/models/catalog-anthropic.mjs:2`
- 기존 `none` 쌍(D3), 그리고 다른 기존 쌍의 삭제나 순서 변경
- `docs/superpowers/specs/2026-11-09-static-model-catalog-design.md`
- 화면 텍스트, 행 라벨, 선택 인덱스, 메뉴 반환값, 키 바인딩, hint 문구
- 메뉴 호출부의 행 수(capacity) 계산(`app.mjs:27`, `custom-preset.mjs:47,100,145,219`, `setup.mjs:161`)과 Configure diagram `footerRows`(`setup.mjs:156`). 3.2의 공간 규칙 때문에 바꿀 필요가 없다.

## 3. R1 UI 계약

### 3.1 현재 동작

`renderScreen`(`render.mjs:60-111`)은 `screen.rows`의 각 행 앞에 `'> '` 또는 `'  '`를 붙여 이어서 그린다. 선택된 행만 `selected` 막대(fg [236,253,245], bg [6,95,70], bold)로 칠한다. 나머지 행은 `rowTones`가 없으면 기본색으로 나온다. 그래서 동작 행이 메뉴 항목과 같은 색으로 바로 붙어 보인다.

`formatLine`(`terminal.mjs:8`)은 `BASIC`(`terminal.mjs:6`)에 등록된 role만 칠한다. 등록되지 않은 role은 어떤 depth에서도 무시하고, depth가 `none`이면 원문을 그대로 반환한다.

### 3.2 `rowKinds`와 빈 줄 규칙

- screen에 `rowKinds`를 추가한다. `screen.rows`와 인덱스가 맞는 배열이고, 값은 `'confirm' | 'cancel' | 'danger' | undefined`이다. `undefined`인 행은 일반 행이다.
- 동작 그룹은 `rowKinds`가 정의된 행이 연속된 구간이다.
- 빈 줄은 `renderScreen`에서만 넣는다. `screen.rows`, `screen.selected`, 메뉴 반환값은 바뀌지 않는다.
- 동작 그룹의 첫 행 k 앞에는 다음 조건을 **모두** 만족할 때만 선택할 수 없는 빈 줄(`''`) 1개를 넣는다.
  1. `k > 0`이다(앞에 행이 있다).
  2. `screen.rows[k-1]`이 동작 행이 아니다(D8: 동작 행 사이에는 넣지 않는다).
  3. `screen.rows[k-1] !== ''`이다(이미 빈 행이 있으면 생략한다. 예: text 화면, info 블록 뒤).
  4. `screen.position`이 없다(스크롤 중이면 생략한다).
  5. 빈 줄을 넣은 뒤의 전체 줄 수(heading + 항목 + 1 + position + notice + footer)가 `rows` 이하다(잘림이 생기면 생략한다).
- 4와 5가 있으므로 공간이 부족하면 빈 줄을 넣지 않는다. 따라서 호출부의 capacity와 `footerRows`는 바꾸지 않으며, Back은 지금처럼 항상 보인다.
- 빈 줄을 넣으면 `selectedLine`, `noticeStart`, position 줄, `rowTones`/`rowStatusSpans`와 대응하는 인덱스, `selectionEnabled` 판정이 모두 한 줄 밀린 위치를 써야 한다(행 인덱스와 화면 줄의 대응).
- `rowKinds`가 없거나 모든 값이 `undefined`이면 출력(`text`, `styles`, `selectionEnabled`)이 현재와 바이트 단위로 같아야 한다.

### 3.3 색

| role | 대상 | 256/truecolor | 16색(`BASIC`) |
|---|---|---|---|
| `actionConfirm` | 선택되지 않은 `confirm` 행 | fg [52,211,153], bold | `'1;32'` |
| `actionCancel` | 선택되지 않은 `cancel` 행 | fg [150,170,160] | `'2'` |
| `actionDanger` | 선택되지 않은 `danger` 행 | fg [248,113,113] | `'31'` |

- run은 라벨 범위(열 2부터 행 끝까지)에 적용한다.
- 선택된 행은 kind와 상관없이 기존 `selected`/`selectedPad`를 쓴다. 우선순위는 `selected` > `rowKinds` > `rowTones`이다.
- 세 role은 `terminal.mjs:6`의 `BASIC`에 반드시 등록한다.
- depth `none`(`NO_COLOR` 또는 `TERM=dumb`)에서는 색이 없고 빈 줄만으로 구분한다(D2). 텍스트 표식은 추가하지 않는다.

### 3.4 동작 행 목록과 지정 방법

- `menu()`(`app.mjs:16`)에 `actionKinds` 옵션을 추가한다. `rows` 인자와 인덱스가 맞는 배열이며 희소 배열이어도 된다. `backRow:true`이면 자동으로 붙는 Back은 `cancel`이다.
- menu가 만드는 `screen.rowKinds`는 앞에 information 행 수만큼 `undefined`를 두고, 그 뒤에 스크롤 offset/capacity로 잘라 낸 동작 kind를 붙인다.
- `renderBody`가 body를 반환하면 `rowTones`와 같은 방식으로 menu의 `rowKinds`를 버리고 `body.rowKinds`를 쓴다. body에 `rowKinds`가 없으면 kind도 없다.
- 아래 표에서 `renderBody`를 쓰는 화면은 잘라 낸 행(`rows.slice(offset, …)`)에 맞춘 `rowKinds`를 반환해야 한다. guard 모드(`viewportGuard`, Configure guard)는 kind를 반환하지 않는다.

| 화면 | 위치 | 동작 행 → kind | 빈 줄 |
|---|---|---|---|
| 공통 menu `backRow:true` | `app.mjs:17` | Back → cancel | 규칙대로 |
| text 입력 | `app.mjs:37` rows `[value,'','Save','Back','']` | Save → confirm, Back → cancel | 없음(앞이 빈 행) |
| Active dispatches | `app.mjs:98` | Force finish and retry → confirm, Back → cancel | info 블록이 있으면 없음 |
| Uninstall 목록 | `app.mjs:117` | Back → cancel. 플랫폼 행과 `Everything (incl. CLI)`는 일반 행 | 규칙대로 |
| Uninstall 확인 | `app.mjs:120` | Remove → danger, Back → cancel | 없음(info 뒤가 빈 행) |
| Status | `app.mjs:135` | Upgrade(조건부) → confirm, Back → cancel | info 블록이 있으면 없음 |
| Home | `app.mjs:11,125` | 없음. `Exit`는 기본색(D4) | 없음 |
| Settings | `setup.mjs:54,57` (renderBody) | Back(rows에 직접 포함) → cancel | 규칙대로 |
| Hosts | `setup.mjs:89` | Done → confirm, Back → cancel | 규칙대로 |
| Configure | `setup.mjs:152-162` (renderBody) | `Apply - …` → confirm, Back → cancel. Hosts·Settings 행은 일반 행 | 규칙대로(공간이 부족하거나 position이 있으면 생략) |
| Switch 확인 | `setup.mjs:183` | Continue → confirm, Back → cancel | 없음(info 뒤가 빈 행) |
| Model | `custom-preset.mjs:93,107`, compact `:53` | Back → cancel | 규칙대로 |
| Effort | `custom-preset.mjs:124` (compact `:53`) | Back → cancel | 규칙대로 |
| Platform | `custom-preset.mjs:141,144` | Back → cancel | 규칙대로 |
| editRole | `custom-preset.mjs:207,215,221` | Done → confirm, Back → cancel | 규칙대로 |

`setup.mjs:156`의 `footerRows`는 full/compact diagram을 고르는 데만 쓰인다. 빈 줄은 3.2의 조건 5에 따라 공간이 남을 때만 들어가므로 `footerRows`와 capacity 식(`setup.mjs:161`)은 바꾸지 않는다.

## 4. R2/R3 카탈로그 계약

### 4.1 `lib/models/codex-models.json` 최종 목록

최종 목록은 64쌍이며, 파일 순서가 곧 메뉴 순서다. 현재 46쌍에 6.2 모델 12쌍과 기존 모델의 `ultra` 6쌍을 더한 값이다. 모델마다 effort 순서는 `none`(있으면) → `low` → `medium` → `high` → `xhigh` → `max` → `ultra`(있으면)이다.

| 순서 | model | effort | 쌍 수 | 변경 |
|---|---|---|---|---|
| 1 | `gpt-6.2-astra` | low, medium, high, xhigh, max, ultra | 6 | 신규 |
| 2 | `gpt-6.2-sol` | low, medium, high, xhigh, max, ultra | 6 | 신규 |
| 3 | `gpt-6-astra` | low, medium, high, xhigh, max, ultra | 6 | ultra 추가 |
| 4 | `gpt-6.1-sol` | low, medium, high, xhigh, max, ultra | 6 | ultra 추가 |
| 5 | `gpt-6.1-terra` | none, low, medium, high, xhigh, max, ultra | 7 | ultra 추가 |
| 6 | `gpt-6-sol` | none, low, medium, high, xhigh, max, ultra | 7 | ultra 추가 |
| 7 | `gpt-6-luna` | none, low, medium, high, xhigh, max | 6 | 불변 |
| 8 | `gpt-5.6-sol` | none, low, medium, high, xhigh, max, ultra | 7 | ultra 추가 |
| 9 | `gpt-5.6-terra` | none, low, medium, high, xhigh, max, ultra | 7 | ultra 추가 |
| 10 | `gpt-5.6-luna` | none, low, medium, high, xhigh, max | 6 | 불변 |

- 6.2 모델에는 `none`이 없다. 공식 페이지에 "API rejects reasoning effort `none`"이라고 되어 있다.
- 기존 쌍의 값과 상대 순서, JSON 형식(2칸 들여쓰기, `{platform, pairs}`)은 바꾸지 않는다.

### 4.2 영향

- `pairs[0]`이 `gpt-6-astra/low`에서 `gpt-6.2-astra/low`로 바뀐다.
  - 카탈로그를 동적으로 읽는 곳은 `tests/node/fixtures/install-mode.mjs:31`, `tests/node/gemini-composite.test.mjs:44`, `tests/node/grok-composite.test.mjs:44`, `tests/node/install-mode-models-upgrade.test.mjs:33`, `custom-preset.mjs:173`(플랫폼 전환 기본값 fallback)이다.
  - 리터럴 `gpt-6-astra/low`를 쓰는 테스트(`management-operations.test.mjs:58,66,87`, `tui-setup.test.mjs:58`)는 이 쌍이 남아 있으므로 계속 유효하다.
- 검증 경로: `ultra`는 아래 어느 검증에도 걸리지 않는다.
  - Codex `validatePair`(`platform-registry.mjs:91`)는 비어 있지 않은 텍스트인지만 확인하므로 `ultra`를 통과시킨다.
  - `static-catalog.mjs`는 중복과 key만 검사한다.
  - 생성기 `codex/skill/scripts/model_config.py:298`의 `_validated_string`은 문자열인지만 검사한다.
  - `codex-catalog.mjs`(discovery)에는 effort 허용 목록이 없다.
- `tests/test_codex_models.py`는 `codex-models.json`을 읽지 않는다. 이 테스트는 프리셋과 fixture TOML만 다룬다.
- `MANIFEST.sha256:116`의 `lib/models/codex-models.json` 해시를 갱신한다.
- README와 운영 문서에는 Codex 모델 목록이 없으므로 문서는 갱신하지 않는다.

### 4.3 근거와 근거 수준

| 항목 | 근거 | 수준 |
|---|---|---|
| `gpt-6.2-astra`, `gpt-6.2-sol` 존재와 `none` 거부 | 공식 모델 페이지 https://developers.openai.com/api/docs/models/gpt-6.2-astra , https://developers.openai.com/api/docs/models/gpt-6.2-sol . 출시일 2026-11-17(https://github.blog/changelog/2026-11-17-openais-gpt-6-2-astra-and-gpt-6-2-sol-now-available/) | 공식 API 사양. 카탈로그 명세와 같은 수준 |
| 6.2의 effort 목록, 기존 모델의 `ultra` | Codex CLI 0.170.0의 `~/.codex/models_cache.json`(fetched 2026-11-18, OpenAI 서버가 제공한 `supported_reasoning_levels`) | 공식 API 사양 문서가 **아니다**. 카탈로그 명세의 기준(공식 API 사양)보다 근거 수준이 낮으며, 사용자 결정(R3, D6)으로 채택했다 |

이 근거 수준 차이는 이 명세에만 기록하고 카탈로그 명세는 수정하지 않는다. cache에는 어느 모델에도 `none`이 없지만, 기존 `none` 쌍은 D3에 따라 유지한다.

## 5. R4 watch 반짝임 수치 계약

### 5.1 현재 동작

- watch는 `blockEnabled`일 때 100ms마다 tick을 1씩 올린다(`lib/watch/index.mjs:164,177`).
- `shimmerText`(`status-line.mjs:17`)는 `shimmerIntensity`(`palette.mjs:4`)를 쓴다.
  - 이 함수의 주기는 36 tick(3.6초)이다.
  - tick 0–17 동안 c가 -4에서 29.5까지 움직인다. 약 1.97칸/tick, 반경 3이며 24칸 wordmark를 기준으로 만든 값이다.
  - tick 18–35는 휴지다.
- 그래서 8칸인 `working…`은 3.6초 중 약 0.7초(tick 1–7)만 빛난다.

### 5.2 새 계약(watch 전용, `lib/watch/status-line.mjs`)

| 상수 | 값 |
|---|---|
| tick 간격 | 100ms(불변) |
| 주기 `PERIOD` | 18 tick(1.8초) |
| sweep `SWEEP` | 13 tick(f = 0..12) |
| 휴지 | 5 tick(f = 13..17, 강도 0) |
| 속도 | 1칸/tick(10칸/초) |
| 반경 `R` | 2.5칸 |

- `f = tick mod 18`로 둔다. `f ≥ 13`이면 강도는 0이다. 그 밖에는 `c = -R + f`이고, 글자 i의 강도는 `max(0, 1 - |i - c| / R)^2`이다(현재 함수와 같은 모양).
- R은 글자 수 기반 경로에서 유도한 값이다. `working…`(len 8)의 경로는 c = -R에서 len-1+R까지다. 이 경로를 1칸/tick으로 13 위치(12스텝)에 맞추면 7 + 2R = 12이므로 R = 2.5다.
- 결과적으로 tick 1–11 동안(1.1초) 빛나고, 1.8초마다 반복한다.
- 새 함수는 `shimmerText`만 쓴다. `palette.mjs`, `render.mjs`, `tests/node/tui-render.test.mjs:132,134`에는 diff가 없어야 한다.

### 5.3 테스트 영향

- `tests/node/watch-status-line.test.mjs:61`: `shimmerText('w',0)`은 `158` 그대로다.
- `:62`: `shimmerText('w',2)`는 `231`에서 `195`로 바뀐다(c = -0.5, 강도 0.64). Orchestrator가 palette 함수로 계산해 확인했다.
- `tests/node/watch-cli.test.mjs:434-443`(tick 5와 15 비교): tick 5는 빛나는 구간이고 tick 15는 휴지이므로 `notEqual`이 계속 성립한다. 수정이 필요 없을 것으로 본다.
- 다른 watch 테스트에는 tick별 색 단언이 없다.

## 6. 수용 기준

카탈로그
- AC-C1: `codex-models.json`의 `pairs`가 4.1 표와 순서까지 정확히 같다. 64쌍, 중복 없음, `platform: "codex"`.
- AC-C2: 기존 46쌍이 모두 남아 있고 서로의 상대 순서도 같다. `none` 쌍 5개도 유지된다.
- AC-C3: `loadStaticModelCatalog('codex')`가 성공하고, 모든 `ultra` 쌍이 Codex `validatePair`를 통과한다.
- AC-C4: `codex/skill/models.toml`, Claude effort 열거 4곳, `shared/skill/runtime/`, 2026-11-09 spec에 diff가 없다.
- AC-C5: `MANIFEST.sha256`을 갱신했고 `npm run check:manifest`가 통과한다.

watch
- AC-W1: `shimmerText('w',0)`은 `158`, `shimmerText('w',2)`는 `195`다.
- AC-W2: 모든 tick t에서 `shimmerText(x, t) === shimmerText(x, t+18)`이다.
- AC-W3: tick 13–17과 tick 0, 12에서는 `working…`의 모든 글자가 기본 gradient 색(강도 0)이다. tick 1–11에서는 적어도 한 글자가 기본색과 다르다.
- AC-W4: `palette.mjs`, `lib/tui/**`, `tests/node/tui-render.test.mjs`에 diff가 없다.

UI
- AC-U1: `rowKinds`가 없는 screen을 `renderScreen`으로 그린 결과가 변경 전과 같다. 기존 `tui-render` 테스트가 수정 없이 통과해야 한다.
- AC-U2: 3.4 표의 모든 화면이 표에 적힌 kind를 `screen.rowKinds`로 전달한다. Home에는 kind가 없다.
- AC-U3: 빈 줄은 3.2의 조건 1–5를 모두 만족할 때만 정확히 1개 들어가고, 동작 행 사이에는 들어가지 않는다. 다음 경우를 각각 단위 테스트로 확인한다.
  - 빈 줄이 들어가는 경우
  - 앞 행이 이미 빈 행인 경우
  - position이 있는 경우
  - 공간이 부족한 경우
- AC-U4: 빈 줄이 들어가도 `screen.rows`, `selected`, 메뉴 반환값, 위/아래 이동 결과, `selectionEnabled`가 변경 전과 같다. 선택 막대는 선택된 라벨 줄에 그려진다.
- AC-U5: 선택되지 않은 동작 행이 3.3의 role과 색으로 칠해진다. 16색에서는 `BASIC` 코드를 쓰고, depth `none`에서는 escape 없이 빈 줄만 들어간다. 선택된 동작 행은 `selected` 스타일이다.
- AC-U6: 좁은 화면(16행 이하), 스크롤(position 표시), Configure의 compact/guard 모드에서도 Back과 선택 가능한 행이 모두 보이고 잘리지 않는다.
- AC-U7: PTY 테스트(`tests/node/tui-app-pty.test.mjs`, `expect -exact {> Back}`, `moves(n)`)가 기존 키 시퀀스 그대로 통과한다.

## 7. 검증 방법

- 집중 검사:
  - T1: `node --test tests/node/model-catalog.test.mjs tests/node/models.test.mjs tests/node/tui-custom-preset.test.mjs tests/node/tui-setup.test.mjs tests/node/platform-registry.test.mjs`, `npm run check:manifest`
  - T2: `node --test tests/node/watch-status-line.test.mjs tests/node/watch-cli.test.mjs tests/node/tui-render.test.mjs`
  - T3: `node --test tests/node/tui-*.test.mjs`
  - `tests/test_codex_models.py`는 카탈로그와 무관하므로 회귀 확인용으로만 실행한다.
- PATH 격리: PTY/CLI 테스트는 fixture PATH(`installFakeCli`, `writeFakeGrokCli`)만 쓰고, 실제 `grok`·`codex`·`claude`는 실행하지 않는다. 전체 `npm test`는 PATH 맨 앞에 sentinel을 두고 Orchestrator가 호스트에서 실행하며, sentinel log가 없어야 한다.
- 기준선 비교: `npm test` 실패 목록을 테스트 이름 기준으로 `/Users/yunho/Desktop/project/arc/.git/arc/handoff/grok-capability-promotion/env-baseline.txt`(plan 2026-11-18 부록 B 35건 + 환경 17건)와 비교한다. 신규 실패는 0이어야 한다.
- T3 QA: 다음 조합에서 실제 렌더 프레임을 확인한다.
  - 화면 크기: 80×24, 80×16, 40×16 이하
  - 색 depth: `truecolor`, `16`, `none`(`NO_COLOR=1`)
  - Configure: full, compact, guard 모드와 스크롤 상태
- 최종: 전체 변경에 대해 Reviewer가 한 번 검토한다.

## 8. 위험과 확인 결과

| 항목 | 결과 |
|---|---|
| `tests/test_codex_models.py`의 카탈로그 의존 | 해소. `codex-models.json`을 읽지 않는다(4.2) |
| watch 테스트의 tick 의존 | 해소. `watch-cli.test.mjs:434-443`의 tick 5와 15는 새 계약에서도 서로 다르다. 색 단언은 `watch-status-line.test.mjs:61-62`뿐이다(5.3) |
| `setup.mjs:156` `footerRows` | 해소. 빈 줄은 공간이 있을 때만 들어가므로 바꾸지 않는다(3.4) |
| 화면 줄 인덱스를 단언하는 TUI 테스트 | `tui-render` 단위 테스트는 `rowKinds`를 주지 않으므로 영향이 없다(AC-U1). menu를 거치는 `tui-app`/`tui-setup`/`tui-custom-preset` 테스트 중 렌더 텍스트의 줄 위치를 단언하는 테스트는 빈 줄 때문에 한 줄 밀릴 수 있다. 원인이 빈 줄인 경우에만 기대값을 고치며, 정확한 목록은 구현 단계에서 확정한다. `screen.rows`를 단언하는 테스트(`tui-app.test.mjs:56,118,139`)는 영향이 없다 |
| `pairs[0]` 변경 | 동적으로 읽는 테스트는 자기 일관성을 유지한다. 플랫폼 전환 시 fallback 기본값이 `gpt-6.2-astra/low`가 되는 것은 의도한 결과다 |
| `ultra` 근거 수준 | CLI cache는 공식 API 사양보다 근거 수준이 낮다. 사용자 결정으로 채택했고 4.3에 기록했다 |
