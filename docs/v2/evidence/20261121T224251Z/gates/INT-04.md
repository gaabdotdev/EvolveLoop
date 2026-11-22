# INT-04 — Delegated Authority Matrix

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Delegated authority: filho não excede orçamento/permissões do pai (pré-V3 Sub-MSO)
- **test_file:** `orchestrator/tests/unit/v2-int-04-delegated-authority.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-int-04-delegated-authority.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Grants / scopes / parent-child delegation bounds (8 tests EXIT 0 na suite).
- Escalação acima do delegado bloqueada.

## LIMITATION

Não é critério explícito da linha §6 V2; registado para rastreio §4/INT.

## Revalidation (20261121T224251Z)
- vitest v2-*.test.ts exit: 0
- status: PASS_UNIT
