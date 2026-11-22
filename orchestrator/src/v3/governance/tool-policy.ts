/**
 * V5-M05 — Wire policy deny → Tool Freedom authorize (M04).
 */

import {
  authorizeToolUse,
  type AuthorizeToolInput,
  type ToolAssignmentStore,
  type ToolAuthorizeResult,
  type ToolRegistryStore,
} from "../tool-registry/index.js";
import type { AuditLog } from "./audit-log.js";
import type { BudgetGuard } from "./budget-guard.js";
import type { PolicyStore } from "./policy-store.js";

export interface GovernedToolAuthorizeInput {
  agent_id: string;
  tool_id: string;
  work_id?: string;
  attempt_id?: string;
}

/**
 * Authorize tool use under Human Governance:
 * 1. checkPolicy(tool_use) — deny_tool_ids
 * 2. Fail-closed budget check when work-scoped budget exists
 * 3. Delegate to M04 authorizeToolUse with policy_deny_reasons
 */
export function authorizeToolUnderPolicy(
  policy: PolicyStore,
  registry: ToolRegistryStore,
  assignments: ToolAssignmentStore,
  input: GovernedToolAuthorizeInput,
  opts?: {
    budget?: BudgetGuard;
    audit?: AuditLog;
  },
): ToolAuthorizeResult {
  const check = policy.checkPolicy({
    type: "tool_use",
    tool_id: input.tool_id,
    work_id: input.work_id,
    agent_id: input.agent_id,
    attempt_id: input.attempt_id,
  });
  const policyDeny: string[] = [];

  if (!check.allowed) {
    const denyBits = check.reasons.filter((r) => r.startsWith("deny_tool_ids:"));
    policyDeny.push(...(denyBits.length ? denyBits : ["policy_denied"]));
  }

  if (opts?.budget && input.work_id) {
    const budgetCheck = opts.budget.check({
      scope: "work",
      work_id: input.work_id,
      agent_id: input.agent_id,
    });
    if (budgetCheck.fail_closed_block) {
      policyDeny.push(`budget:${budgetCheck.reasons.join("|")}`);
      opts.audit?.append({
        work_id: input.work_id,
        attempt_id: input.attempt_id,
        agent_id: input.agent_id,
        audit_kind: "budget_exceeded",
        message: `tool blocked by budget: ${input.tool_id}`,
        payload: { reasons: budgetCheck.reasons },
      });
    }
  }

  const authInput: AuthorizeToolInput = {
    agent_id: input.agent_id,
    tool_id: input.tool_id,
    policy_deny_reasons: policyDeny.length ? policyDeny : undefined,
  };

  const result = authorizeToolUse(registry, assignments, authInput);

  if (result.verdict === "deny" && policyDeny.length > 0) {
    opts?.audit?.append({
      work_id: input.work_id,
      attempt_id: input.attempt_id,
      agent_id: input.agent_id,
      audit_kind: "policy_deny_tool",
      message: result.reason,
      payload: { tool_id: input.tool_id, policyDeny },
    });
  } else {
    opts?.audit?.append({
      work_id: input.work_id,
      attempt_id: input.attempt_id,
      agent_id: input.agent_id,
      audit_kind: "tool_authorize",
      message: `${result.verdict}:${result.reason}`,
      payload: { tool_id: input.tool_id },
    });
  }

  return result;
}
