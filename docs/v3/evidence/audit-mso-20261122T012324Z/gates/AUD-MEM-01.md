# AUD-MEM-01 — Isolamento projeto A/B + provenance fields

**Status:** PASS  
**UTC:** 2026-11-22T02:04:29Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Provar isolamento rígido `project_id` entre projetos A/B e presença dos
campos de proveniência (`source`, `created_at`, `status`, `valid_from`/
`valid_to`/`superseded_by`).

## Wiki grounding

- Scout/search EvolveLoop AUD-MEM → **no_hits** (GAP).
- Contrato = brief MSO AUD-MEM-BATCH + código verificado.

## Achados (path:linha)

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| A1 | `memory/broker.ts` `assertProject` ~L194 | **REAL** | Cross-project → `PROJECT_ISOLATION`. |
| A2 | `MemoryBroker` constructor + `propose` | **REAL** | Broker fixa `project_id`; propose grava provenance. |
| A3 | `tests/unit/v0-adapt-memory.test.ts` V0-MEM-02 | **REAL** | A/B isolation + provenance asserts. |
| A4 | `tests/unit/audit-mem-01-06.test.ts` AUD-MEM-01 | **REAL** | proj-A/proj-B shared DB; beta invisível a alpha. |

## Testes

`audit-mem-01-06` + `v0-adapt-memory` — ver `AUD-MEM-tests.txt` EXIT_CODE=0.

## Veredito

**PASS** — isolamento A/B e provenance fields comprovados.
