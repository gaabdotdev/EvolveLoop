/**
 * M15 F02 / RR-W5-01 remainder: V3 daemon IPC `approvals.approve|reject`
 * must not treat `params.actor` (default `"cli"`) as authoritative identity.
 *
 * Under V4 posture (`V4_CLI_STORE_FALLBACK === false`):
 *   - caller-asserted `actor` / `decided_by` / `approver` / `approver_id` are refused
 *   - omitting `actor` is also refused (the daemon would have defaulted to `"cli"`)
 *   - success path is operator_token via V37PolicyAdapter (M10 authn) — not V3 ApprovalStore
 *
 * Frozen PolicyDecision 1.0.0 is not thawed with `decided_by` (R4).
 * The V3 daemon process is not deleted; only the actor-as-identity write is gated.
 */

import {
  v4CliStoreFallbackAllowed,
  type V4ApproveInput,
  type V37PolicyAdapter,
} from "../adapters/v37/policy.js";
import { requestAssertsCallerIdentity } from "../policy/authn.js";
import type { ApprovalDecisionResult } from "../policy/types.js";

export const F02_DAEMON_ACTOR_REFUSED = "F02_DAEMON_ACTOR_REFUSED" as const;

export type DaemonApprovalOp = "approve" | "reject";

/** Structural port so the daemon need not construct a V4 PDP. */
export type DaemonV4ApprovalPort = Pick<V37PolicyAdapter, "approve" | "reject">;

export function refuseDaemonCallerAssertedActor(
  op: DaemonApprovalOp,
  detail = 'params.actor (default "cli") is not a credential',
): never {
  throw new Error(
    `${F02_DAEMON_ACTOR_REFUSED}: F02: V4 posture refuses daemon approvals.${op} with caller-asserted actor — ${detail}`,
  );
}

function operatorTokenFrom(params: Record<string, unknown>): string {
  const raw = params.operator_token;
  return typeof raw === "string" ? raw : "";
}

function v4ApproveInputFrom(params: Record<string, unknown>): V4ApproveInput {
  const note = params.note;
  return {
    approval_id: String(params.approval_id ?? ""),
    operator_token: operatorTokenFrom(params),
    ...(typeof note === "string" ? { note } : {}),
  };
}

/**
 * Gate used by V3 daemon `approvals.approve|reject`.
 * When V4 posture refuses the actor write, `write` is never invoked.
 * Token-only payloads are routed to `adapter` when provided; otherwise fail closed.
 */
export function applyDaemonApprovalActorWrite<T>(
  op: DaemonApprovalOp,
  params: Record<string, unknown> | undefined,
  write: (actor: string) => T,
  adapter?: DaemonV4ApprovalPort,
): T | ApprovalDecisionResult {
  const p = params ?? {};

  if (v4CliStoreFallbackAllowed()) {
    return write(String(p.actor ?? "cli"));
  }

  if (requestAssertsCallerIdentity(p)) {
    refuseDaemonCallerAssertedActor(op, "caller-asserted identity is not a credential");
  }

  const token = operatorTokenFrom(p);
  if (token && adapter) {
    const input = v4ApproveInputFrom(p);
    return op === "approve" ? adapter.approve(input) : adapter.reject(input);
  }

  refuseDaemonCallerAssertedActor(
    op,
    token
      ? "operator_token must be consumed by V37PolicyAdapter, not V3 ApprovalStore"
      : 'use operator token via V37PolicyAdapter, not params.actor (default "cli")',
  );
}
