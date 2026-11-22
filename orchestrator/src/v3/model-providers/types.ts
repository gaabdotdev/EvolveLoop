/**
 * Decoupled ModelProvider interfaces (V0 rule 1+1+1).
 * FreeLLMAPI / Laya are V1/V2 — typed stubs only (see stubs.ts / decision-engine.ts).
 */

export type CostProvenance = "reported" | "estimated" | "UNAVAILABLE";

export interface ModelHealth {
  kind: "ModelHealth";
  provider_id: string;
  ok: boolean;
  code: string;
  message: string;
  model?: string;
  base_url?: string;
  checked_at: string;
  limitations: string[];
}

export interface ModelInvokeRequest {
  prompt: string;
  model?: string;
  timeout_ms?: number;
  work_id?: string;
  task_id?: string;
  /** V1-TOK-16 — optional layer hint for constrained decoding plumbing. */
  layer?: 0 | 1 | 2;
  /** V1-TOK-16 — optional grammar attachment (layer 0). */
  grammar?: {
    dialect: "gbnf" | "xgrammar" | "json_schema";
    source: string;
    name?: string;
  };
}

export interface ModelInvokeResult {
  kind: "ModelInvokeResult";
  provider_id: string;
  status: "ok" | "blocked" | "failed";
  code: string;
  message: string;
  model?: string;
  text?: string;
  latency_ms?: number;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  cost_provenance: CostProvenance;
  limitations: string[];
}

export interface ModelProvider {
  readonly provider_id: string;
  readonly locality: "local" | "remote";
  healthCheck(): Promise<ModelHealth>;
  invoke(req: ModelInvokeRequest): Promise<ModelInvokeResult>;
}
