# AUD-ORCH-SUMMARY — AUD-ORCH-01..06

**UTC:** 2026-11-22T02:02:51Z  
**Evidence root:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Batch:** MSO AUD-ORCH-BATCH tentativa 1/3  
**Overall:** PASS

## Per-meta

| ID | Status | Prova principal |
|----|--------|-----------------|
| AUD-ORCH-01 | PASS | WAL/FULL/busy + `integrity_check=ok` + fencing stale |
| AUD-ORCH-02 | PASS | Matriz MSO ilegal + outbox PENDING_DISPATCH mesma txn |
| AUD-ORCH-03 | PASS | Daemon UDS multi-cliente; TTY real = limitação documentada |
| AUD-ORCH-04 | PASS | SIGKILL orphans=0; UNKNOWN dirty; saga compensations |
| AUD-ORCH-05 | PASS | Delta Grill-Me STALE + SIGTERM seletivo (killFn) |
| AUD-ORCH-06 | PASS | File-ownership + syntactic_ratio≥0.9 + DST 10k 0/0 |

## Vitest

Arquivo: `gates/AUD-ORCH-tests.txt`

```
Test Files  10 passed (10)
Tests       51 passed (51)
EXIT_CODE=0
```

Suites: `v0-orch-persistence`, `v0-orch-runtime`, `v0-chaos-reconciler`,
`v1-orch-01-daemon-uds`, `v1-orch-03-delta-grill`,
`v2-orch-01-file-ownership`, `v2-orch-02-merge-queue`, `v2-orch-02-live-corpus`,
`v2-orch-03-idempotency-saga`, `v3-test-02-dst`.

## Código tocado neste batch

- `StateDb.integrityCheck()` + `assertWalPragmas` exige integrity=ok
- Teste persistence actualizado para AUD-ORCH-01

## Diffstat

`gates/AUD-ORCH-diffstat.txt`

## Wiki

- Grounding: search EvolveLoop ORCH — **GAP** no corpus.
- Precedência: código verificado > wiki.
- Vault: append `EvolveLoop/log.md`.
