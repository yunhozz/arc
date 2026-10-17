# ARC 하네스 리팩터링 구현 계획

**목표:** 기존 안전 게이트와 플랫폼 기능을 보존하면서 정책 중복을 줄이고, 현재 동작을 설명하는 영어 운영 가이드와 정확한 다이어그램을 제공한다.

**구조:** 플랫폼별 배포물의 독립성을 유지한다. 상세 정책은 소유 참조 문서에 두고 핵심 문서는 적용 조건과 필수 게이트를 요약한다. 역할 프로필의 자체 안전장치는 유지하며, 공통 계약과 의도된 플랫폼 차이를 구조 검사로 확인한다.

**기술 구성:** Markdown, Codex TOML 프로필, Claude Markdown 프로필, SVG, Python `unittest`, 기존 Node.js 테스트, SHA-256 manifest. 새로운 의존성을 추가하지 않는다.

**승인된 스펙:** `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-17-arc-harness-refactor-design.md`

**승인된 스펙 SHA-256:** `fac17e1589b810c50ac04bd5d3be99883b4f07d1e629cbd96fef99fac35ab8bd`

**계획 저장 예정 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-17-arc-harness-refactor-plan.md`

**설계 깊이:** Architectural  
**검증 위험도:** Significant

## 1. 공통 제약

- 설계 스펙과 구현 계획의 제목·설명 문장은 한국어로 작성한다.
- 운영 가이드, 하네스 정책 수정, 테스트·코드 주석, SVG 텍스트와 나머지 유지관리 대상 하네스 문구는 영어로 작성한다.
- 식별자, 경로, API, 스키마 키, 정확한 리터럴, 명령, 필수 SVG 라벨은 보존한다.
- 설치·CLI·트랜잭션·자료 수집·제거·네이티브 파일시스템 구현을 변경하지 않는다.
- 모델 설정·스키마·선택·프리셋과 네이티브 설정 키를 변경하지 않는다.
- 런타임 강제 장치, 정책 생성 체계, 영구 정책 데이터베이스를 추가하지 않는다.
- 외부·번들 업스트림 스킬과 과거 승인 문서를 변경하지 않는다.
- 문서 축약으로 승인, 인계, 준비 상태, 보존, 복구, 검사, 수락, 커밋 의무를 약화하지 않는다.
- 역할 프로필을 전체 Orchestrator 지침 로드 요구로 대체하지 않는다.
- Codex·Claude의 공통 의무는 정렬하되 네이티브 차이는 명시적으로 보존한다.
- 구조 검사 결과를 에이전트 런타임 준수의 증거로 보고하지 않는다.
- 사용자가 요청한 정책 단어 수 제한 검사를 제거하고, 대체 단어 수 상한이나 지표를 도입하지 않는다.
- 대상 선택·실행 준비·구현은 모든 필수 문서의 개별 승인 후 기존 게이트를 통과한 뒤 진행한다.
- 각 최상위 작업에는 새 Coder와 새 QA를 배정한다.
- Reviewer는 작업별 수락 조건이 아니다. 모든 작업 수락 후 새 독립 Reviewer가 최종 전체 변경을 한 번 검토한다.
- 작업별 수정, 검사, 발견 사항을 Orchestrator가 판단하여 수락한다. 수락 후 추가 커밋 승인 없이 해당 작업의 집중 커밋 하나를 생성한다.
- 변경 없는 작업에는 빈 커밋을 만들지 않는다.
- 서로 다른 승인 작업을 실행 중 하나의 커밋으로 합치지 않는다.
- push, merge, 설치, 게시, 배포는 이 계획의 실행 범위에 포함하지 않는다.

## 2. 검토 중점

| ID | 실패 가능성 및 기대 결과 | 검사 위치 |
|---|---|---|
| RF1 | 핵심 문서 축약 후 상세 의무가 사라지거나 역할에서 접근할 수 없어짐. 소유 참조와 역할 자체 안전장치가 남아야 한다 | TASK-01 조항 대응표, 참조·프로필 검사 |
| RF2 | 플랫폼 정렬 과정에서 Claude에 worktree 기능을 약속하거나 Codex·Claude 네이티브 호출 방식을 혼동함. 명시된 차이를 유지해야 한다 | TASK-01 플랫폼별 계약·부정 사례 |
| RF3 | Coder 완료를 종속 작업 해제로 처리하거나 모든 작업에 자동 커밋을 요구함. 검사·수락·검증된 커밋 또는 변경 없음 증거를 구분해야 한다 | TASK-01 계약 검사, TASK-02 가이드·다이어그램 검사 |
| RF4 | 패키지 참조 갱신과 `--target all` 설치의 롤백 범위를 혼동함. 앞선 대상의 설치 성공이 유지되는 경우를 정확히 설명해야 한다 | TASK-02 문서 계약 검사와 소스 대조 |
| RF5 | SVG 텍스트는 맞지만 화살표·배치가 Reviewer 시점이나 승인 순서를 잘못 전달함. 실제 렌더링에서 올바른 순서와 가독성을 확인해야 한다 | TASK-02 SVG 구조 검사와 QA 시각 검사 |

구조 검사는 문장의 존재와 연결을 확인한다. 문장의 의미, 설명의 정확성, 시각적 흐름은 조항 대응표, QA의 소스 대조, 최종 독립 검토로 보완한다.

## 3. 작업 경계와 의존성

### 3.1 분할 근거

작업은 두 개로 구성한다.

- **TASK-01:** 정책 소유 관계, 플랫폼 공통 의미, 역할 안전장치, 정책 단어 수 제한 제거, 해당 테스트와 manifest를 하나의 계약 변경으로 묶는다.
- **TASK-02:** 확정된 정책을 설명하는 운영 가이드, README, SVG, 자산 제거, 문서 검사와 manifest를 하나의 설명 자료 변경으로 묶는다.

TASK-01은 새로운 운영 가이드나 SVG가 없어도 정책 계약의 보존과 통합을 독립적으로 수락할 수 있다. TASK-02는 TASK-01에서 확정한 소유 문서와 계약을 설명하므로 TASK-01에 의존한다.

정책 수정과 정책 테스트를 별도 최상위 작업으로 나누지 않는다. README는 manifest 보호 대상이므로 TASK-02에도 manifest 갱신을 포함한다.

### 3.2 준비 상태 표

| 작업 | 선행 작업 | 입력 | 출력 | 공유 자원·직렬화 사유 |
|---|---|---|---|---|
| TASK-01 | 없음 | 승인된 스펙·계획, 기존 정책·프로필·테스트, 사용자의 단어 수 제한 제거 지시 | 정렬된 정책 계약, 조항 대응표, 정책 검사, 단어 수 제한 제거, 유효한 manifest | 공유 Git index·HEAD; 이후 TASK-02가 같은 테스트 파일과 manifest를 수정 |
| TASK-02 | TASK-01 | 수락·검증된 TASK-01 커밋 또는 수락된 변경 없음 기록, 확정된 정책·앵커 | 운영 가이드, README, 영어 SVG, PNG 제거, 문서 검사, 유효한 manifest | TASK-01 정책 결과를 소비하며 `tests/test_harness_contract.py`와 `MANIFEST.sha256`를 공유 |

현재 문서 승인·준비 게이트를 완료하기 전에는 두 작업 모두 실행 준비 상태가 아니다.

준비 완료 후 최초 배정 후보는 TASK-01이다. TASK-02는 TASK-01의 필수 검사, Orchestrator 수락, 커밋 결과 검증까지 보류한다. 두 작업의 순서는 목록 순서가 아니라 계약 의존성과 공유 파일 때문에 정해진다.

Orchestrator는 승인된 계획 버전에 연결하여 입력·출력, 소유 파일, 검사 경로, 용량, 준비·보류 사유를 기준 인계 기록에 등록한다. Coder 완료 보고만으로 다음 작업을 해제하지 않는다.

## 4. 실행 전 게이트

Orchestrator가 다음을 완료한 뒤 Coder를 배정한다.

1. 승인된 스펙 버전과 이 계획의 개별 승인 증거를 기록한다.
2. 현재 범위의 필수 문서 집합이 완성되었음을 확인한다.
3. 사용자의 명시적 실행 대상 선택을 받고 기존 정책에 따라 준비한다.
4. 승인 문서의 기존 커밋 또는 필요한 일괄 문서 커밋을 검증한다.
5. 실제 절대 경로, 저장소, branch/HEAD, index·worktree·untracked 상태, 보존·소유권을 확인한다.
6. 작업별 준비 상태와 하위 에이전트 용량을 기록한다.
7. 정책·문서 변경의 구조 검사 범위와 런타임 준수 미검증 한계를 브리프에 기록한다.
8. 필요한 로컬 참조와 승인된 스펙·계획의 해당 절을 절대 경로로 전달한다.

현재 계획 작성 단계에서는 실행 대상 선택, branch/worktree 준비, staging, 문서 커밋을 수행하지 않는다.

테스트 환경은 기존 지원 조건을 사용한다. Node.js 22+와 Python 3.11+ 및 필요한 기존 테스트 자원이 있어야 한다. 누락된 선행 조건은 Orchestrator에 보고하며, Coder가 임의로 의존성을 설치하거나 테스트 인프라를 변경하지 않는다.

## 5. 파일 소유 범위

아래 경로는 승인된 실행 저장소 루트 기준이다. 현재 제공된 저장소는 `/Users/yunho/Desktop/project/arc`다. 실행 대상이 달라지면 Orchestrator가 검증한 절대 경로 매핑을 브리프에 제공한다.

### TASK-01 소유 파일

| 분류 | 정확한 경로 |
|---|---|
| 핵심 정책 | `codex/skill/SKILL.md`, `claude/skill/SKILL.md` |
| 계획 계약 | `codex/skill/references/planning.md`, `claude/skill/references/planning.md` |
| 인계 계약 | `codex/skill/references/handoff.md`, `claude/skill/references/handoff.md` |
| 준비 계약 | `codex/skill/references/handoff-prep.md`, `claude/skill/references/handoff-prep.md` |
| 커밋 계약 | `codex/skill/references/commit.md`, `claude/skill/references/commit.md` |
| 복구 계약 | `codex/skill/references/git-recovery.md`, `claude/skill/references/git-recovery.md` |
| 검증 계약 | `codex/skill/references/verification.md`, `claude/skill/references/verification.md` |
| Codex worktree 참조 | `codex/skill/references/handoff-worktree.md` |
| Coder 프로필 | `codex/agents/arc-coder.toml`, `claude/agents/arc-coder.md` |
| 기존 검사와 단어 수 제한 제거 | `tests/test_arc_policy.py` |
| 기존 플랫폼 검사 | `tests/test_claude_payload.py` |
| 새 검사 | `tests/test_harness_contract.py` |
| 배포 해시 | `MANIFEST.sha256` |

참조 문서는 실제 통합·연결 수정이 필요한 경우에만 변경한다. 다른 역할 프로필은 읽기·검사 대상이다. 다른 프로필의 수정이 필요하다는 새 증거가 나오면 수정 전에 Orchestrator에 소유 범위 조정을 요청한다.

### TASK-02 소유 파일

| 동작 | 정확한 경로 |
|---|---|
| 생성 | `docs/harness-operation.md` |
| 수정 | `README.md` |
| 수정 | `docs/images/role-flow.svg` |
| 제거 | `docs/images/role-flow.png` |
| 문서 검사 추가 | `tests/test_harness_contract.py` |
| 배포 해시 갱신 | `MANIFEST.sha256` |

승인된 설계 스펙과 계획은 각 구현 작업의 수정 대상이 아니다.

## 6. TASK-01 — 정책 소유 관계 통합과 플랫폼 계약 정렬

### 목표와 범위

스펙 4–7절, 10절의 하네스 영어 정책, 11절의 정책 구조 검사 요구사항을 구현한다.

Orchestrator 절차의 중복 상세를 소유 참조로 모으고 핵심 문서는 적용 조건과 차단 조건을 요약한다. 역할 프로필의 자체 안전장치는 유지한다. 공통 정책과 네이티브 차이를 한 검사 모듈에서 명시적으로 확인한다.

사용자의 직접 지시에 따라 `tests/test_arc_policy.py`의 정책 단어 수 제한 검사와 사용되지 않게 되는 보조 함수·상수를 제거한다. 의미·역할 경계·인계·참조 등 단어 수와 무관한 품질 검사는 보존한다.

### 선행 작업과 인터페이스

**선행 작업:** 없음. 실행 전 게이트 완료는 필수다.

**소비 입력:**

- 승인된 스펙 4–7절, 10–13절.
- 기존 핵심 정책, 참조 문서, 역할 프로필.
- 기존 Python 정책·배포물 검사.
- 사용자의 정책 단어 수 제한 제거 지시.

**생산 출력:**

- 스펙 4절의 소유 관계를 따르는 정책과 유지된 참조 앵커.
- 제거·축약 문장별 조항 대응표.
- 공통 계약 표와 플랫폼별 구조 검사.
- 단어 수 제한 검사 및 불필요해진 관련 코드가 제거된 `tests/test_arc_policy.py`.
- 갱신된 manifest.
- TASK-02가 사용할 최종 소유 경로·앵커와 변경된 정책 요약.

테스트 모듈 내부의 검사 보조 함수는 다음 인터페이스를 사용한다.

```python
policy_contract_failures(texts: Mapping[str, str]) -> list[str]
```

`texts`는 저장소 상대 경로에서 문서 내용으로의 매핑이다. 결과는 위반한 계약 ID와 해당 경로를 식별한다. 파일 읽기와 계약 판정을 분리하여 부정 사례가 실제 저장소 파일을 바꾸지 않도록 한다. 이 함수는 테스트 내부 용도이며 배포 API가 아니다.

공통 계약 표는 최소한 다음 ID를 구분한다.

- `OWNERSHIP`
- `DOCUMENT_ORDER`
- `HANDOFF_GATE`
- `READINESS`
- `COMMIT_BOUNDARY`
- `RECOVERY`
- `EVIDENCE_LIMITS`
- `ROLE_LOCAL`
- `NATIVE_ADAPTERS`

각 항목은 플랫폼별 소유 파일과 확인할 필수 의미를 지정한다. 전체 플랫폼 문서를 합친 문자열의 단순 동등성 비교로 대체하지 않는다.

### 수행 단계

- [ ] **1. 조항 대응표를 작성한다.**

  축약 후보마다 원래 경로·절, 보존 계약, 상세 소유 문서, 적용 조건·접근 경로, 역할 자체 지침, 검사 범위를 기록한다.

  우선 대상은 핵심 공통 인계 요약, 의존성 기록 상세, 자동 커밋 상세, 참조 간 반복된 재시작·복구 설명이다. 보존 근거가 없는 삭제는 진행하지 않는다.

- [ ] **2. 실패를 확인할 정책 계약 검사를 추가한다.**

  `tests/test_harness_contract.py`에 `PolicyContractTests`를 만들고 다음을 검사한다.

  | 검사 | 필수 확인 |
  |---|---|
  | `test_common_contracts_have_platform_owners` | 공통 계약 ID와 두 플랫폼의 소유 파일이 존재하며 요구 조항이 소유 위치에 있음 |
  | `test_handoff_and_role_local_guards_remain_accessible` | core의 적용 조건·참조, Coder의 준비 사실 신뢰·실제 충돌 보고·보존·경계가 함께 유지됨 |
  | `test_readiness_requires_acceptance_and_verified_result` | 완료 보고만으로 종속 작업 해제 불가, 검사·수락·검증된 커밋 또는 변경 없음 증거 필요 |
  | `test_commit_contract_distinguishes_plan_skip_and_no_change` | 계획 작업 커밋 권한, 계획 생략 경로, 빈 커밋 금지, 기존 커밋 재사용이 구분됨 |
  | `test_native_adapters_remain_explicit` | 역할 이름·실행·대기·worktree·모델 effort 차이를 보존함 |
  | `test_commit_guidance_uses_english_descriptions` | 두 플랫폼의 유지관리 대상 커밋 설명 지침이 영어 설명을 요구함 |
  | `test_policy_contract_checker_rejects_missing_guards` | 메모리상의 문서 내용에서 필수 게이트를 제거하면 해당 계약 위반을 보고함 |
  | `test_policy_contract_checker_rejects_adapter_conflation` | Claude worktree 미지원 조항을 제거하는 등의 변형을 탐지함 |

  RF1–RF3을 이 검사들에 연결한다. 커밋 설명 언어처럼 기준 상태와 달라야 하는 요구사항의 실패를 먼저 관찰한다. 기존에 올바른 계약까지 실패하도록 만들 필요는 없다.

- [ ] **3. 새 검사를 실행하여 예상 실패를 기록한다.**

  ```sh
  python3 -B -m unittest discover -s tests -p 'test_harness_contract.py'
  ```

  실패 이유가 아직 적용하지 않은 계약 정렬 요구사항인지 확인한다. import 오류나 환경 실패를 의도된 RED로 취급하지 않는다.

- [ ] **4. 정책 단어 수 제한 검사를 제거한다.**

  `tests/test_arc_policy.py`에서 다음을 제거한다.

  - `PolicyWordBudgetTests.test_policy_text_stays_within_word_budget`
  - 해당 테스트만 포함하여 불필요해지는 `PolicyWordBudgetTests` 클래스
  - `policy_word_counts`
  - `POLICY_WORD_CEILINGS`
  - `POLICY_WORD_TOTAL_CEILING`
  - `CLAUDE_POLICY_WORD_TOTAL_CEILING`

  관련 참조와 주석을 확인하고, 위 코드 제거로 실제 사용되지 않게 된 항목만 정리한다. 다른 테스트가 사용하는 import·보조 함수·상수는 유지한다.

  대체 단어 수 제한, 단어 수 지표, 이를 다시 강제하는 검사를 추가하지 않는다. 삭제 자체를 고정하는 별도 회귀 테스트도 추가하지 않고, 변경 내용과 남은 참조 확인 결과를 수락 증거로 기록한다.

- [ ] **5. 소유 문서 기준으로 정책을 통합한다.**

  핵심 문서는 역할·적용 조건·핵심 차단 조건·소유 참조를 유지한다. 상세 증거 목록과 재시작 방식은 `handoff.md`, 문서 순서와 준비 상태 기록은 `planning.md`, 커밋·변경 없음·재사용은 `commit.md`, 실제 복구 절차는 `git-recovery.md`에 둔다.

  위험도 표와 직접 수정 경로의 자격 조건은 핵심 문서에서 유지한다. 필수 참조 로드 조건과 기존 유효 앵커를 보존한다.

- [ ] **6. 역할 자체 안전장치와 플랫폼 차이를 정렬한다.**

  Coder의 자체 인계 계약을 유지하고, 필요한 경우 예상 TDD RED가 운영 실패가 아님을 명시한다. TDD 면제 조건을 바꾸지 않는다.

  두 플랫폼의 커밋 설명 지침을 영어로 맞춘다. Claude에 worktree 참조나 Codex 호출 API를 추가하지 않는다. 네이티브 프로필 형식, 도구 허용 목록, 모델·effort 설정을 변경하지 않는다.

- [ ] **7. 기존 의미·품질 검사를 소유 위치에 맞게 조정한다.**

  위치나 표현이 바뀐 검증문만 조정하고 필수 의미를 유지한다. 핵심 문서에 상세 문구가 없어졌다는 이유로 검사를 삭제하지 않고, 소유 참조와 core의 연결을 검사한다.

  역할 경계, 준비·보존·복구·검증 의무, 참조와 인계, 공통 용어 검사를 유지한다. 새 테스트·주석은 영어로 작성한다.

- [ ] **8. Manifest를 갱신한다.**

  ```sh
  node scripts/update-manifest.mjs
  ```

  변경된 해시가 이 작업의 배포 파일에 대응하는지 확인한다.

- [ ] **9. 집중 검사를 실행하고 결과를 보고한다.**

  ```sh
  python3 -B -m unittest discover -s tests -p 'test_harness_contract.py'
  python3 -B -m unittest discover -s tests -p 'test_arc_policy.py'
  python3 -B -m unittest discover -s tests -p 'test_claude_payload.py'
  node --test tests/node/profile-render.test.mjs tests/node/package-references.test.mjs tests/node/manifest.test.mjs
  node scripts/update-manifest.mjs --check
  ```

  예상 결과는 모든 명령의 성공 종료다. Manifest 검사는 현재 보호 파일 집합과 해시의 일치를 보고해야 한다.

  단어 수 제한 관련 잔여 참조는 다음 읽기 전용 검색으로 확인한다.

  ```sh
  rg -ni 'word.?budget|word.?ceiling|word.?count|PolicyWordBudgetTests|test_policy_text_stays_within_word_budget|policy_word_counts|POLICY_WORD_CEILINGS|POLICY_WORD_TOTAL_CEILING|CLAUDE_POLICY_WORD_TOTAL_CEILING' tests/test_arc_policy.py
  ```

  예상 결과는 일치 없음이며 `rg` 종료 코드 1이다. 이 확인을 테스트 실패로 취급하지 않는다.

- [ ] **10. 새 QA의 검사와 Orchestrator 수락을 받는다.**

  QA는 위 집중 검사, 조항 대응표, 소유 참조·앵커, 역할 자체 안전장치, 네이티브 예외, 변경 범위를 독립 확인한다.

  QA는 지정한 단어 수 제한 코드가 제거되었고 대체 제한·지표가 추가되지 않았으며, 나머지 의미·역할·인계·참조 검사가 보존되었는지 확인한다.

  Orchestrator는 증거와 발견 사항을 판단하여 수락한다. 수락 후 이 작업만의 집중 커밋을 생성하고 SHA·내용·남은 상태를 검증한다. 변경이 없으면 수락 근거와 변경 없음만 기록한다.

### 수락 기준

- C2·C3·C4의 정책 범위와 C6의 해당 파일 범위를 충족한다.
- 삭제·축약한 모든 규범 문장에 보존 근거가 있다.
- 상세 계약과 적용 조건이 접근 가능하며 역할 자체 안전장치가 유지된다.
- 기존 준비·승인·검증·수락·커밋 의무가 약화되지 않았다.
- 두 플랫폼의 공통 계약과 의도된 차이를 각각 검사한다.
- 지정한 정책 단어 수 제한 테스트와 불필요해진 보조 함수·상수가 제거되었다.
- 대체 단어 수 상한이나 지표가 없으며, 단어 수와 무관한 품질 검사는 유지된다.
- 집중 검사와 새 QA가 요구 증거를 제공한다.
- 변경된 배포 파일의 manifest가 유효하다.
- TASK-02 없이도 정책 계약 변경 자체를 독립적으로 수락할 수 있다.

### 보류 조건

조항 보존 근거 누락, 잘못된 소유 참조, 필수 검사 실패·미실행, 역할 안전장치 손실, 지원하지 않는 플랫폼 기능 도입, 단어 수 제한 제거 미완료 또는 대체 제한·지표 도입, 모델·설치 구현 변경 필요, 범위 밖 프로필 수정 필요, 소유권·Git 상태 불일치가 있으면 영향받는 작업을 보류한다.

최종 전체 Reviewer 검토는 이 작업 수락의 선행 조건이 아니다.

## 7. TASK-02 — 운영 가이드·README·영어 SVG와 문서 검사

### 목표와 범위

스펙 8–9절을 구현하고 C1·C5 및 설명 자료의 C3·C4·C6를 충족한다.

현재 설치 계층과 에이전트 조정 계층을 설명하고, TASK-01에서 확정된 정책을 연결한다. 영어 SVG를 유지하며 오래된 PNG를 제거한다.

### 선행 작업과 인터페이스

**선행 작업:** TASK-01의 필수 검사, Orchestrator 수락, 집중 커밋 검증 또는 수락된 변경 없음 기록.

**소비 입력:**

- TASK-01의 최종 정책 경로·앵커와 조항 대응표.
- 스펙 8–10절.
- 기존 README와 설치·갱신·제거 소스.
- 기존 `PolicyContractTests`와 `policy_contract_failures`.

**생산 출력:**

- `docs/harness-operation.md`
- 가이드로 연결되는 간결한 README
- 정확한 영어 SVG와 PNG 제거
- `tests/test_harness_contract.py`의 문서·자산 검사
- README 변경을 반영한 manifest
- QA의 소스 대조와 SVG 렌더링 증거

TASK-01의 검사 보조 함수 계약과 기존 정책 검사를 유지한다. 문서 검사 추가를 위해 정책 검사 의미를 바꾸지 않는다.

### 수행 단계

- [ ] **1. 문서·자산 검사를 추가한다.**

  `tests/test_harness_contract.py`에 `DocumentationContractTests`를 추가한다.

  | 검사 | 필수 확인 |
  |---|---|
  | `test_operation_guide_covers_required_sections` | 스펙 8.1–8.8의 주제를 다룸 |
  | `test_operation_guide_distinguishes_transaction_scopes` | 패키지 참조 갱신과 독립 대상 설치를 구분하고 앞선 성공 유지·잔여 경로를 설명함 |
  | `test_operation_guide_distinguishes_policy_from_runtime` | 프롬프트 정책·네이티브 설정·런타임 증거를 구분함 |
  | `test_maintained_local_links_resolve` | README·가이드·변경 정책의 로컬 링크와 사용한 절 앵커가 유효함 |
  | `test_svg_contains_required_english_flow_labels` | 필수 라벨, 접근성 제목·설명, 플랫폼 설명이 존재함 |
  | `test_svg_and_guide_preserve_acceptance_commit_review_distinctions` | 계획 작업 커밋·변경 없음·최종 검토 시점이 구분됨 |
  | `test_readme_uses_maintained_svg_and_links_operation_guide` | README가 SVG와 운영 가이드를 연결함 |
  | `test_stale_png_is_absent_and_unreferenced` | PNG가 없으며 현재 유지관리 대상 문서에서 참조하지 않음 |
  | `test_guide_and_svg_use_english_wording` | 가이드와 SVG에 한국어 설명이 남지 않음 |

  RF3–RF5를 연결한다. 언어 검사를 과거 문서나 한국어 스펙·계획까지 확대하지 않는다.

- [ ] **2. 예상 실패를 확인한다.**

  ```sh
  python3 -B -m unittest discover -s tests -p 'test_harness_contract.py'
  ```

  운영 가이드 부재, 기존 SVG 언어·표현, PNG 존재 등 아직 적용하지 않은 변경 때문에 실패하는지 확인한다.

- [ ] **3. 운영 가이드를 영어로 작성한다.**

  다음 절을 포함한다.

  - `What ARC installs`
  - `Installation and refresh lifecycle`
  - `Request routing and role responsibilities`
  - `Design and preparation`
  - `Scheduling and limits`
  - `Verification, acceptance, and commits`
  - `Failure, resume, and maintenance`
  - `Source map`

  상세 내용은 스펙 8.1–8.8을 따른다. 도입부에 규범적 플랫폼 가이드와 프롬프트 수준 정책의 한계를 명시한다.

  특히 다음을 소스와 대조한다.

  - `--check`·`--dry-run`의 비적용·비갱신 동작.
  - 패키지 postinstall 참조 갱신의 복구 범위.
  - `--target all`의 순차 독립 설치와 앞선 성공 유지.
  - 자료 수집 시 업스트림 스크립트·훅 미실행.
  - 출처 정보의 일관성 증거와 인증 한계.
  - 재설치·모델 수정 대체·한도 보존·제거 후 보존 항목.
  - 준비 상태와 A → B → C 및 독립 D 예시.
  - 작업 수락·커밋과 최종 계획 검증의 구분.

- [ ] **4. README를 간결한 진입점으로 정리한다.**

  운영 가이드를 연결하고 현재 역할·설계·검증 요약을 확정 정책과 맞춘다. 기존 설치·제거·유지보수 명령과 패키지 검사에서 요구하는 사용 예시를 보존한다.

  가이드 전체를 README에 복제하거나 새로운 규범 게이트를 만들지 않는다.

- [ ] **5. SVG를 영어로 수정하고 PNG를 제거한다.**

  스펙 9절의 필수 라벨을 그대로 보존한다.

  - `Design depth and verification risk are separate`
  - `Approved documents → platform preparation → handoff`
  - `Ready independent tasks`
  - `Required checks → Orchestrator acceptance`
  - `Plan task: focused commit; no change: record only`
  - `Failure: hold affected work, inspect, resolve, revalidate`
  - `Codex: managed worktree option. Claude v1: current checkout.`

  Scouter와 Spike는 기존 SVG에 이미 존재하므로 유지·정리한다. Reviewer를 매 계획 작업 커밋의 선행 조건으로 표시하지 않는다. 중요 무계획 작업의 수락 전 검토와 중요 계획 작업의 최종 전체 검토를 구분한다.

  PNG를 제거하기 전에 현재 유지관리 대상 참조가 없음을 확인한다. 과거 승인 문서를 수정하지 않는다.

- [ ] **6. Manifest를 갱신한다.**

  ```sh
  node scripts/update-manifest.mjs
  ```

  README 해시 변경을 포함하고 무관한 파일 변화가 없는지 확인한다.

- [ ] **7. 집중 검사를 실행한다.**

  ```sh
  node --test tests/node/package.test.mjs tests/node/manifest.test.mjs
  node scripts/update-manifest.mjs --check
  ```

  정책 검사도 같은 새 모듈 안에서 계속 통과해야 한다. 예상 결과는 모든 명령의 성공 종료다.

- [ ] **8. 새 QA가 문서 사실과 렌더링을 확인한다.**

  QA는 스펙 8절의 내용과 가이드의 대응 관계를 확인하고 설치·제거·트랜잭션 소스를 대조한다.

  현재 macOS 작업환경에는 `/usr/bin/qlmanage`가 있다. 작업 전용 임시 디렉터리에서 다음 방식으로 SVG 미리보기를 생성할 수 있다.

  ```sh
  arc_preview_dir="$(python3 -c 'import tempfile; print(tempfile.mkdtemp(prefix="arc-role-flow-"))')"
  qlmanage -t -s 1560 -o "$arc_preview_dir" docs/images/role-flow.svg
  ```

  실제 이미지 생성 성공을 확인하고, 렌더링된 이미지의 잘림·겹침·화살표·읽기 순서·라벨·대비와 README 표시 크기에서의 가독성을 검사한다. 생성 경로와 확인 결과를 증거로 남긴다.

  렌더러가 실패하면 파일 존재나 XML 파싱 성공으로 시각 검사를 대체하지 않는다. 사용 가능한 다른 렌더링 경로를 Orchestrator가 결정하고 실제 시각 증거를 확보할 때까지 해당 기준을 보류한다.

- [ ] **9. Orchestrator가 수락하고 집중 커밋을 생성한다.**

  QA 결과, 문서·소스 대응, 렌더링 증거, 검사 결과, manifest, 변경 범위를 확인한다. 수락 후 이 작업만 커밋하고 실제 SHA·내용·남은 상태를 검증한다. 변경이 없으면 빈 커밋 없이 기록한다.

### 수락 기준

- 스펙 8.1–8.8의 내용이 영어 가이드에 포함된다.
- README가 가이드와 SVG를 올바르게 연결하며 기존 명령 설명을 손상하지 않는다.
- 설치·갱신·롤백·제거 설명이 현재 소스와 일치한다.
- 정책·네이티브 설정·런타임 준수의 한계를 명시한다.
- SVG에 필수 영어 라벨과 접근성 설명이 있으며 시각 검사에서 순서와 가독성이 확인된다.
- PNG가 제거되고 현재 유지관리 대상에 남은 참조가 없다.
- 새 QA와 집중 검사가 요구 증거를 제공한다.
- README를 포함한 manifest가 유효하다.
- TASK-01 계약과 검사를 약화하지 않는다.

### 보류 조건

정책 입력 미확정, 소스와 설명 불일치, 과거 문서 수정 필요, PNG의 현재 사용 발견, SVG 렌더링 미확인, 잘못된 승인·검토 순서, 필수 검사 실패·미실행, manifest 불일치, 범위·소유권 충돌이 있으면 영향받는 수락을 보류한다.

최종 전체 Reviewer 검토는 이 작업 수락의 선행 조건이 아니다.

## 8. 최종 전체 검증

이 절은 모든 작업이 필수 검사를 거쳐 수락되고 집중 커밋 또는 변경 없음 기록이 검증된 후 수행한다. 각 작업의 현재 필수 검사를 이 시점으로 미뤄 조기 수락해서는 안 된다.

### 8.1 최종 상태 검사

최종 관련 상태에서 다음을 실행한다.

```sh
python3 -B -m unittest discover -s tests
npm test
node scripts/update-manifest.mjs --check
```

기존 테스트 선행 조건을 충족한 환경에서 실행한다. 실시간 업스트림 네트워크 검사는 이 리팩터링만을 이유로 추가하지 않는다.

마지막 QA 이후 관련 파일이 바뀌면 영향받는 검사를 재실행한다. 증거 재사용은 기존 범위·상태·독립성·최신성·절차 위치 조건을 따른다. 단순 작업 경계 때문에 통과 검사를 반복하지 않는다.

실패가 기존 환경·무관한 결함에서 발생하더라도 실제 결과와 남은 증거 공백을 기록한다. 범위 밖 구현을 임의 수정하지 않는다.

### 8.2 최종 독립 검토

새 독립 Reviewer 한 명에게 최종 전체 변경과 다음 증거를 제공한다.

- 승인된 스펙·계획과 언어 예외.
- 작업별 수락·커밋 기록.
- 조항 대응표.
- 공통 계약과 네이티브 예외 검사.
- 단어 수 제한 코드 제거와 나머지 의미·품질 검사 보존 증거.
- 문서·설치 소스 대응.
- SVG 렌더링 증거.
- 최종 검사 결과와 미검증 범위.

Reviewer는 의미 보존, 사실 정확성, 안전 게이트, 플랫폼 차이, 단어 수와 무관한 검사 약화 여부, 다이어그램 흐름을 검토한다. QA 실행이나 완료 판단은 대신하지 않는다.

이미 커밋된 작업의 수정이 필요하면 Orchestrator가 기존 정책에 따라 후속 작업, 필요한 승인, Coder 수정, QA 재검사를 관리한다. 자동 amend/reset이나 원래 작업의 중복 커밋을 하지 않는다.

### 8.3 최종 수락 증거

| 기준 | 증거 |
|---|---|
| C1 | 운영 가이드·소스 대응, 정책/런타임 한계 설명, QA 및 최종 검토 |
| C2 | 조항 대응표, 상세 소유 문서, 역할 자체 안전장치 |
| C3 | 준비 상태·커밋·변경 없음·복구 검사와 설명 자료 |
| C4 | 플랫폼별 공통 계약 검사와 명시적인 네이티브 예외 |
| C5 | 영어 SVG, PNG 제거·참조 검사, 실제 렌더링 증거 |
| C6 | 한국어 스펙·계획 예외와 나머지 변경 자료의 영어 확인 |
| 사용자 추가 지시 | 정책 단어 수 제한 테스트·보조 함수·상수 제거, 대체 제한·지표 부재, 다른 품질 검사 보존 |

Orchestrator가 발견 사항과 증거 공백을 해결하거나 기존 정책에 따라 명시적으로 처리한 뒤 최종 계획 수락과 완료를 판단한다. 구조 검사가 실제 에이전트 런타임 준수를 입증하지 않는다는 한계를 최종 보고에 남긴다.

## 9. 가정과 미해결 사항

- 기존 승인 기능 범위와 두 작업 경계를 유지한다. 사용자의 직접 지시에 따른 정책 단어 수 제한 제거를 TASK-01에 명시했다.
- 두 작업은 정책 입력과 공유 파일 때문에 순차 의존한다.
- 새로운 패키지나 렌더링 의존성을 추가하지 않는다.
- 실제 실행 대상과 현재 Git 상태는 문서 승인 후 Orchestrator가 확인한다.
- 현재 계획을 차단하는 미해결 계약이나 제품 결정은 없다.
- 새로운 역할 프로필 수정, 설치 구현 변경, 더 넓은 문서 번역이 필요해지면 영향받는 작업을 중지하고 Orchestrator가 범위와 필요한 승인을 재평가한다.

