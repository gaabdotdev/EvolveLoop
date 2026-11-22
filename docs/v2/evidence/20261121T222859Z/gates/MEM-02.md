# MEM-02 — Hybrid Graph (2 hops)

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Grafo híbrido 2 saltos: precisão consultas AST/LSP × decisões SQLite
- **test_file:** `orchestrator/tests/unit/v2-mem-02-hybrid-graph.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-mem-02-hybrid-graph.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Expand 2 hops: decision + test via DEPENDS_ON.
- Isolamento `project_id`.
- Ordenação estável multi-hit; empty expansion; import extraction determinística.

## LIMITATION

Grafo em SQLite `:memory:` / fixtures — não consulta AST/LSP live do monorepo sob carga.
