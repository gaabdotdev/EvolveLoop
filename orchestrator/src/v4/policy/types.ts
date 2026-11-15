/**
 * M10-local types. Not catalog kinds (freeze R8): Grant/Approval live here,
 * never as V37ApprovalRecord and never as CONTRACT_CATALOG entries.
 */

import type { ActorRef, AutonomyLevel, IsoTimestamp, PolicyDecision, PolicyEffect, RiskLevel } from "../contracts/index.js";

/** Approver must be HUMAN (or the PDP itself). Never EXECUTOR (ADR-V4-0016). */
export type ApproverKind = "HUMAN" | "POLICY_ENGINE";

/**
 * Principal established by Control Plane authentication — never by a request
 * field (TM-V4-F02). `id` is not an executor id.
 */
export interface AuthenticatedPrincipal {
  kind: ApproverKind;
  id: string;
  authn: {
    method: "operator-token" | "policy-engine";
    /** Opaque token identifier (hash), not the secret. */
    credential_ref: string;
  };
}

/** R4 minor: authenticated author of a PolicyDecision. Frozen 1.0.0 type has decided_at only. */
export interface AuditedPolicyDecision extends PolicyDecision {
  decided_by: ActorRef;
}

export function principalToActor(principal: AuthenticatedPrincipal): ActorRef {
  return { kind: principal.kind, id: principal.id };
}

export function readDecidedBy(decision: PolicyDecision): ActorRef | undefined {
  const extra = decision as PolicyDecision & { decided_by?: unknown };
  const v = extra.decided_by;
  if (!v || typeof v !== "object") return undefined;
  const rec = v as { kind?: unknown; id?: unknown };
  if (typeof rec.kind !== "string" || typeof rec.id !== "string") return undefined;
  return { kind: rec.kind as ActorRef["kind"], id: rec.id };
}

export type GrantState = "ACTIVE" | "CONSUMED" | "EXPIRED" | "REVOKED";

export type ApprovalState = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED";

/**
 * V4 grant — not V37ApprovalRecord (R8). Validity is enforced at consume time
 * (F03). Consumption is CAS/single-writer (F04).
 */
export interface Grant {
  grant_id: string;
  work_id: string;
  subject_executor_id: string;
  action: string;
  resource: string;
  policy_id: string;
  policy_version: number;
  policy_epoch: number;
  approval_id: string;
  state: GrantState;
  uses_remaining: number;
  max_uses: number;
  expires_at: IsoTimestamp;
  created_at: IsoTimestamp;
  revoked_at?: IsoTimestamp;
  consumed_effect_ids: string[];
}

export interface Approval {
  approval_id: string;
  work_id: string;
  task_id?: string;
  subject_executor_id: string;
  action: string;
  resource: string;
  environment: string;
  risk: RiskLevel;
  policy_id: string;
  policy_version: number;
  policy_epoch: number;
  decision_id: string;
  state: ApprovalState;
  expires_at: IsoTimestamp;
  created_at: IsoTimestamp;
  decided_at?: IsoTimestamp;
  /** Derived from AuthenticatedPrincipal — never from a caller `actor` string. */
  decided_by?: ActorRef;
  grant_id?: string;
  note?: string;
}

export interface WorkPolicyContext {
  work_id: string;
  /** Work-scoped autonomy vocabulary; not a global agent permission (§4.10, §9.1). */
  autonomy: AutonomyLevel;
  executor_labels: string[];
}

export interface Clock {
  now(): Date;
}

export const SYSTEM_CLOCK: Clock = { now: () => new Date() };

export type ConsumeFailureReason =
  | "not_found"
  | "expired"
  | "revoked"
  | "consumed"
  | "stale_epoch"
  | "action_mismatch"
  | "resource_mismatch"
  | "work_mismatch"
  | "in_flight"
  | "uses_exhausted";

export type ConsumeResult =
  | { ok: true; grant: Grant }
  | { ok: false; reason: ConsumeFailureReason };

export type ApprovalDecisionResult =
  | { ok: true; approval: Approval; grant?: Grant }
  | {
      ok: false;
      reason:
        | "AUTH_REQUIRED"
        | "SELF_APPROVAL_DENIED"
        | "EXECUTOR_PRINCIPAL_DENIED"
        | "NOT_FOUND"
        | "NOT_PENDING"
        | "EXPIRED"
        | "CALLER_ASSERTED_IDENTITY_REJECTED";
    };

export interface PolicyEventSink {
  emit(
    type: "policy.decided" | "policy.changed" | "approval.requested" | "approval.decided" | "grant.revoked",
    payload: Record<string, unknown>,
  ): void;
}

export const WRITE_ACTIONS: readonly string[] = [
  "filesystem.write",
  "filesystem.delete",
  "shell.execute",
  "process.spawn",
  "network.egress",
  "package.install",
  "mcp.invoke",
  "secrets.inject",
  "git.mutate",
  "deploy.publish",
  "workspace.outside",
  "sandbox.disable",
];

export const SENSITIVE_ACTIONS: readonly string[] = [
  "filesystem.delete",
  "secrets.inject",
  "git.mutate",
  "deploy.publish",
  "workspace.outside",
  "sandbox.disable",
  "network.egress",
  "package.install",
];

export const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  L0_OBSERVE: 0,
  L1_EXECUTE: 1,
  L2_SUPERVISED: 2,
  L3_AUTONOMOUS: 3,
};

export function isWriteAction(action: string): boolean {
  return (WRITE_ACTIONS as readonly string[]).includes(action);
}

export function isSensitiveAction(action: string, risk: RiskLevel): boolean {
  return (SENSITIVE_ACTIONS as readonly string[]).includes(action) || RISK_RANK[risk] >= RISK_RANK.high;
}

export function minAutonomy(a: AutonomyLevel, b: AutonomyLevel): AutonomyLevel {
  return AUTONOMY_RANK[a] <= AUTONOMY_RANK[b] ? a : b;
}

export function effectAllowsDispatch(effect: PolicyEffect): boolean {
  return effect === "ALLOW";
}
