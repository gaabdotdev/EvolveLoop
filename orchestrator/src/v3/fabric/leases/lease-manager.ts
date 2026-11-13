/**
 * Control-Plane authoritative distributed leases + fencing epochs.
 * Local JSONL locks are NOT a substitute.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, nowIso } from "../../ops/atomic.js";
import type { FabricDataPaths } from "../paths.js";
import type { DistributedLease } from "../types.js";

export class LeaseManager {
  constructor(private readonly paths: FabricDataPaths) {}

  private path(id: string): string {
    return join(this.paths.leasesDir, `${id}.json`);
  }

  get(leaseId: string): DistributedLease | undefined {
    const p = this.path(leaseId);
    if (!existsSync(p)) return undefined;
    return JSON.parse(readFileSync(p, "utf8")) as DistributedLease;
  }

  list(): DistributedLease[] {
    return readdirSync(this.paths.leasesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.paths.leasesDir, f), "utf8")) as DistributedLease);
  }

  issue(input: {
    resource_key: string;
    task_id?: string;
    owner_worker_node_id: string;
    owner_agent_id?: string;
    ttl_ms: number;
    allowed_operations: string[];
    budget?: Record<string, number>;
    fencing_epoch?: number;
  }): DistributedLease {
    // Prevent double booking of same resource by active lease
    for (const l of this.list()) {
      if (
        l.resource_key === input.resource_key &&
        l.status === "active" &&
        Date.parse(l.expires_at) > Date.now()
      ) {
        throw new Error(`double_booking:${l.lease_id}`);
      }
    }
    const prevEpoch = Math.max(
      0,
      ...this.list()
        .filter((l) => l.resource_key === input.resource_key)
        .map((l) => l.fencing_epoch),
    );
    const lease: DistributedLease = {
      kind: "DistributedLease",
      lease_id: `lease_${randomUUID()}`,
      resource_key: input.resource_key,
      task_id: input.task_id,
      owner_worker_node_id: input.owner_worker_node_id,
      owner_agent_id: input.owner_agent_id,
      fencing_epoch: input.fencing_epoch ?? prevEpoch + 1,
      issued_at: nowIso(),
      expires_at: new Date(Date.now() + input.ttl_ms).toISOString(),
      allowed_operations: input.allowed_operations,
      budget: input.budget,
      renew_policy: { max_renewals: 30, renewals_used: 0, min_renew_interval_ms: 1000 },
      status: "active",
    };
    atomicWriteJson(this.path(lease.lease_id), lease);
    return lease;
  }

  renew(leaseId: string, workerNodeId: string, ttlMs: number): DistributedLease {
    const lease = this.get(leaseId);
    if (!lease) throw new Error("lease_not_found");
    if (lease.status !== "active") throw new Error(`lease_not_active:${lease.status}`);
    if (lease.owner_worker_node_id !== workerNodeId) throw new Error("lease_owner_mismatch");
    if (Date.parse(lease.expires_at) <= Date.now()) {
      lease.status = "expired";
      atomicWriteJson(this.path(leaseId), lease);
      throw new Error("lease_expired");
    }
    if (lease.renew_policy.renewals_used >= lease.renew_policy.max_renewals) {
      throw new Error("renew_limit");
    }
    lease.renew_policy.renewals_used += 1;
    lease.expires_at = new Date(Date.now() + ttlMs).toISOString();
    atomicWriteJson(this.path(leaseId), lease);
    return lease;
  }

  revoke(leaseId: string): DistributedLease {
    const lease = this.get(leaseId);
    if (!lease) throw new Error("lease_not_found");
    lease.status = "revoked";
    atomicWriteJson(this.path(leaseId), lease);
    return lease;
  }

  release(leaseId: string, workerNodeId: string): DistributedLease {
    const lease = this.get(leaseId);
    if (!lease) throw new Error("lease_not_found");
    if (lease.owner_worker_node_id !== workerNodeId) throw new Error("lease_owner_mismatch");
    lease.status = "released";
    atomicWriteJson(this.path(leaseId), lease);
    return lease;
  }

  /**
   * Enforce fencing at commit/effect boundary.
   * Lease expiry alone does NOT prove process death.
   */
  assertFencing(input: {
    lease_id: string;
    worker_node_id: string;
    fencing_epoch: number;
    operation: string;
    nowMs?: number;
  }): { allowed: true; lease: DistributedLease } | { allowed: false; reason: string } {
    const lease = this.get(input.lease_id);
    if (!lease) return { allowed: false, reason: "lease_not_found" };
    if (lease.status === "revoked") return { allowed: false, reason: "lease_revoked" };
    if (lease.status === "released") return { allowed: false, reason: "lease_released" };
    const now = input.nowMs ?? Date.now();
    if (lease.status === "expired" || Date.parse(lease.expires_at) <= now) {
      if (lease.status === "active") {
        lease.status = "expired";
        atomicWriteJson(this.path(lease.lease_id), lease);
      }
      return { allowed: false, reason: "lease_expired" };
    }
    if (lease.owner_worker_node_id !== input.worker_node_id) {
      return { allowed: false, reason: "owner_mismatch" };
    }
    if (input.fencing_epoch !== lease.fencing_epoch) {
      return { allowed: false, reason: "stale_fencing" };
    }
    if (!lease.allowed_operations.includes(input.operation) && !lease.allowed_operations.includes("*")) {
      return { allowed: false, reason: "operation_denied" };
    }
    return { allowed: true, lease };
  }

  /** Expire due leases (reconciliation tick). Does not claim process death. */
  reconcileExpired(nowMs = Date.now()): DistributedLease[] {
    const out: DistributedLease[] = [];
    for (const lease of this.list()) {
      if (lease.status === "active" && Date.parse(lease.expires_at) <= nowMs) {
        lease.status = "expired";
        atomicWriteJson(this.path(lease.lease_id), lease);
        out.push(lease);
      }
    }
    return out;
  }
}
