import { describe, it, expect } from "vitest";
import { probeOpenRouterJev, invokeOpenRouterJev } from "../../src/v3/routing/openrouter-jev.js";

describe("OpenRouter Jev gates", () => {
  it("fails closed without consent even if key present in env", () => {
    const probe = probeOpenRouterJev({ consent: false, apiKey: "sk-test" });
    expect(probe.available).toBe(false);
    expect(probe.error).toBe("consent_required");
  });

  it("fails closed with consent but missing key", () => {
    const prev = process.env.OPENROUTER_API_KEY;
    const prev2 = process.env.EVOLVELOOP_OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.EVOLVELOOP_OPENROUTER_API_KEY;
    const probe = probeOpenRouterJev({ consent: true, apiKey: "" });
    expect(probe.available).toBe(false);
    expect(probe.error).toBe("api_key_missing");
    if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev;
    if (prev2 !== undefined) process.env.EVOLVELOOP_OPENROUTER_API_KEY = prev2;
  });

  it("invoke without consent returns disabled", async () => {
    const res = await invokeOpenRouterJev(
      {
        work_id: "w",
        task_summary: "t",
        candidates: [{ kind: "model", id: "m1", score: 1, reasons: [] }],
      },
      { consent: false, apiKey: "sk-test" },
    );
    expect(res.status).toBe("disabled");
  });
});
