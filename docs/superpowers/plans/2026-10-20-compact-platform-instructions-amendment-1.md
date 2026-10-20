# T2 수용 기준 수정안: 승인 기준점에서 재현된 설치 검사 실패

- 상태: 사용자 승인 대기
- 대상: `/Users/yunho/Desktop/project/arc/docs/superpowers/plans/2026-10-20-compact-platform-instructions.md`의 T2 수용 기준·중단 조건
- 실행 대상: `/Users/yunho/Desktop/project/arc`, `chore/compact-instructions`
- 현재 구현 HEAD: `6776226e7b0be6067f62bb44bcdf0f5a93c1115e`
- 비교 기준: `a86953f5838b9878fce5a8dd2ea6870531762498`
- 선행 조건: 승인된 spec·plan, T1 인수·커밋, T2 fresh QA 증거
- 수정 범위: T2 검증 결과의 수용 방식. 새 구현 작업이나 커밋 단위를 추가하지 않는다.

## 허용하는 기존 실패

다음 명령은 계속 필수이며 실제 실패 결과를 기록한다.

```bash
node --test tests/node/plan.test.mjs tests/node/manifest.test.mjs tests/node/consumer.test.mjs
```

Fresh QA가 승인 기준점의 `git archive`에서도 동일한 실패를 독립적으로 재현한 다음 세 건만 T2의 기존 실패로 처리할 수 있다.

| 검사 | 기준점과 현재 T2의 동일한 실패 |
|---|---|
| `packed tarball executes every target and preset without Python or source access` | `/claude: installed/` 기대, `ARC installed! [claude]` 관찰 |
| `packed root accepts installation options and rejects removed install command` | `/Target: codex; preset: balanced/` 기대, `Install: codex · balanced · English` 관찰 |
| `Claude installed hook survives model update and is removed with managed assets only` | `ARC Git guard failed to load`, 종료 코드 2 관찰 |

설치 검사 결과는 **90/93 통과, 위 세 건 실패**로 보고한다. 세 검사를 통과로 표시하거나 실패한 assertion 이후의 실행되지 않은 검증을 통과 증거로 사용하지 않는다.

## 유지하는 수용 기준과 필수 증거

- 세 건 이외의 필수 focused checks와 T2 신규 assertion은 모두 통과해야 한다.
- 정책·전역·배치 검사 57/57, Python 정책 검사 112/112, 정책 생성 25 targets, manifest 138 files, CLI/runtime 검사 83/83의 fresh QA 증거를 유지한다.
- 신규 payload·참조 링크·누락 및 stale 산출물 검출·사용자 지정 home 검사는 기존 실패와 독립적으로 통과해야 한다.
- CLI·runtime·profiles·hook 코드·설치 메커니즘의 보존 diff와 기존 계약 assertion의 강도 보존을 확인한다.
- 실패 세 건에 대한 CLI·hook·테스트 수정, assertion 완화 또는 검사 제외는 승인하지 않는다.
- 전체 `npm test` 결과도 **655개 중 646 통과, 7 실패, 2 skipped**로 공개한다. 추가 네 실패인 package metadata 한 건, preset 두 건, uninstall PTY 한 건은 T1에서도 관찰된 미해결 한계로 유지한다. 이 네 건의 승인 기준점 재현 여부는 **미검증**이며, 승인 기준점에서 발생한 실패로 확정하지 않는다.
- 이 수정안은 추가 네 실패의 원인이나 통과를 인정하지 않는다. 해당 한계를 명시한 상태에서 T2의 필수 focused 기준을 판단할 수 있도록 한다.

## 보류 조건과 후속 절차

사용자 승인 전에는 T2 인수·커밋을 보류한다. 승인 후에도 신규 실패, 위 세 건의 실패 양상 변화, T2와 실패의 인과관계를 의심할 새로운 증거, 보존 대상 변경 또는 다른 필수 기준 미충족이 발견되면 인수를 보류하고 Orchestrator에게 반환한다.

관련 파일·환경·실패 양상이 바뀌어 기존 증거가 무효화되면 해당 검사와 필요한 QA 재검사를 수행한다. 유효한 증거를 얻기 위한 동일 검사의 불필요한 반복은 요구하지 않는다.

Orchestrator가 수정된 기준과 모든 증거·한계를 확인하여 T2를 인수한 뒤 기존 계획대로 focused commit을 만든다. 이후 **최종 전체 변경에 대한 독립 Reviewer 리뷰와 필요한 finding 재검사**를 수행한다. 전체 완료 판단은 이 절차 이후에 한다.
