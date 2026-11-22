# AUD-ORCH-06 — File-ownership + AST merge ≥90% + DST 0 deadlock/split-brain

**Status:** PASS  
**UTC:** 2026-11-22T02:02:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Locks de ownership impedem overlap; merge AST/syntactic ratio ≥ 0.9;
DST ≥10_000 cenários com 0 deadlock / 0 split-brain.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| F1 | `parallel/file-ownership-lock.ts` | **REAL** | `tryReserveTaskScope` + rollback parcial. |
| F2 | `parallel/scheduler.ts:44` | **REAL** | Integra locks no schedule. |
| F3 | `parallel/ast-aware-merge.ts:221` | **REAL** | Merge sintático disjoint. |
| F4 | `v2-orch-02-live-corpus` | **REAL** | 18/20 → ratio 0.9; post-merge test green. |
| F5 | `evaluation/deterministic-sim.ts:375` | **REAL** | `runScenarios(seed, 10000)` → deadlocks=0, split_brains=0. |

## Testes

- `v2-orch-01-file-ownership` (8)
- `v2-orch-02-merge-queue` (7)
- `v2-orch-02-live-corpus` (1)
- `v3-test-02-dst` (7) — 10k scenarios

## Veredito

**PASS** — ownership + AST≥90% + DST 0/0.
