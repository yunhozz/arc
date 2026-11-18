# Grok 플랫폼 지원과 홈 메뉴 개편 구현 계획

> **실행 방식:** ARC Orchestrator가 작업마다 새 Implementer를 배정합니다(Codex bridge `arc_routing_implementer`, 작업마다 fresh, `allowedPaths`는 아래 각 작업의 정확한 파일 목록). 각 작업은 fresh QA(Codex bridge)를 거쳐 Orchestrator가 수용하고, 수용된 작업 하나당 커밋 하나를 Orchestrator가 만듭니다. Implementer와 QA는 Git 상태를 바꾸지 않습니다. 모든 작업이 수용된 뒤 native Reviewer가 전체 변경을 1회 검토합니다.

**Goal:** 공식 xAI Grok Build CLI를 ARC의 네 번째 플랫폼(`grok`)으로 등록합니다. capability 9개는 모두 off로 출하하고, 코드·payload·bridge·composite 경로는 주입 registry와 fake `grok`으로만 검증합니다. 같은 변경에서 홈 메뉴 `Install / Update`를 `Configure`로 바꾸고 `Check Version`을 `Status`에 합칩니다.

**Architecture:** Gemini 선례(접근안 A, D5)를 그대로 따릅니다.
- capability의 원천은 runtime descriptor(`lib/runtime/platform-registry.mjs`)이고, 설치기 descriptor(`lib/platforms/grok.mjs`)는 이를 참조만 합니다.
- `'grok'` 리터럴 분기는 기존 하드코딩 허용 목록 파일 안에만 둡니다.
- bridge 계약은 새 runtime 모듈 `lib/runtime/grok-stream.mjs`의 `GROK_CONTRACT`에 모으고, 기존 `Map<id, impl>` 세 곳(args, supervisor, permissions)에 grok을 추가합니다.
- 메뉴 개편(T1, T2)은 Grok과 논리적으로 독립입니다. 다만 공유 생성물(`MANIFEST.sha256`, golden)과 TUI 테스트 파일이 겹치므로 먼저 직렬로 실행합니다.

**Tech Stack:** Node.js ≥22 ESM(`.mjs`), `node:test`, 기존 safe-fs, PTY 헬퍼(`tests/node/helpers/tui-terminal.mjs`), 주입 registry(`createPlatformRegistry`/`createInstallerRegistry`), fake CLI fixture

**Spec:** `docs/superpowers/specs/2026-11-18-grok-platform-support-design.md` (v1, 승인 2026-11-18T01:35:02Z, sha256 `c7b2e686…`). 선례: `docs/superpowers/plans/2026-11-16-gemini-platform-phase-b.md`. plan 단계 사실 조사: `.git/arc/workflows/grok-support/dispatches/56cea4d7-ed67-4c58-a725-d99b28b93241/result.md`(U-K5/U-K6/U-K7, 모델 ID, 테스트 대응표 후보)

**기준:** 브랜치 `feat/grok-support`, 시작 HEAD `564ea20`(+ spec·plan docs 커밋). 테스트 기준선은 부록 B(T1 시작 전 Orchestrator가 측정)입니다.

## Global Constraints

- `lib/runtime/**`는 `lib/runtime` 안만 import합니다(`./` 또는 `node:`).
- 새 runtime 모듈(`grok-stream.mjs`)은 T5 한 작업 안에서 다음을 모두 함께 갱신합니다.
  - `RUNTIME_MODULE_PATHS`(`lib/installer/runtime-assets.mjs`, 알파벳 순서로 `git-query.mjs` 뒤)
  - `COOPERATIVE_RUNTIME_MODULES`(`lib/runtime/bootstrap.mjs:11`)
  - `MANIFEST.sha256`
  - `tests/node/fixtures/installed-layout-golden.json`
  - `node scripts/update-runtime-assets.mjs --check`
  - `shared/skill/runtime/` 사본
  - `tests/node/runtime-assets.test.mjs` `expectedPaths`
  - `tests/node/runtime-versions.test.mjs` 모듈 목록과 baseline
- `shared/skill/runtime/**`는 손으로 고치지 않습니다. `node scripts/update-runtime-assets.mjs`로만 동기화합니다(이 스크립트는 `lib/policy/role-policy.json`도 복사합니다).
- `lib/policy/role-policy.json`에 허용되는 변경은 두 가지뿐입니다: 모든 `controls` 객체에 `"grok": "prompt"`(현재 `gemini` 키가 있는 15곳) 추가, 그리고 `platforms.grok` 추가(notice는 spec 12장 문자열 그대로).
- symlink home은 지원하지 않습니다(Gemini spec 결정 11). `~/.grok`와 그 조상에도 적용합니다.
- capability 상태의 원천은 runtime descriptor입니다. 설치기·TUI·management는 이를 참조만 합니다.
- `'grok'` 리터럴 분기는 다음 파일에서만 허용합니다: `platform-registry.mjs`, `role-bridge-args.mjs`, `role-supervisor.mjs`, `role-dispatch-policy.mjs`, `role-routing.mjs`, `role-bridge.mjs`(`lib/runtime`과 `shared/skill/runtime` 사본). `lib/platforms/**`, `lib/watch/**`는 기존 예외입니다. 그 밖의 파일에 필요하면 작업을 hold하고 Orchestrator에게 보고합니다.
- Grok 레지스트리 값
  - `id 'grok'`, `label 'Grok'`, `displayOrder 3`, `anchorOrder 3`
  - `home.env 'GROK_HOME'`: 설정되어 있으면 `throw Error('GROK_HOME is not verified')`, 기본은 `~/.grok`
  - `cli.command 'grok'`, `cli.supportedVersions '>=1.0.0 <1.1.0'`
  - `auth.kind 'none'`, `models.effortField 'effort'`
  - `profile.ext 'md'`, `standaloneName arc-<suffix>`, `routingName arc-routing-<suffix>`
  - `executionEnvironments ['grok-cli']`
  - `validatePair`: `validText(model) && /^[A-Za-z0-9][A-Za-z0-9._:/@+\-]*$/.test(model) && effort === 'default'`
- Grok capability 초기 상태는 전부 `off`이고 reason은 정확히 다음 값입니다.
  - `install`: `install layout not verified`
  - `nativeProfile`: `native profile format not verified`
  - `catalog`: `catalog not verified`
  - `standalone`: `standalone not verified`
  - `bridge`: `bridge contract not verified`
  - `compositeRole`: `composite role not verified`
  - `compositeHost`: `composite host not verified`
  - `authProbe`: `no official auth status command`
  - `watch`: `watch support out of scope`
- 정확한 문구(Grok)
  - `Grok is not available: capability not verified`
  - `Grok - Unavailable  (capability not verified)`
  - `Grok  (not installed)`
  - `Grok config.toml is preserved.`
  - `GROK_HOME is not verified`
  - Notes: `GROK_HOME is not verified (Grok)`
  - Status 플랫폼 값: `Not verified`
- 정확한 문구(메뉴, spec 13장)
  - 홈 메뉴: `Configure`, `Status`, `Uninstall`, `Exit`
  - `'Configure was not retried.'`
  - `'Harness update did not complete. Run arc again and choose Configure to retry the harness update.\n'`
  - `'After upgrading ARC, run Configure again.'`
  - `'Mixed routing will move to the Claude home the next time you apply Configure.'`
  - coordination.md: `…run Configure again; until then routing holds as \`activation_unverified\`.`
  - Status Note: `No installed ARC harness; run Configure first.`
  - Version 행 값: `<current> → <latest>`, `<current> · up to date`, `<current> · latest unavailable`
  - `update.mjs:56,58`의 `check the version again`은 유지합니다(D14).
- resume hold 문구(전 플랫폼 공통): `'Update ARC after verifying platform session resume against the recorded session UUID.'`
- gate: `BRIDGE_GATE_RESULTS.GK1 = 'fail'`, `GK2 = 'fail'`. reason code는 기존 것만 씁니다: `capability_not_verified`, `permission_scope_unverified`, `host_sandbox_blocked`, `resume_unverified`, `permission_violation_observed`, `execution_failed`, `execution_identity_unverified`, `invalid_output`, `model_effort_mismatch`.
- 금지
  - 인자: `--always-approve`, `--allow`, `-c`, `--continue`, `-r`, `--resume`, `--prompt-json`, `-p`, `--single`, `--effort`, `--reasoning-effort`, `--sandbox off`, `bypassPermissions`, 그리고 `-` 로 시작하는 `-m` 값
  - `~/.grok/config.toml` 읽기·쓰기
  - live 증거 없이 `verified`로 바꾸는 것
  - `docs/superpowers/{specs,plans}/**`의 과거 문서 수정(이 계획 문서의 진행 기록 갱신은 제외)
- 바꾸지 않는 것: management API의 `kind`/`target` 의미, 파일 이름, marker 형식, `lib/watch/**`(grok은 `PLATFORM_COLORS.other`).
- Claude/Codex/Gemini 생성물은 13.1 문구 변경(T1)과 8.4 resume 문구 일반화(T5)를 빼면 바이트 단위로 같아야 합니다.
- 테스트 전용 fixture는 `tests/node/fixtures/**`에만 둡니다. 운영 코드는 이를 import하지 않습니다.
- bridge Implementer·QA는 live `grok`, 네트워크, 실제 home 설치를 실행하지 않습니다. 전체 `npm test`, PTY, `npm view`, `npm pack --dry-run`은 Orchestrator가 호스트에서 실행하고 결과를 QA에 제공합니다.
- 커밋 메시지는 `type(scope): 한국어 설명` 형식이며, 수용 후 Orchestrator가 만듭니다.

### 표준 마무리 절차 (STD-CLOSE, 모든 코드 작업의 마지막 검증 단계)

1. `lib/runtime/**` 또는 `lib/policy/role-policy.json`을 바꿨다면 `node scripts/update-runtime-assets.mjs`를 실행합니다. 이어서 `node scripts/update-runtime-assets.mjs --check`가 `Runtime payload verified`를 내야 합니다.
2. runtime 또는 설치 payload 해시가 바뀌었다면 다음을 갱신합니다.
   - `node tests/node/fixtures/installed-layout.mjs --write`로 golden을 갱신합니다.
   - `tests/node/runtime-versions.test.mjs` baseline이 바뀌면 의도된 값으로 고칩니다.
   - `node tests/node/fixtures/installed-layout.mjs --diff`에서 차이가 없어야 합니다.
3. `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest`가 통과해야 합니다.
4. `npm run check:role-policy`가 통과해야 합니다. T4 전에는 생성물 변경 0건이어야 합니다. T4 이후에는 grok 생성물만 새로 생기고 claude/codex/gemini 생성물은 무변경이어야 합니다.
5. `node scripts/check-installer-parity.mjs`가 통과해야 합니다.
6. 작업 단위 테스트(`node --test <작업 테스트 파일들>`)가 PASS여야 합니다.
7. `npm test`(Orchestrator 호스트 실행)에서 부록 B 기준 밖 신규 실패가 0건이어야 합니다("검증 판정" 절).
8. TUI를 바꾼 작업(T1, T2, T3)은 `node --test tests/node/tui-app-pty.test.mjs`(Orchestrator 호스트)가 기준 실패 외 PASS여야 합니다.
9. `git status --short`에는 해당 작업 Files와 생성물만 보여야 합니다. `git diff --stat -- claude codex gemini`는 T1(coordination.md 3개)과 T4(정책 생성물 무변경 확인) 외에는 비어 있어야 합니다.
10. 기존 테스트를 고쳤다면 Orchestrator가 수정된 파일마다 HEAD 대비 `assert` 호출 수가 줄지 않았는지 확인하고, 대응표를 부록 A에 기록합니다.

### 기존 단언 3→4 분류 규칙(R7, 모든 작업 공통)

기존 테스트가 실패하면 Implementer는 단언마다 아래 분류를 정하고 Implementer 보고의 대응표(파일:행, old, new, 분류, 근거)에 넣습니다. Orchestrator는 이를 부록 A에 기록합니다. capability off라는 이유만으로 숫자를 일괄 3→4로 바꾸지 않습니다.

| 분류 | 정의 | 처리 |
|---|---|---|
| R 전체 registry 열거 | 기대값이 운영 registry 전체를 열거하는 경우: `platformIds`/`byDisplayOrder`/`byAnchorOrder`, `collectStatus` 결과, Status 플랫폼 행, Uninstall/Hosts/편집기 플랫폼 행, payload 존재 기준 목록(`modelInputs`, golden `COMBINATIONS`, 패키지 복사 목록) | `grok`을 마지막에 추가 |
| V verified 필터 열거 | install·standalone·compositeRole/Host verified로 거른 결과: `target:'all'` install/preset/uninstall 결과·plans, `collectInstalledState().targets`, upgrade plans, composite 기본 집합 | 변경 없음. 실패하면 결함 후보이므로 hold하고 보고 |
| S 명시 시나리오 | 입력에서 플랫폼을 명시한 경우(예: `gemini-composite.test.mjs` sets, `editHosts({rolePlatforms:[…]})`, `management-update.test.mjs` 결과 fixture) | 변경 없음 |
| M 메뉴·문구 | 13장 문자열, 홈 배열, 메뉴 이동 횟수, Status 정렬 | spec 13장 값으로 교체 |
| K P-K7 의미 변경 | install off 주입 플랫폼의 probe 호출 여부 | T3에서만 허용, 근거 기록 |

Scouter 대응표(56cea4d7 B장)는 후보 목록일 뿐입니다. 각 작업에서 grep으로 확정합니다.
- 실패한 단언의 파일이 그 작업의 Files 밖이면 Implementer는 편집 없이 반환합니다.
- Orchestrator는 그 파일을 허용 목록에 넣을지 판단하고 진행 기록에 남깁니다(Gemini T8 선례).

## Review Focus

1. **`GROK_HOME`이 설정된 사용자(다른 도구 설정 등).**
   - 기대 동작: Grok home 해석은 실패합니다. 그래도 Claude/Codex/Gemini의 Configure, Status, upgrade는 막히지 않아야 합니다. Status에서 Grok은 `Not verified`이고, Notes에 `GROK_HOME is not verified (Grok)`가 나옵니다.
   - 테스트: T3 `GROK_HOME set does not block other platforms`
2. **PATH에 커뮤니티 `grok`(`grok-dev`)이나 다른 `grok` 바이너리가 있는 사용자.**
   - 기대 동작: Status, Configure, Uninstall, management 어느 경로에서도 실행되지 않습니다(D10, U-K1).
   - 테스트: T3 `fake grok on PATH is never executed`, T3 PTY 1건
3. **오프라인이거나 npm 문맥 밖에서 Status에 들어가는 경우.**
   - 기대 동작: 플랫폼 상태는 표시되고 `Operation unavailable`로 가지 않습니다. Version 행은 `· latest unavailable`이고 Note에 오류 첫 줄이 나옵니다.
   - 테스트: T2 `status prepare exception keeps platform rows`, `status latestError`
4. **ARC harness를 설치하지 않았는데 새 버전이 있는 사용자.**
   - 기대 동작: `Up to date`로 잘못 보이지 않습니다. 화살표 행과 `No installed ARC harness; run Configure first.`가 나오고 Upgrade 행은 없습니다.
   - 테스트: T2 `status harness 0 with newer version`
5. **세그먼트 디렉터리에 `prompt.md`가 이미 있거나 symlink인 경우(재시도 잔여물·공격).**
   - 기대 동작: `O_EXCL`이므로 child 없이 `execution_failed`가 되고, symlink 대상은 바뀌지 않습니다.
   - 테스트: T5 `existing or symlinked prompt.md fails before spawn`

## 사전 조건 (Orchestrator)

- **P0-a 기준선:** T1 시작 전 docs 커밋 HEAD에서 `npm test`를 실행합니다. 실패 이름 목록을 부록 B에 기록하고, PTY 파일 단독 결과도 기록합니다.
- **P0-b npm 최신 버전(D9, U-K14):** T3 시작 전 `npm view @xai-official/grok version`을 실행해 진행 기록에 남깁니다.
  - `1.0.x`이면 range `'>=1.0.0 <1.1.0'`을 그대로 씁니다.
  - 다른 minor이면 T3을 hold하고 사용자에게 보고합니다. range 값은 spec 11.4의 고정값이라 spec 개정 대상입니다.
- **P0-c 계획 결정:** 아래 "계획 결정 기록" OD-1, OD-2의 확정값을 T3·T5 브리프에 넣습니다.

---

## 의존성과 실행 순서

**논리 DAG**

| 작업 | 제목 | 선행 |
|---|---|---|
| T1 | Configure 이름 변경 | P0-a |
| T2 | Status 병합(버전 자동 조회) | T1 |
| T3 | Grok registry 등록(runtime·설치기 descriptor, 형식, 카탈로그, `controls.grok`, 잔존 검사, P-K7) | T2, P0-b, P0-c |
| T4 | Grok payload·설치·제거(`platforms.grok`, manifest, golden) | T3 |
| T5 | Grok bridge(`grok-stream.mjs`, 인자·프롬프트 파일·관찰·gate·resume, sessionId 예약, host gate) | T3, T4 |
| T6 | Grok 참여 composite 통합(주입 registry) | T5 |
| T7 | 문서(README, harness-operation 최소 범위) + 잔존 리터럴 최종 범위 | T1–T6 |
| FR | 최종 독립 Reviewer 1회 | T1–T7 수용, 필수 QA·재확인 완료 |

**공유 계약과 직렬화 근거**

- 모든 작업이 `MANIFEST.sha256`을 바꿉니다. T1, T3, T4, T5는 golden도 바꿉니다. 같은 생성물을 동시에 고칠 수 없으므로 **실제 실행은 전부 직렬**입니다: T1 → T2 → T3 → T4 → T5 → T6 → T7 → FR.
- 같은 파일을 고치는 작업 쌍:
  - `lib/tui/app.mjs`, `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`: T1 → T2 → T3
  - `lib/management/status.mjs`: T1(문구) → T3(P-K7)
  - `lib/policy/role-policy.json`: T3(`controls.grok`) → T4(`platforms.grok`)
  - `tests/node/grok-capability-evidence.test.mjs`: T3(생성) → T5(GK·resume 항목 추가)
  - `tests/node/menu-label-residual.test.mjs`: T1(생성) → T2(`Check Version` 추가) → T7(문서 2개 추가)
  - `lib/runtime/role-routing.mjs`: T5만
- 분리할 수 없는 계약은 한 작업에 묶습니다.
  - runtime descriptor + 설치기 descriptor + 형식 모듈 + 카탈로그 + `controls.grok` + 잔존 패턴 + 운영 registry를 열거하는 기존 단언(R 분류) + TUI 스냅샷: **T3**. registry에 넣는 순간 R 분류 단언이 모두 바뀌므로 떼어 내면 T3이 `npm test`를 통과하지 못합니다.
  - payload + `platforms.grok`: **T4**. `lib/policy/render.mjs:6,33-37`의 `POLICY_TARGETS`가 `platforms` 키로 `grok/skill/**`, `grok/agents/**` 파일을 요구하므로 payload 없이 `platforms.grok`만 넣을 수 없습니다(OD-5).
  - `grok-stream.mjs` + runtime 모듈 갱신 세트 + bridge 인자·supervisor·gate + `role-routing.mjs` sessionId 예약·host gate: **T5**. fake grok 통합 테스트가 `prepareRoleDispatch`의 UUID 예약과 host gate를 거쳐야 AC-K5/K6이 성립합니다(OD-4).
- 논리적 독립: {T1, T2} ↔ {T3–T6}. 실패 시 hold 범위를 정할 때 씁니다.

**초기 ready batch:** T1(단독). 이후는 위 직렬 순서대로 진행합니다.

**hold 범위(실패 시)**

- T1 또는 T2가 해결되지 않으면 T3–T6은 논리적으로 독립입니다. Orchestrator는 공유 파일(`status.mjs`, TUI 테스트, MANIFEST, golden)의 기준을 확인한 뒤 해제할 수 있습니다. T7과 FR은 hold합니다.
- T3이 실패하면 T4–T7을 hold합니다.
- T4가 실패하면 T5(설치 routing profile 파싱 의존)·T6·T7을 hold합니다.
- T5가 실패하면 T6·T7을 hold합니다. T6이 실패하면 T7을 hold합니다.
- 필수 검사가 하나라도 미해결이면 해당 작업 수용은 보류합니다.

**필수 QA:** risk significant이므로 **T1–T7 모두 수용 전에 fresh QA(Codex bridge)**를 둡니다.
- QA는 해당 작업의 수용 기준을 독립 확인합니다.
- sandbox에서 실행할 수 없는 전체 suite·PTY 결과는 Orchestrator가 호스트에서 실행해 QA에 제공합니다.
- QA 지적은 Implementer → QA 재확인으로 처리합니다.
- Reviewer는 작업마다 두지 않습니다(FR 1회).

---

### Task T1: Configure 이름 변경

**AC:** AC-M1(13.1 문자열, `Install / Update` 잔존 0 — 코드·payload·테스트 범위), AC-K7(13.1 문구 외 생성물 무변경)

**목표:** 홈 메뉴 라벨과 13.1 표의 사용자 문구를 `Configure`로 바꿉니다. `Check Version` 항목은 T2까지 그대로 둡니다(OD-3). 내부 id `install`은 유지합니다.

**Files:**
- Modify(운영):
  - `lib/tui/app.mjs`(`:11` 라벨 `'Configure'`, `:99` `'Configure was not retried.'`)
  - `lib/tui/setup.mjs`(`:153` 제목 `'Configure'`)
  - `lib/management/update.mjs`(`:21`)
  - `lib/management/operations.mjs`(`:146`)
  - `lib/management/status.mjs`(`:25`)
  - `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`, `gemini/skill/references/coordination.md`(각 1행)
- Modify(테스트, M 분류)
  - `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-setup.test.mjs`
  - `tests/node/tui-render.test.mjs`, `tests/node/tui-terminal.test.mjs`
  - `tests/node/composite-live.test.mjs`, `tests/node/anchor-migration.test.mjs`
  - `tests/node/npm-lifecycle.test.mjs`, `tests/node/upgrade-cli.test.mjs`, `tests/node/tui-package-consumer.test.mjs`
  - `tests/node/install-mode-n-platform.test.mjs`, `tests/node/composite-instructions.test.mjs`
- Create: `tests/node/menu-label-residual.test.mjs`
- 생성물: `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/fixtures/instruction-contracts.json`(coordination 해시가 있으면)

**Interfaces:**
- Produces: `tests/node/menu-label-residual.test.mjs`의 스캔 대상 = `package.json` `files`에서 부정 패턴(`!`)을 뺀 실제 존재 경로 + `tests/node`. 자기 자신은 제외하고, 추가 문서 목록 `EXTRA_PATHS = []`를 둡니다. 금지 리터럴은 소스에 그대로 쓰지 않고 `'Install / ' + 'Update'`처럼 조립합니다. T2는 `'Check ' + 'Version'`을, T7은 `EXTRA_PATHS`에 `README.md`, `docs/harness-operation.md`를 추가합니다.

- [ ] **Step 1: 실패 테스트 작성**
  - `menu-label-residual.test.mjs`: `no legacy Install/Update label in shipped code, payloads or tests` — 일치 목록 `[]`
  - `tui-app.test.mjs` 홈 배열 기대값을 `['Configure','Status','Check Version','Uninstall','Exit']`로 바꿉니다.
  - force finish 재시도 불가 문구 `'Configure was not retried.'`
  - `update.mjs` `report` 실패 stderr 문자열(spec 13.1)
  - `operations.mjs:146`, `status.mjs:25` 문자열 단언(기존 테스트가 있으면 교체, 없으면 해당 기존 파일에 1건씩 추가)
- [ ] **Step 2:** `node --test tests/node/menu-label-residual.test.mjs tests/node/tui-app.test.mjs tests/node/tui-setup.test.mjs tests/node/tui-render.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 문자열 교체(코드는 문자열만 바꿈). coordination.md 3개는 해당 문장 하나만 바꿉니다.
- [ ] **Step 4:** Step 2 묶음과 나머지 Files 테스트가 PASS
- [ ] **Step 5:** STD-CLOSE 2–9. PTY는 Orchestrator가 호스트에서 실행합니다.

**수용 기준:**
- `rg -n "Install / Update" --glob '!docs/**' --glob '!README.md'` 0건
- `git diff -- claude codex gemini`는 coordination.md 3개의 해당 1행뿐
- `check:role-policy` 무변경
- `update.mjs:56,58` 문구 유지

**필수 검사:** 작업 테스트, PTY, `npm test`, golden `--diff`, `check:manifest`, `check:role-policy`, parity
**필수 QA:** 예(문자열 전수, 생성물 바이트 범위)
**보류 조건:**
- 13.1 표 밖의 사용자 문구가 바뀌면 보류합니다.
- coordination.md 밖의 claude/codex/gemini 생성물이 1바이트라도 바뀌면 보류합니다.

**커밋:** `refactor(tui): 홈 메뉴 Install / Update를 Configure로 변경`

---

### Task T2: Status 병합(버전 자동 조회)

**AC:** AC-M2, AC-M1(`Check Version` 잔존 0 — 코드·테스트 범위)

**목표:** 홈에서 `version` 항목과 분기를 제거합니다. Status 진입 시 `ui.busy(() => prepareRequest({kind:'update'}))`로 버전을 조회하고, 13.2 표의 Version 행·Notes·조건부 Upgrade를 표시합니다.

**Files:**
- Modify:
  - `lib/tui/app.mjs`(`:11` 홈 배열 최종값, `:130` status 분기, `:131` version 분기 제거)
  - `lib/tui/mode.mjs`(`statusInfo` 확장, `statusVersion` 추가)
  - `lib/management/update.mjs`(`newer` → `export function isNewerVersion`, 내부 호출 3곳 교체)
  - `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-render.test.mjs`, `tests/node/tui-terminal.test.mjs`
  - `tests/node/npm-lifecycle.test.mjs`, `tests/node/upgrade-cli.test.mjs`, `tests/node/install-mode-n-platform.test.mjs`
  - `tests/node/upgrade-harness.test.mjs`(이 파일들의 `Check Version`/`'version'` 홈 항목 단언이 있는 경우)
  - `tests/node/menu-label-residual.test.mjs`(`'Check ' + 'Version'` 추가)
- 생성물: `MANIFEST.sha256`

**Interfaces:**
- Produces:
  - `isNewerVersion(left: string, right: string): boolean`(`lib/management/update.mjs`, 기존 `newer`와 같은 동작)
  - `statusVersion({prepared = null, failed = null, packageVersion}) -> {currentVersion: string, latestVersion: string|null, canUpgrade: boolean, newerWithoutHarness: boolean, message: string|null}`(`lib/tui/mode.mjs`)
    - prepared가 있을 때: `currentVersion = prepared.currentVersion`, `canUpgrade = prepared.canUpgrade`, `newerWithoutHarness = !canUpgrade && prepared.state.targets.length === 0 && latestVersion !== null && isNewerVersion(latestVersion, currentVersion)`, `message = prepared.latestError?.message` 첫 줄 또는 `null`
    - failed가 있을 때: `currentVersion = packageVersion`, `latestVersion = null`, `canUpgrade = false`, `newerWithoutHarness = false`, `message = failed.message` 첫 줄
  - `statusInfo(installState, statuses, registry = installerRegistryOf(), {version} = {}) -> {info, infoTones}`
    - `version`이 없으면 현행 출력과 바이트 동일
    - `version`이 있으면 플랫폼 행 뒤에 `''`와 `row('Version', value)`를 넣습니다. `labelWidth`에 `'Version'`을 포함합니다.
    - value 규칙: `canUpgrade || newerWithoutHarness` → `${current} → ${latest}`, 그 밖에 `latestVersion !== null` → `${current} · up to date`, 그 밖 → `${current} · latest unavailable`
    - version note: `newerWithoutHarness`이면 `No installed ARC harness; run Configure first.`, latest unavailable이면 `message`(있을 때). Notes 블록에서 플랫폼 note 뒤에 `• <message>` 형식(접미사 없음)으로 붙이고, 같은 version note는 하나로 합칩니다.
    - infoTones: Version 행과 그 앞 빈 행은 `undefined`, version note는 `'note'`
- Consumes: 기존 `prepareOperation(context, {kind:'update'})` 반환 `{currentVersion, latestVersion, canUpgrade, latestError, state:{targets}}`

- [ ] **Step 1: 실패 테스트 작성**(`tui-app.test.mjs`, 주입 `prepareOperation`)
  - `home has Configure, Status, Uninstall, Exit`
  - `status up to date shows version row and Back only`: `0.4.2 · up to date`, actions `['Back']`, selected 0
  - `status upgrade available selects Back by default and Upgrade executes the prepared snapshot`: info에 `0.4.2 → 0.4.3`, rows `['Upgrade','Back']`, selected 1. Upgrade 선택 시 `executeOperation`이 같은 prepared 객체로 1회 호출됩니다. global 결과 `exitSession`이면 세션 종료, npx는 `Result` 페이지(현행 기대값 재사용)
  - `status harness 0 with newer version`: `0.4.2 → 0.4.3`, Note `No installed ARC harness; run Configure first.`, Upgrade 행 없음
  - `status latestError`: `0.4.2 · latest unavailable` + 오류 첫 줄 Note
  - `status prepare exception keeps platform rows`: prepare가 `Run arc from a verified global ARC installation or npx`로 throw하면 `<packageVersion> · latest unavailable`, 플랫폼 행 유지, `Operation unavailable` 페이지 호출 0회
  - `status propagates cancel, eof and home from prepare`: `ARC_CANCELLED`/`ARC_TUI_EOF`/`ARC_TUI_HOME` 각각 전파
  - `statusInfo aligns Version with platform labels`: `Mode` 행과 `Version` 행의 값 시작 열이 같고, `version` 미지정이면 기존 출력과 deepEqual
- [ ] **Step 2:** `node --test tests/node/tui-app.test.mjs tests/node/menu-label-residual.test.mjs`. 기대: FAIL
- [ ] **Step 3:** spec 13.2 진입 흐름 1–5대로 구현합니다. `busy` 안의 예외는 세 코드만 다시 throw하고 나머지는 `{failed}`로 둡니다.
- [ ] **Step 4:** PASS, 기존 `Check Version` 테스트는 위 케이스로 이관합니다(M 분류, assert 수 감소 금지).
- [ ] **Step 5:** PTY 갱신
  - 홈 문자열
  - Uninstall까지의 이동 횟수(3→2)
  - Status 진입 시 prepare 1회(`PREPARES=1`)와 Version 행
  - busy 중 Ctrl-C 종료 코드 130
- [ ] **Step 6:** STD-CLOSE 3, 5–9

**수용 기준:**
- 13.2 표 5개 행이 각각 테스트로 고정됨
- 기본 커서 Back
- `Operation unavailable` 미호출
- global/npx Upgrade 결과가 현행과 같음
- `rg -n "Check Version" --glob '!docs/**' --glob '!README.md'` 0건

**필수 검사:** 작업 테스트, PTY, `npm test`, `check:manifest`, parity
**필수 QA:** 예(Upgrade 실행 경로, 예외 전파)
**보류 조건:**
- `execute` 결과 처리(global 종료, npx 페이지)가 현행과 달라지면 보류합니다.
- `canUpgrade` 계산을 바꿔야 하면 보류합니다(D2).

**커밋:** `feat(tui): Check Version을 Status에 통합하고 진입 시 버전 조회`

---

### Task T3: Grok registry 등록

**AC:** AC-K1, AC-K2, AC-K3(status·TUI·management off 표면, fake grok 미실행), AC-K7(`controls.grok`), AC-K9(설치기 형식), AC-K10

**목표:** 운영 runtime·설치기 registry에 grok을 capability 전부 off로 등록합니다. 형식 모듈, 정적 카탈로그, `controls.grok`, 잔존 패턴, P-K7 probe 생략 규칙, 그리고 운영 registry를 열거하는 기존 단언(R 분류)과 TUI 스냅샷을 한 커밋에 맞춥니다.

**Files:**
- Create:
  - `lib/platforms/grok.mjs`
  - `lib/platforms/formats/grok-markdown.mjs`
  - `lib/models/grok-models.json`
  - `tests/node/grok-platform.test.mjs`
  - `tests/node/grok-capability-evidence.test.mjs`
- Modify(운영):
  - `lib/runtime/platform-registry.mjs`(grok descriptor, `resolveHome` grok 분기)
  - `lib/platforms/index.mjs`(`[CLAUDE, CODEX, GEMINI, GROK]`)
  - `lib/policy/role-policy.json`(`controls` 15곳에 `"grok": "prompt"`)
  - `lib/management/status.mjs`(P-K7)
  - `lib/tui/setup.mjs`, `lib/tui/mode.mjs`(행 폭 등 4번째 플랫폼 표시가 깨질 때만)
- Modify(테스트, R/K 분류)
  - `tests/node/hardcoding-residual.test.mjs`(`:139` 패턴 `/===\s*['"](?:gemini|grok)['"]/`, 테스트 이름 `Platform literal branches …`)
  - `tests/node/platform-registry.test.mjs`(`:70-72`, `:181-183`)
  - `tests/node/gemini-platform.test.mjs`(`:25-26`)
  - `tests/node/management-status.test.mjs`(`:51`)
  - `tests/node/install-mode.test.mjs`(`:33` collectStatus 상태 배열만, `targets`는 V 분류로 유지)
  - `tests/node/tui-app.test.mjs`, `tests/node/tui-app-pty.test.mjs`, `tests/node/tui-setup.test.mjs`(Grok 행 추가)
  - `tests/node/capability-surfaces.test.mjs`(K 분류가 있을 때만)
- 생성물: `shared/skill/runtime/platform-registry.mjs`, `shared/skill/runtime/role-policy.json`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/runtime-versions.test.mjs`(baseline), `MANIFEST.sha256`

**Interfaces:**
- Produces:
  - `getPlatform('grok')`(Global Constraints 값)
  - `GROK_INSTALLER`(`lib/platforms/grok.mjs`)
    - `runtime: getPlatform('grok')`, `payloadPrefix: 'grok'`
    - `instructionTemplates: ['AGENTS.md','instructions.md']`, `instructionFile: 'AGENTS.md'`
    - `runtimeConfigFile: 'config.toml'`, `globalPaths: ['AGENTS.md','config.toml']`
    - `models: {staticCatalog: new URL('../models/grok-models.json', import.meta.url), effortField: 'effort'}`(`discover` 키 없음)
    - `profiles: {render, isOwnedStandalone, renameForRouting}`, `runtimeConfig: {}`
    - `uninstallSummary: 'Grok config.toml is preserved.'`, `isolationEnv: () => ({})`
  - `lib/platforms/formats/grok-markdown.mjs`: `render(text, role, settings) -> string`, `isOwnedStandalone(bytes, role) -> boolean`, `renameForRouting(bytes, role, revision)` — 시그니처와 반환형은 `gemini-markdown.mjs`와 같습니다.
    - frontmatter는 정확히 `name`, `description`, `model`입니다. `effort`, 누락 필드, 잘못된 scalar는 거부합니다. `permissionMode`·`tools`·`disallowedTools`는 렌더링하지 않습니다.
    - routing 이름은 `arc-routing-<suffix>`, description 끝에 `[arc-routing rev <revision>]`를 붙입니다. 오류 문구의 플랫폼명은 `Grok`입니다.
  - `lib/models/grok-models.json`: `{"platform":"grok","pairs":[…]}`. 모든 effort는 `"default"`이고, 모델 목록은 OD-2 확정값(`grok-4.6` 하나)을 씁니다.
  - P-K7(`status.mjs` `collectStatus`): `runtime.capabilities.install.state !== 'verified'`이면 `probeCliVersion`·`probePlatformAuth`·codex probe를 호출하지 않고 `cliVersion: {version: null, reason: 'capability_not_verified'}`, `authentication: {authStatus: 'unknown', reason: 'capability_not_verified'}`를 씁니다. `resolveLocalCli`는 호출해도 됩니다. 리터럴 분기는 쓰지 않습니다.

- [ ] **Step 1: 실패 테스트 작성**(`grok-platform.test.mjs`)
  - AC-K1
    - `byAnchorOrder`/`byDisplayOrder`/`platformIds`가 `['claude','codex','gemini','grok']`이고, 설치기 registry도 같음(descriptor 참조 동일)
    - grok 필드 표 전체(label, orders 3/3, `GROK_HOME`, `grok`, range, `none`, `effort`, `md`, `arc-planner`, `arc-routing-planner`, `['grok-cli']`)
  - `GROK_HOME set throws GROK_HOME is not verified`, 기본 `<home>/.grok`
  - `GROK_HOME set does not block other platforms`(Review Focus 1)
    - 운영 registry, env `GROK_HOME` 설정 상태에서 collectStatus는 claude/codex/gemini 결과가 정상입니다.
    - grok은 `incomplete`이고 `statusInfo`의 grok 행은 `Not verified`, Notes에 `GROK_HOME is not verified (Grok)`가 있습니다.
    - `prepareOperation({kind:'install', target:'codex'})`가 성공합니다.
  - AC-K2: 9개 capability가 off이고 reason이 Global Constraints와 같음
  - AC-K10
    - 카탈로그 pairs의 effort가 모두 `default`이고 모델이 모두 정규식과 `validatePair`를 통과
    - `validatePair('grok-4.6','high') === false`, `validatePair('-grok','default') === false`, `validatePair('grok 4','default') === false`
  - AC-K9(설치기)
    - render → `isOwnedStandalone` true → `renameForRouting` 왕복
    - frontmatter 키가 정확히 `['name','description','model']`
    - `effort:` 포함, `name`/`model` 누락, 빈 본문, `description: [x]`·`"[x]"`·`- item`·`|`·`>`·`&a`·`*a` 거부
    - 렌더 결과에 `permissionMode`·`tools`·`disallowedTools`가 없음
  - AC-K3 management(운영 registry, 임시 HOME)
    - `target:'grok'` install이 `Grok is not available: capability not verified`로 거부되고 HOME 바이트 무변경
    - `target:'all'` install·preset·uninstall plans에 grok 없음
    - composite `platforms`에 grok이 있으면 같은 문구로 거부
  - AC-K3 status: grok 항목의 `cliVersion`·`authentication`이 위 P-K7 값
  - `fake grok on PATH is never executed`(Review Focus 2)
    - 임시 디렉터리에 실행 시 marker를 남기는 `grok` 셸 스크립트를 두고 `env.PATH`로 주입합니다.
    - collectStatus, management prepare(위 세 경우), `uninstall target:'grok'`(흔적 없음) 실행 후 marker가 없어야 합니다.
  - P-K7 일반 규칙
    - install off 주입 플랫폼(zeta 기반 `install: off`)은 marker CLI가 실행되지 않습니다.
    - install verified 주입 플랫폼은 기존대로 probe가 실행됩니다(회귀).
  - TUI(`tui-app.test.mjs`, `tui-setup.test.mjs`)
    - Status 행 `Grok` + `Not verified`, Notes에 `capability not verified` 없음
    - Hosts·도식 행 `Grok - Unavailable  (capability not verified)`, 선택 불가
    - 역할 편집기 플랫폼 순환에서 grok을 건너뜀
    - Uninstall 행 `Grok  (not installed)`
  - 잔존 검사: `hardcoding-residual` 패턴 확장 후 PASS
  - role-policy: `controls`가 있는 모든 항목에 `grok: 'prompt'`가 있고 `platforms.grok`은 없음(T4 전)
  - `grok-capability-evidence.test.mjs`
    - 운영 verified 집합 `[]`
    - `CAPABILITY_PREREQUISITES` 위반 0
    - `supportedVersions === '>=1.0.0 <1.1.0'`
    - 음성 사례: 검사 함수가 verified 하나 이상인 주입 registry를 거부함
- [ ] **Step 2:** `node --test tests/node/grok-platform.test.mjs tests/node/grok-capability-evidence.test.mjs tests/node/platform-registry.test.mjs tests/node/hardcoding-residual.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 구현. 형식 모듈은 `gemini-markdown.mjs`를 복제하고 플랫폼 id·라벨만 바꿉니다(D5).
- [ ] **Step 4:** PASS. 기존 단언 실패는 분류 규칙으로 처리하고 대응표를 보고합니다.
- [ ] **Step 5:** PTY: 홈 → Status → Configure(Back) → Uninstall 경로에서 Grok 행이 보이고, PATH의 marker `grok`이 실행되지 않음(Review Focus 2 PTY 1건)
- [ ] **Step 6:** STD-CLOSE 전부(role-policy 생성물 변경 0건)

**수용 기준:**
- 위 테스트 PASS
- `all-targets`, `preset-cli`, `uninstall-cli` 테스트가 **수정 없이** 통과(AC-K3)
- `check:role-policy` 생성물 무변경
- `git diff -- claude codex gemini` 빈 결과
- `watch-render.test.mjs` 무수정 통과

**필수 검사:** 작업 테스트, PTY, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`, parity
**필수 QA:** 예(registry, capability gate, 미실행 보장)
**보류 조건:**
- V/S 분류 단언이 실패하면 보류합니다.
- grok payload 부재 때문에 verifyPayload·parity·policy 검사가 실패하면 편집 없이 보고합니다. Orchestrator는 T3+T4 결합을 판단합니다.
- 허용 목록 밖 파일에 `'grok'` 리터럴이 필요해지면 보류합니다.
- zeta fixture(`anchorOrder 3`)와 grok이 같은 registry에 들어가 중복 오류가 나면 보고합니다. 현재 grep으로는 그런 조합이 없으므로 zeta는 옮기지 않습니다.

**커밋:** `feat(platforms): Grok descriptor를 capability off로 등록`

---

### Task T4: Grok payload와 설치·제거

**AC:** AC-K4, AC-K3(off 상태에서 흔적 있는 Uninstall), AC-K7(`platforms.grok`, 기존 생성물 무변경), AC-M1(payload 문구)

**목표:** `grok/` payload(19개 파일)와 `platforms.grok` 정책을 추가합니다. 주입 registry(install·nativeProfile·catalog·standalone verified)의 임시 HOME에서 설치·재설치·제거가 spec 5.1/5.2를 만족하게 합니다. `config.toml`은 읽지도 쓰지도 않습니다.

**Files:**
- Create:
  - `grok/AGENTS.md`, `grok/instructions.md`
  - `grok/agents/arc-scouter.md`, `grok/agents/arc-planner.md`, `grok/agents/arc-implementer.md`, `grok/agents/arc-qa.md`, `grok/agents/arc-reviewer.md`
  - `grok/skill/SKILL.md`, `grok/skill/models.toml`
  - `grok/skill/references/{arc-visual-companion,limits,git-recovery,worktree-creation,coordination,planning,handoff,handoff-prep,commit,verification}.md`
  - `tests/node/grok-install.test.mjs`
- Modify:
  - `lib/policy/role-policy.json`(`platforms.grok`: `level 'prompt'`, notice spec 12장 문자열)
  - `lib/prompts/render.mjs`(grok agents 5개 매핑, gemini 항목과 같은 fragment 목록)
  - `lib/prompts/agent-fragments.json`(grok 경로 5개)
  - `scripts/update-manifest.mjs`(진입점 `'grok'`, mutable `'grok/skill/models.toml'`)
  - `package.json`(`files`에 `"grok/"`)
  - `tests/node/fixtures/installed-layout.mjs`(`COMBINATIONS`에 `grok`, `copyPackageSource`에 `'grok'`, grok `install`·`standalone`·`nativeProfile`·`catalog` verified 주입)
  - `tests/node/fixtures/static-references.mjs`(`:11` prefix)
  - `tests/node/manifest.test.mjs`(`:8`, `:79`)
  - `tests/node/install-mode-n-platform.test.mjs`(`:148` `modelInputs`가 R 분류일 때)
  - `tests/installer-parity.json`(parity가 요구할 때만)
- 생성물: `shared/skill/runtime/role-policy.json`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/runtime-versions.test.mjs`(baseline이 바뀔 때)

**Interfaces:**
- Consumes: T3 `GROK_INSTALLER`, `grok-markdown.mjs`, `getPlatform('grok')`
- Produces: 설치된 routing profile `~/.grok/agents/arc-routing-<suffix>.md`(T5 `parseGrok` 입력)
- payload 작성 규칙: `gemini/**`를 기준으로 복제하고 플랫폼 고유 표현만 바꿉니다.
  - 바꿀 표현: `Gemini`→`Grok`, `GEMINI.md`→`AGENTS.md`, `settings.json`→`config.toml`, `~/.gemini`→`~/.grok`, `gemini-cli`→`grok-cli`, 플랫폼 id `gemini`→`grok`
  - `coordination.md`는 처음부터 `run Configure again`입니다.
  - 정책 managed section은 `npm run update:role-policy`로만 생성합니다.
  - `grok/skill/models.toml`은 `version = 3`이고 다섯 역할 모두 `model = "grok-4.6"`, `effort = "default"`입니다.

- [ ] **Step 1: 실패 테스트 작성**(`grok-install.test.mjs`, 임시 HOME, 주입 registry)
  - `grok standalone install layout`
    - `~/.grok/AGENTS.md`의 ARC managed block
    - `~/.grok/skills/arc/{SKILL.md,models.toml,settings.toml,limits.toml}`, `references/` 10개, `runtime/`
    - `~/.grok/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`
  - `config.toml untouched`: 미리 둔 `config.toml` 바이트가 그대로이고, 없을 때는 생성되지 않음. plan `globalChanges`에 `config.toml` 경로 없음
  - `reinstall idempotent`: 두 번째 설치 후 바이트 동일
  - `uninstall removes owned only`
    - 사용자 `agents/my.md`, `config.toml`, `AGENTS.md`의 블록 밖 내용은 보존
    - ARC 소유 파일 0개
    - 결과 요약에 `Grok config.toml is preserved.`
  - `uninstall allowed with install capability off when traces exist`: 운영 registry에서 설치 흔적을 직접 만든 뒤 `kind:'uninstall', target:'grok'` 성공. TUI 행은 `Grok`(접미사 없음)
  - `uninstall order follows displayOrder`
  - `symlinked grok home or ancestor is rejected without file changes`
  - `models.toml defaults`: 다섯 역할 `grok-4.6`/`default`
  - `grok coordination says run Configure again`
  - `role policy renders grok outputs and leaves claude/codex/gemini bytes unchanged`(정책 생성 후 기존 파일 해시 비교)
- [ ] **Step 2:** `node --test tests/node/grok-install.test.mjs`. 기대: FAIL
- [ ] **Step 3:** payload 작성 → `npm run update:role-policy` → 구현 연결
- [ ] **Step 4:** PASS
- [ ] **Step 5:** STD-CLOSE 전부(golden `--write`, role-policy는 grok 생성물만 신규)
- [ ] **Step 6(Orchestrator):** `npm pack --dry-run` 목록에 `grok/` 19개 포함 확인

**수용 기준:**
- 위 테스트 PASS
- `rg -n "Gemini|GEMINI|settings\.json|gemini" grok/` 결과 0건(정책 문구 등 의도된 예외가 있으면 목록으로 보고)
- `git diff -- claude codex gemini` 빈 결과
- `check:role-policy` PASS

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`, `check:role-policy`, golden, parity, `npm pack --dry-run`(Orchestrator)
**필수 QA:** 예(설치·제거 소유 판정, 사용자 파일 보존)
**보류 조건:**
- `config.toml` 읽기·쓰기가 생기면 보류합니다.
- 사용자 파일이 1바이트라도 바뀌면 보류합니다.
- claude/codex/gemini 생성물이 바뀌면 보류합니다.

**커밋:** `feat(grok): payload와 설치·제거 경로 추가`

---

### Task T5: Grok bridge(실행·프롬프트 파일·관찰·취소·gate)

**AC:** AC-K5, AC-K6, AC-K9(runtime 파서), AC-K2(GK·resume 고정)

**목표:**
- `lib/runtime/grok-stream.mjs`(계약 상수, 정규화, 판정)를 추가하고 runtime 모듈 갱신 세트를 함께 처리합니다.
- args·supervisor·permissions Map에 grok을 추가합니다.
- 프롬프트 파일 전달, gate(GK1/GK2), resume hold, `role-routing.mjs`의 UUID 예약·host gate를 넣습니다.

**Files:**
- Create:
  - `lib/runtime/grok-stream.mjs`
  - `tests/node/grok-bridge.test.mjs`
  - `tests/node/fixtures/grok/fake-grok.mjs`
- Modify:
  - `lib/runtime/role-bridge-args.mjs`(`ROLE_BRIDGE_PERMISSIONS.grok`, `parseGrok`, `buildGrokArgs`, Map 항목)
  - `lib/runtime/role-supervisor.mjs`(`SUPERVISOR_IMPLEMENTATIONS.grok`, `grokPromptFile`, `:98` gate 조건, `:102` resume, `:111-118` invocation, `:221` 앞 프롬프트 파일 기록·env, `:228` stdin, `handle` grok 분기, `:360/362/386/393`)
  - `lib/runtime/role-dispatch-policy.mjs`(`:3` GK1/GK2, `:44` 문구, `:89-90` 규칙)
  - `lib/runtime/role-bridge.mjs`(`:146` grok resume hold)
  - `lib/runtime/role-routing.mjs`(`:234` host gate, `:246` UUID 예약)
  - `lib/runtime/bootstrap.mjs`(`:11`)
  - `lib/installer/runtime-assets.mjs`
  - `tests/node/runtime-assets.test.mjs`, `tests/node/runtime-versions.test.mjs`
  - `tests/node/role-routing-dispatch.test.mjs`(`:25` 기대 객체에 `GK1`, `GK2`)
  - `tests/node/grok-capability-evidence.test.mjs`(GK·resume 항목)
  - `tests/node/gemini-bridge.test.mjs`(resume 문구를 단언하는 경우에만)
- 생성물: `shared/skill/runtime/{grok-stream,role-bridge-args,role-supervisor,role-dispatch-policy,role-bridge,role-routing,bootstrap}.mjs`, `tests/node/fixtures/installed-layout-golden.json`, `MANIFEST.sha256`

**Interfaces:**
- Consumes: T3 `getPlatform('grok')`, T4 설치 routing profile 형식, 기존 lease v2(`targetPlatform`, `sessionId`), `snapshotWorktree`/`detectViolations`
- Produces:
  - `GROK_CONTRACT`(frozen, `grok-stream.mjs`)
    - `outputFormat: 'streaming-json'`
    - `isolationArgs: ['--no-auto-update','--no-subagents']`
    - `childEnv: {GROK_DISABLE_AUTOUPDATER: '1'}`
    - `eventKinds`: `text`, `thought`, `tool_call`, `tool_call_update`, `usage`, `plan`, `available_commands`, `error`, `end`
    - `successStopReasons: ['end_turn']`
    - `resumeFlag: '--resume'`
    - `delegation: 'undetectable'`
    - `readOnlyDeny`: OD-1 확정값. 기본안 `['Bash','Edit','Write','MCPTool']`
    - 상단 주석에 U-K5(문서 문법 `ToolPrefix(glob)`, bare prefix 전체 매칭, 차단 효과 unverified), U-K6(`{"type":"text","data":…}`), U-K7(문서 값 `end_turn, max_tokens, max_turn_requests, refusal, cancelled`)를 출처와 함께 적습니다.
  - `normalizeGrokStreamEvent(line: string|object) -> {kind, raw, sessionId?, stopReason?, model?, text?}`
    - JSON 파싱 실패나 미지 `type`이면 `{kind:'unknown', raw}`
    - `end`이면 문자열 `sessionId`와 `stopReason`
    - known 이벤트에 문자열 `model`이 있으면 `model`
    - `text`이면 문자열 `raw.data`를 `text`로. `thought`의 `data`는 `text`로 만들지 않습니다.
  - `evaluateGrokObservation({state, expected, sessionId}) -> {reason: string|null, claims: {identity, model, effort, permissions}}`
    - identity: `state.grokSessionId === sessionId && !state.grokSessionMismatch`이면 `{level:'runtime-observed', source:'grok-stream-session', observed}`, 아니면 reason `execution_identity_unverified`
    - model: 일치하면 `grok-stream-model`, 불일치하면 `model_effort_mismatch`, 보고가 없으면 `{level:'unverified', source:'none', requested, observed:null}`(비차단)
    - effort: `{level:'unverified', source:'none', requested:'default', observed:null}`
    - permissions: `{level:'runtime-observed', source:'worktree-snapshot', details:'git-visible worktree only'}`
  - `ROLE_BRIDGE_PERMISSIONS.grok`
    - scouter/planner/reviewer: `{permissionMode:'plan', sandbox:'read-only', deny: GROK_CONTRACT.readOnlyDeny}`
    - implementer/qa: `{permissionMode:'acceptEdits', sandbox:'workspace', deny: []}`
  - `buildGrokArgs({role, profile, sessionId, promptFile}) -> string[]`, 정확한 순서:
    `['--prompt-file', promptFile, '--output-format', 'streaming-json', '-m', profile.model, '--session-id', sessionId, '--permission-mode', mode, '--sandbox', sandbox, ...deny.flatMap(rule => ['--deny', rule]), '--no-auto-update', '--no-subagents']`
    - `promptFile`이 절대 경로가 아니거나, `sessionId`가 UUID가 아니거나, model이 정규식 밖이면 throw합니다.
  - `parseGrok(text) -> {name, description, model, effort:'default', tools:null, instructions}`(installer import 금지, `parseGemini`와 같은 scalar 규칙)
  - `grokPromptFile(resultPath) = path.join(path.dirname(resultPath), 'prompt.md')`(`role-supervisor.mjs` export)
  - `buildBridgeInvocation` grok 반환: `{platform, args, argsDigest, expected:{model: requested.model, effort:'default'}, requested, promptFile:{path, instructions: profile.instructions}, childEnv: GROK_CONTRACT.childEnv}`. 파일은 쓰지 않습니다.
  - supervisor(spawn 직전)
    - `fs.openSync(path, O_WRONLY|O_CREAT|O_EXCL, 0o600)`로 열고 `instructions + "\n\n" + brief`를 쓴 뒤 `chmod 0o600`합니다. 실패하면 child 없이 `earlyFailure('execution_failed')`입니다.
    - env는 `{...localCliEnvironment(cli), ...childEnv, ARC_BRIDGE_CHILD}`입니다.
    - grok일 때는 `child.stdin.end()`(빈 입력)입니다.
  - supervisor 관찰: `end` 수신 시 `state.terminal = true`. `stopReason ∉ successStopReasons`이거나 `error` 이벤트가 있으면 `state.terminalError = true`. `text`는 `state.resultText`에 순서대로 이어 붙입니다.
  - 판정: grok이고 cancel이 아니며 (`exit.code !== 0` || signal || `terminalError` || `!state.terminal`)이면 `execution_failed`. 정상 종료인데 본문이 공백이면 `invalid_output`. `cancelledBeforeIdentity`·`finalState='unknown'`·`unverifiedContracts:{delegation}` 규칙을 grok에 확장합니다.
  - `BRIDGE_GATE_RESULTS` += `GK1:'fail', GK2:'fail'`
    - `bridgeGateReasons`: `platform==='grok'`이고 역할이 implementer/qa이며 `GK1 !== 'pass'`이면 `permission_scope_unverified`. `hostPlatform==='grok'`이고 `GK2 !== 'pass'`이면 `host_sandbox_blocked`
    - `buildBridgeInvocation` gate 검사 조건은 `platform` 또는 `hostPlatform`이 gemini/grok일 때입니다.
  - `role-routing.mjs`
    - `:234`: `host==='grok' && GK2!=='pass'` → `host_sandbox_blocked`
    - `:246`: `route==='bridge' && (requested.platform==='gemini' || requested.platform==='grok')`이면 `crypto.randomUUID()`
  - `RELEASE_CONDITIONS.resume_unverified = 'Update ARC after verifying platform session resume against the recorded session UUID.'`
  - `SUPERVISOR_IMPLEMENTATIONS.get('grok').resume === 'off'`. `segment > 0`이면 `resume_unverified` hold(`role-supervisor.mjs:102`, `role-bridge.mjs:146`)
- fake fixture `tests/node/fixtures/grok/fake-grok.mjs`
  - env `ARC_FAKE_GROK_RECORD`에 argv, stdin 전체, `--prompt-file` 내용·mode를 기록합니다.
  - env `ARC_FAKE_GROK_SCENARIO` ∈ `ok`, `session-mismatch`, `no-end`, `error-event`, `empty-text`, `stop-max-tokens`, `model-mismatch`, `no-model`, `unknown-event`, `exit-nonzero`, `write`, `hang`
  - `ok` 이벤트 순서(문서 예시): `thought` → `tool_call` → `tool_call_update` → `text`(`data`를 두 조각으로) → `usage`(`model`: `-m` 값) → `end`(`stopReason:'end_turn'`, `sessionId`: `--session-id` 값, `modelUsage` 포함)

- [ ] **Step 1: 실패 테스트 작성**(`grok-bridge.test.mjs`)
  - AC-K5 인자
    - 다섯 역할 각각 정확한 배열(위 순서)
    - 읽기 역할은 `--permission-mode plan --sandbox read-only`와 `--deny` 규칙들, 쓰기 역할은 `acceptEdits`·`workspace`·`--deny` 없음
    - `--session-id`가 lease UUID와 같음
    - 모든 역할에서 금지 인자 목록이 0개이고 `--sandbox`의 값이 `off`가 아님
    - 상대 promptFile, 비UUID, `-x` model은 throw
  - AC-K9 runtime: `parseCompositeProfile('grok', render(...))` 왕복, `effort` 키·누락 필드 거부, effort는 `'default'`
  - `normalize`
    - `text` → `data` 본문
    - `thought`는 본문이 아님
    - 미지 type과 비JSON은 `{kind:'unknown', raw}`로 원문 보존
    - `end`에서 `sessionId`·`stopReason` 추출
  - AC-K5 프롬프트 파일(통합, fake grok, 주입 registry에서 grok `install`·`catalog`·`bridge`·`compositeRole` verified)
    - `prompt.md` mode `0o600`, 내용이 `instructions + '\n\n' + brief`와 같음
    - fake가 기록한 stdin이 `''`
    - child env에 `GROK_DISABLE_AUTOUPDATER=1`
  - `existing or symlinked prompt.md fails before spawn`(Review Focus 5): 미리 둔 파일·symlink에서 `execution_failed`, record 파일 없음(child 미실행), symlink 대상 무변경
  - AC-K5 판정(fake 시나리오별)
    - `ok`: completed, identity `grok-stream-session`, model runtime-observed, `resultFile` 내용 `GROK-TOKEN-7c2e`, 0600
    - `session-mismatch`: `execution_identity_unverified`, finalState `unknown`
    - `no-end`, `error-event`, `stop-max-tokens`, `exit-nonzero`: `execution_failed`
    - `empty-text`: `invalid_output`
    - `model-mismatch`: `model_effort_mismatch`
    - `no-model`: model `unverified`이고 비차단(completed)
    - `unknown-event`: events.jsonl에 원문 보존
    - record에 `unverifiedContracts: {delegation: 'undetectable'}`
  - argsDigest: prepare 단계 digest와 supervisor 재계산이 같음(정상 완료로 확인)
  - AC-K6
    - Implementer/QA는 `permission_scope_unverified` hold이고 child를 실행하지 않음
    - `hostPlatform:'grok'`은 prepare(native와 bridge 모두)에서 `host_sandbox_blocked`
    - `segment > 0`은 `resume_unverified`, 파일 무변경
    - 읽기 역할 `write` 시나리오는 `permission_violation_observed`
  - `cancel uses SIGTERM then SIGKILL`(`hang`), cancel 전에 identity가 없으면 기존 cancelled 상태
  - `grok-capability-evidence.test.mjs` 추가: `BRIDGE_GATE_RESULTS.GK1/GK2 === 'fail'`, `SUPERVISOR_IMPLEMENTATIONS.get('grok').resume === 'off'`
  - runtime-assets `expectedPaths`에 `lib/runtime/grok-stream.mjs`, runtime-versions 모듈 목록에 `grok-stream.mjs`
- [ ] **Step 2:** `node --test tests/node/grok-bridge.test.mjs tests/node/grok-capability-evidence.test.mjs tests/node/runtime-assets.test.mjs tests/node/role-routing-dispatch.test.mjs`. 기대: FAIL
- [ ] **Step 3:** 구현. 미검증 계약 값은 `GROK_CONTRACT` 한 곳에만 둡니다.
- [ ] **Step 4:** PASS. 회귀로 `gemini-bridge`, `role-bridge-*`, `platform-registry`(bridge coverage), `hardcoding-residual`를 확인합니다. `role-bridge-run`처럼 `ps`가 필요한 테스트는 Orchestrator가 호스트에서 실행합니다.
- [ ] **Step 5:** STD-CLOSE 전부

**수용 기준:**
- 위 테스트 PASS
- 금지 인자 grep 결과: `rg -n "always-approve|bypassPermissions|--allow\b|prompt-json|--single" lib/runtime` 0건(금지 목록 테스트 안의 리터럴은 제외)
- Gemini resume 문구 변경 외 Gemini 동작 무변경(`gemini-bridge` 기대값 수정이 문구 1건뿐)
- runtime 모듈 갱신 세트 8항목 일치

**필수 검사:** 작업 테스트, `npm test`, runtime-assets `--check`, golden, runtime-versions, `check:manifest`, `check:role-policy`, parity, `role-bridge-run`·`role-bridge-resume` 호스트 실행
**필수 QA:** 예(bridge, 권한, 프롬프트 파일 보안)
**보류 조건:**
- 금지 인자가 어느 경로에서든 생성되면 보류합니다.
- `readOnlyDeny`가 빈 목록이면 보류합니다(spec 8.1).
- claude/codex 경로의 기대값이 하나라도 바뀌면 보류합니다.
- `prompt.md`가 `O_EXCL` 없이 열리면 보류합니다.

**커밋:** `feat(runtime): Grok bridge 실행·관찰·gate 추가`

---

### Task T6: Grok 참여 composite 통합

**AC:** AC-K8

**목표:** 주입 registry(grok `install`·`catalog`·`bridge`·`compositeRole` verified)에서 Grok이 역할 플랫폼으로 참여하는 composite publish, prepare, lock 순서를 고정합니다. 필요한 최소 수정만 넣습니다.

**Files:**
- Create: `tests/node/grok-composite.test.mjs`
- Modify(실패가 재현될 때만, 수정 전 보고): `lib/installer/role-routing.mjs`, `lib/management/operations.mjs`
- 생성물: `MANIFEST.sha256`

**Interfaces:**
- Consumes: T5 UUID 예약·lease v2, T4 routing profile, 기존 publish/lock(`gemini-composite.test.mjs`의 `fsp.open` 관찰 방식)

- [ ] **Step 1: 실패/회귀 테스트 작성**
  - `publish S={claude,grok}`
    - Claude home에 v2 활성 설정
    - claude·grok marker
    - Grok home에 `arc-role-platform-routing.prepared.json`
    - `~/.grok/agents/arc-routing-*.md`의 description에 `[arc-routing rev <revision>]`
  - `publish S={codex,claude,gemini,grok}`: anchor `claude`, marker 4개, lock 순서 `['claude','codex','gemini','grok']`
  - `prepare arc_scouter targeting grok records lease v2`: `targetPlatform:'grok'`, `sessionId`가 UUID 정규식 통과
  - `prepare arc_qa targeting grok holds permission_scope_unverified without lease`
  - 운영 registry 회귀: Codex+Claude 기본 composite publish 결과가 무변경(기존 테스트 재사용)
- [ ] **Step 2–4:** 실행 → 필요 시 수정 → PASS
- [ ] **Step 5:** STD-CLOSE 3, 5–9(runtime을 바꿨다면 전부)

**수용 기준:**
- 위 테스트 PASS
- `gemini-composite.test.mjs`(S 분류) 무수정 통과

**필수 검사:** 작업 테스트, `npm test`, `check:manifest`, parity
**필수 QA:** 예(composite, lock 순서)
**보류 조건:**
- 운영 Codex+Claude 또는 Gemini 참여 composite의 결과가 바뀌면 보류합니다.
- 운영 코드 수정이 Files의 두 파일 밖으로 필요하면 보류합니다.

**커밋:** `test(composite): Grok 참여 composite publish와 lease v2 고정`

---

### Task T7: 문서(최소 범위)

**AC:** AC-D1, AC-M1(문서 포함 최종 잔존 0)

**목표:** spec 14장의 행만 수정합니다. 행 번호는 `564ea20` 기준이며, 그 사이 T1–T6은 이 두 파일을 바꾸지 않습니다. 실행 시 내용으로 다시 찾아 적용합니다.

**Files:**
- Modify: `README.md`, `docs/harness-operation.md`, `tests/node/menu-label-residual.test.mjs`(`EXTRA_PATHS = ['README.md','docs/harness-operation.md']`)
- 생성물: `MANIFEST.sha256`(README 해시)

- [ ] **Step 1:** `menu-label-residual`에 두 문서를 추가합니다. 기대: FAIL
- [ ] **Step 2:** README의 spec 14장 행 수정: 40, 41–42 병합(정확 문자열), 48 `> Grok`, 81 아래 Grok 행, 93·95
- [ ] **Step 3:** harness-operation의 spec 14장 행 수정: 114, 123, 129·132·134, 42 `> Grok`, 72 아래 Grok 행. GK1/GK2는 추가하지 않습니다(spec 22장 기본값).
- [ ] **Step 4:** `node --test tests/node/menu-label-residual.test.mjs` PASS, STD-CLOSE 3, 6, 7, 9

**수용 기준:**
- `git diff -- README.md docs/harness-operation.md`의 변경 hunk가 spec 14장 항목과 1:1로 대응(Orchestrator가 행 단위 대조표를 진행 기록에 남김)
- `formerly` 등 이전 이름 안내 0건
- 전체 `rg -n "Install / Update|Check Version" --glob '!docs/superpowers/**'` 0건

**필수 검사:** 작업 테스트, `check:manifest`, `npm test`
**필수 QA:** 예(AC-D1 diff 범위 대조만, 경량)
**보류 조건:** 14장 밖의 행이 바뀌면 보류합니다.

**커밋:** `docs: Configure·Status 메뉴와 Grok 상태를 문서에 반영`

---

### Task FR: 최종 독립 Reviewer 1회

- **선행:** T1–T7 수용, 필수 QA와 QA 재확인 완료
- **대상:** `564ea20..HEAD` 전체 변경(spec·plan docs 커밋 포함)과 이 계획의 진행 기록·부록 A
- **위험 기반 점검:**
  - capability 전부 off와 `grok` 미실행 보장(D10, P-K7이 다른 플랫폼에 미치는 영향 0)
  - 금지 인자 부재, `readOnlyDeny` 근거와 unverified 표기
  - 프롬프트 파일 `O_EXCL`·0600·symlink, stdin 즉시 종료
  - 8.3 판정 행렬(`end` 없음, `error`, stopReason 집합, 빈 본문, 세션 불일치)
  - GK1/GK2 hold와 resume hold, host gate
  - role-policy 변경 범위(12장)와 기존 생성물 바이트 동일(AC-K7)
  - Status 병합의 예외 전파와 Upgrade 경로 무변경(AC-M2)
  - 부록 A 대응표의 분류 정확성과 검사 강도 유지(assert 감소 0)
  - 문서 변경이 14장 행에 한정(AC-D1)
- **Reviewer 지적:** Implementer → Reviewer 재확인으로 처리합니다(QA 재배정 없음). 해결될 때까지 미커밋으로 두고, 수용 후 follow-up 커밋 1개를 만듭니다.

---

## AC 추적표

| AC | 작업 |
|---|---|
| AC-K1 | T3 |
| AC-K2 | T3(off·reason·verified `[]`), T5(GK·resume 고정) |
| AC-K3 | T3(status·TUI·management·미실행), T4(흔적 있는 Uninstall) |
| AC-K4 | T4 |
| AC-K5 | T5 |
| AC-K6 | T5 |
| AC-K7 | T1(13.1 문구만), T3(`controls.grok`), T4(`platforms.grok`), T5(resume 문구) |
| AC-K8 | T6 |
| AC-K9 | T3(설치기 형식), T5(runtime 파서) |
| AC-K10 | T3 |
| AC-M1 | T1(`Install / Update`), T2(`Check Version`), T4(payload), T7(문서·최종) |
| AC-M2 | T2 |
| AC-D1 | T7 |
| 공통 검사(17장) | 모든 작업 STD-CLOSE, FR |

## 검증 판정 (spec 17장)

- **기준선:** P0-a에서 Orchestrator가 측정한 `npm test` 실패 목록(부록 B)
- **판정:**
  - 신규 실패는 0건이어야 합니다.
  - 기준 목록 밖 실패는 파일 단위로 단독 재실행합니다. 단독으로 통과하면 부하 flake로 기록하고, 단독으로도 실패하면 신규 실패로 보고 수용을 보류합니다.
  - 기준 실패가 통과로 바뀐 경우는 기록만 하고 판정에 쓰지 않습니다.
  - 기준 실패와 영향 범위가 겹치는 작업은 대체 증거로 판정합니다: 단독 재실행 메시지가 기준선과 같은지 비교하고, `npm pack --dry-run`·fixture 테스트를 씁니다.
- 실패 분류(기준/현재)와 hold 범위는 [scope.non-escalation] 절차를 따릅니다. 영향받지 않는 독립 작업은 Orchestrator가 해제합니다.
- 자동 테스트 통과는 live 증거를 대신하지 않습니다. capability 전환(spec 11장)은 이 계획의 범위 밖입니다.

## 진행 기록

| 일시 | 작업 | 상태 | 커밋 | 메모 |
|---|---|---|---|---|
| 2026-11-18 | 기준선(P0-a) | 기록 | `564ea20` | `npm test` 실패 35건(부록 B). docs 커밋은 테스트 대상 파일을 바꾸지 않으므로 이 기준선을 그대로 씁니다 |
| 2026-11-18 | P0-b | 기록 | — | `npm view @xai-official/grok version` → `1.0.88`(1.0.x, range 유지). T3 시작 직전에 다시 확인합니다 |
| 2026-11-18 | T1 | 수용 | (이 커밋) | Implementer 9dea2fb9(재개 1회: 선택적 read 오류 후 동일 세션 재개), QA 889dcd66 수용 권고. 호스트 `npm test` 2637/2586/35 = 기준선과 동일(신규 0), PTY 35 PASS, golden·manifest·role-policy·parity 통과, 주입 검출 확인(사본, `lib/tui/setup.mjs:192`) |
| 2026-11-18 | T2 | 수용 | (이 커밋) | Implementer 8f551e3b → 보정 교체 0efe1e07(R7: `capability-surfaces`, `management-status`를 Orchestrator가 허용 목록에 추가, lease allowedPaths 변경 불가로 교체). QA ab90e9b4 수용 권고(작업 테스트 330 PASS). 호스트 `npm test` 2656/2605/36 = 기준선 + 부하 flake 1(`role-routing-dispatch` 단독 29/29) |
| 2026-11-18 | T3 | 수용 | (이 커밋) | P0-b 재확인 `1.0.88`. Implementer 845f8427(재개 2회: 자기 결함 `CAPABILITY_KEYS` 오삽입·생성물 미갱신, tui-setup locked R 판정) → 보정 교체 bdf4670a(R7: anchor-flip, install-mode-n-platform, install-mode-switch, targets, tui-custom-preset 허용 목록 추가). QA ed451fe2: AC-K9 fail(추가 frontmatter 키 통과) → 정확한 키 집합 제한·주석 정정(spec 6장 우선, plan의 순수 복제 지시와 차이) → 재확인 494/494 PASS, 수용 권고. 호스트 `npm test` 2687/2636/35 = 기준선 + install-mode-n-platform 파일 timeout(단독 70/70) |
| 2026-11-18 | T4 | 수용 | (이 커밋) | Implementer 46911c3a → 보정 교체 3f85bf22(R7: `gemini-platform.test.mjs:357` POLICY_TARGETS 허용 집합에 grok, Orchestrator의 허용 목록 누락). QA c284f85c: 작업 테스트 277/277, AC-K4·K3·K7·payload·생성물 pass. QA 분류 지적 1건(`grok-platform.test.mjs` `platforms.grok` false→true)은 plan T3의 "T4 전" 단계 기대값이 계획대로 전환된 것으로 Orchestrator가 처리(결함 아님, 강도 동일). `npm pack --dry-run` grok/ 19개. 호스트 `npm test` 보정 전 2678/2625/37 = 기준선 + 보정 대상 1 + flake 2(단독 PASS) |
| 2026-11-18 | T5 | 수용 | (이 커밋) | Implementer eb3dca50(23 files, 218/218). QA 4f372103: AC-K5·K6·K9·K2·routing·갱신 세트 8항목·생성물 pass, 작업 테스트 202/202; QA 명령 regex 오류로 미확인이던 리터럴 분기 범위는 Orchestrator 호스트 `rg --pcre2`로 허용 목록 파일(lib/runtime·shared 사본)만 확인, hardcoding-residual 11/11. 호스트 `npm test` 2727/2676/35 = 기준선 + install-mode-n-platform 파일 timeout(단독 70/70), ps 의존 bridge 51/51 |
| 2026-11-18 | T6 | 수용 | (이 커밋) | Implementer b59378e9(신규 `tests/node/grok-composite.test.mjs` 1개, 운영 코드 변경 없음, 호스트 24/24). QA 9520f091: 주입 registry·publish S={claude,grok}·4플랫폼 lock 순서·`arc_scouter` lease v2·`arc_qa` hold·Gemini 무수정·manifest pass, 변이 3건 모두 ERR_ASSERTION으로 검출. 호스트 `npm test` 2729/2677/36 = 기준선 + install-mode-n-platform 파일 timeout + `cancel uses SIGTERM then SIGKILL before identity`(부하 flake); 전체 재실행 2731/2681/35 = 기준선과 동일 |
| 2026-11-18 | T7 | 수용 | (이 커밋) | Implementer 565cfb0d(4 files). 14장 대조: README 40 Configure·41–42 병합(정확 문자열)·48 `> Grok`·81 아래 Grok 행·93·95 Configure; harness-operation 42 `> Grok`·72 아래 Grok 행·114 Home·123 접두문+Configure·129·132·134 Configure — 7 hunk 모두 14장 항목, 범위 밖 0. QA 530dd4b0 수용 권고(병합 행 바이트 일치, formerly·GK1/GK2 0건, rg 잔존 0, residual 1/1, manifest OK). 호스트 `npm test` 2712/2661/35 = 기준선 + install-mode-n-platform 파일 timeout(기존 부하 flake) |
| 2026-11-18 | FR | 수용 | (이 커밋) | Reviewer c48ad94c(native) `564ea20..4c82508` 검토: 차단 결함 0, D1(Low, prompt 파일 path chmod) · S1(의심, `collectInstalledState` capability 필터 없음) · Q1(note 병합 해석) · Q2(OD-2 카탈로그 근거 없음). Orchestrator 판정: D1 수정, S1 수정안 (a)(spec 5.6·D10), Q2 spec 5.3 위반으로 `grok-4.6`만(OD-2 정정), Q1 plan 해석 유지(플랫폼 note는 접미사가 있어 같은 문구 아님). Implementer ec642d10(fresh, FR 수정 경계): `fchmodSync(promptFd)`, upgrade-state descriptor 필터, 카탈로그 1개, 회귀 테스트 3개 추가(RED 확인), 지정 211/211. Reviewer 재확인: 3건 해소, 신규 N1(Low, `grok-platform` 모델 치환 검출력 상실) → 같은 Implementer 재개로 `grok-test` 설정+불일치 단언, 호스트 변이(render 치환 무력화) 27/1 검출, 28/28 → Reviewer 해소·신규 결함 0. 호스트 `npm test` 2708/2655/37 = 기준선 + install-mode-n-platform 파일 timeout + flake 2(`role-bridge-run` PID reuse, `codex-auth-probe` app-server timeout; 단독 86/86). 후속 점검(capability 전환 시): grok install verified 전환 후 `~/.grok` 흔적이 있으면 버전 간 stateToken 차이로 CLI 교체 후 upgrade 재시도가 필요할 수 있음 |

### 부록 A — 기존 단언 old → new 대응표

각 작업의 Implementer 보고에서 Orchestrator가 옮겨 적습니다. 분류는 "기존 단언 3→4 분류 규칙"의 R/V/S/M/K를 씁니다. 작업마다 "수정 파일 assert 감소 0건 확인"을 한 줄로 남깁니다.

| 작업 | 파일:행 | old | new | 분류 | 근거 |
|---|---|---|---|---|---|
| T1 | `tests/node/{tui-app,tui-app-pty,tui-setup,tui-render,composite-live,anchor-migration,npm-lifecycle,upgrade-cli,tui-package-consumer,install-mode-n-platform,composite-instructions}.test.mjs` (행은 Implementer 보고) | `Install / Update` / `Install \/ Update` | `Configure` | M | spec 13.1 |
| T1 | `tests/node/tui-app.test.mjs:183,187`, `anchor-migration.test.mjs:175` | `…Claude home on the next Install / Update.`(40열 줄바꿈 포함) | `…Claude home the next time you apply Configure.` | M | spec 13.1 상태 안내 |
| T1 | `tests/node/upgrade-cli.test.mjs:9–13` | — | 반환값·stderr 정확 문자열 단언 2개 추가 | M | spec 13.1 update.mjs 문구 |

| T2 | `tests/node/tui-app.test.mjs`(홈 배열·렌더 횟수·Status prepare·Version 행 정렬·기본 Back·버전 화면 이관; 행은 Implementer 8f551e3b 보고) | 5항목 홈, 별도 `Check Version` 화면, 기본 Upgrade | 4항목 홈, Status Version 행, 기본 Back | M | spec 13.2 |
| T2 | `tests/node/tui-app-pty.test.mjs:29,59–109,129` | `PREPARES=0`, 별도 버전 화면, Uninstall 이동 3회 | `PREPARES=1`, Status 흐름, 이동 2회 | M | spec 13.2 |
| T2 | `tests/node/{tui-render:85,tui-terminal:102,112,npm-lifecycle:17,upgrade-cli:6}` | `Check Version` 제목·항목·보조 문구 | `Status` | M | 홈 항목 제거 |
| T2 | `tests/node/capability-surfaces.test.mjs:134` | 홈 `down` 3회 | 2회 | M | 새 홈 Uninstall 위치 |
| T2 | `tests/node/management-status.test.mjs:19` | `rows.includes('Codex    '+label)` | `Codex` 행 정확히 1개, 값 `label` deepEqual | M | Version 행으로 정렬 폭 변경(강도 유지 이상) |
| T2 | `tests/node/menu-label-residual.test.mjs:10,24` | 금지 문구 1개 | `'Check ' + 'Version'` 추가 | M | AC-M1 |

| T4 | `tests/node/agent-fragments.test.mjs:27–28`, `installed-layout-golden.test.mjs:16–33`, `manifest.test.mjs:8,79`, `fixtures/installed-layout.mjs:17,24,41`, `fixtures/static-references.mjs:11`, `gemini-platform.test.mjs:357` | 3개 플랫폼 payload·조합·정책 대상 | grok 추가(15→20 targets, 12→16 조합) | R | 전체 payload 목록 |
| T4 | `tests/node/grok-platform.test.mjs:190` | `platforms.grok` 존재 false | true | 단계 전환 | plan T3 "T4 전" 기대값의 계획된 전환 |

| T5 | `tests/node/runtime-assets.test.mjs:12`, `runtime-versions.test.mjs:24` | runtime 모듈 목록·baseline | `grok-stream.mjs` 추가, baseline 갱신 | R | runtime 갱신 세트 |
| T5 | `tests/node/role-routing-dispatch.test.mjs:25`, `grok-capability-evidence.test.mjs:27` | gate 결과 객체, 고정 항목 | GK1/GK2, GK·resume 단언 추가 | 확장 | plan T5 명시 |

T1: 수정 파일 assert 감소 0건 확인(QA 889dcd66, upgrade-cli 40→42).
| T3 | `tests/node/platform-registry.test.mjs:70–72,181–183`, `gemini-platform.test.mjs:25–26`, `management-status.test.mjs:51`, `targets.test.mjs:44` | 3개 플랫폼 목록 | `grok` 추가 | R | 운영 registry 전체 |
| T3 | `gemini-platform.test.mjs:308`, `capability-surfaces.test.mjs:204,206`, `install-mode-switch.test.mjs:22,25`, `install-mode.test.mjs:27,33` | 전체 Status·homes | Grok `Not verified`/`absent`/`unresolved` 추가 (targets V 단언 유지) | R | 전체 Status |
| T3 | `anchor-flip.test.mjs:88`, `install-mode-n-platform.test.mjs:47,204` | homes·F4 비교 배열 | `grok: 'standalone'`, Grok Status 보충 | R | 운영 registry 전체 결과와 비교 |
| T3 | `tui-app.test.mjs:226,383–385,478`, `tui-setup.test.mjs:132,179,241–321`, `tui-app-pty.test.mjs:65,89`, `tui-custom-preset.test.mjs:159,175` | 플랫폼 행·인덱스·이동 횟수 | Grok 행 추가, 인덱스/이동 +1 | R | 표시 목록 전체 |
| T3 | `tui-setup.test.mjs:249` ('locked') | `['claude','codex','gemini']` | `DEFAULT_INSTALLER_REGISTRY.platformIds()` | R | Orchestrator 판정: "모든 플랫폼이 역할에 사용" 시나리오 |
| T3 | `hardcoding-residual.test.mjs:129,139` | `gemini` 패턴 | `(?:gemini|grok)` | — | spec 4.3 지정 확장 |

T2: 수정 파일 assert 감소 0건 확인(QA ab90e9b4, tui-app 429→483, tui-app-pty 65→68).
T3: 수정 파일 assert 감소 0건 확인(QA ed451fe2; 보정 5파일 603→603).
T4: 수정 파일 assert 감소 0건 확인(QA c284f85c).
T5: 수정 파일 assert 감소 0건 확인(QA 4f372103; capability-evidence 5→8).
T6: 기존 테스트 수정 없음, 신규 파일만 추가(QA 9520f091).
T7: `menu-label-residual` 검사 대상 확장(EXTRA_PATHS 2개), assert 감소 0건(QA 530dd4b0).
FR: `grok-platform.test.mjs:20,76,89` 모델·카탈로그 기대값 조정(`grok-4.5`→`grok-test`, 카탈로그 3→1), 불일치 단언 추가; assert grok-platform 76→77, grok-install 41→48, grok-bridge 76→83, 감소 0건(Reviewer c48ad94c 재확인).

### 부록 B — 기준 실패 목록

P0-a에서 Orchestrator가 기록합니다: HEAD, 실행 환경, `npm test` 총계(tests/pass/fail/skipped), 실패 이름 전부, PTY 파일 단독 결과.

- HEAD `564ea20`(+ 미커밋 spec), macOS(darwin), `node --test --test-timeout=300000 tests/node/*.test.mjs`, 2026-11-18
- 총계: tests 2620, pass 2569, fail 35
- 파일 단위 `tests/node/install-mode-n-platform.test.mjs` 실패 1건은 단독 재실행에서 70/70 통과하여 부하 flake로 분류하고 제외했습니다.
- PTY: `cli-pty`의 `bare arc opens English TUI…` 3건은 기준 실패입니다. `tui-app-pty.test.mjs`는 기준 실패가 없습니다.

실패 이름(35):

- bare arc opens English TUI and restores PTY after "\\u0003"
- bare arc opens English TUI and restores PTY after "\\u0004"
- bare arc opens English TUI and restores PTY after "\\u001b"
- Claude allowed external skill link becomes independent and rollback restores original literal link
- claude applies existing gates only when triggered without adding new obligations
- claude contracts have explicit destinations and before-action gates
- claude en skipGlobal=false preserves public rendering baseline
- claude en skipGlobal=true preserves public rendering baseline
- claude installed endpoint preserves workflow guards without package dependencies
- claude ko skipGlobal=false preserves public rendering baseline
- claude ko skipGlobal=true preserves public rendering baseline
- codex applies existing gates only when triggered without adding new obligations
- codex contracts have explicit destinations and before-action gates
- codex en skipGlobal=false preserves public rendering baseline
- codex en skipGlobal=true preserves public rendering baseline
- Codex existing root field edits preserve indentation, comments and nested fields
- codex installed endpoint preserves workflow guards without package dependencies
- codex ko skipGlobal=false preserves public rendering baseline
- codex ko skipGlobal=true preserves public rendering baseline
- failed acquired directory metadata verification retains originals before publication
- generated global upgrade preserves settings, reports partial failure, retries newer version and npx applies displayed latest version
- packed all-target install preserves distinct omitted platform limits independently
- packed help, metadata and service preparation leave real homes untouched
- packed instruction references install with valid links for both platforms in custom spaced homes
- packed management installs, changes models and removes without a global arc
- packed reinstalls synchronize managed trees, preserve unrelated content without backups
- packed tarball executes every target with active roles without Python or source access
- packed temporary-HOME limit install, reinstall, drift selection and uninstall preserve native keys
- packed transaction rolls back real published targets and cleans owned rollback stages
- profile models, permissions, canonical policy and CLI/runtime bytes are preserved
- publishes both flat platforms and manifest consistently without replacing ARC-owned files
- read-only packed modes never invoke Git and package metadata stays protected
- release consumer opens TUI only on explicit launch and installs independent platform endpoints
- scripts-disabled packed install uses static references in custom CODEX_HOME without rewriting readonly package
- staging populates acquired nested 0555/0500 directories before restoring metadata

## 계획 결정 기록 (Orchestrator 확정 2026-11-18, spec 범위 안)

OD-1–OD-7은 모두 아래 기본안으로 확정합니다. 각 항목은 승인된 spec 범위 안의 실행 판단이며 새 제품 결정이 아닙니다.


- **OD-1 `readOnlyDeny` 값.** 확정: `['Bash','Edit','Write','MCPTool']`.
  - 근거: 문서상 rule 이름 중 `Bash`·`Edit`·`Write`는 쉘·쓰기 도구입니다. `MCPTool`은 임의의 MCP 서버 도구 전체를 뜻하며 읽기 전용을 보장할 수 없어 쓰기·셸 효과를 낼 수 있는 범주입니다. 이는 R2/D12(MCP 자동 로드로 정책 밖 도구 노출)와도 맞습니다.
  - `Read`·`Grep`·`Glob`·`WebFetch`·`WebSearch`는 읽기 계열이라 제외합니다.
  - 차단 효과는 unverified로 유지합니다(U-K5).
  - `MCPTool`을 spec의 "쓰기·셸 도구 rule" 밖으로 본다면 `['Bash','Edit','Write']`를 씁니다.
- **OD-2 카탈로그 모델.** spec 5.3은 Scouter가 문서로 확인한 ID만 추가를 허용합니다. 확정(FR 정정): `grok-4.6` 하나. 최초 기본안의 `grok-4.5`·`grok-build`는 Scouter 결과(69a82e78, 56cea4d7)에 문서 근거가 없어 최종 Reviewer 지적(Q2)에 따라 제거했습니다.
- **OD-3 T1의 홈 배열.** T1은 라벨만 바꾸고 `Check Version` 항목은 T2에서 제거합니다. spec 13.1의 `app.mjs:11` 값은 T2 완료 시점의 최종값으로 해석했습니다. 각 커밋에서 기능 공백이 생기지 않게 하려는 선택입니다.
- **OD-4 `role-routing.mjs:234/246`을 T5에 배치.** spec 9장은 composite 장에 이 변경을 적었습니다. 그러나 15장 "T6은 T5에 의존(`sessionId` 예약, gate)"과 AC-K5/K6 통합 테스트가 `prepareRoleDispatch`를 거쳐야 한다는 점 때문에 T5에 넣었습니다(Gemini `gemini-bridge.test.mjs`도 같은 구조).
- **OD-5 role-policy 분할.** `controls.grok`은 T3, `platforms.grok`은 T4에 둡니다. `lib/policy/render.mjs`의 `POLICY_TARGETS`가 `platforms` 키로 `grok/` payload 파일을 요구하기 때문입니다(Gemini T10/T11 선례와 같음).
- **OD-6 새 export와 새 테스트 파일.**
  - `isNewerVersion`(`update.mjs`)와 `statusVersion`(`mode.mjs`)를 추가합니다. management API의 `kind`/`target` 의미는 바뀌지 않습니다.
  - AC-M1 "grep 테스트"를 `tests/node/menu-label-residual.test.mjs`로 구현합니다.
- **OD-7 zeta fixture.** grep 결과 grok과 zeta(`anchorOrder 3`)를 함께 넣는 registry 구성이 없어 zeta는 옮기지 않습니다. 충돌이 나타나면 T3에서 보고합니다.
- **P0-b 결과에 따른 분기:** 최신 minor가 1.0이 아니면 spec 11.4 고정값과 충돌하므로 사용자 결정으로 넘깁니다.
