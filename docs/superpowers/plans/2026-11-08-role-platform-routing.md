# ARC 역할별 플랫폼 라우팅 구현 계획

상태: 최초·수정 계획 승인 완료; T1 완료, T2 사전 보류 계약 부분 수용·커밋 완료, T3 설정 UI·복합 활성화 정적 수용 완료 (2026-11-08). 실제 역할 디스패치와 AC8 상태 전이는 미완료이며 전체 사용자 목표는 완료되지 않았습니다.

> ARC의 작업 배정·검증·수용 절차를 적용합니다. 체크박스는 작업 진행을 추적하며, 승인된 최상위 작업 하나가 수용 후 커밋 하나에 대응합니다.

**목표** — ARC TUI에서 `Claude & Codex`를 설정하고, 현재 대화의 Orchestrator가 다섯 전문 역할을 각자 지정된 플랫폼·모델·effort로 위임할 수 있게 합니다.

**구조** — 공통 모듈이 로컬 CLI 실행 환경, 플랫폼별 인증 상태, 복합 설정의 형식을 정의합니다. 설치된 ARC 런타임은 현재 호스트와 역할 설정을 비교해 네이티브 위임 또는 상대 CLI 실행을 선택합니다. TUI와 설치 관리 경로는 두 하네스의 준비가 확인된 복합 리비전만 활성화합니다.

**기술** — Node.js ESM, 기존 ARC TUI와 설치 트랜잭션, Codex app-server `model/list`, Claude API 모델 카탈로그, 두 CLI의 구조화된 출력, ARC 런타임 상태 저장과 패키지 자산 생성 경로를 사용합니다.

**승인 명세** — [ARC 역할별 플랫폼 라우팅 명세](../specs/2026-11-08-role-platform-routing-design.md)

**대상** — `/Users/yunho/Desktop/project/arc`의 `feat/role-platform-routing`, 기준 HEAD `17dda4babd1a4818ddce79c32682709205054857`입니다. 준비된 단일 작업 트리에서 Orchestrator가 소유한 승인 명세를 보존합니다. 계획 저장 예정 경로는 `docs/superpowers/plans/2026-11-08-role-platform-routing.md`입니다. 구현은 저장된 계획의 개별 승인과 실행 대상 재확인 후 시작합니다.

## 공통 제약

- 현재 대화가 Orchestrator를 맡습니다. 지원 범위는 Codex CLI, Claude Code CLI, Codex Desktop 로컬 세션, Claude Desktop Code 탭 로컬 세션입니다. 상대 CLI는 동일한 로컬 실행 환경과 확인된 작업 트리에서 실행할 수 있어야 합니다.
- 기존 단일 플랫폼 설치·프리셋·역할 프로필과 호환 설정을 유지합니다. 복합 설정의 편집 진입점은 ARC TUI의 `Install / Update`와 `Change Preset`입니다.
- 클라우드·원격·순수 채팅, 별도 앱 설정 UI, 계정 선택·라우팅, ARC의 로그인·토큰 관리, 플랫폼·모델·effort 자동 대체는 제외합니다.
- 플랫폼 상태, 카탈로그 상태, 실제 역할 실행 근거를 분리합니다. 로그인 상태나 구성 파일에 적힌 값으로 실제 모델·effort 및 파일 권한을 증명하지 않습니다.
- 로그인 상태는 각 CLI의 로컬 인증 상태 명령으로 확인하며, Claude 모델 카탈로그 조회용 API 키가 인증 상태 확인의 선행 조건은 아닙니다.
- 검증 우선 방향을 유지합니다. 신뢰된 실행 식별·수명주기, 실제 모델·effort, 역할별 권한 또는 승인 경로 강제 근거가 부족한 `native`/`bridge` 경로는 시작 전에 보류하며 지원 완료로 표시하지 않습니다. T2/T3 수용과 전체 사용자 목표 완료는 구분합니다.
- 구성 활성화와 역할 실행 지원을 분리합니다. 명세 §2.5의 공통 활성 문서와 양쪽 설치 준비 마커는 설치 파일의 리비전·해시 일치만 증명하고, 인증·모델 접근·권한·프로필 재로드·실제 실행은 증명하지 않습니다.
- 로컬 Hook은 수명주기 관측 자료로만 다룹니다. 이번 범위에 새 네이티브 증명 공급자를 추가하지 않으며, Hook·CLI JSON·운영자 입력을 검증된 호스트 증명으로 승격하지 않습니다.
- 사용자 미요청 테스트를 추가하거나 실행하지 않습니다. 아래의 검증 항목은 수용에 필요한 근거를 정의합니다. 정적 근거로 확인할 수 없는 필수 동작은 미확인으로 기록하고, 필요한 근거가 확보될 때까지 해당 수용 또는 출시를 보류합니다.

## 작업 순서와 검토 초점

| 순서 | 작업 | 독립 산출물 | 선행 |
| --- | --- | --- | --- |
| T1 | CLI 인증 판정과 복합 설정 계약 | 공유 실행 환경, 인증 분류, 모델·effort 검증 계약 | 없음 |
| T2 | 역할 위임과 실행 상태 | 설치된 런타임에서 사용하는 위임·예약·재개 경로 | T1 |
| T3 | 복합 TUI와 두 하네스 활성화 | 설정 편집·저장·재열기, 설치 및 갱신 결과, 사용자 안내 | T1, T2 |

`MANIFEST.sha256`과 설치 런타임 자산은 공유 산출물입니다. 원본, 해당 설치 복제본, 매니페스트를 각 소유 작업에 포함하며 작업을 순차로 진행합니다. 선행 작업의 수용과 커밋 확인 뒤 후행 작업을 시작합니다.

| 검토 초점 | 소유 작업 |
| --- | --- |
| 비정상 종료, 버전 불일치, 해석 불가 출력을 `Unauthorized`로 오분류할 가능성 | T1 |
| 앱 실행 환경과 일반 터미널의 경로·설정 차이, 로그인과 카탈로그 또는 실제 모델 권한을 혼동할 가능성 | T1, T3 |
| 쓰기 권한이 작업 트리 전체에 열리거나 자식이 추가 위임·Git 변경을 실행할 가능성 | T2 |
| 예약 후 중단, 중복 요청, 완료 이벤트 누락 시 슬롯이나 변경 상태를 잃을 가능성 | T2 |
| 한쪽 설치·갱신 실패 또는 동시 설정 변경으로 불완전한 복합 리비전을 읽을 가능성 | T3 |

## T1 — CLI 인증 판정과 복합 설정 계약

**목표와 범위** — 두 CLI가 실제 역할을 실행할 환경을 한 방식으로 결정하고, 인증 판정과 카탈로그를 독립적으로 사용할 수 있게 합니다. 버전이 있는 복합 설정 형식과 역할별 모델·effort 검증 규칙을 제공합니다.

**파일 소유권**

- 신규 `lib/runtime/local-cli.mjs`, `lib/runtime/role-routing-config.mjs`
- 변경 `lib/installer/targets.mjs`, `lib/models/config.mjs`, `lib/models/catalog.mjs`, `lib/models/codex-catalog.mjs`
- 설치 자산 등록 및 해당 신규 모듈의 `codex/skill/runtime/`, `claude/skill/runtime/` 복제본과 `MANIFEST.sha256`
- 기존 `lib/models/catalog-anthropic.mjs`는 API 키를 사용하는 카탈로그 경로로 재사용합니다. [대상 경로 해석](../../../lib/installer/targets.mjs:4) · [모델 검증](../../../lib/models/config.mjs:22) · [카탈로그 분기](../../../lib/models/catalog.mjs:25) · [Codex app-server 실행](../../../lib/models/codex-catalog.mjs:9) · [Claude API 카탈로그](../../../lib/models/catalog-anthropic.mjs:5)

**인터페이스**

- `resolveLocalCli(platform, {cwd, userHome, env})`는 실제 실행 파일과 작업 디렉터리, 설정 경로를 확인한 실행 컨텍스트 또는 안전한 실패 사유를 반환합니다. 인증 확인과 역할 실행은 같은 컨텍스트를 사용합니다. 환경 변수와 원시 출력은 저장용 결과에 포함하지 않습니다.
- `probePlatformAuth(context, {signal, timeoutMs})`는 내부 상태 `{platform, authStatus, reason?}`를 반환합니다. `authStatus`는 `authenticated`, `unauthorized`, `unknown` 중 하나입니다. CLI가 없거나 실행할 수 없으면 원인을 보존해 호출자가 `Not Avaliable`로 표시할 수 있게 합니다.
- `parseRoleRoutingConfig(text)`와 `serializeRoleRoutingConfig(config)`는 스키마 버전, 리비전, 다섯 역할의 `{platform, model, effort}`를 읽고 씁니다. 기존 역할 키를 사용하고 형식·안전한 값 검증을 기존 모델 설정과 공유합니다. 카탈로그 확인과 수동 입력의 형식 검증은 구분합니다.

**구현 단계**

- [x] 기존 설치 대상의 설정 경로 규칙을 공통 해석에 연결합니다. Codex의 `CODEX_HOME`과 Claude의 허용된 `CLAUDE_CONFIG_DIR`를 유지합니다. Codex 카탈로그가 별도 임시 디렉터리에서 app-server를 시작할 때에도 원래 실행 환경에서 결정한 설정 경로를 유지합니다.
- [x] `codex login status`와 `claude auth status --json`을 사용합니다. CLI가 인증 정보를 찾았거나 로그인 상태임을 확인하면 내부 결과를 `authenticated`, CLI가 명시적으로 미로그인 상태임을 확인하면 `unauthorized`로 반환합니다. Codex의 일반 비정상 종료와 Claude의 상태 조회 오류·명령 미지원·시간 초과·응답 해석 실패는 `unknown`입니다. 명시적 미로그인 근거 없이 `unauthorized`로 추정하지 않습니다. 원시 출력은 상태 신호만 판독하고 보존하지 않습니다. [Codex 인증 상태 명령](https://learn.chatgpt.com/docs/developer-commands?surface=cli#codex-login) · [Claude Code 인증 상태 명령](https://code.claude.com/docs/en/cli-reference)
- [x] 인증 결과와 별개로 카탈로그의 `ready` / `unavailable`을 유지합니다. Codex는 `model/list`의 모델·지원 effort 쌍을 사용하고 실행 실패와 프로토콜 불일치를 구분할 수 있는 진단을 반환합니다. Claude API 카탈로그의 출처를 구분하고, API 목록이 없거나 CLI 계정과의 일치 근거가 없는 경우 수동 값을 형식상 유효한 값으로만 취급할 수 있게 합니다. 토큰이나 계정 식별자로 양쪽 계정을 대조하지 않습니다. [Codex 모델 조회](https://learn.chatgpt.com/docs/app-server#list-models-modellist)

**완료 근거 (2026-11-08)** — T1은 사용자 요청에 따른 테스트 추가·실행 없이 정적으로 수용했습니다. 변경된 6개 원본 모듈의 `node --check`, `git diff --check`, 원본과 네 설치 복제본의 바이트 일치, `sha256sum -c MANIFEST.sha256` 전 항목이 통과했습니다. 독립 QA는 AC2/3/4/10의 T1 소스 계약에서 차단 이슈를 찾지 않았습니다. 실제 CLI 버전 응답, 화면 상태 결합, 카탈로그 실시간 조회, 계정별 모델 실행 및 전체 비밀정보 경로는 미확인으로 남기며 T2/T3 통합 이후에도 테스트 미실행 제약에 따라 실행 근거 없이는 검증 완료로 표시하지 않습니다. T1의 수용 및 별도 구현 커밋은 해당 작업 경계에서 확인했습니다.

**수용 기준과 증거** — AC2의 분류 계약, AC3의 Codex 모델·effort 출처, AC4의 수동 값 검증, AC10의 비밀정보 제외를 충족합니다. 인증 판정표와 분기, 설정 직렬화 필드, 실행 경로와 카탈로그 호출 경로를 소스에 대조합니다. 인증·프로세스 경계의 변경이므로 독립 QA에 응답 분류, 설정 경로 일치, 출력 필드 제한의 정적 근거를 확인하도록 배정합니다. 실제 CLI 버전에서 상태 신호를 판독할 수 없는 경우 실행 지원 근거로 사용하지 않습니다. 문서화된 상태 명령이나 프로토콜과의 불일치는 해당 환경을 보류하고 Orchestrator에 반환합니다.

## T2 — 역할 위임과 실행 상태

**목표와 범위** — 현재 대화에서 승인된 배정을 받아 같은 플랫폼은 네이티브 역할로, 다른 플랫폼은 상대 CLI로 연결합니다. 두 경로의 예약·실행·종료·재개를 같은 ARC 작업에 연결하고, 증거를 얻지 못한 상태에서 권한이나 슬롯을 추정하지 않습니다.

**파일 소유권**

- 신규 `lib/runtime/role-routing.mjs`, `lib/runtime/role-bridge.mjs`
- 변경 `lib/runtime/cli.mjs`, `lib/runtime/command.mjs`, `lib/runtime/schema.mjs`, `lib/runtime/identity.mjs`, `lib/runtime/adapters/codex.mjs`, `lib/runtime/adapters/claude.mjs`
- 변경 `lib/runtime/bootstrap.mjs`, `codex/skill/runtime/bootstrap.mjs`, `claude/skill/runtime/bootstrap.mjs`
- 변경 `lib/installer/runtime-assets.mjs`; 양쪽 `skill/references/coordination.md`와 `skill/references/limits.md`의 복합 위임 안내, Codex/Claude 설치 런타임 복제본, `MANIFEST.sha256`
- `COOPERATIVE_RUNTIME_MODULES`에 T1의 `local-cli.mjs`, `role-routing-config.mjs`와 T2의 `role-routing.mjs`, `role-bridge.mjs`를 등록합니다. 실행에 사용하는 추가 모듈이 생기면 파일 소유권과 해시 경계를 먼저 확인합니다. 설치 목록 등록이나 import만으로 cooperative runtime hash에 포함됐다고 판단하지 않습니다.
- 기존 `lib/runtime/store.mjs`의 리비전·요청 기반 트랜잭션을 재사용합니다. 기존 협업 배정 경로는 계획의 Implementer 배정으로 범위가 제한돼 있으므로, 이를 무조건 다섯 역할에 적용하지 않습니다. [설치된 런타임 진입점](../../../lib/runtime/cli.mjs:3) · [명령 처리](../../../lib/runtime/command.mjs:6) · [기존 배정 경계](../../../lib/runtime/assignment.mjs:10) · [상태 트랜잭션](../../../lib/runtime/store.mjs:20)

**인터페이스**

- `prepareRoleDispatch({context, assignment, expectedRevision})`는 명세 §2.5의 공통 활성 문서·양쪽 준비 마커·설치 파일을 대조하고, 승인·활성 리비전·호스트·역할·저장소·작업 트리·기준 리비전·허용 경로·작업·인증·실행 증거 경로를 확인합니다. 필요한 근거가 없으면 `held` / `unverified`와 사유·해제 조건을 반환하며 예약하지 않습니다. 근거가 있을 때만 예약된 `dispatchId`와 `native` 또는 `bridge` 경로를 반환합니다.
- `runBridgeDispatch({context, dispatchId, signal})`는 기존 예약을 확인하고, `recordRoleObservation({context, dispatchId, observation})`은 신뢰 가능한 실행 식별자 및 종료 근거를 배정에 연결합니다.
- 설치된 `$ARC_RUNTIME_ENTRY` 호출은 기존 런타임 진입점에 좁은 `prepare-dispatch`, `run-dispatch`, `observe`, `resume` 하위 명령을 추가해 처리합니다. ARC 관리용 최상위 `arc` TUI 명령은 변경하지 않습니다. `prepare-dispatch`는 route와 `dispatchId`를 저장하고, `run-dispatch`는 bridge 경로만 실행하며, `observe`는 호스트 네이티브 호출 결과나 CLI 종료 근거를 기록하고, `resume`은 일치하는 기존 배정과 정확한 세션 ID에 대해서만 재개합니다. Orchestrator는 `native` 경로에서 현재 호스트의 네이티브 에이전트 도구를 직접 사용합니다. installed `coordination.md`는 이 호출 순서와 역할 지침을 연결합니다. 하위 명령 입력은 승인이나 실행 증거 자체로 사용하지 않습니다.

실행 결과는 명세 §4의 `routeStatus`, `supportStatus`, 사유 코드 및 해제 조건을 반환합니다. `observe` 입력과 로컬 Hook 값은 그 자체로 신뢰된 증거가 아닙니다. 직접 생성한 bridge 자식의 PID와 종료는 해당 프로세스 수명주기만 관찰합니다. 현재 검증 공급자 또는 권한·모델·effort 관측 경로가 없으면 해당 경로는 보류합니다. T2의 활성 문서·마커 검증과 durable reservation은 T3 게시와 같은 배타 잠금을 사용해 한 번에 처리합니다.

**구현 단계**

- [x] 승인 범위·역할을 읽고 복합 활성 문서, 양쪽 준비 마커, cooperative 런타임·정책·프로필 해시와 CLI 인증을 사전 확인합니다. 현재 실제 수용량·권한·요청 모델/effort 관측 경로가 없으므로 모든 경로를 `held` / `unverified`로 반환합니다. `unauthorized`는 `Unauthorized`, CLI 부재는 `Not Avaliable`, 확인 오류는 사유가 있는 `Incomplete`입니다. 이 검사는 실행 지원 증거가 아닙니다.
- [x] 설치된 `$ARC_RUNTIME_ENTRY`에 `prepare-dispatch`, `run-dispatch`, `observe`, `resume` 명령을 추가하고 두 하네스 지침에 안전한 호출 순서를 기록합니다. 현재 명령은 미검증 경로를 시작 전 보류하며 네이티브 에이전트 생성이나 상대 CLI 실행을 하지 않습니다. 실제 native/bridge 실행과 정확한 세션 재개는 미지원으로 남습니다.
- [ ] 예약, 실행, 확인된 완료·실패·취소, 상태 불명의 상태 전이를 기록합니다. 누적·동시 실행 한도와 실제 플랫폼 수용량을 시작 전에 확인합니다. 중복 요청을 거부하고, 네이티브 경로에서는 신뢰할 수 있는 호스트 식별자와 배정을 연결합니다. 확인된 시작 전 실패는 예약을 해제할 수 있고, 시작 여부나 종료가 불명확하면 예약과 누적 기록을 유지합니다. 실행 뒤 파일 변경이 있을 수 있으면 프로세스와 파일 상태를 대조할 때까지 의존 작업을 보류합니다. [네이티브 관측 근거](../../../lib/runtime/identity.mjs:32) · [한도 규칙](../../../codex/skill/references/limits.md:23)
- [ ] 브리지에서 Claude는 `claude -p --safe-mode --output-format stream-json`과 명시적 역할 지침, 역할별 `--tools`·`--permission-mode`를 사용합니다. Codex는 `codex exec --json`, 지정 모델·reasoning effort, 역할별 샌드박스와 명시적 승인 정책을 사용합니다. 읽기 전용 경로는 쓰기를 차단하고, 쓰기 경로는 허용 경로와 작업을 별도로 제한합니다. `workspace-write`만으로 파일별 제한을 충족했다고 판정하지 않습니다. 관리 훅, 추가 위임, Git 상태 변경, 외부 작업을 포함해 권한을 보장할 수 없는 경로는 보류합니다. [Claude Code CLI 레퍼런스](https://code.claude.com/docs/en/cli-reference) · [Codex 비대화형 권한](https://learn.chatgpt.com/docs/non-interactive-mode)
- [ ] 정확한 요청 모델·effort를 전달하고 실행 근거에 연결합니다. 실제 사용 조합을 확인할 수 없거나 CLI가 다른 조합을 사용하면 실패 또는 미확인으로 남깁니다. 비밀을 인자·프롬프트·상태·진단에 복사하지 않습니다. 재개 시 세션 ID, 역할, 설정 리비전, 승인 범위, 작업 트리와 활성 슬롯을 대조합니다. 새 QA 또는 Reviewer가 필요한 배정에서는 이전 세션을 사용하지 않습니다. [Codex CLI 재개](https://learn.chatgpt.com/docs/cli/reference) · [Claude Code 세션 재개](https://code.claude.com/docs/en/headless#continue-conversations)
- [x] T1 및 T2 신규 런타임 모듈을 고정 cooperative runtime hash에 포함하고, 원본·설치 복제본·자산 목록·매니페스트를 맞춥니다.
- [x] 명세 §2.5 배타 잠금으로 활성 문서·마커·프로필·설치 파일의 안정된 읽기와 해시를 대조하는 사전 확인을 구현했습니다.
- [ ] 예약·실행 경로와 durable reservation은 아직 없습니다. 이 릴리스는 모든 요청을 보류하므로 예약 저장과 bridge 직전 재확인은 미구현입니다.
- [ ] bridge 시작 직전에 같은 잠금을 얻어 reservation 리비전·마커·프로필을 다시 확인합니다. T3 게시 중이거나 확인할 수 없는 잠금이면 시작하지 않습니다. T3는 `reserved`, `running`, `unknown` 상태가 남아 있는 리비전의 게시를 보류합니다.
- [x] 명세 §4의 현재 보류 상태·사유 코드·해제 조건을 구현하고, 오류·관찰·재개 입력이 실행 증거로 승격되지 않음을 정적으로 대조합니다. 예약 이후 상태 전이는 미구현입니다.
- [ ] 미지원 경로 목록에 실행 환경·호스트·역할·지정 플랫폼·경로·사유·필요한 해제 근거를 기록합니다. 인증 비밀과 원시 CLI 출력을 포함하지 않습니다.

**수용 기준과 증거** — AC6–AC8 및 AC9·AC10의 런타임 부분을 담당합니다. 독립 QA는 시작 전 보호 조건, 근거 출처, 활성 문서·준비 마커 대조, 슬롯 보존·해제, 대체 거부, 재개 일치 조건과 데이터 경계를 정적으로 확인합니다. 필수 보호 조건이 없거나 검증되지 않은 입력으로 실행·슬롯 해제·지원 완료를 허용하면 T2 수용을 보류합니다.

엄격한 사전 보류 계약은 수용했으나 예약 상태 저장과 AC8의 예약·실행·종료·재개 전이는 미구현입니다. 이 수용은 실제 실행 지원을 증명하지 않습니다. AC6–AC9의 실제 실행 경로는 모두 미확인으로 유지합니다. T3는 현재 보류 계약을 사용해 구성 기능을 구현할 수 있으며, 미지원 경로를 실행 가능으로 표시하지 않습니다.

**T2 실행 기록 (2026-11-08)**

- T2 구현 커밋: `feat(runtime): 역할 디스패치 검증 보류`.
- 독립 QA가 발견한 무예약 `unknown` 상태와 불완전한 오류 응답을 `held` / `unverified`, `execution_identity_unverified` 또는 `activation_unverified` 사유, 해제 조건을 포함하도록 수정하고 재검토에서 해결됐습니다.
- 정적 확인: 변경 런타임 모듈 `node --check`, 원본·Codex·Claude 설치 복제본 `cmp`, `git diff --check`, 전체 `sha256sum -c MANIFEST.sha256` 통과. 테스트는 추가하거나 실행하지 않았습니다.
- 현재 안전한 보류 동작은 영속 dispatch 예약을 만들지 않고 어떤 bridge 프로세스도 생성하지 않습니다. 따라서 전역 dispatch 저장 계약, 예약 이후 상태 전이, T3의 활성 dispatch 조회·게시 차단, AC6–AC9 실제 실행 근거는 미완료입니다. 설정 활성화와 실행 지원을 구분하며 전체 사용자 목표 완료로 계산하지 않습니다.

## T3 — 복합 TUI와 두 하네스 활성화

**목표와 범위** — 두 메뉴에 `Claude & Codex`를 제공하고 역할별 설정을 저장·재열기합니다. 두 설치 대상의 호환성과 전체 설정을 확인한 뒤에만 활성 리비전을 게시하고, 단일 플랫폼 프로필과 복합 역할 프로필을 구분합니다.

**파일 소유권**

- 변경 `lib/tui/app.mjs`, `lib/tui/setup.mjs`, `lib/tui/custom-preset.mjs`, `lib/management/operations.mjs`, `lib/management/status.mjs`
- 신규 `lib/installer/role-routing.mjs`, 변경 `lib/installer/plan.mjs`, `lib/installer/preset.mjs`, `lib/installer/uninstall.mjs`, `lib/models/profiles.mjs`
- 안내 `README.md`, `docs/harness-operation.md`, 패키지 해시 `MANIFEST.sha256`
- T1의 상태·설정 계약과 T2의 라우팅 계약을 사용합니다. `target: 'all'`은 설치 계획 작성에 재사용하되 플랫폼별 모델 설정을 각각 생성합니다. [TUI 진입점](../../../lib/tui/app.mjs:67) · [현재 설정 메뉴](../../../lib/tui/setup.mjs:53) · [다중 설치 계획](../../../lib/management/operations.mjs:19) · [대상별 설치 결과](../../../lib/installer/install.mjs:15) · [설치 시 프로필 생성](../../../lib/installer/plan.mjs:21)

**인터페이스**

- `prepareCompositeOperation(context, options)`는 `install` 또는 `preset` 요청, 검증된 복합 역할 매핑, 두 플랫폼 상태와 대상별 계획을 준비합니다. `executeCompositeOperation(context, prepared)`는 최신 상태를 다시 확인하고 대상별 결과와 활성화 여부를 반환합니다. 기존 `prepareOperation`·`executeOperation`의 단일 모드 동작을 유지합니다.
- 공통 설정은 확인된 Codex 설치 홈의 ARC 관리 파일 `arc-role-platform-routing.json`에 한 번만 게시합니다. 각 하네스 준비 마커·별도 관리 프로필·게시 잠금은 명세 §2.5의 정확한 경로와 스키마를 사용합니다. T1의 공통 역할 설정 형식을 유지합니다.
- `executeCompositeOperation`은 구성 게시 결과와 역할 실행 지원 결과를 분리합니다. 구성 리비전이 게시돼도 실행 근거가 없는 역할은 `held` / `unverified`와 사유·해제 조건을 유지합니다.
- 게시 잠금은 T2 preflight와 공유합니다. 현재 T2에는 영속 dispatch 저장소와 reservation/state transition이 없어 활성 dispatch를 조회하거나 `reserved`, `running`, `unknown` 상태의 게시를 차단할 수 없습니다. 이 상태가 구현되기 전까지 모든 역할 실행은 시작 전에 보류합니다. 소유권을 확인하지 못한 잠금은 제거하지 않습니다.

**구현 단계**

- [x] `Install / Update`와 `Change Preset`에 `Claude & Codex`를 추가합니다. 진입 시 두 플랫폼 상태를 표시하고, 다섯 역할에서 플랫폼·모델·effort를 편집합니다. 설치/인증 상태와 카탈로그 상태를 별도로 표시하고 저장 및 활성화 전에 인증을 갱신합니다. ARC 대상이 없거나 CLI가 없으면 `Not Avaliable`, 상태 명령에서 명시적 미로그인이면 `Unauthorized`, 상태 확인 오류는 사유와 함께 `Incomplete`로 표시합니다. 인증 상태와 TUI 왕복 동작은 코드 경로 정적으로 확인했으며 인터랙티브 테스트는 하지 않았습니다.
- [x] Codex는 검증된 모델·effort 목록에서만 선택하게 하고 카탈로그를 사용할 수 없으면 활성화를 보류합니다. Claude는 API 목록을 선택 보조 자료로 표시합니다. 목록이 없거나 CLI 계정과의 일치가 미확인이면 수동 입력을 허용합니다. 수동 값은 형식 검증으로 저장할 수 있고 모델 접근·effort 지원은 실행에서 확인할 항목으로 표시합니다. Codex 카탈로그가 없으면 복합 설정 화면 진입과 활성화를 모두 보류하고 오류 원인을 표시합니다. 별도 draft 저장은 추가하지 않았습니다.
- [x] Codex 카탈로그 호출 경계에서 `userHome`이 `HOME`과 다를 수 있으면 원래 대상 해석으로 결정한 절대 `CODEX_HOME`을 명시적으로 전달해 임시 작업 디렉터리 기준으로 설정 경로가 달라지지 않게 합니다.
- [x] 기존 단일 모드 프로필과 설정을 유지하면서, 복합 모드 역할에는 지정 모델·effort를 담은 별도 관리 프로필을 준비합니다. 두 설치 대상과 전체 역할 설정의 유효성을 확인한 다음, 대상별 준비가 끝난 리비전만 공통 활성 파일로 게시합니다. 현재는 어떤 배정도 시작하지 않으므로 이전 실행의 리비전 유지와 Desktop 호스트 재로드는 런타임에서 확인되지 않았으며, 모든 역할을 보류합니다.
- [x] 두 대상 중 하나가 실패하거나 중단되면 대상별 결과를 표시하고 새 리비전을 활성화하지 않습니다. 이전 활성 리비전은 실제 설치 상태와 호환된다는 근거가 있을 때만 사용합니다. 설치·갱신·프리셋 변경·제거 시 공통 설정과 복합 관리 파일을 검사하고, 소유권을 확인할 수 없는 제거 대상은 잔여 경로로 보존합니다. 이 실패·복구 경로는 정적으로 검토했으며 실행 테스트는 하지 않았습니다.
- [x] 지원 범위를 확정된 사실에 한해 안내합니다. 로컬 CLI와 두 Desktop 환경 모두 실행 지원은 `held / unverified`이며, 상대 CLI 발견·인증 전제, 상태 표시, 카탈로그와 수동 입력의 차이, 새 세션 필요성을 문서화했습니다.
- [x] 같은 공통 설정 바이트에서 리비전·설정 해시를 계산하고 양쪽 설치 결과·런타임·정책·해당 플랫폼 역할 프로필을 재검사합니다. T2와 공유하는 배타 잠금 아래 준비 마커를 교체한 뒤 공통 활성 문서를 마지막으로 게시합니다. 두 하네스 홈의 게시를 전역 원자적 트랜잭션으로 주장하지 않습니다.
- [x] 부분 실패·취소·동시 변경 시 transaction rollback 및 스냅샷 확인이 실패한 공통 활성 리비전을 게시하지 않도록 합니다. 이전 활성 문서가 남았다는 이유로 이전 설치와 프로필이 호환된다고 추정하지 않습니다.
- [ ] 전역 dispatch 저장소가 없어 `reserved`, `running`, `unknown` 배정을 조회하거나 게시를 막는 계약은 구현하지 않았습니다. 이 상태 전이는 T2/T3 잔여 작업이며 구현 전까지 모든 역할 실행은 보류합니다.
- [x] 구성 활성화와 실행 지원을 화면·결과·문서에서 구분합니다. 실행 근거가 없는 역할은 실행 보류 상태와 확인 가능한 이유를 표시하고 지원 완료로 분류하지 않습니다.
- [x] 제거·갱신·역할 재배정 뒤 준비 마커와 실제 관리 파일이 맞지 않으면 새 디스패치를 보류합니다. 기존 제거 소유 범위 밖의 다른 하네스 파일을 임의로 수정하지 않습니다. 잠금은 협조하는 ARC 프로세스의 조정 수단이고 보안 경계가 아니므로, 비협조적 외부 수동 교체에 대한 확인-삭제 원자성은 보장하지 않습니다.

**수용 기준과 증거** — AC1, AC5 및 AC2–AC4의 TUI·활성화 부분, AC9의 지원 전제 안내, AC10의 설정·표시 부분을 정적 근거에서 수용합니다. 독립 QA는 게시 순서·rollback, 기존 파일 소유권과 제거 보존, 인증·카탈로그 재확인, 실행 보류 표시를 검토했습니다. 테스트를 추가하거나 실행하지 않아 실제 메뉴 왕복·설치 게시·실패 복구·인증 갱신은 런타임 미확인입니다. 구성 저장·재열기·게시 결과와 지원 미확인 역할 실행 경로를 각각 기록합니다. 마커와 구성의 일치만으로 로그인·프로필 재로드·권한·실제 모델·effort 또는 실행 성공을 주장하지 않습니다. T3 수용은 전체 사용자 목표 완료를 뜻하지 않습니다.

**T3 실행 기록 (2026-11-08)**

- T3 구현 커밋: `feat(tui): 복합 역할 설정과 활성화 추가`.
- 독립 QA는 Codex 카탈로그 부재 시 편집기 진입도 보류하는 동작을 검토했습니다. 승인 명세는 카탈로그 미확인 시 복합 활성화를 보류하고 별도 draft 저장을 요구하지 않으므로, 진입 차단을 안전한 활성화 보류로 수용하고 구체적인 카탈로그 오류 원인을 표시했습니다.
- 잠금 초기화 실패 시 현재 creator descriptor와 경로의 일반 파일·device/inode가 일치할 때만 생성한 파일을 정리합니다. 확인 또는 정리가 불가능하면 잔여 경로를 T3 오류와 T2 `held / unverified` 결과에 전달합니다. 확인 후 `unlink` 사이의 외부 수동 교체를 원자적으로 차단하지는 않습니다. 명세 §2.5의 잠금은 협조하는 ARC 프로세스 조정용이며 보안 경계가 아니므로 이 제한을 잔여 위험으로 기록합니다.
- 최종 Reviewer가 추가로 발견한 transaction rollback 실패와 lock release 실패의 오류 덮어쓰기 경로를 수정했습니다. 둘이 겹쳐도 기존 `rollback`, `activation`, cause와 잔여 경로를 유지하고 lock 경로를 추가합니다. 게시 성공 뒤 lock release 실패는 `unknown`과 cleanup·lock 잔여 경로를 반환합니다. 독립 QA가 이 전파 경로를 정적으로 재확인했고, 최종 Reviewer가 현재 HEAD에서 동일 finding 수정과 작업 트리를 재검토해 해결을 확인했으며 추가 P2는 찾지 못했습니다.
- QA는 프로필·마커의 리비전/바이트 해시 소유권, 별도 프로필 이름, 공통 활성 문서를 마지막으로 게시하는 순서, 기존 사용자 파일 보존과 실행 보류 표기를 정적으로 확인했습니다. 롤백·CLI 상태 갱신·TUI 상호작용은 실행하지 않았습니다.
- 정적 확인: 변경 JS의 `node --check`, 원본·Codex·Claude 런타임 사본 `cmp`, `git diff --check`, 전체 `sha256sum -c MANIFEST.sha256` 통과. 테스트는 추가하거나 실행하지 않았습니다.
- 실행 지원은 Codex CLI, Claude Code CLI, Codex Desktop 로컬 세션, Claude Desktop Code 로컬 탭의 모든 역할에서 미확인입니다. 현재 preflight는 `capacity_unverified`, `permission_scope_unverified`, `model_effort_observer_unavailable` 사유로 보류하며, 같은 플랫폼 네이티브 경로에는 `native_provider_unavailable` 및 `native_profile_reload_unverified`도 남습니다. 역할 지원을 `verified`로 표시하지 않습니다.
- 영속 dispatch 저장소와 AC8 예약·실행·종료·취소·재개 상태 전이, T3의 활성 dispatch 게시 차단이 미구현이므로 전체 사용자 목표는 완료되지 않았습니다. 이 잔여 작업과 실제 실행 근거를 확보해야 전체 완료 판정을 할 수 있습니다.

## 전체 인수 기준 추적

| 명세 | 소유 작업 | 필요한 근거 |
| --- | --- | --- |
| AC1 | T3 | 두 메뉴의 복합 설정 왕복과 단일 모드 호환 |
| AC2 | T1, T3 | 실제 TUI 라벨 `Avaliable` / `Not Avaliable` / `Incomplete` 유지, CLI 인증 결과에 따른 `Avaliable` / `Unauthorized` 구분, 미로그인 외 오류를 `Incomplete`로 분리 |
| AC3 | T1, T3 | Codex `model/list`의 모델·effort 검증과 카탈로그 불가 시 활성화 보류 |
| AC4 | T1, T3 | Claude 카탈로그 미확인 시 수동 입력과 실제 권한을 분리한 표시 |
| AC5 | T3 | 양쪽 준비 후 게시, 부분 실패·취소 후 활성화 보류 |
| AC6 | T2 | 근거가 있는 실행 경로만 지원으로 표시; 모델·effort 증명이 없으면 이유·해제 조건과 함께 보류 |
| AC7 | T2 | 권한 경로를 시작 전에 강제할 근거가 없으면 역할 실행 보류 |
| AC8 | T2 | 예약·종료·취소·불명·중복·재개 전이와 슬롯 보존 |
| AC9 | T1, T2, T3 | 네 실행 표면 각각 판정; 환경·세션 연결을 입증하지 못하면 지원 미확인 |
| AC10 | T1, T2, T3 | 인증 정보가 설정·상태·프롬프트·실행 인자·진단에 복사되지 않는 경로 |

## 최종 검증과 남은 제약

각 작업은 자체 기준과 필요한 근거를 충족했을 때 Orchestrator가 수용하고 해당 변경을 커밋합니다. 모든 작업이 수용되고 필수 QA 및 재확인이 끝난 뒤 독립 Reviewer가 전체 변경을 한 번 검토합니다. 전체 검토 범위는 승인 명세 추적, 설치·패키지 자산 일치, 권한과 인증정보 경계, 오류·부분 변경·재개 처리, CLI와 로컬 앱의 지원 근거입니다. 최종 Reviewer의 발견 사항은 Implementer 수정과 필요한 Reviewer 재확인으로 닫습니다.

AC5는 설치 준비와 구성 게시의 일관성을 추적합니다. AC6–AC9는 실제 근거가 확보된 경로와 보류된 경로를 함께 추적합니다. 최종 전체 Reviewer는 모든 수용 작업과 남은 지원 미확인 경로·사유·해제 조건을 검토합니다. 정적 근거로 확인하지 못한 실행 동작을 통과로 바꾸지 않습니다. 필요한 역할 실행 경로의 근거가 확보되지 않으면 전체 사용자 목표를 완료 처리하지 않습니다.

- **Codex 카탈로그** — app-server는 실험적 인터페이스입니다. 실제로 지원하는 버전과 `model/list` 응답 형식의 근거가 없으면 카탈로그와 복합 활성화는 보류합니다. [Codex CLI 레퍼런스](https://learn.chatgpt.com/docs/developer-commands?surface=cli) · [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- **Claude 모델·effort** — 공개 CLI에는 계정 기준의 비대화형 모델 목록 명령이 확인되지 않았습니다. 수동 입력으로 설정할 수 있어도 실제 모델·effort가 적용됐는지는 실행 근거가 필요합니다. API 카탈로그와 CLI 인증 상태는 독립적으로 유지합니다. [Claude Code CLI 레퍼런스](https://code.claude.com/docs/en/cli-reference)
- **앱과 CLI 인증** — 데스크톱 앱 내부 로그인과 로컬 CLI의 인증 상태 공유 여부는 가정하지 않습니다. 실제 앱 프로세스의 실행 파일 검색 경로, 허용 설정 디렉터리, 작업 트리, 해당 CLI 상태를 환경별로 확인해야 합니다. [Codex Desktop 통합 터미널](https://learn.chatgpt.com/docs/integrated-terminal) · [Claude Desktop 로컬 환경](https://code.claude.com/docs/en/desktop)
- **실행 권한과 관측** — 네이티브 배정 ID·생성·종료·실제 모델과 effort, 브리지의 역할별 경로 제한, 관리 정책 아래의 Claude `--safe-mode`는 공식 문서와 설정값만으로 입증할 수 없습니다. 필요한 근거가 없는 실행 경로는 성공이나 출시 지원으로 집계하지 않습니다. 명세의 계약을 지키려면 권한이나 지원 범위를 바꿔야 하는 경우 구현에서 추정하지 않고 Orchestrator에 반환합니다.
- **로컬 Hook과 세션 관측** — 공식 Codex/Claude Hooks는 로컬 lifecycle event를 제공하지만 서명된 host attestation이나 실제 effort·권한 강제의 증거로 문서화돼 있지 않습니다. Codex app-server 문서는 ARC가 직접 시작한 프로세스를 설명하며 기존 Desktop 세션을 attach/subscribe한다고 확인하지 않습니다. 이 근거 없이 지원을 주장하지 않습니다. [Codex Hooks](https://learn.chatgpt.com/docs/hooks) · [Claude Code Hooks](https://code.claude.com/docs/en/hooks) · [Codex app-server](https://learn.chatgpt.com/docs/app-server)

## Planner 자체 검토 (최초 초안)

AC1–AC10을 작업 및 증거에 연결했습니다. `Available` / `Not Available` / `Unauthorized`와 카탈로그의 `ready` / `unavailable`을 별도 계약으로 두었으며, 인증 명령의 미지원·오류·시간 초과·해석 실패가 `Unauthorized`로 처리되지 않는 경계를 포함했습니다. Claude 수동 입력은 인증이나 실제 모델 접근 검증과 분리했습니다. 공통 실행 계약, 위임 런타임, 설정 활성화 순서로 작업을 나눴고, 매니페스트와 설치 복제본은 소유한 원본 변경과 같은 작업에 포함했습니다.

위 내용은 최초 초안 당시의 검토 기록입니다. 최초 명세·계획은 2026-11-08 사용자 승인을 받았습니다. T1 수용 이후 사용자가 `검증 우선`을 선택했고, 수정 명세·계획은 2026-11-08 별도 승인되었습니다. 조사 근거는 저장소 소스와 공식 문서입니다. 승인 전에 초안을 작업 트리에 반영하는 동안 구현·테스트는 수행하지 않았습니다.

## Orchestrator 검토 및 수정

- 실제 홈 TUI는 `lib/tui/app.mjs:65`에서 `Avaliable` / `Not Avaliable` / `Incomplete`를 표시하고, `lib/management/status.mjs`에서 설치 상태를 `installed` / `absent` / `incomplete`로 반환합니다. 사용자 요청의 상태 표기를 그 기존 표시값과 일치시키고, CLI 인증 결과는 내부적으로 `authenticated` / `unauthorized` / `unknown`으로 분리했습니다.
- 명시적으로 로그아웃이라고 확인한 경우에만 `Unauthorized`를 표시합니다. CLI 부재는 `Not Avaliable`, 상태 조회 오류와 ARC 설치 불완전은 기존 `Incomplete` 및 원인 설명으로 남깁니다. 모델 카탈로그 상태와 실제 모델 접근 근거는 인증 상태와 섞지 않습니다.
- 기존 최상위 `arc` CLI는 TUI만 실행합니다. 계획은 현재 설치된 `$ARC_RUNTIME_ENTRY` 호출에 필요한 역할 하위 명령만 추가하고, 두 설치된 `coordination.md`에서 `native`는 Orchestrator의 현재 호스트 도구가, `bridge`는 ARC 런타임이 실행하도록 연결합니다. 실제 host 도구 연결을 근거로 확인할 수 없으면 해당 경로를 보류하도록 명시했습니다.
- 계획 초안 저장 후 사용자 승인을 받았습니다. 구현 시작 전에 브랜치 `feat/role-platform-routing`을 기준 HEAD `17dda4babd1a4818ddce79c32682709205054857`에서 준비하고 승인 명세·계획 파일을 커밋했습니다. T1 수용 후 계획 체크박스와 근거를 기록했습니다. 이는 승인된 범위·기준·방법을 바꾸지 않는 기계적 실행 기록이며 별도 사용자 승인이 필요하지 않습니다.

## 수정안 기록 (2026-11-08)

- T1은 최초 승인 문서에 따라 이미 수용·커밋됐으며 이 수정은 이를 소급 변경하거나 재승인하지 않습니다.
- T2 조사로 신뢰된 호스트 증명 경로, cooperative runtime 고정 해시 등록, 하네스별 준비 마커 계약의 누락이 확인됐습니다. 사용자는 엄격한 검증 우선과 미검증 경로 보류를 선택했습니다.
- 이 수정안은 명세 §2.5 및 실행 근거 상태, T2/T3 파일 소유권·읽기/게시 계약을 구체화합니다. 목적·역할·앱 범위·자동 대체 금지·무테스트 조건은 바꾸지 않습니다. 사용자가 2026-11-08 수정 명세·계획을 승인했으므로 T2 구현을 재개할 수 있습니다.
