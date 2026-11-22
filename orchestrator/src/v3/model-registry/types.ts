/**
 * V5-M03 — Model & Provider Freedom domain types (ADR-002: Agent ≠ Model).
 * Separate from Agent Registry; no invented costs/tokens.
 */

/** Who owns model selection for an integration path. */
export type ExecutionModelControl = "harness_owned" | "runtime_owned";

/** Usage / cost honesty — never invent numbers when unavailable. */
export type UsageProvenance = "measured" | "estimated" | "unavailable";

/** Selection scopes (mín. 2). Precedence: work > workspace. */
export type ModelSelectionScope = "workspace" | "work";

export type ProviderImplementation = "live" | "stub";

export type ProviderLocality = "local" | "remote" | "unknown";

/** Declared capability honesty for a provider entry (not Agent adapter caps). */
export type ProviderCapabilityHonesty =
  | "supported"
  | "partial"
  | "unsupported"
  | "unknown";

export interface ProviderCapability {
  key: string;
  honesty: ProviderCapabilityHonesty;
  notes: string;
}

/**
 * Provider Registry record — metadata + honesty; not an AgentRecord.
 * Credentials are refs only (env var names / path kinds), never secret values.
 */
export interface ProviderRecord {
  kind: "ProviderRecord";
  provider_id: string;
  display_name: string;
  locality: ProviderLocality;
  implementation: ProviderImplementation;
  /** First-class providers: freellmapi, ollama, custom. */
  capabilities: ProviderCapability[];
  limitations: string[];
  /** Env var names that may hold secrets — never dump values. */
  credential_env_vars: string[];
  enabled: boolean;
}

/**
 * Model Registry record — generation capacity shared by many Agents.
 * Distinct from AgentRecord.provider_id / model_id (metadata only on Agent).
 */
export interface ModelRecord {
  kind: "ModelRecord";
  model_id: string;
  display_name: string;
  provider_id: string;
  enabled: boolean;
  /** Remote models require explicit enable before routing. */
  requires_explicit_enable: boolean;
  notes: string[];
}

export interface ModelPreference {
  provider_id: string;
  model_id?: string;
}

export interface ScopedModelPreference {
  scope: ModelSelectionScope;
  /** Required for work scope. */
  work_id?: string;
  preference: ModelPreference;
  updated_at: string;
}

export interface ModelSelectionResolved {
  kind: "ModelSelectionResolved";
  preference: ModelPreference;
  /** Scope that won (work overrides workspace). */
  resolved_from: ModelSelectionScope;
  /** Human-readable precedence trail. */
  reasons: string[];
}

export interface RoutingPolicy {
  /** Ordered fallback provider ids after primary. */
  fallback_provider_ids: string[];
  /** When false, never try fallbacks even if primary fails. */
  allow_fallback: boolean;
  /** Providers that must never be selected (explicit block). */
  blocked_provider_ids?: string[];
}

export interface RoutingAttemptReason {
  provider_id: string;
  outcome: "selected" | "skipped" | "failed" | "blocked";
  reason: string;
}

export interface RoutingDecision {
  kind: "RoutingDecision";
  primary_provider_id: string;
  selected_provider_id: string | null;
  fallback_used: boolean;
  policy: RoutingPolicy;
  reasons: RoutingAttemptReason[];
  /** True when policy forbade a silent/implicit fallback. */
  policy_blocked_silent_fallback: boolean;
}

/** Usage record — tokens/cost only when provenance allows; never invent. */
export interface UsageRecord {
  kind: "UsageRecord";
  provider_id: string;
  model_id?: string;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  provenance: UsageProvenance;
  notes: string[];
}

export interface ModelRegistrySnapshot {
  kind: "ModelRegistry";
  version: number;
  updated_at: string;
  models: ModelRecord[];
  limitations: string[];
}

export interface ProviderRegistrySnapshot {
  kind: "ProviderRegistry";
  version: number;
  updated_at: string;
  providers: ProviderRecord[];
  limitations: string[];
}

export interface SelectionStoreSnapshot {
  kind: "ModelSelectionStore";
  version: number;
  updated_at: string;
  /** At most one workspace preference. */
  workspace?: ScopedModelPreference;
  /** Preferences keyed by work_id. */
  works: Record<string, ScopedModelPreference>;
}
