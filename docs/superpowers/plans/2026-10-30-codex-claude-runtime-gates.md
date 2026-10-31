# Codex·Claude Code 네이티브 런타임 통제 구현 계획

> **실행 역할:** Implementer가 지정 파일을 수정하고 QA가 필수 검증·재검증을 수행한다. Orchestrator가 수용 후 작업별 focused commit을 만든다. 전체 구현 뒤 독립 Reviewer가 변경 전체를 검토한다. 체크박스는 진행 표시이며 Specialist는 Git 상태를 변경하지 않는다.

**목표:** ARC 설치기가 Codex 훅과 Claude Code Mods plugin을 자동 등록·검증·정리한다. Codex는 진단 전용 callback을 제공한다. Claude Mods provider 후보는 실제 host가 승인 UI와 session identity의 무결성을 증명한 경우에만 session-scoped native binding gate를 제공한다.

**구조:** 설치 계층이 설정 병합·소유권·transaction을 관리한다. Codex entry point는 진단만 수행한다. Claude Mod는 검증된 host callback을 고정 resolver에 공급하고 portable policy core를 호출하며, ARC 정책 허용 뒤에도 host permission 결과를 보존한다. 승인 UI/session identity 무결성이 미확인인 동안 Claude provider는 권한을 발급하지 않는다. ARC 소유 Claude command gate와 Mod gate를 중복 등록하지 않는다. 등록·trust/load·callback·binding·거부 적용 증거는 분리한다.

**기술:** Node.js >=22, ESM, 기존 vendored TOML parser, Node test runner, 기존 safe-fs 및 transaction.

**승인 명세:** [2026-10-30-codex-claude-runtime-gates-design.md](../specs/2026-10-30-codex-claude-runtime-gates-design.md)

**실행 대상:** /Users/yunho/Desktop/project/arc<br>
**브랜치:** feat/codex-claude-runtime-gates<br>
**설계 기준 HEAD:** 8c88952e9c0178fdb07ad521a51b6620e08503ea<br>
**T3 보완 시작 HEAD:** 675e8ab095806ab80d524046ff59965974c98437

상태: 사용자 승인으로 T1–T5 실행 중. 2026-10-31 보완 절에서 T3를 Codex T3a, fail-closed Claude source T3b1, E1/E2 host 검증·활성화 T3b2로 나누고, T4를 독립 Codex T4a와 Claude T3b2/E2에 종속된 T4b로 나눈다. 완료된 T1/T2/T3a/T4a 수용·커밋은 유지한다.

## 1. 전역 제약과 결정

- 현재 checkout은 `/Users/yunho/Desktop/project/arc`의 `feat/codex-claude-runtime-gates`다. 초기 계획의 이전 workspace 경로를 실행 대상으로 사용하지 않는다.
- T1·T2·T3a·T4a는 각각 `07c083b9`, `675e8ab`, `7173d9b`, `3c780fd`로 source 범위에서 수용·커밋했다. 실제 Codex host 증거는 T5에 남는다. Claude source는 T3b1에서 fail-closed로 구현할 수 있지만 provider 활성화·host 수용은 E1/E2 이후 T3b2까지 보류한다.
- 저장소 구현·fixture 검증 중 현재 사용자의 Codex/Claude 설정을 수정하지 않는다. 설치·제거와 실제 호스트 검증은 격리 fixture/환경에서만 수행한다.
- 다른 사용자 훅과 순서를 보존하고, 소유권을 확인한 ARC 항목만 갱신·제거한다.
- Codex exact-definition trust와 Claude plugin/workspace trust 및 managed settings를 우회하지 않는다.
- 설정 등록 성공을 trust·callback·실행 차단 성공으로 표시하지 않는다.
- 설치 프로세스 PATH에서 실제 선택한 CLI 경로와 버전을 함께 검출·기록한다. 현재 로그인 셸의 Claude Code는 2.1.314이고, 고정 경로 /Users/ma-24-007/.local/bin/claude의 2.1.266을 활성 버전으로 간주하지 않는다.
- Claude Code Mods를 provider로 구현한다. 별도 Agent SDK·API key·외부 유료 서비스·추가 모델 호출을 도입하지 않는다. `tool.check` 호출당 local latency는 측정하되 별도 API 비용과 혼동하지 않는다.
- **Codex:** 훅을 자동 등록하되 진단 전용으로 유지한다. native entry point는 ARC allow/deny, 권한·lease 변경, 정책 적용 또는 spawn 권한 판정을 수행·주장하지 않는다. 호출자 식별 한계가 해결되기 전까지 Codex native enforcement는 미지원이다.
- Codex 진단은 최소 운영 메타데이터만 저장한다. raw tool_input, prompt/transcript, 환경 변수, 전체 hook payload는 durable 기록에 저장하지 않는다.
- **Claude Code:** 검증된 session → workflow → actor/task/active lease binding이 없는 전역 tool-check 호출은 deny한다. ARC 외부 세션과 binding 준비 전 호출도 포함한다. ARC command gate와 Mod gate는 동시 활성화하지 않는다.
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
| T3a | Codex diagnostic-only callback, portable core 분리·생성물 | native diagnostic 모듈·tests; runtime core·asset generator·manifest |
| T3b1 | Claude Mods provider source와 fail-closed 경계 | Mod source·resolver·portable core 연결; adapters·schema·capabilities·tests |
| T3b2 | Claude host 무결성 검증과 조건부 활성화 | 격리 host probes·adversarial tests·activation state |
| T4a | Codex 진단 훅 자동 설치·갱신·제거·상태 | plan.mjs, install.mjs, upgrade.mjs, management status |
| T4b | Claude Mod lifecycle와 기존 gate 전환 | native-plugin.mjs, install/uninstall lifecycle, management status |
| T5 | 실제 호스트·분배물·정책·문서 | probe, package tests, 정책·문서·manifest |

의존성: T1 → T2, T1 → T3a → T3b1 → T3b2, T1·T2·T3a → T4a, T3b2·T4a → T4b, T3a·T3b1·T3b2·T4a·T4b → T5. T1·T2·T3a·T3b1·T4a source 범위 수용은 Claude E1/E2와 독립이다. 같은 파일을 여러 작업이 변경하면 앞 작업 수용 후 순차 인계한다.

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

- [x] fake CLI와 PATH fixture에서 2.1.314 및 2.1.266 선택 경로·버전을 검증한다.
- [x] Claude 2.1.294, 2.1.295, 2.1.314, 미확인 버전의 옵션 생성을 검사한다. threshold 미만·미확인에서는 onFailure: "block"을 만들지 않는다.
- [x] Codex 정의가 진단 entry point만 참조하고 gate 활성화 옵션을 만들지 않는지 검사한다.
- [x] 사용자 훅·순서·관련 없는 설정 보존, 동일 정의 재등록의 idempotency를 검사한다.
- [x] 손상된 설정·중복 키·소유 기록 불일치·유사 명령·중복 ARC 정의를 안전하게 거부하거나 충돌로 반환한다.
- [x] 구현 후 focused checks와 manifest 검사를 통과시킨다.

**검증**

~~~bash
node --test tests/node/native-cli.test.mjs tests/node/native-hooks-config.test.mjs tests/node/runtime-config.test.mjs
npm run check:manifest
~~~

**수용:** 경로·버전 감지와 소유권·병합이 정확하고 사용자 훅이 보존된다. live 설정 변경이나 활성 host 차단 주장이 없다.

**보류:** 특정 버전의 공식 schema를 확인하지 못한 정의만 보류한다.

**커밋:** feat(installer): 네이티브 훅 설정과 CLI 감지 추가

**수용 기록:** T1 수용 및 커밋 완료 (`07c083b9`). 실제 Claude host callback/trust는 이 수용 기록의 범위가 아니다.

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

- [x] publish 후 검증 실패가 원래 바이트를 복구하는 fault test를 작성한다.
- [x] 실패 중 외부 설정 변경이 발생하면 오래된 파일로 덮어쓰지 않고 recovery·잔여 경로를 보고하는 테스트를 작성한다.
- [x] 제거 순서를 hook 참조 정리·재검증 → 참조되지 않는 자산 제거로 바꾼다.
- [x] 같은 이벤트에 있는 사용자 훅은 유지하고 ARC 항목만 제거하는 테스트를 작성한다.
- [x] 소유권 충돌·정리 실패·skipGlobal에서 참조될 수 있는 ARC tree를 보존하는 테스트를 작성한다.
- [x] snapshot·취소·rollback·부분 완료 결과를 기존 transaction 계약에 연결한다.

skipGlobal은 전역 등록·갱신·정리를 하지 않는다. 설정 참조가 남아 있을 수 있으면 필요한 ARC tree를 보존하며 이유와 잔여 경로를 보고한다.

**검증**

~~~bash
node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/uninstall.test.mjs
npm run check:manifest
~~~

**수용:** 검증·정리 실패가 사용자 훅 유실이나 stale reference를 만들지 않는다.

**보류:** 실제 host 제거 증거는 T5에서 확인한다.

**커밋:** feat(installer): 훅 검증과 참조 보존 제거 추가

**수용 기록:** T2 수용 및 커밋 완료 (`675e8ab`).

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

---

## 8. 2026-10-31 보완 계획 — Codex 진단과 Claude Code Mods

이 절은 E1/E2, T3–T5 및 AC-07의 현재 실행 기준이다. 앞 절의 기존 T1/T2 승인·수용·커밋과 안전 계약은 유지한다. 앞 절의 T3–T5는 최초 계획 기록이며 아래의 provider, plugin lifecycle, host verification과 충돌하는 세부 사항은 이 보완 절로 대체한다.

사용자는 고정 Claude provider/source가 없으면 조사 후 구현하도록 지시했다. 구현 경로는 공식 Claude Code Mods의 in-process event callback → 고정 provider/resolver → native binding → 기존 정책 core다. 별도 Agent SDK, API key, 외부 유료 서비스 또는 추가 모델 호출을 도입하지 않는다. `tool.check`마다 local callback을 수행할 때의 latency와 timeout은 측정한다. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference) [Mods API](https://code.claude.com/docs/en/plugins/mods/api)

현재 CLI에는 native approval과 host actor를 결합하는 승인 경로가 없다. Cooperative state의 provenance는 `operator-attested`, `nativeVerified:false`다. 따라서 `/arc-bind`는 cooperative record를 승격하지 않고, 실제 host의 사용자 확인으로 현재 session에 한정된 새 native approval receipt·Orchestrator root identity·lease를 만든다. 이 bootstrap은 기존 verified binding 결정의 최소 생성 경로이며 workflow state 자체의 기존 approvals를 재작성하지 않는다.

### E1 — provider source와 binding 구현

구현 경로는 Mod가 실제 host event 및 `$` API에서 받은 session·origin·tool-use·agent identity를 고정 resolver로 전달하고, 선택된 workflow/task의 파일·Git·version evidence와 session-scoped receipt를 확인하는 구조다. E1 구현 증거는 다음을 포함한다.

- 설치 가능한 Mod entry module이 고정 provider/resolver와 portable policy core만 호출한다.
- `/arc-bind <workflowId> <taskId>`가 host의 composer-origin 사용자 command와 `$.ui.ask`의 명시적인 승인 선택을 요구한다.
- 선택 전·승인 대기 후 checkout, Git target, workflow revision, 문서 hash, operations/paths, task 및 assignment/lease 상태를 재검증한다.
- native receipt·root identity·root lease가 user confirmation 이후에만 해당 session·task·scope·설치·정책/runtime hash에 결합된다.
- native state는 workflow state와 별도 revision·audit·generation으로 저장되고 lock/CAS로 갱신된다. helper 입력만으로 approval receipt, role 또는 verified provenance를 발급하지 않는다.
- cooperative/operator-attested state, stdin의 provider 경로·role·`verified:true`, prompt/transcript 또는 모든 호출 deny만으로 E1 완료를 인정하지 않는다.

실제 실행 버전에서 origin과 host field가 신뢰 가능한지, Mod가 해당 source를 실제 callback으로 받는지는 E2에서 확인한다. E1 source 구현 완료와 E2 host 수용은 별도로 보고한다.

### E2 — 격리된 실제 Claude/Codex host

현재 사용자 설정·live host를 변경하지 않는 공식 격리 환경, 실제 CLI 경로·버전, plugin/config 경로, 실행 버전이 생성한 `/plugin-types` declarations와 hash를 확보한다. 공개 문서는 `tool.check.e.agentId`를 Claude Code `>=2.1.290`에서 설명하지만 이는 전체 Mod 호환성 기준이 아니다. 실행 버전 declarations가 우선한다. [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference)

`tool.check`는 `PreToolUse` 뒤에서 실행된다. 기존 ARC command gate가 남으면 Mod gate와 중복·선행 판정이 생길 수 있으므로 T4에서 ARC 소유 gate를 안전히 전환하고 제거한다. Host permission 결과는 ARC allow 이후에도 보존한다. Managed settings, plugin trust·ordering, workspace trust를 우회하지 않는다.

E2가 없으면 실제 composer-origin·사용자 approval receipt·session/tool-use/child identity·spawn correlation·plugin trust/order·deny 적용·failure handling에 대한 host 수용과 T5 전체 수용을 보류한다. Fixture, 공개 declarations 또는 plugin 설치 성공은 host 증거가 아니다. Managed policy가 `$.fs`/`$.process`를 거부하거나 IO가 timeout/partial이면 우회하지 않고 unavailable/deny로 처리한다. [Mods API](https://code.claude.com/docs/en/plugins/mods/api)

### T3 — Codex 진단 저장소와 Claude Mod provider

**목표:** Codex standalone callback/진단 저장소를 완료하고 Claude의 실제 Mod source, session bootstrap, 고정 resolver, portable policy gate를 구현한다.

**선행:** T1 수용. T2의 소유권·rollback 계약을 재사용한다. 실제 host 적용 증거는 E2/T5다.

**파일 책임**

- 생성: `lib/runtime/mods/register.mjs`, `lib/runtime/mods/claude-provider.mjs`, `lib/runtime/native-binding.mjs`, `lib/runtime/native-state.mjs`, `lib/runtime/policy-core.mjs`, `lib/runtime/path-core.mjs`, `lib/runtime/native-io.mjs`.
- 최소 수정: `evaluate.mjs`, `schema.mjs`, `gate.mjs`, `identity.mjs`, `store.mjs`, `adapters/claude.mjs`, `capabilities.mjs`.
- 생성: `claude/plugin/.claude-plugin/plugin.json`, `claude/plugin/hooks/hooks.json`, Mod hook module과 portable payload.
- 수정: runtime asset generator/inventory, generated runtime assets, `MANIFEST.sha256` 및 T3 focused tests.
- Codex T3 미커밋 변경의 소유 범위도 같은 작업에 포함한다. 관련 구현은 현재 사용자 홈을 변경하지 않으며 temp-home QA를 사용한다.

**인터페이스와 경계**

- `register(on)`은 import 부작용 없이 공식 Mods callback을 등록한다.
- `createClaudeProvider({host, installation, io})`는 bind, tool resolution, spawn observation, session invalidation을 고정 API로 제공한다.
- `initializeNativeBinding`은 실제 확인 경로에서 만들어진 receipt만 소비하고, `resolveNativeContext`는 binding 또는 명시적 unavailable/deny 사유를 반환한다.
- `evaluateNative(policy, state, request, evidence)`는 Node 없는 portable 함수로 기존 gate 정책을 소비한다. 정책을 재복제하지 않는다.
- fixed IO helper는 Git·파일 관찰과 native state lock/CAS만 제공한다. 임의 command/import 또는 승인 발급 public API를 제공하지 않는다.
- `describeClaudeTool`은 실제 tool input을 보수적으로 operation/path descriptor로 해석하고 불명확하면 deny/hold한다.
- 실행 버전이 허용하는 host field를 `/plugin-types`로 고정한다. `tool.check.e.agentId`, `tool_use_id`, command origin·spawn result의 availability는 fixture에서 단정하지 않는다.

**Codex 완료 계약**

- 설치된 Codex 진입점은 설치 기록을 확인하고 제한된 stdin JSON을 처리하며 정책 판정·lease 변경을 하지 않는다.
- `~/.arc/state/native-diagnostics/codex.jsonl`에는 `platform`, 허용된 `event`, `callback`, `definitionHash`, `runtimeHash`, `platformVersion`, `observedAt`만 기록한다. 파일 상한은 1 MiB이며 raw input/prompt/transcript/environment/full payload는 남기지 않는다.
- 디렉터리 `0700`, 파일/lock `0600`, 안전한 regular file·symlink 거부·동시 기록 lock·sync를 적용한다. 저장 실패/용량 초과는 기존 기록을 변경하지 않고 해당 진단만 생략한다. 응답은 정책 decision 필드 없는 중립 동작이다.
- 단위·임시 home QA는 46/46 통과, generator 48개·manifest 217개 확인 완료다. 실제 Codex host callback·trust는 E2에 남는다.

**Claude bootstrap 계약**

`/arc-bind <workflowId> <taskId>`는 실제 host `command.run`의 `origin.kind === "composer"`에서만 시작한다.

- [ ] workflow/task schema·상태·scope, 현재 checkout/worktree/Git identity, 문서 hash, version, assignment/active lease를 확인한다.
- [ ] `$.ui.ask`에는 workflow/task, checkout/target, 문서 path/hash, operations/paths와 기존 actor/assignment/lease 상태를 표시한다.
- [ ] 사용자 확인 직전 위 정보를 다시 읽고, 변경·취소·오류·timeout·미응답이면 아무 receipt/identity/lease도 만들지 않는다.
- [ ] 확인 receipt를 실제 session ID, install identity, target/worktree/Git identity, policy/runtime hash, task, operations/paths, provider generation과 확인 event에 결합한다.
- [ ] 해당 session의 root는 bootstrap 계약으로 고정된 Orchestrator다. role/actor 문자열을 command argument나 prompt에서 받지 않는다. session-scoped root identity/lease를 별도 native state에 기록한다.
- [ ] cooperative state와 기존 workflow approval은 변경·승격하지 않는다. 기존 native receipt의 task/scope 밖 권한은 deny한다.
- [ ] replay, binding 재선택, session 전환·reload·clear/resume/branch, version/policy/runtime/target/revision drift를 deny하고 재확인을 요구한다.

**Claude tool/spawn 계약**

- [ ] `tool.check`에서 실행 버전이 실제 제공하는 pinned tool-use ID, final input, agent ID로 session/task/lease를 검사한다.
- [ ] ARC deny는 Mod의 valid deny 응답으로 반환한다. ARC allow는 `await next(e)`의 host permission 결과를 그대로 보존한다. `tool.check` failure `.catch`는 해당 event의 deny 응답을 반환한다.
- [ ] tool-use ID 없는 permission query, 위조된 provider field, 다른 workspace, stale generation, version/state drift, inactive/retired lease, duplicate/replay는 상태 전이를 만들지 않는다.
- [ ] native pending assignment가 없는 spawn은 허용하지 않는다. 현재 root receipt 범위 안에서 task·operations·paths를 구성하고, 사용자가 별도 `$.ui.ask` 확인으로 role 및 정확한 하위 범위를 승인할 때만 session-scoped native assignment receipt를 만든다. 모델이 제공한 `agent_type`·prompt만으로 역할이나 승인 scope를 정하지 않는다.
- [ ] spawn decision, `agent.spawn` 결과, start observation을 별도 기록한다. 승인 pending assignment·실제 agent ID·상관관계가 모두 일치할 때만 child identity/lease를 활성화한다.
- [ ] child role은 `agent_type`/prompt로 추정하지 않는다. `SendMessage` 재개도 actor/task/lease를 검사한다.
- [ ] `.catch`, catch-handler failure, timeout, disabled/unloaded, `$.fs`/`$.process` refusal을 별도 상태로 남긴다. 이를 fail-closed라고 일반화하지 않는다.
- [ ] import만으로 stdin, process exit, user settings side effect를 일으키지 않고 generator/manifest를 갱신한다.

**필수 focused checks 및 fresh QA**

```bash
node --test tests/node/runtime-context.test.mjs tests/node/runtime-native-hook.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-capabilities.test.mjs tests/node/runtime-installed-entry.test.mjs tests/node/claude-mod-provider.test.mjs tests/node/native-binding.test.mjs tests/node/native-state.test.mjs tests/node/runtime-assets.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

fresh QA는 임시 home/workspace에서 Codex standalone entry·allowlist 저장, portable import graph, 실제 설치 payload 고정 provider 연결, bind approval/cancel/stale/replay, host permission 보존, spawn correlation, state CAS/concurrency를 독립 확인한다. 실제 host provenance 증거는 T5/E2다.

**수용:** Codex 진단 계약과 E1의 설치 가능한 provider source·session-scoped receipt 연결, gate decision, 위조·stale 거부가 focused 검사와 독립 QA에서 확인된다. E2 완료 여부를 별도 표기한다.

**보류:** fixed source, native receipt lifecycle, generated payload, 필수 checks/QA 중 하나라도 미완이면 T3 commit을 보류한다. Fixture만으로 E1 host provenance나 E2를 완료 처리하지 않는다.

**커밋:** `feat(runtime): Codex 진단과 Claude Mod 검증 gate 추가`

### T4 — Codex hook 및 Claude Mod 자동 lifecycle

**목표:** Codex hook과 Claude Mod을 자동 설치·갱신·제거하고 legacy command gate를 안전히 전환하며 단계별 상태를 보고한다.

**선행:** T1·T2·수정 T3 수용.

**파일 책임:** 기존 `plan.mjs`, `install.mjs`, `upgrade.mjs`, `management/status.mjs`; 추가 `native-plugin.mjs`; 관련 `native-hooks.mjs`, `uninstall.mjs`, `runtime-config.mjs`, CLI/TUI, lifecycle tests, assets/manifest.

`buildNativePluginAssets`, `renderNativePlugin`, `removeNativePlugin`은 공식 plugin loading schema와 exact asset hash·소유권·잔여 참조를 사용한다. Codex는 T1 command hook을 쓴다. Claude 신규 설치는 Mod gate만 연결한다. 기존 ARC command gate는 exact ownership이 검증된 경우 transaction 전환에서 제거한다. 설정 publish/re-read, ARC command hook removal, plugin path/hash validation이 끝나지 않으면 동시 gate를 성공 상태로 표시하지 않고 필요한 asset을 보존한다.

- [ ] install/reinstall/upgrade/uninstall/legacy command gate 전환의 중복·partial·rollback fixture를 작성한다.
- [ ] 다른 plugin·hook·env·managed config와 순서를 보존하고 managed/trust/disabled-hook 설정을 우회하지 않는다.
- [ ] skipGlobal, conflict, stale reference, external drift에서 T2 ownership/retention 계약을 적용한다.
- [ ] trust/load/binding/callback/gate success로 과거 evidence를 재사용하지 않는다.
- [ ] 상태에 `installed`, `configured`, `loaded`, `user-bound`, `callback-observed`, `gate-applied`, `failure-handling`, `plugin-order`, `host-io`, `hook-cost`, `legacy-command-gate`를 구분한다. 실제 evidence 없이는 unknown이다.

```bash
node --test tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/management-status.test.mjs tests/node/management-update.test.mjs tests/node/native-hook-lifecycle.test.mjs tests/node/native-plugin.test.mjs tests/node/native-hooks-config.test.mjs tests/node/uninstall.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
```

fresh QA는 임시 home에서 lifecycle, conflict, skipGlobal, rollback, 사용자 설정 보존, 단일 gate 소유권과 status evidence 분리를 독립 확인한다. **수용:** 자동 lifecycle과 safe transition이 fixture QA를 통과하고 등록을 trust/load/gate 적용으로 과장하지 않는다. **보류:** trust/managed 우회가 필요하거나 gate 중복·ownership·rollback 검증이 부족하면 T4 commit을 보류한다.

**커밋:** `feat(installer): Codex 훅과 Claude Mod 자동 관리 연결`

### T5 — 실제 host·분배물·정책·문서

**목표:** 실행 버전에서 Claude provider provenance와 gate 적용을 직접 확인하고 Codex diagnostic-only 및 한계를 분배물 전반에 맞춘다.

**선행:** T1–T4 수용. 실제 host 실행은 E2 확보 후 격리 설정에서만 한다.

- [ ] 격리 CLI/config/plugin target과 실행 버전 `/plugin-types` declarations/hash가 없으면 probe가 host 실행을 거부한다.
- [ ] 대상 버전·격리 경로에서 `claude plugin validate --strict`와 공식 Mod engine tests를 수행한다.
- [ ] composer `/arc-bind`와 사용자 확인에서만 receipt 생성, plugin/SDK origin 거부, session/tool-use/child actor mapping을 확인한다.
- [ ] ARC normal allow/deny, orphan deny, retired lease deny, stale state, 실제 tool side effect와 host ask/deny 보존을 확인한다.
- [ ] spawn approval/result/start observation/lease retirement과 SendMessage resume를 확인한다.
- [ ] `.catch` deny, uncaught error·timeout·handler failure·plugin disabled/unloaded, managed IO refusal을 각각 기록한다.
- [ ] 실제 plugin ordering과 legacy ARC command hook 제거 후 중복 gate가 없음을 확인한다.
- [ ] per-tool callback latency, hook timeout, helper/process 수, 추가 model/API call 부재를 측정한다.
- [ ] Codex exact-definition trust 전후, actual callback, neutral output, policy state/lease 무전이, sensitive payload 미저장을 확인한다.
- [ ] 제거 후 ARC plugin/hook 참조 부재·사용자 설정 보존·잔여 자산 상태를 확인한다.
- [ ] policy notice, README 및 runtime docs, package, generator, manifest를 현재 계약과 일치시킨다.
- [ ] focused distribution checks 후 `npm test` 전체 회귀를 수행한다.

```bash
node --test tests/node/native-hook-probe.test.mjs tests/node/package.test.mjs tests/node/manifest.test.mjs tests/node/runtime-assets.test.mjs tests/node/role-policy.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:role-policy
npm run check:manifest
npm test
```

검증을 위해 실제 사용자 settings, managed policy, trust를 수정하지 않는다. **수용:** Codex 진단과 Claude Mod provenance·실제 deny application의 host evidence를 각각 확보하고 package/docs/policy 일치를 확인한다. **보류:** E2 또는 native host evidence, 필수 QA가 없으면 T5 commit과 전체 완료를 보류한다.

**커밋:** `test(runtime): Mods 통합 증거와 배포 문서 정리`

### AC-07 대체와 전체 검토

AC-07 현재 문구:

> Claude Mods의 정상 deny, `.catch` failure handling, uncaught error·timeout·handler failure 한계, disabled/unloaded 상태를 구분한다. command hook의 `onFailure:"block"` 보장을 Mods에 적용하지 않는다. 지원 버전과 event fields는 실행 버전 declarations 및 실제 host 결과로 고정한다.

의존성은 `T1 → T2`, `T1 → T3`, `T1·T2·T3 → T4 → T5`로 유지한다. T1/T2 수용은 소급 취소하지 않는다. T3 source implementation, T4 plugin lifecycle, T5/E2 actual host evidence의 경계를 구분한다.

필수 작업과 QA 이후 독립 Reviewer가 전체 변경을 검토한다. 검토 초점은 origin spoofing, cooperative 승격, root/child actor·lease·spawn 상관, state replay/race, host permission 덮어쓰기, hook order·중복 gate, `.catch` 한계, managed/trust 우회, Codex 민감 기록, stale reference와 E2 증거 과장이다. finding은 Implementer 수정 및 Reviewer 재검토로 해결하며 전체 완료는 Orchestrator가 판단한다.

## 9. 2026-10-31 approval provenance 무결성 보완

이 절은 8절의 Claude `$.ui.ask` bootstrap, E1/E2 해제 조건, T3/T5 수용 기준을 대체한다. T1/T2 완료와 커밋은 유지한다. 승인 UI 후보는 아직 검증되지 않았다.

### 새로 확인한 host 경계

- `$.ui.ask()`는 `AskUserQuestion` tool call로 실행되어 호출한 hook을 제외한 다른 `tool.call` hook을 거친다. 다른 Mod가 실제 UI를 띄우지 않고 result를 반환할 수 있으므로 반환 문자열은 사람 승인 provenance가 아니다.
- `command.run.origin.kind === "composer"`는 유용한 host event이지만 slash command 인수는 다른 Mod가 바꿀 수 있다. origin·인수·표시 문구만으로 승인 receipt를 발급하지 않는다.
- 실제 Mod UI의 Pane/Button/`ui.press`는 검증 후보로 조사한다. Production plugin API에는 임의 `ui.press` 호출 API가 없지만, 다른 Mod는 `ui.press` event와 render 체인에 개입할 수 있다. 공개 선언은 모든 press identity/closure 속성이 수정 불가하다고 명시하지 않으므로 실제 host proof가 필요하다.
- `$.session.id()`는 hookable `session.id` op이며 `session.start` input에 session ID가 없다. 다른 hook이 값을 대체할 수 있는지 확인하기 전에는 그 반환값을 신뢰된 durable binding key로 쓰지 않는다.
- Claude Code plugin은 사용자 권한으로 코드를 실행한다. 이 작업은 ARC와 명시적으로 신뢰된 host/built-in 외의 Mod가 approval event, UI, session API를 조작하지 못하는 구성이 확인될 때만 provider 무결성을 인정한다. plugin ordering·허용 범위를 확인할 수 없으면 provider는 unavailable/deny다. [Plugin security and trust](https://code.claude.com/docs/en/plugins/security)

공식 근거: [Mods events](https://code.claude.com/docs/en/plugins/mods/events), [Mods API](https://code.claude.com/docs/en/plugins/mods/api), [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference), [공개 declarations v2.1.277](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts). 공개 declarations는 실행 대상의 `/plugin-types` 산출물을 대신하지 않는다.

### E1 — source와 host 무결성

E1 전체 완료에는 provider source 구현과 그 source가 의존하는 실제 host provenance 경계의 무결성 증거가 모두 필요하다. T3b1은 이 중 source 구현을 source 범위로 수용할 수 있지만 E1을 해제하지 않는다. 해당 상태는 `provider-source: implemented / host-integrity: unverified / provider-activation: unavailable`로 표시한다. fixture, 임의 `verified:true`, workflow JSON, prompt/transcript, `$.ui.ask()` 반환만으로 E1을 해제하지 않는다.

검증 후보인 ARC Pane bootstrap은 다음 동작을 따른다.

- `/arc-bind <workflowId> <taskId>`는 권한 없는 proposal만 만든다. proposal은 workflow/task, checkout/worktree/Git identity, 문서 path/hash, operations/paths, revision, provider generation과 canonical scope hash를 담는다. 최초 root proposal은 parent/lease가 없고, child proposal은 검증된 active parent assignment/lease를 담는다.
- Pane은 위 제안 범위 전체와 동일 hash를 표시하고 Confirm/Cancel 버튼을 제공한다. 자동 focus, global hotkey, prompt 숫자 shortcut은 승인 입력으로 사용하지 않는다.
- Confirm closure는 현재 Pane instance, 버튼, proposal nonce/generation, scope hash와 host identity를 다시 검증하고 proposal을 단 한 번 소비한다. 취소·중복·동시 press·만료·reload·문서/checkout/lease/revision/policy drift·IO 오류에서는 active receipt, binding, identity, lease를 만들지 않는다.
- UI event의 ARC plugin·Pane requestId·component·element, handler closure, 최종 scope/label tree, 실제 surface press가 실행 host에서 변경 불가하게 연결되는지 확인한다. `ui.render`의 `await next(e)` 결과는 해당 hook 아래쪽 체인만 보여 주므로 ARC가 외곽 handler임과 최종 표시 결과를 검증할 수 있는 ordering이 입증되지 않으면 승인하지 않는다.
- `$.session.id()`가 실제 session identity인지 격리 host에서 확인한다. host가 API 응답과 UI identity의 무결성을 보장하지 못하면 durable session-scoped approval을 활성화하지 않는다. 메모리 generation만으로 durable actor·task·lease를 자동 복구하지 않는다.
- child assignment는 같은 검증된 승인 경로로 정확한 task·role·operations·paths와 parent actor/lease를 별도 확인한다. receipt 없는 spawn은 deny한다.

### E2 — 실제 Claude Code 2.1.314 격리 probe

현재 셸에서 `/Users/yunho/.nvm/versions/node/v22.18.0/bin/claude`가 `2.1.314`를 반환하는 것을 관찰했다. 이것은 후보 실행 경로 확인이며 아직 actual Mod host 수용이 아니다. E2 시작 전에 CLI realpath·version, 임시 `CLAUDE_CONFIG_DIR`, 명시적 `--plugin-dir`, plugin/runtime hash와 실행 버전 `/plugin-types` declarations/hash를 기록한다. 사용자 `~/.claude`, trust, managed settings는 읽어 동작을 바꾸거나 수정하지 않는다. [환경 변수](https://code.claude.com/docs/en/env-vars)

선행 probe는 API/model 요청 없이 수행한다. session 시작, `/plugin-types`, fixture plugin loading, 실제 Mod event 전달 결과를 각각 기록하고, 모델 요청·도구 실행·설정 변경은 분리한다.

| 검사 | 격리 fixture | 수용 조건 |
|---|---|---|
| Confirm event identity | 다른 plugin/element/component/requestId, Cancel press, 임의 API 호출 | 정확한 ARC Confirm event만 현재 proposal을 소비하거나, 변조 시 발급하지 않음 |
| 표시 scope | ARC 앞·뒤 Mod가 scope/hash/label/tree를 변경 | 변경을 탐지해 확인 무효화. 확인할 수 없으면 unavailable |
| programmatic spoof | plugin-generated tool/command/API call 또는 closure/handle 재사용 | 실제 ARC Confirm과 같은 receipt를 만들지 못함 |
| session identity | `session.id` hook이 값 대체·생략 | 다른 session에 binding하지 않고 unavailable/deny |
| plugin ordering | ARC보다 앞·뒤에 adversarial Mod를 둠 | 신뢰 가능한 순서와 감지 한계를 기록; 보장되지 않으면 지원하지 않음 |
| replay/drift | 중복·동시 Confirm, 만료, reload, scope/state 변경 | 한 번만 소비하거나 모두 거부; stale receipt 없음 |
| Cancel/failure | 취소, Pane 종료, handler timeout/throw, 저장 실패 | active receipt·binding·lease 없음 |

test-only `ui.press()` 및 mock engine은 event 위조 회귀용일 뿐 사람 승인 증거가 아니다. adversarial fixture는 임시 config/plugin dir에만 둔다. 이 선행 E2 결과가 T3 provider 수용 가능 여부를 정한다. T5의 최종 artifact/lifecycle/실제 gate 검증을 대신하지 않는다.

### T3–T5 수용 기준 대체

- T3 전체는 Codex diagnostic-only 계약, portable runtime, T3b1 source 연결·fail-closed 경계, T3b2의 E1/E2 host proof, 관련 focused QA가 모두 충족될 때만 수용한다. T3b1 단독 수용은 source artifact만을 뜻하며 Claude provider 또는 T3/AC 완료로 표시하지 않는다. 무결성을 증명하지 못하거나 위조로 active receipt를 만들 수 있으면 provider는 unavailable/deny로 남긴다.
- E2 선행 검증을 통과하기 전에는 T4b Claude provider 자동 lifecycle 통합을 시작하지 않는다. T4b는 이후 ARC 소유 legacy gate를 안전히 제거하고 단일 gate ownership·trust/load/settings 보존을 확인한다.
- T5는 T4b의 최종 생성·설치 자산에서 callback, exact approval source, session/tool-use/child mapping, 실제 allow/deny, host permission 보존, 오류 한계, 설치·제거와 배포물 일치를 추가 검증한다. T3b1의 source/fake-host 증거는 E1/E2나 T5 host 근거를 대신하지 않는다. host 근거 전에 T3/T5·AC-07/09/13 완료 또는 전체 완료를 표시하지 않는다.
- AC-07에는 provider integrity unavailable 상태를 추가하고, 정상 deny·`.catch`·uncaught error/timeout·disabled/unloaded를 각각 기록한다.

작업 경로는 현재 checkout `/Users/yunho/Desktop/project/arc`, branch `feat/codex-claude-runtime-gates`, T3 기준 HEAD `675e8ab095806ab80d524046ff59965974c98437`다. 작업 파일과 현재 사용자 settings를 수정하지 않는 격리 probe만 수행한다.

### E2 선행 probe 결과 — 2026-10-31

- candidate CLI `/Users/yunho/.nvm/versions/node/v22.18.0/bin/claude`는 `2.1.314`를 보고했다. `/tmp/arc-e2-probe-20261031`의 명시적 no-op plugin fixture에 `claude plugin validate --json` 정적 검증을 실행해 성공했다. 실제 session 또는 `CLAUDE_CONFIG_DIR`는 사용하지 않았다. 결과는 plugin manifest와 hook matcher의 parse/recognition만 증명한다.
- CLI의 `claude plugin test --help`는 test module을 binary child에서 hook과 비슷한 환경으로 실행한다고 설명한다. help 확인만으로 실제 UI press나 사람 승인 provenance가 입증되지는 않는다.
- 실제 session을 시작하지 않아 실행 버전 `/plugin-types`, 실제 Mod event 전달, UI/render ordering, press identity tamper 거부, `$.session.id()` 무결성은 관찰하지 못했다. API/model 요청, 사용자 입력, live `~/.claude` 설정·credentials 접근은 없었다.
- 사용자는 이 PC에 유료 Claude Code 계정이 없어 실제 session 기반 검증이 불가능하다고 확인했다. 계정·로그인·모델 요청 없이 가능한 정적 검증으로 고정 CLI `/Users/yunho/.nvm/versions/node/v22.18.0/bin/claude` (`2.1.314`)에서 임시 빈 `CLAUDE_CONFIG_DIR`와 현재 `claude/plugin` 경로를 사용해 `claude plugin validate ... --json`을 실행했다. manifest/hooks 검증은 `success: true`, errors 없음이었다. 같은 출력의 directory 평가에는 `LICENSE_MISSING` blocking finding과 `incomplete: true`, icon warning이 있었다. 이는 정적 parse/recognition과 directory metadata만 확인하며 실제 session/API/event/host integrity 증거가 아니다. 라이선스 종류는 임의 선택하지 않았다.
- 따라서 E2와 E1은 여전히 **미완료**다. static plugin validation 또는 test harness의 존재를 actual host proof로 승격하지 않는다. T3b1 source 구현은 별도 fail-closed 경계에서 진행할 수 있지만 T3b2 활성화, T4b, T5 host 수용은 보류한다.

**현재 환경 hold:** 유료 Claude Code 계정 부재로 실제 session 기반 E1/E2 probe를 진행할 수 없다는 사용자 제약을 반영해, 이 checkout에서는 host session을 시작하거나 계정·credentials 설정을 바꾸지 않는다. isolated host session을 사용할 수 있을 때까지 T3b2, T4b 및 이에 종속된 T5는 미완료로 유지한다. T3b1 source 수용 및 위 정적 검증은 이 hold를 해제하지 않는다.

## 10. 2026-10-31 T3 실행 경계 분리 — Codex 진단 독립 수용

이 절은 T3의 수용·커밋 경계를 나눈다. 승인된 기능과 보안 보장은 바꾸지 않는다. E1/E2의 Claude host 무결성 조건, T4/T5 의존성, 최종 전체 검토는 유지한다.

### T3a — Codex diagnostic-only callback과 사용자 진단 저장소

**목표:** Codex standalone callback, 허용 목록 기반 per-user 진단 파일, portable runtime core 분리의 기존 회귀, runtime asset 생성물·manifest를 검증하고 독립 수용한다. Claude provider, approval receipt, verified binding 또는 gate는 구현·활성화·주장하지 않는다.

**선행:** T1 수용. E1 및 Claude E2 approval/identity/order 무결성과 독립이다. T2 완료 계약을 재사용한다.

**수용 기준**

- 설치 record와 entrypoint 연결을 확인하는 standalone Codex callback이 실행된다. import만으로 stdin을 읽거나 process를 종료하지 않는다.
- Codex callback은 `evaluate`, `runCodexGate`, policy decision, identity·assignment·lease 전이를 호출하지 않고 정책 decision 필드 없는 `{}`를 반환한다.
- `~/.arc/state/native-diagnostics/codex.jsonl`에는 허용된 event·callback 상태·정의/runtime hash·platform version·timestamp만 저장한다. raw payload·tool input·prompt/transcript·환경 변수·caller 권한 정보는 남기지 않는다.
- 저장 한도·권한·symlink 거부·동시 기록·실패 처리가 focused tests와 fresh QA에서 확인된다. 저장 실패/용량 초과가 policy deny나 권한 변경을 만들지 않는다.
- portable core 분리의 기존 Codex/Claude adapter 회귀·POSIX/Windows 경로 단위 검사가 통과한다. 이는 실제 Windows 실행이나 Claude native provider 수용을 뜻하지 않는다.
- generator, 양 플랫폼 runtime assets와 `MANIFEST.sha256`이 일치하고 관련 focused checks 및 fresh QA가 통과한다. Claude 자산에 공통 portable runtime이 존재하는 사실은 Claude provider 설치·등록·trust·load·callback·gate 적용 증거가 아니다.

**검증:** 현재 T3a 변경을 대상으로 진행한 fresh QA와 필요한 재검증을 사용한다.

```bash
node --test tests/node/runtime-native-hook.test.mjs tests/node/runtime-assets.test.mjs tests/node/runtime-codex.test.mjs tests/node/runtime-claude.test.mjs tests/node/runtime-capabilities.test.mjs tests/node/runtime-installed-entry.test.mjs tests/node/native-binding.test.mjs tests/node/runtime-evaluate.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
git diff --check
```

다른 필수 검증 실패는 현재 T3a 변경과의 관계·영향을 기록한다. 전체 suite 미실행 또는 과거 실패를 성공이나 부모 HEAD 기준선으로 표시하지 않는다. T5의 전체 회귀 의무는 유지한다.

**수용 범위의 한계:** T3a는 source·standalone fixture·진단 저장·portable regression·생성물의 수용이다. 실제 Codex host callback·trust·활성화·도구 관리·차단을 입증하지 않는다. Codex host 증거는 T5에 남긴다.

**보류:** 해당 focused checks/fresh QA/finding 중 하나라도 실패하거나 권한 상태를 바꾸면 T3a 수용·커밋을 보류한다. Claude E1/E2 미확인은 T3a 수용을 막지 않지만 Claude 지원 또는 전체 T3 완료를 뜻하지 않는다.

**커밋:** `feat(runtime): Codex 진단 callback과 사용자 저장소 추가`

**수용 기록:** 2026-10-31 fresh QA에서 지정 테스트 96/96 통과, runtime asset generator 54개 파일 일치, protected manifest 226개 파일 통과를 확인했다. portable policy core와 POSIX/Windows 경로 단위 검사 및 Codex allowlist/non-interference 테스트를 포함한다. 실제 Codex host callback/trust 증거는 T5 범위다. T3a commit: `7173d9b`.

### T3b1 — Claude Mods provider source와 fail-closed 경계

**목표:** 공식 Mods event/API를 소비하는 실제 Claude provider, 고정 resolver, portable policy 연결을 구현한다. host 무결성이 미검증일 때 native 권한 발급이나 gate 적용 성공을 허용하지 않는다.

**선행:** T3a 수용·커밋. 이 source 범위는 E1/E2 host acceptance와 독립적으로 구현·검사할 수 있다. 실제 provider 활성화·Claude AC 수용에는 T3b2 증거가 여전히 필요하다.

**파일 책임:** 기존 T3b의 Mod registration/provider, native context·binding·state, portable core·IO adapter, Claude adapter·capabilities, plugin assets, runtime generator/manifest와 관련 테스트를 소유한다. 설치 lifecycle은 T4b에 남긴다.

**필수 구현**

- 실제 `register(on)`이 공식 Mods event/API를 사용하고 고정 provider/resolver를 호출한다. command/tool-use/session/agent event의 정규화, 최종 도구 인수, 정책 입력 구성, host permission 결과 보존을 구현한다.
- exact-scope proposal, nonce/generation·단일 소비·만료·drift 검증을 구현한다. child assignment에는 정확한 task·role·paths·operations와 parent binding을 요구한다.
- 최초 root `/arc-bind`는 native parent binding/lease 없이 proposal을 만들 수 있다. fixed resolver는 현재 검증한 target의 `gitCommonDir/arc/workflows/<workflowId>/state.json`을 읽어 scope 제안 자료만 얻고, workflow ID·경로 안전성·checkout·문서 현재 hash·task/scope를 재검증한다. cooperative state는 별도 schema로 검증해 proposal에만 사용하며 approval·identity·lease·check provenance를 native state로 복사하거나 cooperative 파일을 수정하지 않는다. root proposal은 `parentBinding:null`이며 active authority가 아니다.
- E1/E2 전에 production Confirm은 `unavailable`로 유지하고 native state를 쓰지 않는다. 향후 검증된 실제 Confirm은 fresh `human-confirmation` provenance를 만들고 별도 native state에 root session identity·lease를 발급한다. 이는 기존 cooperative approval을 native authority로 바꾸는 동작이 아니다. 자식 proposal에는 active native parent binding/lease가 필수다.
- active binding·approval·identity·lease 발급은 현재 host provenance 무결성 조건이 확인된 경우에만 도달할 수 있다. 미확인 시 `unverified/unavailable`이고 active state를 만들지 않는다.
- `/arc-bind`는 proposal·상태 안내까지만 수행한다. `$.ui.ask()` 반환, raw JSON, user option, 환경 변수, 자체 `verified:true`로 활성화하지 않는다.
- test-only dependency injection은 harness에 한정하고, production entrypoint에는 provider 교체·검증 우회·강제 활성화 옵션을 노출하지 않는다. 오류·저장 실패가 권한을 확대하지 않는다.
- source/정적 검증 상태와 실제 provider 활성 상태를 분리한다. T4b lifecycle은 구현하지 않는다.

**검사·fresh QA:** 실제 plugin module→고정 provider→resolver/policy→portable import 연결, 유효한 cooperative state에서 proposal을 만들되 원본 bytes와 별도 native store를 변경하지 않음, root proposal의 parent/lease 부재 허용, cooperative provenance만으로 activation 불가, child proposal은 active native parent lease 없으면 거부, proposal·drift·replay·동시 소비·child assignment의 허용/거부 분기, 기본 및 모든 공개 실행 경로의 host-integrity 미확인 상태에서 active state 발급 불가, 외부 JSON/환경/협력 상태로 authority를 만들지 못함, host permission 보존과 unavailable/error 동작을 확인한다. 기존 Codex/cooperative 회귀, generator·manifest도 검사한다. source/fixture positive branch는 실제 host 증거로 표시하지 않는다.

**수용:** 연결된 실제 source와 fail-closed 경계가 focused QA에서 확인될 때 source 범위만 수용한다. host integrity 미확인 동안 production은 ARC-unbound/unverified 호출을 모두 deny한다. 이는 deny-only stub을 뜻하지 않는다. 실제 Mod callback→host 관찰→고정 resolver→권한 준비 상태 검사→portable policy core 경로가 연결되고, 같은 구현 경로의 정상·거부 policy 분기를 fixture에서 확인해야 한다. production-positive native allow는 T3b2 수용 대상이다. 상태는 `provider-source: implemented`, `host-integrity: unverified`, `provider-activation: unavailable`로 한정한다. 이는 E1/E2, Claude provider 완료, 관련 AC 완료 또는 T3 전체 완료를 뜻하지 않는다.

**보류:** source 연결·필수 checks·fresh QA 또는 미확인 상태에서의 active state 차단에 finding이 남으면 수용·커밋을 보류한다.

**커밋:** `feat(runtime): Claude Mod provider 소스와 비활성 경계 추가`

**수용 기록 — 2026-10-31:** Fresh QA에서 확인된 child assignment active parent/lease 상태 누락과 `/arc-bind` composer-origin 확인 누락을 보완하고, fresh QA 재검사에서 해결을 확인했다. 지정 테스트 88/88, runtime asset 59개, protected manifest 237개 및 `git diff --check`가 통과했다. source task commit은 `8a720b5`이다. 상태는 `provider-source: implemented`, `host-integrity: unverified`, `provider-activation: unavailable`이며 실제 host와 E1/E2 근거는 없다.

### T3b2 — Claude host 무결성 검증과 조건부 활성화

**목표:** 실제 지원 host에서 승인 표시·사용자 동작·event identity·session API·plugin ordering 무결성을 입증하고, 증명된 실행 조건에서만 T3b1 provider를 활성화한다.

**선행:** T3b1 수용, 격리 E2 환경과 실행 버전 declarations 확보. API/model request 없는 host probe를 우선하며 사용자 설정·credentials는 읽거나 바꾸지 않는다.

**수용 기준:** ARC Pane의 exact-scope 표시와 Confirm/Cancel, press identity·handler 연결, session identity 및 plugin ordering이 실제 host에서 입증돼야 한다. 위조·drift·불명확한 조건에서 receipt가 발급되지 않고, 활성화는 실제 실행 시에도 해당 조건을 검사해야 한다. 실제 사용자 확인 → session-scoped root binding → 정상 allow/deny·orphan deny → exact child assignment/spawn 연결을 확인하며 ARC allow가 host deny/ask를 확대하지 않아야 한다. 오류·timeout·unloaded/disabled 한계를 분리한다.

**보류:** UI·event·session·ordering integrity를 입증하지 못하면 provider는 unavailable/deny로 유지하며 T3b2 수용·커밋을 보류한다. T3b1 source 수용은 이 hold를 해제하지 않는다.

**커밋:** `feat(runtime): Claude host 무결성 검증과 gate 활성화`

T3 전체 완료는 T3a·T3b1·T3b2가 모두 수용된 경우에만 표시한다. T3b1 수용은 source 경계만 확정하며 T3b2 E1/E2 근거를 대신하지 않는다. 각 작업은 fresh QA와 필요한 재검증 이후 하나의 focused commit을 남긴다.

## 11. 2026-10-31 T4 실행 경계 분리 — Codex lifecycle 독립 수용

이 절은 T4의 수용·커밋 경계를 나눈다. 기존 자동 설치·갱신·제거·보존·상태 보고 계약은 유지하며, 승인 범위의 기능이나 보안 보장을 바꾸지 않는다. 공유 installer 파일은 T4a 수용 후 T4b에 순차 인계한다.

### T4a — Codex diagnostic hook 자동 관리와 상태 연결

**목표:** T3a의 Codex diagnostic-only entrypoint를 설치·재설치·갱신·제거에 연결하고, 등록 상태와 실제 host 증거를 분리해 표시한다.

**선행:** T1·T2·T3a 수용. T3a commit `7173d9b`. Claude E1/T3b와 독립이다.

**파일 책임**

- 수정: `lib/installer/plan.mjs`, `install.mjs`, `upgrade.mjs`, `lib/management/status.mjs`.
- CLI 탐지는 async orchestration에서 계획에 입력으로 전달하므로 수정: `lib/management/operations.mjs`, `lib/management/update.mjs`, `lib/npm/upgrade.mjs` 및 관련 update child protocol.
- 필요 시 수정: `lib/installer/native-hooks.mjs`, `native-cli.mjs`, `runtime-config.mjs`, `uninstall.mjs`, `lib/cli/root.mjs`, `lib/tui/render.mjs`.
- 수정: `tests/node/plan.test.mjs`, `install.test.mjs`, `management-status.test.mjs`, `management-update.test.mjs`, `upgrade-harness.test.mjs`, `upgrade-process.test.mjs`, `npm-upgrade-consumer.test.mjs`, `uninstall.test.mjs`, `tui-app.test.mjs`.
- 생성: `tests/node/native-hook-lifecycle.test.mjs`의 Codex 사례.
- 필요할 때 생성물·manifest를 갱신한다. T3a runtime 계약을 보존한다.
- Claude plugin 등록·bootstrap·native receipt·gate 활성화는 포함하지 않는다.

**구현 기준**

- `detectNativeCli`는 async management/upgrade caller에서 먼저 수행하고 결과를 순수한 `buildInstallPlan`/`buildUpgradePlans` 입력으로 전달한다. plan builder에서 subprocess, 네트워크 또는 user setting read를 실행하지 않는다. 기존 plan-purity 보장을 유지한다.
- install plan은 감지한 Codex CLI 경로·버전, 실제 entrypoint/Node 경로, diagnostic mode, runtime hash를 기반으로 설정과 `native-hooks.json`을 함께 구성한다.
- `plan.nativeHooks`에 예상 정의·소유 기록·post-publish validator 입력을 보관하고, T2의 `verifyPublished` 구간에서 설정을 재읽어 정의·경로를 확인한다.
- instruction·concurrency·wait·hook 변경은 동일 설정 파일의 단일 transaction 변경으로 합성한다. 동일 정의를 불필요하게 재작성하지 않는다.
- **재설치·갱신의 안전한 소유 기록 갱신:** 유효한 이전 소유 기록의 hash를 확인하고 기록된 설정 경로의 ARC 소유 정의가 실제 설정과 정확히 일치하며 중복·유사 참조가 없으면, CLI·runtime·entrypoint metadata 변경만으로 충돌 처리하지 않는다. 설정 경로가 동일하고 hook 정의가 같으면 설정 원본 bytes를 보존하며 감지한 CLI 경로·realpath·버전과 현재 runtime metadata로 소유 기록 및 hash만 갱신한다. hook command·정의가 바뀌면 정확히 확인한 ARC block만 같은 위치에서 교체하고 사용자 hook 순서와 관련 없는 설정 bytes를 보존한다. 설정 경로 변경, 손상·hash 불일치한 소유 기록, 실제 ARC block drift·이동·누락, 중복·모호한 정의 또는 유사 참조는 기존 conflict·보존 동작을 유지한다. 이 갱신은 T2 transaction과 rollback을 따른다.
- CLI·runtime·entrypoint·정의가 바뀌면 과거 callback 또는 host 적용 evidence를 현재 성공으로 재사용하지 않는다. 현재 조건과 결합된 근거가 없으면 trust를 `unknown`으로 표시한다. 이는 host trust를 취소·변경했다는 뜻이 아니며, 동일 정의의 불필요한 재작성으로 새 trust 절차를 유발하지 않는다.
- 제거는 T2의 소유권 검사, 설정 참조 재검증과 잔여 자산 보존을 따른다. `skipGlobal`, conflict, external drift, partial apply, rollback과 retained reference를 보고한다.
- 상태에서 Codex 등록·entrypoint 연결·trust·callback-observed·diagnostic-only를 구분한다. 등록·진단 기록을 caller identity, ARC allow/deny 또는 도구 관리 보장으로 표시하지 않는다.
- status는 전용 진단 JSONL의 안전하게 읽힌 allowlist record가 있을 때만 callback 기록을 `recorded`로 표시하고, 없거나 손상·접근 불가한 상태는 `unknown`으로 둔다. 이 기록은 host trust 또는 native policy 적용 증거가 아니다.
- 공통 status schema는 Claude 상태를 성공으로 승격하지 않는다. Claude E1/T3b/T4b는 unsupported·unknown·pending 상태로 유지한다.

**필수 focused checks와 fresh QA**

```bash
node --test tests/node/plan.test.mjs tests/node/install.test.mjs tests/node/management-status.test.mjs tests/node/management-update.test.mjs tests/node/native-hook-lifecycle.test.mjs tests/node/native-hooks-config.test.mjs tests/node/uninstall.test.mjs
node --test tests/node/upgrade-harness.test.mjs tests/node/upgrade-process.test.mjs tests/node/npm-upgrade-consumer.test.mjs tests/node/tui-app.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:manifest
git diff --check
```

fresh QA는 임시 home에서 Codex 신규 설치·재설치·갱신·제거, 사용자 훅 보존, 특수문자 경로, `skipGlobal`, conflict·drift·검증 실패·rollback·잔여 참조를 확인한다. 설치된 entrypoint를 fixture subprocess로 실행해 설치 기록과 진단 저장소 연결을 검사한다. 공유 installer 변경의 Claude 회귀도 관련 검사로 확인한다. 관련 검사/QA finding 또는 미확인 영향이 남으면 수용을 보류한다.

갱신 사례에는 이전 기록이 정확히 검증된 상태에서 CLI version/path/realpath만 변경될 때 재설치·upgrade 성공 및 설정 bytes 보존, metadata가 같을 때 완전한 idempotency, 정확한 ARC hook command 변경의 동일 위치 교체와 사용자 hook 순서 보존, 사용자 변경·위조 기록에 대한 conflict, metadata 변경 이후 과거 evidence 미승격을 포함한다. transaction 중 drift나 게시 후 검증 실패에서도 T2 rollback 및 외부 변경 보존을 확인한다.

**수용:** Codex 자동 lifecycle, 설정·자산 보존, post-publish 검증, 상태 단계 구분이 focused checks와 fresh QA에서 확인된다. 실제 Codex host trust/callback 수용은 T5에 남기며 fixture를 대신으로 사용하지 않는다.

**검증 기록 (2026-10-31):** fresh QA에서 §11.1 첫 그룹은 176개 중 167 통과·9 실패, 둘째 그룹은 84개 중 82 통과·2 실패였다. 11개 assertion 모두 T3a baseline archive에서 같은 실패로 재현되어 T4a 신규 회귀로 분류하지 않았다. `node scripts/update-runtime-assets.mjs --check`는 54개, `npm run check:manifest`는 226개를 통과했고 `git diff --check`도 통과했다. 메타데이터 refresh·제자리 command 교체·legacy entrypoint 이전·runtime drift·사용자 Stop hook 잔여 참조 보존은 fresh fixture QA에서 확인했다. 추가 post-publish runtime 변조 검사는 1/1 통과해 검증 실패, rollback 상태, residual 경로 및 외부 변경 보존을 확인했다. Orchestrator는 이 source 범위의 T4a를 수용한다. 11개 baseline 실패는 T5 전체 회귀에서 계속 추적한다. 이 검증은 실제 Codex host trust/callback을 증명하지 않으며, final Reviewer는 전체 계획 작업·필수 QA가 끝난 뒤 최종 변경을 검토한다.

**보류:** 관련 check·QA finding·안전한 참조 정리가 미완이면 T4a 수용·커밋을 보류한다. Claude E1/T3b 미확인은 T4a를 막지 않는다.

**커밋:** `feat(installer): Codex 진단 훅 자동 관리와 상태 연결`

### T4b — Claude Mod plugin lifecycle와 기존 gate 전환

**목표:** 기존 T4의 Claude plugin 설치·갱신·제거·상태 보고와 기존 ARC command gate의 안전한 전환을 수행한다.

**선행:** T4a 및 T3b2 수용, provider/UI/session/plugin-order 무결성의 E1/E2 증거. 최종 artifact의 전체 T5 검증은 이 선행 조건을 대체하지 않는다.

**범위:** T4a가 수용한 공유 installer·management·CLI/TUI·test 파일을 순차 인계받는다. `lib/installer/native-plugin.mjs`, `tests/node/native-plugin.test.mjs`, Claude plugin assets·ownership·generator/manifest를 소유한다. `native-hook-lifecycle.test.mjs`에는 Claude 사례를 추가하고 Codex 회귀를 유지한다.

**수용:** 기존 T4의 Claude Mod lifecycle·단일 gate 소유권·trust/managed 비우회·설정 및 자산 보존·상태 구분 검사와 fresh QA를 통과한다. 기존 command gate 제거가 검증되지 않으면 중복 구성을 수용하지 않는다. T4a Codex 계약을 회귀 검사한다.

**현재 보류:** T3b2와 approval/session/plugin-order E1/E2 증거가 미확인이다. 정적 `plugin validate`는 선행 조건이 아니다. 따라서 T4b 구현·수용·커밋을 보류한다.

**커밋:** `feat(installer): Claude Mod 자동 관리와 기존 gate 전환`

T4 전체 완료는 T4a와 T4b를 모두 수용한 경우에만 표시한다. 후속 의존성은 T4a: T1·T2·T3a 이후 진행, T4b: T4a·T3b2·E1/E2 이후 진행, T5: T3a·T3b1·T3b2·T4a·T4b 이후 진행이다. T4a 커밋은 Claude provider 또는 전체 T4 완료를 뜻하지 않는다. T5의 전체 host·분배물·정책·문서 검증과 최종 Reviewer는 유지한다.

## 12. 2026-10-31 사용자 요청 — Codex 범위 독립 완료

사용자는 전체 플랫폼 작업이 아직 남아 있는 상태에서 Codex 범위만이라도 완성하기를 요청했다. 아래 T5a는 기존 T5의 Codex 진단 전용 범위를 독립 수용하는 실행 경계다. 이는 Codex allow/deny 기능 추가, T5 전체 완료, Claude 완료 또는 전체 plan 완료를 뜻하지 않는다. 전체 T5와 최종 Reviewer의 선행 조건은 유지한다.

### T5a — Codex diagnostic-only probe와 분배물

**선행:** T1, T2, T3a, T4a source 범위 수용. Claude E1/E2, T3b2, T4b와 독립이다. 실행 대상은 현재 사용자 설정과 분리한 임시 `HOME`·`CODEX_HOME`·workspace 및 명시적인 Codex CLI다.

**범위:** Codex 전용 host probe와 probe 안전성 테스트, 설치/plan의 오래된 native-hook 부재 기대, package inventory 테스트, Codex diagnostic-only policy notice·README·runtime 문서, 역할 정책 생성물·manifest를 현재 구현과 일치시킨다. `scripts/probe-runtime-hooks.mjs`가 현재 사용자 홈/설정으로 fallback하거나 `--dangerously-bypass-hook-trust`를 사용할 수 없어야 한다. host trust는 실제 Codex `/hooks` exact-definition 검토 경로를 따른다. `tests/node/install.test.mjs`와 `tests/node/plan.test.mjs`는 Codex의 ARC 소유 진단 hook을 반영하면서 Claude의 no-hook 계약과 unowned user hook 보존을 유지한다.

**source·fixture 수용:** probe는 명시적인 격리 CLI·home·workspace 없이 host 실행을 거부한다. probe test가 user-home fallback과 trust bypass를 거부함을 확인한다. Codex 진단 전용 policy notice·README·runtime 문서, package, 생성 정책·manifest를 검사한다. isolated fixture에서는 allowlist metadata, `runNativeHook()`의 `{}` 반환과 설치 entrypoint의 exit 0·빈 stdout 중립 응답, workflow policy state/identity/assignment/lease 무전이, 사용자 hook 보존과 제거 후 ARC 참조 정리를 확인한다. 이는 actual host callback/trust 증거가 아니다.

**host 수용은 T5b:** 등록·entrypoint·trust·callback-observed를 각각 검증한다. host callback이 입증되지 않은 상태는 등록 상태를 callback 성공으로 승격하지 않고 test fixture를 actual host 증거로 사용하지 않는다.

실제 `PreToolUse`를 발화하기 위한 tool call이 Codex 모델 요청을 요구하고 준비된 로컬 모델이 없다면, Codex plan usage를 소비하는 요청을 보내기 전에 멈춰 Orchestrator가 필요한 요청·예상 usage 범위를 알리고 사용자 승인을 받는다. API key나 pay-as-you-go credentials를 설정·사용하지 않는다. hook trust bypass는 금지한다.

**focused checks:**

```bash
node --test tests/node/native-hook-probe.test.mjs tests/node/package.test.mjs tests/node/manifest.test.mjs tests/node/runtime-assets.test.mjs tests/node/role-policy.test.mjs tests/node/native-hook-lifecycle.test.mjs tests/node/runtime-native-hook.test.mjs tests/node/install.test.mjs tests/node/plan.test.mjs
node scripts/update-runtime-assets.mjs --check
npm run check:role-policy
npm run check:manifest
git diff --check
```

**T5a 수용:** source/docs·fixture와 fresh focused QA가 끝나면 `codex-source: complete`, `codex-host: unverified`로 수용할 수 있다. 이는 Codex slice 전체 완료가 아니다. `T5` 전체는 Claude host, lifecycle, distribution 조건과 final Reviewer가 끝날 때까지 미완료다.

**2026-10-31 T5a source 수용 기록:** 독립 fresh QA에서 source/package/fixture 기준을 proven으로 확인했다. 지정 focused node suite 234/234 통과, runtime asset 59개, role-policy 24개 대상, manifest 238개 파일, `git diff --check` 통과. source 변경은 `88a6707497aef3fc7e98e44c22154006f43f34fd` (`feat(runtime): Codex 진단 훅 probe와 분배물 검증 추가`)로 커밋했다. 현재 상태는 `codex-source: complete`, `codex-host: unverified`, `codex-slice: incomplete`다. 실제 Codex session, `/hooks` trust, host callback 및 Codex plan/model 사용은 검증하지 않았다. 전체 T5와 final Reviewer는 계속 보류한다.

### T5b — Codex isolated host trust와 callback 증거

**선행:** T5a 수용, explicit isolated `HOME`/`CODEX_HOME`/workspace 및 Codex CLI 확보. 현재 CLI `/Users/yunho/.nvm/versions/node/v22.18.0/bin/codex`는 `0.166.0`으로 관찰했다. 사용자의 실제 config/auth를 복사하거나 읽지 않고, hook-trust bypass 옵션을 사용하지 않는다.

**수용 기준:** 새 설정에서 trust 전 callback 미관찰, `/hooks`에서 exact definition 검토·trust 후 실제 `PreToolUse` callback, exit 0·빈 stdout의 중립 성공 응답(정책 decision JSON 없음), allowlist diagnostics만 기록, workflow policy state·lease 무전이, trust hash와 제거 후 ARC entry/user hook 보존을 입증한다. 이 증거는 Codex diagnostic-only 범위만 완성한다.

**사용량 제약:** 이 PC에는 Ollama·LM Studio 실행 파일이 발견되지 않았다. 실제 `PreToolUse`를 일으키기 위해 모델 tool call이 필요하고 로컬 모델을 사용할 수 없다면, 사용자 Codex plan usage를 소비하는 요청을 하기 전에 정확한 행위와 예상 사용량 영향을 알리고 사용자 승인을 받는다. API key 또는 pay-as-you-go credentials는 설정·사용하지 않는다.

**수용:** host evidence와 독립 QA가 통과할 때 `codex-slice: complete`로 수용한다. source/docs·fixture만 완료된 경우는 `codex-source: complete`, `codex-host: unverified`, `codex-slice: incomplete`를 유지한다. Claude와 전체 T5 완료 표시는 여전히 보류한다.
