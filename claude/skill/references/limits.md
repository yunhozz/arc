<a id="subagent-limits"></a>
# Subagent limits

Before the first creation, Orchestrator reads this reference and the adjacent `../limits.toml` (installed at `skills/arc/limits.toml`). Require `version = 1` and positive safe-integer `max_total_subagents`/`max_concurrent_subagents`. Installation defaults are `100`/`5`. Missing, malformed or unreadable policy blocks creation. Report it without assuming defaults. Freeze settings for one ARC session/tree; reinstalling affects new sessions.

<a id="counting-and-reservations"></a>
## Counting and reservations

- Track instance IDs, parent IDs, pending reservations, creation outcomes and active/completed state in the session ledger. Exclude Orchestrator, but count every created descendant, including nested/non-ARC agents.
- Completion never refunds cumulative creation. A follow-up or resume using the same instance adds nothing; fresh instances, new-instance retries and replacements increment the total.
- Waiting, blocked, running and resumable idle instances consume concurrency until completion or termination is confirmed. Obey lower actual runtime capacity, including native retention of completed instances. ARC counts do not prove free native slots.

Reserve the full proposed parallel batch before dispatch, satisfying both:

1. `created + pending reservations + proposed <= max_total_subagents`
2. `active + pending reservations + proposed <= max_concurrent_subagents`, within actual available runtime capacity.

Reserve before each call. Confirmed creation becomes a created/active ID. Release only when failure proves no instance was created. Uncertain results retain capacity until reconciled; NEVER retry blindly. Serialize batches that do not fit. No role has reserved slots.

<a id="continuation-and-exhaustion"></a>
## Continuation and exhaustion

Preserve the ledger across continuation, resume and compaction, and reconcile actual IDs before dispatch. NEVER reset lost counters to zero. Incomplete reconstruction holds creation and reports unknown budget; use a conservative upper bound only when records support it.

Confirmed completion or termination frees active capacity. Exhaustion holds creation and reports remaining work/budget; it never waives QA/Reviewer, role freshness, approval, ownership, dependency or same-file edit gates.

Cumulative limits and scheduling are prompt policy, not hard runtime controls. Text tests prove package consistency, not live compliance/native support.
Claude `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` constrains its native session.
Independent sessions/accounts/platforms do not share the ledger. Agent Teams and hosted APIs are outside this contract. Verify native application separately in a supported new session.

Composite platform routes observe these limits and each platform's actual capacity. ARC enforces the bridge limits at `prepare-dispatch`: active bridge dispatches (`reserved`, `starting`, `running`, `unknown`) must not exceed `max_concurrent_subagents` of the installed `limits.toml`, and the bridge dispatches created per workflow must not exceed `max_total_subagents`. `resume` rechecks only `max_concurrent_subagents`; it does not increase the cumulative count. Every bridge dispatch also counts as a created instance in the Orchestrator ledger; the native plus bridge total is kept in that ledger (prompt policy). A dispatch in `unknown` keeps its slot until the operator confirms termination; its slot is never released automatically. Role timeouts are fixed: `arc_implementer` 60 minutes, `arc_qa` 30 minutes, others 20 minutes; `limits.toml` format is unchanged. Terminal leases (`completed`, `failed`, `cancelled`) older than 30 days are pruned automatically; non-terminal leases are never pruned.
