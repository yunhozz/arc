# QA UI 브라우저 수락 검증 보완 계획

> 실행은 Yunho Harness 순서에 따른다. Coder가 편집하고, CEO가 QA와 Reviewer를 순차 조정한다. 아래 계획 승인 전에는 구현을 시작하지 않는다.

**목표:** 배정된 UI 수락 기준을 QA가 승인된 테스트 환경에서 앱 실행 또는 기존 URL 접속과 브라우저 상호작용으로 확인하고, 기준별 관찰 근거를 보고하도록 역할 계약을 보완한다.

**설계:** 새 역할은 만들지 않는다. 공통 지침과 QA 프로필에 조건부 권한·전제조건·관찰 항목·정리 범위를 함께 명시한다. 기존 기준별 근거 보고와 Reviewer의 테스트 금지를 보존한다. UI 테스트와 CEO 소유 Visual companion 피드백을 구분한다.

**작업공간:** `/Users/ma-24-007/.codex/worktrees/qa-evidence-contract/yunho-harness` — 앞서 승인되어 연결된 managed worktree를 재사용한다. detached HEAD와 기존 변경을 보존하며 새 worktree나 설치 변경을 만들지 않는다.

**위험 및 흐름:** 공유 QA 행동 계약 변경이므로 significant/high-risk로 취급한다. **Coder → 독립 QA → 최종 전체 변경 Reviewer → CEO 수락** 순서다. QA 프로필의 정책 문구는 현재 실제 브라우저 실행 능력이나 런타임 준수를 입증하지 않는다.

## 범위와 파일 소유권

| 파일 | Coder 변경 |
|---|---|
| `tests/test_install.py` | UI 검증 조건·보고·정리·Visual companion 경계를 확인하는 집중 구조 계약 테스트 |
| `agents/yunho-team-qa.toml` | 조건부 앱 실행 및 브라우저 acceptance 검증 지침 |
| `skill/SKILL.md` | 공통 QA 실행 계약과 Visual companion 경계 한 문장 |
| `README.md` | 사용자용 한국어 요약 |
| `MANIFEST.sha256` | 위 배포 파일의 해시 동기화 |

Reviewer 프로필, 설치기, 모델 설정, 설치된 사용자 프로필, 실행 중인 에이전트 및 앱 환경은 변경하지 않는다. 이전 작업의 수정·미추적 spec/plan 파일은 건드리거나 되돌리지 않는다.

## 계약 수락 기준

1. UI 기준이 배정되고 brief에 작업공간, 기존 실행 명령 또는 URL, 필요한 계정·테스트 데이터 범위, 허용 상호작용이 제공된 경우에만 QA가 기존의 승인된 테스트 환경에서 앱을 띄우거나 URL을 열고 사용 가능한 승인 브라우저 도구로 확인한다.
2. 이 권한은 소스·문서·테스트·설정 편집, 의존성 설치, 환경 구성 변경을 허용하지 않는다. 전제조건이 부족하면 CEO에 보고하고 영향받는 기준을 미검증으로 둔다.
3. 각 기준에 실행 명령/URL, 테스트 상태와 viewport(해당 없으면 해당 없음), 상호작용 단계, 기대·관찰 결과, 접근 가능한 근거를 기록한다. 앱 기동·페이지 로딩·정적 검사만으로 UI 행동 전체를 입증하지 않는다.
4. 환경이나 브라우저 도구가 없으면 정확한 제한과 미검증 기준을 보고한다. QA가 만든 프로세스·세션만 정리하고 기존 공유 서비스·세션은 보존한다.
5. Visual companion의 디자인 논의와 QA의 UI 수락 검증은 분리한다. Reviewer의 QA 실행 금지와 기존 위험 흐름은 유지한다.

## 실행 단계

1. **RED:** Coder가 `tests/test_install.py`에 위 계약의 필수 조건을 QA 프로필, 공통 지침, README에서 확인하는 focused test를 먼저 추가한다. 해당 테스트만 실행하고, 새 계약 부재 때문에 실패하는지 확인한다. import/환경 실패는 RED로 간주하지 않는다.
2. **GREEN:** QA 프로필과 공통 지침에 동일 의미의 조건부 UI 실행 규칙을 추가한다. 브라우저 조작 시 사용 가능한 도구의 지침 및 적용 가능한 설치 browser skill을 따르게 한다. Visual companion 문단에 두 흐름의 구분을 넣고 README를 한국어로 갱신한다. 기존 증거 계약 및 Reviewer 제한은 유지한다.
3. 새 테스트와 관련 `RolePolicyTests`를 실행한 후, 이전 승인 범위의 전체 suite를 실행한다: `python3 -B -m unittest discover -s tests -v`. 성공 여부를 실제 출력으로 기록한다.
4. 두 역할 TOML을 `tomllib`으로 읽고, `git diff --check`, `shasum -a 256 -c MANIFEST.sha256`, `python3 install.py --check`를 실행한다. `install.py` 일반 설치는 실행하지 않는다. Manifest는 기존 파일 목록만 유지한다.
5. 독립 QA는 모든 계약 기준을 기준별로 보고한다. 구조 검사와 실제 브라우저 실행을 구분하고, 이 정책 수정 작업에서 앱/브라우저를 실행하지 않았다면 런타임 능력은 미검증으로 명시한다.
6. QA 이후 Reviewer가 이전 QA 근거 계약을 포함한 전체 최종 변경을 검토한다. 발견사항은 Coder 수정 후 QA 재확인으로 처리하고, 수정으로 무효화된 검토는 갱신한다. CEO가 잔여 미검증과 결과를 수락한다.

## 제약과 검증 한계

- 테스트는 정책 문구·구조의 존재를 확인하며 실제 에이전트의 브라우저 조작 능력이나 향후 수행을 입증하지 않는다.
- 특정 앱·계정·테스트 데이터는 이 작업 범위가 아니다. 테스트별 허용 데이터 변경은 해당 brief가 정한다.
- 기존 worktree의 변경을 덮어쓰거나 구현 변경에 포함시키지 않는다. 설치·commit·push·merge는 이번 계획에 포함하지 않는다.
