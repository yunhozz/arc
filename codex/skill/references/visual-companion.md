# Visual companion contract

Read before offering or operating a visual companion.

## Visual companion

Visual companion design discussion is distinct from QA UI acceptance checks under the approved test brief.

Planner identifies a genuinely visual question, why a visual helps, options, the user decision, and a complete content
draft; Planner does not write screens, start a server, operate a browser, or request approval.
Orchestrator makes a just-in-time
offer as its own message only when a question is clearer visually, then waits for acceptance. If declined, continue in
text and do not offer again unless the user raises it. If accepted, decide per question whether to use the companion.
Orchestrator owns its guide, server/browser, workspace paths, live-session checks, complete keyed URL, screens,
session state,
feedback/events, stale-screen clearing when returning to text, and cleanup. Check the server before showing a screen;
after the user's reply, treat terminal text as primary and events as supplemental. A UI topic or accepted companion
alone does not route every question through a browser.

