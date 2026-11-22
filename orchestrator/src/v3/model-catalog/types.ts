/**
 * Model Catalog — metadata for inference backends (≠ Agent Registry, ≠ adapter harnesses).
 * No invented token counts; cost/latency fields are optional declared estimates only.
 */

export type ModelBackend = "ollama" | "openrouter" | "openai_compatible" | "unknown";
export type ModelRoleHint =
  | "general"
  | "coding"
  | "decision"
  | "embedding"
  | "review"
  | "other";

export interface ModelCatalogEntry {
  model_id: string;
  display_name: string;
  backend: ModelBackend;
  /** Local vs remote; remote must not be used with project data without explicit enable. */
  locality: "local" | "remote";
  role_hints: ModelRoleHint[];
  context_window_tokens?: number;
  /** Declared estimate only — never treat as measured telemetry. */
  estimated_cost_per_1k_tokens_usd?: number;
  notes: string[];
  enabled: boolean;
  /** Remote models default disabled until operator opts in. */
  requires_explicit_enable: boolean;
}

export interface ModelCatalogSnapshot {
  kind: "ModelCatalog";
  version: number;
  updated_at: string;
  models: ModelCatalogEntry[];
  limitations: string[];
}
