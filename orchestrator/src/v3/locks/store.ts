/**
 * Filesystem work locks with monotonic fencing tokens.
 * Explicit non-claim: does not provide exactly-once execution across processes/crashes.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FencingCheckResult,
  LockAcquireResult,
  LockScope,
  WorkLock,
} from "./types.js";

const LIMITATIONS = [
  "Best-effort lock via atomic file replace — not a distributed consensus lock",
  "Does NOT provide exactly-once execution; duplicate work remains possible under crash races",
  "Expired locks may be stolen by a new holder with a higher fencing token",
  "Callers must check fencing_token before mutating shared resources",
];

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export interface LockFileSnapshot {
  kind: "WorkLockFile";
  work_id: string;
  next_fencing_token: number;
  locks: WorkLock[];
  updated_at: string;
  limitations: string[];
}

export class WorkLockStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.rootDir, `${workId}.json`);
  }

  load(workId: string): LockFileSnapshot {
    const path = this.pathFor(workId);
    if (!existsSync(path)) {
      return {
        kind: "WorkLockFile",
        work_id: workId,
        next_fencing_token: 1,
        locks: [],
        updated_at: nowIso(),
        limitations: [...LIMITATIONS],
      };
    }
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as LockFileSnapshot;
    if (parsed.kind !== "WorkLockFile") {
      throw new WorkLockError("INVALID", path);
    }
    return this.expireStale(parsed);
  }

  private save(snap: LockFileSnapshot): void {
    snap.updated_at = nowIso();
    snap.limitations = [...LIMITATIONS];
    atomicWrite(this.pathFor(snap.work_id), JSON.stringify(snap, null, 2));
  }

  private expireStale(snap: LockFileSnapshot, now = Date.now()): LockFileSnapshot {
    let changed = false;
    for (const lock of snap.locks) {
      if (lock.status === "held" && Date.parse(lock.expires_at) < now) {
        lock.status = "expired";
        changed = true;
      }
    }
    if (changed) this.save(snap);
    return snap;
  }

  private resourceMatch(lock: WorkLock, scope: LockScope, resourceKey?: string): boolean {
    if (lock.scope !== scope) return false;
    if (scope === "work") return true;
    return (lock.resource_key ?? "") === (resourceKey ?? "");
  }

  acquire(input: {
    work_id: string;
    holder_agent_id: string;
    scope?: LockScope;
    resource_key?: string;
    lease_ms?: number;
  }): LockAcquireResult {
    const scope = input.scope ?? "work";
    const leaseMs = input.lease_ms ?? 60_000;
    const snap = this.load(input.work_id);

    const held = snap.locks.find(
      (l) =>
        l.status === "held" &&
        this.resourceMatch(l, scope, input.resource_key) &&
        Date.parse(l.expires_at) >= Date.now(),
    );
    if (held && held.holder_agent_id !== input.holder_agent_id) {
      return {
        kind: "LockAcquireResult",
        status: "conflict",
        lock: held,
        reason: `held_by=${held.holder_agent_id} fencing=${held.fencing_token}`,
        limitations: [...LIMITATIONS],
      };
    }
    if (held && held.holder_agent_id === input.holder_agent_id) {
      // renew in place
      held.expires_at = new Date(Date.now() + leaseMs).toISOString();
      held.renewed_at = nowIso();
      this.save(snap);
      return {
        kind: "LockAcquireResult",
        status: "acquired",
        lock: held,
        limitations: [...LIMITATIONS],
      };
    }

    const token = snap.next_fencing_token;
    snap.next_fencing_token += 1;
    const lock: WorkLock = {
      kind: "WorkLock",
      lock_id: `lk-${randomUUID()}`,
      work_id: input.work_id,
      scope,
      resource_key: input.resource_key,
      holder_agent_id: input.holder_agent_id,
      fencing_token: token,
      acquired_at: nowIso(),
      expires_at: new Date(Date.now() + leaseMs).toISOString(),
      status: "held",
    };
    snap.locks.push(lock);
    this.save(snap);
    return {
      kind: "LockAcquireResult",
      status: "acquired",
      lock,
      limitations: [...LIMITATIONS],
    };
  }

  renew(workId: string, lockId: string, holderAgentId: string, leaseMs = 60_000): LockAcquireResult {
    const snap = this.load(workId);
    const lock = snap.locks.find((l) => l.lock_id === lockId);
    if (!lock) {
      return {
        kind: "LockAcquireResult",
        status: "denied",
        reason: "lock_not_found",
        limitations: [...LIMITATIONS],
      };
    }
    if (lock.holder_agent_id !== holderAgentId) {
      return {
        kind: "LockAcquireResult",
        status: "denied",
        reason: "holder_mismatch",
        lock,
        limitations: [...LIMITATIONS],
      };
    }
    if (lock.status !== "held" || Date.parse(lock.expires_at) < Date.now()) {
      lock.status = "expired";
      this.save(snap);
      return {
        kind: "LockAcquireResult",
        status: "denied",
        reason: "lock_expired",
        lock,
        limitations: [...LIMITATIONS],
      };
    }
    lock.expires_at = new Date(Date.now() + leaseMs).toISOString();
    lock.renewed_at = nowIso();
    this.save(snap);
    return {
      kind: "LockAcquireResult",
      status: "acquired",
      lock,
      limitations: [...LIMITATIONS],
    };
  }

  release(workId: string, lockId: string, holderAgentId: string): LockAcquireResult {
    const snap = this.load(workId);
    const lock = snap.locks.find((l) => l.lock_id === lockId);
    if (!lock) {
      return {
        kind: "LockAcquireResult",
        status: "denied",
        reason: "lock_not_found",
        limitations: [...LIMITATIONS],
      };
    }
    if (lock.holder_agent_id !== holderAgentId) {
      return {
        kind: "LockAcquireResult",
        status: "denied",
        reason: "holder_mismatch",
        lock,
        limitations: [...LIMITATIONS],
      };
    }
    lock.status = "released";
    lock.released_at = nowIso();
    this.save(snap);
    return {
      kind: "LockAcquireResult",
      status: "acquired",
      lock,
      reason: "released",
      limitations: [...LIMITATIONS],
    };
  }

  /**
   * Fencing: only the current held lock's token (or strictly greater issued token
   * matching holder) may mutate. Stale tokens are rejected.
   */
  checkFencing(
    workId: string,
    scope: LockScope,
    resourceKey: string | undefined,
    fencingToken: number,
    holderAgentId: string,
  ): FencingCheckResult {
    const snap = this.load(workId);
    const held = snap.locks.find(
      (l) =>
        l.status === "held" &&
        this.resourceMatch(l, scope, resourceKey) &&
        Date.parse(l.expires_at) >= Date.now(),
    );
    if (!held) {
      return { allowed: false, reason: "no_held_lock", provided_token: fencingToken };
    }
    if (held.holder_agent_id !== holderAgentId) {
      return {
        allowed: false,
        reason: "holder_mismatch",
        expected_token: held.fencing_token,
        provided_token: fencingToken,
      };
    }
    if (fencingToken !== held.fencing_token) {
      return {
        allowed: false,
        reason: "stale_fencing_token",
        expected_token: held.fencing_token,
        provided_token: fencingToken,
      };
    }
    return {
      allowed: true,
      reason: "fencing_ok",
      expected_token: held.fencing_token,
      provided_token: fencingToken,
    };
  }
}

export class WorkLockError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkLockError";
  }
}
