/**
 * Idempotency keys for coordination mutations (recovery, cancel, lock acquire with client key).
 * Same key + same payload hash → return stored result; conflicting payload → reject.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface IdempotencyRecord {
  kind: "IdempotencyRecord";
  key: string;
  operation: string;
  work_id: string;
  payload_hash: string;
  result: unknown;
  created_at: string;
}

export type IdempotencyOutcome =
  | { status: "fresh"; record: IdempotencyRecord }
  | { status: "replay"; record: IdempotencyRecord }
  | { status: "conflict"; reason: string; existing: IdempotencyRecord };

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

  beginOrReplay(
    workId: string,
    key: string,
    operation: string,
    payload: unknown,
  ): IdempotencyOutcome {
    const path = this.pathFor(workId, key);
    const payload_hash = hashPayload(payload);
    if (existsSync(path)) {
      const existing = JSON.parse(readFileSync(path, "utf-8")) as IdempotencyRecord;
      if (existing.payload_hash !== payload_hash || existing.operation !== operation) {
        return {
          status: "conflict",
          reason: "idempotency_key_reuse_with_different_payload",
          existing,
        };
      }
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
    };
    return { status: "fresh", record };
  }

  commit(record: IdempotencyRecord, result: unknown): IdempotencyRecord {
    const path = this.pathFor(record.work_id, record.key);
    mkdirSync(join(this.rootDir, record.work_id), { recursive: true });
    const full: IdempotencyRecord = { ...record, result };
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(full, null, 2));
    renameSync(tmp, path);
    return full;
  }
}
