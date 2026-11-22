# V3-MEM-03 Evidence — Active Pagination / Virtual Memory (MemGPT)

- **ts:** 20261121T230044Z
- **task:** M3-V3-MEM-03-MEMGPT-PAGING (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T230044Z`
- **prereq V3-MEM-01:** PASS (`docs/v3/evidence/20261121T225051Z`) — not reopened
- **prereq V3-MEM-02:** PASS (`docs/v3/evidence/20261121T225535Z`) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; search MemGPT/V3-MEM-03 → hits genéricos gaabwiki-memory (GAP). Contrato = brief MSO M3-V3-MEM-03 + código MEM-01/02.

## Implementação

| Peça | Path |
|------|------|
| Virtual memory | `orchestrator/src/v3/memory/virtual-memory.ts` |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-03-virtual-memory.test.ts` |

### Contrato mínimo fechado

- `memory_search(query)` → ids + resumo (sem page-in; RAM window inalterada)
- `memory_expand(id)` → page-in de SQLite (hot) ou CAS/Zstd (cold via `cas_hash`)
- `page_out` / `tombstone` → remove payload da janela RAM, deixa stub `[lápide:mem:…]`; sob pressão, stubs antigos são dropados (disco permanece)
- Orçamento de tokens da janela RAM **constante** sob histórico 100× (medido)

## Token budget 100× (medição real)

Fonte: `token-budget-100x.json` / stdout em `vitest-v3-mem-03.txt`

| Métrica | Valor |
|---------|-------|
| token_budget | 800 |
| baseline_n | 4 |
| scale | 100 |
| history_n | 400 |
| baseline_tokens | 656 |
| **final_tokens** | **795** |
| growth_ratio | 1.2119 |
| naive_full_history_tokens | 62245 |
| TOKEN_BUDGET_100X | **BOUNDED** |

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-03 | `npx vitest run tests/unit/v3-mem-03-virtual-memory.test.ts` | **0** | `vitest-v3-mem-03.txt` / `.log` / `.exit` |
| Regressão MEM-01 + MEM-02 | `npx vitest run tests/unit/v3-mem-01-cold-storage.test.ts tests/unit/v3-mem-02-pyramid.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
