/**
 * Tracks Core-spawned harness child processes for cancel we actually own.
 * Does not claim control over IDE-attached sessions.
 * V3.5: PGID + /proc starttime to cancel trees and avoid PID reuse kills.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterId } from "../types.js";
import {
  cancelProcessTreeEscalatingSync,
  identifyProcess,
  isProcessLive,
  isProcessStopped,
  sameProcess,
  signalProcessTree,
  sleepMs,
  type SupervisedProcessIdentity,
} from "../../sandbox/process-supervisor.js";

export type ProcessSessionStatus =
  | "running"
  | "paused"
  | "exited"
  | "cancelled"
  | "dry_run"
  | "orphaned";

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
  status: ProcessSessionStatus;
  started_at: string;
  ended_at?: string;
  exit_code?: number | null;
  command: string[];
  prompt_path?: string;
  limitations: string[];
  /** Optional multiplexer session name (tmux/zellij) when Agent Handles ON. */
  mux_backend?: "tmux" | "zellij";
  mux_session?: string;
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

  private identityOf(
    rec: ProcessSessionRecord,
  ): SupervisedProcessIdentity | undefined {
    if (rec.pid == null || !rec.starttime) return undefined;
    return {
      pid: rec.pid,
      pgid: rec.pgid ?? rec.pid,
      starttime: rec.starttime,
      cmdline: rec.command.join(" "),
    };
  }

  /**
   * SIGSTOP owned running session. Refuses without starttime fence.
   * Persists status=paused only after operational stop is confirmed (or documents limitation).
   */
  pause(workId: string, sessionId: string): ProcessSessionRecord {
    const all = this.load(workId);
    const rec = all.find((s) => s.session_id === sessionId);
    if (!rec) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    if (rec.status === "paused") {
      rec.limitations.push("pause:idempotent_already_paused");
      this.save(workId, all);
      return rec;
    }
    if (rec.status !== "running") {
      rec.limitations.push(`pause:refused_status_${rec.status}`);
      this.save(workId, all);
      return rec;
    }
    const identity = this.identityOf(rec);
    if (!identity) {
      rec.limitations.push("pause:refused_no_starttime_fence");
      this.save(workId, all);
      return rec;
    }
    if (!sameProcess(identity)) {
      rec.status = existsSync(`/proc/${rec.pid}`) ? "orphaned" : "exited";
      rec.ended_at = new Date().toISOString();
      rec.limitations.push("pause:pid_reuse_or_gone");
      this.save(workId, all);
      return rec;
    }
    const result = signalProcessTree(identity, "SIGSTOP");
    rec.limitations.push(`pause:${result.reason}`);
    if (result.signalled) {
      // Kernel may lag briefly before state=T — confirm before claiming pause.
      sleepMs(40);
      if (isProcessStopped(identity)) {
        rec.status = "paused";
      } else {
        sleepMs(60);
        if (isProcessStopped(identity)) {
          rec.status = "paused";
        } else {
          rec.limitations.push(
            "pause:LIMITATION_not_stopped_after_SIGSTOP_not_claiming_paused",
          );
        }
      }
    } else {
      rec.limitations.push("pause:LIMITATION_signal_failed_not_claiming_paused");
    }
    this.save(workId, all);
    return rec;
  }

  /**
   * SIGCONT owned paused (or still-running) session. Idempotent when already running.
   */
  resume(workId: string, sessionId: string): ProcessSessionRecord {
    const all = this.load(workId);
    const rec = all.find((s) => s.session_id === sessionId);
    if (!rec) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    if (rec.status === "running") {
      rec.limitations.push("resume:idempotent_already_running");
      this.save(workId, all);
      return rec;
    }
    if (rec.status !== "paused") {
      rec.limitations.push(`resume:refused_status_${rec.status}`);
      this.save(workId, all);
      return rec;
    }
    const identity = this.identityOf(rec);
    if (!identity) {
      rec.limitations.push("resume:refused_no_starttime_fence");
      this.save(workId, all);
      return rec;
    }
    if (!sameProcess(identity)) {
      rec.status = existsSync(`/proc/${rec.pid}`) ? "orphaned" : "exited";
      rec.ended_at = new Date().toISOString();
      rec.limitations.push("resume:pid_reuse_or_gone");
      this.save(workId, all);
      return rec;
    }
    const result = signalProcessTree(identity, "SIGCONT");
    rec.limitations.push(`resume:${result.reason}`);
    if (result.signalled) {
      sleepMs(40);
      if (isProcessStopped(identity)) {
        rec.limitations.push("resume:LIMITATION_still_stopped_after_SIGCONT");
      } else {
        rec.status = "running";
      }
    } else {
      rec.limitations.push("resume:LIMITATION_signal_failed");
    }
    this.save(workId, all);
    return rec;
  }

  /**
   * Cancel owned session: escalate SIGTERM→SIGKILL with fence; persist
   * cancelled only after the process is confirmed dead (or already gone).
   */
  cancel(
    workId: string,
    sessionId: string,
    opts?: { grace_ms?: number },
  ): ProcessSessionRecord {
    const all = this.load(workId);
    const rec = all.find((s) => s.session_id === sessionId);
    if (!rec) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    if (rec.status === "cancelled" || rec.status === "exited") {
      rec.limitations.push("cancel:idempotent_already_terminal");
      this.save(workId, all);
      return rec;
    }
    if (
      (rec.status === "running" || rec.status === "paused") &&
      rec.pid != null &&
      rec.starttime
    ) {
      const identity: SupervisedProcessIdentity = {
        pid: rec.pid,
        pgid: rec.pgid ?? rec.pid,
        starttime: rec.starttime,
        cmdline: rec.command.join(" "),
      };
      const result = cancelProcessTreeEscalatingSync(identity, {
        grace_ms: opts?.grace_ms ?? 1_500,
      });
      rec.limitations.push(`cancel:${result.reason}`);
      if (result.dead) {
        rec.status = "cancelled";
        rec.ended_at = new Date().toISOString();
      } else {
        rec.limitations.push(
          "cancel:LIMITATION_not_claiming_cancelled_process_still_alive",
        );
      }
    } else if (
      (rec.status === "running" || rec.status === "paused") &&
      rec.pid != null
    ) {
      // Legacy records without starttime — refuse bare kill as verified cancel.
      rec.limitations.push(
        "cancel:LIMITATION_refused_no_starttime_fence_not_claiming_cancelled",
      );
    } else {
      rec.limitations.push(`cancel:refused_status_${rec.status}`);
    }
    this.save(workId, all);
    return rec;
  }

  reconcile(workId: string): ProcessSessionRecord[] {
    const all = this.load(workId);
    let changed = false;
    for (const rec of all) {
      if (
        (rec.status !== "running" && rec.status !== "paused") ||
        rec.pid == null
      ) {
        continue;
      }
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
      if (!isProcessLive(identity)) {
        rec.status = "exited";
        rec.ended_at = new Date().toISOString();
        rec.limitations.push(
          sameProcess(identity)
            ? "reconcile:zombie_or_unreaped"
            : existsSync(`/proc/${rec.pid}`)
              ? "reconcile:pid_reused"
              : "reconcile:pid_gone",
        );
        changed = true;
      } else if (rec.status === "paused" && !isProcessStopped(identity)) {
        // Persist honest state if OS resumed out-of-band.
        rec.status = "running";
        rec.limitations.push("reconcile:paused_but_not_stopped");
        changed = true;
      } else if (rec.status === "running" && isProcessStopped(identity)) {
        rec.status = "paused";
        rec.limitations.push("reconcile:running_but_stopped");
        changed = true;
      }
    }
    if (changed) this.save(workId, all);
    return all;
  }
}
