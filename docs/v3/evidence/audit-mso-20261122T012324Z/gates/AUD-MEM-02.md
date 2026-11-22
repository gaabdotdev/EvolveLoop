# AUD-MEM-02 — Rebuild FTS5/sqlite-vec from canonical

**Status:** PASS  
**UTC:** 2026-11-22T02:04:29Z  
**Evidence:** `docs/v3/evidence/audit-mso-20261122T012324Z/`  
**Tentativa:** 1/3

## Escopo

Índices derivados (FTS5 + sqlite-vec) reconstruíveis a partir da fonte
canónica `memory_entries` (META-MEM-002).

## Wiki grounding

- GAP wiki EvolveLoop; prova = código + vitest.

## Achados

| ID | Local | Classificação | Notas |
|----|-------|---------------|-------|
| B1 | `schema.ts` FTS5 `content='memory_entries'` | **REAL** | FTS é derivado; triggers AI/AD/AU. |
| B2 | `broker.ts` `rebuildDerivedIndexes` ~L280 | **REAL** | `INSERT INTO memory_fts(memory_fts) VALUES('rebuild')` + re-upsert vec. |
| B3 | `audit-mem-01-06` AUD-MEM-02 | **REAL** | Corrompe FTS (`delete-all`), rebuild restaura search; vec reindexado se disponível. |

## Testes

`audit-mem-01-06` + `v1-mem-01-hybrid-search` — EXIT_CODE=0.

## Veredito

**PASS** — rebuild explícito a partir do canónico; índices não são SSOT.
