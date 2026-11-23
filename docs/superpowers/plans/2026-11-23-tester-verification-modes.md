# Tester 검증 모드와 전체 회귀 대체 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: plan v1 (2026-11-23 사용자 승인)
- Spec: `docs/superpowers/specs/2026-11-23-tester-verification-modes-design.md` (written spec v1.2, 2026-11-23 사용자 승인)
- 실행 대상: `/Users/yunho/Desktop/project/arc/.claude/worktrees/tester-verification-modes`, 브랜치 `feat/tester-verification-modes`, base `f786e4a1155287eff80d4abe56f7cebaf6598e3b`

**Goal:** 검증 역할을 QA에서 Tester로 전면 변경하고 legacy 읽기 호환을 둔다. brief 필드 `mode: task | final`로 두 모드를 운영한다. 전체 회귀 자동 실행을 트리거별 대체 검사와 판단 불가 disposition으로 바꾼다. worktree 세션용 handoff 기록 명령을 추가한다.

**Architecture:**

| Task | 내용 |
|---|---|
| T1 | 식별자 전체를 한 번에 rename하고 설정 legacy 읽기를 추가한다. 식별자: 모델·routing 키, policy 역할·규칙·route·evidence 토큰, cooperative 역할·연산, fragment id, profile 파일명 |
| T2~T4 | dispatch 기록, cooperative state, 구 profile의 legacy 처리를 각각 별도 task로 추가한다 |
| T5 | 표기를 기계적으로 rename한다 |
| T6 | 모드·대체 검사 정책 문안을 쓴다 |
| T7 | HND(독립 task) |

모든 정책 문안은 계약 테스트로 고정한다. 생성물은 매 task 끝에 원천에서 재생성한다.

**Tech Stack:** Node.js ESM(`node --test`), Python 3 `unittest`, JSON/TOML 설정, Markdown 문서

## Orchestrator 검토 결정 (2026-11-23)

spec 제안의 T1→T2→T3 순서를 7개 task로 나눴다. 근거는 다음과 같다.

- 식별자를 함께 rename해야 하는 결합 지점이 있다: `lib/policy/render.mjs:35` `POLICY_TARGETS`, `lib/installer/targets.mjs:12`, `evaluate.mjs:30`, `validateRolePolicy`. 이들을 나누면 중간 commit이 깨지므로 T1 한 task로 묶었다.
- MIG-3/4/5는 기존 테스트를 깨지 않는다. 그래서 별도 task로 나눴다.

Planner 열린 질문에 대한 결정:

| 질문 | 결정 | 이유 |
|---|---|---|
| Q1 | `tests/qa_model_cases.py` 파일명 유지 | REN-1은 내용만 검색한다. 내용은 T1에서 갱신한다 |
| Q2 | T7(HND)을 마지막에 둔다 | 재변경 파일이 줄어든다 |
| Q3 | 현행 QA profile과 충돌하면 최종 검증 brief에 D8 근거를 인용하고 이 workflow에 한해 새 규칙을 적용한다 | 역할이 여전히 충돌을 보고하면 사용자에게 확인한다 |
| Q4 | 현재 routing은 Implementer = Codex bridge다. T1은 bridge로 배정한다. 60분 timeout에 걸리면 같은 dispatch를 resume해서 segment를 이어 간다 | 다른 플랫폼이나 native route로 바꾸는 것은 금지된 대체다. 이 경우에도 commit은 1개다 |
| Q5 | parity check 명령은 `node scripts/check-installer-parity.mjs` | 스크립트 기본 `--root`는 저장소 루트다(`scripts/check-installer-parity.mjs:6-8`). `--complete`는 완전성 검사가 필요한 경우에만 쓴다 |

## Global Constraints

- **플랫폼 대칭**: 4개 플랫폼(claude/codex/gemini/grok)에 대칭으로 적용한다. host 중립을 지킨다. "resume"은 route 중립으로 쓴다(bridge: 같은 dispatch, native: 같은 배정).
- **역할·키**: 새 검증 역할과 모드별 모델·effort 키는 만들지 않는다. `arc_tester` 하나만 둔다.
- **legacy 처리**: legacy 입력을 자동 대체하거나 자동 마이그레이션해서 실행을 이어 가지 않는다.
- **문서 보존**: 기존 `docs/superpowers/**` 파일은 수정하지 않는다. 이번 spec·plan 추가만 허용한다(REN-2).
- **fixture 보존**: legacy fixture(`tests/fixtures/qa-legacy-model-values.json`, `tests/fixtures/models-*-v1.toml`)는 이름과 내용을 그대로 둔다.
- **Python 실행**: 모든 Python 실행 앞에 `PYTHONDONTWRITEBYTECODE=1`을 붙인다.
- **커밋**: 메시지는 `type(scope): 한국어 설명`. task 1개 = focused commit 1개. 커밋은 Orchestrator가 한다.
- **Git 금지**: Implementer와 검증 역할은 Git 상태를 바꾸지 않는다. 파일명 변경은 새 파일 작성과 기존 파일 삭제로 하고, stage는 Orchestrator가 한다.
- **이번 작업의 검증 역할**: 설치된 현행 ARC 기준으로 `arc_qa`(QA)다. task 검증과 최종 검증 모두 현행 QA가 수행한다. 최종 검증 brief에는 SELF-1(D8) 새 규칙 적용을 명시한다.
- **allowedPaths**: bridge Implementer의 디렉터리 항목은 반드시 `/`로 끝낸다.
- **plan 개정 기록**: 잔존 목록과 진행 기록 같은 plan 개정은 해당 task의 구현 commit에 포함한다.

## Review Focus

| # | 확인할 것 | 담당 테스트 |
|---|---|---|
| 1 | v3 `[roles.arc_qa]`의 custom model·effort가 upgrade·재기록 후 v4 `arc_tester`에 보존된다 | T1 `v3 arc_qa values upgrade to v4 arc_tester`(Node·Python) |
| 2 | v4에 `arc_qa`가 있으면(단독이든 `arc_tester`와 함께든) 쓰기 없이 거부되고 파일 바이트가 그대로다 | T1 `v4 with arc_qa is rejected without writing` |
| 3 | marker 없는 사용자 `arc-qa.md`는 upgrade·uninstall 뒤에도 보존되고 residual로 보고된다 | T4 `foreign legacy profile is preserved and reported` |
| 4 | 같은 actor id의 legacy `qa` check 뒤 `tester` 재검사가 role mismatch로 오판되지 않는다 | T3 `legacy qa and tester share identity` |
| 5 | legacy `arc_qa`와 새 `arc_tester` dispatch가 섞여도 watch는 둘 다 TESTER로 표시하고 observe·cancel이 성공한다 | T2 `legacy dispatch observe cancel and watch label` |

## 파일 구조 (책임 단위)

| 영역 | 파일 | 책임 | task |
|---|---|---|---|
| 모델 설정 | `lib/models/{config,profiles,static-catalog}.mjs`, `claude/skill/scripts/model_config.py`, `codex/skill/scripts/model_config.py`, `*/skill/models.toml` | 역할 키, v1~v4 읽기, v4 쓰기 | T1 |
| routing 설정 | `lib/runtime/role-routing-config.mjs` | `ROUTING_ROLES`, v1·v2 legacy 읽기, v3 쓰기 | T1 |
| 권한·timeout | `lib/runtime/{role-bridge-args,role-dispatch-policy,role-observe,role-routing}.mjs` | 키 이동, `arc_tester` 60분 | T1 |
| policy | `lib/policy/{role-policy.json,render.mjs,placement.mjs}` | 역할 id `tester`, 규칙·route·evidence 토큰 | T1(id), T5(표기), T6(문안) |
| prompt | `lib/prompts/{agent-fragments.json,render.mjs}` | fragment id `tester.*`, profile 경로 | T1(id), T5(표기), T6(문안) |
| cooperative | `lib/runtime/{operations,verification,acceptance,evaluate,schema,cooperative-schema}.mjs` | 역할 `tester`, 연산 `test`, legacy alias | T1(id), T3(alias) |
| dispatch 기록 | `lib/runtime/{role-dispatch-store,role-bridge,role-routing}.mjs`, `lib/watch/{labels,model,render}.mjs` | legacy 기록 읽기·hold·거부, TESTER 표시 | T1(id·label), T2(legacy) |
| installer | `lib/installer/{targets,manifest,plan,transaction,install-mode,role-routing}.mjs`, 신규 `lib/installer/legacy-profiles.mjs`, `lib/platforms/formats/*.mjs` | profile 파일명, 구 profile 정리 | T1(이름), T4(정리) |
| TUI | `lib/tui/setup.mjs` | 역할 5개, 표시 `Tester` | T1 |
| 플랫폼 문서·profile | `{claude,codex,gemini,grok}/skill/SKILL.md`, `*/skill/references/*.md`, `*/agents/arc-*.{md,toml}` | 식별자, 표기, 정책, HND | T1·T5·T6·T7 |
| handoff 명령 | 신규 `lib/runtime/handoff-record.mjs`, `lib/runtime/command.mjs`, `lib/installer/runtime-assets.mjs` | `handoff-record write` | T7 |
| 생성물 | `shared/skill/runtime/*`, 관리 섹션, `MANIFEST.sha256`, `tests/node/fixtures/{installed-layout-golden,instruction-contracts}.json` | 원천에서 재생성 | 매 task |

## 생성물 재생성 순서 (모든 task 공통 절차 G)

원천 편집 뒤 Implementer가 아래 순서로 실행한다. 해당 원천을 바꾸지 않은 task는 그 단계를 건너뛰되, `--check`(6단계)는 반드시 실행한다.

1. `node scripts/update-runtime-assets.mjs`: `lib/runtime/*`를 `shared/skill/runtime/*`로 mirror한다.
2. `npm run update:role-policy`: 관리 섹션을 갱신한다.
3. fixture를 수동 갱신한다: `tests/node/fixtures/installed-layout-golden.json`(파일명·해시), `instruction-contracts.json`(문서 해시·문구). diff가 의도한 변경에만 한정되는지 확인한다.
4. `tests/installer-parity.json`의 `assertionLines`를 맞춘다. Python 테스트 줄이 바뀐 task만 한다.
5. `node scripts/update-manifest.mjs`를 실행한다. 반드시 마지막에 한다.
6. 확인 4개를 모두 통과해야 한다:
   - `node scripts/update-runtime-assets.mjs --check`
   - `npm run check:role-policy`
   - `npm run check:manifest`
   - `node scripts/check-installer-parity.mjs`

## REN-1 잔존 목록 기록 방법

**검색 시점과 실행자**

- T1·T5 끝: Implementer
- 최종 검증: 현행 QA

**검색 명령**

- 주 검색: `rg -n '\bqa\b|arc_qa|arc-qa|fresh-qa|required-qa|qa-rechecks|\bQA\b' lib shared claude codex gemini grok tests README.md MANIFEST.sha256`
- 보조 검색: `rg -n '_qa\b|qa\.' lib shared claude codex gemini grok tests`. 주 패턴의 `\bqa\b`가 `arc_routing_qa`를 잡지 못하므로 누락 방지용으로 함께 돌린다.

**결과 처리**

- Implementer는 남은 출현을 `파일:줄 | 문자열 | 분류(legacy 읽기·거부 코드 / 그 테스트 / legacy fixture) | 사유` 형식으로 보고한다.
- Orchestrator는 보고를 부록 A에 옮기고 해당 task commit에 포함한다.
- 세 분류 밖의 출현이 있으면 task 수용을 보류한다.

---

### Task T1: 식별자 일괄 rename, 설정 legacy 읽기, `arc_tester` timeout

**목표:** REN-1 표의 식별자 행을 모두 바꾼다. 대상은 다음과 같다.

- 정책 역할, 규칙 id, route·evidence 토큰
- 모델·routing 키, native·Codex 이름, routing profile, profile 파일명
- fragment id, cooperative 역할 enum, runtime 연산명
- watch label, TUI 표시

같은 task에서 MIG-1, MIG-2, MOD-1~3, FR-1 runtime timeout을 구현한다. 문서 산문의 "QA" 표기는 T5에서 바꾼다.

**병합 근거:**

- profile 파일명을 계산하는 곳이 두 군데다. `POLICY_TARGETS`(`lib/policy/render.mjs:35`)는 policy 역할 id로, `targets.mjs:12`는 모델 키로 같은 파일명을 만든다.
- `evaluate.mjs:30`은 cooperative 역할을 규칙 id에 대응시킨다.
- `validateRolePolicy`는 `runtime.roles`와 policy `ROLES`가 같아야 통과한다.
- 따라서 이들을 나누면 중간 commit에서 installer, policy check, golden fixture가 깨진다.
- legacy 설정 fixture도 rename 직후 읽기 호환이 없으면 실패한다. 그래서 MIG-1·2도 이 task에 포함한다.

**Files:**

Modify (lib):

- 모델: `lib/models/config.mjs:4,10,35-66`, `lib/models/profiles.mjs:7`, `lib/models/static-catalog.mjs`
- routing·권한: `lib/runtime/role-routing-config.mjs:3,16-45`, `lib/runtime/role-dispatch-policy.mjs:36,123-125`, `lib/runtime/role-bridge-args.mjs:8-28`, `lib/runtime/role-observe.mjs:611,659`, `lib/runtime/role-routing.mjs:175,244`
- cooperative: `lib/runtime/operations.mjs:2,5,6`, `lib/runtime/verification.mjs:30,76,77`, `lib/runtime/acceptance.mjs:23,25`, `lib/runtime/evaluate.mjs:30,56,101`
- policy: `lib/policy/role-policy.json`(역할 id, 규칙 id, review route, evidence 토큰. 규칙 `text`의 산문은 T5), `lib/policy/render.mjs:7,23,26`, `lib/policy/placement.mjs:5`
- prompt: `lib/prompts/render.mjs:31-41,91-99,126,131,200`, `lib/prompts/agent-fragments.json`(fragment id만)
- installer·포맷: `lib/installer/targets.mjs:12`, `lib/installer/manifest.mjs:52`, `lib/platforms/formats/{markdown,toml,gemini-markdown,grok-markdown}.mjs`의 `validRole` 정규식
- watch·TUI: `lib/watch/labels.mjs:6`, `lib/watch/model.mjs:8,40`, `lib/watch/render.mjs:12,16`(`['tester','TESTER']`), `lib/tui/setup.mjs`(표시 `Tester`. 계산식인지 문자열인지 확인)

Modify (Python): `claude/skill/scripts/model_config.py:11,16,42-81`, `codex/skill/scripts/model_config.py`

Modify (문서):

- `{claude,codex,gemini,grok}/skill/models.toml`(`version = 4`, `arc_tester`)
- `*/skill/references/coordination.md`(Fixed timeouts 문장), `*/skill/references/limits.md:31`
- 그 밖에 `arc_qa`·`arc-qa` 식별자를 직접 쓰는 문서 줄, `README.md`

Rename(새 파일 작성 후 기존 삭제): `{claude,gemini,grok}/agents/arc-qa.md` → `arc-tester.md`, `codex/agents/arc-qa.toml` → `arc-tester.toml`. 템플릿 안의 profile `name`과 fragment 참조도 함께 바꾼다.

Create: `tests/node/role-dispatch-policy.test.mjs`

Test 갱신: Node는 `rg -l` 결과 약 75개 파일, Python은 `tests/test_codex_models.py`, `tests/test_claude_payload.py`, `tests/test_arc_policy.py`, `tests/test_harness_contract.py`, `tests/test_token_usage.py`, `tests/qa_model_cases.py`(파일명은 유지)

생성물: 절차 G 전체. `tests/installer-parity.json` 항목 추가와 `assertionLines` 갱신을 포함한다.

**allowedPaths:** `lib/`, `shared/`, `claude/`, `codex/`, `gemini/`, `grok/`, `tests/`, `README.md`, `MANIFEST.sha256`

**선행:** 없음(base `f786e4a1`)

**Interfaces (Produces):**

- `lib/models/config.mjs`
  - `export const ROLES = Object.freeze(['arc_scouter','arc_planner','arc_implementer','arc_tester','arc_reviewer'])`
  - `export const MODEL_SCHEMA_VERSION = 4`
  - `export const LEGACY_ROLE_KEYS = Object.freeze({arc_qa: 'arc_tester'})`
  - 읽기는 v1~v4를 받는다. 쓰기는 항상 v4로 한다.
  - v1~v3: `arc_qa`를 `arc_tester`로 해석한다. 두 키가 함께 있으면 실패한다.
  - v4에 `arc_qa`가 있으면 `fail('version 4 must not contain arc_qa')`.
- Python `model_config.py`
  - `ROLE_FILES`는 `('scouter','planner','implementer','tester','reviewer')`에서 만든다.
  - normalize 규칙은 Node와 같다. `version 4 requires exactly the five ARC roles`, v4에 `arc_qa`가 있으면 `ValidationError`.
  - 출력은 `version = 4`.
- `lib/runtime/role-routing-config.mjs`
  - `ROUTING_ROLES`에 `'arc_tester'`가 들어간다.
  - `export const ROUTING_CONFIG_VERSION = 3`
  - v1·v2의 `arc_qa`는 `arc_tester`로 해석한다. 재기록(`:36`, `:45`)은 `version: 3`으로 한다.
  - v3에 `arc_qa`가 있으면 `Invalid role routing configuration`.
- `lib/runtime/operations.mjs`
  - `ROLES = ['orchestrator','scouter','planner','implementer','tester','reviewer']`
  - `OPERATIONS`의 `'qa'`를 `'test'`로 바꾼다.
  - `ROLE_OPERATIONS.tester = ['read','check','temporary-write']`
- `lib/runtime/role-dispatch-policy.mjs`: `ROLE_TIMEOUT_MINUTES.arc_tester === 60`. `arc_qa` 키는 없다.
- policy 토큰
  - 역할 `tester`, 규칙 `role.tester-verification`
  - route: `noPlan:['implementer','tester','reviewer','orchestrator-accept']`, `planTask`의 `'fresh-tester'`, `planFinal:['required-tester','reviewer']`
  - `tester-rechecks`, `relevant-tester-evidence`
- fragment id: `tester.contract-intro`, `tester.verification-steps`
- 표시: watch 역할 `tester`/label `TESTER`, TUI 표시 `Tester`

- [ ] **Step 1: 실패 테스트 작성**
  - `tests/node/models.test.mjs`
    - `v3 arc_qa values upgrade to v4 arc_tester`
      - 입력: v3 `[roles.arc_qa] model="m-x" effort="high"`
      - 기대: `config.roles.arc_tester`가 `{model:'m-x', effort:'high'}`와 deepEqual이다. 직렬화하면 `version = 4`와 `[roles.arc_tester]`를 포함하고 `arc_qa`는 없다.
    - `v4 with arc_qa is rejected without writing`
      - 기대: `/arc_qa/` 오류가 나고 대상 파일 바이트가 그대로다.
  - `tests/node/role-routing-config.test.mjs`
    - `legacy v2 arc_qa config validates as arc_tester`
    - `rewrite stores version 3 with arc_tester`
    - `v3 with arc_qa is rejected`
  - `tests/node/role-dispatch-policy.test.mjs`(신규)
    - `arc_tester timeout is 60 minutes`: `ROLE_TIMEOUT_MINUTES.arc_tester === 60`이고 `!Object.hasOwn(ROLE_TIMEOUT_MINUTES,'arc_qa')`
  - `tests/node/role-bridge-resume.test.mjs`
    - `resume segment uses arc_tester 60 minute timeout`: `lease.timeoutMinutes === 60`이고 타이머가 segment별로 새로 걸린다.
  - Python `tests/test_codex_models.py`·`tests/test_claude_payload.py`
    - `test_v3_arc_qa_values_upgrade_to_v4_arc_tester`
    - `test_v4_rejects_arc_qa`
  - 기존 기대값 갱신
    - 이름: `arc_qa`→`arc_tester`, `'qa'`→`'tester'`, `arc-qa.md`→`arc-tester.md`, `fresh-qa`→`fresh-tester`
    - 표시: label `QA`→`TESTER`, TUI `Tester`
    - composite-instructions needle에서 `'30 minutes'`를 제거한다.
    - 권한·gate 기대값은 키만 바꾸고 값은 그대로 둔다(MOD-3).
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/models.test.mjs tests/node/role-routing-config.test.mjs tests/node/role-dispatch-policy.test.mjs tests/node/role-bridge-resume.test.mjs`
  - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_codex_models tests.test_claude_payload -v`
  - 기대: 새 테스트가 FAIL한다.
- [ ] **Step 3: 최소 구현**
  - Interfaces 값으로 원천을 고치고 profile 파일 4개를 새 이름으로 다시 쓴다.
  - normalize는 `validateModelConfig` 진입부에서 한 번만 한다. Python도 같은 위치에 `_normalize_legacy_roles(data)`를 둔다.
  - 연산 `'qa'`가 state 스키마(`schema.mjs`, `cooperative-schema.mjs`)에 저장되는 값이면 hold하고 보고한다.
- [ ] **Step 4: 생성물 재생성**
  - 절차 G 1~6을 수행한다.
  - `tests/installer-parity.json`에 MIG-1 Node·Python 대응 항목을 추가한다. `task` 형식이 제한되면 hold한다.
- [ ] **Step 5: 관련 테스트 통과**
  - 아래 표의 Node·Python 묶음을 실행한다.
  - Python 실패는 기준선 36건과 이름 단위로 대조해 2단계로 분류한다.
- [ ] **Step 6: REN-1 1차 검색**
  - 산문 `\bQA\b`는 T5 대상으로 분류해 표시한다.
- [ ] **Step 7: Commit(Orchestrator)**
  - 메시지: `feat(roles): QA 식별자를 tester로 바꾸고 models·routing 설정 legacy 읽기 추가`

**수용 기준:**

- 새 테스트 7개(Node 5, Python 2)가 통과한다.
- 기존 권한·gate·allowedPaths 테스트가 키 이름만 바꾼 상태로 통과한다(MOD-3).
- 역할이 5개이고 모드별 키가 없다(MOD-1).
- 4개 플랫폼 `models.toml`이 v4 `arc_tester`다.
- `coordination.md`·`limits.md`의 timeout 문장이 `arc_tester` 60분이다(MOD-2).
- 절차 G의 check 4개가 통과한다.
- legacy fixture는 이름과 내용이 그대로다.

**task 검증(현행 QA)과 관련 테스트**

| 테스트 | 이유 |
|---|---|
| `models`, `model-catalog`, `preset`, `preset-cli`, `install-mode-models-upgrade`, `tui-setup`, `tui-app` | (a) 모델 키·역할 목록·TUI |
| `role-routing-{config,dispatch,install,publish,anchor}`, `role-dispatch-policy`, `role-dispatch-store`, `dispatch-lease-v2`, `role-bridge-{args,resume,run,observe-wait,support}`, `role-observe` | (a) routing·권한·timeout |
| `runtime-{verification,acceptance,evaluate,gate,cli,claude,codex,store,schema,cooperative,assets}`, `runtime-git.integration`, `runtime-workflow.integration` | (a) cooperative 역할·연산 |
| `role-policy`, `agent-fragments`, `profile-render`, `composite-instructions`, `instruction-layout`, `instruction-language`, `test-scope-contract`, `installed-layout-golden`, `manifest`, `parity-check`, `hardcoding-residual`, `menu-label-residual` | (b) 계약 테스트 |
| `targets`, `plan`, `install`, `install-mode*`, `uninstall`, `upgrade-harness`, `upgrade-reapply`, `management-{operations,status,update,workflow}` | (a) installer |
| `watch-{labels,render,dispatch,watcher,discover,cli,markdown,normalize-codex}` | (a) watch |
| `gemini-{bridge,composite,install,platform}`, `grok-{bridge,capability-evidence,composite,install,platform}`, `host-gemini-grok`, `platform-registry` | (a) 플랫폼별 식별자 |
| Python `test_codex_models`, `test_claude_payload`, `test_arc_policy`, `test_harness_contract`, `test_token_usage` | (a)(b) |
| check 4개 | (c) |

`rg -l`로 확정한 파일 중 위 표에 없는 것은 (a)로 추가하고 이유를 붙인다.

**hold 조건:**

- 연산 `'qa'`가 state에 저장되는 값이다.
- parity `task` 형식이 제한된다.
- golden·instruction fixture diff에 rename·해시 밖의 변경이 있다.
- Python 실패가 기준선 36건 밖에 있고 new-failure로 분류된다.

**배정:** Implementer = Codex bridge. timeout에 걸리면 같은 dispatch를 resume한다.

---

### Task T2: legacy dispatch 기록 처리 (MIG-3)

**목표:** legacy `arc_qa`·`arc-routing-qa` dispatch 기록을 다음과 같이 처리한다.

- observe·cancel·watch: 읽고 TESTER로 표시한다.
- resume: 사유 코드와 함께 hold한다.
- prepare-dispatch: `arc_qa` 입력을 거부하고 state·파일을 쓰지 않는다.

**Files:**

- Modify: `lib/runtime/role-routing-config.mjs`, `lib/runtime/role-dispatch-store.mjs`, `lib/runtime/role-bridge.mjs`(resume), `lib/runtime/role-routing.mjs`(prepare 입력 검증), `lib/watch/labels.mjs:6`
- Test: `tests/node/role-routing-dispatch.test.mjs`, `tests/node/role-bridge-resume.test.mjs`, `tests/node/watch-labels.test.mjs`, `tests/node/watch-dispatch.test.mjs`
- 생성물: 절차 G 1, 3, 5, 6

**allowedPaths:** `lib/runtime/`, `lib/watch/`, `shared/skill/runtime/`, `tests/node/`, `MANIFEST.sha256`

**선행:** T1

**Interfaces:**

- Consumes: T1 `ROUTING_ROLES`
- Produces:
  - `export const LEGACY_ROUTING_ROLES = Object.freeze({arc_qa: 'arc_tester'})`
  - `export function displayRoutingRole(role: string): string | null`
  - 사유 코드: `legacy_role_resume_unsupported`(resume → `decision: 'hold'`), `legacy_role_arc_qa`(prepare → `decision: 'deny'`)
  - watch label 함수가 `arc[_-](?:routing[_-])?qa`를 `tester`로 대응시킨다.

- [ ] **Step 1: 실패 테스트**
  - `legacy dispatch observe cancel and watch label`: 4개 플랫폼 반복. observe·cancel이 성공하고 watch 표시가 `TESTER`다.
  - `legacy dispatch resume holds with reason code`: `reasonCode === 'legacy_role_resume_unsupported'`. 새 segment와 child 프로세스가 생기지 않는다.
  - `prepare-dispatch rejects arc_qa without writes`: `legacy_role_arc_qa`. `<gitCommonDir>/arc/workflows` 트리가 실행 전후로 같다.
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/role-routing-dispatch.test.mjs tests/node/role-bridge-resume.test.mjs tests/node/watch-labels.test.mjs tests/node/watch-dispatch.test.mjs`
- [ ] **Step 3: 구현**
  - legacy 허용은 기록을 읽는 경로에만 둔다.
  - prepare 입력 검증은 store에 쓰기 전에 한다.
- [ ] **Step 4: 생성물(절차 G)과 관련 테스트 통과**
- [ ] **Step 5: Commit**
  - 메시지: `feat(runtime): legacy arc_qa dispatch 기록 읽기·resume hold·prepare 거부`

**수용 기준:**

- MIG-3 AC 3개를 4개 플랫폼에서 확인한다(PLT-1).
- 새 dispatch를 쓰는 경로에 `arc_qa`가 다시 나타나지 않는다.

**관련 테스트**

| 테스트 | 이유 |
|---|---|
| `role-routing-dispatch`, `role-bridge-resume`, `role-bridge-run`, `role-dispatch-store`, `dispatch-lease-v2`, `role-observe` | (a) |
| `watch-labels`, `watch-dispatch`, `watch-render`, `watch-watcher` | (a) label 소비자 |
| `runtime-assets`, `manifest`, `installed-layout-golden` | (b)(c) |
| check 4개 | (c) |

**hold 조건:** legacy 기록 형식이 플랫폼마다 달라 fixture 하나로 표현할 수 없을 때

---

### Task T3: cooperative state legacy `qa` alias와 tester check 기록 (MIG-5, COOP-1)

**목표:**

- 저장된 `qa`를 읽기 전용 alias로 보고 `tester`와 같은 것으로 해석한다.
- 새 요청의 `actor.role: "qa"`는 거부한다.
- final scope 규칙(`verification.mjs:70-74`)은 바꾸지 않는다.

**Files:**

- Modify: `lib/runtime/operations.mjs`, `lib/runtime/schema.mjs` 또는 `cooperative-schema.mjs`, `lib/runtime/verification.mjs:30,76,77`, `lib/runtime/acceptance.mjs:23,25`, `lib/runtime/evaluate.mjs:101`
- Test: `tests/node/runtime-verification.test.mjs`, `tests/node/runtime-acceptance.test.mjs`, `tests/node/runtime-evaluate.test.mjs`, `tests/node/runtime-schema.test.mjs`
- 생성물: 절차 G 1, 3, 5, 6

**allowedPaths:** `lib/runtime/`, `shared/skill/runtime/`, `tests/node/`, `MANIFEST.sha256`

**선행:** T1. T2와는 독립이다.

**Interfaces (Produces, `operations.mjs`):**

- `export const LEGACY_COOPERATIVE_ROLES = Object.freeze({qa: 'tester'})`
- `export function canonicalCooperativeRole(role: string): string`
- alias 적용 대상: 저장된 `verificationActor.role`, `recheckActor.role`, identity `role`
- 새 요청 거부: `decision: 'deny'`, 사유 `legacy_role_qa`. ruleId는 기존 role 검증 ruleId를 쓴다.

- [ ] **Step 1: 실패 테스트**
  - `legacy qa check state passes status and schema`
  - `legacy qa and tester share identity`
  - `legacy qa reuse across tasks stays rejected`
  - `prepare check accepts tester and rejects qa`: `qa`로 요청한 뒤에도 state 파일 바이트가 그대로다.
  - `legacy qa check satisfies acceptance`
  - `runtime hash drift still holds`
  - `final scope still allows review only`(COOP-2 고정)
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/runtime-verification.test.mjs tests/node/runtime-acceptance.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-schema.test.mjs`
- [ ] **Step 3: 구현**
  - 비교 지점 5곳의 저장값을 `canonicalCooperativeRole`로 감싼다.
  - 쓰기 경로에는 `tester`만 허용한다.
- [ ] **Step 4: 생성물과 관련 테스트 통과**
- [ ] **Step 5: Commit**
  - 메시지: `feat(runtime): cooperative state의 legacy qa 역할을 읽기 전용 alias로 처리`

**수용 기준:** MIG-5 AC 5개, COOP-1 AC, COOP-2 AC(`verification.mjs` final scope 규칙 무변경)

**관련 테스트**

| 테스트 | 이유 |
|---|---|
| `runtime-{verification,acceptance,evaluate,schema,cooperative,store,cli,gate}`, `runtime-workflow.integration`, `runtime-git.integration`, `runtime-legacy-plan-amend` | (a) |
| `runtime-assets`, `manifest`, `installed-layout-golden` | (b)(c) |
| check 4개 | (c) |

**hold 조건:** 스키마가 role을 enum으로 고정하고 있어 legacy 값을 허용하려면 `schemaVersion`을 올려야 할 때

---

### Task T4: 구 profile 소유 판정 정리 (MIG-4)

**목표:**

- install·upgrade·uninstall 때 4개 플랫폼 agents 디렉터리에서 legacy 이름 profile을 찾는다.
- 기존 소유 판정으로 ARC 소유가 확인되면 같은 transaction에서 제거한다.
- 소유가 확인되지 않으면 보존하고 residual로 보고한다.
- 소유 판정 규칙의 의미는 바꾸지 않는다.

**Files:**

- Create: `lib/installer/legacy-profiles.mjs`
- Modify: `lib/installer/plan.mjs:76` 근처, `lib/installer/transaction.mjs:62` 근처, `lib/installer/install-mode.mjs`, `lib/installer/role-routing.mjs:98`, `lib/platforms/formats/*.mjs`(legacy 판정 전용 인자), uninstall 경로 모듈
- Test: 신규 `tests/node/legacy-profile-cleanup.test.mjs`. 필요하면 `tests/node/fixtures/install-mode.mjs` helper도 쓴다.
- 생성물: 절차 G 3, 5, 6

**allowedPaths:** `lib/installer/`, `lib/platforms/formats/`, `tests/node/`, `MANIFEST.sha256`

**선행:** T1. T2·T3와는 독립이다.

**Interfaces (Produces, `legacy-profiles.mjs`):**

- `export function legacyProfileNames(platform: string): string[]`
  - legacy 역할 `arc_qa`를 기존 파일명 함수에 넣어 이름을 계산한다. 하드코딩하지 않는다.
- `export async function classifyLegacyProfiles({platform, agentsDir, mode}): Promise<{remove: string[], residual: string[]}>`
  - standalone은 marker와 역할 이름으로, composite는 marker와 profile hash로 판정한다.
  - 판정할 수 없으면 `residual`로 보낸다.
- install·upgrade·uninstall 결과 객체에 `legacyResiduals: string[]`(절대 경로)를 추가한다.
- formats의 `validRole` 일반 허용 집합은 바꾸지 않는다.

- [ ] **Step 1: 실패 테스트** (4개 플랫폼 × install·upgrade·uninstall)
  - `owned legacy profile is removed`
  - `foreign legacy profile is preserved and reported`
  - `composite hash mismatch is preserved and reported`
  - `failure rolls back legacy removal`
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/legacy-profile-cleanup.test.mjs`
- [ ] **Step 3: 구현**
  - plan 단계에서 분류하고 transaction 단계에서 제거한다.
  - 기존 백업·rollback 경로를 재사용한다.
- [ ] **Step 4: 생성물과 관련 테스트 통과**
- [ ] **Step 5: Commit**
  - 메시지: `feat(installer): 구 arc-qa profile을 소유 판정 후 제거하고 residual 보고`

**수용 기준:**

- MIG-4 AC 4개를 4개 플랫폼 × 3동작에서 확인한다.
- 기존 소유 판정 테스트가 변경 없이 통과한다.

**관련 테스트**

| 테스트 | 이유 |
|---|---|
| `legacy-profile-cleanup` | (a) |
| `plan`, `derive-install-plan`, `install`, `install-mode`, `install-mode-{switch,uninstall,n-platform,publication,review-followup}`, `uninstall`, `upgrade-harness`, `upgrade-reapply`, `role-routing-install` | (a) |
| `gemini-install`, `grok-install` | (a) |
| `installed-layout-golden`, `manifest`, `parity-check` | (b) |
| check 4개 | (c) |

**hold 조건:**

- 소유 판정 의미를 바꾸지 않고는 legacy 판정을 할 수 없을 때
- uninstall이 transaction을 쓰지 않아 rollback AC를 충족할 수 없을 때

---

### Task T5: 표기 rename QA → Tester (기계적)

**목표:**

- 사람이 읽는 표기 "QA"를 "Tester"로 바꾼다. 대상은 policy `text`, fragment 본문, 4개 플랫폼 SKILL.md·references·profile 템플릿, README다.
- 의미는 바꾸지 않는다.

**TDD 처리:**

- 문서 exception에 해당한다.
- 그래도 계약 기대 문자열을 먼저 바꿔 실패를 관찰한다.
- 대체 구조 검사는 두 가지다:
  - REN-1 검색에서 3분류 밖 출현이 0건이다.
  - 4개 플랫폼 문단이 동일하다.

**Files:**

- Modify: `lib/policy/role-policy.json`(`text`), `lib/prompts/agent-fragments.json`(본문), `{claude,codex,gemini,grok}/skill/SKILL.md`, `*/skill/references/{verification,handoff,handoff-prep,planning,coordination,commit,limits,git-recovery,arc-visual-companion}.md`, `*/agents/arc-*.{md,toml}`, `README.md`
- Test: `tests/node/test-scope-contract.test.mjs:12-33`, `tests/node/instruction-layout.test.mjs`, `tests/node/instruction-language.test.mjs`, `tests/node/composite-instructions.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/fixtures/instruction-contracts.json`, Python `tests/test_harness_contract.py`, `tests/test_arc_policy.py`
- 생성물: 절차 G 2, 3, 5, 6

**allowedPaths:** `lib/`, `claude/`, `codex/`, `gemini/`, `grok/`, `tests/`, `README.md`, `MANIFEST.sha256`

**선행:** T1. T6은 T5에 의존한다.

- [ ] **Step 1: 계약 기대 문자열을 Tester로 변경**
  - 대상: `finalVerificationParagraph`, `fullRegressionParagraph`, `baselineParagraph`, `handoffBriefInputsParagraph`, `reviewerVerificationSentence`, `implementerFinalRegressionRule` 등
  - 문장 구조는 그대로 두고 명칭만 바꾼다.
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/test-scope-contract.test.mjs tests/node/instruction-layout.test.mjs`
- [ ] **Step 3: 원천 표기 변경**
  - 4개 플랫폼에 같은 치환을 적용한다.
  - `docs/`는 건드리지 않는다.
- [ ] **Step 4: 생성물(절차 G)과 관련 테스트 통과**
- [ ] **Step 5: REN-1 검색과 REN-2 확인**
  - REN-1: 3분류 밖 출현이 0건이다.
  - REN-2: `git diff --name-only --diff-filter=MDR f786e4a1155287eff80d4abe56f7cebaf6598e3b -- docs/superpowers/` 결과가 비어 있다(읽기 전용).
- [ ] **Step 6: Commit**
  - 메시지: `docs(roles): QA 표기를 Tester로 바꾸고 계약 테스트 기대값 갱신`

**수용 기준:**

- REN-1 AC와 REN-2 AC를 충족한다.
- 4개 플랫폼 test-scope 문단이 동일하다.

**관련 테스트**

| 테스트 | 이유 |
|---|---|
| `test-scope-contract`, `instruction-layout`, `instruction-language`, `composite-instructions`, `agent-fragments`, `profile-render`, `role-policy`, `run-mode-contract`, `plan-level-records-contract`, `hardcoding-residual`, `menu-label-residual` | (b) |
| `installed-layout-golden`, `manifest` | (b) |
| Python `test_harness_contract`, `test_arc_policy` | (b) |
| check 4개 | (c) |

**hold 조건:** "QA"가 역할이 아닌 일반 품질 보증 의미로 쓰인 문장처럼, 치환하면 의미가 바뀌는 문장이 있을 때

---

### Task T6: Tester 모드·대체 검사·판단 불가·승인 전체 회귀 정책 문안

**목표:**

- 다음 요구사항을 4개 플랫폼 문서·profile·fragment·policy에 반영한다: MODE-1~4, SUB-0~5, IMP-1, UND-1~2, FR-1~2(문안), CI-1, BRF-1~2, COOP-2(문안), PLT-1.
- 반영한 내용은 계약 테스트로 고정한다.

**Files:**

- Modify: `*/skill/references/verification.md`(test-scope 절, cooperative 절), `*/skill/references/handoff-prep.md:93-95`, `*/skill/references/planning.md`, `lib/prompts/agent-fragments.json`(Tester·Implementer·Planner, `:54` provisional 문구 대체), 필요하면 `lib/policy/role-policy.json` 규칙 `text`, `*/agents/arc-implementer.{md,toml}`(codex `.toml`은 직접 확인)
- Test: `tests/node/test-scope-contract.test.mjs`, `tests/node/agent-fragments.test.mjs`, `tests/node/profile-render.test.mjs`, `tests/node/fixtures/instruction-contracts.json`
- 생성물: 절차 G 2, 3, 5, 6

**allowedPaths:** `lib/policy/`, `lib/prompts/`, `claude/`, `codex/`, `gemini/`, `grok/`, `tests/`, `MANIFEST.sha256`

**선행:** T5

**고정할 문구(needle)**

- 문서 본문은 영어로 쓴다. 문단 전체는 Implementer가 쓰고, 4개 플랫폼에서 바이트 단위로 동일해야 한다.
- 바뀐 문단의 상수는 문단 전체로 갱신한다.
- 폐기한 문구는 `retiredPhrases`에 추가한다.

| ID | needle / 검사 |
|---|---|
| MODE-1 | `` `mode: task | final` ``; `One assignment performs one mode; the only exception is the approved full regression follow-up in final mode.` 위치: verification.md, handoff-prep.md, Tester profile 렌더 |
| MODE-2 | `**Task mode**`; `a fresh Tester for each top-level task`; 3범주 문장; `In task mode, never run full regression or substitute checks.`; `In task mode, do not search reverse dependencies.`; 같은 task의 현재 Tester 재사용 |
| MODE-3 | `**Final mode**`가 4범주를 열거하고 4번째가 `substitute checks for applicable triggers`이다. affected 도구: `only in list or dry-run form with no writes, installs or cache generation`; `otherwise report an environment block and continue with the next step of the impact procedure` |
| MODE-4 | Implementer fragment에 `substitute checks and full regression only in final-mode Tester verification`. 폐기: `full regression only in final QA verification when triggered.`(Tester 표기 형태 포함) |
| SUB-0 | 트리거 정의, shared module 정의, 비트리거 문장을 현행대로 유지한다. 폐기: `runs it once without further authorization` |
| SUB-1~4 | 표 형태. `reverse dependencies`, `nearest package manifest directory`, `otherwise the test directory`, `resolved version changed`, `one representative test per package or test directory`, `project-declared smoke tests first`, `lexicographically first test file`, `consumers outside the repository are unverified`, `suspected dynamic reference` |
| SUB-5 | `Tester independently checks triggers (1), (3) and (4) from the base..HEAD diff and log` |
| IMP-1 | 1~5 순서(`same commit or tree hash`, `affected tool`, `reverse dependencies`, `expand the boundary one step`, `report as undeterminable (unverified)`); `record why steps 1 and 2 were not used`; `A suspected dynamic reference goes directly to step 5.` needle의 등장 순서를 검사한다 |
| UND-1 | `item, cause, substitute checks run and remaining unverified scope` |
| UND-2 | `(i) approve full regression`, `(ii) substitute the project CI full test results`, `(iii) disposition as unverified`; `final acceptance is held`; `Reviewer and independent work continue`; `never auto-decided in Full Auto`; `does not turn a criterion into proven` |
| FR-1 | `the current final-mode Tester runs it as a follow-up; no new Tester is assigned`; `bridge resumes the same dispatch` / `native continues the same assignment`; `each segment starts a new lease.timeoutMinutes timer`; `if the same assignment cannot continue, report an environment block and hold; the user decides whether to assign a new Tester` |
| FR-2 | `valid only for that workflow and HEAD`; `runs once`; `Approved full regression failures follow the base check below.` |
| CI-1 | `same commit SHA as the verified HEAD`, `all jobs completed`, `per-test-name results`, `collected read-only by Orchestrator and cited in the brief`, `explicit user approval record`; `otherwise a new-failure candidate or unverified`; `grants no external action authority` |
| BRF-1 | `provisional trigger judgment with the substitute-check list and reasons`. 폐기: `provisional full-regression trigger judgment`. `test-scope-contract` planner rule(`:109-111`)도 갱신한다 |
| BRF-2 | task 필드: `mode: task`, approved base, base worktree state, related-test list with reasons, intermittent rerun limit. final 필드: `mode: final`, provisional judgment with reasons, integration history, reused evidence commit/tree hash, full regression approval record when present, re-changed-file list |
| COOP-2 | `Final-mode Tester results are not cooperative checks; record them in the plan-level progress record and the canonical handoff record.` |
| PLT-1 | 4개 플랫폼 test-scope 절 동일성. host 전용 도구명이 없는지는 Reviewer 검토 항목이다 |

- [ ] **Step 1: 실패 테스트 추가** (`test-scope-contract.test.mjs`)
  - 테스트 이름:
    - `mode field and single-mode assignment`
    - `task mode forbids full regression and reverse dependency search`
    - `final mode lists four categories and affected tool conditions`
    - `trigger substitute checks table`
    - `impact procedure order`
    - `undeterminable report and disposition`
    - `approved full regression follow-up`
    - `ci substitution conditions`
    - `planner and brief inputs`
    - `final-mode results are not cooperative checks`
  - `sectionPhrases`의 `'**Full regression**'`를 새 절 제목으로 맞춘다.
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/test-scope-contract.test.mjs tests/node/agent-fragments.test.mjs tests/node/profile-render.test.mjs`
- [ ] **Step 3: 문안 작성**
  - 4개 플랫폼에 같은 문단을 넣는다.
- [ ] **Step 4: 생성물과 관련 테스트 통과**
- [ ] **Step 5: Commit**
  - 메시지: `feat(policy): Tester task·final 모드와 트리거별 대체 검사 규칙 추가`

**수용 기준:**

- 표의 각 ID에 해당하는 spec AC를 충족하고 계약 테스트로 고정한다.
- UND-2와 Evidence verdict 규칙이 충돌하지 않는다.

**관련 테스트**

| 테스트 | 이유 |
|---|---|
| `test-scope-contract`, `agent-fragments`, `profile-render`, `instruction-layout`, `instruction-language`, `composite-instructions`, `run-mode-contract`, `plan-level-records-contract`, `role-policy` | (b) |
| `installed-layout-golden`, `manifest` | (b) |
| Python `test_harness_contract`, `test_arc_policy` | (b) |
| check 4개 | (c) |

**hold 조건:** 비목표 영역의 의미를 바꿔야만 문안을 쓸 수 있을 때. 대상은 Reviewer 흐름, baseline 2단계, result comparison이다.

---

### Task T7: worktree 세션 handoff 기록 명령 (HND-1, HND-2)

**목표:**

- `handoff-record write` runtime 명령을 추가한다. worktree 세션에서도 `<git-common-dir>/arc/handoff/<slug>.md`를 작성하거나 갱신할 수 있게 한다.
- 4개 플랫폼 문서에 절차를 쓴다.

**Files:**

- Create: `lib/runtime/handoff-record.mjs`, `tests/node/runtime-handoff-record.test.mjs`
- Modify:
  - `lib/runtime/command.mjs:13-14`: workflow 옵션 파싱 전에 `handoff-record` 분기를 둔다.
  - `lib/installer/runtime-assets.mjs`: `RUNTIME_MODULE_PATHS`에 사전순으로 추가한다. RuntimeHash 입력이 바뀌므로 기존 state는 drift hold가 된다(기존 동작).
  - `*/skill/references/handoff.md`, `*/skill/references/git-recovery.md:25`, `*/skill/references/worktree-creation.md`
  - `tests/node/instruction-layout.test.mjs`, `tests/node/fixtures/instruction-contracts.json`
- 생성물: 절차 G 1, 2(해당 시), 3, 5, 6

**allowedPaths:** `lib/runtime/`, `lib/installer/runtime-assets.mjs`, `shared/skill/runtime/`, `claude/skill/references/`, `codex/skill/references/`, `gemini/skill/references/`, `grok/skill/references/`, `tests/node/`, `MANIFEST.sha256`

**선행:** 없음(독립). 재변경 파일을 줄이려고 마지막에 둔다.

**Interfaces (Produces):**

- `export async function writeHandoffRecord({cwd, slug, content})`
  - 반환: `{decision:'allow', path, created}` | `{decision:'deny', reasonCode:'invalid_slug'|'path_outside_common_dir', message}` | `{decision:'hold', reasonCode:'handoff_write_failed', message, fallback:'inline'}`
  - `cwd`는 절대·정규화 경로다.
  - `slug`는 `/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`에 맞고 `!slug.includes('..')`여야 한다.
  - 대상 경로: `observeCooperativeTarget(cwd)`(`lib/runtime/scope.mjs:21`)가 돌려준 `gitCommonDir` 아래 `arc/handoff/<slug>.md`
    - `within()`으로 범위를 확인한다.
    - symlink 디렉터리는 `inspectPath`로 걸러 거부한다.
  - 쓰기 방식:
    - 같은 디렉터리에 임시 파일을 쓴 뒤 rename한다.
    - 디렉터리가 없으면 `0o700`으로 만든다.
- CLI: `node <runtime>/cli.mjs handoff-record write --cwd <abs> --slug <slug> --input -`
  - stdin: JSON `{"content": string}`(비어 있지 않음)
  - stdout: 결과 JSON 한 줄
  - exit code: allow 0, deny 2, hold 3, 예외 1
  - hold와 예외 결과에는 `fallback: 'inline'` 안내를 넣는다.
  - 권한 변경, sandbox 우회, 재시도를 하지 않는다.

- [ ] **Step 1: 실패 테스트**
  - `writes and updates record from a linked worktree`: 임시 저장소와 `git worktree add`로 만든 linked worktree에서 실행한다.
  - `rejects slug with traversal or separators`: 입력 `../x`, `a/b`, `..`, `''`. 아무 파일도 생기지 않아야 한다.
  - `rejects symlinked handoff directory`
  - `reports failure with inline fallback`
  - `cli parses handoff-record write options`
  - `instruction-layout`: 4개 플랫폼 handoff.md, git-recovery.md, worktree-creation.md에 `handoff-record write`와 fallback 문장이 있다.
- [ ] **Step 2: 실패 확인**
  - `node --test tests/node/runtime-handoff-record.test.mjs tests/node/instruction-layout.test.mjs`
- [ ] **Step 3: 구현과 문서**
  - 문서는 host 중립으로 쓴다: "worktree 세션에서는 파일 도구 대신 이 명령을 쓰고, 실패하면 현행 inline fallback을 쓴다."
  - 기록 필드 계약은 바꾸지 않는다.
- [ ] **Step 4: 생성물과 관련 테스트 통과**
- [ ] **Step 5: Commit**
  - 메시지: `feat(runtime): worktree 세션용 handoff-record write 명령 추가`

**수용 기준:**

- HND AC 3개와 문서 계약을 충족한다.
- 실제 host 세션 동작은 수동 확인 항목이다(설치 후).

**관련 테스트**

| 테스트 | 이유 |
|---|---|
| `runtime-handoff-record` | (a) |
| `runtime-cli`, `runtime-installed-entry`, `runtime-assets`, `management-workflow` | (a) |
| `instruction-layout`, `instruction-language`, `installed-layout-golden`, `manifest` | (b) |
| check 4개 | (c) |

**hold 조건:** `ARC_BRIDGE_CHILD`나 기존 cooperative 잠금과 상호작용해야 하는 것으로 드러날 때

---

## 최종 검증 (SELF-1, D8)

**배정:**

- T1~T7을 모두 수용·커밋한 뒤, verified HEAD에서 fresh 현행 QA(`arc_qa`)를 1회 배정한다.
- brief에 `mode: final`과 "SELF-1(D8): 전체 회귀 자동 실행 금지, 새 4범주 적용(사용자 승인 spec v1.2 D8 근거)"을 적는다.
- 최종 Reviewer는 읽기 전용이므로 동시에 실행해도 된다.

**검증 범주:**

1. **모든 계약 테스트**
   - Node: `tests/node/{test-scope-contract,run-mode-contract,plan-level-records-contract,watch-import-graph,manifest,installed-layout-golden,parity-check,instruction-layout,instruction-language,agent-fragments,role-policy,composite-instructions,profile-render,hardcoding-residual,menu-label-residual}.test.mjs`
   - Python: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract tests.test_arc_policy -v`
2. **모든 check 스크립트**: `npm run check:role-policy`, `npm run check:manifest`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/check-installer-parity.mjs`
3. **재변경 파일의 관련 테스트**
   - Orchestrator가 목록을 계산하고, QA가 `git diff --name-only <task commit> HEAD`로 교차 확인한다.
   - 예상 겹침:
     - T1·T5·T6: policy, fragment, references, profile, test-scope-contract, instruction-contracts, MANIFEST
     - T1·T2·T3·T7: `lib/runtime/*`, `shared/skill/runtime/*`
     - T1·T4: `lib/installer/*`, `lib/platforms/formats/*`
     - T1·T5·T7: handoff.md, git-recovery.md, instruction-layout.test.mjs
     - 전 task: golden, MANIFEST
4. **트리거 대체 검사**
   - 1단계(증거 재사용): 같은 tree에 대한 증거가 있을 때만 재사용하고 근거를 기록한다.
   - 2단계(affected 도구): 이 저장소에는 affected 도구가 없으므로 건너뛰고 그 이유를 기록한다.

**잠정 트리거 판단과 대체 검사 목록·이유 (BRF-1 형식)**

| 트리거 | 잠정 판단 | 대체 검사 | 이유 |
|---|---|---|---|
| (1) 공유 모듈 | 해당 | 변경된 `lib/{runtime,models,policy,prompts,installer,platforms/formats,watch,tui}/*`, `shared/skill/runtime/*`, Python `model_config.py`에서 시작해 역의존성을 전이 추적한다. 기준은 정적 import와 경로 문자열 참조이고 mirror를 포함한다. 도달한 `tests/node/*.test.mjs`와 Python 테스트를 실행한다. 확정하지 못하면 경계를 한 단계 확장한다(저장소 루트 `package.json` 디렉터리) | 정책·runtime·prompt 원천과 mirror·생성물 변경 |
| (2) 외부 변경 통합 | 미해당 예정 | 해당 없음. Orchestrator가 통합 이력을 인용한다 | 통합 계획 없음 |
| (3-a) 의존성 | 미해당 예정 | `git diff --name-only <base> HEAD -- package.json package-lock.json`이 비었는지 확인한다 | lockfile 변경 없음 |
| (3-b) 설정 | 미해당 예정 | 해당 없음. 새 테스트 파일은 기존 glob에 포함된다 | 테스트 설정 변경 없음 |
| (4) 공개 인터페이스 | 해당 | 호출부를 검색한다: `arc_tester`, `arc_qa`, `ROLES`, `ROUTING_ROLES`, `ROLE_TIMEOUT_MINUTES`, `arc-tester`, `arc-routing-tester`, `MODEL_SCHEMA_VERSION`, `ROUTING_CONFIG_VERSION`, `handoff-record`, `--slug`, `legacyResiduals`. 저장소 밖 소비자는 unverified로 둔다 | 설정 키, 상수, 파일명, CLI 명령 변경 |

**예상 판단 불가와 처리:**

- 템플릿 문자열로 경로를 조합하는 테스트(예: `${platform}/agents/arc-${role}.${extension}`)와 `POLICY_TARGETS` 동적 경로는 판단 불가로 예상한다.
- 판단 불가 항목은 곧바로 5단계로 보내 4요소를 보고한다.
- Orchestrator는 UND-2의 세 선택지를 사용자에게 제시하고, 결정 전까지 최종 수용을 보류한다.

**기타:**

- **CI 갈음**: 이 저장소 workflow는 `native-prebuilds.yml`, `npm-publish.yml`뿐이다. 그래서 (ii)는 사실상 불가하다고 brief에 미리 적는다.
- **기준선 Python 실패 36건**: 의도된 기준선이다(contract-test-baseline 대조표 표 3). 2단계 분류를 유지하고, 대조표는 disposition 근거로만 인용한다. `PYTHONDONTWRITEBYTECODE=1`을 쓴다.
- **REN-1 최종 검색과 REN-2 확인**: 부록 A와 대조한다.
- **SELF-1 보고 요건**: 트리거별 판단과 근거, 대체 검사 목록과 이유, 판단 불가 4요소, 사용자 disposition 기록 인용
- **전체 회귀**: 자동 실행하지 않는다. 사용자가 판단 불가 항목에 (i)을 고른 경우에만, 같은 배정의 후속으로 1회 실행한다. 그 HEAD에만 유효하다.
- **최종 Reviewer**: 모든 task 수용 뒤 전체 변경을 1회 검토한다. 초점: PLT-1 host 도구명 부재, MIG-4 소유 판정 의미 보존, legacy 자동 대체 부재, REN-2
- **수동 확인 항목**: HND 실제 host 세션 동작(설치 후)

## 부록 A. REN-1 잔존 목록

Orchestrator가 T1, T5, 최종 검증의 검색 결과로 채운다. 형식: `파일:줄 | 문자열 | 분류 | 사유`

| 파일:줄 | 문자열 | 분류 | 사유 |
|---|---|---|---|
| (작성 예정) | | | |

예상 항목:

- `LEGACY_ROLE_KEYS`, `LEGACY_ROUTING_ROLES`, `LEGACY_COOPERATIVE_ROLES`
- `legacy-profiles.mjs`, Python `_normalize_legacy_roles`
- MIG 테스트
- legacy fixture
- `test-scope-contract`의 retired phrase 목록

## 요구 ID 추적표

| ID | task | 입증 |
|---|---|---|
| MODE-1 | T6 | `mode field and single-mode assignment` + profile-render |
| MODE-2 | T6 | `task mode forbids full regression and reverse dependency search` |
| MODE-3 | T6 (명칭 T5) | `final mode lists four categories and affected tool conditions` |
| MODE-4 | T6 | agent-fragments + retired phrase |
| SUB-0 | T6 (명칭 T5) | 동일성 + retired `runs it once without further authorization` |
| SUB-1~4 | T6 | `trigger substitute checks table` |
| SUB-5 | T6 (명칭 T5) | needle |
| IMP-1 | T6 | `impact procedure order` |
| UND-1 | T6 | `undeterminable report and disposition` |
| UND-2 | T6 | 같음 |
| FR-1 | T6(문안), T1(timeout) | `approved full regression follow-up`, `resume segment uses arc_tester 60 minute timeout` |
| FR-2 | T6 | needle |
| CI-1 | T6 | `ci substitution conditions` |
| BRF-1 | T6 | `planner and brief inputs` + planner rule + 이 plan 최종 검증 절 |
| BRF-2 | T6 | 같음 |
| REN-1 | T1, T5, 최종 검증 | 검색 + 부록 A |
| REN-2 | T5 Step 5, 최종 검증 | `git diff --diff-filter=MDR` 결과 없음 |
| REN-3 | 매 task 절차 G | check 4개 |
| MIG-1 | T1 | Node·Python 새 테스트 + installer-parity |
| MIG-2 | T1 | role-routing-config 새 테스트 3개 |
| MIG-3 | T2 | 새 테스트 3개(4개 플랫폼) |
| MIG-4 | T4 | legacy-profile-cleanup(4개 플랫폼 × 3동작) |
| MIG-5 | T3 | 새 테스트 6개 |
| MOD-1 | T1 | model-catalog·preset·tui-setup |
| MOD-2 | T1 | role-dispatch-policy + coordination·limits |
| MOD-3 | T1 | 기존 권한·gate 테스트 |
| COOP-1 | T3 | runtime-verification·acceptance legacy 사례 |
| COOP-2 | T3, T6 | `final scope still allows review only`, `final-mode results are not cooperative checks` |
| PLT-1 | T2·T4·T5·T6, 최종 Reviewer | 계약 테스트 + 검토 |
| SELF-1 | 최종 검증 | 보고 요건 4항목 |
| HND-1 | T7 | runtime-handoff-record |
| HND-2 | T7 | instruction-layout |

## 진행 기록

| task | 상태 | commit | 비고 |
|---|---|---|---|
| T1 | 대기 | | |
| T2 | 대기 | | |
| T3 | 대기 | | |
| T4 | 대기 | | |
| T5 | 대기 | | |
| T6 | 대기 | | |
| T7 | 대기 | | |
| 최종 검증 | 대기 | | |
| 최종 Reviewer | 대기 | | |

## 개정 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-11-23 | Planner 첫 초안을 Orchestrator가 검토하고 결정(Q1~Q5)을 반영해 저장 |
