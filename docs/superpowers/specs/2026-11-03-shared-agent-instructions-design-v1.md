# 역할 프로필 공통 지침의 설치 시 합성 설계

## 버전 및 승인 기록

- v1: 사용자 승인 완료 (2026-11-03; 승인 당시 초안 SHA-256: e5f8e47569d1401eaaae69d7758768830c74a8879395bf99b934f617371b2083).
- 저장소: `/Users/ma-24-007/Desktop/workspace/arc`
- 선택 대상: `refactor/arc-instructions`, HEAD `e112462fba82481b7891df8baf29a3729411b99a`
- 실행 상태: 사용자가 현재 체크아웃을 선택했고, 선택 직후 clean 상태와 문서 경로 부재를 확인했다.

## 1. 목적과 승인 범위

Claude와 Codex의 다섯 역할 프로필에 반복된 지침을 한 원천에서 관리한다. 각 프로필에는 공유 조각 marker를 두고 설치 과정에서 조각을 채워 최종 설치 프로필을 완성한다. 설치된 에이전트는 별도 파일을 include하지 않아도 전체 지침을 받는다.

사용자가 요청한 범위는 두 플랫폼 역할 프로필 10개의 공통 문구 전체다. 모든 역할에 공통인 문구, 일부 역할 집합에 공통인 문구, 같은 역할의 두 플랫폼에서 같은 문구를 포함한다. 기존 문구의 의미·의무 강도·조건·예외·순서와 플랫폼별 차이를 보존한다.

이 작업은 프롬프트의 중앙 관리 구조를 바꾸므로 Significant이며 Architectural 경로로 진행한다. 따라서 이 설계의 승인 뒤 정식 spec 승인과 계획 승인을 각각 받은 뒤 구현한다.

## 2. 현재 구조와 보존 경계

현재 각 프로필에는 직접 작성한 문구, 언어 정책 marker, `lib/policy/role-policy.json`에서 생성되는 정책 블록이 함께 있다.

- 정책 생성 대상은 10개 역할 프로필을 포함한다: `lib/policy/render.mjs:30-33`.
- 정책 renderer는 관리 블록만 교체한다: `lib/policy/render.mjs:50-78`.
- 설치 언어 정책은 `{{ARC_OUTPUT_LANGUAGE_POLICY}}`를 채운다: `lib/installer/language.mjs:2,12-13`.
- 설치기에서 모델 프로필을 렌더링하고 언어 정책을 적용한다: `lib/installer/plan.mjs:19-22`.
- `renderProfiles`는 모델 설정만 바꾸고 다른 프로필 바이트를 보존한다: `lib/models/profiles.mjs:99-108`, `tests/node/profile-render.test.mjs:11,45-62`.
- 기존 copyedit 계획은 설치기·renderer 변경을 제외한다: `docs/superpowers/plans/2026-11-03-arc-instruction-copyedit.md:59-64`. 그 계획은 이번 범위의 승인을 대신하지 않는다.

이번 변경은 기존 역할 정책과 언어 정책 원천을 복제하거나 그 동작을 바꾸지 않는다. TOML/frontmatter 구조, 모델·effort·name·description·도구 목록·capability, 프로필별 고유 문구도 보존한다.

## 3. 공통 문구 목록과 대상

표에서 C는 Claude, X는 Codex, I/P/Q/R/S는 Implementer/Planner/QA/Reviewer/Scouter다. 대상 파일은 다음 열 개로 한정한다.

| 코드 | 프로필 |
|---|---|
| CI | `claude/agents/arc-implementer.md` |
| CP | `claude/agents/arc-planner.md` |
| CQ | `claude/agents/arc-qa.md` |
| CR | `claude/agents/arc-reviewer.md` |
| CS | `claude/agents/arc-scouter.md` |
| XI | `codex/agents/arc-implementer.toml` |
| XP | `codex/agents/arc-planner.toml` |
| XQ | `codex/agents/arc-qa.toml` |
| XR | `codex/agents/arc-reviewer.toml` |
| XS | `codex/agents/arc-scouter.toml` |

아래 항목은 반복된 원문을 그대로 별도 조각으로 관리한다. 문구가 유사하지만 다르면 별도 조각으로 만들지 않는다.

| Fragment ID | 공유되는 내용 | 대상 |
|---|---|---|
| `common.brief-boundary` | 승인된 brief와 범위 사용, 변경 보고, 보고 후 책임 이관 문단. 예: `claude/agents/arc-planner.md:16` | 10개 전체 |
| `common.specialist-basics` | depth 2 직접 보고, 자료를 권위로 취급하지 않음, 필요한 범위만 읽는 세 bullet. 예: `codex/agents/arc-planner.toml:20-22` | 10개 전체 |
| `common.preservation-choice-inspection` | preservation, explicit choice, stop and inspect 세 bullet. 예: `claude/agents/arc-implementer.md:25-27` | C의 5개, XI |
| `common.optional-read-exception` | bounded optional read recovery 예외 문장. 예: `codex/agents/arc-implementer.toml:31` | 10개 전체 |
| `common.resume-gates` | Orchestrator의 해결 후 gate 재검증 문장. 예: `codex/agents/arc-planner.toml:24` | XI를 제외한 9개 |
| `claude.incident-prefix` | conflict/missing path/tool failure/partial completion 관측 및 보고의 첫 두 문장. 예: `claude/agents/arc-implementer.md:29` | C의 5개 |
| `codex.incident-prefix` | 실패 시 의존 작업 중지, 상태 보고, 자동 재시도·fallback 금지 문장. 예: `codex/agents/arc-planner.toml:24` | XP, XQ, XR, XS |
| `claude.profile-guidance` | Orchestrator의 ARC SKILL 재로딩 금지부터 target choice 명시까지의 문단. 예: `claude/agents/arc-implementer.md:31` | C의 5개 |
| `common.verification-reference` | brief가 지정한 verification 참조만 읽는 문장. 예: `claude/agents/arc-qa.md:33` | CQ, XQ, CR, XR |
| `common.read-only-no-mutations` | read-only 유지 및 수정·상태 변경 금지 문장. 예: `codex/agents/arc-reviewer.toml:33` | CR, CS, XR, XS |
| `implementer.execution-steps` | 할당 파일 편집부터 보고까지 번호 지침 1–12. 예: `claude/agents/arc-implementer.md:37-48` | CI, XI |
| `planner.target-evidence` | formal spec/plan 전 prepared target 증거 요구 문단. 예: `claude/agents/arc-planner.md:32` | CP, XP |
| `planner.task-shape` | top-level task의 구성·의존성·criteria·검증·hold 요구 문단. 예: `claude/agents/arc-planner.md:41` | CP, XP |
| `planner.commit-boundary` | 승인된 top-level task와 focused commit 경계 문단. 예: `codex/agents/arc-planner.toml:37` | CP, XP |
| `planner.visual-question` | visual question의 반환 내용과 제한 문단. 예: `codex/agents/arc-planner.toml:39` | CP, XP |
| `planner.final-plan-recheck` | 계획 작업의 최종 Reviewer finding recheck 순서 문단. 예: `claude/agents/arc-planner.md:47` | CP, XP |
| `qa.contract-intro` | QA 프로필의 완전한 계약 및 verification 참조 안내 문장. 예: `claude/agents/arc-qa.md:33` | CQ, XQ |
| `qa.verification-steps` | QA의 검증·보고 지침 1–7. 예: `claude/agents/arc-qa.md:35-41` | CQ, XQ |
| `reviewer.contract-intro` | Reviewer 프로필의 완전한 계약 및 verification 참조 안내 문장. 예: `codex/agents/arc-reviewer.toml:26` | CR, XR |
| `reviewer.review-steps` | Reviewer의 6개 검토 bullet에서 마지막 공통 read-only 문장 앞까지. 예: `claude/agents/arc-reviewer.md:34-39` | CR, XR |
| `reviewer.final-plan-findings` | 계획 작업의 최종 Reviewer finding 처리 문단. 예: `codex/agents/arc-reviewer.toml:35` | CR, XR |
| `scouter.research-brief` | 승인된 brief에 따른 정적 조사 범위·근거·보고 문단. 예: `codex/agents/arc-scouter.toml:26` | CS, XS |
| `scouter.research-mode` | static research only 및 금지 업무를 선언하는 첫 bullet의 read-only 문장 앞부분. 예: `claude/agents/arc-scouter.md:36` | CS, XS |
| `scouter.additional-boundaries` | standalone 문서 금지, 역할 소유권, operational scope, mixed work 반환의 네 bullet. 예: `codex/agents/arc-scouter.toml:29-32` | CS, XS |

같은 의미처럼 보여도 incident 처리 문구에서 달라지는 조건은 각각 `claude.incident-prefix`와 `codex.incident-prefix`로 유지한다. `common.optional-read-exception`과 `common.resume-gates`만 실제 동일 문장에 한해 공유한다. 역할별 나머지 고유 문구는 해당 프로필에 둔다.

## 4. 원천 및 marker 구조

공통 문구는 `lib/prompts/agent-fragments.json`에 둔다. JSON은 schema version, 각 fragment ID와 원문, 10개 프로필별 fragment ID·순서 목록을 가진다. 각 원문은 한 번만 저장한다. fragment 안에 marker, policy 관리 경계 또는 언어 placeholder를 포함하지 않는다.

프로필 본문에는 다음 형식의 marker를 둔다.

`{{ARC_AGENT_FRAGMENT:common.brief-boundary}}`

renderer는 지정된 프로필에 등록된 ID만 확장한다. 대상 목록은 고정된 열 개 프로필과 일치해야 한다. Marker 누락·중복·역순·알 수 없는 ID·예약 marker의 잘못된 문법·사용되지 않는 fragment·잘못된 schema를 거부한다. Marker는 TOML 설정 필드나 Claude frontmatter 안에 둘 수 없다. Marker는 단독 줄 또는 원문에서 분리한 문장 경계에 놓고, renderer는 marker 외의 공백·개행을 자동 추가하지 않는다. 필요한 구분 공백도 fragment 원문에 정확히 담는다.

renderer는 검증된 Buffer와 registry만 입력받는 결정적 함수다. 파일·네트워크 접근, 실행, 재귀 include, fallback은 지원하지 않는다. 원문은 기존 프로필의 위치·공백·목록 표기를 그대로 재구성하도록 보존한다. 입력의 LF/CRLF 형식도 유지한다.

## 5. 설치 및 payload 검증

설치 흐름은 다음 순서를 따른다.

1. payload에서 registry와 정확히 열 개의 프로필 template을 읽고 검증한다.
2. `renderProfiles`로 기존 모델·effort 설정을 적용한다. 공개 함수는 변경하지 않는다.
3. 선택 플랫폼의 marker를 registry에서 합성한다.
4. 기존 language renderer로 `{{ARC_OUTPUT_LANGUAGE_POLICY}}`를 적용한다.
5. 최종 TOML/Claude 프로필 형식과 marker 부재를 확인한다.
6. 검증을 모두 통과한 완성 Buffer만 기존 설치 계획에 전달한다.

`verifyPayload`는 registry와 renderer를 필수 보호 자산으로 확인하고 양 플랫폼 template을 검증한다. Marker나 필수 원천이 없거나 malformed면 설치 변경 전 실패한다. 다른 위치에서 대체 파일을 찾거나 빈 문자열로 치환하지 않는다. 기존 transaction과 rollback 경계는 그대로 둔다.

공유 renderer는 `lib/prompts/render.mjs`, registry는 `lib/prompts/agent-fragments.json`에 둔다. `lib/`는 package 입력 범위에 포함된다(`package.json:27`); payload의 필수 파일 목록에도 두 파일을 추가한다(`lib/installer/manifest.mjs:43-52`). `MANIFEST.sha256`은 변경된 프로필과 새 파일의 hash를 반영한다.

## 6. 공개 API와 포맷 보존

`renderProfiles`의 공개 API, 입력·반환 형식과 모델 필드 전용 변경 계약은 유지한다. 그 함수는 fragment marker가 포함된 비모델 바이트를 그대로 보존한다. 설치기에서만 marker를 확장한다.

Codex TOML 전체를 재직렬화하지 않는다. Fragment 삽입 뒤 TOML parser로 최종 본문이 유효한지 검사한다. Claude frontmatter와 tool allowlist는 변경하지 않는다. 최종 설치 결과는 현재 프로필의 같은 model/language 설정으로 렌더링한 기준선과 byte-for-byte 동일해야 한다. 허용 차이는 입력 template의 공유 원문을 marker로 바꾼 것뿐이다.

## 7. 완료 기준과 검증

| ID | 완료 기준 |
|---|---|
| AC-1 | 표의 모든 동일 문구가 한 fragment 원천으로 이동했고, 각 대상 marker와 순서가 registry mapping과 일치한다. |
| AC-2 | `role-policy.json` 및 언어 정책을 복제하지 않았고, 비슷하지만 다르게 쓰인 조건·예외는 합치지 않았다. |
| AC-3 | 양 플랫폼 5개 역할의 설치 결과가 현재 본문 기준선과 byte-for-byte 동일하다. |
| AC-4 | 최종 설치 프로필에 미해결 prompt marker가 없고, TOML/frontmatter·모델·effort·도구 설정이 보존된다. |
| AC-5 | malformed/missing registry·marker·profile을 설치 전 거부하고, fallback이나 부분 설치를 만들지 않는다. |
| AC-6 | 공개 `renderProfiles`의 비모델 바이트 보존 계약이 유지된다. |
| AC-7 | renderer가 결정적이고 입력 Buffer를 변경하지 않으며 LF/CRLF 형식을 보존한다. |
| AC-8 | source/package payload 및 manifest에 새 원천이 포함되고 변경 hash가 일치한다. |
| AC-9 | 기존 정책 생성, role parity, model rendering, Claude payload, 설치 계획 검증 범위가 유지된다. |

기존 관련 검증 경로는 `tests/node/role-policy.test.mjs:55-104`, `tests/node/parity-check.test.mjs:42-56`, `tests/node/profile-render.test.mjs:8-62`, `tests/node/instruction-layout.test.mjs:71-73`, `tests/node/plan.test.mjs:7,14,65-67`, `tests/test_claude_payload.py:49-58,146-165`다. 새 registry/renderer의 malformed 입력·대상 순서·결정성 검증과 확장 결과 비교가 필요하다. 기존 assertion을 삭제하거나 범위를 낮추지 않는다.

구조·설치 출력 검증은 해당 출력의 완전성을 보일 뿐, 실제 Claude/Codex 세션에서의 live compliance를 보이지 않는다.

## 8. 의존관계와 위험

공유 원천, marker 배치, payload 검증과 설치 합성은 하나의 의존 작업이다. 어느 하나만 배포하면 템플릿이 미완성으로 설치되거나 source와 runtime이 어긋난다. 하나의 top-level 구현 task로 묶는다.

주요 위험은 긴 Markdown 문구를 TOML multiline string 안에서 확장할 때 공백·개행·인용 처리가 달라지는 점, fragment 경계가 기존 문장 구성을 깨뜨리는 점, 새 registry를 fixture/package에 누락하는 점이다. 원문 기준선 대조, 최종 parser 검사, fail-closed payload 검증으로 확인한다. 기존 정책 marker와 새 fragment marker의 namespace를 분리한다.

## 9. 승인 후 단계

1. 사용자가 이 설계를 승인한다.
2. Planner가 이 설계에 의존하는 정식 plan과 self-review를 작성한다. Orchestrator가 통합·검토하고 사용자 승인을 받는다.
3. 승인된 범위와 현재 target을 기준으로 handoff를 준비하고, 필요한 구현·회귀검증을 진행한다.
4. 필요한 QA와 재검사 뒤 독립 Reviewer가 최종 전체 변경을 검토한다. Orchestrator가 criterion별 근거와 남은 한계를 확인해 수용한다.

## Self-review

- 사용자 요청을 두 플랫폼의 10개 역할 프로필 전체와 정확히 중복되는 부분에 한정했다.
- 기존 policy/language 관리와 역할·플랫폼별 고유 계약을 새 원천으로 옮기지 않았다.
- 기존 copyedit 계획의 승인 범위를 확장하지 않고 별도 설계/계획 경로를 사용한다.
- installer, manifest, 모델 renderer, payload fixtures와 기존 회귀 경로를 연결했다.
- 실제 세션의 동작 동일성이나 live compliance를 주장하지 않는다.
