/**
 * V5-M04 — Deny-by-default tool authorization.
 * Primary API: agentMayUseTool. authorizeToolUse kept for M05 policy overlay.
 */

import type { ToolAssignmentStore, ToolRegistryStore } from "./store.js";
import type { ToolAuthorizeResult } from "./types.js";

export interface AgentMayUseToolInput {
  agent_id: string;
  tool_id: string;
  /**
   * Extra deny reasons from Human Governance policy (M05).
   * When non-empty, authorization fails even if assigned.
   */
  policy_deny_reasons?: string[];
}

/** Alias for M05 wire-up. */
export type AuthorizeToolInput = AgentMayUseToolInput;

/**
 * Deny-by-default: agent may use a tool only if registered, enabled, and assigned.
 */
export function agentMayUseTool(
  registry: ToolRegistryStore,
  assignments: ToolAssignmentStore,
  input: AgentMayUseToolInput,
): ToolAuthorizeResult {
  const checked_at = new Date().toISOString();
  const agent_id = input.agent_id.trim();
  const tool_id = input.tool_id.trim();

  if (!agent_id || !tool_id) {
    return {
      kind: "ToolAuthorizeResult",
      verdict: "deny",
      allowed: false,
      agent_id: agent_id || "(missing)",
      tool_id: tool_id || "(missing)",
      reason: "missing_agent_or_tool_id",
      checked_at,
    };
  }

  if (input.policy_deny_reasons && input.policy_deny_reasons.length > 0) {
    return {
      kind: "ToolAuthorizeResult",
      verdict: "deny",
      allowed: false,
      agent_id,
      tool_id,
      reason: `policy_denied:${input.policy_deny_reasons.join("|")}`,
      checked_at,
    };
  }

  let tool;
  try {
    tool = registry.get(tool_id);
  } catch {
    return {
      kind: "ToolAuthorizeResult",
      verdict: "deny",
      allowed: false,
      agent_id,
      tool_id,
      reason: "tool_not_registered",
      checked_at,
    };
  }

  if (!tool.enabled) {
    return {
      kind: "ToolAuthorizeResult",
      verdict: "deny",
      allowed: false,
      agent_id,
      tool_id,
      reason: "tool_disabled",
      checked_at,
    };
  }

  const assignment = assignments.get(agent_id);
  if (!assignment) {
    return {
      kind: "ToolAuthorizeResult",
      verdict: "deny",
      allowed: false,
      agent_id,
      tool_id,
      reason: "no_assignment_deny_default",
      checked_at,
    };
  }

  if (!assignment.tool_ids.includes(tool_id)) {
    return {
      kind: "ToolAuthorizeResult",
      verdict: "deny",
      allowed: false,
      agent_id,
      tool_id,
      reason: "tool_not_in_allowlist",
      checked_at,
    };
  }

  return {
    kind: "ToolAuthorizeResult",
    verdict: "allow",
    allowed: true,
    agent_id,
    tool_id,
    reason: "assigned_and_enabled",
    checked_at,
  };
}

/** M05-compatible alias of agentMayUseTool. */
export function authorizeToolUse(
  registry: ToolRegistryStore,
  assignments: ToolAssignmentStore,
  input: AuthorizeToolInput,
): ToolAuthorizeResult {
  return agentMayUseTool(registry, assignments, input);
}

export class ToolGovernanceError extends Error {
  constructor(
    readonly code: "DENIED",
    message: string,
    readonly result: ToolAuthorizeResult,
  ) {
    super(message);
    this.name = "ToolGovernanceError";
  }
}

export function assertToolAllowed(
  registry: ToolRegistryStore,
  assignments: ToolAssignmentStore,
  input: AuthorizeToolInput,
): ToolAuthorizeResult {
  const result = agentMayUseTool(registry, assignments, input);
  if (!result.allowed) {
    throw new ToolGovernanceError("DENIED", result.reason, result);
  }
  return result;
}
