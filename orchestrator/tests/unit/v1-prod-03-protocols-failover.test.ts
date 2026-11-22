/**
 * V1-PROD-03 — Multi-protocol adapters + agent failover preserving checkpoint_id.
 */
import { describe, it, expect } from "vitest";
import {
  createProtocolAdapters,
  listProtocolIds,
} from "../../src/v3/model-providers/protocols/index.js";
import { invokeWithAgentFailover, shouldFailover } from "../../src/v3/circuit/index.js";
import type {
  AdapterHealth,
  AdapterInvokeRequest,
  CircuitAgentAdapter,
  NormalizedAdapterResult,
} from "../../src/v3/circuit/adapter-types.js";
import type { ExecutionRunnerResult } from "../../src/v3/execution-runner/types.js";

function stubAdapter(
  id: string,
  behavior: (req: AdapterInvokeRequest) => Promise<NormalizedAdapterResult> | NormalizedAdapterResult,
): CircuitAgentAdapter {
  return {
    adapter_id: id,
    async healthCheck(): Promise<AdapterHealth> {
      return {
        kind: "AdapterHealth",
        adapter_id: id,
        ok: true,
        code: "OK",
        message: "stub",
        checked_at: new Date().toISOString(),
        limitations: [],
      };
    },
    async invoke(req) {
      return behavior(req);
    },
    cancel() {
      return { signalled: false, reason: "stub" };
    },
    normalizeResult(runner: ExecutionRunnerResult): NormalizedAdapterResult {
      return {
        kind: "NormalizedAdapterResult",
        adapter_id: id,
        status: "ok",
        code: runner.code,
        message: "",
        exit_code: 0,
        stdout: "",
        stderr: "",
        duration_ms: 0,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: [],
      };
    },
  };
}

describe("V1-PROD-03 protocols + agent failover", () => {
  it("exposes ≥4 protocol adapters with build/parse", () => {
    const ids = listProtocolIds();
    expect(ids).toEqual(["openai_compatible", "anthropic", "responses", "gemini"]);
    const adapters = createProtocolAdapters();
    const req = {
      model: "m1",
      messages: [{ role: "user" as const, content: "hi" }],
      checkpoint_id: "cp-1",
    };
    for (const id of ids) {
      const built = adapters[id].buildRequest(req);
      expect(built.url_path.length).toBeGreaterThan(0);
      expect(built.body).toBeTruthy();
      const ok = adapters[id].parseResponse(req, 200, {
        model: "served",
        choices: [{ message: { content: "x" } }],
        content: [{ type: "text", text: "x" }],
        output_text: "x",
        candidates: [{ content: { parts: [{ text: "x" }] } }],
      });
      expect(ok.checkpoint_id).toBe("cp-1");
      expect(ok.model_requested).toBe("m1");
      const quota = adapters[id].parseResponse(req, 429, {});
      expect(quota.status).toBe("quota");
      expect(quota.checkpoint_id).toBe("cp-1");
    }
  });

  it("shouldFailover on quota/failure", () => {
    expect(
      shouldFailover({
        kind: "NormalizedAdapterResult",
        adapter_id: "cursor",
        status: "failed",
        code: "HTTP_429",
        message: "rate limit",
        exit_code: 1,
        stdout: "",
        stderr: "",
        duration_ms: 1,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: [],
      }).action,
    ).toBe("switch");
  });

  it("auto-switches adapters and preserves checkpoint_id", async () => {
    const checkpoint_id = "ckpt-preserve-42";
    let cursorCalls = 0;
    const cursor = stubAdapter("cursor", async () => {
      cursorCalls++;
      return {
        kind: "NormalizedAdapterResult",
        adapter_id: "cursor",
        status: "failed",
        code: "QUOTA_EXCEEDED",
        message: "quota",
        exit_code: 1,
        stdout: "",
        stderr: "quota",
        duration_ms: 5,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        cost_provenance: "UNAVAILABLE",
        limitations: [],
      };
    });
    const agy = stubAdapter("antigravity", async () => ({
      kind: "NormalizedAdapterResult",
      adapter_id: "antigravity",
      status: "ok",
      code: "OK",
      message: "done",
      exit_code: 0,
      stdout: "ok",
      stderr: "",
      duration_ms: 10,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      cost_provenance: "UNAVAILABLE",
      limitations: [],
    }));

    const result = await invokeWithAgentFailover({
      adapters: [cursor, agy],
      request: {
        checkpoint_id,
        work_id: "w1",
        task_id: "t1",
        prompt: "do it",
        workspace_path: "/tmp",
      },
    });

    expect(cursorCalls).toBe(1);
    expect(result.switched).toBe(true);
    expect(result.checkpoint_id).toBe(checkpoint_id);
    expect(result.checkpoint.checkpoint_id).toBe(checkpoint_id);
    expect(result.primary_adapter_id).toBe("cursor");
    expect(result.served_adapter_id).toBe("antigravity");
    expect(result.result.status).toBe("ok");
  });
});
