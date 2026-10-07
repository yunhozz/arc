# 역할 이름 정규화와 README 한국어화 구현 계획

> **작업 역할 안내:** `writing-plans`의 실행자 지시는 Harness의 CEO 순차 조율 방식으로 적용한다. Coder와 Secretary는 배정된 범위만 편집하고 QA와 Reviewer는 읽기 전용으로 검증한다. 별도 실행 방식 선택이나 역할의 재위임은 하지 않는다.

**목표:** 역할 이름과 모델 설정을 새 체계로 바꾸고 기존 설치 프로필을 안전하게 이전하며 README 설명을 한국어로 정리한다.

**구성:** 여섯 역할의 ID·파일명·모델 키를 함께 변경한다. 기존 설치 후보 제거를 백업·설치·역순 복구 거래에 포함한다. 구현과 문서를 순서대로 변경한 뒤 저장소 정적 검사와 manifest 갱신을 수행한다.

**기술:** Python 3.11 이상, 표준 라이브러리 `unittest`, `tomllib`, `pathlib`, `hashlib`, TOML, Markdown.

**설계 명세:** `/Users/yunho/.codex/worktrees/cd32/yunho-harness/docs/superpowers/specs/2026-10-08-role-naming-normalization-design.md`

**작업공간:** `/Users/yunho/.codex/worktrees/cd32/yunho-harness`

**계획 저장 경로:** `/Users/yunho/.codex/worktrees/cd32/yunho-harness/docs/superpowers/plans/2026-10-08-role-naming-normalization.md`

## 공통 제약

- 역할 suffix는 `secretary`, `planner`, `scout`, `coder`, `qa`, `reviewer` 여섯 개다.
- 역할 ID는 `harness_<role>`, 프로필 파일은 `agents/harness-<role>.toml`이다.
- 모델 설정은 `version = 4`다. 버전 `1`, `2`, `3`은 자동 변환하지 않는다.
- 모델 ID·추론 강도·역할 책임·권한·보고 관계는 기존 값을 유지한다.
- 이전 접두사는 `("_".join(("yunho", "team")), "-".join(("yunho", "team")))`로 구성한다. 저장소 파일 내용과 경로에 두 연속 문자열을 남기지 않는다.
- 이전 설치 후보는 위 여섯 역할 파일뿐이다. 폐기 역할과 다른 사용자 프로필은 제거하지 않는다.
- 이전 후보 제거는 복구 가능한 이동이며 새 프로필 설치보다 먼저 수행한다.
- 실제 사용자 홈·외부 설치 스킬·Git 이력은 변경하지 않는다.
- README 설명 문장을 한국어로 번역하고 기술 literal·제품명·명령·경로·URL을 보존한다.
- `skill/models.toml`은 manifest에서 제외한다.
- 작업 1·2의 행동·설정·설치 마이그레이션에만 실패 우선 테스트를 추가한다. 문서 변경에는 새 테스트를 추가하지 않는다.
- 저장소 전체 내용·경로 검사는 문서 작업 완료 후 작업 4의 정적 검증 명령으로 수행한다.
- 아래 명령은 지정 작업공간에서 실행한다. 설치·모델 적용 테스트는 임시 경로만 사용한다.

## 집중 검토 사항

| 조건 | 기대 동작 | 담당 테스트 |
|---|---|---|
| 이전 후보 일부와 새 프로필 공존 | 양쪽 원본 백업 후 새 여섯 프로필 설치 | `test_migration_partial_and_existing_new_profiles` |
| 두 번째 이전 후보 이동 실패 | 먼저 이동한 후보까지 원래 위치로 복구 | `test_migration_move_failure_restores_profiles` |
| 새 프로필 설치 후 이전 후보 복구 실패 | 영구 백업과 recovery 원본 보존·보고 | `test_migration_rollback_failure_preserves_recovery` |
| 후보가 symlink·디렉터리·FIFO인 경우 | 설치·취득 전에 거부하고 대상 유지 | `test_migration_rejects_unsafe_candidates` |
| 폐기 역할 및 비슷한 다른 파일명 | 내용·경로·유형 유지 | `test_migration_preserves_unrelated_profiles` |

## 실행 순서와 소유권

**계획 승인·인계 → 작업 1 → 작업 2 → Secretary 작업 3 → Coder 작업 4 → QA → Reviewer → CEO**

Coder는 구현·설정·테스트·manifest와 `skill/SKILL.md`를 소유한다. Secretary는 README와 과거 `docs/superpowers/` 문서만 소유한다. CEO는 현재 승인 spec·plan과 정본 인계 기록을 통합한다. 같은 파일의 편집 권한을 동시에 배정하지 않는다.

작업별 결과 보고는 자동적인 QA·Reviewer 게이트나 커밋을 추가하지 않는다. 위험도에 따른 최종 검증 흐름은 전체 변경에 적용한다.

---

## 작업 1: 역할 매핑과 모델 형식 변경

**담당:** Coder

**파일:**

- 이름 변경: `agents/`의 이전 프로필 여섯 개 → `agents/harness-<role>.toml`
- 수정: `install.py`
- 수정: `skill/models.toml`
- 수정: `skill/scripts/model_config.py`
- 수정: `skill/SKILL.md`
- 테스트 수정 및 추가: `tests/test_install.py`
- 읽기 전용: `skill/scripts/apply-models.py`

**인터페이스:**

- `ROLE_FILES: dict[str, str]`: 새 역할 ID에서 새 파일명으로 매핑한다.
- `load_settings(config_path: Path) -> dict[str, RoleSettings]`: 정확한 버전 `4`와 여섯 역할을 검증한다.
- `serialize_settings(settings: dict[str, RoleSettings]) -> bytes`: 버전 `4`를 직렬화한다.
- `validate_template(...)`, `render_profile(...)`: 기존 signature를 유지하고 새 ID를 검사한다.
- `PROFILE_FILES`: `ROLE_FILES.values()`와 일치하는 여섯 파일명이다.
- 테스트 helper는 `settings_bytes(..., version=4)` 및 `ModelSettingsTests.load(..., version=4)`를 사용한다.

- [ ] **1. 새 설정 계약의 실패 테스트를 작성한다.**

기존 모델·프로필 기대값을 갱신하고 다음 테스트를 추가한다.

| 테스트 | 필수 확인 |
|---|---|
| `test_naming_v4_settings_and_serialization` | 새 여섯 역할과 기존 모델 값 일치, 직렬화한 TOML의 `version == 4`, 다시 읽은 값 일치 |
| `test_naming_rejects_old_versions_and_keys` | 버전 `1`, `2`, `3`, `True` 및 버전 `4`의 이전 역할 키 거부, 설정 bytes 불변 |
| `test_naming_profile_identity_and_mapping` | 파일명·설치 목록·매핑 일치, 각 프로필 `name` 일치 |
| `test_naming_rejects_profile_name_mismatch` | 다른 `name`을 가진 template의 검증 실패 |
| `test_naming_apply_models_v4_contract` | 임시 환경의 check `0`/`1`, dry-run `0`, apply `0`, 잘못된 설정 `2`, 설정 원본 불변 |
| `test_naming_apply_models_failure_restores_profiles` | 두 번째 교체 실패 후 기존 프로필 bytes·mode 복구 및 임시 파일 정리 |

핵심 기대값은 다음과 같다.

```python
roles = ("secretary", "planner", "scout", "coder", "qa", "reviewer")
expected = {f"harness_{role}": f"harness-{role}.toml" for role in roles}
self.assertEqual(self.module.ROLE_FILES, expected)
self.assertEqual(set(installer.PROFILE_FILES), set(expected.values()))
self.assertEqual(tomllib.loads(serialized.decode())["version"], 4)
```

기존 정책 테스트의 프로필 경로와 역할 기대값도 새 이름으로 갱신한다. 이전 형식 fixture는 구성 요소를 결합해 만든다. 문서 검사용 새 테스트는 추가하지 않는다.

- [ ] **2. RED를 확인한다.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k naming -v
```

기대: 기존 매핑·버전 때문에 새 계약 assertion이 실패한다. import 오류나 테스트 발견 실패는 RED 증거가 아니다.

- [ ] **3. 새 이름과 버전 계약을 구현한다.**

여섯 프로필 파일명과 `name`, 모델 매핑, 설치 파일 목록, 버전 검증·직렬화·설정 원본을 함께 변경한다. 이전 버전 오류는 새 버전과 업데이트 필요성을 안내한다. `skill/SKILL.md`의 역할 별칭도 정규화한다.

`apply-models.py`는 공유 매핑을 쓰는 기존 구조를 유지한다. 테스트가 입증하는 추가 변경이 필요한 경우에만 해당 파일을 수정한다.

- [ ] **4. GREEN과 관련 회귀를 확인한다.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k naming -v
python3 -B -m unittest discover -s tests -p test_install.py -k ModelSettingsTests -v
python3 -B -m unittest discover -s tests -p test_install.py -k ApplyModelsTests -v
```

기대: 세 명령 모두 `OK`다.

- [ ] **5. CEO에게 결과를 보고한다.**

변경 목록, RED/GREEN 근거와 남은 항목을 반환한다. manifest와 전체 설치 payload 검증은 아직 끝나지 않았음을 표시한다.

## 작업 2: 이전 설치 프로필의 거래상 제거와 복구

**담당:** Coder

**의존:** 작업 1 완료

**파일:**

- 수정: `install.py`
- 테스트 수정 및 추가: `tests/test_install.py`

**인터페이스:**

- 추가: `legacy_profile_targets(home: Path) -> dict[str, Path]`
  - 정확한 여섯 후보를 구성하고 안전성을 검사한다.
  - 존재하는 일반 파일만 반환한다.
- `install_plan(...)`: 반환 tuple은 유지하고 helper로 이전 후보를 검사한다.
- `perform_install(...)`: 후보를 dry-run에 표시하고 외부 취득 뒤 다시 검사한다. 후보 집합이 바뀌면 거래 시작 전에 거부한다.
- `backup_existing(..., *, legacy_targets: dict[str, Path]) -> None` 확장: 원본을 `backup_root / "agents" / filename`에 보존한다.
- `_transactional_install(..., *, legacy_targets: dict[str, Path]) -> Path` 확장: 이전 후보 이동 action을 새 프로필 설치 전에 수행한다.
- 기존 `rollback(actions: list[dict[str, object]]) -> list[str]`와 action 필드 `target`, `previous`, `installed`, `area`, `rollback_failed`를 유지한다. 후보 이동 action은 `installed=False`이며 `previous`는 이동한 원본 경로다.

- [ ] **1. 설치 실패 테스트를 추가한다.**

기존 `ExternalSkillPreflightTests`의 `create_payload()`, `run_main()`, `acquisition_stub()`, `tree_state()`를 재사용한다.

| 테스트 | 필수 확인 |
|---|---|
| `test_migration_new_partial_full_and_repeat_install` | 후보 없음·일부·여섯 개 각각 설치 성공, 새 `name`·모델 값 일치, 후보 부재, 반복 설치 성공 |
| `test_migration_partial_and_existing_new_profiles` | 이전 후보와 새 대상의 원본 bytes·mode가 각각 백업되고 설정 버전은 `4` |
| `test_migration_removes_candidates_before_new_profiles` | 첫 새 프로필 설치 시 기존 후보가 모두 활성 위치에서 사라짐 |
| `test_migration_move_failure_restores_profiles` | 두 번째 후보 이동 오류 시 status `2`, 후보·새 대상 원상 복구 |
| `test_migration_profile_failure_restores_all_targets` | 새 프로필 교체 실패 시 후보·Harness·외부 스킬·기존 새 대상 복구, 원래 없던 대상은 부재 |
| `test_migration_rollback_failure_preserves_recovery` | 교체 뒤 후보 복구도 실패하면 status `2`, recovery 원본과 백업 보존, 출력에 recovery 절대 경로 포함 |
| `test_migration_preparation_failure_preserves_active_targets` | 백업 또는 staging 오류 시 활성 대상 불변 |
| `test_migration_rejects_unsafe_candidates` | symlink·디렉터리·FIFO·symlink 상위 경로 거부, 취득 미호출, 대상 불변 |
| `test_migration_preserves_unrelated_profiles` | 별도 프로필·폐기 역할·추가 suffix 파일의 `tree_state` 불변 |
| `test_migration_check_and_dry_run_are_read_only` | 두 모드 status `0`, 임시 tree 불변, subprocess·취득 미호출, dry-run에 후보 표시 |
| `test_migration_candidates_changed_during_acquisition` | 취득 중 후보가 추가되면 status `2`, 새 설치와 자동 제거 없음 |

후보 이름은 구성 요소를 결합해 만든다. 복구 테스트는 활성 상태 복원과 영구 백업 보존을 각각 확인한다.

- [ ] **2. RED를 확인한다.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k migration -v
```

기대: 기존 구현이 후보를 남기거나 백업·복구 assertion을 만족하지 못한다.

- [ ] **3. 후보 검사·백업·이동·복구를 구현한다.**

백업과 staging 준비 후 후보를 같은 파일시스템의 profile staging area로 이동한다. 이동 전에 action을 기록한다. 이후 기존 외부 스킬·Harness·새 프로필 교체를 수행한다.

성공 시 staging을 정리한다. 복구 실패 시 원본이 든 area를 보존하고 기존 recovery 보고 체계에 포함한다. 거래 밖 삭제나 광범위한 glob 삭제를 추가하지 않는다.

- [ ] **4. GREEN과 기존 설치 회귀를 확인한다.**

```sh
python3 -B -m unittest discover -s tests -p test_install.py -k migration -v
python3 -B -m unittest discover -s tests -p test_install.py -k ExternalSkillPreflightTests -v
```

기대: 두 명령 모두 `OK`다.

- [ ] **5. CEO에게 설치 계약과 증거를 반환한다.**

후보 범위·백업·복구·검사 모드 결과와 문서에 반영할 최종 동작을 전달한다. 실제 사용자 설치나 Codex runtime은 확인하지 않았음을 명시한다.

## 작업 3: README 번역과 과거 문서 정규화

**담당:** Secretary

**의존:** 작업 1·2 완료 및 최종 인터페이스 전달

**파일:**

- 수정: `README.md`
- 수정 또는 이름 변경: 기존 `docs/superpowers/` 아래 접두사 일치 내용·경로가 있는 `.md` 파일
- 제외: 현재 승인 spec·plan과 CEO 정본 인계 기록
- 편집 금지: 구현·설정·테스트·manifest

**인터페이스:**

- 입력: 승인 spec, 확정된 새 이름·버전·마이그레이션 동작.
- 출력: README와 과거 문서, 변경 경로 목록, 번역 보존 검토.
- 현재 승인 문서의 수정 필요성을 발견하면 CEO에게 보고한다.

- [ ] **1. 문서 변경 목록을 확정한다.**

```sh
python3 -B - <<'PY'
from pathlib import Path
root = Path.cwd()
prefixes = tuple(sep.join(("yunho", "team")) for sep in ("_", "-"))
for path in sorted((root / "docs/superpowers").rglob("*.md")):
    relative = path.relative_to(root).as_posix()
    text = path.read_text(encoding="utf-8")
    if any(prefix in relative or prefix in text for prefix in prefixes):
        print(relative)
PY
```

기대: 편집할 과거 문서의 정확한 목록이다. Secretary는 편집 전에 CEO에게 반환해 범위를 확정한다.

- [ ] **2. README 설명을 한국어로 번역한다.**

소개·역할 설명·설치·모델 변경·한계·백업과 무결성을 번역한다. 명령·제품명·기술 literal은 보존하고 TOML 예시를 버전 `4`와 새 ID로 바꾼다.

프로필 백업·제거, 모델 자동 병합 부재, 새 세션, 외부 참조 수정 필요성, 과거 문서 명칭 정규화를 설명한다.

- [ ] **3. 과거 문서의 명칭과 경로를 정규화한다.**

날짜·승인 사실·당시 범위를 보존한다. 폐기 역할은 `harness_lead`와 `harness-lead.toml`로 표기하며 현재 역할로 추가하지 않는다.

- [ ] **4. 수동 대조와 결과를 반환한다.**

README 설명에 영어가 남았는지와 기술 표기를 보존했는지, 과거 문서의 의미가 유지됐는지 대조한다. 문서 변경용 테스트는 추가하지 않는다.

CEO는 현재 승인 artifact와 정본 기록을 통합한다. 승인 범위를 바꿔야 하면 재승인을 처리한다.

## 작업 4: 문서 완료 후 정적 검사와 manifest 갱신

**담당:** Coder

**의존:** 작업 3과 CEO 문서 통합 완료

**파일:**

- 수정: `MANIFEST.sha256`
- 읽기 전용: 최종 저장소 파일과 `tests/test_install.py`
- 잔존 수정: Coder 소유 파일만
- 문서 잔존 발견: CEO를 통해 Secretary에게 반환
- 새 테스트 추가: 없음

**인터페이스:**

- 입력: 확정된 소스·프로필·README·과거 문서.
- 출력: 저장소 정적 검사 결과와 최종 manifest.
- 기존 `refresh_manifest(root: Path) -> None` helper를 재사용한다.
- `RepositoryNamingTests`는 추가하지 않는다.

- [ ] **1. 전체 내용과 경로를 정적으로 검사한다.**

```sh
python3 -B - <<'PY'
from pathlib import Path
root = Path.cwd()
prefixes = tuple(sep.join(("yunho", "team")) for sep in ("_", "-"))
problems = []
for path in sorted(root.rglob("*")):
    relative = path.relative_to(root).as_posix()
    if ".git" in path.relative_to(root).parts:
        continue
    if any(prefix in relative for prefix in prefixes):
        problems.append(("path", relative))
    if path.is_file():
        data = path.read_bytes()
        if any(prefix.encode() in data for prefix in prefixes):
            problems.append(("content", relative))
for kind, relative in problems:
    print(kind, relative)
assert not problems, problems
print("repository naming scan: OK")
PY
```

기대: `repository naming scan: OK`가 출력된다. Git metadata와 history를 제외하고 파일 bytes와 파일·디렉터리 경로를 확인한다.

- [ ] **2. 잔존을 소유 역할에 반환하고 검사를 반복한다.**

Coder는 자신의 범위만 수정한다. README와 과거 문서는 CEO가 Secretary에게 반환한다. 잔존이 0인 최종 상태를 확인한 뒤 진행한다.

- [ ] **3. 최종 manifest를 갱신한다.**

```sh
python3 -B - <<'PY'
import runpy
from pathlib import Path
module = runpy.run_path("tests/test_install.py", run_name="manifest_refresh")
module["refresh_manifest"](Path.cwd())
PY
```

기대: 새 프로필 경로와 최종 source·README 해시가 반영된다. 모델 설정·manifest 자체·`.DS_Store`는 제외한다.

- [ ] **4. 무결성과 전체 회귀를 확인한다.**

```sh
python3 -B - <<'PY'
from pathlib import Path
import install
install.verify_manifest(Path.cwd())
PY
python3 -B -m unittest discover -s tests -p test_install.py -v
git diff --check
```

기대: manifest 검증 완료, 테스트 `OK`, 공백 오류 없음. `unittest discover`로 파일 끝의 추가 테스트 클래스도 찾는다.

- [ ] **5. manifest 이후 변경 여부를 확인한다.**

작업 4 뒤 source 또는 README가 다시 바뀌면 manifest를 갱신하고 무결성·영향받는 테스트를 재실행한다.

## 작업 5: QA·독립 Reviewer·CEO 수락

**담당:** QA → 독립 Reviewer → CEO
**파일 편집:** 없음

- [ ] **1. QA가 최종 상태를 독립 검증한다.**

작업 4의 정적 검사·manifest·전체 테스트 suite·diff 검사를 실행한다. 작업 1·2 테스트를 AC1–AC12에 연결하고 각 기준의 실행 상태·관찰·근거·판정을 보고한다.

- [ ] **2. QA가 문서 기준을 대조한다.**

AC10은 한국어 설명과 기술 표기, AC11은 날짜·승인 사실·폐기 역할의 의미를 기준으로 검토한다. 새 문서 테스트는 작성하지 않으며 자동 검사만으로 의미 보존을 입증하지 않는다.

- [ ] **3. 실패와 불충족을 해결한다.**

CEO가 해당 소유 역할에 수정을 배정하고 QA가 영향받는 기준을 다시 확인한다. 미해결 실행 실패나 기준 불충족 상태에서는 최종 Reviewer 단계로 넘어가지 않는다.

- [ ] **4. 독립 Reviewer가 QA 이후 전체 최종 변경을 검토한다.**

후보 제한·백업·action·복구·버전·역할 매핑·manifest·번역·과거 문서 의미를 검토한다. Reviewer는 QA 검사를 실행하거나 파일을 편집하지 않는다.

- [ ] **5. CEO가 기준별 결과로 수락한다.**

실제 사용자 설치·원격 모델 지원·Codex 새 세션의 역할 선택은 미검증으로 남긴다. AC12는 실행 경로·명령·diff·Git 상태의 범위 준수 근거로 확인한다.

- [ ] **6. 선택적 구현 커밋은 수락 뒤 CEO가 수행한다.**

staged diff가 수락 범위만 포함하는지 확인한다. 권장 메시지:

```text
feat(harness): 역할 이름 정규화와 설치 마이그레이션 적용
```

push·merge·실제 사용자 설치는 별도 범위다.

## 수락 기준 연결

| 기준 | 구현·검증 |
|---|---|
| AC1 | 작업 1·3 정규화, 작업 4 사후 정적 검사 |
| AC2–AC3 | 작업 1 매핑·형식·프로필 테스트 |
| AC4–AC7 | 작업 2 설치·백업·복구·보존 테스트 |
| AC8 | 작업 2 검사 모드의 불변성과 취득 미호출 |
| AC9 | 작업 1 모델 적용·실패 복구 |
| AC10 | 작업 3 번역 대조, 작업 4 manifest |
| AC11 | 작업 3 과거 문서 의미 대조 |
| AC12 | 공통 제약, 작업 5 실행·경로·Git 상태 확인 |

## 승인과 인계 전제

CEO가 계획을 통합·저장·자체 검토해 승인을 받은 뒤 승인 문서 집합의 완결과 명시 실행 대상 선택을 확인한다. 승인 문서 준비·Git 상태·소유권·보존·최종 상태를 인계 참조에 따라 검증한다.

Coder 최초 시작과 재개에는 승인 artifact 경로와 최신 workspace 증거를 전달한다. 저장소 이름 변경으로 설치된 프로필이 자동 갱신된다고 가정하지 않는다. 역할 호출과 새 저장소 파일명의 차이는 CEO가 인계에 명시한다.

## 가정과 미결정 사항

- 승인 범위는 spec 하나와 plan 하나로 완결된다.
- 테스트는 기존 fixture와 취득 stub을 사용하며 사용자 home·네트워크 설치를 실행하지 않는다.
- Secretary는 작업 2 완료 후 문서만 편집한다.
- 이전 후보는 경로로 선택하며 사용자 수정 내용의 일치는 요구하지 않는다.
- 새 테스트는 작업 1·2의 행동·설정·마이그레이션에만 추가한다.
- 추가 사용자 결정은 없다. 승인 사실은 CEO의 접근 가능한 brief에서 확인한다.

## 자체 검토

- **명세 대응:** AC1–AC12를 구현·검증 단계에 연결했다.
- **단계 명확성:** 테스트 이름·확인 내용·RED/GREEN 명령과 구현 인터페이스를 지정했다.
- **의존성:** 역할 변경 → 설치 거래 → 문서 → 정적 검사·manifest → QA → Reviewer 순서를 명시했다.
- **소유권:** Coder와 Secretary의 파일 범위를 분리하고 현재 승인 artifact는 CEO 통합 대상으로 두었다.
- **실패 경로:** 준비·후보 이동·교체·복구 실패, 안전하지 않은 후보와 취득 중 후보 집합 변경을 포함했다.
- **검증 한계:** 임시 설치 결과와 실제 사용자 설치·Codex runtime을 구분했다.
- **순서 일관성:** 전체 저장소 정적 검사를 문서 정규화 뒤에 수행한다. 문서 변경용 테스트는 추가하지 않는다.
- **문구:** 계획 초안에 금지 접두사를 연속 문자열로 넣지 않았다.
- **수행 상태:** 읽기 전용 초안이다. 저장·편집·테스트 실행·커밋은 수행하지 않았다.
