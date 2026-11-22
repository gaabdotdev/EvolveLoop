/**
 * Durable evidence records for verified TRUE_FULL_PASS evaluation.
 * String evidence_ids alone are insufficient — records must resolve and hash-check.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { walkRelFiles } from "../engineering/workspace.js";

export type EvidenceKind =
  | "test_result"
  | "diff"
  | "review"
  | "file_hash"
  | "command"
  | "artifact"
  | "exploration";

export interface EvidenceRecord {
  kind: "EvidenceRecord";
  evidence_id: string;
  evidence_kind: EvidenceKind;
  work_id: string;
  goal_contract_id: string;
  created_at: string;
  content_hash: string;
  workspace_fingerprint: string;
  actor_agent_id?: string;
  payload: Record<string, unknown>;
  invalidated?: boolean;
  invalidation_reason?: string;
}

export interface EvidenceCreateInput {
  evidence_kind: EvidenceKind;
  work_id: string;
  goal_contract_id: string;
  actor_agent_id?: string;
  workspace_root: string;
  payload: Record<string, unknown>;
  fingerprint_files?: string[];
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function fingerprintWorkspace(root: string, files?: string[]): string {
  const list = (files ?? walkRelFiles(root)).filter((f) => !f.startsWith(".evolveloop/")).sort();
  const parts: string[] = [];
  for (const rel of list) {
    try {
      const body = readFileSync(join(root, rel), "utf-8");
      parts.push(`${rel}:${sha256(body)}`);
    } catch {
      parts.push(`${rel}:MISSING`);
    }
  }
  return sha256(parts.join("|"));
}

function atomicWrite(path: string, body: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, body, "utf-8");
  renameSync(tmp, path);
}

export class EvidenceStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(id: string): string {
    return join(this.rootDir, `${id}.json`);
  }

  create(input: EvidenceCreateInput): EvidenceRecord {
    const evidence_id = `ev-${randomUUID()}`;
    const created_at = new Date().toISOString();
    const workspace_fingerprint = fingerprintWorkspace(input.workspace_root, input.fingerprint_files);
    const payloadBody = JSON.stringify(input.payload);
    const content_hash = sha256(payloadBody);
    const record: EvidenceRecord = {
      kind: "EvidenceRecord",
      evidence_id,
      evidence_kind: input.evidence_kind,
      work_id: input.work_id,
      goal_contract_id: input.goal_contract_id,
      created_at,
      content_hash,
      workspace_fingerprint,
      actor_agent_id: input.actor_agent_id,
      payload: input.payload,
    };
    atomicWrite(this.pathFor(evidence_id), JSON.stringify(record, null, 2));
    return record;
  }

  load(id: string): EvidenceRecord | null {
    const path = this.pathFor(id);
    if (!existsSync(path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as EvidenceRecord;
      if (parsed.kind !== "EvidenceRecord") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  invalidate(id: string, reason: string): void {
    const rec = this.load(id);
    if (!rec) return;
    rec.invalidated = true;
    rec.invalidation_reason = reason;
    atomicWrite(this.pathFor(id), JSON.stringify(rec, null, 2));
  }

  verifyIntegrity(id: string): { ok: boolean; reasons: string[] } {
    const rec = this.load(id);
    const reasons: string[] = [];
    if (!rec) return { ok: false, reasons: ["evidence_not_found"] };
    if (rec.invalidated) reasons.push("evidence_invalidated");
    const recomputed = sha256(JSON.stringify(rec.payload));
    if (recomputed !== rec.content_hash) reasons.push("content_hash_mismatch");
    return { ok: reasons.length === 0, reasons };
  }
}
