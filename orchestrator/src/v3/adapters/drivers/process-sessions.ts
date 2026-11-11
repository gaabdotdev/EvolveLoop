/**
 * Tracks Core-spawned harness child processes for cancel we actually own.
 * Does not claim control over IDE-attached sessions.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterId } from "../types.js";

export interface ProcessSessionRecord {
  kind: "ProcessSessionRecord";
  session_id: string;
  work_id: string;
  task_id: string;
  adapter_id: AdapterId;
  pid?: number;
  status: "running" | "exited" | "cancelled" | "dry_run";
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

  cancel(workId: string, sessionId: string): ProcessSessionRecord {
    const all = this.load(workId);
    const rec = all.find((s) => s.session_id === sessionId);
    if (!rec) throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    if (rec.status === "running" && rec.pid != null) {
      try {
        process.kill(rec.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    rec.status = "cancelled";
    rec.ended_at = new Date().toISOString();
    this.save(workId, all);
    return rec;
  }
}
