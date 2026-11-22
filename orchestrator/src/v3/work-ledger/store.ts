import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkState } from "../goal-contract/types.js";
import type { LedgerEntryType, WorkLedgerEntry, WorkLedgerSnapshot } from "./types.js";

export class WorkLedgerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorkLedgerError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function atomicWrite(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class WorkLedgerStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private jsonlPath(workId: string): string {
    return join(this.rootDir, `${workId}.jsonl`);
  }

  private metaPath(workId: string): string {
    return join(this.rootDir, `${workId}.meta.json`);
  }

  open(workId: string, goalContractId: string, origin = "coordinator"): WorkLedgerEntry {
    if (existsSync(this.metaPath(workId))) {
      throw new WorkLedgerError("ALREADY_OPEN", workId);
    }
    return this.append({
      work_id: workId,
      type: "work_opened",
      origin,
      goal_contract_id: goalContractId,
      payload: { work_state: "IN_PROGRESS" satisfies WorkState },
      provenance: { source: origin },
    });
  }

  append(
    input: Omit<WorkLedgerEntry, "kind" | "version" | "ts"> & { ts?: string },
  ): WorkLedgerEntry {
    const meta = this.loadMeta(input.work_id, /* create */ true);
    const version = meta.latest_version + 1;
    const entry: WorkLedgerEntry = {
      kind: "WorkLedgerEntry",
      work_id: input.work_id,
      version,
      ts: input.ts ?? nowIso(),
      type: input.type,
      origin: input.origin,
      task_id: input.task_id,
      agent_id: input.agent_id,
      criterion_id: input.criterion_id,
      goal_contract_id: input.goal_contract_id ?? meta.goal_contract_id,
      payload: input.payload,
      provenance: input.provenance,
    };
    appendFileSync(this.jsonlPath(input.work_id), JSON.stringify(entry) + "\n", "utf-8");

    let workState = meta.work_state;
    if (input.type === "work_state_changed" && typeof input.payload.work_state === "string") {
      workState = input.payload.work_state as WorkState;
    } else if (input.type === "work_opened") {
      workState = "IN_PROGRESS";
    }

    const snapshot: WorkLedgerSnapshot = {
      kind: "WorkLedgerSnapshot",
      work_id: input.work_id,
      latest_version: version,
      work_state: workState,
      goal_contract_id: entry.goal_contract_id,
      updated_at: entry.ts,
      entry_count: meta.entry_count + 1,
    };
    atomicWrite(this.metaPath(input.work_id), JSON.stringify(snapshot, null, 2));
    return entry;
  }

  recordStateChange(
    workId: string,
    workState: WorkState,
    origin: string,
    payload: Record<string, unknown> = {},
  ): WorkLedgerEntry {
    return this.append({
      work_id: workId,
      type: "work_state_changed",
      origin,
      payload: { work_state: workState, ...payload },
      provenance: { source: origin },
    });
  }

  read(workId: string): WorkLedgerEntry[] {
    const path = this.jsonlPath(workId);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as WorkLedgerEntry);
  }

  snapshot(workId: string): WorkLedgerSnapshot {
    return this.loadMeta(workId, false);
  }

  /**
   * Rebuild snapshot from JSONL (projection is disposable).
   */
  rebuildSnapshot(workId: string): WorkLedgerSnapshot {
    const entries = this.read(workId);
    if (entries.length === 0) {
      throw new WorkLedgerError("NOT_FOUND", workId);
    }
    let workState: WorkState = "NOT_PASS";
    let goalContractId: string | undefined;
    for (const e of entries) {
      if (e.goal_contract_id) goalContractId = e.goal_contract_id;
      if (e.type === "work_opened" || e.type === "work_state_changed") {
        if (typeof e.payload.work_state === "string") {
          workState = e.payload.work_state as WorkState;
        }
      }
    }
    const last = entries[entries.length - 1]!;
    const snap: WorkLedgerSnapshot = {
      kind: "WorkLedgerSnapshot",
      work_id: workId,
      latest_version: last.version,
      work_state: workState,
      goal_contract_id: goalContractId,
      updated_at: last.ts,
      entry_count: entries.length,
    };
    atomicWrite(this.metaPath(workId), JSON.stringify(snap, null, 2));
    return snap;
  }

  private loadMeta(workId: string, create: boolean): WorkLedgerSnapshot {
    const path = this.metaPath(workId);
    if (!existsSync(path)) {
      if (!create) throw new WorkLedgerError("NOT_FOUND", workId);
      return {
        kind: "WorkLedgerSnapshot",
        work_id: workId,
        latest_version: 0,
        work_state: "NOT_PASS",
        updated_at: nowIso(),
        entry_count: 0,
      };
    }
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as WorkLedgerSnapshot;
    if (parsed.kind !== "WorkLedgerSnapshot") {
      throw new WorkLedgerError("INVALID", path);
    }
    return parsed;
  }
}

export type { LedgerEntryType };
