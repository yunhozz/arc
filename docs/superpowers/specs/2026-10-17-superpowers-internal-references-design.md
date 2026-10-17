# superpowers 내부 참조 배포 및 최신화 명세

상태: 승인된 설계를 바탕으로 한 상세 명세 초안. 구현 계획은 포함하지 않습니다.

저장소 기준 경로: `/Users/yunho/Desktop/project/arc`

## 1. 목적과 성공 조건

ARC가 사용하는 superpowers 지침을 ARC 내부 참조 자료로 배포한다. 사용자가 별도 superpowers 스킬을 전역 설치하지 않아도 Planner와 Coder가 기존 ARC 절차에 따라 작업할 수 있어야 한다.

npm `postinstall`에서는 패키지 내부 자료를 최신화하고, 실제 `arc install`에서도 다시 최신 자료를 수집하여 선택한 플랫폼에 설치한다. 기존 파일이 있어도 새 자료로 교체한다.

대상은 다음 세 스킬이다.

- `brainstorming`
- `writing-plans`
- `test-driven-development`

upstream은 `https://github.com/obra/superpowers`이다. 최신화 과정에서 upstream 자료를 실행하거나 수정하지 않는다. ARC의 역할 소유권, 승인, 실행 준비, TDD 예외 및 검증 규칙은 기존 ARC 어댑터에서 적용한다.

## 2. 현재 구현과 변경 경계

현재 `lib/installer/acquisition.mjs:5-11`은 세 스킬 및 필수 부속 자료를 정의하고 `npx skills@latest`를 통해 임시 디렉터리에 수집한다.

`lib/installer/plan.mjs`는 대상 플랫폼의 독립 스킬 경로와 일부 기존 공유 경로를 `externalPaths`에 포함한다. `lib/installer/transaction.mjs:62`는 그 경로와 `skills/arc`를 각각 게시한다.

`lib/cli/index.mjs:34-35`에서 실제 설치 시 수집을 수행한다. `scripts/npm-postinstall.mjs`는 현재 completion만 처리한다.

`lib/installer/manifest.mjs:3-5` 및 `scripts/update-manifest.mjs`는 양 플랫폼의 `skill` 디렉터리를 정적 manifest 대상으로 취급한다.

이번 변경은 독립 전역 스킬 게시를 없애고, 수집 결과를 ARC 참조 트리에 포함시키는 것이다. 기존 사용자 전역·공유 스킬은 관리 대상으로 편입하지 않는다.

## 3. 저장 구조

### 3.1 저장소와 npm 패키지

```text
codex/skill/references/superpowers/
  LICENSE
  provenance.json
  brainstorming/
    SKILL.md
    ...
  writing-plans/
    SKILL.md
    ...
  test-driven-development/
    SKILL.md
    ...

claude/skill/references/superpowers/
  LICENSE
  provenance.json
  brainstorming/
    SKILL.md
    ...
  writing-plans/
    SKILL.md
    ...
  test-driven-development/
    SKILL.md
    ...
```

각 스킬 디렉터리는 upstream `skills/<skill>/` 전체 트리의 복사본이다. 파일 이름, 내용, 상대 참조 구조를 보존한다. 선택한 세 스킬 밖의 upstream 스킬과 Git 메타데이터는 포함하지 않는다.

### 3.2 사용자 설치 결과

```text
<CODEX_HOME>/skills/arc/references/superpowers/
~/.claude/skills/arc/references/superpowers/
```

Codex의 기본 `CODEX_HOME`은 기존처럼 `~/.codex`이며 사용자 지정 경로도 지원한다. Claude 경로 정책은 현재 구현을 유지한다.

양 플랫폼은 자기 ARC 내부 자료를 사용한다. Codex 설치가 Claude 설치의 선행 조건이 되어서는 안 된다.

### 3.3 기존 외부 경로

다음 경로의 기존 자료는 이번 설치의 검사·쓰기·삭제 대상에서 제외한다.

```text
<CODEX_HOME>/skills/brainstorming/
<CODEX_HOME>/skills/writing-plans/
<CODEX_HOME>/skills/test-driven-development/

~/.claude/skills/brainstorming/
~/.claude/skills/writing-plans/
~/.claude/skills/test-driven-development/

~/.agents/skills/<skill>/
```

기존 Claude→Codex 외부 스킬 링크도 그대로 둔다. 해당 경로의 파일 종류나 상태 때문에 새 ARC 설치가 실패해서는 안 된다. 단, 실제 관리 대상인 `skills/arc`의 안전성 검사는 계속 적용한다.

## 4. upstream 수집 계약

### 4.1 최신 리비전

최신은 해당 수집 실행 시 upstream 기본 브랜치에서 새로 가져온 커밋으로 정의한다. 세 스킬과 라이선스는 같은 커밋에서 가져온다.

구체적인 수집 방식은 다음으로 정한다.

- 격리된 새 임시 디렉터리에 upstream을 shallow clone한다.
- 특정 릴리스나 커밋을 고정하지 않고 원격 기본 브랜치를 사용한다.
- 수집된 실제 커밋 식별자를 기록한다.
- 선택한 세 스킬 트리와 루트 라이선스만 검증·추출한다.

이는 명세 단계의 구현 선택이다. 기존 `skills@latest` CLI 대신 upstream 스냅샷을 직접 수집하여, 스킬과 라이선스의 동일 리비전 및 추적 가능성을 확보한다. 따라서 최신화에는 `git` 실행 파일과 네트워크가 필요하며, 별도 superpowers 스킬 설치 도구는 필요하지 않다.

`git`은 shell 문자열이 아닌 인수 배열로 실행한다. 기존 수집기의 격리된 HOME·Git 설정·비대화형 실행·취소·타임아웃·자식 프로세스 정리 원칙을 유지한다. upstream 스크립트나 저장소가 제공하는 명령은 실행하지 않는다.

### 4.2 수집 결과

공용 수집기는 다음 정보를 반환할 수 있어야 한다.

- 스킬별 검증된 전체 트리와 파일 바이트
- 필요한 실행 권한 정보
- 라이선스 원문
- 실제 upstream 커밋 식별자
- 수집 시각
- 자료별 SHA-256
- 임시 공간 정리 기능과 정리 실패 정보

기존 트리 검증에서 다루는 경로 탈출, special file, 깨진 링크, 순환 링크 등의 거부 조건을 유지한다. 허용하는 링크는 동일 스킬 트리 내부로 해석되어야 한다. 이를 보존하기 위해 사용자 전역 경로를 참조해서는 안 된다.

### 4.3 필수 자료

현재 구현이 요구하는 다음 자료를 최소 필수 집합으로 유지한다.

- 각 스킬의 `SKILL.md`
- brainstorming의 `visual-companion.md`와 현재 필수 서버·보조 스크립트
- TDD의 `writing-good-tests.md`

정확한 기존 목록의 근거는 `lib/installer/acquisition.mjs:5-9`이다.

upstream 변경으로 필수 자료가 사라지거나 구조가 호환되지 않으면 갱신을 실패시킨다. 조용히 일부 기능을 제거하거나 전역 스킬로 대체하지 않는다. upstream의 미래 의미 변경을 자동으로 호환한다고 보장하지 않는다.

## 5. 라이선스와 출처 기록

Orchestrator가 확인한 upstream 라이선스는 MIT이며 저작권 고지는 `Copyright (c) 2025 Jesse Vincent`이다.

출처: [obra/superpowers LICENSE](https://github.com/obra/superpowers/blob/main/LICENSE).

배포·설치 결과마다 수집한 리비전의 `LICENSE` 전체를 보존한다. 저작권 및 허가 고지를 제거하거나 ARC 저작권으로 대체하지 않는다. README에도 포함된 자료의 upstream 출처와 MIT 라이선스 위치를 설명한다.

`provenance.json`은 ARC가 생성하며 다음 정보를 기록한다.

```json
{
  "schemaVersion": 1,
  "repository": "https://github.com/obra/superpowers",
  "revision": "<resolved commit>",
  "fetchedAt": "<UTC timestamp>",
  "skills": [
    "brainstorming",
    "writing-plans",
    "test-driven-development"
  ],
  "files": {
    "LICENSE": "<sha256>",
    "brainstorming/SKILL.md": "<sha256>"
  }
}
```

`files`에는 실제 배포되는 모든 일반 파일을 포함하고 `provenance.json` 자신은 제외한다. 링크가 있으면 정규화된 링크 대상도 별도 기록·검증할 수 있어야 한다. 레코드와 실제 트리 사이에 누락·중복·예상 밖 항목이 없어야 한다.

이 기록은 출처 추적과 내용 일관성 확인을 위한 것이다. upstream 서명 검증이나 악의적인 로컬 재작성에 대한 인증 수단으로 표현하지 않는다.

## 6. npm `postinstall` 수명주기

실행 흐름은 다음과 같다.

1. 새 임시 공간에 최신 upstream을 수집한다.
2. 세 스킬, 부속 자료, 라이선스와 출처 기록을 검증한다.
3. 패키지의 Codex·Claude 참조 트리 각각에 게시할 staging을 완성한다.
4. 두 플랫폼의 기존 `references/superpowers/`를 새 트리로 교체한다.
5. 이전 트리와 임시 공간을 정리한다.
6. 기존 completion 처리를 수행한다.

한 번의 postinstall에서는 동일한 수집 결과를 두 플랫폼에 게시한다.

기존 파일의 존재나 수집 기록의 시각을 근거로 갱신을 생략하지 않는다. 새 트리로 교체하므로 upstream에서 제거된 파일은 남지 않는다.

수집·검증·게시 실패는 postinstall의 실패로 반환한다. completion의 기존 best-effort 실패 처리는 superpowers 갱신 실패를 삼키지 않는다.

npm lifecycle이 실행되지 않은 경우의 의미를 명시한다.

- `npm --ignore-scripts`에서는 postinstall 갱신이 수행되지 않는다.
- Git clone·ZIP 다운로드에서는 npm lifecycle이 자동 실행되지 않는다.
- npm이 해당 작업에서 postinstall을 실행하지 않았다면 ARC가 그 작업에 갱신을 강제할 수 없다.
- 이 경우에도 실제 `arc install`은 항상 새 upstream을 수집한다.

패키지에는 배포 당시의 정상 참조 트리를 포함한다. 이 사실을 postinstall 실패를 성공으로 처리하는 근거로 사용하지 않는다.

## 7. 실제 `arc install` 수명주기

기존 인수 처리와 대상 선택 이후 다음을 수행한다.

1. 정적 payload와 포함된 동적 참조 트리를 로컬에서 검증한다.
2. 선택한 대상의 설치 계획과 snapshot을 작성한다.
3. 실제 설치이면 upstream을 새로 수집한다.
4. 수집한 참조 트리를 ARC skill staging에 합성한다.
5. 기존 snapshot·drift 검사를 거쳐 트랜잭션으로 게시한다.
6. 수집 공간과 staging을 정리하고 대상별 결과를 보고한다.

실제 설치에서 사용하는 superpowers 내용은 이번에 수집한 내용이다. 패키지에 포함된 사본으로 최신화 실패를 대체하지 않는다.

실제 `arc install`은 패키지 내부 파일을 다시 쓰지 않는다. 설치 staging에 새 자료를 합성하므로 패키지 디렉터리가 읽기 전용이어도 설치 대상에 대한 권한이 있으면 진행할 수 있다.

기존 `externalPaths` 기반 superpowers 게시와 Claude 외부 스킬 링크 의존성 재조정은 새 설치 경로에서 제거한다. 범용 트랜잭션 API를 유지할지는 구현자가 결정하되, 새 실행 흐름에서 사용자 외부 스킬 경로를 포함해서는 안 된다.

`--target all`은 현재의 대상별 설치 계약을 유지한다.

- Codex 후 Claude 순서로 처리한다.
- 각 실제 대상 설치는 새 자료를 수집한다.
- 앞선 대상 성공 후 뒤 대상이 실패하면 앞선 성공을 유지한다.
- 서로 다른 수집 시점에 upstream이 바뀌면 두 대상의 리비전이 다를 수 있으며 각 출처 기록으로 식별할 수 있다.

## 8. staging·rollback·정리

### 8.1 패키지 갱신

양 플랫폼 갱신을 하나의 논리적 작업으로 취급한다.

- 기존 트리를 이동하기 전에 새 staging을 모두 완성한다.
- 같은 파일시스템에서 교체할 수 있도록 staging·임시 보존 경로를 배치한다.
- 두 번째 플랫폼 게시가 실패하면 이미 바뀐 첫 번째 플랫폼도 이전 트리로 복구한다.
- 이전 트리가 없었던 위치는 실패 시 원래 부재 상태로 복구한다.
- 복구 실패 시 성공을 반환하지 않고 영향을 받은 경로와 남은 복구 자료를 보고한다.
- 성공 후 임시 이전 트리를 제거한다. 영구 백업은 만들지 않는다.

### 8.2 사용자 ARC 설치

현재 ARC 트랜잭션의 staging·drift 검사·rollback·정리 실패 보고를 유지한다. 새 참조 자료를 `skills/arc` 트리의 일부로 게시하므로 기존 ARC 본체와 참조 자료가 서로 다른 설치 세대가 되는 것을 방지한다.

게시 성공 후 정리만 실패한 경우는 기존처럼 게시 결과와 정리 실패를 구분한다. 취소와 정리 실패에서도 잔여 경로를 숨기지 않는다.

동일 패키지의 동시 갱신과 동일 대상의 동시 설치·제거는 지원하지 않는다. 이번 변경에서 별도 동시 실행 조정 시스템을 도입하지 않는다.

## 9. 동적 manifest 무결성

정적 manifest 예외는 다음 두 트리로만 제한한다.

```text
codex/skill/references/superpowers/
claude/skill/references/superpowers/
```

`MANIFEST.sha256` 생성·검증에서 이 동적 영역의 파일 해시를 제외한다. 양 플랫폼의 나머지 ARC 정책·역할·스크립트·코드는 기존처럼 정적 해시 검증을 통과해야 한다.

동적 영역은 무검증 영역으로 만들지 않는다. payload 검증 시 다음을 로컬에서 확인한다.

- 승인된 세 스킬과 라이선스·출처 기록 존재
- 안전한 경로와 파일 종류
- 필수 파일 및 참조 대상 존재
- 허용된 링크 경계와 순환 방지
- 출처 기록의 파일 목록과 실제 트리 일치
- 일반 파일의 기록된 SHA-256 일치

manifest 예외 경로와 동적 검사 경로는 공통 정의를 사용하거나 일치 여부를 검증하여 범위가 어긋나지 않게 한다.

기존 manifest 검증을 통과시키려고 런타임에 정적 manifest 전체를 재생성하지 않는다.

## 10. 역할별 로딩과 ARC 어댑터

### 10.1 Planner

Planner brief는 필요한 설치 경로를 절대 경로로 전달한다.

```text
<installed ARC>/references/superpowers/brainstorming/SKILL.md
<installed ARC>/references/superpowers/writing-plans/SKILL.md
```

Planner는 해당 Markdown과 명시적으로 필요한 부속 자료를 읽는다. 별도 Skill 등록이나 전역 스킬 탐색이 선행 조건이 되어서는 안 된다.

설계·명세·계획 초안은 계속 Planner가 작성하고 Orchestrator가 통합·저장·승인 절차를 맡는다.

### 10.2 Coder

Coder brief는 다음 절대 경로 및 필요한 참조를 전달한다.

```text
<installed ARC>/references/superpowers/test-driven-development/SKILL.md
```

기존 ARC의 TDD 적용 조건과 명시적 예외를 유지한다. 경로 변경으로 TDD 의무를 약화하지 않는다.

### 10.3 상대 참조와 visual companion

upstream 파일의 상대 참조는 그 파일이 위치한 스킬 디렉터리를 기준으로 해석한다.

ARC의 visual companion 계약:

```text
<installed ARC>/references/visual-companion.md
```

upstream의 자료와 스크립트:

```text
<installed ARC>/references/superpowers/brainstorming/
```

두 문서를 혼동하지 않는다. Planner는 시각적 질문·콘텐츠 초안을 반환하고, 승인 및 브라우저·서버 운영은 기존처럼 Orchestrator가 담당한다.

### 10.4 공통 규칙

ARC 문서는 “installed skill”의 의미를 ARC 내부 참조 자료로 명확히 바꾼다. `superpowers:*` 실행기 이름이 남아 있더라도 ARC 절차로 대응시키는 설명이어야 하며 외부 등록 요구가 되어서는 안 된다.

로컬 자료가 누락·손상되면 영향을 받는 역할 작업을 멈추고 Orchestrator에 정확한 경로와 필요한 복구를 보고한다. 런타임에서 전역 스킬로 대체하거나 자동 다운로드하지 않는다.

## 11. `--check`, `--dry-run`, 제거

`--check`와 `--dry-run`은 다음 불변식을 유지한다.

- 네트워크 요청과 수집 프로세스 실행 없음
- 파일·디렉터리 생성, 교체, 삭제 없음
- 로컬 정적·동적 payload와 대상 계획 검사만 수행
- upstream 최신성을 확인했다고 표시하지 않음

`--dry-run`은 실제 설치 시 새 superpowers 자료를 수집하고 ARC 내부 참조를 교체한다는 예정 동작을 표시할 수 있다. 독립 외부 스킬 교체 경로는 표시하지 않는다.

ARC 제거 시 내부 superpowers 자료는 `skills/arc`의 일부로 함께 제거된다. 별도 전역·공유 superpowers 자료는 보존한다.

## 12. 대상 파일과 문서 범위

기준 경로 아래 다음 영역을 변경 대상으로 한다.

- `lib/installer/acquisition.mjs`
- 신규 공용 참조 구성·검증·갱신 모듈
- `scripts/npm-postinstall.mjs`
- `lib/installer/targets.mjs`
- `lib/installer/plan.mjs`
- `lib/installer/transaction.mjs`
- 필요한 `lib/installer/install.mjs`, `lib/cli/index.mjs` 호출부
- `lib/installer/manifest.mjs`
- `scripts/update-manifest.mjs`, `MANIFEST.sha256`
- 양 플랫폼 `skill/references/superpowers/`
- `codex/agents/arc-planner.toml`, `arc-coder.toml`
- `claude/agents/arc-planner.md`, `arc-coder.md`
- 양 플랫폼 `skill/SKILL.md`
- 양 플랫폼 `references/planning.md`, `verification.md`, `visual-companion.md`
- `README.md`
- 관련 수집·설치·트랜잭션·manifest·npm lifecycle·정책 테스트와 fixture

기존 `package.json`의 postinstall 진입점과 배포 포함 경로는 재사용한다. 변경이 필요하면 이 명세의 동작을 위한 범위로 제한한다.

과거 설계·계획 문서는 당시 기록으로 유지한다. 활성 정책과 현재 사용자 안내를 갱신한다.

## 13. 수용 기준

| ID | 기준 | 필요한 증거 |
|---|---|---|
| AC1 | 양 플랫폼 패키지와 설치 결과에 세 스킬 전체 트리·라이선스·출처 기록이 존재한다. | 파일 목록·바이트·필수 참조 대조 |
| AC2 | postinstall은 매 실행 새로 수집하고 양 플랫폼을 같은 결과로 교체한다. | upstream fixture A→B, 호출 기록, 삭제된 파일 제거 |
| AC3 | 실제 대상 설치마다 새 수집이 수행된다. | 재설치 및 `all` 대상별 호출·리비전 증거 |
| AC4 | 전역 superpowers 없이 필요한 로컬 지침과 부속 자료를 읽을 수 있다. | 전역 자료 없는 설치 fixture와 역할 경로·자료 로딩 증거 |
| AC5 | 기존 전역·공유 스킬과 링크를 검사·변경하지 않는다. | 기존 자료·링크 보존 및 계획 대상 확인 |
| AC6 | 수집·검증·게시 실패에서 기존 자료를 보존하고 실패를 보고한다. | 실패 주입, 양 플랫폼 복구, 잔여 경로 증거 |
| AC7 | 동적 갱신은 허용되며 정적 ARC 변조는 계속 거부된다. | 정상 갱신, 정적 변조, 동적 해시·경로 오류 검사 |
| AC8 | Codex·Claude·`all`·사용자 지정 `CODEX_HOME`에서 경로와 대상별 결과가 맞다. | 설치·재설치·부분 성공 결과 |
| AC9 | `--check`·`--dry-run`은 수집과 변경 없이 동작한다. | 수집 미호출 및 파일 상태 비교 |
| AC10 | 역할 정책에 전역 superpowers 필수 의존이 없고 ARC 승인·TDD·visual companion 계약이 유지된다. | 양 플랫폼 정책·프로필 일관성 검사 |
| AC11 | MIT 라이선스·저작권·출처 고지가 배포와 설치 결과에 보존된다. | 수집 리비전의 LICENSE 원문 대조 |
| AC12 | lifecycle 미실행과 최신화 실패의 의미가 안내와 실제 결과에서 일치한다. | postinstall 성공·실패·스크립트 생략 및 이후 실제 설치 확인 |
| AC13 | 제거 시 내부 자료가 제거되고 기존 외부 자료는 보존된다. | 제거 fixture와 외부 자료 비교 |

정책 구조 검사와 파일 로딩 증거를 실제 에이전트의 모든 런타임 준수 증거로 확대 해석하지 않는다. 확인하지 못한 범위는 별도로 기록한다.

## 14. 검증 범위와 보류 조건

검증은 수집 fixture, 패키지 갱신, 설치 트랜잭션, 역할 참조를 연결해야 한다. npm 설치 자체를 성공시킨 결과와 실제 ARC 대상 설치 성공은 구분한다.

다음 상황에서는 관련 구현·수용을 보류하고 Orchestrator가 범위나 대응을 정리한다.

- upstream 구조가 현재 필수 자료와 호환되지 않음
- 패키지 내부 갱신 권한 또는 지원 환경이 필요한 게시 방식을 허용하지 않음
- 정적 manifest 보호를 넓게 해제해야만 구현할 수 있음
- 기존 외부 스킬을 건드리지 않고는 동작하지 않는 의존성이 발견됨
- 실패 복구 후 상태를 확정할 수 없거나 잔여 자료가 미보고됨
- 승인된 세 스킬 범위 밖의 자료·기능 변경이 필요함

최종 전체 검증에는 모든 구현 작업 수용 후 독립 Reviewer의 전체 변경 검토를 한 번 포함한다. 세부 작업별 수용 조건과 커밋 경계는 명세 승인 후 작성할 구현 계획에서 정한다.

## 자체 점검

- 승인된 저장 구조, 두 최신화 시점, 전역 스킬 독립 실행, 기존 외부 자료 보존을 모두 반영했습니다.
- 세 파일만 복사했을 때 발생하는 부속 자료 누락을 전체 트리 보존으로 해결했습니다.
- 라이선스와 스킬이 같은 upstream 커밋에서 오도록 수집 계약을 구체화했습니다.
- 동적 영역의 manifest 제외와 별도 검증을 구분했으며 정적 manifest 재생성을 우회 수단으로 허용하지 않았습니다.
- package postinstall의 양 플랫폼 복구와 `arc install --target all`의 기존 대상별 부분 성공을 구분했습니다.
- 직접 Git 수집은 이번 명세의 구현 선택입니다. 새로 명시되는 `git` 요구 사항과 기존 수집기 재사용 범위는 구현 계획에서 점검해야 합니다.
- upstream 라이선스는 Orchestrator가 원문에서 MIT 및 저작권 고지를 확인했습니다. upstream 전체 자료의 정확한 최신 구조는 수집 시 검증합니다.
- 남은 사용자 질문은 없습니다. 구현 세부 API와 작업 분할은 명세 승인 이후 계획 단계의 사항입니다.
