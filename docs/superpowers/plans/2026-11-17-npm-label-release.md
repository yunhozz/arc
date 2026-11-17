# PR 라벨 기반 자동 npm 릴리스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** master에 PR이 merge되면 라벨로 bump 종류를 정하고, CI가 `vX.Y.Z` commit·tag를 push한 뒤 OIDC Trusted Publishing으로 provenance publish한다.

**Architecture:** 판정 로직은 `.github/scripts/release-plan.mjs`(순수 함수 + 주입형 CLI `main`, 네트워크 없는 테스트)에 둔다. `.github/workflows/npm-publish.yml`은 `plan` → `release` → `publish` job과 dispatch 리허설용 `rehearse` job으로 재작성하고 job별 최소 권한을 준다. 워크플로 테스트는 sha256 고정 대신 의미 단언으로 바꾼다.

**Tech Stack:** GitHub Actions, Node 24(global `fetch`, `node:test`), npm@11, 외부 의존성 없음.

**Design:** `.git/arc/design/wf-npm-auto-release-design.md` (v1 승인, 승인 시점 sha256 `83531a5f177602c9d85a8c0fe1bddb812d25c719c189531983ec52620abe85f1`; 이후 외부 설정 기록만 추가)

**Baseline:** `ci/npm-label-release` @ `6dc62d42cae73462799b3cc408c7b88199dad953` (= master, v0.4.1)

## Global Constraints

- 구현 파일은 4개로 한정: `.github/workflows/npm-publish.yml`, `.github/scripts/release-plan.mjs`(신규), `tests/node/npm-publish-workflow.test.mjs`, `tests/node/release-plan.test.mjs`(신규).
- `scripts/deploy.sh`, `MANIFEST.sha256`, `README.md`은 수정하지 않는다. `.github/`·`tests/`는 `scripts/update-manifest.mjs:20` 해시 대상이 아니므로 MANIFEST는 바뀌지 않아야 한다.
- 워크플로 파일 이름은 `npm-publish.yml` 유지(npm Trusted Publisher가 이 이름으로 등록됨). GitHub environment 미사용.
- 테스트는 네트워크에 접근하지 않는다. fetch·git·파일 I/O는 주입한다.
- 패키지 `@yunhozz/arc`, registry `https://registry.npmjs.org/`, stable 정규식 `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`, 라벨 집합 `release:major`, `release:minor`, `release:skip`.
- 오류 메시지는 영어. 기존 eligibility 메시지(404 안내 등)는 문구를 유지한다.
- 커밋 메시지 `type(scope): 한국어 설명`, task 하나 = focused commit 하나(Orchestrator 수락 후).

## 사전 준비 (Orchestrator, task 아님)

- baseline `6dc62d4`에서 `npm test` 실패 목록을 `.git/arc/handoff/wf-npm-auto-release/baseline-6dc62d4-failures.txt`에 기록한다. 최종 검증은 이 목록과 비교한다.

## 확정된 세부 가정 (Orchestrator 결정, 승인 설계 범위 내)

- Q1 dry-run: dispatch 시점 master tip을 push처럼 평가(`before`=첫 부모, head commit은 git에서 읽음)하고 결과를 로그·step summary에 남긴다. 이어서 `rehearse` job이 작업공간 안에서만 bump·manifest 재생성·pack·verify를 수행한다(push·publish·id-token 없음). 평가 실패 시 run 실패.
- Q2 PR은 연결됐지만 `merge_commit_sha` 불일치: 후보에서 제외, 후보 0개면 skip.
- Q3 master가 아닌 ref의 dispatch: `dry-run`·`publish-current` 모두 실패.
- Q4 `publish-current`는 `v$VERSION` tag 존재를 검사하지 않는다.
- Q5 bot commit 판정: 작성자 `github-actions[bot]` + 메시지(끝 공백·개행만 제거)가 `^v\d+\.\d+\.\d+$`와 일치.
- Q6 publish 직전 재확인에서 registry 404는 실패(기존 안내 문구).
- Q7 publish job `if`는 `!cancelled()` + 결과 명시 검사(`always()` 금지 유지).

---

### T1: 릴리스 판정 모듈 `release-plan.mjs`와 단위 테스트

**목표:** 설계 3절의 bump 결정, registry 조건, 출력 검증, publish 직전 재확인 함수를 순수 함수와 주입형 CLI로 구현한다. 워크플로는 바꾸지 않는다.

**Files:** Create `.github/scripts/release-plan.mjs`, Create `tests/node/release-plan.test.mjs`

**선행:** 없음.

**Interfaces (T2가 사용):**
- CLI `node .github/scripts/release-plan.mjs plan`: env `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`, `GITHUB_SHA`, `GITHUB_REF`, `GITHUB_REPOSITORY`, `GH_TOKEN`, `RELEASE_ACTION`(`dry-run`|`publish-current`), `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`(있을 때만). `GITHUB_OUTPUT`에 `mode=`, `bump=`, `version=`, `pr=` 네 줄.
- CLI `node .github/scripts/release-plan.mjs published`: env `VERSION`, `GITHUB_OUTPUT`. `published=true|false`.
- export: `RELEASE_LABELS`, `isStableVersion(v)`, `isGreater(a,b)`, `nextVersion(current, bump)`, `isReleaseCommit({authorName, message})`, `selectMergedPullRequest(pulls, sha)` → `{number, labels}|null`, `decideBump(labels)` → `{mode:'skip'}|{mode:'bump', bump}`, `planRelease(ctx)` → `Promise<{mode,bump,version,pr}>`, `formatOutputs(plan)`, `isPublished(fetchImpl, version)`, `main({argv, env, fetchImpl, git, readFile, appendFile, log})`.
- `ctx`: `trigger: 'push'|'publish-current'`, `sha`, `before`, `ref`, `repo`, `token`, `headCommit: {authorName, message}`, `readPackage()` → `{pkg, lock}`, `readPreviousPackage(before)` → `pkg`, `fetchImpl`.
- `mode` ∈ `skip | manual | bump | publish-current | dry-run`. `bump`은 `mode=bump`(및 dry-run 평가가 bump일 때)만 값, 그 외 `''`. `version`은 skip일 때만 `''` 가능. `pr`은 bump(및 그 dry-run)일 때 숫자 문자열, 그 외 `''`.

**판정 순서 (`trigger: 'push'`):**
1. `isReleaseCommit(headCommit)` → skip (fetch·git 호출 없음).
2. `before`가 40자리 hex가 아니거나 모두 0 → 실패(기존 문구).
3. package/lock 일관성 검사 후 이전 version과 비교. 바뀌었으면 기존 eligibility 규칙으로 `manual` 또는 skip: 404 실패(기존 안내), 비 ok 실패, metadata 무효 실패, 이미 게시 skip, latest보다 크지 않으면 실패, 이전 version보다 크지 않으면 실패.
4. `GET https://api.github.com/repos/{repo}/commits/{sha}/pulls` (`Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`). 비 ok 실패. `merged_at` 있음 + `base.ref === 'master'` + `merge_commit_sha === sha`만 남김: 0개 skip, 1개 사용, 2개 이상 실패.
5. `decideBump`: 집합 라벨 0개 patch, 1개 해당(`release:skip`은 skip), 2개 이상 실패(메시지에 "fix labels and Re-run").
6. `nextVersion` (0.x + major → `1.0.0`).
7. bump registry 조건: 404 실패(기존 안내), 현재 version 미게시 실패(메시지에 "publish-current"), next 이미 존재 실패, next가 latest보다 크지 않으면 실패.

**`trigger: 'publish-current'`:** `ref !== 'refs/heads/master'` 실패. 일관성 검사 후 이미 게시 skip, 미게시이며 latest보다 크면 `publish-current`, 그 외 실패.

**`main` dispatch `dry-run`:** ref가 master가 아니면 실패. `before = git(['rev-parse', sha + '^1'])`, `headCommit = git(['show','-s','--format=%an%x00%B', sha])`로 `trigger:'push'` 평가. 결과를 log·`GITHUB_STEP_SUMMARY`에 기록하고 `mode=dry-run`과 평가의 `bump`·`version`·`pr`을 출력. 평가 실패는 그대로 실패.

**push `main` 입력:** `GITHUB_EVENT_PATH` JSON의 `before`, `head_commit.author.name`, `head_commit.message`.

**출력 검증 (`formatOutputs`):** mode는 다섯 값 중 하나, bump는 `''|patch|minor|major`, version은 `''`|stable, pr은 `''`|`^[1-9]\d*$`, 어떤 값에도 개행 없음 — 위반 시 throw. PR 제목은 읽거나 출력하지 않고 라벨 문자열도 출력하지 않는다.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/node/release-plan.test.mjs`)
  - 모듈은 `await import('../../.github/scripts/release-plan.mjs').catch(()=>({}))`. fake fetch는 URL별 `{status, json}` + 호출 기록.
  - fixture registry: `{name:'@yunhozz/arc','dist-tags':{latest:'0.4.1'},versions:{'0.4.1':{version:'0.4.1'}}}`
  - `nextVersion`: 0.4.1+patch→0.4.2, +minor→0.5.0, +major→1.0.0, 1.2.3+major→2.0.0, `'prerelease'` throw.
  - `decideBump`: `[]`→patch, `['bug']`→patch, minor, major, skip; `['release:minor','release:major']`·`['release:skip','release:minor']`는 `/Multiple release labels/` throw.
  - `isReleaseCommit`: bot+`v0.4.2` true, bot+`v0.4.2\n` true; bot+`feat: x`, `yunhozz`+`v0.4.2`, bot+`v0.4.2-rc.1` false.
  - `selectMergedPullRequest`: 적격 1개 → `{number:70, labels:[...]}`; `merged_at:null`·`base.ref:'develop'`·sha 불일치 각각 null; `[]` null; 적격 2개 throw.
  - `planRelease` push: (a) bot release commit skip·fetch 0회 (b) 0.4.1→0.4.2, latest 0.4.1 → `{mode:'manual',bump:'',version:'0.4.2',pr:''}` (c) 바뀐 version 이미 게시 skip (d) 이전보다 크지 않음 throw (e) lock 불일치 throw (f) before 전부 0 throw (g) PR 없음 skip·registry fetch 0회 (h) PR #70 라벨 없음 → `{mode:'bump',bump:'patch',version:'0.4.2',pr:'70'}` (i) `release:skip` skip (j) 복수 라벨 throw (k) major → `1.0.0` (l) registry 404 `/Publish @yunhozz\/arc manually once/` throw (m) 0.4.1 미게시 `/publish-current/` throw (n) 0.4.2 이미 존재 throw (o) latest 0.5.0 throw (p) registry 500 throw (q) pulls 403 throw (r) pulls URL `https://api.github.com/repos/yunhozz/arc/commits/<sha>/pulls`, 헤더 `Bearer <token>`.
  - `planRelease` publish-current: 미게시·latest 초과 → `{mode:'publish-current', version}`; 이미 게시 skip; latest 이하 throw; `refs/heads/feature` throw.
  - `formatOutputs`: 정상은 정확히 `'mode=bump\nbump=patch\nversion=0.4.2\npr=70\n'`; mode `'publish'`, version `'0.4.2\nx'`, pr `'x'` 각각 throw.
  - `isPublished`: 있으면 true, 없으면 false, 404·500 throw.
  - `main` dry-run(`GITHUB_EVENT_NAME=workflow_dispatch`, `RELEASE_ACTION=dry-run`, `GITHUB_REF=refs/heads/master`, fake git): 출력 첫 줄 `mode=dry-run`, 나머지는 평가값. ref가 master가 아니면 reject.
  - `main published`: `VERSION=0.4.1` → `published=true`.
- [x] **Step 2: 실패 확인.** `node --test tests/node/release-plan.test.mjs` FAIL(모듈 없음).
- [x] **Step 3: 구현.** CLI 진입은 `import.meta.url === pathToFileURL(process.argv[1]).href`일 때만 `main({argv: process.argv.slice(2), env: process.env, fetchImpl: globalThis.fetch, git: execFileSync 래퍼, readFile, appendFile: appendFileSync, log: console.log})`. 기본 fetch `AbortSignal.timeout(30000)`. `repo`는 `^[\w.-]+\/[\w.-]+$` 검증.
- [x] **Step 4: 통과 확인.** `node --test tests/node/release-plan.test.mjs` PASS, `node --check .github/scripts/release-plan.mjs` exit 0.
- [x] **Step 5: 커밋 (Orchestrator 수락 후).** `feat(ci): PR 라벨 기반 릴리스 판정 모듈 추가`

**수락 기준:**
- T1-C1 판정 순서 1–7, publish-current, dry-run 동작이 계약과 일치(위 테스트로 증명).
- T1-C2 테스트는 실제 네트워크·git을 쓰지 않는다.
- T1-C3 `formatOutputs`는 검증된 네 키만 출력, PR 제목·라벨 문자열 미포함.
- T1-C4 기존 eligibility 검증 조건(lock 일치, 패키지 이름, stable, before sha, previous 비교, registry metadata 검증)과 메시지 보존.
- T1-C5 `.github/workflows/npm-publish.yml`, `tests/node/npm-publish-workflow.test.mjs`, `MANIFEST.sha256` 불변, `npm run check:manifest` 통과.

**필수 검사:** `node --test tests/node/release-plan.test.mjs`, `node --check .github/scripts/release-plan.mjs`, `npm run check:manifest`, `git status --porcelain`이 위 2개 파일과 이 plan 문서뿐. fresh QA.

**Holds:** 판정 계약 변경이 필요하면 멈추고 Orchestrator에 보고.

**진행 기록 (2026-11-17, 수락):** RED 0/42(모듈 없음) → GREEN 42/42. fresh QA가 T1-C3 미충족(`formatOutputs` mode별 조합 미검증)을 지적해 같은 Implementer가 회귀 테스트 6개 추가(RED 43/5 → GREEN 48/48). QA 재확인에서 C1–C5 모두 proven. `node --check`, `npm run check:manifest` 통과, 기존 파일 diff 없음. 실제 GitHub·npm API 통합 실행은 범위 밖(병합 후 dry-run에서 확인).

---

### T2: 워크플로 재작성과 의미 단언 워크플로 테스트

**목표:** `npm-publish.yml`을 설계 2·4·5절 구조(`plan`·`release`·`publish`)와 Q1의 `rehearse` job으로 재작성하고, sha256 고정 테스트를 의미 단언으로 교체한다.

**Files:** Modify `.github/workflows/npm-publish.yml`(전체 재작성), Modify `tests/node/npm-publish-workflow.test.mjs`(전체 교체)

**선행:** T1 수락·커밋(CLI `plan`·`published`와 출력 키 사용).

**워크플로 계약:**
- `on.push`: `branches: [master]`만, `paths` 없음. `on.workflow_dispatch.inputs.action`: `type: choice`, `options: [dry-run, publish-current]`, `default: dry-run`, `required: true`.
- 최상위 `permissions: {}`, `concurrency: { group: npm-publish, cancel-in-progress: false }`.
- 모든 `run:` 블록에 `${{` 없음. 값은 `env:`로만 전달.

**`plan` job:** `permissions: { contents: read, pull-requests: read }`; `if: (github.event_name == 'workflow_dispatch' && inputs.action == 'dry-run') || vars.NPM_PUBLISH_ENABLED == 'true'`; outputs `mode`,`bump`,`version`,`pr` (`steps.plan.outputs.*`). steps: checkout(`fetch-depth: 0`, `persist-credentials: false`) → setup-node `'24'` → id `plan`: `node .github/scripts/release-plan.mjs plan` (env `GH_TOKEN: ${{ github.token }}`, `RELEASE_ACTION: ${{ inputs.action }}`). id-token 없음.

**`rehearse` job (dry-run 전용):** `needs: plan`; `if: github.event_name == 'workflow_dispatch' && needs.plan.outputs.mode == 'dry-run'`; `permissions: { contents: read }`; env `BUMP`, `VERSION`(plan 출력). steps: checkout(`ref: ${{ github.sha }}`, `persist-credentials: false`) → setup-node `'24'` → `node scripts/update-manifest.mjs --check` → `BUMP`가 비어 있지 않으면 `npm version "$BUMP" --no-git-tag-version --ignore-scripts` + `node scripts/update-manifest.mjs` + `npm run check:manifest` → 검증할 version 결정(`VERSION`이 비면 `package.json` version) 후 `package.json` version과 일치 확인 → `npm run pack:release -- --out-dir "$RUNNER_TEMP/arc-release"` → `node scripts/verify-release.mjs --out-dir "$RUNNER_TEMP/arc-release" --name @yunhozz/arc --version "$REHEARSE_VERSION"`. git commit·tag·push, `npm publish`, `id-token` 없음. 게이트 변수와 무관.

**`release` job:** `needs: plan`; `if: vars.NPM_PUBLISH_ENABLED == 'true' && github.event_name == 'push' && needs.plan.outputs.mode == 'bump'`; `permissions: { contents: write }`; outputs `sha`; env `BUMP`, `VERSION`; 의존성 설치 없음. steps(순서 고정):
1. checkout `ref: ${{ github.sha }}`, `fetch-depth: 0`, `persist-credentials: true`(워크플로 전체에서 이 job만).
2. setup-node `'24'`.
3. `git ls-remote origin refs/heads/master` 첫 필드 == `GITHUB_SHA`, 아니면 exit 1.
4. `node scripts/update-manifest.mjs --check`
5. `npm version "$BUMP" --no-git-tag-version --ignore-scripts`
6. `node scripts/update-manifest.mjs`
7. `npm run check:manifest`
8. `git status --porcelain`이 정확히 `package.json`, `package-lock.json`, `MANIFEST.sha256`; `node -p 'require("./package.json").version'` == `$VERSION`; `git ls-remote --exit-code --tags origin "refs/tags/v$VERSION"` exit code 2.
9. `git add package.json package-lock.json MANIFEST.sha256` → `git -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "v$VERSION"` → `git tag "v$VERSION"` → `git push --atomic origin HEAD:refs/heads/master "refs/tags/v$VERSION"` → `sha=$(git rev-parse HEAD)` 출력.
`--force`·`-f` 금지.

**`publish` job:** `needs: [plan, release]`; `permissions: { contents: read, id-token: write }`; `if`(block scalar): `!cancelled() && vars.NPM_PUBLISH_ENABLED == 'true' && needs.plan.result == 'success' && ((needs.plan.outputs.mode == 'bump' && needs.release.result == 'success') || ((needs.plan.outputs.mode == 'manual' || needs.plan.outputs.mode == 'publish-current') && needs.release.result == 'skipped'))`; env `VERSION: ${{ needs.plan.outputs.version }}`. steps: checkout(`ref: ${{ needs.plan.outputs.mode == 'bump' && needs.release.outputs.sha || github.sha }}`, `persist-credentials: false`) → setup-node `'24'`(`registry-url` 없음) → `npm install --global npm@11` → id `published`: `node .github/scripts/release-plan.mjs published` → 이후 step 모두 `if: steps.published.outputs.published == 'false'`: `package.json` version == `$VERSION` 확인 → `node scripts/update-manifest.mjs --check` → `npm run pack:release -- --out-dir "$RUNNER_TEMP/arc-release"` → `node scripts/verify-release.mjs --out-dir "$RUNNER_TEMP/arc-release" --name @yunhozz/arc --version "$VERSION"` → `npm publish "$RUNNER_TEMP/arc-release/arc-release.tgz" --access public --provenance --registry https://registry.npmjs.org/`.
워크플로 전체에 `continue-on-error`·`always()` 없음.

- [x] **Step 1: 실패하는 테스트 작성** (`tests/node/npm-publish-workflow.test.mjs`) — job 구간은 `^  plan:$`, `^  rehearse:$`, `^  release:$`, `^  publish:$`로 분할, `run:` 블록은 들여쓰기 기준 추출, YAML 의존성 추가 없음.
  - `triggers and top-level permissions`: push `branches: [master]`, `paths:` 없음; dispatch 옵션 `dry-run`·`publish-current`; `permissions: {}`, `cancel-in-progress: false`, `group: npm-publish`.
  - `job permissions are least privilege`: plan `contents: read`+`pull-requests: read`, `id-token`·`contents: write` 없음; rehearse `contents: read`, `id-token`·`contents: write` 없음; release `contents: write`, `id-token` 없음; publish `contents: read`+`id-token: write`, `contents: write` 없음.
  - `only release persists credentials`: `persist-credentials: true` 정확히 1회·release 구간; plan·rehearse·publish는 `false`.
  - `gates`: release·publish에 `vars.NPM_PUBLISH_ENABLED == 'true'`; plan if에 `inputs.action == 'dry-run'` 우회; release if에 `github.event_name == 'push'`·`needs.plan.outputs.mode == 'bump'`; publish if에 `'manual'`, `'publish-current'`, `needs.release.result == 'skipped'`; rehearse if에 `needs.plan.outputs.mode == 'dry-run'`.
  - `rehearsal never pushes or publishes`: rehearse 구간에 `git push`, `git commit`, `git tag`, `npm publish`, `id-token` 없음; `pack:release`·`verify-release.mjs` 있음.
  - `release order and atomic push`: 위치 순서 `refs/heads/master`(ls-remote) < 첫 `update-manifest.mjs --check` < `npm version "$BUMP" --no-git-tag-version --ignore-scripts` < 인자 없는 `node scripts/update-manifest.mjs` < `npm run check:manifest` < `--exit-code --tags` < `commit -m "v$VERSION"` < `git tag "v$VERSION"` < `git push --atomic origin HEAD:refs/heads/master "refs/tags/v$VERSION"`; release 구간에 `--force`, ` -f `, `npm ci`, `npm install` 없음.
  - `publication consumes only the reverified tarball`: publish 구간 순서 `release-plan.mjs published` < `update-manifest.mjs --check` < `pack:release -- --out-dir` < `verify-release.mjs` < `npm publish "$RUNNER_TEMP/arc-release/arc-release.tgz"`; `--name @yunhozz/arc --version "$VERSION"`, `--access public --provenance --registry https://registry.npmjs.org/`; 워크플로 전체 `npm publish` 정확히 1회; `continue-on-error`, `always()`, `registry-url`, `npm publish --access` 없음; `npm install --global npm@11`, `node-version: '24'` 있음.
  - `no expression interpolation inside run blocks`: 모든 `run:` 블록에 `${{` 없음.
  - `plan invokes the release-plan module`: plan 구간에 `node .github/scripts/release-plan.mjs plan`, `GH_TOKEN: ${{ github.token }}`.
- [x] **Step 2: 실패 확인.** `node --test tests/node/npm-publish-workflow.test.mjs`가 현재 워크플로에 FAIL.
- [x] **Step 3: 구현.** 계약대로 재작성, 기존 `eligibility` job 삭제.
- [x] **Step 4: 통과 확인.** `node --test tests/node/npm-publish-workflow.test.mjs tests/node/release-plan.test.mjs` PASS. `actionlint`는 로컬에 없음(미실행으로 기록).
- [x] **Step 5: 커밋 (Orchestrator 수락 후).** `ci(npm): PR 라벨 기반 자동 릴리스 워크플로로 재작성`

**수락 기준:**
- T2-C1 트리거·최상위 권한·concurrency·job별 권한이 설계 2절과 같다.
- T2-C2 dry-run은 plan·rehearse만 실행하고 push·publish·id-token 없음. 그 외 push/publish 경로는 모두 `NPM_PUBLISH_ENABLED` 게이트.
- T2-C3 release step 순서·검사가 설계 4절과 같고 atomic push, force 없음, `persist-credentials: true`는 release에만.
- T2-C4 publish checkout ref 규칙, 재확인 멱등 skip, 단일 `npm publish`, `registry-url` 없음, `continue-on-error`·`always()` 없음.
- T2-C5 `run:` 블록에 `${{` 없음.
- T2-C6 `scripts/deploy.sh`, `MANIFEST.sha256`, `README.md` 불변, `npm run check:manifest` 통과.

**필수 검사:** `node --test tests/node/npm-publish-workflow.test.mjs tests/node/release-plan.test.mjs`, `npm run check:manifest`, `git diff --exit-code 6dc62d4 -- scripts/deploy.sh MANIFEST.sha256 README.md`. fresh QA.

**Holds:** T1 수락 전 시작 금지.

**진행 기록 (2026-11-17, 수락):** 첫 시도는 Implementer 패치 형식 오류(같은 경로 Delete+Add 거부)로 변경 없이 중단, 같은 Implementer가 재개. RED 1/11(기존 워크플로) → GREEN 60/60(두 테스트 파일). `npm run check:manifest` 통과, 보호 파일 diff 없음, Ruby YAML 파싱 통과, actionlint 미설치로 미실행. fresh QA가 C1–C6 proven, 워크플로 사본 변형 시 테스트 실패 확인, 임시 저장소에서 release 검증 블록(`bash -e`, tag 조회 exit 2/0/128) 시뮬레이션. 실제 GitHub Actions 실행·`!cancelled()` 평가는 병합 후 dry-run과 첫 실전에서 확인.

---

## 최종 검증 (모든 task 수락 후)

1. `npm test` 실패 목록을 baseline 목록과 비교, 신규 실패 0.
2. `npm run check:manifest` 통과.
3. `git diff --exit-code 6dc62d4 -- MANIFEST.sha256 scripts/deploy.sh README.md`
4. `git diff --name-only 6dc62d4`가 구현 파일 4개와 이 plan 문서뿐.
5. 최종 Reviewer 1회 전체 검토. 이후 발견 사항은 Implementer → Reviewer.

## 병합 후 사용자 외부 작업 (task 아님)

1. ~~npm Trusted Publisher 등록~~ — 2026-11-17 완료(`npm-publish.yml`, `yunhozz/arc`, publish·stage publish).
2. (선택) npm "Require 2FA and disallow tokens" — 켜면 `scripts/deploy.sh`는 동작하지 않음.
3. 라벨 3개 생성: `release:major`, `release:minor`, `release:skip`.
4. Actions workflow permissions 확인(향후 branch protection 시 bypass 필요).
5. 비활성 상태에서 `workflow_dispatch` `dry-run` 성공 확인 후 `NPM_PUBLISH_ENABLED=true`.
6. 첫 실전 merge로 0.4.2 확인. merge 후 로컬 `git pull` 필요.
7. 미확인 항목(concurrency 대기 run 취소, 30일 재실행 제한)은 dry-run·첫 실전에서 확인.

## Revision history

| 버전 | 날짜 | 내용 |
|---|---|---|
| v1 | 2026-11-17 | Planner 초안 + Orchestrator 개정: Q1–Q7 확정, dry-run에 `rehearse` job(pack·verify 리허설) 추가(설계 초안의 dry-run 범위 반영), Q5 끝 공백 제거, Trusted Publisher 완료 반영 |
