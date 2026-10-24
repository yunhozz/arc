# Subagent limits

Before the first subagent creation, Orchestrator reads this reference and the adjacent
`../limits.toml` (installed at `skills/arc/limits.toml`). Require version = 1,
`max_total_subagents` and `max_concurrent_subagents` as positive safe integers.
Installation defaults are max_total_subagents = 100 and max_concurrent_subagents = 5.
A missing, malformed or unreadable policy blocks new creation. Report it; MUST NOT assume defaults.
Freeze these settings for one ARC coordination session/tree; reinstalling affects new sessions.

## Counting and reservations

Maintain a session ledger of instance IDs, parent IDs, pending reservations, creation outcomes,
and active/completed state. The Orchestrator itself is excluded. All created descendants,
including nested or non-ARC agents, count toward the total. Completed agents never refund the cumulative budget. Follow-up/resume of the same instance does not increment total;
a fresh instance, retry creating a new instance, or replacement increments it.
Waiting, blocked, running and idle resumable instances consume concurrency until their
completion/termination is confirmed. Obey any lower actual runtime capacity, including
native retention of completed instances; ARC counts do not prove that a native slot is free.

Before any parallel dispatch, reserve the entire proposed batch in the ledger:
created + pending reservations + proposed <= max_total_subagents, and
active + pending reservations + proposed <= max_concurrent_subagents and available runtime capacity.
Record a reservation before each creation call. Confirmed creation converts it into a created,
active ID. Release a reservation only when failure proves no instance was created.
An uncertain result retains its reservation and capacity until reconciled. MUST NOT retry blindly.
Serialize work when a batch does not fit. There are no reserved role slots.

## Continuation and exhaustion

Preserve the ledger through continuation, resume and context compaction; reconcile actual instance
IDs before dispatch. Ledger loss must never reset counters to zero. If reconstruction is incomplete,
hold creation and report the unknown budget; use a conservative upper bound only when the reconstructed records support it.
Completion frees confirmed active capacity; it does not restore the total-created budget. Exhaustion holds new
creation and requires reporting remaining work and budgets. It does not authorize skipping required
QA or Reviewer, role freshness, approval, ownership, dependency or same-file edit gates.

This cumulative guard and ARC scheduling are prompt-level policy, not hard runtime enforcement.
Policy text tests prove package consistency, not actual agent compliance or native runtime support.
Claude `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` constrains its native session.
Independent sessions, accounts and platforms do not share this ARC ledger; Agent Teams and hosted APIs
are outside this contract. Native application must be checked in a supported new session separately.
