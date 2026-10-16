from __future__ import annotations
import hashlib, json, os, shutil, signal, subprocess, stat, sys, tempfile, tomllib, unittest
from pathlib import Path
from unittest.mock import patch
REPO = Path(__file__).resolve().parents[1]
TMP_ROOT = os.path.realpath(tempfile.gettempdir())
REFERENCE_NAMES = ("planning", "handoff", "handoff-prep", "handoff-worktree", "verification", "git-recovery",
                   "visual-companion", "commit")

HANDOFF_FILES = ("handoff", "handoff-prep", "handoff-worktree")

def policy_text(name: str) -> str:
    # "handoff" covers the whole handoff contract, which is split by trigger across HANDOFF_FILES.
    names = HANDOFF_FILES if name == "handoff" else (name,)
    paths = [REPO / "codex/skill" / ("SKILL.md" if n == "core" else f"references/{n}.md") for n in names]
    return " ".join(" ".join(path.read_text().lower().split()) for path in paths)

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
        core = policy_text("core")
        self.assertRegex(core, r"ceo.*accept.*task.*commit")
        self.assertRegex(core, r"without.*(?:additional|separate).*user.*commit.*approval")
        self.assertRegex(core, r"top.level task.*commit")
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"ceo verifies.*acceptance criteria.*required checks.*findings.*accepts.*task.*immediately.*local.*commit",
            r"one approved top-level task.*one focused implementation commit",
            r"immediately means.*next action.*git.*checks.*staging.*commit",
            r"plan.skip.*no new plan obligation",
        ))
        self.assertNotIn("optionally create", commit)

    def test_planner_groups_inseparable_changes_and_defines_task_gates(self) -> None:
        planning = self.section("planning", "## top-level plan tasks")
        profile = tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
        self.assertEqual(profile["sandbox_mode"], "read-only")
        planner = " ".join(profile["developer_instructions"].lower().split())
        self.assertIn("for each top-level task", planner)
        task_draft = planner.split("for each top-level task", 1)[1].split("for a genuinely visual", 1)[0]
        self.contracts(planning, (
            r"planner profile holds the full top-level task rules",
            r"id.*title.*scope.*files.*dependencies.*acceptance criteria.*required qa/focused checks.*evidence.*hold conditions",
            r"never list reviewer as a per-task required check",
            r"cannot be independently verified.*one task from the outset",
            r"final overall plan verification stated separately from task acceptance prerequisites",
        ))
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"substeps.*checkboxes.*not.*commit units",
            r"ceo.*accept.*without.*additional user commit approval",
        ))
        for artifact, text in (("planner", task_draft),):
            with self.subTest(artifact=artifact):
                self.contracts(text, (
                    r"id.*title.*scope.*files.*dependencies.*acceptance criteria.*required qa/focused checks.*evidence.*hold conditions",
                    r"never list reviewer as a per-task required check",
                    r"final.*plan verification.*single independent reviewer review of the final full change after all tasks are accepted with their risk-scaled checks",
                    r"cannot be independently verified.*one top-level task",
                    r"substeps.*checkboxes.*not.*commit units",
                    r"ceo.*accept.*without.*additional user commit approval",
                    r"final.*plan.*verification.*task.*prerequisites",
                ))

    def test_substeps_and_reports_do_not_replace_acceptance(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"substeps.*checkboxes.*not.*commit units",
            r"checkbox completion.*coder reports.*passing checks.*do not.*task acceptance",
            r"criteria.*conditions.*expected results.*actual evidence",
        ))

    def test_task_and_final_plan_verification_remain_distinct(self) -> None:
        verify = self.section("verification", "## task acceptance and final plan acceptance")
        self.contracts(verify, (
            r"task-local acceptance.*distinct from.*final plan.*acceptance",
            r"task acceptance and its focused commit require only.*risk-scaled coder/qa.*ceo focused checks",
            r"reviewer timing and task-boundary gates follow skill\.md risk-scaled execution",
            r"independently acceptable task.*do not delay.*later final plan verification",
            r"required.*task.*checks.*must not.*deferred",
            r"with a plan, the required final whole-change review is final plan verification",
            r"task commit.*does not.*unperformed.*verification.*complete",
        ))
        self.assertRegex(policy_text("core"), r"do not add per-task qa or review gates solely because a task boundary exists")

    def test_commit_blocks_on_scope_checks_findings_and_git_state(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        hold = commit.split("hold the task commit", 1)[-1].split("for a no-change task", 1)[0]
        self.contracts(hold, (
            r"unmet.*criteria.*required checks.*failed.*not run.*unresolved findings.*evidence gaps",
            r"scope expansion.*ownership.*staged.*mismatch.*workspace.*branch.*head.*git state",
            r"failure.*partial completion.*record.*reason.*next action",
            r"do not waive.*criteria.*required checks.*commit",
            r"explicit disposition follows existing policy and the evidence verdict",
            r"git failure.*actual branch.*head.*index.*working tree.*before retrying",
        ))
        self.contracts(commit, (
            r"same file.*other tasks.*user changes.*safe separation.*before committing",
            r"unrelated staged changes stop the commit under the preservation rule",
        ))
        assert_term_defined(self, "evidence verdict")
        assert_term_defined(self, "preservation rule")

    def test_commit_evidence_no_change_and_resume_are_explicit(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"before committing.*approved plan.*task id.*absolute workspace.*repository.*branch.*head.*staged/unstaged/untracked.*ownership",
            r"staged paths.*content.*finalized.*message",
            r"after committing.*sha.*actual message.*included paths.*content.*post-commit head.*branch.*remaining.*staged/unstaged/untracked",
            r"canonical record.*plan.*version.*task id.*acceptance evidence.*required checks.*findings.*commit.*remaining final plan verification",
            r"no-change task.*no empty commit.*acceptance evidence.*no change",
            r"resume.*verify.*sha.*content.*validity.*reuse.*do not duplicate",
            r"missing record.*actual result.*before.*retry",
        ))
        restart = self.section("handoff", "### choice lifetime and restart record")
        self.assertRegex(restart, r"normal authorized head and dirty-state changes, including accepted task commits.*do not by themselves invalidate the choice")
        gate = policy_text("handoff").split("### coder handoff gate", 1)[1].split("### handoff evidence", 1)[0]
        for item in (r"1\. all applicable design/spec/plan approvals are recorded",
                     r"2\. the user explicitly selected the execution target initially",
                     r"3\. the accessible absolute workspace is the intended git repository",
                     r"4\. actual branch or detached head, head, staged/unstaged/untracked state, preservation, and edit ownership are known",
                     r"5\. approved planning-document commits are verified",
                     r"6\. after any commit or branch operation, final path, branch, head, and change state are rechecked",
                     r"7\. the brief includes these preparation and final-verification facts"):
            with self.subTest(gate_item=item):
                self.assertRegex(gate, item)
        self.assertRegex(restart, r"task id.*commit sha.*current git state.*full handoff gate")

    def test_final_findings_use_followup_task_without_rewriting_commit(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        followup = commit.split("if final qa/reviewer findings", 1)[-1].split("this local", 1)[0]
        self.contracts(followup, (
            r"already committed.*ceo.*follow-up task.*required planning.*approvals.*correction.*qa reverification.*new focused commit",
            r"reviewer then rechecks only the affected findings when warranted",
            r"do not automatically amend/reset.*rerun.*original task.*duplicate commit",
        ))

    def test_document_batch_and_external_action_boundaries_remain(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        planning = self.section("planning", "### complete planning-document set")
        self.contracts(planning, (
            r"normal order: design approval.*written-spec approval.*individual approvals.*complete applicable set.*explicit execution-target choice.*batch commit.*final git verification.*coder handoff",
            r"while documents.*do not.*stage documents.*commit planning documents",
        ))
        self.contracts(commit, (
            r"local.*does not authorize early planning-document commits.*pre-coder.*batch.*unchanged",
            r"conventional commits.*korean description.*trailing period.*lowercase.*scope",
            r"historical spec/plan.*not.*retroactively",
            r"structural checks.*do not prove.*agent runtime",
        ))
        core = self.section("core", "## automatic commit after plan-task acceptance")
        self.assertRegex(core, r"push.*merge.*publish.*deploy.*install.*separate.*approval")

class ConditionalReferenceTests(unittest.TestCase):
    # User-approved static contract exception for this change only.
    # These checks do not establish consuming-agent runtime compliance.
    def test_core_requires_task_scoped_references(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"must read.*before.*dependent")
        self.assertRegex(core, r"missing.*conflicting.*ceo.*stop")
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                self.assertIn(f"references/{name}.md", core)
                self.assertTrue((REPO / f"codex/skill/references/{name}.md").is_file())
        self.assertRegex(core, r"do not load all references")

    def test_reference_triggers_cover_dependent_stages(self) -> None:
        core = policy_text("core")
        for name, trigger in (
            ("planning", r"design/plan-depth judgments.*spec/plan drafting or approval"),
            ("handoff", r"every coder first start/restart.*coder trusts the ceo-verified brief.*only brief-cited sections"),
            ("verification", r"verification design.*qa/reviewer.*correction rechecks.*ui acceptance"),
            ("git-recovery", r"branch collision.*git preparation failure.*partial completion.*metadata write denial"),
            ("visual-companion", r"visual companion offer or operation"),
            ("commit", r"plan-task acceptance.*focused commit"),
            ("handoff-prep", r"execution-target choice request.*each preparation git mutation"),
            ("handoff-worktree", r"^[^|]*\|[^|]*\|\s*after explicit new managed worktree selection, before its creation, branch work or document transfer\s*\|?$"),
        ):
            with self.subTest(reference=name):
                row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if f"references/{name}.md" in line)
                self.assertRegex(row, trigger)
        worktree_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                            if "references/handoff-worktree.md" in line)
        self.assertNotIn("choice request", worktree_row)
        self.assertNotIn("selection target", worktree_row)
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"new managed worktree.*selection target.*source absolute path.*repository.*git common directory.*branch or detached head.*verified full source head sha.*approved branch candidate.*collision status.*descriptive name.*approved document transfer/commit scope")
        self.assertRegex(gate, r"app chooses the actual destination path: do not ask the user for a destination path or propose one")
        self.assertRegex(gate, r"read \[handoff-worktree\.md\]\(handoff-worktree\.md\) only after the user explicitly selects that option and before its creation, branch work, or document transfer")
        self.assertNotRegex(policy_text("handoff-prep").split("## workspace handoff", 1)[0], r"choice request also read")
        self.assertRegex(policy_text("handoff-worktree").split("## workspace handoff", 1)[0], r"reads after the user explicitly selects the new managed worktree option, before its creation, branch work or document transfer")
        self.assertNotIn("before an execution-target choice request", policy_text("handoff-worktree").split("## workspace handoff", 1)[0])
        self.assertRegex(policy_text("handoff-worktree"),
                         r"verify final approved branch and head before document transfer, the batch docs commit, final git verification and coder handoff")
        self.assertRegex(policy_text("handoff"), r"new managed worktree and task branch \(selection target under handoff-prep\.md; contract in handoff-worktree\.md after selection\)")
        self.assertRegex(policy_text("planning").split("### managed worktree preparation", 1)[1], r"see \[handoff-worktree\.md\]\(handoff-worktree\.md\)")
        self.assertRegex(core, r"ceo.*each assigned role.*must read")
        self.assertRegex(core, r"ceo must include in the role brief the accessible path and section name of each reference section")

    def test_planning_order_and_recovery_protections_remain(self) -> None:
        planning = policy_text("planning")
        for contract in (
            r"normal order: design approval.*written-spec approval.*individual approvals.*complete applicable set.*explicit execution-target choice.*batch commit.*final git verification.*coder handoff",
            r"while documents.*do not request execution-checkout selection.*stage documents.*commit planning documents",
            r"architectural work always.*writing-plans.*written plan approval",
            r"skip planning only for one local change.*no dependent stages.*shared state.*lifecycle.*integration-order.*one focused verification path",
            r"changed approved documents require approval of the revised version",
            r"while documents.*do not.*worktree creation.*stage documents.*commit planning documents",
            r"normal order:.*complete applicable set.*explicit execution-target choice.*approved branch switch or worktree creation.*batch commit.*final git verification",
        ):
            self.assertRegex(planning, contract)
        recovery = policy_text("git-recovery")
        for contract in (
            r"denial of lock creation alone does not prove a stale lock",
            r"apply the preservation rule: do not delete lock files, use `chmod` or `chown`, bypass the sandbox, or move to another workspace",
            r"minimum escalation.*exact single git command and workspace.*never broad git access",
            r"before retrying.*branch.*head.*index.*partial completion",
            r"both operational failure and missing execution-target choice block handoff",
        ):
            self.assertRegex(recovery, contract)
        assert_term_defined(self, "preservation rule", "coder")

    def test_references_preserve_policy_contracts(self) -> None:
        contracts = {
            "planning": ("complete planning-document set", "written-spec approval", "individually approved"),
            "handoff": ("planning document commit", "unrelated staged", "approved-content verification"),
            "verification": ("criterion verdict", "ui browser acceptance checks", "whole-change review"),
            "git-recovery": ("git metadata write denial", "partial completion", "do not delete lock files"),
            "visual-companion": ("complete keyed url", "terminal text as primary", "waits for acceptance"),
        }
        for name, phrases in contracts.items():
            path = REPO / f"codex/skill/references/{name}.md"
            self.assertTrue(path.is_file(), name)
            for phrase in phrases:
                with self.subTest(reference=name, contract=phrase):
                    self.assertIn(phrase, policy_text(name))

    def test_core_preserves_role_and_risk_gates(self) -> None:
        core = policy_text("core")
        for contract in (r"all five roles.*directly to ceo.*depth 2",
                         r"coder.*independent qa", r"qa.*independent reviewer.*full change",
                         r"ordinary.*significant/high-risk.*not eligible",
                         r"explicit user or task-specific tdd request overrides"):
            self.assertRegex(core, contract)

    def test_coder_trusts_ceo_verified_brief(self) -> None:
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        for contract in (
            r"trust the ceo-verified workspace, branch/head, approvals.*document-commit and handoff facts in the brief.*start editing",
            r"do not independently re-verify checkout, branch, head, approval, or document evidence or ask ceo to reconfirm them",
            r"supplied absolute workspace.*never create or switch workspaces or branches.*apply the preservation rule",
            r"report to ceo only a conflict you actually hit while working.*assigned file has unexpected changes you did not make"
            r".*path is missing or inaccessible.*git or tool command fails.*git output shows a branch or state different from the brief",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(coder, contract)
        for absent in (r"independently verify", r"git common directory", r"every first start or restart",
                       r"fresh explicit choice", r"reuse the initial explicit choice", r"revalidates the full handoff gate"):
            with self.subTest(absent=absent):
                self.assertNotRegex(coder, absent)

    def test_coder_profile_holds_handoff_contract_without_full_reference_read(self) -> None:
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"profile is the complete coder handoff contract.*handoff.md.*only.*brief explicitly cites")
        self.assertNotRegex(coder, r"before every first start or restart, read")
        for phrase in ("trust the ceo-verified", "do not repair preparation"):
            self.assertIn(phrase, coder)
        self.assertRegex(policy_text("handoff"), r"coder trusts the ceo-verified facts in the brief.*coder profile.*brief explicitly cites")
        texts = {path.name: " ".join(path.read_text().lower().split()) for path in
                 [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]}
        for name, text in texts.items():
            for absent in (r"coder independently", r"coder's independent", r"coder independent check",
                           r"ceo and coder independently", r"independent checkout"):
                with self.subTest(file=name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_handoff_split_keeps_coder_start_file_to_start_and_restart_sections(self) -> None:
        def headings(name: str) -> list[str]:
            return [line[4:].strip().lower() for line in (REPO / f"codex/skill/references/{name}.md").read_text().splitlines()
                    if line.startswith("### ")]
        self.assertEqual(headings("handoff"), ["checkout approval", "coder handoff gate", "handoff evidence",
                                               "choice lifetime and restart record"])
        self.assertEqual(headings("handoff-prep"), ["execution-target request gate", "git mutation evidence gate",
                                                    "new task branch", "current checkout", "planning document commit",
                                                    "recovery prerequisite"])
        self.assertEqual(headings("handoff-worktree"), ["new managed worktree", "worktree document transfer"])
        core = (REPO / "codex/skill/references/handoff.md").read_text().lower()
        self.assertIn("handoff-prep.md", core)
        self.assertIn("handoff-worktree.md", core)

    def test_qa_and_reviewer_profiles_hold_contract_without_full_reference_read(self) -> None:
        for role in ("qa", "reviewer"):
            with self.subTest(role=role):
                text = " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                                ["developer_instructions"].lower().split())
                self.assertRegex(text, rf"profile is the complete {role} contract.*verification.md.*only.*brief explicitly cites")
        self.assertRegex(policy_text("verification"), r"qa and reviewer contracts.*profiles.*brief explicitly cites")
        reviewer = " ".join(tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())
                            ["developer_instructions"].lower().split())
        self.assertRegex(reviewer, r"significant/high-risk.*final full change after the required qa/focused checks and any qa recheck")

    def test_restart_choice_lifetime_and_evidence(self) -> None:
        path = REPO / "codex/skill/references/handoff.md"
        self.assertTrue(path.is_file())
        handoff = policy_text("handoff")
        cases = {
            "first start": r"first start.*explicit user choice",
            "same target": r"same approved scope.*workspace.*repository.*execution target.*reuse.*initial explicit choice",
            "fresh state": r"every first start and restart, ceo rechecks actual git state",
            "changed target": r"scope.*workspace.*repository.*target.*approved branch candidate.*changes.*fresh explicit choice",
            "invalidating failure": r"failure.*old target cannot be trusted.*fresh explicit choice",
            "normal work": r"normal.*head.*dirty.*do not.*invalidate",
            "record": r"one canonical initial handoff record.*accessible",
            "delta": r"delta-only restart brief \(delta relative to the record file the fresh coder reads; every other brief field in full\).*initial record.*next objective.*ownership.*approvals.*documents.*current git state",
            "block": r"inaccessible.*record.*missing evidence.*unclear ownership.*block",
        }
        for case, contract in cases.items():
            with self.subTest(case=case):
                self.assertRegex(handoff, contract)
        self.assertNotRegex(handoff, r"ceo and coder independently recheck")
        self.assertNotRegex(handoff, r"full handoff gate and independent checks")

class ReviewerOncePerPlanTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_final_single_reviewer_is_explicit(self) -> None:
        for name, text, contract in (
            ("core", policy_text("core"), r"reviewer is never a plan-task acceptance prerequisite; for significant work with a plan, it reviews the final full change once after all plan tasks are accepted with their risk-scaled checks, following the last plan task's required checks and any qa recheck at the final relevant state; significant work without a plan keeps reviewer after qa before acceptance"),
            ("verification", policy_text("verification"), r"reviewer timing and task-boundary gates follow skill\.md risk-scaled execution"),
            ("verification-cleanup", policy_text("verification"), r"verified ignore-pattern or metadata cleanup.*targets are unused.*required project materials are unaffected.*ignore patterns cover only intended paths.*diff matches the approved scope.*focused checks then suffice without automatically calling qa or reviewer"),
            ("verification-env", policy_text("verification"), r"an environment failure is distinct from a code failure.*report the exact limitation"),
            ("verification-pointer", policy_text("verification"), r"skill\.md risk-scaled execution holds the risk table, risk definitions, evidence-reuse rule, and role order"),
            ("planning", policy_text("planning"), r"never list reviewer as a per-task required check \(reviewer timing: skill\.md risk-scaled execution\)"),
            ("commit", policy_text("commit"), r"reviewer timing: skill\.md risk-scaled execution"),
            ("planner", profile_text("planner"), r"single independent reviewer review of the final full change after all tasks are accepted with their risk-scaled checks"),
        ):
            with self.subTest(artifact=name):
                self.assertRegex(text, contract)
        row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                   if line.startswith("| significant/high risk"))
        self.assertRegex(row, r"with a plan, each plan task risk-scaled coder → qa or ceo focused checks → acceptance/commit satisfies the qa step, then independent reviewer once on the final full change after all plan tasks")

    def test_no_per_task_reviewer_wording(self) -> None:
        paths = [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]
        for path in paths:
            text = " ".join(path.read_text().lower().split())
            with self.subTest(file=path.name, absent="accepted and qa'd"):
                self.assertNotIn("accepted and qa'd", text)
                self.assertNotIn("수락·QA된".lower(), text)
            for absent in (r"checks/reviews", r"in a multi-task plan", r"review as a task acceptance prerequisite",
                           r"expressly a task prerequisite", r"designated as that task's prerequisite",
                           r"qa/review at that dependency boundary", r"new reviewer for each task unless",
                           r"선행 조건으로 지정", r"검사/검토"):
                with self.subTest(file=path.name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_dependency_boundary_is_qa_only(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"depends on a still-unverified risky contract, complete applicable qa at that dependency boundary")
        self.assertNotRegex(core, r"qa/review at that dependency boundary")

    def test_final_reviewer_findings_on_committed_work(self) -> None:
        for name in ("verification", "commit"):
            with self.subTest(reference=name):
                self.assertRegex(policy_text(name), r"follow-up task.*correction.*qa re(?:check|verification).*new focused commit"
                                                    r".*reviewer then rechecks only the affected findings when warranted")

class ResearchRoutingAndBriefTests(unittest.TestCase):
    def test_codex_spawn_fork_and_user_input_policy(self) -> None:
        skill = " ".join((REPO / "codex/skill/SKILL.md").read_text().split())
        self.assertRegex(skill, r"Every specialist spawn sets `fork_turns=\"none\"`; full-history forks are not allowed")
        self.assertNotIn("When supported, start specialists", skill)
        self.assertIn("`request_user_input` questions use only `title` and `options` fields, never `question`", skill)

    def test_claude_native_role_and_ask_user_question_policy(self) -> None:
        skill = " ".join((REPO / "claude/skill/SKILL.md").read_text().split())
        self.assertIn("Always start an ARC role by its installed native name (`arc-*`) with only the supplied scoped brief; never use a context-inheriting fork (such as the `fork` subagent type) for an ARC role", skill)
        self.assertIn("do not claim fresh context isolation without evidence", skill)
        self.assertNotIn("When supported, start specialists", skill)
        self.assertIn("`AskUserQuestion` questions use only `question`, a `header` of at most 12 characters, 2-4 `options` each with `label` and `description`, and `multiSelect`", skill)

    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_research_routing_tiers(self) -> None:
        opening = policy_text("core").split("## ownership", 1)[0]
        self.assertRegex(opening, r"quick read of a few known files.*all other material research/analysis and bounded exploration \(read-only, of static code, documents, data, and logs/reports\) goes to scouter with its configured settings.*narrow brief.*known paths.*specific facts.*no synthesis")
        for gone in ("lighter effort", "when unsure", "under models"):
            self.assertNotIn(gone, opening)
        claude = " ".join((REPO / "claude/skill/SKILL.md").read_text().lower().split()).split("## ownership", 1)[0]
        self.assertRegex(claude, r"quick read of a few known files.*narrow brief.*known paths.*specific facts.*no synthesis")
        for gone in ("when unsure", "under models"):
            self.assertNotIn(gone, claude)

    def test_models_scouter_lookup_exception(self) -> None:
        models = policy_text("core").split("## models", 1)[1].split("after editing", 1)[0]
        self.assertIn("use configured settings without substitution; report unavailable settings", models)
        self.assertNotIn("reasoning_effort", models)
        self.assertNotIn("bounded scouter lookup", models)
        self.assertNotIn('reasoning_effort="medium"', policy_text("core"))

    def test_skill_not_reread_and_agents_body_wording(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"this skill file, once read in this context and unchanged, is not re-read on follow-up turns")
        body = node_agents_block_body()
        self.assertIn("keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed", body)
        self.assertNotIn("including relevant follow-up turns", body)

    def test_brief_template_field_order_and_delta(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"goal; criteria \(ids\); exact scope/ownership \(absolute workspace, branch or detached head and head, handoff record path, when one exists, files\); constraints/decisions; evidence \(paths/lines, commands, artifact links\); prior findings; exact next objective \(one bounded objective\); return format")
        self.assertRegex(tokens, r"follow-ups and restarts send only changed fields and mark the rest `unchanged`")
        self.assertRegex(tokens, r"`unchanged` means unchanged relative to a cited artifact the recipient can read \(the handoff record file or a brief it received\); a fresh specialist, including a fresh restart coder, gets every other field in full")
        for kept in (r"self-contained subset.*omit full history, repeated instructions, and raw logs",
                     r"one bounded objective",
                     r"conclusion, evidence locations, unresolved points, next step",
                     r"no findings may be brief; requested deliverables such as complete plan drafts remain complete",
                     r"cite paths/lines/pages/commands/links instead of logs; investigate gaps only"):
            with self.subTest(kept=kept):
                self.assertRegex(tokens, kept)

    def test_handoff_record_file_location(self) -> None:
        handoff = policy_text("handoff")
        for contract in (
            r"ceo writes it as a markdown file at `<git-common-dir>/arc/handoff/<plan-or-task-slug>\.md`",
            r"`git rev-parse --path-format=absolute --git-common-dir`.*outside the working tree.*shared by linked worktrees",
            r"not a git mutation, never staged or committed.*no secrets",
            r"absolute path in every brief.*delta restart briefs cite it",
            r"slug unique to the plan.*dated plan filename stem, or a spec/task slug when no plan exists.*never overwrite another plan's record",
            r"write is denied or unavailable, every coder brief carries the full record inline \(no delta, no record-file `unchanged`\) and states why; that inline record satisfies the accessible record requirement",
            r"do not delete it automatically",
            r"do not create a separate storage service",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(handoff, contract)
        self.assertRegex(policy_text("core"), r"records the canonical handoff state in the handoff record file")

class WholeSystemReviewFollowUpTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_case_qa_requirement_is_satisfied_by_task_checks(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"with a plan, each plan task risk-scaled coder → qa or ceo focused checks → acceptance/commit satisfies the qa step")
        verification = policy_text("verification")
        self.assertRegex(verification, r"significant/high-risk work requires independent review of the full change at the final relevant state after the required qa/focused checks and any qa recheck")
        self.assertNotIn("requires qa followed by independent review", verification)
        self.assertRegex(profile_text("reviewer"), r"review the final full change after the required qa/focused checks and any qa recheck")

    def test_planning_points_to_common_handoff_gate(self) -> None:
        planning = policy_text("planning")
        self.assertIn("the common handoff gate in skill.md and handoff.md", planning)
        self.assertNotIn("the complete the common handoff gate", planning)
        self.assertNotIn("`workspace handoff` gate below", planning)

    def test_config_comment_matches_subagent_limit(self) -> None:
        config = (REPO / "codex/config.toml").read_text()
        self.assertIn("at most four simultaneous subagents", config)
        self.assertNotIn("one owner plus three specialists", config)

    def test_reviewer_description_has_no_team_name(self) -> None:
        description = tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())["description"]
        self.assertNotIn("Yunho Team", description)

    def test_fallback_record_inline_and_slug(self) -> None:
        handoff = policy_text("handoff")
        self.assertRegex(handoff, r"no delta, no record-file `unchanged`")
        self.assertRegex(handoff, r"or a spec/task slug when no plan exists")

    def test_coder_reads_record_for_unchanged_fields(self) -> None:
        self.assertRegex(profile_text("coder"), r"read the cited handoff record file for fields marked `unchanged`")

class PolicyWordBudgetTests(unittest.TestCase):
    def test_policy_text_stays_within_word_budget(self) -> None:
        counts = policy_word_counts(REPO)
        self.assertEqual(sorted(counts), sorted(POLICY_WORD_CEILINGS),
                         "every policy file needs a word ceiling in POLICY_WORD_CEILINGS")
        advice = "raise the ceiling only deliberately in the same change that justifies the growth"
        for name, words in counts.items():
            with self.subTest(file=name):
                self.assertLessEqual(words, POLICY_WORD_CEILINGS[name],
                                     f"{name}: {words} words exceeds ceiling {POLICY_WORD_CEILINGS[name]}; {advice}")
        for prefix, ceiling in (("codex/", POLICY_WORD_TOTAL_CEILING), ("claude/", CLAUDE_POLICY_WORD_TOTAL_CEILING)):
            total = sum(words for name, words in counts.items() if name.startswith(prefix))
            self.assertLessEqual(total, ceiling,
                                 f"{prefix} total: {total} words exceeds ceiling {ceiling}; {advice}")

class SharedTermsTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_core_defines_shared_terms(self) -> None:
        core = policy_text("core").replace("*", "")
        self.assertIn("## shared terms", core)
        terms = core.split("## shared terms", 1)[1].split(" ## ", 1)[0]
        for term, body in SHARED_TERMS.items():
            with self.subTest(term=term):
                self.assertIn(f"{term}: {body}", terms)

    def test_profiles_carry_terms_used_in_citable_sections(self) -> None:
        for role, terms in (("coder", ("preservation rule", "explicit choice", "stop and inspect")),):
            for term in terms:
                with self.subTest(role=role, term=term):
                    self.assertIn(f"{term}: {SHARED_TERMS[term]}", profile_text(role))
        # QA/Reviewer (verification) and Planner (planning) profiles do not define the terms, so those
        # references must not use them.
        for name in ("verification", "planning"):
            for term in SHARED_TERMS:
                with self.subTest(reference=name, term=term):
                    self.assertNotIn(term.capitalize(), raw_policy_text(name))

    def test_qa_fix_restorations(self) -> None:
        coder = profile_text("coder")
        for phrase in ("do not repair preparation by changing permissions, deleting locks, bypassing the sandbox, "
                       "committing, creating/switching branches, or moving workspaces",
                       "if risk is or becomes unclear or scope expands, stop and ask ceo to reclassify",
                       "stop dependent work and report the observed state and required next action to ceo"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, coder)
        core = policy_text("core")
        self.assertIn("substantial behavior or contract changes are significant regardless of file count", core)
        self.assertIn("coder repair limits are in the coder profile", core)
        self.assertRegex(policy_text("handoff"), r"one canonical initial handoff record.*repository/workspace identity")
        reviewer = profile_text("reviewer")
        self.assertIn("for development work, functional and test verification belongs to qa and completion remains with "
                      "ceo; ceo decides overall completion within its assigned scope", reviewer)

    def test_term_usage_sites(self) -> None:
        for name, heading, term in (
            ("handoff", "### checkout approval", "explicit choice"),
            ("handoff-prep", "### execution-target request gate", "explicit choice"),
            ("handoff-prep", "### git mutation evidence gate", "preservation rule"),
            ("handoff-prep", "### planning document commit", "preservation rule"),
            ("handoff-prep", "### planning document commit", "stop and inspect"),
            ("git-recovery", "### git metadata write denial", "preservation rule"),
            ("git-recovery", "### existing changes and failures", "preservation rule"),
            ("git-recovery", "### worktree failures and partial completion", "preservation rule"),
            ("git-recovery", "### worktree failures and partial completion", "stop and inspect"),
            ("commit", "## automatic commit after plan-task acceptance", "preservation rule"),
            ("commit", "## automatic commit after plan-task acceptance", "evidence verdict"),
            ("core", "## risk-scaled execution", "evidence verdict"),
        ):
            with self.subTest(reference=name, section=heading, term=term):
                text = raw_policy_text(name)
                self.assertIn(heading, text.lower())
                section = text[text.lower().index(heading) + len(heading):]
                for boundary in (" ## ", " ### "):
                    section = section.split(boundary, 1)[0]
                self.assertIn(f"the {term.capitalize()}", section)

class ARCPreactionGateTests(unittest.TestCase):
    # Specifically approved structural contract checks, not consuming-agent runtime tests.
    def test_preaction_role_precedence(self) -> None:
        core = policy_text("core").split("## instruction and execution adapter")[1].split("## mandatory task references")[0]
        self.assertRegex(core, r"brainstorming.*role.*save.*early.*commit.*arc")
        planning = policy_text("planning").split("### document-save evidence gates")[0]
        self.assertIn("ceo must not substitute an independently authored spec", planning)
        self.assertRegex(planning, r"planner.*complete spec draft and self-review.*ceo integrates, saves, self-reviews")
        self.assertRegex(planning, r"bounded written spec.*existing ceo depth judgment.*planner.*proportional complete spec draft.*self-review.*ceo.*individual written-spec approval")
        planner = " ".join(tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
                           ["developer_instructions"].lower().split())
        self.assertRegex(planner, r"complete spec draft and self-review.*ceo integrates/saves/self-reviews")

    def test_preaction_document_save_evidence(self) -> None:
        planning = policy_text("planning")
        self.assertIn("### document-save evidence gates", planning)
        gates = planning.split("### document-save evidence gates")[1].split("### complete planning-document set")[0]
        spec, plan = gates.split("**plan save:**")
        with self.subTest(path="architectural"):
            self.assertIn("first architectural spec save", spec)
            for phrase in ("approved design scope", "approval evidence", "planner's complete spec draft",
                           "self-review", "ceo's integration/save/review responsibility", "absolute save path"):
                self.assertIn(phrase, spec)
        with self.subTest(path="bounded_required_spec"):
            for phrase in ("first required bounded written spec save", "existing ceo depth judgment",
                           "approved short design", "spec-necessity rationale and scope", "proportional complete draft",
                           "self-review", "ceo's integration/save/review responsibility", "individual written-spec approval"):
                self.assertIn(phrase, spec)
        with self.subTest(path="short_design_distinction"):
            self.assertRegex(spec, r"saving or approving the short design does not replace.*required spec.*drafting.*self-review.*individual approval")
        with self.subTest(path="spec_approval_order"):
            self.assertRegex(spec, r"architectural and required bounded specs.*approved versions.*applicable document set")
            self.assertRegex(spec, r"written-spec approval.*before dependent plan drafting and execution preparation")
        with self.subTest(path="save_without_circular_approval"):
            self.assertIn("does not require written-spec approval or execution-target choice", spec)
        complete = planning.split("### complete planning-document set")[1].split("### evidence refresh and limits")[0]
        rows = {line.split("|")[1].strip().lower(): " ".join(line.lower().split())
                for line in (REPO / "codex/skill/references/planning.md").read_text().splitlines()
                if line.startswith("| ") and len(line.split("|")) >= 4}
        with self.subTest(path="bounded_plan_required_without_spec"):
            self.assertIn("a required plan does not itself require a written spec", complete)
            self.assertIn("only when the existing ceo depth judgment requires it", rows["bounded, plan required"])
        for path, row, contract in (
            ("spike", "spike probe", "do not force specs/plans for still-unknown implementation"),
            ("bounded_plan_skip", "bounded, plan skipped", "approve the short design"),
            ("nonbehavior", "non-behavior documentation/configuration", "why design/planning stages are inapplicable"),
        ):
            with self.subTest(path=path):
                self.assertIn(contract, rows[row])
                self.assertIn("no new spec obligation", rows[row])
        with self.subTest(path="plan_save"):
            for phrase in ("approved design", "approved written-spec version", "plan-depth", "dependencies",
                           "planner's complete plan draft", "self-review", "absolute save path"):
                self.assertIn(phrase, plan)
            self.assertRegex(plan, r"missing.*mismatched.*stop.*save.*ceo")

    def test_preaction_reference_and_choice_order(self) -> None:
        rows = (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
        planning = next(row for row in rows if "references/planning.md" in row)
        handoff = next(row for row in rows if "references/handoff-prep.md" in row)
        self.assertIn("first spec/plan save", planning)
        for trigger in ("execution-target choice request", "each preparation git mutation"):
            self.assertIn(trigger, handoff)
        self.assertIn("### execution-target request gate", policy_text("handoff"))
        choice = policy_text("handoff").split("### execution-target request gate")[1].split("### git mutation evidence gate")[0]
        for phrase in ("complete document list", "absolute paths", "approved versions", "individual approval evidence",
                       "dependencies", "no unfinished applicable documents"):
            self.assertIn(phrase, choice)
        self.assertRegex(choice, r"unfinished.*missing approval.*stop.*request")
        self.assertIn("do not require choice evidence before asking for that choice", choice)
        self.assertIn("required artifacts, not a spec on every path", choice)

    def test_preaction_git_evidence_and_batch_order(self) -> None:
        handoff = policy_text("handoff")
        self.assertIn("### git mutation evidence gate", handoff)
        gate = handoff.split("### git mutation evidence gate")[1].split("### ", 1)[0]
        for phrase in ("before each", "branch creation/switch", "worktree creation", "staging", "commit", "complete approved document set",
                       "explicit execution-target choice", "absolute workspace", "repository", "branch or detached head",
                       "staged/unstaged/untracked", "preservation", "ownership", "command", "target paths",
                       "unresolved failure", "read-only"):
            with self.subTest(evidence=phrase):
                self.assertIn(phrase, gate)
        planning = policy_text("planning").split("### complete planning-document set")[1]
        self.assertRegex(planning, r"defers.*brainstorming.*commit the spec.*written-spec review")
        self.assertIn("spec steps apply only to architectural and required bounded specs", planning)
        commit = handoff.split("### planning document commit")[1].split("### recovery prerequisite")[0]
        for contract in (r"reuse valid commits without recommitting", r"batch all remaining uncommitted approved documents",
                         r"staged paths and staged diff match exactly", r"finalizes.*message before the first commit",
                         r"after success verify sha.*post-commit head.*final branch"):
            self.assertRegex(commit, contract)

    def test_preaction_stop_and_runtime_limits(self) -> None:
        planning = policy_text("planning")
        self.assertIn("### evidence refresh and limits", planning)
        limits = planning.split("### evidence refresh and limits")[1]
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
        assert_term_defined(self, "preservation rule", "coder")

class CeoDirectPathTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def direct(self) -> str:
        core = policy_text("core")
        self.assertIn("## ceo direct path for small tasks", core)
        return core.split("## ceo direct path for small tasks", 1)[1].split(" ## ", 1)[0]

    def test_direct_path_eligibility_is_small_low_risk_and_plan_skip(self) -> None:
        for contract in (
            r"without planner brainstorming or coder",
            r"every small, low-risk criterion holds",
            r"every plan-skip criterion.*one local change.*no dependent stages.*shared state.*lifecycle.*integration-order.*one focused verification path",
            r"no significant-risk trigger",
            r"spike, architectural, ordinary-behavior, significant/high-risk, unclear-risk.*not eligible",
            r"overlapping.*coder.*not eligible",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)
        self.assertRegex(policy_text("core"), r"small, low risk means narrow, understood, readily reversible, and verifiable by focused checks")

    def test_direct_path_keeps_approval_handoff_tdd_and_verification(self) -> None:
        for contract in (
            r"before editing.*records.*scope.*files.*why every criterion holds.*acceptance criteria.*focused verification",
            r"presents.*short design.*user.*explicit approval",
            r"silence.*not approval",
            r"passes the coder handoff gate in handoff, with the approved short design as the applicable approval, before the first edit",
            r"edits only the approved files, preserves others' edits.*surgical edits.*without unrelated refactoring.*does not install dependencies without authorization",
            r"records the changed files",
            r"corrections for a failed focused check or a qa finding stay within the approved files",
            r"behavior edits follow coder tdd and constraints; when tdd applies, ceo follows installed `test-driven-development`",
            r"focused checks.*each acceptance criterion.*evidence.*unverified scope",
            r"not independent of its own edit",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)
        tdd = policy_text("core").split("## coder tdd and constraints", 1)[1].split(" ## ", 1)[0]
        self.assertRegex(tdd, r"explicit user or task-specific tdd request overrides this waiver.*do not claim tdd was followed")
        self.assertRegex(policy_text("handoff"), r"before a ceo direct edit, ceo verifies the same conditions, with the approved short design as the applicable approval")

    def test_direct_path_stops_and_reclassifies_without_reverting(self) -> None:
        for contract in (
            r"scope expands.*risk becomes unclear.*criterion stops holding.*stops editing.*records the changes.*reclassif",
            r"normal planner/coder flow.*coder owning subsequent edits",
            r"do not automatically revert, reset, stash, or clean",
            r"no automatic task commit.*applicable guidance and user requests",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)

    def test_ownership_and_flows_name_the_direct_path_exception(self) -> None:
        core = policy_text("core")
        ownership = core.split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"ceo does not edit them directly except under the ceo direct path")
        self.assertRegex(core, r"ceo assigns edits exclusively to coder except under the ceo direct path")
        row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                   if line.startswith("| small, low risk"))
        self.assertIn("ceo direct path", row)
        gate = core.split("## common handoff gate", 1)[1].split("## coder tdd", 1)[0]
        self.assertRegex(gate, r"same conditions.*before a ceo direct edit")
        planning = policy_text("planning")
        self.assertRegex(planning, r"never runs brainstorming itself except under the ceo direct path")
        self.assertRegex(planning, r"approve a short design before coder or a ceo direct edit")
        self.assertRegex(policy_text("verification"), r"exclusively to coder.*except under the ceo direct path")
        self.assertRegex(policy_text("handoff"), r"ceo direct edit.*same.*conditions")
        handoff_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if "references/handoff.md" in line)
        self.assertIn("ceo direct edit", handoff_row)

class CoderBriefAndReuseTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_fresh_coder_per_top_level_task(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"starts? a fresh coder for\s*each top-level task")
        self.assertRegex(core, r"reuse the current coder only for corrections, rework, or rechecks of the same task")
        self.assertNotRegex(core, r"may reuse coder while the approved scope")
        self.assertRegex(core, r"coder reuse follows the per-task rule")
        self.assertRegex(core, r"fresh coder for the next task in the same approved scope is a restart under handoff.*reuses a still-valid initial execution-target choice.*fresh state checks.*delta-only restart brief \(delta relative to the record file the fresh coder reads; every other brief field in full\)")
        self.assertRegex(core, r"before sending corrections or rework to a reused coder, ceo rechecks workspace, branch/head and change state against the brief")

    def test_coder_briefs_cite_sections_instead_of_whole_documents(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"coder briefs.*plan/spec path.*task section's line range.*needed excerpts.*do not ask coder to read whole plans or specs")
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"read plan/spec documents only in the sections the brief cites")

    def test_loader_keeps_subagents_on_profiles(self) -> None:
        body = node_agents_block_body()
        self.assertIn("ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.", body)

class LongTaskTokenTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_amendment_restarts_coder(self) -> None:
        self.assertRegex(policy_text("core"), r"after an approved plan or acceptance-criteria amendment, start a fresh coder for the remaining work even within the same task.*restart under handoff.*delta brief")

    def test_long_running_commands_are_not_polled_with_sleep(self) -> None:
        self.assertRegex(policy_text("core"), r"do not poll long-running commands with repeated `sleep`.*single blocking wait")
        coder = " ".join(tomllib.loads((REPO / "codex/agents/arc-coder.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(coder, r"do not poll long-running commands with repeated `sleep`.*single blocking wait.*longest.*report.*ceo")

    def test_ceo_recommends_new_session_per_plan(self) -> None:
        self.assertRegex(policy_text("core"), r"when a plan completes or before starting another plan.*records the canonical handoff state.*recommends.*new session")

class TokenDisciplineTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_core_waits_without_polling_and_batches_messages(self) -> None:
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
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
        tokens = policy_text("core").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
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
        for role in ("scouter", "planner", "coder", "qa", "reviewer"):
            with self.subTest(role=role):
                text = " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                                ["developer_instructions"].lower().split())
                self.assertRegex(text, r"read only needed file ranges.*keep command output short.*do not re-read unchanged files")

class RolePolicyTests(unittest.TestCase):
    # Approved package-consistency checks; these do not execute agent runtime behavior.
    def test_role_profiles_report_to_ceo_without_nested_delegation(self) -> None:
        for role in ("scouter", "planner", "coder", "qa", "reviewer"):
            with self.subTest(role=role):
                profile = tomllib.loads((REPO / "codex/agents" / f"arc-{role}.toml").read_text())
                self.assertEqual(profile["name"], f"arc_{role}")
                instructions = " ".join(profile["developer_instructions"].lower().split())
                self.assertRegex(instructions, r"report(?:s)? directly to (?:the )?ceo")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:create|spawn) (?:agents|subagents)")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:delegate|assign) (?:work|tasks)")
    def test_role_policy_assigns_development_to_ceo(self) -> None:
        policy = " ".join((REPO / "codex/skill/SKILL.md").read_text().lower().split())
        ownership = policy.split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"ceo.*sole owner.*development, configuration, tests")
        self.assertRegex(ownership, r"coder.*(?:edits|implements).*assigned.*files")
        self.assertRegex(ownership, r"all five roles.*directly to ceo.*depth 2")
        self.assertRegex(ownership, r"at most four.*subagents.*including scouter")
        self.assertRegex(ownership, r"scouter.*read.only")

    def test_scouter_read_only_scope_and_reporting(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-scouter.toml").read_text())
        self.assertEqual(profile["name"], "arc_scouter")
        self.assertEqual(profile["sandbox_mode"], "read-only")
        instructions = " ".join(profile["developer_instructions"].lower().split())
        for phrase in ("research", "analysis", "static", "code", "documents", "data", "evidence",
                       "unresolved", "do not edit files", "standalone document", "operational cleanup"):
            self.assertIn(phrase, instructions)

    def test_standalone_document_writing_has_no_specialist_auto_route(self) -> None:
        self.assertIn("standalone document writing has no specialist auto-route", policy_text("core"))

    def test_active_references_use_five_role_contract(self) -> None:
        for name in ("core", "handoff", "planning", "verification"):
            text = policy_text(name)
            for old in ("arc_secretary", "arc_scout`", "secretary", "all six roles"):
                self.assertNotIn(old, text)

    def test_qa_ui_browser_acceptance_contract(self) -> None:
        qa = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-qa.toml").read_text()
        )["developer_instructions"].lower().split())
        policy = policy_text("verification")
        ui_section = policy.split("### ui browser acceptance checks", 1)[1].split("###", 1)[0]
        for contract in (
            r"only when.*assigned ui.*brief.*workspace.*existing launch command or url.*account.*test.data.*permitted interactions",
            r"approved test environment.*launch.*open.*approved browser tools",
            r"tool instructions.*applicable installed browser skill",
            r"does not authorize.*editing.*dependencies.*environment configuration",
            r"missing prerequisites.*ceo.*unverified",
            r"command or url.*test state.*viewport.*not applicable.*interaction steps.*expected.*observed.*accessible evidence",
            r"startup.*page load.*static checks.*do not prove.*ui behavior",
            r"unavailable.*environment.*browser tools.*exact limitation.*unverified",
            r"clean up only.*created.*processes.*sessions.*preserve.*shared",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(ui_section, contract)
        self.assertRegex(ui_section, r"when assigning ui acceptance criteria, ceo cites this section with its accessible path in the qa brief")
        for contract in (
            r"only when assigned ui acceptance criteria and the brief cites the `ui browser acceptance checks` section of the installed arc `references/verification\.md`, read that section and follow it before launching an app or using browser tools",
            r"otherwise do not launch apps or operate browsers for ui acceptance",
            r"report the missing citation/prerequisites to ceo.*affected criteria unverified",
        ):
            with self.subTest(qa_contract=contract):
                self.assertRegex(qa, contract)
        for removed in ("viewport", "interaction steps", "clean up only"):
            self.assertNotIn(removed, qa)
        self.assertRegex(policy, r"visual companion.*design discussion.*distinct from.*qa.*ui acceptance")

    def test_qa_reporting_contract(self) -> None:
        instructions = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-qa.toml").read_text()
        )["developer_instructions"].lower().split())
        for contract in (
            r"every acceptance criterion.*identifier.*original wording",
            r"method.*scope.*run status.*accessible evidence.*criterion verdict.*unverified reason",
            r"run status.*passed.*failed.*not run.*environment blocked",
            r"criterion verdict.*proven.*unmet.*unverified",
            r"passing.*alone.*does not prove",
            r"partial.*out.of.scope.*missing checks.*environment.*unverified",
            r"after a fix.*defect reproduction path.*invalidated.*resolved.*unresolved.*unverified",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(instructions, contract)

    def test_reviewer_finding_handoff(self) -> None:
        instructions = " ".join(tomllib.loads(
            (REPO / "codex/agents/arc-reviewer.toml").read_text()
        )["developer_instructions"].lower().split())
        for contract in (
            r"behavior.*finding.*criterion.*expected behavior.*observed problem.*source.*reproduction conditions.*steps.*evidence",
            r"source.inferred.*execution.observed",
            r"ceo.*coder.*qa.*recheck",
            r"do not.*run qa tests",
            r"structure.*design.*factual.*security",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(instructions, contract)

    def _workspace_handoff_section(self, title: str) -> str:
        handoff = policy_text("handoff") + " " + policy_text("git-recovery")
        self.assertIn(f"### {title.lower()}", handoff)
        return handoff.split(f"### {title.lower()}", 1)[1].split("### ", 1)[0]

    def _assert_workspace_handoff_contracts(
        self, title: str, contracts: tuple[str, ...]
    ) -> None:
        section = self._workspace_handoff_section(title)
        for contract in contracts:
            with self.subTest(section=title, contract=contract):
                self.assertRegex(section, contract)

    def test_workspace_handoff_requires_scoped_checkout_approval(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Checkout approval",
            (
                r"before every coder first start and restart",
                r"after applicable design/spec/plan approvals.*explicit user choice.*current checkout.*new task branch.*new managed worktree and task branch",
                r"explicit user choice for the first start under the explicit choice rule: use the current checkout",
            ),
        )
        assert_term_defined(self, "explicit choice", "coder")
        self.assertRegex(policy_text("handoff"), r"\(selection target under handoff-prep\.md;")
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"present the verified absolute workspace, current branch or detached head, base head, and any validated new-branch candidate")

    def test_workspace_handoff_current_checkout_requires_explicit_choice(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Current checkout",
            (
                r"only after the user explicitly selects the current checkout for this handoff",
                r"confirm.*absolute workspace.*branch.*detached head.*head.*existing changes",
                r"preservation and edit ownership.*choice evidence.*brief",
                r"missing choice.*unconfirmed state.*unclear ownership blocks handoff",
            ),
        )

    def test_workspace_handoff_reapproves_changed_targets(self) -> None:
        self._assert_workspace_handoff_contracts(
            "New task branch",
            (
                r"recheck.*workspace.*branch.*base head.*candidate.*before",
                r"approval target.*changes.*explicit user approval",
                r"candidate.*changes.*approval.*before.*creat.*switch",
                r"without that approval, block handoff.*current checkout only after the user explicitly selects it for this handoff",
                r"lookup error.*missing branch",
            ),
        )

    def test_workspace_handoff_preserves_branch_collision_rules(self) -> None:
        self._assert_workspace_handoff_contracts(
            "New task branch",
            (
                r"valid git branch name.*`<type>/<short-kebab-case-topic>`",
                r"lowercase prefix.*lowercase kebab-case topic with no spaces",
                r"validate the name.*check for collisions before creation",
                r"base name exists.*append `-2`, `-3`.*increasing numeric suffixes.*first unused name",
                r"never reuse, delete, or overwrite an existing branch",
            ),
        )

    def test_managed_branch_selection_order_and_collision_reuse(self) -> None:
        section = self._workspace_handoff_section("New managed worktree")
        self.assertRegex(section, r"before.*create_worktree.*approved branch candidate.*collision")
        self.assertRegex(section, r"registration.*attachment.*base.*before.*approved branch")
        self.assertRegex(section, r"same base.*not checked out in any worktree.*reuse")
        self.assertRegex(section, r"collision.*new explicit choice")

    def test_workspace_handoff_preserves_existing_changes(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Existing changes and failures",
            (
                r"existing staged, unstaged, and untracked changes.*preservation and edit ownership.*brief",
                r"apply the preservation rule and do not automatically commit or delete changes",
                r"only the approved docs commit.*all three paths.*exception.*preserve all unrelated dirty files",
                r"existing changes prevent switching.*stop handoff until ceo resolves the state and scope",
            ),
        )
        assert_term_defined(self, "preservation rule")

    def test_workspace_handoff_failures_do_not_fallback(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Existing changes and failures",
            (
                r"branch creation.*switch.*failure.*actual git state.*stop coder handoff",
                r"created.*without.*successful switch.*partial completion",
                r"do not.*automatically.*(?:fall back|fallback).*current checkout",
                r"both operational failure and missing execution-target choice block handoff",
                r"do not.*automatically delete",
            ),
        )

    def test_workspace_handoff_commits_approved_plan_docs_before_coder(self) -> None:
        handoff = policy_text("handoff") + " " + policy_text("git-recovery")
        self._assert_workspace_handoff_contracts(
            "Planning document commit",
            (
                r"new task branch.*successful switch.*branch.*path",
                r"new worktree.*verify.*worktree.*document transfer.*before.*commit",
                r"current checkout.*verify.*selected branch.*detached head.*path.*existing changes",
                r"ceo verifies each approved spec/plan already committed.*sha.*message.*paths.*content.*approved version.*reuse.*without recommitting",
                r"approved documents still uncommitted.*ceo.*finalizes.*message before the first commit.*stages only those documents.*before handoff",
            ),
        )
        for contract in (
            r"include the docs commit sha.*actual message.*included paths.*approved-content verification",
            r"never include implementation files.*this commit is not implementation acceptance",
            r"do not push.*separate.*user.*request",
            r"docs commit fails or staged content differs.*stop handoff.*branch.*head.*index.*partial completion",
            r"skip this commit only when no planning documents were required and none were produced.*design/plan depth rules.*record.*depth rationale.*uncommitted documents cannot be treated as absent",
            r"do not automatically.*(?:unstage|reset).*unrelated",
            r"only.*approved.*docs commit.*exception",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(handoff, contract)

    def test_workspace_handoff_worktree_scoped_choice_and_base(self) -> None:
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"selection target.*source absolute path.*repository.*common directory.*branch or detached head.*full.*sha.*approved branch candidate.*collision.*name.*approved document")
        self.assertRegex(gate, r"verif.*validates the approved branch candidate and collision status.*new task branch naming rules.*unrelated staged changes.*head/index/working-tree state.*before offering")
        self.assertRegex(gate, r"do not ask the user for a destination path.*do not fetch or substitute a remote head or default branch")
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"selection target is the one verified under the execution-target request gate in handoff-prep\.md",
            r"verified source head.*do not.*remote.*default branch.*fetch",
            r"recheck.*source state.*base sha.*approved branch.*name.*after choice.*immediately before the tool call",
            r"after selection and before creation.*changes.*fresh explicit choice",
        ))
        section = self._workspace_handoff_section("New managed worktree")
        self.assertNotIn("before and after choice", section)
        self.assertNotIn("descriptive name, and approved document transfer/commit scope", section)

    def test_workspace_handoff_managed_worktree_inputs_and_results(self) -> None:
        section = self._workspace_handoff_section("New managed worktree")
        for phrase in ("mcp__codex_app__create_worktree", "allowasync: true", "name", "ref",
                       "full sha", "descriptive", "no destination path or branch", "collision",
                       "git switch -c <approved-branch> <ref>", "git switch <approved-branch>",
                       "same base", "not checked out in any worktree"):
            self.assertIn(phrase, section)
        self.assertNotIn("../<repo>-<topic>-worktree", section)
        self.assertNotIn("git worktree add -b <branch> <absolute-path> <base-sha>", section)
        self.assertRegex(section, r"registration.*attachment.*base.*before.*approved branch")

    def test_workspace_handoff_worktree_creation_and_identity(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"mcp__codex_app__create_worktree.*allowasync: true.*name.*ref",
            r"returned.*absolute.*path.*current.chat.*attachment",
            r"initial branch or detached head.*approved branch.*final branch.*head.*ref",
            r"linked-worktree registration.*common directory.*dirty state.*source.*branch.*head.*index.*files",
            r"\.git.*file.*do not.*same top-level.*identity",
            r"unexpected branch.*stop",
        ))

    def test_workspace_handoff_managed_worktree_async_attachment_and_no_fallback(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"operationid.*mcp__codex_app__get_worktree_creation_status.*completed",
            r"progress.*not.*success",
            r"registration failure.*only.*returned workspace.*mcp__codex_app__attach_worktree",
            r"before.*managed.*current.chat attachment.*approved branch.*no document transfer.*staging.*commit.*coder",
            r"unavailable.*reattachment.*mismatch.*stop.*record",
            r"do not.*raw git.*other name/ref/path/branch.*cleanup.*delete.*prune.*archive",
        ))

    def test_workspace_handoff_worktree_source_dirty_states(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"untracked approved.*source head.*index.*absent.*working-tree bytes.*latest approved",
            r"tracked approved.*index blob and mode.*source head.*working-tree bytes.*latest approved",
            r"approved working-tree revisions may differ.*head/index.*do not.*staging",
            r"unrelated staged.*required uncommitted implementation.*unclear ownership.*block",
            r"do not automatically.*stash.*commit.*reset.*clean.*unstage.*dirty implementation",
        ))

    def test_workspace_handoff_worktree_document_transfer(self) -> None:
        self._assert_workspace_handoff_contracts("Worktree document transfer", (
            r"target head.*selected source base sha",
            r"only uncommitted approved spec/plan.*same repository-relative path",
            r"do not move, delete, or modify.*source",
            r"outside.*worktree.*symlink.*stop",
            r"clean base.*index.*working-tree bytes.*base version.*replace.*approved version",
            r"absent from base.*absent.*destination",
            r"unexpected changes.*do not overwrite.*stop",
            r"after transfer.*bytes.*approved version.*canonical record.*source.*target.*relative path",
        ))

    def test_workspace_handoff_worktree_docs_commit_order(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Planning document commit',
            (
                r'new worktree.*verify.*worktree.*document transfer.*before.*commit',
                r'target.*remaining.*once.*do not.*source.*commit',
                r'base sha.*post-commit head',
            ),
        )

    def test_workspace_handoff_worktree_partial_completion(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Worktree failures and partial completion',
            (
                r'creation.*registration.*attachment.*identity.*checkout.*document transfer.*staging.*commit.*failure.*stop.*handoff',
                r'branch-only.*partial path.*registration.*wrong base.*partial document',
                r'source.*target.*command.*error.*branch.*head.*common directory.*registration.*index.*files',
                r'do not.*fallback.*retry.*delete.*prune.*--force.*-b',
                r'before.*retry.*actual state.*completed work',
            ),
        )

    def test_workspace_handoff_worktree_roles_and_restart(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Handoff evidence',
            (
                r'canonical.*source.*target.*common directory.*base sha',
                r'all five roles \(coder, qa, planner, reviewer, scouter\).*selected execution checkout or absolute worktree path',
                r'do not automatically.*recreate.*cleanup.*archive',
            ),
        )

        self._assert_workspace_handoff_contracts(
            'Choice lifetime and restart record',
            (
                r'reuse the initial explicit choice only when.*still valid.*rechecks actual git state.*old target cannot be trusted.*fresh explicit choice',
                r'normal authorized head and dirty-state changes, including accepted task commits, docs commits, implementation, and approved worktree document transfer, do not by themselves invalidate the choice',
                r'rechecks actual git state against the current brief: absolute workspace and repository identity, branch or detached head, head, staged/unstaged/untracked changes, preservation and edit ownership, applicable approvals and artifacts, planning-document sha/message/paths/content or valid no-document rationale, and ceo.s final state verification',
                r'restart without document changes reuses verified valid planning-document commits without recommitting them and a still-valid initial choice, with fresh actual-state checks',
                r'creation base sha.*evidence.*target head need not remain.*base',
                r'every first start and restart.*recheck.*actual git state.*ownership',
                r'scope, workspace, repository, target, or approved branch candidate.*changes.*fresh explicit choice',
                r'state mismatches and unresolved failures block.*editing',
                r'source preservation and unexpected-state checks still apply',
            ),
        )

    def test_workspace_handoff_worktree_keeps_in_place_prohibition(self) -> None:
        self._assert_workspace_handoff_contracts(
            'New task branch',
            (
                r'do not create a worktree.*failure',
                r'only.*explicit.*new managed worktree and task branch.*permits.*worktree',
            ),
        )

    def test_worktree_planning_and_core_preparation_gates(self) -> None:
        planning = policy_text("planning").split("### complete planning-document set", 1)[1].split("### evidence refresh", 1)[0]
        self.assertRegex(planning, r"while documents.*do not.*worktree creation.*stage documents.*commit planning documents")
        self.assertRegex(planning, r"normal order:.*complete applicable set.*explicit execution-target choice.*approved branch switch or worktree creation.*batch commit")
        core = policy_text("core").split("## common handoff gate", 1)[1].split("## coder tdd", 1)[0]
        self.assertRegex(core, r"selected worktree.*common directory.*registration.*source preservation")
        self.assertRegex(core, r"depth-2 roles use the supplied workspace")

    def test_worktree_contract_matches_selected_execution_paths(self) -> None:
        text = policy_text("handoff-worktree")
        for phrase in ("mcp__codex_app__create_worktree", "allowasync: true", "operationid", "attach_worktree",
                       "the app determines the actual destination path", "approved branch", "source head",
                       "index blob and mode", "working-tree bytes", "latest approved version", "base sha",
                       "staging", "registration", "do not fall back to raw git worktree creation"):
            self.assertIn(phrase, text)
        self.assertNotIn("../<repo>-<topic>-worktree", text)
        self.assertNotIn("git worktree add -b", text)
        self.assertRegex(text, r"only an explicit user choice of this third path authorizes preparation")
        self.assertRegex(text, r"any mismatch means stop.*do not automatically stash, commit, reset, clean, or unstage")
        self.assertRegex(text, r"do not repair or verify them by staging source documents")

    def test_distribution_manifest_matches_scouter_payload(self) -> None:
        node_verify_manifest()
        names = {line.split("  ", 1)[1] for line in (REPO / "MANIFEST.sha256").read_text().splitlines()}
        self.assertIn("codex/agents/arc-scouter.toml", names)
        self.assertNotIn("codex/agents/user-notes.toml", names)
        self.assertNotIn("codex/agents/user-research.toml", names)
        self.assertNotIn("codex/skill/models.toml", names)

    def test_acceptance_evidence_flow(self) -> None:
        policy = policy_text("verification")
        for contract in (
            r"qa.*failure.*ceo.*coder.*correction.*qa recheck.*before reviewer",
            r"do not enter reviewer.*qa.*resolved.*unresolved.*unverified",
            r"disposition.*does not.*unverified.*proven",
            r"low.risk.*ceo.*criterion.*evidence.*unverified",
            r"structural checks.*do not prove.*runtime",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(policy, contract)

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

def policy_word_counts(root: Path) -> dict[str, int]:
    paths = [root / "codex/skill/SKILL.md", *sorted((root / "codex/skill/references").glob("*.md")),
             *sorted((root / "codex/agents").glob("*.toml")),
             root / "claude/skill/SKILL.md", *sorted((root / "claude/skill/references").glob("*.md")),
             *sorted((root / "claude/agents").glob("*.md"))]

    def body(path: Path) -> str:
        if path.suffix == ".toml":
            return tomllib.loads(path.read_text())["developer_instructions"]
        text = path.read_text()
        if path.parent.name == "agents" and text.startswith("---"):
            return text.split("---", 2)[2]
        return text
    return {str(path.relative_to(root)): len(body(path).split()) for path in paths}

SHARED_TERMS = {
    "preservation rule": "preserve unrelated staged, unstaged, and untracked changes and edit ownership; never "
                         "automatically stash, reset, clean, unstage, discard, amend, or delete branches/worktrees; "
                         "never change permissions, delete locks, or bypass the sandbox to proceed; stop and report to "
                         "ceo (ceo reports to the user)",
    "explicit choice": "only a clear user selection counts; planning approval, silence, refusal of another option, or "
                       "an ambiguous reply never does",
    "stop and inspect": "on failure or partial completion, stop dependent work; inspect and record the actual path, "
                        "branch or detached head, head, index, files, and completed steps; do not retry, fall back, or "
                        "repeat completed work automatically; revalidate affected gates after resolution",
    "evidence verdict": "each criterion is proven, unmet, or unverified; passing runs, reports, or disposition never "
                        "turn unverified into proven; reports keep unverified scope visible",
}

POLICY_WORD_CEILINGS = {
    "codex/skill/SKILL.md": 2850,
    "codex/skill/references/commit.md": 600,
    "codex/skill/references/git-recovery.md": 700,
    "codex/skill/references/handoff-prep.md": 1350,
    "codex/skill/references/handoff-worktree.md": 850,
    "codex/skill/references/handoff.md": 1300,
    "codex/skill/references/planning.md": 1850,
    "codex/skill/references/verification.md": 1150,
    "codex/skill/references/visual-companion.md": 200,
    "codex/agents/arc-coder.toml": 700,
    "codex/agents/arc-planner.toml": 600,
    "codex/agents/arc-qa.toml": 350,
    "codex/agents/arc-reviewer.toml": 250,
    "codex/agents/arc-scouter.toml": 250,
    "claude/skill/SKILL.md": 3300,
    "claude/skill/references/commit.md": 350,
    "claude/skill/references/git-recovery.md": 500,
    "claude/skill/references/handoff-prep.md": 600,
    "claude/skill/references/handoff.md": 500,
    "claude/skill/references/planning.md": 1500,
    "claude/skill/references/verification.md": 850,
    "claude/skill/references/visual-companion.md": 150,
    "claude/agents/arc-coder.md": 400,
    "claude/agents/arc-planner.md": 400,
    "claude/agents/arc-qa.md": 450,
    "claude/agents/arc-reviewer.md": 350,
    "claude/agents/arc-scouter.md": 300,
}

POLICY_WORD_TOTAL_CEILING = 12750
CLAUDE_POLICY_WORD_TOTAL_CEILING = 9250
