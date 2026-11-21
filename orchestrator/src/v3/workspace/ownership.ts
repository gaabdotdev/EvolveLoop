/**
 * File ownership ledger — prevents silent overwrite across agents.
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
      return { ok: false, conflict: existing };
    }
    ledger.records = ledger.records.filter((r) => r.path !== rec.path);
    ledger.records.push(rec);
    atomicWrite(this.pathFor(rec.work_id), JSON.stringify(ledger, null, 2));
    return { ok: true };
  }
}
