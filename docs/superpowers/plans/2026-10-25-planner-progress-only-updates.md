# Planner 진행 보고와 상태 gate 구현 계획

> **실행 역할:** ARC 역할·승인·검증 경계를 따른다. Implementer가 승인된 파일을 구현하고 fresh QA가 필요한 검증을 수행한다. Orchestrator가 문서 준비·수락·commit을 담당하며, 독립 Reviewer가 마지막에 전체 변경을 검토한다. 체크박스는 진행 기록이며 별도 commit 단위가 아니다.

**상태:** 전체 개정 plan 승인 완료. 승인 본문 SHA-256 `550e0ecd7d48959932092785043a1d28aabf53b97303b2010be165b593b4fbdc`, 사용자 승인 2026-10-25 15:20:54 UTC. 승인 메타데이터 기록, 문서 batch commit, handoff gate 완료 전까지 Implementer는 보류한다.

**Goal:** 기존 진행 보고·전체 초안·저장 문서 승인 계약을 보존하면서 durable Planner 호출 gate와 중재 가능한 native 경로의 검증·deny 연결을 구현한다.

**Architecture:** 기존 T1 계약을 완결한 다음 공통 상태 판정기와 durable ledger를 구현하고 native adapter·설치 경로에 연결한다. cooperative 준비·기록, adapter 응답, 실제 host enforcement와 관찰 가능한 경로의 탐지 증거를 구분한다.

**Tech Stack:** JavaScript ESM, JSON 정책·상태, TOML/Markdown 프로필·참조, Node.js `node:test`, Python `unittest`.

**Spec:** `/Users/yunho/.codex/worktrees/planner-progress-policy/arc/docs/superpowers/specs/2026-10-25-planner-progress-only-updates-design.md`

**유일한 구현 기준:** 승인 본문 SHA-256 `837b36f99c8355922799b3b73ef48ed0237042129cef2450490e6d0f8f031106`, 사용자 승인 2026-10-25 14:45:50 UTC. 승인 메타데이터를 포함한 현재 spec 파일 SHA-256은 `9ab641bf9c2959886a5f780475cf84dd704bba28f2b389e5d27ef1db0dcf361a`이다.

**Plan 경로:** `/Users/yunho/.codex/worktrees/planner-progress-policy/arc/docs/superpowers/plans/2026-10-25-planner-progress-only-updates.md`

**분류:** Architectural, Significant risk.

## 공통 제약과 보존 상태

- 실행 대상은 `/Users/yunho/.codex/worktrees/planner-progress-policy/arc`, 브랜치는 `chore/planner-progress-only-updates`, 현재 HEAD는 `d6241835a771c05ee2d9e5776986213f0d93ea7f`다. base/master는 `2d95fc4d75aab92bba5e5bf9029a6829f86fcfc9`다.
- 기존 tracked 변경 11개를 보존한다. 구현·테스트·생성 파일 10개는 기존 Implementer 작업이며 spec은 Orchestrator 소유다. 이 plan의 저장으로 생기는 문서 변경도 Orchestrator 소유다.
- 기존 변경을 되돌리거나 덮어써서 새 작업을 시작하지 않는다. 원본 checkout은 실행 대상이 아니다.
- **새로 추가하거나 수정하는 ARC harness instruction prose는 간결하고 명확한 영어로 작성한다.** plan 문서는 한국어로 유지한다.
- Planner 단독 저작, Orchestrator 통합·저장·검토·승인 요청, 통합 수정 절차와 순차 승인을 보존한다.
- 형식 변환·재표현만·저장 오류 복구만·patch 오류 복구만인 작업은 Orchestrator 책임이며 Planner 호출 근거가 아니다.
- 별도의 적격한 실질적 미충족 기준은 과거 저장·patch 실패만으로 거부하지 않는다.
- 고정 호출 cap·새 시간 제한·진척량 임계값을 만들지 않는다. 불완전한 초안을 수락하지 않는다.
- broad inherited baseline 수리, 무관한 정책·프로필 변경, UI·runtime 출력 숨김과 일반 앱 전체 호출의 하드 차단은 제외한다.
- cooperative 기록을 native verified provenance로 승격하지 않는다. 합성 테스트·hook 등록·JSON receipt를 live enforcement 증거로 표현하지 않는다.
- production provider 부재는 T3 조사·구현을 시작하지 않을 이유가 아니다. 필요한 context 구성 가능성을 조사·구현하고, 부족하면 가능한 관찰·탐지와 정확한 coverage를 산출한다. 실제 native enforcement 미검증 상태는 별도로 유지한다.

## 승인·문서 이력과 구현 전 gate

과거 승인 이력은 삭제하거나 새 범위의 승인으로 소급하지 않는다.

| 이력 | 승인 본문 |
|---|---|
| 최초 spec, 13:32:02 UTC | `68727db5f8bcc64a86bfb84865bea687e46d29dd45cad650f1f31093c4f4df1a` |
| 최초 plan, 13:40:45 UTC | `1acae8d212623ff0cdef7e04ed00c193e4eb75dc8be3991e93fa4688f035342` |
| baseline-aware plan, 14:10:23 UTC | `bb2e18d8b389b468b757d84bdfcaf0f53e3d3d7bded49b62eeed87bab3efded3` |
| coordination spec, 14:21:30 UTC | `a9fef2199711fc77c6cf666112b4c71c752c062caa89e96e7449db47fac56374` |
| Architectural 설계 | 2026-10-25 14:33:25 UTC 승인 |
| 현재 전체 spec | 위 `837b36…`, 14:45:50 UTC 승인 |
| 이 plan | 이전 저장본 SHA-256 `edaabb05d3836059e42263ba828f007a45bbf5b2f3ed3502729974d7c2721dcc`; 승인 본문 SHA-256 `550e0ecd7d48959932092785043a1d28aabf53b97303b2010be165b593b4fbdc`, 사용자 승인 2026-10-25 15:20:54 UTC |

기존 문서 commit의 `d1d616… → 65d9d5… → b9e739… → d62418…` 대응과 복구 가능한 이전 본문을 유지한다. 과거 완료 체크는 당시 준비 이력이며 이번 plan 승인이나 구현 재개 권한을 뜻하지 않는다.

Orchestrator가 다음을 완료한다.

- [x] 이 plan을 통합·저장·자체 검토하고 개별 사용자 승인을 받는다.
- [x] 적용 문서 집합이 현재 승인 spec과 승인된 이 plan의 정확한 버전·경로·hash를 포함하며 미작성·미승인 문서나 미결정 의존성이 없는지 확인한다.
- [x] 변경 전후 본문·hash, 승인 시각·근거, 영향 작업과 보류·재개 조건을 기록한다.
- [x] 대상·HEAD·source/target 상태·소유권·실제 index를 확인하고 기존 안전한 절차로 원래 planning-document commit을 갱신한다. 별도 문서 commit·fixup은 만들지 않는다.
- [x] 기존 11개 WIP를 stage하거나 폐기하지 않고 승인 문서만 기록했는지 확인한다. 불명확한 상태·소유권·공유 이력은 보류한다.
- [x] 최종 Git 상태와 Common handoff gate를 재검증한 뒤 fresh Implementer를 배정한다.

문서 작성·검토·승인 중에는 stage·commit하지 않는다. 문서 commit은 이후 T1–T3의 focused implementation commit과 구분한다.

## 공통 작업·소유권·역할 freshness gate

T1, T2, T3는 서로 다른 최상위 계획 작업이다. 각 작업은 **fresh Implementer로 시작**한다. 이전 작업의 Implementer를 다음 작업에 재사용하지 않는다.

- **T1:** fresh Implementer를 배정한다. 이미 중단된 `planner_progress_t1` Implementer를 재개하거나 재사용하지 않는다. 기존 WIP·증거·소유권은 새 brief로 인계한다.
- **T2:** T1 수락·commit과 T2 handoff 후 별도의 fresh Implementer를 배정한다.
- **T3:** T2 수락·commit과 T3 handoff 후 별도의 fresh Implementer를 배정한다.
- 같은 작업의 correction/rework는 scope·workspace·ownership·assignment가 계속 유효한 동안 그 작업의 현재 Implementer를 재사용할 수 있다.
- 승인된 plan 또는 acceptance 계약이 개정되면 영향 작업은 fresh Implementer로 다시 배정한다. 이전 승인·완료 증거와 변경사항을 보존하고 영향받는 gate를 재검증한다.
- QA가 필요한 각 작업은 fresh QA를 배정한다. 이 계획의 T1–T3는 Significant 위험에 따라 모두 QA를 요구한다.
- 같은 작업의 correction 후 QA 재검증은 ARC 기본 규칙을 따른다. 필요한 실패·영향 범위의 재검증을 생략하지 않으며, 새 역할 배정만으로 통과나 수락을 추정하지 않는다.
- specialist는 다른 작업의 파일을 되돌리거나 소유권을 임의 변경하지 않는다. 역할·소유권 충돌은 Orchestrator에게 보고한다.
- 작업별 fresh Implementer·QA와 최종 전체 Reviewer는 서로 다른 gate다. Reviewer를 작업별 필수 gate로 추가하지 않는다.

## 작업 의존성과 검토 초점

실행 순서는 **T1 → T2 → T3**다. 각 작업은 자기 범위의 생성·payload·hash·manifest와 필요한 fresh QA를 완료한 뒤 Orchestrator가 수락하고 하나의 focused commit으로 기록한다.

기존 R1–R5를 유지한다.

| ID | 검토 초점 |
|---|---|
| R1 | 진행 간결화를 전체 초안 축약으로 해석하지 않음 |
| R2 | Planner가 사용자에게 직접 진행·승인을 요청하지 않음 |
| R3 | 수정 초안을 진행 메시지로 분할·반복하지 않음 |
| R4 | 저장·승인·commit을 구분하고 승인 요청에 본문을 복제하지 않음 |
| R5 | 비노출 보장이나 플랫폼 차이 제거를 주장하지 않음 |

추가 검토는 저장·patch 오류의 재호출 근거화, agent 교체를 통한 ledger 초기화, 미확인 dispatch의 중복 허용, semantic attestation의 verified fact 승격, 미중재 경로의 enforcement 오표시에 집중한다.

## baseline과 공통 검증 규칙

### 기존 T1 Python baseline

다음 결과를 재사용한다. 로그를 만들기 위해 baseline을 반복하지 않는다.

| 모듈 | 수정 전 결과 | 증거 |
|---|---|---|
| `test_arc_policy.py` | 116 tests, failures=11; 모두 기존 role-gate parser 원인 | 완료된 Implementer 보고 |
| `test_harness_contract.py` | 42 tests, failures=30 | `/private/tmp/arc-planner-baseline-4q0_qbcn.log` |
| `test_claude_payload.py` | 48 tests, failures=12/errors=1 | `/private/tmp/arc-planner-baseline-mte2400h.log` |

기존 두 parser만 plain/bold `Role gate:`를 함께 인식하도록 수정한다. assertion·needle·검사 대상을 보존한다.

수락은 신규 T1 검사·정적 검사·policy 전체 모듈의 통과와, harness·Claude 전체 모듈의 실패-ID multiset·원인 비교를 구분한다. 신규·증가 실패와 같은 ID 아래 원인 변화는 검토하며, 상속 실패를 통과로 표현하지 않는다.

### 신규 runtime·설치 baseline

기존 runtime baseline은 제공되지 않았다. plan 승인과 handoff 이후, **새 runtime·설치 소스를 수정하기 전** 다음을 실행해 출력·종료 코드·검사 이름·실패 ID·원인과 정확한 소스 상태를 기록한다.

```bash
node --test tests/node/runtime-capabilities.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-installed-entry.test.mjs tests/node/manifest.test.mjs tests/node/profile-render.test.mjs tests/node/install.test.mjs
```

이 baseline은 기존 T1 WIP가 있는 상태의 증거임을 명시한다. 원래 master의 clean baseline으로 표현하지 않는다.

실패를 발견하면 baseline/current와 영향 범위를 분류한다. 새 runtime 실패를 기존 Python disposition에 포함하지 않는다. 미해결 필수 실패의 면제나 broad repair를 자동 승인하지 않으며, 영향받는 작업·수락만 보류한다. T1의 알려진 생성·payload drift가 원인이라면 T1의 해당 수정과 연결해 기록한다.

T1 수락 후 T2 시작 시 기준 HEAD와 파일 fingerprint를 연결한다. 새 baseline이 필요한 변경 사실이 없으면 같은 검사를 baseline 수집 명목으로 반복하지 않는다.

### 생성·payload·manifest 순서

내용 변경 후 다음 순서를 사용한다.

```bash
npm run update:role-policy
node scripts/update-runtime-assets.mjs
node scripts/update-manifest.mjs
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

해당 작업에서 이미 완료했고 입력이 바뀌지 않은 생성은 증거를 재사용한다. 변경된 입력이 있으면 그 생성부터 다시 수행한다.

정책 generator의 T1 변경 6개와 runtime generator의 배포 출력은 서로 다른 집합이다. runtime generator는 canonical runtime 모듈과 `role-policy.json`을 두 플랫폼에 복사하므로 T1에서도 두 packaged policy snapshot을 포함한다.

## T1: 기존 Planner 계약과 생성 표면 완결

**목표·범위:** C1–C5와 R1–R5를 구현하고 기존 WIP를 완결한다. 새 호출 규칙의 영어 지침도 반영하되 실제 runtime 동작 수락은 T2·T3에서 검증한다.

**선행 조건:** 승인 문서 준비와 handoff. 선행 구현 작업은 없다. fresh Implementer로 시작하며 중단된 `planner_progress_t1`을 재사용하지 않는다.

**파일·소유권:** Implementer가 다음을 담당한다.

- `lib/policy/role-policy.json`
- `codex/agents/arc-planner.toml`
- `claude/agents/arc-planner.md`
- `codex/skill/references/planning.md`
- `claude/skill/references/planning.md`
- `codex/skill/references/coordination.md`
- `claude/skill/references/coordination.md`
- `tests/test_arc_policy.py`
- `tests/test_harness_contract.py`
- `tests/test_claude_payload.py`
- 생성되는 `codex/skill/runtime/role-policy.json`, `claude/skill/runtime/role-policy.json`
- `MANIFEST.sha256`

coordination은 generated policy 블록만 변경한다. 관리 프로필·참조·packaged policy를 직접 편집하지 않는다.

**입출력:** 승인 spec과 기존 WIP를 소비하고, 일관된 지침·회귀 검사·생성 payload를 제공한다.

- [x] 기존 WIP와 RED 증거를 확인하고 assertion을 삭제·약화하지 않았는지 검토한다.
- [x] 다음 신규 검사의 정확한 이름을 유지하고, coordination 생성 줄까지 계약 검사를 확장한다.

```bash
python3 -B -m unittest discover -s tests -p test_arc_policy.py -k test_planner_progress_preserves_complete_draft_contract
python3 -B -m unittest discover -s tests -p test_harness_contract.py -k test_planner_progress_and_saved_approval_contract
python3 -B -m unittest discover -s tests -p test_claude_payload.py -k test_planner_progress_and_saved_approval_contract
```

각 명령은 해당 검사 하나를 실제 실행해야 한다. 새 assertion은 필요한 경우 변경 전 의미 있는 RED를 기록하고 구현 후 GREEN을 확인한다.

- [x] 기존 진행·전체 초안·승인·통합 수정 규칙을 보존하면서 다음 계약을 간결한 영어로 반영한다.

> Do not invoke Planner only to reformat or re-express a draft, fix a save error, or fix a patch-application error. Orchestrator handles these operations. Evaluate separate substantive work under the normal Planner gate.

> Allow the initial draft and one consolidated correction. Further calls require concrete unmet criteria and meaningful new input, evidence, or verifiable progress. Do not impose a fixed call cap or accept an incomplete draft.

- [x] 정책 생성 변경 집합을 확인한다. 기존 해당 canonical 변경은 프로필 2개·planning 2개·coordination 2개의 6개다. 다른 generated policy 표면이 바뀌면 보고한다.
- [x] 공통 생성 순서로 packaged policy와 manifest까지 일치시킨다.
- [x] 신규 세 검사를 GREEN으로 확인하고 전체 Python 모듈을 실행한다.

```bash
python3 -B -m unittest discover -s tests -p test_arc_policy.py
python3 -B -m unittest discover -s tests -p test_harness_contract.py
python3 -B -m unittest discover -s tests -p test_claude_payload.py
node --test tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs
```

policy 모듈은 통과해야 한다. harness·Claude는 실패 종류와 subtest 정보를 포함한 ID multiset을 원본과 비교한다. 같은 ID 아래 traceback·assertion·원인 변화와 실패 감소도 설명한다. 전체 실행 수는 신규 검사를 포함해 각각 최소 117·43·49이며 기존 검사 축소는 금지한다.

- [x] T1의 fresh QA가 C1–C5·R1–R5, parser 제한성, 생성·packaged policy·manifest와 baseline 비교를 검증한다.
- [x] 필요한 같은 작업 correction·QA 재검증을 공통 freshness gate와 ARC 기본 규칙에 따라 완료한다.
- [x] Orchestrator가 기준·검사·finding을 확인해 수락하고 focused commit을 수행한다.

**수락:** 신규 검사·정적 검사·policy 전체 모듈 통과, 승인된 baseline 비교 충족, fresh QA와 필요한 재검증 완료, 관련 finding 없음.

**보류:** 예상 밖 생성 범위, assertion 약화, 신규 회귀·원인 미분류, payload·manifest 불일치 또는 필수 검사 미해결. 다른 baseline 수리로 확장하지 않는다.

## T2: durable Planner ledger와 공통 상태전이 gate

**목표·범위:** G1–G6와 G9의 core·cooperative 부분을 구현한다. 실제 native dispatch는 T3 범위다.

**선행 조건:** T1 수락·commit, runtime baseline 분류, 현재 승인 버전과 handoff. T2 전용 fresh Implementer로 시작한다.

**파일·소유권:** Implementer가 다음을 담당한다.

- `lib/runtime/schema.mjs`
- `lib/runtime/cooperative-schema.mjs`
- `lib/runtime/evaluate.mjs`
- `lib/runtime/operations.mjs`
- `lib/runtime/store.mjs`
- `lib/runtime/bootstrap.mjs`
- `lib/runtime/cooperative.mjs`
- `lib/runtime/command.mjs`
- `lib/runtime/cli.mjs`
- `tests/node/runtime-assignment.test.mjs`
- `tests/node/runtime-cooperative.test.mjs`
- `tests/node/runtime-store.test.mjs`
- `tests/node/runtime-assets.test.mjs`
- `tests/node/runtime-installed-entry.test.mjs`
- 필요한 `lib/installer/runtime-assets.mjs` inventory 정의
- 위 canonical runtime에 대응해 생성되는 `codex/skill/runtime/`와 `claude/skill/runtime/`의 동일 상대 경로
- `MANIFEST.sha256`

새 canonical runtime 파일은 이 계획에서 만들지 않는다. 기존 파일에 구현하며 inventory 변경은 실제 import/hash 의존관계에 한정한다. 기존 `prepareCooperativeAssignment`의 Implementer 전용 계약을 Planner용으로 완화하지 않는다.

**공통 인터페이스**

`lib/runtime/evaluate.mjs`에 부작용 없는 `evaluatePlannerCall({stage, request, evidence})`를 공개한다.

- `stage`: 안정적인 stage ID, 문서·단계, 승인 입력/범위 버전, criteria, 최초/통합 수정 이용 기록, pending request, 결과·review 참조.
- `request`: `initial | correction | further`, 실질적 작업 또는 네 가지 비진척 의도, criterion IDs, 입력/근거/진척 refs, 직전 결과·review ref, request ID.
- `evidence`: 검증한 bytes/hash/ref 연결과 provenance, semantic 판단 기록. 검증된 사실과 operator attestation을 구분한다.
- 반환값: `decision`, 이유, rule IDs, 필요한 증거, 허용 시 예약/상태전이. 호출이나 저장은 수행하지 않는다.

native와 cooperative 외부 경계에서 기존 대상·role·approval 검증을 유지한다. Planner 준비는 implementation의 spec+plan commit gate와 혼동하지 않고 현재 작성 단계에 필요한 선행 승인을 검증한다. plan 승인 전 정당한 plan drafting을 차단하지 않는다.

cooperative CLI는 기존 `prepare`에 Planner 호출 준비를 추가하고, `record`에서 stage·result·review의 구조화된 기록을 처리한다. 실제 dispatch는 실행하지 않는다. 기존 Implementer `assign-agent`와 operation을 분리한다.

- [x] 정확한 stage/request/evidence 타입과 ledger 검증을 추가한다. 기존 workflow에 ledger가 없으면 Planner 작업은 이력 연결 확인까지 hold하며 자동 초기화로 이력을 잃지 않는다.
- [x] 상태전이 RED 테스트를 추가한다. 최소한 다음을 각각 assertion으로 확인한다.

| 사례 | 기대 결과 |
|---|---|
| 유효한 initial | allow, 예약 하나 |
| 최초 전체 review에 연결된 첫 correction | allow, 같은 기회 중복 사용 없음 |
| 구체적 open criterion과 새 근거/진척 | further allow |
| format-only / re-expression-only | deny, 예약·수정 기회 비소비 |
| save-error-only / patch-error-only | deny, criterion 진척·재개방 없음 |
| 저장/patch 실패 후 독립적인 실질적 기준 | 정상 조건 충족 시 allow |
| 그 실질적 근거를 제거한 동일 요청 | deny 또는 증거 부족 hold |
| resolved criterion 반복, 동일 bytes의 다른 ref | deny |
| unresolved이며 새 입력·근거·진척 없음 | hold |
| completeness=false, 필수 결과/self-review 부재 | ready/accept로 전이하지 않음 |
| 여러 적격 further | 계속 allow, 횟수 상한 없음 |

- [x] 판정기, 구조화 기록, 실제 읽은 bytes/hash의 연결을 구현한다. 단순 hash 변화나 caller의 `meaningful: true`를 semantic 증명으로 삼지 않는다.
- [x] durable reservation과 결과 reconciliation을 연결한다. 기존 lock·revision·fingerprint를 사용해 동시 사용, replay, 충돌과 미확인 dispatch의 재허용을 방지한다.
- [x] restart·쓰기 실패·rename 이후 불명확한 상태·기존 ledger 부재·runtime drift를 행동 테스트로 확인한다. 알 수 없는 결과의 자동 retry나 근거 없는 기회 복원은 하지 않는다.
- [x] `COOPERATIVE_RUNTIME_MODULES`와 실제 변경·로드 의존관계의 hash coverage를 확인한다. gate가 의존하는 state/schema/operations와 기존 transitive dependency를 누락하지 않는다. hash 대상 변경은 호환성 변경으로 기록하며 기존 workflow의 version/hash를 자동 갱신하지 않는다.
- [x] canonical → payload → manifest의 공통 생성 순서를 수행하고 installed entry에서도 stage/deny/replay/provenance를 확인한다.

```bash
node --test tests/node/runtime-assignment.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-installed-entry.test.mjs
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

- [x] T2의 fresh QA가 상태전이, 저장/patch 거부와 독립 실질 작업 허용, 횟수 상한 부재, 불완전 초안 비수락, durability와 installed payload를 검증한다.
- [x] 필요한 같은 작업 correction·QA 재검증을 공통 freshness gate와 ARC 기본 규칙에 따라 완료한다.
- [x] Orchestrator가 T2를 수락하고 focused commit을 수행한다.

**수락:** G1–G6의 실제 동작이 테스트로 확인된다. fresh QA와 필요한 재검증을 완료하고 생성·hash·manifest가 일치한다. cooperative를 dispatcher/native enforcement로 표현하지 않는다.

**보류:** 상태 타입·provenance 불일치, 중복 예약, 이력 초기화, 필수 runtime 검사 미해결, 기존 상태의 무단 이행, runtime hash/payload 불일치.

## T3: native context 구성·hook 연결·관찰 가능한 경로의 탐지

**목표·범위:** T2 판정기를 실제로 지원되는 local `PreToolUse` 경로에 연결할 수 있는지 조사·구현·검증한다. 안전한 context 구성에 필요한 입력이 부족하면 관찰 가능한 경로의 가장 강한 탐지·감사 기록과 정확한 coverage를 구현한다. G7–G9를 검증하되 미검증 native enforcement를 완료로 표현하지 않는다.

**선행 조건:** T2 수락·commit과 현재 승인 버전·handoff. T3 전용 fresh Implementer로 시작한다. 이미 존재하는 production provider는 선행 조건이 아니다.

**파일·소유권:** Implementer가 다음을 담당한다.

- `lib/runtime/adapters/codex.mjs`
- `lib/runtime/adapters/claude.mjs`
- `lib/runtime/capabilities.mjs`
- `lib/runtime/identity.mjs`
- `lib/runtime/evaluate.mjs`의 native assignment 연결 부분
- `lib/runtime/cooperative.mjs`, `lib/runtime/assignment.mjs`의 필요한 observation/coverage 연결
- `codex/skill/hooks/runtime-gate.mjs`
- `claude/skill/hooks/runtime-gate.mjs`
- `lib/installer/plan.mjs`
- `lib/installer/global-config.mjs`
- `lib/policy/claude-hook.mjs`
- `scripts/probe-runtime-hooks.mjs`
- `tests/node/runtime-codex.test.mjs`
- `tests/node/runtime-claude.test.mjs`
- `tests/node/runtime-capabilities.test.mjs`
- `tests/node/runtime-cooperative.test.mjs`
- `tests/node/runtime-assignment.test.mjs`
- `tests/node/runtime-assets.test.mjs`
- `tests/node/runtime-installed-entry.test.mjs`
- `tests/node/profile-render.test.mjs`
- `tests/node/install.test.mjs`
- `tests/node/manifest.test.mjs`
- 변경한 canonical runtime의 두 generated payload와 `MANIFEST.sha256`

### T3-A: context 구성 가능성 조사와 구현

현재 production trusted provider/context는 없다. Implementer가 문서화된 hook event와 durable ARC state를 조사해 다음 입력의 공급·검증 경로를 구현한다.

| 필요한 입력 | 확인·구현 내용 |
|---|---|
| event identity | `hook_event_name`, `session_id`, `tool_use_id`, `tool_name`, `tool_input`, `cwd`의 실제 제공 여부와 검증 |
| workflow 연결 | session·실행 대상·workflow·stage를 durable 등록과 실제 대상에 연결. 여러 후보를 임의 선택하지 않음 |
| actor/task/role | 기존 관찰 identity·lease·assignment·승인 범위에 연결. prompt나 `agent_type`만으로 권한 생성 금지 |
| semantic mapping | 전체 호출을 `describeTool`과 동일한 보수적 경계로 해석하고 Planner stage/request에 연결 |
| 상태·버전 | statePath를 임의 tool input에서 받지 않고 신뢰 가능한 대상 연결로 결정. revision·policy/runtime/adapter hash 확인 |
| evidence | 실제 artifact bytes·hash·review/criterion refs와 provenance 연결 |
| 실패 동작 | 실제 platform version과 hook failure 처리 조건 확인 |
| 결과 연결 | tool-use/assignment/agent/result의 실제 correlation 가능 여부 확인 |

기존 `main(input, context)`의 입력 분리와 trusted context 검증을 약화하지 않는다. raw event가 있다는 사실과 verified actor/approval가 있다는 사실을 구분한다. 로컬 등록이나 caller-attested JSON만으로 verified native provenance를 만들지 않는다.

- [x] 실제 입력을 기준으로 필드별 공급·검증 표를 작성한다. 부족하면 `context.actorRef`, `context.describeTool`, `hook.tool_use_id`, 해당 durable assignment 경로 등 **정확한 필드·원본 위치·누락 또는 검증 불가 사유**를 기록한다.
- [x] 구성 가능한 context 경로를 구현하고 유효·누락·위조·충돌·stale 입력의 RED–GREEN 테스트를 추가한다.
- [x] 안전하게 연결되는 local `PreToolUse`에서는 T2 판정기를 호출하고 allow/deny/hold를 native 계약에 맞게 렌더링한다.
- [x] context가 부족하면 권한을 추정하지 않는다. adapter의 명시적 deny 응답과 native enforcement 미검증 상태를 기록하고 T3-B를 계속 구현한다.

provider 부재나 입력 부족은 core gate·탐지 작업을 지우거나 T3 전체 조사 시작을 막지 않는다.

### T3-B: strongest available detection과 durable audit

지원되는 `SubagentStart` 또는 post-start/result observation 경로를 연결한다. 이는 생성 후 관찰이며 사전 deny·prevention으로 표현하지 않는다.

관찰 결과는 다음으로 구분해 durable audit/coverage에 남긴다.

| 관찰 분류 | 상태 처리 |
|---|---|
| 정확한 correlation과 필수 검증을 갖춘 pending assignment의 start/result | 해당 관찰을 연결하고 기존 identity/result 검증 조건에 따라 처리 |
| 관찰됐지만 correlation이 없거나 후보가 여러 개인 start/result | `uncorrelated`로 기록. 최근 pending을 임의 선택하지 않음 |
| 해당 관찰 범위에서 대응 pending assignment를 찾을 수 없음 | `unmatched`로 기록. 미중재 관찰임을 표시하되 차단했다고 주장하지 않음 |
| 신뢰 가능한 출처·역할을 확정할 수 없는 event | 원본·hash와 검증 한계를 기록. verified identity로 승격하지 않음 |
| hook/observation 경로가 없는 `followup_task`·앱 경로 | `unsupported`, `unobservable` 또는 `unknown`. 탐지됐다고 표현하지 않음 |

상관관계가 없는 관찰은 pending reservation을 해제하거나 승인·완료·실행 성공을 만들지 않는다. 관찰 사실을 기록하는 것과 호출 권한을 부여하는 것을 분리한다.

- [x] observation을 기존 pending ledger assignment와 연결하는 경로를 구현한다. 정확한 correlation이 없으면 단순 `agent_type`, 동일 세션, 유일한 최근 pending 등의 추정만으로 identity를 바인딩하지 않는다.
- [x] unmatched/uncorrelated 관찰을 유실하지 않고 source·session·agent/event ref·관련 stage 후보·분류 이유·coverage와 함께 durable하게 기록한다.
- [x] 중복 observation/replay가 새로운 실행 권한·수정 기회·완료를 만들지 않게 한다. 안정적인 event identity가 없다면 deduplication의 한계도 보존한다.
- [x] 관찰 불가능한 경로는 기록 부재를 정상 준수로 해석하지 않고 unknown/unobservable로 표시한다.
- [x] observer는 native 시작 방지 응답을 반환하지 않으며 후속 기록으로 과거 호출을 소급 승인하지 않는다.

### T3-C: 설치·플랫폼 경계와 증거 분리

- [x] installer가 기존 Claude Bash Git guard와 사용자 설정을 보존하면서 확인된 runtime hook·observer 경로의 연결·갱신·해제를 처리하도록 구현한다.
- [x] enforcement 연결과 observation-only 연결을 설정·상태·보고에서 구분한다. provider 입력이 부족한 상태를 active enforcement로 표시하지 않는다.
- [x] Codex local function `spawn_agent`의 `Agent` matcher와 Claude `Agent`의 `PreToolUse`를 실제 지원 범위에서 연결·검사한다.
- [x] Codex callback error/timeout/malformed response의 fail-open 가능성을 유지한다. Claude는 설치 version과 `onFailure: block` 조건을 검증한다.
- [x] generic `collaboration.spawn_agent`, `followup_task`, hosted/specialized/기존 입력 경로는 실제 확인한 hook·관찰 범위만 보고한다.
- [x] 다음 증거를 서로 분리해 기록한다.

| 증거 | 입증하는 범위 |
|---|---|
| adapter의 deny JSON | ARC가 deny 응답을 생성함 |
| installer/profile fixture | 설정·연결 형식과 자산 처리가 맞음 |
| payload sync 검사 | canonical과 배포 bytes가 일치함 |
| post-start observation | 해당 관찰 event가 기록·대조됨 |
| 동일 version/session/attempt의 host 결과 | host가 해당 호출을 실제 중단했는지 |

합성 fixture, `source: native` 문자열, hook-decision receipt만으로 마지막 항목을 입증하지 않는다.

### T3 행동 테스트와 필수 검사

기존 지정 테스트 파일에 최소한 다음 사례를 추가한다.

| 제안 테스트 사례 | 필수 assertion |
|---|---|
| `planner hook context rejects missing or forged identity` | 필수 context가 없거나 위조됐으면 allow하지 않고 정확한 부족 근거를 보존 |
| `planner local hook applies the durable call decision` | 구성 가능한 trusted context에서 initial/correction/further 및 비진척 거부가 T2와 일치 |
| `planner observer correlates an exact pending assignment` | 정확한 검증·correlation만 연결하며 독립적인 실행 권한은 만들지 않음 |
| `planner observer records an unmatched start` | durable unmatched audit와 observation-only coverage, 시작 차단 주장 없음 |
| `planner observer retains ambiguous correlation` | 여러 후보·누락 correlation을 uncorrelated로 보존하고 pending을 임의 완료하지 않음 |
| `planner observer replay does not release a reservation` | 반복 관찰이 permit·완료·기회 복원을 만들지 않음 |
| `planner unobservable followup remains unknown` | hook 없는 경로를 detected/blocked/verified로 표시하지 않음 |
| `planner native evidence levels remain distinct` | adapter·fixture·payload·observation을 host-applied deny로 승격하지 않음 |

- [x] 위 RED–GREEN과 기존 capability 위조·stale·fixture 검사들을 수행한다.
- [x] runtime payload와 manifest를 동기화하고 installer·entry·profile·관찰 경로의 정합성을 확인한다.

```bash
node --test tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-capabilities.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-installed-entry.test.mjs tests/node/profile-render.test.mjs tests/node/install.test.mjs tests/node/manifest.test.mjs
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

- [ ] 실제 native enforcement를 확인할 수 있는 경우 platform/version/session/attempt, hook 설정·context 공급 경로, 허용 결과와 거부 요청의 실제 미실행을 연결해 기록한다.
- [x] T3의 fresh QA가 context 구성 근거, 정확한 누락 필드, observer 상태전이, unobservable 분류와 증거 수준 분리를 검증한다.
- [x] 필요한 같은 작업 correction·QA 재검증을 공통 freshness gate와 ARC 기본 규칙에 따라 완료한다.
- [x] Orchestrator가 아래 성공·보류 분기에 따라 수락 여부를 판단한다.

### T3 성공·보류 분기

**충분한 입력이 있는 경로:** 안전한 context 구성과 supported local `PreToolUse` 연결을 구현하고 행동·설치 검사를 통과한다. 실제 host 적용 근거가 있는 범위에서만 native enforcement를 verified로 보고한다.

**입력이 부족하지만 관찰 경로가 있는 경우:** 정확한 부족 입력과 경로를 증거화하고 observation correlation·unmatched/uncorrelated audit·coverage 동작을 구현·검증한다. 이 탐지 산출물은 완료 근거로 보고할 수 있지만 native enforcement와 G7의 미검증 항목은 hold/unverified로 남긴다.

**관찰 경로도 없는 경우:** unsupported/unobservable/unknown을 구현·검증하고 탐지·차단 claim을 금지한다. 기록이 없다는 이유로 준수나 enforcement 성공으로 취급하지 않는다.

필수 행동·설치·payload 검사의 실패, 위조 provenance 승격, 관찰을 prevention으로 표현하는 경우와 기존 설정 손실은 관련 작업·수락을 보류한다. provider 입력 부족은 필요한 native 주장·G7 검증을 보류하는 근거이며 이미 가능한 core·observer 작업을 생략하는 근거가 아니다.

필수 G7이 미검증이면 T3 전체와 프로젝트를 완전 수락했다고 주장하지 않는다. 그때는 완료된 구현·탐지와 남은 exact input/host 증거를 구분해 반환한다. T1·T2의 독립적인 수락·commit을 무효화하지 않는다.

## 최종 전체 검증과 Reviewer

T1–T3의 수락과 필요한 fresh QA·재검증 후 다음 지정 runtime/installer 전체 범위를 최종 상태에서 확인한다. 새 실패·변경·우려가 없는 완료 검사를 이유 없이 반복하지 않고 최종 상태와의 증거 연결을 기록한다.

```bash
node --test tests/node/runtime-capabilities.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-cooperative.test.mjs tests/node/runtime-assignment.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-installed-entry.test.mjs tests/node/manifest.test.mjs tests/node/profile-render.test.mjs tests/node/install.test.mjs
```

Python full-module baseline 비교와 세 정적 정합성 검사도 후속 변경의 영향을 받은 범위에서 확인한다.

독립 Reviewer가 base/master부터 최종 전체 변경을 한 번 검토한다. C1–C5/G1–G9, R1–R5, 승인·역할, 저장·patch 비진척, 상태·durability, provenance, native/observation/unobservable coverage, payload/hash와 baseline disposition을 대상으로 한다.

최종 Reviewer finding은 Implementer → Reviewer 재확인으로 처리하며 QA를 재배정하지 않는다. 기존 Implementer 재사용 가능 여부는 공통 freshness gate를 따르고, 승인된 plan/acceptance 개정이면 fresh Implementer를 배정한다. 수정으로 영향을 받는 필수 검사·생성·manifest·baseline 비교를 유지한다. 최초 최종 review 전에 필요한 QA를 생략하지 않는다.

Orchestrator가 전체 기준과 finding을 확인해 완료를 결정한다. 미해결 G7이나 필수 검사를 unknown인 채 완전 수락하지 않는다. push·merge·publish는 포함하지 않는다.

## 근거

- 현재 승인 spec과 approval/hash 기록.
- ARC `writing-plans.md`, `planning.md`의 task·승인·문서 준비·개정 규칙.
- ARC 작업별 fresh Implementer·fresh QA, 같은 작업 correction/recheck와 승인 계약 개정 시 재배정 규칙.
- 지정 runtime source와 adapter·entry·store·cooperative/assignment source 읽기 결과.
- `scripts/update-runtime-assets.mjs:15-24`: canonical runtime과 policy의 두 packaged runtime 복사.
- `lib/installer/runtime-assets.mjs:3-25`: 고정 inventory.
- `lib/installer/manifest.mjs:43-52`, `package.json:12-44`: 필수 자산·생성/검사·package include.
- Orchestrator/Scouter 제공 installer/test 조사와 기존 baseline 증거.
- 플랫폼 능력과 한계는 승인 spec이 인용한 Codex/Claude 공식 자료를 유지한다.

**계획 초안 끝**

자체 점검: 공통 작업·소유권 gate와 T1–T3의 시작·QA 절차에 역할 freshness를 반영했습니다. T1은 중단된 `planner_progress_t1`을 재사용하지 않습니다. 같은 작업의 유효한 correction/rework 재사용, 승인된 plan/acceptance 개정 시 fresh Implementer, 작업별 fresh QA와 ARC 기본 재검증을 구분했습니다.

기존 작업 구조·순차 수락/commit, baseline disposition, 상태전이·탐지·coverage와 최종 Reviewer 흐름을 유지했습니다. 문서 저장·편집·검사 실행·Git 변경과 Implementer 재개는 하지 않았습니다.
