# TUI 동작 행 구분, Codex GPT-6.2·`ultra` 카탈로그, watch 반짝임 구현 계획

> **실행 방식:** ARC Orchestrator가 작업마다 새 bridge Implementer를 배정한다. 각 작업의 `allowedPaths`는 그 작업 **Files** 목록 전체다. 이 값은 prepare 시점에 고정되며 나중에 늘릴 수 없다. 검증과 수용은 다음 순서로 진행한다.
> - T1·T2는 focused checks, T3는 새 QA(필수)를 거친 뒤 Orchestrator가 수용한다.
> - 수용된 작업 하나당 커밋 하나를 Orchestrator가 만든다. Implementer와 QA는 Git 상태를 바꾸지 않는다.
> - 모든 작업이 수용되면 Reviewer가 전체 변경을 1회 검토한다(FR).

**Goal:** 이번 계획의 목표는 세 가지다.
- Codex 정적 카탈로그에 GPT-6.2 두 모델과 `ultra` effort를 추가한다(R2/R3).
- `arc watch`의 `working…` 반짝임 주기와 속도를 조정한다(R4).
- 모든 TUI 화면에서 동작 행을 역할별 색과 앞 빈 줄로 일반 메뉴와 구분한다(R1).

**Architecture:**
- R2/R3는 데이터 파일 `lib/models/codex-models.json`과 manifest만 바꾼다.
- R4는 `lib/watch/status-line.mjs` 안에 watch 전용 강도 함수를 둔다. `palette.mjs`와 TUI는 건드리지 않는다.
- R1은 screen에 `rowKinds`를 추가한다. 빈 줄 삽입과 색 칠하기는 `renderScreen`에서만 하므로 `screen.rows`, 선택 인덱스, 반환값, 키 이동은 그대로다.

**Tech Stack:** Node.js ≥22 ESM(`.mjs`), `node:test`, `node:assert/strict`, Python `unittest`(회귀 확인), PTY 헬퍼(`expect`)

**Spec:** `docs/superpowers/specs/2026-11-19-tui-action-buttons-gpt62-design.md`(written spec 사용자 승인 2026-11-19, 결정 D1–D8)

**기준:** `/Users/yunho/Desktop/project/arc`, 브랜치 `feat/grok-support`, 시작 HEAD `d013cf0`. 사용자가 실행 대상으로 현재 checkout을 선택했다. 테스트 기준선은 `.git/arc/handoff/grok-capability-promotion/env-baseline.txt`다(2026-11-18 plan 부록 B 35건 + 이 PC 환경 17건).

## Global Constraints

- **카탈로그(spec 4.1과 정확히 일치):** 64쌍이며 파일 순서가 곧 메뉴 순서다.
  - `gpt-6.2-astra`, `gpt-6.2-sol`: `low, medium, high, xhigh, max, ultra`
  - `gpt-6-astra`, `gpt-6.1-sol`: `low…max, ultra`
  - `gpt-6.1-terra`, `gpt-6-sol`: `none, low…max, ultra`
  - `gpt-6-luna`: `none, low…max`(변경 없음)
  - `gpt-5.6-sol`, `gpt-5.6-terra`: `none, low…max, ultra`
  - `gpt-5.6-luna`: `none, low…max`(변경 없음)
  - 형식은 `{platform, pairs}`, 2칸 들여쓰기다. 기존 46쌍의 값과 상대 순서는 바꾸지 않는다.
- **watch 반짝임(spec 5.2와 정확히 일치):**
  - 상수는 `PERIOD=18`, `SWEEP=13`, `R=2.5`이고 `f = tick mod 18`이다.
  - `f ≥ 13`이면 강도는 0이다. 그 밖에는 `c=-R+f`로 두고 강도를 `max(0, 1-|i-c|/R)^2`로 계산한다.
  - tick 간격 100ms(`lib/watch/index.mjs`)는 바꾸지 않는다.
- **UI(spec 3.2–3.4와 정확히 일치):**
  - `rowKinds` 값은 `'confirm' | 'cancel' | 'danger' | undefined` 중 하나다.
  - 색은 다음과 같다.

    | role | fg | 굵게 | `BASIC` |
    |---|---|---|---|
    | `actionConfirm` | `[52,211,153]` | 예 | `'1;32'` |
    | `actionCancel` | `[150,170,160]` | 아니요 | `'2'` |
    | `actionDanger` | `[248,113,113]` | 아니요 | `'31'` |

  - 우선순위는 `selected` > `rowKinds` > `rowTones`다.
  - depth `none`에서는 빈 줄만 쓰고 텍스트 표식은 붙이지 않는다(D2).
  - Home의 `Exit`는 동작 행이 아니다(D4).
- **바꾸지 않는 것(spec 2 비범위):**
  - `codex/skill/models.toml`과 프리셋 테스트 기대값
  - `lib/color/palette.mjs`, TUI wordmark 애니메이션, `frameMs`
  - Claude effort 열거 4곳: `lib/runtime/platform-registry.mjs`, `shared/skill/runtime/platform-registry.mjs`, `lib/models/profiles.mjs`, `lib/models/catalog-anthropic.mjs`
  - `docs/superpowers/specs/2026-11-09-static-model-catalog-design.md`
  - 화면 텍스트, 행 라벨, hint, 키 바인딩
  - capacity 식(`app.mjs:27`, `custom-preset.mjs:47,100,145,219`, `setup.mjs:161`)과 `setup.mjs:156`의 `footerRows`
- **Files 밖 변경 금지:** Files 밖 파일에서 테스트가 실패하면 Implementer는 고치지 않고 반환한다. allowedPaths는 늘릴 수 없으므로 작업 교체 여부는 Orchestrator가 판단하고 진행 기록에 남긴다.
- **TDD:** 각 작업은 실패하는 테스트를 먼저 쓰고 RED를 확인한 다음 구현한다.
- **실행 환경 제약:** bridge 환경에서는 127.0.0.1 listen이 막혀 있고 `fs.watch`가 EMFILE을 낼 수 있다. 그래서 다음 검증은 **Orchestrator 호스트**에서 한다.
  - PTY 테스트(`tui-app-pty`, `tui-terminal-pty`)
  - npm/pack fixture 테스트(`tui-package-consumer`)
  - watch CLI 테스트(`watch-cli`)
  - sentinel PATH를 둔 전체 `npm test`

  Implementer와 QA는 in-process 테스트만 실행하고, 위 항목은 "호스트 필요"로 보고한다.
- **실행 금지:** Implementer와 QA는 live `codex`·`claude`·`grok`을 실행하지 않는다. 네트워크와 실제 home 설치도 쓰지 않는다.
- **과거 문서:** `docs/superpowers/{specs,plans}/**`의 과거 문서는 수정하지 않는다. 이 plan의 진행 기록 갱신만 예외다.
- **커밋:** 수용 후 Orchestrator가 `type(scope): 한국어 설명` 형식으로 만든다.
  - 이 spec과 plan(v1)은 Implementer 배정 전에 문서 커밋 하나로 먼저 커밋한다(ARC planning-document commit). 이후 plan 진행 기록·개정은 해당 작업 커밋에 포함한다.
  - 각 작업 커밋에는 그 작업의 진행 기록 행 갱신을 포함한다.

### PATH 격리

- in-process 테스트가 운영 registry를 호출할 때는 context `env`를 명시한다(`compositeContext` 또는 `{PATH: <fixture bin>}`).
- 자식 프로세스 테스트(PTY, CLI)는 spawn env를 `{...process.env, PATH: <fixture PATH>}`로 넘긴다. fake CLI는 `installFakeCli`와 `writeFakeGrokCli`로만 만든다.
- **sentinel(Orchestrator, 호스트):**
  - sentinel 디렉터리에 다음 `grok` 스크립트를 둔다: `printf '%s\n' "$PWD $*" >> <절대 sentinel log>; exit 1`
  - 이 디렉터리를 PATH 맨 앞에 두고 `npm test`를 실행한다. 실행 후 sentinel log가 없어야 한다.
  - 2026-11-18 plan과 같은 범위로 유지한다(PD-3).

### 표준 마무리 절차 (STD-CLOSE)

1. `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest`가 PASS여야 한다. 이 작업이 바꾼 해시 대상 파일의 행만 바뀌어야 한다.
2. 작업 집중 테스트(`node --test <작업 테스트 파일>`)가 PASS여야 한다. bridge에서 실행할 수 없는 파일은 호스트 결과로 판정한다.
3. 호스트 sentinel `npm test`에서 기준선(35+17) 밖의 신규 실패가 0건이어야 한다(판정 방법은 "검증 판정" 절).
4. `git status --short`에는 작업 Files와 Orchestrator 소유 문서(이 plan의 진행 기록)만 보여야 한다.
5. 기존 테스트를 고친 경우, Orchestrator가 수정한 파일마다 HEAD보다 `assert` 호출 수가 줄지 않았는지 확인한다. 고친 단언과 원인(빈 줄)은 진행 기록에 남긴다.

## Review Focus

1. **좁은 화면(16행 이하, info와 notice가 많은 화면)에서 Back이 잘리는지:** 빈 줄 때문에 Back이 밀려 사라지면 안 된다. 조건 5가 이를 막아야 한다. 확인 테스트: T3 `blank line is skipped when it would overflow rows`.
2. **스크롤 중인 목록(Model·Effort, position 표시):** 빈 줄이 없어야 하고, 선택 막대와 position 줄 위치가 정확해야 한다. 확인 테스트: T3 `blank line is skipped when position is shown`.
3. **선택된 동작 행:** kind 색이 아니라 `selected` 막대로 칠해져야 하고, 막대는 밀려난 라벨 줄에 그려져야 한다. 확인 테스트: T3 `selected action row uses the selected bar on the shifted line`.
4. **rowTones와 rowKinds가 함께 있는 화면(Status: info tone + Upgrade/Back):** 빈 줄 때문에 tone span 인덱스가 어긋나면 안 된다. 확인 테스트: T3 `rowTones stay aligned after an inserted blank line`.
5. **`NO_COLOR`/`TERM=dumb`:** escape 없이 빈 줄만 있어야 한다. 확인 테스트: T3 `depth none renders no escapes and keeps the blank line`.

## 사전 조건 (Orchestrator)

- **P0-a 기준선:** HEAD `d013cf0`에서 호스트 sentinel `npm test`를 실행해 실패 목록을 테스트 이름 단위로 `env-baseline.txt`(35+17)와 대조하고, 결과를 진행 기록에 남긴다. 같은 트리에서 직전 plan의 FR 실행 결과(2774/2708/53+cancelled 1, 신규 0)를 Orchestrator가 확인했다면 그 결과를 그대로 써도 된다(PD-4).
- **P0-b:** spec·plan v1 문서 커밋이 완료되고 `git status --short`가 비어 있어야 한다.

---

## 의존성과 실행 순서

| 작업 | 제목 | 선행 |
|---|---|---|
| T1 | Codex 카탈로그 GPT-6.2·`ultra`(R2/R3) | P0-a, P0-b |
| T2 | watch `working…` 반짝임(R4) | P0-a(T1과 논리적으로 독립) |
| T3 | TUI 동작 행 구분(R1) | P0-a(T1·T2와 논리적으로 독립) |
| FR | 최종 독립 Reviewer 1회 | T1–T3 수용, T3 QA와 재확인 완료 |

**실행은 직렬로 한다(T1 → T2 → T3 → FR).** 세 작업 모두 `MANIFEST.sha256`을 고치기 때문이다(T1은 codex-models.json, T2는 status-line.mjs, T3는 lib/tui 5개 파일의 행). 코드상 의존은 없다.

**hold 범위:**
- T1이 실패해도 T2·T3는 논리적으로 독립이다. Orchestrator가 manifest 기준(HEAD)을 확인한 뒤 해제할 수 있다. FR은 hold한다.
- T2가 실패한 경우도 같은 방식으로 T3를 해제할 수 있다. FR은 hold한다.
- T3가 실패하면 FR을 hold한다.
- 필수 검사가 미해결인 작업은 수용을 보류한다.

**QA:** T1·T2는 아래 필수 확인 항목으로 focused checks만 한다. T3는 새 QA가 필수다. Reviewer는 작업마다 두지 않고 FR에서 한 번만 둔다.

---

### Task T1: Codex 카탈로그 GPT-6.2·`ultra` (R2/R3)

**목표:** spec 4.1의 64쌍 카탈로그를 출하하고 manifest를 갱신한다.

**Files(allowedPaths, 이 목록이 전부):**
- Modify: `lib/models/codex-models.json`
- Modify: `MANIFEST.sha256`
- Test: `tests/node/models.test.mjs`

**선행:** P0-a, P0-b

- [ ] **Step 1: 실패 테스트 작성** — `tests/node/models.test.mjs`에 다음 세 테스트를 추가한다.
  - `codex static catalog matches the GPT-6.2 and ultra contract`
    - `loadStaticModelCatalog('codex')`가 성공해야 한다.
    - `catalog.platform === 'codex'`
    - `catalog.pairs`가 아래 기대 목록과 `deepEqual`이어야 한다.
    - 길이는 64이고 `model/effort` 쌍에 중복이 없어야 한다.
  - `codex ultra pairs pass validatePair`
    - `ultra` 쌍 8개 모두에서 `getPlatform('codex').routing.validatePair(model,'ultra')`가 `true`여야 한다. `getPlatform`은 `lib/runtime/platform-registry.mjs`에서 import한다.
  - `existing codex none pairs are kept`
    - `effort==='none'`인 쌍은 정확히 `gpt-6.1-terra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` 6개여야 한다.

  기대 목록은 테스트 안에서 다음처럼 만든다.
  ```js
  const E=['low','medium','high','xhigh','max'],N=['none',...E],U=[...E,'ultra'],NU=[...N,'ultra'];
  const expected=[['gpt-6.2-astra',U],['gpt-6.2-sol',U],['gpt-6-astra',U],['gpt-6.1-sol',U],['gpt-6.1-terra',NU],['gpt-6-sol',NU],['gpt-6-luna',N],['gpt-5.6-sol',NU],['gpt-5.6-terra',NU],['gpt-5.6-luna',N]]
    .flatMap(([model,efforts])=>efforts.map(effort=>({model,effort})));
  ```
- [ ] **Step 2: RED 확인** — `node --test tests/node/models.test.mjs`를 실행한다. 현재 카탈로그는 46쌍이므로 새 contract 테스트는 FAIL, 기존 테스트는 PASS여야 한다.
- [ ] **Step 3: 구현**
  - `codex-models.json`의 맨 앞에 6.2 쌍 12개를 넣는다.
  - D6의 6개 모델마다 마지막 effort 뒤에 `ultra` 쌍 1개를 넣는다.
  - 기존 쌍과 서식은 그대로 둔다.
  - `node scripts/update-manifest.mjs`를 실행한다.
- [ ] **Step 4: GREEN 확인** — 아래 필수 확인 항목이 모두 PASS여야 한다.

**수용 기준:** AC-C1, AC-C2, AC-C3, AC-C4, AC-C5

**필수 확인(Orchestrator가 다시 실행):**
- `node --test tests/node/model-catalog.test.mjs tests/node/models.test.mjs tests/node/tui-custom-preset.test.mjs tests/node/tui-setup.test.mjs tests/node/platform-registry.test.mjs`가 PASS여야 한다.
- 회귀 확인용으로 `python3 -m unittest discover -s tests -p test_codex_models.py`가 PASS여야 한다.
- `npm run check:manifest`가 PASS여야 한다. `git diff -- MANIFEST.sha256`에서는 `lib/models/codex-models.json` 행 하나만 바뀌어야 한다.
- AC-C2: `git show d013cf0:lib/models/codex-models.json`의 46쌍이 새 `pairs`의 부분열(상대 순서 유지)인지 Orchestrator가 node 한 줄 스크립트로 확인한다.
- AC-C4: 다음 명령의 결과가 비어 있어야 한다.
  ```
  git diff --stat d013cf0 -- codex/skill/models.toml lib/runtime/platform-registry.mjs shared/skill/runtime lib/models/profiles.mjs lib/models/catalog-anthropic.mjs docs/superpowers/specs/2026-11-09-static-model-catalog-design.md
  ```
- 동적으로 `pairs[0]`을 쓰는 곳(`tests/node/fixtures/install-mode.mjs:31`, `gemini-composite`, `grok-composite`, `install-mode-models-upgrade`)에서는 호스트 `npm test`의 기준선 밖 신규 실패가 0건이어야 한다.
- STD-CLOSE 1–5

**QA:** 위 목록으로 focused checks만 한다. 새 QA는 배정하지 않는다.

**hold 조건:**
- Files 밖 테스트가 카탈로그 길이나 순서 때문에 실패하면 hold하고 보고한다. allowedPaths는 늘릴 수 없다.
- `validatePair`가 `ultra`를 거부하면 spec 4.2의 전제가 깨진 것이므로 hold한다.

**커밋(수용 후, Orchestrator):** T1 Files + 진행 기록을 한 커밋에 넣는다.
메시지: `feat(models): Codex 카탈로그에 GPT-6.2 두 모델과 ultra effort 추가`

---

### Task T2: watch `working…` 반짝임 (R4)

**목표:** `shimmerText`가 watch 전용 18 tick 주기 함수를 쓰도록 바꾼다.

**Files(allowedPaths, 이 목록이 전부):**
- Modify: `lib/watch/status-line.mjs`
- Modify: `MANIFEST.sha256`
- Test: `tests/node/watch-status-line.test.mjs`

**선행:** P0-a. 직렬 순서상 T1 커밋 뒤에 시작한다.

**Interfaces:**
- 새로 만드는 것: 비공개 함수 `watchShimmerIntensity(index: number, tick: number): number`. `status-line.mjs` 모듈 내부에 두고 export하지 않는다.
- `shimmerText(text, tick)`의 시그니처와 반환 형식(글자마다 `\x1b[38;5;Nm` 뒤에 글자, 끝에 `\x1b[0m`)은 그대로 둔다.
- `shimmerIntensity` import는 제거한다.

- [ ] **Step 1: 실패 테스트 작성** — `tests/node/watch-status-line.test.mjs`
  - 62행의 기대값 `231`을 `195`로 바꾼다. 원인은 spec 5.3의 계약 변경이다.
  - `watch shimmer repeats every 18 ticks` 테스트를 추가한다.
    - `t=0..40`의 모든 t에서 `shimmerText('working…',t) === shimmerText('working…',t+18)`이어야 한다.
    - `shimmerText('w',t)`에서도 같은 관계가 성립해야 한다.
  - `watch shimmer rests on ticks 0, 12 and 13–17 and lights ticks 1–11` 테스트를 추가한다.
    - tick 15의 결과를 기준 문자열 `base`로 둔다.
    - tick 0, 12, 13–17에서는 `shimmerText('working…',t) === base`여야 한다.
    - tick 1–11에서는 `shimmerText('working…',t) !== base`여야 한다.
    - 휴지 상태의 기준이 기본 gradient임을 고정하기 위해, 각 글자의 `38;5;N`이 `toAnsi256(gradientAt(i/7))`와 같은지도 단언한다. 두 함수는 `palette.mjs`에서 import한다.
- [ ] **Step 2: RED 확인** — `node --test tests/node/watch-status-line.test.mjs`를 실행한다. 62행과 새 테스트 2개가 FAIL이어야 한다.
- [ ] **Step 3: 구현**
  - 모듈 상수 `PERIOD=18`, `SWEEP=13`, `R=2.5`를 둔다.
  - `watchShimmerIntensity`는 Global Constraints의 식대로 구현한다.
  - `shimmerText`가 `shimmerIntensity(i,0,tick)` 대신 이 함수를 호출하도록 바꾼다.
  - `node scripts/update-manifest.mjs`를 실행한다.
- [ ] **Step 4: GREEN 확인**

**수용 기준:** AC-W1, AC-W2, AC-W3, AC-W4

**필수 확인:**
- `node --test tests/node/watch-status-line.test.mjs tests/node/tui-render.test.mjs`가 PASS여야 한다. bridge에서 실행할 수 있다.
- 호스트에서 `node --test tests/node/watch-cli.test.mjs`가 PASS여야 한다. 434–443행의 tick 5와 tick 15 `notEqual`이 수정 없이 성립해야 한다.
- AC-W4: T2 작업 트리에서 `git diff --stat HEAD -- lib/color/palette.mjs lib/tui tests/node/tui-render.test.mjs`의 결과가 비어 있어야 한다.
- `npm run check:manifest`가 PASS여야 하고, `MANIFEST.sha256`에서는 `lib/watch/status-line.mjs` 행 하나만 바뀌어야 한다.
- STD-CLOSE 1–5

**QA:** focused checks만 한다. 새 QA는 배정하지 않는다.

**hold 조건:**
- `watch-cli.test.mjs`나 Files 밖의 watch 테스트가 tick 의존 때문에 실패하면 hold하고 보고한다.
- 휴지 tick의 결과가 기본 gradient와 다르면 spec 5.2와 어긋나므로 hold한다.

**커밋:** `feat(watch): working… 반짝임을 18 tick 주기와 1칸/tick 속도로 조정`

---

### Task T3: TUI 동작 행 구분 (R1)

**목표:** spec 3.4 표의 모든 화면이 `rowKinds`를 넘기게 한다. `renderScreen`은 동작 행에 색을 칠하고, 조건 1–5를 모두 만족할 때만 빈 줄을 넣는다.

**Files(allowedPaths, 이 목록이 전부):**
- Modify: `lib/tui/render.mjs`
- Modify: `lib/tui/terminal.mjs`
- Modify: `lib/tui/app.mjs`
- Modify: `lib/tui/setup.mjs`
- Modify: `lib/tui/custom-preset.mjs`
- Modify: `MANIFEST.sha256`
- Create(Test): `tests/node/tui-action-rows.test.mjs`
- 아래 테스트 파일은 새 단언 추가와, 빈 줄 때문에 밀린 기대값 수정만 허용한다.
  - Modify(Test): `tests/node/tui-terminal.test.mjs`
  - Modify(Test): `tests/node/tui-app.test.mjs`
  - Modify(Test): `tests/node/tui-setup.test.mjs`. 영향이 확인된 곳: 333행 Hosts의 `Done` 줄 인덱스 `5`와 `[7]===''` 단언
  - Modify(Test): `tests/node/tui-custom-preset.test.mjs`
- Modify(Test, 후보): `tests/node/tui-app-pty.test.mjs`. 키 시퀀스는 바꾸지 않는다.
- 수정 금지(diff 0): `tests/node/tui-render.test.mjs`(AC-U1), `tests/node/tui-terminal-pty.test.mjs`, `tests/node/tui-package-consumer.test.mjs`

**선행:** P0-a. 직렬 순서상 T2 커밋 뒤에 시작한다.

**Interfaces(새로 만드는 것):**
- `renderScreen(screen, {columns, rows})`
  - 선택 입력 `screen.rowKinds?: Array<'confirm'|'cancel'|'danger'|undefined>`를 받는다. 인덱스는 `screen.rows`와 대응한다.
  - 반환 형식 `{text, selectionEnabled, styles}`는 그대로다.
- `terminal.mjs`의 `BASIC`에 `actionConfirm:'1;32'`, `actionCancel:'2'`, `actionDanger:'31'`을 추가한다.
- `menu(title, rows, {..., actionKinds})`
  - `actionKinds`는 `rows`와 인덱스가 대응하는 배열이며, 희소 배열이어도 된다.
  - `backRow:true`일 때 자동으로 붙는 Back은 `'cancel'`이다.
  - `screen.rowKinds`는 `[...information.map(()=>undefined), ...<offset/capacity로 자른 kinds>]`로 만든다.
- `renderBody`가 반환하는 body에는 선택 필드 `rowKinds`를 둘 수 있다.
  - body가 있으면 menu의 `rowKinds`는 버리고 `body.rowKinds`만 쓴다. `rowTones`와 같은 방식이다.
  - guard 모드에서는 kind를 반환하지 않는다.
- `text()`의 screen은 `rowKinds:[undefined,undefined,'confirm','cancel',undefined]`를 갖는다.

**구현 방향:**
- 빈 줄은 `renderScreen` 초입에서 넣는다. `entries`·`selected`·`rowTones`·`rowStatusSpans`·`rowKinds`의 지역 사본을 k 위치에서 함께 한 칸씩 민다. 이렇게 하면 `selectedLine`·`noticeStart`·position·`selectionEnabled`의 기존 계산을 그대로 쓸 수 있다. `screen` 객체는 바꾸지 않는다.
- 조건 5는 "삽입 후 `lines.length <= rows`"로 판정한다.
- kind 칠하기 분기는 `selected` 분기 다음, `rowTones` 분기 앞에 둔다. run 범위는 `add(2, length, role, fg, undefined, bold)`다.

- [ ] **Step 1: 실패 테스트 작성**
  - **render 단위 테스트** — 새 파일 `tests/node/tui-action-rows.test.mjs`(in-process만)
    - `rowKinds absent or all undefined renders byte-identical output`(AC-U1): 같은 screen을 `rowKinds` 없이 한 번, 모두 `undefined`로 한 번 렌더해서 `text`·`styles`·`selectionEnabled`가 `deepEqual`인지 확인한다.
    - `blank line is inserted once before the action group`(AC-U3-a): 일반 행 3개 + confirm·cancel 행 2개를 80×24로 렌더한다. 동작 그룹 바로 앞에 빈 줄이 1개 있어야 하고, confirm과 cancel 사이에는 빈 줄이 없어야 한다.
    - `blank line is skipped when the previous row is blank`(AC-U3-b): text 화면 rows `[v,'','Save','Back','']`의 줄 수가 HEAD 동작과 같아야 한다.
    - `blank line is skipped when position is shown`(AC-U3-c)
    - `blank line is skipped when it would overflow rows`(AC-U3-d, Review Focus 1): rows를 경계값으로 둔다. 빈 줄을 넣으면 정확히 1줄 넘치는 값이다.
    - `selected action row uses the selected bar on the shifted line`(AC-U4, Review Focus 3): `selectionEnabled`가 HEAD와 같아야 하고, `selected` run이 라벨 줄에 있어야 한다.
    - `unselected action rows use action roles`(AC-U5): truecolor의 fg와 bold가 spec 3.3과 정확히 같아야 하고, run은 `from:2`부터 시작해야 한다.
    - `rowTones stay aligned after an inserted blank line`(Review Focus 4): Status 형태(info tone + Upgrade/Back)로 확인한다.
    - `depth none renders no escapes and keeps the blank line`(AC-U5, Review Focus 5): `formatLine(...,'none')` 출력에 `\x1b`가 없어야 한다.
  - **menu 테스트** — 같은 파일. fake session으로 screen을 캡처한다(`tui-app.test.mjs:284` 패턴).
    - `menu backRow marks Back as cancel and offsets kinds by information rows`
    - `menu slices actionKinds with the scroll window`
    - `renderBody rowKinds replace menu kinds`
  - **`tests/node/tui-terminal.test.mjs`** — `BASIC maps action roles` 테스트를 추가한다.
    - depth `16`에서 `actionConfirm`은 `\x1b[0;1;32m…`, `actionCancel`은 `\x1b[0;2m…`, `actionDanger`는 `\x1b[0;31m…`이어야 한다.
    - depth 256에서 RGB 매핑을 확인한다.
  - **AC-U2 화면별 kind 단언** — flow 헬퍼가 이미 있는 파일에 추가한다.
    - `tui-app.test.mjs`:
      - text 입력
      - Active dispatches
      - Uninstall 목록과 확인(Remove=danger)
      - Status(Upgrade가 있을 때와 없을 때)
      - Home은 `rowKinds`가 없거나 모두 `undefined`
    - `tui-setup.test.mjs`:
      - Settings
      - Hosts
      - Configure(full/compact에서 Apply=confirm, Hosts·Settings 행은 undefined, guard는 kind 없음)
      - Switch 확인
    - `tui-custom-preset.test.mjs`:
      - Model(일반/compact)
      - Effort
      - Platform
      - editRole(Done=confirm)
- [ ] **Step 2: RED 확인** — `node --test tests/node/tui-action-rows.test.mjs tests/node/tui-terminal.test.mjs tests/node/tui-app.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-custom-preset.test.mjs`를 실행한다. 새 테스트는 FAIL, 기존 테스트는 PASS여야 한다.
- [ ] **Step 3: 구현**
  - 순서: `terminal.mjs` BASIC → `render.mjs` → `app.mjs`(menu, text, 각 호출부) → `setup.mjs` → `custom-preset.mjs`
  - spec 3.4 표의 각 위치에 `actionKinds` 또는 `body.rowKinds`를 지정한다.
  - capacity 식과 `footerRows`는 바꾸지 않는다.
  - `node scripts/update-manifest.mjs`를 실행한다.
- [ ] **Step 4: 밀린 기대값 정리**
  - 기존 tui 테스트가 빈 줄 때문에만 실패할 때에 한해, 줄 인덱스와 패턴 기대값을 고친다. 확인된 사례는 `tui-setup.test.mjs:333`이다.
  - 고친 단언마다 `파일:행, old → new, 원인=빈 줄` 형식으로 보고한다.
  - 다른 원인으로 실패하면 고치지 않고 반환한다.
  - `tui-app-pty.test.mjs`에서는 기대 패턴만 고칠 수 있다. 키 시퀀스와 `moves(n)`은 바꾸지 않는다(AC-U7).
  - 이 파일은 bridge에서 실행할 수 없다. 수정이 필요해 보이면 근거를 붙여 "호스트 확인 필요"로 반환한다.
- [ ] **Step 5: GREEN 확인**

**수용 기준:** AC-U1, AC-U2, AC-U3, AC-U4, AC-U5, AC-U6, AC-U7

**필수 확인:**
- `node --test tests/node/tui-action-rows.test.mjs tests/node/tui-render.test.mjs tests/node/tui-terminal.test.mjs tests/node/tui-app.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-custom-preset.test.mjs`가 PASS여야 한다. bridge에서 실행할 수 있다.
- 호스트에서 `node --test tests/node/tui-*.test.mjs`가 PASS여야 한다. PTY(`tui-app-pty`, `tui-terminal-pty`)와 `tui-package-consumer`도 포함한다. `tui-package-consumer`가 기준선 실패 목록에 있으면 기준선과 같은 메시지인지로 판정한다.
- AC-U1: `git diff --stat HEAD -- tests/node/tui-render.test.mjs`의 결과가 비어 있어야 한다.
- AC-U7: `git diff HEAD -- tests/node/tui-app-pty.test.mjs`에서 키 시퀀스와 `moves(` 줄에 변경이 없어야 한다.
- `git diff --stat HEAD -- lib/color/palette.mjs lib/watch lib/models codex`의 결과가 비어 있어야 한다.
- capacity 식 5곳과 `setup.mjs:156`의 `footerRows`에 diff가 없어야 한다. Orchestrator가 hunk를 직접 확인한다.
- `npm run check:manifest`가 PASS여야 하고, `MANIFEST.sha256`에서는 lib/tui 5개 파일의 행만 바뀌어야 한다.
- STD-CLOSE 1–5(호스트 sentinel `npm test` 포함)

**QA(새 QA, 필수):** in-process로 `renderScreen` + `formatLine`을 써서 실제 렌더 프레임을 확인한다.
- 조합: 화면 크기 80×24, 80×16, 40×16 이하 × depth `truecolor`, `16`, `none`
- 대상 화면:
  - Configure(full, compact, guard, 스크롤 상태)
  - Model·Effort 스크롤
  - Status(Upgrade가 있을 때와 없을 때)
  - Uninstall 확인
  - text 입력
  - Hosts
- 각 프레임에서 확인할 것:
  - 빈 줄이 있는지, 있다면 위치가 맞는지(조건 1–5)
  - Back과 선택 가능한 행이 모두 보이고 잘리지 않는지(AC-U6)
  - 선택 막대 위치
  - role과 escape 코드
  - depth `none`에서 escape가 없는지
- 이 프레임 확인은 bridge에서 할 수 있다. PTY 확인은 Orchestrator 호스트 결과를 증거로 쓴다.
- QA 지적은 Implementer가 고치고 QA가 다시 확인한다.

**hold 조건:**
- 빈 줄이 아닌 다른 원인으로 기존 tui 테스트가 실패하면 hold한다.
- Files 밖 파일(예: `lib/tui/diagram.mjs`, `mode.mjs`)을 바꿔야 하면 hold한다. allowedPaths는 늘릴 수 없으므로 Orchestrator가 작업 교체를 판단한다.
- capacity 식이나 `footerRows`를 바꿔야 한다는 결론이 나면 spec 3.2·3.4와 어긋나므로 hold하고 보고한다.
- PTY 키 시퀀스를 바꿔야 하면 hold한다.

**커밋:** `feat(tui): 동작 행을 역할별 색과 앞 빈 줄로 일반 메뉴와 구분`

---

### Task FR: 최종 독립 Reviewer 1회

- **선행:** T1–T3의 수용과 커밋, T3 QA와 재확인 완료
- **대상:** `d013cf0..HEAD`의 전체 변경(spec·plan 문서 커밋 포함)과 이 plan의 진행 기록
- **위험 기반 점검:**
  - 카탈로그:
    - 64쌍의 순서
    - 기존 46쌍이 부분열로 남아 있는지
    - `none` 6쌍 유지
    - `pairs[0]` 변경이 플랫폼 전환 fallback(`custom-preset.mjs:173`)에 주는 영향(의도된 동작)
  - `ultra` 근거 수준을 spec 4.3에만 기록했는지, 카탈로그 명세에는 diff가 없는지
  - watch 함수의 경계(tick 0, 12, 13, 17, 18), `palette.mjs`와 TUI wordmark에 변경이 없는지
  - `renderScreen`:
    - `rowKinds`가 없을 때 출력이 바이트 단위로 같은지
    - 조건 1–5
    - 인덱스 이동 후 `rowTones`/`rowStatusSpans`/position/notice 정렬
  - 각 화면의 kind가 spec 3.4 표와 맞는지, Home과 guard 모드에는 kind가 없는지
  - 16색과 `none` 출력
  - capacity와 `footerRows`에 변경이 없는지
  - 고친 기존 단언이 모두 빈 줄 때문인지
- **Reviewer 지적:** Implementer가 고치고 Reviewer가 다시 확인한다. QA는 다시 배정하지 않는다. 해결될 때까지 커밋하지 않고, 수용 후 follow-up 커밋 하나(`fix(<scope>): 최종 리뷰 지적 반영 — …`)를 만든다.
- **최종 검사:** 호스트 sentinel `npm test`에서 기준선 밖 신규 실패가 0건이고 sentinel log가 없어야 한다.

---

## AC 추적표

| AC | 작업 | 증거 |
|---|---|---|
| AC-C1 | T1 | `models.test.mjs` contract 테스트 |
| AC-C2 | T1 | contract 테스트(정확 목록), Orchestrator 부분열 확인, `none` 6쌍 테스트 |
| AC-C3 | T1 | `loadStaticModelCatalog` 성공, `ultra` validatePair 테스트 |
| AC-C4 | T1, FR | `git diff --stat d013cf0 -- …` 결과가 비어 있음 |
| AC-C5 | T1 | `npm run check:manifest` |
| AC-W1 | T2 | `watch-status-line.test.mjs:61-62` |
| AC-W2 | T2 | `watch shimmer repeats every 18 ticks` |
| AC-W3 | T2 | `watch shimmer rests … lights ticks 1–11` |
| AC-W4 | T2, FR | T2 작업 트리에서 `git diff --stat HEAD -- lib/color/palette.mjs lib/tui tests/node/tui-render.test.mjs` 결과가 비어 있음. FR에서 `palette.mjs`·`tui-render.test.mjs`를 다시 확인 |
| AC-U1 | T3 | `tui-render.test.mjs`가 수정 없이 PASS, byte-identical 테스트 |
| AC-U2 | T3 | `tui-app`/`tui-setup`/`tui-custom-preset`의 화면별 kind 단언 |
| AC-U3 | T3 | `tui-action-rows`의 4가지 경우, 동작 행 사이에 빈 줄 없음 |
| AC-U4 | T3 | selected bar 테스트, 기존 이동·반환값 테스트가 수정 없이 PASS |
| AC-U5 | T3 | action roles 테스트, `tui-terminal` BASIC 테스트, depth none 테스트 |
| AC-U6 | T3 | overflow·position 테스트, QA 프레임 매트릭스 |
| AC-U7 | T3 | 호스트 `tui-app-pty` PASS, 키 시퀀스 diff 0 |
| 공통 검증(spec 7) | 모든 작업 STD-CLOSE, FR | 호스트 sentinel `npm test` |

## 검증 판정

- 기준선은 `env-baseline.txt`(35+17)와 P0-a 기록이다.
- 신규 실패는 0건이어야 한다.
- 기준선 밖 실패는 파일 단위로 따로 다시 실행한다.
  - 따로 실행해서 통과하면 부하 flake로 기록한다.
  - 따로 실행해도 실패하면 신규 실패로 보고 수용을 보류한다.
- 기준선 실패가 통과로 바뀌면 기록만 한다.
- bridge에서 나는 127.0.0.1 listen 실패와 `fs.watch` EMFILE은 환경 제한이다. 이 항목은 호스트 결과로 판정한다.
- 실패 분류와 hold 범위는 [scope.non-escalation] 절차를 따른다. 영향을 받지 않는 독립 작업은 Orchestrator가 hold에서 풀어 진행시킨다.

## 진행 기록

| 일시 | 작업 | 상태 | 커밋 | 메모 |
|---|---|---|---|---|
| 2026-11-19 | P0-a | 완료 | — | PD-4: d013cf0 직전 FR 결과 재사용(2774/2708/53+cancelled 1, 신규 0). 참고: Python `tests/test_codex_models.py`는 d013cf0에서도 2건 실패(`test_custom_roundtrip_and_validation`, `test_model_standard_five_roles`, BALANCED_SETTINGS 불일치) — npm test 밖 기존 실패 |
| 2026-11-19 | P0-b | 완료 | 1db99f4 | spec·plan v1 문서 커밋 후 clean |
| 2026-11-19 | T1 | 수용 | (이 커밋) | Implementer #1 `1296b058` 구현 전 hold(문서 개수 충돌) → v2 정정 승인 → fresh #2 `fb31c027`. focused 138/0, check:manifest PASS(1행), AC-C4 diff 0, 부분열 확인. 호스트 sentinel npm test 2801/2736/53, 직전 FR 목록 대비 신규 1건(`role-bridge-run` secret env) 단독 35/0 → 부하 flake, sentinel log 없음. 첫 실행은 Python 회귀가 남긴 `__pycache__`로 payload 검증 336건 실패 → 산출물 삭제 후 `PYTHONDONTWRITEBYTECODE=1`로 재실행 |
| 2026-11-19 | T2 | 수용 | (이 커밋) | Implementer `33259279`. RED 6/3 → GREEN watch-status-line+tui-render 50/0, 기존 단언 1곳(`shimmerText('w',2)` 231→195, 계약 변경), assert 20→26, check:manifest PASS(1행), AC-W4 diff 0. 호스트 watch-cli+watch-status-line 55/0, sentinel npm test 2803/2739/52, 직전 목록 대비 신규 0, sentinel log 없음 |
| 2026-11-19 | T3 | 수용 | (이 커밋) | Implementer `b796ad95`. RED 282/17 → GREEN 340/0. 기존 단언 수정 2곳(원인=빈 줄): `tui-custom-preset.test.mjs:303` Back 3→4, `tui-setup.test.mjs:358` Done 5→6·`[7]→[8]`; assert 수 감소 없음(110→112, 493→500, 231→238, 146→154). fresh QA `5c6fb92d`(4 segment; rm 거부로 2회 재지시): 명세 위반 없음, AC-U1·U3·U5 proven, AC-U2·U4·U6은 전 행 실제 프레임 순회 미실시로 unverified(화면별 kind 단언·기존 이동 테스트·경계 탐침·3×3 매트릭스·40×16 Configure 스크롤로 뒷받침), 미확인 조합: 스크롤된 Configure에서 Apply 선택 시 비선택 Back 색. 호스트 tui-*.test 383/382(실패 1 기준선), sentinel npm test 2825/2761/52 신규 0, sentinel log 없음 |
| | FR | | | |

## 계획 결정 기록 (spec 범위 안, Orchestrator 확정 2026-11-19)

- **PD-1:** T3의 render·menu 단위 테스트는 새 파일 `tests/node/tui-action-rows.test.mjs`에 둔다. `tui-render.test.mjs`를 수정하지 않는다는 AC-U1과 T2의 AC-W4를 기계적으로 확인할 수 있게 하기 위해서다.
- **PD-2:** T2·T3도 해시 대상 파일을 바꾸므로 각 작업에서 `MANIFEST.sha256`을 갱신한다. `MANIFEST.sha256`은 spec 2의 범위 목록에 들어 있다.
- **PD-3:** sentinel은 2026-11-18 plan과 같은 `grok` 단일 스크립트로 둔다. 기준선 측정 조건을 같게 유지해야 결과를 비교할 수 있기 때문이다. `codex`·`claude`를 실행하지 않는다는 점은 fixture PATH 규칙과 테스트 코드로 보장한다.
- **PD-4:** 같은 트리(`d013cf0`)에서 직전 FR 실행 결과를 Orchestrator가 확인했다면 P0-a에 그대로 쓸 수 있다.
- **PD-5:** AC-W4는 T2 작업 트리 기준으로 검사한다. T3가 `lib/tui/**`를 바꾸기 때문에 전체 범위로는 성립하지 않는다. `tui-render.test.mjs`와 `palette.mjs`에 변경이 없는지는 FR에서 전체 범위로 다시 확인한다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-19T00:34+09:00 | — | — | 최초 승인 |
| v2 | 2026-11-19T00:37+09:00 | 사실 정정 | T1 | 개수 표기 오류 정정: `ultra` 쌍 14→8, 기존 `none` 쌍 5→6(`gpt-5.6-luna` 누락). spec 4.1 표(정확 목록)와 기대 목록 코드는 불변. T1 Implementer(1296b058)가 구현 전 hold로 발견 |
