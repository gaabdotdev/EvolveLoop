/**
 * Singleton/leader lock per data-dir using exclusive file open + PID/starttime fencing.
 */

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import { identifyProcess, sameProcess, type SupervisedProcessIdentity } from "../sandbox/process-supervisor.js";

export interface LeaderLockPayload {
  kind: "CoordinatorLeaderLock";
  pid: number;
  starttime: string;
  generation: number;
  acquired_at: string;
  fencing_token: string;
}

export class LeaderLock {
  private fd: number | null = null;
  private payload: LeaderLockPayload | null = null;

  constructor(private readonly lockPath: string) {}

  tryAcquire(generation: number): LeaderLockPayload | null {
    mkdirSync(dirname(this.lockPath), { recursive: true });
    if (existsSync(this.lockPath)) {
      try {
        const existing = JSON.parse(readFileSync(this.lockPath, "utf-8")) as LeaderLockPayload;
        const id: SupervisedProcessIdentity = {
          pid: existing.pid,
          pgid: existing.pid,
          starttime: existing.starttime,
          cmdline: "",
        };
        if (sameProcess(id)) {
          return null; // live leader
        }
        // Stale lock — remove
        unlinkSync(this.lockPath);
      } catch {
        try {
          unlinkSync(this.lockPath);
        } catch {
          /* ignore */
        }
      }
    }

    const identity = identifyProcess(process.pid);
    if (!identity) return null;
    const payload: LeaderLockPayload = {
      kind: "CoordinatorLeaderLock",
      pid: process.pid,
      starttime: identity.starttime,
      generation,
      acquired_at: new Date().toISOString(),
      fencing_token: `${process.pid}:${identity.starttime}:${generation}`,
    };
    try {
      this.fd = openSync(this.lockPath, "wx");
      writeFileSync(this.fd, JSON.stringify(payload, null, 2));
      this.payload = payload;
      return payload;
    } catch {
      if (this.fd != null) {
        try {
          closeSync(this.fd);
        } catch {
          /* */
        }
        this.fd = null;
      }
      return null;
    }
  }

  release(): void {
    if (this.fd != null) {
      try {
        closeSync(this.fd);
      } catch {
        /* */
      }
      this.fd = null;
    }
    if (existsSync(this.lockPath) && this.payload) {
      try {
        const cur = JSON.parse(readFileSync(this.lockPath, "utf-8")) as LeaderLockPayload;
        if (cur.fencing_token === this.payload.fencing_token) {
          unlinkSync(this.lockPath);
        }
      } catch {
        /* */
      }
    }
    this.payload = null;
  }

  getPayload(): LeaderLockPayload | null {
    return this.payload;
  }
}
