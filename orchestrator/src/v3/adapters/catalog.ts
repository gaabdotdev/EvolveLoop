import type { AdapterId, AgentAdapterContract } from "./types.js";

/**
 * Priority adapter catalog — capabilities declared honestly from current Core reality.
 * Update levels only when a verified bridge exists; never invent "supported" for untested harness control.
 */
export const AGENT_ADAPTER_CATALOG: Record<AdapterId, AgentAdapterContract> = {
  cursor: {
    kind: "AgentAdapterContract",
    adapter_id: "cursor",
    display_name: "Cursor",
    kernel_provider_id: "cursor-skill",
    execution_bridge: "jobs_pickup",
    certification: "declared",
    capabilities: [
      {
        key: "sessions",
        level: "partial",
        notes: "Host agent sessions exist; Core tracks Agent Registry instances, not IDE chat transcripts.",
      },
      {
        key: "streaming",
        level: "unsupported",
        notes: "No Core-mediated stream from Cursor agent into Coordinator.",
      },
      {
        key: "tools",
        level: "partial",
        notes: "CursorSkillProvider creates jobs; tool mediation inside host is not Core-controlled.",
      },
      {
        key: "terminal",
        level: "partial",
        notes: "Host can run shell; Core shell path is separate scrubbed executor.",
      },
      {
        key: "mcp",
        level: "unknown",
        notes: "MCP is host-configured; Core does not inventory Cursor MCP sessions.",
      },
      {
        key: "subagents",
        level: "partial",
        notes: "Hierarchy spawn registers roles; Cursor Task tool is host-side, not Core adapter API.",
      },
      {
        key: "cancel",
        level: "partial",
        notes: "Jobs can be cancelled in JobStore; live Cursor agent cancel is host-owned.",
      },
      {
        key: "resume",
        level: "partial",
        notes: "Handoff Package + durable --data-dir; resume inside Cursor chat is separate.",
      },
      {
        key: "permissions",
        level: "partial",
        notes: "Delegation permissions recorded; host may exceed Core mediation for file/shell.",
      },
      {
        key: "telemetry",
        level: "partial",
        notes: "Coordination Event Log + Work Ledger; no Cursor token telemetry in Core.",
      },
      {
        key: "core_mediated_fs",
        level: "partial",
        notes: "Engine filesystem capabilities confined; Cursor agent FS ops outside engine are not mediated.",
      },
      {
        key: "core_mediated_shell",
        level: "partial",
        notes: "Engine shell scrubbed; host agent shell not mediated.",
      },
      {
        key: "handoff_package_consume",
        level: "partial",
        notes: "Envelope + ContinuityEngine apply within same work; no automatic IDE session injection.",
      },
      {
        key: "cross_provider_swap",
        level: "unsupported",
        notes: "No automatic Cursor→other harness process swap.",
      },
    ],
    limitations: [
      "execution_bridge is jobs_pickup via CursorSkillProvider, not a full Cursor Agent SDK driver",
      "authority over host-internal tools cannot be asserted by Core",
    ],
    handoff: {
      can_export_package: true,
      can_import_package: true,
      preserves_private_transcripts: false,
      notes: "Packages omit private model transcripts by design.",
    },
  },
  "claude-code": {
    kind: "AgentAdapterContract",
    adapter_id: "claude-code",
    display_name: "Claude Code",
    execution_bridge: "cli_process",
    certification: "declared",
    capabilities: [
      { key: "sessions", level: "partial", notes: "CLI process-sessions when spawned by Core; not IDE chat IDs." },
      { key: "streaming", level: "unsupported", notes: "No Core-mediated stream ingest." },
      { key: "tools", level: "partial", notes: "Harness tools run inside Claude Code; not Core-mediated." },
      { key: "terminal", level: "partial", notes: "Harness terminal; Core scrubbed shell is separate." },
      { key: "mcp", level: "unknown", notes: "External harness may support MCP; not mediated." },
      { key: "subagents", level: "unsupported", notes: "No Core bridge to Claude subagents." },
      { key: "cancel", level: "partial", notes: "SIGTERM only for Core-owned PIDs in process-sessions." },
      { key: "resume", level: "partial", notes: "Handoff Package + dry-run prompt file; IDE resume separate." },
      { key: "permissions", level: "unsupported", notes: "No Core mediation of Claude Code permissions." },
      { key: "telemetry", level: "unsupported", notes: "No Core telemetry ingest from Claude." },
      { key: "core_mediated_fs", level: "unsupported", notes: "Not mediated inside Claude harness." },
      { key: "core_mediated_shell", level: "unsupported", notes: "Not mediated inside Claude harness." },
      {
        key: "handoff_package_consume",
        level: "partial",
        notes: "applyCrossProvider rebinds ownership and may dry-run CLI with prompt package.",
      },
      {
        key: "cross_provider_swap",
        level: "partial",
        notes: "Core ownership swap verified; live IDE session migration not claimed.",
      },
    ],
    limitations: [
      "Default invoke is dry-run (prompt file); real spawn needs EVOLVELOOP_HARNESS_CONSENT=true",
      "can_invoke false when claude CLI absent from PATH",
      "Does not control IDE-attached Claude sessions",
    ],
    handoff: {
      can_export_package: true,
      can_import_package: true,
      preserves_private_transcripts: false,
      notes: "Import path is Continuity apply + optional CLI prompt; private transcripts not transferred.",
    },
  },
  codex: {
    kind: "AgentAdapterContract",
    adapter_id: "codex",
    display_name: "Codex",
    // ISSUE-FUNC-CATALOG-DRIFT-001: align with CliProcessAdapterDriver when CLI on PATH
    execution_bridge: "cli_process",
    certification: "declared",
    capabilities: [
      { key: "sessions", level: "partial", notes: "CLI process sessions via process-sessions when spawned by Core." },
      { key: "streaming", level: "unsupported", notes: "No streaming bridge." },
      { key: "tools", level: "unsupported", notes: "Host CLI tools not mediated by Core." },
      { key: "terminal", level: "partial", notes: "Spawned CLI only; not IDE terminal." },
      { key: "mcp", level: "unknown", notes: "Not inventoried by Core." },
      { key: "subagents", level: "unsupported", notes: "No Core bridge." },
      { key: "cancel", level: "partial", notes: "Cancel only for Core-owned spawned PIDs." },
      { key: "resume", level: "partial", notes: "Handoff Package export + prompt re-invoke." },
      { key: "permissions", level: "unsupported", notes: "Not mediated." },
      { key: "telemetry", level: "partial", notes: "Session records only; not full provider telemetry." },
      { key: "core_mediated_fs", level: "unsupported", notes: "Not mediated." },
      { key: "core_mediated_shell", level: "unsupported", notes: "Not mediated." },
      {
        key: "handoff_package_consume",
        level: "partial",
        notes: "Prompt file handoff; no auto-inject into IDE session.",
      },
      { key: "cross_provider_swap", level: "unsupported", notes: "No automatic swap." },
    ],
    limitations: [
      "execution_bridge=cli_process when codex CLI on PATH; otherwise driver returns blocked",
      "Does not claim IDE session injection or OS sandbox for harness path",
    ],
    handoff: {
      can_export_package: true,
      can_import_package: false,
      preserves_private_transcripts: false,
      notes: "Manual operator apply for IDE; Core can spawn CLI with prompt file.",
    },
  },
  antigravity: {
    kind: "AgentAdapterContract",
    adapter_id: "antigravity",
    display_name: "Antigravity",
    // ISSUE-FUNC-CATALOG-DRIFT-001: align with CliProcessAdapterDriver / cursor-agent
    execution_bridge: "cli_process",
    certification: "declared",
    capabilities: [
      { key: "sessions", level: "partial", notes: "CLI/cursor-agent process sessions when spawned by Core." },
      { key: "streaming", level: "unsupported", notes: "No streaming bridge." },
      { key: "tools", level: "unsupported", notes: "Host CLI tools not mediated by Core." },
      { key: "terminal", level: "partial", notes: "Spawned CLI only." },
      { key: "mcp", level: "unknown", notes: "Not inventoried by Core." },
      { key: "subagents", level: "unsupported", notes: "No Core bridge." },
      { key: "cancel", level: "partial", notes: "Cancel only for Core-owned spawned PIDs." },
      { key: "resume", level: "partial", notes: "Handoff Package export + prompt re-invoke." },
      { key: "permissions", level: "unsupported", notes: "Not mediated." },
      { key: "telemetry", level: "unsupported", notes: "Not mediated." },
      { key: "core_mediated_fs", level: "unsupported", notes: "Not mediated." },
      { key: "core_mediated_shell", level: "unsupported", notes: "Not mediated." },
      {
        key: "handoff_package_consume",
        level: "partial",
        notes: "Envelope can name Antigravity as target; no auto-inject.",
      },
      { key: "cross_provider_swap", level: "unsupported", notes: "No automatic swap." },
    ],
    limitations: [
      "execution_bridge=cli_process when antigravity/cursor-agent CLI on PATH; otherwise blocked",
      "Does not claim IDE session injection or OS sandbox for harness path",
    ],
    handoff: {
      can_export_package: true,
      can_import_package: false,
      preserves_private_transcripts: false,
      notes: "Manual operator apply for IDE; Core can spawn CLI with prompt file.",
    },
  },
};

export function listAdapterContracts(): AgentAdapterContract[] {
  return Object.values(AGENT_ADAPTER_CATALOG);
}

export function getAdapterContract(adapterId: AdapterId): AgentAdapterContract {
  const c = AGENT_ADAPTER_CATALOG[adapterId];
  if (!c) {
    throw new Error(`Unknown adapter: ${adapterId}`);
  }
  return c;
}

export function isAdapterId(value: string): value is AdapterId {
  return value in AGENT_ADAPTER_CATALOG;
}
