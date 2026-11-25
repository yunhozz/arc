# 커밋 메시지 언어를 설치 언어 설정에 맞추기 — 설계

## 1. 배경

현재 규칙은 커밋 description을 영어로 고정합니다. 네 플랫폼 모두 같습니다.

- `{claude,codex,gemini,grok}/skill/references/commit.md:26`: "Use Conventional Commits `<type>(<scope>): <description>` with concise specific English description, no trailing period, lowercase scope when useful and one logical task. Body/footer only when needed; preserve Git trailers."
- `{claude,codex,gemini,grok}/skill/references/handoff-prep.md:73`: "Finalize a specific English Conventional Commit message before the first commit."
- SKILL.md, agent profile, `lib/prompts/agent-fragments.json`에는 커밋 언어를 언급하는 곳이 없습니다.

설치 언어와 치환 장치는 다음과 같습니다.

- 설치 언어는 `settings.toml`의 `language`(`en`|`ko`)에 저장됩니다(`lib/installer/language.mjs:6-35`).
- 기존 치환 장치는 `languagePolicy`/`renderLanguagePolicy`(marker `{{ARC_OUTPUT_LANGUAGE_POLICY}}`, 정확히 1개여야 함)와 `renderRunModePolicy`입니다.
- 이 치환은 `lib/installer/plan.mjs`의 `renderSkillPayload`에서 SKILL.md에만 적용됩니다.
- `references/*.md`는 치환 없이 원본 바이트 그대로 설치됩니다.

설치 skill 트리를 만드는 경로는 모두 `buildInstallPlan` → `renderSkillPayload` 하나로 모입니다.

- 최초 설치/재설치: `lib/management/operations.mjs:52`
- 언어 변경: `operations.mjs:102`
- 업그레이드: `lib/installer/upgrade.mjs:16`

## 2. 목표와 비목표

**목표**

- G1. 설치 언어가 en이면 커밋 description과 body를 영어로, ko이면 한국어로 쓰는 것을 기본으로 합니다(사용자 결정).
- G2. 우선순위는 응답 언어와 같습니다. 설치 언어가 기본이고, 사용자의 명시적 언어 요청이나 커밋 언어를 정한 프로젝트 지시가 있으면 그것을 따릅니다(사용자 결정).
- G3. 네 플랫폼의 설치·재설치·언어 변경·업그레이드 모든 경로에서 설치할 때 치환합니다(사용자 결정).
- G4. marker가 0개이거나 2개 이상이면 설치를 실패시킵니다(fail-closed). 설치본에는 `{{ARC_`가 하나도 남지 않아야 합니다.

**비목표**

- Conventional Commits의 `type`/`scope`, 식별자, Git trailer 키는 번역하지 않습니다.
- 이미 설치된 사본은 다음 업그레이드나 언어 변경 때 반영됩니다. 그 전에 따로 바꾸지 않습니다.
- `settings.toml` 스키마를 바꾸거나 커밋 전용 언어 설정을 만들지 않습니다.
- gemini/grok `instructions.md`, `GEMINI.md`, `AGENTS.md`, README, TUI 문구는 바꾸지 않습니다.

## 3. 설계

### 3.1 marker와 렌더러 (`lib/installer/language.mjs`)

- 새 marker는 `{{ARC_COMMIT_LANGUAGE_POLICY}}`이고, 상수 이름은 `COMMIT_LANGUAGE_MARKER`입니다.
- `commitLanguagePolicy(language)`는 `validateLanguage`를 거친 뒤 아래 문장을 반환합니다. `<Lang>`은 `ko`이면 `Korean`, 그 밖에는 `English`입니다.

  > Write the description and any body in <Lang> by default. An explicit user language request or applicable project instructions that fix the commit message language override this installed default. Keep `<type>`, `<scope>`, identifiers, code, paths, commands, literal values and Git trailer keys exactly.

- `renderCommitLanguagePolicy(bytes, language)`는 `renderLanguagePolicy`와 같은 방식으로 동작합니다.
  - 입력을 UTF-8(fatal)로 디코딩하고 `validateLanguage`로 언어를 검사합니다.
  - marker 개수가 1개가 아니면 `Error('Expected exactly one ARC commit language policy marker')`를 던집니다.
  - 입력이 없을 때도 같은 오류로 실패합니다.
- 기존 `languagePolicy`/`runModePolicy` 출력 바이트는 바꾸지 않습니다.

### 3.2 원본 문서 (네 플랫폼)

- `*/skill/references/commit.md:26`을 다음 문장으로 바꿉니다.

  > Use Conventional Commits `<type>(<scope>): <description>` with a concise specific description, no trailing period, lowercase scope when useful and one logical task. {{ARC_COMMIT_LANGUAGE_POLICY}} Body/footer only when needed; preserve Git trailers.

- `*/skill/references/handoff-prep.md:73`은 commit.md를 단일 출처로 참조하도록 바꿉니다.

  > 2. Record remaining approved versions/paths. Finalize a specific Conventional Commit message under [commit](commit.md#automatic-commit-after-plan-task-acceptance) before the first commit.

- 새 문장에 `when repository instructions require`를 넣지 않습니다. `tests/test_claude_payload.py`가 이 문구를 금지합니다.

### 3.3 설치 치환 지점

`lib/installer/plan.mjs`의 `renderSkillPayload`에 다음 한 줄을 추가합니다.

```js
skill.set('references/commit.md', renderCommitLanguagePolicy(skill.get('references/commit.md'), language));
```

1절의 모든 경로와 네 플랫폼이 이 함수를 거치므로 이 한 지점으로 충분합니다. profile 렌더링은 바뀌지 않습니다.

### 3.4 marker 위생

`lib/prompts/render.mjs:145`의 fragment 금지 regex에 `ARC_COMMIT_LANGUAGE_POLICY`를 추가합니다. 이 marker가 fragment에 들어가 profile로 새는 일을 막기 위해서입니다.

### 3.5 원본 트리 동작

설치되지 않은 원본 `commit.md`에는 marker가 리터럴로 남습니다. 원본을 읽는 곳에 미치는 영향은 다음과 같습니다.

- 정책 생성기는 managed section만 다루므로 영향이 없습니다.
- 계약 테스트는 4절에서 갱신합니다.
- runtime은 commit.md를 읽지 않습니다.

## 4. 영향 파일

| 파일 | 변경 |
|---|---|
| `lib/installer/language.mjs` | marker 상수, `commitLanguagePolicy`, `renderCommitLanguagePolicy` |
| `lib/installer/plan.mjs` | import, 치환 1줄 |
| `lib/prompts/render.mjs` | 금지 regex |
| `{claude,codex,gemini,grok}/skill/references/commit.md` | 3.2 |
| `{claude,codex,gemini,grok}/skill/references/handoff-prep.md` | 3.2 |
| `MANIFEST.sha256` | 재생성 |
| `tests/node/fixtures/installed-layout-golden.json` | 16개 조합 × `references/commit.md`, `references/handoff-prep.md` |
| `tests/node/plan.test.mjs` | `renderingBaseline` 8개. 생성된 commit.md에 언어별 문장이 들어가고 marker가 남지 않는지 확인. 생성 skill에 `{{ARC_`가 남지 않는지 확인 |
| `tests/node/language.test.mjs` | 렌더러 단위 테스트 |
| `tests/node/agent-fragments.test.mjs` | fragment 금지 marker 테스트 |
| `tests/node/fixtures/instruction-contracts.json` | commit 절 계약 텍스트(110, 229행 부근) |
| `tests/test_claude_payload.py` | `'English description'` 단언 교체 |
| `tests/test_arc_policy.py` | commit regex 교체 |
| `tests/test_harness_contract.py` | COMMIT_BOUNDARY와 `test_commit_guidance_uses_english_descriptions` 대체 |
| (필요 시) `tests/node/{gemini,grok}-install.test.mjs` | marker 잔존 regex |

## 5. 위험

- R1. fixture 누락. 지난 유사 변경 때 놓친 해시 fixture를 4절에 모두 넣었습니다.
- R2. 합성 payload를 쓰는 테스트에 `references/commit.md`가 없으면 fail-closed 때문에 실패합니다. 이 경우 렌더러를 느슨하게 하지 않고 fixture를 고칩니다. 대상은 전체 suite로 찾습니다.
- R3. 설치본 reference를 원본과 바이트 비교하는 테스트가 더 있을 수 있습니다. 전체 suite를 baseline과 비교해 판정합니다.
- R4. `test_arc_policy.py`에는 이미 실패하는 테스트가 있습니다. baseline 비교로 판정합니다.
- R5. 이미 설치한 사용자는 업그레이드 전까지 기존 영어 규칙을 계속 씁니다.

## 6. 수용 기준

- AC1. `commitLanguagePolicy('en'|'ko')`는 3.1 문장을 바이트까지 그대로 반환합니다. 그 밖의 언어는 `Invalid language`로 실패합니다.
- AC2. `renderCommitLanguagePolicy`는 marker가 0개이거나 2개 이상이면 지정한 오류로 실패합니다. 1개이면 치환하고, 결과에 marker가 남지 않습니다.
- AC3. 네 플랫폼 원본 `commit.md`에 marker가 정확히 1개 있습니다. 원본 `commit.md`와 `handoff-prep.md`에서 `English description`과 `English Conventional Commit`이 사라졌습니다.
- AC4. 네 플랫폼 × en/ko 각각에 대해 `buildInstallPlan`이 만든 `references/commit.md`에 렌더된 문장이 있고, 생성 skill의 어느 파일에도 `{{ARC_`가 남지 않습니다.
- AC5. 언어 변경 경로와 업그레이드 경로가 각각 새 언어와 설치된 언어로 commit.md를 렌더합니다.
- AC6. `handoff-prep.md:73`이 3.2 문장이 되었습니다.
- AC7. fragment에 이 marker가 있으면 profile 렌더링이 실패합니다.
- AC8. 4절 fixture를 갱신한 뒤 관련 테스트가 통과하고, 전체 suite에 baseline 대비 새 실패가 없습니다.
- AC9. SKILL.md와 profile 렌더 바이트는 바뀌지 않습니다. golden에서 바뀌는 항목은 commit.md와 handoff-prep.md뿐입니다.
- AC10. role-policy check가 통과합니다(managed section 변경 없음).

## 7. 결정 기록

- 구현 방식은 설치할 때 marker를 치환하는 것으로 정했습니다(사용자 선택, 2026-11-25).
- 우선순위는 응답 언어와 같게 했습니다(사용자 선택, 2026-11-25).
- 적용 범위는 description과 body입니다(사용자 선택, 2026-11-25).
- 실행 대상은 현재 브랜치 `chore/final-tester-before-reviewer`에 이어서 작업하는 것입니다(사용자 선택, 2026-11-25).

## 8. 계획 깊이와 최종 검증 잠정 판단

- 경로는 Bounded이고 plan이 필요합니다. task는 2개입니다.
  - T1: 렌더러 추가. 설치 출력은 바뀌지 않습니다.
  - T2: 원본 marker 적용, 치환 배선, fixture 갱신.
- 최종 검증은 final Tester 작업이 끝난 뒤 최종 Reviewer가 한 번 검토하는 순서로 합니다.
- trigger 판단:
  - (1) 공유 모듈: 해당합니다. installer 렌더러와 공유 reference 문서가 바뀝니다.
  - (2) 통합 변경: 해당하지 않을 예정입니다.
  - (3) 의존성/설정: 해당하지 않습니다.
  - (4) 공개 인터페이스: 해당하지 않습니다. export가 추가되지만 기존 시그니처는 바뀌지 않습니다.
