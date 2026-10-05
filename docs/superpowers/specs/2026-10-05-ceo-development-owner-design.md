# CEO 단일 개발 소유자 및 직속 역할 구조 설계

## 목적과 승인된 결정

CEO를 개발의 유일한 소유자로 지정하고 별도 yunho_team_lead 역할을 폐기한다. CEO는 현재 chat model을 사용하며 전용 CEO agent 프로필이나 모델 항목을 추가하지 않는다.

CEO는 depth 1이며 아래 여섯 역할은 모두 CEO 직속 depth 2다.

- yunho_team_secretary
- yunho_team_planner
- yunho_team_scout
- yunho_team_coder
- yunho_team_qa
- yunho_team_reviewer

전체 트리에서 동시에 활성화할 수 있는 subagent는 최대 4개다. depth 2 역할은 agent를 만들거나 다른 역할에 직접 일을 위임하지 않는다.

CEO는 개발 조율, 승인, 통합, 수락, 완료를 담당한다. 실제 구현·설정·test-code 파일 수정은 기존처럼 Coder가 수행한다. Secretary의 자료 중심 조사·분석과 독립 문서 작성 범위를 보존한다.

기존 설치의 정확한 agents/yunho-team-lead.toml 대상은 설치 transaction 안에서 백업 후 퇴역시키며, 실패하면 원래 상태로 복원한다. 정확한 legacy version 3 모델 설정에서 알려진 yunho_team_lead 항목만 정규화 결과에서 제외하고 나머지 여섯 역할의 model과 effort 선택은 보존한다.

## 범위와 제외 사항

변경 범위는 Harness 정책, agent 프로필, 모델 설정 계약, 설치 및 모델 적용 동작, 관련 검증, README와 manifest다. 이 문서는 역할·보고 경로, 여섯 역할의 모델 매핑, legacy 설정 입력, 이전 설치에서의 Lead 프로필 퇴역, 그리고 승인·검증 gate를 한 계약으로 정의한다.

외부 skill 취득 방식, model ID와 reasoning-effort 값, 설치 대상 선택 규칙, runtime concurrent-thread 설정은 목적에 필요한 경우 외에는 변경하지 않는다. Lead 언급이 승인된 역사 기록에만 남는 것은 활성 Lead 역할로 간주하지 않는다.

## 역할 및 보고 계약

### CEO

간단하고 독립적인 질문은 CEO가 직접 답한다. CEO는 개발, 설정, tests, 구현 의존 문서, 구현을 포함한 혼합 작업의 유일한 소유자다. 개발 소유권은 CEO가 직접 파일을 편집한다는 뜻이 아니다. 할당된 구현·설정·test-code 파일은 Coder가 편집한다.

CEO는 목표·criteria·scope·제약을 brief에 유지하고, 설계 경로와 계획 깊이를 결정하며, Planner·Scout·Coder·QA·Reviewer에게 필요한 bounded task를 직접 할당한다. CEO는 사용자 질문·답변·수정 요청·승인, spec·plan 통합 및 self-review, workspace와 절대 경로, Coder 파일 소유권 및 종속 순서, 위험별 QA·Reviewer 요구, findings의 해결·disposition을 관리한다. 개발 작업의 acceptance와 completion을 결정하며 승인된 경우 범위가 일치하는 focused commit을 선택할 수 있다.

### Secretary

Secretary는 CEO에게 직접 보고하는 자료 조사·분석 및 독립 문서 작성 역할이다. 범위는 사용자 제공 또는 수집한 문서·데이터·reference sources·static logs/reports를 중심으로 한 조사·분석(기술 자료 포함), 공개적으로 문서화된 운영 방법 조사, 자료 파일 읽기, 문서 artifact 작성·편집 및 해당 자료·문서 작업의 확인이다.

현재 disk, cache, system, filesystem, environment, app, process 상태를 새로 취득하거나 검사하는 일과 operational cleanup은 기존 경계대로 Secretary 범위 밖이다. 이 경계가 해당 작업의 소유자를 자동 지정하지 않는다.

구현·설정·test-code를 포함한 혼합 요청을 받으면 그 범위와 findings를 CEO에게 반환한다. Secretary는 구현·설정·test-code를 수정하지 않고, Planner·Scout·Coder·QA·Reviewer에게 직접 위임하지 않는다. 전문 역할 지원이 필요하면 CEO에게 구체적인 질문, 자료 경로, 예상 결과를 전달한다. CEO가 specialist를 호출하고 결과를 Secretary에게 전달한다.

### Planner, Scout, Coder, QA, Reviewer

모든 specialist는 CEO에게 직접 보고하며 agent를 생성하거나 호출하지 않는다.

- Planner: read-only 설계·spec·plan draft, criteria, assumptions, questions 및 self-review findings를 CEO에게 반환한다. artifact를 저장·구현하거나 승인을 요청하지 않는다.
- Scout: 할당된 탐색 질문에 대해 근거, 미해결 지점, 영향, 다음 행동 및 workspace/path 문제를 CEO에게 반환한다.
- Coder: CEO가 공급한 승인 artifact, brief, 파일 소유권과 동일 workspace를 사용해 할당 파일을 수정한다. scope나 workspace를 변경하지 않고 미해결 결정을 CEO에게 반환한다.
- QA: 할당된 행동 확인 또는 승인된 구조·일관성 검사를 독립적으로 수행한다. source, tests, documents, configuration을 편집하지 않는다.
- Reviewer: 할당된 diff/source를 correctness, factual accuracy, security 관점에서 read-only로 검토한다. QA 실행, 계획, 구현 수정, completion 결정은 하지 않는다.

공유 질문·결정·승인·visual companion 요청·workspace 문제는 CEO로 모인다. Secretary 작업을 위해 specialist를 호출한 경우도 specialist의 부모와 결과 수신자는 CEO다.

## 라우팅과 동시성

대상의 deliverable에 따라 라우팅한다. 실질적인 자료 조사·분석 및 독립 문서 작성은 Secretary의 범위다. 구현, 설정, test-code, 구현 의존 문서와 구현이 섞인 작업은 CEO 소유다. 동사만으로 라우팅하지 않는다.

활성 subagent의 전체 상한은 4개이며 Secretary를 포함한다. 별도의 예약 slot을 두지 않는다. 모든 agent는 depth 2에서 끝나며 depth 3을 만들지 않는다. 종속 handoff는 순차 진행하고, 독립 작업만 병렬화하며, 편집 scope를 겹치지 않게 할당한다. 불필요하게 모든 specialist를 호출하지 않고 scope·state·independence·freshness·흐름상 위치가 유효한 확인 결과를 재사용한다.

설명적인 lowercase snake_case task name 규칙과 runtime capacity와 Harness limit을 분리하는 정책은 유지한다. 이미 실행 중인 agent의 부모 관계나 지침이 자동 변경된다고 주장하지 않는다. 새 지침은 새 세션 또는 새 profile load 이후 적용된다.

## 개발 소유자의 필수 gate

기존 Lead에게 있던 개발 owner 책임은 CEO에게 이동한다. 다음 gate와 사용자 승인 요구는 줄이지 않는다.

### 설계와 계획

Feature, design, behavior 변경 전 CEO가 Planner에게 설치된 brainstorming skill을 배정한다. Planner는 context, spike/bounded/architectural 경로, 선택지와 trade-off, acceptance criteria, assumptions, focused questions를 반환한다. CEO가 통합하고 필요한 질문·수정·승인을 사용자에게 전달한다.

Architectural 작업은 승인된 design, Planner의 complete Korean spec draft, CEO의 통합·저장·self-review, written-spec 승인, 설치된 writing-plans를 통한 complete plan draft, CEO의 통합·저장·self-review, plan 승인 순으로 진행한다. Architectural 작업은 범위와 위험에 관계없이 written plan을 요구한다. Bounded 작업의 계획 생략은 단일 국소 변경이며 종속 단계·공유 상태·lifecycle·통합 순서가 없고 하나의 집중 검증 경로를 갖춘 경우에만 허용한다.

한국어 요청의 spec·plan 제목과 설명은 한국어로 쓴다. identifiers, skill/API names, code, paths, commands, literal values는 보존한다.

### TDD 및 workspace

Feature·bug-fix·behavior 변경 전 Coder가 설치된 test-driven-development skill을 적용한다. bounded·no-plan·저위험 분류도 TDD를 면제하지 않는다. 필수 단계를 막는 불가피한 제약이 있으면 Coder는 수정 전에 정확한 제약과 근거, 필수 TDD 단계, 대안, 불확실성 및 필요한 결정을 CEO에게 보고한다. CEO는 필요한 사용자 결정과 한계를 기록한다. 내부 결정이 필수 human approval을 대체하지 않는다.

비행동 configuration/documentation 변경은 TDD 예외로 별도 취급할 수 있지만 승인 범위와 구조 확인 근거를 기록한다. 그 예외를 behavior 작업에 확대하지 않는다.

구현 전에 CEO는 설치된 using-git-worktrees 규칙에 따라 isolation 및 submodule 상태를 확인하고, 선언된 workspace 선호를 따르며, 필요한 consent를 얻고, native worktree 기능을 우선한다. 불가하면 문서화된 fallback 및 sandbox-denial 절차를 따른다. brief에 실제 workspace의 절대 경로, isolation·preference·consent·setup evidence를 기록한다. 모든 역할은 같은 경로만 사용하고 임의로 workspace를 만들거나 바꾸지 않는다.

### 위험별 확인과 완료

기존 위험별 최소 흐름을 CEO 책임으로 유지한다.

| 위험 | 최소 흐름 |
|---|---|
| 작은 저위험 | Coder → CEO 집중 확인 → acceptance |
| 일반 behavior 변경 | Coder → 독립 QA → acceptance |
| significant/high risk | Coder → QA → 최종 관련 상태 전체 diff 독립 Reviewer → acceptance |

역할·보고 계약과 install transaction을 바꾸는 이 작업은 shared role contract와 lifecycle/integration risk가 있어 significant/high risk다. QA 후 관련 수정이 있으면 영향을 받는 검증을 다시 수행한다. 최종 Reviewer는 QA 이후 최종 관련 상태의 전체 변경을 검토한다. 필수 기준이나 필요한 근거에 미해결 내용이 남으면 수락·완료·commit을 진행하지 않는다.

기존 commit 권한과 <type>(<scope>): <description> 형식의 간결한 한국어 Conventional Commit 규칙을 보존한다. Push, merge, publication, deployment, installation은 별도 권한을 따른다.

### 실행 adapter와 visual companion

superpowers:executing-plans와 superpowers:subagent-driven-development 요청은 CEO의 순차 조율과 위험별 확인에 대응한다. executor 이름이나 called skill은 agent·권한을 추가하지 않는다. 별도 execution-method 선택 질문을 대체하는 adapter 규칙도 유지하되 plan approval 및 다른 gate를 유지한다.

Planner는 시각 질문, 시각화가 돕는 이유, 선택지, 완전한 content draft 및 결정 지점을 CEO에게 반환할 수 있다. 화면 작성, 서버 시작, browser 조작은 하지 않는다. CEO가 필요성 판단과 적시 offer, 사용자 답변, guide·server/browser·session·feedback·cleanup을 담당한다. UI 주제라는 이유만으로 모든 질문을 시각화하지 않는다.

## 모델 및 프로필 계약

### 표준 설정

Version 3을 유지한다. 표준 roles 집합은 다음 여섯 역할과 정확히 일치해야 한다.

yunho_team_secretary, yunho_team_planner, yunho_team_scout, yunho_team_coder, yunho_team_qa, yunho_team_reviewer

각 역할은 기존처럼 nonempty model과 model_reasoning_effort 문자열을 갖는다. 여섯 specialist 각각의 현재 model ID와 effort 값은 바꾸지 않는다. CEO용 model/profile을 만들지 않고 Lead 모델 값을 CEO로 옮기지 않는다. 모델 ID, effort, server support, account access, current availability 검증은 현재 범위를 유지한다.

skill/scripts/model_config.py의 ROLE_FILES, install.py의 PROFILE_FILES, package의 agents/ 템플릿 및 skill/models.toml은 동일한 여섯 역할 집합과 일치해야 한다. source의 agents/yunho-team-lead.toml 및 role mapping은 제거한다.

### 제한된 legacy 모델 입력

읽기 전용 loader는 표준 여섯 역할에 더해 알려진 yunho_team_lead 하나만 포함한 기존 version 3 입력을 호환 처리한다.

- 여섯 역할의 유효한 model과 model_reasoning_effort 값은 그대로 반환한다.
- 알려진 Lead 항목은 effective settings에서 제외하고, 그 사실을 간결하게 알린다.
- Lead 항목도 기존 필드 형식 검증을 통과해야 한다.
- 알 수 없는 추가 역할, 필수 role 누락, invalid version/structure/fields는 오류다.
- 이 호환은 입력 파일을 자동 편집하거나 임의의 추가 role을 무시하는 기능이 아니다.

apply-models.py는 effective six-role settings만 이용해 현재 여섯 profile을 검증·적용한다. --check와 --dry-run은 파일을 바꾸지 않는다. 이 도구는 retired Lead profile을 제거하지 않는다. profile 퇴역은 installer가 담당한다.

일반 install은 package의 표준 skill/models.toml로 여섯 profile을 렌더링한다. 설치된 이전 Harness tree는 기존과 같이 backup되어 새 payload로 교체된다. 이 변경은 기존 installed 모델 값을 payload 위로 자동 merge하는 새 정책을 추가하지 않는다. 이전 설정은 이미 정의된 Harness backup 안에 남는다. package의 models.toml은 편집 가능하므로 이를 편집해도 manifest 갱신은 필요하지 않다.

## 설치 대상과 Lead 프로필 퇴역

### 검증과 범위

신규 활성 프로필 target은 여섯 개다. 유일한 retired-profile 대상은 현재 선택된 Codex home 아래의 정확한 다음 path다.

<selected CODEX_HOME>/agents/yunho-team-lead.toml

다른 홈·경로의 lead 파일을 검색·삭제하지 않는다. 퇴역 target과 상위 경로를 기존 안전 검사에 포함한다. target이 없으면 no-op이다. 경로 구성 요소나 target이 symlink, directory 또는 special file이면 target mutation 전 오류 처리한다.

--check는 설치 payload·models·profiles·경로를 읽기 전용으로 검사한다. --dry-run은 여섯 profile의 반영과 존재하는 retired profile의 backup/removal 계획을 출력한다. 어느 모드도 파일, model 설정, stage, backup, directory, 외부 skill을 새로 만들거나 변경하지 않는다.

### 백업, 적용, rollback

존재하는 retired Lead 일반 파일을 기존 backup tree의 agents/yunho-team-lead.toml 경로에 보존한다. 백업을 만들거나 검증하지 못하면 어떤 live target도 변경하지 않는다. 성공한 설치 뒤에도 백업은 유지한다.

Lead retirement를 Harness skill, 외부 skill, 여섯 active profile과 동일한 transaction/journal/rollback 범위에 포함한다. 성공 시 live retired path가 없다. Retirement 이후 다른 action이 실패하면 기존 Lead file을 정확히 복원한다. Retirement action 자체가 실패하면 앞서 바뀐 target도 rollback한다. 기존 Lead가 없었으면 rollback 후에도 없다. Rollback이 실패하면 복구 데이터와 backup을 보존하고 실패 대상·복구 경로를 출력한다. 이런 실패를 성공 설치로 보고하지 않는다.

구현 순서는 자유롭게 선택할 수 있으나, preflight와 backup이 끝나기 전에 live target 변경이 없어야 하고 위 결과를 test로 검증한다.

## 파일별 책임

- skill/SKILL.md: CEO 소유권·보고 구조·Secretary scope·4-subagent cap·approval/TDD/risk/workspace/commit/adapter/visual 계약
- agents/yunho-team-lead.toml: 제거
- agents/yunho-team-secretary.toml: Secretary의 기존 scope 및 경계를 보존하고 CEO 직속·no-delegation 흐름 반영
- agents/yunho-team-planner.toml, -scout.toml, -coder.toml, -qa.toml, -reviewer.toml: CEO 직접 보고 및 역할별 read/write/approval 경계 반영
- skill/models.toml: version 3의 표준 여섯 역할, 기존 여섯 선택 유지
- skill/scripts/model_config.py: 여섯 역할 매핑 및 제한된 legacy 7-role reader 정규화
- skill/scripts/apply-models.py: six-role 적용·검사·출력 및 non-mutating compatibility handling
- install.py: 여섯 활성 프로필, retired target 검증·backup·transaction·rollback·read-only mode
- tests/test_install.py: loader, apply-models.py, installer 신규·갱신·rollback·dry-run/check 계약 검증
- README.md: 여섯 역할, 보고 흐름, migration·rollback·dry-run, 모델 설정, 세션 reload 안내
- MANIFEST.sha256: 최종 packaged files와 제거된 Lead source 반영

config.toml의 runtime concurrent thread 수는 Harness의 4-subagent cap과 다른 설정이므로 변경하지 않는다. 계획·brief·historical docs에서 당시 Lead 역할을 기록한 것은 활성 profile에서의 Lead 지원을 의미하지 않는다. 구현 중 발견하는 현재 활성 계약은 위 책임 파일과 함께 정렬한다.

## Acceptance criteria 및 검증 증거

### 역할 정책

1. 활성 개발 owner와 개발 승인·통합·완료 책임은 CEO 하나다. 별도 yunho_team_lead owner/호출 경로가 없다.
2. Secretary와 다섯 development specialist는 CEO의 direct report이며 depth 3 경로가 금지된다.
3. Secretary의 material-based 조사·분석, standalone document scope, live operational boundary가 유지된다.
4. Secretary가 specialist 지원을 필요로 하면 CEO에 요청하고 specialist 결과도 CEO 경유로 받는다.
5. 전체 동시 subagent cap은 4이며 Secretary를 포함한다.
6. 설계/spec/plan approval, TDD, workspace, 위험별 QA/Reviewer, completion/commit 및 adapter gate가 유지된다.

### 모델 및 package

7. Standard version 3 설정은 정확히 여섯 역할을 갖고 source profile 및 model mapping도 정확히 여섯이다.
8. 여섯 model/effort 값은 그대로이며 CEO profile/model은 추가되지 않는다.
9. 정확히 알려진 Lead 하나만 가진 기존 seven-role version 3 입력은 다른 여섯 값을 보존하고 Lead를 effective result에서 제외한다.
10. Unknown extra role, missing role, malformed Lead/specialist fields, invalid versions remain errors.
11. apply-models.py는 여섯 profile만 렌더링/확인하고 legacy source config를 수정하지 않는다.

### Installer

12. Fresh install은 Harness skill과 정확히 여섯 active profiles를 설치하고 Lead profile을 만들지 않는다.
13. Upgrade는 기존 Lead file을 transaction backup에 보존하고 선택된 Codex home의 정확한 retired path에서 제거한다.
14. Retired profile이 없는 upgrade는 정상 진행하고 불필요한 profile을 생성하지 않는다.
15. Preflight/backup/action failure와 retirement 이후 rollback 시 pre-install tree가 spec대로 복원된다.
16. Retired target의 symlink/directory/special-file 조건은 target mutation 전 거부된다.
17. --check/--dry-run과 apply-models.py 비변경 모드는 관련 target 및 model settings bytes를 바꾸지 않는다.
18. 관련 없는 프로필이나 선택된 home 밖의 경로는 변경하지 않는다.
19. MANIFEST.sha256은 최종 packaged files와 일치하고 제거한 Lead template를 요구하지 않는다.

구조 검사는 정책·package/installer 계약의 일관성을 증명한다. 실제 runtime의 agent parent 관계를 실행해 검증했다고 표현하지 않는다. 이 역할 계약·transaction의 shared-state 및 lifecycle 위험 때문에 Coder 뒤 QA를 실행하고, QA가 끝난 최종 상태에서 Reviewer가 전체 변경을 독립 검토한다. Findings와 acceptance evidence를 모두 해결 또는 명시적으로 disposition한 뒤에만 CEO가 완료를 선언한다.

## 호환성과 한계

기존 Lead profile을 직접 호출하는 사용 방식은 폐기한다. 기존 설치의 target은 backup된 뒤 새 설치 결과에서 삭제된다. 사용자 수정 파일은 backup에 보존한다.

현재 실행 중인 agent는 기존 instructions와 parent 관계를 계속 가질 수 있으므로 자동 전환되었다고 주장하지 않는다. 새 session/profile load가 적용 경계다.

기존 version 1·2 모델 포맷을 새로 지원하지 않는다. Legacy 호환은 정확히 여섯 known role과 알려진 Lead 하나를 가진 기존 version 3 설정에만 한정한다.

## 소유자 self-review

- 승인된 CEO ownership, Coder file editing, six direct reports, no nested delegation, maximum four subagents를 정확히 반영했다.
- Secretary의 자료·문서 scope와 제외된 live operational work를 보존했고, specialist 요청은 CEO 경유로 정의해 depth 2와 양립한다.
- Lead source role/profile 제거와 기존 installed profile의 backup·rollback 제거를 구분해 정의했다. 관련 없는 home/path 삭제는 허용하지 않는다.
- Legacy model 입력은 알려진 Lead 하나만 제거해 effective result를 만들고 다른 여섯 값을 보존한다. 파일을 자동 수정하거나 임의의 extra role을 무시하지 않는다.
- Existing installer의 model setting overwrite behavior를 명시했으며, scope 밖의 새 auto-merge 기능을 추가하지 않았다.
- 승인된 architectural sequence 및 significant-risk QA 뒤 Reviewer gate를 반영했다.
- README, model loader, installer, tests, profile templates, manifest까지 같은 계약에 포함했고, runtime parent relationship이 검증되었다고 주장하지 않는다.
- unresolved user decision은 없다. Legacy input과 transactional retirement의 구체 요구는 written-spec review로 확인할 수 있다.

## 다음 단계

이 spec은 승인된 설계를 구체화한 초안이다. CEO가 통합·저장 및 self-review한 뒤 사용자에게 written-spec 검토를 요청한다. Spec 승인 전에는 implementation plan과 코드 수정을 시작하지 않는다.
