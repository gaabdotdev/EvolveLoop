/**
 * V1-TOK-12 — 3-layer model hierarchy + selectModelLayer policy.
 */

import { describe, it, expect } from "vitest";
import {
  MODEL_LAYER_TABLE,
  selectModelLayer,
  describeModelLayer,
  ModelLayerPolicyEngine,
  createDeferredProviderStubs,
} from "../../src/v3/model-providers/index.js";

describe("V1-TOK-12 model layer hierarchy", () => {
  it("exposes formal layer 0/1/2 descriptors", () => {
    expect(MODEL_LAYER_TABLE[0].kind).toBe("local");
    expect(MODEL_LAYER_TABLE[0].locality).toBe("local");
    expect(MODEL_LAYER_TABLE[0].cost_band).toBe("zero");
    expect(MODEL_LAYER_TABLE[1].kind).toBe("cheap_fast");
    expect(MODEL_LAYER_TABLE[2].kind).toBe("frontier");
    expect(describeModelLayer(2).cost_band).toBe("high");
  });

  it("selectModelLayer prefers local for draft/apply/mechanical", () => {
    expect(selectModelLayer({ kind: "draft" }).layer).toBe(0);
    expect(selectModelLayer({ kind: "apply" }).layer).toBe(0);
    expect(selectModelLayer({ kind: "mechanical" }).layer).toBe(0);
    expect(selectModelLayer({ kind: "lint_fix" }).layer).toBe(0);
  });

  it("escalates classify/reason by complexity and flags", () => {
    expect(selectModelLayer({ kind: "classify", complexity: 0.2 }).layer).toBe(0);
    expect(selectModelLayer({ kind: "classify", complexity: 0.7 }).layer).toBe(1);
    expect(
      selectModelLayer({ kind: "reason", complexity: 0.9, allow_frontier: true }).layer,
    ).toBe(2);
    expect(selectModelLayer({ kind: "escalate" }).layer).toBe(2);
    expect(selectModelLayer({ kind: "draft", force_layer: 1 }).layer).toBe(1);
  });

  it("wires ModelLayerPolicyEngine into deferred stubs", async () => {
    const stubs = createDeferredProviderStubs();
    expect(stubs.modelLayers.engine_id).toBe("model-layer-policy");
    const sel = stubs.modelLayers.select({ kind: "draft" });
    expect(sel.layer).toBe(0);

    const engine = new ModelLayerPolicyEngine();
    const result = await engine.evaluate({
      decision_id: "d1",
      context: "pick layer",
      candidates: [
        { candidate_id: "layer_0", label: "local", payload: { layer: 0, task: { kind: "draft" } } },
        { candidate_id: "layer_2", label: "frontier", payload: { layer: 2 } },
      ],
    });
    expect(result.status).toBe("selected");
    expect(result.selected_candidate_id).toBe("layer_0");
    expect(result.limitations.some((l) => l.includes("layer=0"))).toBe(true);
  });
});
