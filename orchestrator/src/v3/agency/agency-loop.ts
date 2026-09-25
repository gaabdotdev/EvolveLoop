/**
 * AgencyLoop — single-step (not daemon). Emits AgencyProposal[]; never calls providers.
 * Consumes WorldSnapshot.open_signals / belief_ids for rationale + risk bump (AR-H01).
 */

import type { GoalContract } from "../contracts/types.js";
import { AGENCY_ACTIONABLE_STATES } from "../goals/goal-store.js";
import type {
  AgencyLoopInput,
  AgencyLoopResult,
  AgencyProposal,
  ProposalRisk,
  WorldSnapshot,
} from "./types.js";

const RISK_ORDER: ProposalRisk[] = ["low", "medium", "high", "critical"];

function inferRisk(goal: GoalContract, override?: ProposalRisk): ProposalRisk {
  if (override) return override;
  const policy = (goal.spec.risk_policy ?? "").toLowerCase();
  if (policy.includes("critical")) return "critical";
  if (policy.includes("high")) return "high";
  if (policy.includes("medium")) return "medium";
  if (policy.includes("low")) return "low";
  if (goal.spec.constraints.length >= 3) return "medium";
  return "low";
}

function bumpRisk(risk: ProposalRisk): ProposalRisk {
  const idx = RISK_ORDER.indexOf(risk);
  if (idx < 0) return "medium";
  return RISK_ORDER[Math.min(idx + 1, RISK_ORDER.length - 1)]!;
}

function capabilityHint(goal: GoalContract): string | undefined {
  const fromNonGoals = goal.spec.non_goals.find((n) => n.startsWith("capability:"));
  if (fromNonGoals) return fromNonGoals.slice("capability:".length).trim() || undefined;
  const rp = goal.spec.risk_policy ?? "";
  const m = /capability=([^\s,;]+)/i.exec(rp);
  return m?.[1];
}

function sortGoals(goals: GoalContract[], priorities?: Record<string, number>): GoalContract[] {
  return [...goals].sort((a, b) => {
    const pa = priorities?.[a.metadata.id] ?? 0;
    const pb = priorities?.[b.metadata.id] ?? 0;
    return pb - pa;
  });
}

/** Detect contradiction / invalidation drift in open_signals (WorldModel reconcile format). */
export function hasContradictionSignals(signals: readonly string[]): boolean {
  return signals.some((s) => {
    const lower = s.toLowerCase();
    return (
      lower.startsWith("contradictory:") ||
      lower.includes("contradict") ||
      lower.includes("invalidates")
    );
  });
}

/**
 * Build proposal rationale from world snapshot. Always returns a string when
 * any world context exists; empty string only when world is empty.
 */
export function worldGroundingRationale(world: WorldSnapshot): {
  rationale: string;
  contradiction: boolean;
} {
  const signals = world.open_signals ?? [];
  const beliefs = world.belief_ids ?? [];
  const observations = world.observation_ids ?? [];
  const parts: string[] = [];

  if (signals.length > 0) {
    parts.push(`open_signals[${signals.length}]=${signals.slice(0, 5).join(" | ")}`);
  }
  if (beliefs.length > 0) {
    parts.push(`belief_ids=${beliefs.slice(0, 8).join(",")}`);
  }
  if (observations.length > 0) {
    parts.push(`observation_ids=${observations.slice(0, 8).join(",")}`);
  }

  const contradiction = hasContradictionSignals(signals);
  if (contradiction) {
    parts.push("world_contradiction:risk_bump");
  }

  return {
    rationale: parts.join("; "),
    contradiction,
  };
}

/**
 * One Agency tick: for each active/verifying goal (§176), propose an intent.
 * Does NOT call providers, ExecutionEngine, or PolicyEngine.
 * Inegociável: WorldSnapshot signals are consumed (not void-ignored).
 */
export function runAgencyStep(input: AgencyLoopInput): AgencyLoopResult {
  const emitted_at = new Date().toISOString();
  const actionable = new Set<string>(AGENCY_ACTIONABLE_STATES);
  const candidates = sortGoals(
    input.portfolio.goals.filter((g) => actionable.has(g.spec.lifecycle_state)),
    input.portfolio.priorities,
  );

  const grounding = worldGroundingRationale(input.world);
  // Touch policy_ref so PolicySnapshot is part of the grounded tick (audit trail).
  const policyNote = `policy_ref=${input.policy.policy_ref}`;

  const proposals: AgencyProposal[] = candidates.map((goal, index) => {
    let risk = inferRisk(goal, input.risk_by_goal?.[goal.metadata.id]);
    if (grounding.contradiction) {
      // AR-H01 / false-success: contradiction must not leave low-risk on ALLOW path.
      // Escalate at least to high → HUMAN_GATE (confirm) under NORMAL.
      risk = bumpRisk(risk);
      const idx = RISK_ORDER.indexOf(risk);
      const highIdx = RISK_ORDER.indexOf("high");
      if (idx >= 0 && highIdx >= 0 && idx < highIdx) {
        risk = "high";
      }
    }
    const hint = capabilityHint(goal);
    const governor_required =
      risk === "high" || risk === "critical" || !hint || grounding.contradiction;

    const rationaleParts = [
      grounding.rationale || "world:no_open_signals",
      policyNote,
    ];

    return {
      proposal_id: `prop-${goal.metadata.id}-${index + 1}`,
      goal_id: goal.metadata.id,
      intent: `pursue:${goal.spec.desired_outcome}`,
      capability_hint: hint,
      risk,
      governor_required,
      rationale: rationaleParts.filter(Boolean).join("; "),
    };
  });

  return {
    proposals,
    emitted_at,
    world_snapshot_id: input.world.snapshot_id,
    policy_snapshot_id: input.policy.snapshot_id,
  };
}

export class AgencyLoop {
  /** Single-step; no heartbeat / daemon. */
  step(input: AgencyLoopInput): AgencyLoopResult {
    return runAgencyStep(input);
  }
}
