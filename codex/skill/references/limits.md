<a id="subagent-limits"></a>
# Subagent limits

Before first creation, Orchestrator reads this reference and adjacent `../limits.toml` (installed at `skills/arc/limits.toml`). Require `version = 1` and positive safe-integer `max_total_subagents`/`max_concurrent_subagents`. Installation defaults are `100`/`5`. Missing, malformed or unreadable policy blocks creation; report it without assuming defaults. Freeze settings for one ARC session/tree; reinstalling affects new sessions.

<a id="counting-and-reservations"></a>
## Counting and reservations

- Track instance IDs, parent IDs, pending reservations, creation outcomes and active/completed state in the session ledger. Exclude Orchestrator, but count every created descendant, including nested/non-ARC agents.
- Completion never refunds cumulative creation. Same-instance follow-up/resume adds nothing; fresh instances, new-instance retries and replacements increment the total.
- Waiting, blocked, running and resumable idle instances consume concurrency until confirmed completion/termination. Obey lower actual runtime capacity, including native retention of completed instances. ARC counts do not prove free native slots.

Reserve the full proposed parallel batch before dispatch, satisfying both:

1. `created + pending reservations + proposed <= max_total_subagents`
2. `active + pending reservations + proposed <= max_concurrent_subagents`, within actual available runtime capacity.

Reserve before each call. Confirmed creation becomes a created/active ID. Release only when failure proves no instance was created. Uncertain results retain capacity until reconciled; never retry blindly. Serialize batches that do not fit. No role has reserved slots.

<a id="continuation-and-exhaustion"></a>
## Continuation and exhaustion

Preserve the ledger across continuation/resume/compaction and reconcile actual IDs before dispatch. Never reset lost counters to zero. Incomplete reconstruction holds creation and reports unknown budget; use a conservative upper bound only when records support it.

Completion frees confirmed active capacity only. Exhaustion holds creation and reports remaining work/budget; it never waives QA/Reviewer, role freshness, approval, ownership, dependency or same-file edit gates.

Cumulative limits and scheduling are prompt policy, not hard runtime controls. Text tests prove package consistency, not live compliance/native support.
Codex `[agents].max_concurrent_threads_per_session` and Claude `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` constrain their respective sessions.
Independent sessions/accounts/platforms do not share the ledger. Agent Teams and hosted APIs are outside this contract. Verify native application separately in a supported new session.
