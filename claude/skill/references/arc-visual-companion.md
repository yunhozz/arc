# Visual companion

Use a visual when it materially helps design discussion or verification. Orchestrator determines the available
capability and consent required by the actual tool. Planner returns visualization needs to Orchestrator because its
tools are read-only file inspection; do not invent browser or shell access for it.
Other depth 2 roles must stay within their exact allowlists and may not delegate visualization to another agent.

Determine actual available browser and preview capabilities before use; do not assume the platform provides a preview tool.
Use an available authorized local/browser workflow only when scoped by Orchestrator.
Keep preview artifacts separate from user files, record generated side effects, preserve unrelated work,
and report unavailable capabilities without claiming visual verification. MUST NOT expose secrets or publish a preview without authorization.

Upstream guide/scripts: `<installed ARC>/references/visual-companion.md` and adjacent `scripts/`.
ARC guide: `references/arc-visual-companion.md`; Orchestrator briefs absolute paths and retains approval/server/browser
ownership. Missing files stop dependent work. MUST NOT use a global fallback.

Run the upstream relative commands from the installed ARC `references/` directory. Orchestrator supplies that
absolute working directory and records `screen_dir`, `state_dir`, and the complete keyed URL returned by the server
or this session's `state/server-info`; do not guess another session path.

An A/B highlight proves only the browser selection display. Check the recorded session's exact `state_dir/events`
file separately for saved choice events. Clicking does not start a chat turn or an automatic assistant response.
Tell the user to return to chat and send a follow-up message after selecting. On that actual next user turn, read
the same session's events file again and combine it with the current message. Treat current chat text as primary and
events as supplemental; current chat text wins on conflict, and missing or ambiguous feedback needs clarification.
Do not claim event storage from a highlight or next-turn consumption from an earlier QA parse. Preserve the imported
guide and scripts unchanged.

## Follow-up Verification of Approved Visual Sources

Each visual criterion requires the exact location, version, approval, and access state of the approved visual source; criterion IDs, properties, and comparison method; and evidence linking the actual output to its revision. An Implementer report does not replace fresh QA's direct comparison. Record results as pass, mismatch, or unverified and connect them to the existing proven/unmet/unverified criterion verdicts. Use pass only when accessible evidence meets the visual criterion; keep unsupported claims unverified. Missing output-to-revision linkage is unverified; a visible difference is a mismatch. Record these separately; do not infer the current branch UI state. Hold the comparison if the approved source or actual output is inaccessible or interpretation approval is missing.

Static policy, generated-file, and manifest checks are structural evidence. They do not prove actual role behavior, an installed build, Claude Code CLI runtime compliance, or visual fidelity. Reports include actual changes, exclusion rationale, checks run and omitted, each criterion's evidence and limits, and platform availability. Keep baseline failures separate; progress on independent work does not relax required checks or acceptance criteria.
