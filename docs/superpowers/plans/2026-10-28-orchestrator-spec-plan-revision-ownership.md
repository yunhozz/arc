# Spec·Plan 검토 후 수정 소유권 변경 구현 계획

- 상태: 사용자 승인 v3 (2026-10-28)
- 저장소: /Users/ma-24-007/.codex/worktrees/tui-preset-preview/arc
- 브랜치: feat/tui-preset-preview
- 기준 HEAD: 09886a81198a21056a3ffd2a0c3a40db0101bd78
- 승인 spec: docs/superpowers/specs/2026-10-28-orchestrator-spec-plan-revision-ownership.md (v2)
- 승인 spec SHA-256: 37e1a1e9ec118b8fd8c146da13ab45d18114044d0f22697e4832702f7e9b41b3
- 승인 근거: 사용자가 plan SHA-256 eb77e23ba6f220a5b36ef66cb6cb719c05ca83a71bd4ab0accfac70748574b7e를 승인하고 구현 시작을 요청함
- 승인 plan v3 SHA-256: 2391174d47483d98585b3efec302f9ba04c2a7cf0fa55165e41b251ad9dbf28c
- v3 승인 근거: 사용자가 2026-10-28 11:01 KST에 v3 범위·검증 수정안을 승인함.
- T1 원래 구현과 집중 QA는 v2 범위에서 수행 완료했다. v3 승인에 따른 `tests/node/plan.test.mjs` 기대값 수정은 아직 수행하지 않았다.

## 목표

Planner가 spec·plan 각각의 최초 초안을 작성하고, Orchestrator가 검토한 다음 같은 문서의 필요한 수정을 직접 반영하도록 Codex·Claude 지침과 canonical 정책을 일치시킨다.

## 범위와 역할 경계

- Canonical 정책에서 Planner의 최초 초안 소유권과 Orchestrator의 후속 문서 수정 소유권을 분리한다.
- Codex와 Claude의 설치 지침, Planner 프로필, planning·coordination 참조, global bootstrap과 runtime 정책 사본을 같은 계약으로 갱신한다.
- Reviewer는 계속 읽기 전용이다. Design·brainstorming 작성 흐름, Implementer의 코드 편집 경계, 사용자 승인 순서는 유지한다.
- 사용자 홈 설치 파일과 과거 완료 문서는 수정하지 않는다.
- 관리되는 정책 블록은 생성기로 갱신한다. 정책 schema와 기존 rule ID는 유지한다.

## v3 수정안: 공개 렌더링 기대값과 검토 순서

v2 전체 회귀는 기준과 같은 13개 실패를 보고했지만, `tests/node/plan.test.mjs`의 공개 렌더링 8개 사례에서 실제 출력 해시가 기준 기대값과 달라졌다. Planner 역할 지침과 bootstrap을 바꾸는 T1의 의도된 출력 변화다. 근거는 Node v22.21.0 / npm 10.9.4의 `/tmp/arc-orchestrator-spec-plan-revision-full-node22.log` (1,165건: 통과 1,140, 실패 13, 건너뜀 12)이며, 비교 기준은 `/tmp/arc-tui-worktree-model-config-final-node22.log`다. 회귀 검사를 유지하려면 승인 범위에 해당 테스트 파일을 추가하고, 변화가 확인된 여덟 해시만 갱신해야 한다. 사전 실패나 다른 snapshot은 바꾸지 않는다.

v2의 9단계는 Reviewer를 T1 수용·구현 커밋의 선행 검토로 두지만, ARC의 significant-plan 흐름은 fresh QA 후 T1 수용·커밋, 그 뒤 독립 Reviewer의 최종 전체 변경 검토를 요구한다 (`references/verification.md#risk-scaled-execution`). v3는 이 순서를 일치시키고, 최종 검토 finding은 Implementer → Reviewer 재검토로 해결한다.

v3 승인은 여덟 snapshot 기대값과 검토 순서 수정에 한정한다. 기대값 수정 및 추가 범위 검증은 fresh Implementer handoff 후 시작한다.

## 문서 흐름 계약

1. Planner가 준비된 입력으로 spec 또는 plan의 최초 완전한 초안 내용과 자체 검토 결과를 반환한다.
2. Orchestrator가 초안을 문서로 저장하고 검토한다.
3. 수정이 필요하면 Orchestrator가 같은 파일을 직접 고친다. 수정본을 작성하도록 Planner에게 돌려보내지 않는다.
4. 현재 사용자 승인 범위를 넘어서는 새 제품 결정이 필요하면 Orchestrator가 먼저 사용자에게 결정 사항을 묻고, 답을 받은 뒤 직접 수정한다.
5. 수정 완료 후 기존 사용자 승인 단계를 진행한다. 승인된 문서의 범위·수용 기준·방법·위험·필수 검증이 바뀌면 기존 재승인 규칙을 따른다.
6. 최초 Planner 초안이 없거나 호출에 실패해도 Orchestrator에게 최초 작성 권한이 생기지 않는다. 입력·대상·문맥 문제를 해결해 Planner 초안을 확보한다.
7. Planner 의견은 사실 확인이나 분석에 요청할 수 있지만, 같은 문서의 수정 초안 루프로 쓰지 않는다.

## 변경 파일과 책임

| 책임 | 파일 |
|---|---|
| Canonical role policy | lib/policy/role-policy.json |
| Global bootstrap 출력 | lib/installer/global-config.mjs |
| Generated role policy | codex/skill/SKILL.md, claude/skill/SKILL.md; 양쪽 references/planning.md; Codex·Claude Planner 프로필 |
| Manual role prose | 양쪽 references/coordination.md; Planner 프로필의 수동 preamble |
| Runtime policy copies | codex/skill/runtime/role-policy.json, claude/skill/runtime/role-policy.json |
| 계약 테스트 | tests/node/role-policy.test.mjs, tests/node/global-config.test.mjs |
| 공개 렌더링 회귀 기대값 | tests/node/plan.test.mjs |
| 계약 문구·보호 hash | tests/node/fixtures/instruction-contracts.json |
| Package manifest | MANIFEST.sha256 |
| 문서 기록 | 이 spec과 plan |

Generated role-policy section은 직접 편집하지 않는다. Canonical policy를 수정한 뒤 scripts/update-role-policy.mjs로 생성한다. Runtime 정책 사본은 scripts/update-runtime-assets.mjs로 갱신한다.

## 작업 단계

### 준비: 문서 승인과 기록

- [x] 승인된 spec v2와 이 plan의 최종 SHA-256 및 승인 근거를 확인한다.
- [x] 사용자에게 이 plan을 검토받고 승인한다.
- [x] spec·plan 문서만 포함한 문서 전용 커밋을 만든다. 소스 구현 변경을 이 커밋에 섞지 않는다.
- [x] 이 커밋 이후의 현재 branch, HEAD, worktree 상태를 Implementer brief에 기록한다.

### T1: 정책·지침·bootstrap 계약 변경

#### 1. 변경 전 검사

고정 Node v22.21.0 / npm 10.9.4에서 기존 집중 테스트와 생성기 상태를 기록한다. 의존성 설치, native build 또는 실행 환경 변경은 자동으로 하지 않고 중단 사유를 Orchestrator에게 전달한다.

~~~sh
node --test tests/node/role-policy.test.mjs tests/node/global-config.test.mjs tests/node/instruction-layout.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs
node scripts/update-role-policy.mjs --check
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs --check
~~~

#### 2. 새 계약 테스트를 먼저 작성한다

tests/node/role-policy.test.mjs에서 기존 policy()와 api.renderPolicySection을 사용해 Codex·Claude projection 모두를 확인한다.

- 최초 작성은 Planner, spec·plan 검토 후 수정은 Orchestrator다.
- 최초 초안 부재·실패는 Orchestrator에게 최초 작성 권한을 넘기지 않는다.
- 새 제품 결정은 사용자에게 연결하고, 결정 뒤 문서 수정은 Orchestrator가 한다.
- Planner의 저장·승인 권한, Design·brainstorming 경로, Reviewer 읽기 전용 경계는 확대되지 않는다.
- 수정 초안을 Planner에게 다시 요구하는 문구나 의무가 남지 않는다.

tests/node/global-config.test.mjs의 bootstrap 기대값도 같은 소유권을 검증한다. 기본 및 custom home 출력, managed block 갱신 때 사용자 바이트 보존도 유지한다.

#### 3. TDD RED를 기록한다

~~~sh
node --test tests/node/role-policy.test.mjs tests/node/global-config.test.mjs
~~~

기존 canonical policy와 bootstrap이 새 수정 소유권을 표현하지 않아 실패해야 한다. 환경·import·기존 assertion 실패는 새 계약의 RED로 기록하지 않는다.

#### 4. Canonical·manual source를 수정한다

lib/policy/role-policy.json의 role.orchestrator-boundary, role.planner-draft-only, planning.planner-brief를 수정한다. 최초 작성과 후속 수정 책임을 분리하고 spec·plan의 “수정 사항을 Planner에게 반환” 절차를 제거한다. Design·brainstorming 규칙은 별도로 보존한다.

양쪽 SKILL.md role gate, references/planning.md의 review/revision 절차, references/coordination.md 역할 표, Planner 프로필의 manual preamble을 같은 규칙으로 맞춘다. 기존 Markdown anchor와 다른 역할의 권한은 유지한다. lib/installer/global-config.mjs의 bootstrap 출력도 동일하게 바꾼다.

#### 5. Generated policy와 runtime copies를 재생성한다

~~~sh
node scripts/update-role-policy.mjs
node scripts/update-runtime-assets.mjs
~~~

생성 결과에 예기치 않은 파일이나 Reviewer·Implementer·QA의 권한 변경이 있으면 원인을 확인하고 구현을 보류한다.

#### 6. Contract fixtures와 manifest를 갱신한다

tests/node/fixtures/instruction-contracts.json에서 변경된 bootstrap 및 ownership/planning 문구와 실제 보호 파일 hash만 갱신한다. 변경된 보호 파일 hash에는 최소한 다음 파일이 포함된다.

- lib/policy/role-policy.json
- codex/skill/runtime/role-policy.json
- claude/skill/runtime/role-policy.json
- codex/agents/arc-planner.toml
- claude/agents/arc-planner.md

추가 hash가 바뀌면 실제 생성 diff와 fixture 소유 범위를 확인해 불필요한 기대값 변경을 포함하지 않는다.

v3 승인 후 `tests/node/plan.test.mjs`의 `renderingBaseline`에서 아래 여덟 키만 현재 T1 출력으로 갱신한다.

| key | v2 기대값 | 현재 T1 출력 |
|---|---|---|
| `codex:en:false` | `22b9ddc673ed99ae5a442c923ab1af7016e5cb53456546f7aaf6b45f1e2baa26` | `ba009696f6a00a30186931c01c38f6f40f0f70b9f46437dd4699c6d7447f218e` |
| `codex:en:true` | `66f23928b8567732b7b5f8fc8bf0b1aa62c8a13a1b3fc2eba3ef2e8e180d2643` | `1f5930191ae8e8927430c0cc80630d01cc9698b9d201865a766f1533a28bf563` |
| `codex:ko:false` | `040bec621e1a3f74e98cfec1ae5f6661528ee458bd7987302e5cf90ac4b95608` | `62b683442f91c27cf82fbc5d89876aba8cdb15f5512181159ffdb671d6238a01` |
| `codex:ko:true` | `9a2acc070801da1ef0678f9e8d2506518b0205d7a144c89fb7ac5ae4a1a4718c` | `ea8e873f20a74d43f656a1db28a560a1d408e792e44b709410e18eafb9b97ad4` |
| `claude:en:false` | `a2e67b675eb62095704ad6a8228a75cd93bce0b3cecf3bcf8aa47035212ee0a1` | `629314509326882fb072c0252d1fb48833637975a8052aecf3d4676d806487ac` |
| `claude:en:true` | `31be138ec7c5b812adfa85cbf6885004cd6266fe87a00ddd26ce48982134cabb` | `3fa8ca8c9f0c51c8fa4c832bbe629333acf7314cd927cf09f9b5e8718e52226d` |
| `claude:ko:false` | `87da229555d6e5b19ca4fdd3418c208382a3e5a1b78e89e75acdfc54ab6b00c3` | `cb54e6b3371f78c442c81c2fcefcdbfebd0fd8a8235c2d06f61d68de343f6581` |
| `claude:ko:true` | `fd14ab957cb9f3ff80b661f4c1a43c7ec3b7cb25d6bbde0cc6195d9b29d094a8` | `e6c16ee89f410726b066f9ef81c731cbfa9584d57c6ca0f46de7f57c6ead30c6` |

전체 회귀 기준에서 남은 다섯 실패는 snapshot 갱신 후에도 이름과 진단이 동일한지 확인한다.

- `packed temporary-HOME limit install, reinstall, drift selection and uninstall preserve native keys` — `Cannot read properties of undefined (reading 'PreToolUse')`
- `generated global upgrade preserves settings, reports partial failure, retries newer version and npx applies displayed latest version` — `0 !== 1`
- `staging populates acquired nested 0555/0500 directories before restoring metadata` — 임시 acquired nested payload의 `ENOENT`
- `failed acquired directory metadata verification retains originals before publication` — `Missing expected exception.`
- `Claude allowed external skill link becomes independent and rollback restores original literal link` — `false !== true`

~~~sh
node scripts/update-manifest.mjs
~~~

#### 7. 집중 GREEN과 정합성 검사를 통과한다

~~~sh
node --test tests/node/role-policy.test.mjs tests/node/global-config.test.mjs tests/node/instruction-layout.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-versions.test.mjs
node --test tests/node/plan.test.mjs
node scripts/update-role-policy.mjs --check
node scripts/update-runtime-assets.mjs --check
node scripts/update-manifest.mjs --check
git diff --check
~~~

모두 exit 0이어야 한다. fixture의 보호 hash는 실제 파일과 같고, 생성기 check는 drift를 보고하지 않아야 한다.

#### 8. 전체 회귀를 검증한다

~~~sh
npm test
~~~

기준은 승인된 기준 HEAD의 동일 브랜치 로그 /tmp/arc-tui-worktree-model-config-final-node22.log다. 해당 실행은 1,164건 중 1,139 통과, 13 실패, 12 건너뜀으로 기록됐다. 실패 수뿐 아니라 이름·진단과 이번 문서 수정의 연결을 비교한다. 변경된 Planner 지침이나 bootstrap이 출력 snapshot에 영향을 주었으면 기존 실패 이름만 보고 동일 결과로 판정하지 않는다.

승인된 여덟 renderingBaseline 키를 제외한 새 실패 또는 미분류 실패가 있으면 수용을 보류한다. v3 snapshot 수정은 변경된 T1 출력 여덟 값에만 한정하고, 다른 사전 실패·기대값·snapshot을 갱신하지 않는다. 이후 전체 suite에서는 기존 다섯 실패의 이름과 진단이 기준 로그와 같은지 확인한다.

#### 9. Fresh QA를 완료한다

QA는 최종 Codex·Claude 출력에 다음 시나리오를 대입해 담당 역할·행동·승인 경계를 보고한다.

- spec 초안의 실질적인 누락
- plan 초안의 수정 필요
- 최초 Planner 초안 부재 또는 호출 실패
- 승인 범위를 넘는 새 제품 결정
- Design·brainstorming 작성과 Reviewer 읽기 전용 작업

QA는 사용자 홈 파일을 수정하지 않는다. 변경된 범위가 추가되면 영향을 받는 시나리오와 테스트를 재검증한다.

#### 10. T1을 수용하고 구현 커밋을 만든다

수용 전제는 집중·생성 검사, 전체 회귀 분류, QA 결과와 구현 단계 finding recheck가 완료되는 것이다. Orchestrator가 spec의 수용 기준을 확인하고 role-policy 소스와 테스트 변경만 포함한 별도 구현 커밋을 만든다. Reviewer 검토는 이 커밋의 선행 조건이 아니다.

예시 메시지: feat(policy): spec·plan 검토 후 수정 소유권 전환

### 최종 Reviewer와 전체 완료

T1 수용·구현 커밋 뒤 독립 Reviewer가 승인 기준 HEAD부터 전체 변경을 한 번 검토한다. 검토 범위는 양 플랫폼·canonical/generated/bootstrap 일치, 역할 권한 과확대, 잔존 Planner 수정 루프, fixture/hash 변경 범위와 전체 테스트 회귀 분류다. Finding은 Implementer → Reviewer 재검토로 해결하며, 이 최종 계획 단계에서 QA를 다시 배정하지 않는다. Orchestrator는 모든 finding과 재검토를 확인한 뒤 전체 작업을 완료 처리한다.

## 보류 조건

Target/HEAD 불일치, 승인 범위를 넘는 결정, 예상 밖 생성물·보호 hash 변경, 환경 변경 필요, 새 또는 미분류 테스트 실패가 있으면 영향받는 구현과 수용을 보류하고 unblock 입력을 설명한다.

## Orchestrator 검토 메모

Planner 초안을 검토해 다음을 보완했다. Spec 승인 뒤 plan 초안 작성·승인을 분리하고, 문서 전용 준비 커밋과 구현 커밋을 구분했다. 승인 범위를 넘어서는 결정은 사용자 판단을 선행 조건으로 두었다. 또한 전체 테스트는 기준 로그와 실패 수가 아니라 실패별 진단으로 비교하고, Planner 수정 회차를 제거하되 최초 초안 책임은 유지하도록 명확히 했다. runtime-policy.test.mjs 등 존재하지 않는 테스트 이름은 포함하지 않았다.
