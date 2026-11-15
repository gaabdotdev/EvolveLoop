# Orchestrator directive — M19 integrate M17 early

**To:** M19 (`feature/v4-integration`)  
**Tip:** `69d15ce` from `/home/gaab/Downloads/EvolveLoop-v4-m17` (`feature/v4/m17-benchmarks-early`)

## Procedure

1. PATH with nvm node.
2. `git merge --no-ff 69d15ce` (or full hash from worktree HEAD if tip moved only by docs pin).
3. `cd orchestrator && npx vitest run tests/v4` must pass (expect ≈306).
4. Update `INTEGRATION-STATUS.md`; commit.
5. Do **not** launch M09 for L2/L3 score routing — M08 methodology remains PROVISIONAL per M17.
6. No V3.7 edits; no APPROVED claim.
