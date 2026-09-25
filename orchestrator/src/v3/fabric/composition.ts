/**
 * CompositionPlanner — compile need + candidates into a CompositionPlan.
 * Produces plan OR unmet_need. Does NOT execute providers or Engine.
 */

import { CAPABILITY_PROFILES } from "../../discovery/capability-profiles.js";
import type { CandidateCapability, CompositionPlan, CompositionResult } from "./types.js";
import { isBlockedLifecycleState, isUsableLifecycleState, lifecycleStateRank } from "./lifecycle.js";

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function usableCandidates(candidates: CandidateCapability[]): CandidateCapability[] {
  return candidates.filter(
    (c) => isUsableLifecycleState(c.lifecycle_state) && !isBlockedLifecycleState(c.lifecycle_state),
  );
}

function profileStepsForNeed(need: string, usableIds: Set<string>): string[] | null {
  const n = normalize(need);
  for (const [profile, caps] of Object.entries(CAPABILITY_PROFILES)) {
    if (!n.includes(profile)) continue;
    const steps = caps.filter((id) => usableIds.has(id));
    if (steps.length > 0) return steps;
  }
  return null;
}

/**
 * Plan a capability composition for a need.
 * Inegociável: never invokes providers; never mutates registry.
 */
export function planComposition(
  need: string,
  candidates: CandidateCapability[],
): CompositionResult {
  const allIds = candidates.map((c) => c.capability_id);
  const usable = usableCandidates(candidates).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return lifecycleStateRank(b.lifecycle_state) - lifecycleStateRank(a.lifecycle_state);
  });

  if (usable.length === 0) {
    return {
      status: "unmet_need",
      need,
      rationale:
        candidates.length === 0
          ? "no registry candidates matched need"
          : "candidates present but none in usable lifecycle state (QUARANTINED/REVOKED/REPLACED or non-usable)",
      candidate_ids: allIds,
    };
  }

  const usableIds = new Set(usable.map((c) => c.capability_id));
  const exact = usable.find((c) => c.match_reason === "exact_id" || normalize(c.capability_id) === normalize(need));
  if (exact) {
    const plan: CompositionPlan = {
      status: "plan",
      need,
      steps: [exact.capability_id],
      rationale: `single exact match ${exact.capability_id} (lifecycle=${exact.lifecycle_state})`,
      candidate_ids: allIds,
    };
    return plan;
  }

  const profileSteps = profileStepsForNeed(need, usableIds);
  if (profileSteps && profileSteps.length > 0) {
    return {
      status: "plan",
      need,
      steps: profileSteps,
      rationale: `profile composition covering need (${profileSteps.length} steps); does not execute`,
      candidate_ids: allIds,
    };
  }

  // Multi-candidate: take top distinct ids by score (bounded composition stub)
  const top = usable.slice(0, Math.min(3, usable.length));
  if (top.length === 1) {
    return {
      status: "plan",
      need,
      steps: [top[0]!.capability_id],
      rationale: `best scored candidate ${top[0]!.capability_id} (score=${top[0]!.score}, ${top[0]!.match_reason})`,
      candidate_ids: allIds,
    };
  }

  return {
    status: "plan",
    need,
    steps: top.map((c) => c.capability_id),
    rationale: `ranked multi-step stub from top ${top.length} candidates; composition not executed`,
    candidate_ids: allIds,
  };
}

/** Alias matching Briefing name CompositionPlanner. */
export const CompositionPlanner = {
  plan: planComposition,
};
