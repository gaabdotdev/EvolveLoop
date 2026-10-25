import { afterEach, describe, expect, it } from "vitest";
import { readOmniRouteTelemetry, validateTargetUrl, ObservableLlmProviderAdapter } from "../../src/observability/observable-llm-adapter.js";
import { selectInferenceRoute } from "../../src/inference/route-policy.js";
import { ObservableInferenceProvider } from "../../src/providers/observable-inference-provider.js";
import type { ExecuteRequest } from "../../src/types/index.js";

function request(taskClass: string): ExecuteRequest {
  return {
    run_id: "run-route-1",
    node_id: "node-route-1",
    capability: "llm.complete",
    inputs: [{ prompt: "ping", task_class: taskClass }],
    definition_of_done: [],
    policy: { retries_remaining: 0, timeout_ms: 1000 },
    provider_id: "observable-inference",
    executor_type: "observable-inference",
    memory_scope: "feat-route",
    knowledge_hits: [],
    briefing: "ping",
    node: {
      id: "node-route-1",
      capability: "llm.complete",
      type: "worker",
      dependencies: [],
      definition_of_done: [{ id: "d1", check: "done", verification: "evidence" }],
      inputs: [],
      retry_count: 0,
      status: "pending",
    },
  } as ExecuteRequest;
}

afterEach(() => {
  delete process.env.EVOLVELOOP_INFERENCE_GATEWAY;
  delete process.env.EVOLVELOOP_OMNIROUTE_API_KEY;
});

describe("inference route policy", () => {
  it("keeps the direct provider when OmniRoute is not enabled", () => {
    const route = selectInferenceRoute("simple", {});
    expect(route.gateway).toBe("direct");
    expect(route).not.toHaveProperty("gatewayUrl");
  });

  it("selects the observed zero-cost model for a simple task", () => {
    const route = selectInferenceRoute("code", { EVOLVELOOP_INFERENCE_GATEWAY: "omniroute" });
    expect(route).toMatchObject({
      gateway: "omniroute",
      provider: "openai",
      model: "ddgw/gpt-5.4-mini",
      gatewayUrl: "http://127.0.0.1:20128/api/v1/chat/completions",
    });
  });

  it("does not send critical review to a paid or same-model fallback", () => {
    const route = selectInferenceRoute("review", { EVOLVELOOP_INFERENCE_GATEWAY: "omniroute" });
    expect(route).toEqual({
      policyVersion: "v1",
      gateway: "blocked",
      reason: "No model measured independently of the writer is eligible, and paid fallback is not authorized.",
    });
  });

  it("rejects plain HTTP unless loopback mode is explicitly enabled", () => {
    expect(() => validateTargetUrl("http://127.0.0.1:20128/api/v1/chat/completions")).toThrow(/Only HTTPS/);
    expect(validateTargetUrl("http://127.0.0.1:20128/api/v1/chat/completions", { allowLoopback: true }).hostname).toBe(
      "127.0.0.1",
    );
  });
});

describe("OmniRoute response telemetry", () => {
  it("reads provider headers and does not invent absent token counts", () => {
    const headers = new Headers({
      "x-omniroute-version": "3.8.52",
      "x-omniroute-provider": "ddgw",
      "x-omniroute-model": "gpt-5.4-mini",
      "x-omniroute-response-cost": "0.0000000000",
      "x-omniroute-latency-ms": "1776",
    });
    const telemetry = readOmniRouteTelemetry(headers);
    expect(telemetry).toMatchObject({
      gateway: "omniroute",
      measurement: "response-header",
      provider: "ddgw",
      model: "gpt-5.4-mini",
      costUsd: "0.0000000000",
      latencyMs: 1776,
    });
    expect(telemetry?.tokensIn).toBeUndefined();
    expect(telemetry?.tokensOut).toBeUndefined();
  });

  it("returns undefined when the response did not come from OmniRoute", () => {
    expect(readOmniRouteTelemetry(new Headers({ "content-type": "application/json" }))).toBeUndefined();
  });

  it("routes a provider execution through the configured gateway and blocks review", async () => {
    process.env.EVOLVELOOP_INFERENCE_GATEWAY = "omniroute";
    process.env.EVOLVELOOP_OMNIROUTE_API_KEY = "local-test-key";
    let called = "";
    const fetchImpl = async (url: string) => {
      called = url;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "pong" } }],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4, estimated: true },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-omniroute-version": "3.8.52",
            "x-omniroute-provider": "ddgw",
            "x-omniroute-model": "gpt-5.4-mini",
          },
        },
      );
    };
    const adapter = new ObservableLlmProviderAdapter(fetchImpl as never, {
      allowLoopback: true,
      allowedGateways: ["127.0.0.1"],
    });
    const provider = new ObservableInferenceProvider({ id: "route-test", adapter, memoryRoot: "/tmp/omniroute-route-test" });
    const ok = await provider.execute(request("simple"));
    expect(ok.success).toBe(true);
    expect(called).toContain("http://127.0.0.1:20128/api/v1/chat/completions");
    const blocked = await provider.execute(request("review"));
    expect(blocked.success).toBe(false);
    expect(blocked.error?.code).toBe("ROUTE_BLOCKED");
  });

  it("ignores an authorization header", () => {
    const headers = new Headers({
      authorization: "Bearer secret-value",
      "x-omniroute-provider": "ddgw",
      "x-omniroute-model": "gpt-5.4-mini",
    });
    const telemetry = readOmniRouteTelemetry(headers);
    expect(JSON.stringify(telemetry)).not.toContain("secret-value");
    expect(JSON.stringify(telemetry)).not.toContain("authorization");
  });
});
