"""Approved structural policy checks; these do not prove live agent compliance."""

from collections.abc import Mapping
import json
from pathlib import Path
import re
import subprocess
import unittest


REPO = Path(__file__).resolve().parents[1]
PLATFORMS = ("codex", "claude")
EVIDENCE_VERDICTS = r"criteria are proven, unmet or unverified\."
ROLE_POLICY = "lib/policy/role-policy.json"
COMMIT_RULE_ID = "git.orchestrator-accept-commit"
COMMIT_RULE_PATTERN = (
    r"only orchestrator accepts work and performs git mutations\. "
    r"one approved top\-level plan task becomes one focused implementation commit "
    r"after criteria, required checks and findings are satisfied\. orchestrator accepts, then"
)
PROFILE_WORKSPACE = r"(?:never|do not) create or switch.*(?:workspaces or branches|branches or workspaces)"
PROFILE_FRAGMENT_PREFIX = "rendered:"

# Each contract is evaluated at its owner independently for each platform.
# Missing gates, acceptance boundaries, and adapter conflation are the breaks
# these checks catch; wording outside these obligations is free to change.
COMMON_CONTRACTS = {
    # Approved written-contract checks: losing these gates must fail both adapters.
    # Keep PLAN obligations within one sentence; generated policy prose must
    # not substitute for a removed obligation in the owning manual section.
    "PLAN_UPDATE_CLASSIFICATION": ("references/planning.md", (
        # R-1: distinguish task records from every other body change.
        r"task progress records[^.]*need no new approval",
        r"checkboxes[^.]*notes[^.]*results[^.]*evidence[^.]*completion status",
        r"removing checks[^.]*invented success[^.]*unsupported acceptance[^.]*mixed scope changes are not progress records",
        # R-2: approve the revised contract before affected work; refresh its owner.
        r"approved-body changes need revised approval except task progress records below",
        r"goals[^.]*task boundaries[^.]*scope[^.]*criteria[^.]*method[^.]*risk[^.]*dependencies[^.]*checks[^.]*revised approval before affected work",
        r"contract revision[^.]*fresh implementer[^.]*remaining work",
        r"written-spec approval[^.]*before[^.]*dependent plan revision",
        r"mechanical[^.]*(?:correction|fix)[^.]*plan revision",
        # R-3/R-4: same file, pending state and append-only actual approval history.
        r"after approval orchestrator edits the same file, appends a revision-history row and leaves the revision uncommitted",
        r"version[^.]*approval time[^.]*classification[^.]*affected tasks[^.]*reason[^.]*append.only[^.]*no sha",
        r"v1[^.]*first revision[^.]*actual[^.]*initial approval time",
        # R-7/R-11: first eligible commit, sole closing exception, no rewrite/backdating.
        r"keep all approved spec/plan revisions pending for the accepted commit of the first top-level task[^.]*executed or reconfirmed[^.]*revised version",
        r"only when no implementation work remains before overall completion may orchestrator make one standalone `docs\(plan\)` closing commit:[^.]*evidence canonically[^.]*all pending revisions/trailers and no implementation files",
        r"no separate[^.]*docs[^.]*fixup commit",
        r"actual approval[^.]*(?:time|chronology)[^.]*not[^.]*retroactive",
        r"never amend planning or implementation commits, reset, replay or rewrite their history",
    )),
    "PLAN_REVISION_COMMIT": ("references/handoff-prep.md", (
        # R-5: canonical fields, immutable approved copies and exact copy path.
        r"pending revision[^.]*content hash[^.]*approval",
        r"gitpath[^.]*fromversion[^.]*toversion[^.]*contenthash[^.]*approvalref[^.]*approvedat[^.]*classification[^.]*reason[^.]*affectedtaskids[^.]*status",
        r"plan-revisions/[^.]*\.v<?n>?\.md",
        r"never overwrite[^.]*approvals[^.]*copies",
        # R-6: explicit ownership in every role brief.
        r"brief[^.]*orchestrator-owned[^.]*pending revision[^.]*version[^.]*contenthash",
        r"if another task's progress records were committed after approval[^.]*brief[^.]*sha-256 of the working-tree document content[^.]*approved content plus those progress records",
        r"implementer[^.]*(?i:Tester)[^.]*preserve[^.]*neither[^.]*own[^.]*unrelated user",
        # R-7/R-8: all pending revisions, fallback order and unsafe separation hold.
        r"include all pending revisions in the accepted commit of the first top-level task[^.]*executed or reconfirmed[^.]*revised version, otherwise a current task or final reviewer follow-up commit",
        r"standalone[^.]*docs\(plan\)[^.]*no implementation[^.]*canonical[^.]*evidence",
        r"exclude pending revision hunks from independent prior-version task commits; hold the commit if separation is unsafe",
        # R-9: per-document and per-version ASCII trailers, preserving existing ones.
        r"plan-revision: [^.]* -> ",
        r"plan-approved-at:[^.]*iso 8601[^.]*plan-reason:",
        r"per document[^.]*per version[^.]*repeat[^.]*preserve[^.]*trailers",
        # R-10: content bytes, all post-approval records and canonical expected hash.
        r"after commit verify the sha-256 of each committed document's content \(not the git blob oid\)[^.]*latest approved `contenthash`[^.]*no progress records have been committed since approval",
        r"otherwise compare against the latest approved copy[^.]*only classified progress records[^.]*this commit's task[^.]*committed for other tasks after approval[^.]*r-8 separation",
        r"record the sha-256 of the expected content used for this comparison in the canonical record[^.]*never overwrite approved copies",
    )),
    "PLAN_REVISION_EVIDENCE": ("references/verification.md", (
        # R-10: content SHA-256, classified post-approval progress and expected hash.
        r"committed[^.]*blob[^.]*latest approved[^.]*content hash",
        r"if no progress records have been committed since approval, the sha-256 of the committed document content \(not the git blob oid\) must equal the latest approved `contenthash`",
        r"otherwise the diff from the latest approved copy must contain only classified progress records belonging to that commit's task or committed for other tasks after approval \(including r-8 separation\)",
        r"record the sha-256 of the expected content used for this comparison in the canonical record[^.]*never overwrite approved copies",
        r"status[^.]*committed[^.]*no pending revision",
        r"commit sha[^.]*record only[^.]*not[^.]*document",
        # R-12: retain commit links, rerun affected checks and refresh stale evidence.
        r"existing commit[^.]*evidence links[^.]*remain valid",
        r"contract revision[^.]*affected[^.]*checks[^.]*rechecks[^.]*rerun[^.]*revised version",
        r"stale[^.]*plan-file[^.]*refresh",
    )),
    "PLAN_LEVEL_COMMIT": ("references/commit.md", (
        r"its own progress records, eligible plan-level progress records, eligible pending approved spec/plan revisions",
        r"plan-level progress records are final verification results, each final reviewer round's verdict and finding dispositions \(including references to user decisions\) and overall completion status",
        r"preserving the approved contract, they need no new approval; changing it makes them a plan revision",
        r"they are the sole exception to excluding other tasks' records: orchestrator includes them in that plan's next commit, either a task acceptance commit created by final reviewer finding work or the final reviewer follow-up commit",
        r"when no implementation work remains, such as a final reviewer approval without findings or a user decision not to fix a non-blocking finding, orchestrator creates no commit for them alone: unless a standalone closing commit made for pending revisions carries them, orchestrator keeps them only in the canonical handoff record, leaves the plan document unchanged and the working tree clean, and states this in the completion report",
        r"plan-level progress records alone never trigger the standalone `docs\(plan\)` closing commit",
        r"write plan-level progress records into the plan document only while staging the commit that carries them; until then keep them in the canonical handoff record\.",
        r"when this closing commit is made for pending revisions, it also carries the plan-level progress records",
    )),
    "PLAN_LEVEL_PLANNING": ("references/planning.md", (
        r"plan-level progress records \(final verification results, final reviewer round verdicts and finding dispositions with user-decision references, and overall completion status\) follow \[commit\]\(commit\.md#execution-time-plan-document-updates\): they ride the plan's next task acceptance or final reviewer follow-up commit, or a standalone closing commit made for pending revisions; otherwise they stay only in the canonical record",
        r"\| non-blocking final reviewer finding disposition \| auto \| fix or no-fix decision only: recommended disposition within approved scope; scope-expanding fixes → user; reviewer recheck and acceptance stay unchanged \|",
        r"sole closing exception\. plan-level progress records alone never trigger it\.",
    )),
    "PLAN_LEVEL_PREPARATION": ("references/handoff-prep.md", (
        r"plan-level progress records follow \[commit\]\(commit\.md#execution-time-plan-document-updates\) and alone never justify the closing commit",
        r"\(including r-8 separation\) and plan-level progress records carried by this commit",
    )),
    "PLAN_LEVEL_EVIDENCE": ("references/verification.md", (
        r"\(including r-8 separation\), or classified plan-level progress records carried by that commit",
        r"before the overall completion report and any push, pr or merge authorization request, orchestrator verifies that plan-level progress records are carried by the verified next commit of the plan or, when none follows, recorded only in the canonical handoff record with the plan document unchanged and a clean working tree",
        r"while a user decision on a non-blocking final reviewer finding is pending, hold overall completion; a fix decision follows plan revision and a new task whose accepted commit carries the records, and a no-fix disposition stays canonical only when no later commit follows",
    )),
    "PLAN_LEVEL_HANDOFF": ("references/handoff.md", (
        r"plan-level progress records follow the same `task\.paths` rule; when no task or follow-up commit follows, they stay only in the canonical record, and the cooperative cli adds no support for them",
    )),
    "PLAN_LEVEL_SKILL": ("SKILL.md", (
        r"plan-level progress records ride the plan's next commit or stay only in the canonical record",
    )),
    "PLANNER_COMPLETE_BRIEF": ("references/planning.md", (
        r"original user requirements.*criteria ids.*approved decisions.*open decisions",
        r"current behavior and connected source/generated/runtime/installer/docs",
        r"exact.*current.stage.*deliverable",
        r"consolidated.*changed fields.*unchanged",
        r"no fixed call cap",
    )),
    "SCOPED_AUTHORIZATION": ("references/planning.md", (
        r"an explicit execution request authorizes only sufficiently specified scope from that request or a description the user explicitly references\.",
        r"confirm intent/outcome/constraints/document depth/verification risk",
        r"no unresolved material.*(?:behavior|method|risk).*decision",
        r"record.*authorization evidence.*scope.*acceptance criteria.*constraints.*depth",
    )),
    "AUTHORIZATION_HOLDS": ("references/planning.md", (
        r"silence, ambiguous assent, other\-work approval and vague blanket improvements are insufficient\.",
        r"planner.*new material choices.*not.*approved",
        r"hold affected work for material changes to scope, method or risk, and report the missing decision, evidence and remaining scope\.",
    )),
    "COMPLETION_CONTINUITY": ("references/verification.md", (
        (
            r"once approval/depth/target/handoff hold, continue execution/correction/reverification/required (?i:Tester)\-reviewer/disposition/acceptance/report\.",
            r"orchestrator decides final acceptance",
        ),
        r"reports/probes/commands never complete remaining approved scope\.",
        r"do not make authorized execution an optional offer awaiting response\.",
    )),
    "PROBE_SCOPE": ("references/planning.md", (
        r"probe-only.*findings.*evidence.*limits.*uncertainty",
        r"it authorizes neither product retention nor subsequent implementation\.",
        r"if explicitly requested probe\+implementation is fully specified, classify the whole scope\.",
        r"under bounded conditions, probing is internal with no new report\-time approval boundary\.",
        r"unknown implementation.*not.*blanket authorization",
    )),
    "AUTHORIZATION_REUSE": ("references/handoff.md", (
        r"reuse only for unchanged approved scope/workspace/repository/target with accessible valid evidence\.",
        r"restart.*new role assignment.*not.*repeat approval",
        (
            r"every start/restart compares actual identity/branch/detached head/head/changes/preservation/ownership, approvals/artifacts, document sha/message/paths/content or absence and final state with the brief\.",
            r"reuse waives none of gates 1–7\.",
        ),
    )),
    "OWNERSHIP": ("references/coordination.md", (
        r"\| (?i:Tester) \| verifies without editing \|",
        r"\| reviewer \| independently reviews the final full change \|",
        r"all five specialists report directly at depth 2 without creating agents/delegating\.",
        r"orchestrator.*acceptance.*completion",
    )),
    "DOCUMENT_ORDER": ("references/planning.md", (
        r"written-spec approval.*before.*(?:implementation planning|dependent plan)",
        (
            r"if bounded requires written spec, record necessity/scope using approved short design as basis\.",
            r"this applies recorded judgment, not new spec necessity\.",
        ),
    )),
    "AUTHORING_EXCLUSIVITY": ("references/planning.md", (
        r"drafts are authored only by planner",
        r"orchestrator must not substitute.*planner.s complete draft",
        r"(?:return.*planner.*(?:omissions|completion)|return substantive omissions to planner)",
        r"if planner fails or is unavailable, stop and report.*never draft instead",
    )),
    "HANDOFF_GATE": ("references/handoff.md", (
        r"before.*first start.*restart",
        r"explicit.*(?:execution-target|target) choice",
        r"branch or detached head.*head.*staged/unstaged/untracked",
        r"approved.*document|document approvals",
        r"canonical.*record",
        r"restart briefs send verified deltas and record\-relative `unchanged`; fresh implementer reads it and gets other fields fully\.",
        r"inaccessible.*(?:record|link).*evidence|inaccessible.*record.*block",
    )),
    "READINESS": ("references/planning.md", (
        r"a task is ready only when.*approvals.*preparation.*inputs/contracts.*predecessors.*required evidence.*orchestrator acceptance.*verified focused commits.*accepted no-change",
        r"nonconflicting ownership/resources, available checks/(?i:Tester) and slots under both full\-tree arc and lower actual runtime limits\.",
        r"completion alone releases no dependent\.",
        r"same\-file concurrent implementers are forbidden even on different lines\.",
    )),
    "COMMIT_NEXT_ACTION": ("references/commit.md", (
        (
            r"one approved top\-level task is one focused implementation commit\. orchestrator verifies criteria, current checks and findings, accepts by judgment, then immediately commits locally without separate user commit approval\.",
            r"after acceptance, check git state/scope, stage and commit\.",
        ),
    )),
    "COMMIT_BOUNDARY": ("references/commit.md", (
        r"(?:one approved top-level task.*one focused implementation commit|commit one logical task promptly)",
        r"orchestrator verifies criteria, current checks and findings, accepts by judgment, then immediately commits locally without separate user commit approval\.",
        r"plan omission creates neither new plans nor automatic commits; follow applicable guidance/user requests\.",
        r"no-change task.*no empty commit",
        r"resume verifies/reuses the same task's sha/content/validity without duplication\.",
        r"task acceptance/commit differs from final plan acceptance",
    )),
    "RECOVERY": ("references/git-recovery.md", (
        r"stop.*(?:dependent work|implementer handoff)",
        r"actual.*branch.*head.*index.*(?:files|worktree|working tree|partial completion)",
        r"(?:do not|never).*retry.*(?:fall back|fallback|repeat)",
        r"(?:revalidat|reverif|reevaluat).*gate",
        r"(?:denial.*does not prove a stale lock|denial.*alone.*stale lock)",
    )),
    "EVIDENCE_LIMITS": ("references/verification.md", (
        r"structural checks prove structur(?:e|al criteria) only",
        r"policy, generated\-file and manifest checks prove structure, not role behavior, installed builds, claude code cli compliance or fidelity\.",
        EVIDENCE_VERDICTS,
    )),
}

ROLE_LOCAL = (
    r"report directly to orchestrator at depth 2",
    r"do not create agents or delegate to another role\.",
    r"trust orchestrator's verified workspace, branch/head, approvals, execution\-target choice, document commits and handoff facts;",
    r"(?:actual.*conflict|conflict.*actually hit)",
    r"preserve unrelated staged, unstaged and untracked changes and edit ownership\.",
    PROFILE_WORKSPACE,
    r"(?:never|do not).*delete locks|(?:never|do not).*remove locks",
    r"expected tdd red.*not an operational failure",
)

# Adapter names, execution calls, settings and guard limits live in coordination.md;
# worktree support lives in handoff.md.
NATIVE_ADAPTERS = {
    "codex": (
        r"scouter=`arc_scouter`.*planner=`arc_planner`.*implementer=`arc_implementer`",
        r"spawn_agent.*agent_type",
        r"wait_agent",
        r"model_reasoning_effort",
        r"max_concurrent_threads_per_session.*integer",
        r"prompt-level guards, not sandbox enforcement",
    ),
    "claude": (
        r"scouter=`arc-scouter`.*planner=`arc-planner`.*implementer=`arc-implementer`",
        r"foreground agent call.*background.*completion notification",
        r"`effort`",
        r"claude_code_max_concurrent_subagents.*string",
        r"(?:not a filesystem sandbox|not sandbox enforcement)",
    ),
}
NATIVE_WORKTREE = {
    "codex": (r"selected worktree.*common directory.*registration.*source preservation",),
    "claude": (r"selected worktree.*common directory.*registration.*source preservation",),
}

# This test-only table names the contracts and each platform's owner.
POLICY_CONTRACTS = {
    contract: {
        platform: (f"{platform}/skill/{owner}", patterns)
        for platform in PLATFORMS
    }
    for contract, (owner, patterns) in COMMON_CONTRACTS.items()
}
POLICY_CONTRACTS["ROLE_LOCAL"] = {
    platform: (f"{platform}/agents/arc-implementer.{'toml' if platform == 'codex' else 'md'}", ROLE_LOCAL)
    for platform in PLATFORMS
}
POLICY_CONTRACTS["NATIVE_ADAPTERS"] = {
    platform: (f"{platform}/skill/references/coordination.md", NATIVE_ADAPTERS[platform])
    for platform in PLATFORMS
}
POLICY_CONTRACTS["NATIVE_ADAPTERS"].update({
    f"{platform}-worktree": (f"{platform}/skill/references/handoff.md", NATIVE_WORKTREE[platform])
    for platform in PLATFORMS
})
POLICY_CONTRACTS["OWNERSHIP"].update({
    f"{platform}-role-gate": (f"{platform}/skill/SKILL.md", (r"drafts are authored only by planner",))
    for platform in PLATFORMS
})

# The commit documents still own their conflict checks and must carry the exact
# generated rule. The canonical rule owns the positive exclusive authority check.
POLICY_CONTRACTS["COMMIT_AUTHORITY"] = {
    platform: (f"{platform}/skill/references/commit.md", ())
    for platform in PLATFORMS
}
POLICY_CONTRACTS["COMMIT_AUTHORITY"]["canonical"] = (ROLE_POLICY, (COMMIT_RULE_PATTERN,))
POLICY_CONTRACTS["COMMIT_AUTHORITY"]["claude-implementer"] = (
    "claude/agents/arc-implementer.md", (r"implementer must not commit, even when explicitly assigned",)
)


def contract_owner(contract: str, path: str, pattern: str | tuple[str, ...]) -> str:
    if contract == "ROLE_LOCAL" and pattern != PROFILE_WORKSPACE:
        return f"{PROFILE_FRAGMENT_PREFIX}{path}"
    return path


def normalize_contract(text: str) -> str:
    return " ".join(text.lower().replace("**", "").split())


def pattern_parts(pattern: str | tuple[str, ...]) -> tuple[str, ...]:
    return (pattern,) if isinstance(pattern, str) else pattern


def policy_contract_failures(texts: Mapping[str, str]) -> list[str]:
    """Return contract IDs and owner paths for supplied text, without file I/O."""
    failures = []

    def require(contract: str, path: str, patterns: tuple[str | tuple[str, ...], ...]) -> None:
        if path not in texts:
            failures.append(f"{contract}: {path}: missing owner")
            return
        owner_texts = {path: normalize_contract(texts[path])}
        for pattern in patterns:
            owner = contract_owner(contract, path, pattern)
            if owner not in texts:
                failures.append(f"{contract}: {path}: missing rendered owner for {pattern}")
                continue
            if owner not in owner_texts:
                owner_texts[owner] = normalize_contract(texts[owner])
            if not all(re.search(part, owner_texts[owner]) for part in pattern_parts(pattern)):
                failures.append(f"{contract}: {path}: missing {pattern}")

    for contract, owners in POLICY_CONTRACTS.items():
        for path, patterns in owners.values():
            require(contract, path, patterns)
    if ROLE_POLICY in texts:
        rule_line = f"- [{COMMIT_RULE_ID}] {texts[ROLE_POLICY]}"
        for platform in PLATFORMS:
            path, _ = POLICY_CONTRACTS["COMMIT_AUTHORITY"][platform]
            if path in texts:
                block = texts[path].partition("[ARC role policy: contract begin]")[2]
                block, end, _ = block.partition("[ARC role policy: contract end]")
                if not end or block.splitlines().count(rule_line) != 1:
                    failures.append(f"COMMIT_AUTHORITY: {path}: missing generated {COMMIT_RULE_ID} rule")
    for contract, patterns in {
        "AUTHORIZATION_HOLDS": (r"silence is authorization",),
        "PROBE_SCOPE": (r"probe-only authorization authorizes implementation",),
        "COMPLETION_CONTINUITY": (r"a role completion report establishes overall completion",),
        "AUTHORIZATION_REUSE": (r"authorization reuse waives actual state verification",),
        "COMMIT_NEXT_ACTION": (
            r"the task may be committed before orchestrator acceptance",
            r"the task commit may wait until the plan ends",
        ),
        "COMMIT_AUTHORITY": (
            r"implementer may commit when orchestrator explicitly assigns that action",
            r"a role may commit only when orchestrator explicitly assigns that action",
            r"do not stage, commit, push, or merge unless orchestrator explicitly assigns that action",
        ),
    }.items():
        for path, _ in POLICY_CONTRACTS[contract].values():
            text = " ".join(texts.get(path, "").lower().split())
            for pattern in patterns:
                if re.search(pattern, text):
                    failures.append(f"{contract}: {path}: conflicting {pattern}")
    for platform in PLATFORMS:
        path = f"{platform}/skill/references/planning.md"
        if path not in texts:
            continue
        text = " ".join(texts[path].lower().split())
        order = re.search(r"\border:(?= initial design approval →)(.*?)(?:\.(?: |$)|$)", text)
        sequence = (
            "initial design approval", "execution-target choice", "target preparation and verification",
            "formal spec drafting", "written-spec approval", "formal plan drafting",
            "individual plan approvals", "complete applicable set",
            "existing-commit verification and one batch docs commit of remaining approved documents",
            "final git verification", "implementer handoff",
        )
        if not order or not re.search(".*".join(map(re.escape, sequence)), order.group(1)):
            failures.append(f"DOCUMENT_ORDER: {path}: missing or reversed Normal order gates")
        if re.search(r"formal spec and plan drafting must precede execution-target choice", text):
            failures.append(f"DOCUMENT_ORDER: {path}: conflicting reverse order")
        if re.search(r"a user may explicitly change (?:the )?writing responsibility", text):
            failures.append(f"AUTHORING_EXCLUSIVITY: {path}: conflicting user writing override")
    for platform in PLATFORMS:
        root = f"{platform}/skill"
        require("HANDOFF_GATE", f"{root}/SKILL.md", (
            r"before every implementer first start/restart",
            r"references/handoff.md",
        ))
        require("HANDOFF_GATE", f"{root}/references/handoff.md", (
            r"before every start/restart verify approvals/artifacts or omissions, explicit target/reuse, accessible intended repository/workspace, actual git identity/state, preservation/ownership, docs commits or absence and no unresolved failure/partial completion\.",
            r"any failure/missing condition blocks handoff",
            r"same conditions.*before an orchestrator direct edit",
        ))
        require("COMMIT_BOUNDARY", f"{root}/references/commit.md", (r"\{\{arc_commit_language_policy\}\}",))
        require("COMMIT_BOUNDARY", f"{root}/references/handoff-prep.md", (
            r"conventional commit message under \[commit\]\(commit\.md#automatic-commit-after-plan-task-acceptance\)",
        ))
    return failures


def render_profile(path: str, template: str) -> str:
    # Use the same fragment validation and rendering as the installer.
    result = subprocess.run(
        ["node", "--input-type=module", "-e", """
import {readFileSync} from "node:fs";
import {renderAgentProfile} from "./lib/prompts/render.mjs";
const registry = JSON.parse(readFileSync("./lib/prompts/agent-fragments.json", "utf8"));
process.stdout.write(renderAgentProfile(process.argv[1], readFileSync(0), registry));
""", path],
        cwd=REPO, input=template, capture_output=True, encoding="utf-8",
    )
    if result.returncode:
        raise RuntimeError(f"Could not expand {path}: {result.stderr}")
    return result.stdout


def policy_texts() -> dict[str, str]:
    paths = {path for owners in POLICY_CONTRACTS.values() for path, _ in owners.values()}
    for platform in PLATFORMS:
        paths.add(f"{platform}/skill/references/handoff-prep.md")
    texts = {path: (REPO / path).read_text() for path in sorted(paths)}
    rules = json.loads(texts[ROLE_POLICY])["rules"]
    texts[ROLE_POLICY] = next(
        (rule["text"] for rule in rules if rule["id"] == COMMIT_RULE_ID), ""
    )
    for path, _ in POLICY_CONTRACTS["ROLE_LOCAL"].values():
        texts[f"{PROFILE_FRAGMENT_PREFIX}{path}"] = render_profile(path, texts[path])
    return texts


class PolicyContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.texts = policy_texts()

    def test_planner_progress_and_saved_approval_contract(self) -> None:
        # Approved written-contract checks; app visibility and runtime compliance are outside this test.
        profile = " ".join((REPO / "codex/agents/arc-planner.toml").read_text().lower().split())
        planning = " ".join(self.texts["codex/skill/references/planning.md"].lower().split())
        coordination = " ".join((REPO / "codex/skill/references/coordination.md").read_text().lower().split())
        generated_progress = r"briefly state the stage, feedback being applied, actual blocker or next step"
        for artifact, text, progress in (
            ("profile", profile, generated_progress),
            ("planning", planning, r"keep updates brief: stage, feedback being applied, actual blocker, or next step"),
            ("coordination", coordination, generated_progress),
        ):
            for pattern in (
                r"(?:during initial drafting and revisions, report progress only to orchestrator|planner reports initial/revision progress only to orchestrator)",
                progress,
                r"(?:without draft prose or excerpts|never body/excerpts/incremental drafts)",
                r"return the complete draft and self.review to orchestrator for review and correction",
                r"raw responses may appear in app/tool surfaces; prompt policy cannot hide them\.",
            ):
                with self.subTest(artifact=artifact, contract=pattern):
                    self.assertRegex(text, pattern)
        for pattern in (
            r"allow the initial draft and one consolidated correction",
            r"orchestrator handles reformatting, re\-expression, save and patch errors without planner calls\.",
            r"evaluate separate substantive work under the normal planner gate",
        ):
            with self.subTest(artifact="planning", contract=pattern):
                self.assertRegex(planning, pattern)
        self.assertRegex(planning, r"orchestrator keeps user.facing progress brief and based on planner status.*do not relay draft content")
        self.assertRegex(planning, r"at approval present integrated/saved/reviewed markdown without repeating its body in chat\.")

    def assert_contracts(self, *contracts: str) -> None:
        failures = policy_contract_failures(self.texts)
        self.assertEqual([failure for failure in failures if failure.split(":", 1)[0] in contracts], [])

    def test_plan_level_progress_records_follow_commit_and_completion_rules(self) -> None:
        self.assert_contracts(
            "PLAN_LEVEL_COMMIT", "PLAN_LEVEL_PLANNING", "PLAN_LEVEL_PREPARATION",
            "PLAN_LEVEL_EVIDENCE", "PLAN_LEVEL_HANDOFF", "PLAN_LEVEL_SKILL",
        )

    def test_explicit_request_authorization_has_scoped_conditions(self) -> None:
        self.assert_contracts("SCOPED_AUTHORIZATION")

    def test_authorization_rejects_silence_and_scope_expansion(self) -> None:
        self.assert_contracts("AUTHORIZATION_HOLDS")

    def test_approved_no_document_scope_requires_completion(self) -> None:
        self.assert_contracts("COMPLETION_CONTINUITY")

    def test_probe_and_combined_bounded_scope_remain_distinct(self) -> None:
        self.assert_contracts("PROBE_SCOPE")

    def test_authorization_reuse_preserves_target_and_state_gates(self) -> None:
        self.assert_contracts("AUTHORIZATION_REUSE")

    def test_contract_mutations_reject_removed_holds_and_role_guards(self) -> None:
        # A missing hold, completion step or role boundary is a contract regression.
        for contract in ("SCOPED_AUTHORIZATION", "AUTHORIZATION_HOLDS", "COMPLETION_CONTINUITY",
                         "PROBE_SCOPE", "AUTHORIZATION_REUSE", "ROLE_LOCAL", "NATIVE_ADAPTERS",
                         "PLAN_UPDATE_CLASSIFICATION", "PLAN_REVISION_COMMIT", "PLAN_REVISION_EVIDENCE"):
            for path, patterns in POLICY_CONTRACTS[contract].values():
                for pattern in patterns:
                    owner = contract_owner(contract, path, pattern)
                    fixture = normalize_contract(self.texts[owner])
                    with self.subTest(contract=contract, path=path, pattern=pattern):
                        for part in pattern_parts(pattern):
                            self.assertIsNotNone(
                                re.search(part, fixture), "The original required contract must exist"
                            )
                            changed = re.sub(part, " [removed obligation] ", fixture)
                            failures = policy_contract_failures({**self.texts, owner: changed})
                            self.assertIn(f"{contract}: {path}: missing {pattern}", failures)

    def test_authorization_checker_rejects_scope_and_completion_overrides(self) -> None:
        # Contradictory permissions must not pass just because the required prose remains.
        cases = (
            ("AUTHORIZATION_HOLDS", "planning.md", "Silence is authorization."),
            ("PROBE_SCOPE", "planning.md", "Probe-only authorization authorizes implementation."),
            ("COMPLETION_CONTINUITY", "verification.md", "A role completion report establishes overall completion."),
            ("AUTHORIZATION_REUSE", "handoff.md", "Authorization reuse waives actual state verification."),
        )
        for platform in PLATFORMS:
            for contract, owner, override in cases:
                path = f"{platform}/skill/references/{owner}"
                with self.subTest(platform=platform, contract=contract):
                    failures = self.contract_failures_at(contract, path, self.texts[path] + "\n" + override)
                    self.assertTrue(any(": conflicting " in failure for failure in failures))

    def test_common_contracts_have_platform_owners(self) -> None:
        self.assertEqual(policy_contract_failures(self.texts), [])

    def contract_failures_at(self, contract: str, path: str, text: str) -> list[str]:
        return [failure for failure in policy_contract_failures({**self.texts, path: text})
                if failure.startswith(f"{contract}: {path}:")]

    def test_document_order_accepts_choice_before_writing(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/planning.md"
            with self.subTest(path=path):
                self.assertEqual(self.contract_failures_at("DOCUMENT_ORDER", path, self.texts[path]), [])

    def test_document_order_rejects_documents_before_target_choice(self) -> None:
        reverse = ("Normal order: initial design approval → formal spec drafting → written-spec approval → "
                   "formal plan drafting → individual plan approvals → complete applicable set → "
                   "execution-target choice → target preparation and verification → existing-commit verification "
                   "and one batch docs commit → final Git verification → Implementer handoff.")
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/planning.md"
            fixture = re.sub(r"Normal order:.*?Implementer handoff\.", reverse, self.texts[path], flags=re.S)
            with self.subTest(path=path):
                self.assertTrue(self.contract_failures_at("DOCUMENT_ORDER", path, fixture))

    def test_document_order_rejects_missing_required_gates(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/planning.md"
            text = " ".join(self.texts[path].split())
            match = re.search(r"Normal order:.*?Implementer handoff\.", text)
            self.assertIsNotNone(match, f"{path}: missing Normal order gates")
            order = match.group()
            for gate in ("target preparation and verification", "written-spec approval",
                         "individual plan approvals", "complete applicable set",
                         "existing-commit verification and one batch docs commit of remaining approved documents",
                         "final Git verification", "Implementer handoff"):
                with self.subTest(path=path, gate=gate):
                    self.assertIn(gate, order)
                    fixture = text.replace(order, order.replace(gate, "omitted"))
                    self.assertTrue(self.contract_failures_at("DOCUMENT_ORDER", path, fixture))

    def test_document_order_rejects_conflicting_reverse_order(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/planning.md"
            fixture = self.texts[path] + "\nFormal spec and plan drafting must precede execution-target choice."
            with self.subTest(path=path):
                self.assertTrue(self.contract_failures_at("DOCUMENT_ORDER", path, fixture))

    def test_planner_authorship_contract(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/planning.md"
            with self.subTest(path=path):
                self.assertIn("AUTHORING_EXCLUSIVITY", POLICY_CONTRACTS)
                self.assertEqual(self.contract_failures_at("AUTHORING_EXCLUSIVITY", path, self.texts[path]), [])

    def test_planner_authorship_rejects_conflicting_user_override(self) -> None:
        for platform, override in (
            ("codex", "A user may explicitly change the writing responsibility"),
            ("claude", "A user may explicitly change writing responsibility"),
        ):
            path = f"{platform}/skill/references/planning.md"
            with self.subTest(path=path):
                self.assertTrue(self.contract_failures_at("AUTHORING_EXCLUSIVITY", path,
                                                        self.texts[path] + "\n" + override))

    def test_planner_authorship_allows_user_preferences(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/planning.md"
            fixture = self.texts[path] + "\nA user may explicitly change language, output path, and task scope."
            with self.subTest(path=path):
                self.assertIn("AUTHORING_EXCLUSIVITY", POLICY_CONTRACTS)
                self.assertEqual(self.contract_failures_at("AUTHORING_EXCLUSIVITY", path, fixture), [])

    def test_handoff_and_role_local_guards_remain_accessible(self) -> None:
        self.assert_contracts("HANDOFF_GATE", "ROLE_LOCAL")

    def test_readiness_requires_acceptance_and_verified_result(self) -> None:
        self.assert_contracts("READINESS")

    def test_commit_contract_distinguishes_plan_skip_and_no_change(self) -> None:
        self.assert_contracts("COMMIT_BOUNDARY")

    def test_commit_requires_next_action_after_acceptance(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/commit.md"
            with self.subTest(path=path):
                self.assertEqual(self.contract_failures_at("COMMIT_NEXT_ACTION", path, self.texts[path]), [])

    def test_commit_checker_rejects_deferred_or_preacceptance_commit(self) -> None:
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/commit.md"
            for conflict in ("The task may be committed before Orchestrator acceptance.",
                             "The task commit may wait until the plan ends."):
                with self.subTest(path=path, conflict=conflict):
                    self.assertTrue(self.contract_failures_at("COMMIT_NEXT_ACTION", path,
                                                            self.texts[path] + "\n" + conflict))

    def test_commit_authority_is_orchestrator_only(self) -> None:
        for path, _ in POLICY_CONTRACTS["COMMIT_AUTHORITY"].values():
            with self.subTest(path=path):
                self.assertEqual(self.contract_failures_at("COMMIT_AUTHORITY", path, self.texts[path]), [])

    def test_commit_authority_rejects_delegated_implementer_exception(self) -> None:
        for path, _ in POLICY_CONTRACTS["COMMIT_AUTHORITY"].values():
            with self.subTest(path=path):
                self.assertTrue(self.contract_failures_at(
                    "COMMIT_AUTHORITY", path,
                    self.texts[path] + "\nImplementer may commit when Orchestrator explicitly assigns that action."))
        for path, legacy in (
            ("claude/skill/references/commit.md",
             "A role may commit only when Orchestrator explicitly assigns that action; Orchestrator retains acceptance authority."),
            ("claude/agents/arc-implementer.md",
             "Do not stage, commit, push, or merge unless Orchestrator explicitly assigns that action."),
        ):
            with self.subTest(path=path, legacy=True):
                failures = self.contract_failures_at("COMMIT_AUTHORITY", path, self.texts[path] + "\n" + legacy)
                self.assertTrue(any(": conflicting " in failure for failure in failures))

    def test_commit_checker_preserves_hold_and_reuse_contracts(self) -> None:
        self.assert_contracts("COMMIT_NEXT_ACTION", "COMMIT_AUTHORITY", "COMMIT_BOUNDARY")
        for platform in PLATFORMS:
            path = f"{platform}/skill/references/commit.md"
            for required in (
                "Hold commits for unmet/unresolved criteria, failed/not-run required checks, "
                "undispositioned findings/gaps, scope expansion/revised-plan needs, "
                "ownership/staged scope/content mismatch, unexpected workspace/branch/HEAD/Git "
                "state or failure/partial completion.",
                "unexpected workspace/branch/HEAD/Git state or failure/partial completion. "
                "Record reason/next action; NEVER waive criteria/checks to commit.",
            ):
                with self.subTest(path=path, guard=required):
                    self.assertIn(required, self.texts[path])

    def test_native_adapters_remain_explicit(self) -> None:
        self.assert_contracts("NATIVE_ADAPTERS")

    def test_commit_guidance_uses_installed_language_marker(self) -> None:
        for platform in PLATFORMS:
            with self.subTest(platform=platform):
                commit = self.texts[f"{platform}/skill/references/commit.md"]
                prep = self.texts[f"{platform}/skill/references/handoff-prep.md"]
                self.assertEqual(commit.count("{{ARC_COMMIT_LANGUAGE_POLICY}}"), 1)
                for text in (commit, prep):
                    self.assertNotRegex(text.lower(), r"(?:english|korean)\s+(?:description|conventional commit)")
                self.assertIn("commit.md#automatic-commit-after-plan-task-acceptance", prep)

    def test_policy_contract_checker_rejects_missing_guards(self) -> None:
        for contract, owners in POLICY_CONTRACTS.items():
            for platform, (path, _) in owners.items():
                changed = dict(self.texts)
                del changed[path]
                with self.subTest(contract=contract, path=path):
                    self.assertIn(f"{contract}: {path}: missing owner", policy_contract_failures(changed))
        for platform in PLATFORMS:
            for contract, owner, old, new in (
                ("READINESS", "planning.md", "Orchestrator acceptance", "Implementer completion"),
                ("COMMIT_BOUNDARY", "commit.md", "no empty commit", "an empty commit"),
            ):
                path = f"{platform}/skill/references/{owner}"
                fixture = " ".join(self.texts[path].split())
                self.assertIn(old, fixture)
                changed = {**self.texts, path: fixture.replace(old, new)}
                with self.subTest(contract=contract, path=path, mutation=old):
                    self.assertTrue(any(failure.startswith(f"{contract}: {path}:") for failure in policy_contract_failures(changed)))
            path = f"{platform}/skill/references/verification.md"
            fixture = normalize_contract(self.texts[path])
            with self.subTest(contract="EVIDENCE_LIMITS", path=path, mutation=EVIDENCE_VERDICTS):
                self.assertRegex(fixture, EVIDENCE_VERDICTS)
                changed = {**self.texts, path: re.sub(EVIDENCE_VERDICTS, "passed", fixture)}
                self.assertIn(
                    f"EVIDENCE_LIMITS: {path}: missing {EVIDENCE_VERDICTS}", policy_contract_failures(changed)
                )

    def test_policy_contract_checker_rejects_adapter_conflation(self) -> None:
        prep = self.texts["claude/skill/references/handoff-prep.md"]
        self.assertNotIn("ARC-managed worktree execution is unsupported", prep)
        self.assertNotIn("current checkout only", prep)
        for option in ("current checkout", "new task branch", "new managed worktree and task branch", ".claude/worktrees/<name>"):
            self.assertIn(option, prep)
        for path, old, new in (
            ("claude/skill/references/handoff.md",
             "Selected worktrees require common directory, registration", "Selected worktrees require common directory"),
            ("claude/skill/references/coordination.md", "arc-implementer", "arc_implementer"),
        ):
            changed_text = self.texts[path].replace(old, new)
            self.assertNotEqual(changed_text, self.texts[path])
            failures = policy_contract_failures({**self.texts, path: changed_text})
            self.assertTrue(any(failure.startswith(f"NATIVE_ADAPTERS: {path}:") for failure in failures))


class DocumentationContractTests(unittest.TestCase):
    """Approved artifact contracts; source review and rendering remain necessary."""

    def test_maintained_local_links_resolve(self) -> None:
        paths = []
        paths.extend((REPO / "shared/skill/references").glob("*.md"))
        for platform in PLATFORMS:
            paths.append(REPO / platform / "skill/SKILL.md")
            paths.extend((REPO / platform / "skill/references").glob("*.md"))
        self.assertTrue(paths)
        from urllib.parse import unquote
        for path in paths:
            for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", path.read_text()):
                if re.match(r"[a-z]+:", target):
                    continue
                filename, _, anchor = unquote(target).partition("#")
                resolved = path.parent / filename if filename else path
                resolutions = [resolved]
                for owner in (*PLATFORMS, "shared"):
                    skill_root = REPO / owner / "skill"
                    if not path.is_relative_to(skill_root):
                        continue
                    if resolved.resolve().is_relative_to(skill_root):
                        relative = resolved.resolve().relative_to(skill_root)
                        platforms = PLATFORMS if owner == "shared" else (owner,)
                        resolutions = []
                        for platform in platforms:
                            candidates = (REPO / platform / "skill" / relative,
                                          REPO / "shared/skill" / relative)
                            resolutions.append(next((candidate for candidate in candidates if candidate.exists()), candidates[0]))
                    break
                for resolved in resolutions:
                    with self.subTest(source=str(path.relative_to(REPO)), target=target):
                        self.assertTrue(resolved.exists(), f"Missing local link: {target}")
                        if anchor and resolved.suffix == ".md":
                            markdown = resolved.read_text()
                            headings = re.findall(r"^#{1,6} (.+)$", markdown, re.M)
                            anchors = {re.sub(r"[^\w -]", "", h.lower()).replace(" ", "-") for h in headings}
                            anchors.update(re.findall(r'<a\s+id="([^"]+)"\s*>', markdown))
                            self.assertIn(anchor, anchors)

    def test_stale_png_is_unreferenced(self) -> None:
        paths = []
        paths.extend((REPO / "shared/skill/references").glob("*.md"))
        for platform in PLATFORMS:
            paths.extend((REPO / platform / "skill").rglob("*.md"))
            paths.extend((REPO / platform / "agents").iterdir())
        for path in paths:
            if path.is_file():
                with self.subTest(path=str(path.relative_to(REPO))):
                    self.assertNotIn("role-flow.png", path.read_text())


class HarnessReliabilityDeliveryTests(unittest.TestCase):
    """H1-H5 structural evidence only; live observation remains separate."""
    def test_handoff_preserves_provenance_visual_and_resume_fields(self):
        for platform in PLATFORMS:
            text = (REPO / platform / "skill/references/handoff.md").read_text()
            with self.subTest(platform=platform):
                for pattern in (
                    r"Distinguish user instructions, discovered workspace instructions, installed references and inputs by source/applicability/version or approval/access\.",
                    r"root AGENTS\.md.*absence.*not.*absence of instructions",
                    r"exact locator.*approved version.*purpose.*method.*preconditions.*evidence.*return conditions",
                    r"approved visual source.*version.*approval.*access",
                    r"criterion IDs.*properties.*comparison method",
                    r"actual.output identity.*revision.*basis",
                    r"resume brief.*completed work.*failure.*resolution.*valid.*invalid.*evidence.*next objective",
                ):
                    self.assertRegex(" ".join(text.split()), pattern)

    def test_verification_and_visual_companion_keep_visual_gaps_visible(self):
        for platform in PLATFORMS:
            for reference in ("verification", "visual-companion"):
                reference_path = (REPO / "shared/skill/references/visual-companion.md"
                                  if reference == "visual-companion"
                                  else REPO / platform / f"skill/references/{reference}.md")
                text = reference_path.read_text()
                with self.subTest(platform=platform, reference=reference):
                    for pattern in (r"pass.*mismatch.*unverified", r"fresh Tester.*actual comparison",
                                    r"revision.*unverified.*visible.*mismatch"):
                        self.assertRegex(" ".join(text.split()), pattern)

    def test_failure_disposition_orders_evidence_classification_holds_and_release(self):
        # H1-04/H4-02: approved written-contract coverage, not agent runtime proof.
        import json
        policy = json.loads((REPO / "lib/policy/role-policy.json").read_text())
        common = next(rule["text"] for rule in policy["rules"] if rule["id"] == "scope.non-escalation")
        sequence = (
            r"First, record the exact failed check.*?baseline revision.*?current revision",
            r"Second, classify each failure.*?baseline or current.*?affected scope.*?dependency",
            r"Third, hold only affected or dependent tasks and checks.*?unknown.*?only work whose impact is unknown",
            r"Fourth, Orchestrator MUST release already-approved independent work without waiting for unrelated failures",
            r"Finally, keep acceptance held while any required check remains unresolved",
        )
        sources = {"canonical": common}
        for platform, extension in (("codex", "toml"), ("claude", "md")):
            sources[f"{platform}/core"] = (REPO / platform / "skill/SKILL.md").read_text()
            for role in ("scouter", "planner", "implementer", "tester", "reviewer"):
                sources[f"{platform}/{role}"] = (REPO / platform / "agents" / f"arc-{role}.{extension}").read_text()
        for name, text in sources.items():
            with self.subTest(source=name):
                remaining = " ".join(text.split())
                for step in sequence:
                    match = re.search(step, remaining)
                    self.assertIsNotNone(match, f"Missing or out-of-order disposition step: {step}")
                    remaining = remaining[match.end():]
                self.assertRegex(text, r"Specialists report evidence.*MUST NOT self-authorize release")


class EnvelopeRefreshTests(unittest.TestCase):
    def test_envelope_fingerprint_distinguishes_source_access_states(self):
        for platform in PLATFORMS:
            text = (REPO / platform / 'skill/references/handoff.md').read_text()
            section = text.split('### Instruction fingerprint', 1)[1].split('### Task envelope', 1)[0]
            with self.subTest(platform=platform):
                self.assertRegex(section, r'available.*absent.*inaccessible.*conflicting.*unverified')
                self.assertRegex(section, r'user-provided.*workspace.*installed.*task inputs')

if __name__ == "__main__":
    unittest.main()
