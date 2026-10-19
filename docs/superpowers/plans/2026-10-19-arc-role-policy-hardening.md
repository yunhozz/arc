# ARC 역할 정책 통합 및 권한 경계 보강 구현 계획

- 상태: 사용자 승인 완료
- 작성일: 2026-10-19
- 사양: /Users/ma-24-007/.codex/worktrees/role-policy-hardening/arc/docs/superpowers/specs/2026-10-19-arc-role-policy-hardening.md
- 선택된 대상: /Users/ma-24-007/.codex/worktrees/role-policy-hardening/arc
- 준비 기준: detached HEAD 22abc081a373953f4e66db54ae11d435eb9fd732, origin/master
- 계획 저장 대상: /Users/ma-24-007/.codex/worktrees/role-policy-hardening/arc/docs/superpowers/plans/2026-10-19-arc-role-policy-hardening.md
- 승인 증거: 사용자가 2026-10-19 계획 승인 요청에 “승인”으로 답했다. 요청에는 계획에 명시된 focused test 파일 추가·수정과 테스트 명령 실행이 포함됐다.
- 소유권: Planner 계획 초안, Orchestrator 통합·저장·자체 검토·계획 승인 요청, Coder 구현, 매 작업 fresh QA, Orchestrator 수락·커밋, 마지막 전체 Reviewer 검토.

## 목표

여섯 역할군(Orchestrator, Scouter, Planner, Coder, QA, Reviewer)의 권한 계약을 한 정책 원천에서 생성하고 Codex와 Claude에 적용한다. Codex가 지원하는 capability 축소와 prompt-level 계약을 구별하고, Claude에는 전문 역할 범위 Git 변경 감지 hook을 제공한다. 역할군은 여섯 개, 배포 프로필은 기존 다섯 개로 유지한다.

## 작업 공통 경계

- 전문 역할은 stage, commit, push, merge, rebase, reset, branch 생성·전환, worktree 생성·제거를 하지 않는다.
- 승인된 최상위 작업 하나는 수락 후 Orchestrator가 만드는 집중 구현 커밋 하나에 대응한다.
- push·merge·deploy·publish에는 그 행위에 대한 명시적 사용자 권한이 필요하다.
- 계획 없는 유의미·고위험 작업은 Coder → QA → 최종 전체 Reviewer → 수락 순서다.
- 계획 있는 유의미·고위험 작업은 작업별 Coder → fresh QA → 수락·커밋 후, 모든 작업 수락과 필요한 QA가 끝나면 최종 전체 Reviewer가 한 번 검토한다.
- Reviewer는 작업별·커밋별 필수 게이트가 아니다. 최종 계획 Reviewer 발견 사항은 Coder → Reviewer로 재검토하며 QA에 재배정하지 않는다.
- 작은 작업의 기존 계획 생략 경로와 Orchestrator 직접 처리 예외를 바꾸지 않는다.
- Codex 프로필·hook과 Claude hook은 완전한 sandbox가 아니다. 외부 사용자 설정이나 실제 설치 환경은 변경하지 않으며 설치 검증은 격리된 임시 경로에서 한다.
- 계획에 포함한 테스트 파일 추가·수정과 테스트 명령 실행은 사용자가 계획을 승인한 뒤에만 수행한다. 이번 계획 승인은 이러한 focused test 변경·실행까지 명시적으로 승인하는지 확인한다.

## 집중 검토 기준

각 소유 작업에서 다음 사례를 검증한다.

1. 정책 관리 영역의 중복·역순·누락 입력에서 생성이 모든 파일을 부분 변경하지 않고 실패한다.
2. 모델 프리셋·언어 설정·Codex 기능 설정이 공존할 때 정책 렌더링이 다른 소유 필드를 보존한다.
3. 계획 없는 고위험 작업에서 Reviewer가 빠지면 실패한다. 계획 작업에 매 커밋 Reviewer가 추가되어도 실패한다.
4. 공백·따옴표·비ASCII 문자가 있는 설치 경로에서 hook이 현재 디렉터리에 의존하지 않는 검증된 자산을 가리킨다.
5. hook 또는 필수 자산 누락·사용자 파일 충돌을 성공이나 보호 적용으로 보고하지 않으며 사용자 파일을 보존한다.

---

## T1. 공통 정책 원천, 생성기, 양 플랫폼 역할 계약

**목표:** 공통 정책과 결정적 생성기를 만들고 Codex·Claude 역할 문서, 프로필, 전역 지시 및 기존 설치 검증을 같은 원천에 연결한다.

**선행 조건:** 승인된 사양과 본 계획, Orchestrator의 handoff 준비.

**의존성:** 없음. T2는 이 작업에서 확정한 정책 스키마와 생성 인터페이스에 의존한다.

**대상 파일:**

- 신규: lib/policy/role-policy.json, lib/policy/render.mjs, scripts/update-role-policy.mjs
- 신규: tests/node/role-policy.test.mjs
- 수정: codex/skill/SKILL.md, claude/skill/SKILL.md
- 수정: codex/agents/arc-{scouter,planner,coder,qa,reviewer}.toml
- 수정: claude/agents/arc-{scouter,planner,coder,qa,reviewer}.md
- 수정: Codex·Claude의 planning, handoff, handoff-prep, commit, verification 참고 문서
- 수정: lib/installer/global-config.mjs, lib/installer/manifest.mjs
- 수정: lib/models/profiles.mjs
- 수정: package.json, MANIFEST.sha256, README.md
- 수정: tests/test_arc_policy.py, tests/test_claude_payload.py, tests/test_harness_contract.py
- 수정: tests/node/profile-render.test.mjs, global-config.test.mjs, manifest.test.mjs, package.test.mjs

**정책 스키마와 인터페이스 제안:**

- validateRolePolicy(input: unknown): RolePolicy
- renderPolicySection(policy, { platform, audience, section, skillPath }): string
- replaceManagedPolicyBlocks(text, blocks): string
- buildPolicyOutputs(inputs, policy): Map<string, Buffer>

RolePolicy에는 schemaVersion 1, 여섯 역할 정의, 규칙 목록, 플랫폼별 통제 수준을 둔다. 규칙은 고유 ID, 적용 역할, 허용·금지 효과, 대상 작업, 필요한 승인·증거, 플랫폼 통제 수준을 가진다. 일반적인 정책 문구는 원천에 두고 platform template은 문법과 배치만 담당한다.

대표 규칙 ID: git.specialists-deny, git.orchestrator-accept-commit, external.explicit-user-authority, review.significant-no-plan, review.significant-plan, review.final-plan-recheck. Git 조회/변경 분류 데이터는 T2에서 같은 정책 원천에 확장한다.

**절차와 검사:**

1. RED 사례를 먼저 작성하고 실패를 확인한다. 대상: 알려지지 않은 역할, 중복 규칙 ID, 잘못된 통제 수준, 관리 영역의 누락·중복·역순. 생성 실패 뒤 입력 파일 bytes가 그대로인지 확인한다.
2. 여섯 역할군의 권한·금지 규칙과 두 Reviewer 경로를 정책 원천에 작성한다. Coder는 정상 구현 중에도 Git 변경이 금지된다. Orchestrator는 수락 후 작업 커밋을 소유한다.
3. 생성기는 전체 입력을 검증한 뒤 모든 출력 bytes를 계산한다. 검증 성공 뒤에만 CLI가 파일을 갱신한다. --check는 읽기 전용으로 차이를 보고하고 불일치 시 실패한다.
4. Codex와 Claude의 skill, 다섯 전문 프로필, 관련 참고 문서, 전역 지시 블록에 명명된 관리 영역을 둔다. 충돌 권한 문구를 정리하되 관리 영역 밖의 상세 절차는 보존한다.
5. Codex 읽기 전용 역할의 shell 기능 축소는 필요한 정적 읽기 기능이 유지되는 범위에서만 적용한다. Coder·QA의 shell을 보존하고 문서화되지 않은 profile key는 추가하지 않는다.
6. 전역 지시 생성은 기존 언어·skill 경로 동작을 보존하고 사용자 관리 블록 밖의 텍스트를 변경하지 않는다.
7. 모델 프로필 렌더링은 모델 필드만 바꾸고 정책 관리 영역 및 Codex 기능 설정을 보존한다. Claude 기존 tool allowlist와 다섯 프로필 수를 보존한다.
8. 계획 없는 Reviewer 경로가 삭제되거나 계획 작업마다 Reviewer가 필수화되거나 최종 계획 발견 사항에 QA 재배정이 삽입되는 회귀 사례를 추가한다.
9. package.json에 update:role-policy 및 check:role-policy 명령을 추가한다. 필수 정책 자산을 package payload와 manifest 검증에 포함하고 manifest를 생성한다.
10. README는 여섯 역할군과 다섯 전문 프로필, 역할 위임 한계, Codex의 보장 한계, 새 에이전트에서 정책이 적용되는 방식을 설명한다. T2 전에는 Claude Git hook이 준비됐다고 설명하지 않는다.

**focused test 명령:**

- node scripts/update-role-policy.mjs --check
- node --test tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/global-config.test.mjs tests/node/manifest.test.mjs tests/node/package.test.mjs
- python3 -m unittest discover -s tests -p 'test_arc_policy.py'
- python3 -m unittest discover -s tests -p 'test_claude_payload.py'
- python3 -m unittest discover -s tests -p 'test_harness_contract.py'
- npm run check:manifest

**수락 기준:**

- 정책 원천이 여섯 역할의 권한을 정의하고 결정적으로 양 플랫폼 산출물을 생성한다.
- 전문 역할은 작업 중 Git 상태를 변경하지 않으며 전달·재위임으로 제한을 우회할 수 없다.
- 계획 유무에 따른 두 Reviewer 경로와 최종 계획 발견 사항 예외가 모두 유지된다.
- 모델·언어 설정, 관리 블록 바깥 사용자 텍스트, 다섯 전문 프로필을 보존한다.
- 생성 오류 때 파일 부분 변경이 없다. --check는 쓰기 없이 stale output을 감지한다.
- T1 산출물만으로 installer·프로필 처리·manifest 검증이 정상이다.

**QA 증거와 hold 조건:** fresh QA가 명령 결과, 생성 전후 diff, 잘못된 입력 시 무변경, 모델 렌더링 보존, 두 Reviewer 경로 사례를 확인한다. 설치된 플랫폼 네이티브 실행이 아닌 구조 검사 결과는 구조 증거로만 보고한다. Codex 읽기 기능 저하, 문서화되지 않은 설정 키, 권한 문구 충돌, 모델 설정 변경, 검사 실패, 소유권 또는 HEAD 불일치는 보류 조건이다.

**수락·커밋:** Orchestrator가 기준과 증거를 확인해 수락한 뒤 이 작업만 커밋한다. 권장 메시지: feat: generate shared role policy for both platforms.

---

## T2. Claude 역할별 Git guard와 설치 수명주기

**목표:** 공통 정책을 이용하는 Claude 전문 역할 PreToolUse guard를 제공하고 package, installer, update, uninstall, 오류 경로를 통합한다.

**선행 조건:** T1이 fresh QA를 거쳐 수락·커밋됨.

**의존성:** T1의 RolePolicy, 생성 관리 영역, 모델 필드 보존 계약.

**대상 파일:**

- 신규: claude/skill/hooks/role-git-guard.mjs, claude/skill/hooks/git-policy.json
- 신규: lib/policy/claude-hook.mjs, tests/node/role-git-guard.test.mjs
- 수정: lib/policy/role-policy.json, lib/policy/render.mjs
- 수정: claude/agents/arc-{scouter,planner,coder,qa,reviewer}.md
- 수정: lib/models/profiles.mjs
- 수정: lib/installer/plan.mjs, lib/installer/manifest.mjs
- 수정: README.md, MANIFEST.sha256
- 수정: 필요한 tests/node/role-policy, profile-render, plan, install, uninstall, manifest, package, all-targets 테스트
- 수정: 실제 자산 변경이 필요한 경우 tests/test_claude_payload.py 및 tests/installer-parity.json

Hook 실행 자산은 설치된 managed skill 트리의 검증된 JSON만 읽고 개발용 저장소 경로를 import하지 않는다. 설치 대상 프로필은 기존 다섯 개를 유지한다.

**절차와 검사:**

1. RED 사례를 추가하고 node --test tests/node/role-git-guard.test.mjs 실행 결과가 새 동작 미구현으로 실패하는지 확인한다.
2. 공통 정책에서 Git 조회 allowlist와 변경 금지 분류를 만들고 git-policy.json을 생성한다. hook 자체에 별도 권한 목록을 중복하지 않는다.
3. classifyGitCommand(command, policy)와 evaluateHookEvent(event, policy)를 구현한다. 직접 호출, git -C, --git-dir, 경로 지정 실행 파일, 일반적인 sh -c/bash -c, &&, ||, ;, pipeline 명령을 분류한다. 명령을 연결한 경우 금지 명령이 한 부분이라도 있으면 전체를 거부한다.
4. 조회 subcommand에서 변경 옵션을 구분한다. 예를 들면 branch 조회와 생성·삭제, config 조회와 설정 변경을 다룬다. 검사하지 않은 Git subcommand·옵션이나 구문을 안전하다고 허용하지 않고 거부한다.
5. Claude stdin 이벤트와 문서화된 PreToolUse 응답을 처리한다. 누락·잘못된 JSON, shell command 누락, policy read failure를 거부하고 안전한 진단을 반환한다. Agent hook 연결로 역할 범위를 정하며 선택적인 agent_type 값만으로 권한을 확대하지 않는다.
6. alias, 변수 확장, 동적 코드, 다른 프로그램 안의 Git 호출을 전부 분석한다고 주장하지 않는다. 지원 범위와 남은 간접 실행 한계를 문서화한다.
7. Claude frontmatter parser는 생성기가 소유하는 hooks 구조만 최소한으로 검증·보존한다. 임의 YAML 기능을 새로 지원하지 않는다. 모델·effort 렌더링 이후 hook과 tool allowlist가 유지되는지 확인한다.
8. 검증된 절대 script 경로를 file URL로 표현하고 고정 Node bootstrap을 base64 인코딩해 shell에 전달한다. 동적 실행문이나 사용자 제공 코드를 실행하지 않는다. 경로 공백·따옴표·비ASCII 문자를 포함한 명령이 macOS/Linux/Windows 대상에서 올바르게 해석되는지 확인하고 Node가 hook PATH에 필요함을 설명한다.
9. 설치 계획은 최종 설치 skill 경로에 hook을 연결하고 package staging 경로나 현재 directory를 참조하지 않는다. hook과 policy JSON을 required payload 자산으로 검증하고 누락·변조를 설치 적용 전에 실패시킨다.
10. 격리된 임시 설치 대상에서 조회·필요 검사 명령을 허용하고 변경 명령을 거부한다. hook을 실행한 current directory를 바꾸어도 동작이 같아야 한다.
11. update·uninstall 경로가 기존 managed skill 소유권 계약대로 hook을 관리하는지 확인한다. 사용자 파일 충돌·손상된 profile·누락 자산은 성공으로 보고하지 않고 기존 파일을 보존한다.
12. README에 새 Agent 적용, Node PATH 의존, hook 오류, Codex 대비 Claude의 추가 보조 통제와 한계를 설명한다.

**focused test 명령:**

- node scripts/update-role-policy.mjs --check
- node --test tests/node/role-git-guard.test.mjs tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/uninstall.test.mjs tests/node/manifest.test.mjs tests/node/package.test.mjs tests/node/all-targets.test.mjs
- python3 -m unittest discover -s tests -p 'test_claude_payload.py'
- npm run check:manifest

Git 변경 구문을 분류하는 검사는 문자열만 입력으로 받아야 하며 실제 Git 변경 명령을 실행하지 않는다. Hook subprocess 검사는 격리된 fixture를 사용한다.

**수락 기준:**

- hook이 필요한 Claude 전문 프로필에 연결되고 Orchestrator의 정상 Git 커밋을 전역 차단하지 않는다.
- 대표 Git 변경 패턴을 거부하고 허용된 조회·필요 검사 실행을 허용한다. 판정할 수 없는 명령은 거부한다.
- 명령 분류 테스트가 Git 변경을 실제 수행하지 않는다.
- Hook이 검증된 설치 자산과 절대 경로를 사용하고 current directory나 모델 재렌더링으로 연결이 손실되지 않는다.
- 누락·변조된 자산이나 사용자 충돌을 성공 또는 완전한 보호로 보고하지 않는다.
- 업데이트·제거가 기존 소유권·파일 보존 계약을 지킨다.
- Codex에 존재하지 않는 역할별 hook 강제를 주장하지 않는다.

**QA 증거와 hold 조건:** fresh QA가 대표 입력→예상 판정→관찰 판정 표, stdin/stdout 이벤트 결과, 격리된 파일 자산, 경로 문자와 current directory 변화, update/uninstall 파일 보존을 확인한다. 모의 hook 입력 결과와 실제 Claude 네이티브 실행은 분리해 보고한다. 생성 frontmatter 비호환, 명령 해석 실패, 정상 검사 차단, package 밖 자산, 사용자 파일 변경, 검사 실패는 보류 조건이다. 새 parser dependency, runner 또는 broker가 필요하면 범위 변경으로 중단하고 Orchestrator에 반환한다.

**수락·커밋:** Orchestrator가 기준과 증거를 확인해 수락한 뒤 이 작업만 커밋한다. 권장 메시지: feat: guard specialist git mutations in Claude.

---

## 최종 전체 QA와 Reviewer

이 단계는 T1·T2의 독립 수락·커밋을 막는 작업별 Reviewer 게이트가 아니다. 두 작업의 수락·커밋과 필요한 QA 뒤에 수행한다.

1. Orchestrator는 승인된 사양과 T1·T2 증거를 매핑하고 유효한 검사를 이유 없이 반복하지 않는다.
2. fresh final QA는 결합 변경으로 영향을 받은 전체 기존 Node 검사, 정책 검사 및 다음 검사를 수행한다.
   - npm test
   - python3 -m unittest discover -s tests -p 'test_arc_policy.py'
   - python3 -m unittest discover -s tests -p 'test_claude_payload.py'
   - python3 -m unittest discover -s tests -p 'test_harness_contract.py'
   - node scripts/update-role-policy.mjs --check
   - npm run check:manifest
3. 미실행 항목은 환경·플랫폼 원인과 영향으로 기록하며 통과로 부르지 않는다. 필수 수락 기준이 미검증이면 전체 완료를 보류한다.
4. 독립 Reviewer는 기준 HEAD부터 최종 HEAD까지 최종 전체 변경을 한 번 검토한다. 권한 우회, 두 Reviewer 경로, 모델 렌더러·installer 경계, shell 입력, 자산 무결성·보존, 과장된 보호 문구를 중점 확인한다.
5. 최종 Reviewer 발견 사항은 Coder → Reviewer로 재검토한다. QA에 재배정하지 않는다. 이전 QA evidence를 수정 후 실행 검증으로 표현하지 않는다.
6. Orchestrator가 발견 사항 해결, 증거·한계, 최종 HEAD와 남은 변경을 확인하고 전체 완료를 결정한다.

## 승인 및 실행 시작 조건

2026-10-19 사용자가 본 계획을 승인했다. 승인 요청에는 계획에 명시한 focused test 파일 추가·수정과 테스트 명령 실행이 포함됐다. T1·T2 구현과 해당 테스트 작업이 승인 범위다. push·merge·deploy·publish는 승인 범위에 포함되지 않는다.

Coder handoff 전 Orchestrator는 canonical handoff record에 task dependency/readiness map, 승인 문서 집합, 실행 대상·Git 상태, branch 생성·문서 커밋 결과를 기록하고 재검증한다. Coder는 승인된 task 파일을 구현하며 Git 변경을 하지 않는다. 각 작업 후 fresh QA와 Orchestrator 수락·집중 commit을 진행하고, 계획 작업의 Reviewer는 모든 작업 수락 후 최종 전체 변경을 검토한다.

## 자체 검토

- T1은 단일 정책 원천, 생성기, 양 플랫폼 역할 계약, 모델 보존 및 installer 필수 자산 검증을 묶는다.
- T2는 Claude command guard와 profile parser·설치·update·uninstall·package 자산을 함께 묶는다.
- 두 Reviewer 경로와 계획의 최종 Reviewer finding correction exception을 유지한다.
- 각 작업에 목표, 선행 조건, 파일, 집중 검사, 수락 기준, fresh QA 증거, hold condition 및 Orchestrator commit 단위를 정의했다.
- 테스트 코드 수정과 명령 실행은 사용자 승인 전 착수하지 않도록 명시했다.
- 네이티브 플랫폼 실행과 모의 검사 결과를 분리한다.
- Coder는 테스트를 포함해 배정 파일만 수정하고 Git 변경을 하지 않는다.
- Planner는 이 계획 초안을 반환했으며 파일 저장·구현·검사는 하지 않았다.
