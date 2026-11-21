/**
 * Agent adapter contracts — declare observable capabilities only.
 * Does not claim harness execution until a provider bridge is verified.
 */

export type AdapterId = "cursor" | "claude-code" | "codex" | "antigravity";

export type AdapterCapabilityLevel =
  | "supported"
  | "SUPPORTED"
  | "partial"
  | "PARTIAL"
  | "unsupported"
  | "UNSUPPORTED"
  | "unknown"
  | "PROBE_ONLY"
  | "DRY_RUN"
  | "BLOCKED";

/** Normalize legacy lowercase levels to V3.5 matrix vocabulary. */
export function normalizeCapabilityLevel(
  level: AdapterCapabilityLevel,
): "SUPPORTED" | "PARTIAL" | "PROBE_ONLY" | "DRY_RUN" | "BLOCKED" | "UNSUPPORTED" {
  switch (level) {
    case "supported":
    case "SUPPORTED":
      return "SUPPORTED";
    case "partial":
    case "PARTIAL":
      return "PARTIAL";
    case "PROBE_ONLY":
      return "PROBE_ONLY";
    case "DRY_RUN":
      return "DRY_RUN";
    case "BLOCKED":
      return "BLOCKED";
    case "unsupported":
    case "UNSUPPORTED":
    case "unknown":
    default:
      return "UNSUPPORTED";
  }
}

export type AdapterCapabilityKey =
  | "sessions"
  | "streaming"
  | "tools"
  | "terminal"
  | "mcp"
  | "subagents"
  | "cancel"
  | "resume"
  | "permissions"
  | "telemetry"
  | "core_mediated_fs"
  | "core_mediated_shell"
  | "handoff_package_consume"
  | "cross_provider_swap";

export interface AdapterCapability {
  key: AdapterCapabilityKey;
  level: AdapterCapabilityLevel;
  notes: string;
}

export interface AgentAdapterContract {
  kind: "AgentAdapterContract";
  adapter_id: AdapterId;
  display_name: string;
  /** Kernel provider id when one already exists (e.g. cursor-skill). */
  kernel_provider_id?: string;
  /** Whether Core can spawn/drive this harness today. */
  execution_bridge: "none" | "jobs_pickup" | "cli_process" | "planned";
  certification: "declared" | "verified" | "blocked";
  capabilities: AdapterCapability[];
  limitations: string[];
  handoff: {
    can_export_package: boolean;
    can_import_package: boolean;
    preserves_private_transcripts: false;
    notes: string;
  };
}

export interface CrossProviderHandoffEnvelope {
  kind: "CrossProviderHandoffEnvelope";
  handoff_id: string;
  work_id: string;
  task_id: string;
  from_adapter: AdapterId | "unknown";
  to_adapter: AdapterId;
  /** Handoff Package id — source of truth remains ContinuityEngine. */
  package_ref: string;
  next_action: string;
  /**
   * true only after applyCrossProvider transferred Core ownership.
   * Does not claim full live IDE session migration.
   */
  auto_swap: boolean;
  to_agent_id?: string;
  invoke_status?: string;
  adapter_limitations: string[];
  created_at: string;
}
