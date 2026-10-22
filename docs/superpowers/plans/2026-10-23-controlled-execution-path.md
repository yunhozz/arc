# 통제된 협력 실행 경로 구현 계획

> **실행 역할 안내:** ARC의 역할 분담에 따라 top-level task별로 실행한다. 각 task는 fresh Coder → fresh QA → Orchestrator 수용·집중 커밋을 거친다. 모든 task 수용 뒤 독립 Reviewer가 최종 전체 변경을 한 번 검토한다. 체크박스는 진행 기록이며 별도 커밋 단위가 아니다.

**Goal:** 기존 ARC runtime을 재사용하여 세 phase와 아홉 통제 영역의 증거·판정·실행 의도·결과를 연결하는 협력 CLI를 제공한다.

**Architecture:** 동일한 durable workflow 저장 기반에 명시적인 협력 계약을 추가한다. Git·파일 사실은 코드가 관찰하고, 사용자 승인과 native 결과는 Orchestrator의 `operator-attested` 진술로 기록한다. CLI가 native 행동을 실행하거나 호출자의 실제 신원을 인증하지 않는다.

**Tech Stack:** 기존 Node.js ESM, 기존 runtime·CLI·생성 스크립트, Node.js test runner를 사용한다. 제품 runtime은 Git을 읽기 전용으로 관찰한다. 구현의 Git commit과 Git integration fixture·commit을 조작하는 검증은 Orchestrator가 담당한다. 새로운 외부 서비스나 provider 의존성을 추가하지 않는다.

**Spec:** `/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-23-controlled-execution-path-design.md`

**승인된 spec SHA-256:** `c4c1deda71955a577f18571f331660a9c5d027ac581ee86d55634eb54184c03c`

**Plan 저장 대상:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-23-controlled-execution-path.md`

## 1. 전역 제약

- 대상은 `/Users/yunho/Desktop/project/arc`, 브랜치는 `feat/controlled-runtime-execution`이다.
- 준비 시 HEAD는 `1e3a20fe7d04c6d93ba48dcea5af5d426b180177`이다. 계획 초안 작성 전 Orchestrator가 확인한 변경은 승인된 spec의 untracked 파일 한 개였다.
- 사용자 보고 사례와 독립적으로 관찰한 사실을 구별한다.
- `operator-attested`는 독립 검증되지 않은 사람 진술 수준의 출처다. actor·approval reference·agent ID를 인증된 identity/event로 취급하지 않는다.
- 직접 native 호출, 역할 가장, 허위 진술을 기술적으로 막는다고 설명하지 않는다.
- trusted-provider 경로의 검증 조건과 `decision-only`·`nativeVerified:false` 표기를 약화하거나 승격하지 않는다.
- native hook/provider/API/installer 연결, 외부 skill·README 수정, 기존 T6/T7 복원을 포함하지 않는다.
- 기존 승인 기록과 과거 spec/plan 산출물을 수정하지 않는다.
- 이번 CLI는 **Phase 1–3 전체에서 완전한 spec+plan 경로만 opt-in 지원**한다. no-plan과 기타 문서 생략 경로는 기존 ARC 정책을 유지하며 CLI에서는 unsupported로 표시한다.
- 문서 생략 경로에 새 spec/plan 의무를 만들거나 생략 자체를 정책 위반으로 판정하지 않는다. 실제 CLI 지원 추가는 별도 범위 결정과 승인이 필요하다.
- 미지원 mode·행동은 정상 허용 또는 준수 완료로 표시하지 않는다.
- Coder는 배정된 파일을 수정할 수 있다. stage·commit·branch·worktree 등 Git metadata 작업은 수행하지 않으며 Orchestrator가 담당한다.
- QA는 brief에서 승인된 범위의 checks와 임시 산출물만 다룬다. Reviewer는 읽기 전용이다.
- Git integration fixture·commit을 조작하는 검증은 Orchestrator가 수행한다.
- 생성된 runtime·정책·profile은 정본과 생성 경로로만 갱신한다.
- 실제 외부 push·merge·deploy·publish를 수행하지 않는다. 해당 요청·승인·결과의 협력 기록 기능을 검증한다.

## 2. 위험 분류와 검토 초점

이 변경은 shared runtime state·lifecycle, public CLI, provenance·권한 설명, 생성 artifact에 영향을 주므로 significant/high risk다.

| 검토 초점 | 기대 행동 | 소유 task |
|---|---|---|
| linked worktree·symlink·대상 교체 | common directory가 같아도 대상을 혼동하지 않고 경로 탈출을 보류 | T1 |
| 허용 직후 중단·결과 저장 실패 | 실행 여부 불명 유지, 자동 재실행 금지 | T1·T2 |
| 늦은 문서 커밋·기존 Coder 가져오기 | 최초 준수 이력으로 소급 정상화 금지 | T2 |
| check 뒤 변경·같은 파일의 무관 변경 | freshness 또는 수용 근거 무효화, 의미적 판단 한계 표시 | T3·T4 |
| 외부 승인 대상과 실제 결과 불일치 | 완료 처리 금지, intent와 실제 결과 모두 보존 | T5 |

## 3. 공통 CLI와 내부 인터페이스

### 3.1 공개 CLI

기본 형식은 다음과 같다.

```text
arc workflow <command> --cwd <absolute-workspace> --workflow <id>
```

상태 변경 입력은 `--input -`로 stdin의 JSON 한 개를 받는다. 상태 경로, provider context, 실행 callback을 JSON으로 받지 않는다.

| command | 기능 |
|---|---|
| `init` | 실제 대상 확인 후 상태 최초 생성 |
| `record` | 승인·문서·scope·check·finding·review 등의 출처 있는 근거 기록 |
| `prepare` | 지원 행동 판정과 intent 저장 |
| `result` | 요청에 대응하는 결과 기록 |
| `status` | 상태·보장 수준·보류 원인 조회 |
| `reconcile` | 실제 상태 재관찰과 미확정 요청 해결 기록 |

`record`로 lifecycle을 임의 완료시키지 않는다. acceptance 근거 입력과 acceptance 완료 상태 전이를 구별한다.

지원 `prepare` operation은 다음과 같이 추가한다. 모든 operation은 이번 CLI가 지원하는 완전한 spec+plan 경로에 한정한다.

- T2: `assign-agent`
- T3: `check`, `review`
- T4: `accept`, `commit`
- T5: `push`, `merge`, `deploy`, `publish`

출력은 JSON이며 다음 필드를 공통으로 사용한다.

```text
decision, ruleIds, workflowId, taskId, requestId, revision,
coverage, requiredEvidence, nextActions, persisted
```

판정은 `allow|deny|hold`다. 미지원 mode·행동은 `hold`와 별도의 unsupported rule ID로 표시한다. no-plan·문서 생략 mode는 정책 위반이나 문서 작성 요구로 변환하지 않는다.

exit code는 성공적인 조회·기록 또는 durable `allow`가 `0`, `deny`가 `2`, `hold`가 `3`, 입력·저장 실패가 `1`이다.

### 3.2 내부 인터페이스

```text
validateCooperativeState(state) -> state
validateCooperativeCommand(command) -> command

initializeCooperativeWorkflow({
  cwd, workflowId, input
}) -> Promise<CommandResult>

runCooperativeCommand({
  cwd, workflowId, command, input
}) -> Promise<CommandResult>

evaluateCooperative({
  policy, state, request, evidence
}) -> GateDecision

reconcileCooperativeResult({
  state, intent, result, observations
}) -> GateDecision
```

CLI는 위 서비스만 호출한다. 테스트용 observer·storage injection은 코드 수준 의존성이며 CLI 입력에서 역직렬화하지 않는다.

`evaluateCooperative`는 협력 계약임을 명시적으로 검증한다. 기존 provider evaluator의 identity/provenance 조건을 협력 입력으로 통과시키지 않는다. 역할·scope·path·Git의 출처 중립적인 검증은 기존 runtime에서 공통화하여 재사용한다.

### 3.3 상태와 lifecycle

협력 상태 구분자는 다음과 같다.

```text
workflowKind: "cooperative"
contractVersion: 1
```

기존 provider 상태를 자동 변환하지 않는다. 동일 durable transaction 기반을 사용하되 협력 상태와 provider 상태의 validator·판정 계약을 구별한다.

상태 위치는 다음이다.

```text
<observed-git-common-dir>/arc/workflows/<workflow-id>/state.json
```

workflow ID는 `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`만 허용한다. 모든 상위 경로와 상태 파일의 symlink·파일 형식을 확인한다.

상태에는 target, revision, policy/runtime versions, actor 진술·assignment·lease, scope/approval/documents, task/dependency, request/intent/result, check/finding/acceptance/commit, audit와 unresolved condition을 둔다.

intent 상태는 다음을 사용한다.

```text
prepared | succeeded | failed | unknown | mismatch | cancelled
```

`cancelled`는 실행되지 않았음을 확인한 근거가 있을 때만 사용한다. 결과 부재를 취소나 실패로 자동 변환하지 않는다. `deny/hold` 요청은 intent와 구별해 기록한다.

공통 불변식은 다음과 같다.

- 같은 request ID에 다른 fingerprint를 허용하지 않는다.
- 과거 `allow`로 새 부작용을 재허가하지 않는다.
- stale 허용으로 실제 행동이 발생해도 실제 결과를 보존한다.
- 복구가 과거 위반을 정상 준수로 바꾸지 않는다.
- 승인·check·acceptance를 해당 scope·문서·변경 버전에 연결한다.

## 4. 첫 Coder 전 readiness gate

새 CLI가 구현되기 전이므로 기존 ARC 절차로 Orchestrator가 수행한다. 새 기능으로 초기 구현 handoff를 소급 정당화하지 않는다.

- [ ] 승인된 spec의 정확한 버전과 승인 증거를 확인한다.
- [ ] 이 plan을 저장·자체 검토하고 사용자 승인을 받는다.
- [ ] 적용 문서 집합을 spec 한 개와 이 plan 한 개로 확정한다. 추가 필수 문서가 생기면 집합과 승인 상태를 갱신한다.
- [ ] 문서 집합 완성 전에는 문서를 stage하거나 커밋하지 않는다.
- [ ] 모든 문서의 개별 승인 뒤 기존 커밋 여부를 확인하고, 남은 승인 문서를 **하나의 docs-only batch commit**으로 커밋한다.
- [ ] commit의 parent·tree·정확한 문서 경로·문서 내용과 최종 Git 상태를 확인한다.
- [ ] 문서 commit 뒤 HEAD와 작업 트리를 canonical handoff record에 남긴다.
- [ ] task dependency/readiness map을 작성한 뒤 첫 Coder를 배정한다.

canonical handoff record는 다음을 포함한다.

- 준비 대상·branch/HEAD·ownership·문서 commit.
- 승인 문서 경로·버전·승인 증거.
- T1–T5 선행 task, 입력·출력, 소유 파일, 공유 자원.
- task별 QA 경로·필수 증거·ready/held 상태와 이유.
- configured ARC cap과 실제 runtime slot 한도.
- 최초 ready batch와 직렬화 이유.

최초 ready task는 T1뿐이다. 이후 task는 공유 schema·store·CLI·생성 artifact와 계약 의존성이 있어 직렬화한다.

각 task는 fresh Coder와 갱신된 handoff gate를 사용한다. 완료 보고만으로 후속 task를 열지 않는다. 선행 task의 필수 QA, Orchestrator 수용과 집중 commit 검증 또는 accepted no-change 기록이 필요하다.

### 진행 중 plan amendment 재개

실행 중 승인 위임 범위의 좁은 plan amendment를 적용할 때 Orchestrator는 저장된 plan 내용과 SHA-256을 기록하고, scope·plan consistency·docs-only diff를 확인한다. 기존 미수용 변경과 ownership을 보존하고 plan 변경만 docs-only 집중 commit으로 커밋한다.

문서 commit 뒤 실제 HEAD·작업 트리·plan hash·handoff를 재확인한다. T2 fixture 비교 기준은 재작성 대상 이력보다 앞선 stable base `1e3a20fe7d04c6d93ba48dcea5af5d426b180177`로 유지한다. 실행 대상 HEAD와 fixture 비교 기준을 구별해 handoff에 기록한다. 보완된 소유권과 필수 증거를 전달한 fresh Coder로 해당 task의 남은 작업을 재개한다. 기존 부분 구현을 반복하거나 미수용 상태를 소급 수용하지 않는다.

이후 task는 기존 fresh QA → Orchestrator 수용 → task별 집중 commit → 후속 readiness 순서를 유지한다.

## 5. 파일 구조와 생성물

모든 경로는 `/Users/yunho/Desktop/project/arc` 기준이다.

| 파일 | 책임 |
|---|---|
| `lib/cli/workflow.mjs` | workflow command 파싱·입출력 |
| `lib/cli/root.mjs` | public CLI routing |
| `lib/runtime/cooperative-schema.mjs` | 협력 상태·명령 계약 |
| `lib/runtime/cooperative.mjs` | command 서비스·공통 lifecycle |
| `lib/runtime/bootstrap.mjs` | 대상 관찰·초기 생성 |
| `lib/runtime/evaluate.mjs` | 기존 평가 유지·협력 판정 연결 |
| `lib/runtime/store.mjs` | 공통 durable transaction |
| `lib/runtime/scope.mjs` | 출처 중립적인 역할·scope·경로 검증 |
| `lib/runtime/assignment.mjs` | 문서→배정·배정 결과 |
| `lib/runtime/verification.mjs` | check·review·finding freshness |
| `lib/runtime/acceptance.mjs` | Orchestrator 수용 근거 |
| `lib/runtime/external.mjs` | 외부 행동의 협력 승인·결과 |
| `lib/runtime/gate.mjs` | Git preflight·reconcile 공통 검증 |
| `lib/runtime/git-evidence.mjs` | 실제 Git·문서 관찰 |

각 task는 자신의 runtime 변경에 해당하는 다음 산출물을 함께 소유한다.

- `codex/skill/runtime/`의 해당 생성 복사본.
- `claude/skill/runtime/`의 해당 생성 복사본.
- `MANIFEST.sha256`.

다음 생성 작업을 각 task의 한 commit 안에 포함한다.

```text
node scripts/update-runtime-assets.mjs
node scripts/update-manifest.mjs
```

이번 계획은 skill-level managed policy 변경을 필요로 하지 않는다. `codex/skill/SKILL.md`, `claude/skill/SKILL.md`와 생성 profile을 직접 편집 대상으로 지정하지 않는다.

정책 정본은 `lib/policy/role-policy.json`, 렌더러는 `lib/policy/render.mjs`, 생성기는 `scripts/update-role-policy.mjs`다. 예상하지 않은 managed policy 변경이 필요해지면 해당 작업을 보류하고 정본·생성기·관련 test 소유권과 승인을 재정리한다. 생성 파일을 직접 고쳐 해결하지 않는다.

정책 정합성 검사는 변경이 없음을 확인하기 위해 계속 수행한다.

### 협력 runtime 버전과 evaluator fixture 동기화

T2–T5는 `lib/runtime/bootstrap.mjs`의 authoritative cooperative runtime module inventory를 순서 있는 목록으로 관리한다.

| Task | 순서 있는 기대 목록 |
|---|---|
| T2 | `bootstrap.mjs`, `cooperative-schema.mjs`, `cooperative.mjs`, `evaluate.mjs`, `scope.mjs`, `store.mjs`, `git-evidence.mjs`, `assignment.mjs` |
| T3 | T2 목록 뒤에 `verification.mjs` 추가 |
| T4 | T3 목록 뒤에 `acceptance.mjs` 추가 |
| T5 | T4 목록 뒤에 `external.mjs` 추가 |

경로 기준은 canonical 또는 플랫폼 생성 runtime 디렉터리다. 위 순서는 hash 계약의 일부다.

기존 합성 계약은 목록 순서대로 각 파일의 raw Buffer를 읽고, separator·파일명·길이 prefix를 추가하지 않은 `Buffer.concat(runtime)`의 SHA-256을 계산하는 것이다. 이 계약을 정렬·구분자 추가·다른 encoding으로 변경하지 않는다.

bootstrap의 실제 순서 목록은 `Object.freeze([...])`로 생성한 읽기 전용 export `COOPERATIVE_RUNTIME_MODULES`로 제공하고, `cooperativeVersions()`가 같은 목록을 사용한다. 테스트는 `Object.isFrozen(COOPERATIVE_RUNTIME_MODULES) === true`도 확인한다. production 목록은 actual 값으로만 읽으며, expected 값은 task별 독립 literal 배열로 작성한다.

`runtime-versions.test.mjs`는 각 task의 literal expected 목록과 actual inventory의 항목·순서를 비교하고, expected 경로의 실제 raw Buffer만 독립적으로 연결해 runtimeHash를 계산한다. canonical·Codex·Claude runtime 각각에서 독립 계산값과 `cooperativeVersions().runtimeHash`가 일치하는지 확인한다. 새로운 authoritative module이나 helper가 추가되면 해당 task에서 actual inventory와 independent expected 목록을 함께 확장한다. runtime module을 수정하면 bootstrap inventory, 테스트, canonical·생성 복사본과 manifest를 같은 task에서 확인·동기화한다.

evaluator fixture의 허용 변경은 `tests/node/fixtures/instruction-contracts.json`의 `protected` 아래 다음 세 SHA-256 값뿐이다.

- `lib/runtime/evaluate.mjs`
- `codex/skill/runtime/evaluate.mjs`
- `claude/skill/runtime/evaluate.mjs`

세 파일의 실제 바이트 일치와 전체 SHA-256을 확인해 해당 값만 동기화한다. 나머지 fixture 내용은 고정된 task 비교 기준과 동일해야 한다.

비교 기준은 handoff에 full commit OID로 고정한다.

- T2: stable base `1e3a20fe7d04c6d93ba48dcea5af5d426b180177`.
- T3–T5: 각각 직전 accepted focused task의 검증된 commit OID.

T2는 최초 docs commit과 그 descendant의 이력 재작성에 영향을 받지 않는 stable base를 사용한다. Orchestrator의 읽기 전용 비교에서 이 기준과 기존 T2 기준 사이의 fixture 변경은 허용된 evaluator SHA 세 값뿐임을 확인했으므로, 그 세 값을 제외한 deep equality 기준은 동일하다. 실행 대상 HEAD와 fixture 비교 기준을 구별한다. plan amendment commit으로 실행 대상 HEAD가 바뀌어도 fixture 기준은 자동 변경하지 않는다. runtimeHash drift의 기존 stale/hold 의미를 유지한다. 저장된 버전을 자동 갱신하거나 과거 intent·승인을 재허가하지 않으며 migration 구현은 추가하지 않는다.

## 6. 공통 실행·수용 규칙

제품 runtime의 Git 작업은 읽기 전용 관찰이다. 구현 과정에서는 Coder가 배정 파일과 해당 생성물을 수정하고, Orchestrator가 Git metadata 작업과 집중 commit을 수행한다.

QA는 brief에서 승인된 checks와 임시 산출물만 다루며, Reviewer는 읽기 전용으로 검토한다. Git integration fixture·commit을 조작하는 검증은 Orchestrator가 담당한다.

각 task는 다음 순서로 실행한다.

- [ ] 명시된 행동 검증을 작성하고 의미 있는 RED를 확인한다.
- [ ] 최소 구현으로 GREEN을 만든다.
- [ ] focused checks와 생성물 정합성을 확인한다.
- [ ] fresh QA가 최종 변경 상태를 독립 확인한다.
- [ ] Coder가 QA finding·증거 공백을 수정하고 필요한 QA 재확인을 받는다.
- [ ] Orchestrator가 기준별 proven/unmet/unverified를 판정하고 수용한다.
- [ ] Orchestrator가 해당 task만 하나의 집중 implementation commit으로 커밋하고 결과를 확인한다.
- [ ] dependency/readiness record를 갱신한다.

Reviewer는 task별 prerequisite가 아니다.

QA의 임시 파일·fixture 경로와 cleanup owner를 handoff에 명시한다. Git fixture 준비나 Git 변경을 포함한 명령은 Orchestrator가 수행한다. QA는 허용된 읽기 전용 관찰과 비 Git 변경 checks를 수행한다.

특히 T2·T4의 실제 Git integration은 필수다. skip·환경 실패·미실행은 통과로 보지 않으며 해당 task 수용을 보류한다. 실행 주체·대상·명령·결과와 QA의 독립 확인을 구별해 기록한다.

### 6.1 runtime 버전·evaluator fixture 필수 검사

T2–T5의 fresh QA는 기존 필수 checks와 함께 다음을 실행한다.

```text
node --test tests/node/runtime-versions.test.mjs
node --test tests/node/runtime-evaluate.test.mjs
```

runtime-version test의 expected 배열은 현재 task의 누적 목록을 literal로 작성한다. production inventory를 expected 생성에 사용하지 않는다. canonical·Codex·Claude runtime 각각에서 actual inventory와 expected 배열의 순서를 비교하고, expected 경로의 실제 파일을 raw Buffer로 읽는다. 독립 hash 계산은 다음 계약을 따른다.

```text
runtimeBytes = Buffer.concat(expected.map(readRawBuffer))
expectedRuntimeHash = "sha256:" + SHA256(runtimeBytes)
```

SHA256은 소문자 64자리 hex를 반환한다. `expectedRuntimeHash`는 prefix를 포함한 `sha256:<64-hex>` 전체 문자열로 `cooperativeVersions().runtimeHash`와 비교한다. evaluator fixture의 SHA 값은 기존대로 prefix 없는 64자리 hex를 사용한다. separator·파일명·길이 prefix를 추가하지 않는다. 독립 합성 바이트와 runtime hash 입력 바이트가 같아야 한다. `COOPERATIVE_RUNTIME_MODULES`가 `Object.freeze([...])`로 제공되며 `Object.isFrozen(COOPERATIVE_RUNTIME_MODULES) === true`인지 확인한다. runtimeHash mismatch는 기존 stale/hold 및 저장된 버전·과거 허용의 자동 갱신 부재를 유지한다.

fixture 검사는 저장소 루트에서 아래 읽기 전용 명령을 수행한다. 환경변수에는 handoff에 고정된 full commit OID를 넣는다. 아래 값은 T2의 stable base다. T3–T5는 기존 규칙대로 직전 accepted focused task의 검증된 commit OID를 사용한다.

```bash
ARC_EVALUATOR_FIXTURE_BASE=1e3a20fe7d04c6d93ba48dcea5af5d426b180177 node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const base = process.env.ARC_EVALUATOR_FIXTURE_BASE;
assert.match(base ?? '', /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/,
  'handoff에 고정된 full commit OID 필요');
assert.equal(execFileSync(
  'git', ['rev-parse', '--verify', `${base}^{commit}`],
  { encoding: 'utf8' }
).trim(), base, '비교 기준 commit 불일치');

const fixturePath = 'tests/node/fixtures/instruction-contracts.json';
const paths = [
  'lib/runtime/evaluate.mjs',
  'codex/skill/runtime/evaluate.mjs',
  'claude/skill/runtime/evaluate.mjs'
];
const sha256 = bytes =>
  createHash('sha256').update(bytes).digest('hex');

const current = JSON.parse(readFileSync(fixturePath, 'utf8'));
const baseline = JSON.parse(execFileSync(
  'git', ['show', `${base}:${fixturePath}`],
  { encoding: 'utf8' }
));
const canonical = readFileSync(paths[0]);

for (const path of paths) {
  assert.ok(Object.hasOwn(current.protected, path),
    `현재 fixture 항목 누락: ${path}`);
  assert.ok(Object.hasOwn(baseline.protected, path),
    `기준 fixture 항목 누락: ${path}`);
  const bytes = readFileSync(path);
  assert.ok(canonical.equals(bytes),
    `evaluator 바이트 불일치: ${path}`);
  assert.match(current.protected[path], /^[a-f0-9]{64}$/,
    `전체 SHA-256 형식 오류: ${path}`);
  assert.equal(current.protected[path], sha256(bytes),
    `fixture와 실제 SHA-256 불일치: ${path}`);
  console.log(`${path}: ${current.protected[path]}`);
}

for (const path of paths) {
  delete current.protected[path];
  delete baseline.protected[path];
}
assert.deepStrictEqual(current, baseline,
  '허용된 evaluator SHA 세 값 이외의 fixture 변경');

console.log(`fixture 비교 기준: ${base}`);
console.log('PASS: evaluator 바이트·세 SHA·나머지 fixture 불변');
NODE
```

QA는 현재 task의 literal expected 목록, inventory 순서·동결 상태, 독립 runtimeHash 계산 결과, fixture 비교 기준 OID, evaluator 세 SHA와 fixture diff 범위를 기록한다.

기존 `instruction-layout` baseline-failure disposition을 유지한다. 해당 전체 파일 통과를 추가 요구하지 않고 다른 fixture 계약을 변경하지 않는다. evaluator 불일치와 runtimeHash 누락을 기존 baseline 실패로 분류하지 않는다.

## 7. Phase 1

### T1. 협력 상태·저장·복구와 CLI 기반

**목표:** 실제 대상에 묶인 workflow를 안전하게 만들고 증거 기록·상태 조회·미확정 요청 복구를 동일 durable 계약으로 제공한다.

**선행 task:** 없음. 전체 readiness gate 완료가 선행 조건이다.

**소유 파일**

- 생성: `lib/cli/workflow.mjs`
- 생성: `lib/runtime/cooperative-schema.mjs`
- 생성: `lib/runtime/cooperative.mjs`
- 생성: `lib/runtime/bootstrap.mjs`
- 생성: `lib/runtime/scope.mjs`
- 수정: `lib/cli/root.mjs`
- 수정: `lib/runtime/schema.mjs`
- 수정: `lib/runtime/store.mjs`
- 수정: `lib/runtime/evaluate.mjs`
- 테스트 생성: `tests/node/runtime-cooperative.test.mjs`
- 테스트 생성: `tests/node/runtime-cli.test.mjs`
- 테스트 수정: `tests/node/runtime-schema.test.mjs`
- 테스트 수정: `tests/node/runtime-store.test.mjs`
- 테스트 수정: `tests/node/cli.test.mjs`
- 테스트 fixture 수정: `tests/node/fixtures/instruction-contracts.json`의 `protected` 아래 `lib/runtime/evaluate.mjs`, `codex/skill/runtime/evaluate.mjs`, `claude/skill/runtime/evaluate.mjs` 고정 SHA-256 세 항목만 갱신한다. 다른 fixture 내용은 유지한다.
- 공통 runtime 생성물과 `MANIFEST.sha256`

**묶음 근거:** schema·transaction·bootstrap·CLI 출력은 하나의 저장 계약이다. 호환되지 않는 상태나 저장 전 허용을 노출하는 중간 산출물을 피하기 위해 함께 구현한다.

**인터페이스**

- 생산: 3절의 validator·bootstrap·command 서비스.
- 생산: versioned scope·approval·target 기록과 intent/result 기반.
- 소비: 기존 lock·revision·request fingerprint와 재사용 가능한 schema 검증.
- 등록되지 않은 `prepare` operation은 unsupported `hold`다.

**구현 단계**

- [ ] `bootstrapDoesNotOverwrite`, `rejectsSymlinkAndEscapedWorkflowId`, `sameCommonDirDifferentWorktree`, `storeFailureNeverEmitsAllow`를 작성한다.
- [ ] `requestFingerprintConflict`, `staleRevisionHolds`, `unknownResultNeverAutoRetries`, `attestationIsNotPlatformEvent`를 작성한다.
- [ ] 상태 계약·bootstrap을 구현하고 provider 상태의 자동 변환을 거절한다.
- [ ] 기존 transaction 기반에 저장 실패·중단·replay 처리를 연결한다.
- [ ] `init/record/status/reconcile`과 미지원 `prepare/result`의 명시적 보류를 연결한다.
- [ ] 복구에서 불명 요청을 자동 취소하거나 실제 결과를 삭제하지 않도록 한다.
- [ ] 승인된 T1의 canonical `lib/runtime/evaluate.mjs`를 두 플랫폼 runtime에 재생성한다. 세 파일의 바이트 일치를 확인하고, `tests/node/fixtures/instruction-contracts.json`의 해당 세 경로에 대한 고정 SHA-256만 실제 파일의 전체 해시로 갱신한다. 기준선 `632659d` 대비 이 세 SHA 이외의 fixture 내용은 변경하지 않는다. 검사를 삭제·완화하거나 기존 문서·role-policy 계약을 이번 범위에서 수정하지 않는다.
- [ ] 생성물을 갱신하고 fresh QA에 전달한다.

**수용 기준**

- bootstrap이 Git 상태를 바꾸지 않고 실제 대상에 상태를 생성한다.
- 기존 상태·symlink·잘못된 경로를 거절한다.
- actor·승인·결과 진술을 provider 증거로 표시하지 않는다.
- scope·target 변경이 과거 기록을 보존하고 관련 허용을 무효화한다.
- 결과 불명·저장 오류·replay가 자동 실행·허용으로 이어지지 않는다.
- JSON·exit code가 공통 계약과 일치한다.
- canonical과 Codex·Claude의 `evaluate.mjs` 세 파일은 바이트가 일치하고, fixture의 해당 세 고정 SHA-256은 각 실제 파일과 일치한다. 기준선 `632659d` 대비 그 세 SHA 이외의 fixture 내용은 불변이다.
- 아래 evaluator 전용 검사, `runtime-evaluate.test.mjs`, 기존 T1 필수 checks가 통과해야 수용한다. `instruction-layout.test.mjs` 전체 통과는 T1 수용 조건으로 요구하지 않는다. 기존 실패의 제외는 아래 기준선 처리 조건을 충족해야 하며, T1 evaluator 해시 불일치를 기존 실패로 분류하지 않는다.

**필수 checks와 fresh QA 증거**

```text
node --test tests/node/runtime-cooperative.test.mjs tests/node/runtime-cli.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-store.test.mjs tests/node/cli.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/update-manifest.mjs --check
node --test tests/node/runtime-evaluate.test.mjs
```

기대 결과는 test 통과와 생성물 drift 없음이다. QA는 linked worktree·symlink·저장 실패·미확정 결과의 출력과 상태를 확인한다. Git fixture 준비가 필요하면 Orchestrator가 담당한다.

fresh QA는 evaluator 전용 검사 결과, fixture diff 범위, 기준선 제외 사유를 독립 확인한다. 다른 fixture 항목 변경이나 검사 완화가 필요하면 해당 작업을 보류하고 Orchestrator에 보고한다.

T1 evaluator 전용 검사 (저장소 루트에서 실행):

```bash
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const fixturePath = 'tests/node/fixtures/instruction-contracts.json';
const paths = [
  'lib/runtime/evaluate.mjs',
  'codex/skill/runtime/evaluate.mjs',
  'claude/skill/runtime/evaluate.mjs'
];
const sha256 = bytes =>
  createHash('sha256').update(bytes).digest('hex');

const current = JSON.parse(readFileSync(fixturePath, 'utf8'));
const baseline = JSON.parse(execFileSync(
  'git',
  ['show', `632659d:${fixturePath}`],
  { encoding: 'utf8' }
));
const canonical = readFileSync(paths[0]);

for (const path of paths) {
  assert.ok(Object.hasOwn(current.protected, path),
    `현재 fixture 항목 누락: ${path}`);
  assert.ok(Object.hasOwn(baseline.protected, path),
    `기준선 fixture 항목 누락: ${path}`);

  const bytes = readFileSync(path);
  assert.ok(canonical.equals(bytes),
    `evaluator 바이트 불일치: ${path}`);

  const expected = current.protected[path];
  assert.match(expected, /^[a-f0-9]{64}$/,
    `전체 SHA-256 형식 오류: ${path}`);
  assert.equal(expected, sha256(bytes),
    `fixture와 실제 SHA-256 불일치: ${path}`);

  console.log(`${path}: ${expected}`);
}

for (const path of paths) {
  delete current.protected[path];
  delete baseline.protected[path];
}
assert.deepStrictEqual(current, baseline,
  '허용된 evaluator SHA 세 항목 이외의 fixture 변경');

console.log('PASS: 세 evaluator 파일·fixture SHA·나머지 계약 불변');
NODE
```

기준선 실패 처리:

- Orchestrator는 native artifact를 맞춘 기준선 `632659d`의 실행 명령·환경·실제 결과·실패한 테스트 이름과 assertion을 기록한다.
- 기준선에서 재현된 문서 계약 실패와 `claude/skill/runtime/role-policy.json` 고정 해시 불일치는 이번 T1 수정 범위에서 제외한다. 해당 실패를 해결됐거나 전체 suite가 통과했다고 표시하지 않는다.
- #156/#158/#159 번호만으로 실패를 식별하지 않는다. #159는 여러 항목을 검사하므로 먼저 드러난 기존 policy 실패가 evaluator 불일치의 부재를 증명하지 않는다.
- T1의 evaluator 세 파일·fixture SHA는 전용 검사로 별도 proven 판정을 받아야 한다. 전용 검사 실패, 세 SHA 이외의 fixture 변경, 새롭게 발견된 미분류 실패는 수용을 보류한다.
- fresh QA는 전용 검사 결과, fixture diff 범위, 기준선 제외 사유를 독립 확인한다. 기존 실패 제외와 T1 검증 통과를 구별하여 보고한다.

**Hold conditions**

- provider 상태를 조용히 재해석함.
- 기존 CLI·trusted 동작이 회귀함.
- 저장 실패 뒤 성공 출력이 남음.
- 필요한 경로·파일 형식 확인이 불가능함.

**집중 커밋:** `feat(runtime): 협력 워크플로 상태와 CLI 기반 추가`

---

### T2. 승인 문서에서 최초 Coder 배정까지 연결

**목표:** 실제 문서 commit을 확인한 후 최초 배정 intent를 저장하고 native 반환 진술을 같은 요청에 연결한다.

**선행 task:** T1 수용·집중 commit 검증.

**소유 파일**

- 생성: `lib/runtime/assignment.mjs`
- 수정: `lib/runtime/cooperative.mjs`
- 수정: `lib/runtime/cooperative-schema.mjs`
- 수정: `lib/runtime/evaluate.mjs`
- 수정: `lib/runtime/scope.mjs`
- 수정: `lib/runtime/git-evidence.mjs`
- 수정: `lib/cli/workflow.mjs`
- 수정: `codex/skill/references/planning.md`
- 수정: `claude/skill/references/planning.md`
- 수정: `codex/skill/references/handoff.md`
- 수정: `claude/skill/references/handoff.md`
- 테스트 생성: `tests/node/runtime-assignment.test.mjs`
- 테스트 수정: `tests/node/runtime-cli.test.mjs`
- 테스트 수정: `tests/node/runtime-evaluate.test.mjs`
- 테스트 수정: `tests/node/runtime-codex.test.mjs`
- 테스트 수정: `tests/node/runtime-claude.test.mjs`
- 테스트 수정: `tests/node/runtime-git.integration.test.mjs`
- 수정: `lib/runtime/bootstrap.mjs`
- 테스트 fixture 수정: `tests/node/fixtures/instruction-contracts.json`의 canonical·Codex·Claude `evaluate.mjs` 고정 SHA-256 세 값만 동기화
- 테스트 생성: `tests/node/runtime-versions.test.mjs`
- 공통 runtime 생성물과 `MANIFEST.sha256`

`codex/skill/SKILL.md`와 `claude/skill/SKILL.md`는 편집하지 않는다. 필요한 사용 안내는 위 reference에 둔다.

**인터페이스**

```text
prepareCooperativeAssignment({
  policy, state, request, observations
}) -> GateDecision

recordCooperativeAssignmentResult({
  state, intent, result, observations
}) -> GateDecision
```

역할·task·paths·operations·approval version·correlation을 intent와 결과에 연결한다.

**구현 단계**

- [ ] `uncommittedDocumentsHold`, `approvedHashesMustMatchObjectsAndCurrentFiles`, `docsCommitContainsExactSet`을 작성한다.
- [ ] `lateDocsNeverValidateEarlierStart`, `existingAgentHistoryRemainsUnverified`, `unknownDispatchBlocksDuplicateAssignment`를 작성한다.
- [ ] 기존 reader의 실제 Git 관찰을 사용하고 operator 입력의 가짜 Git 사실을 거절한다.
- [ ] 최초 intent에 문서 commit·문서/승인 버전·대상·task·correlation을 저장한다.
- [ ] 배정 결과의 성공·실패·불명·불일치를 구별한다.
- [ ] 대상 drift 후 재관찰·재승인을 요구하고 과거 intent를 유지한다.
- [ ] omission mode는 unsupported로 안내하되 정책 위반이나 문서 작성 의무로 표시하지 않는다. 이 경계가 Phase 2·3에도 유지됨을 안내한다.
- [ ] Codex planning의 실제 runtime-infrastructure 금지에 승인된 저장소 내부 협력 경로의 좁은 예외를 추가한다.
- [ ] Claude planning에는 대응하는 협력 경로·보장 한계 안내를 추가한다. Claude에 기존 동일 금지가 있었던 것으로 설명하지 않는다.
- [ ] 두 플랫폼 handoff에 실제 사용 절차와 직접 호출·신원 가장 한계를 반영한다.
- [ ] T2의 순서 있는 authoritative runtime 목록을 bootstrap inventory와 독립 literal expected 목록에 반영한다. 기존 Buffer 연결 순서·무구분자 SHA-256 계약을 유지한다.
- [ ] canonical과 두 플랫폼 runtime을 재생성하고 manifest를 갱신한다. 각 runtime의 실제 inventory 순서와 expected 파일 바이트 기반 runtimeHash를 독립 검증한다.
- [ ] evaluator 세 파일의 실제 바이트에 맞춰 fixture의 해당 세 전체 SHA-256만 동기화한다. 고정된 T2 비교 기준 대비 나머지 fixture 내용은 유지한다.
- [ ] runtimeHash drift가 기존 stale/hold로 처리되고 자동 상태 갱신·재허가·migration이 추가되지 않았음을 확인한다.
- [ ] §6.1 검사와 기존 필수 증거를 갖춰 fresh QA에 전달한다.

**수용 기준**

- 첫 Coder 배정 전에 정확한 승인 문서 commit과 현재 문서를 직접 확인한다.
- intent 저장 전에 배정 완료·준수 완료를 출력하지 않는다.
- agent ID를 인증된 신원으로 표시하지 않는다.
- 충돌하는 활성 배정·미확정 이전 배정을 보류한다.
- 늦은 commit이나 새 workflow로 과거 위반을 정상화하지 않는다.
- 기존 omission 정책·trusted adapter·과거 승인 산출물을 유지한다. omission의 CLI 지원은 주장하지 않는다.
- Codex 예외와 Claude 대응 안내가 각 실제 baseline에 맞는다.
- managed skill policy의 직접 편집이 없다.
- T2의 ordered expected runtime 목록이 실제 inventory와 일치한다. expected 파일 raw Buffer를 기존 무구분자 연결 계약으로 독립 계산한 runtimeHash가 canonical과 두 플랫폼 runtime 각각의 `cooperativeVersions().runtimeHash`와 일치한다.
- evaluator 세 파일의 바이트와 fixture 세 SHA가 일치하고, 고정된 T2 비교 기준 대비 나머지 fixture 내용은 불변이다.
- runtimeHash drift의 stale/hold를 유지하며 자동 상태 갱신·재허가·migration을 추가하지 않는다.

**필수 focused checks — fresh QA**

```text
node --test tests/node/runtime-assignment.test.mjs tests/node/runtime-cli.test.mjs tests/node/runtime-evaluate.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/update-manifest.mjs --check
```

fresh QA는 기존 필수 checks와 §6.1의 runtime 버전·fixture 검사를 수행한다. inventory 순서·동결 상태·독립 바이트/hash·fixture 범위 확인은 수용의 필수 증거다.

**필수 실제 Git integration — Orchestrator**

```text
ARC_RUN_GIT_INTEGRATION=1 node --test tests/node/runtime-git.integration.test.mjs
```

문서 commit의 실제 객체·정확한 문서 집합·현재 파일·첫 배정 이전 intent를 검사해야 한다. 환경변수 누락 등으로 해당 검증이 skip되면 통과로 인정하지 않는다.

fresh QA는 Orchestrator의 integration 결과와 동일 fixture의 Git 객체·현재 문서·CLI 상태를 읽기 전용으로 독립 확인한다. fixture·HEAD·문서 hash·실행 주체·실행 결과·QA 확인을 기록한다.

**Hold conditions**

- 필수 실제 Git integration 미실행·실패·skip.
- ancestry만으로 과거 시작 순서를 증명하려 함.
- provider provenance 합성·adapter 조건 완화.
- omission 경로에 새 문서 의무를 추가하거나 승인 없이 CLI 지원을 확장함.
- 정책 예외가 native/provider/installer 범위로 확대됨.
- managed policy 직접 편집이 필요해짐.
- authoritative runtime module 누락 또는 inventory 순서·독립 바이트/hash 불일치.
- canonical·생성 runtime·manifest 불일치.
- fixture 비교 기준 누락·변경·handoff 불일치.
- evaluator 세 SHA 이외의 fixture 변경.
- §6.1 필수 검사 미실행·실패.
- runtimeHash drift를 자동 상태 갱신·재허가·migration으로 해소하려 함.

**집중 커밋:** `feat(runtime): 승인 문서 커밋과 최초 Coder 배정 연결`

## 8. Phase 2

### T3. scope 변경과 check·Reviewer·finding lifecycle

**목표:** 지원하는 완전한 spec+plan 경로에서 변경 버전에 연결된 check·review·finding과 재승인 조건을 제공한다.

**선행 task:** T2 수용·집중 commit 검증.

**소유 파일**

- 생성: `lib/runtime/verification.mjs`
- 수정: `lib/runtime/cooperative.mjs`
- 수정: `lib/runtime/cooperative-schema.mjs`
- 수정: `lib/runtime/assignment.mjs`
- 수정: `lib/runtime/evaluate.mjs`
- 수정: `lib/cli/workflow.mjs`
- 수정: `codex/skill/references/verification.md`
- 수정: `claude/skill/references/verification.md`
- 수정: `codex/skill/references/handoff.md`
- 수정: `claude/skill/references/handoff.md`
- 테스트 생성: `tests/node/runtime-verification.test.mjs`
- 테스트 수정: `tests/node/runtime-cli.test.mjs`
- 테스트 수정: `tests/node/runtime-evaluate.test.mjs`
- 수정: `lib/runtime/bootstrap.mjs`
- 테스트 fixture 수정: `tests/node/fixtures/instruction-contracts.json`의 canonical·Codex·Claude `evaluate.mjs` 고정 SHA-256 세 값만 동기화
- 테스트 수정: `tests/node/runtime-versions.test.mjs`
- 공통 runtime 생성물과 `MANIFEST.sha256`

**인터페이스**

```text
evaluateCooperativeVerification({
  state, request, evidence
}) -> GateDecision

invalidateAffectedEvidence({
  state, changedVersions, affectedTaskIds
}) -> State
```

결과에 task 또는 final scope, exact descriptor, actor 진술, change fingerprint, result reference, verdict를 연결한다.

**구현 단계**

- [ ] `changedDiffInvalidatesCheck`, `scopeExpansionRequiresNewApproval`, `staleApprovalCannotAuthorizeDependentTask`를 작성한다.
- [ ] `freshTaskActorsCannotCrossTasks`, `reviewerIsNotPerTaskGate`, `finalReviewWaitsForAcceptedTasks`를 작성한다.
- [ ] `finalReviewerFindingUsesCoderReviewerRecheck`, `unresolvedFindingBlocksAffectedTransition`을 작성한다.
- [ ] `noPlanAndOmissionRemainUnsupportedWithoutPolicyViolation`를 작성하여 Phase 2에서도 새 문서 의무·정책 위반·정상 허용으로 변환하지 않음을 확인한다.
- [ ] task와 final 전체 변경 fingerprint를 구별하고 freshness를 검증한다.
- [ ] scope·문서·승인 변경의 영향 task와 의존 chain을 보류한다.
- [ ] check·review intent/result, finding resolution·recheck를 공통 lifecycle에 연결한다.
- [ ] 지원하는 significant plan의 기존 검증 순서를 구현한다. no-plan·기타 omission의 기존 ARC 정책은 변경하지 않으며 CLI에서는 계속 unsupported로 처리한다.
- [ ] T3의 ordered authoritative runtime 목록에 `verification.mjs`를 추가하고 independent literal expected 목록을 함께 확장한다. 기존 Buffer 연결 순서·무구분자 SHA-256 계약을 유지한다.
- [ ] canonical과 두 플랫폼 runtime을 재생성하고 manifest를 갱신한다. 각 runtime의 실제 inventory 순서와 expected 파일 바이트 기반 runtimeHash를 독립 검증한다.
- [ ] evaluator 세 파일의 실제 바이트에 맞춰 fixture의 해당 세 전체 SHA-256만 동기화한다. 고정된 T3 비교 기준 대비 나머지 fixture 내용은 유지한다.
- [ ] runtimeHash drift가 기존 stale/hold로 처리되고 자동 상태 갱신·재허가·migration이 추가되지 않았음을 확인한다.
- [ ] §6.1 검사와 기존 필수 증거를 갖춰 fresh QA에 전달한다.

**수용 기준**

- passing 결과라도 다른 변경 버전을 통과시키지 않는다.
- 기록된 독립성·fresh-per-task 조건을 검사하되 실제 신원 인증을 주장하지 않는다.
- task commit을 최종 Reviewer까지 불필요하게 지연시키지 않는다.
- 지원하는 plan의 최종 Reviewer finding에 Coder→Reviewer를 적용한다.
- 그 이전 check 실패와 QA 재확인은 기존 정책대로 유지한다.
- no-plan·기타 omission 정책은 보존하며 이번 CLI 지원 범위에 포함하지 않는다.
- 의미적 scope 확대와 수용의 판단은 Orchestrator에게 남긴다.
- T3의 ordered expected runtime 목록이 실제 inventory와 일치한다. expected 파일 raw Buffer를 기존 무구분자 연결 계약으로 독립 계산한 runtimeHash가 canonical과 두 플랫폼 runtime 각각의 `cooperativeVersions().runtimeHash`와 일치한다.
- evaluator 세 파일의 바이트와 fixture 세 SHA가 일치하고, 고정된 T3 비교 기준 대비 나머지 fixture 내용은 불변이다.
- runtimeHash drift의 stale/hold를 유지하며 자동 상태 갱신·재허가·migration을 추가하지 않는다.

**필수 checks와 fresh QA 증거**

```text
node --test tests/node/runtime-verification.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-cli.test.mjs tests/node/runtime-evaluate.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/update-manifest.mjs --check
```

fresh QA는 기존 필수 checks와 §6.1의 runtime 버전·fixture 검사를 수행한다. inventory 순서·동결 상태·독립 바이트/hash·fixture 범위 확인은 수용의 필수 증거다.

QA는 scope 변경 전후, 실패·재확인, final Reviewer finding의 상태 전이와 무효화된 근거를 확인한다. no-plan·omission의 unsupported 결과가 기존 정책 위반 판정이나 문서 작성 요구로 바뀌지 않는지도 확인한다.

**Hold conditions**

- Reviewer를 task prerequisite로 추가함.
- final Reviewer 수정에 QA 재배정을 강제함.
- 의미적 충분성을 자동 proven으로 처리함.
- scope 변경이 과거 승인을 덮어씀.
- 별도 범위·승인 없이 no-plan·omission의 CLI 지원을 추가함.
- authoritative runtime module 누락 또는 inventory 순서·독립 바이트/hash 불일치.
- canonical·생성 runtime·manifest 불일치.
- fixture 비교 기준 누락·변경·handoff 불일치.
- evaluator 세 SHA 이외의 fixture 변경.
- §6.1 필수 검사 미실행·실패.
- runtimeHash drift를 자동 상태 갱신·재허가·migration으로 해소하려 함.

**집중 커밋:** `feat(runtime): 협력 검증의 최신성과 범위 변경 관리`

---

### T4. Orchestrator 수용과 집중 commit reconciliation

**목표:** 수용 근거를 정확한 변경에 묶고 실제 index·commit 결과와 연결한다.

**선행 task:** T3 수용·집중 commit 검증.

**소유 파일**

- 생성: `lib/runtime/acceptance.mjs`
- 수정: `lib/runtime/cooperative.mjs`
- 수정: `lib/runtime/cooperative-schema.mjs`
- 수정: `lib/runtime/evaluate.mjs`
- 수정: `lib/runtime/gate.mjs`
- 수정: `lib/runtime/git-evidence.mjs`
- 수정: `lib/runtime/store.mjs`
- 수정: `lib/cli/workflow.mjs`
- 수정: `codex/skill/references/verification.md`
- 수정: `claude/skill/references/verification.md`
- 테스트 생성: `tests/node/runtime-acceptance.test.mjs`
- 테스트 수정: `tests/node/runtime-gate.test.mjs`
- 테스트 수정: `tests/node/runtime-store.test.mjs`
- 테스트 수정: `tests/node/runtime-git.integration.test.mjs`
- 테스트 수정: `tests/node/runtime-cli.test.mjs`
- 수정: `lib/runtime/bootstrap.mjs`
- 테스트 fixture 수정: `tests/node/fixtures/instruction-contracts.json`의 canonical·Codex·Claude `evaluate.mjs` 고정 SHA-256 세 값만 동기화
- 테스트 수정: `tests/node/runtime-versions.test.mjs`
- 공통 runtime 생성물과 `MANIFEST.sha256`

**묶음 근거:** acceptance fingerprint, index descriptor, 예상 commit, 실제 결과 reconciliation은 하나의 수용 계약이다. 분리하면 acceptance를 다른 diff의 commit에 재사용할 수 있는 중간 상태가 생기므로 한 task로 구현·검증한다.

**인터페이스**

```text
evaluateCooperativeAcceptance({
  state, request, evidence
}) -> GateDecision

prepareCooperativeCommit({
  state, request, gitEvidence
}) -> GateDecision

reconcileCooperativeCommit({
  state, intent, result, gitEvidence
}) -> GateDecision
```

기존 `runGate`의 출처 중립적인 Git 검증을 공통화한다. operator 승인을 `user-message`나 provider 증거로 위장해 기존 분기를 통과시키지 않는다.

**구현 단계**

- [ ] `acceptRequiresExactCriteriaChecksAndFindings`, `acceptedFingerprintCannotCommitDifferentIndex`를 작성한다.
- [ ] `unrelatedStagedPathsHold`, `unstagedScopedChangesHold`, `sameFileSemanticLimitIsVisible`를 작성한다.
- [ ] `commitResultMustMatchParentTreePathsHead`, `failedReconcileKeepsActualHistory`, `commitReplayNeverCreatesSecondEffect`를 작성한다.
- [ ] 수용 진술을 필수 근거·criteria·fingerprint와 연결한다.
- [ ] 실제 index·working/untracked 상태로 preflight를 수행한다.
- [ ] Orchestrator가 수행한 commit을 재관찰해 예상과 비교한다.
- [ ] 검증된 commit 결과로만 target HEAD와 task 완료를 갱신한다.
- [ ] T4의 ordered authoritative runtime 목록에 `acceptance.mjs`를 추가하고 independent literal expected 목록을 함께 확장한다. 기존 Buffer 연결 순서·무구분자 SHA-256 계약을 유지한다.
- [ ] canonical과 두 플랫폼 runtime을 재생성하고 manifest를 갱신한다. 각 runtime의 실제 inventory 순서와 expected 파일 바이트 기반 runtimeHash를 독립 검증한다.
- [ ] evaluator 세 파일의 실제 바이트에 맞춰 fixture의 해당 세 전체 SHA-256만 동기화한다. 고정된 T4 비교 기준 대비 나머지 fixture 내용은 유지한다.
- [ ] runtimeHash drift가 기존 stale/hold로 처리되고 자동 상태 갱신·재허가·migration이 추가되지 않았음을 확인한다.
- [ ] §6.1 검사와 기존 필수 증거를 갖춰 fresh QA에 전달한다.

**수용 기준**

- passing check·report만으로 수용 완료가 되지 않는다.
- 하나의 승인 task에 하나의 집중 implementation commit을 연결한다.
- 무관 경로·다른 task 변경·불일치 index를 보류한다.
- 같은 파일 내부의 의미상 무관 변경을 자동 배제했다고 주장하지 않는다.
- 실제 결과가 맞기 전 committed로 표시하지 않는다.
- 기존 trusted Git gate·store 계약을 유지한다.
- T4의 ordered expected runtime 목록이 실제 inventory와 일치한다. expected 파일 raw Buffer를 기존 무구분자 연결 계약으로 독립 계산한 runtimeHash가 canonical과 두 플랫폼 runtime 각각의 `cooperativeVersions().runtimeHash`와 일치한다.
- evaluator 세 파일의 바이트와 fixture 세 SHA가 일치하고, 고정된 T4 비교 기준 대비 나머지 fixture 내용은 불변이다.
- runtimeHash drift의 stale/hold를 유지하며 자동 상태 갱신·재허가·migration을 추가하지 않는다.

**필수 focused checks — fresh QA**

```text
node --test tests/node/runtime-acceptance.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-cli.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/update-manifest.mjs --check
```

fresh QA는 기존 필수 checks와 §6.1의 runtime 버전·fixture 검사를 수행한다. inventory 순서·동결 상태·독립 바이트/hash·fixture 범위 확인은 수용의 필수 증거다.

**필수 실제 Git integration — Orchestrator**

```text
ARC_RUN_GIT_INTEGRATION=1 node --test tests/node/runtime-git.integration.test.mjs
```

실제 index와 commit의 parent·tree·paths·HEAD·잔여 변경, 다른 task 변경 혼입, 실패·불일치 reconciliation을 검사한다. 실행되지 않거나 관련 case가 skip되면 수용을 보류한다.

fresh QA는 실제 fixture의 Git 객체·index·잔여 변경과 기록을 읽기 전용으로 독립 확인한다. mocked evidence 검사와 실제 관찰, 각 실행 주체를 구별한다.

**Hold conditions**

- 필수 실제 Git integration 미실행·실패·skip.
- acceptance와 index 연결이 불명확함.
- 협력 승인을 trusted 증거로 바꿈.
- 임의 target 변경을 commit reconciliation으로 승인함.
- Coder·QA에게 Git 변경을 배정함.
- authoritative runtime module 누락 또는 inventory 순서·독립 바이트/hash 불일치.
- canonical·생성 runtime·manifest 불일치.
- fixture 비교 기준 누락·변경·handoff 불일치.
- evaluator 세 SHA 이외의 fixture 변경.
- §6.1 필수 검사 미실행·실패.
- runtimeHash drift를 자동 상태 갱신·재허가·migration으로 해소하려 함.

**집중 커밋:** `feat(runtime): 작업 수용과 집중 커밋 결과 연결`

## 9. Phase 3

### T5. 외부 행동 승인·결과와 전체 audit 복구

**목표:** 실제 외부 호출 없이 지원 행동의 정확한 승인·intent·결과를 연결하고 전체 audit·복구를 완결한다.

**선행 task:** T4 수용·집중 commit 검증.

**소유 파일**

- 생성: `lib/runtime/external.mjs`
- 수정: `lib/runtime/cooperative.mjs`
- 수정: `lib/runtime/cooperative-schema.mjs`
- 수정: `lib/runtime/evaluate.mjs`
- 수정: `lib/cli/workflow.mjs`
- 수정: `codex/skill/references/handoff.md`
- 수정: `claude/skill/references/handoff.md`
- 수정: `codex/skill/references/verification.md`
- 수정: `claude/skill/references/verification.md`
- 테스트 생성: `tests/node/runtime-external.test.mjs`
- 테스트 생성: `tests/node/runtime-workflow.integration.test.mjs`
- 테스트 수정: `tests/node/runtime-cli.test.mjs`
- 테스트 수정: `tests/node/runtime-evaluate.test.mjs`
- 공통 runtime 생성물과 `MANIFEST.sha256`

- 수정: `lib/runtime/bootstrap.mjs`
- 테스트 fixture 수정: `tests/node/fixtures/instruction-contracts.json`의 canonical·Codex·Claude `evaluate.mjs` 고정 SHA-256 세 값만 동기화
- 테스트 수정: `tests/node/runtime-versions.test.mjs`

필요한 안내는 reference에 둔다. managed section이 있는 두 플랫폼 `SKILL.md`는 직접 편집하지 않는다.

**인터페이스**

```text
evaluateCooperativeExternal({
  state, request, approvalEvidence
}) -> GateDecision

reconcileCooperativeExternal({
  state, intent, result
}) -> GateDecision
```

행동별 descriptor는 다음을 요구한다.

| 행동 | 대상 필드 |
|---|---|
| push | repository, destination, refspec, sourceOid, expectedRemoteOid |
| merge | repository, changeRef, targetRef, expectedTargetOid |
| deploy | service, project, environment, artifactId, destination |
| publish | service, namespace, name, version, artifactHash, destination |

remote 관찰이 없는 값은 진술된 기대값이다. 인증정보가 포함된 destination은 저장·출력하지 않고 비밀정보 없는 식별자를 요구한다.

**구현 단계**

- [ ] `localCommitApprovalCannotAuthorizePush`, `externalTargetMismatchHolds`, `missingExactExternalApprovalHolds`를 작성한다.
- [ ] `externalResultUnknownNeverRetries`, `operatorResultIsNotRemoteVerification`, `noNetworkOrNativeExecution`을 작성한다.
- [ ] 외부 승인·intent·결과의 version·target 연결을 구현한다.
- [ ] mismatch·unknown·stale 결과를 정상 완료로 바꾸지 않는다.
- [ ] 요청→판정→intent→결과→해결 기록을 조회할 수 있게 한다.
- [ ] 전체 흐름·중단·재개를 synthetic 외부 결과로 검증한다.
- [ ] phase별 지원·한계·복구 안내를 Codex/Claude reference에 일치시킨다. 전체 phase에서 no-plan·omission이 미지원임을 유지한다.
- [ ] T5의 ordered authoritative runtime 목록에 `external.mjs`를 추가하고 independent literal expected 목록을 함께 확장한다. 기존 Buffer 연결 순서·무구분자 SHA-256 계약을 유지한다.
- [ ] canonical과 두 플랫폼 runtime을 재생성하고 manifest를 갱신한다. 각 runtime의 실제 inventory 순서와 expected 파일 바이트 기반 runtimeHash를 독립 검증한다.
- [ ] evaluator 세 파일의 실제 바이트에 맞춰 fixture의 해당 세 전체 SHA-256만 동기화한다. 고정된 T5 비교 기준 대비 나머지 fixture 내용은 유지한다.
- [ ] runtimeHash drift가 기존 stale/hold로 처리되고 자동 상태 갱신·재허가·migration이 추가되지 않았음을 확인한다.
- [ ] §6.1 검사와 기존 필수 증거를 갖춰 fresh QA에 전달한다.

**수용 기준**

- 로컬 권한을 외부 권한으로 확장하지 않는다.
- 행동·scope·대상에 맞는 명시 승인을 요구한다.
- provider 없는 외부 결과를 독립 검증됐다고 표시하지 않는다.
- 실제 push·merge·deploy·publish를 실행하지 않는다.
- unknown·mismatch가 관련 후속 행동을 보류한다.
- 세 phase·아홉 영역의 지원 상태와 한계를 조회할 수 있다.
- 외부 행동 기능이 no-plan·omission 지원을 암묵적으로 추가하지 않는다.
- T5의 ordered expected runtime 목록이 실제 inventory와 일치한다. expected 파일 raw Buffer를 기존 무구분자 연결 계약으로 독립 계산한 runtimeHash가 canonical과 두 플랫폼 runtime 각각의 `cooperativeVersions().runtimeHash`와 일치한다.
- evaluator 세 파일의 바이트와 fixture 세 SHA가 일치하고, 고정된 T5 비교 기준 대비 나머지 fixture 내용은 불변이다.
- runtimeHash drift의 stale/hold를 유지하며 자동 상태 갱신·재허가·migration을 추가하지 않는다.

**필수 checks와 fresh QA 증거**

```text
node --test tests/node/runtime-external.test.mjs tests/node/runtime-workflow.integration.test.mjs tests/node/runtime-cli.test.mjs tests/node/runtime-evaluate.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/update-manifest.mjs --check
```

fresh QA는 기존 필수 checks와 §6.1의 runtime 버전·fixture 검사를 수행한다. inventory 순서·동결 상태·독립 바이트/hash·fixture 범위 확인은 수용의 필수 증거다.

QA는 네 행동의 대상 일치·불일치와 unknown 복구를 확인한다. fixture에서 네트워크·native 호출을 금지하고 실제 외부 행동 부재를 확인한다.

**Hold conditions**

- provider·hook·installer 또는 실제 외부 호출이 필요해짐.
- destination 검증을 위해 credential을 저장함.
- 임의 shell을 허용하는 범용 실행 기능으로 확대됨.
- audit를 변조 불가능한 보안 증거로 설명함.
- 별도 범위·승인 없이 no-plan·omission 지원이 추가됨.
- authoritative runtime module 누락 또는 inventory 순서·독립 바이트/hash 불일치.
- canonical·생성 runtime·manifest 불일치.
- fixture 비교 기준 누락·변경·handoff 불일치.
- evaluator 세 SHA 이외의 fixture 변경.
- §6.1 필수 검사 미실행·실패.
- runtimeHash drift를 자동 상태 갱신·재허가·migration으로 해소하려 함.

**집중 커밋:** `feat(runtime): 외부 작업 승인과 워크플로 복구 기록 추가`

## 10. 의존성과 범위 대응

```text
문서 집합 승인·docs-only commit·최종 Git 확인
  → T1 공통 기반
  → T2 문서→Coder
  → T3 검증·scope lifecycle
  → T4 acceptance·commit
  → T5 외부 행동·전체 audit
  → 최종 전체 검증·독립 Reviewer
```

각 경계는 선행 task의 필수 증거·fresh QA·Orchestrator 수용·검증된 집중 commit을 요구한다.

| 영역 | 구현 task |
|---|---|
| 문서 commit 선행·소급 정상화 금지 | T2 |
| target·worktree·stale state | T1·T2·T4 |
| 역할·task·scope·path | T1·T2·T3 |
| 범위 확대·재승인 | T1·T3 |
| QA·Reviewer 순서·freshness | T3 |
| acceptance·집중 commit·무관 변경 | T4 |
| 동시성·replay·재시작 | T1 공통 계약, T2–T5 행동별 적용 |
| 외부 행동 명시 승인 | T5 |
| audit·reconciliation | T1 공통 계약, T2–T5 완결 |

위 구현은 전체 phase에서 완전한 spec+plan 경로에 한정한다. no-plan·기타 omission의 실제 CLI 지원은 이번 plan의 후속 task로 자동 포함하지 않으며 별도 범위·승인이 필요하다.

shared API·schema·CLI·generated assets가 겹치므로 동시 Coder 편집은 허용하지 않는다. 선행 task 수용 뒤에는 readiness를 즉시 재평가한다.

## 11. 최종 전체 검증과 독립 Reviewer

task별 수용 prerequisite와 구별한다. T1–T5가 각자의 checks·fresh QA·Orchestrator 수용·집중 commit을 마친 뒤 수행한다.

### 11.1 전체 변경 검증

Orchestrator는 최종 HEAD와 Git 상태를 고정해 다음을 확인한다.

- 실제 CLI 흐름과 중단·재개.
- no-plan·omission의 기존 ARC 정책과 문서 의무가 유지되고, 모든 phase에서 CLI unsupported로 표시됨.
- trusted evaluator·adapter 요구 유지.
- 역할·QA·Reviewer·commit 계약 유지.
- runtime·정책 생성물과 manifest 정합성.
- 과거 승인 산출물·README·외부 skill·hook·installer 무변경.
- 두 플랫폼 `SKILL.md` managed policy의 직접 편집 부재.
- 기존 public CLI 회귀 부재.

**비 Git 변경 checks — fresh QA 또는 정당한 freshness를 유지한 기존 QA 증거**

```text
node --test tests/node/runtime-cooperative.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-verification.test.mjs tests/node/runtime-acceptance.test.mjs tests/node/runtime-external.test.mjs tests/node/runtime-workflow.integration.test.mjs tests/node/runtime-cli.test.mjs
node --test tests/node/runtime-evaluate.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-schema.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs
node --test tests/node/cli.test.mjs tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/update-manifest.mjs --check
```

**실제 Git integration — Orchestrator**

```text
ARC_RUN_GIT_INTEGRATION=1 node --test tests/node/runtime-git.integration.test.mjs
```

T2·T4 후 관련 코드나 계약이 변했다면 최종 관련 상태에서 다시 실행하고 fresh QA가 읽기 전용 증거를 확인한다. 관련 상태·freshness·독립성·flow 위치가 유지되는 증거는 재사용할 수 있다. 미실행·skip·실패를 통과로 처리하지 않는다.

불필요한 전 suite 반복은 하지 않는다. 새 변경·실패·미해결 우려가 있는 범위만 재검증한다.

### 11.2 독립 Reviewer

필수 checks와 필요한 QA 재확인이 끝난 최종 전체 변경을 독립 Reviewer가 한 번 검토한다.

범위는 docs-only commit 뒤 T1–T5 전체 변경과 승인 spec·plan의 일치다. Reviewer는 읽기 전용이며 QA 실행·수용 결정을 하지 않는다.

최종 Reviewer finding은 다음으로 해결한다.

```text
Coder 수정 → Reviewer 재확인 → Orchestrator 판단
```

이 finding loop에는 QA를 재배정하지 않는다. 기존 QA를 수정 후 실행 증거로 표현하지 않는다. 새 범위·별도 필수 의무·증거 충돌이 생기면 영향받는 작업을 보류한다.

#### 11.2.1 최초 최종 검토 finding의 보완 범위

다음 다섯 항목은 승인 spec과 T2–T5의 기존 요구를 충족하기 위한 결함 보완이다. 새 top-level task나 기능 확장을 추가하지 않으며 위 Coder 수정 → Reviewer 재확인 → Orchestrator 판단 경로로 처리한다. 선행 조건은 T1–T5 수용·집중 commit 확인과 최초 최종 Reviewer finding 기록이다.

**수정 대상**

- `lib/runtime/verification.mjs`: task/final fingerprint와 검증된 commit 전후 evidence 연결.
- `lib/runtime/assignment.mjs`: 승인 task·기록 scope 경로 결속과 활성 배정 충돌.
- `lib/runtime/acceptance.mjs`: 완료 task와 실제 진행 중 task의 변경 충돌 구분.
- `lib/runtime/cooperative.mjs`: 검증된 commit lifecycle, 특정 unresolved 항목의 해결 기록, 외부 결과 판정에 실제 target 관찰 전달.
- `lib/runtime/external.mjs`: 실제 target이 달라진 외부 결과의 정상 완료 방지.
- 위 계약의 상태 표현·입력 검증에 필요한 경우에만 `lib/runtime/cooperative-schema.mjs`, `lib/cli/workflow.mjs`, `lib/runtime/evaluate.mjs`를 수정한다.
- 해당 canonical runtime 변경을 `codex/skill/runtime/`와 `claude/skill/runtime/`의 같은 파일에 재생성하고 `MANIFEST.sha256`을 갱신한다. `lib/runtime/bootstrap.mjs`는 authoritative inventory 계약 변경이 실제로 필요한 경우에만 수정한다.

**실패 재현과 수용 기준**

Coder는 각 수정 전에 다음 행동의 회귀 검사를 작성하고 현재 구현에서 의도한 이유로 실패함을 확인한 뒤 최소 수정한다.

1. `tests/node/runtime-verification.test.mjs`, `tests/node/runtime-acceptance.test.mjs`, `tests/node/runtime-workflow.integration.test.mjs`:
   - T1 검증·수용·실제 commit reconciliation 후 T2 검증·수용·실제 commit reconciliation까지 진행해도 이미 검증된 T1 commit과 task 근거가 HEAD 이동만으로 stale이 되지 않는다. 모든 task 완료 후 최종 review와 status가 진행 가능해야 한다.
   - 이를 검증된 commit 전후 연결에 한정한다. 실제 task 내용 변경, 예상 밖 HEAD·branch 변경, 승인·scope·버전 불일치가 기존 evidence를 정상으로 만드는 것을 허용하지 않는다.
   - task와 final 전체 변경 fingerprint의 의미를 구별하며 실제 다른 변경에 과거 passing 결과를 재사용하지 않는다.

2. `tests/node/runtime-assignment.test.mjs`:
   - workspace 내부라도 해당 task 또는 기록된 승인 scope 밖의 경로를 배정하면 보류한다.
   - 승인된 디렉터리 하위 경로는 기존 경로 의미에 따라 허용하되 문자열 prefix만 같은 형제 경로나 다른 task 경로는 허용하지 않는다.
   - 기존 canonical path·workspace 경계 검증을 유지한다.

3. `tests/node/runtime-assignment.test.mjs`, `tests/node/runtime-acceptance.test.mjs`, `tests/node/runtime-workflow.integration.test.mjs`:
   - 앞선 task가 검증된 commit으로 완료된 뒤 후속 승인 task가 같은 파일을 수정할 수 있다.
   - 과거 assignment intent의 `succeeded`나 완료 task의 경로만으로 영구 충돌시키지 않는다.
   - 단순 성공 진술만으로 배정을 종료 처리하지 않는다. 실제 활성 배정, 미확정 실행, 미완료 task의 충돌과 무관 staged 변경은 계속 보류한다.

4. `tests/node/runtime-cooperative.test.mjs`, `tests/node/runtime-cli.test.mjs`, `tests/node/runtime-workflow.integration.test.mjs`:
   - `stale-result`는 해당 intent의 실제 결과·correlation과 현재 상태를 재확인한 증거를 통해 해결할 수 있다.
   - `scope-changed`는 해당 scope 변경에 필요한 현행 승인·문서·영향 task evidence가 갖춰진 경우에만 해결할 수 있다.
   - 해결은 해당 unresolved 항목과 증거·request를 연결해 감사 기록에 남긴다. 해결되지 않은 다른 항목을 일괄 해제하거나 무효화된 check·approval을 자동으로 복원하지 않는다.
   - 근거 누락·불일치와 unknown 실제 실행은 계속 보류하며 재실행을 자동 허가하지 않는다. 과거 stale 실행을 정상 준수로 소급 표시하지 않는다.

5. `tests/node/runtime-external.test.mjs`, `tests/node/runtime-cli.test.mjs`, `tests/node/runtime-workflow.integration.test.mjs`:
   - 외부 intent 준비 후 실제 checkout HEAD 또는 branch를 바꾸고 동일한 성공 descriptor를 기록해도 정상 완료로 판정하지 않는다.
   - 실제 target drift를 기록하고 영향받는 후속 행동을 보류한다. 실제 target·승인·descriptor가 모두 일치하는 정상 결과 기록과 기존 unknown/mismatch 복구 경로를 함께 확인한다.
   - synthetic 결과만 사용하고 실제 외부 작업을 실행하지 않는다. 결과의 `operator-attested` 출처와 `remoteVerified: false`를 유지한다.

**수정 후 증거와 재확인**

Coder는 실패 재현 결과, 수정 후 위 영향 검사 결과, 실제 변경 경로와 제한을 보고한다. 위에 열거한 테스트 파일 중 수정 또는 영향받는 파일의 전체 검사를 실행한다. runtime 생성물과 manifest를 변경했다면 `tests/node/runtime-versions.test.mjs`, `node scripts/update-runtime-assets.mjs --check`, `node scripts/update-manifest.mjs --check`를 확인한다.

`evaluate.mjs`가 바뀌면 `tests/node/runtime-evaluate.test.mjs`를 확인하고 §6.1의 evaluator 세 SHA fixture 동기화와 나머지 fixture 불변 계약을 유지한다. 비교 기준은 보완 시작 전 고정된 accepted HEAD로 기록한다. 기존 전체 suite 실패를 해결됐거나 수정 후 통과한 것으로 표현하지 않는다.

Reviewer는 보완 diff·새 증거와 최초 다섯 finding의 해소 여부 및 연관 회귀를 재확인한다. QA를 재배정하지 않으며 기존 QA 결과를 수정 후 실행 증거로 표현하지 않는다. Orchestrator는 각 finding의 수용 기준·현재 Git 상태·필수 증거를 확인해 수용과 최종 completion을 결정한다.

실제 외부 호출, hook/provider/installer 추가, no-plan·omission 지원 확대, managed `SKILL.md` 편집, 증거 없는 unresolved 해제 또는 stale evidence 자동 재허가는 범위 밖이다. 이 범위 밖 변경이나 별도 필수 의무·증거 충돌이 필요하면 해당 의존 작업을 보류하고 Orchestrator에 보고한다.

Orchestrator가 기준별 증거·미검증 한계·실제 commit·Git 상태를 확인해 최종 completion을 결정한다.

## 12. 자체 검토

- **승인 기준:** spec SHA와 승인된 협력 범위·세 phase·아홉 영역을 유지했다.
- **지원 범위 일관성:** Phase 1–3 전체에서 완전한 spec+plan 경로만 CLI가 지원하도록 통일했다. T3의 검증 순서는 지원하는 plan 경로에 한정했다.
- **omission 호환성:** no-plan·기타 omission의 기존 ARC 정책은 보존한다. CLI unsupported를 정책 위반·문서 작성 요구·준수 완료로 바꾸지 않는다.
- **향후 지원 경계:** 실제 omission mode 지원을 이번 plan에 자동 포함하지 않았으며 별도 범위 결정과 승인이 필요하다고 명시했다.
- **omission 검증:** T3에 unsupported 결과와 기존 정책 보존을 확인하는 행동 검증을 추가하고 최종 전체 검증에도 반영했다.
- **언어:** 설명·파일 소유권 표기·묶음 근거를 한국어로 통일했다. 식별자·경로·API·명령은 유지했다.
- **작업 단위:** T1–T5 모두 독립 산출물·수용 기준이 있으며 공유 계약의 묶음 근거와 직렬 의존성을 명시했다.
- **파일 소유권:** 두 플랫폼 `SKILL.md`를 직접 수정 대상에서 제외했다. 필요한 안내는 reference에 둔다.
- **생성 경계:** runtime 정본→플랫폼 복사본→manifest 갱신을 task 안에 포함했다. managed policy 변경이 생기면 정본·렌더러·생성기·tests 소유권을 재정리하도록 보류 조건을 두었다.
- **정책 baseline:** Codex의 실제 금지에는 좁은 예외를 추가하고 Claude에는 대응 안내를 추가하도록 구별했다.
- **실제 Git 증거:** T2·T4의 실제 Git integration은 필수다. 미실행·skip·실패 시 수용을 보류한다.
- **역할 경계:** Coder는 배정 파일을 수정하고 Orchestrator는 Git metadata와 Git fixture·commit 조작 검증을 담당한다. QA는 승인된 checks·임시 산출물만 다루고 Reviewer는 읽기 전용이다.
- **제품과 구현의 구분:** 제품 runtime의 읽기 전용 Git 관찰과 Orchestrator의 구현 commit·Git integration 책임을 구별했다.
- **역할 순서:** task별 fresh Coder→fresh QA→Orchestrator 수용·집중 commit, 마지막 final whole-change Reviewer를 유지했다.
- **문서 gate:** 승인 문서 전체의 docs-only batch commit과 최종 Git 확인을 첫 Coder 전에 요구한다.
- **보장 한계:** operator 진술을 provider 검증으로 승격하지 않으며 직접 호출·신원 가장을 막는다고 주장하지 않는다.
- **기존 범위:** trusted 계약·과거 승인 산출물·T5 amendment와 native/provider/installer 제외 경계를 유지했다.
- **실패 처리:** 저장 실패·중복·stale·unknown·mismatch와 소급 정상화 금지를 공통 계약과 task별 검증에 포함했다.
- **runtime 버전 완전성:** T2의 8개 모듈에서 시작해 T3 verification, T4 acceptance, T5 external을 순서대로 추가한다. 실제 inventory와 독립 literal expected 목록, 무구분자 Buffer 연결 바이트·SHA-256을 canonical·생성 runtime 각각 검증한다.
- **fixture 범위:** T2는 stable base `1e3a20fe7d04c6d93ba48dcea5af5d426b180177`, T3–T5는 고정된 직전 accepted focused task commit을 기준으로 evaluator 세 SHA만 동기화하고 다른 fixture 내용의 deep equality를 확인한다.
- **stale 의미와 재개:** 자동 상태 갱신·재허가·migration을 추가하지 않는다. plan hash 확인·docs-only amendment commit·최종 Git/handoff 재확인 뒤 T2를 재개한다.
- **커밋 형식:** 모든 task subject는 한국어 설명의 Conventional Commit이다.
- **미결정 사항:** 추가 사용자 범위 선택은 없다. 예상 밖 managed policy·provider·installer·omission 지원 요구는 보류·보고 대상이다.
- **수행 기록:** Planner는 초안과 개정본을 응답으로 반환했고, 문서 저장은 Orchestrator가 수행했다. Planner는 코드/Git 변경·검사·테스트를 실행하지 않았다. 본문의 명령은 향후 구현 검증 요구다.
