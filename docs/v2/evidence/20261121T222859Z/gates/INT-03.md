# INT-03 — Agent Intelligence Profiles

- **STATUS:** PASS_UNIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Agent Intelligence Profiles: redução de rework vs roteamento estático
- **test_file:** `orchestrator/tests/unit/v2-int-03-agent-profiles.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-int-03-agent-profiles.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Agregação observacional (TFP rate, rework, latency/tokens) com honesty reported/UNAVAILABLE.
- Roteamento `profile` vs `static_fallback` (sample_below_min).
- Penalidade de rework altera score; preferência low-rework.
- `StaticRouteDelta` quando profile ≠ static.

## LIMITATION

§4.2 pede redução de rework vs estático em carga real. Unitário prova mecânica offline — **sem** medição live de taxa de rework (GAP; não inventado).
