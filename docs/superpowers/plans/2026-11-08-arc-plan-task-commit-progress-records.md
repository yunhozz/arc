# 작업 진행 기록의 구현 커밋 포함 정책 구현 계획

> **ARC 실행 안내:** Orchestrator는 이 계획의 task readiness, Implementer handoff, QA·Reviewer 순서, acceptance 및 Git 변경을 ARC에 따라 관리한다. Implementer는 할당된 변경만 수행하며 Git을 변경하지 않는다.

**목표:** Task가 끝난 뒤 Orchestrator가 계획 문서에 남기는 해당 Task의 진행 기록을 그 Task의 구현물과 같은 커밋에 포함한다.

**접근:** canonical 정책에서 task 진행 기록과 spec/plan 본문 변경의 커밋 경로를 구분한다. Codex·Claude의 직접 작성 지침을 같은 의미로 맞추고, 기존 생성기로 managed projection, runtime 정책 사본 및 보호 파일 manifest를 갱신한다.

**기술:** Markdown, JSON, 기존 Node.js 정책·runtime·manifest 생성기.

**Spec:** 별도 spec 없음. 구체적인 범위와 결과는 사용자 요청 및 [canonical handoff](/Users/yunho/Desktop/project/arc/.git/arc/handoff/2026-11-08-arc-plan-task-commit-progress-records.md)에 기록했다.

## 전역 제약

- Workspace는 `/Users/yunho/.codex/worktrees/4fff/arc`, branch는 `chore/plan-checkbox-commit-policy`다.
- 작업 완료 기록과 계약 내용 변경의 경로를 구분한다.

  | 변경 유형 | 커밋 경로 |
  |---|---|
  | 구현 도중 체크나 메모 등 단순 진행 기록이 아닌 spec/plan 내용 수정 | 기존 승인·준비 절차를 거친 후 최초 spec/plan 커밋을 amend한다. 실제 변경 시점과 승인 연대기를 보존하고, 승인되지 않은 변경은 먼저 보류한다. |
  | Task 종료 후 Orchestrator가 남기는 해당 Task의 진행 상황 기록(체크 표시, 메모, 결과, 증거 등) | 수락된 해당 Task의 구현물과 한 개의 집중된 task 커밋에 포함한다. 이 기록만으로 최초 spec/plan 커밋을 amend하거나 별도 docs/fixup 커밋을 만들지 않는다. |

- 구현 기준·필수 확인·findings가 충족되고 Orchestrator가 수락한 후 해당 Task를 커밋한다. Task 기록만 staging하고 구현물을 분리하지 않는다. 다른 Task의 기록과 무관한 변경은 포함하지 않는다.
- accepted no-change는 기존처럼 기록만 하고 빈 커밋을 만들지 않는다.
- spec/plan 내용 변경의 amendment는 공유·게시·소유권·merge·예기치 않은 상태·replay conflict의 기존 안전 검사, 중단 및 복구 절차를 유지한다. 구현 커밋을 amend하지 않는다.
- QA는 문서 및 생성물의 의미 일관성을 독립적으로 확인한다. 테스트를 추가하거나 실행하지 않는다.
- 정책 원본과 managed section은 기존 생성기로 갱신한다. `lib/policy/render.mjs`, 생성기 구현과 무관한 파일은 변경하지 않는다.

## 검토 초점

1. 동일 Task의 진행 기록이 그 Task 구현 커밋에 포함되고 최초 spec/plan 커밋 amendment나 별도 docs/fixup 커밋을 요구하지 않는가.
2. 본문 내용 변경은 단순 진행 기록으로 오분류하지 않고, 기존 승인 후 최초 spec/plan 커밋을 amend하는가.
3. 관련 없는 Task 기록·변경이 커밋에 섞이지 않는가.
4. accepted no-change에 빈 커밋을 만들지 않는가.
5. Codex·Claude의 수동 지침, canonical 정책, managed projection 및 runtime 사본이 같은 분류를 설명하는가.

## 깊이 및 의존성

공유 역할·승인·커밋 계약과 양 플랫폼의 생성 지침을 함께 바꾸므로 Bounded 작업이지만 plan이 필요하다. 정책 원본, 직접 작성 지침, 생성물과 manifest를 분리하면 배포되는 규칙이 달라질 수 있어 한 Task로 묶는다. 별도 spec은 필요하지 않다.

초기 계획 문서 승인 및 커밋과 target/handoff 검증이 구현 전제다. 구현 순서는 canonical·수동 지침 수정 → managed projection 생성 → runtime 사본 생성 → manifest 갱신 → 정적 QA → Orchestrator 수락 및 task 커밋이다.

### Task 1: Task 진행 기록의 커밋 경로 통일

**목표:** 진행 기록을 해당 Task의 구현 커밋에 포함하고, 단순 기록이 아닌 spec/plan 본문 변경에는 기존 최초 커밋 amendment 절차를 적용하도록 ARC 지침을 일치시킨다.

**직접 수정 파일:**

- `lib/policy/role-policy.json`
- `codex/skill/SKILL.md`
- `claude/skill/SKILL.md`
- `codex/skill/references/planning.md`
- `claude/skill/references/planning.md`
- `codex/skill/references/commit.md`
- `claude/skill/references/commit.md`
- `codex/skill/references/handoff-prep.md`
- `claude/skill/references/handoff-prep.md`

**생성 파일:**

- `scripts/update-role-policy.mjs`가 처리하는 `lib/policy/render.mjs`의 24개 대상 중 바뀌는 managed block
- `codex/skill/runtime/role-policy.json`
- `claude/skill/runtime/role-policy.json`
- `MANIFEST.sha256`

**생성에 사용하는 기존 스크립트:**

- `node scripts/update-role-policy.mjs`
- `node scripts/update-runtime-assets.mjs`
- `node scripts/update-manifest.mjs`

**수정하지 않는 파일:** 생성기 구현, 테스트 파일, runtime 구현 코드와 이 정책 변경에 무관한 파일.

**Interfaces:** canonical JSON 정책과 직접 작성된 지침이 두 플랫폼의 generated policy 및 runtime 사본으로 반영된다. 모든 변경은 이 하나의 승인된 Task에 속한다.

- [x] **Step 1: canonical 커밋 규칙 수정**

  `git.orchestrator-accept-commit`은 해당 Task의 수락 이후 Orchestrator가 기록하는 진행·완료 내역이 그 Task의 구현물과 함께 한 개의 집중된 구현 커밋에 들어간다고 명시한다. 그 기록은 해당 Task에만 속하며 다른 Task 기록은 제외한다.

  `planning.plan-amend`는 두 경로를 분리한다. 단순 진행 기록은 최초 spec/plan 커밋 amendment 사유가 아니며, 해당 Task 커밋에 포함한다. 진행 기록이 아닌 spec/plan 내용 수정은 적용되는 승인·준비 절차를 먼저 거치고 기존 최초 커밋 amendment 경로를 따른다. amendment의 chronology, 복구 가능한 내용, SHA mapping 및 안전 검사를 유지한다.

  **예상 결과:** canonical 규칙이 Task 수락·커밋 전제, no-change 처리, task 경계와 현재 amendment 보호 조건을 보존하며 두 커밋 경로를 명확히 구분한다.

- [x] **Step 2: Codex·Claude의 직접 작성 지침 정리**

  양쪽 `SKILL.md`의 `Preservation rule`에서 모든 기계적 진행 기록에 amendment를 요구하는 표현을 제거하고, 실제 내용 수정과 Task 진행 기록의 차이를 반영한다.

  양쪽 `references/planning.md`의 `Plan updates during execution`에서 두 종류를 분리한다. 체크 표시뿐 아니라 Task 종료 시 Orchestrator가 남기는 해당 Task의 메모·결과·증거를 포함한다. 내용 변경은 최초 spec/plan 커밋 amendment 경로에 남긴다.

  양쪽 `references/commit.md`에서 task-owned progress 기록을 그 Task 구현 커밋에 포함하고, 관련 없는 작업 변경은 제외하도록 명시한다. `Execution-time plan document updates`는 실제 spec/plan 내용 수정에 대한 amendment 경로로 한정한다.

  양쪽 `references/handoff-prep.md`의 amendment 절차도 실제 내용 변경에 한정되도록 연결 설명을 조정한다. 안전 검사·중단·복구 절차는 유지한다.

  **예상 결과:** 수동 지침이 두 경우를 같은 의미로 설명하며 managed section과 상충하지 않는다.

- [x] **Step 3: 정책 projection·runtime 사본·manifest 생성**

  Step 1–2 완료 후 workspace root에서 순서대로 실행한다.

  ```bash
  node scripts/update-role-policy.mjs
  node scripts/update-runtime-assets.mjs
  node scripts/update-manifest.mjs
  ```

  생성 실패나 부분 완료 시 실제 변경 상태를 확인하고 의존 작업을 보류한다. 생성물은 직접 편집하거나 자동 재시도하지 않는다.

  **예상 결과:** managed section은 canonical 정책과 일치하고 runtime 정책 사본 두 개는 원본과 일치하며, `MANIFEST.sha256`은 갱신된 보호 파일을 반영한다.

- [x] **Step 4: fresh QA로 정적 일관성 검토**

  QA는 변경 diff에서 검토 초점 1–5와 위 수락 경로에 대한 근거를 파일·section 기준으로 보고하고 각 기준을 `proven`, `unmet`, `unverified`로 분류한다. 테스트는 실행하지 않는다. 다음의 생성물 동기화 및 diff 형식 검사는 테스트 suite 실행이 아니라 정적 검토에 사용한다.

  ```bash
  node scripts/update-role-policy.mjs --check
  node scripts/update-runtime-assets.mjs --check
  node scripts/update-manifest.mjs --check
  git diff --check
  ```

  **예상 결과:** 세 생성기에서 stale/drift가 없고 `git diff --check`에서 오류가 없다. 진행 기록과 내용 수정의 커밋 경로가 canonical·수동·생성 지침에서 일치한다. 테스트 파일 변경이나 실행은 없다.

  QA finding은 현재 Implementer가 수정하고 QA가 필요한 재확인을 한다. 필수 확인이 해결되지 않으면 acceptance를 보류한다.

- [x] **Step 5: Orchestrator 수락 및 한 개의 구현 커밋**

  기준, QA 근거, findings 해결 여부와 변경 범위를 검토해 Task를 수락한다. Orchestrator가 이 Task의 plan 진행 기록을 갱신하고, 해당 Task 구현물과 그 기록만을 함께 stage하여 한 개의 집중된 구현 커밋을 만든다. 다른 Task 기록과 무관한 사용자 변경은 보존한다.

  Task 진행 기록만을 위해 최초 spec/plan 커밋을 amend하거나 별도 docs/fixup 커밋을 만들지 않는다. accepted no-change인 경우 기존 no-change 경로를 따르고 빈 커밋을 만들지 않는다. 커밋 후 SHA·내용·HEAD·잔여 상태를 확인하고 canonical handoff를 갱신한다.

  **Orchestrator Task 1 수락·완료 기록 (2026-11-09 00:08:57 KST):** QA 재확인에서 C1–C5가 모두 proven이고 finding이 없어 Task 1을 수락했다. `update-role-policy.mjs --check`(24 targets), `update-runtime-assets.mjs --check`(46 files), `update-manifest.mjs --check`(215 files), `git diff --check`가 모두 통과했다. 테스트는 추가하거나 실행하지 않았다. 분류: 승인된 Task 1의 task-owned 진행 기록이며 이 체크 표시와 결과를 Task 1 구현 커밋에 포함한다.

#### 수락 기준

- **C1:** 각 Task 종료 후 Orchestrator가 그 Task에 대해 기록한 진행 상황(체크 표시, 메모, 결과, 증거 등)이 해당 Task의 구현 커밋에 포함된다고 명시한다.
- **C2:** 단순 Task 진행 기록만으로 최초 spec/plan 커밋 amendment나 별도 docs/fixup 커밋을 만들지 않는다.
- **C3:** 진행 기록이 아닌 spec/plan 본문 변경은 기존 승인·준비 절차 후 최초 커밋 amendment를 사용하며 기존 안전·연대기·복구 규칙을 보존한다.
- **C4:** 해당 Task 내용만 구현 커밋에 포함하고 무관한 작업은 분리하며 accepted no-change는 빈 커밋을 만들지 않는다.
- **C5:** canonical 정책, 양 플랫폼의 수동 지침·managed projection, runtime 사본 및 manifest의 내용이 일치하고 테스트를 추가하거나 실행하지 않는다.

#### 보류 조건

승인·target·소유권 불일치, 내용 변경과 진행 기록의 분류 불명, 생성 실패/부분 완료, 예상 밖 변경, QA finding 또는 구현 커밋 범위 불명은 영향받는 작업과 acceptance를 보류한다. 예기치 않은 amend 안전 조건은 기존 중단·복구 절차를 따른다.

## 최종 전체 변경 검토

Task 1 acceptance와 필요한 QA 재확인 및 구현 커밋 후 독립 Reviewer가 전체 변경을 검토한다. 검토 범위는 canonical에서 양 플랫폼 projection까지의 의미 일치, 잔여 모순, Task 소유 기록 경계, accepted no-change 및 실제 spec/plan 내용 amendment 안전 절차다. Reviewer는 QA나 task-level acceptance gate를 대체하지 않는다. 최종 plan Reviewer finding은 Implementer → Reviewer로 해결하고, 재확인 중 수정은 미커밋으로 유지한다.

## 검증 한계

정적 문구·생성물 검사는 배포 지침의 구조적 일치를 보여 주며 실제 에이전트의 향후 준수나 history rewrite의 실행 성공을 증명하지 않는다. 이번 변경에서는 테스트를 추가하거나 실행하지 않는다.
