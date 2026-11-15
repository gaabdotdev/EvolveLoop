/**
 * Durable fencing-epoch high-watermark (ADR-V4-0004, TM-V4-F13, freeze R7).
 *
 * Caller-supplied `WorkEvent.fencing.fencing_epoch` is NEVER authoritative.
 * The ledger looks up the lease via V37LeaseFencingPort and compares against
 * a monotonic watermark stored per *work_id* (a path-safe id). Lease ids are
 * not path components (R5).
 */

import { existsSync, readFileSync } from "node:fs";
import type { V37LeaseFencingPort } from "../contracts/adapters-v37.js";
import { DEFAULT_TENANT_ID, isRecord } from "../contracts/common.js";
import { atomicWriteFsync, ensureDir, resolveUnderRoot } from "./persistence.js";
import { requireId } from "./ids.js";

export interface FencingWatermark {
  work_id: string;
  tenant_id: typeof DEFAULT_TENANT_ID;
  epoch_hwm: number;
  updated_at: string;
}

export type FenceDecision =
  | { status: "ALLOW"; epoch: number }
  | { status: "SKIP" }
  | { status: "FENCED"; reason: string; head_seq: number };

export class FencingWatermarkStore {
  constructor(private readonly root: string) {
    ensureDir(resolveUnderRoot(this.root, "fencing"));
  }

  private pathFor(work_id: string): string {
    requireId("work", work_id);
    return resolveUnderRoot(this.root, "fencing", `${work_id}.json`);
  }

  get(work_id: string): FencingWatermark {
    const id = requireId("work", work_id);
    const p = this.pathFor(id);
    if (!existsSync(p)) {
      return { work_id: id, tenant_id: DEFAULT_TENANT_ID, epoch_hwm: 0, updated_at: "1970-01-01T00:00:00.000Z" };
    }
    const raw = JSON.parse(readFileSync(p, "utf8")) as unknown;
    if (!isRecord(raw) || typeof raw.epoch_hwm !== "number" || !Number.isInteger(raw.epoch_hwm) || raw.epoch_hwm < 0) {
      return { work_id: id, tenant_id: DEFAULT_TENANT_ID, epoch_hwm: 0, updated_at: "1970-01-01T00:00:00.000Z" };
    }
    return {
      work_id: id,
      tenant_id: DEFAULT_TENANT_ID,
      epoch_hwm: raw.epoch_hwm,
      updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "1970-01-01T00:00:00.000Z",
    };
  }

  /** Monotonic bump. Restore merges with max(). Never accepts a caller-supplied epoch. */
  bump(work_id: string, epoch: number, now: string): FencingWatermark {
    const current = this.get(work_id);
    const next: FencingWatermark = {
      work_id: current.work_id,
      tenant_id: DEFAULT_TENANT_ID,
      epoch_hwm: Math.max(current.epoch_hwm, epoch),
      updated_at: now,
    };
    atomicWriteFsync(this.pathFor(work_id), JSON.stringify(next));
    return next;
  }

  /** D19/F13: union of live and restored watermarks keeps the max epoch. */
  mergeFrom(other: FencingWatermarkStore, work_id: string, now: string): FencingWatermark {
    const live = this.get(work_id);
    const restored = other.get(work_id);
    return this.bump(work_id, Math.max(live.epoch_hwm, restored.epoch_hwm), now);
  }
}

export function decideFence(input: {
  fencing: { lease_id: string; fencing_epoch: number } | undefined;
  leases: V37LeaseFencingPort | undefined;
  watermark: FencingWatermark;
  head_seq: number;
}): FenceDecision {
  if (!input.fencing) return { status: "SKIP" };
  if (!input.leases) {
    return { status: "FENCED", reason: "fencing_port_unavailable", head_seq: input.head_seq };
  }
  // R7: do not use input.fencing.fencing_epoch as authority.
  const lease = input.leases.get(input.fencing.lease_id);
  if (!lease) {
    return { status: "FENCED", reason: "lease_not_found", head_seq: input.head_seq };
  }
  if (lease.status !== "active") {
    return { status: "FENCED", reason: `lease_${lease.status}`, head_seq: input.head_seq };
  }
  const authoritative = lease.fencing_epoch;
  if (input.fencing.fencing_epoch !== authoritative) {
    return { status: "FENCED", reason: "caller_epoch_rejected", head_seq: input.head_seq };
  }
  if (authoritative < input.watermark.epoch_hwm) {
    return { status: "FENCED", reason: "stale_epoch", head_seq: input.head_seq };
  }
  return { status: "ALLOW", epoch: authoritative };
}
