# META M02 — delivery (Event Ledger, Persistence & Checkpoints)

| Field | Value |
|-------|-------|
| Branch | `feature/v4/m02-ledger-checkpoints` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` FROZEN with reservations |
| Ownership | `orchestrator/src/v4/ledger/**`, `checkpoint/**`, `artifacts/**`, `adapters/v37/ledger.ts` |
| Contracts | FROZEN — no catalog/schema edits |

## Grounding

Wiki: GAP (`WIKI_ROOT` unset). Contracts and ADRs from this repo only.

## Implemented

- Versioned `WorkEvent` log, atomic per-work append, hash chain (INV-EVT-01/02/06).
- Checkpoints with three layers; `latestConsistent` = VERIFIED only; recovery does not require `context_hint`.
- Write-then-reference artifacts; orphan GC; optional V3.7 ArtifactFabric adapter (delegates).
- Canonical ids at every store path (F08). Grant/approval/lease/correlation are not path components (R5).
- Durable fencing watermark; caller `fencing_epoch` is not authority (R7 / F13).
- Restore tombstones so consumed grants / terminal effects are not resurrected (D19).
- Documented crash oracle in `guarantees.ts` (ADR-V4-0004). No exactly-once. No non-repudiation claim (R1).
- M02-owned payloads typed; F12 names are not CONTROL (R2). `x.mNN.*` do not mutate projections.

## Not in this meta

- Archive / skip-link retention (Phase 3 RFC).
- M01 Work repository, M03 effect engine, M10 grants as first-class kinds.
- Merge to `feature/v4-integration`. V3.7 cert edits.

## Tests

`cd orchestrator && npx vitest run tests/v4/ledger tests/v4/checkpoint tests/v4/artifacts tests/v4/adapters tests/v4/contracts tests/v4/conformance`
