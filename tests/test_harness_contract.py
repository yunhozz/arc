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
    "OWNERSHIP": ("SKILL.md", (
        r"drafts are authored only by planner",
        r"qa: verifies without edits",
        r"reviewer: independently reviews the final full change",
        r"depth-2 roles cannot create agents or delegate",
        r"orchestrator.*acceptance.*completion",
    )),
    "DOCUMENT_ORDER": ("references/planning.md", (
        r"written-spec approval.*before.*(?:implementation planning|dependent plan)",
        r"complete.*(?:set|documents).*explicit execution-target choice.*batch commit.*final git verification.*coder handoff",
        r"bounded.*spec only when|bounded written spec.*required by orchestrator",
    )),
    "HANDOFF_GATE": ("references/handoff.md", (
        r"before.*first start.*restart",
        r"explicit.*(?:execution-target|target) choice",
        r"branch or detached head.*head.*staged/unstaged/untracked",
        r"approved.*document|document approvals",
        r"canonical.*record",
        r"unchanged.*record file.*fresh coder reads",
        r"inaccessible.*(?:record|link).*evidence|inaccessible.*record.*block",
    )),
    "READINESS": ("references/planning.md", (
        r"a task is ready only when.*approvals.*preparation.*inputs/contracts.*predecessors.*required evidence.*orchestrator acceptance.*verified focused commits.*accepted no-change",
        r"ownership/resources do not conflict.*check/qa path.*slot.*runtime limit",
        r"completion reports alone do not release dependents",
        r"same-file concurrent coder edits.*(?:blocked|forbidden)",
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
        r"stop.*(?:dependent work|coder handoff)",
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

NATIVE_ADAPTERS = {
    "codex": (
        r"scouter=`arc_scouter`.*planner=`arc_planner`.*coder=`arc_coder`",
        r"spawn_agent.*agent_type",
        r"wait_agent",
        r"selected worktree.*common directory.*registration.*source preservation",
        r"model_reasoning_effort",
        r"max_concurrent_threads_per_session.*integer",
        r"prompt-level guards, not sandbox enforcement",
    ),
    "claude": (
        r"scouter=`arc-scouter`.*planner=`arc-planner`.*coder=`arc-coder`",
        r"foreground agent call.*background.*completion notification",
        r"arc-managed worktree execution is unsupported",
        r"`effort`",
        r"claude_code_max_concurrent_subagents.*string",
        r"(?:not a filesystem sandbox|not sandbox enforcement)",
    ),
}

# This test-only table names all nine contracts and each platform's owner.
POLICY_CONTRACTS = {
    contract: {
        platform: (f"{platform}/skill/{owner}", patterns)
        for platform in PLATFORMS
    }
    for contract, (owner, patterns) in COMMON_CONTRACTS.items()
}
POLICY_CONTRACTS["ROLE_LOCAL"] = {
    platform: (f"{platform}/agents/arc-coder.{'toml' if platform == 'codex' else 'md'}", ROLE_LOCAL)
    for platform in PLATFORMS
}
POLICY_CONTRACTS["NATIVE_ADAPTERS"] = {
    platform: (f"{platform}/skill/SKILL.md", NATIVE_ADAPTERS[platform])
    for platform in PLATFORMS
}


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
    for platform in PLATFORMS:
        root = f"{platform}/skill"
        require("HANDOFF_GATE", f"{root}/SKILL.md", (
            r"before every coder first start/restart.*handoff",
            r"missing evidence.*block handoff",
            r"references/handoff.md",
            r"same conditions.*before a orchestrator direct edit",
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

    def test_common_contracts_have_platform_owners(self) -> None:
        self.assertEqual(policy_contract_failures(self.texts), [])

    def test_handoff_and_role_local_guards_remain_accessible(self) -> None:
        self.assert_contracts("HANDOFF_GATE", "ROLE_LOCAL")

    def test_readiness_requires_acceptance_and_verified_result(self) -> None:
        self.assert_contracts("READINESS")

    def test_commit_contract_distinguishes_plan_skip_and_no_change(self) -> None:
        self.assert_contracts("COMMIT_BOUNDARY")

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
                ("READINESS", "planning.md", "Orchestrator acceptance", "Coder completion"),
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
        path = "claude/skill/SKILL.md"
        for changed_text in (
            self.texts[path].replace("ARC-managed worktree execution is unsupported", "ARC-managed worktree execution is supported"),
            self.texts[path].replace("arc-coder", "arc_coder"),
        ):
            failures = policy_contract_failures({**self.texts, path: changed_text})
            self.assertTrue(any(failure.startswith(f"NATIVE_ADAPTERS: {path}:") for failure in failures))


if __name__ == "__main__":
    unittest.main()
