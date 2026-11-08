# ARC 하네스 재발 방지 실행 계획

- **범위** Bounded 실행 계획 한 건. ARC의 계획 문서 갱신과 최종 전체 Reviewer 수정 경계를 명확히 하고, 이번 TUI 전체 흐름 작업의 후속 계획 문서 커밋을 최초 계획 문서 커밋에 통합합니다.
- **대상** 사용자가 선택한 관리형 worktree `/Users/yunho/.codex/worktrees/tui-preset-version-flow/arc`, branch `feat/tui-preset-version-flow`. 조사 기준 HEAD `c1c0e42e2a6b2225697f19dd2c47984dab966076`, clean. 동일 이름의 원격 branch는 조회되지 않았습니다. 변경 직전에 모든 상태와 공유 여부를 다시 확인합니다.
- **제약** 테스트 작성·실행, 실제 TUI 및 설치 작업, push/deploy는 하지 않습니다. 생성 정책 parity, Git 이력, 변경 파일 manifest를 정적으로 대조합니다.

## 확인한 문제와 증거 범위

- 최초 전체 흐름 계획 커밋 `4dc522e` 뒤에 같은 설계·계획 문서를 갱신하는 별도 문서 커밋 `1813855`, `179623b`, `98094af`, `c1c0e42`가 네 번 생겼습니다. ARC의 계획 문서 갱신 절차는 원래 계획 커밋에 amend하고 별도 docs/fixup 커밋을 만들지 않도록 이미 정하고 있었습니다.
- ARC의 상세 규칙은 최종 전체 Reviewer 지적을 `Implementer → Reviewer`로 재검토하고, 그 단계에서 QA에 재할당하지 말라고 정하고 있습니다. 그러나 상위 SKILL의 일반 문구는 same-task 재검토 기본값에 QA를 포함하고, 계획 amend도 “금지되지 않는다”는 표현으로만 소개합니다. 이 불일치는 절차를 단계마다 다시 해석하게 만들 수 있습니다.
- 저장된 handoff와 계획서는 최종 Reviewer 및 QA 검토가 있었다는 사실을 기록하지만, 이전 대화의 agent dispatch trace가 없어 각 QA 배정의 정확한 시점을 확인할 수는 없습니다. 따라서 이 계획은 확인되지 않은 개별 배정을 단정하지 않고, 상위 지침의 충돌 가능성을 제거합니다.

## H0. 기존 TUI 계획 문서 커밋 통합

**담당** Orchestrator. 이 계획을 승인받고 최초 계획 커밋으로 기록한 뒤, 하네스 구현을 인계하기 전에 수행합니다.

1. branch/HEAD/index/worktree, 다른 worktree와 작성자 상태, remote/local 참조, ancestry, merge 여부, 공개·공유 여부, 문서 소유권을 다시 확인합니다. 현재 remote branch가 없다는 사실 하나만으로 비공개·비공유를 추정하지 않습니다. 예상 밖의 변경이나 불명확한 공유 여부가 있으면 재작성을 중단합니다.
2. 재작성 전 HEAD와 원본 문서 객체를 복구 참조 및 SHA-256으로 보존합니다. `4dc522e`의 승인 시점, 네 문서 변경의 승인·수정 시점, 당시 문서 버전은 기존 handoff·계획 기록과 연결합니다.
3. `4dc522e`의 두 계획 문서에 이전 TUI HEAD `c1c0e42`의 최종 내용을 반영해 최초 계획 커밋을 amend합니다. `1813855`, `179623b`, `98094af`, `c1c0e42`의 문서 변경은 이 amend에 흡수합니다. 이후 `28ecb54`, `b085454`, `873f6bf`의 구현/manifest 커밋과 이 계획의 최초 커밋을 순서대로 재적용합니다. 기존 별도 task 계획 커밋 `4b91a4e` 및 코드 커밋의 내용은 보존합니다.

   - `docs/superpowers/plans/2026-11-08-tui-overall-flow.md`
   - `docs/superpowers/specs/2026-11-08-tui-overall-flow-design.md`

4. 재작성 후 두 문서가 이전 TUI HEAD의 bytes와 같은지, 네 후속 docs 커밋이 현재 이력에서 제거됐는지, 구현 커밋들의 diff/path 순서가 보존됐는지 확인합니다. old→new SHA 매핑, 제거된 문서 커밋과 통합 대상, 승인 연혁, 복구 참조를 기존 TUI handoff에 기록합니다. 기존 검사 증거를 새 HEAD에서 실행한 것처럼 바꾸지 않습니다.

**통과 기준:** 수정된 원래 계획 커밋에 최종 설계·계획 문서가 모두 있고, 네 후속 docs 커밋은 현재 branch 이력에 없으며, 구현 커밋의 변경 내용이 그대로 재생됐고, 복구 자료와 SHA 매핑이 남아 있습니다. merge, 공개·공유·소유권 불명, 예상 밖의 Git 상태, 재적용 충돌이 있으면 중단하고 실제 상태만 기록합니다. force push나 별도 docs/fixup 커밋으로 대체하지 않습니다.

## H1. ARC 상위 규칙과 산출물 보강

**담당** Implementer가 정책 한 작업으로 편집합니다. Orchestrator는 Git 이력, 수용, 커밋을 담당합니다.

- `lib/policy/role-policy.json`을 원본으로 수정합니다. `scripts/update-role-policy.mjs`는 Codex/Claude의 관리 정책 구간을 생성하고, `scripts/update-runtime-assets.mjs`는 양 플랫폼의 runtime policy 사본을 포함한 runtime payload를 생성합니다. 각각의 생성기를 사용하고 생성 관리 구간·runtime 사본을 직접 편집하지 않습니다.
- 상위 `codex/skill/SKILL.md`와 `claude/skill/SKILL.md`에서 승인된 실행 중 spec/plan 진행 기록 및 계약 변경은 최초 계획 문서 커밋에 amend해야 한다고 직접 명령합니다. 별도 docs/fixup 커밋은 금지하고, 실제 승인 연혁·복구 가능한 구/신 내용·hash와 old→new SHA 매핑을 보존하며, unpublished/unshared local linear history·무 merge·명확한 소유권·안전한 경계 조건을 입증하지 못하면 멈춥니다. 이 예외가 일반적인 history rewrite 권한이 아님을 함께 씁니다.
- 상위 지침과 `review.final-plan-recheck`에 단계 경계를 명시합니다. 필요한 QA와 QA finding 재검토는 최초 final overall Reviewer 시작 전에 완료합니다. 그 뒤 final overall Reviewer가 제기한 모든 finding(동작 finding 포함)은 수정 미커밋 상태에서 `Implementer → Reviewer`로 해소하며 QA에 재할당하지 않습니다. 별도의 QA finding은 기존대로 `Implementer → QA`로 처리합니다. 해결 후 Orchestrator가 한 개의 focused follow-up commit을 만듭니다.
- `docs/harness-operation.md`의 요약 절차도 source policy 및 두 SKILL과 같은 적용 시점을 명시합니다. 변경한 보호 파일에 맞춰 `MANIFEST.sha256`만 갱신합니다.

**수용 기준과 증거:** 정책 source/output과 양 플랫폼의 핵심 규칙이 동일하고, 정책 ID 및 검토 경로 배열은 의도치 않게 바뀌지 않습니다. `node scripts/update-role-policy.mjs --check`, `node scripts/update-runtime-assets.mjs --check`, `git diff --check`, 전체 manifest 대상 hash 비교가 통과합니다. QA는 파일/줄 단위로 정적 근거와 한계를 보고합니다. 이 검사들은 실제 agent 준수나 설치·TUI runtime을 증명하지 않습니다.

## 최종 수용과 Review

QA는 H1 diff의 정책 source/generated parity, 문서 내용, manifest만 읽기 전용으로 확인합니다. Orchestrator는 QA가 완료된 뒤 H0 보존 증거와 H1 결과를 수용해 한 개의 정책 변경 커밋을 만듭니다. 그런 다음 독립 Reviewer가 전체 변경을 한 번 검토합니다. 최종 Reviewer finding이 있으면 Implementer의 수정은 미커밋 상태로 두고 `Implementer → Reviewer`만 반복합니다. 해당 loop에는 QA를 재배정하지 않습니다. 별도 QA finding이 생겼을 때만 `Implementer → QA` 절차를 사용합니다.
