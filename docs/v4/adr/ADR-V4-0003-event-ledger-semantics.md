# ADR-V4-0003 — Event Ledger semantics

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (semantics); M02 (implementation) |
| Constitution | §5 Work Event, §6.1, §15.2 Event Ledger |
| M18 | **TM-V4-F07** (no tamper evidence / order / concurrency on V3 JSONL) |
| Contracts | `work-event.ts`, `EventLedgerPort` |

## Context

§15.2 asks: append-only puro, event sourcing seletivo, ou híbrido? Retenção/compactação?

V3 `event-log/store.ts` is append-only JSONL with no event id, sequence, hash chain or signature. WorkProof, time travel and provenance cannot be built on unverifiable history (F07).

## Decision

**Hybrid, with a strict split:**

| Layer | Role |
|-------|------|
| **Log** (authoritative) | Per-work append-only stream of `WorkEvent`. Never updated or deleted in place. |
| **Projections** (derived) | Work, Task, EffectRecord, etc. Rebuildable. Single-writer per aggregate (OWNERSHIP-MAP). |
| **Checkpoints** | High-water mark + state digest (ADR-V4-0005). Enable retention of *cold* events to archive **after** a VERIFIED checkpoint, without rewriting history. |

Event semantics (normative):

| Property | Rule |
|----------|------|
| Identity | `event_id` (`evt_` + grammar, ADR-V4-0015) |
| Order | per-work contiguous `seq` starting at 1. **Timestamps never order** (`occurred_at` / `recorded_at` are audit). No global total order. |
| Dedup | same `event_id` + same `payload_digest` → `DUPLICATE` (idempotent). Same id, different digest → `CONFLICT`. |
| Causality | `causation_id` / `correlation_id` (hints, not order). |
| Tamper-evidence | hash chain: seq 1 `prev_event_digest = GENESIS`; seq n cites seq n-1 `event_digest`. `event_digest = sha256(canonical JSON excluding event_digest)`. Independent verifiers (M06/M20) detect edit/delete/reorder. |
| Append atomicity | `EventLedgerPort.append` is all-or-nothing for a batch; optimistic concurrency via `expected_head_seq`; stale V3.7 fencing epoch → `FENCED`. |
| Projection atomicity | M02 must persist log **before** (or atomically with) projection. Crash between append and projection: rebuild from log. Never the reverse. |
| Retention | cold events older than a VERIFIED checkpoint may be archived; the chain of `event_digest`s for archived events is kept (or a checkpoint-anchored skip link — M02 RFC). Restore must not resurrect consumed grants/effects (M18 D19; M02+M03+M10). |
| Compaction | projections may be snapshotted; the log is not rewritten. |

Signing every event (per-event signatures) is **not** required in V4.0: the hash chain + Control Plane host integrity (ADR-V4-0016) is the V4.0 bar. Per-event signatures may be added in V4.3 if M18 requires them after adversarial suites.

## Consequences

- M02 implements the log; every other meta appends through `EventLedgerPort` only.
- `checkEventStream` is the consumer hook for INV-EVT-01/02/06.
- V3 JSONL stores are **not** the V4 ledger. Adapter may import historical V3 events as `x.m02.v3_imported` (non-authoritative) if needed.

## Alternatives rejected

- **Pure event sourcing with no projections:** recovery and Control Center would replay full JSONL (V3 hazard, F07/D09).
- **Pure CRUD + audit table:** cannot support time travel / WorkProof anchoring.
- **Global total order:** unnecessary; works are the isolation unit (ADR-V4-0014).
- **Per-event signatures in V4.0:** extra key-management surface before M10 identity is built. Hash chain is the justified default; signatures deferred with gate = M18 Phase 5 review.

## Residual uncertainty

Exact archive format and skip-link encoding: M02 RFC before V4.1 retention ships. Decision date: Phase 3 exit.
