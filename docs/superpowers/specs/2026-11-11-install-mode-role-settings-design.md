# ARC 설치 모드와 역할 설정 개편 설계

- 상태: 승인됨 (2026-11-11, 사용자 written-spec 승인. Global config 기본값 On 확정)
- 날짜: 2026-11-11
- 근거 기준: branch `feat/install-update-integration-screen`, HEAD `e33f1e3` (읽기 전용 조사)
- 승인된 설계: 2026-11-11 brainstorming 설계안. 모드 배타 설치(A1), `models.toml` v3(D1=a), 통합 활성 중 단독 선택 시 자동 전환(D2=a), 화면 변경 U-01~U-16 전체(D6)
- 함께 진행하는 문서: `2026-11-11-arc-watch-design.md` 개정 1(watch 출력). 코드 파일은 겹치지 않고 서로 의존하지 않는다. `README.md`, `docs/harness-operation.md`, `MANIFEST.sha256`은 두 설계가 함께 고치므로 같은 파일의 수정은 순서대로 진행한다.

## 1. 목적

사용자 요청 네 가지를 하나의 설계로 다룬다.
- Q1. `Claude & Codex`(통합) 모드로 설치해도 단독 모드 native profile(`~/.claude/agents/arc-implementer.md`, `~/.codex/agents/arc-*.toml` 등)이 남는다. 그래서 다른 플랫폼으로 가야 할 역할이 단독 profile로 호출된다. 이 세션에서도 통합 모드인데 Orchestrator가 native `arc-scouter`를 먼저 호출한 일이 실제로 있었다. 원인을 고치고 지시문도 보강한다.
- Q2. economy/balanced/smart 프리셋을 없앤다. `Install / Update`와 모델 변경 메뉴에서 Codex, Claude, Claude & Codex 중 무엇을 골라도 곧바로 역할별 설정 화면으로 들어간다.
- Q4. 통합 모드에서 역할마다 플랫폼을 두 플랫폼 중 자유롭게 고른다.
- Q7. Q2와 Q4를 반영한 뒤의 TUI 흐름에서 어색한 부분을 고치고, 문구를 간결하게 줄인다.

## 2. 목표, 비목표, 반목표

목표
- G1. 통합 모드에서는 각 플랫폼 홈의 `agents/`에 그 플랫폼으로 라우팅된 역할의 `arc-routing-*` profile만 있다. 단독 profile `arc-<role>`은 없다.
- G2. 단독 모드와 통합 모드를 양방향으로 전환할 수 있다. 전환 도중 실패해도 두 플랫폼 중 하나 이상이 쓸 수 없는 상태로 남지 않는다.
- G3. 통합 모드의 Orchestrator 지시문은 역할을 호출하기 전에 모드를 판별한다. 통합 모드에서는 단독 이름을 호출하지 않는다.
- G4. 프리셋 개념이 저장 형식(`models.toml`), 코드, 화면, 운영 문서에서 모두 사라진다. 저장 형식은 역할별 model/effort 한 벌이다.
- G5. 세 플랫폼 선택지 모두 다음 화면이 역할 편집기다. `Apply` 한 번으로 실행된다.
- G6. 통합 편집기에서 다섯 역할 모두 Codex와 Claude 중 하나를 고를 수 있다.
- G7. 화면 문구와 이동 규칙을 §10 표대로 정리한다.

비목표
- bridge 지원 게이트(G1/G2 sandbox, Desktop `environment_unverified`)와 라우팅 런타임 프로토콜(`routing-status`, `prepare-dispatch` 등)은 바꾸지 않는다.
- `lib/runtime/` 아래 모듈과 runtime payload(`RUNTIME_MODULE_PATHS`)는 바꾸지 않는다.
- 과거 spec과 plan 문서는 이력이므로 고치지 않는다.
- TUI 문구는 영어로 유지한다(README.md:46). 한국어화하지 않는다.
- CLI 플래그는 추가하지 않는다. 현재 공개 명령은 `arc`, `arc watch`, `arc --help`, `arc --version`뿐이다(`lib/cli/root.mjs:2`).

반목표 (기능은 돌아가도 실패로 보는 경우)
- ARC가 만든 것으로 확인되지 않은 파일을 지우거나 덮어쓰는 것.
- 전환이나 제거가 중간에 실패해서 어느 플랫폼도 `installed`가 아닌 상태로 남는 것.
- 기존 `preset = "balanced"` 같은 설치에서 업그레이드나 형식 변환만으로 실제 역할 model/effort 값이 바뀌는 것.
- 통합 모드에서 단독 profile이 다시 생기는 경로(업그레이드, 재설치, 모델 변경)가 남는 것.

## 3. 제약

- Node.js 22 이상, ESM. 새 dependency는 추가하지 않는다.
- `lib/runtime/`을 고치지 않는다. 구현 중에 고쳐야 할 필요가 확인되면 Orchestrator에 반환한다.
- 패키지에 들어가는 파일(`claude/`, `codex/`, `lib/`)을 바꾸면 `MANIFEST.sha256`을 다시 생성한다(`node scripts/update-manifest.mjs`). `npm run check:manifest`와 `npm run check:role-policy`가 통과해야 한다.
- 지시문 파일의 `[ARC role policy: contract begin]` … `[ARC role policy: contract end]` 구간은 생성물이므로 손으로 고치지 않는다(`coordination.md:102-111`).
- Claude와 Codex 지시문은 같은 내용을 담아야 한다. 차이는 플랫폼 고유 표기뿐이다.
- 소유권 원칙: ARC가 지우거나 덮어쓰는 파일은 경로·이름 규칙과 내용 식별(§6.3) 또는 해시 marker(`role-routing.mjs:41-69`)로 ARC 소유임을 확인한 것뿐이다.

## 4. 현재 동작 근거

- 단독 profile 이름: `arc-{scouter,planner,implementer,qa,reviewer}.{toml|md}`(`lib/installer/targets.mjs:7`). 설치 계획은 이 경로들을 managed path로 쓴다(`lib/installer/plan.mjs:63,67`).
- 통합 설치(`lib/management/operations.mjs:54-75`)
  - 먼저 두 플랫폼의 단독 설치 계획을 그대로 만들어 실행한다(:60-68, :84). 그래서 단독 profile이 써진다.
  - 그다음 `arc-routing-*`, marker, 활성 설정을 게시한다(:87). 단독 profile을 지우는 단계는 없다.
- 통합 모델 변경(`kind:'preset'`)은 설치된 단독 profile을 렌더링 재료로 읽는다. 단독 profile이 없으면 `Installed profile missing`으로 실패한다(`operations.mjs:69-72`).
- 통합 파일의 소유권
  - marker `arc-role-platform-routing.prepared.json`에 경로와 해시를 기록한다. 알 수 없는 파일은 덮어쓰지 않는다(`role-routing.mjs:47-57`).
  - 게시는 두 홈에 걸친 트랜잭션 하나이고 `remove:true` 스펙을 지원한다(:117-122).
  - 활성 bridge lease가 있으면 게시를 막는다(:92-98).
  - 제거 전 검증은 `inspectCompositeRemoval`이 한다(:77-89).
- "설치됨" 판정은 단독 profile 5개가 모두 있어야 한다. 해당 위치: `lib/management/status.mjs:12-15`, `lib/installer/upgrade-state.mjs:17,21`. 프리셋 변경(`lib/installer/preset.mjs:8-12`)도 단독 profile을 읽는다.
- 업그레이드는 설치된 모든 플랫폼을 단독 설치 계획으로 다시 설치한다(`lib/installer/upgrade.mjs:8-19`). 통합 모드에서도 단독 profile을 다시 쓴다.
- 제거
  - 단독 profile은 이름만 맞으면 제거한다(`lib/installer/uninstall.mjs:9-10`).
  - 통합 파일은 marker가 일치할 때만 제거하고, 아니면 residual로 보고한다(:19-21).
- 지시문
  - Claude `coordination.md:20`이 단독 이름(`arc-scouter` 등)을 먼저 보여 준다. 통합 이름은 :22에 있고, 통합 실행 절차는 문서 끝(:113-141)에 있다.
  - Codex 쪽은 `codex/skill/references/coordination.md:20`(Aliases `arc_scouter` 등), :22, :117 이하다.
  - `SKILL.md:12` Role gate에 `Planner (`arc-planner`)`가 고정 문자열로 있다. Codex `SKILL.md:12`도 같다.
- 단독 profile의 식별 표지
  - Claude: frontmatter `name: arc-<role>`(`claude/agents/arc-*.md:2`)와 `[ARC role policy: contract begin]` 줄.
  - Codex: `name = "arc_<role>"`(`codex/agents/arc-*.toml:1`)와 같은 contract 줄(:6).
- 모델 설정
  - `models.toml` v1/v2는 역할마다 `economy`, `balanced`, `smart` 세 벌과 선택적 `custom`, 그리고 `preset` 키를 둔다(`lib/models/config.mjs:31-67`, `codex/skill/models.toml`).
  - Python 소비자: `codex/skill/scripts/model_config.py:77-124`(Claude 판도 같음), `apply-models.py`. 운영 문서는 수동 편집 뒤 `apply-models` 검증 경로를 안내한다(`docs/harness-operation.md:190`).
- TUI
  - 플랫폼 선택: `lib/tui/setup.mjs:136`.
  - 단독 흐름: Settings, Performance preset, `Are you sure?` 확인, Custom 순서다(:137-172). 설치는 `Apply`를 두 번 눌러야 한다(:150-157, :171).
  - 통합 흐름: Performance preset을 거쳐 역할 메뉴로 간다. 역할 메뉴에서 `Platform — <Role>`을 고를 수 있다(:58-133).
  - `editCompositeCustomPreset`은 플랫폼을 고정한다(`lib/tui/custom-preset.mjs:167-193`).
  - 홈, Working, Result, Check Version, Uninstall 화면: `lib/tui/app.mjs:9,38,41-44,56-63,70`.
  - 키 안내: `lib/tui/render.mjs:9-13`.
  - Remove CLI 확인에서만 Esc가 Uninstall 메뉴로 간다(`escapeBack`, app.mjs:60).
- 라우팅 설정 스키마는 역할마다 플랫폼을 자유롭게 허용한다(`lib/runtime/role-routing-config.mjs:7-13`).

## 5. 접근안

| 안 | 내용 | 결정 |
|---|---|---|
| A1 | 모드 배타 설치. 통합 게시에서 단독 profile을 소유권 확인 후 제거한다. 설치됨 판정, 업그레이드, 모델 변경, 제거를 모드에 맞게 동작시킨다. 통합에서 단독으로 바꿀 때는 해제 트랜잭션으로 되돌린다. 지시문도 보강한다. | **채택**. 잘못된 이름을 호출하면 "없는 agent"로 즉시 실패하므로 재발을 원천 차단한다. |
| A2 | 단독 profile은 두고 지시문만 보강한다. | 기각. 이 세션에서 재발한 경로를 막지 못한다. |
| A3 | 단독 profile에 "통합 모드에서 사용 금지" 표시를 넣는다. | 기각. agent 목록이 계속 오염되고 오선택 여지가 남는다. |
| B1 | `models.toml` v3. 역할별 한 벌만 저장한다. v1/v2는 읽을 때 변환하고 다음 쓰기 때 v3로 저장한다. | **채택** |
| B2 | 저장 형식은 v2로 두고 화면에서만 프리셋을 없앤다. | 기각. 쓰지 않는 세 벌이 파일과 문서에 남아 "삭제" 요청과 어긋난다. |
| I1 | 지시문 보강은 정적 문구로 한다. 모드 판별 단계와 단독 이름 한정을 추가한다. | **채택** |
| I2 | 설치기가 전역 관리 블록(`CLAUDE.md`/`AGENTS.md`)에 모드를 기록한다. | 기각. 게시 트랜잭션에 전역 파일 쓰기가 늘어나는 데 비해 이득이 작다. 실제 차단은 profile 부재가 한다. |

## 6. 설치 모드 (Q1)

### 6.1 모드 판정

플랫폼 홈마다 다음 세 가지 중 하나로 판정한다. 판정은 읽기만 한다.
- `composite`: Codex 홈에 `arc-role-platform-routing.json`이 있고, 그 홈의 marker `arc-role-platform-routing.prepared.json`이 이 설정과 일치한다. 일치 조건은 `inspectCompositeRemoval`의 검증과 같다. 즉 revision, `configHash`, platform, `targetHome`, `activeConfigPath`, 그 플랫폼에 배정된 역할 집합, profile 해시가 모두 맞아야 한다.
- `standalone`: 그 홈에 marker도 `arc-routing-*` 파일도 없다. Codex 홈은 활성 설정 파일도 없어야 한다.
- `unverified`: 통합 관련 파일이 일부 있지만 위 검증을 통과하지 못한다.

설치 단위 모드는 두 홈의 판정을 합쳐 정한다.
- 두 홈이 모두 `composite`이면 통합 모드다.
- 두 홈이 모두 `standalone`이면 단독 모드다.
- 그 밖은 `unverified`다.

`unverified`에서는 다음과 같이 동작한다.
- 게시, 해제, 전환을 거부한다. 메시지는 `Claude & Codex configuration cannot be verified.`이고 의심 경로는 `Residual path:` 줄로 보여 준다.
- 설치됨 판정은 단독 규칙(§6.2)을 따른다.
- Everything 제거는 지금처럼 진행하고, 검증되지 않은 통합 파일은 residual로 남긴다.

### 6.2 설치됨 정의

- 단독 모드(그리고 `unverified`): 지금과 같다. `skills/arc`, 필수 파일(`SKILL.md`, `settings.toml`, `models.toml`, `limits.toml`), 단독 profile 5개가 모두 있어야 한다.
- 통합 모드: `skills/arc`와 필수 파일이 있고, marker에 기록된 `arc-routing-*`가 해시와 일치하면 `installed`다. 단독 profile은 요구하지 않는다.
- 통합 모드에서 단독 profile이 남아 있어도(이전 버전이 만든 혼재 상태) `installed`로 판정한다. 정리는 다음 게시 때 한다(§6.4).
- 이 정의는 `collectStatus`(`status.mjs`)와 `collectInstalledState`(`upgrade-state.mjs`)에 똑같이 적용한다. `stateToken` 계산에는 실제로 존재하는 경로만 포함한다.

### 6.3 단독 profile 소유권 확인

단독 profile 경로는 `<home>/agents/arc-<role>.md`(Claude)와 `<home>/agents/arc-<role>.toml`(Codex)이다. 다음을 모두 만족할 때만 ARC 소유로 보고 제거하거나 덮어쓴다.
- symlink가 아닌 일반 파일이다.
- 이름 줄이 정확히 하나 있다. Claude는 frontmatter 안의 `name: arc-<role>`, Codex는 `name = "arc_<role>"`이다(뒤에 주석이 붙어도 허용).
- 본문에 `[ARC role policy: contract begin]` 줄이 있다.

확인에 실패한 파일은 지우지도 덮어쓰지도 않는다. 결과에 `Residual path: <path>`로 보고하고, 그 파일 때문에 작업을 중단하지는 않는다. 사용자가 만든 같은 이름의 파일 때문에 통합 설정 전체가 막히지 않게 하려는 것이다.

### 6.4 단독에서 통합으로 (Claude & Codex 게시)

`Install / Update` 또는 `Change Models`에서 `Claude & Codex`를 고르고 `Apply`하면 다음 순서로 실행한다.

1. **설치 계획** (`Install`만): 두 플랫폼의 `skills/arc`와 전역 설정을 지금처럼 설치한다. 단독 profile 처리는 현재 모드에 따라 다르다.
   - 현재 단독 모드: 단독 profile도 새로 렌더링해서 쓴다. 이렇게 하면 2단계 게시가 실패해도 일관된 단독 설치가 남는다.
   - 현재 통합 모드: 설치 계획에 `profiles: 'omit'` 옵션을 준다. 단독 profile 경로를 쓰지 않고 managed path에서도 뺀다. 렌더링은 메모리에서 하고(`plan.generated.profiles`), 그 결과를 통합 profile의 재료로 쓴다.
2. **게시 트랜잭션**: 기존 게시(`publishCompositeFiles`)와 같은 lock, 활성 bridge 검사, runtime 일치 검사를 거친다. 스펙에는 다음을 넣는다.
   - 기존 항목: `arc-routing-*` 쓰기와 제거, 두 marker, 활성 설정.
   - 추가 항목: 두 홈의 단독 profile 중 §6.3을 통과한 파일의 제거(`remove:true`). 이 경로들은 준비 단계에서 snapshot에 넣는다.
   - 트랜잭션이 실패하면 롤백되어 단독 profile도 원래대로 돌아온다.
3. **`Change Models`의 경우**: 렌더링 재료를 설치된 단독 profile 대신 패키지 payload에서 얻는다. 설치 경로의 `renderModelAssets`와 같은 방식이고, 입력은 두 플랫폼의 설치된 `models.toml`과 `settings.toml` 언어다. 게시 시점에 "설치된 runtime과 policy가 현재 패키지와 같다"는 검사를 하므로(`role-routing.mjs:112`) payload 버전은 설치본과 일치한다.

이미 통합 모드인 설치를 다시 게시할 때도 같은 단계를 거친다. 남아 있던 단독 profile(혼재 상태)도 2단계에서 정리된다.

### 6.5 통합에서 단독으로 (자동 전환, D2=a)

**진입**
- 통합 모드에서 `Install / Update`나 `Change Models`의 `Codex` 또는 `Claude`를 고르면 먼저 전환 확인 화면(U-03)을 보여 준다.
  - `Continue`를 고르면 그 플랫폼의 단독 편집기로 간다.
  - `Back`이면 플랫폼 목록으로 돌아가고 아무것도 바꾸지 않는다.
- 실제 변경은 편집기에서 `Apply`할 때만 일어난다. 편집기에서 `Back`으로 나가도 아무것도 바뀌지 않는다.

**실행 순서**
1. **해제 트랜잭션** (`deactivateComposite`): 게시와 같은 routing lock과 활성 bridge 검사(`Active bridge dispatches: <ids>`)를 거친다. 트랜잭션 하나에 다음을 넣는다.
   - `inspectCompositeRemoval`로 두 홈에서 검증된 통합 파일(활성 설정, 두 marker, `arc-routing-*`)을 제거한다.
   - `skills/arc`가 있는 플랫폼마다 단독 profile 5개를 쓴다. 렌더링 재료는 payload와 그 플랫폼의 설치된 `models.toml`(활성 값)과 `settings.toml` 언어다.
   - 쓸 경로에 이미 파일이 있으면 §6.3을 통과할 때만 덮어쓴다. 통과하지 못하면 그 파일은 건너뛰고 residual로 보고한다.
   - 이 단계가 끝나면 두 플랫폼 모두 이전 설정 그대로의 정상 단독 설치가 된다.
2. **요청 작업**: 1단계가 끝난 뒤 X의 단독 작업(설치 또는 모델 변경)을 새로 준비해서 실행한다. 1단계 이전에 만든 계획은 snapshot이 맞지 않으므로 쓰지 않는다. 2단계가 실패해도 결과는 1단계의 일관된 단독 상태다.

**실패 처리**
- 1단계가 실패하면 롤백되고 통합 모드가 그대로 남는다. 2단계는 실행하지 않는다.
- lock 해제 실패나 cleanup 실패는 기존 게시와 같은 방식으로 `Residual path:`와 상태를 보고한다.

### 6.6 통합 모드에서의 제거

- `Uninstall`에서 `Codex` 또는 `Claude` 하나를 고르면 확인 화면에 통합 해제 안내 줄이 함께 나온다(U-14).
- `Remove`를 고르면 §6.5의 1단계를 실행하고, 그다음 X 제거 계획을 새로 준비해서 실행한다. 결과적으로 Y는 정상 단독 설치로 남는다.
- `Everything (incl. CLI)`는 지금과 같다. 두 플랫폼의 `skills/arc`, 단독 profile, 검증된 통합 파일, CLI를 제거한다. 검증되지 않은 통합 파일은 residual로 남긴다.

### 6.7 npm 업그레이드

- 통합 모드: `buildUpgradePlans`는 `profiles: 'omit'`로 `skills/arc`만 갱신한다. 단독 profile을 쓰지 않는다. 남아 있던 단독 profile도 건드리지 않는다(정리는 명시적 게시 때만).
- `arc-routing-*`의 갱신은 지금처럼 다음 `Install / Update`에서 한다. 그 전까지 라우팅은 `activation_unverified`로 보류된다(`coordination.md:141`).
- 단독 모드: 지금과 같다.

### 6.8 결과 문구

- 게시 성공: `Claude & Codex activated.`, `After upgrading ARC, run Install / Update again.`
- 해제를 포함한 작업 성공: 첫 줄이 `Claude & Codex turned off.`이고, 그 뒤에 기존 단독 결과 줄이 이어진다(예: `ARC installed for Codex.`).
- residual과 오류 줄은 기존 형식(`Residual path:`, `Error:`)을 따른다.

## 7. 지시문 보강 (Q1)

대상은 `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`다. `handoff.md`나 `planning.md`에 단독 native 이름이 조건 없이 적힌 곳이 있으면 그것도 대상에 포함한다.

- `coordination.md` Ownership 절의 "Orchestrator is depth 1 …" 단락 바로 뒤에 다음 절을 넣는다. 두 플랫폼 문구를 같게 한다.

  `### Execution mode`
  `Before the first specialist creation or assignment, check whether `arc-role-platform-routing.prepared.json` exists in the platform home that contains this skill (`../../arc-role-platform-routing.prepared.json` relative to this skill directory). If it exists, ARC runs in `Claude & Codex` mode: follow [Composite Platform Role Dispatch](#composite-platform-role-dispatch) for every role, starting with `routing-status`, and use only the profile or bridge it returns. Never invoke `arc-<role>` or `arc_<role>` names in this mode, even if they are listed. Otherwise use the standalone names below.`

- 단독 이름 표기를 단독 모드로 한정한다.
  - Claude `coordination.md:20`의 `Claude native names:`를 `Standalone native names:`로 바꾼다.
  - Codex `coordination.md:20`의 `Aliases:`를 `Standalone aliases:`로 바꾼다.
- `SKILL.md:12` Role gate에서 `Planner (`arc-planner`)`처럼 단독 이름을 직접 쓴 부분은 역할명(`Planner`)만 남긴다. Codex 판도 같다. `SKILL.md`의 다른 위치에 단독 이름이 조건 없이 있으면 같은 방식으로 고친다.
- 생성 구간(role policy contract)과 runtime 문서 계약(`routing-status` 등 절차 본문)은 바꾸지 않는다.

## 8. 모델 설정 v3 (Q2)

### 8.1 형식

```toml
# Canonical source for every role model and effort.
version = 3

[roles.arc_scouter]
model = "gpt-6-luna"
model_reasoning_effort = "high"
```

- Codex는 `model_reasoning_effort`, Claude는 `effort` 필드를 쓴다.
- 최상위 키는 `version`과 `roles`뿐이다. `roles`는 정확히 다섯 역할이고, 각 역할은 정확히 `model`과 effort 필드를 가진다.
- 값 검증은 지금의 `validateRoles` 규칙과 같다.
- 패키지 기본값(`codex/skill/models.toml`, `claude/skill/models.toml`)은 현행 `balanced` 값과 같다.

### 8.2 읽기와 쓰기

- 로더는 v1, v2, v3를 읽는다. v1/v2는 지금과 같은 검증을 거친 뒤 활성 값을 v3 역할 값으로 바꾼다.
  - `preset = "custom"`이면 `custom` 값을 쓴다.
  - 그 밖에는 `roles.<role>.<preset>` 값을 쓴다.
  - 설치된 파일의 값을 쓰므로 사용자가 손으로 고친 값도 그대로 보존된다.
- 쓰기는 v3로만 한다. 쓰는 시점은 설치, 모델 변경, npm 업그레이드다. 모델 변경에서는 값이 같아도 파일이 v1/v2면 v3로 다시 쓴다.
- JS API에서 `PRESETS`, `applyPreset`, `applyCustomRoles`, `presetRoleRows`를 없애고, 역할 한 벌을 다루는 API로 바꾼다. 이름과 시그니처는 builder 재량이다.
  - `resolveModelSettings(config)`는 지금처럼 `{platform, roles}`를 돌려준다.
  - 설치 계획(`buildInstallPlan`)과 모델 변경 계획(`buildPresetPlan`)은 `preset`, `customRoles`, `preservedCustomRoles` 대신 `roles`(선택 사항)를 받는다.
  - `roles`가 없으면 설치된 값을 쓰고, 설치된 값이 없으면 패키지 기본값을 쓴다.
- 편집기에서 온 `roles`는 정적 카탈로그로 검증한다(`assertCatalogRoles`). 업그레이드는 카탈로그 검증 없이 설치된 값을 그대로 쓴다.
- Python `model_config.py`와 `apply-models.py`(두 플랫폼)는 v3를 읽고 쓰며, v1/v2 읽기도 지원한다. 오류 메시지에서 "unified presets" 안내는 v3 기준으로 바꾼다.
- 내부 식별자 `kind:'preset'`, `buildPresetPlan`, `switchPresetTargets`는 그대로 둔다. 이름을 바꿀지는 builder 재량이다.

## 9. 역할 편집기 (Q2, Q4)

### 9.1 흐름

- **단독 (`Codex`, `Claude`)**
  - 플랫폼 선택(통합 모드면 U-03 다음) 뒤 곧바로 단독 편집기(U-04)로 간다.
  - 역할을 고르면 `Model — <Role>`, 이어서 `Effort — <Role>`로 간다.
  - `Install / Update`에서는 편집기에 `Settings` 행이 있다(U-05).
  - `Apply`는 검증 후 곧바로 실행한다. 프리셋 화면과 `Are you sure?` 확인은 없다.
- **통합 (`Claude & Codex`)**
  - 두 카탈로그를 불러온 뒤 통합 편집기(U-07)로 간다.
  - 역할을 고르면 `Platform — <Role>`(Codex, Claude), `Model — <Role>`, `Effort — <Role>` 순서로 간다.
  - 모델과 effort 목록은 고른 플랫폼의 카탈로그만 보여 준다.
  - `Install / Update`에서는 `Settings` 행이 있다(U-16).
  - 다섯 역할을 모두 한 플랫폼에 배정해도 허용한다.
  - 프리셋 화면, `Preset:` 행, `Use default role mapping` 행, 플랫폼을 고정하는 `editCompositeCustomPreset`은 없앤다.
- 호스트별 bridge 보류는 편집기에서 경고하지 않는다. 설정할 때는 호스트를 알 수 없기 때문이다. 실행 시점에 `routing-status`가 보고한다.

### 9.2 초깃값

| 편집기 | 초깃값 우선순위 |
|---|---|
| 단독 `Install / Update` | 세션 draft → 설치된 `models.toml` 활성 값(v1/v2면 변환값) → 패키지 기본값 |
| 단독 `Change Models` | 세션 draft → 설치된 활성 값 |
| 통합 편집기 | 세션 draft → 기존 통합 설정(`arc-role-platform-routing.json`) → 기본 매핑(Planner·Reviewer=Claude, 나머지=Codex)에 각 플랫폼의 설치된 활성 값 또는 패키지 기본값 |
| 통합에서 단독으로 전환 (U-03 다음) | X의 설치된 활성 값 |

세션 draft는 지금처럼 그 세션 안에서 유지하고, 실행에 성공하면 비운다.

### 9.3 Settings (단독 Install U-05, 통합 Install U-16)

- 항목: `Language`, `Total subagents`, `Concurrent subagents`, `Global config`.
- 값 해석, `concurrentExplicit`, 동시성 드리프트 오류는 현재 단독 설치와 같다(`plan.mjs:30-50`).
- `Global config: On`은 `skipGlobal: false`이고, 기본값은 On이다.
- 통합 Install의 Settings 값은 두 플랫폼 설치 계획에 똑같이 적용한다.
  - 초깃값: Codex가 설치되어 있으면 Codex의 기존 값, 아니면 Claude의 기존 값, 둘 다 없으면 `EN`, `100`, `5`, `On`.
  - 이 변경으로 기존 통합 설치에서 "이미 설치된 플랫폼은 전역 설정을 쓰지 않던" 동작(`operations.mjs:65`의 `skipGlobal:status.state!=='absent'`)이 화면에서 고른 값을 따르는 동작으로 바뀐다.

### 9.4 카탈로그와 검증

- 편집기에 들어갈 때 정적 카탈로그를 불러온다. 실패하면 U-09 페이지를 띄우고 플랫폼 목록으로 돌아간다.
- 카탈로그에 없는 값을 가진 역할은 ` !`로 표시한다. 그런 역할이 있으면 `Apply`할 때 U-09 선택 페이지를 띄우고 편집기에 머문다.
- 통합 `Apply`는 지금처럼 `validateRoleRoutingConfig`와 `assertCompositeCatalogRoles`로 검증한다. 실패하면 U-09 통합 페이지를 띄운다.

## 10. 화면 문구와 흐름 (Q7)

TUI 문자열은 아래 원문 그대로 쓴다. `<Role>`은 `Scouter`, `Planner`, `Implementer`, `QA`, `Reviewer`이고, `<n>`은 숫자다.

| ID | 화면 | 변경 전 | 변경 후 |
|---|---|---|---|
| U-01 | 홈 메뉴 | `Install / Update`, `Change Preset`, `Check Version`, `Uninstall`, `Exit` | `Install / Update`, `Change Models`, `Check Version`, `Uninstall`, `Exit` |
| U-02 | 홈 상태 줄 | `Claude: <state> / Codex: <state>` | 통합 모드이고 두 플랫폼 모두 `Available`이면 `Claude & Codex: Available`. 그 밖에는 변경 전과 같다. 진단 줄은 그대로 |
| U-03 | 전환 확인 (신규) | 없음 | 제목 `Switch to Codex` 또는 `Switch to Claude`. 안내 `Claude & Codex will be turned off.`. 행 `Continue`, `Back`(기본 선택 `Back`) |
| U-04 | 단독 편집기 | `Settings — codex` → `Performance preset`(`Economy`/`Balanced`/`Smart`/`Custom`) → `Are you sure?`/`Apply` → `Custom preset` | 제목 `Codex` 또는 `Claude`. 역할 다이어그램(현행 렌더링, 좁은 화면이면 요약 줄). 행 `Settings`(Install에서만), `Apply`, `Back` |
| U-05 | 단독 Settings | 제목 `Settings — codex`. 행 `Preset: …`, `Harness language: EN`, `Total subagents: <n>`, `Concurrent subagents: <n>`, `Apply global settings: true`, `Apply`, `Back` | 제목 `Settings — Codex` 또는 `Settings — Claude`. 행 `Language: EN`(또는 `KR`), `Total subagents: <n>`, `Concurrent subagents: <n>`, `Global config: On`(또는 `Off`, Enter로 전환), `Back` |
| U-06 | 하위 입력 | `Harness output language`, `Maximum total subagents`, `Maximum concurrent subagents`, 페이지 `Invalid limit`의 `Enter a positive safe ASCII decimal integer.` | `Language`(행 `EN`, `KR`, `Back`), `Total subagents`, `Concurrent subagents`, 페이지 `Invalid limit`의 `Enter a positive whole number.` |
| U-07 | 통합 편집기 | `Performance preset` 화면. 역할 메뉴의 `Preset: …`, `Use default role mapping` | 제목 `Claude & Codex`. 역할 다이어그램(플랫폼 표시 포함). 행 `Settings`(Install에서만, U-16), `Apply`, `Back` |
| U-08 | 역할 단계 | `Platform — <Role>`, `Select model — <Role>`, `Select effort — <Role>` | `Platform — <Role>`(행 `Codex`, `Claude`, `Back`; 통합만), `Model — <Role>`, `Effort — <Role>`. `Unavailable models` 행과 페이지는 유지 |
| U-09 | 오류 페이지 | `Catalog unavailable`(`<P> model catalog could not be loaded.` 외 한 줄), `Custom preset unavailable`(`Select an available model and effort for each role.`), `Composite settings unavailable` | `Catalog unavailable`: `Codex model catalog is missing or invalid.`(또는 `Claude …`) 한 줄. `Unavailable selection`: `Choose an available model for roles marked !.`. `Claude & Codex unavailable`: 오류 메시지 |
| U-10 | Working | 제목 `Working`, 본문 `Operation in progress. Please wait.` | 제목 `Working`, 본문 없음. 키 안내는 그대로 |
| U-11 | Result | 항상 `Exit code: <n>`. 통합: `Composite configuration activated.`, `Role execution: per-role status via routing-status.`, `After an ARC upgrade that changes the cooperative runtime version (now …), run Install / Update again to refresh installed markers.` | `Exit code: <n>`은 n≠0일 때만. 통합: `Claude & Codex activated.`, `After upgrading ARC, run Install / Update again.`. 전환 포함: 첫 줄 `Claude & Codex turned off.` |
| U-12 | Check Version | 업그레이드할 수 있으면 `Upgrade`만 표시하고 버전 정보 없음 | 업그레이드 가능: 안내 `<current> → <latest>`, 행 `Upgrade`, `Back`. 최신 상태: 안내 `Up to date (<current>)`, 행 `Back`. 최신 버전 조회 실패: 안내 `Current version: <current>`, `Latest version: Unavailable`, 오류 메시지, 행 `Back` |
| U-13 | Uninstall 메뉴 | `Uninstall`(`Settings`, `Remove CLI`) → `Uninstall settings`(`Codex`, `Claude`) | 제목 `Uninstall`. 행 `Codex`, `Claude`, `Everything (incl. CLI)`, `Back` |
| U-14 | Uninstall 확인 | 제목 `Uninstall settings` / `Remove CLI`. 안내 `Remove ARC settings for Codex?` / `Removes ARC settings for Codex and Claude, then removes the ARC CLI.`. 행 `Continue`, `Back` | 제목 `Uninstall`. 안내 `Remove ARC from Codex?` / `Remove ARC from Claude?` / `Remove ARC from Codex and Claude, and the arc CLI?`. 통합 모드에서 한 플랫폼을 고르면 둘째 줄 `Claude & Codex will be turned off.`. 행 `Remove`, `Back`(기본 선택 `Back`). `Back`은 Uninstall 메뉴로 |
| U-15 | 키 규칙 | Remove CLI 확인에서만 Esc가 Uninstall 메뉴로 간다. 프리셋 화면의 Back 목적지가 진입 경로마다 다르다 | 모든 메뉴에서 `Back`은 직전 화면, Esc는 홈(홈에서는 종료)이다. 페이지 화면은 지금처럼 Enter로 닫는다. `escapeBack` 예외를 없앤다. Model 화면의 `Back`은 통합이면 Platform으로, 단독이면 편집기로 간다. Effort 화면의 `Back`은 Model로 간다 |
| U-16 | 통합 Install Settings | 없음(통합 설치에서 언어, 한도, 전역 설정을 고를 수 없음) | 제목 `Settings — Claude & Codex`. 행은 U-05와 같다. 값은 두 플랫폼에 적용한다(§9.3) |

변경 후 흐름:
```
ARC ─ Install / Update ─ Codex|Claude ─(통합 모드면 U-03)─ 편집기[역할 · Settings · Apply] ─ Working ─ Result
    │                   └ Claude & Codex ─ 편집기[역할→Platform→Model→Effort · Settings · Apply] ─ Working ─ Result
    ├ Change Models ─ 위와 같음(Settings 행 없음)
    ├ Check Version ─ <current> → <latest> · Upgrade/Back ─ Working ─ Result
    └ Uninstall ─ Codex|Claude|Everything (incl. CLI) ─ 확인[Remove/Back] ─ Working ─ Result
```

## 11. 마이그레이션과 호환

- **기존 v1/v2 설치** (예: `preset = "balanced"`)
  - 읽기는 무손실이다. 활성 값이 그대로 v3 값이 된다.
  - 다음 설치, 모델 변경, npm 업그레이드에서 v3로 저장된다. 실제 model/effort 값은 바뀌지 않는다.
  - 쓰지 않던 나머지 두 벌과 활성이 아니던 `custom` 값은 버린다.
- **v3를 모르는 예전 설치본의 Python 스크립트**: 수동 `apply-models.py` 경로(`docs/harness-operation.md:190`)에만 영향이 있다. npm 업그레이드는 스크립트와 `models.toml`을 함께 갱신한다.
- **통합과 단독이 섞인 기존 설치** (관측: `~/.claude/agents`에 `arc-{implementer,planner,qa,reviewer,scouter}.md`와 `arc-routing-{planner,reviewer}.md`, `~/.codex/agents`에 `arc-*.toml`과 `arc-routing-{implementer,qa,scouter}.toml`)
  - 정리 전에도 설치됨으로 판정된다.
  - `Install / Update → Claude & Codex` 또는 `Change Models → Claude & Codex`를 한 번 실행하면 정리된다.
  - 이미 실행 중인 세션은 예전 agent 목록을 계속 쓴다. 새 세션에서 반영된다(기존 `coordination.md` 문구).
- **패키지와 설치본 버전이 다른 상태에서 해제(§6.5)할 때**: 복원하는 단독 profile은 현재 패키지 payload로 렌더링한다. 요청 작업(2단계)이 X를 갱신한다. Y의 `skills/arc`는 다음 설치나 업그레이드까지 이전 버전으로 남는다.
- **기존 통합 설정 파일**(`arc-role-platform-routing.json`, marker)의 형식은 바뀌지 않는다.

## 12. 위험

- R1. **사용자 파일 삭제**: §6.3 식별 확인을 통과한 파일만 트랜잭션 안에서 지운다. 실패하면 롤백되고, 확인에 실패한 파일은 남기고 보고한다.
- R2. **전환 부분 실패**: 해제 트랜잭션이 끝나는 시점에 두 플랫폼이 일관된 단독 상태가 되도록 순서를 정했다. 남는 경우는 lock 해제 실패와 cleanup 실패이며, 기존 residual 보고를 재사용한다.
- R3. **설치됨 판정 누락**: `status`, `upgrade-state`, `upgrade`, `preset`, `uninstall` 중 한 곳이라도 모드를 반영하지 않으면 통합 사용자가 `Incomplete`로 보이거나 단독 profile이 다시 생긴다. §14의 시나리오 QA로 확인한다.
- R4. **프리셋 문자열을 가진 테스트와 fixture가 약 30개다**(Scouter R2 목록). 동작과 무관한 fixture 수정이 많아 리뷰 부담이 크다.
- R5. **U-16 기본값 `Global config: On` 때문에** 기존 통합 사용자가 재설치할 때, 전에는 건너뛰던 전역 설정 쓰기와 동시성 드리프트 오류가 나타날 수 있다. 단독 설치와 같은 규칙이고, 화면에서 `Off`로 바꿀 수 있다.
- R6. **지시문 보강은 프롬프트 수준이다.** 실제 차단은 통합 모드에서 단독 profile이 없다는 사실이 한다.

## 13. 수용 기준

설치 모드
- **AC-M01**: 통합 게시가 성공하면 두 홈의 `agents/`에 단독 profile이 없다. 각 홈에는 그 플랫폼으로 배정된 역할의 `arc-routing-*`만 있다. 배정된 역할이 없는 플랫폼에는 ARC profile이 없다.
- **AC-M02**: 게시 트랜잭션이 실패하면(fault hook) 단독 profile, `arc-routing-*`, marker, 활성 설정이 실행 전과 바이트 단위로 같다.
- **AC-M03**: §6.3 확인에 실패한 단독 profile(이름 불일치, contract 줄 없음, symlink)은 지워지지도 덮어써지지도 않고 결과에 `Residual path:`로 나온다. 게시와 해제는 계속 진행된다.
- **AC-M04**: 통합 모드에서 단독 profile이 없어도 `collectStatus`는 두 플랫폼을 `installed`로, `collectInstalledState`는 정상으로 판정한다. 혼재 상태도 `installed`다.
- **AC-M05**: §6.1의 `unverified` 상태에서는 게시, 해제, 전환이 거부되고 파일이 바뀌지 않는다.
- **AC-M06**: 통합 모드의 npm 업그레이드는 단독 profile을 만들지 않고, 남아 있던 단독 profile도 바꾸지 않는다.
- **AC-M07**: 단독 profile이 없는 통합 설치에서 `Change Models → Claude & Codex`가 성공한다.
- **AC-M08**: 통합 모드에서 단독 X를 고르면 U-03이 나온다.
  - `Back`이나 편집기 이탈: 파일이 바뀌지 않는다.
  - `Continue` 후 `Apply`: 통합 파일이 제거되고, `skills/arc`가 있는 두 플랫폼 모두 단독 profile 5개를 가진 `installed` 상태가 된다. 그 위에 X 작업이 적용된다.
- **AC-M09**: 해제 뒤 X 작업이 실패해도 두 플랫폼은 단독 `installed` 상태다.
- **AC-M10**: 통합 모드에서 `Uninstall → Codex`(또는 Claude)를 하면 통합 해제와 X 제거가 이루어지고, Y는 단독 `installed`로 남는다. `Everything (incl. CLI)`는 현행 동작과 같다.
- **AC-M11**: 활성 bridge lease가 있으면 게시와 해제가 거부되고 `Active bridge dispatches: <ids>`가 나오며 파일이 바뀌지 않는다.
- **AC-M12**: 관측된 혼재 상태를 재현한 fixture에서 통합 게시를 한 번 하면 단독 profile이 정리된다.

지시문
- **AC-I01**: 두 `coordination.md`에 §7의 `Execution mode` 절이 Ownership 단락 바로 뒤에 있고, 두 문구가 같다.
- **AC-I02**: 단독 이름 표기가 `Standalone native names:` / `Standalone aliases:`로 한정되어 있고, 두 `SKILL.md`에 단독 native 이름이 조건 없이 남아 있지 않다.
- **AC-I03**: role policy 생성 구간은 바뀌지 않았고 `check:role-policy`와 `check:manifest`가 통과한다.

모델 설정
- **AC-P01**: 쓰는 `models.toml`은 항상 §8.1 v3 형식이고 `preset` 키가 없다.
- **AC-P02**: v1/v2 fixture(`economy`, `balanced`, `smart`, `custom` 각각)를 읽은 활성 값이 변환된 v3 값과 같다. 업그레이드 뒤 profile의 model/effort도 변하지 않는다.
- **AC-P03**: 패키지 기본 `models.toml` 값이 변경 전 `balanced` 값과 같고, 모든 기본값이 정적 카탈로그에 있다.
- **AC-P04**: Python `model_config.py`와 `apply-models.py`가 v3와 v1/v2를 읽고, v3를 쓴다.
- **AC-P05**: TUI 어디에도 `Economy`, `Balanced`, `Smart`, `Custom preset`, `Performance preset`, `Preset:`이 나오지 않는다. 코드에 `PRESETS` 상수가 없다.

편집기
- **AC-R01**: 세 플랫폼 선택지 모두 다음 화면이 편집기다(통합 모드의 단독 선택은 U-03 다음). `Apply` 한 번으로 실행된다.
- **AC-R02**: 통합 편집기에서 다섯 역할 모두 `Codex`와 `Claude`를 고를 수 있다. 모델과 effort 목록은 고른 플랫폼 카탈로그의 값뿐이다.
- **AC-R03**: 다섯 역할을 모두 한 플랫폼에 배정한 설정이 게시된다.
- **AC-R04**: 편집기 초깃값이 §9.2 표를 따른다.
- **AC-R05**: 카탈로그에 없는 값은 ` !`로 표시되고 `Apply`가 U-09 페이지로 막힌다. 카탈로그를 불러오지 못하면 U-09 후 플랫폼 목록으로 돌아간다.
- **AC-R06**: 단독 Install과 통합 Install의 Settings 값이 설치 계획에 반영된다. 통합은 두 플랫폼 모두에 반영된다.

화면
- **AC-U01~AC-U16**: §10 표의 각 항목이 원문 문구와 흐름대로 동작한다.

## 14. 검증 방법

- **단위·통합 테스트**: 임시 홈 fixture를 쓴다.
  - 기존 파일: `tests/node/role-routing-install.test.mjs`, `management-operations.test.mjs`, `management-status.test.mjs`, `upgrade-harness.test.mjs`, `transaction*.test.mjs`, `models.test.mjs`, `preset.test.mjs`, `preset-cli.test.mjs`, `profile-render.test.mjs`, `tui-setup.test.mjs`, `tui-app.test.mjs`, `tui-app-pty.test.mjs`
  - 새 시나리오 테스트(파일 이름은 builder 재량)
  - Python 테스트: `tests/test_codex_models.py`, `tests/test_claude_payload.py`
- **AC-M 시나리오는 실행 전후의 파일 목록과 해시로 판정한다.**
  - 대상 시나리오: 단독→통합, 통합 재게시, 통합→단독(Codex, Claude 각각), 통합 중 단일 Uninstall, Everything 제거, 식별 실패 파일, 게시와 해제 fault 롤백, 활성 bridge 차단, 통합 업그레이드, 혼재 상태 정리, `unverified` 거부
- **화면은 TUI 단위 테스트와 PTY 테스트로 문구와 이동을 확인한다.**
- **전체 판정은 기준선 비교 규칙을 따른다.** 명령은 `node --test --test-timeout=120000 tests/node/*.test.mjs`이고, HEAD `e33f1e3` 기준선 대비 새 실패가 없어야 한다. `tests/node/tui-setup.test.mjs`가 시간 제한 없이 멈춘 이력이 있으므로 timeout을 붙인다.
- **패키지 검사**: `npm run check:manifest`, `npm run check:role-policy`.

## 15. 문서 영향과 대체 관계

- `README.md`: `Change Preset` 설명(:31)과 프리셋 문구(:46)를 `Change Models`와 역할별 설정 기준으로 고친다. 통합 모드에서는 단독 profile이 없다는 점도 적는다.
- `docs/harness-operation.md`
  - :22 "economy/balanced/smart variants" 문장을 v3 형식 기준으로 고친다.
  - :50 홈 메뉴와 흐름 설명을 §10 기준으로 고친다.
  - :190 수동 편집 안내를 v3 기준으로 고친다.
  - 모드 전환 동작(§6.5, §6.6)을 짧게 추가한다.
- 대체 관계: 이 문서는 다음 문서의 해당 부분을 대체한다. 과거 문서 자체는 이력이므로 고치지 않는다.
  - `2026-10-29-custom-preset-catalog.md`의 built-in preset과 Custom 공존 요구(:70, :78)
  - `2026-10-23-arc-tui-design.md`, `2026-11-08-tui-preset-version-flow-design.md`, `2026-11-08-tui-overall-flow-design.md`의 프리셋 화면과 Check Version, Uninstall 흐름
  - `2026-10-16-arc-cli-models-install-lifecycle-design.md`의 preset 형식
  - `2026-11-08-role-platform-routing-design.md`, `2026-11-10-composite-role-execution-design.md`의 "통합 설치가 단독 설치를 함께 유지한다"는 암묵적 동작

## 16. builder 재량

- 모델 설정 API의 이름과 시그니처, 모드 판정 함수의 위치와 이름, 해제 트랜잭션을 `role-routing.mjs` 안에 둘지 나눌지.
- 편집기 다이어그램의 세부 배치. 현행 `presetPreviewRows` 렌더링과 크기 안내 문구는 그대로 쓰되 함수 이름은 바꿔도 된다.
- 내부 식별자(`kind:'preset'` 등)의 이름 변경 여부.
- 테스트 파일을 나누는 방식과 fixture 구성.
