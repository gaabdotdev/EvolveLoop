# V3-MEM-02 Evidence — Hierarchical Pyramid Index (RAPTOR)

- **ts:** 20261121T225535Z
- **task:** M2-V3-MEM-02-RAPTOR-PYRAMID (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T225535Z`
- **prereq V3-MEM-01:** PASS (`docs/v3/evidence/20261121T225051Z`) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; search RAPTOR/pyramid → no_hits (GAP). Contrato = metas V3 §2.1 V3-MEM-02 + plano §5.1 (p95 coarse-to-fine) + brief MSO.

## Implementação

| Peça | Path |
|------|------|
| Pyramid index | `orchestrator/src/v3/memory/pyramid-index.ts` |
| Schema / types mínimos | `PYRAMID_SCHEMA_VERSION`, `PYRAMID_SCHEMA_SQL`, níveis N0..N3 |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-02-pyramid.test.ts` |

### Contrato mínimo fechado

- `buildPyramid(events)` → nós N0 Bruto → N1 Episódico → N2 Módulo/Marco → N3 Projeto com links pai/filho
- `searchCoarseToFine(query)` → começa N3/N2, refine até N0; retorna `hits` + `path` + `latency_ms` real
- Scoring léxico determinístico + índice invertido por nível (sem LLM)
- MEM-01 / V2-MEM não alterados funcionalmente (apenas re-export no barrel `index.ts`)

## Latência (medição real)

Fonte: `p95.json` / stdout em `vitest-v3-mem-02.txt`

| Métrica | Valor |
|---------|-------|
| FIXTURE_N0 | 1200 |
| FIXTURE_NODES (N0..N3) | **1358** |
| samples | 40 |
| p50_ms | 0.402 |
| **p95_ms** | **0.77** |
| max_ms | 1.775 |
| meta plano §5.1 | p95 &lt; 200 ms |

### LIMITATION

Plano §5.1 Suíte E cita **100k+ eventos**. Neste slice a prova é fixture **≥1k nós** da pirâmide com medição real de p95. Escala 100k fica deferida (fora do budget unitário) — **não inventada**.

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-02 | `npx vitest run tests/unit/v3-mem-02-pyramid.test.ts` | **0** | `vitest-v3-mem-02.txt` / `.log` / `.exit` |
| Regressão MEM-01 + V2-MEM | `npx vitest run tests/unit/v3-mem-01-cold-storage.test.ts tests/unit/v2-mem-*.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
