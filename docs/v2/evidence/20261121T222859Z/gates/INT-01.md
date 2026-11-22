# INT-01 — StrictRuntimeDecisionEngine

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Decision engine: 0% invenção fora da lista; abstain sob ambiguidade
- **test_file:** `orchestrator/tests/unit/v2-int-01-decision-engine.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-int-01-decision-engine.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Seleção do melhor candidato da lista permitida.
- Rejeição de candidato inventado fora da lista (`rejected_out_of_list`).
- Abstain: `NO_CANDIDATES`, `POLICY_ABSTAIN`, `INSUFFICIENT_EVIDENCE`.
- `blocked` sob política.
- Consumers scheduler/mso/memory_broker partilham engine_id.

## LIMITATION

Gate de runtime determinístico offline. Não substitui calibração Laya live (ver INT-02).
