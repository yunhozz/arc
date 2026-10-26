<a id="visual-companion-contract"></a>
# Visual companion contract

Read before offering or operating the companion.

<a id="visual-companion"></a>
## Visual companion

Design discussion is distinct from QA UI acceptance under an approved test brief.

1. Planner returns a useful visual question, reason, options, user decision and complete content draft; no screen writing, server/browser operation or approval request.
2. Orchestrator offers in a separate message when visuals clarify the question, then waits for acceptance. After refusal, continue in text without reoffering unless the user raises it.
3. After acceptance, decide per question. A UI topic or companion consent does not route every question to a browser.
4. Orchestrator owns guide, server/browser, paths, live-session checks, complete keyed URL, screens/session state, feedback/events and cleanup. Clear stale screens when returning to text. Check the server before display. After replies, terminal text is primary and events supplemental.

Upstream guide/scripts: `<installed ARC>/references/visual-companion.md` and adjacent `scripts/`. ARC guide: `references/arc-visual-companion.md`. Orchestrator supplies absolute paths and owns approval/server/browser. Missing files stop dependent work; no global fallback.

1. Run upstream relative commands from installed ARC `references/`; Orchestrator supplies the absolute working directory.
2. Record `screen_dir`, `state_dir` and the complete keyed URL from the server or this session's `state/server-info`. Never guess another session path.
3. A/B highlighting proves selection display only. Separately inspect that session's exact `state_dir/events` for saved events. Clicking starts neither a chat turn nor an automatic response.
4. Tell the user to return to chat and send a follow-up after selection. On the actual next turn, reread the same events file and combine it with the current message. Current chat text is primary; events are supplemental. Chat wins conflicts; clarify missing/ambiguous feedback.
5. Do not infer storage from highlighting or next-turn consumption from an earlier QA parse. Preserve imported guide/scripts.

<a id="follow-up-verification-of-approved-visual-sources"></a>
## Follow-up verification of approved visual sources

Each visual criterion requires exact approved source location/version/approval/access state, criterion IDs/properties/comparison method and actual-output-to-revision evidence. Implementer reporting does not replace fresh QA comparison.

- Record pass/mismatch/unverified and connect to proven/unmet/unverified criterion verdicts. Pass requires accessible evidence meeting the criterion; unsupported claims remain unverified.
- Missing revision linkage is unverified; visible difference is mismatch. Record separately without inferring current branch UI state.
- Hold comparison for inaccessible source/output or missing interpretation approval.

Static policy/generated-file/manifest checks prove structure only, not actual role behavior, installed builds, Claude Code CLI compliance or visual fidelity. Report changes, exclusions, run/omitted checks, criterion evidence/limits and platform availability. Separate baseline failures. Independent progress never relaxes checks/criteria.
