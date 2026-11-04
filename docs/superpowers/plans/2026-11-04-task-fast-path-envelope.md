# 작은 작업 Fast Path와 Task Envelope 구현 계획

| 항목 | 값 |
|---|---|
| 버전 | v1, 사용자 승인 대기 |
| 저장소 | `/Users/ma-24-007/Desktop/workspace/arc` |
| 선택 대상 | 현재 checkout, `refactor/arc-instructions` |
| 기준 HEAD | `7de7541aaa9daf45bfec3019825ee8a46fbf6172` |
| 승인 설계 SHA-256 | `5d019d47849ed1f8c3a5f75224363600e94decd9918573815c8ebb9fecd7a1ef` |
| 승인 spec SHA-256 | `8fe3c0aa813c509ac750e463d3437931444047e4f4454e202c84d1b6cc808ecd` |
| Spec | [Task Fast Path와 Task Envelope 정식 명세](../specs/2026-11-04-task-fast-path-envelope-spec.md) |

## 목표와 범위

기존 ARC 권한·승인·TDD·검증 경계를 유지하면서, 모든 조건이 입증된 경우에만 간소 경로를 선택하고 유효한 instruction 읽기 결과를 같은 문맥에서 재사용한다. 기존 작업 기록에 적용 지침 fingerprint와 작업·승인·위험·검증·갱신 근거를 묶고, 상태 변화가 있으면 영향받은 판단과 증거만 다시 확인한다. 하나라도 불명확하면 기존 전체 평가·보류 절차를 따른다.

기존 지침과 계약 검사만 변경한다. 새 runtime 분류기, API, 저장소, envelope 파일, dependency는 추가하지 않는다. 이 cross-platform workflow 변경에는 Orchestrator direct path를 사용하지 않는다.

## 승인 및 시작 조건

설계와 spec은 각각 별도 사용자 승인을 받았다. 이 계획의 사용자 승인이 있어야 아래 파일 편집과 테스트 변경·실행을 시작한다. 승인된 내용은 변경 범위를 넓히지 않는다.

계획 승인 뒤 Orchestrator가 승인된 설계·spec·plan을 로컬 docs-only commit으로 기록하고, 정확한 문서 hash와 실제 HEAD를 handoff에 반영한 다음 fresh Implementer 한 명에게 TASK-01 전체를 맡긴다. Push, merge, deploy, publish는 범위에 없다. 작업 중 범위·방법·위험이 달라지거나 대상·소유권·기준선에 설명되지 않은 문제가 생기면 영향받는 작업을 보류하고 필요한 승인을 다시 받는다.

## 전체 제약과 수락 기준

- Fast gate는 spec의 F1~F8을 모두 `proven`으로 판정할 때만 통과한다. `unmet`, `unverified`, 해석 불가, source-set 불확실성은 fast path를 열지 않는다.
- 최초 판단은 현재 플랫폼 ARC `SKILL.md`에 더해 `handoff.md`의 `Orchestrator direct path for small tasks`, `planning.md`의 `Authorization and scope`와 `Design path and plan depth`, `verification.md`의 `Risk-scaled execution`을 읽는다. Feature/bug/behavior 편집 또는 TDD exception 후보이면 TDD 절도 판단 전에 읽는다.
- Fast path는 행동별 필수 읽기, 첫 편집, target 선택, TDD, 새 역할의 실제 지침 전달, fresh QA/Reviewer, 수락, commit을 면제하지 않는다.
- Instruction fingerprint는 적용 source-set의 실제 파일 전체 바이트 hash와 읽은 절·revision·path·동일 문맥 근거를 구분해 기록한다. 저장소 HEAD나 installer manifest를 지침 hash로 대체하지 않는다.
- Task envelope는 기존 canonical handoff record 또는 기존 inline scope record에 둔다. Specialist brief의 기존 8개 필드 순서도 유지한다.
- Target 선택과 evidence의 현재성은 별도로 판단한다. 승인된 HEAD/dirty 변화만으로 target 선택을 취소하지 않으며, 관련 파일·지침 변경은 영향받은 evidence를 갱신한다.
- 역할 profile, policy, installer/runtime, upstream skill, 역할별 권한 및 제품 동작을 바꾸지 않는다. 보호 대상 파일은 승인된 범위 밖에서 편집하지 않는다.

## 단일 작업

| ID | 목표·소유권 | 선행 조건 | 수락 전 증거 | Hold 조건 |
|---|---|---|---|---|
| TASK-01 — Fast Path와 Task Envelope 계약 적용 | Fresh Implementer 한 명이 양 플랫폼 지침, 운영 문서, 기존 검사·fixture와 generated manifest를 함께 변경한다. 이 계약들은 불가분 단위다. | 이 계획 승인, docs-only commit, 정확한 handoff, 편집 전 기준선 분류와 tests-first RED | AC-1~AC-10 검증, 필수 회귀검사, 보호 파일 불변 증거, fresh QA 및 필수 재검사, 수락 후 focused commit | 승인·입력 누락, 미분류 기준선, 소유권/대상 충돌, 필수 검사 실패·미검증, 예상 밖 파일 변경 또는 승인 범위 변경 |

작업 순서는 `기준선 기록 → 집중 계약 검사 추가 및 RED 확인 → 지침·fixture 수정 → manifest 생성 → GREEN 및 회귀검증`이다. 하위 체크박스와 RED/GREEN 단계는 별도 task나 commit이 아니다.

## 파일 소유권

모든 상대 경로는 저장소 루트 기준이다.

**Implementer 편집 대상**

- `codex/skill/SKILL.md`, `claude/skill/SKILL.md`
- 양 플랫폼 `skill/references/handoff.md`, `planning.md`, `verification.md`, `coordination.md`
- `docs/harness-operation.md`
- `tests/node/instruction-layout.test.mjs`
- `tests/test_claude_payload.py`, `tests/test_harness_contract.py`, `tests/test_arc_policy.py`
- `tests/node/fixtures/instruction-contracts.json`
- `MANIFEST.sha256`는 기존 생성기로만 갱신

새 제품 파일이나 테스트 파일은 만들지 않는다. 추가 파일이 필요해지면 Orchestrator가 이유·영향·승인 범위를 재평가하기 전까지 해당 변경을 보류한다.

**검증만 하는 보호 대상:** `lib/tui/setup.mjs`, `lib/policy/role-policy.json`과 관리 블록, `lib/installer/`, `lib/runtime/`, 플랫폼별 agents·models·runtime 사본, vendored/upstream brainstorming·TDD 원문. `tests/node/role-policy.test.mjs`는 기존 불변 계약 검사로 실행하고 편집하지 않는다.

## 실행 순서와 검증

### 1. 기준선 및 알려진 manifest 불일치 분류

현재 checkout은 선택된 branch와 기준 HEAD에 있다. 시작 시점에는 승인된 설계·spec 두 문서만 Orchestrator 소유의 untracked 파일이다. 다음 manifest 오류는 이미 관측한 기준선이며 계획상 구현 변경으로 취급하지 않는다.

```text
Payload verification failed:
Missing entry or hash mismatch: lib/tui/setup.mjs
```

현재 `MANIFEST.sha256`에는 `lib/tui/setup.mjs` hash `1aa2ff438e13cb91a5a643b723822fb44ae2901cdd379c55efc51267500584db`가 있고, 실제 파일 hash는 `6b43c006b288aee32e6e4cb1f69383635d1df356204f56cb80cf07f64569ef08`다. Implementer는 이 discrepancy가 기준선인지 다시 확인하고 다음 기준선 검사를 수행한다. `lib/tui/setup.mjs` 내용은 편집하지 않는다.

```sh
git diff --exit-code 7de7541aaa9daf45bfec3019825ee8a46fbf6172 -- lib/tui/setup.mjs
node scripts/update-manifest.mjs --check
node --test tests/node/instruction-layout.test.mjs tests/node/role-policy.test.mjs
python3 -B -m unittest discover -s tests -p 'test_claude_payload.py' -v
python3 -B -m unittest discover -s tests -p 'test_harness_contract.py' -v
python3 -B -m unittest discover -s tests -p 'test_arc_policy.py' -v
```

기준선 실패마다 `baseline/current/unknown`, 관련 AC, 영향받는 검사를 기록한다. 알려진 manifest 실패는 신규 RED나 구현 회귀로 표시하지 않는다. 새로운 실패·불명확한 영향은 관련 작업을 보류하고 Orchestrator에게 보고한다. `prepareOperation` 검증은 자동 재시도하지 않는다.

### 2. 집중 계약 검사 — 지침 수정 전 RED

기존 검사 파일을 확장해 아래 실패 유형을 검사하고, 제품 지침을 바꾸기 전에 새 계약의 RED를 확인한다. 기존 계약 검사와 baseline 실패는 새 RED와 구분한다.

| 새 검사 의도 | 확인할 조건 |
|---|---|
| F1~F8 전체 입증 | 각 조건이 canonical 직접 경로에 있고 `all proven`만 허용. 각 조건 제거, `all`을 `any`로 바꾸기, `unverified` 허용을 mutation으로 거부 |
| 읽기와 행동별 gate | 최초 네 핵심 절 및 조건부 TDD 절, 행동별 추가 읽기, full fallback이 모두 남아 있고 이후 실행 gate가 면제되지 않음 |
| Fingerprint 재사용 | source-set·resolved path·실제 hash·동일 문맥을 확인. 새 역할에 hash만 전달하거나 HEAD/manifest로 대체하지 않음 |
| Envelope·brief | 최소 9개 필드가 기존 기록에 연결되고 고정 brief 8개 순서가 유지됨 |
| Target/evidence 분리 | 승인된 HEAD/dirty 변화만으로 target choice를 취소하지 않으며 현재 상태·소유권 및 관련 evidence 영향은 확인 |
| 영향별 갱신·보류 | 관련 변경, 접근 불가, 불명확, 검사 실패에서 evidence 재검증 또는 기존 hold를 요구 |
| 실행 경계 보존 | TDD·첫 편집·fresh role·QA/Reviewer·acceptance·commit 경계를 제거하는 mutation을 거부 |

검사는 양 플랫폼의 canonical 정의와 fixture를 대조한다. 다른 문서에 F1~F8 이름만 나열한 것은 검사 통과 근거로 삼지 않는다. 테스트 helper를 제품 runtime 분류기로 만들지 않는다.

### 3. Canonical 지침과 연결 문서 변경

- 양 플랫폼 `handoff.md`의 기존 `Orchestrator direct path for small tasks`에서 F1~F8, `Instruction fingerprint`, `Task envelope`, 상태/evidence 갱신을 정의한다. 다른 절은 이 정의를 참조해 중복 정책을 만들지 않는다.
- `SKILL.md`는 무조건 전체 조건을 먼저 읽는 흐름을 fast-first 및 full fallback으로 바꾸고 최초 판단의 네 절·조건부 TDD 절을 정확히 연결한다.
- 양 플랫폼 `planning.md`, `verification.md`, `coordination.md`와 `docs/harness-operation.md`는 기존 승인·문서 깊이·위험·역할 순서를 유지하면서 canonical handoff 계약을 참조한다.
- Hash 예시는 이미 식별된 source-set에 대한 Node built-in 일괄 읽기만 보여준다. 설치·새 명령·저장소를 추가하지 않는다.
- `instruction-contracts.json`은 승인된 변경 절의 기대 literal만 조정한다. 기존 검사를 삭제하거나 약화하지 않는다.

### 4. Manifest 생성과 최종 검사

지침·fixture 수정 뒤 기존 도구만 사용한다.

```sh
node scripts/update-manifest.mjs
node scripts/update-manifest.mjs --check
node scripts/update-role-policy.mjs --check
node --test tests/node/instruction-layout.test.mjs tests/node/role-policy.test.mjs
python3 -B -m unittest discover -s tests -p 'test_claude_payload.py' -v
python3 -B -m unittest discover -s tests -p 'test_harness_contract.py' -v
python3 -B -m unittest discover -s tests -p 'test_arc_policy.py' -v
node --test tests/node/manifest.test.mjs tests/node/profile-render.test.mjs tests/node/parity-check.test.mjs
npm test
node scripts/check-installer-parity.mjs --root /Users/ma-24-007/Desktop/workspace/arc --complete
git diff --exit-code 7de7541aaa9daf45bfec3019825ee8a46fbf6172 -- lib/tui/setup.mjs
```

Manifest diff는 승인된 플랫폼 지침 및 테스트 fixture 변경에 따른 payload와 알려진 `lib/tui/setup.mjs` hash 정합화로만 설명되어야 한다. 보호 대상 내용의 예상 밖 변경은 보류한다. 전체 Node 테스트와 parity의 mapped Node/Python 검사까지 통과해야 해당 검증을 완료로 기록한다. 환경 문제, 실패, 미실행 검사를 성공으로 간주하거나 범위를 줄여 우회하지 않는다.

## AC-1~AC-10 수락 증거

| AC | 수락할 증거 |
|---|---|
| AC-1 | 양 플랫폼 F1~F8 완전성, all-proven 조건, 조건 누락·unsafe override mutation 거부 |
| AC-2 | 네 핵심 절·조건부 TDD·행동별 trigger·full fallback 및 참조 유효성 |
| AC-3 | source-set, 파일/메시지 구분, path/hash/revision/context, HEAD/manifest 대체 금지 |
| AC-4 | 동일 문맥 재사용, 새 문맥 재독, 새 역할 실제 입력, source mismatch 재평가 |
| AC-5 | envelope 필드, 기존 record 위치, brief 8개 순서, 신규 저장소/API 부재 |
| AC-6 | 승인된 HEAD/dirty 변화의 선택 유지와 영향받은 evidence의 별도 갱신 |
| AC-7 | TDD·승인·target·fresh role·QA/Reviewer·수락·commit 경계 회귀 |
| AC-8 | 누락·불명·접근 불가·충돌·실패에서 hold 및 권한 우회 금지 |
| AC-9 | 관련 Node/Python·fixture·policy·manifest 결과와 baseline/current 분류 |
| AC-10 | 범위 밖 diff 부재, 특히 `lib/tui/setup.mjs` 내용 불변 및 manifest hash 정합성 |

## QA, 수락, commit 및 최종 Reviewer

Fresh QA는 AC별 검증 방법·실행 여부·관찰 결과·판정·한계를 독립 기록한다. Implementer 보고나 passing command만으로 acceptance를 추정하지 않는다. 초기 최종 Reviewer 전 finding은 Implementer가 수정하고 fresh QA가 영향과 수정을 재검증한다. Orchestrator는 AC·필수 검사·QA findings·보호 범위 증거를 연결해 TASK-01을 수락한 뒤 focused 구현 commit 하나를 만든다. 제안 메시지는 `작은 작업의 충분조건 경로와 작업 근거 기록을 정비`다.

모든 task 수락, commit, 필수 QA/recheck 완료 후 독립 Reviewer가 전체 변경을 최종 검토한다. Reviewer는 조건의 보수성, 권한·예외, fingerprint와 문맥 재사용, target/evidence 분리, 회귀 누락을 확인한다. 최종 plan Reviewer finding은 필요한 승인·diff를 준비해 Implementer → Reviewer 재검사로 해결한다. QA를 재배정하지 않으며 이전 QA는 수정 후 증거를 대신하지 않는다.

## 계획 자체 검토

- 승인된 정식 spec의 범위와 AC-1~AC-10을 하나의 불가분 task와 대응시켰다.
- 테스트 파일 수정 및 실행 명령을 계획 승인의 명시 범위에 넣었다. 현재 테스트 실행은 아직 하지 않았다.
- 이미 알려진 payload manifest 불일치를 baseline으로 분류하고 `lib/tui/setup.mjs` 내용 변경을 금지했다.
- Orchestrator direct path를 사용하지 않고 Implementer, fresh QA, 최종 독립 Reviewer 및 acceptance/commit 순서를 구분했다.
- 추가 제품 결정·dependency·runtime 동작·배포 작업은 없다.

## Amendment v2 — 기준선 검증 예외와 수락 조건

상태: **사용자 승인 완료**

- plan v1 원문 SHA-256: `187da71d13f2a9cfb822d88c0971b985e832a7eb783d8b24cab482a5e16617b0`
- 승인된 amendment 원문 SHA-256: `49c59fce5058b7943237f2fd41929839c6c2f19298d0dd6c7dd17d39ac2b7045`
- 승인 응답: `승인하고 계속 진행`; user message reference `call_a9919061e5df465f82e150e7969f17c1`
- Amendment 원문은 `.git/arc/handoff/2026-11-04-task-fast-path-envelope-v2-amendment-approved.md`에 같은 바이트로 보존했다.

### 변경 근거

승인 plan v1의 `npm test` 완료 조건은 구현 종료 시점까지 충족되지 않았다. 현재와 승인 baseline archive 모두 `tests/node/tui-setup.test.mjs`가 30초 관찰 뒤 같은 첫 32개 subtest만 완료하고 종료하지 않았다. 보호 대상 `lib/tui/setup.mjs`는 이번 구현 범위 밖이며 baseline과 동일하다. 현재 `npm test`도 60초 관찰에서 종료 결과를 얻지 못했다. 이를 성공으로 기록하지 않는다.

다른 기존 실패도 기준 baseline과 대조했다. Python 전체 suite의 normalized `FAIL`/`ERROR` 식별자는 새 항목이 없다. Payload suite의 유일한 실패와 installer parity의 유일한 실패도 baseline archive에서 재현됐다. `tui-setup.test.mjs`를 제외한 90개 Node test 파일은 current 12개, baseline 22개 고유 실패 식별자를 보였고, checkout-root를 정규화한 비교에서 새 식별자 0개, 해소 10개였다.

### 승인된 acceptance amendment

plan v1의 `AC-9`, 집중·회귀검증, 수락·commit 조건에 다음 예외를 추가한다.

1. 전체 명령은 수행한 결과를 기록한다. 기준선 실패와 timeout을 성공으로 표시하지 않는다.
2. 이번 변경을 수락하려면 새 fast-path 계약 검사(Node 46/46)와 세 신규 Python focused 검사(각 1/1)가 통과해야 한다. `node scripts/update-manifest.mjs --check`와 `node scripts/update-role-policy.mjs --check`도 통과해야 한다.
3. 기준선과 비교된 Python 전체 suite, payload suite, installer parity, 그리고 TUI setup을 제외한 90개 Node test 파일은 checkout root만 정규화해 테스트 실패 식별자를 비교한다. 새 실패 식별자가 없고, 변경으로 해소된 baseline 실패가 유지될 때 수락 근거로 사용할 수 있다.
4. 전체 `npm test`는 계속 `unverified`로 보고한다. 수락은 current와 승인 baseline에서 `tui-setup.test.mjs`의 동일한 30초 hang 및 같은 완료 subtest 수가 관찰되고, 나머지 Node 파일의 위 비교에서 새 실패가 없다는 기록을 근거로 진행할 수 있다. 이 예외는 전체 테스트 통과를 의미하지 않는다.
5. 보호 대상 `lib/tui/setup.mjs`나 해당 baseline 테스트는 이번 task에서 수정하지 않는다. 기존 assertion을 삭제·skip·약화하지 않고 baseline 실패를 숨기지 않는다. 승인된 기존 17개 구현 파일 외의 제품·검사 파일 변경을 허용하지 않는다.

이 amendment는 구현 file scope를 바꾸지 않는다. 수락 전 Fresh QA는 현재 diff와 위 amended acceptance evidence를 재확인하고, Orchestrator는 QA 결과·필수 검사·보호 범위 증거를 연결한다. Push, merge, deploy, publish는 포함하지 않는다. 구조 검사는 실제 agent 준수나 처리시간 단축을 증명하지 않는다.
