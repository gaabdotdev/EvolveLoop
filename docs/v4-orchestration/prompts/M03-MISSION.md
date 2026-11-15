# META M03 — Effect Ledger (initial)

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m03` |
| Branch | `feature/v4/m03-effect-ledger` |
| Ownership | `orchestrator/src/v4/effects/**` |
| Chapters | 4.4, 7.3, 5, 12 |
| ADRs | 0008 |

## Implement

- Effect records: COMMITTED / REJECTED / UNKNOWN / NOT_EXECUTED
- Idempotency keys when available; dedup; no blind retry on UNKNOWN
- Audit identity/authorization/observed result

## Accept

Restart/crash/handoff does not improperly repeat external ops; UNKNOWN reconciled or blocked for intervention.
