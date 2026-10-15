# Codex와 Claude Code 선택 설치 구현 계획

작성일: 2026-10-14  
상태: 계획 승인, T1 커밋 완료, T2 준비 중  
승인 명세: docs/superpowers/specs/2026-10-14-claude-code-support-design.md  
명세 승인 근거: 사용자의 “진행해”

## 목표와 구조

공통 install.command --target codex|claude에서 두 플랫폼의 ARC를 안전하게 설치하고, Codex 전용 저장소 소스를 codex/ 아래로 정리한다.

설치·취득·백업·복구 엔진은 루트 install.py에서 공유한다. 플랫폼별 agent·skill·모델 설정은 codex/와 claude/로 구분한다. Claude 실행 정책은 별도 adapter와 참조로 제공한다. 저장소 소스 이동은 사용자 설치 경로를 바꾸지 않는다.

기술 구성은 Python 3.11 이상, Python 표준 라이브러리, Bash 진입점, TOML 모델 설정, Claude Markdown frontmatter, unittest다.

## 공통 제약

- 유일한 shell 진입점은 install.command다. install-claude.command 같은 플랫폼별 wrapper는 만들지 않는다.
- backend와 진입점은 정확히 한 번의 --target codex|claude를 요구한다. --help만 대상을 생략할 수 있다.
- Codex 사용자 설치 경로·모델·정책·복구 계약을 보존한다.
- 저장소의 agents/, skill/, config.toml, tools/codex_token_usage.py를 codex/ 아래로 이동한다. skill/SKILL.md와 모든 하위 파일을 포함한다.
- 공용 installer·README·tests·manifest는 저장소 루트에 유지한다. 과거 specs/plans는 역사 기록으로 보존하고 일괄 경로 치환하지 않는다.
- Claude 설치 루트는 ~/.claude다. 빈·상대·비기본 CLAUDE_CONFIG_DIR를 부수 효과 전에 거부한다.
- 두 대상은 상대 플랫폼의 사용자 파일을 탐색·변경하지 않는다.
- --check·--dry-run은 쓰기·subprocess·네트워크를 실행하지 않는다.
- 검증은 격리된 홈과 가짜 취득 자료를 사용한다. 실제 사용자 설치를 변경하지 않는다.
- 실제 모델 API 호출이나 대표 역할 실행은 검증에 필수로 호출하지 않는다. 확인할 수 없는 런타임 인식은 미검증으로 보고한다.
- 외부 스킬 취득 환경·timeout·검증 계약을 유지한다.
- 모델·effort 매핑은 근사이며 provider별 실제 적용을 보장하지 않는다.
- Coder가 구현·테스트·설정·manifest·구현 종속 문서를 수정한다. CEO는 조정·승인·수락·commit을 담당한다.

## 주요 실패 조건

1. 소스 경로 이동 뒤 사용자 설치 경로에 codex/가 추가되는 경우 — T1.
2. 같은 값·다른 값·--target=value 혼합 반복을 마지막 값 우선으로 처리하는 경우 — T3.
3. 기본 경로 문자열 정규화로 symlink 검사를 우회하는 경우 — T3.
4. 모델 재적용 실패로 일부 프로필만 갱신되거나 본문이 바뀌는 경우 — T2.
5. 취득 중 사용자 전역 파일 변경을 덮어쓰거나 복구 실패 자료를 삭제하는 경우 — T3.

각 실패 조건은 해당 task의 테스트와 수락 근거에 포함한다.

## 파일 구성과 책임

| 파일·트리 | 책임 | task |
|---|---|---|
| codex/agents/ | 기존 Codex 프로필 | T1 |
| codex/skill/ | 기존 skill 전체·모델·scripts·references | T1 |
| codex/config.toml | 기존 Codex 예시 설정 | T1 |
| codex/tools/codex_token_usage.py | 기존 Codex 전용 유틸리티 | T1 |
| claude/agents/arc-*.md | Claude 프로필 다섯 개 | T2 |
| claude/skill/SKILL.md | Claude CEO adapter | T2 |
| claude/skill/references/ | 역할·승인·인계·검증 참조 | T2 |
| claude/skill/models.toml | Claude 모델·effort 설정 | T2 |
| claude/skill/scripts/model_config.py | 설정 검증·프로필 렌더링 | T2 |
| claude/skill/scripts/apply-models.py | 설치된 프로필 모델 재적용 | T2 |
| install.py | 소스 선택·manifest·설치 거래 | 순차 변경 |
| install.command | 유일한 shell 진입점 | T3 |
| tests/test_install.py | 기존 회귀·payload fixture·거래 검증 | 순차 변경 |
| tests/test_token_usage.py | 이동한 유틸리티 회귀 | T1 |
| tests/test_claude_payload.py | Claude payload·재적용 검증 | T2 |
| tests/test_target_install.py | CLI·격리·설치 거래 | T3 |
| README.md, MANIFEST.sha256 | 문서·무결성 계약 | 순차 변경 |

동일 파일을 수정하는 task는 순차 실행한다. 각 task가 바꾼 payload·README·manifest는 같은 수락 단위에서 함께 갱신한다.

## 의존성

T1 Codex 소스 이동 → T2 Claude payload 및 모델 재적용 → T3 대상별 installer 통합 → 최종 전체 검증

T1은 기존 동작을 유지하는 소스 정리, T2는 독립 검증 가능한 Claude payload, T3는 대상 선택과 안전한 설치 거래를 제공한다.

## T1. Codex 전용 소스 이동과 기존 동작 보존

**목표:** Codex 전용 저장소 파일을 codex/로 이동하고 installer·테스트·문서·manifest의 소스 참조를 갱신한다. 사용자 설치 경로와 정책 내용은 유지한다.

**소유자:** Coder.  
**선행 조건:** 계획 승인, 실행 준비 확인, CEO의 handoff 완료. 선행 구현 task 없음.

**대상 파일**

- 이동: agents/ → codex/agents/
- 이동: skill/ → codex/skill/ 전체. SKILL.md, scripts/, references/, models.toml 포함
- 이동: config.toml → codex/config.toml
- 이동: tools/codex_token_usage.py → codex/tools/codex_token_usage.py
- 변경: install.py, README.md, MANIFEST.sha256
- 변경: tests/test_install.py, tests/test_token_usage.py

**진행 단계**

1. source 경로와 사용자 설치 destination을 구별하는 test_codex_repository_layout_preserves_installed_destinations를 먼저 작성한다. 새 소스 위치 존재, 기존 루트 agents/와 skill/ 부재, 기존 CODEX_HOME 설치 경로 존재, 설치 트리에 codex/ 미생성을 확인한다.
2. 해당 테스트가 이동 전 소스 배치 불일치로 실패하는지 확인한다.
3. 전체 Codex 전용 트리를 이동하고 load_model_module, preflight_profiles, staging source, manifest 필수 경로·mutable 경로를 갱신한다. 설치 경로에는 codex/를 추가하지 않는다.
4. fixture 복사·manifest helper·정책 파일 참조·token utility 경로·README의 현재 링크를 갱신한다. 과거 specs/plans의 역사 경로는 일괄 수정하지 않는다.
5. 불변 파일 hash를 실제 bytes에서 재생성한다. codex/skill/models.toml은 mutable 검증 대상으로 유지한다.
6. 집중 검증과 기존 Codex 회귀를 수행한다.

    python3 -B -m unittest discover -s tests -p test_token_usage.py -v
    python3 -B -m unittest discover -s tests -p test_install.py -v

**수락 기준**

- 이동 대상 전체가 새 위치에 있고 누락·중복 이전 트리가 없다.
- 정책·모델 값·유틸리티 동작이 유지된다.
- fixture·manifest·기존 설치 회귀가 통과한다.
- 설치 결과·backup·rollback·전역 갱신·외부 취득 계약이 유지된다.
- 사용자 설치 경로에 codex/가 추가되지 않는다.

CEO는 이동 diff와 집중 검증 근거를 검토해 수락한다. task 경계만을 이유로 QA를 추가하지 않는다.

**보류 조건:** 사용자 설치 경로나 정책 변경이 필요하거나 기존 복구 검증이 실패하면 다음 task를 시작하지 않는다.

**수락 후 단일 commit 제안:** refactor(codex): 전용 소스를 codex 디렉터리로 이동

## T2. Claude 프로필·adapter·모델 재적용 제공

**목표:** 독립 검증 가능한 Claude payload를 완성한다. 역할 정책·모델 설정·안전한 재적용을 하나의 계약으로 구현한다.

**소유자:** Coder.  
**선행 조건:** T1 수락·commit 완료.

**대상 파일**

- 생성: claude/agents/arc-{scouter,planner,coder,qa,reviewer}.md
- 생성: claude/skill/SKILL.md, claude/skill/models.toml
- 생성: claude/skill/references/{planning,handoff,handoff-prep,commit,verification,git-recovery,visual-companion}.md
- 생성: claude/skill/scripts/{model_config.py,apply-models.py}
- 생성: tests/test_claude_payload.py
- 변경: manifest coverage, payload fixture, README.md, MANIFEST.sha256

Claude payload는 Codex 앱 관리 worktree 참조를 실행 요구로 포함하지 않는다. 지원 범위와 금지는 Claude core·handoff 참조에 명시한다.

**모델·도구 계약**

| 역할 | model / effort | tools |
|---|---|---|
| Scouter | haiku / max | Read, Grep, Glob, WebFetch, WebSearch |
| Planner | sonnet / medium | Read, Grep, Glob |
| Coder | sonnet / low | Read, Grep, Glob, Bash, Write, Edit |
| QA | haiku / high | Read, Grep, Glob, Bash |
| Reviewer | sonnet / medium | Read, Grep, Glob |

설정은 TOML version = 1, 정확히 다섯 roles 테이블, 각 역할의 model·effort를 사용한다. 잘못된 schema·역할 집합·타입·effort label을 거부한다. renderer는 모델 변경 외 profile bytes를 보존한다. 일반 YAML 전체 지원과 외부 parser 의존성을 도입하지 않는다.

재적용은 설치된 Claude skill의 인접 설정·모듈을 사용한다. --config, --agents-dir, --check, --dry-run을 제공하고 전체 사전 검증·staging·부분 실패 복구·mode 보존을 갖춘다. Codex 프로필·설정은 변경하지 않는다.

**진행 단계**

1. 설정·frontmatter·정책·재적용 테스트를 먼저 작성한다. 필수 테스트는 다음을 포함한다.
   - test_exact_roles_models_efforts_and_tools
   - test_rejects_missing_extra_roles_and_invalid_settings
   - test_frontmatter_names_and_required_fields
   - test_renderer_preserves_body_and_non_model_fields
   - test_renderer_rejects_duplicate_or_malformed_frontmatter
   - test_apply_models_check_and_dry_run_do_not_write
   - test_apply_models_updates_only_claude_profiles
   - test_apply_models_failure_restores_all_prior_profiles
   - test_claude_policy_preserves_role_and_approval_contracts
2. payload·모듈 부재로 신규 테스트가 실패하는지 확인한다.

    python3 -B -m unittest discover -s tests -p test_claude_payload.py -v

3. 설정 loader·renderer를 구현한다. 중복·손상 frontmatter를 거부하고 모델 필드 외 bytes를 보존한다.
4. 다섯 native profile과 참조를 작성한다. 각 profile은 승인된 정확한 tools YAML list를 지정하고 Agent·Task를 허용하지 않는다.
5. Claude adapter에 CEO 직접 보고, 최대 네 역할 동시 실행, 역할별 skill 로딩, 승인·소유권, 현재 checkout·명시 승인 branch, worktree 비지원을 반영한다.
6. 재적용의 전체 사전 검증·staging·실패 복구·mode 보존을 구현하고 다른 플랫폼 파일이 바뀌지 않는지 확인한다.
7. manifest와 fixture에 Claude payload를 추가한다. claude/skill/models.toml만 mutable 검증 대상으로 둔다.
8. 신규 검증과 기존 회귀를 수행한다.

    python3 -B -m unittest discover -s tests -p test_claude_payload.py -v
    python3 -B -m unittest discover -s tests -p test_install.py -v

**수락 기준**

- 명세 AC5·AC6·AC7·AC14의 payload 계약이 검증된다.
- 다섯 역할의 name·model·effort·tools가 정확하다.
- 독립 모델 재적용과 부분 실패 복구가 검증된다.
- 필수 참조가 존재하고 미지원 Codex 기능을 요구하지 않는다.
- 새 불변 payload와 mutable 설정이 검증 범위에 포함된다.

**필수 QA:** 사용자 프로필 재적용의 부분 실패 복구, 상대 플랫폼 보존, 역할 권한·승인 adapter를 집중 확인한다. CEO는 테스트·QA 근거와 발견 사항을 검토해 수락한다.

**보류 조건:** 모델·도구 매핑 변경, 새 의존성, worktree 지원이 필요하면 범위 변경으로 보고한다. 부분 갱신 복구가 증명되지 않으면 T3를 시작하지 않는다.

**수락 후 단일 commit 제안:** feat(claude): 역할 프로필과 실행 지침 추가

## T3. 필수 대상 선택과 플랫폼별 설치 거래 통합

**목표:** 단일 CLI에서 대상별 루트·payload·전역 지침·외부 스킬·거래를 선택하고 격리·복구 계약을 완성한다.

**소유자:** Coder.  
**선행 조건:** T1·T2 수락·commit 및 T2 위험 의존성 확인 완료.

**대상 파일**

- 변경: install.py, install.command, tests/test_install.py
- 생성: tests/test_target_install.py
- 변경: README.md, MANIFEST.sha256

**인터페이스 방향**

- 불변 TargetSpec은 target name, payload root, user home, profile file 집합을 보유한다.
- resolve_target은 repository root 아래 codex/ 또는 claude/와 대상 설치 루트를 연결한다.
- target별 profile preflight는 정확한 프로필 집합과 모델 설정을 검사한다. 기존 Codex 동작은 전용 검증 경로를 보존한다.
- 기존 backup·staging·rollback 엔진을 재사용한다.
- source 입력에는 선택한 payload root를, README 안내에는 repository root를 사용한다.
- Codex external candidate·retired profile 처리는 Codex 분기에서만 호출한다.
- Claude 전역 갱신은 관리 마커 renderer를 재사용해 CLAUDE.md만 다룬다.

**진행 단계**

1. CLI·루트·격리·거래 테스트를 먼저 작성한다. 다음은 모두 종료 코드 2이고 manifest·취득·쓰기 미호출이어야 한다.

    ./install.command
    ./install.command --target other
    ./install.command --target codex --target codex
    ./install.command --target=claude --target codex
    ./install.command --target=claude --target=claude

2. 신규 CLI·함수 부재로 실패하는지 확인한다.

    python3 -B -m unittest discover -s tests -p test_target_install.py -v

3. 다음 동작을 집중 검증한다.
   - test_target_errors_precede_manifest_acquisition_and_writes
   - test_help_works_without_target
   - test_install_command_preserves_target_and_other_arguments
   - test_claude_config_dir_default_equivalent_and_rejected_values
   - test_target_ignores_other_platform_environment
   - test_read_only_modes_spawn_nothing_and_change_nothing
   - test_target_install_never_inspects_other_platform_candidates
   - test_claude_global_block_preserves_user_bytes_and_is_idempotent
   - test_skip_global_leaves_claude_global_files_untouched
   - test_claude_acquisition_change_detection_stops_before_replacement
   - test_each_replacement_failure_rolls_back_selected_target
   - test_rollback_failure_retains_recovery_and_reports_absolute_paths

   install.command 테스트는 유일한 공통 진입점에 Codex·Claude 인수를 각각 전달해 backend 인수 보존을 확인한다. 플랫폼별 wrapper는 만들거나 검사하지 않는다.

4. --target 필수·중복 거부를 구현한다. 대상 오류는 manifest 처리보다 먼저 거부하고 --check·--dry-run 상호 배타성을 유지한다.
5. Claude 환경 변수의 홈 표기 확장 후 절대 경로를 요구한다. 문자열 정규화로 기본 경로와 비교하되 symlink를 따라가는 resolve()는 사용하지 않는다.
6. 대상별 preflight·global 계획·외부 스킬 선택을 구현한다. Claude가 Codex cleanup이나 공유 ~/.agents/skills/에 접근하지 않도록 한다.
7. 선택 payload를 기존 거래 엔진에 연결한다. 취득 중 변경 감지, backup·staging 완료 후 교체, 실패 복구를 유지한다.
8. Codex·Claude 각각의 선택 설치에서 교체 단계와 rollback 실패를 주입하고 bytes·mode·미관리 파일·recovery 보존 및 상대 플랫폼 무변경을 확인한다.
9. 읽기 전용 모드는 subprocess·취득·쓰기 함수 호출 시 실패하는 stub과 전후 snapshot으로 검증한다. cache와 빈 디렉터리 생성도 검출한다.
10. help·README·완료 출력을 갱신한다. 단일 진입점, 양쪽 target 예제, 모델 재적용, 경로 제한, 미검증 범위와 복구 안내를 맞춘다.
11. manifest를 갱신하고 task 및 전체 검증을 수행한다.

    python3 -B -m unittest discover -s tests -p test_target_install.py -v
    python3 -B -m unittest discover -s tests -v

**수락 기준**

- T1·T2 누적 근거와 함께 명세 AC1–AC15를 충족한다.
- 가짜 취득 환경에서 두 대상의 설치·재설치가 검증된다.
- target 오류·Claude 경로 오류·읽기 전용 모드에 금지된 부수 효과가 없다.
- Claude global 보존·멱등성·--skip-global이 검증된다.
- 상대 플랫폼 환경 변수·사용자 경로·공유 외부 스킬에 간섭하지 않는다.
- 거래·복구 실패가 기존 안전 계약을 지킨다.
- 플랫폼별 진입점과 이전 Codex source tree가 없다.

**필수 QA:** 두 대상의 backup/rollback, 읽기 전용 모드, 취득 중 변경, 경로 격리를 집중 확인한다. CEO가 실패 주입·기준별 근거·발견 사항을 검토해 수락한다.

**보류 조건:** 상대 플랫폼 접근, 복구 자료 유실, 읽기 전용 옵션의 쓰기·네트워크, target 오류 이전 취득이 관찰되면 수락하지 않는다. 새 provider 조회·모델 실행이 필요하면 승인 범위 변경 전에 보고한다.

**수락 후 단일 commit 제안:** feat(installer): Codex와 Claude 선택 설치 지원

## 최종 전체 검증

T1–T3의 필수 확인과 CEO 수락이 끝난 후 수행한다. 최종 검증만을 이유로 독립 수락 가능한 task의 수락을 미루지 않는다.

1. 최종 상태에서 전체 회귀를 실행한다.

    python3 -B -m unittest discover -s tests -v

2. 격리 홈과 fixture 외부 스킬로 전체 manifest·양쪽 대상 검사·dry-run을 확인한다. 실제 사용자 홈에 직접 설치하지 않는다.
3. Claude CLI가 있으면 로컬 help에서 API·세션 생성 없이 프로필 인식을 확인할 방법을 찾는다. 확인된 비호출 기능이 있을 때만 사용하고 CLI 버전을 기록한다.
4. API 없는 확인 방법이 없거나 CLI가 없으면 런타임 인식은 미검증으로 남긴다. 대표 모델 실행은 요구하지 않는다.
5. 독립 Reviewer가 최종 전체 변경을 한 번 검토한다. 경로 이동·대상 격리·정책·manifest·모델 재적용·거래 복구·미검증 범위를 포함한다.
6. CEO가 AC1–AC15와 Codex source 이동 요구를 근거에 연결해 완료를 판단한다. 발견 사항은 필요한 범위로 보고하고 수락된 task의 commit을 임의로 다시 쓰지 않는다.

## 문서 및 실행 게이트

현재 명세는 사용자의 “진행해”, 계획은 사용자의 “ㅇㅇ”로 승인되었다. 실행 대상은 현재 checkout의 새 작업 브랜치이며 사용자가 feat/claude-code-support 브랜치에서 계속 진행하도록 확인했다.

계획과 필요한 문서 집합은 승인되었다. 계획 문서의 batch commit과 canonical handoff record를 완료한 뒤 다음 Coder task를 시작한다.

각 Coder의 첫 시작·재시작마다 ARC common handoff gate를 적용한다. task 수락은 Coder 보고나 테스트 통과만으로 대체하지 않는다.

## 자기 검토

- 승인 명세의 단일 install.command와 Codex 전체 소스 이동을 반영했다. 플랫폼별 wrapper를 범위에서 제외했다.
- 세 task의 순서·의존성·독립 수락 범위를 유지했다.
- 각 task의 구현·테스트·문서·manifest를 같은 수락·commit 단위에 묶었다.
- 사용자 파일 보호와 위험 의존성 QA를 유지하고 최종 Reviewer는 한 번만 배치했다.
- 모델 실행은 요구하지 않으며 로컬 CLI 인식 확인이 불가능하면 미검증으로 보고한다.
- 계획을 처음 저장하고 자체 검토할 당시에는 구현·테스트 실행·Git 변경·실행 대상 선택을 수행하지 않았다.
