/**
 * V1-PROD-02 — FreeLLMAPI with mock HTTP (no real localhost:3001).
 */
import { describe, it, expect } from "vitest";
import {
  FreeLLMAPIModelProvider,
  invokeWithFallback,
  type ModelProvider,
  type ModelInvokeResult,
} from "../../src/v3/model-providers/index.js";

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

describe("V1-PROD-02 FreeLLMAPI", () => {
  it("catalog discovery → ready with models", async () => {
    const provider = new FreeLLMAPIModelProvider({
      baseUrl: "http://127.0.0.1:3001/v1",
      fetchImpl: mockFetch(async (url) => {
        expect(url).toContain("/models");
        return new Response(JSON.stringify({ data: [{ id: "free-model-a" }, { id: "free-model-b" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });
    const catalog = await provider.discoverCatalog();
    expect(catalog.state).toBe("ready");
    expect(catalog.models.map((m) => m.id)).toEqual(["free-model-a", "free-model-b"]);
    expect(provider.getState()).toBe("ready");
  });

  it("unreachable host → unreachable state (no throw)", async () => {
    const provider = new FreeLLMAPIModelProvider({
      baseUrl: "http://127.0.0.1:3001/v1",
      fetchImpl: mockFetch(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.code).toBe("UNREACHABLE");
    expect(provider.getState()).toBe("unreachable");
  });

  it("401 → needsKey; 429 → exhausted", async () => {
    const needsKey = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async () => new Response("auth", { status: 401 })),
    });
    expect((await needsKey.discoverCatalog()).state).toBe("needsKey");

    const exhausted = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async () => new Response("quota exhausted", { status: 429 })),
    });
    expect((await exhausted.discoverCatalog()).state).toBe("exhausted");
  });

  it("records model_requested vs model_served on invoke", async () => {
    const provider = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async (url) => {
        if (url.endsWith("/models")) {
          return new Response(JSON.stringify({ data: [{ id: "req-model" }] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            model: "served-model-actual",
            choices: [{ message: { content: "hi" } }],
            usage: { prompt_tokens: 3, completion_tokens: 1 },
          }),
          { status: 200 },
        );
      }),
    });
    const result = await provider.invoke({ prompt: "hello", model: "req-model" });
    expect(result.status).toBe("ok");
    expect(result.freellmapi?.model_requested).toBe("req-model");
    expect(result.freellmapi?.model_served).toBe("served-model-actual");
    expect(result.model).toBe("served-model-actual");
  });

  it("transparent fallback to Ollama/other without SLA assumption", async () => {
    const primary = new FreeLLMAPIModelProvider({
      fetchImpl: mockFetch(async () => {
        throw new Error("down");
      }),
    });
    const fallback: ModelProvider = {
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
    const chain = await invokeWithFallback({
      primary,
      fallbacks: [fallback],
      request: { prompt: "x", model: "wanted" },
    });
    expect(chain.fallback_used).toBe(true);
    expect(chain.fallback_provider_id).toBe("ollama");
    expect(chain.model_requested).toBe("wanted");
    expect(chain.model_served).toBe("bonsai");
    expect(chain.final.limitations.some((l) => l.includes("no_sla_assumed"))).toBe(true);
  });
});
