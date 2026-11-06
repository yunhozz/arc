# ARC 계획 커밋 수정과 TDD 우선순위 명확화 실행 계획

| 항목 | 값 |
|---|---|
| 버전 | v2, C6 amendment 승인 (2026-11-05) |
| 저장소 | /Users/ma-24-007/Desktop/workspace/arc |
| 선택 대상 | 현재 checkout, refactor/arc-instructions |
| 기준 HEAD | 1f30101005594a96366a5e0e4b236462211b893b |
| 설계 | Bounded, 대화에서 사용자 승인 완료 (2026-11-05) |
| Spec | 없음. Bounded 작업이며 승인된 설계와 요청으로 범위·제약·결정이 완결되고 별도 제품·아키텍처 결정이 없음 |
| 설계 승인 근거 | 사용자 응답 “승인 (Recommended) — 이 범위와 방식으로 계속 진행” (2026-11-05) |
| 계획 경로 | /Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-11-05-arc-plan-amend-tdd-precedence.md |

## 목표와 범위

ARC 지침에서 실행 중 계획 문서 갱신과 일반적인 amend 금지의 관계를 명확히 하고, 상위 우선순위 지침이 테스트 추가·실행을 금지할 때의 TDD 처리 방법을 명시한다. Codex와 Claude 지침, 공통 Implementer fragment, 기존 기대 fixture 및 패키지 manifest를 한 작업으로 정렬한다.

Superpowers의 TDD·planning·brainstorming 원문과 라이선스·provenance를 수정하지 않는다. ARC 실행 자동화, Git 권한 확대, 설치·배포, 제품 동작 변경, 새 테스트 작성·실행은 범위에 포함하지 않는다.

## 승인 및 시작 조건

사용자는 ARC 지침만 수정하고 Superpowers를 유지하도록 요청했으며, Bounded 설계안을 승인했다. 실행 대상은 현재 checkout으로 선택되었다. 선택된 경로·branch·HEAD·clean 상태는 2026-11-05에 재확인했다.

이 계획의 저장·Orchestrator 검토 후 사용자의 별도 계획 승인을 받아야 구현을 시작한다. 승인된 plan은 구현 전 docs-only commit으로 기록한다. 예상 문서 commit 메시지는 docs(instructions): 계획 수정과 TDD 우선순위 정리다. 그 뒤 최신 branch/HEAD/change state와 문서 SHA를 다시 확인하고, 하나의 fresh Implementer에게 TASK-01 전체를 맡긴다. 작업 도중 계획 변경이 승인되면 영향받는 작업을 멈추고 기존 planning-document commit amendment 절차를 따른다. 별도 docs/fixup commit으로 대체하지 않는다. Push, merge, deploy, publish는 포함하지 않는다.

## 수락 기준

- C1: 공통 amend 금지가 Orchestrator의 기존 실행 시 계획 문서 전용 amendment 절차를 막지 않는다는 점을 분명히 한다. 예외는 기존 승인·안전 조건과 원래 planning-document commit에 한정한다.
- C2: 구현 후속 수정의 원본 구현 commit 금지와 실행 시 계획 문서 amendment 예외를 구별한다. 예외로 일반 history rewrite 권한을 만들지 않는다.
- C3: 테스트 추가·실행을 금지하는 적용 가능한 상위 지침이 있으면 그 지침을 따른다. 우선순위와 적용 범위가 분명한 경우, 그 사실만으로 지침 충돌을 보고하거나 금지 위반 허가를 요청하지 않는다.
- C4: TDD 지침은 금지되지 않은 테스트 작업에 계속 적용한다. 실제 미해결 적용 범위나 필수 검증 문제가 있으면 영향받는 작업·수용만 보류하고, 실행하지 않은 검증을 성공으로 보고하지 않는다.
- C5: Codex·Claude ARC 지침, 공통 fragment 및 기존 기대 fixture가 의미와 생성 결과 측면에서 일치한다.
- C6: Superpowers 원문과 정책·provenance·license, agent template, role-policy 원본은 변경하지 않는다.
- C6a: 원 TASK-01에서 테스트 코드, assertion 또는 test case를 추가·수정하지 않는다. 전체 diff와 변경 경로로 확인한다. 기존 기대 fixture의 데이터 갱신은 테스트 코드 변경과 구분한다.
- C6b: 원 TASK-01 기간에 테스트를 실행하지 않았다는 사실은 Implementer 보고·명령 기록에 근거한다. Prompt-only 환경은 모든 외부 실행을 독립 감사하지 못하므로, 이를 독립 검증됨으로 표시하지 않고 한계로 기록한다. 이 한계만으로 기준을 unmet 처리하지 않는다. Runtime 회귀 테스트는 별도 runtime task의 증거로만 취급한다.

## 단일 작업

| ID | 목표·소유권 | 선행 조건 | 수락 전 증거 | Hold 조건 |
|---|---|---|---|---|
| TASK-01 — ARC amend 예외와 TDD 우선순위 정렬 | Fresh Implementer 한 명이 지정된 ARC 지침, 공통 fragment, 기존 기대 fixture와 manifest를 함께 수정한다. 변경은 하나의 불가분 계약이다. | 이 계획 승인, 승인된 plan의 docs-only commit, 최신 common handoff gate와 명확한 파일 소유권 | C1–C6별 정적 의미 검토, fixture 기대값의 실제 산출 근거, manifest 검사, fresh QA 및 필요한 재검사 | 승인·경로·HEAD·소유권 불일치, 예상 밖 변경, 기존 방식으로 산출할 수 없는 필수 해시, 구조 검사 실패 또는 미해결 기준 |

## 파일 소유권

모든 경로는 선택된 저장소 기준이다.

**Implementer 편집 대상**

- codex/skill/SKILL.md
- claude/skill/SKILL.md
- codex/skill/references/commit.md
- claude/skill/references/commit.md
- codex/skill/references/coordination.md
- claude/skill/references/coordination.md
- codex/skill/references/handoff.md
- claude/skill/references/handoff.md
- lib/prompts/agent-fragments.json
- tests/node/fixtures/instruction-contracts.json: 영향을 받는 기존 기대 문구와 agentProfileBaseline.profiles hash 값만 갱신
- MANIFEST.sha256: 기존 생성기로만 갱신

**검증만 하는 보호 대상**

- lib/policy/role-policy.json 및 그 생성 출력. 기존 planning.plan-amend 정책이 이미 제한된 원래 계획 commit 갱신 절차를 제공한다.
- codex/skill/references/test-driven-development.md, claude/skill/references/test-driven-development.md, brainstorming.md, writing-plans.md, writing-good-tests.md, superpowers-provenance.json, superpowers-LICENSE의 양 플랫폼 사본
- codex/agents/arc-implementer.toml, claude/agents/arc-implementer.md 및 모든 agent template
- 설치기·runtime·다른 정책·테스트 assertion과 test case

위 보호 대상이 변경되거나 추가 파일이 필요해지면 해당 변경을 보류하고 Orchestrator가 범위·승인·영향을 재평가한다.

## 실행 순서

1. **기준선을 기록한다.** 실제 절대 경로, branch/HEAD, staged·unstaged·untracked 상태, 승인된 plan 버전, 파일 소유권을 확인한다. 승인된 plan 및 지정된 ARC 지침 외의 기존 변경은 보존한다.
2. **계획 amend 예외를 좁게 연결한다.** 양 플랫폼 SKILL.md와 common.preservation-choice-inspection fragment에 일반적인 amend 금지가 기존 plan-updates-during-execution 계약을 무효화하지 않도록 명시한다. 양 플랫폼 commit.md는 후속 구현 수정의 원본 commit 금지와 Orchestrator 전용 계획 문서 amendment를 구별한다. 기존 plan-amend, safe-history, approval chronology, recovery, SHA mapping, no-force-push 및 no-fallback 조건을 그대로 유지한다.
3. **TDD 우선순위와 hold 범위를 명확히 한다.** 양 플랫폼 coordination.md와 handoff.md, implementer.execution-steps fragment를 같은 의미로 갱신한다. 상위 지침이 금지한 테스트 행위는 수행하지 않고, 이미 결정된 우선순위를 사용자에게 재질문하거나 금지 위반 허가를 구하지 않는다. 허용된 TDD와 검증은 유지한다. 실제 우선순위·적용 범위가 불분명하거나 필수 검증을 완료할 수 없을 때는 영향받는 작업과 수용만 보류하고 근거를 기록한다.
4. **기존 기대 데이터를 정렬한다.** tests/node/fixtures/instruction-contracts.json의 변경된 ARC 절 기대 문구를 갱신하고, 변경된 공통 fragment를 반영하는 기존 profile의 SHA-256 값만 실제 렌더 결과에서 계산해 갱신한다. 해시를 추정하거나 예전 값에서 수작업 변형하지 않는다. Assertion·test case·baseline revision은 수정하지 않는다. 실제 렌더 값을 비테스트 방식으로 확인할 수 없으면 관련 fixture와 C5 수용을 보류한다.
5. **manifest를 갱신한다.** 승인된 패키지 파일 변경이 끝난 뒤 저장소 루트에서 node scripts/update-manifest.mjs를 실행한다. 이는 기존 manifest 생성기 사용이며 테스트 실행이 아니다. 예상 밖 파일·부분 결과가 생기면 자동 재시도하지 않고 중단한다.
6. **Implementer가 증거와 제한을 보고한다.** 변경 파일, C1–C6별 근거, 실제 profile hash 산출 근거, manifest 변경, 미실행 테스트와 남은 hold를 기록한다. Git 변경과 acceptance는 수행하지 않는다.

## 비테스트 검증 및 QA

변경은 공유 역할·행동 계약에 영향을 주므로 fresh QA를 배정한다. QA는 테스트를 실행하지 않고 다음을 독립 확인한다.

- 전체 diff가 지정된 파일 범위에 한정되고 Superpowers·보호 대상이 불변인지 확인한다.
- 양 플랫폼의 대응 지침과 common fragment가 C1–C4를 같은 의미로 표현하는지 검토한다.
- 기존 fixture가 ARC 문구와 실제 렌더 결과의 SHA-256에 맞는지 확인한다.
- git diff --check 및 node scripts/update-manifest.mjs --check를 실행하고 결과를 기록한다.
- C1–C6별 proven, unmet, unverified 판정과 근거·한계를 보고한다.

테스트를 실행하지 않았다는 사실은 숨기지 않는다. 이 구조 검사는 문구·fixture·manifest 정합성만 확인하며, live agent 준수나 실행 시 TDD 성능을 증명하지 않는다. QA finding은 동일 Implementer에게 수정 요청하고 해당 QA가 무효화된 검사를 재확인한다.

## 수락, commit 및 최종 Reviewer

Orchestrator는 필수 비테스트 QA와 재검사, C1–C6의 결과 및 미해결 finding을 검토한 뒤 TASK-01을 수락한다. 수락 후 지정된 파일만 stage하여 하나의 focused 구현 commit을 만든다.

예상 구현 commit 메시지: fix(instructions): 계획 commit 수정과 TDD 우선순위 명확화

TASK-01 수락과 구현 commit 후 독립 Reviewer가 최종 전체 diff를 검토한다. Reviewer는 amend 예외가 구현 commit·공유 또는 공개 이력으로 확장되지 않았는지, 지침 우선순위가 허용된 TDD를 약화하지 않았는지, Codex·Claude 및 fixture·manifest가 일치하는지 확인한다. Reviewer는 테스트를 실행하지 않으며 acceptance도 결정하지 않는다.

최종 Reviewer finding이 있으면 연결된 후속 task와 필요한 승인을 먼저 기록한다. 수정은 미커밋 상태로 두고 Reviewer가 최종 diff를 다시 확인한 뒤 Orchestrator가 해당 후속 task를 수락하고 focused commit을 만든다. 다른 원본 commit을 amend하거나 기존 task 경계를 합치지 않는다.

## 보류 조건과 제외 범위

대상·branch·HEAD·승인·소유권 불일치, 예기치 않은 변경, 실패 또는 부분 완료, 실제 산출을 확인할 수 없는 필수 fixture hash, QA finding, 미해결 필수 기준은 영향받는 작업을 보류한다. 무관한 승인 작업은 확인된 authority·input·owner·gate에 따라 독립 진행할 수 있다.

테스트 작성·실행, Superpowers 변경, role-policy 변경, agent template 변경, runtime·installer 동작 변경, 신규 Git 자동화, 설치·배포·push·merge 및 실행 시 준수 보장은 범위 밖이다.

## 계획 자체 검토

- 사용자 요청의 두 문제와 Superpowers 불변 제약을 C1–C6에 연결했다.
- 단일 불가분 task에 Codex·Claude 문서, 공통 fragment, 기존 기대 fixture와 manifest를 묶었다.
- 기존 plan-amend 및 Git 안전 절차를 유지하고 일반 amend 금지를 넓히지 않았다.
- TDD 금지 행위의 우선순위 처리를 ARC waiver와 구별하고, 미해결 검증만 영향 범위에 따라 보류한다.
- 테스트를 추가하거나 실행하지 않으며, 수락 전 QA와 최종 독립 Reviewer를 분리했다.
- 별도 written spec이 필요하지 않은 Bounded 작업임을 기록했다.
- 계획 초안을 저장·검토한 뒤 사용자 승인 전까지 구현을 시작하지 않는다.
