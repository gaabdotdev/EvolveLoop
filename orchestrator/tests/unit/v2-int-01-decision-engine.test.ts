/**
 * V2-INT-01 — StrictRuntimeDecisionEngine transversal (MSO / Scheduler / MemoryBroker).
 */
import { describe, it, expect, vi } from "vitest";
import {
  StrictRuntimeDecisionEngine,
  decideForScheduler,
  decideForMso,
  decideForMemoryBroker,
  type DecisionEngine,
  type DecisionRequest,
  type DecisionResult,
  type RuntimeCandidateScorer,
} from "../../src/v3/model-providers/index.js";

function baseReq(
  partial?: Partial<DecisionRequest> & {
    candidates?: DecisionRequest["candidates"];
  },
): DecisionRequest {
  return {
    decision_id: "d-int-01",
    context: "pick",
    candidates: [
      { candidate_id: "a", label: "A", score: 0.4 },
      { candidate_id: "b", label: "B", score: 0.9 },
      { candidate_id: "c", label: "C", score: 0.7 },
    ],
    ...partial,
  };
}

describe("V2-INT-01 StrictRuntimeDecisionEngine", () => {
  it("selects only within the runtime candidate list", async () => {
    const engine = new StrictRuntimeDecisionEngine({
      policy: { minScore: 0.5, requireUniqueTop: true },
    });
    const result = await engine.evaluate(baseReq());
    expect(result.status).toBe("selected");
    expect(result.selected_candidate_id).toBe("b");
    expect(["a", "b", "c"]).toContain(result.selected_candidate_id);
  });

  it("never selects an out-of-list id even if scorer suggests one", async () => {
    const evilScorer: RuntimeCandidateScorer = () => [
      { candidate_id: "invented-outside", score: 99 },
      { candidate_id: "a", score: 0.2 },
      { candidate_id: "b", score: 0.5 },
    ];
    const engine = new StrictRuntimeDecisionEngine({
      scorer: evilScorer,
      policy: { minScore: 0, requireUniqueTop: true },
    });
    const req = baseReq({
      candidates: [
        { candidate_id: "a", label: "A" },
        { candidate_id: "b", label: "B" },
      ],
    });
    const result = await engine.evaluate(req);
    expect(result.status).toBe("selected");
    expect(result.selected_candidate_id).toBe("b");
    expect(result.selected_candidate_id).not.toBe("invented-outside");
    expect(result.limitations.some((l) => l.includes("rejected_out_of_list"))).toBe(
      true,
    );
  });

  it("abstains NO_CANDIDATES when list is empty", async () => {
    const engine = new StrictRuntimeDecisionEngine();
    const result = await engine.evaluate(baseReq({ candidates: [] }));
    expect(result.status).toBe("abstain");
    expect(result.abstain_reason).toBe("NO_CANDIDATES");
    expect(result.selected_candidate_id).toBeUndefined();
  });

  it("abstains POLICY_ABSTAIN on tie when requireUniqueTop", async () => {
    const engine = new StrictRuntimeDecisionEngine({
      policy: { requireUniqueTop: true, minScore: 0 },
    });
    const result = await engine.evaluate(
      baseReq({
        candidates: [
          { candidate_id: "x", label: "X", score: 0.8 },
          { candidate_id: "y", label: "Y", score: 0.8 },
        ],
      }),
    );
    expect(result.status).toBe("abstain");
    expect(result.abstain_reason).toBe("POLICY_ABSTAIN");
  });

  it("abstains INSUFFICIENT_EVIDENCE when top score < minScore", async () => {
    const engine = new StrictRuntimeDecisionEngine({
      policy: { minScore: 0.95, requireUniqueTop: true },
    });
    const result = await engine.evaluate(baseReq());
    expect(result.status).toBe("abstain");
    expect(result.abstain_reason).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("truncates evaluation to max_candidates without inventing", async () => {
    const engine = new StrictRuntimeDecisionEngine({
      policy: { minScore: 0, requireUniqueTop: true },
    });
    // Highest score is "c" but truncated pool is only first two → select "b"
    const result = await engine.evaluate(
      baseReq({
        max_candidates: 2,
        candidates: [
          { candidate_id: "a", label: "A", score: 0.4 },
          { candidate_id: "b", label: "B", score: 0.6 },
          { candidate_id: "c", label: "C", score: 0.99 },
        ],
      }),
    );
    expect(result.status).toBe("selected");
    expect(result.selected_candidate_id).toBe("b");
    expect(result.selected_candidate_id).not.toBe("c");
  });

  it("blocks top candidate when allowBlocked=false", async () => {
    const engine = new StrictRuntimeDecisionEngine({
      policy: { allowBlocked: false, minScore: 0, requireUniqueTop: true },
    });
    const result = await engine.evaluate(
      baseReq({
        candidates: [
          { candidate_id: "safe", label: "Safe", score: 0.5 },
          {
            candidate_id: "danger",
            label: "Danger",
            score: 0.9,
            payload: { blocked: true },
          },
        ],
      }),
    );
    expect(result.status).toBe("blocked");
    expect(result.selected_candidate_id).toBeUndefined();
  });

  it("wrappers MSO/Scheduler/MemoryBroker call the same engine", async () => {
    const evaluate = vi.fn(
      async (req: DecisionRequest): Promise<DecisionResult> => ({
        kind: "DecisionResult",
        engine_id: "spy",
        decision_id: req.decision_id,
        status: "selected",
        selected_candidate_id: req.candidates[0]?.candidate_id,
        reason: "spy",
        limitations: [],
      }),
    );
    const engine: DecisionEngine = {
      engine_id: "spy",
      maturity: "experimental",
      evaluate,
    };
    const req = baseReq({
      candidates: [{ candidate_id: "only", label: "Only", score: 1 }],
    });

    await decideForScheduler(engine, req);
    await decideForMso(engine, req);
    await decideForMemoryBroker(engine, req);

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(evaluate.mock.calls.every((c) => c[0] === req)).toBe(true);

    const viaStrict = new StrictRuntimeDecisionEngine({
      policy: { minScore: 0, requireUniqueTop: true },
    });
    const [s, m, mem] = await Promise.all([
      decideForScheduler(viaStrict, req),
      decideForMso(viaStrict, req),
      decideForMemoryBroker(viaStrict, req),
    ]);
    expect(s.engine_id).toBe(viaStrict.engine_id);
    expect(m.engine_id).toBe(viaStrict.engine_id);
    expect(mem.engine_id).toBe(viaStrict.engine_id);
    expect(s.limitations).toContain("consumer=scheduler");
    expect(m.limitations).toContain("consumer=mso");
    expect(mem.limitations).toContain("consumer=memory_broker");
    expect(s.selected_candidate_id).toBe("only");
  });
});
