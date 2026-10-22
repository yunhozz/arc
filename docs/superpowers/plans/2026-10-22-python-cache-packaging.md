# Python 캐시 배포 제외와 0.1.8 준비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> 역할·승인·수용·commit에는 ARC 계약이 우선한다. 아래는 향후 실행 계획이며 계획 작성 중 제품·테스트 코드 수정이나 검증 명령 실행은 하지 않았다.

**Goal:** npm 포장에서 Python 캐시를 제외하고 기존 release 검증을 유지하면서 `@yunhozz/arc@0.1.8`을 준비한다.

**Architecture:** `package.json.files`에 정확한 두 negative glob을 추가하고 release 입력 해석기에서 해당 항목만 건너뛴다. inventory와 verifier는 유지하며 package·lockfile·manifest를 함께 갱신한다.

**Tech Stack:** Node.js `>=22`, npm `10.9.4`, ESM, `node:test`, 기존 manifest·release API.

**Spec:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-22-python-cache-packaging-design.md`

**Plan:** `/Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-22-python-cache-packaging.md`

## Global Constraints — 공통 제약

- 대상: `/Users/ma-24-007/Desktop/workspace/arc`, `master`, 기준 HEAD `83010c623e59a64a8ef9a7f11b20c0b70aa111e6`.
- 승인된 제품 변경 범위는 아래 네 파일이다. 기존 테스트 두 파일 수정은 **회귀 제안이며 계획 승인에서 범위 확장을 결정한다.**
- **계획 승인과 사용자 실행 방식 선택 이후에만 구현·테스트·검증을 수행한다.** 실행 방식 선택은 계획에 명시한 테스트·검증 단계의 실행 요청을 포함한다.
- 제외 규칙은 `!**/__pycache__/**`, `!**/*.pyc` 두 문자열로 한정한다.
- verifier·inventory·manifest 생성 규칙·lifecycle·workflow·의존성은 변경하지 않는다.
- 공식 release는 캐시가 없는 source를 요구한다. 자동 삭제나 검증 우회는 추가하지 않는다.
- fixture는 임시 source·HOME·cache·npmrc를 사용한다.
- publish·push·merge·global package 변경은 제외한다.
- T1 하나를 하나의 focused implementation commit으로 수용한다.

## Review Focus — 검토 중점

1. 두 harness와 다른 포함 디렉터리의 중첩 `__pycache__` 제외.
2. 캐시 밖 `.pyc` 제외와 일반·필수 runtime 파일 보존.
3. 정확한 두 규칙 이외의 glob·negation 거부.
4. 캐시가 있는 source의 공식 release 거부 유지.
5. `0.1.8` metadata·manifest·최종 산출물 일치.

## Task T1 — Python 캐시 포장 제외와 patch 준비

**선행 조건:** 승인 spec, 테스트 파일 범위를 포함한 계획 승인, 사용자 실행 방식 선택.

**Files:** 다음 경로는 모두 `/Users/ma-24-007/Desktop/workspace/arc/` 기준이다.

- Modify: `package.json`
- Modify: `lib/release/artifact.mjs` — `inputNames`
- Modify: `package-lock.json`
- Generate: `MANIFEST.sha256`
- Test — 범위 확장 제안: `tests/node/package.test.mjs`
- Test — 범위 확장 제안: `tests/node/release-artifact.test.mjs`

Coder 한 명이 승인된 파일을 소유한다. 범위 밖 변경이나 충돌은 Orchestrator에게 반환한다.

**Interfaces:**

- `inputNames(pkg) → string[]`: 정확한 두 제외 항목만 건너뛰고, 다른 negation·미지원 glob은 `Unsupported package files entry`로 거부한다.
- `buildReleaseArtifact({sourceRoot,outDir,npmCli,signal?,deps?})`와 `verifyReleaseArtifact({outDir,expectedName,expectedVersion})`의 계약은 유지한다.
- package 테스트는 직접 npm 포장을, release 테스트는 임시 source의 입력 해석·검증을 소유한다. 테스트용 제품 API는 추가하지 않는다.

- [ ] **1. 회귀 테스트를 작성한다 — RED 준비.**

`tests/node/package.test.mjs`의 기존 pack helper에 임시 `cwd` 지원을 최소 추가한다. npm 인수 `pack --dry-run --json --ignore-scripts --offline`과 환경 격리는 유지한다.

| 테스트 이름 | 고정할 assertion |
|---|---|
| `npm pack excludes Python caches and preserves runtime files` | 임시 source의 codex·claude scripts 및 `lib`에 중첩 캐시와 캐시 밖 `.pyc` 배치. 파일 목록에 `__pycache__` 경로·`.pyc` 없음. 일반 sentinel, `bin/arc.mjs`, `MANIFEST.sha256`, 양쪽 `skill/SKILL.md` 있음 |
| `patch metadata agrees at version 0.1.8` | package 버전, lockfile 최상위 버전, `packages[""]` 버전 모두 `0.1.8` |

`tests/node/release-artifact.test.mjs`의 기존 fixture를 재사용한다.

| 테스트 이름 | 고정할 assertion |
|---|---|
| `release accepts only approved package exclusions` | 정확한 두 규칙을 가진 깨끗한 fixture의 release 생성·검증 성공. `!lib/`, `lib/**/*.mjs`를 각각 추가한 fixture는 `Unsupported package files entry`로 실패 |
| `cached source is rejected before pack` | manifest 생성 후 `__pycache__/sentinel.pyc`를 추가한 source는 payload 검증 오류로 실패. 주입한 pack callback 호출 횟수는 `0` |

fixture의 정상 파일·metadata 변경은 manifest에 반영한다. 캐시 거부 사례는 generator가 제외하는 캐시를 사용한다.

- [ ] **2. 기대한 실패를 확인한다 — RED.**

```bash
node --test tests/node/package.test.mjs tests/node/release-artifact.test.mjs
```

캐시 포함·규칙 처리·버전 assertion 때문에 실패하는지 확인한다. 환경 오류를 RED로 인정하지 않는다.

- [ ] **3. 제품 변경을 구현한다.**

`package.json.files`의 기존 포함 항목 뒤에 추가한다.

```json
"!**/__pycache__/**",
"!**/*.pyc"
```

`inputNames`에서 두 문자열만 먼저 구분해 건너뛴다. 나머지 항목은 기존 경로 검증과 glob 거부를 유지하고, 지원하지 않는 `!` 항목도 명시적으로 거부한다.

`package.json.version`, `package-lock.json.version`, `package-lock.json.packages[""].version`을 `0.1.8`로 맞춘다.

- [ ] **4. manifest를 생성한다.**

```bash
node scripts/update-manifest.mjs
```

보호 source가 이후 변경되면 다시 생성한다.

- [ ] **5. 집중 회귀와 manifest를 확인한다 — GREEN.**

```bash
node --test tests/node/package.test.mjs tests/node/release-artifact.test.mjs tests/node/release-artifact-process.test.mjs
npm run check:manifest
```

기대 결과는 지정 회귀 전체 통과와 manifest 검사 성공이다.

- [ ] **6. 공식 release 산출물을 확인한다.**

캐시가 없는 source에서 다음을 실행한다.

```bash
arc_release_parent="$(mktemp -d)"
npm run pack:release -- --out-dir "$arc_release_parent/release"
node scripts/verify-release.mjs --out-dir "$arc_release_parent/release" --name @yunhozz/arc --version 0.1.8
tar -tzf "$arc_release_parent/release/arc-release.tgz"
```

검증 성공, tarball의 캐시 제외, 필수 파일 보존을 확인한다. 생성된 산출물을 게시하지 않는다.

- [ ] **7. Orchestrator가 T1을 수용·commit한다.**

캐시 제외·파일 보존, 미지원 규칙 거부, source 검증 유지, metadata·manifest 일치, 공식 산출물 검증 근거를 확인한다. 필요한 QA와 실패 재검증 완료 후 승인된 변경을 하나의 focused implementation commit으로 기록한다.

**보류 조건:** 승인·실행 방식 미확정, 예상과 다른 Git 상태, 필요한 환경 부재, 필수 파일 누락, 제외 동작 차이, 승인 범위 밖 수정 필요. 필요한 근거를 확보하지 못하면 수용을 보류한다.

## 최종 검토와 자체 검토

significant/high-risk로 분류하면 T1 수용과 필수 QA 완료 후 최종 전체 변경에 대한 독립 Reviewer 검토를 한 번 수행하고 필요한 finding을 재검토한다. Reviewer를 task별 gate로 두지 않는다.

다섯 검토 중점을 package·release 회귀와 manifest·공식 산출물 확인에 연결했다. 제품 네 파일과 승인 대상 테스트 두 파일을 구분했고, 단일 task·단일 구현 commit을 유지했다. 계획 작성 중 제품·테스트 코드 수정이나 검증 명령 실행은 하지 않았다.
