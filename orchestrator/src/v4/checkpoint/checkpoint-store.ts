/**
 * Checkpoint store (ADR-V4-0005). Layer 1 (workflow state) is authoritative.
 * Layer 2 (workspace snapshot) is optional evidence. Layer 3 (context_hint)
 * is never required for recovery (INV-CKPT-02).
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  CHECKPOINT_SCHEMA_VERSION,
  openEffects,
  type Checkpoint,
} from "../contracts/checkpoint.js";
import type { ArtifactStorePort, CheckpointStorePort, EventLedgerPort, WorkEventDraft } from "../contracts/ports.js";
import {
  DEFAULT_TENANT_ID,
  isValidId,
} from "../contracts/common.js";
import { computePayloadDigest, WORK_EVENT_SCHEMA_VERSION } from "../contracts/work-event.js";
import { computeStateDigest, projectEvents } from "../ledger/projection.js";
import { atomicWriteFsync, ensureDir, resolveUnderRoot, workPath } from "../ledger/persistence.js";
import { requireId } from "../ledger/ids.js";
import { FileEventLedger } from "../ledger/event-ledger.js";
import { reconcileCheckpoint } from "./reconcile.js";

export interface CheckpointStoreOptions {
  root: string;
  ledger: EventLedgerPort;
  artifacts: ArtifactStorePort;
  clock?: () => string;
  emitEvent?: boolean;
}

export class FileCheckpointStore implements CheckpointStorePort {
  private readonly root: string;
  private readonly ledger: EventLedgerPort;
  private readonly artifacts: ArtifactStorePort;
  private readonly clock: () => string;
  private readonly emitEvent: boolean;

  constructor(opts: CheckpointStoreOptions) {
    this.root = opts.root;
    this.ledger = opts.ledger;
    this.artifacts = opts.artifacts;
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.emitEvent = opts.emitEvent ?? true;
    ensureDir(this.root);
  }

  private dir(work_id: string): string {
    const dir = workPath(this.root, work_id, "checkpoints");
    ensureDir(dir);
    return dir;
  }

  private file(work_id: string, checkpoint_id: string): string {
    requireId("checkpoint", checkpoint_id);
    return resolveUnderRoot(this.dir(work_id), `${checkpoint_id}.json`);
  }

  async create(work_id: string, at_seq: number): Promise<Checkpoint> {
    requireId("work", work_id);
    if (!Number.isInteger(at_seq) || at_seq < 1) {
      throw new Error("checkpoint_seq_invalid");
    }
    const head = await this.ledger.head(work_id);
    if (at_seq > head) {
      throw new Error("INV-CKPT-01:event_seq_beyond_head");
    }
    const events = await this.ledger.read(work_id, { to_seq: at_seq });
    const projection = this.ledger instanceof FileEventLedger
      ? await this.ledger.projection(work_id, at_seq)
      : projectEvents(work_id, events, at_seq);

    if (!projection.goal_contract_ref) {
      throw new Error("checkpoint_missing_goal_contract_ref");
    }

    const checkpoint_id = `ckpt_${randomUUID()}`;
    const created_at = this.clock();
    const draft: Checkpoint = {
      kind: "Checkpoint",
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      tenant_id: DEFAULT_TENANT_ID,
      checkpoint_id,
      work_id,
      event_seq: at_seq,
      state_digest: computeStateDigest(projection),
      goal_contract_ref: projection.goal_contract_ref,
      task_states: projection.task_states,
      artifact_refs: projection.artifact_refs,
      effect_summary: projection.effect_summary,
      consistency: "UNVERIFIED",
      created_at,
    };

    const report = await reconcileCheckpoint(draft, {
      projection,
      last_event_seq: head,
      artifacts: this.artifacts,
    });
    const checkpoint: Checkpoint = { ...draft, consistency: report.consistency };
    atomicWriteFsync(this.file(work_id, checkpoint_id), JSON.stringify(checkpoint));

    if (this.emitEvent) {
      const payload = {
        checkpoint_id,
        event_seq: at_seq,
        state_digest: checkpoint.state_digest,
        consistency: checkpoint.consistency,
      };
      const eventDraft: WorkEventDraft = {
        kind: "WorkEvent",
        schema_version: WORK_EVENT_SCHEMA_VERSION,
        tenant_id: DEFAULT_TENANT_ID,
        event_id: `evt_${randomUUID()}`,
        work_id,
        type: "checkpoint.created",
        type_version: 1,
        occurred_at: created_at,
        actor: { kind: "PLATFORM", id: "v4-m02-checkpoint" },
        correlation_id: checkpoint_id,
        payload,
        payload_digest: computePayloadDigest(payload),
        prev_event_digest: "GENESIS",
        event_digest: "0".repeat(64),
      };
      await this.ledger.append(work_id, [eventDraft], { expected_head_seq: head });
    }

    return checkpoint;
  }

  async get(checkpoint_id: string): Promise<Checkpoint | undefined> {
    if (!isValidId("checkpoint", checkpoint_id)) return undefined;
    // Scan work dirs — checkpoint ids are unique; we refuse to use non-grammar ids as paths.
    const worksRoot = resolveUnderRoot(this.root, "works");
    if (!existsSync(worksRoot)) return undefined;
    for (const work_id of readdirSync(worksRoot)) {
      if (!isValidId("work", work_id)) continue;
      const p = this.file(work_id, checkpoint_id);
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as Checkpoint;
    }
    return undefined;
  }

  async latestConsistent(work_id: string): Promise<Checkpoint | undefined> {
    requireId("work", work_id);
    const dir = this.dir(work_id);
    if (!existsSync(dir)) return undefined;
    let best: Checkpoint | undefined;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const id = name.slice(0, -".json".length);
      if (!isValidId("checkpoint", id)) continue;
      const cp = JSON.parse(readFileSync(resolveUnderRoot(dir, name), "utf8")) as Checkpoint;
      if (cp.consistency !== "VERIFIED") continue;
      if (!best || cp.event_seq > best.event_seq || (cp.event_seq === best.event_seq && cp.created_at > best.created_at)) {
        best = cp;
      }
    }
    return best;
  }

  /** Recovery helper: layer 3 is stripped so callers cannot depend on it (INV-CKPT-02). */
  withoutContextHint(cp: Checkpoint): Checkpoint {
    const { context_hint: _ignored, ...rest } = cp;
    void _ignored;
    return rest;
  }

  openEffectIds(cp: Checkpoint): string[] {
    return openEffects(cp);
  }
}
