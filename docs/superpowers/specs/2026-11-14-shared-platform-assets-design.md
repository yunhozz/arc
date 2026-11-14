# 플랫폼 공통 자산(`shared/`) 리팩토링 설계

- 날짜: 2026-11-14
- 경로: Architectural (spec, plan 모두 필요)
- 위험: high (패키지·검증 경로 변경)
- 검증: task별 fresh QA, 모든 task 수락 후 최종 Reviewer 1회
- 기준: `/Users/yunho/Desktop/project/arc`, 브랜치 `refactor/shared-platform-assets`(사용자 선택 대상), HEAD `e472406fa74f7dc8a54f18716b9ac413a926280c`, clean
- 승인된 설계: 2026-11-14 사용자 명시 승인. 같은 날 워크트리 범위 추가 설계(D7–D10)도 승인
- 후속 plan: `docs/superpowers/plans/2026-11-14-shared-platform-assets.md`(경로는 plan 단계에서 확정)

## 0. 요구사항과 결정

### 0.1 원 요구사항
> "전체적으로 리팩토링이 필요해. 현재 claude, codex 각각 디렉토리가 존재하는데 겹치는 파일들과 내용들이 있어. 이렇게 공통으로 관리할 수 있는 것들은 모두 플랫폼 디렉토리와 같은 레벨에서 관리하도록 해줘."

### 0.2 사용자 결정(2026-11-14)
| ID | 결정 |
|---|---|
| D1 (P1) | 부분 차이 파일(`SKILL.md`, 나머지 references, `models.toml`, `scripts/*.py`)은 이번에 플랫폼별 유지 |
| D2 (S1) | 패키지 내부 경로·`MANIFEST.sha256` 변경 허용. 설치 결과물 경로·바이트는 불변 |
| D3 | 공통 디렉터리 이름은 `shared/`. `shared/skill/...`이 설치 skill 트리를 미러 |
| D4 (R1) | `scripts/update-runtime-assets.mjs`는 `shared/skill/runtime` 한 곳에만 출력 |
| D5 | 과거 날짜 spec/plan(`docs/superpowers/specs|plans/*`)은 역사 기록으로 보존, 수정 금지 |
| D6 | golden 설치 레이아웃 fixture는 리팩토링 후에도 회귀 테스트로 유지 |
| D7 | (범위 추가) Claude도 Codex처럼 관리형 워크트리 실행 대상을 선택할 수 있게 하고, 워크트리 기능 중 공통으로 관리할 수 있는 부분은 `shared/`로 모은다 |
| D8 (M2) | Claude 워크트리 생성 방식: Orchestrator가 `git worktree add`로 만든 뒤 `EnterWorktree({path})`로 세션을 옮긴다 |
| D9 (E1) | Claude 워크트리 경로는 `.claude/worktrees/<name>`이다. `.git/info/exclude`에 항목이 없으면 추가할 수 있다 |
| D10 (E2) | W0 Spike를 승인하고, 시험 후 시험용 워크트리와 브랜치를 삭제한다(2026-11-14 수행 완료, §11.1) |

원 요구사항 외 추가 요청(2026-11-14):
> "그리고 claude도 codex와 마찬가지로 워크트리 작업 공간을 선택할 수 있도록 해줘. 이 역시도 마찬가지로 공통으로 관리할 수 있으면 그렇게 해."

## 1. 배경과 목표

`codex/skill/`과 `claude/skill/`에는 바이트가 같은 사본 두 묶음이 있다.

- Superpowers 유래 flat reference 13개
- `runtime/**`(`lib/runtime/**` 사본 + `role-policy.json`)

Scouter가 `git hash-object`로 비교했을 때 13개와 추적 중인 `runtime/**`는 모두 동일했다. 그 밖에 동일한 대응 파일은 없다.

현재 이 중복은 두 장치로 유지된다.

- `verifyPayload`가 플랫폼별로 검증한 뒤 플랫폼 간 바이트 동등성을 검사한다(`manifest.mjs:41-42`).
- updater가 양 플랫폼에 각각 기록한다(`package-references.mjs:27`, `update-runtime-assets.mjs:21`).

목표:

- 동일 자산을 저장소 루트 `shared/skill/`에 한 벌만 둔다.
- 설치할 때 `shared/skill/**`과 `<platform>/skill/**`을 합쳐 현재와 같은 설치 트리를 만든다.
- 설치 결과물의 경로와 바이트를 보존한다.

## 2. 범위와 비목표

### 2.1 범위
- reference 13개와 `runtime/**`를 `shared/skill/`로 이동한다(git rename, 바이트 불변). 플랫폼 사본은 삭제한다.
- 조합 helper를 새로 만들고 `verifyPayload`/`renderSkillPayload`에 연결한다.
- 다음 파일의 경로 가정을 갱신한다: `manifest.mjs`, `update-manifest.mjs`, `package-references.mjs`, `superpowers.mjs`, `update-runtime-assets.mjs`, `package.json` `files`.
- `MANIFEST.sha256`를 재생성한다(경로만 변경).
- golden 설치 레이아웃 fixture와 회귀 테스트를 추가한다.
- 영향받는 테스트와 현행 문서를 갱신한다.
- (D7) Claude 관리형 워크트리 실행 경로를 추가하고 워크트리 공통 계약을 `shared/`로 분리한다(§11).

### 2.2 비목표
- 부분 차이 파일 공통화(D1): `SKILL.md`, `coordination.md` 등 나머지 references, `models.toml`, `scripts/*.py`, `agents/`, `codex/tools/`, Codex 전용 `handoff-worktree.md`
- T1–T5에서 설치 결과물의 경로·바이트·모드 변경(D2). 워크트리 task(W1, W2)의 의도된 변경은 §11.6에 따른다.
- Claude 워크트리 생성 방식 M1(`EnterWorktree({name})`), M3(세션 전환 없음), Agent `isolation:"worktree"` 사용
- 워크트리 자동 정리(`ExitWorktree remove`, `git worktree remove/prune`)
- `docs/superpowers/specs|plans/*` 과거 문서 수정(D5)
- `.git/arc/workflows/arc-consistent-gates` 삭제(H1 보류)
- `scripts/update-superpowers-local.sh` 수정·삭제(사용자 소유 무시 파일)
- 다음 코드 변경: `REFERENCE_PATH_MAP`, `flattenReferenceBundle`, `lib/policy/render.mjs` `POLICY_TARGETS`, `lib/release/artifact.mjs`
- 이전 버전 패키지와의 호환 계층(§4.10에서 불필요 확인)
- 테스트 매칭 완화
  - 금지: assertion 삭제, 정규식 완화
  - 허용: 경로·키 교체, 플랫폼 반복을 shared 단일 대상으로 바꾸기

## 3. 목표 레이아웃과 이동 목록

```
shared/skill/references/{brainstorming,builder-check-prompt,test-driven-development,visual-companion,writing-good-tests,writing-plans}.md
shared/skill/references/{superpowers-LICENSE,superpowers-provenance.json}
shared/skill/references/scripts/{frame-template.html,helper.js,server.cjs,start-server.sh,stop-server.sh}
shared/skill/runtime/**        (lib/runtime/** 사본 + role-policy.json, R1 유일 출력)
codex/skill/   SKILL.md, models.toml, 나머지 references(+handoff-worktree.md), scripts/*.py 유지; codex/agents/, codex/tools/ 유지
claude/skill/  SKILL.md, models.toml, 나머지 references, scripts/*.py 유지; claude/agents/ 유지
```

### 3.1 이동 목록(T3)
| 출처(rename) | 대상 | 삭제 |
|---|---|---|
| `codex/skill/references/brainstorming.md` | `shared/skill/references/brainstorming.md` | `claude/skill/references/brainstorming.md` |
| `codex/skill/references/builder-check-prompt.md` | `shared/skill/references/builder-check-prompt.md` | claude 대응 파일 |
| `codex/skill/references/test-driven-development.md` | `shared/skill/references/test-driven-development.md` | claude 대응 파일 |
| `codex/skill/references/visual-companion.md` | `shared/skill/references/visual-companion.md` | claude 대응 파일 |
| `codex/skill/references/writing-good-tests.md` | `shared/skill/references/writing-good-tests.md` | claude 대응 파일 |
| `codex/skill/references/writing-plans.md` | `shared/skill/references/writing-plans.md` | claude 대응 파일 |
| `codex/skill/references/superpowers-LICENSE` | `shared/skill/references/superpowers-LICENSE` | claude 대응 파일 |
| `codex/skill/references/superpowers-provenance.json` | `shared/skill/references/superpowers-provenance.json` | claude 대응 파일 |
| `codex/skill/references/scripts/{frame-template.html,helper.js,server.cjs,start-server.sh,stop-server.sh}` | `shared/skill/references/scripts/` 같은 이름 | claude 대응 5개 |

이 목록은 `REFERENCE_PATH_MAP` destination 13개(`superpowers.mjs:13-18`)와 일치한다.

### 3.2 이동 목록(T4)
- `codex/skill/runtime/**` 추적 파일 전부를 `shared/skill/runtime/**`로 rename하고 `claude/skill/runtime/**`는 삭제한다.
- 이동 후 `node scripts/update-runtime-assets.mjs --check`가 성공해야 한다. 즉 `lib/runtime/**`와 `lib/policy/role-policy.json` 대비 drift가 없어야 한다.

파일 모드는 git rename으로 보존하며 `.sh` 실행 비트도 유지한다.

## 4. 구성요소 설계

### 4.1 조합 helper: `lib/installer/skill-sources.mjs`(이름은 plan에서 확정)

**export**
- `SHARED_SKILL_PREFIX='shared/skill/'`
- `GENERATED_SKILL_FILES=['SKILL.md','models.toml','settings.toml','limits.toml']`
- `composeSkillSources(files, platform) → Map<relative, Buffer>`

**입력**
- `files: Map<packageRelative, Buffer>`
- `platform ∈ {'codex','claude'}`. 그 밖의 값이면 실패한다.

**동작**
1. `shared/skill/` 접두 파일에서 접두를 떼어 상대경로 집합 S를 만든다.
2. `<platform>/skill/` 접두 파일에서 접두를 떼어 상대경로 집합 P를 만든다. 다른 플랫폼 파일은 무시한다.
3. 충돌 규칙을 검사한다. 위반하면 실패하고, 메시지에 충돌한 상대경로를 넣는다.
   - C1 동일 경로: `S ∩ P ≠ ∅`
   - C2 생성 파일: `S ∩ GENERATED_SKILL_FILES ≠ ∅`. 그 하위 경로도 포함한다.
   - C3 파일/디렉터리 접두 충돌: S의 a와 S∪P의 b(a≠b)에 대해 `b.startsWith(a+'/')`가 성립하는 경우. P의 a와 S의 b에 대해서도 같은 조건을 검사한다.
4. 결과는 `S ∪ P` Map이며 값은 `Buffer.from` 사본이다. 충돌을 금지하므로 순서와 무관하게 결정적이다. 반환 순서는 상대경로 사전순이다(plan에서 확정).

**오류 클래스**
- helper는 일반 `Error`를 던지고, 호출자가 `PayloadValidationError`로 감싸 순환 import를 피한다.
  - `verifyPayload`: 바깥 catch(`manifest.mjs:60`)가 감싼다.
  - `renderSkillPayload`: `plan.mjs`가 이미 import한 클래스로 감싼다.
- 정확한 배치는 plan에서 정한다. 조건은 두 경로 모두 최종 결과가 `code==='ARC_PAYLOAD_VALIDATION'`인 것이다.

**적용**
- `verifyPayload`
  - 파일 수집 직후(`manifest.mjs:40` 다음) `codex`, `claude` 모두에 대해 `composeSkillSources`를 호출한다.
  - install, upgrade, status, release, package-references가 모두 이 경로를 지나므로 충돌하면 일찍 실패한다.
- `renderSkillPayload`(`plan.mjs:31-33`)
  - 플랫폼 접두 루프를 `composeSkillSources(payload.files, target.platform)`로 바꾼다.
  - 이후 `SKILL.md`, `settings.toml`, `models.toml`, `limits.toml` 덮어쓰기는 그대로 둔다.
  - `target.payloadPrefix`는 `platform`과 같다(`targets.mjs:8`).
- `verifyPayload` `required` 목록(`manifest.mjs:44`)에 `lib/installer/skill-sources.mjs`를 추가한다.

### 4.2 `verifyPayload`/`referenceTree` (`lib/installer/manifest.mjs`)
- `ROOTS`(:10)에 `'shared/skill'`을 추가한다. `select`가 ENOENT를 허용하므로(:39) T2 시점에 디렉터리가 없어도 통과한다.
- :41-42의 플랫폼별 `validateFlatReferenceFiles`와 `Imported platform parity mismatch`를 `const referenceTree=validateFlatReferenceFiles(files)` 한 번으로 대체한다. 동등성 검사는 삭제한다.
- 반환 `referenceTrees.{codex,claude}`(:59)를 `referenceTree`(단수)로 바꾼다.
  - 제품 코드에 직접 소비처가 없다.
  - 테스트 `manifest.test.mjs:39`, `package-references.test.mjs:8`만 수정한다.
- runtime 필수 목록(:46, :48)에서 플랫폼 루프를 없애고 다음으로 바꾼다.
  - `shared/skill/runtime/role-policy.json`
  - `shared/skill/runtime/<RUNTIME_MODULE_PATHS 상대>`
  - `shared/skill/runtime/<COOPERATIVE_RUNTIME_MODULES>`
- 플랫폼 필수 항목(:49의 `SKILL.md`, `models.toml`, `references/limits.md`, agents)과 `MUTABLE`(:8)은 바꾸지 않는다.

### 4.3 `scripts/update-manifest.mjs`
- :20 방문 목록에 `'shared/skill'`을 추가한다. `visit`가 ENOENT를 허용한다(:12).
- `mutable`(:7)은 바꾸지 않는다.
- task마다 `node scripts/update-manifest.mjs`로 `MANIFEST.sha256`를 재생성하고 `--check`로 확인한다. 직접 편집은 금지한다.

### 4.4 `lib/installer/package-references.mjs`
- :14 `paths`를 다음 두 가지로 바꾼다.
  - `REFERENCE_PATH_MAP.map(({destination})=>path.join(packageRoot,'shared/skill/references',destination))`
  - `MANIFEST.sha256`
- :27 기록 대상은 `shared/skill/references/<destination>` 하나로 한다.
- 다음은 바꾸지 않는다: `verifyPayload`(source), 스냅샷, acquisition, `applyTransaction`, `renderManifest`, dispose.

### 4.5 `lib/installer/superpowers.mjs`
- `validateFlatReferenceFiles(files, platform)`(:126)를 `validateFlatReferenceFiles(files)`로 바꾼다.
  - 입력 검사는 `files instanceof Map`이다.
  - 읽는 접두는 `shared/skill/references/`다.
  - 중첩 `superpowers/`는 세 접두 모두에서 거부해 legacy 재유입을 막는다: `shared/skill/references/superpowers/`, `codex/skill/references/superpowers/`, `claude/skill/references/superpowers/`.
  - 반환 형태 `{provenance, entries}`는 유지한다.
- `DYNAMIC_ROOTS`(:11)는 기존 두 항목을 유지하고 `shared/skill/references/superpowers`를 추가한다. `isDynamicReferencePath` 의미는 그대로다.
- `REFERENCE_PATH_MAP`, `flattenReferenceBundle`은 바꾸지 않는다.

### 4.6 `scripts/update-runtime-assets.mjs` (R1)
- :21 출력 루프를 `path.join(root,'shared/skill/runtime',name)` 하나로 바꾼다.
- 다음은 의미를 그대로 둔다: 입력 검사(:14-20), `safe`, drift 판정, `--check` 종료 코드·메시지.
- 출력 파일 수는 절반이 된다.
- 플랫폼 `runtime/`이 남아 있어도 이 스크립트는 감지하지 않는다. 대신 §4.1 C1이 `verifyPayload`에서 실패시킨다.

### 4.7 `package.json` `files`
- :27 배열에 `"shared/skill/"`를 추가한다.
- **배치는 T3다.**
  - 이유: `lib/release/artifact.mjs:52-54`의 inventory 순회는 `files` 항목을 `lstat`/`visit`할 때 ENOENT를 허용하지 않는다(Orchestrator 확인).
  - 그래서 `shared/skill/`이 실제로 생기는 T3에 함께 넣는다. T3 이후에는 `shared/skill/`이 항상 존재한다.
  - 승인된 설계는 이 항목을 T2에 두었지만, 범위는 같고 배정만 바뀐다.

### 4.8 release artifact
- `inputNames(pkg)`(`artifact.mjs:33`)가 `files`에서 inventory를 만들고, 플랫폼 skill을 별도로 열거하지 않는다. 그래서 코드 변경이 필요 없을 것으로 예상한다.
- 실행 검증이 필요하다.
  - `npm pack --dry-run`: `shared/skill/**`이 포함되고 플랫폼 이동 대상 경로는 없어야 한다.
  - `node --test --test-timeout=<값> tests/node/release-artifact-process.test.mjs`

### 4.9 기타 소비처(변경 없음 확인)
- `lib/policy/render.mjs:31,33`: 플랫폼 `SKILL.md`와 플랫폼에 남는 references만 다룬다.
- `lib/tui/setup.mjs:16`: 플랫폼 `models.toml`을 읽는다.

### 4.10 업그레이드 호환성(결론)
- 이전 버전 `lib/management/update.mjs:66`은 새 패키지의 `bin/arc-upgrade.mjs`를 자식 프로세스로 실행한다.
- 이전 코드가 새 패키지에서 확인하는 것은 `package.json` 버전(:27)뿐이다.
- `verifyPayload`는 새 패키지 코드로 실행된다(`lib/installer/upgrade.mjs:22`).
- 따라서 버전 간 호환 설계는 불필요하다. 회귀 근거는 `upgrade-harness` 테스트 통과로 남긴다.

## 5. 행위 보존 계약

### 5.1 golden 설치 레이아웃(T1)
- **생성 시점**: T1에서 리팩토링 전 코드(HEAD `e472406`과 같은 동작)로 한 번만 생성한다.
- **생성 방법**
  - source 모드 `verifyPayload`와 `buildInstallPlan`(또는 동등한 설치 계획 진입점, plan에서 확정)으로 설치 산출물을 만든다.
  - 산출물은 `skills/arc/**`와 agents 프로필이다.
  - 상대경로→sha256을 기록한다.
- **매트릭스**: platform{`codex`,`claude`} × profiles{`write`,`omit`} × language{`en`,`ko`}, 8개 조합. 시간, 홈 경로 등 비결정 입력은 고정 값으로 둔다(plan에서 확정).
- **저장**: `tests/node/fixtures/installed-layout-golden.json`. 스키마는 plan에서 확정하되 최소한 조합 키와 `{relativePath: sha256}`을 담는다.
- **테스트**: 현재 작업 트리 산출물이 fixture와 키 집합·해시 모두 정확히 일치해야 한다.
- **규칙**
  - T2–T5에서는 fixture를 재생성하거나 편집하지 않는다(diff 0). W1·W2는 §11.6의 예상 diff 대조 규칙에 따라서만 갱신한다.
  - 불일치가 나면 구현 결함으로 본다.
  - D6에 따라 리팩토링 후에도 회귀 테스트로 유지한다.

### 5.2 기준선 실패 비교
- T1에서 다음 두 가지를 실행하고 실패 테스트 이름과 메시지를 증거로 기록한다(약 Node 68건, Python 563건).
  - Node 전체: `node --test --test-timeout=<값>`
  - Python 전체: `PYTHONDONTWRITEBYTECODE=1`
- 기록 위치는 Orchestrator 증거 저장소다. 저장소에 커밋할지는 plan에서 확정한다.
- 각 task 후에는 다음을 지킨다.
  - **B1** 신규 실패 0건: 이름 기준으로 기준선에 없는 실패가 없어야 한다.
  - **B2** 기준선 실패는 유지되거나 해소만 된다. 해소된 것은 목록으로 보고한다.
  - **B3** 이번 task에서 수정한 테스트가 실패하면, 알려진 원인과 메시지가 일치한다는 증거가 필요하다. 알려진 원인은 다음 세 가지다.
    1. `Local updater wrapper is forbidden`: 무시 파일 `scripts/update-superpowers-local.sh`가 있어서 생긴다.
    2. `arc-consistent-gates` 워크플로 잔존(H1)
    3. `plan.test.mjs` 기존 8건
  - **B4** task 범위 밖의 테스트 파일은 수정하지 않는다.

## 6. 테스트·문서 갱신 매핑

테스트는 해당 이동과 같은 task에서 갱신한다.

| Task | 대상 | 갱신 |
|---|---|---|
| T1 | 신규 `tests/node/installed-layout-golden.test.mjs`(이름 plan 확정), `fixtures/installed-layout-golden.json` | §5.1 |
| T2 | 신규 `skill-sources` 단위 테스트 | C1·C2·C3 실패(메시지에 경로 포함), 합집합 결정성, 잘못된 platform 거부 |
| T2 | `manifest.test.mjs` | 충돌 주입 시 `ARC_PAYLOAD_VALIDATION`로 조기 실패, 새 모듈이 required에 포함 |
| T3 | Node `manifest.test.mjs`(:28,:39,:42,:47) | imported 필수성·변조 대상을 shared로, `referenceTree` 단수, 동등성 테스트를 "중복 사본 재유입 시 C1 실패"로 대체 |
| T3 | `package-references.test.mjs`(:6,:8,:12), `fixtures/static-references.mjs`(:8,:11) | shared에만 기록·보호·복사 |
| T3 | `superpowers.test.mjs`(:4,:18) | 1인자 시그니처, shared 접두, 세 접두 중첩 거부, `DYNAMIC_ROOTS`에 shared |
| T3 | `visual-companion.test.mjs`(:4,:11) | `shared/skill/references/scripts/...` |
| T3 | `management-operations.test.mjs`(:9,:33), `upgrade-harness.test.mjs`(:62,:83) | 설치본 비교 키를 `shared/skill/references/brainstorming.md`로 |
| T3 | `package.test.mjs`(:22,:39), `consumer.test.mjs`(:55), `tui-package-consumer.test.mjs`(:55) | 패키지 내부 reference 경로 |
| T3 | payload Map fixture(`fixtures/install-mode.mjs` 등, plan에서 grep으로 확정) | shared 키 |
| T3 | Python `test_arc_policy.py:1450`, `test_harness_contract.py:572,663`, `test_claude_payload.py:294,380` | shared 경로. `test_claude_payload`의 기존 불일치 가능성은 B3로 처리 |
| T4 | `runtime-versions.test.mjs`(:26,:48,:59) | canonical과 shared 사본 2개 비교 |
| T4 | `runtime-assets.test.mjs`(:32-44) | updater 출력·drift·미관리 파일 검사를 shared에서 |
| T4 | `runtime-installed-entry.test.mjs`(:11), `plan.test.mjs`(:7) | fixture 출처를 shared runtime으로 |
| T4 | `manifest.test.mjs`(:48 관련), `package.test.mjs`·consumer류 runtime 경로 | shared runtime |
| T4 | `fixtures/instruction-contracts.json`(:244-251, :262-283) | `claude/`·`codex/` 쌍(해시 동일)을 `shared/skill/runtime/<name>` 한 키로 합침, 해시 값 불변(O2) |
| T5 | `docs/harness-operation.md:46` | 저장소·패키지 소스 위치(`shared/skill/references/`의 Superpowers 유래 13개 대 플랫폼 `skill/references/`)와 설치 위치(`skills/arc/references/`)를 구분해 서술 |
| T5 | `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/**`(과거 `docs/superpowers/specs|plans/*` 제외) | 현행 설명을 grep으로 확인한 뒤 필요한 곳만 갱신 |

## 7. 수용 기준

| ID | 기준 | 확인 |
|---|---|---|
| AC1 | `shared/skill/references/`에 §3.1의 13개가 있다. `codex|claude/skill/references/`에는 그 13개 이름이 없다 | `git ls-files` |
| AC2 | 추적 runtime 파일은 `shared/skill/runtime/**`에만 있다. `codex|claude/skill/runtime/` 추적 파일은 0개다 | `git ls-files` |
| AC3 | 이동 파일의 blob 해시가 기준 HEAD의 codex 사본과 같다 | `git diff -M --stat e472406`에서 rename 100%, 또는 `git hash-object` |
| AC4 | golden 테스트가 8개 조합 모두 통과한다. T1 이후 T5까지 fixture diff가 0이다(W1·W2는 AC18·AC20) | 테스트, `git diff <T1 commit> <T5 commit> -- tests/node/fixtures/installed-layout-golden.json` |
| AC5 | `composeSkillSources`가 C1·C2·C3 각각에서 `ARC_PAYLOAD_VALIDATION`로 실패하고 메시지에 경로가 있다. 충돌이 없으면 합집합을 반환한다 | 단위 테스트 |
| AC6 | 플랫폼 경로에 reference나 runtime 사본을 다시 넣으면 `verifyPayload`가 실패한다 | `manifest.test.mjs` |
| AC7 | `verifyPayload` 반환에 `referenceTree`가 있고 `referenceTrees`는 없다. `Imported platform parity mismatch` 코드는 삭제됐다 | 테스트, grep |
| AC8 | `validateFlatReferenceFiles(files)`가 shared 접두로 검증하고, 세 접두 모두에서 중첩 `superpowers/`를 거부한다 | `superpowers.test.mjs` |
| AC9 | `refreshPackageReferences`가 `shared/skill/references/*`와 `MANIFEST.sha256`에만 기록한다 | `package-references.test.mjs` |
| AC10 | `node scripts/update-runtime-assets.mjs --check`와 `node scripts/update-manifest.mjs --check`가 성공한다. runtime 출력은 shared에만 있다 | 명령 |
| AC11 | `package.json` `files`에 `shared/skill/`이 있다. `npm pack --dry-run`에 `shared/skill/**`이 포함되고 플랫폼 이동 대상 경로는 없다 | 명령 |
| AC12 | `release-artifact-process.test.mjs`가 기준선 대비 B1·B2를 충족한다(`--test-timeout`) | 명령 |
| AC13 | 각 task 후 Node·Python 전체가 B1~B4를 충족한다 | §5.2 증거 |
| AC14 | 현행 문서(§6 T5 대상)에 이동된 13개나 runtime을 플랫폼 소스 경로로 설명하는 곳이 없다. `docs/superpowers/specs|plans/*`의 기존 파일 diff는 0이다 | grep, `git diff --stat` |
| AC15 | `.git/arc/workflows/arc-consistent-gates`와 `scripts/update-superpowers-local.sh`가 변경되지 않았다 | 존재·내용 확인 |
| AC16 | §2.2 비목표 파일(부분 차이 파일, `REFERENCE_PATH_MAP`, `flattenReferenceBundle`, `artifact.mjs`, `policy/render.mjs`)의 diff가 0이다 | `git diff e472406 -- <paths>` |

## 8. 위험과 대응

| 위험 | 대응 |
|---|---|
| 설치 산출물이 미묘하게 바뀜(누락·추가·순서) | T1 golden(AC4), 결정적 합집합, 충돌 금지 |
| 플랫폼 사본 잔존·재유입 | C1로 조기 실패(AC6), 세 접두 중첩 `superpowers/` 거부(AC8) |
| T2 시점에 `shared/skill/`이 없어 release inventory 실패 | `files` 추가를 T3로 배치(§4.7) |
| MANIFEST 수동 편집·누락 | 생성 스크립트만 사용, `--check`(AC10) |
| 테스트를 완화해 통과시킴 | §2.2 금지, B3·B4, Reviewer 확인 |
| 기준선 실패가 많아 신규 실패가 묻힘 | 이름 기준 비교(B1), 메시지 일치 증거(B3) |
| `.sh` 실행 비트나 모드 손실 | git rename. golden에 모드를 기록할지는 plan에서 확정 |
| contracts fixture 키를 합칠 때 검사 의미가 바뀜 | O2 확인, 해시 값 불변 |
| 무시 파일이 source 모드 테스트를 흔듦 | B3 알려진 원인 1, 파일은 건드리지 않음 |

## 9. Task 개요(세부는 plan)

순차로 진행하며 1 task = 1 focused commit이다. 각 task는 fresh QA를 거친 뒤 Orchestrator가 수락하고 커밋한다. 전체 task를 수락한 뒤 최종 Reviewer가 1회 검토한다.

| ID | 내용 | 선행 | 위험 | 주요 수용 기준 |
|---|---|---|---|---|
| T1 | golden fixture·테스트, 기준선 실패 목록(증거) | — | 낮음 | AC4(생성), §5.2 기록 |
| T2 | 조합 인프라(`skill-sources.mjs`, `verifyPayload`/`renderSkillPayload` 연결, required 추가, `ROOTS`·`update-manifest` 대상에 `shared/skill`, MANIFEST 재생성), 파일 이동 없음 | T1 | 중 | AC5, AC6(합성 fixture), AC4, AC10, AC13 |
| T3 | reference 13개 이동, §4.2(reference 부분)·§4.4·§4.5, `package.json` `files`(§4.7), MANIFEST, 관련 테스트 | T2 | 높음 | AC1, AC3, AC4, AC6–AC13 |
| T4 | runtime 이동(R1), §4.6, runtime 필수 목록, MANIFEST, runtime 테스트·contracts fixture | T3 | 높음 | AC2–AC4, AC6, AC10–AC13 |
| T5 | 현행 문서 갱신 | T4 | 낮음 | AC13–AC16 |
| W1 | 워크트리 공통 계약 분리(codex 디렉터리 안에서만): codex `handoff-worktree.md`를 플랫폼 중립 계약으로 다시 쓰고, Codex 앱 전용 절차를 codex `worktree-creation.md`로 옮긴다. 워크트리 실패 절은 중립 계약으로 옮긴다. Claude 설치본은 변경 0이다 | T5 | 중 | AC18, AC21, AC13 |
| W2 | 중립 계약을 `shared/`로 이동(git rename, 바이트 불변)하고 Claude 워크트리를 활성화한다(§11.4) | W1 | 높음 | AC17, AC19–AC22, AC13 |

W0 Spike는 2026-11-14 수행을 마쳤다(§11.1). 최종 Reviewer는 T1–T5, W1, W2 전체를 대상으로 한다.

## 10. 미결 사항과 보류

- **O2**: `instruction-contracts.json`의 플랫폼 쌍 키를 shared 한 키로 합칠 때, 이 fixture를 쓰는 테스트가 플랫폼별 그룹 구성(키 개수 등)을 단언하는지 plan에서 확인한다. 단언한다면 완화하지 않고 shared 키로 대응시킨다.
- **O3**: 다음은 승인된 설계 범위 안에서 plan이 확정한다: helper 파일명, golden 생성 진입점·필드 스키마, 기준선 증거 저장 위치, 반환 순서.
- **H1**: `.git/arc/workflows/arc-consistent-gates`는 삭제 여부가 미결정이다. 삭제하지 않고 기준선 대비로 진행한다.
- **환경**
  - `scripts/update-superpowers-local.sh`는 사용자 소유이므로 수정·삭제하지 않는다.
  - Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행한다.
  - `release-artifact-process.test.mjs`는 `--test-timeout`을 지정해 실행한다.
- **목록 완전성**: Scouter의 넓은 검색 출력 일부가 잘렸다. 그래서 §6 테스트 목록은 plan 단계에서 `skill/references/<13개>`와 `skill/runtime` grep으로 확정한다.
- **H2 (워크트리)**: W1/W2 착수 전에 plan 단계에서 다음을 확정한다.
  - 워크트리 관련 테스트·fixture 전체 목록(Node, Python). `tests/installer-parity.json` 포함
  - `lib/prompts/agent-fragments.json`과 claude agents의 `handoff-worktree` 참조 여부
  - `scripts/check-installer-parity.mjs` 동작

## 11. Claude 워크트리 실행 경로와 공통화 (D7–D10)

### 11.1 W0 Spike 결과(2026-11-14)
증거: `.git/arc/workflows/platform-shared-refactor/w0-spike-evidence.md`

| ID | 관찰 |
|---|---|
| F1 | `git worktree add -b <branch> .claude/worktrees/<name> <full-sha>`가 성공했다. 등록·HEAD·브랜치·common-dir이 일치한다. 이 저장소는 `.git/info/exclude`에 `.claude/worktrees/`가 이미 있었다 |
| F2 | `EnterWorktree({path})`가 성공했다. 세션 cwd와 toplevel이 워크트리를 가리킨다 |
| F3 | native subagent가 워크트리 cwd를 상속한다 |
| F4 | ARC runtime CLI는 `--cwd <worktree>`로 정상 동작하고, workflow 상태는 common dir에서 공유된다 |
| F5 | 워크트리 격리 세션에서는 git이 들어간 복합 Bash 명령이 거부된다. 단순 git 명령으로 나눠야 하고, source 경로 검사는 진입 전이나 퇴장 후에 한다 |
| F6 | `ExitWorktree({action:"keep"})`는 원래 디렉터리로 돌아가며, 워크트리와 브랜치를 남긴다 |

미검증: 워크트리 cwd에서 Codex bridge(Implementer/QA)를 `run-dispatch`로 실행하는 것. 코드 경로는 `role-supervisor.mjs:33`에 있다. W2 QA에서 확인한다.

### 11.2 Claude 생성 절차(M2)
1. **선택 게이트.** 사용자가 세 번째 경로(관리형 워크트리와 작업 브랜치)를 명시적으로 선택해야 한다. 선택 요청 전에 다음을 제시한다.
   - source 절대 경로·common dir·branch/HEAD 전체 SHA
   - 후보 브랜치와 충돌 여부
   - 이름과 경로 `.claude/worktrees/<name>`
   - 문서 범위
2. **생성 직전 재확인.** source 상태, base SHA, 후보 충돌, 경로가 비어 있는지, `EnterWorktree` 도구가 있는지 확인한다. `.claude/worktrees/`가 무시되는지는 `git check-ignore`로 확인하고, 무시되지 않으면 `.git/info/exclude`에 `.claude/worktrees/`를 추가한다(D9). 하나라도 실패하면 생성하지 않는다.
3. **생성.** `git worktree add -b <approved-branch> .claude/worktrees/<name> <verified-full-sha>`로 만든다.
   - 기존 브랜치 재사용은 공통 계약의 예외 조건에서만 허용하며, `git worktree add .claude/worktrees/<name> <branch>`를 쓴 뒤 HEAD를 검증한다.
   - 다음은 금지한다: `--force`, `-B`, 자동 접미사, 다른 경로나 이름으로 재시도.
4. **진입 전 검증.** 진입 전에 다음을 검증한다.
   - `git worktree list --porcelain` 등록, common-dir 동일성, HEAD=SHA, 브랜치
   - source branch/HEAD/index/files 보존
5. **진입.** `EnterWorktree({path:"<abs>"})`로 진입한 뒤 다음을 단순 명령으로 검증한다(F5): 세션 cwd와 `git rev-parse --show-toplevel`이 대상 realpath와 같은지.
6. **attestation.** runtime에 operator-attested note `type:'worktree-attachment'`를 `{realpath, gitDir, gitCommonDir}`와 함께 기록한다. Claude에서 이 note는 "`EnterWorktree({path})`가 성공했고 세션 cwd와 toplevel이 대상과 같음을 검증했다"는 뜻이다. runtime 스키마와 코드는 바꾸지 않는다(`target-preparation.mjs:19,67`).
7. **역할 실행.**
   - native 역할(Planner/Reviewer)은 세션 cwd를 상속한다(F3).
   - bridge 역할에는 `--cwd <worktree realpath>`를 넘긴다.
   - brief에는 워크트리 절대 경로를 적는다.
8. **종료와 정리.**
   - 작업이 끝나면 `ExitWorktree({action:"keep"})`로만 돌아간다.
   - 자동 정리(`ExitWorktree remove`, `git worktree remove/prune`, 브랜치 삭제)는 금지한다. 삭제는 사용자가 명시적으로 지시할 때만 Orchestrator가 수행한다.
9. **실패 처리.** 부분 완료(브랜치만 생성, 등록 후 진입 실패 등)에서는 Stop and inspect 절차를 따른다. 자동 재시도, fallback(M1/M3), 삭제는 하지 않는다.

### 11.3 공통화 구조
아래는 W2 완료 시점의 구조다. `shared/skill/**`은 두 플랫폼 설치본에 모두 합성된다(§4.1). 그래서 W1에서는 중립 계약을 codex 디렉터리 안에서만 만들고, `shared/`로 옮기는 rename은 Claude 생성 절차가 함께 들어가는 W2에서 한다. 이렇게 하면 W1 동안 Claude 설치본에 링크가 끊긴 파일이 들어가지 않는다.

```
shared/skill/references/handoff-worktree.md   # 공통 계약(신규 shared, 바이트 1벌)
codex/skill/references/worktree-creation.md   # Codex 생성 절차(mcp__codex_app__*)
claude/skill/references/worktree-creation.md  # Claude 생성 절차(M2, §11.2)
```

**shared `handoff-worktree.md`(플랫폼 중립)에 들어가는 내용**
- 명시적 선택 게이트
- base는 검증된 전체 SHA만 사용한다. 원격·기본 브랜치·fetch는 금지한다.
- 생성 직전 재확인, 후보·충돌 검증, 자동 접미사 금지, 기존 브랜치 재사용 예외
- "생성은 [worktree-creation](worktree-creation.md)만 사용"
- 생성 후 검증 1–5. "앱 관리·현재 대화 첨부"는 "플랫폼 attachment 증거(worktree-creation에서 정의)"로 일반화한다.
- 미커밋 문서 규칙과 `#worktree-document-transfer`
- codex `git-recovery.md:37-44`의 워크트리 실패 절을 중립화해 `#worktree-failures-and-partial-completion`로 옮긴다.
- 기존 anchor(`#managed-worktree-handoff-contract`, `#new-managed-worktree`, `#worktree-document-transfer`)는 유지한다.

**플랫폼 `worktree-creation.md`에 남는 내용**
- Codex: 앱이 경로를 정하는 방식, `mcp__codex_app__create_worktree`/`get_worktree_creation_status`/`attach_worktree`, raw Git fallback 금지, 앱 attachment 의미
- Claude: §11.2 절차, 경로 정책, `EnterWorktree`/`ExitWorktree keep`, F5 명령 제약, attachment 의미

**D1/P1과의 관계**
- `handoff.md`, `handoff-prep.md`, `SKILL.md`, `planning.md`, `git-recovery.md`는 플랫폼별로 유지한다.
- 이 파일들에 들어가는 워크트리 관련 문장은 가능하면 두 플랫폼에서 같은 문장으로 쓴다.
- 공통화로 생기는 충돌은 §4.1 C1이 막는다. codex 쪽 `handoff-worktree.md`가 남아 있으면 `verifyPayload`가 실패한다.

### 11.4 변경 대상
- **claude**
  - `handoff-prep.md:4`의 "Claude v1 supports current checkout only…"를 세 선택지로 바꾼다. "워크트리를 fallback으로 생성·첨부 금지"는 유지한다.
  - `handoff-prep.md:21` 선택지 제시 문구를 바꾼다. 경로는 `.claude/worktrees/<name>`를 제시한다.
  - `handoff-prep.md`의 준비 mutation과 문서 커밋 절에 워크트리 검증 문장을 넣는다(codex :26/:70에 대응).
  - `handoff.md:27`, `:92`를 codex와 같은 의미로 바꾼다.
  - `SKILL.md`에 `handoff-worktree` 참조 행을 추가한다(codex :49에 대응).
  - `planning.md`에 관리형 워크트리 준비 절을 넣는다(codex 대응 절).
  - `git-recovery.md`에서 shared 실패 절로 링크한다.
  - agents 참조 문장이 필요한지는 H2로 확정한다.
- **codex**
  - `git-recovery.md:37-44`를 shared 절 링크로 바꾸고, 앱에 특화된 문장만 남긴다.
  - `SKILL.md:49` 행은 유지한다. 설치되는 상대 경로가 같기 때문이다.
- **정책 렌더**
  - `POLICY_TARGETS` 파일은 관리 블록 밖에서만 수정한다.
  - role-policy 변경은 필요 없다. `git.specialists-deny`는 유지한다.
  - 관리 블록을 바꿔야 한다면 `lib/policy/role-policy.json`을 고친 뒤 생성기로 재생성한다.
- **runtime**
  - 코드 변경은 없다.
  - Claude 시나리오 회귀 테스트(`.claude/worktrees` 워크트리 + attachment note)를 runtime 테스트에 추가한다.
- **테스트**
  - `tests/test_harness_contract.py:166` `NATIVE_WORKTREE["claude"]`를 워크트리 지원 패턴으로 바꾼다.
  - "Codex에만 있음"이나 "Claude에는 없음"을 가정하는 테스트를 갱신한다(H2 목록).
  - `instruction-contracts.json` 관련 해시를 갱신한다.
- **문서**
  - `docs/harness-operation.md:154`: 두 플랫폼 모두 세 선택지를 제공하고, 생성 방식만 다르다고 적는다.

### 11.5 순서
T1–T5 → W1 → W2. W0은 완료했다. 각 task마다 fresh QA를 거치고, 전체가 끝나면 최종 Reviewer가 한 번 검토한다.

### 11.6 golden 의도 갱신 규칙
- W1과 W2만 golden fixture를 갱신할 수 있다.
- 각 task는 경로별 예상 diff 목록을 plan에 미리 적는다. QA는 실제 golden diff와 1:1로 대조한다. 예상 밖의 경로가 바뀌거나 예상한 변경이 누락되면 실패다.
- 예상 diff:
  - W1: codex는 `references/handoff-worktree.md` 바이트 변경, `references/worktree-creation.md` 추가, `references/git-recovery.md` 변경. claude는 변경 0
  - W2: claude는 `references/handoff-worktree.md`·`references/worktree-creation.md` 추가, `SKILL.md`·`handoff.md`·`handoff-prep.md`·`planning.md`·`git-recovery.md` 변경. codex는 변경 0(shared 이동이 바이트 불변이므로). agents는 변경 0(H2: claude agents에 `handoff-worktree` 참조 없음, 대칭화하지 않음).

### 11.7 워크트리 수용 기준
| ID | 기준 | 확인 |
|---|---|---|
| AC17 | (W2) `shared/skill/references/handoff-worktree.md`가 있고 `codex/skill/references/handoff-worktree.md`는 없다. 기존 anchor 3개와 실패 절 anchor를 유지한다. W1에서는 codex 파일에서 anchor 유지만 확인한다 | `git ls-files`, 링크·anchor 테스트 |
| AC18 | W1 golden diff가 §11.6 W1 예상 목록과 정확히 일치하고, claude 조합 diff는 0이다 | golden 테스트, QA 대조 |
| AC19 | claude `handoff-prep.md`에 세 선택지가 있고 "current checkout only" 문구가 없다. `worktree-creation.md`에 §11.2의 1–9가 모두 있다 | grep, `test_harness_contract.py` |
| AC20 | W2 golden diff가 §11.6 W2 예상 목록과 정확히 일치한다 | golden 테스트, QA 대조 |
| AC21 | 정책 관리 블록 stale 검사가 통과한다 | 기존 policy 테스트 |
| AC22 | runtime 회귀 테스트가 Claude 시나리오(`.claude/worktrees` 등록 + attachment note)에서 worktree intent를 수락한다. 워크트리 cwd에서 bridge dispatch가 동작한다(QA 실행 증거) | 테스트, QA |
