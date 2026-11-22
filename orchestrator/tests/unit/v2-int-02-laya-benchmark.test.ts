/**
 * V2-INT-02 — Laya Decision Engine pluggable host + offline benchmark.
 */
import { describe, it, expect } from "vitest";
import {
  StrictRuntimeDecisionEngine,
  LayaDecisionEngine,
  LayaDecisionEngineStub,
  ModelLayerPolicyEngine,
  PluggableDecisionEngineHost,
  runDecisionEngineBenchmark,
  createDefaultDecisionBenchmarkFixtures,
  decideForMso,
  decideForScheduler,
  type DecisionRequest,
  type LayaClient,
} from "../../src/v3/model-providers/index.js";

function scoredReq(): DecisionRequest {
  return {
    decision_id: "host-1",
    context: "pick best",
    candidates: [
      { candidate_id: "a", label: "A", score: 0.2 },
      { candidate_id: "b", label: "B", score: 0.9 },
    ],
  };
}

describe("V2-INT-02 PluggableDecisionEngineHost", () => {
  it("registers engines and swaps active without changing evaluate shape", async () => {
    const baseline = new StrictRuntimeDecisionEngine({
      engine_id: "strict-runtime",
      policy: { minScore: 0, requireUniqueTop: true },
    });
    const laya = new LayaDecisionEngine({ offlineMode: "abstain" });
    const host = new PluggableDecisionEngineHost({
      baseline,
      engines: [laya],
      active: baseline.engine_id,
    });

    expect(host.listEngineIds().sort()).toEqual(
      ["laya", "strict-runtime"].sort(),
    );
    host.setActive("laya");
    expect(host.getActiveId()).toBe("laya");

    const viaMso = await decideForMso(host, scoredReq());
    const viaSched = await decideForScheduler(host, scoredReq());
    // Active=laya stub → ENGINE_STUB → fallback baseline selects "b"
    expect(viaMso.status).toBe("selected");
    expect(viaMso.selected_candidate_id).toBe("b");
    expect(viaMso.limitations.some((l) => l.includes("pluggable_fallback_from=laya"))).toBe(
      true,
    );
    expect(viaSched.selected_candidate_id).toBe("b");
  });

  it("falls back to ModelLayerPolicyEngine baseline when Laya stubs", async () => {
    const baseline = new ModelLayerPolicyEngine();
    const laya = new LayaDecisionEngineStub();
    const host = new PluggableDecisionEngineHost({
      baseline,
      engines: [laya],
      active: "laya",
    });
    const result = await host.evaluate({
      decision_id: "ml",
      context: "layer",
      candidates: [
        {
          candidate_id: "layer_0",
          label: "L0",
          payload: { layer: 0, task: { kind: "mechanical", complexity: 0.1 } },
        },
        {
          candidate_id: "layer_2",
          label: "L2",
          payload: { layer: 2, task: { kind: "reason", complexity: 0.9 } },
        },
      ],
    });
    expect(result.status).toBe("selected");
    expect(result.engine_id).toBe(baseline.engine_id);
    expect(result.limitations.some((l) => l.includes("pluggable_fallback_from=laya"))).toBe(
      true,
    );
  });

  it("does not invent candidates when active Laya client returns out-of-list id", async () => {
    const evilClient: LayaClient = {
      available: async () => true,
      classify: async () => ({
        status: "selected",
        candidate_id: "invented-secret",
      }),
    };
    const laya = new LayaDecisionEngine({ client: evilClient, offlineMode: "abstain" });
    const baseline = new StrictRuntimeDecisionEngine({
      policy: { minScore: 0, requireUniqueTop: true },
    });
    const result = await laya.evaluate(scoredReq());
    expect(result.status).toBe("abstain");
    expect(result.selected_candidate_id).toBeUndefined();
    expect(result.selected_candidate_id).not.toBe("invented-secret");

    const host = new PluggableDecisionEngineHost({
      baseline,
      engines: [laya],
      active: "laya",
      // POLICY_ABSTAIN is not ENGINE_STUB — no auto-fallback; still no invention
      fallbackAbstainReasons: ["ENGINE_STUB"],
    });
    const hostResult = await host.evaluate(scoredReq());
    expect(hostResult.selected_candidate_id).not.toBe("invented-secret");
    if (hostResult.selected_candidate_id) {
      expect(["a", "b"]).toContain(hostResult.selected_candidate_id);
    }
  });
});

describe("V2-INT-02 LayaDecisionEngine offline", () => {
  it("abstains ENGINE_STUB when client unavailable (default)", async () => {
    const eng = new LayaDecisionEngine({ offlineMode: "abstain" });
    expect(eng.maturity).toBe("stub");
    const result = await eng.evaluate(scoredReq());
    expect(result.status).toBe("abstain");
    expect(result.abstain_reason).toBe("ENGINE_STUB");
    expect(eng.maturity).toBe("stub");
  });

  it("heuristic mode scores only in-list candidates (0% invention)", async () => {
    const eng = new LayaDecisionEngine({ offlineMode: "heuristic" });
    const req: DecisionRequest = {
      decision_id: "heur",
      context: "modelo local barato para tipagem",
      candidates: [
        { candidate_id: "layer_0", label: "modelo local barato" },
        { candidate_id: "layer_2", label: "fronteira remota cara" },
      ],
    };
    const result = await eng.evaluate(req);
    expect(result.status).toBe("selected");
    expect(result.selected_candidate_id).toBe("layer_0");
    expect(["layer_0", "layer_2"]).toContain(result.selected_candidate_id!);
  });
});

describe("V2-INT-02 runDecisionEngineBenchmark offline", () => {
  it("runs pt+en fixtures offline EXIT path with 0% invention and deterministic verdict", async () => {
    const cases = createDefaultDecisionBenchmarkFixtures();
    expect(cases.some((c) => c.locale === "pt-BR")).toBe(true);
    expect(cases.some((c) => c.locale === "en")).toBe(true);

    const baseline = new StrictRuntimeDecisionEngine({
      engine_id: "strict-runtime",
      policy: { minScore: 0, requireUniqueTop: true },
    });
    // Stub Laya cannot beat scored baseline → KEEP_BASELINE (deterministic)
    const laya = new LayaDecisionEngine({ offlineMode: "abstain" });

    const report = await runDecisionEngineBenchmark(cases, {
      baseline,
      candidate: laya,
    });

    expect(report.kind).toBe("DecisionEngineBenchmarkReport");
    expect(report.baseline.calibration_ok).toBe(true);
    expect(report.candidate.calibration_ok).toBe(true);
    expect(report.baseline.invention_count).toBe(0);
    expect(report.candidate.invention_count).toBe(0);
    expect(report.baseline.latency_ms_samples.length).toBe(cases.length);
    expect(report.candidate.abstention_rate).toBeGreaterThan(0);
    expect(report.verdict).toBe("PLUGGABLE_KEEP_BASELINE");
    expect(report.composite.candidate).toBeLessThan(report.composite.baseline);
  });

  it("ADOPT_LAYA only when candidate strictly beats baseline composite", async () => {
    const cases = createDefaultDecisionBenchmarkFixtures();
    // Weak baseline: always abstains
    const weakBaseline = new LayaDecisionEngineStub();
    // Strong candidate: strict scored engine marketed as laya-id for swap naming
    const strong = new StrictRuntimeDecisionEngine({
      engine_id: "laya",
      policy: { minScore: 0, requireUniqueTop: true },
    });
    const report = await runDecisionEngineBenchmark(cases, {
      baseline: weakBaseline,
      candidate: strong,
    });
    expect(report.baseline.invention_count).toBe(0);
    expect(report.candidate.invention_count).toBe(0);
    expect(report.verdict).toBe("ADOPT_LAYA");
  });

  it("calibration failure forces PLUGGABLE_KEEP_BASELINE", async () => {
    const inventing = {
      engine_id: "evil-laya",
      maturity: "experimental" as const,
      async evaluate(req: DecisionRequest) {
        return {
          kind: "DecisionResult" as const,
          engine_id: "evil-laya",
          decision_id: req.decision_id,
          status: "selected" as const,
          selected_candidate_id: "not-in-list-ever",
          reason: "invented",
          limitations: [],
        };
      },
    };
    const baseline = new StrictRuntimeDecisionEngine({
      policy: { minScore: 0, requireUniqueTop: true },
    });
    const report = await runDecisionEngineBenchmark(
      createDefaultDecisionBenchmarkFixtures().slice(0, 2),
      { baseline, candidate: inventing },
    );
    expect(report.candidate.calibration_ok).toBe(false);
    expect(report.candidate.invention_count).toBeGreaterThan(0);
    expect(report.verdict).toBe("PLUGGABLE_KEEP_BASELINE");
  });
});
