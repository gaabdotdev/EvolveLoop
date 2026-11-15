/**
 * Durable effect + evidence persistence.
 *
 * Paths use only `isValidId`-validated identifiers (TM-V4-F08). Idempotency keys
 * are NEVER used as path components — F06 V3 sanitization made `a/b` ≡ `a_b`.
 * Keys are compared as exact strings; the on-disk index name is sha256 of the
 * exact (integration_id, key) pair so distinct keys cannot collide.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isValidId } from "../contracts/common.js";
import type { EffectRecord } from "../contracts/effect.js";
import type { Evidence } from "../contracts/evidence.js";
import { EFFECT_ERROR, EffectLedgerError } from "./errors.js";
import { AUDIT_INTEGRITY_CLAIM, type EffectAuditEntry } from "./types.js";

export interface IdempotencyIndexEntry {
  /** Exact key, no transformation. */
  key: string;
  integration_id: string;
  effect_id: string;
  parameters_digest: string;
  work_id: string;
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, path);
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/** Lossless slot id for maps and hashed filenames — not a sanitised key. */
export function idempotencySlot(integration_id: string, key: string): string {
  return `${integration_id}\u0000${key}`;
}

export function idempotencySlotDigest(integration_id: string, key: string): string {
  return createHash("sha256").update(idempotencySlot(integration_id, key), "utf8").digest("hex");
}

export function assertSafeEffectId(effect_id: string): void {
  if (!isValidId("effect", effect_id)) {
    throw new EffectLedgerError(EFFECT_ERROR.INVALID, "effect_id failed isValidId", { effect_id });
  }
}

export function assertSafeEvidenceId(evidence_id: string): void {
  if (!isValidId("evidence", evidence_id)) {
    throw new EffectLedgerError(EFFECT_ERROR.INVALID, "evidence_id failed isValidId", { evidence_id });
  }
}

export function assertSafeWorkId(work_id: string): void {
  if (!isValidId("work", work_id)) {
    throw new EffectLedgerError(EFFECT_ERROR.INVALID, "work_id failed isValidId", { work_id });
  }
}

export interface EffectPersistence {
  loadAll(): EffectRecord[];
  load(effect_id: string): EffectRecord | undefined;
  save(record: EffectRecord): void;
  loadEvidence(evidence_id: string): Evidence | undefined;
  saveEvidence(evidence: Evidence): void;
  loadAllEvidence(): Evidence[];
  appendAudit(entry: EffectAuditEntry): void;
  readAudit(effect_id: string): EffectAuditEntry[];
}

export class MemoryEffectPersistence implements EffectPersistence {
  private readonly effects = new Map<string, EffectRecord>();
  private readonly evidence = new Map<string, Evidence>();
  private readonly audit = new Map<string, EffectAuditEntry[]>();

  loadAll(): EffectRecord[] {
    return [...this.effects.values()].map((r) => structuredClone(r));
  }

  load(effect_id: string): EffectRecord | undefined {
    const row = this.effects.get(effect_id);
    return row ? structuredClone(row) : undefined;
  }

  save(record: EffectRecord): void {
    this.effects.set(record.effect_id, structuredClone(record));
  }

  loadEvidence(evidence_id: string): Evidence | undefined {
    const row = this.evidence.get(evidence_id);
    return row ? structuredClone(row) : undefined;
  }

  saveEvidence(evidence: Evidence): void {
    this.evidence.set(evidence.evidence_id, structuredClone(evidence));
  }

  loadAllEvidence(): Evidence[] {
    return [...this.evidence.values()].map((e) => structuredClone(e));
  }

  appendAudit(entry: EffectAuditEntry): void {
    const list = this.audit.get(entry.effect_id) ?? [];
    list.push({ ...entry, integrity_claim: AUDIT_INTEGRITY_CLAIM });
    this.audit.set(entry.effect_id, list);
  }

  readAudit(effect_id: string): EffectAuditEntry[] {
    return [...(this.audit.get(effect_id) ?? [])];
  }
}

export class FileEffectPersistence implements EffectPersistence {
  constructor(private readonly rootDir: string) {
    mkdirSync(join(rootDir, "effects"), { recursive: true });
    mkdirSync(join(rootDir, "evidence"), { recursive: true });
    mkdirSync(join(rootDir, "audit"), { recursive: true });
  }

  private effectPath(effect_id: string): string {
    assertSafeEffectId(effect_id);
    return join(this.rootDir, "effects", `${effect_id}.json`);
  }

  private evidencePath(evidence_id: string): string {
    assertSafeEvidenceId(evidence_id);
    return join(this.rootDir, "evidence", `${evidence_id}.json`);
  }

  private auditPath(effect_id: string): string {
    assertSafeEffectId(effect_id);
    return join(this.rootDir, "audit", `${effect_id}.jsonl`);
  }

  loadAll(): EffectRecord[] {
    const dir = join(this.rootDir, "effects");
    if (!existsSync(dir)) return [];
    const out: EffectRecord[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      if (!isValidId("effect", id)) continue;
      const row = readJson<EffectRecord>(join(dir, name));
      if (row) out.push(row);
    }
    return out;
  }

  load(effect_id: string): EffectRecord | undefined {
    return readJson<EffectRecord>(this.effectPath(effect_id));
  }

  save(record: EffectRecord): void {
    atomicWriteJson(this.effectPath(record.effect_id), record);
  }

  loadEvidence(evidence_id: string): Evidence | undefined {
    return readJson<Evidence>(this.evidencePath(evidence_id));
  }

  saveEvidence(evidence: Evidence): void {
    atomicWriteJson(this.evidencePath(evidence.evidence_id), evidence);
  }

  loadAllEvidence(): Evidence[] {
    const dir = join(this.rootDir, "evidence");
    if (!existsSync(dir)) return [];
    const out: Evidence[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      if (!isValidId("evidence", id)) continue;
      const row = readJson<Evidence>(join(dir, name));
      if (row) out.push(row);
    }
    return out;
  }

  appendAudit(entry: EffectAuditEntry): void {
    const path = this.auditPath(entry.effect_id);
    mkdirSync(dirname(path), { recursive: true });
    const line = JSON.stringify({ ...entry, integrity_claim: AUDIT_INTEGRITY_CLAIM });
    writeFileSync(path, `${line}\n`, { encoding: "utf-8", flag: "a", mode: 0o600 });
  }

  readAudit(effect_id: string): EffectAuditEntry[] {
    const path = this.auditPath(effect_id);
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf-8")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as EffectAuditEntry);
  }
}

export function createPersistence(rootDir?: string): EffectPersistence {
  return rootDir ? new FileEffectPersistence(rootDir) : new MemoryEffectPersistence();
}
