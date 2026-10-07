# Harness 정합성 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Harness adapter:** Native의 Lead → Coder → QA → 새 독립 Reviewer 승인 완료. REQUIRED 이름은 승인된 adapter로 대응한다. Lead는 구현하지 않고 specialist는 agent를 생성하지 않는다.

**목표:** Dependencies를 보존하면서 여섯 계약과 한국어 산출물 정책을 정렬한다.

**구조:** 중앙 adapter → 세 역할 지침 → 대응 체크섬. 규칙·프로필·installer가 함께 일치해야 하는 하나의 구현 결과다.

**기술:** Markdown, TOML, 기존 Python installer·SHA-256.

**Spec:** `docs/superpowers/specs/2026-10-03-harness-alignment-design.md`

## 공통 제약

- Dependencies·installer·모델·무관 파일 변경 금지, 바이트 보존, 기존 `.DS_Store`·`.idea/` 유지.
- 허용: `skill/SKILL.md`, `agents/harness-lead.toml`, `agents/harness-planner.toml`, `agents/harness-coder.toml`, 대응 `MANIFEST.sha256`.
- Architectural 계획 필수. Planner 읽기 전용·승인/agent 불가. Lead 승인·통합·공간·완료. Coder 수정, QA 수정 없는 검증, Reviewer QA/수정 없는 독립 검토.
- 모델·동시 실행·승인 유지. 설치·브라우저·서버 검증 제외. 공간은 설치 using-git-worktrees·필요 동의.
- 한국어 제목·설명, 명시 다른 언어 우선, 식별자·skill/API·코드·경로·명령·literal 보존, Lead 언어 유지.

## 검토 집중 항목

1. Bounded/no-plan도 TDD이며 암묵 예외가 아니다.
2. 로컬 architectural도 spec·계획 승인.
3. REQUIRED executor 대응은 non-executor 누락·권한을 대신하지 않는다.
4. Isolation·동의·fallback·실제 공간, 조용한 변경 금지.
5. Planner 내용과 Lead 시각 운영 분리.

아래 검토가 다섯 조건·review·human 예외를 확인하며 언어 시나리오를 추가한다.

## 승인 상태와 언어 선행 적용

기존 spec “ㅇㅇ”, 언어 정책 “planner 지침 적용해” 승인. 전체 계획·Native·TDD 예외·공간 승인은 별도다. 언어 선행 변경은 skill·Lead·Planner 문장+세 해시만 Coder 소유이며 완료되었다. 기존 여섯 계약·Coder 프로필은 미변경이다. Lead가 한 출력 관례/공유 상태·수명주기·통합 순서 없음/한 의미 확인 경로의 계획 생략 근거를 brief에 기록했다. 언어 승인으로 전체 실행을 승인하지 않는다.

## 실행 결정과 TDD

지침·설정 변경은 production 코드·suite가 없다. 기존 installer는 구조·무결성, 독립 시나리오는 서면 계약을 검증하며 실제 모델 준수를 입증하지 않는다.

설치 TDD의 configuration “Exceptions (ask your human partner)”에 따라 상위 지침·구체 기존 권한을 판단하고 필요한 구체 예외 승인을 받는다. 일반 설계·spec에서 추정하지 않는다. 권한·응답·파일·대체 검증·불확실성을 brief에 기록한다. 전체 계약의 automated failing-first tests 없는 예외는 아직 미승인이다. 선행 언어만 직접 요청에 따른 좁은 승인으로 기록했다.

새 tests·keyword-only tests를 추가하지 않으며 red-green을 주장하지 않는다. 수정 전 감사 차이→수정 후 독립 시나리오 대응이 대안이다. 예외 거절 시 수정 전 중지·재결정. 미래 behavior TDD를 약화하지 않는다.

## 단계 0: Lead 전제조건

Lead 소유, 구현 수정 없음. 승인 문서·결정 입력, 방식·TDD·공간 brief 출력.

- [x] 개정 spec 통합·저장·검토; 기존 승인+명시 언어 승인 기록. 추가 실질 변경이면 spec 재승인.
- [x] 전체 계획·Native 승인. 한 종속 결과·significant risk → QA·새 Reviewer.
- [x] 전체 지침/config TDD 예외 승인 기록: automated failing-first tests 없이 기존 구조/installer·독립 계약 검토. 이번 범위만 적용.
- [x] 설치 worktree 절차 적용·isolation 확인: 승인된 master in-place 경로 유지.

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
pwd -P
```

Git 경로 해석 후 비교·submodule guard. 기존 baseline은 `master`, 두 `.git`, superproject 없음. 미선호 시 동의, 거절 시 in-place, 동의 시 native 우선/manual 조건, ignore 확인·허용 sandbox fallback. 범위 밖 `.gitignore`를 조용히 추가하지 않는다. Lead가 Coder 전 해결한다.

의도 revision·접근 가능한 원래 승인 artifact 경로를 전달한다. Uncommitted 문서 복사를 가정하지 않는다.

- [ ] 기록·인계:

```text
Method: Native Harness Coder (if approved)
Risk: significant contract risk
Workspace: actual absolute chosen path
Evidence: isolation/preference/consent/setup or permitted fallback
Spec/plan: accessible absolute paths
TDD exception: authority and specific response
Allowed edits: five scoped files
Checks: baseline, structure, contracts, fresh review
```

경로 문제는 종속 작업 전 Lead. 계획 승인 때 `/Users/yunho/Desktop/project/yunho-harness` in-place를 명시 선택하면 추가 동의 질문 없이 선호 기록 가능.

## Task 1: 계약·Payload 정렬

Coder가 다섯 파일 독점 수정. 기존 installer·계약 검증, 새 test 없음. 승인 문서·해결 brief·공간·예외 입력, 일관 지침/해시·검증 증거 출력. 단계 0 의존; 중앙→프로필→manifest→검증. 불완전 중간 commit 없음.

### 1단계: Baseline

- [ ] 선택 공간에서 실행:

```bash
git status --short
git diff --name-only
python3 -B install.py --check
python3 -B install.py --dry-run
```

예상 exit 0·manifest/preflight 성공·설치 없는 dry-run. 실패 시 Lead 반환, 무관 수리 없음. 사전 22파일 검증 성공; 선택 실행 공간의 baseline 목적으로 반복한다.

- [ ] 쓰기 없이 해시 출력·Lead 증거 보관:

```bash
python3 -B - <<'PY'
from pathlib import Path
import hashlib
import json
root = Path.cwd()
dependencies = {
    p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
    for p in sorted((root / 'dependencies').rglob('*')) if p.is_file()
}
manifest = {}
for line in (root / 'MANIFEST.sha256').read_text().splitlines():
    if line:
        digest, name = line.split('  ', 1)
        manifest[name] = digest
print(json.dumps({'dependencies': dependencies, 'manifest': manifest}, sort_keys=True, indent=2))
PY
```

기존 untracked metadata 포함, 선행 언어 변경 상태 기록.

### 2단계: 중앙 계약

- [ ] 기존 설계·계획·실행과 간결 adapter/공간/시각/언어 규칙. 무관 책임·token·모델 보존.

구체 필수 내용:

- Platform/user/project 우선·Harness 책임/권한/모델/제한/gate.
- Executor/runtime 권한 역할 대응, REQUIRED 두 executor만 대체·non-executor 누락 보고.
- Native Coder·해당 QA·fresh 최종 Reviewer; fresh task Coder/Reviewer·QA 앞선 review·다음 종속 task 전·최종 review.
- 지정 방식 유지·미지정 계획 검토 결정.
- Architectural spec 후 always writing-plans, bounded no-plan 별도 판단.
- 계획 생략/TDD 독립·feature/bug/behavior 전 설치 TDD.
- 제약 영향 구현 정지·Lead 증거/대안/불확실성/필수 human 승인.
- Isolation/동의/native/fallback/실제 절대 경로.
- Planner 읽기 내용·Lead offer/approval/guide/runtime/screens/state/selections/cleanup.
- 한국어 제목/설명·명시 언어 우선·기술 원형·Lead 보존(선행 적용 내용 확인).

Spec 역할/skill 이름 유지. 언어 선행 권한을 전체 계약 권한으로 확대하지 않는다.

### 3단계: 역할 프로필

- [ ] Developer instructions만 수정; 이름/description/sandbox/모델 유지.

| 역할 | 직접 계약 |
|---|---|
| Lead | 우선순위·review·architectural/bounded·TDD 승인·공간·visual·언어 |
| Planner | Spec 후 계획·bounded 깊이·draft/action·읽기 visual·공간 문제·언어 |
| Coder | No-plan TDD·사전 제약·해결 authority·절대 공간·생성/변경 금지 |

전체 복제 없이 독립 집행 가능하게 한다.

### 4단계: Manifest

- [ ] 네 해시·대응 digest만 갱신:

```bash
python3 -B - <<'PY'
from pathlib import Path
import hashlib
for name in ('skill/SKILL.md', 'agents/harness-lead.toml',
             'agents/harness-planner.toml', 'agents/harness-coder.toml'):
    print(f'{hashlib.sha256(Path(name).read_bytes()).hexdigest()}  {name}')
PY
```

예상 네 줄, 순서·경로·다른 항목 유지, self/dependency 재생성 금지. 선행 언어는 세 항목만 수정 완료.

### 5단계: 구조 확인

- [ ] 일곱 프로필:

```bash
python3 -B - <<'PY'
from pathlib import Path
import tomllib
profiles = sorted(Path('agents').glob('*.toml'))
assert len(profiles) == 7, f'Expected 7 profiles, found {len(profiles)}'
for path in profiles:
    data = tomllib.loads(path.read_text())
    assert isinstance(data.get('developer_instructions'), str), str(path)
    assert data['developer_instructions'].strip(), str(path)
print('PASS: 7 profiles parse with nonempty developer instructions')
PY
```

- [ ] 실행:

```bash
python3 -B install.py --check
python3 -B install.py --dry-run
git diff --check
git diff --name-only
git diff -- MANIFEST.sha256
```

예상 exit0·whitespace 없음·다섯 파일 이내·네 digest 이내. Baseline 해시 명령 재실행·dependency map/미수정 manifest 정확 비교.

### 6단계: 인계

- [ ] 파일/명령/결과/보존/질문 반환. TDD·live 준수 주장/설치/runtime 없음.

## 단계 2: 독립 QA

QA 읽기 전용, Task1 의존.

- [ ] TOML·installer·whitespace 독립 실행.
- [ ] Dependency/manifest baseline·범위 확인.
- [ ] 시나리오와 명령/결과/구조 실패/환경 문제 보고.

| 검토 | 결과 |
|---|---|
| TDD | No-plan도 적용·제약 정지·대안/필수 승인 |
| Executor | Native/fresh checkpoint·executor만 대체·모델/권한 |
| Architectural | Spec→plan→방식 승인→Coder |
| Bounded | 종속성/공유/lifecycle/order/다른 검증 계획·TDD 독립 |
| 공간 | Isolation/동의/native/fallback·실제 path·문제 보고 |
| Visual | Planner 내용·Lead 운영·질문별 브라우저 |
| 언어 | 한국어·명시 다른 언어·원형·Lead 보존 |

언어 선행은 마지막 행·구조·기존 여섯 계약 diff 없음만 집중 확인했다.

## 단계 3: 새 Review·수용

새 Reviewer 읽기 전용, QA 증거 의존.

- [ ] 승인 artifacts·5-file diff·preservation/QA 전달.
- [ ] 여섯 계약+언어 consistency/누락/authority/timing/scope 검토; QA·편집 없음.
- [ ] 발견 Coder 수정·영향 QA·필요 수정만 Reviewer 재검토.
- [ ] Lead 처리·수용 증거 확인.

Commit 권한이 있으면 다섯 구현만 stage:

```text
fix(harness): 스킬 실행과 역할 인계 계약 정합성 보완
```

계획은 publication/installation/commit 권한을 추가하지 않는다. 별도 언어 commit은 해당 범위만 포함·한국어 Conventional Commit.

## 가정·미결정

기존 spec “ㅇㅇ”·언어 “planner 지침 적용해” 승인. 전체 plan/Native/TDD exception/workspace pending. Python+tomllib 필요·환경 제한은 Lead. Production tests/code 없음·무관 실패는 범위 확대 불가. 선행 언어 완료는 전체 baseline 반영.

## 자체 검토

Planner: 기존 요구·단계·코드·명령·검증 보존, 한국어·시나리오 추가, 구체 ownership/dependency, gate는 placeholder 아님, suite/live claim 없음.

Lead: 전체 문서 한국어 통합·기술 원형 유지·spec coverage/placeholder/path consistency/review focus/proportion 검토. 기존 여섯 계약 실질 변경 없이 언어만 추가, spec 재승인 불필요. 전체 plan·method·TDD·공간 gate 유지. 선행 언어 범위만 완료.
