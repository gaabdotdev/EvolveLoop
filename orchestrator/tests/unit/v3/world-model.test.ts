import { describe, it, expect } from "vitest";
import {
  AgencyLoop,
  GoalStore,
  WorldModelStore,
  assertObservationVsBelief,
  makeBelief,
  makeObservation,
  ChannelSeparationError,
  BeliefRevisionGraph,
  reconcile,
} from "../../../src/v3/index.js";

describe("V3 WorldModelStore", () => {
  it("stores Observations and Beliefs separately", () => {
    const store = new WorldModelStore();
    const obs = store.putObservation(
      makeObservation({
        observation_id: "obs-1",
        raw: "HTTP 500 from /api",
        source: "probe",
        observed_at: "2026-09-24T12:00:00.000Z",
      }),
    );
    const belief = store.putBelief(
      makeBelief({
        belief_id: "b-1",
        statement: "database may be failing",
        status: "hypothesis",
        confidence: 0.4,
        supporting_observation_refs: ["obs-1"],
        updated_at: "2026-09-24T12:00:00.000Z",
      }),
    );

    expect(obs.kind).toBe("Observation");
    expect(belief.kind).toBe("Belief");
    expect(store.listObservations()).toHaveLength(1);
    expect(store.listBeliefs()).toHaveLength(1);
    expect(store.getObservation("obs-1")?.spec.raw).toContain("500");
  });

  it("rejects Belief content on Observation channel", () => {
    const store = new WorldModelStore();
    const belief = makeBelief({
      belief_id: "b-x",
      statement: "inferred outage",
      status: "hypothesis",
      confidence: 0.5,
    });

    expect(() => store.putObservation(belief)).toThrow(ChannelSeparationError);
    expect(() => assertObservationVsBelief(belief)).toThrow(ChannelSeparationError);
    expect(store.listObservations()).toHaveLength(0);
  });

  it("rejects Observation on Belief channel", () => {
    const store = new WorldModelStore();
    const obs = makeObservation({
      observation_id: "obs-x",
      raw: "fact",
      source: "sensor",
    });
    expect(() => store.putBelief(obs)).toThrow(ChannelSeparationError);
  });

  it("reconcile detects missing, contradictory, and stale drift", () => {
    const store = new WorldModelStore();
    store.putObservation(
      makeObservation({
        observation_id: "obs-new",
        raw: "pool restored",
        source: "metrics",
        observed_at: "2026-09-24T18:00:00.000Z",
      }),
    );

    store.putBelief(
      makeBelief({
        belief_id: "b-missing",
        statement: "needs ghost observation",
        status: "supported",
        confidence: 0.8,
        supporting_observation_refs: ["obs-absent"],
        updated_at: "2026-09-24T17:00:00.000Z",
      }),
    );

    store.putBelief(
      makeBelief({
        belief_id: "b-stale",
        statement: "still broken",
        status: "supported",
        confidence: 0.7,
        supporting_observation_refs: ["obs-new"],
        updated_at: "2026-09-24T12:00:00.000Z",
      }),
    );

    store.putBelief(
      makeBelief({
        belief_id: "b-a",
        statement: "service down",
        status: "supported",
        confidence: 0.9,
        supporting_observation_refs: ["obs-new"],
        updated_at: "2026-09-24T18:00:00.000Z",
      }),
    );
    store.putBelief(
      makeBelief({
        belief_id: "b-b",
        statement: "service up",
        status: "supported",
        confidence: 0.9,
        supporting_observation_refs: ["obs-new"],
        updated_at: "2026-09-24T18:00:00.000Z",
      }),
    );
    store.addRevisionEdge("b-a", "b-b", "contradicts");

    const report = store.reconcile({ now: "2026-09-24T18:00:00.000Z" });
    expect(report.has_drift).toBe(true);
    expect(report.drifts.some((d) => d.type === "missing" && d.subject_id === "b-missing")).toBe(
      true,
    );
    expect(report.drifts.some((d) => d.type === "stale" && d.subject_id === "b-stale")).toBe(true);
    expect(
      report.drifts.some((d) => d.type === "contradictory" && d.subject_id === "b-b"),
    ).toBe(true);
  });

  it("BeliefRevision cascadeFromInvalidation walks supports/invalidates", () => {
    const g = new BeliefRevisionGraph();
    g.addEdge("b1", "b3", "supports");
    g.addEdge("b3", "d1", "supports");
    g.addEdge("b1", "b3", "invalidates");
    expect(g.cascadeFromInvalidation("b1")).toEqual(["b3", "d1"]);
  });

  it("toSnapshot feeds AgencyLoop without breaking stub WorldSnapshot callers", () => {
    const wm = new WorldModelStore();
    wm.putObservation(
      makeObservation({
        observation_id: "obs-1",
        raw: "ok",
        source: "tool",
        observed_at: "2026-09-24T10:00:00.000Z",
      }),
    );
    wm.putBelief(
      makeBelief({
        belief_id: "b-1",
        statement: "healthy",
        status: "hypothesis",
        confidence: 0.3,
        supporting_observation_refs: ["obs-missing"],
        updated_at: "2026-09-24T10:00:00.000Z",
      }),
    );

    const world = wm.toSnapshot({ snapshot_id: "wm-snap-1" });
    expect(world.snapshot_id).toBe("wm-snap-1");
    expect(world.observation_ids).toEqual(["obs-1"]);
    expect(world.belief_ids).toEqual(["b-1"]);
    expect(world.open_signals?.some((s) => s.startsWith("missing:"))).toBe(true);

    const goals = new GoalStore();
    goals.create({
      id: "g1",
      desired_outcome: "Stay healthy",
      risk_policy: "low capability=documentation",
      non_goals: ["capability:documentation"],
    });
    goals.accept("g1", { reason: "ok" });
    goals.activate("g1", { reason: "ok" });

    const result = new AgencyLoop().step({
      portfolio: goals.portfolio("pf"),
      world,
      policy: {
        snapshot_id: "p1",
        policy_ref: "default",
        captured_at: "2026-09-24T10:00:00.000Z",
      },
    });
    expect(result.world_snapshot_id).toBe("wm-snap-1");
    expect(result.proposals).toHaveLength(1);
  });
});

describe("V3 reconcile pure function", () => {
  it("reports empty when beliefs align with observations", () => {
    const observations = [
      makeObservation({
        observation_id: "o1",
        raw: "ok",
        source: "s",
        observed_at: "2026-09-24T12:00:00.000Z",
      }),
    ];
    const beliefs = [
      makeBelief({
        belief_id: "b1",
        statement: "ok",
        status: "supported",
        confidence: 0.9,
        supporting_observation_refs: ["o1"],
        updated_at: "2026-09-24T12:00:00.000Z",
      }),
    ];
    const report = reconcile(observations, beliefs, new BeliefRevisionGraph(), {
      now: "2026-09-24T12:00:00.000Z",
      staleAfterMs: 86_400_000,
    });
    expect(report.has_drift).toBe(false);
    expect(report.drifts).toHaveLength(0);
  });
});
