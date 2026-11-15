# META M07 — Dynamic Planning Engine

Read `WAVE4-COMMON.md` first.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m07` |
| Branch | `feature/v4/m07-planning` |
| Ownership | `orchestrator/src/v4/planning/**` + `orchestrator/tests/v4/planning/**` |
| Contracts | FROZEN — Task graph, Goal Contract, Work events; ports as published |
| Chapters | §4.7 planning / dynamic replan (constitution) |

## Implement

1. Plan / replan Task graphs from an ACCEPTED Goal Contract + current Work projection (compose M01/M02 ports — do not rewrite them).
2. Honor INV-TASK-* (deps, no cycles, progress honesty — executors cannot set VERIFIED).
3. Dynamic replan must append typed events (allowlist payloads; R2); never mutate history.
4. Plans are proposals until accepted into Work via existing M01 command paths / events — do not invent a parallel Work store.
5. Do not route by capability scores (M08/M09). Planning may *request* profiles later but must not rank executors by invented scores.

## Accept

Tests cover plan + replan + invariant refusals; delivery under `planning/`. DELIVERED for orchestrator. No merge. No npm install. No V3.7 edits.
