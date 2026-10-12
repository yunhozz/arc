# 승인 계획 문서 1회 커밋과 인계 상태 분리 구현 계획

> CEO가 Harness 절차에 따라 범위·인계·수락을 조정하고, Coder가 배정된 정책·안내 파일을 수정합니다. QA와 Reviewer는 각자 읽기 전용으로 확인합니다. 이 계획은 새 executor나 역할 위임 권한을 추가하지 않습니다.

**목표:** 최종 승인된 계획 문서 집합을 Coder 시작 전에 한 번 커밋하고, 승인·실행 위치·커밋 상태를 기록하려고 승인 문서를 다시 수정하거나 두 번째 문서 커밋을 만들지 않도록 명시합니다.

**구조:** 승인된 spec/plan은 구현 기준으로 유지합니다. 승인 증거, 실행 대상, 커밋 SHA·메시지·현재 Git 상태는 기존 canonical handoff record/shared brief에 기록합니다. 기존 커밋 재사용과 실질적 문서 변경의 재승인 절차는 유지합니다.

**기술:** Markdown 정책 계약, 기존 SHA-256 manifest 검증 함수, Git 정적 확인.

**설계 근거:** 사용자가 승인한 Bounded 짧은 설계. 별도 written spec은 요구하지 않습니다.

## 공통 제약

- 작업공간: `/Users/ma-24-007/Desktop/workspace/yunho-harness`
- 운영 기록만 갱신하려고 이미 승인된 spec/plan을 수정하거나 추가 docs commit/amend를 만들지 않습니다.
- 범위·수락 기준·필수 검증 등 실질적인 문서 변경에는 수정본 승인과 해당 준비 절차가 필요합니다.
- 문서별 승인·집합 완결 → 실행 대상 선택 → 남은 승인 문서의 단일 배치 커밋 → 최종 Git 확인 → Coder 인계 순서를 유지합니다.
- 구현 task 수락 후 자동 커밋 계약은 바꾸지 않습니다.
- 수정 범위는 `skill/references/handoff-prep.md`, `skill/references/handoff.md`, `README.md`, `MANIFEST.sha256`입니다.
- `skill/SKILL.md`, `skill/references/commit.md`, role profiles, `install.py`, 설치 동작, 설치된 외부 skill은 수정하지 않습니다.
- 새 기록 서비스·형식·Git 커밋 의무를 추가하지 않으며, 정적 확인을 runtime 준수의 증거로 표현하지 않습니다.

## 검토 초점

| 상황 | 기대 동작 |
|---|---|
| 모든 문서가 미커밋 | 승인과 실행 대상 선택 뒤 한 번에 커밋 |
| 일부 또는 전체 문서가 유효하게 커밋됨 | 유효한 커밋 재사용, 남은 문서만 한 번 준비 |
| 승인·실행 대상·SHA·상태 기록만 갱신 | canonical record만 갱신; 문서 수정·추가 커밋·amend 없음 |
| 범위·수락 기준·필수 검증 변경 | 수정 문서 승인 및 해당 준비 gate 적용 |
| 재시작 또는 문서 부재 | 기존 증거 재사용·상태 재확인 또는 유효한 생략 근거 적용 |

---

## T1 — 승인 문서 유지와 인계 상태 기록 계약 명확화

**목표·범위:** 준비 계약, canonical record 계약, 한국어 안내와 manifest를 하나의 변경으로 반영합니다. 공유 계약 전체가 산출물이므로 최상위 task와 구현 커밋은 하나입니다.

**대상 파일**

- 수정: `skill/references/handoff-prep.md` — `### Planning document commit`
- 수정: `skill/references/handoff.md` — `### Handoff evidence`
- 수정: `README.md` — 문서 배치 준비·정본 기록 설명
- 갱신: `MANIFEST.sha256` — 변경된 배포 파일의 hash

**의존성:** 선행 구현 task는 없습니다. 설계 승인, 이 계획 승인, CEO의 완전한 Coder handoff gate가 선행 조건입니다. 공유 승인·인계 lifecycle 계약 변경이므로 significant 위험 흐름을 적용합니다.

**수락 기준**

- **AC1:** 승인 증거, 실행 대상, 커밋 SHA·실제 메시지·현재 Git 상태의 기록 위치가 canonical handoff record/shared brief로 명시됩니다.
- **AC2:** 위 운영 기록만 갱신하려고 승인된 spec/plan을 수정하거나 두 번째 docs commit·amend를 만드는 행위가 금지됩니다.
- **AC3:** 범위·수락 기준·필수 검증 등 실질적 내용 변경에는 수정 문서 승인과 해당 준비 gate가 필요합니다.
- **AC4:** 최초 배치 커밋, 일부·전체 기존 커밋 재사용, 문서 부재, 재시작, 실행 대상 선택 gate와 구현 task 자동 커밋 정책이 유지됩니다.
- **AC5:** 변경 경로가 승인된 범위에 한정되고 whitespace 오류 없이 manifest가 실제 파일 내용과 일치합니다.

### 구현 순서

- [ ] **1. Coder 시작 상태와 편집 소유권 기록:** 절대 workspace, 저장소, branch/HEAD, staged/unstaged/untracked 상태와 승인된 계획 버전을 확인합니다. 계획 문서 준비 커밋과 T1 구현 변경을 구분합니다.
- [ ] **2. 준비 계약 보완:** `handoff-prep.md`에 다음을 명시합니다.
  - 승인·실행 대상·커밋 결과·Git 상태만 기록하려고 이미 승인된 문서를 수정하지 않습니다.
  - 같은 인계 근거를 갱신하려고 두 번째 docs commit 또는 기존 docs commit amend를 하지 않습니다.
  - 이 정보는 canonical handoff record/shared brief에 기록하고 승인 버전을 구현 기준으로 보존합니다.
  - 실질적 문서 변경에는 수정본 승인과 해당 준비 gate를 적용합니다.
  - 기존 유효 커밋 재사용, 남은 승인 문서의 단일 배치 커밋, staged 내용 검증, 실패·부분 완료 규칙을 보존합니다.
- [ ] **3. 인계 증거 계약 보완:** `handoff.md`에서 승인 증거, 실행 대상, 계획 문서 커밋 SHA·실제 메시지, 현재 Git 상태를 canonical handoff record/shared brief에 기록하도록 명시합니다. 이 기록 갱신은 승인 문서를 다시 쓰는 사유가 아님을 분명히 하고 기존 접근성·재시작·choice-lifetime 조건을 보존합니다.
- [ ] **4. README 안내 보완:** 승인된 spec/plan은 구현 기준으로 유지하고, 운영 기록을 위해 승인 문서를 수정하거나 두 번째 docs commit/amend를 만들지 않는다고 설명합니다. 실질적 변경에는 수정본 승인과 준비 절차가 필요함을 함께 적습니다.
- [ ] **5. manifest 갱신:** 위 세 배포 파일의 SHA-256만 실제 내용에 맞게 갱신합니다. 기존 수록 경로·순서 및 다른 파일 hash는 보존하고 계획 문서를 manifest에 추가하지 않습니다.
- [ ] **6. Coder 보고:** 변경 절, AC1–AC5 대응 위치, manifest 변경과 미해결 사항을 보고합니다. Coder는 수락하거나 커밋하지 않습니다.

### 수락 전 정적 확인

CEO와 독립 QA는 AC별로 확인 방법·범위·상태·근거·판정을 기록합니다.

| 기준 | 방법과 근거 |
|---|---|
| AC1 | `handoff.md`의 `Handoff evidence`와 README에서 기록 항목·위치를 확인하고 파일·행을 기록 |
| AC2 | `handoff-prep.md`의 `Planning document commit`과 README에서 metadata-only 문서 수정·추가 commit·amend 금지 문구 확인 |
| AC3 | 준비 절과 기존 `planning.md` 재승인 규칙을 대조해 수정본 승인·준비 gate 보존 확인 |
| AC4 | 변경 diff와 기존 정책을 대조해 배치 순서·재사용·생략·재시작·자동 커밋 계약 보존 확인 |
| AC5 | 기존 manifest 검증과 Git diff 검사 결과, 변경 경로 확인 |

작업공간에서 기존 hash 검증 함수와 Git diff 확인을 실행합니다.

```bash
python3 -B -c 'from pathlib import Path; import install; install.verify_manifest(Path.cwd())'
git diff --check
git diff --name-only
git diff -- skill/references/handoff-prep.md skill/references/handoff.md README.md MANIFEST.sha256
```

기대 결과: manifest hash가 일치하고 `git diff --check`에 오류가 없으며 T1 변경은 위 네 파일에 한정됩니다. 다른 task나 사용자 변경이 섞였으면 소유권·승인 범위를 확인하고 멈춥니다. 이 확인은 실제 agent runtime 준수를 입증하지 않습니다.

### QA, Reviewer, CEO 수락

필요한 수정과 QA 재확인 뒤 독립 Reviewer가 최종 전체 변경에서 AC1–AC5, 기존 계약과의 충돌, 금지 범위가 metadata-only 변경에 한정되는지, manifest를 확인합니다. 공유 계약 전체가 산출물이므로 QA와 Reviewer는 T1 수락 선행 조건입니다. CEO가 기준·근거·findings를 확인하고 자체 판단으로 수락합니다.

### 보류 조건

승인·handoff 증거 누락, 예상 밖 workspace/branch/HEAD·소유권 상태, 범위 밖 수정 필요, 승인 문서의 metadata-only 수정이나 추가 커밋 허용, 필수 정적 확인 미완료, manifest·diff 범위 불일치, 미해결 QA·Reviewer finding이면 멈추고 CEO가 해결합니다.

### 구현 task 커밋

CEO는 T1 수락 뒤 기존 정책에 따라 Git 상태·staged 범위·내용을 확인하고 하나의 focused 로컬 구현 커밋을 만듭니다.

```text
fix(handoff): 승인 계획 문서와 인계 상태 기록 분리
```

이 커밋은 Coder 시작 전에 완료하는 승인 계획 문서 준비 커밋과 별개입니다.

## 최종 전체 계획 확인과 자체 검토

T1 수락 전 QA·Reviewer 근거가 최종 관련 상태를 반영하면 전체 계획 확인에 재사용합니다. 커밋 후 CEO는 SHA·실제 메시지·포함 경로·내용·남은 Git 상태를 확인해 수락 기록에 연결합니다. 새 관련 변경이나 결과 불일치가 없으면 확인을 반복하지 않습니다.

- 승인 설계의 요구를 AC1–AC5와 하나의 T1에 연결했습니다.
- 정책 두 파일, README, manifest의 네 파일만 변경합니다.
- 확인은 정책·diff 정적 검토와 기존 hash 검증으로 한정합니다.
- metadata-only 기록 갱신과 실질적 문서 변경의 재승인을 구분합니다.
- 구현 task 자동 커밋, 배치 순서, 재사용·생략·재시작 계약은 유지합니다.
- 새 기록 저장 방식이나 커밋 의무를 만들지 않습니다.
- 이 계획은 검토 전이며 실행 대상·브랜치 선택이나 Git 변경은 하지 않았습니다.
