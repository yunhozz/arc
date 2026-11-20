# 하네스 지침 문서 의미 보존 리팩토링 2차 실행 계획

> **실행 담당자 안내:** 이 plan은 Bounded 밀도로 작성했습니다(OD-9: Bounded이며 위험도는 significant). 진행 상황은 체크박스(`- [ ]`)로 표시합니다. 체크박스는 커밋 단위가 아닙니다. 승인된 최상위 작업 하나가 집중 커밋 하나에 대응합니다.

- **목표:** 승인된 차이분 spec의 확정 편집 E1–E7(문서 4개 파일, 7곳)과 짝지은 테스트 문자열 TU-1을 적용합니다. `MANIFEST.sha256`과 golden은 다시 생성합니다. 의미는 바뀌지 않아야 합니다.
- **정본 spec:** `docs/superpowers/specs/2026-11-20-harness-doc-refactor-2-design.md` (승인 당시 sha256 `40424434…806a1`, §11 OD-11 기록 추가 후 v1(`0e3f237`) 시점 sha256 `5eb62a91…b736`, 이후 개정은 spec의 개정 이력 참조). 여기에 적지 않은 규칙은 1차 spec과 1차 plan(`2026-11-13-harness-doc-refactor*`)을 따릅니다.
- **실행 대상:** `/Users/yunho/Desktop/project/arc/.claude/worktrees/harness-doc-refactor-2`, 브랜치 `refactor/harness-doc-refactor-2`, base `12aa9a3bbf9dc30243d69cb85a10b685d1162328`. `node_modules`와 `build/native`는 OD-11에 따라 준비되어 있고 둘 다 ignored 파일입니다.
- **순서:** docs 커밋(spec과 plan) → T0 → T2 → 최종 Reviewer(1회). 1차와 ID를 맞추려고 T1과 T3은 비워 둡니다. 원천 편집과 bootstrap이 0건이라 해당 작업이 없습니다.
- **역할:** T0 QA와 T2 QA는 매번 새로 배정하는 bridge QA(codex)입니다. T2 Implementer는 bridge(codex)이고 `allowedPaths`는 T2 허용 파일과 같습니다. 최종 Reviewer는 native입니다.
- **환경 규칙:** Python은 `PYTHONDONTWRITEBYTECODE=1 python3 -B`로 실행합니다. 모든 Git 조회에는 `git --no-optional-locks`를 붙입니다(index stat 갱신 쓰기를 막기 위함). heredoc, 임시 스크립트 파일, 프로세스 치환(`<(...)`)은 쓰지 않습니다. `.git` 메타데이터를 바꾸는 명령은 금지합니다(`git fetch`, `git gc`, `git status`의 index 쓰기, `git stash`, `git add` 등). 커밋은 Orchestrator만 합니다.

---

## 0. 커밋 경계 (PL-4)

| 시점 | 커밋 주체 | 내용 | 메시지 형식(제안) |
|---|---|---|---|
| plan 승인 직후, T0 전 | Orchestrator | spec과 plan 문서 2개만 담은 docs 커밋 1개 | `docs(harness): 하네스 지침 리팩토링 2차 설계와 실행 계획 추가` |
| T0 수락 | 없음 | T0는 커밋하지 않습니다. 결과는 canonical handoff 기록에만 남깁니다 | — |
| T2 수락 직후 | Orchestrator | T2 허용 파일, T2 진행 기록(체크박스와 결과), 대기 중인 승인된 spec/plan 개정(있으면 trailer 포함) | `refactor(skill): 지침 문서 7곳 규범어 대문자화와 고정값 갱신` |
| 최종 Reviewer 지적 해소 후 | Orchestrator | 수정 사항과 plan-level 진행 기록. Reviewer 재확인이 끝날 때까지 커밋하지 않고, 수락 뒤 follow-up 커밋 1개로 만듭니다 | `fix(skill): 2차 리팩토링 최종 리뷰 지적 반영` |

- 메시지는 `type(scope): 한국어 설명` 형식입니다. 위 type과 scope는 제안이며 Orchestrator가 정합니다.
- amend는 금지합니다. 기획 커밋과 구현 커밋 모두 해당합니다. 진행 기록만을 위한 별도 docs나 fixup 커밋도 만들지 않습니다.
- 실행 중 plan이나 spec을 개정해야 하면 Orchestrator가 승인을 받습니다. 개정은 그 개정본으로 처음 실행하거나 재확인한 작업의 수락 커밋에 포함하고, `Plan-Revision:`, `Plan-Approved-At:`, `Plan-Reason:` trailer를 붙입니다(commit.md "Execution-time plan document updates").
- 최종 Reviewer가 지적 없이 승인하면 구현 작업이 남지 않습니다. 이때 plan-level 기록은 canonical handoff 기록에만 남기고, 기록만을 위한 커밋은 만들지 않습니다.

---

## T0 — 기준선 (fresh bridge QA, 커밋 없음)

- **목표:** T2 비교의 기준이 되는 검사 결과, 대응 줄 검색 결과, 잔존 스캔 결과를 확정합니다.
- **범위:** 실행 대상 워크트리. HEAD는 docs 커밋(코드 변경 0, `12aa9a3` 위의 문서 2개 추가)입니다. 허용 파일은 없습니다. 읽기와 검사 실행만 합니다.
- **선행:** plan 승인, docs 커밋 완료, 실행 대상 준비 확인(위 경로·브랜치, 추적 파일 변경 0).
- **완료 기준:**
  - AC2-13: 모든 검사 결과가 기록되고 실패는 분류됐습니다.
  - 산출물 외 파일 변경 0. 실행 전후의 `git --no-optional-locks status --porcelain` 출력이 같아야 합니다(빈 출력 기대).
- **필수 검사:** 모두 워크트리 루트에서 실행하고, 각 명령 뒤에 `; echo "exit=$?"`를 붙여 종료 코드를 기록합니다.
  1. `git --no-optional-locks rev-parse --abbrev-ref HEAD; git --no-optional-locks rev-parse HEAD; git --no-optional-locks status --porcelain`
  2. `.git` 메타데이터 증거(전후 비교용): `ls -lT "$(git --no-optional-locks rev-parse --git-common-dir)"` (FETCH_HEAD, index, ORIG_HEAD의 mtime)
  3. `npm test`
  4. `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -v -s tests -p test_arc_policy.py`
  5. `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -v -s tests -p test_harness_contract.py`
  6. `PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -v -s tests -p test_claude_payload.py`
  7. `npm run check:role-policy`
  8. `npm run check:manifest`
  9. `node scripts/update-runtime-assets.mjs --check`
  10. `node scripts/check-installer-parity.mjs`
  11. `node tests/node/fixtures/installed-layout.mjs --diff`. 출력 줄이 0이면 기준선 통과입니다. 이 스크립트는 OS tmpdir에 임시 package root를 스스로 만들었다가 지웁니다. sandbox 때문에 실패하면 "실행 불가"와 오류를 기록하고 추측해서 재시도하지 않습니다.
  12. 대응 줄 검색(§4, Q-B), 잔존 스캔(Q-E 기준선 부분)
  13. 1–2를 다시 실행해 전후 비교
- **산출물:**
  - 표 `검사 | 종료 코드 | 실패 테스트 ID | 실패 메시지 요지 | 분류(baseline/D7 후보/불명)`
  - `composite-instructions.test.mjs`의 `:89` 테스트와 `installed-layout-golden.test.mjs`의 기준선 통과 여부
  - Q-B의 결과(위치 목록)
  - 잔존 스캔의 원 출력
  - 환경 정보(node 버전, `npm ci` 때의 EBADENGINE 경고)
  - `.git` 메타데이터 mtime 변화 유무
- **T0 결과에 따른 hold:**
  - 검사 11 또는 golden 테스트가 실패했거나 실행할 수 없으면 OD-8에 따라 T2의 golden `--write`를 hold합니다(T2 자체는 진행).
  - Q-B 결과가 기대와 다르면 T2 전체를 hold합니다.

---

## T2 — 문서 7곳, 짝지은 테스트 문자열, MANIFEST, golden (bridge Implementer 1명, 집중 커밋 1개)

- **목표:** spec §3.1의 E1–E7과 §7.2의 TU-1을 적용하고, 고정 산출물을 재생성합니다.
- **허용 파일(= `allowedPaths`):**
  - `claude/skill/references/worktree-creation.md`
  - `gemini/skill/references/coordination.md`
  - `gemini/skill/references/worktree-creation.md`
  - `grok/skill/references/worktree-creation.md`
  - `tests/node/composite-instructions.test.mjs` (`:91` 문자열만)
  - `MANIFEST.sha256`
  - `tests/node/fixtures/installed-layout-golden.json` (OD-8 조건을 충족할 때만)
- **선행:** T0 수락. Q-B가 기대와 일치해야 합니다.
- **완료 기준(spec AC 연결):**
  - AC2-1: 변경 파일이 허용 파일로만 한정됩니다.
  - AC2-9, AC2-3: 문서 diff는 E1–E7의 대소문자 변경뿐입니다. 접기 비교 차이는 0입니다.
  - AC2-5: H1–H5 위치와 OD-3 상속 위치의 바이트가 바뀌지 않습니다. `:10`의 `never through`는 소문자로 남습니다.
  - AC2-6, AC2-7: backtick span, 링크, 제목, anchor, marker의 diff가 0입니다.
  - AC2-10: 원천 3개 파일, 관리 블록, runtime의 diff가 0입니다. check 3종의 종료 코드가 0입니다.
  - AC2-12: 테스트 diff는 `:91` 문자열과 golden SHA 값에만 있습니다.
  - AC2-13, AC2-14: 기준선 대비 새 실패가 0입니다(`:89` 포함). E4·E5와 E6·E7은 같은 변경에 함께 들어갑니다. parity가 보존됩니다.
  - golden은 갱신됐거나, OD-8 hold 사유가 보고됐습니다.
- **필수 검사:** fresh bridge QA가 Q-A부터 Q-H까지 수행합니다(아래 §QA). T0 검사 3–11은 전부 다시 실행해 기준선과 비교합니다.

### T2 Implementer 절차 (spec §7.1, 실행 순서)

- [x] **1. 문서 7곳 편집.** 각 위치에서 아래 구만 바꿉니다. 줄 안의 다른 바이트는 바꾸지 않습니다.

| ID | 파일:줄 | 이전 | 이후 |
|---|---|---|---|
| E1 | `claude/skill/references/worktree-creation.md:10` | `both must resolve to the target realpath.` | `both MUST resolve to the target realpath.` |
| E2 | `claude/skill/references/worktree-creation.md:13` | `only Orchestrator may delete them after an explicit user instruction authorizes that deletion.` | `only Orchestrator MAY delete them after an explicit user instruction authorizes that deletion.` |
| E3 | `gemini/skill/references/coordination.md:226` | `Hold unavailable routes; do not invent native tool calls.` | `Hold unavailable routes; DO NOT invent native tool calls.` |
| E4 | `gemini/skill/references/worktree-creation.md:6` | `Do not substitute Claude EnterWorktree, invent an attachment call or treat Git registration as attachment evidence.` | `DO NOT substitute Claude EnterWorktree, invent an attachment call or treat Git registration as attachment evidence.` |
| E5 | `grok/skill/references/worktree-creation.md:6` | (E4와 같은 문장) | (E4와 같은 편집) |
| E6 | `gemini/skill/references/worktree-creation.md:8` | `Never retry with a different name, remove a worktree, change permissions or bypass the sandbox.` | `NEVER retry with a different name, remove a worktree, change permissions or bypass the sandbox.` |
| E7 | `grok/skill/references/worktree-creation.md:8` | (E6과 같은 문장) | (E6과 같은 편집) |

  - 바꾸지 말아야 할 위치(hold, 바이트 불변):
    - H3: E1과 같은 `:10` 줄의 `never through a compound Git command in the isolated session`
    - H2: `claude/skill/references/worktree-creation.md:6`의 `never remote HEAD/default branch or automatic fetch`
    - H1, H4, H5: 편집 대상이 아닌 파일에 있습니다(`*/skill/references/handoff-prep.md:90`, `shared/skill/references/handoff-worktree.md:14,16,32`). 이 파일들은 열어서 편집하지 않습니다.
  - E4·E5와 E6·E7은 같은 작업에서 함께 바꿉니다. 한쪽만 바꾸지 않습니다.
- [x] **2.** `npm run check:role-policy`를 실행해 종료 코드 0을 확인합니다. `update:role-policy`는 실행하지 않습니다.
- [x] **3.** `node scripts/update-runtime-assets.mjs --check`를 실행해 종료 코드 0을 확인합니다. 갱신 모드는 실행하지 않습니다.
- [x] **4. TU-1.** `tests/node/composite-instructions.test.mjs:91`의 `do not invent native tool calls`를 `DO NOT invent native tool calls`로 바꿉니다. 같은 줄의 나머지 바이트, 다른 줄, 매칭 방식, 정규화, 플래그, 테스트 이름과 구조는 바꾸지 않습니다(D3).
- [x] **5.** `node scripts/update-manifest.mjs`를 실행한 뒤 `npm run check:manifest`로 종료 코드 0을 확인합니다.
  - 기대 변경은 `MANIFEST.sha256`의 4행입니다: `:19` claude wc, `:50` gemini coordination, `:57` gemini wc, `:75` grok wc.
  - 확인 명령: `git --no-optional-locks diff -U0 --no-color -- MANIFEST.sha256 | grep -c '^+[0-9a-f]'`. 기대값은 4입니다.
  - 다른 행이 바뀌면 멈추고 보고합니다.
- [x] **6. golden.**
  - 먼저 `node tests/node/fixtures/installed-layout.mjs --diff`를 실행하고 출력을 그대로 기록합니다.
  - 기대: 모든 줄이 `~ <조합> skills/arc/references/worktree-creation.md` 또는 `~ <조합> skills/arc/references/coordination.md` 형태입니다. 줄 수는 현재 golden에서 이전 SHA 4종(`8826abe4`, `751eb3c7`, `401fdde0`, `c8951454`)이 나오는 횟수와 같아야 합니다. Planner가 센 값은 16이며, QA는 `grep -cE '8826abe4|751eb3c7|401fdde0|c8951454' tests/node/fixtures/installed-layout-golden.json`(T2 전 HEAD 기준, 또는 `git --no-optional-locks show HEAD:tests/node/fixtures/installed-layout-golden.json | grep -cE …`)으로 다시 확인합니다.
  - 아래 조건을 모두 충족할 때만 `node tests/node/fixtures/installed-layout.mjs --write`를 실행하고, 이어서 `--diff`를 다시 실행해 출력 0줄을 확인합니다.
    - T0에서 golden이 통과했습니다.
    - 차이가 기대 범위 안에만 있습니다.
    - `+`나 `-` 줄이 없습니다.
  - 조건이 하나라도 어긋나면 `--write`를 hold하고, 출력과 T0 상태를 보고합니다(OD-8).
- [x] **7. Implementer 자체 확인.**
  - `node --test tests/node/composite-instructions.test.mjs tests/node/installed-layout-golden.test.mjs`
  - Q-A의 접기 비교 한 줄 명령
  - `git --no-optional-locks diff --name-only`
- [x] **8. 보고.** 파일로 저장하지 않고 응답으로 반환합니다. Orchestrator가 canonical 기록에 옮깁니다.
  - 대조표(1차 §11.1 형식)
    - E1–E7 각 행: 위치, 이전, 이후, 강도·주체·조건·예외·우선순위가 바뀌지 않았다는 확인 문장
    - H1–H5 행: 바이트 불변. H1은 "새 hold(1차 대응 미확인)"로 적습니다.
  - 테스트 갱신 기록(1차 §8.4 형식): TU-1, MANIFEST 4행, golden(갱신 또는 hold 사유)
  - 실행한 명령과 종료 코드

---

## 최종 Reviewer (native, 1회)

- **선행:** T2 수락과 집중 커밋 완료. 필수 QA와 QA 실패 재확인이 모두 끝난 상태여야 합니다.
- **범위:** `git --no-optional-locks diff 12aa9a3..HEAD` 전체(docs 커밋 포함)를 R8 관점으로 검토합니다.
- **완료 기준:**
  - AC2-11: 강도, 대상, 조건, 예외, 우선순위, 참조, 링크 검토가 Reviewer 보고에 기록됩니다.
  - AC2-1: `git --no-optional-locks diff --name-only 12aa9a3..HEAD`가 T2 허용 파일과 spec·plan 2개로만 한정됩니다.
  - AC2-3, AC2-8, AC2-9: 대조표와 diff가 1:1로 대응합니다.
- **지적 처리:** Implementer가 수정하고 Reviewer가 재확인합니다. QA는 다시 배정하지 않습니다. 수정은 재확인이 끝날 때까지 커밋하지 않습니다. 수락 뒤 follow-up 커밋 1개로 만들고, plan-level 기록도 그 커밋에 포함합니다.
- Reviewer는 작업별 검사가 아닙니다.

---

## QA 검증 절차 (PL-3, T2 fresh QA용, 모두 한 줄 명령)

공통 규칙:
- 워크트리 루트에서 실행합니다.
- `D="claude/skill/references/worktree-creation.md gemini/skill/references/coordination.md gemini/skill/references/worktree-creation.md grok/skill/references/worktree-creation.md"`처럼 변수를 쓰지 않고, 경로를 명령에 직접 나열해도 됩니다.
- 비교 기준은 `12aa9a3`(working tree 대 base)입니다.

### Q-A. 대소문자 접기 비교, backtick span 비교 (spec §9, AC2-3, AC2-6, AC2-9)

```
node -e 'const x=require("child_process").execFileSync;const d=x("git",["--no-optional-locks","diff","-U0","--no-color","12aa9a3","--","claude/skill/references/worktree-creation.md","gemini/skill/references/coordination.md","gemini/skill/references/worktree-creation.md","grok/skill/references/worktree-creation.md","tests/node/composite-instructions.test.mjs"],{encoding:"utf8"}).split("\n");const m=d.filter(l=>/^-(?!--)/.test(l)).map(l=>l.slice(1)),p=d.filter(l=>/^\+(?!\+\+)/.test(l)).map(l=>l.slice(1));const s=a=>JSON.stringify(a.map(l=>l.match(/`[^`]*`/g)));console.log("removed",m.length,"added",p.length,JSON.stringify(m.map(l=>l.toLowerCase()))===JSON.stringify(p.map(l=>l.toLowerCase()))?"FOLD_EQUAL":"FOLD_DIFF",s(m)===s(p)?"SPANS_EQUAL":"SPANS_DIFF")'
```

- 기대 출력: `removed 8 added 8 FOLD_EQUAL SPANS_EQUAL`(문서 7줄과 test `:91` 1줄).
- 보조 확인: `git --no-optional-locks diff --word-diff=porcelain --no-color 12aa9a3 -- <위 5개 파일> | grep -E '^[-+][^-+]'`
  - 기대: `-must`/`+MUST`, `-may`/`+MAY`, `-do not`/`+DO NOT`(E3, TU-1), `-Do not`/`+DO NOT`(E4, E5), `-Never`/`+NEVER`(E6, E7). 이것 말고는 없어야 합니다.

### Q-B. 대응 줄 검색 (spec §4, T0에서 실행하고 T2 QA에서 반복)

```
git --no-optional-locks grep -n -i -E 'must resolve to the target realpath|Orchestrator may delete|invent native tool calls|substitute Claude EnterWorktree|retry with a different name' -- claude/skill/references codex/skill/references gemini/skill/references grok/skill/references shared/skill/references
```

- 기대(T0): 7줄입니다.
  - claude wc `:10`, `:13`
  - gemini coord `:226`
  - gemini wc `:6`, `:8`
  - grok wc `:6`, `:8`
- 이와 다른 위치가 나오면 T2를 hold합니다. T2 뒤에도 같은 7개 위치가 나와야 합니다(내용은 대문자).

### Q-C. 4개 플랫폼 parity (spec §4, AC2-14)

```
node -e 'const s=require("child_process").spawnSync;const P=["claude","codex","gemini","grok"];const F=["SKILL.md","references/commit.md","references/coordination.md","references/git-recovery.md","references/handoff.md","references/handoff-prep.md","references/planning.md","references/verification.md","references/worktree-creation.md","references/limits.md","references/arc-visual-companion.md"];const b=r=>{if(r.status>1)return "ERR "+r.stderr;return r.stdout.split("\n").filter(l=>!/^(diff --git|index |--- |\+\+\+ )/.test(l)).join("\n")};for(const f of F)for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){const a=P[i]+"/skill/"+f,c=P[j]+"/skill/"+f;const B=b(s("git",["--no-optional-locks","--no-pager","diff","--no-color","12aa9a3:"+a,"12aa9a3:"+c],{encoding:"utf8"}));const A=b(s("git",["--no-optional-locks","--no-pager","diff","--no-color","--no-index","--",a,c],{encoding:"utf8"}));console.log(B===A?"SAME":B.toLowerCase()===A.toLowerCase()?"CASE_ONLY":"DIFF",f,P[i],P[j])}'
```

- 기대:
  - `DIFF`와 `ERR`가 0개입니다.
  - `CASE_ONLY`는 다음 쌍뿐입니다.
    - `references/worktree-creation.md`: claude–codex, claude–gemini, claude–grok, codex–gemini, codex–grok (E1, E2, E4–E7)
    - `references/worktree-creation.md`: gemini–grok (E4·E5). 6행은 플랫폼 이름(Gemini/Grok)이 달라 두 파일 간 diff에 남는다. 두 파일 모두 같은 `Do not`→`DO NOT` 편집을 받으므로 그 diff 줄의 대소문자만 바뀐다. 8행(E6·E7)은 두 파일에서 같은 문장이라 diff에 나타나지 않는다.
    - `references/coordination.md`: gemini가 들어간 3쌍 (E3)
  - (개정 2026-11-20: 처음 기대값은 gemini–grok `SAME`이었다. 6행의 플랫폼 이름 차이를 반영하지 못한 오류라 위와 같이 정정했다.)
- 각 `CASE_ONLY`는 대조표의 E ID로 설명합니다.
- `npm test` 안의 `composite-instructions` `:89` 통과도 함께 확인합니다.

### Q-D. 변경 범위와 hold 불변 (AC2-1, AC2-5, AC2-10, AC2-12)

1. `git --no-optional-locks diff --name-only 12aa9a3`: 허용 파일 7개 이하와 spec·plan 2개만 나와야 합니다(docs 커밋 포함).
2. `git --no-optional-locks diff -U0 --no-color 12aa9a3 -- claude/skill/references/worktree-creation.md gemini/skill/references/coordination.md gemini/skill/references/worktree-creation.md grok/skill/references/worktree-creation.md tests/node/composite-instructions.test.mjs | grep '^@@'`
   - 기대: claude `@@ -10 +10 @@`, `@@ -13 +13 @@` / gemini coord `@@ -226 +226 @@` / gemini wc, grok wc 각각 `@@ -6 +6 @@`, `@@ -8 +8 @@` / test `@@ -91 +91 @@`
   - 이 결과로 H2(`:6`)와 OD-3 상속 줄의 불변이 확인됩니다.
3. `git --no-optional-locks diff --exit-code --stat 12aa9a3 -- claude/skill/references/handoff-prep.md codex/skill/references/handoff-prep.md gemini/skill/references/handoff-prep.md grok/skill/references/handoff-prep.md shared/skill/references/handoff-worktree.md; echo "exit=$?"`
   - 기대: `exit=0`(H1, H2-shared, H4, H5)
4. `sed -n '10p' claude/skill/references/worktree-creation.md | grep -c 'never through a compound Git command'`
   - 기대: 1(H3 소문자 유지)
5. `git --no-optional-locks diff --exit-code --stat 12aa9a3 -- lib/policy/role-policy.json lib/prompts/agent-fragments.json lib/installer/global-config.mjs shared/skill/runtime claude/agents codex/agents gemini/agents grok/agents claude/skill/SKILL.md codex/skill/SKILL.md gemini/skill/SKILL.md grok/skill/SKILL.md README.md docs/harness-operation.md gemini/GEMINI.md gemini/instructions.md grok/AGENTS.md grok/instructions.md lib/installer/language.mjs; echo "exit=$?"`
   - 기대: `exit=0`(원천, 관리 블록, runtime, 불분명, 제외 파일 diff 0)
6. 테스트 diff: `git --no-optional-locks diff -U0 --no-color 12aa9a3 -- tests | grep -E '^[-+][^-+]' | grep -vE '^[-+] *"?[a-zA-Z0-9_./-]*"?: "[0-9a-f]{64}",?$'`
   - 기대: TU-1의 `-`/`+` 2줄만 남습니다. golden SHA 값 줄은 필터에서 빠집니다.
   - 필터에서 빠진 SHA 줄의 키가 기대 범위(두 경로)인지 `grep -E '^[-+]'` 출력으로 눈으로 확인합니다.

### Q-E. 잔존 스캔 (AC2-4, P0-1의 독립 누락 검색 대체)

```
git --no-optional-locks diff -U0 --no-color 96858f3 -- claude/skill codex/skill gemini/skill grok/skill claude/agents codex/agents gemini/agents grok/agents shared/skill/references/handoff-worktree.md ':(exclude)*/skill/models.toml' | grep -E '^\+[^+]' | grep -nwE 'must|may|should|never|Never|do not|Do not|Don.t|don.t'
```

- T0에서는 원 출력을 기록합니다.
- T2 QA에서는 각 줄을 다음 중 하나에 대응시킵니다.
  - P0 표 N01–N23
  - §3.2 hold
  - §3.3 비대상
  - OD-3 상속
- 대응하지 않는 줄은 편집하지 않습니다. "새 후보"로 보고하고 Orchestrator가 판단합니다.
- T2 뒤에는 E1–E7 구가 출력에서 빠져야 합니다. 대문자는 `-w` 소문자 패턴에 걸리지 않습니다. 다만 `Never`는 패턴에 있으므로, E6·E7 줄이 출력에서 사라졌는지 확인합니다.

### Q-F. 링크, 제목, anchor, marker diff 0 (AC2-6, AC2-7)

```
git --no-optional-locks diff -U0 --no-color 12aa9a3 -- claude gemini grok codex shared tests | grep -E '^[-+][^-+]' | grep -cE '\]\(|^[-+]#|<a id=|\{\{'
```

- 기대: 0

### Q-G. 검사 재실행과 기준선 비교 (AC2-10, AC2-13)

- T0 검사 3–11을 같은 명령으로 다시 실행하고 T0 표와 비교합니다.
- 기대:
  - 새 실패 0
  - check 3종 종료 코드 0
  - golden `--diff` 출력 0줄(golden을 갱신한 경우)
- golden이 OD-8로 hold됐다면 `installed-layout-golden.test.mjs`가 새로 실패하는 것은 당연합니다. 이 경우 QA는 "hold로 인한 예상 실패"로 분류해 보고합니다. T2 수락과 커밋은 hold됩니다(아래 hold 조건).

### Q-H. `.git` 메타데이터와 작업 트리

- T0 검사 1–2를 다시 실행해 `.git` 공통 디렉터리 mtime과 branch/HEAD 변화가 없는지 확인합니다.
- `git --no-optional-locks status --porcelain`의 변경 목록이 허용 파일과 같은지 확인합니다.

---

## hold와 중단 조건 (PL-5)

| 조건 | 멈출 범위 | 보고 내용 |
|---|---|---|
| Q-B 대응 줄 검색 결과가 기대와 다름 | T2 전체 | 추가 위치(path:line, 원문), 묶음 포함 여부 판단 필요 |
| T0에서 golden 테스트나 `--diff`가 실패했거나 실행할 수 없음(OD-8) | golden `--write` | T0 출력과 종료 코드, `build/native` 상태 |
| `--diff` 차이가 기대 범위 밖(다른 이름, `+`/`-` 줄, 줄 수 불일치) | golden `--write` | `--diff` 원 출력 |
| golden hold로 golden 테스트가 실패하는 상태 | T2 수락과 커밋 | 실패 ID, 원인, 선택지는 Orchestrator가 정리 |
| 부재(absence) assertion 실패, D3 금지 변경이 필요해 보임 | 해당 편집(묶음이면 묶음 전체, OD-1) | 실패 assertion과 메시지 |
| check 3종 중 하나라도 종료 코드가 0이 아님, `MANIFEST` 변경이 4행이 아님 | T2 수락 | 명령, 출력, diff |
| Q-A, Q-C, Q-D, Q-F 기대와 다름 | T2 수락 | 해당 출력 |
| 기준선 대비 새 실패 | T2 수락 | 1차 §10 표 형식 |
| 허용 파일 밖 변경, `.git` 메타데이터 변경, 예상하지 못한 branch/HEAD | 영향 작업 전체(Stop and inspect) | 실제 경로, branch/HEAD, index, 파일, 완료 단계 |
| 새 R4 후보나 새 규범어 후보 발견 | 편집하지 않음 | 위치와 근거, 보고만 |

hold가 생기면 해당 작업만 멈추고 Orchestrator에 보고합니다. 자동 재시도, 대체 경로, 범위 확장은 하지 않습니다.

---

### T2 진행 기록 (2026-11-20, Orchestrator 수락)

- 상태: 수락됨. Implementer는 bridge dispatch `3303bb40`, QA는 fresh bridge dispatch `65cff2c0`(재확인 2회)다.
- 결과:
  - E1–E7과 TU-1을 적용했다.
  - `MANIFEST.sha256` 4행(`:19`, `:50`, `:57`, `:75`)이 바뀌었다.
  - golden은 `--diff` 16줄이 모두 기대 범위 안이었고, `--write` 뒤 0줄이 됐다.
  - RED→GREEN 3종(composite `:89`, `check:manifest`, golden)을 확인했다.
- QA 판정: AC2-1, AC2-3, AC2-4, AC2-5, AC2-6, AC2-7, AC2-9, AC2-10, AC2-12, AC2-14는 proven이다.
  - AC2-4: 잔존 96줄이 모두 P0 원자료의 `inherited` 행에 대응한다.
  - AC2-14: 개정된 Q-C 기준으로 판정했다.
- AC2-13은 unmet이다. 사용자 결정에 따라 환경 불안정으로 처분했다.
  - 전체 `npm test`에서 실행마다 다른 runtime 테스트가 새로 실패했다(TAP 1658, 1487, 1510).
  - 세 건 모두 단독 실행에서 통과했다.
  - 정적 추적상 T2 변경 파일을 읽는 경로는 0개다.
  - 원인은 fixture 가짜 CLI auth probe의 1,000ms 제한에 걸린 부하·동시 실행으로 추정한다.
- 관찰: 공용 `.git`의 `FETCH_HEAD`와 refs 변경은 다른 세션의 동작이다(`watch-menu-upgrade-reapply`, `bridge-fetch-tolerance` 워크트리). T0·T2 dispatch의 `permission_violation_observed`도 이것 때문이다. 사용자 결정에 따라 외부 변경으로 기록했다.

### 최종 검증 기록 (plan-level, 2026-11-20)

- 최종 Reviewer(native, 1회, 대상 `12aa9a3..1123e9c`)는 승인 가능으로 판정했다. blocker와 major는 0건, minor는 3건이었다.
  - AC2-11 기록: E1–E7과 TU-1의 강도·대상·조건·예외·우선순위·참조가 모두 그대로다.
  - 놓친 대상 문장은 0건이다.
- 지적 처리:
  - R-1(spec §4 parity 문장): 사용자 승인으로 spec v2에서 정정했고, Reviewer 재확인에서 해소됐다.
  - R-2(H1–H4 사유 표기): 사용자 승인으로 spec v2와 plan v3에서 정정했고, 재확인에서 해소됐다.
  - R-3(Implementer 보고의 E2 위치 표기): 최종 보고에서 "Claude `worktree-creation.md:13`"으로 정리한다. 문서 변경은 없다.
  - R-4(plan 머리말의 spec sha 표기, 재확인 중 발견): 사용자 승인으로 plan v4에서 정정했고, 재확인에서 해소됐다.
  - 관찰: AC2-14의 "고유 줄(E1–E3) 외 플랫폼 간 차이가 보존된다"는 "대소문자 외 차이 보존"으로 해석한다. QA는 개정된 Q-C 기준으로 proven 판정했다.
- 전체 상태: T0와 T2를 수락했고 최종 Reviewer 지적은 모두 해소됐다. AC2-13은 사용자 결정에 따라 환경 불안정으로 처분했다.

## 개정 이력

| 버전 | 내용 | 승인 | 사유 |
|---|---|---|---|
| v1 | 최초 승인본(sha256 `c160907f…4088`) | 사용자 2026-11-20 | — |
| v2 | Q-C의 gemini–grok `references/worktree-creation.md` 기대값을 `SAME`에서 `CASE_ONLY`(E4·E5)로 정정 | 사용자 2026-11-20T22:12:52+0900 | 6행의 플랫폼 이름 차이를 반영하지 못한 기대값 오류. 영향 작업은 T2 QA 재확인 |
| v3 | 최종 보고 형식 5번의 H1–H4 R4 후보 사유를 "주체 생략"에서 "동사 없는 never 생략구"로 정정 | 사용자 2026-11-20T22:42:23+0900 | 최종 Reviewer minor R-2(1차 §4.1-4 hold 유형 표기 정정). 판정·AC 불변, 영향 작업 없음 |
| v4 | 머리말의 spec sha 표기를 "현재"에서 "v1(`0e3f237`) 시점"으로 정정하고 spec 개정 이력을 참조하도록 함 | 사용자 2026-11-20T22:44:13+0900 | 최종 Reviewer 재확인 minor R-4(spec v2 정정의 부수 효과). 의미 불변 |

## 최종 보고 형식 (PL-6, Orchestrator가 작성)

1. **수정 목록:** E1–E7(파일:줄, 이전→이후), TU-1, `MANIFEST.sha256` 4행, golden(갱신 또는 hold), 커밋 SHA
2. **제외 목록**(1차 §11.2 형식): superpowers 파일군, `docs/superpowers/**` 기존 파일, 코드와 설정(`*/skill/models.toml`, `lib/installer/language.mjs`, `lib/policy/render.mjs`, `lib/prompts/render.mjs`, `shared/skill/runtime/*.mjs`), 범위 기간에 바뀌지 않은 claude/codex `limits.md`·`arc-visual-companion.md`
3. **불분명 목록:** `docs/harness-operation.md`(D5), `README.md`(OD-4), `gemini/GEMINI.md`·`gemini/instructions.md`·`grok/AGENTS.md`·`grok/instructions.md`(OD-5, 생성과 소비 경로 미확인)
4. **hold 목록:** H1(새 hold, 1차 대응 미확인), H2, H3, H4, H5. OD-3 상속 hold의 gemini/grok 사본 위치. 실행 중 생긴 hold(예: golden)
5. **R4 후보:** H1–H4, 모두 "동사 없는 never 생략구, 근거 미확인". 실행 중 새로 발견한 후보
6. **`shared/skill/references/handoff-worktree.md:25/:32`:** 1차 개별 판정 귀속을 확인하지 못했습니다. `:25`는 비대상, `:32`는 hold로 처리했고 바이트는 바뀌지 않았습니다.
7. **범위 밖 관찰:** OD-7 `lib/installer/language.mjs`의 Run mode 문구(제외, 수정 안 함)
8. **검증 요약:** T0 표, T2 QA 결과(Q-A–Q-H), 최종 Reviewer 판정과 지적 처리, follow-up 커밋(있으면), 남은 hold

---

## Orchestrator 판단(2026-11-20, plan 저장 시)

- golden hold 연쇄: OD-8로 `--write`가 hold되고 golden 테스트 실패 때문에 T2 수락이 막히면, Orchestrator는 원인과 선택지를 정리해 사용자 결정을 요청한다. 자동으로 갱신하거나 우회하지 않는다.
- bridge sandbox와 tmpdir: bridge QA나 Implementer가 OS tmpdir 쓰기 거부로 `npm test` 또는 `installed-layout.mjs`를 실행하지 못하면 "실행 불가"로 반환한다. Orchestrator는 실행 주체를 바꾸지 않고 사용자에게 보고한다.
- 커밋 type과 scope: 제안(`docs(harness)`, `refactor(skill)`, `fix(skill)`)을 채택한다.
- canonical handoff 기록: 워크트리 격리 세션에서는 `.git/arc/review/`에 쓸 수 없다. 그래서 세션 scratchpad의 `handoff.md`를 임시 canonical 기록으로 쓰고, 세션 종료 전에 `<git-common-dir>/arc/review/harness-doc-refactor-2/`로 옮긴다.
