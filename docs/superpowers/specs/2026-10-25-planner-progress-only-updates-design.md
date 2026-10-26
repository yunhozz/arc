# Planner 진행 보고와 재호출 상태 gate 명세

**상태:** 전체 개정 written spec. 사용자 승인 완료. 이 승인으로 plan 작성이 허용되며 구현 재개는 승인된 plan과 handoff 준비까지 보류한다.

**문서 대상:** /Users/yunho/.codex/worktrees/planner-progress-policy/arc/docs/superpowers/specs/2026-10-25-planner-progress-only-updates-design.md

**실행 대상:** /Users/yunho/.codex/worktrees/planner-progress-policy/arc  
**브랜치:** chore/planner-progress-only-updates  
**현재 HEAD:** d6241835a771c05ee2d9e5776986213f0d93ea7f  
**base/master HEAD:** 2d95fc4d75aab92bba5e5bf9029a6829f86fcfc9

## 승인 이력과 현재 작업 상태

| 구분 | 승인 증거 | 이번 버전과의 관계 |
|---|---|---|
| 최초 spec | SHA-256 68727db5f8bcc64a86bfb84865bea687e46d29dd45cad650f1f31093c4f4df1a, 2026-10-25 13:32:02 UTC | 기존 진행·초안·승인 계약의 과거 승인 |
| 최초 plan | SHA-256 1acae8d212623ff0cdef7e04ed00c193e4eb75dc8be3991e93fa4688f035342, 13:40:45 UTC | 과거 계획 승인 |
| baseline-aware plan | SHA-256 bb2e18d8b389b468b757d84bdfcaf0f53e3d3d7bded49b62eeed87bab3efded3, 14:10:23 UTC | 기존 T1 검증 disposition 유지 |
| coordination 표면을 포함한 spec | 승인 본문 SHA-256 a9fef2199711fc77c6cf666112b4c71c752c062caa89e96e7449db47fac56374, 14:21:30 UTC | 기존 생성 표면 승인 |
| Architectural 설계 | 사용자 승인 2026-10-25 14:33:25 UTC | 이 전체 개정 명세의 설계 근거 |
| 전체 개정 written spec | 본문 SHA-256 `837b36f99c8355922799b3b73ef48ed0237042129cef2450490e6d0f8f031106`, 사용자 승인 2026-10-25 14:45:50 UTC | 이번 버전의 개별 승인. plan 작성은 허용하며 구현을 승인하지 않음 |

coordination spec의 승인 메타데이터를 포함한 파일 SHA-256은 8b4797c8827c35627f26efa5455f6e050a98e8eaaa8a6f96ae6f3fd43e43d6d8이다. 위 hash들은 과거 버전의 증거이며 이번 전체 개정 본문의 승인 증거가 아니다.

현재 tracked 변경 11개는 기존 작업으로 보존한다. 기존 Implementer 소유 변경 10개와 Orchestrator 소유 spec 변경을 수정·폐기하거나 새로운 범위의 완료 근거로 취급하지 않는다. index와 untracked 상태, 소유권과 대상 준비 증거는 Orchestrator의 최신 brief를 기준으로 유지한다.

기존 실행에서 신규 T1 검사의 RED와 정책 생성 성공이 보고됐다. GREEN·최종 정적 검사·baseline 비교·manifest 완료를 주장하지 않는다. 개정 written-spec 승인 이후 새 plan을 작성하고 승인·준비·handoff를 완료하기 전까지 Implementer를 재개하지 않는다.

## 목적과 범위

Planner의 작성·수정 과정에서 간결한 상태 보고와 완전한 산출물을 구분하고, 반복 호출을 단계별 durable 상태와 증거에 따라 판정한다.

기존 progress-only 계약, 전체 초안·자체 점검 전달, Orchestrator의 통합 검토·저장 문서 승인 흐름을 유지한다. 여기에 최초 초안, 첫 통합 수정과 증거가 뒷받침하는 후속 호출을 구분하는 runtime gate를 추가한다.

format conversion, 재표현만 하는 작업, 문서 저장 오류 복구와 patch 적용 오류 복구는 Planner의 실질적 작성 진척으로 취급하지 않는다. 이러한 사유만으로 Planner를 호출하지 않으며 Orchestrator가 처리한다.

설계 깊이는 **Architectural**, 검증 위험은 **Significant**다. 상태 저장·동시성·replay·플랫폼 adapter·hook entry·설치·payload 호환성이 연결되므로 전체 written spec과 후속 written plan을 요구한다.

새로 추가하거나 수정하는 **ARC harness instruction prose는 간결하고 명확한 영어**로 작성한다. 사용자 검토용 spec·plan의 제목과 본문은 한국어로 유지한다.

## 기존 의사소통·저작·승인 계약

Planner는 Orchestrator에게만 진행 상태를 보고한다. 진행 보고는 현재 단계, 반영 중인 피드백, 실제 차단 요인 또는 다음 단계로 제한한다. 문서 본문·긴 발췌·점진적인 초안 문장·반복되는 작성 중 내용을 넣지 않는다. 최초 작성과 수정에 동일하게 적용하며 새 보고 주기를 추가하지 않는다.

Orchestrator는 이 상태를 바탕으로 사용자에게 짧게 진행을 안내할 수 있다. 초안 내용을 전달하거나 반복하지 않는다.

Planner는 단계 산출물로 완전한 비례적 초안과 자체 점검 결과를 Orchestrator에게 반환한다. 범위·의존성·기준·검증 요구·보류 조건·가정과 미결정을 포함한다. 진행 보고를 짧게 하라는 규칙은 산출물의 요약·누락 근거가 아니다.

Orchestrator는 기존 고정 체크리스트로 전체 초안을 검토하고 모든 실질적 누락을 하나의 통합 수정 요청으로 반환한다. changed-fields-only, 추가 호출 조건과 진전 없는 반복의 보류 규칙을 유지한다. runtime gate는 이 절차를 대체하지 않고 적용 가능한 상태·증거를 검증한다.

설계·spec·plan의 저작은 Planner가 담당한다. Orchestrator는 통합·저장·검토·사용자 승인 요청을 담당하며 실질적인 누락을 직접 작성해 대체하지 않는다.

Orchestrator는 이미 받은 초안의 의미를 보존하는 형식 변환·재표현, 파일 저장과 patch 적용 및 그 오류 복구를 직접 처리한다. 이 책임은 누락된 설계·요구사항·판단을 새로 작성할 권한을 뜻하지 않는다. 별도의 실질적 미충족 기준이 있다면 그 작성·수정은 Planner에게 맡기되 정상 호출 gate를 충족해야 한다.

사용자 승인 시점에는 통합·저장·검토된 Markdown 문서를 제시하고 채팅 승인 요청에 본문을 복제하지 않는다. 저장·승인·commit은 별개다. Planner는 직접 사용자 승인을 요청하거나 수락을 결정하지 않는다.

전체 초안 응답은 앱·도구 화면에 표시될 수 있다. prompt 정책이 원시 subagent 응답이나 도구 출력을 숨긴다고 주장하지 않는다.

## runtime 경계

같은 Planner 호출 판정 논리를 다음 경로에서 사용한다.

1. ARC의 cooperative 준비·기록 경로
2. 실제 native PreToolUse 이벤트와 trusted context가 연결된 adapter 경로

첫 번째는 실제 호출 dispatcher가 아니다. 두 번째도 연결·중재·결과 증거가 확인된 경로에만 enforcement를 주장한다.

판정 결과는 allow, deny, hold와 그 이유·기준·필요 증거·revision·coverage를 포함한다.

- 명확한 금지 요청은 deny다.
- 증거·상태·결과·연결을 확인할 수 없으면 hold다.
- allow는 해당 요청의 준비 또는 중재 허용이며 실제 실행·완료·초안 수락을 뜻하지 않는다.
- native adapter는 deny와 hold를 명시적인 사전 거부 응답으로 변환한다. host가 이를 실제 적용했는지는 별도 coverage 증거다.

## 단계 정체성과 durable ledger

단계는 workflow, 실행 대상 정체성, 문서 경로·종류, 작성 단계와 승인된 입력·범위 버전에 연결한다.

agent ID나 현재 draft hash를 단계 정체성으로 사용하지 않는다. Planner 교체, 새 spawn, 재표현, 문서 저장 또는 commit HEAD 변경만으로 호출 이력을 초기화하지 않는다.

단계 ledger는 다음 정보를 보존한다.

| 정보 | 요구사항 |
|---|---|
| 단계 기준 | 안정적인 stage ID, 문서·단계, 승인된 brief·범위·criterion 버전 |
| 호출 의도 | initial/correction/further 구분, 실질적 작성 목적과 비진척 작업의 구분, request ID, 전체 normalized fingerprint, 예상 revision |
| 호출 근거 | 기준 criterion, 새 입력·근거·진척 ref와 hash, 직전 판단과의 연결 |
| 최초 결과 | artifact ref·hash 또는 확인된 실패 결과, 자체 점검과 완전성 판단 출처 |
| 통합 수정 | 최초 전체 검토와 통합 요청 ref·hash, 첫 수정 기회의 예약·사용 상태 |
| criterion | open/resolved 상태, 상태 판단·변경 근거와 출처 |
| dispatch | 플랫폼·세션·호출 correlation, 예약·실행 관찰·결과 확인·미확인 상태 |
| 감사·coverage | 전후 revision, 판정 이유, provenance, 실제 중재·관찰 범위 |

artifact hash는 실제 접근한 bytes에서 계산한다. caller가 제공한 hash를 검증 없이 사실로 수용하지 않는다. 접근할 수 없는 원본이나 검증되지 않은 ref를 verified evidence로 표시하지 않는다.

기존 native provider state와 cooperative state는 서로 다른 provenance 계약을 유지한다. 공통 판정 논리를 재사용하되 cooperative 기록을 native verified evidence로 변환하지 않는다.

## 호출 상태전이

### 비진척 작업의 선행 분류

initial/correction/further 판정 전에 호출 의도를 분류한다. 다음 사유만 있는 요청은 어느 단계에서도 Planner 호출로 허용하지 않는다.

| 의도 | 담당과 판정 |
|---|---|
| format conversion만 수행 | Orchestrator 작업, deny |
| 같은 내용을 재표현만 수행 | Orchestrator 작업, deny |
| 문서 저장 오류만 복구 | Orchestrator 작업, deny |
| patch 적용 오류만 복구 | Orchestrator 작업, deny |

저장·patch 오류 자체를 “새 근거”나 “미충족 criterion”으로 등록해 같은 초안을 다시 요청하지 않는다. 새 agent에게 다른 출력 형식이나 patch를 다시 만들게 하는 방식으로도 우회하지 않는다.

거부된 비진척 요청은 첫 통합 수정 기회를 소비하거나 dispatch reservation을 만들지 않는다. 감사용 판정·revision·request 기록은 기존 저장 계약에 따라 남길 수 있지만 작성 단계나 criterion을 진전된 것으로 표시하지 않는다.

저장·patch 실패가 있었다는 사실만으로 모든 후속 Planner 작업을 거부하지 않는다. 별도의 실질적 미충족 criterion과 필요한 근거가 있으면 그 작업을 정상 gate로 평가한다. 이때 저장·patch 오류는 적격성을 만드는 근거가 아니며, 해당 실질적 작업의 산출물·검토·증거 연결 조건도 생략하지 않는다.

### 최초 초안

유효한 새 단계에서 최초 초안을 허용한다. 기존 역할·대상·승인·단계 준비 조건은 계속 적용한다.

호출 허용 전에 durable reservation을 기록한다. 결과가 미확인인 같은 단계에 최초 호출을 중복 허용하지 않는다.

### 첫 통합 수정

최초 초안 결과에 대한 전체 검토와 하나의 통합 수정 요청을 연결해 첫 수정 호출을 허용한다. 누락을 나누어 여러 “첫 통합 수정”으로 처리하지 않는다.

최초 결과가 불완전하거나 실패했다면 그 사실을 그대로 기록한다. 완전한 초안을 받았다고 꾸미거나 완료로 수락하지 않는다. 확인된 결과와 검토를 바탕으로 첫 통합 수정에서 누락을 보완할 수 있다. 결과 자체가 미확인이라면 먼저 reconciliation한다.

문서 저장·patch 적용 실패는 Planner 초안의 실질적 누락과 구분한다. 받은 초안이 충분하고 전달·저장 형식만 문제라면 Orchestrator가 처리하며 첫 통합 수정을 요청하지 않는다.

### 이후 호출

첫 통합 수정 이후에는 다음 두 조건을 모두 충족해야 한다.

- 구체적인 미충족 criterion이 식별되어 있다.
- 그 criterion과 관련된 의미 있는 새 입력·근거 또는 검증 가능한 실제 진척이 있다.

다음 요청은 허용하지 않는다.

| 요청 | 결과 |
|---|---|
| format conversion·재표현만 수행 | deny |
| 문서 저장·patch 적용 오류 복구만 수행 | deny |
| 해결된 criterion을 같은 근거로 반복 | deny |
| 새 ref만 붙이고 동일 bytes·동일 근거를 반복 | deny |
| 미충족 criterion 없이 추가 작업 요청 | deny |
| unresolved 상태만 반복하며 새 입력·근거·진척이 없음 | hold |
| 근거 누락·접근 불가·hash 불일치·출처 미확인 | hold |
| 요청과 연결되지 않는 다른 단계의 근거 | deny 또는 검증 불가 시 hold |

이미 해결된 criterion을 단순히 open으로 바꾸어 호출을 허용하지 않는다. 새로 관찰된 결함이 있다면 원본 근거와 기존 판단에 연결된 명시적 재평가 기록이 필요하다. 실제 범위 변경이면 기존 범위 승인 절차를 적용한다. 기존 범위의 일반적인 누락 보완에 새 범위 승인을 추가로 요구하지 않는다.

호출 횟수 상한을 두지 않는다. 적격한 후속 요청은 계속 허용할 수 있다. ordinal은 감사 정보이며 임계값이 아니다. 새로운 횟수·시간·진척량 기준을 도입하지 않는다.

## 기계 검증과 semantic attestation

runtime은 다음을 검증한다.

- 단계·대상·승인·criterion 버전 연결
- 구조화된 호출 의도의 비진척 작업 분류
- 근거 접근·bytes·hash·이전 사용 여부
- 요청 fingerprint와 ledger revision
- criterion의 현재 기록 상태
- 새 결과·finding·check·artifact와 요청 사이의 참조 관계
- 통합 수정 기회의 중복 사용
- 미확인 dispatch·replay·충돌·다른 단계의 이력 재사용

다음은 기존 Orchestrator 검토 판단에 의존한다.

- 새 자료의 실질적인 관련성
- 단순 재표현과 내용 진척의 의미적 차이
- 저장·patch 오류와 별개인 실질적 내용 결함의 존재
- 초안의 semantic completeness
- criterion 해결·재평가의 타당성

이 판단은 원본 ref·판단 대상 hash·criterion·이전 상태와 연결해 기록한다. cooperative 경로에서는 operator-attested로 명시한다. 다른 bytes나 meaningful: true 선언만으로 의미 있는 진척이 자동 입증됐다고 표현하지 않는다.

명시된 비진척 의도는 거부하되, caller가 이를 실질적 작업이라고 허위 분류하는 모든 경우를 자동 판별한다고 보장하지 않는다. trusted semantic mapping과 Orchestrator 판단의 출처·한계를 함께 보존한다.

매 Planner 호출마다 별도 사용자 승인이나 새 Reviewer를 요구하지 않는다. 기존 검토·통합 수정 절차를 사용하며 runtime이 그 기록의 구조·일관성·출처 한계를 검증한다.

## 저장·동시성·replay·복구

기존 lock·revision·fingerprint·durable save primitive를 재사용한다.

- allow와 연결된 reservation은 응답 전에 durable하게 저장한다.
- 동시 요청이 같은 수정 기회를 두 번 사용하지 못하게 한다.
- 동일 request ID의 다른 fingerprint는 충돌로 처리한다.
- 동일 요청 replay는 두 번째 dispatch 허용을 발급하지 않는다.
- lock 충돌·stale revision·저장 실패는 실행 allow를 반환하지 않는다.
- 실행 여부가 미확인이면 자동 재시도하거나 수정 기회를 임의 복구하지 않는다.
- 미실행 근거가 확인된 경우 같은 의도의 reconciliation을 할 수 있다.
- 저장 결과가 불명확하면 재조회하며 rollback이나 성공을 추정하지 않는다.
- restart 후 호출·criterion·reservation·미확인 결과를 복원한다.
- runtime·schema·policy 버전 불일치를 자동 갱신해 과거 permit을 재사용하지 않는다.

runtime ledger 저장 실패와 Orchestrator의 문서 저장 실패는 모두 Planner 재호출의 독립적인 근거가 아니다. 전자는 runtime 복구·상태 확인을, 후자는 Orchestrator의 문서 저장 복구를 요구한다. 별도의 실질적 작성 요청은 필요한 상태·증거가 유효할 때만 정상 판정한다.

기존 상태에 ledger가 없으면 진행 이력을 지우고 새 단계로 시작하지 않는다. 새 workflow의 명시적인 초기화와 기존 workflow의 이력 연결·호환 처리를 구분한다. 확인할 수 없는 기존 이력은 hold한다.

agent 교체나 새 workflow ID를 동일 단계의 호출 제한 우회로 사용하지 않는다. 새 workflow·범위로 전환할 정당한 근거와 이전 단계 연결을 기록한다. 일반 앱의 기록되지 않은 호출까지 탐지할 수 있다고 보장하지 않는다.

## native 연결과 설치 계약

native entry는 stdin의 event와 별개로 trusted provider/context를 공급받아야 한다. event·prompt·tool arguments가 state path, role, verifier 또는 verified capability를 스스로 지정하게 하지 않는다.

provider 연결은 다음을 충족해야 한다.

- 세션·대상 workflow·현재 actor/task의 신뢰 가능한 연결
- 실제 tool-use ID와 request·reservation의 correlation
- 전체 tool invocation의 보수적인 semantic mapping
- 승인된 역할·범위·문서·단계와 실제 요청의 일치
- 상태 저장 위치·revision·evidence에 대한 별도 공급
- 결과 provenance와 미확인 상태 보존

기존 context.describeTool, identity, evidence, statePath의 검증 경계를 약화하지 않는다. 로컬 등록값이나 caller-attested JSON만으로 native identity가 인증됐다고 표시하지 않는다.

설치는 실제 hook entry·runtime payload·설정·provider 연결을 함께 다룬다. 파일 복사나 matcher 등록만으로 enforcement가 설치됐다고 보고하지 않는다. provider가 없거나 설치 버전·실패 동작이 확인되지 않으면 해당 경로를 활성 enforcement로 표시하지 않는다. adapter에 도달한 검증 실패는 deny 응답으로 처리한다.

Codex callback의 시작 실패·timeout 등 adapter 밖의 실패를 ARC의 deny 반환으로 해결했다고 주장하지 않는다. Claude 실패 차단 조건은 실제 설치 버전에 맞춰 확인한다.

## 플랫폼 coverage와 한계

| 경로 | 가능한 native 제어 | ARC 역할 | 미지원·미검증 경계 |
|---|---|---|---|
| Codex local function spawn_agent → Agent matcher | synchronous PreToolUse deny | trusted 연결과 ledger 판정 적용 | 실제 host 중재 증거가 필요 |
| 일반 앱 collaboration.spawn_agent | 현재 ARC hook 통과 미입증 | 관찰된 자료가 있을 때 기록 대조 | 전체 사전 차단 주장 불가 |
| 일반 followup_task | 현재 capability matcher 없음 | ARC 준비 검증·attested 결과 대조 | 직접 호출의 사전 차단 미입증 |
| Claude Agent → PreToolUse | 실행 전 deny | provider·상태·실패 차단 계약 검증 | 설치·버전·실제 경로 확인 필요 |
| SubagentStart | 생성 전 차단 경로가 아님 | 관찰된 identity·correlation 대조 | 생성 방지로 표현하지 않음 |
| cooperative CLI | 실제 dispatch 제어 없음 | 준비·기록·상태 검증 | dispatcher·native provider가 아님 |
| hosted·specialized·기존 세션 입력 | 일반적인 차단 보장 없음 | 확보된 관찰 자료에 한한 탐지 | 관찰 부재 시 탐지도 미확인 |

Codex 공식 문서상 local function의 spawn_agent는 Agent로 매치된다. hosted tools는 같은 hook 경로가 아니며 specialized 경로도 완전한 중재 경계로 취급할 수 없다. callback error·timeout·malformed response는 차단 보장이 아니다. enterprise managed requirements/Agent Security의 설정 강제 가능성과 ARC가 일반 사용자 환경에서 행사하는 권한을 구분한다. [공식 OpenAI Hooks 문서](https://developers.openai.com/codex/hooks)

Claude의 PreToolUse는 호출 전 deny를 지원한다. command/http hook 실패 차단은 현재 문서상 onFailure: block과 v2.1.295 이상이 필요하다. SubagentStart는 생성 관찰 단계다. [Claude Hooks 문서](https://code.claude.com/docs/en/hooks)

claude --agent main thread의 Agent(worker, researcher)는 자식 종류 allowlist다. 횟수·상태 gate를 대체하지 않으며 일반 subagent 정의의 같은 표기를 동일한 종류 제한으로 해석하지 않는다. [Claude Subagents 문서](https://docs.anthropic.com/en/docs/claude-code/sub-agents)

coverage 보고는 최소한 문서상 지원, ARC 판정, 설치 연결, host 중재 관찰, 실제 거부 결과와 미검증 경로를 구분한다. 합성 fixture나 인증되지 않은 receipt로 verifiedDeny를 승격하지 않는다.

## 변경 표면·소유권·payload 의존성

모든 경로는 실행 대상 저장소 기준이다. Planner는 문서 초안만 작성한다. Orchestrator는 문서 통합·저장·검토·승인·준비·수락·Git 작업을 담당한다. 구현·설치·runtime·test 변경은 승인된 Implementer에게 배정한다.

| 영역 | 파일과 책임 |
|---|---|
| canonical 정책 | lib/policy/role-policy.json: 진행·전체 산출물·재호출 계약 |
| generated 프로필 | codex/agents/arc-planner.toml, claude/agents/arc-planner.md |
| planning 참조 | codex/skill/references/planning.md, claude/skill/references/planning.md |
| generated coordination | codex/skill/references/coordination.md, claude/skill/references/coordination.md: generator로만 관리 블록 변경 |
| 상태·판정 | lib/runtime/schema.mjs, cooperative-schema.mjs, evaluate.mjs, operations.mjs |
| 저장·초기화 | lib/runtime/store.mjs, bootstrap.mjs |
| cooperative 인터페이스 | lib/runtime/command.mjs, cli.mjs: 기록·준비 계약 유지 |
| native adapter·identity | lib/runtime/adapters/codex.mjs, adapters/claude.mjs, capabilities.mjs, identity.mjs |
| native entry | codex/skill/hooks/runtime-gate.mjs, claude/skill/hooks/runtime-gate.mjs |
| 설치 연결 | lib/installer/plan.mjs, global-config.mjs, lib/policy/claude-hook.mjs |
| probe | scripts/probe-runtime-hooks.mjs: decision receipt와 host 결과 구분 |
| 기존 T1 검사 | tests/test_arc_policy.py, tests/test_harness_contract.py, tests/test_claude_payload.py |
| runtime 행동 검사 | 아래의 기존 Node 테스트 파일 6개 |
| payload·무결성 | MANIFEST.sha256, 배포 runtime 자산과 bootstrap.mjs의 runtime module/hash 계약 |

기존 T1 canonical 변경의 생성 변경 집합은 Planner 프로필 2개, planning 참조 2개, coordination 참조 2개의 **6개**다. 이는 전체 POLICY_TARGETS 수나 새 runtime 변경 파일 수가 아니다. 관리 구간을 직접 편집하지 않고 기존 generator를 사용한다. coordination의 비관리 본문과 플랫폼 차이를 보존한다.

새 runtime source·설치 entry·배포 복사본·manifest·runtime hash는 함께 정합성을 유지해야 한다. 필요한 배포 자산과 호환성 처리를 후속 plan의 실제 inventory로 확정한다. 예상 밖 생성·배포 표면은 보고하고 승인 없이 추가하지 않는다.

## 기존 기준과 추가 runtime 수락 기준

기존 기준은 유지한다.

| ID | 기준 |
|---|---|
| C1 | 최초 작성과 수정 작업 모두에서 Planner는 Orchestrator에게만 허용된 짧은 상태 정보를 보고한다. Orchestrator가 사용자에게 진행을 안내할 때 초안 내용을 전달하거나 반복하지 않는다. Planner의 Orchestrator 대상 단계 산출물에는 전체 초안과 자체 점검 결과가 보존된다. |
| C2 | Planner 단독 저작, Orchestrator 통합·저장·검토·승인 요청, 기존 통합 수정 절차와 승인 순서, Planner 직접 승인 요청 금지가 유지된다. |
| C3 | Orchestrator가 사용자 승인 시점에 제시하는 대상은 통합·저장·검토된 해당 단계 Markdown 문서다. 사용자 진행 안내와 채팅 승인 요청에 문서 본문을 중복하지 않는다. |
| C4 | UI 구현과 비노출 보장은 제외된다. 전체 초안 응답이 앱·도구 화면에 표시될 수 있음을 명시하며, prompt 정책이 원시 subagent 응답이나 도구 출력을 억제하거나 숨긴다고 주장하지 않는다. |
| C5 | Codex와 Claude의 정책·프로필·planning·coordination 참조가 같은 동작 계약을 표현하고, 플랫폼 차이와 canonical 생성 관계를 보존한다. |

추가 runtime 기준은 다음과 같다.

| ID | 기준 |
|---|---|
| G1 | 최초 초안과 첫 통합 수정의 허용이 durable 상태전이로 검증된다. |
| G2 | 이후 호출은 구체적 미충족 criterion과 새 입력·근거 또는 실제 진척에 연결된다. |
| G3 | format-only·재표현만·저장 오류 복구만·patch 오류 복구만인 요청, 해결 criterion 반복·동일 근거 재사용·무진척 요청을 허용하지 않는다. 별도의 적격한 실질적 작업은 이전 저장·patch 실패만으로 거부하지 않는다. |
| G4 | semantic 판단과 기계 검증·provenance를 구분하고 caller claim을 verified fact로 승격하지 않는다. |
| G5 | concurrency·replay·restart·저장 실패·미확인 dispatch가 중복 실행 허용이나 이력 초기화를 만들지 않는다. |
| G6 | 고정 호출 cap이 없으며 불완전한 초안의 완료·승인을 허용하지 않는다. |
| G7 | 확인 가능한 native 경로에 상태 검증·deny를 연결하고 실제 연결·중재·거부 증거를 구분한다. |
| G8 | 일반 앱 spawn/followup과 기타 미중재 경로를 hard-block으로 주장하지 않는다. |
| G9 | runtime·installer·배포 payload·schema/version/hash·manifest의 정합성이 확인된다. |

기존 R1–R5의 검토 초점도 유지한다. 전체 초안 요약으로의 오해, Planner 직접 사용자 안내, 수정 본문의 진행 메시지 분할, 승인 본문 복제·상태 오표현, 비노출 보장·플랫폼 차이 제거를 검토한다.

## 행동 테스트 요구

다음은 확인된 기존 파일에 추가·확장할 검증 범위다. 이미 구현되거나 통과한 검사라고 표현하지 않는다.

| 파일 | 필수 행동 검증 |
|---|---|
| tests/node/runtime-assignment.test.mjs | initial allow, 첫 consolidated correction allow, evidence-backed further allow, format-only/re-expression-only/save-error-only/patch-error-only reject, resolved-repeat reject, missing/reused evidence reject, unresolved-without-progress reject, incomplete draft acceptance reject |
| tests/node/runtime-cooperative.test.mjs | operator attestation 보존, 단계·기준 연결, 비진척 요청의 permit·수정 기회 비소비, 미확인 dispatch, 버전 변경·기존 ledger 부재 처리, native provenance로의 승격 금지 |
| tests/node/runtime-store.test.mjs | 동시 reservation, request 충돌·replay·idempotence, restart 복원, lock·저장 실패와 불명확한 저장 결과 |
| tests/node/runtime-codex.test.mjs | trusted context의 상태 판정 연결, 비진척 의도의 deny 렌더링, provider 누락·stale evidence, 일반 followup·미중재 spawn 한계 |
| tests/node/runtime-claude.test.mjs | 같은 상태 판정, 실제 설치 조건·entry 연결의 합성 검사, failure-blocking 조건, SubagentStart 관찰 전용 |
| tests/node/runtime-capabilities.test.mjs | forged/stale/fixture/decision-only receipt 비승격, 지원 선언과 실제 차단 구분, unsupported 경로 비승격 |

비진척 작업에 대해서는 다음 상태전이를 구체적으로 확인한다.

1. **저장 오류만 있는 요청:** 초안 결과가 기록된 상태에서 저장 실패를 이유로 Planner 재호출을 요청하면 deny한다. dispatch reservation과 통합 수정 기회를 만들거나 소비하지 않으며 criterion을 진전·재개방하지 않는다.
2. **patch 오류만 있는 요청:** 동일 초안을 patch로 다시 내거나 patch 실패를 고쳐 달라는 호출을 deny한다. agent 교체나 출력 형식 변경으로도 허용하지 않는다.
3. **format/re-expression-only 요청:** initial/correction/further 어느 요청으로 표현해도 비진척 의도만 있으면 deny한다.
4. **독립적인 실질적 작업:** 저장 또는 patch 실패 이력이 있더라도 별도 open criterion과 필요한 입력·근거·진척이 갖춰진 실질적 요청은 정상 gate에서 allow할 수 있다. 같은 요청에서 실질적 근거를 제거하면 오류 기록만으로는 allow하지 않는다.
5. **저장 복구 후 상태:** Orchestrator가 같은 내용의 문서를 저장하거나 patch를 적용한 사실만으로 추가 Planner 호출 자격이 생기지 않는다. 감사 기록을 제외한 단계 진척·criterion·수정 기회는 그대로 유지한다.

고정 cap 부재는 여러 적격 후속 요청을 계속 허용하는 행동과 횟수 상한 분기가 없음을 확인한다. 테스트 반복 수를 제품 임계값으로 사용하지 않는다.

초안 completeness를 runtime이 의미적으로 자동 증명한다고 테스트하지 않는다. 불완전함이 기록됐거나 필수 산출물·검토 근거가 없을 때 완료를 거부하고, 의미적 검토 판단의 출처를 보존하는 행동을 검증한다.

합성 adapter·installer 검사는 native live enforcement 증거와 구분한다. 실제 enforcement를 확인했다고 보고하는 경로에는 해당 설치·버전·세션·attempt에서 요청 허용과 거부 요청의 실제 미실행 근거가 필요하다. 확보하지 못한 coverage는 미검증으로 남기며 필수 native 연결 항목을 임의로 완료 처리하지 않는다.

## 기존 T1 baseline disposition과 검증 흐름

기존 baseline disposition은 변경하지 않는다.

- T1 소유 두 Role gate: parser만 현재 bold label 인식을 위해 최소 수정한다.
- 기존 assertion을 삭제·약화하거나 skip·expected failure로 전환하지 않는다.
- T1 신규 검사, 정책 생성·manifest와 policy 전체 모듈은 통과해야 한다.
- harness·Claude 전체 모듈은 기존 실패 ID multiset과 원인을 비교한다. 신규·증가·같은 ID 아래 원인 변화·T1 관련 회귀가 없어야 한다.
- 상속된 실패는 실제 실패로 계속 보고하고 broad baseline 수리로 확장하지 않는다.

baseline 증거는 완료된 Implementer policy 보고, /private/tmp/arc-planner-baseline-4q0_qbcn.log, /private/tmp/arc-planner-baseline-mte2400h.log다. 이를 새로운 runtime 검사 실패를 허용하는 근거로 확대하지 않는다.

신규 runtime 행동 검사와 영향받는 기존 runtime·설치 검사는 별도로 검증한다. 새로운 실패를 상속 실패로 분류하려면 실제 수정 전 근거가 필요하다.

Significant 위험에 따라 Implementer 검증 후 fresh QA와 필요한 실패 재검증을 수행한다. 모든 계획 작업의 수락과 필수 QA가 완료된 뒤 독립 Reviewer가 최종 전체 변경을 검토한다. Reviewer를 작업별 필수 gate로 추가하지 않는다. 최종 plan 단계의 Reviewer finding은 기존 Implementer → Reviewer 재확인 규칙을 따른다.

Orchestrator가 기준·검사·finding을 확인해 수락한다. passing test나 specialist 보고가 수락을 대신하지 않는다.

## 제외 범위·보류 조건·승인 순서

다음은 제외한다.

- 데스크톱 UI·streaming·rendering·초안 숨김 구현
- 일반 앱 모든 호출의 하드 차단 또는 우회 불가능성 보장
- semantic progress·completeness의 완전한 자동 증명
- 사용자가 요청하지 않은 호출 cap·timeout·진척량 임계값
- broad baseline 수리와 무관한 정책·프로필 변경
- 원본 checkout 변경과 사용자 변경의 폐기
- 별도 승인 없는 외부 배포·메시지·push·merge

대상·소유권·승인 버전 불일치, 필수 증거 부재, ledger·schema·runtime 불일치, 미확인 dispatch, trusted provider 부재, 필수 native 연결 미검증, 저장 실패, 필수 검사 실패와 예상 밖 생성·payload 표면은 관련 작업·주장·수락을 보류한다. 무관한 독립 작업은 Orchestrator가 권한·입력·소유권을 확인해 별도로 판단한다.

순서는 **승인된 Architectural 설계 → 이번 written-spec 개별 승인 → fresh plan 작성·개별 승인 → 전체 문서 집합·기존 planning commit 갱신·Git 및 handoff 재검증 → Implementer 재개**다.

문서 승인과 이력 갱신은 실제 시각·전후 본문·hash·SHA 대응을 보존한다. 기존 승인으로 새 범위를 소급 승인하지 않는다. spec 저장만으로 plan 작성이나 구현을 승인하지 않는다.

## 근거와 증거 수준

플랫폼 사실은 위 공식 문서와 ARC의 다음 소스를 근거로 한다.

- lib/runtime/capabilities.mjs: 지원 선언·receipt·verified deny 한계
- lib/runtime/adapters/codex.mjs, adapters/claude.mjs: trusted context·durable transaction·native 응답
- lib/runtime/schema.mjs, operations.mjs, identity.mjs, evaluate.mjs: 역할·요청·증거·assignment 검증
- lib/runtime/store.mjs: lock·fingerprint·revision·replay·durable save
- lib/runtime/cooperative-schema.mjs, command.mjs, cli.mjs, bootstrap.mjs: cooperative 계약과 runtime hash
- lib/installer/plan.mjs, global-config.mjs, lib/policy/claude-hook.mjs: 현재 설치 연결
- 두 skill/hooks/runtime-gate.mjs: provider 주입 경계
- 지정 Node 테스트 6개와 scripts/probe-runtime-hooks.mjs: 현재 검사·probe의 범위
- ARC brainstorming.md, planning.md: 설계·저작·승인·문서 준비와 개정 경계

소스 존재는 실행·설치·배포 검증이 아니다. 현재 상태와 과거 승인·baseline 결과는 Orchestrator가 제공한 증거를 사용하며, 이 명세 작성 중 검사나 native probe를 실행하지 않았다.

**전체 개정 명세 초안 끝**

자체 점검: format conversion·재표현·저장 오류·patch 오류만 있는 작업을 Orchestrator의 비진척 작업으로 명시하고 모든 호출 단계에서 거부하도록 반영했습니다. 거부 시 수정 기회·dispatch permit을 소비하지 않는 전이와, 독립적인 실질적 criterion은 이전 오류만으로 차단하지 않는 양방향 행동 검증을 추가했습니다.

그 외 C1–C5, 승인 이력, Architectural·Significant 분류, 플랫폼 한계, baseline disposition과 소유권을 유지했습니다. 기계 검증·semantic attestation, adapter 응답·실제 native enforcement, 미중재 경로를 구분했습니다. 새로운 임계값이나 전체 차단 보장을 도입하지 않았습니다.

파일 저장·편집·검사·plan 작성·Git 변경은 하지 않았습니다. 이번 written-spec의 개별 승인 전 plan 작성은 보류합니다.

