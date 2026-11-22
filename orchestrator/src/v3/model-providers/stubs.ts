/**
 * V1/V2 provider stubs (V0-ADAPT-03) — FreeLLMAPI plugs later; interfaces stay decoupled.
 */

import type {
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "./types.js";

/** FreeLLMAPI gateway stub — V1 target; V0 never routes production traffic here. */
export class FreeLLMAPIModelProviderStub implements ModelProvider {
  readonly provider_id = "freellmapi";
  readonly locality = "remote" as const;

  async healthCheck(): Promise<ModelHealth> {
    return {
      kind: "ModelHealth",
      provider_id: this.provider_id,
      ok: false,
      code: "STUB_V1",
      message: "FreeLLMAPI ModelProvider is a typed stub until V1 — not invoked in V0",
      checked_at: new Date().toISOString(),
      limitations: [
        "V0-ADAPT-03 stub only",
        "Configure Ollama + OpenRouter for V0 rule 1+1",
      ],
    };
  }

  async invoke(_req: ModelInvokeRequest): Promise<ModelInvokeResult> {
    return {
      kind: "ModelInvokeResult",
      provider_id: this.provider_id,
      status: "blocked",
      code: "STUB_V1",
      message: "FreeLLMAPI invoke blocked in V0 (stub)",
      cost_provenance: "UNAVAILABLE",
      limitations: ["V0-ADAPT-03 stub — use Ollama or OpenRouter"],
    };
  }
}
