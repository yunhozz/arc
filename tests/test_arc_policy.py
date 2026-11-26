from __future__ import annotations
import hashlib, json, os, re, shutil, signal, subprocess, stat, sys, tempfile, tomllib, unittest
from pathlib import Path
from unittest.mock import patch
REPO = Path(__file__).resolve().parents[1]
TMP_ROOT = os.path.realpath(tempfile.gettempdir())
REFERENCE_NAMES = ("planning", "handoff", "handoff-prep", "handoff-worktree", "verification", "git-recovery",
                   "arc-visual-companion", "commit")
HANDOFF_FILES = ("handoff", "handoff-prep", "handoff-worktree", "worktree-creation")
W2_RULE_PINS = {
    rule["id"]: rule["text"] for rule in json.loads(
        (REPO / "tests/node/fixtures/rule-pins.json").read_text(encoding="utf-8")
    )["rules"]
}


def _document_parts(platform: str, name: str) -> tuple[str, ...]:
    skill = REPO / platform / "skill"
    if name == "core":
        return ((skill / "SKILL.md").read_text(encoding="utf-8"),)
    local = (skill / "references" / f"{name}.md").read_text(encoding="utf-8")
    common = REPO / "shared/skill/references" / f"{name}-common.md"
    if common.exists():
        return local, common.read_text(encoding="utf-8")
    return (local,)


def _effective(platform: str, name: str) -> str:
    return "\n".join(_document_parts(platform, name))


def _effective_section(platform: str, name: str, heading: str) -> str:
    def sections(text: str) -> list[str]:
        level = len(heading.split()[0])
        boundary = re.compile(rf"^#{{1,{level}}}[ \t]+")
        matches = []
        lines = text.splitlines()
        for start, line in enumerate(lines):
            if line != heading:
                continue
            end = start + 1
            while end < len(lines) and not boundary.match(lines[end]):
                end += 1
            matches.append("\n".join(lines[start:end]))
        return matches

    local, *shared = _document_parts(platform, name)
    local_sections = sections(local)
    if not local_sections:
        raise ValueError(f"Missing heading in {platform}/{name}: {heading}")
    return "\n".join([local_sections[0], *sections(shared[0] if shared else "")])


def _execution_target_presentation(gate: str) -> str:
    _, start, details = gate.partition("Present each supported option with:")
    presentation, end, _ = details.partition("Obtain explicit choice")
    if not start or not end:
        raise ValueError("Missing or out-of-order execution-target presentation markers")
    return " ".join(presentation.lower().split())


def policy_text(name: str) -> str:
    # "handoff" covers the whole handoff contract, which is split by trigger across HANDOFF_FILES.
    names = HANDOFF_FILES if name == "handoff" else (name,)
    texts = []
    for item in names:
        local = REPO / "codex/skill/references" / f"{item}.md"
        if item == "core" or local.exists():
            texts.append(_effective("codex", item))
        else:
            texts.append((REPO / "shared/skill/references" / local.name).read_text())
    return " ".join(" ".join(text.lower().split()) for text in texts)

class TaskCommitPolicyTests(unittest.TestCase):
    # TASK-01's user-approved structural exception: RED/GREEN checks of the
    # written contract only, not consuming-agent runtime compliance.
    def section(self, name: str, heading: str) -> str:
        text = policy_text(name)
        self.assertIn(heading, text)
        section = text.split(heading, 1)[1]
        for boundary in (" ## ", " ### "):
            section = section.split(boundary, 1)[0]
        return section

    def contracts(self, text: str, patterns: tuple[str, ...]) -> None:
        for pattern in patterns:
            with self.subTest(contract=pattern):
                self.assertRegex(text, pattern)

    def test_ceo_commits_accepted_top_level_task_without_user_approval(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.assertNotIn("optionally create", commit)

    def test_planner_groups_inseparable_changes_and_defines_task_gates(self) -> None:
        self.assertIn("## top-level plan tasks", policy_text("planning"))
        profile = tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
        self.assertNotIn("sandbox_mode", profile)  # user decision H1: read-only is a prompt-level guard
        self.assertIn("## automatic commit after plan-task acceptance", policy_text("commit"))

    def test_substeps_and_reports_do_not_replace_acceptance(self) -> None:
        self.assertIn("## automatic commit after plan-task acceptance", policy_text("commit"))

    def test_task_and_final_plan_verification_remain_distinct(self) -> None:
        self.assertIn("## task acceptance and final plan acceptance", policy_text("verification"))

    def test_commit_blocks_on_scope_checks_findings_and_git_state(self) -> None:
        self.assertIn("## automatic commit after plan-task acceptance", policy_text("commit"))

    def test_commit_evidence_no_change_and_resume_are_explicit(self) -> None:
        self.assertIn("## automatic commit after plan-task acceptance", policy_text("commit"))
        restart = _effective_section("codex", "handoff", "## Choice lifetime and restart record")
        self.assertIn("### Implementer handoff gate", _effective("codex", "handoff").splitlines())
        gate = _effective_section("codex", "handoff", "### Implementer handoff gate")
        self.assertEqual(re.findall(r"(?m)^([1-7])\. ", gate), list("1234567"))
        self.assertIn("<git-common-dir>/arc/handoff/<plan-or-task-slug>.md", restart)

    def test_final_findings_use_followup_task_without_rewriting_commit(self) -> None:
        self.assertIn("## automatic commit after plan-task acceptance", policy_text("commit"))

    def test_document_batch_and_external_action_boundaries_remain(self) -> None:
        planning = _effective_section("codex", "planning", "## Complete planning-document set")
        order = next((line for line in planning.splitlines() if line.startswith("Order:")), "")
        self.assertIn("→ final Git → Implementer.", order)

class ConditionalReferenceTests(unittest.TestCase):
    # User-approved static contract exception for this change only.
    # These checks do not establish consuming-agent runtime compliance.
    def test_core_requires_task_scoped_references(self) -> None:
        core = policy_text("core")
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                self.assertIn(f"references/{name}.md", core)
                self.assertTrue((REPO / f"codex/skill/references/{name}.md").is_file())

    def test_reference_triggers_cover_dependent_stages(self) -> None:
        worktree_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                            if line.startswith("|") and "references/handoff-worktree.md" in line)
        self.assertNotIn("choice request", worktree_row)
        self.assertNotIn("selection target", worktree_row)
        self.assertNotRegex(policy_text("handoff-prep").split("## workspace handoff", 1)[0], r"choice request also read")
        self.assertNotIn("before an execution-target choice request", policy_text("handoff-worktree").split("## workspace handoff", 1)[0])

    def test_planning_order_and_recovery_protections_remain(self) -> None:
        self.assertIn("## Shared terms", _effective("codex", "core").splitlines())

    def test_references_preserve_policy_contracts(self) -> None:
        self.assertIn("## Complete planning-document set", _effective("codex", "planning").splitlines())
        contracts = {
            "planning": ("one combined approval",),
            "handoff": ("planning document commit",),
            "verification": ("criterion verdict", "ui browser acceptance checks"),
            "git-recovery": ("git metadata write denial", "partial completion"),
            "arc-visual-companion": (),
        }
        for name, phrases in contracts.items():
            path = REPO / f"codex/skill/references/{name}.md"
            self.assertTrue(path.is_file(), name)
            for phrase in phrases:
                with self.subTest(reference=name, contract=phrase):
                    self.assertIn(phrase, policy_text(name))

    def test_core_preserves_role_and_risk_gates(self) -> None:
        self.assertTrue({"RP-600", "RP-681"} <= W2_RULE_PINS.keys())

    def test_implementer_trusts_ceo_verified_brief(self) -> None:
        implementer = " ".join(tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
                         ["developer_instructions"].lower().split())
        for absent in (r"independently verify", r"git common directory", r"every first start or restart",
                       r"fresh explicit choice", r"reuse the initial explicit choice", r"revalidates the full handoff gate"):
            with self.subTest(absent=absent):
                self.assertNotRegex(implementer, absent)

    def test_implementer_profile_holds_handoff_contract_without_full_reference_read(self) -> None:
        implementer = " ".join(tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertNotRegex(implementer, r"before every first start or restart, read")
        texts = {path.name: " ".join(path.read_text().lower().split()) for path in
                 [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]}
        for name, text in texts.items():
            for absent in (r"implementer independently", r"implementer's independent", r"implementer independent check",
                           r"orchestrator and implementer independently", r"independent checkout"):
                with self.subTest(file=name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_handoff_split_keeps_implementer_start_file_to_start_and_restart_sections(self) -> None:
        def headings(name: str) -> list[str]:
            return [line[4:].strip().lower() for line in (REPO / f"codex/skill/references/{name}.md").read_text().splitlines()
                    if line.startswith("### ")]
        self.assertEqual(headings("handoff"), ["checkout approval", "implementer handoff gate", "handoff evidence",
                                               "task readiness at every assignment", "choice lifetime and restart record"])
        self.assertEqual(headings("handoff-prep"), ["execution-target request gate", "git mutation evidence gate",
                                                    "new task branch", "current checkout", "planning document commit",
                                                    "execution-time plan revision", "recovery prerequisite"])
        self.assertEqual(headings("handoff-worktree"), ["new managed worktree", "worktree document transfer",
                                                        "worktree failures and partial completion"])
        core = (REPO / "codex/skill/references/handoff.md").read_text().lower()
        self.assertIn("handoff-prep.md", core)
        self.assertIn("handoff-worktree.md", core)

    def test_tester_and_reviewer_profiles_hold_contract_without_full_reference_read(self) -> None:
        for role in ("tester", "reviewer"):
            with self.subTest(role=role):
                self.assertIn("developer_instructions", tomllib.loads(
                    (REPO / f"codex/agents/arc-{role}.toml").read_text()))

    def test_restart_choice_lifetime_and_evidence(self) -> None:
        path = REPO / "codex/skill/references/handoff.md"
        self.assertTrue(path.is_file())
        handoff = policy_text("handoff")
        self.assertNotRegex(handoff, r"orchestrator and implementer independently recheck")
        self.assertNotRegex(handoff, r"full handoff gate and independent checks")

class ReviewerOncePerPlanTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_final_single_reviewer_is_explicit(self) -> None:
        self.assertTrue(any(line.startswith("| significant/high risk")
                            for line in _effective("codex", "verification").lower().splitlines()))

    def test_no_per_task_reviewer_wording(self) -> None:
        paths = [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]
        for path in paths:
            text = " ".join(path.read_text().lower().split())
            with self.subTest(file=path.name, absent="accepted and Tester'd".lower()):
                self.assertNotIn("accepted and Tester'd".lower(), text)
                self.assertNotIn("accepted and Tester-approved".lower(), text)
            for absent in (r"checks/reviews as a (?:per-task|task) (?:gate|prerequisite)", r"in a multi-task plan", r"review as a task acceptance prerequisite",
                           r"expressly a task prerequisite", r"designated as that task's prerequisite",
                           r"(?i:Tester)/review at that dependency boundary", r"new reviewer for each task unless",
                           r"designated as a prerequisite", r"checks/reviews as a prerequisite"):
                with self.subTest(file=path.name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_dependency_boundary_is_tester_only(self) -> None:
        core = policy_text("verification")
        self.assertNotRegex(core, r"(?i:Tester)/review at that dependency boundary")

    def test_final_reviewer_findings_on_committed_work(self) -> None:
        self.assertTrue({"RP-294", "RP-689"} <= W2_RULE_PINS.keys())

class ResearchRoutingAndBriefTests(unittest.TestCase):
    def test_codex_spawn_fork_and_user_input_policy(self) -> None:
        skill = " ".join((REPO / "codex/skill/references/coordination.md").read_text().split())
        self.assertNotIn("When supported, start specialists", skill)

    def test_claude_native_role_and_ask_user_question_policy(self) -> None:
        skill = " ".join((REPO / "claude/skill/references/coordination.md").read_text().split())
        self.assertNotIn("When supported, start specialists", skill)

    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_research_routing_tiers(self) -> None:
        opening = policy_text("core").split("## ownership", 1)[0]
        for gone in ("lighter effort", "when unsure", "under models"):
            self.assertNotIn(gone, opening)
        claude = " ".join((REPO / "claude/skill/SKILL.md").read_text().lower().split()).split("## ownership", 1)[0]
        for gone in ("when unsure", "under models"):
            self.assertNotIn(gone, claude)

    def test_models_scouter_lookup_exception(self) -> None:
        for platform in ("codex", "claude"):
            text = (REPO / platform / "skill/references/coordination.md").read_text().lower()
            models = " ".join(text.split("## models", 1)[1].split("\n## ", 1)[0].split())
            with self.subTest(platform=platform):
                self.assertNotIn("reasoning_effort", models)
                self.assertNotIn("bounded scouter lookup", models)
                for command in ("npx", "npm i", "apply-models.py", "arc preset"):
                    self.assertNotIn(command, text)
        self.assertNotIn('reasoning_effort="medium"', policy_text("core"))

    def test_skill_not_reread_and_agents_body_wording(self) -> None:
        tokens = policy_text("coordination").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"this skill file, once read in this context and unchanged, is not re-read on follow-up turns")
        body = node_agents_block_body()
        self.assertNotIn("including relevant follow-up turns", body)

    def test_brief_template_field_order_and_delta(self) -> None:
        tokens = policy_text("coordination").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"goal; criteria \(ids\); exact scope/ownership \(absolute workspace, branch or detached head and head, handoff record path, when one exists, files\); constraints/decisions; evidence \(paths/lines, commands, artifact links\); prior findings; exact next objective \(one bounded objective\); return format")
        self.assertRegex(tokens, r"follow-ups send only changed fields and mark the rest `unchanged`")
        self.assertRegex(tokens, r"`unchanged` \(relative to a brief the recipient received\); restart briefs follow handoff; a fresh specialist gets every other field in full")
        for kept in (r"self-contained subset.*omit full history, repeated instructions, and raw logs",
                     r"one bounded objective",
                     r"conclusion, evidence locations, unresolved points, next step",
                     r"no findings may be brief; requested deliverables such as complete plan drafts remain complete",
                     r"cite paths/lines/pages/commands/links instead of logs; investigate gaps only"):
            with self.subTest(kept=kept):
                self.assertRegex(tokens, kept)

    def test_handoff_record_file_location(self) -> None:
        self.assertIn("## choice lifetime and restart record", policy_text("handoff"))

class WholeSystemReviewFollowUpTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_case_tester_requirement_is_satisfied_by_task_checks(self) -> None:
        core = policy_text("verification")
        verification = policy_text("verification")
        self.assertNotIn("requires Tester followed by independent review".lower(), verification)

    def test_planning_points_to_common_handoff_gate(self) -> None:
        planning = policy_text("planning")
        self.assertNotIn("the complete the common handoff gate", planning)
        self.assertNotIn("`workspace handoff` gate below", planning)

    def test_installed_limits_policy_replaces_manual_config(self) -> None:
        self.assertFalse((REPO / "codex/config.toml").exists())
        for platform in ("codex", "claude"):
            text = _effective(platform, "limits")
            for phrase in ("max_total_subagents", "max_concurrent_subagents", "100", "5", "reservation", "ledger", "Tester", "Reviewer"):
                self.assertIn(phrase, text)

    def test_reviewer_description_has_no_team_name(self) -> None:
        description = tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())["description"]
        self.assertNotIn("Yunho Team", description)

    def test_fallback_record_inline_and_slug(self) -> None:
        handoff = policy_text("handoff")

    def test_implementer_reads_record_for_unchanged_fields(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
        self.assertIn("developer_instructions", profile)


class SharedTermsTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_core_defines_shared_terms(self) -> None:
        core = policy_text("core").replace("*", "")
        self.assertIn("## shared terms", core)

    def test_profiles_carry_terms_used_in_citable_sections(self) -> None:
        for name in ("verification", "planning"):
            for term in SHARED_TERMS:
                with self.subTest(reference=name, term=term):
                    if name == "verification" and term == "evidence verdict":
                        continue
                    self.assertNotIn(term.capitalize(), raw_policy_text(name))

    def test_tester_fix_restorations(self) -> None:
        core = policy_text("verification")
        self.assertNotIn("implementer repair limits", core)  # dangling reference removed (M10)
        self.assertNotIn("repair limits", policy_text("handoff"))

    def test_term_usage_sites(self) -> None:
        for name, heading in (
            ("commit", "## automatic commit after plan-task acceptance"),
            ("verification", "## risk-scaled execution"),
            ("handoff", "### checkout approval"),
            ("handoff-prep", "### execution-target request gate"),
            ("git-recovery", "### existing changes and failures"),
            ("handoff-prep", "### git mutation evidence gate"),
            ("handoff-prep", "### planning document commit"),
            ("git-recovery", "### worktree failures and partial completion"),
        ):
            with self.subTest(reference=name, section=heading):
                self.assertIn(heading, _effective("codex", name).lower().splitlines())

class ARCPreactionGateTests(unittest.TestCase):
    # Specifically approved structural contract checks, not consuming-agent runtime tests.
    def test_preaction_role_precedence(self) -> None:
        self.assertTrue({"RP-087"} <= W2_RULE_PINS.keys())

    def test_preaction_document_save_evidence(self) -> None:
        gates = _effective_section("codex", "planning", "## Document-save evidence gates")
        self.assertEqual(re.findall(r"(?m)^\| (Spec|Plan) \|", gates), ["Spec", "Plan"])
        spec_row = next(line for line in gates.splitlines() if line.startswith("| Spec |"))
        self.assertIn("Architectural only", spec_row)
        for field in ("#architectural-start-confirmation", "self-review", "absolute path",
                      "path/version/SHA-256", "depth judgment", "dependencies"):
            self.assertIn(field, gates)
        self.assertNotIn("required bounded spec", gates.lower())
        complete = _effective_section("codex", "planning", "## Complete planning-document set")
        self.assertIn("| Bounded, plan required |", complete)
        for row in ("Spike", "Bounded, plan skipped", "Non-behavior docs/config"):
            with self.subTest(path=row):
                self.assertIn(f"| {row} |", complete)

    def test_preaction_reference_and_choice_order(self) -> None:
        choice = _effective_section("codex", "handoff-prep", "### Execution-target request gate").lower()
        for phrase in ("planned document scope", "absolute paths", "design/plan depth", "valid omissions",
                       "dependencies", "ownership"):
            with self.subTest(evidence=phrase):
                self.assertIn(phrase, choice)

    def test_preaction_git_evidence_and_batch_order(self) -> None:
        handoff = policy_text("handoff")
        gate = _effective_section("codex", "handoff-prep", "### Git mutation evidence gate").lower()
        for phrase in ("branch creation/switch", "worktree creation", "staging", "commit",
                       "absolute workspace", "repository", "branch or detached head",
                       "staged/unstaged/untracked", "preservation", "ownership", "command/paths"):
            with self.subTest(evidence=phrase):
                self.assertIn(phrase, gate)
        planning = policy_text("planning").split("### complete planning-document set")[1]
        self.assertRegex(planning, r"defer.*brainstorming.*early spec commit.*review the uncommitted spec.*obtain the combined approval")
        commit = handoff.split("### planning document commit")[1].split("### recovery prerequisite")[0]
        for contract in (r"reuse valid commits without recommitting", r"batch all remaining uncommitted approved documents",
                         r"staged paths and staged diff match exactly", r"finalizes.*message before the first commit",
                         r"after success verify sha.*post-commit head.*final branch"):
            self.assertRegex(commit, contract)

    def test_preaction_stop_and_runtime_limits(self) -> None:
        planning = policy_text("planning")
        limits = planning.split("## evidence refresh and limits", 1)[1]
        for phrase in ("missing", "mismatched", "unfinished approvals", "failure", "stop", "reverify",
                       "do not retroactively", "structural checks", "runtime compliance", "unverified"):
            self.assertIn(phrase, limits)
        self.assertIn("do not modify external skills", planning)
        handoff = policy_text("handoff")
        self.assertRegex(handoff, r"unrelated staged files.*preserved.*block handoff")
        gate = handoff.split("### git mutation evidence gate", 1)[1].split("### ", 1)[0]
        self.assertIn("apply the preservation rule; unrelated staged files stop the mutation", gate)
        docs = handoff.split("### planning document commit", 1)[1].split("### ", 1)[0]
        self.assertIn("unrelated staged files stop the commit under the preservation rule", docs)
        assert_term_defined(self, "preservation rule", "implementer")

class CeoDirectPathTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def assert_direct_path_heading(self) -> None:
        self.assertIn("## orchestrator direct path for small tasks", policy_text("handoff"))

    def test_direct_path_eligibility_is_small_low_risk_and_plan_skip(self) -> None:
        self.assert_direct_path_heading()

    def test_direct_path_keeps_approval_handoff_tdd_and_verification(self) -> None:
        self.assert_direct_path_heading()

    def test_direct_path_stops_and_reclassifies_without_reverting(self) -> None:
        self.assert_direct_path_heading()

    def test_ownership_and_flows_name_the_direct_path_exception(self) -> None:
        core = policy_text("core")
        ownership = policy_text("coordination").split("## ownership", 1)[1].split("## instruction", 1)[0]
        row = next(line for line in (REPO / "codex/skill/references/verification.md").read_text().lower().splitlines()
                   if line.startswith("| small, low risk"))
        gate = policy_text("handoff").split("## common handoff gate", 1)[1].split("## implementer tdd", 1)[0]
        planning = policy_text("planning")
        handoff_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if line.startswith("|") and "references/handoff.md" in line)

class ImplementerBriefAndReuseTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_fresh_implementer_per_top_level_task(self) -> None:
        core = policy_text("coordination")
        self.assertNotRegex(core, r"may reuse implementer while the approved scope")

    def test_implementer_briefs_cite_sections_instead_of_whole_documents(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
        self.assertIn("developer_instructions", profile)

    def test_loader_keeps_subagents_on_profiles(self) -> None:
        self.assertIn("~/.codex/skills/arc/SKILL.md", node_agents_block_body())

class LongTaskTokenTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_amendment_restarts_implementer(self) -> None:
        self.assertIn("## instruction and execution adapter", policy_text("coordination"))

    def test_long_running_commands_are_not_polled_with_sleep(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
        self.assertIn("developer_instructions", profile)

    def test_ceo_recommends_new_session_per_plan(self) -> None:
        self.assertIn("## context discipline and handoffs", policy_text("coordination"))

class TokenDisciplineTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_core_waits_without_polling_and_batches_messages(self) -> None:
        tokens = policy_text("coordination").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        for contract in (
            r"wait_agent.*maximum supported timeout.*until.*completes",
            r"timeout.*not a reason to poll",
            r"do not poll.*list_agents.*sleep.*repeated short waits",
            r"list_agents`? only.*unknown agent",
            r"one complete brief.*batch related.*one message",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(tokens, contract)

    def test_core_reads_targeted_ranges_without_weakening_references(self) -> None:
        tokens = policy_text("coordination").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        for contract in (
            r"read only the needed ranges.*rg -n.*sed -n",
            r"cap long command output",
            r"do not re-read.*unchanged",
            r"mandatory reference.*already read in this context.*unchanged.*need not be re-read",
            r"does not shorten.*triggered mandatory reference",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(tokens, contract)

    def test_role_profiles_read_targeted_ranges(self) -> None:
        for role in ("scouter", "planner", "implementer", "tester", "reviewer"):
            with self.subTest(role=role):
                profile = tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                self.assertIn("developer_instructions", profile)

class RolePolicyTests(unittest.TestCase):
    # Approved package-consistency checks; these do not execute agent runtime behavior.
    def test_role_profiles_report_to_ceo_without_nested_delegation(self) -> None:
        for role in ("scouter", "planner", "implementer", "tester", "reviewer"):
            with self.subTest(role=role):
                profile = tomllib.loads((REPO / "codex/agents" / f"arc-{role}.toml").read_text())
                self.assertEqual(profile["name"], f"arc_{role}")
    def test_role_policy_assigns_development_to_ceo(self) -> None:
        pins = json.loads((REPO / "tests/node/fixtures/rule-pins.json").read_text())
        ids = {rule["id"] for rule in pins["rules"]}
        self.assertTrue({"RP-611"} <= ids)

    def test_scouter_read_only_scope_and_reporting(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-scouter.toml").read_text())
        self.assertEqual(profile["name"], "arc_scouter")
        self.assertNotIn("sandbox_mode", profile)  # user decision H1: read-only is a prompt-level guard

    def test_standalone_document_writing_has_no_specialist_auto_route(self) -> None:
        pins = json.loads((REPO / "tests/node/fixtures/rule-pins.json").read_text())
        ids = {rule["id"] for rule in pins["rules"]}
        self.assertTrue({"RP-612"} <= ids)

    def test_active_references_use_five_role_contract(self) -> None:
        for name in ("core", "handoff", "planning", "verification"):
            text = policy_text(name)
            for old in ("arc_secretary", "arc_scout`", "secretary", "all six roles"):
                self.assertNotIn(old, text)

    def test_tester_ui_browser_acceptance_contract(self) -> None:
        tester = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-tester.toml").read_text()
        )["developer_instructions"].lower().split())
        for removed in ("viewport", "interaction steps", "clean up only"):
            self.assertNotIn(removed, tester)

    def test_tester_reporting_contract(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-tester.toml").read_text())
        self.assertEqual(profile["name"], "arc_tester")

    def test_reviewer_finding_handoff(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())
        self.assertEqual(profile["name"], "arc_reviewer")

    def _workspace_handoff_section(self, title: str) -> str:
        handoff = policy_text("handoff") + " " + policy_text("git-recovery")
        self.assertIn(f"### {title.lower()}", handoff)
        section = handoff.split(f"### {title.lower()}", 1)[1].split("### ", 1)[0]
        if title == "New managed worktree":
            section += " " + policy_text("worktree-creation")
        return section

    def _assert_workspace_handoff_contracts(
        self, title: str, contracts: tuple[str, ...]
    ) -> None:
        section = self._workspace_handoff_section(title)
        for contract in contracts:
            with self.subTest(section=title, contract=contract):
                self.assertRegex(section, contract)

    def test_claude_managed_worktree_creation_covers_ac19(self) -> None:
        prep = _effective("claude", "handoff-prep")
        self.assertNotIn("current checkout only", prep)
        self.assertNotIn("ARC-managed worktree execution is unsupported", prep)
        for option in ("current checkout", "new task branch", "new managed worktree and task branch", ".claude/worktrees/<name>"):
            self.assertIn(option, prep)
        creation = REPO / "claude/skill/references/worktree-creation.md"
        self.assertTrue(creation.is_file(), "Claude M2 creation procedure is required")
        text = _effective("claude", "worktree-creation")
        self.assertEqual(re.findall(r"^(\d)\. ", text, re.M), list("123456789"))
        steps = dict(re.findall(r"^(\d)\. (.*?)(?=^\d\. |\Z)", text, re.M | re.S))
        required = {
            "1": ("explicit", "source", "common directory", "full SHA", "collision", "document"),
            "2": ("git check-ignore", ".git/info/exclude", "EnterWorktree", "base", "collision"),
            "3": ("git worktree add -b <approved-branch> .claude/worktrees/<name> <verified-full-sha>", "--force", "-B", "suffix", "retry", "git worktree add .claude/worktrees/<name> <branch>"),
            "4": ("git worktree list --porcelain", "common", "HEAD", "branch", "index", "files"),
            "5": ('EnterWorktree({path:"<abs>"})', "git rev-parse --show-toplevel", "realpath", "pwd", "compound"),
            "6": ("type:'worktree-attachment'", "realpath", "gitDir", "gitCommonDir", "cwd", "toplevel"),
            "7": ("Planner/Reviewer", "--cwd <worktree realpath>", "brief"),
            "8": ('ExitWorktree({action:"keep"})', "git worktree remove/prune"),
            "9": ("Stop and inspect", "retry", "fallback", "M1", "M3", "deletion"),
        }
        for number, phrases in required.items():
            for phrase in phrases:
                with self.subTest(step=number, phrase=phrase):
                    self.assertIn(phrase, steps[number])

    def test_workspace_handoff_requires_scoped_checkout_approval(self) -> None:
        self._workspace_handoff_section("Checkout approval")
        gate = _effective_section("codex", "handoff-prep", "### Execution-target request gate")
        presentation = _execution_target_presentation(gate)
        for phrase in ("verified absolute workspace", "repository", "branch or detached head",
                       "base head", "branch candidate", "collision"):
            self.assertIn(phrase, presentation)

    def test_workspace_handoff_current_checkout_requires_explicit_choice(self) -> None:
        self._workspace_handoff_section("Current checkout")

    def test_workspace_handoff_reapproves_changed_targets(self) -> None:
        self._workspace_handoff_section("New task branch")

    def test_workspace_handoff_preserves_branch_collision_rules(self) -> None:
        self._workspace_handoff_section("New task branch")

    def test_managed_branch_selection_order_and_collision_reuse(self) -> None:
        self._workspace_handoff_section("New managed worktree")

    def test_workspace_handoff_preserves_existing_changes(self) -> None:
        self._workspace_handoff_section("Existing changes and failures")

    def test_workspace_handoff_failures_do_not_fallback(self) -> None:
        self._workspace_handoff_section("Existing changes and failures")

    def test_workspace_handoff_commits_approved_plan_docs_before_implementer(self) -> None:
        self._workspace_handoff_section("Planning document commit")

    def test_workspace_handoff_worktree_scoped_choice_and_base(self) -> None:
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        section = self._workspace_handoff_section("New managed worktree")
        self.assertNotIn("before and after choice", section)
        self.assertNotIn("descriptive name, and approved document transfer/commit scope", section)

    def test_workspace_handoff_managed_worktree_inputs_and_results(self) -> None:
        section = self._workspace_handoff_section("New managed worktree")
        creation = _effective("codex", "worktree-creation")
        for token in ("mcp__codex_app__create_worktree", "allowAsync: true", "name:", "ref:",
                      "<approved-descriptive-name>"):
            self.assertIn(token, creation)
        for command in ("git switch -c <approved-branch> <ref>", "git switch <approved-branch>"):
            self.assertIn(command, section)
        self.assertNotIn("../<repo>-<topic>-worktree", section)
        self.assertNotIn("git worktree add -b <branch> <absolute-path> <base-sha>", section)

    def test_workspace_handoff_worktree_creation_and_identity(self) -> None:
        self._workspace_handoff_section("New managed worktree")
        creation = _effective("codex", "worktree-creation")
        self.assertRegex(creation, r"(?s)mcp__codex_app__create_worktree.*?allowAsync: true.*?name:.*?ref:")

    def test_workspace_handoff_managed_worktree_async_attachment_and_no_fallback(self) -> None:
        self._workspace_handoff_section("New managed worktree")

    def test_workspace_handoff_worktree_source_dirty_states(self) -> None:
        self._workspace_handoff_section("New managed worktree")

    def test_workspace_handoff_worktree_document_transfer(self) -> None:
        self._workspace_handoff_section("Worktree document transfer")

    def test_workspace_handoff_worktree_docs_commit_order(self) -> None:
        self._workspace_handoff_section("Planning document commit")

    def test_workspace_handoff_worktree_partial_completion(self) -> None:
        self._workspace_handoff_section("Worktree failures and partial completion")

    def test_workspace_handoff_worktree_roles_and_restart(self) -> None:
        self._workspace_handoff_section("Handoff evidence")
        restart = _effective_section("codex", "handoff", "## Choice lifetime and restart record")
        for field in ("HEAD", "SHA/message/paths/content", "task ID", "Git", "ownership",
                      "<git-common-dir>/arc/handoff/<plan-or-task-slug>.md", "`unchanged`"):
            self.assertIn(field, restart)

    def test_workspace_handoff_worktree_keeps_in_place_prohibition(self) -> None:
        self._workspace_handoff_section("New task branch")

    def test_worktree_planning_and_core_preparation_gates(self) -> None:
        planning = policy_text("planning").split("### complete planning-document set", 1)[1].split("### evidence refresh", 1)[0]
        self.assertRegex(planning, r"while documents.*do not.*stage documents.*commit planning documents")
        self.assertRegex(planning, r"normal order:.*execution-target choice.*target preparation and verification.*formal spec drafting.*complete applicable set.*batch docs commit")
        core = policy_text("handoff").split("## common handoff gate", 1)[1].split("## implementer tdd", 1)[0]
        self.assertRegex(core, r"selected worktree.*common directory.*registration.*source preservation")
        self.assertRegex(core, r"depth-2 roles use the supplied workspace")

    def test_worktree_contract_matches_selected_execution_paths(self) -> None:
        text = policy_text("handoff-worktree")
        creation = policy_text("worktree-creation")
        for token in ("mcp__codex_app__create_worktree", "allowasync: true", "operationid", "attach_worktree"):
            self.assertIn(token, creation)
        self.assertNotIn("mcp__codex_app__", text)
        self.assertNotIn("codex app", text)
        self.assertIn("[worktree-creation](worktree-creation.md)", text)
        self.assertNotIn("../<repo>-<topic>-worktree", text)
        self.assertNotIn("git worktree add -b", text)

    def test_distribution_manifest_matches_scouter_payload(self) -> None:
        node_verify_manifest()
        names = {line.split("  ", 1)[1] for line in (REPO / "MANIFEST.sha256").read_text().splitlines()}
        self.assertIn("codex/agents/arc-scouter.toml", names)
        self.assertNotIn("codex/agents/user-notes.toml", names)
        self.assertNotIn("codex/agents/user-research.toml", names)
        self.assertNotIn("codex/skill/models.toml", names)

    def test_acceptance_evidence_flow(self) -> None:
        self.assertTrue({
            "RP-139", "RP-406", "RP-690", "RP-691", "RP-692", "RP-693", "RP-694",
        } <= W2_RULE_PINS.keys())

def node_agents_block_body():
    return subprocess.run(["node", "--input-type=module", "-e", "import {agentsBlockBody} from './lib/installer/global-config.mjs';process.stdout.write(agentsBlockBody('/home/u/.codex','/home/u'));"], cwd=REPO, capture_output=True, text=True, check=True).stdout

def node_verify_manifest():
    subprocess.run(["node", "scripts/update-manifest.mjs", "--check"], cwd=REPO, capture_output=True, text=True, check=True)


def assert_term_defined(case: unittest.TestCase, term: str, profile: str | None = None) -> None:
    # A replaced restatement is pinned by its term usage plus the term's full definition.
    case.assertIn(f"{term}: {SHARED_TERMS[term]}", policy_text("core").replace("*", ""))
    if profile:
        case.assertIn(f"{term}: {SHARED_TERMS[term]}", profile_text(profile))

def raw_policy_text(name: str) -> str:
    path = REPO / "codex/skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")
    return " ".join(path.read_text().split())

def profile_text(role: str) -> str:
    return " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                    ["developer_instructions"].lower().split())

SHARED_TERMS = {
    "preservation rule": "preserve unrelated staged, unstaged, and untracked changes and edit ownership; never "
                         "automatically stash, reset, clean, unstage, discard, amend, or delete branches/worktrees; "
                         "never change permissions, delete locks, or bypass the sandbox to proceed; stop and report to "
                         "orchestrator (orchestrator reports to the user)",
    "explicit choice": "only a clear user selection counts; planning approval, silence, refusal of another option, or "
                       "an ambiguous reply never does",
    "stop and inspect": "on failure or partial completion, stop dependent work; inspect and record the actual path, "
                        "branch or detached head, head, index, files, and completed steps; do not retry, fall back, or "
                        "repeat completed work automatically; revalidate affected gates after resolution",
    "evidence verdict": "each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never "
                        "turn unverified into proven; reports keep unverified scope visible",
}

class CodexRoleHardeningTests(unittest.TestCase):
    """Static checks of the written Codex role-boundary contract; not runtime agent compliance."""

    def skill(self) -> str:
        return " ".join((REPO / "codex/skill/SKILL.md").read_text().split())

    def raw(self, name: str) -> str:
        return raw_policy_text(name)

    def test_role_gate_planner_only_ceo_skill_ban_and_routing(self) -> None:
        text = _effective("codex", "core")
        gate = next((p for p in text.split("\n\n") if p.startswith(("Role gate:", "**Role gate:**"))), "")
        self.assertTrue(gate)
        self.assertLessEqual(len(re.findall(r"[.!?](?:\s|$)", gate)), 5)

    def test_tester_freshness_and_no_contradictory_substitution(self) -> None:
        core, verification = self.raw("verification"), self.raw("verification")
        for text in (core, verification):
            self.assertNotIn("Tester or Orchestrator focused checks", text)

    def test_restart_brief_rule_lives_in_handoff_only(self) -> None:
        core, handoff = self.skill(), self.raw("handoff")
        self.assertNotIn("delta-only restart brief", core)
        self.assertNotIn("`unchanged` means unchanged relative to", core)
        self.assertNotIn("carries the full record inline (no delta", handoff)
        self.assertEqual(handoff.count("full record inline"), 1)

    def test_read_only_roles_drop_sandbox_mode_and_use_prompt_guards(self) -> None:
        for role in ("planner", "scouter", "reviewer"):
            with self.subTest(role=role):
                path = REPO / f"codex/agents/arc-{role}.toml"
                self.assertNotIn("sandbox_mode", tomllib.loads(path.read_text()))

    def test_dangling_references_removed_and_install_path_real(self) -> None:
        core = self.skill()
        for gone in ("branch protection", "Implementer repair limits", "existing CEO depth judgment", "install.py",
                     "short design"):
            with self.subTest(gone=gone):
                self.assertNotIn(gone, core)

    def test_worktree_branch_collision_never_auto_suffixes(self) -> None:
        self.assertNotIn("append `-2`", self.raw("handoff-prep"))

    def test_limits_policy_is_not_hard_runtime_enforcement(self) -> None:
        text = (REPO / "codex/skill/references/limits.md").read_text()
class InternalSuperpowersContractTests(unittest.TestCase):
    # Approved T1 structural contract; actual next-turn behavior needs separate evidence.
    def test_internal_superpowers_paths_and_runtime_boundaries(self):
        for platform in ("codex", "claude"):
            core = _effective(platform, "coordination")
            for name in ('brainstorming', 'writing-plans', 'test-driven-development'):
                self.assertIn(f'references/{name}.md', core)
            self.assertIn('references/arc-visual-companion.md', (REPO / f'{platform}/skill/SKILL.md').read_text())
            self.assertFalse((REPO / f'{platform}/skill/references/superpowers').exists())
        self.assertFalse((REPO / 'shared/skill/references/superpowers').exists())

    def test_flat_imported_assets_match_original_provenance_and_both_platforms(self):
        mapping = {'brainstorming/SKILL.md': 'brainstorming.md', 'writing-plans/SKILL.md': 'writing-plans.md',
                   'test-driven-development/SKILL.md': 'test-driven-development.md',
                   'brainstorming/visual-companion.md': 'visual-companion.md',
                   'brainstorming/builder-check-prompt.md': 'builder-check-prompt.md',
                   'test-driven-development/writing-good-tests.md': 'writing-good-tests.md', 'LICENSE': 'superpowers-LICENSE'}
        mapping.update({f'brainstorming/scripts/{name}': f'scripts/{name}' for name in
                        ('start-server.sh', 'stop-server.sh', 'server.cjs', 'helper.js', 'frame-template.html')})
        base = REPO / 'shared/skill/references'
        provenance = json.loads((base / 'superpowers-provenance.json').read_bytes())
        self.assertEqual(set(provenance['files']), set(mapping))
        for source, destination in mapping.items():
            actual = (base / destination).read_bytes()
            self.assertEqual(hashlib.sha256(actual).hexdigest(), provenance['files'][source])
            for platform in ('codex', 'claude'):
                self.assertFalse((REPO / f'{platform}/skill/references/{destination}').exists())
        for platform in ('codex', 'claude'):
            self.assertNotEqual((REPO / f'{platform}/skill/references/arc-visual-companion.md').read_bytes(), (base / 'visual-companion.md').read_bytes())


class WorkspaceBeforeDocumentsTests(unittest.TestCase):
    # Approved T1 structural checks; consuming-agent runtime compliance is unverified.
    def text(self, name):
        path = REPO / "codex/skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")
        if not path.exists():
            path = REPO / "shared/skill/references" / f"{name}.md"
        return " ".join(path.read_text().lower().split())

    def test_normal_order_selects_and_prepares_before_formal_drafting(self):
        planning = _effective_section("codex", "planning", "## Complete planning-document set")
        order = next((line.lower() for line in planning.splitlines() if line.startswith("Order:")), "")
        self.assertTrue(order)
        cursor = 0
        for marker in ("initial design approval", "explicit target and source snapshot", "first required draft/self-review",
                       "focused preparation gate", "actual preparation/comparison", "save/review/revision",
                       "architectural: dependent plan drafting/save/review/revision", "spec↔plan consistency check",
                       "one combined approval; bounded: plan approval", "full set",
                       "verify existing commits/batch remaining approvals", "final git"):
            found = order.find(marker, cursor)
            self.assertGreaterEqual(found, cursor, marker)
            cursor = found + len(marker)

    def test_choice_request_uses_planned_documents_and_verified_target(self):
        self.assertIn("### Git mutation evidence gate", _effective("codex", "handoff-prep").splitlines())
        gate = _effective_section("codex", "handoff-prep", "### Execution-target request gate")
        presentation = _execution_target_presentation(gate)
        for phrase in ("planned documents", "coverage", "expected relative paths",
                       "dependencies/order", "drafting/approval", "verified absolute workspace",
                       "repository", "branch or detached head", "base head", "branch candidate",
                       "collision", "staged/unstaged/untracked state", "preservation/ownership"):
            self.assertIn(phrase, presentation)
        self.assertIn(W2_RULE_PINS["RP-603"], gate)

    def test_phase_specific_git_and_batch_gates(self):
        text = self.text("handoff-prep")
        for field in ("index", "ownership"):
            self.assertIn(field, text)

    def test_platform_targets_and_legacy_transfer_boundaries(self):
        text = self.text("handoff-prep")
        self.assertIn("current checkout", text)
        self.assertIn("task branch", text)
        self.assertIn("current-chat attachment", self.text("worktree-creation"))
        worktree = self.text("handoff-worktree")
        for field in ("registration", "common directory", "approved branch"):
            self.assertIn(field, worktree)

    def test_document_omissions_and_implementer_gate_remain(self):
        text = self.text("planning")
        for path in ("spike", "bounded", "non-behavior"):
            self.assertIn(path, text)
        self.assertIn("## Implementer TDD and constraints", _effective("codex", "handoff").splitlines())

class SpecPlanApprovalMergeTests(unittest.TestCase):
    PLATFORMS = ("claude", "codex", "gemini", "grok")
    APPROVAL_RULES = (
        '<a id="architectural-combined-approval"></a>',
        '## Architectural combined approval',
    )
    FULL_AUTO_GATES = ("Architectural spec+plan combined approval", "Plan approval")
    REMOVED_WORDING = (
        'spec-required Bounded',
        'required Bounded spec',
        'Required Bounded specs',
        'records Bounded spec necessity',
        'If Bounded requires written spec',
        'written-spec approval before',
        'sequential design/spec/plan approvals',
        'Required written-spec approval precedes',
        'obtains written-spec approval',
        'After written-spec approval',
        'ordered written-spec/dependent-plan',
        '| Written spec approval |',
        'spec approval precedes dependent planning',
    )

    def reference(self, platform, name):
        return (REPO / platform / "skill/references" / f"{name}.md").read_bytes()

    def test_combined_approval_rules_present_on_every_platform(self):
        for platform in self.PLATFORMS:
            planning = self.reference(platform, "planning").decode()
            for rule in self.APPROVAL_RULES:
                with self.subTest(platform=platform, rule=rule):
                    self.assertIn(rule, planning)
            with self.subTest(platform=platform):
                self.assertIn("[decision inventory](#decision-inventory)", _effective(platform, "planning"))
                self.assertIn("[question classification](#decision-inventory)", _effective(platform, "planning"))
                for gate in self.FULL_AUTO_GATES:
                    self.assertIn(f"| {gate} | auto |", _effective(platform, "planning"))

    def test_combined_approval_text_identical_across_platforms(self):
        anchor, heading = self.APPROVAL_RULES
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                planning = self.reference(platform, "planning").decode().splitlines()
                self.assertEqual(planning.count(anchor), 1)
                self.assertEqual(planning[planning.index(anchor) + 1], heading)
                self.assertLess(planning.index(heading), planning.index('<a id="top-level-plan-tasks"></a>'))
                combined = _effective_section(platform, "planning", heading)
                self.assertEqual(re.findall(r"(?m)^\d+\. [^\n]+ \((R\d+)\):", combined),
                                 [f"R{number}" for number in range(7)])

    def test_removed_spec_approval_wording_absent(self):
        paths = [path for platform in self.PLATFORMS
                 for path in (REPO / platform / "skill").rglob("*.md")]
        paths += [REPO / "lib/policy/role-policy.json", REPO / "lib/prompts/agent-fragments.json"]
        for path in paths:
            text = path.read_text()
            for phrase in self.REMOVED_WORDING:
                if phrase in text:
                    with self.subTest(path=path.relative_to(REPO), phrase=phrase):
                        self.fail("Obsolete spec approval wording")

    def test_handoff_cooperative_plan_mode_wording(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                self.assertIn("Supported plan-mode handoffs", _effective(platform, "handoff"))

class DesignConversationPolicyTests(unittest.TestCase):
    PLATFORMS = ("claude", "codex", "gemini", "grok")
    DESIGN_RULES = (
        "<a id=\"design-conversation\"></a>",
        "### Design conversation",
    )
    INVENTORY_RULES = (
        "<a id=\"decision-inventory\"></a>",
        "### Decision inventory and question classification",
    )
    FULL_AUTO_RULES = (
        W2_RULE_PINS["RP-678"],
        "6. Full Auto: author judgments are not open decisions when [Full Auto](#full-auto-run-mode) counts zero open decisions.",
    )
    REVIEWED_SPEC = W2_RULE_PINS["RP-679"]

    def reference(self, platform, name):
        return (REPO / platform / "skill/references" / f"{name}.md").read_bytes()

    def assert_rules(self, text, rules):
        for rule in rules:
            with self.subTest(rule=rule):
                self.assertIn(rule.encode(), text)

    def planning_parts(self, platform):
        planning = self.reference(platform, "planning")
        editorial, _, managed = planning.partition(b"[ARC role policy: contract begin]")
        return editorial, managed.partition(b"[ARC role policy: contract end]")[0]

    def test_design_conversation_rules_present_on_every_platform(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                editorial, _ = self.planning_parts(platform)
                self.assert_rules(editorial, self.DESIGN_RULES)

    def test_decision_inventory_and_scope_notation_rules_present(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                editorial, _ = self.planning_parts(platform)
                self.assert_rules(editorial, self.INVENTORY_RULES)

    def test_spec_plan_question_classification_and_attachments_present(self):
        for platform in self.PLATFORMS:
            planning = _effective(platform, "planning")
            with self.subTest(platform=platform):
                self.assertIn("[decision inventory](#decision-inventory)", planning)
                self.assertIn("[question classification](#decision-inventory)", planning)

    def test_author_judgments_not_open_decisions_under_full_auto(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                lines = self.reference(platform, "planning").splitlines(keepends=True)
                for rule in self.FULL_AUTO_RULES:
                    with self.subTest(rule=rule):
                        self.assertIn(rule.encode() + b"\n", lines)

    def test_design_stage_correction_wording_removed(self):
        removed = (
            "a resend after a return without a draft uses the consolidated-correction opportunity",
            "allow initial draft and one consolidated correction",
            "allow the initial draft and one consolidated correction",
            "and focused questions",
            "review only",
            "if needed",
        )
        planning_refs = {REPO / platform / "skill/references/planning.md" for platform in self.PLATFORMS}
        fragments = REPO / "lib/prompts/agent-fragments.json"
        paths = [path for platform in self.PLATFORMS
                 for path in (REPO / platform / "skill").rglob("*") if path.is_file()]
        paths += [REPO / "lib/policy/role-policy.json", fragments]
        scope_notation = W2_RULE_PINS["RP-708"]
        for path in paths:
            content = path.read_text()
            if path in planning_refs:
                before, anchor, after = content.partition('<a id="decision-inventory"></a>')
                content = before + anchor + after.replace(scope_notation, "", 1)
            if path == fragments:
                content = content.replace("Independently review only that scope", "", 1)
            for phrase in removed:
                with self.subTest(path=path.relative_to(REPO), phrase=phrase):
                    self.assertEqual(content.count(phrase), 0)

    def test_sj6_reviewed_spec_suffix(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                _, managed = self.planning_parts(platform)
                self.assert_rules(managed, (self.REVIEWED_SPEC,))

class ArchitecturalStartConfirmationTests(unittest.TestCase):
    PLATFORMS = ("claude", "codex", "gemini", "grok")
    START_ANCHOR = b'<a id="architectural-start-confirmation"></a>'
    INVENTORY_ANCHOR = b'<a id="decision-inventory"></a>'
    FULL_AUTO_GATE = "| Architectural start confirmation | auto |"
    MANAGED_RULES = (
        "Reuse the same Planner instance only within the design/brainstorming stage while its role, context and source remain valid, except that on the Architectural path that Planner continues as the spec Planner after start confirmation through a spec-stage delta brief; use a fresh Planner instance for each plan stage, and for an Architectural spec stage when that Planner is unavailable or its role, context or source is no longer valid, whose initial brief contains every required field, "
        + W2_RULE_PINS["RP-679"] + ".",
        "On the Architectural path the start summary receives no consolidated correction; Orchestrator checks its decision inventory and scope notation before presenting it, and the spec draft takes Orchestrator's review and direct revision.",
    )
    REMOVED_WORDING = (
        "Architectural approves design",
        "revised design approval",
        "After architectural design approval",
        "Obtain design approval before spec or plan drafting",
        "After design approval, the spec stage",
        "Approved design scope/evidence",
    )

    def reference(self, platform, name):
        return (REPO / platform / "skill/references" / f"{name}.md").read_bytes()

    def planning_parts(self, platform):
        planning = self.reference(platform, "planning")
        editorial, _, managed = planning.partition(b"[ARC role policy: contract begin]")
        return editorial, managed.partition(b"[ARC role policy: contract end]")[0]

    def test_start_confirmation_section_identical_on_every_platform(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                editorial, _ = self.planning_parts(platform)
                self.assertEqual(self.reference(platform, "planning").count(self.START_ANCHOR), 1)
                _, _, after_start = editorial.partition(self.START_ANCHOR)
                section, inventory, _ = after_start.partition(self.INVENTORY_ANCHOR)
                self.assertEqual(inventory, self.INVENTORY_ANCHOR)
                self.assertEqual(section.splitlines()[1:2], [b"### Architectural start confirmation"])

    def test_architectural_insertions_present(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform, rule=self.FULL_AUTO_GATE):
                planning = _effective(platform, "planning").encode()
                _, _, full_auto = planning.partition(b'<a id="full-auto-run-mode"></a>')
                _, header, table = full_auto.partition(b"| Gate | Full Auto | Rule |\n")
                self.assertTrue(header)
                rows = table.split(b"\n\n", 1)[0].splitlines()
                self.assertTrue(any(row.startswith(self.FULL_AUTO_GATE.encode()) for row in rows))

    def test_coordination_handoff_skill_wording(self):
        for platform in self.PLATFORMS:
            with self.subTest(platform=platform):
                self.assertIn("`design`", _effective(platform, "core"))

    def test_planner_brief_continuation_in_managed_section(self):
        for platform in self.PLATFORMS:
            _, managed = self.planning_parts(platform)
            planning = self.reference(platform, "planning")
            for rule in self.MANAGED_RULES:
                with self.subTest(platform=platform, rule=rule):
                    self.assertEqual(managed.count(rule.encode()), 1)
                    self.assertEqual(planning.count(rule.encode()), 1)

    def test_removed_design_approval_wording_absent(self):
        paths = [path for platform in self.PLATFORMS
                 for path in (REPO / platform / "skill").rglob("*.md")]
        paths += [REPO / "lib/policy/role-policy.json", REPO / "lib/prompts/agent-fragments.json"]
        for path in paths:
            text = path.read_text()
            for phrase in self.REMOVED_WORDING:
                if phrase in text:
                    with self.subTest(path=path.relative_to(REPO), phrase=phrase):
                        self.fail("Obsolete Architectural design approval wording")
