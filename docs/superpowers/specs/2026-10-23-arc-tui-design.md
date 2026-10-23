# ARC TUI 설치·관리 설계 스펙

날짜: 2026-10-23
상태: 2026-10-23 사용자 승인 완료. 구현 계획은 별도 승인 대상이다.

- 저장소: /Users/ma-24-007/Desktop/workspace/arc
- branch: feat/arc-tui
- 기준 HEAD: e5aba81cfbc64d13ca58190e1a3402e826c2e7a1
- 저장 경로: /Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/specs/2026-10-23-arc-tui-design.md

## 1. 목적과 승인 범위

arc를 실행하면 harness 설치와 관리를 시작하는 TUI 홈을 제공한다. 설치·재설정, preset 변경, workflow 관리, 제거, 업데이트에 화면에서 접근한다.

사용자 공개 문법은 다음 세 형태다.

```text
arc
arc --help
arc --version
```

승인된 초기 방향은 관리 홈, 작업별 안내 흐름, Codex·Claude 자동 workflow 연동 보존, completion command 제거와 관리 zsh 블록 정리다.

사용자는 이 스펙 전체와 다음 세부 동작을 승인했다: 설치 harness 내부 `runtime/cli.mjs` 자동화 entry, 고급 workflow mutation의 absolute JSON 파일 입력, 비TTY 즉시 오류·종료 코드 `2`와 `/dev/tty` 미재연결, global CLI 교체 후 결과 보고·현재 프로세스 종료, 영어 TUI 기본값. Harness 출력 language는 TUI 언어와 별개다.

추가로 `npm i -g`는 안내만 출력하고 TUI는 사용자가 `arc`를 실행할 때만 연다. 기존 staged release postinstall의 자동 TUI·harness 설치 동작은 제거한다. Release artifact는 안내 전용 postinstall hook을 유지할 수 있지만 이 hook은 TUI·네트워크·harness 변경을 시작하지 않는다.

## 2. 목표와 제외 범위

목표는 다음과 같다.

- 홈에서 target별 설치 상태와 가능한 작업을 파악한다.
- 설정·실제 대상 경로·변경 내용을 검토하고 수정한 뒤 적용한다.
- 명시적 실행 확인 전 다운로드·설치·설정 쓰기·npm 변경을 시작하지 않는다.
- 기존 경로·payload·snapshot 검증과 rollback·잔여 경로 보고를 보존한다.
- public arc workflow를 제거하면서 양 플랫폼의 자동 workflow 호출 의미를 유지한다.
- 기존 root 옵션의 검증·미리보기·전역 설정 선택 기능을 TUI로 옮긴다.
- 기존 shell 설정이 제거된 completion command를 계속 실행하지 않도록 이관한다.

다음은 제외한다.

- 웹 UI, 원격 관리 서버, daemon.
- Git·외부 작업을 TUI가 대신 실행하는 새 자동화.
- 역할 권한·승인·runtime 판정 규칙 변경.
- workflow state schema 변경과 no-plan 지원 확대.
- Windows·native 지원 플랫폼 확대.
- 패키지 게시·배포 실행.
- 전체 데이터 초기화 또는 두 target 전체의 원자적 rollback.

## 3. 현재 동작과 구현 방향

현재 무인자 실행도 target·preset·limits·language를 묻고 설치한다. 이번 변경은 기존 설치 선택기에 관리 탐색, 뒤로 가기, 적용 전 검토를 더하는 것이다.

현재 workflow는 JSON 기계 인터페이스이며 설치 지침에서 자동 호출한다. 사용자 메뉴로 옮기는 것만으로 기능을 보존할 수 없다.

검토한 접근은 다음과 같다.

| 접근 | 평가 |
|---|---|
| 관리 홈 + 작업별 안내 | 승인된 방향. 첫 설치와 반복 관리에 같은 진입점을 제공한다. |
| 설치 상태별 시작 화면 | 첫 설치 단계는 줄지만 환경마다 시작 동작이 달라진다. |
| 전체 화면 대시보드 | 상태 비교에는 유리하나 작은 터미널·복원·접근성 복잡도가 크다. |

기존 Node.js readline·raw terminal을 확장하고 입력·표시·작업 실행을 분리하는 방식을 추천한다. runtime 의존성을 추가하지 않으며, alternate screen과 전체 화면 삭제를 필수로 사용하지 않는 인라인 방식으로 결과 기록을 남긴다.

필요한 입력·붙여넣기·resize 안정성을 확보할 수 없다면 TUI 라이브러리 도입을 방법 변경으로 제안해야 한다. 구현 중 임의로 의존성을 추가하지 않는다.

## 4. 공개 명령과 비TTY 계약

| 호출 | 결과 |
|---|---|
| TTY의 arc | 관리 홈 |
| arc --help | 사용법·작업·TTY 조건 출력, 0 |
| arc --version | 패키지 버전 한 줄, 0 |
| 이전 command·옵션 또는 기타 인자 | 변경 없이 오류와 arc 안내, 2 |
| 비TTY의 무인자 arc | 즉시 안내 후 2 |

--help·--version은 각각 단독으로만 허용한다. 중복·조합·위치 인자는 거부한다.

install, preset, uninstall, workflow, upgrade, completion과 기존 root 설치 옵션의 forwarding을 제거한다. migration 안내는 제공하되 실행 호환 계층은 만들지 않는다. 숨은 arc 명령·옵션·환경변수로 제거한 실행 경로를 되살리지 않는다.

help·version은 native 모듈, 설치 상태, Git 저장소, 네트워크 없이 실행된다. npm public bin은 arc 하나를 유지한다.

비TTY에서는 다운로드·쓰기·입력 대기를 시작하지 않는다. `/dev/tty` 자동 재연결을 하지 않고 즉시 안내 후 종료 코드 `2`를 반환한다. 기존 비TTY 설치 스크립트는 호환되지 않는다.

Source package에는 npm lifecycle hook을 새로 등록하지 않는다. 기존 staged release artifact의 `postinstall: node scripts/postinstall.mjs`는 안내 전용으로 유지할 수 있다. `npm i -g`에서 대화형 터미널·CI 여부와 관계없이 `Run arc to install or manage the ARC harness.`를 출력하고 종료한다. Hook은 TUI를 열거나 `/dev/tty`에 연결하거나 네트워크·harness 변경을 시작하지 않는다. Harness 설치·관리는 사용자가 별도로 `arc`를 실행할 때 시작한다.

## 5. 공통 화면과 관리 홈

홈에는 패키지 버전, target별 실제 설치 경로·상태, 다음 메뉴를 표시한다.

1. Harness 설치·재설정
2. Preset 변경
3. Workflow
4. Harness 업데이트
5. Harness 제거
6. 종료

target 상태는 미설치, 설치됨, 부분 설치·설정 오류, 경로 접근·검증 불가를 구분한다. 한 target의 오류로 다른 target과 홈 전체를 숨기지 않는다. 오류를 미설치로 표시하거나 자동 수정하지 않는다.

현재 upgrade용 strict 상태 수집이 오류를 발생시키는 경우에도 홈은 target별 진단을 표시할 수 있어야 한다.

공통 조작 제안은 다음과 같다.

- ↑·↓: 선택 이동.
- Enter: 선택·확인.
- Esc: 이전 화면. 해당 작업의 적용 전 입력 유지.
- 홈의 종료 선택: 세션 종료.
- Ctrl+C: 중단 요청.
- 입력 중 EOF: 취소.

단계·사용 가능한 키를 표시하고 색상만으로 상태를 전달하지 않는다. 경로·외부 오류의 terminal 제어문자는 표시 시 escape한다.

화면이 필수 정보·확인 버튼을 표시할 수 없으면 적용을 막고 resize·종료를 안내한다. 정확한 최소 크기는 대표 화면을 기준으로 정한다.

정상 종료·취소·예외에서 raw mode, 입력 흐름, listener, timer를 복원한다. 실행 중 입력이 다음 화면의 실행 확인으로 전달되지 않는다.

제품 TUI의 기본 언어는 사용자 승인에 따라 영어다. 이 문서의 한국어 메뉴명은 기능 설명이며 실제 메뉴·안내 문구는 영어로 작성한다.

설치 `language`는 harness 출력 정책이며 TUI 표시 언어와 별개다. Harness language를 `ko`로 선택해도 TUI 문구는 영어를 유지한다. TUI 언어의 저장·자동 감지·런타임 전환은 범위에 포함하지 않는다.

## 6. 설치·재설정과 preset

### 설치·재설정

target → 설정 → 검토 → 적용 → 결과 순서다.

| 기존 기능 | TUI 대응 |
|---|---|
| --target | Codex·Claude·둘 모두 |
| --preset | Economy·Balanced·Smart |
| --language | English·한국어 |
| agent limit 옵션 | 전체·동시 수 입력 |
| --skip-global | 전역 지침·native 설정 적용 여부 |
| --check | 적용 가능성 검증 |
| --dry-run | 변경 상세 보기 |

기존 유효 설정을 초기값으로 사용한다. target별 값이 다르면 차이를 표시하고 공통값 적용을 명시적으로 선택하게 한다. 신규 기본값은 balanced, 전체 100, 동시 5와 기존 language 기본값 결정 정책을 따른다.

검토에는 target별 경로·설정·재설정 대상·전역 변경·외부 references 다운로드 필요성을 표시한다. 검토에서 수정 화면으로 돌아갈 수 있다.

검증·상세 보기는 쓰기·디렉터리나 임시 작업 공간 생성·외부 명령·네트워크 없이 수행한다. 외부 다운로드 성공까지 보장하는 검증으로 표현하지 않는다.

설치 적용 확인 후에만 acquisition과 설치를 시작한다. 검토 이후 대상이 바뀌면 snapshot 검증으로 거부하고 다시 검토하게 한다. 계획을 조용히 다시 만들어 적용하지 않는다.

전역 설정 적용을 꺼도 completion 이관은 별도 변경 항목으로 표시한다. 해당 쓰기는 명시적 적용 확인에 포함한다.

### Preset 변경

설치 target → preset → 변경 검토 → 적용 → 결과 순서다.

현재·선택 preset과 변경 파일을 표시한다. limits·language를 불필요하게 재설정하지 않는다. 미설치·잘못된 모델 설정이면 설치·재설정으로 안내한다.

변경이 없으면 변경 없음으로 성공 처리한다. 적용 후 새 세션 필요 안내를 유지한다.

## 7. 제거와 업데이트

### Harness 제거

target → 제거 검토 → 명시적 확인 → 결과 순서다. 기본 확인 선택은 취소다.

검토에는 harness·관리 agent 경로, 전역 지침 처리, completion 정리, 보존 항목을 표시한다.

기존 의미를 유지한다.

- ARC harness·관리 profile을 제거한다.
- 선택 시 ARC 전역 지침 블록을 제거한다.
- native concurrency·Codex wait 설정을 보존한다.
- 사용자 파일·다른 skill·workflow 감사 상태를 삭제하지 않는다.
- CLI npm 패키지는 제거하지 않는다.

부분 설치는 안전한 제거 계획을 만들 수 있으면 제거한다. unsafe path·검증 실패를 강제 진행하는 메뉴는 제공하지 않는다.

### 업데이트

기존 global·npx 구분과 설정 보존을 유지한다.

- 검증된 global 설치: CLI 패키지와 설치 harness 업데이트.
- npx: 현재 실행 패키지로 설치 harness 업데이트.
- 검증 불가 실행 출처: 차단 후 지원 경로 안내.
- harness 미설치: 설치 메뉴 안내.

홈에서 자동 최신 버전 조회를 하지 않는다. 네트워크 조회·npm 변경은 실행 확인 이후 시작한다.

검토에는 target·보존 설정·CLI 교체 여부를 표시한다. 기존 private child·state token 검증을 유지한다. CLI 교체와 harness 변경을 하나의 원자적 작업으로 표현하지 않는다.

global CLI 교체가 시작되면 같은 프로세스로 홈에 돌아가 추가 관리하지 않는다. 결과·복구 안내 후 종료한다. CLI만 갱신된 실패는 새 arc 또는 최신 npx TUI의 업데이트 메뉴에서 재시도하도록 안내한다.

## 8. 자동 workflow endpoint와 사용자 화면

### 8.1 내부 endpoint 배치 제안

추천 source는 새 lib/runtime/cli.mjs, 설치 위치는 다음과 같다.

```text
<resolved-target-home>/skills/arc/runtime/cli.mjs
```

호출 형태는 다음과 같다.

```text
node <absolute-entry> <command> --cwd <absolute-checkout> --workflow <id> [--input -]
```

사용자는 이 source·설치 위치와 호출 형태를 승인했다. 아래 대안 표는 선택 근거를 기록한다.

| 대안 | 특성 |
|---|---|
| 설치 harness runtime entry — 추천 | global CLI·npx cache와 독립적으로 harness와 같은 runtime 사용. 양 플랫폼 generated artifact·설치 지침 갱신 필요. |
| npm package의 private entry | 설치 중복은 줄지만 global 교체·npx 임시 경로·패키지 이동에 대한 경로 발견 계약 필요. |

추천안은 npm bin이나 숨은 public command를 추가하지 않는다.

현재 lib/cli/workflow.mjs의 imports는 package 배치를 전제로 한다. 이를 설치 runtime에 그대로 복사해서는 안 된다. parsing·dispatch를 runtime 내부 상대 imports로 닫히는 구조로 옮기거나 공통화해야 한다.

entry와 그 모든 import는 설치된 runtime/와 이미 설치되는 관리 artifact 안에서 해결되어야 한다. 저장소 lib/cli, package root, 개발 checkout, npm cache에 의존해서는 안 된다.

### 8.2 원본·생성물·설치 계약

기존 생성기는 lib/runtime/**/*.mjs와 role policy를 양 플랫폼 skill/runtime/로 복사하며 --check를 지원한다. installer는 플랫폼 skill/ 트리를 target의 skills/arc/로 매핑한다.

따라서 다음 연결을 하나의 계약으로 유지한다.

```text
lib/runtime 원본
→ Codex·Claude skill/runtime 생성물
→ payload manifest 검증
→ target skills/arc/runtime 설치물
→ 설치 지침의 실제 absolute entry 호출
```

생성기의 파일 복사와 cooperative runtime hash 목록은 별개다. 새 entry와 dispatch 변경을 복사하기만 해서는 충분하지 않다.

- 양 플랫폼 생성물은 원본과 일치해야 한다.
- 실행 의미를 가진 entry·dispatcher를 runtime hash/version 추적에 포함한다.
- MANIFEST.sha256와 필수 asset 목록에 source·양 플랫폼 entry 및 필요한 closure를 반영한다.
- release package에도 entry·모든 imports·정책 파일이 포함되어야 한다.
- 설치 디렉터리만 복사한 독립 환경에서 실행을 입증한다.

설치 지침은 resolver가 결정한 실제 absolute entry를 사용한다. shell로 호출해야 할 경우 경로를 올바르게 quoting하며 공백·따옴표·shell metacharacter가 들어간 경로를 검증한다. 구조화된 실행 도구에서는 argument 배열을 사용한다. 고정 home 경로나 shell 문자열 연결로 경로를 추정하지 않는다.

### 8.3 프로토콜 보존

다음 기존 계약을 유지한다.

- init, record, status, reconcile, prepare, result.
- absolute workspace·workflow ID 검증.
- mutation의 --input -, status의 무입력.
- JSON stdout과 기존 결과 필드.
- allow: 0, deny: 2, hold: 3, 입력·실행 오류 1.
- revision·중복 요청·actor·target·문서 hash·scope·approval·runtime drift 검증.
- secret 거부, 저장 경로·lock·경로 안전성.

내부 entry는 TTY 여부와 관계없이 JSON만 출력한다. TUI·progress 문구를 섞지 않는다. 기록·판정만 수행하고 Git·외부 작업을 대신 실행하지 않는다.

entry가 직접 호출 가능해도 기존 actor·승인·scope 검증을 건너뛰지 못한다. state schema는 유지한다. runtime hash 변경으로 기존 evidence가 보류되면 기존 reconciliation·재관찰 규칙을 따른다. 승인·evidence 자동 재유효화, revision 강제 덮어쓰기 기능을 추가하지 않는다.

### 8.4 사용자 Workflow 화면

workspace → workflow 선택·생성 → 상태·작업 순서다.

기본 workspace는 실행 cwd다. canonical repository root와 관찰한 Git 대상을 표시하고 확인한다. 다른 workspace는 경로 입력으로 선택하며 자동 저장소 탐색을 하지 않는다.

목록은 선택 저장소의 검증된 상태 경로에서 읽는다. 공유 Git common directory의 다른 checkout 대상이면 차이를 표시하고 현재 target에 대한 mutation을 막는다.

상태에는 workflow ID·revision·target·HEAD·판정·task 상태·unresolved·required evidence·next actions를 표시한다. 긴 내용은 페이지 또는 스크롤로 확인한다.

기존 기능을 다음 작업으로 제공한다.

- 상태 새로고침.
- 초기화.
- evidence 기록.
- 작업 준비 판정.
- 결과 기록.
- reconciliation.

초기화 기본값은 폼으로 입력한다. 임의 구조 mutation payload는 사용자 승인에 따라 absolute JSON 파일에서 읽어 가져온다. TUI는 파일을 작성하거나 외부 editor를 자동 실행하지 않는다.

제출 전 command·선택 workflow를 검토한다. expectedRevision을 조용히 바꾸지 않는다. secret·입력 오류에서 원문 payload를 출력하지 않는다. TUI는 기존 runtime 결과를 표시하며 판정을 바꾸지 않는다.

화면의 확인 클릭은 원래 사용자 승인 증거를 대신하지 않는다. hold를 승인·완료 성공으로 표시하지 않는다.

### 8.5 이관·호환 범위

새 public CLI는 구형 arc workflow를 실행하지 않는다. 양 플랫폼의 실제 handoff·planning 호출 지침을 새 entry로 함께 바꾼다.

구형 harness·이미 열린 에이전트 세션은 자동 호환되지 않는다. 업데이트와 새 세션 필요를 안내한다. target별 이관 결과를 표시하며 한쪽 성공을 양쪽 성공으로 표시하지 않는다.

다음 증거 없이 public workflow 제거를 수용할 수 없다.

1. source entry와 모든 imports의 설치 closure.
2. 양 플랫폼 generated parity.
3. runtime hash/version 추적 반영.
4. payload manifest·필수 asset·release package 포함.
5. 실제 설치 경로의 shell-safe 호출.
6. 기존 JSON·state·판정 계약 parity.
7. 설치 지침 호출 이관.

## 9. Completion 제거·정리

arc completion과 새 completion 등록을 제거한다. 기존 .zshrc에서는 다음 marker의 정상 ARC 관리 블록만 제거한다.

```text
# >>> arc completion >>>
# <<< arc completion <<<
```

정리는 명시적으로 적용한 설치·재설정, 업데이트, 제거에 포함하고 검토에서 경로·변경을 보여준다. 홈·help·version에서는 쓰지 않는다.

다중 target에서 공유 shell 파일의 소유자는 하나다. snapshot·transaction 검증을 적용한다. 블록이 없으면 변경하지 않는다. 중복·불완전·역순 marker, 잘못된 UTF-8, unsafe path는 영향을 받는 작업을 중단한다. 비관리 내용·줄바꿈을 보존한다.

npm으로 CLI만 교체하면 블록이 남을 수 있다. 첫 TUI 관리 작업에서 이관하도록 안내한다. npm hook으로 shell 파일을 조용히 수정하지 않는다.

## 10. 취소·오류·보안 계약

적용 전 취소는 변경·다운로드 없이 이전 화면이나 종료로 이동한다.

적용 중 SIGINT·SIGTERM·Ctrl+C는 AbortSignal로 전달한다. 정리가 끝나기 전에 완료·성공을 표시하지 않는다. SIGKILL의 정상 정리는 보장하지 않는다.

결과는 target별 완료·변경 없음·미시작·실패, rollback 결과, 정리 실패·잔여 경로, 새 세션·수동 복구 필요를 구분한다.

앞 target 성공 뒤 다음 target 실패를 전체 rollback 성공으로 표시하지 않는다. 자동 재시도하지 않는다. 재시도는 상태를 다시 읽고 검토·확인을 거친다.

| 상황 | 종료 코드 |
|---|---|
| 정상 탐색 종료·성공한 작업 | 0 |
| 실패·부분 성공 | 1 |
| public 입력·TTY·지원 환경 오류 | 2 |
| 사용자·signal 중단 | 130 |
| 마지막 workflow mutation의 deny·hold | 각각 2·3 |

실패 후 홈으로 돌아가도 마지막 실행 결과를 유지한다. 이후 성공한 실행 작업이 이를 대체하며 화면 이동만으로 성공으로 바뀌지 않는다.

Node.js >=22, 기존 native 지원 tuple, safe-fs·payload·snapshot·충돌 검증을 유지한다. unsafe path를 일반 파일 API·shell로 우회하지 않는다. 표시 문자열과 실행 인자를 분리한다.

## 11. 영향 표면과 의존성

| 표면 | 변화 |
|---|---|
| bin/arc.mjs, lib/cli/root.mjs | public 문법 제한·TUI 진입 |
| index·choices·progress 및 신규 TUI 모듈 | 입력·화면·실행 분리, 검토·뒤로 가기·결과 |
| preset·uninstall·upgrade CLI | public parser 제거·작업 기능 연결 |
| lib/runtime | 내부 entry·공통 dispatch·설치 closure·hash 추적 |
| scripts/update-runtime-assets.mjs, 양 플랫폼 runtime | 생성 parity·정책 포함 |
| 양 플랫폼 handoff·planning 등 실제 호출부 | absolute 내부 entry로 이관 |
| installer plan·install·preset·uninstall·upgrade·upgrade-state | preview·상태·실행·completion 이관 |
| completion 관련 CLI·installer | 등록 제거·기존 블록 정리 |
| scripts/update-manifest.mjs, MANIFEST.sha256, installer manifest | hash·필수 closure 검증 |
| package·lock·release artifact 검증 | public bin·배포 포함·소비 가능성 |
| README·운영·설치 후 안내 | TUI·비TTY·workflow·shell 이관·복구 |
| CLI·PTY·runtime·installer·completion·package 테스트 | 새 계약·안전성·migration |

runtime source·generated artifact·지침·manifest는 연결된 계약이다. public parser만 먼저 제거한 상태를 기능 완료로 수용하지 않는다. task·commit 단위와 실행 순서는 스펙 승인 뒤 계획에서 정한다.

## 12. 수용 기준

| ID | 조건 |
|---|---|
| C1 | TTY 무인자 실행은 관리 홈이며 확인 전 다운로드·설치가 없다. 검토·수정·뒤로 가기가 가능하다. |
| C2 | 설치·재설정, preset, 기존 workflow 작업 전체, 제거, 업데이트가 TUI에서 접근 가능하다. |
| C3 | public 문법은 세 형태뿐이다. 이전 인자는 변경 없이 2이며 숨은 우회 command가 없다. |
| C4 | Codex·Claude 자동 workflow가 승인된 내부 endpoint에서 기존 JSON·판정·state 계약을 유지한다. |
| C5 | 검증·preview는 쓰기·임시 디렉터리·외부 명령·네트워크 없이 동작한다. |
| C6 | 비TTY 즉시 종료와 native 없는 help·version이 보장된다. |
| C7 | 취소·예외 후 terminal·listener·timer를 복원하고 실제 정리 결과를 보고한다. |
| C8 | 다중 target 부분 성공·rollback·잔여 경로를 정확히 표시한다. |
| C9 | global·npx 업데이트·설정 보존·state token을 유지하고 CLI 교체 후 구 프로세스로 추가 관리하지 않는다. |
| C10 | completion 신규 등록이 없고 정상 관리 블록만 안전하게 제거한다. |
| C11 | 설치된 entry와 모든 imports가 package·checkout·cache 밖의 독립 설치 환경에서 실행된다. |
| C12 | 원본·양 플랫폼 생성물·runtime hash/version·manifest·required asset·release package가 일치한다. |
| C13 | resolver가 결정한 실제 경로를 안전한 인자로 호출하며 공백·따옴표·metacharacter 경로를 검증한다. |
| C14 | 기존 승인·actor·revision·secret·target/runtime drift 검증을 우회하지 않는다. |
| C15 | 양 플랫폼 지침·문서·오류·복구 안내가 제거된 public command에 의존하지 않는다. |

## 13. 검증 요구와 보류 조건

구현 후 필요한 검증은 다음과 같다.

- 실제 PTY: 이동·수정·취소·EOF·resize·붙여넣기·terminal 복원.
- 명령 계약: 비TTY·help·version·이전 인자 거부·무부작용.
- 설치 관리: preview·snapshot drift·다중 target·rollback·cleanup.
- 업데이트: global·npx·CLI만 갱신된 실패·private child·state token.
- workflow: 기존 fixture를 새 entry로 실행한 JSON·종료 코드·state parity.
- 설치 closure: 저장소·package 경로 접근 없이 양 플랫폼 설치물에서 실행.
- 경로 안전성: 실제 target home의 공백·따옴표·metacharacter.
- TUI mutation: 공통 runtime 판정·stale revision·secret 출력 방지.
- 생성물: runtime --check, cooperative hash/version 변경 감지, 양 플랫폼 parity.
- payload·package: entry·imports·정책·필수 파일·hash·release 소비 검증.
- completion: 정상·부재·중복·손상·줄바꿈·다중 target.
- 최종 전체 변경의 단일 독립 Reviewer 검토와 필요한 finding 재검토. per-task Reviewer gate로 사용하지 않는다.

보류 조건은 다음과 같다.

1. 스펙 승인은 완료됐다. 구현은 별도 구현 계획 승인과 실행 준비·handoff gate 완료 후 시작한다.
2. 승인된 endpoint·JSON 파일 입력·영어 TUI·비TTY·postinstall 동작을 변경하려면 관련 설계를 갱신하고 필요한 승인을 받는다.
3. workspace·branch·HEAD·소유권이 brief와 달라지면 대상 증거를 재확인한다.
4. 설치 closure·generated parity·hash 추적·manifest·release 검증·shell-safe 호출 중 하나라도 빠지면 자동 연동 보존을 수용하지 않는다.
5. 기존 runtime hash 변화로 보류된 state를 자동 재유효화하지 않는다.
6. 구형 harness·열린 세션의 무중단 호환 요구가 추가되면 호환 설계를 다시 결정한다.
7. 완료 보고와 passing check는 Orchestrator 수용을 대체하지 않는다.

## 자체 검토와 승인된 결정

기존 옵션의 TUI 대응, 비TTY 중단, 업데이트 비원자성, workflow 권한 보존, completion 이관을 확인했다.

설치 closure, generated parity, runtime hash/version, payload manifest, release package, 실제 경로 호출을 하나의 필수 계약으로 유지했다. 현재 `lib/cli/workflow.mjs`는 package-relative imports를 사용하므로 설치 runtime에 그대로 복사할 수 없다.

사용자가 승인한 세부 결정은 다음과 같다.

- `lib/runtime/cli.mjs`를 양 플랫폼에 생성·설치하여 자동 workflow 호출에 사용한다.
- 고급 workflow mutation은 absolute JSON 파일에서 입력한다.
- 비TTY `arc`는 `/dev/tty` 재연결 없이 즉시 `2`로 종료한다.
- Global CLI 교체가 시작된 세션은 결과 보고 후 종료한다.
- 제품 TUI는 영어를 기본으로 사용하며 harness language와 분리한다.
- `npm i -g`는 안내만 출력한다. Staged release의 postinstall hook은 안내 전용이며 자동 TUI·네트워크·harness 변경을 수행하지 않는다.

이 스펙은 2026-10-23 사용자 승인을 받았다. 구현 계획과 실제 구현의 승인을 대신하지 않는다.

## 근거와 확인 한계

- public routing: lib/cli/root.mjs:5
- 현재 설치 흐름: lib/cli/index.mjs:20
- 입력 복원: lib/cli/choices.mjs:9
- 설치 payload 매핑: lib/installer/plan.mjs:26
- snapshot·계획 검증: lib/installer/plan.mjs:51
- 부분 실패: lib/installer/install.mjs:15
- 제거 의미: lib/installer/uninstall.mjs:6
- global·npx 업데이트: lib/cli/upgrade.mjs:25
- 현재 workflow package-relative imports: lib/cli/workflow.mjs:1
- JSON 계약: lib/cli/workflow.mjs:6
- runtime hash 목록: lib/runtime/bootstrap.mjs:7
- target·저장 경로 검증: lib/runtime/scope.mjs:19
- 자동 호출 지침: codex/skill/references/handoff.md:244, claude/skill/references/handoff.md:180
- runtime 생성·check 계약: scripts/update-runtime-assets.mjs:12, tests/node/runtime-assets.test.mjs:7
- runtime version 검증 표면: tests/node/runtime-versions.test.mjs:6
- manifest 생성·필수 asset: scripts/update-manifest.mjs:11, lib/installer/manifest.mjs:26
- package 포함·release 검증: package.json:27, lib/release/artifact.mjs:98
- completion 관리 블록: lib/installer/shell-completion.mjs:4
- 기존 workflow 실행 계약: tests/node/runtime-cli.test.mjs:16
- 비TTY·help/version: tests/node/cli.test.mjs:10

생성기·release 검증의 추가 근거는 Orchestrator가 전달한 Scouter의 정적 확인 결과를 사용했다. 현재 `lib/runtime/cli.mjs`와 설치 runtime entry는 없다. 문서의 endpoint는 승인된 신규 artifact이며 아직 구현되지 않았다.

기존 정적 불일치: package.json:3은 0.1.10, tests/node/package.test.mjs:15는 0.1.8을 기대한다. 실제 테스트를 실행하지 않았으며 이번 기능 수용 범위로 확대하지 않는다.
