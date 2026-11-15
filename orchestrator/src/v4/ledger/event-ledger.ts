/**
 * File-backed Event Ledger (ADR-V4-0003 / 0004).
 *
 * Per-work append-only stream of WorkEvent. Hash chain is tamper-evidence, not
 * non-repudiation (R1). Seq is the only order key. Producers type their own
 * payloads; M02 types artifact.registered / checkpoint.created and never treats
 * F12 names as CONTROL (R2).
 */

import { existsSync, readFileSync } from "node:fs";
import type { V37LeaseFencingPort } from "../contracts/adapters-v37.js";
import {
  DEFAULT_TENANT_ID,
  isValidId,
  result,
  scanForSecrets,
  type ValidationResult,
} from "../contracts/common.js";
import {
  checkEventStream,
  computeEventDigest,
  computePayloadDigest,
  isKnownEventType,
  validateWorkEvent,
  WORK_EVENT_SCHEMA_VERSION,
  type WorkEvent,
} from "../contracts/work-event.js";
import type { AppendOutcome, EventLedgerPort, WorkEventDraft } from "../contracts/ports.js";
import { HASH_CHAIN_IS_NON_REPUDIATION } from "./guarantees.js";
import {
  atomicWriteFsync,
  discardTmpFiles,
  ensureDir,
  parseJsonlRecords,
  readJsonlLines,
  workPath,
} from "./persistence.js";
import { isExperimentalEventType, validateM02Payload } from "./payloads.js";
import { FencingWatermarkStore, decideFence } from "./fencing.js";
import { emptyProjection, projectEvents, type LedgerProjection } from "./projection.js";

export const MAX_EVENT_PAYLOAD_BYTES = 256 * 1024;
export const MAX_BATCH_EVENTS = 64;

/** R1: pinned so callers cannot advertise INV-EVT-06 as non-repudiation. */
export const LEDGER_HASH_CHAIN_IS_NON_REPUDIATION = HASH_CHAIN_IS_NON_REPUDIATION;

export type Clock = () => string;

export interface EventLedgerOptions {
  root: string;
  clock?: Clock;
  leases?: V37LeaseFencingPort;
  maxPayloadBytes?: number;
  maxBatchEvents?: number;
}

function invalid(head_seq: number, validation: ValidationResult): AppendOutcome {
  return { status: "INVALID", validation, head_seq };
}

export class FileEventLedger implements EventLedgerPort {
  private readonly root: string;
  private readonly clock: Clock;
  private readonly leases: V37LeaseFencingPort | undefined;
  private readonly maxPayloadBytes: number;
  private readonly maxBatchEvents: number;
  private readonly watermarks: FencingWatermarkStore;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(opts: EventLedgerOptions) {
    this.root = opts.root;
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.leases = opts.leases;
    this.maxPayloadBytes = opts.maxPayloadBytes ?? MAX_EVENT_PAYLOAD_BYTES;
    this.maxBatchEvents = opts.maxBatchEvents ?? MAX_BATCH_EVENTS;
    this.watermarks = new FencingWatermarkStore(opts.root);
    ensureDir(this.root);
  }

  watermarkStore(): FencingWatermarkStore {
    return this.watermarks;
  }

  private async withWorkLock<T>(work_id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(work_id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    this.locks.set(
      work_id,
      prev.then(
        () => gate,
        () => gate,
      ),
    );
    await prev.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private eventsPath(work_id: string): string {
    return workPath(this.root, work_id, "events.jsonl");
  }

  private projectionPath(work_id: string): string {
    return workPath(this.root, work_id, "projection.json");
  }

  private async loadEvents(work_id: string): Promise<WorkEvent[]> {
    const dir = workPath(this.root, work_id);
    discardTmpFiles(dir);
    const lines = await readJsonlLines(this.eventsPath(work_id), { maxLineBytes: this.maxPayloadBytes + 8192 });
    return parseJsonlRecords<WorkEvent>(lines);
  }

  async head(work_id: string): Promise<number> {
    if (!isValidId("work", work_id)) return 0;
    const events = await this.loadEvents(work_id);
    return events.length === 0 ? 0 : events[events.length - 1].seq;
  }

  async read(work_id: string, opts?: { from_seq?: number; to_seq?: number }): Promise<WorkEvent[]> {
    if (!isValidId("work", work_id)) return [];
    const events = await this.loadEvents(work_id);
    return events.filter((e) => {
      if (opts?.from_seq !== undefined && e.seq < opts.from_seq) return false;
      if (opts?.to_seq !== undefined && e.seq > opts.to_seq) return false;
      return true;
    });
  }

  async projection(work_id: string, throughSeq?: number): Promise<LedgerProjection> {
    if (!isValidId("work", work_id)) return emptyProjection(String(work_id));
    const events = await this.loadEvents(work_id);
    return projectEvents(work_id, events, throughSeq);
  }

  /**
   * Rebuild projection from the log (source of truth) and persist the cache.
   * Safe after crash_after_event_before_projection. Never writes projection
   * ahead of the log.
   */
  async rebuildProjection(work_id: string): Promise<LedgerProjection> {
    const events = await this.loadEvents(work_id);
    const streamIssues = checkEventStream(events);
    const projected = projectEvents(work_id, events);
    if (projected.event_seq > (events.at(-1)?.seq ?? 0)) {
      throw new Error("projection_ahead_of_log");
    }
    this.writeProjectionCache(work_id, projected, streamIssues.length === 0);
    return projected;
  }

  private writeProjectionCache(work_id: string, projected: LedgerProjection, stream_ok: boolean): void {
    atomicWriteFsync(
      this.projectionPath(work_id),
      JSON.stringify({
        work_id,
        event_seq: projected.event_seq,
        stream_ok,
        projection: projected,
        note: "cache only; rebuild from events.jsonl after crash",
      }),
    );
  }

  async append(work_id: string, drafts: WorkEventDraft[], opts: { expected_head_seq: number }): Promise<AppendOutcome> {
    if (!isValidId("work", work_id)) {
      return invalid(0, result([{ code: "STRUCT", path: "work_id", message: "must be a work id (ADR-V4-0015)" }]));
    }
    return this.withWorkLock(work_id, () => this.appendLocked(work_id, drafts, opts));
  }

  private async appendLocked(work_id: string, drafts: WorkEventDraft[], opts: { expected_head_seq: number }): Promise<AppendOutcome> {
    const existing = await this.loadEvents(work_id);
    const head_seq = existing.length === 0 ? 0 : existing[existing.length - 1].seq;
    if (opts.expected_head_seq !== head_seq) {
      return { status: "CONFLICT", reason: "EXPECTED_SEQ_MISMATCH", head_seq };
    }
    if (!Array.isArray(drafts) || drafts.length === 0) {
      return invalid(head_seq, result([{ code: "STRUCT", path: "drafts", message: "batch must be non-empty" }]));
    }
    if (drafts.length > this.maxBatchEvents) {
      return invalid(head_seq, result([{ code: "D09", path: "drafts", message: `batch exceeds max ${this.maxBatchEvents}` }]));
    }

    const byId = new Map<string, WorkEvent>();
    for (const e of existing) byId.set(e.event_id, e);

    const newDrafts: WorkEventDraft[] = [];
    let duplicateCount = 0;
    for (const draft of drafts) {
      if (!isValidId("event", draft.event_id)) {
        return invalid(head_seq, result([{ code: "STRUCT", path: "event_id", message: "must be an event id" }]));
      }
      if (draft.work_id !== work_id) {
        return invalid(head_seq, result([{ code: "INV-EVT-01", path: "work_id", message: "draft work_id does not match stream" }]));
      }
      const prior = byId.get(draft.event_id);
      if (prior) {
        const digest = computePayloadDigest(draft.payload ?? {});
        if (digest !== prior.payload_digest) {
          return { status: "CONFLICT", reason: "EVENT_ID_REUSED_WITH_DIFFERENT_PAYLOAD", head_seq };
        }
        duplicateCount += 1;
        continue;
      }
      newDrafts.push(draft);
    }

    if (newDrafts.length === 0 && duplicateCount === drafts.length) {
      return { status: "DUPLICATE", events: existing, head_seq };
    }

    const now = this.clock();
    let fenceEpochToBump: number | undefined;
    const prepared: WorkEvent[] = [];
    let seq = head_seq;
    let prevDigest: WorkEvent["prev_event_digest"] =
      existing.length === 0 ? "GENESIS" : existing[existing.length - 1].event_digest;

    for (const draft of newDrafts) {
      if (!isKnownEventType(draft.type)) {
        return invalid(head_seq, result([{ code: "INV-EVT-04", path: "type", message: `unregistered event type ${draft.type}` }]));
      }
      const payload = draft.payload ?? {};
      const payloadBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
      if (payloadBytes > this.maxPayloadBytes) {
        return invalid(head_seq, result([{ code: "D09", path: "payload", message: "payload exceeds size limit" }]));
      }
      const secrets = scanForSecrets(payload);
      if (secrets.length > 0) {
        return invalid(
          head_seq,
          result(secrets.map((s) => ({ code: "F11", path: `payload.${s.path}`, message: `secret material refused (${s.reason})` }))),
        );
      }
      const typed = validateM02Payload(draft.type, payload);
      if (typed && !typed.valid) return invalid(head_seq, typed);

      const expectedPayloadDigest = computePayloadDigest(payload);
      if (draft.payload_digest !== expectedPayloadDigest) {
        return invalid(head_seq, result([{ code: "INV-EVT-03", path: "payload_digest", message: "payload digest mismatch" }]));
      }

      const fence = decideFence({
        fencing: draft.fencing,
        leases: this.leases,
        watermark: this.watermarks.get(work_id),
        head_seq,
      });
      if (fence.status === "FENCED") {
        return { status: "FENCED", reason: fence.reason, head_seq };
      }
      if (fence.status === "ALLOW") {
        fenceEpochToBump = Math.max(fenceEpochToBump ?? 0, fence.epoch);
      }

      seq += 1;
      const body: Omit<WorkEvent, "event_digest"> = {
        kind: "WorkEvent",
        schema_version: draft.schema_version || WORK_EVENT_SCHEMA_VERSION,
        tenant_id: draft.tenant_id || DEFAULT_TENANT_ID,
        event_id: draft.event_id,
        work_id,
        seq,
        type: draft.type,
        type_version: draft.type_version,
        occurred_at: draft.occurred_at,
        recorded_at: now,
        actor: draft.actor,
        correlation_id: draft.correlation_id,
        payload,
        payload_digest: expectedPayloadDigest,
        prev_event_digest: prevDigest,
        ...(draft.causation_id !== undefined ? { causation_id: draft.causation_id } : {}),
        ...(draft.idempotency_key !== undefined ? { idempotency_key: draft.idempotency_key } : {}),
        ...(draft.fencing !== undefined
          ? {
              fencing: {
                lease_id: draft.fencing.lease_id,
                fencing_epoch: fence.status === "ALLOW" ? fence.epoch : draft.fencing.fencing_epoch,
              },
            }
          : {}),
      };
      const event: WorkEvent = { ...body, event_digest: computeEventDigest(body) };
      const validation = validateWorkEvent(event);
      if (!validation.valid) return invalid(head_seq, validation);
      prepared.push(event);
      prevDigest = event.event_digest;
      byId.set(event.event_id, event);
    }

    const committed = [...existing, ...prepared];
    const streamIssues = checkEventStream(committed);
    if (streamIssues.length > 0) {
      return invalid(
        head_seq,
        result(streamIssues.map((i) => ({ code: i.code, path: `seq.${i.seq}`, message: i.message }))),
      );
    }

    const body = committed.map((e) => JSON.stringify(e)).join("\n") + "\n";
    atomicWriteFsync(this.eventsPath(work_id), body);
    if (fenceEpochToBump !== undefined) {
      this.watermarks.bump(work_id, fenceEpochToBump, now);
    }

    try {
      const projected = projectEvents(work_id, committed);
      if (projected.event_seq > (committed.at(-1)?.seq ?? 0)) throw new Error("projection_ahead_of_log");
      this.writeProjectionCache(work_id, projected, true);
    } catch {
      // Crash window: log is durable; rebuildProjection recovers.
    }

    return { status: "APPENDED", events: prepared, head_seq: seq };
  }

  /** Test/recovery helper: drop the projection cache without touching the log. */
  dropProjectionCache(work_id: string): void {
    const p = this.projectionPath(work_id);
    if (!existsSync(p)) return;
    atomicWriteFsync(p, JSON.stringify({ dropped: true, at: this.clock() }));
  }

  readProjectionCache(work_id: string): { event_seq: number; projection: LedgerProjection } | undefined {
    const p = this.projectionPath(work_id);
    if (!existsSync(p)) return undefined;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as { event_seq: number; projection: LedgerProjection };
    } catch {
      return undefined;
    }
  }

  isExperimental(type: string): boolean {
    return isExperimentalEventType(type);
  }
}
