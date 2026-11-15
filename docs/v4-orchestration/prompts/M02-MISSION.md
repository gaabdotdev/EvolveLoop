# META M02 — Event Ledger, Persistence & Checkpoints

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m02` |
| Branch | `feature/v4/m02-ledger-checkpoints` |
| Ownership | `orchestrator/src/v4/ledger/**`, `checkpoint/**`, `artifacts/**` (+ V3.7 ledger adapter stubs) |
| Chapters | 4.1, 5, 6, 7.1, 7.2 |
| ADRs | 0003, 0004, 0005, 0015 |

## Implement

- Versioned Work Events; append semantics + hash chain per ADR-V4-0003
- Checkpoints/snapshots recoverable; reconcile state/events/artifacts/effects
- Documented transactional guarantees; crash recovery tests
- Canonical ids at trust boundaries

## Accept

Recovered state consistent with events/artifacts; controlled failures do not destroy confirmed progress within declared guarantees.
