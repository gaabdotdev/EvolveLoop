/**
 * V5-M09 — Declarative Agent Studio schemas (YAML/JSON).
 * Config only — not a visual builder / marketplace.
 */

import type { AdapterId } from "../adapters/types.js";

export const AGENT_STUDIO_SCHEMA_VERSION = "1.0.0" as const;

/** Secrets must never appear in saved configs. */
export const SECRET_FIELD_NAMES = [
  "api_key",
  "apiKey",
  "token",
  "secret",
  "password",
  "credential",
  "credentials",
  "private_key",
  "privateKey",
  "access_token",
  "refresh_token",
] as const;

export interface AgentLimitsConfig {
  max_attempts?: number;
  max_tokens?: number;
  timeout_ms?: number;
}

/**
 * Declarative agent config — name, adapter, model ref, tools allowlist, limits.
 * Optional capabilities_claimed for honesty validation against adapter profile.
 */
export interface AgentConfig {
  kind: "AgentConfig";
  schema_version: typeof AGENT_STUDIO_SCHEMA_VERSION | string;
  name: string;
  /** Adapter id from AGENT_ADAPTER_CATALOG (cursor | claude-code | …). */
  adapter: AdapterId | string;
  /** Model registry ref (provider/model) — never embeds secrets. */
  model_ref?: string;
  /** Tool allowlist (tool_ids). Empty ≡ deny-all assignment intent. */
  tools_allowlist: string[];
  limits?: AgentLimitsConfig;
  /**
   * Features this config claims the agent/adapter can perform.
   * Validated against adapter capability profile (e.g. pause → cancel).
   */
  capabilities_claimed?: {
    pause?: boolean;
    cancel?: boolean;
    resume?: boolean;
    streaming?: boolean;
    tools?: boolean;
  };
  role?: string;
  notes?: string[];
}

export interface TeamAgentRef {
  name: string;
  role: string;
  /** Optional path or inline agent name already in composition. */
  agent_config_ref?: string;
}

/** Team composition — agents[] + roles. */
export interface TeamComposition {
  kind: "TeamComposition";
  schema_version: typeof AGENT_STUDIO_SCHEMA_VERSION | string;
  name: string;
  agents: TeamAgentRef[];
  roles: string[];
  notes?: string[];
}

export type WorkflowNodeType =
  | "task"
  | "approval"
  | "gate"
  | "start"
  | "end";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label?: string;
  /** Agent name when type=task. */
  agent?: string;
  /** Approval id / policy hint when type=approval. */
  approval?: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: string;
}

/**
 * Canonical workflow model — ONE model (nodes, edges, approvals).
 * No separate visual engine; YAML/JSON load only.
 */
export interface WorkflowModel {
  kind: "WorkflowModel";
  schema_version: typeof AGENT_STUDIO_SCHEMA_VERSION | string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Approval checkpoints referenced by nodes. */
  approvals: Array<{
    id: string;
    required: boolean;
    description?: string;
  }>;
  notes?: string[];
}
