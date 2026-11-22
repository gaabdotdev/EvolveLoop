/**
 * V5-M04 — Tool Registry & assignment (ADR-004/005).
 * registerTool / listTools / assignToolsToAgent / agentMayUseTool / registerMcpServer.
 */

export type {
  ToolImplementation,
  ToolHonesty,
  ToolKind,
  ToolRecord,
  ToolAssignment,
  ToolAuthorizeVerdict,
  ToolAuthorizeResult,
  ToolRegistrySnapshot,
  ToolAssignmentSnapshot,
  McpServerRecord,
  McpServerStoreSnapshot,
  RegisterToolInput,
  RegisterMcpServerInput,
} from "./types.js";

export {
  ToolRegistryStore,
  ToolAssignmentStore,
  ToolRegistryError,
  defaultNativeToolSeed,
} from "./store.js";

export {
  agentMayUseTool,
  authorizeToolUse,
  assertToolAllowed,
  ToolGovernanceError,
  type AgentMayUseToolInput,
  type AuthorizeToolInput,
} from "./governance.js";

export {
  McpServerStore,
  invokeMcpTool,
  mcpServerStubToolRecord,
  MCP_LIMITATIONS,
} from "./mcp.js";

import { join } from "node:path";
import { agentMayUseTool as checkAgentMayUseTool } from "./governance.js";
import { McpServerStore } from "./mcp.js";
import { ToolAssignmentStore, ToolRegistryStore } from "./store.js";
import type {
  RegisterMcpServerInput,
  RegisterToolInput,
  ToolAuthorizeResult,
  ToolRecord,
} from "./types.js";

export interface ToolFreedomHandles {
  registry: ToolRegistryStore;
  assignments: ToolAssignmentStore;
  mcp: McpServerStore;
  rootDir: string;
  registerTool: (input: RegisterToolInput | ToolRecord) => ToolRecord;
  listTools: () => ToolRecord[];
  assignToolsToAgent: (
    agentId: string,
    toolIds: string[],
    notes?: string[],
  ) => ReturnType<ToolAssignmentStore["assignToolsToAgent"]>;
  agentMayUseTool: (agentId: string, toolId: string) => ToolAuthorizeResult;
  registerMcpServer: (
    input: RegisterMcpServerInput,
  ) => ReturnType<McpServerStore["registerMcpServer"]>;
}

/** Open Tool Freedom stores under `<dataDir>/tool-registry`. */
export function openToolFreedom(rootDir: string): ToolFreedomHandles {
  const registry = new ToolRegistryStore(rootDir);
  const assignments = new ToolAssignmentStore(rootDir);
  const mcp = new McpServerStore(rootDir);
  return {
    registry,
    assignments,
    mcp,
    rootDir,
    registerTool: (input) => registry.registerTool(input),
    listTools: () => registry.listTools(),
    assignToolsToAgent: (agentId, toolIds, notes) =>
      assignments.assignToolsToAgent(agentId, toolIds, notes),
    agentMayUseTool: (agentId, toolId) =>
      checkAgentMayUseTool(registry, assignments, {
        agent_id: agentId,
        tool_id: toolId,
      }),
    registerMcpServer: (input) =>
      mcp.registerMcpServer(input, { toolRegistry: registry }),
  };
}

export function toolRegistryDirFromDataRoot(dataRoot: string): string {
  return join(dataRoot, "tool-registry");
}

/** Convenience: registerTool against a store. */
export function registerTool(
  registry: ToolRegistryStore,
  input: RegisterToolInput | ToolRecord,
): ToolRecord {
  return registry.registerTool(input);
}

/** Convenience: listTools against a store. */
export function listTools(registry: ToolRegistryStore): ToolRecord[] {
  return registry.listTools();
}

/** Convenience: assignToolsToAgent against a store. */
export function assignToolsToAgent(
  assignments: ToolAssignmentStore,
  agentId: string,
  toolIds: string[],
  notes?: string[],
): ReturnType<ToolAssignmentStore["assignToolsToAgent"]> {
  return assignments.assignToolsToAgent(agentId, toolIds, notes);
}

/** Convenience: registerMcpServer against stores. */
export function registerMcpServer(
  mcp: McpServerStore,
  input: RegisterMcpServerInput,
  opts?: { toolRegistry?: ToolRegistryStore },
): ReturnType<McpServerStore["registerMcpServer"]> {
  return mcp.registerMcpServer(input, opts);
}
