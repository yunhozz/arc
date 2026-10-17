# Orchestrator 역할 전환과 병렬 배정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> executor 지시는 ARC adapter에 따라 Orchestrator의 역할 배정과 위험에 따른 확인으로 적용한다. 작업마다 fresh Coder를 사용한다. 별도 실행 방식 선택이나 작업별 Reviewer gate를 추가하지 않는다.

**목표:** 현재 조정 역할을 `Orchestrator`로 통일하고, 승인된 계획의 의존성을 분석하여 준비된 독립 작업을 병렬 배정하도록 지침을 보완한다.

**구조:** 기존 역할 지침과 설치 관리 블록을 수정한다. Codex·Claude의 같은 계약을 함께 갱신하며 새 실행기·역할 프로필은 추가하지 않는다.

**기술:** Markdown, TOML, SVG, JavaScript ES modules, 기존 기대 문자열, SHA-256 배포 manifest.

**설계 근거:** Planner가 반환하고 사용자가 “이 설계로 진행”으로 승인한 Bounded 설계. Orchestrator가 승인 증거와 계획 깊이 판단을 공유 기록에 연결한다.

**통합·저장 책임:** Orchestrator.

**예정 저장 경로:** `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-17-orchestrator-parallel-dispatch.md`

## 공통 제약

- 작업공간은 `/Users/yunho/Desktop/project/arc`이다. 이하 상대 경로는 이 위치를 기준으로 한다.
- brief 기준 branch는 `master`, HEAD는 `c2af25766007ee2fbd689f4e8d1bf80bbb9b89f8`이다. 실행 전 실제 상태를 확인한다.
- `Orchestrator`는 depth 1의 현재 대화 모델이다. 새 `arc_orchestrator` 프로필·별칭·모델 키를 만들지 않는다.
- 다섯 전문 역할의 이름·식별자·모델·권한과 depth 2 제약을 유지한다.
- 전체 tree의 동시 subagent 상한은 네 개이며 예약 슬롯은 없다.
- 기존 승인, 실행 대상 선택, 문서 준비, handoff, 보존, 위험 판단, 수락·커밋 규칙을 유지한다.
- **테스트를 추가하거나 실행하지 않는다. 기존 테스트의 현재 출력 기대 문자열만 이름 변경에 필요한 최소 범위에서 갱신한다. 행동 assertion은 추가하지 않는다.**
- 이번 변경은 정적 증거로 확인한다. 일반 TDD·QA 정책 자체를 완화하는 지침은 추가하지 않는다.
- 역사 설계·계획·기록·로그·Git 이력과 `tests/installer-parity.json`의 고정 inventory를 변경하지 않는다.
- 현재 사용자 홈 설치·외부 스킬을 변경하지 않고 설치기를 실행하지 않는다.
- 한 승인 top-level task는 한 focused implementation commit이다. substep은 별도 커밋 단위가 아니다.
- Coder는 커밋하지 않는다. Orchestrator가 작업을 수락한 다음 해당 작업만 커밋한다.

## 정적 확인의 중점

| 조건 | 확인할 결과 | 담당 |
|---|---|---|
| 이름 변경이 역사 inventory까지 도달함 | 현재 계약만 변경하고 역사 기록 보존 | TASK-01 |
| `Orchestrator`가 기존 SVG 폭을 초과함 | 텍스트 길이에 맞춘 도형·배치 조정 | TASK-01 |
| Coder 완료 보고만 존재함 | 후속 task 시작 조건을 충족하지 않음 | TASK-02 |
| 다른 파일이 미확정 공유 계약을 사용함 | 암묵적 의존성·충돌로 분류 | TASK-02 |
| 독립 작업이 오래 걸리거나 슬롯이 반환됨 | 전체 묶음 종료를 기다리지 않고 readiness 재평가 | TASK-02 |

정적 확인은 문서화된 계약의 적합성을 판단한다. 실제 agent 준수, runtime 병렬 실행, 설치 성공을 증명하지 않는다.

## 대상 파일

### TASK-01

역할 지침과 프로필:

- `codex/skill/SKILL.md`
- `claude/skill/SKILL.md`
- `codex/agents/arc-scouter.toml`
- `codex/agents/arc-planner.toml`
- `codex/agents/arc-coder.toml`
- `codex/agents/arc-qa.toml`
- `codex/agents/arc-reviewer.toml`
- `claude/agents/arc-scouter.md`
- `claude/agents/arc-planner.md`
- `claude/agents/arc-coder.md`
- `claude/agents/arc-qa.md`
- `claude/agents/arc-reviewer.md`

현재 정책 reference:

- `codex/skill/references/planning.md`
- `codex/skill/references/handoff.md`
- `codex/skill/references/handoff-prep.md`
- `codex/skill/references/handoff-worktree.md`
- `codex/skill/references/commit.md`
- `codex/skill/references/git-recovery.md`
- `codex/skill/references/verification.md`
- `codex/skill/references/visual-companion.md`
- `claude/skill/references/planning.md`
- `claude/skill/references/handoff.md`
- `claude/skill/references/git-recovery.md`
- `claude/skill/references/commit.md`
- `claude/skill/references/verification.md`
- `claude/skill/references/visual-companion.md`

생성 지침·현재 설명·기존 기대 문자열·무결성:

- `lib/installer/global-config.mjs`
- `README.md`
- `docs/images/role-flow.svg`
- `tests/test_arc_policy.py`
- `tests/test_claude_payload.py`
- `tests/node/global-config.test.mjs`
- `MANIFEST.sha256`

기존 테스트 파일은 이름 변경으로 낡아지는 출력 기대 문자열·정규식의 최소 갱신만 허용한다. 테스트 case·assertion·fixture·class·함수명을 추가하거나 변경하지 않는다. 따라서 기존 테스트 식별자의 `CEO`/`Ceo`/`ceo`는 현재 출력 지침의 잔존으로 취급하지 않는다.

`claude/skill/references/handoff-prep.md`에는 현재 조사에서 `CEO`가 발견되지 않았으므로 편집 대상에 포함하지 않는다. 추가 현재 지침의 누락이 발견되면 범위 변경을 보고한다.

### TASK-02

- `codex/skill/SKILL.md`
- `claude/skill/SKILL.md`
- `codex/skill/references/planning.md`
- `claude/skill/references/planning.md`
- `codex/skill/references/handoff.md`
- `claude/skill/references/handoff.md`
- `codex/skill/references/commit.md`
- `claude/skill/references/commit.md`
- `README.md`
- `MANIFEST.sha256`

새 파일·테스트·runtime 코드는 생성하지 않는다.

## 작업 의존성과 배정

| 작업 | 선행 조건 | 배정 |
|---|---|---|
| TASK-01 | 계획 승인과 기존 실행 준비 gate | 단독 시작 |
| TASK-02 | TASK-01 정적 확인·수락·커밋 확인 | TASK-01 뒤 시작 |

두 작업은 같은 정책 파일과 manifest를 변경하므로 동시 편집하지 않는다. 각 작업 내부에서는 양 runtime의 계약·현재 설명·필요 기대 문자열·manifest를 함께 수락한다.

## TASK-01: 현재 조정 역할을 Orchestrator로 전환

**목표·범위:** TASK-01 대상 파일에서 현재 역할 참조를 변경하고 기존 역할 책임과 정책 의미를 유지한다.

**선행 작업:** 없음. 승인·문서 준비·실행 대상·handoff gate 통과가 필요하다.

**입력:** 승인된 이름 변경 범위와 기존 다섯 전문 역할 계약.

**산출:** 양 runtime·현재 설명·설치 생성 지침에서 조정 역할을 `Orchestrator`로 표현한다. `agentsBlockBody(home, userHome)`의 인자·반환 형식과 관리 블록 구조를 유지한다.

### 단계

- [ ] 대상 현재 지침·프로필에서 역할 이름과 `CEO direct path` 제목·참조를 변경한다. 전문 역할 ID·모델·tool allowlist는 유지한다.
- [ ] `agentsBlockBody(home, userHome)`의 현재 생성 문구를 변경한다. 기존 세 항목 구조, 관리 표식, 경로 표시와 블록 외부 보존 로직은 유지한다.
- [ ] 기존 테스트에서 변경된 현재 출력을 직접 기대하는 문자열·정규식만 최소 갱신한다. 새 assertion이나 행동 조건은 추가하지 않는다.
- [ ] README와 SVG의 현재 역할 설명을 변경한다. SVG의 텍스트·역할 관련 내부 이름을 맞추고 긴 이름에 필요한 폭·배치만 조정한다.
- [ ] `node scripts/update-manifest.mjs`로 필수 생성 artifact를 갱신한다.
- [ ] 아래 정적 증거를 모아 fresh QA에 전달한다. QA도 파일을 변경하거나 테스트를 실행하지 않는다.
- [ ] Orchestrator가 기준과 증거를 연결해 수락한 뒤 해당 변경만 focused commit으로 만들고 SHA·범위·남은 상태를 기록한다.

### 수락 기준

1. 현재 지침·프로필·생성 관리 블록·README·SVG의 조정 역할이 `Orchestrator`로 일치한다.
2. 다섯 전문 역할의 식별자·모델·권한·보고 깊이를 보존한다.
3. Planner 작성 책임, 승인, direct path, handoff, 수락·커밋의 의미를 보존한다.
4. 기존 테스트 변경은 현재 출력 기대 문자열의 최소 갱신뿐이다.
5. SVG의 긴 텍스트를 수용하는 좌표·박스 폭·줄 배치가 일관된다.
6. 역사 문서·고정 inventory·사용자 홈 설치를 변경하지 않는다.
7. manifest가 이 작업의 최종 payload를 반영한다.

### 수락 전 필요한 정적 증거

- 대상 현재 지침·프로필·생성 소스·README·SVG에 대한 `CEO` 역할 잔존 검색 결과.
- Codex·Claude 대응 항목별 diff와 역할 ID·모델·권한 보존 결과.
- 생성 함수 diff: 문구 변경과 기존 구조·보존 로직의 유지.
- 기존 테스트 diff: expectation만 바뀌고 case·assertion·fixture 수와 구조가 보존됨.
- SVG의 텍스트 길이·좌표·박스 폭 비교. 화면 확인을 하지 않았다면 시각 검증 미실시를 명시.
- manifest 생성 결과와 diff: 변경된 보호 파일의 digest가 갱신되고 무관한 경로가 추가·삭제되지 않음.
- 제외 경로의 변경 부재와 `git diff --check` 결과.
- fresh QA의 정적 확인 결과와 남은 한계.

### 보류 조건

미승인 파일 확장, 역사 inventory 변경 필요, 역할·승인 의미 변경, 새 테스트나 assertion 추가, manifest의 설명되지 않는 차이, SVG 가독성 우려 미해결, Git 상태·소유권 불명확 시 보류한다.

## TASK-02: 의존성 분석과 준비된 독립 작업 배정을 의무화

**목표·범위:** 승인된 설계의 의존성 분석·readiness·병렬 배정 계약을 양 runtime에 반영한다.

**선행 작업:** TASK-01 수락과 커밋의 SHA·범위·유효성 확인. 시작 전 기존 handoff gate를 다시 확인한다.

**입력:** TASK-01에서 확정한 이름과 기존 승인·위험·역할 계약.

**산출:** 첫 Coder 배정 전 의존성 기록, 준비된 독립 작업 동시 배정, 상태 변경·슬롯 반환 시 재평가가 필수 규칙이 된다.

### 단계

- [ ] 양 `SKILL.md`에 승인 계획 검토 뒤 첫 배정 전 분석과 준비 작업 배정 의무를 추가한다. executor adapter의 전체 직렬 실행으로 읽힐 표현을 명확히 수정한다.
- [ ] 양 planning reference에 task ID, 명시·암묵 의존성, 입력·산출물·공유 계약, 파일 소유권, 충돌 자원, 준비 상태·보류 사유, 최초 배정 묶음을 기록하도록 명시한다.
- [ ] 양 handoff reference에 readiness 조건을 연결한다. 적용되는 전체 문서 승인·실행 준비, 선행 task의 필요한 확인·수락·커밋 확인을 요구한다. 기존 no-change 수락 기록도 반영한다.
- [ ] 같은 파일의 동시 Coder 편집을 금지하고 미확정 공유 계약·공유 자원 충돌·판단 정보 부족을 보류 사유로 정의한다.
- [ ] fresh Coder, 전체 네 개 상한, 모든 역할의 슬롯 공유, 더 낮은 실제 runtime 한도와 제한 보고를 명시한다.
- [ ] 완료·확인 결과·수락·커밋·슬롯 반환·새 충돌마다 readiness를 재평가하도록 명시한다. 준비된 독립 작업이 관련 없는 전체 묶음 종료를 기다리지 않도록 한다.
- [ ] 양 commit reference에 공유 Git 변경 직렬 처리, 다른 작업의 미완료 변경 보존, 수락 작업만 커밋, 정상 HEAD 변경 기록과 brief 갱신을 명시한다.
- [ ] README에 분석 → 준비 작업 배정 → 수락·커밋 → 재평가 흐름을 설명한다.
- [ ] `node scripts/update-manifest.mjs`로 manifest를 갱신한다.
- [ ] 아래 판단표와 정적 증거를 fresh QA에 전달한다. 테스트를 추가하거나 실행하지 않는다.
- [ ] Orchestrator가 수락한 뒤 focused commit을 만들고 결과를 기록한다.

### 수락 기준

1. 첫 배정 전에 전체 task의 의존성·충돌·준비 상태와 최초 배정 묶음을 기록해야 한다.
2. 파일 분리만으로 독립성을 판단하지 않으며 공유 계약·산출물·자원도 분석한다.
3. 준비된 독립 작업과 슬롯이 있으면 fresh Coder 동시 배정을 요구하고 직렬화 사유를 기록한다.
4. 전체 네 개 상한과 실제 runtime 한도를 보존한다.
5. Coder 완료 보고만으로 후속 task를 시작하지 않는다.
6. `A → B → C`와 독립 `D`에서 `D` 진행 중에도 수락·커밋된 `A`의 후속 `B`를 시작할 수 있다.
7. 공유 checkout·Git 보존·Claude current checkout 제약과 기존 gate를 보존한다.
8. C1–C5가 양 runtime과 현재 설명에 대응하며 새 테스트·assertion을 추가하지 않는다.

### 수락 전 필요한 정적 증거

fresh QA는 다음 사례를 지침과 대조하고 결론을 뒷받침하는 파일·문단을 반환한다. 실제 실행 시나리오나 테스트를 수행하지 않는다.

| 사례 | 문서화되어야 할 판단 |
|---|---|
| `A → B → C`, 독립 `D`, 슬롯 두 개 | 최초 `A`·`D`, `A` 수락·커밋 뒤 `B` |
| `A`의 완료 보고만 존재 | `B` 대기 |
| 준비된 독립 task 다섯 개 | 다른 역할을 포함해 동시 subagent 최대 네 개 |
| 다른 파일이 미확정 공유 API 사용 | 동시 시작 차단 |
| 같은 파일의 서로 다른 줄 편집 | 동시 Coder 편집 차단 |
| `A` 실패, `D` 영향 없음 | `B`·`C` 보류, `D` 진행 가능 |
| 선행 no-change task 수락 기록 존재 | 빈 커밋 없이 readiness 평가 |
| 정상 독립 task 커밋으로 HEAD 변경 | 상태·brief 갱신과 gate 유효성 확인 |
| 예상하지 못한 HEAD·소유권 변경 | 영향 작업 중단·해결·재확인 |

추가 증거:

- C1–C5와 양 runtime의 구현 문단 대응표.
- 필수 배정 규칙과 충돌하는 전체 직렬화 문구의 잔존 검색.
- 승인·위험·역할·실행 대상 gate 보존 diff.
- manifest 생성 결과와 보호 파일 digest 변경 범위.
- TASK-02 소유 파일 이외 변경 부재와 `git diff --check` 결과.
- fresh QA의 정적 판단과 미확인 범위.

### 보류 조건

선행 task 미수락·미커밋, 기존 gate 완화, 양 runtime 의미 불일치, 네 개 상한 변경, 새 역할·scheduler·자동 worktree 생성, 새 테스트·assertion, 공유 상태 충돌, 승인 설계와 다른 task 결합 규칙이 발견되면 보류한다.

## 최종 전체 변경 확인

**시점:** 두 task가 각각 필수 정적 확인과 Orchestrator 수락·커밋을 마친 뒤. 이 단계만을 이유로 TASK-01 수락·커밋을 늦추지 않는다.

- 기준 HEAD부터 최종 HEAD까지 전체 diff를 C1–C5에 대응시킨다.
- 현재 역할 이름과 양 runtime·README·SVG·생성 지침의 일치를 확인한다.
- 기존 역사 문서·고정 parity inventory·사용자 홈 설치의 변경이 없음을 확인한다.
- 최종 manifest의 경로·digest 변경을 최종 payload diff와 대조한다.
- 최종 `git diff --check`와 Git 상태를 확인한다.
- 중요한 정책 변경으로 보고 최종 전체 변경에 대해 **한 번의 독립 Reviewer 검토**를 수행한다. Reviewer도 정적 범위를 지키고 테스트를 실행하지 않는다.
- findings는 기존 수정·QA 재확인·후속 task 규칙으로 처리한다. 기존 커밋을 자동 amend/reset하지 않는다.
- 최종 보고에 task별 SHA·수락 근거와 **테스트 미추가·미실행, 실제 설치·agent 병렬 실행 미검증, SVG 화면 확인 여부**를 명시한다.

## 가정과 자체 점검

- 별도 written spec이 요구되지 않은 승인 Bounded 설계를 기준으로 작성했다. Orchestrator는 저장 gate에서 승인 증거·계획 깊이 판단·적용 문서 목록을 기록한다.
- parity 장부의 `CEO`는 고정 역사 assertion이므로 보존한다. 현재 지침 잔존 검색과 역사·테스트 식별자 보존을 구분한다.
- 두 task는 각각 수락 가능하며 같은 계약의 Codex·Claude·생성 artifact를 각 task 안에 묶었다.
- 새 테스트 case·assertion, RED/GREEN 단계, 테스트 suite·test command 실행 지시를 모두 제거했다.
- 필수 manifest 재생성은 유지하고 결과 확인을 정적 증거로 제한했다.
- 작업별 QA는 정적 확인만 수행한다. 작업별 Reviewer gate는 없으며 최종 전체 검토와 작업 수락 조건을 분리했다.
- C1–C5를 모두 포함했고 새 API·실행기·모델·권한 변경은 없다.
- 파일 편집·저장·검사 실행은 수행하지 않았다.
