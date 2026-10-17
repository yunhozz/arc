# CLI 언어 선택과 프리셋 전환 구현 계획

> 실행 담당: 승인된 ARC 역할 분담으로 아래 작업을 순서대로 수행합니다. 체크박스는 진행 기록이며 별도 커밋 단위가 아닙니다. 각 작업은 Coder 완료 후 새로운 독립 QA를 거쳐 Orchestrator가 수용하고 하나의 집중된 커밋으로 기록합니다.

**목표:** 글로벌 설치 없이 bare npx로 설치하고, 마지막 질문에서 선택한 언어를 Orchestrator와 다섯 역할에 적용하며, 재설치 없이 역할 프리셋을 전환합니다. README 전체도 필요한 기술 정보를 보존하면서 간결하고 명확하게 정리합니다.

**구조:** 언어는 대상별 `settings.toml`에 저장하고 설치된 스킬·역할 프로필·전역 ARC 관리 블록에 같은 정책을 생성합니다. 프리셋 전환은 설치된 모델 설정을 읽어 모델 파일과 다섯 프로필만 대상별 트랜잭션으로 갱신합니다. 마지막 작업에서 설치 진입점, 자동완성, 도움말과 README를 최종 명령 구조에 맞춥니다.

**기술:** Node.js 22+, ESM, 기존 TOML 파서·모델 렌더러·safe-fs 트랜잭션, `node:test`, 기존 PTY·패키지 소비자 fixture. 새 런타임 의존성은 추가하지 않습니다.

**설계 근거:** 이 대화의 D-01 설계와 후속 자동완성 수정안. 사용자 승인: “이 설계로 진행”. 저장된 설계 파일 경로는 제공되지 않았습니다.

**작업 공간:** `/Users/yunho/Desktop/project/arc`, `master`, 기준 HEAD `6cf8b343d8aa21fd6b84452feb01964211628bcb`.

**계획 저장 경로:** `docs/superpowers/plans/2026-10-17-cli-language-preset.md`.

## 공통 제약

- 최초 설치는 `npx --yes github:yunhozz/arc`이며 글로벌 `arc` 설치를 요구하지 않습니다.
- 인수 없는 패키지 bin 실행은 설치를 시작합니다. `arc install`은 제거합니다.
- 생략된 대화형 질문은 대상 → 프리셋 → 전체 제한 → 동시 제한 → 언어 순서로 진행합니다.
- 언어 값은 `en`, `ko`이며 메뉴는 `English`, `한국어`입니다.
- 비대화형 설치는 `--target`, `--preset`, `--language`를 요구합니다.
- 언어 메뉴 기본값은 선택 대상의 기존 언어가 모두 같으면 그 값, 그렇지 않으면 `en`입니다.
- `all`에서 선택한 언어는 두 대상에 동일하게 적용합니다.
- 사용자의 명시적인 출력 언어 요청이 설치 기본값보다 우선합니다. 입력 언어만으로 기본값을 바꾸지 않습니다.
- 코드·식별자·명령·경로·리터럴·인용·실제 도구 출력은 보존합니다.
- `models.toml` 형식, 기존 제한값 정책, `--skip-global`, 기존 제거 보존 정책을 유지합니다.
- 여러 대상은 전체 사전 검사 후 Codex → Claude 순서로 적용합니다. 원자성은 대상별로 제공합니다.
- `completion`은 직접 호출 가능하게 유지하되 빈 첫 위치 명령 추천은 정확히 `preset`, `uninstall`입니다.
- 기존 사용자 파일과 미관련 변경을 보존합니다. 추가 범위가 필요하면 Orchestrator에 보고합니다.
- README 전체를 편집하되 지원 환경, 설정 보존, 오류·복원 의미, 제거 범위 등 필요한 기술 정보는 유지합니다.
- 각 작업의 Coder 보고 후 그 작업을 구현하지 않은 새로운 독립 QA가 해당 작업을 확인합니다. QA 증거와 지적 처리 결과를 Orchestrator가 판단하여 수용한 뒤 커밋합니다.
- 아래 테스트 추가·실행은 계획 승인 대상입니다. 현재 추가하거나 실행하지 않았습니다.

## 파일 구성과 인터페이스

모든 경로는 작업 공간 기준입니다.

| 파일 | 책임 |
|---|---|
| 새 `lib/installer/language.mjs` | 언어 설정 검증·직렬화·기존 설정 조회·정책 생성·템플릿 치환 |
| 기존 `lib/cli/choices.mjs` | 항목 수에 독립적인 방향키 메뉴와 마지막 언어 질문 |
| 기존 `lib/cli/index.mjs` | 설치 옵션·질문 순서·언어 사전 조회 |
| 기존 `lib/installer/plan.mjs` | 언어 설정과 정책을 설치 트랜잭션에 포함 |
| 기존 `lib/installer/global-config.mjs` | 관리 블록에 같은 언어 정책 포함 |
| 새 `lib/installer/preset.mjs` | 설치된 모델·프로필 검사와 프리셋 갱신 트랜잭션 |
| 새 `lib/cli/preset.mjs` | 프리셋 명령의 입력·선택·결과 보고 |
| 기존 `lib/cli/root.mjs` | 명령 분기와 설치 기본 진입점 |
| 기존 `lib/cli/completion.mjs` | 첫 위치 추천과 문맥별 인수·옵션 완성 |
| 양 플랫폼 스킬·역할 프로필 | 설치 시 언어 정책을 넣는 템플릿 위치 |
| `README.md`, `install.command` | 사용법·진입점의 일치와 README 전체 편집 |

새 내부 인터페이스는 다음으로 고정합니다.

```text
parseLanguageSettings(bytes: Buffer) -> {version: 1, language: "en"|"ko"}
serializeLanguageSettings(language: "en"|"ko") -> Buffer
previewLanguage({target, safeFs}) -> {existing: null|{version:1,language}, snapshot: Map}
renderLanguagePolicy(language: "en"|"ko") -> string
renderLanguageTemplate(bytes: Buffer, language: "en"|"ko") -> Buffer

selectLanguage(options, selections, io) -> Promise<options>
  selections: Array<{target, languagePreview}>
  options.language가 있으면 질문하지 않음

buildPresetPlan({target, preset, safeFs}) -> PresetPlan
switchPresetTargets(plans, {safeFs, signal, hooks?}) -> Promise<Result>
```

`PresetPlan`은 `target`, `preset`, `snapshot`, `managedPaths`, `externalPaths: []`, `globalChanges: []`, `summary`, `changes: Array<{path, bytes: Buffer}>`를 가집니다. 결과 항목은 기존 설치 결과와 같은 `platform`, `status`, `rollback`, `residualPaths`, `error`를 사용하되 성공 상태는 `updated`입니다.

## 검토 초점

다음 위험은 담당 작업의 검사와 독립 QA에 포함합니다.

1. 두 항목 메뉴의 줄 이동·순환·취소로 터미널 상태가 손상되는 경우 — T01.
2. `all`의 기존 언어가 다르거나 언어 파일이 잘못된 경우 — T01.
3. 선택 언어 정책과 Planner의 기존 한국어 규칙이 충돌하는 경우 — T01.
4. 프리셋 전환이 사용자 모델·프로필 본문을 손실하거나 중간 실패로 불일치를 남기는 경우 — T02.
5. 글로벌 bin 없는 실행, 숨긴 `completion`, npm 셸 설정이 충돌하거나 README 축약으로 필수 설명이 사라지는 경우 — T03.

## T01. 설치 마지막 언어 선택과 전체 역할 정책 적용

**구현 목표:** 현재 설치 경로에 언어 설정·질문·정책 생성을 완성합니다. 기존 `install` 진입점은 이 작업에서 유지하고 T03에서 최종 구문으로 전환합니다.

**선행 작업·의존성:** 없음. 사용자 계획 승인과 기준 작업 공간 확인이 필요합니다.

### Coder 소유 파일

- 생성: `lib/installer/language.mjs`
- 수정: `lib/cli/index.mjs`, `lib/cli/choices.mjs`
- 수정: `lib/installer/plan.mjs`, `lib/installer/global-config.mjs`
- 수정: `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- 수정: `codex/agents/arc-{scouter,planner,coder,qa,reviewer}.toml`
- 수정: `claude/agents/arc-{scouter,planner,coder,qa,reviewer}.md`
- 수정: `README.md`의 언어 옵션·질문·적용 범위 설명
- 수정: `MANIFEST.sha256`
- 생성: `tests/node/language.test.mjs`
- 수정: `tests/node/cli.test.mjs`, `cli-pty.test.mjs`, `cli-dry-run.test.mjs`, `plan.test.mjs`, `global-config.test.mjs`, `install.test.mjs`, `uninstall.test.mjs`
- 기존 설치 CLI를 호출하는 다른 fixture에는 새 필수 `--language`만 반영합니다. 검색으로 대상을 확인하고 Orchestrator에 변경 목록을 보고합니다.

### 인터페이스와 동작

- `buildInstallPlan`에 검증된 `language`와 선택적 `languagePreview`를 전달합니다.
- `agentsBlockBody`는 `language` 인수를 받아 동일한 정책을 포함합니다.
- `settings.toml`은 생성된 skill 파일 집합에 넣어 기존 설치 트랜잭션으로 배포합니다.
- 언어 조회 스냅샷을 설치 계획에 합쳐 질문 중 설정 변경도 감지합니다.
- 템플릿 표식은 `{{ARC_OUTPUT_LANGUAGE_POLICY}}` 하나로 통일합니다. 누락·중복은 생성 오류입니다.

### 진행 단계

- [ ] 언어 파일 형식·정책 생성·기본값의 실패 테스트를 작성합니다. `en`, `ko`, 잘못된 version·값·추가 키·TOML, 파일 없음, 대상별 기존값 불일치를 포함합니다.
- [ ] 새 기능의 부재로 실패함을 확인합니다. payload를 읽는 통합 검사 전에 manifest를 갱신하여 hash 오류가 기능 검사를 가리지 않게 합니다.
- [ ] 언어 설정 조회·정책 생성 모듈을 구현합니다.
- [ ] 양 플랫폼 스킬과 각 역할 지침 영역에 정책 표식을 넣고, Planner의 입력 언어 기반 한국어 규칙을 선택 언어 정책에 맞춥니다.
- [ ] 설치 옵션에 `--language`를 추가하고 제한값 질문 뒤에 `selectLanguage`를 호출합니다. 메뉴의 항목 수·다시 그리는 줄 수 상수를 일반화합니다.
- [ ] 설정·스킬·프로필·전역 관리 블록을 같은 설치 계획에 포함합니다. `--skip-global`에서는 전역 블록을 제외합니다.
- [ ] PTY 검사에 마지막 언어 질문, 두 항목 순환, Enter, EOF, Ctrl-C, raw mode·listener 복구와 명시 옵션 질문 생략을 추가합니다.
- [ ] 언어 문서를 추가하고 manifest를 갱신한 뒤 집중 검사를 통과시킵니다.
- [ ] Coder가 변경 범위·검사 결과·남은 문제를 보고합니다.
- [ ] 새로운 독립 QA가 아래 범위를 확인하고 증거를 제출합니다.
- [ ] Orchestrator가 QA 지적 처리와 수용 기준을 확인해 T01을 수용한 뒤 하나의 커밋으로 기록합니다.

### 수용 기준

- 언어가 마지막 설치 질문이며 방향키·Enter·취소가 정상 동작합니다.
- 양 플랫폼의 `en`, `ko` 설치에서 설정과 모든 생성 정책이 일치하고 미치환 표식이 없습니다.
- 비대화형 언어 누락·잘못된 설정·취소는 쓰기를 시작하지 않습니다.
- `all`의 기본값은 공통 기존값 또는 `en`이며 선택값은 두 대상에 적용됩니다.
- `--check`·`--dry-run`은 언어 변경도 쓰지 않습니다.
- 조회 이후 파일 변경을 감지하고, 설치 실패 시 설정과 정책을 함께 복원합니다.
- `uninstall`이 새 설정도 제거하며 기존 보존 정책을 유지합니다.
- 모델 파일 형식과 기존 Python 도구를 변경하지 않습니다.

### 필수 검사·새로운 독립 QA·수용 전 증거

제안 실행 순서:

```sh
node scripts/update-manifest.mjs
node --test tests/node/language.test.mjs tests/node/cli.test.mjs tests/node/cli-pty.test.mjs tests/node/cli-dry-run.test.mjs tests/node/plan.test.mjs tests/node/global-config.test.mjs tests/node/install.test.mjs tests/node/uninstall.test.mjs
npm run check:manifest
```

새로운 독립 QA는 Coder의 요약만으로 통과시키지 않고 다음을 직접 확인합니다.

- 실제 PTY에서 마지막 언어 질문과 두 항목 선택·취소.
- 임시 HOME에서 양 플랫폼의 언어 설정과 Orchestrator·다섯 역할 정책.
- `all`의 서로 다른 기존 언어, 잘못된 설정, `--skip-global`.
- 검사·미리보기의 무변경과 실패 시 복원.
- 제거 후 새 설정이 사라지고 보존 대상이 유지되는지.

수용 전 증거는 실행 명령·종료 코드·통과 요약, PTY 기록, 생성 정책 검사 결과, 무변경·복원·제거 결과, QA 지적 및 처리 상태입니다.

**보류 조건:** 지침 영역에 정책을 안전하게 넣을 수 없거나 언어 질문 뒤 추가 질문이 필요한 구조가 발견되면 보고합니다. QA 실패·미해결 지적·필수 증거 부족 상태에서는 수용·커밋하지 않습니다.

## T02. 설치된 설정을 보존하는 프리셋 전환

**구현 목표:** 재설치·다운로드 없이 설치된 모델 파일과 다섯 역할의 모델 필드만 전환합니다.

**선행 작업·의존성:** T01 수용·커밋. 언어 정책 보존을 실제 생성물로 확인합니다.

### Coder 소유 파일

- 생성: `lib/installer/preset.mjs`, `lib/cli/preset.mjs`
- 수정: `lib/cli/root.mjs`의 `preset` 분기
- 수정: `lib/cli/choices.mjs`의 공통 메뉴 연결 부분
- 수정: `README.md`의 프리셋 전환 설명
- 수정: 양 플랫폼 `skill/SKILL.md`의 모델 적용 설명
- 수정: `MANIFEST.sha256`
- 생성: `tests/node/preset.test.mjs`, `tests/node/preset-cli.test.mjs`
- 기존 `lib/models/`와 `lib/installer/transaction.mjs`는 기존 공개 기능을 재사용합니다. 변경이 필요하면 먼저 원인·범위를 Orchestrator에 보고합니다.

### 인터페이스와 동작

- `buildPresetPlan`은 설치된 `models.toml`과 다섯 프로필을 읽습니다.
- `loadModelConfig` → `applyPreset` → `resolveModelSettings` → `renderProfiles`를 사용합니다.
- 명시적 트랜잭션 `specs`에는 변경된 모델 파일·프로필만 포함합니다.
- 언어 설정, 스킬 본문, 참조, 전역 파일, 제한값은 쓰지 않습니다.
- 모델 형식이 유효하면 언어 설정 파일이 없는 구버전 설치도 전환할 수 있습니다.
- 같은 프리셋이더라도 모델 필드 drift는 복구하며, 내용까지 같으면 쓰지 않습니다.

### 진행 단계

- [ ] 사용자 수정 모델 변형과 프로필 본문을 넣은 양 플랫폼 fixture로 실패 테스트를 작성하고 기능 부재로 실패하는지 확인합니다.
- [ ] 프리셋 계획을 구현합니다. 비활성 변형도 검증하고 미설치·프로필 누락·잘못된 형식·안전하지 않은 경로는 쓰기 전에 거부합니다.
- [ ] 전체 대상 사전 검사와 대상별 트랜잭션을 구현합니다. Codex → Claude 순서, 첫 실패 후 중단, 앞선 성공 유지, 복원 실패 경로 보고를 고정합니다.
- [ ] `arc preset [economy|balanced|smart] --target <codex|claude|all>`을 연결합니다. 대화형은 빠진 선택만 질문하고 비대화형은 두 선택을 요구합니다.
- [ ] `--check`, `--dry-run`, `--help`를 구현합니다. 중복·알 수 없는 옵션과 설치 전용 옵션은 입력 오류로 처리합니다.
- [ ] 실패 주입으로 staging·publish·rollback·cleanup, 적용 직전 파일 변경을 검사합니다.
- [ ] 사용법과 새 세션 적용 안내를 추가하고 manifest를 갱신한 뒤 집중 검사를 통과시킵니다.
- [ ] Coder가 변경 범위·검사 결과·남은 문제를 보고합니다.
- [ ] 새로운 독립 QA가 아래 범위를 확인하고 증거를 제출합니다.
- [ ] Orchestrator가 QA 지적 처리와 수용 기준을 확인해 T02를 수용한 뒤 하나의 커밋으로 기록합니다.

### 수용 기준

- 양 플랫폼의 모든 프리셋에서 활성값과 다섯 역할 모델·effort가 일치합니다.
- 사용자 모델 변형과 프로필의 모델 외 부분을 보존합니다.
- 언어 설정·정책을 포함한 비대상 파일은 바이트 단위로 동일합니다.
- 직접 명령 실행 중 다운로드·Python·컴파일러를 호출하지 않습니다.
- 어느 대상이든 사전 검사 실패 시 전체 쓰기를 막습니다.
- 대상 내 중간 실패는 모델 파일과 프로필을 함께 복원합니다.
- `all`의 두 번째 대상 실패는 첫 성공을 유지하고 상태를 정확히 보고합니다.
- 입력 오류 `2`, 취소 `130`, 실행 실패 `1`, 정상 완료 `0`을 사용합니다.

### 필수 검사·새로운 독립 QA·수용 전 증거

제안 실행 순서:

```sh
node scripts/update-manifest.mjs
node --test tests/node/preset.test.mjs tests/node/preset-cli.test.mjs tests/node/models.test.mjs tests/node/profile-render.test.mjs
npm run check:manifest
```

새로운 독립 QA는 다음을 직접 확인합니다.

- 양 플랫폼의 세 프리셋 전환 및 사용자 수정 모델 사용.
- 프로필 본문·언어·제한값·참조·전역 파일의 전후 보존.
- 같은 프리셋의 drift 복구와 완전 동일 상태의 무변경.
- 언어 설정이 없는 기존 설치, 프로필 누락·잘못된 모델 파일.
- 사전 검사·적용 직전 변경·중간 실패·복원 실패·`all` 부분 성공.
- 외부 실행을 차단한 상태에서 직접 프리셋 전환.

수용 전 증거는 프리셋별 결과, 보존 대상의 전후 바이트 비교, 외부 실행 차단 결과, 실패 단계별 상태·복원·잔여 경로, QA 지적 및 처리 상태입니다.

**보류 조건:** 기존 렌더러로 본문 보존이 불가능하거나 기존 트랜잭션으로 파일 집합을 안전하게 갱신할 수 없으면 보고합니다. 설치 전체를 호출하는 우회는 하지 않습니다. QA 실패·미해결 지적·필수 증거 부족 상태에서는 수용·커밋하지 않습니다.

## T03. bare npx 진입점·자동완성과 README 전체 정리

**구현 목표:** 승인된 명령 구조를 일관되게 제공하고 README 전체를 간결하고 명확하게 편집합니다.

**선행 작업·의존성:** T01·T02 수용·커밋.

### Coder 소유 파일

- 수정: `lib/cli/root.mjs`, `lib/cli/index.mjs`, `lib/cli/completion.mjs`
- 수정: `install.command`
- 수정: `README.md` 전체의 편집·구조·예시
- 수정: 양 플랫폼 `skill/SKILL.md`의 설치 예시
- 수정: `MANIFEST.sha256`
- 수정: `tests/node/cli.test.mjs`, `cli-pty.test.mjs`, `cli-dry-run.test.mjs`
- 수정: `tests/node/completion.test.mjs`, `consumer.test.mjs`, `package.test.mjs`
- 수정: `tests/node/fixtures/packed-consumer.mjs`
- 필요 시 수정: `tests/node/npm-completion-consumer.test.mjs`, `npm-postinstall.test.mjs`의 명령 기대값
- 다른 기존 테스트의 `install` 호출은 검색 결과에 따라 이 작업에서 전환하고 목록을 보고합니다.
- `scripts/npm-postinstall.mjs`와 npm 자동완성 구현의 기존 동작을 유지합니다.

### 최종 명령 계약

```sh
npx --yes github:yunhozz/arc
npx --yes github:yunhozz/arc --target codex --preset balanced --language ko
npx --yes github:yunhozz/arc preset smart --target codex
npx --yes github:yunhozz/arc uninstall --target codex
```

- 인수 없음 또는 설치 옵션으로 시작하면 설치 CLI에 전달합니다.
- `--help`, `--version`은 native 로딩 없이 처리합니다.
- `install`은 새 설치 구문 안내와 종료 코드 `2`를 반환합니다.
- 빈 첫 위치 명령 후보는 정확히 `preset uninstall`입니다.
- 옵션 접두어에서는 설치 옵션을, `--language` 뒤에서는 `en ko`를 완성합니다.
- `completion` 직접 입력 뒤에는 `zsh bash`를 완성하며 명령도 계속 작동합니다.

### README 전체 편집 기준

README 전체를 읽고 각 절의 목적·중복·문장 길이·정보 순서를 정리합니다. 기존 언어와 문서 스타일을 따르며 번역이나 새 문서 체계를 추가하지 않습니다.

- 설치·일상 명령을 앞에서 바로 찾을 수 있게 구성합니다.
- 반복되는 제한값·설정·설치 설명은 적절한 한 위치로 모으고 필요한 곳에서 연결합니다.
- 과도하게 긴 문장과 단편적인 설명을 줄이고 예시·표를 필요한 만큼만 유지합니다.
- 다음 필수 정보는 보존하고 실제 동작과 맞춥니다: 지원 OS·런타임, 설치 대상과 경로, 옵션 의미, 언어와 새 세션 적용, 프리셋·사용자 수정 보존, 제한값·native 설정, check/dry-run, 실패·복원·부분 성공, uninstall과 npm 패키지 제거의 차이, 자동완성 설정·보존, 필요한 유지보수 명령·참조 링크.
- 설명을 짧게 만들기 위해 제한·오류 조건을 삭제하거나 구현하지 않은 동작을 약속하지 않습니다.
- 글로벌 `arc`가 일회성 npx 실행으로 설치된다는 인상을 주지 않습니다.

### 진행 단계

- [ ] 인수 없는 실행·옵션 시작 실행·제거된 명령·첫 위치 추천 두 개의 실패 테스트를 작성하고 기존 동작으로 실패하는지 확인합니다.
- [ ] root의 기본 설치 진입점을 변경합니다. 알 수 없는 명령을 설치로 오인하지 않게 합니다.
- [ ] `install.command`에서 하드코딩된 `install` 인수를 제거합니다.
- [ ] Bash·Zsh의 첫 위치 추천과 문맥별 완성을 최종 계약에 맞춥니다.
- [ ] 직접 `completion` 호출과 기존 npm 셸 설정 경로의 호환성을 확인합니다.
- [ ] packed consumer fixture를 하위 명령 없는 기본 실행으로 바꾸고, 글로벌 `arc`가 없는 PATH에서 설치·프리셋 전환·제거를 확인하는 검사를 추가합니다.
- [ ] README 전체를 편집하고 필수 기술 정보가 어디에 보존되었는지 간단한 전후 대조 목록을 작성합니다.
- [ ] 스킬 예시·기존 테스트 호출을 새 구문으로 정리합니다.
- [ ] manifest를 갱신한 뒤 집중 검사를 통과시킵니다.
- [ ] Coder가 CLI 결과와 README 전후 정보 대조를 보고합니다.
- [ ] 새로운 독립 QA가 아래 동작·문서 범위를 확인하고 증거를 제출합니다.
- [ ] Orchestrator가 QA 지적 처리와 수용 기준을 확인해 T03을 수용한 뒤 하나의 커밋으로 기록합니다.

### 수용 기준

- bare 패키지 실행이 설치를 시작하고 명시 설치 옵션은 비대화형으로 동작합니다.
- 도움말에 설치·프리셋·제거와 설정용 `completion`이 간결하게 설명됩니다.
- `arc install`은 지원하지 않습니다.
- 빈 첫 위치 추천은 정확히 `preset`, `uninstall`입니다.
- 직접 `completion` 호출과 기존 자동완성 등록은 정상 동작합니다.
- 글로벌 bin 없는 격리된 packed consumer에서 전체 흐름이 동작합니다.
- 실제 사용 예시에 오래된 `install` 하위 명령이 남지 않습니다. 제거 오류 테스트는 예외입니다.
- `uninstall`의 기존 정리 의미를 유지합니다.
- README의 모든 절을 편집 검토했고, 반복·장황한 설명을 줄이면서 필수 기술 정보를 보존합니다.
- README 명령·옵션·경로·링크와 최종 구현 사이에 모순이 없습니다.

### 필수 검사·새로운 독립 QA·수용 전 증거

제안 실행 순서:

```sh
node scripts/update-manifest.mjs
node --test tests/node/cli.test.mjs tests/node/cli-pty.test.mjs tests/node/cli-dry-run.test.mjs tests/node/completion.test.mjs tests/node/consumer.test.mjs tests/node/package.test.mjs tests/node/npm-postinstall.test.mjs tests/node/npm-completion-consumer.test.mjs
npm run check:manifest
```

새로운 독립 QA는 다음을 직접 확인합니다.

- bare 실행과 래퍼의 설치 진입·종료 코드, `install` 제거 오류.
- Bash·Zsh 첫 위치 후보가 정확히 두 개인지와 직접 `completion` 호출.
- 글로벌 bin 없는 패키지 소비자 실행 및 npm 자동완성 설정 호환성.
- README 전체를 읽고 필수 정보 대조, 반복 제거, 명령·옵션·경로·링크 정확성 확인.
- 최초 사용자가 글로벌 설치 없이 설치·전환·제거 경로를 찾을 수 있는지.
- 사용자 파일 제거 범위·설정 보존·부분 실패 같은 설명이 축약 과정에서 사라지지 않았는지.

수용 전 증거는 셸별 후보 결과, 직접 `completion` 출력, 격리된 패키지 실행 기록, 래퍼 비교, README 필수 정보 대조와 실제로 간결해진 부분, QA 지적 및 처리 상태입니다. README 길이 감소율 자체를 통과 기준으로 삼지 않습니다.

**보류 조건:** npx 지원에 npm postinstall 수명주기 변경이나 글로벌 설치가 필요하다는 결과가 나오면 보고합니다. README 편집 중 기존 설명과 구현의 충돌로 제품 동작 변경이 필요하면 Orchestrator가 범위를 결정합니다. QA 실패·미해결 지적·필수 증거 부족 상태에서는 수용·커밋하지 않습니다.

## 전체 계획 완료 후 확인

아래는 세 작업이 각각 독립 QA와 Orchestrator 수용을 거쳐 커밋된 뒤 수행합니다. 각 작업의 독립적인 수용을 뒤로 미루는 조건은 아닙니다.

1. 준비된 기존 native fixture로 `npm test`, `npm run check:manifest`, `node scripts/check-installer-parity.mjs --complete`를 한 번 실행합니다. fixture·도구가 없으면 Orchestrator가 준비 범위를 결정합니다.
2. 임시 HOME과 격리된 패키지에서 언어 선택 → 설치 → 사용자 모델 수정 → 프리셋 전환 → 제거를 양 플랫폼에 대해 확인합니다. `all`의 부분 실패도 포함합니다.
3. Orchestrator와 다섯 역할의 영어·한국어 표본 응답을 확인합니다. 실제 역할 실행 도구가 없으면 생성 정책 검사와 실제 응답 확인을 구분해 보고하고 Orchestrator가 미확인 범위를 판단합니다.
4. 독립 Reviewer가 최종 전체 변경을 한 번 검토합니다. 대상은 세 작업을 합친 최종 상태이며 언어 충돌, 설정 보존, 트랜잭션·부분 실패, CLI·자동완성 호환성, README 정확성을 확인합니다.
5. Orchestrator가 전체 검사와 최종 검토 지적 처리 결과를 확인해 완료를 수용합니다.

작업별 새로운 QA는 해당 작업의 수용 전 필수 조건입니다. 최종 독립 Reviewer 검토는 전체 변경에 대한 별도 조건이며 작업별 QA를 대신하지 않습니다.

공개 `npx --yes github:yunhozz/arc`의 새 동작은 변경이 GitHub 배포 경로에 반영된 뒤 확인할 수 있습니다. 이번 계획은 공개 배포를 포함하지 않으며 구현 수용에는 같은 패키지 bin을 실행하는 격리된 소비자 증거를 사용합니다.

## 자체 점검과 가정

- 승인된 기능은 T01 언어·정책, T02 프리셋·보존, T03 진입점·자동완성·README 전체 편집에 배정했습니다.
- 설정 생성과 정책 배포는 T01에, 모델 파일과 다섯 프로필 갱신은 T02에 함께 묶었습니다.
- 각 작업에 선행 조건, 소유 파일, 수용 기준, 집중 검사, 새로운 독립 QA, 수용 전 증거와 보류 조건을 명시했습니다.
- 최종 전체 변경에 대한 독립 Reviewer 검토는 모든 작업 수용 후 한 번으로 구분했습니다.
- README 전체 편집을 T03의 명시적 범위와 수용 기준에 넣었으며 필요한 기술 정보 보존을 QA 대상으로 지정했습니다.
- `settings.toml`이 없는 기존 설치의 프리셋 전환과 잘못된 언어 설정의 설치 중단을 구분했습니다.
- `tests/node/root-cli.test.mjs`, `choices.test.mjs`는 현재 없으므로 기존 파일로 지정하지 않았습니다. 필요한 신규 테스트는 생성 대상으로 구분했습니다.
- 파일 저장·구현·테스트 추가·실행은 수행하지 않았습니다.
- 설계 승인은 확인되었지만 이 계획의 승인은 아직 필요합니다. Orchestrator가 통합·저장·자체 점검 후 승인을 받아야 Coder가 시작할 수 있습니다.

