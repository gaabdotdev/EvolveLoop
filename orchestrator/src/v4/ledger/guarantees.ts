/**
 * Documented transactional guarantees (ADR-V4-0004). This module is the oracle
 * crash tests assert against. It is not a distributed transaction manager.
 *
 * Residual R1: the hash chain is tamper-evidence (detects edit/delete/reorder
 * relative to the stored chain). It is NOT a signature and is NOT
 * non-repudiation. A consistent rewrite of the whole chain is Control Plane
 * host integrity (ADR-V4-0016), out of scope for INV-EVT-06.
 */

export const HASH_CHAIN_IS_NON_REPUDIATION = false;

export const TRANSACTIONAL_GUARANTEES = {
  event_batch: {
    pair: "Event batch",
    guarantee:
      "Atomic per-work append (all drafts or none). Optimistic concurrency via expected_head_seq.",
  },
  event_to_projection: {
    pair: "Event → projection",
    guarantee:
      "Log is source of truth. Projection lag is allowed; recovery rebuilds. A projection must never be ahead of the log.",
  },
  artifact_to_event: {
    pair: "Artifact → event",
    guarantee:
      "Write-then-reference: ArtifactStorePort.put completes (bytes durable, hash verified) before artifact.registered is appended. An event never cites a missing hash.",
  },
  checkpoint: {
    pair: "Checkpoint",
    guarantee:
      "Created at a log seq that already exists. state_digest covers projected state at that seq. consistency VERIFIED only after reconciliation of events, artifacts, and open effects (INV-CKPT-*).",
  },
  fencing: {
    pair: "Fencing",
    guarantee:
      "Appends that carry a stale V3.7 fencing epoch return FENCED. Epoch high-watermark is durable and not caller-settable (R7 / F13). Caller-supplied fencing_epoch is ignored as authority.",
  },
  restore: {
    pair: "Restore",
    guarantee:
      "Restore of a data-dir cannot resurrect consumed grants or COMMITTED→uncommitted effects (D19). Monotonic tombstones are merged (max/union) with the live set outside the restored tree.",
  },
  secrets: {
    pair: "Secrets",
    guarantee:
      "Event payloads must not contain secret material (F11). Backups of Control Plane tokens/keys are secret-bearing (D19) — this store never writes secrets.",
  },
  durability: {
    pair: "Durability class (V4.0)",
    guarantee:
      "fsync of the log record + artifact blob on the Control Plane host. No cross-object ACID spanning external systems. No exactly-once.",
  },
} as const;

export type CrashFailureMode =
  | "crash_after_artifact_put_before_event"
  | "crash_after_event_before_projection"
  | "crash_during_artifact_put"
  | "crash_during_event_batch"
  | "crash_after_verified_checkpoint";

export const CRASH_ORACLE: Record<
  CrashFailureMode,
  { confirmed_progress: "preserved" | "not_yet_confirmed"; leftover: string }
> = {
  crash_after_artifact_put_before_event: {
    confirmed_progress: "not_yet_confirmed",
    leftover: "orphan blob; GC-able; no event cites a missing hash",
  },
  crash_after_event_before_projection: {
    confirmed_progress: "preserved",
    leftover: "stale/missing projection cache; rebuild from log",
  },
  crash_during_artifact_put: {
    confirmed_progress: "not_yet_confirmed",
    leftover: "incomplete blob discarded (content-address detects); no event",
  },
  crash_during_event_batch: {
    confirmed_progress: "preserved",
    leftover: "tmp file ignored; committed jsonl unchanged (all-or-nothing batch)",
  },
  crash_after_verified_checkpoint: {
    confirmed_progress: "preserved",
    leftover: "latestConsistent returns the VERIFIED checkpoint; context_hint is not required",
  },
};

export const RETENTION_V40 = {
  cold_archive: false,
  skip_link: false,
  note: "Archive format and skip-link encoding are an M02 RFC before V4.1 retention. The log is not rewritten.",
} as const;
