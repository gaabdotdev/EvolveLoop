# INT-02 — Laya Decision Engine + offline benchmark

- **STATUS:** INSUFFICIENT_FOR_EXIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Benchmark Decision Engine (Laya): precisão roteamento, calibração, 0% invenção, abstain
- **test_file:** `orchestrator/tests/unit/v2-int-02-laya-benchmark.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-int-02-laya-benchmark.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Host pluggable: registo/swap; fallback de stub Laya → baseline.
- Laya offline `ENGINE_STUB` abstain; client mock seleciona da lista.
- Benchmark offline pt-BR+en: `invention_count=0`, `calibration_ok`, abstention_rate>0, verdicts `PLUGGABLE_KEEP_BASELINE` / `ADOPT_LAYA`.
- Invenção no candidato → keep baseline.

## LIMITATION

§4.2 exige benchmark Laya em **tarefas reais** do EvolveLoop (pt/en). Suite é **offline/fixtures/stubs**. Matriz §6 «Laya calibrado» **não** exercida live.
