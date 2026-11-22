/**
 * V5-M04 — MCP server config registration (ADR-004 / ADR-005).
 * Records config only. No Core-mediated MCP host; invoke is unsupported.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ToolRegistryError, type ToolRegistryStore } from "./store.js";
import type {
  McpServerRecord,
  McpServerStoreSnapshot,
  RegisterMcpServerInput,
  ToolRecord,
} from "./types.js";

export const MCP_LIMITATIONS = [
  "MCP is host-configured; Core does not inventory or mediate Cursor MCP sessions (ADR-004)",
  "registerMcpServer records config only — invoke_supported=false",
  "No ACP equivalence: MCP ≠ ACP ≠ CLI ≠ API",
  "See docs/v5/M04/LIMITATION-mcp.md",
] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class McpServerStore {
  private readonly path: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.path = join(rootDir, "mcp-servers.json");
  }

  load(): McpServerStoreSnapshot {
    if (!existsSync(this.path)) {
      return {
        kind: "McpServerStore",
        version: 0,
        updated_at: nowIso(),
        servers: {},
        limitations: [...MCP_LIMITATIONS, "mcp-servers file absent"],
      };
    }
    const parsed = JSON.parse(
      readFileSync(this.path, "utf-8"),
    ) as McpServerStoreSnapshot;
    if (parsed.kind !== "McpServerStore") {
      throw new ToolRegistryError("INVALID_MCP_STORE", this.path);
    }
    return parsed;
  }

  list(): McpServerRecord[] {
    return Object.values(this.load().servers).sort((a, b) =>
      a.server_id.localeCompare(b.server_id),
    );
  }

  get(serverId: string): McpServerRecord | undefined {
    return this.load().servers[serverId];
  }

  /**
   * Persist MCP server config. Always honesty=unsupported, invoke_supported=false.
   * Optionally mirrors a ToolRecord into the tool registry for allowlist assignment.
   */
  registerMcpServer(
    input: RegisterMcpServerInput,
    opts?: { toolRegistry?: ToolRegistryStore },
  ): McpServerRecord {
    const server_id = input.server_id.trim();
    if (!server_id) {
      throw new ToolRegistryError("INVALID_MCP", "server_id required");
    }

    const record: McpServerRecord = {
      kind: "McpServerRecord",
      server_id,
      display_name: (input.display_name ?? server_id).trim(),
      config: { ...(input.config ?? {}) },
      honesty: "unsupported",
      invoke_supported: false,
      limitations: [...MCP_LIMITATIONS],
      registered_at: nowIso(),
      notes: [
        ...(input.notes ?? []),
        "Config recorded for inventory / assignment only",
        "Do not treat as a live MCP host session",
      ],
    };

    const snap = this.load();
    snap.servers[server_id] = record;
    atomicWrite(
      this.path,
      JSON.stringify(
        {
          kind: "McpServerStore",
          version: Math.max(1, snap.version + 1),
          updated_at: nowIso(),
          servers: snap.servers,
          limitations: [...MCP_LIMITATIONS],
        } satisfies McpServerStoreSnapshot,
        null,
        2,
      ),
    );

    if (opts?.toolRegistry) {
      const tool: ToolRecord = {
        kind: "ToolRecord",
        tool_id: `mcp.${server_id}`,
        display_name: record.display_name,
        tool_kind: "mcp",
        implementation: "mcp_config",
        honesty: "unsupported",
        capability_action: "mcp.invoke",
        notes: [
          "Mirrored from registerMcpServer",
          "invoke_supported=false — Core has no MCP runtime host",
        ],
        limitations: [...MCP_LIMITATIONS],
        enabled: false,
      };
      opts.toolRegistry.registerTool(tool);
    }

    return record;
  }
}

/**
 * Explicit refuse — never fake an MCP invoke.
 */
export function invokeMcpTool(
  _serverId: string,
  _toolName: string,
  _args?: unknown,
): never {
  throw new ToolRegistryError(
    "MCP_INVOKE_UNSUPPORTED",
    "MCP invoke is unsupported in Core (no mediated MCP runtime). See docs/v5/M04/LIMITATION-mcp.md",
  );
}

/** @deprecated name from earlier draft — use McpServerStore.registerMcpServer */
export function mcpServerStubToolRecord(serverId = "server"): ToolRecord {
  return {
    kind: "ToolRecord",
    tool_id: `mcp.${serverId}`,
    display_name: "MCP server (config only / unsupported invoke)",
    tool_kind: "mcp",
    implementation: "mcp_config",
    honesty: "unsupported",
    capability_action: "mcp.invoke",
    notes: ["Placeholder — prefer registerMcpServer()"],
    limitations: [...MCP_LIMITATIONS],
    enabled: false,
  };
}
