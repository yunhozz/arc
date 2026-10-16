# ARC 명령·모델 설정·설치 수명주기 통합 구현 계획

## 목표와 승인 문서

ARC에 단일 arc 명령, shell 완성, 통합 모델 설정, 영구 백업 없는 설치·제거, 설치 진행 표시를 제공한다.

- 승인 명세: /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-16-arc-cli-models-install-lifecycle-design.md (사용자 승인, 2026-10-16)
- 저장 경로: /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-16-arc-cli-models-install-lifecycle.md
- 저장소: /Users/yunho/Desktop/project/arc
- 기준: master, 460975714ad5f6cb48c17a674a497fdd93917d9c. 승인 명세 외 변경은 없다.

## 현재 상태 및 후속 승인 범위

- 위 기준 정보는 T1–T4 구현을 시작하기 전의 계획 기록이다. 해당 네 작업은 이미 구현·검증되어 현재 master에 병합됐다. 현재 HEAD는 5140c416434e6b1d8f7fb8c2d92eaf7a8f5b8d76이다.
- 이번 계획 수정은 T1–T4를 다시 열지 않는다. 아래 T5만 새로 승인받아 실행한다.
- 사용자는 명세 §4의 상세 npm 전역 설치 동작을 승인했다. 이 내용은 축약하지 않는다.
- 현재 작업공간에서 사용자가 소유한 bin/arc.mjs 실행 권한 변경(100644 → 100755)은 보존하고 T5 범위에 포함하지 않는다.
- 현재 요청은 T5 구현 계획 승인 단계다. 승인 후 실행 위치를 별도로 선택한다.

## 공통 제약

- Architectural 작업이며 이 계획도 개별 승인 대상이다.
- ARC가 역할·handoff·승인·검증·commit 흐름을 통제한다. Coder 작업은 CEO가 순차 배정한다.
- 공개 npm bin은 arc 하나다. arc-install, arc-uninstall alias는 제거한다.
- 각 플랫폼 models.toml은 version=1, preset=balanced와 정확히 다섯 역할의 economy·balanced·smart 모델을 가진다. 기존 model·effort 값은 유지한다.
- presets.toml을 제거하고 Node/Python 소비자, profile 렌더러, manifest를 같은 작업에서 맞춘다.
- backup/arc-*와 .arc-recovery-*를 생성하지 않는다. 실행 중 동일 부모의 private .arc-stage-*를 허용하고 성공 또는 rollback 후 transaction 소유 stage를 정리한다.
- descriptor 기반 안전성, 경로 정체성, symlink 제한, drift 감지와 역할 권한을 유지한다.
- --skip-global은 ~/.zshrc 변경을 건너뛴다. uninstall 후에도 공용 zsh 완성 블록을 유지한다. 구형 모델 설정 자동 변환은 제공하지 않는다.
- 기존 PC의 backup·recovery·휴지통은 삭제하지 않는다. 휴지통은 사용자가 처리한다.
- 검증은 임시 home과 fixture를 사용한다. 실제 사용자 home은 검사에 사용하지 않는다.
- 각 최상위 작업은 QA 후 CEO가 수용하고 전용 commit으로 기록한다. 각 작업 변경과 함께 MANIFEST.sha256를 갱신한다.
- 모델 schema·모든 소비자는 하나의 계약이며, transaction·stage cleanup·install/uninstall은 하나의 계약이다.

## 실행 순서

T1 → T2 → T3 → T4. T1은 모델 계약, T2는 transaction 수명, T3은 dispatcher와 shell 통합, T4는 최종 설치 흐름의 진행 표시를 맡는다. 같은 파일이 여러 작업에 속하면 계획 순서대로 편집한다.

### T1. 모델 설정 schema와 소비자 통합

**목표:** Claude와 Codex의 economy·balanced·smart 설정을 단일 models.toml로 통합한다.

**선행:** 계획 승인과 execution handoff.

**대상 수정:** lib/models/config.mjs, lib/models/index.mjs, lib/models/profiles.mjs, lib/installer/plan.mjs, lib/installer/manifest.mjs, codex/skill/models.toml, claude/skill/models.toml, codex/skill/scripts/model_config.py, codex/skill/scripts/apply-models.py, claude/skill/scripts/model_config.py, claude/skill/scripts/apply-models.py, codex/agents/arc-scouter.toml, codex/agents/arc-planner.toml, codex/agents/arc-coder.toml, codex/agents/arc-qa.toml, codex/agents/arc-reviewer.toml, claude/agents/arc-scouter.md, claude/agents/arc-planner.md, claude/agents/arc-coder.md, claude/agents/arc-qa.md, claude/agents/arc-reviewer.md, scripts/update-manifest.mjs, MANIFEST.sha256, README.md.

**대상 삭제:** codex/skill/presets.toml, claude/skill/presets.toml.

**검증 범위:** tests/node/models.test.mjs, tests/node/profile-render.test.mjs, tests/node/plan.test.mjs, tests/node/manifest.test.mjs, tests/node/install.test.mjs, tests/node/consumer.test.mjs, tests/node/legacy-parity.test.mjs, tests/node/fixtures/packed-consumer.mjs, tests/test_codex_models.py, tests/test_claude_payload.py, tests/installer-parity.json.

**계약:**

- ModelConfig는 platform, version 1, preset과 다섯 역할 각각의 economy·balanced·smart 설정을 포함한다.
- Claude 설정은 model·effort, Codex 설정은 model·model_reasoning_effort만 가진다.
- 전체 설정 validator가 비활성 preset을 포함해 누락·추가 key, 잘못된 version/preset을 거부한다.
- applyPreset은 입력을 변경하지 않고 선택 preset이 바뀐 전체 config를 반환한다.
- resolveModelSettings는 활성 preset의 다섯 역할만 renderer에 전달한다. renderer는 effective settings만 받는다.
- 설치본에는 선택한 preset과 전체 세 preset을 기록한다. 배포 원본 기본 preset은 balanced다.
- Python 도구는 동일한 전체 설정을 검증하고 활성 preset을 적용한다. 구형 role-only 파일은 profile 쓰기 전에 안내와 함께 실패한다.
- 두 models.toml만 mutable manifest 예외로 유지한다. presets.toml asset과 overlay 로더를 제거한다.

**구현 및 확인 순서:**

1. 모든 역할의 세 preset, 6개 platform/preset 조합, TOML round trip, 비활성 preset 오류, 누락/추가 key, 구형 Claude version 1과 Codex version 5 형식 거부를 검증하는 Node 테스트를 추가한다.
2. 다음으로 새 계약이 실패함을 확인한다.

       node --test tests/node/models.test.mjs tests/node/profile-render.test.mjs tests/node/plan.test.mjs

3. 원본 TOML, validator/serializer, preset 선택과 effective profile rendering을 함께 구현하고 기존 model·effort 값을 그대로 옮긴다.
4. 두 Python 도구의 apply/check/dry-run을 변경한다. 구형/잘못된 config는 profile 변경 전에 실패해야 한다.
5. presets.toml 필수 asset·payload 입력을 제거하고 README, parity fixture, packed consumer를 갱신한다.
6. manifest 생성 후 아래 검사를 실행한다.

       node scripts/update-manifest.mjs
       node --test tests/node/models.test.mjs tests/node/profile-render.test.mjs tests/node/plan.test.mjs tests/node/manifest.test.mjs tests/node/install.test.mjs tests/node/consumer.test.mjs tests/node/legacy-parity.test.mjs
       python3 -m unittest discover -s tests -p 'test_codex_models.py'
       python3 -m unittest discover -s tests -p 'test_claude_payload.py'
       npm run check:manifest

**수용 기준과 QA:** 명세 C2 전체. QA는 6개 조합의 profile 값, 양 Python 도구의 적용·check·dry-run, invalid/legacy 입력의 무변경 실패, manifest와 packed consumer를 확인한다.

**보류:** 새 model 값 선택 요구, 역할 권한 변경 요구, 일부 consumer의 구형 schema 유지, 필수 검사 수행 불가 또는 실패.

**commit:** feat(models): 역할별 프리셋 설정을 단일 파일로 통합

### T2. 설치·제거 transaction과 임시 stage 수명

**목표:** 영구 backup/recovery와 stale-stage 이동을 제거하고 rollback·정리·결과 보고를 변경한다.

**선행:** T1 수용 및 commit.

**대상 신규:** lib/installer/stage-cleanup.mjs.

**대상 수정:** lib/installer/transaction.mjs, lib/installer/plan.mjs, lib/installer/install.mjs, lib/installer/uninstall.mjs, lib/installer/acquisition.mjs, lib/cli/index.mjs, lib/cli/uninstall.mjs, README.md, MANIFEST.sha256.

**대상 삭제:** lib/installer/recovery.mjs.

**검증 범위:** tests/node/transaction.test.mjs, tests/node/transaction-drift.test.mjs, tests/node/transaction-readonly.test.mjs, tests/node/recovery.test.mjs, tests/node/install.test.mjs, tests/node/uninstall.test.mjs, tests/node/all-targets.test.mjs, tests/node/acquisition.test.mjs, tests/node/cli.test.mjs, tests/node/uninstall-cli.test.mjs, tests/node/consumer.test.mjs, tests/node/fixtures/packed-consumer.mjs.

**계약:**

- transaction 결과는 actionLog, installedSnapshot, residualPaths, cleanupError를 쓴다. backupRoot/backupPath/recoveryPaths를 제거한다.
- install·uninstall 결과도 residualPaths를 보고하며 target별 성공·실패·미실행 상태를 구분한다.
- cleanup helper는 transaction 소유 parent/stage descriptor, 정체성과 예상 항목만 다룬다. stage 밖을 순회하지 않는다.
- 정상 성공과 완료된 rollback 후 소유 stage가 남지 않는다. 외부 변경·unknown 항목은 안전하게 삭제하지 않고 경로를 보고한다.
- 성공 cleanup에서 이전 원본 제거가 시작된 뒤 cleanup 실패 시 새 설치 상태를 유지하고 비정상 결과로 보고한다. 복원했다고 표시하거나 rollback에 재진입하지 않는다.
- 과거 stage를 자동 이동하거나 삭제하지 않는다.

**구현 및 확인 순서:**

1. 성공에서 backup/recovery/owned stage 부재, preserve/publish 오류에서 원본 복구, 취소·rollback stage 정리, 원본 삭제 시작 후 cleanup 오류 보고를 검사한다. unknown stage entry, symlink, parent 교체, drift, stale path와 target all 부분 성공도 다룬다.
2. 기존 구현이 새 계약을 위반하는 RED를 확인한다.

       node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/recovery.test.mjs

3. 영구 backup 생성·복제, 성공 후 recovery 이동, install/uninstall stale recovery 경로를 제거한다. 기존 prepare/previous/rollback staging과 no-replace rename은 유지한다.
4. held descriptor로 예상 항목과 정체성을 반복 확인하는 stage cleanup을 구현한다. 자식부터 정리하고 symlink를 따라가지 않는다. 무조건 재귀 삭제를 사용하지 않는다. unknown item, identity mismatch, unsafe type이면 보존하고 오류·residual path를 반환한다.
5. 모든 publish·namespace 확인 전 오류는 역순 rollback한다. rollback 완료 후 owned stage를 정리한다. 성공 정리에서 원본 제거를 시작한 뒤의 실패는 새 설치 결과와 cleanup 오류를 함께 보고한다.
6. install/uninstall/acquisition/CLI의 경로 결과를 residualPaths로 통일한다. 정상 결과에 Backup/Recovery 안내를 출력하지 않고, 잔여물이 있을 때만 Residual path와 오류를 출력한다.
7. manifest와 아래 집중 검사를 확인한다.

       node scripts/update-manifest.mjs
       node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/transaction-readonly.test.mjs tests/node/recovery.test.mjs tests/node/install.test.mjs tests/node/uninstall.test.mjs tests/node/all-targets.test.mjs tests/node/acquisition.test.mjs tests/node/cli.test.mjs tests/node/uninstall-cli.test.mjs tests/node/consumer.test.mjs
       npm run check:manifest

**수용 기준과 QA:** 명세 C3 전체. fresh QA는 fault matrix, owned-stage 경계, drift·symlink·parent 교체, all-target 부분 성공과 임시 filesystem 복구를 확인한다. 정상/rollback 완료 후 잔여 stage는 0개여야 한다. 실패 시 외부 자료를 보존하고 보고 경로를 확인한다.

**보류:** unknown stage를 무조건 지워야 함, cleanup 후 rollback으로 잘못 보고, safe-fs 검증 약화, 과거 자료 자동 삭제/crash recovery 재도입, 복구 matrix 실패.

**commit:** refactor(installer): 영구 백업 없이 임시 작업 자료 정리

### T3. 단일 CLI와 zsh·bash 완성

**목표:** 공개 명령을 arc 하나로 통합하고 zsh 자동 등록과 bash 완성을 제공한다.

**선행:** T2 수용 및 commit.

**대상 신규:** bin/arc.mjs, lib/cli/root.mjs, lib/cli/completion.mjs, lib/installer/shell-completion.mjs, tests/node/completion.test.mjs, tests/node/shell-completion.test.mjs.

**대상 삭제:** bin/arc-install.mjs, bin/arc-uninstall.mjs.

**대상 수정:** package.json, package-lock.json, install.command, lib/cli/index.mjs, lib/cli/uninstall.mjs, lib/installer/manifest.mjs, README.md, codex/skill/SKILL.md, MANIFEST.sha256, tests/node/package.test.mjs, tests/node/cli.test.mjs, tests/node/cli-dry-run.test.mjs, tests/node/cli-pty.test.mjs, tests/node/uninstall-cli.test.mjs, tests/node/uninstall-pty.test.mjs, tests/node/consumer.test.mjs, tests/node/fixtures/packed-consumer.mjs, tests/node/manifest.test.mjs.

**계약:**

- root help/version/completion은 native loader/installer import 전에 실행하며 install/uninstall은 해당 CLI로 지연 dispatch한다.
- completion renderer는 zsh/bash script만 출력한다. 완료 실행은 install·network·native runtime 부작용이 없어야 한다.
- package.json과 package-lock.json의 공개 bin은 `{ "arc": "bin/arc.mjs" }`로 일치해야 한다. README와 Codex skill의 npx 설치 예시는 `arc install` 하위 명령을 포함하며, packed root dispatcher가 그 인수를 실제 install CLI로 전달한다.
- .zshrc 관리 block의 바깥 bytes와 newline을 보존한다. 재설치는 멱등적이다. 중복/역순 marker, symlink, permission, drift는 변경 전에 실패한다.
- 설치 시 공용 .zshrc 변경은 첫 plan에 한 번만 붙인다. target overlap 검사 완화 금지.
- --skip-global/check/dry-run은 .zshrc를 변경하지 않는다. uninstall은 공용 completion block을 유지한다.

**구현 및 확인 순서:**

1. root 명령, 종료 코드, 인수 전달, package와 lockfile의 단일 bin, 위치별 completion 후보를 검사한다. README/Codex skill npx 설치 예시에 `install`이 포함되고, packed root에 `install --target codex --preset balanced --check`를 전달하면 성공하며 구형 flags-only 호출은 exit 2인지 확인한다. arc의 root 후보는 install/uninstall/completion, target은 claude/codex/all, preset은 economy/balanced/smart, completion shell은 zsh/bash다.
2. .zshrc 없음, 사용자 내용, CRLF, 마지막 newline 부재, 재설치, marker 오류, symlink, 권한, drift를 검사한다. all target은 단일 변경이어야 한다.
3. 신규 계약의 RED를 확인한다.

       node --test tests/node/completion.test.mjs tests/node/shell-completion.test.mjs tests/node/package.test.mjs tests/node/cli.test.mjs

4. dispatcher, help/version, subcommand dispatch와 zsh/bash 후보를 구현한다. install.command를 새 진입점으로 바꾼다.
5. .zshrc 관리 블록을 첫 install plan의 snapshot/global change/managed path에 통합하고 T2 transaction으로 적용한다. 첫 target 실패는 block까지 rollback한다. 첫 target 성공 후 다음 target 실패는 공용 block을 유지한다.
6. 임시 home과 fake PATH에서 실제 zsh·bash shell 완성을 확인한다. zsh compinit 전/후와 interactive PTY Tab, bash completion 후보를 실행한다. 문자열 내 후보만 확인하지 않는다.
7. 문서를 갱신하고 다음 검사를 확인한다.

       node scripts/update-manifest.mjs
       node --test tests/node/completion.test.mjs tests/node/shell-completion.test.mjs tests/node/package.test.mjs tests/node/cli.test.mjs tests/node/cli-dry-run.test.mjs tests/node/cli-pty.test.mjs tests/node/uninstall-cli.test.mjs tests/node/uninstall-pty.test.mjs tests/node/consumer.test.mjs tests/node/manifest.test.mjs
       npm run check:manifest

**수용 기준과 QA:** 명세 C1 전체. fresh QA는 실제 zsh Tab 및 bash 후보, block 멱등성·사용자 bytes 보존, all-target 단일 소유, shell 변경 rollback, packed bin을 확인한다.

**보류:** zsh/bash 실행 환경 없음, symlink를 따라 쓰는 안전성 완화, overlap 검사 예외, transaction 밖 비가역 shell 변경, 승인된 skip-global/uninstall 계약 변경.

**commit:** feat(cli): arc 하위 명령과 셸 자동 완성 제공

### T4. 설치 진행 표시

**목표:** 마지막 선택 직후 진행 표시를 시작하고 모든 종료 경로에서 timer/listener를 정리한다.

**선행:** T3 수용 및 commit.

**대상 신규:** lib/cli/progress.mjs, tests/node/progress.test.mjs.

**대상 수정:** lib/cli/index.mjs, README.md, MANIFEST.sha256, tests/node/cli.test.mjs, tests/node/cli-pty.test.mjs, tests/node/cli-dry-run.test.mjs.

**계약:** startProgress는 즉시 label을 출력하고 write/멱등 stop을 제공한다. TTY는 한 줄 frame을 갱신한다. non-TTY는 ANSI 없이 label을 한 번 출력한다. fake timer는 테스트에서 주입하고 CLI 옵션으로 노출하지 않는다.

**구현 및 확인 순서:**

1. fake timer로 즉시 label, TTY 갱신, non-TTY ANSI 부재, stop 멱등성, timer 정리와 최종 메시지 보존을 검사한다. 대화형 메뉴 동안에는 진행 문구가 없고 마지막 선택 뒤 acquisition 완료 전에 보여야 한다. payload 검사, acquisition 실패/취소, transaction 실패/cleanup 오류, check/dry-run을 포함한다.
2. RED를 확인한다.

       node --test tests/node/progress.test.mjs tests/node/cli-pty.test.mjs

3. 대화형 선택 완료 직후 또는 비대화형 옵션 검증 후, native loader/payload/plan/acquisition 전에 표시한다. 설치는 Installing ARC…, check는 Checking ARC…, dry-run은 Preparing ARC dry run…을 사용한다.
4. 성공·오류·취소 전에 stop하고 최상위 finally에서도 정리한다. 일반 출력은 frame과 충돌하지 않도록 progress.write를 사용한다. SIGINT listener와 timer가 남지 않게 한다.
5. 긴 sleep 없이 제어 가능한 acquisition barrier와 fake timer로 PTY/non-TTY, 출력 순서와 종료 경로를 확인한다. 동기 transaction 도중 frame 정지는 허용한다. manifest와 다음 검사를 확인한다.

       node scripts/update-manifest.mjs
       node --test tests/node/progress.test.mjs tests/node/cli.test.mjs tests/node/cli-pty.test.mjs tests/node/cli-dry-run.test.mjs
       npm run check:manifest

**수용 기준과 QA:** 명세 C4 전체. fresh QA는 마지막 선택 이후 출력, 대기 중 frame, non-TTY ANSI 부재, success/error/SIGINT 종료 후 timer·listener, status와 오류 메시지를 확인한다.

**보류:** transaction 전반의 연속 animation, worker/async transaction 필요, 최종 메시지 손실, 취소 모호성 또는 종료 뒤 listener.

**commit:** feat(cli): 설치 선택 완료 후 진행 상태 표시

## 최종 전체 검증

**시점:** T1–T4의 task-local 검사, 필요한 QA, CEO 수용과 개별 commit 완료 후. 마지막 검증은 독립 task 수용을 미루지 않는다.

1. node 전체 검사: npm test
2. Python 전체 검사: python3 -m unittest discover -s tests -p 'test_*.py'
3. manifest 검사: npm run check:manifest
4. 임시 home/fixture의 최종 흐름: packed arc help/version/completion, platform×preset 설치, target all 설치·재설치·제거, .zshrc 단일 등록과 uninstall 후 유지, 정상·rollback stage 정리, 실제 shell 후보, TTY/non-TTY 진행, 실패·취소·cleanup 오류의 status/residual path/최종 결과.
5. 최종 Git 범위: 네 task commit이 계획 경계와 일치하고, 휴지통·무관 파일·역할 권한이 바뀌지 않으며, 구형 명령·overlay dependency·persistent recovery 안내가 남지 않는지 확인한다.
6. 네 task가 각각 수용된 후 전체 diff를 대상으로 독립 Reviewer가 한 번 검토한다. 데이터 손실/stage 정리, cleanup 이후 실패, shell 파일 보존, 전체/effective model 혼용, package/manifest 누락을 본다. 수정 후 영향 범위 QA를 재실행하고 새로운 scope는 승인 문서를 바꿔 재승인한다.

tests/node/live-upstream.mjs와 실제 사용자 home·휴지통 변경은 자동 검증에서 제외한다.

## 수용·실행 준비

CEO는 criterion을 실제 evidence와 연결해 task별 수용 여부를 정하고, 필요한 fresh QA를 완료한 다음 한 commit을 만든다. PASS·checkbox·Coder 보고만으로 proven 판정을 하지 않는다. 최종 Reviewer는 네 task 수용 이후 한 번 수행하며 task acceptance 전제조건이 아니다.

계획 승인 전에는 execution target 선택, branch/worktree 준비, 계획 문서 staging/commit, Coder 시작을 하지 않는다. 계획 승인 후 CEO는 execution target, Git 상태·변경 소유권, 문서 승인과 common handoff gate를 확인하고 각 task를 새 Coder에게 순차 handoff한다.

## 자체 검토

- 명세 C1→T3, C2→T1, C3→T2, C4→T4로 모든 요구를 연결했다.
- model schema·Node/Python consumers·profiles·manifest는 T1에, transaction·stage cleanup·install/uninstall/acquisition은 T2에 묶었다.
- T3 공용 .zshrc는 한 plan에서만 소유하고 target overlap 검사를 유지한다.
- T4는 마지막 선택과 첫 비동기 작업 사이에 표시를 시작한다.
- 작업별 QA와 최종 전체 검사, 마지막 독립 Reviewer timing을 구분했다.
- 임시 home 검증과 휴지통 미변경을 명시했다.
- 계획 수준에서 남은 설계 질문은 없다. 실제 shell/native 환경 검사를 못 하면 해당 criterion을 unverified로 남기고 task acceptance를 보류한다.

## T5. 전역 npm 완성 등록과 README 전체 정리

### 목표와 범위

전역 npm 설치가 지원되는 zsh 사용자 환경에서 완성을 자동 등록하고, README 전체를 실제 동작에 맞게 명확하고 간결하게 정리한다. README의 기존 영어와 기술적 의미를 유지하면서 중복, 모호함, 용어·명령 불일치, 오래된 설명을 바로잡는다. Shell completion 절만 편집하는 것으로 범위를 제한하지 않는다.

기존 T1–T4의 승인된 구현과 명세 §4를 전제로 한다. T1–T4 구현·commit은 완료됐으며 이 후속 작업에서 다시 수행하거나 합치지 않는다. 명세 §4 자체는 변경하지 않는다.

### 공통 제약

- npm 전역 lifecycle과 최종 전역 패키지 위치가 확인된 경우에만 자동 등록을 고려한다.
- 로컬 dependency, 저장소 개발 설치, npx 임시 설치, Git 설치 준비 checkout은 사용자 home dotfile에 접근하거나 이를 바꾸지 않는다.
- 일반 사용자 zsh 환경만 지원한다. bash, 불명확한 사용자·shell·경로, 별도 ZDOTDIR, root·상승 권한에서는 등록을 건너뛴다.
- 조건을 확인하기 전에 native runtime을 불러오거나 home dotfile을 읽지 않는다.
- 기존 marker, UTF-8 검증, 사용자 bytes와 mode 보존, symlink·drift 보호, descriptor transaction과 rollback을 유지한다.
- 등록 실패가 npm 패키지 설치를 실패시키지 않게 한다. 영구 backup/recovery 파일, native build hook, uninstall hook, 새 runtime dependency를 추가하지 않는다.
- 검증은 격리된 home, npm prefix, cache, fixture를 사용한다.
- README 이외 문서의 포괄적인 문장 정리는 범위에 넣지 않는다. README 문구 assertion은 의미와 계약을 검사하도록 조정하되 기존 기술 검사를 약화하지 않는다.

### 대상 파일

| 구분 | 파일 | 책임 |
|---|---|---|
| 신규 | scripts/npm-postinstall.mjs | postinstall 진입점과 오류 경계 |
| 신규 | lib/installer/npm-completion.mjs | 자동 등록 조건과 실행 조정 |
| 신규 | tests/node/npm-completion.test.mjs | 환경 경계, 등록 결과, 실패 처리 |
| 신규 | tests/node/npm-completion-consumer.test.mjs | 격리된 실제 npm 설치와 새 zsh 완성 |
| 수정 | package.json | postinstall 선언 |
| 수정 | package-lock.json | lifecycle metadata 동기화 |
| 수정 | lib/installer/shell-completion.mjs | 완성 전용 등록 진입점 |
| 수정 | lib/installer/transaction.mjs | 선택적 specs 입력 지원 |
| 수정 | tests/node/package.test.mjs | hook, 포장, README 계약 |
| 수정 | tests/node/shell-completion.test.mjs | 완성 전용 transaction 안전성 |
| 수정 | README.md | 전체 절 명확성·간결성·정확성 |
| 수정 | MANIFEST.sha256 | 보호 payload hash |

이 목록 외 구현 파일이나 native API 변경이 필요하면 CEO에게 보고하고 작업을 멈춘다.

### 구현 결정

- getNpmCompletionContext({env, platform, packageRoot, uid, home})는 eligible과 userHome 또는 안전한 제외 사유를 반환한다. 전역 여부와 최종 설치 위치, 지원 플랫폼, SHELL, 사용자 정체성·home, ZDOTDIR를 판별한다. npm_config_global_prefix를 우선하고, 없으면 절대 경로 npm_config_prefix를 사용한다. Git 준비 checkout을 전역 설치로 오인하지 않는다.
- registerShellCompletion(userHome, {safeFs, hooks})는 기존 attachShellCompletion 경로로 완성 전용 plan을 실행한다. 무변경, 성공, 실패 결과를 구분하고 기존 안전 오류·rollback·residual 정보를 보존한다.
- runNpmCompletionPostinstall({env, platform, packageRoot, uid, home, register, stderr})는 안전 조건을 확인한 다음에만 runtime과 등록 구현을 준비한다. 제외·등록·무변경·실패 상태를 진단하며 실패해도 hook 종료는 성공으로 유지한다.
- applyTransaction(plan, {safeFs, acquired, signal, hooks, specs})는 specs 생략 시 기존 install/uninstall 동작을 유지하고, 완성 등록에서는 .zshrc 하나의 명시 입력만 적용한다. 기존 snapshot·publish·rollback·stage cleanup을 사용하며 uninstallSpecs에 완성을 넣지 않는다.
- package.json lifecycle은 다음 postinstall 하나만 추가한다. preinstall, install, prepare, native build, npm uninstall hook은 추가하지 않는다.

    postinstall: node scripts/npm-postinstall.mjs

### 구현 및 확인 순서

1. 환경 경계 테스트를 추가한다: 지원되는 전역 zsh, 로컬·개발·npx 설치, 전역 설정을 상속한 Git 준비 checkout, 불명확한 prefix, 비-zsh 또는 빈 SHELL, 별도 ZDOTDIR, root·상승 권한. 제외 경로에서는 등록 함수 호출과 dotfile 접근이 없어야 한다.
2. 등록 및 파일 보존 테스트를 추가한다: 파일 없음, 사용자 내용, BOM, CRLF, 마지막 newline 부재, mode, 재등록, 기존 arc install과 조합. 동일한 파일에서는 쓰기와 stage 생성을 생략한다.
3. 실패 테스트를 추가한다: invalid UTF-8, marker 오류, symlink, 비정상 파일, 읽기 전용, native 실패, publish 전 drift, 동시 최초 등록, publish 후 rollback. 사용자 변경을 덮어쓰지 않으며 등록 실패만으로 hook이 nonzero 종료하지 않아야 한다.
4. 신규 테스트의 RED를 확인한 후 인터페이스를 구현한다. package의 lifecycle 금지 검사는 정확한 postinstall 허용 조건으로 바꾸고 다른 install lifecycle과 native build hook 금지는 유지한다.
5. 격리된 home·prefix·cache에서 packed package의 실제 전역 설치, 로컬 설치, scripts 비활성화, 재설치, npm 제거를 검사한다. 임시 local Git fixture를 사용해 설치 준비 경로와 최종 전역 설치를 구분한다.
6. 새 interactive zsh PTY에서 시작 파일을 읽고 PATH에서 설치된 arc를 찾은 뒤 실제 Tab으로 install, uninstall, completion 후보를 확인한다. zsh -f나 문자열 검사만으로 대체하지 않는다.
7. README의 Roles, Task flow와 하위 절, Installation과 하위 절, Model settings, Development, Learn more, Shell completion 및 나머지 기존 절을 모두 점검한다. 절별로 수정 또는 유지 이유를 기록하고 명령 예시를 실제 공개 CLI에 대조한다.
8. README에서 전역 npm 명령 설치와 arc install의 역할, 전역 설치 없는 npx 사용법, 개발용 local dependency를 구분한다. 자동 등록 조건·예외, 현재 세션 명령, 실패·출력·skip·제거 계약도 명확히 설명한다.
9. 문구에 종속된 검사는 확인하려는 동작 계약을 유지하는 의미 중심 검사로 고친다. manifest를 갱신하고 아래 검사를 실행한다.

    node --test tests/node/npm-completion.test.mjs tests/node/shell-completion.test.mjs tests/node/completion.test.mjs
    node --test tests/node/npm-completion-consumer.test.mjs tests/node/package.test.mjs
    node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/recovery.test.mjs tests/node/transaction-readonly.test.mjs
    node --test tests/node/cli-dry-run.test.mjs tests/node/uninstall.test.mjs
    node scripts/update-manifest.mjs
    npm run check:manifest

### 수용 기준

| ID | 기준 |
|---|---|
| C1 | 지원되는 일반 zsh 사용자 환경의 실제 전역 npm 설치 후 관리 블록 하나가 등록되고 새 interactive zsh의 Tab이 세 하위 명령을 제공한다. |
| C2 | 로컬·개발·npx 임시 설치와 Git 준비 checkout은 home dotfile에 접근하거나 이를 변경하지 않는다. |
| C3 | 재설치와 기존 arc install 조합은 멱등적이고 사용자 bytes·mode를 보존한다. marker·UTF-8·경로·권한·drift 오류를 안전하게 처리한다. |
| C4 | 기존 explicit install·skip/check/dry-run·제거 계약과 stage 정리를 유지하고 영구 backup/recovery 파일을 추가하지 않는다. |
| C5 | 미지원 환경, scripts 차단, runtime 또는 등록 실패를 승인 명세대로 처리한다. 등록 실패만으로 npm 설치를 실패시키지 않는다. |
| R1 | README의 모든 절을 점검한다. 영어와 기술적 의미를 유지하고 중복·모호함·불일치·오래된 설명을 정리한다. 절별 수정·유지 근거를 제시한다. |
| R2 | 전역 명령 설치, arc install 설정 적용, 전역 설치 없는 npx 실행, 개발용 로컬 설치를 구분하고 예시를 공개 CLI와 일치시킨다. |
| R3 | 자동 등록 조건과 비-zsh·불명확한 shell·별도 ZDOTDIR·권한·runtime 예외 및 --ignore-scripts 영향을 설명한다. |
| R4 | 새 세션 적용 조건, 현재 세션의 eval 명령, zsh 수동 영구 활성화와 bash 수동 등록을 안내한다. |
| R5 | 등록 실패가 npm 설치를 실패시키지 않고 hook 출력이 숨겨질 수 있음을 설명하며 --foreground-scripts 진단 방법을 제공한다. |
| R6 | --skip-global의 범위, arc uninstall과 npm 제거 후 블록 유지, npm 제거 시 자동 정리 없음, 기존 check/dry-run 계약을 명시한다. |
| R7 | transaction 및 파일 안전 계약을 문장 정리 과정에서 왜곡하거나 삭제하지 않는다. 기존 기술 assertion의 검증력을 유지한다. |

### 필수 QA 증거

신선한 QA는 C1–C5 및 R1–R7을 독립 확인한다. 보고에는 Node/npm/zsh 버전, 실제 격리 설치·제거 명령과 종료 코드, 새 zsh PTY Tab 출력, block 개수, 재설치 전후 bytes·mode, stage 정리, 실패·복구 결과를 포함한다. README는 절별 점검표와 R2–R7 각각에 대응하는 문서 위치·구현·검사 근거를 제출한다. 실제 GitHub URL이 후보 변경을 포함하지 않으면 local fixture 검사로 구분하고 원격 검증을 주장하지 않는다.

### 보류 조건

전역 설치와 최종 패키지 위치를 안정적으로 구분할 수 없음, 실제 npm과 zsh PTY 검증 환경 부재, descriptor 보호나 승인 계약 완화 필요, native API·영구 복구 파일 필요, README에서 승인 명세와 실질 충돌 발견, 사용자 파일 보존을 입증할 수 없음 중 하나라도 있으면 CEO에게 보고한다.

### 수용과 commit

CEO는 C1–C5, R1–R7, 필수 검사와 QA 발견 사항을 확인해 T5를 수용한다. 수용 후 하나의 구현 commit으로 기록한다.

    feat: 전역 npm 설치에 zsh 완성 등록 및 README 정리

기존 bin/arc.mjs 사용자 소유 mode 변경은 보존하고 T5 구현 commit에 포함하지 않는다. commit에 앞서 사용자의 별도 승인을 다시 요청하지 않는다.

## T5 이후 전체 검증과 실행 준비

T1–T4는 현재 기준에 이미 포함된 작업이다. T5 수용 후 npm test, 전체 Python unittest, npm run check:manifest와 격리된 전역 npm 설치·zsh Tab 흐름을 최종 검증한다. 모든 승인 작업 수용 후 독립 Reviewer가 전체 변경을 한 번 검토한다. README 전체 정리, 명세 §4, package lifecycle, 사용자 파일 보존, transaction cleanup을 포함한다.

T5 계획 승인 전에는 실행 위치 선택, branch/worktree 준비, 문서 commit, Coder 시작을 하지 않는다. 승인 후 사용자가 실행 위치를 선택하면, CEO는 Git 상태와 변경 소유권 및 문서 승인 상태를 확인하고 우선 승인된 spec/plan 문서만 commit한 뒤 fresh Coder에게 T5를 배정한다. 사용자 소유 mode 변경은 해당 문서 commit에서 제외한다.
