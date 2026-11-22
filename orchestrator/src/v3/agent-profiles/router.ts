/**
 * Intelligence router — pick agent_id by observational score, else static fallback.
 * V2-INT-03: score = true_full_pass_rate * log(1+sample_size) - rework_penalty
 */

import { computeIntelligenceScore } from "./score.js";
import type { AgentProfileStore } from "./store.js";
import type {
  IntelligenceRouteDecision,
  IntelligenceRouteRequest,
  ScoredAgentCandidate,
  StaticRouteDelta,
} from "./types.js";
import { observed } from "./score.js";

function nowIso(): string {
  return new Date().toISOString();
}

const DEFAULT_MIN_SAMPLE = 5;
const DEFAULT_REWORK_WEIGHT = 0.5;

/**
 * Route by AgentIntelligenceProfile when sample_size ≥ min; otherwise static fallback.
 * Deterministic: ties break by lexicographically smaller agent_id.
 */
export function routeByIntelligence(
  store: AgentProfileStore,
  req: IntelligenceRouteRequest,
): IntelligenceRouteDecision {
  const min_sample_size = req.min_sample_size ?? DEFAULT_MIN_SAMPLE;
  const weight = req.rework_penalty_weight ?? DEFAULT_REWORK_WEIGHT;
  const limitations: string[] = [
    "score=true_full_pass_rate*log(1+sample_size)-rework_penalty",
    `min_sample_size=${min_sample_size}`,
  ];

  const candidates: ScoredAgentCandidate[] = [];

  for (const agent_id of req.candidate_agent_ids) {
    const profile = store.getProfile(agent_id, req.task_type);
    if (!profile || profile.sample_size === 0) {
      candidates.push({
        agent_id,
        sample_size: 0,
        score: null,
        eligible: false,
        reason: "no_profile_or_empty_sample",
        true_full_pass_rate: observed(null, "UNAVAILABLE"),
        rework_mean: observed(null, "UNAVAILABLE"),
      });
      continue;
    }

    const scored = computeIntelligenceScore(profile, weight);
    for (const lim of scored.limitations) {
      limitations.push(`${agent_id}:${lim}`);
    }

    const eligible =
      profile.sample_size >= min_sample_size && scored.score != null;

    candidates.push({
      agent_id,
      sample_size: profile.sample_size,
      score: scored.score,
      eligible,
      reason: eligible
        ? "eligible"
        : scored.score == null
          ? "score_unavailable"
          : `sample_below_min(${profile.sample_size}<${min_sample_size})`,
      true_full_pass_rate: profile.true_full_pass_rate,
      rework_mean: profile.rework_mean,
    });
  }

  const eligible = candidates.filter((c) => c.eligible && c.score != null);
  if (eligible.length === 0) {
    limitations.push("static_fallback_insufficient_sample");
    return {
      kind: "IntelligenceRouteDecision",
      task_type: req.task_type,
      mode: "static_fallback",
      selected_agent_id: req.static_fallback_agent_id,
      score: null,
      min_sample_size,
      candidates,
      limitations,
      generated_at: nowIso(),
    };
  }

  eligible.sort((a, b) => {
    const ds = (b.score as number) - (a.score as number);
    if (ds !== 0) return ds;
    return a.agent_id.localeCompare(b.agent_id);
  });
  const best = eligible[0]!;

  return {
    kind: "IntelligenceRouteDecision",
    task_type: req.task_type,
    mode: "profile",
    selected_agent_id: best.agent_id,
    score: best.score,
    min_sample_size,
    candidates,
    limitations,
    generated_at: nowIso(),
  };
}

/**
 * Compare profile routing vs a static agent choice (fixture / audit delta API).
 * Does not invent quality gains — only structural agreement + modes.
 */
export function compareToStaticRoute(
  decision: IntelligenceRouteDecision,
  staticSelectedAgentId: string,
): StaticRouteDelta {
  const agreed = decision.selected_agent_id === staticSelectedAgentId;
  let delta_note: string;
  if (decision.mode === "static_fallback") {
    delta_note = agreed
      ? "both_use_static_fallback_or_same_id"
      : "profile_fell_back_but_static_differs";
  } else if (agreed) {
    delta_note = "profile_agrees_with_static";
  } else {
    delta_note = "profile_prefers_different_agent";
  }

  return {
    kind: "StaticRouteDelta",
    task_type: decision.task_type,
    profile_selected_agent_id: decision.selected_agent_id,
    static_selected_agent_id: staticSelectedAgentId,
    agreed,
    profile_mode: decision.mode,
    profile_score: decision.score,
    delta_note,
  };
}

/**
 * Fixture helper: static router that always returns a fixed agent_id.
 * Used only for delta comparison in tests — not an intelligence claim.
 */
export function staticRouteAgent(agentId: string): string {
  return agentId;
}
