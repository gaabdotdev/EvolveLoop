/**
 * V4 approvals adapter over the M10 PDP (OWNERSHIP-MAP: adapters/v37/policy.ts).
 *
 * F02: the V3 CLI path (`v35-commands.ts` → ipc fail → `store.approve(id, actor)`)
 * is **not** wired. This adapter:
 *   - does not accept `actor` / `decided_by` from the caller
 *   - does not fall back to V3 ApprovalStore writes
 *   - requires an operator token verified by OperatorAuthnPort
 *
 * V37ApprovalRecord is not treated as a V4 grant (freeze R8).
 */

import type { PolicyDecision, PolicyDecisionRequest } from "../../contracts/index.js";
import type { OperatorAuthnPort } from "../../policy/authn.js";
import { requestAssertsCallerIdentity } from "../../policy/authn.js";
import type { DenyByDefaultPolicyEngine } from "../../policy/engine.js";
import type { ApprovalDecisionResult } from "../../policy/types.js";

/** Compile-time + runtime marker: the V3 CLI store-write fallback is absent. */
export const V4_CLI_STORE_FALLBACK = false as const;

export interface V4ApproveInput {
  approval_id: string;
  operator_token: string;
  note?: string;
}

export class V37PolicyAdapter {
  constructor(
    private readonly engine: DenyByDefaultPolicyEngine,
    private readonly authn: OperatorAuthnPort,
  ) {}

  decide(request: PolicyDecisionRequest): Promise<PolicyDecision> {
    return this.engine.decide(request);
  }

  /**
   * Human approval. Token is the only credential. Extra `actor` on a widened
   * payload is rejected, not honoured.
   */
  approve(input: V4ApproveInput): ApprovalDecisionResult {
    if (requestAssertsCallerIdentity(input)) {
      return { ok: false, reason: "CALLER_ASSERTED_IDENTITY_REJECTED" };
    }
    const principal = this.authn.verify(input.operator_token);
    if (!principal) return { ok: false, reason: "AUTH_REQUIRED" };
    return this.engine.resolveApproval(input.approval_id, principal, "APPROVED", input.note);
  }

  reject(input: V4ApproveInput): ApprovalDecisionResult {
    if (requestAssertsCallerIdentity(input)) {
      return { ok: false, reason: "CALLER_ASSERTED_IDENTITY_REJECTED" };
    }
    const principal = this.authn.verify(input.operator_token);
    if (!principal) return { ok: false, reason: "AUTH_REQUIRED" };
    return this.engine.resolveApproval(input.approval_id, principal, "REJECTED", input.note);
  }
}

/**
 * The V3 fallback (`store.approve(id, actor)`) is a product bug under the V4
 * adversary model. This function exists so tests can lock the invariant: it
 * always throws, and there is no overload that writes the V3 store.
 */
export function v3StoreApproveFallbackForbidden(_approvalId: string, _actor: string): never {
  throw new Error("F02: V4 path must not fall back to ApprovalStore.approve(actor)");
}
