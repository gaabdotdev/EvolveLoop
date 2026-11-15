import { describe, expect, it } from "vitest";
import { createMeasurementEvent } from "../../../src/telemetry/measurement-plane/envelope.js";
import {
  MISSING_EVENT_PROVENANCE,
  MISSING_MEASUREMENT_PROVENANCE,
  MISSING_REPORTED_BY,
  MP_DEFAULT_REPORTER,
  normalizeEventProvenance,
  normalizeMeasurementEntry,
  wrapInboundEvent,
} from "../../../src/v4/observability/index.js";

describe("M12 R15 provenance defaults", () => {
  it("defaults missing event provenance to UNKNOWN, never OBSERVED", () => {
    const d = normalizeEventProvenance(undefined, "unauthenticated");
    expect(d.kind).toBe("UNKNOWN");
    expect(d.kind).not.toBe("OBSERVED");
    expect(d.reported_by).toBe(MISSING_REPORTED_BY);
    expect(d.defaulted_fields).toContain("provenance");
    expect(d.defaulted_fields).toContain("provenance.kind");
  });

  it("does not treat the V3 plane default reporter as a real producer", () => {
    const d = normalizeEventProvenance(
      { kind: "OBSERVED", reported_by: MP_DEFAULT_REPORTER },
      "unauthenticated",
    );
    expect(d.kind).toBe("UNKNOWN");
    expect(d.reported_by).toBe(MISSING_REPORTED_BY);
    expect(d.observed_downgraded).toBe(true);
  });

  it("downgrades producer-asserted OBSERVED on the unauthenticated channel", () => {
    const d = normalizeEventProvenance(
      { kind: "OBSERVED", reported_by: "executor-1" },
      "unauthenticated",
    );
    expect(d.kind).toBe("UNKNOWN");
    expect(d.observed_downgraded).toBe(true);
    expect(d.reported_by).toBe("executor-1");
  });

  it("keeps explicit OBSERVED only on the control_plane channel", () => {
    const d = normalizeEventProvenance(
      { kind: "OBSERVED", reported_by: "ignored-payload" },
      "control_plane",
      { component: "v4-control-plane", module: "gateway" },
    );
    expect(d.kind).toBe("OBSERVED");
    expect(d.observed_downgraded).toBe(false);
    expect(d.reported_by).toBe("v4-control-plane:gateway");
  });

  it("still defaults missing provenance to UNKNOWN on the control_plane channel", () => {
    const d = normalizeEventProvenance(undefined, "control_plane", {
      component: "v4-control-plane",
      module: "gateway",
    });
    expect(d.kind).toBe(MISSING_EVENT_PROVENANCE);
    expect(d.kind).not.toBe("OBSERVED");
    expect(d.reported_by).toBe("v4-control-plane:gateway");
  });

  it("preserves explicit PROVIDER_REPORTED, ESTIMATED and UNAVAILABLE", () => {
    expect(normalizeEventProvenance({ kind: "PROVIDER_REPORTED", reported_by: "anthropic" }, "unauthenticated").kind).toBe(
      "PROVIDER_REPORTED",
    );
    expect(
      normalizeEventProvenance(
        { kind: "ESTIMATED", reported_by: "usage-adapter", estimate_method: "whitespace_proxy" },
        "unauthenticated",
      ).kind,
    ).toBe("ESTIMATED");
    expect(normalizeEventProvenance({ kind: "UNAVAILABLE", reported_by: "usage-adapter" }, "unauthenticated").kind).toBe(
      "UNAVAILABLE",
    );
  });

  it("maps invalid / SELF_REPORTED measurement kinds to UNKNOWN (not added to MP envelope)", () => {
    expect(normalizeEventProvenance({ kind: "SELF_REPORTED", reported_by: "agent" }, "unauthenticated").kind).toBe(
      "UNKNOWN",
    );
    expect(normalizeEventProvenance({ kind: "MADE_UP" }, "unauthenticated").kind).toBe("UNKNOWN");
  });
});

describe("M12 measurement value provenance", () => {
  it("labels a missing value UNAVAILABLE with null amount", () => {
    const mv = normalizeMeasurementEntry("cost_usd", null);
    expect(mv).toMatchObject({
      metric: "cost_usd",
      value: null,
      provenance: MISSING_MEASUREMENT_PROVENANCE,
    });
  });

  it("keeps a received bare number as UNKNOWN, not OBSERVED", () => {
    const mv = normalizeMeasurementEntry("latency_ms", 12);
    expect(mv).toMatchObject({ metric: "latency_ms", value: 12, provenance: "UNKNOWN" });
  });

  it("does not invent a number for non-finite input", () => {
    const mv = normalizeMeasurementEntry("tokens", Number.NaN);
    expect(mv).toMatchObject({ value: null, provenance: "UNAVAILABLE" });
  });

  it("forces UNAVAILABLE values to null even if a number was supplied", () => {
    const mv = normalizeMeasurementEntry("cost_usd", {
      metric: "cost_usd",
      value: 9.99,
      unit: "USD",
      provenance: "UNAVAILABLE",
    });
    expect(mv).toMatchObject({ value: null, provenance: "UNAVAILABLE" });
  });

  it("downgrades measurement-level OBSERVED on the unauthenticated channel", () => {
    const mv = normalizeMeasurementEntry(
      "tokens",
      { metric: "tokens", value: 10, unit: "tokens", provenance: "OBSERVED" },
      "unauthenticated",
    );
    expect(mv).toMatchObject({ value: 10, provenance: "UNKNOWN" });
  });

  it("preserves PROVIDER_REPORTED values that were actually supplied", () => {
    const mv = normalizeMeasurementEntry("input_tokens", {
      metric: "input_tokens",
      value: 100,
      unit: "tokens",
      provenance: "PROVIDER_REPORTED",
    });
    expect(mv).toMatchObject({ value: 100, provenance: "PROVIDER_REPORTED" });
  });
});

describe("M12 wrap vs V3 envelope default", () => {
  it("V3 createMeasurementEvent still defaults to OBSERVED — the wrap must not persist that", () => {
    const v3 = createMeasurementEvent({
      event_name: "run.started",
      source: { component: "test", module: "unit" },
    });
    expect(v3.provenance.kind).toBe("OBSERVED");
    expect(v3.provenance.reported_by).toBe(MP_DEFAULT_REPORTER);

    const wrapped = wrapInboundEvent(
      {
        event_name: "run.started",
        source: { component: "test", module: "unit" },
      },
      "unauthenticated",
    );
    expect(wrapped.ok).toBe(true);
    expect(wrapped.event?.provenance.kind).toBe("UNKNOWN");
    expect(wrapped.event?.provenance.reported_by).toBe(MISSING_REPORTED_BY);
    expect(wrapped.event?.provenance.kind).not.toBe("OBSERVED");
  });

  it("rejects non-objects instead of inventing an event", () => {
    expect(wrapInboundEvent("not-an-event", "unauthenticated").ok).toBe(false);
    expect(wrapInboundEvent(null, "unauthenticated").ok).toBe(false);
    expect(wrapInboundEvent({ source: { component: "x", module: "y" } }, "unauthenticated").ok).toBe(false);
  });
});
