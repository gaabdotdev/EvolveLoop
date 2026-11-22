/**
 * Tracks Core-spawned harness child processes for cancel we actually own.
 * Does not claim control over IDE-attached sessions.
 * V3.5: PGID + /proc starttime to cancel trees and avoid PID reuse kills.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterId } from "../types.js";
import {
  cancelProcessTree,
  identifyProcess,
  sameProcess,
  type SupervisedProcessIdentity,
} from "../../sandbox/process-supervisor.js";

export interface ProcessSessionRecord {
  kind: "ProcessSessionRecord";
  session_id: string;
  work_id: string;
  task_id: string;
  adapter_id: AdapterId;
  agent_id?: string;
  pid?: number;
  pgid?: number;
  /** /proc/<pid>/stat starttime — fencing against PID reuse */
  starttime?: string;
  status: "running" | "exited" | "cancelled" | "dry_run" | "orphaned";
  started_at: string;
  ended_at?: string;
  exit_code?: number | null;
  command: string[];
  prompt_path?: string;
  limitations: string[];
}

export class ProcessSessionStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.rootDir, `${workId}.json`);
  }

  load(workId: string): ProcessSessionRecord[] {
    const path = this.pathFor(workId);
    if (!existsSync(path)) return [];
    return JSON.parse(readFileSync(path, "utf-8")) as ProcessSessionRecord[];
  }

  private save(workId: string, sessions: ProcessSessionRecord[]): void {
    const path = this.pathFor(workId);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(sessions, null, 2));
    renameSync(tmp, path);
  }

  upsert(rec: ProcessSessionRecord): void {
    const all = this.load(rec.work_id).filter((s) => s.session_id !== rec.session_id);
    all.push(rec);
    this.save(rec.work_id, all);
  }

  attachIdentity(rec: ProcessSessionRecord, pid: number): ProcessSessionRecord {
    const id = identifyProcess(pid);
    if (id) {
      rec.pid = id.pid;
      rec.pgid = id.pgid;
      rec.starttime = id.starttime;
    } else {
      rec.pid = pid;
      rec.pgid = pid;
    }
    this.upsert(rec);
    return rec;
  }

  cancel(workId: string, sessionId: string): ProcessSessionRecord {
    const all = this.load(workId);
    const rec = all.find((s) => s.session_id === sessionId);
    if (!rec) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    if (rec.status === "running" && rec.pid != null && rec.starttime) {
      const identity: SupervisedProcessIdentity = {
        pid: rec.pid,
        pgid: rec.pgid ?? rec.pid,
        starttime: rec.starttime,
        cmdline: rec.command.join(" "),
      };
      const result = cancelProcessTree(identity, "SIGTERM");
      rec.limitations.push(`cancel:${result.reason}`);
      if (result.signalled) {
        // Escalate if still same process after short wait is left to supervisor loop.
        setTimeout(() => {
          if (sameProcess(identity)) {
            cancelProcessTree(identity, "SIGKILL");
          }
        }, 2000).unref?.();
      }
    } else if (rec.status === "running" && rec.pid != null) {
      // Legacy records without starttime — SIGTERM pid only, document limitation.
      try {
        process.kill(rec.pid, "SIGTERM");
        rec.limitations.push("cancel:legacy_pid_only_no_starttime");
      } catch {
        /* already gone */
      }
    }
    rec.status = "cancelled";
    rec.ended_at = new Date().toISOString();
    this.save(workId, all);
    return rec;
  }

  reconcile(workId: string): ProcessSessionRecord[] {
    const all = this.load(workId);
    let changed = false;
    for (const rec of all) {
      if (rec.status !== "running" || rec.pid == null) continue;
      if (!rec.starttime) {
        if (!existsSync(`/proc/${rec.pid}`)) {
          rec.status = "exited";
          rec.ended_at = new Date().toISOString();
          changed = true;
        }
        continue;
      }
      const identity: SupervisedProcessIdentity = {
        pid: rec.pid,
        pgid: rec.pgid ?? rec.pid,
        starttime: rec.starttime,
        cmdline: "",
      };
      if (!sameProcess(identity)) {
        rec.status = existsSync(`/proc/${rec.pid}`) ? "orphaned" : "exited";
        rec.ended_at = new Date().toISOString();
        rec.limitations.push("reconcile:pid_gone_or_reused");
        changed = true;
      }
    }
    if (changed) this.save(workId, all);
    return all;
  }
}
