# Yunho Harness

이 Harness는 Codex의 조사·문서 작성·개발을 역할별로 조율합니다. CEO가 개발을 조율하고, 다섯 전문 역할이 배정된 작업을 수행합니다.

## 👥 역할과 작업 흐름

| 역할 | 담당 |
|---|---|
| CEO | 현재 채팅 모델로 조율·승인·통합·수락·완료, CEO 직접 경로의 작은 수정 |
| Scouter | 읽기 전용 자료 조사·분석, 정적 코드·문서·데이터 탐색 |
| Planner | 설계·구현 계획 작성 |
| Coder | 할당된 구현·설정·테스트 코드 편집 |
| QA | 독립 검증 |
| Reviewer | 독립 검토 |

- 개발·설정·테스트·구현 의존 문서와 구현이 섞인 작업은 CEO가 책임지고, 코드 편집은 Coder에게 맡깁니다. 예외는 아래 CEO 직접 경로입니다.
- 독립 문서 작성은 전문 역할에 자동 배정하지 않습니다. Scouter는 파일을 편집하거나 독립 문서 파일을 작성하지 않습니다. Planner는 설계·명세·계획 초안, Coder는 구현 종속 문서를 담당합니다.
- Scouter는 문서·데이터·정적 로그 등의 자료를 다룹니다. 공개 문서에 기록된 운영 방법 조사도 담당 범위에 포함됩니다. 현재 시스템·앱·프로세스 상태의 확인과 운영 정리는 담당 범위 밖이며, 이 경계가 다른 담당자를 자동으로 지정하지는 않습니다.
- 다섯 역할은 모두 CEO에게 직접 보고하며, 에이전트를 만들거나 다른 역할에 직접 위임할 수 없습니다. 전체 트리에서 Scouter를 포함해 하위 에이전트는 최대 네 개까지 동시에 실행합니다. 독립적인 작업만 병렬로 처리하고, 종속 작업은 순서대로 수행합니다.

| 변경 위험 | 최소 검증 흐름 |
|---|---|
| 작은 저위험 변경 | Coder 또는 CEO 직접 경로 → CEO 집중 확인 → 수락 |
| 일반 행동 변경 | Coder → 독립 QA → 수락 |
| 중요하거나 위험이 큰 변경 | Coder → QA → 최종 전체 변경의 독립 검토 → 수락 |

QA는 모든 수락 기준에 확인 방법·범위, 실행 결과, 근거, 기준 판단과 미검증 사유를 연결합니다. 검사 실행 통과는 기준 입증과 구분하며, 일부 확인·검사 부재·환경 차단의 공백은 미검증으로 남깁니다. 구조 검사는 실제 행동·설치·실행 중인 에이전트의 준수를 입증하지 않습니다. 저위험 변경의 CEO 집중 확인에도 같은 근거 구분을 적용합니다.

QA 실행 실패나 기준 불충족은 CEO가 Coder 수정과 QA 재확인을 거친 뒤 Reviewer 단계로 전달합니다. Reviewer의 기준 연계 행동 발견도 CEO를 통해 Coder 수정·QA 재확인으로 이어지며, 중요·고위험 변경은 그 뒤 최종 전체 변경을 다시 검토합니다. Reviewer는 QA 검사를 실행하지 않으며 구조·설계·사실·보안 검토를 유지합니다. CEO가 증거 공백을 명시적으로 처분해도 미검증을 입증으로 바꾸지 않습니다.

UI 수락 기준이 배정되고 작업 요약이 검증 참조의 UI 브라우저 수락 검사 섹션을 지정하고 작업공간·기존 실행 명령 또는 URL·계정과 테스트 데이터 범위·허용 상호작용이 있으면, QA는 기존 승인 환경과 사용 가능한 승인 브라우저 도구로 확인합니다. 기준별 명령/URL, 테스트 상태·화면 표시 영역(해당 없으면 해당 없음), 상호작용 단계, 기대·관찰 결과와 근거를 보고하며, 기동·로딩·정적 검사만으로 전체 UI 동작을 입증하지 않습니다. 전제조건·환경·도구가 부족하면 CEO에 제한을 보고하고 해당 기준은 미검증으로 둡니다. 편집·의존성 설치·환경 설정 변경 권한은 없으며, QA가 만든 프로세스·세션만 정리하고 기존 공유 서비스·세션은 보존합니다. 이 수락 검사는 CEO의 Visual companion 디자인 논의와 구분합니다.

**CEO 직접 경로**: 작은 저위험 조건과 계획 생략 조건을 모두 만족하고 중요 위험 요인이 없는 작업만 CEO가 Planner brainstorming과 Coder 없이 직접 수정합니다. 수정 전에 범위·파일·조건 충족 근거·수락 기준·집중 검증을 짧은 설계로 제시해 사용자의 명시 승인을 받고, Coder 인계 게이트와 같은 실행 대상 선택·Git 상태 확인을 거칩니다. TDD 규칙은 Coder와 같으며, 수정 후 집중 확인으로 기준별 근거를 연결합니다. CEO는 자기 수정에 독립적이지 않으므로 근거가 부족하면 QA를 배정합니다. 범위가 커지거나 위험이 불분명해지면 수정을 멈추고 변경 내용을 기록한 뒤 재분류하며, 이후 수정은 일반 Planner/Coder 흐름의 Coder가 맡습니다. 자동 되돌리기는 하지 않습니다.

설계·계획 깊이와 검증 위험도는 별도로 판단합니다. 행동 변경에는 기본적으로 TDD를 적용하며, 조건을 모두 만족하는 단일 국소 변경만 CEO가 근거를 기록해 실패 우선 절차를 면제할 수 있습니다. 상세 정책은 [Harness 지침](skill/SKILL.md)을 따릅니다.

## 계획 task 수락과 자동 커밋

승인된 plan의 최상위 task 하나가 focused 구현 커밋 하나의 단위입니다. Planner는 task ID·제목·목표·범위·파일·의존성·수락 기준·필수 검사/검토·근거·보류 조건을 명시합니다.
분리 검증이 불가능한 변경은 처음부터 하나의 최상위 task로 구성하며, 실행 중 다른 승인 task들을 임의로 합치지 않습니다.
CEO는 수락 기준·해당 범위의 필수 검사/검토·findings를 근거로 확인하고 자체 판단으로 수락한 뒤, 추가 사용자 커밋 승인 없이 즉시 로컬 커밋을 진행합니다.
즉시는 필요한 Git 확인·스테이징·커밋을 다음 처리로 진행한다는 뜻입니다. 하위 체크박스·Coder 보고·검사 통과만으로 수락을 대신하지 않으며, 하위 절차와 개별 명령은 커밋 단위가 아닙니다.

CEO는 커밋 전에 승인 plan 버전·task ID·절대 workspace·저장소·branch/HEAD·staged/unstaged/untracked 상태·소유권과 staged 경로/내용·확정 메시지를 확인합니다.
같은 파일의 다른 task·사용자 변경은 안전한 분리를 입증해야 하며, 무관 staged 변경은 보존하고 멈춥니다. 자동 unstage/stash/reset/clean으로 해결하지 않습니다.
미충족 기준·필수 검사 실패/미실행·미해결 findings/증거 공백·범위 확대·Git 상태/소유권 불일치·실패/부분 완료 시 보류 사유와 다음 행동을 기록합니다.
변경 없음이면 수락 근거를 남기고 빈 커밋을 만들지 않습니다. 재개 시 같은 task의 기존 SHA·내용·유효성을 검증해 재사용하고 중복 커밋을 막습니다.
Git 실패나 기록 누락 때는 실제 branch·HEAD·index·작업 트리와 커밋 생성 여부부터 확인하며 결과가 불명확하면 바로 재시도하지 않습니다.
커밋 후 SHA·실제 메시지·포함 경로/내용·post-commit HEAD·남은 상태를 확인하고 수락 근거·필수 검사·findings·남은 최종 검증과 정본에 연결합니다.

task 수락/커밋과 전체 plan의 최종 QA·Reviewer·통합 수락을 구분합니다. 나중의 최종 검증만으로 독립 수락 가능한 task 커밋을 미루지 않지만, plan이 해당 검토를 task 수락의 선행 조건으로 지정했다면 기다립니다.
task 경계만으로 QA/Reviewer를 추가하지 않으며, 기존 위험·의존 검증과 승인 의무를 유지합니다. 중요 변경의 최종 전체 검토는 QA 뒤 최종 관련 상태에서 수행합니다.
최종 findings로 이미 커밋한 변경을 수정해야 하면 CEO가 필요한 계획·승인을 거친 후속 task로 수정·재검증하고 새 focused 커밋을 만듭니다. 자동 amend/reset이나 원 task 중복 커밋은 하지 않습니다.

기존 문서 개별 승인·완결 → 실행 대상 명시 선택 → 남은 승인 문서의 pre-Coder 일괄 준비 → 최종 확인·인계 순서를 유지하며, task 자동 커밋은 조기 문서 커밋을 허용하지 않습니다.
push·merge·publish·deploy·install은 별도 지침과 승인을 따릅니다. Conventional Commits의 description은 구체적인 한국어 구절로 쓰고 끝에 마침표를 붙이지 않으며, 필요한 scope는 소문자로 씁니다.
plan 생략 가능 경로에 새 계획 의무를 추가하지 않습니다. historical spec/plan은 소급 수정하지 않으며, 구조 검사는 실제 agent runtime 준수를 입증하지 않습니다.

## 조건별 필수 참조와 Coder 인계

CEO는 핵심 [Harness 지침](skill/SKILL.md)을 읽고, CEO와 각 역할은 아래 조건이 발생하면 해당 참조를 종속 행동 전에 반드시 읽습니다. 하위 역할은 SKILL.md 대신 자신의 프로필과 brief를 따릅니다.
CEO는 배정 역할의 작업 요약에 접근 가능한 참조 경로를 전달합니다. 참조 누락·접근 불가·충돌 시 CEO에게 보고하고 해당 작업을 멈춥니다.
매 작업에 모든 참조를 읽을 필요는 없습니다. 설치기는 `skill/references/`도 재귀 복사하며 무결성 목록으로 검사합니다.

| 참조 | 필수 시점 |
|---|---|
| [계획](skill/references/planning.md) | 설계/계획 깊이 판단, spec/plan 작성·승인과 최초 저장 전 |
| [인계](skill/references/handoff.md) | CEO의 Coder 최초 시작·재개 준비 전 (Coder의 독립 확인은 Coder 프로필에 있고, 인계 문서는 brief가 지정한 섹션만 읽음) |
| [인계 준비](skill/references/handoff-prep.md) | 실행 대상 선택 요청, 각 준비 Git 변경(브랜치 생성·전환, 스테이징, 커밋) 전 |
| [관리형 worktree](skill/references/handoff-worktree.md) | 명시 선택 뒤 생성·branch 작업·문서 전달 전 |
| [커밋](skill/references/commit.md) | 계획 task 수락과 focused 커밋, 커밋 결과가 불명확한 task 재개 전 |
| [검증](skill/references/verification.md) | CEO의 검증 설계, QA/Reviewer 배정, 수정 재확인, UI 수락 검사 전 (QA·Reviewer는 각자 프로필을 쓰고 brief가 지정한 섹션만 읽음) |
| [Git 복구](skill/references/git-recovery.md) | 브랜치 충돌, 준비 실패, 부분 완료, 메타데이터 쓰기 거부 시 |
| [Visual companion](skill/references/visual-companion.md) | 시각 자료 제안·시각 보조 도구 운영 전 |

아키텍처 수준(Architectural) 명세의 전체 초안과 자체 검토는 Planner가 반환하고 CEO가 통합·저장·검토한 뒤 서면 명세 승인을 받습니다.
범위가 제한된(Bounded) 서면 명세는 기존 CEO의 깊이 판단이 요구할 때만 같은 작성·저장·개별 승인 절차를 적용합니다.
승인된 짧은 설계와 필수 명세를 구별하며, 짧은 설계 저장·승인이 필수 명세 승인을 대신하지 않습니다.
필요한 명세의 승인 버전을 문서 집합에 포함하고 종속 계획 작성·실행 준비 전에 승인을 완료합니다.
계획이 필요하다는 이유만으로 명세를 요구하지 않으며, 탐색(Spike)·범위 제한 계획 생략(Bounded plan-skip)·비행동 변경(non-behavior) 경로에 새 명세 의무를 추가하지 않습니다.
상세 적용 조건과 생략 근거는 [계획 참조](skill/references/planning.md)를 따릅니다.
CEO는 Planner 초안을 대체하는 독립 명세 초안을 작성하지 않으며, 실질적인 누락은 Planner에게 보완 요청합니다.
최초 명세·계획 저장 전에는 역할·승인 범위·초안과 자체 검토·절대 저장 경로 증거를 확인합니다.
명세 저장에는 아직 존재하지 않는 서면 명세 승인이나 실행 대상 선택을 요구하지 않습니다.
설치된 brainstorming의 조기 명세 커밋 지시는 Harness의 승인·선택·일괄 준비 순서에 맞춰 적용합니다.

현재 승인 범위의 필요한 문서를 모두 작성·개별 승인받고 집합을 완결한 뒤 실행 대상을 선택합니다.
최초 시작에는 현재 체크아웃, 같은 체크아웃의 검증된 새 브랜치, 새 관리형 worktree와 새 task branch 중 하나를 사용자가 명시 선택해야 합니다.
계획 승인·무응답·불명확한 답변은 선택이 아닙니다. 승인 문서 커밋 또는 유효한 문서 생략 근거와 최종 상태를 확인한 뒤 인계합니다.
문서 작성·승인 중에는 실행 준비 목적의 대상 선택·브랜치 전환·worktree 생성·스테이징·커밋을 하지 않습니다.

선택 요청 직전에는 문서 목록·승인 버전과 근거·의존 순서·미완료 문서 부재를 확인합니다.
각 브랜치 변경·worktree 생성·스테이징·커밋 직전에는 문서 완결·명시 선택과 최신 저장소 상태·보존·소유권·명령 범위를 확인합니다.
선택 요청 전에 선택 증거를 요구하지 않습니다. 누락·불일치·실패는 해당 행동을 멈추고 CEO가 해결합니다.
기존 유효 문서 커밋은 검증해 재사용하고 남은 승인 문서만 한 번에 준비하며 스테이징된 경로·차이·커밋 메시지와 사후 상태를 확인합니다.
이 증거는 기존 정본에 기록하며 과거 조기 저장·커밋을 소급 승인하지 않습니다.

새 관리형 worktree는 `mcp__codex_app__create_worktree`로 생성합니다. 앱이 실제 경로를 결정하며 목적지 path·branch 인자를 받지 않습니다.
설명용 `name`과 검증된 source HEAD 전체 SHA인 `ref`, `allowAsync: true`를 사용합니다. Remote/default base 대체와 자동 fetch는 하지 않습니다.
선택 전 원본 절대 경로·repository/common directory·branch/detached HEAD·base SHA·승인 branch 후보와 충돌 상태·name·승인 문서 범위를 제시합니다.
호출 직전 같은 입력을 재확인하고 바뀌면 새 명시 선택을 받습니다. branch 충돌은 승인 없이 다른 후보로 바꾸지 않습니다.
같은 base를 가리키고 다른 worktree에서 사용하지 않는 승인 branch만 재사용합니다.

개별 승인 완료 → 실행 대상 명시 선택 → 앱 생성·관리형 현재 대화 연결·identity/base 검증 → 승인 branch 생성·체크아웃 및 HEAD 검증
→ 기존 승인 커밋 검증·재사용 → 승인 문서 전달 → 대상에서 남은 승인 문서만 한 번 커밋 → 원본·대상 최종 상태 확인 → Coder 인계 순서입니다.
`operationId`가 반환되면 `mcp__codex_app__get_worktree_creation_status`로 완료를 확인합니다. 진행 상태는 성공이 아닙니다.
등록 실패 때만 반환 workspace에 `mcp__codex_app__attach_worktree`를 재시도합니다. 앱 관리·현재 대화 연결을 검증하기 전에는 문서 전달·staging·commit·Coder 시작을 하지 않습니다.
초기 detached HEAD에서 `git switch -c <approved-branch> <ref>`로 승인 branch를 생성하고, 같은 base의 미사용 승인 branch는 `git switch <approved-branch>`로 체크아웃합니다.
예상 밖 branch·base·연결은 중단 사유입니다. Linked 등록·common directory·실제 반환 path·dirty state와 원본 branch·HEAD·index·파일 보존을 확인합니다.
앱은 미커밋 변경을 복사하지 않습니다. untracked 승인 문서는 source HEAD와 index에 경로가 없고 working-tree bytes가 최신 승인 버전이어야 합니다.
Tracked 승인 문서는 index blob·mode가 source HEAD와 같고 working-tree bytes가 최신 승인 버전이어야 합니다. 승인 개정 bytes는 HEAD/index와 다를 수 있습니다.
불일치하면 중단하며 source staging으로 해결하지 않습니다. 무관 staged 변경·불명확한 소유권·필요한 미커밋 구현 변경도 차단합니다.
원본 dirty 구현은 자동 이전하지 않고 stash/commit/reset/clean/unstage로 준비하지 않습니다.
승인된 미커밋 spec/plan만 같은 상대 경로로 전달합니다. destination HEAD는 선택한 base SHA여야 하며 tracked 대상의 index·working bytes가 깨끗한 base와 같은지 먼저 확인합니다.
base에 없는 문서는 destination에도 없어야 복사합니다. escaping symlink·예상 밖 변경은 거부하며 원본은 수정·삭제·이동하지 않습니다.
전달 후 승인 bytes와 source/target 대응을 정본에 기록합니다. 생성·등록·연결·identity·branch·전달 실패·부분 완료는 후속 작업과 인계를 차단합니다.
도구 입력·operationId·결과·오류와 실제 source/target 상태를 기록합니다. raw Git 생성 fallback·다른 name/ref/path/branch 자동 재시도·cleanup/delete/prune/archive는 하지 않습니다.
다섯 역할은 반환된 같은 절대 workspace를 사용합니다. 구조 검사는 정책만 확인하며 실제 앱 provisioning·연결과 agent runtime 준수를 증명하지 않습니다.

동일 승인 범위·작업공간·저장소·실행 대상의 재개는 유효한 최초 명시 선택을 재사용합니다.
생성·검증 성공 후 선택된 대상의 승인 문서 전달·문서 커밋·구현에 따른 정상 승인 HEAD·dirty 변경은 최초 선택을 무효화하지 않습니다.
생성 base SHA는 생성 증거로 보존하며 대상 HEAD가 그 base에 머물 것을 요구하지 않습니다.
이 재사용은 원본 보존과 예상 밖 상태 확인을 면제하지 않습니다.
CEO와 Coder는 매 시작·재개마다 실제 브랜치 또는 detached HEAD·HEAD·스테이징됨/스테이징 안 됨/추적 안 됨 상태,
보존·편집 소유권, 승인 문서·커밋, 승인과 최종 확인을 다시 검증합니다.
범위·작업공간·저장소·대상·승인 브랜치 후보가 바뀌거나 실패 때문에 기존 대상을 신뢰할 수 없으면 새 명시 선택을 받습니다.
정상 승인 작업의 HEAD·작업 트리 변경만으로 선택이 무효화되지는 않습니다. 상태 불일치·미해결 실패·누락 증거는 편집을 차단합니다.

최초 인계 기록은 하나의 접근 가능한 정본으로 보존하고 재개 작업 요약에는 그 위치, 다음 목표·소유권,
승인·문서·범위 변경분, 최신 Git 상태·차이, 선택 유효성·재사용 검증, CEO 최종 확인과 남은 문제를 전달합니다.
이전 대화나 접근 불가 링크로 증거를 대신하지 않습니다. 상세 승인 순서·문서 커밋·브랜치 보호와 기록 필드는 인계 참조를 따릅니다.
Git 복구에서는 잠금 파일 삭제·chmod/chown·권한 우회·작업공간 이동·자동 reset/stash/clean을 하지 않습니다.

정적 정책 계약 테스트는 문서 구조·계약을 확인하며 실제 에이전트 준수를 입증하지 않습니다.
설치 파일 묶음 복사와 무결성 목록 실패 검사는 임시 환경에서 실제 설치기 동작을 확인합니다.
50% 절감 목표는 핵심 파일의 `wc -w` 기준이며 실제 모델 토큰·비용 또는 참조를 포함한 전체 사용량 절감을 보장하지 않습니다.

## 🚀 설치

**준비물:** Python 3.11 이상, Node.js/npm의 `npx`, Git, GitHub·npm에 접근할 네트워크, 전체 저장소.

저장소 루트에서 실행합니다.

```sh
python3 install.py
```

설치기는 내부 파일·모델 설정·프로필을 검사한 뒤, [obra/superpowers](https://github.com/obra/superpowers)에서 다음 세 스킬을 매번 `skills@latest`로 새로 가져옵니다. 별도 수동 설치는 필요하지 않습니다.

```text
brainstorming · writing-plans · test-driven-development
```

취득 결과를 검증한 뒤 외부 스킬, Harness, 다섯 역할 프로필을 백업하고 갱신합니다. 기본 설치 위치는 `~/.codex`이며, 다른 위치는 `CODEX_HOME`으로 지정합니다. 빈 `CODEX_HOME`은 오류입니다.

선택한 Codex 홈의 `agents/` 바로 아래 정확한 두 관리 프로필 `harness-secretary.toml`, `harness-scout.toml`만 폐기합니다. 후보와 상위 경로의 안전성을 검사하며 symlink·디렉터리·특수 파일은 변경 전에 거부합니다. 취득 전후에 후보의 목록·내용·metadata·identity를 비교해 변경 시 중단합니다. 원본 bytes와 mode를 `backups/<timestamp>/agents/`에 백업하고, 모든 백업·staging 준비 뒤 거래에서 두 폐기 파일을 먼저 복구 가능한 위치로 이동합니다. 이어서 다섯 활성 프로필을 교체하며 실패 시 함께 복구합니다. 복구 실패 시 백업과 복구 자료의 절대 경로를 보고하고 자료를 보존합니다. `yunho-team-*` 경로는 비관리 사용자 파일이므로 탐색·검사·백업·삭제하지 않습니다. 다른 사용자 프로필도 보존합니다. dry-run은 다섯 활성 프로필과 발견된 폐기 경로를 표시하며 파일을 변경하지 않습니다.

| 설치 대상 | 갱신 범위 |
|---|---|
| `<CODEX_HOME>/skills/` | 외부 스킬 세 개와 `yunho-harness` |
| `<CODEX_HOME>/agents/` | Harness 역할 프로필 다섯 개 |
| `~/.agents/skills/` | 설치 시작 시 이미 존재하는 외부 스킬 후보만 |
| `<CODEX_HOME>/AGENTS.md` | 파일 맨 아래의 Harness 관리 구간만 (아래 전역 설정 자동 반영, `--skip-global`로 제외) |
| `<CODEX_HOME>/config.toml` | `[features.multi_agent_v2]` 대기 설정 두 키만 (`--skip-global`로 제외) |

외부 스킬 취득은 임시 환경에서 실행하며 사용자 npm/Git 설정·자격 증명·프록시 환경 변수를 이어받지 않습니다. 해당 설정에 의존하는 네트워크에서는 설치가 실패할 수 있습니다. Node.js 최소 버전은 이 저장소에서 고정하지 않습니다.

### 설치 전 확인

```sh
python3 install.py --check    # 로컬 파일·설정·경로 검사
python3 install.py --dry-run  # 같은 검사와 갱신 대상 표시
```

`--check`는 `AGENTS.md`·`config.toml`을 고칠 수 있는지도 검사하고, `--dry-run`은 바뀔 전역 파일과 내용을 함께 표시합니다.

두 옵션은 파일을 수정하거나 캐시·백업을 만들지 않고, 하위 프로세스·`npx`·네트워크도 실행하지 않습니다. Node.js/npm·Git 없이 사용할 수 있습니다. 현재 외부 스킬의 필수 파일 구조를 검사하지만, 최신 원본 저장소나 설치된 프로필과 모델 설정의 일치 여부를 확인하지는 않습니다. 설치기 오류의 종료 코드는 `2`입니다.

## 🔌 전역 설정 자동 반영

`install.command`(또는 `python3 install.py`)는 하네스 스킬·프로필과 함께 Codex 홈의 전역 파일 두 개를 갱신합니다. 반영하지 않으려면 `--skip-global`을 붙입니다.

| 파일 | 설치기가 하는 일 |
|---|---|
| `AGENTS.md` | 기존 내용은 글자 그대로 두고, `<!-- yunho-harness:begin … -->`부터 `<!-- yunho-harness:end -->`까지의 관리 구간을 **파일 맨 아래**에 둡니다. 이전 설치의 관리 구간이 다른 위치에 있으면 맨 아래로 옮기고 최신 규칙으로 바꿉니다. 파일이 없으면 관리 구간만으로 만듭니다. 표시 없는 예전 `Yunho's Harness` 섹션도 지우지 않으며, 남아 있으면 규칙이 겹칠 수 있다고 안내합니다. |
| `config.toml` | `[features.multi_agent_v2]`의 `min_wait_timeout_ms = 120000`, `default_wait_timeout_ms = 300000`을 설정합니다. 다른 값이 있으면 이 값으로 덮어쓰고 같은 표의 다른 키와 나머지 설정은 유지합니다. `multi_agent_v2`가 불리언·인라인 표처럼 자체 표가 아니거나 편집 결과를 검증하지 못하면 건드리지 않고 직접 설정하라고 안내합니다. |

관리 구간에 들어가는 규칙은 아래와 같습니다. 경로는 실제 설치 위치로 채워지며, `CODEX_HOME`이 홈 디렉터리 밖이면 절대 경로가 들어갑니다.

```markdown
## Yunho's Harness

- For requests requiring substantive multi-step research, analysis, or implementation, configuration, or test work (not standalone document writing), load and follow `~/.codex/skills/yunho-harness/SKILL.md`, including relevant follow-up turns in the same chat. Resolve `~` to the current user's home directory. Harness subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.
- For repository implementation, configuration, or test work, CEO owns coordination and acceptance; assign file edits and other work to the other roles according to their defined responsibilities. CEO must not edit implementation, configuration, or test-code files directly, except under the Harness CEO direct path for small, low-risk tasks. The other roles stay within their assigned scopes and report to CEO.
```

두 파일은 고치기 전에 이번 설치의 `backups/<timestamp>/global/`에 원본을 보관하고, 하네스 파일과 같은 거래에서 교체하므로 실패하면 함께 되돌립니다. `config.toml`을 읽을 수 없거나 관리 표시가 깨졌거나 UTF-8 파일이 아니면 외부 스킬을 받기 전에 중단하고 아무것도 바꾸지 않습니다. 설치 후 Codex를 다시 시작하거나 새 세션을 엽니다. 저장소의 `config.toml`은 `[agents]` 설정의 선택 참고 예시이며 자동 병합하지 않습니다.

새 세션은 설치된 프로필과 새 역할 ID를 읽습니다. 사용자 작성 외부 설정·스크립트·문서의 역할 참조는 새 `harness_<role>` ID와 `harness-<role>.toml` 파일명으로 직접 수정해야 합니다. 과거 계획·명세·요약 문서의 명칭도 현재 체계로 정규화했으며, 날짜·승인 사실·폐기 역할의 당시 의미는 유지합니다.

실행 중인 에이전트의 설정과 부모 관계는 자동으로 바뀌지 않으며, 정책·프로필의 구조 확인만으로 실제 실행 관계를 검증한 것은 아닙니다.

## ⚙️ 모델 변경

[skill/models.toml](skill/models.toml)이 다섯 역할의 모델과 추론 강도 설정 원본입니다. CEO는 현재 채팅 모델을 사용합니다.

```toml
version = 5

[roles.harness_coder]
model = "example-model-id"
model_reasoning_effort = "medium"
```

위 예시는 일부만 보여줍니다. 실제 파일에는 다섯 역할과 각 역할의 두 문자열 필드가 모두 필요합니다. 이전 설정 버전 1·2·3·4는 오류로 거부하고 자동 변환하지 않으며, 모델·추론 강도의 원격 지원이나 계정 접근 권한은 검사하지 않습니다.

새 설치는 저장소 설정을 사용하며 이전 사용자 모델 설정과 프로필의 개인 수정 사항을 자동 병합하지 않습니다. 기존 Harness 백업의 `models.toml`을 참고해 새 형식에 필요한 값을 직접 반영할 수 있습니다. **기존 설치의 모델만 변경하려면** 설치된 `~/.codex/skills/yunho-harness/models.toml`을 편집한 뒤 실행합니다.

```sh
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py --check
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py --dry-run
python3 ~/.codex/skills/yunho-harness/scripts/apply-models.py
```

`CODEX_HOME`을 사용한다면 명령의 경로도 바꿉니다. `--check`는 프로필 일치 시 `0`, 차이 발견 시 `1`을 반환합니다. `--dry-run`은 변경 예정 내용을 표시하고, 일반 실행은 프로필에 반영합니다. 설정·프로필·경로 오류는 `2`입니다. 설정 원본은 다시 쓰지 않으며, 유효한 `models.toml` 변경에는 무결성 목록 재생성이 필요하지 않습니다.

## 🛡️ 백업과 무결성

- 기존 대상은 선택한 Codex 홈의 `backups/<timestamp>/`에 보존합니다. 외부 스킬은 전체 트리를 교체하므로 개인 수정과 원본 저장소에서 삭제된 파일은 설치 위치에서 사라집니다. 이전 내용은 백업에서 직접 복원하세요.
- 취득·검증을 마친 뒤 설치 대상을 교체하며, 중간 오류에서는 완료된 교체를 역순으로 복구합니다. 전체 파일시스템에 걸친 원자성은 보장하지 않습니다. 복구 실패 시 출력된 백업·복구 데이터(recovery) 경로를 보존해 수동 복구에 사용하세요.
- 외부 스킬 후보와 상위 경로의 심볼릭 링크는 일반 설치에서 거부합니다. 취득한 트리는 내부의 유효한 링크만 허용하고, 외부로 나가는 링크·끊어진 링크·순환 링크·특수 파일은 거부합니다.
- `MANIFEST.sha256`은 설치기·README·선택된 내부 스킬 및 프로필 파일의 무결성을 검사합니다. 편집 가능한 `skill/models.toml`은 제외하고 별도로 설정 형식을 검사합니다. `skill/`, `agents/` 아래 일반 파일인 `.DS_Store`는 제외하며 같은 이름의 다른 항목 유형은 오류입니다.
- 외부 스킬은 특정 버전이나 해시로 고정하지 않습니다. CLI 결과와 트리 구조를 검증하지만 원격 출처를 독립적으로 암호학적 인증하지는 않습니다. 내부 무결성 목록 역시 자체 진위나 원격 모델 지원을 증명하지 않습니다.
