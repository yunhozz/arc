# 하네스 지침 문구 리팩토링 구현 계획

> 구현은 Coder가 맡고, QA가 검증한다. Orchestrator가 결과를 수락하고 집중 커밋하며, 전체 변경 수락 후 Reviewer가 독립 검토한다.

> **계획 버전:** 사용자 실행 대상 선택과 실제 checkout 준비 확인 이후 다시 작성한 검토본이다. 이 버전의 저장과 사용자 승인이 끝나기 전에는 Coder를 시작하지 않는다. 이전 계획 버전의 승인을 이 버전의 승인으로 간주하지 않는다.

## 목표

Codex와 Claude 하네스 지침의 문구를 간결하고 명확하게 정리하면서 기존 규칙의 의미와 운영 계약을 보존한다. 대문자 `MUST`, `MUST NOT`, `SHOULD`, `MAY`는 원문의 의무 강도와 일치할 때만 사용한다.

## 실행 대상 및 승인 범위

- 저장소: `/Users/yunho/Desktop/project/arc`
- 사용자가 지정한 현재 checkout을 실행 대상으로 한다. 별도 worktree를 만들거나 전환하지 않는다.
- 기준 branch: `chore/arc-runtime-gates`
- 사용자가 현재 checkout을 선택했을 때의 HEAD: `7b7419ca5d3f32b37b7dd50f275f1abd81eac645`
- 계획 저장 경로: `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-20-harness-instruction-copyedit.md`
- 사용자는 원래 문서 범위에 생성 정책 블록의 정본 포함을 선택했고, 문체 기준을 추가했다.
- 사용자는 기존 계획 버전의 범위, 전체 문구 점검, 문체 기준과 계획된 검증을 승인했다. 이후 현재 checkout을 실행 대상으로 선택했다. 선택 당시 실제 workspace·branch·HEAD·변경 상태를 확인한 뒤 계획 문서를 준비 커밋했다.
- 준비 커밋: `23bbdbb19624a6a9c870c3764c4e66bfa695bf05` (`docs(harness): add instruction copyedit plan`).
- 이번 검토본 작성 직전 확인: branch `chore/arc-runtime-gates`, HEAD `23bbdbb19624a6a9c870c3764c4e66bfa695bf05`, working tree clean, staged·unstaged·untracked 변경 없음. 실행 범위 파일의 소유권 충돌도 관찰되지 않았다.
- 이전 계획은 사용자 실행 대상 선택 전에 작성·승인됐다. 따라서 그 승인으로 이번 검토본이나 Coder handoff의 선행 조건을 충족했다고 보지 않는다. 이 검토본은 선택된 현재 checkout과 실제 준비 상태를 반영한 뒤 저장하며, 저장된 이 버전을 사용자가 승인해야 Coder를 시작할 수 있다.

별도 design 문서와 written spec은 작성하지 않는다. 이번 작업은 하네스 동작을 바꾸지 않는 문서 문구 정리다. 기존 non-behavior documentation 경로에 따라 별도 design/spec 단계를 생략하고, 의존성과 검증 기준을 이 단일 작업 계획에 기록한다.

## 범위

1. `codex/agents/`, `codex/skill/`, `claude/agents/`, `claude/skill/` 아래의 모든 `.md` 및 `.toml` 파일을 재귀적으로 점검한다. 경로 요소에 `superpowers` 디렉터리가 있으면 제외한다. 현재 후보는 Codex 16개, Claude 15개다. 명확한 문구는 그대로 둘 수 있다.
2. 정본인 `lib/policy/role-policy.json`에서 자연어 정책 문구만 정리하고, 기존 `npm run update:role-policy`로 관리 블록을 재생성한다.
3. payload 변경에 맞춰 `MANIFEST.sha256`을 갱신한다. 두 플랫폼의 모델 TOML은 manifest mutable 예외이므로 새 해시 항목을 추가하지 않는다.

정책 생성은 23개 출력을 다룬다. 요청 범위의 텍스트 출력 22개만 변경될 수 있다. 범위 밖 `claude/skill/hooks/git-policy.json`은 내용이 그대로여야 한다. 정본 정책 문구는 향후 설치 bootstrap 지침에도 반영되므로 기존 렌더링 계약도 확인하되 `lib/installer/global-config.mjs`는 수정하지 않는다.

## 보존 기준

- 역할, 책임, 권한, 금지, 지침 우선순위, 승인·중단·재개 조건, 검증·리뷰 게이트, 라우팅, 임계값, 예외, 전제조건, 결과 의무 및 논리 관계를 보존한다.
- `must`, `should`, `may`, `only`, `unless`, `before`, `after`의 규범 강도와 범위를 강화하거나 약화하지 않는다.
- 플랫폼별 고유 동작과 문서에서의 계약 위치·순서를 보존한다. 반복된다는 이유만으로 지침을 삭제·이동·통합하지 않는다.
- 식별자, 경로, 명령, 도구 이름, 리터럴 및 기존 테스트가 확인하는 제목·표현 앵커를 보존한다.
- TOML의 테이블 구조, 타입, 설정 값을 그대로 둔다. `models.toml`은 주석 문구만 수정하며 model·effort·preset 값은 동일해야 한다.
- 정책 JSON은 자연어 정책 문자열만 수정한다. 키, 스키마, 정책 ID, 대상, 배열 순서, 비문구 값은 보존한다.
- 해석이 필요한 모호성이나 기존 충돌은 임의로 해결하지 않고 해당 문구를 보류해 보고한다.
- 문구 변경만으로 모델 행동의 완전한 동일성을 기계적으로 증명할 수 있다고 주장하지 않는다.

## 제외 범위

- Codex·Claude `superpowers` 런타임 번들 및 그 내용
- installer/bootstrap 코드, 렌더러 코드, 테스트 코드
- README, `docs/harness-operation.md`, 기존 설계·계획 문서
- 역할 정책의 비문구 데이터, 모델·effort·preset 설정, 플랫폼 기능 차이
- 새 지침, 새 테스트, 검사 완화 및 동작 변경

기존 `docs/superpowers` 설계·계획 초안은 승인 연속성 동작 변경을 포함해 이 요청보다 범위가 넓다. 이번 계획의 근거나 승인으로 사용하지 않으며 수정하지 않는다.

## TASK-01: 하네스 지침 문구 전체 점검 및 의미 보존 리팩토링

- **구현 목표:** 범위에 포함된 모든 지침 문구를 점검하고, 기존 계약의 의미와 의무 강도를 보존하면서 문장을 간결하고 명확하게 다듬는다.
- **선행 구현 작업:** 없음. 계획 승인과 실행 대상 준비는 구현 착수 조건이다.
- **Coder 소유 파일:** `/Users/yunho/Desktop/project/arc`를 기준으로 `codex/agents/`, `codex/skill/`, `claude/agents/`, `claude/skill/` 아래 승인 범위의 `.md`·`.toml`, `lib/policy/role-policy.json`, 승인된 정책 생성 텍스트 출력과 `MANIFEST.sha256`. `superpowers` 경로와 나머지 제외 범위는 소유 대상에 포함하지 않는다. 관리 블록은 정본 수정 후 생성한다.
- **작업 경계:** 문구 수정, 정책 생성과 manifest 갱신을 하나의 구현 작업으로 수행한다. 아래 구현 단계는 별도 작업이나 커밋 단위가 아니다.
- **수락 전 검사·QA:** 아래 필수 검사를 기준 상태와 구현 완료 상태에 적용한다. Coder 보고 후 fresh QA가 최종 상태를 검증하고, 실패는 Coder 수정 후 QA 재확인 순서로 처리한다. 종료 코드, 변경 범위, 의미 보존 대응과 설정·생성물 보존 근거를 제출한다.
- **수락 기준:** 아래 수락 기준 전체를 이 작업에 적용한다. Orchestrator가 근거와 미해결 사항을 확인하고 수락한 뒤 하나의 집중 구현 커밋을 만든다.
- **보류 조건:** 아래 보류 조건 중 하나라도 충족되면 영향받는 작업을 중단하고 Orchestrator에 보고한다.
- **최종 전체 검토:** 필수 검사·QA와 Orchestrator 수락·집중 커밋이 완료된 뒤 Reviewer가 최종 전체 변경을 한 번 독립 검토한다. Reviewer는 작업 수락 전 필수 게이트가 아니다. 최종 검토 지적은 Coder 수정 후 Reviewer 재확인으로 처리하며, 이 단계에서는 QA를 재배정하지 않는다.

## 작업 의존성 및 소유권

공유 계약과 생성·manifest 관계 때문에 구현은 단일 작업으로 수행한다. 종속 순서는 다음과 같다.

`검토본 저장·사용자 승인 → handoff 기록 및 실행 상태 재확인 → 기준 검사 → 직접 작성 문구 및 정책 정본 수정 → 정책 출력 생성 → manifest 갱신 → 검사 → QA → 수락·집중 커밋 → 최종 Reviewer`

Coder 한 명이 위의 플랫폼 파일, `lib/policy/role-policy.json`, 생성 출력과 `MANIFEST.sha256`을 소유한다. 같은 파일의 병렬 편집은 하지 않는다. Orchestrator가 계획 문서를 저장하고 Git 변경을 맡는다. QA와 Reviewer는 제품 파일을 수정하지 않는다.

## 구현 순서

1. Orchestrator가 이 검토본을 계획 저장 경로에 저장하고 사용자 승인을 받는다. 수정된 계획 버전의 승인이 확인되기 전에는 Coder를 시작하지 않는다.
2. Orchestrator가 handoff 기록을 작성하고 현재 checkout의 HEAD, branch, 변경 상태, 소유권, 승인된 계획 문서의 SHA·메시지·포함 경로·내용을 재확인한다. 계획 문서 커밋으로 HEAD가 바뀌면 실제 새 HEAD를 기록한다.
3. Coder가 handoff의 HEAD, branch, 변경 상태, 소유권과 정확한 대상 목록을 확인한다. 수정 전에 필수 검사로 기준 결과를 남긴다. 기존 실패가 있으면 영향 범위를 보고하고 해당 작업을 보류한다.
4. 각 문구를 주체, 의무 강도, 조건, 예외, 시점, 적용 범위와 결과 의무 기준으로 원문과 대응한다. 불확실하거나 충돌하는 표현은 수정하지 않는다.
5. 관리 블록 외 문구는 소유 파일에서 수정하고, 관리 블록은 정본 JSON에서만 수정한다. 생성 파일을 수동으로 덮어쓰지 않는다. 테스트 코드, installer 및 bootstrap 구현은 수정하지 않는다.
6. `npm run update:role-policy`를 실행한다. 변경 diff가 승인된 자연어 정책 문구와 대상 출력으로 한정되는지 확인한다. `claude/skill/hooks/git-policy.json`, 생성 표식, `superpowers` 경로 또는 다른 범위 밖 출력이 바뀌면 보류한다.
7. `node scripts/update-manifest.mjs`로 보호 payload의 manifest를 갱신하고, 변경 경로가 실제 승인 변경과 일치하는지 확인한다.
8. Coder가 필수 검사를 실행하고 변경 파일, 전체 후보 문구 점검 결과, 주요 원문·수정문 대응, 보류 문구, 결과 및 한계를 보고한다. 기존 테스트 앵커를 지키기 위해 계약 의미를 훼손하지 않는다.
9. fresh QA가 최종 상태에서 필수 검사를 재실행한다. 실패는 Coder 수정 후 QA가 재확인한다. Orchestrator가 수락하고 단일 구현 커밋을 만든다.
10. 구현 수락 후 Reviewer가 전체 최종 diff를 한 번 독립 검토한다. 최종 Reviewer 지적은 Coder 수정 후 Reviewer가 재확인한다.

## 필수 검사

저장소 루트에서 기준 상태와 최종 상태에 적용한다.

```sh
npm run check:role-policy
npm run check:manifest
node --test tests/node/role-policy.test.mjs tests/node/manifest.test.mjs tests/node/global-config.test.mjs tests/node/profile-render.test.mjs
python3 -B -m unittest discover -s tests -p test_arc_policy.py
python3 -B -m unittest discover -s tests -p test_harness_contract.py
python3 -B -m unittest discover -s tests -p test_claude_payload.py
python3 -B -m unittest discover -s tests -p test_codex_models.py
git diff --check
```

모든 명령은 종료 코드 0이어야 한다. 생성 정책은 최신 상태이고 manifest는 실제 payload와 일치해야 한다. 테스트 파일을 수정하거나 완화해 통과시키지 않는다. 두 `models.toml`의 model·effort·preset 값, TOML 구조 및 정책 JSON의 비문구 값이 기준과 같은지 diff 및 관련 기존 검사로 확인한다. QA 자료는 승인된 임시 위치에서만 만들고 검증 후 정리하며 실제 전역 설치를 수행하지 않는다.

## 수락 기준

1. 이 계획 검토본이 실행 전에 저장되고 사용자가 승인했으며, handoff 증거가 해당 승인 버전과 실제 checkout 상태를 일치시킨다.
2. 변경 파일·필드가 승인된 범위 안에 있고, 계획 문서 외의 문서·코드·테스트가 수정되지 않았다.
3. 규칙의 의미, 강도, 조건, 범위, 예외, 순서, 플랫폼 차이와 결과 의무가 보존됐다.
4. 생성 출력은 정본과 일치하고, 범위 밖 hook JSON 및 `superpowers` 런타임 번들은 변하지 않았다.
5. TOML 구조와 실행 설정, 정책 JSON의 스키마·비문구 값은 기준과 같다.
6. 필수 검사가 통과했고 QA의 기준별 판정과 근거가 제출됐다.
7. 모호하거나 충돌하는 문구는 임의 해석 없이 보류·보고됐다.
8. Orchestrator가 전체 근거와 남은 미검증 범위를 확인하고 수락했다.

## 보류 조건

- 이 검토본이 저장·승인되지 않았거나 승인 버전과 handoff 기록의 버전이 다르다.
- handoff 시 실제 branch·HEAD·변경 상태·소유권이 준비 기록과 다르다.
- 축약 또는 강조 표현이 계약 해석을 새로 요구하거나 강도를 바꾼다.
- 기존 테스트 앵커를 바꾸거나 테스트·코드·설정·제외 경로를 수정해야 한다.
- 생성 결과가 승인 문구 범위를 벗어나거나 hook JSON이 달라진다.
- 필수 검사가 실패하거나 실패의 기준 상태 여부를 판정할 수 없다.

영향받는 작업은 중단하고 근거와 필요한 결정을 Orchestrator에 보고한다.

## 완료 보고

Orchestrator는 최종 커밋 SHA, HEAD, 포함 파일, 남은 변경, 검사·QA·Reviewer 결과, 보류 문구 및 모델 행동의 완전한 동일성을 증명할 수 없는 한계를 보고한다. push·merge·배포·게시·실제 전역 설치는 수행하지 않는다.

**권장 커밋 메시지:** `refactor(harness): 지침 문구 간결화`
