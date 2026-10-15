# 모델 설정 단일 소스 Implementation Plan

> **For agentic workers:** `writing-plans`가 권장하는 `superpowers:subagent-driven-development`와
> `superpowers:executing-plans`는 현재 제공된 스킬 목록에 없다. 실행은 ARC의 역할·소유권·승인 규칙을 따른다. 제품 편집은 한 Coder가 담당하며 checkbox
> 순서대로 진행한다.

**Goal:** `models.toml`만으로 역할 모델과 로컬 effort 정책을 관리하고 번들 `install.py` 한 번으로 프로필을 생성·설치한다.

**Architecture:** 모델 없는 일곱 TOML 템플릿을 공통 validator/renderer로 완성한다. 적용기와 설치기는 같은 모듈을 사용한다. 설치기는 manifest 검증 후 메모리 생성·대상
preflight·backup·staging·promotion 순서로 동작한다.

**Tech Stack:** Python 3.11 이상, 표준 라이브러리, UTF-8 TOML, SHA-256 manifest.

**Spec:** [승인된 설계](../specs/2026-10-03-models-source-design.md), commit `53bb7e6f9dff7a2b79589f6f4f82c8f6e4eb0fa9`.

## Global Constraints

- Python 3.11 이상, 외부 Python dependency 추가 없음.
- 설정 version은 정수 2. version 1 자동 migration·fallback 없음.
- 역할 모델·effort와 모델별 정책은 `skill/models.toml`만 정의한다.
- Python에 모델별 regex, effort enum·순위·상한·대체 모델을 두지 않는다.
- 로컬 정책은 원격 모델 지원·계정 권한·가용성을 증명하지 않는다.
- `.DS_Store` regular file만 제외한다. 같은 이름의 symlink·directory·unexpected type은 오류다.
- 입력·대상 preflight는 대상 filesystem mutation 전에, 모든 staging은 active-target promotion 전에 완료한다.
- 필요한 모델 필드·separator 외의 프로필 bytes와 기존 backup·rollback·dependency 보존 정책을 유지한다.
- 자동 AGENTS 활성화·global config 병합 없음.
- README 제목·본문·활성화 안내·loader는 한국어. 명령·경로·키·모델 ID는 정확한 원문 표기를 유지한다.
- 테스트 추가·실행, runtime·CLI·컴파일 확인을 하지 않는다. 소스·diff 검토만 수행하고 행동 검증 성공을 주장하지 않는다.
- 기존 변경과 미추적 파일을 보존한다. 전체 index를 일괄 추가하거나 무관한 파일을 커밋하지 않는다.

## Review Focus

실행 검증 대신 아래 입력·실패 조건을 담당 작업의 source/diff 검토에 배정한다.

1. 잘못된 schema·중복 키·미등록 모델·허용 목록 밖 effort는 대상 mutation 전 오류다. Task 1, 3.
2. 모델 필드 누락·root/table 경계·multiline 지침·EOF newline 부재는 비모델 bytes를 보존하여 처리한다. Task 1, 2.
3. 설정 편집은 허용하고 immutable hash 실패는 공통 모듈 load 전에 중단한다. Task 3, 4.
4. `.DS_Store` type과 예상 밖 dependency entry는 selection·coverage·copy가 일치해야 한다. Task 3.
5. staging·promotion 실패는 기존 파일 보존·역순 rollback, 기존 dependency는 retention 계약을 따른다. Task 3, 5.

## 파일 책임과 의존성

한 Coder가 아래 제품 파일 전체를 소유한다. Lead는 승인·통합·완료 판단을 맡으며 QA와 Reviewer는 읽기 전용이다.

| 파일                               | 책임                                           |
|------------------------------------|------------------------------------------------|
| `skill/models.toml`                | version 2 matrix와 역할 값                     |
| `skill/scripts/model_config.py`    | 새 공통 검증·bytes rendering                   |
| `skill/scripts/apply-models.py`    | 설치 프로필 CLI·파일 transaction               |
| `agents/arc-lead.toml`      | Lead 템플릿                                    |
| `agents/arc-secretary.toml` | Secretary 템플릿                               |
| `agents/arc-planner.toml`   | Planner 템플릿                                 |
| `agents/arc-scout.toml`     | Scout 템플릿                                   |
| `agents/arc-coder.toml`     | Coder 템플릿                                   |
| `agents/arc-qa.toml`        | QA 템플릿                                      |
| `agents/arc-reviewer.toml`  | Reviewer 템플릿                                |
| `install.py`                       | payload 선택·manifest·모듈 load·설치 lifecycle |
| `skill/SKILL.md`                   | 모델 설정·적용 workflow                        |
| `config.toml`                      | 모델 주석 제거·수동 concurrency 예시           |
| `README.md`                        | 새 한국어 설치·설정·활성화 안내                |
| `MANIFEST.sha256`                  | 최종 immutable 해시·coverage                   |

`install.command` wrapper, dependency skill 내용, global 설정, AGENTS, `.idea`, `.DS_Store`는 편집 대상이 아니다. 필요가 발견되면 Coder는 근거를
Lead에게 전달한다.

Task 1 공통 인터페이스 → Task 2 템플릿·적용기 → Task 3 설치 lifecycle → Task 4 문서·최종 manifest → Task 5 독립 검토 순서다. 공유 rendering과 설치
상태·rollback 순서 때문에 계획을 생략할 수 없다. 제품 편집은 병렬화하지 않는다.

## Task 1: 설정 schema와 공통 validator/renderer

**Files:** 생성 `skill/scripts/model_config.py`, 수정 `skill/models.toml`. 설계 3–5절을 따른다.

**Interfaces:** 공통 모듈은 다음 이름·타입을 제공한다. 여기의 signature는 구현할 계약이며 stub 파일을 미리 생성하라는 지시가 아니다.

```text
ValidationError(Exception)
RoleSettings: TypedDict {model: str, model_reasoning_effort: str}
ROLE_FILES: dict[str, str]
load_settings(config_path: Path) -> dict[str, RoleSettings]
validate_template(profile_bytes: bytes, role: str, source_path: Path) -> None
render_profile(profile_bytes: bytes, role: str, settings: RoleSettings, source_path: Path) -> bytes
```

모듈은 파일 쓰기·CLI 출력·원격 호출을 하지 않는다. 역할 매핑은 현재 일곱 역할과 파일명을 그대로 사용한다.

- [ ] **1. version 2 설정 작성.** 설계의 전체 예시를 적용한다. Sol 허용 목록은 `none,minimal,low,medium,high`, Luna는 이에 `xhigh,max,ultra`를
  추가한다. 일곱 역할 값은 유지한다. exact model ID·허용 목록 편집 방법과 로컬 정책 한계를 주석에 설명한다.
- [ ] **2. 설정 검증 구현.** 최상위·모델·역할 exact key set, `type(version) is int`와 값 2, 비어 있지 않은 table·배열, 문자열 주변 공백·제어 문자·줄바꿈, 중복
  목록, 정확한 일곱 역할을 검증한다. UTF-8·TOML 오류를 입력 경로·위반 key를 포함한 `ValidationError`로 변환한다. 모델별 검증은 아래 membership으로만 결정한다.

```python
allowed = models[model]["allowed_reasoning_efforts"]
if effort not in allowed:
    raise ValidationError(
        f"roles.{role}: effort {effort!r} is not allowed for {model!r}"
    )
```

- [ ] **3. 템플릿·root 위치 검증 구현.** 먼저 TOML parse로 중복 key와 이름을 검증한다. lexical scanner는 한 줄 string과 multiline basic/literal
  string의 상태를 구분하여 지침 내부 `[`·`model =`를 assignment/table로 인식하지 않는다. bare/quoted root key의 parse 결과와 위치 판단을 비교하고 안전하게 특정할
  수 없는 모델 assignment 표현은 오류로 처리한다.
- [ ] **4. bytes rendering 구현.** 기존 한 줄 모델 문자열은 literal만 바꾼다. 값이 같으면 원래 literal을 유지한다. 누락 필드는 첫 실제 table 앞 또는 table이 없는
  EOF에 추가한다. 기존 newline 방식과 EOF separator 규칙을 따른다. 입력 제어 문자를 거부한 뒤 `json.dumps(value, ensure_ascii=False)`로 한 줄 literal을
  생성하고 결과를 다시 TOML parse하여 역할과 값이 맞는지 확인한다.
- [ ] **5. 소스·diff 검토.** schema 오류, 중복 키, nested field 보존, multiline 경계, CRLF/LF, EOF comment, escape, 재파싱, idempotence의
  분기를 읽고 근거 위치·남은 우려를 기록한다. 실행하지 않는다.

**산출물:** 쓰기 없이 설정과 프로필 bytes를 검증·생성하는 모듈. Lead가 인터페이스를 확인한 뒤 Task 2로 진행한다.

## Task 2: 모델 없는 템플릿과 적용 CLI

**Files:** 일곱 `agents/*.toml`, `skill/scripts/apply-models.py`.

**Consumes:** Task 1의 `ROLE_FILES`, `ValidationError`, `load_settings`, `render_profile`.

**Produces:** 기존 옵션·transaction을 유지한 공통 renderer 기반 적용기. 내부 helper `read_profile_safely(path: Path) -> bytes`는 symlink
component·regular-file type을 확인하고 읽기 오류를 `ValidationError`로 변환한다.

- [ ] **1. 템플릿에서 두 root 모델 필드만 제거.** 이름·설명·지침 bytes를 보존하고 placeholder를 추가하지 않는다.
- [ ] **2. 중복 정책·renderer 제거.** 적용기의 effort enum·rank·Sol regex·역할 매핑·중복 rendering을 공통 모듈 호출로 교체한다. 모든 프로필을 먼저 안전하게 읽고
  rendering한 뒤 변경된 bytes만 기존 transaction에 전달한다.

```python
settings = load_settings(config_path)
for role, filename in ROLE_FILES.items():
    path = agents_dir / filename
    original = read_profile_safely(path)
    updated = render_profile(original, role, settings[role], path)
    if original != updated:
        updates[path] = (original, updated, path.stat().st_mode)
```

- [ ] **3. 경로·exit 의미 연결.** 명시적 `--agents-dir` → 비어 있지 않은 `CODEX_HOME/agents` → `~/.codex/agents` 순서다. 명시 경로가 있으면 사용하지
  않는 환경 기본값의 빈 값으로 거부하지 않는다. 설정 기본값은 script 인접 skill의 `models.toml`이다. `--check` 일치 0·drift 1, `--dry-run` 유효 drift 0,
  검증 오류 2를 유지한다. 누락 프로필은 오류다.
- [ ] **4. 소스·diff 검토.** 일곱 템플릿의 지침 보존, 모든 준비 후 쓰기 시작, 모델 필드 추가, read-only 분기, staged replacement·reverse rollback을
  추적한다.

**산출물:** 모델 없는 템플릿과 설치 프로필 drift를 확인·적용하는 CLI.

## Task 3: 설치 payload 선택과 생성·설치 lifecycle

**File:** `install.py`.

**Consumes:** 공통 모듈 계약, 템플릿, 번들 설정.

**Internal interfaces:** `selected_tree_files(tree: Path) -> tuple[Path, ...]`는 type·symlink를 검증하여 선택 regular file을
반환한다. `dependency_sources(root: Path) -> tuple[Path, ...]`는 선택 dependency 디렉터리를 반환한다.
`load_model_module(root: Path) -> ModuleType`는 manifest 이후 절대 경로 모듈을 load한다.
`preflight_profiles(root: Path, module: ModuleType) -> dict[str, bytes]`는 모든 생성 bytes를 반환한다.
`perform_install(root: Path, home: Path, rendered_profiles: dict[str, bytes], dry_run: bool = False) -> None`는 이 bytes를
받아 staging한다. `Path`는 `pathlib`, `ModuleType`은 `types`에서 가져온다. preflight helper는 대상에 쓰지 않는다.

- [ ] **1. 선택 정책 통합.** 제외 전에 tree의 type·symlink를 확인한다. `.DS_Store` regular file만 skip하며 같은 이름의 directory·symlink·특수
  type은 오류다. dependency root의 다른 entry는 directory여야 하며 하나 이상 선택되어야 한다. hidden file 전체를 제외하지 않는다.
- [ ] **2. manifest 계약 변경.** 필수 set은 installer·wrapper·README와 선택 skill/template/dependency 파일이다. mutable
  `skill/models.toml`을 제외한다. manifest 자신·mutable 설정·`.DS_Store` listed entry는 오류다. unsafe path·중복 entry·type·누락
  coverage·hash mismatch는 모듈 load 전에 실패한다.
- [ ] **3. 명시 모듈 load·생성 preflight 연결.** apply subprocess `--check`를 제거한다. manifest 성공 후 번들
  `skill/scripts/model_config.py`를 `importlib.util`로 load하고 필요하면 stable private name으로 `sys.modules`에 등록한다. 기존 설치 모듈이나
  현재 디렉터리를 검색하지 않는다. 읽기 전 safety/type 검사를 끝낸다.

```python
settings = module.load_settings(root / "skill" / "models.toml")
rendered = {}
for role, filename in module.ROLE_FILES.items():
    source = root / "agents" / filename
    content = source.read_bytes()
    module.validate_template(content, role, source)
    rendered[filename] = module.render_profile(content, role, settings[role], source)
```

- [ ] **4. 대상 preflight·read-only 분기 연결.** payload safety → manifest → 설정·템플릿·생성 → dependency·대상 검사 순서다. `--check`도
  입력·대상 경로 preflight를 마친 뒤 생성 검증 성공을 출력한다. `--dry-run`은 같은 검증과 대상·retention 결정을 출력한다. 두 분기 모두 mkdir·backup·stage에 도달하지
  않는다.
- [ ] **5. 생성 프로필·필터 tree staging.** 소스 프로필 직접 복사 대신 생성 bytes를 stage에 기록한다. ARC·dependency copy는 사전 검증된 `.DS_Store`만
  같은 정책으로 제외한다. copy ignore가 unsafe type을 숨기지 않도록 검사와 제외 책임을 구분한다.
- [ ] **6. lifecycle 유지.** 모든 preflight 후 대상·backup 생성, 기존 ARC·프로필 backup, 모든 staging 후 ARC → 프로필 → dependency
  promotion을 수행한다. 각 mutation action과 reverse rollback, 중간에 나타난 dependency target 거부, cleanup·rollback 오류 보고를 유지한다. 기존
  dependency는 보존하고 버전 호환성을 보장하지 않는다.
- [ ] **7. 소스·diff 검토.** manifest-before-import, preflight-before-mutation, staging-before-promotion, action 기록·역순
  restoration, read-only 분기 범위를 근거 위치로 남긴다.

**산출물:** 수동 apply 없는 installer와 일관된 payload 정책. Lead가 lifecycle 결과를 확인한 뒤 Task 4로 진행한다.

## Task 4: 한국어 문서와 최종 manifest

**Files:** `README.md`, `skill/SKILL.md`, `config.toml`, `MANIFEST.sha256`, `install.py` 완료 문구.

**Consumes:** Task 1–3의 확정 schema·CLI·selection 계약.

- [ ] **1. 한국어 README 작성.** Python 전제 → `python3 install.py` → 두 read-only 옵션 → 모델 matrix 편집 → 설치 프로필 적용 →
  backup·dependency retention → 수동 활성화 → mutable 무결성·원격 지원 한계 순서로 설명한다. version 1 변경과 custom `CODEX_HOME`도 포함한다.
  제목·본문·활성화 loader는 한국어이며 identifier는 유지한다. loader는 승인 spec의 다음 문구다.

```markdown
여러 단계의 조사, 분석, 문서 작성 또는 구현이 필요한 요청에는
`~/.codex/skills/arc/SKILL.md`를 읽고 따른다.
같은 대화의 관련 후속 요청에도 적용한다.
`~`는 현재 사용자의 홈 디렉터리로 해석한다.
```

- [ ] **2. skill·config·완료 안내 동기화.** 고정 Sol cap을 matrix 검증 설명으로 바꾸고 설정 적용·새 session reload를 안내한다. config 모델 주석만 제거하고
  concurrency 예시는 유지한다. 완료 안내는 실제 번들 README·설치 skill 경로를 출력하며 없는 `AGENTS.arc.md` 참조를 제거한다.
- [ ] **3. 최종 immutable bytes로 manifest 제작.** 제품 파일 확정 후 SHA-256을 계산하여 artifact를 쓴다. 이는 payload 제작이며 runtime 검증이 아니다.
  installer·apply·컴파일·검증 script를 실행하지 않는다. installer/wrapper/README, 선택 skill (설정 제외), 일곱 템플릿, dependency를 포함하고 설정·
  `.DS_Store`·manifest·spec/plan은 제외한다.
- [ ] **4. 소스·diff 검토.** 문서와 CLI 의미, 한국어 설명·정확한 identifier, manifest path inventory와 selection 로직을 대조한다. hash 검증 실행 성공을
  주장하지 않는다.

**산출물:** 한국어 README, 일치하는 안내, 최종 payload manifest.

## Task 5: QA 소스 검토와 독립 Reviewer

**Files:** Task 1–4 diff 전체, 읽기 전용.

- [ ] **1. Coder 결과 전달.** 변경 파일·criteria별 근거 위치·정적 검토·미해결 사항·runtime 미검증을 Lead에게 보고한다.
- [ ] **2. QA가 source/diff 사용자 흐름 추적.** fresh install, 설정만 편집, 설치 drift, invalid input, `.DS_Store`, custom 경로 분기를 읽고
  계약과 비교한다. 테스트·CLI·runtime을 실행하지 않는다.
- [ ] **3. Coder에 finding 전달.** Lead가 조치할 항목을 같은 Coder에게 전달한다. 수정 후 QA는 영향을 받은 source 경로만 재검토한다.
- [ ] **4. 독립 Reviewer 검토.** byte 보존, 로컬 정책 경계, manifest-before-import, path safety, copy/coverage 일치,
  transaction·rollback, 안내의 주장을 검토하고 미실행 한계를 명시한다.
- [ ] **5. 완료 판단.** Lead가 finding을 해소하거나 이유와 disposition을 기록한다. 제품 수정은 Coder만 한다. 변경 파일만 선택하여 Conventional Commit과 구체적
  한국어 설명으로 커밋한다. 다른 staged·미추적 파일은 포함하지 않는다.

**산출물:** 남은 우려와 행동 검증 한계를 포함한 독립 검토 근거. 실행 근거 없이 행동 acceptance 통과를 주장하지 않는다.

## Acceptance Mapping

| Spec criterion               | 작업·근거                            |
|------------------------------|--------------------------------------|
| 1–4 단일 소스·템플릿·값·정책 | Task 1–2 matrix/module/template diff |
| 5 installer·mutable 설정     | Task 3–4 생성 흐름·coverage          |
| 6 두 check 의미              | Task 2–4 분기·문서                   |
| 7 mutation 전 preflight      | Task 3 control-flow                  |
| 8 bytes·idempotence          | Task 1–2 renderer                    |
| 9 제외 정책                  | Task 3–4 selection/copy/manifest     |
| 10 lifecycle·안전성          | Task 2–3, Task 5 독립 검토           |
| 11–12 안내·원격 주장 제한    | Task 4–5                             |
| 13 한국어 README             | Task 4 언어·identifier 검토          |

## 유보된 행동 검증

추후 명시적 실행 승인이 있으면 fresh install, config-only reinstall, apply drift, 잘못된 입력, LF/CRLF·multiline·EOF 보존, `.DS_Store` type,
custom 경로, staging·promotion failure와 rollback을 검증한다. 현재 테스트를 만들거나 실행하지 않으며 source 검토를 행동 실행 성공으로 취급하지 않는다.

## Self-review와 실행 선택

Lead는 승인 spec의 13개 criteria coverage, placeholder, 인터페이스 이름·타입, 다섯 Review Focus의 작업 배정을 확인했다. 공통 signature와 호출자가 일치하며
`.DS_Store` type 검사는 제외 전, import는 manifest 후다. source/diff-only 제약과 한국어 README를 반영했다. 열린 설계 결정은 없다.

**추천은 ARC로 조정한 subagent-driven 실행이다.** 한 Coder가 순차 작업하고 Lead가 Task 1 공통 인터페이스와 Task 3 설치 lifecycle의 산출물을 확인한다. 최종
QA와 독립 Reviewer를 사용한다. 공유 인터페이스와 rollback 순서가 후속 작업에 영향을 주므로 두 중간 확인 지점이 유용하다.

Native를 선택해도 ARC 소유권에 따라 한 Coder가 모든 작업을 연속 수행하며 Lead는 제품 코드를 수정하지 않는다. 최종 QA·Reviewer는 유지한다. 어느 방식도 task마다 fresh
agent를 자동 생성하거나 중복 검토를 요구하지 않는다. 관련 session을 재사용하고 한 owner·최대 세 leaf 제한을 따른다.

다음 단계는 사용자 계획 검토·승인과 실행 방식 선택이다. 그 전에는 Coder·구현을 시작하지 않는다.
