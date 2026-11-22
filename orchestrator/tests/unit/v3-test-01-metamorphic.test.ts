/**
 * V3-TEST-01 — Metamorphic & Differential Multi-Model Tests.
 *
 * Gate (§5.4): same Goal Contract with 3 equivalent paraphrases →
 * decomposition stability + TRUE-FULL-PASS (deterministic stub router).
 */

import { describe, it, expect } from "vitest";
import {
  METAMORPHIC_SCHEMA_VERSION,
  REQUIRED_PARAPHRASE_COUNT,
  normalizeObjectiveTokens,
  createStubDecomposer,
  createStubRouter,
  runMetamorphicHarness,
  evaluateMetamorphicGate,
  fixtureEquivalentParaphrases,
} from "../../src/v3/evaluation/index.js";
import type { GoalContract } from "../../src/v3/goal-contract/types.js";

const NOW = "2026-11-22T00:22:00.000Z";

function contractPassing(id = "gc-meta-01"): GoalContract {
  return {
    kind: "GoalContract",
    goal_contract_id: id,
    version: 1,
    created_at: NOW,
    updated_at: NOW,
    objective: "auth api test docs",
    scope: ["src/", "tests/", "docs/"],
    out_of_scope: [],
    functional_requirements: ["auth", "api"],
    non_functional_requirements: [],
    constraints: [],
    dependencies: [],
    risks: [],
    work_id: `w-${id}`,
    criteria: [
      {
        id: "c-auth",
        description: "auth endpoints exist",
        mandatory: true,
        verification: [{ id: "v1", kind: "test", description: "unit" }],
        evidence_required: ["test_result"],
        state: "PASS",
        evidence_ids: ["ev-test-1"],
        updated_at: NOW,
      },
      {
        id: "c-docs",
        description: "docs updated",
        mandatory: true,
        verification: [{ id: "v2", kind: "diff", description: "readme" }],
        evidence_required: ["diff"],
        state: "PASS",
        evidence_ids: ["ev-diff-1"],
        updated_at: NOW,
      },
    ],
  };
}

function contractFailing(id = "gc-meta-fail"): GoalContract {
  const c = contractPassing(id);
  c.criteria = c.criteria.map((crit) =>
    crit.id === "c-auth"
      ? { ...crit, state: "FAIL" as const, evidence_ids: [] }
      : crit,
  );
  return c;
}

describe("V3-TEST-01 normalizeObjectiveTokens", () => {
  it("collapses synonyms so equivalent paraphrases share a token bag", () => {
    const a = normalizeObjectiveTokens(
      "Implement authentication API endpoints with unit tests and documentation",
    );
    const b = normalizeObjectiveTokens(
      "Build login REST handlers, add verification tests, and write the README",
    );
    const c = normalizeObjectiveTokens(
      "Create auth HTTP routes, ensure test coverage, and document the feature",
    );
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toEqual(
      expect.arrayContaining(["auth", "api", "test", "docs", "code"]),
    );
  });
});

describe("V3-TEST-01 stub decomposer + router", () => {
  it("schema version and paraphrase count are fixed for evidence", () => {
    expect(METAMORPHIC_SCHEMA_VERSION).toBe(1);
    expect(REQUIRED_PARAPHRASE_COUNT).toBe(3);
    expect(fixtureEquivalentParaphrases()).toHaveLength(3);
  });

  it("stub decomposer is deterministic for identical objectives", () => {
    const d = createStubDecomposer();
    const contract = contractPassing();
    const once = d.decompose({
      contract,
      objective: fixtureEquivalentParaphrases()[0]!.objective,
    });
    const twice = d.decompose({
      contract,
      objective: fixtureEquivalentParaphrases()[0]!.objective,
    });
    expect(once.fingerprint).toBe(twice.fingerprint);
    expect(once.nodes.map((n) => n.role_id).sort()).toEqual(
      ["coordinate", "document", "implement", "plan", "verify"].sort(),
    );
  });

  it("stable stub router ignores surface wording when fingerprint matches", () => {
    const d = createStubDecomposer();
    const r = createStubRouter({ model_id: "m-stable", agent_id: "worker-a" });
    const contract = contractPassing();
    const fps = fixtureEquivalentParaphrases().map((p) => {
      const dec = d.decompose({ contract, objective: p.objective });
      return r.route({
        objective: p.objective,
        tokens: dec.normalized_tokens,
        decomposition: dec,
      }).agent_id;
    });
    expect(new Set(fps).size).toBe(1);
  });
});

describe("V3-TEST-01 metamorphic harness (3 paraphrases)", () => {
  it("PASS: decomposition + route + TRUE-FULL-PASS stable across 3 paraphrases", () => {
    const report = runMetamorphicHarness({
      contract: contractPassing(),
      paraphrases: fixtureEquivalentParaphrases(),
      router: createStubRouter({ model_id: "stub-stable", agent_id: "agent-a" }),
    });

    expect(report.kind).toBe("MetamorphicHarnessReport");
    expect(report.variants).toHaveLength(3);
    expect(report.stability.decomposition_stable).toBe(true);
    expect(report.stability.route_stable).toBe(true);
    expect(report.stability.true_full_pass_stable).toBe(true);
    expect(report.stability.reference_pass_eligible).toBe(true);
    expect(
      report.variants.every((v) => v.true_full_pass.work_state === "TRUE_FULL_PASS"),
    ).toBe(true);
    expect(report.status).toBe("PASS");

    const gate = evaluateMetamorphicGate(report);
    expect(gate.passed).toBe(true);
    expect(gate.reasons).toEqual([]);

    // All fingerprints identical
    const fps = new Set(report.variants.map((v) => v.decomposition.fingerprint));
    expect(fps.size).toBe(1);
  });

  it("FAIL_FRAGILE: non-equivalent paraphrase changes decomposition", () => {
    const paraphrases = [
      ...fixtureEquivalentParaphrases().slice(0, 2),
      {
        paraphrase_id: "p-divergent",
        objective: "Only update the README documentation page",
      },
    ];
    const report = runMetamorphicHarness({
      contract: contractPassing(),
      paraphrases,
      router: createStubRouter({ model_id: "stub-stable" }),
    });
    expect(report.stability.decomposition_stable).toBe(false);
    expect(report.status).toBe("FAIL_FRAGILE");
    expect(evaluateMetamorphicGate(report).passed).toBe(false);
  });

  it("FAIL_COUNT: requires exactly 3 paraphrases", () => {
    const report = runMetamorphicHarness({
      contract: contractPassing(),
      paraphrases: fixtureEquivalentParaphrases().slice(0, 2),
    });
    expect(report.status).toBe("FAIL_COUNT");
  });

  it("TRUE-FULL-PASS drift is detected when evaluator depends on surface text", () => {
    const report = runMetamorphicHarness({
      contract: contractPassing(),
      paraphrases: fixtureEquivalentParaphrases(),
      router: createStubRouter({ model_id: "stub-stable" }),
      evaluatePass: ({ paraphrase }) => {
        const eligible = !paraphrase.objective.toLowerCase().includes("login");
        return {
          eligible,
          work_state: eligible ? "TRUE_FULL_PASS" : "NOT_PASS",
          reasons: eligible ? [] : ["surface_login_fragility"],
        };
      },
    });
    expect(report.stability.true_full_pass_stable).toBe(false);
    expect(report.status).toBe("FAIL_PASS_DRIFT");
  });

  it("NOT_PASS stays stable when contract criteria fail (still metamorphic-stable)", () => {
    const report = runMetamorphicHarness({
      contract: contractFailing(),
      paraphrases: fixtureEquivalentParaphrases(),
      router: createStubRouter({ model_id: "stub-stable" }),
    });
    expect(report.stability.decomposition_stable).toBe(true);
    expect(report.stability.true_full_pass_stable).toBe(true);
    expect(report.stability.reference_pass_eligible).toBe(false);
    expect(
      report.variants.every((v) => v.true_full_pass.work_state === "NOT_PASS"),
    ).toBe(true);
    expect(report.status).toBe("PASS");
  });
});

describe("V3-TEST-01 differential multi-model routing bias", () => {
  it("detects surface-biased model vs fingerprint-stable model", () => {
    const report = runMetamorphicHarness({
      contract: contractPassing(),
      paraphrases: fixtureEquivalentParaphrases(),
      models: [
        createStubRouter({ model_id: "model-stable", agent_id: "core" }),
        createStubRouter({ model_id: "model-biased", surface_biased: true }),
      ],
    });

    expect(report.differential).toBeDefined();
    expect(report.differential!.routing_bias_detected).toBe(true);
    expect(report.differential!.biased_model_ids).toContain("model-biased");
    expect(report.status).toBe("FAIL_ROUTE_BIAS");

    // Primary (stable) variants still decomposition-stable
    expect(report.stability.decomposition_stable).toBe(true);
  });

  it("PASS when all models are fingerprint-stable and agree", () => {
    const report = runMetamorphicHarness({
      contract: contractPassing(),
      paraphrases: fixtureEquivalentParaphrases(),
      models: [
        createStubRouter({ model_id: "m1", agent_id: "core" }),
        createStubRouter({ model_id: "m2", agent_id: "core" }),
      ],
    });
    expect(report.differential!.routing_bias_detected).toBe(false);
    expect(report.status).toBe("PASS");
  });
});
