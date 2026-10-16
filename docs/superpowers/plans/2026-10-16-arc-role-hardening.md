# ARC 역할 경계 하드닝 구현 계획

> 설계 승인: Bounded + 계획서(스펙 문서 없음), 2026-10-16, 사용자 명시 승인. 단어 예산은 중복 삭제를 먼저 하고 남는 부족분만 근거와 함께 상향하는 것으로 승인됐다. H1은 사용자가 `sandbox_mode = "read-only"` 제거를 선택했다.
> 저장 경로: `docs/superpowers/plans/2026-10-16-arc-role-hardening.md`
> 작업 기준: `/Users/ma-24-007/Desktop/workspace/arc`, branch master, base HEAD `1a9d492`.
> 증거: `/private/tmp/claude-501/-Users-ma-24-007-Desktop-workspace-arc/ae520cda-c875-490e-9b30-2871ecee0959/scratchpad/arc-hardening-evidence.md`

**목표:** CEO가 설계/계획을 직접 작성하는 역할 위반을 막고, task마다 새 Coder를 쓰며 QA가 필요한 task마다 새 QA를 쓰게 한다. Claude와 Codex의 정책 결함(HIGH/MED)을 수정하거나 사유와 함께 처분하고, README.md를 영어로 다시 쓴다.

**구조:** Task 1(Claude 정책·프로필·테스트·매니페스트) → Task 2(Codex 정책·프로필·테스트·매니페스트, sandbox_mode 제거 포함) → Task 3(global block + README 영어 재작성 + Node 테스트 + 매니페스트). 모두 Significant 위험이다.

**공통 제약:**
- `tests/installer-parity.json`의 legacyInventory/legacyHelpers와 외부 스킬은 수정하지 않는다. 매핑된 테스트 이름은 바꾸거나 삭제하지 않는다. 단언 본문은 바꿀 수 있다.
- `claude/**/*.md`에는 "codex" 등 금지어를 넣지 않는다(`tests/test_claude_payload.py:224-228`).
- 단어 예산은 `tests/test_arc_policy.py:1235-1266`이며 `policy_word_counts`(:1206)로 센다. 현재 여유는 claude 합계 74단어, codex 합계 5단어다.
- raw 대소문자 단언(`test_arc_policy.py:386-396`, :420/:756, :520, :559, `test_claude_payload.py:155-171`, :184-200, :208-264, :271-320)을 깨지 않는다. 새 문장에만 UPPERCASE(MUST/NEVER/ONLY/FRESH)를 쓴다. 기존 단언 문구 안의 대문자화가 필요하면 같은 task에서 테스트를 갱신한다.
- 단어 예산은 중복 삭제를 먼저 하고, 남는 부족분만 천장을 올린다. 상향 근거는 같은 task의 테스트 주석과 커밋 메시지에 남긴다.
- 모든 task의 Coder와 QA는 FRESH 인스턴스다. Coder는 task마다 새로 시작하고, QA는 다른 task의 인스턴스를 재사용하지 않는다. 같은 task의 수정 후 재확인에만 기존 인스턴스를 재사용할 수 있다.

## 설계 요약

- **Role gate 단락:** SKILL.md(항상 로드)에 5문장 이내로 둔다.
  - 설계·스펙·계획·brainstorming 초안은 ONLY Planner가 작성한다.
  - CEO는 NEVER 작성하지 않고, 자기 Skill 도구로 `brainstorming`/`writing-plans`를 NEVER 호출하지 않는다.
  - 자동 트리거되면 CEO는 중지하고 Planner로 라우팅한다. 브리프에 그 skill의 SKILL.md 경로를 인용한다.
  - 사용자의 "질문 생략" 요청은 설계·승인 게이트를 면제하지 않는다. Planner는 질문을 CEO에 반환한다.
  - QA가 필요한 모든 task는 FRESH QA를 쓰고, 같은 task의 재확인만 재사용할 수 있다.
- **프로필 한 줄:** 역할 프로필 10개(claude agents 5, codex agents 5)에 "Stay in your role: ONLY <업무>; NEVER <인접 역할 업무>" 한 줄을 넣는다.
- **중복 삭제:** Significant-risk 정의(SKILL.md:143-147, :163-164, planning.md:5), 재시작 브리프 규칙(SKILL.md:55-56, :187, handoff.md:7), 직접 경로 반복 문장(SKILL.md:170-171)을 한 곳으로 통일한다.
- **QA 규칙:** QA 필요성은 위험 비례로 유지한다. 필요한 모든 QA는 새 인스턴스를 쓴다. 보통/Significant task는 QA가 필요하고, 작고 낮은 위험 task만 CEO focused checks로 수락한다.

---

## Task 1: Claude 정책·프로필·테스트·매니페스트 하드닝

**목표/범위:** G1, G2, G3의 Claude 부분(D2-D15, 처리 가능한 D16-D22, Claude에 해당하는 M4/M5). global block과 README는 Task 3 범위다.
- Role gate 단락과 프로필 5개의 한 줄을 추가한다.
- fresh QA 규칙을 넣고 SKILL.md:57-58 대 :141 모순을 제거한다. verification 참조도 맞춘다.
- 재시작 브리프 규칙을 handoff.md 정본으로 통일한다. 기록 쓰기 거부 시 인라인 예외는 한 곳에만 둔다.
- dangling 참조(SKILL.md:109 "branch protection", :110 "Coder repair limits")를 정의하거나 삭제한다. 실제 존재 여부는 Coder가 확인한다.
- D4: 직접 경로의 "short design"(SKILL.md:166)을 "scope record"로 명명한다. 이는 brainstorming 설계가 아님을 명시한다.
- D8: QA 브라우저 지시(verification.md:19, arc-qa.md:15)를 allowlist(Read/Grep/Glob/Bash)에 맞게 고친다.
- D10(문서 소유 SKILL.md:17 대 :24), D11(live 프로세스/ACL 점검 소유 git-recovery.md:17), D12("simple" 정의), D13("integrate"는 save/route/approve이며 authorship이 아님), D14(handoff-prep.md:11 대 :5), D15(SKILL.md:192-193에 Coder/QA 예외 재명시)를 수정한다.
- 중복 삭제로 단어 예산을 확보한다.

**대상 파일:** `claude/skill/SKILL.md`, `claude/skill/references/*.md`, `claude/agents/*.md`(5개), `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `MANIFEST.sha256`.

**선행/의존:** 없음. 시작 시 working tree가 clean이어야 한다.

**Coder:** FRESH Coder를 이 task 전용으로 시작한다. 이전 task 컨텍스트를 이어받지 않는다. TDD로 새 규칙 테스트를 먼저 추가하고 RED를 확인한 뒤 정책을 수정해 GREEN을 확인한다.

**수락 기준:**
1. SKILL.md에 Role gate 단락이 있고 UPPERCASE 강조를 쓴다.
2. 프로필 5개에 stay-in-role 한 줄이 있다.
3. "QA or CEO focused checks" 모순이 사라지고, QA 필요 task는 FRESH QA를 쓰며 같은 task 재확인만 재사용할 수 있다고 읽힌다. verification 참조도 일치한다.
4. 재시작 브리프 규칙이 handoff.md 한 곳으로 통일된다.
5. D2-D15는 수정되었거나 처분 사유가 기록된다. D16-D22는 예산 한도 안에서 처리하며, 처분하는 항목은 사유를 남긴다.
6. 새 규칙을 단언하는 테스트가 있다: planner-only, CEO Skill 금지, 자동 트리거 시 라우팅, fresh QA, 모순 문구 부재.
7. 단어 예산 테스트가 통과한다. 상향이 있으면 근거가 테스트 주석과 커밋 메시지에 있다.
8. 기존 raw 단언과 `## ` 헤딩 목록 테스트가 통과한다.

**QA:** 이 task 전용 FRESH QA 인스턴스를 쓴다.
- 확인 항목:
  - `python3 -B -m unittest discover -s tests`
  - `node scripts/update-manifest.mjs --check`
  - `node scripts/check-installer-parity.mjs`와 `--complete`
  - 수락 기준 1-6의 텍스트 존재를 Grep으로 확인
- 같은 task의 수정 후 재확인에만 이 QA를 재사용할 수 있다.
- CEO는 QA 증거와 `git diff --stat`으로 범위 외 변경이 없음을 확인한 뒤 수락한다.

**보류 조건:** 예산 초과를 삭제로 해소할 수 없고 상향 근거가 불충분할 때. raw 단언이 의도와 충돌할 때. 매니페스트나 parity 불일치. 시작 시 working tree가 clean이 아닐 때. 이 경우 CEO에 보고한다.

**커밋:** 수락 후 CEO가 단일 집중 커밋을 만든다(commit.md 규칙).

---

## Task 2: Codex 정책·프로필·테스트·매니페스트 하드닝 (sandbox_mode 제거 포함)

**목표/범위:** Task 1과 같은 G1/G2 규칙을 Codex 텍스트에 적용하고 H1-H3, M1-M8과 처리 가능한 L1-L7을 수정한다.
- H1: `sandbox_mode = "read-only"`를 `codex/agents/arc-planner.toml`, `arc-scouter.toml`, `arc-reviewer.toml`에서 제거한다(사용자 결정). 제거한 뒤 읽기 전용은 다음 세 가지에 의존한다.
  - 세 프로필 `developer_instructions`의 프롬프트 수준 읽기 전용 문구 ("MUST NOT edit files; NEVER run commands that change state").
  - SKILL.md의 CEO 반환 후 `git status` 변경 점검 규칙. 반환 직후 CEO가 변경 여부를 확인하고, 의도치 않은 변경이 있으면 Preservation rule에 따라 중지하고 보고한다.
  - 프롬프트 수준 가드이며 샌드박스 강제가 아님을 SKILL.md에 명시한다.
- 그 외 sandbox_mode 선언(coder, qa 등)은 Coder가 확인하고 이번 범위에서 변경하지 않는다.
- sandbox_mode를 단언하는 테스트 두 곳의 본문을 갱신한다.
  - `tests/test_arc_policy.py:51` (`test_planner_groups_inseparable_changes_and_defines_task_gates`)
  - `tests/test_arc_policy.py:828` (`test_scouter_read_only_scope_and_reporting`)
  - 테스트 이름은 바꾸지 않는다. 키 부재를 단언하고, 프롬프트 수준 read-only 문구가 있음을 단언한다. `tests/installer-parity.json`은 건드리지 않는다. `lib/`와 `scripts/`에는 sandbox_mode 참조가 없다(Coder가 Grep으로 재확인한다).
- H2: codex SKILL.md:130/138과 verification.md:40의 "CEO focused checks가 significant plan task의 QA를 대체"를 정정한다(보통/Significant는 FRESH QA).
- H3: handoff.md:100 full-inline 대 :102 및 SKILL.md:52 delta-only 충돌을 통일한다.
- M1: SKILL.md:168에서 검사 실패 후 수정은 Coder로 라우팅한다(Claude와 정렬).
- M2: CEO 초안 작성 금지, Planner 실패 시 중지 규칙, 계획 누락은 Planner에 반환한다.
- M3: fresh QA 규칙을 넣는다.
- M4: Reviewer는 최종 전체 변경에 한 번 호출하고, 수정 후 같은 범위 재확인은 같은 Reviewer가 한다고 명시한다(verification.md:87-88).
- M5: handoff-prep.md:64의 자동 `-2` 접미사를 제거하고 handoff-worktree.md:20과 일치시킨다.
- M6: "existing CEO depth judgment"를 정의하고 "Planner proposes, CEO decides"로 경로 소유를 정한다.
- M7: SKILL.md:225의 존재하지 않는 `install.py`를 실제 설치 경로(npm 설치 명령, 성능 프리셋)로 교체한다. 실제 이름은 Coder가 repo에서 확인한다.
- M8: `codex/config.toml` 주석에 4개 서브에이전트 상한과 depth는 prompt-only이며 설정으로 강제되지 않음을 명시한다(주석만 변경).
- Codex 줄 번호는 계획 작성 시 직접 확인하지 못했다. Coder가 시작 시 재확인하고 불일치하면 CEO에 보고한다.

**대상 파일:** `codex/skill/SKILL.md`, `codex/skill/references/*.md`, `codex/agents/*.toml`(5개), `codex/config.toml`(주석만), `tests/test_arc_policy.py`, `MANIFEST.sha256`.

**선행/의존:** Task 1 수락·커밋 후(같은 테스트 파일과 매니페스트 공유, 용어 정합).

**Coder:** FRESH Coder를 이 task 전용으로 시작한다(Task 1 Coder 재사용 금지). TDD로 새 규칙 및 sandbox_mode 부재 테스트를 먼저 작성한다.

**수락 기준:**
1. Task 1의 수락 기준 1-3과 같은 규칙(Role gate, stay-in-role 5개, fresh QA)이 Codex에 있다.
2. 세 프로필(planner, scouter, reviewer)에 `sandbox_mode`가 없고 프롬프트 수준 read-only 문구가 있다. SKILL.md에 CEO 반환 후 `git status` 점검 규칙이 있다.
3. 두 단언(:51, :828)이 갱신되었고 테스트 이름은 유지된다. `installer-parity.json`은 변경이 없다.
4. M1, M2, H2, H3, M4, M5, M6, M7이 수정되었다. H1은 sandbox_mode 제거로 처리되었다. M8은 config.toml 주석으로 처리되었다.
5. `codex/config.toml`의 비주석 라인은 변경이 없다(diff로 확인).
6. 새 규칙 테스트가 추가되고 기존 parity와 raw 단언은 통과한다.
7. 단어 예산이 통과한다. 상향이 있으면 근거가 같은 task에 있다.

**QA:** 이 task 전용 FRESH QA 인스턴스를 쓴다(Task 1 QA 재사용 금지). 같은 task 재확인에만 재사용할 수 있다.
- 확인 항목:
  - 전체 Python 테스트
  - 매니페스트 `--check`
  - parity 일반/`--complete`
  - 기준 2-5의 Grep 및 diff 확인 (`git diff codex/config.toml`에서 비주석 변경이 없는지, 세 toml에서 `sandbox_mode`가 없는지)
  - `installer-parity.json` 무변경
- CEO는 diff 범위를 확인한 뒤 수락한다.

**보류 조건:** 줄 번호 불일치로 증거 재확인이 필요할 때. 예산 상향 근거가 불충분할 때. `lib/`나 `scripts/`가 sandbox_mode에 실제 의존함이 발견되었을 때. parity 매핑 이름과 충돌할 때.

**커밋:** 수락 후 단일 집중 커밋.

---

## Task 3: global block, README 영어 재작성, Node 테스트, 매니페스트

**목표/범위:** D1과 G1의 global block 반영, G4.
- `lib/installer/global-config.mjs:33`의 `agentsBlockBody` 출력과 README의 `--skip-global` 블록을 같은 문구로 갱신한다.
  - 설계·스펙·계획·brainstorming 요청은 ARC 대상이며 순수 문서 작성 예외에 속하지 않는다.
  - 설계/스펙/계획 초안은 ONLY Planner가 작성하며 CEO는 NEVER 작성하지 않고 `brainstorming`/`writing-plans`를 자기 Skill로 NEVER 호출하지 않는다. 자동 트리거되면 중지하고 Planner로 라우팅한다.
  - 핵심 단어는 UPPERCASE로 강조한다.
- README.md 전체를 영어로 다시 쓴다. 구조와 사실(명령, 경로, 프리셋)을 유지하고 테스트가 요구하는 토큰("Korean", "korean description")을 보존한다. 테스트는 README 내용을 읽지 않으므로 사실 보존은 이전 README와의 대조로 확인한다.
- `tests/node/global-config.test.mjs`에 새 문구 단언을 추가한다. `test_arc_policy.py`의 codex 블록 단언(:1185)이 영향받으면 필요한 만큼만 수정한다.
- 기존 설치기의 managed block 갱신 경로가 새 문구를 반영함을 확인한다(테스트나 코드 확인).
- `MANIFEST.sha256`을 `node scripts/update-manifest.mjs`로 재생성한다(README 해시 포함).

**대상 파일:** `lib/installer/global-config.mjs`, `README.md`, `tests/node/global-config.test.mjs`, `tests/test_arc_policy.py`(필요 시), `MANIFEST.sha256`.

**선행/의존:** Task 1, Task 2 수락·커밋 후(README가 최종 정책 용어를 설명한다).

**Coder:** FRESH Coder를 이 task 전용으로 시작한다. 이 task의 Coder는 Task 1/2 Coder와 별개다.

**수락 기준:**
1. global-config.mjs 출력에 위의 라우팅 및 금지 문구가 있고 "(not standalone document writing)" 예외가 좁혀지거나 정정되었다.
2. README의 global block이 코드 출력과 문자 단위로 동일하다.
3. README가 영어이며 기존 섹션 구조와 사실을 유지하고 필수 토큰이 보존된다.
4. Node 테스트가 새 문구를 단언한다.
5. 설치기 갱신 경로가 새 블록을 반영한다.
6. 매니페스트가 재생성되고 `--check`이 통과한다.

**QA:** 이 task 전용 FRESH QA 인스턴스를 쓴다(이전 task QA 재사용 금지). 같은 task 재확인에만 재사용할 수 있다.
- 확인 항목:
  - `npm ci --ignore-scripts && npm test`
  - Python 전체 테스트
  - 매니페스트 `--check`
  - parity 일반/`--complete`
  - README 블록과 코드 출력의 동일성 비교
- QA는 README의 영어 문장 품질이 아니라 사실·구조 보존을 확인한다. CEO는 README의 명령과 프리셋을 이전 README와 대조한 뒤 수락한다.

**보류 조건:** 설치기 갱신이 새 블록을 반영하지 못할 때. README 사실이 코드와 충돌할 때. npm 환경 실패는 검증 면제가 아니라 미검증으로 두고 CEO에 보고한다.

**커밋:** 수락 후 단일 집중 커밋.

---

## 최종 계획 검증 (task별 검사가 아님)

- **시점:** Task 1-3이 모두 수락·커밋되고 handoff 기록이 갱신된 뒤.
- **범위:** base HEAD `1a9d492`부터 최종 HEAD까지의 전체 변경.
- **절차:**
  1. CEO가 최종 상태에서 전체 테스트, 매니페스트 `--check`, parity 두 모드를 재실행한다. 최종 상태에서 이전 QA 증거가 낡았다면 FRESH QA에 재확인을 요청한다.
  2. 독립 Reviewer 1명이 최종 전체 변경을 읽는다. CEO는 base..HEAD diff를 `<git-common-dir>/arc/review/<slug>.diff`에 쓰고 브리프에 경로를 인용한다.
     - 검토 항목:
       - 역할 경계(G1)
       - fresh Coder/QA 일관성(G2)
       - 증거표 D1-D15, H1-H3, M1-M10의 처분 누락 여부
       - Claude와 Codex 대칭
       - README와 global block 일치
       - 매니페스트
       - sandbox_mode 제거와 프롬프트·CEO 점검 대체의 충분성
- Reviewer는 task별 검사에서 호출하지 않는다.
- 지적 사항은 CEO가 Coder에게 라우팅하고 필요한 범위의 QA 재확인 후 해소하거나 명시적으로 처분한다.

## 가정 및 미검증

- Codex 파일과 일부 Claude reference의 줄 번호는 증거 파일을 신뢰했다. Coder가 task 시작 시 재확인한다.
- D7의 dangling 참조 처리(정의 또는 삭제)와 M7의 실제 설치 경로는 Coder가 repo에서 확인한다.
- sandbox_mode 제거 후 Codex 런타임이 세 역할을 실제로 읽기 전용으로 유지하는지는 검증되지 않았다. 프롬프트 가드와 CEO `git status` 점검으로 대체하며 미검증으로 남긴다.
- 기존에 설치된 사용자의 managed block은 구버전일 수 있다. Task 3에서 갱신 경로를 확인한다.
