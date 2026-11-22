/**
 * V5-M05 — Append-only AuditLog (JSONL file).
 * Optional mirror into CoordinationEventLog / StateDb is caller-driven.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AuditEntry, GovernanceAuditKind } from "./types.js";

export class AuditLog {
  private readonly path: string;

  constructor(rootDir: string, workId = "_global") {
    mkdirSync(rootDir, { recursive: true });
    const safe = workId.replace(/[^a-zA-Z0-9._-]/g, "_") || "_global";
    this.path = join(rootDir, `audit-${safe}.jsonl`);
  }

  append(input: {
    work_id?: string;
    attempt_id?: string;
    agent_id?: string;
    audit_kind: GovernanceAuditKind;
    message: string;
    payload?: Record<string, unknown>;
    ts?: string;
  }): AuditEntry {
    const event: AuditEntry = {
      kind: "GovernanceAuditEvent",
      event_id: `gaud-${randomUUID()}`,
      ts: input.ts ?? new Date().toISOString(),
      work_id: input.work_id,
      attempt_id: input.attempt_id,
      agent_id: input.agent_id,
      audit_kind: input.audit_kind,
      message: input.message,
      payload: input.payload,
    };
    appendFileSync(this.path, JSON.stringify(event) + "\n", "utf-8");
    return event;
  }

  read(): AuditEntry[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEntry);
  }

  /** Path of the append-only file (for evidence / debugging). */
  filePath(): string {
    return this.path;
  }
}

/** @deprecated alias — prefer AuditLog */
export class GovernanceAuditLog extends AuditLog {}
