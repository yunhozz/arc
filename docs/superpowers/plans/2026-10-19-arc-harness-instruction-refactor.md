# ARC 하네스 지침 리팩토링 및 승인 연속성 구현 계획

> **실행 역할 안내:** ARC의 역할·승인·handoff·수락 계약에 따라 작업별 Coder가 구현하고 Orchestrator가 배정·수락·커밋한다. `writing-plans`의 다른 실행 방식·추가 역할·작업별 Reviewer 지시는 ARC 계약으로 대체한다. 체크박스는 진행 기록이며 별도 커밋 단위가 아니다.

**목표:** superpowers runtime bundles를 보존하면서 Codex·Claude 지침의 계약 책임과 중복을 정리하고, 구체적으로 승인된 no-doc 작업을 필요한 검증과 수락까지 연속 수행하도록 한다.

**구조:** 플랫폼별 payload와 역할 프로필을 독립적으로 유지한다. 각 계약의 책임 참조를 정하고, core·프로필·주입문은 필요한 요약과 역할 경계를 제공하며, 공통 계약 검사가 의미의 일치를 확인한다.

**기술:** Markdown, Codex TOML, Claude frontmatter, Python `unittest`, Node.js ESM 및 `node:test`, 기존 installer·package·manifest 도구.

**승인된 SPEC:** `/Users/ma-24-007/.codex/worktrees/harness-instruction-refactor/arc/docs/superpowers/specs/2026-10-19-arc-harness-instruction-refactor-design.md`

**Plan 경로:** `/Users/ma-24-007/.codex/worktrees/harness-instruction-refactor/arc/docs/superpowers/plans/2026-10-19-arc-harness-instruction-refactor.md`

**Workspace:** `/Users/ma-24-007/.codex/worktrees/harness-instruction-refactor/arc`

**Branch / 기준 HEAD:** `chore/harness-instruction-refactor` / `f39fc3e763ba0b519984b876c78ab1b75520f6f1`

## 1. 승인과 준비 상태

Orchestrator가 제공한 canonical record에 따라 다음을 사용한다.

- 사용자 승인: 전체 설계, 실행 대상·branch candidate, 서면 SPEC.
- Target은 app-managed worktree로 등록되었고 현재 chat attachment가 확인됐다.
- Git common directory는 `/Users/ma-24-007/Desktop/workspace/arc/.git`이다.
- Source `/Users/ma-24-007/Desktop/workspace/arc`는 `master` / 기준 HEAD이며 clean 상태와 보존이 확인됐다.
- Target의 현재 변경은 승인된 SPEC 한 파일의 untracked 상태뿐이다.
- SPEC은 승인 이후 변경되지 않았다.
- 문서 작성·통합은 Orchestrator 소유다. 구현 파일 소유권 충돌은 보고되지 않았다.

SPEC 파일 본문에는 작성 당시의 “승인 전” 문구가 남아 있다. 현재 승인 상태는 후속 사용자 승인과 canonical record를 근거로 판단하며, 이 문구를 실제 승인 부재로 해석하지 않는다.

Orchestrator는 plan 저장·자체 점검·사용자 승인 후, 필요한 전체 문서 집합과 문서 커밋을 확인하고 실제 Git 상태 및 handoff gate를 재검증한다. 이 plan 초안은 구현 착수 승인이 아니다.

## 2. 전역 제약

- 모든 `codex/skill/references/superpowers/**`, `claude/skill/references/superpowers/**`는 변경하지 않는다.
- 공통 지침 생성기, 새 runtime 정책 엔진, Claude managed worktree 지원을 추가하지 않는다.
- 기존 payload 경로, 역할 이름·형식, model·preset·effort, 언어·limits 설정의 의미와 기본값을 유지한다.
- 관리 블록 바깥 사용자 내용, 사용자 변경, source checkout을 보존한다.
- 구체적인 실행 요청은 그 요청 자체의 충분히 특정된 범위에서 승인 근거가 된다.
- 침묵·모호한 동의·별개 작업 승인·Planner가 추가한 중요한 선택을 승인으로 간주하지 않는다.
- 실행 대상 선택·Git·소유권·준비·handoff gate를 유지한다.
- probe 전용과 probe+구현의 승인 범위를 구별한다.
- 문서 깊이와 검증 위험을 별도로 판단한다.
- QA·Reviewer·Orchestrator 수락과 기존 final plan Reviewer 수정 경로를 보존한다.
- 한 top-level task는 한 집중 구현 커밋이다. task 수락 후 Orchestrator가 추가 커밋 승인 없이 커밋한다.
- no-doc 경로에 새 문서 의무나 계획 작업 전용 커밋 의무를 추가하지 않는다.
- 구조 검사를 실제 모델의 runtime 준수 증거로 표현하지 않는다.
- 새 설명·보고는 한국어를 기본으로 하되 식별자·명령·설정 literal은 보존한다.
- 저장소의 실제 커밋 메시지는 사용자 제공 Conventional Commits 규칙에 따라 간결한 한국어 description을 사용한다.

## 3. 집중 점검 대상

| 실패 조건 | 기대 동작 | 담당 |
|---|---|---|
| 요청이 충분히 구체적이지만 새 역할 배정·재개가 발생함 | 유효한 승인을 재사용하고 실제 상태만 갱신하며 계속 수행 | T1 |
| probe만 승인했거나 조사 후 구현이 중요한 새 결정을 요구함 | 승인 범위를 확대하지 않고 해당 구현을 보류 | T1 |
| 중복 제거로 역할 프로필이 불완전해지거나 플랫폼 차이가 사라짐 | 역할의 로컬 경계와 플랫폼 adapter 계약 유지 | T1 |
| 주입문 축약·profile 수정 이후 설치가 사용자 내용을 덮어쓰거나 marker를 손상함 | 외부 bytes·설정 의미·정확한 marker 치환 보존 | T2 |
| 운영 설명이 새 gate를 만들거나 구조 검사를 runtime 성공으로 설명함 | 책임 지침과 일치하며 증거 한계를 명시 | T3 |

각 항목의 양성·음성 조건을 해당 task의 검사와 수락 증거에 포함한다.

## 4. 작업 경계·의존성·배정

| ID | 작업 | 의미상 선행 조건 | 편집·수락 순서 |
|---|---|---|---|
| T1 | 양 플랫폼 runtime 계약과 승인 연속성 정리 | 승인된 SPEC·plan, 전체 handoff | 첫 번째 |
| T2 | 설치 주입문 최소화와 렌더링·package 호환성 | 승인된 SPEC·plan. 최종 연결 대상은 T1 결과 사용 | T1 수락·커밋 후 |
| T3 | 운영 문서·전체 점검 기록 정합성 | T1·T2 수락·커밋 | 마지막 |

T1과 T2의 사전 읽기·변경 제안은 독립적으로 준비할 수 있다. T3도 현재 문서의 불일치 목록을 먼저 조사할 수 있다. 실제 구현은 이 worktree에서 순차 배정한다.

이유는 다음과 같다.

- 기존 Python 계약 검사는 양 플랫폼과 주입문을 함께 참조한다.
- `tests/test_harness_contract.py`는 runtime 계약 검사와 운영 문서 검사를 함께 가진다.
- 보호 payload가 바뀔 때마다 `MANIFEST.sha256`을 해당 task의 최종 상태와 일치시켜야 한다.
- 다른 task의 미수락 변경까지 manifest에 반영하면 커밋 단위의 재현성과 소유권이 흐려진다.

추가 worktree나 새로운 manifest 생성 방식을 도입해 병렬 편집을 강행하지 않는다. Orchestrator는 준비 결과를 병렬로 받을 수 있지만 같은 파일의 편집 소유권과 수락 후보 상태는 직렬화한다.

초기 실행 ready batch는 T1이다. T2·T3의 편집 배정은 위 선행 수락·커밋 조건을 기다린다.

## 5. 공통 수락·커밋 절차

각 task는 다음 절차를 따른다.

1. Orchestrator가 승인 범위, 파일 소유권, 실제 Git 상태, 의존성, capacity와 handoff gate를 확인한다.
2. Coder가 해당 task의 정책·검사·필요 문서를 함께 수정한다.
3. 해당 task의 변경만 있는 안정된 후보 상태에서 Coder가 manifest를 갱신한다.
4. 요구된 QA 또는 Orchestrator 집중 검사를 수행한다.
5. Orchestrator가 task 기준을 실제 증거와 연결하고 지적·공백을 처분해 수락한다.
6. Orchestrator가 task 범위만 stage하고 집중 커밋한 뒤 SHA·메시지·경로·HEAD·남은 변경을 확인한다.

검사 실패 후 수정으로 후보가 바뀌면 영향을 받는 검사와 필요한 QA를 다시 수행한다. task 수락 전에는 후속 task가 공유 파일을 편집하지 않는다.

---

## T1. 양 플랫폼 runtime 계약과 승인 연속성 정리

**목표:** 승인 연속성을 구현하고, 모든 비-superpowers runtime 지침의 책임·역할 경계·참조를 함께 정리한다.

**위험:** 공유 역할·승인·행동 계약 변경이므로 significant.

**선행 작업:** 없음. 승인된 SPEC·plan과 실제 handoff 준비가 입력이다.

### 파일 소유권

Coder가 다음을 소유한다.

- `codex/skill/SKILL.md`
- `claude/skill/SKILL.md`
- 양 플랫폼 `skill/references/`의 비-superpowers Markdown 전체
- `codex/agents/arc-scouter.toml`
- `codex/agents/arc-planner.toml`
- `codex/agents/arc-coder.toml`
- `codex/agents/arc-qa.toml`
- `codex/agents/arc-reviewer.toml`
- 대응하는 `claude/agents/arc-*.md` 5개
- `tests/test_arc_policy.py`
- `tests/test_claude_payload.py`
- `tests/test_harness_contract.py`의 runtime 계약 검사
- 필요할 경우 `tests/test_codex_models.py`의 기존 의미를 보존하는 검사 정합성 수정
- `MANIFEST.sha256`

`lib/installer/`와 운영 문서의 편집은 T2·T3가 담당한다. T1이 해당 파일을 수정해야만 독립적으로 검증 가능하다고 판단되면 편집 전에 Orchestrator에 보고한다.

### 입력·산출 계약

- 입력: SPEC의 AUTH-01–AUTH-05, Spike·Bounded 조건, 상태 전이, 보존 계약.
- 산출: 공통 의미와 플랫폼별 차이가 명확한 runtime 지침 및 이를 검사하는 계약 대응.
- 기존 `policy_contract_failures(texts: Mapping[str, str]) -> list[str]`는 테스트용 검사 인터페이스로 유지한다.
- 테스트용 계약 표를 runtime 정책 엔진이나 코드 생성기로 확장하지 않는다.

### 구현 단계

- [ ] 각 runtime 파일의 계약을 SPEC §4.1 책임 위치와 대응시키고 유지·축약·이관·수정 이유를 Coder 보고에 기록한다.
- [ ] 기존 계약 검사에서 의미 검증과 문장·위치 고정을 구분한다.
- [ ] 승인 연속성의 누락·반전이 검출되도록 검사 항목을 먼저 추가한다.
- [ ] 추가한 검사가 아직 없는 새 정책 때문에 실패하는지 확인한다. import·환경 실패를 정책 누락의 실패로 보고하지 않는다.
- [ ] `planning.md`에 구체적 요청의 승인 인정·불인정, 문서 깊이 판단, Spike/Bounded 범위를 정의한다.
- [ ] `handoff.md`에 승인 근거·범위·유효한 재사용·실제 상태 갱신을 연결한다.
- [ ] core·direct path·프로필의 무조건적인 재승인 문구를 정합화한다. 기존 저위험 자격과 실행 대상 선택은 보존한다.
- [ ] `verification.md`·`commit.md`에 완료·수락·증거 한계의 기존 계약을 유지하고 참조를 정리한다.
- [ ] Git 준비·worktree·복구·limits·visual companion의 중복을 점검하고 책임 위치를 정리한다.
- [ ] 프로필의 독립 실행에 필요한 금지·입출력·보고 조건을 남긴다.
- [ ] 의미를 잃지 않도록 기존 검사를 수정하고 전체 task 검사를 통과시킨다.
- [ ] manifest를 갱신하고 독립 QA에 후보 상태와 기준별 증거를 전달한다.

### 추가·정합화할 검사

`tests/test_harness_contract.py`의 공통 계약 표와 검사에 다음 의도를 반영한다. 아래 이름은 새 검사 제안이다.

| 검사 이름 | 확인할 내용 |
|---|---|
| `test_explicit_request_authorization_has_scoped_conditions` | 실행 의도·충분한 범위·중요 결정 부재·기록 조건이 함께 존재 |
| `test_authorization_rejects_silence_and_scope_expansion` | 침묵·다른 승인·새 중요 선택을 승인으로 확대하는 변경 검출 |
| `test_approved_no_document_scope_requires_completion` | 중간 보고 이후 필요한 실행·검사·수락까지 이어지는 의무 |
| `test_probe_and_combined_bounded_scope_remain_distinct` | probe-only와 충분히 특정된 probe+구현의 구별 |
| `test_authorization_reuse_preserves_target_and_state_gates` | 승인 재사용과 대상·Git 재검증이 함께 유지 |
| `test_contract_mutations_reject_removed_holds_and_role_guards` | 보류·역할 금지·플랫폼 경계 삭제나 반전을 검출 |

이 검사는 작성된 정책의 계약 검사다. 자연어 사용자 요청을 실제 모델처럼 판정하는 시뮬레이터로 구현하지 않는다.

기존 Codex 중심 검사는 책임 파일 이동을 반영하도록 조정한다. 단순히 기존 assertion을 삭제하거나 기대 문자열을 현재 출력에 맞추는 방식으로 계약을 약화하지 않는다.

### 필수 검사

Workspace에서 실행한다.

```text
python3 tests/test_harness_contract.py
python3 tests/test_arc_policy.py
python3 tests/test_claude_payload.py
python3 tests/test_codex_models.py
node --test tests/node/profile-render.test.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

manifest 갱신은 Coder가 다음 기존 도구로 수행한다.

```text
node scripts/update-manifest.mjs
```

양 플랫폼 runtime bundle 불변 여부도 확인한다.

```text
git diff --exit-code f39fc3e763ba0b519984b876c78ab1b75520f6f1 -- codex/skill/references/superpowers claude/skill/references/superpowers
```

### 수용 기준·증거

- AUTH-01–AUTH-05와 SPEC §6–9의 계약이 양 플랫폼에 반영된다.
- plan 생략 조건과 서면 SPEC 선행 승인 순서가 유지된다.
- 일반 동작·significant 작업의 QA, 최종 Reviewer 시점·수정 경로, Orchestrator 수락이 유지된다.
- Codex worktree와 Claude current-checkout-only 차이가 유지된다.
- 전체 runtime 파일의 점검 결과와 책임 이동을 설명할 수 있다.
- 역할별 완전성과 상대 참조가 유효하다.
- 위 검사와 독립 QA의 기준별 판정이 제출된다.
- superpowers 불변과 manifest 정합성이 확인된다.

Orchestrator는 이 증거와 지적 처분을 확인해 T1을 수락하고 집중 커밋한다. 최종 전체 Reviewer를 기다리는 것을 T1 수락의 추가 조건으로 만들지 않는다.

**커밋 메시지 제안:** `refactor(policy): 승인 연속성과 하네스 계약 책임 정리`

### 보류 조건

- 승인 인정이 미확정 후속 구현의 포괄 승인으로 확대됨.
- 역할·위험·대상·Git·문서 순서 계약 제거가 필요하다고 판단됨.
- 역할의 독립 실행이 깨지거나 플랫폼 전용 기능이 혼입됨.
- 소유 범위 밖 파일 변경이 독립 검증에 필수임.
- 필수 검사 실패·미실행, 소유권·Git 상태 불일치, superpowers 변경.

---

## T2. 설치 주입문 최소화와 렌더링·package 호환성

**목표:** 설치 주입문을 ARC 진입과 최소 역할 경계에 집중시키고, 리팩토링된 지침이 기존 설치·언어·profile·package 계약으로 전달되는지 확인한다.

**위험:** 주입 지침과 설치 경계에 영향을 주므로 significant.

**선행 작업:** T1 수락·집중 커밋과 최신 handoff 재검증.

### 파일 소유권

Coder가 다음을 소유한다.

- `lib/installer/global-config.mjs`
- `tests/node/global-config.test.mjs`
- `tests/node/language.test.mjs`
- `tests/node/plan.test.mjs`
- `tests/node/profile-render.test.mjs`
- `tests/node/package.test.mjs`
- `tests/node/manifest.test.mjs`
- 필요할 경우 `tests/test_arc_policy.py`의 주입문 연동 assertion
- `MANIFEST.sha256`

다음은 우선 점검 대상이며, 지침 통합·호환성에 필요한 최소 변경만 허용한다.

- `lib/installer/language.mjs`
- `lib/installer/plan.mjs`
- `package.json`
- `scripts/update-manifest.mjs`
- `lib/installer/manifest.mjs`

새 형식·설정·획득 경로가 필요하면 범위 변경으로 보고한다.

### 입력·산출 계약

- 입력: T1의 core 진입점과 역할·승인·참조 계약.
- 유지할 인터페이스:
  - `agentsBlockBody(home, userHome, language='en')`
  - `renderLanguagePolicy(bytes, language)`
  - 기존 `buildInstallPlan` 호출·결과 계약.
- 산출: 최소 주입문과 기존 설치 결과 형식을 보존하는 회귀 증거.
- 최소화 과정에서 언어·routing·Planner 소유권·좁은 direct path 경계를 삭제하지 않는다.
- 상세 실행 절차는 core와 책임 참조로 연결한다.

### 구현 단계

- [ ] `agentsBlockBody`의 각 문장을 진입·언어·역할 경계 또는 중복 절차로 분류한다.
- [ ] 문장 수·줄 수 같은 형식 고정을 의미 검사로 바꾸되, 기존 권한 경계는 보존한다.
- [ ] 주입문 변경 전 누락·경로 오류·역할 경계 손상을 검출하는 검사를 추가한다.
- [ ] 중복 절차를 축약하고 현재 설정된 설치 경로와 홈 표시 방식은 유지한다.
- [ ] `en`·`ko`, 명시적 사용자 언어 override, marker 정확히 하나, 잘못된 marker 거부를 확인한다.
- [ ] TOML/frontmatter와 model 이외 bytes 보존, CRLF·기존 관리 블록 갱신·외부 내용 보존을 확인한다.
- [ ] package payload 및 상대 참조, license·기존 superpowers 포함 상태를 확인한다.
- [ ] 필요 변경만 수행하고 manifest를 갱신한다.
- [ ] 독립 QA에 설치 경계와 보존 증거를 전달한다.

### 추가·정합화할 검사

| 검사 의도 | 위치 |
|---|---|
| 두 플랫폼의 실제 core 경로 및 최소 routing·역할 경계 | `global-config.test.mjs` |
| 관리 블록 바깥 bytes, CRLF, 반복 적용·제거 보존 | 기존 `global-config.test.mjs` 유지 |
| `en`·`ko` 및 사용자 override·marker 개수 | 기존 `language.test.mjs` 유지·보완 |
| core·5개 프로필에 치환이 적용되고 원치 않는 쓰기가 없음 | `plan.test.mjs` |
| prose·frontmatter·nested model 유사 문자열 보존 | 기존 `profile-render.test.mjs` 유지 |
| package의 필수 runtime 파일·상대 참조·license 포함 | `package.test.mjs` |
| 보호 payload 누락·변조 검출, mutable/dynamic 제외 유지 | 기존 `manifest.test.mjs` 유지 |

### 필수 검사

```text
node --test tests/node/global-config.test.mjs tests/node/language.test.mjs tests/node/plan.test.mjs tests/node/profile-render.test.mjs tests/node/package.test.mjs tests/node/manifest.test.mjs
python3 tests/test_arc_policy.py
python3 tests/test_claude_payload.py
python3 tests/test_codex_models.py
node scripts/update-manifest.mjs --check
git diff --check
```

검사는 기존의 임시 디렉터리·fixture를 사용한다. 실제 사용자 홈에 설치하거나 실제 upstream 갱신을 수행하는 실험은 포함하지 않는다.

### 수용 기준·증거

- 상세 계약을 중복 정의하지 않는 최소 주입문이 core로 연결된다.
- 변경 전후 주입문 책임 대응과 축약 근거가 제출된다.
- marker·언어·model·profile 형식과 사용자 외부 bytes 보존이 확인된다.
- package·manifest 검사 및 독립 QA의 기준별 판정이 제출된다.
- T1 계약과 superpowers 불변이 유지된다.

**커밋 메시지 제안:** `refactor(installer): 하네스 주입 지침과 렌더링 계약 정리`

### 보류 조건

- model·language·limits 설정 의미나 default 변경이 필요함.
- 관리 블록 밖 데이터, 실제 사용자 홈 또는 bundle 갱신이 필요함.
- 설치 transaction·안전한 파일 접근의 일반 리팩토링으로 확대됨.
- 기존 profile 형식·payload 경로 변경이 필요함.
- 필수 검사·QA 실패 또는 package·manifest 불일치.

---

## T3. 운영 문서와 전체 점검 기록 정합성

**목표:** 운영 설명을 최종 책임 지침과 일치시키고 전체 점검 범위·증거 한계·완료 기준을 사용자에게 설명한다.

**위험:** 새 정책·실행 코드 변경이 없는 명확한 설명 정합성 작업이면 small, low risk. 그 조건을 벗어나면 Orchestrator가 재분류한다.

**선행 작업:** T1·T2 수락·집중 커밋.

### 파일 소유권

Coder가 다음을 소유한다.

- `README.md`
- `docs/harness-operation.md`
- `tests/test_harness_contract.py`의 문서 검사와 필요한 공통 검사 정합성
- `MANIFEST.sha256`

`docs/images/role-flow.svg`와 다른 시각 자산은 이번 task에서 수정하지 않는다. 기존 도식의 세부 내용이 새로운 승인 연속성을 표현하지 않는다는 이유만으로 시각 자산 재설계를 추가하지 않는다. 실제로 잘못된 계약을 표시한다면 영향을 설명하고 Orchestrator에 범위 판단을 요청한다.

### 입력·산출 계약

- 입력: T1·T2의 수락된 최종 책임 파일과 설치 동작.
- 산출: 새로운 gate를 만들지 않는 운영 설명과 유효한 책임 참조.
- 전체 파일 점검 결과는 canonical record 또는 task 보고에 모은다. 별도 장기 유지 문서를 새로 만들 필요는 없다.

### 구현 단계

- [ ] README와 운영 문서를 최종 runtime·installer 계약과 대응한다.
- [ ] 승인 요청의 재사용, probe-only와 probe+구현, Bounded 생략 조건, 정당한 보류를 설명한다.
- [ ] Codex/Claude 차이, 문서·대상 준비 순서, 위험별 QA/Reviewer와 task·최종 수락 차이를 정합화한다.
- [ ] 기존 final plan Reviewer 수정 경로와 그 이전 QA 재검증을 정확히 구별한다.
- [ ] 구조 검사·package 무결성과 실제 runtime 관찰의 한계를 명시한다.
- [ ] 관련 source map과 로컬 링크·anchor를 갱신한다.
- [ ] 영문 문장 고정 검사와 의미 계약을 구분해 문서 검사를 조정한다.
- [ ] 전체 점검 목록에서 누락된 파일·책임 계약이 없는지 확인한다.
- [ ] manifest를 갱신하고 Orchestrator 집중 검사에 증거를 제공한다.

### 기존 검사 충돌 처리

현재 `test_harness_contract.py`에는 운영 문서·도식에 한국어가 없음을 검사하는 항목과 영문 heading을 고정한 항목이 있다.

이 task는 새 한국어 설명을 금지하는 검사를 유지하지 않는다. 다음과 같이 정합화한다.

- 운영 문서는 SPEC에 요구된 항목·경계·책임 링크를 검사한다.
- 도식은 이번 범위에서 변경하지 않으므로 기존 도식 검사와 영문 label 검사를 유지한다.
- 운영 문서의 언어 변경을 도식 변경의 이유로 사용하지 않는다.
- commit 안내의 영문 기본 설명과 실제 저장소의 사용자 지정 한국어 커밋 규칙을 혼동하지 않는다. 사용자·저장소 지시 우선순위를 보존한다.
- 언어 설정 스키마나 runtime의 `en`·`ko` 선택 의미는 바꾸지 않는다.

### 필수 집중 검사

```text
python3 tests/test_harness_contract.py
node --test tests/node/package.test.mjs tests/node/manifest.test.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

Orchestrator는 내용과 링크를 직접 읽고 기준별 증거를 확인한다. 이 task가 정의한 저위험 범위를 유지하면 task 경계만을 이유로 QA·Reviewer를 추가하지 않는다.

### 수용 기준·증거

- 운영 설명이 수락된 정책·설치 동작과 일치한다.
- 운영 문서 자체가 승인·선택·검증 gate를 추가하지 않는다.
- 전체 점검 대상의 유지·축약·이관·수정 결과가 식별된다.
- 기존 링크·anchor와 package·manifest 정합성이 확인된다.
- 참고 스레드를 no-doc 중단 재현 증거로 단정하지 않는다.
- 실행하지 않은 runtime 관찰은 미검증으로 설명한다.
- Orchestrator의 문서 내용·링크 집중 판정이 제출된다.

**커밋 메시지 제안:** `docs(harness): 운영 절차와 검증 증거 기준 정리`

### 보류 조건

- 문서를 맞추기 위해 runtime 계약이나 installer 동작을 다시 바꿔야 함.
- 새 승인·실행 권한·검증 면제를 설명에 추가해야 함.
- 시각 자산의 사실 오류가 확인돼 범위 판단이 필요함.
- 문서·계약 검사나 package·manifest 검사 실패.
- task가 저위험 설명 변경을 벗어남.

---

## 6. SPEC 수용 기준 대응

| SPEC 기준 | 구현·수락 책임 |
|---|---|
| AC-01 전체 점검·책임 위치 | T1 runtime 목록, T2 설치 목록, T3 전체 대응 완료 |
| AC-02 승인 인정·불인정 | T1 |
| AC-03 no-doc 완료 의무 | T1 |
| AC-04 probe 범위 구별 | T1 |
| AC-05 문서 생략·승인 순서 | T1 |
| AC-06 대상·Git·소유권·재개 | T1 |
| AC-07 역할·QA/Reviewer·수락·commit | T1, T3 설명 정합성 |
| AC-08 플랫폼·역할 독립성 | T1, T2 렌더링 |
| AC-09 중복·참조 | T1·T2·T3 각각의 변경 근거 |
| AC-10 설치·package·manifest | T2, 각 task의 manifest, 최종 전체 검사 |
| AC-11 superpowers 불변 | 각 변경 후보 및 최종 기준 diff |
| AC-12 증거·완료 보고 | 각 task 수락 기록, 최종 전체 수락 |

## 7. 최종 전체 검증과 수락

이 절은 각 task 수락 이후의 전체 plan 검증이다. 이미 독립적으로 수락 가능한 task의 집중 커밋을 이 단계까지 미루지 않는다.

Orchestrator는 마지막 task 커밋 이후 다음을 수행한다.

- 전체 기준과 수락된 task·커밋·증거의 대응을 확인한다.
- 실제 source/target path, branch/HEAD, 변경 상태·소유권·보존을 갱신한다.
- 전체 누적 상태에서 다음 검사를 수행하거나, 동일 최종 상태에서 이미 실행된 범위·freshness가 충분한 증거를 재사용한다.

```text
python3 -m unittest discover -s tests -p 'test_*.py'
npm test
node scripts/check-installer-parity.mjs --complete
node scripts/update-manifest.mjs --check
git diff --check f39fc3e763ba0b519984b876c78ab1b75520f6f1
git diff --exit-code f39fc3e763ba0b519984b876c78ab1b75520f6f1 -- codex/skill/references/superpowers claude/skill/references/superpowers
```

기존 parity inventory를 삭제·완화하거나 새 retirement를 만들어 검사를 통과시키지 않는다. assertion의 정당한 이동으로 mapping 조정이 필요하면 원래 보호 계약과 실제 실행된 대응을 보존한다.

필수 검사·QA와 필요한 재검증 이후 **최종 전체 변경에 대한 독립 Reviewer 검토를 한 번 수행**한다. 검토 범위에는 runtime·bootstrap·운영 문서·검사 약화 여부·package/manifest·플랫폼 차이·superpowers 불변을 포함한다.

최종 plan Reviewer 지적의 수정은 기존 계약대로 Coder → Reviewer 재검토 경로로 처리하며 QA를 다시 배정하지 않는다. 최신 committed 상태와 uncommitted 수정 diff를 제공하고, 이전 QA를 수정 후 검증으로 주장하지 않는다. 그 이전 단계의 QA 실패는 필요한 QA 재검증을 유지한다.

최종 수락에는 다음이 필요하다.

- 모든 task의 수락·집중 커밋과 전체 기준의 증거 연결.
- 필수 검사 및 최종 Reviewer 지적의 해결 또는 명시적 처분.
- 증거 공백·환경 제약·미검증 runtime 범위의 공개.
- source 보존, target 최종 상태, 남은 변경의 정확한 보고.
- Orchestrator의 최종 plan 수락.

push·merge·배포·게시·실제 전역 설치는 이 계획에 포함하지 않는다.

## 8. 가정과 범위 판단

- 참고 스레드는 사용자가 보고한 no-doc 중단을 재현한 증거가 아니다. 정책 보완의 필요성과 실제 재현 여부를 구별한다.
- native runtime 지침 준수 실험은 이번 필수 수용 증거에 포함하지 않는다. 구조 검사와 실제 관찰을 구별해 보고한다.
- 기존 package 경로와 설정 스키마를 유지하므로 일반적인 installer 재설계는 필요하지 않다는 가정이다.
- 각 task의 manifest 갱신으로 수락된 커밋이 자체 payload와 일치하도록 한다.
- 필요한 도구·native fixture 환경이 없으면 정확한 검사와 영향을 보고한다. 환경 실패를 제품 실패나 검사 통과로 바꾸지 않는다.
- 구현 중 독립 검증 불가능한 새 결합이 확인되면 해당 작업을 보류한다. 서로 다른 승인 task를 실행 도중 임의로 합치지 않고 Orchestrator가 범위·계획·승인 변경을 처리한다.

---

**자체 점검 결과**

- SPEC의 AUTH 요구사항과 AC-01–AC-12를 세 task 및 최종 검증에 대응시켰습니다.
- 양 플랫폼 runtime·프로필·공통 검사는 T1에 함께 두어 부분 정합성 상태를 수락하지 않도록 했습니다.
- bootstrap·설치 호환성은 T2, 운영 설명은 T3로 구분하되 공유 파일·manifest 때문에 실제 편집은 순차 배정하도록 했습니다.
- 모든 task에 범위·소유권·의존성·수용 기준·검사·증거·보류 조건을 포함했습니다.
- Reviewer를 task 수락 조건으로 추가하지 않았고, 최종 전체 검토와 기존 수정 경로를 구별했습니다.
- 기존 영문 고정 문서 검사와 한국어 설명의 충돌을 명시했습니다.
- 존재하지 않는 `codex/skill/scripts/parity-check.py`는 계획에 사용하지 않고, 확인된 `scripts/check-installer-parity.mjs`를 지정했습니다.
- 파일 저장·구현·검사·새 승인 취득은 수행하지 않았습니다.
