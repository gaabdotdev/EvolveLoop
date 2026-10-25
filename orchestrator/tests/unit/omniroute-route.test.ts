import { describe, expect, it } from "vitest";
import { readOmniRouteTelemetry, validateTargetUrl } from "../../src/observability/observable-llm-adapter.js";
import { selectInferenceRoute } from "../../src/inference/route-policy.js";

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
