# Claude 독립 스킬 설치와 ARC 정책 정렬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`. 단계는 체크박스로 기록한다.
> ARC에 따라 CEO가 순차 조정하고 Coder가 구현한다. 별도 실행 방식 선택이나 Coder 커밋은 요구하지 않는다.

**Goal:** Codex를 보존하면서 Claude 스킬 링크를 독립 upstream 복사본으로 전환하고, Claude 배포의 공통 ARC 정책을 기준 문서와 정렬한다.

**Architecture:** T1은 Claude의 정확한 마지막 링크만 안전하게 백업·교체·복구한다. T2는 공통 정책의 내용·섹션 순서를 기준 문서와 정렬하고 실제 Claude native 역할·모델·스크립트·지원 경로에 맞게 adapter를 적용한다. 두 작업을 각각 검증·수용·커밋한다.

**Tech Stack:** Python 3.11+, 표준 라이브러리, `unittest`, `unittest.mock`, 기존 upstream 취득 및 staging 구조.

**Spec:** 별도 written spec은 생략했다. T1은 2026-10-15 사용자 승인 Bounded 설계와 기존 [외부 스킬 동기화 계획](docs/superpowers/plans/2026-10-04-external-skills-sync.md)을 따른다. T2는 사용자가 요청한 정책 정렬과 아래의 Claude adapter 계약을 따른다.

**Global Constraints**

- 선택된 Claude 대상 경로는 `~/.claude/skills/<name>`이고 허용 목적지는 같은 이름의 `~/.codex/skills/<name>`뿐이다.
- 절대·상대 링크 모두 정규화 목적지가 정확히 일치해야 한다. `CODEX_HOME`은 이 예외의 목적지로 사용하지 않는다.
- Claude 부모·중간 경로 링크, 다른 이름·위치, dangling·cycle·파일 목적지는 일반 설치에서 거부한다.
- 허용 링크는 링크 항목 자체를 백업·이동하고 검증된 upstream 취득본을 설치한다. Codex의 기존 내용과 사용자 수정은 Claude로 복사하지 않는다.
- Codex 설치의 기존 strict symlink 정책과 취득 tree의 containment 검증은 유지한다.
- `--check`와 `--dry-run`은 파일·백업·staging을 만들지 않고 process·network acquisition을 실행하지 않는다.
- 실제 사용자 설치는 수행하지 않는다. 테스트는 임시 사용자 home과 mocked acquisition만 사용한다.
- T1 수용·커밋 후 T2를 시작하며, 각 작업은 별도 focused commit으로 남긴다.
- Significant risk: 각 task마다 Coder 구현, 독립 QA, CEO 수용과 focused commit을 거친 뒤 최종 전체 변경을 독립 Reviewer가 검토한다.
- 최종 검토와 전체 검증 뒤 사용자가 요청한 대로 선택된 작업 브랜치를 원격에 push하고 한국어 PR을 생성한다. 병합하지 않는다.

## Review Focus

1. Claude leaf link의 backup은 `copytree()`로 목적지 tree를 순회하지 않고 원래 `readlink` 문자열을 보존한다.
2. 같은 경로의 링크가 acquisition 중 다른 inode의 같은 목적지 링크로 교체되면 snapshot 변화로 감지한다.
3. 부모 경로가 링크로 바뀐 경우 no-follow 이동이 실패하고 외부 sentinel이 불변이어야 한다.
4. install 또는 rollback 실패에서 원래 링크가 복구되며, rollback 실패 자료와 절대 recovery 경로가 보존된다.
5. relative link의 backup 복사본은 원래 위치 복원용으로 취급하며 backup 위치에서 역참조하지 않는다.
6. Claude 공통 정책이 기준 문서와 같은 의미·순서를 보존하고, native execution adapter를 실제 배포 구성에 맞게 설명하는지 확인한다.
7. Claude 배포 Markdown에 다른 플랫폼의 제품명·전용 API·경로가 남지 않는지 확인한다.

위 조건은 각각 `test_claude_skill_link_backup_and_rollback_never_follow_target`, `test_claude_skill_links_changed_during_acquisition_abort`, 부모 swap 하위 사례, `test_claude_skill_link_transaction_failure_restores_original`, `test_claude_skill_link_rollback_failure_preserves_recovery`에서 확인한다.

## 계획 깊이

T1은 보안·파일시스템 경계와 transaction 복구를 변경하고, T2는 공유 역할·행동 계약을 변경하므로 둘 다 significant risk다. 경로 분류·취득 재검증·링크 복구와 정책 정렬·adapter 검증은 의존 단계가 있으므로 계획을 생략하지 않는다. 별도 spec은 필요하지 않다.

## T1 — Claude 링크를 독립 upstream 디렉터리로 전환

**선행 조건:** 승인된 설계와 본 계획, CEO의 실행 handoff 검증.

**파일 책임**

| 작업 | 파일 | 변경 |
|---|---|---|
| T1 | `install.py` | Claude 전용 link 분류, link root backup, no-follow 이동·복원, 재검증과 결과 안내 |
| T1 | `tests/test_target_install.py` | 성공·거부·경합·rollback·read-only 회귀 테스트 |
| T1 | `tests/test_install.py` | 필요한 fault-injection mock 호환만 조정, 기존 regression 유지 |
| T1 | `README.md` | Claude copy 전환 조건, Codex 보존, backup 및 dry-run 안내 |
| T1 | `docs/superpowers/plans/2026-10-04-external-skills-sync.md` | 기존 계약을 재작성하지 않고 날짜 있는 Claude 예외 addendum 추가 |
| T1·T2 | `MANIFEST.sha256` | 각 task가 변경한 배포 파일 hash 갱신 |
| T2 | `claude/skill/SKILL.md` | 공통 정책·섹션 정렬과 Claude native execution adapter |
| T2 | `claude/skill/references/handoff.md` | 실행 지원 경로를 플랫폼 중립 문구로 정리 |
| T2 | `claude/skill/references/handoff-prep.md` | current-checkout 한정 adapter 문구 정리 |
| T2 | `claude/skill/references/visual-companion.md` | 실제 허용 capability 기준으로 정리 |
| T2 | `tests/test_claude_payload.py` | 공통 정책·adapter·배포 문구 회귀 검증 |

**인터페이스 경계**

- `external_write_targets(..., allow_claude_skill_links: bool = False)`를 확장한다. 예외는 Claude target에서만 활성화한다.
- `replaceable_claude_skill_link(path: Path, user_home: Path, skill: str) -> str | None`은 정상 디렉터리에 `None`, 허용 link에 원본 문자열을 반환하고 금지 link에는 `InstallerError`를 낸다.
- `snapshot_managed_targets()`의 기존 no-follow metadata와 link-text snapshot을 재사용한다.
- `perform_install()`은 허용 link와 최초 snapshot을 transaction에 전달하고, acquisition 이후 기존 방식으로 target과 snapshot을 재검증한다.
- `_replace_claude_skill_leaf(source: Path, destination: Path) -> None`은 두 부모를 no-follow directory descriptor로 열고 `os.replace(..., src_dir_fd=..., dst_dir_fd=...)`를 사용한다. Claude leaf 이동·설치·복원에만 적용한다.
- backup은 허용 link의 원본 문자열로 symlink 항목을 생성한다. 링크 root를 `copytree()`에 전달하지 않는다.
- 기존 일반 설치 transaction의 경합 보장을 확장해서 주장하지 않는다. 필요한 새 descriptor는 모든 경로에서 닫는다.

### 진행 단계

- [x] **1. 전환·거부 테스트를 먼저 작성한다.**
  - `test_claude_skill_links_convert_to_independent_upstream_copies`: 세 필수 skill의 절대·상대 link fixture를 섞어 설치한다. Claude 경로가 실제 directory이고 `SKILL.md`가 mocked upstream bytes인지, backup symlink의 `readlink` 문자열이 보존되는지, Codex `tree_state()`가 설치 전후 동일한지 확인한다.
  - `test_claude_skill_links_reject_unsafe_targets_before_acquisition`: 다른 목적지·이름, Claude 부모 link, Codex skill-root link, dangling·cycle·file target을 subtest로 둔다. status 2, acquisition 미호출, target·sentinel 불변을 확인한다.

- [x] **2. 성공 경로의 RED를 확인한다.**

```sh
PYTHONPATH=tests python3 -m unittest test_target_install.TargetInstallTests.test_claude_skill_links_convert_to_independent_upstream_copies -v
```

기대 결과는 현재 symlink guard에 따른 실패다. import나 fixture 오류는 RED로 인정하지 않는다.

- [x] **3. 제한된 분류와 link-entry transaction을 구현한다.** Claude 분기에서만 exact same-name Codex destination을 허용한다. `backup_existing()`은 link text를 읽어 symlink 자체를 backup하고, transaction은 link를 previous로 옮긴 뒤 validated staged directory를 설치한다. Codex 내용을 읽어 복사하지 않는다.

- [x] **4. 성공·거부 테스트를 GREEN으로 만들고 acquisition 경합 테스트를 추가한다.**
  - `test_claude_skill_links_changed_during_acquisition_abort`: retarget, unlink, directory replacement, 같은 목적지의 새 link를 acquisition 중 주입한다. transaction 전에 중단하고 사용자 변경을 보존한다.
  - status, transaction 호출 여부와 sentinel·Codex tree를 확인한다. 이미 기존 검사로 통과하는 subcase는 회귀 증거로 기록한다.

- [x] **5. 교체·rollback 경계 테스트를 추가하고 구현한다.**
  - `test_claude_skill_link_backup_and_rollback_never_follow_target`: link root에 `copytree()`가 호출되지 않으며, 이동 직후 및 후속 profile 교체 실패에서 원래 link와 이전 관리 파일이 복구되는지 확인한다.
  - `test_claude_skill_link_rollback_failure_preserves_recovery`: 복원 실패 뒤 previous link가 `lexists()`이고 원본 문자열을 유지하며 절대 recovery path가 출력되는지 확인한다.
  - 부모 swap 경계에서 no-follow 동작과 외부 sentinel 불변을 확인한다. 기존 `rollback()` action 구조를 확장하고, 실패한 복구 자료는 삭제하지 않는다.

- [x] **6. 읽기 전용·출력 회귀를 추가한다.** `test_claude_skill_link_readonly_modes_and_conversion_output`에서 `--check`와 `--dry-run` 전후 tree가 같고 acquisition·transaction·staging이 호출되지 않는지 확인한다. dry-run은 허용 link가 독립 directory로 바뀔 예정임을 표시하고 금지 link는 오류로 알린다. 실제 설치 출력은 backup 위치를 포함한다.

- [x] **7. README와 동기화 계약을 갱신한다.** 정확한 Claude leaf link만 upstream 복사본으로 전환하고 Codex 사용자 수정은 이전하지 않는다는 점, 실패 시 원래 link를 복원한다는 점, 부모·다른 목적지·dangling link 거부, dry-run 동작을 설명한다. 상대 link backup은 원래 위치로 되돌릴 때 쓰며 backup 위치에서 역참조하지 않는다고 적는다. 과거 계획은 그대로 보존하고 날짜 있는 addendum만 추가한다.

- [x] **8. manifest를 갱신한다.** 다음 명령은 구현 단계에서만 실행하고 변경된 payload hash를 확인한다.

```sh
PYTHONPATH=tests python3 -c 'from pathlib import Path; from test_install import refresh_manifest; refresh_manifest(Path.cwd())'
```

- [x] **9. focused regression과 전체 suite를 실행한다.**

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tests python3 -B -m unittest test_target_install -v
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=tests python3 -B -m unittest test_install.ExternalSkillPreflightTests test_install.AcquiredTreeValidationTests test_install.ExternalSkillAcquisitionTests -v
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -v
git diff --check
```

기대 결과: focused suites와 manifest 검증 통과, `git diff --check` 출력 없음. 전체 suite는 아래에서 승인된 기준선과 비교한다. 기존 Codex symlink strict 테스트(`test_write_targets_reject_root_alias_without_touching_target`, `test_install_rejects_candidate_root_alias_before_acquisition`)와 `test_claude_root_symlink_is_rejected_without_following`를 보존한다.

### 승인된 전체 suite 기준선 예외 (2026-10-15)

구현 전 기준선은 `89e6eee1f2434f58665b5482dab0d9e65776e24a`이며, 깨끗한 임시 복사본에서 전체 suite를 실행하면 250개 중 기존 README 정책 계약 검사 11개 실패와 오류 2개가 발생한다. 사용자 승인에 따라 T1·T2·최종 수용은 이 기준선 대비 신규 실패·오류가 없는 것으로 판정한다. 현재 T1 변경도 생성된 Python cache를 격리하고 bytecode 생성을 끈 상태에서 258개 중 동일한 11개 실패와 2개 오류만 발생했다.

기준선의 오류는 `test_loader_keeps_subagents_on_profiles`, `test_reference_triggers_cover_dependent_stages`다. 실패는 `test_ownership_and_flows_name_the_direct_path_exception`, `test_coder_profile_holds_handoff_contract_without_full_reference_read`, `test_brief_template_field_order_and_delta`, `test_handoff_record_file_location`, `test_models_scouter_lookup_exception`, `test_research_routing_tiers`, `test_skill_not_reread_and_agents_body_wording`, `test_final_single_reviewer_is_explicit`(README subtest), `test_qa_ui_browser_acceptance_contract`, `test_worktree_readme_matches_selected_execution_paths`, `test_document_batch_and_external_action_boundaries_remain`이다. 이 실패들은 구현 전 기준선의 README 기대값 불일치다. 새 payload 검증에 Python bytecode cache가 들어가지 않도록 `PYTHONDONTWRITEBYTECODE=1`을 사용하고, 기존 테스트 생성 cache는 격리한 뒤 복원한다.

### T1 수용 기준

- 허용된 세 symlink가 독립 upstream Claude directories로 전환되고 Codex tree와 mode가 불변이다.
- 허용 범위 밖 symlink는 acquisition 전에 거부된다.
- acquisition 경합은 transaction 전에 감지되고 사용자 변경이 보존된다.
- link backup과 rollback은 원본 문자열을 보존하며 rollback 실패 자료를 보존·보고한다.
- `--check`와 `--dry-run`의 read-only 성질, dry-run 안내, manifest 및 focused regression이 통과하고 전체 suite가 승인 기준선 대비 신규 실패·오류가 없다.
- 독립 QA가 임시 fixture에서 위 기준의 명령·결과·검증 상태를 보고한다. 실제 사용자 install은 수행하지 않는다.
- CEO가 QA 결과와 findings를 검토해 수용한 뒤 focused implementation commit을 만든다. 권장 메시지: `fix(installer): Claude 스킬 링크를 독립 복사본으로 전환`.

**T1 CEO 수용:** 2026-10-15. 독립 QA가 Claude 전환·거부·경합·rollback·read-only 경계와 기존 외부 스킬 회귀를 통과시켰다. 전체 suite는 사용자 승인 기준선과 같은 11개 실패·2개 오류만 남았고 manifest 및 formatting 검사가 통과했다. Plan progress와 수용 기록은 T1 focused commit에 포함한다.

### 보류 조건

허용 경로 확대, Codex tree 수정·복사, 전역 transaction 재설계, 또는 실패 뒤 사용자 변경을 보존할 수 없는 경우 중단해 범위·계획 승인을 다시 받는다. Codex 불변성과 recovery 보존을 임시 fixture로 입증하지 못해도 수용하지 않는다.

## T2 — Claude ARC 공통 정책과 native adapter 정렬

**선행 조건:** T1 위험 조건 QA, CEO 수용·focused commit 및 새 handoff. T2는 T1 이후 HEAD를 기준으로 시작한다.

**목표:** `claude/skill/SKILL.md`를 기준 문서와 같은 공통 정책·섹션 순서로 정렬하면서 실제 Claude native 실행·설정 경계를 지킨다. 연결된 배포 reference의 다른 플랫폼 명칭도 제거한다.

### 공통 정책 계약

`codex/skill/SKILL.md`는 읽기 전용 기준이다. Claude 문서는 아래 섹션을 이 순서로 포함한다.

```text
Ownership
Instruction and execution adapter
Shared terms
Mandatory task references
Common handoff gate
Coder TDD and constraints
Risk-scaled execution
CEO direct path for small tasks
Automatic commit after plan-task acceptance
Token discipline and handoffs
Models
```

요약 과정에서 다음 정책을 빼지 않는다.

- CEO와 역할의 소유권·위임 경계, depth 2 직접 보고, 최대 네 역할 동시 진행, 독립 작업만 병렬화.
- Scouter의 조사 범위와 실행 상태 조사·정리 제외, 읽기 전용 역할의 편집·실행·저장 금지.
- 플랫폼 지침 → ARC 정책 → 역할 지정 skill 우선순위, 설치 skill의 executor·초기 spec commit 절차 adapter.
- task마다 새 Coder, 같은 task 재작업 reuse 조건, 승인된 변경 뒤 fresh Coder 재시작과 전체 handoff 확인.
- preservation rule, explicit choice, stop and inspect, evidence verdict.
- 설계 깊이와 검증 위험의 분리, 적용 가능한 문서 세트·승인·실행 대상·커밋 선행순서.
- common handoff gate, Coder의 TDD 기본 및 제한된 waiver, behavior가 아닌 문서 변경 exception 기록.
- CEO direct path의 작은 범위·계획 생략·위험 제외 조건, 사전 설계 승인, 첫 편집 전 상태 확인, 승인 파일 한정, 사후 증거.
- 위험별 QA/Reviewer 최소 흐름, 최종 전체 변경 Reviewer 한 번, plan task마다 불필요한 gate를 추가하지 않는 규칙.
- plan task 수용 뒤 CEO가 바로 focused commit, push·merge 별도 권한.
- 필요한 범위의 근거 읽기, 고정 필드 handoff brief, canonical record, 재시작 시 delta brief, 변경 진행 보고.

### Claude native adapter 계약

| 구분 | 계약 |
|---|---|
| Native 역할 | `arc-scouter`, `arc-planner`, `arc-coder`, `arc-qa`, `arc-reviewer`; 실행 이름은 하이픈, `models.toml` key는 underscore 그대로 유지 |
| Native 실행 | Claude subagent 기능으로 지정된 역할을 호출하고 완료 결과를 받는다. Codex 전용 함수·인자·앱/API를 계약으로 복사하지 않는다. |
| 설정과 모델 | `claude/skill/models.toml`과 `model_config.py` 형식을 따른다. 현재 local 모델 별칭·effort를 표시하되 선언이 실제 provider 적용 증거라고 주장하지 않는다. |
| 설정 재적용 | 설치 경로 `python3 ~/.claude/skills/arc/scripts/apply-models.py`; 현 스크립트의 실제 옵션 `--config`, `--agents-dir`, `--check`, `--dry-run`만 안내한다. |
| 실행 대상 | Claude v1은 현재 checkout에서만 실행한다. 사용자가 현재 branch 재사용 또는 task branch를 명시 선택하게 하고, ARC-managed worktree 선택은 지원하지 않는다. |
| 필수 참조 | 실제 존재하는 Claude references 7개만 연결한다. `handoff-worktree`나 app attachment 절차를 요구하지 않는다. |
| visual capability | `visual-companion`의 capability와 각 role allowlist 범위 안에서만 사용한다. 불가하면 보고하고 시각 검증을 주장하지 않는다. |
| native 한계 | 모델 가용성·계정 권한·provider alias·실제 effort·동시성·깊이 2 실행을 정적으로 입증했다고 표현하지 않는다. tool list는 filesystem sandbox가 아니다. |

### 구현·검증 단계

- [x] **1. 정책 회귀 테스트를 먼저 추가한다.** `tests/test_claude_payload.py`에 다음을 둔다.
  - `test_claude_shared_policy_sections_and_contracts_are_complete`: 위의 11개 section 순서와 소유권·approval·handoff·TDD·위험 flow·commit의 핵심 clause를 검사한다. 본문 전체 byte 비교는 하지 않는다.
  - `test_claude_native_adapter_matches_shipped_profiles_and_scripts`: native frontmatter name과 underscore 설정 key를 구분하고, 설정·스크립트 옵션·7개 reference 및 current checkout 정책을 확인한다.
  - `test_claude_skill_markdown_has_no_foreign_platform_contracts`: `claude/skill` Markdown 전체에 제품명, 전용 API·경로 등 다른 플랫폼 계약이 남지 않았는지 검사한다. 일반 Git의 `worktree` 단어와 Claude 모델 설정 key는 허용한다.

- [x] **2. 새로운 계약이 실패하는지 확인한다.** 테스트가 구조 문서/미지원 호출 내용 때문에 실패해야 하며 import·fixture 오류는 RED로 인정하지 않는다.

```sh
PYTHONPATH=tests python3 -m unittest test_claude_payload.ClaudePayloadTests.test_claude_shared_policy_sections_and_contracts_are_complete test_claude_payload.ClaudePayloadTests.test_claude_skill_markdown_has_no_foreign_platform_contracts -v
```

- [x] **3. `claude/skill/SKILL.md`를 기준 section 및 공통 정책에 맞게 정렬하고 위 Claude adapter 계약을 적용한다.** role native names만 실행에 사용하고 `models.toml`의 설정 key를 바꾸지 않는다.
- [x] **4. 연결 reference 세 곳을 정리한다.** `handoff.md`, `handoff-prep.md`, `visual-companion.md`에서 다른 플랫폼 이름·API·경로를 빼고 current-checkout·실제 capability 경계를 유지한다.
- [x] **5. 수용 검토 자료를 마련한다.** Coder 보고에 기준 section → Claude 위치 → 공통 policy/adapter 차이 → 근거·검증 상태의 정렬표를 넣는다. 동등성·실행 지원을 확인할 수 없는 지점은 unverified로 보고한다.
- [x] **6. manifest를 갱신하고 Claude 계약 및 전체 회귀를 확인한다.**

```sh
PYTHONPATH=tests python3 -c 'from pathlib import Path; from test_install import refresh_manifest; refresh_manifest(Path.cwd())'
PYTHONPATH=tests python3 -m unittest test_claude_payload -v
python3 -m unittest discover -s tests -v
git diff --check
```

**T2 수용 기준:** 11개 공통 policy section이 순서대로 있고 핵심 승인·소유권·TDD·위험·수용 계약이 보존된다. native role name·모델 설정·실행 대상·참조가 배포 구성과 일치하고 Claude 배포 Markdown에 다른 플랫폼 계약이 없다. Claude payload focused 검사, manifest와 `git diff --check`가 통과하고 전체 suite는 위 승인 기준선 대비 신규 실패·오류가 없다. 독립 QA가 정렬표를 기준으로 의미 누락·adapter 충돌을 검토한다. 실제 provider runtime 적용은 로컬 검사로 검증했다고 표현하지 않는다. CEO는 수용 후 별도 focused commit을 한다.

**T2 CEO 수용:** 2026-10-15. 독립 QA가 공통 정책, native adapter, references 및 visual capability 경계를 계획에 따라 확인했다. Claude payload 15개 테스트와 manifest·format 검사가 통과했고 전체 suite는 승인 기준선과 동일한 11개 실패·2개 오류만 남았다. Provider/runtime 적용은 미검증으로 유지한다. Plan progress와 수용 기록은 T2 focused commit에 포함한다.

**보류 조건:** source 정책과 native 지원 경계가 충돌해 새 행동 결정이 필요하거나, per-call effort·fresh context·완료 대기 실행 기능을 필수로 약속해야 하거나, 지원되지 않는 worktree·API가 있어야 계약이 성립하는 경우 중단해 CEO에게 근거와 선택지를 보고한다. profile·모델·script 변경이나 공유 정책의 의미 변경도 재승인 없이 진행하지 않는다.

**권장 커밋:** `docs(claude): 공통 ARC 정책과 네이티브 실행 안내 정렬`

## 최종 전체 검증

T1·T2 각각의 QA·CEO 수용·focused commit 이후, 독립 Reviewer가 최종 전체 변경을 한 번 검토한다. 초점은 정확한 경로 예외, backup의 no-follow 성질, descriptor 이동·복원, 경합·rollback/recovery, 공통 정책 정렬, Claude execution adapter, README·기존 sync plan·reference·manifest 정합성이다. Reviewer는 task 수용의 선행조건이 아니다. 최종 전체 suite는 위 사용자 승인 기준선과 비교해 신규 실패·오류가 없어야 하며, feature-focused 검사와 manifest는 통과해야 한다. 수정 시 영향 테스트와 QA를 다시 수행하고 최종 전체 diff를 재검토한다.

**최종 검증 기록 (2026-10-15):** 최종 Reviewer가 symlink target의 `..` 앞 누락 경로·중간 symlink 검증 우회를 발견했다. 원래 target 경로를 strict resolution하고 구성요소 symlink를 각각 확인하도록 보정했으며, 두 우회 사례의 회귀 테스트를 추가했다. Reviewer 재검토에서 finding 종결과 추가 정적 finding 없음이 확인됐고, 독립 QA에서 `test_target_install` 29개 및 관련 회귀·read-only 테스트 3개가 통과했다. SHA-256 manifest 34개와 `git diff --check`가 통과했으며, bytecode cache를 임시 격리한 `python3 -B install.py --target claude --check`도 통과했다. 최종 전체 suite는 263개 중 기준선과 같은 실패 11개·오류 2개였고 신규 실패·오류는 없었다. cache 디렉터리 5개는 삭제하지 않고 원위치로 복원했다. 실제 사용자 설치와 Claude provider/runtime 검증은 수행하지 않았다.

## 계획 자체 검토

- 승인 범위의 분류·독립 취득·Codex 불변·backup·rollback·read-only 정책을 T1에 연결했다.
- 기존 no-follow snapshot과 실패 주입 구조를 재사용하고 새 이동 처리는 Claude leaf에 한정했다.
- review focus는 구체 테스트·Claude 정책 정렬표·수용 증거에 연결된다.
- T2를 별도 significant task로 나누고 정책의미 QA 및 focused commit을 포함했다.
- 실제 기능이 불명확한 native runtime 지원을 추정하지 않는다.
- README, 현재 동기화 계약, Claude reference, payload hash 갱신을 포함했다.
- 구현은 Coder, QA와 Reviewer는 독립 역할, task별 수용·commit은 CEO 책임이다.
