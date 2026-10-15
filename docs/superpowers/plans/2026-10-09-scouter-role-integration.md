# Scouter 역할 통합 및 관리형 worktree 인계 구현 계획

> **에이전트 작업 지침:** ARC adapter에 따라 CEO가 순차 조율하고 위험도에 맞게 검증한다. Coder는 승인된 파일만 편집하며 에이전트를 직접 생성·위임하지 않는다. 체크박스는 진행 상태를 기록한다.

**목표:** Secretary와 Scout를 읽기 전용 Scouter로 통합하고, version 5의 다섯 역할 계약과 현재 관리 프로필의 안전한 폐기를 구현한다. 새 worktree 실행 대상 준비 지침을 Codex 앱 관리형 생성·현재 대화 연결·결과 검증 계약으로 전환한다.

**구조:** 역할·모델·프로필 계약을 하나의 다섯 역할 집합으로 맞춘다. 설치기는 정확한 두 폐기 프로필만 검사·백업·거래 내 제거하고 실패 시 복구한다. yunho-team-* 프로필을 탐색·검사·백업·삭제하는 레거시 마이그레이션 기능은 제거한다. 관리형 worktree의 실제 경로는 앱 도구가 정하고 승인 branch는 검증 후 managed checkout에서 생성·체크아웃한다. 정책은 명시적 원본 SHA 입력, 비동기 완료, 앱 연결, 승인 문서 전달과 실패 중단을 규정하며 별도 provisioning 코드나 설치기 기능은 추가하지 않는다.

**기술:** Python 3.11 이상, unittest, unittest.mock, TOML, SHA-256 manifest.

**명세:** docs/superpowers/specs/2026-10-09-scouter-role-integration-design.md

## 공통 제약

- 활성 역할: arc_scouter, arc_planner, arc_coder, arc_qa, arc_reviewer.
- Scouter 모델: gpt-6-luna, reasoning effort: max.
- 나머지 네 역할의 모델·effort는 명세 값을 유지한다.
- 모델 설정은 정수 version = 5이며 자동 변환하지 않는다.
- Scouter는 읽기 전용 조사·탐색만 수행한다.
- 독립 문서 작성 요청을 전문 역할에 자동 배정하지 않는다.
- depth 2, CEO 직접 보고, 직접 위임 금지, 동시 하위 에이전트 최대 네 개를 유지한다.
- 설치 폐기 대상은 arc-secretary.toml, arc-scout.toml 두 개뿐이다.
- yunho-team-* 경로를 탐색·검사·백업·삭제하지 않는다.
- config.toml, 과거 spec/plan, 외부 skills는 변경하지 않는다.
- 확인된 test_core_word_count_meets_budget의 2788단어 상한 테스트를 텍스트 길이 제한으로 처리해 제거한다. _validated_string의 제어문자·문자열 안전 검증은 유지한다.
- 새 worktree는 `mcp__codex_app__create_worktree`에 `allowAsync: true`, 설명용 `name`, 검증한 원본 HEAD 전체 SHA `ref`를 전달해 생성한다.
- 생성 전 사용자 지정 목적지 경로나 path 충돌 검사는 요구하지 않는다. 승인 branch 후보와 branch 충돌 검사는 유지한다. 앱 반환 경로와 초기 상태를 확인한 뒤 승인 branch를 생성·확인해 체크아웃한다.
- 등록 실패 시 반환된 workspace의 `attach_worktree` 재시도만 허용한다. raw Git worktree 생성, 다른 입력의 자동 생성 재시도, 자동 정리는 금지한다.
- Tracked 원본 승인 문서는 index blob·mode가 HEAD와 같고 working-tree bytes가 최신 승인본과 같아야 한다. 대상은 깨끗한 base 상태와 base bytes를 확인한 뒤 승인 bytes로 교체한다.
- 실제 사용자 Codex 홈 설치, push·merge·배포는 수행하지 않는다.
- 모든 구현·설정·테스트 코드 편집은 Coder 소유이며, CEO는 승인·인계·통합·수락을 담당한다.

모든 상대 경로와 명령은 CEO가 인계한 실행 작업공간을 기준으로 한다. 현재 관리형 실행 작업공간은 /Users/yunho/.codex/worktrees/scouter-role-integration/arc다.

## 검토 중점

1. yunho-team-*의 파일·symlink·FIFO·디렉터리가 있어도 설치기가 해당 경로를 탐색·검사하거나 설치를 차단하지 않아야 한다.
2. 관리 대상 폐기 후보가 취득 중 추가·삭제·내용·metadata·identity 변경되면 재확인에서 중단해야 한다.
3. 두 번째 폐기 파일 이동이나 활성 프로필 교체 실패 시 먼저 이동한 파일도 복구되어야 한다.
4. 복구 자체가 실패하면 복구 bytes와 위치를 남겨야 한다.
5. version 4·여섯 역할 fixture가 새 정상 입력으로 남거나 테스트가 구 계약을 계속 강제하지 않아야 한다.
6. 새 worktree 지침이 앱이 정하는 경로를 사용자에게 미리 지정하게 하지 않으면서 승인 branch 선택·충돌 검사를 유지하고, provisioning 중 raw Git 생성으로 전환하지 않아야 한다.
7. 비동기 진행 상태를 완료로 오인하지 않고, 등록만으로 앱의 현재 대화 연결을 추정하지 않아야 한다.
8. Tracked 승인 개정을 source staging 없이 전달하고, destination의 깨끗한 base를 확인한 뒤에만 바꾸어야 한다.
9. 제한된 `attach_worktree` 재시도가 새 생성 재시도나 raw fallback으로 확대되지 않아야 한다.

각 항목은 아래 작업의 지정 테스트로 연결한다.

## 작업 순서와 의존성

작업 1 → 작업 2 → 작업 3 → 작업 4 순서로 수행한다. 하나의 변경 계약이므로 파일 편집을 병렬화하지 않는다. 작업마다 자동 QA·Reviewer 게이트를 추가하지 않는다. 전체 구현 뒤 독립 QA, 그 뒤 최종 전체 변경 Reviewer를 수행한다.

---

## 작업 1: 다섯 역할·모델·프로필·정책 계약 전환

**파일**

- 생성: agents/arc-scouter.toml
- 삭제: agents/arc-secretary.toml, agents/arc-scout.toml
- 수정:
  - skill/models.toml
  - skill/scripts/model_config.py
  - skill/scripts/apply-models.py
  - install.py의 PROFILE_FILES 및 프로필 개수 안내
  - skill/SKILL.md
  - agents/arc-planner.toml
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

    arc-scouter.toml
    arc-planner.toml
    arc-coder.toml
    arc-qa.toml
    arc-reviewer.toml

### 1.1 실패 테스트 작성

- [ ] SIX_SETTINGS 정상 fixture를 FIVE_SETTINGS로 교체한다. settings_bytes()와 ModelSettingsTests.load() 기본 버전을 5로 바꾼다.

    FIVE_SETTINGS = {
        "arc_scouter": {
            "model": "gpt-6-luna", "model_reasoning_effort": "max",
        },
        "arc_planner": {
            "model": "gpt-6.1-sol", "model_reasoning_effort": "medium",
        },
        "arc_coder": {
            "model": "gpt-6.1-sol", "model_reasoning_effort": "low",
        },
        "arc_qa": {
            "model": "gpt-6-luna", "model_reasoning_effort": "max",
        },
        "arc_reviewer": {
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

Scouter TOML에서 name == arc_scouter와 sandbox_mode == read-only를 검증한다. 정책·정규화된 지침에서는 자료 분석, 정적 코드·문서·데이터 탐색, CEO 직접 보고, 근거·미해결 사항 보고, 편집·독립 문서 파일 작성·직접 위임 금지, 운영 상태 조사·정리 제외를 확인한다. Planner·Coder·QA·Reviewer 경계를 지워 테스트를 통과시키지 않는다.

현재 여섯 역할을 강제하는 ConditionalReferenceTests, ARCPreactionGateTests, RolePolicyTests의 assertion을 모두 갱신한다.

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

    PYTHONPATH=tests python3 -B -m unittest test_install.ModelSettingsTests test_install.ApplyModelsTests test_install.ConditionalReferenceTests test_install.ARCPreactionGateTests test_install.RolePolicyTests -v

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
        "arc-secretary.toml",
        "arc-scout.toml",
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
| test_retired_profiles_preparation_failure_preserves_targets | 두 폐기 프로필과 기존 활성·외부 대상을 준비하고 백업 시작·두 번째 폐기 파일 백업·ARC staging·활성 프로필 staging 실패를 각각 주입; 상태 2, 주입 지점 도달, 폐기 이동·대상 교체 없음, 기존 대상 bytes·mode 보존, 임시 staging 정리 |
| test_retired_profiles_rollback_failure_preserves_recovery | 활성 교체 실패 후 폐기 프로필 복구도 실패하면 상태 2; 오류·백업·복구 절대 경로 보고, 복구 bytes 보존 |

test_unmanaged_old_profiles_are_not_inspected_or_changed는 단순 파일 보존에 그치지 않는다.

- yunho-team-* 여섯 이름에 일반 파일·dangling symlink·디렉터리·FIFO fixture를 둔다.
- 실행 중 그 경로들에 대한 Path.lstat, Path.stat, Path.open, os.replace, shutil.copy2 접근을 guard해 호출 시 테스트가 실패하게 한다.
- 대상 agents 디렉터리 열거를 통한 레거시 경로 탐색도 guard한다. 저장소 source agents/ 검사와 혼동하지 않도록 target home 경로만 감시한다.
- 전후 상태 스냅샷은 guard 바깥에서 측정한다.
- 성공 상태 0, 상태 불변, 백업에 구형 이름 없음, 출력에 구형 후보 경로 없음으로 검증한다.

- [ ] migration_paths, seed_migration, migration_active_state와 test_migration_*를 제거한다. 신규 폐기 및 비관리 경로 테스트가 필요한 보호를 담당한다. 구형 model ID/version 거부는 별도 입력 호환성 검사이므로 유지한다.
- [ ] 오류 주입 테스트마다 주입 지점에 도달했음을 별도로 검증한다. 폐기 기능 부재로 주입되지 않은 상황을 복구 성공으로 인정하지 않는다.
- [ ] 기존 test_acquisition_failure_leaves_targets_and_backup_unchanged에 두 폐기 프로필을 서로 다른 bytes·mode로 추가한다. 전체 Codex 홈 상태 불변, 취득 호출, staging 부재 assertion을 유지하며 별도 acquisition 실패 테스트는 추가하지 않는다.
- [ ] test_retired_profiles_preparation_failure_preserves_targets를 폐기·백업·거래 행동 구현 전에 작성한다. 백업 시작, 두 번째 폐기 프로필 백업, _copy_arc_to_stage(), 활성 프로필 staging의 shutil.copystat() 실패를 각각 독립적으로 실행한다.
- [ ] 각 실패 주입은 정확한 함수 또는 source·target 조건으로 제한하고 해당 지점에 도달했는지 확인한다. os.replace 호출을 관찰해 폐기 파일 이동과 실제 설치 대상 교체가 시작되지 않았음을 검증한다.
- [ ] 준비 실패 검사는 기존 활성·폐기·외부 대상과 비관리 파일 상태를 각각 비교하고 assert_no_stages()를 확인한다. 백업 도중 실패하면 부분 백업 디렉터리가 남을 수 있으므로 전체 Codex 홈 불변은 요구하지 않는다.

### 2.2 RED 확인

- [ ] 아래 세 명령을 모두 폐기·백업·거래·복구 행동 코드 변경 전에 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests.test_retired_profiles_new_partial_full_and_repeat_install test_install.ExternalSkillPreflightTests.test_retired_profiles_backup_bytes_and_mode test_install.ExternalSkillPreflightTests.test_retired_profiles_removed_before_active_profile_replace test_install.ExternalSkillPreflightTests.test_retired_profiles_check_and_dry_run_are_read_only test_install.ExternalSkillPreflightTests.test_retired_profiles_reject_unsafe_candidates test_install.ExternalSkillPreflightTests.test_retired_profiles_changed_during_acquisition test_install.ExternalSkillPreflightTests.test_unmanaged_old_profiles_are_not_inspected_or_changed -v

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests.test_retired_profiles_move_failure_restores_targets test_install.ExternalSkillPreflightTests.test_retired_profiles_profile_failure_restores_all_targets test_install.ExternalSkillPreflightTests.test_retired_profiles_rollback_failure_preserves_recovery -v

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests.test_retired_profiles_preparation_failure_preserves_targets test_install.ExternalSkillPreflightTests.test_acquisition_failure_leaves_targets_and_backup_unchanged -v

예상: 폐기 파일 미제거·백업 누락·후보 변경 미감지·구형 경로 접근·폐기 이동 주입 지점 미도달 등의 행동 assertion에서 실패한다. 준비 실패와 acquisition 회귀 테스트가 기존 동작으로 통과하면 그 사실을 기록한다. import 오류·테스트 오타·의도하지 않은 guard 오류는 RED 근거가 아니다.

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

- [ ] 2.2의 세 집중 명령을 다시 실행한다.
- [ ] 설치 테스트 클래스 전체를 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests -v

예상: 신규 폐기·안전성·비관리 경로·실패·복구 테스트와 기존 설치 회귀가 모두 통과한다.

**대응 기준:** AC-08–12, AC-13.

---

## 작업 3: Codex 앱 관리형 worktree 인계 계약 전환

**파일**

- 수정: skill/SKILL.md, skill/references/handoff.md, skill/references/planning.md, skill/references/git-recovery.md, README.md, tests/test_install.py

**의존성**

작업 1–2 이후 수행한다. 같은 정책·README·테스트 파일을 편집하므로 작업 안에서 순차 처리한다. 이 작업은 지침과 구조 회귀 검사를 바꾸며 테스트에서 실제 worktree를 생성하지 않는다.

**도구 계약**

    mcp__codex_app__create_worktree({
      allowAsync: true,
      name: "<approved-descriptive-name>",
      ref: "<verified-source-head-full-sha>"
    })

`name`은 설명용이며 실제 경로·branch 이름을 보장하지 않는다. 목적지 path·branch 인자를 가정하지 않는다. `ref`를 생략하거나 remote default로 대체하거나 자동 fetch하지 않는다.

### 3.1 실패 테스트 작성

- [ ] `handoff.md`의 새 worktree 절 제목을 `New managed worktree`로 바꿀 계약을 반영해 관련 section selector를 먼저 갱신한다.
- [ ] 다음 기존 테스트를 명세 AC-15–18에 맞게 갱신한다.

| 테스트 | 검증 계약 |
|---|---|
| `test_workspace_handoff_requires_scoped_checkout_approval` | 세 번째 선택은 관리형 worktree이며 branch 후보는 새 branch와 관리형 worktree 선택 모두에 적용하고 path 후보는 요구하지 않음 |
| `test_workspace_handoff_reapproves_changed_targets` | 원본·저장소·기준 SHA·승인 branch·name·전달 범위 변경 시 갱신 입력을 다시 선택 |
| `test_workspace_handoff_failures_do_not_fallback` | 승인된 준비 경로 실패 시 다른 실행 경로로 자동 전환하지 않음 |
| `test_workspace_handoff_commits_approved_plan_docs_before_coder` | 앱 연결과 문서 전달 검증 뒤에만 승인 문서 커밋 및 Coder 시작 |
| `test_workspace_handoff_worktree_scoped_choice_and_base` | 원본 경로·저장소·common directory·branch/detached HEAD·전체 SHA·승인 branch 후보와 충돌 상태·name·문서 범위 제시 및 호출 전 재확인 |
| `test_workspace_handoff_worktree_creation_and_identity` | 앱 생성 도구, 실제 경로·초기 branch/detached HEAD, 승인 branch 생성·체크아웃, HEAD/ref·linked 등록·common directory·대상 dirty state·원본 보존 |
| `test_workspace_handoff_worktree_source_dirty_states` | untracked 경로 부재·승인 bytes, tracked index blob/mode=HEAD 및 working-tree bytes=최신 승인본 |
| `test_workspace_handoff_worktree_document_transfer` | 대상 base-clean·base bytes 확인 후 승인 bytes 교체, 승인 문서만 전달, 원본 보존 |
| `test_workspace_handoff_worktree_docs_commit_order` | 생성·앱 연결·identity·전달 검증 후 대상 문서 일괄 커밋 |
| `test_workspace_handoff_worktree_partial_completion` | 생성·등록·연결·identity·전달 실패 시 중단·상태 기록 |
| `test_workspace_handoff_worktree_roles_and_restart` | 실제 반환 대상·앱 연결을 정본에 기록하고 다섯 역할이 같은 경로를 사용 |
| `test_workspace_handoff_worktree_keeps_in_place_prohibition` | 같은 checkout branch 실패 시 worktree로 자동 전환 금지 |
| `test_worktree_planning_and_core_preparation_gates` | 문서 승인·명시 선택·앱 생성/연결·전달·커밋·인계 순서 |
| `test_worktree_readme_matches_selected_execution_paths` | README 입력·결과·문서 전달·실패 정책 정합성 |

- [ ] `test_workspace_handoff_worktree_collisions_require_new_choice`를 `test_workspace_handoff_managed_worktree_inputs_and_results`로 교체한다. sibling 목적지·사용자 지정 path 후보·path suffix/충돌 재선택 assertion을 제거한다. 승인 branch 후보, branch 충돌 검사와 재선택은 유지하고, 같은 base의 미사용 승인 branch 재사용 조건을 추가한다.
- [ ] `test_workspace_handoff_preserves_branch_collision_rules`를 갱신해 candidate branch를 create_worktree 도구 인자로 보내지 않고, managed checkout 안에서 생성·체크아웃하는 순서와 collision 승인을 확인한다. 같은 base를 가리키고 다른 worktree에서 사용하지 않는 승인 branch만 재사용한다.
- [ ] 새 입력·결과 검사는 다음 구조를 확인한다.

    self.assertIn("mcp__codex_app__create_worktree", section)
    self.assertIn("allowAsync: true", section)
    self.assertIn("name", section)
    self.assertIn("ref", section)
    self.assertNotIn("../<repo>-<topic>-worktree", section)
    self.assertNotIn("git worktree add -b <branch> <absolute-path> <base-sha>", section)

  `name`이 설명용이고 `ref`가 전체 SHA라는 것, 도구에 목적지·branch 인자가 없다는 계약도 검증한다. 실패 안내에서 raw 명령을 금지한다고 언급하는 것은 허용하되 실행용 생성 명령은 없어야 한다.
- [ ] 관리형 worktree 입력·결과 테스트는 `create_worktree` 전 승인 branch 후보와 충돌 검사를 확인한다. 앱 등록·연결·base 확인 뒤 detached 상태면 승인 branch를 `git switch -c <approved-branch> <ref>`로 생성한다. 같은 base의 미사용 승인 branch가 이미 있으면 `git switch <approved-branch>`로 재사용한다. 예상 밖 branch, 다른 base, 충돌 후보 자동 대체는 중단 대상이다.
- [ ] `test_workspace_handoff_managed_worktree_async_attachment_and_no_fallback`을 추가한다. `operationId` polling, 진행/완료 구분, 앱 관리·현재 대화 연결과 승인 branch 검증 전 문서 전달·staging·commit·Coder 금지, 등록 실패 시 반환 workspace에 대한 `mcp__codex_app__attach_worktree` 재시도만 허용, 재연결 실패·도구 불가·결과 불일치 시 중단·기록을 확인한다. raw Git 생성, 다른 name/ref/path/branch의 자동 생성·체크아웃 재시도, 자동 cleanup/delete/prune/archive는 금지한다.
- [ ] 문서 전달 검사는 source tracked 문서의 index blob/mode=HEAD 및 working bytes=최신 승인본, untracked 문서의 HEAD/index 경로 부재 및 승인 bytes 일치, destination HEAD=선택 base SHA와 base-clean/index·working bytes 확인 후 승인 bytes 교체를 검증한다. base에 없는 문서는 destination에도 없어야 한다. 승인 문서 외 전달, escaping symlink, 예상 밖 destination 변경은 거부한다.
- [ ] README 테스트의 기존 “tracked index·working bytes 모두 승인 bytes와 같음” 조건을 제거하고 source와 destination 검사를 분리한다. 승인된 미커밋 개정은 source staging 없이 전달할 수 있어야 한다.

### 3.2 RED 확인

- [ ] 정책·README 편집 전에 관련 집중 검사를 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.RolePolicyTests.test_workspace_handoff_managed_worktree_inputs_and_results test_install.RolePolicyTests.test_workspace_handoff_worktree_creation_and_identity test_install.RolePolicyTests.test_workspace_handoff_managed_worktree_async_attachment_and_no_fallback test_install.RolePolicyTests.test_workspace_handoff_worktree_source_dirty_states test_install.RolePolicyTests.test_workspace_handoff_worktree_document_transfer test_install.RolePolicyTests.test_worktree_readme_matches_selected_execution_paths -v

    PYTHONPATH=tests python3 -B -m unittest test_install.RolePolicyTests.test_workspace_handoff_reapproves_changed_targets test_install.RolePolicyTests.test_workspace_handoff_failures_do_not_fallback test_install.RolePolicyTests.test_workspace_handoff_commits_approved_plan_docs_before_coder test_install.RolePolicyTests.test_workspace_handoff_preserves_branch_collision_rules test_install.RolePolicyTests.test_workspace_handoff_worktree_scoped_choice_and_base test_install.RolePolicyTests.test_workspace_handoff_worktree_docs_commit_order test_install.RolePolicyTests.test_workspace_handoff_worktree_partial_completion test_install.RolePolicyTests.test_workspace_handoff_worktree_roles_and_restart test_install.RolePolicyTests.test_workspace_handoff_worktree_keeps_in_place_prohibition -v

    PYTHONPATH=tests python3 -B -m unittest test_install.RolePolicyTests -v

예상: 기존 raw Git 생성·사용자 지정 경로 계약과 새 관리형 도구·연결·문서 개정 계약 불일치에서 실패한다. Import 오류·테스트 오타는 RED 근거가 아니다.

### 3.3 정책·README 구현

- [ ] `handoff.md`에 선택 전 입력, 앱이 결정하는 실제 경로, 승인 branch 후보, 명시적 SHA, 비동기 완료·등록·연결 검사를 반영한다.
- [ ] 새 worktree 생성 경로에서 사용자 지정 path 후보와 path 충돌 재선택 규칙, raw Git 생성 명령을 제거한다. 승인 branch 후보·충돌·재선택 규칙은 유지한다.
- [ ] `skill/SKILL.md`와 `planning.md`의 선택·완료·문서 준비 순서를 맞춘다.
- [ ] `git-recovery.md`에 생성·등록·현재 대화 연결 실패의 상태 기록과 제한된 attach 재시도를 반영한다.
- [ ] app tool 완료·관리형 연결·identity/base 검증 뒤 detached이면 승인 branch를 생성하고, same-base 미사용 existing branch면 체크아웃한다. 승인 branch와 final HEAD 확인 전 문서 전달을 시작하지 않는다.
- [ ] source tracked 문서는 index blob/mode=HEAD 및 working bytes=최신 승인본으로 확인한다. source staging은 금지한다.
- [ ] 대상 HEAD=base SHA 및 문서의 base-clean·base bytes를 확인한 뒤 승인본으로 교체한다. 커밋 후 정상 HEAD 변경은 재개 규칙으로 처리한다.
- [ ] README에 앱이 경로를 결정하고 승인 branch를 managed checkout에서 생성·체크아웃한다는 점, 미커밋 변경 미복사, 승인 문서만 전달, 검증 실패 시 중단을 설명한다.
- [ ] 관리형 생성 실패를 raw worktree 생성이나 다른 입력 자동 재시도로 해결하지 않는다.

### 3.4 GREEN 확인

- [ ] 3.2의 세 명령을 다시 실행한다.
- [ ] 전체 정책 회귀를 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.ConditionalReferenceTests test_install.ARCPreactionGateTests test_install.RolePolicyTests -v

예상: 관리형 계약과 기존 승인·보존·인계 계약이 함께 통과한다. 구조 검사만으로 실제 앱 도구 provisioning·연결을 입증했다고 말하지 않는다.

**대응 기준:** AC-15–18, AC-13.

---

## 작업 4: 배포 무결성·전체 회귀·최종 인계

**파일**

- 수정: MANIFEST.sha256, tests/test_install.py
- 작업 1–3에서 발견한 정합성 문제만 보완
- config.toml과 과거 승인 문서는 수정하지 않는다.

### 4.1 배포 계약 검사

- [ ] RolePolicyTests.test_distribution_manifest_matches_scouter_payload를 추가한다.

검사 내용:

    installer.verify_manifest(REPO)

manifest에는 agents/arc-scouter.toml이 있고 두 폐기 프로필은 없어야 한다. 기존 정책대로 skill/models.toml은 해시 고정에서 제외한다.

- [ ] 갱신 전 실행한다.

    PYTHONPATH=tests python3 -B -m unittest test_install.RolePolicyTests.test_distribution_manifest_matches_scouter_payload -v

예상: 변경 payload의 해시 불일치 또는 프로필 목록 불일치로 실패한다.

### 4.2 manifest 갱신

- [ ] tests/test_install.py의 refresh_manifest(root)와 같은 정렬·SHA-256·제외 규칙으로 payload manifest를 재생성한다. 선택한 실행 작업공간만 변경한다.

    PYTHONPATH=tests python3 -B -c 'from pathlib import Path; from test_install import refresh_manifest; refresh_manifest(Path.cwd())'

- [ ] 배포 계약 검사를 다시 실행해 통과를 확인한다.

### 4.2.1 확인된 텍스트 길이 제한 제거

- [ ] `tests/test_install.py`의 `test_core_word_count_meets_budget`만 제거한다. 이 테스트는 `wc -w`와 2788단어 상한으로 skill/SKILL.md를 제한한다.
- [ ] 이번 명세·계획의 미발견·제외 설명을 제거하고 확인된 제한과 제거·검증 범위를 기록한다. 다른 구현·설정과 기존 Coder 변경분은 보존한다.
- [ ] `_validated_string`은 길이 상한이 아닌 문자열·제어문자 안전 검증이므로 수정하지 않는다.
- [ ] `rg -n 'test_core_word_count_meets_budget|2788|wc.*-w' tests skill install.py README.md`로 활성 코드의 제한 부재를 확인한다. 이번 spec/plan의 제거 기록은 의도된 언급으로 유지한다.
- [ ] MANIFEST.sha256의 test 파일 포함 여부를 확인한다. 현재 tests/test_install.py는 관리되지 않으므로 이번 테스트 제거만을 위한 manifest 갱신은 하지 않는다.
- [ ] 아래 전체 unittest suite와 git diff --check를 실행하고 로그·결과를 CEO에게 보고한다. 작은 추적 수정으로 자동 커밋하지 않는다.

### 4.3 전체 회귀

- [ ] 전체 suite를 실행한다.

    python3 -B -m unittest discover -s tests -p 'test_*.py' -v

예상: 전체 통과. 실패하면 원인을 구분하고, 관련 재현 테스트 실패 확인 → Coder 수정 → 영향 검사와 전체 suite 재실행 순서로 처리한다.

- [ ] whitespace와 diff 범위를 확인한다.

    git diff --check
    git diff --name-status

예상: diff --check 오류 없음. 변경은 작업 1–3의 지정 파일과 MANIFEST, 이번 승인 spec/plan에 한정되며 config.toml과 과거 역사 spec/plan은 바뀌지 않는다. 승인 문서의 변경을 구현 변경과 구분해 보고한다.

- [ ] 현재 활성 파일에서 구 역할·여섯 프로필·version 4의 불필요한 잔여 표현을 찾는다. 폐기 상수·구 버전 거부 테스트·비관리 경로 테스트의 의도된 언급은 유지한다. 검색 결과를 기계적으로 모두 삭제하지 않는다.
- [ ] 테스트 로그, 기준별 근거, 변경 목록, 미검증 범위를 CEO에게 반환한다.

### 4.4 QA·Reviewer 및 완료

- [ ] CEO가 독립 QA에 AC-01–18별 확인 방법·범위·실행 상태·근거·판정·미검증 사유를 배정한다.
- [ ] QA 실패는 CEO가 Coder 수정과 QA 재확인을 조율한다.
- [ ] QA 이후 Reviewer가 최종 전체 변경을 독립 검토한다.
- [ ] CEO가 발견과 증거 공백을 해결하거나 명시적으로 처리하고 수락한다.
- [ ] 수락 후 구현 커밋은 CEO가 선택적으로 수행한다. 구현 중 자동 커밋은 요구하지 않는다. 커밋 메시지는 한국어 Conventional Commits 정책을 따른다.

**대응 기준:** AC-13–14 및 전체 수락 기준의 최종 근거 통합. 실제 앱 provisioning/대화 연결은 실제 도구 결과 없이는 미검증으로 보고한다.

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

- 명세 수락 기준 AC-01–07은 작업 1, AC-08–12는 작업 2, AC-15–18은 작업 3, AC-13–14와 최종 근거 통합은 작업 4에 연결했다.
- 모델·프로필 계약을 먼저 맞추고 설치 폐기·복구를 구현한 다음 managed worktree 인계 정책을 전환하고 manifest와 전체 검증을 수행한다.
- 구체적인 RED 테스트명·조건·assertion·명령을 지정했다. 준비 단계의 acquisition·backup·staging 실패 보존을 직접 확인하며, 기존 동작으로 이미 통과하는 조건에 인위적 실패를 만들지 않는다.
- 작업 3은 structural policy 검사만 변경하며 테스트에서 worktree를 생성하지 않는다. 실제 앱 결과는 실행 증거로 확인하고 정책 테스트만으로 provisioning을 입증했다고 말하지 않는다.
- 앱이 제공하지 않는 목적지·branch 입력을 tool에 전달하지 않고, 앱 반환 경로를 사용한다. 승인 branch를 별도로 선택·생성·검증한다. 제한된 attach 재시도를 raw fallback이나 새 생성/branch 자동 재시도로 확대하지 않는다.
- Tracked 승인 개정에서 source index와 HEAD, 승인 working-tree bytes를 분리 확인하고, destination base 문서를 확인한 후 전달한다.
- 비관리 yunho-team-* 경로는 파일 상태뿐 아니라 접근·검사·백업·삭제 부재를 확인한다.
- 폐기 후보 변경은 목록만 비교하지 않고 내용·metadata·identity까지 감지한다.
- 외부 skill의 별도 경로 호환, 문자열 검증, 과거 기록, 런타임 capacity를 변경하지 않는다.
- 구조 검사는 runtime 준수를, 격리 설치 검사는 실제 사용자 환경을, 모델 검사는 서버 가용성을 증명하지 않는다.
- 발견된 텍스트 길이 제한 test_core_word_count_meets_budget를 제거한다. 단어 수 상한이며 _validated_string의 안전 검증과 구별한다.
- 문서 지침 수정은 앱 tool 자체의 runtime 동작을 바꾸지 않는다. 수락 시 앱이 실제로 반환하는 관리형 연결 증거와 구조 검증 결과를 구분한다.
- 구현 인터페이스와 계획 작업 사이의 타입 불일치나 placeholder는 없다.
