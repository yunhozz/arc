# superpowers 내부 참조 배포 및 최신화 구현 계획

> **실행 담당자:** ARC Orchestrator가 승인된 계획에 따라 Coder를 배정하고 수용·커밋을 담당합니다. `writing-plans`의 별도 실행기 선택·에이전트·커밋 지시는 ARC 어댑터를 따릅니다. 아래 체크박스는 진행 기록이며 별도 작업이나 커밋 단위가 아닙니다.

**목표:** 전역 superpowers 설치 없이 ARC 내부 참조만으로 역할이 동작하게 하고, npm postinstall 및 실제 `arc install`마다 최신 upstream 자료를 갱신한다.

**구조:** 공용 참조 구성·검증 모듈과 기존 수집·트랜잭션을 연결한다. 패키지에서는 양 플랫폼 참조를 함께 갱신하고, 사용자 설치에서는 최신 참조를 ARC 본체 staging에 합성한다. 역할 정책·동적 manifest·설치·테스트가 하나의 계약을 이루므로 최상위 구현 작업은 하나로 묶는다.

**기술:** Node.js `>=22`, ESM, Git subprocess, 기존 `safe-fs`와 prebuilt native 모듈, `node:test`, 기존 Python 정책 검사.

**승인 명세:** [2026-10-17-superpowers-internal-references-design.md](/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-17-superpowers-internal-references-design.md)

**작업 기준 경로:** `/Users/yunho/Desktop/project/arc`

이 문서는 계획 초안이다. 아래 테스트 추가·수정·실행과 live upstream 접근은 **실행 승인을 위한 제안**이며, 이번 Planner 작업에서는 수행하지 않았다.

## 전역 제약

- 스킬 집합은 `brainstorming`, `writing-plans`, `test-driven-development` 세 개다.
- upstream은 `https://github.com/obra/superpowers`이며 매 수집 시 기본 브랜치를 새로 shallow clone한다.
- 세 스킬과 `LICENSE`는 같은 커밋에서 수집한다. 원문·상대 경로·부속 자료·필요한 실행 권한을 보존한다.
- 동적 영역은 양 플랫폼의 `skill/references/superpowers/`로 제한한다.
- 전역·공유 superpowers 경로는 검사·쓰기·삭제 대상에서 제외한다.
- postinstall은 한 수집 결과를 양 플랫폼에 게시한다. 실제 `arc install --target all`은 기존처럼 대상마다 수집·게시하고 앞선 성공을 보존한다.
- `--check`·`--dry-run`은 수집·네트워크·변경 없이 로컬 자료만 검사한다.
- 실제 역할 실행에는 외부 Skill 등록·전역 탐색·자동 다운로드가 필요하지 않아야 한다.
- 기존 승인·역할 소유권·TDD 예외·visual companion 계약을 유지한다.
- 정적 manifest 전체를 런타임 재생성하지 않는다.
- 기존 지원 플랫폼·Node 버전·prebuilt 사용을 유지하고 설치 중 컴파일을 추가하지 않는다.
- 명세 변경이 필요한 발견은 Orchestrator로 올린다.

근거: 명세 7–19, 65–111, 171–219, 242–326행.

## 검토 초점

다음 다섯 조건은 사용자에게 직접 영향을 주므로 T1의 테스트에 포함한다.

1. **npm 테스트의 offline 환경:** 새 postinstall이 기존 fixture에서 실제 GitHub에 접근하지 않아야 한다. fake Git을 사용하면서 lifecycle 자체는 실제 실행한다.
2. **양 플랫폼 게시 중 두 번째 실패:** 첫 번째 플랫폼도 복구하고 원래 부재 상태까지 복원해야 한다.
3. **읽기 전용 패키지와 사용자 지정 `CODEX_HOME`:** 실제 설치는 패키지를 다시 쓰지 않고 올바른 ARC 내부 경로에 게시해야 한다.
4. **기존 외부 링크·특수 파일:** 관리하지 않는 외부 superpowers 경로는 검사하지 않아 설치를 막지 않아야 한다.
5. **동적 예외의 경계:** `superpowers/` 갱신은 허용하면서 인접 ARC 문서 변조와 동적 목록·해시 오류는 계속 거부해야 한다.

## 파일 구조와 책임

아래 경로는 모두 작업 기준 경로에 상대적이다.

### 생성

| 파일·영역 | 책임 |
|---|---|
| `lib/installer/superpowers.mjs` | 세 스킬·필수 자료·동적 루트 정의, provenance 생성·검증, ARC 트리 합성 |
| `lib/installer/package-references.mjs` | 패키지 양 플랫폼 참조의 staging·게시·복구 |
| `scripts/update-superpowers.mjs` | 배포 기준 참조를 갱신하는 유지관리 진입점; postinstall과 같은 갱신 함수를 사용 |
| 양 플랫폼 `skill/references/superpowers/` | 실제 upstream 세 스킬 트리, `LICENSE`, `provenance.json` |
| `tests/node/superpowers.test.mjs` | 참조 구조·provenance·합성·동적 경계 검사 |
| `tests/node/package-references.test.mjs` | 양 플랫폼 패키지 게시·복구·정리 검사 |
| `tests/node/npm-postinstall.test.mjs` | 필수 최신화와 best-effort completion의 실패 분리 |
| `tests/node/fixtures/fake-git.mjs` | Git argv·환경 감사와 결정적 upstream A/B·실패·취소 fixture |

`scripts/update-superpowers.mjs`는 새 `arc` 사용자 명령을 추가하지 않는다. 저장소에 실제 배포 기준 자료를 생성하고 재생성하는 수단이다.

### 수정

- 수집·설치:
  - `lib/installer/acquisition.mjs`
  - `lib/installer/targets.mjs`
  - `lib/installer/plan.mjs`
  - `lib/installer/transaction.mjs`
  - `lib/installer/install.mjs`
  - `lib/cli/index.mjs`
  - `scripts/npm-postinstall.mjs`
- 무결성:
  - `lib/installer/manifest.mjs`
  - `scripts/update-manifest.mjs`
  - `MANIFEST.sha256`
- 역할·정책:
  - `codex/agents/arc-planner.toml`
  - `codex/agents/arc-coder.toml`
  - `claude/agents/arc-planner.md`
  - `claude/agents/arc-coder.md`
  - 양 플랫폼 `skill/SKILL.md`
  - 양 플랫폼 `skill/references/planning.md`
  - 양 플랫폼 `skill/references/verification.md`
  - 양 플랫폼 `skill/references/visual-companion.md`
- 안내:
  - `README.md`
- 기존 테스트·fixture:
  - `tests/node/acquisition.test.mjs`
  - `tests/node/targets.test.mjs`
  - `tests/node/plan.test.mjs`
  - `tests/node/install.test.mjs`
  - `tests/node/all-targets.test.mjs`
  - `tests/node/transaction.test.mjs`
  - `tests/node/transaction-drift.test.mjs`
  - `tests/node/transaction-readonly.test.mjs`
  - `tests/node/manifest.test.mjs`
  - `tests/node/cli-dry-run.test.mjs`
  - `tests/node/consumer.test.mjs`
  - `tests/node/package.test.mjs`
  - `tests/node/npm-completion-consumer.test.mjs`
  - `tests/node/fixtures/packed-consumer.mjs`
  - `tests/node/live-upstream.mjs`
  - `tests/test_arc_policy.py`
  - `tests/test_claude_payload.py`
  - `tests/installer-parity.json`

기존 `tests/node/fixtures/fake-npx.mjs`는 참조를 이전한 뒤 삭제한다. `tests/installer-parity.json`은 동결된 historical inventory를 유지하고 영향받는 실행 대상 매핑만 갱신한다.

`lib/installer/uninstall.mjs`·`lib/installer/shell-completion.mjs` 등의 주변 코드는 원칙적으로 유지한다. 새 관리 대상에서 외부 경로를 제외하기 위해 추가 변경이 필요하면 이유와 영향 범위를 Orchestrator에 보고한다.

## 공통 인터페이스

타입 이름은 문서상의 계약이며 TypeScript 도입을 요구하지 않는다.

### 참조 데이터

```text
ReferenceBundle = {
  entries: Map<relativePath, TreeEntry>,
  provenance: {
    schemaVersion: 1,
    repository: "https://github.com/obra/superpowers",
    revision: string,
    fetchedAt: string,
    skills: string[],
    files: Record<relativePath, sha256>,
    links: Record<relativePath, normalizedRelativeTarget>
  }
}
```

- `entries`는 `LICENSE`·`provenance.json`·세 스킬 전체를 포함한다.
- `TreeEntry`는 기존 트랜잭션이 취급하는 directory/file/symlink 표현을 사용한다.
- `files`는 모든 일반 파일을 포함하며 `provenance.json` 자신을 제외한다.
- `links`는 링크가 없을 때도 빈 객체로 기록한다.
- 링크 대상은 같은 스킬 내부로 제한한다.
- `revision`은 `git rev-parse HEAD`로 확인한 커밋이고, `fetchedAt`은 UTC의 ISO 형식이다.

### 함수

| 위치 | 시그니처·역할 |
|---|---|
| `acquisition.mjs` | `acquireExternalSkills({work, safeFs, spawn, signal, clock})`. 기존 이름을 유지하고 `skills`에 더해 `references: ReferenceBundle`·`work`·소유 영역을 한 번만 정리하는 `dispose()`를 반환한다 |
| `superpowers.mjs` | `validateReferenceBundle(bundle)`. 구조·필수 자료·provenance 정합성을 검사하고 부적합하면 throw한다 |
| `superpowers.mjs` | `readReferenceBundle({safeFs, root})`. 유지하고 있는 안전한 root에서 읽어 검증된 bundle을 반환한다 |
| `superpowers.mjs` | `composeArcSkillTree(skillFiles, references)`. `Map<string, Buffer>`의 ARC 생성물과 bundle에서 트랜잭션용 새 `Map<string, TreeEntry>`를 반환한다 |
| `superpowers.mjs` | `isDynamicReferencePath(relativePath)`. 정적 manifest 생성과 검증에서 동일한 두 동적 root 판정을 사용한다 |
| `package-references.mjs` | `refreshPackageReferences({packageRoot, safeFs, acquisition, signal, hooks})`. 한 번 수집하고 양 플랫폼에 논리적으로 일괄 게시하며 실패하면 복구한다 |
| `manifest.mjs` | `verifyPayload(...)`의 기존 반환값을 유지하고 검증된 `referenceTrees`를 플랫폼별로 추가한다 |

동적 트리를 일반 `payload.files`에 억지로 Buffer화하지 않고 `referenceTrees`로 취급한다. 이를 통해 내부 링크와 디렉터리 메타데이터가 사라지지 않게 한다. 실제 설치에서는 새로 수집한 bundle을 사용한다.

`composeArcSkillTree()`는 기존 `references/superpowers` 아래를 제외한 뒤 새 트리를 더해, upstream에서 삭제된 파일이 남지 않게 한다. 입력 Map은 변경하지 않는다.

## 의존관계와 준비 기록

| ID | 선행 작업 | 필요한 입력 | 소유하는 공유 자원 | 출력 | 초기 상태 |
|---|---|---|---|---|---|
| T1 | 없음 | 승인된 설계·개별 승인된 명세·본 계획 승인, 실행 준비된 workspace, 테스트 실행 허가 | 위 모든 파일, 정적 manifest, 양 플랫폼 참조, 공용 fixture·parity 매핑 | AC1–13을 충족하는 하나의 통합 변경과 증거 | Orchestrator의 준비·승인 대기 |

**분리하지 않는 이유:** 새 참조를 배포하기 전에 역할만 바꾸면 로컬 경로가 없다. manifest만 완화하면 동적 자료가 검증되지 않는다. 설치기만 바꾸면 기존 정책이나 consumer fixture와 모순된다. 이들은 독립적으로 수용할 수 있는 산출물이 아니다.

동시에 실행할 독립적인 Coder 작업은 없다. 내부 테스트·구현 체크포인트를 별도 커밋으로 나누지 않는다.

Orchestrator가 canonical handoff에 계획 버전, 승인, 소유 파일, 검증 방법, ready/held 이유를 기록한다. Planner는 이 기록을 변경하지 않는다.

## T1: superpowers 내부 참조의 배포·실행 계약을 일괄 전환한다

**구현 목표·범위:** 새 수집, 참조 검증, package lifecycle, ARC 설치, 로컬 경로 읽기, 라이선스, 기존 외부 자료 보존을 하나의 동작으로 구현한다.

**대상 파일:** 위 「파일 구조와 책임」의 생성·수정·삭제 대상.

**선행·의존:** 선행 구현 작업은 없다. Git·지원 Node/runtime·기존 prebuilt·네트워크를 사용할 수 있는 실행 환경과 Orchestrator의 실행 준비에 의존한다.

**명세 근거:**

- 33–169행: 저장 구조, upstream 수집, 라이선스, provenance
- 171–240행: lifecycle, 대상별 결과, staging·rollback
- 242–313행: manifest, 역할의 로컬 읽기
- 315–386행: 읽기 전용 모드, 제거, AC, 보류 조건

### 구현·검증 체크포인트

- [ ] **1. fixture와 실패 테스트를 만들고, 기대한 이유로 실패하는지 확인한다.**

`fake-git.mjs`는 `clone`과 `rev-parse HEAD`의 필요한 동작을 에뮬레이트하고 A/B 스냅샷, 임의 추가 파일, 삭제 파일, 실행 권한, 내부 링크, 특수 파일, LICENSE, revision을 제공한다.

upstream의 유해한 스크립트에 marker를 기록하는 내용을 넣고, 수집 시 marker가 생성되지 않는지 검사한다.

`acquisition.test.mjs`에서는 최소한 다음을 고정한다.

```text
acquires default-branch snapshot with isolated git and one revision
preserves full selected trees, license and executable modes
rejects missing companion, escaping link, cycle and special file
does not execute upstream content
cancellation and timeout terminate descendants before cleanup
```

기존 300000ms 수집 타임아웃, 5000ms 종료 유예, 유지한 root의 안전한 dispose 검증을 유지한다. 기존 CLI JSON record 형식을 검사하던 테스트는 새 Git snapshot 검사로 대체한다.

RED 실행:

```sh
node --test tests/node/acquisition.test.mjs tests/node/superpowers.test.mjs
```

기대값: 새 인터페이스 또는 요구된 동작이 미구현이어서 실패한다. import 오류 등 무관한 실패를 RED 증거로 삼지 않는다.

- [ ] **2. 공통 참조 계약과 Git 수집을 구현하고 같은 테스트를 통과시킨다.**

`superpowers.mjs`에 세 스킬·필수 자료와 동적 root를 모은다.

Git clone은 인수 배열로 실행하며 다음 의미를 갖는 고정 인수를 사용한다.

```text
git clone --depth 1 --single-branch --no-tags --
  https://github.com/obra/superpowers <owned-work>/upstream
```

해당 clone의 `HEAD`를 해석하고 선택한 트리와 root LICENSE를 같은 snapshot에서 추출한다. Git 설정·HOME을 격리하고 prompt를 금지하며 upstream의 스크립트·hook·submodule 등을 실행하지 않는다. 기존 수집기의 프로세스 종료·취소·안전한 파일 읽기와 dispose를 재사용한다.

필요한 내부 링크는 기존 정규화 표현으로 보존하고, 다른 스킬·라이선스·외부 디렉터리로 향하는 링크는 거부한다.

GREEN 실행:

```sh
node --test tests/node/acquisition.test.mjs tests/node/superpowers.test.mjs
```

기대값: A/B 양 fixture에서 전체 내용·권한·LICENSE·revision이 일치하고 거부·취소·cleanup 검사가 성공한다.

- [ ] **3. 패키지 갱신과 postinstall의 실패 테스트를 추가하고 갱신 처리를 구현한다.**

`package-references.test.mjs`:

```text
refreshes both platforms from one acquisition on every call
replaces stale files and removes files absent from new snapshot
rolls back first platform if second publication fails
restores previously absent trees to absence
reports rollback failure and residual paths
rejects unsafe destination without touching outside content
```

각 failure test는 시작 전후 양 플랫폼의 내용과 권한을 비교한다. 수집 실패 시 기존 트리를 이동하지 않았는지 확인한다.

`npm-postinstall.test.mjs`에서는 자식 프로세스를 fixture 패키지와 임시 HOME에서 실행해, 최신화 실패가 비정상 종료이고 completion만의 실패가 best-effort이며 성공 시 순서가 「최신화 후 completion」인지 확인한다.

`refreshPackageReferences()`를 구현한다. 양 staging을 완성한 뒤 기존 트리를 임시 보존하고 순차 공개하며, 중간 실패 시 역순으로 복구한다. 원본이 없던 위치는 부재 상태로 되돌린다. 복구 자료는 성공 후에만 삭제하고 잔여 자료를 명시한다.

`scripts/npm-postinstall.mjs`에서는 superpowers 갱신을 completion용 기존 catch 바깥에 둔다. `os.userInfo()`나 completion 판정 실패가 갱신을 건너뛰게 하지 않는다.

실행:

```sh
node --test tests/node/package-references.test.mjs tests/node/npm-postinstall.test.mjs
```

기대값: 한 번의 갱신에서 수집은 한 번, 두 번의 갱신에서 두 번이다. 두 번째 공개가 실패해도 시작 전 상태가 복구된다.

- [ ] **4. 동적 manifest 검증을 추가하고 배포 기준 자료를 생성한다.**

`manifest.test.mjs`와 `superpowers.test.mjs`에 다음을 추가한다.

```text
accepts changed dynamic tree with matching provenance
rejects changed static sibling and omitted static manifest entry
rejects missing license, required file, unknown skill and extra unlisted file
rejects mismatched hash, malformed provenance and unsafe link
uses identical dynamic roots in manifest generation and verification
```

`verifyPayload()`는 동적 root를 전용 reader에 전달하고 그 밖의 기존 hash·type 검사를 계속한다. 소스의 정적 manifest 예외는 두 전용 subtree만으로 제한한다.

`scripts/update-superpowers.mjs`에서 공통 갱신 처리를 호출해 실제 upstream의 양 플랫폼 기준 자료를 생성한다. 이는 승인 후 구현 작업이며 실행 전에 Orchestrator가 기존 차이와 소유 대상을 확인한다.

```sh
node scripts/update-superpowers.mjs
node scripts/update-manifest.mjs
node scripts/update-manifest.mjs --check
node --test tests/node/manifest.test.mjs tests/node/superpowers.test.mjs
```

기대값: 세 개의 완전한 트리, LICENSE, 같은 revision의 provenance가 생성되고 정적 manifest가 일치한다. upstream 필수 자료 불일치는 이 단계에서 보류한다.

- [ ] **5. 실제 ARC 설치를 내부 트리 합성으로 전환한다.**

`targets.mjs`와 `plan.mjs`에서 외부 스킬 정책·검사를 제거한다. 트랜잭션에서 `composeArcSkillTree(plan.generated.skill, acquired.references)`를 사용해 ARC 본체와 참조를 함께 공개한다. `all`의 Codex→Claude, 대상별 수집, 선행 성공 보존을 유지한다.

추가·이전할 검사:

```text
plan never inspects pre-existing external skills
installs latest bundle inside arc and leaves external sentinel unchanged
read-only package installs into custom CODEX_HOME without package writes
each target reacquires and later failure preserves earlier success
rollback restores arc body and reference bundle together
removal deletes internal references and preserves global/shared skills
```

기존 외부 링크 의존성을 rebase하던 테스트는 외부 링크 불변·비의존 테스트로 바꾼다. 일반적인 snapshot·drift·metadata·readonly staging 방어 검사는 유지하고 참조 트리를 새 소유 위치에 두어 검증한다.

실행:

```sh
node --test tests/node/targets.test.mjs tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/all-targets.test.mjs tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/uninstall.test.mjs tests/node/uninstall-cli.test.mjs
```

기대값: 외부 superpowers가 없든 있든 선택한 ARC 내부만 바뀐다. 취소·drift·rollback·제거의 기존 계약도 통과한다.

- [ ] **6. 역할 프로필과 ARC 참조를 로컬 파일 읽기로 변경한다.**

Planner/Coder profile, 양 플랫폼 core·planning·verification에 다음을 명시한다.

- Orchestrator가 선택한 플랫폼의 설치된 ARC 기준 절대 경로를 brief에 전달한다.
- Planner는 내부 brainstorming/writing-plans, Coder는 내부 TDD를 읽는다.
- Skill 등록·전역 탐색·외부 Skill 호출을 전제로 하지 않는다.
- 필요한 상대 참조는 해당 스킬 디렉터리를 기준으로 한다.
- 누락 시 의존 작업을 멈추고 전역 fallback·자동 수집을 하지 않는다.
- 상위 ARC 승인·role ownership·TDD 예외를 유지한다.
- ARC visual companion 계약과 upstream 실제 경로를 구분한다.

Python 정책 테스트에서 실제 상대 경로 문자열과 금지되는 전역 의존을 검사한다. 단순히 `installed`를 다른 모호한 표현으로 치환하지 않는다.

실행:

```sh
python3 -B -m unittest discover -s tests -p test_arc_policy.py
python3 -B -m unittest discover -s tests -p test_claude_payload.py
```

기대값: 양 플랫폼의 로컬 경로 계약과 기존 ARC gates가 통과한다. 이는 모든 실제 에이전트 동작을 증명하는 검사가 아니다.

- [ ] **7. packed consumer와 npm lifecycle fixture를 새 계약으로 이전한다.**

`packed-consumer.mjs`는 결정적 실행에서는 PATH의 fake Git을, live 실행에서는 실제 Git을 사용한다. Python/compiler trap·원본 소스 참조 금지를 유지한다. fake-npx 참조를 이전하고 삭제한다.

`npm-completion-consumer.test.mjs`에서는 offline npm 작업에 fake Git을 제공한다. npm lifecycle 자체는 억제하지 않고 postinstall 실행·재실행·local dependency·npm exec와 completion 비퇴행을 검증한다.

추가·이전할 관측:

- postinstall A→B에서 양 플랫폼 갱신
- `--ignore-scripts`에서는 갱신되지 않고 이후 `arc install`에서 새 수집
- 초기 전역 superpowers 없이 완전한 내부 자료를 설치하고 필요한 문서를 로컬에서 읽을 수 있음
- 실제 설치 후 Git·네트워크 없이도 내부 문서와 부속 스크립트를 해석할 수 있음
- 기존 전역 사본·shared directory·literal symlink는 불변
- `--check`·`--dry-run`은 Git audit 없이 package/home 불변
- packed 자료에 LICENSE·provenance·세 트리가 포함됨

README에서 기존 전역 스킬 교체 설명을 제거하고 Git 요구 사항·두 갱신 시점·비활성화된 lifecycle·실패·라이선스·동시 실행 제약을 설명한다.

legacy parity의 불변 inventory와 assertion 수는 유지하고 동작 변경의 영향을 받는 destination을 새 테스트에 대응시킨다. 원문 inventory를 새 사양으로 바꿔 checker를 통과시켜서는 안 된다.

실행:

```sh
node --test tests/node/cli-dry-run.test.mjs tests/node/consumer.test.mjs tests/node/package.test.mjs tests/node/npm-postinstall.test.mjs tests/node/npm-completion-consumer.test.mjs
node scripts/check-installer-parity.mjs
```

기대값: 결정적 테스트에서 실제 upstream에 접근하지 않는다. npm 측 갱신과 ARC 대상 설치의 갱신을 별도 audit로 보여 줄 수 있다.

- [ ] **8. T1 수용에 필요한 QA 증거를 갖춘다.**

RED/GREEN 후 전체 통합 차이가 갖춰진 시점에 다음을 한 번 실행한다.

```sh
npm test
python3 -B -m unittest discover -s tests -p test_arc_policy.py
python3 -B -m unittest discover -s tests -p test_claude_payload.py
node scripts/update-manifest.mjs --check
node scripts/check-installer-parity.mjs --complete
node tests/node/live-upstream.mjs
```

`live-upstream.mjs`를 새 계약으로 갱신하고 packed package에서 실제 GitHub를 수집한다. 실제 HOME에는 접근하지 않으며 출력은 revision·필수 자료·LICENSE 일치·내부 배치·전역 자료 부재 결과로 제한한다. raw upstream 내용이나 환경 비밀을 출력하지 않는다.

`--complete`는 mapping 대상을 재실행하므로 이 한 번은 parity 고유 검증으로 필요하다. 이후 재실행은 수정·실패·미해결 우려의 영향을 받는 범위로 제한한다.

### T1 수용 조건과 QA 증거

AC 정의는 승인 명세 353–371행을 그대로 사용한다.

| AC | 수용 전에 필요한 QA·focused check | 증거 |
|---|---|---|
| AC1·AC11 | 수집·bundle·packed contents·설치 결과 대조 | tree 목록, file bytes/hash, 동일 revision의 LICENSE, 양 플랫폼 provenance |
| AC2 | package updater·실제 postinstall A→B·두 번 실행 | 갱신당 한 번의 수집 audit, 동일 revision, stale 제거 |
| AC3·AC8 | 단독 target·재설치·all·custom home | 대상별 수집 횟수, 배치, 선행 성공/후행 실패 결과 |
| AC4·AC10 | 전역 자료 없는 consumer, 필수 자료 로컬 읽기, 양 정책 검사 | 해석한 로컬 path, 읽기 성공, 외부 등록 의존 없음 |
| AC5 | 기존 copy·shared·link·special file을 둔 fixture | 검사 대상 제외 기록, 전후 bytes/link 불변 |
| AC6 | acquisition·두 번째 공개·transaction·rollback·cleanup fault injection | 변경 전후 tree, exit status, 잔여/복구 path |
| AC7 | manifest·bundle의 정상·오류 fixture | 동적 정상 갱신 성공, 정적 변조/불법 dynamic 거부 |
| AC9 | packed check/dry-run | Git audit 없음, home/package snapshot 불변 |
| AC12 | npm lifecycle 활성/비활성·실패, 이후 실제 설치 | stage별 audit, 비정상 종료, fallback 없음 |
| AC13 | uninstall unit/packed consumer | 내부 자료 제거, 전역 자료 불변 |

QA는 각 AC에 대해 방법·범위·run status·판정·증거·미확인 범위를 보고한다. 실행하지 못한 검사를 PASS로 취급하지 않는다. live GitHub 검사가 환경 문제로 막히면 실제 upstream 호환성을 미확인으로 두고 T1 수용을 보류한다.

### T1 보류 조건

다음을 발견하면 영향을 받는 작업을 멈추고 Orchestrator에 보고한다.

- 명세 377–384행의 조건에 해당한다.
- 현재 upstream의 필수 자료가 없어 필요한 기능을 유지하려면 구조·대상 스킬을 바꿔야 한다.
- npm postinstall을 기존 지원 runtime의 prebuilt로 실행할 수 없어 컴파일이나 새로운 지원 방침이 필요하다.
- 외부 스킬을 검사·변경하지 않으면 구현할 수 없다.
- static manifest 예외를 승인된 두 root보다 넓혀야 한다.
- 잔여·복구 결과 또는 기존 차이와의 소유 충돌을 확정할 수 없다.
- frozen parity inventory를 변경하지 않고 검증할 수 없다.
- 필요한 QA 증거나 실제 upstream 검사를 확보할 수 없다.

### T1 수용과 커밋

Coder는 편집 범위·RED/GREEN·focused checks·제약·잔여 자료를 보고한다. 독립 QA가 위 AC를 확인하고 Orchestrator가 모든 조건과 소견을 확인해 T1을 수용한다.

이후 Orchestrator가 하나의 focused implementation commit을 만든다. 추가 사용자 commit 승인을 요구하지 않는다. 후보 메시지:

```text
feat: bundle and refresh superpowers references within ARC
```

upstream scripts·권한·license를 포함한 전체 참조 트리를 추가한다. manifest, policy, installer, tests를 별도 commit으로 나누지 않는다.

## 최종 계획 전체 검증

**실시 시점:** T1이 QA 증거와 함께 Orchestrator에 수용되고 focused commit이 확인된 뒤.

**범위:** 최종 변경 전체에 대한 독립 Reviewer의 한 번의 검토.

중점은 upstream content 비실행, Git 환경 격리, 동적 manifest 경계, link·path 안전성, package 두 위치 rollback, ARC adapter, MIT notice, parity mapping과 테스트 주장 범위다.

Reviewer를 T1의 개별 수용 전제 조건으로 두지 않는다. 최종 Review에서 소견이 나오면 Orchestrator가 수정·영향받은 QA 재검증·차이 확인을 조정하고 해소 후 전체 완료를 결정한다. 의미가 바뀌는 범위 확대는 승인된 계획을 조용히 확장하지 않는다.

## 가정·미결 사항

- 승인 명세대로 Git을 최신화의 필요 조건으로 하고 별도 수집 transport를 추가하지 않는다.
- upstream 내용은 refresh 시 바뀔 수 있다. 구조 호환성 실패를 보류로 명시하고 전역 fallback을 만들지 않는다.
- package updater는 기존 지원 runtime의 safe-fs/prebuilt를 사용한다. 지원 OS를 늘리거나 줄이는 판단은 이 계획에 포함하지 않는다.
- 임의 시점의 강제 종료에서 완전히 자동 복구하는 영구 journal을 추가하지 않는다. 기존과 마찬가지로 관측 가능한 실패의 복구·잔여 보고를 구현한다.
- 모든 에이전트의 실행 준수를 자동 증명하는 새 runtime 기반을 추가하지 않는다. 로컬 자료 수집·배치·읽기와 정책 구조를 검증 범위로 명시한다.
- 사용자 추가 기능 결정은 필요 없다. Orchestrator가 본 계획과 위 테스트 변경·실행 범위 승인을 받는 단계다.

## 자체 점검

- **명세 범위:** 1–14절과 AC1–13을 T1 내 구현·QA·보류 조건에 대응시켰다.
- **작업 경계:** 공유 배포 계약을 하나의 최상위 작업으로 두고 내부 체크포인트를 commit 단위로 만들지 않았다.
- **의존관계:** ready 입력, 공유 자원, 초기 hold를 명시했다. 독립적이라고 오인해 병렬 편집할 부분은 없다.
- **타입 일관성:** acquisition의 `references`, manifest의 `referenceTrees`, tree 합성을 구분하고 기존 Buffer Map에서 링크가 사라지는 경로를 피했다.
- **검증:** fake-npx 의존·offline npm fixture·frozen parity mapping을 명시했다. 실제 upstream 검사와 결정적 테스트를 구분했다.
- **Review 시점:** 최종 전체 Review를 작업 수용과 분리하고 각 작업에 Reviewer gate를 추가하지 않았다.
- **제한:** 이번 작업은 계획 작성뿐이며 저장·변경·검사 실행을 하지 않았다.
