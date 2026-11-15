import { describe, expect, it } from "vitest";
import { validateCapabilityProfile } from "../../../src/v4/contracts/index.js";
import {
  DISCLOSURE_FIELDS,
  assembleProfile,
  assertStoreableProfile,
} from "../../../src/v4/capability/index.js";
import { CONTEXT, EXECUTOR_A, LATER, NOW, observedEstimate, validProfile } from "./fixtures.js";

describe("M08 disclosure shape (ADR-V4-0010)", () => {
  it("lists the frozen disclosure fields", () => {
    expect(DISCLOSURE_FIELDS).toEqual([
      "context",
      "sample_size",
      "window",
      "uncertainty",
      "provenance",
      "source_refs",
      "methodology",
    ]);
  });

  it("stores a profile that discloses context, sample, window, uncertainty, provenance, source_refs, methodology", () => {
    const profile = assembleProfile({
      profile_id: validProfile().profile_id,
      subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
      context: { ...CONTEXT },
      metrics: [observedEstimate()],
      computed_at: NOW,
      valid_until: LATER,
    });
    expect(validateCapabilityProfile(profile).valid).toBe(true);
    expect(profile.context).toEqual(CONTEXT);
    expect(profile.metrics[0].sample_size).toBeGreaterThanOrEqual(1);
    expect(profile.metrics[0].window).toEqual({ from: expect.any(String), to: expect.any(String) });
    expect(profile.metrics[0].uncertainty.lower).toBeLessThanOrEqual(profile.metrics[0].uncertainty.upper);
    expect(profile.metrics[0].provenance).toBe("OBSERVED");
    expect(profile.metrics[0].source_refs.length).toBeGreaterThanOrEqual(1);
    expect(profile.methodology.status).toBe("PROVISIONAL");
    expect(profile.status).toBe("PROVISIONAL");
    expect(profile.status).not.toBe("ACTIVE");
  });

  it("refuses a metric missing source_refs or uncertainty", () => {
    const missingRefs = validProfile({
      metrics: [{ ...observedEstimate(), source_refs: [] }],
    });
    expect(validateCapabilityProfile(missingRefs).valid).toBe(false);
    expect(() => assertStoreableProfile(missingRefs)).toThrow(/source_refs/);

    const { uncertainty: _u, ...rest } = observedEstimate();
    void _u;
    const missingUncertainty = validProfile({
      metrics: [rest as ReturnType<typeof observedEstimate>],
    });
    expect(validateCapabilityProfile(missingUncertainty).valid).toBe(false);
    expect(() => assertStoreableProfile(missingUncertainty)).toThrow();
  });

  it("refuses sample_size < 1 (INV-CPROF-02)", () => {
    const profile = validProfile({
      metrics: [observedEstimate({ sample_size: 0 })],
    });
    const result = validateCapabilityProfile(profile);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "INV-CPROF-02")).toBe(true);
    expect(() => assertStoreableProfile(profile)).toThrow(/INV-CPROF-02/);
  });
});
