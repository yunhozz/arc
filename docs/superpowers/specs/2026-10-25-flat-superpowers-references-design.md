# Superpowers 정적 참조 평면 배치 명세 초안

문서 대상: `/Users/yunho/.codex/worktrees/flat-superpowers-references/arc/docs/superpowers/specs/2026-10-25-flat-superpowers-references-design.md`

상태: Orchestrator 통합 및 사용자 승인을 위한 초안. 구현 계획이나 구현 승인을 대신하지 않는다.

## 1. 목적과 작업 기준

ARC가 제공하는 `brainstorming`, `writing-plans`, `test-driven-development`를 ARC 릴리스에 포함된 고정 원본으로 배포한다. harness 설치와 upgrade는 해당 패키지에서 검증한 플랫폼별 파일을 사용하며, Superpowers upstream 최신 내용을 가져오지 않는다.

세 스킬과 관련 Markdown은 양 플랫폼의 `skill/references/` 바로 아래에 둔다. mockup 스크립트와 HTML·JS는 `skill/references/scripts/`에 함께 둔다. upstream 파일은 이름과 위치만 바꾸며 내용은 변경하지 않는다.

작업 대상은 다음과 같다.

| 항목 | 기준 |
|---|---|
| Workspace | `/Users/yunho/.codex/worktrees/flat-superpowers-references/arc` |
| Branch | `feat/static-superpowers-references` |
| 기준 HEAD | `f176ce771811cb2a39d68fb5af03a20d5ff6e04e` |
| 문서 경로 | `docs/superpowers/specs/2026-10-25-flat-superpowers-references-design.md` |
| 원본 기준 | 현재 양 플랫폼에 포함된 upstream revision `bb92a77741419a4ab5f06e711a283343f1ada0c3` |

Orchestrator가 확인한 근거에 따르면 대상 worktree는 사용자 지정 SHA에서 시작했고, 양 플랫폼의 기존 imported tree는 동일하며 각 provenance의 파일 해시 12개가 일치한다. 대상 worktree는 승인된 `f176ce771811cb2a39d68fb5af03a20d5ff6e04e`에 남아 있다. source checkout `master`의 이후 HEAD 이동과 해당 변경은 작업 이력에 기록하며, 이 명세나 대상 브랜치에 자동 반영하지 않는다.

## 2. 목표와 비목표

목표:

- Codex와 Claude에 동일한 upstream 파일을 동일한 목적지 매핑으로 포함한다.
- 원본 Markdown, shell script, JS, HTML, license, provenance 바이트를 보존한다.
- 원본 상대 링크와 mockup 실행 명령이 새 위치에서 작동하게 한다.
- 설치·재설치·upgrade의 Superpowers 네트워크 acquisition을 제거한다.
- 사용자가 직접 최신 upstream을 반영할 수 있는 무시 대상 로컬 shell entrypoint를 제공한다.
- 한 개의 추적되는 Node updater가 수집·검증·평면 배치 로직을 소유하고 shell entrypoint는 이를 호출한다.
- 정적 manifest와 release 검증이 모든 imported 자산을 보호한다.
- ARC 자체 역할 정책과 시각화 정책을 보존하면서 새 경로로 연결한다.
- 기존 설치의 upgrade·uninstall·rollback 안전성을 유지한다.

비목표:

- upstream 원문을 ARC에 맞게 번역하거나 수정하지 않는다.
- 추가 Superpowers 스킬을 배포하거나 전역 Superpowers 설치를 관리하지 않는다.
- ARC 패키지 자체의 npm 다운로드·버전 조회·업데이트 네트워크를 제거하지 않는다.
- 새로운 mockup 서버나 시각화 기능을 만들지 않는다.
- upstream 실행 지시를 근거로 ARC 역할 권한이나 승인 절차를 확대하지 않는다.
- 이번 작업에서 upstream 버전을 새로 수집하지 않는다.
- ignored shell entrypoint를 Git, npm package 또는 release artifact에 포함하지 않는다. 현재 worktree에서만 쓸 로컬 도구다.
- 이번 구현 과정에서 updater를 실행하거나 upstream을 fetch하지 않는다.

## 3. 접근 선택

### 채택 접근: 평면 정적 파일과 명시적 경로 매핑

현재 파일을 새 목적지로 옮기고 패키지의 일반 정적 자산으로 검증한다. provenance의 원본 경로는 그대로 두고, ARC 코드가 원본 경로와 목적지 경로를 명시적으로 연결한다.

이 방식은 사용자가 지정한 평면 배치와 원본 바이트 보존을 함께 만족한다. 런타임 수집 없이 패키지에서 설치할 수 있고, 추가 호환 디렉터리나 symlink가 필요하지 않다.

### 고려한 대안

- 기존 중첩 트리를 고정하는 방식은 변경량이 작지만, 사용자가 지정한 Markdown 평면 배치와 맞지 않는다.
- 원문의 상대 경로를 수정하거나 wrapper 파일로 대체하는 방식은 파일 배치를 자유롭게 만들 수 있지만, 원본 내용 보존 요구와 맞지 않는다.
- 기존 트리와 평면 파일을 함께 배포하는 방식은 복제본 간 불일치와 관리 범위를 늘리므로 채택하지 않는다.

기존 ARC 시각화 정책과 upstream `visual-companion.md`의 이름 충돌은 ARC 정책을 `arc-visual-companion.md`로 옮기는 것으로 해결한다. 이 해소 범위는 Orchestrator가 확인했다.

## 4. 정확한 파일 배치와 보존 계약

아래 매핑을 `codex`와 `claude`에 동일하게 적용한다. 원본 경로는 기존 `skill/references/superpowers/` 기준이며, 목적지 경로는 `skill/references/` 기준이다.

| 원본 | 목적지 |
|---|---|
| `brainstorming/SKILL.md` | `brainstorming.md` |
| `writing-plans/SKILL.md` | `writing-plans.md` |
| `test-driven-development/SKILL.md` | `test-driven-development.md` |
| `brainstorming/visual-companion.md` | `visual-companion.md` |
| `brainstorming/builder-check-prompt.md` | `builder-check-prompt.md` |
| `test-driven-development/writing-good-tests.md` | `writing-good-tests.md` |
| `brainstorming/scripts/start-server.sh` | `scripts/start-server.sh` |
| `brainstorming/scripts/stop-server.sh` | `scripts/stop-server.sh` |
| `brainstorming/scripts/server.cjs` | `scripts/server.cjs` |
| `brainstorming/scripts/helper.js` | `scripts/helper.js` |
| `brainstorming/scripts/frame-template.html` | `scripts/frame-template.html` |
| `LICENSE` | `superpowers-LICENSE` |
| `provenance.json` | `superpowers-provenance.json` |

보존 조건:

- 모든 매핑은 파일을 읽은 바이트 그대로 적용한다.
- 줄바꿈·인코딩·공백·frontmatter를 정규화하지 않는다.
- 설치 시 imported 파일에 ARC 템플릿 치환이나 문구 삽입을 적용하지 않는다.
- 양 플랫폼의 대응 imported 파일은 바이트 단위로 동일해야 한다.
- 새 배포 트리에는 기존 `references/superpowers/` 복제본을 남기지 않는다.
- imported 파일은 일반 파일로 배포한다. alias·symlink·런타임 생성 파일로 대체하지 않는다.

기존 ARC 정책 파일은 각 플랫폼에서 다음처럼 이동한다.

```text
skill/references/visual-companion.md
→ skill/references/arc-visual-companion.md
```

Codex와 Claude의 ARC 정책 내용은 서로 다르므로 각자의 정책을 보존한다. 이동 후에는 ARC-owned 경로 안내만 갱신한다. upstream 원문과 ARC 정책을 합치지 않는다.

## 5. 상대 참조와 실행 기준

새 배치에서 다음 관계를 유지한다.

- `brainstorming.md`와 `builder-check-prompt.md`, `visual-companion.md`가 같은 디렉터리에 있다.
- `test-driven-development.md`와 `writing-good-tests.md`가 같은 디렉터리에 있다.
- `visual-companion.md`의 `scripts/` 참조가 실제 자산 위치와 일치한다.
- `server.cjs`, `helper.js`, `frame-template.html`은 같은 디렉터리에 있다.
- 시작·종료 shell script도 같은 `scripts/` 디렉터리에 둔다.

ARC 시각화 안내는 설치된 `references/`를 원문 상대 명령의 기준 디렉터리로 지정한다. Orchestrator는 설치 위치의 절대 경로를 brief에 제공하고, 원문의 상대 shell 명령은 그 디렉터리에서 실행한다.

스크립트 실행을 위해 upstream 원문을 변경하거나 전역 설치를 fallback으로 사용하지 않는다. 필수 파일이 없으면 의존 작업을 중단한다.

mockup 서버의 선택적 Superpowers 버전 조회는 원본 그대로 둔다. 현재 vendored tree에는 upstream package manifest가 없으므로 `unknown` 표시를 허용한다. 이를 바꾸려고 가짜 upstream manifest를 추가하지 않는다.

### A/B 목업 선택과 다음 채팅 턴

사용자가 확인한 증상은 A/B 선택 하이라이트는 표시되지만 채팅 후속 응답은 없었다는 것이다. 기존 원본의 동작은 다음과 같다.

- 예제는 `data-choice`와 `toggleSelect`로 브라우저 선택 상태를 표시한다. `brainstorming/scripts/helper.js:122-158`은 선택 요소 클릭 이벤트 전송과 선택 CSS 변경을 별도 처리한다. WebSocket 연결이 열리지 않았으면 이벤트를 대기열에 둔다.
- `brainstorming/scripts/server.cjs:511-516`은 `choice`가 있는 이벤트를 해당 세션의 `state_dir/events`에 추가한다.
- 클릭 이벤트는 ARC 채팅 턴이나 assistant 응답을 자동으로 시작하지 않는다. `brainstorming/visual-companion.md:120-123`의 “On your next turn” 안내도 다음 턴에서 이벤트 파일을 읽도록 한다.

따라서 하이라이트는 브라우저 선택 표시가 작동했다는 증거이고, 서버 저장이나 채팅 후속 응답의 증거는 아니다. 클릭 직후 채팅 응답이 없었던 것은 기존 상호작용 계약에 부합한다. 파일 이동은 `scripts/` 상대 경로와 이 동작을 유지하며 자동 채팅 깨우기를 추가하지 않는다.

ARC-owned `arc-visual-companion.md`는 사용자가 선택 후 채팅으로 돌아와 후속 메시지를 보낼 수 있고, 다음 턴에서 ARC가 실제 해당 세션의 이벤트를 읽어 선택을 반영한다는 점을 안내한다. 이벤트는 채팅 메시지를 보조하는 입력으로 취급한다. 하이라이트만으로 이벤트 저장을 단정하지 않고, 세션 경로를 추정하지 않는다. 이벤트가 없거나 채팅 메시지와 충돌하면 현재 메시지를 우선하고 필요할 때 사용자에게 확인한다. imported upstream 파일은 이 안내를 위해 수정하지 않는다.

## 6. provenance와 정적 manifest 계약

### provenance

`superpowers-provenance.json`은 현재 `provenance.json`의 바이트를 그대로 보존한다. 원본 경로별 해시, revision, repository, `fetchedAt`을 이번 이동 과정에서 재작성하지 않는다. 사용자가 나중에 수동 updater를 실행할 때만 새 upstream 자료에 대응하는 provenance를 생성한다.

ARC는 명시적 매핑을 사용하여 다음을 확인한다.

- provenance가 지원하는 형식이며 세 스킬과 source repository를 식별한다.
- 기록된 원본 파일마다 대응하는 목적지 일반 파일이 존재한다.
- 목적지 파일 바이트의 SHA-256이 provenance의 원본 경로 해시와 일치한다.
- 필수 Markdown과 mockup 자산을 모두 포함한다.
- 현재 배포 형식에서 허용하지 않는 링크나 경로를 받아들이지 않는다.
- 양 플랫폼의 대응 imported 파일과 metadata가 동일하다.

현재 `builder-check-prompt.md`는 실제 배포 파일이면서 brainstorming의 직접 참조 대상이다. 필수 자산 집합에 반드시 포함한다.

원본 경로는 검증용 식별자다. 해당 경로를 설치 위치에 재생성하거나 파일 시스템 탐색 경로로 임의 사용하지 않는다.

### manifest

`MANIFEST.sha256`은 imported 파일과 metadata를 포함한 모든 새 정적 목적지를 보호한다. 기존 Superpowers 동적 root 예외는 제거한다.

검증은 다음을 구분한다.

- manifest: 패키지에 있는 보호 파일의 무결성
- 필수 자산 목록: manifest 재생성으로 필수 파일 누락을 숨기는 것을 방지
- provenance와 매핑: imported 원본 바이트와 파일 구성 확인
- 플랫폼 간 비교: 대응 imported 자산의 동일성 확인

`models.toml` 등 기존의 명시적 mutable 계약은 이 변경으로 확대하거나 축소하지 않는다.

provenance와 manifest는 파일 동일성과 배포 구성을 확인한다. upstream 저자의 서명이나 출처 진위까지 암호학적으로 증명한다고 표현하지 않는다.

## 7. 설치·재설치·upgrade 동작

일반 사용자 경로는 다음 계약을 따른다.

1. 선택한 ARC 패키지를 기존 방식으로 검증한다.
2. 검증된 플랫폼별 package files에서 설치 payload를 만든다.
3. imported 파일은 검증된 바이트 그대로 설치 트리에 포함한다.
4. 기존 snapshot 검사와 트랜잭션으로 공개한다.
5. 실패·취소·cleanup 결과는 기존 결과 구조로 보고한다.

Superpowers clone, 최신 revision 조회, 외부 acquisition 임시 디렉터리 생성은 이 경로에서 수행하지 않는다. 중첩 `composeArcSkillTree()` 방식은 설치 payload를 구성하는 데 사용하지 않고 평면 정적 파일 매핑만 사용한다. 설치 스크립트를 비활성화하거나 패키지를 읽기 전용으로 둔 경우에도 같은 로컬 payload를 사용한다.

영향받는 주요 경로:

- `lib/management/operations.mjs`
- `lib/installer/install.mjs`
- `lib/installer/upgrade.mjs`
- `lib/installer/plan.mjs`
- `lib/installer/transaction.mjs`
- `lib/installer/superpowers.mjs`
- `lib/installer/manifest.mjs`

`plan.mjs`의 최신 Superpowers 수집 안내는 패키지에 포함된 참조를 설치한다는 설명으로 바꾼다.

설치 전 snapshot 검사, 여러 플랫폼의 충돌 검사, 플랫폼별 결과, 실패 시 후속 처리 중단, rollback과 잔여 경로 보고는 유지한다. acquisition 제거를 이유로 기존 트랜잭션 검사를 생략하지 않는다.

현재 postinstall은 사용 안내만 출력한다. 이 동작은 유지하며 새 자동 갱신 hook을 추가하지 않는다.

## 8. 명시적 수동 갱신 도구

사용자는 harness install·upgrade와 별개로 최신 upstream 파일을 직접 반영할 수 있어야 한다. 수집·검증·게시 코드는 기존 추적 Node updater와 관련 라이브러리 한 곳에 두고, 요청한 로컬 shell script는 그 updater를 호출하는 얇은 entrypoint로 둔다.

| 경로 | 책임·관리 |
|---|---|
| `scripts/update-superpowers-local.sh` | 현재 worktree에만 두는 ignored shell entrypoint |
| `scripts/update-superpowers.mjs` | 추적되는 Node CLI entrypoint |
| `lib/installer/package-references.mjs` | 수집 결과 검증·평면 게시·복구·cleanup |
| `lib/installer/acquisition.mjs` | 명시적 updater의 upstream acquisition |
| `lib/installer/superpowers.mjs` | 공통 원본 매핑·필수 자산·검증 규칙 |

기존 `scripts/update-superpowers.mjs`는 `refreshPackageReferences()`를 호출한다. 이를 평면 매핑으로 바꾸고 수동으로 실행할 때만 `acquisition.mjs`를 통하도록 한다. 설치 경로가 updater를 호출할 수 있는 injectable acquisition 우회 경로도 제거한다.

`scripts/update-superpowers-local.sh`는 자신의 위치를 기준으로 같은 디렉터리의 추적 Node script를 찾아 실행한다. 호출자의 현재 디렉터리와 무관하게 이 저장소를 대상으로 하며 경로 공백을 안전하게 처리한다. Node의 stdout·stderr를 그대로 전달하고 실패 종료 코드를 보존한다. shell 안에 upstream URL, clone, 별도 매핑·검증·게시·rollback 로직을 중복 구현하지 않는다.

수동 실행 시 한 번 수집한 검증 결과를 양 플랫폼에 동일하게 적용한다. 게시 전 staging에서 필수 파일·지원 구조·원본 상대 참조·provenance·양 플랫폼 동일성·ARC-owned 파일 비침범을 확인한다. 적용 실패 시 기존 자산, metadata와 manifest를 복원하고 복구 실패·잔여 경로를 보고한다. updater는 `arc-visual-companion.md`나 다른 ARC-owned 문서를 바꾸지 않고, 정적 manifest가 새 파일과 일치하도록 갱신한다.

지원 매핑을 벗어나는 필수 파일·링크·이름 충돌은 자동 추정이나 원문 수정 없이 실패한다. updater가 성공한 뒤에도 새 결과는 평면 배치, provenance, manifest와 release 검증을 만족해야 한다.

이 updater는 명시적 유지관리 기능이다. install·upgrade·postinstall·pack·release 경로에서 직접 또는 간접으로 호출하지 않는다. 이번 구현 과정에서는 wrapper나 Node updater를 실행하거나 새 upstream 자료를 가져오지 않는다.

## 8.1 `.gitignore`와 배포 제외

저장소 `.gitignore`에 정확한 로컬 파일 패턴을 추가한다.

```gitignore
/scripts/update-superpowers-local.sh
```

요청된 shell 파일은 현재 worktree에 생성하되 추적·stage·commit하지 않는다. 사용자는 이 worktree에서 직접 실행할 수 있다. 다른 checkout·새 clone·새 worktree에 자동으로 존재하지 않으므로 완료 보고에 local-only 성격과 전체 경로를 밝힌다.

Git ignore가 package exclusion까지 보장한다고 가정하지 않는다. 정확한 wrapper 경로가 정적 manifest, package files 목록, release source inventory, staging payload와 최종 tarball에서 제외되는지 각각 확인한다. 이 제외는 local wrapper 한 경로에 한정하고 `scripts/`의 다른 shell 파일이나 imported mockup 자산은 유지한다.

## 9. ARC 경로 통합

양 플랫폼에서 다음 ARC-owned 안내를 새 경로로 연결한다.

| 용도 | 새 경로 |
|---|---|
| Planner brainstorming | `references/brainstorming.md` |
| Planner writing plans | `references/writing-plans.md` |
| Implementer TDD | `references/test-driven-development.md` |
| ARC 시각화 정책 | `references/arc-visual-companion.md` |
| upstream 시각화 원문 | `references/visual-companion.md` |
| 시각화 자산 | `references/scripts/` |

확인된 변경 대상:

- 각 플랫폼 `skill/references/coordination.md`
- 각 플랫폼 `skill/references/planning.md`
- 각 플랫폼 `skill/references/verification.md`
- 각 플랫폼에서 이동한 `arc-visual-companion.md`
- 각 플랫폼 `skill/SKILL.md`의 ARC 시각화 정책 링크
- `codex/agents/arc-planner.toml`
- `codex/agents/arc-implementer.toml`
- `claude/agents/arc-planner.md`
- `claude/agents/arc-implementer.md`
- Claude `coordination.md`의 ARC 시각화 정책 링크
- `docs/harness-operation.md`의 설치/upgrade 설명과 수동 shell updater 안내

ARC 안내에서 imported 참조를 항상 `SKILL.md`라고 지칭하는 표현도 새 파일명과 맞춘다. 생성된 정책·프로필이라면 canonical 입력과 생성물의 관계를 유지한다.

`superpowers:executing-plans` 등 upstream 역할 지시는 기존 ARC 조정 규칙으로 해석한다. 참조 파일 이동은 역할 권한, 사용자 승인, 작업 분담, QA·Reviewer 경계를 변경하지 않는다.

## 10. 구버전 호환성·uninstall·rollback

### upgrade와 재설치

기존 ARC 전체 관리 트리 교체 방식을 유지하여 새 설치본에 중첩 `references/superpowers/`와 오래된 내부 파일이 남지 않게 한다.

기존 설정 보존 계약을 유지한다. 모델 설정, 언어, limits, native 설정 drift, global block 처리 등 이 변경과 무관한 upgrade 동작을 바꾸지 않는다.

### uninstall

새 평면 imported 파일은 ARC 관리 트리의 일반 파일로 제거한다.

기존 설치본의 중첩 Superpowers 내부 링크 검증은 호환성을 위해 유지한다. 새 형식이 일반 파일이라는 이유로 구버전 설치본의 안전한 제거를 막거나, 반대로 링크 검증 범위를 임의 확대하지 않는다.

외부 공유 스킬, 전역 Superpowers 경로, 사용자 파일은 새 관리 대상으로 편입하지 않는다.

### rollback과 cleanup

배포 중 실패하면 해당 트랜잭션의 이전 ARC 트리와 관련 관리 파일을 기존 계약에 따라 복원한다. 공개 완료 후 cleanup 실패와 설치 실패를 구분하고 잔여 경로를 보고한다.

단순 경로 이동을 위해 기존 staging·보존·rollback 절차를 우회하지 않는다.

## 11. release 호환성

현재 release의 소스 snapshot, staging manifest 재생성, offline·ignore-scripts pack, tarball 재검증 흐름을 유지한다.

새 imported 자산은 다음 모든 지점에 포함되어야 한다.

- 소스 입력 inventory
- 정적 manifest
- staging payload
- 최종 tarball
- tarball에서 추출한 payload 검증

release 생성 중 upstream 내용을 수집하거나 imported 파일을 재작성하지 않는다. artifact에 추가되는 기존 postinstall 안내 hook의 계약도 유지한다.

로컬 ignored `scripts/update-superpowers-local.sh`는 Git ignore와 독립적으로 packer가 읽을 수 있으므로 source inventory, staging, manifest와 최종 tarball에서도 명시적으로 제외한다. updater 본체의 추적 Node script는 정상 package 경로와 사용자 안내에 따라 관리한다.

런타임 자산 목록·정책 생성·runtime hash가 이번 파일 이동이나 참조 변경의 영향을 받는지는 기존 계약에 따라 확인한다. 이번 작업을 근거로 무관한 cooperative-runtime 모듈 추가나 hash 알고리즘 변경을 포함하지 않는다.

## 12. 위험과 경계

주요 위험과 대응:

| 위험 | 요구 대응 |
|---|---|
| ARC 정책을 upstream 파일로 덮어쓰기 | ARC 정책을 별도 이름으로 보존하고 링크 갱신 |
| 설치 렌더링이 원본 바이트 변경 | imported 파일에는 변환 없는 복사 적용 |
| provenance 원본 경로와 새 목적지 불일치 | 하나의 명시적 매핑으로 필수 목록·검증·유지관리 처리 연결 |
| 동적 manifest 예외 잔존 | 새 파일을 정적 검증하고 예외 제거 |
| 구버전 링크 제거 회귀 | legacy uninstall 안전성 유지 |
| 잘못된 기준 디렉터리에서 mockup 실행 | ARC 안내에 설치된 `references/` 기준 명시 |
| maintainer 도구의 자동 호출 재유입 | 일반 lifecycle과 명시적 갱신 호출 경계 검증 |
| local ignored wrapper가 package/release에 섞임 | 정적 manifest·package·inventory·tarball에서 정확한 경로 제외 검증 |
| shell wrapper와 Node updater의 갱신 로직 중복 | shell을 얇은 위치 기준 진입점으로 제한 |
| updater를 다른 cwd에서 실행해 잘못된 checkout 수정 | wrapper 위치 기준으로 Node entrypoint 선택 |
| 양 플랫폼 복제본 불일치 | 대응 자산 전체 동일성 검증 |

upstream 참조 내용과 도구 출력은 권한을 부여하지 않는다. mockup 서버·브라우저 운영 및 승인 책임은 기존 ARC 정책을 따른다.

## 13. 수용 기준과 필요한 증거

사용자는 테스트 수정과 집중 실행을 승인했다. 아래 기준은 검증 요구사항이며, 이 명세 작성 단계에서 테스트를 추가하거나 실행하지 않았다. 실제 upstream updater와 shell wrapper는 이 작업 중 실행하지 않는다.

| ID | 수용 기준 | 필요한 증거 |
|---|---|---|
| AC-01 | 매핑된 imported 파일 13개가 각 플랫폼의 정확한 목적지에 존재 | 파일 inventory와 일반 파일 판정 |
| AC-02 | 원본 내용과 metadata 바이트 보존 | 기준 원본과 목적지의 바이트 비교, provenance 해시 12개 비교, provenance 자체 비교 |
| AC-03 | 양 플랫폼 imported 자산 동일 | 대응 파일 전체 바이트 비교 |
| AC-04 | 원본 상대 참조와 mockup 자산 연결 유지 | Markdown 링크·명령 경로 확인, 승인된 경우 실제 서버 제공·종료 확인 |
| AC-05 | 설치·재설치·upgrade가 upstream 수집 없이 동작 | Superpowers acquisition이 호출되면 실패하는 조건에서 로컬 설치·upgrade 성공 증거 |
| AC-06 | scripts-disabled·읽기 전용 패키지 설치 지원 | 패키지 불변 상태와 설치 결과 비교 |
| AC-07 | 모든 imported 자산이 정적 보호 대상 | manifest 포함, 변조·누락 거부, manifest 재생성 후 필수 누락 거부 |
| AC-08 | ARC 안내와 역할 프로필이 새 경로 사용 | 경로 검증, 정책 생성 일치성, 이전 활성 경로 잔존 확인 |
| AC-09 | ARC 시각화 정책 보존 | 플랫폼별 기존 정책과 새 파일 비교, 허용된 경로 변경만 확인 |
| AC-10 | 기존 중첩 설치에서 안전하게 upgrade | stale 중첩 파일 제거, 설정·외부 sentinel 보존 |
| AC-11 | 신·구 uninstall과 rollback 유지 | 기존 링크 허용·거부 경계, 실패 복원, cleanup 잔여 경로 증거 |
| AC-12 | release artifact가 완전한 정적 자산 포함 | pack inventory와 최종 tarball payload 검증 |
| AC-13 | install·upgrade·postinstall·pack·release에서 updater 비호출 | 자동 경로의 직접·간접 호출 부재 증거 |
| AC-14 | A/B 선택 표시·이벤트 저장·다음 채팅 턴 반영을 구분해 유지 | 아래의 집중 검증 증거 |
| AC-15 | local shell wrapper 생성·ignore·전달 동작 | 현재 worktree의 파일 존재, exact ignore, Node 호출 경로, 출력·종료 코드 전달 확인 |
| AC-16 | ignored wrapper가 배포 산출물에서 제외 | 로컬 파일이 존재하는 상태에서 manifest·package·release inventory·staging·tarball 검사 |
| AC-17 | 수동 updater가 공통 평면 갱신 로직 사용 | network-free fixture로 양 플랫폼 게시, manifest 일관성, 오류 시 복원 확인 |

AC-14의 집중 검증은 임시 세션에서 B 선택 하이라이트, 같은 세션 `state_dir/events`의 기록, 클릭만으로 채팅 턴이나 assistant 응답이 시작되지 않는 경계, 후속 채팅 턴에서 해당 이벤트를 읽어 B를 반영하는 흐름을 각각 확인한다. 현재 채팅 내용이 이벤트와 충돌할 때는 채팅을 우선하고 필요하면 확인한다. 서버와 임시 자산은 기존 정책에 따라 정리한다. 하이라이트·저장·실제 다음 턴 반영 결과를 따로 기록하며 앞 단계의 증거로 뒤 단계를 통과 처리하지 않는다. 실제 다음 턴 동작을 확인할 수 없으면 그 기준은 미검증으로 남긴다.

AC-15는 upstream을 호출하지 않는 stub Node 실행으로 확인한다. AC-17도 고정 fixture와 acquisition 대역을 사용하며 실제 최신 upstream fetch는 포함하지 않는다.

관련 집중 검사 범위에는 기존 `superpowers`, `acquisition`, `install`, `manifest`, `package`, `package-references`, `uninstall`, `management-operations`, `upgrade-harness`, `release-artifact`, 로컬 wrapper 경계 및 A/B 이벤트 경로가 포함된다. 테스트 수정과 집중 실행은 승인되었으며, 구체적인 검사 범위와 순서는 계획에서 정한다.

구조 검증 통과만으로 실제 설치, 서버 실행, CLI runtime 동작까지 입증했다고 보고하지 않는다. 실행하지 못한 기준은 미검증으로 남긴다.

## 14. 의존성·보류 조건·승인 경계

이 작업은 파일 배치, 패키지 신뢰 경계, 설치 입력, 수동 updater, Git ignore와 구버전 수명주기를 함께 바꾸는 architectural 변경이다.

진행 의존성:

1. Orchestrator가 이 명세를 통합·저장하고 written-spec 승인을 받는다.
2. Planner가 `writing-plans`에 따라 구현 계획을 작성한다.
3. Orchestrator가 계획을 통합하고 필요한 승인을 받는다.
4. 승인된 범위와 검증 권한을 갖춘 Implementer에게 인계한다.
5. 필요한 QA와 finding 재검증 후 Orchestrator가 수용한다.
6. 최종 전체 변경에 대해 독립 Reviewer 검토와 필요한 재검토를 수행한다.

다음 조건에서는 해당 의존 작업 또는 최종 수용을 보류한다.

- imported 원본 바이트나 기준 revision 불일치
- 목적지 충돌 또는 예상하지 못한 사용자 변경
- ARC 정책·생성물의 canonical 소유 관계 불명확
- 필수 검증의 미승인·실패·미검증 상태
- 구버전 제거나 rollback 안전성의 미해결 회귀
- 자동 설치 경로에 남아 있는 upstream acquisition
- local wrapper의 Git 추적·package/release 유입
- 부분 updater 게시 또는 manifest 불일치
- maintainer 도구가 지원하지 않는 새 upstream 구조를 자동 추정해야 하는 상태

이전 `2026-10-17-superpowers-internal-references-*` 문서는 역사적 배경으로 남긴다. 그 문서의 중첩 배치, 동적 manifest 예외, 설치마다 최신 수집하는 계약은 새 명세 승인 시 이번 범위에서 대체된다. 무관한 안전성 계약은 유지한다.

---

## 초안 자체 점검

- **원본 보존:** 파일 이동·개명과 ARC-owned 안내 변경을 구분했다. installed imported 파일에도 바이트 보존을 적용했다.
- **이름 충돌:** 플랫폼별 ARC 정책을 `arc-visual-companion.md`로 보존하고 upstream 원문 목적지를 확보했다.
- **출처 추적:** provenance를 재작성하지 않고 명시적 매핑으로 검증하도록 정했다.
- **자동·수동 경계:** 사용자 요청에 필요한 자동 acquisition 제거와 별도 유지관리 명령을 구분했다.
- **local updater:** tracked Node core와 ignored shell entrypoint를 분리하고 package/release 제외까지 명시했다.
- **수명주기:** 기존 설치의 upgrade, legacy 링크 uninstall, rollback·cleanup·release를 포함했다.
- **A/B 동작:** 하이라이트, 서버 저장, 다음 채팅 턴 반영을 별도 단계로 정의하고 자동 응답을 약속하지 않는다.
- **증거 한계:** 초기 원본 동일성은 Orchestrator 제공 근거를 사용했다. 구현 후 검증 결과는 아직 없다.
- **범위:** 테스트 수정·집중 실행 권한은 반영했다. 구현이나 검증은 아직 수행하지 않았다.

테스트 수정·집중 실행 권한은 사용자 답변으로 해결되었다. 사용자의 shell updater 요구는 이 개정안에 통합했으며 기존 written-spec 승인을 대신하지 않는다. 남은 단계는 개정 명세에 대한 사용자 승인이다. 레이아웃과 ARC 시각화 정책 충돌은 Orchestrator가 확인한 범위 안에서 해소했다.
