# QUAL-01 — Independent Review Gate

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Revisão independente: rejeitar auto-revisão mesmo agente/sessão
- **test_file:** `orchestrator/tests/unit/v2-qual-01-independent-review.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-qual-01-independent-review.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Soft/hard gate evaluateForPass.
- TRUE_FULL_PASS exige review independente; rejeita same-session.
- Evidence Validator bloqueia sem review válido; permite com review PASS independente.

## LIMITATION

Nenhuma para o critério «runtime rejeita auto-revisão» (§4.2 / §6).
