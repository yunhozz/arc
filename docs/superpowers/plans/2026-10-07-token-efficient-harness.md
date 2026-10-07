# 하네스 핵심 지침 축소와 재개 인계 개선 구현 계획

> **For agentic workers:** 이 Harness는 단계별 소유권과 위험 기반 QA/Reviewer를 사용한다. CEO가 순차 조율하고, Coder가 할당 파일을 편집하며, QA와 Reviewer는 각각 독립 검증·검토한다.

**Goal (목표):** 여섯 역할과 안전 게이트를 유지하면서 핵심 `skill/SKILL.md`를 `wc -w` 기준 5,577단어에서 2,788단어 이하로 줄이고, 같은 승인 범위의 Coder 재개에서 유효한 최초 실행 대상 선택을 재사용한다.

**Architecture (구조):** 상시 정책과 필수 로딩 트리거만 핵심 스킬에 둔다. 계획, 인계, 검증/UI, Git 복구, Visual companion 상세 규칙은 조건별 필수 참조 파일로 옮긴다. 최초 인계 기록은 보존하고 재개 브리프는 변경분과 매번 새로 확인한 실제 Git 상태를 전달한다.

**Tech Stack (기술):** Markdown, TOML, Python 3.11 이상, 표준 `unittest`, SHA-256 manifest. 새 의존성은 추가하지 않는다.

**Spec:** [승인 설계](2026-10-07-token-efficient-harness.md#승인-설계)는 2026-10-07 사용자 승인 bounded 설계를 이 계획 안에 기록한다. 이 범위 깊이에서는 별도 spec이 필요하지 않다.

## 공통 제약

- 작업공간: `/Users/ma-24-007/Desktop/workspace/yunho-harness`. 기준 상태는 `master`, HEAD `6ca5407922cff27235aaca204bca43aad969e535`, clean이며 Coder 준비 전에 다시 확인한다.
- 여섯 역할, CEO 직속 구조, 권한·파일 소유권, 하위 에이전트 최대 4개, TDD, 위험별 검증, 승인 문서와 Git 보호 규칙을 유지한다.
- 핵심 지침에는 조건에 맞는 참조를 종속 행동 전에 읽도록 명시한다. 참조 누락·충돌은 CEO에게 보고하고 해당 작업을 중단한다.
- 최초 Coder 시작에는 실행 대상의 명시적 사용자 선택이 필요하다. 같은 승인 범위·작업공간·저장소·대상의 재개는 그 선택을 유지하되 CEO와 Coder가 실제 Git 상태를 재확인한다.
- 범위·작업공간·저장소·대상·승인 branch 후보가 바뀌거나 실패로 기존 선택의 유효성을 입증할 수 없으면 새 선택을 받는다. 정상 작업으로 HEAD/dirty 상태가 바뀌었다는 이유만으로 선택을 무효화하지 않는다.
- significant-risk 변경으로 취급한다. 최종 흐름은 Coder → QA → 독립 Reviewer → CEO 수락이다. 실패 수정은 QA가 영향을 받은 경로를 재확인한 뒤 Reviewer로 전달한다.
- `install.py`, 모델 설정, 외부 스킬은 편집 범위에서 제외한다. 신규 참조 파일의 재귀 복사와 manifest 포함을 회귀 검사한다.
- 설치, 배포, push, merge는 범위 밖이다. 계획 승인과 적용 문서 집합 완결 후 실행 체크아웃 선택을 받는다.

## 승인 설계

1. 핵심에는 라우팅·권한·위험별 검증·공통 인계 조건·참조 로딩 표·토큰 원칙만 남긴다.
2. 다음 상세 계약은 한 파일에 한 번만 둔다.

   | 참조 | 필수 로딩 시점 |
   |---|---|
   | `skill/references/planning.md` | 설계/계획 깊이, spec/plan 작성·승인 판단 전 |
   | `skill/references/handoff.md` | Coder 최초 시작·재개 준비와 검증 전 |
   | `skill/references/verification.md` | 검증 설계, QA/Reviewer, 수정 재확인, UI 수락 검사 전 |
   | `skill/references/git-recovery.md` | 브랜치 충돌, Git 준비 실패, 부분 완료, metadata 쓰기 거부 시 |
   | `skill/references/visual-companion.md` | 시각 자료 제안 또는 companion 운영 시 |

3. 최초 인계 기록에 승인 범위/버전, 작업공간·저장소·선택 근거, 문서·커밋 확인, 변경 보존·소유권, 최종 상태와 실패/복구 증거를 기록한다. 별도 저장 서비스는 만들지 않는다.
4. 같은 승인 범위의 재개 브리프는 최초 기록 위치, 다음 목표/소유권, 결정·문서·범위 변경분, 현재 Git 상태와 차이, 선택 유효성, 재사용 검증, 남은 문제만 담는다. 이전 대화나 접근 불가 링크는 증거를 대신하지 않는다.
5. 선택은 같은 승인 범위·작업공간·저장소·대상에서만 재사용한다. 상태 불일치·미해결 부분 완료·증거 누락은 재개를 막고, 실제로 선택이 무효화된 경우 새 명시적 승인을 요구한다.

## 파일별 책임

| 파일 | 책임 |
|---|---|
| `skill/SKILL.md` | 상시 정책, 필수 참조 트리거, 공통 게이트, 위험별 기본 흐름 |
| `skill/references/*.md` | 계획, handoff, 검증/UI, Git 복구, Visual companion 상세 계약 |
| `agents/harness-coder.toml` | Coder의 최초/재개 독립 확인과 편집 차단 조건 |
| `tests/test_install.py` | 정책 계약, 설치 참조·manifest, 변경된 선택 수명 검증 |
| `README.md` | 설치된 참조 로딩과 최초/재개 사용자 안내 |
| `MANIFEST.sha256` | 변경 payload와 다섯 신규 참조의 해시 |

## 검토 집중 항목

1. 조건부 참조가 선택 사항처럼 읽히거나 해당 역할에 전달되지 않는 경우.
2. 동일 대상 재개에서 새 선택을 불필요하게 요구하거나 매번 해야 할 실제 Git 확인을 누락하는 경우.
3. 범위·작업공간·저장소·대상·후보 변경 또는 무효화 실패 뒤 이전 선택을 재사용하는 경우.
4. 최초 인계 기록에 접근할 수 없거나 변경분 브리프가 승인·문서·소유권 변화를 빠뜨리는 경우.
5. 참조 파일은 저장소에 있지만 설치 payload 또는 manifest에서 빠지는 경우.

---

## Task 1: 조건부 참조와 짧은 핵심 스킬

**Files:** `skill/SKILL.md`, `skill/references/{planning,handoff,verification,git-recovery,visual-companion}.md`, `tests/test_install.py`

- [ ] 기존 역할·승인·TDD·검증 계약 assertion을 핵심 또는 담당 참조 파일에 대응시킨다. 문구 이동 때문에 검사를 삭제하지 않는다.
- [ ] `test_core_requires_task_scoped_references`, `test_references_preserve_policy_contracts`, `test_core_preserves_role_and_risk_gates`, `test_core_word_count_meets_budget`를 먼저 추가한다. 해당 테스트가 신규 참조 부재·필수 로딩 지시 부재·기존 크기 초과로 실패하는지 확인한다.
- [ ] 상세 절차를 담당 참조 파일 하나에만 두고, 핵심에서 경로별 필수 로딩 조건과 누락 시 중단을 명시한다. 역할별로 같은 규칙을 복제하지 않는다.
- [ ] 계약 검사를 재실행해 통과시키고 `wc -w skill/SKILL.md`가 `<= 2788`인지 확인한다. 규칙을 삭제하거나 매 작업에 모든 참조를 로드해 목표를 맞추지 않는다.
- [ ] CEO에게 계약-파일 대응, 크기, 남은 공백을 보고한다.

## Task 2: Coder 최초 선택과 재개 계약

**Files:** `skill/SKILL.md`, `skill/references/{planning,handoff,git-recovery}.md`, `agents/harness-coder.toml`, `tests/test_install.py`

- [ ] 다음 사례를 테스트한다: 최초 선택 누락/계획 승인만 있음은 차단; 명시적 최초 선택과 모든 게이트 충족은 허용; 동일 범위 재개는 선택 유지; 모든 재개는 실제 Git 상태 확인; 범위·작업공간·저장소·대상·branch 후보 변경과 무효화 실패는 새 선택 요구; 기록 접근 불가·증거 누락·소유권 불명·무관한 staged 변경은 편집 차단.
- [ ] 테스트가 현재의 “매 재개 새 선택” 정책과 새 계약의 차이로 실패하는지 확인한다.
- [ ] handoff 참조에 최초 기록 필드와 변경분 브리프 필드를 단일 정본으로 작성한다. Coder 프로필은 같은 대상 선택 재사용을 허용하되, 매 시작 독립 확인과 미해결 실패 차단을 유지한다.
- [ ] README와 핵심의 중복 설명을 같은 규칙을 가리키도록 갱신하고 정책 계약 검사를 통과시킨다. 정상 HEAD 변화만으로 선택을 무효화하지 않는지, 실제 상태 검사는 생략되지 않는지 사례로 확인한다.

## Task 3: README·manifest·통합 검증

**Files:** `README.md`, `MANIFEST.sha256`, `tests/test_install.py`; 설치 복사 검증을 위해 `install.py`는 읽기 전용으로 확인한다.

- [ ] 임시 payload에서 다섯 신규 참조가 복사되는지, manifest에 필요한 참조 누락과 해시 불일치가 거부되는지 검사한다. 실제 사용자 설치 경로나 네트워크는 사용하지 않는다.
- [ ] README에 참조별 로딩 조건, 최초 선택, 동일 범위 재개의 선택 유지, 상태 재확인, 무효화 조건을 짧게 설명하고 상세 참조 링크를 둔다.
- [ ] `tests/test_install.py`의 기존 정렬 규칙으로 `MANIFEST.sha256`을 재생성한다. `skill/models.toml`, `.DS_Store`, manifest 자체는 해시 대상에서 제외한다.
- [ ] 통합 검증을 실행한다.

  ```sh
  python3 -m unittest discover -s tests -p test_install.py -v
  python3 install.py --check
  wc -w skill/SKILL.md
  git diff --check
  git status --short
  ```

  기대 결과: 테스트 통과, `--check` 성공, 핵심 `<= 2788`, diff 오류 없음, 변경은 승인 범위뿐이다. `--check`가 환경상의 외부 스킬 누락으로 막히면 원인을 보고하고 이 기준을 미검증으로 남긴다.
- [ ] QA가 모든 수락 기준과 재개 사례를 기준별 근거·판정·미검증 사유와 함께 보고한다. 결함 수정 뒤 영향받은 확인을 재실행한다.
- [ ] QA 이후 Reviewer가 최종 전체 diff를 독립 검토한다. 참조 로딩 누락, 승인 선택의 과도한 재사용, 규칙 약화, 문구 존재만 검사하는 테스트의 사각을 집중 확인한다.
- [ ] CEO가 남은 공백을 처분하고 수락한다. 커밋은 별도 인계 승인 규칙에 따른다.

## 수락 기준

| ID | 기준 | 근거 |
|---|---|---|
| AC-1 | 핵심 `wc -w`가 2,788 이하 | 기준 5,577과 같은 산정 방법 |
| AC-2 | 여섯 역할·권한·승인·TDD·위험별 검증 유지 | 기존/신규 정책 계약과 최종 diff 검토 |
| AC-3 | 다섯 참조가 조건별 필수이며 설치 payload/manifest에 포함 | 로딩·임시 설치·manifest 검사 |
| AC-4 | 최초 시작에 명시적 선택, 동일 범위 재개에서 유효한 선택 유지 | 최초/재개 사례 검사 |
| AC-5 | 모든 시작에 실제 상태 재확인, 변경·무효화 실패·증거 누락은 차단 | Coder 계약과 실패 사례 검사 |
| AC-6 | 최초 기록과 접근 가능한 변경분 브리프가 승인·문서·상태·소유권 근거를 보존 | 계약 검사와 QA 사례 검토 |
| AC-7 | README·Coder 프로필·설치 참조·manifest가 같은 계약을 설명 | 통합 검사와 Reviewer 최종 검토 |

실제 모델 토큰·비용 절감은 이 계획의 입증 범위가 아니다. 50%는 핵심 파일 word-count 목표이며 참조를 읽는 작업의 총 사용량을 보장하지 않는다.

## 자체 검토

- 승인 설계의 참조 분리, 50% 크기 목표, 선택 유지/무효화, 최초 기록·변경분 브리프를 Task 1–3 및 AC-1–7에 대응했다.
- 각 실패 조건에 정책 계약 검사와 QA 사례를 배정했으며, 정적 계약은 실제 에이전트 런타임 준수의 증명이 아님을 한정했다.
- 설치 코드 로직 변경은 계획에서 제외하고 재귀 복사·manifest 통합 검증으로 확인한다.
- 계획 깊이 rationale: 참조 파일, Coder 프로필, 정책 테스트, README, manifest 사이에 의존성과 통합 순서가 있어 bounded 작업이어도 계획을 요구한다.
