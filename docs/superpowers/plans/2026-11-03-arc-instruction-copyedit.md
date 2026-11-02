# ARC 하네스 지침 문구 정리 계획

## 버전 및 승인 기록

- v1: 사용자 승인 완료. 계획 커밋 1137e05ce023d2c4918546257206187ade77f547, 본문 SHA-256 872a7c1d28d43f07f752db4ef8e4482388c357767681f7c88e625c87f3f1f2dc. 승인 응답: “계획 승인하고 구현 진행”.
- v2: 사용자 승인 완료 (2026-11-03; 승인된 수정안 SHA-256: 97246c943b6546f3b4e26a084598e3175dd606a8d9d5b766c0a10a9895042e11). 승인 응답: “승인하고 진행 (권장)”. 기준선 검사에서 확인한 두 개의 기존 fixture hash 불일치만 반영한다.
- v3: Orchestrator 승인 완료 (2026-11-03), 사용자의 명시적 중간 승인 위임에 따른 승인. 승인 수정안 SHA-256: a69de5ce1ce5f1cea089f69a530092340a7ad502a1c4a169d0d2b646c49afd4a. 승인 범위는 `tests/node/plan.test.mjs`의 rendering hash 8개와 C5의 알려진 baseline/environment 실패 분류다. 승인 뒤 읽기 전용 증거로 npm-upgrade 진단을 baseline으로 분류했으며 승인 범위는 달라지지 않았다.
- Orchestrator는 v3 승인 기록을 포함해 원래 계획 커밋만 amend한다. 별도 계획/fixup 커밋은 만들지 않는다.

## 목적과 승인 범위

Codex와 Claude의 ARC 자체 지침을 문장별로 검토해 간결하고 명확한 영어로 다듬고, 제목·목록·표·링크 형식을 일관되게 정리한다. 반복이나 장황함을 줄이되, 기존 ARC 흐름과 규칙의 의미·적용 시점은 보존한다.

| 항목 | 기록 |
|---|---|
| 작업 분류 | Bounded 문서 정리, plan 필요 |
| 검증 위험 | Significant — 공통 역할·권한 계약과 생성 정책을 다룸 |
| 실행 대상 | /Users/yunho/Desktop/project/arc |
| 선택된 브랜치 | refactor/arc-instructions |
| 준비 기준 HEAD | 8c88952e9c0178fdb07ad521a51b6620e08503ea |
| 준비 상태 | 브랜치 생성 후 clean |
| 계획 문서 | /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-11-03-arc-instruction-copyedit.md |
| 구현 담당 | Implementer 1명, 전체 승인 범위 소유 |
| 계획 저장·검토, Git 준비·변경, QA 조정, 수락·완료 | Orchestrator |

사용자는 ARC 지침 문구의 리팩토링과 브랜치 refactor/arc-instructions를 선택했다. 역할 프로필과 canonical policy의 예상 문구·해시를 고정한 기존 회귀 기준은, 검사 범위와 강도를 낮추지 않는 최소 갱신만 허용했다. 이 계획은 해당 승인을 구현 가능하도록 구체화하며, 계획 자체는 별도로 승인받아야 한다.

제품 동작을 새로 설계하거나 변경하지 않으므로 별도 design/spec은 작성하지 않는다. 여러 문서의 공통 계약, canonical policy, 생성 출력, runtime mirror, manifest와 회귀 기준이 서로 의존하므로 단일 TASK-01 계획은 생략하지 않는다. 문구 변경만으로 모델 동작의 완전한 동일성을 증명할 수 있다고 주장하지 않는다.

## 대상 파일

### 문장별 검토 및 수정 후보: 31개

다음 ARC 작성 파일을 모두 검토한다. 문구가 이미 명확하거나 변경이 의미를 바꿀 우려가 있으면 그대로 두고 파일별 검토표에 이유를 기록한다.

| 구분 | 경로 |
|---|---|
| Codex 역할 프로필 (5) | codex/agents/arc-implementer.toml, arc-planner.toml, arc-qa.toml, arc-reviewer.toml, arc-scouter.toml |
| Codex 진입점 (1) | codex/skill/SKILL.md |
| Codex 참조 문서 (10) | codex/skill/references/arc-visual-companion.md, commit.md, coordination.md, git-recovery.md, handoff-prep.md, handoff-worktree.md, handoff.md, limits.md, planning.md, verification.md |
| Claude 역할 프로필 (5) | claude/agents/arc-implementer.md, arc-planner.md, arc-qa.md, arc-reviewer.md, arc-scouter.md |
| Claude 진입점 (1) | claude/skill/SKILL.md |
| Claude 참조 문서 (9) | claude/skill/references/arc-visual-companion.md, commit.md, coordination.md, git-recovery.md, handoff-prep.md, handoff.md, limits.md, planning.md, verification.md |

프로필의 모델·effort·도구 설정은 변경하지 않는다. Codex TOML과 Claude Markdown 형식은 유지하고, 두 플랫폼의 공통 지침은 같은 의미와 표현을 쓰되 플랫폼 전용 내용은 분리해 보존한다.

### Canonical policy, 생성물 및 기존 검증 기준

- lib/policy/role-policy.json에서는 자연어 규칙 문구만 수정한다. 규칙 ID, 배열 순서, 역할 범위, schema, effect, operations, evidence, authority, controls, review routing, runtime 필드 등 비문장 값은 유지한다.
- node scripts/update-role-policy.mjs로 관리 블록을 재생성한다. lib/policy/render.mjs의 대상은 총 24개(마크다운 19개, Codex TOML 프로필 5개)이며 모두 위 31개 파일에 포함된다. 관리 블록을 직접 편집하지 않는다.
- node scripts/update-runtime-assets.mjs로 두 플랫폼의 runtime role-policy.json 사본을 갱신한다. 예상 변경은 정책 사본뿐이다. 나머지 runtime 자산은 바뀌지 않아야 한다.
- tests/node/fixtures/instruction-contracts.json에서는 문구 수정에 필요한 golden hash·contract 발췌문만 갱신한다. v2가 승인되면, 기준선에서 확인된 codex/skill/models.toml 및 claude/skill/models.toml의 오래된 hash 기대값 두 개도 실제 현재 파일 hash로만 갱신한다. 모델 파일과 설정값은 변경하지 않는다.
- 문서 문구를 바꿔 inline literal anchor가 불가피하게 달라질 때에만 tests/node/instruction-layout.test.mjs의 해당 검사를 동등한 의미로 갱신한다. assertion 삭제, skip, 조건 완화 또는 포괄 범위 축소는 금지한다.
- v3 승인에 따라 tests/node/plan.test.mjs의 `renderingBaseline` SHA-256 기대값 8개만 최종 승인 문구가 포함된 현재 출력값으로 갱신한다. 검증 대상과 assertion logic은 유지하며 모델 파일·설정은 변경하지 않는다.
- payload 변경에 맞춰 node scripts/update-manifest.mjs로 MANIFEST.sha256을 갱신한다.

새 테스트는 추가하지 않는다. 기존 테스트 파일 수정은 instruction-contracts fixture의 필요한 기대값, 불가피한 inline anchor, 그리고 v3가 승인한 rendering hash 8개로 한정한다. 검증 assertion의 논리와 범위는 유지한다.

## 제외 범위

각 플랫폼의 provenance에 기록된 상류 Superpowers 원본 Markdown은 수정하지 않는다: brainstorming.md, builder-check-prompt.md, visual-companion.md, writing-plans.md, test-driven-development.md, writing-good-tests.md. provenance, 라이선스, 기타 상류 파일도 그대로 둔다.

두 models.toml 파일의 내용, README.md, docs/harness-operation.md, 기존 docs/superpowers의 설계·계획 자료, installer/runtime 원본 코드, 생성 스크립트, 허용된 기대값 이외의 test/fixture 내용, 정책의 비문장 값과 기타 설정은 제외한다. v2는 두 models.toml의 기존 보호 hash 기대값만 바로잡는다. v3는 renderingBaseline hash만 갱신하며 모델 파일·설정은 그대로 둔다. Git이 무시하는 로컬 scripts/update-superpowers-local.sh도 제외하며 제거·이동하지 않는다. 이 계획 파일은 ARC planning 절차상 새로 작성하는 Orchestrator 소유 문서다.

## 보존·편집 기준

각 문구를 주체, 의무 강도, 조건, 예외, 시점, 적용 범위, 결과 의무, 연결된 역할과 참조 위치에 대응해 검토한다. 다음을 바꾸지 않는다.

- 역할 소유권, 권한, 금지, 라우팅, agent depth와 task 경계.
- user approval 범위, target 선택·재사용 조건, 준비·handoff·중단·재개 조건.
- 실패 분류, 영향받는 작업의 보류, 승인된 독립 작업의 해제, acceptance 보류 조건.
- Git과 기존 변경사항 보존, QA freshness·recheck, Reviewer 시점·독립성, acceptance와 commit 순서.
- 기존 TDD 흐름과 명시된 예외, small-task·plan-omission 자격 조건 및 각 경로의 필수 검증.
- 해당 행동 전에 역할이 필수 지침을 읽도록 하는 조건, 참조 경로와 플랫폼별 경로·도구 차이.
- policy rule IDs, generated markers, anchors, commands, literals, TOML 구조와 설정값.

짧은 주어-동사 문장과 명확한 목록을 우선한다. 같은 문서 안에서 의미가 완전히 중복된 설명은 합칠 수 있다. 여러 역할이나 작업 시점에 반복되는 규칙은 모두가 행동 전에 볼 수 있다는 근거가 있을 때만 줄인다. 진입점의 짧은 gate 설명과 올바른 상세 참조 링크는 필요한 경우 유지한다. 모호하거나 상충하는 문구는 임의 해석하지 않고 수정 보류 사유를 보고한다. 글자 수 감소 자체는 완료 기준이 아니다.

## TASK-01 — ARC 지침과 연결된 생성물의 문구 정리

### 목표·소유권·의존성

31개 대상 파일을 빠짐없이 검토하고, 승인된 자연어 policy와 필요한 생성물·runtime mirror·manifest·회귀 예상값을 일치시킨다. 하나의 Implementer가 전체 편집 범위를 소유하며 같은 파일을 병렬 편집하지 않는다. 하위 단계는 순서가 있는 구현 절차이며 별도 task나 commit이 아니다.

선행 구현 task는 없다. 최초 ready batch는 TASK-01 하나다. 단일 작업이 필요한 이유는 공통 역할 규칙과 생성된 출력·검증 기대값이 서로 맞아야 하기 때문이다.

### 구현 순서

1. **계획 승인·준비:** v1 사용자 승인·커밋, v2 사용자 승인·계획 amend, v3 delegated approval을 마쳤다. Orchestrator가 원래 계획 커밋만 amend하고, 갱신된 계획 버전·SHA·경로·내용과 현재 branch/HEAD, index·working tree, 소유권과 handoff를 다시 검증한다. 계획 커밋과 정확한 해시를 확인한 뒤에만 v3의 새 test expectations를 수정한다.
2. **기준선 확인:** 현재 기준선 검사에서 아래의 오래된 models.toml hash 기대값 두 개가 발견됐다. v2 승인 후 fixture의 이 두 값만 실제 파일 hash로 수정하고, focused baseline 검사를 다시 실행한다. 다른 실패가 나오면 정확한 결과·증거를 기록해 baseline/current 및 의존성을 분류하고 영향받는 작업을 보류한다. 확인되지 않은 실패를 자동 재시도하거나 본문 수정으로 덮지 않는다.
3. **전체 문구 검토:** baseline이 분류된 뒤 31개 파일마다 수정 위치, 원문 의미, 수정 후 의미 또는 변경하지 않은 이유를 기록한다. 특히 긴 scope.non-escalation 문장과 반복 handoff 계약은 하위 조건, 역할, 순서, 증거, before-action 가시성을 대조한다.
4. **ARC 문구 수정:** 관리 블록 밖 지침과 canonical policy의 자연어만 수정한다. 정책 출력을 수동 편집하지 않는다. 문구를 합치거나 옮길 때 필요한 역할과 시점에서의 노출이 유지되는지 확인한다.
5. **정책 생성:** 저장소 루트에서 node scripts/update-role-policy.mjs와 node scripts/update-runtime-assets.mjs를 순서대로 실행한다. 24개 policy 대상과 두 runtime 사본을 검토한다. 예상하지 않은 파일이나 non-prose 필드가 바뀌면 중지해 보고한다.
6. **기존 기대값 갱신:** 변경된 문구·파일에 연결된 fixture 해시와 contract 발췌문만 갱신한다. v2가 승인한 두 baseline hash와 v3가 승인한 `plan.test.mjs`의 rendering hash 8개만 실제 최종 출력에 맞춘다. inline assertion은 실제 문구 변경 때문에 필요한 경우에만 동등한 검사로 고친다. 검사 범위와 강도는 줄이지 않는다.
7. **Manifest·최종 검사:** node scripts/update-manifest.mjs로 manifest를 갱신한 뒤 전체 필수 검사를 실행한다. 변경 파일, per-file 검토 결과, 원문 대비 의미 보존 근거, 변경하지 않은 모호 문구, 검사 결과와 한계를 Orchestrator에게 보고한다. Implementer는 acceptance나 Git commit을 수행하지 않는다.
8. **QA·수락·commit:** fresh QA가 전체 최종 변경을 독립 검증한다. 실패는 Implementer 수정 후 QA가 재확인한다. Orchestrator가 criterion별 근거와 남은 gap을 판단해 TASK-01을 수락한 뒤 단일 focused implementation commit을 만든다.
9. **최종 Reviewer:** 수락과 구현 commit 후 독립 Reviewer가 최종 전체 diff를 검토한다. 최초 final review 전의 QA 실패·finding은 Implementer → QA 순서로 해결한다. 최종 plan Reviewer finding은 Implementer → Reviewer로 해결하고 QA를 재배정하지 않는다.

### 완료 기준

| ID | 기준 |
|---|---|
| C1 — 범위 | 31개 파일을 모두 문장별 검토했고 수정은 승인된 ARC 문구 및 세 기존 test 경로의 지정 기대값에 한정된다. v2의 models.toml 보호 hash와 v3의 8개 rendering hash만 보정한다. 제외 파일·코드·설정은 변경되지 않았다. |
| C2 — 흐름 보존 | 역할, 권한, modal strength, 조건, 범위, 예외, TDD·small-task·plan-omission 흐름, 순서, 승인·중단·재개, verification·QA·Reviewer·acceptance·commit 경계가 원문과 의미상 일치한다. |
| C3 — 문구와 형식 | 수정한 ARC prose가 간결하고 명확한 영어이며 headings, lists, tables, links 형식이 일관된다. 의미를 안전하게 보존할 수 없는 문장은 유지하고 이유를 기록했다. |
| C4 — 생성 일치 | canonical policy와 24개 생성 출력, 두 runtime policy 사본, MANIFEST.sha256이 일치한다. policy 비문장 필드와 profile 설정은 그대로다. |
| C5 — 회귀·독립 검증 | generator/runtime/manifest와 targeted 4-file Node 검사 및 현재 변경에 직접 대응하는 검사들이 통과한다. 전체 Node·Python suite를 실행해 모든 실패를 baseline, environment, current 또는 unknown으로 분류하고 근거를 기록한다. current-only 실패나 unknown 영향이 남으면 보류한다. 승인된 hash expectation만 갱신하며 assertion logic과 범위는 유지한다. fresh QA와 final Reviewer가 결과 및 한계를 독립 확인한다. 전체 suite의 baseline/environment 실패가 남으면 통과했다고 주장하지 않는다. |

### 기준선 실패와 v2·v3 수정 사유

v1 계획 커밋 1137e05ce023d2c4918546257206187ade77f547 상태에서, 편집 전 focused 검사 69개 중 68개가 통과하고 1개가 실패했다. 실패 테스트는 tests/node/instruction-layout.test.mjs:71-72의 “profile models, permissions, canonical policy and CLI/runtime bytes are preserved”이며, 첫 불일치는 tests/node/fixtures/instruction-contracts.json:261의 claude/skill/models.toml hash였다. fixture 기대값은 0eef315957619d616c922d6c6e413ddfdad2b4c26b0c5f7731b9ee9cece669ba, 현재 파일의 SHA-256은 9b849a8b6f966b1aafbccecd67045302f281f3f6c0c9fc6645ddc37ace9b70cb다.

읽기 전용 비교에서 50개 보호 파일 중 이 외에 codex/skill/models.toml의 불일치 하나만 더 확인했다: fixture 기대값 055c01551b87e7900669e47a95fe881f5bfad73a31d5418dec422d2b92f9d1d1, 현재 SHA-256 e788736ac2345ec234cd4582a3f4779f46ee5f1a5a12f2f0f4049c7699fe0f2b. 나머지 48개 hash는 일치하며, 두 models.toml 파일은 선택 기준 HEAD에서 현재 HEAD까지 변경되지 않았다. v2는 기존 보호 assertion을 유지하면서 이 두 expected hash만 보정해 baseline 검사를 복구하는 제안이다. 모델 파일·설정은 편집하지 않는다.

첫 전체 검사는 Node 1,242개 중 1,192개 통과·41개 실패·9개 skipped, Python 241개 실행·557개 실패·7개 오류를 보고했다. 표적 진단은 그중 현재 문구 변경과 연결된 Python assertion 하나를 확인했고, Codex·Claude SKILL의 `Standalone document writing has no specialist auto-route.` 문구를 복원했다. Python의 예전 heading 기대값, 모델/TUI의 값 기대, hook 존재 기대는 선택 기준선의 문서·설정 또는 기존 계약과 이미 불일치했다.

Node `tests/node/plan.test.mjs`의 8개 public rendering hash는 변경된 역할 프로필 출력을 포함하므로 현재 문구 변경과 연결된다. v3는 이 8개 기대값만 갱신하고 test logic은 그대로 둔다. 실제 `models.toml` 내용도 rendering snapshot 입력에 포함되며, 이 작업은 그 파일이나 설정을 수정하지 않는다.

Node `tests/node/manifest.test.mjs`의 17개 표적 실패는 Git이 무시하는 로컬 `scripts/update-superpowers-local.sh`가 `.git` 없는 임시 payload fixture에 복사되어 package 검증을 먼저 실패시키는 환경 상태에서 비롯됐다. 파일과 ignore rule은 선택 기준선에 있었으며 이번 변경에서 편집하지 않았다. 모델/TUI 및 profile-render 실패는 변경하지 않은 models.toml과 테스트 기대값이 다르다. transaction 테스트는 기준선 구현이 지원하지 않는 `acquired` 옵션을 기대한다. `npm-upgrade-consumer`는 Git 실패를 주입한 뒤 실패를 기대하지만, 기준선 upgrade 경로는 NPM package를 통해 새 버전을 설치하며 Git을 호출하지 않는다. 관련 installer/management/test 파일은 선택 기준선과 동일하다. 이 항목들은 이번 문구 변경과 무관한 baseline/environment 실패로 기록하고, 어떤 경우에도 범위 밖 code, model, ignore rule 또는 test는 수정하지 않는다.

### 검사와 증거

저장소 루트에서 baseline과 최종 상태를 각각 확인한다. Baseline은 편집 전에 기록한다. Implementer는 수정 후 전 항목을 실행하고, QA는 수정 사항이나 recheck 범위가 전체 결과에 영향을 주지 않았다면 최종 전체 Node·Python suite 및 아래 정합성 검사를 독립적으로 재실행한다.

- node scripts/update-role-policy.mjs --check
- node scripts/update-runtime-assets.mjs --check
- npm run check:manifest
- node --test tests/node/instruction-layout.test.mjs tests/node/role-policy.test.mjs tests/node/instruction-language.test.mjs tests/node/runtime-assets.test.mjs
- node --test tests/node/*.test.mjs
- python3 -B -m unittest discover -s tests -p 'test_*.py'
- git diff --check

필요한 생성 명령은 node scripts/update-role-policy.mjs, node scripts/update-runtime-assets.mjs, node scripts/update-manifest.mjs다. 검사 통과는 정적 계약과 생성물 일치를 보여줄 뿐, 실제 Codex·Claude 세션의 동작 동일성이나 live compliance를 증명하지 않는다. 설치, 배포, publish, push 또는 외부 작업은 수행하지 않는다.

제출 증거에는 변경 경로와 제외 파일 보존, 31개 파일별 검토 결과, 각 변경의 원문 대비 의미 대응, modal strength와 조건·순서 비교, IDs/anchors/commands/markers 보존, canonical policy·24개 출력·runtime 사본·manifest 비교, fixture 기대값별 변경 이유, C1–C5 판정(proven/unmet/unverified), 검사 결과와 한계를 포함한다.

### 보류 조건

실제 workspace/branch/HEAD·소유권 불일치, 예상 밖의 변경 또는 부분 생성, 필요한 입력·참조·검사 누락, 승인 계획의 미기록/불일치, baseline 실패의 영향 미분류, 의미를 안전하게 보존할 수 없는 문구, 새 동작 결정이나 충돌, 승인 범위 밖 변경, assertion 약화가 필요한 상황, 필수 검사 실패·미실행 또는 미해결 finding이 있으면 영향받는 작업과 acceptance를 보류한다.

실패 시 처음 실패한 검사·결과·증거, baseline/current revision, 변경 상태, 영향 범위와 의존성을 기록한다. 현재 diff의 영향과 제외된 baseline/environment 증거를 구분한다. 자동 retry, fallback, 환경·권한 변경, 범위 확대 또는 완료 작업 반복은 하지 않는다. 해결 뒤 Orchestrator가 영향받은 gate와 증거를 다시 검증한다.

### Commit 경계

v1 계획 파일은 별도 focused docs commit으로 기록됐고, v2는 사용자 승인 뒤 원래 커밋에 amend됐다. v3는 사용자가 2026-11-03에 중간 승인을 명시적으로 위임했고, Orchestrator가 이 계획 변경의 범위·근거를 검토해 그 권한 아래 승인했다. Orchestrator는 원래 계획 커밋만 amend하고 위임 근거·시점·수정 사유·이전/새 SHA·본문 hash를 기록한다. 별도 계획/fixup commit은 만들지 않는다.

권장 계획 커밋: docs(arc): 지침 문구 정리 계획

TASK-01 acceptance 후 Orchestrator가 staged 경로·diff·ownership을 확인해 단일 구현 commit을 만든다.

권장 구현 커밋: refactor(arc): 하네스 지침 문구 정리

Commit 뒤 SHA, message, paths, content, HEAD와 남은 변경을 검증한다. 구현 commit 후 Reviewer 검토를 수행하며 push, merge, 배포, publish는 하지 않는다.

## 자체 검토

- **C1:** 31개 ARC 지침 파일, canonical source, 24개 policy 대상, runtime mirror, manifest와 최소 회귀 기대값 갱신 범위를 명시했다. upstream Superpowers와 기타 제외 범위를 구분했다.
- **C2:** 의미·강도·조건·시점·범위·예외·역할·승인·중단·재개·검증·commit을 비교 기준으로 두었다.
- **C3:** 불필요한 반복은 줄이되 역할별 before-action 노출과 필요한 진입점 gate/link는 보존한다.
- **C4:** 문구 리팩토링과 생성 관계를 분리했고, 관리 블록은 generator만 갱신하도록 했다.
- **C5:** 단일 task의 순차 dependency, assertion logic을 유지하는 hash 기대값 갱신, 알려진 baseline/environment 실패 분류, fresh QA, acceptance/commit, final Reviewer 순서를 명시했다.
