/**
 * Deterministic resource routing — hard constraints first.
 * Jev / OmniRoute LLM decision path is NOT_IMPLEMENTED (fail-closed when requested).
 */

import type { AdapterId } from "../adapters/types.js";
import type { ModelRoleHint } from "../model-catalog/types.js";

export interface RouteRequest {
  work_id: string;
  task_id?: string;
  role_hint?: ModelRoleHint;
  /** Prefer local models/adapters when true (default true). */
  prefer_local?: boolean;
  /** Require adapter that can_invoke today. */
  require_invokable_adapter?: boolean;
  /**
   * If true, attempt decision model after hard constraints.
   * backend: local Ollama systemone (default) or openrouter (requires consent+key).
   */
  use_decision_model?: boolean;
  decision_backend?: "local" | "openrouter";
  /** Required for openrouter — remote project data consent. */
  remote_consent?: boolean;
}

export interface RouteCandidate {
  kind: "model" | "adapter";
  id: string;
  score: number;
  reasons: string[];
  locality?: "local" | "remote";
  adapter_id?: AdapterId;
  can_invoke?: boolean;
}

export interface RouteDecision {
  kind: "RouteDecision";
  work_id: string;
  generated_at: string;
  status: "selected" | "no_candidate" | "decision_model_unavailable";
  selected?: RouteCandidate;
  candidates: RouteCandidate[];
  rejected: Array<{ id: string; reason: string }>;
  limitations: string[];
}
