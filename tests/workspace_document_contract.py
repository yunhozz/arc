"""Shared assertions for the platform workspace and planning contracts."""


def normal_order(case):
    planning = case.text("planning")
    case.assertIn("order:", planning)
    order = planning.split("order:", 1)[1].split("implementer", 1)[0]
    cursor = 0
    for marker in ("initial design approval", "explicit target", "actual preparation/verification",
                   "required spec drafting/save/self-review/individual approval",
                   "required plans drafting/save/review/individual approval", "full set",
                   "verify existing commits/batch remaining approvals", "final git"):
        found = order.find(marker, cursor)
        case.assertGreaterEqual(found, cursor, marker)
        cursor = found + len(marker)


def choice_presentation(case, gate, common):
    case.assertIn("before requesting choice, verify/record planned document scope", common)
    case.assertIn("present each supported option with:", common)
    case.assertIn("obtain explicit choice before preparation", common)
    case.assertLess(common.index("present each supported option with:"), common.index("obtain explicit choice before preparation"))
    presentation = common.split("present each supported option with:", 1)[1].split("obtain explicit choice before preparation", 1)[0]
    for phrase in ("planned documents", "coverage", "expected relative paths", "dependencies/order",
                   "pending drafting/approval", "verified absolute workspace/repository", "branch or detached head",
                   "base head", "validated offered branch candidate/collision", "staged/unstaged/untracked state",
                   "preservation/ownership"):
        case.assertIn(phrase, presentation)
    case.assertIn("completed documents/individual approvals are not yet required", gate)


def formal_drafting(case, text, profile):
    for phrase in ("initial design/brainstorming may precede target choice", "complete pre-save drafts returned only in chat",
                   "actual absolute workspace/repository", "branch/detached head/head", "changes/ownership",
                   "explicit choice/preparation", "in-target absolute document paths", "planner drafts for verified target; orchestrator saves there",
                   "missing/mismatched evidence stops affected drafting/saving"):
        case.assertIn(phrase, text)
    for phrase in ("before formal spec/plan drafting (including a complete draft before saving)", "actual prepared-target evidence",
                   "absolute workspace/repository", "branch or detached head", "head", "changes/ownership",
                   "explicit choice/preparation", "absolute document paths inside the target", "initial design proposals"):
        case.assertIn(phrase, profile)


def phase_specific(case):
    text = case.text("handoff-prep")
    for phrase in ("initial preparation verifies planned scope/inputs without requiring complete approved documents",
                   "document staging/commit also verifies the full set, individual approvals/versions/dependencies and actual index",
                   "preservation and ownership"):
        case.assertIn(phrase, text)
    case.assertIn("preparation alone authorizes no implementer", case.text("handoff"))


def choice_reuse(case):
    text = case.text("handoff")
    for phrase in ("formal spec/plan drafting/saving follows choice/actual preparation",
                   "without choice/valid reuse, wait", "reuse through unchanged-scope/target drafting/implementation",
                   "authorized head/dirty changes alone do not invalidate choice; verify preservation/ownership",
                   "changed scope/target requires fresh choice before dependent drafting/preparation without waiting for full documents"):
        case.assertIn(phrase, text)


def document_omissions(case):
    text = case.text("planning")
    for phrase in ("before every implementer assignment or direct code edit",
                   "record depth and risk separately", "required documents and dependencies",
                   "arc omission conditions and evidence", "individual approvals and versions",
                   "verified docs-only commit", "missing evidence blocks affected implementation"):
        with case.subTest(readiness=phrase):
            case.assertTrue(phrase in text, f"missing implementation readiness contract: {phrase}")
    for phrase in ("a required plan does not itself require a written spec", "spike", "bounded", "non-behavior",
                   "add no spec duty to spike/plan-skip/non-behavior paths"):
        case.assertIn(phrase, text)
    case.assertIn("implementer", case.text("handoff"))
