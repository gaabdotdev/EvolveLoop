import { describe, expect, it } from "vitest";
import {
  ScoreRoutingForbidden,
  adviseExecutorPreference,
  metricMayDriveRouting,
  preferExecutorByScore,
  profilesWithoutScoreOrder,
} from "../../../src/v4/capability/index.js";
import { assembleProfile, sequentialProfileId } from "../../../src/v4/capability/index.js";
import { CONTEXT, EXECUTOR_A, EXECUTOR_B, LATER, NOW, observedEstimate } from "./fixtures.js";

function pair() {
  const low = assembleProfile({
    profile_id: sequentialProfileId(1),
    subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
    context: { ...CONTEXT },
    metrics: [observedEstimate({ value: 0.1, uncertainty: { method: "point_interval.v0", lower: 0.1, upper: 0.1 } })],
    computed_at: NOW,
    valid_until: LATER,
  });
  const high = assembleProfile({
    profile_id: sequentialProfileId(2),
    subject: { executor_id: EXECUTOR_B, executor_version: "1.0.0" },
    context: { ...CONTEXT },
    metrics: [observedEstimate({ value: 0.99, uncertainty: { method: "point_interval.v0", lower: 0.99, upper: 0.99 } })],
    computed_at: NOW,
    valid_until: LATER,
  });
  return [low, high] as const;
}

describe("M08 must not prefer executors by score (L2/L3 and this cut generally)", () => {
  it("returns FORBIDDEN preference and an empty ranking for L2 and L3", () => {
    const profiles = [...pair()];
    for (const autonomy of ["L2_SUPERVISED", "L3_AUTONOMOUS"] as const) {
      const advice = adviseExecutorPreference({ autonomy, profiles });
      expect(advice.preference).toBe("FORBIDDEN");
      expect(advice.ranked_executor_ids).toEqual([]);
      expect(advice.ranked_executor_ids).toHaveLength(0);
      expect(advice.reason).toMatch(/L2\/L3/);
      expect(advice.unordered_profile_ids).toEqual(profiles.map((p) => p.profile_id));
    }
  });

  it("also refuses score preference at L0/L1 so callers cannot preview a ranking", () => {
    const profiles = [...pair()];
    const advice = adviseExecutorPreference({ autonomy: "L1_EXECUTE", profiles });
    expect(advice.preference).toBe("FORBIDDEN");
    expect(advice.ranked_executor_ids).toEqual([]);
    expect(metricMayDriveRouting(profiles[0])).toBe(false);
  });

  it("preferExecutorByScore always throws", () => {
    expect(() => preferExecutorByScore("L2_SUPERVISED", [...pair()])).toThrow(ScoreRoutingForbidden);
    expect(() => preferExecutorByScore("L0_OBSERVE", [...pair()])).toThrow(ScoreRoutingForbidden);
  });

  it("profilesWithoutScoreOrder preserves caller order rather than sorting by value", () => {
    const [low, high] = pair();
    const ordered = profilesWithoutScoreOrder([low, high]);
    expect(ordered.map((p) => p.metrics[0].value)).toEqual([0.1, 0.99]);
    const reversed = profilesWithoutScoreOrder([high, low]);
    expect(reversed.map((p) => p.metrics[0].value)).toEqual([0.99, 0.1]);
  });
});
