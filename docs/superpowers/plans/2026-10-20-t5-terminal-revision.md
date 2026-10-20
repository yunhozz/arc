# T5 종료 범위 수정안: 최종 리뷰 finding 보완

**상태:** 사용자 승인 완료. T5-F 구현·검증·Reviewer 재확인·수락은 미완료.

## 현재 요청과 적용 범위

사용자의 최신 지시에 따라 원 계획의 T6·T7 및 그에 종속된 최종 native 통합 단계를 현재 실행 범위에서 제거한다. 현재 결과는 기존에 수락된 T1–T5와 아래 T5 최종 리뷰 보완(T5-F)으로 끝난다. 사용자 환경 적용은 별도이며, README.md는 어떤 경우에도 수정하지 않는다.

기존 승인 기록과 커밋 이력은 보존한다. 원래 계획의 T6·T7은 이 수정안이 승인되면 현행 작업 범위에서 제거한다. 원래 설계의 구현되지 않은 native 통합을 완료 의무나 보장으로 다시 해석하지 않는다.

**준비 대상:** `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc`

**Branch:** `chore/arc-runtime-gates`

**기준 HEAD:** `e5e381aedd1ed16b19d1f244ed0e15b6b8200172`

**준비 상태:** tracked worktree와 index clean 확인.

## 결과의 경계

- Codex·Claude의 여섯 역할에 대한 공유 정책·상태·Git 검증과 context 주입형 adapter 계약을 유지한다.
- 기존 Claude specialist Bash Git guard 설치 구성을 보존한다.
- native provider가 연결되지 않은 `runtime-gate`를 기본 Claude profile에 설치하지 않는다. Codex도 이를 활성 runtime enforcement로 표시하거나 설치하지 않는다.
- context 없는 직접 runtime 호출은 계속 거부한다. 그 동작은 platform tool 실행을 차단한다는 증거가 아니다.
- 실제 native session·actor·task identity 연결, 자동 도구 차단 및 전역 enforcement는 이번 종료 범위에서 제공하지 않는다.
- `README.md`를 읽기 전용 범위 밖으로 두며 변경 파일·검증 산출물에도 포함하지 않는다.

## T5-F: 최종 review finding 수정

네 건의 P1 finding을 한 최상위 corrective task 및 하나의 집중 구현 커밋으로 처리한다. 수정 task에 fresh Coder를 배정한다. 같은 task의 미수락 재작업에는 범위·대상·소유권 확인 후 동일 Coder를 사용할 수 있다.

### 소유 파일

제품 코드:

- `lib/policy/claude-hook.mjs`
- `lib/models/profiles.mjs`
- `lib/runtime/evaluate.mjs`
- `lib/runtime/gate.mjs`
- `lib/runtime/store.mjs`
- `lib/runtime/schema.mjs`

회귀 검증:

- `tests/node/role-policy.test.mjs`
- `tests/node/profile-render.test.mjs`
- `tests/node/role-git-guard.test.mjs`
- `tests/node/runtime-evaluate.test.mjs`
- `tests/node/runtime-gate.test.mjs`
- `tests/node/runtime-store.test.mjs`
- `tests/node/runtime-schema.test.mjs`
- `tests/node/runtime-git.integration.test.mjs`
- `tests/node/runtime-claude.test.mjs`
- `tests/node/runtime-codex.test.mjs`

생성물:

- generator 관리 대상인 `claude/agents/arc-scouter.md`, `arc-planner.md`, `arc-coder.md`, `arc-qa.md`, `arc-reviewer.md`의 hook 블록
- 변경된 canonical runtime에 대응하는 `codex/skill/runtime/`, `claude/skill/runtime/`
- `MANIFEST.sha256`

생성물은 generator로만 갱신한다. 추가 파일이나 이 범위 밖 변경이 필요하면 구현을 멈추고 Orchestrator에게 반환한다.

### Finding 1: provider 없는 Claude runtime hook 비활성화

- 기본 generated Claude specialist profile은 wildcard `runtime-gate` hook을 등록하지 않고 기존 specialist Bash `role-git-guard`를 유지한다.
- 비관리 hook/frontmatter 및 LF/CRLF 동작을 보존한다. malformed·duplicate managed wiring은 계속 거부한다.
- context가 없는 runtime entrypoint 호출은 기존처럼 거부한다. 이를 통과시키기 위해 adapter 검증을 약화하지 않는다.
- 이미 설치된 사용자 설정은 자동 수정하지 않으며, 설치 복구를 수행했다고 보고하지 않는다.
- 수락: 생성·설치용 profile에 provider 없는 runtime hook이 없고, Bash Git guard의 query 허용·mutation 거부 동작이 유지된다. 정상 tool event를 무조건 거부하는 hook을 기본 설치하지 않는다.

### Finding 2: commit 경로와 docs-only precommit 판정 일치

- task 승인 범위의 절대 경로와 Git descriptor의 repository 상대 경로를 명시적으로 구분한다.
- evaluator와 Git gate가 같은 승인 target을 기준으로 경로를 해석한다. 절대 경로 descriptor, traversal, target 이탈 및 모호한 경로는 거부한다.
- docs-only commit은 승인된 문서, 실제 Git evidence 및 정확한 index 범위를 요구하지만 구현 task의 `accepted` 상태나 구현 acceptance를 요구하지 않는다.
- task commit은 기존의 정확한 acceptance·checks·findings 조건을 유지한다.
- 수락: 구현 acceptance 전의 유효한 docs-only preflight는 허용되고, 문서·구현 혼합 index, 승인 밖 경로, 오래된 parent는 거부된다. 유효한 task commit은 evaluator와 Git gate가 일치된 결과를 낸다.

### Finding 3: reconcile과 schema/store 전이 정합성

- commit record가 schema의 `purpose`, `expectedParent`, `expectedTree`와 관측한 commit 결과를 일관되게 보존한다.
- workflow/repository/worktree/realpath/branch/base identity는 불변으로 둔다. `target.head` 변경은 검증된 commit reconciliation에서만 허용하며 일반 transition으로는 변경할 수 없다.
- 실제 commit, parent, tree, paths, HEAD 및 남은 변경이 모두 preflight와 일치할 때만 reconcile 결과를 원자적으로 저장한다.
- 수락: 유효한 docs/task commit이 preflight → reconcile → store → schema 검증 및 재읽기를 통과한다. stale·불일치·위조 전이와 일반 callback의 target 변경은 거부되고 기존 durable state가 보존된다. 중복 reconcile은 상태를 중복 반영하지 않는다.

### Finding 4: replay 시 현재 권한 재검증

- 같은 request ID·fingerprint의 이전 `allow`를 현재 state·policy 확인 없이 다시 권한으로 반환하지 않는다.
- 현재 lease·task·policy·승인 범위와 필요한 evidence를 재검증한다. 부족하거나 retired 상태면 거부/hold한다.
- 유효한 replay도 전이·commit 같은 외부 작업을 재실행할 권한을 발급하지 않는다. 충돌 거부, 원자성, revision 보호 및 멱등성은 유지한다.
- 수락: allow 후 Coder가 retired되거나 task/policy/승인 범위가 바뀌면 같은 요청은 이전 allow를 재사용할 수 없다. 유효한 동일 요청 replay는 중복 전이·중복 commit 없이 처리된다.

## TDD와 검증

Coder는 각 finding의 회귀 테스트를 먼저 추가하고 실패를 확인한 뒤 최소 수정으로 통과시킨다. 필수 focused checks:

```text
node --test tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/role-git-guard.test.mjs
node --test tests/node/runtime-evaluate.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-schema.test.mjs
node --test tests/node/runtime-claude.test.mjs tests/node/runtime-codex.test.mjs
node --test tests/node/runtime-git.integration.test.mjs
```

Git integration 검증은 Orchestrator가 승인된 임시 repository에서 수행한다. 기존 policy, runtime payload, manifest 검사를 유지하며 생성 payload는 직접 편집하지 않는다. 기존 QA 결과는 보존한다. 이번 단계는 기존 최종 Reviewer finding의 수정 경로이므로, 필수 회귀·Git 통합 검증 후 Coder → Reviewer로 독립 재확인하며 QA를 재배정하지 않는다.

## 수락 및 종료

1. Coder가 RED/GREEN, 변경 경로, 생성물, 한계를 보고한다.
2. Orchestrator가 Git 통합 검증과 기존 필수 검사 증거를 확인한다.
3. 독립 Reviewer가 네 finding과 영향을 받은 전체 변경을 재검토한다. finding은 해결될 때까지 Coder → Reviewer로 반복한다.
4. Orchestrator가 범위·검증·finding·소유권을 대조해 명시적으로 수락한 뒤 T5-F만 집중 커밋하고 SHA·포함 내용·HEAD·남은 변경을 확인한다.

T5-F 외 후속 task를 두지 않는다. provider 부재를 감추거나 custom host/SDK, 역할 추정, 사용자 trust 변경으로 대체하지 않는다. 최종 결과를 실제 native runtime enforcement로 주장하지 않는다. 사용자 환경에 적용하거나 설치 설정을 변경하지 않는다.

이 수정안은 원 계획의 T6·T7 및 그에 종속된 항목을 현행 실행 범위에서 대체한다. 구현 acceptance나 전체 native runtime enforcement 완료를 선언하지 않는다.
