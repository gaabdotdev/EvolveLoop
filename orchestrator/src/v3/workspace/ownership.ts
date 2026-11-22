/**
 * File ownership ledger — prevents silent overwrite across agents.
 * Exact-path claim (legacy) + release; prefix overlap is enforced by
 * parallel File-Ownership Locking (V2-ORCH-01) via pathsOverlap before claim.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FileOwnershipRecord {
  path: string;
  work_id: string;
  agent_id: string;
  task_id?: string;
  workspace_id: string;
  claimed_at: string;
  base_commit?: string;
}

export interface OwnershipLedgerFile {
  kind: "OwnershipLedger";
  work_id: string;
  records: FileOwnershipRecord[];
}

export interface OwnershipReleaseFilter {
  task_id?: string;
  agent_id?: string;
  path?: string;
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class OwnershipLedger {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string): string {
    return join(this.rootDir, `${workId}.json`);
  }

  load(workId: string): OwnershipLedgerFile {
    const p = this.pathFor(workId);
    if (!existsSync(p)) {
      return { kind: "OwnershipLedger", work_id: workId, records: [] };
    }
    return JSON.parse(readFileSync(p, "utf-8")) as OwnershipLedgerFile;
  }

  claim(rec: FileOwnershipRecord): { ok: true } | { ok: false; conflict: FileOwnershipRecord } {
    const ledger = this.load(rec.work_id);
    const existing = ledger.records.find((r) => r.path === rec.path);
    if (existing && existing.agent_id !== rec.agent_id) {
      // Same task may refresh its claim after owner_agent_id changes.
      if (!(rec.task_id && existing.task_id && rec.task_id === existing.task_id)) {
        return { ok: false, conflict: existing };
      }
    }
    ledger.records = ledger.records.filter((r) => r.path !== rec.path);
    ledger.records.push(rec);
    atomicWrite(this.pathFor(rec.work_id), JSON.stringify(ledger, null, 2));
    return { ok: true };
  }

  /**
   * Release claimed paths. Match by task_id and/or agent_id and/or exact path.
   * At least one filter field is required; returns number of records removed.
   */
  release(workId: string, filter: OwnershipReleaseFilter): number {
    if (!filter.task_id && !filter.agent_id && !filter.path) {
      return 0;
    }
    const ledger = this.load(workId);
    const before = ledger.records.length;
    ledger.records = ledger.records.filter((r) => {
      if (filter.task_id != null && r.task_id !== filter.task_id) return true;
      if (filter.agent_id != null && r.agent_id !== filter.agent_id) return true;
      if (filter.path != null && r.path !== filter.path) return true;
      // Matched all provided filter fields → drop.
      return false;
    });
    const removed = before - ledger.records.length;
    if (removed > 0) {
      atomicWrite(this.pathFor(workId), JSON.stringify(ledger, null, 2));
    }
    return removed;
  }
}
