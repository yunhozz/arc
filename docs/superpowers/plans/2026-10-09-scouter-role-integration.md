# Scouter 역할 통합 구현 계획

> **에이전트 작업 지침:** Harness adapter에 따라 CEO가 순차 조율하고 위험도에 맞게 검증한다. Coder는 승인된 파일만 편집하며 에이전트를 직접 생성·위임하지 않는다. 체크박스는 진행 상태를 기록한다.

**목표:** Secretary와 Scout를 읽기 전용 Scouter로 통합하고, version 5의 다섯 역할 계약과 현재 관리 프로필의 안전한 폐기를 구현한다.

**구조:** 역할·모델·프로필 계약을 하나의 다섯 역할 집합으로 맞춘다. 설치기는 정확한 두 폐기 프로필만 검사·백업·거래 내 제거하고 실패 시 복구한다. yunho-team-* 프로필을 탐색·검사·백업·삭제하는 레거시 마이그레이션 기능은 제거한다.

**기술:** Python 3.11 이상, unittest, unittest.mock, TOML, SHA-256 manifest.

**명세:** /Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-09-scouter-role-integration-design.md

## 공통 제약

- 활성 역할: harness_scouter, harness_planner, harness_coder, harness_qa, harness_reviewer.
- Scouter 모델: gpt-6-luna, reasoning effort: max.
- 나머지 네 역할의 모델·effort는 명세 값을 유지한다.
- 모델 설정은 정수 version = 5이며 자동 변환하지 않는다.
- Scouter는 읽기 전용 조사·탐색만 수행한다.
- 독립 문서 작성 요청을 전문 역할에 자동 배정하지 않는다.
- depth 2, CEO 직접 보고, 직접 위임 금지, 동시 하위 에이전트 최대 네 개를 유지한다.
- 설치 폐기 대상은 harness-secretary.toml, harness-scout.toml 두 개뿐이다.
- yunho-team-* 경로를 탐색·검사·백업·삭제하지 않는다.
- config.toml, 과거 spec/plan, 외부 skills는 변경하지 않는다.
- 글자 수 제한 제거와 제어문자·문자열 검증 변경은 범위 밖이다.
- 실제 사용자 Codex 홈 설치, push·merge·배포는 수행하지 않는다.
- 모든 구현·설정·테스트 코드 편집은 Coder 소유이며, CEO는 승인·인계·통합·수락을 담당한다.

모든 상대 경로와 명령은 CEO가 인계한 실행 작업공간을 기준으로 한다. 현재 근거 저장소는 /Users/yunho/Desktop/project/yunho-harness다.

## 검토 중점

1. yunho-team-*의 파일·symlink·FIFO·디렉터리가 있어도 설치기가 해당 경로를 탐색·검사하거나 설치를 차단하지 않아야 한다.
2. 관리 대상 폐기 후보가 취득 중 추가·삭제·내용·metadata·identity 변경되면 재확인에서 중단해야 한다.
3. 두 번째 폐기 파일 이동이나 활성 프로필 교체 실패 시 먼저 이동한 파일도 복구되어야 한다.
4. 복구 자체가 실패하면 복구 bytes와 위치를 남겨야 한다.
5. version 4·여섯 역할 fixture가 새 정상 입력으로 남거나 테스트가 구 계약을 계속 강제하지 않아야 한다.

각 항목은 아래 작업의 지정 테스트로 연결한다.

## 작업 순서와 의존성

작업 1 → 작업 2 → 작업 3 순서로 수행한다. 하나의 변경 계약이므로 파일 편집을 병렬화하지 않는다. 작업마다 자동 QA·Reviewer 게이트를 추가하지 않는다. 전체 구현 뒤 독립 QA, 그 뒤 최종 전체 변경 Reviewer를 수행한다.

---

## 작업 1: 다섯 역할·모델·프로필·정책 계약 전환

**파일**

- 생성: agents/harness-scouter.toml
- 삭제: agents/harness-secretary.toml, agents/harness-scout.toml
- 수정:
  - skill/models.toml
  - skill/scripts/model_config.py
  - skill/scripts/apply-models.py
  - install.py의 PROFILE_FILES 및 프로필 개수 안내
  - skill/SKILL.md
  - agents/harness-planner.toml
  - skill/references/handoff.md
  - skill/references/planning.md
  - skill/references/verification.md
  - README.md
  - tests/test_install.py

**인터페이스**

유지:

    load_settings(config_path: Path) -> dict[str, RoleSettings]
    serialize_settings(settings: dict[str, RoleSettings]) -> bytes
    preflight_profiles(root: Path, module: ModuleType) -> dict[str, bytes]

ROLE_FILES와 PROFILE_FILES의 활성 파일 집합:

    harness-scouter.toml
    harness-planner.toml
    harness-coder.toml
    harness-qa.toml
    harness-reviewer.toml

### 1.1 실패 테스트 작성

- [ ] SIX_SETTINGS 정상 fixture를 FIVE_SETTINGS로 교체한다. settings_bytes()와 ModelSettingsTests.load() 기본 버전을 5로 바꾼다.

    FIVE_SETTINGS = {
        "harness_scouter": {
            "model": "gpt-6-luna", "model_reasoning_effort": "max",
        },
        "harness_planner": {
            "model": "gpt-6.1-sol", "model_reasoning_effort": "medium",
        },
        "harness_coder": {
            "model": "gpt-6.1-sol", "model_reasoning_effort": "low",
        },
        "harness_qa": {
            "model": "gpt-6-luna", "model_reasoning_effort": "max",
        },
        "harness_reviewer": {
            "model": "gpt-6.1-sol", "model_reasoning_effort": "medium",
        },
    }

- [ ] ModelSettingsTests의 구 역할·version 4 검사를 아래 테스트로 갱신한다.

| 테스트 | 핵심 assertion |
|---|---|
| test_model_standard_five_roles | self.assertEqual(self.load(FIVE_SETTINGS), FIVE_SETTINGS) |
| test_model_profile_sets_match_five_roles | 모델 매핑·설치 상수·실제 agents 프로필 집합이 정확한 다섯 파일 |
| test_naming_v5_settings_and_serialization | 직렬화 TOML의 version == 5, 재로딩 결과 == FIVE_SETTINGS |
| test_naming_rejects_old_versions_and_keys | version 1–4 및 구 역할 ID 거부, 입력 bytes 보존 |
| test_model_rejects_unknown_missing_or_invalid_version | 누락 버전·True·문자열 버전·추가/누락 역할·잘못된 역할 필드 거부 |
| test_naming_profile_identity_and_mapping | 정확한 ID·파일 매핑, 렌더된 모델·effort 일치 |

구 버전 오류에서 version 5 갱신 안내도 확인한다.

- [ ] ApplyModelsTests.fixture()를 다섯 역할로 바꾸고 기존 검사를 다음 판정으로 갱신한다.

    self.assertIn("five", result.stdout)
    self.assertEqual(self.config.read_bytes(), config_before)

테스트 이름:
- test_apply_models_check_standard
- test_apply_models_dry_run_preserves_config_profiles
- test_apply_models_applies_five_profiles_without_mutating_config
- test_naming_apply_models_v5_contract
- test_naming_apply_models_failure_restores_profiles

--check 일치 상태는 0, drift는 1, 잘못된 설정은 2다. check·dry-run·오류는 tree_state(self.base)를 보존해야 한다.

- [ ] RolePolicyTests의 역할 순회와 CEO 소유권 assertion을 다섯 역할로 갱신하고 다음 테스트를 추가한다.

    test_scouter_read_only_scope_and_reporting
    test_standalone_document_writing_has_no_specialist_auto_route
    test_active_references_use_five_role_contract

Scouter TOML에서 name == harness_scouter와 sandbox_mode == read-only를 검증한다. 정책·정규화된 지침에서는 자료 분석, 정적 코드·문서·데이터 탐색, CEO 직접 보고, 근거·미해결 사항 보고, 편집·독립 문서 파일 작성·직접 위임 금지, 운영 상태 조사·정리 제외를 확인한다. Planner·Coder·QA·Reviewer 경계를 지워 테스트를 통과시키지 않는다.

현재 여섯 역할을 강제하는 ConditionalReferenceTests, HarnessPreactionGateTests, RolePolicyTests의 assertion을 모두 갱신한다.

### 1.2 RED 확인

- [ ] 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ModelSettingsTests test_install.ApplyModelsTests test_install.RolePolicyTests -v

예상: version 5 거부, 구 역할 매핑, Scouter 프로필 부재 또는 구 정책 assertion에서 실패한다. import 오류와 테스트 오타는 RED 근거가 아니다.

### 1.3 행동 및 정책 구현

- [ ] ROLE_FILES, PROFILE_FILES, 모델 로더·직렬화·오류를 version 5·정확한 다섯 역할로 변경한다.
- [ ] Scouter 프로필을 만들고 기존 Secretary·Scout 프로필을 저장소에서 제거한다.
- [ ] Scouter 지침에 명세의 읽기 전용 범위·산출물·문서 제외·운영 경계·CEO 보고를 반영한다.
- [ ] apply-models.py의 다섯 프로필 안내를 갱신하고 기존 안전한 적용·rollback 동작을 보존한다.
- [ ] 현재 정책, Planner, handoff, planning, verification 문서의 구 역할·문서 소유권 표현을 정리한다.
- [ ] README의 역할 표, 프로필 수, version 5와 설치 설명을 갱신한다. 주요 구간은 현재 3–19, 91, 128–135, 168–178행이다.

### 1.4 GREEN 확인

- [ ] 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ModelSettingsTests test_install.ApplyModelsTests test_install.ConditionalReferenceTests test_install.HarnessPreactionGateTests test_install.RolePolicyTests -v

예상: 전부 통과. 이 결과는 정책·모델 도구 계약만 입증하며 agent runtime 준수는 입증하지 않는다.

**대응 기준:** AC-01–07, AC-13.

---

## 작업 2: 두 관리 프로필 폐기와 구형 마이그레이션 로직 제거

**파일**

- 수정: install.py, tests/test_install.py, README.md

**기존 재사용 지점**

- install_plan()
- backup_existing()
- _transactional_install()
- 기존 rollback() 및 복구 자료 보존
- ExternalSkillPreflightTests의 임시 Codex 홈·자료 취득 stub·상태 비교

**구현 인터페이스**

다음 상수와 후보 수집을 추가한다.

    RETIRED_PROFILE_FILES = (
        "harness-secretary.toml",
        "harness-scout.toml",
    )

    def retired_profile_targets(home: Path) -> dict[str, Path]:
        ...

정확한 두 파일만 기존 안전 검사로 확인하고 존재하는 일반 파일을 반환한다.

후보의 내용·파일 identity 변경을 감지한다.

    @dataclass(frozen=True)
    class RetiredProfileSnapshot:
        path: Path
        content: bytes
        mode: int
        device: int
        inode: int
        mtime_ns: int
        ctime_ns: int

    def retired_profile_snapshot(
        home: Path,
    ) -> dict[str, RetiredProfileSnapshot]:
        ...

mode는 lstat().st_mode, 나머지 metadata는 해당 stat_result 값이다. 안전성 검사 후 파일을 읽는다. 부재·추가·삭제·bytes·metadata·identity 변화를 snapshot 비교로 감지한다.

backup_existing()와 _transactional_install()의 legacy_targets 인자는 retired_targets로 교체한다. install_plan()의 기존 네 항목 반환 형태는 유지한다. legacy_profile_targets()와 호출·인자 전달·마이그레이션 전용 로직은 제거한다.

### 2.1 실패 테스트 작성

- [ ] ExternalSkillPreflightTests에 다음 테스트를 모두 설치 동작 구현 전에 추가한다. 임시 홈·run_main()·acquisition_stub()·tree_state() fixture를 재사용한다.

| 테스트 | 조건과 판정 |
|---|---|
| test_retired_profiles_new_partial_full_and_repeat_install | 폐기 파일 0·1·2개 및 반복 설치; 상태 0, 활성 다섯 프로필 존재, 폐기 파일 부재 |
| test_retired_profiles_backup_bytes_and_mode | 두 폐기 파일의 백업 bytes·mode가 원본과 일치 |
| test_retired_profiles_removed_before_active_profile_replace | 첫 활성 프로필 교체 시 기존 두 폐기 파일 모두 부재 |
| test_retired_profiles_check_and_dry_run_are_read_only | check·dry-run 상태 0, fixture 상태 불변, acquisition 미호출, dry-run에 폐기 경로와 five 표시 |
| test_retired_profiles_reject_unsafe_candidates | 두 폐기 이름 각각의 symlink·디렉터리·FIFO와 symlink 상위 경로를 상태 2로 거부; acquisition 미호출, 대상 불변 |
| test_retired_profiles_changed_during_acquisition | 취득 중 후보 추가·삭제·동일 경로 bytes 변경·identity 교체; 상태 2, changed during acquisition 안내, 설치 대상 변경 없음 |
| test_unmanaged_old_profiles_are_not_inspected_or_changed | yunho-team-* 이름의 파일·특수 항목을 검사·열거·읽기·백업·이동하지 않음; 설치·check·dry-run 성공 및 상태 보존 |
| test_retired_profiles_move_failure_restores_targets | 두 번째 폐기 파일 이동 실패 시 상태 2; 먼저 이동한 폐기 파일과 활성·외부 대상 원상 복구 |
| test_retired_profiles_profile_failure_restores_all_targets | 폐기 이동 후 두 번째 활성 프로필 교체 실패 시 전체 대상 복구; 원래 없던 활성 파일은 없음 |
| test_retired_profiles_rollback_failure_preserves_recovery | 활성 교체 실패 후 폐기 프로필 복구도 실패하면 상태 2; 오류·백업·복구 절대 경로 보고, 복구 bytes 보존 |

마지막 테스트는 단순 파일 보존에 그치지 않는다.

- yunho-team-* 여섯 이름에 일반 파일·dangling symlink·디렉터리·FIFO fixture를 둔다.
- 실행 중 그 경로들에 대한 Path.lstat, Path.stat, Path.open, os.replace, shutil.copy2 접근을 guard해 호출 시 테스트가 실패하게 한다.
- 대상 agents 디렉터리 열거를 통한 레거시 경로 탐색도 guard한다. 저장소 source agents/ 검사와 혼동하지 않도록 target home 경로만 감시한다.
- 전후 상태 스냅샷은 guard 바깥에서 측정한다.
- 성공 상태 0, 상태 불변, 백업에 구형 이름 없음, 출력에 구형 후보 경로 없음으로 검증한다.

- [ ] migration_paths, seed_migration, migration_active_state와 test_migration_*를 제거한다. 신규 폐기 및 비관리 경로 테스트가 필요한 보호를 담당한다. 구형 model ID/version 거부는 별도 입력 호환성 검사이므로 유지한다.
- [ ] 오류 주입 테스트마다 주입 지점에 도달했음을 별도로 검증한다. 폐기 기능 부재로 주입되지 않은 상황을 복구 성공으로 인정하지 않는다.
- [ ] 자료 취득 실패 보존은 기존 test_acquisition_failure_leaves_targets_and_backup_unchanged를 재사용하며, 이미 증명하는 동작을 중복 테스트로 추가하지 않는다.

### 2.2 RED 확인

- [ ] 아래 두 명령을 모두 폐기·백업·거래·복구 행동 코드 변경 전에 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests.test_retired_profiles_new_partial_full_and_repeat_install test_install.ExternalSkillPreflightTests.test_retired_profiles_backup_bytes_and_mode test_install.ExternalSkillPreflightTests.test_retired_profiles_removed_before_active_profile_replace test_install.ExternalSkillPreflightTests.test_retired_profiles_check_and_dry_run_are_read_only test_install.ExternalSkillPreflightTests.test_retired_profiles_reject_unsafe_candidates test_install.ExternalSkillPreflightTests.test_retired_profiles_changed_during_acquisition test_install.ExternalSkillPreflightTests.test_unmanaged_old_profiles_are_not_inspected_or_changed -v

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests.test_retired_profiles_move_failure_restores_targets test_install.ExternalSkillPreflightTests.test_retired_profiles_profile_failure_restores_all_targets test_install.ExternalSkillPreflightTests.test_retired_profiles_rollback_failure_preserves_recovery -v

예상: 폐기 파일 미제거·백업 누락·후보 변경 미감지·구형 경로 접근·폐기 이동 주입 지점 미도달 등의 행동 assertion에서 실패한다. import 오류나 테스트 오타는 RED 근거가 아니다. 이미 존재하는 일반 acquisition 실패 보호는 기존 회귀 근거로 기록하며 새 기능의 RED를 대신하지 않는다.

### 2.3 설치·복구 동작 구현

- [ ] 정확한 두 관리 폐기 파일의 안전한 수집과 snapshot을 구현한다.
- [ ] install_plan()에서 폐기 후보도 검증한다.
- [ ] perform_install()에서 취득 전 snapshot을 기록하고 취득 후 재확인한다. 변경되면 백업·거래 전에 오류로 종료한다.
- [ ] 백업·staging이 모두 준비된 뒤 기존 활성 프로필 교체 거래에서 폐기 파일을 복구 가능한 위치로 먼저 이동한다.
- [ ] 폐기 파일 이동을 기존 거래 action에 기록하여 뒤이은 이동·활성 교체 실패에서 함께 복구한다.
- [ ] 복구 실패 시 폐기 파일의 복구 위치와 영구 백업을 보존하고 오류에 절대 경로를 포함한다.
- [ ] legacy_profile_targets()와 legacy_targets 전달·검사·백업·삭제 흐름을 완전히 제거한다. yunho-team-* 경로는 설치기가 다루지 않는다.
- [ ] README에서 구형 여섯 마이그레이션 안내를 삭제하고 두 관리 프로필만 폐기하며 yunho-team-* 경로는 탐색·검사·백업·삭제하지 않는다고 설명한다.
- [ ] 외부 skill 경로 호환 처리에 쓰이는 별도 legacy 표현은 이번 역할 프로필 마이그레이션과 무관하므로 보존한다.

### 2.4 GREEN 확인

- [ ] 2.2의 두 집중 명령을 다시 실행한다.
- [ ] 설치 테스트 클래스 전체를 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests -v

예상: 신규 폐기·안전성·비관리 경로·실패·복구 테스트와 기존 설치 회귀가 모두 통과한다.

**대응 기준:** AC-08–12, AC-13.

---

## 작업 3: 배포 무결성·전체 회귀·최종 인계

**파일**

- 수정: MANIFEST.sha256, tests/test_install.py
- 작업 1–2에서 발견한 정합성 문제만 보완
- config.toml과 과거 승인 문서는 수정하지 않는다.

### 3.1 배포 계약 검사

- [ ] RolePolicyTests.test_distribution_manifest_matches_scouter_payload를 추가한다.

검사 내용:

    installer.verify_manifest(REPO)

manifest에는 agents/harness-scouter.toml이 있고 두 폐기 프로필은 없어야 한다. 기존 정책대로 skill/models.toml은 해시 고정에서 제외한다.

- [ ] 갱신 전 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.RolePolicyTests.test_distribution_manifest_matches_scouter_payload -v

예상: 변경 payload의 해시 불일치 또는 프로필 목록 불일치로 실패한다.

### 3.2 manifest 갱신

- [ ] tests/test_install.py의 refresh_manifest(root)와 같은 정렬·SHA-256·제외 규칙으로 payload manifest를 재생성한다. 선택한 실행 작업공간만 변경한다.

    PYTHONPATH=tests python3 -B -c 'from pathlib import Path; from test_install import refresh_manifest; refresh_manifest(Path.cwd())'

- [ ] 배포 계약 검사를 다시 실행해 통과를 확인한다.

### 3.3 전체 회귀

- [ ] 전체 suite를 실행한다.

    python3 -B -m unittest discover -s tests -p 'test_*.py' -v

예상: 전체 통과. 실패하면 원인을 구분하고, 관련 재현 테스트 실패 확인 → Coder 수정 → 영향 검사와 전체 suite 재실행 순서로 처리한다.

- [ ] whitespace와 diff 범위를 확인한다.

    git diff --check
    git diff --name-status

예상: diff --check 오류 없음. 변경은 계획 파일 집합에 한정되며 config.toml 및 과거 spec/plan은 바뀌지 않는다. 승인 문서의 변경을 구현 변경과 구분해 보고한다.

- [ ] 현재 활성 파일에서 구 역할·여섯 프로필·version 4의 불필요한 잔여 표현을 찾는다. 폐기 상수·구 버전 거부 테스트·비관리 경로 테스트의 의도된 언급은 유지한다. 검색 결과를 기계적으로 모두 삭제하지 않는다.
- [ ] 테스트 로그, 기준별 근거, 변경 목록, 미검증 범위를 CEO에게 반환한다.

### 3.4 QA·Reviewer 및 완료

- [ ] CEO가 독립 QA에 AC-01–14별 확인 방법·범위·실행 상태·근거·판정·미검증 사유를 배정한다.
- [ ] QA 실패는 CEO가 Coder 수정과 QA 재확인을 조율한다.
- [ ] QA 이후 Reviewer가 최종 전체 변경을 독립 검토한다.
- [ ] CEO가 발견과 증거 공백을 해결하거나 명시적으로 처리하고 수락한다.
- [ ] 수락 후 구현 커밋은 CEO가 선택적으로 수행한다. 구현 중 자동 커밋은 요구하지 않는다. 커밋 메시지는 한국어 Conventional Commits 정책을 따른다.

**대응 기준:** AC-13–14 및 전체 수락 기준의 최종 근거 통합.

## 구현 근거

- 모델 fixture·테스트: tests/test_install.py:100
- 모델 적용 fixture·CLI: tests/test_install.py:207
- 역할 정책 검사: tests/test_install.py:549
- 설치 임시 환경·취득 stub: tests/test_install.py:899
- 제거할 마이그레이션 수집: install.py:835
- 기존 백업: install.py:890
- 기존 거래: install.py:973
- 기존 복구 실패 시험 패턴: tests/test_install.py:1887
- manifest 재생성 규칙: tests/test_install.py:49

## 자체 검토

- 명세 수락 기준 AC-01–07은 작업 1, AC-08–12는 작업 2, AC-13–14와 최종 근거 통합은 작업 3에 연결했다.
- 모델·프로필 계약을 먼저 맞추고 설치 폐기·복구를 구현한 뒤 manifest와 전체 검증을 수행한다.
- 구체적인 RED 테스트명·조건·assertion·명령을 지정했다. 기존 rollback 계약은 이미 통과할 수 있으므로 인위적 실패를 만들지 않도록 했다.
- 비관리 yunho-team-* 경로는 파일 상태뿐 아니라 접근·검사·백업·삭제 부재를 확인한다.
- 폐기 후보 변경은 목록만 비교하지 않고 내용·metadata·identity까지 감지한다.
- 외부 skill의 별도 경로 호환, 문자열 검증, 과거 기록, 런타임 capacity를 변경하지 않는다.
- 구조 검사는 runtime 준수를, 격리 설치 검사는 실제 사용자 환경을, 모델 검사는 서버 가용성을 증명하지 않는다.
- 글자 수 제한 구현은 발견되지 않아 제외되며, source가 특정되면 별도 명세 승인이 필요하다.
- 구현 인터페이스와 계획 작업 사이의 타입 불일치나 placeholder는 없다.
