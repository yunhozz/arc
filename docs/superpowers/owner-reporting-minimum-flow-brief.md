# 공통 역할 보고 및 최소 흐름 작업 brief

## 목표와 기준

공통 Planner/Reviewer/Scout의 보고 대상을 호출 owner로 정리하고 위험도와 Native/Fresh-agent checkpoint를 모두 유지하는 최소 검증 흐름을 명시한다. owner별 권한·승인·완료 의무를 이동하지 않는다. Native 전체 리뷰의 조건부 중복 충족과 Fresh-agent의 별도 fresh 최종 리뷰를 명확히 한다.

## 범위와 결정

- 수정 payload: `skill/SKILL.md`, `agents/yunho-team-planner.toml`, `agents/yunho-team-reviewer.toml`, `agents/yunho-team-scout.toml`, `agents/yunho-team-lead.toml`, `MANIFEST.sha256`.
- README, 기타 프로필, dependency, installer, 모델은 제외한다. 사용자 지정 보호 영역은 시작 시점 바이트 그대로 보존한다.
- CEO가 user의 짧은 설계 및 Native 승인을 전달했다. 계획 승인은 아직 없다.
- 정책 문서 명확화이며 실행 코드·테스트 수정은 없다. TOML 파싱, 문서 사례·diff 확인, installer `--check`만 계획한다. 테스트·dependency 설치 금지. TDD 주장은 하지 않는다.
- 하나의 Coder task: 정책 → 프로필 → manifest의 종속 정합성 때문에 비례적 계획이 필요하다. 이후 QA → fresh 전체 Reviewer → Lead acceptance.

## 경로와 근거

- 계획 작성 경로: `/Users/yunho/Desktop/project/yunho-harness`.
- 계획: `/Users/yunho/Desktop/project/yunho-harness/docs/superpowers/plans/2026-10-04-owner-reporting-minimum-flow.md`.
- 설치된 brainstorming/writing-plans/using-git-worktrees를 적용한다. Planner는 read-only 초안을 반환했고 Lead가 한국어로 통합했다.
- 현재 `git-dir`/`git-common-dir`는 `.git`, superproject 출력 없음, branch `master`. native `list_artifacts`는 빈 목록. 일반 checkout이며 현행 workspace 선호·consent는 미확정이다.
- 과거 brief의 in-place 기록은 이번 승인 근거로 사용하지 않는다. 구현 전 using-git-worktrees Step 0의 workspace 동의를 받아야 한다.
- payload 변경 없음. 구조 검증과 테스트는 아직 실행하지 않았다.

## 정확한 다음 단계

CEO가 user의 계획 및 새 managed worktree 승인을 전달했다. Native 유지. native create_worktree가 `master`에서 `/Users/yunho/.codex/worktrees/owner-reporting-flow/yunho-harness`를 생성·등록했다. 해당 경로의 git-dir/common-dir는 서로 다르고 superproject 출력 없음; 시작 상태 clean. `python3 install.py --check` 종료 코드 0, manifest 22개 및 preflight 통과. baseline은 `/private/tmp/owner-reporting-flow-baseline.json`이다. 계획·brief는 원래 경로에 보존하며 자동 복사를 가정하지 않는다. 테스트 및 dependency 설치는 수행하지 않았다.

Coder → QA → fresh 전체 Reviewer 순서로 위 실제 workspace의 여섯 파일만 진행한다. 보호 영역은 baseline의 skill 첫 소개 문단 전체 및 Ownership의 Secretary 항목 전체, Secretary 프로필 전체로 지정한다. 다른 payload와 모델·dependency도 baseline hash로 보존 여부를 확인한다.

## TDD 적용 제약과 일시 정지

Coder는 설치된 `/Users/yunho/.agents/skills/test-driven-development/SKILL.md`를 읽고 편집 전에 정지했다. 해당 skill은 behavior changes에 Always 적용하며 configuration 예외도 human permission을 요구한다. 이 변경은 agent 지침의 행동 계약에 영향을 주므로 문서라는 형식만으로 제외하지 않는다. 승인된 계획은 테스트 실행을 금지하고 TOML·수동 정책 사례·diff·installer 확인만 허용한다. failing-first 테스트 작성/실패 관찰 → 최소 수정 → 해당 테스트 및 suite 통과라는 요구는 현재 제약으로 수행할 수 없다.

여섯 파일에 한정된 행동 지침/configuration 변경의 명시적 TDD 예외(위 구조·수동 검증, QA, fresh 전체 리뷰로 대체) 또는 실제 행동을 검증하는 test-first 계획과 실행 허용이 필요하다. 내부 판단은 인간 승인을 대체하지 않는다. 구조 확인은 실제 agent 준수를 입증하지 않으며 failing-first를 주장할 수 없다. Coder와 Lead는 편집이 없음을 확인했고 worktree는 clean이다. 다음 단계는 CEO가 이 정확한 제약과 대안을 user에게 전달해 결정을 받는 것이다.

## 인간 결정과 재개

CEO가 user의 직접 결정 `여섯 파일 한정 TDD 예외 승인`을 전달했다. 예외는 `skill/SKILL.md`, `agents/yunho-team-planner.toml`, `agents/yunho-team-reviewer.toml`, `agents/yunho-team-scout.toml`, `agents/yunho-team-lead.toml`, `MANIFEST.sha256`의 승인된 두 명확화만 적용한다. TOML 파싱, 정책 사례·보호 영역·diff 확인, `python3 install.py --check`, 독립 QA 및 fresh 전체 Reviewer를 수행한다. failing-first와 테스트 suite 실행은 하지 않으며 TDD를 수행했다고 주장하지 않는다. 구현 범위·보호 영역·향후 작업의 TDD 요구는 확대하거나 변경하지 않는다. 기존 managed worktree에서 Coder를 재개한다.

## 구현 결과와 다음 gate

Coder가 지정 여섯 파일을 완료했다. 공통 보고 경로·최소 검증 흐름·리뷰 중복 조건·Fresh-agent 별도 최종 리뷰를 동기화했다. Lead가 발견한 Planner의 남은 경로 보고 문장은 Coder가 호출 owner로 수정했다. Coder 보고: 네 TOML 파싱, installer `--check` manifest 22개/preflight 종료 코드 0, diff whitespace 통과; 보호 영역 및 나머지 35 baseline 파일 보존. 테스트·설치·커밋은 하지 않았다. Lead의 직접 diff whitespace 확인도 통과했다. 현재 독립 QA가 같은 workspace/범위에서 구조·정책 사례·baseline 보호를 확인 중이며 이후 fresh 전체 Reviewer가 필요하다.

독립 QA 완료: 발견 사항 없음. installer `--check` 종료 코드 0(22개 manifest/preflight), diff check 0, 네 TOML 파싱 및 보호 구간/35개 비대상 해시 비교 0, manifest의 다섯 지정 digest 줄만 변경(순서·나머지 줄 보존), 여섯 위험도·모드 조합 및 owner/개발 권한/중복 조건/fresh 단일 task 사례 통과. QA는 테스트·설치·파일 수정 없이 확인했다. 같은 여섯 파일의 fresh 전체 Reviewer를 배정했고 Native 최종 gate를 검토 중이다. Native 리뷰와 위험도 리뷰 요구는 전체 범위·독립성·freshness·QA 이후 시점·상태 유지 조건이 충족될 경우 이 한 리뷰로 기록한다.

## Acceptance 완료

Fresh independent Reviewer가 QA 이후 지정 여섯 파일 전체 diff를 검토했고 정확성·사실성·보안의 실질적 발견 사항 및 미해결 사항이 없다고 반환했다. 변경 상태와 전체 범위·독립성·freshness·시점 조건을 유지했으므로 이 리뷰가 Native 최종 checkpoint와 해당 위험도 리뷰 요구를 함께 충족한다. Lead의 최종 hash 비교는 정확히 승인 여섯 파일만 변경되고 비대상 35개 파일이 동일함을 확인했다. 최종 `git diff --check` 종료 코드 0, git status도 여섯 파일만 표시한다.

Lead acceptance 완료. 근거 `/private/tmp/owner-reporting-flow-acceptance.json`, baseline `/private/tmp/owner-reporting-flow-baseline.json`, QA/Reviewer의 해당 task 반환 결과. 수정은 managed worktree `/Users/yunho/.codex/worktrees/owner-reporting-flow/yunho-harness`에 남겨 두며 연결 artifact를 보존한다. 계획·brief는 원래 checkout에 있다. 테스트·failing-first·suite·runtime compliance·설치·커밋·merge는 수행하지 않았고 해당 claim을 하지 않는다. 다음 단계는 CEO에게 결과와 경로를 보고하는 것이다.
