# 외부 스킬 사전 요구 및 호환성 검사 설계

## 목적

저장소의 `dependencies/` 번들을 제거하고, 설치 전에 ARC가 직접 요구하는 외부 스킬이 설치되어 있으며 검토된 파일 snapshot과 일치하는지 확인한다. 설치기는 외부 스킬을 내려받거나 설치·복사·수정하지 않는다. 필수 스킬의 존재와 호환성이 확인되지 않으면 ARC 설치 대상에 쓰기 작업을 시작하기 전에 종료한다.

이 변경은 설치 패키지와 installer 동작을 바꾸는 architectural 작업이다. 이 설계의 서면 승인을 받은 뒤 구현 계획을 작성하며, 계획 승인 후 구현한다.

## 범위

| 경로 | 변경 |
|---|---|
| `dependencies/` | 번들 전체 제거 |
| `install.py` | dependency 번들 처리 제거, 외부 스킬 사전 검사 추가 |
| `external-skills.toml` | 승인된 외부 스킬 snapshot 계약 추가 |
| `README.md` | 선행 설치, 검사, 오류 및 snapshot 유지보수 안내 |
| `MANIFEST.sha256` | 번들 항목 제거, lock 파일과 변경 payload 반영 |

기존 Python 3.11 요구, 모델 설정 검증, 일곱 프로필 생성, 설치 대상 경로 안전성, ARC·프로필의 backup·staging·교체·rollback, 읽기 전용 `--check`·`--dry-run`, 수동 활성화와 현재 ARC 실행 정책은 유지한다. 이미 설치된 외부 스킬 및 과거 brief·spec·plan은 이 변경으로 삭제하거나 수정하지 않는다.

## 필수 외부 스킬

현재 ARC가 직접 사용을 요구하는 다음 네 스킬을 일반 설치의 선행 조건으로 둔다.

```text
brainstorming
writing-plans
test-driven-development
using-git-worktrees
```

필수 목록은 installer와 lock 계약에서 동일하게 고정한다. executor 관련 요청은 현재 ARC 정책이 처리하므로 추가 executor 스킬을 설치 전제에 넣지 않는다. 작업별 조건부 스킬은 기존 missing non-executor skill 정책에 따라 해당 작업에서 다룬다.

## 검색 위치 및 후보 처리

각 스킬은 다음 경로에서만 찾는다.

```text
<selected CODEX_HOME>/skills/<skill-name>
<actual user home>/.agents/skills/<skill-name>
```

`CODEX_HOME`이 설정되지 않으면 선택된 Codex home은 실제 사용자 home의 `.codex`다. 빈 `CODEX_HOME`은 기존 동작과 같이 오류다. `.agents/skills` 경로는 `CODEX_HOME`과 독립적이다.

- 두 후보가 없으면 해당 스킬 누락으로 실패한다.
- 존재하는 후보는 모두 검증한다. 하나가 승인 snapshot과 일치해도 다른 후보가 미확인 상태면 실패한다.
- 두 원래 후보 경로가 같은 실제 디렉터리로 해석되면 한 번만 검증한다.
- 실제 디렉터리가 다르면 각각 검증한다. 모든 고유 후보가 승인된 snapshot 중 하나와 일치해야 통과한다.
- 검색 순서를 runtime 우선순위로 설명하지 않는다. plugin cache, 프로젝트별 위치, 임의 재귀 검색은 지원하지 않는다.

## 외부 파일 접근 및 안전성

외부 skill은 읽기 전용 입력이다. 후보 root 자체 또는 상위 경로의 symlink는 strict resolution으로 실제 디렉터리에 해석할 수 있다. Resolution 실패, dangling link, cycle 또는 디렉터리가 아닌 root는 오류다.

Lock이 지정하는 필수 상대 파일은 실제 skill root 안에서 해석되어야 한다. 필수 경로 요소의 symlink는 최종 해석 경로가 실제 root 내부에 있고 일반 파일로 읽을 수 있을 때 허용한다. root 밖으로 나가는 참조, 특수 파일, 순회 또는 읽기 실패는 오류다. 이 검사는 고정된 필수 파일만 읽으며 skill 전체를 재귀 탐색하지 않는다. 기존 ARC·프로필 쓰기 대상의 symlink 금지 정책은 완화하지 않는다.

## 호환성 lock 및 snapshot

`external-skills.toml`은 변경 불가 installer payload이며 `MANIFEST.sha256`로 무결성을 확인한 뒤 Python 3.11 표준 라이브러리 `tomllib`으로 파싱한다. 계약은 다음 구조를 갖는다.

- 최상위 `version = 1`
- 최상위 키는 `version`, `snapshots`만 허용
- `snapshots`는 `[[snapshots]]` TOML table 배열이며 항목마다 `skill`, `id`, `[snapshots.files]` mapping을 둔다
- snapshot 항목 키는 `skill`, `id`, `files`만 허용
- 네 필수 스킬 각각 하나 이상의 snapshot
- 각 snapshot은 그 스킬의 지정 필수 파일 집합과 정확히 같은 경로 집합
- skill 이름은 필수 네 이름 중 하나이며, 같은 skill 안에서 snapshot ID는 중복될 수 없다
- 허용 schema 외 필드, 중복 ID, 잘못된 유형 또는 빈 snapshot은 오류

경로는 비어 있지 않은 상대 POSIX 경로여야 한다. 절대 경로, `./`, `..`, backslash 또는 정규화로 바뀌는 경로는 거부한다. digest는 64자리 hexadecimal SHA-256이다. hash는 파일 raw bytes에 적용하며 줄바꿈·공백·인코딩을 정규화하지 않는다.

각 후보의 모든 필수 파일은 하나의 동일한 snapshot과 일치해야 한다. 서로 다른 snapshot에서 일부 파일씩 가져와 통과시키지 않는다. 필수 목록 밖의 추가 파일은 비교 대상이 아니며 자체로 실패 사유가 아니다. Snapshot 불일치는 의미상 비호환의 증명이 아니라 “호환성이 확인되지 않음”으로 안내한다.

최초 snapshot ID는 `local-reviewed-2026-10-04`이며, 해당 파일은 2026-10-04에 이 PC의 `~/.agents/skills`에서 읽고 ARC adapter와의 문서 호환성을 검토했다. 이는 upstream release나 작성자를 인증하지 않으며, 선택적 companion runtime의 실행 검증을 의미하지 않는다. 초기 고정 파일과 SHA-256은 다음과 같다.

| 스킬 | 상대 경로 | SHA-256 |
|---|---|---|
| `brainstorming` | `SKILL.md` | `a32d2255354775aa124855aa7100cf276bea096fff4ebb3a0edf57be216e6c72` |
| `brainstorming` | `visual-companion.md` | `6ffcb038b53254bd31debaa15e12dcd4ff24bd63d690e0b644ac6396701cf2e2` |
| `brainstorming` | `scripts/start-server.sh` | `a4e5ae84275bcaacd2f84345afeabe59cf7b00ba080e123da7cc1fb226f12847` |
| `brainstorming` | `scripts/stop-server.sh` | `0b5ccbbd57f62d3ed88993f7940b5ee0e5c0fc9b21c550c623da4f6292e47daf` |
| `brainstorming` | `scripts/server.cjs` | `2d2961ea8d11f56c5f4c3a1a68d22709efa5d7601a2246d8c880774e7e9e8412` |
| `brainstorming` | `scripts/helper.js` | `43c6d69954a46ec34a2a262bcc62a9a7e83e839c739f199cb72646d397c686e3` |
| `brainstorming` | `scripts/frame-template.html` | `6a8a4e58bd6a44b904e2e3c57de774481d909204597e1498de53f1b2fecc4c4e` |
| `writing-plans` | `SKILL.md` | `0bc3d36590f7b2c323ed3ec18ff77e9f8ed57af42f5680a02b11a2d20de265cf` |
| `test-driven-development` | `SKILL.md` | `64b03fce4aee5a97a93160cea8111f3ba13a17b7c001db4bd5836d67fd10705d` |
| `test-driven-development` | `writing-good-tests.md` | `51471c853306ff92ca8bb41dcaea05f31c0e46b03651f8f3c99754b7172f4ae1` |
| `using-git-worktrees` | `SKILL.md` | `8cfb86f121269e8f7f12361e6795c4f6738828340e28964c9229d365666c9edd` |

이 기준은 검토한 snapshot을 고정한다. 새 snapshot은 파일 변경을 검토하고 현재 ARC 정책과의 호환성을 판단한 뒤 명시적으로 추가한다. 설치 중 현재 값을 자동 승인하지 않는다.

## 공통 사전 검사와 실패 동작

일반 설치, `--check`, `--dry-run`은 동일한 사전 검사를 적용한다. 기존 manifest·payload·모델 설정·프로필 및 설치 대상 검사에 더해 lock을 파싱하고 네 필수 스킬의 모든 후보를 검증한다. 이 검사가 통과하기 전에는 디렉터리 생성, backup, staging 또는 설치 파일 변경을 시작하지 않는다.

오류에는 스킬명, 후보 절대 경로, 다른 경우 실제 경로, 오류 범주와 실패 파일 경로를 표시한다. 외부 파일 내용은 출력하지 않는다. 가능한 경우 필수 스킬 오류를 모아 보고한다. Lock·manifest 손상으로 안전하게 비교할 수 없으면 해당 오류에서 종료한다. 기존 parser 동작은 유지하며 성공은 종료 코드 `0`, installer 오류는 기존과 같이 `2`다.

누락, 잘못된 경로·항목 유형, symlink resolution 실패, root 외부 참조, 읽기 실패, snapshot mismatch 및 lock·manifest 오류는 설치 쓰기 전에 실패한다. 자동 설치·fallback 복사·우회 flag·경고만 내고 진행하는 경로는 제공하지 않는다.

## 설치 transaction과 문서

`dependencies/` 검증, 열거, 누락분 설치 계획, staging, 복사·교체 및 dependency 전용 rollback을 제거한다. 일반 설치는 기존 ARC skill과 일곱 프로필만 설치하며 기존 backup·rollback 동작을 유지한다. 외부 스킬은 backup, staging, 복사, 교체, 삭제, 권한 변경 또는 rollback 대상이 아니다. 사전 검사 이후 다른 프로세스가 외부 파일을 바꾸는 경우까지 막지는 않는다.

README는 필수 스킬 네 개, 검색 위치, 모든 후보를 검사한다는 규칙, 11개 필수 파일 snapshot, 추가 파일의 처리, symlink 정책, 세 실행 옵션의 공통 검사, 실패 전 무변경, lock 갱신 절차와 검사의 한계를 설명한다. 번들 설치·보존 설명은 외부 선행 조건 설명으로 교체한다. Manifest에서는 `dependencies/`를 required root 및 payload 목록에서 빼고 `external-skills.toml`과 변경된 installer·README의 digest를 기록한다. `skill/models.toml`의 mutable 예외는 유지한다.

## 한계

이 검사는 필수 외부 파일이 검색 위치에서 읽히고 검토된 snapshot과 일치하는지 확인한다. upstream 출처, 모든 runtime 동작, snapshot 밖 추가 파일, 모든 가능한 Codex 검색 위치 및 우선순위, 선택적 Node.js·Bash companion 실행 환경, 모델의 원격 접근성, 검사 이후 파일 불변성은 보장하지 않는다.

## 수락 기준

1. `dependencies/`가 제거되고 installer는 이를 요구하거나 복사하지 않는다.
2. Installer와 lock이 동일한 네 필수 스킬 및 스킬별 11개 지정 파일을 사용한다.
3. 각 실행 옵션은 승인 snapshot을 검사하고, 잘못된 schema·누락·읽기 실패·mismatch를 설치 전에 거부한다.
4. 모든 존재 후보가 검증되며, 승인되지 않은 중복 후보가 있으면 실패한다.
5. 같은 실제 root의 alias는 중복 검사하지 않고, 허용된 내부 파일 alias는 실제 root 경계 안에서만 읽는다.
6. 서로 다른 snapshot의 혼합은 통과하지 않으며, 필수 목록 밖의 추가 파일은 판정에 영향을 주지 않는다.
7. 외부 검사 실패 시 ARC·프로필·외부 스킬이 변경되지 않고 새 디렉터리, backup 또는 staging이 생성되지 않는다.
8. `--check`와 `--dry-run`은 성공해도 파일을 생성하거나 수정하지 않는다.
9. 정상 설치는 ARC와 일곱 프로필만 설치하고 기존 backup·rollback을 유지한다.
10. README와 manifest의 설명 및 포함 범위가 구현과 일치한다.
11. 현재 ARC 정책 및 실행 흐름은 변경되지 않는다.

## 자체 검토

- **범위:** 외부 스킬의 선행 조건과 호환성 사전 검사에 한정했다. 외부 스킬 설치, 갱신기, 새로운 검색 경로 또는 우회 기능은 포함하지 않는다.
- **정확성:** 이름만으로 통과하지 않고, 필수 참조 파일 전체가 하나의 snapshot과 일치하도록 했다.
- **안전성:** 모든 검색 후보를 확인하고 읽기·경로 문제를 누락으로 취급하지 않는다. 실패는 설치 쓰기보다 앞선다.
- **호환성:** 현재 ARC adapter를 기준으로 snapshot 문서를 검토했으며 hash 일치가 runtime 검증은 아님을 분리했다.
- **유지보수:** 검토 없이 현재 hash를 자동 승인하지 않으며 lock과 manifest를 함께 갱신한다.
- **미결 결정:** 설계 단계의 미결 사항은 없다. 구현 계획에는 test-first 확인, 오류 사례, manifest 갱신과 risk-scaled QA·독립 review를 포함한다.
- **현재 상태:** 이 설계 문서 외에는 아직 payload, 설치 환경 또는 테스트를 수정하지 않았다.
