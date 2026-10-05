# 저위험 단일 단계 TDD 예외 구현 계획

> **실행 지침:** 승인된 범위에서 Coder가 Harness 원본 지침과 프로필을 편집한다. CEO가 README 및 설치본 정합성을 조율하고, QA 뒤 독립 Reviewer가 최종 변경을 확인한다.

**목표:** 기존 `small, low-risk`와 단일 로컬 변경 기준을 모두 충족하는 Coder 작업에만 TDD 면제를 허용하고, 집중 검증·근거 보고·수용 의무는 유지한다.

**구조:** Harness 원본, Coder 프로필, README, manifest를 함께 정리한 뒤 현재 설치본 두 파일에 반영한다. 일반 `test-driven-development` 스킬 자체는 수정하지 않으며, Harness의 좁은 예외가 해당 작업에서는 일반 적용 조건보다 우선한다고 명시한다.

**기술:** Markdown, TOML, SHA-256 manifest, Python 3.11 이상.

**설계:** 2026-10-05 승인된 bounded 인채팅 설계. 별도 spec 파일은 없다.

## 공통 제약과 소유권

- 면제는 기존 `small, low-risk` 정의와 기존 계획 생략 조건을 모두 충족할 때만 적용한다: 좁고 이해되며 쉽게 되돌릴 수 있고 집중 검증이 가능해야 하며, 하나의 로컬 변경으로 종속 단계·공유 상태·수명주기·통합 순서 문제가 없고 하나의 집중 검증 경로가 있어야 한다.
- CEO는 Coder 시작 전에 brief에 범위, 조건 충족 근거, 수용 기준, 집중 검증 방법을 기록한다. 명시적인 사용자·작업별 TDD 요구는 우선한다.
- 불명확한 위험이나 작업 중 범위 확대가 생기면 Coder는 편집을 멈추고 CEO에게 재분류를 요청한다. Significant/high-risk 작업은 면제 대상이 아니다.
- 면제는 TDD의 실패 우선 및 RED/GREEN 절차만 생략한다. 요구되는 검사, 증거, 한계 보고, QA/Reviewer 흐름은 그대로 적용한다. 면제 작업을 TDD로 수행했다고 주장하지 않는다.
- 일반 행동 변경은 TDD를 유지한다. 순수 문서·비행동 설정은 기존 승인된 구조 검증 예외를 유지한다.
- `test-driven-development`의 일반 적용 문구는 수정하지 않는다. Harness와 Coder 지침이 자격을 충족한 경우의 명시적 예외임을 분명히 한다.
- Coder 소유 원본: `skill/SKILL.md`, `agents/yunho-team-coder.toml`, `MANIFEST.sha256`.
- CEO 소유 문서 정합성: `README.md`의 행동 변경/TDD 설명 한 곳을 예외와 맞춘다.
- CEO가 설치본을 반영할 때 Harness skill은 원본과 동일하게 복사하고, Coder profile은 `developer_instructions`만 갱신하며 설치된 `model`과 `model_reasoning_effort` 설정을 보존한다.
- 설치본 변경은 두 지정 파일로 제한한다. 전체 installer 실행과 외부 skill 취득은 범위 밖이다.
- `tests/test_install.py`는 수정하지 않고 테스트 suite도 실행하지 않는다. 구조·일관성 확인만 수행한다.
- 사용자 승인 뒤 Coder 실행 전에 `using-git-worktrees`의 격리 동의와 workspace 확정을 완료한다.

## 검토 초점

1. 저위험이지만 종속 단계가 있는 작업은 면제되지 않는가.
2. 단일 로컬 변경이지만 위험도가 높거나 불명확하면 면제되지 않는가.
3. 구체적인 사용자·작업별 TDD 요구가 우선하는가.
4. 범위 확대 때 Coder가 멈추고 재평가를 요청하는가.
5. TDD 면제가 검사·증거 보고 생략이나 TDD 수행 주장으로 해석되지 않는가.

## 작업 1: 승인 및 실행 workspace 확정

**담당:** CEO. Coder의 선행 조건.

- [ ] 사용자가 계획을 검토하고 승인한다.
- [ ] `using-git-worktrees`의 submodule guard로 현재 상태를 확인한다.
- [ ] 일반 checkout이면 사용자 동의를 받은 뒤 native worktree로 격리하거나, 거부 시 기존 workspace를 사용한다.
- [ ] 절대 workspace, 격리 결정, 계획 artifact 경로, 파일 소유권을 Coder brief에 기록한다.
- [ ] worktree 설정 중 테스트 suite를 실행하지 않는다.

**완료 증거:** 승인된 계획, workspace 경로, 격리 동의 또는 기존 workspace 사용 근거.

## 작업 2: 원본 정책과 문서 정합성 갱신

**담당:** Coder가 Harness 원본과 프로필 편집; CEO가 README의 implementation-dependent 문구를 반영.

**파일:** `skill/SKILL.md`, `agents/yunho-team-coder.toml`, `README.md`.

- [ ] Harness adapter의 TDD 요구를 적용 가능한 요구로 표현하고, 자격 조건을 모두 만족하는 경우에는 일반 TDD skill trigger를 덮는 명시적 Harness 예외를 둔다.
- [ ] Harness TDD 단락과 Coder profile에 동일한 자격·기록·우선순위·중단 기준을 둔다.
- [ ] 두 문서에 면제가 실패 우선 및 RED/GREEN 절차에만 해당하며 집중 검증과 보고는 유지된다고 적는다.
- [ ] README의 행동 변경/TDD 문장을 동일한 예외 조건에 맞춘다.
- [ ] `test-driven-development` skill 자체와 `tests/test_install.py`는 수정하지 않는다.

**완료 증거:** 세 원본 파일의 diff와 위 다섯 검토 초점 대조 결과.

## 작업 3: manifest 갱신과 설치본 반영

**담당:** Coder가 manifest를 갱신; CEO가 지정 설치본만 동기화.

**파일:** `MANIFEST.sha256`, `/Users/yunho/.codex/skills/yunho-harness/SKILL.md`, `/Users/yunho/.codex/agents/yunho-team-coder.toml`.

- [ ] 변경된 원본 `skill/SKILL.md`, `agents/yunho-team-coder.toml`, `README.md`의 manifest 해시만 갱신한다.
- [ ] 설치 Harness skill을 원본과 동일한 bytes로 반영한다.
- [ ] 설치 Coder profile은 `developer_instructions`만 원본과 맞추고 모델 설정과 나머지 필드를 보존한다.
- [ ] 설치 후 TOML 구문을 파싱하고 원본/설치본 정책 일치와 모델 필드 보존을 확인한다.

**완료 증거:** 변경된 manifest 항목, `cmp`/해시 결과, TOML 파싱 결과, 설치 profile 보존 결과.

## 작업 4: 구조 확인, 독립 QA, Reviewer

**담당:** QA → 독립 Reviewer → CEO 순서.

- [ ] QA가 편집 없이 범위, 원본·설치본 문구 일치, TOML 파싱, manifest 해시를 확인한다.
- [ ] `git diff --check`와 manifest 검증만 수행하고 테스트 suite는 실행하지 않는다.
- [ ] QA 발견 사항은 CEO가 Coder에 전달하고, 수정 후 영향받은 구조 확인을 반복한다.
- [ ] QA 완료 후 Reviewer가 전체 최종 변경과 다섯 검토 초점을 독립적으로 확인한다.
- [ ] CEO가 발견 사항과 증거 공백을 해결 또는 명시적으로 처리하고 acceptance를 결정한다.

**완료 증거:** QA와 Reviewer 결과, 구조 확인 출력, 해결 또는 disposition된 발견 사항.

## 수용 기준

- 모든 정책 원본·설치본이 동일한 예외 자격과 우선순위를 설명한다.
- 저위험 다단계 작업, 고위험 단일 변경, 불명확한 작업은 TDD 면제 대상에서 빠진다.
- 범위 확대 시 중단·재분류가 요구된다.
- 면제 후에도 집중 검증, 근거·한계 보고, 일반 위험도별 QA/Reviewer 절차가 유지된다.
- 설치 모델 설정은 보존되고 manifest가 변경된 payload와 일치한다.
- 구조 확인은 agent runtime 동작을 증명한다고 표현하지 않는다.

## 자체 검토

README의 현행 문장은 모든 행동 변경에 TDD가 필요하다고 포괄적으로 말하므로 직접 연관된 정합성 범위에 포함했다. 계획은 generic TDD skill과 테스트 suite를 건드리지 않고, Harness/Coder 예외와 active install만 갱신한다. 설치본의 모델 설정 보존, 명시적인 TDD 요구 우선, 범위 확대 시 중단, QA 후 Reviewer 순서를 수용 기준과 작업에 모두 반영했다.
