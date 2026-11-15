import { describe, expect, it } from "vitest";
import type { CapabilityProfilePort } from "../../../src/v4/contracts/index.js";
import {
  CapabilityValidationError,
  CapabilityProfileStore,
  assembleProfile,
  sequentialProfileId,
} from "../../../src/v4/capability/index.js";
import {
  CONTEXT,
  EXECUTOR_A,
  EXECUTOR_B,
  LATER,
  NOW,
  PAST,
  SOURCE,
  cpMeasurement,
  observedEstimate,
  placeholderProfile,
  validProfile,
} from "./fixtures.js";

describe("M08 CapabilityProfilePort store", () => {
  it("implements profilesFor and returns insertion order, never score order", async () => {
    const store = new CapabilityProfileStore({ now: () => NOW });
    const low = assembleProfile({
      profile_id: sequentialProfileId(1),
      subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
      context: { ...CONTEXT },
      metrics: [observedEstimate({ value: 0.1, uncertainty: { method: "point_interval.v0", lower: 0.1, upper: 0.1 } })],
      computed_at: NOW,
      valid_until: LATER,
    });
    const high = assembleProfile({
      profile_id: sequentialProfileId(3),
      subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
      context: { ...CONTEXT },
      metrics: [observedEstimate({ value: 0.99, uncertainty: { method: "point_interval.v0", lower: 0.99, upper: 0.99 } })],
      computed_at: NOW,
      valid_until: LATER,
    });
    store.put(low, { observed_attestation: "control_plane" });
    store.put(high, { observed_attestation: "control_plane" });
    const port: CapabilityProfilePort = store;
    const found = await port.profilesFor(EXECUTOR_A, { ...CONTEXT });
    expect(found.map((p) => p.profile_id)).toEqual([low.profile_id, high.profile_id]);
    expect(found[0].metrics[0].value).toBeLessThan(found[1].metrics[0].value);
    expect(found.every((p) => p.status === "PROVISIONAL")).toBe(true);
    expect(found.some((p) => "rank" in p || "global_score" in p)).toBe(false);
  });

  it("filters by executor and context; optional environment is exact when provided", async () => {
    const store = new CapabilityProfileStore({ now: () => NOW });
    store.put(validProfile(), { observed_attestation: "control_plane" });
    store.put(
      assembleProfile({
        profile_id: sequentialProfileId(4),
        subject: { executor_id: EXECUTOR_B, executor_version: "1.0.0" },
        context: { ...CONTEXT },
        metrics: [observedEstimate()],
        computed_at: NOW,
        valid_until: LATER,
      }),
      { observed_attestation: "control_plane" },
    );
    store.put(
      assembleProfile({
        profile_id: sequentialProfileId(5),
        subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
        context: { work_category: "code.review", task_kind: "pr_summary", environment: "ci" },
        metrics: [observedEstimate()],
        computed_at: NOW,
        valid_until: LATER,
      }),
      { observed_attestation: "control_plane" },
    );
    expect(await store.profilesFor(EXECUTOR_A, { ...CONTEXT })).toHaveLength(1);
    expect(await store.profilesFor(EXECUTOR_A, { work_category: "code.review", task_kind: "pr_summary" })).toHaveLength(2);
    expect(await store.profilesFor(EXECUTOR_A, { work_category: "other", task_kind: "pr_summary" })).toHaveLength(0);
  });

  it("marks expired profiles STALE on read without emitting ACTIVE", async () => {
    const store = new CapabilityProfileStore({ now: () => LATER });
    store.put(validProfile({ computed_at: PAST, valid_until: NOW }), { observed_attestation: "control_plane" });
    const found = await store.profilesFor(EXECUTOR_A, { ...CONTEXT });
    expect(found[0].status).toBe("STALE");
    expect(store.get(validProfile().profile_id)?.status).toBe("STALE");
  });

  it("refuses OBSERVED put without control_plane attestation", () => {
    const store = new CapabilityProfileStore({ now: () => NOW });
    expect(() => store.put(validProfile())).toThrow(CapabilityValidationError);
    try {
      store.put(validProfile());
    } catch (err) {
      expect((err as CapabilityValidationError).code).toBe("F10_UNAUTHENTICATED_OBSERVED");
    }
  });

  it("ingestAndPut builds a disclosed PROVISIONAL profile from CP measurements", () => {
    const store = new CapabilityProfileStore({ now: () => NOW });
    const profile = store.ingestAndPut({
      profile_id: sequentialProfileId(8),
      subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
      context: { ...CONTEXT },
      computed_at: NOW,
      valid_until: LATER,
      measurements: [
        {
          metric: "success_rate",
          raw: cpMeasurement(0.5),
          channel: "control_plane",
          observer: { component: "v4-control-plane", module: "capability" },
          window: { from: PAST, to: NOW },
          source_refs: [SOURCE],
        },
      ],
    });
    expect(profile.status).toBe("PROVISIONAL");
    expect(profile.methodology.status).toBe("PROVISIONAL");
    expect(profile.metrics[0].provenance).toBe("OBSERVED");
  });

  it("accepts PLACEHOLDER methodology profiles as PROVISIONAL, never ACTIVE", () => {
    const store = new CapabilityProfileStore({ now: () => NOW });
    const stored = store.put(placeholderProfile(), { observed_attestation: "control_plane" });
    expect(stored.methodology.status).toBe("PLACEHOLDER");
    expect(stored.status).toBe("PROVISIONAL");
  });

  it("rejects non-finite metric values at the engine boundary", () => {
    expect(() =>
      assembleProfile({
        subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
        context: { ...CONTEXT },
        metrics: [observedEstimate({ value: Number.NaN })],
        computed_at: NOW,
        valid_until: LATER,
      }),
    ).toThrow(CapabilityValidationError);
  });
});
