/**
 * Approval records with authenticated principals only (F02).
 * There is no `actor: string` parameter and no store-write fallback.
 */

import type { IsoTimestamp } from "../contracts/index.js";
import { newApprovalId } from "./ids.js";
import type { Approval, ApprovalDecisionResult, AuthenticatedPrincipal, Clock } from "./types.js";
import { SYSTEM_CLOCK } from "./types.js";

export interface CreateApprovalInput {
  work_id: string;
  task_id?: string;
  subject_executor_id: string;
  action: string;
  resource: string;
  environment: string;
  risk: Approval["risk"];
  policy_id: string;
  policy_version: number;
  policy_epoch: number;
  decision_id: string;
  expires_at: IsoTimestamp;
}

function isExecutorShaped(id: string): boolean {
  return id.startsWith("executor_");
}

export function rejectSelfApproval(
  principal: AuthenticatedPrincipal,
  subject_executor_id: string,
): ApprovalDecisionResult | undefined {
  if (principal.kind !== "HUMAN") {
    return { ok: false, reason: "EXECUTOR_PRINCIPAL_DENIED" };
  }
  if (isExecutorShaped(principal.id) || principal.id === subject_executor_id) {
    return { ok: false, reason: "SELF_APPROVAL_DENIED" };
  }
  return undefined;
}

export class ApprovalRegistry {
  private readonly approvals = new Map<string, Approval>();

  constructor(private readonly clock: Clock = SYSTEM_CLOCK) {}

  create(input: CreateApprovalInput): Approval {
    const rec: Approval = {
      approval_id: newApprovalId(),
      work_id: input.work_id,
      task_id: input.task_id,
      subject_executor_id: input.subject_executor_id,
      action: input.action,
      resource: input.resource,
      environment: input.environment,
      risk: input.risk,
      policy_id: input.policy_id,
      policy_version: input.policy_version,
      policy_epoch: input.policy_epoch,
      decision_id: input.decision_id,
      state: "PENDING",
      expires_at: input.expires_at,
      created_at: this.clock.now().toISOString(),
    };
    this.approvals.set(rec.approval_id, rec);
    return rec;
  }

  get(approval_id: string): Approval | undefined {
    const rec = this.approvals.get(approval_id);
    if (!rec) return undefined;
    this.expireIfNeeded(rec);
    return rec;
  }

  pendingForDecision(decision_id: string): Approval | undefined {
    for (const rec of this.approvals.values()) {
      this.expireIfNeeded(rec);
      if (rec.decision_id === decision_id && rec.state === "PENDING") return rec;
    }
    return undefined;
  }

  list(filter?: { work_id?: string; state?: Approval["state"] }): Approval[] {
    const out: Approval[] = [];
    for (const rec of this.approvals.values()) {
      this.expireIfNeeded(rec);
      if (filter?.work_id && rec.work_id !== filter.work_id) continue;
      if (filter?.state && rec.state !== filter.state) continue;
      out.push(rec);
    }
    return out;
  }

  decide(
    approval_id: string,
    principal: AuthenticatedPrincipal,
    to: "APPROVED" | "REJECTED",
    note?: string,
  ): ApprovalDecisionResult {
    const rec = this.approvals.get(approval_id);
    if (!rec) return { ok: false, reason: "NOT_FOUND" };
    this.expireIfNeeded(rec);
    if (rec.state === "EXPIRED") return { ok: false, reason: "EXPIRED" };
    if (rec.state !== "PENDING") return { ok: false, reason: "NOT_PENDING" };
    const blocked = rejectSelfApproval(principal, rec.subject_executor_id);
    if (blocked) return blocked;
    rec.state = to;
    rec.decided_at = this.clock.now().toISOString();
    rec.decided_by = { kind: principal.kind, id: principal.id };
    rec.note = note;
    return { ok: true, approval: rec };
  }

  attachGrant(approval_id: string, grant_id: string): void {
    const rec = this.approvals.get(approval_id);
    if (rec) rec.grant_id = grant_id;
  }

  private expireIfNeeded(rec: Approval): void {
    if (rec.state === "PENDING" && Date.parse(rec.expires_at) <= this.clock.now().getTime()) {
      rec.state = "EXPIRED";
    }
  }
}
