# 하네스 지침 문서 의미 보존 리팩토링 구현 계획

> **실행 방식:** ARC Orchestrator가 조정한다. 작업마다 Implementer(Codex bridge, `allowedPaths` 필수)가 구현하고, fresh QA(Codex bridge, 쓰기 없음)가 검증한다. 이후 Orchestrator가 수락하고 집중 커밋 1개를 만든다. T1–T4를 모두 수락한 뒤 최종 Reviewer가 1회 검토한다. Git 상태 변경(stage/commit/branch)은 Orchestrator만 한다. 진행은 checkbox(`- [ ]`)로 기록한다.

**목표:** 승인된 spec에 따라 ARC 하네스 지침의 규범 표현을 MUST/MUST NOT/SHOULD/SHOULD NOT/MAY, NEVER, DO NOT으로 대문자화한다. 근거가 있는 R4 구체화만 적용하며 의미는 바꾸지 않는다.

**구조:** 생성 원천 문구를 편집한 뒤 재생성하고, 고정 테스트·fixture를 짝지어 갱신한 다음 MANIFEST를 재생성한다. 공유 fixture와 MANIFEST 때문에 T1 → T2 → T3 → T4 순서로 진행한다.

**기술:** Node ≥22(`node --test`), Python 3 `unittest`, JSON/Markdown/TOML.

**Spec:** `docs/superpowers/specs/2026-11-13-harness-doc-refactor-design.md` (sha256 `98eafab1867ba2ad6b2e1a929cbaeb529060f37303b1da038c6ecfec17f7cf2d`, 2026-11-13 승인). 판정 규칙(§4), 대조표 형식(§11.1), 테스트 갱신 기록 형식(§8.4)의 정본은 spec이다. 이 계획에 다시 쓰지 않는다.

## 실행 대상

- 저장소 `/Users/yunho/Desktop/project/arc`, branch `refactor/harness-doc-refactor`, base `e0bac40357749d246dcfaa579343a041d1c7afd5`
- 착수 전제(Orchestrator): spec과 이 plan이 승인되고 두 문서가 문서 커밋으로 들어간다. handoff 때마다 branch, HEAD, 변경 상태를 다시 확인한다.

## 실행 세부 결정(Orchestrator, spec 범위 안)

- O1 (O8로 개정) `tests/node/plan.test.mjs:147-154` renderingBaseline SHA는 spec D3의 "SHA 갱신 허용" 범주로 본다. 해당 작업에서 실패하는 키만 갱신한다.
- O8 (2026-11-13 사용자 승인, T1 QA 이후 개정) T0 기준선에서 이미 실패하던 SHA·바이트 기대값은 갱신하지 않고 기준선 실패로 둔다. 대상은 `instruction-contracts.json`의 `protected`와 `agentProfileBaseline.profiles`, `plan.test.mjs`의 renderingBaseline 등이다. 이 실패에는 이번 변경 이전부터 있던 차이가 섞여 있어, 갱신하면 그 차이까지 보호 기준으로 굳어지기 때문이다. 이 SHA 갱신 지시는 T1–T4의 "갱신 대상" 목록보다 우선한다. T0에서 통과하던 SHA·바이트 테스트가 작업 때문에 실패하게 될 때만 해당 기대값을 갱신한다. 문자열 기대값의 짝지어 갱신(D3·D7)은 그대로 유지한다.
- O2 `agentProfileBaseline.revision`은 내용 SHA가 아니므로 바꾸지 않는다.
- O3 `tests/installer-parity.json`은 편집하지 않는다. `scripts/check-installer-parity.mjs:11-16`이 `legacyInventory`/`legacyHelpers`를 SHA(`b21f21cb…`)와 개수로 고정하므로, 기록된 expression은 바꿀 수 없다. D9(갱신 허용)는 갱신이 필요한 경우가 없어 적용되지 않는다. 테스트 이름을 바꾸면 destination 검사(`:21-23`)가 깨지므로 테스트 이름은 바꾸지 않는다.
- O4 P0 정정: `tests/test_harness_contract.py:713`은 `docs/harness-operation.md`(D5 제외)를 읽으므로 영향이 없다. `tests/node/instruction-layout.test.mjs:127,131-133`과 `tests/node/composite-instructions.test.mjs:35`는 T3 갱신 후보에 추가했다.
- O5 기준선 Python 범위는 `test_arc_policy.py`, `test_harness_contract.py`, `test_claude_payload.py`의 3종이다. `test_codex_models.py`와 `test_token_usage.py`는 대상 파일(SKILL.md, references, role-policy)을 읽지 않는다.
- O6 작업 기록은 작업 트리 밖 `$(git rev-parse --git-common-dir)/arc/review/harness-doc-refactor/`에 두고 커밋하지 않는다.
- O7 (2026-11-13 사용자 승인, T0 이후 개정) T0 기준선에서 node 139개(1911개 중 pass 1758), Python 고유 170개(subTest 포함 575건)가 이미 실패하고 `check-installer-parity`도 실패한다. 이 때문에 고정 문구 테스트만으로는 회귀를 잡기 어렵다. QA 판정을 Q-FULL의 강화 기준으로 바꾸고, 테스트와 무관한 구조 검사 Q-A–Q-E와 최종 Reviewer를 주 안전장치로 삼는다. 이미 실패하는 테스트에 걸리는 fixture·기대값도 계획대로 짝지어 갱신하되, 그 갱신만으로 해당 테스트가 통과하리라고 기대하지 않는다.

## 전역 제약(spec 요지, 모든 작업에 적용)

- G1 규칙의 추가·삭제·강도 변경, 동작·코드·스키마 변경, 새 테스트, 통합(0건), 링크·제목·anchor 변경을 금지한다(§2, §6).
- G2 판정은 §4.1 순서를 따르고, hold는 §4.4 목록과 작업 중 추가분으로 한다. hold한 발생은 바이트를 바꾸지 않는다. 플랫폼 쌍 중 한쪽이 hold이면 양쪽 모두 hold한다(§4.3).
- G3 관리 블록, `{{ARC_*}}` marker 줄, frontmatter·TOML의 비`developer_instructions` 키, `#` 제목, `<a id>` 줄은 직접 편집하지 않는다(§3.1).
- G4 산출물(관리 블록 24 target, runtime `role-policy.json` 2개, `MANIFEST.sha256`)은 재생성으로만 갱신한다(§3.3, §7).
- G5 테스트 변경은 같은 줄 안에서 기대값 문자열, SHA, 숫자 리터럴을 교체하는 것으로만 한다. 테스트 파일의 줄 수와 테스트 이름은 바꾸지 않는다. assertion 삭제, 정규식 완화, 대소문자 무시 추가·제거, 구조 변경은 금지한다. 부재 assertion(`assertNotIn`/`doesNotMatch`/`!includes`)은 고치지 않는다. 그 assertion이 실패하면 해당 변경을 hold한다(§8.1).
- G6 `tests/installer-parity.json`은 편집하지 않는다(O3). 편집이 필요해지면 hold한다.
- G7 공통 문장은 같은 작업 안에서 양 플랫폼에 함께 편집한다. 플랫폼 간 차이는 보존한다(§9).
- G8 제외(§3.4)와 불분명(§3.5, `docs/harness-operation.md` 포함) 파일의 diff는 0이어야 한다.

## 공통 기록 위치(작업 트리 밖, 커밋하지 않음)

`REV=$(git rev-parse --git-common-dir)/arc/review/harness-doc-refactor`

- `$REV/T0-baseline.md`: T0 표와 실패 ID 전체 목록
- `$REV/T<n>-ledger.md`: 작업별 §11.1 대조표, §8.4 테스트 갱신 기록, hold·R4 후보·불분명 추가분
- `$REV/T<n>-qa.md`: 작업별 QA 결과
- `<git-common-dir>/arc/review/harness-doc-refactor.diff`: 최종 Reviewer 입력

## 커밋 규칙

- C1 작업당 집중 커밋 1개(T0 제외). 메시지는 `type(scope): 한국어 설명` 형식이다.
- C2 Orchestrator는 수락 직후 이 plan의 해당 작업 checkbox를 갱신하고 그 변경을 같은 작업 커밋에 포함한다.
- C3 최종 Reviewer 지적을 고친 결과는 Reviewer 재확인이 끝날 때까지 커밋하지 않는다. 해소되면 후속 커밋 1개(`fix(harness): 최종 검토 지적 반영`)를 만든다.
- C4 push, merge, 배포, 실제 전역 설치는 하지 않는다.

---

## 공통 QA 절차(작업별 QA가 참조)

`BASE`는 직전 수락 커밋이다(T1은 문서 커밋, T2는 T1 커밋, …). QA는 커밋되지 않은 작업 트리를 `BASE`와 비교한다. 아래 명령은 stdin heredoc으로 실행하므로 저장소에 파일을 만들지 않는다.

### Q-FULL: 전체 검사(T0과 같은 명령)

```sh
cd /Users/yunho/Desktop/project/arc
node --test --test-reporter=tap tests/node/*.test.mjs 2>&1; echo "exit=$?"   # "# fail N"과 "not ok" 줄의 테스트명을 수집
python3 -B -m unittest discover -v -s tests -p test_arc_policy.py;       echo "exit=$?"
python3 -B -m unittest discover -v -s tests -p test_harness_contract.py; echo "exit=$?"
python3 -B -m unittest discover -v -s tests -p test_claude_payload.py;   echo "exit=$?"
npm run check:role-policy;                       echo "exit=$?"
npm run check:manifest;                          echo "exit=$?"
node scripts/update-runtime-assets.mjs --check;  echo "exit=$?"
node scripts/check-installer-parity.mjs;         echo "exit=$?"
git diff --check "$BASE";                        echo "exit=$?"
```

판정(O7 강화 기준):

- 실패 테스트 ID 집합이 T0 집합의 부분집합이어야 한다(새 실패 0).
- Python은 고유 ID별 `FAIL:`/`ERROR:` 발생 횟수(subTest 포함)가 T0보다 늘면 안 된다. node는 `# pass` 수가 T0(1758)보다 줄면 안 된다.
- T0에서 실패했다가 통과로 바뀐 ID, 또는 발생 횟수가 줄어든 ID는 D7 대상인지 대조한다.
- `check:*`, `--check`, `git diff --check`는 T0에서 0이었다면 0을 유지해야 한다. `check-installer-parity`는 T0에서 이미 실패했으므로 같은 실패 메시지(`Original assertion inventory changed`)가 유지되는지만 본다.
- 출력은 실패 ID만 추린 형태로 수집한다: node는 `| grep -E '^(not ok|# (tests|pass|fail))'`, Python은 `2>&1 | grep -E '^(FAIL|ERROR):|^Ran |^FAILED|^OK' | sort | uniq -c`로 받는다.

### Q-A: JSON 원천 비문구 diff 0(§7, AC-10)

```sh
python3 -B - "$BASE" <<'PY'
import json,subprocess,sys
base=sys.argv[1]
def load(rev,p):
    return json.loads(subprocess.run(['git','show',f'{rev}:{p}'],capture_output=True,text=True,check=True).stdout if rev else open(p,encoding='utf-8').read())
def mp(d):
    for r in d['rules']: r['text']='<T>'
    for k in d['platforms']: d['platforms'][k]['notice']='<T>'
    return d
def mf(d):
    for f in d['fragments']: f['text']='<T>'
    return d
for p,m in [('lib/policy/role-policy.json',mp),('lib/prompts/agent-fragments.json',mf)]:
    a,b=json.dumps(m(load(base,p))),json.dumps(m(load(None,p)))
    print(p,'OK' if a==b else 'NON-WORDING-DIFF')
f=json.load(open('lib/prompts/agent-fragments.json'))
print('fragments',len(f['fragments']),[len(t['fragments']) for t in f['targets']])   # 기대: 26 [8,14,10,12,11,5,12,8,10,9]
PY
```

### Q-B: 대소문자 접기 비교와 보호 요소 diff 0(§7, AC-3·6·7·9)

```sh
python3 -B - "$BASE" $(git diff --name-only "$BASE" -- . ':!tests' ':!MANIFEST.sha256' ':!docs/superpowers') <<'PY'
import re,sys,difflib,subprocess
base,paths=sys.argv[1],sys.argv[2:]
W=re.compile(r"[A-Za-z']+"); TICK=re.compile(r'`[^`\n]*`'); LINK=re.compile(r'\]\(([^)]*)\)')
NEW={'MUST','NOT','SHOULD','MAY','NEVER','DO'}; OLD={'must','not','should','may','never','do',"don't"}
fold=lambda s:s.lower().replace("don't","do not")
def case_only(a,b):
    if fold(a)!=fold(b): return False
    wa,wb=W.findall(a),W.findall(b)
    for op,i1,i2,j1,j2 in difflib.SequenceMatcher(a=wa,b=wb,autojunk=False).get_opcodes():
        if op!='equal' and not(set(wb[j1:j2])<=NEW and {w.lower() for w in wa[i1:i2]}<=OLD): return False
    return True
bad=0
for p in paths:
    old=subprocess.run(['git','show',f'{base}:{p}'],capture_output=True,text=True).stdout.split('\n'); new=open(p,encoding='utf-8').read().split('\n')
    if len(old)!=len(new): print('LINECOUNT',p,len(old),len(new)); bad=1; continue
    for i,(a,b) in enumerate(zip(old,new),1):
        if a==b: continue
        prot=TICK.findall(a)!=TICK.findall(b) or LINK.findall(a)!=LINK.findall(b) or a.lstrip().startswith('#') or '<a id=' in a or '{{ARC_' in a or 'ARC role policy: contract' in a
        print(('PROTECTED ' if prot else '')+('CASE' if case_only(a,b) else 'NONCASE'),f'{p}:{i}'); bad|=prot
sys.exit(bad)
PY
```

판정: `PROTECTED`와 `LINECOUNT`는 0이어야 한다. `CASE` 줄은 대조표의 대문자화 행, `NONCASE` 줄은 대조표의 R4 행과 1:1로 대응해야 한다(AC-9). 관리 블록 target 파일의 `NONCASE`는 원천 R4 행으로 설명돼야 한다. `global-config.mjs`의 diff hunk는 42–43행 안에 있어야 하며, 따옴표 경계, `+` 연결, 삼항식 개수가 같은지 `git diff "$BASE" -- lib/installer/global-config.mjs`로 직접 확인한다.

### Q-C: 플랫폼 parity(§9, AC-14)

```sh
python3 -B - "$BASE" <<'PY'
import difflib,subprocess,sys
base=sys.argv[1]
names=['skill/SKILL.md']+[f'skill/references/{n}.md' for n in 'commit coordination git-recovery handoff handoff-prep limits planning verification arc-visual-companion'.split()]
show=lambda p:subprocess.run(['git','show',f'{base}:{p}'],capture_output=True,text=True,check=True).stdout.splitlines()
cur=lambda p:open(p,encoding='utf-8').read().splitlines()
d=lambda a,b:[l for l in difflib.unified_diff(a,b,n=0,lineterm='') if not l.startswith(('@@','---','+++'))]
for n in names:
    x,y=d(show('claude/'+n),show('codex/'+n)),d(cur('claude/'+n),cur('codex/'+n))
    print('PARITY-SAME' if x==y else 'PARITY-CHANGED',n)
    if x!=y: print('\n'.join(difflib.unified_diff(x,y,n=0,lineterm='')))
PY
```

판정: `PARITY-CHANGED`의 차이는 모두 대조표에서 플랫폼 쌍이 "고유"인 행 ID로 설명돼야 한다. `tests/node/composite-instructions.test.mjs` parity 테스트도 Q-FULL에서 통과해야 한다(T0 기준).

### Q-D: 테스트 변경 규칙(§8.1, AC-12, G5)

```sh
git diff --numstat "$BASE" -- tests   # 파일마다 추가 줄 수 = 삭제 줄 수
python3 -B - "$BASE" $(git diff --name-only "$BASE" -- tests) <<'PY'
import re,sys,difflib,subprocess
base,paths=sys.argv[1],sys.argv[2:]
W=re.compile(r"[A-Za-z']+"); T=re.compile(r"[A-Za-z0-9']+")
NEW={'MUST','NOT','SHOULD','MAY','NEVER','DO'}; OLD={'must','not','should','may','never','do',"don't"}
fold=lambda s:s.lower().replace("don't","do not")
FLAGS=[r're\.I\b',r'IGNORECASE',r'\(\?i\)',r'\.lower\(\)',r'/[gimsuy]*i[gimsuy]*(?=[,);.\s])',r'assertNotIn',r'doesNotMatch',r'!\w*\.includes']
def case_only(a,b):
    if fold(a)!=fold(b): return False
    wa,wb=W.findall(a),W.findall(b)
    return all(op=='equal' or (set(wb[j1:j2])<=NEW and {w.lower() for w in wa[i1:i2]}<=OLD) for op,i1,i2,j1,j2 in difflib.SequenceMatcher(a=wa,b=wb,autojunk=False).get_opcodes())
def literal_only(a,b):
    ta,tb=T.findall(a),T.findall(b)
    return len(ta)==len(tb) and all(x==y or (re.fullmatch(r'[0-9a-f]{64}',x) and re.fullmatch(r'[0-9a-f]{64}',y)) or (x.isdigit() and y.isdigit()) for x,y in zip(ta,tb))
bad=0
for p in paths:
    o=subprocess.run(['git','show',f'{base}:{p}'],capture_output=True,text=True).stdout; n=open(p,encoding='utf-8').read()
    for f in FLAGS:
        if len(re.findall(f,o))!=len(re.findall(f,n)): print('FLAG-COUNT',p,f); bad=1
    ol,nl=o.split('\n'),n.split('\n')
    if len(ol)!=len(nl): print('LINECOUNT',p); bad=1; continue
    for i,(a,b) in enumerate(zip(ol,nl),1):
        if a!=b: print('CASE' if case_only(a,b) else 'LITERAL' if literal_only(a,b) else 'REVIEW',f'{p}:{i}')
sys.exit(bad)
PY
```

판정: `FLAG-COUNT`와 `LINECOUNT`는 0이어야 한다. 모든 `CASE`/`LITERAL` 줄은 §8.4 기록 행과 1:1로 대응해야 한다. `REVIEW` 줄은 QA가 직접 확인하고 사유를 보고한다. 기대값 문자열 교체이면서 대조표 행과 짝지어지면 허용하고, 그 밖의 경우는 실패로 처리한다.

### Q-E: 잔존 스캔(AC-4·5)

```sh
python3 -B - <작업 범위 파일들> <<'PY'
import re,sys
P=re.compile(r"\b(?:[Mm]ust|[Ss]hould|[Mm]ay)\b|\b[Nn]ever\b|\b[Dd]o not\b|\b[Dd]on't\b|\bMUST not\b")
for p in sys.argv[1:]:
    inside=False
    for i,l in enumerate(open(p,encoding='utf-8'),1):
        if 'ARC role policy: contract begin' in l: inside=True
        for m in P.finditer(l): print('MANAGED' if inside else 'OPEN',f'{p}:{i}',m.group(0),'|',l.strip()[:140])
        if 'ARC role policy: contract end' in l: inside=False
PY
```

판정: `OPEN`으로 잡힌 각 발생은 대조표의 비대상(§4.1 단계 명시) 또는 hold 기록과 대응해야 한다. `MANAGED`는 T1 원천 대조표에서 판정한다. §4.2의 비대상 예시 위치는 diff가 0이어야 한다.

---

## T0: 기준선 QA(커밋 없음)

- **목표:** 변경 전 실패를 기록하고 분류한다. 이후 "새 실패 0" 판정의 기준이 된다.
- **선행:** plan 승인과 문서 커밋. **산출물:** `$REV/T0-baseline.md`(QA 보고를 Orchestrator가 저장). **수정 파일:** 없음.
- **Python 실행 형태 근거:** `scripts/check-installer-parity.mjs:56`(`python3 -B -m unittest discover -v -s tests -p <file>`), `docs/superpowers/plans/2026-10-20-harness-instruction-copyedit.md:95-97`.

- [x] T0-1 QA가 문서 커밋 HEAD에서 Q-FULL을 실행한다(`git diff --check`는 생략). `git status --porcelain` 결과도 기록한다.
- [x] T0-2 표를 작성한다: `검사 | 종료 코드 | 실패 테스트 ID | 실패 메시지 요지 | 분류(baseline/D7 후보/불명)`. node는 `not ok` 줄의 테스트명 전체를, Python은 `FAIL:`/`ERROR:` 줄의 `module.Class.test` 전체를 적는다.
- [x] T0-3 분류 규칙을 적용한다.
  - **D7 후보:** 기대 문자열이나 정규식이 원문과 대소문자 표기만 다르고, 그 표기가 승인 표기(§4.1-5)와 일치한다. 확정 사례는 `tests/test_harness_contract.py:696`이다.
  - **baseline:** 기대 문구가 대소문자 접기 후에도 저장소에 없거나, 실패 원인이 표기와 무관하다.
    - `tests/test_arc_policy.py:1344`(`if Planner fails or is unavailable, stop and report, never draft instead`)는 문구 부재 → baseline. 유지하고 수정하지 않는다.
    - `tests/test_harness_contract.py:91`도 문구 부재 → baseline이다. `.lower()` 경로(`:209-211`)라 대소문자 변경의 영향을 받지 않는다.
  - **불명:** 위 둘로 정할 수 없다. 해당 테스트가 읽는 파일을 바꾸는 작업은 Orchestrator 판단 전까지 hold한다.
- [x] T0-4 사용자가 제공한 "node 테스트 실패 69개"의 재현 여부(실제 `# fail` 수)를 기록한다.
- [x] T0-5 `tests/node/plan.test.mjs:147-154` renderingBaseline 8개 테스트, `tests/node/instruction-layout.test.mjs:135-137`(`protected`), `tests/node/agent-fragments.test.mjs:19-36`의 기준선 통과 여부를 따로 적는다.
- **hold:** 검사 명령 자체가 실행되지 않으면(환경·의존성 오류) 모든 작업을 hold하고 보고한다. 의존성 설치나 환경 변경은 하지 않는다.

## T1: 역할 정책 원천 문구 대문자화와 관리 블록 재생성

- **목표:** `lib/policy/role-policy.json`의 `rules[].text`와 `platforms.*.notice`에 §4 판정을 적용한다(확정 사례: `:50`, `:82`의 `MUST not`→`MUST NOT`). 24 target 관리 블록과 runtime 복제본을 재생성하고 fixture를 짝지어 갱신한다.
- **선행:** T0 수락.
- **Implementer `allowedPaths`:**
  - `lib/policy/role-policy.json`
  - 재생성 출력으로만 변경: `claude/skill/SKILL.md`, `codex/skill/SKILL.md`, `{claude,codex}/skill/references/{coordination,planning,handoff,handoff-prep,commit,verification}.md`, `claude/agents/arc-{scouter,planner,implementer,qa,reviewer}.md`, `codex/agents/arc-{scouter,planner,implementer,qa,reviewer}.toml`
  - `claude/skill/runtime/role-policy.json`, `codex/skill/runtime/role-policy.json`
  - `tests/node/fixtures/instruction-contracts.json`, `tests/node/plan.test.mjs`
  - `tests/test_harness_contract.py`, `tests/test_arc_policy.py`, `tests/test_claude_payload.py`
  - `MANIFEST.sha256`
- **갱신 대상 테스트·fixture(원문 출처가 관리 블록인 경우만):**
  - `tests/test_harness_contract.py:696` regex `must not self-authorize release` → `MUST NOT self-authorize release`(D7, 원천 `role-policy.json:50`)
  - `tests/test_arc_policy.py:1343` `…; never author`(출처 `planning.plan-amend`). 대상으로 판정되면 `NEVER author`로 바꾼다. 같은 테스트가 `:1344` baseline 실패로 계속 실패할 수 있으며, 그 경우 baseline 유지로 기록한다.
  - `tests/test_claude_payload.py:564`(같은 문구, 관리 블록 출처일 때)
  - `tests/test_arc_policy.py:609`, `:652`(`raw_policy_text`): 대상 단어가 포함된 원천 문장이 바뀔 때만
  - `instruction-contracts.json` `contracts[].text`/`opening` 중 관리 블록 출처 문자열
  - `instruction-contracts.json` `protected`: `lib/policy/role-policy.json`(:286), runtime `role-policy.json` 2개(:268, :282), claude agents 5개(:256–260), codex agents 5개(:270–274)
  - `agentProfileBaseline.profiles` 10개(:313–322)
  - `tests/node/plan.test.mjs:147-154` renderingBaseline(O1, T1 후 실패하는 키만)
  - 확인만 하고 수정하지 않는 것: `tests/test_harness_contract.py:713`(O4), `tests/node/instruction-layout.test.mjs:99,102`(`rule.text` 동적 대조)

- [x] T1-1 작업 시작 시 HEAD, branch, 변경 상태가 handoff와 일치하는지 확인한다. 위 테스트 행마다 원문 줄과 관리 블록 여부를 확정한다(관리 블록 출처가 아니면 T3 소관이므로 손대지 않는다).
- [x] T1-2 원천 문구를 편집한다(`rules[].text`, `platforms.*.notice`만). §4 판정, §4.4 hold, 근거 있는 R4만 적용한다. 대조표 행마다 비고에 반영 target 수를 적는다(§11.1, §13).
- [x] T1-3 `npm run update:role-policy` → `npm run check:role-policy`(기대: exit 0).
- [x] T1-4 `node scripts/update-runtime-assets.mjs` → `node scripts/update-runtime-assets.mjs --check`(기대: exit 0). 이 스크립트는 `lib/policy/role-policy.json`을 양 플랫폼 `skill/runtime/role-policy.json`으로 복사한다(`scripts/update-runtime-assets.mjs:20-22`). 복제본이 원천과 바이트가 다르면 hold한다(§7-3).
- [x] T1-5 fixture와 테스트를 갱신한다. 문자열은 같은 줄에서 교체하고, 파일 SHA는 `shasum -a 256 <file>`로 다시 계산한다. `agentProfileBaseline`은 `lib/prompts/render.mjs`의 렌더 함수로 각 target을 렌더한 결과의 SHA-256으로 계산한다(`tests/node/agent-fragments.test.mjs`의 계산 방식과 같게). `plan.test.mjs` 값은 실패 메시지의 actual hash를 기록하고, 2회 실행으로 결정적인지 확인한다. §8.4 기록을 작성한다.
- [x] T1-6 `node scripts/update-manifest.mjs` → `npm run check:manifest`(기대: exit 0).
- [x] T1-7 Implementer가 Q-FULL을 실행하고 대조표, §8.4 기록, hold, R4 후보, 불분명 추가분을 보고한다.
- [x] T1-8 fresh QA: Q-FULL, Q-A, Q-B(원천 + 관리 블록 target), Q-C, Q-D, Q-E(`lib/policy/role-policy.json`). 24 target의 diff가 관리 블록 안에만 있는지(begin~end 밖의 바뀐 줄 0), 바뀐 파일이 모두 `allowedPaths` 안에 있는지 확인한다.
- [x] T1-9 Orchestrator가 수락하고 checkbox를 갱신한 뒤 커밋한다: `refactor(policy): 역할 정책 규범 표기 대문자화`.
- **수용 기준:** AC-3, AC-4(원천), AC-5, AC-6, AC-9, AC-10(role-policy), AC-11, AC-12, AC-13(`:696` 통과), AC-14(관리 블록 쌍), AC-15.
- **진행 기록(2026-11-13 수락):** T0 기준선은 node fail 139/pass 1758, Python 고유 170개(575건), installer parity 실패. T1은 원천 10개 규칙의 18곳을 대소문자만 바꿨다(S1–S10, 24 target 재생성). O8에 따라 SHA 기대값 31행은 BASE로 유지하고, 테스트 갱신은 D7 2행(`tests/test_harness_contract.py:681,696`)만 했다. QA 16415e2d에서 AC-4·5·6·9·10·11·12가 proven이다. AC-13·14는 Orchestrator가 직접 확인했다(`test_arc_policy` ID 108개·339건 불변, composite 12/12 통과). node는 pass 1759/fail 138로 새 실패 0이다. AC-3·15는 최종 Reviewer가 판정한다.
- **hold:** 생성 명령 실패나 `--check` 불일치, 비문구 diff, 관리 블록 밖 diff, 부재 assertion 실패, T0에 없던 실패, 테스트 줄 수·이름 변경 필요, `tests/installer-parity.json` 변경 필요, `allowedPaths` 밖 파일 변경.

## T2: 에이전트 조각 문구와 템플릿 산문 대문자화

- **목표:** `lib/prompts/agent-fragments.json`의 `fragments[].text`에 §4 판정을 적용한다. `id`, 26개, 역할별 개수 `[8,14,10,12,11,5,12,8,10,9]`는 유지한다. 템플릿 marker·관리 블록 밖 산문 3곳에도 같은 판정을 적용한다: `claude/agents/arc-planner.md:26` Do not, `claude/agents/arc-implementer.md:29` never, `claude/agents/arc-scouter.md:28` Do not.
- **선행:** T1 수락.
- **Implementer `allowedPaths`:** `lib/prompts/agent-fragments.json`, `claude/agents/arc-planner.md`, `claude/agents/arc-implementer.md`, `claude/agents/arc-scouter.md`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/plan.test.mjs`, `tests/test_claude_payload.py`, `tests/test_arc_policy.py`, `MANIFEST.sha256`
- **갱신 대상:**
  - `agentProfileBaseline.profiles`: 영향받는 프로필
  - `protected`: 본문을 고친 claude agents(:256, :257, :260 중 해당)
  - `tests/test_claude_payload.py:469`(arc-planner 렌더 "never Reviewer as a per-task")
  - `tests/test_claude_payload.py:572` regex `NEVER`(이미 대문자, 영향 확인)
  - `tests/test_arc_policy.py:1410`, `:1564`(이미 대문자, 원문 변경 시에만)
  - `tests/node/plan.test.mjs:147-154`(실패 키만)
  - 영향 없음: `tests/node/agent-fragments.test.mjs:15`(`/i`), `tests/test_arc_policy.py:1350`
  - codex agents 산문에는 대상이 없다(P0). 다른 산문 대상을 발견하면 편집하지 않고 보고한다.

- [ ] T2-1 handoff 상태를 확인하고 각 테스트 행의 원문 출처(fragment, 템플릿 산문, 관리 블록)를 확정한다. 관리 블록 출처이면 T1에서 처리됐어야 하므로 불일치를 보고한다.
- [ ] T2-2 fragments 문구와 산문 3곳을 편집한다. frontmatter, marker 줄, 관리 블록은 건드리지 않는다.
- [ ] T2-3 `npm run check:role-policy`(기대: exit 0, 관리 블록 불변 확인)
- [ ] T2-4 T1-5와 같은 방법으로 SHA를 다시 계산하고 문자열을 갱신한 뒤 §8.4 기록을 작성한다.
- [ ] T2-5 `node scripts/update-manifest.mjs` → `npm run check:manifest`
- [ ] T2-6 Implementer가 Q-FULL을 실행하고 보고한다.
- [ ] T2-7 fresh QA: Q-FULL(`tests/node/agent-fragments.test.mjs` 통과 포함), Q-A(조각 수·역할별 개수 출력 포함), Q-B, Q-D, Q-E(`agent-fragments.json` + 3개 파일 비관리 구간)
- [ ] T2-8 Orchestrator가 수락하고 checkbox를 갱신한 뒤 커밋한다: `refactor(agents): 에이전트 지침 조각 규범 표기 대문자화`.
- **수용 기준:** AC-3, AC-4, AC-5, AC-6, AC-9, AC-10(fragments), AC-11, AC-12, AC-13, AC-15.
- **hold:** T1 hold 조건에 더해, 조각 ID·개수 변경이 필요한 경우와 frontmatter·TOML 비`developer_instructions` 키에 대상 단어가 있는 경우(§3.1).

## T3: SKILL.md와 references 비관리 구간 대문자화

- **목표:** 양 플랫폼 SKILL.md, references 9종, Codex `handoff-worktree.md`의 관리 블록 밖 산문에 §4 판정과 근거 있는 R4를 적용한다. 공통 문장은 양쪽에 함께 적용한다.
- **선행:** T2 수락.
- **Implementer `allowedPaths`:**
  - `claude/skill/SKILL.md`, `codex/skill/SKILL.md`
  - `{claude,codex}/skill/references/{commit,coordination,git-recovery,handoff,handoff-prep,limits,planning,verification,arc-visual-companion}.md`
  - `codex/skill/references/handoff-worktree.md`
  - `tests/node/composite-instructions.test.mjs`, `tests/node/instruction-layout.test.mjs`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/plan.test.mjs`
  - `tests/test_arc_policy.py`, `tests/test_claude_payload.py`, `tests/test_harness_contract.py`
  - `MANIFEST.sha256`
- **갱신 대상(원문이 바뀌는 경우만):**
  - `composite-instructions.test.mjs`: `:20`("Never substitute"), `:29`(Pre-action gate record), `:35`(planning 링크 문장), `:46`("Never invoke `arc-<role>`…"). `:70-74`는 `/i`이므로 영향 없다.
  - `instruction-layout.test.mjs`: `:127`, `:131-132`(codex `git-recovery.md` "never broad Git access"). `:133` `doesNotMatch`는 수정 금지다.
  - `instruction-contracts.json`: `opening`(14·126), 계약 문자열 쌍 19·131, 33·145, 40·152, 47·159, 54·166, 61·173, 68·180, 75·187, 82·194, 89·208, 96·215, 103·222, 110·229·236, `relocations`(295–309, 대상 단어가 있을 때만), `platforms.*.skill.bytes/lines`(`instruction-layout.test.mjs:116-117`의 상한 비교가 실패할 때만)
  - `test_arc_policy.py`: `:1388`(codex verification.md "Orchestrator may reuse"), `:1430`(handoff-prep "never automatically substitute a suffix"), `:1336-1340`(원문이 바뀔 때)
  - `test_claude_payload.py`: `:452`, `:480`, `:489`, `:498`, `:511`, `:513`, `:518`, `:526`
  - `tests/node/plan.test.mjs:147-154`(실패 키만)
  - 확인만 하고 수정하지 않는 것: `test_harness_contract.py`의 `.lower()` 경로(`:209`, `:233`, `:241`, `:285-287`)
- **판정 주의:**
  - §4.2 예시 위치를 그대로 따른다.
  - `never broad Git access`(claude/codex `git-recovery.md`)는 주어·동사가 없는 생략구다. §4.1-4로 판정되지 않으면 양 플랫폼을 함께 hold한다.
  - 관리 블록 안의 발생은 T1 소관이므로 Q-E의 `MANAGED`로만 확인한다.

- [ ] T3-1 handoff 상태를 확인하고 각 테스트 행의 원문 줄을 확정한다(관리 블록 출처이면 T1 결과와 대조).
- [ ] T3-2 공통 문장을 쌍으로 편집하고, 고유 문장은 그 파일에서만 판정한다. R4 행에는 근거 path:line을 적는다.
- [ ] T3-3 `npm run check:role-policy`(기대: exit 0, 관리 블록 불변)
- [ ] T3-4 테스트와 fixture 문자열을 같은 줄에서 교체한다. 바이트·줄 수는 필요할 때만 `wc -c`/`wc -l` 결과로 갱신한다. plan.test SHA는 T1-5 방식으로 처리한다. §8.4 기록을 작성한다.
- [ ] T3-5 `node scripts/update-manifest.mjs` → `npm run check:manifest`
- [ ] T3-6 Implementer가 Q-FULL을 실행하고 보고한다.
- [ ] T3-7 fresh QA: Q-FULL, Q-B(SKILL 2 + references 18 + handoff-worktree 1), Q-C, Q-D, Q-E(같은 파일). §3.1 관리 구간 diff 0과 §4.2 비대상 위치 diff 0을 확인한다.
- [ ] T3-8 Orchestrator가 수락하고 checkbox를 갱신한 뒤 커밋한다: `refactor(skill): 스킬 지침 규범 표기 대문자화`.
- **수용 기준:** AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-12, AC-13, AC-14, AC-15.
- **hold:** T1 hold 조건에 더해, 플랫폼 쌍 불일치와 근거가 없거나 충돌하는 R4(후보로 보고).

## T4: bootstrap 문구 대문자화

- **목표:** `lib/installer/global-config.mjs` `agentsBlockBody()`(42–43행)의 문장 리터럴에만 §4 판정을 적용한다. 예상 사례는 `do not load`→`DO NOT load`(주체 ARC subagents), `must not edit`→`MUST NOT edit`이다. `does not transfer`는 무생물 주어 + 효과 동사이므로 비대상이다. 연결 연산자, 조건식, `languagePolicy()` 호출, 변수는 유지한다.
- **선행:** T3 수락.
- **Implementer `allowedPaths`:** `lib/installer/global-config.mjs`, `tests/node/fixtures/instruction-contracts.json`, `tests/node/global-config.test.mjs`, `tests/test_arc_policy.py`, `tests/node/plan.test.mjs`, `MANIFEST.sha256`
- **갱신 대상:**
  - `instruction-contracts.json` `bootstrap` 2개(13·125). `global.bytes/lines`는 `instruction-layout.test.mjs:108`의 상한 비교가 실패할 때만 고친다.
  - `tests/node/global-config.test.mjs:10` includes 기대값. 같은 줄의 `doesNotMatch`는 수정 금지이며, 영향을 받으면 hold한다.
  - `tests/test_arc_policy.py:850`
  - `tests/node/plan.test.mjs:147-154` 중 `skipGlobal=false` 키(실패 키만)
  - 수정하지 않는 것: `tests/installer-parity.json:11482`(O3)

- [ ] T4-1 handoff 상태를 확인한다.
- [ ] T4-2 리터럴만 편집한다.
- [ ] T4-3 fixture와 테스트를 같은 줄에서 교체하고 §8.4 기록을 작성한다.
- [ ] T4-4 `node scripts/update-manifest.mjs` → `npm run check:manifest`. MANIFEST에 `lib/` 항목이 없으면 diff 0이 정상이다.
- [ ] T4-5 Implementer가 Q-FULL을 실행하고 보고한다.
- [ ] T4-6 fresh QA: Q-FULL, Q-B(`global-config.mjs`), Q-D, Q-E. 실제 전역 설치는 하지 않는다.
- [ ] T4-7 Orchestrator가 수락하고 checkbox를 갱신한 뒤 커밋한다: `refactor(installer): bootstrap 지침 규범 표기 대문자화`.
- **수용 기준:** AC-3, AC-4, AC-6, AC-9, AC-10(global-config), AC-11, AC-12, AC-13, AC-15.
- **hold:** T1 hold 조건과 같다. 리터럴 밖의 수정이 필요한 경우도 hold한다.

## F1: 최종 Reviewer(전체 1회)

- **선행:** T1–T4가 모두 수락·커밋되고 각 작업의 필수 QA와 재확인이 끝났다.
- [ ] F1-1 Orchestrator가 `git diff e0bac40..HEAD > "$(git rev-parse --git-common-dir)/arc/review/harness-doc-refactor.diff"`를 만든다. AC-1 확인용으로 `git diff --name-only e0bac40..HEAD`를 허용 목록(§3.1–§3.3, 작업별 `allowedPaths`, spec·plan 문서 2개)과 대조한다.
- [ ] F1-2 Reviewer 입력: diff 파일, `$REV/T1–T4-ledger.md`, `$REV/T0-baseline.md`, `$REV/T1–T4-qa.md`, spec.
- [ ] F1-3 R8 체크리스트(AC-15):
  - (a) 의무 강도: 대문자화가 강도를 바꾸지 않았는가. `may`→`MAY`가 가능성 문장에 적용되지 않았는가.
  - (b) 적용 대상·주체
  - (c) 조건
  - (d) 예외
  - (e) 우선순위
  - (f) 통합 0건과 참조 유지
  - (g) 링크·anchor 정확성(AC-7)
  - (h) hold와 비대상이 바뀌지 않았는가(AC-5)
  - (i) 플랫폼 쌍(AC-14)
  - (j) 테스트 변경 규칙(AC-12)
  - (k) 대조표 1:1(AC-9) 표본 검토(AC-3)
- [ ] F1-4 지적은 Implementer 수정 → 같은 Reviewer 재확인 순서로 해소될 때까지 반복한다. QA는 재배정하지 않는다. 수정은 해소 전까지 커밋하지 않고, 해소 후 C3에 따라 후속 커밋 1개를 만든다.

## F2: 최종 보고 취합(Orchestrator, spec §11.2)

- [ ] F2-1 아래 1–8을 취합한다.
  1. 수정 목록(파일, 대조표 행 수, 작업 ID, 커밋 SHA)
  2. 제외 목록(§3.4)
  3. 불분명 목록: `docs/harness-operation.md`, `references/scripts/*` 5개(provenance 기록 없음, upstream 동일성 미확인), 작업 중 추가분
  4. hold 목록(§4.4와 추가분, 플랫폼 쌍)
  5. R4 후보
  6. baseline 실패의 최종 상태(해소: D7 / 유지: baseline / 신규: 없음). `test_arc_policy.py:1344`, `test_harness_contract.py:91`은 baseline 유지 예상.
  7. 범위 밖 관찰: `lib/policy/render.mjs:46`, runtime 코드 문자열, `tests/installer-parity.json`의 고정 기록 문구(O3)
  8. §8.4 요약
- [ ] F2-2 AC-16 충족 여부를 확인하고 사용자에게 보고한다. push와 merge는 하지 않는다.
