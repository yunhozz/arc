# 정적 모델 카탈로그와 혼합 Custom 프리셋 구현 계획

상태: 사용자 승인 (2026-11-09)  
작성일: 2026-11-09  
계획 경로: `docs/superpowers/plans/2026-11-09-static-model-catalog.md`  
승인 명세: [정적 모델 카탈로그와 혼합 Custom 프리셋 명세](/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-11-09-static-model-catalog-design.md)

> ARC 역할 절차에 따라 Implementer가 구현하고 독립 QA가 승인 기준을 확인한다. Orchestrator가 구현과 근거를 수용한 뒤 독립 Reviewer가 전체 변경을 검토한다. 구현은 이 계획에 대한 사용자 승인을 받은 뒤 시작한다.

## 목표

Codex와 Claude 모델·effort를 패키지 안의 고정 목록에서 선택하고, `Claude & Codex` 설정에 `Economy`, `Balanced`, `Smart`, `Custom`과 초안 기반 `Custom preset` 편집을 제공한다. 두 플랫폼 모두 모델 수동 입력을 제거하고, 모델 목록 표시나 적용 검증에 외부 모델 API를 호출하지 않는다.

## 실행 대상 및 사전 조건

- 실행 대상은 `/Users/yunho/Desktop/project/arc`, 브랜치 `feat/static-model-catalogs-custom-preset`이다.
- 계획 작성 시점에 관찰한 HEAD는 `ff8e4334f069665f8214a20a65ddbbe01f03e7a4`; 작업 트리에는 승인 명세 한 파일만 미추적 상태였다. 구현 배정 직전에 브랜치, HEAD, 변경 상태를 다시 확인한다.
- 사용자 승인 명세는 Codex 8개 모델 46쌍과 Claude 15개 모델 이름 73쌍을 지정한다. Codex의 `none`은 명세에 지정한 여섯 모델에서만 제공한다. JSON은 명세에 승인된 모델·effort 문자열과 조합을 그대로 담는다.
- 계획 승인을 받은 다음 승인된 명세와 계획을 문서 커밋으로 기록하고, 실제 구현 파일 소유권 및 기준점을 확인한 뒤 T1을 Implementer에게 배정한다.
- 테스트 코드를 수정·추가하거나 테스트를 실행하지 않는다. 정적 소스·데이터 비교와 구문 및 매니페스트 검증으로 확인한다.

## 제약 및 설계 선택

- 카탈로그는 선택 후보만 의미한다. 계정 권한, CLI 버전 지원, 공급자별 별칭 해석, 실제 모델·effort 실행을 입증하지 않는다. 기존 인증 검사와 `held/unverified` 실행 상태를 유지한다.
- 일반 모델 선택 화면, 혼합 편집 및 준비·설치 쓰기 전·게시 전 검증이 같은 두 JSON 카탈로그를 사용한다. 이 경로에서는 Anthropic 모델 API와 Codex app-server `model/list`를 호출하지 않는다.
- `lib/models/catalog.mjs`의 기존 역할 검증 인터페이스와 단일 플랫폼 설치·프리셋 생성 계약을 우선 재사용한다. 저수준 동적 조회 모듈은 다른 소비자가 있는지 확인해 유지 여부를 결정하되, 운영 TUI 및 관리 작업의 호출 경로에서는 제거한다.
- 카탈로그 로드는 기존 UI의 `{status: 'ready', catalog}` / unavailable 결과 형태에 맞춘다. JSON 읽기, 구조, 플랫폼, 조합 형식 및 중복을 검증하며 카탈로그 실패 시 자동으로 다른 모델을 선택하지 않는다.

## T1 — 정적 카탈로그와 혼합 Custom 흐름 구현

**선행 조건:** 사용자 계획 승인, 승인 명세·계획 문서 커밋, 작업 트리 기준점 재확인.

### 파일 책임

| 경로 | 변경 |
|---|---|
| `lib/models/codex-models.json`, `lib/models/claude-models.json` | 승인 명세의 모델 및 effort 조합을 JSON으로 고정 |
| `lib/models/static-catalog.mjs` | 패키지 상대 JSON 로더, 형식 검증, 단일/혼합 역할 조합 검증 |
| `lib/tui/app.mjs` | 기본 TUI 카탈로그 공급자를 정적 로더로 연결하고 주입 경계 유지 |
| `lib/tui/setup.mjs`, `lib/tui/custom-preset.mjs` | 정적 목록 사용, 양 플랫폼 수동 입력 제거, 혼합 프리셋과 Custom 초안 편집 구현 |
| `lib/management/operations.mjs` | 혼합 설정 준비, 설치 전, 게시 전 검증을 두 JSON으로 전환 |
| `README.md` | 프리셋·Custom 편집과 고정 후보/계정 가용성의 차이 설명 |
| `MANIFEST.sha256` | 새 JSON 및 변경 파일의 생성 해시 반영 |

### 구현 단계

1. **정적 로더 및 검증을 추가한다.** 두 JSON을 모듈 위치 기준으로 읽고 플랫폼별 고정 카탈로그를 반환한다. 모델·effort 쌍은 중복 없이 정확히 보존한다. 혼합 검증은 각 역할의 플랫폼에 맞는 JSON에서 조합을 확인한다.
2. **모델 선택 경로를 바꾼다.** TUI의 기본 공급자를 정적 로더로 전환한다. 단일 플랫폼과 혼합 역할 편집에서 JSON의 모델 목록 및 해당 모델에 등록된 effort만 표시한다. 역할별 `Select model` 창에는 `Static candidates`, `Current model`, `Current effort` 안내 행을 넣지 않는다. Codex/Claude 모두 수동 입력 화면을 제거한다. 목록 밖 기존 값은 화면에 표시하고 문제 역할 재선택을 요구한다.
3. **혼합 프리셋을 확장한다.** 두 진입점(`Install / Update`, `Change Preset`)에서 `Claude & Codex`를 선택하면 먼저 단일 플랫폼과 같은 `Performance preset` 화면을 연다. 그 화면에 네 선택지를 지정 순서로 표시한다. 기본 프리셋 포커스 미리보기는 역할별 현재 플랫폼 값을 보여 주고, 선택 시에만 초안을 갱신한 뒤 역할 편집 화면으로 이동한다. 세 기본 프리셋은 역할별 현재 플랫폼을 유지한다. `Custom`은 현재 다섯 역할을 복제해 `Custom preset` 다이어그램으로 연다. 내부 `Apply` 후 역할 편집 화면으로 이동하고, `Back`은 편집을 취소해 프리셋 선택으로 돌아간다. 설정 준비는 역할 화면의 바깥 `Apply`에서만 호출한다.
4. **기본 역할 매핑 복원을 구현한다.** Custom에서 기본 매핑으로 바꿀 때 플랫폼이 유지되는 역할은 Custom 값을 보존하고, 플랫폼이 바뀌는 역할은 마지막으로 고른 기본 프리셋을 사용한다. 기본 선택 이력이 없으면 `Balanced` 값을 쓴다.
5. **복합 적용을 정적으로 검증한다.** 기존 값을 구조적으로 읽어 화면 표시와 편집을 허용하되, 목록 밖 조합이 있으면 새 적용을 차단한다. `prepareCompositeOperation`과 `executeCompositeOperation`에서 준비/쓰기 전 및 게시 직전 검증이 양 플랫폼 JSON을 사용하도록 바꾼다. 동적 목록 재조회와 관련 API/임시 디렉터리 의존을 해당 운영 경로에서 제거한다. 인증, 파일·설치 상태 검사, 활성 리비전 게시 순서는 보존한다.
6. **문서와 매니페스트를 갱신한다.** README의 기존 동적 Codex 목록 및 Claude 수동 입력 설명을 새 동작으로 교체한다. `package.json`의 `lib/` 패키징 범위는 이미 JSON을 포함하므로 새 범위 설정 없이 사용한다. `node scripts/update-manifest.mjs`로 매니페스트를 갱신한다.

### 인수 기준과 정적 QA

독립 QA는 수정된 소스와 데이터만 읽어 아래를 각각 `proven`, `unmet`, `unverified`로 기록한다. 문제 수정은 Implementer가 하고 QA가 영향받은 기준을 재확인한다.

| 기준 | 확인할 근거 |
|---|---|
| C1 | 두 진입점에서 `Claude & Codex` 선택 직후 `Performance preset` 화면이 네 선택지를 지정된 순서로 표시하고 기본 프리셋은 역할 편집으로, `Custom`은 `Custom preset` 다이어그램으로 이동한다. |
| C2 | Custom 초안 복제, 내부 Apply/Back, 기본 매핑 복원, 바깥 Apply의 준비 호출 위치를 추적한다. |
| C3 | JSON의 모델 수·쌍 수·중복 및 기존 기본 프리셋 조합 포함을 대조한다. 여섯 Codex `none`, Claude 4.6 effort 범위, 모델별 effort 제한, 양 플랫폼 수동 입력 제거를 확인한다. |
| C4 | TUI부터 준비·쓰기 전·게시 전까지 동적 API 호출 경로가 없고 양쪽 JSON 검증을 사용하는지 추적한다. |
| C5 | 목록 밖 기존 값을 읽고 표시하고 편집할 수 있으며, 재선택 전 적용이 차단되는 분기와 기존 활성 리비전 보존을 확인한다. |
| C6 | `package.json`의 패키징 범위와 두 JSON/변경 소스의 `MANIFEST.sha256` 반영을 대조한다. |

구현자는 변경된 각 `.mjs`에 `node --check <경로>`, `git diff --check`, `node scripts/update-manifest.mjs --check`를 수행한다. 마지막 명령은 현재 `package.json`의 `check:manifest` 스크립트가 실행하는 명령이다. 이는 테스트 실행이 아니다. 테스트 파일은 변경하지 않으며 테스트 명령도 실행하지 않는다.

정적 검토만으로 실제 터미널 조작·배치, 실환경 적용과 게시, 실행 중 외부 호출 관측, 계정별 모델 접근 및 역할 실행을 입증할 수 없다. 해당 항목은 별도 검증이 없는 한 `unverified`로 보고한다.

### T1 구현 및 QA 기록 (2026-11-09)

- 독립 QA가 C1–C6을 모두 `proven`으로 판정했다. Codex는 8개 모델·46쌍, Claude는 15개 모델 이름·73쌍이며 중복은 없고 기본 프리셋 조합을 포함한다.
- 다섯 변경 `.mjs`의 `node --check`, `git diff --check`, `node scripts/update-manifest.mjs --check`가 통과했다. 매니페스트는 231개 파일을 확인했다.
- 테스트 파일은 수정·추가하지 않았고 테스트 명령도 실행하지 않았다.
- 실제 TUI 이동·배치, 런타임 외부 호출 관측, 계정별 모델 접근 및 역할 실행은 `unverified`로 남긴다.
- 독립 Reviewer의 첫 검토에서 C2 재진입 매핑과 C5 좁은 화면/긴 기존 값 표시 문제를 찾았다. 미커밋 수정 후 같은 Reviewer가 두 문제의 해결과 나머지 diff를 재확인했으며 추가 발견 사항은 없었다.
- 후속 사용자 요청에 따라 `Claude & Codex` 진입 직후 `Performance preset` 선택 화면을 표시하고, 기본 프리셋은 역할 편집으로, `Custom`은 `Custom preset` 다이어그램으로 이동하도록 정리했다. 모델 피커의 세 상태 안내 행도 제거했다. 같은 Reviewer가 화면 흐름과 기본 프리셋 미리보기를 재확인했으며 추가 발견 사항은 없었다.

### 수용 및 검토

- Orchestrator는 승인 명세, 현재 diff, C1–C6 증거와 QA 결과를 대조해 T1을 수용한다.
- 수용 후 계획에 실제 진행·근거·제한을 기록하고 구현을 커밋한다.
- 수용 및 필수 QA 후 독립 Reviewer가 전체 diff를 확인한다. 발견 사항은 Implementer가 수정하고 Reviewer가 재확인하며, 수용한 후 별도 후속 커밋으로 기록한다.
- 명세 근거나 실행 대상, 소유권이 달라지거나 승인 범위 밖의 런타임·설정 스키마 변경이 필요하면 해당 작업을 보류하고 사용자 입력을 요청한다.

---

### Orchestrator 검토 메모

- `node scripts/update-manifest.mjs --check`가 현재 `package.json`의 `check:manifest` 명령과 일치함을 확인했다.
- 현행 호출 경로는 TUI에서 `loadCustomCatalog`로 동적 조회하고, 복합 실행의 준비 시 Codex 카탈로그를 확인하며, 게시 전 Codex 카탈로그를 다시 조회한다. 계획은 이를 두 JSON을 쓰는 경로로 전환하도록 구체화했다.
- 계획 작성 전 기준점은 승인 명세 한 파일만 미추적 상태였다. 이 값은 관찰 시점 기록이며 구현 직전에 재확인한다.

