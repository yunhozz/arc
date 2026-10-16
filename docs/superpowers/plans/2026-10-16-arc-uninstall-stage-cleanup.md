# ARC 제거 명령과 stage 복구 구현 계획

**Goal:** 대상 선택이 가능한 arc-uninstall 명령을 추가하고, 설치와 제거에서 .arc-stage-*가 네 지정 경로에 남지 않도록 복구 위치로 안전하게 이동한다.

**Architecture:** 기존 target 해석, descriptor 기반 safe-fs, backup과 rollback 경계를 재사용한다. 먼저 설치 stage의 종료·복구 동작을 바꾼 뒤, 같은 보존 계약을 사용하는 제거 transaction과 CLI를 추가한다. target 인접 stage는 재귀 삭제하지 않는다.

**Tech Stack:** Node.js >=22, ESM, 기존 native safe-fs, node:test, 기존 PTY 및 packed-consumer 도구.

**Spec:** 사용자가 승인한 bounded 설계 D1 개정안. 별도 written spec은 필요하지 않다고 판단했다. 이 계획이 설계와 승인 내용을 구체화한다.

**Plan depth:** Bounded design. install·uninstall·recovery가 같은 파일 수명주기와 shared state를 다루므로 계획이 필요하다. 구현 순서는 T1 다음 T2다.

**저장 경로:** /Users/ma-24-007/Desktop/workspace/arc/docs/superpowers/plans/2026-10-16-arc-uninstall-stage-cleanup.md

## 공통 승인·보존 계약

- 사용자는 bounded 설계 개정안을 승인했다. arc-uninstall은 TTY에서 Claude, Codex, All 중 Up/Down과 Enter로 고른다. 비TTY에서는 --target을 요구한다.
- 사용자는 집중 테스트 추가와 실행을 명시적으로 승인했다. 두 계획 작업은 TDD로 진행한다.
- 실제 사용자 home에서 발견한 기존 stage 디렉터리 9개는 사용자의 직접 지시에 따라 제거했고, 후속 확인에서 잔존이 없었다. 자동화 검증은 임시 fixture만 사용하고 실제 사용자 설치 데이터를 변경하지 않는다.
- 공용 skills, .agents/skills, 기존 backups/recovery, Codex config.toml wait 설정, 관리 파일 바깥의 전역 설정 bytes는 보존한다.
- 과거 계획 docs/superpowers/plans/2026-10-16-npm-node-installer.md는 역사 기록으로 유지한다. 그 계획의 stage 보존 계약은 이번 변경 이후의 동작과 사용자 문서에서 대체한다.
- 현재 checkout: /Users/ma-24-007/Desktop/workspace/arc, branch master, 기준 HEAD 7948b41894c8b8750c95274b7baa2cf367e571fa. 실행 target은 아직 선택하지 않았다.
- 사용자 소유 변경인 bin/arc-install.mjs의 mode 변경 100644 → 100755를 보존하고 구현 커밋에 넣지 않는다.
- 새 dependency, native API 변경, prebuild 재생성, 외부 skills 제거, wait 설정 자동 복원은 범위 밖이다.
- 같은 target에서 설치·제거·stage 회수 실행이 겹치는 경우는 지원하지 않는다. 자동 lock은 추가하지 않고 README에 제한을 명시한다. 기존 stage 회수는 비동시 실행 조건에서 수행한다.

## 공통 stage 보존·복구 계약

- 선택한 target의 skills와 agents 바로 아래 있는 .arc-stage-*만 회수 대상으로 삼는다. 다른 경로를 재귀 검색하지 않는다.
- 이름만 보고 내용을 삭제하지 않는다. stage 디렉터리 전체를 descriptor 기반 atomic no-replace rename으로 복구 위치에 옮긴다.
- 우선 target/backups/arc-UUID/recovery/고유 이름으로 이동한다. 이 이동이 EXDEV 등으로 불가능하면 원래 부모의 .arc-recovery-UUID로 옮긴다. 복사 후 원본 삭제로 대체하지 않는다.
- prefix 이름의 일반 파일·symlink·특수 파일, namespace 교체, 목적지 충돌, rename 또는 sync 실패는 안전하게 처리할 수 없으면 실패로 보고하고 원본 자료를 보존한다.
- 현재 실행의 stage도 성공 또는 rollback 종료 후 같은 방식으로 이동한다. 원래 stage 이름이 남아 있으면 성공으로 보고하지 않는다.
- 강제 종료 직후에는 stage가 남을 수 있다. 다음 비동시 설치·제거 실행이 변경 전에 recovery 위치로 옮긴다. 이동 실패 시 원본 경로와 사유를 출력하고 성공으로 처리하지 않는다.
- 일반 파일시스템의 원자적 rename을 사용하고 stage 내부 파일을 개별 unlink/rmdir하지 않는다. held descriptor와 namespace identity를 재검증한다.

## T1 — 설치 stage 종료와 기존 stage 회수

**목표:** 기존 arc-install에서 성공·rollback 후 target 인접 stage를 남기지 않고, 강제 종료에서 남은 stage는 다음 실행에서 보존 이동한다.

**선행 작업:** 없음. 실행 전 CEO가 승인된 계획, Git 상태, execution target을 확인한다.

**대상 파일**

- 추가: lib/installer/recovery.mjs
- 수정: lib/installer/transaction.mjs, lib/installer/install.mjs, lib/cli/index.mjs
- 수정: README.md, MANIFEST.sha256
- 추가: tests/node/recovery.test.mjs
- 수정: tests/node/transaction.test.mjs, tests/node/transaction-drift.test.mjs, tests/node/install.test.mjs, tests/node/all-targets.test.mjs, tests/node/consumer.test.mjs, tests/node/cli-dry-run.test.mjs

### 구현 단계

1. **RED:** recovery helper 테스트를 먼저 쓴다. 기존 stage 이동, nested bytes/mode/symlink 보존, same-parent fallback, 양 경로 이동 실패 시 원본 보존, prefix symlink·일반 파일 fail-closed, 주입된 unknown 파일 보존을 포함한다.
2. 아래 suite를 실행해 새 동작 부재로 실패하는지 확인한다.

       node --test tests/node/recovery.test.mjs

3. **GREEN:** recoverTargetStages(target, {safeFs})와 현재 transaction stage 보존 이동을 구현한다. 기존 renameNoReplaceTo, identity 확인, held descriptor를 재사용한다. 인접 stage에 unlink, rmdir, 재귀 삭제를 호출하지 않는다.
4. **RED:** 설치 성공, rollback 성공·실패, namespace 교체, parent drift를 검증하도록 transaction assertion을 수정한다. stage prefix만 검사하지 말고 자료 내용·보존 경로·오류 보고를 확인한다.
5. Child process가 stage 생성 직후 강제 종료되는 상황을 준비 신호/IPC로 재현하고 다음 비동시 실행이 stage를 recovery로 옮기는 검증을 추가한다.
6. **GREEN:** 전체 preflight가 통과한 뒤 변경 실행에서만 stale stage를 회수한다. recovery가 parent metadata를 바꾸므로 설치 계획과 snapshot을 재구성·재검증한다. dry-run/check는 recovery나 쓰기를 수행하지 않는다.
7. transaction 성공·rollback 후 각 stage를 한 번만 보존 이동한다. 설치가 commit된 뒤 cleanup 오류가 발생해도 설치 자체를 다시 rollback하지 않는다. 이동·sync 실패는 결과에 오류와 잔존 경로를 포함한다.
8. README에서 성공 후 수동 stage 정리 의무를 제거하고 recovery 이동, 강제 종료 후 다음 실행 회수, 이동 실패, 비동시 실행 제한을 설명한다. manifest를 갱신한다.

### 집중 검증

       node --test tests/node/recovery.test.mjs tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/install.test.mjs tests/node/all-targets.test.mjs tests/node/cli-dry-run.test.mjs tests/node/consumer.test.mjs
       npm run check:manifest

기대 결과는 실패 0개와 manifest 검사 성공이다. readonly metadata, race-swap 방어, backup, rollback, packed-consumer 계약도 유지한다.

### T1 수용 기준 및 QA

- 성공과 rollback 종료 뒤 .arc-stage-*가 없고 stage 전체가 recovery 위치에 보존된다.
- 강제 종료 잔여 stage는 다음 비동시 실행에서 recovery로 이동한다.
- stage 이동 실패 시 source 자료가 보존되고 command는 성공으로 보고되지 않는다.
- dry-run/check는 target과 backups를 변경하지 않는다.
- CEO는 focused suite와 fault별 파일 보존 증거를 확인한다. T1 수용 전 fresh QA가 diff와 결과를 독립 점검한다.

**Hold:** 자료 손실, unchecked 경로 변경, rollback 내용 손실, 동시 실행을 안전하게 구분할 방법의 필요, native API 확장이 발생하면 중단하고 계획 범위를 재승인받는다.

**T1 수용 후 커밋 메시지**

    fix(installer): 스테이지 자료를 복구 경로로 보존 이동

## T2 — 대상 선택 arc-uninstall

**목표:** 설치 대상에 해당하는 ARC 파일만 백업 후 제거하는 standalone command를 추가하고 배포 패키지와 사용자 문서를 갱신한다.

**선행 작업:** CEO가 T1의 검증과 fresh QA를 수용하고 T1을 집중 커밋한 뒤 시작한다.

**대상 파일**

- 추가: bin/arc-uninstall.mjs, lib/cli/uninstall.mjs, lib/cli/choices.mjs, lib/installer/uninstall.mjs
- 수정: lib/cli/index.mjs, lib/installer/transaction.mjs, lib/installer/global-config.mjs, package.json, README.md, MANIFEST.sha256
- package-lock.json은 package bin metadata가 lockfile에 기록되는 경우에만 갱신한다.
- 추가: tests/node/uninstall.test.mjs, tests/node/uninstall-cli.test.mjs, tests/node/uninstall-pty.test.mjs
- 수정: tests/node/cli-pty.test.mjs, tests/node/global-config.test.mjs, tests/node/package.test.mjs, tests/node/consumer.test.mjs, tests/node/fixtures/packed-consumer.mjs

### 명령 계약

- package bin에 arc-uninstall을 등록한다.
- 옵션: --target <claude|codex|all>, --dry-run, --skip-global, --help, --version. --preset은 거부한다.
- target이 생략되고 input/output이 모두 TTY면 설치 CLI와 같은 순서 Claude, Codex, All을 표시하고 Up/Down과 Enter로 선택한다. 초기 강조 항목은 Claude이며 preset은 묻지 않는다.
- target을 명시하면 메뉴를 생략한다. input/output 중 하나라도 비TTY면 target 누락은 변경 없이 입력 오류 code 2다.
- EOF와 Ctrl-C 취소는 code 130이며 raw mode와 listener를 복원한다. help/version은 target 선택이나 native loading 없이 동작한다.
- --dry-run은 대상 읽기만 하고 stage recovery, backup 생성, 제거를 하지 않는다. --skip-global은 ARC marker block 처리를 생략한다.

### 제거·복구 계약

- 정확한 관리 allowlist는 skills/arc, resolveTarget이 반환하는 해당 platform ARC role 파일 5개, 관리 marker block이 있는 전역 지침 파일이다.
- allowlist 경로가 정상 파일형이면 ARC 관리 대상으로 취급한다. 사용자 수정본도 제거 전에 backup에 보존한다. 대상 부재는 idempotent 성공이다.
- symlink, special file, 예상하지 못한 유형, malformed/duplicate/reversed marker는 해당 target 변경 전에 실패한다.
- 전역 marker가 없으면 파일을 그대로 둔다. 정상 marker block만 제거하고 marker 외 bytes·BOM·줄바꿈을 보존한다. 결과가 빈 파일이어도 파일 자체는 삭제하지 않는다.
- Codex config.toml wait 설정은 설치 전 값을 복원할 기록이 없어 읽거나 수정하지 않고 보존 안내를 출력한다.
- 공용 skills, .agents/skills, 기존 backups/recovery, ARC 경로 밖 파일은 제거하지 않는다.
- 선택된 target 전체 preflight를 먼저 마친 뒤 target별 transaction을 수행한다. 실패 시 rollback/recovery 결과와 target별 status를 보고하고 앞 target 성공은 후속 target 오류 때문에 되돌리지 않는다.
- 외부 acquisition, npx, network, preset 처리는 호출하지 않는다.

### 구현 단계

1. **RED:** 제거 계획 및 removeManagedBlock 테스트를 쓴다. allowlist 경계, 수정 파일 backup, 외부 bytes 보존, BOM/LF/CRLF, marker 없음, malformed marker 실패, unsafe path/type 실패, --skip-global 비접근성을 포함한다.
2. 아래 suite를 실행해 RED를 확인한다.

       node --test tests/node/uninstall.test.mjs tests/node/global-config.test.mjs

3. **GREEN:** target-specific uninstall plan과 safe marker removal을 구현한다. 기존 marker parser/validation을 공통 helper로 재사용한다.
4. **RED:** 제거 transaction fault tests를 쓴다. backup·각 remove·global publish 전후 오류, 원본 복구, 새 사용자 파일 보호, rollback conflict, recovery path, 반복 제거를 포함한다.
5. **GREEN:** applyUninstallTransaction과 target orchestration을 구현한다. T1 stage recovery를 사용한다. rollback 중 기존 이름에 다른 파일이 있으면 덮어쓰지 않는다. 작업이 없으면 빈 backup을 만들지 않는다.
6. **RED:** parser·TTY·PTY·packed CLI tests를 쓴다. 정확한 메뉴/값/순서, arrow wrap, Enter, target 직접 입력, non-TTY 누락, 취소, preset 거부, listeners/raw-mode 복원, help/version, dry-run 무쓰기, packed command를 확인한다.
7. 아래 suite를 실행해 RED를 확인한다.

       node --test tests/node/uninstall-cli.test.mjs tests/node/uninstall-pty.test.mjs tests/node/cli-pty.test.mjs

8. **GREEN:** 공통 target selector를 choices.mjs로 추출하되 기존 selectChoices export, 설치 메뉴 두 단계, 초기값, 문구, 취소 동작을 유지한다. uninstall CLI와 entrypoint를 연결한다.
9. package bin을 등록한다. packed arc-uninstall으로 Codex, Claude, All, 사용자 지정 CODEX_HOME 동작을 확인한다. source checkout, Python/compiler, acquisition 사용이 없어야 한다.
10. README에 설치·제거 사용법, menu, non-TTY 요구, 제거 범위, 수정본 backup, 보존 항목, no-op, recovery, 동시 실행 제한을 기록한다. manifest를 갱신한다.

### 집중 검증

       node --test tests/node/uninstall.test.mjs tests/node/global-config.test.mjs tests/node/uninstall-cli.test.mjs tests/node/uninstall-pty.test.mjs tests/node/cli.test.mjs tests/node/cli-pty.test.mjs tests/node/cli-dry-run.test.mjs tests/node/package.test.mjs tests/node/consumer.test.mjs
       npm run check:manifest

기대 결과는 실패 0개, manifest 검사 성공, packed CLI 포함 확인이다.

### T2 수용 기준 및 QA

- 설치 명령과 같은 TTY target menu를 제공하고 preset을 묻지 않는다. 명시 target은 menu를 생략하고 non-TTY 누락은 쓰기 전에 거부한다.
- 선택 target의 관리 allowlist만 제거하고 제거 전 bytes는 backup에 보존한다.
- 사용자 수정, shared skills, config.toml wait 설정, marker 밖 bytes, 기존 backups, 관계없는 파일을 보존한다.
- malformed marker와 unsafe target은 첫 mutation 전에 거부된다.
- 반복 제거, partial success, cancellation, rollback, recovery 결과 및 exit code가 명시적이다.
- packed command가 preset/acquisition 없이 동작하고 manifest와 README가 package와 일치한다.
- CEO는 focused test와 T1/T2 영향부 regression을 확인한다. T2 수용 전 fresh QA가 전체 구현과 증거를 독립 점검한다.

**Hold:** allowlist 확대, receipt/원본 설정 기록 도입, wait 설정 자동 복원, 외부 skill 삭제, native API 변경, 동시 실행 지원이 필요하면 중단하고 새 설계 및 승인을 받는다.

**T2 수용 후 커밋 메시지**

    feat(cli): 대상 선택형 ARC 제거 명령 추가

## 최종 검증 및 Reviewer

T1, T2가 각각 focused 검증·QA·CEO 수용과 구현 커밋을 마친 뒤 전체 변경을 한 번 검증한다.

1. 전체 회귀와 manifest 검사를 실행한다.

       npm test
       npm run check:manifest

   live-upstream suite는 실행하지 않는다. native fixture가 없어 검증할 수 없으면 원인을 보고하고 기존 build 절차가 필요한지 결정한다.

2. fresh independent Reviewer가 최종 full diff를 한 번 검토한다. path/descriptor 안전성, atomic no-replace recovery 이동, backup/rollback, allowlist·marker 보존, TTY/non-TTY CLI 계약, 동시 실행 범위, package/manifest 정합성을 확인한다. 작업별 Reviewer는 요구하지 않는다.

3. finding은 영향받은 focused 검증과 QA를 재수행하고 CEO가 수용한다. scope가 확장되면 구현을 멈추고 계획과 승인을 갱신한다.

4. CEO는 Git 변경 목록과 사용자 mode 변경 보존, 승인 범위 밖 파일 부재, 실제 user home 미변경, read-only stage inventory를 확인한다. 테스트는 임시 fixture만 사용한다.

## CEO 통합 검토

- 승인된 D1 개정안과 집중 테스트 실행 허가를 반영했다.
- 단계 순서는 T1 install stage lifecycle, T2 uninstall CLI다. 각각 독립 검증과 focused commit이 있다.
- 최종 Reviewer는 T1/T2 수용 뒤 전체 diff를 한 번 검토한다.
- 비동시 실행 제한, wait 설정 보존, 정확한 path allowlist, malformed marker fail-closed, recovery 이동 실패 보고를 승인 범위에 명시했다.
- 실행 target 선택과 계획 승인 전에는 구현·Git mutation·실제 사용자 설치 제거를 하지 않는다.
- 기존 사용자 bin/arc-install.mjs mode 변경은 보존 대상이다.
