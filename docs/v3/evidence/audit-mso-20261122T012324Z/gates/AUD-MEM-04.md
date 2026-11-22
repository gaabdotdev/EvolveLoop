# AUD-MEM-04 — Golden queries Recall@5 / Precision@5 (BM-08)

**Status:** PASS  
**UTC:** 2026-11-22T02:04:29Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Memory Eval Suite: Recall@5 ≥ 0.85, Precision@5 ≥ 0.80, 0% INVALIDATED
vigentes (BM-08 = quality gate de retrieval).

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| D1 | `memory/memory-eval.ts` | **REAL** | recallAtK / precisionAtK / suite gates. |
| D2 | `fixtures/v2-mem-03-golden-queries.json` | **REAL** | Golden queries versionadas. |
| D3 | `v2-mem-03-memory-eval.test.ts` | **REAL** | Suite PASS com honesty=reported. |
| D4 | `audit-mem-01-06` AUD-MEM-04 | **REAL** | Revalida limiares 0.85/0.80. |

## LIMITATION

Métricas contra fixture retriever (não índice RAG live). Honesty explícita.

## Veredito

**PASS** — BM-08 / Recall@5 / Precision@5 satisfeitos no harness.
