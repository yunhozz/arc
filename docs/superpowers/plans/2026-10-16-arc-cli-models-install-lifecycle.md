# ARC 명령·모델 설정·설치 수명주기 통합 구현 계획

## 목표와 승인 문서

ARC에 단일 arc 명령, shell 완성, 통합 모델 설정, 영구 백업 없는 설치·제거, 설치 진행 표시를 제공한다.

- 승인 명세: /Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-16-arc-cli-models-install-lifecycle-design.md (사용자 승인, 2026-10-16)
- 저장 경로: /Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-16-arc-cli-models-install-lifecycle.md
- 저장소: /Users/yunho/Desktop/project/arc
- 기준: master, 460975714ad5f6cb48c17a674a497fdd93917d9c. 승인 명세 외 변경은 없다.

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

**대상 수정:** package.json, install.command, lib/cli/index.mjs, lib/cli/uninstall.mjs, lib/installer/manifest.mjs, README.md, MANIFEST.sha256, tests/node/package.test.mjs, tests/node/cli.test.mjs, tests/node/cli-dry-run.test.mjs, tests/node/cli-pty.test.mjs, tests/node/uninstall-cli.test.mjs, tests/node/uninstall-pty.test.mjs, tests/node/consumer.test.mjs, tests/node/fixtures/packed-consumer.mjs, tests/node/manifest.test.mjs.

**계약:**

- root help/version/completion은 native loader/installer import 전에 실행하며 install/uninstall은 해당 CLI로 지연 dispatch한다.
- completion renderer는 zsh/bash script만 출력한다. 완료 실행은 install·network·native runtime 부작용이 없어야 한다.
- .zshrc 관리 block의 바깥 bytes와 newline을 보존한다. 재설치는 멱등적이다. 중복/역순 marker, symlink, permission, drift는 변경 전에 실패한다.
- 설치 시 공용 .zshrc 변경은 첫 plan에 한 번만 붙인다. target overlap 검사 완화 금지.
- --skip-global/check/dry-run은 .zshrc를 변경하지 않는다. uninstall은 공용 completion block을 유지한다.

**구현 및 확인 순서:**

1. root 명령, 종료 코드, 인수 전달, package bin 하나, 위치별 completion 후보를 검사한다. arc의 root 후보는 install/uninstall/completion, target은 claude/codex/all, preset은 economy/balanced/smart, completion shell은 zsh/bash다.
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
