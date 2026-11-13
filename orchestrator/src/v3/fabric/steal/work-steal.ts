/**
 * Work stealing for eligible portable tasks only.
 */

import type { LeaseManager } from "../leases/lease-manager.js";
import type { DistributedLease } from "../types.js";

export type StealEligibility =
  | "READY"
  | "queued"
  | "paused"
  | "checkpointed"
  | "quiesced";

export interface StealCandidate {
  task_id: string;
  eligibility: StealEligibility;
  artifacts_intact: boolean;
  dependencies_available: boolean;
  owner_lease_id?: string;
  portable: boolean;
}

export interface StealResult {
  ok: boolean;
  reason?: string;
  new_lease?: DistributedLease;
  fencing_epoch?: number;
}

export class WorkStealer {
  constructor(private readonly leases: LeaseManager) {}

  isEligible(c: StealCandidate): { ok: true } | { ok: false; reason: string } {
    if (!c.portable) return { ok: false, reason: "not_portable" };
    if (!["READY", "queued", "paused", "checkpointed", "quiesced"].includes(c.eligibility)) {
      return { ok: false, reason: "not_eligible_state" };
    }
    if (!c.artifacts_intact) return { ok: false, reason: "artifacts" };
    if (!c.dependencies_available) return { ok: false, reason: "dependencies" };
    return { ok: true };
  }

  /**
   * Does not move active running tasks merely due to timeout.
   */
  steal(input: {
    candidate: StealCandidate;
    new_owner_worker_node_id: string;
    ttl_ms: number;
    estimate_roi: number;
    min_roi?: number;
  }): StealResult {
    const el = this.isEligible(input.candidate);
    if (!el.ok) return { ok: false, reason: el.reason };
    if (input.estimate_roi < (input.min_roi ?? 0)) return { ok: false, reason: "roi_too_low" };

    if (input.candidate.owner_lease_id) {
      const old = this.leases.get(input.candidate.owner_lease_id);
      if (old && old.status === "active") {
        this.leases.revoke(old.lease_id);
      }
    }

    const lease = this.leases.issue({
      resource_key: `task:${input.candidate.task_id}`,
      task_id: input.candidate.task_id,
      owner_worker_node_id: input.new_owner_worker_node_id,
      ttl_ms: input.ttl_ms,
      allowed_operations: ["execute", "publish_artifact", "submit_result"],
    });
    return { ok: true, new_lease: lease, fencing_epoch: lease.fencing_epoch };
  }
}
