# 정식 계획 문서 작성 전 실행 작업 공간 선택

문서 상태: 승인된 D1에 따른 정식 spec 초안. 개별 written-spec 승인은 아직 받지 않았습니다.

문서 경로: /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-19-planner-workspace-selection-before-documents-design.md

## 1. 목적과 승인된 방향

Planner가 정식 spec 또는 plan을 작성해야 하는 작업에서는 사용자가 실행 대상을 선택하고 Orchestrator가 실제 작업 공간을 준비·확인한 뒤 정식 문서 작성을 시작한다.

이 순서는 Codex와 Claude의 공통 ARC 계약이다. managed worktree는 Codex에만 제공한다.

초기 brainstorming·설계 제안은 선택에 필요한 작업 범위와 문서 필요성을 정리하는 단계이므로 실행 대상 선택 전에 진행할 수 있다. 정식 문서 작성·저장은 선택된 실제 작업 공간을 기준으로 한다.

역할 책임과 승인 경계는 유지한다.

- Planner는 설계·spec·plan 초안과 self-review를 반환한다.
- Orchestrator는 범위와 계획 깊이를 결정하고, 초안을 통합·저장·검토하며 사용자 승인을 조율한다.
- 정식 spec은 설계 승인 후 작성한다.
- 필요한 written-spec의 개별 승인 후 종속 plan을 작성한다.
- 전체 적용 문서가 개별 승인된 뒤 남은 승인 문서를 한 번에 커밋한다.
- Coder는 기존 전체 인계 조건이 충족된 뒤 시작하거나 재시작한다.

사용자는 D1을 “승인하고 spec 작성 진행”으로 승인했다. 이는 이 spec의 개별 승인이나 구현 계획 승인으로 간주하지 않는다.

## 2. 배경

현재 양쪽 runtime은 정식 문서 작성·승인 완료 후 실행 대상을 선택하도록 규정한다. Codex는 이후 managed worktree를 선택하면 승인 문서를 source에서 target으로 전송한다.

이 순서는 실제 실행 공간이 확정되기 전에 문서를 작성하게 한다. 이번 변경은 실행 대상 선택과 실제 준비를 정식 문서 작성 앞으로 이동하여 문서 경로와 실행 공간을 일치시킨다.

현재 근거:

- Codex planning.md: “Design and planning”, “Document-save evidence gates”, “Complete planning-document set”
- Codex handoff-prep.md: “Execution-target request gate”, “Git mutation evidence gate”, “Planning document commit”
- Codex handoff-worktree.md: “New managed worktree”, “Worktree document transfer”
- Codex handoff.md: “Checkout approval”, “Coder handoff gate”, “Choice lifetime and restart record”
- Claude planning.md: “Design path and plan depth”, “Document-save evidence gates”, “Complete planning-document set”
- Claude handoff-prep.md: 현재 checkout 준비와 “Planning document commit”
- Claude handoff.md: 실행 대상 확인, canonical record, “Choice lifetime and reuse”

## 3. 범위

### 포함

1. Codex·Claude의 실행 대상 선택 시점과 준비 조건.
2. 초기 설계 제안과 정식 spec·plan 작성의 구분.
3. 선택 전 제시할 예정 문서 범위와 검증된 실행 대상.
4. 선택한 공간에서의 문서 작성·저장.
5. 초기 대상 준비와 승인 문서 staging·commit의 증거 조건 분리.
6. Codex worktree의 기본 문서 작성 경로와 기존 문서 전송 예외.
7. 선택 재사용, 대상 변경, 실패, 재시작 기록.
8. 관련 정책·Planner profile·구조 검사와 공통 계약 추적의 정합성.

### 범위 밖

- Claude managed worktree 지원 추가.
- 각 runtime의 기존 branch 명명·충돌 처리 방식 변경.
- 새로운 spec·plan 작성 의무 추가.
- 기존 Coder 인계 조건 완화.
- 자동 stash, reset, clean, branch/worktree 정리.
- push 권한 추가.
- 외부 skills 수정.
- 소비 agent의 실제 실행을 강제하는 런타임 장치 도입.
- 기존 문서나 커밋에 대한 소급 승인·준수 인정.

## 4. 용어와 상태 구분

| 용어 | 의미 |
|---|---|
| 초기 설계 제안 | brainstorming 결과, 선택지, 범위·깊이 판단, 질문과 수용 기준. 정식 spec·plan 초안 작성 이전 단계 |
| 정식 문서 작성 | Planner가 승인된 설계·요구에 따라 완전한 spec 또는 plan 초안을 만드는 단계. 파일 저장 여부와 무관 |
| 예정 문서 범위 | 현재 작업에 예상되는 문서 목록, 역할·범위, 예상 경로와 의존 순서 |
| 대상 준비 완료 | 명시적 선택에 따라 실제 checkout/branch/worktree의 경로·identity·Git 상태·보존을 확인한 상태 |
| 전체 적용 문서 집합 완료 | 현재 실행 범위의 모든 필수 문서가 작성되고 각각 승인되었으며 추가 문서를 요구하는 미해결 결정이 없는 상태 |
| 최종 문서 준비 | 기존 승인 커밋 확인, 남은 승인 문서 일괄 커밋, 결과 확인 |

예정 문서 범위는 문서 작성 중 구체화할 수 있다. 문서가 아직 작성되지 않았다는 사실이나 세부 계획이 미확정이라는 사실만으로 초기 대상 선택을 막지 않는다. 실행 대상이나 보존 범위를 판단할 수 없게 하는 불확실성은 먼저 해결한다.

완성된 정식 초안을 선택 전에 반환하고 저장만 뒤로 미루는 방식은 새 순서를 충족하지 않는다.

## 5. 공통 정상 순서

정식 문서가 필요한 작업의 기본 순서는 다음과 같다.

1. 제공된 workspace에서 읽기 전용 조사와 초기 설계 제안을 진행한다.
2. Orchestrator가 설계 승인과 문서 필요성·깊이 판단을 기록한다.
3. 예정 문서 범위와 검증한 실행 대상을 사용자에게 제시한다.
4. 사용자의 명시적 실행 대상 선택을 기록한다.
5. 선택에 따라 실제 대상을 준비하고 확인한다.
6. 실제 workspace와 문서 경로를 담은 brief로 Planner에게 정식 spec을 의뢰한다.
7. Orchestrator가 spec을 저장·검토하고 개별 승인을 받는다.
8. 승인된 spec에 종속하는 plan을 Planner가 작성하고, Orchestrator가 저장·검토하여 개별 승인을 받는다.
9. 전체 적용 문서 집합의 완료를 확인한다.
10. 선택된 대상에서 유효한 기존 승인 문서 커밋을 확인하고 남은 승인 문서만 한 번에 커밋한다.
11. 최종 Git 상태를 확인하고 기존 전체 Coder 인계 조건을 통과한다.

written spec이 필요하지 않고 plan만 필요한 경로에서는 spec 단계만 생략한다. plan 필요성만으로 spec을 요구하지 않는다.

이미 동일 작업에 대해 유효한 선택과 실제 준비 증거가 있다면 3–5단계의 완료를 확인하여 재사용한다. 기본 시점보다 이른 명시적 선택도 이 조건으로 재사용할 수 있다. 이 재사용은 설계·문서 승인 조건을 생략하지 않는다.

## 6. 선택 요청 조건과 사용자에게 제시할 정보

Orchestrator는 선택 요청 전에 다음을 확인하고 공유 brief 또는 canonical record에 기록한다.

### 예정 문서 범위

- 현재 작업 범위와 설계·계획 깊이.
- 예상 spec·plan 목록과 각 문서의 범위.
- 문서 필요성 또는 생략 판단.
- 예상 저장 경로.
- 알려진 문서 의존 순서.
- 아직 작성·승인되지 않은 문서의 상태.

선택 요청에 전체 문서 작성 완료, 개별 written-spec/plan 승인, 최종 문서 버전이나 문서 commit SHA를 요구하지 않는다.

### 검증한 대상

- 접근 가능한 절대 workspace와 의도한 repository.
- 현재 branch 또는 detached HEAD.
- 검증한 full base HEAD SHA.
- staged/unstaged/untracked 상태.
- 기존 변경의 보존 범위와 편집 소유권.
- 새 branch를 제안하면 정확한 후보와 해당 runtime의 충돌 확인 결과.

대상을 달리하는 선택은 각각 사용자가 구분할 수 있게 제시한다. 침묵, 설계 승인, 문서 승인만으로 실행 대상을 선택했다고 해석하지 않는다.

### Codex worktree 추가 정보

worktree를 제시할 때는 검증한 source 절대 경로, repository와 Git common directory, source branch/HEAD, branch 후보·충돌 상태, 설명 이름을 제시한다. 기존 문서가 있으면 예상 재사용·전송 범위도 밝힌다.

실제 destination 경로는 app이 결정한다. 사용자가 임의 destination 경로를 정하도록 요구하거나 sibling 경로를 미리 확정하지 않는다.

## 7. 플랫폼별 대상 준비

| 경로 | Codex | Claude |
|---|---|---|
| 현재 checkout 유지 | 지원 | 지원 |
| 현재 checkout에서 새 task branch 생성 | 지원 | 지원 |
| 새 managed worktree와 task branch | 지원 | 미지원 |

### 현재 checkout

명시적 선택 또는 유효한 재사용 증거를 확인한다. 절대 경로, repository, branch/HEAD, 변경 상태와 소유권을 확인하고 기록한다.

### 현재 checkout에서 새 task branch

승인한 정확한 후보와 base를 재확인하고 기존 branch 규칙에 따라 생성·전환한다. 성공 후 다음을 확인한다.

- 실제 branch가 승인 후보와 일치한다.
- HEAD가 기록한 base와 일치한다.
- checkout 절대 경로가 유지된다.
- 기존 변경이 보존된다.

각 runtime의 기존 명명·충돌 처리 규칙은 유지한다. 변경된 후보가 승인을 요구하는 경우 해당 승인을 완료한다.

### Codex managed worktree

기존 app 도구 계약을 유지한다.

- 검증한 source full HEAD SHA를 명시적인 ref로 사용한다.
- 생성·등록·현재 chat 연결 완료를 확인한다.
- 실제 절대 경로와 source/target repository identity를 확인한다.
- 승인 branch와 base를 확인한다.
- source의 branch·HEAD·index·파일 보존을 확인한다.
- 실제 target 경로와 승인 branch 확인 전에는 정식 문서 작성·저장, 전송, staging·commit 또는 Coder 시작을 진행하지 않는다.

app 작업 진행 중 상태를 성공으로 간주하지 않는다. 다른 name/ref/path/branch나 raw Git worktree 생성으로 자동 대체하지 않는다.

Claude에서 managed worktree 요청은 미지원으로 보고하고 종속 작업을 보류한다.

## 8. 정식 문서 작성·저장 조건

Planner의 정식 작성 brief에는 다음을 제공한다.

- 실제 선택된 절대 workspace와 repository.
- 확인한 branch/HEAD와 대상 준비 결과.
- 선택 또는 유효한 재사용 증거.
- 해당 문서 작성에 필요한 설계·spec 승인 증거.
- 문서 범위, 의존 문서와 절대 저장 경로.
- 편집·저장 책임과 보류 조건.

Planner는 제공된 공간을 임의로 바꾸지 않는다. 경로 충돌, 접근 실패, 예상하지 않은 branch 상태나 증거 불일치를 발견하면 종속 작성을 멈추고 Orchestrator에게 보고한다.

기본 저장 경로:

- <selected-workspace>/docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
- <selected-workspace>/docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md

사용자 지정 경로가 있으면 존중하되 선택된 공간과 충돌하거나 접근할 수 없는 경로는 먼저 해결한다.

Orchestrator의 첫 저장 증거에는 기존 문서별 조건과 함께 실제 대상 준비 및 의도한 저장 경로의 일치를 포함한다.

- spec: 승인 설계, Planner의 완전한 초안·self-review, 통합·저장·검토 책임.
- required Bounded spec: 기존 깊이 판단과 필요성 근거 추가.
- plan: 승인 설계와 필요한 승인 spec, 계획 깊이, 적용 plan 목록·의존성, 완전한 Planner 초안·self-review.

저장은 검토 가능한 파일을 만드는 행위다. 승인이나 커밋을 뜻하지 않는다.

## 9. Git 작업과 문서 커밋 경계

초기 대상 준비를 전체 문서 승인 이후에만 가능한 작업으로 취급하는 현행 문구는 단계별로 구분한다.

| 작업 | 필수 조건 |
|---|---|
| branch/worktree 생성·전환 | 예정 문서 범위, 명시적 선택 또는 유효한 재사용, 실제 Git 상태·보존·소유권, 정확한 작업과 대상 |
| 승인 문서 staging | 전체 적용 문서 집합 완료, 개별 승인 버전·경로, 선택 대상 유효성, 기존 커밋 확인 |
| 문서 commit | 승인 문서 staging 조건, 실제 staged 경로·내용, 확정한 English Conventional Commit 메시지 |
| Coder 시작·재시작 | 기존 전체 인계 조건 |

모든 준비 Git 작업은 직전 증거와 작업 후 실제 결과를 기록한다. 무관한 staged 변경, 소유권 불명확, 해결되지 않은 실패·부분 완료는 해당 작업을 막는다.

문서 커밋 규칙은 유지한다.

- 유효한 기존 승인 커밋은 SHA·메시지·경로·내용과 선택 대상에서의 유효성을 확인하여 재사용한다.
- 남은 승인 문서만 한 번의 focused docs commit으로 묶는다.
- 구현 파일을 포함하지 않는다.
- 중복·빈 커밋이나 과거 커밋을 합치기 위한 amend/reset/recommit을 만들지 않는다.
- 커밋 결과와 최종 branch·HEAD·변경 상태를 확인한다.
- 커밋은 구현 수용이나 push 승인이 아니다.

문서가 필수도 아니고 생성되지도 않은 경우에만 기존 깊이 근거를 기록하여 문서 커밋을 생략한다. 미커밋 문서를 부재로 취급하지 않는다.

## 10. Codex worktree 문서 전송

신규 정상 경로는 실제 worktree 준비 후 그 공간에서 정식 문서를 작성·저장한다. source에 먼저 작성한 뒤 옮기는 과정을 필수로 두지 않는다.

기존 승인 문서가 있는 재개 작업이나 명시적인 대상 변경에는 현재의 안전한 전송 계약을 유지한다.

- 유효한 기존 승인 커밋은 재사용한다.
- 미커밋 승인 문서만 같은 repository-relative 경로로 복사한다.
- source 문서를 이동·삭제·수정하지 않는다.
- source HEAD/index와 승인 working-tree 내용 조건을 확인한다.
- destination의 안전한 base 상태와 경로 이탈 여부를 확인한다.
- 예상하지 않은 destination 변경을 덮어쓰지 않는다.
- 복사 후 승인 버전과 내용 일치를 확인한다.
- 다른 파일이나 dirty implementation 변경을 전송하지 않는다.
- 전송 실패·부분 완료는 종속 staging·commit·Coder 인계를 막는다.

기존 문서가 있다는 이유로 새로 필요한 정식 문서를 source에서 계속 작성할 수는 없다. 새 종속 작성은 확인된 target에서 진행한다.

## 11. 선택 유효기간, 변경과 기록

초기 선택 증거는 문서 작성 단계부터 구현 재시작까지 사용한다. 재사용하려면 범위·workspace·repository·실행 대상이 일치하고 증거가 접근 가능하며 유효해야 한다.

다음은 그 자체로 선택을 무효화하지 않는다.

- 같은 범위의 정식 문서 작성·저장·수정.
- 승인 문서 커밋.
- 승인된 구현과 수용된 과제 커밋.
- 위 작업에 따른 정상적인 HEAD·dirty 상태 변화.

문서 내용 변경에는 해당 버전의 재승인이 필요할 수 있다. 문서 재승인과 실행 대상 재선택은 구분한다.

범위·workspace·repository·실행 대상·승인 branch 후보가 바뀌면 영향을 받는 후속 작업 전에 새 선택을 받는다. 선택 요청에 문서 전체 완성을 다시 요구하지 않는다. 실제 대상 준비와 필요한 문서 승인·커밋·인계 조건은 해당 단계에서 다시 충족한다.

실패가 기존 대상의 신뢰성을 무효화하면 문제 해결 후 새 선택이 필요하다. 대상이 유효한 상태의 불일치 해결은 자동 재선택 사유로 확대하지 않는다.

초기 증거는 공유 brief에 기록하고 기존 canonical record에 연결·통합한다.

<git-common-dir>/arc/handoff/<plan-or-task-slug>.md

record는 예정 문서 상태에서 시작하여 승인·커밋·인계 결과를 실제 진행에 맞춰 갱신한다. 존재하지 않는 승인·SHA를 완료로 기재하지 않는다. 기존 record 접근·inline 대체 규칙과 보안·보존 규칙을 유지한다.

이미 늦게 수행한 선택·저장·Git 작업은 실제 순서와 증거 공백을 기록한다. 새 정책이나 후속 승인으로 과거 절차 준수를 소급 주장하지 않는다.

## 12. 기존 경로와 인계 조건 보존

이 변경은 기존 문서 생략 판단을 바꾸지 않는다.

- Spike에는 구현용 spec·plan을 새로 강제하지 않는다.
- Bounded의 기존 plan 생략 조건과 spec 필요성 판단을 유지한다.
- 비행동 documentation/configuration의 적용되지 않는 문서 단계를 유지한다.
- 문서 생략은 명시적 대상 선택, Git 상태·소유권 확인, 적용되는 인계 조건을 생략하지 않는다.

Coder의 첫 시작·재시작에는 계속 다음이 필요하다.

1. 모든 적용 설계·문서 승인과 전체 문서 집합 완료 또는 유효한 생략 근거.
2. 유효한 실행 대상 선택.
3. 실제 workspace와 repository identity.
4. 실제 branch/HEAD·변경 상태·보존·소유권.
5. 승인 문서 커밋 검증 또는 유효한 문서 부재.
6. branch·commit 작업 후 최종 상태와 미해결 실패 부재.
7. 접근 가능한 증거를 포함한 brief.

초기 대상 준비만 완료된 상태로 Coder를 시작하지 않는다.

## 13. 변경 표면과 의존성

정책 구현 범위는 다음을 포함한다.

- Codex: planning.md, handoff-prep.md, handoff.md, handoff-worktree.md
- Claude: planning.md, handoff-prep.md, handoff.md
- Planner profiles: codex/agents/arc-planner.toml, claude/agents/arc-planner.md
- 구조 검사: tests/test_arc_policy.py, tests/test_claude_payload.py
- 공통 순서와 플랫폼 차이에 대한 기존 parity 관리·추적 항목

기존 검사와 배포·생성 경로의 정확한 동기화 대상은 Scouter 조사에 따라 구현 계획에서 확정한다. unrelated installer parity 데이터를 단순히 이름이 같다는 이유로 변경하지 않는다.

정책·profile·검사는 같은 계약을 표현해야 한다. 과제 구분과 실행 순서는 written-spec 승인 이후의 구현 계획에서 정한다.

## 14. 수용 기준과 검증 요구

| ID | 수용 기준 | 필요한 확인 |
|---|---|---|
| AC1 | 양쪽 runtime에서 정식 문서 작성 전 선택·실제 준비를 요구 | 정상 순서와 Planner 작성 조건의 구조 검사 |
| AC2 | 초기 설계 제안은 선택 전에 가능 | 초기 제안과 정식 초안의 구분 확인 |
| AC3 | 선택 전에 예정 문서 범위와 검증 대상을 제시 | 선택 요청 요건 확인 |
| AC4 | 선택 요청에 완료 문서·개별 승인을 요구하지 않음 | 기존 역순 조건 제거 및 회귀 검사 |
| AC5 | 현재 checkout·새 branch·Codex worktree가 실제 준비 후 작성으로 연결 | 플랫폼별 정책 확인 |
| AC6 | Claude에 worktree 선택·생성 지원이 추가되지 않음 | 미지원 조건 검사 |
| AC7 | Planner 작성·Orchestrator 저장·승인 책임 유지 | 양쪽 profile·정책 정합성 확인 |
| AC8 | 선택 공간에 직접 저장하고 기존 전송은 보호된 예외로 유지 | 저장 경로와 전송 조건 확인 |
| AC9 | spec 승인 후 종속 plan, 전체 개별 승인 후 일괄 commit 유지 | 승인·커밋 순서 회귀 검사 |
| AC10 | 초기 준비 완료만으로 Coder를 시작할 수 없음 | 기존 전체 인계 조건 보존 확인 |
| AC11 | 생략 경로에 새 문서 의무가 생기지 않음 | Spike·Bounded·비행동 경로 확인 |
| AC12 | 정상 상태 변화의 선택 재사용과 실제 대상 변경의 재선택 구분 | 재시작·증거 갱신 규칙 확인 |
| AC13 | Codex·Claude 공통 순서와 지원 차이가 추적됨 | 기존 parity 방식에 맞춘 확인 |

구조 검사에는 허용되는 새 순서와 함께 미승인 문서 커밋·조기 Coder 시작이 계속 금지됨을 확인하는 항목이 필요하다. Claude의 기존 문구 검사를 정확한 순서를 확인할 수 있도록 보완한다.

Orchestrator가 승인된 과제별 기준·검사·증거를 확인하여 수용한다. 과제별 Reviewer를 필수 검사로 추가하지 않는다. 모든 과제 수용 후 최종 전체 변경에 대해 단일 독립 Reviewer 검토로 공통 계약, 플랫폼 차이, 역할·승인 경계의 일관성을 확인한다.

구조 검사 통과는 문서화된 정책의 정합성을 입증한다. 실제 역할 반환·승인·저장·Git 실행 기록이 없다면 소비 agent의 런타임 준수는 미검증으로 남는다.

## 15. 현재 작업의 적용 상태

Orchestrator가 제공한 증거:

- 선택 workspace/repository: /Users/yunho/Desktop/project/arc
- 선택 경로: 현재 checkout에서 새 task branch 생성
- 실제 branch: chore/planner-workspace-before-documents
- base/current HEAD: ab4c330e662b13a7babdd289167f49e9546b302c
- branch 생성 완료, base HEAD 유지, clean 상태
- D1 설계 승인 완료
- canonical handoff record는 아직 없음

이번 Planner 작업은 제공된 Git 증거를 사용했으며 재검증하지 않았다. 선택된 대상과 범위가 유지되는 한 재선택하지 않는다. canonical record 미작성 사실과 실제 준비 순서는 그대로 기록한다.

예상 후속 계획 경로:

/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-19-planner-workspace-selection-before-documents.md

이 spec을 Orchestrator가 저장·검토한 뒤 개별 written-spec 승인을 받아야 한다. 그 이후 Planner가 다음 경로를 대상으로 구현 계획을 작성한다.

## 16. 가정과 미해결 사항

- 승인된 D1은 Codex와 Claude 공통 계약 변경을 포함한다.
- 실행 대상 선택은 명시적이며 기존 조기 선택도 유효성 확인 후 재사용한다.
- 실제 workspace가 확인된 뒤 문서 경로를 확정한다.
- 외부 skills와 플랫폼별 branch 정책은 변경하지 않는다.
- 정확한 parity 추적 위치와 배포·생성 산출물은 Scouter 결과로 구현 계획에서 확정한다.

현재 동작을 바꾸는 사용자 결정은 추가로 필요하지 않다. Scouter 결과가 승인 범위를 넘어서는 새 계약 변경을 요구하면 Orchestrator가 범위 판단과 필요한 승인을 조율한다.

## Planner self-review

builder-check-prompt.md의 관점으로 자체 점검했습니다. 역할 제약에 따라 별도 agent는 생성하지 않았습니다.

- 순서의 모호성: 정식 작성에는 파일 저장 전 초안 작성도 포함하여, source에서 작성하고 target에 저장만 하는 우회를 막았습니다.
- 초기 조사 가능성: 초기 brainstorming·설계 제안은 선택 전 가능하며 정식 문서와 구분했습니다.
- 준비와 승인 분리: branch/worktree 준비에는 예정 문서 범위를, staging·commit과 인계에는 전체 문서 승인을 요구했습니다.
- 플랫폼 차이: 공통 선택 시점을 적용하면서 Codex 전용 worktree와 기존 branch 정책 차이를 유지했습니다.
- 수명주기: 같은 범위의 문서 수정·정상 Git 변화와 실제 범위·대상 변경을 구분했습니다.
- 기존 문서: 승인 문서 재사용·전송과 실제 순서 기록을 유지하여 소급 준수 주장을 막았습니다.
- 인계 보호: 초기 준비만으로 Coder를 시작할 수 없고 기존 모든 인계 조건이 유지됩니다.
- 남은 사항: 정확한 검사·parity·배포 동기화 위치는 구현 계획에서 Scouter 증거로 확정할 항목이며, 현재 spec의 동작 결정에는 영향을 주지 않습니다.

파일 저장·수정, Git 작업, 검사 실행은 하지 않았습니다. 정식 구현 계획은 written-spec의 개별 승인 전까지 작성하지 않습니다.

