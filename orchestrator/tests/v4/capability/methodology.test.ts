import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  METHODOLOGY_RESIDUALS,
  PLACEHOLDER_METHODOLOGY,
  PUBLISHED_METHODOLOGY,
  isPlaceholderMethodology,
  isPublishedMethodology,
  methodologyAllowsActive,
  methodologyIsAccepted,
} from "../../../src/v4/capability/index.js";

const DOC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../src/v4/capability/METHODOLOGY.md"),
  "utf8",
);

describe("M08 published methodology is PROVISIONAL", () => {
  it("declares id/version/status without claiming ACCEPTED", () => {
    expect(PUBLISHED_METHODOLOGY.id).toBe("cprof-methodology.provisional.v0");
    expect(PUBLISHED_METHODOLOGY.version).toBe("0.1.0");
    expect(PUBLISHED_METHODOLOGY.status).toBe("PROVISIONAL");
    expect(PUBLISHED_METHODOLOGY.status).not.toBe("ACCEPTED");
    expect(methodologyIsAccepted(PUBLISHED_METHODOLOGY)).toBe(false);
    expect(methodologyAllowsActive(PUBLISHED_METHODOLOGY)).toBe(false);
    expect(isPublishedMethodology(PUBLISHED_METHODOLOGY)).toBe(true);
  });

  it("keeps the ADR placeholder distinct and not as quality evidence", () => {
    expect(PLACEHOLDER_METHODOLOGY.id).toBe("cprof-methodology.placeholder.v0");
    expect(PLACEHOLDER_METHODOLOGY.status).toBe("PLACEHOLDER");
    expect(isPlaceholderMethodology(PLACEHOLDER_METHODOLOGY)).toBe(true);
    expect(isPublishedMethodology(PLACEHOLDER_METHODOLOGY)).toBe(false);
    expect(methodologyAllowsActive(PLACEHOLDER_METHODOLOGY)).toBe(false);
  });

  it("documents residuals instead of inventing a formula", () => {
    expect(METHODOLOGY_RESIDUALS).toEqual([
      "formula",
      "recency_decay",
      "provider_version_identity",
      "minimum_sample_for_inference",
    ]);
    expect(DOC).toMatch(/status \| \*\*PROVISIONAL\*\*/);
    expect(DOC).toMatch(/No `global_score`/);
    expect(DOC).toMatch(/Elo, Bradley-Terry, Bayesian/);
    expect(DOC).toMatch(/\*\*not chosen\*\*/);
    expect(DOC).not.toMatch(/current status is ACCEPTED/);
    expect(DOC).toMatch(/must not.*prefer an executor for L2\/L3/i);
  });
});
