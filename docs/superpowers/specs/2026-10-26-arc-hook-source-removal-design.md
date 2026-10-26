# ARC hook 소스 제거 설계 명세

상태: 사용자 승인 완료  
설계 깊이: Architectural  
문서 대상: /Users/yunho/.codex/worktrees/codex-observer-hook-merge/arc/docs/superpowers/specs/2026-10-26-arc-hook-source-removal-design.md

## 목적

Codex·Claude에서 ARC hook을 설치·갱신·삭제하는 기능과 hook 전용 소스를 제거한다. 범위에는 두 플랫폼의 global observer 세 이벤트와 Claude 역할 프로필의 Bash Git guard가 모두 포함된다.

hook 기능이 없어도 일반 설치·업데이트·제거, 모델·프로필 생성, concurrency·wait 설정, 역할 정책과 cooperative runtime은 정상적으로 동작해야 한다.

이미 사용자 native 설정에 기록된 hook은 이번 변경으로 정리하지 않는다. 이 소스 제거만으로 현재 사용자 설정의 hook 참조가 없어지는 것은 아니다.

## 승인된 범위와 실행 대상

사용자는 다음 범위를 명시적으로 확정했다.

- Codex·Claude global observer의 등록·갱신·제거 소스 삭제.
- Claude per-role Bash Git guard의 설치·검증·전용 자산 삭제.
- 사용처가 사라진 hook 전용 진입점과 관련 생성·검사 경로 정리.
- 일반 cooperative/runtime gate API와 hook에 무관한 설정·프로필 기능 보존.

실행 대상은 Orchestrator가 준비 증거로 제공했다.

| 항목 | 값 |
|---|---|
| 저장소 | /Users/yunho/.codex/worktrees/codex-observer-hook-merge/arc |
| branch | fix/codex-observer-hook-merge |
| HEAD/base | 0ebb4077a9fe10f33658adf0aba80b465aa6e039 |
| 변경 상태 | clean |
| 이전 미승인 계획 | 사용자 승인으로 삭제 완료 |

이전 observer 호환 설계와 계획은 폐기되었으며 이번 구현의 근거로 사용하지 않는다. 이 명세 승인 후 별도 구현 계획을 작성한다.

## 현재 문제와 변경 이유

현재 `lib/installer/global-config.mjs:46-56`은 Codex ARC observer 마커 내부에 정확히 세 이벤트만 존재한다고 가정한다. Codex가 같은 마커 내부에 `hooks.state` trust metadata를 기록하면 이 검사에 실패한다. 설치 계획은 이를 `Cannot merge Planner observation hooks` 오류로 보고한다.

사용자는 호환 병합을 추가하는 대신 hook 설치·삭제 기능 전체 제거를 선택했다. 따라서 새 설계는 `hooks.state`를 분리·이동하거나 기존 observer를 재생성하지 않는다. 설치기는 해당 hook 데이터에 대한 소유권 판정과 수정 자체를 수행하지 않는다.

Claude에는 global observer와 별도로 Bash Git guard가 있다. `lib/installer/plan.mjs:23`이 역할 프로필에 guard를 설치하고, 프로필 validator와 정책 generator도 해당 hook을 요구한다. global observer만 제거하면 사용자 요청이 충족되지 않으므로 이 경로도 함께 제거한다.

## 목표와 제외 범위

### 목표

- 신규 설치·재설치·업데이트에서 ARC hook을 생성하거나 갱신하지 않는다.
- 제거 과정에서 native hook 설정을 검사하거나 정리하지 않는다.
- 배포 프로필·패키지에 hook 전용 코드나 자산을 요구하지 않는다.
- 정책 generator와 validator가 hook 없는 역할 프로필을 정상 처리한다.
- hook 전용 관찰 기록 경로를 제거한다.
- 공유 runtime과 역할 규칙의 의미를 보존한다.
- 검사·문서·생성물·보호 manifest가 최종 기능과 일치한다.

### 제외 범위

- 실제 `~/.codex/config.toml`이나 Claude native settings 수정.
- 기존 hook 기록·trust metadata·관찰 로그 자동 삭제.
- 전역 설정 migration, cleanup 명령 또는 opt-in 옵션 신설.
- 새 hook·daemon·자동 실행 장치로 기존 기능 대체.
- 일반 Git 판정·역할 제한·승인·workflow 검증 약화.
- 기존 workflow의 version/hash 검증 우회.
- 전체 테스트 스위트 실행, push·merge·배포.

## 설치·업데이트·제거 동작

### Codex·Claude global observer

다음 동작과 전용 소스를 제거한다.

- `renderRuntimeObserverHooks`
- `removeRuntimeObserverHooks`
- observer 전용 마커·이벤트 상수
- observer command 생성·식별
- 설치 계획의 observer 병합 호출·오류·설명
- 제거 계획의 native observer 검색·제거
- 해당 기능만을 위한 import와 내부 helper

설치·업데이트는 observer 유무를 기준으로 분기하지 않는다. 기존 observer를 유지하기 위한 재등록이나 호환 병합도 하지 않는다.

제거는 native observer를 제거하지 않는다. 설치 관리 대상인 skill·역할 프로필 등 일반 자산의 제거는 기존 동작을 유지한다.

native 설정은 일반 설정 처리에 필요한 범위에서만 읽고 수정한다. 유효한 `hooks`·`hooks.state`를 알 수 없는 설정으로 보존하며, ARC 마커의 내용이나 구조를 별도로 검증하지 않는다. TOML·JSON 자체가 잘못된 경우의 일반 설정 오류는 유지한다.

### 일반 설정 처리

다음 기능은 유지한다.

- AGENTS·지침 관리 블록
- 언어 정책
- concurrency 설정과 drift 검사
- Codex wait 설정
- 일반 snapshot·transaction·rollback
- 모델·프리셋·역할 프로필 관리
- 사용자 설정과 무관한 hook 보존

`global-config.mjs`나 `plan.mjs` 전체를 삭제하지 않는다. observer 호출 제거 후에도 concurrency renderer의 결과와 notes가 정상적으로 전달되어야 한다.

## Claude 프로필과 Git guard

다음 hook 기능을 제거한다.

- `installClaudeHook`과 source hook 렌더링.
- hook command template·encoding·validation.
- ARC 역할 프로필의 관리 hook frontmatter.
- 관리 Git guard의 존재·형식·개수를 요구하는 프로필 검사.
- 설치 시 hook 자산을 요구하는 payload 검사.
- hook만을 위해 존재하는 helper·export·검사.

삭제 대상 전용 자산은 다음과 같다.

- `claude/skill/hooks/role-git-guard.mjs`
- `claude/skill/hooks/git-policy.json`
- `lib/policy/claude-hook.mjs`

삭제 전에 전체 import·generator·test 참조를 정리하여 dangling import를 남기지 않는다.

일반 프로필 frontmatter 파싱, 모델·도구 설정, 역할 설명, 관리 정책 블록 검증은 유지한다. 외부 프로필의 알 수 없는 hook 필드를 무조건 삭제하거나 프로필 전체를 거부하는 새 정책은 추가하지 않는다. ARC가 생성하는 역할 프로필에는 hook을 넣지 않는다.

이 변경 후 Claude Bash Git guard를 통한 실행 차단은 제공되지 않는다. Specialist의 Git 제한과 Orchestrator 권한 등 역할 계약은 그대로 유지한다.

## Runtime 경계

### 제거할 전용 코드

다음 stdin hook 진입점을 삭제한다.

- `codex/skill/hooks/runtime-gate.mjs`
- `claude/skill/hooks/runtime-gate.mjs`

wrapper 내부의 `main`·`runHook`, `--observe-only` 분기와 hook 응답 formatting 경로는 이 진입점과 함께 제거한다.

`lib/runtime/cooperative.mjs:188`의 `recordPlannerHookObservation`과 해당 경로만 사용하는 `observeHookTarget` 등 내부 helper를 제거한다. 이 API는 인증되지 않은 hook event를 별도 audit로 기록하는 전용 경로이며 일반 cooperative stage·assignment API와 구분된다.

기존 `.git/arc/planner-observations` 데이터는 삭제·이동하지 않는다.

### 보존할 공유 코드

다음과 같은 공유 기능은 유지한다.

- `runCodexGate`·`runClaudeGate` 등 일반 gate API.
- decision renderer와 trusted context 검증.
- cooperative workflow·Planner ledger·assignment·approval·acceptance.
- Git command 분류와 `validateGitPolicy`.
- 상태 schema·durable store·target 관찰·scope 검증.
- native integration이 없다는 기존 coverage 한계.

현재 `role-git-guard.mjs`는 `validateGitPolicy`와 `classifyGitCommand`를 공유 runtime에서 재수출한다. guard 파일 삭제 후에도 필요한 소비자는 canonical 공유 모듈을 직접 참조하도록 한다. hook wrapper 삭제를 이유로 공유 Git 판정 기능을 삭제하지 않는다.

문서와 검사는 일반 gate API의 합성 검증과 실제 host enforcement를 구분해야 한다.

## 정책과 생성물

`lib/policy/render.mjs`와 관련 generator는 다음과 같이 변경한다.

- 삭제한 hook 모듈과 guard 자산의 import를 제거한다.
- Git policy 검증은 canonical 공유 `lib/runtime/git-query.mjs`를 사용한다.
- `POLICY_TARGETS`에서 hook 전용 `git-policy.json` 산출물을 제거한다.
- Claude 역할 프로필에 hook을 삽입하는 생성 단계를 제거한다.
- hook을 실행 제어 수단으로 표시하는 현재 정책 metadata를 실제 제공 기능에 맞게 수정한다.
- 생성 정책 블록은 canonical 정책에서 다시 생성한다. 생성된 문서만 수동으로 수정해 drift를 남기지 않는다.

역할의 Git 금지·read-only·승인·검토 경계 등 규범 자체는 유지한다. 실행 가능한 guard 제거를 역할 권한 확대로 해석하지 않는다.

Codex·Claude 정책 설명은 ARC가 native hook을 설치하거나 Bash를 강제 차단한다고 주장하지 않아야 한다. 기존 tool allowlist와 prompt 계약에 대한 정확한 설명은 유지한다.

## 패키지·manifest·hash

`lib/installer/manifest.mjs:43`의 hook 전용 필수 자산을 제거한다. 삭제한 모듈·자산을 package validator나 fixture가 계속 요구하지 않아야 한다.

`lib/runtime/cooperative.mjs`의 hook 전용 함수 제거와 canonical policy 변경은 배포 runtime 사본 및 hash에 영향을 줄 수 있다.

- canonical source에서 양쪽 runtime·policy 자산을 재생성한다.
- `RUNTIME_MODULE_PATHS`와 `COOPERATIVE_RUNTIME_MODULES`의 서로 다른 역할을 유지한다.
- 함수 제거만으로 module inventory를 임의 변경하지 않는다.
- 공유 모듈을 실제로 삭제하지 않는 한 해당 module 목록을 줄이지 않는다.
- `runtimeHash`·`policyHash`는 최종 실제 bytes를 반영한다.
- 기존 workflow의 version/hash 불일치를 성공으로 우회하거나 state를 자동 초기화하지 않는다.
- 불필요한 schema·version 변경을 추가하지 않는다.

최종 `MANIFEST.sha256`은 삭제·수정·생성된 보호 자산을 모두 반영하도록 기존 도구로 재생성한다. 일부 checksum만 수동으로 맞추지 않는다.

## 기존 설치와 migration 결과

이번 작업은 저장소와 향후 배포 payload의 소스 제거다. 사용자의 기존 native 설정은 변경하지 않는다.

따라서 다음 상황이 가능하다.

- Codex·Claude 설정의 기존 observer 기록이 남는다.
- Codex `hooks.state`의 key·trusted hash가 남는다.
- 업데이트나 제거로 hook 실행 파일이 없어지면 기존 command 참조가 끊길 수 있다.
- 새 payload로 교체되지 않은 구버전 파일이 있는 동안에는 기존 hook이 계속 실행될 수 있다.
- 기존 runtime·policy hash와 새 payload가 달라 기존 workflow에서 drift가 감지될 수 있다.

이를 숨기거나 “기존 hook까지 삭제 완료”로 보고하지 않는다. 자동 cleanup·호환 shim·별도 migration을 구현하지 않는다. 실제 native 설정 정리는 추후 사용자 명시적 권한을 받은 별도 작업이다.

## 검사와 검증 요구

검사는 합성 임시 home·설정·workflow를 사용한다. 실제 사용자 native 설정을 읽거나 수정하지 않는다.

### 설치·제거 회귀

- 신규 Codex·Claude 설치 계획에 ARC observer가 생성되지 않는다.
- 기존 ARC observer와 사용자 사례의 `hooks.state`가 있는 Codex 설정으로 `buildInstallPlan`이 성공한다.
- 일반 concurrency·wait 변경을 제외한 기존 hook·state의 원문과 의미가 유지된다.
- 기존 observer 마커가 ARC 전용 validator를 유발하지 않는다.
- Claude native 사용자 hook이 보존된다.
- 제거 계획이 native hook 설정을 수정 대상으로 만들지 않는다.
- 일반 AGENTS 관리·설정·snapshot·transaction 동작이 유지된다.

### 프로필·정책·runtime 회귀

- 생성 Claude 역할 프로필에 ARC hook frontmatter가 없다.
- hook 자산 없이 profile·policy generation과 validation이 성공한다.
- 일반 프로필 파싱·모델 설정·도구 설정은 유지된다.
- 공유 Git 분류·gate·cooperative workflow API가 동작한다.
- 삭제한 hook 함수와 자산을 실행하는 import·package script·fixture가 남지 않는다.
- hook 전용 관찰 검사는 제거하고, 그와 무관한 workflow assertions는 유지한다.

### Parity와 집중 검사

기존 frozen parity ledger를 임의로 재기준화하거나, 삭제 API에 대한 검사를 이름만 남겨 무조건 통과시키지 않는다.

후속 구현 계획은 다음을 구분해야 한다.

- 계속 유효한 legacy assertions와 매핑.
- 승인된 기능 삭제로 폐기되는 hook 전용 assertions.
- 해당 폐기를 반영하는 데 필요한 ledger·validator 변경.

기능 폐기 반영은 hook 범위에 제한하고, 무관한 parity 기준을 변경하지 않는다. 필요한 경로와 처리 방식은 계획 preflight에서 명시한다.

실행 검사는 영향받는 installer·profile·policy·runtime 집중 검사와 생성물·manifest 일관성 검사에 한정한다. 전체 스위트나 parity `--complete`는 실행하지 않는다. 정확한 명령과 필수 증거는 승인 후 구현 계획에 기록한다.

## 수용 기준

| ID | 기준 |
|---|---|
| HSR-1 | Codex·Claude 설치·재설치·업데이트에 observer 등록·갱신 기능이 없다. |
| HSR-2 | 제거 과정에 native observer 탐지·검증·정리 기능이 없다. |
| HSR-3 | Claude 프로필 Git guard 설치·필수 검증·전용 자산이 없다. |
| HSR-4 | hook 전용 wrapper·관찰 API·generator 경로와 dangling 참조가 없다. |
| HSR-5 | 일반 cooperative/gate/Git 판정 API와 역할 권한 계약이 유지된다. |
| HSR-6 | concurrency·wait·AGENTS·언어·모델·일반 프로필 처리가 유지된다. |
| HSR-7 | 사용자 사례의 합성 Codex 설정으로 설치 계획이 성공하며 기존 hook·state가 보존된다. |
| HSR-8 | 실제 사용자 native 설정·기존 관찰 데이터는 수정·삭제하지 않는다. |
| HSR-9 | 정책·프로필·runtime 생성물과 module inventory·hash·manifest가 일치한다. |
| HSR-10 | 관련 집중 검사·필수 재검사가 통과하고, hook 폐기와 무관한 assertions가 유지된다. |
| HSR-11 | 문서가 hook 미제공과 기존 설정의 stale 참조 가능성을 정확히 설명한다. |
| HSR-12 | 필요한 QA와 최종 독립 Reviewer 검토의 미해결 finding이 없다. |

## 실행·보류 경계

이 명세의 승인 전에는 의존 구현 계획을 작성하지 않는다. 승인 후 Planner가 준비된 대상에 대한 정식 계획 초안을 반환하고, Orchestrator가 저장·검토·개별 승인을 조정한다.

구현 계획은 공유 source와 생성물·manifest를 검증 가능한 작업 경계로 묶고, 각 작업의 파일 소유권·집중 검사·QA 증거·수용·커밋 조건을 정한다. Reviewer는 작업마다 요구하지 않고, 필요한 QA가 완료된 최종 전체 변경을 독립 검토한다.

다음은 영향받는 작업의 보류 조건이다.

- 예상하지 못한 Git 상태 또는 소유권 충돌.
- 제거 후보가 보존 대상 공유 API에도 필요함.
- native 설정 수정이나 일반 workflow 권한 변경이 필요함.
- 생성물·manifest·version/hash 검증 실패.
- legacy parity 폐기를 적법하게 표현할 수 없는 상태.
- 승인한 집중 범위를 넘는 검사·환경 변경 필요.

문제의 근거·영향·완료 범위와 필요한 결정을 Orchestrator에게 반환한다. 실패를 숨기거나 검증 기준을 낮춰 진행하지 않는다.

## 자체 검토

- 두 플랫폼 observer와 별도 Claude Bash Git guard를 모두 포함했다.
- hook 전용 코드와 보존할 공유 runtime·Git 정책 API를 구분했다.
- 설치·제거 소스만 지우고 generator·validator·패키지가 깨지는 누락을 포함했다.
- 기존 native 설정·trust metadata·관찰 데이터의 자동 cleanup을 제외했다.
- runtime/policy hash 변화와 기존 workflow drift를 우회하지 않도록 했다.
- 검사의 기능 폐기와 무관한 legacy assertions 보존을 구분했다.
- 이전 계획을 재사용하지 않고, 명세 승인 후 계획으로 진행하도록 했다.

추가 제품 범위 결정은 없다. 정확한 파일 목록·검사 명령·parity 폐기 처리와 작업 경계는 이 명세 승인 후 구현 계획에서 확정한다.
