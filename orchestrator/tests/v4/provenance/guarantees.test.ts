import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ProvenanceQueryPort } from "../../../src/v4/contracts/index.js";
import {
  ANSWERS_FROM_CHAT_MEMORY,
  FABRICATES_MISSING_REFS,
  GLOBAL_TRUST_SCORE_DEFINED,
  HASH_CHAIN_IS_NON_REPUDIATION,
  PROVENANCE_IS_AUTHORITATIVE_WORK_STATE,
  ProvenanceGraph,
  ROUTES_BY_TRUST_OR_SCORE,
} from "../../../src/v4/provenance/index.js";
import { createWorld } from "./helpers.js";

describe("M11 honesty pins", () => {
  it("does not claim Work Continuity, non-repudiation, trust scores, or routing", () => {
    expect(PROVENANCE_IS_AUTHORITATIVE_WORK_STATE).toBe(false);
    expect(HASH_CHAIN_IS_NON_REPUDIATION).toBe(false);
    expect(GLOBAL_TRUST_SCORE_DEFINED).toBe(false);
    expect(ROUTES_BY_TRUST_OR_SCORE).toBe(false);
    expect(FABRICATES_MISSING_REFS).toBe(false);
    expect(ANSWERS_FROM_CHAT_MEMORY).toBe(false);
  });

  it("implements ProvenanceQueryPort without extra score/routing methods", () => {
    const { graph } = createWorld();
    const port: ProvenanceQueryPort = graph;
    expect(typeof port.decisionOrigin).toBe("function");
    expect(typeof port.artifactAuthors).toBe("function");
    expect(typeof port.evidenceForRequirement).toBe("function");
    expect(typeof port.authorizationFor).toBe("function");
    expect(graph).not.toHaveProperty("trustScore");
    expect(graph).not.toHaveProperty("capabilityScore");
    expect(graph).not.toHaveProperty("routeByTrust");
    expect(Object.getOwnPropertyNames(ProvenanceGraph.prototype)).not.toContain("trustScore");
  });

  it("depends on frozen contracts only — not sibling meta engines", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../src/v4/provenance");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const sibling = /\.\.\/(ledger|effects|proof|policy|artifacts|work|goal|capability|planning|continuity)\//;
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(sibling);
    }
    const index = readFileSync(join(dir, "index.ts"), "utf8");
    expect(index).toContain("../contracts/");
  });
});
