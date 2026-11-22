# MEM-03 — Memory Eval Suite

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Recall@5≥0.85, Precision@5≥0.80, 0% INVALIDATED vigentes
- **test_file:** `orchestrator/tests/unit/v2-mem-03-memory-eval.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-mem-03-memory-eval.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Suite fixtures: `passed=true`; Recall@5 ≥ 0.85; Precision@5 ≥ 0.80; `invalidated_return_rate=0` (honesty=reported).
- JSON golden queries carregável.
- Falha se recall baixo / INVALIDATED|STALE vigentes.
- Cálculo clássico Precision@K; honesty=estimated suportado.

## LIMITATION

Métricas contra **fixture retriever**, não índice RAG live. Números da matriz §6 satisfeitos em harness offline; retrieval live = LIMITATION (não inventar métricas live).

## Revalidation (20261121T224251Z)
- vitest v2-*.test.ts exit: 0
- status: PASS_UNIT
