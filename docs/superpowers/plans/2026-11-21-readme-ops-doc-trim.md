# README·harness-operation 문서 축소 구현 계획

## 개정 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1 | 2026-11-21 | 첫 완전 초안(Planner). 반영한 설계 승인 결정: E1 다시 그리기, E2 대체(문서 내용 검사 테스트 전부 제거), E3 삭제, E4 1줄, E5=A, E6 간결한 표 유지. Orchestrator 결정 O1·O2 추가 |
| v2 | 2026-11-21T08:18:01Z | T2 AC1 변경(사용자 지시): 줄 수 기준을 빈 줄 제외로 바꾸고, 제목·표 앞뒤 빈 줄 복원과 `\` 줄바꿈 금지를 추가 |

## 목표와 범위

- `README.md`에는 설치·사용에 필요한 내용만 남긴다. `docs/harness-operation.md`에는 운영자 참조만 남긴다.
  - 삭제하는 정보는 정본(`*/skill/SKILL.md`, references, `lib/policy/role-policy.json`, `arc watch --help`)에 있음을 근거로 한다.
- 설계 초안 (d) 1–10의 사실 오류와 host 편향을 바로잡는다.
  - README에 Grok Host가 "No"로 적힌 오류
  - `codex-cli`에서 Claude bridge를 "read-role"로 적은 오류
  - Gemini·Grok 누락
  - Upgrade 첫 bullet과 자동 재적용의 모순
- `docs/images/role-models.svg`를 4개 플랫폼에 대칭이 되도록 다시 그린다. `docs/images/role-flow.svg:45` 문구는 host 중립으로 바꾼다.
- README·harness-operation·svg의 내용을 검사하는 테스트 케이스를 제거한다.
  - 남기는 것: `MANIFEST.sha256`의 README 해시, README를 파일·바이트로만 다루는 fixture와 테스트
- 범위 밖: SKILL.md, references, profiles, role-policy 같은 규범 계약과 코드 동작

## 실행 대상

- 작업공간: `/Users/yunho/Desktop/project/arc/.claude/worktrees/watch-menu-upgrade-reapply`
- 브랜치: `feat/watch-menu-upgrade-reapply`
- 기준 HEAD: `66137ddd`(clean). 사용자가 선택한 대상이며 PR #76에 포함된다.

## Global Constraints

- 문서는 host 중립으로 쓴다. Claude·Codex·Gemini·Grok을 같은 구조와 display order(Claude > Codex > Gemini > Grok)로 다룬다.
- 두 문서와 svg는 영어로 쓴다.
- 남기는 내용은 현재 코드와 일치해야 한다. 근거 위치(파일:줄)는 작업 보고에 적는다.
- Python은 `PYTHONDONTWRITEBYTECODE=1`로 실행하고 `__pycache__`를 만들지 않는다.
- 커밋
  - 작업마다 focused commit 1개를 만든다. 메시지 형식은 `type(scope): 한국어 설명`이다.
  - Orchestrator가 수락한 뒤에 커밋한다.
  - plan 개정과 진행 기록은 다음 작업 커밋에 포함한다.
- 검증 범위: 작업별 검증과 재검증은 수정한 부분과 관련 테스트만 실행한다. 전체 `npm test`는 최종 검증에서 1회만 실행한다.
- 규범 계약, 코드, 그 밖의 테스트 케이스는 바꾸지 않는다. 범위 밖 수정이 필요하면 멈추고 보고한다.

## 가정·Orchestrator 결정

- A1: `tests/test_harness_contract.py`의 링크 해석 테스트와 png 부재 테스트는 skill·references·agents도 검사한다. 그래서 테스트는 남기고, 검사 대상에서 두 문서만 뺀다. `role-flow.png` 부재 단언은 docs 이미지 산출물을 검사하므로 svg 검사와 함께 제거한다.
- A2: `composite-instructions.test.mjs:107-136`은 문서 목록에서 harness-operation만 뺀다.
- A3: harness-operation의 env×target 표는 테스트 계약이 없어져도 정책과 일치해야 한다(생성 규칙: `composite-instructions.test.mjs:115-131`).
- O1(전체 스위트 기준선): 이전 최종 검사(HEAD 3d4b7c5)는 merge 전 기준이라 재사용하지 않는다.
  - 최종 검증에서 Orchestrator가 base `66137ddd`를 별도 디렉터리에 추출한다.
  - 같은 검사를 base와 HEAD 모두에서 실행해 실패 집합을 비교한다. 제거한 케이스는 비교에서 뺀다.
- O2(svg 렌더링 확인): `qlmanage -t -s 1600 -o <임시 디렉터리> <svg>`로 PNG 썸네일을 만들어 육안으로 확인한다.
  - 대안은 브라우저다.
  - 도구가 실패하면 `unverified`로 보고하고 Orchestrator가 확인 방법을 정한다.

---

## T1 문서 내용 검사 테스트 제거

- **선행:** 없음
- **목표:** README·harness-operation·docs/images svg의 문구·링크·앵커·라벨·한글·옛 라벨을 검사하는 테스트를 제거한다. 다른 검사는 그대로 동작하고 약해지지 않아야 한다.

**편집 허용 파일과 정확한 변경**

| 파일:줄 | 현재 | 변경 |
|---|---|---|
| `tests/node/readme-gate-consistency.test.mjs`(전체) | README 플랫폼 행과 bridge gate의 일치 검사 | 파일 삭제 |
| `tests/node/watch-cli.test.mjs:348-351` | `README and operation guide contain no Hangul` | 이 test 블록만 삭제 |
| `tests/node/instruction-language.test.mjs:41` | `'docs/harness-operation.md',` | 항목만 삭제 |
| `tests/node/menu-label-residual.test.mjs:9,14` | `EXTRA_PATHS`와 그 병합 | 상수와 `...EXTRA_PATHS` 삭제 |
| `tests/node/status-labels.test.mjs:27` | `files.push('README.md', 'docs/harness-operation.md');` | 줄 삭제, test 이름에서 "and current docs" 제거 |
| `tests/node/composite-instructions.test.mjs:107-136` | 문서 목록에 harness-operation(110), label 대체값(112) | 목록에서 harness-operation을 빼고 label은 `platforms[index]`로 바꾼다. test 이름은 "coordination references document every host and target route from current policy"로 바꾼다. 셀 비교는 유지한다 |
| `tests/test_harness_contract.py:601-602` | `svg()` 헬퍼 | 삭제 |
| `tests/test_harness_contract.py:604-638` | `test_maintained_local_links_resolve` | `paths` 초기값을 `[]`로 한다. 610줄의 `paths[1].exists()`는 `self.assertTrue(paths)`로 바꾼다. 해석 로직은 유지한다 |
| `tests/test_harness_contract.py:640-672,686-687` | svg 테스트 3개 | 삭제 |
| `tests/test_harness_contract.py:674-684` | `test_stale_png_is_absent_and_unreferenced` | png 부재 단언과 두 문서 항목을 삭제한다. skill·references·agents의 미참조 검사는 유지한다 |

- **변경하지 않는 파일**
  - `tests/node/{release-artifact,release-artifact-process,manifest,native-loader,runtime-installed-entry,composite-live,watch-normalize-codex}.test.mjs`
  - `tests/node/fixtures/{static-references,npm-sandbox,installed-layout}.mjs`
  - `tests/node/fixtures/platforms/package-root.mjs`
  - `scripts/update-manifest.mjs`
  - `MANIFEST.sha256`

**단계**

1. 시작 상태를 기록한다: 작업공간, 브랜치, HEAD, `git status`.
2. 편집 전 기준선 실패 집합을 기록한다.
   - `node --test tests/node/watch-cli.test.mjs tests/node/instruction-language.test.mjs tests/node/menu-label-residual.test.mjs tests/node/status-labels.test.mjs tests/node/composite-instructions.test.mjs tests/node/readme-gate-consistency.test.mjs`
   - `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_harness_contract`
3. 위 표대로 편집한다.
4. 같은 명령을 다시 실행한다. 삭제한 파일은 명령에서 뺀다.

**AC**

- AC1: 남은 테스트 중 `README.md`·`docs/harness-operation.md`·`docs/images/`의 내용을 읽어 단언하는 것이 없다.
  - `tests/`에서 `harness-operation|role-flow\.svg|role-models\.svg`를 Grep하면 0건이다.
  - `README.md`는 "변경하지 않는 파일"에서만 나온다.
- AC2: 남은 검사의 대상이 줄지 않는다.
  - coordination references의 env×target 셀 비교
  - skill·references의 링크·앵커 해석
  - skill·agents의 png 미참조
  - instruction 파일의 한글 검사
  - 패키지 파일과 tests/node의 옛 라벨·오타 검사
- AC3: 편집 후 제거한 케이스만 빠지고 새 실패가 없다. 기준선 실패 집합은 같아야 한다.
- AC4: 테스트 파일 외에는 바꾸지 않는다.

**QA·보류**

- QA: fresh QA가 AC1–AC3을 독립적으로 확인한다. 특히 AC2를 diff 단위로 확인한다.
- 보류: 제거 대상 단언이 문서 외 검사와 한 단언으로 묶여 있어 분리할 수 없으면 멈추고 보고한다.
- 진행 기록(2026-11-21)
  - Implementer 369fbd0d가 테스트 파일 7개를 변경했다(수정 6, 삭제 1).
  - fresh QA 5a69b5cd 판정은 AC1–AC4 모두 pass다.
    - Node: 120 → 114 pass, 실패 0
    - Python: 38 → 35 메서드. 실패 94·오류 1은 기준선과 서브테스트 단위까지 같다.

---

## T2 README 축소·정정, role-models.svg 재작성, role-flow.svg 문구 수정, MANIFEST 재생성

- **선행:** T1 수락·커밋
- **목표:** README를 설계 초안 (b)의 구조로 줄이고 (d) 1–8을 해소한다. 이미지 2개를 host 중립으로 만든다.

**편집 허용 파일:** `README.md`, `docs/images/role-models.svg`, `docs/images/role-flow.svg`(45줄 문구, 필요하면 `<desc>`), `MANIFEST.sha256`(재생성만)

**README 목표 구조(약 55–65줄)**

1. 제목, 4개 플랫폼 소개, role-flow.svg
2. Roles: 표 6행
3. Install: 요구사항 표, 명령, 터미널 안내
   - `Homes` 행: symlink 거부를 적는다. `CLAUDE_CONFIG_DIR`은 기본값만 허용하고 `GEMINI_CLI_HOME`·`GROK_HOME`은 설정되어 있으면 거부한다(`lib/runtime/platform-registry.mjs:61-69`).
4. Manage ARC: 메뉴 표 3행(줄임)과 Mode 표 3행
5. Watch sessions: 2–3문장과 Shown/Hidden 2행
   - watch는 Claude·Codex만 지원한다. Gemini·Grok은 `watch: off`(`platform-registry.mjs:124,142`)라 메뉴에 표시만 되고 선택할 수 없다.
   - 옵션은 `arc watch --help`로 안내한다.
6. `## Models and language`(제목 유지): role-models.svg와 표 4행
   - models.toml 링크 4개: `claude/skill/models.toml`, `codex/skill/models.toml`, `gemini/skill/models.toml`, `grok/skill/models.toml`
7. `## Platform support`: 플랫폼별 1행 표 `Platform | Host | As bridge target | Auth check`

   | Platform | Host | As bridge target | Auth check |
   |---|---|---|---|
   | Claude | Yes | All roles; Implementer/QA sandboxed (`G1`) | `claude auth status` |
   | Codex | Yes | All roles | `codex app-server` auth refresh (network) |
   | Gemini | Held (`GG2`) | Read roles; write roles held (`GG1`) | None (`unknown`, `auth unverified`) |
   | Grok | Yes | All roles; write roles use a per-dispatch sandbox profile (`GK1`) | None (`unknown`, `auth unverified`) |

   - Standalone은 4개 플랫폼 모두 registry 기준 verified다(E5=A). live 측정 범위는 harness-operation 링크로 안내한다.
   - host 의무 2줄
     - Codex host는 runtime 호출마다 escalation 승인을 받는다.
     - Grok host는 `grok --permission-mode default`로 시작하고 매 호출 `Allow once`를 쓴다.
   - Desktop 환경은 held다. `executionEnvironment`는 호출자가 선언하며 경로로 추론하지 않는다.
   - 세부는 `docs/harness-operation.md#execution-support`로 안내한다.
8. Upgrade
   - Status → Upgrade 후 현재 설정으로 자동 재적용된다(`lib/management/update.mjs:24-73`).
   - 다음 경우에는 Configure → Apply를 수동으로 실행한다.
     - 재적용이 held·중단·unknown인 경우
     - npx 0.4.6 이하에서 처음 업그레이드하는 경우
   - 진행 중인 plan workflow는 `cooperative.versions`로 hold된다.
   - downgrade 2줄은 유지한다.
   - `cooperative-9` 문구와 Codex→Claude composite 이동 상세는 삭제하고 legacy migration 링크 1줄로 대신한다.
9. Guides: Harness operation과 4개 SKILL.md 링크

**role-models.svg 재작성 요구**

- 제목 "Role models and platforms"는 유지한다. 크기는 자유이며 기존 스타일 클래스를 재사용한다.
- 구성
  - Orchestrator 카드: "Current conversation model"
  - 5개 specialist 역할: platform + model + effort
  - 4개 플랫폼 카드: 같은 크기, display order
  - 하단: "Packaged catalog → models.toml (Configure)"
- 플랫폼 카드에는 각 models.toml의 기본값을 적는다.

  | 플랫폼 | 기본값 |
  |---|---|
  | Claude | Scouter·QA `haiku`/high, Planner `sonnet`/xhigh, Implementer `sonnet`/medium, Reviewer `sonnet`/high |
  | Codex | Scouter `gpt-6-luna`/high, Planner `gpt-6.1-sol`/xhigh, Implementer `gpt-6.1-sol`/medium, QA `gpt-6.1-terra`/high, Reviewer `gpt-6.1-sol`/high |
  | Gemini | 모든 역할 `gemini-2.5-flash`/default |
  | Grok | 모든 역할 `grok-4.6`/default |

  - Implementer는 작업 시점의 models.toml을 다시 읽어 대조한다.
- 역할별 기본 플랫폼 배치는 넣지 않는다. 대신 "Any specialist role can use any participating platform"으로 적는다.
- 메뉴 이름은 "Configure"로 쓴다.
- `role="img"`·`<title>`·`<desc>`는 유지한다. `<desc>`도 4개 플랫폼을 대칭으로 서술한다.

**role-flow.svg:45 수정**

- 새 문구: "Targets on every platform: current checkout, new task branch, or managed worktree."
- 근거: 네 플랫폼의 `references/handoff-prep.md`에 같은 세 가지 선택지가 있다.

**MANIFEST**

- README 편집 후 `node scripts/update-manifest.mjs`를 실행한다. diff는 README 행만 바뀌어야 한다.

**AC**

- AC1(v2): README가 (b)의 구조를 따르고 빈 줄을 뺀 줄 수가 65줄 이하다. 제목·표·목록 앞뒤에 빈 줄을 두고 줄 끝 `\` 강제 줄바꿈을 쓰지 않는다. 남긴 모든 사실에 코드나 정본 근거가 있다.
- AC2: (d) 1–8을 해소한다.
  - 4개 플랫폼이 소개·모델·플랫폼 표·Guides에 모두 나온다.
  - Claude·Codex만 다루는 서술이 없다.
- AC3: README의 로컬 링크·앵커가 모두 해석된다.
  - `#execution-support`, models.toml 4개, SKILL.md 4개
  - harness-operation의 `../README.md#models-and-language`
- AC4: 두 svg가 유효한 XML이다. 렌더링했을 때 글자 잘림·겹침이 없다(O2). role-models.svg의 기본값이 models.toml 4개와 일치한다.
- AC5: `npm run check:manifest`가 통과하고 MANIFEST diff는 README 행 1줄이다.
- AC6: README와 svg에 한글·옛 라벨(`Install / Update`, `Check Version`)·오타(`Not Avaliable`)가 없다. Grep으로 확인한다.

**검증 명령**

- `npm run check:manifest`
- `node --test tests/node/manifest.test.mjs tests/node/release-artifact.test.mjs tests/node/release-artifact-process.test.mjs`
- 링크·앵커는 T1 이전 `test_maintained_local_links_resolve`와 같은 규칙(제목 → 앵커)으로 수동 확인한다.
- svg
  - `PYTHONDONTWRITEBYTECODE=1 python3 -c "import xml.etree.ElementTree as E; E.parse('docs/images/role-models.svg'); E.parse('docs/images/role-flow.svg')"`
  - O2 방법으로 렌더링을 확인한다.

**QA·보류**

- QA(fresh)가 확인할 것
  - 사실 정확성(근거 대조)
  - 링크·앵커
  - svg 렌더링: 실제 출력 기준 pass·mismatch·unverified
  - models.toml 일치
- 보류: 남길 사실이 코드와 어긋나 product 결정이 필요하면 멈추고 보고한다.
- 진행 기록(2026-11-21)
  - Implementer 565eb74b가 README를 65줄로 다시 썼다. 함께 role-models.svg를 다시 그리고 role-flow.svg 문구를 고친 뒤 MANIFEST를 재생성했다.
  - fresh QA b406185d 결과: AC1·AC3–AC6 pass. AC2는 unverified로 남았는데, (d) 원문이 plan에 없었기 때문이다. Orchestrator가 (d) 1–8과 대조해 AC2 충족을 확인했다.
  - 렌더링(Chrome headless, 호스트)에서 잘림·겹침이 없었다. Implementer 라벨 간격은 4px다.
  - Node 테스트 3종 108/108 pass(호스트).
  - 계획 v2(AC1 변경)에 따라 fresh Implementer b174921e가 빈 줄을 복원했다(84줄, 빈 줄 제외 60줄, 내용 불변).
  - QA 재확인 결과 AC1(v2)·내용 불변·MANIFEST·링크 모두 pass다.

---

## T3 harness-operation 축소·정정

- **선행:** T2 수락·커밋
- **목표:** 설계 초안 (a)·(b)의 구조로 줄이고(296줄 → 약 150–170줄) (d) 9–10을 해소한다.

**편집 허용 파일:** `docs/harness-operation.md`

**변경 요약**

| 절 | 처리 |
|---|---|
| 서두 | 유지. 정본 목록에 Grok SKILL 추가 |
| 워크플로 mermaid·설명 | 삭제 |
| What ARC installs | Grok 열 추가: `~/.grok`, `GROK_HOME` 거부, `skills/arc/`, `agents/arc-*.md`, `AGENTS.md`, `config.toml`의 ARC 관리 `[compat.claude]`만(`lib/platforms/grok.mjs:7-12`). `effort (Claude/Gemini/Grok)`로 고친다. legacy bullet은 1줄로 줄인다 |
| Mixed routing | 표 유지. mermaid 삭제, bullet은 1–2줄 |
| Status and authentication | 유지 |
| env×target 표 | 행 본문을 바이트 단위로 유지(A3) |
| Host 표·Desktop 문단 | 줄임 |
| Bridge gate 표 | 게이트마다 결과와 운영 영향 1–2줄. G1 상세는 `references/coordination.md` "Bridge target rules"로 링크. GK1은 측정 범위만 남기고 위조·cancel 분석은 삭제. 나머지는 1줄씩 |
| 2026-11-20 측정 문단 | 삭제 |
| control-file 세부 | `### Post-run detection limits` 한 문단(overflow, `core.hooksPath` 외부, Git-ignored, after snapshot 실패, `tolerated.refs` 출처 확인). 라벨 목록은 coordination.md 링크로 |
| bridge 실행 중 주의 | `### Working alongside a running bridge`로 유지하고 줄임 |
| Install/update/remove mermaid | 삭제 |
| 동작 표 | `D1-a…e` 라벨을 빼고 약 8행. CLI·Home·Diagram 행 삭제. terminal 요구 사항은 README와 맞춘다 |
| 자동 재적용 문단 | 유지 |
| Legacy migration | 2–3줄. `cooperative-9` 삭제, `cooperative.versions` 1줄 유지 |
| Uninstall 표 | 유지 |
| Result 메시지 표 | 삭제(E3). rollback·residual 1줄만 남김 |
| Watch 표 | Options·Bounds 삭제. shell 탐지 비활성 조건 1줄은 Shell detection 행으로 옮김. KIND 표와 Markdown 줄은 유지 |
| Workflow rules | 삭제. `## Workflow contracts` 정본 링크 1–2줄로 대체 |
| Maintenance 표 | 1줄씩. upstream refresh는 1줄(E4) |
| Source map | Gemini·Grok의 references·agents 링크 추가 |

**AC**

- AC1: (b)의 구조를 따르고 170줄 이하다.
- AC2: 삭제한 정보마다 정본 위치가 있다.
  - 작업 보고에 "삭제 항목 → 정본 파일:절" 표를 첨부한다.
  - 정본이 없는 운영 정보는 남아 있어야 한다: bridge 실행 중 주의, 탐지 한계, KIND 표, 자동 재적용, uninstall 보존 범위.
- AC3: env×target 표 6행이 `66137ddd`와 바이트가 같다(diff로 확인).
- AC4: 4개 플랫폼이 설치표·effort·Source map·정본 목록에 대칭으로 나온다.
- AC5: 모든 로컬 링크·앵커가 해석된다.
- AC6: 한글·옛 라벨·오타가 없다.

**검증 명령**

- `git diff 66137ddd -- docs/harness-operation.md`로 env×target 행이 그대로인지 확인한다.
- `node --test tests/node/composite-instructions.test.mjs`
- 링크·앵커를 수동 확인하고, 한글·라벨을 Grep으로 확인한다.

**QA·보류**

- QA(fresh)가 확인할 것
  - 사실 정확성
  - AC2 대조표
  - 링크
  - env×target 행이 바뀌지 않았는지
- 보류: 정본이 없는 정보를 삭제해야 하거나, 남길 사실이 코드와 어긋나면 멈추고 보고한다.
- 진행 기록(2026-11-21)
  - Implementer 0dd4a941
    - 최초에는 정본 범위를 이유로 보류했다.
    - Orchestrator가 구현 소스와 `docs/superpowers/specs` 기록을 정본 근거로 인정한 뒤 문서를 다시 썼다. 결과는 196줄, 빈 줄 제외 155줄이다.
  - fresh QA aef4c5ec
    - 1차 판정: AC2·AC4 fail. 결함은 5건이다.
      - G1·G2 측정 범위
      - 공통 규칙 링크가 Claude·Codex만 가리킴
      - 자동 재적용과 동시성 보류
      - 연속 3회 실패
      - upstream rollback 구분
    - 수정 후 재검: 동시성 보류 조건이 아직 넓다.
    - 재수정 후 재검: AC1–AC6 모두 pass.
  - 정본 미확인 삭제 처리(Orchestrator)
    - 원문 122·126·262행은 삭제를 유지한다. 122행은 기준선 서술 오류이고, 나머지는 구현 세부다.
    - 268행 한국어 커밋 규칙은 1줄로 복원했다.
  - env×target 6행은 바이트 단위로 바뀌지 않았다. 링크 40개와 들어오는 링크 3개가 해석되고, composite-instructions 테스트는 20/20 통과했다.

---

## 최종 검증 (모든 작업 수락 후 1회)

1. `npm test` 전체 1회. O1 방식(base `66137ddd`와 HEAD)으로 실패 집합을 비교한다. 새 실패가 없어야 한다.
2. `npm run check:manifest`, `npm run check:role-policy`, `node scripts/check-installer-parity.mjs --complete`
3. `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests`. 제거한 svg·png 단언을 빼면 base와 같아야 한다.
4. 최종 Reviewer 1회(전체 변경)가 확인할 것
   - 삭제한 정보가 정본에 있는지
   - 남긴 사실이 정확한지
   - 4개 플랫폼 대칭과 host 중립
   - svg와 models.toml·handoff-prep의 일치
   - 테스트 제거가 문서 검사 범위를 넘지 않았는지

   Reviewer 지적은 Implementer → Reviewer로 다시 확인한다(QA 재배정 없음). 수정은 미커밋 상태로 두었다가 수락 후 follow-up 커밋 1개로 만든다.

## 의존

- 순서: T1 → T2 → T3(직렬)
- 계획상 product 결정은 남아 있지 않다. 실행 중 사실이 어긋나면 보류 조건을 따른다.
