# cooperative 런타임 해시 범위 분리 구현 계획

> **실행 역할:** ARC Orchestrator가 단일 Implementer에 배정한다. Implementer → 독립 QA → Orchestrator 작업 수용·커밋 → 최종 전체 변경 Reviewer 순서를 적용한다. 체크박스는 진행 기록이며 별도 작업이나 커밋 단위가 아니다.

**목표:** 설치 필수 runtime inventory를 cooperative 해시 입력과 분리하여 설치 전용 파일 추가가 기존 workflow의 `runtimeHash`를 바꾸지 않게 한다.

**구조:** installer 소유의 정적 inventory를 manifest와 runtime 생성기가 공유한다. cooperative 해시는 기존 11개 파일의 원시 바이트와 순서를 그대로 사용한다. 실제 runtime·policy 변경에 대한 mismatch hold를 유지한다.

**기술:** Node.js `>=22`, ESM, `node:test`, SHA-256, 기존 생성기·manifest 검증.

**설계 근거:** Orchestrator가 전달한 사용자 승인 설계. Bounded 작업이며 별도 written spec은 생략한다. 공유 inventory 계약과 생성 산출물 때문에 written plan을 사용한다.

**문서 경로:** `/Users/ma-24-007/.codex/worktrees/runtime-hash-scope/arc/docs/superpowers/plans/2026-10-23-runtime-hash-scope.md`

## 대상과 공통 제약

- 작업 루트: `/Users/ma-24-007/.codex/worktrees/runtime-hash-scope/arc`
- branch: `fix/runtime-hash-scope`
- 기준 HEAD: `e5aba81cfbc64d13ca58190e1a3402e826c2e7a1`
- brief 기준 상태: clean.
- 아래 상대 경로는 모두 저장소 루트 기준이다.
- source checkout `/Users/ma-24-007/Desktop/workspace/arc`와 기존 TUI 변경은 그대로 둔다.
- master에 없는 `lib/runtime/cli.mjs`, `lib/runtime/command.mjs`를 추가하거나 다른 lineage에서 복사하지 않는다.
- 기존 해시 대상 11개 파일과 policy 원본, 대응 플랫폼 복사본의 바이트를 보존한다.
- 해시 알고리즘·순서·버전 문자열·state schema·mismatch 판정을 변경하지 않는다.
- state 자동 수정, 승인·증거 이전, mismatch 우회, 새 의존성을 추가하지 않는다.
- **본 계획 승인은 아래에 명시한 테스트 작성, 임시 fixture 생성·변형, 테스트·검사·재생성 명령 실행을 승인 범위에 포함한다.** 실제 실행은 Orchestrator의 handoff 이후에 시작한다.

## 중점 검토 조건

다음 다섯 조건을 T1 테스트에 포함한다.

1. 변경된 파일로 기대 해시를 재계산하여 과거 호환성 회귀를 놓치는 경우.
2. inventory 누락·과잉·중복으로 canonical `.mjs` 집합과 설치 목록이 달라지는 경우.
3. manifest 재생성으로 필수 파일 삭제가 감춰지는 경우.
4. 설치 전용 파일이 해시를 바꾸거나 생성기의 기존 안전성을 깨는 경우.
5. 실제 runtime·policy drift 후 workflow가 진행되거나 durable state를 수정하는 경우.

## T1: 설치 inventory와 cooperative 해시 계약 분리

**목표·범위:** inventory, 두 소비자, 회귀 테스트, 생성 결과, manifest를 하나의 일관된 변경으로 완성한다.

**선행 작업:** 사용자 설계 승인, 본 계획 승인, Orchestrator 실행 handoff.

**의존성:** 별도 선행 구현 작업은 없다. inventory·소비자·테스트·산출물은 함께 수용해야 하므로 하나의 작업으로 실행한다. 병렬 구현 작업은 없다.

### 대상 파일

| 구분 | 저장소 루트 기준 경로 | 책임 |
|---|---|---|
| 생성 | `lib/installer/runtime-assets.mjs` | 설치 필수 canonical runtime inventory |
| 수정 | `lib/installer/manifest.mjs` | inventory와 canonical·플랫폼 경로 필수 검증 |
| 수정 | `scripts/update-runtime-assets.mjs` | inventory 완전성 검증 후 기존 방식으로 복사 |
| 수정 | `tests/node/runtime-versions.test.mjs` | baseline 해시·순서·설치 전용 자산 독립성 |
| 수정 | `tests/node/runtime-assets.test.mjs` | inventory 완전성·생성기 안전성 |
| 수정 | `tests/node/manifest.test.mjs` | manifest 재생성 후 필수 파일 삭제 거부 |
| 수정 | `tests/node/runtime-workflow.integration.test.mjs` | 실제 바이트 drift에 대한 hold·state 보존 |
| 재생성·확인 | `codex/skill/runtime/**`, `claude/skill/runtime/**` | canonical runtime·policy와 일치 |
| 재생성 | `MANIFEST.sha256` | 최종 payload 바이트 반영 |

canonical runtime을 변경하지 않으므로 기존 플랫폼 runtime 파일의 바이트 변경은 예상하지 않는다.

### inventory 인터페이스와 경로 계약

새 모듈은 IO나 bootstrap import 없이 다음 상수를 export한다.

```js
export const RUNTIME_MODULE_PATHS = Object.freeze([
  // 저장소 루트 기준 POSIX 상대 경로
]);
```

값은 다음 19개이며 이 순서를 유지한다.

```text
lib/runtime/acceptance.mjs
lib/runtime/adapters/claude.mjs
lib/runtime/adapters/codex.mjs
lib/runtime/assignment.mjs
lib/runtime/bootstrap.mjs
lib/runtime/capabilities.mjs
lib/runtime/cooperative-schema.mjs
lib/runtime/cooperative.mjs
lib/runtime/evaluate.mjs
lib/runtime/external.mjs
lib/runtime/gate.mjs
lib/runtime/git-evidence.mjs
lib/runtime/git-query.mjs
lib/runtime/identity.mjs
lib/runtime/operations.mjs
lib/runtime/schema.mjs
lib/runtime/scope.mjs
lib/runtime/store.mjs
lib/runtime/verification.mjs
```

모든 항목은 **저장소 루트 기준**이다. 소비자는 다음 규칙을 사용한다.

- canonical 경로: `lib/runtime/adapters/codex.mjs`
- runtime 내부 상대 경로: `adapters/codex.mjs` — 고정 접두부 `lib/runtime/`를 한 번 제거한다.
- Codex 설치 경로: `codex/skill/runtime/adapters/codex.mjs`
- Claude 설치 경로: `claude/skill/runtime/adapters/codex.mjs`

생성기는 기존 재귀 탐색 결과를 저장소 루트 기준 POSIX 경로로 정규화하고 정렬하여 inventory와 비교한다. 실제 파일 접근은 선택된 `--root` 아래에서 수행한다. runtime 내부 상대 경로를 inventory 값으로 혼용하지 않는다.

`role-policy.json`은 `.mjs` inventory에 넣지 않는다. 기존 `lib/policy/role-policy.json` 복사를 유지하고, manifest는 canonical policy와 두 플랫폼의 `runtime/role-policy.json`을 필수로 요구한다.

### 구현 단계

- [ ] **1. 수정 전 baseline을 확보한다.**

  작업 루트에서 다음 명령으로 기준 버전·해시를 기록한다.

  ```bash
  node --input-type=module -e 'import {cooperativeVersions} from "./lib/runtime/bootstrap.mjs"; console.log(JSON.stringify(await cooperativeVersions()));'
  ```

  반환된 `runtimeHash`를 회귀 테스트의 고정 기대값으로 기록한다. 기존 11개 모듈 목록·순서와 파일 바이트도 기준 HEAD와 비교할 수 있도록 증거를 남긴다.

  `bootstrap.mjs` 자신이 해시 대상이므로 주석·export 추가도 하지 않는다.

- [ ] **2. 회귀 테스트와 유효한 fixture를 먼저 작성한다.**

  **`runtime-versions.test.mjs`**

  - 세 runtime 위치의 `runtimeHash`가 수정 전 고정 baseline과 같다.
  - 기존 11개 해시 목록·순서·동결 상태가 유지된다.
  - 설치 전용 fixture 모듈을 inventory에만 추가하여 생성한 뒤에도 해시가 같다.
  - 설치 전용 fixture 모듈의 내용 변경도 해시를 바꾸지 않는다.

  **`runtime-assets.test.mjs`**

  기존 `schema.mjs` 하나만 가진 fixture는 새 완전성 계약을 만족하지 않는다. 정상 fixture는 inventory의 **모든 경로**에 파일을 생성하고 기존 policy fixture를 유지한다. 복사 기능만 검증하는 테스트에서는 `.mjs` 내용이 간단한 유효 모듈이어도 된다.

  다음을 검증한다.

  - inventory가 동결·정렬되어 있고 중복 없이 canonical 집합과 일치한다.
  - canonical 파일만 추가, inventory 항목만 추가, inventory 중복을 각각 거부한다.
  - 불일치 실패 전에 기존 출력 파일이 수정되거나 새 출력이 생성되지 않는다.
  - 설치 전용 fixture 파일이 두 플랫폼에 정확히 복사된다.
  - `--check`의 drift 검출과 파일 비수정, symlink 거부, 관리 밖 파일 보존, 반복 생성 결정성을 유지한다.

  inventory 변형 테스트는 생성기와 inventory 모듈을 임시 루트의 동일 상대 경로에 복사한 뒤 **그 생성기 복사본**을 실행한다. `--root`만 바꾸면 실제 스크립트가 import하는 inventory는 바뀌지 않으므로 이를 fixture inventory 주입으로 취급하지 않는다.

  **`manifest.test.mjs`**

  각 inventory 항목에 대해 canonical·Codex·Claude 경로를 개별 삭제하고 manifest를 재생성한다. 매번 `ARC_PAYLOAD_VALIDATION`으로 실패해야 한다. inventory 모듈 자체와 두 플랫폼 policy 복사본 삭제도 같은 방식으로 검증한다. 정상 payload 검증도 유지한다.

- [ ] **3. 실제 drift를 검증하는 격리 fixture를 작성한다.**

  `runtime-workflow.integration.test.mjs`에 고유 임시 디렉터리를 사용하는 helper를 추가한다.

  1. 실제 `lib/runtime/` 전체를 임시 루트의 `lib/runtime/`로 복사한다.
  2. 실제 policy를 임시 루트의 `lib/policy/role-policy.json`으로 복사한다.
  3. 기존 테스트에서 사용하는 유효한 target·`observe`·storage 경로 구성을 재사용한다.
  4. 임시 복사본의 절대 file URL로 `bootstrap.mjs`와 `cooperative.mjs`를 import한다.
  5. 임시 복사본의 `initializeCooperativeWorkflow`로 workflow를 만들고, 임시 복사본의 `runCooperativeCommand`를 호출한다. 원본 runtime 함수로 초기화하거나 실행하지 않는다.

  이 구조에서는 bootstrap의 module URL이 임시 복사본을 가리키므로 해시 입력도 임시 파일이다. 각 사례는 고유 디렉터리를 사용하여 ESM 캐시가 fixture 사이에 공유되지 않게 한다.

  별도 사례로 다음을 수행한다.

  - 해시 대상 임시 모듈에 유효한 주석을 추가한다.
  - 임시 policy에 JSON 의미를 유지하는 공백을 추가한다.

  각 변경 전후 `cooperativeVersions()`의 해당 해시가 실제로 달라짐을 확인한다. 이후 공개 명령 `status`가 `hold`와 `['cooperative.versions']`를 반환하고, 호출 전후 durable state 파일 바이트가 동일함을 확인한다. state의 승인·증거·records·revision도 유지되어야 한다.

  해시는 호출 시 파일을 읽으므로 이미 import된 임시 runtime으로도 바이트 drift를 관찰할 수 있다. state에 가짜 해시를 쓰는 방법으로 이 실제 파일 변경 검증을 대체하지 않는다.

  설치 전용 파일의 해시 독립성 테스트도 이 실제 runtime 복사 구조를 사용한다. 여기에 생성기·inventory 복사본을 준비하고 fixture inventory에 `lib/runtime/install-only.mjs`만 추가한다. 실제 저장소에는 entrypoint를 추가하지 않는다.

- [ ] **4. RED를 확인한다.**

  ```bash
  node --test tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs tests/node/runtime-workflow.integration.test.mjs
  ```

  유효한 RED는 새 inventory export 부재, inventory 불일치 미검출, manifest 필수 runtime 검증 부재 등 추가 계약 때문에 발생한 실패다.

  최소 fixture에 파일이 부족한 실패, 잘못된 import 경로, 원본 bootstrap 사용, 유효하지 않은 target, native 환경 문제는 RED 증거로 인정하지 않는다. baseline·기존 안전성·drift hold 테스트는 기존 동작을 고정하는 회귀 테스트이므로 처음부터 통과할 수 있다.

- [ ] **5. inventory와 manifest 소비자를 구현한다.**

  `lib/installer/runtime-assets.mjs`에 위 상수를 추가한다.

  `manifest.mjs`는 다음 경로를 필수 목록에 넣는다.

  - inventory 모듈 자체.
  - inventory의 모든 canonical 경로.
  - 각 canonical 경로에서 고정 접두부를 제거하여 구성한 두 플랫폼 설치 경로.
  - 기존 canonical policy와 두 플랫폼 policy 복사본.

  기존 descriptor 기반 파일 접근, manifest 바이트 검증, 오류 래핑은 유지한다.

- [ ] **6. 생성기 소비자를 구현한다.**

  기존 안전한 재귀 탐색으로 `.mjs` 전체를 수집한 뒤 정규화·정렬 결과와 inventory를 정확히 비교한다. 누락·과잉·중복은 출력 쓰기 전에 실패시킨다.

  일치하면 기존 정렬 복사, policy 복사, symlink 거부, `--check`, 관리 밖 파일 보존을 유지한다. 해시 목록을 생성기 입력으로 사용하지 않는다.

- [ ] **7. 산출물을 재생성한다.**

  ```bash
  node scripts/update-runtime-assets.mjs
  node scripts/update-manifest.mjs
  ```

  기존 runtime·policy·플랫폼 복사본에 예상 밖 바이트 변경이 없어야 한다.

- [ ] **8. 집중 검사와 전체 검사를 수행한다.**

  ```bash
  node --test tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs tests/node/manifest.test.mjs tests/node/runtime-workflow.integration.test.mjs
  node scripts/update-runtime-assets.mjs --check
  npm run check:manifest
  npm run check:role-policy
  npm test
  ```

  모두 종료 코드 `0`이어야 한다. 첫 단계의 버전 출력 명령을 다시 실행하여 baseline 해시와 동일함을 기록한다.

### 수용 기준과 필수 증거

Orchestrator는 다음을 확인한 뒤 T1을 수용한다.

- 수정 전후 고정 baseline 해시와 기존 해시 대상 파일 바이트·순서가 같다.
- inventory의 저장소 루트 기준 경로 의미가 두 소비자와 fixture에서 일치한다.
- canonical `.mjs` 집합과 inventory가 정확히 일치한다.
- 설치 전용 fixture 파일은 생성되며 해시에 영향을 주지 않는다.
- manifest를 재생성해도 필수 파일 삭제가 거부된다.
- 실제 임시 runtime·policy 파일 변경은 mismatch hold를 만들고 durable state를 보존한다.
- 생성·manifest·policy 검사와 전체 Node 테스트가 통과한다.
- 독립 QA가 위 행동과 검사 증거를 확인하고, QA finding의 수정·필요 재검증이 완료된다.
- 승인 범위 밖 변경이 없고 source checkout은 그대로다.

**커밋:** T1 전체가 하나의 구현 커밋이다. Implementer·QA는 Git 상태를 변경하지 않는다. Orchestrator가 수용한 뒤 focused commit을 만든다.

권장 메시지: `fix: separate runtime asset inventory from cooperative hash scope`

### 보류 조건

- handoff의 branch·HEAD·변경 상태·소유권과 실제 상태가 다름.
- 기존 해시 대상 파일이나 policy 원본 수정이 필요해짐.
- baseline 해시 또는 기존 플랫폼 복사본 바이트가 예상과 다름.
- master에 없는 TUI entrypoint나 transport 동작이 필요해짐.
- inventory 검증이 기존 생성기 안전성·파일 보존 계약과 충돌함.
- 필요한 검사 실행 불가, 설명되지 않은 실패, 범위 밖 변경이 발생함.

영향 작업을 중단하고 관찰 상태·완료 단계·실패 증거·필요한 결정을 Orchestrator에 보고한다.

## 최종 전체 검증

T1의 QA, Orchestrator 수용, focused commit 이후 독립 Reviewer가 기준 HEAD부터 최종 HEAD까지 전체 변경을 한 번 검토한다. 범위는 해시 호환성, inventory 완전성, 설치 검증, 생성기 안전성, 실제 drift hold, 검증 증거다.

최종 Reviewer finding은 Implementer → Reviewer로 수정·재확인한다. 이 최종 단계에는 QA를 재배정하지 않는다. 최초 최종 리뷰 전에 필요한 QA와 실패 재검증은 완료되어 있어야 한다. 전체 완료 판단은 Orchestrator가 수행한다.

이 계획은 master의 자산·해시 경계를 검증한다. 별도 `feat/arc-tui` lineage의 실제 entrypoint 통합 검증은 포함하지 않는다.

## 자체 검토와 미해결 사항

- inventory 값과 소비자 변환을 모두 저장소 루트 기준 POSIX 경로로 통일했다.
- 생성기의 module-relative import와 `--root`의 차이를 fixture 지침에 반영했다.
- 실제 runtime 전체와 policy를 임시 경로에 복사하여 bootstrap의 module URL 기반 해시 읽기를 격리했다.
- 유효한 RED와 fixture·환경 오류를 구분했다.
- 단일 작업·수용·커밋 경계, 수용 전 QA, 수용 후 최종 Reviewer 시점을 유지했다.
- 계획 승인에 포함되는 테스트·검사 범위를 명시했다.
- 미해결 제품 결정은 없다. 고정 baseline 해시 값은 첫 편집 전에 확보할 실행 입력이다.

이번 수정은 기존 초안과 제공된 소스 관찰에 근거했다. 추가 명령·파일 변경·검증 실행은 수행하지 않았다.

