# 역할 프로필 공통 지침 설치 합성 구현 계획

## 버전 및 승인 기록

- 계획 v1: 사용자 승인 완료 (2026-11-03; 승인 당시 본문 SHA-256: `317c1bdff8755309ebd01b732672c7c66080c985f8c9c01e10443232b57a3338`). 승인 응답: “계획 승인하고 구현 진행”.
- 계획 v2 amendment: 사용자 승인 완료 (2026-11-03; 승인 당시 본문 SHA-256: `b69817d907bb97cc7b43923f3d8775e37a4c1eda1f871bb88f13ab79bab1ba03`). 승인 응답: “승인하고 계속 진행”. 승인 draft 보존본: `.git/arc/handoff/2026-11-03-shared-agent-instructions-plan-v2-approved-draft.md`. 기존 profile prose assertions와 foreign-platform contract scan을 production renderer 확장 출력에서 읽도록 검사 adapter 경로를 보완한다. 파일 범위는 `tests/test_claude_payload.py` 한 개만 추가하며, raw frontmatter/model/tool/apply-models 검사는 원문 template을 유지한다.
- 승인 설계: [공통 지침 설치 합성 설계 v2](../specs/2026-11-03-shared-agent-instructions-design.md).
- 설계 v2 승인 응답: “v2 승인하고 계속 진행”. 승인 당시 내용 SHA-256: `c09687aacf70b9ed6705b9364ed861e28045026d6e8d728dd991664e299b0a5a`.
- 승인 기록을 포함한 설계 현재 SHA-256: `4eb2de09df6a3976c126425d5f1612483a5e61669618e9a27c04d76b765ad5b5`.
- 승인 설계 v1 보존본 SHA-256: `343da7f1c8c4ab844773300fa728a65062a927a5bf5af4915d47f4b7f04630ee`.
- 계획 경로: `docs/superpowers/plans/2026-11-03-shared-agent-instructions.md`.
- 저장소: `/Users/ma-24-007/Desktop/workspace/arc`.
- 실행 대상 선택: 현재 체크아웃 사용.
- 브랜치 및 기준선 HEAD: `refactor/arc-instructions`, `e112462fba82481b7891df8baf29a3729411b99a`.
- 계획 v1 검토 당시 상태는 v1 기록과 handoff snapshot을 따른다. 현재는 계획 v1 이후 TASK-01 구현이 미커밋 상태이며, 아래 execution log에 구체 파일·검증 상태가 기록되어 있다.
- 계획 v2가 승인되었으며, 원래 문서 commit을 안전하게 amendment하고 fresh Implementer handoff를 완료하기 전까지 Python test file 편집과 이를 전제로 한 TASK-01 수락은 held다. v1에서 이미 수행한 작업은 당시 승인된 범위에 속하며, v2 amendment의 소급 승인으로 간주하지 않는다.

## 목표와 범위

승인된 25개 fragment를 하나의 공유 원천으로 관리하고, 설치 시 Claude와 Codex의 5개 역할 프로필을 기존 출력과 byte-for-byte 동일하게 완성한다. 제품 변경은 승인 설계의 AC-1~AC-9와 정확히 10개 프로필로 제한한다. 승인된 v2 amendment의 검사 호환성 변경은 `tests/test_claude_payload.py` 한 파일에 한정한다.

원천은 `lib/prompts/agent-fragments.json`, 순수 renderer는 `lib/prompts/render.mjs`에 둔다. 역할 파일의 반복 문구를 `{{ARC_AGENT_FRAGMENT:<id>}}` marker로 바꾸고 설치 단계에서 확장한다. 최종 설치 프로필은 독립 파일 include 없이 완성된 전체 지침을 유지한다.

기존 policy 원천과 관리 블록, 출력 언어 정책, 플랫폼·역할별 고유 문구, 비슷하지만 동일하지 않은 예외·incident 문구는 그대로 둔다. 공개 `renderProfiles`의 모델 전용 동작과 비모델 byte 보존 계약도 유지한다. build-time prompt 생성, runtime include, fallback, 새 dependency, 사용자 실제 환경 설치는 범위 밖이다.

## 실행 기준과 제약

- 모든 실행은 `/Users/ma-24-007/Desktop/workspace/arc`의 사용자가 선택한 현재 체크아웃을 기준으로 한다. 구현 직전 Orchestrator가 실제 HEAD·status를 다시 기록한다.
- 승인 설계에서 지정한 fragment 원문·대상·순서만 구현한다. 새 fragment, 범위 확대 또는 승인 기준 변경은 별도 결정을 기다린다.
- 역할 정책은 기존 `lib/policy/role-policy.json`에서 계속 생성한다. `{{ARC_OUTPUT_LANGUAGE_POLICY}}`는 기존 language renderer가 계속 처리한다.
- fragment 확장은 설치기에서만 수행한다. 공개 `renderProfiles`는 고치지 않는다.
- Codex TOML 전체 재직렬화, 문단 재배치, 자동 trim, 자동 공백·개행 추가, 프로필 메타데이터 변경을 하지 않는다.
- 입력 Buffer/Map을 변경하지 않고, marker 밖 byte 및 LF/CRLF 형식을 보존한다.
- Registry·renderer·양 플랫폼 template 10개는 모두 필수 입력이다. 누락·malformed·잘못된 marker mapping은 `ARC_PAYLOAD_VALIDATION`으로 설치 전에 거부하고 fallback이나 부분 출력을 만들지 않는다.
- 실패 시 영향 범위를 분류하고 의존 작업을 보류한다. 검사·기준선 hash를 낮춰 실패를 덮지 않는다.
- Implementer는 Git 변경이나 수락을 수행하지 않는다. QA와 최종 Reviewer는 서로 독립적으로 배정한다.

## 공통 fragment inventory와 기준 참조 수

세부 원문과 대상 목록은 승인 설계의 3절을 따른다. 대상 코드는 CI/CP/CQ/CR/CS가 Claude 역할, XI/XP/XQ/XR/XS가 Codex 역할이다.

| 프로필 | CI | CP | CQ | CR | CS | XI | XP | XQ | XR | XS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 기대 marker 수 | 8 | 13 | 10 | 12 | 11 | 5 | 11 | 8 | 10 | 9 |

전체 기대 참조 수는 97이다. ID·경로·순서·marker 수를 함께 검증하며 총계만으로 완전성을 판단하지 않는다. `planner.workflow-contract`의 동일한 6개 bullet은 Claude와 Codex Planner 양쪽에서 정확히 한 번씩 확장한다.

## 작업 구성 및 소유권

모든 구현 변경은 하나의 불가분 TASK-01이다. Registry/template만 또는 installer/payload만 부분 수락하지 않는다. 준비 완료 뒤 실행 task는 TASK-01 하나다.

| ID | 목표·소유권 | 선행 조건 | 수락 근거 | Hold 조건 |
|---|---|---|---|---|
| TASK-01 — 공통 fragment 원천과 설치 합성 연결 | 승인된 25개 fragment, 10개 template, renderer, payload 검증, 설치 합성, manifest, 관련 검사/fixture 및 승인된 Claude payload assertion adapter를 fresh Implementer 한 명이 소유 | 계획 v1 및 v2 승인, 안전한 원래 문서 commit amendment, 승인 설계, 검증된 대상·handoff, 지정 TDD 참조 | AC-1~AC-9, 집중·회귀검사, fresh QA의 criterion별 증거를 Orchestrator가 수락 | 승인·대상·소유권 불일치, inventory 모순, 필수 입력/검사 미해결 또는 검증되지 않은 기준 |

Orchestrator가 계획 검토·수정·저장·승인 요청, handoff, task 수락, Git 준비·commit, QA 조정과 완료 판단을 맡는다. Implementer는 승인 범위의 파일 편집과 검사 결과 보고만 한다. Fresh QA는 편집하지 않고 TASK-01 전체를 검증한다. 구현 수락 및 focused commit 이후 fresh Reviewer가 최종 전체 변경을 독립 검토한다.

## 구현 파일 범위

### 생성

| 경로 | 목적 |
|---|---|
| `lib/prompts/agent-fragments.json` | 승인된 fragment 원문 및 프로필별 ID·순서 mapping |
| `lib/prompts/render.mjs` | Registry/template 검증과 결정적 순수 확장 |
| `tests/node/agent-fragments.test.mjs` | inventory, byte 보존, 오류 경계와 독립 기준선 검사 |

### 수정

| 경로 | 목적 |
|---|---|
| `claude/agents/arc-{implementer,planner,qa,reviewer,scouter}.md` | 승인된 공유 문구만 marker로 대체 |
| `codex/agents/arc-{implementer,planner,qa,reviewer,scouter}.toml` | 승인된 공유 문구만 marker로 대체 |
| `lib/installer/manifest.mjs` | Registry·renderer 필수 보호 파일 등록, 10개 template/registry 검증, 검증 Registry 전달 |
| `lib/installer/plan.mjs` | 모델 설정 뒤 fragment, 그 뒤 언어 정책을 적용하고 완성 프로필만 계획에 전달 |
| `MANIFEST.sha256` | 새 보호 파일과 변경된 template/installer hash 반영 |
| `tests/node/manifest.test.mjs` | 누락·malformed payload와 manifest 재생성 후에도 필수 자산 거부 검사 |
| `tests/node/plan.test.mjs` | 직접 payload fixture, 완성 출력, 실패 전 무쓰기 및 기존 8개 rendering baseline 검사 |
| `tests/node/upgrade-harness.test.mjs` | 직접 payload fixture와 upgrade 결과의 완성 프로필 검사 |
| `tests/node/package.test.mjs` | Registry와 renderer가 패키지에 포함되는지 검사 |
| `tests/node/fixtures/instruction-contracts.json` | 변경된 template hash 갱신 및 편집 전 원본 10개 프로필 hash의 독립 보존 |
| `tests/test_claude_payload.py` | 모든 profile-body assertion 및 플랫폼 금지 용어 검사는 production renderer로 확장한 Claude profile을 읽게 하고, frontmatter/model/tool 검사는 원문 template을 계속 검사. 기존 assertion은 삭제·완화·skip하지 않음 |

`package.json`은 기존 `files`가 `lib/` 전체를 포함하므로 수정하지 않는다. 패키지 검사만 새 두 파일을 명시적으로 확인한다. `tests/node/fixtures/instruction-contracts.json`의 기존 `protected` 항목은 현재 marker template hash로 갱신하되, 편집 전에 원본 10개 프로필의 hash를 별도 `agentProfileBaseline` 항목에 기준선 HEAD와 함께 보존한다. 확장 결과는 그 독립 hash와 비교한다. `tests/node/plan.test.mjs`의 기존 8개 최종 rendering baseline은 수정하지 않는다.

`tests/node/plan.test.mjs`와 `tests/node/upgrade-harness.test.mjs`가 직접 구성하는 payload fixture는 검증된 Registry를 명시적으로 제공한다. Source/package 정적 fixture는 기존 복사·manifest 갱신 경로를 사용한다.

Python helper는 Claude agent profile 본문을 검사할 때만 실제 `lib/prompts/render.mjs`의 `renderAgentProfile`과 동일 Registry를 호출한다. `read_claude`/`RoleHardeningTests.text`의 프로필 경로와 모든 프로필 파일을 순회하는 foreign-platform-contract check는 확장 결과를 읽는다. Python에서 marker 확장 규칙을 재구현하지 않는다. Raw frontmatter, model, effort, tool allowlist와 apply-models 동작을 검증하는 검사는 원문 template bytes를 계속 읽는다. Skill/reference 문서 검사는 기존 파일을 그대로 읽고, 그 assertion은 변경하지 않는다.

## TASK-01 실행 순서

### 1. Handoff와 원본 기준선 보존

- 계획 승인 전에는 제품 구현을 시작하지 않는다. 승인 후 ARC handoff 지침에 따라 승인 문서 집합, 실제 HEAD/status, 문서 commit, 파일 소유권, 정확한 검사와 미해결 항목을 기록한다.
- Implementer brief에는 `/Users/ma-24-007/.codex/skills/arc/references/test-driven-development.md`와 승인 설계·계획의 필요한 절을 지정한다.
- 제품 파일을 편집하기 전에 fixture의 기존 10개 프로필 protected hash가 기준선 HEAD의 파일과 일치하는지 확인하고, 이 값을 `agentProfileBaseline`으로 복사한다. 기준 revision은 `e112462fba82481b7891df8baf29a3729411b99a`다.
- 해당 기준선 검사는 구현 전 자료 확인이며 기능 검증으로 보고하지 않는다. 실행 환경/native 자산의 baseline 가용성도 handoff 전에 확인해 기록한다.

### 2. Renderer RED 검사 작성

신규 `tests/node/agent-fragments.test.mjs`에서 다음을 먼저 고정하고 새 기능이 없는 상태의 예상 RED를 확인한다.

- 승인 inventory 25개, 정확히 10개 target, ID·marker 개수·순서와 위 표의 프로필별 참조 수.
- Planner workflow 6개 bullet의 원문 동일성 및 CP/XP에서의 각 1회 사용.
- 확장된 10개 프로필 byte hash가 별도 `agentProfileBaseline`과 동일함.
- inline incident/resume/verification/read-only 문장 경계, 공백, 개행, 문장 중복 보존.
- 잘못된 schema, 중복/누락/미사용 ID, 알 수 없는 ID, 역순·중복·누락 marker 및 잘못된 예약 marker 문법 거부.
- Claude frontmatter를 닫은 뒤의 본문과 Codex `developer_instructions` 본문에서만 marker 허용.
- 같은 입력의 결정성, 입력 Buffer/Map 불변성, LF/CRLF 및 marker 바깥 byte 보존.

예상 RED는 기능 부재로 설명되는 결과와 환경 실패를 구분해 기록한다. 실패를 자동 재시도하거나 검사 조건을 바꾸지 않는다.

### 3. Registry, renderer와 prompt template 구현

- 승인 설계 inventory의 원문을 중복 없이 registry에 저장한다. 승인되지 않은 내용은 추가하지 않는다.
- Registry는 `schemaVersion: 1`, `fragments: [{id, text}]`, `targets: [{path, fragments: [id, ...]}]` 형식으로 검증한다. 승인된 10개 경로와 각 marker 순서를 강제한다.
- marker 문법은 `{{ARC_AGENT_FRAGMENT:<id>}}`다. Registry 원문 안의 prompt marker·언어 placeholder·policy 관리 경계를 거부한다.
- renderer는 Buffer·registry를 입력받는 결정적 순수 함수로 구현한다. 파일/네트워크/명령 실행, 재귀 include, 대체 원천/fallback은 두지 않는다.
- marker는 Claude frontmatter를 닫은 뒤의 본문과 Codex `developer_instructions` 값에서만 허용한다. Claude frontmatter와 다른 Codex 설정 값의 marker는 거부한다. 정책 블록과 언어 marker는 변경하지 않는다.
- 승인된 공유 구간만 각 template에서 marker로 바꾸고, 원본 hash 기준으로 확장 결과가 기존 10개 프로필과 정확히 같은지 확인한다.
- Codex 최종 TOML 파싱과 Claude frontmatter 검사로 유효성을 확인한다. 구조·metadata·tool allowlist는 보존한다.

### 4. Payload와 설치 합성 연결

- 먼저 `manifest.test.mjs`, `plan.test.mjs`, `upgrade-harness.test.mjs`에 신규 입력 필수성 및 실패 경계 검사를 작성해 새 동작의 RED를 확인한다.
- `verifyPayload`가 Registry·renderer 존재를 필수 보호 자산으로 확인하고, registry와 양 플랫폼의 정확히 10개 template을 함께 검증한다. 검증된 Registry를 설치 payload에 전달한다.
- 설치 합성 순서는 **모델 설정 → fragment 확장 → 언어 정책 적용 → 최종 형식/미해결 marker 검증**으로 한다.
- 검증한 선택 플랫폼 5개 프로필만 완성해 기존 install/upgrade 계획에 전달한다. 공개 `renderProfiles` API와 구현은 변경하지 않는다.
- 누락 파일·registry·profile, manifest 갱신 뒤의 불완전 payload, mapping 오류를 `ARC_PAYLOAD_VALIDATION`으로 설치 변경 전에 거부한다.
- 실패가 파일/temp 쓰기, 명령 실행, 네트워크, 부분 설치를 발생시키지 않는지 기존 안전 경계에서 확인한다.

### 5. Fixture, package, manifest 정합성 및 회귀

- 설치·upgrade 직접 payload fixture에 검증 가능한 Registry 입력을 추가한다.
- 기존 protected hash fixture는 변경된 10개 template hash로 갱신하고, 독립 원본 hash는 편집 전 복사본을 사용한다.
- package 검사에 `lib/prompts/agent-fragments.json`, `lib/prompts/render.mjs` 포함 assertion을 추가한다. package 경계 자체는 변경하지 않는다.
- `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`을 갱신한다. role-policy 생성물, language source, 모델 설정, 정책 관리 block을 갱신하지 않는다.
- v2 amendment 승인 뒤 `tests/test_claude_payload.py`의 모든 profile-body read 경로와 foreign-platform-contract profile scan을 production renderer에 연결한다. raw frontmatter/model/tool/apply-models assertion은 원문 profile bytes를 유지하고, 모든 기존 assertion을 보존한다. 이 어댑터는 Python에서 fragment expansion을 복제하지 않으며 실제 설치 출력과 같은 production 함수를 호출한다.

## 검증 계획

아래 명령은 저장소 루트에서 구현 후 실행한다. 아직 실행하지 않았다. 테스트 파일, `npm test`, manifest `--check`, parity 옵션은 현재 저장소에 존재함을 계획 검토 중 정적으로 확인했다.

| 단계 | 명령 | 증거 |
|---|---|---|
| Fragment 집중 검사 | `node --test tests/node/agent-fragments.test.mjs` | inventory, 기준선 byte hash, 결정성·불변성·형식·오류 경계 통과 |
| Payload·install·upgrade | `node --test tests/node/manifest.test.mjs tests/node/plan.test.mjs tests/node/upgrade-harness.test.mjs` | 필수 자산 거부, 무쓰기, 완성 출력, 기존 8개 출력 hash 통과 |
| Policy·model·parity·layout | `node --test tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/parity-check.test.mjs tests/node/instruction-layout.test.mjs` | 기존 생성 정책과 공개 모델 renderer, parity·layout 계약 유지 |
| Package·release | `node --test tests/node/package.test.mjs tests/node/release-artifact.test.mjs` | 신규 원천 package 포함 및 artifact 회귀 통과 |
| Claude payload | `python3 -B -m unittest discover -s tests -p 'test_claude_payload.py' -v` | 본문 contract assertion은 production renderer로 확장한 Claude 프로필 대상. frontmatter, tool allowlist, model/effort/apply-models assertion은 원문 template 대상으로 유지. 남은 실패는 baseline/current로 분류 |
| 전체 Node 회귀 | `npm test` | 미해결 실패 없음; baseline/current 및 영향 범위 보고 |
| Policy 생성물 | `node scripts/update-role-policy.mjs --check` | 변경 없이 check 통과 |
| 보호 Manifest | `node scripts/update-manifest.mjs --check` | 전체 hash 일치 |
| Installer parity | `node scripts/check-installer-parity.mjs --root /Users/ma-24-007/Desktop/workspace/arc --complete` | 기존 parity inventory·대응 검사 통과 |

먼저 집중 검사를 통과한 뒤 나머지 관련 검사와 전체 회귀를 실행한다. Node/native/Python 검증 자산이 없거나 검사 실패가 baseline인지 현재 변경인지 불명확하면 우회·설치·재빌드·검사 생략 없이 정확한 결과를 보고하고 영향 task를 보류한다. 현재 v1 Python 실행에서 48 tests 중 127 failed assertions/subtests가 관찰되었다. raw Claude profile prose를 기대하는 profile-body read 경로는 이번 marker 변경의 영향으로 판정했으며, v2 승인 뒤에만 계획된 adapter를 수정한다. Skill/reference source 및 모델 검사의 남은 실패는 재실행 결과로 별도 분류하며 미리 baseline으로 간주하지 않는다.

## Acceptance criteria와 QA 증거

승인 설계의 AC-1~AC-9를 변경하지 않고 그대로 적용한다.

| AC | 필요한 증거 |
|---|---|
| AC-1 | 25개 ID, 10개 target, marker ID·순서·프로필별 수(97개 전체) 및 Planner workflow 원문. 승인 대상의 중복 원문이 남지 않았는지 정적 대조 |
| AC-2 | policy/language 원천 불변 diff, policy check, 비동일 incident/예외/역할 문구 유지 |
| AC-3 | 확장된 10개 출력과 `agentProfileBaseline`의 독립 hash 일치, 기존 설치 rendering hash 8개 변경 없음 |
| AC-4 | Claude/Codex 설치 결과에 미해결 prompt marker 없음, TOML/frontmatter·model/effort/tools/settings 유지 |
| AC-5 | malformed/missing Registry·marker·profile·순서 거부, manifest 재생성 뒤 필수 자산 누락 거부, 설치 전 무쓰기 |
| AC-6 | 공개 `renderProfiles`가 비모델 marker 포함 byte를 유지하는 기존 계약 통과 |
| AC-7 | 결정성, 입력 불변성, LF/CRLF 및 marker 외 byte 보존 |
| AC-8 | source/package 필수 파일, package 포함, manifest hash, payload 삭제/누락 공격 검사 |
| AC-9 | 기존 role-policy, parity, model render, Claude payload, install/upgrade, full Node 회귀 유지; assertion 완화·삭제·skip 없음 |

Fresh QA는 각 AC마다 실행 명령, 실행 상태, 관찰된 결과, 판정(proven/unmet/unverified), 근거 위치, 미검증 이유와 남은 범위를 기록한다. 단일 PASS나 hash 개수로 전체 기준을 대체하지 않는다. 이 검사는 설치 산출물 구조·byte 동등성을 보이며 실제 Claude/Codex 세션의 live compliance는 주장하지 않는다.

## 수락, commit 및 최종 검토

1. Implementer는 변경 파일, RED/GREEN과 회귀 증거, 실패/한계 및 필요한 QA 후속을 보고한다.
2. Fresh QA가 TASK-01과 AC-1~AC-9를 독립 검증한다. QA 실패는 같은 Implementer 수정 뒤 QA가 영향 검사를 재확인한다.
3. Orchestrator가 모든 필수 검사·기준·finding·미검증 범위를 판단해 TASK-01을 수락한다. 필수 증거 미해결 시 수락하지 않는다.
4. Orchestrator가 전체 TASK-01을 단일 focused 구현 commit으로 기록한다. 제안 메시지: `refactor(prompts): 역할 공통 지침을 설치 시 합성`.
5. 구현 수락·commit 및 필수 QA/재검사 뒤 fresh Reviewer가 전체 최종 변경을 한 번 독립 검토한다. Reviewer는 task 수락이나 commit의 선행 gate가 아니다.
6. 최종 Reviewer finding은 범위와 승인 이력을 기록한 수정 뒤 Implementer → Reviewer 재검사로 해결한다. 이 최종 plan 단계에서 QA를 재배정하지 않는다.
7. Orchestrator가 최종 Reviewer 결과와 기존 검증의 유효성을 확인해 전체 완료를 수용한다.

이 계획은 push, merge, publish 또는 실제 사용자 환경 설치를 포함하지 않는다. 구현 수락 전에는 코드 commit을 만들지 않는다.

## 계획 자기 검토

- 승인 설계 v2의 25개 fragment와 AC-1~AC-9를 task·파일·검사·QA 증거로 연결했다.
- 누락됐던 Planner 동일 6개 bullet을 ID, 원문 검사와 대상 수에 반영했다.
- 원본 template hash, 변경 후 protected template hash, 기존 8개 설치-output baseline을 서로 혼동하지 않도록 분리했다.
- `package.json` 수정은 불필요함을 실제 `files: ["lib/"]` 설정으로 확인했다.
- fixture, manifest, 설치/upgrade 직접 입력, 패키지 포함과 공개 renderer 경계를 확인했다.
- 설치 전 검증·fail-closed 경계와 실제 세션 동작 주장 한계를 명시했다.
- v1은 처음 구현이 시작된 승인 계획이고, v2 amendment는 현재 승인된 계획이다. 안전한 원래 문서 commit amendment와 새 Implementer handoff 전에 v2 추가 파일 편집은 하지 않는다.
- v2 Python adapter는 existing assertions와 raw frontmatter/model/tool checks를 보존하면서 agent profile prose 및 foreign-platform-contract scan이 실제 production expansion을 검사하게 한다. 새로운 제품 문구, renderer 동작 또는 AC를 추가하지 않는다.
