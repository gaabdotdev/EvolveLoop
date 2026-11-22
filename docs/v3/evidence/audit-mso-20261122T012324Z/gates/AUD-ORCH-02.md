# AUD-ORCH-02 — Transições MSO ilegais + outbox PENDING_DISPATCH (mesma txn)

**Status:** PASS  
**UTC:** 2026-11-22T02:02:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

MSO rejeita saltos ilegais (ex.: INIT→TRUE-FULL-PASS); outbox grava
`PENDING_DISPATCH` (+ transição DELEGATING opcional) na **mesma** `BEGIN IMMEDIATE`
antes de qualquer spawn.

## Wiki grounding

- GAP EvolveLoop ORCH na wiki; prova = código + vitest.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| B1 | `mso/states.ts:22` `MSO_TRANSITIONS` | **REAL** | Matriz hardcoded 10 estados. |
| B2 | `mso/states.ts:39` `canTransitionMso` | **REAL** | Edges inválidas → false. |
| B3 | `store.ts` `transitionMso` | **REAL** | Throw `MsoError` em skip ilegal. |
| B4 | `store.ts:1012` `enqueuePendingDispatch` | **REAL** | `withTransaction`: MSO→DELEGATING + INSERT outbox `PENDING_DISPATCH`. |

## Testes

`v0-orch-persistence`: matriz exaustiva + outbox ordered ASC + stale fencing bloqueia enqueue.

## Veredito

**PASS** — ilegal rejeitado; outbox durável na mesma txn pré-spawn.
