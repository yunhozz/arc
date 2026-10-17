# ARC 전역 지침 재설치 빈 줄 누적 방지 구현 계획

> **구현 담당자:** 승인된 계획에 따라 Coder가 작업하고, QA와 Reviewer는 각자 맡은 독립 검증을 수행한다. 작업 단계는 체크박스로 추적한다.

**목표:** ARC 제거 후 재설치할 때 Codex `AGENTS.md`와 Claude `CLAUDE.md`에 빈 줄이 반복해서 늘어나는 현상을 막는다.

**구조:** 삭제 경로에서 ARC 종료 마커 뒤가 파일 끝 또는 줄바꿈만으로 이루어져 있을 때 설치가 붙인 첫 LF/CRLF를 제거한다. 종료 마커 뒤에 사용자 본문 등 다른 바이트가 있으면 기존처럼 보존한다. 설치 갱신 경로는 바꾸지 않는다.

**기술:** Node.js `>=22`, ES modules, `node:test`, `node:assert/strict`.

**Spec:** 이 대화에서 사용자 승인된 종결 ARC 블록 줄바꿈 설계. Bounded 판단에 따라 별도 spec 파일은 필요하지 않다.

## Global Constraints

- 작업 위치: `/Users/yunho/.codex/worktrees/install-subagent-limits/arc`, 브랜치 `feat/install-subagent-limits`.
- 구현 기준 HEAD: `44870492714d17d28610f1fc9147152167962b95`.
- 종료 마커 뒤가 `^(?:\r\n|\n)*$`에 맞으면 첫 LF 또는 CRLF 한 개만 제거한다.
- 추가 줄바꿈, 기존 선행 공백, BOM, 사용자 접미 본문과 해당 본문 앞의 구분 줄바꿈은 보존한다.
- 잘못된 ARC 마커, 잘못된 UTF-8, 마커가 없는 문서의 기존 동작을 유지한다.
- 이미 누적된 선행 빈 줄을 자동 정리하거나 사용자 홈 설정 파일을 수정하지 않는다.
- 기존 미추적 빌드·캐시 파일과 디렉터리는 보존한다.

## Review Focus

- 빈 문서에서 설치·삭제를 반복할 때 ARC 블록 뒤 종결 문자가 남지 않는지 반복 수명주기 회귀 검사로 확인한다.
- LF, CRLF, 연속 줄바꿈이 종결된 관리 블록에서 첫 줄바꿈만 제거되는지 바이트 단위 검사로 확인한다.
- 접미 본문, 공백 또는 단독 CR이 있는 문서가 기존 외부 바이트 보존 검사로 유지되는지 확인한다.
- Codex와 Claude 전역 경로의 통합 제거 검사 및 manifest 확인으로 공통 함수 적용과 payload 정합성을 확인한다.

---

### 작업 N1: 종결 ARC 블록 제거 시 줄바꿈 누적 방지

**파일:**

- 수정: `lib/installer/global-config.mjs`
- 검사: `tests/node/global-config.test.mjs`
- 검사: `tests/node/uninstall.test.mjs`
- 갱신: `MANIFEST.sha256`

**선행 작업:** 없음. N1은 독립 작업이며 구현, 검사, manifest가 같은 변경 단위다.

**보류 조건:** 접미 본문 보존 검사 또는 기존 마커 검증이 실패하거나, 변경된 manifest 항목이 이번 코드 수정과 일치하지 않으면 수용하지 않는다.

**수용 기준:**

- 빈 문서에서 ARC 블록을 설치하고 삭제하면 빈 바이트열이 된다.
- 빈 문서 설치·삭제를 세 차례 반복해도 첫 설치 결과와 동일하다.
- 파일 끝의 LF 또는 CRLF 하나만 소비하고, 추가 줄바꿈은 보존한다.
- 종료 마커 뒤 사용자 본문, 공백, 단독 CR 또는 다른 비줄바꿈 바이트가 있으면 그 접미 바이트를 보존한다.
- 기존 접두·접미 본문, BOM, 선행 공백, 잘못된 마커 및 마커 없는 문서의 동작을 유지한다.
- Codex와 Claude 제거 경로 모두 종결 ARC 블록을 제거한 뒤 전역 지침 파일을 빈 상태로 남긴다.
- 전체 Node 테스트와 manifest 검증을 통과한다.

- [ ] **1. 실패하는 회귀 검사 작성**

  `global-config.test.mjs`에서 `renderManagedBlock()`과 `removeManagedBlock()`을 조합해 빈 입력의 반복 설치·삭제, LF·CRLF 한 개/여러 개, 접미 본문 보존을 고정한다. 기존 정확한 외부 바이트 보존 검사는 유지한다.

  `uninstall.test.mjs`에 Codex와 Claude 각각 종결 ARC 블록만 있는 전역 파일을 삭제하고 결과가 빈 바이트열인지 확인하는 통합 회귀 검사를 추가한다.

- [ ] **2. 새 검사에서 결함을 확인**

  ```bash
  node --test tests/node/global-config.test.mjs tests/node/uninstall.test.mjs
  ```

  새 종결 줄바꿈 검사만 현재 동작 때문에 실패하는지 확인한다. 기존 접미 본문 보존 검사가 실패하면 구현 전에 원인을 분석한다.

- [ ] **3. 삭제 경로만 최소 수정**

  `removeBlock()`에 삭제 전용 종결 모드를 추가한다. 종결 모드에서는 END 뒤 전체가 LF/CRLF만으로 이루어졌을 때 기존 한 줄바꿈 소비 로직을 사용한다. `removeManagedBlock()`만 종결 모드를 사용하고, `renderManagedBlock()`의 현재 갱신 동작은 변경하지 않는다. `trim()`이나 파일 전체 공백 정리는 추가하지 않는다.

- [ ] **4. 집중 검사와 전체 Node 검사 실행**

  ```bash
  node --test tests/node/global-config.test.mjs tests/node/uninstall.test.mjs
  npm test
  ```

  집중 검사에서 접미 바이트 보존과 반복 설치·삭제 결과를 확인한다. 전체 Node 테스트 결과도 작업 수용에 기록한다.

- [ ] **5. 보호 manifest 갱신 및 확인**

  ```bash
  node scripts/update-manifest.mjs
  npm run check:manifest
  ```

  `MANIFEST.sha256` diff가 이번 `lib/installer/global-config.mjs` 변경에 따른 해시 변경만 포함하는지 확인한다.

- [ ] **6. 독립 QA 및 수용**

  새 QA가 N1 기준에 따라 반복 설치·삭제, LF/CRLF 및 접미 본문 보존, Codex/Claude 경로를 확인한다. Orchestrator는 결과를 수용 기준과 연결해 판정한다.

- [ ] **7. 작업 커밋**

  QA와 수용 후 아래 네 파일만 포함해 한 커밋으로 기록한다.

  ```bash
  git add lib/installer/global-config.mjs tests/node/global-config.test.mjs tests/node/uninstall.test.mjs MANIFEST.sha256
  git commit -m "fix(installer): 재설치 시 빈 줄 누적 방지"
  ```

## 최종 검토

이 변경은 설치·삭제 수명주기에서 전역 사용자 문서의 바이트를 변경하므로 최종 전체 변경을 독립 Reviewer가 확인한다. Reviewer는 종결 줄바꿈 외의 사용자 바이트가 보존되는지와 갱신 경로에 영향이 없는지를 검토한다.

## 깊이·위험 판단

- 설계 깊이: Bounded. 기존 공개 인터페이스와 파일 형식을 바꾸지 않는 단일 버그 수정이므로 별도 spec은 필요하지 않다.
- 계획 깊이: 계획 생략 조건 중 수명주기 걱정이 없다는 항목이 충족되지 않아 이 한 작업 계획을 사용한다.
- 검증 위험: Significant. 설치·삭제 수명주기에서 사용자 전역 문서를 쓰는 경로이므로 Coder → fresh QA → Orchestrator 수용·커밋 → 독립 Reviewer 순서로 확인한다.

## 가정 및 미결정 사항

- 이미 문서 앞에 쌓인 빈 줄은 사용자 공백과 구별할 수 없어 보정하지 않는다. 이번 수정은 이후 반복에서 추가 누적을 막는다.
- 승인된 설계는 종료 마커 뒤가 줄바꿈만인 경우에 한해 첫 종결 문자를 소비하며, 다른 접미 바이트가 있으면 기존 보존 동작을 유지한다.
- 미결정 사항은 없다.
