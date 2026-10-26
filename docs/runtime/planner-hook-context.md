# Planner hook inputs and verification evidence

Investigation date: 2026-10-26. Scope: the approved Planner gate T3 implementation.

Installed hooks **observe only** `PreToolUse`/`PostToolUse` with the `Agent` matcher and `SubagentStart`. `runHook({observationOnly:true})` or `--observe-only` records raw-event hashes and workflow candidates without changing call opportunities, pending assignments, identity or completion. Installation paths without providers register no active deny gate.

## Input supply and verification

| Input | Actual supplier | Implementation checks | Remaining limits |
|---|---|---|---|
| `hook_event_name` | Platform hook stdin | Supported event names | JSON alone cannot authenticate host |
| `session_id` | Platform hook stdin | Nonempty; trusted adapter matches `context.sessionRef` | No authenticated session→workflow registration provider |
| `tool_use_id` | `PreToolUse`/`PostToolUse` stdin | Nonempty; adapter matches `context.toolUseId` | No documented tool-use correlation for `SubagentStart` |
| `tool_name`, `tool_input` | Tool hook stdin | Supported tool/JSON shape; trusted `describeTool` interprets whole call | Names/prompts cannot authenticate role or substantive progress |
| `cwd` | Platform hook stdin | Observer rechecks Git root/common-dir without shell and containment | Target observation replaces neither actor nor approval authentication |
| `agent_id`, `agent_type` | `SubagentStart` stdin | Records ID; type only as `claimedAgentType` | No role/assignment inference from name, shared session or sole pending item |
| `context.sessionRef`, `actorRef`, `taskId` | Separate trusted host dependency | Existing identity/active lease/assignment/user-approval provenance | Installed `main(input)` supplies no dependency |
| `context.requestId`, `toolUseId` | Trusted host dependency | Correlation/fingerprint/replay | Raw `tool_input`/event `context` is not a supplier |
| `context.statePath`, `state` | Trusted host dependency | Durable lock/revision/workflow/target/stage contracts | Observer lists candidates without arbitrarily selecting one |
| `context.policy`, `evidence` | Trusted host dependency | Policy/runtime/adapter versions/hashes/verified provenance | No production provider; caller JSON is not native evidence |
| `context.describeTool` | Trusted function | Semantic operations/paths/descriptors and Planner stage/request linkage | Never construct functions from stdin; missing dependency explicitly denies in adapter |
| Planner stage/criterion/review | Durable `plannerLedger` and trusted evidence | Approved stage/version, whole review, concrete open criterion, result/pending linkage | Semantic completeness/new-input meaning are hash-bound operator attestations |
| Artifact bytes/hash | Trusted local reader or verified provider bundle | T2 rereads files; native decider checks bundle stage/ref/hash | Native provider integration unimplemented; native bundles are synthetic fixtures |
| Assignment/start/result correlation | `context.observeAgent`/existing pending assignment | Identity binds only with matching verified eventRef/assignmentId/correlationRef/scope | Raw events stay `unmatched`/`uncorrelated`; reservations remain |
| `context.failureBlocking` | Claude trusted host dependency | Verified installed version/verificationRef/`onFailure: block` | No local Claude CLI; real blocking unverified |

`plannerHookContextStatus` lists missing provider fields. The adapter's normal `main(input, context)` stores T2 decisions and native reservations in one transaction. Passing this function path does not prove the installed host stopped an actual call.

## Platform scope

Codex documentation states local function tool `spawn_agent` matches `Agent` and supports `PreToolUse` deny. Hosted tools are outside this path; specialized paths may bypass hooks. Errors/timeouts/malformed responses may permit execution, so hooks are not a complete enforcement boundary. Whether app `collaboration.spawn_agent`/`followup_task` traverse installed hooks is **unknown**, without actual evidence. Missing observations prove neither compliance nor blocking. [Codex Hooks](https://learn.chatgpt.com/docs/hooks)

Claude `Agent` supports pre-execution `PreToolUse` deny. `SubagentStart` observes after creation/resume and cannot prevent creation. `onFailure: block` needs Claude Code 2.1.295+ and separately verified installed-version support. Installed observers keep `onFailure: continue`. [Claude Hooks reference](https://code.claude.com/docs/en/hooks)

Orchestrator observed Codex CLI `0.157.0` and no `claude` executable locally. This investigation has **no live deny result proving non-execution for the same platform version/session/attempt**. Hook trust review, callback execution and actual host application remain unverified.

## Evidence interpretation

- Adapter tests: trusted fixtures cover initial/correction/further decisions, no-progress rejection, durable reservations and observation.
- Installation/payload checks: managed hook settings, shipped bytes, user-setting preservation/removal.
- Observation audit: event hash/session/agent-tool-use refs/stage candidates/reasons. Unauthenticated identity stays unverified. Without stable start-event identity, content hashes deduplicate only content; identical resume events are indistinguishable.
- Neither these results nor unauthenticated `source: native` receipts prove actual host deny enforcement.
