# 쓰기 역할 sandbox 경계 보강 spec

- 상태: v7 승인 (2026-11-20). v7: C-3 allow 검사를 안전 목록 방식으로, Grok projection·snapshot 보강. v5: AC4 상태 우선순위 정정. v6: F3을 C-3+C-2로 변경(L4에서 `--setting-sources user`가 project CLAUDE.md 로딩을 끔). T0 Claude·Codex 측정 반영, Grok 측정 보류로 T3 분리, P-3에 `.codex` 추가.
- 기준: `master` @ b75d25a, 작업 branch `fix/write-role-sandbox-hardening` (사용자 선택).
- 경로: Architectural (보안 경계 변경). 위험도: high.
- 승인 근거: 2026-11-20 사용자 요청 "1~4번에 대해 작업해줘". 대상은 PR #74 (d661b7d..1caf9d1) Reviewer finding 1–4.
- 측정 대상: Claude 2.1.328, Grok 1.0.89, macOS Seatbelt. 측정은 §4 Spike(T0), 결과는 §11.

## 1. 문제

1. **F1 [high, 미검증] Grok 사용자 설정 쓰기.** `GROK_SANDBOX_DENY`(24개, `lib/runtime/grok-sandbox.mjs:7-14`)에 `~/.grok/config.toml`과 `~/.grok/sandbox.toml`이 없다. 이전 spec(2026-11-19 §8, T0)은 목록에 없는 `~/.grok/*`가 쓰기 가능하다고 기록했다. child가 `permission_mode = "always-approve"`를 쓰거나 ARC가 관리하는 `[compat.claude]`를 되돌리면 GK2(호출마다 승인) 전제와 Configure 결과가 깨진다. worktree 밖이라 사후 탐지도 없다.
2. **F2 [확인됨] README 모순.** `README.md:78`(Claude 대상 Implementer/QA held)과 `:81`(Grok 쓰기 역할 held)이 G1/GK1 `pass`를 적은 `docs/harness-operation.md`와 coordination 4종에 어긋난다. 이전 spec §7 영향 파일 목록에 README가 없었다.
3. **F3 [미검증] Claude Edit/Write 범위.** G1 settings(`sandbox.*`)는 Bash만 제한한다. acceptEdits에서 Edit/Write 범위는 permission 규칙이 정한다. 미측정 항목:
   - tracked project `.claude/settings.json`의 `permissions.additionalDirectories`나 `allow: Edit(...)`가 `--settings`와 병합되어 범위를 넓히는지
   - 이미 쓰는 `--safe-mode`(`lib/runtime/role-bridge-args.mjs:189`)가 project 권한 규칙과 hook을 무시하는지
   - child가 보통 git-ignored인 `.claude/settings.local.json`(hook)에 쓰는지
4. **F4 [미검증] main checkout의 `.git` 내부 쓰기.** Claude/Grok 쓰기 child가 `.git/hooks`, `.git/config`, `.git/info/exclude`, `.git/arc/...`에 쓸 수 있다. `snapshotWorktree`/`detectViolations`(`lib/runtime/role-observe.mjs:268-300`)는 HEAD, ref, git에 보이는 경로만 비교한다. hook/config 변경은 이후 host git 명령으로 sandbox 밖에서 실행될 수 있고, `info/exclude` 변경은 이후 쓰기를 탐지에서 숨긴다. Codex `workspace-write`는 `.git`을 보호한다(V8). Claude/Grok은 미측정.

## 2. 목표, 비목표, 금지

### 목표
- G1: F1·F4 쓰기를 측정으로 효과가 확인된 곳은 막고(prevention), 나머지는 사후 탐지(detection)로 fail-closed 처리한다 (Q1 결정).
- G2: F3에서 project/local settings가 Claude 쓰기 역할의 Edit/Write 범위를 넓히거나 hook을 심는 경로를 측정하고, 넓히면 차단하거나 보류한다.
- G3: README와 운영 문서를 실제 게이트 상태(G1/GK1 `pass`)와 이번 보장·한계에 맞춘다.
- G4: 새 reason code 없음. 사전 보류는 `permission_scope_unverified`, 사후 관측은 `permission_violation_observed`.

### 비목표
- GG1/Gemini, GK2/G2 의미 변경, `supportStatus`나 claim level 상향
- Grok 읽기 역할 sandbox, Grok 버전 범위
- `~/.grok/*` 전체 화이트리스트 전환 (`strict` 기반은 이전 T0에서 기각)
- `<gitCommonDir>/arc` dispatch artifact와 lease 무결성 보장 (§9 한계)
- after snapshot 실패 시 violation 판정이 null이 되는 기존 동작(`lib/runtime/role-supervisor.mjs:447-448`) — 별도 finding 후보
- PR #74 Reviewer finding 5–9 (보류)

### 절대 금지
- 측정·테스트에서 사용자 실제 파일 수정: `~/.grok/config.toml`, `~/.grok/sandbox.toml`, `~/.claude/settings*.json`, `~/.claude.json`(M-C5b/M-C6b의 trust 항목은 예외, Q6), 이 저장소의 `.git/*`
- sandbox 끄기, 승인 우회
- 탐지한 변경을 runtime이 자동 복구 (기록하고 실패 처리만, 정리는 사용자)
- bridge 실행 중 커밋

## 3. 현재 동작 (근거)
- Claude 쓰기 역할 인자: `-p --safe-mode ... --permission-mode acceptEdits|default --settings <D1 JSON>` (`role-bridge-args.mjs:186-199`). D1은 `sandbox` 키만 있다 (`role-dispatch-policy.mjs:18-25`). 설치된 Claude CLI는 `--setting-sources`를 지원한다 (`claude --help`, Orchestrator 확인).
- Grok 쓰기 역할: `--sandbox arc-bridge-<8hex>`, 프로필은 `extends = "workspace"` + deny 24개 (`grok-sandbox.mjs:27-31`). deny는 읽기와 쓰기를 모두 막는다 (이전 T0: `cat .grok/sandbox.toml` 거부).
- Grok `prompt.md`와 dispatch artifact는 `<gitCommonDir>/arc/workflows/<wf>/dispatches/<id>/` 아래 (`role-supervisor.mjs:100,107`). 그래서 `.git` 전체 deny는 불가.
- 사후 탐지 `snapshotWorktree`: HEAD, branch, ref 전체, `git status --untracked-files=all` 경로 해시. git-ignored 경로와 `.git` 내부는 보지 않는다.

## 4. Spike 측정 (T0, 커밋 없음, Orchestrator가 host에서 실행)

### 4.1 공통 안전 규칙
- **S-1** 모든 측정 저장소는 `mktemp -d` scratch에 `git init`. 연결 worktree 사례는 scratch 저장소에서 `git worktree add`. 이 저장소의 `.git`은 대상이 아니다.
- **S-2** 측정 전후 sha256 기록 (부재도 상태): `~/.grok/config.toml`, `~/.grok/sandbox.toml`, `~/.claude/settings.json`, `~/.claude/settings.local.json`, `ls -la ~/.grok`, 이 저장소 `.git/config`, `.git/hooks/*`. 다르면 측정을 멈추고 보고.
- **S-3** 실제 사용자 파일에 쓰기 시도 금지. 같은 디렉터리에 sentinel(`~/.grok/arc-probe-<rand>.toml` 등)을 만들어 대리 측정하고 측정 뒤 삭제. 실제 경로는 deny 목록과 읽기 프로브에만 쓴다.
- **S-4** trusted workspace 사례(M-C5b, M-C6b)는 사용자가 `!` 명령으로 직접 실행하고 `~/.claude.json`에 scratch project 항목이 생기는 것을 수용 (Q6).
- **S-5** 측정용 Grok 프로필은 scratch 저장소의 `.grok/sandbox.toml`, 이름 `arc-probe-xxxxxxxx`. 사용자 `~/.grok/sandbox.toml`은 쓰지 않는다.
- **S-6** 각 사례는 child 출력(`Operation not permitted`, 도구 거부), 파일 존재·해시, Grok `ProfileApplied`의 `deny_paths`를 남긴다.

### 4.2 Grok 1.0.89 (모두 `--permission-mode acceptEdits`, 헤드리스, `workspace` + D5 프로필 기준)

| ID | 절차 | pass 신호 | 분기 |
|---|---|---|---|
| M-K5 | shell과 파일 도구 각각으로 `~/.grok/arc-probe-A.toml` 생성·쓰기 | 쓰기 허용 (F1 실재) | 허용 → F1 확정, K-1 진행. 거부 → F1은 문서 정정만 |
| M-K6 | sentinel `~/.grok/arc-probe-B.toml`을 deny에 더하고 덮어쓰기·append·삭제 | 모두 거부, 정상 시작, `deny_paths` 포함 | pass → 파일 단위 deny 유효 |
| M-K7 | deny에 실제 `~/.grok/config.toml`, `~/.grok/sandbox.toml` 추가 후 무해 작업(worktree 파일 1개 쓰기)과 읽기 프로브 `cat ~/.grok/config.toml >/dev/null`만 실행 | 정상 시작·완료, `ProfileApplied` 통과, 읽기 프로브 거부, 실제 파일 해시 불변 | 실패 → K-1 불가, K-2만 |
| M-K8 | M-K6 sentinel에 `printf x > tmp && mv -f tmp sentinel`, `ln -sf` 교체 | 거부, 해시 불변 | 허용 → K-2 필수 |
| M-K9 | `~/.grok/arc-probe-dir/inner.toml`만 deny하고 상위 디렉터리 `mv` | 거부 | 허용 → K-2 필수, `~/.grok` 자체 이동은 home 쓰기 거부 전제로 문서화 |
| M-K10 | deny 없이 정상 1회 실행 후 실제 `~/.grok/config.toml` sha256·mtime 비교(읽기만) | 불변 | Grok이 스스로 쓰면 K-2는 보안 키 비교 (Q2) |
| M-K11 | scratch main checkout에서 shell·파일 도구로 `.git/hooks/pre-commit` 생성, `.git/config`에 `hooksPath` append, `.git/info/exclude` append | 허용 → F4(Grok) 확정 | 거부 → 문서 정정만 |
| M-K12 | deny에 `.git/hooks`, `.git/info` 추가 후 M-K11 재시도, `git status`/`git diff`/`git log -1` | 쓰기 거부, git 읽기 정상 | pass → 채택. git 깨짐 → 탐지만 |
| M-K13 | deny에 `.git/config` 추가 후 `git status` | 정보 수집 (깨짐 예상) | 깨지면 탐지만, 아니면 deny |
| M-K14 | 연결 worktree cwd에서 공용 `<common>/hooks`, `<common>/config` 쓰기 | 거부 | 허용 → 공용 dir도 deny/탐지 대상 |
| M-K15 | Grok sandbox 문서 확인, 쓰기만 막는 read-only 항목 지원 여부 시험 | 지원 여부 기록 | 지원 → `.git/config`, `~/.grok/config.toml`은 쓰기만 금지 |
| M-K16 (선택) | worktree `.grok/config.toml`의 `permission_mode`를 project 설정으로 읽는지 | 정보 수집 | 읽으면 감지 대상(§5.4)에 추가 |

### 4.3 Claude 2.1.328 (bridge와 같은 인자: `-p --safe-mode ... --tools Read,Edit,Write,Bash --permission-mode acceptEdits --settings <D1>`)

| ID | 절차 | pass 신호(안전) | 분기 |
|---|---|---|---|
| M-C5a/b | tracked `.claude/settings.json`에 `additionalDirectories:["<scratch>/outside"]`, `allow:["Edit(//<scratch>/outside/**)","Write(//<scratch>/outside/**)"]` 두고 Write 도구로 `outside/sentinel` 생성. a untrusted, b trusted(S-4) | 둘 다 거부 | 거부 → safe-mode가 차단, C-1 불필요. 허용 → F3 확정, C-1 또는 C-3 필수 |
| M-C6a/b | 같은 내용을 `.claude/settings.local.json`에 | 거부 | 위와 같음 |
| M-C7 | project `hooks.PreToolUse`로 `touch <scratch>/hook-ran` 등록 | `hook-ran` 없음 | 있음 → C-1 필수, §9 기록 |
| M-C8 | Write/Edit와 Bash 각각으로 `.claude/settings.local.json`(hook 추가), `.claude/settings.json` 쓰기 | 정보 수집 (허용 예상) | 허용 → C-2 deny와 §5.4 감지 필수 |
| M-C9 | scratch main checkout에서 Write/Edit와 Bash로 `.git/hooks/pre-commit`, `.git/config`, `.git/info/exclude` 쓰기 | 정보 수집 | 허용 → F4(Claude) 확정, C-2 진행 |
| M-C10 | `--settings`에 C-2 후보 추가 후 M-C8·M-C9 재시도, Bash `git status`/`git diff`, 일반 파일 Edit | 대상 쓰기 거부(도구·Bash 모두), git 읽기·일반 Edit 정상 | pass → C-2 채택. 경로 문법 불일치 → 절대 경로(`//<worktree>/...`) 변형 재측정 |
| M-C11 | M-C10 + project `allow:["Edit(./.git/**)"]` | deny 유지 | 지면 C-1 또는 C-3 병행 |
| M-C12 | `--setting-sources user`로 M-C5b, M-C7 재실행, 인증 유지 확인 | project/local 무시, 인증 정상 | pass → C-1 사용 가능 |
| M-C13 | 연결 worktree에서 Write와 Bash로 공용 `<common>/hooks`, `<common>/config` 쓰기 | 거부 | 허용 → C-2에 공용 dir 절대 경로 추가 또는 감지에 맡김 |
| M-C14 | 일반 1회 실행 전후 scratch `.claude/settings.local.json`, `~/.claude/settings.json` 해시(읽기만) | 불변 | Claude가 스스로 쓰면 해당 파일 감지는 오탐 → 설계 조정 |

### 4.3a Codex 0.170.0 (bridge와 같은 인자: `-c sandbox_mode="workspace-write" -c approval_policy="never"`)

| ID | 절차 | pass 신호(안전) | 분기 |
|---|---|---|---|
| M-X1 | scratch 저장소 cwd에서 shell로 `<worktree>/.codex/config.toml` 생성·수정, `~/.codex/arc-probe-<rand>` sentinel 생성 시도(실제 `~/.codex/config.toml`은 쓰지 않음) | `~/.codex` 쓰기 거부. `.codex/config.toml`은 정보 수집 | `.codex/config.toml` 쓰기 허용 → P-2 감지로 처리(코드 차단 없음). `~/.codex` 쓰기 허용 → 사용자 결정 필요(예상 밖) |

### 4.4 측정 뒤 처리
Orchestrator가 §11에 결과를 기록한다. §6 분기 조건이 결과로 정해지지 않거나 예상 밖 결과가 나오면 사용자 결정을 받은 뒤 T1 이후를 진행한다.

## 5. 설계

### 5.1 F1 Grok 사용자 설정 (K-1 + K-2)
- **K-1 deny 추가:** `GROK_SANDBOX_DENY` 끝에 `'~/.grok/config.toml'`, `'~/.grok/sandbox.toml'` 추가 (26개, 순서 고정). M-K7 실패 시 K-1 생략.
- **K-2 사후 감지:** supervisor가 spawn 직전과 종료 관측 뒤에 두 파일 상태(lstat 종류, dev/ino, sha256, 부재)를 비교. 다르면 `permission_violation_observed`. M-K10에서 Grok이 스스로 config를 쓰면 파일 해시 대신 보안 키(`permission_mode`, `[compat.claude]`, sandbox 관련 키)만 비교 (Q2 결정).
- 실행 중 사용자나 ARC Configure의 정당한 수정도 violation이 된다 (fail-closed로 수용).
- deny 목록 변경은 프로필 바이트, fixture, 문서의 "24 deny entries"를 바꾼다. 이름 규칙과 argsDigest 규칙은 그대로.

### 5.2 F2 README
- `README.md:78` Claude 행: Implementer/QA는 기록된 sandbox settings로 bridge 실행(G1). 주입 실패 시 보류와 Codex host 호출별 escalation 유지.
- `README.md:81` Grok 행: 쓰기 역할은 dispatch별 프로필과 `ProfileApplied` 확인으로 동작(GK1), live 검증 범위 1.0.89 macOS. F1 결과 반영.
- README 표에 G1/GK1 `pass`와 모순되는 "held" 문구가 없음을 단언하는 정합성 테스트 추가 (Q5 결정).

### 5.3 F3 Claude 설정 병합
- **C-1 설정 소스 제한:** `--setting-sources user` 추가. M-C12 pass이고 M-C5/6/7에서 project 설정이 실제로 영향을 줄 때만 쓴다.
- **C-2 `--settings` 안 deny:** D1에 `permissions.deny`(`Edit(./.git/hooks/**)`, `Edit(./.git/config)`, `Edit(./.git/info/**)`, `Edit(./.claude/**)` 및 대응 Write 규칙)와 Bash 쪽 `sandbox.filesystem` 쓰기 금지를 추가. 경로 문법과 키 이름은 M-C10으로 확정.
- **C-3 prepare 정적 검사:** worktree `.claude/settings.json`·`.claude/settings.local.json`에 비어 있지 않은 `permissions.additionalDirectories`, `permissions.allow`의 쓰기 가능 규칙(v7: 안전 목록 `Bash`·`Read`·`Grep`·`Glob`·`WebFetch`·`WebSearch` 밖의 모든 도구 이름, 괄호 유무 무관), `hooks`, `sandbox` 중 하나라도 있으면 Claude 쓰기 역할을 `permission_scope_unverified`로 보류.
- **v6 확정: C-3 + C-2.** C-1(`--setting-sources user`)은 project `CLAUDE.md` 로딩까지 끄므로(L4 (c)) 채택하지 않는다. C-3 보류는 bridge route의 Claude 쓰기 역할에 prepare와 run·resume(`buildBridgeInvocation`) 양쪽에서 적용하고, 설정 파일이 symlink이거나 파싱할 수 없으면 역시 보류한다.
- **분기 (Q8 결정 반영, v3 기록):**
  - M-C5/6/7 모두 안전 → C-2만, "safe-mode가 project 권한·hook 무시"를 실측으로 문서화
  - 넓혀지고 M-C12 pass → C-1 + C-2
  - 넓혀지고 M-C12 fail → C-3 + C-2
  - 어느 경우든 §5.4 `.claude/settings*.json` 감지 적용

### 5.4 F4와 공통 제어 파일 감지
- **P-1 platform별 차단:** Claude는 C-2(M-C10 pass 시). Grok은 `.git/hooks`, `.git/info` deny(M-K12 pass 시), `.git/config`는 M-K13/M-K15 결과로 결정. Codex는 V8(`.git` 쓰기 거부)과 `workspace-write` 쓰기 허용 범위로 이미 보호되어 차단 변경 없음. M-X1로 `~/.codex` 거부를 재확인하고 worktree `.codex/config.toml`은 P-2로 감지.
- **P-2 제어 파일 snapshot:** `role-observe.mjs`에 `snapshotControlFiles({gitCommonDir, gitDir, worktree, extra})` 추가, `detectViolations`가 `controlChanged`를 함께 판정. 새 모듈 없음.
  - 대상: `<gitCommonDir>/config`, `<gitDir>/config.worktree`(있을 때), `<gitCommonDir>/hooks/**`(목록과 해시, 최대 1000개, 넘으면 하나의 상태 값), `<gitCommonDir>/info/**`, `<worktree>/.claude/settings.json`, `<worktree>/.claude/settings.local.json`, `<worktree>/.codex/config.toml`(M-X1), Grok 쓰기 역할이면 `extra`로 `<homes.grok>/config.toml`·`<homes.grok>/sandbox.toml`(K-2), M-K16 해당 시 `<worktree>/.grok/config.toml`
  - 제외: `<gitCommonDir>/arc/**`, `objects`, `refs`(기존 ref 비교), `index`, `logs`, `*.lock`
  - 비교 값: `contentDigest` 규칙 + dev/ino. symlink는 대상 문자열, 디렉터리, 읽기 불가, 부재도 각각 상태 값.
  - before/after가 다르면 `allowedPaths`와 관계없이 `permission_violation_observed`. record에 `controlFiles: {changed: [<label>...]}` (예: `git:hooks/pre-commit`, `grok-home:config.toml`, 내용 없이 위치만).
  - before 실패는 기존 `snapshotWorktree` 실패와 같게 early failure `execution_failed`, spawn하지 않음 (Q4 결정).
  - 쓰기와 읽기 역할 모두 적용 (Q7 결정).
- **P-3 allowedPaths 충돌:** `allowedPaths`가 `.claude/settings*.json`, `.codex/config.toml`(v4), `.git/` 아래를 덮으면 prepare와 supervisor에서 `permission_scope_unverified`로 보류 (Q3 결정, 이전 D8과 같은 방식).

## 6. 결정 기록

| ID | 결정 | 근거·조건 |
|---|---|---|
| H1 | F1은 K-1 + K-2 | Q1 차단+감지. M-K7 실패 시 K-2만. M-K10에서 Grok 자체 쓰기 시 보안 키 비교(Q2) |
| H2 | README 두 행 정정 + 정합성 테스트 | Q5 |
| H3 | F3은 §5.3 분기표 | M-C5–M-C7, M-C12. 최악 분기는 C-3 보류(Q8) |
| H4 | F4는 P-1(측정 범위) + P-2 + P-3 | Q1, Q3, Q4, Q7 |
| H5 | 새 reason code 없음 | 고정 |
| H6 | runtime은 `lib/runtime/`에서 고치고 `shared/skill/runtime/`은 생성 스크립트로 같은 바이트 유지, 설치본 편집 없음 | 고정 |
| H7 | Claude settings나 Grok 프로필 바이트 변경은 argsDigest를 바꾼다. 업그레이드 전 prepare된 lease는 기존 규칙대로 `activation_unverified` | 수용 |
| H8 | trusted workspace 측정은 사용자 직접 실행 | Q6 |
| H9 | Codex는 코드 차단 변경 없음. M-X1 측정과 `.codex/config.toml` P-2 감지 추가 | 2026-11-20 사용자 승인 |
| H10 | P-3 사전 보류에 `.codex`·`.codex/config.toml` 추가. C-1 `--setting-sources user`는 Claude 쓰기 역할만(읽기 역할은 Read/Grep/Glob만 보유) | 2026-11-20 사용자 결정 |

### 사용자 결정 (2026-11-20)
- Q1 차단+감지, Q2 보안 키 비교, Q3 보류, Q4 `execution_failed`, Q5 정합성 테스트 추가, Q6 사용자 직접 실행, Q7 읽기 역할 포함, Q8 C-3 실행 보류 검사.

## 7. 수용 기준
- **AC1** Grok 프로필 렌더 결과가 새 고정 fixture와 바이트 일치. deny 수·순서는 H1 결과, `strict` 문자열 없음.
- **AC2** Claude 쓰기 역할 `--settings` JSON이 확정된 D1′와 deepEqual, deep-frozen. 읽기 역할에는 없음. C-1 채택 시 `--setting-sources user` 정확히 1회. 주입 `G1:'fail'` 보류 유지.
- **AC3** P-2 단위 테스트(임시 git 저장소): hooks 추가·수정·삭제, `config`, `info/exclude`, `config.worktree`, `.claude/settings.local.json` 생성(git-ignored 포함), `extra` 변경, symlink 교체, 상한 초과 → 각각 `permission_violation_observed`와 라벨. `arc/**`, `index`, `objects` 변경 무시. 변경 없으면 코드 없음.
- **AC4** supervisor 통합(fake claude/grok): child가 제어 파일을 바꾸면 `failed` + `permission_violation_observed`, 파일 보존(복구 없음). 세션 식별까지 실패하면 기존 우선순위대로 `unknown`(hold, 슬롯 유지)이고 `permission_violation_observed`는 함께 기록된다(v5). before 실패 시 spawn 없음.
- **AC5** P-3 보류(prepare·supervisor), C-3 채택 시 정적 검사 분기 테스트.
- **AC6** 문서: README 두 행, `docs/harness-operation.md` G1/GK1 행의 보장·한계, coordination 4종, `composite-instructions.test.mjs` 정규식, README 정합성 테스트.
- **AC7** `MANIFEST.sha256` 갱신, manifest 테스트와 runtime asset 동일성 검사 통과.
- **AC8** S-2 사용자 파일 해시가 자동 테스트와 실측 전후 동일. 테스트는 임시 HOME만 사용.
- **AC9** 전체 `node --test`에서 baseline 실패와 현재 실패를 구분 기록, 새 실패 0건.
- **AC10 live** L3: runtime 헬퍼로 만든 Grok 프로필로 M-K6, M-K7, M-K12 재확인. L4: `buildClaudeArgs` 인자 그대로 M-C10, M-C11(C-1 채택 시 포함) 재확인. 가능하면 bridge 1회 dispatch(실행 중 커밋 없음).

## 8. 영향 파일
- `lib/runtime/grok-sandbox.mjs`, `role-dispatch-policy.mjs`, `role-bridge-args.mjs`(C-1 시), `role-observe.mjs`, `role-supervisor.mjs`, `role-bridge.mjs`(P-3, C-3) 및 `shared/skill/runtime/` 복제본
- 테스트: `tests/node/grok-sandbox.test.mjs`, `role-bridge-args.test.mjs`, `role-routing-dispatch.test.mjs`, `grok-composite.test.mjs`, `grok-bridge.test.mjs`, `composite-instructions.test.mjs`, role-observe 관련 테스트(파일명은 plan에서 확인), README 정합성 테스트
- `tests/node/fixtures/installed-layout-golden.json`: 바뀌는 파일 해시가 포함될 때만 재생성
- 문서: `README.md`, `docs/harness-operation.md`, `claude/skill/references/coordination.md`, `codex/skill/references/coordination.md`, `gemini/skill/references/coordination.md`, `grok/skill/references/coordination.md`
- `MANIFEST.sha256`, 이 문서 §11

## 9. 위험과 한계
- 감지는 사후다. 실행 중 변경된 hook/config가 종료 전에 host git 명령으로 실행될 가능성은 막지 못한다. bridge 실행 중 host git 명령 금지 규칙이 보완한다.
- 실행 중 사용자나 ARC Configure의 정당한 수정도 violation (fail-closed).
- main checkout에서 `<gitCommonDir>/arc/**`는 child가 쓸 수 있다. 무결성 보장 없음, 연결 worktree 사용 권장.
- Grok deny는 읽기도 막는다. `.git/config`를 deny하지 못하면 감지만 한다.
- 측정 버전은 Claude 2.1.328, Grok 1.0.89, macOS뿐.
- 사용자 `~/.claude/settings.json`의 넓은 allow는 신뢰 경계 안으로 본다.
- 목록 밖의 실행 주입 경로(`.envrc`, IDE 설정, `.mcp.json` 등)는 남는다. git에 보이면 기존 탐지가 잡는다.

## 10. task 분할 (plan depth: Architectural, 모두 순차)
- **T0 Spike 측정** (커밋 없음): §4 전체 → §11 기록 → 분기 확정(필요 시 사용자 결정).
- **T1 README 정정(F2)과 정합성 테스트.**
- **T2 제어 파일 감지(P-2, P-3, K-2).**
- **T3 Grok deny 보강(K-1, P-1 Grok), L3.**
- **T4 Claude settings 보강(C-2, C-1 또는 C-3), L4.**
- **최종:** 모든 task acceptance와 필요한 QA 뒤 독립 Reviewer 1회.

## 11. T0 측정 결과

측정일 2026-11-20, macOS. 실제 버전: Claude **2.1.327**(spec 머리의 2.1.328과 다름), Codex 0.170.0, Grok 1.0.89. scratch: `/private/tmp/arc-t0-claude.ypRS8F`, `/private/tmp/arc-t0-codex.6zN0wT`, `/private/tmp/arc-t0-grok.i15VSQ`, 바깥 대상 `/private/tmp/arc-t0-outside-24797`.

S-2: `~/.grok/config.toml`, `~/.grok/sandbox.toml`, `~/.claude/settings.json`, `~/.claude/settings.local.json`(부재), `~/.codex/config.toml`, 이 저장소 `.git/config`·hooks 모두 전후 동일. `~/.grok`에는 Grok CLI가 만든 `auth.json.lock`만 추가.

### Codex
| ID | 결과 |
|---|---|
| M-X1 | `.codex/config.toml` 생성 거부(`mkdir: .codex: Operation not permitted`), `~/.codex/arc-probe-*` 거부, `.git/hooks/pre-commit`·`.git/config` 거부(V8 재확인), `/tmp` 쓰기 허용(기존 예외). **안전, 차단 변경 불필요** |

### Claude (bridge 인자 `-p --safe-mode --tools Read,Edit,Write,Bash --permission-mode acceptEdits --settings <...>`)
| ID | 결과 |
|---|---|
| M-C5a/M-C6a (untrusted) | project `allow`·`additionalDirectories` 무시 경고 출력, 바깥 쓰기 Write·Bash 모두 거부 |
| **M-C5b/M-C6b (trusted)** | **Write 도구로 바깥 `sentinel-write.txt` 생성 성공 — F3 확정.** Bash는 sandbox가 거부 |
| M-C7 | project `PreToolUse` hook 미실행 (untrusted·trusted 모두) |
| M-C8 | `.claude/settings.local.json` Write 도구 거부(권한 요청), `.claude/settings.json` Bash 거부 — Claude 내장 보호 |
| **M-C9** | Write/Edit로 `.git/hooks/*`, `.git/config`, `.git/info/exclude`는 "sensitive file"로 거부, Bash로 `.git/hooks/*`, `.git/config` 거부. **Bash로 `.git/info/exclude` append 성공 — F4(Claude) 일부 확정** |
| M-C10 | D2 = D1 + `permissions.deny:["Edit(./.git/**)","Write(./.git/**)"]` + `sandbox.filesystem.denyWrite:["./.git"]`: Write·Edit·Bash 모든 `.git` 쓰기 거부, 일반 Edit·`node`·`git status`/`diff`/`log` 정상 |
| M-C11 | trusted + project `allow:["Edit(./.git/**)","Write(./.git/**)"]`에서도 D2 deny 유지 (deny 우선). 단 바깥 쓰기는 여전히 성공 |
| M-C12 | `--setting-sources user`: trusted에서도 바깥 쓰기 거부, 인증 정상 |
| FINAL | D2 + `--setting-sources user`: `.git` 쓰기·바깥 쓰기·`.claude/settings.local.json` 모두 거부, 일반 Edit·파일 생성·`node`·git 읽기 정상 |

분기 결과(v3): §5.3 "넓혀지고 M-C12 pass" → C-1 + C-2 채택. **v6에서 C-3 + C-2로 변경** (아래 L4 참조). C-2 경로 문법은 `./.git/**`(permissions)와 `./.git`(sandbox.filesystem.denyWrite)로 확정. 남은 확인: `--setting-sources user`가 project `CLAUDE.md` 등 지침 로딩에 주는 영향(L4에서 확인).

### Grok
M-K5–M-K16 **보류**: Grok API `402 Payment Required`(크레딧 소진). 사용자 결정(2026-11-20)으로 Claude 측정만 진행. 추가 관찰: `~/.grok`에 D5 목록 밖의 `hooks/`, `hooks-paths`, `trusted_folders.toml`, `managed_config.toml`, `requirements.toml`이 있다. 이전 측정상 목록 밖 `~/.grok/*`는 쓰기 가능하므로 F1 범위는 이 파일들까지 포함한다(측정 재개 시 K-1 후보에 추가).

### L4 (T4, 2026-11-20, Claude 2.1.327, `buildClaudeArgs` 실제 인자, trusted scratch)
- (a) `.git/hooks`·`.git/config`(Write/Edit), `.git/info/exclude`·`.git/hooks/*`(Bash) 모두 거부. 일반 Edit, `node --test`, git 읽기 정상.
- (b) trusted project `allow:["Edit(./.git/**)","Write(./.git/**)"]`·`additionalDirectories`가 있어도 `.git`·바깥 쓰기 거부.
- (c) **project `CLAUDE.md` 미로딩.** 같은 인자에서 `--setting-sources user`만 빼면 로드됨(`--safe-mode` 유무와 무관). → C-1은 project 지침을 끄므로 사용 불가.
- (d) `~/.claude/settings.json` 해시 불변, `.claude/settings.local.json` 미생성.

### L4 재측정 (v6 인자: D2 `--settings`, `--setting-sources` 없음)
- C-3: trusted scratch의 project `.claude/settings.json`(additionalDirectories·Edit/Write allow·hooks)에 `claudeProjectSettingsWidenScope` → `.claude/settings.json: hooks`(보류). 파일 제거 후 null.
- (a) `.git` 쓰기(Write/Edit/Bash) 모두 거부, 바깥 Write 거부, `.claude/settings.local.json` Write 거부. 일반 Edit, `node --test`, git 읽기 정상.
- (c) 짧은 토큰 질의로 project `CLAUDE.md` 로드 확인 (project settings 유무 모두 정답 토큰). 긴 probe 프롬프트 안의 같은 질문은 NONE으로 답함 — 모델 응답 차이로 기록.
- (d) `~/.claude/settings.json` 해시 불변.

## 개정 이력

| Version | Approval time | Classification | Affected tasks | Reason |
|---|---|---|---|---|
| v0 | — | 초안 | 전체 | Planner 최초 작성 |
| v1 | — | 초안 | 전체 | Orchestrator가 사용자 결정 Q1–Q8 반영, `--setting-sources` 존재 확인 기록 |
| v2 | 2026-11-20 | 승인 | T0, T2 | Codex M-X1 측정과 `.codex/config.toml` 감지 추가, 사용자 승인 |
| v3 | 2026-11-20 | 승인 | T0–T4 | T0 Claude·Codex 결과 기록(§11), F3 분기 C-1+C-2 확정. Grok 측정 보류로 이번 plan은 T1·T2·T4만, T3(K-1, Grok P-1)은 Grok 측정 뒤 별도 진행. K-2(Grok config 감지)는 T2에 포함. 사용자 승인 |
| v4 | 2026-11-20 | 승인 | T2, T4 | plan 검토 결정: P-3에 `.codex` 추가(H10), C-1 쓰기 역할 한정 명시, 사용자 승인 |
| v5 | 2026-11-20 | 승인 | T2 | T2 QA 발견 1: 세션 미식별과 위반이 겹치면 `unknown`(더 엄격한 hold) 유지로 AC4 정정. 사용자 결정 |
| v6 | 2026-11-20 | 승인 | T4 | L4 (c): `--setting-sources user`가 project CLAUDE.md 로딩을 끔. F3을 C-3(prepare·run·resume 보류)+C-2로 변경. 사용자 결정 |
| v7 | 2026-11-20 | 승인 | 최종 | 최종 Reviewer B1: trusted project `allow:["Write","Edit"]`가 C-3을 통과하고 바깥 Write 허용(실측). C-3 allow 검사를 안전 목록으로. N1 projection 표기 정규화, N2 하위 디렉터리 unreadable 상태값. 사용자 결정 |
