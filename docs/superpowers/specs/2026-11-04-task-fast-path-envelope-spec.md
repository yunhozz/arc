# 작은 작업 Fast Path와 Task Envelope 정식 명세

상태: **정식 spec 초안 — 사용자 승인 전**

## 1. 승인 근거와 대상

이 명세는 사용자가 승인한 [초기 설계](2026-11-04-task-fast-path-envelope-design.md)를 구체화한다.

- 승인 설계 SHA-256: `5d019d47849ed1f8c3a5f75224363600e94decd9918573815c8ebb9fecd7a1ef`
- 저장소: `/Users/ma-24-007/Desktop/workspace/arc`
- branch: `refactor/arc-instructions`
- HEAD: `7de7541aaa9daf45bfec3019825ee8a46fbf6172`
- Orchestrator가 확인한 변경 상태: 승인된 Orchestrator 소유 설계 문서 하나만 untracked
- 이 spec 경로는 작성 전에 비어 있음을 확인했다.

이 상태는 formal drafting 직전 준비 증거다. Planner는 파일을 저장하거나 Git 상태를 바꾸지 않는다.

## 2. 목적과 범위

다음 세 단계를 기존 Codex와 Claude workflow에 적용한다.

1. 모든 충분조건을 입증한 작은 작업은 기존 small/direct 경로를 선택한다.
2. 적용 지침·대상·승인·범위·위험·TDD·검증 근거를 기존 기록과 brief에 짧게 연결한다.
3. 관련 변화가 생기면 영향받는 판단과 증거를 갱신하고, 불확실하면 기존 전체 평가로 복귀한다.

기존 권한, target choice, 범위 승인, TDD, 역할 신선도, QA/Reviewer, acceptance와 commit 경계를 보존한다. 이는 Architectural 변경이며 별도의 계획 승인이 있기 전 구현하지 않는다.

이번 범위에 포함하지 않는다.

- 실행 가능한 자동 분류기·prompt compiler·gate DAG
- 새 runtime endpoint·영속 저장소·별도 envelope 파일
- 새로운 TDD waiver·문서 생략·권한·승인 예외
- 파일 수·LOC·토큰 수만으로 fast path를 허용하는 분류기
- 실제 agent 준수 또는 측정하지 않은 성능 보장

## 3. 계약 소유권

| 계약 | 기존 소유 위치 | 변경 |
|---|---|---|
| Fast/direct 자격과 편집 경계 | 양 플랫폼 `references/handoff.md`의 `Orchestrator direct path for small tasks` | 충분조건과 envelope 연결을 추가 |
| Scope authorization·문서 깊이 | `planning.md` | 절 단위 읽기와 기존 판단을 연결 |
| Significant risk·QA/Reviewer·증거 재사용 | `verification.md` | 단일 정의를 유지하고 영향별 재검증을 연결 |
| Brief 순서·역할 배정·재사용 | `coordination.md` | 기존 필드에 envelope를 배치 |
| 진입·필수 참조 | 양 플랫폼 `SKILL.md` | Fast-first와 full-path fallback을 안내 |
| 운영 설명 | `docs/harness-operation.md` | 위 계약과 설명을 동기화 |

Risk 정의를 fast gate 안에 두 번째 정본으로 복제하지 않는다. 기존 직접 경로와 위험 정의의 연결을 검사로 보호한다. 근거: [직접 경로](../../../codex/skill/references/handoff.md#orchestrator-direct-path-for-small-tasks), [위험 정의](../../../codex/skill/references/verification.md#risk-scaled-execution), [문서 깊이](../../../codex/skill/references/planning.md#design-path-and-plan-depth).

## 4. Fast gate 규칙

### 4.1 논리식과 판정

Fast gate는 다음 조건의 논리곱이다.

```text
FAST_DIRECT = F1 ∧ F2 ∧ F3 ∧ F4 ∧ F5 ∧ F6 ∧ F7 ∧ F8
```

각 조건은 `proven`, `unmet`, `unverified` 중 하나로 기록한다. **모든 조건이 `proven`일 때에만** 기존 직접 경로를 선택한다. `unmet`, `unverified`, 누락된 근거는 통과로 간주하지 않는다.

| ID | 충분조건 | 입증할 내용 |
|---|---|---|
| F1 | 명확한 scope authorization | 요청 또는 승인이 결과·범위·criteria·편집 경계를 정하고 중요한 동작·방법·위험 결정이 미해결 상태가 아님 |
| F2 | 좁고 이해되는 변경 | 하나의 local change이고 영향·원인·결과가 이해되며 되돌릴 수 있음 |
| F3 | 의존·통합 우려 부재 | dependent stages, cross-component shared state, lifecycle/integration-order 우려가 없음 |
| F4 | Low-risk 조건 충족 | `verification.md#risk-scaled-execution`의 low-risk 조건을 충족하고 significant trigger·ordinary behavior·high/unclear risk 등 기존 직접 경로 제외 조건에 해당하지 않음 |
| F5 | 명확한 집중 검증 | 하나의 focused verification 경로로 criteria를 확인하고 필요한 독립 QA/Reviewer 의무를 식별함 |
| F6 | 유효한 대상·보존·소유권 | 명시적 target choice 또는 유효한 재사용, 현재 workspace와 변경 상태, unrelated change 보존 및 활성 편집 충돌 부재가 확인됨 |
| F7 | TDD 처리 확정 | 적용되는 기존 TDD 요구를 식별하고, waiver/비동작 예외는 기존 조건 및 사전 기록을 충족함 |
| F8 | 지침·근거의 접근성과 일치 | 적용 지침 source-set과 승인·대상·criteria·검증 근거가 접근 가능하고 누락·충돌·해석 불확실성이 없음 |

파일 수, LOC, “간단해 보인다”는 설명은 F2~F5의 증거가 아니다. 기존 Spike/Architectural 제외와 각 플랫폼 지원 차이도 유지한다.

### 4.2 경로 선택과 실행 gate 분리

Fast gate는 기존 small/direct 경로를 선택하기 위한 충분조건이다. 다음을 대신하지 않는다.

- 첫 직접 편집 전 공통 handoff gate
- Implementer 첫 시작·재시작 전 gate
- 명시적 대상 선택과 실제 상태 확인
- 적용되는 TDD 실행·검증·독립 QA/Reviewer
- Orchestrator acceptance와 해당 commit 절차

Fast 조건을 입증해도 실제 편집 전 gate를 통과하지 못하면 편집하지 않는다. [기존 handoff gate](../../../codex/skill/references/handoff.md#common-handoff-gate)를 유지한다.

## 5. 정확한 읽기 범위

### 5.1 최초 fast 판단

현재 플랫폼의 ARC `SKILL.md`를 적용한 뒤, 최초 fast 판단에는 다음 **네 절**을 읽는다. 같은 source/hash와 같은 대화 문맥에서 읽은 절은 §6 재사용 조건을 충족할 때 본문을 다시 읽지 않는다.

| 참조 | 읽을 절 | 목적 |
|---|---|---|
| `handoff.md` | `Orchestrator direct path for small tasks` | F1~F8 및 직접 편집 한계 |
| `planning.md` | `Authorization and scope` | F1, 승인 재사용·변경 hold |
| `planning.md` | `Design path and plan depth` | F3 및 plan/spec 생략 판단 |
| `verification.md` | `Risk-scaled execution` | F4/F5 및 역할·검증 흐름 |

절은 지정 heading부터 다음 같은 수준 이상의 heading 전까지이며 하위 절을 포함한다. 제목만 찾는 것은 읽기로 간주하지 않는다. Fast gate는 위 절에 있는 기존 조건을 모두 적용해야 하며 조건 일부를 줄여 해석하지 않는다.

변경이 feature/bug/behavior edit이거나 TDD exception이 후보라면 `handoff.md`의 `Implementer TDD and constraints`도 해당 판단 전에 읽어 F7을 평가한다. 범위 성격이 불확실하면 이 절을 확인해도 full path로 승격할 수 있다. 근거가 명확한 non-behavior 작업은 TDD를 `not applicable`로 기록한다.

### 5.2 행동별 추가 읽기

다음 참조는 기존 발동 시점에 계속 읽는다.

- 직접 편집 또는 Implementer 시작·재시작: 공통 handoff·준비·재사용 관련 필수 절
- 대상 선택 또는 Git preparation: 기존 `handoff-prep.md` 및 플랫폼 준비 계약
- 역할 생성·배정: `coordination.md`, limits와 해당 역할 입력
- 실제 TDD 수행: 지정된 TDD skill과 필수 상대 참조
- QA/Reviewer·수락·commit·실패 복구: 기존 해당 참조

따라서 fast gate는 다른 참조를 영구 면제하지 않는다. 분류 전에 전체 조건을 무조건 다시 읽던 순서를, 필요한 절의 첫 읽기와 유효한 문맥 재사용으로 바꾼다.

### 5.3 전체 평가로 복귀

다음 조건이면 기존 handoff·planning·verification 전체 조건을 평가한다.

- F1~F8 중 하나라도 입증되지 않음
- 읽은 절만으로 적용 조건이나 예외를 해석할 수 없음
- 지침 충돌·source-set 불확실성·중요한 미결정이 있음
- 관련 변화 이후 충분조건을 다시 입증하지 못함

필수 입력에 접근할 수 없거나 운영 실패가 있으면 full path를 우회로로 사용하지 않는다. 기존 incident/read-recovery 규칙에 따라 보고하고 관련 작업을 보류한다.

## 6. Instruction fingerprint

### 6.1 Source-set

Fingerprint는 전체 저장소가 아니라 해당 판단·행동에 실제 적용한 지침 source 목록이다.

| Source | 포함 규칙 |
|---|---|
| 현재 플랫폼 ARC `SKILL.md` | 항상 포함 |
| §5.1의 참조 | `handoff.md`, `planning.md`, `verification.md`를 한 번씩 기재하고 읽은 절을 기록 |
| Workspace 지침 | 현재 범위에 적용되는 사용자 제공/발견된 지침을 기존 플랫폼 절차로 확인해 포함 |
| 사용자·플랫폼 메시지 | 메시지/승인 참조·적용 범위를 기록하며 파일처럼 임의 SHA-256을 만들지 않음 |
| 행동별 참조·skill | 실제 trigger가 발동해 읽을 때 source-set에 추가 |
| 역할 profile | 배정된 역할에 native profile이 적용된다는 근거와 확인 가능한 source/version을 기록. 새 역할 입력은 hash만으로 충족하지 않음 |

직접 경로에서 역할을 만들지 않으면 모든 역할 profile을 따로 읽지 않는다. `models.toml`, package 전체 또는 모든 references/runtime 파일을 일괄 포함하지 않는다.

현재 플랫폼이 제공한 instruction source와 승인된 locator를 사용한다. 새 전역 검색이나 추측 경로 탐색은 하지 않는다. source-set 구성을 확인할 수 없으면 F8은 `unverified`다.

### 6.2 파일별 기록

각 파일 source는 다음 정보를 기록한다.

```text
source kind
absolute source path
resolved path
read section(s)
revision, if available
contentHash = sha256:<64 lowercase hex>
access state
observation reference
read-context reference
```

- Hash는 디스크의 실제 파일 바이트 전체에 대해 계산한다.
- 확인 가능한 `revision`은 기록하되 파일 hash를 대체한다고 추정하지 않는다.
- 절의 의미는 파일 바이트를 읽은 같은 대화 문맥에 남아 있어야 한다.
- source 또는 resolved path가 달라지면 같은 자료로 자동 간주하지 않는다.
- repo HEAD는 instruction fingerprint를 대신하지 않는다.

Installer manifest는 package 원본의 무결성 자료다. 설치 후 언어·모델 적용이나 로컬 변경이 가능한 실제 지침/profile의 현재 hash로 대신 쓰지 않는다. Package version만으로 지침 내용이 불변이라고 추정하지 않는다.

### 6.3 일괄 hash 확인

이미 사용 가능한 Node.js 실행 기능이 있을 때, 새 설치·명령 없이 built-in `node:fs`·`node:crypto`로 확인된 절대 경로 목록을 한 번에 SHA-256 처리한다. 경로는 이미 식별된 source-set만 사용하고, 본문은 출력하지 않는다.

```sh
node --input-type=module -e '
import fs from "node:fs";
import crypto from "node:crypto";
const sources = process.argv.slice(1);
if (!sources.length) throw new Error("No instruction sources");
for (const source of sources) {
  const resolvedPath = fs.realpathSync(source);
  const contentHash = "sha256:" +
    crypto.createHash("sha256").update(fs.readFileSync(resolvedPath)).digest("hex");
  process.stdout.write(JSON.stringify({source, resolvedPath, contentHash}) + "\n");
}
' -- '/absolute/identified/source-1' '/absolute/identified/source-2'
```

이 확인은 읽기만 하며 새 파일·dependency·runtime endpoint를 만들지 않는다. Node.js 실행 기능을 추가로 설치하거나 ARC에 새 명령을 추가하지 않는다. Hash 확인이 불가능하거나 실패하면 본문 재사용을 하지 않는다. 기존에 허용된 읽기/복구 규칙을 따르고 필수 source에 접근할 수 없으면 dependent work를 보류한다.

### 6.4 재사용과 갱신

동일 source-set·path·hash 및 적용 범위를 확인하고, 읽은 의미가 같은 대화 문맥에 남아 있을 때만 본문 재주입을 생략한다.

현재 source-set과 hash는 다음 시점에 한 번에 확인한다.

- 이전 지침 읽기를 사용해 새 fast 판단을 할 때
- 기존 계약에서 first-edit·assignment/restart·resumption gate를 통과할 때
- acceptance 전에 관련 evidence의 현재성을 확인할 때
- 중간에 알려진 지침/source 변화가 생겼을 때

같은 gate 수행 중 얻은 새 관측은 해당 기록에 연결해 중복 확인을 피한다. 새로운 대화·문맥 소실·접근 불가한 read record에서는 hash 일치만으로 이전 읽기를 재사용하지 않고 필요한 절을 다시 읽는다. Hash가 다르면 변경된 source와 영향받은 판단을 다시 확인한다. 영향이 분명하지 않으면 fast 판단을 보류하고 전체 평가로 복귀한다.

디스크 profile 변경이 실행 중 역할에 자동 적용됐다고 주장하지 않는다. Native profile과 active context의 연결이 불분명하면 해당 역할 지침이 갱신되었다고 기록하지 않는다.

## 7. 최소 Task Envelope와 배치

### 7.1 저장 위치

Envelope는 기존 canonical handoff record의 작업 요약 또는 기존 small/direct inline scope record에 둔다. 새 envelope 전용 파일이나 원장은 만들지 않는다. 기존 승인·문서·검증 기록은 접근 가능한 정확한 참조로 연결한다. 접근 불가한 링크나 과거 대화 참조만으로 필수 내용을 생략하지 않는다.

### 7.2 최소 필드

| 필드 | 기록 내용 |
|---|---|
| `task` | 기존 task ID, 선택 경로 `fast-direct` 또는 `full` |
| `instructions` | §6 source-set, revision/hash, 읽은 절, 문맥·접근 근거 |
| `target` | 절대 workspace/repository, branch/detached HEAD, 관측 HEAD와 staged/unstaged/untracked, 보존·소유권 |
| `authorization` | 범위 승인 참조, target 선택/재사용 근거, 승인 문서/버전 또는 기존 유효 생략 근거 |
| `scopeCriteria` | 편집 경계·파일·결과·criteria |
| `riskDepth` | F1~F8 결과와 짧은 근거, 위험·문서 깊이 판단 |
| `tdd` | 요구 절차·참조 또는 사전 기록된 waiver/비동작 예외의 범위와 이유 |
| `verification` | criteria별 checks, 필요한 QA/Reviewer와 시점, acceptance 경계 |
| `refresh` | 마지막 관측, 알려진 변화, 영향 판단·증거 재검증·남은 hold |

Envelope는 Markdown 기록의 내용 규약이다. JSON 파일·저장 API·실행 state machine을 요구하지 않는다.

### 7.3 기존 brief 순서 유지

Specialist brief는 현재 8개 필드 순서를 유지한다.

| 기존 순서 | Envelope 내용 |
|---|---|
| 1. Goal | Task 식별자·선택 경로·결과 |
| 2. Criteria | Criteria ID와 필수 검증 조건 |
| 3. Exact scope/ownership | Target·현재 상태·소유권·canonical record 위치 |
| 4. Constraints/decisions | 승인·F1~F8·위험/깊이·TDD·적용 생략·역할 경계 |
| 5. Evidence | Instruction fingerprint·읽은 절·승인/문서·검증 근거 |
| 6. Prior findings | 변경 delta·무효화/재검증·hold |
| 7. Exact next objective | 다음 할당의 한정된 목표 |
| 8. Return format | 필요한 증거·판정·한계·미해결 내용 |

별도 아홉 번째 필드나 전체 이력 복사본을 만들지 않는다. 기존 delta/`unchanged`는 접근 가능한 canonical record를 전제로 사용한다. 새 역할에는 hash만 주지 않고 native profile, 수행에 필요한 실제 지침, 정확한 절 경로와 criteria를 전달한다. [Codex brief](../../../codex/skill/references/coordination.md#token-discipline-and-handoffs), [Claude brief](../../../claude/skill/references/coordination.md#token-discipline-and-handoffs).

## 8. 변화와 영향별 재검증

Target-choice validity와 evidence validity를 각각 판단한다.

| 관측 변화 | Target choice | 영향받는 증거·행동 |
|---|---|---|
| 승인된 task/docs commit 또는 예상된 dirty 변화 | 변화만으로 무효화하지 않음 | 최신 HEAD·변경·보존·소유권을 기록하고 관련 criteria/check 영향 평가 |
| 검사 이후 관련 파일 변경 | 별도 영향 없음 | 이전 결과가 현재 상태를 설명하지 못하면 검증 evidence를 `unverified`로 두고 필요한 검사를 다시 수행 |
| Instruction hash/source 변경 | 자동 취소하지 않음 | 변경 지침 및 연결된 fast/risk/TDD/권한 판단을 재평가 |
| Scope/criteria/method/risk 변경 | 기존 변경 계약에 따름 | 영향받은 작업 hold, 필요한 수정 승인·준비·fresh-role 적용 |
| Workspace/repository/target 변경 또는 신뢰 상실 | 기존 target-choice 규칙 적용 | 필요한 새 선택·상태 확인 전 dependent edit 보류 |
| 소유권 충돌·예상하지 못한 상태·실패·partial/unknown | 관련 신뢰 조건 확인 | 영향받은 작업 중지, 기존 incident/recovery 절차 |
| 필수 근거 누락·접근 불가·영향 불명 | 유효성을 추정하지 않음 | Fast gate 미입증, 입력 해결 전 hold 및 전체 평가 |
| Direct check 실패 또는 QA finding | 그 자체로 취소하지 않음 | 기존 Implementer·QA 재검사 ownership으로 반환 |

무관한 근거를 모두 폐기하거나 이미 유효한 승인을 다시 받는 절차를 추가하지 않는다. HEAD가 같다는 이유만으로 instruction·파일·검사 근거가 유효하다고 판단하지 않는다. 기존 대상 재사용 기준은 [Codex](../../../codex/skill/references/handoff.md#choice-lifetime-and-reuse)와 [Claude](../../../claude/skill/references/handoff.md#choice-lifetime-and-reuse)를 따른다.

## 9. 보존하는 실행 경계

- Fast 선택은 TDD waiver를 만들지 않으며 명시적 TDD는 기존처럼 우선한다.
- Waiver는 기존 조건을 모두 충족해 편집 전에 기록되어야 하고 RED-GREEN만 생략한다.
- Fast 조건을 벗어난 구현은 기존 fresh Implementer와 필요한 fresh QA 규칙을 따른다.
- 같은 task 수정·재검사 재사용과 승인된 plan/criteria amendment의 Implementer 재시작 요구를 유지한다.
- 직접 검사 실패 이후 Orchestrator가 직접 수정을 계속하지 않는다.
- QA/Reviewer 독립성과 최종 plan Reviewer correction 순서를 보존한다.
- Envelope·역할 보고·통과 검사는 acceptance·commit·완료 판단을 대신하지 않는다.
- 기존 no-plan 경로에 새 spec/plan·자동 commit 의무를 추가하지 않는다.
- Small/no-plan 경로를 지원하지 않는 cooperative CLI에 새 지원을 추가하지 않는다.
- Push·merge·deploy·publish 권한을 추가하지 않는다.

## 10. 변경 파일과 회귀 계약

### 10.1 지침·문서

정확한 관련 절만 변경한다.

- `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- 양 플랫폼 `skill/references/handoff.md`
- 양 플랫폼 `skill/references/planning.md`
- 양 플랫폼 `skill/references/verification.md`
- 양 플랫폼 `skill/references/coordination.md`
- `docs/harness-operation.md`

Canonical policy source·정책 ID/효과/역할·review routing·profile permissions·models·installer/runtime code는 변경하지 않는다. Upstream brainstorming/TDD skill도 수정하지 않는다.

### 10.2 검사와 fixture

| 경로 | 역할 |
|---|---|
| `tests/node/instruction-layout.test.mjs` | 기존 전체 읽기 assertion을 완전한 fast gate·full-path fallback·before-action gate 검사로 교체 |
| `tests/test_claude_payload.py` | 직접 경로·위험·TDD·기록·구조와 플랫폼 차이 보존 |
| `tests/test_harness_contract.py` | 승인·대상 재사용·고정 brief·역할·hold 계약과 mutation 경계 |
| `tests/test_arc_policy.py` | acceptance/commit·target-choice와 상태 분리 회귀 |
| `tests/node/fixtures/instruction-contracts.json` | 승인된 변경 절의 expected clause와 필요한 hash 갱신 |
| `tests/node/role-policy.test.mjs` | Canonical policy와 review routing 불변 검증 |
| `MANIFEST.sha256` | 수정된 보호 payload의 생성 hash 정합성 |

현재 전체 읽기 조건을 요구하는 [assertion](../../../tests/node/instruction-layout.test.mjs)을 삭제하는 것으로 통과시키지 않는다. 다음을 독립적으로 검사한다.

- F1~F8 각각을 빠뜨리면 fast-path contract 실패
- false/unknown/missing condition에서 full-path fallback 유지
- 첫 편집 gate·TDD·QA/Reviewer·acceptance/commit 조건 제거 시 실패
- 승인된 HEAD 변화만으로 choice를 취소하거나 실제 상태 확인을 생략하면 실패
- 새 역할에 hash만 전달해 실제 지침/brief를 빠뜨리면 실패
- source/hash mismatch 뒤 영향 재검증과 hold를 생략하면 실패

이 검사는 작성된 prompt contract를 대상으로 하며 새 실행 classifier를 만들지 않는다.

### 10.3 기존 Python literal 불일치

현재 문서와 일부 Python literal assertion 사이의 차이는 테스트 실행으로 확인되지 않았다. 계획된 기준선 확인에서 검사·결과·영향을 분리한다. 이번 변경에 직접 걸리는 fast/direct·읽기·envelope·재사용 literal은 승인된 의미에 맞춰 조정할 수 있다. 무관한 실패의 assertion을 삭제·skip하거나 범위를 줄여 숨기지 않는다. 필수 검사 실패가 해결되지 않으면 acceptance를 보류한다.

### 10.4 기존 payload manifest 기준선

현재 checkout을 읽기 전용으로 확인하는 중, `prepareOperation`의 payload 검증이 mutation 전에 다음 오류로 중단된 사실을 관측했다: `Payload verification failed: Missing entry or hash mismatch: lib/tui/setup.mjs`. 이 오류가 이번 변경으로 생겼다고 취급하지 않는다. 문서 payload 변경은 `MANIFEST.sha256`를 다시 생성해야 하며, 계획에서는 이 사전 상태를 기준선으로 분류하고 generated hash 업데이트 범위를 명확히 한다. unrelated 파일의 동작 변경이나 편집은 이 task에 포함하지 않는다.

## 11. Acceptance Criteria

| ID | 완료 조건 |
|---|---|
| AC-1 | 양 플랫폼에서 F1~F8이 전부 `proven`일 때만 기존 direct 경로를 선택하며 기존 자격을 넓히지 않는다. |
| AC-2 | 최초 fast 판정의 네 핵심 절, 조건부 TDD 절과 행동별 추가 읽기가 분명하고 불확실하면 기존 전체 평가로 돌아간다. |
| AC-3 | Fingerprint가 실제 source-set·파일 hash·메시지 참조·읽은 문맥을 구분하고 HEAD/package manifest로 대체하지 않는다. |
| AC-4 | 같은 문맥·같은 source/hash는 본문 재주입 없이 재사용할 수 있고 새 문맥·새 역할·변경 source·불완전 입력은 잘못 재사용하지 않는다. |
| AC-5 | Envelope 필드가 기존 record/inline scope record와 고정 brief 순서 안에 있으며 새 store·API·파일을 요구하지 않는다. |
| AC-6 | 승인된 HEAD/dirty 변화만으로 target choice를 무효화하지 않고 영향받는 상태·scope·risk·검사 근거를 별도로 갱신한다. |
| AC-7 | 승인·target·소유권·TDD·fresh-role·QA/Reviewer·acceptance·commit 경계를 보존한다. |
| AC-8 | 누락·충돌·접근 불가·불명확한 영향·실패 시 dependent work를 보류하고 fallback을 권한/입력 우회로 사용하지 않는다. |
| AC-9 | 양 플랫폼 문서·관련 계약검사·fixture·canonical policy·payload manifest가 정합하며 assertion 범위를 완화하지 않는다. |
| AC-10 | 범위 밖 runtime/installer·profile·model·policy 값과 upstream skill이 유지된다. |

필수 사례검증은 다음을 포함한다.

- 승인된 비동작 예외와 단일 검증 경로가 있는 로컬 문구 수정
- 한 파일의 security/permissions 또는 public-interface 변경
- F1~F8 각각의 누락·불명·미충족
- 명시적 TDD와 기록된 waiver의 충돌
- 동일 문맥/동일 hash, 새 문맥/동일 hash, 동일 문맥/변경 hash
- 승인된 commit/dirty 변화와 영향 없는 근거의 유지
- 관련 파일 변경 뒤 기존 검사 증거의 무효화
- hash만 전달된 새 역할의 불완전 brief
- source 접근 불가·소유권 충돌·direct check 실패

공유 workflow 변경에 필요한 fresh QA와 최종 독립 whole-change Reviewer를 적용한다. 실행 순서·명령·task/commit 경계는 spec 승인 이후 plan에서 정한다.

## 12. 증거의 한계와 미결정 사항

구조·mutation·문서 contract 검사는 작성된 규칙과 회귀 방어를 입증할 뿐 실제 agent 준수, instruction 자동 재로드 또는 처리시간 감소를 입증하지 않는다. 실제 성능을 주장하려면 지침 재독 범위·역할 생성 횟수·end-to-end 지연을 나눠 대표 작업으로 측정한다.

추가 사용자 결정은 없다. 남은 기준선 분류, 실행 순서, 명령, 테스트 허용 범위와 handoff 준비는 승인 후 plan에서 확정한다.

## Self-review

- 승인된 세 단계만 구체화했고 compiler·DAG·runtime classifier를 추가하지 않았다.
- 충분조건과 실제 편집 권한을 구분하고 기존 자격을 넓히지 않았다.
- 최초 판정 절 다섯 개, 후속 trigger와 full-path fallback을 분리했다.
- Source-set·hash·메시지·문맥, 동일 대화 재사용, 변경/실패 복귀를 명시했다.
- Installer manifest와 실제 설치 지침 fingerprint, 디스크 profile과 active role context를 구분했다.
- Envelope를 기존 고정 brief 순서에 배치해 새 저장소를 요구하지 않는다.
- 승인된 HEAD/dirty 변화에서 target-choice 유효성과 evidence 갱신을 분리했다.
- 변경 파일·회귀 계약·acceptance 기준과 기존 manifest baseline 오류의 분류를 포함했다.
- 테스트를 실행하거나 제품/테스트 코드를 편집하지 않았다. plan을 작성하지 않았다.
