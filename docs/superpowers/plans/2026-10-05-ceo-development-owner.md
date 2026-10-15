# CEO 단일 개발 소유자 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** CEO를 단일 개발 소유자로 전환하고 여섯 직속 역할, 제한된 legacy 모델 호환 및 기존 Lead 프로필의 안전한 설치 퇴역을 구현한다.

**Architecture:** 기존 ARC의 개발 소유자 책임을 CEO로 옮기고 Secretary와 개발 specialist의 보고 경로를 CEO 직속으로 통일한다. 모델 로더는 정확히 알려진 legacy Lead 항목만 검증 후 제외한다. 설치기는 기존 transaction에 Lead 백업·퇴역·복원을 포함한다.

**Tech Stack:** Python 3.11 이상, unittest, tomllib, TOML agent profiles, Markdown 정책·문서, SHA-256 manifest.

**Spec:** /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-05-ceo-development-owner-design.md

## Global Constraints

- 작업 공간은 /Users/yunho/Desktop/project/arc이며, 사용자가 기존 master checkout을 사용하라고 명시했다. workspace를 생성하거나 변경하지 않는다.
- 확인 근거: branch master, git-dir=git-common-dir=.git, submodule 및 linked worktree가 아님. baseline python3 -m unittest discover -s tests -v는 67 tests, 0 failures였다.
- 승인된 spec은 같은 workspace의 untracked artifact이다. 보존하고 관련 없는 변경을 덮어쓰지 않는다.
- CEO는 depth 1, Secretary 및 다섯 개발 specialist는 depth 2이다. depth 2 역할은 agent를 생성하거나 직접 위임하지 않는다.
- 전체 활성 subagent 상한은 4이며 Secretary도 포함한다. config.toml의 runtime thread 설정은 변경하지 않는다.
- 개발 ownership·조율·승인·통합·완료는 CEO가 맡는다. 구현·설정·test-code 편집은 Coder가 수행한다. Secretary의 기존 자료·독립 문서 scope 및 live operational boundary를 보존한다.
- version = 3을 유지하고 CEO profile/model을 추가하지 않는다. 기존 여섯 specialist의 model·effort 값을 변경하지 않는다.
- 행동 및 설정 동작 변경은 failing test → failure 확인 → 최소 구현 → pass 확인 순서를 따른다. policy/profile routing도 agent behavior 계약이므로 구조 검사를 먼저 실패시킨 후 policy를 고친다.
- Human-approved TDD exception (Task 1 only): 사용자가 승인한 plan에는 profile/policy source의 의미상 CEO 보고·no-nesting·Secretary scope 일관성을 확인하는 두 구조 테스트가 포함되어 있다. 해당 승인으로 이 좁은 configuration/policy consistency 검사를 허용한다. 테스트는 정확한 prose나 넓은 문자열 부재를 고정하지 않고, runtime parent behavior의 증거라고 주장하지 않는다. Role routing 외의 model normalization 및 installer 동작은 모두 genuine failing-first tests를 거친다. README와 최종 manifest 정렬은 비행동 문서/package metadata 단계다.
- 설계/spec/plan 승인, TDD, workspace, 위험별 QA·Reviewer, completion 및 adapter gate를 보존한다. Plan header의 executor 요청은 활성 ARC adapter에 따라 CEO의 순차 Coder 조율과 위험별 검증에 대응한다. 별도 execution-method 선택 질문이나 추가 agent를 요구하지 않는다.
- 필수 검증 후 independent Reviewer가 최종 전체 변경을 검토한다.
- 실제 사용자 Codex home에는 설치하지 않는다. Installer는 기존 temporary fixture와 acquisition stub으로 검증한다.
- 구조 검사는 정책·package 계약의 일관성 근거이며 runtime 부모 관계를 실행으로 증명한 것으로 보고하지 않는다.
- 작업 전 현재 working tree와 승인 artifacts를 다시 확인하고, 승인 spec/plan 이외의 사용자 변경이 있으면 보존한다.

## Review Focus

1. 정상 여섯 역할에 malformed legacy Lead 항목이 추가된 입력은 성공으로 취급하지 않아야 한다 — 작업 2의 model legacy tests.
2. retired path가 dangling symlink·directory·FIFO이면 어떤 live target도 변경하지 않아야 한다 — 작업 3의 invalid-target test.
3. Lead 퇴역 뒤 다른 target 교체가 실패하면 Lead와 기존 target을 모두 복원해야 한다 — 작업 3의 later-failure test.
4. Lead 복원 자체가 실패하면 복구 데이터를 지우지 않고 정확한 경로를 알려야 한다 — 작업 3의 rollback-failure test.
5. legacy 설정으로 read-only CLI를 실행해도 설정·Lead·다른 profile·backup·stage를 변경하지 않아야 한다 — 작업 2와 작업 3의 non-mutating tests.

## 파일과 실행 책임

| 파일 | 책임 |
|---|---|
| skill/SKILL.md | CEO 개발 소유권, 라우팅·직접 보고·동시성·승인·검증 계약 |
| agents/arc-secretary.toml 및 다섯 specialist 프로필 | 역할별 scope와 CEO 직접 보고 |
| agents/arc-lead.toml | 작업 2에서 제거 |
| skill/models.toml | 표준 여섯 역할 및 기존 선택 |
| skill/scripts/model_config.py | 여섯 역할 매핑과 제한된 legacy 호환 |
| skill/scripts/apply-models.py | 여섯 프로필 적용 및 출력 |
| install.py | 활성 프로필 목록 및 retired target transaction |
| tests/test_install.py | 유일한 기존 test 파일; 정책·모델·CLI·퇴역 계약 검증 추가 |
| README.md | 사용자 facing 조직·설정·갱신·복구 계약 |
| MANIFEST.sha256 | 최종 packaged content 무결성 |

아래 작업을 순서대로 수행한다. 승인 범위·workspace·관련 맥락이 유효하면 동일 Coder를 재사용한다. 계획 내 task 경계만으로 QA·Reviewer gate를 추가하지 않는다. QA와 Reviewer는 최종 통합 상태에서 요구된 순서로 수행한다.

---

### Task 1: CEO 소유권과 직접 보고 정책 정렬

**Files:**

- Modify: skill/SKILL.md
- Modify: agents/arc-secretary.toml
- Modify: agents/arc-planner.toml
- Modify: agents/arc-scout.toml
- Modify: agents/arc-coder.toml
- Modify: agents/arc-qa.toml
- Modify: agents/arc-reviewer.toml
- Test: tests/test_install.py

**Interfaces:**

- Consumes: 승인 spec의 역할·보고·승인·동시성 계약.
- Produces: 개발 소유자는 CEO 하나이며 모든 활성 specialist가 CEO에 직접 보고한다. Secretary의 specialist 지원도 CEO가 직접 할당한다.
- 후속 task는 이 계약을 여섯 profile package와 README에 반영한다.

- [ ] **Step 1: 구조 계약을 고정하는 failing tests를 추가한다.**

  tests/test_install.py에 test_role_ 접두사 test를 추가한다. TOML profile parsing을 사용하고 작업 범위에 있는 여섯 활성 profile을 직접 지정한다. Test는 아래를 확인한다.

  - 각 활성 profile에 정확한 name이 있고 developer_instructions에서 CEO가 직접 보고 대상임을 확인할 수 있다.
  - 각 활성 depth-2 profile은 agent를 만들거나 spawn하지 않는다고 명시한다.
  - skill/SKILL.md가 개발·설정·test-code ownership을 CEO에 두고 별도 활성 Lead owner를 정의하지 않는다.
  - Secretary의 material-based research/analysis, standalone document writing과 live operational boundary는 유지된다.
  - 테스트는 문자열의 넓은 부재 여부에 의존하지 않고 명시적인 역할·보고·권한 문장을 확인한다.

  정확한 테스트 이름: test_role_profiles_report_to_ceo_without_nested_delegation 및 test_role_policy_assigns_development_to_ceo.

- [ ] **Step 2: 새 구조 테스트가 현재 checkout에서 실패하는지 확인한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_role_ -v

  기대: 현재 profiles가 Lead 또는 invoking owner를 보고 대상으로 삼고 일부 profile은 CEO direct-report 계약이 없어 관련 assertion이 FAIL한다. import/setup 오류가 아니라 변경할 정책에서 실패했는지 기록한다.

- [ ] **Step 3: skill policy와 여섯 profile을 승인 spec에 맞춘다.**

  skill/SKILL.md에서 Lead와 Secretary를 병렬 development owner로 두는 표현, “one owner plus three leaf” 계층, specialist가 Lead 또는 Secretary에게 반환한다는 계약, Secretary의 direct agent use를 제거한다. CEO를 개발의 유일한 owner로 지정하고 depth 2의 여섯 report, 전체 활성 subagent cap 4, nested delegation 금지를 명시한다. CEO가 Secretary에게 전문 결과를 전달하는 흐름을 명시한다.

  Secretary의 자료 기반 범위와 live operational boundary를 보존한다. Planner/Scout/Coder/QA/Reviewer profile은 기존 read/write·TDD·approval·QA·review·workspace 책임을 유지하면서 CEO에 보고하게 수정한다. 필요한 리서치 specialist 호출도 CEO를 거친다.

- [ ] **Step 4: 구조 테스트와 TOML parsing을 통과시킨다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_role_ -v
    python3 -B -c 'import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path("agents").glob("*.toml")]; print("profile TOML valid")'
    git diff --check

  기대: 두 test_role_ tests PASS, 남은 packaged profile TOML이 parse되고, 각 수정 문장은 승인 spec과 일치한다. 구조 결과를 agent runtime의 실제 parent 관계를 증명한 것으로 주장하지 않는다.

### Task 2: 여섯 역할 모델 계약과 CLI 호환

**Files:**

- Modify: skill/models.toml
- Modify: skill/scripts/model_config.py
- Modify: skill/scripts/apply-models.py
- Modify: install.py의 PROFILE_FILES, staged model settings normalization, preflight 오류 및 profile-count 출력
- Delete: agents/arc-lead.toml
- Test: tests/test_install.py

**Interfaces:**

- Preserve: load_settings(config_path: Path) -> dict[str, RoleSettings].
- Preserve: RoleSettings의 model: str 및 model_reasoning_effort: str.
- Produces: ROLE_FILES와 PROFILE_FILES는 정확히 여섯 역할·프로필에 대응한다.
- Add: serialize_settings(settings: dict[str, RoleSettings]) -> bytes. Version 3 TOML을 정확한 표준 여섯 역할로 정규화하고 source config를 수정하지 않는다.
- Preserve: prepare_updates(config_path: Path, agents_dir: Path) -> dict[Path, tuple[bytes, bytes, int]].
- Preserve: preflight_profiles(root: Path, module: ModuleType) -> dict[str, bytes].
- Legacy 입력은 load_settings에서 전체 항목을 검증한 뒤 알려진 Lead 하나만 effective result에서 제외한다.

- [ ] **Step 1: 표준·legacy model 입력의 failing tests를 추가한다.**

  tests/test_install.py의 기존 installer 테스트 arc를 사용하고 test_model_ 접두사 tests를 추가한다. tomllib과 model configuration module을 기존 test helper 방식으로 load한다. 기대 역할은 다음 여섯 개다: arc_secretary, arc_planner, arc_scout, arc_coder, arc_qa, arc_reviewer.

  추가할 test와 assertion:

  - test_model_standard_six_roles: standard config의 반환 key와 ROLE_FILES가 정확히 여섯 role이다.
  - test_model_legacy_preserves_six_selections: 알려진 Lead 항목 하나가 더 있는 유효한 version 3 config에서 반환값이 여섯 role 및 원래 model/effort와 정확히 같고 입력 bytes는 바뀌지 않는다.
  - test_model_legacy_lead_requires_valid_fields: legacy Lead 항목의 missing field, extra field, empty string, wrong type 각각은 ValidationError다.
  - test_model_rejects_unknown_missing_or_invalid_version: unknown extra role, missing specialist, version 1·2·bool 및 malformed structure는 오류다.
  - test_model_profile_sets_match_six_roles: model mapping, installer profile 목록과 source files가 정확히 여섯이다.
  - test_model_install_normalizes_legacy_settings: 유효한 legacy payload를 설치하면 staged ARC models.toml에는 Lead가 없고 나머지 여섯 model/effort가 유지된다. 입력 payload bytes는 바뀌지 않는다.

  기존 create_payload helper와 temp fixture를 사용한다. Source config를 직접 수정하지 말고 temporary config bytes로 모든 경우를 만든다. Installer normalization test는 temporary payload 안의 models.toml을 legacy version 3 bytes로 바꾸고 기존 acquisition stub으로 설치한다. Installed models.toml을 tomllib으로 읽어 역할 집합과 여섯 선택을 비교하고 payload source bytes가 그대로인지 확인한다.

- [ ] **Step 2: model tests가 현재 코드에서 실패하는지 확인한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_model_ -v

  기대: 현재 loader가 정확히 일곱 역할을 요구하므로 six-role assertion이 FAIL한다. 호환 테스트도 새 정규화 계약에서 FAIL해야 한다.

- [ ] **Step 3: 최소 six-role map, legacy reader 및 staged settings normalization을 구현한다.**

  model_config.py의 ROLE_FILES, models.toml, install.py의 active PROFILE_FILES에서 Lead를 제거한다. 기존 여섯 role의 model/effort 값을 보존하고 CEO용 항목은 만들지 않는다. version 3 입력 roles는 정확한 표준 여섯 또는 정확한 표준 여섯+known Lead 하나만 허용한다. 모든 role의 필드를 기존 규칙으로 검증한 뒤 effective result를 여섯으로 구성한다. legacy Lead 제외 사실은 간결한 stderr 안내로 알리고 config 파일은 쓰지 않는다. install.py의 seven-profile diagnostic을 six-profile 기준으로 수정한다.

  serialize_settings는 effective settings만 직렬화한다. Installer는 staged ARC copy의 models.toml을 이 정규화 결과로 대체하되 source payload 파일은 수정하지 않는다. 이전 installed ARC의 사용자 model settings를 새 payload 위로 자동 merge하지 않는다.

- [ ] **Step 4: model tests가 통과하는지 확인한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_model_ -v

  기대: 모든 test_model_ tests PASS. Legacy payload install 결과도 정확한 표준 여섯 역할과 보존된 여섯 선택을 가진다.

- [ ] **Step 5: apply-models.py CLI의 failing tests를 추가한다.**

  tests/test_install.py에 test_apply_models_ tests를 추가한다. CLI는 sys.executable과 script 절대 경로, --config, --agents-dir 인자를 사용해 temporary directories에서 실행한다.

  - Standard 및 legacy config에서 여섯 profile만 필요하고 Lead profile을 요구하지 않는다.
  - --check 결과는 일치 0, drift 1, invalid config 2다.
  - --dry-run은 drift가 있어도 0이며 config/profile/Lead bytes는 그대로다.
  - 일반 적용은 설정된 model/effort를 여섯 profile에 반영하지만 source config와 stale Lead를 수정·삭제하지 않는다.
  - 성공 출력은 여섯 profile 수를 나타내며 seven이라는 수를 표시하지 않는다.

- [ ] **Step 6: 새 CLI tests의 현재 실패를 확인한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_apply_models_ -v

  기대: seven-profile output 또는 strict seven role input 등 현재 코드와 달라질 계약에서 FAIL한다.

- [ ] **Step 7: apply-models.py를 여섯 profile contract로 정렬한다.**

  준비 단계에서 normalized settings로 여섯 profile만 갱신하도록 유지한다. seven-profile 출력 문구를 모두 수정한다. 기존 prepare-all-before-write와 apply rollback을 보존한다. Lead profile 삭제와 apply-models.py의 source config 자동 재작성은 추가하지 않는다.

- [ ] **Step 8: model·CLI tests를 다시 실행한다.**

  Step 4와 Step 6 명령을 각각 실행한다. 기대: 둘 다 PASS이며, source models의 여섯 선택이 승인 spec의 값과 같다. Legacy install normalization test도 staged copy만 정규화하고 payload source는 보존한다.

### Task 3: 기존 Lead 프로필의 transaction 퇴역

**Files:**

- Modify: install.py
- Test: tests/test_install.py

**Interfaces:**

- Consumes: Task 2의 six-role PROFILE_FILES와 normalized settings.
- Add: RETIRED_PROFILE_FILES = ("arc-lead.toml",).
- Add: retired_profile_targets(home: Path) -> dict[str, Path], 선택한 home 아래의 정확한 retired path만 반환.
- Preserve: install_plan의 기존 반환 tuple 및 호출자. Retired path 검증은 추가한다.
- Extend: backup_existing(..., retired_targets: dict[str, Path] | None = None) -> None. 존재하는 retired 일반 file을 기존 backup tree에 보존한다.
- Reuse: rollback의 기존 journal, retained-stage 및 recovery-report 처리.
- Produces: 설치 성공 시 live Lead가 없고, 실패 시 설치 전 상태가 spec대로 복원된다.

- [ ] **Step 1: 퇴역·rollback contract의 failing tests를 추가한다.**

  tests/test_install.py의 기존 fixture는 PROFILE_FILES만 seed하므로 Lead를 각 test에서 별도로 만든다. 기존 acquisition_stub, tree_state, run_main, assert_no_stages helper를 재사용한다.

  - test_retired_upgrade_backs_up_and_removes_lead: live Lead는 없고 backup의 bytes/mode는 같으며 다른 profile은 정상 갱신된다.
  - test_retired_missing_is_noop: absent Lead로도 설치가 성공하고 파일을 만들지 않는다.
  - test_retired_invalid_targets_leave_state_unchanged: target/parent symlink, dangling symlink, directory, FIFO가 사전 오류이고 live state는 그대로다.
  - test_retired_backup_failure_does_not_mutate_live_targets: backup copy failure injection 후 어떤 live target도 변경되지 않는다.
  - test_retired_later_failure_restores_previous_state: Lead retirement 뒤 profile replacement가 실패하면 Lead와 이전 target bytes/mode가 복원된다.
  - test_retired_action_failure_rolls_back_prior_changes: 앞선 외부 target 변경 뒤 retirement action이 실패하면 앞선 target도 rollback된다.
  - test_retired_absent_rollback_stays_absent: 원래 absent Lead는 실패 rollback 뒤에도 absent다.
  - test_retired_rollback_failure_preserves_recovery: restoration 실패 시 recovery file과 backup을 보존하고 출력된 정확한 경로가 존재한다.
  - test_retired_readonly_modes_do_not_write: --check와 --dry-run 뒤 전체 fixture state가 동일하고 acquisition이 호출되지 않는다.
  - test_retired_does_not_touch_unrelated_profiles: 다른 이름 profile과 다른 home의 Lead가 변하지 않는다.

  os.replace failure injection은 호출 순번보다 정확한 target 및 retirement 완료 상태를 기준으로 한다. FIFO는 읽지 않고 경로 종류 검사에서 거부한다.

- [ ] **Step 2: 퇴역 tests의 실패를 확인한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_retired_ -v

  기대: 현 installer가 retired Lead를 backup/removal하지 않으므로 주된 퇴역 contract tests가 FAIL한다.

- [ ] **Step 3: retired target의 사전 검사와 backup을 추가한다.**

  선택된 home의 정확한 retired path를 기존 install path safety 검사에 포함한다. os.path.lexists를 사용해 dangling symlink를 놓치지 않는다. absent target은 no-op, 일반 file만 backup 가능해야 한다. Backup이 모두 끝나기 전에 live mutation을 시작하지 않는다.

- [ ] **Step 4: retirement를 기존 action journal에 통합한다.**

  외부 target 적용 뒤, ARC 및 active profile 교체 전에 retired file을 동일 filesystem의 recovery stage로 이동한다. Retirement action을 journal에 기록하고 이전 Lead 위치를 rollback source로 보존한다. 정상 종료 시 recovery stage 정리는 기존 staging cleanup에서 담당하며 permanent backup은 남긴다. 실패 시 기존 역순 rollback, retained-stage, recovery-report 흐름을 사용한다.

- [ ] **Step 5: --check 및 --dry-run 동작을 구현한다.**

  --check는 retired path를 검증하되 쓰지 않는다. --dry-run은 존재하는 Lead에 대해서만 backup/removal 계획을 표시한다. Read-only branch에서 acquisition, stage, backup, directory 생성이 일어나지 않게 한다.

- [ ] **Step 6: 신규 퇴역 및 기존 failure/rollback tests를 실행한다.**

    python3 -B -m unittest discover -s tests -p test_install.py -k test_retired_ -v
    python3 -B -m unittest discover -s tests -p test_install.py -k failure -v

  기대: 신규 retired tests 및 기존 failure/rollback tests가 PASS한다. 실제 user installation 또는 network acquisition은 실행하지 않는다.

### Task 4: README와 manifest의 최종 통합

**Files:**

- Modify: README.md
- Modify: MANIFEST.sha256
- Inspect: Task 1–3의 전체 변경

**Interfaces:**

- Consumes: CEO direct-report policy, six-role model reader/CLI 및 retirement transaction.
- Produces: 사용자 문서와 packaged payload가 같은 역할·설치·호환 계약을 갖는다.

- [ ] **Step 1: README의 조직·라우팅·모델 설명을 갱신한다.**

  CEO 개발 소유권, Coder 편집, Secretary scope와 CEO 경유 specialist 지원, maximum active subagents 4, depth 2를 설명한다. seven-profile 안내와 Lead 조율·승인·완료 문구를 승인 spec에 맞춘다.

- [ ] **Step 2: 설정 호환·퇴역·복원·reload 안내를 추가한다.**

  알려진 유효 legacy Lead 항목만 읽기 정규화하며 CLI가 source config를 편집하지 않는 점, Installer가 staged copy를 표준 여섯 역할로 정규화하는 점, apply-models.py가 stale Lead를 삭제하지 않는 점, installer가 선택한 home의 정확한 Lead만 backup·퇴역시키는 점, 실패 rollback의 backup/recovery 경로를 문서화한다. 이전 설치의 사용자 모델 값을 payload 위로 자동 merge한다고 약속하지 않는다. 실행 중 agent가 자동 reload되지 않음을 유지한다.

- [ ] **Step 3: MANIFEST.sha256을 최종 packaged files로 갱신한다.**

  기존 tests/test_install.py의 refresh_manifest(root)와 같은 포함 규칙을 사용한다. install.py, install.command, README.md, skill/, agents/의 포함 일반 파일을 정렬해 hash를 만든다. skill/models.toml 및 일반 .DS_Store 제외를 유지하고 삭제된 Lead template의 항목을 제거한다.

  최종 QA에서 Python bytecode를 생성하지 않아 __pycache__ 파일이 payload 또는 manifest에 섞이지 않게 한다.

- [ ] **Step 4: 통합된 구조·무결성을 확인한다.**

    git diff --check
    python3 -B -c 'from pathlib import Path; import install; install.verify_manifest(Path.cwd()); print("manifest valid")'
    rg -n 'Lead|lead|arc_lead|seven|일곱' README.md skill agents install.py
    git status --short

  기대: whitespace와 manifest 검사가 통과한다. 남은 Lead 언급은 legacy validator, retired target, migration 안내에만 있고 활성 routing/model/profile mapping에는 없다. 검색 결과는 승인 spec과 대조하고 문자열 하나만으로 판정하지 않는다.

### Task 5: 최종 QA, 독립 전체 검토 및 acceptance

**Files:**

- Read/check: Task 1–4의 최종 전체 변경
- Test: tests/test_install.py
- Artifacts: 승인 spec, 이 plan, 검증 evidence

**Interfaces:**

- Consumes: 통합 최종 diff와 수락 criteria.
- Produces: 독립 QA evidence, full-change Reviewer findings, CEO의 acceptance/completion 판단.

- [ ] **Step 1: 독립 QA에게 최종 범위와 checks를 전달한다.**

  같은 workspace, 승인 spec·plan, 변경 파일, 새로운 tests 및 runtime 증거의 한계를 전달한다.

    python3 -B -m unittest discover -s tests -p test_install.py -v
    python3 -B -c 'from pathlib import Path; import install; install.verify_manifest(Path.cwd()); print("manifest valid")'
    git diff --check

  기대: 모든 기존·추가 tests PASS, manifest valid, whitespace 오류 없음. 실제 installation/network acquisition은 fixture stub으로 대체한 범위라는 점을 기록한다.

- [ ] **Step 2: QA findings를 처리한다.**

  수정은 Coder에게 배정한다. 수정 후 영향을 받은 tests를 실행하고 변경 packaged file이 있으면 manifest를 재생성한다. 최종 QA 상태와 evidence가 최종 diff를 가리키는지 확인한다.

- [ ] **Step 3: QA가 끝난 최종 상태를 독립 Reviewer에게 제공한다.**

  전체 변경, 승인 spec·plan, QA evidence 및 Review Focus를 전달한다. Reviewer는 legacy validation, path safety, backup-before-mutation, retirement journal/rollback, recovery cleanup, Secretary scope와 gate 보존을 집중적으로 검토한다.

- [ ] **Step 4: Review findings를 해결하거나 disposition한다.**

  필요한 수정은 Coder가 수행한다. 영향을 받는 QA를 다시 실행하고 최종 diff 상태가 바뀌었다면 Reviewer 근거의 freshness를 재확인한다. 작업 경계만으로 새 Reviewer를 자동 생성하지 않는다.

- [ ] **Step 5: CEO가 완료 여부를 판단한다.**

  spec acceptance criteria와 최종 evidence를 대조한다. 통과한 checks, 의미 검토, 한계, unresolved findings를 보고한다. Runtime parent relationship을 실행 검증했다고 주장하지 않는다. 이 변경은 완료 후 commit/push할 계획이 없다. 사용자가 이후 commit을 요청하거나 승인하면 focused staged diff를 확인하고 저장소의 Conventional Commit 형식을 따른다. Push는 별도의 승인 없이 하지 않는다.

## 가정과 열린 결정

- 승인 spec의 계약을 따른다. Installer는 staged copy의 models.toml을 effective six-role settings로 정규화하고 source payload는 그대로 둔다. 기존 installed model settings를 새 payload에 자동 merge하지 않는다. apply-models.py는 source config를 재작성하지 않는다.
- 정상 legacy 입력 안내는 stderr로 출력해 기존 반환 type과 CLI status 계약을 유지한다.
- tests/test_install.py의 fixture와 unittest를 재사용하며 test framework나 별도 test 파일을 추가하지 않는다.
- Retirement 순서는 외부 target 적용 후, ARC·active profile 교체 전으로 두어 앞선 실패와 후속 실패 양쪽 rollback을 검증한다.
- 사용자가 기존 master checkout 사용과 worktree 미생성을 명시했으므로 추가 workspace 선택은 없다.
- 실제 실행에서 TDD 또는 환경 검증 단계가 막히면 정확한 blocker/evidence를 CEO에게 반환하고 관련 approval gate를 따른다.

---

**Self-review 결과**

- 승인 spec의 역할·보고·Secretary 경계·concurrency·gate 보존은 Task 1, 모델 계약은 Task 2, 퇴역 lifecycle은 Task 3, README/manifest 통합은 Task 4에 대응한다.
- load_settings, prepare_updates, preflight_profiles의 기존 반환 계약을 유지하고 retired helper와 backup 인자의 역할을 정의했다.
- Review Focus의 다섯 경계 조건을 구체적인 test 이름과 Task에 연결했다.
- policy/profile 동작 변경을 포함해 각 behavior stage 전에 failing-first tests를 배치했다. Task 1은 역할 문구의 직접 보고/no-spawn 계약을 구조적으로 검사하고 runtime parent 동작 증거로 과장하지 않는다. README와 manifest만 정렬하는 Task 4는 비행동 문서 변경이다.
- 사용자의 plan 승인에 근거한 TDD 예외는 Task 1의 제한된 semantic policy/profile consistency tests에만 적용한다. 이 검사는 runtime parent behavior를 증명하지 않고 정확한 문장을 change detector로 고정하지 않는다. Model normalization 및 installer 행동 변경은 Task 2–3에서 계속 genuine failing-first cycles를 요구한다. Task 4의 README와 manifest 갱신은 비행동 산출물이다.
- Installer의 normalized model settings file 생성 조건을 승인 spec과 맞춰 legacy payload test로 확인한다. Source payload와 기존 backup 동작은 보존한다.
- commit은 선택사항으로 남기고 이번 작업에서는 계획하지 않는다. 승인된 commit-message format과 push approval 경계를 별도로 보존했다.
- 실제 repository의 유일한 test module과 기존 unittest fixture를 기준으로 commands를 작성했다. QA 다음 최종 전체 Reviewer 순서를 보존했다.
- 사용자 지정 workspace와 baseline evidence를 기록하고 worktree를 만들지 않도록 했다.
- 설치는 user Codex home에 수행하지 않으며 runtime role relationship을 테스트했다는 과장을 하지 않는다.
- 승인 전에 plan을 저장·수정·실행하지 말라는 gate를 반영했다. 사용자가 plan을 승인하기 전 Coder/코드 변경을 시작하지 않는다.
