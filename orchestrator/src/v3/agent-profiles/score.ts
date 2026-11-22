/**
 * Deterministic scoring for Agent Intelligence Profiles (V2-INT-03).
 *
 * score = true_full_pass_rate * log(1 + sample_size) - rework_penalty
 * rework_penalty = rework_mean * weight when honesty is reported|estimated; else 0
 *   (with limitation that penalty was skipped due to UNAVAILABLE).
 */

import type { AgentIntelligenceProfile, ObservedMetric } from "./types.js";

export interface ScoreComponents {
  score: number | null;
  true_full_pass_rate: number | null;
  sample_size: number;
  rework_penalty: number;
  limitations: string[];
}

export function computeIntelligenceScore(
  profile: AgentIntelligenceProfile,
  reworkPenaltyWeight = 0.5,
): ScoreComponents {
  const limitations: string[] = [];
  const sample_size = profile.sample_size;

  if (sample_size <= 0) {
    return {
      score: null,
      true_full_pass_rate: null,
      sample_size,
      rework_penalty: 0,
      limitations: ["sample_size_zero"],
    };
  }

  if (profile.true_full_pass_rate.honesty === "UNAVAILABLE" || profile.true_full_pass_rate.value == null) {
    return {
      score: null,
      true_full_pass_rate: null,
      sample_size,
      rework_penalty: 0,
      limitations: ["true_full_pass_rate_UNAVAILABLE"],
    };
  }

  const rate = profile.true_full_pass_rate.value;
  let rework_penalty = 0;
  if (profile.rework_mean.honesty === "UNAVAILABLE" || profile.rework_mean.value == null) {
    limitations.push("rework_penalty_skipped_UNAVAILABLE");
  } else {
    rework_penalty = profile.rework_mean.value * reworkPenaltyWeight;
  }

  const score = rate * Math.log(1 + sample_size) - rework_penalty;
  return {
    score,
    true_full_pass_rate: rate,
    sample_size,
    rework_penalty,
    limitations,
  };
}

/** Helper for tests/fixtures — build an ObservedMetric without inventing. */
export function observed(
  value: number | null,
  honesty: ObservedMetric["honesty"],
): ObservedMetric {
  if (honesty === "UNAVAILABLE") {
    return { value: null, honesty: "UNAVAILABLE" };
  }
  if (value == null) {
    return { value: null, honesty: "UNAVAILABLE" };
  }
  return { value, honesty };
}
