# V3-MEM-05 Evidence — Bi-Temporal Graph

- **ts:** 20261121T231215Z
- **task:** M5-V3-MEM-05-BITEMPORAL (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T231215Z`
- **prereq V3-MEM-01:** PASS (`docs/v3/evidence/20261121T225051Z`) — not reopened
- **prereq V3-MEM-02:** PASS (`docs/v3/evidence/20261121T225535Z`) — not reopened
- **prereq V3-MEM-03:** PASS (`docs/v3/evidence/20261121T230044Z`) — not reopened
- **prereq V3-MEM-04:** PASS (`docs/v3/evidence/20261121T230709Z`) — not reopened
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop; search bitemporal/valid time → hits genéricos gaabwiki-memory (GAP). Contrato = brief MSO M5-V3-MEM-05 + padrões MEM-01..04 / HybridGraphStore.

## Implementação

| Peça | Path |
|------|------|
| Bi-temporal graph | `orchestrator/src/v3/memory/bitemporal-graph.ts` |
| Exports | `orchestrator/src/v3/memory/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-mem-05-bitemporal.test.ts` |

### Contrato mínimo fechado

- `assertFact({ subject, predicate, object, valid_from, valid_to, tx_time, payload })` — valid time ≠ transaction time
- `invalidate(fact_id, tx_time)` — fecha intervalo de transaction time (`tx_until`); preserva valid time
- `supersede({ fact_id, tx_time, replacement })` — invalida prior + assert da substituição (`SUPERSEDED` + `superseded_by`)
- `queryPointInTime(T | { valid_at, as_of? })` → fatos com `valid_from ≤ T < valid_to` **e** `tx_time ≤ as_of < tx_until`
- Intervalos half-open; ordem estável (subject, predicate, object, fact_id)
- Persistência SQLite (`better-sqlite3`, `:memory:` nos testes)

### Cenários point-in-time cobertos

1. Fato tardio (`tx_time` ≫ `valid_from`) invisível com `as_of < tx_time` mesmo para T no intervalo válido
2. Invalidate: reconstrução com `as_of` anterior ainda vê o fato; posterior não
3. Supersede: PIT antes/depois da tx mostra object antigo vs novo
4. `valid_to` exclusivo; filtros por predicado; helpers `isValidAt` / `isKnownAsOf`

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-MEM-05 | `npx vitest run tests/unit/v3-mem-05-bitemporal.test.ts` | **0** | `vitest-v3-mem-05.txt` / `.log` / `.exit` |
| Regressão MEM-01..04 | `npx vitest run tests/unit/v3-mem-0{1,2,3,4}*.test.ts` | **0** | `vitest-regression-mem.txt` / `.exit` |

## STATUS

**PASS**
