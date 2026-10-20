# Codex·Claude 실행 게이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 실행 역할·배정·검토·커밋에는 ARC 계약을 우선 적용한다. Orchestrator가 조정하고 각 최상위 task에 새 Coder를 배정한다. Reviewer는 매 task에 배정하지 않는다.

**상태:** 사용자 수정안 승인 완료; T4 계약 재검증 진행 중

**저장 경로:** `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc/docs/superpowers/plans/2026-10-20-cross-platform-runtime-gates.md`

**Goal:** 지원되는 Codex·Claude hook 경로에서 역할 정책과 실제 배정·도구·acceptance·커밋 절차를 대조하고 위반 요청을 거부한다.

**Architecture:** canonical policy, 공유 workflow 상태, 순수 검증기를 공통 runtime으로 제공한다. 플랫폼 adapter는 실제 event와 identity를 정규화하고, 지원되는 사전 실행 경계에서 공통 판정을 플랫폼 응답으로 변환한다. 설치·doctor는 생성·설정·신뢰·실행 관측을 구분한다.

**Tech Stack:** Node.js `>=22`, ESM `.mjs`, `node:test`, 기존 installer·safe-fs·policy renderer. 신규 외부 runtime dependency는 추가하지 않는다.

**Spec:** `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc/docs/superpowers/specs/2026-10-20-cross-platform-runtime-gates-design.md`

**승인된 spec SHA-256:** `1ec7446fd59ef141e00474c29c33d6159b6492c95edae78d9eb25f2d8e6fbde6`

## 1. 공통 제약

- Workspace: `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc`.
- Branch: `chore/arc-runtime-gates`.
- 준비 당시 HEAD/base: `0563816bd5df69b887c3ac037f4e21607bc696ef`, clean.
- 전체 승인 spec·plan의 docs-only batch commit은 **첫 Coder 배정 전 별도 선행 조건**이다. 구현 task에 포함하지 않는다.
- 승인된 최상위 task 하나는 Orchestrator의 독립 acceptance와 focused implementation commit 하나에 대응한다.
- 각 최상위 task는 새 Coder identity를 사용한다. 같은 task 수정·재작업에만 기존 Coder를 재사용할 수 있다.
- Coder·QA·Reviewer는 Git 상태를 변경하지 않는다. 임시 repository의 Git 변경을 실행하는 통합 테스트도 Orchestrator가 실행한다.
- 실제 agent 배정 probe는 Orchestrator가 수행한다. QA는 probe 근거를 검사하며 agent를 배정하지 않는다.
- 이 계획의 checks는 검증 요청에 포함된다. 임시 파일은 테스트가 생성한 `os.tmpdir()` 하위 전용 디렉터리에 제한하고 `finally` 또는 `t.after`에서 정리한다.
- 실제 사용자 hook 설정·trust·관리 설정을 변경하는 작업은 자동 수행하지 않는다. 허용된 scratch 환경이 없으면 해당 실환경 probe를 `unknown`으로 남긴다.
- 지원되는 installed/trusted hook 경로만 강제 범위다. 훅 비활성·비신뢰·timeout·skip·specialized path까지 전역 fail-closed로 표시하지 않는다.
- 에이전트가 작성한 boolean이나 역할 인수만으로 사용자 승인·호출 identity를 만들지 않는다.
- 기존 작은 작업 직접 수행·계획 생략 조건을 보존한다. mode 이름만으로 승인·QA·Reviewer 의무를 해제하지 않는다.
- 최종 Reviewer finding 수정은 Coder → Reviewer로 진행한다. 이 단계에서 QA를 재배정하지 않는다.
- push·merge·deploy·publish·외부 메시지는 이 계획에 포함하지 않는다.

실행 시 Coder는 `/Users/ma-24-007/.codex/skills/arc/references/superpowers/test-driven-development/SKILL.md`를 적용한다. 계획 작성에는 `/Users/ma-24-007/.codex/skills/arc/references/superpowers/writing-plans/SKILL.md`를 적용했다.

## 2. Review Focus

| 실패 조건 | 기대 동작 | 소유 task |
|---|---|---|
| 합성 fixture 또는 과거 세션의 receipt | 현재 설치의 실행 확인으로 승격하지 않음 | T1, T6 |
| symlink·다른 worktree·Git 환경 재정의 | 승인 경로·Git 대상 우회 거부 | T2, T3 |
| 사전 허용 후 결과 유실·중복 요청 | 완료로 추정하지 않고 멱등 복구 | T2, T3 |
| 종료된 Coder에게 미지원 follow-up 전달 | 메시지 차단을 주장하지 않고 지원 도구 경계에서 권한 거부 | T4, T7 |
| 설치 후 일부 hook만 활성·신뢰됨 | 플랫폼 전체 성공 대신 경로별 지원 상태 출력 | T5, T6, T7 |

## 3. 파일 구조와 소유권

모든 상대 경로는 위 workspace를 기준으로 한다.

| 경로 | 책임 |
|---|---|
| `lib/runtime/capabilities.mjs` | 플랫폼·도구 경로의 선언된 계약과 관측 근거 분리 |
| `lib/runtime/schema.mjs` | 상태·요청·근거 schema와 버전 검증 |
| `lib/runtime/evaluate.mjs` | 순수 정책 판정 |
| `lib/runtime/store.mjs` | 잠금·revision·원자적 상태 및 journal 기록 |
| `lib/runtime/identity.mjs` | 배정·실제 identity 연결과 task lease |
| `lib/runtime/operations.mjs` | 지원 작업·명령 descriptor 정규화 |
| `lib/runtime/git-query.mjs` | 기존 Git query 분류기의 공유 구현 |
| `lib/runtime/git-evidence.mjs` | 실제 Git 읽기와 문서·index·commit 대조 |
| `lib/runtime/gate.mjs` | 판정·상태 전이·실행 결과 확인 연결 |
| `lib/runtime/adapters/codex.mjs` | Codex event·응답 변환 |
| `lib/runtime/adapters/claude.mjs` | Claude event·응답 변환 |
| `lib/runtime/preflight.mjs` | 설치·신뢰·실행 근거 및 readiness 보고 |
| `lib/installer/runtime-hooks.mjs` | 플랫폼별 설치 자산·설정의 안전한 생성 |
| `lib/cli/runtime.mjs` | runtime 진단 및 명시적 상태 작업 CLI |
| `scripts/probe-runtime-hooks.mjs` | 제한된 canary hook와 probe 근거 요약 |
| `scripts/update-runtime-assets.mjs` | 공유 runtime의 설치 payload 생성·drift 검사 |
| `codex/skill/hooks/runtime-gate.mjs` | Codex 설치 entrypoint |
| `claude/skill/hooks/runtime-gate.mjs` | Claude 설치 entrypoint |
| `codex/skill/runtime/`, `claude/skill/runtime/` | 공유 source에서 생성한 독립 실행 payload |
| `tests/node/runtime-*.test.mjs` | task별 unit·contract·integration 검증 |

설치 payload의 runtime 모듈은 서로 상대 import하고, repository 외부 경로에 의존하지 않는다. 두 플랫폼 payload는 `lib/runtime/`와 canonical policy에서 생성한다. 생성기는 symlink와 예상하지 않은 파일 형식을 거부하고 관리 대상 밖의 파일을 삭제하지 않는다.

각 task는 자신이 변경한 canonical runtime 파일에 대응하는 두 payload 복사본 및 `MANIFEST.sha256`도 소유한다. 생성 파일을 직접 수정하지 않는다.

같은 기존 파일이 여러 task에 등장하는 경우 아래 순서대로만 변경한다. 병렬 편집하지 않는다.

## 4. 공통 인터페이스

다음 이름과 필드를 task 간 계약으로 사용한다. 구현은 `.mjs`와 JSDoc typedef를 사용한다.

```text
validateWorkflowState(value) -> WorkflowState
validateRequest(value) -> NormalizedRequest
validateEvidence(value) -> EvidenceBundle

evaluate(policy, workflowState, normalizedRequest, observedEvidence)
  -> GateDecision

GateDecision:
  decision: allow | deny | hold
  ruleIds: string[]
  reason: string
  requiredEvidence: string[]
  expectedRevision: number
  proposedTransition: object | null
  coverage: object
```

`NormalizedRequest`는 `requestId`, `platform`, `operation`, `actorRef`, `taskId`, `cwd`, `toolName`, 실제 arguments·경로·descriptor를 포함한다. `actorRef`는 플랫폼 event와 배정 기록으로 해석하며 요청의 `role` 문자열을 신뢰하지 않는다.

```text
transactWorkflow({statePath, expectedRevision, requestId, decide})
  -> Promise<{state, decision, replayed}>

registerAgentObservation(state, observation) -> TransitionResult
evaluateCapability({platform, toolName, operation, evidence, sessionRef})
  -> CapabilityResult

readGitEvidence({workspace, expectedTarget, gitRunner})
  -> Promise<GitEvidence>

runGate({platform, input, context, store, evidenceProvider})
  -> Promise<{decision, response, receipt}>
```

상태에는 spec의 필수 영역을 구현한다.

- `schemaVersion`, `workflowId`, `revision`, 정책·runtime·adapter 버전과 해시.
- 대상 realpath·repository/worktree·branch/HEAD.
- 문서·사용자 승인 provenance와 내용 해시.
- 최상위 tasks, 배정, identity, lease.
- checks, findings, acceptance fingerprint.
- 예상·실제 commit과 감사 기록.
- 경로별 capability 및 현재 세션 관측 근거.

task 상태는 최소 `pending`, `assigned`, `rework`, `verification`, `accepted`, `committed`를 구분한다. agent lease는 `active`, `suspended`, `retired`를 구분한다. 다른 task로의 identity 재바인딩과 `retired` identity의 재활성화는 거부한다.

## 5. 의존성과 readiness

```text
문서 전체 승인
  └─ Orchestrator docs-only batch commit
       └─ T1 플랫폼 계약·probe
            └─ T2 공유 상태·정책 검증기
                 └─ T3 Git·근거 게이트
                      └─ T4 Codex adapter
                           └─ T5 Claude adapter
                                └─ T6 설치·preflight·doctor
                                     └─ T7 회귀·통합·parity
                                          └─ 최종 전체 검증·Reviewer
```

adapter의 논리적 공통 선행 조건은 T1–T3이다. 실행은 파일 소유권과 생성물 변경을 직렬화하기 위해 위 순서를 따른다.

각 task 시작 시 Orchestrator는 직전 task의 acceptance·focused commit SHA, 현재 HEAD, 남은 변경과 소유권을 확인한다. 이전 task의 미수락 변경을 다음 task 커밋에 흡수하지 않는다.

### 첫 Coder 배정 전 준비 조건

- [ ] Orchestrator가 저장된 spec의 승인 SHA-256과 사용자 승인 근거를 대조한다.
- [ ] 전체 plan 승인을 확보하고 저장된 plan 내용과 연결한다.
- [ ] spec·plan 두 파일만 포함하는 docs-only batch commit을 만든다.
- [ ] 실제 SHA·parent·tree·문서 blob·남은 변경을 확인한다.
- [ ] T1 Coder에게 대상, 문서 커밋 SHA, 승인 범위와 금지 작업을 전달한다.

이 준비는 구현 task나 T1 커밋에 포함하지 않는다.

---

## T1. 플랫폼 hook 계약과 probe 근거 모델

**구현 목표:** 실제 차단 가능 경로와 관측 전용 경로를 구분하고 이후 runtime이 허위 지원 판정을 만들지 못하게 한다.

**선행 조건:** 승인 문서 docs-only 커밋 완료.

**소유 파일**

- 생성: `lib/runtime/capabilities.mjs`
- 생성: `scripts/probe-runtime-hooks.mjs`
- 생성: `tests/node/runtime-capabilities.test.mjs`
- 생성: `tests/node/runtime-probe.test.mjs`
- 생성: `tests/node/fixtures/runtime/codex-hook-events.json`
- 생성: `tests/node/fixtures/runtime/claude-hook-events.json`
- 수정: `MANIFEST.sha256`

**인터페이스**

- 제공: `evaluateCapability(...)`.
- 제공: `summarizeProbe(receipts, {platform, sessionRef})`.
- 결과는 `supported`, `unsupported`, `unknown`과 근거 출처·플랫폼 버전·session·tool 경로를 포함한다.
- fixture는 항상 synthetic이며 실제 관측으로 승격할 수 없다.

### RED → GREEN

- [ ] `runtime-capabilities.test.mjs`에 다음 실패 테스트를 작성한다.
  - `spawn_agent`의 선언된 `Agent` 매칭과 실제 관측 근거를 구분한다.
  - Codex `SubagentStart`는 `observationOnly: true`이며 시작 차단을 주장하지 않는다.
  - `followup_task`는 확인된 receipt가 없으면 `unknown`이다.
  - specialized path·기존 `write_stdin` 세션은 검증 범위 밖으로 표시한다.
- [ ] `runtime-probe.test.mjs`에 fixture·다른 session·손상 receipt·실패 결과가 `verified deny`가 되지 않는 테스트를 작성한다.
- [ ] 다음 명령으로 의도한 실패를 기록한다.

```bash
node --test tests/node/runtime-capabilities.test.mjs tests/node/runtime-probe.test.mjs
```

- [ ] 최소 capability 모델과 probe 도구를 구현한다.
  - hook mode는 지정된 임시 receipt 위치에 필요한 event 메타데이터만 남기고 canary 요청에 플랫폼의 정상 deny 응답을 반환한다.
  - summary mode는 수집된 근거를 정규화하여 stdout JSON으로 출력한다.
  - prompt 전문·비밀·불필요한 tool arguments는 저장하지 않는다.
- [ ] 같은 명령으로 GREEN을 확인한다.
- [ ] manifest를 재생성하고 검사한다.

```bash
node scripts/update-manifest.mjs
npm run check:manifest
```

**QA와 실제 probe**

fresh QA는 capability·probe 테스트와 합성 근거의 승격 방지를 검사한다.

Orchestrator는 이미 승인·신뢰된 환경 또는 허용된 scratch hook 환경에서 Codex `spawn_agent`, `followup_task`, `SubagentStart`와 Claude의 배정·deny·실패 차단을 확인한다. 현재 사용자 설정을 임의로 변경하지 않는다. 실제 probe가 불가능하면 이유와 `unknown`을 기록한다.

공식 계약 근거:

- https://developers.openai.com/codex/hooks
- https://code.claude.com/docs/en/hooks-guide

**수락 근거**

- RED/GREEN 결과와 synthetic/observed 구분.
- 경로별 capability 보고서.
- 실제 probe가 있으면 tool 미실행·identity 관측 근거.
- 실환경 확인이 없는 경로는 지원 보장을 받지 않았다는 명시.

**보류 조건**

실제 observation을 synthetic으로 대체하거나 `followup_task` 지원을 추정하면 수락 보류. 플랫폼 payload가 문서와 다르면 이후 adapter의 해당 경로 구현을 보류하고 Orchestrator에게 반환한다.

**커밋:** Orchestrator acceptance 후 `feat: define runtime hook capability contracts`.

---

## T2. 공유 schema·상태 저장·순수 정책 검증기

**구현 목표:** 여섯 역할과 작업 생명주기를 플랫폼 독립 상태로 판정한다.

**선행 조건:** T1 acceptance·commit.

**소유 파일**

- 생성: `lib/runtime/schema.mjs`
- 생성: `lib/runtime/evaluate.mjs`
- 생성: `lib/runtime/store.mjs`
- 생성: `lib/runtime/identity.mjs`
- 생성: `lib/runtime/operations.mjs`
- 생성: `scripts/update-runtime-assets.mjs`
- 생성: `tests/node/runtime-schema.test.mjs`
- 생성: `tests/node/runtime-evaluate.test.mjs`
- 생성: `tests/node/runtime-store.test.mjs`
- 생성: `tests/node/runtime-assets.test.mjs`
- 수정: `lib/policy/role-policy.json`
- 수정: `lib/policy/render.mjs`
- 수정: `tests/node/role-policy.test.mjs`
- 생성·갱신: 두 플랫폼의 `skill/runtime/` payload
- 수정: `MANIFEST.sha256`

**인터페이스**

- 제공: 4절의 schema·`evaluate`·`transactWorkflow`·identity 계약.
- canonical policy에 runtime 규칙과 근거 요건을 추가한다. 현재 renderer의 역할 순서·rule ID·review route 검증은 보존한다.
- 아직 설치되지 않은 adapter를 활성 강제로 설명하도록 기존 문구를 변경하지 않는다.

### RED → GREEN

- [ ] schema 테스트에서 잘못된 버전·역할·대상·요청 종류·불완전 승인 provenance를 거부한다.
- [ ] 여섯 역할의 허용·금지·근거 부족을 독립 기대값으로 작성한다.
  - Planner 저장·checks 거부.
  - Scouter 운영 조회·설치 거부.
  - Coder Git·독립 QA·acceptance 거부.
  - QA 제품 수정·Git 거부, 승인 임시 산출물 허용.
  - Reviewer QA 실행·수정·acceptance 거부.
  - Orchestrator만 근거를 갖춘 acceptance·Git 요청 허용.
- [ ] 문서 승인만 있고 docs commit이 없으면 최초 Coder 배정을 보류하는 테스트를 작성한다.
- [ ] T1 identity를 T2로 재바인딩하거나 retired lease를 되살리는 요청을 거부한다.
- [ ] 상태 저장 테스트에 stale revision·중복 request·잠금 충돌·중간 쓰기 실패·재시작을 추가한다.
- [ ] 작은 작업·계획 생략 mode가 부적합 근거로 gate를 해제하지 못하는 테스트를 작성한다.
- [ ] RED를 확인한다.

```bash
node --test tests/node/runtime-schema.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-assets.test.mjs
```

- [ ] 순수 판정과 원자적 상태 I/O를 구현한다. 승인·identity는 실제 provenance 참조와 연결하고 self-asserted role을 권한 근거로 사용하지 않는다.
- [ ] runtime payload 생성기를 구현한다. canonical source를 두 플랫폼에 결정적으로 복사하고 `--check`에서 수정 없이 drift를 반환한다.
- [ ] GREEN과 기존 policy 회귀를 확인한다.

```bash
node --test tests/node/runtime-schema.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-assets.test.mjs tests/node/role-policy.test.mjs
node scripts/update-runtime-assets.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:role-policy
node scripts/update-manifest.mjs
npm run check:manifest
```

**QA**

상태가 권한의 기준이 되므로 fresh QA가 위 focused suite와 상태 손상·동시 요청·identity 재바인딩 실패 사례를 확인한다. 실제 Git 변경은 실행하지 않는다.

**수락 근거**

- 모든 역할 판정표 및 각 rule ID의 실패 근거.
- request replay가 중복 전이를 만들지 않는 결과.
- 승인 provenance 확인 불가 시 `hold`.
- runtime 생성물의 동일성·drift 탐지 결과.
- 정책 변경이 기존 review routing을 보존한다는 결과.

**보류 조건**

상태 복구가 권한을 확대하거나, 사용자 승인 진위를 자체 boolean으로 결정하거나, identity가 tool arguments만으로 확정되면 보류한다.

**커밋:** `feat: add shared workflow state and policy evaluator`.

---

## T3. 문서·Git·acceptance 근거 게이트

**구현 목표:** docs-only 선행 커밋과 수락된 task의 focused commit을 실제 Git 객체·index에 대조한다.

**선행 조건:** T2 acceptance·commit.

**소유 파일**

- 생성: `lib/runtime/git-query.mjs`
- 생성: `lib/runtime/git-evidence.mjs`
- 생성: `lib/runtime/gate.mjs`
- 생성: `tests/node/runtime-git-evidence.test.mjs`
- 생성: `tests/node/runtime-gate.test.mjs`
- 생성: `tests/node/runtime-git.integration.test.mjs`
- 갱신: 대응 runtime payload와 `MANIFEST.sha256`

**인터페이스**

- 제공: `readGitEvidence(...)`, `runGate(...)`.
- `GitEvidence`는 repository/worktree identity, HEAD·branch, index tree, staged diff, 문서 blob, commit parent/tree를 포함한다.
- Git 읽기는 고정된 인수 배열과 허용된 read operation으로 실행한다. 별도 index·Git directory·검증 생략 설정을 요청 인수로 주입하지 못하게 한다.
- 사전 허용 기록과 실제 결과 확인을 분리한다.

### RED → GREEN

- [ ] 주입된 `gitRunner`로 문서 누락·hash 변경·다른 worktree·HEAD drift를 거부하는 테스트를 작성한다.
- [ ] docs-only 요청에 구현 파일이 섞이거나 문서 집합이 불완전하면 거부한다.
- [ ] acceptance 없는 task commit, 다른 task·무관한 변경 혼입, 수락 이후 diff 변경을 거부한다.
- [ ] commit 결과 유실·예상 parent/tree 불일치는 완료가 아닌 `hold`로 남기는 테스트를 작성한다.
- [ ] 임시 repository 통합 테스트를 작성하되 Git 변경 실행은 Orchestrator에게 반환한다.
- [ ] Coder는 순수·주입형 RED를 확인한다.

```bash
node --test tests/node/runtime-git-evidence.test.mjs tests/node/runtime-gate.test.mjs
```

- [ ] Orchestrator가 Git 통합 suite의 의도한 RED를 실행·기록한다.

```bash
node --test tests/node/runtime-git.integration.test.mjs
```

- [ ] Git 읽기·문서 대조·acceptance fingerprint·결과 reconciliation을 구현한다.
- [ ] Coder가 순수 suite GREEN을 확인하고 Orchestrator가 Git 통합 GREEN을 실행한다.
- [ ] runtime 자산·manifest를 갱신하고 검사한다.

**QA**

fresh QA는 순수·주입형 suite, Git query parser의 동적 shell·옵션·경로 우회 거부를 확인한다. Orchestrator가 임시 repository suite의 실제 HEAD·tree·SHA 근거를 제공한다.

**수락 근거**

- 잘못된 docs commit과 task commit 요청이 실행 전 거부됨.
- 거부 시 임시 repository의 HEAD 불변.
- 정상 docs-only·task commit의 실제 SHA·parent·tree 확인.
- 결과 불명 상태에서 재커밋·자동 reset을 수행하지 않음.
- Git mutation을 specialist가 실행하지 않았다는 실행 주체 기록.

**보류 조건**

Git 상태를 path 목록만으로 동일하다고 판단하거나, 사후 불일치 탐지를 사전 차단으로 보고하거나, 경쟁 상태에서 확인 없이 완료 처리하면 보류한다.

**커밋:** `feat: gate document and task commits with git evidence`.

---

## T4. Codex adapter와 identity 생명주기

**구현 목표:** 확인된 Codex 경로에서 실제 요청을 공통 검증기로 연결한다.

**선행 조건:** T3 acceptance·commit, T1 Codex 계약·미지원 범위 확인.

**소유 파일**

- 생성: `lib/runtime/adapters/codex.mjs`
- 생성: `codex/skill/hooks/runtime-gate.mjs`
- 생성: `tests/node/runtime-codex.test.mjs`
- 갱신: 대응 runtime payload와 `MANIFEST.sha256`

**인터페이스**

- 제공: `normalizeCodexEvent(input, context)`.
- 제공: `renderCodexDecision(decision)`.
- `PreToolUse`는 지원되는 사전 차단에, `SubagentStart`는 관측·identity 확정에 사용한다.
- `runGate`는 context에서 실제 session·identity를 연결하며 요청의 역할 문자열로 대체하지 않는다.

### RED → GREEN

- [ ] Codex 여섯 역할의 정상·금지 요청을 event fixture로 작성한다.
- [ ] `spawn_agent` 요청이 문서·task·새 identity 조건을 검사하는 테스트를 작성한다.
- [ ] `SubagentStart`에서 시작 차단 성공을 반환하지 않는 테스트를 작성한다.
- [ ] `followup_task` coverage가 `unknown`이면 지원된 배정 차단으로 보고하지 않는 테스트를 작성한다.
- [ ] T1 수락 후 retired agent의 지원 도구 요청이 거부되는 테스트를 작성한다.
- [ ] malformed event·identity 누락·validator 예외가 유효한 명시적 deny 응답이 되는 테스트를 작성한다.
- [ ] 기존 `write_stdin`, specialized path, startup timeout에 전역 보장을 표시하지 않는 테스트를 작성한다.
- [ ] RED를 확인한다.

```bash
node --test tests/node/runtime-codex.test.mjs
```

- [ ] adapter와 stdin/stdout entrypoint를 구현한다. 응답 stream에는 플랫폼이 해석할 JSON만 출력한다.
- [ ] GREEN과 공통 gate 회귀를 확인한다.

```bash
node --test tests/node/runtime-codex.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-capabilities.test.mjs
```

- [ ] runtime 자산·manifest를 갱신하고 검사한다.

**QA**

fresh QA는 응답 shape와 여섯 역할 변환, identity 연결·retirement를 확인한다. 실제 native probe 재확인은 Orchestrator가 승인된 환경에서 수행한다.

**수락 근거**

- 지원되는 `spawn_agent` 사전 거부 계약과 미실행 근거 또는 명시된 실환경 제한.
- `SubagentStart`가 관측으로만 처리됨.
- `followup_task` 지원 여부가 독립적으로 표시됨.
- 훅 실행 이전 실패를 adapter의 fail-closed 성공으로 표현하지 않음.

**보류 조건**

identity 필드가 실제 설치 계약과 연결되지 않거나, follow-up coverage를 추정해야만 기능이 성립하면 해당 경로를 보류한다. 보장을 늘리기 위한 custom host 도입은 범위 변경으로 반환한다.

**커밋:** `feat: add codex runtime gate adapter`.

---

## T5. Claude adapter와 기존 Git guard 통합

**구현 목표:** Claude의 실제 사전 실행 판정과 기존 specialist Git 제한을 같은 정책에 연결한다.

**선행 조건:** T4 acceptance·commit, T1 Claude 계약 확인.

**소유 파일**

- 생성: `lib/runtime/adapters/claude.mjs`
- 생성: `claude/skill/hooks/runtime-gate.mjs`
- 생성: `tests/node/runtime-claude.test.mjs`
- 수정: `claude/skill/hooks/role-git-guard.mjs`
- 수정: `lib/policy/claude-hook.mjs`
- 수정: `tests/node/role-git-guard.test.mjs`
- 수정: `tests/node/role-policy.test.mjs`
- 갱신: generator가 관리하는 `claude/agents/arc-scouter.md`, `arc-planner.md`, `arc-coder.md`, `arc-qa.md`, `arc-reviewer.md`의 hook wiring
- 갱신: 대응 runtime payload와 `MANIFEST.sha256`

**인터페이스**

- 제공: `normalizeClaudeEvent(input, context)`.
- 제공: `renderClaudeDecision(decision)`.
- 기존 guard의 `validateGitPolicy`, `classifyGitCommand`, `evaluateHookEvent`, `runHook` 호환 API는 유지한다.
- Git query 분류는 T3 공유 구현을 사용한다.
- hook 생성기는 지원되는 `onFailure: "block"`을 포함하고 관리 대상 블록만 갱신한다.

### RED → GREEN

- [ ] Claude 여섯 역할의 정상·금지 요청과 실제 `permissionDecision: "deny"` 응답을 테스트한다.
- [ ] 배정·시작 관측·결과 기록의 역할을 구분한다.
- [ ] `onFailure: "block"` 누락·구버전·지원 불명 상태를 readiness 성공으로 취급하지 않는 테스트를 작성한다.
- [ ] 기존 Git guard의 query 허용·mutation 거부·동적 shell 거부 사례를 공유 분류기에서도 보존한다.
- [ ] malformed managed hook·중복 wiring·경로 인코딩·공백 포함 설치 경로 테스트를 추가한다.
- [ ] RED를 확인한다.

```bash
node --test tests/node/runtime-claude.test.mjs tests/node/role-git-guard.test.mjs tests/node/role-policy.test.mjs
```

- [ ] adapter, guard 위임, hook renderer를 구현한다. 기존 비관리 frontmatter·사용자 hook을 덮어쓰지 않는다.
- [ ] policy generator로 관리되는 hook wiring을 갱신한다.
- [ ] 같은 suite GREEN과 생성물 검사를 수행한다.

```bash
npm run update:role-policy
npm run check:role-policy
node scripts/update-runtime-assets.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs
npm run check:manifest
```

**QA**

fresh QA는 Claude 응답 계약·기존 guard 회귀·관리 블록 보존을 확인한다. 실제 hook 오류 시 차단 probe는 Orchestrator가 승인된 환경에서 수행한다.

**수락 근거**

- 정상 deny와 hook 실행 실패 차단을 별도로 구분.
- 지원되는 설정의 `onFailure: "block"` 출력과 적용 확인.
- specialist Git 허용 범위가 넓어지지 않음.
- Orchestrator 포함 모든 역할이 검사 가능한 wiring과 후속 설치 연결 근거.

**보류 조건**

기존 guard의 query 제한을 넓혀야 하거나 설치형 Claude Code에 SDK 권한 기능이 있다고 가정해야 하면 보류한다.

**커밋:** `feat: integrate claude runtime and specialist git gates`.

---

## T6. 설치·preflight·doctor와 운영 진입점

**구현 목표:** runtime을 독립 실행 payload로 설치하고, 실제 지원·활성 여부를 과장하지 않는 진단을 제공한다.

**선행 조건:** T5 acceptance·commit.

**소유 파일**

- 생성: `lib/runtime/preflight.mjs`
- 생성: `lib/installer/runtime-hooks.mjs`
- 생성: `lib/cli/runtime.mjs`
- 생성: `tests/node/runtime-preflight.test.mjs`
- 생성: `tests/node/runtime-install.test.mjs`
- 생성: `tests/node/runtime-cli.test.mjs`
- 수정: `lib/installer/plan.mjs`
- 수정: `lib/installer/uninstall.mjs`
- 수정: `lib/cli/root.mjs`
- 수정: `lib/policy/role-policy.json`
- 수정: `lib/policy/render.mjs`
- 수정: `tests/node/plan.test.mjs`
- 수정: `tests/node/uninstall.test.mjs`
- 수정: `README.md`
- 수정: `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- 수정: 두 플랫폼의 `references/planning.md`, `handoff.md`, `handoff-prep.md`, `commit.md`, `verification.md`
- 갱신: `POLICY_TARGETS`에 해당하는 생성물, runtime payload, `MANIFEST.sha256`

### 제공 CLI

```text
arc runtime doctor --platform <codex|claude> --workspace <absolute> --state <absolute> --json
arc runtime preflight --platform <codex|claude> --workspace <absolute> --state <absolute> --json
arc runtime transition --state <absolute> --request <absolute> --evidence <absolute> --json
```

- doctor는 읽기 전용 진단이다.
- preflight는 필요한 readiness 미충족 시 nonzero를 반환한다.
- transition은 실제 호출 context와 근거가 확인될 때만 상태를 변경한다. `--role`, `--approved` 같은 자체 권한 선언 옵션은 제공하지 않는다.
- 실제 actor context를 확보할 수 없는 transition은 `hold`다.
- 상태 기본 위치를 계산하는 경우 Git common directory 아래 `arc/runtime/<workflowId>/`를 사용하고 repository/worktree identity를 상태에 고정한다. 테스트는 실제 workspace 상태를 만들지 않는다.

### RED → GREEN

- [ ] `Generated`, `Installed`, `Trusted/configured`, `Observed`, `Verified deny`, `Unsupported/unknown`을 분리하는 테스트를 작성한다.
- [ ] 파일 존재만으로 trusted·observed를 반환하지 않고 오래된 session receipt를 재사용하지 않는 테스트를 작성한다.
- [ ] 두 플랫폼 payload에 repository 외부 import가 없고 설치 후 entrypoint가 실행되는 테스트를 작성한다.
- [ ] dry-run·check가 사용자 설정을 변경하지 않는 테스트를 작성한다.
- [ ] Codex trust 미확인·Claude 실패 차단 설정 누락·일부 hook만 활성인 경우 preflight 실패를 검사한다.
- [ ] 설치·제거가 관리 대상 밖의 설정·사용자 hook을 보존하는 테스트를 작성한다.
- [ ] 문서·계획 생략·작은 작업 mode 설명과 실제 판정이 어긋나지 않는 테스트를 작성한다.
- [ ] RED를 확인한다.

```bash
node --test tests/node/runtime-preflight.test.mjs tests/node/runtime-install.test.mjs tests/node/runtime-cli.test.mjs
```

- [ ] 안전한 설치 계획과 CLI dispatch를 구현한다.
  - installer는 설정 생성·설치와 활성·trust를 구분한다.
  - 자동으로 trust하거나 현재 사용자 설정에 probe hook을 활성화하지 않는다.
  - 지원되지 않는 플랫폼 설정은 수동 작업과 미확인 상태를 보고한다.
  - 제거는 생성한 관리 자산·블록만 처리한다.
- [ ] 역할 설명과 운영 references를 공통 runtime 경계에 맞춰 갱신한다. 프롬프트 생성이 enforcement 증거가 아니라는 설명을 포함한다.
- [ ] focused GREEN과 installer 회귀를 확인한다.

```bash
node --test tests/node/runtime-preflight.test.mjs tests/node/runtime-install.test.mjs tests/node/runtime-cli.test.mjs tests/node/plan.test.mjs tests/node/uninstall.test.mjs tests/node/role-policy.test.mjs
npm run update:role-policy
npm run check:role-policy
node scripts/update-runtime-assets.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs
npm run check:manifest
```

**QA**

설치·신뢰 상태 오판과 비관리 설정 손상 위험 때문에 fresh QA가 전용 임시 home에서 설치·진단·제거를 확인한다. 실제 사용자 home을 대상으로 설치하지 않는다.

**수락 근거**

- 두 플랫폼의 독립 설치 payload 동작.
- settings·trust·관측 상태별 진단 JSON과 exit code.
- 누락·구버전·미확인 게이트의 관리 workflow 진입 실패.
- hook 자체가 실행되지 않는 환경을 “전역 차단됨”으로 표현하지 않음.
- 작은 작업·계획 생략 경로에 새 의무를 만들거나 기존 의무를 제거하지 않음.

**보류 조건**

안전한 설정 병합이 불가능하거나 trust 확인을 추정해야 하면 해당 자동 연결을 보류하고 수동 절차를 표시한다. 외부 설정 변경 권한이 필요한 경우 Orchestrator가 별도 범위로 판단한다.

**커밋:** `feat: install runtime gates and report verified readiness`.

---

## T7. 두 사건 회귀·12개 조합·통합 parity

**구현 목표:** 개별 계층을 연결해 실제 절차 위반과 정상 경로를 검증하고 보장 범위를 확정한다.

**선행 조건:** T6 acceptance·commit.

**소유 파일**

- 생성: `tests/node/runtime-roles.test.mjs`
- 생성: `tests/node/runtime-workflow.integration.test.mjs`
- 생성: `tests/node/runtime-parity.test.mjs`
- 수정: `tests/node/parity-check.test.mjs`
- 수정: `tests/test_harness_contract.py`
- 수정: `tests/test_arc_policy.py`
- 수정: `tests/test_claude_payload.py`
- 수정: `tests/node/consumer.test.mjs`
- 수정: `README.md`의 검증 범위·실행 예제
- 수정: `MANIFEST.sha256`

이 task에서 발견한 앞선 task의 제품 코드 결함은 해당 task 재작업으로 반환한다. 다른 task의 구현 변경을 T7 커밋에 혼합하지 않는다.

### RED → GREEN

- [ ] `runtime-roles.test.mjs`에 여섯 역할 × 두 플랫폼 각각 허용·거부·근거 부족·identity 불명 사례를 작성한다.
- [ ] 두 adapter가 같은 의미의 요청에 같은 rule ID와 판정을 반환하는 parity 테스트를 작성한다.
- [ ] R1 통합 시나리오를 작성한다.
  - docs commit 전 최초 Coder 배정 거부.
  - 문서+T1 혼합 docs commit 거부 및 HEAD 불변.
  - 올바른 전체 문서 batch commit 후 배정 허용.
- [ ] R2 통합 시나리오를 작성한다.
  - 같은 task 재작업 허용.
  - T1 수락 후 lease 종료.
  - A의 T2 재바인딩 거부.
  - 미지원 follow-up 메시지 차단을 주장하지 않음.
  - 지원 도구 경계에서 retired A 요청 거부.
  - 새 B의 T2 배정은 선행 commit 확인 후 허용.
- [ ] QA 실패·재검증, 최종 전체 Reviewer, 최종 finding의 Coder → Reviewer 경로를 검사한다.
- [ ] 중단·중복 요청·결과 유실·정책 drift·설치 손상에서 잘못된 성공 전이가 없는지 검사한다.
- [ ] Coder는 Git 변경 없는 suite의 RED/GREEN을 수행한다.

```bash
node --test tests/node/runtime-roles.test.mjs tests/node/runtime-parity.test.mjs
```

- [ ] Orchestrator는 Git 변경을 포함하는 workflow suite의 RED/GREEN을 수행한다.

```bash
node --test tests/node/runtime-workflow.integration.test.mjs
```

- [ ] 기존 Python 구조 검증을 새 runtime 근거와 연결한다. 문구 존재 테스트를 실제 실행 강제 테스트로 명칭 변경하지 않는다.
- [ ] manifest를 갱신하고 검사한다.

**QA**

fresh QA는 12개 조합·parity·설치 결과를 확인한다. Orchestrator는 Git 통합 결과와 실제 배정 probe 근거를 제공한다. QA는 실환경 근거와 fixture 근거의 구분을 확인한다.

**수락 근거**

- 12개 조합별 명시적 결과.
- R1·R2의 거부 근거와 정상 진행 결과.
- mock·임시 Git·실제 native probe의 근거 종류 구분.
- 미지원 경로·플랫폼 버전·환경 제한 목록.
- 기존 policy·payload·consumer 계약의 회귀 없음.

**보류 조건**

테스트 통과를 실환경 hook 활성 증거로 대신하거나, 미지원 follow-up을 강제 범위로 표시하거나, 최종 Reviewer가 이미 수행된 것처럼 상태를 완료 처리하면 보류한다.

**커밋:** `test: verify runtime workflow regressions across platforms`.

## 6. Task acceptance와 커밋 절차

각 task에 다음 절차를 적용한다.

- [ ] Coder가 변경 파일, RED/GREEN 명령·결과, 제한, 남은 finding을 보고한다.
- [ ] 요구되는 fresh QA와 실패 재검증을 완료한다.
- [ ] Orchestrator가 criteria·checks·findings·scope·소유권을 대조하여 task를 명시적으로 수락한다.
- [ ] Orchestrator가 해당 task 파일만 staging하고 focused commit을 만든다.
- [ ] 실제 SHA·포함 내용·HEAD·남은 변경을 확인한다.
- [ ] 다음 task에 새 Coder identity를 배정한다.

추가 사용자 commit 승인은 요청하지 않는다. 위 체크박스는 진행 기록이며 별도 커밋 단위가 아니다. 나중의 최종 검증을 이유로 독립 수락 가능한 task 커밋을 미루지 않는다.

## 7. 최종 전체 검증

이 절차는 T1–T7의 acceptance prerequisites와 구분한다. 각 task에 필요한 검증을 여기로 미루지 않는다.

Orchestrator가 전체 변경 기준으로 다음을 한 번 실행한다. Git 변경을 포함할 수 있으므로 전체 suite 실행 주체는 Orchestrator다.

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

환경 제약으로 실패한 경우 제품 실패와 환경 미충족을 구분하고 원인을 기록한다. 필요한 검증을 생략한 채 통과로 표시하지 않는다.

추가로 다음을 확인한다.

- 승인 문서 batch commit과 각 task focused commit의 SHA·범위.
- 현재 HEAD 및 소유권이 확인된 남은 변경.
- 두 플랫폼의 실제 확인 범위와 미지원·unknown 목록.
- 현재 세션·버전의 hook deny 관측 또는 확인 불가 근거.
- 외부 작업·실제 사용자 trust 변경을 수행하지 않았다는 범위 기록.

그 후 **독립 Reviewer가 최종 전체 변경을 한 번 검토**한다. 검토 대상은 정책·상태·adapter·installer·tests·근거와 문서의 보장 범위다.

최종 Reviewer finding은 담당 Coder 수정 → Reviewer 재확인으로 해결한다. 이 단계에는 QA를 재배정하지 않는다. Orchestrator가 해결 근거를 확인하여 수정 범위의 focused commit을 만들고 최종 acceptance를 결정한다.

## 8. 자체 검토 결과

- spec의 상태·승인 provenance·역할·Git·identity·설치·실패·복구·보장 경계를 T1–T7에 배치했다.
- 두 incident regression은 개별 gate와 최종 통합 양쪽에서 검사한다.
- Codex `spawn_agent`와 `followup_task`를 분리하며, `SubagentStart`를 관측으로만 사용한다.
- Claude 실패 차단 설정과 기존 Git query 제한을 보존한다.
- runtime source와 설치 payload를 같은 생성 경로로 연결한다.
- Git 변경·실제 agent 배정 probe의 실행 주체를 Orchestrator로 제한했다.
- task별 Reviewer를 추가하지 않았고, 최종 전체 Reviewer와 finding 재확인 경로를 분리했다.
- 후속 구현이 필요한 확정되지 않은 아키텍처 결정은 없다. 플랫폼별 실환경 관측은 T1과 설치 진단의 근거 조건으로 남긴다.

**이 계획은 저장 및 사용자 plan 승인 전까지 구현을 시작하지 않는다.**


---

## 계획 수정안: 어댑터 계약과 필수 native 통합의 책임 구분

이 수정안은 사용자 승인 후 §§3–7의 T4·T5·T6·T7 및 최종 검증 기준 중 아래 내용과 충돌하는 부분을 대체한다. 그 밖의 승인된 범위·역할 권한·검증 의무·작업 순서는 유지한다. 이 수정안 자체는 task acceptance나 구현 완료 증거가 아니다.

### T4·T5: 독립적인 어댑터 계약

T4 Codex와 T5 Claude의 수락 범위는 **명시적으로 제공된 검증 context를 소비하는 어댑터 계약**이다. 기존 소유 파일·선행 task·집중 커밋 경계는 유지한다.

각 task는 fresh QA를 통해 다음을 확인한 후 Orchestrator가 수락한다.

- 유효한 context가 있을 때 정상 요청을 허용하고 금지 요청을 거부한다.
- context 누락·위조·불충분 identity에서 지원되는 사전 실행 요청을 거부한다. 모든 요청을 거부하는 구현만으로 충족하지 않는다.
- 여섯 역할의 변환·권한 계약과 해당 플랫폼의 생명주기 계약을 검사한다.
- T4는 `SubagentStart`를 관측으로만 처리하고 retired identity 재사용을 거부한다. T5는 기존 Git guard 제한과 `onFailure: "block"` 생성 계약을 보존한다.
- fixture context 주입, 생성된 설정, context 없는 entrypoint의 거부를 installed/native enforcement 증거로 표시하지 않는다.

T4·T5의 native provider 미연결은 T6가 해결할 필수 통합 hold로 기록한다. 어댑터 자체가 context 없이 허용하거나 identity를 추정하면 해당 T4·T5를 보류한다.

### T6: native provider·entrypoint·설치 통합

T6는 기존 소유 파일에 다음 파일을 추가로 소유한다. 모든 경로는 `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc`를 기준으로 한다.

- 생성: `lib/runtime/native-context.mjs`
- 생성: `lib/runtime/adapters/codex-context.mjs`
- 생성: `lib/runtime/adapters/claude-context.mjs`
- 생성: `tests/node/runtime-context.test.mjs`
- 수정: `codex/skill/hooks/runtime-gate.mjs`
- 수정: `claude/skill/hooks/runtime-gate.mjs`
- 갱신: 위 canonical runtime 변경에 대응하는 `codex/skill/runtime/`, `claude/skill/runtime/` 생성물과 `MANIFEST.sha256`

설치된 두 entrypoint는 고정 resolver를 직접 호출하여 검증된 context를 구성하고 adapter에 전달해야 한다. context를 테스트에서만 주입하거나 stdin만 처리하는 entrypoint를 남기면 T6는 미완료다.

resolver는 다음을 실제로 연결하고 출처·버전·상관관계를 검증한다.

- 설치 identity·runtime/policy 버전, 승인 대상에 결합된 durable state와 canonical policy.
- 사용자 승인 provenance를 포함한 evidence와 실제 Git evidence.
- 현재 session·actor·task 및 request/tool-use 매핑.
- 지원 도구의 전체 인수를 보수적으로 해석하는 `describeTool`.
- spawn 예약과 실제 agent identity를 대조하는 `observeAgent` 및 관측 저장.

stdin의 provider 경로를 import하거나 역할 인수·프롬프트·부모 session ID만으로 specialist identity를 추정하지 않는다. 관측 누락·중복·불일치에서는 lease를 활성화하지 않는다. 필요한 context를 확보하지 못하면 `hold`로 판정하고 지원되는 `PreToolUse`에서 유효한 거부 응답으로 변환한다. 시작 관측 실패를 agent 생성 차단으로 표현하지 않는다.

### T6의 필수 검증과 수락 증거

fresh QA는 전용 임시 home에서 설치된 실제 entrypoint를 실행하여 **이벤트 입력 → 고정 resolver → state/policy/evidence·identity → adapter → 응답·상태 저장**을 검사한다. callback fixture 주입만으로 이 검사를 대신하지 않는다. 기존 focused checks에 `node --test tests/node/runtime-context.test.mjs`를 추가한다.

다음 결과와 근거를 모두 확보해야 한다.

- Codex·Claude 각각 Orchestrator·Scouter·Planner·Coder·QA·Reviewer의 12개 조합별 정상 허용·금지 거부·근거 부족·identity 불명 결과.
- 다른 workspace·stale session·위조 역할·provider 경로·잘못된 request/tool-use 상관관계의 거부.
- spawn 예약·시작 관측·관측 저장·lease 활성화·retirement 및 누락·중복·불일치 처리.
- R1: 필수 승인 문서 커밋 전 Coder 배정과 문서·구현 혼합 커밋을 거부하고 올바른 문서 준비 후 진행을 허용.
- R2: 동일 task 재작업은 허용하고, 수락 후 retired Coder의 다른 task 재바인딩과 지원 도구 사용은 거부하며, 선행 조건을 충족한 fresh Coder는 허용.
- 설치 subprocess 검사와 별도로, 실제 지원 플랫폼 경로에서 현재 세션·버전의 hook 실행·거부 및 identity 연결 관측.
- Codex의 명시적 deny와 hook 시작 실패·timeout·skip을 구분한 결과, Claude의 지원 버전·`onFailure: "block"` 적용 및 실패 차단 결과.

Git 변경·실제 agent 배정·native canary probe는 Orchestrator가 승인된 scratch 환경에서 수행하고 QA는 근거를 검사한다. 실제 사용자 설정이나 trust를 변경하지 않는다.

### T7·최종 완료의 필수 gate

순서는 `T3 → T4 → T5 → T6 → T7 → 최종 전체 검증·Reviewer`로 유지한다. T4·T5 계약 acceptance만으로 T6의 native 연결을 충족하거나 T7을 시작할 수 없다.

고정 provider·실제 entrypoint·필수 evidence 또는 지원되는 session/actor/task identity provenance를 확보하지 못하면 **T6 acceptance·commit, T7 시작·수락 및 전체 완료를 보류한다.** 필수 native 관측이 불가능하거나 그 근거가 무효화된 경우도 동일하다. fixture 통과, 모든 요청 거부, 생성된 설정, 수동 절차 안내, 확인 불가 사유 기록만으로 hold를 해제하지 않는다.

T7은 T6의 연결과 관측 근거를 재사용·대조하여 기존 12개 조합·R1/R2·parity를 확인한다. 최종 전체 검증과 독립 Reviewer review는 유지하며, T6의 필수 통합을 최종 검증으로 미루지 않는다.

custom host·SDK를 도입하거나 존재한다고 가정하지 않는다. 역할 추정·사용자 trust 변경으로 연결 문제를 해결하지 않는다. 미지원 follow-up·기존 shell 입력·specialized path·hook 비활성·시작 실패·timeout·skip까지 차단한다고 주장하지 않는다.

최상위 task마다 별도 Coder identity를 사용한다. 같은 미수락 task의 수정·재작업은 유효한 범위·대상·소유권을 재확인한 뒤 기존 Coder를 재사용할 수 있다. task 수락·집중 커밋은 Orchestrator가 수행하며, 한 task의 미수락 변경을 다음 task에 흡수하지 않는다.
