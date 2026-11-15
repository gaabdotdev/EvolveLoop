# ADR-V4-0004 — Persistence guarantees

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (guarantees); M02 (storage) |
| Constitution | §6.1, §15.1 estado inconsistente, §15.2 Persistência |
| M18 | F07, F13, D19 |
| Contracts | `EventLedgerPort`, `ArtifactStorePort`, `CheckpointStorePort` |

## Context

§15.2: which transactional guarantees between state, events, checkpoints and artifacts?

No exactly-once (constitution §14). V3 uses atomic JSON rename + JSONL append, without a cross-store transaction. V4 must declare what *is* guaranteed so M02 does not invent a distributed DB, and so crash tests have an oracle.

## Decision

**Write-ahead log + content-addressed artifacts. No cross-object ACID transaction spanning external systems.**

| Pair | Guarantee |
|------|-----------|
| Event batch | Atomic per-work append (all drafts or none). Optimistic concurrency (`expected_head_seq`). |
| Event → projection | Log is source of truth. Projection lag is allowed; recovery rebuilds. A projection must never be ahead of the log. |
| Artifact → event | **Write-then-reference:** `ArtifactStorePort.put` completes (bytes durable, hash verified) *before* `artifact.registered` is appended. An event never cites a missing hash. |
| Checkpoint | Created at a log seq that already exists. `state_digest` covers projected state at that seq. Consistency `VERIFIED` only after M02 reconciliation of events, artifacts, open effects (INV-CKPT-*). |
| Fencing | Appends that carry a stale V3.7 `fencing_epoch` return `FENCED` (reuse `V37LeaseFencingPort`). Epoch high-watermark is durable and **not** caller-settable (F13). |
| Restore | Restore of data-dir cannot resurrect consumed grants or COMMITTED→uncommitted effects (D19). Mechanism (monotonic tombstones outside restored set, or reconcile-on-restore) is M02+M03+M10. |
| Secrets | Backups that include CP tokens/keys are secret-bearing (D19). Event payloads and capsules must not contain secret material (F11). |

Durability class for V4.0: **fsync of the log record + artifact blob** on the Control Plane host. Cross-host replication is V3.7 fabric's problem for workers, not a second V4 consensus layer.

## Consequences

- Crash between artifact put and event append: orphan blob (acceptable; GC by M02).
- Crash between event append and projection: rebuild.
- Crash during artifact put: no event, incomplete blob discarded (content-address detects).
- Consumers never assume a checkpoint exists for every event.

## Alternatives rejected

- **Distributed transaction (2PC) across ledger + artifact store + effect targets:** effect targets are external; constitution forbids exactly-once.
- **Event cites artifact hash before bytes exist:** recovery cannot fetch; breaks INV-CKPT-03.

## Residual uncertainty

Backup encryption and restore-reconciliation procedure: M02 design, reviewed by M18. Decision date: before Phase 2 exit (crash tests need it).
