# Visual companion contract

Read before offering or operating a visual companion.

## Visual companion

Visual companion design discussion is distinct from QA UI acceptance checks under the approved test brief.

Planner identifies a genuinely visual question, explains why a visual helps, and returns options, the user decision,
and a complete content draft; Planner does not write screens, start a server, operate a browser, or request approval.
Orchestrator makes a just-in-time offer as its own message only when a question is clearer visually, then waits for
acceptance. If declined, continue in text and do not offer again unless the user raises it. If accepted, decide per
question whether to use the companion. Orchestrator owns its guide, server/browser, workspace paths, live-session
checks, complete keyed URL, screens, session state, feedback/events, stale-screen clearing when returning to text, and
cleanup. Check the server before showing a screen; after the user's reply, treat terminal text as primary and events as
supplemental. A UI topic or accepted companion alone does not route every question through a browser.


Upstream guide/scripts: `<installed ARC>/references/superpowers/brainstorming/visual-companion.md` and adjacent `scripts/`.
ARC guide: `references/visual-companion.md`; Orchestrator briefs absolute paths and retains approval/server/browser
ownership. Missing files stop dependent work. MUST NOT use a global fallback.

## 승인된 시각 원본의 후속 검증

각 시각 기준은 approved visual source의 정확한 위치·버전·승인·접근 상태, criterion IDs와 속성·비교 방법, actual-output identity와 revision 연결 근거를 요구한다. Implementer 보고는 fresh QA의 actual comparison을 대신하지 않는다. 결과는 pass, mismatch, unverified로 나누고 기존 proven/unmet/unverified 기준 판정과 연결한다. pass는 접근 가능한 증거가 해당 시각 속성을 충족한 경우에만 사용한다. 증거가 없는 부분은 unverified로 남긴다. output revision 연결 부재는 unverified이고, visible difference는 mismatch다. 둘은 별도 관측이며 현재 branch UI 상태를 추정하지 않는다. 승인 원본 또는 실제 출력에 접근할 수 없거나 해석 승인이 없으면 해당 비교를 보류한다.

정적 정책·생성물·manifest 검사는 구조 증거다. 실제 역할 행동, 설치본, Claude Code CLI runtime 준수 또는 시각 일치를 증명하지 않는다. 보고는 실제 변경·제외 근거, 실행한 검사와 미실행 검사, 기준별 증거·한계, 플랫폼별 접근 가능성을 포함한다. 기존 baseline 실패를 별도로 보존하며 독립 작업 진행이 필수 검사나 수용 조건을 완화하지 않는다.
