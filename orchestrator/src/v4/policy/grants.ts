/**
 * Grant lifecycle (F03 expiry/revoke, F04 atomic consume). In-memory single-writer.
 * Not V37ApprovalRecord (R8). Ids are never used as filesystem path components (R5).
 */

import type { IsoTimestamp } from "../contracts/index.js";
import { newGrantId } from "./ids.js";
import type { Clock, ConsumeResult, Grant } from "./types.js";
import { SYSTEM_CLOCK } from "./types.js";

export interface IssueGrantInput {
  work_id: string;
  subject_executor_id: string;
  action: string;
  resource: string;
  policy_id: string;
  policy_version: number;
  policy_epoch: number;
  approval_id: string;
  max_uses: number;
  expires_at: IsoTimestamp;
}

export class GrantRegistry {
  private readonly grants = new Map<string, Grant>();
  private readonly inFlight = new Set<string>();

  constructor(private readonly clock: Clock = SYSTEM_CLOCK) {}

  issue(input: IssueGrantInput): Grant {
    const now = this.clock.now().toISOString();
    const grant: Grant = {
      grant_id: newGrantId(),
      work_id: input.work_id,
      subject_executor_id: input.subject_executor_id,
      action: input.action,
      resource: input.resource,
      policy_id: input.policy_id,
      policy_version: input.policy_version,
      policy_epoch: input.policy_epoch,
      approval_id: input.approval_id,
      state: "ACTIVE",
      uses_remaining: input.max_uses,
      max_uses: input.max_uses,
      expires_at: input.expires_at,
      created_at: now,
      consumed_effect_ids: [],
    };
    this.grants.set(grant.grant_id, grant);
    return grant;
  }

  get(grant_id: string): Grant | undefined {
    const g = this.grants.get(grant_id);
    if (!g) return undefined;
    this.expireIfNeeded(g);
    return g;
  }

  revoke(grant_id: string): Grant | undefined {
    const g = this.grants.get(grant_id);
    if (!g) return undefined;
    this.expireIfNeeded(g);
    if (g.state !== "ACTIVE") return g;
    g.state = "REVOKED";
    g.revoked_at = this.clock.now().toISOString();
    return g;
  }

  /**
   * Atomic consume: one in-flight claim per grant_id. Links the use to exactly
   * one effect_id. Re-checks expiry, revoke, and policy epoch at use time (F03/D14).
   */
  consume(input: {
    grant_id: string;
    effect_id: string;
    work_id: string;
    action: string;
    resource: string;
    current_epoch: number;
  }): ConsumeResult {
    if (this.inFlight.has(input.grant_id)) return { ok: false, reason: "in_flight" };
    this.inFlight.add(input.grant_id);
    try {
      const g = this.grants.get(input.grant_id);
      if (!g) return { ok: false, reason: "not_found" };
      this.expireIfNeeded(g);
      if (g.state === "REVOKED") return { ok: false, reason: "revoked" };
      if (g.state === "EXPIRED") return { ok: false, reason: "expired" };
      if (g.state === "CONSUMED") return { ok: false, reason: "consumed" };
      if (g.state !== "ACTIVE") return { ok: false, reason: "consumed" };
      if (g.policy_epoch !== input.current_epoch) return { ok: false, reason: "stale_epoch" };
      if (g.work_id !== input.work_id) return { ok: false, reason: "work_mismatch" };
      if (g.action !== input.action) return { ok: false, reason: "action_mismatch" };
      if (g.resource !== input.resource) return { ok: false, reason: "resource_mismatch" };
      if (g.uses_remaining <= 0) return { ok: false, reason: "uses_exhausted" };
      g.uses_remaining -= 1;
      g.consumed_effect_ids.push(input.effect_id);
      if (g.uses_remaining === 0) g.state = "CONSUMED";
      return { ok: true, grant: { ...g, consumed_effect_ids: [...g.consumed_effect_ids] } };
    } finally {
      this.inFlight.delete(input.grant_id);
    }
  }

  private expireIfNeeded(g: Grant): void {
    if (g.state !== "ACTIVE") return;
    if (Date.parse(g.expires_at) <= this.clock.now().getTime()) {
      g.state = "EXPIRED";
    }
  }
}
