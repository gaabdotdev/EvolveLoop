/**
 * Idempotency keys for coordination mutations (recovery, cancel, lock acquire with client key).
 * Same key + same payload hash → return stored result; conflicting payload → reject.
 *
 * V2-ORCH-03: optional `claim` persists a pending lease so in-flight retries are typed
 * (`in_flight`) instead of silently replaying a null result.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface IdempotencyRecord {
  kind: "IdempotencyRecord";
  key: string;
  operation: string;
  work_id: string;
  payload_hash: string;
  result: unknown;
  created_at: string;
  /** Set when claim=true until commit/abandon. */
  pending?: boolean;
}

export type IdempotencyOutcome =
  | { status: "fresh"; record: IdempotencyRecord }
  | { status: "replay"; record: IdempotencyRecord }
  | { status: "in_flight"; record: IdempotencyRecord }
  | { status: "conflict"; reason: string; existing: IdempotencyRecord };

export interface BeginOrReplayOptions {
  /**
   * When true, persist a pending record on fresh claim and treat pending same-payload
   * records as `in_flight`. Default false preserves cancel / legacy double-begin semantics.
   */
  claim?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export class IdempotencyStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(workId: string, key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    return join(this.rootDir, workId, `${safe}.json`);
  }

  private writeRecord(record: IdempotencyRecord): void {
    const path = this.pathFor(record.work_id, record.key);
    mkdirSync(join(this.rootDir, record.work_id), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(record, null, 2));
    renameSync(tmp, path);
  }

  beginOrReplay(
    workId: string,
    key: string,
    operation: string,
    payload: unknown,
    opts?: BeginOrReplayOptions,
  ): IdempotencyOutcome {
    const path = this.pathFor(workId, key);
    const payload_hash = hashPayload(payload);
    const claim = opts?.claim === true;

    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf-8")) as IdempotencyRecord;
      if (existing.payload_hash !== payload_hash || existing.operation !== operation) {
        return {
          status: "conflict",
          reason: "idempotency_key_reuse_with_different_payload",
          existing,
        };
      }
      if (claim && existing.pending === true) {
        return { status: "in_flight", record: existing };
      }
      // Legacy / committed records: result may be null as a stored value — only
      // `pending: true` means in-flight under claim mode.
      return { status: "replay", record: existing };
    }

    const record: IdempotencyRecord = {
      kind: "IdempotencyRecord",
      key,
      operation,
      work_id: workId,
      payload_hash,
      result: null,
      created_at: nowIso(),
      ...(claim ? { pending: true } : {}),
    };

    if (claim) {
      this.writeRecord(record);
    }

    return { status: "fresh", record };
  }

  commit(record: IdempotencyRecord, result: unknown): IdempotencyRecord {
    const { pending: _pending, ...rest } = record;
    void _pending;
    const full: IdempotencyRecord = { ...rest, result };
    this.writeRecord(full);
    return full;
  }

  /** Drop a claimed pending lease without storing a result (failed / abandoned effect). */
  abandon(record: IdempotencyRecord): void {
    const path = this.pathFor(record.work_id, record.key);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf-8")) as IdempotencyRecord;
      if (existing.pending === true) {
        unlinkSync(path);
      }
    }
  }
}
