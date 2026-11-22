/**
 * V1-GATE-COMPAT — named aggregate checklist (evidence entrypoint).
 * Full proofs: v1-prod-02, v1-prod-03, v1-gate-compat-fault (+ this matrix).
 * `npm run test:v1-gate-compat`
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  FreeLLMAPIModelProvider,
  createProtocolAdapters,
  listProtocolIds,
  classifyProviderFault,
} from "../../src/v3/model-providers/index.js";
import {
  createDefaultAgentAdapters,
  CursorCircuitAdapter,
  AntigravityCircuitAdapter,
} from "../../src/v3/circuit/index.js";
import { MODEL_LAYER_TABLE } from "../../src/v3/model-providers/model-layers.js";

describe("V1-GATE-COMPAT matrix", () => {
  it("documents required evidence test files present", () => {
    const root = path.resolve(__dirname);
    for (const f of [
      "v1-prod-02-freellmapi.test.ts",
      "v1-prod-03-protocols-failover.test.ts",
      "v1-gate-compat-fault.test.ts",
    ]) {
      expect(existsSync(path.join(root, f)), f).toBe(true);
    }
  });

  it("exposes ≥2 real agent adapters (cursor + antigravity)", () => {
    const adapters = createDefaultAgentAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(2);
    const ids = adapters.map((a) => a.adapter_id);
    expect(ids).toContain("cursor");
    expect(ids).toContain("antigravity");
    expect(new CursorCircuitAdapter().adapter_id).toBe("cursor");
    expect(new AntigravityCircuitAdapter().adapter_id).toBe("antigravity");
  });

  it("Agent × Modelo × Protocolo cells are enumerable", () => {
    const agents = createDefaultAgentAdapters().map((a) => a.adapter_id);
    const protocols = listProtocolIds();
    const models = Object.values(MODEL_LAYER_TABLE).map((r) => r.default_model ?? String(r.layer));
    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(protocols.length).toBeGreaterThanOrEqual(4);
    expect(models.length).toBeGreaterThanOrEqual(1);

    const cells: Array<{ agent: string; model: string; protocol: string }> = [];
    for (const agent of agents) {
      for (const protocol of protocols) {
        for (const model of models.slice(0, 2)) {
          cells.push({ agent, model, protocol });
        }
      }
    }
    expect(cells.length).toBeGreaterThanOrEqual(2 * 4 * 1);
    const adapters = createProtocolAdapters();
    for (const p of protocols) {
      const built = adapters[p].buildRequest({
        model: "gate-compat-model",
        messages: [{ role: "user", content: "ping" }],
        checkpoint_id: "cp-matrix",
      });
      expect(built.url_path.length).toBeGreaterThan(0);
    }
  });

  it("FreeLLMAPI client exists and classifies fault kinds without inventing ready", () => {
    const p = new FreeLLMAPIModelProvider({
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch,
    });
    expect(p.provider_id).toBe("freellmapi");
    expect(p.getState()).toBe("unreachable");
    const fault = classifyProviderFault({
      code: "UNREACHABLE",
      message: "ECONNREFUSED",
      provider_state: "unreachable",
    });
    expect(fault.bucket).toBe("INFRA_QUOTA");
    expect(fault.burns_task_attempt).toBe(false);
    expect(fault.fallback_recommended).toBe(true);
  });
});
