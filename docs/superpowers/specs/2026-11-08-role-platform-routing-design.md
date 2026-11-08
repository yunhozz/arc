# ARC 역할별 플랫폼 라우팅 명세

상태: 최초 명세 승인 완료 (2026-11-08); `검증 우선` 수정안 사용자 승인 완료 (2026-11-08)

## 기준과 문서 순서

- 소스 저장소: /Users/yunho/Desktop/project/arc
- 기준 브랜치와 커밋: master, 17dda4babd1a4818ddce79c32682709205054857
- 선택된 실행 대상: 이 커밋에서 분기한 feat/role-platform-routing
- 이 명세의 계획 경로: docs/superpowers/plans/2026-11-08-role-platform-routing.md
- 의존 관계: 사용자 명세 승인 후 Planner가 계획 초안을 작성하고, 계획 승인 후 구현을 시작합니다.

사용자는 ARC TUI에서 Claude & Codex를 선택하고, 역할마다 플랫폼·모델·추론 강도를 지정하려고 합니다. 현재 대화가 계속 Orchestrator를 맡고 각 전문 역할은 지정된 플랫폼에서 수행됩니다. 사용자 승인 범위는 Codex CLI, Claude Code CLI, Codex Desktop의 로컬 세션, Claude Desktop Code 탭의 로컬 세션입니다. Codex와 Claude의 예시 모델 이름은 모델 목록이나 사용자 계정에서 쓸 수 있음을 보장하는 고정값이 아닙니다. 복합 플랫폼 화면은 기존 TUI 표시값인 `Avaliable`, `Not Avaliable`, `Incomplete`를 유지하고, CLI 미로그인 상태를 `Unauthorized`로 구분합니다.

## 1. 범위

### 포함

- ARC CLI TUI의 Install / Update와 Change Preset에 Claude & Codex 설정을 추가합니다.
- Scouter, Planner, Implementer, QA, Reviewer마다 실행 플랫폼, 해당 플랫폼의 모델, effort를 설정합니다.
- 두 플랫폼 CLI의 로컬 인증 상태를 확인합니다. 기존 TUI 표시값 `Avaliable` / `Not Avaliable`과 설치 오류의 `Incomplete`를 유지하고, CLI 미로그인 상태는 `Unauthorized`로 구분합니다. 인증 상태와 모델 카탈로그 상태는 서로 분리합니다.
- 현재 대화를 Orchestrator로 유지합니다.
- Orchestrator와 같은 플랫폼의 역할은 해당 플랫폼의 네이티브 서브에이전트로 실행하고, 반대 플랫폼 역할은 해당 CLI를 호출하는 ARC 위임 경로로 실행합니다.
- CLI 세션과 로컬 Codex Desktop 세션 및 Claude Desktop Code 탭의 로컬 세션을 지원합니다. ARC TUI 자체는 기존처럼 CLI에서 실행합니다.
- 기존 Codex 단독 및 Claude 단독 설정과 동작을 유지합니다.

### 제외

- 클라우드·원격 세션, 순수 채팅 화면, Orchestrator가 로컬 프로세스를 실행할 수 없는 환경.
- Codex 또는 Claude 계정 여러 개를 고르거나 역할별 계정을 따로 지정하는 기능.
- ARC가 로그인, 토큰 갱신, 인증 정보 보관을 대신하는 기능.
- 플랫폼·모델·effort의 자동 대체 또는 실패 시 묵시적 폴백.
- ARC의 네이티브 설정 변경 UI를 추가하는 일.

로컬 데스크톱 앱을 지원하려면 해당 세션이 ARC가 지원하는 호스트 환경이어야 하고, 반대 플랫폼 CLI가 같은 로컬 실행 환경에서 검색·실행 가능하며 자체 인증돼 있어야 합니다. 동일한 저장소와 작업 트리에서 실행합니다. 현재 설치 대상이 허용하는 설정 디렉터리를 사용하며, 계정별 설정 디렉터리 선택은 지원하지 않습니다.

## 2. 설정과 모델 카탈로그

### 2.1 복합 설정

각 전문 역할은 다음 논리 필드를 가집니다.

| 필드 | 의미 |
| --- | --- |
| platform | codex 또는 claude |
| model | 지정 플랫폼의 모델 식별자 |
| effort | 지정 모델의 추론 강도 |

Codex 설정에 반영할 때는 effort를 model_reasoning_effort로, Claude 설정에 반영할 때는 플랫폼이 받는 effort 값으로 전달합니다. 다섯 역할의 매핑은 버전이 있는 단일 복합 설정 리비전으로 관리합니다. 배정은 시작 시점 리비전을 보유하며, 설정이 바뀌어도 이미 시작된 역할의 설정을 조용히 바꾸지 않습니다.

Install / Update에서 복합 모드를 활성화하려면 Codex와 Claude 양쪽 하네스 설정이 모두 준비되고 새 복합 리비전이 완전해야 합니다. 한 대상의 설치·갱신 실패나 중단은 대상별로 표시하고 새 리비전을 활성화하지 않습니다. 이전 활성 리비전을 계속 쓸 수 있다는 호환성 근거가 없으면 복합 실행을 보류합니다. Change Preset은 저장된 복합 설정을 읽고 전체 리비전을 검증한 뒤 활성화합니다. 기존 단일 플랫폼 설정은 현재 형식과 경로를 계속 지원합니다.

### 2.2 플랫폼 설치·인증 상태

현재 홈 TUI는 `collectStatus()`의 설치 상태를 `Avaliable`, `Not Avaliable`, `Incomplete`로 표시합니다. 새 인증 검사는 이 플랫폼 행에 반영하되, 관리 대상 설치 상태와 CLI 인증 확인 결과는 내부적으로 구분합니다. 상태 확인은 모델 카탈로그 API나 앱 내부의 비공개 인증 저장소를 조회하지 않고, 역할 실행에 사용할 각 CLI의 읽기 전용 상태 명령을 호출합니다. CLI가 실제 역할 실행 때 사용할 것과 동일한 환경 변수 및 설정 디렉터리(`CODEX_HOME`, `CLAUDE_CONFIG_DIR` 포함)를 상태 확인에도 적용합니다.

| 상태 | 판정 |
| --- | --- |
| `Avaliable` | ARC 대상이 설치되어 있고 CLI를 실행할 수 있으며, CLI 상태 명령이 인증 정보가 있거나 로그인 상태임을 명시합니다. |
| `Unauthorized` | ARC 대상과 CLI가 준비되어 있지만 CLI 상태 명령이 로그인되지 않았거나 인증 정보가 없음을 명시합니다. 활성화와 역할 실행을 막고 해당 CLI의 로그인 절차를 안내합니다. |
| `Not Avaliable` | ARC 대상이 설치되지 않았거나 플랫폼 CLI를 실행할 수 없습니다. 설치 상태와 CLI 부재 원인을 기존 진단에 표시합니다. |
| `Incomplete` | ARC 대상 설치가 불완전하거나 CLI 인증 상태를 확인할 수 없습니다(명령 미지원, 오류, 시간 초과, 해석 불가 결과). 원인을 함께 표시하며 `Unauthorized`로 추정하지 않습니다. |

인증 확인 모듈의 내부 결과는 `authenticated`, `unauthorized`, `unknown`으로 나눕니다. Codex는 `codex login status`를 사용합니다. 종료 코드 0은 CLI가 인증 정보를 찾았다는 뜻이며, Codex가 지원하는 인증 방식에는 ChatGPT OAuth, API 키, access token이 포함됩니다. Codex의 일반 비정상 종료는 `unknown`으로 남기고 `Unauthorized`로 추정하지 않습니다. Claude Code는 `claude auth status --json`을 사용합니다. 공식 CLI 레퍼런스에 따른 종료 코드 0은 로그인됨, 1은 로그인되지 않음입니다. ARC는 출력에서 로그인 상태 판정에 필요한 필드만 처리하고 계정 식별자나 토큰을 표시·저장·기록하지 않습니다.

이 상태는 해당 CLI의 로컬 인증 설정이 존재하는지를 나타내며, 토큰이 서버에서 여전히 유효한지, 조직 정책·구독·사용량 한도가 통과되는지, 선택한 모델·effort를 쓸 수 있는지 보증하지 않습니다. 이를 모델별 상태나 API 카탈로그 결과와 합치지 않습니다. 실제 모델·effort 접근은 별도 카탈로그 근거 또는 역할 실행 결과로 확인합니다. 데스크톱 호스트가 같은 저장소와 CLI 인증 설정을 공유하지 않으면 ARC는 앱의 내부 세션을 읽지 않으며, 해당 역할에 실제로 사용할 CLI 상태를 따릅니다.

상태는 홈 TUI 표시, 설정 화면 진입·저장, 복합 리비전 활성화 전에 갱신하고, 역할을 처음 디스패치하기 직전에 다시 확인합니다. `Unauthorized`, `Not Avaliable` 또는 인증 확인 때문에 `Incomplete`인 플랫폼에 배정된 역할은 시작하지 않으며, 플랫폼이나 계정을 자동 변경하지 않습니다.

### 2.3 Codex 모델 선택

Codex 모델과 지원 effort는 codex app-server의 model/list를 통해 가져옵니다. 현재 ARC 구현은 자식 codex app-server에 유효한 CODEX_HOME을 전달합니다. Codex app-server는 해당 Codex 상태와 인증을 이용하고, 목록은 클라이언트와 로그인 계정에서 사용할 수 있는 모델 및 effort를 반환합니다. 이 경로는 OpenAI 모델 API를 직접 호출해 OPENAI_API_KEY로 목록을 가져오는 방식이 아닙니다.

목록에서 모델·effort 조합을 선택할 때 검증하지만, 목록은 이후 실행 가능성을 보장하지 않습니다. 계정 권한, 관리자 정책, CLI 버전, 인증 만료 또는 모델 접근 상태는 역할 실행 시 달라질 수 있으므로 런타임에서도 지정 조합을 확인합니다. Codex 카탈로그를 불러올 수 없으면 원인과 플랫폼을 표시하고 Codex 조합 설정 및 새 복합 리비전 활성화를 보류합니다. Codex의 수동 카탈로그 우회는 현재 승인 범위에 포함되지 않습니다.

Codex app-server 명령은 현재 문서에서 실험적 기능으로 표시되며 프로덕션 작업용으로 지원되지 않습니다. model/list는 이 프로토콜의 모델 조회 메서드입니다. 구현은 지원 CLI 버전과 프로토콜 불일치를 구분하고, 목록을 검증할 수 없는 경우 사용 불가로 처리해야 합니다. 실험적 인터페이스의 동작을 안정된 호환성으로 가정하지 않습니다.

### 2.4 Claude 모델 선택과 인증

현재 ARC의 Claude 카탈로그 구현은 Anthropic API의 /v1/models를 직접 호출하고 ANTHROPIC_API_KEY를 요구합니다. 이 키 요구사항은 해당 카탈로그 조회 방식에만 해당합니다. Claude Code CLI 자체는 claude.ai 계정의 구독 로그인 또는 적합한 Console 로그인으로 사용할 수 있으며, CLI 실행에 API 키가 항상 필요한 것은 아닙니다. API 카탈로그 조회는 CLI의 저장된 구독 로그인을 읽거나 대리하지 않습니다.

Claude API 카탈로그를 사용할 수 있으면 모델·effort 조합 목록으로 제공합니다. 이 목록은 API 키에 연결된 API 계정의 정보이며, 실제 역할 실행에 쓰는 Claude Code 로그인 계정의 접근 가능성을 보장하지 않습니다. 키가 없거나 카탈로그가 없을 때뿐 아니라 현재 CLI 계정과 일치한다고 확인할 수 없는 경우에도 모델 식별자와 effort를 수동 입력할 수 있습니다. 카탈로그는 선택을 돕는 자료이며 수동 입력을 막는 허용 목록이 아닙니다. 수동 입력은 형식과 안전한 문자 집합만 검증하며, 모델이 그 계정에서 제공되는지 또는 해당 effort를 지원하는지는 검증됐다고 표시하지 않습니다.

`claude auth status --json`으로 로컬 Claude Code CLI 로그인 여부를 확인합니다. 상태 명령은 인증 방식과 설정 경로도 반환할 수 있지만, ARC의 플랫폼 상태 표시는 계정 세부 정보를 노출하지 않습니다. 이 명령은 모델별 접근 권한이나 effort 목록을 반환하지 않습니다. 역할 실행 시 수동 입력값을 변경 없이 Claude Code에 전달합니다. CLI가 모델 또는 effort를 사용할 수 없다고 반환하면 해당 배정을 실패 또는 미확인으로 기록하고 후속 의존 작업을 보류합니다. 다른 모델로 전환하지 않습니다. Claude Code의 공개 CLI 레퍼런스에는 Codex app-server model/list와 같은 비대화형 계정 모델 목록 명령이 없으므로, 별도 인증 토큰을 읽거나 비공개 API를 호출해 목록을 추정하지 않습니다.

Claude Code의 현재 인증 설정으로 비대화형 역할을 실행할 때는 claude -p와 --safe-mode를 사용합니다. --safe-mode는 인증·모델 선택·내장 도구·권한을 유지하고 일반 프로젝트 커스터마이징을 비활성화합니다. --bare는 구독 OAuth와 시스템 키체인 인증을 읽지 않으므로 사용하지 않습니다. API 키는 Claude Code CLI 인증 방식 중 하나일 수 있으며, ARC가 로그인 방식을 바꾸거나 자격 증명을 대신 관리하지 않습니다.

### 2.5 복합 리비전과 설치 준비 증거

공통 활성 문서는 확인된 Codex 설정 홈의 `<CODEX_HOME>/arc-role-platform-routing.json`입니다. T1에서 정한 `{version: 1, revision, roles}` 형식을 그대로 사용합니다. 문서의 `revision`은 한 복합 설정을 식별하며, 설정 내용이 달라지면 새 리비전을 사용합니다. 게시된 리비전에 다른 바이트를 다시 게시하지 않습니다.

각 하네스의 준비 마커는 다음 경로에 저장합니다.

- Codex: `<resolved CODEX_HOME>/arc-role-platform-routing.prepared.json`
- Claude: `<resolved Claude configHome>/arc-role-platform-routing.prepared.json`

준비 마커는 아래 필드만 포함하는 JSON 객체입니다.

```json
{
  "version": 1,
  "revision": "<공통 활성 문서와 같은 리비전>",
  "platform": "codex",
  "targetHome": "<정규화된 절대 하네스 설정 홈>",
  "activeConfigPath": "<정규화된 절대 공통 활성 문서 경로>",
  "configHash": "sha256:<소문자 64자리>",
  "runtime": {
    "version": "<설치된 cooperativeVersions().runtime>",
    "hash": "sha256:<소문자 64자리>",
    "policyHash": "sha256:<소문자 64자리>"
  },
  "profiles": {
    "arc_planner": {
      "path": "agents/arc-routing-planner.toml",
      "hash": "sha256:<소문자 64자리>"
    }
  }
}
```

`platform`은 `codex` 또는 `claude`입니다. `configHash`는 공통 활성 문서로 게시할 UTF-8 바이트 전체의 SHA-256입니다. 자기 자신의 해시 필드를 공통 활성 문서에 추가하지 않습니다. `runtime.version`은 대상 하네스의 `cooperativeVersions().runtime`, `runtime.hash`와 `runtime.policyHash`는 해당 하네스에 설치된 파일에서 계산한 값입니다.

`profiles`의 키 집합은 공통 역할 설정에서 해당 플랫폼에 배정된 역할과 정확히 일치합니다. 해당 역할이 없으면 빈 객체입니다. 각 `profiles.*.path`는 대상 홈 기준 상대 경로이며 절대 경로와 `..`를 포함할 수 없습니다. 파일 경로는 Codex에서 `agents/arc-routing-<역할 접미사>.toml`, Claude에서 `agents/arc-routing-<역할 접미사>.md`입니다. 역할 접미사는 `scouter`, `planner`, `implementer`, `qa`, `reviewer` 중 하나입니다. 이 별도 관리 프로필은 기존 단일 모드의 `arc-*` 프로필을 덮어쓰지 않습니다.

마커와 공통 활성 문서는 심볼릭 링크가 아닌 일반 파일이어야 합니다. 대상 홈, 경로, 필드, 리비전, 설정 해시, 설치된 런타임·정책·프로필의 실제 바이트를 대조합니다. 파일 존재만으로 준비 완료를 판단하지 않습니다.

T2와 T3는 확인된 Codex 설정 홈의 `arc-role-platform-routing.lock`에서 같은 배타 잠금 계약을 사용합니다. 잠금은 `open('wx')`에 해당하는 원자적 exclusive-create와 mode `0600`으로 얻습니다. JSON 잠금 파일은 `version`, 유일한 `operationId`, 양의 `pid`, UTC `createdAt`만 포함합니다. T2는 활성 문서·마커 검증과 durable reservation 저장까지 잠금을 유지하고, T3는 게시 전 검증부터 최종 활성 문서 교체까지 잠금을 유지합니다. T3는 잠금 아래에서 이전 리비전의 `reserved`, `running`, `unknown` dispatch가 있으면 새 구성을 게시하지 않습니다. T2는 bridge를 시작하기 직전에 잠금 아래에서 같은 리비전과 마커를 다시 대조합니다. 해당 `operationId`의 소유자만 잠금을 해제할 수 있습니다. 잠금을 얻지 못하거나 소유권·현재 상태를 확인하지 못하면 실행 또는 게시를 보류합니다. 비정상 종료로 남은 잠금은 자동 삭제하지 않고 수동 확인을 요구합니다. 이 잠금은 ARC 프로세스 사이 게시 경합만 조정하며 수동 파일 변경이나 다른 프로세스를 막는 보안 경계는 아닙니다.

두 하네스의 설치·프로필 준비와 재검사가 모두 끝난 뒤 각 마커를 같은 디렉터리의 임시 파일에서 원자적으로 교체하고, 마지막에 공통 활성 문서를 원자적으로 교체합니다. 서로 다른 하네스 홈을 하나의 원자적 트랜잭션으로 처리했다고 주장하지 않습니다. 부분 실패·취소 시 새 공통 리비전을 게시하지 않습니다. 이전 활성 문서가 남더라도 실제 마커·설치 파일과 일치하지 않으면 이전 리비전의 실행을 보류합니다.

T2는 배타 잠금 아래에서 공통 활성 문서와 양쪽 마커·설치 파일을 대조하고, 검증 결과와 dispatch reservation을 durable하게 기록한 뒤 잠금을 해제합니다. bridge 실행 직전 같은 잠금 아래에서 리비전·마커·프로필을 다시 대조합니다. 읽는 동안 문서나 근거 파일이 바뀌거나 잠금을 얻을 수 없으면 실행을 보류합니다. T3는 이전 리비전의 유효 dispatch가 남아 있는 동안 프로필과 활성 구성을 교체하지 않습니다.

준비 마커는 **해당 리비전의 설치 파일이 준비됐다는 일관성 근거**입니다. 로그인, 계정의 모델 접근, 실제 모델·effort 적용, 호스트의 프로필 재로드, 파일 권한, 추가 위임 차단 또는 실행 성공의 근거로 사용하지 않습니다. 구성 활성화와 역할 실행 지원은 별도로 판정합니다.

## 3. 위임과 권한

Orchestrator는 실행 전에 현재 호스트 플랫폼, 설정 리비전, 역할, 작업 ID, 기준 저장소·작업 트리, 허용된 경로와 작업, 입력 및 결과 요구사항을 확인합니다. 승인된 배정을 현재 권한 안에서 실행할 수 있을 때만 슬롯을 예약합니다.

- 같은 플랫폼 역할은 Codex 또는 Claude Code의 네이티브 서브에이전트 경로를 사용합니다.
- 반대 플랫폼 역할은 ARC 위임 경로가 Orchestrator의 로컬 셸에서 상대 CLI를 실행합니다.
- Claude Code는 claude -p --safe-mode --output-format stream-json과 명시적 역할 지침, 도구 및 권한 인자를 사용합니다.
- Codex는 codex exec --json과 지정 모델, reasoning effort, 역할별 샌드박스 및 승인 설정을 사용합니다.
- 읽기 전용 역할에는 쓰기 도구를 열지 않습니다. Codex의 workspace-write는 작업 트리 전체를 쓸 수 있으므로, 허용 경로 제한을 별도로 보장하지 못하면 해당 위임을 보류합니다.
- 쓰기 권한이 있는 역할도 승인된 경로와 작업만 수행합니다. 역할의 Git 상태 변경 및 외부 작업 제한을 유지합니다.

자식 CLI는 각 CLI가 정한 인증 우선순위와 현재 설정을 사용합니다. ARC는 CLI 로그인 토큰을 직접 읽거나 복사하지 않습니다. 사용자가 ANTHROPIC_API_KEY를 설정한 경우 ARC의 Claude 카탈로그 조회는 그 키로 인증할 수 있고, 같은 환경의 Claude Code CLI도 자체 인증 우선순위에 따라 이를 사용할 수 있습니다. ARC는 키를 설정·상태 파일에 저장하거나 위임 CLI 인자, 프롬프트, 로그 또는 진단 출력에 복사하지 않습니다. CLI 출력은 데이터일 뿐이며 승인이나 권한 확대를 뜻하지 않습니다. 인증·CLI·모델·effort·권한을 확인할 수 없으면 영향을 받는 역할을 보류합니다.

프롬프트 지시와 실행 환경이 실제로 적용한 도구·파일 권한은 구분합니다. 모델 설정에 적힌 값만으로 실행 중 모델·effort가 적용됐다고 주장하지 않습니다. 런타임의 신뢰할 수 있는 결과로 실제 사용 조합을 확인할 수 없으면 그 사실을 미확인으로 기록하고 해당 조합에 대한 출시 근거로 계산하지 않습니다.

검증 우선 모드에서는 필요한 근거가 없는 역할을 시작하지 않습니다. `native` 경로에는 현재 호스트가 제공하는 신뢰된 배정 상관관계·실행 식별자·수용량·수명주기 관측과 필요한 프로필 재로드 근거가 있어야 합니다. `bridge` 경로에서 ARC가 직접 생성한 자식의 시작·PID·종료 관측은 해당 프로세스의 수명주기 근거로만 사용합니다.

두 경로 모두 시작 전에 역할별 도구·파일·허용 경로와 작업, 추가 위임·Git 변경·외부 작업 제한을 실행 환경이 적용한다는 근거를 요구합니다. 작업 디렉터리, 프롬프트 지시, 도구 이름 목록 또는 `workspace-write`만으로 이를 충족했다고 판단하지 않습니다.

시작 전에는 요청한 모델·effort를 변경 없이 전달하고 적용 결과나 거부를 신뢰할 수 있게 판독할 경로가 있어야 합니다. Claude 수동 입력은 형식상 유효한 요청값으로 유지하며, 카탈로그 부재만으로 값을 대체하거나 모델 접근이 검증됐다고 표시하지 않습니다. 실제 적용값은 실행에서 확인합니다. 이를 관찰할 수 있는 경로 자체가 없으면 시작을 보류합니다.

로컬 Hook 이벤트는 수명주기 관측 자료로만 취급합니다. Hook 입력이나 CLI에 전달한 JSON을 서명된 호스트 증명, 승인, 권한 강제 또는 실제 모델·effort 증거로 승격하지 않습니다. 현재 조사에서 확인되지 않은 기존 Desktop 세션 연결을 Codex app-server가 제공한다고 가정하지 않습니다. 이번 수정 범위에서 새 네이티브 증명 공급자를 추가하지 않습니다.

## 4. 실행 상태, 한도, 재개

복합 모드는 같은 Orchestrator 대화 안의 네이티브 및 CLI 위임을 하나의 ARC 작업으로 기록합니다. 기록 항목은 배정 ID, 호스트 세션, 역할, 설정 리비전, 요청한 플랫폼·모델·effort, 승인 범위, 검증된 실행 식별자, 종료 상태와 결과 참조를 포함합니다. 비밀 정보는 포함하지 않습니다.

역할별 보고는 `native` 또는 `bridge` 경로, 실행 환경, 역할, 요청 플랫폼·모델·effort, `routeStatus`, `supportStatus`, 사유 코드, 필요한 해제 근거를 포함합니다. `routeStatus`는 `held`, `reserved`, `running`, `completed`, `failed`, `cancelled`, `unknown` 중 하나입니다. `supportStatus`는 기본적으로 `unverified`이며 해당 환경·역할·요청 조합의 실제 근거를 확인한 경우에만 `verified`입니다.

시작 전 보류는 `held`로 반환하고 슬롯이나 실행 식별자를 새로 만들지 않습니다. 예약 이후 시작 여부·실행 식별자·종료가 불명확하면 `unknown`으로 기록하고 슬롯과 누적 기록을 유지합니다. 관찰한 적용 모델·effort가 요청과 다르면 실패로 기록합니다. 프로세스 종료와 변경 상태까지 확인하지 못했으면 실패 표시만으로 슬롯이나 의존 작업을 해제하지 않습니다. 보류 결과는 확인된 모든 누락 사유를 함께 반환합니다.

| 사유 코드 | 적용 시점과 의미 | 해제 조건 |
|---|---|---|
| `activation_unverified` | 공통 리비전·양쪽 마커·설치 파일의 일치가 미확인 | §2.5의 전체 대조와 재검사 통과 |
| `native_provider_unavailable` | 신뢰된 네이티브 배정·실행 관측 공급자가 없음 | 현재 호스트의 실제 검증 채널과 상관관계 확인 |
| `native_profile_reload_unverified` | 네이티브 호스트가 지정 프로필 리비전을 읽었는지 미확인 | 해당 호스트·세션의 재로드 근거 확인 |
| `capacity_unverified` | 실제 플랫폼 수용량 또는 활성 슬롯 상태가 미확인 | 현재 세션의 신뢰된 수용량·활성 실행 대조 |
| `permission_scope_unverified` | 시작 전 역할별 권한·허용 경로·금지 작업의 강제가 미확인 | 실행 환경이 해당 제한을 적용한다는 근거 확인 |
| `model_effort_observer_unavailable` | 실제 적용값·거부·대체를 판독할 신뢰된 경로가 없음 | 지정 CLI/호스트 버전의 적용 결과 관측 계약 확인 |
| `execution_identity_unverified` | 시작 후 배정과 실제 실행 ID의 연결이 미확인 | 신뢰된 실행 식별자와 배정 상관관계 확인 |
| `model_effort_unverified` | 시작 후 실제 적용 조합을 확인하지 못함 | 해당 실행의 요청 조합과 적용 조합 대조 |
| `model_effort_mismatch` | 실제 조합이 요청과 다름 | 성공으로 전환하지 않음. 종료·변경 대조 후 새 승인 배정 판단 |
| `terminal_state_unverified` | 종료·취소·남은 프로세스 또는 변경 상태가 미확인 | 해당 실행의 종료와 필요한 파일 상태 대조 |

CLI 부재와 인증 결과는 기존 `Not Avaliable`, `Unauthorized`, 원인이 있는 `Incomplete` 분류를 유지하며 위 실행 근거와 구분합니다. 진단에는 자격 증명·계정 식별자·원시 출력을 포함하지 않습니다.

| 상태 | 처리 |
| --- | --- |
| 예약됨 | 실행 전에 누적 생성·동시 실행 한도와 실제 플랫폼 수용량을 확인하고 예약합니다. 중복 배정은 거부합니다. |
| 실행 중 | 신뢰할 수 있는 실행 식별자를 확인한 경우에만 배정과 연결합니다. |
| 완료·실패·취소 확인 | 종료와 결과를 대조한 뒤 활성 슬롯을 해제합니다. 실행 중 파일 쓰기가 있었으면 실제 변경과 남은 프로세스를 확인하고 의존 작업을 판단합니다. |
| 상태 불명 | 슬롯 예약을 유지하고 의존 작업을 보류합니다. 응답 누락이나 프로세스 재시작만으로 재실행하지 않습니다. |

Codex와 Claude 네이티브 세션 사이의 한도는 자동으로 공유되지 않습니다. ARC가 관찰할 수 없는 네이티브 생성·종료 상태를 계수 또는 강제했다고 주장하지 않습니다. 예약 및 세션 상태를 입증할 수 없으면 영향을 받는 후속 작업을 보류합니다.

재개는 배정과 결합된 정확한 실행 세션 ID로만 수행합니다. 역할, 플랫폼, 모델·effort, 저장소·작업 트리, 설정 리비전 및 승인 범위가 유효한지 확인합니다. 필요한 QA 또는 Reviewer의 새 실행은 기존 세션을 재사용하지 않습니다. CLI 설치·인증 오류, 모델 미지원, effort 거부, 권한 거부, 취소, 중복 요청, 종료 불명 및 결과 불명은 서로 구분합니다. 계정·세션·모델·플랫폼을 묵시적으로 바꾸지 않습니다.

## 5. 인수 기준

| ID | 기준 |
| --- | --- |
| AC1 | 두 TUI 메뉴에서 Claude & Codex를 열고 다섯 역할에 플랫폼·모델·effort를 설정하고 다시 읽을 수 있습니다. 기존 단일 모드와 설정은 기존 방식으로 읽고 적용합니다. |
| AC2 | 홈 TUI는 기존 `Avaliable` / `Not Avaliable` / `Incomplete` 표시를 유지하고, 설치된 플랫폼의 CLI 로그인 상태를 `Avaliable` 또는 `Unauthorized`로 구분합니다. 플랫폼 또는 CLI 부재는 `Not Avaliable`, 로그인 상태 확인 오류는 원인과 함께 `Incomplete`입니다. Codex `codex login status`와 Claude `claude auth status --json`의 명시적인 미로그인 결과만 `Unauthorized`로 표시합니다. |
| AC3 | Codex 선택기는 인증 상태 확인과 별도로 Codex app-server `model/list` 결과로 모델·지원 effort 조합을 검증합니다. 카탈로그를 사용할 수 없으면 이유를 표시하고 활성화를 막습니다. 인증됨은 모델 접근 권한으로 간주하지 않습니다. |
| AC4 | Claude 카탈로그 사용 불가 또는 현재 CLI 계정과 일치함을 확인할 수 없을 때 수동 모델·effort 입력이 가능합니다. 로컬 CLI 로그인 상태를 확인할 수 있지만, 실제 모델 접근은 입력이나 로그인 상태만으로 검증됐다고 표시하지 않고 실행 시 CLI의 성공·실패 근거로 처리합니다. |
| AC5 | 두 하네스의 준비 마커와 공통 활성 문서가 §2.5의 리비전·해시 계약을 충족할 때만 새 구성 리비전을 게시합니다. 부분 실패·취소는 새 리비전을 게시하지 않습니다. 구성 활성화는 역할 실행 지원을 뜻하지 않습니다. |
| AC6 | 같은 플랫폼 `native`와 반대 플랫폼 `bridge` 경로를 결정합니다. 필요한 실행 근거가 없으면 사유와 해제 조건을 반환하고 시작을 보류합니다. 지원을 주장하는 경로는 요청한 모델·effort의 전달 및 실제 적용 근거를 기록해야 하며 자동 대체하지 않습니다. |
| AC7 | 읽기 전용 역할의 쓰기 차단과 쓰기 역할의 허용 경로·작업 제한을 시작 전에 확인합니다. 추가 위임·Git 변경·외부 작업 제한을 포함해 실행 환경의 강제 근거가 없으면 해당 역할을 시작하지 않습니다. |
| AC8 | 두 경로의 보류·예약·실행·완료·실패·취소·상태 불명·정확한 세션 재개를 구분합니다. 시작 또는 종료가 불명확한 실행의 슬롯을 유지하고 의존 작업을 보류합니다. 로컬 Hook만으로 검증된 실행·권한·모델 또는 종료를 주장하지 않습니다. |
| AC9 | 네 로컬 실행 환경에서 실제 CLI·설정 홈·동일 작업 트리와 해당 경로의 관측·권한 전제를 각각 판정합니다. 미확인 환경·역할·경로는 이유와 함께 지원 미확인으로 남깁니다. 기존 Desktop 세션 연결을 추정하지 않습니다. |
| AC10 | ARC 설정, 상태, 프롬프트, 프로세스 실행값과 진단 출력에 인증 비밀이 저장되거나 노출되지 않습니다. |

T2 또는 T3의 구현 산출물을 수용할 때 남아 있는 지원 미확인 경로와 사유·해제 조건을 기록합니다. 안전한 보류 구현, 로그인 확인, 구성 저장·활성화 또는 정적 검사 통과만으로 AC6–AC9의 실제 실행 근거가 확보됐다고 판단하지 않습니다. 승인된 사용자 목표에 필요한 실행 경로가 미확인으로 남으면 전체 목표를 완료 처리하지 않고 잔여 작업과 차단 조건을 보고합니다.

## 6. 증거, 위험, 계획 단계에서 구체화할 내용

저장소에서 확인된 현재 경로는 다음과 같습니다.

- [lib/tui/setup.mjs](../../../lib/tui/setup.mjs)는 현재 codex와 claude 대상만 노출합니다.
- [lib/tui/app.mjs](../../../lib/tui/app.mjs)는 홈 TUI에서 설치 상태를 `Avaliable`, `Not Avaliable`, `Incomplete`로 표시하고, [lib/management/status.mjs](../../../lib/management/status.mjs)는 `installed`, `absent`, `incomplete`를 반환합니다.
- [lib/models/config.mjs](../../../lib/models/config.mjs), [lib/models/catalog.mjs](../../../lib/models/catalog.mjs), [lib/tui/custom-preset.mjs](../../../lib/tui/custom-preset.mjs)는 단일 플랫폼 모델·effort를 사용합니다.
- [lib/models/codex-catalog.mjs](../../../lib/models/codex-catalog.mjs)는 CODEX_HOME을 전달한 codex app-server를 시작해 model/list를 요청합니다.
- [lib/models/catalog-anthropic.mjs](../../../lib/models/catalog-anthropic.mjs)는 ANTHROPIC_API_KEY로 Anthropic API 모델 목록을 요청합니다.
- [lib/installer/targets.mjs](../../../lib/installer/targets.mjs)는 현재 codex 및 claude 설치 경로를 정의합니다.
- [lib/runtime/adapters/codex.mjs](../../../lib/runtime/adapters/codex.mjs) 및 [lib/runtime/adapters/claude.mjs](../../../lib/runtime/adapters/claude.mjs)는 각 호스트 이벤트를 정규화하며 현재 다른 플랫폼 CLI를 실행하지 않습니다.

공식 근거:

- [Claude Code 인증](https://code.claude.com/docs/en/authentication)은 계정 로그인과 API 키 인증을 별도 방식으로 설명합니다.
- [Claude Code CLI 레퍼런스](https://code.claude.com/docs/en/cli-reference)는 `claude auth status`가 인증 상태를 JSON으로 반환하고 로그인 여부에 따라 종료 코드를 제공한다고 설명합니다.
- [Claude Code 비대화형 실행](https://code.claude.com/docs/en/headless)은 claude -p 및 --safe-mode 동작을 설명합니다.
- [Codex CLI 레퍼런스](https://developers.openai.com/codex/cli/reference)는 `codex login status`가 활성 인증 방식과 credential 존재 여부를 제공한다고 설명합니다.
- [Codex app-server 모델 조회](https://learn.chatgpt.com/docs/app-server)는 model/list와 계정·클라이언트별 모델 및 effort를 설명합니다.
- [Codex 환경 변수](https://learn.chatgpt.com/docs/config-file/environment-variables)는 CODEX_HOME이 CLI 및 app-server의 인증을 포함한 상태 경로임을 설명합니다.
- [Codex Desktop 터미널](https://learn.chatgpt.com/docs/integrated-terminal)과 [Claude Code Desktop](https://code.claude.com/docs/en/desktop)은 로컬 앱 환경의 터미널 경로를 설명합니다.

Claude Code와 Codex CLI 모두 각자의 로컬 상태 명령으로 인증 정보 존재 또는 로그인 여부를 확인할 수 있어, 이 상태 확인 자체에는 모델 API 호출이나 별도 API 키가 필요하지 않습니다. 상태 명령은 모델 접근 권한을 검증하지 않습니다. Claude Code의 --safe-mode는 인증을 유지합니다. Codex app-server model/list는 계정과 클라이언트에서 사용할 수 있는 모델 및 effort를 반환합니다. 현재 app-server 명령은 실험적이므로 지원 버전과 프로토콜 호환성은 확인이 필요합니다.

계획 단계에서는 복합 설정의 단일 진실 원천과 두 설치 대상에 대한 리비전 적용·복구, 단일 설정과의 호환성, 위임 브리지의 실행 인터페이스, 프로세스 종료 후 상태 대조, 실제 모델·effort 적용 근거를 구체화합니다. Claude API 카탈로그가 수동 입력과 함께 제공될 때 그 목록을 CLI 구독 접근권한의 증거로 잘못 간주하지 않습니다. Claude 모델별 접근 여부를 설정 시점에 미리 열거하는 기능은 현재 범위에 포함되지 않습니다.

두 호스트 앱의 로컬 터미널 제공, 공식 CLI 인증, app-server model/list 또는 /v1/models 카탈로그만으로 ARC 위임의 실제 작업 권한·모델·effort 적용은 증명되지 않습니다. 위 인수 기준을 충족하지 못한 경로는 성공으로 보고하지 않고, 확인 불가 상태를 남기며 해당 경로의 출시는 보류합니다.

## Planner 자체 검토 (초안)

초안은 승인된 앱·CLI 범위, 현재 대화를 Orchestrator로 유지하는 구조, 단일 플랫폼 호환, API 키 없는 Claude 수동 입력, Codex 계정 기반 카탈로그 확인을 반영합니다. Codex app-server 목록도 런타임 성공 보증이 아니며, Claude API 카탈로그도 CLI 구독 계정의 권한 증거가 아님을 구분합니다. 인증을 저장하거나 플랫폼·모델을 자동 대체하지 않습니다. 출시 전 미확인 조건과 구현 세부사항은 증거 또는 계획 단계로 남겼습니다.

## Orchestrator 검토 및 수정

사용자 추가 요청에 따라 홈 TUI의 실제 설치 상태 라벨(`Avaliable`, `Not Avaliable`, `Incomplete`)을 확인한 뒤 CLI 로그인 상태를 그 표시와 구분해 반영합니다. 저장소의 현재 카탈로그 `ready`/`unavailable` 의미는 보존하고 새 플랫폼 상태와 혼용하지 않습니다. `Unauthorized`는 CLI가 명시적으로 로그아웃/미인증이라고 응답한 경우에만 사용합니다. 두 플랫폼 상태 명령과 오류 처리의 근거를 공식 CLI 레퍼런스에 대조했으며, 로그인 상태는 모델 접근이나 토큰의 실시간 유효성을 증명하지 않는다는 한계를 추가했습니다.
