import { describe, expect, it } from "vitest";
import { CapabilityIngestError, estimateFromMeasurement, resolveCapabilityProvenance } from "../../../src/v4/capability/index.js";
import { CONTEXT, NOW, PAST, SOURCE, cpMeasurement, expectCode } from "./fixtures.js";

const window = { from: PAST, to: NOW };

describe("M08 ingest composes M12 provenance (F10/D04)", () => {
  it("accepts explicit OBSERVED only on the control_plane channel", () => {
    const estimate = estimateFromMeasurement({
      metric: "success_rate",
      raw: cpMeasurement(0.75),
      channel: "control_plane",
      observer: { component: "v4-control-plane", module: "capability" },
      window,
      source_refs: [SOURCE],
    });
    expect(estimate.provenance).toBe("OBSERVED");
    expect(estimate.value).toBe(0.75);
    expect(estimate.sample_size).toBe(1);
    expect(estimate.source_refs).toEqual([SOURCE]);
    expect(estimate.window).toEqual(window);
    expect(estimate.uncertainty.lower).toBeLessThanOrEqual(estimate.uncertainty.upper);
  });

  it("refuses payload-asserted OBSERVED on the unauthenticated channel", () => {
    expect(() =>
      estimateFromMeasurement({
        metric: "success_rate",
        raw: cpMeasurement(0.99),
        channel: "unauthenticated",
        window,
        source_refs: [SOURCE],
      }),
    ).toThrow(CapabilityIngestError);
    try {
      estimateFromMeasurement({
        metric: "success_rate",
        raw: cpMeasurement(0.99),
        channel: "unauthenticated",
        window,
        source_refs: [SOURCE],
      });
    } catch (err) {
      expect((err as CapabilityIngestError).code).toBe("F10_UNAUTHENTICATED_OBSERVED");
    }
  });

  it("refuses unauthenticated event-level OBSERVED even if the measurement blob looks clean", () => {
    expectCode(
      () =>
        resolveCapabilityProvenance({
          metric: "latency_ms_p50",
          raw: { metric: "latency_ms_p50", value: 12, unit: "ms", provenance: "HARNESS_REPORTED" },
          channel: "unauthenticated",
          window,
          source_refs: [SOURCE],
          event_provenance: { kind: "OBSERVED", reported_by: "executor-1" },
        }),
      "F10_UNAUTHENTICATED_OBSERVED",
    );
  });

  it("refuses SELF_REPORTED / UNKNOWN / ESTIMATED / UNAVAILABLE before they become estimates", () => {
    for (const provenance of ["SELF_REPORTED", "UNKNOWN", "ESTIMATED", "UNAVAILABLE"] as const) {
      expectCode(
        () =>
          estimateFromMeasurement({
            metric: "success_rate",
            raw: { metric: "success_rate", value: 1, unit: "1", provenance },
            channel: "control_plane",
            observer: { component: "v4-control-plane", module: "capability" },
            window,
            source_refs: [SOURCE],
          }),
        "INV-CPROF-01",
      );
    }
  });

  it("refuses bare unlabeled numbers (M12 → UNKNOWN, never OBSERVED)", () => {
    expect(() =>
      estimateFromMeasurement({
        metric: "latency_ms_p50",
        raw: 42,
        channel: "unauthenticated",
        window,
        source_refs: [SOURCE],
      }),
    ).toThrow();
  });

  it("accepts HARNESS_REPORTED without claiming control-plane observation", () => {
    const estimate = estimateFromMeasurement({
      metric: "latency_ms_p50",
      raw: { metric: "latency_ms_p50", value: 120, unit: "ms", provenance: "HARNESS_REPORTED" },
      channel: "unauthenticated",
      window,
      source_refs: [SOURCE],
      unit: "ms",
    });
    expect(estimate.provenance).toBe("HARNESS_REPORTED");
    expect(estimate.value).toBe(120);
  });

  it("does not invent context-free rankings while ingesting", () => {
    const estimate = estimateFromMeasurement({
      metric: "cost_per_verified_result",
      raw: { metric: "cost_per_verified_result", value: 0.4, unit: "USD", provenance: "DERIVED" },
      channel: "control_plane",
      observer: { component: "v4-control-plane", module: "capability" },
      window,
      source_refs: [SOURCE],
      unit: "USD",
    });
    expect(estimate).not.toHaveProperty("rank");
    expect(estimate).not.toHaveProperty("global_score");
    expect(CONTEXT.work_category).toBe("code.review");
  });
});
