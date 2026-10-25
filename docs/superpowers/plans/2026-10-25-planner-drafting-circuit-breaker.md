# Planner 초안 반복 방지 정책 구현 계획

> **에이전트 실행 지침:** `writing-plans`의 실행 절차는 ARC 역할 체계로 적용한다. Orchestrator가 승인·인계·수용·Git 작업을 담당하고, Implementer가 아래 단일 작업을 수행한다. 체크박스는 진행 기록이며 별도 커밋 단위가 아니다.

**목표:** 완전한 초안 의무와 변경된 입력에 대한 추가 호출을 유지하면서, 같은 누락을 같은 맥락에서 반복 요청하는 Planner 호출을 중단한다.

**접근:** `planning.planner-brief` 정본과 Codex·Claude 작성 문구에 요구사항 원장, 근거 구분, 통합 피드백 및 진전 조건을 반영한다. 새로 작성하거나 수정하는 정책 지침은 양 플랫폼 모두 간결하고 명확한 영어로 작성한다. 정식 생성기로 관리 구간을 갱신하고, 기존 문구 고정 assertion·fixture와 활성 Codex 설치본을 맞춘다.

**기술:** JSON 정책 정본, Markdown 참조 문서, Node.js 정책 생성기, 기존 Python·Node.js 계약 assertion과 fixture.

**승인 근거:** Orchestrator brief의 사용자 승인 범위, C1–C8 및 후속 검증·언어 변경 필드. 별도 설계·spec 문서는 요구되지 않는다. 계획 승인은 대기 상태이며, 승인 전에는 구현·정책 생성을 시작하지 않는다.

## 작업 대상과 승인 상태

| 항목 | 기록 |
|---|---|
| 작업 공간 | `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc` |
| 공통 Git 디렉터리 | `/Users/yunho/Desktop/project/arc/.git` |
| 브랜치 | `fix/planner-call-loop-guard` |
| 준비 시 HEAD | `f176ce771811cb2a39d68fb5af03a20d5ff6e04e` |
| 준비 증거 | Orchestrator brief: 관리 worktree 등록·현재 대화 attachment·공통 디렉터리 확인, staged/unstaged/untracked 변경 없음 |
| 원본 checkout | `/Users/yunho/Desktop/project/arc`, `master`, 같은 HEAD, 변경 없음 |
| 계획 저장 경로 | `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/docs/superpowers/plans/2026-10-25-planner-drafting-circuit-breaker.md` |
| 깊이·위험 | Bounded, 서면 계획 필요, Significant/high |
| 현재 상태 | 사용자 승인 범위·언어 기준 확정, 수정 계획 승인 대기 |

정본, 플랫폼별 문구·생성 결과, 기존 계약 fixture, 활성 설치본이 함께 일치해야 하므로 하나의 최상위 작업으로 수행한다.

## 공통 제약

- C1–C8을 구현·수용 기준으로 유지한다.
- 새로 작성하거나 수정하는 ARC 지침은 Codex·Claude 모두 간결하고 명확한 영어로 작성한다. 두 플랫폼의 의미와 적용 기준을 동일하게 유지한다. 무관한 문구를 번역·재작성하지 않는다.
- 이 계획의 제목·설명은 한국어로 유지하고 식별자·경로·명령·API·literal은 보존한다.
- 전체 호출 횟수 상한을 도입하거나 Planner 프로필에 호출 횟수 규칙을 추가하지 않는다.
- 관리 구간은 `lib/policy/role-policy.json`을 수정한 뒤 정식 생성기로 갱신한다.
- 승인 결정, 검증된 원본 사실, 가정, 미결 결정을 구분한다. 원본 사실은 정확한 경로·행을 인용한다.
- 테스트를 추가하거나 실행하지 않는다. 새 test case·assertion, TDD RED/GREEN, `node --test`, `unittest` 실행은 제외한다.
- 기존 test·fixture에서는 변경되는 정책 문구를 고정한 assertion·fixture만 새 영어 문구에 맞춘다. 무관한 검사나 의미적 의무를 약화하지 않는다.
- 생성기 `--check`, diff 검토, 플랫폼별 정적 비교, 활성 Codex 설치본 byte 비교는 수행한다.
- 본문은 한국어로 작성하고 식별자·경로·명령·API·literal은 보존한다.
- TUI, package/installer 동작, 무관한 생성물·역할·Git·승인·QA·Reviewer 경계, push/merge/deploy는 제외한다.
- Significant/high의 QA와 최종 Reviewer 경계를 유지한다. 테스트 실행 결과와 실제 에이전트 행동 준수는 미검증으로 보고한다.

## 근거와 출처

다음은 Orchestrator가 제공한 정적 근거이다. 상대 경로는 모두 위 작업 공간을 기준으로 한다.

| 근거 | 의미 |
|---|---|
| `lib/policy/role-policy.json:360-375` | `planning.planner-brief` 정본 |
| `lib/policy/placement.mjs:3-6`, `lib/policy/render.mjs:31-36,48,70-80` | 생성 대상·projection의 권위 있는 경로 |
| `scripts/update-role-policy.mjs:8-14` | 정책 생성·정합성 검사 절차 |
| `codex/skill/references/planning.md:44-65`, `coordination.md:85-92` | Codex 작성 문구 |
| `claude/skill/references/planning.md:53-74`, `coordination.md:92-99` | Claude 작성 문구 |
| `tests/test_arc_policy.py:440-441`, `tests/test_harness_contract.py:42-48` | 기존 정책 문구를 고정하는 assertion |
| `tests/node/fixtures/instruction-contracts.json:65-70,177-182` | 플랫폼별 기존 문구 fixture |
| `tests/node/role-policy.test.mjs:67-68,174-183`, `tests/node/instruction-layout.test.mjs:21-29` | 기존 생성·projection·fixture 검증 경로 |

Planner는 지정된 설치 참조와 `writing-plans`를 읽었으며, 생성기의 `--check` 지원도 읽기 전용으로 확인했다. 설치된 Codex `planning.md`·`coordination.md`가 저장소 원본과 동일하다는 사실은 brief의 Scouter 증거이다.

후속 Orchestrator 변경 필드는 이번 계획에서 테스트 추가·실행을 제외하고 기존 문구 고정 assertion·fixture 갱신과 비테스트 정합성 확인을 허용한다. 이 변경은 구현 승인이나 검사 통과 증거가 아니다.

## 검토 초점

다음 다섯 조건을 T1의 정적 비교와 QA 검토에 포함한다. 테스트로 추가하거나 실행하지 않는다.

1. 중간 사용자 변경이 여러 번 들어오면 한 scope delta로 합쳐 다음 brief에 반영한다.
2. 미승인 해석·출처 없는 주장이 승인 결정·검증 사실로 제시되지 않는다.
3. 여러 누락은 고정 체크리스트 검토 후 하나의 보정 요청으로 전달한다.
4. 통합 보정 후 같은 기준이 새 입력·근거 없이 계속 미충족이면 단계를 보류한다.
5. 사용자 승인 실질적 변경이나 구체적인 미충족 항목에 진전이 생기면 추가 호출을 허용하며, 전역 횟수 제한으로 차단하지 않는다.

각 조건의 영어 문구가 양 플랫폼에서 같은 의무·허용·금지·보류 조건을 나타내는지 확인한다. 이 검토는 작성된 계약의 의미를 확인하며, 실제 에이전트 행동 준수는 미검증이다.

## T1: Planner 작성 정책과 연결된 계약 일괄 정합화

**목표·범위:** C1–C8을 정본, 양 플랫폼 영어 작성 문구, 생성 결과, 기존 문구 고정 assertion·fixture, 활성 Codex 설치본에 일관되게 반영한다.

**선행 조건·의존성:** 수정 계획의 사용자 승인, 승인 문서 준비·커밋, Common handoff gate 통과. 선행 구현 작업은 없다.

**소유권:** 한 Implementer가 아래 수정·생성·설치 동기화를 소유한다. fresh QA는 수정 없이 승인된 정적 확인을 수행한다. Orchestrator가 수용·Git 작업을 담당한다. 공유 대상의 병렬 수정은 하지 않는다.

### 대상 파일

직접 수정:

- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/lib/policy/role-policy.json`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/codex/skill/references/planning.md`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/codex/skill/references/coordination.md`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/claude/skill/references/planning.md`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/claude/skill/references/coordination.md`

기존 문구 고정 내용만 필요한 경우 수정:

- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/tests/test_arc_policy.py`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/tests/test_harness_contract.py`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/tests/node/fixtures/instruction-contracts.json`
- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/tests/node/role-policy.test.mjs`

읽기 전용 영향 확인:

- `/Users/yunho/.codex/worktrees/planner-call-loop-guard/arc/tests/node/instruction-layout.test.mjs`

생성 결과는 `POLICY_TARGETS`와 정식 생성 결과로 실제 변경 목록을 확정한다. 전체 생성 대상 목록을 추정하지 않으며, 생성기·placement·renderer는 수정하지 않는다.

활성 설치본은 변경된 `codex/skill/` 파일에 대응하는 `/Users/yunho/.codex/skills/arc/` 파일만 동기화한다. 작성 문구 두 파일과 실제 영향을 받은 생성 출력이 포함된다. Claude 설치본 동기화는 제외한다.

### 구현 단계

- [ ] **1. 인계 상태와 변경 전 증거를 기록한다.**

  Orchestrator는 승인 계획 버전·해시·문서 커밋, 현재 branch/HEAD/변경 상태, 원본 checkout 보존, 소유권, 설치본 대응 파일 상태를 인계 기록에 연결한다. 문서 커밋으로 HEAD가 바뀌면 준비 시 HEAD와의 관계를 기록한다.

  Common handoff gate에 따라 승인·대상·보존·문서 커밋·미해결 실패 유무를 확인한 뒤 Implementer를 시작한다. 양 플랫폼 영어 지침 기준, 테스트 추가·실행 제외, 허용된 정적 확인 범위를 brief에 명시한다.

- [ ] **2. 정본과 작성 문구에 원장·근거 구분을 영어로 반영한다.**

  `planning.planner-brief` 및 양 플랫폼의 해당 planning·coordination 구간에 다음 의무를 간결하고 명확한 영어로 작성한다.

  - 각 작성 단계 전에 원요구, 승인 결정, 미결 결정, 제외 범위, scope delta의 간결한 원장을 유지한다.
  - 중간 사용자 변경을 하나의 delta로 합쳐 다음 Planner brief에 전달한다.
  - 사용자 승인 결정, 정확한 경로·행으로 뒷받침한 검증 사실, 가정, 미결 결정을 구분한다.
  - 출처 없는 주장을 검증 사실로 제시하지 않는다.

  양 플랫폼에서 동일한 용어와 적용 기준을 사용한다. 기존 준비 증거·출처·입력 접근 상태·순차 승인 의무를 보존한다.

- [ ] **3. 통합 보정과 추가 호출의 진전 조건을 영어로 반영한다.**

  같은 정본·작성 구간에 다음 흐름을 영어로, 양 플랫폼에서 의미상 동일하게 반영한다.

  1. 완전한 최초 brief를 한 번 전달한다.
  2. 완전한 초안을 고정 체크리스트로 한 번 검토한다.
  3. 발견한 실질적 누락을 하나의 보정 요청으로 모은다. 변경 필드만 보내고 나머지는 `unchanged`로 표시한다.
  4. 이후 호출은 사용자 승인 실질적 범위·근거 변경 또는 통합 보정 후의 구체적인 미충족 체크리스트 항목에 한정한다. 변경 입력·대상 기준·기대 산출물과 진전을 명시한다.
  5. 같은 기준이 새 입력·근거 없이 반복 미충족이면 단계를 보류한다. 미충족 기준, 관찰 근거, 해제에 필요한 정확한 입력·결정을 보고한다.
  6. 누락별 분할 요청, 해결된 질문 반복, 같은 요청의 재표현을 금지한다. 전역 호출 상한을 만들거나 불완전 초안을 수용하지 않는다.

  단순 재표현이나 에이전트 교체를 의미 있는 입력 변경으로 취급하지 않는다. 문구를 줄이면서 허용 조건이나 보류 조건을 생략하지 않는다. Planner 프로필과 무관한 권한·Git·승인·QA·Reviewer 경계는 보존한다.

- [ ] **4. 관리 구간과 기존 문구 고정 내용을 갱신한다.**

  선택된 작업 공간에서 실행한다.

  ```bash
  node scripts/update-role-policy.mjs
  ```

  실제 변경 생성 파일을 나열하고 `planning.planner-brief`의 정상 projection인지 확인한다. 생성된 정책도 영어 원본과 일치해야 한다. 관리 구간을 직접 편집하지 않는다.

  변경 전 문구를 고정하는 기존 assertion·fixture만 새 영어 정책 문구와 맞춘다. 새 test case·assertion을 추가하지 않고, 기존 검사를 삭제·우회하거나 정책 의무를 약화하지 않는다. 수정이 필요하지 않은 테스트 파일은 유지한다. 테스트는 실행하지 않는다.

- [ ] **5. 비테스트 정합성 확인을 수행한다.**

  선택된 작업 공간에서 실행한다.

  ```bash
  node scripts/update-role-policy.mjs --check
  git diff --check
  ```

  성공 조건은 종료 코드 `0`, 생성 결과 최신 상태, 공백 오류 없음이다.

  diff를 읽어 다음을 기록한다.

  - C1–C8의 반영과 기존 필수 경계 보존.
  - 모든 새·수정 정책 지침의 영어 작성 여부, 간결성·명확성.
  - Codex·Claude의 의무·허용·금지·보류 조건 일치.
  - 정상 생성 projection과 기존 문구 고정 수정의 최소 범위.
  - 새 테스트·assertion 및 무관한 정책·프로필·생성물 변경 부재.

  manifest 등 추가 필수 정합성 의존성이 발견되면 정확한 경로·필요 확인·영향을 Orchestrator에 보고한다. 승인 범위 밖 수정이나 테스트 실행을 자동으로 추가하지 않는다.

- [ ] **6. 영향받은 활성 Codex 설치본을 동기화한다.**

  대상 파일의 변경 전 상태·원본 대응 관계를 확인한 뒤, 변경된 `codex/skill/` 파일만 `/Users/yunho/.codex/skills/arc/`의 동일 상대 경로에 복사한다.

  각 파일의 원본·설치 경로, 전후 해시, byte 비교 결과를 기록한다. 설치본에 예상 밖 사용자 변경이 있으면 덮어쓰지 않고 보류한다. 재설치·installer 동작 변경은 수행하지 않는다.

- [ ] **7. fresh QA가 T1의 승인된 정적 확인을 독립 수행한다.**

  QA는 테스트를 추가·수정·실행하지 않는다. 생성기 `--check`, diff 확인, 양 플랫폼 작성·생성 내용 비교, 영어 문구의 명확성·의미 일치 검토, 기존 문구 고정 수정 범위 확인, 활성 설치본 byte 비교를 수행한다.

  C1–C8마다 방법, 실제 대상 revision과 미커밋 변경, 근거 위치, `proven`·`unmet`·`unverified`, 남은 한계를 보고한다. C7은 영어 기준·플랫폼 의미 일치·생성 정합성·설치 byte 일치를 각각 확인한다. 정적 계약 정합성과 미실행 테스트·실제 행동을 구분한다.

  QA에서 발견한 미충족은 Implementer 수정 후 해당 QA의 정적 재확인을 거친다. 수정으로 무효화된 관련 정합성 확인도 반복한다. 테스트 실행 결과는 계속 미검증으로 남긴다.

- [ ] **8. Orchestrator가 T1을 수용하고 한 focused 구현 커밋을 만든다.**

  C1–C8의 작성 계약, 영어·플랫폼 의미 일치 기준, 승인된 정합성 확인, 필요한 QA 재확인, 생성·설치 정합성을 확인한 뒤 수용한다. 테스트 미실행과 실제 행동 미검증을 기록하며 통과로 표시하지 않는다.

  저장소 변경은 하나의 구현 커밋으로 기록하고 SHA·포함 파일·HEAD·잔여 변경을 확인한다. 설치본 변경은 Git 밖의 증거로 연결한다. Implementer와 QA는 Git 상태를 변경하지 않는다.

### T1 수용 조건과 증거

| 기준 | 필요한 정적 증거 |
|---|---|
| C1 | 원장·중간 변경 병합 의무가 정본과 양 플랫폼 작성 문구에 반영됨 |
| C2 | 승인·사실·가정·미결 구분 및 정확한 경로·행 인용 의무 확인 |
| C3 | 완전한 최초 brief·고정 체크리스트·단일 통합 보정 흐름 확인 |
| C4 | 추가 호출의 허용 사유, 변경 입력·기대 산출물, 분할·반복 금지 확인 |
| C5 | 동일 기준 무진전 반복 시 보류·근거·해제 입력 보고 의무 확인 |
| C6 | 전역 호출 상한 없음, 추가 호출마다 의미 있는 입력 또는 기준 상태 진전 요구 |
| C7 | 양 플랫폼의 새·수정 지침이 간결하고 명확한 영어이며 의미·적용 기준이 일치함. 작성·생성 결과·기존 문구 고정 내용 일치 및 영향받은 Codex 설치 파일 byte 일치 |
| C8 | Planner 프로필 횟수 규칙 없음, 무관한 역할·Git·승인·QA·Reviewer 경계 변경 없음 |

테스트 실행 결과, 수정한 assertion·fixture의 실행 성공 여부, 실제 소비 에이전트의 규칙 준수는 이 작업의 정적 증거로 입증하지 않는다.

### 보류 조건

계획 승인·필수 입력 누락, 대상·branch/HEAD/소유권 불일치, 예상 밖 변경, 생성 오류·범위 밖 생성 변경, 영어·플랫폼 의미 불일치, 필수 정합성 확인 실패, 설치본 충돌·부분 동기화, 미해결 기준은 관련 작업과 수용을 보류한다.

첫 실패의 명령·결과·근거·기준 revision·현재 변경 상태를 보존한다. Orchestrator가 baseline/current 및 영향을 분류하고 해결한 뒤 해당 gate를 재확인한다. 반복 실행·대상 변경·의존성 설치·테스트 실행으로 우회하지 않는다.

## 최종 전체 검토와 완료

T1 수용·커밋과 필요한 QA 재확인이 끝난 뒤, 독립 Reviewer가 최종 전체 변경을 한 번 검토한다. 대상은 정본, 양 플랫폼 영어 작성·생성 결과, 기존 문구 고정 assertion·fixture의 수정 범위, 설치 동기화 증거, C1–C8 및 테스트 제외 제약의 일관성이다. Reviewer는 T1 수용·커밋의 선행 gate가 아니다.

최종 Reviewer finding은 Implementer 수정 → Reviewer 재검토로 해결하며 이 단계에서는 QA를 재배정하지 않는다. 이전 정적 확인을 수정 후 확인으로 표시하지 않는다. Orchestrator는 해결 후 보정을 수용하고 필요한 focused 후속 커밋을 수행한다. 실질적 범위 변경은 해당 승인 절차를 따른다.

완료 조건은 최종 finding 해결, Orchestrator의 전체 수용, 저장소·활성 설치본 정합성 증거, 원본 checkout 보존 확인이다. 최종 보고에는 실제 변경 파일, 기준별 정적 증거, 영어·플랫폼 의미 일치 검토 결과, 생성기·diff 확인 결과, 설치 동기화 결과, 커밋 SHA를 포함한다. 테스트 미실행과 실제 에이전트 행동 미검증을 명시한다.

---

## 자체 검토

- **C1–C2:** 원장·delta·근거 구분을 정본·양 플랫폼 수정과 정적 수용 증거에 연결했다.
- **C3–C6:** 통합 보정 뒤 추가 호출의 진전 조건과 동일 기준 무진전 보류를 구분했다. 전역 횟수 제한이나 불완전 초안 수용을 허용하지 않는다.
- **C7:** 양 플랫폼의 새·수정 지침에 간결하고 명확한 영어 및 의미·적용 기준 일치를 추가했다. 정본 → 생성 → 기존 문구 고정 수정 → 정합성 확인 → 설치 동기화를 단일 작업으로 유지했다.
- **C8:** Planner 프로필 횟수 규칙과 무관한 역할·권한·검증 경계 변경을 제외했다.
- **변경 제약:** 새 테스트·assertion, RED/GREEN, 테스트 실행을 제거했다. 기존 문구 고정 수정만 허용하고 실행 결과는 미검증으로 남겼다.
- **역할·검토:** fresh QA의 정적 확인을 작업 수용 전에, 최종 Reviewer를 작업 수용·커밋 뒤에 배치했다. 필요한 finding 재확인을 보존했다.
- **미결 결정:** 추가 실질적 결정은 없다. 수정 계획 승인은 대기 상태다. 이번 수정에서 파일 저장·수정·검사·Git 작업·설치 동기화는 수행하지 않았다.
