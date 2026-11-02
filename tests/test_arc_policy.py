from __future__ import annotations
import hashlib, json, os, re, shutil, signal, subprocess, stat, sys, tempfile, tomllib, unittest
from pathlib import Path
from unittest.mock import patch
import workspace_document_contract as workspace_contract
REPO = Path(__file__).resolve().parents[1]
TMP_ROOT = os.path.realpath(tempfile.gettempdir())
REFERENCE_NAMES = ("planning", "handoff", "handoff-prep", "handoff-worktree", "verification", "git-recovery",
                   "arc-visual-companion", "commit")

HANDOFF_FILES = ("handoff", "handoff-prep", "handoff-worktree")

def policy_text(name: str) -> str:
    # "handoff" covers the whole handoff contract, which is split by trigger across HANDOFF_FILES.
    names = HANDOFF_FILES if name == "handoff" else (name,)
    paths = [REPO / "codex/skill" / ("SKILL.md" if n == "core" else f"references/{n}.md") for n in names]
    return " ".join(" ".join(path.read_text().lower().split()) for path in paths)

class TaskCommitPolicyTests(unittest.TestCase):
    def test_host_routes_substantive_work_to_configured_coordinator(self):
        for platform in ('codex', 'claude'):
            core = ' '.join((REPO / platform / 'skill/SKILL.md').read_text().lower().split())
            limits = ' '.join((REPO / platform / 'skill/references/limits.md').read_text().lower().split())
            self.assertIn('host invokes configured', core)
            self.assertIn('relay', core)
            self.assertIn('count the coordinator', limits)
            self.assertIn('100`/`10', limits)
            self.assertIn('before invoking the coordinator', core)
            self.assertIn('two active slots', core)
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
        core = policy_text("commit")
        self.assertRegex(core, r"orchestrator.*accept.*task.*commit")
        self.assertRegex(core, r"without.*(?:additional|separate).*user.*commit.*approval")
        self.assertRegex(core, r"top.level task.*commit")
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"orchestrator verifies.*acceptance criteria.*required checks.*findings.*accepts.*task.*immediately.*local.*commit",
            r"one approved top-level task.*one focused implementation commit",
            r"after orchestrator accepts a task, the next action is.*git.*checks.*staging.*commit",
            r"plan.skip.*no new plan obligation",
        ))
        self.assertNotIn("optionally create", commit)

    def test_planner_groups_inseparable_changes_and_defines_task_gates(self) -> None:
        planning = self.section("planning", "## top-level plan tasks")
        profile = tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
        self.assertNotIn("sandbox_mode", profile)  # user decision H1: read-only is a prompt-level guard
        planner = " ".join(profile["developer_instructions"].lower().split())
        self.assertIn("must not edit files; never run commands that change state", planner)
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
            r"orchestrator.*accept.*without.*additional user commit approval",
        ))
        for artifact, text in (("planner", task_draft),):
            with self.subTest(artifact=artifact):
                self.contracts(text, (
                    r"id.*title.*scope.*files.*dependencies.*acceptance criteria.*required qa/focused checks.*evidence.*hold conditions",
                    r"never list reviewer as a per-task required check",
                    r"final.*plan verification.*single independent reviewer review of the final full change after all tasks are accepted with their risk-scaled checks",
                    r"cannot be independently verified.*one top-level task",
                    r"substeps.*checkboxes.*not.*commit units",
                    r"orchestrator.*accept.*without.*additional user commit approval",
                    r"final.*plan.*verification.*task.*prerequisites",
                ))

    def test_substeps_and_reports_do_not_replace_acceptance(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"substeps/checkboxes track progress, not commits",
            r"completion marks/reports/passing checks do not establish acceptance",
            r"(?s)(?=.*orchestrator verifies criteria/current checks/findings, accepts by judgment)(?=.*connect conditions/expected results to evidence)",
        ))

    def test_task_and_final_plan_verification_remain_distinct(self) -> None:
        verify = self.section("verification", "## task acceptance and final plan acceptance")
        self.contracts(verify, (
            r"task acceptance differs from final verification/acceptance",
            r"task acceptance and its focused commit require only.*risk-scaled evidence.*fresh qa instance per task that needs qa.*orchestrator focused checks",
            r"reviewer timing and task-boundary gates follow the risk-scaled execution section above",
            r"do not delay independently acceptable tasks solely for final-only checks",
            r"(?s)do not delay independently acceptable tasks solely for final-only checks.{0,8}or defer currently required checks to accept early",
            r"with a plan, the required final whole-change review is final plan verification",
            r"task commits prove no unperformed final checks",
        ))
        self.assertRegex(policy_text("verification"), r"do not add per-task qa or review gates solely because a task boundary exists")

    def test_commit_blocks_on_scope_checks_findings_and_git_state(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        hold = commit.split("hold the task commit", 1)[-1].split("for a no-change task", 1)[0]
        self.contracts(hold, (
            r"hold commits for unmet/unresolved criteria, failed/not-run required checks, undispositioned findings/gaps",
            r"scope expansion.*ownership.*staged.*mismatch.*workspace.*branch.*head.*git state",
            r"failure.*partial completion.*record.*reason.*next action",
            r"never waive criteria/checks to commit",
            r"explicit disposition follows existing policy and the evidence verdict",
            r"inspect actual branch/head/index/working tree/partial completion before retry; uncertain commit creation stops immediate retries",
        ))
        self.contracts(commit, (
            r"verify staged content/paths include only this task and final message\.\s*prove safe separation of other tasks/user changes in shared files",
            r"unrelated staging blocks commit under preservation rule",
        ))
        assert_term_defined(self, "evidence verdict")
        assert_term_defined(self, "preservation rule")

    def test_commit_evidence_no_change_and_resume_are_explicit(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        self.contracts(commit, (
            r"before commit verify approved plan version/task id/accepted scope, actual absolute workspace/repository/branch or detached head/head, staged/unstaged/untracked state and ownership",
            r"verify staged content/paths include only this task and final message",
            r"after committing.*sha.*actual message.*included paths.*content.*post-commit head.*branch.*remaining.*staged/unstaged/untracked",
            r"canonically link plan path/version, task id, acceptance evidence/judgment, required checks/findings, commit results/state, hold/no-change/reuse reasons and remaining final verification",
            r"(?s)(?=.*acceptance evidence/judgment)(?=.*no-change tasks record acceptance/no change without empty commits)",
            r"resume verifies/reuses the same task's sha/content/validity without duplication",
            r"missing records require actual-result inspection before retry",
        ))
        restart = self.section("handoff", "## choice lifetime and restart record")
        self.assertRegex(restart, r"normal authorized head and dirty-state changes, including accepted task commits.*do not by themselves invalidate the choice")
        gate = policy_text("handoff").split("### implementer handoff gate", 1)[1].split("### handoff evidence", 1)[0]
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
        followup = commit.split("for final reviewer findings", 1)[1].split("this local", 1)[0]
        self.contracts(followup, (
            r"already committed plan work.*orchestrator.*follow-up task.*required planning/approvals",
            r"(?s)implementer leaves corrections uncommitted through rechecks\..*orchestrator refreshes committed state plus uncommitted diff/changed-file list in reviewer artifacts/briefs",
            r"reuse/assign an independent reviewer",
            r"repeat implementer → reviewer without qa reassignment until findings are resolved.*orchestrator then accepts.*one focused follow-up commit",
            r"final qa findings.*implementer correction and qa recheck before a new focused commit",
            r"never automatically amend/reset/duplicate originals",
        ))

    def test_document_batch_and_external_action_boundaries_remain(self) -> None:
        commit = self.section("commit", "## automatic commit after plan-task acceptance")
        planning = self.section("planning", "## complete planning-document set")
        self.contracts(planning, (
            r"normal order: initial design approval.*execution-target choice.*target preparation and verification.*written-spec approval.*individual plan approvals.*complete applicable set.*batch docs commit.*final git verification.*implementer handoff",
            r"complete documents precede staging/commit/handoff",
        ))
        self.contracts(commit, (
            r"local commit authority never permits early planning-document commits.*pre-implementer approvals/explicit target/batch preparation remain",
            r"conventional commits.*english description.*trailing period.*lowercase.*scope",
            r"never retroactively alter historical spec/plan records",
            r"structural checks.*do not prove.*agent runtime",
        ))
        core = policy_text("commit")
        self.assertRegex(core, r"push.*merge.*publish.*deploy.*install.*separate.*approval")

class ConditionalReferenceTests(unittest.TestCase):
    # User-approved static contract exception for this change only.
    # These checks do not establish consuming-agent runtime compliance.
    def test_core_requires_task_scoped_references(self) -> None:
        core = policy_text("core")
        self.assertRegex(core, r"must read.*before.*dependent")
        self.assertRegex(core, r"missing.*conflicting.*orchestrator.*stop")
        for name in REFERENCE_NAMES:
            with self.subTest(reference=name):
                self.assertIn(f"references/{name}.md", core)
                self.assertTrue((REPO / f"codex/skill/references/{name}.md").is_file())
        self.assertRegex(core, r"do not load all references")

    def test_reference_triggers_cover_dependent_stages(self) -> None:
        core = policy_text("core")
        for name, trigger in (
            ("planning", r"design/plan-depth judgments.*spec/plan drafting or approval"),
            ("handoff", r"every implementer first start/restart.*implementer trusts the orchestrator-verified brief.*only brief-cited sections"),
            ("verification", r"verification design.*qa/reviewer.*correction rechecks.*ui acceptance"),
            ("git-recovery", r"branch collision.*git preparation failure.*partial completion.*metadata write denial"),
            ("arc-visual-companion", r"visual companion offer or operation"),
            ("commit", r"plan-task acceptance.*focused commit"),
            ("handoff-prep", r"execution-target choice request.*each preparation git mutation"),
            ("handoff-worktree", r"^[^|]*\|[^|]*\|\s*after explicit new managed worktree selection, before its creation, branch work or document transfer\s*\|?$"),
        ):
            with self.subTest(reference=name):
                row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if line.startswith("|") and f"references/{name}.md" in line)
                self.assertRegex(row, trigger)
        worktree_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                            if line.startswith("|") and "references/handoff-worktree.md" in line)
        self.assertNotIn("choice request", worktree_row)
        self.assertNotIn("selection target", worktree_row)
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"new managed worktree.*selection target.*source absolute path.*repository.*git common directory.*branch or detached head.*verified full source head sha.*approved branch candidate.*collision status.*descriptive name.*planned document scope.*existing approved document transfer/commit scope")
        self.assertRegex(gate, r"app chooses the actual destination path: do not ask the user for a destination path or propose one")
        self.assertRegex(gate, r"read \[handoff-worktree\.md\]\(handoff-worktree\.md\) only after the user explicitly selects that option and before its creation, branch work, or document transfer")
        self.assertNotRegex(policy_text("handoff-prep").split("## workspace handoff", 1)[0], r"choice request also read")
        self.assertRegex(policy_text("handoff-worktree").split("## workspace handoff", 1)[0], r"reads after the user explicitly selects the new managed worktree option, before its creation, branch work or document transfer")
        self.assertNotIn("before an execution-target choice request", policy_text("handoff-worktree").split("## workspace handoff", 1)[0])
        self.assertRegex(policy_text("handoff-worktree"),
                         r"verify final approved branch and head before formal drafting, saving, document transfer, the batch docs commit, final git verification and implementer handoff")
        self.assertRegex(policy_text("handoff"), r"new managed worktree and task branch \(selection target under handoff-prep\.md; contract in handoff-worktree\.md after selection\)")
        self.assertRegex(policy_text("planning").split("### managed worktree preparation", 1)[1], r"see \[handoff-worktree\.md\]\(handoff-worktree\.md\)")
        self.assertRegex(core, r"orchestrator.*each assigned role.*must read")
        self.assertRegex(core, r"orchestrator must include in the role brief the accessible path and section name of each reference section")

    def test_planning_order_and_recovery_protections_remain(self) -> None:
        planning = policy_text("planning")
        for contract in (
            r"normal order: initial design approval.*execution-target choice.*target preparation and verification.*written-spec approval.*individual plan approvals.*complete applicable set.*batch docs commit.*final git verification.*implementer handoff",
            r"while documents.*do not stage documents or commit planning documents",
            r"architectural work always.*writing-plans.*written plan approval",
            r"skip planning only for one local change.*no dependent stages.*shared state.*lifecycle.*integration-order.*one focused verification path",
            r"changed approved document bodies require approval of the revised version, except mechanical execution records",
            r"while documents.*do not.*stage documents.*commit planning documents",
            r"normal order:.*execution-target choice.*target preparation and verification.*formal spec drafting.*complete applicable set.*batch docs commit.*final git verification",
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
        assert_term_defined(self, "preservation rule", "implementer")

    def test_references_preserve_policy_contracts(self) -> None:
        contracts = {
            "planning": ("complete planning-document set", "written-spec approval", "individually approved"),
            "handoff": ("planning document commit", "unrelated staged", "approved-content verification"),
            "verification": ("criterion verdict", "ui browser acceptance checks", "whole-change review"),
            "git-recovery": ("git metadata write denial", "partial completion", "do not delete lock files"),
            "arc-visual-companion": ("complete keyed url", "terminal text as primary", "waits for acceptance"),
        }
        for name, phrases in contracts.items():
            path = REPO / f"codex/skill/references/{name}.md"
            self.assertTrue(path.is_file(), name)
            for phrase in phrases:
                with self.subTest(reference=name, contract=phrase):
                    self.assertIn(phrase, policy_text(name))

    def test_core_preserves_role_and_risk_gates(self) -> None:
        for destination, contract in (("coordination", r"all five roles.*directly to orchestrator.*depth 2"),
                                      ("verification", r"implementer.*independent qa"),
                                      ("verification", r"qa.*independent reviewer.*full change"),
                                      ("handoff", r"ordinary.*significant/high-risk.*not eligible"),
                                      ("handoff", r"explicit user or task-specific tdd request overrides")):
            self.assertRegex(policy_text(destination), contract)

    def test_implementer_trusts_ceo_verified_brief(self) -> None:
        implementer = " ".join(tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
                         ["developer_instructions"].lower().split())
        for contract in (
            r"trust the orchestrator-verified workspace, branch/head, approvals.*document-commit and handoff facts in the brief.*start editing",
            r"do not independently re-verify checkout, branch, head, approval, or document evidence or ask orchestrator to reconfirm them",
            r"supplied absolute workspace.*never create or switch workspaces or branches.*apply the preservation rule",
            r"report to orchestrator only a conflict you actually hit while working.*assigned file has unexpected changes you did not make"
            r".*path is missing or inaccessible.*git or tool command fails.*git output shows a branch or state different from the brief",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(implementer, contract)
        for absent in (r"independently verify", r"git common directory", r"every first start or restart",
                       r"fresh explicit choice", r"reuse the initial explicit choice", r"revalidates the full handoff gate"):
            with self.subTest(absent=absent):
                self.assertNotRegex(implementer, absent)

    def test_implementer_profile_holds_handoff_contract_without_full_reference_read(self) -> None:
        implementer = " ".join(tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(implementer, r"profile is the complete implementer handoff contract.*handoff.md.*only.*brief explicitly cites")
        self.assertNotRegex(implementer, r"before every first start or restart, read")
        for phrase in ("trust the orchestrator-verified", "do not repair preparation"):
            self.assertIn(phrase, implementer)
        self.assertRegex(policy_text("handoff"), r"implementer trusts the orchestrator-verified facts in the brief.*implementer profile.*brief explicitly cites")
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
                                                    "execution-time plan amendment", "recovery prerequisite"])
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
            "first start": r"(?=.*before every implementer start/restart verify supplied absolute workspace accessibility/intended repository)(?=.*after initial design approval record explicit selection:.*without choice/valid reuse, wait)",
            "same target": r"reuse only for unchanged approved scope/workspace/repository/target with accessible valid evidence",
            "fresh state": r"every start/restart compares actual identity/branch/detached head/head/changes/preservation/ownership, approvals/artifacts, document sha/message/paths/content or absence and final state with the brief",
            "changed target": r"changed scope/workspace/repository/target/candidate needs fresh choice before dependent work",
            "invalidating failure": r"failures invalidating target trust need new choice after resolution",
            "normal work": r"accepted task/docs commits and authorized implementation/dirty changes alone invalidate no choice",
            "record": r"maintain one accessible initial canonical record",
            "delta": r"restart briefs send verified deltas and record-relative `unchanged`; fresh implementer reads it.*record location, next goal/ownership, changed decisions/approvals/docs/scope or no-change, current git/differences",
            "block": r"inaccessible.*record.*missing evidence.*unclear ownership.*block",
        }
        for case, contract in cases.items():
            with self.subTest(case=case):
                self.assertRegex(handoff, contract)
        self.assertNotRegex(handoff, r"orchestrator and implementer independently recheck")
        self.assertNotRegex(handoff, r"full handoff gate and independent checks")

class ReviewerOncePerPlanTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_final_single_reviewer_is_explicit(self) -> None:
        for name, text, contract in (
            ("verification", policy_text("verification"), r"reviewer is never a plan-task acceptance prerequisite; for significant work with a plan, it reviews the final full change once after all plan tasks are accepted with their risk-scaled checks, following the last plan task's required checks and any qa recheck at the final relevant state; significant work without a plan keeps reviewer after qa before acceptance"),
            ("verification", policy_text("verification"), r"reviewer timing and task-boundary gates follow the risk-scaled execution section above"),
            ("verification-cleanup", policy_text("verification"), r"verified ignore-pattern or metadata cleanup.*targets are unused.*required project materials are unaffected.*ignore patterns cover only intended paths.*diff matches the approved scope.*focused checks then suffice without automatically calling qa or reviewer"),
            ("verification-env", policy_text("verification"), r"an environment failure is distinct from a code failure.*report the exact limitation"),
            ("verification-pointer", policy_text("verification"), r"the risk-scaled execution section above holds the risk table, risk definitions, evidence-reuse rule, and role order"),
            ("planning", policy_text("planning"), r"never list reviewer as a per-task required check \(reviewer timing: \[risk-scaled execution\]\(verification\.md#risk-scaled-execution\)\)"),
            ("commit", policy_text("commit"), r"reviewer timing: \[risk-scaled execution\]\(verification\.md#risk-scaled-execution\)"),
            ("planner", profile_text("planner"), r"single independent reviewer review of the final full change after all tasks are accepted with their risk-scaled checks"),
        ):
            with self.subTest(artifact=name):
                self.assertRegex(text, contract)
        row = next(line for line in (REPO / "codex/skill/references/verification.md").read_text().lower().splitlines()
                   if line.startswith("| significant/high risk"))
        self.assertRegex(row, r"with a plan, each plan task implementer → fresh qa → acceptance/commit satisfies the qa step, then independent reviewer once on the final full change after all plan tasks")

    def test_no_per_task_reviewer_wording(self) -> None:
        paths = [*(REPO / "codex/skill").rglob("*.md"), *(REPO / "codex/agents").glob("*.toml")]
        for path in paths:
            text = " ".join(path.read_text().lower().split())
            with self.subTest(file=path.name, absent="accepted and qa'd"):
                self.assertNotIn("accepted and qa'd", text)
                self.assertNotIn("수락·QA된".lower(), text)
            for absent in (r"checks/reviews as a (?:per-task|task) (?:gate|prerequisite)", r"in a multi-task plan", r"review as a task acceptance prerequisite",
                           r"expressly a task prerequisite", r"designated as that task's prerequisite",
                           r"qa/review at that dependency boundary", r"new reviewer for each task unless",
                           r"선행 조건으로 지정", r"검사/검토"):
                with self.subTest(file=path.name, absent=absent):
                    self.assertNotRegex(text, absent)

    def test_dependency_boundary_is_qa_only(self) -> None:
        core = policy_text("verification")
        self.assertRegex(core, r"depends on a still-unverified risky contract, complete applicable qa at that dependency boundary")
        self.assertNotRegex(core, r"qa/review at that dependency boundary")

    def platform_texts(self, suffix):
        for platform in ("codex", "claude"):
            path = REPO / platform / suffix
            yield platform, " ".join(path.read_text().lower().split())

    def test_final_plan_reviewer_corrections_skip_qa(self) -> None:
        for suffix in ("skill/references/verification.md",):
            for platform, text in self.platform_texts(suffix):
                with self.subTest(platform=platform, artifact=suffix):
                    self.assertRegex(text, r"only final overall reviewer findings on plan work, including behavior, follow implementer → reviewer without qa reassignment until resolved")
                    self.assertRegex(text, r"repeat.*until.*resolved")
        for platform, suffix in (("codex", "agents/arc-reviewer.toml"), ("claude", "agents/arc-reviewer.md")):
            text = " ".join((REPO / platform / suffix).read_text().lower().split())
            self.assertRegex(text, r"final.*reviewer findings.*including behavior findings.*implementer.*reviewer.*no qa")
            self.assertRegex(text, r"repeat.*until.*resolved")

    def test_pre_final_qa_failures_keep_qa_recheck(self) -> None:
        for platform, text in self.platform_texts("skill/references/verification.md"):
            with self.subTest(platform=platform):
                self.assertRegex(text, r"before.*initial final.*reviewer.*qa.*failures.*implementer.*qa recheck")

    def test_final_reviewer_findings_on_committed_work(self) -> None:
        for suffix in ("skill/references/verification.md", "skill/references/commit.md"):
            for platform, text in self.platform_texts(suffix):
                with self.subTest(platform=platform, artifact=suffix):
                    self.assertRegex(text, r"final reviewer findings.*follow-up task.*approvals.*uncommitted.*latest.*diff.*resolved.*orchestrator.*accept.*one focused follow-up commit")
                    self.assertRegex(text, r"final qa findings.*qa re(?:check|verification)")
                    self.assertRegex(text, r"(?:never|do not).*amend/reset.*duplicate")

    def test_final_review_exception_preserves_scope_and_roles(self) -> None:
        for platform, text in self.platform_texts("skill/references/verification.md"):
            with self.subTest(platform=platform):
                self.assertRegex(text, r"(?=.*\| significant/high risk, no plan \| implementer → qa/rechecks → final full-change reviewer → acceptance \|)(?=.*no-plan flow remains unchanged)")
                self.assertRegex(text, r"scope expansion.*separate.*mandatory.*obligations.*evidence gaps.*hold.*orchestrator")
                self.assertRegex(text, r"reviewer.*read.only.*(?:no qa|must not run qa).*acceptance")
                self.assertRegex(text, r"previous qa.*(?:not|never).*post.fix")
        for platform, suffix in (("codex", "agents/arc-planner.toml"), ("claude", "agents/arc-planner.md")):
            text = " ".join((REPO / platform / suffix).read_text().lower().split())
            self.assertRegex(text, r"initial.*(?:single|once).*review.*necessary.*rechecks")

class PlannerDraftingDisciplineTests(unittest.TestCase):
    # Approved structural contract checks; no consuming-agent runtime claim.
    def test_planner_progress_preserves_complete_draft_contract(self):
        rules = {rule["id"]: " ".join(rule["text"].lower().split())
                 for rule in json.loads((REPO / "lib/policy/role-policy.json").read_text())["rules"]}
        contracts = {
            "role.planner-draft-only": (
                r"during initial drafting and revisions, report progress only to orchestrator",
                r"briefly state the stage, feedback being applied, actual blocker or next step",
                r"without draft prose or excerpts",
                r"return the complete first draft and self-review for orchestrator review; orchestrator directly revises the same spec or plan when needed",
                r"raw responses may appear in app/tool surfaces; prompt policy cannot hide them",
            ),
            "planning.planner-brief": (
                r"allow the initial draft and one consolidated correction",
                r"do not invoke planner only for reformatting, re-expression, save errors or patch-application errors; orchestrator handles these",
                r"evaluate separate substantive work under the normal planner gate",
                r"keep user progress brief and based on planner status without relaying draft content",
                r"at approval, present the integrated, saved and reviewed markdown without repeating its body in chat",
            ),
        }
        for rule_id, patterns in contracts.items():
            for pattern in patterns:
                with self.subTest(rule=rule_id, contract=pattern):
                    self.assertRegex(rules[rule_id], pattern)

    def contracts(self, patterns):
        for platform in ("codex", "claude"):
            text = " ".join((REPO / platform / "skill/references/planning.md").read_text().lower().split())
            for pattern in patterns:
                with self.subTest(platform=platform, contract=pattern):
                    self.assertRegex(text, pattern)

    def test_planner_drafting_preflight_requires_complete_brief(self):
        self.contracts((r"preflight relevant policy/references/profiles/tests/parity/manifest/conflicts", r"complete stage-specific initial brief: prepared target/head/ownership, scope/exclusions/depth/dependencies/shared contracts/criteria/checks/evidence/holds"))

    def test_planner_returns_complete_draft_and_self_review(self):
        self.contracts((r"planner returns the complete proportional first draft and self-review", r"orchestrator.*integrates.*saves.*reviews.*approval"))

    def test_planner_followup_batches_substantive_omissions(self):
        self.contracts((r"fixed checklist.*scope.*ownership.*conflicts.*dependencies.*evidence.*approval.*completeness", r"one consolidated correction covering every substantive omission with criterion/defect/evidence/expected fix", r"do not split.*omission"))

    def test_planner_turn_minimization_preserves_approval_gates(self):
        self.contracts((r"(?=.*design/spec/plan stages remain separately ordered; spec approval precedes dependent planning)(?=.*order: initial design approval.*required spec drafting/save/self-review/individual approval.*required plans drafting/save/review/individual approval)", r"further calls require user-approved material scope/evidence changes or concrete unmet checklist items after correction, plus meaningful new input or criterion-state progress", r"no fixed call cap.*never accept an incomplete draft"))

class ResearchRoutingAndBriefTests(unittest.TestCase):
    def test_codex_spawn_fork_and_user_input_policy(self) -> None:
        skill = " ".join((REPO / "codex/skill/references/coordination.md").read_text().split())
        self.assertRegex(skill, r"Every spawn uses `fork_turns=\"none\"` and the shared brief; full-history forks are forbidden")
        self.assertNotIn("When supported, start specialists", skill)
        self.assertIn("`request_user_input` questions use only `title` and `options` fields, never `question`", skill)

    def test_claude_native_role_and_ask_user_question_policy(self) -> None:
        skill = " ".join((REPO / "claude/skill/references/coordination.md").read_text().split())
        self.assertIn("Start installed `arc-*` names with scoped briefs only, never inheriting forks such as `fork`", skill)
        self.assertIn("claim fresh isolation only with evidence", skill)
        self.assertNotIn("When supported, start specialists", skill)
        self.assertIn("`AskUserQuestion` uses only `question`, `header` of at most 12 characters, 2–4 `options` with `label`/`description`, and `multiSelect`.", skill)

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
        for platform in ("codex", "claude"):
            text = (REPO / platform / "skill/references/coordination.md").read_text().lower()
            models = " ".join(text.split("## models", 1)[1].split("\n## ", 1)[0].split())
            with self.subTest(platform=platform):
                self.assertIn("`models.toml` is authoritative for role models/effort", models)
                self.assertIn("configured `arc_orchestrator` uses its selected preset or custom model and effort", models)
                self.assertIn("do not substitute settings or reduce effort", models)
                self.assertIn("report unavailability", models)
                self.assertNotIn("reasoning_effort", models)
                self.assertNotIn("bounded scouter lookup", models)
                for command in ("npx", "npm i", "apply-models.py", "arc preset"):
                    self.assertNotIn(command, text)
        self.assertNotIn('reasoning_effort="medium"', policy_text("core"))

    def test_skill_not_reread_and_agents_body_wording(self) -> None:
        tokens = policy_text("coordination").split("## token discipline and handoffs", 1)[1].split("## models", 1)[0]
        self.assertRegex(tokens, r"this skill file, once read in this context and unchanged, is not re-read on follow-up turns")
        body = node_agents_block_body()
        self.assertIn("keep following it in relevant follow-up turns of the same chat without re-reading it unless it changed", body)
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
        handoff = policy_text("handoff")
        for contract in (
            r"orchestrator writes it as a markdown file at `<git-common-dir>/arc/handoff/<plan-or-task-slug>\.md`",
            r"`git rev-parse --path-format=absolute --git-common-dir`.*outside working tree, shared by linked worktrees",
            r"not a git mutation, never staged/committed, secret-free",
            r"give every brief its absolute path.*restart briefs send verified deltas.*include record location",
            r"use a unique dated-plan stem or no-plan spec/task slug; never overwrite another record",
            r"unavailable/denied record writes require reason/full inline record in every implementer brief, without deltas or record-file `unchanged`; inline satisfies accessibility",
            r"never delete automatically",
            r"maintain one accessible initial canonical record, not a separate service",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(handoff, contract)
        self.assertRegex(policy_text("coordination"), r"records the canonical handoff state in the handoff record file")

class WholeSystemReviewFollowUpTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_case_qa_requirement_is_satisfied_by_task_checks(self) -> None:
        core = policy_text("verification")
        self.assertRegex(core, r"with a plan, each plan task implementer → fresh qa → acceptance/commit satisfies the qa step")
        verification = policy_text("verification")
        self.assertRegex(verification, r"significant/high-risk work requires independent review of the full change at the final relevant state after the required qa/focused checks and any qa recheck")
        self.assertNotIn("requires qa followed by independent review", verification)
        self.assertRegex(profile_text("reviewer"), r"review the final full change after the required qa/focused checks and any qa recheck")

    def test_planning_points_to_common_handoff_gate(self) -> None:
        planning = policy_text("planning")
        self.assertIn("before every implementer assignment or direct code edit, orchestrator applies this checkpoint and the [handoff gate](handoff.md#implementer-handoff-gate)", planning)
        self.assertNotIn("the complete the common handoff gate", planning)
        self.assertNotIn("`workspace handoff` gate below", planning)

    def test_installed_limits_policy_replaces_manual_config(self) -> None:
        self.assertFalse((REPO / "codex/config.toml").exists())
        for platform in ("codex", "claude"):
            text = (REPO / platform / "skill/references/limits.md").read_text()
            for phrase in ("max_total_subagents", "max_concurrent_subagents", "100", "10", "completed", "Same-instance", "every created descendant, including nested/non-ARC agents", "reservation", "Uncertain", "ledger", "QA", "Reviewer", "Cumulative limits and scheduling are prompt policy, not hard runtime controls."):
                self.assertIn(phrase, text)

    def test_reviewer_description_has_no_team_name(self) -> None:
        description = tomllib.loads((REPO / "codex/agents/arc-reviewer.toml").read_text())["description"]
        self.assertNotIn("Yunho Team", description)

    def test_fallback_record_inline_and_slug(self) -> None:
        handoff = policy_text("handoff")
        self.assertRegex(handoff, r"full inline record in every implementer brief, without deltas or record-file `unchanged`; inline satisfies accessibility")
        self.assertRegex(handoff, r"or no-plan spec/task slug")

    def test_implementer_reads_record_for_unchanged_fields(self) -> None:
        self.assertRegex(profile_text("implementer"), r"use the canonical initial record and delta restart brief, reading `unchanged` fields from the cited record")

    def test_task4_bounded_direct_edit_uses_scope_record(self) -> None:
        self.assertIn("direct path uses scope record only. 2. spike distinguishes probe-only from specific combined scope. bounded approves short design before implementer; direct edits use approved scope record", policy_text("planning"))

    def test_task4_codex_wording(self) -> None:
        core = policy_text("core")
        self.assertIn("standalone document writing has no specialist auto-route. design, spec, plan, and brainstorming drafts are not standalone document writing (see role gate)", core)
        self.assertRegex(policy_text("coordination"), r"git status` against a pre-spawn snapshot.*concurrent implementer edits.*ignored or out-of-repo paths.*not (?:attributable|detectable)")
        self.assertIn("after a failed focused check or a qa finding, orchestrator routes the correction to implementer", policy_text("handoff"))


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
        for role, terms in (("implementer", ("preservation rule", "explicit choice", "stop and inspect")),):
            for term in terms:
                with self.subTest(role=role, term=term):
                    body = SHARED_TERMS[term].replace("only clear user selection", "only a clear user selection").replace("on failure/partial completion", "on failure or partial completion").replace("never automatically retry", "do not automatically retry")
                    self.assertIn(f"**{term}:** {body}", profile_text(role))
        # QA/Reviewer (verification) and Planner (planning) profiles do not define the terms, so those
        # references must not use them.
        for name in ("verification", "planning"):
            for term in SHARED_TERMS:
                with self.subTest(reference=name, term=term):
                    if name == "verification" and term == "evidence verdict":
                        self.assertIn("**Evidence verdict:** Criteria are proven, unmet or unverified. Passing runs/reports/dispositions never convert unverified to proven; retain gaps.", raw_policy_text(name))
                    else:
                        self.assertNotIn(term.capitalize(), raw_policy_text(name))

    def test_qa_fix_restorations(self) -> None:
        implementer = profile_text("implementer")
        for phrase in ("do not repair preparation by changing permissions, deleting locks, bypassing the sandbox, "
                       "committing, creating/switching branches, or moving workspaces",
                       "if risk is or becomes unclear or scope expands, stop and ask orchestrator to reclassify",
                       "stop dependent work and report the observed state and required next action to orchestrator"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, implementer)
        core = policy_text("verification")
        self.assertIn("substantial behavior/contracts are significant regardless of file count", core)
        self.assertNotIn("implementer repair limits", core)  # dangling reference removed (M10)
        self.assertNotIn("repair limits", policy_text("handoff"))
        self.assertIn("implementer's conflict reporting is in its profile", policy_text("handoff"))
        self.assertRegex(policy_text("handoff"), r"one canonical initial handoff record.*repository/workspace identity")
        reviewer = profile_text("reviewer")
        self.assertIn("for development work, functional and test verification belongs to qa and completion remains with "
                      "orchestrator; orchestrator decides overall completion within its assigned scope", reviewer)

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
            ("verification", "## risk-scaled execution", "evidence verdict"),
        ):
            with self.subTest(reference=name, section=heading, term=term):
                text = raw_policy_text(name)
                self.assertIn(heading, text.lower())
                section = text[text.lower().index(heading) + len(heading):]
                for boundary in (" ## ", " ### "):
                    section = section.split(boundary, 1)[0]
                self.assertIn(f"the {term.capitalize()}", section)

class ARCPreactionGateTests(unittest.TestCase):
    # Structural checks of approved written contracts, not runtime compliance.
    def test_preaction_role_precedence(self) -> None:
        coordination = policy_text("coordination")
        self.assertRegex(coordination, r"adapt local `brainstorming` role/save/early-spec-commit.*planner ownership.*planning/handoff evidence gates")
        planning = policy_text("planning")
        for phrase in ("only planner authors the first complete spec or plan draft and self-review",
                       "unavailable/failed planner stops first drafting rather than transferring authorship",
                       "if bounded requires written spec", "short design approval never substitutes"):
            self.assertIn(phrase, planning)
        planner = " ".join(tomllib.loads((REPO / "codex/agents/arc-planner.toml").read_text())
                           ["developer_instructions"].lower().split())
        self.assertRegex(planner, r"complete spec and self-review.*orchestrator saves/reviews.*written-spec approval")

    def test_preaction_document_save_evidence(self) -> None:
        planning = policy_text("planning")
        gates = planning.split("## document-save evidence gates", 1)[1].split("## complete planning-document set", 1)[0]
        spec, plan = gates.split("| plan |", 1)
        for phrase in ("first architectural spec", "required bounded spec", "approved design scope/evidence",
                       "complete planner draft/self-review", "orchestrator integration/save/review ownership",
                       "absolute path", "depth judgment", "short design", "necessity/scope"):
            with self.subTest(path="spec", evidence=phrase):
                self.assertIn(phrase, spec)
        for phrase in ("approved design", "required approved spec/version/evidence", "depth judgment",
                       "plan list/dependencies", "complete planner draft/self-review", "ownership", "absolute path"):
            with self.subTest(path="plan", evidence=phrase):
                self.assertIn(phrase, plan)
        self.assertIn("does not require prior written-spec approval", gates)
        self.assertIn("does require valid target choice/actual preparation", gates)
        self.assertIn("approved specs enter the document set before dependent planning", gates)
        self.assertIn("missing/mismatched evidence stops the affected save", gates)
        complete = planning.split("## complete planning-document set", 1)[1].split("## plan updates during execution", 1)[0]
        for phrase in ("a required plan does not itself require a written spec", "bounded follows recorded judgment",
                       "| spike | approve question/method/scope/criteria/constraints; no forced unknown-implementation docs.",
                       "bounded, plan skipped", "| non-behavior docs/config | record scope/criteria/inapplicability.", "add no spec duty"):
            self.assertIn(phrase, complete)

    def test_preaction_reference_and_choice_order(self) -> None:
        rows = (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
        planning = next(row for row in rows if row.startswith("|") and "references/planning.md" in row)
        handoff = next(row for row in rows if row.startswith("|") and "references/handoff-prep.md" in row)
        self.assertIn("spec/plan drafting, approval, first save", planning)
        for trigger in ("execution-target choice request", "each preparation git mutation"):
            self.assertIn(trigger, handoff)
        choice = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("### git mutation evidence gate", 1)[0]
        for phrase in ("planned document scope", "absolute paths/coverage", "design/plan depth/valid omissions",
                       "dependencies and order", "staged/unstaged/untracked state", "preservation/ownership",
                       "completed documents/individual approvals are not yet required", "without requiring choice evidence before asking",
                       "required artifacts, not mandatory specs everywhere", "obtain explicit choice before preparation"):
            self.assertIn(phrase, choice)

    def test_preaction_git_evidence_and_batch_order(self) -> None:
        prep = policy_text("handoff-prep")
        gate = prep.split("### git mutation evidence gate", 1)[1].split("### ", 1)[0]
        for phrase in ("before every preparation mutation", "branch creation/switch", "worktree creation", "staging/commit",
                       "explicit choice or verified valid reuse", "absolute workspace/intended repository", "branch or detached head",
                       "staged/unstaged/untracked state", "preservation and ownership", "exact command/paths/approved scope",
                       "unresolved failure", "full set, individual approvals/versions/dependencies", "read-only git"):
            with self.subTest(evidence=phrase):
                self.assertIn(phrase, gate)
        planning = policy_text("planning").split("## complete planning-document set", 1)[1]
        self.assertIn("defer local `brainstorming`'s early spec commit", planning)
        self.assertIn("spec stages cover architectural/required bounded only", planning)
        commit = prep.split("### planning document commit", 1)[1].split("### ", 1)[0]
        for phrase in ("reuse without recommitting", "batch all remaining approved documents", "staged paths/diff must match exactly",
                       "message before the first commit", "verify sha/message/paths/content, post-commit head/branch"):
            self.assertIn(phrase, commit)

    def test_preaction_stop_and_runtime_limits(self) -> None:
        planning = policy_text("planning")
        limits = planning.split("## evidence refresh and limits", 1)[1]
        for phrase in ("missing/mismatched evidence", "unfinished approvals", "unresolved failures", "block affected",
                       "resolve/reverify", "never retroactively", "structure proves authored contracts only", "runtime compliance unverified"):
            self.assertIn(phrase, limits)
        self.assertIn("modify no external skill", planning)
        handoff = policy_text("handoff")
        self.assertIn("preserve unrelated staged files; they block", handoff)
        prep = policy_text("handoff-prep")
        self.assertIn("unrelated staged paths block changes", prep)
        self.assertIn("unrelated staging blocks commit", prep)
        assert_term_defined(self, "preservation rule", "implementer")


class CeoDirectPathTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def direct(self) -> str:
        core = policy_text("handoff")
        self.assertIn("## orchestrator direct path for small tasks", core)
        return core.split("## orchestrator direct path for small tasks", 1)[1].split(" ## ", 1)[0]

    def test_direct_path_eligibility_is_small_low_risk_and_plan_skip(self) -> None:
        for contract in (
            r"(?s)direct edits without planner/implementer.*not brainstorming",
            r"every low-risk/plan-skip condition",
            r"every plan-skip criterion.*one local change.*no dependent stages.*shared state.*lifecycle.*integration-order.*one focused verification path",
            r"no significant trigger",
            r"exclude spike/architectural, ordinary behavior/significant/high/unclear risk",
            r"exclude .*active implementer file overlaps",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)
        self.assertRegex(policy_text("verification"), r"small, low risk means narrow, understood, readily reversible, and verifiable by focused checks")

    def test_direct_path_keeps_approval_handoff_tdd_and_verification(self) -> None:
        for contract in (
            r"before editing.*records.*scope.*files.*why every criterion holds.*acceptance criteria.*focused verification",
            r"authorization.*planning.*existing.*request.*no duplicate approval",
            r"silence/ambiguity/other approvals are insufficient",
            r"passes the implementer handoff gate in handoff, with the approved scope record as the applicable approval, before the first edit",
            r"edits only the approved files, preserves others' edits.*surgical edits.*without unrelated refactoring.*does not install dependencies without authorization",
            r"records the changed files",
            r"after a failed focused check or a qa finding, orchestrator routes the correction to implementer",
            r"behavior edits follow implementer tdd and constraints; when tdd applies, orchestrator follows local `test-driven-development`",
            r"focused checks.*each acceptance criterion.*evidence.*unverified scope",
            r"orchestrator is not independent; assign qa for incomplete evidence",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)
        tdd = policy_text("handoff").split("## implementer tdd and constraints", 1)[1].split(" ## ", 1)[0]
        self.assertRegex(tdd, r"(?s)user/task-specific tdd overrides it; only qualifying tasks override local generic triggers without changing skills\..*waiver skips red-green only, preserving focused checks/risk-scaled qa/reviewer; never claim tdd")
        self.assertRegex(policy_text("handoff"), r"before an orchestrator direct edit, orchestrator verifies the same conditions, with the approved scope record as the applicable approval")

    def test_direct_path_stops_and_reclassifies_without_reverting(self) -> None:
        for contract in (
            r"scope/risk/condition changes stop edits, record work/reclassify",
            r"normal planner/implementer flow.*implementer owning subsequent edits",
            r"do not automatically revert, reset, stash, or clean",
            r"add no plans/automatic commits to omission paths; follow guidance/user requests",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(self.direct(), contract)

    def test_ownership_and_flows_name_the_direct_path_exception(self) -> None:
        core = policy_text("core")
        ownership = policy_text("coordination").split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"orchestrator does not edit them directly except under the orchestrator direct path")
        self.assertRegex(policy_text("verification"), r"orchestrator assigns edits exclusively to implementer except under the orchestrator direct path")
        row = next(line for line in (REPO / "codex/skill/references/verification.md").read_text().lower().splitlines()
                   if line.startswith("| small, low risk"))
        self.assertIn("orchestrator direct path", row)
        gate = policy_text("handoff").split("## common handoff gate", 1)[1].split("## implementer tdd", 1)[0]
        self.assertRegex(gate, r"same conditions.*before an orchestrator direct edit")
        planning = policy_text("planning")
        self.assertRegex(planning, r"never runs brainstorming or writing-plans itself.*the direct path uses only a scope record")
        self.assertRegex(planning, r"approve a short design before implementer or an orchestrator direct edit")
        self.assertRegex(policy_text("verification"), r"exclusively to implementer.*except under the orchestrator direct path")
        self.assertRegex(policy_text("handoff"), r"orchestrator direct edit.*same.*conditions")
        handoff_row = next(line for line in (REPO / "codex/skill/SKILL.md").read_text().lower().splitlines()
                           if line.startswith("|") and "references/handoff.md" in line)
        self.assertIn("orchestrator direct edit", handoff_row)

class ImplementerBriefAndReuseTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_fresh_implementer_per_top_level_task(self) -> None:
        core = policy_text("coordination")
        self.assertRegex(core, r"starts? a fresh implementer for\s*each top-level task")
        self.assertRegex(core, r"reuse the current implementer only for corrections, rework, or rechecks of the same task")
        self.assertNotRegex(core, r"may reuse implementer while the approved scope")
        self.assertRegex(core, r"implementer and qa freshness follow the role gate")
        self.assertRegex(core, r"fresh implementer for the next task is a restart under handoff \(choice reuse and restart brief rules are in handoff\)")
        self.assertRegex(policy_text("handoff"), r"restart brief: supply only verified deltas.*every other brief field is in full")
        self.assertRegex(core, r"before sending corrections or rework to a reused implementer, orchestrator rechecks workspace, branch/head and change state against the brief")

    def test_implementer_briefs_cite_sections_instead_of_whole_documents(self) -> None:
        core = policy_text("coordination")
        self.assertRegex(core, r"implementer briefs.*plan/spec path.*task section's line range.*needed excerpts.*do not ask implementer to read whole plans or specs")
        implementer = " ".join(tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(implementer, r"read plan/spec documents only in the sections the brief cites")

    def test_loader_keeps_subagents_on_profiles(self) -> None:
        body = node_agents_block_body()
        self.assertIn("ARC subagents (depth 2) follow their role profile and brief instead and do not load `SKILL.md`.", body)

class LongTaskTokenTests(unittest.TestCase):
    # Structural checks of the written contract only, not consuming-agent runtime compliance.
    def test_plan_amendment_restarts_implementer(self) -> None:
        self.assertRegex(policy_text("coordination"), r"approved plan/criteria amendments require a fresh implementer for remaining work even within the same task\. next-task and amendment assignments are handoff restarts")

    def test_long_running_commands_are_not_polled_with_sleep(self) -> None:
        self.assertRegex(policy_text("coordination"), r"wait with maximum supported `wait_agent` timeout until completion; timeouts do not justify polling\..*never sleep/short-wait loops.*long commands use one wait at maximum yield")
        implementer = " ".join(tomllib.loads((REPO / "codex/agents/arc-implementer.toml").read_text())
                         ["developer_instructions"].lower().split())
        self.assertRegex(implementer, r"do not poll long-running commands with repeated `sleep`.*single blocking wait.*longest.*report.*orchestrator")

    def test_ceo_recommends_new_session_per_plan(self) -> None:
        self.assertRegex(policy_text("coordination"), r"when a plan completes or before starting another plan.*records the canonical handoff state.*recommends.*new session")

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
        for role in ("scouter", "planner", "implementer", "qa", "reviewer"):
            with self.subTest(role=role):
                text = " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                                ["developer_instructions"].lower().split())
                self.assertRegex(text, r"read only needed file ranges.*keep command output short.*do not re-read unchanged files")

class RolePolicyTests(unittest.TestCase):
    # Approved package-consistency checks; these do not execute agent runtime behavior.
    def test_role_profiles_report_to_ceo_without_nested_delegation(self) -> None:
        for role in ("scouter", "planner", "implementer", "qa", "reviewer"):
            with self.subTest(role=role):
                profile = tomllib.loads((REPO / "codex/agents" / f"arc-{role}.toml").read_text())
                self.assertEqual(profile["name"], f"arc_{role}")
                instructions = " ".join(profile["developer_instructions"].lower().split())
                self.assertRegex(instructions, r"report(?:s)? directly to (?:the )?orchestrator")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:create|spawn) (?:agents|subagents)")
                self.assertRegex(instructions, r"(?:do not|never|cannot) (?:delegate|assign) (?:work|tasks)")
    def test_role_policy_assigns_development_to_ceo(self) -> None:
        policy = " ".join((REPO / "codex/skill/references/coordination.md").read_text().lower().split())
        ownership = policy.split("## ownership", 1)[1].split("## instruction", 1)[0]
        self.assertRegex(ownership, r"orchestrator.*sole coordinator of development/configuration/tests")
        self.assertRegex(ownership, r"implementer.*edits approved assigned implementation/configuration/tests")
        self.assertRegex(ownership, r"configured orchestrator is depth 1.*all five specialists report directly at depth 2")
        self.assertRegex(ownership, r"concurrency including scouter")
        self.assertRegex(ownership, r"scouter.*read.only")

    def test_scouter_read_only_scope_and_reporting(self) -> None:
        profile = tomllib.loads((REPO / "codex/agents/arc-scouter.toml").read_text())
        self.assertEqual(profile["name"], "arc_scouter")
        self.assertNotIn("sandbox_mode", profile)  # user decision H1: read-only is a prompt-level guard
        instructions = " ".join(profile["developer_instructions"].lower().split())
        self.assertIn("must not edit files; never run commands that change state", instructions)
        for phrase in ("research", "analysis", "static", "code", "documents", "data", "evidence",
                       "unresolved", "standalone document", "operational cleanup"):
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
            r"no source/docs/tests/config edits, dependencies or environment changes",
            r"missing prerequisites.*orchestrator.*unverified",
            r"command or url.*test state.*viewport.*not applicable.*interaction steps.*expected.*observed.*accessible evidence",
            r"startup.*page load.*static checks.*do not prove.*ui behavior",
            r"missing prerequisites/tools/environment leave exact reported limits/unverified criteria",
            r"clean only qa-created processes/sessions; preserve shared services/sessions",
        ):
            with self.subTest(contract=contract):
                self.assertRegex(ui_section, contract)
        self.assertRegex(ui_section, r"when assigning ui acceptance criteria, orchestrator cites this section with its accessible path in the qa brief")
        for contract in (
            r"only when assigned ui acceptance criteria and the brief cites the `ui browser acceptance checks` section of the installed arc `references/verification\.md`, read that section and follow it before launching an app or using browser tools",
            r"otherwise do not launch apps or operate browsers for ui acceptance",
            r"report the missing citation/prerequisites to orchestrator.*affected criteria unverified",
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
            r"orchestrator.*implementer.*qa.*recheck",
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
                r"before every implementer first start and restart",
                r"after initial design approval.*explicit user choice.*current checkout.*new task branch.*new managed worktree and task branch",
                r"explicit user choice for the first start under the explicit choice rule: use the current checkout",
            ),
        )
        assert_term_defined(self, "explicit choice", "implementer")
        self.assertRegex(policy_text("handoff"), r"\(selection target under handoff-prep\.md;")
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        common = gate.split("when offering the new managed worktree option", 1)[0]
        self.assertIn("present to the user:", common)
        self.assertIn("obtain explicit choice", common)
        self.assertLess(common.index("present to the user:"), common.index("obtain explicit choice"))
        presentation = common.split("present to the user:", 1)[1].split("obtain explicit choice", 1)[0]
        for phrase in ("verified absolute workspace", "intended repository", "current branch or detached head",
                       "base head", "validated new-branch candidate", "collision status"):
            self.assertIn(phrase, presentation)

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
                r"base name exists.*never automatically substitute a suffix.*new candidate.*explicit approval",
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
                r"approved docs commits on the three paths are the sole exception; preserve unrelated dirty files",
                r"existing changes prevent switching.*stop handoff until orchestrator resolves the state and scope",
            ),
        )
        assert_term_defined(self, "preservation rule")

    def test_workspace_handoff_failures_do_not_fallback(self) -> None:
        self._assert_workspace_handoff_contracts(
            "Existing changes and failures",
            (
                r"branch creation.*switch.*failure.*actual git state.*stop implementer handoff",
                r"created.*without.*successful switch.*partial completion",
                r"do not.*automatically.*(?:fall back|fallback).*current checkout",
                r"both operational failure and missing target choice block handoff",
                r"never automatically commit/delete changes to prepare",
            ),
        )

    def test_workspace_handoff_commits_approved_plan_docs_before_implementer(self) -> None:
        handoff = policy_text("handoff") + " " + policy_text("git-recovery")
        self._assert_workspace_handoff_contracts(
            "Planning document commit",
            (
                r"new branches require successful switch, actual branch, unchanged path/preservation",
                r"for worktrees verify actual app management/current-chat attachment/identity/base/branch and directly written documents or protected legacy/restart transfers before target docs commits",
                r"current checkout requires selected branch/detached head/path/changes",
                r"verify already committed approvals by sha, actual message/paths/content and selected-checkout validity; reuse without recommitting",
                r"record remaining approved versions/paths\..*finalize a specific english conventional commit message before the first commit\..*batch all remaining approved documents into one focused docs commit\..*staged paths/diff must match exactly; unrelated staging blocks commit",
            ),
        )
        for source, contract in (
            (handoff, r"verify sha/message/paths/content, post-commit head/branch and remaining state in the brief"),
            (handoff, r"no implementation files.*docs commit is neither implementation acceptance nor push approval"),
            (handoff, r"no push without separate explicit request"),
            (handoff, r"failure/staged-content mismatch stops handoff\..*inspect branch/head/index/partial completion"),
            (handoff, r"skip only when depth rules required no documents and none were created; record why\..*uncommitted documents are not absent"),
            (handoff, r"only.*approved.*docs commit.*exception"),
            (policy_text("core"), r"preserve unrelated staged, unstaged, and untracked changes and edit ownership\..*never automatically stash, reset, clean, unstage, discard, amend, or delete branches or worktrees"),
        ):
            with self.subTest(contract=contract):
                self.assertRegex(source, contract)

    def test_workspace_handoff_worktree_scoped_choice_and_base(self) -> None:
        gate = policy_text("handoff-prep").split("### execution-target request gate", 1)[1].split("###", 1)[0]
        self.assertRegex(gate, r"selection target.*source absolute path.*repository.*common directory.*branch or detached head.*full.*sha.*approved branch candidate.*collision.*name.*planned document scope")
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
                       "full sha", "descriptive", "no destination-path/branch arguments", "collision",
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
            r"record initial branch or detached head, approved candidate, final branch and target head equal to approved ref",
            r"verify linked registration, source/target common-directory identity, registered path and target dirty state\. verify source branch/head/index/files preservation",
            r"linked `\.git` may be a file; repository identity requires neither identical top-level path nor a `\.git` directory",
            r"unexpected branch.*stop",
        ))

    def test_workspace_handoff_managed_worktree_async_attachment_and_no_fallback(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"operationid.*mcp__codex_app__get_worktree_creation_status.*completed",
            r"preparing/creating/registering is not success",
            r"only registration failure permits reattachment of the returned workspace with `mcp__codex_app__attach_worktree`",
            r"(?=.*no formal drafting/saving/transfer/staging/commit/implementer before completed registration, current-chat attachment and branch verification)(?=.*verify creation in order: 1\. verify returned absolute path and app-artifact management/current-chat attachment\. 2\. record initial branch or detached head, approved candidate, final branch and target head equal to approved ref)(?=.*after registration/attachment/base checks, create/check out the approved branch)(?=.*transfer rules below apply only to existing approved documents)",
            r"unavailable.*reattachment.*mismatch.*stop.*record",
            r"no raw git worktree fallback, alternate name/ref/path/branch retries or automatic cleanup/deletion/prune/archive",
        ))

    def test_workspace_handoff_worktree_source_dirty_states(self) -> None:
        self._assert_workspace_handoff_contracts("New managed worktree", (
            r"untracked approved documents must be absent from source head/index, with working-tree bytes matching latest approval",
            r"transfer rules below apply only to existing approved documents.*tracked documents require source index blob/mode equal to head and working-tree bytes equal to latest approval",
            r"approved working revisions may differ from head/index\. do not stage source documents to repair or verify them",
            r"unrelated staged.*required uncommitted implementation.*unclear ownership.*block",
            r"never automatically stash/commit/reset/clean/unstage or transfer dirty implementation",
        ))

    def test_workspace_handoff_worktree_document_transfer(self) -> None:
        self._assert_workspace_handoff_contracts("Worktree document transfer", (
            r"target head.*selected source base sha",
            r"copy only uncommitted approved spec/plan documents to the same relative paths",
            r"never move/delete/modify source documents",
            r"outside.*worktree.*symlink.*stop",
            r"before replacing a destination, prove clean base state: no staged/unstaged changes, index/working bytes equal base.*verify approved bytes before reusing identical content; verify approved bytes after transfer",
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
                r'creation/registration/attachment/identity/base/checkout/transfer/stage/commit failures stop dependent work/handoff',
                r'branch-only or partial-path creation, registration/path mismatch, wrong base/branch and partial transfer count as partial completion',
                r'source.*target.*command.*error.*branch.*head.*common directory.*registration.*index.*files',
                r'do not.*fallback.*retry.*delete.*prune.*--force.*-b',
                r'inspect actual state/completed work before authorized retry',
            ),
        )

    def test_workspace_handoff_worktree_roles_and_restart(self) -> None:
        self._assert_workspace_handoff_contracts(
            'Handoff evidence',
            (
                r'canonical.*source.*target.*common directory.*base sha',
                r'all five roles \(implementer, qa, planner, reviewer, scouter\).*selected execution checkout or absolute worktree path',
                r'do not automatically.*recreate.*cleanup.*archive',
            ),
        )

        self._assert_workspace_handoff_contracts(
            'Choice lifetime and restart record',
            (
                r'reuse the initial explicit choice only when.*still valid.*rechecks actual git state.*old target cannot be trusted.*fresh explicit choice',
                r'normal authorized head and dirty-state changes, including accepted task commits, docs commits, implementation, and approved worktree document transfer, do not by themselves invalidate the choice',
                r'rechecks actual git state against the current brief: absolute workspace and repository identity, branch or detached head, head, staged/unstaged/untracked changes, preservation and edit ownership, applicable approvals and artifacts, planning-document sha/message/paths/content or valid no-document rationale, and orchestrator.s final state verification',
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
        planning = policy_text("planning").split("## complete planning-document set", 1)[1].split("## evidence refresh and limits", 1)[0]
        self.assertIn("complete documents precede staging/commit/handoff, not initial preparation/choice request", planning)
        self.assertIn("order: initial design approval → explicit target → actual preparation/verification → required spec drafting/save/self-review/individual approval → required plans drafting/save/review/individual approval → full set → verify existing commits/batch remaining approvals → final git → implementer", planning)
        core = policy_text("handoff").split("## common handoff gate", 1)[1].split("## implementer tdd", 1)[0]
        self.assertRegex(core, r"selected worktree.*common directory.*registration.*source preservation")
        self.assertRegex(policy_text("handoff"), r"give all five specialist roles the same actual workspace/selected checkout, preparation evidence and absolute artifacts\. roles stay there and report missing/inaccessible/conflicting paths/unexpected branches before dependent work, never create/switch workspaces/branches\..*depth 2 never creates/switches workspace/branches")

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
            r"qa.*failure.*orchestrator.*implementer.*correction.*qa recheck.*before reviewer",
            r"qa reruns the reproduction path and invalidated related checks before reviewer.*actual actor, target state, outcomes, and limitations.*prior finding resolved, unresolved, or unverified with evidence",
            r"(?s)(?=.*orchestrator routes fixes to implementer and required qa rechecks)(?=.*before reviewer, rerun reproduction/invalidated checks[^.]*prior finding resolved/unresolved/unverified with evidence\.\s*repeat implementer→qa if unresolved)",
            r"disposition.*does not.*unverified.*proven",
            r"low.risk.*orchestrator.*criterion.*evidence.*unverified",
            r"structure proves structure only",
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
        body = SHARED_TERMS[term]
        if term == "explicit choice":
            body = body.replace("only clear user selection", "only a clear user selection")
        case.assertIn(f"{term}: {body}", profile_text(profile).replace("*", ""))

def raw_policy_text(name: str) -> str:
    path = REPO / "codex/skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")
    return " ".join(path.read_text().split())

def profile_text(role: str) -> str:
    return " ".join(tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())
                    ["developer_instructions"].lower().split())

SHARED_TERMS = {
    "preservation rule": "preserve unrelated staged, unstaged, and untracked changes and edit ownership. never "
                         "automatically stash, reset, clean, unstage, discard, amend, or delete branches or worktrees. "
                         "never change permissions, delete locks, or bypass the sandbox to proceed. stop and report to "
                         "orchestrator, who reports to the user",
    "explicit choice": "only clear user selection counts. planning approval, silence, refusal of another option and ambiguous replies do not",
    "stop and inspect": "on failure/partial completion, stop dependent work. record actual path, branch or detached head, head, index, files and completed steps. never automatically retry, fall back or repeat completed work. revalidate affected gates after resolution",
    "evidence verdict": "each criterion is proven, unmet or unverified. passing runs, reports and dispositions never turn unverified into proven. keep unverified scope visible",
}

class CodexRoleHardeningTests(unittest.TestCase):
    """Static checks of the written Codex role-boundary contract; not runtime agent compliance."""

    def skill(self) -> str:
        return " ".join((REPO / "codex/skill/SKILL.md").read_text().split())

    def raw(self, name: str) -> str:
        return raw_policy_text(name)

    def test_role_gate_planner_only_ceo_skill_ban_and_routing(self) -> None:
        text = (REPO / "codex/skill/SKILL.md").read_text()
        paragraphs = text.split("\n\n")
        gate = next((p for p in paragraphs if p.startswith(("Role gate:", "**Role gate:**"))), "")
        freshness = next((p for p in paragraphs if p.startswith("Each top-level task")), "")
        for needle in ("Only Planner (`arc_planner`) authors design/brainstorming drafts and first complete spec/plan drafts",
                       "Orchestrator reviews and directly revises the same spec or plan when needed",
                       "missing or failed first drafts do not transfer initial authorship",
                       "New product decisions outside approved scope require user input first",
                       "Orchestrator never invokes `brainstorming`/`writing-plans` through its own Skill tool",
                       "If auto-triggered, stop and route to Planner with that SKILL.md path in the brief",
                       "questions never waives design/approval gates", "Planner returns questions to Orchestrator"):
            with self.subTest(needle=needle):
                self.assertIn(needle, " ".join(gate.split()))
        for needle in ("Each top-level task (one plan task, or the entire request without a plan) receives a fresh Implementer",
                       "Each task requiring QA receives fresh QA, never reused from another task",
                       "Same-task corrections/rechecks default to current Implementer/QA while assignment remains valid"):
            with self.subTest(needle=needle):
                self.assertIn(needle, " ".join(freshness.split()))
        self.assertIn("Orchestrator selects path, integrates, announces scope, routes revisions and obtains approval", self.raw("planning"))
        self.assertIn("Only Planner authors the first complete spec or plan draft and self-review", self.raw("planning"))
        self.assertIn("Unavailable/failed Planner stops first drafting rather than transferring authorship", self.raw("planning"))
        self.assertLessEqual(len(re.findall(r"[.!?](?:\s|$)", gate)), 5)

    def test_every_profile_has_stay_in_role_line(self) -> None:
        for role in ("planner", "scouter", "implementer", "qa", "reviewer"):
            with self.subTest(role=role):
                body = tomllib.loads((REPO / f"codex/agents/arc-{role}.toml").read_text())["developer_instructions"]
                self.assertRegex(" ".join(body.split()), r"Stay in your role: ONLY [^;]+; NEVER [^.]+\.")

    def test_qa_freshness_and_no_contradictory_substitution(self) -> None:
        core, verification = self.raw("verification"), self.raw("verification")
        for text in (core, verification):
            self.assertNotIn("QA or Orchestrator focused checks", text)
        self.assertRegex(core, r"Ordinary/significant tasks need fresh QA before acceptance")
        self.assertRegex(core, r"only small, low-risk tasks.*Orchestrator focused checks")
        self.assertIn("FRESH QA instance per task that needs QA", verification)
        for platform in ("codex", "claude"):
            with self.subTest(platform=platform):
                root = REPO / platform / "skill"
                gate = " ".join((root / "SKILL.md").read_text().split())
                coordination = " ".join((root / "references/coordination.md").read_text().split())
                verification = " ".join((root / "references/verification.md").read_text().split())
                self.assertIn("a QA finding within the current task does not itself create a new task", gate)
                self.assertIn("default to the current Implementer for same-task QA corrections", coordination)
                self.assertIn("Replace or restart a role only when its context is invalid or unavailable, or the task boundary changes", coordination)
                self.assertIn("approved scope, workspace, ownership, and relevant assignment context remain valid", coordination)
                self.assertIn("Orchestrator rechecks workspace, branch/HEAD and change state against the brief", coordination)
                self.assertIn("After an approved plan or acceptance-criteria amendment, start a fresh Implementer", coordination)
                self.assertIn("default to the current QA for post-fix rechecks of the same task", verification)
                self.assertIn("reproduction path and invalidated related checks", verification)
                self.assertIn("actual actor, target state, outcomes, and limitations", verification)
                self.assertIn("Reusing QA does not reuse stale evidence", verification)
        policy = json.loads((REPO / "lib/policy/role-policy.json").read_text())
        boundary = next(rule for rule in policy["rules"] if rule["id"] == "role.orchestrator-boundary")
        for needle in ("fresh Implementer per top-level task", "fresh QA per top-level task that needs QA",
                       "default same-task QA findings to the current Implementer and post-fix rechecks to the current QA",
                       "approved plan or acceptance-criteria amendment requires a fresh Implementer",
                       "QA findings alone do not create a new task"):
            self.assertIn(needle, boundary["text"])
        self.assertIn("Outside the required final plan correction loop, Orchestrator decides when a Reviewer recheck is warranted", verification)

    def test_reviewer_reuse_requires_independence_and_refreshed_context(self) -> None:
        verification = " ".join(self.raw("verification").split())
        for phrase in (
            "Fresh-per-task rules apply to Implementer and QA, not Reviewer",
            "Orchestrator may reuse a Reviewer only while independent of implementation and self-review",
            "relevant assignment context remains valid",
            "refreshed review scope, target state, and evidence are provided",
            "otherwise assign another independent Reviewer",
            "Reusing a Reviewer does not reuse an earlier verdict or waive required review timing or coverage",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, verification)

    def test_restart_brief_rule_lives_in_handoff_only(self) -> None:
        core, handoff = self.skill(), self.raw("handoff")
        self.assertNotIn("delta-only restart brief", core)
        self.assertNotIn("`unchanged` means unchanged relative to", core)
        self.assertIn("`unchanged` means unchanged relative to the record file", handoff)
        self.assertNotIn("carries the full record inline (no delta", handoff)
        self.assertEqual(handoff.count("full record inline"), 1)

    def test_read_only_roles_drop_sandbox_mode_and_use_prompt_guards(self) -> None:
        for role in ("planner", "scouter", "reviewer"):
            with self.subTest(role=role):
                path = REPO / f"codex/agents/arc-{role}.toml"
                self.assertNotIn("sandbox_mode", tomllib.loads(path.read_text()))
                self.assertIn("MUST NOT edit files; NEVER run commands that change state",
                              " ".join(tomllib.loads(path.read_text())["developer_instructions"].split()))
        core = self.raw("coordination")
        self.assertRegex(core, r"After each read-only role returns \(Scouter, Planner, Reviewer\), Orchestrator checks `git status`.*stops and reports under the Preservation rule")
        self.assertIn("prompt-level guards, not sandbox enforcement", core)

    def test_dangling_references_removed_and_install_path_real(self) -> None:
        core = self.skill()
        for gone in ("branch protection", "Implementer repair limits", "existing CEO depth judgment", "install.py",
                     "short design"):
            with self.subTest(gone=gone):
                self.assertNotIn(gone, core)
        self.assertIn("scope record", self.raw("handoff"))
        self.assertIn("Environment failure waives no check or depth judgment.", self.raw("verification"))
        self.assertIn("means this assessment", self.raw("planning"))
        self.assertIn("Planner proposes, Orchestrator decides", self.raw("planning"))
        self.assertIn("routes the correction to Implementer", self.raw("handoff"))

    def test_worktree_branch_collision_never_auto_suffixes(self) -> None:
        self.assertNotIn("append `-2`", self.raw("handoff-prep"))
        self.assertIn("Never add suffixes automatically; approve new candidates", self.raw("handoff-prep"))

    def test_limits_policy_is_not_hard_runtime_enforcement(self) -> None:
        text = (REPO / "codex/skill/references/limits.md").read_text()
        self.assertIn("Cumulative limits and scheduling are prompt policy, not hard runtime controls.", text)
class InternalSuperpowersContractTests(unittest.TestCase):
    # Approved T1 structural contract; actual next-turn behavior needs separate evidence.
    def test_internal_superpowers_paths_and_runtime_boundaries(self):
        for platform, extension in [('codex', 'toml'), ('claude', 'md')]:
            core = (REPO / f'{platform}/skill/references/coordination.md').read_text()
            for name in ('brainstorming', 'writing-plans', 'test-driven-development'):
                self.assertIn(f'references/{name}.md', core)
            for role, names in [('planner', ('brainstorming', 'writing-plans')), ('implementer', ('test-driven-development',))]:
                text = (REPO / f'{platform}/agents/arc-{role}.{extension}').read_text()
                for name in names:
                    self.assertIn(f'references/{name}.md', text)
            self.assertIn('no global discovery/external Skill call/automatic download', core)
            self.assertIn('references/arc-visual-companion.md', (REPO / f'{platform}/skill/SKILL.md').read_text())
            self.assertFalse((REPO / f'{platform}/skill/references/superpowers').exists())

    def test_flat_imported_assets_match_original_provenance_and_both_platforms(self):
        mapping = {'brainstorming/SKILL.md': 'brainstorming.md', 'writing-plans/SKILL.md': 'writing-plans.md',
                   'test-driven-development/SKILL.md': 'test-driven-development.md',
                   'brainstorming/visual-companion.md': 'visual-companion.md',
                   'brainstorming/builder-check-prompt.md': 'builder-check-prompt.md',
                   'test-driven-development/writing-good-tests.md': 'writing-good-tests.md', 'LICENSE': 'superpowers-LICENSE'}
        mapping.update({f'brainstorming/scripts/{name}': f'scripts/{name}' for name in
                        ('start-server.sh', 'stop-server.sh', 'server.cjs', 'helper.js', 'frame-template.html')})
        for platform in ('codex', 'claude'):
            base = REPO / f'{platform}/skill/references'
            provenance = json.loads((base / 'superpowers-provenance.json').read_bytes())
            self.assertEqual(set(provenance['files']), set(mapping))
            for source, destination in mapping.items():
                actual = (base / destination).read_bytes()
                self.assertEqual(hashlib.sha256(actual).hexdigest(), provenance['files'][source])
                self.assertEqual(actual, (REPO / f'codex/skill/references/{destination}').read_bytes())
            self.assertNotEqual((base / 'arc-visual-companion.md').read_bytes(), (base / 'visual-companion.md').read_bytes())


class WorkspaceBeforeDocumentsTests(unittest.TestCase):
    # Approved T1 structural checks; consuming-agent runtime compliance is unverified.
    def text(self, name):
        return " ".join((REPO / "codex/skill" / ("SKILL.md" if name == "core" else f"references/{name}.md")).read_text().lower().split())

    def test_normal_order_selects_and_prepares_before_formal_drafting(self):
        workspace_contract.normal_order(self)

    def test_choice_request_uses_planned_documents_and_verified_target(self):
        text = self.text("handoff-prep")
        request_heading = "### execution-target request gate"
        mutation_heading = "### git mutation evidence gate"
        self.assertIn(request_heading, text)
        self.assertIn(mutation_heading, text)
        gate = text.split(request_heading, 1)[1].split(mutation_heading, 1)[0]
        marker = "before offering managed worktrees"
        self.assertIn(marker, gate)
        workspace_contract.choice_presentation(self, gate, gate.split(marker, 1)[0])

    def test_formal_drafting_and_save_require_prepared_target(self):
        text = self.text("planning")
        profile = " ".join((REPO / "codex/agents/arc-planner.toml").read_text().lower().split())
        workspace_contract.formal_drafting(self, text, profile)

    def test_phase_specific_git_and_batch_gates(self):
        workspace_contract.phase_specific(self)

    def test_platform_targets_and_legacy_transfer_boundaries(self):
        text = self.text("handoff-prep")
        self.assertIn("current checkout", text)
        self.assertIn("task branch", text)
        worktree = self.text("handoff-worktree")
        for phrase in ("before formal drafting/saving", "registration", "current-chat attachment", "common directory", "approved branch", "legacy/restart/explicit-target-change", "never move/delete/modify source documents"):
            self.assertIn(phrase, worktree)

    def test_choice_reuse_and_reselection_before_documents(self):
        workspace_contract.choice_reuse(self)

    def test_document_omissions_and_implementer_gate_remain(self):
        workspace_contract.document_omissions(self)


class HarnessReliabilityProfileTests(unittest.TestCase):
    """Approved H1/H2/H3/H4 written-contract checks, not runtime evidence."""
    def test_profiles_bound_recovery_without_relaxing_role_authority(self):
        for platform, extension in (("codex", "toml"), ("claude", "md")):
            for role in ("scouter", "planner", "implementer", "qa", "reviewer"):
                path = REPO / platform / "agents" / f"arc-{role}.{extension}"
                text = " ".join(path.read_text().split())
                with self.subTest(path=str(path)):
                    for pattern in (r"optional read method", r"pre-authorized.*side-effect-free",
                                    r"required input.*authority.*target.*ownership.*partial mutation.*unknown state",
                                    r"resume brief.*completed work.*failure.*resolution",
                                    r"root AGENTS\.md.*absence.*not.*absence of instructions"):
                        self.assertRegex(text, pattern)
                    self.assertIn("Specialists must not change Git state during implementation or recovery", text)

    def test_visual_roles_preserve_output_identity_and_verdict_limits(self):
        for platform, extension in (("codex", "toml"), ("claude", "md")):
            for role in ("implementer", "qa"):
                text = (REPO / platform / "agents" / f"arc-{role}.{extension}").read_text()
                with self.subTest(platform=platform, role=role):
                    self.assertRegex(text, r"approved visual source.*version.*approval.*access")
                    self.assertRegex(text, r"actual.output identity.*revision.*basis")
                    self.assertRegex(text, r"pass.*mismatch.*unverified")
