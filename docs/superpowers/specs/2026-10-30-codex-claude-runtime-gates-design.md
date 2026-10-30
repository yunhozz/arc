# Codex·Claude Code 네이티브 런타임 통제 설계

상태: 사용자 승인됨. Codex 훅은 자동 등록하되 호출자 식별 한계가 해결될 때까지 진단 전용이며 ARC 차단을 제공하지 않는다.

작업 대상: `/Users/ma-24-007/Desktop/workspace/arc`<br>
브랜치: `feat/codex-claude-runtime-gates`<br>
기준 HEAD: `8c88952e9c0178fdb07ad521a51b6620e08503ea`

## 1. 목적

ARC 설치기가 Codex와 Claude Code 네이티브 훅을 자동으로 등록·검증하고, 갱신·제거 때 ARC 소유 항목을 정리한다. 검증된 호출자·workflow binding이 있는 Claude 경로는 기존 정책 판정에 연결한다. Codex는 호출자 식별 근거가 부족하므로 등록·callback 진단에 한정하며 도구 호출을 ARC가 관리·차단하지 않는다. 사용자가 설정을 직접 편집하거나 hook entry point를 수동 연결하지 않는다.

플랫폼 자체의 trust 절차는 유지한다. 설치기가 설정을 등록했다는 사실과 활성 호스트가 해당 정의를 신뢰하고 실행했다는 사실은 별개다. ARC는 trust를 우회하거나 일반 로컬 설치를 managed 설정으로 위장하지 않는다.

통제 수준은 플랫폼별·도구 경로별로 표시한다. 네이티브 훅이 다루지 않는 경로까지 전체 실행을 통제한다고 주장하지 않는다.

## 2. 승인 범위와 역사적 결정

사용자가 승인한 범위는 다음과 같다.

- Codex와 Claude Code 네이티브 훅 연결.
- 설치기의 자동 등록, 기록 후 검증, 갱신·제거 정리.
- 다른 사용자 훅 보존과 식별 가능한 ARC 소유 항목만 관리.
- Codex 네이티브 훅의 자동 등록과 상태 진단. 현재 호출자 식별 한계가 해결될 때까지 Codex 도구 호출의 ARC 관리·차단 보장은 보류한다.
- 검증된 ARC workflow binding이 없는 전역 훅 이벤트는 거부.
- 저장소 구현 중 현재 사용자의 실제 플랫폼 설정을 수정하지 않음.

이 승인은 [이전 훅 소스 제거 설계](2026-10-26-arc-hook-source-removal-design.md)의 관련 결정을 이번 범위에서 대체한다. 과거 문서는 당시 결정 기록으로 보존하며 다시 쓰지 않는다.

다음은 이번 범위에 포함하지 않는다.

- OS 수준 격리나 모든 파일·프로세스·네트워크 접근의 강제 통제.
- 플랫폼 trust 상태 변경·우회.
- Codex·Claude Code의 자동 업그레이드.
- 식별되지 않은 기존 훅의 삭제.
- hosted tools 등 훅을 통과하지 않는 경로의 통제 보장.
- 기존 역할·승인·Git·QA·Reviewer 계약의 완화.

## 3. 접근 방식

검토한 방식은 협력형 CLI 강화, 네이티브 훅 연결, 별도 격리 실행 환경이다. 사용자는 네이티브 훅과 설치기 자동 관리를 선택했다.

협력형 CLI와 기존 공통 판정을 유지한다. Claude native hook은 검증된 context를 통해 공통 판정으로 연결한다. Codex native hook은 현재 caller 식별 한계 때문에 공통 gate를 실행하지 않고 상태 진단에만 사용한다. 격리 실행 환경은 이번 범위에 포함하지 않는다.

기존 구조에서는 `plan.mjs`의 `globalChanges`, `runtime-config.mjs`의 설정 보존 방식, transaction의 snapshots/rollback, `runtime-assets.mjs`의 생성물·해시를 활용한다. `uninstall.mjs`에는 네이티브 설정 정리를 추가한다. manifests/package와 훅 부재를 검증하는 기존 테스트·문서는 새 배포 구조와 일치하도록 변경한다.

## 4. 플랫폼별 계약

### Codex

대상 설정은 `CODEX_HOME/config.toml`이다. 실제 hook 정의 위치와 활성화에 필요한 설정은 지원하는 Codex 버전의 공식 schema를 따른다.

대부분의 로컬 function tool은 훅 대상이며 `spawn_agent`는 `Agent`와 매칭된다. hosted tools는 로컬 훅 경로를 사용하지 않고, specialized paths는 제외될 수 있다. `write_stdin`은 `PreToolUse`를 다시 실행하지 않는다. [Codex Hooks](https://developers.openai.com/codex/hooks)

Codex `PreToolUse` event는 자식 호출에서 부모 `session_id`를 사용하고 `agent_id`를 제공하지 않는다. 부모와 자식 tool call을 신뢰할 수 있게 구분하는 별도 공식 호출자 근거가 현재 확인되지 않았다. 따라서 이번 구현에서는 ARC가 Codex 도구 호출을 허용·거부하지 않는다. ARC 훅은 자동 등록하고 callback/설치 상태를 진단할 수 있지만, 이를 ARC 관리 호출·정책 적용·차단 증거로 표시하지 않는다. Codex hook trust와 등록 상태는 그대로 분리해 보고한다. [Codex Hooks](https://developers.openai.com/codex/hooks)

자식 훅의 `session_id`는 부모 세션 ID이며, 문서의 `PreToolUse` 필드에는 자식 `agent_id`가 없다. `SubagentStart`는 `agent_id`를 제공하지만 시작을 중단하지 못한다. 따라서 안정적이고 신뢰 가능한 연결 식별자가 별도로 검증되기 전에는 **각 자식 도구 호출에 역할별 정책을 강제하는 기능을 제공했다고 표시하지 않는다.** transcript 경로·시간적 인접성·프롬프트 역할 문자열로 자식을 추정하지 않는다. [Codex Hooks](https://developers.openai.com/codex/hooks)

일반 사용자 설정의 non-managed hook은 정확한 정의에 대한 `/hooks` 검토·신뢰가 필요하다. 신규·변경 정의는 신뢰되기 전까지 실행되지 않는다. 시스템·MDM·cloud·`requirements.toml`의 managed trust는 일반 로컬 ARC 설치기의 권한 밖이다. [Codex Hooks](https://developers.openai.com/codex/hooks)

### Claude Code

대상 설정은 `~/.claude/settings.json`이다. `PreToolUse`는 `Agent`를 포함한 거의 모든 도구 이름에 적용되지만 `EndConversation`은 제외되며, `@` 파일 언급은 `Read` 훅을 우회한다. [Claude Code Hooks](https://code.claude.com/docs/en/hooks)

자식에서 발생한 훅에는 `agent_id`·`agent_type`이 제공된다. ARC는 이를 승인된 할당과 연결하여 역할 판정에 사용할 수 있다. 실제 callback의 필드 전달과 연결을 검증해야 하며, `agent_type` 자체를 권한으로 인정하지 않는다. `SubagentStart`는 관찰에 사용하며 spawn을 막는 이벤트로 취급하지 않는다. [Claude Code Hooks](https://code.claude.com/docs/en/hooks)

command/http 훅의 실패 차단에는 `onFailure: "block"`과 Claude Code `>=2.1.295`가 필요하다. 지원 버전에서는 ARC 관리 훅에 이 옵션을 등록한다. 그보다 오래된 지원 버전에서는 정상적인 실행 전 거부와 hook failure 처리 능력을 구분한다. 지원하지 않는 옵션을 기록하지 않으며, 실패 처리를 `degraded`로 보고한다. fail-closed라고 표시하거나 CLI를 업그레이드하지 않는다. [Claude Code Hooks](https://code.claude.com/docs/en/hooks)

interactive session은 workspace trust가 수락될 때까지 사용자 전역 설정을 포함한 settings hook을 보류한다. 설치기는 이를 우회하지 않는다. [Claude Code Hooks](https://code.claude.com/docs/en/hooks)

### 확인된 현재 CLI 상태

Orchestrator가 로그인 셸에서 실제 선택되는 `claude`를 확인한 결과는 Claude Code `2.1.314`이며, 이는 `onFailure: "block"`이 지원되는 기준인 `2.1.295` 이상이다. 별도의 고정 경로 `/Users/ma-24-007/.local/bin/claude`는 `2.1.266`으로 오래됐다. 따라서 설치기와 진단은 사용자가 실제로 실행하는 CLI 경로를 확인하고 경로·버전을 함께 기록해야 하며, 임의의 고정 경로 버전을 현재 활성 버전으로 간주해서는 안 된다. 이 로컬 버전 확인은 훅 callback이나 차단 적용의 증거가 아니다.

지원하지 않는 구버전은 업그레이드하지 않는다. `<2.1.295`에서는 `onFailure: "block"`에 의한 실패 차단을 주장하지 않고, 정상 정책 거부와 hook failure 처리를 따로 보고한다.

## 5. 정책·역할·capability

공통 흐름은 다음과 같다.

`호스트 입력 → 플랫폼 정규화 → 신뢰 문맥 확인 → 공통 gate → 플랫폼 응답 → 결과·관찰 연결`

기계 판독 정책을 역할 규칙, gate 판정, capability 진단의 공통 근거로 사용한다. 플랫폼 adapter는 정책을 별도로 복제하지 않는다.

판정 능력을 세 범위로 나눈다.

| 범위 | 필요한 근거 |
|---|---|
| 전역 정책 | 훅을 통과한 도구 호출과 해당 정책 입력 |
| 할당·spawn 정책 | 승인된 할당, 생성 요청 조건, 실제 결과 연결 |
| 역할별 정책 | 신뢰 가능한 호출자 식별과 승인된 역할 연결 |

Codex에서 역할별 연결이 불가능하다고 전역·spawn 판정까지 미지원으로 취급하지 않는다. 반대로 전역·spawn 판정 통과를 역할별 강제의 증거로 확대하지 않는다.

Claude에서 예상한 자식 식별자가 없으면 역할을 확인했다고 처리하지 않는다. 역할 식별이 필요한 판정은 충분한 근거가 없다는 결과를 반환한다. 식별자 누락을 자동으로 Orchestrator 권한으로 바꾸지 않는다.

Claude처럼 hook 호출자와 workflow를 검증할 수 있는 native gate 경로에서는 검증된 session → workflow → actor/task/active lease 연결을 찾지 못한 호출을 플랫폼의 유효한 deny 응답으로 거부한다. ARC 외부 세션과 binding 준비 전 호출도 이에 포함한다. 연결 부재를 관찰 전용 또는 허용으로 낮추지 않고, Orchestrator 권한으로 대체하지 않는다. Codex의 현재 식별 한계는 이 규칙을 적용하는 gate 경로 자체를 진단 전용으로 보류한다.

Codex 자식 호출에서 부모 session ID만으로 actor·task·lease를 추정하지 않는다. 새 공식 호출자 식별 근거와 이를 실제로 제공하는 호스트 증거가 확보될 때까지 Codex `PreToolUse` 응답은 ARC 정책 차단을 수행하지 않는다. 이 동작은 호출 차단을 의미하지 않으므로 ARC가 Codex 호출을 관리한다고 표시하지 않는다.

진단을 위해 이벤트를 기록할 때는 필요한 최소 운영 메타데이터만 저장한다. raw `tool_input`, prompt/transcript 내용, 환경 변수를 durable 진단 기록에 저장하지 않는다.

검증된 workflow/caller binding을 제공하는 플랫폼 경로에서는 binding이 없는 전역 `PreToolUse` 호출을 플랫폼의 유효한 deny 응답으로 거부한다. 이 규칙은 현재 Claude 경로에 적용한다. 훅을 통과하지 않는 경로나 호출자를 구분할 수 없어 ARC gate가 비활성인 Codex 경로까지 차단된다고 표시하지 않는다.

호스트가 지원하는 도구 노출 제한은 병행할 수 있다. 설정으로 실제 제한할 수 없는 capability를 프롬프트 생성만으로 강제했다고 표시하지 않는다. 제공된 capability 근거에서 Codex `followup_task`는 미지원 상태를 유지한다.

기존 정책·런타임 해시와 맞지 않는 workflow·승인 기록은 자동 초기화하거나 재승인하지 않는다. 기존 버전 확인과 보류 계약을 유지한다.

## 6. 실행 상태와 증거

다음 기록은 구분한다.

- 승인된 할당과 `pending intent`.
- 실행 전 판정과 사유.
- 실제 spawn 응답·식별자.
- 시작·종료 관찰.
- 누락·중복·실패.
- 호스트·버전·도구 경로와 정책·런타임 해시.

`pending intent`는 실제 spawn 증거가 아니다. 시작 이벤트는 실행 전 차단 증거가 아니다. 실제 결과를 얻지 못한 요청은 성공으로 보충하지 않는다.

관련 기록에는 상관관계를 확인할 수 있는 판정 식별자를 사용한다. 식별자는 증거 연결 수단이며, 그 존재만으로 호출자 권한을 부여하지 않는다. 중복 이벤트와 동시 요청을 처리하고, 판정과 실행 사이의 상태 변경을 검사한다.

Codex의 부모 세션 ID만으로 자식 호출을 연결하지 않는다. 후속 native 이벤트에 연결 식별자가 없으면 해당 관계를 미확인으로 남긴다.

지속 셸 세션에서는 최초 프로세스 허용이 이후 입력까지 검증했다는 뜻이 아니다. Codex `write_stdin` 한계는 capability와 진단에 명시한다.

## 7. 자동 설치·갱신·제거

### 등록

설치기는 다음 순서를 따른다.

1. 플랫폼 대상·실제 실행 CLI 경로와 버전·설정·ARC 소유 기록을 확인한다.
2. 설치 계획에 네이티브 설정 변경을 포함한다.
3. 새 runtime과 hook entry point를 준비한다.
4. 연결부 입력·출력과 지원 schema를 검사한다.
5. 다른 훅을 보존하며 ARC 항목을 등록한다.
6. 기록한 설정을 다시 읽어 내용과 실행 경로를 검증한다.
7. 등록·연결부·호스트 증거 상태를 별도로 보고한다.

기존 transaction의 snapshots/rollback을 사용한다. 적용 전 대상이 계획 시점과 달라졌다면 오래된 계획으로 덮어쓰지 않는다.

다른 훅의 정의와 순서를 보존한다. 같은 이벤트에 다른 훅이 존재한다는 이유로 대체하거나 삭제하지 않는다. 경로에 공백이나 특수 문자가 있어도 플랫폼이 요구하는 방식으로 안전하게 호출돼야 한다.

### 소유권

ARC 소유권은 설치 기록과 실제 관리 항목의 일치로 확인한다. 경로·명령 이름의 일부가 ARC처럼 보인다는 이유만으로 소유권을 인정하지 않는다.

관리 항목이 사용자가 변경한 상태라면 충돌로 보고한다. 소유권과 변경 상태를 확인하지 못한 항목을 자동 정리하지 않는다.

### 갱신

새 자산을 준비한 뒤 참조를 전환하고 등록 결과를 검증한다. 이후 참조되지 않는 이전 ARC 자산을 정리한다.

Codex의 exact-definition trust 요구 때문에 변경된 정의는 다시 신뢰가 필요할 수 있다. 이전 실행 증거를 새 정의의 trust·호스트 적용 증거로 재사용하지 않는다. 변경이 없는 정의를 불필요하게 재작성하지 않는다.

### 제거

네이티브 설정에서 식별 가능한 ARC 항목을 제거하고 재읽기로 확인한 뒤, 참조되지 않는 자산을 제거한다. 다른 훅이 같은 이벤트에 남아 있으면 그대로 유지한다.

설정 정리에 실패했거나 참조 제거가 확인되지 않으면 필요한 실행 자산을 먼저 지워 stale reference를 만들지 않는다. 완료·미완료 범위를 보고한다.

### `skipGlobal`

`skipGlobal`에서는 전역 플랫폼 설정의 등록·갱신·정리를 수행하지 않는다. 이를 성공적인 네이티브 등록으로 표시하지 않는다.

기존 설치 기록상 전역 훅이 참조할 수 있는 ARC 자산은 참조 제거를 확인하지 못한 상태에서 삭제하지 않는다. 정리가 보류된 이유와 남은 자산을 보고한다. `skipGlobal`을 전역 설정 변경의 우회 경로로 사용하지 않는다.

## 8. trust와 진단

진단은 다음 상태를 독립적으로 나타낸다. 구체적인 필드명은 기존 진단 schema와 맞추되 의미를 합치지 않는다.

| 상태 | 입증하는 사실 |
|---|---|
| 등록 확인 | 설정 재읽기로 ARC 정의 확인 |
| 연결부 확인 | entry point와 응답 검사 통과 |
| trust 확인 | 현재 정의·workspace에 대한 호스트 근거 확보 |
| 호스트 호출 확인 | 현재 정의의 실제 callback 수신 |
| 거부 적용 확인 | 특정 경로의 실행 전 거부와 부작용 부재 |
| 역할 연결 확인 | 실제 호출자와 승인된 역할 연결 |
| 관찰 확인 | 생명주기 이벤트 수신 |
| 실패 처리 수준 | 지원·성능 저하·미확인 등의 실제 수준 |

호스트가 trust 상태를 제공하지 않으면 ARC는 이를 미확인으로 남긴다. callback이 없다는 이유만으로 원인을 trust 거부로 단정하지 않는다.

Codex callback이 관찰되더라도 그것만으로 호출자를 검증하거나 ARC gate가 호출을 관리한다고 볼 수 없다. Codex `PreToolUse`의 enforceability는 호출자 식별 계약과 실제 호스트 증거가 충족되기 전까지 `unsupported`로 진단한다.

설치 결과에는 자동 등록 완료 여부와 함께, 플랫폼 자체 trust 또는 실제 callback 증거가 아직 없는 상태를 설명한다. 수동 설정 편집·연결을 요구하지 않는다. Codex `/hooks` 검토와 Claude workspace trust는 플랫폼 자체 절차로 명시한다.

## 9. 실패 처리와 보존

설치 계획의 문제는 쓰기 전에 탐지한다. 기록 후 검증 실패는 기존 transaction 경계에서 복구한다.

복구 중 외부 변경이 발견되면 오래된 전체 설정으로 덮어쓰지 않는다. 복구 가능한 ARC 변경과 보류된 변경을 구분하여 보고한다. 부분 적용을 전체 성공으로 표시하지 않는다.

runtime에서는 손상된 입력·정책 버전 불일치·필요한 상태 접근 실패를 내부 허용으로 바꾸지 않는다. 다만 host가 오류를 어떻게 처리하는지는 별개의 보장이다.

- Codex에서는 유효한 deny가 적용되는 경로와 hook failure를 구분한다.
- Claude 지원 버전에서는 `onFailure: "block"` 적용을 검사한다.
- 구버전 Claude에서는 정상 판정과 실패 차단 부재를 구분한다.
- 훅을 통과하지 않는 경로에는 hook failure 정책이 적용된다고 주장하지 않는다.

## 10. 수용 기준

| ID | 수용 기준 |
|---|---|
| AC-01 | 대상 플랫폼의 설치·재설치·갱신·제거가 수동 연결 없이 ARC 항목을 관리한다. |
| AC-02 | 다른 사용자 훅과 순서가 보존되고, 소유권이 불명확한 항목은 삭제하지 않는다. |
| AC-03 | 기록 후 재읽기로 등록을 검증하며 등록을 trust·호스트 호출로 표현하지 않는다. |
| AC-04 | Codex exact-definition trust와 Claude workspace trust를 우회하지 않는다. |
| AC-05 | `skipGlobal`, 충돌, 부분 적용·복구, 미정리 참조가 명확히 처리된다. |
| AC-06 | Codex 훅의 등록·callback·trust 상태와 실제 적용 제외를 검증해 표시하되, caller 식별이 불가한 현재 경로를 ARC 관리·차단으로 표시하지 않는다. |
| AC-07 | 현재 감지된 Claude Code `2.1.314`의 실패 차단과 `<2.1.295`의 성능 저하를 구분한다. |
| AC-08 | Claude spawn 판정·실제 결과·시작 관찰을 별도로 검증하고, Codex SubagentStart는 관찰 전용으로 표시한다. |
| AC-09 | Claude 자식 역할 연결을 실제 callback으로 검증한다. Codex는 연결 근거 없이 역할별 강제를 주장하지 않는다. |
| AC-10 | 정책·runtime·생성물·설치 manifest·문서가 같은 기능과 한계를 설명한다. |
| AC-11 | source 구현·검증 중 현재 사용자의 실제 설정을 변경하지 않는다. |
| AC-12 | 요구 QA와 재검증, 최종 전체 Reviewer 검토를 마치고 Orchestrator가 수용한다. |
| AC-13 | 검증된 호출자·ARC workflow context를 지원하는 gate 경로(현재 Claude)에 연결이 없는 전역 훅 호출은 deny하며, 이를 관찰 전용·허용 또는 Orchestrator 권한으로 처리하지 않는다. |
| AC-14 | Codex는 자동 등록하되, 부모 session ID만으로 호출자를 구분할 수 없는 동안은 PreToolUse 경로의 ARC allow/deny와 관리 보장을 보류하고 미지원으로 표시한다. |

Codex 호출자 식별은 명시적인 구현 게이트다. 신뢰할 수 있는 호출자 연결 수단이 확인되지 않으면 Codex `PreToolUse` 경로는 진단 전용으로 남긴다. Codex hook 설치·callback을 Codex 실행 통제의 증거로 승격하지 않는다.

## 11. 검증과 증거

설정 fixture 검증에는 기존 훅, 재설치, 변경된 ARC 항목, 구형 항목, 충돌, 공백 포함 경로, `skipGlobal`, 제거·복구를 포함한다. 실제 사용자 설정을 fixture로 변경하지 않는다.

연결부 검증에는 정상 입력, 손상된 입력, 정책 불일치, 유효한 응답 schema, 상태 접근 실패, 중복·동시 이벤트를 포함한다.

실제 호스트 검증은 공식 지원 방식의 격리된 테스트 설정에서 수행한다. 현재 사용자 설정을 임의로 변경하지 않는다. 격리 방법이나 실제 호스트 증거를 확보할 수 없으면 해당 검증은 보류하며 synthetic 결과로 대체하지 않는다.

필수 호스트 증거는 다음과 같다.

- Codex 등록, 정의 trust 전후, callback과 실제 hook failure 한계. caller 식별이 불가능한 동안 ARC 정책 허용·거부나 Codex 도구 차단을 주장하지 않는다.
- Claude workspace trust 전후, 자식 식별자, 정상 거부, 구버전 성능 저하.
- Claude `>=2.1.295`에서 시작·timeout·schema 실패의 차단.
- spawn 승인·거부·실패와 실제 결과 연결.
- Codex hosted/specialized/`write_stdin`, Claude `@` 언급 등 적용 제외.
- 제거 후 ARC 항목 부재와 다른 훅 보존.

기존 협력형 API, 승인·버전 확인, 생성된 플랫폼 자산·해시와 분배물 검증도 수행한다. 실패한 필수 검증이 해결되지 않은 범위는 수용하지 않는다.

## 12. 승인·구현 순서

사용자는 이 Architectural 명세의 네이티브 훅 방향과 자동 설치 범위를 승인했다. 후속 결정으로 검증된 ARC binding이 없는, 호출자 식별이 가능한 플랫폼 경로(현재 Claude)의 전역 호출은 deny한다. Codex는 hook을 자동 등록하되 호출자 식별 한계가 해결될 때까지 진단 전용이며 ARC 관리·차단 보장은 보류한다. 구현 계획은 별도의 사용자 승인 전까지 실행하지 않는다.

Architectural 명세 승인 후 Planner가 `references/writing-plans.md`를 읽고 비례적인 계획 초안을 작성한다. 계획 승인 후 Implementer가 수행하며, 필요한 fresh QA와 실패 재검증을 거친다. Orchestrator가 각 승인된 작업의 기준을 확인해 수용한 뒤 해당 작업의 focused commit을 만든다.

모든 작업과 필수 QA가 완료되면 독립 Reviewer가 최종 전체 변경을 검토한다. 최종 전체 검토 finding은 Implementer 수정 후 Reviewer 재검토로 해결한다. 이 문서는 별도의 push·배포·현재 사용자 설정 변경 권한을 부여하지 않는다.

## 13. 남은 확인 사항

다음은 구현 전 해결하거나 계획의 명시적 게이트로 유지해야 한다.

- 지원할 Codex 버전·실행 형태와 해당 schema.
- 기존 설치기의 플랫폼 선택·버전 지원 기준에 맞춘 호환성 분기.
- Codex에서 root와 child tool call을 구분할 공식적이고 검증 가능한 호출자 식별 근거가 새로 제공되는지. 이 근거가 없으면 Codex는 진단 전용이다.
- 제한 역할의 지속 세션 허용 범위.
- 현재 설정을 건드리지 않는 실제 호스트 테스트 환경.
- 양쪽 설정을 함께 변경할 때 기존 transaction이 제공하는 복구 경계.

Claude 구버전은 업그레이드하지 않고 성능 저하를 표시한다. trust는 우회하지 않는다. 식별자 부재는 추정으로 해결하지 않는다.

---

**검토 기록**

- Planner가 최초 Architectural 명세 초안을 작성했고, Orchestrator가 동일 파일로 정리했다.
- 현재 CLI는 로그인 셸의 실제 실행 경로와 버전으로 확인했다. 별도 고정 경로가 가리키는 오래된 버전을 현재 버전으로 취급하지 않는다.
- 사용자는 명세의 네이티브 훅 자동 관리 범위와 binding 부재 시 Claude 호출 거부를 승인했다. 후속 결정으로 Codex는 훅을 등록하되 호출자 식별 한계가 해결될 때까지 진단 전용으로 두고 ARC 차단 보장을 하지 않기로 했다. 이 최신 선택은 앞서 검토한 미식별 Codex 자식 호출 거부 선택을 대체한다.
- 구현 계획과 소스 변경은 아직 시작하지 않았다.
