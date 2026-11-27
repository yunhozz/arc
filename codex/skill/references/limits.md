<a id="subagent-limits"></a>
# Subagent limits

Shared text for this section: [limits-common.md#subagent-limits](limits-common.md#subagent-limits). It applies here exactly as if written in place.

<a id="counting-and-reservations"></a>
## Counting and reservations

Shared text for this section: [limits-common.md#counting-and-reservations](limits-common.md#counting-and-reservations). It applies here exactly as if written in place.

<a id="continuation-and-exhaustion"></a>
## Continuation and exhaustion

Shared text for this section: [limits-common.md#continuation-and-exhaustion](limits-common.md#continuation-and-exhaustion). It applies here exactly as if written in place.

Cumulative limits and scheduling are prompt policy, not hard runtime controls. Text tests prove package consistency, not live compliance/native support.
Codex `[agents].max_concurrent_threads_per_session` and Claude `settings.json.env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` constrain their respective sessions.
Independent sessions/accounts/platforms do not share the ledger. Agent Teams and hosted APIs are outside this contract. Verify native application separately in a supported new session.

Shared text for this section: [limits-common.md#continuation-and-exhaustion-2](limits-common.md#continuation-and-exhaustion-2). It applies here exactly as if written in place.
