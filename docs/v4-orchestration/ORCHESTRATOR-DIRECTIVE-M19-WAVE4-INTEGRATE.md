# Orchestrator directive — M19 Wave 4 integrate (first cut)

**When:** after M07 + M08 are orchestrator-ACCEPTED  
**To:** M19 on `feature/v4-integration`

## Tips (order)

| Order | Meta | Tip | Ownership |
|------:|------|-----|-----------|
| 1 | M07 | `0e9b581` (`/home/gaab/Downloads/EvolveLoop-v4-m07`) | `planning/**` |
| 2 | M08 | `13fac49` (`/home/gaab/Downloads/EvolveLoop-v4-m08`) | `capability/**` |

Merge `--no-ff` full hashes from worktrees. Ownership should be disjoint.

## After merge

`npx vitest run tests/v4` green; update `INTEGRATION-STATUS.md`.  
Do **not** launch M09 until M08 methodology + M17 baseline ACCEPTED.  
Do **not** claim V4 APPROVED (G17).
