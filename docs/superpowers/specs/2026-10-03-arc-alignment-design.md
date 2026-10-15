# Superpowers–ARC 작업 흐름 정합성 설계

날짜: 2026-10-03
상태: 기존 여섯 계약의 서면 spec은 사용자 “ㅇㅇ” 승인. 한국어 출력 정책은 “planner 지침 적용해”로 승인. 전체 구현 계획 승인은 대기 중.
분류: Architectural

## 1. 목표

ARC 계층에서 감사된 여섯 차이를 해결한다: 계획 없는 bounded 작업에도 Coder TDD 적용, 외부 executor 대응, architectural 계획 의무화, bounded 계획 깊이 독립 판단, Lead 작업 공간·절대 경로 인계, 읽기 전용 Planner 출력과 Lead visual companion 운영.

추가로 한국어 사용자·작업의 spec·계획 제목과 설명을 한국어로 작성하고 Lead가 보존한다. 모든 계약은 skill·관련 프로필에서 일치해야 한다. Dependencies는 바이트 단위로 보존하고 installer가 변경 payload·manifest를 검증해야 한다.

## 2. 범위와 파일

| 파일 | 책임 |
|---|---|
| `skill/SKILL.md` | 중앙 우선순위·승인·TDD·작업 공간·시각화·언어 정책 |
| `agents/arc-lead.toml` | 집행·예외 기록·실행 대응·작업 공간·runtime·언어 보존 |
| `agents/arc-planner.toml` | 읽기 전용 초안·계획 판단·시각화 인계·언어 정책 |
| `agents/arc-coder.toml` | 설치 TDD·할당 수정·예외 보고·전달된 작업 공간 사용 |
| `MANIFEST.sha256` | 실제 변경된 ARC payload의 해시만 갱신 |

QA·Reviewer·Scout·Secretary의 현재 책임은 충분하다. Dependencies·installer 코드·모델·무관한 파일은 변경하지 않는다. 실제 설치·브라우저·서버는 검증에 필요하지 않다. Spec·계획은 Lead가 통합·저장·자체 검토한다. 구현 작업 공간은 7절을 따른다.

언어 정책 선행 변경은 skill·Lead·Planner의 언어 문장과 세 해시만 포함한다. 기존 여섯 계약·Coder 프로필은 선행 변경에서 수정하지 않는다.

## 3. Adapter 우선순위

적용되는 platform·사용자·프로젝트 지침, ARC의 책임·권한·모델·동시 실행·routing·승인, 역할에 대응된 설치 skill 순으로 적용한다. 설계·spec·계획 검토, TDD, 작업 공간 동의, 실행 순서·독립 검토를 보존한다. 호출 skill은 agent·권한을 추가하지 않는다.

쓰기·저장·commit·승인·구현 요구는 권한 있는 역할로 대응한다: Planner는 완전한 초안·검토·다음 행동; Lead는 통합·저장·자체 검토·사용자 결정; Coder는 할당 구현·테스트; QA는 수정 없는 검증; Reviewer는 독립 읽기; Lead는 수용·완료. 양립 불가한 명시 지시·제약은 종속 행동 전에 알린다. 실행 방식 이름은 권한을 바꾸지 않는다.

`REQUIRED SUB-SKILL`을 포함한 `superpowers:executing-plans`·`superpowers:subagent-driven-development`는 4절 대응으로 충족한다. 추가 owner·specialist 위임·Lead 구현을 허용하지 않는다. 이 대체는 executor만 대상이며 TDD·worktree 등 필수 non-executor 누락은 단계 전에 보고한다.

## 4. 실행 방식과 검토 시점

기존 지정 방식은 보존한다. 미지정이면 설치 writing-plans에 따라 서면 계획 검토와 함께 결정한다.

| 방식 | ARC 동작 |
|---|---|
| Native | Lead가 Coder 단계별 구현을 조정하고 관련 Coder를 재사용할 수 있다. 해당 QA 후 새 독립 Reviewer가 전체 변경을 완료 전에 검토한다. |
| Fresh-agent / Subagent-driven | Task별 새 Coder와 새 독립 Reviewer. 필요한 QA가 검토에 앞서고 다음 종속 task 전에 검토한다. 마지막에 전체 범위를 검토한다. |

Freshness는 Coder·Reviewer task context이며 새 owner·위임 권한이 아니다. 독립 brief·승인 문서·관련 발견·절대 공간을 전달한다. 종속 인계는 순차, 독립 작업만 제한·겹치지 않는 범위 안에서 병렬이다. Specialist는 agent 생성 불가다.

방식별 검토는 위험별 최소 검증을 보완한다. Native의 새 최종 review·fresh의 종속 task 전 review를 유지한다. 설정 모델이 우선하며 “most capable model”은 변경 권한이 아니다.

## 5. 설계·Spec·계획 승인

1. Planner 설계 → Lead 설계 승인.
2. Planner 완전한 spec·자체 검토 → Lead 통합·저장·자체 검토·서면 spec 승인.
3. Planner 설치 writing-plans·완전한 계획·자체 검토.
4. Lead 통합·저장·자체 검토·계획 승인·방식 결정.
5. 승인 문서·brief로 Coder 시작.

Architectural 계획은 locality·파일 수·LOC·낮은 위험·작은 구현과 무관하게 필수다. 승인은 제시 단계만 포함하며 없는 문서까지 승인하지 않는다.

Bounded는 짧은 설계 승인 후 계획 깊이를 별도 판단한다. “no plan document”·“implementation proceeds directly”는 ARC 판단을 우회하지 않는다. 로컬 변경이며 종속 단계·공유 상태·수명주기·통합 순서가 없고 한 검증 경로일 때만 writing-plans 생략; 아니면 초안·검토·승인한다.

Spike는 probe 승인·결과 보고를 유지한다. 결과 유지·구현은 별도 분류·승인한다.

## 6. Coder TDD와 테스트 제약

Feature·bug fix·behavior 전 설치 test-driven-development를 적용하며 bounded·계획 생략에도 적용한다. 계획 깊이와 TDD는 독립이다. Bounded·no-plan·low-risk는 예외가 아니다.

불가피한 제약은 해당 구현 전에 보고한다. Lead는 영향 요구·범위, 정확한 제약·증거, 설치 skill 요구, 예외·대안, 불확실성, 승인 권한·근거를 brief와 필요한 계획에 기록한다.

설치 TDD·상위 지침·유효한 기존 권한에 따라 human approval을 판단하고 필요하면 요청·응답을 기록한다. 내부 승인으로 대체하지 않는다. 기존 승인은 구체 예외를 포함해야 한다. 해결된 제약·검증을 전달한 뒤 진행하며 완료는 검증된 내용·제약된 coverage를 구분한다.

비동작 문서·설정은 자동 TDD 대상이 아니며 의미 있는 검증·적용 skill을 명시 판단한다.

## 7. 작업 공간 선택과 인계

Lead가 설치 using-git-worktrees에 따라 기존 isolation 확인 → 선호 적용 → 일반 checkout의 필요한 동의 → native 우선 → 명시된 sandbox denial 등 fallback을 따른다. 무조건 생성하지 않으며 기존 isolation·새 worktree·허용된 현재 디렉터리 모두 가능하다.

실제 절대 공간·준비 결과·동의/fallback 근거를 brief에 기록하고 Planner·Coder·QA·Reviewer에게 일관된 공간·문서 경로를 전달한다. 누락·접근 불가·충돌은 종속 작업 전에 Lead로 반환하며 조용히 변경·생성하지 않는다. 필요한 준비는 구현 전 완료한다. 읽기 계획은 생성을 승인하지 않는다.

## 8. Visual companion

특정 질문의 시각적 이해 이점을 판단하며 UI 주제만으로 충분하지 않다. Planner는 질문·이유·선택지·설명·diagram/mockup 또는 완전한 내용·사용자 결정을 반환한다. 화면 쓰기·서버·브라우저·승인 요청은 하지 않는다.

Lead는 독립적인 just-in-time 제안·응답·guide·요구 option 시작·session/화면·게시/URL 전 상태·선택 읽기/인계·pause/unload/cleanup을 담당한다. 화면은 설계 artifact이며 구현·테스트는 Coder다. 수락이 모든 질문을 브라우저로 보내지는 않는다.

## 9. Planner 산출물 언어

한국어 사용자·작업에는 제목·설명 본문을 한국어로 작성한다. 명시적인 다른 언어 요청이 우선한다. 식별자·역할/skill/API 이름·코드·경로·명령·정확한 literal은 유지한다. Lead는 통합·저장·검토 때 언어를 보존한다. 정책은 쓰기·승인·구현 권한을 확대하지 않는다.

## 10. 수용 시나리오

| 시나리오 | 결과 |
|---|---|
| Bounded·no-plan behavior | 설치 TDD |
| 불가피한 제약 | 해당 구현 정지·증거/필수 human approval 기록 |
| Native | Coder·해당 QA·새 최종 review, Lead 구현 없음 |
| Fresh-agent | 새 task Coder/Reviewer·종속 task 전·최종 review |
| REQUIRED/없는 non-executor | Executor만 대응·누락 단계 전 보고 |
| 로컬 architectural | Spec·계획 승인 필수 |
| Bounded 종속 단계/다른 검증 | 서면 계획 |
| Isolation·동의·fallback | 설치 규칙·실제 절대 경로 |
| Visual | Planner 내용·Lead 승인/운영/응답 |
| 한국어 작업 | 한국어 제목·설명·Lead 보존 |
| 명시 다른 언어 | 요청 우선·기술 원형 유지 |
| Payload | 해시 일치·dependencies 불변·7 프로필 검증 |

모델·동시 실행·권한·승인 우회를 확인한다.

## 11. 검증

전체 TOML, 비설치 `--check`·`--dry-run`, 실제 ARC manifest 변경, 수정 전 dependency 해시 비교, 여섯 계약·언어 독립 시나리오 검토, 발견 해결/처리 후 완료한다. 설정·서면 계약을 검증하며 모델 준수는 증명하지 않는다. 설치·브라우저·서버는 제외, 구현 공간은 7절이다.

## 12. 가정·의존성

여섯 계약 spec과 추가 언어 정책 승인 완료. 설치 skill이 runtime 기준, bundle은 불변 증거, 모델·제한 유지. Brief에 승인·분류·언어 선행 범위를 기록한다. 전체 구현은 계획 승인 후이며 언어 선행 적용은 별도 범위·계획 생략 근거를 기록한다.

## 13. 증거

- `skill/SKILL.md:29-51` 설계·계획, `55-73` 실행 책임(언어 변경 이전 기준).
- Lead·Planner·Coder 프로필의 기존 계약.
- `dependencies/brainstorming/SKILL.md:130,191-194` TDD/no-plan·architectural.
- `dependencies/writing-plans/SKILL.md:18-19,72,202-236` worktree·executor·방식.
- `dependencies/brainstorming/visual-companion.md:42-68,127-153` runtime.
- `install.py:183-233` manifest.
- `/Users/yunho/.agents/skills/using-git-worktrees/SKILL.md` 동의/fallback.
- `/Users/yunho/.agents/skills/test-driven-development/SKILL.md` 예외 권한.
- 사용자 “planner 지침 적용해” 추가 언어 승인.

## 14. 자체 검토

Planner: 기존 요구·시나리오·검증 보존, 언어 정책 추가, placeholder·충돌 없음. 동의/fallback·human approval·review·architectural 의무 유지. 기술 원형 보존, 언어 승인과 실행 승인 구분.

Lead: 전체 초안을 통합하고 범위·일관성·모호성·언어를 검토했다. 승인된 언어 정책 추가·현지화 외 실질 설계 변경 없음. 같은 spec 승인을 반복할 필요 없으며 전체 계획·방식·TDD 예외·공간은 승인 대기다.
