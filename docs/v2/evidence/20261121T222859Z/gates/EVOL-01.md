# EVOL-01 — Evolution Pipeline (observation-first)

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Evolution pipeline observation-first (pré-requisito; Shadow Replay live = V3)
- **test_file:** `orchestrator/tests/unit/v2-evol-01-evolution-pipeline.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-evol-01-evolution-pipeline.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Proposals só após limiar de rework; campos version/diff/parent.
- Validate: accept (beneficial) vs reject (regression) + rollback_plan.
- Não quebra crystallizer V1 (0-token path na 4ª execução).

## LIMITATION

Shadow Replay 3 candidatos live é meta **V3** (§5.4) — fora do escopo; não marcar exit V3.
