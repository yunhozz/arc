# Planner 토큰 효율 개선 구현 계획 (Bounded)

**목표:** Planner 탐색 예산(R1), 단계별 Planner 분리(R2), Bounded 계획 밀도(R3)를 Claude·Codex 사본에 동일 의미로 반영한다.

**근거:** 과거 Planner 실행(opus/medium)은 68~101턴, Read/Grep 46~62회, 출력 125k~320k 토큰(추정 85~90% 추론), 컨텍스트 최대 150~190k, 한 에이전트 재사용 핸드백 3~4회였다. 근거 사전 수집과 예산을 지정한 시범 실행은 17턴, 출력 약 15k였다.

**출처/대상:** 출처 `/Users/ma-24-007/Desktop/workspace/arc` master `99ba7ce`(clean). 대상 worktree `/Users/ma-24-007/Desktop/workspace/arc/.claude/worktrees/planner-token-efficiency`, 브랜치 `chore/planner-token-efficiency`(`99ba7ce`에서 생성, 사용자 명시 선택).

**깊이:** Bounded. 2026-11-12 사용자 승인: 설계 B안, 탐색 기본값 명시(Bounded 약 15 / Architectural 약 30 Read·Grep), 설계 단계 내 Planner 재사용 허용, 핸드백 상한은 brief 재량, role-policy `planning.planner-brief`의 재사용 문장 1개 수정 허용. 별도 written spec 없음.

**변경 금지:** upstream `claude|codex/skill/references/{brainstorming,writing-plans,test-driven-development}.md`, `superpowers-provenance.json`, `models.toml`, 라우팅 설정, runtime 코드. `lib/policy/role-policy.json`은 T3의 한 문장 외 변경 금지.

**TDD:** 동작 변경이 없는 정책 텍스트 변경이므로 문서/설정 예외를 적용한다. 단, 문구를 검사하는 기존 테스트는 새 문구에 맞춰 갱신한다.

## T1: Planner fragment와 두 profile (R1, R3의 Planner 쪽)

- **파일:** `lib/prompts/agent-fragments.json`(`planner.workflow-contract` 뒤에 새 id `planner.exploration-density`), `claude/agents/arc-planner.md`·`codex/agents/arc-planner.toml`(`{{ARC_AGENT_FRAGMENT:planner.workflow-contract}}` 바로 뒤에 placeholder), 필요 시 `tests/node/agent-fragments.test.mjs`·`tests/node/manifest.test.mjs`, `MANIFEST.sha256`(이 태스크 안에서 재생성).
- **fragment 규칙 내용:**
  - brief 증거를 먼저 쓴다. 넓은 추가 사실이 필요하면 직접 탐색하지 말고 Orchestrator에게 Scouter 조회를 요청해 반환한다.
  - 편집 위치를 특정하는 데 필요한 범위만 읽는다.
  - brief의 Read/Grep 예산을 따른다. 없으면 Bounded 약 15, Architectural 약 30. 초과가 필요하면 멈추고 반환한다.
  - upstream brainstorming "Look Before You Ask"의 읽기는 brief 증거와 예산 안에서 충족된다.
  - 탐색 예산은 Planner 호출 횟수 제한이 아니다("no fixed call cap"은 유지).
  - (R3) brief 깊이가 Bounded이면 태스크별 ID/제목, 목표/범위/파일, 선행, 기준, 필수 점검/증거만 요구한다. 정확한 시그니처, 단계별 테스트 코드, Review Focus, 4부 self-review는 생략 가능하며 짧은 체크리스트로 대체한다. Architectural은 `writing-plans.md` 전체 밀도를 유지한다. 이는 Bounded에 한해 `writing-plans.md` 밀도 요구보다 우선하는 ARC 적응이며 upstream 문서는 수정하지 않는다.
  - Orchestrator는 brief에서 핸드백 크기 상한을 정할 수 있다(고정 수치 없음).
- **선행:** 없음.
- **기준:** 두 profile이 같은 fragment를 같은 위치·순서로 참조한다. 기존 "Bounded work follows Orchestrator's separate depth assessment"와 충돌하지 않는다. upstream 파일 해시 불변.
- **필수 점검:** `node --test tests/node/agent-fragments.test.mjs tests/node/manifest.test.mjs`, `npm run check:manifest`, `npm run check:role-policy`(변경 없이 통과).
- **진행 기록 (2026-11-12, 수락):** 완료. `lib/prompts/render.mjs`의 `EXPECTED` 두 Planner 목록에도 id를 추가해야 했다(렌더러 id 허용 목록, Orchestrator 범위 확장 승인; bridge 사후 감지 `permission_violation_observed`는 이 경로로 대조 완료). focused 테스트 84 통과·1 실패이며, 실패한 `expands all approved profile templates ...`는 master `99ba7ce`에서도 10개 프로필 전부 해시 불일치인 기존 기준선 실패다. MANIFEST 재생성은 master에서 이미 stale이던 `scripts/deploy.sh` 해시도 함께 갱신했다.

## T2: coordination.md와 planning.md 두 사본 (R1의 Orchestrator 쪽, R2, R3의 Orchestrator 쪽)

- **파일:** `claude/skill/references/coordination.md`·`codex/skill/references/coordination.md`의 "Planner dispatch efficiency" 문단, `claude/skill/references/planning.md`·`codex/skill/references/planning.md`의 "Planner drafting preparation and consolidated feedback" 항목 3·4(관리 섹션 밖), `MANIFEST.sha256`(이 태스크 안에서 재생성).
- **규칙 내용:**
  - coordination.md: "Reuse relevant Planner context across stages only while role, source and context remain valid. Follow-up briefs cite an accessible prior brief for unchanged fields."를 다음으로 교체한다. (a) Orchestrator는 Planner brief에 경로/행이 검증된 증거와 Read/Grep 예산(기본 Bounded 약 15, Architectural 약 30)을 넣는다. (b) 추가 넓은 탐색은 Scouter에 맡긴다. (c) R2 규칙.
  - planning.md 항목 3: "Reuse a relevant Planner instance across related stages when ..." 문장을 R2 규칙으로 교체한다. 같은 Planner는 설계/브레인스토밍 단계 안(초기 초안과 통합 수정 1회)에서만 재사용한다. 설계 승인 뒤 spec 단계와 plan 단계는 각각 새 Planner를 쓰며, brief에 모든 필수 필드와 저장된 문서 경로·승인 버전을 담는다. 이전 brief 인용은 그 brief가 접근 가능한 파일일 때만 허용한다. 단계 안 후속 brief와 증거 재사용 조건 문장은 유지한다.
  - planning.md 항목 4: Bounded 계획 밀도는 Planner fragment의 ARC 적응을, Architectural은 `writing-plans.md` 전체 밀도를 따른다는 문장과 brief에서 핸드백 상한을 선택적으로 정할 수 있다는 문장을 추가한다.
  - "Add no fixed call cap/profile count condition"은 유지한다.
- **선행:** T1(같은 `MANIFEST.sha256`을 수정하므로 순차).
- **기준:** 두 사본 의미 일치(행·표현 차이 허용). 관리 섹션(`[ARC role policy: contract begin]` 이후) 미수정. 관리 섹션 밖 본문에 단계 간 재사용 문구 0건.
- **필수 점검:** `npm run check:manifest`, `npm run check:role-policy`(변경 없이 통과), 관리 섹션 밖 grep `across (related )?stages|Planner instance|Planner context` 0건.
- **진행 기록 (2026-11-12, 수락):** 완료. 두 사본 diff 동일, `check:manifest`·`check:role-policy` 통과, `role-policy.test.mjs` 24/24 통과, 관리 섹션 밖 단계 간 재사용 문구 0건, 한글 0건.

## T3: role-policy `planning.planner-brief` 재사용 문장

- **파일:** `lib/policy/role-policy.json`의 `planning.planner-brief` 중 "Reuse the same Planner instance across related stages when its role, context and source remain valid." 한 문장만 R2 규칙으로 교체. `npm run update:role-policy`로 생성되는 `claude|codex/skill/runtime/role-policy.json`과 `claude|codex/skill/references/planning.md` 관리 섹션 등 생성물. `tests/node/role-policy.test.mjs:166` 정규식(새 문구에 맞춤, 167~169행 유지). 관련 문구가 있으면 `tests/node/fixtures/instruction-contracts.json`. `MANIFEST.sha256` 재생성.
- **선행:** T2.
- **기준:** 저장소 전체(`docs/` 제외) grep에서 단계 간 재사용 문구 0건. "no fixed call cap" 문구와 관련 테스트(`tests/test_arc_policy.py:465`, `tests/test_harness_contract.py:47`) 유지. 생성기 외 수동 편집 없음.
- **필수 점검:** `npm run check:role-policy`(재생성 후 통과), `node --test tests/node/role-policy.test.mjs tests/node/runtime-assignment.test.mjs`, `npm run check:manifest`.

## 최종 검증 (모든 태스크 수락 후)

- Orchestrator가 `npm test` 전체 실행. 기준선(알려진 실패 약 89건, tui-setup hang 가능) 대비 새 실패 0건.
- upstream 파일 해시 불변 확인.
- 독립 최종 Reviewer 1회: 전체 변경 대상, 두 사본 간 정책 일관성, fragment·reference·role-policy 일관성, 기존 dispatch gate 보존.
- 위험도: 세 태스크 모두 정책 텍스트만 바꾸며 되돌리기 쉬우나, 생성 계약(T3)과 정책 일관성 위험이 있어 Reviewer 최종 1회를 둔다. 태스크별 QA는 두지 않고 구조 점검으로 판단한다.
- 설치된 `~/.claude/agents/arc-routing-planner.md` 등은 재설치 전까지 이전 문구를 쓴다(재설치는 범위 밖).

## Self-review 체크리스트

- [x] 태스크마다 ID, 목표, 파일, 선행, 기준, 점검이 있다(Bounded 밀도).
- [x] upstream 미수정, 탐색 예산과 호출 횟수 제한을 구분했다.
- [x] MANIFEST는 해시 대상을 바꾸는 각 태스크 안에서 재생성한다.
- [x] Reviewer는 최종 1회다.
- [ ] 미확인(Implementer 확인): codex planning.md 항목 4 정확한 행, `codex/agents/arc-planner.toml` placeholder 위치, fragment 테스트가 id 목록을 고정하는지 여부.
