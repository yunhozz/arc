# Planner hook 입력과 검증 근거

조사일: 2026-10-26. 대상: 승인된 Planner gate T3 구현.

설치되는 hook은 `PreToolUse`·`PostToolUse`의 `Agent` matcher와 `SubagentStart`를 **관찰만** 한다. `runHook({observationOnly:true})` 또는 `--observe-only`는 raw event의 hash와 workflow 후보를 기록한다. workflow의 호출 기회·pending·identity·완료 상태는 바꾸지 않는다. provider가 없는 설치 경로에 active deny gate를 등록하지 않는다.

## 입력 공급과 검증

| 입력 | 실제 공급 위치 | 구현 검증 | 남은 한계 |
|---|---|---|---|
| `hook_event_name` | platform hook stdin | 지원 event 이름을 제한 | stdin JSON만으로 host 진위를 인증하지 않음 |
| `session_id` | platform hook stdin | 비어 있지 않은 문자열; trusted adapter에서는 `context.sessionRef`와 일치 | session→workflow의 인증된 등록 provider 없음 |
| `tool_use_id` | `PreToolUse`·`PostToolUse` stdin | 비어 있지 않은 값; adapter에서는 `context.toolUseId`와 일치 | `SubagentStart`에는 문서화된 tool-use correlation이 없음 |
| `tool_name`, `tool_input` | tool hook stdin | 지원 tool과 JSON shape; trusted `describeTool`로 전체 호출 해석 | 역할·실질적 진척은 tool 이름이나 prompt만으로 인증 불가 |
| `cwd` | platform hook stdin | observer가 shell 없이 Git root/common-dir를 재관찰하고 checkout 안인지 확인 | 실제 target 확인은 actor·approval 인증을 대신하지 않음 |
| `agent_id`, `agent_type` | `SubagentStart` stdin | agent ID 기록; type은 `claimedAgentType`으로만 기록 | 이름·동일 session·유일 pending으로 역할이나 assignment를 추정하지 않음 |
| `context.sessionRef`, `actorRef`, `taskId` | 별도의 trusted host dependency | 기존 identity·active lease·assignment·user-approval provenance 확인 | installed `main(input)`은 이 dependency를 공급하지 않음 |
| `context.requestId`, `toolUseId` | trusted host dependency | invocation correlation·fingerprint·replay 검사 | raw `tool_input`이나 event의 `context` 객체는 공급원으로 쓰지 않음 |
| `context.statePath`, `state` | trusted host dependency | durable store lock·revision·workflow/target 및 stage 계약 검사 | 설치 observer는 workflow 후보만 열거하며 하나를 임의 선택하지 않음 |
| `context.policy`, `evidence` | trusted host dependency | policy/runtime/adapter version·hash 및 검증된 provenance 검사 | production provider 없음; caller JSON을 native evidence로 승격하지 않음 |
| `context.describeTool` | trusted function | semantic operation·paths·descriptor, Planner stage/request 연결 요구 | stdin으로 함수를 구성하지 않음; 누락 시 adapter는 명시적 deny 응답 생성 |
| Planner stage·criterion·review | durable `plannerLedger`와 trusted evidence | 승인 stage/버전, 전체 review, concrete open criterion, 결과·pending 연결 | 의미적 완전성과 새 입력의 의미는 hash에 결합된 operator attestation |
| artifact bytes/hash | trusted local reader 또는 provider의 검증 bundle | T2는 실제 파일 재읽기; native 판정기는 검증 bundle의 stage/ref/hash 연결 확인 | native provider 연결 자체는 미구현; native 테스트 bundle은 합성 fixture |
| assignment/start/result correlation | `context.observeAgent`·기존 pending assignment | 검증된 eventRef·assignmentId·correlationRef·승인 범위가 모두 맞을 때만 identity 결합 | raw start/result는 `unmatched` 또는 `uncorrelated`; 예약을 해제하지 않음 |
| `context.failureBlocking` | Claude trusted host dependency | verified installed version·verificationRef·`onFailure: block` 확인 | 로컬 Claude CLI가 없어 실제 failure blocking 검증 없음 |

provider 필드 누락 목록은 `plannerHookContextStatus`가 생성한다. adapter의 정상적인 `main(input, context)` 경로는 T2 판정과 native assignment 예약을 같은 transaction에 저장한다. 이 함수 경로의 테스트 통과는 설치 host가 실제로 호출을 중단했다는 증거가 아니다.

## 플랫폼 범위

Codex 공식 문서는 local function tool `spawn_agent`가 `Agent` matcher에 매칭되고 `PreToolUse` deny를 지원한다고 명시한다. hosted tool은 이 경로 밖이며 일부 specialized path도 hook을 건너뛸 수 있다. hook 오류·timeout·잘못된 응답은 호출이 진행되는 경우가 있어 완전한 enforcement boundary로 취급하지 않는다. 앱의 `collaboration.spawn_agent`와 `followup_task`가 이 설치 hook을 통과한다는 실제 근거는 없으며 **unknown**이다. 관찰 기록 부재를 준수나 차단으로 해석하지 않는다. [Codex Hooks](https://learn.chatgpt.com/docs/hooks)

Claude `Agent`의 `PreToolUse`는 실행 전 deny를 지원한다. `SubagentStart`는 생성·재개 뒤 관찰이며 생성을 막을 수 없다. `onFailure: block` 지원은 Claude Code 2.1.295 이상이 필요하고 설치 version에 대한 verified support를 별도로 요구한다. 설치 observer는 `onFailure: continue`로 유지한다. [Claude Hooks reference](https://code.claude.com/docs/en/hooks)

Orchestrator가 확인한 로컬 환경은 Codex CLI `0.157.0`이며 `claude` 실행 파일은 없다. 현재 조사와 검증에서 **동일 platform version·session·attempt의 실제 호출 미실행을 입증한 live deny 결과는 없다**. hook trust review, callback 실행 여부와 실제 host 적용은 미검증이다.

## 증거 해석

- adapter 테스트: trusted fixture에서 initial·correction·further 판정, 비진척 거부, durable 예약과 관찰 동작을 확인한다.
- 설치·payload 검사: managed hook 설정과 배포 bytes, user 설정 보존 및 해제를 확인한다.
- 관찰 audit: event hash·session·agent/tool-use ref·stage 후보·분류 이유를 기록한다. identity가 확인되지 않으면 계속 미검증이다. 안정적인 event identity가 없는 start는 content hash로만 중복을 구분하므로 내용이 같은 재개 event는 구별하지 못한다.
- 위 결과와 unauthenticated `source: native` receipt는 host가 deny를 실제 적용했다는 증거가 아니다.
