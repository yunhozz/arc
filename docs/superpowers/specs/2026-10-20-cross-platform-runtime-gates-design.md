# Codex·Claude 실행 게이트 명세

**상태: written-spec 승인 필요**

저장 대상: `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc/docs/superpowers/specs/2026-10-20-cross-platform-runtime-gates-design.md`

## 1. 목적과 배경

ARC의 역할 정책을 프롬프트 생성뿐 아니라 실제 에이전트 배정, 도구 실행, acceptance, 커밋 절차와 대조한다. 승인된 아키텍처는 **공유 상태·검증기와 플랫폼별 사전 실행 게이트를 결합하고, 지원되는 hook 경로에서 엄격하게 판정하는 방식**이다.

현재 정책의 기준은 `lib/policy/role-policy.json`이며, `lib/policy/render.mjs`가 역할별 설명을 생성한다. Codex 정책은 주로 프롬프트 계약이고, Claude의 `claude/skill/hooks/role-git-guard.mjs`는 specialist의 Bash Git 변경을 제한한다. 기존 구조에는 전체 역할의 배정 및 작업 생명주기를 공통 상태와 대조하는 게이트가 없다.

다음 두 사례가 핵심 회귀 대상이다.

1. 승인된 spec·plan을 별도로 커밋하지 않고 T1 구현과 함께 커밋한 경우.
2. T1에 배정한 Coder를 연속성 유지라는 이유로 T2에 재사용한 경우.

기존 사건의 정확한 loaded prompt payload는 입증할 수 없다. 이 명세는 당시 프롬프트의 내용을 추정하지 않고, 앞으로 관측 가능한 실행과 Git 결과를 검증한다.

## 2. 승인 범위와 대상

준비 근거는 Orchestrator가 제공한 다음 기록을 사용한다.

| 항목 | 값 |
|---|---|
| Workspace | `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc` |
| Branch | `chore/arc-runtime-gates` |
| HEAD 및 base | `0563816bd5df69b887c3ac037f4e21607bc696ef` |
| 변경 상태 | clean |
| 문서 상태 | 대상 spec·plan 없음, docs 디렉터리 존재 |
| Handoff 근거 | `/Users/ma-24-007/Desktop/workspace/arc/.git/arc/handoff/cross-platform-runtime-gates.md` |

이 근거는 초안 작성 대상의 준비 근거이며, 이후 실행 시점의 HEAD·index·설치 상태를 대신하지 않는다.

### 목표

- 여섯 역할을 Codex와 Claude 모두에서 같은 정책과 상태 계약으로 판정한다.
- 문서 승인·문서 커밋·배정·검증·acceptance·작업 커밋 사이의 선행 조건을 검사한다.
- 지원되는 실제 사전 실행 경계에서 부적합 요청을 거부한다.
- 정책 생성, 설치 자산, 실제 활성 훅, 관측된 판정을 구분하여 보고한다.
- 근거 부족, 잘못된 identity, 정책 불일치, 상태 손상 시 지원 경로의 실행을 보류한다.
- 기존 작은 작업 직접 수행 경로와 계획 생략 경로의 적용 조건을 보존한다.

### 비목표

- OS 수준의 격리나 같은 사용자 권한을 가진 프로세스에 대한 위변조 방지.
- 훅이 없거나 비신뢰·비활성·미지원인 경로의 전역 차단.
- 임의 shell·script·MCP 작업의 모든 내부 효과나 자연어 의도의 완전한 판별.
- 에이전트의 답변만으로 사용자 승인 진위를 증명하는 기능.
- 별도 Codex 호스트 또는 Claude Agent SDK 실행 환경 도입.
- 이 변경을 이유로 새로운 사용자 승인 의무나 역할 권한을 추가하는 것.

## 3. 공통 구조와 통합 경계

구조는 다음 다섯 부분으로 구성한다.

1. **정책 정의:** 역할·작업·근거·판정 규칙의 단일 기준.
2. **워크플로 상태:** 승인 범위, 문서, identity, task 진행, 검증, acceptance, 커밋 기록.
3. **순수 검증기:** 상태와 요청 및 관측 근거를 대조하는 플랫폼 독립 함수.
4. **플랫폼 어댑터:** 훅 입력 정규화, identity 연결, 플랫폼 응답 변환.
5. **설치·진단:** 자산 생성, 설정·신뢰·활성 여부 확인, 지원 범위 보고.

기존 `lib/policy/role-policy.json`과 renderer를 확장하여 설명과 실행 규칙이 같은 rule ID를 사용하도록 한다. 설명상의 `hook` 표기는 해당 실행 경로의 지원 범위를 함께 제시해야 한다. 특정 플랫폼 전체에 대한 완전 강제를 뜻해서는 안 된다.

`lib/installer/plan.mjs`는 필요한 runtime 자산과 설정 연결을 설치 대상으로 다룬다. 기존 Claude Git guard와 새 검증기가 서로 다른 Git 허용 목록을 독립적으로 유지하지 않게 한다. 기존 guard의 허용 동작을 넓히는 변경은 명시적인 정책 변경으로 취급한다.

정확한 신규 파일 분할은 후속 계획에서 정하되, 정책·순수 검증·상태 I/O·플랫폼 어댑터·설치·테스트의 책임은 분리한다.

## 4. 공유 상태 계약

### 4.1 필수 데이터

| 영역 | 필수 정보 |
|---|---|
| 식별·버전 | `schemaVersion`, `workflowId`, `revision`, 정책 해시, runtime·adapter 버전 |
| 대상 | workspace realpath, repository 및 worktree 식별, branch 또는 detached HEAD, 기준·현재 HEAD |
| 승인 | 승인 종류, 범위·대상, 원본 메시지 또는 확인 가능한 근거 참조, 승인된 내용 해시 |
| 문서 | 종류, 절대 경로, Git 상대 경로, 내용 해시, 승인 근거, docs-only 커밋 SHA |
| 작업 | 최상위 task ID, 승인 범위, 선행 task, 기준 커밋, acceptance criteria, 요구되는 checks |
| 배정 | 플랫폼, 실제 agent identity, 역할, task ID, 허용 작업·파일·checks·임시 산출물 범위, 상태 |
| 검증 | check ID, 실행 주체, 요청·결과 근거, 검사한 변경 범위, findings 및 해결 근거 |
| Acceptance | Orchestrator identity, 충족한 criteria·checks·findings 근거, 수락한 변경 fingerprint |
| 커밋 | 용도, task ID, 예상 parent·index tree, 실제 SHA·parent·tree, 남은 변경 |
| 기능 지원 | 플랫폼·버전·도구 경로별 지원 상태, 설치·신뢰·실행 확인 근거 |
| 감사 기록 | 요청 ID, 상태 revision, rule ID, 판정, 결과 확인, 보류·복구 이유 |

해시는 알고리즘을 명시한다. 경로는 workspace 경계와 symlink 해석 결과를 함께 확인하여 단순 문자열 prefix만으로 소유 범위를 판단하지 않는다.

다른 worktree, branch 또는 workflow의 기록을 재사용할 수 없게 한다. 정책·schema·대상 불일치는 자동으로 성공 상태로 변환하지 않는다.

### 4.2 승인 근거의 신뢰 경계

승인 기록은 내용과 provenance를 함께 가져야 한다. 에이전트가 임의로 기록한 `approved: true`, 역할 배정 메시지, 이전 실행의 성공 보고만으로 사용자 승인을 생성할 수 없다.

가능한 경우 플랫폼이 제공하는 사용자 메시지 또는 사람이 확인한 명시적 참조를 승인 내용의 해시와 연결한다. 실행 환경에서 근거를 확인할 방법이 없으면 `unverified`로 표시하고 해당 승인이 필요한 전이를 보류한다.

Orchestrator는 근거를 등록하는 주체지만 사용자 승인의 발행자가 되지는 않는다. 이 구조는 감사 가능성을 제공하며, 같은 OS 사용자 권한에 대한 암호학적 진실 보장은 제공하지 않는다. 로그의 연결 해시 역시 변경 탐지 보조 수단이며 접근 통제를 대신하지 않는다.

### 4.3 동시성과 결과 반영

상태 변경은 잠금과 revision 비교를 사용해 직렬화한다. 요청에는 고유 ID를 부여하고 중복 결과를 멱등적으로 처리한다.

사전 허용 기록은 실행 성공을 뜻하지 않는다. 배정·커밋 등의 결과를 확인한 뒤에만 완료 상태를 기록한다. 실패·중단·결과 유실은 `pending` 또는 `unknown`으로 남기고 후속 의존 작업을 보류한다.

정책이나 승인 문서가 바뀌면 관련 근거의 유효성을 재평가한다. 모든 기존 승인을 무조건 폐기하거나 조용히 유지하지 않는다.

## 5. 순수 검증기 계약

검증기는 다음 입력을 받는다.

```text
evaluate(policy, workflowState, normalizedRequest, observedEvidence)
```

입력은 최소한 다음을 구분한다.

- 플랫폼에서 관측한 호출 주체와 역할 연결.
- 실제 tool name·arguments·cwd 및 대상 경로.
- 요청 종류: 배정, 읽기, 쓰기, check 실행, acceptance, Git 변경, 외부 작업, 상태 전이.
- 현재 HEAD·index tree 등 요청 판단에 필요한 관측 근거.
- 상태 revision과 해당 경로의 지원 수준.

반환값은 다음을 포함한다.

```text
decision: allow | deny | hold
ruleIds
reason
requiredEvidence
expectedRevision
proposedTransition
coverage
```

`deny`와 `hold`는 지원되는 사전 실행 경계에서 모두 실행 거부로 변환한다. `hold`는 보완 가능한 근거나 복구가 필요한 상태를 구분하기 위한 결과다.

검증기는 파일·네트워크·Git 변경을 실행하지 않는다. 어댑터가 수집한 입력을 검증하며, 상태 I/O 계층이 허용된 전이를 원자적으로 반영한다.

호출자가 arguments에 넣은 `role: orchestrator` 등을 identity 근거로 신뢰하지 않는다. 플랫폼 메타데이터와 실제 배정 기록을 연결할 수 없으면 권한 작업을 허용하지 않는다.

## 6. 역할별 실행 계약

다음 표의 각 행은 Codex와 Claude에 각각 적용한다. 양쪽 adapter 테스트가 있어야 하며, 한쪽의 성공으로 다른 쪽을 대체할 수 없다.

| 역할 | Codex | Claude |
|---|---|---|
| Orchestrator | 지원되는 도구 경계에서 문서 저장·조정·acceptance·Git 권한 및 선행 근거 검사. 직접 구현은 기존 작은 작업 예외가 기록된 경우에 한함 | 동일한 정책을 Claude 도구·identity 입력에 적용 |
| Scouter | 승인된 정적 자료 읽기만 허용. 설치·checks·운영 상태 조사·파일/Git/외부 상태 변경 거부 | 동일 |
| Planner | 자료 읽기와 응답 초안만 허용. 문서 저장·구현·checks·대상 준비·사용자 승인 요청 거부 | 동일 |
| Coder | 승인 task의 파일 변경과 focused checks만 허용. Git·다른 task 배정·독립 QA·acceptance 거부 | 동일 |
| QA | 승인된 checks 및 지정 위치·수명의 필수 임시 자료만 허용. 제품·test·fixture·configuration 수정과 Git·acceptance 거부 | 동일 |
| Reviewer | 최종 변경·근거의 독립적인 읽기만 허용. QA 실행·파일/Git 변경·acceptance 거부 | 동일 |

모든 specialist의 Git 변경 금지는 Orchestrator의 배정으로 해제할 수 없다. specialist의 후속 위임이나 다른 도구 사용으로 권한을 확대하지 않는다.

Orchestrator의 acceptance는 명시적인 상태 전이여야 한다. specialist의 성공 보고, checks 통과, Reviewer 의견은 필요한 근거가 될 수 있지만 acceptance 자체가 아니다.

### 실행 의미의 판별 한계

파일 도구는 실제 경로와 작업 종류를 검사한다. shell·MCP 등은 지원하는 문법·작업 종류 및 승인된 실행 descriptor를 사용한다. 해석할 수 없는 요청은 엄격 경로에서 거부한다.

승인된 check에는 실행 파일·인수·cwd·허용 환경·산출물 범위를 기록한다. 임의 interpreter 또는 승인된 프로그램이 내부에서 수행하는 모든 효과를 정적으로 증명할 수 있다고 표시하지 않는다. Coder focused check와 독립 QA의 구분은 역할·워크플로 단계·근거 발행 주체를 통해 검사하며, 명령 이름만으로 판단하지 않는다.

## 7. 워크플로 불변식

### 7.1 승인 문서와 최초 Coder 배정

계획이 필요한 경로에서는 다음 근거가 모두 있어야 최초 Coder 배정을 허용한다.

- 승인된 전체 spec·plan 목록과 내용 해시.
- spec 승인 이후의 종속 plan 및 plan 승인 근거.
- 전체 승인 문서를 포함한 별도의 docs-only 커밋.
- 해당 커밋의 실제 parent·tree·문서 blob 검증.
- 구현·configuration·test-code 등 허용 문서 집합 밖의 파일이 포함되지 않았다는 근거.

기존에 승인된 문서 변경도 범위와 소유권을 명시해야 한다. 승인 문서와 index 또는 커밋의 내용이 다르면 배정을 보류한다.

작은 작업 직접 수행·계획 생략 경로는 기존 조건과 근거를 명시한 별도 workflow mode로 표현한다. mode 이름만으로 문서 의무를 해제할 수 없다.

### 7.2 Task와 identity

최상위 task마다 새 Coder identity를 사용한다. 같은 identity를 다른 최상위 task에 재바인딩하는 전이는 거부한다.

같은 task의 수정·재작업에는 같은 Coder를 사용할 수 있다. task가 수락되면 해당 Coder의 실행 권한은 종료한다. 종료된 identity를 T2에 재활성화하지 않는다.

spawn 전 요청을 검증하고, spawn 결과와 관측 이벤트로 실제 identity를 확정한다. 불일치·누락·중복 매핑은 보류한다. 시작된 agent도 유효한 배정이 확정되기 전에는 지원되는 권한 도구를 사용할 수 없다.

follow-up·resume 등은 실제 사전 게이트 적용 여부를 경로별로 확인한다. 차단되지 않는 메시지 전달 자체를 막았다고 보고하지 않는다. 종료된 T1 identity의 후속 도구 사용은 identity 연결과 해당 도구 훅이 지원되는 범위에서 거부한다.

### 7.3 Checks와 검토

필요한 checks는 승인된 작업 범위·위험·기존 정책을 따른다.

- significant/high-risk 계획 작업: 각 task의 필요한 fresh QA 및 실패 재검증 → Orchestrator acceptance → focused commit.
- 모든 task 수락과 필요한 QA 완료 후: 최종 전체 변경에 대해 독립 Reviewer 검토 한 번.
- 최종 전체 Reviewer finding: Coder → Reviewer로 수정·재확인하며 QA를 추가 배정하지 않는다.
- significant/high-risk 계획 생략 작업: Coder → 필요한 QA와 재검증 → 최종 전체 Reviewer → Orchestrator acceptance.

Reviewer를 매 task 필수 단계로 만들지 않는다. task 경계 자체만을 이유로 불필요한 QA를 추가하지 않는다.

### 7.4 Acceptance와 focused commit

task acceptance는 다음을 참조한다.

- 승인된 criteria 충족 근거.
- 필요한 checks와 그 대상 변경 fingerprint.
- findings의 해결 또는 승인된 처리 근거.
- Orchestrator identity.
- 수락한 변경의 범위와 fingerprint.

수락 후 내용이 바뀌면 영향받은 acceptance와 checks를 재평가한다.

task 커밋 전에는 실제 index를 읽어 해당 task의 수락된 변경과 일치하는지 확인한다. 다른 task·무관한 변경·누락 파일·문서 뒤늦은 혼입을 거부한다. 같은 파일에 여러 소유 범위가 있으면 경로 목록만으로 동일성을 판정하지 않고 승인된 diff 또는 tree 근거를 사용한다.

한 승인된 최상위 task는 하나의 focused implementation commit이 된다. 성공 후 실제 SHA·parent·tree·HEAD·남은 변경을 확인해야 다음 의존 task를 진행할 수 있다.

### 7.5 외부 작업

push·merge·deploy·publish·외부 메시지는 Orchestrator만 수행하며, 사용자 승인에 action·scope·target이 포함되어 있어야 한다. 로컬 commit 권한은 외부 권한을 만들지 않는다.

외부 작업의 실제 도구 경로가 지원되지 않으면 강제 차단으로 표시하지 않는다. 해당 경로의 실행 보장은 별도의 승인된 지원 범위가 필요하다.

## 8. 플랫폼 어댑터

### 8.1 Codex

`PreToolUse`를 지원되는 요청의 사전 차단점으로 사용한다. 공식 문서상 `spawn_agent`는 `Agent`에 매칭되므로 이를 배정 게이트의 필수 확인 대상으로 삼는다. `SubagentStart`는 실제 `agent_id`·`agent_type` 관측과 배정 대조에 사용한다. 이 이벤트의 `continue: false`는 시작을 막지 않으므로 배정 차단 수단으로 사용하지 않는다. [Codex Hooks](https://developers.openai.com/codex/hooks)

`followup_task`가 같은 게이트를 통과하는지는 별도 검증 항목이다. 지원 여부가 확인되기 전에는 spawn과 동일한 차단 보장을 표시하지 않는다. 도구별 canonical name·alias·code mode 경로도 실제 계약에 따라 확인한다.

현재 플랫폼에는 다음 한계가 있다.

- 일부 specialized tool path는 기본 훅 경로를 생략할 수 있다.
- 기존 unified-exec 세션의 `write_stdin`은 새 `PreToolUse`를 발생시키지 않는다.
- 지원되지 않는 응답 필드 등 훅 실패 상황에서 원래 도구 호출이 계속될 수 있다.
- 훅의 설치·활성·사용자 신뢰 상태에 따라 실행되지 않을 수 있다.

따라서 판별 불가능한 장기 대화형 shell은 지원되는 엄격 실행 경로에 포함하지 않는다. runtime 내부 오류는 유효한 명시적 deny 응답으로 변환하지만, runtime이 실행되기 전의 timeout·시작 실패·플랫폼 skip까지 전역 fail-closed로 보장하지 않는다. [Codex Hooks](https://developers.openai.com/codex/hooks)

### 8.2 Claude

`PreToolUse`의 `permissionDecision: "deny"`를 지원되는 요청의 사전 차단 응답으로 사용한다. 배정 도구와 파일·Bash·MCP 도구 경로를 공통 작업 종류로 정규화한다. 실제 역할과 identity를 연결할 수 없는 권한 요청은 거부한다.

지원되는 command/HTTP hook에는 `onFailure: "block"`을 적용하고 설치 환경에서 유효성을 확인한다. 일반적인 훅 오류는 기본적으로 작업을 계속하게 할 수 있으므로 정상 deny 테스트만으로 실패 차단까지 확인했다고 보고하지 않는다. [Claude Hooks](https://code.claude.com/docs/en/hooks-guide)

시작·종료 이벤트는 identity 및 결과 관측에 사용한다. 현재 Claude Code 설치형 환경을 대상으로 하며, 별도 SDK의 `canUseTool`이나 custom host가 존재한다고 전제하지 않는다.

## 9. Git 경계

플랫폼 사전 게이트는 Git 변경 주체와 workflow 선행 조건을 확인한다. 커밋 경계는 실제 index·parent·tree를 대조한다. Git hook은 보조 경계이며 설정 비활성화나 우회 불가능성을 보장하지 않는다.

엄격 지원 경로에서 커밋은 검증된 작업 descriptor로 수행한다. 별도 index·Git directory·worktree 변경, 검증 생략 옵션, 검증을 무효화할 환경 재정의는 지원하지 않는다.

사전 검증과 실행 사이의 경쟁을 줄이기 위해 workflow Git 변경을 직렬화하고 예상 HEAD·index tree를 확인한다. 외부 프로세스까지 같은 잠금을 따르도록 강제할 수는 없다. 실제 커밋이 예상과 다르면 불일치 상태로 보류하고 자동 reset·amend로 복구하지 않는다.

커밋 후 검증은 이미 발생한 변경을 취소하는 사전 차단이 아니다. 보고서에서 사전 거부와 사후 불일치 탐지를 구분한다.

## 10. 설치·신뢰·Preflight·Doctor

설치 자산은 다음을 포함한다.

- 정책·상태 schema·runtime·adapter의 호환 버전과 해시.
- 역할 전체에 필요한 hook 설정.
- Claude의 지원되는 실패 차단 설정.
- 사용자가 검토해야 하는 hook 정의와 trust 절차.
- 현재 지원·미지원 도구 경로 및 플랫폼별 제한 설명.

Codex의 사용자 관리형 plugin hook은 설치 파일만 생성했다고 활성화된 것으로 간주하지 않는다. 수동 설치·사용자 검토와 신뢰가 필요한 환경을 구분하며, managed hook의 관리자 설정이 제공된다고 가정하지 않는다. [Codex Hooks](https://developers.openai.com/codex/hooks)

Preflight·doctor는 다음을 구분해 출력한다.

| 상태 | 의미 |
|---|---|
| Generated | 정책과 자산이 생성됨 |
| Installed | 대상 설정·자산이 존재하고 호환됨 |
| Trusted/configured | 확인 가능한 신뢰·설정 근거가 있음 |
| Observed | 해당 세션·경로에서 실제 hook 실행이 확인됨 |
| Verified deny | 무해한 probe에서 기대한 사전 거부가 관측됨 |
| Unsupported/unknown | 보장 근거 없음 |

활성 여부를 확인할 수 없으면 성공으로 추정하지 않는다. 오래된 probe 결과를 현재 세션 전체에 적용하지 않는다.

필수 게이트가 없거나 구버전·비신뢰·미확인인 경우 관리되는 workflow 진입을 실패 처리한다. 다만 훅이 전혀 실행되지 않는 환경에서 하네스 내부 검사만으로 다른 진입 경로까지 막을 수는 없다. 이 경우 진단은 “실행이 차단됨” 대신 “엄격 workflow 사용 불가”로 보고한다.

사용자 환경의 설정·신뢰를 자동으로 변경하는 것은 이 명세의 승인 범위에 포함하지 않는다.

## 11. 실패·복구·보류 조건

| 조건 | 동작과 복구 기준 |
|---|---|
| 상태 누락·손상·schema 불일치 | 지원되는 권한 요청 거부. 근거 확인 후 명시적 복구 또는 migration |
| 정책·설치 자산 버전 불일치 | 실행 보류. 같은 버전의 생성·설치·활성 근거 필요 |
| identity 연결 실패 | 임의 역할 추정 금지. 배정 결과와 관측 기록 대조 |
| 승인 원본 확인 불가 | 승인 필요한 전이 보류. 사용자 근거 확인 후 재평가 |
| 문서 내용 변경 | 영향받은 승인·docs commit 유효성 재평가 |
| HEAD·index·대상 변경 | 현재 상태를 다시 관측하고 소유권·acceptance 영향 확인 |
| spawn 성공 여부 불명 | 중복 배정 금지. 실제 identity 확인 전 후속 권한 보류 |
| commit 결과 불명 | HEAD·객체 조회로 대조. 근거 없이 재커밋하거나 자동 reset 금지 |
| QA 실패 | Coder 수정 후 필요한 QA 재검증 |
| 최종 Reviewer finding | Coder 수정 후 Reviewer 재확인 |
| hook timeout·skip·미지원 경로 | 보장 수준 하향 및 workflow 보류. 차단 성공으로 기록하지 않음 |
| 동시 요청·중단·재시작 | revision·요청 ID·실제 결과를 대조한 뒤 진행 |

복구가 역할·승인 범위를 확대하지 않는다. 전문 역할이 Git 상태를 복구하거나 자신의 근거를 수락할 수 없다. 자동 복구가 실패한 상태를 성공 상태로 덮어쓰지 않는다.

## 12. 필수 회귀 시나리오

### R1. 승인 문서와 T1 혼합 커밋

1. 승인 spec·plan은 있으나 docs-only 커밋이 없는 상태에서 첫 Coder 배정을 요청한다.
2. 배정 게이트는 문서 커밋 근거 부족으로 거부해야 한다.
3. 문서와 T1 구현을 함께 index에 넣어 docs commit을 요청한다.
4. 커밋 게이트는 비문서 변경 혼입을 거부해야 한다.
5. 올바른 문서 묶음의 별도 커밋을 확인한 뒤에는 최초 Coder 배정이 허용되어야 한다.

이 시나리오는 로그 문구가 아니라 배정 부재, Git HEAD 불변, 이후 정상 진행을 근거로 확인한다.

### R2. T1 Coder의 T2 재사용

1. 실제 identity A를 T1에 배정한다.
2. T1의 같은-task 수정은 정책 조건에 따라 허용한다.
3. T1 수락 후 A의 실행 권한을 종료한다.
4. A를 T2로 재바인딩하는 상태 전이를 거부한다.
5. 지원되는 follow-up 경로에서 T2 재배정을 거부한다.
6. follow-up 사전 차단이 미지원이어도 메시지 차단 성공으로 보고하지 않으며, 지원되는 도구 게이트에서는 종료된 A의 권한 작업을 거부한다.
7. 새 identity B의 T2 배정은 T1 커밋 등 선행 조건 충족 후 허용한다.

Codex follow-up 통제가 확인되지 않으면 해당 항목을 미지원으로 명시한다. 전체 플랫폼의 모든 재사용 전달 경로를 차단했다고 주장하지 않는다.

## 13. Acceptance criteria와 검증 근거

다음이 모두 충족되어야 구현 수락 근거가 완성된다.

1. **정책 일치:** 여섯 역할의 규칙·설명·실행 판정이 같은 정책과 rule ID에서 파생되고 생성물 drift를 탐지한다.
2. **12개 조합:** Codex·Claude 각각 여섯 역할에 대해 정상 허용, 금지 작업, 근거 부족, identity 불명 사례가 있다.
3. **생명주기:** 문서 승인·docs-only commit·새 Coder·QA·acceptance·focused commit·최종 Reviewer 순서를 검증한다.
4. **회귀 차단:** R1·R2가 해당 지원 경계에서 실제 거부되고 정상 경로도 진행된다.
5. **Git 증거:** 임시 repository에서 index·parent·tree·SHA 및 거부 후 HEAD 불변을 확인한다.
6. **플랫폼 계약:** 실제 payload와 정상 deny 응답, alias·배정 경로, 실패 응답을 각각 확인한다.
7. **실패·복구:** 손상 상태, 오래된 revision, 중단, 중복 요청, 결과 유실, 버전 불일치가 성공으로 처리되지 않는다.
8. **설치 진단:** 생성·설치·신뢰·관측·거부 확인을 구분하고 미확인 상태를 통과시키지 않는다.
9. **정직한 범위:** hook 비활성·skip·timeout·미지원 경로 및 shell 의미 판별 한계가 결과와 사용자 문서에 반영된다.
10. **독립 검토:** significant/high-risk 변경의 최종 전체 Reviewer 검토와 필요한 finding 재확인 근거가 있다.

증거는 다음 종류를 구분하여 제출한다.

- 순수 검증기 테스트 결과.
- 플랫폼 adapter 계약 테스트 결과.
- 임시 repository의 실제 Git 동작 근거.
- 설치·생성물 테스트 결과.
- 실제 플랫폼 환경의 무해한 hook 실행·거부 관측 근거.
- 확인하지 못한 버전·도구 경로·환경 목록.

mock payload 테스트만으로 실제 설치 환경의 hook 활성화를 입증할 수 없다. 실환경 확인이 불가능하면 그 제한을 남기고 해당 범위의 강제 검증을 완료로 표시하지 않는다.

## 14. 보장 범위와 명세 자체 검토

이 설계의 보장은 **호환·활성·신뢰된 hook이 실제로 실행되고, 호출 identity와 작업을 지원하는 계약으로 식별할 수 있는 경로에서 정책에 맞지 않는 작업을 사전에 거부하는 것**이다.

프롬프트 생성 여부는 실행 강제의 근거가 아니다. 시작 관측 이벤트는 사전 배정 차단을 대신하지 않는다. 사후 Git 검증은 이미 발생한 커밋을 취소하지 않는다. 감사 기록은 사용자 승인 진위나 같은 OS 사용자에 대한 위변조 방지를 보장하지 않는다.

자체 검토 결과, 승인된 아키텍처를 바꿔야 하는 미결정 사항은 없다. 다음 항목은 구현 및 검증 시 확인해야 하는 플랫폼 의존 조건이다.

- Codex `spawn_agent`와 실제 역할 identity 연결.
- Codex `followup_task`의 hook 적용 여부.
- 각 플랫폼의 도구·alias·code mode 지원 범위.
- 설치 환경에서 Claude `onFailure: "block"`의 적용 가능성과 실패 차단.
- 사용자 관리 환경에서 hook 신뢰·활성 상태를 확인할 수 있는 범위.

이 조건이 확인되지 않으면 지원 범위를 축소하여 명시하고 해당 보장 수락을 보류한다. 조건 미충족을 우회하기 위해 별도 실행 호스트·격리 환경을 도입하려면 범위 변경으로 Orchestrator에게 반환한다.

**이 문서는 written-spec 승인 대상이다. 종속 구현 계획은 이 명세의 저장과 사용자 승인 이후 별도로 작성한다.**
