# AUD-MEM-SUMMARY — AUD-MEM-01..06 (+ BM-08/09)

**UTC:** 2026-11-22T02:04:29Z  
**Evidence root:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Batch:** MSO AUD-MEM-BATCH tentativa 1/3  
**Overall:** PASS

## Per-meta

| ID | Status | Prova principal |
|----|--------|-----------------|
| AUD-MEM-01 | PASS | Isolamento proj-A/B + provenance (`source`/`created_at`/temporal) |
| AUD-MEM-02 | PASS | `rebuildDerivedIndexes` FTS5+vec from `memory_entries` |
| AUD-MEM-03 | PASS | PROPOSED gate + `valid_to`/`superseded_by` |
| AUD-MEM-04 | PASS | Golden Recall@5≥0.85 Precision@5≥0.80 (**BM-08**) |
| AUD-MEM-05 | PASS | Sample N=500 + p95; 100k **NÃO_HABILITADO** (**BM-09**) |
| AUD-MEM-06 | PASS | Federated sanitize fail-closed 0% leak |

## Vitest

Arquivo: `gates/AUD-MEM-tests.txt`

```
Test Files  10 passed (10)
Tests       64 passed (64)
EXIT_CODE=0
```

Suites: `audit-mem-01-06`, `v0-adapt-memory`, `v1-mem-01`…`03`,
`v2-mem-01`…`03`, `v3-mem-01-cold-storage`, `v3-mem-07-federated-sanitize`.

## Honesty markers

- `COLD_SCALE_100K_THIS_SESSION = "NÃO_HABILITADO"`
- Prior 100k: `docs/v3/evidence/20261122T005507Z/gates/EXIT-03.md`

## Diffstat

`gates/AUD-MEM-diffstat.txt`

## Wiki

- Grounding scout/search: **no_hits** EvolveLoop AUD-MEM.
- GAP: contratos não sintetizados na wiki; precedência = código verificado.
