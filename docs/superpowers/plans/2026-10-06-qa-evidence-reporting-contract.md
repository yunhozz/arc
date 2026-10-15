# QA 근거 보고와 발견사항 인계 계약 구현 계획

> **실행 지침:** CEO가 이 계획에 따라 Coder → 독립 QA → 독립 Reviewer를 순서대로 조율한다. 역할은 직접 위임하지 않는다. 작업 경계마다 별도 QA·review gate를 추가하지 않는다.

**목표:** QA 보고에서 검사 실행 결과와 수락 기준의 입증을 분리하고, QA 실패 및 Reviewer 행동 결함이 Coder 수정·QA 재확인으로 이어지는 순서를 공통 지침과 역할 프로필에 반영한다.

**구조:** `skill/SKILL.md`가 공통 계약을 정의하고 QA·Reviewer 프로필이 해당 역할의 의무를 따른다. README는 사용자용 요약을 제공한다. 기존 `RolePolicyTests`에 정책 문구의 구조 계약 검사를 먼저 추가해 실패를 확인한 다음 지침을 수정한다. 마지막에 배포 파일의 manifest를 동기화한다.

**기술:** Markdown, TOML, Python `unittest`, SHA-256 manifest.

**Spec:** `docs/superpowers/specs/2026-10-06-qa-evidence-reporting-contract-design.md` (사용자 승인 완료)

## 전체 제약

- 구현 파일은 `skill/SKILL.md`, `agents/arc-qa.toml`, `agents/arc-reviewer.toml`, `README.md`, `MANIFEST.sha256`이다.
- TDD 파일은 `tests/test_install.py`의 `RolePolicyTests`뿐이며, 정책 구조 assertion을 추가한다. 이 테스트는 실제 모델·agent runtime 동작을 증명하지 않는다.
- 설치기, 모델 설정, 설치된 사용자 프로필, 실행 중인 agent, 새 도구·자동화는 변경하지 않는다.
- 작은 저위험, 일반 행동, 중요·고위험의 기존 위험 분류와 최소 흐름을 유지한다.
- CEO가 Coder 수정 brief, QA 재확인, Reviewer 진입 및 acceptance를 조율한다. 역할 간 직접 인계는 없다.
- QA는 source, document, test, configuration을 편집하지 않는다. Reviewer는 QA 검사를 실행하지 않는다.
- 검사 상태는 `통과`, `실패`, `미실행`, `환경 차단`; 기준 판정은 `입증`, `불충족`, `미검증`으로 구분한다.
- `PASS`는 검사 실행 결과만 뜻하며 모든 수락 기준의 입증을 대신하지 않는다.
- 구조 검사는 구조 기준만 입증한다. 실제 행동, 설치 결과, live agent runtime 준수를 증명한다고 주장하지 않는다.
- 구현 전 사용자가 이 계획의 테스트 추가·실행을 승인해야 한다. 계획 승인 뒤 Coder는 test-driven-development의 RED → GREEN 절차를 지킨다.
- 공유 역할 계약 변경이므로 최종 흐름은 Coder → 독립 QA → 전체 변경의 독립 Reviewer → CEO acceptance다. QA의 실제 기능 실패는 Reviewer 단계 전에 수정하고 QA가 재확인한다.

## 실행 전 게이트

- [ ] 사용자가 이 계획을 검토하고 승인한다. 승인 범위에는 `tests/test_install.py`의 테스트 추가, RED/GREEN 실행, 최종 전체 unit test 실행이 포함된다.
- [ ] 현재 작업공간은 일반 `master` checkout이다. `using-git-worktrees`에 따라 격리된 worktree를 만들지 사용자 동의를 먼저 구한다. 동의하면 native worktree를 사용하고, 거절하면 현재 checkout에서 진행한다.
- [ ] 최종 workspace가 정해지면 실제 절대 경로·현재 branch·시작 HEAD·diff/status·submodule guard를 재확인한다. worktree를 선택하면 승인된 spec과 plan을 그 workspace에서 Coder가 읽을 수 있게 보존한다.
- [ ] 승인된 workspace에서 baseline 전체 unit test를 실행한다. baseline failure가 있으면 결과를 보고하고, 사용자 결정 전 변경을 시작하지 않는다.
- [ ] 정확한 workspace, 승인 spec/plan 경로, Coder 소유 파일, 테스트 허가, verification 범위와 증거 위치를 Coder brief에 기록한다.

## 검토 중점

1. 검사는 통과했으나 조건·기대 결과·관찰 근거가 연결되지 않으면 기준은 `미검증`이다.
2. 모든 기준을 표에 남기고, 일부 확인·미할당·검사 부재·환경 차단의 공백을 명시한다.
3. 행동 검사 실패 또는 기준 불충족 시 CEO가 Coder에게 수정시키고 QA 재확인을 받기 전에는 Reviewer로 진행하지 않는다.
4. Reviewer가 source에서 추론한 재현 방법을 실행으로 관찰한 결과와 구분한다.
5. 실행 불가 Reviewer finding의 소스 검토와 QA 뒤 최종 전체 review를 유지한다.

## 작업 1: 기존 역할 정책 테스트에 RED assertion 추가

**담당:** Coder

**파일:** `tests/test_install.py` — `RolePolicyTests`

**인터페이스:** 기존 파일·profile loader와 `RolePolicyTests` 패턴을 사용한다. 제품 코드는 수정하지 않는다.

- [ ] **Step 1: QA 보고 계약의 failing test를 추가한다.**

  `RolePolicyTests`에 테스트를 추가하여 QA 프로필이 다음을 요구하는지 확인한다.

  - brief의 모든 수락 기준을 보고하고 식별자가 없으면 원문으로 식별한다.
  - 기준별 확인 방법·범위, 실행 상태, 접근 가능한 근거, 판정, 미검증 사유/범위를 기록한다.
  - 검사 실행 상태와 기준 입증 판정을 분리하고 실행 통과만으로 입증하지 않는다.
  - 수정 후 결함 경로와 영향받은 검사를 재확인한다.

- [ ] **Step 2: Reviewer 인계 계약의 failing test를 추가한다.**

  Reviewer profile과 공통 정책의 assertion이 기준 연계 행동 finding에서 기대 동작, 관찰된 문제, 재현 조건/절차, 근거와 source 추론/실행 관찰 구분을 요구하는지 확인한다. CEO가 finding을 Coder 수정 및 QA 재확인으로 전달하고, Reviewer가 QA 검사를 실행하지 않는다는 조건도 확인한다.

- [ ] **Step 3: CEO acceptance·흐름의 failing test를 추가한다.**

  공통 정책이 실패 → CEO/Coder 수정 → QA 재확인 → 필요 Reviewer 순서를 요구하고, QA 재확인 전 Reviewer 진입을 막는지 확인한다. CEO가 disposition 뒤에도 미검증 상태를 보존하는지, 저위험 집중 확인에 기준별 증거 구분이 적용되는지 확인한다.

- [ ] **Step 4: focused tests를 실행해 예상 실패를 확인한다.**

  ```bash
  python3 -B -m unittest discover -s tests -p test_install.py -k test_qa_reporting_contract
  python3 -B -m unittest discover -s tests -p test_install.py -k test_reviewer_finding_handoff
  python3 -B -m unittest discover -s tests -p test_install.py -k test_acceptance_evidence_flow
  ```

  **Expected:** 각 test가 구현 전 정책/profile에서 해당 assertion이 없어서 실패한다. Import 오류나 잘못된 fixture로 인한 실패는 RED 증거로 인정하지 않고 Coder가 test부터 바로잡는다. 기존 계약이 이미 assertion을 만족하면 임의로 실패를 만들지 않고 CEO에게 보고해 계획 조정을 기다린다.

## 작업 2: 공통 정책과 QA·Reviewer 프로필 갱신

**담당:** Coder. 작업 1 완료에 의존한다.

**파일:** `skill/SKILL.md`, `agents/arc-qa.toml`, `agents/arc-reviewer.toml`.

**인터페이스:** 승인 spec의 두 상태 축, 증거 요건, 수정·인계 순서, 기존 역할 권한.

- [ ] **Step 1: 공통 정책에 기준별 보고를 추가한다.**

  QA 결과에 모든 기준을 포함하고 각 행에 확인 방법·범위, 실행 결과, 접근 가능한 근거, 판정, 미검증 범위를 연결한다. 기준 식별자가 없으면 원문을 가리킨다. 미할당·확인 불가 기준은 이유와 함께 미검증으로 남긴다. `PASS`가 필요하면 검사 실행 결과로 한정하고 전체 기준 입증 주장으로 사용하지 않는다.

- [ ] **Step 2: 검사 실행과 기준 판단의 독립 상태값을 정의한다.**

  실행 상태: 통과·실패·미실행·환경 차단. 기준 판단: 입증·불충족·미검증. 입증에는 기준의 조건·기대 결과·실제 관찰 결과에 연결된 근거를 요구한다. 부분 확인의 남은 영역을 보존한다. 구조 검사는 구조 기준에만 적용한다.

- [ ] **Step 3: QA 실패 및 Reviewer finding 인계 순서를 정의한다.**

  실제 실행 실패 또는 수락 기준 불충족은 CEO가 Coder에게 수정시키고 QA가 재확인한다. 해결 여부를 QA가 보고하기 전에는 Reviewer 단계에 진입하지 않는다. Reviewer가 뒤 단계에서 기준 연계 행동 결함을 찾으면 CEO가 Coder에게 수정시키고, QA가 재현 경로 및 무효화된 검사들을 확인한다. 중요·고위험 변경은 QA 재확인 후 최종 전체 Reviewer가 필요한 범위를 재검토한다.

  환경 차단·검사 부재·미할당 기준은 코드 결함으로 단정하지 않는다. CEO는 이유와 미검증 공백을 확인·처리하고, Reviewer 검토가 필요한 변경에서는 QA 증거를 대체하지 않은 채 기존 전체 검토를 수행한다.

- [ ] **Step 4: QA profile에 필수 결과 형식을 반영한다.**

  기준별 증거 행, 상태값, 공백 표시 및 prior finding의 해결·미해결·미검증 보고를 요구한다. CEO 직접 보고와 편집 금지 범위를 보존한다.

- [ ] **Step 5: Reviewer profile에 finding 인계 형식을 반영한다.**

  기준·기대 동작·문제 결과·관련 source·재현 절차·근거를 CEO에게 전달하게 한다. source에서 추론한 절차와 실행 관찰을 구분한다. Reviewer가 테스트를 실행하거나 finding을 직접 Coder/QA에 보내지 않는다.

- [ ] **Step 6: focused RED tests를 통과시킨다.**

  ```bash
  python3 -B -m unittest discover -s tests -p test_install.py -k test_qa_reporting_contract
  python3 -B -m unittest discover -s tests -p test_install.py -k test_reviewer_finding_handoff
  python3 -B -m unittest discover -s tests -p test_install.py -k test_acceptance_evidence_flow
  ```

  **Expected:** 세 정책 구조 테스트가 모두 통과한다. 리뷰에서 발견된 모순이나 누락은 Coder가 먼저 수정하고 영향받은 tests를 재실행한다.

## 작업 3: README·manifest·회귀 검사

**담당:** Coder. 작업 2의 정책 문구에 의존한다.

**파일:** `README.md`, `MANIFEST.sha256`.

- [ ] **Step 1: README를 공통 계약에 맞춘다.** 위험도 표 아래에 검사 실행 통과와 기준 입증의 차이, QA 실패 후 Coder 수정·QA 재확인, Reviewer finding의 CEO 경유 handoff를 짧게 설명한다.
- [ ] **Step 2: README 및 변경 profile·skill의 manifest digest만 갱신한다.** 기존 정렬·나머지 경로와 digest를 보존한다. Test 파일과 spec·plan은 manifest에 추가하지 않는다.
- [ ] **Step 3: 승인된 tests와 구조 검사를 수행한다.**

  ```bash
  python3 -B -m unittest discover -s tests -p test_install.py -v
  git diff --check
  shasum -a 256 -c MANIFEST.sha256
  ```

  TOML profile 두 개는 Python `tomllib`으로 parse한다. README·공통 정책·profile의 용어와 흐름이 서로 일치하는지 확인한다. 테스트 파일이 수정되었으면 전체 test suite 성공도 필요하며, test output은 runtime agent compliance 근거가 아니다.

## 작업 4: 최종 독립 QA → Reviewer → CEO acceptance

**담당:** CEO가 순차 배정. Coder는 편집한 뒤 다음 역할로 handoff 한다.

- [ ] **Step 1: QA에게 spec 기준과 승인된 structural checks를 배정한다.** QA가 각 spec 기준을 기준별 방법·범위·실행 상태·근거·판정·미검증 사유로 보고한다. 다룰 수 없는 기준도 생략하지 않는다.
- [ ] **Step 2: QA 결과를 처리한다.** 실행 실패/기준 불충족은 CEO가 Coder에게 수정하게 하고, 수정 후 QA가 해당 finding과 영향받은 검사를 재확인한다. 해결되기 전 Reviewer에 보내지 않는다. 환경 차단은 별도로 분류하고 CEO가 증거 공백을 기록한다.
- [ ] **Step 3: QA가 확인한 최종 관련 상태를 Reviewer가 전체 검토한다.** Reviewer는 모순, 과도한 `PASS` 주장, 권한 침범, evidence scope 오류, finding handoff와 변경 diff의 정확성을 읽기 전용으로 확인한다. QA 검사는 실행하지 않는다.
- [ ] **Step 4: Reviewer finding을 처리한다.** 승인 기준과 연결된 행동 finding은 CEO → Coder → QA 경로를 거친다. 중요·고위험 변경이면 QA 후 Reviewer가 최종 상태를 재확인한다. 나머지 finding은 해결하거나 CEO가 명시적으로 disposition한다.
- [ ] **Step 5: CEO가 기준별 상태·최종 evidence·잔여 공백을 확인해 수락을 결정한다.** 미검증은 끝까지 미검증으로 보고한다. 설치 또는 live agent runtime을 검증했다고 주장하지 않는다.

## 수락 기준

- 모든 수락 기준이 근거와 판단에 연결되거나 사유와 함께 미검증으로 남는다.
- 검사 상태와 기준 상태가 분리되고, 검사 통과만으로 행동 기준을 입증하지 않는다.
- 실제 QA 실패는 Coder 수정과 QA 재확인 전에 Reviewer 단계로 넘어가지 않는다.
- Reviewer 행동 finding은 CEO를 통해 Coder 수정·QA 재확인으로 전달되며 필요한 Reviewer 재확인이 뒤따른다.
- 구조·사실·보안 등 실행으로 확인하기 어려운 Reviewer 발견사항과 기존 위험도 흐름이 유지된다.
- README·공통 정책·QA/Reviewer profile이 일치하고 manifest digest가 유효하다.
- 전체 unit test 및 focused 검증이 통과한다. 런타임 역할 준수는 별도 한계로 보고한다.

## 자체 검토

- 승인 spec의 8개 수락 기준을 테스트·정책 편집·QA·Reviewer에 연결했다.
- 테스트 추가·실행을 포함하므로 계획 승인에는 해당 테스트 작업의 사용자 허가가 명시되어야 한다.
- 실패는 코드 결함과 환경 차단으로 나눠 처리한다. Reviewer는 테스트 대체물이 아니다.
- TDD를 적용하고, 공유 role contract 위험에 필요한 QA와 최종 전체 Reviewer를 유지한다.
