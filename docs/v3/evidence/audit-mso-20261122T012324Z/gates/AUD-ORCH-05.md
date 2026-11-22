# AUD-ORCH-05 — Delta Grill-Me STALE + SIGTERM seletivo

**Status:** PASS  
**UTC:** 2026-11-22T02:02:51Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Delta contract v1→v2 imutável; tasks obsoletas CANCELLED via SIGTERM seletivo;
evidence marcada STALE.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| E1 | `grill-me/delta.ts:75` `applyDeltaGrillMe` | **REAL** | Versões imutáveis; killFn SIGTERM. |
| E2 | `grill-me/delta.ts:180` `listStaleEvidence` | **REAL** | Evidence status STALE. |
| E3 | Teste | **REAL** | kill mock `{pid, signal:'SIGTERM'}`; task-c2 CANCELLED; ev-old STALE. |

## Limitações

- Kill via `killFn` injectável (mock no unit test) — não envia SIGTERM a PID real do host.
- Semântica de seleção = lista `obsolete_task_ids` / `running[]` fornecida pelo caller.

## Testes

`v1-orch-03-delta-grill` — 1 passed.

## Veredito

**PASS** — STALE + SIGTERM seletivo (mock) comprovados.
