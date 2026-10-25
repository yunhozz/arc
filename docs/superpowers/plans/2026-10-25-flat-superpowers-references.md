# Superpowers 정적 참조 평면 배치 구현 계획

> **실행 담당 에이전트:** 승인된 ARC handoff에 따라 Orchestrator가 각 준비된 작업을 fresh Implementer에 할당한다. 작업별 흐름은 Implementer → fresh QA 및 필요한 재검증 → Orchestrator 수용·focused commit이다. 모든 작업 수용 후 독립 Reviewer가 최종 전체 변경을 검토한다. 최종 Reviewer finding은 본 계획의 수정·재검토 절차를 따른다. 체크박스는 진행 추적용이며 개별 승인·수용·commit 단위가 아니다. 계획 승인과 전체 문서 준비 완료 전에는 구현을 시작하지 않는다.

**Goal:** 양 플랫폼에 원본 Superpowers 파일을 평면 정적 자산으로 배포하고, 설치·upgrade의 자동 수집을 제거하며, 명시적 로컬 updater와 A/B 상호작용 계약을 제공한다.

**Architecture:** 공통 원본→목적지 매핑을 정적 payload 검증과 수동 updater가 공유한다. 설치는 검증된 플랫폼별 파일만 사용하며 수동 updater만 acquisition을 호출한다. ignored shell wrapper는 tracked Node updater를 호출하고, 정확한 tracked script allowlist를 통해 package·release에서 제외한다.

**Tech Stack:** Node.js `>=22`, ESM, `node:test`, 기존 safe-fs 및 설치 트랜잭션, Bash, 기존 Python 정책 구조 검사.

**Spec:** `/Users/yunho/.codex/worktrees/flat-superpowers-references/arc/docs/superpowers/specs/2026-10-25-flat-superpowers-references-design.md`

승인된 명세: 392줄, SHA-256 `650a32a39b0d387ac0741f54739938c7747d2e3d27af9846df5260da0664e825`.

계획 저장 대상: `/Users/yunho/.codex/worktrees/flat-superpowers-references/arc/docs/superpowers/plans/2026-10-25-flat-superpowers-references.md`

Implementer와 QA는 Git 상태를 변경하지 않으며 Orchestrator만 작업을 수용하고 focused commit을 수행한다.

## Global Constraints

- Workspace: `/Users/yunho/.codex/worktrees/flat-superpowers-references/arc`.
- Branch: `feat/static-superpowers-references`.
- 구현 기준 HEAD: `f176ce771811cb2a39d68fb5af03a20d5ff6e04e`.
- source `master`의 후속 변경을 rebase하거나 자동 반영하지 않는다.
- Codex·Claude에 같은 imported 매핑과 바이트를 적용한다.
- upstream Markdown·스크립트·JS·HTML·LICENSE·provenance를 이번 변경에서 수정하지 않는다.
- 원본 revision `bb92a77741419a4ab5f06e711a283343f1ada0c3`를 유지한다.
- 실제 Node updater와 현재 worktree의 ignored wrapper를 실행하지 않는다. upstream fetch도 수행하지 않는다.
- updater 검증은 고정 fixture와 acquisition 대역만 사용한다.
- shell 검증은 임시 fixture에 복사한 wrapper와 stub Node만 실행한다.
- install·upgrade·postinstall·pack·release는 updater를 직접 또는 간접 호출하지 않는다.
- 정확한 ignore 항목은 `/scripts/update-superpowers-local.sh`다.
- wrapper는 현재 worktree에만 존재하고 stage·commit·배포하지 않는다.
- `package.json.files`의 `scripts/`는 승인된 11개 script file allowlist로 대체한다.
- `!scripts/update-superpowers-local.sh`나 새 glob/negation을 package files에 추가하지 않는다.
- `.gitignore`만으로 npm package 제외를 보장한다고 주장하지 않는다.
- 기존 설정·외부 스킬·사용자 파일·legacy uninstall·rollback 계약을 보존한다.
- 테스트 수정·집중 실행은 승인되어 있다. 계획 작성 중에는 실행하지 않는다.
- 계획은 사용자에게 승인되었다. 승인된 문서 세트의 batch commit과 readiness handoff 완료 전에는 Implementer를 시작하지 않는다.

## Review Focus

1. **공백 경로와 다른 cwd:** wrapper는 자신의 저장소 updater를 호출하고 인자·출력·종료 코드를 보존한다. T2에서 검증한다.
2. **부분 게시·cleanup 실패:** 두 플랫폼과 metadata·manifest를 복원하고 잔여 경로를 보고한다. T1에서 검증한다.
3. **지원 밖 upstream 파일·링크·충돌:** ARC 문서를 덮어쓰거나 원문을 수정하지 않고 게시 전 거부한다. T1에서 검증한다.
4. **실제 local wrapper가 있는 source:** manifest 검증은 통과하되 npm·release에는 포함되지 않는다. T1 allowlist 검사와 T2 실제 파일 검사로 입증한다.
5. **A/B 표시와 전달의 차이:** 하이라이트·동일 세션 저장·실제 다음 턴 반영을 별도로 확인하고 현재 채팅을 우선한다. T1에서 검증한다.

---

## 1. 파일 책임과 변경 지도

아래 경로는 모두 workspace 기준이다.

| 파일·영역 | 책임 | 작업 |
|---|---|---|
| `lib/installer/superpowers.mjs` | 매핑·필수 목록·flat 검증·정적 트리 변환 | T1 |
| `lib/installer/manifest.mjs` | 정적 imported 검증·manifest 직렬화·정확한 source-local 예외 | T1 |
| `scripts/update-manifest.mjs` | 동적 예외 제거·공통 직렬화·local wrapper 제외 | T1 |
| `lib/installer/package-references.mjs` | flat 게시·manifest 갱신·복원 | T1 |
| `lib/installer/acquisition.mjs` | 명시적 updater 전용 수집 계약 유지 | T1 |
| `scripts/update-superpowers.mjs` | 공통 updater CLI | T1 |
| `lib/installer/{plan,install,transaction,upgrade,uninstall}.mjs` | 정적 설치·legacy 제거 호환성 | T1 |
| `lib/management/operations.mjs` | 자동 acquisition 생성·전달 제거 | T1 |
| `lib/release/artifact.mjs` | 정확한 script 입력 inventory·artifact wrapper 금지 | T1 |
| `package.json` | broad `scripts/`를 11개 파일 allowlist로 교체 | T1 |
| `MANIFEST.sha256` | 최종 정적 payload에서 재생성 | T1 |
| 양 플랫폼 imported tree | 명세의 13개 목적지로 바이트 이동 | T1 |
| 양 플랫폼 `skill/SKILL.md` | ARC 시각화 정책 링크 | T1 |
| 양 플랫폼 `references/{coordination,planning,verification}.md` | 새 참조 경로 | T1 |
| 양 플랫폼 `references/arc-visual-companion.md` | 기존 정책·실행 기준·A/B 안내 | T1 |
| `codex/agents/{arc-planner,arc-implementer}.toml` | 새 스킬 경로 | T1 |
| `claude/agents/{arc-planner,arc-implementer}.md` | 새 스킬 경로 | T1 |
| `docs/harness-operation.md` | 정적 설치·명시적 updater·local-only 설명 | T1·T2 |
| `.gitignore` | exact wrapper 항목 | T2 |
| `scripts/update-superpowers-local.sh` | ignored 실제 shell entrypoint | T2 |

신규 검사:

- `tests/node/fixtures/static-references.mjs`
- `tests/node/superpowers-lifecycle.test.mjs`
- `tests/node/visual-companion.test.mjs`
- `tests/node/local-updater.test.mjs`

기존 검사 변경:

- `tests/node/{superpowers,acquisition,package-references,manifest,package,install,all-targets,management-operations,upgrade-harness,uninstall,consumer,release-artifact}.test.mjs`
- `tests/node/fixtures/{fake-git,packed-consumer}.mjs`
- `tests/test_arc_policy.py`

`lib/policy/render.mjs`는 생성 계약 확인 근거다. 공통 role-policy 의미를 변경하지 않는다. `lib/installer/runtime-assets.mjs`의 install inventory와 cooperative-runtime hash 구분도 유지한다.

## 2. 공유 인터페이스

### `lib/installer/superpowers.mjs`

```text
REFERENCE_PATH_MAP
  readonly Array<{source: string, destination: string}>

flattenReferenceBundle(bundle)
  -> Map<reference-relative destination, TreeEntry>

validateFlatReferenceFiles(files, platform)
  -> {provenance, entries: Map<reference-relative destination, TreeEntry>}

composeStaticArcSkillTree(skillFiles)
  -> Map<skill-relative path, TreeEntry>
```

- 매핑은 승인된 명세의 13개를 그대로 담는다.
- flatten은 허용된 일반 파일만 매핑하고 지원 밖 파일·링크를 게시 전에 거부한다.
- flat 검증은 package-relative `Map<string, Buffer>`에서 플랫폼별 파일을 읽어 provenance와 비교한다.
- 정적 트리 변환은 `plan.generated.skill`만 받으며 acquisition bundle을 받지 않는다.
- legacy uninstall에 필요한 `snapshotSkill()` 등의 검증은 유지한다.

### `lib/installer/manifest.mjs`

```text
LOCAL_UPDATER_PATH = 'scripts/update-superpowers-local.sh'

renderManifest(files: Map<string, Buffer>) -> Buffer

verifyPayload({
  packageRoot,
  safeFs,
  payloadMode = 'auto'
}) -> 기존 payload 결과 구조
```

- 기존 SHA-256·정렬 형식을 유지한다.
- `payloadMode`는 `auto`, `source`, `package`만 허용하며 대상 HOME이나 호출자 cwd로 결정하지 않는다.
- `auto`는 `.git` 디렉터리 또는 검증한 일반 `gitdir:` 파일, package metadata와 일치하는 일반 `package-lock.json`, 기존 lifecycle-free source package 계약이 모두 확인될 때만 source로 판정한다. `.git` 대상 경로를 따라가거나 Git 명령을 실행하지 않는다. source marker가 있지만 손상되었으면 거부한다.
- management install·upgrade는 `auto`를 사용한다. source 근거가 없으면 package 규칙을 적용한다.
- 명시적 maintainer source 사전 검증과 release source 검증만 `source`를 사용한다. 준비된 release source에 `.git`이 없을 수 있으므로 기존 source package identity·lock·lifecycle 검증으로 확인한다.
- release staging, tarball·추출 package와 기존 release artifact 재검증은 `package`를 사용하며 `.git` marker와 무관하게 local wrapper가 있으면 거부한다.
- source 모드의 예외는 정확한 `scripts/update-superpowers-local.sh` 일반 파일 하나뿐이다. symlink·특수 파일은 거부한다. 이 파일은 읽어 실행하지 않으며 manifest·반환 `files`·설치 tree·release inventory에 넣지 않는다.
- 자동 판정은 source 배치 구분일 뿐 저장소 진위를 인증하는 보안 증명으로 표현하지 않는다.
- `files`, `modelInputs`, `snapshot`, `referenceTrees` 반환 필드는 유지하고 flat 검증 결과를 연결한다.

호출별 모드:

| 검증 호출 | 모드 | wrapper 처리 |
|---|---|---|
| management install·harness upgrade | `auto` | 검증된 source에서만 제외 |
| 명시적 maintainer source 사전 검증 | `source` | 정확한 일반 파일만 제외 |
| release source 검증 | `source` | 정확한 일반 파일만 제외 |
| release staging·tarball·artifact | `package` | 존재하면 거부 |

`update-manifest.mjs`도 동일한 정확한 경로의 일반 파일만 제외한다. npm·release 제외는 제3절의 11개 script allowlist와 package-mode 거부로 별도 보장한다.

### 설치·updater API

```text
installTargets(plans, {safeFs, signal, hooks = {}})
applyTransaction(plan, {safeFs, signal, hooks = {}, specs})
upgradeInstalledTargets({packageRoot, state, safeFs, signal})

refreshPackageReferences({
  packageRoot,
  safeFs,
  acquisition,
  signal,
  hooks = {}
})
```

일반 설치의 acquisition 인자와 `acquired.references` 의존성을 제거한다. 수동 updater의 acquisition 주입은 fixture 검사에 유지한다. 명시적 transaction `specs`와 기존 updater 결과·cleanup 계약도 유지한다.

## 3. Package script allowlist 계약

`package.json.files`에서 `scripts/` 하나를 다음 11개로 대체한다.

```text
scripts/build-native.mjs
scripts/check-installer-parity.mjs
scripts/pack-release.mjs
scripts/postinstall.mjs
scripts/probe-runtime-hooks.mjs
scripts/update-manifest.mjs
scripts/update-role-policy.mjs
scripts/update-runtime-assets.mjs
scripts/update-superpowers.mjs
scripts/vendor-toml.mjs
scripts/verify-release.mjs
```

다른 기존 package files 항목은 유지한다.

- local wrapper는 allowlist에 포함하지 않는다.
- 기존 `!**/__pycache__/**`, `!**/*.pyc` 예외와 unsupported negation 거부 계약을 유지한다.
- `inputNames()`에 새 negation 지원을 추가하지 않는다.
- release inventory는 정확한 script file 입력을 순회하므로 wrapper를 수집하지 않는다.
- staging·tarball에서 wrapper가 발견되면 별도로 거부한다.
- imported mockup script는 플랫폼 `skill/` payload의 일부이며 이 root script allowlist와 구분한다.

## 4. 작업 의존성과 준비

| 작업 | 선행 조건 | 산출물 | 현재 상태 |
|---|---|---|---|
| T1 정적 배포 계약 일괄 전환 | 계획 승인·문서 준비·handoff·검사 환경 | flat package·정적 설치·공통 updater·allowlist | 계획 승인 대기 |
| T2 local wrapper 제공 | T1 QA·수용·focused commit 검증 | ignored 실제 wrapper·ignore·배포 제외 증거 | T1 대기 |

매핑·manifest·설치·updater·package allowlist는 공유 계약이므로 T1에서 함께 전환한다. T2는 검증된 tracked updater와 제외 계약을 소비하는 별도 수용 단위다.

T1은 source fixture에 wrapper 파일을 실제로 생성하여 제외를 검증한다. 현재 worktree의 실제 wrapper 제공은 T2에서 수행한다.

각 top-level task는 하나의 focused 구현 commit이다. 하위 체크박스는 commit 단위가 아니다.

## 5. T1 — 평면 정적 payload·수동 updater·package 계약을 일괄 전환한다

**위험:** significant/high.

**범위:** 파일 지도에서 T1로 지정한 제품·문서·검사. `.gitignore`와 현재 worktree의 실제 wrapper 생성은 T2 소유다.

**선행 조건:**

- 승인된 spec·plan과 전체 문서 준비 완료
- 대상 branch·HEAD·소유권·Git 상태 확인
- 기존 검사가 요구하는 native runtime 준비
- 기준 HEAD의 imported 원본·provenance 접근 가능

검사 환경이 없으면 임의 build·dependency 변경 없이 Orchestrator에 반환한다.

### 구현 단계

- [ ] **T1.1 — 매핑·바이트 보존 검사를 먼저 작성한다.**

  `superpowers.test.mjs`에 다음 계약을 고정한다.

  ```text
  maps all thirteen original files without changing bytes
  rejects unsupported files and links before flattening
  requires builder-check-prompt.md
  validates platform-local provenance and parity
  ```

  기대 경로는 명세 값으로 독립적으로 고정한다. production mapping을 읽어 기대값을 복제하지 않는다.

  `fake-git.mjs`의 필수 목록에 `builder-check-prompt.md`를 추가한다. `static-references.mjs`는 고정 bundle의 테스트 package 구성만 담당한다.

- [ ] **T1.2 — 매핑 RED를 확인한다.**

  ```bash
  node --test tests/node/superpowers.test.mjs
  ```

  예상: 새 flat 계약 부재로 실패한다. 환경 오류는 RED로 인정하지 않는다.

- [ ] **T1.3 — 공통 매핑·검증·정적 트리 인터페이스를 구현한다.**

  `superpowers.mjs`에서 원본 경로와 목적지의 provenance 대응을 구현한다. 기존 acquisition snapshot 검증과 legacy uninstall 검증은 보존한다.

- [ ] **T1.4 — manifest·updater·package·release 검사를 먼저 작성한다.**

  `manifest`, `package-references`, `package`, `release-artifact` 검사에 다음을 추가하거나 전환한다.

  ```text
  protects every imported destination statically
  rejects a missing required file after manifest regeneration
  publishes both flat platforms and manifest consistently
  restores both platforms and manifest on publication failure
  reports cleanup residual paths
  preserves ARC-owned policy and unrelated script sentinels
  packs all eleven tracked root scripts with a local wrapper present
  excludes only the local wrapper from source and artifacts
  rejects unsupported package negations
  auto mode rejects the local wrapper when valid source evidence is absent
  explicit package mode rejects the local wrapper regardless of source markers
  auto mode with valid source evidence excludes only the exact regular wrapper
  source validation excludes only the exact regular wrapper
  source install and upgrade never add the wrapper to verified files or installed trees
  auto mode accepts valid directory and worktree-file source markers
  auto mode rejects malformed or symlinked source markers without Git or network calls
  release source accepts the wrapper while staging and tarball reject it
  ```

  API 기본값은 `auto`다. 유효한 source 근거가 없으면 package 규칙으로 wrapper를 거부한다. 명시적 `package` 모드는 source marker가 있어도 wrapper를 거부한다.

  package fixture에는 `scripts/update-superpowers-local.sh` 파일을 실제로 둔다. npm pack 결과에서 11개 root script 각각의 존재와 wrapper 부재를 확인한다. 단순 `pkg.files` 문자열 비교로 대체하지 않는다.

- [ ] **T1.5 — 관련 RED를 확인한다.**

  ```bash
  node --test tests/node/manifest.test.mjs tests/node/package-references.test.mjs tests/node/package.test.mjs tests/node/release-artifact.test.mjs
  ```

  예상: 동적 예외·중첩 게시·broad scripts 포함 때문에 실패한다.

- [ ] **T1.6 — manifest와 transactional updater를 구현한다.**

  공통 manifest 직렬화를 사용한다. updater는 다음을 한 처리 흐름으로 수행한다.

  1. 현재 static payload와 목적지를 검증·snapshot한다.
  2. 한 번의 수집 결과를 검증하고 평면 매핑한다.
  3. 양 플랫폼 candidate file map에 같은 바이트를 적용한다.
  4. candidate manifest를 메모리에서 만든다.
  5. mapped 자산 26개와 manifest를 하나의 게시·복원 경계로 처리한다.
  6. cleanup·AggregateError·잔여 경로 보고를 유지한다.

  `references/`나 `references/scripts/` 전체를 updater 소유 tree로 교체하지 않는다.

  tracked Node script는 script 위치 기준 package root와 공통 API 호출을 유지한다.

- [ ] **T1.7 — broad scripts를 정확한 allowlist로 교체한다.**

  `package.json.files`의 `scripts/`를 이 계획 3절의 11개 파일로 바꾼다.

  `artifact.mjs`는 기존 unsupported negation 거부를 유지한다. 정확한 script 입력 inventory를 사용하고 staging·tarball wrapper 유입을 거부한다.

  `manifest.mjs`·`update-manifest.mjs`는 source에 있는 정확한 local wrapper 일반 파일만 허용·제외한다. 다른 shell·script 파일을 광범위하게 제외하지 않는다.

  package·release fixture가 directory entry를 가정했다면 정확한 file entry 복사도 지원하도록 변경한다.

- [ ] **T1.8 — 정적 설치·upgrade·legacy 검사를 먼저 작성한다.**

  `install`, `all-targets`, `management-operations`, `upgrade-harness`, `uninstall`, `consumer`에서 fresh acquisition 기대를 제거한다.

  필수 assertions:

  - 플랫폼별 설치 바이트가 검증된 package와 일치
  - acquisition 없이 install·upgrade 성공
  - source 근거가 있는 package root에 local wrapper가 있어도 정적 install·upgrade 성공
  - wrapper가 검증된 `files`와 설치 tree에 포함되지 않음
  - `.git` 디렉터리·worktree 파일, package-lock identity와 lifecycle-free 조건을 각각 검증
  - Git/updater trap 호출 0회
  - scripts-disabled·읽기 전용 package 불변
  - custom `CODEX_HOME`·공백 경로 지원
  - stale 중첩 tree 제거
  - 모델·언어·limits·native drift·외부 sentinel 보존
  - 두 번째 target 실패 시 첫 번째 성공 유지
  - legacy 내부 링크 uninstall의 허용·거부 경계 유지
  - snapshot drift·rollback·cleanup 결과 유지

- [ ] **T1.9 — 설치 RED를 확인한다.**

  ```bash
  node --test tests/node/install.test.mjs tests/node/all-targets.test.mjs tests/node/management-operations.test.mjs tests/node/upgrade-harness.test.mjs tests/node/uninstall.test.mjs tests/node/consumer.test.mjs
  ```

  예상: 현재 acquisition·중첩 경로 의존성으로 실패한다.

- [ ] **T1.10 — 원본 배치와 정적 설치 연결을 순서대로 구현한다.**

  선행 RED:

  - T1.1–T1.2: 매핑·원본 바이트·필수 파일
  - T1.4–T1.5: 정적 manifest·updater·package
  - T1.8–T1.9: 정적 설치·upgrade·legacy 호환

  아래 체크박스는 모두 T1 내부 진행 기록이며 별도 수용·commit 단위가 아니다.

- [ ] **T1.10a — Codex ARC 시각화 정책을 이동한다.**

  `codex/skill/references/visual-companion.md`를 `codex/skill/references/arc-visual-companion.md`로 옮긴다.

  확인: 이동 직후 내용이 기존 Codex 정책과 바이트 단위로 같다. 경로·A/B 안내 변경은 T1.12에서 수행한다.

- [ ] **T1.10b — Claude ARC 시각화 정책을 이동한다.**

  `claude/skill/references/visual-companion.md`를 `claude/skill/references/arc-visual-companion.md`로 옮긴다.

  확인: 기존 Claude 정책이 그대로 보존되며 Codex 정책으로 대체되지 않았다.

- [ ] **T1.10c — Codex imported 파일 13개를 평면 목적지에 복사한다.**

  명세의 원본→목적지 매핑만 사용한다.

  확인: 목적지 13개가 일반 파일이며 대응 원본과 바이트가 같다.

- [ ] **T1.10d — Claude imported 파일 13개를 평면 목적지에 복사한다.**

  같은 매핑을 사용한다.

  확인: 원본 바이트가 보존되고 대응 Codex imported 파일과 같다.

- [ ] **T1.10e — 두 플랫폼의 바이트 보존 증거를 기록한다.**

  기준 HEAD의 원본과 목적지 파일을 비교한다. provenance의 12개 해시와 provenance 자체 바이트도 확인한다.

  확인: 13개×2의 비교 결과에 누락·불일치가 없다. T1.1의 매핑 검사를 함께 사용한다.

- [ ] **T1.10f — Codex의 기존 중첩 imported tree를 제거한다.**

  T1.10e가 통과한 뒤 `codex/skill/references/superpowers/`를 제거한다.

  확인: 평면 파일·ARC 정책은 남고 해당 중첩 tree만 없어졌다.

- [ ] **T1.10g — Claude의 기존 중첩 imported tree를 제거한다.**

  같은 조건으로 `claude/skill/references/superpowers/`를 제거한다.

  확인: 평면 파일·ARC 정책 보존과 중첩 tree 부재를 확인한다.

- [ ] **T1.10h — `plan.mjs`의 정적 skill payload 구성을 연결한다.**

  `renderSkillPayload()`가 검증된 플랫폼별 package files를 그대로 복사하도록 유지한다. imported 파일에 언어 렌더링이나 별도 치환을 적용하지 않는다.

  설치 요약의 최신 수집 설명을 정적 package 참조 설치 설명으로 바꾼다.

  확인: T1.8의 generated payload 검사가 새 경로·바이트를 확인한다.

- [ ] **T1.10i — `transaction.mjs`의 기본 설치 tree 입력을 변경한다.**

  `composeStaticArcSkillTree(plan.generated.skill)`을 사용하고 `acquired.references` 의존성을 제거한다.

  확인: 기존 명시적 `specs`, snapshot, rollback·cleanup 경로는 유지된다.

- [ ] **T1.10j — `install.mjs`에서 acquisition 단계를 제거한다.**

  승인된 설치 API로 전환하고 acquisition 호출·전용 dispose 처리를 제거한다.

  확인: acquisition 인자 없이 정적 설치가 가능하며 target 결과·취소·실패 중단 계약은 유지된다.

- [ ] **T1.10k — `operations.mjs`의 자동 acquisition 연결을 제거한다.**

  관리 실행 경로에서 acquisition 생성·전달을 제거한다.

  확인: management install이 정적 설치 API를 호출하고 Git/updater trap을 호출하지 않는다.

- [ ] **T1.10l — `upgrade.mjs`의 자동 acquisition 연결을 제거한다.**

  검증된 package payload와 기존 state로 upgrade 계획을 실행한다.

  확인: T1.8의 upgrade 검사가 설정 보존·stale 중첩 제거·부분 target 실패를 검증한다.

- [ ] **T1.10m — legacy uninstall 검증을 보존한다.**

  `uninstall.mjs`에서 기존 중첩 설치본의 안전한 내부 링크 검증을 유지한다. 새 평면 파일은 일반 ARC 관리 파일로 제거한다.

  확인: 기존 링크 허용·거부와 외부 sentinel 보존 검사가 유지된다.

  이 구간의 전체 GREEN은 ARC 안내와 manifest까지 준비된 T1.14에서 판정한다. 중간 상태의 stale manifest나 미갱신 안내를 완료 상태로 수용하지 않는다.

- [ ] **T1.11 — ARC 경로 구조 검사를 먼저 갱신한다.**

  `tests/test_arc_policy.py`의 `InternalSuperpowersContractTests`를 양 플랫폼 flat 경로와 ARC/upstream 시각화 정책 분리에 맞춘다.

  reference-link 소비자 검사는 실제 설치 파일을 따라간다. 역사 문서·legacy 검사와 활성 안내의 옛 경로를 구분한다.

- [ ] **T1.12 — ARC-owned 안내와 문서를 갱신한다.**

  지정된 root skill·references·프로필을 새 경로로 바꾼다. managed policy block 의미를 변경하지 않는다.

  ARC 시각화 정책에 기준 디렉터리, 후속 채팅 필요, 정확한 세션 이벤트 읽기, 현재 채팅 우선, 표시와 저장의 구분을 명시한다.

  `docs/harness-operation.md`에서 per-install fetch를 제거하고 정적 설치와 직접 실행 updater를 구분한다.

- [ ] **T1.13 — 자동 비호출·A/B 집중 검사를 작성한다.**

  lifecycle 검사는 자동 실행 경로에 Git/updater fail-fast trap을 사용한다. 문자열 부재만으로 비호출을 입증하지 않는다.

  packed consumer의 Git fixture는 호출 시 실패하게 바꾸고 offline·ignore-scripts 조건과 source 접근 guard를 유지한다.

  A/B 검사는 원본 helper·서버로 선택 class·이벤트 전달·동일 세션 B 기록을 확인한다. upstream 파일은 수정하지 않는다.

- [ ] **T1.14 — manifest와 집중 GREEN을 확인한다.**

  ```bash
  node scripts/update-manifest.mjs
  node scripts/update-manifest.mjs --check
  node scripts/update-role-policy.mjs --check
  ```

  예상: imported 전체 정적 보호, local wrapper 제외, policy 검사 통과.

  ```bash
  node --test tests/node/superpowers.test.mjs tests/node/acquisition.test.mjs tests/node/package-references.test.mjs tests/node/manifest.test.mjs
  node --test tests/node/install.test.mjs tests/node/all-targets.test.mjs tests/node/management-operations.test.mjs tests/node/upgrade-harness.test.mjs tests/node/uninstall.test.mjs
  node --test tests/node/package.test.mjs tests/node/consumer.test.mjs tests/node/release-artifact.test.mjs tests/node/superpowers-lifecycle.test.mjs tests/node/visual-companion.test.mjs
  python3 -m unittest discover -s tests -p test_arc_policy.py -k InternalSuperpowersContractTests
  ```

  예상: 관련 실패 0·종료 코드 0. 자동 경로의 Git/updater 호출 0. acquisition 검사는 fake subprocess만 사용한다.

- [ ] **T1.15 — fresh QA와 실제 후속 채팅 증거를 확보한다.**

  QA 자동 검사, 실제 브라우저 관찰, 실제 assistant 다음 턴 행동을 별도 증거로 기록한다. 앞 단계의 통과로 뒤 단계를 대신하지 않는다.

- [ ] **T1.15a — fresh QA가 최종 구현 상태를 확인한다.**

  대상 revision과 미커밋 diff, 검사 명령·결과를 기록한다. 기준 HEAD 원본과 평면 목적지의 바이트를 직접 비교한다.

- [ ] **T1.15b — 시각화 검증 세션을 준비한다.**

  Orchestrator는 기존 ARC 정책에 따라 visual companion 동의·서버·브라우저 운영 책임을 유지한다.

  검증용 `<project>`는 절대 경로의 임시 프로젝트로 정한다. source·사용자 파일과 분리하고 예상 생성 위치를 기록한다.

  실행 기준 디렉터리는 검증 대상 설치본의 `skills/arc/references/`다.

- [ ] **T1.15c — 원본 시작 명령으로 서버를 실행한다.**

  ```bash
  bash scripts/start-server.sh --project-dir <project> --open
  ```

  원본 startup stdout에서 다음 필드를 기록한다.

  ```text
  url
  screen_dir
  state_dir
  port
  ```

  stdout을 확보하지 못했다면 이번 실행으로 생성된 다음 파일을 읽는다.

  ```text
  <project>/.superpowers/brainstorm/<session>/state/server-info
  ```

  다른 세션을 추정해서 선택하지 않는다. URL은 `?key=…`를 포함한 전체 값을 사용한다. session directory와 `screen_dir`·`state_dir`의 대응을 기록한다.

- [ ] **T1.15d — A/B 화면을 표시하고 실제 하이라이트를 확인한다.**

  승인된 예제 방식의 `data-choice`·`toggleSelect` 화면을 해당 `screen_dir`에 표시한다.

  서버가 살아 있음을 확인한 뒤 브라우저에서 전체 keyed URL로 접근한다. B를 선택하고 QA가 실제 선택 하이라이트를 관찰한다.

  증거: 대상 설치 revision, session 식별자, 화면 내용, 브라우저 관찰 결과. DOM 대역의 자동 검사만으로 이 단계를 통과시키지 않는다.

- [ ] **T1.15e — 같은 세션의 이벤트 저장을 별도로 확인한다.**

  T1.15c에서 기록한 정확한 다음 경로를 읽는다.

  ```text
  <state_dir>/events
  ```

  B 선택 이벤트가 JSON lines에 저장되었는지 확인한다. 브라우저 하이라이트만으로 저장 성공을 판단하지 않는다.

  증거: 세션 경로, 읽은 이벤트, 선택 값, 해당 화면과의 대응. QA의 이 파일 읽기는 저장 검증이며 assistant의 다음 턴 소비 증거가 아니다.

- [ ] **T1.15f — 후속 채팅이 필요한 동작을 사용자에게 안내한다.**

  Orchestrator는 전체 URL과 화면 내용을 안내하고, 선택 후 채팅으로 돌아와 후속 메시지를 보내도록 설명한다.

  클릭만으로 채팅이 자동 재개되거나 assistant가 즉시 응답한다고 약속하지 않는다. 안내 후 실제 사용자 후속 턴을 기다린다.

- [ ] **T1.15g — 실제 후속 사용자 턴에서 이벤트를 소비한다.**

  사용자의 실제 후속 메시지가 도착한 턴에서 Orchestrator가 해당 `<state_dir>/events`를 다시 읽는다. 이전 QA 파싱 결과를 대신 전달받는 것만으로 완료하지 않는다.

  현재 채팅 내용과 이벤트를 함께 해석하여 B 선택을 실제 응답이나 다음 결정에 반영한다.

  증거: 실제 사용자 후속 메시지, 그 턴의 정확한 이벤트 파일 읽기, 선택을 반영한 assistant 행동.

- [ ] **T1.15h — 현재 채팅 우선 조건을 확인한다.**

  별도 검증 사례에서 브라우저 이벤트와 현재 채팅 내용이 다를 때 채팅을 우선하는지 확인한다. 모호하면 확인하며 이벤트만으로 선택을 확정하지 않는다.

  실제 행동 증거가 없으면 자동 안내 문구 검사나 파서 검사만으로 통과시키지 않는다.

- [ ] **T1.15i — 세션을 정리하고 증거 판정을 기록한다.**

  원본 종료 절차를 사용한다.

  ```bash
  bash scripts/stop-server.sh <session_dir>
  ```

  종료 결과와 남는 임시 자산을 기록하고 승인된 정리 범위만 처리한다.

  다음을 각각 판정한다.

  | 증거 수준 | 판정 대상 |
  |---|---|
  | 자동 검사 | helper·서버·이벤트 경로의 프로그램 동작 |
  | 실제 브라우저 | B 하이라이트 |
  | 같은 세션 파일 | B 이벤트 저장 |
  | 실제 후속 채팅 턴 | 이벤트 재읽기와 선택 반영 |
  | 충돌 사례 | 현재 채팅 우선 |

**수용 보류:** 실제 후속 사용자 턴이 아직 발생하지 않았거나 그 턴의 이벤트 읽기·assistant 반영 증거가 없으면 AC-14와 T1 수용을 보류한다. 자동 검사·브라우저 표시·저장 성공만으로 해제하지 않는다. 기다리는 동안 완료된 독립 증거는 보존한다.

### T1 수용·보류·commit

**수용 범위:** AC-01–14·AC-17, AC-16의 allowlist·fixture 기반 구현.

필수 증거는 원본·parity·manifest, 정적 설치, legacy 호환, updater 복원, 11개 script 유지와 wrapper 제외, lifecycle 비호출, ARC 정책, A/B의 분리된 판정이다.

원본 불일치·자동 acquisition·부분 복원·package 누락/유입·호환 회귀·필수 검사 실패·실제 다음 턴 증거 부재는 수용을 보류한다. baseline과 current 실패를 구분하며 관련 없는 검사를 함께 보류하지 않는다.

흐름: Implementer → fresh QA·필요 재검증 → Orchestrator 수용 → focused commit.

제안 메시지:

```text
feat(superpowers): install verified flat reference assets
```

Reviewer는 per-task 수용 조건이 아니다.

## 6. T2 — ignored local shell entrypoint를 제공한다

**위험:** ordinary behavior.

**선행 조건:** T1 QA·Orchestrator 수용·focused commit 검증 완료.

**파일:** 실제 local wrapper, `.gitignore`, `docs/harness-operation.md`, `tests/node/local-updater.test.mjs`, 필요한 package/release 실제 파일 조건 검사.

### 인터페이스

wrapper는 자신의 디렉터리에서 sibling `update-superpowers.mjs`를 찾아 Node로 실행한다. 인자·stdout·stderr·종료 코드를 보존한다.

예상치 못한 기존 wrapper가 있으면 덮어쓰지 않는다.

### 구현 단계

- [ ] **T2.1 — wrapper 검사를 먼저 작성한다.**

  `tests/node/local-updater.test.mjs`는 다음 필수 모드 인터페이스를 지원한다.

  ```text
  ARC_REQUIRE_LOCAL_UPDATER=1
  ```

  필수 모드가 아니고 local wrapper가 없으면 검사 그룹을 명시적으로 skip한다. 필수 모드에서는 그룹을 skip하지 않는다. 필수 모드의 첫 assertion은 실제 wrapper 존재 여부이며 없으면 `required local updater is missing`으로 실패한다.

  wrapper가 있으면 실제 local 파일을 임시 공백 경로에 같은 바이트로 복사하고 fixture의 stub Node·dummy updater를 사용한다.

  assertions:

  ```text
  resolves sibling updater from another cwd
  preserves spaced arguments
  preserves stdout, stderr and exit code 23
  contains no duplicate upstream acquisition logic
  matches the exact root ignore pattern
  ```

  일반 clone에서는 기본 소비자 검사가 wrapper 부재만으로 실패하지 않는다. 현재 worktree의 T2 RED·GREEN·fresh QA에서는 필수 모드를 사용한다. 실제 worktree wrapper와 tracked updater는 실행하지 않는다.

- [ ] **T2.2 — RED를 확인한다.**

  ```bash
  ARC_REQUIRE_LOCAL_UPDATER=1 node --test tests/node/local-updater.test.mjs
  ```

  wrapper 생성 전이므로 `required local updater is missing` assertion으로 실패하며 그룹은 skip되지 않는다. import 오류·검사 환경 실패·기본 모드의 skip은 의도한 RED로 인정하지 않는다.

- [ ] **T2.3 — wrapper와 ignore를 생성한다.**

  ```gitignore
  /scripts/update-superpowers-local.sh
  ```

  wrapper에 직접 실행 권한을 주고 자신의 디렉터리를 계산하여 `exec node`로 tracked updater를 호출하게 한다.

  실제 wrapper·Node updater는 실행하지 않는다.

- [ ] **T2.4 — 사용자 문서를 완성한다.**

  직접 실행 목적, 최신 수집·vendored 변경 효과, 현재 worktree 전용 경로, Git·package·release 미포함을 설명한다.

  다른 clone/worktree에 자동 제공된다고 안내하지 않는다.

- [ ] **T2.5 — 격리된 전달 GREEN을 확인한다.**

  ```bash
  ARC_REQUIRE_LOCAL_UPDATER=1 node --test tests/node/local-updater.test.mjs
  git check-ignore -v -- scripts/update-superpowers-local.sh
  git ls-files -- scripts/update-superpowers-local.sh
  ```

  예상: wrapper 검사 통과, 실패 0·skip 0, exact ignore 식별, tracked 출력 없음, stub 종료 코드 `23`·출력 보존, 실제 updater·upstream 실행 없음.

- [ ] **T2.6 — 실제 local 파일 존재 상태에서 allowlist 제외를 확인한다.**

  ```bash
  node scripts/update-manifest.mjs --check
  ARC_REQUIRE_LOCAL_UPDATER=1 node --test --test-name-pattern='^source auto install excludes the current worktree local wrapper$' tests/node/management-operations.test.mjs
  ARC_REQUIRE_LOCAL_UPDATER=1 node --test --test-name-pattern='^source auto upgrade excludes the current worktree local wrapper$' tests/node/upgrade-harness.test.mjs
  node --test tests/node/package.test.mjs tests/node/release-artifact.test.mjs tests/node/superpowers-lifecycle.test.mjs
  ```

  `management-operations.test.mjs`와 `upgrade-harness.test.mjs`에 위 두 이름의 검사를 추가한다. 실제 worktree package root와 wrapper를 사용하되 설치 대상은 임시 HOME이다. 필수 모드에서는 wrapper 부재나 해당 검사 skip을 허용하지 않는다.

  필수 결과:

  - source auto 판정이 현재 worktree의 ignored wrapper를 payload 밖에 둔 채 정적 install·upgrade를 허용
  - package files에 broad `scripts/`와 새 unsupported negation 없음
  - 승인된 root script 11개 모두 npm package에 존재
  - 실제 wrapper가 source에 있어도 manifest·npm package·release inventory·staging·tarball에 없음
  - 다른 root script·imported mockup 자산 보존
  - 자동 updater 호출 0
  - source wrapper·manifest와 실제 worktree 파일에 변동 없음

  새 실제 local 입력이 생겼으므로 이 재검사는 필요한 상태 변경 검증이다.

- [ ] **T2.7 — fresh QA로 실제 local 산출물을 확인한다.**

  QA는 wrapper의 바이트·권한·ignore·미추적 상태를 확인한다. 전달 동작은 임시 복사본과 stub Node로만 검사한다.

  fresh QA도 `ARC_REQUIRE_LOCAL_UPDATER=1`로 검사를 직접 실행한다. 기본 소비자 모드의 skip은 T2 수용 증거로 사용하지 않는다.

  T2.6의 두 필수 source install·upgrade 검사도 fresh QA가 직접 실행한다. 두 검사는 각각 PASS하고 skip되지 않아야 한다.

  11개 script 유지와 실제 wrapper 제외를 독립적으로 확인한다.

### T2 수용·보류·commit

**수용 범위:** AC-15·AC-16, wrapper 추가 후 AC-13 재확인.

필수 증거는 실제 절대 경로·존재·권한, ignore·미추적 상태, 격리된 전달 결과, 실제 파일 존재 상태의 전체 배포 제외다.

기존 파일 충돌·Git 추적·별도 수집 로직·종료 코드 손실·기존 script 누락·wrapper 유입·실제 updater 실행은 affected 수용을 보류한다.

흐름: Implementer → fresh QA·필요 재검증 → Orchestrator 수용 → tracked 변경만 focused commit.

```text
feat(superpowers): provide an ignored local updater entrypoint
```

wrapper는 commit하지 않고 수용된 local 산출물로 canonical record에 기록한다.

## 7. AC 소유·증거 지도

| AC | 소유 | 증거 |
|---|---|---|
| AC-01–03 | T1 | 13개 매핑·원본 바이트·parity |
| AC-04 | T1 | 상대 경로·mockup 자산 제공 |
| AC-05–06 | T1 | no-acquisition 설치·읽기 전용 consumer |
| AC-07 | T1 | 정적 manifest·provenance·필수 누락 거부 |
| AC-08–09 | T1 | ARC 경로·플랫폼 정책 보존 |
| AC-10–11 | T1 | legacy upgrade/uninstall·rollback |
| AC-12 | T1 | tarball 정적 payload |
| AC-13 | T1, T2 재확인 | 자동 lifecycle 비호출 |
| AC-14 | T1 | 표시·동일 세션 저장·실제 다음 턴 |
| AC-15 | T2 | local wrapper·ignore·stub 전달 |
| AC-16 | T1 기반, T2 완료 | 11개 script allowlist·실제 wrapper 제외 |
| AC-17 | T1 | fixture updater·양 플랫폼/manifest 복원 |

## 8. 최종 전체 검증과 Reviewer

모든 작업의 required QA·수용·focused commit 후 수행한다.

1. Orchestrator가 승인 문서 버전·전체 diff·task commit·ignored 산출물·branch·HEAD·남은 변경을 확인한다.
2. 마지막 변경으로 유효성이 달라진 검사만 재실행한다.
3. AC-01–17 증거와 미검증 항목을 확인한다.
4. 독립 Reviewer가 최종 전체 변경을 한 번 검토한다. ignored wrapper 내용과 package allowlist도 포함한다.
5. final Reviewer finding은 Implementer → Reviewer 재검토로 해결한다. 이 단계에서는 QA를 재배정하지 않는다.
6. Orchestrator가 최종 수용과 완료를 결정한다.

초기 final Reviewer 이전의 QA 실패는 Implementer 수정 → QA 재검증으로 해결한다. 과거 QA 증거를 수정 후 실행 증거로 표시하지 않는다.

완료 보고에는 wrapper의 현재 worktree 전용 절대 경로와 Git·release 미포함을 명시한다.

## 9. 문서·실행 준비와 Git 경계

spec과 plan 모두 사용자에게 승인되었다. Orchestrator는 승인된 문서 세트의 batch commit과 readiness handoff를 완료한 뒤 T1을 시작한다.

Orchestrator는 plan 저장·버전 승인, 전체 문서 세트 확인, batch document commit, target·소유권 검증 후 readiness를 canonical record에 등록한다.

계획 작성·승인 중 문서를 stage·commit하지 않는다. T1/T2 수용 및 commit은 Orchestrator만 수행한다. passing check나 역할 보고만으로 후속 작업을 해제하지 않는다.

## 10. 자체 점검

- **AC-16 보정:** unsupported negative entry 제안을 제거하고 exact tracked script allowlist로 교체했다.
- **기존 script 보존:** 11개 파일 각각의 실제 npm pack 포함을 요구한다.
- **제외 경계:** `.gitignore`·manifest·npm allowlist·release inventory·tarball을 구분했다.
- **기존 거부 계약:** unsupported negation·glob 거부를 완화하지 않는다.
- **실제 local 입력:** T1 fixture와 T2 현재 worktree 파일 모두에서 제외를 검증한다.
- **명세 커버리지:** AC-01–17의 소유 작업·증거를 유지했다.
- **작업 경계:** 공유 계약은 T1, 이를 소비하는 local entrypoint는 T2다.
- **원본·호환성:** 바이트 보존·legacy 제거·rollback·설정 보존을 유지했다.
- **검사:** RED→구현→GREEN과 fresh QA를 포함한다. 환경 오류는 RED나 통과로 취급하지 않는다.
- **금지 실행:** 실제 updater·실제 wrapper·upstream fetch를 수행하지 않는다.
- **A/B:** 자동 검사로 실제 다음 턴 행동을 대체하지 않는다.
- **Reviewer·commit:** per-task Reviewer 없이 최종 전체 검토를 두며 Orchestrator만 수용·commit한다.
- **target 보존:** source `master` 이동을 선택 target에 자동 반영하지 않는다.

본 통합본은 package allowlist, ARC handoff, source/package 검증 경계, T2 필수 검사 모드와 실제 후속 채팅 증거 절차를 반영했다. Planner는 초안 작성과 읽기 전용 자체 점검을 수행했고, 문서 저장·통합은 Orchestrator가 수행했다. 계획은 아직 승인 대기이며 구현·테스트 실행·실제 updater 실행·upstream fetch 결과를 주장하지 않는다.
