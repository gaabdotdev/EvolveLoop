/**
 * V5-M04 — Tool Registry & assignment (ADR-004/005).
 * Per-agent allowlist; deny-by-default. MCP config recorded, invoke unsupported.
 */

/** How the tool is implemented relative to Core mediation. */
export type ToolImplementation = "native_stub" | "mcp_config" | "unsupported";

/** Capability honesty (never upgrade silently). */
export type ToolHonesty =
  | "supported"
  | "partial"
  | "unsupported"
  | "unknown";

export type ToolKind = "filesystem" | "shell" | "mcp" | "other";

export interface ToolRecord {
  kind: "ToolRecord";
  tool_id: string;
  display_name: string;
  tool_kind: ToolKind;
  implementation: ToolImplementation;
  honesty: ToolHonesty;
  /** Optional map to CapabilityAction vocabulary (filesystem.read, shell.execute, …). */
  capability_action?: string;
  notes: string[];
  limitations: string[];
  enabled: boolean;
}

export interface ToolAssignment {
  kind: "ToolAssignment";
  agent_id: string;
  /** Explicit allowlist — empty means no tools (deny-all). */
  tool_ids: string[];
  updated_at: string;
  notes?: string[];
}

export type ToolAuthorizeVerdict = "allow" | "deny";

export interface ToolAuthorizeResult {
  kind: "ToolAuthorizeResult";
  verdict: ToolAuthorizeVerdict;
  allowed: boolean;
  agent_id: string;
  tool_id: string;
  reason: string;
  checked_at: string;
}

export interface ToolRegistrySnapshot {
  kind: "ToolRegistry";
  version: number;
  updated_at: string;
  tools: ToolRecord[];
  limitations: string[];
}

export interface ToolAssignmentSnapshot {
  kind: "ToolAssignmentStore";
  version: number;
  updated_at: string;
  assignments: Record<string, ToolAssignment>;
  limitations: string[];
}

/** Recorded MCP server config — never claims a live Core-mediated host. */
export interface McpServerRecord {
  kind: "McpServerRecord";
  server_id: string;
  display_name: string;
  /** Opaque config snapshot (command/args/url refs only — no secret values). */
  config: Record<string, unknown>;
  honesty: "unsupported";
  /** Always false in M04 — no real MCP runtime mediated by Core. */
  invoke_supported: false;
  limitations: string[];
  registered_at: string;
  notes: string[];
}

export interface McpServerStoreSnapshot {
  kind: "McpServerStore";
  version: number;
  updated_at: string;
  servers: Record<string, McpServerRecord>;
  limitations: string[];
}

export interface RegisterToolInput {
  tool_id: string;
  display_name: string;
  tool_kind: ToolKind;
  implementation?: ToolImplementation;
  honesty?: ToolHonesty;
  capability_action?: string;
  notes?: string[];
  limitations?: string[];
  enabled?: boolean;
}

export interface RegisterMcpServerInput {
  server_id: string;
  display_name?: string;
  /** Config keys only; do not pass secret values. */
  config?: Record<string, unknown>;
  notes?: string[];
}
