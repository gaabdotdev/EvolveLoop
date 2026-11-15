/**
 * Routing helpers for capability profiles.
 *
 * ADR-V4-0010 / WAVE4-COMMON: until methodology is ACCEPTED, profiles MUST NOT
 * prefer an executor for L2/L3 work on score. This cut never prefers by score
 * at any autonomy level — no helper ranks, sorts, or returns a "best" executor.
 *
 * Sensitive work remains a Policy concern (D04), not a score concern.
 */

import type { AutonomyLevel, CapabilityProfile } from "../contracts/index.js";
import { ScoreRoutingForbidden } from "./errors.js";
import { methodologyAllowsActive } from "./methodology.js";
import type { RoutingAdvice } from "./types.js";

export const SCORE_PREFERENCE_REASON =
  "methodology is PROVISIONAL; capability scores must not prefer an executor (ADR-V4-0010)";

function isSensitiveAutonomy(level: AutonomyLevel): boolean {
  return level === "L2_SUPERVISED" || level === "L3_AUTONOMOUS";
}

/**
 * Always FORBIDDEN. `ranked_executor_ids` is the empty tuple so callers cannot
 * accidentally treat this as a ranking API.
 */
export function adviseExecutorPreference(input: {
  autonomy: AutonomyLevel;
  profiles: CapabilityProfile[];
}): RoutingAdvice {
  for (const profile of input.profiles) {
    if (profile.status === "ACTIVE" && !methodologyAllowsActive(profile.methodology)) {
      throw new ScoreRoutingForbidden(input.autonomy);
    }
  }
  return {
    autonomy: input.autonomy,
    preference: "FORBIDDEN",
    ranked_executor_ids: [],
    reason: isSensitiveAutonomy(input.autonomy)
      ? `${SCORE_PREFERENCE_REASON}; L2/L3 routing is constrained by Policy not score (D04)`
      : SCORE_PREFERENCE_REASON,
    unordered_profile_ids: input.profiles.map((p) => p.profile_id),
  };
}

/**
 * Identity copy. Does not sort by any metric. Order is caller order, not quality.
 */
export function profilesWithoutScoreOrder(profiles: CapabilityProfile[]): CapabilityProfile[] {
  return profiles.map((p) => structuredClone(p));
}

export function preferExecutorByScore(_autonomy: AutonomyLevel, _profiles: CapabilityProfile[]): never {
  throw new ScoreRoutingForbidden(_autonomy);
}

/** Production routing must not treat a metric value as a preference key. */
export function metricMayDriveRouting(_profile: CapabilityProfile): false {
  return false;
}
