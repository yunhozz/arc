# 플랫폼 공통 자산(`shared/`) 리팩토링 구현 계획

> **에이전트 작업자용:** ARC 실행 규칙을 따른다.
> - 구현: task마다 fresh Implementer
> - 검증: task마다 fresh QA
> - 수락과 커밋: Orchestrator가 판단하고, 수락한 task마다 focused commit 1개를 만든다. Implementer는 커밋하지 않는다.
> - 최종 Reviewer: 모든 task를 수락한 뒤 전체 변경을 한 번 검토한다.
>
> 단계는 체크박스(`- [ ]`)로 추적한다.

**목표:** 두 플랫폼에 바이트가 같은 사본으로 있는 파일을 `shared/skill/`에 한 벌만 두고, 설치할 때 합친다. 대상은 Superpowers에서 가져온 reference 13개와 `skill/runtime/**`다. 설치 결과물은 바뀌지 않아야 한다. 이어서 Claude에도 관리형 워크트리 실행 경로를 추가하고, 워크트리 공통 계약을 `shared/`로 모은다.

**구조:**
- 새 모듈 `lib/installer/skill-sources.mjs`가 `shared/skill/**`과 `<platform>/skill/**`의 합집합을 만든다. 경로가 충돌하면 실패한다. `verifyPayload`와 `renderSkillPayload`가 이 모듈을 쓴다.
- T1에서 리팩토링 전 설치 결과물을 golden fixture로 고정하고, 이후 모든 task의 회귀 기준으로 쓴다.
- 파일 이동은 git rename으로 하고, `MANIFEST.sha256`는 생성기로만 다시 만든다.

**기술 스택:** Node ≥22 ESM, `node:test`, Python 3 `unittest`(`tests/*.py`), safe-fs native(`build/native`), Git.

**Spec:** `docs/superpowers/specs/2026-11-14-shared-platform-assets-design.md`. 2026-11-14 승인본이며, 같은 날 O-P2 개정분도 재승인되었다.

## 전역 제약

- **작업 위치:** `/Users/yunho/Desktop/project/arc`, 브랜치 `refactor/shared-platform-assets`, 기준 HEAD `e472406fa74f7dc8a54f18716b9ac413a926280c`. 워크트리가 아닌 현재 체크아웃에서 작업한다.
- **순서:** T1 → T2 → T3 → T4 → T5 → W1 → W2. 반드시 하나씩 순서대로 하고, task 1개는 focused commit 1개다.
- **수정·삭제 금지:**
  - `scripts/update-superpowers-local.sh`
  - `.git/arc/workflows/arc-consistent-gates`
  - `docs/superpowers/specs|plans/*`의 기존 파일
- **diff 0을 유지할 대상:**
  - `lib/policy/render.mjs` (`POLICY_TARGETS` 포함)
  - `lib/release/artifact.mjs`
  - `REFERENCE_PATH_MAP`, `flattenReferenceBundle`
- **`POLICY_TARGETS` 파일**(플랫폼 `SKILL.md`, agents, `coordination|planning|handoff|handoff-prep|commit|verification.md`): 관리 블록 밖에서만 고친다. 관리 블록은 `node scripts/update-role-policy.mjs`로만 재생성한다.
- **`MANIFEST.sha256`:** `node scripts/update-manifest.mjs`로만 재생성한다. 직접 편집은 금지한다.
- **테스트 완화 금지:**
  - 금지: assertion 삭제, 정규식 완화
  - 허용: 경로·키 교체, 플랫폼별 반복을 shared 단일 대상으로 바꾸기
- **`tests/installer-parity.json`:** 여기에 매핑된 테스트는 이름과 파일 경로를 바꾸지 않는다. 본문만 고친다.
- **golden fixture `tests/node/fixtures/installed-layout-golden.json`:**
  - T1에서 한 번 생성한다.
  - T2–T5에서는 diff 0이어야 한다.
  - W1·W2에서는 spec §11.6 예상 목록과 1:1로 맞을 때만 갱신한다.
- **Python:** 항상 `PYTHONDONTWRITEBYTECODE=1`로 실행한다. 이 환경에는 pytest가 없으므로 `unittest`를 쓴다(O-P1 결정).
- **Node 전체 실행:** `--test-timeout=180000`을 쓴다. 기준선부터 마지막 task까지 같은 값이어야 한다.

## 표준 명령 (모든 task 공통)

**N-ALL** — Node 전체. `package.json` `test` 스크립트와 같은 glob을 쓴다.

```
node --test --test-timeout=180000 --test-reporter=tap tests/node/*.test.mjs > <out>/node.tap 2>&1
```

**P-ALL** — Python 전체. 저장소 parity 검사기(`scripts/check-installer-parity.mjs:56`)와 같은 실행기다.

```
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -v > <out>/python.txt 2>&1
```

**CHK** — 생성물과 parity 검사

```
node scripts/update-manifest.mjs --check
node scripts/update-runtime-assets.mjs --check
node scripts/update-role-policy.mjs --check
node scripts/check-installer-parity.mjs
```

**GOLD** — golden 검사. T2–T5에서는 `--diff` 출력이 비어 있어야 한다.

```
node --test --test-timeout=180000 tests/node/installed-layout-golden.test.mjs
node tests/node/fixtures/installed-layout.mjs --diff
```

**실패 이름 추출**
- Node: TAP의 `not ok <n> - <name>` 줄과 그 아래 YAML `error:`의 첫 줄
- Python: unittest `-v` 출력의 `^(FAIL|ERROR): <test> \(<id>\)` 줄과 그 블록의 마지막 예외 줄
- 이름 기준 다중집합으로 비교한다(B1–B3).

**증거 저장 위치** (커밋하지 않음)
- 기준선: `.git/arc/workflows/platform-shared-refactor/baseline/`
- task별: `.git/arc/workflows/platform-shared-refactor/tasks/<ID>/`
- QA는 결과를 자기 dispatch 산출물에 남기고, 위 위치로 옮기는 일은 Orchestrator가 한다.

## Review Focus

1. **잔존·재유입 사본:** 패키지에 플랫폼 사본(`<platform>/skill/references/brainstorming.md`, `<platform>/skill/runtime/*.mjs`)이 남아 있거나 다시 들어온 경우. install·upgrade·status가 모두 일찍 실패해야 한다. 오류는 `ARC_PAYLOAD_VALIDATION`이고 메시지에 해당 경로가 들어 있어야 한다. 시험 위치: T2(합성 C1), T3, T4.
2. **`shared/skill` 전체 부재:** T3 이후에 손상된 패키지에서 `shared/skill`이 통째로 없는 경우. 일부만 설치되고 조용히 넘어가면 안 되고 실패해야 한다. 시험 위치: T3에서 디렉터리를 제거했을 때 실패하는지.
3. **`shared/skill` 안의 symlink, `.DS_Store`, 특수 파일:** symlink와 특수 파일은 지금처럼 거부되고, 일반 파일 `.DS_Store`는 지금처럼 무시되어야 한다. 시험 위치: T2(`.DS_Store`), T3(escaping link를 shared로 옮긴 테스트).
4. **`.sh` 실행 비트:** rename 후 `scripts/start-server.sh`와 `stop-server.sh`의 git 모드가 100755를 유지해야 한다. 설치 시 모드는 transaction이 정하므로 golden에는 모드를 기록하지 않는다. 시험 위치: T3 QA의 `git ls-files -s` 대조.
5. **`ko` 렌더와 profiles `omit` 조합:** 합치는 순서나 덮어쓰기에서 차이가 생기는지. 파일 집합은 `en`과 같고 SKILL.md의 언어 정책만 달라야 한다. 시험 위치: T1 golden 8조합.

---

## 실행 모델과 공통 수락 절차

**Implementer**
- 지정된 파일만 수정한다.
- stage, commit, branch 조작은 하지 않는다. `git mv`와 `git rm`도 index를 바꾸므로 역할 계약상 Git 상태 변경에 해당한다.
- 그래서 파일 이동은 Implementer가 파일시스템 명령(`mv`·`rm`)으로 하고, rename 기록은 Orchestrator가 커밋할 때 `git add -A <경로>`로 남긴다. rename이 제대로 감지됐는지는 AC3로 확인한다.

**QA** (task마다 fresh)
- task의 "필수 QA"를 실행하고 B1–B4를 판정한다.
- golden diff를 대조하고 증거를 보고한다.

**Orchestrator**
- 기준과 증거를 확인해 수락한다.
- 해당 task 경로만 stage해 focused commit을 만든다. 메시지는 저장소 관례대로 `type(scope): 한국어 설명`이다.

**최종 Reviewer**
- W2를 수락한 뒤 `e472406..HEAD` 전체를 한 번 검토한다.
- 지적 사항은 Implementer → Reviewer 순서로 다시 확인한다(QA 재배정 없음).
- 수정은 확인이 끝날 때까지 커밋하지 않는다. 해소되면 commit 규칙에 따라 커밋한다.

---

### Task T1: golden 설치 레이아웃과 기준선 실패 기록

**목표:** 리팩토링 전 동작(HEAD `e472406`)의 설치 결과물을 8개 조합의 golden fixture로 고정한다. Node·Python 기준선 실패 목록도 증거로 남긴다.

**파일**
- 생성: `tests/node/fixtures/installed-layout.mjs` (생성·비교 helper와 CLI)
- 생성: `tests/node/installed-layout-golden.test.mjs`
- 생성: `tests/node/fixtures/installed-layout-golden.json` (CLI `--write`로만 생성)
- 증거(커밋 안 함): `.git/arc/workflows/platform-shared-refactor/baseline/`에 `node.tap`, `python.txt`, `node-failures.txt`, `python-failures.txt`, `npm-pack.json`, `protected-untouched.sha256`

**선행:** 없음

**인터페이스** (이후 task가 사용)

- `export const GOLDEN_PATH: string` — `tests/node/fixtures/installed-layout-golden.json`의 절대 경로
- `export const COMBINATIONS: ReadonlyArray<{platform:'codex'|'claude', profiles:'write'|'omit', language:'en'|'ko'}>`
  - 8개다. 조합 키는 `${platform}/${profiles}/${language}`다.
- `export function copyPackageSource(destination: string): void`
  - 저장소 루트에서 다음을 `destination`으로 복사한다: `README.md`, `install.command`, `package.json`, `package-lock.json`, `bin`, `lib`, `scripts`, `vendor`, `prebuilds`, `native`, `codex`, `claude`, 그리고 있으면 `shared`.
  - 제외: `scripts/update-superpowers-local.sh`, `__pycache__`, `.DS_Store`
  - 복사 후 `scripts/update-manifest.mjs --root destination`을 실행한다.
- `export function computeInstalledLayout({packageRoot: string, safeFs}): Record<string, Record<string,string>>`
  1. `verifyPayload({packageRoot, safeFs, payloadMode:'package'})`를 한 번 호출한다.
  2. 조합마다 새 임시 home(`fs.mkdtempSync`)을 만든다.
  3. `resolveTarget(platform,{userHome:home, env:{}, cwd:home})`로 대상을 정한다.
  4. `buildInstallPlan({payload, target, profiles, language, safeFs, skipGlobal:true})`로 설치 계획을 만든다.
  5. 결과를 다음 키로 모은다.
     - `plan.generated.skill`의 항목 → `skills/arc/<rel>`
     - `profiles==='write'`이면 `plan.profileWrites`의 항목 → `agents/<name>`
  6. 값은 sha256 hex, 키는 사전순 정렬이다. 반환 전에 임시 home을 지운다.
- CLI: `node tests/node/fixtures/installed-layout.mjs --write | --diff`
  - `--write`: 임시 복사본으로 계산해 `GOLDEN_PATH`에 쓴다. 형식은 `{"version":1,"combinations":{...}}`, 들여쓰기 2칸, 끝 개행이다.
  - `--diff`: 현재 결과를 fixture와 비교해 `+|-|~ <조합키> <relativePath>` 줄을 정렬해 출력한다. 종료 코드는 항상 0이다.

**O3 확정 사항**
- helper 파일명: `lib/installer/skill-sources.mjs` (T2에서 생성)
- golden 진입점: 임시 복사본에 package 모드 `verifyPayload`, 그리고 `buildInstallPlan(skipGlobal:true)`
- 비결정 입력 고정: 임시 home, `env:{}`, 전역 설정 생략, 기본 limits, payload `models.toml`
- 파일 모드는 기록하지 않는다.
- 기준선 증거는 `.git/arc/`에 두고 커밋하지 않는다.

**단계**

- [x] **Step 0 (QA, 코드 수정 전): 기준선 측정**
  - HEAD가 `e472406`이고 추적 파일 변경이 0인지 확인한다. 미추적 spec·plan은 허용한다.
  - N-ALL, P-ALL을 실행하고 실패 이름과 첫 메시지 줄을 뽑는다.
  - `npm pack --dry-run --json`을 실행한다.
  - 보호 대상의 해시를 기록한다:
    ```
    find .git/arc/workflows/arc-consistent-gates -type f -exec shasum -a 256 {} +
    shasum -a 256 scripts/update-superpowers-local.sh
    ```
  - 예상: Node 실패 약 68건, Python 실패 약 563건. 알려진 원인은 local updater, arc-consistent-gates, `plan.test.mjs` 8건이다. Python 건수는 unittest 기준으로 다시 잰다. 결과는 Orchestrator가 `baseline/`에 저장한다.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/node/installed-layout-golden.test.mjs`)
  - `golden fixture covers exactly the 8 approved combinations` — `Object.keys(golden.combinations).sort()`가 8개 조합 키와 deepEqual이다.
  - `current installed layout matches the golden fixture for every combination` — 임시 복사본으로 계산한 `computeInstalledLayout` 결과가 `golden.combinations`와 deepEqual이다(키 집합과 해시 모두).
  - `installed layout is deterministic across homes and runs` — 두 번 계산한 결과가 deepEqual이다.
  - `golden comparison detects a single changed installed byte` — 복사본의 `codex/skill/references/limits.md` 끝에 `x`를 붙이고 manifest를 갱신한 뒤 다시 계산한다. codex 4개 조합의 `skills/arc/references/limits.md`만 달라지고, 나머지 키와 값은 같아야 한다.

- [x] **Step 2: 실패 확인**
  - `node --test tests/node/installed-layout-golden.test.mjs`
  - 예상: FAIL. fixture가 없으므로 `ENOENT ... installed-layout-golden.json`.

- [x] **Step 3: `tests/node/fixtures/installed-layout.mjs` 구현**
  - 위 인터페이스대로 만든다. native는 `loadNative({artifactDirectory:'build/native'})`로 불러온다.

- [x] **Step 4: fixture 생성**
  - `node tests/node/fixtures/installed-layout.mjs --write`
  - 확인: 조합 8개가 있고, `ko` 조합의 `skills/arc/SKILL.md` 해시가 `en`과 다르다.

- [x] **Step 5: 통과 확인**
  - `node --test tests/node/installed-layout-golden.test.mjs` → PASS(4건)
  - `--diff` 출력이 비어 있다.

**수용 기준:** AC4(생성), §5.2(기준선 기록), AC13(B1–B4), AC15

**필수 QA**
- GOLD, CHK
- N-ALL, P-ALL로 B1–B4를 판정한다. 이번에 생긴 파일은 테스트 파일뿐이므로 신규 실패는 0이어야 한다.
- `git status --porcelain`에 T1 파일 3개와 미추적 문서만 있다.
- AC15 해시 대조

**보류 조건:** fixture에 home 경로 같은 비결정 값이 섞이면(결정성 테스트 실패) 수락을 보류한다.

**진행 기록 (2026-11-14, 수락):**
- 기준선(Step 0): QA dispatch 901f3218 segment 2에서 측정했다. Codex QA sandbox 환경 기준이다. 결과는 Node not ok 105건, Python 실패 블록 564건이다. 같은 환경에서만 비교한다.
- 구현: Implementer dispatch c33260e8. RED(ENOENT)를 확인한 뒤 GREEN(4/4)이 됐다. 계획 대비 API 편차는 없다.
- QA(segment 3) 결과
  - GOLD: 2회 통과했고 `--diff` 출력이 비어 있다.
  - manifest, runtime, role-policy `--check`: 모두 통과
  - B1/B2: 신규 실패와 해소된 실패가 모두 0건이다.
  - B3/B4: 입증됨
  - AC15: 보호 대상 해시가 일치한다.
- 처분 기록
  - `check-installer-parity.mjs` 실패(`Original assertion inventory changed`)는 커밋된 HEAD c38c264 사본에서도 재현되는 기존 실패다.
  - `role-bridge-resume`/`role-bridge-run`은 기준선과 이번 실행 모두 180s timeout이 났다. 이 두 파일의 범위는 B1/B2 미검증으로 남긴다(T1과 무관).
  - 실행 중 사용자 쪽 외부 ref 변경(master merge/push)으로 refsChanged가 감지됐다. 작업 트리와 HEAD는 영향받지 않았다.

---

### Task T2: 조합 인프라 (파일 이동 없음)

**목표:** `composeSkillSources`를 도입하고 `verifyPayload`와 `renderSkillPayload`에 연결한다. `shared/skill`을 manifest 검증·생성 대상에 넣는다.

**파일**
- 생성: `lib/installer/skill-sources.mjs`
- 생성: `tests/node/skill-sources.test.mjs`
- 수정: `lib/installer/manifest.mjs`
  - :10 `ROOTS`에 `'shared/skill'` 추가
  - :40 다음에 compose 호출 추가
  - :44 `required`에 `'lib/installer/skill-sources.mjs'` 추가
- 수정: `lib/installer/plan.mjs:31-33` (`renderSkillPayload`)
- 수정: `scripts/update-manifest.mjs:20` — 방문 목록에 `'shared/skill'` 추가
- 수정: `tests/node/manifest.test.mjs` — 테스트 추가
- 재생성: `MANIFEST.sha256`

**선행:** T1

**인터페이스** (이 task가 제공)
- `export const SHARED_SKILL_PREFIX = 'shared/skill/'`
- `export const GENERATED_SKILL_FILES = Object.freeze(['SKILL.md','models.toml','settings.toml','limits.toml'])`
- `export function composeSkillSources(files: Map<string,Buffer>, platform: 'codex'|'claude'): Map<string,Buffer>`
  - 반환 순서는 상대경로의 코드 유닛 사전순(`a<b`)이다. `renderManifest`와 같은 비교다.
  - 값은 `Buffer.from`으로 만든 사본이다.

**오류 규칙**
- `composeSkillSources`는 일반 `Error`를 던진다. 메시지는 다음 중 하나다.
  - `Invalid skill source files`
  - `Invalid skill source platform: <p>`
  - `Skill source conflict (C1 same path): <rel>`
  - `Skill source conflict (C2 generated file): <rel>`
  - `Skill source conflict (C3 file/directory prefix): <a> vs <b>`
- 검사 순서는 C1 → C2 → C3다. C2는 `GENERATED_SKILL_FILES` 이름 자체와 `<name>/` 아래 경로를 모두 잡는다.
- 호출하는 쪽에서 감싼다. 어느 쪽이든 최종 `code`는 `'ARC_PAYLOAD_VALIDATION'`이다.
  - `verifyPayload`: 기존 바깥 catch(:60)가 감싸 `Payload verification failed: ...`가 된다.
  - `renderSkillPayload`: `try{...}catch(cause){throw new PayloadValidationError(\`Payload skill composition failed: ${cause.message}\`,{cause});}`

**단계**

- [x] **Step 1: 실패하는 단위 테스트 작성** (`tests/node/skill-sources.test.mjs`)
  - `composes shared and platform files as a sorted union`
    - 입력 키: `shared/skill/references/a.md`, `codex/skill/SKILL.md`, `codex/skill/references/b.md`, `claude/skill/x`
    - codex 결과가 정확히 `['SKILL.md','references/a.md','references/b.md']` 순서다.
    - 바이트는 같고, 반환된 Buffer는 입력과 다른 객체다.
  - `C1 rejects identical shared and platform path` — `throws(/C1.*references\/a\.md/)`
  - `C2 rejects shared generated files and their subpaths`
    - `shared/skill/settings.toml` → `/C2.*settings\.toml/`
    - `shared/skill/SKILL.md/x` → `/C2/`
  - `C3 rejects file/directory prefix conflicts in both directions`
    - shared에 `references` 파일, 플랫폼에 `references/x.md` → `/C3.*references/`
    - 플랫폼에 `runtime` 파일, shared에 `runtime/x.mjs` → `/C3/`
  - `rejects invalid platform and non-Map input` — `'shared'`, `undefined`, 일반 객체
  - `ignores other platform files` — claude 키는 codex 결과에 없다.
  - `is order independent` — 입력 삽입 순서를 뒤집어도 결과가 deepEqual이다.

- [x] **Step 2: 실패 확인**
  - `node --test tests/node/skill-sources.test.mjs`
  - 예상: FAIL (`Cannot find module .../skill-sources.mjs`)

- [x] **Step 3: `manifest.test.mjs`에 실패하는 테스트 추가** (기존 `fixture()`와 `refresh()`를 쓴다)
  - `payload rejects shared and platform duplicate skill path (C1)`
    - `shared/skill/references/limits.md`에 `codex/skill/references/limits.md`의 바이트를 쓰고 refresh한다.
    - `throws(e=>e.code==='ARC_PAYLOAD_VALIDATION'&&/C1/.test(e.message)&&e.message.includes('references/limits.md'))`
  - `payload rejects shared generated skill file (C2)` — `shared/skill/settings.toml`을 만들고 refresh한다. 같은 code이고 메시지에 `settings.toml`이 있다.
  - `payload rejects shared file/directory prefix conflict (C3)` — `shared/skill/references`를 일반 파일로 만들고 refresh한다. 같은 code이고 메시지에 `references`가 있다.
  - `payload ignores a regular shared .DS_Store` — `shared/skill/.DS_Store`를 일반 파일로 둔다. `verify(root).files instanceof Map`이다.
  - `payload requires lib/installer/skill-sources.mjs even with a regenerated manifest` — 파일을 지우고 refresh한다. 메시지에 `Required runtime asset is missing: lib/installer/skill-sources.mjs`가 있다.

- [x] **Step 4: 실패 확인**
  - `node --test tests/node/manifest.test.mjs`
  - 예상: 새 테스트 5건 FAIL. 기존 실패는 기준선과 같아야 한다.

- [x] **Step 5: `skill-sources.mjs` 구현과 연결**
  - `manifest.mjs`
    - :10 `ROOTS`에 `'shared/skill'`을 넣는다.
    - :40 바로 뒤에 `for(const platform of ['codex','claude'])composeSkillSources(files,platform);`를 넣는다.
    - `required`에 새 모듈을 추가한다.
  - `plan.mjs` `renderSkillPayload`
    - 플랫폼 접두 루프를 `composeSkillSources(payload.files,target.platform)`로 바꾸고 위 오류 규칙대로 감싼다.
    - 그 뒤의 `SKILL.md`·`settings.toml`·`models.toml`·`limits.toml` 설정은 그대로 둔다.
  - `update-manifest.mjs:20`에 `'shared/skill'`을 넣는다.

- [x] **Step 6: manifest 재생성**
  - `node scripts/update-manifest.mjs`, 이어서 `--check` → `Protected payload manifest verified`
  - diff는 `lib/installer/skill-sources.mjs` 줄 추가뿐이어야 한다.

- [x] **Step 7: 통과 확인**
  - skill-sources, manifest, plan 테스트를 실행한다. 새 테스트는 PASS여야 한다.
  - `plan.test.mjs`는 기준선의 8건 실패가 그대로 남는다.

**수용 기준:** AC5, AC6(합성), AC4(golden diff 0), AC10, AC13

**필수 QA**
- `node --test --test-timeout=180000 tests/node/skill-sources.test.mjs tests/node/manifest.test.mjs tests/node/plan.test.mjs`
- GOLD(`--diff` 비어 있음), CHK
- N-ALL, P-ALL로 B1–B4
- `git diff --stat`에 위 파일과 `MANIFEST.sha256`만 있다.
- T1 커밋 대비 `tests/node/fixtures/installed-layout-golden.json`의 diff가 비어 있다.

**진행 기록 (2026-11-14, 수락):**
- 기준 변경: 사용자 요청으로 T2 시작 전에 origin/master(ee2127a, watch 수정)를 merge했다(merge 커밋 2aec9f4). merge 후 기준선은 QA 271623b4 Phase A에서 다시 측정했다(baseline2). 결과는 Node not ok 106건이고, 기존 105건에 HEAD 의존 실패 `runtime-acceptance.test.mjs:72` 1건이 더해졌다. 이 1건은 HEAD가 merge 커밋일 때만 실패한다. Python은 564건이다.
- 구현: Implementer c6b15d46. 첫 실행은 없는 파일을 조회하다 중단됐고, 같은 Implementer를 재개했다. RED를 확인한 뒤 GREEN이 됐다(신규 13건).
- QA(271623b4 Phase B)
  - focused 실패 25건: 모두 기준선에 있던 이름이다.
  - 입증: AC4(golden diff 0), AC5, AC6(합성 fixture). manifest·runtime·role-policy `--check` 통과.
  - B1/B2: 신규 실패와 해소 실패 모두 0건이다.
  - B3: Orchestrator가 메시지 대조로 확인했다(`EEXIST` symlink, `codex/skill/runtime/role-policy.json`이 기준선과 동일).
  - AC15: Orchestrator가 정렬 비교로 동일함을 확인했다.
  - B4: 입증
- 처분 기록
  - `MANIFEST.sha256` diff는 새 모듈 1줄 추가에 더해, 수정된 보호 파일 3개(`manifest.mjs`, `plan.mjs`, `update-manifest.mjs`)의 해시 갱신을 포함한다. 생성기 출력이므로 정상이다. Step 6의 "추가만" 문구는 부정확했다.
  - parity 검사 실패는 기존과 같다.
  - `role-bridge-*` timeout 범위는 미검증이다(기준선과 동일).

---

### Task T3: reference 13개를 `shared/`로 이동

**목표:** spec §3.1의 13개를 `shared/skill/references/`로 옮긴다. reference 검증, updater, 동적 경계를 shared 하나만 보도록 바꾸고 `package.json` `files`를 갱신한다.

**파일**
- **이동** (바이트 불변. `mv` 후 Orchestrator가 `git add -A`) — 같은 상대경로를 유지하며 `codex/skill/references/`에서 `shared/skill/references/`로:
  - `brainstorming.md`, `builder-check-prompt.md`, `test-driven-development.md`, `visual-companion.md`, `writing-good-tests.md`, `writing-plans.md`
  - `superpowers-LICENSE`, `superpowers-provenance.json`
  - `scripts/frame-template.html`, `scripts/helper.js`, `scripts/server.cjs`, `scripts/start-server.sh`, `scripts/stop-server.sh`
- **삭제:** 위 13개에 대응하는 `claude/skill/references/` 파일
- **수정 (코드)**
  - `lib/installer/manifest.mjs` — :30 `referenceTrees`, :41-42, :59 (spec §4.2의 reference 부분)
  - `lib/installer/superpowers.mjs` — :11 `DYNAMIC_ROOTS`, :126-130 `validateFlatReferenceFiles`
  - `lib/installer/package-references.mjs` — :14, :27
  - `package.json` — :27 `files`에서 `"codex/skill/"` 앞에 `"shared/skill/"` 추가
- **수정 (Node 테스트)**
  - `tests/node/manifest.test.mjs` — :7(복사 목록에 `'shared'`), :28, :39, :41-46, :47, :48
  - `tests/node/package-references.test.mjs` — :6, :8, :12
  - `tests/node/fixtures/static-references.mjs` — :8, :9, :11
  - `tests/node/superpowers.test.mjs` — :4, :14, :18
  - `tests/node/visual-companion.test.mjs` — :4, :11
  - `tests/node/management-operations.test.mjs` — :9, :33
  - `tests/node/upgrade-harness.test.mjs` — :62, :83
  - `tests/node/package.test.mjs` — :22
  - `tests/node/consumer.test.mjs` — :55
- **수정 (Python 테스트)**
  - `tests/test_arc_policy.py` — :1448-1466
  - `tests/test_harness_contract.py` — :572-575(링크 검사 대상에 `shared/skill/references/*.md` 추가), :663-665
  - `tests/test_claude_payload.py` — :294-296, :380
- **조건부 수정:** `docs/harness-operation.md`. `test_maintained_local_links_resolve`가 깨지는 경우에만, 옮겨진 13개를 가리키는 링크 경로를 고친다. 설명 문장은 T5에서 바꾼다.
- **재생성:** `MANIFEST.sha256`

**선행:** T2

**인터페이스** (변경)
- `validateFlatReferenceFiles(files: Map<string,Buffer>): {provenance, entries}`
  - 인자는 1개, 접두는 `shared/skill/references/`다.
  - 다음 세 접두 아래의 `superpowers/`는 모두 `Unexpected nested reference payload`로 거부한다: `shared/skill/references/superpowers/`, `codex/skill/references/superpowers/`, `claude/skill/references/superpowers/`
  - Map이 아니면 `Invalid flat reference input`으로 거부한다.
- `DYNAMIC_ROOTS = ['codex/skill/references/superpowers','claude/skill/references/superpowers','shared/skill/references/superpowers']`
- `verifyPayload`의 반환은 `{packageRoot, files, modelInputs, agentRegistry, snapshot, referenceTree}`다. `referenceTrees`는 없다.
- `refreshPackageReferences`는 `shared/skill/references/<destination>` 13개와 `MANIFEST.sha256`에만 쓴다.

**테스트 갱신 규칙** (O2·§6 확정)

`manifest.test.mjs`
- :28 — 순회 대상을 `codex/skill/references`와 `shared/skill/references`의 `.md` 양쪽으로 넓힌다. 기존 범위보다 좁아지면 안 된다.
- :39 — `result.referenceTree.provenance.revision`을 쓰고, 키 루프는 `shared/skill/references/<name>`이다.
- :41-46 — imported 대상(바이트 변경, license, provenance)은 shared 경로로 바꾼다. `unlisted static file`과 `escaping reference link`는 codex 버전을 유지하고 shared 버전을 추가한다.
- :47 — `static payload requires shared/<name> after manifest regeneration`, 13건
- :48 — 다음으로 대체한다.
  - `for(const platform of ['codex','claude'])`로 `'reintroduced ${platform} imported copy fails C1'`: shared의 `brainstorming.md`를 `<platform>/skill/references/`로 복사하고 refresh한다. code가 `ARC_PAYLOAD_VALIDATION`이고 `/C1/`에 맞으며 메시지에 `references/brainstorming.md`가 있다.
  - 세 접두 각각에 `superpowers/x.md`를 추가한다 → `/nested/i`
  - `'payload rejects missing shared/skill tree'`
- `grep -n "Imported platform parity mismatch" lib tests` 결과가 0이어야 한다(AC7).

`static-references.mjs`
- `writeFixtureReferences`는 `shared/skill/references`에만 쓴다(플랫폼 루프 제거).
- `flattenFixtureReferences`는 플랫폼별 legacy nested를 찾으면 flat 파일을 `shared/skill/references/`에 쓴다. 플랫폼 `visual-companion.md` → `arc-visual-companion.md` rename은 그대로 둔다.
- `staticPackageFixture`의 복사 목록에 `'shared'`를 추가한다.

`package-references.test.mjs`
- 기록·보호·복사 대상을 shared로 바꾼다.
- refresh 후 `codex|claude/skill/references/<13>`이 없고 manifest에도 없다는 assertion을 추가한다(AC9).
- :8은 `referenceTree`를 쓴다.

`superpowers.test.mjs`
- 인자 1개로 호출, shared fixture 사용
- 세 접두의 중첩 `superpowers/` 거부
- `DYNAMIC_ROOTS.includes('shared/skill/references/superpowers')`
- Map이 아닌 입력 거부

`test_arc_policy.py:1458-1466`
- `base = REPO/'shared/skill/references'`로 한 번만 검증한다.
- 기존 :1465의 자기 비교를 `assertFalse((REPO/f'{platform}/skill/references/{destination}').exists())`로 바꾼다.
- :1466은 플랫폼별 `arc-visual-companion.md`를 shared `visual-companion.md`와 비교한다.
- :1448 옆에 `assertFalse((REPO/'shared/skill/references/superpowers').exists())`를 추가한다.

**단계**

- [x] **Step 1: 테스트 변경 먼저 적용 (RED)**
  - 파일을 옮기기 전이므로 shared 경로 assertion과 1인자 호출이 실패해야 한다.
  - `node --test tests/node/superpowers.test.mjs tests/node/manifest.test.mjs tests/node/package-references.test.mjs`
  - 예상: FAIL — `Required flat reference file is missing`, `referenceTree undefined`, ENOENT `shared/skill/references/...`

- [x] **Step 2: 파일 이동·삭제**
  - `mkdir -p shared/skill/references/scripts`, 이어서 `mv`, `rm`
  - `ls -l`로 `start-server.sh`와 `stop-server.sh`의 실행 비트가 유지됐는지 확인한다.

- [x] **Step 3: 코드 변경** — manifest, superpowers, package-references, `package.json`

- [x] **Step 4: manifest 재생성** — `node scripts/update-manifest.mjs`, 이어서 `--check`

- [x] **Step 5: 통과 확인** — 위의 Node·Python 대상 테스트가 PASS다. B3의 알려진 원인은 예외로 인정한다.

**수용 기준:** AC1, AC3, AC4, AC6–AC13

**필수 QA**
- **AC1**
  - 커밋 전에는 작업 트리 기준으로 `shared/skill/references`에 13개가 있다.
  - 아래 명령의 결과가 0줄이다.
    ```
    git ls-files codex/skill/references claude/skill/references | grep -E '/(brainstorming|builder-check-prompt|test-driven-development|visual-companion|writing-good-tests|writing-plans)\.md$|superpowers-(LICENSE|provenance\.json)$|references/scripts/(frame-template\.html|helper\.js|server\.cjs|(start|stop)-server\.sh)$'
    ```
- **AC3:** 13개 각각 `git hash-object shared/skill/references/<f>`가 `git rev-parse e472406:codex/skill/references/<f>`와 같다. 커밋 후에는 `git diff -M --stat e472406 HEAD`에서 rename 100%로 나온다.
- **모드:** 커밋 후 Orchestrator가 `git ls-files -s shared/skill/references/scripts/*.sh`가 100755인지 확인한다.
- **AC11:** `npm pack --dry-run --json`에 `shared/skill/references/**` 13개가 있고, 플랫폼 쪽 이동 대상 경로는 없다. 기준선 `npm-pack.json`과의 차이가 이 경로 교체뿐이다.
- **AC12:** `node --test --test-timeout=180000 tests/node/release-artifact-process.test.mjs` → B1·B2
- **AC7:** `lib`, `tests`에서 `referenceTrees`와 `Imported platform parity mismatch`를 grep한 결과가 0이다.
- **AC16 (중간 점검):** `git diff e472406 -- lib/policy/render.mjs lib/release/artifact.mjs`가 비어 있다. `lib/installer/superpowers.mjs`의 diff는 :11과 :126-130 부분뿐이다.
- GOLD(`--diff` 비어 있음), CHK, N-ALL, P-ALL(B1–B4)
- `test_claude_payload` 실패가 B3의 알려진 원인과 메시지가 같다는 증거

**진행 기록 (2026-11-14, 수락):**
- 기준: T3 시작 후 사용자가 watch DELETE 이벤트 변경을 같은 작업 트리에서 했다. Orchestrator가 사용자 요청에 따라 이를 검토하고 별도 커밋 f1c4a3d로 분리했다(watch 전용 MANIFEST 별도 생성).
- 구현(Implementer 1b7e8577)
  - 13개 파일을 rename했다. 해시와 실행 비트를 보존했다.
  - QA 지적 F1: visual gaps 테스트가 대상을 `arc-visual-companion`으로 바꿨던 것을 shared 경로로 되돌렸다.
  - QA 지적 F2: upgrade-harness의 기대 목록에 shared 키가 빠져 있던 것을 수정했다. 제품 동작 변화는 아니다.
- QA(da0fc7b3)
  - proven: AC1, AC3, AC4(golden diff 0), AC8, AC12, AC15, AC16(중간), 테스트 약화 없음
  - 실패 수: Node 106→105, Python 564→562. 남은 신규 실패는 F2 수정 후 0건이다(upgrade-harness 36/36).
- Orchestrator 추가 검증
  - updater 래퍼를 뺀 사본에서 manifest, package-references, superpowers, upgrade-harness, management-operations 테스트를 실행했다. 결과는 151/154 통과다.
  - 남은 1건(`uninstall failure…`)은 HEAD 사본에서도 동일하게 실패하는 기존 실패다.
  - 이로써 AC6(reference), AC7, AC9가 proven이다.
- 처분 기록
  - AC11의 추가 경로 `lib/installer/skill-sources.mjs`는 T2 분량이다(baseline2 이후 추가).
  - B3 메시지 차이는 다음과 같으며 회귀가 아니다.
    - `test_claude_payload` native adapter: 기준선부터 낡은 기대값이던 `visual-companion`을 실제 레이아웃인 `arc-visual-companion`으로 바로잡았다. 그 결과 이후의 기존 단언에서 실패한다.
    - harness_contract 5건: 집합 출력 순서와 watch 문서 본문 차이
    - consumer/manifest: 임시 경로와 줄 번호 차이
  - AC6(runtime)과 AC10은 T4 범위다.
  - parity 검사 실패와 role-bridge timeout은 기존부터 있던 것이다.

---

### Task T4: runtime 이동 (R1)

**목표:** `skill/runtime/**`를 `shared/skill/runtime/**` 한 곳으로 옮기고, runtime 생성기와 필수 목록을 shared 기준으로 바꾼다.

**파일**
- **이동:** `codex/skill/runtime/**`의 추적 파일 전부 → `shared/skill/runtime/**`
- **삭제:** `claude/skill/runtime/**`의 추적 파일 전부
- **수정**
  - `scripts/update-runtime-assets.mjs:21` — 출력 루프를 `path.join(root,'shared/skill/runtime',name)` 하나로
  - `lib/installer/manifest.mjs:46,:48` — 플랫폼 루프를 없애고 `shared/skill/runtime/role-policy.json`, `shared/skill/runtime/<RUNTIME_MODULE_PATHS 상대>`, `shared/skill/runtime/<COOPERATIVE_RUNTIME_MODULES>`로
- **테스트**
  - `tests/node/runtime-versions.test.mjs` (:26, :48, :59) — canonical과 shared, 두 사본을 비교한다.
  - `tests/node/runtime-assets.test.mjs` (:32-44) — updater 출력, drift, 미관리 파일을 shared에서 검사한다. 출력 파일 수 assertion은 절반 값으로 바꾸고 경로도 함께 바꾼다.
  - `tests/node/runtime-installed-entry.test.mjs` (:11)
  - `tests/node/plan.test.mjs` (:7) — `files.set('shared/skill/runtime/git-query.mjs', <shared 바이트>)`
  - `tests/node/manifest.test.mjs` (:83) — required 목록이 `shared/skill/runtime/...`
  - `tests/node/package.test.mjs` (:39), `tests/node/tui-package-consumer.test.mjs` (:55) — shared runtime 경로
  - `tests/node/fixtures/instruction-contracts.json`의 `protected` (:244-251, :262-283) — 아래 O2 결론대로
- **재생성:** `MANIFEST.sha256`

**O2 결론**
- `protected`를 쓰는 곳은 `instruction-layout.test.mjs:136` 하나다. 키별로 해시만 비교하고, 키 개수나 플랫폼 그룹은 확인하지 않는다. `agent-fragments.test.mjs`는 `agentProfileBaseline`만 쓴다.
- 따라서 `codex/skill/runtime/<n>`과 `claude/skill/runtime/<n>`의 24개 키를 `shared/skill/runtime/<n>` 12개 키로 합친다.
  - 합칠 이름: `evaluate`, `identity`, `operations`, `schema`, `adapters/claude`, `adapters/codex`, `capabilities`, `gate`, `git-evidence`, `git-query`, `store`(모두 `.mjs`), 그리고 `role-policy.json`
  - 해시 값은 바꾸지 않는다. `lib/**` 키도 그대로 둔다.

**선행:** T3

**단계**

- [x] **Step 1: 테스트·fixture 변경 먼저 적용 (RED)**
  - manifest.test에 `'reintroduced platform runtime copy fails C1'`도 함께 추가한다.
  - `node --test tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs tests/node/instruction-layout.test.mjs`
  - 예상: FAIL (ENOENT `shared/skill/runtime/...`)

- [x] **Step 2: 이동·삭제**
  - `mv codex/skill/runtime shared/skill/runtime`, `rm -r claude/skill/runtime`
  - 추적 파일만 대상이다. 미추적 파일이 남아 있으면 중단하고 보고한다.

- [x] **Step 3: 생성기와 manifest 코드 변경**

- [x] **Step 4: 생성기 확인과 manifest 재생성**
  - `node scripts/update-runtime-assets.mjs --check` → `Runtime payload verified (<N/2> files)`, drift 없음
  - `node scripts/update-manifest.mjs`, 이어서 `--check`

- [x] **Step 5: 통과 확인**
  - 대상 테스트가 PASS다. B3 예외는 증거를 함께 낸다.
  - `runtime-installed-entry` 2건은 arc-consistent-gates 원인으로 기준선과 같다.

**수용 기준:** AC2–AC4, AC6, AC10–AC13

**필수 QA**
- **AC2:** `git ls-files codex/skill/runtime claude/skill/runtime` → 0. `shared/skill/runtime`의 파일 수는 T3 시점의 codex 파일 수와 같다.
- **AC3:** 옮긴 파일의 해시가 `e472406:codex/skill/runtime/<f>`와 같다.
- **AC6 (runtime):** C1 재유입 테스트가 PASS다.
- **AC10, AC11, AC12:** `npm pack --dry-run --json`에 `shared/skill/runtime/**`이 있고 플랫폼 runtime은 없다.
- GOLD(`--diff` 비어 있음), CHK, N-ALL, P-ALL(B1–B4)

**진행 기록 (2026-11-14, 수락):**
- 구현(Implementer 5d97976e)
  - runtime 32개를 shared로 이동했다(해시 32/32 일치).
  - 생성기 출력이 64개에서 32개로 줄었고 drift는 없다.
  - C1 runtime 재유입 테스트를 추가했다.
- QA(d72e8bfb)
  - proven: AC2, AC3, AC4(golden diff 0), AC6(runtime), AC10, AC11, AC12, AC15, B4
  - AC11 상세: shared runtime 32개 추가, 플랫폼 runtime 64개 제거. 그 밖의 차이는 없다.
  - instruction-contracts의 플랫폼 키 24개는 같은 해시를 가진 shared 키 12개로 바뀌었다.
  - B1/B2(T3 로그 대비): Node 105→104(F2 해소 1건), Python 562로 동일. 신규 실패는 0건이다.
- 처분 기록(B3)
  - `plan.test.mjs` codex 렌더링 기준선 4건은 실제 해시가 달라졌다. 이 8건은 기준선부터 실패하던 테스트다.
  - 원인은 fixture 변경이다. 이전에는 `git-query.mjs`를 claude runtime에만 넣었고, 이제는 shared에 넣는다. shared 파일은 설계상 두 플랫폼에 합성되므로 codex 렌더 결과에도 포함된다.
  - 실제 설치 결과물은 golden diff 0으로 변하지 않았다.
  - 나머지 2건의 메시지 차이는 경로명(플랫폼→shared) 변경뿐이다.
  - parity 검사 실패와 role-bridge timeout은 기존부터 있던 것이다.

---

### Task T5: 현행 문서 갱신

**목표:** 현행 문서가 옮겨진 자산의 소스 위치를 바르게 설명하도록 고친다.

**파일**
- 수정: `docs/harness-operation.md` :46, :271. 저장소·패키지의 소스 위치와 설치 위치를 구분해 적는다.
  - Superpowers에서 가져온 13개: `shared/skill/references/`
  - 나머지 reference: 플랫폼별 `skill/references/`
  - 설치 위치: `skills/arc/references/`
  - runtime: 소스는 `shared/skill/runtime`, 원본은 `lib/runtime`
- grep 결과, 현행 문서 중 플랫폼 reference·runtime 경로를 언급하는 곳은 `docs/harness-operation.md`뿐이었다(:46, :174, :185, :202, :227, :249, :250, :271, :273). Implementer가 아래 grep으로 다시 확인하고 필요한 곳만 고친다.

**선행:** T4

**단계**

- [x] **Step 1 (RED):** `test_maintained_local_links_resolve`(unittest `-k`)와 아래 grep을 실행해, 지금 잘못된 설명이 있는 위치를 기록한다.
  ```
  rg -n "(codex|claude)/skill/(runtime|references/(brainstorming|builder-check-prompt|test-driven-development|visual-companion|writing-good-tests|writing-plans|superpowers-|scripts/))" README.md AGENTS.md CLAUDE.md docs --glob '!docs/superpowers/**'
  ```
- [x] **Step 2:** 설명을 고친다. 링크 대상이 바뀐 곳도 함께 고친다.
- [x] **Step 3:** grep 결과가 0줄이고 링크 테스트가 PASS다.

**수용 기준:** AC13–AC16

**필수 QA**
- 위 grep 결과 0줄
- `git diff --stat e472406 -- docs/superpowers`에 기존 파일의 diff가 없다. 이번 spec·plan의 신규 추가만 있다.
- AC15 해시 대조
- **AC16:** 아래 diff가 비어 있다. `REFERENCE_PATH_MAP`과 `flattenReferenceBundle` 구간도 diff 0이다.
  ```
  git diff e472406 -- lib/policy/render.mjs lib/release/artifact.mjs codex/skill/SKILL.md claude/skill/SKILL.md codex/skill/models.toml claude/skill/models.toml codex/skill/scripts claude/skill/scripts codex/agents claude/agents codex/tools
  ```
- **AC4:** `git diff <T1 commit> HEAD -- tests/node/fixtures/installed-layout-golden.json`이 비어 있다.
- GOLD, CHK, N-ALL, P-ALL

**진행 기록 (2026-11-14, 수락):**
- 구현(Implementer 842aa92c): `docs/harness-operation.md:46`의 문장 하나만 수정했다. 소스 위치(shared, 플랫폼별)와 설치 위치(`skills/arc/references`, `skills/arc/runtime`)를 구분해 설명한다.
  - 첫 실행에서 기존 링크 실패 때문에 중단했다. Orchestrator가 처분한 뒤 재개했다.
  - 문단의 나머지 내용과 276행(handoff-worktree 링크, W2 범위)은 그대로 두었다.
- QA(972d8736)
  - 문장 내용이 저장소 상태와 맞는지 확인했다.
  - proven: AC4(T1 이후 golden diff 0), AC14(grep 0건, 과거 문서 diff 0), AC16(비목표 경로 diff 0)
  - B1/B2(T4 로그 대비): Node 104, Python 562로 변화가 없다. 신규 실패와 해소된 실패 모두 0건이다.
  - CHK: 통과(parity 실패는 기존과 같음)
  - 링크 검사: 기존 2건만 실패한다.
- AC15: QA의 비교 명령이 잘못돼 미검증이었다. Orchestrator가 정렬 해시를 직접 대조해 동일함을 확인했다.
- 처분 기록: 링크 실패 2건(handoff.md에서 `coordination.md#token-discipline-and-handoffs`로 가는 앵커 누락)은 기준선부터 있던 것이며 범위 밖이다.

---

### Task W1: Codex 워크트리 계약 분리 (codex 디렉터리 안에서만)

**목표:** codex `handoff-worktree.md`를 플랫폼 중립 계약으로 다시 쓴다. Codex 앱 전용 생성 절차는 새 codex `worktree-creation.md`로, 워크트리 실패 절은 중립 계약으로 옮긴다. claude 설치본은 바뀌지 않는다. `shared/`로 옮기는 일은 W2에서 한다(spec §11.3).

**파일**
- 수정: `codex/skill/references/handoff-worktree.md`
  - spec §11.3의 shared 내용으로 중립화한다.
  - 다음 anchor를 유지한다: `#managed-worktree-handoff-contract`, `#new-managed-worktree`, `#worktree-document-transfer`
  - 새 절 `<a id="worktree-failures-and-partial-completion"></a>`를 추가한다.
  - "생성은 [worktree-creation](worktree-creation.md)만 사용"을 넣는다.
  - "앱 관리·현재 대화 첨부"를 "플랫폼 attachment 증거(worktree-creation에서 정의)"로 바꾼다.
- 생성: `codex/skill/references/worktree-creation.md`
  - 앱이 경로를 정하는 방식
  - `mcp__codex_app__create_worktree`, `get_worktree_creation_status`, `attach_worktree`
  - raw Git fallback 금지
  - 앱 attachment의 의미
- 수정: `codex/skill/references/git-recovery.md:37-44`
  - anchor와 제목은 유지한다.
  - 본문에는 `handoff-worktree.md#worktree-failures-and-partial-completion` 링크와 앱 전용 문장만 남긴다.
- 테스트
  - `tests/test_arc_policy.py`
    - :10 `HANDOFF_FILES`에 `"worktree-creation"`을 추가한다.
    - :307 기대 heading을 문서 순서대로 `["new managed worktree", "worktree document transfer", "worktree failures and partial completion"]`로 바꾼다.
    - :1255, :1533의 phrase 목록을 내용이 옮겨간 파일 기준으로 나눈다.
      - 원래 phrase는 하나도 빼지 않는다. handoff-worktree와 worktree-creation을 합쳐 누락이 0이어야 한다.
      - 앱 전용 phrase는 `worktree-creation`에서 확인한다: `mcp__codex_app__create_worktree`, `allowasync: true`, `operationid`, `attach_worktree`, `the app determines the actual destination path`, `current-chat attachment` 등
  - `tests/node/instruction-layout.test.mjs:125-128` — 내용이 옮겨진 경우 해당 파일 경로로 바꾼다.
  - `tests/node/instruction-language.test.mjs:14-15` — 검사 목록에 `codex/skill/references/worktree-creation.md`를 추가한다.
  - `tests/node/fixtures/instruction-contracts.json` — codex 계약 텍스트를 인용하는 항목(:40 등)이 있으면 그 값만 갱신한다.
- 재생성: `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`(`--write`)

**변경 금지:** codex `SKILL.md`(:49 행 유지), `handoff.md`, `handoff-prep.md`, `planning.md`, agents, 모든 claude 파일. 이 파일들을 바꿔야 할 상황이 생기면 §11.6 목록이 달라지는 것이므로 보류하고 Orchestrator에게 보고한다.

**H2 확정** (W1·W2 공통)
- `tests/installer-parity.json`에 있는 `handoff-worktree` 참조(:10618-10758)는 테스트 destination 매핑이다.
- `scripts/check-installer-parity.mjs`가 확인하는 것:
  - inventory sha 고정
  - 236개 ID와 739개 assertion 수
  - destination 파일 존재
  - `--complete`를 주면 매핑된 Node·Python 테스트를 실행해 통과까지 확인한다.
- 따라서 매핑된 테스트의 이름과 파일 경로는 바꾸지 않는다. parity 파일 변경은 0이다.
- claude agents와 `lib/prompts/agent-fragments.json`은 바꾸지 않는다. claude agents에는 `handoff-worktree` 참조가 없고, Implementer는 brief가 인용한 절만 읽는다.

**선행:** T5

**예상 golden diff** (QA가 1:1로 대조)
- codex 4조합(`codex/{write,omit}/{en,ko}`) 각각에 아래 3줄, 총 12줄
- claude 조합은 0줄

```
~ codex/<p>/<l> skills/arc/references/handoff-worktree.md
+ codex/<p>/<l> skills/arc/references/worktree-creation.md
~ codex/<p>/<l> skills/arc/references/git-recovery.md
```

**단계**

- [x] **Step 1: 테스트 변경 먼저 적용 (RED)** — heading 목록, phrase 출처, `HANDOFF_FILES`
  - `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_arc_policy.py -k worktree -k handoff`
  - 예상: FAIL (`worktree-creation.md` 없음, heading 불일치)
- [x] **Step 2:** 문서를 분리한다.
- [x] **Step 3: 재생성과 golden 갱신**
  - `node scripts/update-manifest.mjs`
  - `--write` 전에 `node tests/node/fixtures/installed-layout.mjs --diff`를 실행해 출력을 증거로 남긴다. 위 12줄과 같아야 한다.
  - `--write`
- [x] **Step 4:** 대상 테스트와 GOLD가 PASS다.

**수용 기준:** AC18, AC21, AC13. W1에서는 codex 파일의 anchor 유지만 확인하고, AC17 전체는 W2에서 확인한다.

**필수 QA**
- write 전 `--diff` 출력을 위 예상 목록과 1:1로 대조한다. 빠지거나 더 있으면 실패다.
- AC21: `node scripts/update-role-policy.mjs --check`
- `node scripts/check-installer-parity.mjs`
- CHK, N-ALL, P-ALL(B1–B4)
- `git diff --stat -- claude`가 0이다.

**진행 기록 (2026-11-14, 수락):**
- 구현(Implementer f03b4ef4)
  - 첫 실행은 Codex 사용량 한도(`usage_limit_exceeded`)로 중단됐다. 사용자가 계정을 전환한 뒤 같은 세션으로 재개했다.
  - 중립 계약 `handoff-worktree.md`: 앱 관련 문구가 없고 anchor 4개를 갖는다.
  - `worktree-creation.md`(codex)를 새로 만들어 Codex 앱 생성 절차를 옮겼다.
  - `git-recovery.md`의 워크트리 절은 링크로 바꿨다.
- QA(0250b1b8)
  - proven: AC18(golden 변경이 예상한 codex 12건과 정확히 같고 claude 0건), AC21, AC15
  - 중립성과 링크, 테스트 약화 없음, 변경 금지 파일 diff 0을 확인했다.
  - B1/B2(T5 로그 대비): Node 104로 같고, Python은 562→561이다(`test_workspace_handoff_worktree_creation_and_identity` 계약 1건 해소). 신규 실패는 0건이다.
- 처분 기록
  - B3 메시지 차이 56건은 단언 패턴 접두부가 모두 같다. 메시지에 포함되는 검사 대상 문서 본문만 바뀌었다(Orchestrator가 판별).
  - 문서 규칙 보존: 삭제되거나 약화된 규칙이 없음을 확인했다. 각 규칙이 정확히 한 곳에만 있는지(단일 위치 조건)는 최종 Reviewer가 함께 확인한다.
  - parity 실패는 기존부터 있던 것이다.

---

### Task W2: 공통 계약 `shared/` 이동과 Claude 워크트리 활성화

**목표:** 중립 계약을 `shared/`로 옮기고, Claude에 M2 생성 절차와 세 가지 실행 대상 선택지를 넣는다.

**파일**
- **이동:** `codex/skill/references/handoff-worktree.md` → `shared/skill/references/handoff-worktree.md` (바이트 불변)
- **생성:** `claude/skill/references/worktree-creation.md`
  - spec §11.2의 1–9를 모두 넣는다. 각 단계에 `1.`–`9.` 번호를 붙이고 아래 핵심어를 포함한다.
    1. 선택 게이트
    2. 생성 직전 재확인. `git check-ignore`, 필요하면 `.git/info/exclude`에 추가(D9)
    3. `git worktree add -b <approved-branch> .claude/worktrees/<name> <verified-full-sha>`. `--force`, `-B`, 자동 접미사, 다른 경로나 이름으로 재시도는 금지
    4. 진입 전 검증: `git worktree list --porcelain`, common-dir, HEAD, branch, source 보존
    5. `EnterWorktree({path:"<abs>"})` 후 세션 cwd와 `git rev-parse --show-toplevel`이 대상 realpath와 같은지 단순 명령으로 확인(F5)
    6. `type:'worktree-attachment'` note를 `{realpath, gitDir, gitCommonDir}`로 기록
    7. native 역할은 cwd를 상속하고, bridge에는 `--cwd <worktree realpath>`를 준다.
    8. 끝낼 때는 `ExitWorktree({action:"keep"})`만 쓴다. 자동 정리는 금지
    9. Stop and inspect. 자동 재시도, fallback(M1·M3), 삭제는 금지
- **수정 (claude, 관리 블록 밖)**
  - `claude/skill/references/handoff-prep.md`
    - :4를 세 가지 선택지로 바꾼다. "fallback으로 생성·첨부 금지"는 유지한다.
    - :21의 선택지 문구를 바꾸고 `.claude/worktrees/<name>`를 제시한다.
    - 준비 mutation 절과 문서 커밋 절에 워크트리 검증 문장을 넣는다(codex :26, :70에 대응).
  - `claude/skill/references/handoff.md` — :27과 :92를 codex와 같은 의미로 바꾼다. :92는 다음 문장이다: "Selected worktrees require common directory, registration, `EnterWorktree` session attachment, approved branch and source preservation through [managed preparation](handoff-worktree.md) only."
  - `claude/skill/SKILL.md` — codex :49와 같은 `handoff-worktree` 행을 추가한다.
  - `claude/skill/references/planning.md` — `<a id="managed-worktree-preparation"></a>` 절과 "Follow [handoff-worktree](handoff-worktree.md)."를 추가한다.
  - `claude/skill/references/git-recovery.md` — `handoff-worktree.md#worktree-failures-and-partial-completion` 링크를 추가한다.
- **수정 (문서)**
  - `docs/harness-operation.md:154` — 두 플랫폼 모두 세 선택지를 제공하고 생성 방식만 다르다고 적는다.
  - :174, :273 — `handoff-worktree` 링크를 `shared/skill/references/handoff-worktree.md`로 바꾼다.
- **수정 (테스트)**
  - `tests/test_harness_contract.py`
    - :166-168 `NATIVE_WORKTREE["claude"] = (r"selected worktree.*common directory.*registration.*source preservation",)` — codex와 같은 패턴
    - :512 — claude "unsupported" 단언을 뒤집어, 그 문구가 없고 세 선택지가 있음을 단언한다.
  - `tests/test_claude_payload.py` — :362, :388의 `current checkout only`를 "없음"으로 뒤집는다. :755도 뒤집고, 세 선택지와 `.claude/worktrees/`가 있음을 단언한다.
  - `tests/test_arc_policy.py`
    - :1051을 뒤집는다.
    - `policy_text`(:12-15)의 경로 해석에서 `codex/skill/references/<n>.md`가 없으면 `shared/skill/references/<n>.md`를 쓴다.
    - claude `worktree-creation.md`에 §11.2 1–9 핵심어가 있는지 확인하는 테스트를 추가한다(AC19).
  - `tests/node/instruction-layout.test.mjs`
    - :118 링크 존재 검사를 `fs.existsSync(path.join(root,platform,'skill',link[1]))||fs.existsSync(path.join(root,'shared/skill',link[1]))`로 바꾼다. 설치 시 합쳐지는 트리와 같은 의미다.
    - :126 경로를 `shared/...`로 바꾼다.
  - `tests/node/instruction-language.test.mjs:14-15` — shared 경로와 claude `worktree-creation.md`를 넣는다.
  - `tests/node/fixtures/instruction-contracts.json` — :152 claude handoff 계약 텍스트를 새 문서 텍스트로 바꾼다. agents 해시는 바꾸지 않는다(H2).
  - `tests/node/runtime-target-preparation.integration.test.mjs` — 새 테스트 `'claude managed worktree under .claude/worktrees with operator attachment is accepted as worktree intent'`
    - 임시 저장소에서 `git worktree add -b <b> .claude/worktrees/<n> <sha>`를 실행한다.
    - 같은 파일의 기존 worktree 시나리오 helper로 `type:'worktree-attachment'` note `{realpath,gitDir,gitCommonDir}`를 기록한다.
    - intent `kind:'worktree'`를 평가하면 기존 codex 시나리오와 같이 수락된다.
    - attachment note가 없으면 기존 hold 사유로 끝난다.
- **재생성:** `MANIFEST.sha256`, golden(`--write`)
- **변경 없음 (H2):** `claude/agents/*`, `codex/agents/*`, `lib/prompts/agent-fragments.json`, runtime 코드, `lib/policy/role-policy.json`

**선행:** W1. AC22 실행 증거 방식(O-P3)은 사용자 결정이 필요하다.

**예상 golden diff**
- claude 4조합 각각에 아래 7줄, 총 28줄
- codex 조합 0줄, `agents/*` 0줄. 이동이 바이트 불변이라 codex의 `handoff-worktree.md`도 바뀌지 않는다.

```
+ claude/<p>/<l> skills/arc/references/handoff-worktree.md
+ claude/<p>/<l> skills/arc/references/worktree-creation.md
~ claude/<p>/<l> skills/arc/SKILL.md
~ claude/<p>/<l> skills/arc/references/handoff.md
~ claude/<p>/<l> skills/arc/references/handoff-prep.md
~ claude/<p>/<l> skills/arc/references/planning.md
~ claude/<p>/<l> skills/arc/references/git-recovery.md
```

**단계**

- [x] **Step 1: 테스트·fixture 변경 먼저 적용 (RED)**
  - 실행:
    ```
    PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_harness_contract.py -k worktree -k checkout
    PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s tests -p test_claude_payload.py -k worktree -k checkout
    node --test tests/node/instruction-layout.test.mjs tests/node/runtime-target-preparation.integration.test.mjs
    ```
  - 예상: 문서 관련 단언은 FAIL이다. runtime 시나리오는 코드 변경이 없어 처음부터 PASS일 수 있다. 이 경우 회귀 고정용 테스트임을 기록한다.
- [x] **Step 2:** 이동, 생성, 문서 수정
- [x] **Step 3: 검사, 재생성, golden 갱신**
  - `node scripts/update-role-policy.mjs --check`가 stale이면 관리 블록을 건드린 것이다. 중단하고 보고한다.
  - `node scripts/update-manifest.mjs`
  - golden `--diff`(증거), 이어서 `--write`
- [x] **Step 4:** 대상 테스트와 GOLD가 PASS다.

**수용 기준:** AC17, AC19–AC22, AC13

**필수 QA**
- **AC17:** `git ls-files shared/skill/references/handoff-worktree.md`가 1이고 codex 경로는 0이다. anchor 3개와 실패 절 anchor가 있다. rename 100%다.
- **AC19:** grep으로 claude `handoff-prep.md`에 `current checkout only`가 없고 세 선택지가 있음을 확인한다. claude `worktree-creation.md`에 1–9가 있다.
- **AC20:** write 전 `--diff`를 위 28줄과 1:1로 대조한다.
- **AC21:** role-policy `--check`
- **AC22:**
  - 새 runtime 테스트가 PASS다.
  - 워크트리 cwd에서 bridge `run-dispatch`를 1회 실행한 증거가 있다. 시험용 워크트리를 만들고 지우는 일은 O-P3 결정에 따라 Orchestrator가 한다. QA는 dispatch 결과와 `resolveWorktree`의 대상 realpath를 확인한다.
- `node scripts/check-installer-parity.mjs`(가능하면 `--complete`), CHK, N-ALL, P-ALL(B1–B4)

**진행 기록 (2026-11-14, 수락):**
- 구현(Implementer aa57705c)
  - 공통 계약 `handoff-worktree.md`를 shared로 옮겼다(바이트 동일).
  - Claude `worktree-creation.md`(§11.2의 1–9단계)와 Claude 문서 5개, docs, 테스트를 반영했다.
  - golden 갱신 전 diff가 예상한 28줄과 정확히 일치했고, 그 뒤 `--write`로 갱신했다.
  - 진행 중 Implementer 쪽 실행 오류 1회(기준선 수집 병렬화)가 있었다. 테스트 경로와 기대값 보완 지시도 1회 했다.
- 계획 편차: `tests/node/plan.test.mjs:117`의 fixture가 SKILL.md에 링크된 reference를 플랫폼 경로에서만 읽고 있었다. 이 파일은 W2 파일 목록에 빠져 있었다.
  - Orchestrator가 W2 범위 안의 테스트 경로 보완으로 판단했다(합성 트리 방식).
  - 기존 Implementer의 허용 경로에 이 파일이 없어, fresh Implementer 3bb51989로 교체해 이 줄만 수정했다.
- AC22 실행 증거
  - 승인된 시험 워크트리 `.claude/worktrees/arc-ac22-probe`를 `--cwd`로 Codex bridge를 실행했다(dispatch 49527202).
  - pwd와 toplevel은 워크트리였고, common dir은 공유 `.git`이었다.
  - 확인 후 워크트리와 브랜치를 삭제했다.
- QA(11b98887)
  - proven: AC17, AC19, AC20(정확히 28줄, codex·agents 0), AC21, AC22(통합 테스트 3/3 + bridge 증거), AC15
  - 금지 파일 변경과 테스트 약화가 없음을 확인했다.
  - B1: plan.test 보완 후 W1 대비 신규 실패 0건
  - Python 561→558(3건 해소)
  - B3: 메시지 차이는 문서 본문, anchor 집합 표현, 실패 목록 길이에 한정된다.
- 처분 기록: parity 실패, public rendering baseline 8건, 링크 기존 2건은 기존부터 있던 것이다.

---

## 최종 검증 (모든 task 수락 후 1회, task 선행조건이 아님)

- **QA** (필요할 때): `e472406..HEAD` 기준으로 N-ALL, P-ALL, CHK, GOLD, `npm pack --dry-run --json`, AC14–AC16 전체를 다시 확인한다.
- **최종 Reviewer** 1회. 대상은 T1–T5, W1, W2 전체 diff이고, 다음을 중점으로 본다.
  - 테스트 완화가 없는지(assertion 수와 정규식 대조)
  - C1–C3 의미가 spec과 맞는지
  - golden diff가 예상 목록과 맞는지
  - 관리 블록 밖에서만 수정했는지
  - 비목표 파일의 diff가 0인지

**최종 Reviewer 결과와 후속 수정 R1 (2026-11-14, 수락):**
- 최종 Reviewer(93905792): High 지적은 없다. 조합, 설치 결과물 보존, 테스트 약화, 보안, 비목표 항목에서 문제가 없다.
- 워크트리 문서 정합성 지적 5건
  - M1: Claude `handoff.md`에 codex `:56`/`:73`에 해당하는 내용이 없다(spec §11.4 누락).
  - M2: shared 계약의 검사 순서와 Claude 절차의 순서가 맞지 않는다.
  - L1: `handoff-prep.md` 제목
  - L2: 생성 명령의 실행 위치
  - L3: 금지 목록에 `ref` 누락
- 사용자 승인(5건 모두 수정, M2는 (b) 방식, M1 문장 추가 포함)에 따라 R1 Implementer(c1527a3b)가 Claude 문서 3개를 수정했다.
  - golden 사전 diff는 예상 12줄(claude 4조합 × 3파일)과 정확히 일치한다. codex와 agents는 0줄이다.
  - role-policy 검사 통과. 변경 전후 실패 이름이 동일하다.
- Reviewer 재확인(13fd66d5): 5건 모두 해소, 남은 지적 없음.
- Orchestrator 확인: manifest `--check`(220), role-policy(24), golden 4/4, `--diff` 출력 없음.

## 미결·보류 요약

| ID | 내용 | 상태 |
|---|---|---|
| O-P1 | Python 실행기 | 결정 완료. 이 환경에 pytest가 없으므로 `unittest discover`를 쓰며, 저장소 parity 검사기와 같다. |
| O-P2 | W1/W2의 shared 이동 시점 | spec 개정 완료(W2에서 이동). 2026-11-14 재승인. |
| O-P3 | AC22 실행 증거를 위한 시험 워크트리 Git 변경 | 결정 완료(2026-11-14). Orchestrator가 `.claude/worktrees/`에 만들어 확인한 뒤, 변경이 없음을 확인하고 삭제한다. |
| B3 | `test_claude_payload` 기존 불일치 | 메시지 일치 증거로 처리 |
| H1 | arc-consistent-gates | 삭제하지 않고 기준선 대비로 진행 |
