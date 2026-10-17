# ARC 설치 시 에이전트 한도 설정 실행 계획

> **에이전트 실행 지침:** `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`의 실행 요청은 기존 ARC Orchestrator 조정 방식으로 적용한다. 새 역할이나 위임 계층을 추가하지 않는다. 체크박스는 진행 기록이며 별도 커밋 단위가 아니다.

**목표:** 설치 시 누적 생성 한도 기본값 `100`과 동시 실행 한도 기본값 `5`를 입력·보존하고, ARC 정책과 지원되는 플랫폼 네이티브 동시성 설정에 반영한다.

**구조:** 먼저 부작용 없는 한도 처리·설정 병합 함수를 구현한다. 그다음 CLI, 설치 트랜잭션, 정책 payload를 하나의 동작 단위로 연결한다. 누적 사용량은 Orchestrator의 prompt-level 장부로 관리한다.

**기술:** Node.js ≥22, ESM, 기존 TOML parser·safe-fs·설치 transaction, Node test runner, 기존 Python 정책 검사.

**승인된 명세:** [2026-10-17-subagent-limits-install-design.md](/Users/yunho/Desktop/project/arc/docs/superpowers/specs/2026-10-17-subagent-limits-install-design.md)

## 공통 제약

- `--max-total-subagents` 기본값은 `100`, `--max-concurrent-subagents` 기본값은 `5`다.
- 한도는 루트를 제외한 하나의 ARC coordination tree/session에 적용한다.
- 누적 한도는 완료된 인스턴스와 자손을 포함하는 고유 인스턴스 수다.
- 누적 한도와 ARC 스케줄링은 prompt-level이다. 하드 spawn 제한을 추가하지 않는다.
- Codex 네이티브 키는 `[agents].max_concurrent_threads_per_session`이다.
- Claude 네이티브 키는 `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`이며 문자열로 저장한다.
- 독립 세션·플랫폼 간 합계 제한, Agent Teams·hosted API 관리는 범위 밖이다.
- 기존 역할·freshness·동일 파일 편집 금지·QA·승인 규칙을 유지한다.
- 설정값은 새 세션부터 적용한다. 설치로 실행 중 예산을 초기화하지 않는다.
- 관련 없는 사용자 설정과 기존 미추적 문서를 보존한다.
- `docs/superpowers/specs/2026-10-17-superpowers-internal-references-design.md`와 `docs/superpowers/plans/2026-10-17-superpowers-internal-references-plan.md`는 수정·스테이징하지 않는다.
- 실행 중인 설치 ARC에는 현재 설치된 정책을 적용한다. 이번 변경의 동시 `5`를 현재 실행에 소급 적용하지 않는다.

## 집중 확인할 실패 조건

| 조건 | 기대 동작 | 담당 |
|---|---|---|
| 유효한 TOML이지만 대상 키를 안전하게 수정할 수 없는 표현 | 다른 키를 손상시키지 않고 실패 | T1 |
| JSON root/`env`가 object가 아니거나 모호함 | 강제 치환 없이 실패 | T1 |
| 재설치 중 네이티브 키만 사용자가 변경 | 생략 옵션으로 덮어쓰지 않고 충돌 보고 | T2 |
| TTY 기본값을 표시한 뒤 다른 프로세스가 설정 변경 | 표시했던 값을 믿고 덮어쓰지 않고 drift 감지 | T2 |
| 생성 결과 불명·완료·동일 인스턴스 재개·압축 | 예약·누적·활성 수를 구분하고 예산 초기화 금지 | T2 |

각 항목은 아래 담당 작업의 검사에 포함한다.

## 실행 준비와 작업 관계

계획 승인 전에는 Coder 작업이나 실행 checkout 준비를 시작하지 않는다. 승인 후 Orchestrator가 다음을 완료한다.

- 승인된 명세·계획 버전과 승인 증거를 canonical handoff record에 기록한다.
- 실행 target 선택과 필요한 문서 준비를 기존 ARC 게이트에 따라 완료한다.
- 현재 branch/HEAD, 사용자 변경, 미추적 파일을 다시 확인한다.
- 플랫폼 공식 근거에서 네이티브 설정 키·지원 범위·카운트 의미를 기록한다. 실제 적용 검증과 문서 근거를 구분한다.
- 각 작업의 파일 소유권·입출력·필수 검사·ready/held 상태를 기록한다.

의존성은 **T1 → T2**다. T2는 T1 인터페이스와 수용된 커밋에 의존한다. 두 작업은 `MANIFEST.sha256` 등 공유 파일도 사용하므로 병렬 실행하지 않는다. 초기 ready 작업은 T1뿐이다.

각 작업은 **하나의 집중 구현 커밋**이다. Orchestrator가 필요한 QA와 증거를 확인하고 수용한 뒤 별도의 사용자 커밋 승인 없이 커밋한다. 작업 완료 보고나 검사 통과만으로 다음 작업을 해제하지 않는다.

## T1 — 한도 처리와 네이티브 설정 병합 기반

**목표:** 현재 설치 동작을 바꾸지 않고, 입력값·영속 한도·플랫폼별 동시성 병합을 독립적으로 검증할 수 있는 순수 함수를 제공한다.

**선행 작업:** 실행 준비 완료. 다른 구현 작업 의존성 없음.

**파일 소유권**

생성:

- `lib/limits.mjs`: 기본값, 숫자 검증, 정책값 해석.
- `lib/installer/limits.mjs`: `limits.toml` 파싱·직렬화.
- `lib/installer/runtime-config.mjs`: 네이티브 동시성 읽기·병합.
- `tests/node/limits.test.mjs`
- `tests/node/runtime-config.test.mjs`

수정:

- `lib/installer/manifest.mjs`: 새 필수 런타임 모듈 누락 검증.
- `tests/node/manifest.test.mjs`: 새 필수 파일 누락 사례.
- `MANIFEST.sha256`: 정상 생성 절차의 결과.

기존 `global-config.mjs`의 wait·instruction 동작은 이 작업에서 바꾸지 않는다.

**인터페이스**

`Limits`는 다음 숫자 필드를 가진다.

- `version: 1`
- `max_total_subagents: number`
- `max_concurrent_subagents: number`

제공할 함수:

- `parsePositiveLimit(raw: string, label: string): number`
- `resolveLimits({existing: Limits|null, overrides: object}): Limits`
- `parseLimits(bytes: Buffer): Limits`
- `serializeLimits(limits: Limits): Buffer`
- `readRuntimeConcurrency(platform: "codex"|"claude", original: Buffer|null): number|null`
- `renderCodexConcurrency(original: Buffer|null, value: number): {content: Buffer, action: string, notes?: string[]}`
- `renderClaudeConcurrency(original: Buffer|null, value: number): {content: Buffer, action: string, notes?: string[]}`

`lib/limits.mjs`는 filesystem·native loader·TOML vendor를 import하지 않는다. CLI help/version의 가벼운 실행 경로를 유지한다. 영속 parser만 기존 TOML parser를 사용한다.

`resolveLimits`는 명시값 → 기존값 → 기본값 순서로 해석한다. 명시성 여부와 재설치 충돌 판정은 T2에서 관리한다.

### 진행

- [ ] **1. 한도 입력과 영속 형식의 실패 검사를 작성한다.**

  대표 assertion:

  ```js
  assert.equal(parsePositiveLimit(' 100 ', 'total'), 100);
  assert.deepEqual(resolveLimits({existing: null, overrides: {}}), {
    version: 1,
    max_total_subagents: 100,
    max_concurrent_subagents: 5,
  });
  ```

  `0`, 음수, 소수, 지수·부호·비 ASCII 숫자, 빈 값, 안전 정수 초과를 거절한다. 기존값 보존, 부분 override, 동시값이 누적값보다 큰 유효 조합, 직렬화 round-trip, 잘못된 UTF-8·버전·필드 타입을 검사한다.

- [ ] **2. 실패를 확인한 뒤 `lib/limits.mjs`와 `lib/installer/limits.mjs`를 구현한다.**

  `node --test tests/node/limits.test.mjs`에서 초기 실패와 구현 후 통과 증거를 남긴다. `limits.toml`에 실행 사용량을 넣지 않는다.

- [ ] **3. 네이티브 병합의 실패 검사를 작성한다.**

  Codex: 빈 파일, 기존 `[agents]`, 다른 역할·주석·CRLF·마지막 newline 부재, 중복 생성 방지, 타입 충돌, 잘못된 TOML, 안전하게 수정할 수 없는 표현.

  Claude: 빈 파일, 기존 `env`와 미지 키 보존, 문자열 `"5"` 기록, root/`env` 타입 충돌, 잘못된 JSON·UTF-8, 모호한 대상 설정.

  두 renderer 모두 재적용 시 같은 bytes를 반환해야 한다. 파싱 결과에서 대상 키 이외 의미가 같아야 한다.

- [ ] **4. 실패를 확인한 뒤 `runtime-config.mjs`를 구현한다.**

  문자열 위치 치환만으로 성공을 판단하지 않는다. Codex는 수정 전후 의미를 비교한다. Claude는 다른 값의 의미를 보존한다. 지원 불가능한 입력은 오류를 반환하고 부분 성공을 만들지 않는다.

- [ ] **5. 새 모듈을 필수 payload 검사에 포함하고 manifest를 생성한다.**

  ```sh
  node scripts/update-manifest.mjs
  node --test tests/node/limits.test.mjs tests/node/runtime-config.test.mjs tests/node/global-config.test.mjs tests/node/manifest.test.mjs
  npm run check:manifest
  ```

**수용 기준과 필수 증거**

- 기본값 100/5, 입력 문법, 우선순위, 영속 round-trip이 통과한다.
- 두 네이티브 renderer가 대상 키만 의미상 변경하고 멱등성을 만족한다.
- 오류 사례에서 기존 데이터를 치환하지 않는다.
- 기존 instruction/wait 검사가 통과한다.
- 새 필수 모듈 누락과 manifest 검사가 통과한다.
- Coder RED/GREEN 보고 후 QA가 위 집중 검사를 독립 재실행하고 결과를 보고한다. Orchestrator가 diff·검사·소유권을 확인해 수용한다.

**커밋 경계:** 위 소유 파일만 하나의 커밋. 제안 메시지: `feat: add subagent limit config primitives`.

**hold 조건:** 플랫폼 키·지원 의미가 근거와 다름, parser 변경이 필요함, 안전 병합을 위해 새 외부 의존성이나 승인 범위를 벗어난 형식 지원이 필요함. 관련 범위를 멈추고 Orchestrator에 보고한다.

## T2 — CLI·설치·ARC 정책의 통합

**목표:** 승인된 사용자 동작을 끝까지 연결한다. 정책이 요구하는 파일의 생성과 정책 변경을 이 작업에서 함께 수용한다.

**선행 작업:** T1의 Orchestrator 수용과 검증된 커밋.

**파일 소유권**

수정:

- `lib/cli/index.mjs`
- `lib/cli/choices.mjs`
- `lib/cli/completion.mjs`
- `lib/installer/targets.mjs`
- `lib/installer/plan.mjs`
- `lib/installer/global-config.mjs`
- `lib/installer/uninstall.mjs`
- `lib/installer/manifest.mjs`
- `codex/skill/SKILL.md`
- `claude/skill/SKILL.md`
- 두 플랫폼의 `skill/references/planning.md`
- 두 플랫폼의 `skill/references/handoff.md`
- `README.md`
- `MANIFEST.sha256`

생성:

- `codex/skill/references/limits.md`
- `claude/skill/references/limits.md`

삭제:

- `codex/config.toml`

검사 소유권:

- `tests/node/{cli,cli-pty,cli-dry-run,completion,plan,targets,global-config,all-targets,install,transaction,transaction-drift,uninstall,uninstall-cli,uninstall-pty,manifest,package,consumer}.test.mjs`
- `tests/test_arc_policy.py`
- `tests/test_claude_payload.py`

이 목록의 기존 검사는 해당 계약·fixture가 실제 달라지는 경우만 수정한다. 다른 파일 수정 필요성이 발견되면 먼저 소유권과 범위를 Orchestrator에 보고한다. `tests/installer-parity.json` 등 과거 기록은 수정하지 않는다.

`transaction.mjs`·`install.mjs`는 기존 `generated.skill`·`globalChanges` 경로를 활용한다. transaction 엔진 수정이 필요해지면 해당 변경과 추가 검사 범위를 먼저 보고한다.

**입출력 계약**

- T1의 검증·해석·renderer를 사용한다.
- CLI options에는 `maxTotalSubagents`, `maxConcurrentSubagents`를 둔다. 생략을 기본값 숫자로 일찍 치환하지 않는다.
- 대상별 선택 결과는 `{limits: Limits, concurrentExplicit: boolean}` 형태로 설치 계획에 전달한다.
- TTY 입력의 Enter도 표시된 동시값의 명시적 선택으로 기록한다.
- 기존값 preview에서 읽은 파일 snapshot은 최종 계획까지 검증한다. 재읽기로 preview 시점의 증거를 조용히 교체하지 않는다.
- `plan.generated.skill`에 `limits.toml` bytes를 추가한다. 새 필수 정책 reference는 payload 검증에 포함한다.
- `plan.summary`와 `globalChanges`로 정책값·네이티브 변경·skip 상태를 보고한다.

### 진행

- [ ] **1. CLI·대화형 실패 검사를 작성하고 실행한다.**

  검사할 동작:

  - 새 플래그 인식·중복·누락·숫자 검증.
  - 비대화형에서 target/preset 필수, 한도 생략 가능.
  - TTY target/preset 지정 후에도 누락 한도 두 개 질문.
  - 최초 Enter는 100/5, 기존 설치 Enter는 기존값.
  - `--target all`의 다른 기존값 표시·각각 보존과 입력 숫자 공통 적용.
  - 잘못된 숫자 재입력, Ctrl-C·EOF 취소, raw-mode/listener 복구.
  - uninstall은 한도를 묻지 않고 새 install 플래그를 받지 않음.
  - native loader 없는 help/version 경로 유지. 격리 복사 fixture에는 새 순수 입력 모듈을 포함함.

- [ ] **2. 안전한 preview와 선택 단계를 연결한다.**

  기존 target/preset 선택을 마친 뒤 safe-fs로 대상별 기존 ARC 설정을 읽고 한도 질문을 수행한다. native 설정은 `--skip-global`이면 접근하지 않는다. progress 출력이 숫자 질문과 충돌하지 않도록 순서를 정리한다.

  preview 이후 변경된 기존 한도 파일을 감지하는 검사를 추가한다. 취소 전에는 파일을 쓰거나 외부 skill을 획득하지 않는다.

- [ ] **3. 계획 생성·재설치·충돌의 실패 검사를 작성한다.**

  최초 100/5, 부분 override, 기존 ARC 값 보존, 손상된 기존 파일 거절, 네이티브 키 누락 추가, drift 충돌, 명시 선택으로 drift 갱신을 검사한다.

  `limits.toml`을 포함한 skill tree 교체 후에도 기존 사용자 한도가 유지되어야 한다. 누적값이 네이티브 동시성 키에 들어가지 않는 assertion을 둔다.

- [ ] **4. target·전역 renderer·설치 계획을 통합한다.**

  Claude `settings.json`을 전역 설정 대상으로 추가한다. 파일 순서 인덱스 대신 역할별로 instruction, Codex config, Claude settings를 구분한다.

  Codex wait 설정과 동시성 변경은 하나의 최종 config bytes로 합성한다. 기존 wait-only 수동 안내 동작과 새 동시성 요청 성공 여부를 구분하며, 새 동시성 실패를 성공으로 처리하지 않는다.

  `limits.toml`과 새 전역 경로를 snapshot·managed-path·충돌 검증에 포함한다.

- [ ] **5. 무변경·rollback·다중 대상 검사를 작성하고 통과시킨다.**

  - check/dry-run에서 파일·프로세스·네트워크 부작용 금지.
  - dry-run에 정책값, 경로, 관련 이전/새 값 표시.
  - skip-global에서 읽을 수 없는 전역 파일도 접근하지 않고 ARC 정책만 생성.
  - `limits.toml`·네이티브 설정 publish 전후 실패에서 이전 상태 복구.
  - preview 이후 drift·symlink·부모 경로 교체 감지.
  - Codex 성공 후 Claude 실패 시 Codex 유지, Claude rollback·부분 성공 보고.
  - 제거 시 ARC 한도 파일 삭제, 네이티브 키 유지·출력.

- [ ] **6. 두 플랫폼 정책과 현재 구조 검사를 함께 갱신한다.**

  `references/limits.md`에 명세의 카운트·예약·실패·재개·압축·장부 상실·소진 규칙을 둔다. SKILL이 첫 생성 전에 설정과 이 규칙을 읽도록 연결한다.

  planning/handoff의 고정 four 문구를 설정값과 낮은 runtime 용량을 따르는 표현으로 바꾼다. 역할·의존성·동일 파일 편집·freshness 게이트는 유지한다.

  구조 검사에는 다음 구분을 명시적으로 검증한다.

  - 완료는 누적 예산을 복구하지 않음.
  - 같은 인스턴스 후속 호출은 누적 증가 없음.
  - 새 인스턴스·자손은 누적에 포함.
  - 불명확한 생성은 예약 유지.
  - 병렬 생성 전에 예약 합계를 계산.
  - 장부 상실 시 0으로 초기화하지 않음.
  - 소진이 필수 QA/Reviewer 생략을 허용하지 않음.
  - 정책 검사가 하드 runtime 강제 증거가 아님.

- [ ] **7. 수동 예제 삭제와 사용자 안내를 함께 적용한다.**

  직접 설치 병합 검사가 통과한 상태에서 `codex/config.toml`을 삭제한다. 두 직접 의존 검사와 현재 고정 four 구조 검사를 새 계약으로 교체한다.

  README·help·completion·uninstall 안내를 명세와 맞춘다. 누적100/동시5, 적용 단위, 네이티브 키, 정책 한계, 새 세션 적용, drift, skip-global, 제거 후 키 유지가 모두 포함돼야 한다.

- [ ] **8. manifest를 생성하고 작업 집중 검사를 실행한다.**

  ```sh
  node scripts/update-manifest.mjs
  node --test tests/node/cli.test.mjs tests/node/cli-pty.test.mjs tests/node/cli-dry-run.test.mjs tests/node/completion.test.mjs
  node --test tests/node/plan.test.mjs tests/node/targets.test.mjs tests/node/global-config.test.mjs tests/node/all-targets.test.mjs tests/node/install.test.mjs
  node --test tests/node/transaction.test.mjs tests/node/transaction-drift.test.mjs tests/node/uninstall.test.mjs tests/node/uninstall-cli.test.mjs tests/node/uninstall-pty.test.mjs
  node --test tests/node/manifest.test.mjs tests/node/package.test.mjs tests/node/consumer.test.mjs
  python3 -m unittest discover -s tests -p test_arc_policy.py
  python3 -m unittest discover -s tests -p test_claude_payload.py
  npm run check:manifest
  ```

  환경이 기존 native artifact를 요구하면 기존 빌드 절차를 사용하고 생성물·manifest 변경 범위를 기록한다. 외부 계정이나 사용자의 실제 전역 설정을 자동 수정하지 않는다.

**수용 기준과 필수 증거**

- 명세 AC1–AC9와 정책/네이티브 증거 구분 AC10의 코드·문서 측면을 충족한다.
- 새 기능의 실패 검사와 구현 후 통과 증거를 제공한다.
- QA가 위 집중 검사를 재실행하고 임시 HOME 기반 실제 CLI 설치·재설치·제거 결과를 확인한다.
- 정책 장부 사례에 대한 텍스트 계약 검사와 시나리오 점검을 보고하되 실제 agent runtime 준수로 과장하지 않는다.
- 지원 플랫폼 새 세션의 네이티브 적용은 QA가 기록한다. 확인이 불가능하면 플랫폼·버전·미확인 범위를 구체적으로 보고한다. 검증 불가능 상태를 임의로 통과 처리하지 않고 Orchestrator가 증거 요건과 승인 범위에 따라 수용 여부를 결정한다.
- Orchestrator가 집중 검사·diff·보존 상태·필수 증거를 확인해 수용한다.

**커밋 경계:** 위 통합 계약 전체를 하나의 커밋. 제안 메시지: `feat: configure ARC subagent limits during install`.

**hold 조건:** 명세와 다른 기본값·정책 의미 필요, 승인 밖 설정 경로 지원, transaction 엔진 변경 필요, 장부를 강제하는 runtime 계층 요구, 네이티브 키 미지원, 필요한 검증 실패·불명확, 관련 없는 사용자 변경 발생.

## 최종 전체 검증

시점은 T1·T2가 각각 집중 검사와 Orchestrator 수용을 완료하고 집중 커밋을 만든 뒤다. 최종 검증 때문에 독립적으로 수용 가능한 T1의 커밋을 지연하지 않는다.

- [ ] 전체 Node 회귀 검사 `npm test`와 `npm run check:manifest`를 실행한다.
- [ ] 변경된 Python 정책/payload 검사의 최종 상태를 확인한다. T2 이후 변경이 없고 증거가 유효하면 같은 검사를 불필요하게 반복하지 않는다.
- [ ] 수동 샘플 의존이 현재 실행 코드·현재 검사에 남지 않았는지 확인한다. 역사 기록 일괄 수정은 하지 않는다.
- [ ] 최종 전체 변경에 대해 **독립 Reviewer 검토 한 번**을 수행한다. 설정 손실·경로 안전성·충돌·정책 의미·문서와 동작 일치에 집중한다.
- [ ] 발견 사항은 소유 작업의 수정·관련 QA 재검증을 거친다. 작업 간 경계 변경이 필요하면 Orchestrator가 계획 변경과 필요한 승인을 처리한다.
- [ ] 기존 미추적 문서와 사용자 변경이 보존됐는지 최종 확인한다.
- [ ] 완료 보고에서 설치 검사, 정책 계약 검사, 실제 플랫폼 runtime 적용 증거와 미확인 범위를 구분한다.

## Planner 자체 검토

- **명세 범위:** 입력·영속성·안전 병합은 T1, 실제 설치·정책 생명주기·문서·제거는 T2가 담당한다. AC1–AC10과 범위 밖 조건을 모두 연결했다.
- **작업 경계:** 순수 기반 함수는 독립 검증 가능하다. 설정 파일 생성과 이를 요구하는 정책은 분리하면 중간 설치 상태가 불완전하므로 T2에 묶었다.
- **인터페이스:** `Limits` 필드·기본값·플랫폼 키를 일관되게 사용했다. 생략값과 명시 선택을 구분해 drift 판정이 가능하도록 했다.
- **검증 비례성:** 각 작업에는 집중 QA가 있으며 per-task Reviewer는 없다. 최종 전체 변경에 독립 Reviewer 한 번을 둔다.
- **남은 사실 확인:** 플랫폼 지원 버전·실제 thread 카운트 의미는 handoff 전 근거를 기록하고, 실제 적용 증거는 별도로 남겨야 한다. 현재 계획 작성 중 runtime 검증을 수행하지 않았다.
- **승인 게이트:** Orchestrator가 이 전체 초안을 통합·저장·검토한 뒤 계획 승인을 받아야 한다. 이 초안 반환은 저장·승인·실행 준비 완료를 의미하지 않는다.
- **현재 상태:** 구현·설정·검사·문서 파일을 수정하지 않았고 명령으로 테스트나 Git 변경을 수행하지 않았다. 계획 저장 경로는 Orchestrator가 확정·기록해야 한다.

## Orchestrator 통합·자체 검토

- 승인된 명세와 대조해 누적 기본값 `100`, 동시 기본값 `5`, Codex/Claude native 키, prompt-level 누적 제한을 확인했다.
- `targets.mjs`와 `plan.mjs`가 managed path·`generated.skill`·`globalChanges`를 계획하고 `transaction.mjs`가 파일별 spec을 일괄 staging/rollback하는 구조를 확인했다. 우선 기존 transaction 인터페이스를 이용하고, 필요한 엔진 변경을 발견하면 계획 범위 승인 후 진행한다.
- T1과 T2는 공유 manifest와 한도 인터페이스를 사용하므로 순차 처리하도록 유지했다. 기존 무관한 미추적 문서는 보존한다.
- 명세에서 사용자 승인한 scope, 기본값, 적용 단위와 상충하는 항목을 찾지 못했다.
- 현재는 계획 승인만 대기한다. 실행 checkout 준비와 구현은 승인 뒤 ARC handoff 절차에 따른다.
