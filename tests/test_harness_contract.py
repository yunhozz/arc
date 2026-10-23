"""Approved structural policy checks; these do not prove live agent compliance."""

from collections.abc import Mapping
from pathlib import Path
import re
import unittest


REPO = Path(__file__).resolve().parents[1]
PLATFORMS = ("codex", "claude")

# Each contract is evaluated at its owner independently for each platform.
# Missing gates, acceptance boundaries, and adapter conflation are the breaks
# these checks catch; wording outside these obligations is free to change.
COMMON_CONTRACTS = {
    # Approved written-contract checks: losing these gates must fail both adapters.
    "PLAN_UPDATE_CLASSIFICATION": ("references/planning.md", (
        r"mechanical execution records.*without new user approval",
        r"checkbox.*actual results.*evidence links.*completion state",
        r"required checks.*removal.*not mechanical",
        r"goals.*task scope.*boundaries.*acceptance criteria.*method.*risk.*dependencies.*required verification.*revised.*approval",
        r"both.*mechanical.*approved.*original planning-document commit",
        r"no separate.*document.*or fixup commit",
        r"actual approval.*(?:time|chronology).*not.*retroactive",
        r"before and after.*content hashes.*versions.*approval references.*times",
        r"recoverable.*contents.*old.*new.*sha.*descendant",
    )),
    "PLAN_AMEND_SAFETY": ("references/handoff-prep.md", (
        r"original.*ancestor.*head",
        r"unpublished.*unshared.*local.*linear.*no merge",
        r"unknown.*publication.*ownership.*conflict.*stop",
        r"no.*force.push.*fallback.*document commit",
        r"head.*amend.*plan paths only",
        r"descendant.*reapply.*order.*task boundaries",
    )),
    "PLAN_AMEND_EVIDENCE": ("references/verification.md", (
        r"rewrite.*new head.*approved.*plan.*sha mapping",
        r"descendant.*content.*task boundaries.*remaining.*state",
        r"sha change alone.*not.*invalidate",
        r"cannot.*link.*affected.*repeat.*checks",
    )),
    "PLANNER_COMPLETE_BRIEF": ("references/planning.md", (
        r"original user requirements.*criteria ids.*approved decisions.*open decisions",
        r"current behavior.*source.*generated.*runtime.*installer.*documentation",
        r"exact.*current.stage.*deliverable",
        r"consolidated.*changed fields.*unchanged",
        r"no fixed call cap",
    )),
    "SCOPED_AUTHORIZATION": ("references/planning.md", (
        r"explicit execution request.*authorization.*sufficiently specified scope",
        r"execution intent.*expected outcome.*constraints.*document depth.*verification risk",
        r"no unresolved material.*(?:behavior|method|risk).*decision",
        r"record.*authorization evidence.*scope.*acceptance criteria.*constraints.*depth",
    )),
    "AUTHORIZATION_HOLDS": ("references/planning.md", (
        r"silence.*ambiguous assent.*other work.*not authorization",
        r"planner.*new material choices.*not.*approved",
        r"material.*scope.*method.*risk.*hold affected work",
    )),
    "COMPLETION_CONTINUITY": ("references/verification.md", (
        r"approved scope.*continue.*execution.*correction.*reverification.*qa.*reviewer.*orchestrator acceptance.*report",
        r"role completion report.*probe findings.*passing commands.*not.*overall completion",
        r"remaining approved execution.*not.*optional.*user response",
    )),
    "PROBE_SCOPE": ("references/planning.md", (
        r"probe-only.*findings.*evidence.*limits.*uncertainty",
        r"probe-only authorization does not authorize.*implementation",
        r"explicitly requests both.*probe.*implementation.*sufficiently specified",
        r"entire scope.*bounded.*internal investigation.*no new approval boundary",
        r"unknown implementation.*not.*blanket authorization",
    )),
    "AUTHORIZATION_REUSE": ("references/handoff.md", (
        r"reuse.*valid authorization.*same approved scope.*target",
        r"restart.*new role assignment.*not.*repeat approval",
        r"reuse.*never waives.*actual.*workspace.*branch.*head.*changes.*ownership",
    )),
    "OWNERSHIP": ("references/coordination.md", (
        r"qa: verifies without edits",
        r"reviewer: independently reviews the final full change",
        r"depth-2 roles cannot create agents or delegate",
        r"orchestrator.*acceptance.*completion",
    )),
    "DOCUMENT_ORDER": ("references/planning.md", (
        r"written-spec approval.*before.*(?:implementation planning|dependent plan)",
        r"bounded.*spec only when|bounded written spec.*required by orchestrator",
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
        r"unchanged.*record file.*fresh implementer reads",
        r"inaccessible.*(?:record|link).*evidence|inaccessible.*record.*block",
    )),
    "READINESS": ("references/planning.md", (
        r"a task is ready only when.*approvals.*preparation.*inputs/contracts.*predecessors.*required evidence.*orchestrator acceptance.*verified focused commits.*accepted no-change",
        r"ownership/resources do not conflict.*check/qa path.*slot.*runtime limit",
        r"completion reports alone do not release dependents",
        r"same-file concurrent implementer edits.*(?:blocked|forbidden)",
    )),
    "COMMIT_NEXT_ACTION": ("references/commit.md", (
        r"after orchestrator accepts a task, the next action is the required git state/scope checks, staging, and focused commit",
    )),
    "COMMIT_AUTHORITY": ("references/commit.md", (
        r"only orchestrator accepts the task and executes its focused commit",
    )),
    "COMMIT_BOUNDARY": ("references/commit.md", (
        r"(?:one approved top-level task.*one focused implementation commit|commit one logical task promptly)",
        r"without additional user commit approval",
        r"plan-skip paths.*no new.*(?:commit|plan) obligation",
        r"no-change task.*no empty commit",
        r"resume.*verify.*existing commit sha.*content.*validity.*reuse",
        r"task acceptance(?:/commit)?.*distinct from final plan acceptance",
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
        r"(?:do not prove.*runtime|text presence alone cannot establish agent compliance)",
        r"proven, unmet, or unverified",
    )),
}

ROLE_LOCAL = (
    r"report directly to orchestrator at depth 2",
    r"do not spawn agents",
    r"trust.*orchestrator.verified.*branch.*head.*approvals",
    r"(?:actual.*conflict|conflict.*actually hit)",
    r"preserve unrelated staged, unstaged, and untracked changes and edit ownership",
    r"(?:never|do not) create or switch.*(?:workspaces or branches|branches or workspaces)",
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
    "claude": (r"arc-managed worktree execution is unsupported",),
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

POLICY_CONTRACTS["COMMIT_AUTHORITY"]["claude-implementer"] = (
    "claude/agents/arc-implementer.md", (r"implementer must not commit, even when explicitly assigned",)
)


def policy_contract_failures(texts: Mapping[str, str]) -> list[str]:
    """Return contract IDs and owner paths for supplied text, without file I/O."""
    failures = []

    def require(contract: str, path: str, patterns: tuple[str, ...]) -> None:
        if path not in texts:
            failures.append(f"{contract}: {path}: missing owner")
            return
        text = " ".join(texts[path].lower().replace("**", "").split())
        for pattern in patterns:
            if not re.search(pattern, text):
                failures.append(f"{contract}: {path}: missing {pattern}")

    for contract, owners in POLICY_CONTRACTS.items():
        for path, patterns in owners.values():
            require(contract, path, patterns)
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
        order = re.search(r"normal order:(.*?)(?:\.(?: |$)|$)", text)
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
            r"before every implementer first start/restart.*handoff",
            r"missing evidence.*block handoff",
            r"same conditions.*before an orchestrator direct edit",
        ))
        for owner in ("references/commit.md", "references/handoff-prep.md"):
            require("COMMIT_BOUNDARY", f"{root}/{owner}", (r"(?:specific |concise |specific, |concise, )*english (?:description|conventional commit)",))
    return failures


def policy_texts() -> dict[str, str]:
    paths = {path for owners in POLICY_CONTRACTS.values() for path, _ in owners.values()}
    for platform in PLATFORMS:
        paths.add(f"{platform}/skill/references/handoff-prep.md")
    return {path: (REPO / path).read_text() for path in sorted(paths)}


class PolicyContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.texts = policy_texts()

    def assert_contracts(self, *contracts: str) -> None:
        failures = policy_contract_failures(self.texts)
        self.assertEqual([failure for failure in failures if failure.split(":", 1)[0] in contracts], [])

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
                         "PROBE_SCOPE", "AUTHORIZATION_REUSE", "ROLE_LOCAL", "NATIVE_ADAPTERS"):
            for path, patterns in POLICY_CONTRACTS[contract].values():
                fixture = " ".join(self.texts[path].lower().replace("**", "").split())
                for pattern in patterns:
                    match = re.search(pattern, fixture)
                    with self.subTest(contract=contract, path=path, pattern=pattern):
                        self.assertIsNotNone(match, "The original required contract must exist")
                        changed = re.sub(pattern, " [removed obligation] ", fixture)
                        self.assertTrue(self.contract_failures_at(contract, path, changed))

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
            order = re.search(r"Normal order:.*?Implementer handoff\.", text).group()
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

    def test_commit_authority_rejects_delegated_coder_exception(self) -> None:
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
            for required in ("Hold the task commit", "Git failure/partial completion"):
                with self.subTest(path=path, guard=required):
                    self.assertIn(required, self.texts[path])

    def test_native_adapters_remain_explicit(self) -> None:
        self.assert_contracts("NATIVE_ADAPTERS")

    def test_commit_guidance_uses_english_descriptions(self) -> None:
        for platform in PLATFORMS:
            for owner in ("commit.md", "handoff-prep.md"):
                path = f"{platform}/skill/references/{owner}"
                with self.subTest(path=path):
                    self.assertRegex(" ".join(self.texts[path].lower().split()), r"english (?:description|conventional commit)")
                    self.assertNotRegex(self.texts[path].lower(), r"korean\s+(?:description|conventional commit)")

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
                ("EVIDENCE_LIMITS", "verification.md", "proven, unmet, or unverified", "passed"),
            ):
                path = f"{platform}/skill/references/{owner}"
                fixture = " ".join(self.texts[path].split())
                self.assertIn(old, fixture)
                changed = {**self.texts, path: fixture.replace(old, new)}
                with self.subTest(contract=contract, path=path, mutation=old):
                    self.assertTrue(any(failure.startswith(f"{contract}: {path}:") for failure in policy_contract_failures(changed)))

    def test_policy_contract_checker_rejects_adapter_conflation(self) -> None:
        for path, old, new in (
            ("claude/skill/references/handoff.md",
             "ARC-managed worktree execution is unsupported", "ARC-managed worktree execution is supported"),
            ("claude/skill/references/coordination.md", "arc-implementer", "arc_implementer"),
        ):
            changed_text = self.texts[path].replace(old, new)
            self.assertNotEqual(changed_text, self.texts[path])
            failures = policy_contract_failures({**self.texts, path: changed_text})
            self.assertTrue(any(failure.startswith(f"NATIVE_ADAPTERS: {path}:") for failure in failures))


class DocumentationContractTests(unittest.TestCase):
    """Approved artifact contracts; source review and rendering remain necessary."""

    def guide(self) -> str:
        path = REPO / "docs/harness-operation.md"
        self.assertTrue(path.is_file(), "The operation guide must exist")
        return path.read_text()

    def svg(self) -> str:
        return (REPO / "docs/images/role-flow.svg").read_text()

    def test_operation_guide_covers_required_sections(self) -> None:
        guide = self.guide()
        for heading in (
            "What ARC installs", "Installation and refresh lifecycle",
            "Request routing and role responsibilities", "Design and preparation",
            "Scheduling and limits", "Verification, acceptance, and commits",
            "Failure, resume, and maintenance", "Source map",
        ):
            with self.subTest(heading=heading):
                self.assertIn("## " + heading, guide)

    def test_operation_guide_distinguishes_transaction_scopes(self) -> None:
        guide = " ".join(self.guide().lower().split())
        for pattern in (
            r"manual package reference refresh.*both.*trees.*restore",
            r"--target all.*independent.*earlier success",
            r"residual path", r"scripts and hooks.*not executed",
            r"provenance.*consistency.*not authenticate",
        ):
            self.assertRegex(guide, pattern)

    def test_operation_guide_distinguishes_policy_from_runtime(self) -> None:
        guide = " ".join(self.guide().lower().split())
        for pattern in (r"prompt-level policy", r"native.*concurrency", r"structural.*do not prove.*runtime", r"new session"):
            self.assertRegex(guide, pattern)

    def test_guide_covers_authorization_completion_and_correction_boundaries(self) -> None:
        guide = self.guide()
        for contract in (
            "probe-only", "probe+implementation", "같은 범위", "중대한 범위·방법·위험 변경",
            "문서 생략 경로", "Implementer → Reviewer",
            "QA를 재배정하지 않습니다", "최종 QA findings", "한국어 구절",
            "파일별 책임 점검 범위", "29개", "미검증",
        ):
            with self.subTest(contract=contract):
                self.assertIn(contract, guide)
        self.assertRegex(guide, r"Implementer\s+수정\s*→\s*QA\s+재검증")
        self.assertRegex(guide, r"Plan omission requires.*no dependent stages, no cross-component shared state, lifecycle, or integration-order concerns")

    def test_maintained_local_links_resolve(self) -> None:
        paths = [REPO / "README.md", REPO / "docs/harness-operation.md"]
        for platform in PLATFORMS:
            paths.append(REPO / platform / "skill/SKILL.md")
            paths.extend((REPO / platform / "skill/references").glob("*.md"))
        self.assertTrue(paths[1].exists(), "Guide links must be checked")
        from urllib.parse import unquote
        for path in paths:
            for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", path.read_text()):
                if re.match(r"[a-z]+:", target):
                    continue
                filename, _, anchor = unquote(target).partition("#")
                resolved = path.parent / filename if filename else path
                with self.subTest(source=str(path.relative_to(REPO)), target=target):
                    self.assertTrue(resolved.exists(), f"Missing local link: {target}")
                    if anchor and resolved.suffix == ".md":
                        headings = re.findall(r"^#{1,6} (.+)$", resolved.read_text(), re.M)
                        anchors = {re.sub(r"[^\w -]", "", h.lower()).replace(" ", "-") for h in headings}
                        self.assertIn(anchor, anchors)

    def test_svg_contains_required_english_flow_labels(self) -> None:
        import xml.etree.ElementTree as ET
        root = ET.fromstring(self.svg())
        ns = {"s": "http://www.w3.org/2000/svg"}
        self.assertEqual(root.attrib.get("role"), "img")
        # ImageIO must receive visible geometry, not unsupported marker styling.
        connectors = root.findall("s:g[@class='connector']", ns)
        self.assertEqual(len(connectors), 10)
        for connector in connectors:
            self.assertIsNotNone(connector.find("s:path", ns))
            arrowhead = connector.find("s:polygon", ns)
            self.assertIsNotNone(arrowhead, "Each connector needs an explicit arrowhead")
            self.assertEqual(arrowhead.attrib.get("fill"), "#526675")
        for name in ("title", "desc"):
            self.assertTrue(root.find("s:" + name, ns).text.strip())
        text = " ".join(root.itertext())
        for label in (
            "Design depth and verification risk are separate",
            "Approved documents → platform preparation → handoff",
            "Ready independent tasks", "Required checks → Orchestrator acceptance",
            "Plan task: focused commit; no change: record only",
            "Failure: hold affected work, inspect, resolve, revalidate",
            "Codex: managed worktree option. Claude v1: current checkout.",
        ):
            self.assertIn(label, text)

    def test_svg_and_guide_preserve_acceptance_commit_review_distinctions(self) -> None:
        for name, text in (("guide", self.guide()), ("svg", self.svg())):
            text = " ".join(text.lower().split())
            with self.subTest(artifact=name):
                self.assertRegex(text, r"no.change.*record")
                self.assertRegex(text, r"significant planned.*final.*review")
                self.assertRegex(text, r"significant unplanned.*before acceptance")

    def test_readme_uses_maintained_svg_and_links_operation_guide(self) -> None:
        readme = (REPO / "README.md").read_text()
        self.assertRegex(readme, r"!\[[^\]]+\]\(docs/images/role-flow\.svg\)")
        self.assertRegex(readme, r"\[[^\]]+\]\(docs/harness-operation\.md\)")

    def test_stale_png_is_absent_and_unreferenced(self) -> None:
        self.assertFalse((REPO / "docs/images/role-flow.png").exists())
        paths = [REPO / "README.md", REPO / "docs/harness-operation.md"]
        for platform in PLATFORMS:
            paths.extend((REPO / platform / "skill").rglob("*.md"))
            paths.extend((REPO / platform / "agents").iterdir())
        for path in paths:
            if path.is_file():
                with self.subTest(path=str(path.relative_to(REPO))):
                    self.assertNotIn("role-flow.png", path.read_text())

    def test_svg_uses_english_wording(self) -> None:
        self.assertNotRegex(self.svg(), r"[\uac00-\ud7a3]")


if __name__ == "__main__":
    unittest.main()
