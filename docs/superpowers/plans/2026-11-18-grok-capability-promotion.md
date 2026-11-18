# Grok capability 전환(Gemini 수준) 구현 계획

> **실행 방식:** ARC Orchestrator가 작업마다 새 Implementer를 배정합니다. Implementer는 bridge, 작업마다 fresh이고, `allowedPaths`는 아래 각 작업의 Files 목록 전체입니다. T1·T3은 fresh QA를, T2는 focused checks를, T4는 diff 검토를 거친 뒤 Orchestrator가 수용하고, 수용된 작업 하나당 커밋 하나를 Orchestrator가 만듭니다. Implementer와 QA는 Git 상태를 바꾸지 않습니다. 모든 작업이 수용되면 Reviewer가 전체 변경을 1회 검토합니다.

**Goal:** Grok capability 6개(`install`, `nativeProfile`, `catalog`, `standalone`, `bridge`, `compositeRole`)를 사용자 결정으로 verified로 바꿉니다. live 검증은 아닙니다. 같은 변경에서 `~/.grok/config.toml`의 `[compat.claude]` managed 편집·원복, bridge 자식 차단 env, notice, 2쌍 카탈로그, 테스트 전환을 함께 출하합니다.

**Architecture:**
- config 편집은 새 installer 모듈 `lib/installer/grok-compat.mjs`에 둡니다. descriptor hook `runtimeConfig.globalRender`/`globalRemove`를 거쳐 `plan.mjs`·`uninstall.mjs`가 일반 경로로 호출합니다. `'grok'` 리터럴 분기는 없습니다.
- capability 원천은 계속 runtime descriptor입니다.
- off 동작 회귀는 주입 off registry fixture로 옮겨 보존합니다.
- 운영 registry 테스트는 PATH를 fixture로 고정해 실제 `grok`을 실행하지 않습니다.

**Tech Stack:** Node.js ≥22 ESM(`.mjs`), `node:test`, `parseToml`(`lib/models/config.mjs`), `node:util` `isDeepStrictEqual`, safe-fs, PTY 헬퍼, 주입 registry(`createPlatformRegistry`/`createInstallerRegistry`), fake CLI

**Spec:** `docs/superpowers/specs/2026-11-18-grok-capability-promotion-design.md`(사용자 "승인", sha256 `172a46d0039a0851c1d304430cb3a654d9e7d49a288fe7bd53b64d464d712158`). 선행 spec·plan은 `docs/superpowers/specs/2026-11-18-grok-platform-support-design.md`와 `docs/superpowers/plans/2026-11-18-grok-platform-support.md`이고, 테스트 영향 조사는 `.git/arc/workflows/grok-support/dispatches/0d123196-030c-4c64-b24e-9ea359406529/result.md`입니다.

**기준:** 브랜치 `feat/grok-support`, 시작 HEAD `0ec8647`(+ spec·plan docs 커밋). 실행 대상은 현재 checkout입니다(사용자 명시 선택). 테스트 기준선은 부록 B입니다.

## Global Constraints

- **capability(정확값, spec 2.1):**
  - verified: `install`, `nativeProfile`, `catalog`, `standalone`, `bridge`, `compositeRole`. 표현은 `{state: 'verified'}`이고 Gemini `platform-registry.mjs:122-125`와 같은 형태입니다.
  - off: `compositeHost` `composite host not verified`, `authProbe` `no official auth status command`, `watch` `watch support out of scope`
- **바꾸지 않는 값:**
  - `cli.supportedVersions: '>=1.0.0 <1.1.0'`, `auth.kind: 'none'`
  - `home.resolve`(`GROK_HOME`이 설정되면 `throw Error('GROK_HOME is not verified')`), `routing.validatePair`, `profile`, `executionEnvironments ['grok-cli']`
  - `BRIDGE_GATE_RESULTS.GK1/GK2 === 'fail'`, `SUPERVISOR_IMPLEMENTATIONS.get('grok').resume === 'off'`
  - `GROK_CONTRACT.isolationArgs = ['--no-auto-update', '--no-subagents']`, `isolationEnv: () => ({})`, `grok/skill/models.toml`
- **관리 키·표식:** `MANAGED_KEYS = ['agents', 'skills', 'rules']`(이 순서), 표식 `# arc:managed`. 정규식은 spec 3.2에 적힌 그대로 씁니다.
- **ARC 생성 파일(정확):**
  ```
  [compat.claude] # arc:managed
  agents = false # arc:managed
  skills = false # arc:managed
  rules = false # arc:managed
  ```
- **중단 사유(정확):**
  - `config.toml is not UTF-8`
  - `TOML parse failed`
  - `[compat.claude] uses an unsupported representation`
  - `[compat.claude] <K> must be a boolean`
  - `[compat.claude] <K> uses an unsupported representation`
  - `[compat.claude] <K> = true is set by the user; set it to false or remove it`
  - `cannot verify the safe edit`
- **설치 오류 래핑(정확):** `Cannot update <absolute config.toml path>: <사유>; fix it or use --skip-global`(`TargetConfigurationError`)
- **notes·action(정확):**
  - `[compat.claude] <K> = false is user-owned and kept`
  - `[compat.claude] <K> reset to false (arc:managed)`
  - `set [compat.claude] <쓴 키 ", "> = false (arc:managed)`
  - action `set Grok Claude compatibility` / `unchanged`
  - 제거 note `restored [compat.claude] managed lines`
- **제거 경고(정확):** `<absolute config.toml path>: ARC-managed [compat.claude] lines were not restored (<사유>); remove lines marked # arc:managed manually`. 이때 결과는 `code 0`입니다.
- **skip-global(정확):**
  - 설치: `<runtimeConfigPath>: compatibility settings update skipped (--skip-global).`
  - 제거: `<runtimeConfigPath>: compatibility settings not restored (--skip-global).`
  - 기존 `Native concurrency update skipped (--skip-global).`는 유지합니다.
- **uninstallSummary(정확):** `Grok config.toml is preserved except ARC-managed [compat.claude] lines.`
- **childEnv(정확, 키 순서 고정):** `GROK_DISABLE_AUTOUPDATER: '1'`, `GROK_CLAUDE_AGENTS_ENABLED: 'false'`, `GROK_CLAUDE_SKILLS_ENABLED: 'false'`, `GROK_CLAUDE_RULES_ENABLED: 'false'`, `GROK_CLAUDE_MCPS_ENABLED: 'false'`, `GROK_CLAUDE_HOOKS_ENABLED: 'false'`
- **notice(정확, spec 8장):** `Role restrictions are prompt-level contracts, not a filesystem sandbox. Grok sandboxing, native tool restriction fields, observer hooks and Git guards are unverified, and Grok may continue without its sandbox. Use only available authorized tools; ARC disables Grok Claude compatibility (agents, skills, rules in config.toml; also MCPs and hooks for bridge children), but whether Grok sessions honor these settings is unverified.`
- **카탈로그(정확):** `{"platform": "grok", "pairs": [{"model": "grok-4.6", "effort": "default"}, {"model": "grok-4.5", "effort": "default"}]}`. 2칸 들여쓰기, 끝 개행 1개이며 spec 6장 블록과 바이트가 같아야 합니다.
- **표면 문자열(정확):** `Available · auth unverified`(Status 행), `Grok: Available (auth unverified)`(홈), `Grok: auth unverified — ARC cannot confirm Grok CLI login.`(편집기 상세), Hosts `Grok - Unavailable  (capability not verified)` 유지
- **위치 제한:**
  - `'grok'` 리터럴 분기(`=== 'grok'`)는 `plan.mjs`, `uninstall.mjs`, `grok-compat.mjs`를 포함해 `hardcoding-residual` 허용 목록 밖에 두지 않습니다.
  - `grok-compat.mjs`는 runtime 자산이 아닙니다. `RUNTIME_MODULE_PATHS`나 manifest runtime 목록에 넣지 않습니다.
  - `shared/skill/runtime/**`는 손으로 고치지 않고 `node scripts/update-runtime-assets.mjs`로만 동기화합니다.
- **변경 범위 제한:**
  - `lib/policy/role-policy.json`은 `platforms.grok.notice` 1개만 바꿉니다.
  - Codex·Claude·Gemini의 설치·제거 plan과 결과 바이트, 그리고 그 생성물은 바이트 단위로 같아야 합니다.
  - `lib/tui/**`, `lib/platforms/availability.mjs`, `lib/management/status.mjs`는 바꾸지 않습니다. 바꿔야 한다면 hold하고 보고합니다.
- **실행 금지:** live `grok`, 네트워크, 실제 home 설치는 Implementer·QA가 실행하지 않습니다. 전체 `npm test`, PTY, sentinel 실행은 Orchestrator가 호스트에서 수행합니다.
- **fixture 위치:** 테스트 전용 fixture는 `tests/node/fixtures/**`에만 두고, 운영 코드는 이를 import하지 않습니다.
- **과거 문서:** `docs/superpowers/{specs,plans}/**`의 과거 문서는 수정하지 않습니다(이 plan의 진행 기록 갱신은 제외).
- **커밋 메시지:** `type(scope): 한국어 설명` 형식이며, 수용 후 Orchestrator가 만듭니다.

### PATH 격리 수단 (R7, spec 11.1 확정)

**코드 사실(Planner 확인)**
- `resolveLocalCli(platform, {cwd, userHome, env = process.env, runtimePlatforms})`(`lib/runtime/local-cli.mjs:14`)는 **전달된 `context.env.PATH`만** 탐색합니다(`:22`). 기본값 `process.env`는 `env` 키를 생략했을 때만 적용됩니다.
- `env`에 `PATH`가 없으면 탐색 디렉터리가 0개이고 결과는 `cli_not_found`입니다.
- `collectStatus`는 `context`를 그대로 넘깁니다(`status.mjs:23`). management 기본 context는 `env: process.env`이며 `options.env`로 덮어쓸 수 있습니다(`operations.mjs:31`).
- 공통 fixture `compositeContext`는 `env: {PATH: <tmp>/bin:/usr/bin:/bin}`입니다(`tests/node/fixtures/install-mode.mjs:24`).

**규칙**
1. 프로세스 안 테스트는 운영 registry로 `collectStatus`·`prepareOperation`·`runTui`·routing status를 부를 때 context에 `env`를 **반드시 명시**합니다(`compositeContext` 또는 `{PATH: <fixture bin>}`). `env` 키를 빼면 안 됩니다.
2. 자식 프로세스 테스트(PTY, CLI)는 spawn env를 `{...process.env, PATH: <fixture PATH>}`로 줍니다. `tui-app-pty` 선례가 이 형태입니다.
3. fake grok은 T3의 `writeFakeGrokCli`로만 만듭니다.
4. **sentinel(Orchestrator, AC-F11):**
   - T3 STD-CLOSE와 FR 전에 호스트에서 sentinel 디렉터리를 만들고 그 안에 `grok` 스크립트를 둡니다. 스크립트는 `printf '%s\n' "$PWD $*" >> <절대 sentinel log>; exit 1`입니다.
   - 이 디렉터리를 PATH **맨 앞**에 두고 `npm test`를 실행합니다. sentinel log가 없어야 합니다.
   - fixture PATH를 쓰는 테스트는 sentinel에 닿지 않으므로, log가 생겼다면 격리 누락입니다.
5. **P0-c:** `command -v grok` 경로가 `/usr/bin` 또는 `/bin` 아래라면 `compositeContext` PATH 격리가 성립하지 않습니다. 이 경우 T3을 hold하고 보고합니다.

### 주입 off registry helper (spec 11.2-2 확정)

- **위치:** `tests/node/fixtures/platforms/grok-off.mjs`(T3 신규). `zeta.mjs` 패턴을 따릅니다.
- **export:**
  - `GROK_OFF_REASONS`: 9개 key→reason, 원 spec 값(선행 plan Global Constraints와 같음)
  - `grokOffRegistries(): {runtimePlatforms, platforms}`
    - 운영 registry를 복사하고 grok `capabilities`만 `GROK_OFF_REASONS`의 `{state:'off', reason}`으로 바꿉니다.
    - 설치기 descriptor는 운영 `DEFAULT_INSTALLER_REGISTRY.getPlatform(id)`를 그대로 쓰므로 T1 hook을 포함합니다.
  - `writeFakeGrokCli({bin, marker, version = '1.0.89'}): string`
    - `bin/grok`을 `0o755`로 씁니다. 스크립트는 `#!/bin/sh\nprintf '%s\n' "$*" >> '<marker>'\nprintf 'grok <version> (test)\n'\n`입니다.
    - 반환값은 경로입니다.

### 표준 마무리 절차 (STD-CLOSE)

1. `lib/runtime/**` 또는 `lib/policy/role-policy.json`을 바꿨다면 `node scripts/update-runtime-assets.mjs`를 실행합니다. 이어서 `node scripts/update-runtime-assets.mjs --check`가 `Runtime payload verified`를 내야 합니다.
2. runtime 또는 payload 해시가 바뀌었다면 다음을 갱신합니다.
   - `node tests/node/fixtures/installed-layout.mjs --write`
   - `tests/node/runtime-versions.test.mjs` baseline(의도된 값)
   - 이후 `node tests/node/fixtures/installed-layout.mjs --diff`에서 차이가 0이어야 합니다. T1·T4는 golden 차이 0이 기대값이고, 차이가 있으면 hold합니다.
3. `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest`가 PASS여야 합니다.
4. `npm run check:role-policy`가 PASS여야 합니다. T2만 grok 생성물이 바뀌고, 다른 작업은 생성물 변경 0이어야 합니다. Claude/Codex/Gemini 생성물은 언제나 0입니다.
5. `node scripts/check-installer-parity.mjs` PASS
6. 작업 테스트(`node --test <작업 테스트 파일>`) PASS
7. `npm test`(Orchestrator 호스트)에서 부록 B 기준 밖 신규 실패가 0이어야 합니다("검증 판정" 절).
8. TUI 표면 기대값이 바뀌는 T3은 `node --test tests/node/tui-app-pty.test.mjs`(호스트)가 PASS여야 합니다.
9. `git status --short`에는 작업 Files와 생성물만 보여야 합니다. `git diff --stat -- claude codex gemini`는 비어 있어야 합니다.
10. 기존 테스트를 고쳤다면 Orchestrator가 수정 파일마다 HEAD 대비 `assert` 호출 수 감소 0을 확인하고 부록 A에 기록합니다.

### 기존 단언 분류 규칙 (spec 11.2, 모든 작업 공통)

| 분류 | 정의 | 처리 |
|---|---|---|
| O 운영 갱신 | 운영 Grok off 상태(verified `[]`, `Not verified`, `all` 제외, 미실행)를 단언 | spec 2.1·7장 값으로 교체 |
| F 주입 off 이동 | off 동작 자체가 목적(CLI 미실행, 흔적 있는 off 제거, upgrade 제외, management 거부) | `grokOffRegistries()`로 옮기고 단언은 바꾸지 않음 |
| P PATH 격리 | 운영 registry가 grok CLI를 해석할 수 있음 | 위 PATH 규칙 적용(O·F와 함께 표기 가능) |
| U 불변 | `compositeHost`·`authProbe`·`watch`·gate·resume 의존 | 바꾸지 않음. 실패하면 결함 후보이므로 hold |

- Files 밖 파일에서 실패하면 Implementer는 편집하지 않고 반환합니다. Orchestrator가 허용 목록에 추가할지 판단하고 진행 기록에 남깁니다.
- 표의 "R7 가능성" 파일은 실패할 때만 고칩니다. 고친 경우 분류와 근거를 보고합니다.

## Review Focus

1. **`[compat.claude.x]` 하위 표만 있는 config.toml.** 상위 헤더를 EOF에 덧붙이는 편집이 TOML상 유효해야 하고, 재파싱 검증을 통과해야 합니다. 테스트: T1 `subtable-only appends managed header at EOF`.
2. **0바이트이거나 주석만 있는 config.toml.** 앞에 빈 줄 없이 4줄 표가 붙어야 합니다. 테스트: T1 `empty or comment-only file gets managed table`.
3. **UTF-8 BOM으로 시작하는 config.toml.** BOM이 조용히 사라지면 안 됩니다. 디코더는 `new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})`이고, 성공하면 결과가 원본 BOM 3바이트로 시작해야 하며 실패하면 `TOML parse failed`입니다. 테스트: T1 `BOM is preserved or rejected`.
4. **Claude·Codex만 Configure하려는데 grok config에 사용자 `true`가 있는 다중 대상 실행(R3).** plan 단계에서 실패하므로 모든 home이 바뀌지 않아야 하고 오류 문자열이 정확해야 합니다. 테스트: T1 `target all aborts before any home changes`.
5. **호스트 PATH의 실제 `grok`(R7).** 운영 registry 테스트 어느 것도 실행하면 안 됩니다. 테스트: T3 sentinel 실행과 `operational Grok status runs only --version`.

## 사전 조건 (Orchestrator)

- **P0-a 기준선:** HEAD `0ec8647`에서 `npm test`를 실행하고 부록 B의 35건 목록과 대조합니다.
- **P0-b:** T3 시작 전 `npm view @xai-official/grok version`을 기록합니다. 1.0.x가 아니면 T3을 hold하고 사용자에게 보고합니다(range 고정값).
- **P0-c:** `command -v grok` 경로를 기록합니다(PATH 격리 규칙 5).

---

## 의존성과 실행 순서

| 작업 | 제목 | 선행 |
|---|---|---|
| T1 | config.toml managed 편집·원복과 설치기 hook 일반화 | P0-a |
| T2 | bridge `childEnv`와 role-policy notice | P0-a(T1과 논리 독립) |
| T3a | composite upgrade snapshot 교차 drift 수정(v2) | T2 |
| T3 | capability 전환, 카탈로그, 고정 테스트, 테스트 전환 | T1, T2, T3a(수용·커밋), P0-b, P0-c |
| T4 | 문서 2행 | T3 |
| FR | 최종 독립 Reviewer 1회 | T1–T4 수용, 필수 QA·재확인 완료 |

**실제 실행은 직렬입니다(T1 → T2 → T3 → T4 → FR).** v2: T3 구현 후 호스트 검사에서 T3a가 추가되어, T3a 수용·커밋 → T3 재검증·수용·커밋 순서로 진행합니다. 근거는 공유 파일입니다.
- `MANIFEST.sha256`: T1(`lib/installer/*`, `lib/platforms/grok.mjs`), T2, T3, T4(`README.md`)
- `installed-layout-golden.json`: T2, T3
- `tests/node/grok-install.test.mjs`: T1 → T2(notice 단언 202행) → T3
- `tests/node/grok-platform.test.mjs`: T1(42–43행) → T3
- `tests/node/grok-bridge.test.mjs`: T2 → T3
- `tests/node/runtime-versions.test.mjs`: T2 → T3

**hold 범위**
- T1이 실패하면 T2는 논리 독립이므로 Orchestrator가 공유 생성물 기준을 확인한 뒤 해제할 수 있습니다. T3·T4·FR은 hold합니다.
- T2가 실패하면 T3·T4·FR을 hold합니다. T1은 이미 독립 수용 가능합니다.
- T3a가 실패하면 T3·T4·FR을 hold합니다.
- T3이 실패하면 T4·FR을 hold합니다.
- 필수 검사가 미해결이면 해당 작업 수용을 보류합니다.

**QA:** T1·T3a·T3은 fresh QA(필수), T2는 focused checks(spec 13장, 필수 검사 목록 그대로), T4는 diff 검토입니다. Reviewer는 작업마다 두지 않고 FR에서 1회만 둡니다.

---

### Task T1: config.toml managed 편집·원복과 설치기 hook 일반화

**AC:** AC-F2, AC-F3, AC-F4, AC-F5

**목표:** spec 3·4장을 구현합니다. 운영 capability는 아직 off이므로, 통합 검증은 `grok-install.test.mjs`의 기존 `verifiedRegistry` 주입 registry로 합니다.

**Files:**
- Create: `lib/installer/grok-compat.mjs`, `tests/node/grok-compat.test.mjs`
- Modify:
  - `lib/installer/plan.mjs:42-57`
  - `lib/installer/uninstall.mjs:21-24`
  - `lib/platforms/grok.mjs:10-11`
  - `tests/node/grok-install.test.mjs`
  - `tests/node/grok-platform.test.mjs:42-43`
- 생성물: `MANIFEST.sha256`
- R7 가능성: `tests/node/manifest.test.mjs`, `tests/installer-parity.json`, `tests/node/fixtures/installed-layout-golden.json`(차이가 생기면 hold)

**Interfaces:**
- Produces:
  - `renderGrokCompat(original: Buffer|null) → {content: Buffer, action: 'unchanged'|'set Grok Claude compatibility', notes: string[]}`(throw는 중단 사유)
  - `removeGrokCompat(original: Buffer|null) → {content: Buffer|null, notes: string[]}`(throw는 원복 건너뜀 사유)
  - 두 함수만 export합니다.
  - `GROK_INSTALLER.runtimeConfig = Object.freeze({globalRender: renderGrokCompat, globalRemove: removeGrokCompat})`
- Consumes: `parseToml`(`lib/models/config.mjs`), `isDeepStrictEqual`(`node:util`)
- 구현 방식:
  - EOL·줄 분할은 `eol = /\r?\n/.exec(text)?.[0] ?? '\n'`, `lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []`입니다.
  - 디코더는 Review Focus 3의 설정을 씁니다.
  - 판정 순서는 spec 3.3의 1–10과 3.4의 1–7을 그대로 따릅니다.
- `plan.mjs`:
  - 44행 조건은 `!runtimeConfig.renderConcurrency && typeof runtimeConfig.globalRender !== 'function'`이면 skip합니다.
  - `globalRender`가 있으면 `try {rendered = runtimeConfig.globalRender(original);} catch (cause) {fail(\`Cannot update ${filename}: ${cause.message}; fix it or use --skip-global\`);}`를 실행합니다. 없으면 기존 49–54행을 그대로 탑니다.
  - 42행 skipGlobal 분기에서는 `globalRender`가 있는 descriptor에 한해 `${target.runtimeConfigPath}: compatibility settings update skipped (--skip-global).`를 추가합니다.
- `uninstall.mjs`(21행 뒤):
  - `!skipGlobal && typeof runtimeConfig.globalRemove === 'function'`이면 `inspectPath(safeFs, target.runtimeConfigPath, {kind:'file', read:true, snapshot})`로 읽고, 파일이 있으면 hook을 호출합니다.
  - throw하면 경고를 넣습니다.
  - `content !== null`이면 `managedPaths`와 `globalChanges {path, content}`에 넣고, notes는 `<path>: <note>`로 넣습니다.
  - `skipGlobal`이면 `${target.runtimeConfigPath}: compatibility settings not restored (--skip-global).`를 넣습니다.
  - summary 첫 항목은 `uninstallSummary`입니다(배열을 만든 뒤 push).

- [x] **Step 1: 실패 테스트 작성(`tests/node/grok-compat.test.mjs`, 단위)**
  - `null creates managed table`
    - content가 Global Constraints의 4줄(`\n`)과 같습니다.
    - action은 `set Grok Claude compatibility`입니다.
    - notes가 `['set [compat.claude] agents, skills, rules = false (arc:managed)']`와 같습니다(deepEqual).
  - `empty or comment-only file gets managed table`
    - `''` 입력이면 결과가 4줄 문자열과 정확히 같습니다.
    - `'# c\n'` 입력이면 `'# c\n' + 4줄`입니다.
  - `appends with CRLF and missing final EOL preserved`
    - 입력: `'[cli]\r\ninstaller = "npm"'`
    - 기대: `'[cli]\r\ninstaller = "npm"\r\n[compat.claude] # arc:managed\r\nagents = false # arc:managed\r\nskills = false # arc:managed\r\nrules = false # arc:managed\r\n'`
  - `inserts at end of existing unmarked table before next header`
    - 입력: `'[compat.claude]\nmcps = true\n[other]\nx = 1\n'`
    - 기대: `'[compat.claude]\nmcps = true\nagents = false # arc:managed\nskills = false # arc:managed\nrules = false # arc:managed\n[other]\nx = 1\n'`
  - `subtable-only appends managed header at EOF`
    - 입력: `'[compat.claude.extra]\nx = 1\n'`
    - 기대: 원문 + 4줄. 재파싱에서 `compat.claude.extra.x`가 1(파서 정수 표현을 따름)이고 3키 false입니다.
  - `user false is kept with note`
    - 입력: `'[compat.claude]\nagents = false\n'`
    - 기대: 그 줄은 그대로이고 skills·rules만 추가됩니다.
    - notes가 `['[compat.claude] agents = false is user-owned and kept', 'set [compat.claude] skills, rules = false (arc:managed)']`와 같습니다.
  - `user true aborts`: `'[compat.claude]\nskills = true\n'` → throws `{message: '[compat.claude] skills = true is set by the user; set it to false or remove it'}`
  - `managed reinstall is unchanged`
    - `renderGrokCompat(renderGrokCompat(null).content)`의 action은 `unchanged`, content는 입력과 바이트 동일, notes는 `[]`입니다.
  - `managed true resets to false`
    - 입력 4줄 중 `agents = true # arc:managed`이면 그 줄만 `agents = false # arc:managed`로 바뀝니다.
    - notes에 `[compat.claude] agents reset to false (arc:managed)`가 들어 있습니다.
  - `unsupported inputs abort` 표(각 입력 → 정확한 message)
    - `Buffer.from([0xff])` → `config.toml is not UTF-8`
    - `'[compat.claude\n'` → `TOML parse failed`
    - `'compat = 1\n'`, `'compat = {claude = {agents = false}}\n'`, `'compat.claude.agents = false\n'`, `'[compat]\nclaude = {agents = false}\n'` → `[compat.claude] uses an unsupported representation`
    - `'[compat.claude]\nagents = "no"\n'` → `[compat.claude] agents must be a boolean`
    - `'[compat.claude]\n"agents" = false\n'` → `[compat.claude] agents uses an unsupported representation`
    - `'[compat.claude]\nagents = false\nagents = false # arc:managed\n'` → message가 `/^(TOML parse failed|\[compat\.claude\] agents uses an unsupported representation)$/`에 맞음(중복 키 처리는 파서에 따름)
  - `BOM is preserved or rejected`: `Buffer.concat([Buffer.from([0xef,0xbb,0xbf]), Buffer.from('[cli]\nx = 1\n')])` → 성공하면 결과 앞 3바이트가 BOM이고, throw하면 message가 `TOML parse failed`입니다.
  - `removeGrokCompat` 사례
    - `null` → `{content: null, notes: []}`
    - ARC 생성 4줄 → `content.length === 0`이고 notes가 `['restored [compat.claude] managed lines']`와 같습니다.
    - `'[cli]\ninstaller = "npm"\n[compat.claude] # arc:managed\nmcps = true\nagents = false # arc:managed\n'` → `'[cli]\ninstaller = "npm"\n[compat.claude] # arc:managed\nmcps = true\n'`(키가 남아 헤더 유지)
    - `'[compat.claude]\nagents = true # arc:managed\n'` → `'[compat.claude]\n'`(표식 없는 헤더 유지, managed true도 제거)
    - `'[compat.claude] # arc:managed\n# note\n\nagents = false # arc:managed\n'` → `'# note\n\n'`
    - CRLF 4줄 → 빈 결과. CRLF 사용자 줄이 섞이면 사용자 줄의 바이트가 유지됩니다.
    - managed 줄이 없으면 `content: null`입니다.
    - `[0xff]` → throws `config.toml is not UTF-8`, `'[[x\n'` → throws `TOML parse failed`
  - `only grok descriptor defines global hooks`: claude/codex/gemini 설치기 `runtimeConfig`에 `globalRender`/`globalRemove`가 없고, grok에는 두 함수가 있습니다(AC-F5).
- [x] **Step 2: 통합 테스트 수정(`tests/node/grok-install.test.mjs`, `verifiedRegistry` 유지)**
  - `install()` 헬퍼의 config.toml globalChanges 부재 단언(29행)을 제거합니다. 아래 명시 테스트로 대체하며 부록 A에 기록합니다.
  - `config.toml untouched`(62행)를 `config.toml managed edit on install and restore on uninstall`로 교체합니다.
    - `null` 사례: 설치 후 파일이 4줄과 같고, plan summary에 `${filename}: set [compat.claude] agents, skills, rules = false (arc:managed)`가 있습니다. 제거 후 파일이 존재하고 길이가 0입니다.
    - `'[cli]\r\ninstaller = "npm"\r\n'` 사례: 설치 후 원문이 접두로 유지되고 재파싱 3키가 false입니다. 제거 후 바이트가 원본과 같습니다.
  - `uninstall removes owned only`(94행)
    - fixture `config.toml`을 `'[cli]\ninstaller = "npm"\n'`로 바꿉니다(spec 11.3: 비 TOML은 중단 대상).
    - summary 단언(105행)을 `Grok config.toml is preserved except ARC-managed [compat.claude] lines.`로 바꿉니다.
    - 제거 후 `config.toml` 바이트가 원본과 같습니다.
  - `uninstall allowed with install capability off when traces exist`(113행): 남는 파일 단언을 `['AGENTS.md', 'config.toml']`로 바꾸고 `config.toml` 길이 0을 추가합니다(spec 3.5: 제거는 capability 무관 원복, Q5).
  - 신규 `install aborts on user true without changing files`
    - 입력 `'[compat.claude]\nagents = true\n'`
    - `prepareOperation(target:'grok')` rejects `{message: \`Cannot update ${filename}: [compat.claude] agents = true is set by the user; set it to false or remove it; fix it or use --skip-global\`}`
    - `files(~/.grok)`가 그대로입니다.
  - 신규 `install aborts on invalid TOML`: `'[[x\n'` → `Cannot update ${filename}: TOML parse failed; fix it or use --skip-global`
  - 신규 `target all aborts before any home changes`: 위 user true 상태에서 `target:'all'` rejects 같은 message이고, `homeBytes(userHome)`가 그대로입니다.
  - 신규 `uninstall warns and continues when config.toml cannot be parsed`
    - 설치 후 `config.toml`을 `'[[broken\n'`로 덮어씁니다.
    - uninstall code가 `0`입니다.
    - summary에 `${filename}: ARC-managed [compat.claude] lines were not restored (TOML parse failed); remove lines marked # arc:managed manually`가 있습니다.
    - `skills/arc`가 없어지고 config 바이트는 그대로입니다.
  - 신규 `--skip-global leaves config.toml bytes and reports`
    - 기존 `'[cli]\nx = 1\n'`에서 `skipGlobal: true`로 설치하면 바이트가 동일하고, summary에 `${filename}: compatibility settings update skipped (--skip-global).`와 `Native concurrency update skipped (--skip-global).`가 있습니다.
    - `skipGlobal: true`로 제거하면 `${filename}: compatibility settings not restored (--skip-global).`가 나오고 바이트가 동일합니다.
  - `reinstall idempotent`는 유지합니다(config 포함 바이트 동일).
- [x] **Step 3:** `grok-platform.test.mjs:42-43`을 바꿉니다.
  - `typeof installer.runtimeConfig.globalRender === 'function'`, `typeof installer.runtimeConfig.globalRemove === 'function'`, `Object.keys(installer.runtimeConfig)`가 `['globalRender','globalRemove']`와 같음(deepEqual)
  - summary는 새 문자열입니다.
- [x] **Step 4: RED 확인:** `node --test tests/node/grok-compat.test.mjs tests/node/grok-install.test.mjs tests/node/grok-platform.test.mjs`
  - 기대: `grok-compat`는 `ERR_MODULE_NOT_FOUND`로 실패합니다.
  - `grok-install` 신규 테스트는 config 미변경, summary 불일치, 중단 미발생으로 FAIL입니다.
- [x] **Step 5:** `grok-compat.mjs`를 구현하고, `plan.mjs`·`uninstall.mjs`·`grok.mjs`에 hook을 연결합니다.
  - 빈 content(`Buffer.alloc(0)`)가 transaction(`transaction.mjs:62,90` `bytes`)에서 빈 파일로 기록되는지 Step 2의 길이 0 단언으로 확인합니다.
- [x] **Step 6: GREEN 확인:** 같은 명령이 PASS여야 합니다. 추가로 `node --test tests/node/hardcoding-residual.test.mjs tests/node/global-config.test.mjs tests/node/runtime-config.test.mjs tests/node/consumer.test.mjs`가 PASS여야 합니다(기준 실패는 제외).
- [x] **Step 7:** STD-CLOSE를 실행합니다. golden `--diff`는 0, role-policy 생성물 변경은 0입니다.

**수용 기준:**
- 위 테스트가 PASS입니다.
- `rg -n "=== *['\"]grok['\"]" lib/installer` 결과가 0건입니다.
- `git diff --stat HEAD -- tests/node/global-config.test.mjs tests/node/runtime-config.test.mjs tests/node/consumer.test.mjs tests/node/fixtures/installed-layout-golden.json`가 비어 있습니다(AC-F5 "무수정 통과").
- 다음 자리의 문자열이 Global Constraints와 바이트 단위로 같습니다: 오류·경고 문자열, `notes` 배열 항목, summary 항목, `uninstallSummary`.

**필수 검사:** 작업 테스트, `npm test`(호스트), `check:manifest`, `check:role-policy`(변경 0), golden `--diff`, parity, `update-runtime-assets --check`
**필수 QA:** 예(fresh). 3.3/3.4 판정 순서, 바이트 보존, 중단 시 파일 무변경, 다중 대상 무변경, 경고 후 code 0을 확인합니다.
**보류 조건:**
- Codex·Claude·Gemini plan, summary, 결과 바이트가 바뀌면 보류합니다.
- golden에 차이가 생기면 보류합니다.
- `lib/installer`·`lib/platforms` 밖 운영 파일 변경이 필요하면 보류합니다.
- transaction이 빈 content를 쓰지 못하면 보류하고 보고합니다(spec 4.4).

**커밋:** `feat(grok): config.toml [compat.claude] managed 편집·원복과 설치기 hook 일반화`

---

### Task T2: bridge `childEnv`와 role-policy notice

**AC:** AC-F6, AC-F7

**Files:**
- Modify:
  - `lib/runtime/grok-stream.mjs:12`
  - `lib/policy/role-policy.json`(`platforms.grok.notice`만)
  - `tests/node/grok-bridge.test.mjs`(249행 및 신규)
  - `tests/node/fixtures/grok/fake-grok.mjs`(record 필드 추가)
  - `tests/node/grok-install.test.mjs:202`(notice 정확 문자열)
- 생성물:
  - `shared/skill/runtime/grok-stream.mjs`, `shared/skill/runtime/role-policy.json`
  - `grok/skill/SKILL.md`
  - `grok/skill/references/{coordination,verification,commit,handoff-prep,handoff,planning}.md`
  - `grok/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`
  - `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/runtime-versions.test.mjs`(baseline)
- R7 가능성: `tests/node/role-policy*.test.mjs`, `tests/node/runtime-assets.test.mjs`

**Interfaces:**
- Produces: `GROK_CONTRACT.childEnv`. 값은 Global Constraints의 6키 객체이고 `Object.freeze`로 고정합니다.
- 바뀌지 않음: `isolationArgs`, spawn 합성 `{...localCliEnvironment(cli), ...invocation.childEnv, ARC_BRIDGE_CHILD}`(`role-supervisor.mjs:246`), `argsDigest`
- notice 반영: `npm run update:role-policy`로 생성합니다.
- `instruction-contracts.json`은 직전 plan T4와 같은 방식으로, 해당 fixture 테스트가 요구하는 값으로 갱신합니다(직전 작업 선례; 전용 생성 스크립트 없음).

- [x] **Step 1: 실패 테스트**
  - `grok-bridge.test.mjs:249`: `assert.deepEqual(invocation.childEnv, {GROK_DISABLE_AUTOUPDATER: '1', GROK_CLAUDE_AGENTS_ENABLED: 'false', GROK_CLAUDE_SKILLS_ENABLED: 'false', GROK_CLAUDE_RULES_ENABLED: 'false', GROK_CLAUDE_MCPS_ENABLED: 'false', GROK_CLAUDE_HOOKS_ENABLED: 'false'})`
  - `Object.keys(GROK_CONTRACT.childEnv)` 순서를 위 순서로 deepEqual합니다.
  - `fake-grok.mjs` record에 `claudeEnv: Object.fromEntries(['AGENTS','SKILLS','RULES','MCPS','HOOKS'].map(k => [k, process.env['GROK_CLAUDE_' + k + '_ENABLED'] ?? null]))`를 추가합니다.
  - 신규 `grok bridge child env overrides parent compat values`
    - 부모 env에 `GROK_CLAUDE_AGENTS_ENABLED: 'true'`, `GROK_CLAUDE_HOOKS_ENABLED: 'true'`를 두고 기존 fake grok 실행 시나리오를 그대로 씁니다.
    - record `claudeEnv`의 5개 값이 모두 `'false'`이고 `autoUpdater`는 `'1'`입니다.
    - 기존 argv·`argsDigest` 단언은 수정 없이 PASS여야 합니다.
  - `grok-install.test.mjs:202`: notice를 spec 8장 정확 문자열로 바꿉니다.
- [x] **Step 2: RED:** `node --test tests/node/grok-bridge.test.mjs tests/node/grok-install.test.mjs`. 기대: childEnv deepEqual 불일치, `claudeEnv` 값 `null`, notice 불일치로 FAIL
- [x] **Step 3:** `grok-stream.mjs:12`와 notice를 수정하고 `npm run update:role-policy`를 실행합니다.
- [x] **Step 4: GREEN:** 같은 명령 PASS
- [x] **Step 5:** STD-CLOSE 전부를 실행합니다(runtime 동기화, golden `--write`, baseline, manifest, role-policy는 grok 생성물만).

**수용 기준:**
- 위 테스트 PASS
- `git diff --stat -- claude codex gemini` 빈 결과
- `git diff -- lib/policy/role-policy.json`이 notice 1줄뿐
- `rg -n "does not write Grok config\.toml" lib grok shared tests` 0건

**필수 검사(focused checks):** 작업 테스트, `update-runtime-assets --check`, golden `--diff` 0(갱신 후), `check:manifest`, `check:role-policy`, parity, `npm test`(호스트)
**보류 조건:**
- 인자나 `argsDigest`가 바뀌면 보류합니다.
- claude/codex/gemini 생성물이 바뀌면 보류합니다.
- notice 외 policy가 바뀌면 보류합니다.

**커밋:** `feat(grok): bridge 자식 compat 차단 env와 notice 갱신`

---

### Task T3a: composite upgrade snapshot 교차 drift 수정 (v2 추가)

**AC:** AC-U1, AC-U2, AC-U3, AC-U4, AC-U5 (spec 16장)

**배경:** T3 호스트 검사에서 `install-mode-models-upgrade.test.mjs` `composite upgrade does not recreate standalone profiles`의 `installTargets` 결과 단언이 Grok `failed`(`Install target changed: <home>/.gemini/agents`)로 실패했습니다. spec 16.1의 기존 잠복 결함입니다(사용자 결정 2026-11-18: plan에 수정 작업 추가).

**Files:**
- Modify: `lib/installer/upgrade-state.mjs`, `lib/installer/upgrade.mjs`
- Create: `tests/node/upgrade-snapshot-scope.test.mjs`
- 생성물: `MANIFEST.sha256`(`lib/installer/upgrade*.mjs` 2행만)
- 수정 금지: `lib/installer/install.mjs`, `lib/installer/transaction.mjs`, `lib/installer/install-mode.mjs`, T3 미커밋 변경 파일 전부(`tests/node/install-mode-models-upgrade.test.mjs` 포함)

**Interfaces:**
- `collectInstalledState(...).targets[i].modeKeys: Set<string>`(composite에서 복사한 mode key, standalone이면 빈 Set). 기존 필드와 `stateToken`은 불변입니다.
- `buildUpgradePlans`: spec 16.3의 2단계 제외 규칙. 반환 형태는 불변입니다.

- [x] **Step 1: 실패 테스트(`tests/node/upgrade-snapshot-scope.test.mjs`)**
  - 주입 registry(예: grok 또는 zeta를 verified로 둔 사본, 또는 기존 fixture)로 "composite 모드 + 앞 순서 standalone 대상이 프로필을 다시 씀 + 뒤 순서 대상" 상태를 만듭니다. 운영 Grok capability에 의존하지 않아 T3 없이도 RED가 재현되어야 합니다.
  - `composite upgrade with an earlier standalone target installs every target`(AC-U1): `installTargets(buildUpgradePlans(...))` 결과 전부 `installed`
  - `mode keys overlapping other plan writes are excluded only there`(AC-U2)
  - `drift after planning still fails before writes`(AC-U3): 참여자 `arc-routing-*` 변경, routing 정의 파일 변경, 비참여 home `agents`에 `arc-routing-x.md` 추가 각각에서 쓰기 전 실패(ARC_INSTALL_DRIFT)와 파일 바이트 무변경
  - `stateToken is unchanged by the fix`(AC-U4): 같은 home에서 수정 전 계산식과 같은 값(고정 기대값 또는 독립 재계산 helper)
- [x] **Step 2: RED:** `node --test tests/node/upgrade-snapshot-scope.test.mjs` → AC-U1·AC-U2 FAIL
- [x] **Step 3:** `upgrade-state.mjs`·`upgrade.mjs` 구현(spec 16.3)
- [x] **Step 4: GREEN:** 같은 명령 PASS. 추가로 `node --test tests/node/upgrade-state.test.mjs tests/node/upgrade-harness.test.mjs tests/node/upgrade-process.test.mjs tests/node/upgrade-cli.test.mjs tests/node/install-mode-models-upgrade.test.mjs tests/node/install-mode-review-followup.test.mjs tests/node/hardcoding-residual.test.mjs` PASS(기준 실패 제외). `install-mode-models-upgrade`는 작업 트리의 T3 변경과 함께 전부 PASS여야 합니다.
- [x] **Step 5:** `node scripts/update-manifest.mjs` → `npm run check:manifest`, `node scripts/check-installer-parity.mjs`, `npm run check:role-policy`(변경 0), `node tests/node/fixtures/installed-layout.mjs --diff`(0)

**커밋 분리(Orchestrator):**
- T3a 커밋은 T3보다 먼저 만듭니다. 내용은 `lib/installer/upgrade-state.mjs`, `lib/installer/upgrade.mjs`, `tests/node/upgrade-snapshot-scope.test.mjs`, `MANIFEST.sha256`의 해당 2행, 이 plan·spec의 v2 개정과 T3a 진행 기록입니다.
- `MANIFEST.sha256`은 해당 2행 hunk만 staging합니다(T3의 manifest 행 제외). 분리가 안전하지 않으면 커밋을 보류합니다.
- 커밋 전 검증: staged 트리를 임시 디렉터리로 추출(`git checkout-index` 또는 커밋 후 `git archive`)해 T3 변경 없이 `upgrade-snapshot-scope`, `upgrade-state`, `hardcoding-residual`, `check:manifest`가 통과함을 확인합니다(Git 상태를 바꾸지 않는 방식).

**수용 기준:** 위 테스트 PASS, `git diff --stat -- lib/installer/install.mjs lib/installer/transaction.mjs lib/installer/install-mode.mjs` 빈 결과, 기존 upgrade·installer 테스트 무수정 통과, `rg -n "=== *['\"](grok|gemini|codex|claude)['\"]" lib/installer/upgrade.mjs lib/installer/upgrade-state.mjs` 신규 0건.
**필수 검사:** 작업 테스트, `npm test`(호스트, 기준선 비교), `check:manifest`, parity, golden `--diff`
**필수 QA:** 예(fresh). AC-U1–U5, 제외 규칙의 범위(과잉 제외 없음), drift 감지 유지, `stateToken` 불변, 분리 커밋 트리 단독 통과를 확인합니다.
**보류 조건:** `stateToken` 변경, `install.mjs`·`transaction.mjs` 변경 필요, 기존 단언 수정 필요, MANIFEST 분리 불안전.
**Implementer:** fresh(새 작업). T3a 수용 후 T3 남은 작업(재검증)은 v2 계약 개정에 따라 필요하면 fresh Implementer가 맡습니다.

**커밋:** `fix(installer): composite upgrade의 교차 쓰기 경로를 mode snapshot 검사에서 제외`

---

### Task T3: capability 전환, 카탈로그, 고정 테스트, 테스트 전환

**AC:** AC-F1, AC-F8, AC-F9, AC-F10, AC-F11, AC-F12(+ AC-F2 composite 경로 1건)

**Files:**
- Modify(운영):
  - `lib/runtime/platform-registry.mjs:140-146`
  - `lib/models/grok-models.json`
- Create: `tests/node/fixtures/platforms/grok-off.mjs`
- Modify(테스트):
  - `tests/node/grok-capability-evidence.test.mjs`
  - `tests/node/grok-platform.test.mjs`
  - `tests/node/grok-install.test.mjs`
  - `tests/node/grok-bridge.test.mjs`
  - `tests/node/grok-composite.test.mjs`(assert 1건 추가만)
  - `tests/node/tui-app-pty.test.mjs`
  - `tests/node/tui-app.test.mjs`
  - `tests/node/tui-setup.test.mjs`
  - `tests/node/gemini-platform.test.mjs`
  - `tests/node/gemini-install.test.mjs`
  - `tests/node/install-mode-n-platform.test.mjs`
  - `tests/node/capability-surfaces.test.mjs`
  - `tests/node/install-mode.test.mjs`
  - `tests/node/install-mode-switch.test.mjs`
- 생성물: `shared/skill/runtime/platform-registry.mjs`, `MANIFEST.sha256`, `tests/node/fixtures/installed-layout-golden.json`, `tests/node/runtime-versions.test.mjs`(baseline)
- R7 가능성:
  - `tests/node/preset-cli.test.mjs`, `tests/node/uninstall-cli.test.mjs`(process.env 상속 후보, P)
  - `tests/node/role-routing-dispatch.test.mjs`, `tests/node/role-dispatch-policy.test.mjs`
  - `tests/node/management-status.test.mjs`, `tests/node/platform-registry.test.mjs`, `tests/node/targets.test.mjs`, `tests/node/anchor-flip.test.mjs`, `tests/node/tui-custom-preset.test.mjs`
  - `tests/node/fixtures/installed-layout.mjs`(golden 차이가 이 파일 때문일 때만)

**Interfaces:**
- Consumes: T1 hook, T2 `childEnv`·notice
- Produces: `grokOffRegistries()`, `GROK_OFF_REASONS`, `writeFakeGrokCli({bin, marker, version})`
- 계획 결정
  - `grok-install` `contextFor(t)`는 운영 registry(`compositeContext` 그대로)를 씁니다. `reverseDisplay`만 displayOrder를 뒤집은 주입 registry를 유지합니다(capability는 운영값). 근거: 출하 상태를 직접 검증합니다.
  - `grok-composite`는 주입 registry를 유지해 기대값을 바꾸지 않습니다. spec 3.5 composite 경로 확인용 assert 1건만 추가합니다.
  - `grok-platform.test.mjs:79`는 `discoverModelCatalog({platform: 'grok'})`로 바꿔 `status === 'unavailable'`을 단언합니다. 기존 문자열 인자 호출은 의미가 없었고, 이 변경으로 강도가 오릅니다.

- [ ] **Step 1: 고정 테스트 재작성(`grok-capability-evidence.test.mjs`, spec 9장)**
  - `UNVERIFIED_CONTRACTS = [{id:'compat-session-effect', risk:'R1'}, {id:'native-model-application', risk:'R6'}, {id:'headless-stream-contract', risk:'R6'}, {id:'permission-sandbox-effect', risk:'R4'}, {id:'account-model-availability', risk:'R6'}, {id:'read-role-permission-effect', risk:'R4'}]`. 길이 6과 id 배열을 deepEqual합니다.
  - `operational Grok verified and off sets match spec 2.1`
    - verified 키 배열이 `['install','nativeProfile','catalog','standalone','bridge','compositeRole']`와 같습니다(deepEqual).
    - off 3개는 `{state:'off', reason}`이 정확합니다.
    - prerequisite 위반이 0이고 `supportedVersions`는 `'>=1.0.0 <1.1.0'`입니다.
  - `injected verified compositeHost, authProbe or watch fails evidence`: 세 키 각각을 prerequisite와 함께 verified로 바꾼 주입 descriptor에서 `verifyEvidence`가 throw합니다.
  - 기존 `GK1/GK2 and resume remain off`는 유지합니다.
  - `GROK_CONTRACT childEnv and isolation args`: childEnv가 6키와 같고(deepEqual), `isolationArgs`가 `--no-auto-update`와 `--no-subagents`를 포함합니다.
  - `grok notice ends with is unverified.`: `role-policy.json` `platforms.grok.notice.endsWith('is unverified.')`
- [ ] **Step 2: fixture 작성:** `tests/node/fixtures/platforms/grok-off.mjs`
- [ ] **Step 3: `grok-platform.test.mjs` 전환(분류는 부록 A)**
  - `:53` `GROK_HOME set does not block other platforms`(O): `Grok +Not verified` → 현행 `mode.mjs`가 계산하는 값 `Grok +Unsupported version`(cliVersion `invalid_context`). Gemini의 `GEMINI_CLI_HOME`과 같은 경로입니다(Orchestrator 결정 OD-Q1). Notes 단언과 다른 플랫폼 단언은 유지합니다.
  - `:65` AC-K2(O): spec 2.1 객체와 deepEqual
  - `:73` AC-K10(O): `pairs`가 `['grok-4.6','grok-4.5']` 순서이고, 모든 쌍이 `validatePair`를 통과합니다. JSON 파일 바이트가 spec 6장 블록과 같습니다(AC-F8).
  - `:127`(F): `{...ctx, ...grokOffRegistries()}`로 옮기고 단언은 그대로 둡니다.
  - `:134`(O+F)
    - 운영: install `all` plans가 `['claude','codex','gemini','grok']`이고 execute code가 0입니다. preset·uninstall `all`도 같은 배열입니다.
    - off 사본: 기존 3개 배열 단언을 그대로 둡니다.
  - `:145`, `:151`(F): off registry로 옮기고 단언은 그대로 둡니다.
  - 신규 `operational Grok status without CLI`(O+P): `compositeContext`(grok 없음)에서 `cliVersion`이 `{version:null, reason:'cli_not_found'}`, `authentication`이 `{authStatus:'unknown', reason:'auth_unverified'}`, Status 행이 `/Grok +Not Available/`입니다.
  - 신규 `operational Grok status runs only --version`(O+P, Q1)
    - `writeFakeGrokCli({bin: ctx.userHome + '/bin', marker})`
    - `cliVersion`이 `{version:'1.0.89'}`, `authentication`이 `{authStatus:'unknown', reason:'auth_unverified'}`입니다.
    - `fs.readFileSync(marker,'utf8') === '--version\n'`
    - `statusInfo` 텍스트가 `/Grok +Available · auth unverified/`에 맞고, `homeStatusLine`이 `Grok: Available (auth unverified)`를 포함합니다.
    - `version:'1.1.0'`이면 `/Grok +Unsupported version/`입니다.
  - `:165`, `:177`(zeta P-K7)은 유지합니다.
- [ ] **Step 4: `grok-install.test.mjs` 전환**
  - `contextFor` 계획 결정을 반영합니다.
  - `:113`, `:131`(F): `off`를 `{...context, ...grokOffRegistries()}`로 바꾸고 단언은 그대로 둡니다(T1의 `config.toml` 길이 0 단언 포함).
  - `:140`(F): `{...await compositeContext(t), ...grokOffRegistries()}`
  - 신규 `installed grok is an upgrade target and upgrade leaves config.toml`
    - 운영 registry에서 grok을 설치한 뒤 `collectInstalledState(ctx).targets`에 `grok`이 들어 있습니다.
    - `buildUpgradePlans` 결과 plan의 globalChanges에 config.toml이 없습니다(spec 3.5·OQ3).
- [ ] **Step 5: `grok-bridge.test.mjs` 운영 hold 단언(AC-F12, 운영 `DEFAULT_PLATFORM_REGISTRY`, PATH fixture)**
  - grok `arc_implementer`/`arc_qa`는 `permission_scope_unverified`이고 lease가 생기지 않습니다.
  - `segment > 0`이면 `resume_unverified`입니다.
  - hostPlatform grok은 현행 정렬이 내는 값을 정확히 단언합니다(`host_sandbox_blocked` 또는 `capability_not_verified`). Implementer는 RED 단계에서 관측한 값과 근거 코드 위치를 보고하고, Orchestrator가 진행 기록에 남깁니다(spec 2.3).
- [ ] **Step 6: `grok-composite.test.mjs`**: 기존 grok 참여 publish 시나리오 끝에 `~/.grok/config.toml` 재파싱 결과 `compat.claude`가 3키 false임을 단언 1건 추가합니다(spec 3.5·OQ4). composite 적용이 grok 대상에 `buildInstallPlan`을 부르지 않는 구조라면 편집하지 않고 보고합니다.
- [ ] **Step 7: grok 밖 테스트 전환(spec 11.4 확정 목록)**

  | 파일:행 | 전환 | new |
  |---|---|---|
  | `tui-app-pty.test.mjs:22` | O+P | fake를 `writeFakeGrokCli`로 만들고 env는 기존 형태(`{...process.env, PATH: context.env.PATH}`)를 유지합니다. `/Grok +Available · auth unverified/`, `Grok  \(not installed\)` 유지, `CODE=0 CALLS=0 PREPARES=1` 유지. marker의 모든 줄이 정확히 `--version`이고 1줄 이상입니다. 테스트 이름은 `Status runs only grok --version through Status Configure and Uninstall in PTY`입니다. off 미실행 회귀는 `grok-platform` `:151` F 이동으로 보존합니다 |
  | `tui-app.test.mjs:14,19` | F + O 추가 | 기존 `Not verified` 단언은 `grokOffRegistries()` context로 옮깁니다. 운영 사본은 합성 grok status에 `cliVersion:{version:'1.0.89'}`, `authentication:{authStatus:'unknown', reason:'auth_unverified'}`를 주고 `/Grok +Available · auth unverified/`를 단언합니다 |
  | `tui-setup.test.mjs:16-22` | F + O 추가 | 선택 불가·순환 단언은 off registry로 옮깁니다. 운영 사본은 grok status `1.0.89`로 Grok 선택 가능, 행 접미사 ` (auth unverified)`, 상세 `Grok: auth unverified — ARC cannot confirm Grok CLI login.`를 단언합니다 |
  | `tui-setup.test.mjs:141` | U | `Grok    - Unavailable  (capability not verified)` 불변(compositeHost off). 실패하면 hold |
  | `gemini-platform.test.mjs:298,308` | O+P | `all`이 `['claude','codex','grok']`, `Grok: Not verified`는 `Grok: Not Available`(fixture PATH에 grok 없음) |
  | `gemini-install.test.mjs:141` | O | 역순 uninstall plan·결과가 `['grok','gemini','codex','claude']`(grok-install:151과 같은 구조) |
  | `install-mode-n-platform.test.mjs:148` | O | `modelInputs` 키에 `grok` 추가 |
  | `install-mode-n-platform.test.mjs:200-204` | O+P | grok `cliVersion` `{version:null, reason:'cli_not_found'}`, `authentication` `{authStatus:'unknown', reason:'auth_unverified'}` |
  | `capability-surfaces.test.mjs:196,211` | O+P | `Grok: Not verified` → `Grok: Not Available`, 비교 status를 같은 규칙으로 갱신 |
  | `install-mode.test.mjs:30`, `install-mode-switch.test.mjs:23` | O | `standalone(ctx)`(`target:'all'`)가 grok을 설치하므로 상태·대상 배열에 `grok`을 추가합니다. 실패 단언만 고칩니다 |

  - 각 수정에 old→new를 보고합니다. 운영 registry를 쓰는 수정 테스트에서 context `env` 누락이 0건이어야 합니다.
- [ ] **Step 8: RED:** `node --test tests/node/grok-capability-evidence.test.mjs tests/node/grok-platform.test.mjs tests/node/grok-install.test.mjs tests/node/grok-bridge.test.mjs`
  - 기대: verified `[]` vs 6개, AC-K2 off vs verified, 카탈로그 1쌍 vs 2쌍, `capability_not_verified` vs `1.0.89`로 FAIL
- [ ] **Step 9:** `platform-registry.mjs:140-146`을 Gemini 형태로 바꾸고, `grok-models.json`을 spec 6장 바이트로 씁니다.
- [ ] **Step 10: GREEN:** Step 8 명령과 Step 7 파일 전부, `grok-composite`, `hardcoding-residual`, `role-dispatch-policy`가 PASS여야 합니다.
- [ ] **Step 11:** STD-CLOSE를 실행합니다(runtime 동기화, golden, baseline, manifest, role-policy 변경 0). PTY(호스트)를 실행합니다.
- [ ] **Step 12(Orchestrator):** sentinel PATH로 `npm test`를 실행하고 sentinel log가 없음을 확인합니다(AC-F11). R7 가능성 파일이 실패하면 분류 규칙으로 처리합니다.

**수용 기준:**
- 위 테스트 PASS
- 부록 A에 O/F/P/U 대응이 모두 기록되어 있습니다.
- F 이동 단언은 문자열·배열 값이 HEAD와 같습니다.
- sentinel log가 없습니다.
- `lib/tui/**`, `lib/platforms/availability.mjs`, `lib/management/status.mjs` diff가 0입니다.
- `git diff --stat -- claude codex gemini grok`가 빈 결과입니다.

**필수 검사:** 작업 테스트, `npm test`(호스트, 기준선 비교), sentinel 실행, PTY, `update-runtime-assets --check`, golden, `check:manifest`, `check:role-policy`, parity
**필수 QA:** 예(fresh). capability 정확값, F 이동 단언 동일성, PATH 격리(`env` 누락 검사), `--version` 단독 실행, Hosts 불가, hold 3종, assert 감소 0을 확인합니다.
**보류 조건:**
- P0-b가 1.0.x가 아니면 보류합니다.
- P0-c 경로가 `/usr/bin`·`/bin`이면 보류합니다.
- sentinel log가 생기면 보류합니다.
- TUI·availability·status 운영 코드 변경이 필요하면 보류합니다.
- U 분류 단언이 실패하면 보류합니다.
- golden 차이가 runtime 해시 외(skill·profile 바이트)에서 생기면 보류합니다.

**커밋:** `feat(grok): capability 6개 verified 전환과 카탈로그·테스트 전환`. 본문에 전환 기록을 씁니다: `증거: 사용자 결정 2026-11-18(live 검증 아님), offline probe .git/arc/handoff/grok-support/live-probe-2026-11-18.md`, 미확인 목록 6개 id.

---

### Task T4: 문서 2행

**AC:** AC-D1

**Files:**
- Modify: `README.md:81`, `docs/harness-operation.md:73`
- 생성물: `MANIFEST.sha256`

- [ ] **Step 1:** 두 행을 spec 10장 정확 문자열로 교체합니다.
- [ ] **Step 2:** `node --test tests/node/menu-label-residual.test.mjs`를 실행하고 STD-CLOSE 3·5·7을 수행합니다.

**수용 기준:** `git diff -- README.md docs/harness-operation.md`가 2개 hunk·2행뿐이고, 바이트가 spec 10장과 같습니다.
**필수 검사:** diff 검토, `check:manifest`, residual 테스트, `npm test`(호스트)
**보류 조건:** 다른 행이 바뀌면 보류합니다.

**커밋:** `docs: Grok capability 전환 상태를 README와 운영 문서에 반영`

---

### Task FR: 최종 독립 Reviewer 1회

- **선행:** T1–T4 수용, T1·T3 QA와 재확인 완료
- **대상:** `0ec8647..HEAD` 전체 변경(spec·plan docs 커밋 포함)과 이 plan의 진행 기록·부록 A
- **위험 기반 점검:**
  - 3.3/3.4 판정 순서와 바이트 보존(CRLF, EOF 무개행, BOM, 하위 표만 있는 경우), spec 3.3-9 검증 실패 경로(직접 테스트 없음)
  - 중단 시 모든 home 무변경, 경고 후 code 0
  - Codex·Claude·Gemini plan·결과 바이트 무변경(AC-F5), `'grok'` 리터럴 부재
  - childEnv 덮어쓰기와 인자·digest 무변경
  - notice 범위(AC-F7)
  - capability 정확값, `compositeHost`·`authProbe`·`watch` off, GK·resume hold(AC-F12)
  - PATH 격리와 sentinel 결과(AC-F11), Status `--version` 단독 실행
  - F 이동 단언 동일성과 assert 감소 0
  - upgrade 경로 config 미편집(OQ3)과 선행 FR 후속 점검(설치 흔적 있는 home의 stateToken 차이)
  - 문서 2행(AC-D1)
- **Reviewer 지적:** Implementer → Reviewer 재확인으로 처리합니다(QA 재배정 없음). 해결될 때까지 미커밋으로 두고, 수용 후 follow-up 커밋 1개를 만듭니다.

---

## AC 추적표

| AC | 작업 |
|---|---|
| AC-F1 | T3 |
| AC-F2 | T1(단위·통합), T3(composite 경로 1건) |
| AC-F3 | T1 |
| AC-F4 | T1 |
| AC-F5 | T1 |
| AC-F6 | T2 |
| AC-F7 | T2(생성물), T3(`is unverified.` 고정) |
| AC-F8 | T3 |
| AC-F9 | T3 |
| AC-F10 | T3 |
| AC-F11 | T3(sentinel), FR |
| AC-F12 | T3(운영), 기존 `grok-bridge` 주입 단언 유지 |
| AC-U1–AC-U5 | T3a |
| AC-D1 | T4 |
| 공통 검사(spec 12장) | 모든 작업 STD-CLOSE, FR |

## 검증 판정

- **기준선:** P0-a에서 HEAD `0ec8647`로 다시 측정한 `npm test` 실패 목록(부록 B)
- **판정**
  - 신규 실패는 0건이어야 합니다.
  - 기준 밖 실패는 파일 단위로 단독 재실행합니다. 단독으로 통과하면 부하 flake로 기록하고, 단독으로도 실패하면 신규 실패로 보고 수용을 보류합니다.
  - 기준 실패가 통과로 바뀐 경우는 기록만 합니다.
  - 기준 실패와 범위가 겹치는 작업은 단독 재실행 메시지를 기준선과 비교해 판정합니다.
- 실패 분류와 hold 범위는 [scope.non-escalation] 절차를 따르고, 영향받지 않는 독립 작업은 Orchestrator가 해제합니다.
- 자동 테스트는 live 증거가 아닙니다. 미확인 6항목(`UNVERIFIED_CONTRACTS`)은 그대로 미확인입니다.

## 진행 기록

| 일시 | 작업 | 상태 | 커밋 | 메모 |
|---|---|---|---|---|
| 2026-11-18 | P0-a | 기록 | `0ec8647` | `npm test` 2703/2651/36 = 부록 B 35건 + 부하 flake 2(`role-bridge-run` grandchild SIGTERM, `install-mode-n-platform` 파일 timeout; 두 파일 단독 105/105). 신규 0 |
| 2026-11-18 | P0-b | 기록 | — | `npm view @xai-official/grok version` → `1.0.89`(1.0.x, range 유지). T3 시작 직전 재확인 |
| 2026-11-18 | P0-c | 기록 | — | `command -v grok` → `~/.nvm/versions/node/v22.21.0/bin/grok`(`/usr/bin`·`/bin` 아님, 격리 성립) |
| 2026-11-18 | P0-a(재개 PC) | 기록 | `3bb15c5` | 다른 PC에서 재개, node v22.18.0. `npm test` 2703/2638/52+cancelled 1 = 부록 B 35건 + 부하 flake 1(`install-mode-n-platform` 파일 timeout, 단독 70/70) + 이 PC 환경 기준 17건(`manifest.test.mjs` 16, `local-updater.test.mjs` 1; 단독 재실행도 실패, 원인은 gitignore된 사용자 파일 `scripts/update-superpowers-local.sh` → `Local updater wrapper is forbidden in package payload`, 사용자 파일이라 보존). 코드 신규 실패 0. 이 PC의 판정 기준선은 35+17건 |
| 2026-11-18 | P0-b(재개 PC) | 기록 | — | `1.0.89`(1.0.x) |
| 2026-11-18 | P0-c(재개 PC) | 기록 | — | `command -v grok` 없음(rc=1). 격리 성립 |
| 2026-11-18 | T1 | 수용 | (이 커밋) | Implementer codex bridge `3233a81f`(fresh), QA codex bridge `046fabca`(fresh). 작업 테스트 73/0, Step 6 추가 4파일 55/10(10건 모두 부록 B packed 계열). runtime `--check`·golden `--diff` 0·`check:manifest`·`check:role-policy`(변경 0)·parity 통과. 호스트 `npm test` 2740/2675/52+cancelled 1 = 기준선(35+17) 동일 + `install-mode-n-platform` 부하 flake(단독 70/70), 신규 0. `=== 'grok'` 0건, AC-F5 대상 테스트·golden diff 없음. QA 해석 지점 처분: (1) reset 키도 `set … = false` note에 포함 — spec 3.3-7/9/10과 모순 없음(QA 동의). (2) EOF 무개행 입력의 설치→제거 왕복 시 3.3-8이 붙인 구분 EOL이 남음 — spec 3.3-8 명시 동작이며 AC-F3 기준은 재파싱 일치이므로 결함 아님, FR 점검 메모 |
| 2026-11-18 | T2 | 수용 | (이 커밋) | Implementer codex bridge `85ac0d61`(fresh), focused checks(OD-Q2, QA 없음). RED 42/3 → GREEN 45/0, 기존 argv·`argsDigest` 단언 무수정 통과. Orchestrator 재실행: runtime `--check` 35 files, golden `--diff` 0(갱신 후), `check:manifest` 283, `check:role-policy` 48(grok 생성물만), parity 통과, `git diff --stat -- claude codex gemini` 빈 결과, role-policy.json numstat 1/1, `does not write Grok config.toml` 0건. runtime baseline `5bed622b…`→`5faa50af…`, instruction-contracts 정책 해시 2·grok expanded profile 5 갱신. 호스트 `npm test` 2751/2686/52+cancelled 1 = 기준선 동일 + `install-mode-n-platform` 부하 flake(단독 70/70), 신규 0 |
| 2026-11-18 | T3a | 수용 | (이 커밋) | v2 개정 작업. 설계 Planner(native) `80849db8` 옵션 B, 사용자 v2 승인 2026-11-18T22:19:32+09:00. Implementer codex bridge `f8eafb9e`(fresh), QA codex bridge `ceddbda3`(fresh). RED(분리 트리, lib만 HEAD) 신규 3 FAIL → GREEN 신규 8/0. 호스트: T3a 묶음 8파일 120/120(작업 트리), 분리 트리(HEAD+T3a, T3 없음) 120건 fail 0·`check:manifest`·parity 통과. QA: AC-U1–U4 proven, 분리 트리 구성 바이트 비교 proven, 독립 탐침(`agents2` sibling 유지, 비대상 참여자 profile drift 감지) proven, 리터럴 0, 금지 3파일 diff 없음. bridge의 `upgrade-process` EMFILE은 환경 제한(호스트 통과). 호스트 sentinel `npm test` 2755/2688/52+cancelled 3 = 기준선 동일 + 파일 timeout 3(anchor-migration 20/20, gemini-composite 20/20, install-mode-n-platform 70/70 단독 통과), sentinel log 없음. `stateToken` 계산 불변 |
| | T3 | | | 전환 기록: 사용자 결정 2026-11-18(live 검증 아님), `.git/arc/handoff/grok-support/live-probe-2026-11-18.md`; hostPlatform grok 관측 reason |
| | T4 | | | |
| | FR | | | |

### 부록 A — 기존 단언 old → new 대응표

분류는 O/F/P/U이고, 작업마다 "수정 파일 assert 감소 0건 확인"을 한 줄로 남깁니다.

| 작업 | 파일:행 | old | new | 분류 | 근거 |
|---|---|---|---|---|---|
| T1 | `grok-install.test.mjs:29` | install 헬퍼 config.toml globalChanges 부재 | 제거, 명시 편집 테스트로 대체 | O | spec 3장(원 spec D12 대체) |
| T1 | `grok-install.test.mjs:62` | `config.toml untouched` | managed 편집·원복 테스트 | O | spec 11.3 |
| T1 | `grok-install.test.mjs:97,105,109` | 비 TOML fixture, `Grok config.toml is preserved.` | 유효 TOML, 새 summary, 바이트 원복 | O | spec 11.3, 4.2 |
| T1 | `grok-install.test.mjs:127` | 남는 파일 `['AGENTS.md']` | `['AGENTS.md','config.toml']` + 길이 0 | O | spec 3.4-7, 3.5 |
| T1 | `grok-platform.test.mjs:42-43` | `runtimeConfig {}`, 옛 summary | hook 2개, 새 summary | O | spec 4.2 |
| T1 | (assert 수) | — | `grok-install` 48→64, `grok-platform` 77→79, 감소 0 | — | Orchestrator·QA 확인 |
| T2 | `grok-bridge.test.mjs:249` | childEnv 1키 | 6키 | O | spec 5장 |
| T2 | `grok-install.test.mjs:202` | 옛 notice | spec 8장 notice | O | spec 8장 |
| T2 | (assert 수) | — | `grok-bridge` 83→90, `grok-install` 64→64, `runtime-versions` 14→14, 감소 0 | — | Orchestrator 확인 |
| T3 | (Step 3·4·5·7 표의 행, Implementer 보고로 채움) | | | | |

### 부록 B — 기준 실패 목록

- HEAD `0ec8647`, macOS(darwin), `node --test --test-timeout=300000 tests/node/*.test.mjs`, 2026-11-18: tests 2703, pass 2651, fail 36. 결과 파일 `.git/arc/handoff/grok-support/P2/{full,fail}.txt`.
- 아래 35건은 직전 plan 부록 B와 동일하게 실패합니다(FIXED 0). 기준 밖 2건은 단독 재실행 통과(부하 flake).
- 알려진 부하 flake: `install-mode-n-platform` 파일 timeout(단독 통과), `role-routing-dispatch`, `role-bridge-run` PID reuse·grandchild SIGTERM, `codex-auth-probe` app-server timeout, `cancel uses SIGTERM then SIGKILL before identity`
- PTY: `cli-pty`의 `bare arc opens English TUI…` 3건은 기준 실패입니다.

실패 이름(35, 목록 파일 `.git/arc/handoff/grok-support/baseline-564ea20-failures.txt`):
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

## 계획 결정 기록 (spec 범위 안, Orchestrator 확정 2026-11-18)

- **PD-1:** PATH 격리 수단(위 절), 주입 off helper 위치와 이름(`tests/node/fixtures/platforms/grok-off.mjs` `grokOffRegistries()`)
- **PD-2:** `grok-install` `contextFor`를 운영 registry로 전환합니다. `verifiedRegistry`는 T1까지만 쓰고, T3에서 `reverseDisplay` 용도로만 남깁니다.
- **PD-3:** `grok-composite`는 주입 registry를 유지하고, spec 3.5 확인용 assert 1건만 추가합니다.
- **PD-4:** `grok-platform:79`를 객체 인자로 바꿉니다(강도 상승).
- **PD-5:** PTY 테스트는 운영 기대값으로 바꾸고, off 미실행 회귀는 프로세스 안 F 이동으로 보존합니다. PTY 자식에 주입 registry를 넣을 수단이 없어 택한 방식입니다.
- **PD-6:** 디코더 `ignoreBOM: true`(Review Focus 3)
- **PD-7:** 중복 키 사례는 파서 동작에 따라 두 사유 중 하나를 허용하는 정규식으로 단언합니다. 두 경우 모두 중단이고 파일은 바뀌지 않습니다.
- **OD-Q1:** `GROK_HOME`이 설정되면 Status는 `Grok   Unsupported version`입니다. Gemini(`GEMINI_CLI_HOME`, `platform-registry.mjs:65`, `mode.mjs:11`)와 같은 코드 경로이며, 사용자 요청 "Gemini와 똑같이"에 맞춰 TUI 코드를 바꾸지 않습니다.
- **OD-Q2:** T2는 spec 13장대로 focused checks만 둡니다. 생성물 검사(runtime-assets `--check`, golden, manifest, role-policy, parity)와 호스트 `npm test`로 판정하고, FR에서 함께 검토합니다.
- **OD-Q3:** `instruction-contracts.json`은 전용 생성 스크립트가 없으므로 fixture 테스트가 요구하는 값으로 갱신합니다(직전 plan T4 선례).
- **알려진 빈틈:** spec 3.3-9(`cannot verify the safe edit`)는 정상 입력으로 유도할 수 없어 직접 테스트가 없습니다. FR 점검 항목에 포함했습니다.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-18 (사용자 승인, `3bb15c5` 커밋 2026-11-18T15:45:08+09:00 이전; 정확한 승인 시각은 재개 PC에 기록 없음) | — | — | 최초 승인 |
| v2 | 2026-11-18T22:19:32+09:00 | contract | T3a 신설, T3 선행·수용 조건, QA 범위 | T3 호스트 검사에서 드러난 composite upgrade snapshot 교차 drift 잠복 결함 수정 작업 추가(사용자 결정 2026-11-18 "plan에 수정 작업 추가", spec 16장) |
