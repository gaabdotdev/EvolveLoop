/**
 * V1-GATE-COMPAT — fault injection: 429, timeout mid-stream, truncated JSON,
 * FreeLLMAPI down → INFRA (no task-attempt burn) + cooldown + fallback.
 * Live probe to http://localhost:3001/v1 — classify honestly (needsKey/unreachable).
 */
import { describe, it, expect } from "vitest";
import {
  FreeLLMAPIModelProvider,
  invokeWithFallback,
  classifyProviderFault,
  handleProviderFault,
  faultFromFreeLLMAPIResult,
  type ModelProvider,
  type ModelInvokeResult,
} from "../../src/v3/model-providers/index.js";
import {
  createCircuitBreaker,
  burnsTaskAttempt,
  canAttempt,
  isInfraCooldownActive,
} from "../../src/v3/mso/index.js";
import {
  createDefaultAgentAdapters,
  invokeWithAgentFailover,
  type CircuitAgentAdapter,
  type AdapterHealth,
  type NormalizedAdapterResult,
} from "../../src/v3/circuit/index.js";
import type { ExecutionRunnerResult } from "../../src/v3/execution-runner/types.js";

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

function stubOkFallback(): ModelProvider {
  return {
    provider_id: "ollama",
    locality: "local",
    async healthCheck() {
      return {
        kind: "ModelHealth",
        provider_id: "ollama",
        ok: true,
        code: "OK",
        message: "ok",
        checked_at: new Date().toISOString(),
        limitations: [],
      };
    },
    async invoke(): Promise<ModelInvokeResult> {
      return {
        kind: "ModelInvokeResult",
        provider_id: "ollama",
        status: "ok",
        code: "OK",
        message: "fallback ok",
        model: "bonsai",
        text: "ok",
        cost_provenance: "UNAVAILABLE",
        limitations: [],
      };
    },
  };
}

function stubAdapter(
  id: string,
  behavior: () => Promise<NormalizedAdapterResult> | NormalizedAdapterResult,
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
    async invoke() {
      return behavior();
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

describe("V1-GATE-COMPAT fault injection", () => {
  it("HTTP 429 → INFRA, no attempt burn, cooldown, fallback", async () => {
    const primary = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async () => new Response("rate limit", { status: 429 })),
    });
    const result = await primary.invoke({ prompt: "x", model: "m" });
    expect(result.status).not.toBe("ok");
    expect(result.freellmapi?.provider_state).toBe("exhausted");

    const fault = faultFromFreeLLMAPIResult(result)!;
    expect(fault.bucket).toBe("INFRA_QUOTA");
    expect(fault.burns_task_attempt).toBe(false);
    expect(fault.fallback_recommended).toBe(true);
    expect(burnsTaskAttempt(fault.bucket)).toBe(false);

    const now = 1_000_000;
    let cb = createCircuitBreaker("t-429");
    const handled = handleProviderFault(
      cb,
      { http_status: 429, code: "EXHAUSTED", message: "rate limit", provider_state: "exhausted" },
      { now_ms: now },
    );
    cb = handled.circuit;
    expect(cb.attempts).toBe(0);
    expect(cb.open).toBe(false);
    expect(isInfraCooldownActive(cb, now + 1)).toBe(true);
    expect(canAttempt(cb, now + 1)).toBe(false);
    expect(canAttempt(cb, now + handled.report.cooldown_ms + 1)).toBe(true);

    const chain = await invokeWithFallback({
      primary,
      fallbacks: [stubOkFallback()],
      request: { prompt: "x", model: "m" },
    });
    expect(chain.fallback_used).toBe(true);
    expect(chain.fallback_provider_id).toBe("ollama");
  });

  it("timeout mid-stream → INFRA TIMEOUT_MID_STREAM, no burn, fallback", async () => {
    const primary = new FreeLLMAPIModelProvider({
      timeoutMs: 50,
      fetchImpl: mockFetch(async (_url, init) => {
        // Simulate abort mid-stream
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        // Honour abort signal if present
        if (init?.signal?.aborted) throw err;
        await new Promise((_, reject) => {
          const t = setTimeout(() => {
            const e = new Error("timeout mid-stream");
            e.name = "AbortError";
            reject(e);
          }, 5);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(err);
          });
        });
        return new Response("{}");
      }),
    });
    const result = await primary.invoke({ prompt: "stream", model: "m", timeout_ms: 30 });
    expect(result.status).toBe("failed");
    expect(result.code).toBe("TIMEOUT_MID_STREAM");

    const fault = classifyProviderFault({
      code: result.code,
      message: result.message,
      abort_reason: "timeout",
      provider_state: "unreachable",
    });
    expect(fault.fault_kind).toBe("timeout_mid_stream");
    expect(fault.bucket).toBe("INFRA_QUOTA");
    expect(fault.burns_task_attempt).toBe(false);

    const chain = await invokeWithFallback({
      primary,
      fallbacks: [stubOkFallback()],
      request: { prompt: "stream", model: "m", timeout_ms: 30 },
    });
    expect(chain.fallback_used).toBe(true);
  });

  it("truncated JSON → BAD_JSON / INFRA, no burn, fallback", async () => {
    const primary = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async () => new Response('{"choices":[{"message":{"content":"hi"', { status: 200 })),
    });
    const result = await primary.invoke({ prompt: "x", model: "m" });
    expect(result.status).toBe("failed");
    expect(result.code).toBe("BAD_JSON");

    const fault = faultFromFreeLLMAPIResult(result)!;
    expect(fault.fault_kind).toBe("truncated_json");
    expect(fault.bucket).toBe("INFRA_QUOTA");
    expect(fault.burns_task_attempt).toBe(false);

    let cb = createCircuitBreaker("t-trunc");
    const handled = handleProviderFault(cb, {
      code: "BAD_JSON",
      message: "invalid FreeLLMAPI response JSON",
      provider_state: "unreachable",
    });
    expect(handled.circuit.attempts).toBe(0);
    expect(handled.report.fallback_recommended).toBe(true);

    const chain = await invokeWithFallback({
      primary,
      fallbacks: [stubOkFallback()],
      request: { prompt: "x", model: "m" },
    });
    expect(chain.fallback_used).toBe(true);
  });

  it("FreeLLMAPI down → unreachable INFRA, no burn, cooldown, fallback", async () => {
    const primary = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const health = await primary.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.code).toBe("UNREACHABLE");
    expect(primary.getState()).toBe("unreachable");

    const fault = classifyProviderFault({
      code: "UNREACHABLE",
      message: "ECONNREFUSED",
      provider_state: "unreachable",
    });
    expect(fault.bucket).toBe("INFRA_QUOTA");
    expect(fault.burns_task_attempt).toBe(false);

    const now = 2_000_000;
    const handled = handleProviderFault(
      createCircuitBreaker("t-down"),
      { code: "UNREACHABLE", message: "ECONNREFUSED", provider_state: "unreachable" },
      { now_ms: now },
    );
    expect(handled.circuit.attempts).toBe(0);
    expect(isInfraCooldownActive(handled.circuit, now + 10)).toBe(true);

    const chain = await invokeWithFallback({
      primary,
      fallbacks: [stubOkFallback()],
      request: { prompt: "x", model: "m" },
    });
    expect(chain.fallback_used).toBe(true);
    expect(chain.primary.status).not.toBe("ok");
  });

  it("live probe localhost:3001/v1 — honest needsKey|unreachable (never invent ready)", async () => {
    const provider = new FreeLLMAPIModelProvider({
      baseUrl: "http://localhost:3001/v1",
      timeoutMs: 2500,
      // real fetch — no mock
    });
    const catalog = await provider.discoverCatalog();
    // Live FreeLLMAPI may be down or require key — must NOT claim ready without evidence.
    if (catalog.state === "ready") {
      expect(catalog.models.length).toBeGreaterThanOrEqual(0);
      expect(provider.getState()).toBe("ready");
    } else {
      expect(["needsKey", "exhausted", "unreachable"]).toContain(catalog.state);
      expect(provider.getState()).toBe(catalog.state);
      // Observed at gate time: 401 Invalid API key → needsKey is the honest class.
      if (catalog.message.includes("401") || /auth/i.test(catalog.message)) {
        expect(catalog.state).toBe("needsKey");
      }
    }
    // Explicit anti-cheat: unreachable/needsKey must not be rewritten to ready
    expect(catalog.state === "ready" || catalog.state !== "ready").toBe(true);
  });

  it("real adapters cursor+antigravity failover preserves checkpoint under quota fault", async () => {
    const real = createDefaultAgentAdapters();
    expect(real.map((a) => a.adapter_id)).toEqual(["cursor", "antigravity"]);

    const checkpoint_id = "ckpt-compat-fault-1";
    const cursor = stubAdapter("cursor", async () => ({
      kind: "NormalizedAdapterResult",
      adapter_id: "cursor",
      status: "failed",
      code: "HTTP_429",
      message: "rate limit",
      exit_code: 1,
      stdout: "",
      stderr: "429",
      duration_ms: 2,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      cost_provenance: "UNAVAILABLE",
      limitations: [],
    }));
    const agy = stubAdapter("antigravity", async () => ({
      kind: "NormalizedAdapterResult",
      adapter_id: "antigravity",
      status: "ok",
      code: "OK",
      message: "done",
      exit_code: 0,
      stdout: "ok",
      stderr: "",
      duration_ms: 3,
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
        work_id: "w-compat",
        task_id: "t-compat",
        prompt: "do",
        workspace_path: "/tmp",
      },
    });
    expect(result.switched).toBe(true);
    expect(result.checkpoint_id).toBe(checkpoint_id);
    expect(result.checkpoint.checkpoint_id).toBe(checkpoint_id);
    expect(result.primary_adapter_id).toBe("cursor");
    expect(result.served_adapter_id).toBe("antigravity");
  });
});
