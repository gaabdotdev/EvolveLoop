import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { methodologyIsAccepted, PUBLISHED_METHODOLOGY } from "../../../src/v4/capability/index.js";
import {
  BASELINE_MAY_DRIVE_L2_L3_ROUTING,
  CANONICAL_CASE_IDS,
  CANONICAL_SUITE_ID,
  METHODOLOGY_ACCEPTED_BY_M17,
  PRODUCTION_SCORES_EXIST,
  QUALITY_PROOF_PROVENANCE,
} from "../../../src/v4/benchmarks/index.js";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/v4/benchmarks");

function readDoc(name: string): string {
  return readFileSync(join(DOCS, name), "utf8");
}

describe("fair baseline protocol pins", () => {
  it("does not invent production scores or ACCEPTED methodology", () => {
    expect(PRODUCTION_SCORES_EXIST).toBe(false);
    expect(METHODOLOGY_ACCEPTED_BY_M17).toBe(false);
    expect(BASELINE_MAY_DRIVE_L2_L3_ROUTING).toBe(false);
    expect(methodologyIsAccepted(PUBLISHED_METHODOLOGY)).toBe(false);
    expect(PUBLISHED_METHODOLOGY.status).toBe("PROVISIONAL");
  });

  it("names the canonical suite and quality-proof provenance", () => {
    expect(CANONICAL_SUITE_ID).toBe("el-v4-fair-baseline");
    expect(CANONICAL_CASE_IDS).toEqual(["FBC-SE-01", "FBC-SE-02", "FBC-SE-03"]);
    expect(QUALITY_PROOF_PROVENANCE).toEqual(["OBSERVED", "HARNESS_REPORTED"]);
  });

  it("documents self-score ban, comparison scope, and no L2/L3 routing", () => {
    const protocol = readDoc("PROTOCOL.md");
    expect(protocol).toMatch(/SELF_REPORTED/);
    expect(protocol).toMatch(/never ground truth/i);
    expect(protocol).toMatch(/schema_validator/);
    expect(protocol).toMatch(/benchmarks\/bench-obs/);
    expect(protocol).toMatch(/L2\/L3/);
    expect(protocol).toMatch(/PRODUCTION_SCORES_EXIST = false/);
    expect(protocol).not.toMatch(/methodology is ACCEPTED/);
  });

  it("does not ACCEPTED-stamp M08 in evidence or schema docs", () => {
    const evidence = readDoc("M08-EVIDENCE.md");
    const schema = readDoc("SCHEMA.md");
    expect(evidence).toMatch(/does not stamp M08 methodology ACCEPTED/);
    expect(evidence).toMatch(/Still required/);
    expect(schema).toMatch(/this_artifact_stamps_methodology_accepted"\s*:\s*false/);
    expect(evidence).not.toMatch(/current status is ACCEPTED/);
    expect(evidence).not.toMatch(/status is APPROVED/i);
    expect(readDoc("README.md")).toMatch(/not APPROVED/);
  });
});
