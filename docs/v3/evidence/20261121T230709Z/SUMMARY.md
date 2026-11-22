# V3-MEM-04 Evidence — Local Multi-Hop Synthesis

- **ts:** 20261121T230709Z
- **task:** M4-V3-MEM-04-MULTIHOP (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T230709Z`
- **prereq V3-MEM-01:** PASS (`docs/v3/evidence/20261121T225051Z`) — not reopened
- **prereq V3-MEM-02:** PASS (`docs/v3/evidence/20261121T225535Z`) — not reopened
- **prereq V3-MEM-03:** PASS (`docs/v3/evidence/20261121T230044Z`) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; search multi-hop/MEM-04 → hits genéricos gaabwiki-memory (GAP). Contrato = brief MSO M4-V3-MEM-04 + HybridGraphStore (V2-MEM-02).

## Implementação

| Peça | Path |
|------|------|
| Multi-hop synthesis | `orchestrator/src/v3/memory/multi-hop-synthesis.ts` |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-04-multihop.test.ts` |

### Contrato mínimo fechado

- `expandGraph(store, start_file, hops)` → BFS no `HybridGraphStore`; evidências File/Decision/Test/Symbol com ordem estável (hops ASC, kind ASC, node_id ASC)
- `synthesizeLocal` → Ollama `/api/generate` quando probe `/api/tags` OK; senão stub determinístico
- `runMultiHopSynthesis` → expand + synthesize → dossiê
- STATUS documentados:
  - `CLOSED_OLLAMA`
  - `CLOSED_DETERMINISTIC_STUB` (offline obrigatório / CI)
  - `OPEN_INSUFFICIENT_EVIDENCE`
- Sem Frontier: dossiês fechados localmente

## Live Ollama (opcional)

Fonte: stdout em `vitest-v3-mem-04.txt`

| Campo | Valor |
|-------|-------|
| probe `/api/tags` | **OK** (`bonsai-64k:latest`) |
| generate | `generate_empty_response` (~500ms) → fallback stub |
| MEM04_LIVE_STATUS | `CLOSED_DETERMINISTIC_STUB` (dossiê ainda **closed**) |

### LIMITATION

Probe tags OK, mas `/api/generate` devolveu `response` vazio nesta corrida. Path `CLOSED_OLLAMA` é coberto offline com fetch injectado (reasoning-only `<think>` → close com citações). Live generate vazio **não** é inventado como PASS_OLLAMA.

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-04 | `npx vitest run tests/unit/v3-mem-04-multihop.test.ts` | **0** | `vitest-v3-mem-04.txt` / `.log` / `.exit` |
| Regressão MEM-01..03 | `npx vitest run tests/unit/v3-mem-0{1,2,3}*.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
