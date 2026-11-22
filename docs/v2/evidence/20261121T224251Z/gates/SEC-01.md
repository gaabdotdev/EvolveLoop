# SEC-01 — Quarantine (tainted)

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Quarentena de itens tainted; bloqueio de promoção
- **test_file:** `orchestrator/tests/unit/v2-sec-01-quarantine.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-sec-01-quarantine.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- QuarantineStore: quarantine memory/action; isQuarantined; release por reviewer.
- `assertPromotionNotQuarantined` / `assertPromotionGate` bloqueiam promoção.
- MemoryBroker: dirty → quarantined; clean → promote ACTIVE.

## LIMITATION

Nenhuma. Critério de quarentena tainted da matriz §6 coberto deterministicamente.

## Revalidation (20261121T224251Z)
- vitest v2-*.test.ts exit: 0
- status: PASS_UNIT
