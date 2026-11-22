/**
 * V5-M04 — Tool Registry + Assignment JSON stores.
 * Public ops: registerTool, listTools, assignToolsToAgent (+ seed).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  RegisterToolInput,
  ToolAssignment,
  ToolAssignmentSnapshot,
  ToolRecord,
  ToolRegistrySnapshot,
} from "./types.js";

export class ToolRegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolRegistryError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

const REGISTRY_LIMITATIONS = [
  "Tool Registry ≠ Agent Registry / Model Registry",
  "Deny-by-default: tools must be explicitly assigned per agent_id",
  "No global tools-to-all-agents shortcut",
  "Native seed entries are stubs with honest contracts — not a full tool host",
];

const ASSIGNMENT_LIMITATIONS = [
  "Empty allowlist ≡ deny-all for that agent",
  "No global tools-to-all-agents shortcut",
  "Assignment does not bypass SandboxProfile / capability-gate",
];

/**
 * Two native stubs required by V5-M04.
 * Honest: registry entries only — invoke still goes through security profiles elsewhere.
 */
export function defaultNativeToolSeed(): ToolRecord[] {
  return [
    {
      kind: "ToolRecord",
      tool_id: "shell.exec",
      display_name: "Shell exec (native stub)",
      tool_kind: "shell",
      implementation: "native_stub",
      honesty: "partial",
      capability_action: "shell.execute",
      notes: [
        "Stub registration for Tool Registry allowlists",
        "Maps conceptually to CapabilityAction shell.execute when gated elsewhere",
        "This registry does not spawn processes",
      ],
      limitations: [
        "Honesty=partial: host/harness shell is not Core-mediated via this registry",
        "Stub — no invoke path implemented in tool-registry",
      ],
      enabled: true,
    },
    {
      kind: "ToolRecord",
      tool_id: "fs.read",
      display_name: "Filesystem read (native stub)",
      tool_kind: "filesystem",
      implementation: "native_stub",
      honesty: "partial",
      capability_action: "filesystem.read",
      notes: [
        "Stub registration for Tool Registry allowlists",
        "Maps conceptually to CapabilityAction filesystem.read when gated elsewhere",
        "This registry does not open files",
      ],
      limitations: [
        "Honesty=partial: host/harness FS ops are not Core-mediated via this registry",
        "Stub — no invoke path implemented in tool-registry",
      ],
      enabled: true,
    },
  ];
}

export class ToolRegistryStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "tools.json");
  }

  load(): ToolRegistrySnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "ToolRegistry",
        version: 0,
        updated_at: nowIso(),
        tools: [],
        limitations: [...REGISTRY_LIMITATIONS, "tools file absent — call seed()"],
      };
    }
    const parsed = JSON.parse(readFileSync(this.path, "utf-8")) as ToolRegistrySnapshot;
    if (parsed.kind !== "ToolRegistry") {
      throw new ToolRegistryError("INVALID", this.path);
    }
    return parsed;
  }

  /** Seed shell.exec + fs.read stubs. Idempotent unless force. */
  seed(force = false): ToolRegistrySnapshot {
    if (existsSync(this.path) && !force) {
      return this.load();
    }
    const snap: ToolRegistrySnapshot = {
      kind: "ToolRegistry",
      version: 1,
      updated_at: nowIso(),
      tools: defaultNativeToolSeed(),
      limitations: [...REGISTRY_LIMITATIONS],
    };
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  get(toolId: string): ToolRecord {
    const tool = this.load().tools.find((t) => t.tool_id === toolId);
    if (!tool) throw new ToolRegistryError("NOT_FOUND", toolId);
    return tool;
  }

  listTools(): ToolRecord[] {
    return this.load().tools.slice().sort((a, b) => a.tool_id.localeCompare(b.tool_id));
  }

  /** @deprecated use listTools */
  list(): ToolRecord[] {
    return this.listTools();
  }

  registerTool(input: RegisterToolInput | ToolRecord): ToolRecord {
    const tool: ToolRecord =
      "kind" in input && input.kind === "ToolRecord"
        ? input
        : {
            kind: "ToolRecord",
            tool_id: input.tool_id.trim(),
            display_name: input.display_name.trim(),
            tool_kind: input.tool_kind,
            implementation: input.implementation ?? "unsupported",
            honesty: input.honesty ?? "unknown",
            capability_action: input.capability_action,
            notes: input.notes ?? [],
            limitations: input.limitations ?? [],
            enabled: input.enabled ?? true,
          };

    if (!tool.tool_id) {
      throw new ToolRegistryError("INVALID_TOOL", "tool_id required");
    }

    const snap = this.load();
    const tools = snap.tools.filter((t) => t.tool_id !== tool.tool_id);
    tools.push(tool);
    tools.sort((a, b) => a.tool_id.localeCompare(b.tool_id));
    const next: ToolRegistrySnapshot = {
      kind: "ToolRegistry",
      version: Math.max(1, snap.version + 1),
      updated_at: nowIso(),
      tools,
      limitations: snap.limitations.length
        ? snap.limitations
        : [...REGISTRY_LIMITATIONS],
    };
    atomicWrite(this.path, JSON.stringify(next, null, 2));
    return tool;
  }

  /** @deprecated use registerTool */
  register(tool: ToolRecord): ToolRegistrySnapshot {
    this.registerTool(tool);
    return this.load();
  }
}

export class ToolAssignmentStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "assignments.json");
  }

  load(): ToolAssignmentSnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "ToolAssignmentStore",
        version: 0,
        updated_at: nowIso(),
        assignments: {},
        limitations: [
          ...ASSIGNMENT_LIMITATIONS,
          "assignments file absent — deny-all until assignToolsToAgent()",
        ],
      };
    }
    const parsed = JSON.parse(
      readFileSync(this.path, "utf-8"),
    ) as ToolAssignmentSnapshot;
    if (parsed.kind !== "ToolAssignmentStore") {
      throw new ToolRegistryError("INVALID_ASSIGNMENTS", this.path);
    }
    return parsed;
  }

  private persist(snap: ToolAssignmentSnapshot): ToolAssignmentSnapshot {
    atomicWrite(this.path, JSON.stringify(snap, null, 2));
    return snap;
  }

  get(agentId: string): ToolAssignment | undefined {
    return this.load().assignments[agentId];
  }

  /**
   * Replace allowlist for agent_id. Empty tool_ids = deny-all for that agent.
   * Never assigns tools globally to all agents.
   */
  assignToolsToAgent(
    agentId: string,
    toolIds: string[],
    notes?: string[],
  ): ToolAssignment {
    const id = agentId.trim();
    if (!id) throw new ToolRegistryError("INVALID_AGENT", "agent_id required");
    const unique = [...new Set(toolIds.map((t) => t.trim()).filter(Boolean))];
    const snap = this.load();
    const assignment: ToolAssignment = {
      kind: "ToolAssignment",
      agent_id: id,
      tool_ids: unique,
      updated_at: nowIso(),
      notes,
    };
    snap.assignments[id] = assignment;
    this.persist({
      kind: "ToolAssignmentStore",
      version: Math.max(1, snap.version + 1),
      updated_at: nowIso(),
      assignments: snap.assignments,
      limitations: snap.limitations.length
        ? snap.limitations
        : [...ASSIGNMENT_LIMITATIONS],
    });
    return assignment;
  }

  /** @deprecated use assignToolsToAgent */
  assign(agentId: string, toolIds: string[], notes?: string[]): ToolAssignment {
    return this.assignToolsToAgent(agentId, toolIds, notes);
  }

  list(): ToolAssignment[] {
    return Object.values(this.load().assignments).sort((a, b) =>
      a.agent_id.localeCompare(b.agent_id),
    );
  }
}
