# 설정된 Orchestrator 서브에이전트 중심 ARC 실행 설계

**개정:** v2 (2026-11-01; 사용자 승인에 따라 TDD 및 테스트 검증 범위 반영)
**작업 대상:** `/Users/yunho/.codex/worktrees/arc-orchestrator-subagent-presets/arc`
**기준:** `feat/orchestrator-subagent-presets` at `8c88952e9c0178fdb07ad521a51b6620e08503ea`

## 1. 목적과 승인된 변경

실질적인 ARC 작업은 사용자가 선택한 preset의 모델과 추론 강도로 실행되는 native `arc_orchestrator`가 조정한다. 대화의 host/root는 사용자와 소통하고 승인 질문과 답변을 중계한다. `arc_orchestrator`는 ARC specialist를 부르고, 의존성과 검증을 관리하며, 기존 ARC 규칙에 따른 specialist 결과 acceptance와 허용된 local Git 변경을 맡는다.

간단하고 독립적인 질문은 host가 대화 모델로 직접 처리할 수 있다. 실질적인 연구·분석·구현·설정·계획 작업은 host가 설정된 `arc_orchestrator`에 전달한다. host는 specialist를 직접 호출하지 않는다.

Codex와 Claude Code 모두에서 Orchestrator를 모델 설정, 설치·업데이트, Custom 편집 경로에 추가한다. Preset preview의 중앙에는 host의 대화 모델이 아니라 선택된 `arc_orchestrator`와 그 모델·effort를 표시한다.

## 2. 역할 트리와 권한 경계

```text
host/root 대화 (ARC 역할 트리 밖; 사용자 소통·승인 relay)
└── arc_orchestrator (ARC depth 1; 실제 coordinator)
    ├── arc_scouter (depth 2)
    ├── arc_planner (depth 2)
    ├── arc_implementer (depth 2)
    ├── arc_qa (depth 2)
    └── arc_reviewer (depth 2)
```

ARC depth는 역할·보고 정책을 뜻하며 모든 native runtime에서 동일하게 강제된다는 뜻은 아니다.

| 주체 | 책임 |
|---|---|
| host/root | 사용자 입력과 유효한 승인 수신, `arc_orchestrator` 최초 호출, 질문·승인 요청을 사용자에게 전달하고 답변을 coordinator에 중계, 최종 결과 전달 |
| `arc_orchestrator` | 실질 ARC 작업 조정, 범위·준비 확인, Planner·Scouter·Implementer·QA·Reviewer 생성 및 조정, 검증·acceptance, 기존 규칙상 허용된 local Git 변경 |
| depth 2 specialist | 할당된 역할·범위의 작업 후 `arc_orchestrator`에 직접 보고; 재위임 및 Git mutation 금지 |

host가 사용자에게 결과를 전달하는 것과 ARC acceptance는 구분한다. acceptance와 내부 작업 완료의 소유자는 `arc_orchestrator`다. 사용자 승인 질문은 coordinator가 host에 반환하고 host가 묻는다. 무응답이나 질문 전달은 승인으로 보지 않는다. 유효한 승인은 범위가 바뀌지 않으면 재사용한다.

기존 역할 경계를 유지한다. Planner만 디자인·최초 spec·최초 plan을 초안 작성하고, Implementer가 승인된 구현 범위를 수정한다. Orchestrator의 직접 구현은 기존 small-task direct path에만 허용한다. 외부 메시지, push, merge, deploy, publish는 기존처럼 해당 작업과 대상에 대한 명시적 사용자 승인이 필요하다. 필요한 native 역할 호출이 불가능하면 host로 우회하거나 다른 모델을 쓰지 않고 영향받는 작업을 중단해 보고한다.

## 3. Native profile과 정책 생성

설정 키는 `arc_orchestrator`다. Codex profile은 `codex/agents/arc-orchestrator.toml`, Claude Code profile은 `claude/agents/arc-orchestrator.md`에 둔다. 기존 다섯 역할의 상대 순서와 파일 이름 규칙을 유지한다.

Claude profile은 specialist를 생성할 수 있도록 `Agent` 도구를 허용하고, coordinator의 기존 준비·문서·Git 작업에 필요한 `Read`, `Grep`, `Glob`, `Bash`, `Write`, `Edit` 도구를 허용한다. Codex profile은 native multi-agent 도구를 사용한다. profile 권한은 승인된 범위·기존 ARC 역할 규칙을 확대하지 않는다.

Orchestrator가 더는 advisor-only profile이 아니므로 canonical policy에서 제외하지 않는다. `lib/policy/role-policy.json`에 host의 사용자 승인 relay와 coordinator의 specialist·acceptance·Git 소유권을 명시하고, `lib/policy/render.mjs` 및 `scripts/update-role-policy.mjs` 경로로 양 플랫폼의 Orchestrator profile에도 관리되는 policy block을 생성한다. host가 읽는 두 플랫폼 `SKILL.md`에도 같은 계약을 반영한다. 수동으로 복제한 역할 규칙은 생성된 block과 중복시키지 않는다.

실질 작업은 configured coordinator를 명시적으로 호출하도록 Codex·Claude ARC skill routing을 바꾼다. coordinator가 반환한 사용자 결정 요청은 host가 중계하고, 답변을 같은 작업 brief에 반영해 coordinator가 이어서 수행한다. 실행 중인 agent의 모델·부모 관계는 프로필 업데이트로 변경하지 않는다.

## 4. Model preset과 Custom

기존 다섯 specialist의 모델 설정은 유지한다. 새 Orchestrator 역할의 세 preset은 다음과 같다.

| 플랫폼 | economy | balanced | smart |
|---|---|---|---|
| Codex | `gpt-6-luna` / `max` | `gpt-6-luna` / `max` | `gpt-6-luna` / `max` |
| Claude Code | `claude-haiku-5-5` / `max` | `claude-haiku-5-5` / `max` | `claude-haiku-5-5` / `max` |

Codex effort key는 `model_reasoning_effort`, Claude key는 `effort`다. canonical default는 두 platform `skill/models.toml`이다. 이 값과 상충하는 별도 migration 기본 상수를 만들지 않는다. 사용자 계정의 접근 가능 여부를 보장하는 문구를 추가하지 않으며, 사용 불가능한 값에 임의 대체를 하지 않는다.

Custom에서는 `arc_orchestrator`를 다른 역할처럼 별도로 선택·편집·저장·복원할 수 있다. legacy Custom에 새 역할을 추가할 때는 canonical balanced Orchestrator 값을 사용한다.

모델 ID와 effort 지원은 공식 문서 기준으로 고정한다: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview), [Claude effort levels](https://platform.claude.com/docs/en/build-with-claude/effort).

## 5. Schema와 legacy 설정 migration

새 canonical `models.toml`과 serializer 출력은 schema v3이며 정확히 여섯 역할을 요구한다. 각 역할은 `economy`, `balanced`, `smart`를 가져야 한다. `custom`이 있으면 역할 집합이 정확히 여섯 개여야 하고, preset이 `custom`이면 유효한 Custom 값이 있어야 한다. 기존 타입·필드·문자열·platform 검증을 유지한다.

JavaScript 설정 loader는 기존 v1/v2 five-role 파일을 엄격히 검증한 뒤 내부 v3 shape로 정규화한다. 기존 다섯 역할의 모든 preset 및 Custom 값은 보존하고, 신규 Orchestrator preset은 해당 실행 버전의 canonical `models.toml`에서 가져온다. v1/v2에 합법적으로 완전한 여섯 역할이 이미 있으면 사용자 값도 보존한다. 상태 조회는 파일을 쓰지 않는다. 신규 모델 기본값을 검증된 package payload에서 구할 수 없으면 추측하지 않고 중단한다.

Python `apply-models.py` 경로는 v3 여섯 역할 config를 읽는다. 이전 파일 또는 신규 profile이 없는 설치에 직접 적용하려는 요청은 쓰기 전 `Install / Update first`로 실패한다. Legacy 자동 migration의 유일한 경로는 installer/update가 제공하는 canonical defaults를 사용하는 JavaScript management flow다.

## 6. 기존 설치와 update 경계

`target.profileNames`가 여섯 profile을 기대하더라도 기존 설치의 `arc-orchestrator` 부재만으로 legacy 설정을 일반 incomplete로 판단하지 않는다. 유효한 기존 five-role model config와 기존 다섯 profile이 함께 있으면 legacy 설치로 인식해 설정을 보존하고 `Version Upgrade` 또는 `Install / Update`에서 새 profile과 v3 config를 만든다. 다섯 기존 profile의 누락이나 다른 손상은 기존 오류로 처리한다. v3 config인데 Orchestrator profile이 없으면 incomplete다.

Orchestrator profile이 아직 없는 legacy 설치에서 `Change Preset` 또는 Custom 저장을 선택하면 쓰기 전에 `Install / Update first`를 알린다. preset 변경 경로가 자체적으로 install lifecycle을 수행하지 않는다. 모든 profile이 있는 legacy config는 기존 transaction에서 migration할 수 있다. 기존 snapshot, symlink, identity, rollback, managed path 검증은 완화하지 않는다.

## 7. TUI와 문서

TUI Custom 목록에 Orchestrator를 포함한다. Preset diagram은 기존 전문가 배치를 유지하고 중앙을 설정된 `arc_orchestrator`로 바꾼다. 중앙 항목은 역할명이 subagent임을 구별하고 현재 preset/Custom의 모델·effort를 표시한다. Custom에서 중앙 역할 focus와 선택 모델 항목이 일치해야 한다. 화면이 좁거나 모델 ID가 길 때는 기존 compact·크기 안내 규칙을 사용하고 선택 인덱스를 역할 key에 연결해 고정 5-role index 오류를 없앤다.

README, 양 플랫폼 `SKILL.md`, `references/coordination.md`, `references/limits.md`, `references/handoff.md`, `docs/harness-operation.md`와 `docs/images/role-flow.svg`에서 root host와 configured coordinator를 구분한다. 기존 “Orchestrator uses the current conversation model” 설명과 “five roles” 표현은 새 경계에 맞게 고친다.

## 8. Capacity와 native nesting 한계

host는 ARC 역할 tree 밖이므로 ARC 생성 수에 포함하지 않는다. 실제 생성된 `arc_orchestrator`는 다른 descendant와 같이 누적 생성 및 active concurrency에 포함한다. 신규 설치 기본값은 `max_total_subagents = 100`, `max_concurrent_subagents = 10`이다. coordinator가 실행 중일 때 나머지 slot은 최대 아홉 개다. 기존 설치에서 사용자가 설정한 limits 값은 그대로 보존한다. coordinator와 specialist가 동시에 필요한 작업은 최소 두 개의 active slot을 확보해야 한다. capacity가 부족하면 작업 전에 구체적인 필요 수를 알리고 생성을 보류한다. root가 역할을 대신하거나 한도를 자동으로 올리지 않는다.

Codex `[agents].max_depth`는 V1 agent threads에만 적용되고 V2에서 무시되므로 이번 변경에서 기존 native 값을 바꾸거나 보편적인 depth 보장으로 설명하지 않는다. [공식 Codex schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json). Claude Code는 nested delegation을 지원하고 subagent profile에 `Agent` 도구가 필요하다. [공식 Claude subagent 문서](https://code.claude.com/docs/en/sub-agents). ARC depth 1/2와 capacity ledger는 prompt policy다. 사용자의 runtime 설정이 nested 호출을 막으면 해당 작업을 중단·보고한다.

## 9. Scope와 수용 기준

구현은 한 개의 결합된 top-level task로 묶는다. 주요 범위는 다음과 같다.

- `lib/models/config.mjs`, `lib/models/profiles.mjs`, 기존 model export, 양 플랫폼 Python model scripts
- 양 플랫폼 `skill/models.toml`, 새 native Orchestrator profiles, `lib/installer/targets.mjs`
- legacy 인식/정규화를 위한 `lib/management/status.mjs`, `lib/installer/upgrade-state.mjs`, `lib/installer/upgrade.mjs`, `lib/installer/plan.mjs`, `lib/installer/preset.mjs`
- `lib/tui/custom-preset.mjs`, `lib/tui/setup.mjs`
- `lib/policy/role-policy.json`, `lib/policy/render.mjs`, 생성되는 policy blocks
- README, 양 플랫폼 skill/reference 문서, `docs/harness-operation.md`, `docs/images/role-flow.svg`
- 신규 limits 기본값과 안내를 위해 `lib/limits.mjs`, `lib/tui/setup.mjs`, 양 플랫폼 `references/limits.md` 갱신
- TDD에 필요한 기존 test expectation/fixture를 갱신하거나 behavioral test/case를 추가하고, `scripts/update-manifest.mjs`로 `MANIFEST.sha256` 갱신

새 test framework/dependency, install lifecycle 재설계, Codex depth 설정의 일괄 변경은 제외한다. 기존 five-role legacy test fixtures를 무조건 여섯 역할로 치환하지 않는다.

수용 기준:

1. 양 플랫폼 profile discovery, model validator/renderer, Python apply 경로와 설치가 여섯 역할을 일관되게 연결한다.
2. Orchestrator 세 preset이 요청된 정확한 model ID와 `max` effort를 사용하고 다른 역할 설정을 보존한다.
3. Custom에서 Orchestrator를 편집·저장·재로드할 수 있다.
4. TUI 중앙은 실제 coordinator 설정을 보여 주고 focus가 올바른 role key에 매핑된다.
5. 실질 ARC 작업은 host가 configured coordinator에 전달하고 host가 사용자 결정·승인을 relay한다.
6. coordinator 권한이 generated canonical policy와 native profiles에 반영되고 specialists의 depth-2·비위임·Git 금지가 보존된다.
7. v1/v2 five-role 설치의 모든 기존 설정을 보존해 update할 수 있으며, 새 profile 없는 preset write는 사전에 거부된다.
8. coordinator와 descendants가 total/concurrent ledger에 반영되고 native nesting 제한을 넘을 때 우회 없이 중단한다.
9. 신규 설치와 미설정 TUI 기본값은 total `100`, concurrent `10`이고, 기존 explicit limits 값은 보존한다.
10. README, skill/reference, operation guide, role-flow diagram, existing expectations 및 manifest가 일치한다.

## 10. 검증 한계

사용자는 2026-11-01에 TDD 및 테스트 추가·실행을 승인했다. 각 behavior change마다 failing test를 먼저 작성·실행하고, 그 실패를 확인한 뒤 최소 구현을 수행해 focused test를 통과시킨다. 구현이 끝나면 전체 Node suite (`npm test`)와 Python suite (`python3 -m unittest discover -s tests -p 'test_*.py'`)를 실행한다. Fresh QA는 관련 테스트와 전체 suite를 독립적으로 실행하고, config, profiles, migration 경로, managed policy 생성, 역할·권한 문서도 검토한다. 실제 UI/key 입력, model provider 적용, native nested execution은 실행 검증되지 않으며 최종 보고에 그 한계를 기록한다. 테스트 또는 static 기준의 미해결 finding이 있으면 관련 acceptance를 보류한다.

**자체 검토:** 사용자 승인된 automatic routing과 host approval relay를 반영했다. advisor-only 제한은 제거하고 coordinator 권한을 generated policy에 연결하도록 수정했다. legacy migration은 installer/update 경로로 한정하고 Python apply는 안전한 update boundary를 갖는다. Codex V2의 depth 제한 미보장, Claude `Agent` 권한, coordinator slot 비용을 명시했다. 사용자의 TDD 승인에 맞춰 verification 기준을 수정했으며, 이 개정 spec과 개정 plan의 written approval 후 구현한다.
