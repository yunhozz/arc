// Instruction placement only; runtime policy and role authority remain canonical.
const reviews = ['review.significant-no-plan', 'review.significant-plan', 'review.final-plan-recheck'];
export const POLICY_PROJECTIONS = Object.freeze(Object.fromEntries(Object.entries({
  core: ['scope.non-escalation', 'external.explicit-user-authority', 'role.orchestrator-boundary'],
  assignment: ['git.specialists-deny', 'role.scouter-read-only', 'role.planner-draft-only', 'role.coder-implementation', 'role.qa-verification', 'role.reviewer-independent'],
  planning: ['git.orchestrator-accept-commit', ...reviews, 'planning.plan-amend', 'planning.planner-brief'],
  handoff: ['git.specialists-deny', 'role.coder-implementation', ...reviews],
  preparation: ['scope.non-escalation', 'git.specialists-deny', 'git.orchestrator-accept-commit', 'external.explicit-user-authority', 'planning.plan-amend'],
  verification: ['git.orchestrator-accept-commit', ...reviews, 'planning.plan-amend'],
  commit: ['scope.non-escalation', 'git.orchestrator-accept-commit', 'external.explicit-user-authority', 'planning.plan-amend'],
}).map(([name, ids]) => [name, Object.freeze(ids)])));

export function validatePolicyProjections(policy, projections = POLICY_PROJECTIONS) {
  const canonical = new Set(policy.rules.map(rule => rule.id));
  const covered = new Set();
  for (const [name, ids] of Object.entries(projections)) {
    const seen = new Set();
    for (const id of ids) {
      if (!canonical.has(id)) throw new Error(`Role policy: unknown projection rule ${id} in ${name}`);
      if (seen.has(id)) throw new Error(`Role policy: duplicate projection rule ${id} in ${name}`);
      seen.add(id); covered.add(id);
    }
  }
  for (const id of canonical) if (!covered.has(id)) throw new Error(`Role policy: uncovered projection rule ${id}`);
}
