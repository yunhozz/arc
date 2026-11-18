# Grok capability 전환(Gemini 수준) — 개정 설계 명세

- 작성일: 2026-11-18
- 상태: 승인 대기. 근거는 승인된 설계(사용자 2026-11-18 "승인", `.git/arc/handoff/grok-support/flip-design.md`)와 사용자 결정 Q1·Q2·Q4·Q6, Orchestrator 기본값 Q3·Q5입니다.
- 소스: `/Users/ma-24-007/Desktop/workspace/arc`, 브랜치 `feat/grok-support`, HEAD `0ec8647`
- 경로: Architectural. spec 승인 후 구현 계획을 작성합니다.
- 선행 명세: `docs/superpowers/specs/2026-11-18-grok-platform-support-design.md`(이하 "원 spec", 구현 완료). 이 명세는 원 spec의 D6, D10, D11, D12와 일부 절을 대체합니다(1장). 대체하지 않은 결정과 절은 그대로 유효합니다.
- 증거: offline probe `.git/arc/handoff/grok-support/live-probe-2026-11-18.md`(grok 1.0.89). 1.0.89 바이너리 내장 문서에서 `--no-auto-update`("Disable update checks for this session")가 확인되어 U-P1이 해소되었습니다. 구독이 없어서 headless 실행, stream, session, permission/sandbox 효과, profile `model:` 적용은 확인하지 못했습니다.

## 0. 결정 추적표

| # | 결정(출처) | 다루는 절 |
|---|---|---|
| D17 | `install`, `nativeProfile`, `catalog`, `standalone`, `bridge`, `compositeRole`을 verified로 바꿉니다. `compositeHost`, `authProbe`, `watch`는 off를 유지합니다. Gemini와 같은 구성입니다(사용자) | 2 |
| D18 | 여기서 `verified`는 사용자 결정으로 켠다는 뜻이며 live 검증을 거쳤다는 뜻이 아닙니다. 미확인 목록은 `grok-capability-evidence` 테스트, notice, 진행 기록에 고정합니다(사용자) | 2.3, 9, 14 |
| D19 | 설치 시 `~/.grok/config.toml`의 `[compat.claude]`에 `agents`/`skills`/`rules` `= false # arc:managed`를 기록하고, 제거 시 managed 줄만 원복합니다(사용자 Q2: 키 3개만) | 3 |
| D19-a | 사용자가 표식 없이 명시한 `= true`가 있으면 설치를 중단합니다(사용자 Q4). 사용자가 쓴 `= false`는 사용자 소유로 보고 유지합니다. 표식이 있는 `true`는 ARC 소유 줄이므로 `false`로 되돌립니다(OQ1, Orchestrator) | 3.3 |
| D19-b | TOML 파싱 실패, inline/dotted 구조, boolean이 아닌 값이 있으면 설치를 중단하고 파일을 바꾸지 않습니다. 편집 후 다시 파싱해 `isDeepStrictEqual`로 검증하고, CRLF와 기존 바이트를 보존합니다(설계) | 3.3 |
| D19-c | uninstall에서 파싱에 실패하면 config 원복만 건너뛰고 경고한 뒤 나머지 제거를 계속합니다(사용자 Q6). 내용이 비게 된 파일은 빈 파일로 남깁니다(Orchestrator 기본값 Q5) | 3.4 |
| D19-d | `--skip-global`이면 편집과 원복을 모두 생략하고 summary에 표시합니다(설계) | 3.6 |
| D19-e | `'grok'` 리터럴 분기를 쓰지 않습니다. descriptor의 `runtimeConfig.globalRender`/`globalRemove` hook으로 `plan.mjs`와 `uninstall.mjs`를 일반화합니다. Codex 경로의 출력 바이트와 동작은 바뀌지 않습니다(설계) | 4 |
| D20 | bridge `childEnv`에 `GROK_CLAUDE_{AGENTS,SKILLS,RULES,MCPS,HOOKS}_ENABLED=false`를 추가합니다. `isolationEnv`는 `() => ({})`로 유지합니다(설계) | 5 |
| D21 | `auth.kind:'none'`이고 auth probe는 없습니다. 표시는 `Available (auth unverified)`입니다. Status에서 실행하는 명령은 `grok --version`뿐입니다(사용자 Q1). 원 spec D6을 대체합니다 | 7 |
| D22 | 카탈로그는 `grok-4.6`, `grok-4.5`입니다(근거: 1.0.89 `grok models` 비인증 출력, Q3 기본값). 역할 기본값은 `grok-4.6`입니다 | 6 |
| D23 | GK1·GK2는 `fail`, resume은 off를 유지합니다. 그래서 쓰기 역할은 `permission_scope_unverified`, grok host는 `host_sandbox_blocked`로 hold됩니다(설계) | 2.3 |
| D24 | compat 차단 효과가 미확인이라는 점을 notice와 README에 명시합니다(설계) | 8, 10 |
| U-P1 해소 | 1.0.89 바이너리 문서에 `--no-auto-update`가 있으므로 bridge 인자를 유지합니다 | 5 |

## 1. 원 spec 대체 범위

| 원 spec | 처리 |
|---|---|
| D6(활성화 후 auth 정책은 이후 결정) | D21로 대체 |
| D10(install off 동안 `grok` 미실행) | 대체. install이 verified가 되었으므로 Status·routing에서 `grok --version`을 실행합니다. off 동작은 주입 off registry 테스트로만 보존합니다(11.2) |
| D11(model 적용 증거 없으면 nativeProfile·standalone·compositeHost off) | D17/D18로 대체. `compositeHost`는 계속 off |
| D12(차단 수단 또는 무충돌 live 증거 없으면 bridge·install off) | D19/D20/D24로 대체. 차단 수단은 적용하되 효과는 unverified로 둡니다 |
| 2장 반목표 "ARC는 `~/.grok/config.toml`을 쓰지 않습니다" | 삭제. 3장의 managed 편집으로 대체 |
| 4.1 capabilities(9개 off) | 2.1 표로 대체 |
| 4.2 `runtimeConfig: {}`, `uninstallSummary` | 4.2로 대체 |
| 5.1 "`config.toml`은 읽지도 쓰지도 않습니다" | 3장으로 대체 |
| 5.3 카탈로그 | 6장으로 대체 |
| 5.4·5.5·5.6 off 표면 | 7장으로 대체. P-K7 일반 규칙(install off면 probe 생략)은 코드에 그대로 두고 주입 off registry로 검증합니다 |
| 8.1 `childEnv` | 5장으로 대체 |
| 11.4 고정 테스트 | 9장으로 대체 |
| 12장 notice | 8장으로 대체 |
| 14장 README 81행, harness-operation 73행 | 10장으로 대체 |
| AC-K2, AC-K3, AC-K4(`config.toml` 바이트 그대로) | 12장의 AC-F*로 대체 |

## 2. capability 전환

### 2.1 runtime descriptor (`lib/runtime/platform-registry.mjs:140-146`, shared 사본 동일)

Gemini의 표현(`platform-registry.mjs:122-125`)과 같은 형태로 바꿉니다.

| capability | state | reason |
|---|---|---|
| `install` | `verified` | — |
| `nativeProfile` | `verified` | — |
| `catalog` | `verified` | — |
| `standalone` | `verified` | — |
| `bridge` | `verified` | — |
| `compositeRole` | `verified` | — |
| `compositeHost` | `off` | `composite host not verified` |
| `authProbe` | `off` | `no official auth status command` |
| `watch` | `off` | `watch support out of scope` |

- 바뀌지 않는 값: `cli.supportedVersions: '>=1.0.0 <1.1.0'`(1.0.89 포함), `auth.kind:'none'`, `home.resolve`(`GROK_HOME`이 설정되어 있으면 throw, `platform-registry.mjs:61-63`), `routing.validatePair`, `profile`, `executionEnvironments`
- `CAPABILITY_PREREQUISITES` 위반이 없어야 합니다.

### 2.2 바뀌지 않는 runtime 상수

- `BRIDGE_GATE_RESULTS.GK1/GK2 === 'fail'`
- `SUPERVISOR_IMPLEMENTATIONS.get('grok').resume === 'off'`
- `GROK_CONTRACT.isolationArgs = ['--no-auto-update', '--no-subagents']`(`lib/runtime/grok-stream.mjs:11`)

### 2.3 결과 동작 (D23)

| 조건 | 결과 |
|---|---|
| grok Scouter/Planner/Reviewer bridge | 실행 허용(prepare → lease v2 → spawn) |
| grok Implementer/QA | `permission_scope_unverified` hold, lease 미생성 |
| hostPlatform grok(native/bridge) | `host_sandbox_blocked`(compositeHost off라면 `capability_not_verified`가 먼저일 수 있으며, 현행 정렬을 따릅니다) |
| `segment > 0` | `resume_unverified` |
| 구독/로그인 없음 | 실행 후 `execution_failed`(R5) |

## 3. `~/.grok/config.toml` managed 편집 (D19)

### 3.1 모듈

- 새 installer 모듈 `lib/installer/grok-compat.mjs`를 추가합니다. runtime 자산이 아니므로 `RUNTIME_MODULE_PATHS`와 manifest runtime 목록에는 넣지 않습니다.
  - `renderGrokCompat(original: Buffer|null) → {content: Buffer|null, action: string, notes: string[]}`: throw하면 중단 사유가 됩니다.
  - `removeGrokCompat(original: Buffer|null) → {content: Buffer|null, notes: string[]}`: throw하면 원복 건너뜀 사유가 됩니다.
- `parseToml`(`lib/models/config.mjs:52`)과 `isDeepStrictEqual`을 사용합니다. 줄 분할과 EOL 감지는 `renderCodexConcurrency`(`lib/installer/runtime-config.mjs:29`)와 같은 방식입니다: `eol = /\r?\n/.exec(text)?.[0] ?? '\n'`, `lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []`.
- 디코딩은 UTF-8 fatal입니다. 실패하면 사유는 `config.toml is not UTF-8`입니다.

### 3.2 용어와 정규식

- **관리 키:** `MANAGED_KEYS = ['agents', 'skills', 'rules']`. 이 순서로 기록합니다(Q2).
- **표식:** `# arc:managed`
- **managed 키 줄:** `/^[ \t]*(agents|skills|rules)[ \t]*=[ \t]*(true|false)[ \t]*#[ \t]*arc:managed[ \t]*(\r?\n)?$/`
- **managed 헤더 줄:** `/^[ \t]*\[[ \t]*compat[ \t]*\.[ \t]*claude[ \t]*\][ \t]*#[ \t]*arc:managed[ \t]*(\r?\n)?$/`
- **`[compat.claude]` 헤더 줄(표식 유무 무관):** `/^[ \t]*\[[ \t]*compat[ \t]*\.[ \t]*claude[ \t]*\][ \t]*(?:#[^\r\n]*)?(\r?\n)?$/`
- **표 구간:** 헤더 다음 줄부터, 다음 `^[ \t]*\[` 줄 직전까지입니다.
- **사용자 키 줄:** 표 구간 안에서 `^[ \t]*<key>[ \t]*=`에 맞고 managed 키 줄이 아닌 줄입니다.

### 3.3 설치 규칙 (`renderGrokCompat`)

판정 순서는 다음과 같습니다. 어느 단계에서든 throw하면 설치 전체가 중단되고 파일은 바뀌지 않습니다.

1. `original === null`(파일 없음)이면 다음 내용으로 새 파일을 만듭니다. `eol`은 `'\n'`입니다.
   ```
   [compat.claude] # arc:managed
   agents = false # arc:managed
   skills = false # arc:managed
   rules = false # arc:managed
   ```
2. 디코딩에 실패하면 사유는 `config.toml is not UTF-8`입니다.
3. `parseToml`이 실패하면 사유는 `TOML parse failed`입니다.
4. `data.compat`가 있는데 table이 아니거나, `data.compat.claude`가 있는데 table이 아니면 사유는 `[compat.claude] uses an unsupported representation`입니다.
5. `data.compat.claude`가 있는데 `[compat.claude]` 헤더 줄도 없고 `[compat.claude.` 하위 표 헤더도 없으면(inline 또는 dotted 정의), 사유는 4와 같습니다.
6. 관리 키 K마다 `data.compat?.claude?.[K]`가 정의되어 있으면 다음을 검사합니다.
   - boolean이 아니면 사유 `[compat.claude] <K> must be a boolean`
   - 표 구간에서 K에 맞는 줄(managed 또는 사용자 키 줄)이 정확히 하나가 아니면(0개: quoted/dotted 등, 2개 이상: 모호) 사유 `[compat.claude] <K> uses an unsupported representation`
7. 관리 키 K마다 처리합니다.
   - **사용자 `true`(표식 없음):** 사유 `[compat.claude] <K> = true is set by the user; set it to false or remove it`로 중단합니다(Q4).
   - **사용자 `false`(표식 없음):** 유지합니다. note `[compat.claude] <K> = false is user-owned and kept`
   - **managed `false`:** 유지합니다. note 없음
   - **managed `true`:** ARC 소유 줄이므로 값만 `false`로 바꿉니다. note `[compat.claude] <K> reset to false (arc:managed)`
   - **미정의:** 기록 대상
8. 기록 대상 키 줄은 `<K> = false # arc:managed<eol>`입니다.
   - `[compat.claude]` 헤더가 있으면 표 구간 끝(다음 헤더 직전 또는 EOF)에 관리 키 순서대로 삽입합니다. 바로 앞 줄이 EOL로 끝나지 않으면 `eol`을 붙입니다.
   - 헤더가 없으면(하위 표만 있는 경우 포함) 파일 끝에 덧붙입니다. 끝이 EOL이 아니면 `eol`을 먼저 붙이고, 이어서 `[compat.claude] # arc:managed<eol>`과 키 줄을 붙입니다.
9. 검증: `expected = parseToml(text)`에 `compat.claude.<K> = false`(기록·reset한 키)를 적용한 결과가 `parseToml(updated)`와 `isDeepStrictEqual`이어야 합니다. 아니면 사유는 `cannot verify the safe edit`입니다.
10. 바뀐 내용이 없으면 `{content: Buffer.from(text), action: 'unchanged', notes}`를 반환합니다(globalChanges 없음). 바뀌었으면 `{content, action: 'set Grok Claude compatibility', notes: [..., 'set [compat.claude] <쓴 키 목록 ", "> = false (arc:managed)']}`를 반환합니다.

**바이트 보존:** 변경 대상이 아닌 줄(`[cli] installer = "npm"` 같은 사용자 줄, 주석, 빈 줄, CRLF)은 바이트 그대로 둡니다. 추가하는 줄은 파일의 첫 EOL을 사용합니다.

**설치 중단 오류 문자열(정확).** `plan.mjs`가 다음 형식의 `TargetConfigurationError`로 감쌉니다.

```
Cannot update <absolute config.toml path>: <사유>; fix it or use --skip-global
```

사유는 위 2, 3, 4/5, 6, 7(user true), 9의 문자열입니다. 다중 대상 Configure에서는 plan 단계에서 실패하므로 모든 대상이 적용되지 않습니다(현행 plan 실패 규칙과 같음).

**summary(정확).**
- 각 note는 `plan.mjs:57`의 기존 형식을 따라 `<path>: <note>`로 summary에 들어갑니다.
- 변경이 있으면 `<path>: set [compat.claude] agents, skills, rules = false (arc:managed)`처럼 실제로 쓴 키만 나열합니다.

### 3.4 제거 규칙 (`removeGrokCompat`)

1. `original === null`이면 `{content: null, notes: []}`를 반환합니다.
2. 디코딩 또는 파싱에 실패하면 throw합니다. `uninstall.mjs`가 이를 잡아 원복을 건너뛰고 경고합니다(Q6).
3. 모든 `[compat.claude]` 표 구간에서 managed 키 줄을 줄 전체(EOL 포함)로 지웁니다. 값이 `true`든 `false`든 지웁니다. 사용자 키 줄은 유지합니다.
4. managed 헤더 줄은 같은 표 구간에 키 줄(사용자 키 포함)이 하나도 남지 않을 때만 지웁니다(OQ2, Orchestrator). 남는 주석과 빈 줄은 유지합니다. 표식 없는 헤더는 지우지 않습니다.
5. 검증: `expected`는 `parseToml(text)`에서 지운 managed 키를 뺀 결과입니다. managed 헤더를 지웠다면 비어 있는 `compat.claude`를 빼고, 그 결과 `compat`가 비면 `compat` 키의 존재 여부는 `parseToml(updated)`를 따릅니다(암시적 상위 표가 사라질 수 있음). `isDeepStrictEqual`이 아니면 throw합니다(사유 `cannot verify the safe edit`).
6. 바뀐 것이 없으면 `content: null`입니다. 바뀌었으면 `content`를 반환하고 note `restored [compat.claude] managed lines`를 붙입니다.
7. 결과가 빈 문자열이어도 빈 파일로 기록하고 파일을 삭제하지 않습니다(Q5).

**경고 문자열(정확, uninstall summary).**
```
<absolute config.toml path>: ARC-managed [compat.claude] lines were not restored (<사유>); remove lines marked # arc:managed manually
```
사유는 `config.toml is not UTF-8`, `TOML parse failed`, `cannot verify the safe edit` 중 하나입니다. 경고가 나도 제거 결과는 성공(`code 0`)이고 나머지 제거는 계속됩니다.

### 3.5 범위

- 이 편집은 `buildInstallPlan`이 `skipGlobal=false`로 grok 대상을 처리하는 모든 경로에 적용됩니다: TUI Configure, management `kind:'install'`, `target:'all'`(`lib/management/operations.mjs:53`), composite/Configure 적용(`lib/management/operations.mjs:100`, `skipGlobal: options.settings?.skipGlobal ?? false`; OQ4 Orchestrator 확인).
- upgrade 경로(`lib/installer/upgrade.mjs:15`, `skipGlobal:true`)에서는 편집하지 않습니다(현행 Codex wait settings와 같음, OQ3 Orchestrator).
- 제거(`buildUninstallPlan`)는 capability 상태와 무관하게 원복을 시도합니다. 흔적이 있는 off 플랫폼 제거도 같습니다.

### 3.6 `--skip-global`

- **설치:** hook을 호출하지 않습니다. 기존 `Native concurrency update skipped (--skip-global).`(`plan.mjs:42`)는 그대로 두고, `globalRender`가 있는 descriptor에 한해 summary에 `<runtimeConfigPath>: compatibility settings update skipped (--skip-global).`를 추가합니다.
- **제거:** hook을 호출하지 않고 summary에 `<runtimeConfigPath>: compatibility settings not restored (--skip-global).`를 추가합니다. 기존 AGENTS.md managed block 생략 규칙(`uninstall.mjs:21`)은 바꾸지 않습니다.

## 4. 설치기 hook 일반화 (D19-e)

### 4.1 `lib/installer/plan.mjs` (`renderNativeChanges`, 38-60행)

- 44행의 skip 조건을 `!runtimeConfig.renderConcurrency && typeof runtimeConfig.globalRender !== 'function'`로 넓힙니다.
- 48행 `else` 안에서 `typeof runtimeConfig.globalRender === 'function'`이면 다음을 실행합니다.
  ```
  try { rendered = runtimeConfig.globalRender(original); }
  catch (cause) { fail(`Cannot update ${filename}: ${cause.message}; fix it or use --skip-global`); }
  ```
  그 밖의 경우에는 기존 Codex/Claude 분기(49-54행)를 그대로 실행합니다.
- 56-57행의 globalChanges와 notes 처리는 재사용합니다.
- 42행 skipGlobal 분기에 3.6 note를 추가합니다.
- 리터럴 `'grok'` 분기는 없습니다.

### 4.2 `lib/platforms/grok.mjs`

- `runtimeConfig: Object.freeze({globalRender: renderGrokCompat, globalRemove: removeGrokCompat})`
- `uninstallSummary: 'Grok config.toml is preserved except ARC-managed [compat.claude] lines.'`
- 그 밖의 필드(`globalPaths: ['AGENTS.md','config.toml']`, `runtimeConfigFile`, `isolationEnv: () => ({})`)는 유지합니다.

### 4.3 `lib/installer/uninstall.mjs` (21행 뒤)

`!skipGlobal`이고 `typeof runtimeConfig.globalRemove === 'function'`이면 다음을 실행합니다.

1. `target.runtimeConfigPath`를 `inspectPath(..., {kind:'file', read:true, snapshot})`로 읽습니다.
2. 파일이 있으면 hook을 호출합니다.
   - throw하면 3.4 경고를 `plan.summary`에 넣고 변경 없이 계속합니다.
   - `content !== null`이면 `managedPaths`에 경로를, `globalChanges`에 `{path, content}`를 추가하고 notes를 `<path>: <note>`로 summary에 넣습니다.

`skipGlobal`이면 3.6 note를 넣습니다. `summary`의 첫 항목은 기존처럼 `uninstallSummary`입니다.

### 4.4 불변 조건

- Codex/Claude descriptor에는 `globalRender`/`globalRemove`가 없습니다.
- Codex·Claude·Gemini의 설치·제거 plan(globalChanges, summary, 결과 바이트)은 변경 전과 같습니다.
- `upgrade-state.mjs:29`와 `status.mjs:17`의 `readConcurrency` 가드는 바꾸지 않습니다.
- `tests/node/hardcoding-residual.test.mjs`가 통과해야 합니다(`plan.mjs`, `uninstall.mjs`에 `=== 'grok'` 0건).
- 빈 content(`Buffer.alloc(0)`) globalChange가 transaction에서 빈 파일 쓰기로 적용되어야 합니다(구현 시 확인).

## 5. bridge 자식 env (D20)

`lib/runtime/grok-stream.mjs:12`를 다음과 같이 바꿉니다. 키 순서도 이대로 고정합니다.

```js
childEnv: Object.freeze({
  GROK_DISABLE_AUTOUPDATER: '1',
  GROK_CLAUDE_AGENTS_ENABLED: 'false',
  GROK_CLAUDE_SKILLS_ENABLED: 'false',
  GROK_CLAUDE_RULES_ENABLED: 'false',
  GROK_CLAUDE_MCPS_ENABLED: 'false',
  GROK_CLAUDE_HOOKS_ENABLED: 'false',
}),
```

- spawn env 합성 순서 `{...localCliEnvironment(cli), ...invocation.childEnv, ARC_BRIDGE_CHILD}`(`role-supervisor.mjs:246`)는 그대로입니다. 부모 env에 같은 키가 있어도 `'false'`가 덮어씁니다.
- `childEnv`는 `argsDigest`에 들어가지 않으므로 digest는 바뀌지 않습니다.
- 인자(`isolationArgs`)는 바뀌지 않습니다.
- runtime 모듈이 바뀌므로 원 spec 3장의 갱신 세트(`MANIFEST.sha256`, `installed-layout-golden.json`, `update-runtime-assets.mjs --check`, `shared/skill/runtime/` 사본, runtime-versions baseline)를 함께 갱신합니다.

## 6. 카탈로그 (D22)

`lib/models/grok-models.json`의 정확한 내용은 다음과 같습니다(2칸 들여쓰기, 끝 개행 1개).

```json
{
  "platform": "grok",
  "pairs": [
    {"model": "grok-4.6", "effort": "default"},
    {"model": "grok-4.5", "effort": "default"}
  ]
}
```

- `grok/skill/models.toml`(다섯 역할 `grok-4.6`/`default`)은 바꾸지 않습니다.
- 카탈로그는 계정 가용성의 증거가 아닙니다(R6).

## 7. 표면 (D21)

| 표면 | 동작(정확 문자열) |
|---|---|
| `collectStatus` | `status.mjs:22` 가드를 통과합니다. CLI가 있으면 `probePlatformAuth`가 kind none이라 spawn 없이 `{authStatus:'unknown', reason:'auth_unverified'}`를 반환합니다(`local-cli.mjs:180`). 실행되는 명령은 `grok --version` 1회뿐입니다(Q1). 버전은 `/\d+\.\d+\.\d+/`로 추출합니다(`grok 1.0.89 (28be5bb1bf65)` → `1.0.89`) |
| TUI Status 플랫폼 행 | `Grok` + 정렬 공백 + `Available · auth unverified`. CLI가 없으면 `Not Available`, 범위 밖 버전이면 `Unsupported version`(`mode.mjs:7-13,63`) |
| 홈 상태 줄 | `Grok: Available (auth unverified)` |
| Configure 플랫폼 선택(standalone) | 선택 가능(`install`+`standalone`). CLI 검사는 없습니다(`availability.mjs:76-78`) |
| 역할 편집기 | Grok 선택 가능(`compositeRole`). CLI 없음·버전 범위 밖이면 기존 REASON_TEXT. 선택 행에는 ` (auth unverified)` 접미사(`setup.mjs:81`). 상세는 `Grok: auth unverified — ARC cannot confirm Grok CLI login.` |
| Hosts | `Grok - Unavailable  (capability not verified)` 유지(compositeHost off) |
| management | `target:'grok'` 설치 허용, `target:'all'`에 grok 포함, 설치된 grok은 upgrade 대상 포함. 새 문구 없음 |
| Uninstall | 원복 규칙은 3.4, summary 첫 항목은 4.2 문자열 |

- `lib/tui/*`, `lib/platforms/availability.mjs`, `lib/management/status.mjs`의 코드는 바꾸지 않을 것으로 예상합니다. 모두 descriptor 기반이며, 바꿔야 한다는 사실이 드러나면 plan에서 Orchestrator에게 돌려줍니다.

## 8. role-policy notice (D24)

`lib/policy/role-policy.json:429` `platforms.grok.notice`의 끝 문장 `Use only available authorized tools; ARC does not write Grok config.toml.`를 교체합니다. 전체 문자열은 다음과 같습니다.

```
Role restrictions are prompt-level contracts, not a filesystem sandbox. Grok sandboxing, native tool restriction fields, observer hooks and Git guards are unverified, and Grok may continue without its sandbox. Use only available authorized tools; ARC disables Grok Claude compatibility (agents, skills, rules in config.toml; also MCPs and hooks for bridge children), but whether Grok sessions honor these settings is unverified.
```

- `npm run check:role-policy`로 생성물을 갱신합니다. grok 생성물만 바뀌고 Claude/Codex/Gemini 생성물은 바이트 단위로 같아야 합니다. `MANIFEST.sha256`도 갱신합니다.

## 9. 고정 테스트 `tests/node/grok-capability-evidence.test.mjs` (D18)

- 운영 verified 집합이 `['install','nativeProfile','catalog','standalone','bridge','compositeRole']`이고, off 집합과 reason이 2.1 표와 같습니다.
- `CAPABILITY_PREREQUISITES` 위반이 없습니다.
- 주입 descriptor에서 `compositeHost`, `authProbe`, `watch` 중 하나라도 verified이면 실패합니다(기존 "rejects any injected verified" 테스트를 이 의미로 바꿈).
- `supportedVersions === '>=1.0.0 <1.1.0'`
- `GK1/GK2 === 'fail'`, `resume === 'off'`
- `GROK_CONTRACT.childEnv`가 5장 객체와 `deepEqual`이고, `isolationArgs`에 `--no-auto-update`와 `--no-subagents`가 들어 있습니다.
- 파일 안에 고정 상수 `UNVERIFIED_CONTRACTS`를 두고 길이와 id를 단언합니다: `['compat-session-effect','native-model-application','headless-stream-contract','permission-sandbox-effect','account-model-availability','read-role-permission-effect']`. 각 항목은 14장 R 번호와 연결합니다.
- `platforms.grok.notice`가 `is unverified.`로 끝나는지 단언합니다.

**전환 기록:** Gemini spec 결정 16의 형식을 따르되, 증거 칸에는 "사용자 결정 2026-11-18(live 검증 아님)"과 offline probe 파일 경로를 적습니다. 진행 기록과 T3 커밋 메시지에 함께 남깁니다.

## 10. 문서 (최소 범위)

| 파일:행 | 변경 후(정확) |
|---|---|
| `README.md:81` | `\| Grok \| No \| Standalone enabled (not live-verified) \| Read roles enabled (not live-verified); write roles held: \`permission_scope_unverified\`; Configure sets \`[compat.claude]\` agents/skills/rules to false in \`~/.grok/config.toml\` (session effect unverified) \| No probe; \`unknown\`, \`auth unverified\` warning \|` |
| `docs/harness-operation.md:73` | `\| Grok \| \`auth.kind: none\`, no probe, status \`unknown\`; Status runs only \`grok --version\`; \`auth unverified\` warning, not proof of login \|` |

그 밖의 행은 바꾸지 않습니다(anchor order 행 `README.md:47`, `harness-operation.md:42`는 이미 Grok 포함).

## 11. 테스트 전환

### 11.1 PATH 격리 원칙 (R7)

- 이 PC에는 실제 `grok` 1.0.89가 PATH에 설치되어 있습니다.
- 운영 registry로 `collectStatus`, TUI Status·편집기, role routing status, management `all`을 실행하는 테스트는 실제 `grok`을 실행하면 안 됩니다. 이런 테스트는 PATH를 fixture 디렉터리(fake `grok` 또는 `grok` 없음)로 명시해야 합니다.
- `resolveLocalCli`가 `context.env.PATH`와 `process.env.PATH` 중 무엇을 쓰는지는 plan 단계에서 확정하고, 격리 수단을 그에 맞춥니다.
- fake `grok`은 argv를 marker 파일에 기록하고 `--version`에 `grok 1.0.89 (test)`를 출력합니다.

### 11.2 분류 규칙

1. **운영 기대값 갱신:** 운영 Grok의 off 상태(verified `[]`, `Not verified`, `all` 제외, 미실행)를 단언하던 테스트는 새 운영 값(2.1, 7장)으로 바꿉니다.
2. **주입 off 이동:** off 동작 자체가 목적인 테스트(CLI 미실행, 흔적 있는 off 제거, upgrade 제외, management 거부, P-K7 probe 생략)는 grok capability 9개를 모두 off로 둔 주입 registry helper(예: `grokOffRegistry()`)로 옮깁니다. 단언은 바꾸지 않습니다.
3. **PATH 격리:** 운영 registry에서 grok CLI를 해석할 수 있는 테스트는 11.1을 적용합니다.
- 검사 강도는 줄이지 않습니다. 각 변경에 old→new 대응을 기록합니다.

### 11.3 grok 테스트 대응 (HEAD 0ec8647)

| 테스트 | 전환 |
|---|---|
| `grok-capability-evidence` 3건 | 9장으로 갱신(규칙 1) |
| `grok-platform:65` AC-K2 | 2.1 표로 갱신(규칙 1) |
| `grok-platform:127` management 거부 | 규칙 2 |
| `grok-platform:134` all/preset/uninstall 제외 | 운영: grok 포함으로 갱신(규칙 1+3). 제외 단언은 규칙 2로 보존 |
| `grok-platform:145` status probe 생략, `:151` fake grok 미실행 | 규칙 2 |
| `grok-platform:177` P-K7 version probe 유지 | 운영 registry + fake grok. argv가 `['--version']` 1회뿐인지 단언(Q1, 규칙 3) |
| `grok-platform:73` AC-K10 | 2쌍 카탈로그 |
| `grok-install:19` `verifiedRegistry` | 운영 registry로 대체 가능. 유지 여부는 plan에서 결정 |
| `grok-install:29`, `:62` "config.toml untouched" | 3장 편집 테스트로 대체 |
| `grok-install:105` summary 문자열 | 4.2 문자열 |
| `grok-install:109` 사용자 `config.toml` 바이트 | 비 TOML 바이트는 3.3에 따라 설치 중단 대상이므로 fixture를 유효 TOML로 바꾸고 managed 줄 외 바이트 보존 단언으로 대체 |
| `grok-install:113,131,140` off 흔적·upgrade | 규칙 2 |
| `grok-bridge` | `childEnv` 전달 단언 추가(5장). AC-K6 hold는 그대로 |
| `grok-composite` | 기대값 불변. 운영 registry로 전환할지는 plan에서 결정 |

### 11.4 grok 밖 영향 테스트

Scouter 조사(dispatch `0d123196-030c-4c64-b24e-9ea359406529`) 결과로 **plan 단계에서 확정**하고 11.2 규칙으로 분류합니다.

## 12. 수용 기준

| ID | 기준 | 검증 |
|---|---|---|
| AC-F1 | 운영 grok capability가 2.1 표와 같고, 9장 고정 테스트가 통과한다. `CAPABILITY_PREREQUISITES` 위반이 없다 | unit, `grok-capability-evidence` |
| AC-F2 | 3.3 설치 규칙이 모든 경우에 성립한다: 파일 없음 → 4줄 생성, 기존 사용자 줄·CRLF·EOF 무개행 보존, 사용자 `false` 유지(note), 사용자 `true` 중단, managed 재설치 무변경, managed `true` reset, 파싱 실패·inline·dotted·quoted·중복·비 boolean·비 UTF-8 중단 시 파일 무변경, 정확한 오류 문자열 | unit `grok-compat`, integration |
| AC-F3 | 3.4 제거 규칙이 성립한다: managed 줄만 제거, 사용자 줄 유지, 헤더 조건부 제거, ARC 생성 파일은 빈 파일로 남음, 파싱 실패 시 경고 문자열과 함께 나머지 제거 성공(code 0), 원복 후 재파싱 일치 | unit, integration |
| AC-F4 | `--skip-global` 설치·제거에서 config.toml이 바이트 그대로이고 3.6 summary가 나온다 | integration |
| AC-F5 | `plan.mjs`·`uninstall.mjs`에 grok 리터럴이 없다(hardcoding-residual 통과). Codex·Claude·Gemini 설치·제거 plan과 결과 바이트가 변경 전과 같다 | `hardcoding-residual`, 기존 installer 테스트 무수정 통과 |
| AC-F6 | bridge spawn env에 5장 6개 키가 정확한 값으로 들어가고 부모 env 값을 덮어쓴다. 인자와 `argsDigest`는 바뀌지 않는다 | unit, `grok-bridge` |
| AC-F7 | `platforms.grok.notice`가 8장 문자열과 같다. Claude/Codex/Gemini 생성물이 바이트 단위로 같다 | `check:role-policy`, asset fixture |
| AC-F8 | 카탈로그 JSON이 6장과 같고, 모든 쌍이 `validatePair`를 통과한다 | unit `models` |
| AC-F9 | 7장 표면이 운영 registry와 fake grok으로 성립한다. Status 중 grok 실행은 `--version` 1회뿐이다. Hosts에서 Grok은 계속 불가하다 | integration, PTY |
| AC-F10 | 주입 off registry에서 원 spec 5.6 off 동작(미실행, 거부, `all` 제외, 흔적 제거, upgrade 제외)이 기존 단언 그대로 통과한다 | integration |
| AC-F11 | 운영 registry를 쓰는 모든 테스트가 실제 `grok`을 실행하지 않는다(11.1) | 테스트 검토, marker |
| AC-F12 | grok Implementer/QA는 `permission_scope_unverified`, grok host는 `host_sandbox_blocked`, `segment>0`은 `resume_unverified`로 hold된다 | `grok-bridge`, `role-dispatch-policy` |
| AC-D1 | 문서 변경이 10장의 두 행에 한정된다 | diff 검토 |

**공통 검사:** `npm test`(기준선 대비 신규 실패 0건, 기준선 밖 실패는 단독 재실행으로 판정), `npm run check:manifest`, `npm run check:role-policy`, `node scripts/update-runtime-assets.mjs --check`, `scripts/check-installer-parity.mjs`, golden/instruction-contracts fixture. TUI 표면이 바뀌는 작업은 PTY 테스트가 필수입니다.

## 13. 작업 의존 순서 (세부 분할은 plan 단계)

| ID | 내용 | 선행 | 필수 QA |
|---|---|---|---|
| T1 | config.toml managed 편집·원복(`grok-compat.mjs`) + 설치기 hook 일반화(`plan.mjs`, `uninstall.mjs`, `grok.mjs` runtimeConfig·uninstallSummary). AC-F2–F5 | — | 예(fresh QA) |
| T2 | bridge `childEnv`(runtime 갱신 세트 포함) + role-policy notice와 생성물. AC-F6, F7 | — (T1과 독립) | focused checks |
| T3 | capability 전환, 카탈로그, 고정 테스트, 테스트 전환(주입 off registry, PATH 격리, 11.4 목록). AC-F1, F8–F12 | T1, T2 | 예(fresh QA) |
| T4 | 문서 2행. AC-D1 | T3 | diff 검토 |
| 최종 | 모든 작업이 수용된 뒤 전체 변경에 대해 독립 Reviewer 1회(위험 높음) | T1–T4 | — |

T3를 T1·T2 뒤에 두는 이유: capability가 켜지는 순간 운영 설치에 compat 편집이 포함되어야 하고, bridge 자식에도 차단 env가 들어가 있어야 하기 때문입니다.

## 14. 위험과 미확인

| ID | 내용 | 대응 |
|---|---|---|
| R1 | `grok inspect`에서는 차단 cell이 false(source config/env)로 나오지만 Claude CLAUDE.md, agent, skill이 계속 나열됩니다. 실제 세션에서의 차단 효과는 unverified입니다(`compat-session-effect`) | notice, README, 고정 목록 |
| R2 | config.toml 편집은 사용자의 대화형 Grok 세션에도 적용됩니다. 그래서 그 세션에서도 Claude agents/skills/rules(CLAUDE.md)가 빠집니다. 내장 문서상 `agents` 설명이 "Scan CLAUDE.md"(sic)로 되어 있어 키별 의미도 일부 불명확합니다 | managed 표식, 제거 시 원복, `--skip-global` |
| R3 | 사용자 `true`가 있으면 Configure 전체(다중 대상 포함)가 중단됩니다 | 오류 문자열로 해결 방법을 안내 |
| R4 | 읽기 역할의 `plan`/`read-only`/`--deny`가 실제로 효과가 있는지 unverified입니다(`read-role-permission-effect`, `permission-sandbox-effect`). 사후 탐지는 git-visible worktree만 봅니다 | 기존 사후 탐지, 쓰기 역할은 GK1 hold |
| R5 | 구독이나 로그인이 없으면 bridge가 `execution_failed`로 끝납니다. auth probe는 없습니다 | `auth unverified` 경고 |
| R6 | frontmatter `model` 적용(`native-model-application`), 계정별 모델 가용성(`account-model-availability`), stream·session 계약(`headless-stream-contract`, 원 spec U-K2–U-K8, U-K13)이 unverified입니다 | 고정 목록 |
| R7 | 이 PC에 실제 grok이 설치되어 있어, 격리하지 않은 테스트가 실제 바이너리를 실행할 수 있습니다 | 11.1, AC-F11 |
| R8 | 원 spec U-K12(`GROK_HOME` 주입 의미)와 `GROK_HOME` 설정 시 throw 규칙은 그대로입니다 | — |

## 15. Orchestrator 결정 기록 (Planner 열린 질문)

- OQ1: 표식 있는 `true`는 ARC 소유 줄로 보고 `false`로 되돌립니다(D19-a). 사용자 결정 Q4는 표식 없는 사용자 명시 값에만 적용합니다.
- OQ2: ARC가 만든 헤더에도 `# arc:managed`를 붙이고, 제거 시 표 구간에 키가 남지 않을 때만 지웁니다(3.4-4). "managed 줄만 원복" 원칙의 적용입니다.
- OQ3: upgrade 경로(`skipGlobal:true`)는 현행대로 편집하지 않습니다. 현재 운영 설치된 grok이 없어 영향이 없고, Configure 재실행 시 적용됩니다.
- OQ4: composite/Configure 적용 경로(`lib/management/operations.mjs:100`)는 `skipGlobal`이 기본 false라 편집이 적용됩니다(3.5).
- OQ5: grok 밖 영향 테스트는 Scouter 결과로 plan에서 확정합니다(11.4).

## 16. composite upgrade snapshot 교차 drift 수정 (v2 개정)

### 16.1 결함

- T3 검증에서 드러난 기존 잠복 결함입니다. composite 모드에서 전체 upgrade를 하면, 적용 순서상 앞의 standalone 대상이 자기 `agents/arc-*`를 다시 쓴 뒤 뒤 대상의 적용 직전 snapshot 확인이 `Install target changed: <앞 대상 home>/agents`(ARC_INSTALL_DRIFT)로 실패합니다.
- 재현: `tests/node/install-mode-models-upgrade.test.mjs` `composite upgrade does not recreate standalone profiles`(Claude+Codex composite, Gemini·Grok standalone). Grok이 `failed`가 됩니다. T3 전에는 Gemini가 마지막 적용 순서라 드러나지 않았습니다.
- 원인:
  - `lib/installer/install-mode.mjs` `readInstallMode`는 모든 플랫폼 home의 `arc-role-platform-routing.json`, `.prepared.json` marker, `agents` 디렉터리 tree를 같은 snapshot(`modeSnapshot`)에 기록합니다.
  - `lib/installer/upgrade-state.mjs` `collectInstalledState`는 composite 모드이면 `modeSnapshot` 전체를 모든 대상 entry의 snapshot에 복사합니다.
  - `lib/installer/upgrade.mjs` `buildUpgradePlans`가 이를 plan snapshot에 합치고, `lib/installer/install.mjs` `installTargets`는 plan마다 적용 직전에 `assertPlanSnapshot`을 다시 실행합니다.
- 결함은 플랫폼과 무관합니다. "앞 순서 standalone 대상 + 뒤 순서 아무 대상" 조합에서 발생합니다.

### 16.2 보존할 보장

- **모드 판정 고정:** 수집 시점부터 각 plan 적용 직전까지 composite 여부, 참여 플랫폼, routing 정의 파일, 각 home의 `arc-routing-*` 흔적이 바뀌지 않았음을 확인합니다.
- **`stateToken` 불변:** `collectInstalledState`의 `stateToken`은 버전 간 비교에 쓰입니다(`lib/management/update.mjs`, `lib/npm/upgrade.mjs`). 계산 입력과 결과는 바이트 단위로 바뀌지 않아야 합니다.

### 16.3 수정 (옵션 B)

- `lib/installer/upgrade-state.mjs`: composite 모드에서 entry snapshot에 복사한 mode key 집합을 entry의 새 필드 `modeKeys`(Set)로 함께 반환합니다. standalone 모드에서는 빈 Set입니다. `snapshot` 내용과 `stateToken` 계산은 바꾸지 않습니다.
- `lib/installer/upgrade.mjs` `buildUpgradePlans`(2단계):
  1. 지금처럼 plan을 만들고, `attachShellCompletionCleanup` 이전에 plan마다 쓰기 경로 집합(`managedPaths`, instruction 추가분 포함)을 기록합니다.
  2. 각 plan P의 snapshot에서 key K를 제거하는 조건은 세 가지를 모두 만족할 때입니다.
     - K가 P entry의 `modeKeys`에 속합니다.
     - 다른 plan Q(Q≠P)의 쓰기 경로 W와 `K === W`, `W`가 `K` 아래, 또는 `K`가 `W` 아래인 관계입니다(경로 구분자 기준).
     - 그 밖의 key(자기 home, routing 정의 파일, marker, 참여자 `arc-routing-*`)는 그대로 둡니다.
- 사전 전체 entry 확인(`buildUpgradePlans`의 `assertPlanSnapshot(entry)`)과 `installTargets`·`transaction.mjs`는 바꾸지 않습니다. install·composite 적용 경로는 영향이 없습니다.
- 플랫폼 리터럴 분기를 추가하지 않습니다.

### 16.4 남는 틈 (수용)

앞 plan 적용이 끝난 뒤 뒤 plan 적용 전 사이에 외부가 앞 plan의 `agents` 디렉터리에 `arc-routing-*`를 새로 넣으면 뒤 plan은 이를 감지하지 못합니다. 그 시점에 앞 plan의 쓰기는 끝났고, 뒤 plan의 profiles 결정은 참여자 routing 파일과 routing 정의 파일 검사로 계속 보호되므로 수용합니다.

### 16.5 수용 기준

| ID | 기준 | 검증 |
|---|---|---|
| AC-U1 | composite 모드에서 앞 순서 standalone 대상이 프로필을 다시 쓰는 전체 upgrade에서 모든 대상이 `installed`이다. 주입 registry로 재현하며 운영 capability에 의존하지 않는다 | 신규 unit/integration |
| AC-U2 | 쓰기 경로와 겹치는 mode key만 다른 plan snapshot에서 빠진다. routing 정의 파일, marker, 참여자 `arc-routing-*`, 자기 home key는 남는다 | 신규 |
| AC-U3 | plan 생성 뒤 참여자 `arc-routing-*` 또는 routing 정의 파일을 바꾸거나, 비참여 home `agents`에 `arc-routing-*`를 추가하면 쓰기 전에 실패(ARC_INSTALL_DRIFT)하고 파일 바이트가 그대로다 | 신규 |
| AC-U4 | `stateToken`이 수정 전과 같다. standalone 모드 upgrade plan은 수정 전과 같다 | 신규, 기존 `upgrade-state`·`upgrade-*` 테스트 무수정 통과 |
| AC-U5 | 플랫폼 리터럴 분기가 없다. Codex·Claude·Gemini 설치·제거·upgrade 결과가 바뀌지 않는다 | `hardcoding-residual`, 기존 installer 테스트 무수정 통과 |

### 16.6 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v1 | 2026-11-18 (사용자 승인, `3bb15c5` 커밋 2026-11-18T15:45:08+09:00 이전; 정확한 승인 시각은 재개 PC에 기록 없음) | — | — | 최초 승인 |
| v2 | 2026-11-18T22:19:32+09:00 | contract | T3a 신설, T3 수용 조건 | T3 검증에서 드러난 composite upgrade snapshot 교차 drift 잠복 결함 수정 추가(사용자 결정 2026-11-18 "plan에 수정 작업 추가") |
