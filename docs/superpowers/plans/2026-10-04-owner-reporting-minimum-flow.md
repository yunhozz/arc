# 공통 역할 보고 대상과 최소 검증 흐름 명확화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**목표:** 공통 역할의 보고 대상을 호출 owner로 정리하고, 위험도와 실행 모드가 함께 결정하는 최소 검증 흐름 및 리뷰 중복 충족 조건을 명시한다.

**구조:** `skill/SKILL.md`를 공통 정책으로 유지하면서 관련 네 프로필의 지침을 동기화한다. 기존 역할·권한·승인 gate를 유지하고, 마지막에 변경 파일의 manifest hash를 갱신한다. 위 executor 지침은 Harness adapter에 따라 승인된 **Native**로 실행하며, Lead가 조율하고 Coder가 지정 파일을 수정한다.

**기술:** Markdown, TOML, Python 3.11 이상, SHA-256 manifest.

**설계 근거:** CEO가 전달한 승인된 bounded 설계와 Native 선택. 별도 architectural spec 파일은 이 bounded 작업의 선행 산출물이 아니다.

## 공통 제약

- 계획 작성 workspace는 `/Users/yunho/Desktop/project/yunho-harness`이다. 실행 전 isolation과 실제 실행 경로는 Lead가 확인한다.
- 수정 파일은 아래 여섯 파일로 한정한다. README, 다른 프로필, installer source, dependency, 모델 설정은 수정하지 않는다.
- 사용자 지정 보호 정책 영역은 바이트 단위로 보존한다. 해당 영역의 주체를 지정하거나 경계를 변경하지 않는다.
- 공통 역할의 보고 대상 정리가 owner별 권한 이동으로 이어져서는 안 된다.
- 개발 관련 승인, Coder/QA 조율, 개발 acceptance/completion은 기존대로 Lead가 담당한다.
- 위험도 요구와 모드 checkpoint를 모두 충족한다.
- Fresh-agent의 최종 전체 리뷰는 작업 리뷰와 별도의 fresh Reviewer task이며, 작업이 하나여도 생략하지 않는다.
- 이 작업은 실행 코드 변경 없이 agent 행동 지침을 명확히 한다. 문서/configuration 형식만으로 behavior-change TDD gate를 면제하지 않는다. 테스트 금지와 설치된 TDD의 failing-first 요구가 충돌하므로 여섯 파일 범위의 명시적 human 예외 또는 test-first 승인 변경 전에는 편집하지 않는다. 과거 작업의 예외를 일반화하거나 failing-first cycle을 수행했다고 주장하지 않는다.
- 검증은 TOML 파싱, 정책 사례·diff 확인, `python3 install.py --check`로 제한한다. 테스트와 dependency 설치는 수행하지 않는다.
- 실행 모드는 Native로 승인되었다. 계획 승인 전 Coder 작업을 시작하지 않는다.

### 승인된 TDD 예외

User가 `여섯 파일 한정 TDD 예외 승인`으로 직접 승인했고 CEO가 전달했다. 예외 범위는 파일 책임 표의 `skill/SKILL.md`, 네 지정 프로필, `MANIFEST.sha256`에 한정되며 승인된 두 정책 명확화만 포함한다. TOML 파싱, 수동 정책 사례·보호 영역·diff 확인, `python3 install.py --check`, 독립 QA, fresh 전체 Reviewer로 검증한다. failing-first 또는 테스트 suite를 실행하지 않고 TDD 수행을 주장하지 않는다. 이 결정은 보호 영역이나 다른 작업의 TDD 요구를 변경하지 않는다. 계획 및 Native, managed worktree도 승인되었으므로 해당 경로에서 실행을 재개한다.

## 검토 초점

1. Secretary가 호출한 공통 역할도 결과와 경로 문제를 해당 owner에게 반환하는가.
2. 공통 owner 문구가 개발 승인 gate 또는 Coder/QA 권한을 일반화하지 않는가.
3. 저위험 Native에서도 모드가 요구하는 QA와 fresh 전체 리뷰를 유지하는가.
4. 같은 검사를 재사용할 때 범위·증거·상태·독립성·freshness·시점 조건을 모두 확인하는가.
5. Fresh-agent에서 작업이 하나여도 별도 fresh 최종 전체 리뷰를 유지하는가.

아래 정책 사례 확인 단계가 이 다섯 항목을 직접 검증한다.

## 파일 책임과 의존성

| 파일 | 변경 책임 |
|---|---|
| `/Users/yunho/Desktop/project/yunho-harness/skill/SKILL.md` | 공통 보고 규칙, 위험도와 모드 결합, 중복 충족 및 재사용 조건 |
| `/Users/yunho/Desktop/project/yunho-harness/agents/harness-planner.toml` | 공통 보고 대상과 개발 전용 절차 구분 |
| `/Users/yunho/Desktop/project/yunho-harness/agents/harness-reviewer.toml` | 보고 대상과 owner의 완료 판단 |
| `/Users/yunho/Desktop/project/yunho-harness/agents/harness-scout.toml` | owner 보고와 다음 역할용 결과 형식 구분 |
| `/Users/yunho/Desktop/project/yunho-harness/agents/harness-lead.toml` | 최소 검증 흐름, 리뷰 중복 충족 조건 |
| `/Users/yunho/Desktop/project/yunho-harness/MANIFEST.sha256` | 위 다섯 payload 파일의 변경된 hash |

정책과 프로필은 함께 승인·검토할 하나의 변경 단위다. 문구 확정 → 프로필 동기화 → manifest 갱신 → 구조 검증 → QA → fresh 전체 Reviewer → Lead acceptance 순서로 진행한다. 여러 파일의 의미와 manifest가 종속되어 no-plan 조건에 해당하지 않는다.

## 실행 준비: Lead의 workspace 확인

**담당:** Lead. 이 단계는 Coder 구현 task에 앞선 handoff 준비다.

- [ ] 설치된 `/Users/yunho/.agents/skills/using-git-worktrees/SKILL.md`를 실행 시 적용한다.
- [ ] 기존 isolation과 submodule 여부를 먼저 확인한다.

  ```sh
  git -C /Users/yunho/Desktop/project/yunho-harness rev-parse --git-dir
  git -C /Users/yunho/Desktop/project/yunho-harness rev-parse --git-common-dir
  git -C /Users/yunho/Desktop/project/yunho-harness rev-parse --show-superproject-working-tree
  git -C /Users/yunho/Desktop/project/yunho-harness branch --show-current
  git -C /Users/yunho/Desktop/project/yunho-harness status --short
  ```

  `git-dir`와 `git-common-dir`를 절대 경로로 해석한 뒤 비교한다. 서로 다르더라도 superproject 경로가 있으면 linked worktree라고 판단하지 않는다. 계획 작성 시 두 값은 `.git`, superproject 출력은 없으며 branch는 `master`였다. native `list_artifacts`는 빈 목록이었다.

- [ ] 선언된 workspace 선호와 동의를 확인하고 skill의 native 도구 우선·fallback 규칙을 따른다. 현재 검증된 선호나 동의는 없다. 일반 checkout에서 새 worktree를 만들려면 skill Step 0에 따른 동의를 받는다. 사용자가 거절하면 현재 경로에서 진행한다. 경로나 동의가 확인되지 않으면 dependent 작업을 시작하지 않는다.
- [ ] 새 workspace가 필요한 경우 기존 변경의 포함 여부를 확인한다. native worktree 생성이 현재 미커밋 변경이나 이 계획을 자동 복사한다고 가정하지 않는다. 승인된 계획·brief를 새 절대 경로에 접근 가능하게 제공한다.
- [ ] 실제 workspace 절대 경로와 여섯 파일의 절대 경로, 현재 변경 상태, 승인된 설계·Native·계획, 검증 제한을 Coder brief에 기록한다. 경로가 달라지면 모든 역할에 실제 경로를 일관되게 전달한다.
- [ ] 실제 workspace에서 `python3 install.py --check`로 구조 baseline을 기록한다. 실패는 기존 상태인지 이번 작업인지 구별해 보고한다. 사용자 제한에 따라 baseline 테스트나 dependency 설치는 하지 않는다.

## Task 1: 공통 정책과 역할 프로필 동기화

**담당:** Coder. 다른 작업자가 있을 수 있으므로 기존 변경을 되돌리지 않는다.

**수정 파일:** 위 표의 여섯 파일.

**입력:** 승인된 설계·계획·Native, Lead가 확인한 실제 workspace와 baseline, 기존 파일.

**출력:** 동기화된 정책·프로필, 정합한 manifest, 구조 검증 결과와 남은 문제.

- [ ] **단계 1: 변경 전 보호 영역과 diff baseline을 확보한다.**

  Lead가 제공한 보호 영역을 작업 시작 시점 파일에서 확보한다. 후속 비교는 `HEAD`만을 기준으로 삼지 않고 시작 시점 내용과 비교하여 기존 사용자 변경을 보존한다. 여섯 파일 외 새 변경이 없는지 baseline과 대조한다.

- [ ] **단계 2: `skill/SKILL.md`의 공통 보고 규칙을 명시한다.**

  Ownership 또는 adapter의 공통 설명에 다음 의미를 넣는다.

  ```text
  Planner, Reviewer, and Scout return findings, questions, next actions, and workspace/path issues to the invoking owner (Lead or Secretary). The invoking owner integrates the results, routes decisions and any required approvals, and owns acceptance and completion within its assigned scope. Shared specialist reporting does not transfer owner-specific duties. Development design/planning approvals, Coder/QA coordination, implementation acceptance, and completion remain with Lead.
  ```

  현재 adapter의 공통 보고와 개발 전용 실행 설명을 구분한다. Design/planning 및 Coder/QA에 관한 Lead의 승인 단계는 유지한다. Workspace handoff에서 shared Reviewer의 경로 문제 보고도 공통 owner 규칙과 충돌하지 않게 하되 Coder/QA 보고는 Lead로 유지한다.

- [ ] **단계 3: 최소 검증 흐름과 중복 충족 조건을 명시한다.**

  모드 설명과 Risk-scaled execution에 다음 규칙을 반영한다.

  ```text
  Determine the minimum execution flow by combining the applicable risk requirements and the selected mode checkpoints. Retain every applicable requirement; the risk table alone is not the complete flow.

  A single check or review may satisfy overlapping requirements only when its scope, evidence, relevant state, independence, required freshness, and position in the flow satisfy each requirement. Relevant changes, failures, or missing/conflicting evidence invalidate reuse for the affected requirement. Record which requirements the check or review satisfies.

  Native's fresh independent full-change review may also satisfy the risk-required review. Fresh-agent's final full-change review must use a separate fresh Reviewer task after all implementation-task reviews resolve, even when there is only one implementation task.
  ```

  위험도 표는 위험도 요구를 유지하고 결합 규칙을 가까이 둔다. 기존 재사용 설명은 이 조건을 따르도록 연결하여 과거 리뷰 재사용이 final fresh checkpoint를 대체한다고 읽히지 않게 한다.

- [ ] **단계 4: 네 프로필을 같은 의미로 동기화한다.**

  **Planner** 공통 설명:

  ```text
  Return findings, questions, next actions, and workspace/path issues to the invoking owner (Lead or Secretary). Route shared-assignment questions, decisions, and visual-companion requests through that owner; stop at applicable gates until the owner supplies the required answers or decisions. Owner-specific approval and completion duties remain with that owner.
  ```

  개발 과업의 범위를 다음과 같이 명시한다.

  ```text
  For feature/design/behavior work assigned by Lead, retain the development brainstorming, design/spec/plan gates and Lead's approval, integration, and completion duties described below.
  ```

  기존 architectural spec, writing-plans, Coder handoff, 시각 자료 운영 제한은 유지한다. 개발 전용 질문·승인은 Lead로 유지하고 공통 경로 문제 보고는 invoking owner로 조정한다.

  **Reviewer** 결과·완료 판단 설명:

  ```text
  Return actionable findings, relevant unresolved questions, next actions, and workspace/path issues to the invoking owner (Lead or Secretary), with file, page, or source references, or say that no substantive findings were found. The invoking owner decides overall completion within its assigned scope. For development work, functional and test verification belongs to QA and completion remains with Lead.
  ```

  독립적 읽기 전용, QA 실행·수정·계획·delegation 금지는 유지한다.

  **Scout** 결과 반환 설명:

  ```text
  Return findings, relevant unknowns/questions, impact, next actions, and workspace/path issues to the invoking owner (Lead or Secretary). Format the result for the next role when useful; the invoking owner routes the handoff.
  ```

  지정 탐색 질문만 답하고 좁게 검색하며 근거를 인용하는 기존 제한은 유지한다.

  **Lead** 모드 checkpoint와 위험도 설명을 단계 3과 같은 의미로 맞춘다. 공통 owner 설명을 개발 외 역할 위임의 근거로 일반화하지 않는다. Native 전체 리뷰의 중복 충족 및 Fresh-agent의 별도 final fresh review를 명시한다.

- [ ] **단계 5: TOML과 정책 사례를 확인한다.**

  실제 workspace 루트에서 네 변경 프로필을 파싱한다.

  ```sh
  python3 - <<'PY'
  from pathlib import Path
  import tomllib

  paths = [
      Path("agents/harness-planner.toml"),
      Path("agents/harness-reviewer.toml"),
      Path("agents/harness-scout.toml"),
      Path("agents/harness-lead.toml"),
  ]
  for path in paths:
      data = tomllib.loads(path.read_text(encoding="utf-8"))
      assert isinstance(data["developer_instructions"], str), path
      print(f"Parsed: {path}")
  PY
  ```

  예상 결과: 네 파일 모두 파싱되고 종료 코드 0. 다음 사례를 정책과 프로필 양쪽에 대조하고 근거 위치를 기록한다.

  | 사례 | 기대 해석 |
  |---|---|
  | Secretary가 Planner/Reviewer/Scout 호출 | 결과·질문·다음 행동·경로 문제를 Secretary에게 반환 |
  | Lead가 개발 Planner 호출 | 기존 설계/spec/plan 승인 gate와 Lead 통합 의무 유지 |
  | Small, low risk + Native | 위험도 집중 확인에 더해 Native QA 및 fresh 전체 리뷰 유지 |
  | Ordinary behavior + Native | QA 후 fresh 전체 리뷰 유지 |
  | Significant/high risk + Native | 조건을 충족한 fresh 전체 리뷰가 위험도 리뷰도 충족 가능 |
  | Small, low risk + Fresh-agent | Lead 집중 확인, 선택 QA, fresh 작업 리뷰 후 별도 fresh 전체 리뷰 |
  | Ordinary behavior + Fresh-agent | QA, fresh 작업 리뷰 후 별도 fresh 전체 리뷰 |
  | Significant/high risk + Fresh-agent | QA, fresh 작업 리뷰 후 별도 fresh 전체 리뷰 |
  | Fresh-agent 구현 task 하나 | 작업 리뷰 해결 후 별도 fresh 최종 전체 리뷰 필요 |
  | Fresh-agent 종속 task | 필요한 QA와 작업 리뷰 해결 후 종속 작업 시작 |
  | 전체 범위를 보지 않은 리뷰 | 전체 리뷰 요구를 충족했다고 기록할 수 없음 |
  | 상태·증거·독립성·freshness·시점 조건 하나라도 불충족 | 영향받는 요구에 재사용하지 않음 |

  보호 영역의 시작 시점 바이트와 비교하고 `git diff --check` 및 diff 확인으로 허용 범위·권한·gate 보존을 확인한다.

- [ ] **단계 6: 필요한 manifest 항목만 갱신한다.**

  실제 workspace 루트에서 다음 코드를 실행한다. 기존 형식·줄 순서와 다른 파일 항목은 유지한다.

  ```sh
  python3 - <<'PY'
  from pathlib import Path
  import hashlib

  selected = {
      "skill/SKILL.md",
      "agents/harness-planner.toml",
      "agents/harness-reviewer.toml",
      "agents/harness-scout.toml",
      "agents/harness-lead.toml",
  }
  manifest = Path("MANIFEST.sha256")
  lines = manifest.read_bytes().splitlines(keepends=True)
  found = set()
  updated = []
  for line in lines:
      raw = line.rstrip(b"\r\n")
      parts = raw.split(b"  ", 1)
      if len(parts) == 2:
          name = parts[1].decode("utf-8")
          if name in selected:
              if name in found:
                  raise SystemExit(f"Duplicate manifest entry: {name}")
              found.add(name)
              digest = hashlib.sha256(Path(name).read_bytes()).hexdigest()
              ending = line[len(raw):]
              line = digest.encode("ascii") + b"  " + parts[1] + ending
      updated.append(line)
  missing = selected - found
  if missing:
      raise SystemExit(f"Missing manifest entries: {sorted(missing)}")
  manifest.write_bytes(b"".join(updated))
  PY
  ```

  이후 구조 확인을 실행한다.

  ```sh
  python3 install.py --check
  git diff --check
  git status --short
  ```

  예상 결과: installer 종료 코드 0, whitespace 오류 없음, task가 추가한 payload 변경은 여섯 파일뿐이다. 계획·brief는 Lead 산출물로 별도 식별한다. 실패 시 정확한 원인을 Lead에게 반환하고 지정 범위를 넘어 수정하지 않는다.

- [ ] **단계 7: Coder 결과를 Lead에게 반환한다.**

  변경 파일, 사례별 근거, TOML·installer·diff 확인 실제 결과, 보호 영역 보존 결과, 미해결 사항, QA/Reviewer 집중 확인 지점을 전달한다. 테스트나 TDD를 수행했다고 표현하지 않는다.

## Native 검증과 완료 handoff

- [ ] Lead는 Coder 결과와 구조 확인 증거를 검토한다.
- [ ] QA는 지정 범위에서 구조 확인과 정책 사례·보호 영역·diff를 독립적으로 확인한다. 파일 수정과 테스트 실행은 하지 않는다. 상태가 바뀌지 않은 기존 증거를 재사용할 때는 충족하는 요구를 기록한다.
- [ ] QA 후 fresh independent Reviewer가 여섯 파일의 전체 변경을 검토한다. 위험도 리뷰도 충족한다면 범위·증거·상태·독립성·freshness·시점을 확인하고 충족 요구를 기록한다.
- [ ] 발견 사항은 Lead가 Coder에게 전달한다. 수정 후 영향받는 구조 확인과 QA를 반복하고, 리뷰 증거가 무효화된 범위는 다시 검토한다.
- [ ] Lead가 승인 설계와 수락 기준, 보호 영역 보존, manifest·생성 결과 정합성, 발견 사항 처리와 근거를 확인한 뒤 완료를 판단한다.
- [ ] 커밋이 별도 승인 범위에 포함된 경우만 여섯 파일을 명시적으로 stage하고 한 논리적 변경으로 묶는다. 메시지 후보: `docs(harness): 공통 역할 보고와 최소 검증 흐름 명확화`.

## 가정과 미확정 사항

- 설계와 Native는 승인되었으며 이 계획 자체의 승인은 아직 남아 있다.
- 현재 workspace는 일반 checkout이며 검증된 현행 isolation 선호·동의가 없다. 실제 실행 경로와 기존 미커밋 변경 처리는 Lead가 실행 준비 단계에서 확정한다.
- 보호 영역의 정확한 범위는 Lead brief에서 전달받아 시작 시점 바이트로 보존한다.
- installer·모델·dependency 변경이 필요하다는 가정은 하지 않는다. 새로운 구조 문제가 나오면 Lead에게 보고한다.
- 필수 추가 요구사항 질문은 없다. 위 선행조건은 Lead가 처리할 사항이다.

## 자체 검토 결과

- 두 명확화는 공통 정책과 해당 프로필 단계로 연결된다.
- README와 다른 프로필은 제외했고 manifest는 다섯 변경 payload의 파생 항목만 갱신한다.
- 의미 동기화를 여러 task로 분리하지 않고 하나의 Coder task와 종속 단계로 구성했다.
- 검토 초점 다섯 항목과 위험도·모드 여섯 조합은 사례 표에서 다룬다.
- isolation·동의를 만들어 내지 않고 실행 전 확인 조건으로 남겼다.
- 코드 테스트나 failing-first cycle을 요구하거나 수행했다고 주장하지 않는다.
- Planner 초안의 한국어를 유지해 Lead가 통합·저장했다. 계획 승인과 workspace 결정 후 실행한다.

## 실행 결과

계획·Native·managed worktree 및 여섯 파일 TDD 예외 승인 후 `/Users/yunho/.codex/worktrees/owner-reporting-flow/yunho-harness`에서 Coder → QA → fresh 전체 Reviewer를 완료했다. Coder의 잔여 Planner 경로 보고를 수정한 뒤 QA가 모든 구조 확인·보호 영역·manifest·정책 사례를 통과했고 Reviewer가 실질적 발견 사항 없음으로 반환했다. Lead 최종 비교는 여섯 지정 변경과 35개 비대상 baseline 파일 보존을 확인했다. Acceptance 완료, 근거 `/private/tmp/owner-reporting-flow-acceptance.json`. 테스트·TDD 수행·runtime 준수·설치·커밋·merge를 주장하지 않는다. 작업 변경은 연결된 managed worktree에 보존한다.
