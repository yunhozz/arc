# 정적 모델 카탈로그와 혼합 Custom 프리셋 명세

상태: 사용자 승인 (2026-11-09)  
작성일: 2026-11-09  
작업 저장소: `/Users/yunho/Desktop/project/arc`

## 목표와 범위

`Claude & Codex`의 프리셋 선택 화면에 `Economy`, `Balanced`, `Smart`, `Custom`을 표시한다. `Custom`을 선택하면 현재 역할별 플랫폼을 유지한 `Custom preset` 편집 화면을 열어 역할별 모델과 effort를 설정한다.

Codex와 Claude의 모델 및 effort 조합은 ARC 패키지에 포함된 정적 JSON 카탈로그에서 읽는다. 모델 목록 표시를 위해 Anthropic 모델 API 자격 증명을 요구하지 않으며, 모델 목록 표시, Custom 편집, 복합 설정 준비 및 게시 직전 검증은 이 카탈로그만 사용한다. Anthropic 모델 API 또는 Codex app-server `model/list`를 호출하지 않는다. Codex·Claude CLI의 기존 인증 상태 확인은 유지한다. 카탈로그는 공식 문서에서 확인한 ARC 선택 후보를 정하며 계정별·플랜별·공급자별 접근 권한이나 CLI 피커에 노출될 것을 보장하지 않는다. 현재 역할 실행 경로는 모델·effort 검증 근거가 없어 held/unverified 상태이며 이 작업에서 실행 상태를 바꾸지 않는다.

양 플랫폼의 모델 수동 입력 기능과 화면을 제거한다. 설정 스키마, 설치 대상 상태 검사, 파일 변경 검사, 설치·게시 순서는 유지한다.

## 기존 계약과의 관계

이 명세는 [역할별 플랫폼 라우팅 명세](2026-11-08-role-platform-routing-design.md)의 §2.3–2.4와 [구현 계획](../plans/2026-11-08-role-platform-routing.md)의 T1 중 동적 모델 목록 조회 및 Claude 수동 입력 계약을 이 작업 범위에서 대체한다. 이전 문서는 당시 승인과 수용 이력으로 보존하며 수정하지 않는다.

## 정적 카탈로그

플랫폼별 카탈로그 경로는 다음과 같다.

- `lib/models/codex-models.json`
- `lib/models/claude-models.json`

각 파일은 `{ "platform": "codex|claude", "pairs": [{ "model": "...", "effort": "..." }] }` 구조를 사용한다. `platform` 값은 파일의 플랫폼과 일치해야 한다. `pairs`는 비어 있지 않아야 하며 동일한 모델·effort 조합의 중복을 허용하지 않는다. 모델 및 effort 값은 기존 플랫폼별 값 형식을 따라야 한다.

모델 메뉴는 파일의 순서를 유지해 모델 이름을 중복 없이 표시한다. 모델을 선택하면 같은 카탈로그에서 해당 모델과 연결된 effort만 표시한다. 적용 검증은 모델과 effort가 카탈로그의 정확한 한 쌍인지 확인한다.

초기 목록은 공식 문서에서 2026-11-09 현재 확인되는 Codex 모델과 해당 모델의 OpenAI API effort 사양, Claude Code의 현재 모델별 effort 표 및 Anthropic 모델 ID를 기준으로 만든다. 기존 `codex/skill/models.toml`과 `claude/skill/models.toml`의 `Economy`, `Balanced`, `Smart` 조합은 모두 포함해야 한다.

### Codex 후보

다음 모델은 OpenAI 제품 문서에서 ChatGPT Work와 Codex에서 제공되는 모델로 확인된다. GPT-5.6은 제품과 플랜에 따라 Codex에서 제공되는 변형이 다르고, GPT-6 계열도 플랜·워크스페이스·롤아웃에 따라 달라진다. 표의 effort는 각 모델의 공개 API 사양에서 확인한 값이며, 개별 계정의 Codex CLI 피커 응답을 뜻하지 않는다. Codex app-server `model/list`가 번들 또는 캐시 카탈로그를 반환할 수 있고, 그 목록 자체는 계정 접근 권한 확인이 아니라는 점을 제품 문서가 명시한다. [ChatGPT Work 및 Codex 모델](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex), [GPT-5.6 제품별 제공 범위](https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt), [Codex app-server 목록과 접근 확인](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)

| 모델 | 카탈로그 effort | 쌍 수 | 공식 모델 사양 |
|---|---|---:|---|
| `gpt-6-astra` | `low`, `medium`, `high`, `xhigh`, `max` | 5 | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) |
| `gpt-6.1-sol` | `low`, `medium`, `high`, `xhigh`, `max` | 5 | [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| `gpt-6.1-terra` | `none`, `low`, `medium`, `high`, `xhigh`, `max` | 6 | [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) |
| `gpt-6-sol` | `none`, `low`, `medium`, `high`, `xhigh`, `max` | 6 | [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol) |
| `gpt-6-luna` | `none`, `low`, `medium`, `high`, `xhigh`, `max` | 6 | [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) |
| `gpt-5.6-sol` | `none`, `low`, `medium`, `high`, `xhigh`, `max` | 6 | [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) |
| `gpt-5.6-terra` | `none`, `low`, `medium`, `high`, `xhigh`, `max` | 6 | [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) |
| `gpt-5.6-luna` | `none`, `low`, `medium`, `high`, `xhigh`, `max` | 6 | [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) |
| 합계 | **8개 모델** | **46** | |

Codex CLI는 계정별 모델 카탈로그에서 추가 effort를 제공할 수 있으나, 이 작업은 계정별 `model/list`를 조회하지 않으므로 이를 추정해 넣지 않는다. Codex의 `ultra`는 일반 API reasoning effort와 다른 별도 선택자이며, Codex 프로토콜은 이를 선택했을 때 multi-agent 작업용 effort를 사용한다고 정의한다. ARC 역할 카탈로그는 이미 상위 Orchestrator가 역할 위임을 관리하므로, 역할별 모델 실행이 추가 위임을 일으킬 수 있는 `ultra`는 범위에서 제외한다. [Codex 프로토콜의 Ultra 설명](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/openai_models.rs). GPT-5.5는 2026-10-14부터 ChatGPT Work와 Codex에서 퇴역했고, 이 변경은 API 키 사용에는 적용되지 않으므로 이번 계정 유형 비구분 Codex 목록에서 제외한다. [GPT-5.5 퇴역과 GPT-6.1 Terra 출시](https://help.openai.com/en/articles/9624314-model-release-notes)

### Claude Code 후보

아래 모델별 effort는 Claude Code 공식 표를 따른다. Anthropic 모델 문서는 모델 ID 및 수명 주기의 근거다. Claude Code 별칭은 표에서 정한 선택 문자열로 고정되지만 실제 모델 해석은 Claude Code 버전, 공급자와 조직 설정에 따라 달라질 수 있다. Fable 5.1은 Claude Code v2.1.257 이상이 필요하다. [Claude Code 모델 및 effort](https://code.claude.com/docs/en/model-config), [Anthropic 모델 overview](https://platform.claude.com/docs/en/models/overview), [Anthropic 모델 수명 주기](https://platform.claude.com/docs/en/about-claude/model-deprecations)

| 유형 | 모델 이름 | effort | 쌍 수 |
|---|---|---|---:|
| 제품 별칭 | `fable`, `opus`, `sonnet`, `haiku` | `low`, `medium`, `high`, `xhigh`, `max` | 20 |
| 버전 지정 ID | `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5-5`, `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-sonnet-5-5`, `claude-sonnet-5`, `claude-haiku-5-5` | `low`, `medium`, `high`, `xhigh`, `max` | 45 |
| 버전 지정 ID | `claude-opus-4-6`, `claude-sonnet-4-6` | `low`, `medium`, `high`, `max` | 8 |
| 합계 | **15개 모델 이름** | | **73** |

별칭은 Anthropic API에서는 현재 Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5를 가리킨다. 다른 공급자에 연결하면 이전 모델이나 별도 배포 ID로 해석될 수 있다. `best`는 계정별로 Fable 또는 Opus 계열을 선택하고, `default`는 기본 모델 설정을 복원하며, `opusplan`은 계획 및 실행에 서로 다른 모델을 사용한다. 이들은 단일 고정 모델 선택이 아니므로 카탈로그에서 제외한다. API 모델 상태가 active이더라도 Claude Code effort 표에 없는 Opus 4.5, Haiku 4.5 및 Mythos 계열은 모델·effort 조합을 증거로 만들 수 없어 제외한다.

두 표는 기본 프리셋 조합을 모두 포함한다. Codex의 기존 프리셋 값은 `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra` 각각의 표에 포함된다. Claude의 기존 프리셋 alias인 `haiku`, `sonnet`, `opus`와 기존 effort 값도 표에 포함된다. 고정 카탈로그는 선택 가능 후보이고, Codex CLI 모델 카탈로그가 계정별로 다를 수 있다는 점과 Claude 공급자별 alias 차이를 대체하거나 확인하지 않는다.

새 조합은 해당 JSON과 패키지 무결성 매니페스트를 함께 갱신해 추가한다. `lib/`는 이미 npm 패키지 파일 범위에 포함되어 있으므로 별도의 패키지 경로 선언은 필요하지 않다.

## 화면 동작

### 단일 플랫폼 모델 선택

단일 플랫폼의 모델 및 Custom preset 화면은 해당 플랫폼 JSON에서 모델과 effort를 선택한다. 모델별로 등록된 effort 외의 값은 표시하지 않는다. 직접 입력 화면은 제공하지 않는다. 역할별 `Select model` 창에는 `Static candidates`, `Current model`, `Current effort` 안내 행을 표시하지 않고, 현재 선택 후보의 모델 및 effort 상세만 표시한다.

### 혼합 프리셋

`Install / Update`와 `Change Preset`에서 `Claude & Codex`를 선택하면 먼저 단일 플랫폼과 같은 `Performance preset` 선택 화면을 연다. 이 화면은 `Economy`, `Balanced`, `Smart`, `Custom`을 이 순서로 표시하고, 기본 프리셋 미리보기는 역할별 현재 플랫폼의 값을 사용한다. 기본 프리셋 선택은 복합 역할 편집 초안을 갱신한 뒤 역할 화면으로 이동한다. `Custom`은 `Custom preset` 역할 다이어그램을 열고, 내부 Apply 후 역할 화면으로 이동한다. 역할 화면의 바깥 Apply에서만 저장 준비를 시작한다.

기본 프리셋 미리보기와 선택은 현재 각 역할의 플랫폼을 유지하고 해당 플랫폼의 기본 프리셋 모델·effort를 사용한다. `Custom` 미리보기는 현재 역할 배정을 보여 준다. 혼합 화면에서 역할을 직접 편집할 때는 해당 플랫폼 JSON의 모델·effort 조합만 선택할 수 있다. Claude의 `Enter model manually` 및 `Claude model identifier` 입력 화면은 제거한다.

### 혼합 Custom 편집

`Custom`을 선택하면 현재 다섯 역할의 배정을 복사해 `Custom preset` 화면을 연다. 화면은 각 역할의 플랫폼, 모델, effort를 표시한다. 역할의 모델과 effort를 편집할 때 그 역할의 현재 플랫폼 JSON만 사용한다. 내부 Apply 후 역할 편집 화면에서 플랫폼을 변경할 수 있다.

Custom 편집 화면의 `Apply`는 모든 역할 조합을 검증하고 성공하면 혼합 화면의 초안만 갱신하며 `Preset: Custom`으로 표시한다. `Back`은 편집 화면의 변경을 버린다. 설정 파일 반영은 바깥 `Claude & Codex` 화면의 `Apply`에서 시작한다.

Custom 상태에서 `Use default role mapping`을 선택하면 플랫폼이 그대로인 역할은 Custom 모델·effort를 유지한다. 플랫폼이 바뀌는 역할은 이번 세션에서 마지막으로 선택한 기본 프리셋의 새 플랫폼 값을 사용하고, 기본 프리셋 선택 이력이 없으면 `Balanced` 값을 사용한다.

## 기존 설정과 실패 처리

저장된 역할의 모델·effort가 정적 카탈로그에 없으면 현재 값을 읽고 화면에 표시하며 해당 역할을 다시 선택해야 한다는 표시를 붙인다. 사용자는 문제 역할을 편집할 수 있다. 목록 밖 조합이 남아 있는 동안 단일 플랫폼 Custom, 혼합 Custom 및 새 혼합 설정의 `Apply`는 차단한다. 유효한 값을 선택해 적용하기 전까지 저장된 기존 값은 변경하지 않는다.

정적 JSON이 없거나 잘못됐으면 해당 플랫폼을 식별하는 오류를 표시하고 관련 편집값 적용을 중단한다. 복합 설정의 준비, 설치 등 쓰기 시작 전, 설정 게시 전 검증은 두 JSON의 같은 조합을 사용한다. 검증에 실패하면 활성 리비전을 게시하지 않고 기존 설치·작업 결과 보고 규칙을 유지한다. 대체 플랫폼이나 모델을 자동 선택하지 않는다.

## 수용 기준

| ID | 기준 | 검증 근거 |
|---|---|---|
| C1 | 두 진입점에서 `Claude & Codex`를 선택하면 먼저 `Performance preset` 화면이 열리고 네 선택지를 지정된 순서로 표시한다. 기본 프리셋은 역할 편집으로, `Custom`은 `Custom preset` 다이어그램으로 이동한다. | TUI 메뉴 구성 및 분기 소스 대조 |
| C2 | 기본 프리셋은 현재 역할 플랫폼을 유지한다. Custom 편집의 `Back`은 변경을 버리고, 내부 `Apply`는 초안만 갱신하며, 바깥 `Apply`에서만 저장 작업을 준비한다. | 역할 상태 복사·취소·적용 및 저장 호출 위치 대조 |
| C3 | Codex 8개 모델 46쌍, Claude 15개 모델 이름 73쌍이 표 및 공식 근거와 일치하며 기본 프리셋 조합 전체를 포함한다. `none`은 명시된 여섯 Codex 모델에만 표시된다. 모든 선택 메뉴가 모델별 effort를 제한하며 양 플랫폼에 모델 수동 입력 화면이 없다. | JSON과 `models.toml`, 공식 모델 문서, 메뉴 생성 및 입력 분기 대조 |
| C4 | 목록 표시부터 혼합 설정 게시 전까지 Anthropic 모델 API와 Codex `model/list` 호출 경로가 없다. 준비·쓰기 전·게시 전 검증이 두 정적 JSON을 사용한다. | 메뉴부터 `prepareCompositeOperation` 및 `executeCompositeOperation`까지 호출 경로 대조 |
| C5 | 기존 목록 밖 조합은 표시되고 편집할 수 있지만, 다시 선택하기 전에는 Custom 또는 혼합 설정을 적용할 수 없다. | 기존 값 로드·표시·수정·적용 실패 분기 대조 |
| C6 | 두 JSON과 수정된 소스가 패키지 및 `MANIFEST.sha256`에 반영된다. | `package.json` 범위와 매니페스트 해시 대조 |

수용 근거는 정적 소스·데이터·패키지 무결성 경로에서 수집한다. 실제 터미널의 메뉴 이동과 배치, 실환경 설정 Apply 및 게시, 실행 중 외부 호출 관측, 계정별 역할 실행 가능성은 별도로 실행해 확인하지 않는 한 미검증으로 남긴다.

## 위험과 한계

- 고정 목록은 Codex의 API 사양과 제품에서 문서화된 후보를 조합한 데이터다. 계정별 접근 권한, Codex app-server 피커의 제공값, CLI 버전별 지원, Claude 공급자별 alias 대상을 자동 추론하지 않는다. 사용자에게는 정적 후보 목록임을 표시하고, 설정 저장이나 게시만으로 모델 실행 가능성을 확인했다고 취급하지 않는다. 실제 역할 실행은 현재와 같이 필요한 모델·effort 증거가 없으면 held/unverified 상태다.
- 새 모델과 effort는 카탈로그 JSON을 갱신해 배포해야 한다.
- 기존에 수동 입력한 Claude 값 등 정적 목록 밖 값은 현재 화면에서 표시되더라도 다시 선택하기 전에는 새 Apply가 차단된다.
- 카탈로그에서 조합을 잘못 제거하거나 누락하면 사용자에게 선택지를 제공하지 못한다. 초기 데이터는 기본 프리셋과 조합 수를 대조한다.

## 작업 깊이와 의존성

설계 깊이는 **Bounded**다. 이미 승인된 목록·입력 계약을 바꾸므로 이 서면 명세와 실행 계획이 필요하다. 카탈로그 데이터, 여러 편집 화면, 혼합 설정 게시 전 검증, 패키지 무결성은 한 작업에서 함께 바뀐다. 명세 승인 후 Planner가 `docs/superpowers/plans/2026-11-09-static-model-catalog.md`에 단일 통합 작업 계획을 작성한다.

실행 대상은 사용자가 선택한 `/Users/yunho/Desktop/project/arc`의 `feat/static-model-catalogs-custom-preset` 브랜치다. 기준 HEAD는 변경 사항이 없던 `fix/install-update-integration-screen`의 `ff8e4334f069665f8214a20a65ddbbe01f03e7a4`다.
