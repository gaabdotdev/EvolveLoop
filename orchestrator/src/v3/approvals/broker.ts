/**
 * ApprovalBroker — creates requests when policy says require_approval,
 * and gates sensitive operations until a matching grant is consumed.
 */

import type { CapabilityAction, SandboxProfile } from "../security/types.js";
import { evaluateCapability } from "../security/enforcer.js";
import { ApprovalStore } from "./store.js";
import type { ApprovalRequest } from "./types.js";

export class ApprovalBroker {
  constructor(readonly store: ApprovalStore) {}

  evaluateAndMaybeRequest(
    profile: SandboxProfile,
    action: CapabilityAction,
    opts: {
      work_id: string;
      resource: string;
      justification: string;
      task_id?: string;
      agent_id?: string;
      goal_id?: string;
      test_provider?: boolean;
    },
  ):
    | { status: "allow" }
    | { status: "deny"; reason: string }
    | { status: "pending_approval"; approval: ApprovalRequest } {
    const decision = evaluateCapability(profile, action, {
      resource: opts.resource,
      targetPath: opts.resource,
    });
    if (decision.decision === "allow") return { status: "allow" };
    if (decision.decision === "deny") return { status: "deny", reason: decision.reason };
    const approval = this.store.create({
      work_id: opts.work_id,
      goal_id: opts.goal_id,
      task_id: opts.task_id,
      agent_id: opts.agent_id,
      operation: action,
      resource: opts.resource,
      justification: opts.justification,
      permissions_requested: [action],
      scope: { workspace: profile.filesystem.workspace_rw, max_uses: 1 },
      test_provider: opts.test_provider,
    });
    return { status: "pending_approval", approval };
  }

  authorize(
    approvalId: string,
    operation: string,
    resource: string,
  ): { ok: true; approval: ApprovalRequest } | { ok: false; reason: string } {
    return this.store.consume(approvalId, operation, resource);
  }
}
