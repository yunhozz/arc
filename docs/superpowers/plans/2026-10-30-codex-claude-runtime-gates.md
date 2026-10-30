# Codex·Claude Code 네이티브 런타임 통제 구현 계획

> **실행 역할:** Implementer가 지정 파일을 수정하고 QA가 필수 검증·재검증을 수행한다. Orchestrator가 수용 후 작업별 focused commit을 만든다. 전체 구현 뒤 독립 Reviewer가 변경 전체를 검토한다. 체크박스는 진행 표시이며 Specialist는 Git 상태를 변경하지 않는다.

**목표:** ARC 설치기가 Codex·Claude Code 훅을 자동 등록·검증·정리한다. Codex는 진단 전용 callback을 제공하고, Claude Code는 검증된 binding 기반 gate를 제공한다.

**구조:** 설치 계층이 설정 병합·소유권·transaction을 관리한다. Codex entry point는 정책 판정을 호출하지 않는다. Claude entry point는 고정 resolver로 검증된 실행 문맥을 구성한 뒤 기존 공통 gate를 호출하고, 연결되지 않은 호출을 거부한다. 등록·trust·callback·거부 적용 증거는 분리한다.

**기술:** Node.js >=22, ESM, 기존 vendored TOML parser, Node test runner, 기존 safe-fs 및 transaction.

**승인 명세:** [2026-10-30-codex-claude-runtime-gates-design.md](../specs/2026-10-30-codex-claude-runtime-gates-design.md)

**저장소:** /Users/ma-24-007/Desktop/workspace/arc<br>
**브랜치:** feat/codex-claude-runtime-gates<br>
**기준 HEAD:** 8c88952e9c0178fdb07ad521a51b6620e08503ea

상태: 사용자 승인 명세에 따른 계획 초안. 별도 계획 승인을 받기 전 구현을 시작하지 않는다.

## 1. 전역 제약과 결정

- 현재 변경은 승인 명세와 이 계획뿐이다. 코드·테스트 파일은 아직 바뀌지 않았다.
- 저장소 구현·fixture 검증 중 현재 사용자의 Codex/Claude 설정을 수정하지 않는다. 설치·제거와 실제 호스트 검증은 격리 fixture/환경에서만 수행한다.
- 다른 사용자 훅과 순서를 보존하고, 소유권을 확인한 ARC 항목만 갱신·제거한다.
- Codex exact-definition trust와 Claude workspace trust를 우회하지 않는다.
- 설정 등록 성공을 trust·callback·실행 차단 성공으로 표시하지 않는다.
- 설치 프로세스 PATH에서 실제 선택한 CLI 경로와 버전을 함께 검출·기록한다. 현재 로그인 셸의 Claude Code는 2.1.314이고, 고정 경로 /Users/ma-24-007/.local/bin/claude의 2.1.266을 활성 버전으로 간주하지 않는다.
- Claude <2.1.295에서는 onFailure: "block"을 설정하지 않고 hook failure 차단을 보장하지 않는다. CLI를 자동 업그레이드하지 않는다.
- **Codex:** 훅을 자동 등록하되 진단 전용으로 유지한다. native entry point는 ARC allow/deny, 권한·lease 변경, 정책 적용 또는 spawn 권한 판정을 수행·주장하지 않는다. 호출자 식별 한계가 해결되기 전까지 Codex native enforcement는 미지원이다.
- Codex 진단은 최소 운영 메타데이터만 저장한다. raw tool_input, prompt/transcript, 환경 변수, 전체 hook payload는 durable 기록에 저장하지 않는다.
- **Claude Code:** 검증된 session → workflow → actor/task/active lease binding이 없는 전역 PreToolUse 호출은 유효한 deny로 거부한다. ARC 외부 세션과 binding 준비 전 호출도 포함한다.
- cooperative/operator-attested 기록, prompt 역할 문자열, transcript 경로만으로 provider-verified 권한을 만들지 않는다.
- SubagentStart는 관찰이며 spawn 차단이 아니다.
- 작업 단위 하나를 Orchestrator가 수용한 뒤 focused commit 하나로 남긴다. 생성물·manifest는 원본을 변경하는 작업에 포함한다.
- push·배포·실제 사용자 설정 설치는 승인 범위에 포함하지 않는다.

최신 Codex 선택은 앞서 검토한 미식별 자식 호출 거부를 대체한다. Codex는 hook을 등록하지만 현재 root/child 호출을 구분할 근거가 없어 진단만 수행한다. 플랫폼별 수용 기준은 다음과 같다.

- AC-06/14: Codex의 등록·trust·callback·적용 한계를 확인하고 native enforcement를 미지원으로 표시한다.
- AC-08: Claude의 spawn 판정·결과·시작 관찰을 검증하고, Codex callback·시작 관찰은 정책 판정으로 승격하지 않는다.
- AC-13: verified binding 부재 deny는 호출자·workflow context를 검증할 수 있는 Claude gate 경로에 적용한다.

## 2. Review Focus

1. PATH에 여러 Claude CLI 버전이 있으면 설치기가 실제 선택 경로·버전을 함께 보고한다 — T1.
2. 사용자 훅이 ARC와 유사하거나 ARC 정의가 중복·변경됐으면 임의 삭제하지 않는다 — T1·T2.
3. publish 후 검증 실패 중 외부 설정이 변경돼도 오래된 전체 파일로 덮어쓰지 않는다 — T2.
4. Codex callback은 gate·권한 state·lease 전이를 호출하지 않으며 ARC allow/deny·관리 보장을 만들지 않는다. 민감한 입력은 durable 진단에 남기지 않는다 — T3·T4·T5.
5. Claude orphan 호출은 deny한다. 정의·CLI·runtime 변경 후 과거 binding·trust·callback 증거를 현재 성공으로 재사용하지 않는다 — T3·T4·T5.

## 3. 남은 증거 게이트

정책 선택은 완료됐다. 아래는 구현·검증 증거 게이트다.

### E1 — Claude provider provenance

고정 resolver가 실제 근거에서 session·actor·task·active lease·승인 provenance를 획득하고 binding을 bootstrap할 수 있는지 입증한다.

이전 [2026-10-20 계획 T6](2026-10-20-cross-platform-runtime-gates.md#t6-native-providerentrypoint설치-통합)의 fixed resolver 계약을 Claude 경로에 재사용한다. 이전 계획의 오래된 workspace 경로, 수동 연결 대안, Codex enforcement 요구는 가져오지 않는다.

E1이 없으면 Claude provider 수용, 이에 종속된 설치 통합, 전체 완료를 보류한다. 모든 호출 deny, 테스트에서 context 주입, verified:true 자체 선언 또는 설정 생성만으로 해제하지 않는다. Codex 진단과 독립 설치기 작업은 E1에 종속되지 않는다.

### E2 — 격리된 실제 호스트 환경

현재 사용자 설정을 건드리지 않는 공식 지원 방식의 Codex·Claude 테스트 환경과 실행 경로를 확보한다. 별도 host/SDK를 가정하거나 trust를 우회하지 않는다.

E2가 없으면 실제 callback·trust·Claude 거부 적용·hook failure 처리에 대한 호스트 수용과 전체 완료를 보류한다. fixture 검증은 계속할 수 있다. 실행 버전의 공식 설정 schema와 격리 실행 인자는 증거로 고정하며 미확정 값을 추정하지 않는다.

## 4. 작업 순서와 파일 책임

| 작업 | 책임 | 주요 파일 |
|---|---|---|
| T1 | CLI 감지, hook 정의·소유권·안전한 병합 | 신규 lib/installer/native-cli.mjs, native-hooks.mjs; runtime-config.mjs |
| T2 | publish 후 검증, rollback, 안전한 제거 | transaction.mjs, uninstall.mjs |
| T3 | Codex 진단, Claude resolver·gate | 신규 runtime 모듈; adapters·schema·capabilities |
| T4 | 자동 설치·갱신·상태 진단 연결 | plan.mjs, install.mjs, upgrade.mjs, management status |
| T5 | 실제 호스트·분배물·정책·문서 | probe, package tests, 정책·문서·manifest |

의존성: T1 → T2, T1 → T3, T1·T2·T3 → T4 → T5. T1·T2는 E1/E2와 독립적으로 수용할 수 있다. 같은 파일을 여러 작업이 변경하면 앞 작업 수용 후 순차 인계한다.

---

## T1 — CLI 감지와 ARC 소유 훅 설정 병합

**목표:** 사용자 설정을 쓰지 않는 구성 요소로 CLI 감지, 공식 hook 정의 생성, 안전한 병합·정리 계획을 제공한다.

**선행:** 계획 승인. E1/E2와 독립.

**파일**

- 생성: lib/installer/native-cli.mjs, lib/installer/native-hooks.mjs.
- 수정: lib/installer/runtime-config.mjs.
- 생성: tests/node/native-cli.test.mjs, tests/node/native-hooks-config.test.mjs.
- 수정: tests/node/runtime-config.test.mjs 및 신규 모듈 manifest 항목.

**인터페이스**

- detectNativeCli({platform, env, cwd, runVersion})은 {status, executablePath, realpath, version, failureBlocking}을 반환한다. 설치 프로세스의 PATH에서 선택된 바이너리를 shell 없이 확인하고, 미발견·파싱 실패는 unknown으로 구분한다.
- buildNativeHookDefinitions({platform, entryPoint, nodePath, cli})는 지원 버전의 공식 schema만 생성한다. Codex는 진단 entry point, Claude는 gate entry point를 참조한다.
- renderNativeHooks({platform, original, definitions, previousRecord})는 {content, record, action, conflicts, notes}를 반환한다.
- removeNativeHooks({platform, original, record})는 {content, removed, conflicts, retainedReferences}를 반환한다.

소유 기록은 설치된 ARC tree의 native-hooks.json에 둔다. 비공식 소유권 필드를 host schema에 넣지 않는다. 기록에 플랫폼·설정 경로·entry point·정확한 정의 및 hash·선택된 CLI 경로/버전·플랫폼 모드를 결합한다.

**단계**

- [ ] fake CLI와 PATH fixture에서 2.1.314 및 2.1.266 선택 경로·버전을 검증한다.
- [ ] Claude 2.1.294, 2.1.295, 2.1.314, 미확인 버전의 옵션 생성을 검사한다. threshold 미만·미확인에서는 onFailure: "block"을 만들지 않는다.
- [ ] Codex 정의가 진단 entry point만 참조하고 gate 활성화 옵션을 만들지 않는지 검사한다.
- [ ] 사용자 훅·순서·관련 없는 설정 보존, 동일 정의 재등록의 idempotency를 검사한다.
- [ ] 손상된 설정·중복 키·소유 기록 불일치·유사 명령·중복 ARC 정의를 안전하게 거부하거나 충돌로 반환한다.
- [ ] 구현 후 focused checks와 manifest 검사를 통과시킨다.

**검증**

~~~bash
node --test tests/node/native-cli.test.mjs tests/node/native-hooks-config.test.mjs tests/node/runtime-config.test.mjs
npm run check:manifest
~~~

**수용:** 경로·버전 감지와 소유권·병합이 정확하고 사용자 훅이 보존된다. live 설정 변경이나 활성 host 차단 주장이 없다.

**보류:** 특정 버전의 공식 schema를 확인하지 못한 정의만 보류한다.

**커밋:** feat(installer): 네이티브 훅 설정과 CLI 감지 추가

---

## T2 — 기록 후 검증과 안전한 제거

**목표:** rollback 구간 안에서 등록 결과를 검증하고, 훅 참조를 정리한 뒤 참조되지 않는 ARC 자산을 제거한다.

**선행:** T1 수용. E1/E2와 독립.

**파일**

- 수정: lib/installer/transaction.mjs, lib/installer/uninstall.mjs.
- 수정/검증: tests/node/transaction.test.mjs, transaction-drift.test.mjs, transaction-readonly.test.mjs, uninstall.test.mjs.

**설계**

- applyTransaction(plan, options)에 선택적 동기 options.verifyPublished를 추가한다. 모든 publish와 경로 재확인 뒤, rollback snapshot 정리 전에 수행한다.
- uninstall plan에 native 설정·소유 기록 검사와 retainedReferences 결과를 포함한다.

**단계**

- [ ] publish 후 검증 실패가 원래 바이트를 복구하는 fault test를 작성한다.
- [ ] 실패 중 외부 설정 변경이 발생하면 오래된 파일로 덮어쓰지 않고 recovery·잔여 경로를 보고하는 테스트를 작성한다.
- [ ] 제거 순서를 hook 참조 정리·재검증 → 참조되지 않는 자산 제거로 바꾼다.
- [ ] 같은 이벤트에 있는 사용자 훅은 유지하고 ARC 항목만 제거하는 테스트를 작성한다.
- [ ] 소유권 충돌·정리 실패·skipGlobal에서 참조될 수 있는 ARC tree를 보존하는 테스트를 작성한다.
- [ ] snapshot·취소·rollback·부분 완료 결과를 기존 transaction 계약에 연결한다.

skipGlobal은 전역 등록·갱신·정리를 하지 않는다. 설정 참조가 남아 있을 수 있으면 필요한 ARC tree를 보존하며 이유와 잔여 경로를 보고한다.

**검증**

~~~bash
node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/uninstall.test.mjs
npm run check:manifest
~~~

**수용:** 검증·정리 실패가 사용자 훅 유실이나 stale reference를 만들지 않는다.

**보류:** 실제 host 제거 증거는 T5에서 확인한다.

**커밋:** feat(installer): 훅 검증과 참조 보존 제거 추가

---

## T3 — Codex 진단과 Claude verified gate

**목표:** 설치된 Codex entry point는 진단만 수행하고, Claude entry point는 verified binding 기반 gate를 실행한다.

**선행:** T1 수용. Claude provider 수용은 E1에 종속.

**파일**

- 생성: lib/runtime/native-context.mjs, lib/runtime/adapters/claude-context.mjs, lib/runtime/native-diagnostics.mjs, lib/runtime/native-hook.mjs.
- 수정: lib/runtime/adapters/claude.mjs, lib/runtime/capabilities.mjs; 필요 시 identity.mjs, schema.mjs, store.mjs.
- 생성: tests/node/runtime-context.test.mjs, tests/node/runtime-native-hook.test.mjs.
- 수정: runtime-claude.test.mjs, runtime-capabilities.test.mjs, runtime-installed-entry.test.mjs.
- 기존 runtime-codex.test.mjs는 일반 adapter 회귀만 검사한다.
- generator가 관리하는 runtime asset·두 플랫폼 skill/runtime/·manifest를 갱신한다.

기존 runCodexGate API는 Codex native hook에 연결하지 않는다. 협력형·명시적 context API의 회귀는 유지하되 native enforcement 증거로 표시하지 않는다.

**인터페이스**

- runNativeHook({platform, input, installation})
  - Codex: 최소 진단 기록 뒤 정책 decision 필드가 없는 중립 응답을 반환한다.
  - Claude: 고정 resolver를 호출하고 runClaudeGate에 연결한다.
- recordNativeDiagnostic({input, installation, storage})는 callback 여부와 설치 정의·버전의 최소 진단 상태를 기록하며 권한 state·assignment·lease를 변경하지 않는다.
- Claude용 initializeNativeBinding({installation, observedContext, storage})는 실제 검증된 provider context로 binding을 초기화한다.
- Claude용 resolveNativeContext({input, installation})은 bound context 또는 unbound/unavailable 사유를 반환한다.

### Codex 진단 계약

- PreToolUse에서 evaluate, runCodexGate 또는 권한 판정기를 호출하지 않는다.
- permissionDecision: "allow"와 "deny"를 반환하지 않는다. 정책 결정 의미가 없는 중립 응답을 사용한다.
- hook 입력 전체를 저장하지 않는다. 진단에는 event 종류, 설치/runtime hash, platform version, 관찰 시각 등 최소 운영 메타데이터만 허용한다. raw tool_input, prompt/transcript, 환경 변수, 전체 payload 및 caller 권한 연결 정보는 durable 기록에 남기지 않는다.
- callback이나 SubagentStart 관찰로 identity·assignment·lease를 만들지 않는다.
- 진단 저장 실패는 ARC 정책 거부로 바꾸지 않는다.
- 부모 session ID나 프롬프트·transcript로 root/child 역할을 추정하지 않는다.

### Claude resolver·bootstrap 계약

고정 import로 resolver를 호출하며 stdin provider 경로는 import하지 않는다. 실제 context는 설치 identity와 canonical policy/runtime, 승인 대상에 결합된 durable state, 사용자 승인 provenance, 현재 Git evidence, 검증된 session·actor·task·active lease, request/tool-use 상관관계, 보수적 describeTool, 승인 spawn과 실제 결과를 대조하는 observeAgent를 연결한다.

플랫폼 provider가 검증 가능한 시작·identity 근거를 획득한다. 공통 resolver는 target·버전·승인·state를 검증한 뒤 binding을 초기화한다. 설치기는 session 권한을 발급하지 않는다. 프롬프트나 자체 선언 옵션, cooperative state만으로 binding을 만들지 않는다. bootstrap이 안 된 호출은 deny다.

**단계**

- [ ] Codex callback에서 gate 미호출·decision 필드 부재·권한 state/lease 무변화를 spy와 저장 전후 비교로 검증한다.
- [ ] Codex에 raw tool_input, prompt/transcript, 환경 변수와 전체 payload가 durable 진단으로 저장되지 않는 테스트를 작성한다.
- [ ] Claude provider의 실제 provenance·초기화 경로를 구현하고 E1 증거를 확보한다.
- [ ] Claude orphan·준비 전·다른 workspace·stale session·inactive/retired lease·버전 불일치가 deny인지 확인한다.
- [ ] 위조 역할·provider 경로·잘못된 tool-use·cooperative state가 권한을 만들지 않는 테스트를 작성한다.
- [ ] 격리된 설치 entry point에서 resolver → state/policy/evidence → adapter → 응답·저장을 검증한다.
- [ ] Claude spawn 판정·실제 결과·시작 관찰을 분리하고 일치하는 승인과 관찰만 identity에 연결한다.
- [ ] Claude 정상 gate 판정과 hook failure 차단 수준을 구분한다.
- [ ] import만으로 stdin을 읽거나 프로세스를 종료하지 않는지 검사한다.
- [ ] canonical runtime generator와 manifest를 갱신한다.

**검증**

~~~bash
node --test tests/node/runtime-context.test.mjs tests/node/runtime-native-hook.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-capabilities.test.mjs tests/node/runtime-installed-entry.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
~~~

**수용**

- Codex: callback 진단만 수행하고 native ARC allow/deny·관리 보장이 없다. 민감한 입력은 durable 기록에 남지 않는다.
- Claude: 실제 fixed resolver가 provider 근거를 읽고 bound 정상 허용·금지 거부·orphan deny를 수행한다.
- 모든 호출을 거부하거나 테스트 context를 주입한 것만으로 Claude bootstrap 완료를 인정하지 않는다.
- 관찰과 정책 판정·실제 결과를 구분한다.

**보류:** E1이 없으면 Claude 부분과 T3 전체 수용을 보류한다. Codex 진단 및 독립 installer 작업은 계속할 수 있다.

**커밋:** feat(runtime): Codex 진단과 Claude 검증 gate 추가

---

## T4 — 자동 등록·갱신과 플랫폼별 상태 보고

**목표:** 준비된 entry point를 자동 등록·검증하고 플랫폼별 통제 수준을 정확히 보고한다.

**선행:** T1·T2·T3 수용.

**파일**

- 수정: lib/installer/plan.mjs, install.mjs, upgrade.mjs, lib/management/status.mjs.
- 필요 시 수정: lib/cli/root.mjs, lib/tui/render.mjs.
- 수정: tests/node/plan.test.mjs, install.test.mjs, management-status.test.mjs, management-update.test.mjs.
- 생성: tests/node/native-hook-lifecycle.test.mjs.

**인터페이스**

- 설치 계획은 CLI·소유 기록·platform mode를 사용해 globalChanges, runtime, native-hooks.json을 함께 만든다.
- plan.nativeHooks는 예상 정의와 post-publish validator 입력을 보관한다.
- 설치 실행은 T2 검증 callback을 사용한다.
- 상태 출력은 등록·연결부·trust·callback·platform mode·failure handling을 분리한다. Claude에만 gate·binding·거부 적용·역할 연결을 표시하고 Codex는 diagnostic-only와 미지원 사유를 표시한다.

**단계**

- [ ] 설치·재설치·갱신이 수동 hook wiring 없이 각 platform entry point와 소유 기록을 만드는 fixture를 작성한다.
- [ ] concurrency·wait·instruction·hook 변경을 같은 설정 파일의 단일 변경으로 합성한다.
- [ ] runtime publish 후 설정 재읽기로 정의·경로·옵션 일치를 검증한다.
- [ ] 동일 정의를 불필요하게 재작성하지 않는다.
- [ ] 정의·CLI·runtime 변경 후 과거 evidence를 현재 성공으로 재사용하지 않는다.
- [ ] skipGlobal, 충돌·부분 적용·보존 자산을 정확히 보고한다.
- [ ] Codex 등록·callback을 enforcement 성공으로 표시하지 않는다.
- [ ] Claude binding 준비 전·ARC 외부 호출 deny 영향을 진단과 운영 문서에 연결한다.

**검증**

~~~bash
node --test tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/management-status.test.mjs tests/node/management-update.test.mjs tests/node/native-hook-lifecycle.test.mjs
npm run check:manifest
~~~

**수용:** 자동 lifecycle·보존 계약이 충족된다. Codex는 진단 전용, Claude는 verified binding 기반 gate다. 등록을 trust·활성·차단 성공으로 표시하지 않는다.

**보류:** 실제 host 적용 증거는 T5/E2에 둔다.

**커밋:** feat(installer): 플랫폼별 훅 자동 관리와 상태 연결

---

## T5 — 실제 호스트 통합과 배포·문서 일치

**목표:** 설치된 패키지 경로의 동작·한계와 문서·정책·분배물을 일치시킨다.

**선행:** T1–T4 수용. 실제 host 검증은 E2.

**파일**

- 생성: scripts/probe-runtime-hooks.mjs, tests/node/native-hook-probe.test.mjs.
- 수정: tests/node/package.test.mjs, manifest.test.mjs, runtime-assets.test.mjs, role-policy.test.mjs.
- 수정: lib/policy/role-policy.json과 generator 출력.
- 수정: README.md, docs/runtime/planner-hook-context.md.
- 필요 시 수정: package.json, lib/installer/manifest.mjs, MANIFEST.sha256.

probe는 명시적 격리 대상·CLI·설정을 요구하고 현재 사용자 설정으로 fallback하지 않는다. callback·hook 응답·host 결과·부작용을 각각 기록한다. Codex는 callback·중립 응답·무전이를, Claude는 verified binding·정책 판정·실제 거부 적용을 확인하며 두 결과를 같은 enforcement 상태로 합치지 않는다.

**단계**

- [ ] 격리 대상이 없으면 실제 host 실행을 거부하는 probe test를 작성한다.
- [ ] 훅 부재를 요구하던 검증을 새 ARC 관리 asset·shared runtime 보존 검증으로 변경한다. 이전 제거 설계는 역사 문서로 보존한다.
- [ ] policy notice와 문서를 Codex 진단 전용/Claude gate 계약에 맞춘다.
- [ ] E2의 CLI 경로·버전·격리 인자·설정 위치를 증거에 고정한다.
- [ ] Codex 등록 → exact-definition trust → callback → 중립 응답 → 제거를 확인한다. 호출 허용·거부나 gate 적용은 주장하지 않는다.
- [ ] Codex callback·시작 관찰이 policy state·lease·권한을 만들지 않으며 민감한 payload를 저장하지 않는지 확인한다.
- [ ] Claude workspace trust, bound 정상 허용·금지 거부, orphan deny, 실제 자식 역할 연결을 확인한다.
- [ ] Claude >=2.1.295에서 시작·timeout·schema 실패의 onFailure: "block"을 확인한다.
- [ ] Codex hosted/specialized/write_stdin, Claude @ 언급 등 적용 제외를 기록한다.
- [ ] spawn 승인·실제 결과·시작 관찰을 플랫폼별로 구분하고 Codex 관찰을 정책 판정으로 표현하지 않는다.
- [ ] 제거 후 ARC 정의 부재·사용자 훅 보존·잔여 참조 정리를 확인한다.
- [ ] 전체 회귀·분배물 검증을 수행한다.

실제 Git 변경·agent 배정·native canary는 Orchestrator가 승인된 scratch 환경에서 수행하고 QA가 증거를 검사한다.

**검증**

~~~bash
node --test tests/node/native-hook-probe.test.mjs tests/node/package.test.mjs tests/node/manifest.test.mjs tests/node/runtime-assets.test.mjs tests/node/role-policy.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:role-policy
npm run check:manifest
npm test
~~~

실제 host 명령은 E2에서 확인한 공식 격리 방식으로 확정한 뒤 실행한다.

**수용:** Codex 진단과 Claude enforcement의 실제 host 증거를 각각 확보한다. synthetic 결과나 등록 성공으로 실제 callback·차단 증거를 대체하지 않는다.

**보류:** E2 또는 필수 native evidence가 없으면 T5 수용·커밋과 전체 완료를 보류한다.

**커밋:** test(runtime): 플랫폼별 통합 증거와 배포 문서 정리

## 5. 수용 기준 추적

| 기준 | 작업·증거 |
|---|---|
| AC-01 자동 lifecycle | T1·T2·T4·T5 |
| AC-02 사용자 훅 보존 | T1·T2 |
| AC-03 등록과 host 적용 구분 | T4·T5 |
| AC-04 trust 비우회 | T3·T4·T5 |
| AC-05 skipGlobal·복구·잔여 참조 | T2·T4 |
| AC-06 Codex 등록·trust·callback과 미지원 표시 | T3·T4·T5 |
| AC-07 Claude 현재·구버전 처리 | T1·T3·T5 |
| AC-08 Claude 판정·결과·관찰과 Codex 진단 구분 | T3·T5 |
| AC-09 Claude 역할 연결, Codex 강제 미지원 | T3·T5 |
| AC-10 정책·생성물·문서 일치 | 각 작업 및 T5 |
| AC-11 사용자 live 설정 비변경 | 모든 작업·E2 |
| AC-12 QA·Reviewer·Orchestrator 수용 | 작업별 QA·최종 전체 검토 |
| AC-13 Claude orphan deny | T3·T4·T5 |
| AC-14 Codex diagnostic-only, native allow/deny 보류 | T3·T4·T5 |

## 6. 최종 Reviewer

T1–T5 수용 및 필수 QA·재검증 후 독립 Reviewer가 전체 변경을 검토한다. 검토 초점은 Codex gate 오연결·allow/deny 표현, Claude 권한 합성·bootstrap, trust 우회, 설정 유실·stale reference, CLI 버전 오판, 민감 payload 저장, 실제 evidence 범위 과장이다.

최종 finding은 Implementer 수정 후 Reviewer 재검토로 해결한다. 최종 전체 검토 전에 필요한 QA와 실패 재검증은 그대로 수행한다. 전체 완료는 Orchestrator가 판단한다.

## 7. 자체 검토 기록

- 최신 사용자 결정에 따라 Codex native deny/allow와 정책 판정은 보류하고 진단 전용으로 계획했다.
- Claude verified binding·orphan deny·fixed resolver·bootstrap은 유지했다.
- Codex 진단의 민감 payload 비저장을 acceptance/test 조건으로 두었다.
- 이전 cross-platform 계획의 fixed resolver 계약은 Claude 경로에만 재사용한다.
- T1/T2의 독립 설치기 검증과 provider/실제 host 증거 종속 작업을 구분했다.
- 정책 질문은 남아 있지 않다. 남은 E1/E2는 실제 provenance와 격리 호스트 증거 게이트다.
- 각 작업에 책임·파일·의존성·검증·수용·보류·focused commit을 기록했다.
- 코드·테스트 파일을 수정하거나 검증 명령을 실행하지 않았다.
