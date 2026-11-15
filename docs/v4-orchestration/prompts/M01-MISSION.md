# META M01 — Goal Compiler & Work State

Leader for V4.0 Work Substrate. **Start only if** `docs/v4/architecture/CONTRACT-FREEZE.md` says FROZEN (or orchestrator waiver).

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m01` |
| Branch | `feature/v4/m01-goal-work` |
| Ownership | `orchestrator/src/v4/goal/**`, `orchestrator/src/v4/work/**` |
| Contracts | `orchestrator/src/v4/contracts/` (FROZEN import only) |
| Chapters | 4.1, 4.2, 5, 7.1 |

## Implement

- Intent ingestion → versioned Goal Contract (ambiguity/contradiction detection; visible premises; minimal questions)
- Work aggregate with stable identity; progress CONFIRMED/ATTEMPTED/HYPOTHESIS/UNKNOWN/UNVERIFIED
- Task graph + dependencies per contracts
- Persist/query Work without chat memory

## Accept

Intent becomes executable Goal Contract; Work is queryable without agent conversation. Tests + delivery report. No merge to integration. No V3.7 cert edits. No npm install.
