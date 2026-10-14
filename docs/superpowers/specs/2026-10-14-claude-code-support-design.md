# Codex와 Claude Code를 선택하여 설치하는 Harness 지원 명세

작성일: 2026-10-14  
예정 경로: /Users/yunho/Desktop/project/yunho-harness/docs/superpowers/specs/2026-10-14-claude-code-support-design.md  
상태: 명세·계획 승인, T1 완료  
설계 깊이: Architectural

## 1. 목적과 승인된 범위

현재 Codex 전용 Harness 설치기를 확장하여, 사용자가 Codex 또는 Claude Code를 선택해 전역 사용자 환경에 설치할 수 있도록 한다.

두 플랫폼에서 CEO와 Scouter·Planner·Coder·QA·Reviewer의 책임, 승인 절차, 소유권, 검증 및 완료 책임을 유지한다. 프로필 형식, agent 실행 방식, 모델 설정 및 작업 공간 기능의 차이는 플랫폼별 adapter로 처리한다.

승인된 범위는 다음과 같다.

- Python backend와 install.command의 --target codex|claude 필수 선택
- Codex 설치 동작 보존. 단, 무인수 backend·공통 진입점 호출은 대상 누락 오류로 변경
- Codex 전용 설치 payload·예시 설정·유틸리티 소스를 저장소의 codex/ 아래로 이동
- Claude Code 전역 사용자 설치
- Claude native Markdown subagent 프로필 다섯 개
- Claude 전용 Harness skill·참조·실행 adapter
- 외부 스킬 세 개 설치
- 역할별 Haiku·Sonnet 모델 및 effort 설정
- Claude에서 현재 checkout 및 명시 승인 branch 흐름 지원
- 기존 manifest·preflight·읽기 전용 검사·backup·staging·rollback 계약 보존

설계 승인 근거는 사용자의 ㅇㅇ이다. 이후 추가된 대상 필수 요구와 CEO가 전달한 호환성 결정을 본 명세에 반영한다.

## 2. 비목표

이번 변경은 다음 기능을 제공하지 않는다.

- 두 플랫폼을 한 번에 설치하는 all 대상
- 설치 대상 자동 감지 또는 대화형 선택
- install-claude.command와 같은 플랫폼별 별도 진입점
- Claude 세션의 CEO 모델 강제 변경
- 서로 다른 제공자 모델의 동일 성능 보장
- API 자격 증명·구독·provider·조직 정책 변경
- Claude에서 Codex 앱 관리 worktree 생성·attachment 제공
- Claude native worktree 전체 수명주기 지원
- 기본 경로가 아닌 CLAUDE_CONFIG_DIR 지원
- 자동 설치 취소 명령이나 이전 사용자 설정의 자동 병합
- 설치 중 모델 API 또는 agent 실행에 의한 가용성 검사

기존 Codex 정책을 플랫폼 중립 정책 언어로 전면 재작성하는 작업도 범위에 포함하지 않는다.

## 3. CLI 계약

### 3.1 공통 진입점

지원하는 예시는 다음과 같다.

    ./install.command --target codex
    ./install.command --target claude
    python3 install.py --target codex
    python3 install.py --target claude
    ./install.command --target claude --check
    ./install.command --target claude --dry-run
    ./install.command --target claude --skip-global

install.command는 사용자 인수를 Python backend에 전달한다. backend와 이 공통 진입점에는 기본 대상이 없다.

--target은 정확히 한 번 지정하며 값은 codex 또는 claude여야 한다. 누락·잘못된 값·중복 지정은 오류다. 같은 값의 반복과 서로 다른 값의 반복을 모두 거부한다. --target=value 표기에도 동일하게 적용한다.

--check와 --dry-run은 상호 배타적이다. --skip-global은 선택한 플랫폼의 전역 파일 갱신만 생략한다.

### 3.2 종료와 부수 효과

--help는 대상 지정 없이 사용할 수 있다. 나머지 실행 경로에서는 대상 선택을 먼저 검증한다.

대상 누락·중복·잘못된 값은 manifest 처리, 외부 취득 및 설치 대상 변경 전에 종료한다.

성공 종료 코드는 0, 사용법·검사·취득·설치 오류 종료 코드는 2다. 오류 출력에는 원인과 관련 대상·경로를 포함한다.

--check와 --dry-run은 다음을 수행하지 않는다.

- 설치 대상·캐시·백업·staging 생성 또는 변경
- subprocess 실행
- npx, Git, Claude CLI 실행
- 네트워크 요청

두 옵션은 로컬 payload·모델 설정·프로필·설치 경로·전역 파일·필수 외부 스킬 구조를 검사한다. --dry-run은 선택한 플랫폼의 취득 예정 동작과 관리 대상도 출력한다.

검사 범위에 원격 모델 가용성·계정 권한·provider의 실제 effort 적용 여부는 포함되지 않는다.

## 4. 설치 루트와 플랫폼 격리

### 4.1 Codex

기존 CODEX_HOME과 기본 ~/.codex 계약을 유지한다. 빈 CODEX_HOME 거부, 외부 스킬 후보 처리, 폐기 프로필 처리, 전역 설정 및 백업 범위를 보존한다.

Codex 대상에서는 CLAUDE_CONFIG_DIR를 해석하거나 검사하지 않는다.

### 4.2 Claude

v1의 Claude 설치 루트는 현재 사용자의 ~/.claude로 고정한다.

| 내용 | 설치 위치 |
|---|---|
| Harness | ~/.claude/skills/yunho-harness/ |
| 외부 스킬 | ~/.claude/skills/{brainstorming,writing-plans,test-driven-development}/ |
| 역할 프로필 | ~/.claude/agents/harness-*.md |
| 전역 안내 | ~/.claude/CLAUDE.md |
| 설치 백업 | ~/.claude/backups/<timestamp>/ |

Claude 대상에서는 CODEX_HOME을 해석하거나 검사하지 않는다.

### 4.3 CLAUDE_CONFIG_DIR 처리

공식 자료에서 CLAUDE_CONFIG_DIR는 Claude 설정·세션·plugin 경로에 영향을 준다. 제공된 공식 근거만으로는 사용자 전역 agents/, skills/, CLAUDE.md가 모두 동일하게 이동한다고 확정할 수 없다. [Claude Code 환경 변수 문서](https://code.claude.com/docs/en/env-vars)

따라서 v1은 다음과 같이 처리한다.

- 변수가 없으면 ~/.claude를 사용한다.
- 값이 있으면 빈 값은 오류다.
- 값은 절대 경로여야 한다. 사용자 홈 표기를 확장하고 구분자·`.`·`..`를 정규화한 뒤 기본 ~/.claude와 같은 경로일 때만 허용한다.
- 다른 경로이면 --check·--dry-run을 포함하여 종료 코드 2로 중단한다.
- 해당 오류는 외부 취득·subprocess·쓰기 전에 발생한다.
- 오류 메시지는 비기본 CLAUDE_CONFIG_DIR가 v1에서 지원되지 않음을 설명한다.

정규화는 문자열 비교용이며 symlink를 따라 실제 경로로 바꾸지 않는다. 기본 루트와 상위 구성 요소의 symlink·파일 유형 검사는 기존 경로 안전 규칙에 따른다.

이는 비기본 경로에서 Claude가 파일을 찾지 못한다고 단정하는 것이 아니라, 확인되지 않은 경로 인식에 의존하지 않도록 설치 범위를 제한하는 결정이다. 비기본 경로의 런타임 인식은 미검증으로 남는다.

### 4.4 격리 규칙

Claude 실행은 Codex 사용자 경로와 Codex 폐기 프로필을 설치·cleanup 대상으로 탐색하거나 변경하지 않는다. Claude 외부 스킬 설치는 ~/.claude/skills/에 한정하며 공유 ~/.agents/skills/를 변경하지 않는다.

Codex 실행은 Claude 사용자 경로를 설치·cleanup 대상으로 탐색하거나 변경하지 않는다.

어느 플랫폼이든 관리 대상으로 정의하지 않은 사용자 agent·skill·전역 지침을 보존한다. 전체 배포 payload 무결성 검사는 사용자 설치 경로의 격리와 별개다.

## 5. payload 및 모델 관리 소스

기존 Codex 전용 소스는 codex/ 아래에 둔다. 설치기·README·테스트·manifest처럼 두 대상을 다루는 공용 파일은 저장소 루트에 유지한다.

    codex/agents/
    codex/skill/
    codex/skill/models.toml
    codex/config.toml
    codex/tools/codex_token_usage.py

Claude 소스는 별도 트리로 제공한다.

    claude/agents/
    claude/skill/SKILL.md
    claude/skill/models.toml
    claude/skill/references/
    claude/skill/scripts/

Codex 프로필·skill·모델 설정·예시 설정·전용 유틸리티는 codex/ 트리에서 관리한다. 이 저장소 내부 경로 정리는 기존 CODEX_HOME 설치 위치와 사용자 파일 경로를 바꾸지 않는다.

Claude 프로필은 claude/agents/의 Markdown 파일을 사용한다. Claude 모델 설정은 claude/skill/models.toml을 source of truth로 사용한다.

설치 후 Claude 모델 변경 재적용 명령은 다음과 같다.

    python3 ~/.claude/skills/yunho-harness/scripts/apply-models.py

이 명령은 인접한 Claude models.toml을 읽어 Claude 관리 프로필 다섯 개만 갱신한다. Codex 모델 설정이나 프로필은 변경하지 않는다.

재적용은 전체 설정·다섯 프로필을 먼저 검증하고 기존 모델 재적용의 검증·안전 수준을 유지한다. 네트워크나 모델 가용성 검사는 수행하지 않는다.

플랫폼별 정책은 의미상 일치하도록 유지하되, Codex 실행 지침을 문자열 치환하여 Claude payload로 만드는 방식을 사용하지 않는다. 공통 설치 안전 엔진과 플랫폼별 payload·renderer의 경계를 명확히 한다.

## 6. 전역 CLAUDE.md

Claude 설치는 CLAUDE.md의 Harness 관리 구간만 갱신한다. 기존 관리 마커 체계를 사용한다.

보장 사항은 다음과 같다.

- 관리 구간 밖 사용자 내용 보존
- 재설치 시 관리 구간 중복 생성 방지
- 손상되거나 모호한 관리 마커 안전 거부
- 실제 설치 위치의 Harness SKILL.md 안내
- CEO와 depth 2 역할의 소유권 및 지침 로딩 경계 안내

전역 파일은 CEO가 Harness를 적용하도록 연결하는 진입 지침이며, 전체 정책을 복제하지 않는다.

Claude subagent가 CLAUDE.md를 상속하더라도 depth 2 역할은 CEO용 전체 Harness를 다시 로드하지 않는다. 역할 프로필·brief·필수 참조를 따른다.

--skip-global이면 CLAUDE.md를 변경하지 않고 수동 적용 안내를 출력한다. skill과 agent 설치는 수행한다.

Claude 설치는 Codex config.toml의 대기 설정을 만들지 않으며 Claude settings.json도 변경하지 않는다.

## 7. native subagent 프로필과 도구

### 7.1 프로필 이름

| 역할 | 파일 및 native name |
|---|---|
| Scouter | harness-scouter.md / harness-scouter |
| Planner | harness-planner.md / harness-planner |
| Coder | harness-coder.md / harness-coder |
| QA | harness-qa.md / harness-qa |
| Reviewer | harness-reviewer.md / harness-reviewer |

Codex의 기존 harness_scouter 등 별칭과 Claude native 이름의 대응은 adapter에 명시한다. 실제 호출 식별자는 해당 플랫폼의 설치된 이름과 일치해야 한다.

각 프로필은 공식 Markdown frontmatter 형식을 사용하며 name, description, model, effort, tools를 명시한다. tools는 YAML list로 출력한다. [Claude Code 서브에이전트 문서](https://code.claude.com/docs/en/sub-agents)

### 7.2 정확한 도구 allowlist

공식 확인된 Claude Code 도구 이름에 따라 다음 목록을 사용한다.

| 역할 | tools |
|---|---|
| Scouter | Read, Grep, Glob, WebFetch, WebSearch |
| Planner | Read, Grep, Glob |
| Coder | Read, Grep, Glob, Bash, Write, Edit |
| QA | Read, Grep, Glob, Bash |
| Reviewer | Read, Grep, Glob |

tools를 생략하면 부모 도구를 상속할 수 있으므로 생략하지 않는다. Agent 및 이전 별칭 Task를 허용하지 않으며, 별도 중첩 위임 경로도 제공하지 않는다. [서브에이전트 도구 제한](https://code.claude.com/docs/en/sub-agents)

Bash를 허용하는 Coder·QA의 제한은 정책 제약이다. 이를 파일시스템 쓰기나 추가 프로세스를 기술적으로 완전히 차단하는 보안 sandbox라고 설명하지 않는다.

### 7.3 역할별 정책

- Scouter: 자료 조사와 지정된 정적 탐색을 수행하고 근거·불확실성·영향·다음 행동을 CEO에게 반환한다. 파일 변경·구현·설계 결정·사용자 승인 요청을 하지 않는다.
- Planner: 필요한 skill·참조·파일을 읽고 설계·명세·계획 초안을 반환한다. 저장·구현·직접 승인 요청을 하지 않는다. 도구 목록으로 수행할 수 없는 시각화·실행 요구는 CEO에게 돌린다.
- Coder: 승인된 파일 범위를 수정하고 필요한 명령을 실행한다. 범위 밖 변경·승인 우회·위임을 하지 않는다.
- QA: 승인된 검증을 실행하고 근거를 반환한다. 구현·테스트 소스를 수정하지 않는다. 검증 과정의 cache·보고서 등 부수 효과는 승인된 검증 범위 안에서 취급한다.
- Reviewer: 최종 전체 변경을 독립적으로 읽고 정확성·보안·정책 일관성을 검토한다. 파일 수정이나 구현을 수행하지 않는다. 실행 검증이 필요하면 CEO에게 요청한다.

모든 역할은 CEO에게 직접 보고한다. depth 2 역할의 agent 생성·CLI를 통한 우회 위임·역할 간 재위임은 금지한다.

전체 동시 subagent 최대 네 개, 독립 작업만 병렬화, 의존 handoff 순차 처리 정책을 유지한다.

## 8. 모델과 effort

### 8.1 초기 설정

| 역할 | model | effort |
|---|---|---|
| Scouter | haiku | max |
| Planner | sonnet | medium |
| Coder | sonnet | low |
| QA | haiku | high |
| Reviewer | sonnet | medium |

CEO는 현재 Claude 세션에서 선택한 모델을 유지한다.

기존 codex/skill/models.toml은 Codex 전용 source로 남는다. Claude 설정·renderer·재적용은 이를 읽거나 변경하지 않는다.

### 8.2 의미와 검증 범위

이 매핑은 저비용 계층과 coding workhorse 계층 및 effort label을 대응시킨 근사다. 제공자 간 성능·추론량·가격의 동등성을 뜻하지 않는다.

Scouter가 확인한 현재 공식 모델 설정 문서는 Opus 5.5·Sonnet 5.5·Haiku 5.5에 대해 low, medium, high, xhigh, max effort label을 설명한다. 승인된 값은 그대로 프로필에 출력한다. [Claude Code 모델 설정—effort level](https://code.claude.com/docs/en/model-config#adjust-effort-level)

다른 provider의 alias는 다른 모델로 해석될 수 있고, 런타임 또는 조직 override가 실제 effort에 영향을 줄 수 있다. 설치기는 다음을 보장한다.

- 로컬 설정 형식과 정확한 역할 집합 검사
- 모델·effort 선언을 프로필에 일관되게 반영
- 문서화된 effort label의 형식 검증
- 지원되지 않는 로컬 형식에 대한 명확한 오류

모델 가용성·계정 권한·실제 provider 적용은 검사하지 않는다. 설치기가 임의로 모델 또는 effort를 축소·생략하는 fallback을 제공하지 않는다.

## 9. Claude 실행 adapter와 skill 연결

Claude adapter는 역할 책임·승인·소유권·보존·보고 계약을 유지하면서 Claude native subagent 실행과 완료 결과를 사용한다.

Claude 실행 경로에서 다음 Codex 전용 요소를 요구하지 않는다.

- wait_agent, list_agents 등 Codex agent 제어 API
- fork_turns, reasoning_effort 같은 Codex 호출 인수
- Codex 앱의 worktree·attachment·artifact API
- app-managed current-chat attachment 증명

Claude subagent가 부모의 이전 skill 실행 내용을 상속한다고 가정하지 않는다. CEO는 필요한 skill의 경로·적용 섹션·관련 근거를 brief에 포함한다.

각 역할은 필요한 installed skill을 직접 읽는다. 기본 프로필은 CEO용 전체 Harness를 skills:로 preload하지 않는다.

Planner의 brainstorming과 승인 후 writing-plans, Coder의 적용 가능한 TDD는 기존 소유권·승인 게이트 안에서 수행한다. 외부 skill이 추가 agent·직접 저장·조기 commit을 요구하면 Harness adapter의 역할 경계와 승인 계약을 유지한다. 외부 skill 원문은 수정하지 않는다.

capability가 없는 작업은 성공한 것으로 취급하거나 다른 경로로 자동 대체하지 않고 CEO에게 보고한다.

### 9.1 작업 공간

Claude에서는 다음을 지원한다.

- 승인된 현재 checkout
- 사용자가 명시적으로 승인한 branch 생성·전환

경로·branch/HEAD·staged/unstaged/untracked 상태·소유권·보존 규칙·문서 승인 상태 확인은 유지한다.

Codex 앱 관리 worktree는 Claude에서 미지원이다. 이를 실행 대상 선택지로 제시하거나 Codex 도구 실행을 요구하지 않는다. 요청을 받으면 제약과 현재 상태를 보고하고 필요한 결정을 CEO에게 돌린다.

Claude native worktree 또는 raw Git worktree로 자동 전환하지 않는다.

## 10. 외부 스킬

설치 대상은 다음 세 개다.

    brainstorming
    writing-plans
    test-driven-development

실제 설치 시 기존 source에서 격리 취득하고 필수 보조 파일을 포함한 구조를 검사한다. 취득 환경 격리, timeout·프로세스 종료, 출력·경로 검증 계약을 유지한다.

검증된 트리를 사용자 설치 대상에 반영하며, 취득·검증 실패 시 사용자 설치 대상 교체를 시작하지 않는다.

외부 skill은 원문을 유지하고 플랫폼 차이는 Harness adapter가 처리한다.

전체 트리 교체 방식과 사용자 수정의 backup 보존을 문서화한다. --check·--dry-run은 로컬 필수 구조만 검사하며 최신 원격 source와의 일치를 확인하지 않는다.

Codex의 기존 외부 스킬 대상 결정은 유지한다. Claude는 ~/.claude/skills/만 관리한다.

## 11. manifest·preflight·설치 거래

Claude 프로필·skill·참조·renderer·재적용 스크립트 등 새 불변 payload를 manifest 검증 범위에 포함한다.

두 플랫폼의 사용자 변경 가능 모델 설정은 명시된 mutable 예외로 두되 별도 형식 검증을 수행한다. 새 파일이 manifest 또는 mutable 검증 양쪽에서 누락되면 안 된다.

manifest의 변조·누락·중복·잘못된 경로·비정규 파일 거부 계약을 유지한다.

선택한 대상의 설치는 다음 안전 계약을 따른다.

1. CLI·설치 루트 호환성·payload·모델·프로필·경로·전역 파일을 preflight한다.
2. 외부 스킬을 격리 취득·검증한다.
3. 취득 전후 대상과 전역 파일의 변화를 검사한다.
4. 교체 전 필요한 backup과 staging 준비를 완료한다.
5. 선택한 플랫폼의 관리 대상만 교체한다.
6. 실패 시 완료된 교체를 역순 복구한다.
7. 복구 실패 시 남은 상태와 backup/recovery 절대 경로를 보고하고 자료를 보존한다.

symlink 구성 요소·특수 파일·파일/디렉터리 충돌은 변경 전에 거부한다. 기존 bytes·mode와 관리 밖 사용자 내용을 보존한다.

파일시스템 전체 원자성이나 외부 프로세스에 대한 완전한 잠금은 보장하지 않는다.

Codex 폐기 프로필 처리는 Codex 대상에만 적용한다. Claude에서 추측한 과거 파일명을 탐색·삭제하지 않는다.

## 12. 이행·문서·완료 출력

Codex 기존 호출의 변경은 대상 명시다.

    # 이전 호출
    ./install.command

    # 변경 후
    ./install.command --target codex

Python 직접 호출·검사·자동화 예제도 갱신한다. 무인수 backend·공통 진입점은 안내와 종료 코드 2를 반환하며 설치를 시작하지 않는다.

Claude 사용법은 다음과 같다.

    ./install.command --target claude

플랫폼마다 별도 진입점이 없으며, Codex와 Claude Code 모두 install.command에 필수 --target을 지정한다.

Codex 모델·프로필·전역 파일·외부 스킬·백업·cleanup·모델 재적용의 기존 동작은 보존한다.

Claude 첫 설치는 Codex 설치를 이동하거나 가져오지 않는다. Claude 재설치는 Claude 관리 대상만 backup 후 갱신한다. 사용자 수정의 자동 병합은 제공하지 않는다.

문서와 완료 출력에는 다음을 포함한다.

- 선택한 플랫폼과 실제 설치 루트
- 설치한 Harness·외부 skill·agent
- backup 경로
- 전역 지침 갱신 또는 생략 결과
- 플랫폼별 모델 설정 및 재적용 명령
- Claude 기본 경로 제한과 비기본 CLAUDE_CONFIG_DIR 오류
- provider·런타임 override와 모델 가용성 검사 범위
- 새 세션 적용 안내
- Claude의 미지원 worktree 범위

## 13. 수락 기준과 검증 근거

| ID | 수락 기준 | 필요한 근거 |
|---|---|---|
| AC1 | backend·공통 진입점이 대상 누락·잘못된 값·중복을 취득·쓰기 전에 종료 코드 2로 거부 | CLI 오류·부수 효과 확인 |
| AC2 | 공통 install.command가 backend에 전달한 --target과 나머지 인수를 보존 | Codex·Claude 인수 전달 확인 |
| AC3 | --target codex가 대상 필수 변경 외 기존 동작을 보존 | 기존 installer 회귀 검증 |
| AC4 | Claude native agent 다섯 개·Harness·외부 스킬·전역 관리 구간 설치 | 결과 파일·frontmatter 구조 확인 |
| AC5 | Claude 모델·effort가 별도 설정과 일치하고 재적용이 Codex를 변경하지 않음 | 설정·renderer·재적용 확인 |
| AC6 | 역할별 정확한 tools allowlist와 중첩 위임 금지 적용 | frontmatter·정책·대표 역할 확인 |
| AC7 | Claude adapter가 Codex 전용 API·worktree 계약을 실행 요구로 남기지 않음 | 설치된 전체 Claude payload 검토 |
| AC8 | 두 대상이 상대 플랫폼·관리 밖 파일을 보존 | 격리 설치 fixture 비교 |
| AC9 | CLAUDE_CONFIG_DIR의 unset·기본 경로 동등값은 허용하고 빈 값·다른 경로는 부수 효과 전에 거부 | 경로·환경 변수 조합 확인 |
| AC10 | CLAUDE.md 갱신이 멱등적이며 사용자 내용 보존 | 반복 설치·기존 내용·손상 마커 확인 |
| AC11 | --check·--dry-run이 subprocess·네트워크·쓰기 없이 동작 | 금지 동작 감시·파일 상태 비교 |
| AC12 | manifest·충돌·symlink·취득 중 변경을 안전하게 거부 | 실패 조건별 집중 확인 |
| AC13 | 교체 실패 시 복구하고 복구 실패 시 자료·경로 보존 | 단계별 실패 주입 |
| AC14 | CEO→역할→보고 흐름과 소유권·승인·동시 실행 정책이 일관 | CLAUDE.md·프로필·adapter의 정적 계약 검토 |
| AC15 | help·README·완료 출력이 명세와 실제 설치에 일치 | 예제·출력·설치 결과 교차 확인 |

검증은 격리된 사용자 홈을 사용해 실제 사용자 설치를 변경하지 않는다.

Claude CLI를 사용할 수 있으면 모델 API를 호출하지 않는 로컬 CLI 확인으로 프로필 인식 여부를 검증한다. 대표 역할의 실제 실행은 이 설치기 검증에서 필수로 호출하지 않는다. 실행 중 위임 금지 등은 frontmatter 제한과 정책 검토를 함께 근거로 삼는다.

CLI가 없거나 설치된 프로필을 API 호출 없이 확인할 방법이 없으면 해당 런타임 인식 범위를 미검증으로 보고한다. 정적 검사 통과를 실사용 검증 통과로 바꾸지 않는다.

위 항목은 전체 변경의 수락 요구다. 구현 task와 commit 경계, 의존성별 검증 시점은 승인 후 계획에서 정의한다.

각 task의 요구된 집중 검증과 CEO 수락을 수행하며, 모든 task 수락 후 최종 전체 변경에 대해 독립 Reviewer 검토를 한 번 수행한다. CEO가 최종 결과·미검증 범위·잔여 위험을 통합하여 완료를 판단한다.

## 14. 위험·근거·후속 게이트

주요 위험은 다음과 같다.

- provider에 따라 모델 alias와 effort 적용이 달라질 수 있음
- Claude Code의 향후 frontmatter·도구 동작 변경
- shell 허용 역할의 정책 제약을 보안 sandbox로 오해할 가능성
- Claude와 Codex 정책의 장기적인 의미 차이
- 공통 설치 엔진 변경으로 인한 Codex 회귀
- 외부 skill의 upstream 구조 변경

이번 명세에서 비기본 설정 루트는 안전 거부로 결정했으며 미해결 구현 선택으로 남기지 않는다. 기본 경로의 실제 프로필 인식은 API 호출 없이 확인할 수 있을 때 검증하고, 확인할 방법이 없으면 미검증으로 남긴다. 대표 역할의 모델 실행은 이 설치기 검증에서 요구하지 않는다.

공식 근거:

- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config)
- [Claude Code environment variables](https://code.claude.com/docs/en/env-vars)

정확한 최소 CLI 버전은 근거 없이 숫자를 지정하지 않는다. 사용하는 frontmatter·effort 기능의 공식 계약과 실제 검증 버전을 기록하고, 확인하지 않은 이전 버전의 호환성을 보장하지 않는다.

사용자는 이 명세를 “진행해”로 승인했고, 구현 계획도 “ㅇㅇ”로 승인했다. 현재는 승인된 문서 batch commit과 T1 수락·커밋을 준비한다.

작성 당시 계획 승인 전에는 실행 대상 선택·branch 전환·문서 staging/commit·Coder 인계를 수행하지 않는다는 게이트를 적용했다. 실제 실행 순서에서 T1 Coder가 문서 batch commit과 canonical handoff record보다 먼저 시작된 절차상 누락은 handoff record에 사실대로 기록한다. T2 Coder를 시작하기 전 문서 batch commit과 전체 handoff 검증을 완료한다.

## 자체 검토

- Codex와 Claude Code 모두 공통 install.command를 사용하고 대상 선택을 명시한다.
- 비기본 CLAUDE_CONFIG_DIR는 v1에서 설치 전에 거부하도록 확정했다. 공식 자료에 없는 전역 agent·skill·memory 이동을 주장하지 않았다.
- 승인된 다섯 모델·effort 값을 그대로 반영했다. 공식 label 지원과 provider·런타임 override에 따른 실제 적용 차이를 구분했다.
- 역할별 도구 allowlist를 명시했다. Agent와 이전 별칭 Task를 제외하고, shell 허용 역할은 정책 제약임을 밝혔다.
- Claude payload·모델 설정·재적용 경로를 구체화했고 Codex source와 별도 관리한다.
- Codex 전용 payload·예시 설정·유틸리티를 codex/ 아래에 두고, 설치 대상 사용자 경로와 공용 파일을 구분했다.
- 설치 대상 격리, 읽기 전용 검사, backup·staging·rollback 및 실패 복구를 포함했다.
- 남은 호환성 확인은 구현 선택의 공백이 아니라 실제 CLI 통합 검증이다. 수행하지 못한 항목은 미검증으로 보고한다.
- 계획 승인 전에는 파일 staging·commit이나 구현을 시작하지 않는다.
