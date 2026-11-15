import { describe, expect, it } from "vitest";
import { validateCapabilityProfile } from "../../../src/v4/contracts/index.js";
import {
  CapabilityValidationError,
  assembleProfile,
  assertStoreableProfile,
} from "../../../src/v4/capability/index.js";
import { CONTEXT, EXECUTOR_A, LATER, NOW, expectCode, observedEstimate, validProfile } from "./fixtures.js";

describe("M08 INV-CPROF refusals", () => {
  it("INV-CPROF-01 — SELF_REPORTED / UNKNOWN / ESTIMATED / UNAVAILABLE cannot support a metric", () => {
    for (const provenance of ["SELF_REPORTED", "UNKNOWN", "ESTIMATED", "UNAVAILABLE"] as const) {
      const profile = validProfile({
        metrics: [observedEstimate({ provenance: provenance as "OBSERVED" })],
      });
      const result = validateCapabilityProfile(profile);
      expect(result.valid, provenance).toBe(false);
      expect(result.issues.some((i) => i.code === "INV-CPROF-01"), provenance).toBe(true);
      expect(() => assertStoreableProfile(profile)).toThrow(CapabilityValidationError);
      try {
        assertStoreableProfile(profile);
      } catch (err) {
        expect(err).toBeInstanceOf(CapabilityValidationError);
        expect((err as CapabilityValidationError).code).toBe("INV-CPROF-01");
      }
    }
  });

  it("INV-CPROF-02 — missing/inverted uncertainty interval is refused", () => {
    const inverted = validProfile({
      metrics: [observedEstimate({ uncertainty: { method: "point_interval.v0", lower: 1, upper: 0 } })],
    });
    const result = validateCapabilityProfile(inverted);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "INV-CPROF-02")).toBe(true);
  });

  it("INV-CPROF-03 — global_score / rank / overall_score are refused at any depth", () => {
    for (const field of ["global_score", "rank", "overall_score"] as const) {
      const profile = { ...validProfile(), [field]: 1 };
      const result = validateCapabilityProfile(profile);
      expect(result.valid, field).toBe(false);
      expect(result.issues.some((i) => i.code === "INV-CPROF-03"), field).toBe(true);
      expectCode(() => assertStoreableProfile(profile), "INV-CPROF-03");
    }
    const nested = validProfile({
      metrics: [{ ...observedEstimate(), rank: 1 } as ReturnType<typeof observedEstimate>],
    });
    expectCode(() => assertStoreableProfile(nested), "INV-CPROF-03");
  });

  it("INV-CPROF-04 — ACTIVE is refused while methodology is not ACCEPTED", () => {
    const active = validProfile({ status: "ACTIVE" });
    const result = validateCapabilityProfile(active);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "INV-CPROF-04")).toBe(true);
    expect(() => assertStoreableProfile(active)).toThrow(/INV-CPROF-04/);
  });

  it("INV-CPROF-04 — a claimed ACCEPTED methodology is not recognized in this cut", () => {
    const claimed = validProfile({
      methodology: { id: "cprof-methodology.invented.v1", version: "1.0.0", status: "ACCEPTED" },
      status: "PROVISIONAL",
    });
    expectCode(() => assertStoreableProfile(claimed), "INV-CPROF-04");
    expectCode(
      () =>
        assembleProfile({
          subject: { executor_id: EXECUTOR_A, executor_version: "1.0.0" },
          context: { ...CONTEXT },
          metrics: [observedEstimate()],
          computed_at: NOW,
          valid_until: LATER,
          methodology: { id: "cprof-methodology.invented.v1", version: "1.0.0", status: "ACCEPTED" },
        }),
      "INV-CPROF-04",
    );
  });
});
