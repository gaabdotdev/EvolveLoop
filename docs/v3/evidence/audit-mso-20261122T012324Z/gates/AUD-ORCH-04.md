# AUD-ORCH-04 — SIGKILL + reconciler (zombies=0, UNKNOWN dirty, saga)

**Status:** PASS  
**UTC:** 2026-11-22T02:02:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Kill de árvore (pgid) pós-SIGKILL → zero orphans; worktree dirty → UNKNOWN sem retry cego;
saga compensations no path UNKNOWN.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| D1 | `process-supervisor.ts:83` `cancelProcessTreeEscalating` | **REAL** | Escalates kill. |
| D2 | `process-supervisor.ts:136` `listOrphans` | **REAL** | `live.length === 0` pós-kill. |
| D3 | `mso/boot-reconciler` `decideReconcile` | **REAL** | dirty→UNKNOWN; clean→FAILED+auto_retry. |
| D4 | `idempotency/saga.ts:152` `reconcileWorkOnBootWithSaga` | **REAL** | Compensations em UNKNOWN. |

## Testes

- `v0-chaos-reconciler` (SIGKILL + orphans + UNKNOWN/FAILED)
- `v2-orch-03-idempotency-saga` (UNKNOWN → saga)
- `v0-orch-runtime` (runtime reconciler coverage)

## Veredito

**PASS** — zombies=0 no pgid owned; UNKNOWN dirty + saga exercitados.
