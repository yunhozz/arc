# ARC hook 소스 제거 구현 계획

> **실행 담당자:** ARC Orchestrator가 Implementer → fresh QA → 작업 수용·집중 커밋 → 최종 전체 Reviewer 순서로 조정한다. 아래 체크박스는 하나의 작업 안에서 진행을 기록하며 별도 커밋 단위가 아니다.

**목표:** Codex·Claude의 ARC observer와 Claude 역할별 Bash Git guard의 설치·갱신·삭제 및 전용 소스를 제거하고, 일반 설정·프로필·cooperative runtime 기능을 보존한다.

**구조:** hook 전용 설치 코드, 프로필 wiring, wrapper와 관찰 API를 함께 제거한다. 공유 Git 판정과 gate API는 유지하고, 정책·runtime 배포 사본·패키지 inventory·manifest를 canonical source와 동기화한다.

**기술:** Node.js ES modules, Python 기존 모델 도구, `node:test`, `unittest`, 기존 policy/runtime/manifest generator.

**승인된 명세:** `/Users/yunho/.codex/worktrees/codex-observer-hook-merge/arc/docs/superpowers/specs/2026-10-26-arc-hook-source-removal-design.md`

**계획 상태:** 사용자 승인 완료. 승인된 범위로 구현을 진행한다.

## 실행 대상과 preflight

| 항목 | 확인 내용 |
|---|---|
| 저장소 | `/Users/yunho/.codex/worktrees/codex-observer-hook-merge/arc` |
| branch | `fix/codex-observer-hook-merge` |
| HEAD/base | `0ebb4077a9fe10f33658adf0aba80b465aa6e039` |
| 계획 작성 직전 기준 변경 상태 | 승인된 명세 파일만 untracked였으며, 구현·검사 파일 변경은 없었음 |
| 기존 구현·검사 변경 | 없음 |
| 이전 observer 호환 계획 | 사용자 승인으로 삭제 완료 |
| 실행 대상 선택·준비 | Orchestrator가 사용자 선택과 실제 준비 증거 제공 |
| 명세 승인 | Orchestrator가 사용자 명시적 승인 확인 |

계획 저장 대상:

`/Users/yunho/.codex/worktrees/codex-observer-hook-merge/arc/docs/superpowers/plans/2026-10-26-arc-hook-source-removal.md`

명세와 계획은 Orchestrator 소유 문서다. 문서 준비·기록·커밋 조건은 Implementer handoff 전에 Orchestrator가 확인한다.

현재 소스에서 확인한 주요 결합 관계:

- `global-config.mjs:46-89`의 observer 함수가 설치·제거 양쪽에서 사용된다.
- `plan.mjs:23`은 별도의 Claude Bash Git guard를 프로필에 설치한다.
- `lib/models/profiles.mjs:79-135`와 `claude/skill/scripts/model_config.py:79-199`는 managed hook을 검증하고 필수 필드로 요구한다.
- `lib/policy/render.mjs`는 guard wrapper에서 Git validator를 가져오고 hook 자산·프로필 wiring을 생성한다.
- `lib/policy/role-policy.json`의 `git.specialists-deny`는 현재 Claude control을 `hook`으로 선언한다.
- `lib/runtime/cooperative.mjs:188`의 hook 관찰 함수가 runtime hash 대상 모듈에 포함된다.
- `lib/runtime/evaluate.mjs:129`는 저장된 versions와 현재 versions가 다르면 `cooperative.versions` hold를 반환한다.
- `scripts/check-installer-parity.mjs`는 frozen inventory를 검증하며 기본 모드에서는 매핑된 테스트를 실행하지 않는다.
- 현재 ledger 검색에서는 hook·guard·observer 전용 매핑이 확인되지 않았다. frozen inventory를 변경하거나 새 retirement를 추가할 필요가 없다.

## 공통 제약

- 실제 `~/.codex/config.toml`과 Claude native settings를 읽거나 수정하지 않는다.
- 테스트는 합성 임시 home·설정·workflow를 사용한다.
- 기존 hook 기록, Codex `hooks.state`, `.git/arc/planner-observations` 데이터의 migration·cleanup을 구현하지 않는다.
- hook을 다시 설치하는 옵션·UI·호환 shim을 추가하지 않는다.
- `runCodexGate`, `runClaudeGate`, decision renderer, 공유 Git 판정·workflow API를 보존한다.
- concurrency·wait·AGENTS·언어·모델·일반 프로필 기능과 transaction 보존 조건을 유지한다.
- 역할의 Git 제한·승인·검토 규칙을 완화하지 않는다.
- native ARC hook과 npm lifecycle의 install/postinstall 기능을 구분한다. native hook 제거를 이유로 일반 패키지 설치 기능을 삭제하지 않는다.
- `hook_event_name` 등 공유 adapter의 입력 형식과 capability fixture는 이름에 `hook`이 있다는 이유로 삭제하지 않는다.
- 전체 스위트와 parity `--complete`를 실행하지 않는다.
- push·merge·배포는 수행하지 않는다.
- Specialist는 Git 상태를 변경하지 않는다. Orchestrator가 수용·stage·commit을 담당한다.

## 파일 구조와 소유권

모든 상대 경로는 실행 대상 저장소 기준이다. 아래 구현·검사·생성물은 OBS-REMOVE-1 Implementer 소유다.

### 수정할 canonical source

| 경로 | 변경 책임 |
|---|---|
| `lib/installer/global-config.mjs` | observer 전용 API·상수·import 제거, 일반 설정 처리 유지 |
| `lib/installer/plan.mjs` | global observer 병합과 Claude guard 설치·자산 요구 제거 |
| `lib/installer/uninstall.mjs` | native observer 검색·제거와 관련 snapshot/managed-path 처리 제거 |
| `lib/models/profiles.mjs` | managed hook 필수 검사 제거, 일반 frontmatter와 사용자 데이터 보존 |
| `claude/skill/scripts/model_config.py` | Python 경로의 managed hook 필수 검사 제거 |
| `lib/policy/render.mjs` | hook 생성·자산 target 제거, 공유 Git validator 직접 참조 |
| `lib/policy/role-policy.json` | Claude Git control을 `prompt`로 수정하고 hook 미제공 설명 반영 |
| `lib/runtime/cooperative.mjs` | hook 전용 관찰 API·전용 helper 제거 |
| `lib/installer/manifest.mjs` | 삭제한 hook 전용 필수 자산 요구 제거 |
| `package.json` | 삭제하는 hook probe script의 배포 목록 항목 제거 |

### 삭제할 hook 전용 source·자산

- `lib/policy/claude-hook.mjs`
- `codex/skill/hooks/runtime-gate.mjs`
- `claude/skill/hooks/runtime-gate.mjs`
- `claude/skill/hooks/role-git-guard.mjs`
- `claude/skill/hooks/git-policy.json`
- `scripts/probe-runtime-hooks.mjs`

`probe-runtime-hooks.mjs`의 canary handler·receipt writer·전용 CLI를 함께 제거한다. 공유 `summarizeProbe`·capability API와 그 직접 검사는 유지한다. 새 대체 CLI는 만들지 않는다.

### 프로필·생성물

- `claude/agents/arc-scouter.md`
- `claude/agents/arc-planner.md`
- `claude/agents/arc-implementer.md`
- `claude/agents/arc-qa.md`
- `claude/agents/arc-reviewer.md`
- 변경된 `POLICY_TARGETS`에 속하는 정책 생성물
- `codex/skill/runtime/cooperative.mjs`
- `claude/skill/runtime/cooperative.mjs`
- `codex/skill/runtime/role-policy.json`
- `claude/skill/runtime/role-policy.json`
- `MANIFEST.sha256`

다른 runtime 사본은 generator가 canonical source와 동일하게 유지해야 한다. 함수 삭제만으로 `RUNTIME_MODULE_PATHS`·`COOPERATIVE_RUNTIME_MODULES`의 목록·순서를 바꾸지 않는다.

### 검사·fixture

수정:

- `tests/node/plan.test.mjs`
- `tests/node/install.test.mjs`
- `tests/node/profile-render.test.mjs`
- `tests/node/role-policy.test.mjs`
- `tests/node/parity-check.test.mjs`
- `tests/node/runtime-codex.test.mjs`
- `tests/node/runtime-claude.test.mjs`
- `tests/node/runtime-cooperative.test.mjs`
- `tests/node/runtime-installed-entry.test.mjs`
- `tests/node/runtime-versions.test.mjs`
- `tests/node/runtime-capabilities.test.mjs`
- `tests/node/manifest.test.mjs`
- `tests/node/package.test.mjs`
- `tests/node/release-artifact.test.mjs`
- `tests/node/upgrade-harness.test.mjs`
- `tests/node/instruction-layout.test.mjs`
- `tests/node/fixtures/instruction-contracts.json`
- `tests/test_claude_payload.py`

신규:

- `tests/node/git-query.test.mjs` — 기존 guard 검사 중 공유 classifier assertions를 이전한다.

삭제:

- `tests/node/role-git-guard.test.mjs`
- `tests/node/runtime-probe.test.mjs`

삭제하는 두 검사 파일의 공유 기능 assertions는 새 Git query 검사와 기존 capability 검사로 보존한다. hook wrapper·CLI만 검증하던 assertions는 승인된 기능 폐기로 제거한다.

### 문서

- `docs/runtime/planner-hook-context.md`: 현재 hook 미제공, 남은 일반 gate API, stale 설정과 hash drift 설명.
- 정책 generator가 관리하는 platform notice와 생성 문서.

과거 승인 명세·계획은 역사 기록으로 유지한다. 무관한 문서나 README를 일괄 재작성하지 않는다.

### 보존할 파일·계약

- `tests/installer-parity.json`
- `scripts/check-installer-parity.mjs`
- 공유 runtime adapters·Git query·schema·store·gate·workflow 모듈
- `lib/installer/runtime-assets.mjs`의 module inventory
- `lib/runtime/bootstrap.mjs`의 module inventory·version label·hash 방식
- 모델·역할·도구·일반 설정 계약과 무관한 baseline assertions

필요 파일이 위 목록을 넘어가면 의존 관계와 이유를 Orchestrator에게 반환한 뒤 소유권을 확정한다.

## 검토 초점

1. observer 호출 삭제 후 concurrency renderer의 결과·notes가 누락되는 문제.
2. Node만 수정하여 Python 모델 도구가 hook 없는 프로필을 거부하는 문제.
3. guard wrapper 삭제와 함께 공유 Git 제한·gate 검사를 잃는 문제.
4. source·생성물·고정 hash·보호 fixture·manifest가 서로 다른 상태가 되는 문제.
5. 기존 native 설정 정리나 workflow 자동 migration이 이루어졌다고 잘못 보고하는 문제.

---

## OBS-REMOVE-1 — ARC hook 통합 소스와 전용 자산 제거

**구현 목표:** 명세 HSR-1~HSR-11을 하나의 검증 가능한 변경으로 구현한다.

**선행 작업:** 승인된 명세와 준비된 target. 별도 선행 구현 작업은 없다.

**작업 경계:** 설치기·프로필 validator·policy generator·전용 자산·runtime 사본·manifest는 서로 결합되어 있다. 일부 삭제만으로는 정상 payload를 검증할 수 없으므로 한 top-level task와 한 집중 구현 커밋으로 묶는다.

**인터페이스:**

보존:

- `buildInstallPlan`
- `buildUninstallPlan`
- `renderProfiles`
- Python `parse_profile`·모델 렌더링/적용
- `validateRolePolicy`·`buildPolicyOutputs`
- `validateGitPolicy`·`classifyGitCommand`
- `runCodexGate`·`runClaudeGate`
- 일반 cooperative workflow API와 `cooperativeVersions`

제거:

- observer 생성·제거 API
- Claude hook command·profile wiring API
- hook wrapper의 `main`·`runHook`
- `recordPlannerHookObservation`과 전용 helper
- hook probe CLI·receipt writer

### 1. 집중 회귀를 먼저 작성하고 실패를 기록한다

- [ ] 기존 fixture를 활용해 새 회귀 검사에 공통 `HSR:` prefix를 사용한다.

필수 신규 검사:

| 위치 | 검사 내용 |
|---|---|
| `plan.test.mjs` | 신규 Codex·Claude 계획이 observer를 만들지 않음 |
| `plan.test.mjs` | 합성 Codex observer·state 설정으로 실제 `buildInstallPlan`이 성공하고 기존 bytes를 보존함 |
| `plan.test.mjs` | 유효한 설정의 잘못된 ARC 전용 마커가 설치를 막지 않음 |
| `plan.test.mjs` | Claude native 사용자 hook을 유지함 |
| `install.test.mjs` | 제거 계획이 native runtime config를 global change로 만들지 않음 |
| `profile-render.test.mjs` | hook 없는 다섯 Claude 프로필이 렌더링됨 |
| `profile-render.test.mjs` | optional 사용자 hook frontmatter가 LF·CRLF에서 보존됨 |
| `role-policy.test.mjs` | 생성기가 hook을 재생성하지 않고 Git control을 `prompt`로 표시함 |
| `runtime-versions.test.mjs` | canonical·배포 사본의 policy/runtime hash가 일치함 |

Codex 재현 fixture에는 합성 경로·hash로 세 `[hooks.state."<path>:<event>:0:0"]` 테이블을 end 마커 앞에 넣는다. 실제 사용자 경로·설정·hash를 복사하지 않는다.

계획 생성만 수행한 검사에서는 임시 원본 파일 bytes가 변경되지 않아야 한다. 실제 임시 설치·제거 검사에서는 일반 설정 변경과 hook 보존을 구분한다.

- [ ] 작업 디렉터리에서 RED를 확인한다.

```bash
node --test --test-name-pattern='^HSR:' tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/profile-render.test.mjs tests/node/role-policy.test.mjs tests/node/runtime-versions.test.mjs
```

observer 생성, state 거부, hook 필수 검사 등 현재 동작에 의한 실패를 기록한다. 다른 로드·환경 실패는 별도 분류하고 의존 작업을 보류한다.

### 2. 변경 전 version/hash 증거를 기록한다

- [ ] 소스 수정 전에 현재 versions를 기록한다.

```bash
node --input-type=module -e 'import {cooperativeVersions} from "./lib/runtime/bootstrap.mjs"; console.log(JSON.stringify(await cooperativeVersions()));'
```

현재 고정 runtime baseline은 다음과 같다.

`sha256:6e12541f86f8941fe407749be80ba1e3a2a950f18c17eff546da982f0471b3da`

명령으로 확인한 `policyHash`와 함께 기존 workflow drift 회귀의 이전 버전 증거로 사용한다. 실제 workflow state를 읽거나 수정하지 않는다.

### 3. 설치·제거와 프로필 wiring을 제거한다

- [ ] `global-config.mjs`의 observer API·상수·import와 소비자 호출을 제거한다.
- [ ] `plan.mjs`에서 global observer 병합과 Claude guard 설치·payload 요구를 제거한다.
- [ ] `uninstall.mjs`에서 observer 정리를 위한 runtime config 접근·변경·snapshot/managed-path 추가를 제거한다.
- [ ] 일반 설정 renderer의 결과·notes가 유지되도록 연결한다.
- [ ] 다섯 Claude source 프로필에서 ARC 관리 hook frontmatter만 제거한다.

설치·업데이트는 기존 observer 존재를 판단하거나 갱신하지 않는다. 제거도 native hook을 정리하지 않는다.

일반 AGENTS·언어·wait·concurrency·snapshot·rollback은 유지한다. TOML·JSON 자체의 유효성 검사는 유지하며 ARC 마커 전용 검사를 남기지 않는다.

### 4. Node·Python 프로필 validator를 정리한다

- [ ] managed hook 식별·명령 검증·필수 존재 조건을 두 구현에서 제거한다.
- [ ] `hooks`를 일반 프로필의 필수 필드 목록에서 제거한다.
- [ ] optional 사용자 hook 블록은 데이터로 보존한다. 이를 실행·정규화하거나 ARC 소유로 해석하지 않는다.
- [ ] 이름·모델·effort·도구·중복 필드·관리 정책 블록 등 일반 검증을 유지한다.

Node와 Python 모두 모델 변경이 model·effort 외 bytes를 유지하는지 검증한다. 범용 YAML parser 도입이나 기존 일반 frontmatter 지원 범위 확장은 하지 않는다.

Python에는 다음 신규 검사 이름을 사용한다.

- `test_hook_removal_profiles_parse_render_apply`
- `test_hook_removal_preserves_optional_frontmatter`

기존 hook 전용 테스트는 기능 폐기에 맞게 제거하고 일반 모델·역할·도구 assertions는 유지한다.

### 5. 정책 generator와 전용 자산을 정리한다

- [ ] `render.mjs`의 Git validator import를 `lib/runtime/git-query.mjs`로 전환한다.
- [ ] hook asset target과 Claude hook 삽입 단계를 제거한다.
- [ ] `git.specialists-deny.controls.claude`를 `hook`에서 `prompt`로 변경한다.
- [ ] platform notice에서 ARC native hook·Bash guard를 제공하지 않음을 정확히 설명한다.
- [ ] guard·observer wrapper·command builder·probe CLI와 전용 자산을 삭제한다.
- [ ] `package.json`과 패키지 검사 root script 목록에서 삭제한 probe를 제거한다.
- [ ] `manifest.mjs`의 삭제 자산 필수 조건을 제거한다.

Git 규범 자체와 `policy.git`의 공유 판정 데이터는 보존한다. npm release artifact의 일반 lifecycle 기능은 제거하지 않는다.

### 6. hook 전용 관찰 API와 관련 검사를 제거한다

- [ ] `recordPlannerHookObservation`·`observeHookTarget` 및 독점 helper를 제거한다.
- [ ] 공유 코드에서도 쓰는 import·helper는 남긴다.
- [ ] wrapper 실행만 검증하는 adapter 검사와 설치 endpoint 검사의 observer 부분을 제거한다.
- [ ] 일반 adapter의 trusted context·assignment·Git 제한 검사는 그대로 유지한다.
- [ ] 기존 `role-git-guard.test.mjs`의 classifier assertions를 `git-query.test.mjs`로 옮기고 canonical module을 직접 import한다.
- [ ] probe의 synthetic summary 관련 일반 assertion을 `runtime-capabilities.test.mjs`에서 직접 API 검사로 보존한다.
- [ ] hook 전용 검사 파일을 삭제하고 남은 테스트의 dangling import·fixture 복사를 정리한다.

기존 `runtime-installed-entry.test.mjs`의 CLI workflow·Planner guard·hash drift assertions는 유지한다. 테스트의 임시 데이터는 정해진 cleanup 범위에서만 제거하며 기존 관찰 데이터는 건드리지 않는다.

### 7. hash 호환 결과를 명시적으로 검증한다

이번 변경은 다음 두 값을 변경한다.

- `policyHash`: Claude Git control·platform notice를 포함한 canonical 정책 bytes 변경.
- `runtimeHash`: hash 대상인 `cooperative.mjs`에서 hook 전용 함수 제거.

`cooperative-4`, policy version `1`, schema version과 module 순서는 유지한다. 기존 hash 비교가 이미 변경을 감지하므로 이를 숨기기 위한 version bump나 compatibility migration은 필요하지 않다.

그 결과 이전 bytes를 저장한 기존 workflow는 현재 runtime에서 versions 비교를 통과하지 못하고 hold할 수 있다. 이는 예상 호환 결과이며 정상 실행처럼 보고하지 않는다.

- [ ] 임시 state에서 이전 `policyHash`만 다른 경우와 이전 `runtimeHash`만 다른 경우를 각각 검사한다.
- [ ] `cooperative.versions` hold와 저장 versions·Planner ledger 보존을 확인한다.
- [ ] 새 versions로 초기화한 임시 workflow는 일반 작업이 정상 동작하는지 확인한다.
- [ ] 기존 runtime 고정 hash 검사의 이전 값을 historical baseline으로 남기고, 최종 새 bytes에 대한 고정 baseline을 갱신한다.
- [ ] 고정 module 목록과 독립적인 raw Buffer hash 재계산 assertions는 유지한다.

기존 state 재작성·자동 초기화·approval 재발급을 추가하지 않는다.

### 8. 정책·runtime·manifest를 순서대로 재생성한다

- [ ] canonical source와 프로필 정리가 끝난 뒤 실행한다.

```bash
node scripts/update-role-policy.mjs
```

```bash
node scripts/update-runtime-assets.mjs
```

- [ ] 변경 후 versions를 기록한다.

```bash
node --input-type=module -e 'import {cooperativeVersions} from "./lib/runtime/bootstrap.mjs"; console.log(JSON.stringify(await cooperativeVersions()));'
```

- [ ] `runtime-versions.test.mjs`의 새 고정 baseline과 관련 보호 fixture를 검토한다.

`tests/node/fixtures/instruction-contracts.json`에서는 승인된 삭제 자산 항목과 실제 수정한 보호 source의 기대 hash만 변경한다. 전체 fixture를 현재 트리로 재기준화하거나 무관한 계약·hash를 갱신하지 않는다.

`instruction-layout.test.mjs`의 보호 대상 검사도 삭제된 기능을 요구하지 않게 수정하되, 나머지 모델·권한·정책·CLI/runtime 보호 assertions를 유지한다.

- [ ] 최종 보호 파일 변경 후 manifest를 재생성한다.

```bash
node scripts/update-manifest.mjs
```

생성물이 예상 밖 source를 변경하거나 inventory가 달라지면 원인을 분류하고 Orchestrator에게 반환한다.

### 9. 문서·parity·fixture를 마무리한다

- [ ] `planner-hook-context.md`에 다음을 명시한다.

  - 현재 ARC는 native observer와 Claude Bash Git guard를 설치하지 않는다.
  - 일반 gate API는 남아 있으며 자체적으로 host 연결을 제공하지 않는다.
  - 실제 사용자 native 설정은 수정하지 않는다.
  - stale command 참조가 남을 수 있다.
  - 기존 workflow는 policy/runtime hash drift로 hold할 수 있다.
  - 자동 migration·cleanup은 제공하지 않는다.

- [ ] 삭제 자산을 복사하는 설치·업그레이드·패키지 fixture를 정리한다.
- [ ] `tests/installer-parity.json`과 checker의 frozen inventory·counts·기존 retirement는 유지한다.
- [ ] 기존 mapped test 이름과 유효한 assertions를 유지한다.

preflight에서는 hook 전용 legacy 매핑이 없었으므로 새 retirement·checker 완화는 계획하지 않는다. 실제 수정 중 매핑을 유지할 수 없는 사례가 나오면 이름만 남겨 통과시키지 말고 정확한 assertion·대체 coverage와 함께 Orchestrator에게 반환한다.

## 필수 집중 검사

모든 명령은 실행 대상 저장소에서 수행한다. 아래 목록은 전체 스위트를 대체하는 이번 변경의 필수 집중 검증이다.

### A. 설치·업데이트·제거

```bash
node --test --test-name-pattern='HSR:|limits policy defaults|Claude settings concurrency|plan construction performs no writes|plan generates buffers|policy and native configuration rollback|canonical profile publication failure|public rendering baseline|public planning errors retain validation precedence' tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/upgrade-harness.test.mjs
```

새 회귀와 관련 설정·transaction 보존 검사가 실행되어야 한다. 선택 패턴의 검사들이 전부 skip된 결과는 통과 증거가 아니다.

### B. 프로필·정책·공유 Git와 adapters

```bash
node --test tests/node/profile-render.test.mjs tests/node/role-policy.test.mjs tests/node/git-query.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-capabilities.test.mjs tests/node/instruction-layout.test.mjs
```

```bash
node --test --test-name-pattern='^paired specialist payloads deliver the same bounded recovery and visual contracts$' tests/node/parity-check.test.mjs
```

이 파일들은 삭제 경로 또는 보존해야 하는 직접 소비자 범위다. `parity-check.test.mjs`는 정확히 지정한 paired-payload 검사만 실행한다. 다른 callbacks가 금지된 parity `--complete`를 호출하므로 이 파일을 필터 없이 실행하지 않는다. unrelated Node suite를 glob으로 실행하지 않는다.

### C. cooperative·배포 runtime·hash

```bash
node --test --test-name-pattern='HSR:|planner runtime version drift|installed endpoint preserves workflow guards' tests/node/runtime-cooperative.test.mjs tests/node/runtime-installed-entry.test.mjs
```

```bash
node --test tests/node/runtime-versions.test.mjs tests/node/runtime-assets.test.mjs
```

### D. Python 모델 도구

```bash
PYTHONPATH=tests python3 -B -m unittest -v test_claude_payload.ClaudePayloadTests.test_hook_removal_profiles_parse_render_apply test_claude_payload.ClaudePayloadTests.test_hook_removal_preserves_optional_frontmatter test_claude_payload.ClaudePayloadTests.test_exact_roles_models_efforts_and_tools test_claude_payload.ClaudePayloadTests.test_frontmatter_names_and_required_fields test_claude_payload.ClaudePayloadTests.test_renderer_preserves_body_and_non_model_fields test_claude_payload.ClaudePayloadTests.test_renderer_rejects_duplicate_or_malformed_frontmatter test_claude_payload.ClaudePayloadTests.test_apply_models_check_and_dry_run_do_not_write test_claude_payload.ClaudePayloadTests.test_apply_models_failure_restores_all_prior_profiles
```

Python 전체 payload suite는 실행하지 않는다.

### E. 패키지·manifest 소비자

패키지 검사에 `HSR:` prefix의 삭제 자산 미포함·공유 runtime 포함 회귀를 추가한다.

```bash
node --test --test-name-pattern='HSR:|descriptor-verifies bytes|manifest reference coverage|current payload rejects legacy installer entries|root scripts|release accepts only approved package exclusions|source remains lifecycle-free|actual npm pack command audit' tests/node/manifest.test.mjs tests/node/package.test.mjs tests/node/release-artifact.test.mjs
```

로컬 npm pack 검사만 허용하며 publish·install·네트워크 작업으로 확대하지 않는다.

### F. 생성물·ledger 일관성

```bash
node scripts/update-role-policy.mjs --check
```

```bash
node scripts/update-runtime-assets.mjs --check
```

```bash
npm run check:manifest
```

```bash
node scripts/check-installer-parity.mjs
```

기대 결과는 모두 exit code 0이다. parity 기본 모드 통과는 frozen ledger 일관성 증거이며 모든 legacy 검사의 실행 증거가 아니다. `--complete`는 실행하지 않는다.

최종 잔여 참조 검토는 삭제 파일·API에 한정한다. 남아 있는 shared adapter event, 역사 문서, 회귀 fixture의 hook 문자열을 일괄 제거하지 않는다.

## QA와 작업 수용

### Implementer 제출 증거

- 변경·삭제·생성 파일 목록.
- RED의 실패 원인과 수정 후 필수 집중 검사 결과.
- 명령·exit code·실행/통과/실패/skip 수.
- 이전·이후 policy/runtime hash와 변경 원인.
- module inventory·version label 보존.
- hook 삭제와 공유 API 보존을 보여 주는 diff 위치.
- native 설정·관찰 데이터 비접근·비변경 범위.
- parity frozen inventory 보존과 mapped assertions 유지.
- 문서의 stale 참조·hash drift 설명.

### Fresh QA

QA는 최종 수정 상태에서 A~F를 독립 실행하고 명세 HSR-1~HSR-11에 대한 근거를 반환한다. source inspection만으로 동작 검증을 대체하지 않는다.

특히 다음을 확인한다.

- 실제 `buildInstallPlan` 사용자 사례의 합성 재현이 해결됨.
- 신규 hook 미생성·기존 native 데이터 보존·제거 시 비정리가 모두 일관됨.
- Node·Python profile consumer가 hook 없이 동작함.
- shared gate·Git 제한이 유지됨.
- 이전 hash state가 hold하고 state를 자동 migration하지 않음.
- canonical·배포·고정 baseline·manifest가 일치함.
- 실제 home 설정이 사용되지 않음.

QA 실패는 같은 작업의 Implementer 수정 후 필요한 QA 재검사를 거친다. 보호 source가 바뀌면 해당 생성물·baseline·manifest를 다시 동기화하고 관련 검사를 재실행한다.

### Orchestrator 수용 조건

Orchestrator는 다음을 모두 확인한 뒤 작업을 수용한다.

- HSR-1~HSR-11 충족.
- 필수 집중 검사와 fresh QA 통과.
- 필요한 QA 재검사 완료.
- 필수 finding 미해결 없음.
- 승인된 파일 소유권과 삭제 범위 준수.
- generic APIs·역할 권한·일반 설정 계약 보존.
- 실제 native 설정과 기존 관찰 데이터 비변경.
- 자동 cleanup·migration·새 옵션·새 hook 없음.
- 관련 생성물·manifest·hash 일관성 확인.

## 보류와 실패 처리

다음은 영향받는 작업의 보류 조건이다.

- workspace·branch·HEAD 또는 변경 소유권 불일치.
- 예상과 다른 로드·환경·검사 실패.
- 삭제 후보가 유지해야 할 공유 API에 필요함.
- 실제 native 설정 접근·수정이 필요함.
- 새로운 schema·version 정책이나 workflow migration이 필요함.
- frozen parity inventory·무관한 assertions 변경 필요.
- 승인 범위 밖 파일·검사·의존성 변경 필요.
- 생성물·hash·manifest 불일치 또는 필수 QA finding 미해결.

최초 실패 명령·결과, baseline/current revision과 변경 상태를 기록한다. baseline/current 영향을 분류하고 해당 의존 작업만 보류한다. Specialist는 검사 기준을 낮추거나 환경을 바꾸어 우회하지 않는다.

## 커밋 경계

OBS-REMOVE-1은 한 개의 집중 구현 커밋이다. Orchestrator가 작업을 수용한 뒤 canonical source·삭제 자산·검사·문서·생성물·manifest를 함께 커밋한다.

예시 제목:

`refactor(installer): ARC 네이티브 hook 연동 제거`

문서 준비 커밋은 구현 task의 커밋 경계와 별도로 Orchestrator가 관리한다. Specialist는 stage·commit을 수행하지 않는다.

## 최종 전체 Reviewer와 완료

작업 수용·커밋 및 필요한 QA 완료 후 독립 Reviewer가 base 대비 최종 전체 변경을 한 번 검토한다. Reviewer를 task별 필수 검사로 배정하지 않는다.

최종 검토 초점:

- hook 통합 source가 소비자·generator·패키지에 남지 않았는가.
- shared runtime·Git 판정·일반 profile/config 계약을 잃지 않았는가.
- Node·Python과 canonical·배포 사본이 일치하는가.
- fixed baseline·보호 fixture 변경이 승인된 기능 삭제에 한정되는가.
- 기존 native 설정·workflow migration 한계가 정확히 설명되는가.
- 집중 검사 결과를 전체 suite나 실제 host 검증으로 과장하지 않는가.

최종 finding은 Implementer → Reviewer 재검토로 해결한다. 이 최종 계획 단계의 finding에는 QA를 다시 배정하지 않는다. 필요한 집중 재검사·생성물 검증은 유지한다.

필수 finding이 해결되고 HSR-12까지 충족한 뒤 Orchestrator가 전체 완료를 판단한다. 실제 사용자 설정의 hook 제거 완료나 현재 Codex/Claude 세션의 정상 callback을 주장하지 않는다.

## 자체 검토

- 승인된 명세의 HSR-1~HSR-12를 구현·QA·최종 검토에 연결했다.
- observer 외 Claude guard, Python consumer, policy generator, probe·wrapper, package fixture 누락을 포함했다.
- 삭제 자산과 유지할 shared APIs를 명확히 구분했다.
- policyHash/runtimeHash 변경으로 기존 workflow가 hold함을 소스로 확인하고 migration·version bump 없이 검증하도록 했다.
- frozen parity inventory와 현재 mapping을 유지하고 기능 폐기를 가짜 passing test로 숨기지 않도록 했다.
- 검사 범위를 직접 영향받는 파일·이름으로 한정하고 전체 suite·`--complete`를 제외했다.
- fresh QA, Orchestrator 수용·커밋, 최종 전체 Reviewer를 구분했다.
- 실제 home 설정·기존 관찰 데이터의 cleanup을 포함하지 않았다.
- 커밋 예시는 Conventional Commit 형식과 한국어 설명을 사용한다.
- 이 계획 초안 작성 중 구현·검사 실행·파일 저장은 수행하지 않았다.
