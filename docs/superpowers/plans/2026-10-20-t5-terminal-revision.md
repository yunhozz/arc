# T5 종료 범위 수정안: 최종 리뷰 finding 보완

**상태:** 기존 T5-F 범위와 Python 소비자 추가 amendment는 사용자 승인 완료. 구현·검증·Reviewer 재확인·수락은 미완료.

## 현재 요청과 적용 범위

사용자의 최신 지시에 따라 원 계획의 T6·T7 및 그에 종속된 최종 native 통합 단계를 현재 실행 범위에서 제거한다. 현재 결과는 기존에 수락된 T1–T5와 아래 T5 최종 리뷰 보완(T5-F)으로 끝난다. 사용자 환경 적용은 별도이며, README.md는 어떤 경우에도 수정하지 않는다.

기존 승인 기록과 커밋 이력은 보존한다. 원래 계획의 T6·T7은 이 수정안이 승인되면 현행 작업 범위에서 제거한다. 원래 설계의 구현되지 않은 native 통합을 완료 의무나 보장으로 다시 해석하지 않는다.

**준비 대상:** `/Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc`

**Branch:** `chore/arc-runtime-gates`

**기준 HEAD:** `e5e381aedd1ed16b19d1f244ed0e15b6b8200172`

**준비 상태:** tracked worktree와 index clean 확인.

## 결과의 경계

- Codex·Claude의 여섯 역할에 대한 공유 정책·상태·Git 검증과 context 주입형 adapter 계약을 유지한다.
- 기존 Claude specialist Bash Git guard 설치 구성을 보존한다.
- native provider가 연결되지 않은 `runtime-gate`를 기본 Claude profile에 설치하지 않는다. Codex도 이를 활성 runtime enforcement로 표시하거나 설치하지 않는다.
- context 없는 직접 runtime 호출은 계속 거부한다. 그 동작은 platform tool 실행을 차단한다는 증거가 아니다.
- 실제 native session·actor·task identity 연결, 자동 도구 차단 및 전역 enforcement는 이번 종료 범위에서 제공하지 않는다.
- `README.md`를 읽기 전용 범위 밖으로 두며 변경 파일·검증 산출물에도 포함하지 않는다.

## T5-F: 최종 review finding 수정

네 건의 P1 finding을 한 최상위 corrective task 및 하나의 집중 구현 커밋으로 처리한다. 수정 task에 fresh Coder를 배정한다. 같은 task의 미수락 재작업에는 범위·대상·소유권 확인 후 동일 Coder를 사용할 수 있다.

### 소유 파일

제품 코드:

- `lib/policy/claude-hook.mjs`
- `lib/models/profiles.mjs`
- `lib/runtime/evaluate.mjs`
- `lib/runtime/gate.mjs`
- `lib/runtime/store.mjs`
- `lib/runtime/schema.mjs`

회귀 검증:

- `tests/node/role-policy.test.mjs`
- `tests/node/profile-render.test.mjs`
- `tests/node/role-git-guard.test.mjs`
- `tests/node/runtime-evaluate.test.mjs`
- `tests/node/runtime-gate.test.mjs`
- `tests/node/runtime-store.test.mjs`
- `tests/node/runtime-schema.test.mjs`
- `tests/node/runtime-git.integration.test.mjs`
- `tests/node/runtime-claude.test.mjs`
- `tests/node/runtime-codex.test.mjs`

생성물:

- generator 관리 대상인 `claude/agents/arc-scouter.md`, `arc-planner.md`, `arc-coder.md`, `arc-qa.md`, `arc-reviewer.md`의 hook 블록
- 변경된 canonical runtime에 대응하는 `codex/skill/runtime/`, `claude/skill/runtime/`
- `MANIFEST.sha256`

생성물은 generator로만 갱신한다. 추가 파일이나 이 범위 밖 변경이 필요하면 구현을 멈추고 Orchestrator에게 반환한다.

### Finding 1: provider 없는 Claude runtime hook 비활성화

- 기본 generated Claude specialist profile은 wildcard `runtime-gate` hook을 등록하지 않고 기존 specialist Bash `role-git-guard`를 유지한다.
- 비관리 hook/frontmatter 및 LF/CRLF 동작을 보존한다. malformed·duplicate managed wiring은 계속 거부한다.
- context가 없는 runtime entrypoint 호출은 기존처럼 거부한다. 이를 통과시키기 위해 adapter 검증을 약화하지 않는다.
- 이미 설치된 사용자 설정은 자동 수정하지 않으며, 설치 복구를 수행했다고 보고하지 않는다.
- 수락: 생성·설치용 profile에 provider 없는 runtime hook이 없고, Bash Git guard의 query 허용·mutation 거부 동작이 유지된다. 정상 tool event를 무조건 거부하는 hook을 기본 설치하지 않는다.

### Finding 2: commit 경로와 docs-only precommit 판정 일치

- task 승인 범위의 절대 경로와 Git descriptor의 repository 상대 경로를 명시적으로 구분한다.
- evaluator와 Git gate가 같은 승인 target을 기준으로 경로를 해석한다. 절대 경로 descriptor, traversal, target 이탈 및 모호한 경로는 거부한다.
- docs-only commit은 승인된 문서, 실제 Git evidence 및 정확한 index 범위를 요구하지만 구현 task의 `accepted` 상태나 구현 acceptance를 요구하지 않는다.
- task commit은 기존의 정확한 acceptance·checks·findings 조건을 유지한다.
- 수락: 구현 acceptance 전의 유효한 docs-only preflight는 허용되고, 문서·구현 혼합 index, 승인 밖 경로, 오래된 parent는 거부된다. 유효한 task commit은 evaluator와 Git gate가 일치된 결과를 낸다.

### Finding 3: reconcile과 schema/store 전이 정합성

- commit record가 schema의 `purpose`, `expectedParent`, `expectedTree`와 관측한 commit 결과를 일관되게 보존한다.
- workflow/repository/worktree/realpath/branch/base identity는 불변으로 둔다. `target.head` 변경은 검증된 commit reconciliation에서만 허용하며 일반 transition으로는 변경할 수 없다.
- 실제 commit, parent, tree, paths, HEAD 및 남은 변경이 모두 preflight와 일치할 때만 reconcile 결과를 원자적으로 저장한다.
- 수락: 유효한 docs/task commit이 preflight → reconcile → store → schema 검증 및 재읽기를 통과한다. stale·불일치·위조 전이와 일반 callback의 target 변경은 거부되고 기존 durable state가 보존된다. 중복 reconcile은 상태를 중복 반영하지 않는다.

### Finding 4: replay 시 현재 권한 재검증

- 같은 request ID·fingerprint의 이전 `allow`를 현재 state·policy 확인 없이 다시 권한으로 반환하지 않는다.
- 현재 lease·task·policy·승인 범위와 필요한 evidence를 재검증한다. 부족하거나 retired 상태면 거부/hold한다.
- 유효한 replay도 전이·commit 같은 외부 작업을 재실행할 권한을 발급하지 않는다. 충돌 거부, 원자성, revision 보호 및 멱등성은 유지한다.
- 수락: allow 후 Coder가 retired되거나 task/policy/승인 범위가 바뀌면 같은 요청은 이전 allow를 재사용할 수 없다. 유효한 동일 요청 replay는 중복 전이·중복 commit 없이 처리된다.

## TDD와 검증

Coder는 각 finding의 회귀 테스트를 먼저 추가하고 실패를 확인한 뒤 최소 수정으로 통과시킨다. 필수 focused checks:

```text
node --test tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/role-git-guard.test.mjs
node --test tests/node/runtime-evaluate.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-schema.test.mjs
node --test tests/node/runtime-claude.test.mjs tests/node/runtime-codex.test.mjs
node --test tests/node/runtime-git.integration.test.mjs
```

Git integration 검증은 Orchestrator가 승인된 임시 repository에서 수행한다. 기존 policy, runtime payload, manifest 검사를 유지하며 생성 payload는 직접 편집하지 않는다. 기존 QA 결과는 보존한다. 이번 단계는 기존 최종 Reviewer finding의 수정 경로이므로, 필수 회귀·Git 통합 검증 후 Coder → Reviewer로 독립 재확인하며 QA를 재배정하지 않는다.

## 수락 및 종료

1. Coder가 RED/GREEN, 변경 경로, 생성물, 한계를 보고한다.
2. Orchestrator가 Git 통합 검증과 기존 필수 검사 증거를 확인한다.
3. 독립 Reviewer가 네 finding과 영향을 받은 전체 변경을 재검토한다. finding은 해결될 때까지 Coder → Reviewer로 반복한다.
4. Orchestrator가 범위·검증·finding·소유권을 대조해 명시적으로 수락한 뒤 T5-F만 집중 커밋하고 SHA·포함 내용·HEAD·남은 변경을 확인한다.

T5-F 외 후속 task를 두지 않는다. provider 부재를 감추거나 custom host/SDK, 역할 추정, 사용자 trust 변경으로 대체하지 않는다. 최종 결과를 실제 native runtime enforcement로 주장하지 않는다. 사용자 환경에 적용하거나 설치 설정을 변경하지 않는다.

이 수정안은 원 계획의 T6·T7 및 그에 종속된 항목을 현행 실행 범위에서 대체한다. 구현 acceptance나 전체 native runtime enforcement 완료를 선언하지 않는다.


## T5-F 추가 수정안: Claude Python model/profile 소비자 호환성

**상태:** 사용자 승인 완료. 승인된 amendment의 plan-only 커밋 후 fresh Coder를 배정한다.

### 현재 대상과 준비 증거

- Workspace: /Users/ma-24-007/.codex/worktrees/arc-runtime-gates/arc
- Branch: chore/arc-runtime-gates
- HEAD: 5e437acaaae004d009d9859a1866bea9fd5fd268
- 기존 승인 T5-F tracked 수정: 22개 경로, index 비어 있음, README diff 없음
- Tracked diff SHA-256: 48598add529c39c7e55208641cc8661faf4d43fcbdf57c7160bcbd5daee72b37
- canonical handoff: /Users/ma-24-007/Desktop/workspace/arc/.git/arc/handoff/cross-platform-runtime-gates.md
- 기존 T5-F 수정안 SHA-256: 656c8f8f2abc3e71139419cacfc1ae111cc6183232c938bdf3333af068d62edf

위 상태는 이 추가 수정안 작성 전 Orchestrator가 재확인한 증거다. 기존 T5-F 변경은 그대로 보존한다.

### 범위와 승인 경계

현행 목표는 수락된 T1–T5 및 T5-F에서 종료한다. T6·T7, native provider 연결, 설치 통합, 실제 native enforcement 보장, 사용자 trust/settings 변경은 추가하지 않는다. README.md는 수정하지 않는다.

현재 T5-F에서 wildcard runtime hook을 제거한 뒤 배포된 Claude profile이 기존 Python model/profile updater에서 파싱되지 않는 회귀가 확인됐다. 이 추가 수정은 해당 소비자와 회귀 테스트의 소유권을 더하는 중대한 범위 수정이다. 소유 파일은 다음 두 개뿐이다.

- claude/skill/scripts/model_config.py
- tests/test_claude_payload.py

기존 T5-F 소유권과 generator 규칙은 유지한다. 변경된 배포 파일 checksum은 기존 소유 경로 MANIFEST.sha256에 generator로 반영한다. 새 최상위 task나 별도 구현 커밋은 만들지 않는다.

사용자가 이 추가 수정안을 승인한 뒤 Orchestrator가 이 문서를 저장하고, plan-only 커밋을 완료한 다음, 수정된 brief로 fresh Coder를 배정한다. 새 Coder는 현재의 미수락 T5-F 변경을 보존하며 두 추가 파일만 새로 소유한다. plan-only 커밋과 T5-F 구현 커밋은 분리한다.

### T5-F 추가 구현 목표와 수락 기준

최종 generated Claude specialist profile의 단일 managed hook을 Python model/profile 소비자가 parse, render, apply 및 검증할 수 있게 한다. 기존 T5-F 네 finding과 이 호환성 수정을 하나의 focused T5-F 구현 커밋으로 처리한다.

기존 public API와 반환 형식을 유지한다.

```python
parse_profile(content: bytes) -> dict
render_profile(content: bytes, settings: dict) -> bytes
apply_models(
    settings: dict,
    agents_dir: Path,
    *,
    check: bool = False,
    dry_run: bool = False,
) -> list[Path]
```

Finding 1의 추가 acceptance criteria:

- _profile()은 최종 profile의 단일 managed `PreToolUse` Bash 항목과 `onFailure: block`을 인식하고, 기존 검증된 `role-git-guard.mjs` command/path 확인을 유지한다.
- 다섯 generated specialist profile 모두 기존 name, tools, model, effort 검증을 통과한다. 호환성을 위해 provider 없는 wildcard `runtime-gate` hook을 다시 추가하지 않는다.
- `render_profile()`은 model과 effort만 바꾼다. 지원되는 비관리 frontmatter/hook, command 문자열, profile body와 LF/CRLF를 보존한다. 비관리 hook 허용 범위는 Node profile consumer의 기존 계약과 일치시킨다. 임의 YAML 지원이나 새 의존성은 추가하지 않는다.
- 중복 managed guard, 중복 hooks/`PreToolUse`, 잘못된 matcher/type/failure 동작, 위조 또는 잘못된 managed command/path는 `ValidationError`로 거부한다. 모호한 managed 블록을 비관리 데이터로 취급해 검증을 우회하지 않는다.
- 임시 복제 profile에서 `apply_models()` 적용 후 재parse와 `check`가 성공한다. `check`, `dry_run`의 무쓰기와 기존 transactional rollback 동작을 유지한다.
- 생성물은 generator로만 갱신하고 manifest parity를 확인한다. README.md는 변경하지 않는다.

### Python 회귀와 TDD

`tests/test_claude_payload.py`에 동등한 테스트가 이미 없다면 다음 회귀를 추가한다.

1. `test_generated_single_guard_profiles_parse_render_apply`: 실제 generated 다섯 profile로 parse → model/effort render → 임시 복제본 apply → 재parse/check를 검증한다. managed Bash guard 하나와 `onFailure: block`이 유지되고 runtime hook이 없음을 확인한다. 제품 코드 수정 전에 현재 생성 profile에서 실패하는 RED를 관측한다.
2. `test_single_guard_model_updates_preserve_unmanaged_content_and_line_endings`: 지원되는 비관리 frontmatter/hook, custom command, LF·CRLF를 검증하고 model/effort 외 byte 변경이 없는지 확인한다.
3. `test_single_guard_rejects_malformed_or_duplicate_managed_wiring`: acceptance criteria의 malformed/duplicate 변형을 거부하는지 확인한다.

회귀를 단순화해 현재 profile이 실패하지 않도록 fixture를 바꾸지 않는다. 최소 수정 후 동일 회귀의 GREEN과 전체 `test_claude_payload.py` 결과를 기록한다.

### 추가 검증

모든 명령의 작업 디렉터리는 선택된 worktree이며 Python fixture 쓰기는 `TemporaryDirectory` 안에 한정한다.

```text
python3 -B -m unittest discover -s tests -p 'test_claude_payload.py' -k test_generated_single_guard_profiles_parse_render_apply -v
python3 -B -m unittest discover -s tests -p 'test_claude_payload.py' -v
node --test tests/node/role-policy.test.mjs tests/node/profile-render.test.mjs tests/node/role-git-guard.test.mjs
node --test tests/node/runtime-evaluate.test.mjs tests/node/runtime-gate.test.mjs tests/node/runtime-store.test.mjs tests/node/runtime-schema.test.mjs
node --test tests/node/runtime-claude.test.mjs tests/node/runtime-codex.test.mjs
ARC_RUN_GIT_INTEGRATION=1 node --test tests/node/runtime-git.integration.test.mjs
npm run check:role-policy
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
git diff --check
```

기존 변경 .mjs 구문 검사도 유지한다. Git integration은 Orchestrator가 승인된 임시 repository에서 실행한다. 이번은 최종 Reviewer finding correction loop이므로 기존 QA 증거를 보존하고 QA를 재배정하지 않는다. 필수 검증 후 Coder → 같은 독립 Reviewer의 재확인을 거치며, unresolved finding은 Coder → Reviewer로 반복한다.

### 전체 suite 결과와 disposition

현재 관측 결과는 다음과 같다.

- 전체 `npm test` 실패: 21 failures, 2 skipped. 로그: `/tmp/arc-t5-final-npm-test.log`. package metadata, installer/transaction/targets/recovery, native artifact 및 PTY timeout 범주가 보고됐다.
- 전체 Python unittest: 224 tests, 11 failures, 6 errors. 이 중 6 errors와 3 failures는 수정 대상인 Claude profile consumer regression이다.
- 나머지 8개 Python doc-link subtest failures는 변경되지 않은 `docs/harness-operation.md`의 README anchor를 대상으로 한다. README 수정 금지를 유지하며 문서·링크·관련 테스트 수정은 이번 amendment에 포함하지 않는다.
- 검증 baseline이 없으므로 범위 밖 실패를 `preexisting`으로 분류하지 않는다. 전체 suite 성공이나 저장소 전체 검증 완료를 주장하지 않는다.

T5-F 수락 전에 Orchestrator는 범위 밖 전체 suite 실패의 disposition을 기록한다. 실패, 불확실성, 제외 범위를 명시하며 실패를 숨기거나 다른 소유 파일 수정으로 해결하지 않는다.

### 보류와 완료 gate

- 이 추가 소유권 승인과 plan-only 커밋이 없으면 두 파일 구현을 시작하지 않는다.
- 준비 상태·소유권 불일치, 추가 경로/의존성/계약 변경 필요, focused check 실패 또는 generator/manifest 불일치가 생기면 영향 범위의 수락을 보류하고 Orchestrator에게 반환한다.
- Python 소비자 오류가 남거나 범위 밖 suite failure disposition이 기록되지 않으면 T5-F를 수락하지 않는다.
- README 변경, T6/T7 복원, native provider/설치 통합 또는 enforcement 주장 확대가 필요하면 중단해 Orchestrator에게 반환한다.
- 필요한 검증, finding 재확인 및 disposition을 모두 검토한 뒤 Orchestrator가 명시적으로 T5-F를 수락하고 하나의 focused 구현 커밋을 만든다. SHA, 포함 경로, HEAD, index와 남은 변경을 확인한다.

이 amendment는 T6/T7을 다시 열지 않고 구현 acceptance나 전체 native runtime enforcement 완료를 선언하지 않는다.
