# QUAL-02 — Selective Mutation Testing

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Mutation testing seletivo: testes superficiais rejeitados pelo Evidence Validator
- **test_file:** `orchestrator/tests/unit/v2-qual-02-mutation.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-qual-02-mutation.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Mutator seletivo: boolean_flip/boundary/return_null; fora do path → skip.
- Battery: testes fortes → PASS score=1; superficiais → WEAK_TESTS.
- Evidence Validator bloqueia TRUE_FULL_PASS se mutation_gate fraco/ausente; permite se threshold ok.
- Determinismo de mutant_id.

## LIMITATION

Mutantes sintéticos em fixtures — não mutação do código gerado por agente live. Critério de rejeitar testes superficiais via Evidence Validator satisfeito no harness.
