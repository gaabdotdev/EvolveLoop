# MEM-01 — Memory Consolidation Engine

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Consolidação: 20+ episódios, sem duplicação, link rastreável à evidência
- **test_file:** `orchestrator/tests/unit/v2-mem-01-consolidation.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-mem-01-consolidation.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Extração com `evidence_ids` / `source_episode_ids`.
- Dedupe exact → skip; near-dupe → update; status sempre `PROPOSED`.
- `runOnce` idempotente; fallback heuristic se Ollama falha.
- Background runner start/stop sem wall-clock.
- **20+ episódios (22+1 dup):** 22 creates + 1 skip exact; links de evidência preservados.

## LIMITATION

Batch determinístico offline satisfaz o quantitativo §4.3; sessão longa live do produto não corrida.

## Revalidation (20261121T224251Z)
- vitest v2-*.test.ts exit: 0
- status: PASS_UNIT
