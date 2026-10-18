# ARC 하네스 지침 전수 조사 및 정합화 실행 계획

> **에이전트 실행자:** 현재 ARC 역할 계약을 따른다. Orchestrator가 조정·승인 확인·수락·커밋을 담당하고, Scouter는 읽기 전용 의미 조사를, Planner는 명세·계획 초안을, Coder는 승인된 구현을, QA는 필요한 검증을 담당한다. 체크박스는 진행 기록이며 독립 커밋 단위가 아니다.

**Goal:** ARC 소유 지침 29개와 생성 전역 지침을 전수 검토하고, 필요한 보호와 플랫폼 차이를 유지하면서 승인된 모순·의미 편차를 해결한다.

**Architecture:** 기존 Codex·Claude 파일 구조를 유지한다. Coder 시작 전에 Scouter가 전체 규칙의 의미 검토를 완료하고, Planner가 조사 결과를 명세 부록에 통합한다. 갱신된 명세의 재승인을 거친 뒤 확정된 정책 변경을 독립적으로 검증·수락·커밋한다.

**Tech Stack:** Markdown, Codex TOML 역할 프로필, Claude Markdown 역할 프로필, Python `unittest`, Node.js 테스트와 manifest 스크립트.

**Spec:** `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-19-arc-instruction-audit-design.md`

**초기 승인 명세 SHA-256:** `3b30e46f192efe5df0c8814f60b7774a3fdece72c4d82742965c69be9cb95001`

**S0/F08 반영 수정 명세 SHA-256:** `7f8f92bde8d7b4af763508426fc5f9800c896286c296004315c88b1c906f523e`

**계획 상태:** F08 반영 계획은 승인되어 통합 문서 커밋 `b400e694dbe3819d5ab156cade6ef172818302fb`에 기록되었다. 아래 BQ01 개정은 별도 사용자 승인 전이며, 승인 전 문서 커밋·Coder 착수를 허용하지 않는다.

F08 반영 계획 SHA-256 `b333f5c4004d28af5460457f0347c12e723e01d6d134686ee1cb0e21ae0f8ff0`는 사용자 승인을 받았으며, 현재 문서 상태는 통합 커밋 `b400e694dbe3819d5ab156cade6ef172818302fb`에 기록되어 있다.

초기 계획 SHA-256 `a2331f8e889b0c81a0059953af1a252787053d4337b0e97e0ea95672173d47e3`는 F01/F02만 포함했던 과거 승인 버전이다. 이후 F08을 반영한 계획이 별도로 승인되었으므로 초기 버전의 승인 대기 표현은 현재 상태에 적용하지 않는다.

현재 승인 대기 대상은 아래에 추가된 BQ01 개정뿐이다. 이 개정을 포함한 새 계획 버전의 별도 사용자 승인 전에는 해당 문서 갱신 커밋이나 Coder 착수를 진행하지 않는다.

**현재 저장 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-19-arc-instruction-audit.md`

## 1. 전역 제약

- 실행 경로는 `/Users/yunho/Desktop/project/arc`이다.
- 선택된 branch는 `chore/planner-workspace-before-documents`이다.
- 인계 기준 HEAD는 `c1a129457615e67ea760a3a04d097ec6aa2b3fe1`이다. 이후 승인된 문서·작업 커밋에 따른 변경은 인계 기록으로 연결한다.
- 조사 대상은 명세 부록 A의 29개 지침 문서와 G01 생성 지침 텍스트이다.
- 기존 `docs/**`와 양쪽 `skill/references/superpowers/**`는 감사 입력에서 제외한다.
- 이번 명세·계획은 실행 기준과 증거 기록으로 읽을 수 있다.
- package·installer·manifest·tests는 관련 지침의 전달·검증에 필요한 보조 근거로만 사용한다.
- D1–D5, F01–F11, AC01–AC10을 유지한다.
- 수정 명세의 F07–F11 disposition을 유지한다.
- 사용자 승인 F08: 양 플랫폼에서 Orchestrator만 수락 후 집중 커밋을 소유·실행하며, Claude Coder는 위임받아도 커밋하지 않는다.
- 설계·명세·계획 초안은 Planner만 작성한다.
- 공통 원본 생성기, 일반 installer 리팩터링, 별도 감사 도구, 런타임 준수 연구를 추가하지 않는다.
- 플랫폼 차이를 바이트 동일성으로 평가하지 않는다.
- 역할별 안전장치는 도달 가능성과 대체 근거 없이 삭제하지 않는다.
- 하나의 승인된 최상위 구현 작업은 Orchestrator 수락 뒤 하나의 집중 커밋으로 완료한다.
- 필요한 검사와 수락 증거가 없는 작업을 커밋하지 않는다.
- Reviewer를 작업마다 배정하지 않는다. 최종 전체 변경에 대한 독립 검토를 한 번 수행한다.

## 2. 검토 초점

| 상황 | 기대 행동 | 담당 단계·검증 |
|---|---|---|
| Planner 전담 문구와 사용자 작성 책임 예외가 함께 존재 | 상충 예외를 검출하고 전담 정책 유지 | T1의 양 플랫폼 충돌 주입 검사 |
| 언어·출력 경로·작업 범위의 사용자 선호 | 작성 책임 예외로 오인하여 거부하지 않음 | T1의 사용자 선호 허용 fixture |
| 수락 후 커밋을 계획 끝으로 미루거나 수락 전 커밋 허용 | 금지된 순서와 상충 요구 검출 | T2의 순서·충돌 주입 검사 |
| 올바른 Orchestrator 전담 문구와 Claude Coder 위임 예외 공존 | 충돌 예외 재도입 검출 | T2의 COMMIT_AUTHORITY 긍정·충돌 fixture |
| 필요한 플랫폼 차이와 역할별 직접 보호 | 통합 과정에서 유지 | S0의 의미 대조, 기존 adapter·role-local 계약 검사 |
| 새 발견 또는 승인되지 않은 행동 변경 | 관련 변경 보류, 승인된 F01/F02/F08과 분리 | S1 승인 게이트와 최종 발견 추적 |

마지막 행은 실행 절차의 승인 증거로 확인한다. 이를 검증하기 위한 별도 런타임 엔진이나 형식적인 코드 테스트는 추가하지 않는다.

## 3. 파일 구조와 책임

모든 상대 경로의 기준은 `/Users/yunho/Desktop/project/arc`이다.

### 3.1 조사 대상

정확한 전체 목록은 승인된 명세 부록 A의 C01–C15, L01–L14, G01을 사용한다.

- `codex/skill/SKILL.md`
- `codex/agents/arc-scouter.toml`
- `codex/agents/arc-planner.toml`
- `codex/agents/arc-coder.toml`
- `codex/agents/arc-qa.toml`
- `codex/agents/arc-reviewer.toml`
- `codex/skill/references/planning.md`
- `codex/skill/references/handoff.md`
- `codex/skill/references/handoff-prep.md`
- `codex/skill/references/verification.md`
- `codex/skill/references/git-recovery.md`
- `codex/skill/references/commit.md`
- `codex/skill/references/limits.md`
- `codex/skill/references/visual-companion.md`
- `codex/skill/references/handoff-worktree.md`
- `claude/skill/SKILL.md`
- `claude/agents/arc-scouter.md`
- `claude/agents/arc-planner.md`
- `claude/agents/arc-coder.md`
- `claude/agents/arc-qa.md`
- `claude/agents/arc-reviewer.md`
- `claude/skill/references/planning.md`
- `claude/skill/references/handoff.md`
- `claude/skill/references/handoff-prep.md`
- `claude/skill/references/verification.md`
- `claude/skill/references/git-recovery.md`
- `claude/skill/references/commit.md`
- `claude/skill/references/limits.md`
- `claude/skill/references/visual-companion.md`
- `lib/installer/global-config.mjs`의 생성 지침 텍스트

G01의 조건별 출력이 다르면 하위 항목으로 기록한다. `agentsBlockBody(home,userHome,language='en')`를 중심으로 지침을 확인하며, 파일의 일반 설정 처리 로직은 감사하지 않는다.

### 3.2 계획 개정안의 구현 대상

| 경로 | 책임 |
|---|---|
| `codex/skill/references/planning.md` | Planner 작성 책임 예외 정리 |
| `claude/skill/references/planning.md` | 같은 정책 정합화 |
| `codex/skill/references/commit.md` | 수락 후 다음 행동과 커밋 관계 명확화 |
| `claude/skill/references/commit.md` | 같은 시점·Orchestrator 전담 실행 요구, 위임 예외 제거 |
| `claude/agents/arc-coder.md` | Coder의 직접 commit 권한 금지 |
| `tests/test_harness_contract.py` | 작성 책임·커밋 시점·권한의 적용 조건·상충 조합 검증 |
| `MANIFEST.sha256` | 각 작업의 배포 지침 변경에 따른 무결성 갱신 |

`codex/skill/SKILL.md`, `claude/skill/SKILL.md`, Codex Coder 프로필, 나머지 역할 프로필, G01은 현재 승인된 구현 범위에서 수정하지 않는다. S0에서 추가 수정 필요성이 확인되면 승인된 결정과 파일 범위를 확정한 계획 개정이 먼저 필요하다. Claude Coder 프로필은 승인된 F08의 직접 대상이다.

### 3.3 실행 기록

- 명세 부록 A: 파일별 의미 검토 상태와 규칙 연결.
- 명세 부록 B: 규칙·발견별 분류와 처리 결정.
- 계획 작업 기록: 검사 결과, 수락, 커밋, 보류 사항.
- `.git/arc/handoff/harness-instructions-audit.md`: 현재 승인 버전과 실행 상태 연결.

별도 audit matrix 문서는 생성하지 않는다.

## 4. Coder 전 필수 준비 단계

S0·S1은 구현 작업을 배정하기 위한 준비·승인 게이트이다. 별도의 구현 커밋 단위로 취급하지 않는다.

### S0. Scouter 읽기 전용 전수 의미 검토 — 완료

**선행 조건:** 이 계획 승인, 선택된 작업 경로 확인, 승인된 명세와 범위 전달.

**담당:** Scouter. 파일 수정·테스트 실행·제외 자료 내용 검토 없이 결과를 Orchestrator에 반환한다.

- [x] C01–C15, L01–L14, G01을 빠짐없이 읽는다.
- [x] 각 파일의 의무·금지·예외·순서·중단 조건을 규칙 단위로 기록한다.
- [x] 각 규칙에 ID, 근거 위치, 역할·플랫폼, 발동 조건, 요구·예외, 관련 규칙을 연결한다.
- [x] 여덟 일반 reference 쌍을 의미별로 비교한다.
- [x] Codex 전용 `handoff-worktree.md`를 플랫폼 어댑터로 검토하고, Claude 대응 파일을 요구하지 않는다.
- [x] 역할·권한, 보존·실패 상태, 인계·승인 증거, TDD, 위험별 QA·Reviewer, 수락, limits의 반복을 모두 분류한다.
- [x] 핵심 지침·역할별 직접 지침·생성 전역 지침의 관계를 확인한다.
- [x] 필요한 경우 package·manifest·installer의 관련 경로만 사용해 지침 전달 관계를 확인한다.
- [x] 모든 파일과 반복·차이 계열에 유지·수정·삭제·보류의 제안을 기록한다.
- [x] 수정·삭제 제안에 적용 문맥과 보호 의미의 보존 근거를 포함한다.
- [x] 새 행동 결정, 범위 밖 근거 필요, 미확인 사항을 별도로 표시한다.

**완료 증거:**

- 30개 조사 행 모두 의미 검토 결과가 있고 미검토 파일이 없다.
- 변경 후보뿐 아니라 유지하는 규칙과 의도된 차이에도 판단 근거가 있다.
- F01–F11의 상태가 갱신되며 새 발견에 ID가 있다.
- 제외 자료를 읽어야만 판단할 수 있는 항목은 미확인·보류로 남는다.

**보류 조건:** 누락·접근 불가 경로, 작업 경로 불일치, 범위 확대 필요, 전수 의미 검토 증거 누락.

S0는 완료되었다. 테스트와 런타임 준수는 확인하지 않았으며, 의미 검토 결과는 구현·검사 완료를 대신하지 않는다.

### S1. 명세 부록 갱신과 실행 준비 수락 — 진행 중

**선행 조건:** S0 결과.

- [x] Planner가 Scouter 결과를 명세 부록 A·B와 필요한 증거·한계에 통합한 수정 초안을 반환한다.
- [x] Orchestrator가 수정 명세를 통합·저장한다.
- [x] 부록이 변경된 수정 명세에 대해 사용자 서면 명세 재승인을 확보한다.
- [x] 수정 명세의 경로·버전·SHA-256과 승인 근거를 인계 기록에 연결한다.
- [x] 새 발견을 다음 세 부류로 나눈다.

| 부류 | 처리 |
|---|---|
| F01/F02/F08의 승인된 정책과 개정된 T1/T2 파일 범위로 해결 가능 | 수정 명세와 개정 계획 승인 후 진행 |
| F03/F04/F06/F07/F10 및 F09/F11 범위 한계 | 승인된 disposition에 따라 유지·보류; 추가 동작 변경 없음 |
| 새 행동·추가 수정 파일·새 의존성이 필요한 발견 | 영향받는 변경 보류, Planner 명세·계획 개정과 필요한 사용자 승인 후 별도 작업으로 진행 |

- [ ] 수정 명세의 해시·승인이 현재 버전과 일치하는지 확인한다. (Spec 승인 완료.)
- [ ] F08을 반영한 이 개정 계획의 별도 승인을 받는다.
- [ ] T1/T2에 영향을 주는 미결정 사항이 없는지 Orchestrator가 확인한다.
- [ ] 승인된 수정 명세와 계획을 현재 ARC 절차에 따라 하나의 문서 갱신 commit으로 기록하고 결과를 검증한다.
- [ ] baseline QA 및 Claude BL1/BL2 조건을 확인한다.
- [ ] 실제 Git 상태, 수정 소유권, 필수 검사 경로를 handoff record에 연결한 뒤에만 Coder를 배정한다.

**독립 진행 규칙:** F07/F09/F10/F11은 현행 보존·미검증으로 명시하고 별도 개선 완료로 보고하지 않는다. 승인된 T1/T2에 영향을 주는 새 정책 결정이 생기면 해당 변경을 보류하고 계획·명세 개정 승인을 확보한다.

### 변경 전 baseline과 기존 Claude 실패

QA는 Coder 시작 전에 다음 관련 검사를 실행하고 실제 결과를 기록한다.

```sh
python3 -B tests/test_harness_contract.py PolicyContractTests -v
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py
node --test tests/node/global-config.test.mjs
node scripts/update-manifest.mjs --check
```

첫 명령은 `DocumentationContractTests`를 실행하지 않는다. 전체 정책 모듈은 회귀 검증용이며 테스트가 읽는 자료를 새로운 감사 입력으로 취급하지 않는다.

기존 Claude 실행 증거는 [이전 작업의 인계 기록](/Users/yunho/Desktop/project/arc/.git/arc/handoff/planner-workspace-selection-before-documents.md)에 연결되어 있다. 이전 QA는 전체 Claude 모듈 **43개 테스트를 실행했고, 아래 두 실패만 발생하여 exit 1**을 관찰했다. 이는 이전 작업의 승인된 disposition에 해당한다.

| ID | 실행에서 확인된 실패 테스트 | 이전 소스 대조에 따른 원인 설명 |
|---|---|---|
| BL1 | `ClaudePayloadTests.test_claude_agent_profiles_hold_acceptance_contracts` | 테스트는 literal `Korean`을 기대하지만 Planner 프로필은 `{{ARC_OUTPUT_LANGUAGE_POLICY}}`를 사용 |
| BL2 | `ClaudePayloadTests.test_claude_native_adapter_matches_shipped_profiles_and_scripts` | 테스트는 `arc_scouter`를 기대하지만 Claude 핵심 지침은 `arc-scouter`를 사용 |

두 테스트의 실패와 모듈 exit 1은 실행 관찰 결과다. 우측 원인 설명은 이전 소스 대조에 따른 해석이며 새 실행 결과를 대신하지 않는다.

이번 작업의 baseline에서는 전체 Claude 모듈을 다시 실행하여 다음을 확인한다.

- 실행한 테스트 수와 실제 exit code를 기록한다.
- 예상 baseline은 43개 실행, exit 1, BL1·BL2 두 실패만 발생하는 상태다.
- BL1·BL2의 오류 내용과 관련 근거가 기존 기록과 일치해야 한다.
- 추가 실패, 실패 ID 변경, 실패 원인·관련 근거 변경, 예상과 다른 테스트 수나 결과가 있으면 Coder 시작을 보류하고 Orchestrator에 전달한다.
- Claude 모듈을 **통과로 표현하지 않는다**. 작업별 결과도 “exit 1, 허용된 기존 BL1·BL2만 실패, 추가 실패 없음”처럼 실제 상태로 보고한다.
- 이 계획에서 허용하는 기존 실패는 변경되지 않은 BL1·BL2뿐이다. 다른 실패를 새 baseline으로 자동 편입하지 않는다.
- BL1·BL2 자체의 수정은 이번 승인된 T1/T2 범위에 포함하지 않는다.

다른 필수 검사도 실제 결과를 기록한다. 기존 실패가 추가로 확인되면 임의로 면제하지 않고 관련 작업을 보류하여 disposition을 확보한다.

## 5. 공통 검사 인터페이스

`tests/test_harness_contract.py`의 기존 인터페이스를 유지한다.

```python
def policy_contract_failures(texts: Mapping[str, str]) -> list[str]:
    ...
```

- 입력: 기존 `policy_texts()`가 제공하는 플랫폼별 지침 텍스트.
- 출력: 기존처럼 계약 ID와 경로를 식별할 수 있는 실패 문자열 목록.
- `COMMON_CONTRACTS`, `POLICY_CONTRACTS`, `PolicyContractTests` 구조를 확장한다.
- 파일 I/O 없는 fixture 변경으로 상충 요구를 주입한다.
- 기존 테스트명과 기존 계약을 불필요하게 변경하지 않는다.
- 새로운 검사 때문에 migration inventory를 수정하지 않는다.
- 검사 범위는 정의한 정책 문구·조건·상충 조합이며 자연어 전체의 의미 판정이 아니다.

T2는 다음 계약 ID를 사용한다.

| 계약 ID | 소유 경로 |
|---|---|
| `COMMIT_NEXT_ACTION` | 양쪽 `references/commit.md` |
| `COMMIT_AUTHORITY` | 양쪽 `references/commit.md` 및 `claude/agents/arc-coder.md` |

`COMMIT_AUTHORITY`는 양쪽 reference의 Orchestrator 전담 요구와 Claude Coder 프로필의 직접 commit 금지를 검사한다. 명시적 위임 허용 문구가 다시 삽입되면 해당 소유 경로의 실패를 반환한다. `policy_texts()`가 Claude Coder 경로를 포함하는지 확인하고, 필요하면 해당 경로만 추가한다.

이 인터페이스와 `tests/node/global-config.test.mjs` 경로는 제한적인 보조 검사 경로 확인으로 검증되었다. 이는 검사 실행이나 테스트 전체 감사 결과가 아니다.

관련 명령:

```sh
python3 -B tests/test_harness_contract.py PolicyContractTests -v
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py
node scripts/update-manifest.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

`node scripts/update-manifest.mjs`는 Coder의 승인된 작업에 포함되는 갱신이다. 다른 명령은 해당 변경의 검사에 사용한다. manifest diff가 해당 작업에서 변경한 보호 대상과 일치하지 않으면 중단한다.

## 6. T1 — Planner 작성 책임 충돌 해소

**구현 목표:** 일반 planning reference의 사용자 작성 책임 예외를 제거하고, 양 플랫폼의 Planner 전담 정책과 충돌하지 않게 한다.

**정확한 수정 파일:**

- `codex/skill/references/planning.md`
- `claude/skill/references/planning.md`
- `tests/test_harness_contract.py`
- `MANIFEST.sha256`

**읽기 기준:** 양 플랫폼 핵심 `SKILL.md`와 S0의 관련 규칙·발견.

**선행 작업·의존성:** S0·S1 완료. T1 관련 새 발견과 정책이 해결·승인되어 있어야 한다.

**인터페이스:**

- 소비: 재승인된 명세의 F01·F05, Planner 작성 책임과 기존 실패·중단 규칙.
- 제공: planning references의 일관된 작성 책임, `AUTHORING_EXCLUSIVITY` 계약, 관련 회귀 검사.

### 실행 단계

- [ ] `COMMON_CONTRACTS`에 `AUTHORING_EXCLUSIVITY`를 추가한다. 양 플랫폼 소유 파일은 `references/planning.md`로 한다.
- [ ] 작성 전담의 긍정 요구와 알려진 상충 예외를 함께 확인하도록 `policy_contract_failures()`를 확장한다.
- [ ] `PolicyContractTests`에 다음 세 검사를 추가한다.

| 테스트명 | 필수 단언 |
|---|---|
| `test_planner_authorship_contract` | 두 planning 문서에 Planner 전담과 Orchestrator 비대체 요구가 있고 해당 계약 실패가 없음 |
| `test_planner_authorship_rejects_conflicting_user_override` | 올바른 전담 문구를 남긴 채 기존 사용자 작성 책임 예외를 추가하면 해당 플랫폼·경로의 `AUTHORING_EXCLUSIVITY` 실패 발생 |
| `test_planner_authorship_allows_user_preferences` | 언어·출력 경로·작업 범위의 사용자 변경 문장을 추가해도 작성 책임 계약 실패가 발생하지 않음 |

충돌 fixture는 확인된 기존 문구를 사용한다. 예를 들어 공백을 정규화한 `A user may explicitly change the writing responsibility`와 Claude의 `A user may explicitly change writing responsibility`를 각각 검사한다.

- [ ] 다음 명령으로 현재 모순을 검출하는 실패를 확인한다.

```sh
python3 -B tests/test_harness_contract.py PolicyContractTests.test_planner_authorship_contract -v
```

기대 결과: planning 문서의 현재 충돌 때문에 실패한다. import·문법·환경 오류는 유효한 red 증거가 아니다.

- [ ] 두 planning 문서의 작성 책임 예외를 제거한다. Planner 실패·부재 시 중단·보고, 누락은 Planner에게 반환, 설계 승인만으로 작성 책임이 바뀌지 않는다는 의미를 보존한다.
- [ ] 필요한 경우 문장을 정리하되 사용자 언어·경로·작업 범위 선택에 관한 별도 요구를 삭제하지 않는다.
- [ ] 집중 검사와 관련 정책 회귀 검사를 실행한다.

```sh
python3 -B tests/test_harness_contract.py PolicyContractTests -v
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py
```

- [ ] manifest를 갱신하고 무결성·공백 검사를 실행한다.

```sh
node scripts/update-manifest.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

- [ ] QA가 충돌 주입 검사, 사용자 선호 fixture, 두 문서의 중단·보고 의미 보존, manifest 변경 범위를 확인한다.
- [ ] QA가 전체 Claude 모듈의 실제 exit 1과 변경되지 않은 BL1·BL2만의 실패를 확인한다. 추가 실패나 근거 변경이 있으면 보류한다.
- [ ] Orchestrator가 다음 기준으로 수락한다.
- [ ] 수락 뒤 Orchestrator가 작업 범위만 stage·커밋하고 SHA·포함 내용·남은 Git 상태를 확인한다.

**수락 기준:**

- F01과 관련 F05 검증 공백이 해결된다.
- 전담 문구와 상충 예외가 공존하는 fixture를 검출한다.
- 일반 사용자 선호를 작성 책임 예외로 오인하지 않는다.
- Planner 실패·부재에 대한 직접 보호가 유지된다.
- 필수 집중·Codex 정책·manifest·공백 검사가 통과한다.
- 전체 Claude 모듈은 실제 exit 1과 BL1·BL2만의 실패로 기록되고, 추가 실패와 기존 근거 변경이 없다.
- 변경 파일과 manifest 항목이 T1 범위에 일치한다.

**보류 조건:** 새 작성 책임 예외 요구, 다른 지침의 미해결 충돌, 실패 대응 의미 손실, 필수 검사 실패·미실행, Claude의 허용 baseline 외 실패 또는 관련 근거 변경, 범위 밖 수정 필요.

**커밋 단위:** 네 파일을 하나의 집중 커밋으로 처리한다.

예정 subject:

```text
fix(arc): Planner 전담 작성 규칙 정합화
```

## 7. T2 — 커밋 시점과 실행 주체 정합화

**구현 목표:** F02와 F08을 함께 반영한다. 두 런타임에서 Orchestrator만 작업을 수락하고, 수락 뒤 다음 행동으로 필요한 Git 확인·staging·집중 커밋을 실행한다. Claude Coder의 명시적 위임 커밋 예외를 제거한다.

**정확한 수정 파일:**

- `codex/skill/references/commit.md`
- `claude/skill/references/commit.md`
- `claude/agents/arc-coder.md`
- `tests/test_harness_contract.py`
- `MANIFEST.sha256`

**선행 작업·의존성:** S1 및 T1 수락·커밋 완료. 공유 검사 파일·manifest와 권한·시점 계약을 함께 검증하므로 순차 실행한다.

**한 작업으로 묶는 이유:** Claude commit reference의 시점·실행 주체와 Coder 프로필의 권한 예외를 함께 정리하지 않으면 상충 계약이 남는다. 검사·manifest까지 하나의 수락·커밋 단위로 처리한다.

**인터페이스:**

- 소비: 수정 명세 F02·F05·F08, 기존 `policy_contract_failures()`와 T1 검사 구조.
- 제공: `COMMIT_NEXT_ACTION`, `COMMIT_AUTHORITY`, 관련 긍정·충돌 fixture 검사.

### 실행 단계

- [ ] `COMMON_CONTRACTS`에 `COMMIT_NEXT_ACTION`을 추가한다. 소유 파일은 양쪽 `references/commit.md`로 한다.
- [ ] `COMMIT_AUTHORITY`를 양쪽 `references/commit.md`에 추가하고 Claude Coder profile을 관련 직접 금지 소유 경로로 등록한다.
- [ ] 긍정 요구가 남아 있어도 수락 전 커밋·계획 끝까지 지연하는 상충 요구를 검출하도록 검사 범위를 확장한다.
- [ ] 올바른 Orchestrator 전담 요구가 남아 있어도 Coder 위임 예외가 공존하면 검출하도록 검사 범위를 확장한다.
- [ ] 다음 검사를 추가한다.

| 테스트명 | 필수 단언 |
|---|---|
| `test_commit_requires_next_action_after_acceptance` | 양 플랫폼에 수락 뒤 다음 행동인 Git 확인·staging·집중 커밋 관계가 존재 |
| `test_commit_checker_rejects_deferred_or_preacceptance_commit` | 올바른 요구를 유지한 채 수락 전 커밋 허용 또는 계획 끝으로 지연하는 직접 요구를 주입하면 해당 경로의 `COMMIT_NEXT_ACTION` 실패 발생 |
| `test_commit_authority_is_orchestrator_only` | 양쪽 reference에 Orchestrator 전담 실행 요구가 있고, Claude Coder profile에 명시적 위임에도 커밋하지 않는 직접 금지가 있음 |
| `test_commit_authority_rejects_delegated_coder_exception` | 두 reference 및 Claude Coder profile 각각에 위임 커밋 예외를 추가하면 해당 경로의 `COMMIT_AUTHORITY` 실패 발생 |
| `test_commit_checker_preserves_hold_and_reuse_contracts` | 시점·권한 계약과 기존 hold·no-change·resume 재사용 계약이 함께 통과 |

권한 충돌 fixture는 다음과 같은 직접 허용 문장으로 한정한다.

```text
Coder may commit when Orchestrator explicitly assigns that action.
```

권한 검사는 세 소유 경로 각각에 subtest를 두고 실패 결과가 주입된 경로를 식별하는지 확인한다. Claude Coder profile의 기존 위임 허용 문구도 source fixture로 검출되어야 한다.

긍정 요구의 의미는 다음과 같다.

```text
Only Orchestrator accepts the task and executes its focused commit in both runtimes.
Coder must not commit, even when explicitly assigned.
```

Coder 직접 금지는 Claude Coder profile에 있어야 한다. 문장은 역할 문맥에 맞게 작성해도 되지만 주체·위임 금지 의미를 유지한다.

상충 fixture는 다음과 같은 직접적인 허용 문장으로 한정한다.

```text
The task may be committed before Orchestrator acceptance.
The task commit may wait until the plan ends.
```

자동 검사가 모든 가능한 자연어 표현을 판별한다고 설명하지 않는다.

- [ ] 현재 Claude의 구체적 시점 요구 부족을 검출하는 실패를 확인한다.

```sh
python3 -B tests/test_harness_contract.py PolicyContractTests.test_commit_requires_next_action_after_acceptance -v
python3 -B tests/test_harness_contract.py PolicyContractTests.test_commit_authority_is_orchestrator_only -v
```

기대 결과: 현재 정책의 구체적 시점 부족으로 실패한다.

- [ ] 양쪽 commit 문서에 다음과 동등한 의미를 명확히 반영한다.

```text
After Orchestrator accepts a task, the next action is the required Git state/scope checks, staging, and focused commit.
```

Codex의 기존 next-action 설명과 중복되면 같은 문맥에서 정리한다. Claude의 “promptly”만으로 시점을 정의하지 않는다.

- [ ] Claude commit reference의 명시적 위임 커밋 예외를 제거한다.
- [ ] Claude Coder profile에 Orchestrator의 명시적 위임 여부와 무관하게 Coder가 commit하지 않는다는 직접 금지를 추가한다.
- [ ] 권한·시점 문구를 함께 검사하여 positive requirement와 delegated-Coder exception이 공존하면 실패하는지 확인한다.

- [ ] 다음 의미를 보존한다: Orchestrator의 작업 수락과 focused commit 선행, 필요한 Git 확인, 무관한 변경 보존, 실패·불명확 상태의 중단, no-change의 빈 커밋 금지, 기존 성공 커밋 재사용, 계획 생략 경로에 새 의무 추가 금지, 작업 수락과 최종 전체 수락의 구분, Claude Coder의 위임 불가.
- [ ] 집중 검사와 정책 회귀 검사를 실행한다.

```sh
python3 -B tests/test_harness_contract.py PolicyContractTests.test_commit_requires_next_action_after_acceptance PolicyContractTests.test_commit_checker_rejects_deferred_or_preacceptance_commit PolicyContractTests.test_commit_authority_is_orchestrator_only PolicyContractTests.test_commit_authority_rejects_delegated_coder_exception PolicyContractTests.test_commit_checker_preserves_hold_and_reuse_contracts -v
python3 -B tests/test_harness_contract.py PolicyContractTests -v
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py
```

- [ ] manifest 갱신·확인을 수행한다.

```sh
node scripts/update-manifest.mjs
node scripts/update-manifest.mjs --check
git diff --check
```

- [ ] QA가 양 플랫폼 시점·권한, 수락 전/지연/위임 충돌 fixture, 기존 hold·no-change·reuse 보호, Claude Coder profile, F09와 BL1/BL2 비변경, manifest 범위를 확인한다.
- [ ] QA가 전체 Claude 모듈의 실제 exit 1과 변경되지 않은 BL1·BL2만의 실패를 확인한다. 추가 실패나 근거 변경이 있으면 보류한다.
- [ ] Orchestrator가 다음 기준으로 수락한다.
- [ ] 수락 뒤 Orchestrator가 작업 범위만 커밋하고 결과를 확인한다.

**수락 기준:**

- F02와 관련 F05 검증 공백이 해결된다.
- F08에 따라 양 플랫폼의 commit owner/executor가 Orchestrator로 정합화된다.
- Claude commit reference와 Coder profile에 명시적 위임 commit 예외가 남지 않고, 관련 conflict fixture가 이를 검출한다.
- 수락 전 커밋과 수락 후 무관한 지연을 허용하지 않는다.
- 필요한 준비·실패 대응·기존 보호 규칙을 유지한다.
- 기존 adapter·role-local 계약이 유지된다.
- 필수 집중·Codex 정책·manifest·공백 검사가 통과한다.
- 전체 Claude 모듈은 실제 exit 1과 BL1·BL2만의 실패로 기록되고, 추가 실패와 기존 근거 변경이 없다.
- `claude/agents/arc-coder.md`의 F09 full-project-suite 요구 및 BL1/BL2 assertions은 변경되지 않는다.
- 변경 내용은 지정한 다섯 파일에 한정된다.

**보류 조건:** 기존 중단 조건과 새 시점 요구의 충돌, Orchestrator 전담과 충돌하는 권한 문구, 보존·재사용 보호 손실, F09/BL1/BL2 변경 필요, 필수 검사 실패·미실행, Claude의 허용 baseline 외 실패 또는 관련 근거 변경, 범위 밖 수정 필요.

**커밋 단위:** 다섯 파일을 하나의 집중 커밋으로 처리한다.

예정 subject:

```text
fix(arc): 커밋 시점과 실행 주체 정합화
```

## 8. 나머지 조사 발견의 유지·보류 처리

F03·F04·F06·F07·F09·F10·F11은 S0에서 검토를 완료했다. 계획 범위는 F01·F02·사용자 승인 F08로 제한하고, 나머지 발견의 현재 disposition은 그대로 유지한다.

- 유지 결정에는 플랫폼 제약·역할별 직접 보호·원본 관계 등 이유를 남긴다.
- 축약·통합·제거에는 명세 4.4의 대체 위치·도달 가능성·의미 보존 근거가 필요하다.
- 수정이 필요한 항목은 Planner가 정확한 파일, 의미, 의존성, 수락 검사, 보류 조건을 갖춘 추가 최상위 작업으로 계획을 개정한다.
- 서로 독립적으로 검증할 수 없는 정책·역할·생성 지침·검사·manifest 변경은 처음부터 같은 추가 작업으로 묶는다.
- G01 변경이 필요하다면 `lib/installer/global-config.mjs`의 지침 텍스트와 `tests/node/global-config.test.mjs`의 관련 계약을 같은 작업으로 묶고, 양 설치 경로의 출력·기존 관리 블록 전달을 검증한다.
- 수정 파일이나 동작이 아직 정해지지 않은 포괄적인 “나머지 정리” 작업으로 Coder에게 위임하지 않는다.
- 추가 작업과 필요한 명세 개정은 승인 전까지 실행하지 않는다.

| 발견 | 계획에서의 disposition |
|---|---|
| F03 | 8개 reference 쌍의 S0 의미 판단 유지. F01/F02/F08만 승인된 수정 |
| F04 | 역할별 직접 보호 유지. 삭제·축약 작업 없음 |
| F06 | G01 생성 텍스트 유지. 실제 `languagePolicy()` 출력은 미검증 |
| F07 | 명시적 branch 후보 승인을 보존. 후보 생성 방식은 변경하지 않음 |
| F09 | Claude Coder의 full-project-suite 요구를 유지; 제외 문맥 비교는 미검증 |
| F10 | 현행 visual tool consent/offer 보호 유지. 통합하지 않음 |
| F11 | rollback 문구 유지. 설치 동작 적용성은 미검증 |

따라서 T1/T2가 끝났더라도 전체 조사 결과에 미승인 개선이 남아 있으면 전체 작업은 진행 중이다. 추가 변경이 필요 없다는 조사·수락 근거가 있으면 불필요한 작업이나 빈 커밋을 만들지 않는다.

## 9. 최종 전체 검증

**시점:** T1/T2와 조사에서 파생되어 승인된 추가 작업이 모두 수락·커밋된 후.

- [ ] 부록 A의 C01–C15, L01–L14, G01에 의미 검토와 규칙 연결이 모두 있는지 확인한다.
- [ ] 여덟 reference 쌍, Codex 전용 adapter, 모든 반복 계열, G01의 disposition을 확인한다.
- [ ] F01–F11을 변경·검사·수락 증거 또는 명시된 보류 근거에 연결한다.
- [ ] F08의 세 소유 경로와 관련 계약 검증이 일치하는지 확인한다.
- [ ] AC01–AC10을 각각 충족·미충족·미검증으로 판정한다.
- [ ] 최종 변경에 유효한 최신 검사 결과를 확인한다. 이후 관련 변경이 없으면 이미 수행한 검사를 불필요하게 반복하지 않는다.
- [ ] 전체 Claude 모듈의 결과는 실제 exit 1과 BL1·BL2의 기존 실패로 보고한다. 추가 실패나 근거 변경이 있으면 전체 수락을 보류한다.
- [ ] G01이 변경되지 않았다면 S0의 의미 검토와 유효한 생성 검사 결과를 사용한다. 변경됐다면 해당 추가 작업의 집중 검사 결과를 확인한다.
- [ ] 최종 manifest와 공백 검사를 확인한다.
- [ ] 독립 Reviewer가 최종 전체 변경을 한 번 검토한다.
- [ ] Reviewer 발견의 처리와 필요한 QA 재검사를 완료한다.
- [ ] 새 수정이 필요하면 승인된 후속 작업·새 집중 커밋으로 처리한다. 기존 성공 커밋을 amend/reset하지 않는다.
- [ ] Orchestrator가 최종 Git 상태, 작업별 커밋, 승인된 보류 disposition, 남은 검증 한계를 확인하고 전체 결과를 수락한다.

최종 검토에서는 의미 손실, 불필요한 정책 완화, 역할별 보호 손실, 플랫폼 혼동, 검사의 거짓 확신, 범위 확대를 우선 확인한다. 정적 검사의 통과를 실제 agent 준수 증거로 보고하지 않는다.

## 10. 명세 수락 기준 연결

| 명세 기준 | 이 계획의 증거 위치 |
|---|---|
| AC01·AC02 | S0 전수 의미 검토, S1 부록 재승인, 최종 coverage 확인 |
| AC03 | T1 |
| AC04 | T2의 커밋 시점·권한 |
| AC05 | S0 차이·반복 판단, 각 관련 변경의 집중 검사 |
| AC06 | S1 disposition, 8절 추가 발견 처리, 최종 추적 |
| AC07 | 작업별 manifest·정책 검사, 필요한 생성 지침 추가 작업 |
| AC08 | 검사 한계·baseline·최종 보고 |
| AC09 | 범위·파일 소유권·변경 diff 확인 |
| AC10 | 작업별 Orchestrator 수락·커밋, 최종 전체 검토와 수락 |
| F08 수락 조건 | T2의 Orchestrator 전담 권한·위임 예외 검사 |

## 11. 실행 전 확인할 상태

- [ ] 이 계획의 사용자 승인이 있다.
- [ ] 승인된 명세의 경로·내용·승인 기록이 일치한다.
- [ ] S0와 S1의 책임·산출물·Coder 차단 조건을 인계했다.
- [ ] 승인된 수정 명세·개정 계획의 변경을 보존하고, 승인 문서만 batch commit에 포함한다.
- [ ] 준비 단계에서 명세 부록이 바뀌면 재승인을 확보한다.
- [ ] 실제 경로·branch·HEAD·staged/unstaged/untracked 상태와 소유권을 확인한다.
- [ ] 같은 파일을 여러 Coder가 동시에 수정하지 않는다.
- [ ] 변경 전 Claude baseline을 다시 실행하고 BL1·BL2의 실제 결과와 기존 근거를 대조했다.
- [ ] 승인된 문서 준비와 현재 ARC 인계 게이트가 끝난 뒤에만 Coder를 시작한다.

---

### Planner 자체 점검

- **승인 반영:** 수정 명세 해시 `7f8f92bd...`와 F08 사용자 결정을 적용했습니다. 개정 계획은 별도 사용자 승인 대기입니다.
- **T1 보존:** F01의 기존 파일·검사·수락·hold 및 한국어 커밋 후보를 유지했습니다.
- **T2 범위:** F02 시점과 F08 Orchestrator 전담 권한을 하나의 작업으로 묶고 `claude/agents/arc-coder.md`를 추가했습니다.
- **검사 구체성:** `COMMIT_NEXT_ACTION`과 `COMMIT_AUTHORITY` 소유 경로, 테스트명, 수락 전/지연/위임 충돌 fixture를 지정했습니다.
- **보호 유지:** hold·no-change·reuse, 역할별 보존·실패 대응, F09 full-project-suite 요구와 BL1/BL2 assertions 비변경을 명시했습니다.
- **baseline:** Claude 전체 모듈 재실행을 요구하고 BL1·BL2만 허용하며 실제 exit 1로 보고하도록 했습니다. 추가 실패나 기존 근거 변경은 보류합니다.
- **범위:** F07/F10은 현행 보존·변경 보류, F09/F11은 미검증·보류로 유지했습니다. 기존 docs·superpowers는 조사 대상에 포함하지 않습니다.
- **준비 순서:** 완료된 S0와 승인된 수정 명세 이후 개정 계획 승인, 문서 갱신 commit, baseline QA·handoff를 거친 다음에만 Coder를 허용합니다.
- **수행 상태:** 계획 개정 초안만 반환했습니다. 파일 저장·테스트 실행·Coder 배정은 하지 않았습니다.
## BQ01 개정 — 승인된 문서 순서의 지원 검사 정합화

### 기준과 우선 적용 범위

- 개정 기준 계획 SHA-256: `b333f5c4004d28af5460457f0347c12e723e01d6d134686ee1cb0e21ae0f8ff0`
- 승인 명세 SHA-256: `7f8f92bde8d7b4af763508426fc5f9800c896286c296004315c88b1c906f523e`
- 실행 경로: `/Users/yunho/Desktop/project/arc`
- branch: `chore/planner-workspace-before-documents`
- 현재 기준 HEAD·통합 문서 커밋: `b400e694dbe3819d5ab156cade6ef172818302fb`
- 근거 기록: `/Users/yunho/Desktop/project/arc/.git/arc/handoff/harness-instructions-audit.md`의 “Baseline QA blocker…”, “Scouter analysis…” 및 BQ03 보충 기록.

초기 문서 기록과 후속 개정 기록은 사용자 요청으로 위 통합 커밋에 합쳐졌다. 과거 `4adcb488`·`67b49de7`은 현재 branch에서 도달 가능한 실행 기준으로 사용하지 않는다.

이 개정은 기존 4절의 예상 밖 baseline 실패 처리와 Coder 착수 조건, 6절 T1의 목표·검사·수락·보류 조건, 7절 T2의 선행 게이트를 아래 범위에서 우선 적용한다. 관련 9절 최종 검증과 11절 실행 전 확인에도 같은 조건을 적용한다. 나머지 승인 내용은 유지한다.

F01/F02/F08, T2의 다섯 파일 범위, 사용자 선택 checkout, 감사 제외 범위, F07/F09/F10/F11 disposition은 변경하지 않는다.

### BQ01의 관찰 결과와 분석

QA 실행 결과:

| 검사 | 실제 결과 |
|---|---|
| `python3 -B tests/test_harness_contract.py PolicyContractTests -v` | 8개 실행, 7개 통과·1개 실패, exit 1 |
| 실패 테스트 | `test_common_contracts_have_platform_owners` |
| 실패 내용 | 양쪽 planning 소유 경로의 `DOCUMENT_ORDER` 실패 |
| `test_arc_policy.py` | 105/105, exit 0 |
| `test_claude_payload.py` | 43개 실행, 정확히 BL1·BL2 실패, exit 1 |
| `global-config.test.mjs` | 34/34, exit 0 |
| manifest 검사 | 보호 파일 90개 확인, exit 0 |

BQ01은 미해결 관찰 실패다. 실패한 baseline을 통과로 표현하거나 허용된 영구 실패로 편입하지 않는다.

Scouter의 정적 분석에 따르면 `tests/test_harness_contract.py:23-26`의 checker는 문서 세트 완성 후 실행 대상 선택을 요구한다. 실패 assertion은 같은 파일 `158-159`다. 현재 양쪽 지침은 실행 대상 선택·준비 후 공식 문서를 작성하도록 명시한다.

- Codex: `codex/skill/references/planning.md:156-166`
- Claude: `claude/skill/references/planning.md:133-143`

이는 checker false positive로 추정되는 정적 분석이며 실제 수정·검사 통과 증거를 대신하지 않는다.

### Claude baseline 보존

허용되는 기존 Claude 실패는 다음 두 건뿐이다.

- BL1: `ClaudePayloadTests.test_claude_agent_profiles_hold_acceptance_contracts` — literal `Korean` 기대와 `{{ARC_OUTPUT_LANGUAGE_POLICY}}` 사용 차이.
- BL2: `ClaudePayloadTests.test_claude_native_adapter_matches_shipped_profiles_and_scripts` — `arc_scouter` 기대와 `arc-scouter` 사용 차이. focused 재확인 근거는 `tests/test_claude_payload.py:244`.

이전 실행 근거는 `/Users/yunho/Desktop/project/arc/.git/arc/handoff/planner-workspace-selection-before-documents.md`에도 연결한다.

전체 Claude 모듈은 43개 실행·BL1/BL2 실패·실제 exit 1로 보고하며 통과로 표현하지 않는다. 두 assertions와 F09 full-project-suite 요구는 수정하지 않는다. 추가 실패·기존 실패 근거 변경·예상과 다른 테스트 수나 결과는 계속 보류 조건이다.

### 승인·문서 준비와 T1 제한 착수

이 개정은 supporting validation을 승인된 정책에 맞추는 것으로, 명세의 F05·AC07–AC09 범위 안에 있다. 사용자 정책·감사 범위를 변경하지 않으므로 실질적인 명세 개정은 필요하지 않다. 승인 명세 해시는 유지한다.

새 계획 버전은 별도 사용자 승인을 받아야 한다. 승인 전에는 이 개정의 문서 커밋이나 Coder 착수를 하지 않는다. 승인 후에는 기존 명세·문서 기록을 확인하고 남은 승인 계획 변경만 새 문서 갱신 커밋으로 기록한다. 기존 통합 커밋을 amend하지 않는다.

기존 “BL1/BL2 외 baseline 실패는 Coder를 막는다”는 조건은 다음의 BQ01 수정 목적에 한해서만 대체한다.

1. 새 계획 승인, 문서 준비, 실제 Git 상태·소유권·인계 조건을 충족한다.
2. BQ01의 실패 양상이 위 관찰과 같고 다른 검사 결과가 유효한 baseline과 일치한다.
3. T1에 한해 F01·BQ01 수정 목적의 Coder 착수를 허용한다.
4. BQ01을 통과·면제·완료로 처리하지 않는다.
5. T1 수락·커밋과 T2 착수 전에는 BQ01의 실제 해소가 필수다.

다른 예상 밖 실패는 여전히 Coder 착수를 막는다. 승인 버전·소스·환경·관련 Git 상태가 바뀌면 영향받는 증거를 갱신한다. 문서만 바뀌었다면 기존 실행 증거의 유효성을 확인해 재사용할 수 있으며, 불확실하면 관련 baseline을 재실행한다.

### T1 범위와 검사 추가

T1 제목·목표를 **“planning 작성 책임과 문서 순서 검사 정합화”**로 확장한다. 기존 F01 작업에 BQ01 checker 수정을 포함하며 소유 파일은 그대로다.

- `codex/skill/references/planning.md`
- `claude/skill/references/planning.md`
- `tests/test_harness_contract.py`
- `MANIFEST.sha256`

양쪽 planning reference는 F01 작성 책임 예외만 정리한다. BQ01을 통과시키기 위해 승인된 choice-before-writing 순서 문구를 수정하지 않는다.

기존 `policy_contract_failures(texts: Mapping[str, str]) -> list[str]`와 계약 ID `DOCUMENT_ORDER`를 유지한다. 해당 소유 경로는 양쪽 `skill/references/planning.md`다. stale pattern을 현재 순서 검사로 바꾸되 기존 명세 승인 선행·bounded 적용·문서 생략 경로 보호를 유지한다. skip·xfail이나 광범위한 검사 삭제는 금지한다.

기존 T1 작성 책임 검사와 함께 다음 검사를 추가한다.

| 테스트명 | 필수 단언 |
|---|---|
| `test_document_order_accepts_choice_before_writing` | 현재 양쪽 소유 문서의 `DOCUMENT_ORDER` 실패 없음 |
| `test_document_order_rejects_documents_before_target_choice` | 순서 문단을 과거 문서 완성 후 대상 선택 순서로 바꾸면 해당 경로 실패 |
| `test_document_order_rejects_missing_required_gates` | 준비·검증, 명세 승인, 계획 승인, 완전한 세트, batch docs commit, 최종 확인, Coder 인계를 각각 누락하면 해당 경로 실패 |
| `test_document_order_rejects_conflicting_reverse_order` | 올바른 순서가 남아 있어도 대상 선택 전 공식 문서 작성 요구를 추가하면 해당 경로 실패 |

각 플랫폼의 `DOCUMENT_ORDER`·소유 경로를 직접 단언한다. 다른 계약 실패로 검출을 대신하지 않는다.

긍정 fixture는 실제 `Normal order:` 구간의 다음 순서를 사용한다.

`initial design approval → execution-target choice → target preparation and verification → formal spec drafting (when required), saving and self-review → written-spec approval → formal plan drafting (when required), saving and self-review → individual plan approvals → complete applicable set → existing-commit verification and one batch docs commit of remaining approved documents → final Git verification → Coder handoff`

역순 fixture는 같은 구간을 다음 의미로 교체한다.

`initial design approval → formal spec drafting → written-spec approval → formal plan drafting → individual plan approvals → complete applicable set → execution-target choice → target preparation and verification → existing-commit verification and one batch docs commit → final Git verification → Coder handoff`

공존 충돌 fixture는 올바른 순서를 남기고 `Formal spec and plan drafting must precede execution-target choice.`를 추가한다.

공백·줄바꿈은 정규화하되 순서를 보존한다. 순서 검사는 `Normal order:` 절차 구간을 대상으로 하며 다른 문단의 단어로 잘못 통과하지 않게 한다.

실행 순서는 다음과 같다.

- [ ] 기존 BQ01 실패를 재현하거나 유효한 실행 증거를 연결한다.
- [ ] 새 긍정 검사가 stale checker 때문에 실패하는 red를 확인한다.
- [ ] `DOCUMENT_ORDER` 검사와 관련 충돌·누락 검사를 구현한다.
- [ ] 기존 T1의 F01 작성 책임 red→수정을 수행한다.
- [ ] 아래 집중·회귀·manifest 검사를 완료한다.
- [ ] QA와 Orchestrator 수락 뒤 T1 하나의 집중 커밋으로 기록한다.

T1의 BQ01·F01 단계는 별도 커밋 단위가 아니다.

### 필수 명령과 QA

BQ01 재현:

    python3 -B tests/test_harness_contract.py PolicyContractTests.test_common_contracts_have_platform_owners -v

순서 집중 검사:

    python3 -B tests/test_harness_contract.py PolicyContractTests.test_document_order_accepts_choice_before_writing PolicyContractTests.test_document_order_rejects_documents_before_target_choice PolicyContractTests.test_document_order_rejects_missing_required_gates PolicyContractTests.test_document_order_rejects_conflicting_reverse_order -v

T1 수락 전 공통·회귀 검사:

    python3 -B tests/test_harness_contract.py PolicyContractTests -v
    python3 -B -m unittest discover -v -s tests -p test_arc_policy.py
    python3 -B -m unittest discover -v -s tests -p test_claude_payload.py

무결성·공백 검사:

    node scripts/update-manifest.mjs
    node scripts/update-manifest.mjs --check
    git diff --check

증거 갱신이 필요한 baseline에서는 위 공통·플랫폼·manifest 검사와 함께 다음을 사용한다.

    node --test tests/node/global-config.test.mjs

`DocumentationContractTests`는 실행하지 않는다. 새로운 테스트 추가 후 실제 검사 수를 기록한다.

QA는 BQ01 실패→수정→해소, 두 planning 순서 구간 비변경, F01·사용자 선호·역할 보호, BL1/BL2·F09 비변경, diff·manifest 범위를 확인한다. 보고·passing checks만으로 Orchestrator 수락을 대신하지 않는다.

### 수락·보류·커밋과 T2 게이트

기존 T1 수락 기준에 다음을 추가한다.

- BQ01이 실제 공통 검사 통과로 해소된다.
- 현재 순서는 통과하고 역순·필수 게이트 누락·공존 충돌은 검출된다.
- 양쪽 planning reference의 승인된 순서는 유지된다.
- F01과 기존 보호·사용자 선호 요구가 충족된다.
- 공통·Codex·manifest·공백 검사가 통과한다.
- Claude 전체는 변경되지 않은 BL1/BL2만의 실제 exit 1로 기록된다.
- 지정 네 파일 범위를 준수한다.

기존 보류 조건에 BQ01의 다른 실패 양상, 정책 순서 변경 필요, checker 약화, 추가 파일 필요, 새 실패·근거 변경을 추가한다. 관련 필수 검사 미실행·실패와 기존 보호 손실도 계속 보류한다.

T1 예정 subject를 다음으로 교체한다.

`fix(arc): planning 작성 책임과 순서 검사 정합화`

Orchestrator가 T1을 수락한 후 필요한 Git 확인·staging·커밋을 직접 수행하고 SHA·내용·남은 상태를 확인한다.

T2의 정책·파일·검사·수락·커밋 후보는 유지한다. 단, T1의 BQ01/F01 해결, 필수 QA, Orchestrator 수락과 검증된 집중 커밋이 모두 있어야 T2를 시작한다. 공유 검사 파일·manifest 때문에 순차 실행하며 동시 편집하지 않는다. T2에서도 공통 검사로 BQ01 회귀가 없는지 확인한다.

### 최종 검증과 남은 승인

기존 최종 검증에 BQ01의 관찰 실패와 T1 이후 해소 증거 추적을 추가한다. T1·T2 수락·커밋 뒤 최종 전체 변경에 대한 독립 Reviewer 검토를 한 번 수행한다. 작업별 Reviewer 게이트를 추가하지 않는다.

정적 검사 통과를 실제 agent 런타임 준수로 표현하지 않는다. 예상 밖 최종 실패는 전체 수락을 막는다.

새 정책 질문은 없다. 이 BQ01 개정을 포함한 새 계획 버전의 별도 사용자 승인과 문서 준비·인계 확인이 필요하다.
