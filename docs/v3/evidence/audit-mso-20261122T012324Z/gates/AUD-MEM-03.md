# AUD-MEM-03 — valid_to/superseded_by + PROPOSED gate

**Status:** PASS  
**UTC:** 2026-11-22T02:04:29Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Memórias nascem `PROPOSED` (sem auto-promote); supersede define
`valid_to` + `superseded_by`; search default exclui expired.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| C1 | `broker.propose` status `PROPOSED` | **REAL** | Writers nunca criam ACTIVE. |
| C2 | `broker.promote` + `promotion-gate.ts` | **REAL** | Gate actor required; deny → `MemoryPromotionError`. |
| C3 | promote com `supersede_memory_id` | **REAL** | Prior → SUPERSEDED + valid_to + superseded_by. |
| C4 | search `valid_to IS NULL` | **REAL** | Default filter; `include_expired` opt-in. |

## Testes

`audit-mem-01-06` AUD-MEM-03 + `v0-adapt-memory` V0-MEM-03 — EXIT_CODE=0.

## Veredito

**PASS** — temporal + PROPOSED gate comprovados.
