/**
 * V5-M03 — Custom ModelProvider stub (honest blocked invoke).
 */

import type {
  ModelHealth,
  ModelInvokeRequest,
  ModelInvokeResult,
  ModelProvider,
} from "../model-providers/types.js";

/** Custom provider stub — never silently succeeds. */
export class CustomModelProviderStub implements ModelProvider {
  readonly provider_id = "custom";
  readonly locality = "remote" as const;

  async healthCheck(): Promise<ModelHealth> {
    return {
      kind: "ModelHealth",
      provider_id: this.provider_id,
      ok: false,
      code: "STUB_CUSTOM",
      message: "Custom ModelProvider is a typed stub — not live",
      checked_at: new Date().toISOString(),
      limitations: [
        "V5-M03 stub only",
        "Register a live custom implementation before routing",
      ],
    };
  }

  async invoke(_req: ModelInvokeRequest): Promise<ModelInvokeResult> {
    return {
      kind: "ModelInvokeResult",
      provider_id: this.provider_id,
      status: "blocked",
      code: "STUB_CUSTOM",
      message: "Custom provider invoke blocked (stub)",
      cost_provenance: "UNAVAILABLE",
      limitations: ["V5-M03 stub — use freellmapi or ollama"],
    };
  }
}
