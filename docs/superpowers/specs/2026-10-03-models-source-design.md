# 모델 설정 단일 소스와 설치 시 프로필 생성 설계

날짜: 2026-10-03

상태: 기존 spec 승인 완료, 한국어 README 요구 반영 후 재승인 대기

## 1. 목적과 승인된 범위

`skill/models.toml`을 일곱 Harness 역할의 모델 ID, reasoning effort, 모델별 허용 effort 정책의 유일한 소스로 사용한다. 저장소의 `agents/*.toml`은 모델 필드 없는 프로필 템플릿이 된다.

다른 PC에서 번들 저장소와 Python 3.11 이상을 사용하여 `install.py` 한 번으로 Harness skill, 필요한 dependency skill, 모델 설정이 적용된 일곱 프로필을 설치한다. 소스 프로필의 수동 동기화나 별도 `apply-models.py` 실행은 필요하지 않다. 단일 entrypoint는 번들 파일을 사용하는 설치 명령을 뜻하며, 파일 하나만 복사하는 standalone 배포를 뜻하지 않는다.

포함하는 변경은 설정 schema, 공통 validation/rendering, 모델 없는 템플릿, 설치 staging 연결, 설치 후 적용 CLI, manifest 계약, `.DS_Store` 제외, 설치·활성화 안내다. 자동 `AGENTS.md` 활성화와 global `config.toml` 병합은 범위 밖이다. 저장소 `config.toml`은 concurrency의 선택적 수동 설정 예시로 유지한다. 중복 소스가 되는 주석 속 모델·effort 기본값은 제거한다.

## 2. 현재 구조와 선택한 접근

현재 `models.toml` version 1은 역할 값만 정의한다. effort 허용값·순위와 Sol 제한은 `apply-models.py`에 있고 역할 프로필에도 모델 값이 중복된다. 적용기는 모델 root 필드가 이미 존재해야 하며, installer는 소스 프로필에 `--check`를 실행한다. 설정 수정 후 설치하려면 수동 동기화가 필요하다.

manifest는 편집하는 `models.toml`까지 고정 해시로 검증한다. dependency 검사에는 `.DS_Store` 예외가 없고 완료 안내는 없는 `AGENTS.harness.md`를 참조한다. 근거 파일은 `skill/models.toml`, `skill/scripts/apply-models.py`, `agents/*.toml`, `install.py`, `MANIFEST.sha256`, `config.toml`이다.

승인된 접근은 모델 없는 TOML 템플릿과 공통 renderer다. 역할 지침과 파일 구조를 유지하면서 설정 중복을 제거한다. 프로필 전체 정의를 하나의 설정으로 이전하는 대안은 긴 지침과 전체 serialization까지 범위를 늘리므로 채택하지 않았다.

## 3. 설정 schema와 로컬 정책

version 2만 지원한다. version 1 입력에는 새 schema로의 변경을 안내하는 오류를 반환하고 자동 migration이나 fallback은 제공하지 않는다.

```toml
version = 2

[models."gpt-6.1-sol"]
allowed_reasoning_efforts = ["none", "minimal", "low", "medium", "high"]

[models."gpt-6-luna"]
allowed_reasoning_efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]

[roles.yunho_team_lead]
model = "gpt-6.1-sol"
model_reasoning_effort = "low"

[roles.yunho_team_secretary]
model = "gpt-6.1-sol"
model_reasoning_effort = "low"

[roles.yunho_team_planner]
model = "gpt-6.1-sol"
model_reasoning_effort = "medium"

[roles.yunho_team_scout]
model = "gpt-6-luna"
model_reasoning_effort = "high"

[roles.yunho_team_coder]
model = "gpt-6-luna"
model_reasoning_effort = "max"

[roles.yunho_team_qa]
model = "gpt-6.1-sol"
model_reasoning_effort = "low"

[roles.yunho_team_reviewer]
model = "gpt-6.1-sol"
model_reasoning_effort = "medium"
```

초기 목록은 현재 코드의 로컬 허용 정책과 역할 값을 보존한다. 실제 서버 지원을 조사해 만든 목록이 아니다. 사용자가 exact model ID와 허용 effort를 설정에 추가하거나 변경할 수 있다.

검증 계약:

- 최상위 키는 정확히 `version`, `models`, `roles`다. version은 정수 2이며 boolean은 허용하지 않는다.
- `models`는 비어 있지 않은 table이다. 각 모델에는 정확히 `allowed_reasoning_efforts`만 있다.
- 모델 ID와 effort는 비어 있지 않고 주변 공백·제어 문자·줄바꿈이 없는 문자열이다.
- 허용 목록은 비어 있지 않은 문자열 배열이며 중복이 없다.
- `roles`는 정확히 일곱 알려진 Harness 역할을 정의한다. 각 역할 키는 정확히 `model`, `model_reasoning_effort`다.
- 역할의 모델 ID는 `models`에 있어야 하며 effort는 해당 모델의 허용 목록에 있어야 한다.
- 알 수 없는 키, 잘못된 UTF-8/TOML, 중복 TOML 키와 지원하지 않는 version은 명확하게 실패한다.

Python에는 모델별 regex, effort enum·순위·상한·대체 모델이 없다. 역할 식별자와 파일명 매핑은 구조 상수로 유지한다. 로컬 검증 성공은 서버 지원, 계정 권한, 모델 가용성을 증명하지 않는다. 두 CLI는 원격 서비스를 호출하지 않는다.

## 4. 공통 모듈과 인터페이스

`skill/scripts/model_config.py`가 schema 검증과 프로필 rendering의 유일한 구현이다. 설정 읽기, 일곱 역할 매핑, 템플릿·설치 프로필 검증, 쓰기 없는 bytes rendering, 입력 경로·역할을 포함하는 전용 오류를 담당한다.

인터페이스 계약은 다음과 같다. 구체적 타입 표기는 구현 계획에서 정하되 책임 경계는 유지한다.

```python
load_settings(config_path)
validate_template(profile_bytes, role, source_path)
render_profile(profile_bytes, role, settings, source_path)
```

`load_settings`는 검증된 역할 설정을 반환한다. renderer는 완성된 유효 UTF-8 TOML bytes를 반환한다. 경로 안전성, 파일 쓰기, transaction, CLI 출력은 호출자가 담당한다.

적용기는 자신의 resolved scripts 경로에 있는 sibling 모듈을 사용한다. 설치기는 immutable manifest 검증 후 번들의 명시적 절대 경로에서 `importlib.util`로 같은 모듈을 로드한다. 현재 작업 디렉터리나 기존 설치 skill에서 모듈을 찾지 않는다. 공통 모듈은 Harness와 함께 설치하고 manifest에 포함한다.

## 5. 템플릿과 rendering 계약

일곱 저장소 템플릿의 root `model`, `model_reasoning_effort`를 제거한다. 이름·설명·지침과 기타 내용은 유지하며 모델 placeholder를 넣지 않는다. 템플릿 검증은 유효 UTF-8 TOML, 기대한 root `name`, 두 모델 root 필드의 부재를 요구한다.

설치 프로필 rendering은 모델 필드 각각 0개 또는 1개를 허용한다. 기존 필드는 한 줄 quoted string assignment여야 한다. 비문자열·multiline·지원하지 않는 assignment 표현은 애매하게 고치지 않고 실패한다. 중복 키는 TOML 파싱 단계에서 실패한다.

모델 관리 외의 원본 bytes를 보존한다. 기존 모델 assignment는 값 literal만 변경하며 prefix, inline comment, newline을 유지한다. 같은 이름의 nested table 필드는 유지한다.

없는 필드는 첫 TOML table 앞 root 영역에 넣는다. table이 없으면 기존 root 내용 뒤에 추가한다. 마지막 줄에 newline이 없으면 주석 등이 추가 assignment를 삼키지 않도록 필요한 separator newline을 넣는다. 추가 줄은 기존 newline 방식을 사용하고 기존 방식이 없으면 LF를 사용한다. 필요한 separator와 새 모델 줄 이외의 비모델 bytes는 바뀌지 않는다.

새 값은 TOML에 맞게 escape한다. 결과를 다시 파싱하여 역할 이름과 정확한 설정 값이 맞는지 확인한다. 동일 설정으로 반복 rendering하면 bytes가 같다.

## 6. 적용 CLI

`apply-models.py`는 `--config`, `--agents-dir`, `--check`, `--dry-run`을 유지한다. 설정 기본값은 설치된 Harness 옆 `models.toml`이다. agent 경로는 installer와 동일하게 `CODEX_HOME/agents`, 환경변수가 없으면 `~/.codex/agents`를 사용한다. 빈 `CODEX_HOME`은 오류다. 명시적 경로 인자가 있으면 해당 기본값보다 우선한다.

- 기본 실행: 모든 입력과 일곱 rendering 결과를 준비한 뒤 모델 root 필드만 갱신하거나 추가한다.
- `--check`: 기존 설치 프로필과 rendering bytes가 같으면 0, drift가 있으면 1. 파일은 변경하지 않는다.
- `--dry-run`: 검증 후 갱신할 프로필을 표시한다. 유효한 drift는 exit 0이다.
- 잘못된 설정·프로필, 누락 파일, unsafe path는 exit 2다.

없는 프로필 디렉터리나 역할 파일은 설치하지 않고 오류를 낸다. 기존 staged replacement·rollback을 유지하며 모든 준비가 성공하기 전에는 파일을 쓰지 않는다.

## 7. 설치 CLI와 순서

`install.py`는 유일한 설치 entrypoint이고 `install.command`는 편의 wrapper다. `--check`는 payload와 프로필 생성 가능성 검증이며 설치 대상 drift 검사가 아니다. `--dry-run`은 같은 입력을 검증하고 메모리에서 생성한 뒤 설치 위치와 dependency 보존 결정을 표시한다. 두 모드 모두 대상 디렉터리·backup·stage를 만들지 않는다.

일반 설치 순서:

1. 번들 경로와 필수 파일, filesystem type·symlink 안전성을 확인한다.
2. immutable manifest 해시와 coverage를 검증한다.
3. 공통 모듈로 mutable 설정과 일곱 모델 없는 템플릿을 검증하고 모든 프로필을 메모리에서 생성한다.
4. dependency와 설치 대상을 선택하고 대상 경로 안전성을 확인한다.
5. 대상 디렉터리와 backup 디렉터리를 생성하고 기존 Harness·일곱 프로필을 백업한다.
6. 필터된 Harness tree, 생성된 프로필, 새로 설치할 dependency를 staging한다.
7. staging 전체가 완료되면 Harness → 프로필 → dependency 순서로 promotion하고 각 action을 기록한다.
8. 실패하면 완료 action을 역순으로 rollback한다. 임시 stage를 정리하고 설치·backup 위치와 정확한 활성화 안내를 출력한다.

설정·생성·대상 preflight 오류는 5단계 전에 실패하여 대상 filesystem을 변경하지 않는다. staging 실패는 기존 active 파일을 유지한다. promotion 실패에는 기존 reverse rollback이 적용된다. 실패 후 새 인프라 디렉터리·backup이 남을 수 있으므로 filesystem 전체의 원자성을 보장한다고 설명하지 않는다.

선택한 Codex home 또는 `~/.agents/skills`에 dependency가 있으면 기존 정책대로 보존하고 위치를 알린다. installer는 보존한 버전의 호환성을 검증하거나 보장하지 않는다.

## 8. Manifest와 mutable 설정

`MANIFEST.sha256` 필수 coverage는 `install.py`, `install.command`, 새 root `README.md`, `skill/models.toml`을 제외한 모든 선택된 skill 파일, 일곱 프로필 템플릿, 선택된 dependency 파일이다. 공통 모듈도 포함한다. 구현 계획용 문서와 spec은 배포 payload가 아니므로 coverage에 포함하지 않는다.

manifest에는 `skill/models.toml`, `.DS_Store`, manifest 자신을 넣지 않는다. mutable 설정은 필수 regular file이고 schema 검증을 통과해야 한다. 편집된 immutable payload를 수용하기 위한 자동 manifest 재생성은 하지 않는다.

필수 coverage와 복사는 같은 선택 정책을 사용한다. unsafe path, 중복 entry, 누락 immutable 파일, 잘못된 type, hash mismatch는 오류다. mutable 설정 제외는 정책 편집에 대한 checksum 보호를 없애는 승인된 선택이다. schema 검증은 구조를 제한하지만 유효한 정책 변경이나 작성자 신뢰를 증명하지 않는다. 설정 값으로 executable code·filesystem path를 선택하지 않는다. manifest 자체도 별도의 authenticity 보장은 아니다.

## 9. `.DS_Store` 제외 정책

`skill`, `agents`, `dependencies` 모든 깊이에서 basename이 정확히 `.DS_Store`인 regular file을 제외한다. 같은 정책을 필수 payload 열거, dependency 발견, manifest coverage, Harness·dependency 복사에 적용한다.

dependency root에서는 `.DS_Store`를 무시하되 나머지 entry가 skill 디렉터리여야 하며 선택된 dependency가 하나 이상 있어야 한다. hidden file 전체나 예상치 못한 파일 전체를 무시하지 않는다. `.DS_Store` 이름의 directory 등 unexpected type은 오류다. 기존 symlink 검사는 제외 전에 유지하여 `.DS_Store` 이름의 symlink도 실패한다. 예상치 못한 immutable 파일은 coverage 검증 대상이다. root `.DS_Store`는 복사 tree 밖이다.

## 10. 변경 파일과 안내

대상 파일:

- `skill/models.toml`: version 2와 편집 가능한 로컬 정책 안내
- `skill/scripts/model_config.py`: 새 공통 검증·rendering
- `skill/scripts/apply-models.py`: 공통 로직과 설치 프로필 CLI
- `agents/*.toml`: 일곱 모델 없는 템플릿
- `install.py`: 생성 preflight, staging, manifest·선택 계약, 완료 안내
- `skill/SKILL.md`: 하드코딩된 Sol 제한 제거, matrix 검증과 설정 적용·새 session reload 안내
- `config.toml`: 모델·effort 주석 기본값 제거, 선택적 concurrency 예시 유지
- `README.md`: 한국어로 설치·Python 전제·설정 편집·CLI 의미·dependency 보존·backup·무결성 한계·수동 활성화를 설명한다. 제목·본문·활성화 안내와 loader 문구를 한국어로 작성하고 명령어·경로·설정 키·모델 ID는 정확한 원문 표기를 유지한다.
- `MANIFEST.sha256`: 최종 immutable coverage

README 전체 설명은 한국어로 작성하며 다음 한국어 loader 문구를 직접 제공한다.

```markdown
여러 단계의 조사, 분석, 문서 작성 또는 구현이 필요한 요청에는
`~/.codex/skills/yunho-harness/SKILL.md`를 읽고 따른다.
같은 대화의 관련 후속 요청에도 적용한다.
`~`는 현재 사용자의 홈 디렉터리로 해석한다.
```

custom `CODEX_HOME`에서는 실제 설치 skill 경로를 사용하도록 안내한다. 설치 완료 출력은 실제 번들 README와 설치된 skill 경로를 가리킨다. 없는 `AGENTS.harness.md`를 참조하지 않는다. 사용자가 수동으로 적절한 AGENTS에 loader를 넣고 Codex를 재시작하거나 새 session에서 프로필을 reload한다. global AGENTS/config는 installer가 변경하지 않는다.

새 설치는 backup·rollback을 통해 Harness와 프로필을 교체하므로 기존 프로필의 수동 migration이 필요 없다. 이전 version 1 설정을 새 적용기에서 사용하려면 문서의 version 2 matrix로 변경해야 한다. 기존 설치 정책을 새 번들 설정으로 자동 병합하지 않는다.

## 11. Acceptance criteria

1. 역할 값과 모델별 effort 정책의 소스는 `models.toml`뿐이다.
2. 일곱 저장소 템플릿에 모델·effort root 값이 없다.
3. 설치 프로필 값은 선택한 설정과 정확히 일치한다.
4. 모델 정책 변경에 Python 모델별 수정이 필요 없다.
5. 일반 installer 실행 한 번으로 생성·설치하며 유효 설정 편집 뒤 수동 apply나 manifest 재생성이 필요 없다.
6. 설치 `--check`는 생성 가능성, 적용 `--check`는 설치 프로필 drift를 검증한다.
7. 입력·대상 preflight가 대상 생성보다 먼저 완료된다.
8. 적용기는 필요한 모델 필드·separator 외의 bytes를 보존하고 rendering은 idempotent하다.
9. `.DS_Store` 선택·검증·복사 정책이 일치한다.
10. backup·rollback·dependency 보존·경로 안전성 계약이 유지된다.
11. 안내가 존재하는 문서·설치 경로를 가리키고 수동 활성화 범위를 정확히 설명한다.
12. CLI 성공을 원격 모델 지원의 증거로 설명하지 않는다.
13. README의 제목·본문·활성화 안내·loader 문구는 한국어이며, 실행 명령·경로·설정 키·모델 ID의 정확한 표기를 유지한다.

## 12. 검토와 검증 제약

현재 지시에서는 테스트를 추가하거나 실행하지 않는다. 이 spec 단계는 문서와 source 검토만 수행한다. 구현 완료 시 행동 검증을 수행하지 않았다면 그 한계를 명시하고 실행 결과 없이 pass를 주장하지 않는다. 별도로 허용된 비테스트 확인과 독립 검토의 구체적 범위는 이후 계획에 기록한다.

필수 검토는 값·제한의 설정 출처, 템플릿 지침 보존, renderer의 중복 키·escape·누락 필드·table 경계·newline 처리, 두 CLI의 공통 호출, 대상 mutation 전 생성, backup·stage·promotion·reverse rollback 순서, payload 선택·coverage·copy 정책 일치, 문서 경로·scope다.

추후 행동 검증이 허용되면 fresh install, 설정만 변경한 설치, 설치 drift, 잘못된 설정·프로필, `.DS_Store`, 비모델 bytes 보존과 rollback failure를 다룬다. 현재 이를 실행·통과했다고 보고하지 않는다.

## 13. 계획 의존성과 spec self-review

공통 schema·renderer → 템플릿·적용 CLI → 설치 lifecycle → payload 선택·manifest → 문서·최종 검토의 의존성이 있다. 공유 상태, mutable/immutable 경계, 설치 순서와 rollback을 변경하므로 작성된 spec 승인 후 proportional writing-plans가 필요하다. 한국어 README 요구가 추가되어 계획 작성을 중단했으며 수정 spec 승인 전에는 계획 작성을 재개하거나 구현을 시작하지 않는다.

Planner 자체 검토와 Lead 통합 검토를 완료했다. placeholder, 단계 모순, 넓어진 범위, 이중 해석을 확인했다. Lead는 초기 목록을 기존 로컬 정책과 일치시키고, 설정 예시 주석 중복 제거·README coverage·manifest 검증 이후 모듈 loading·명시 경로 우선순위·`.DS_Store` type 처리·검증 제약을 명확히 했다. 후속 사용자 요구에 따라 README 전체 설명·활성화 문구를 한국어로 정하고 acceptance criteria에 반영했다. 설명 언어와 실행 표기의 경계를 확인했으며 열린 설계 결정은 없다. 다음 gate는 수정된 written-spec의 사용자 검토·재승인이다.
