# ORCH-04 — Dynamic Backpressure

- **STATUS:** INSUFFICIENT_FOR_EXIT
- **plano:** §4 / matriz §6 linha V2
- **critério (plano):** Backpressure: redução automática de concorrência sob rate-limit/VRAM sem OOM
- **test_file:** `orchestrator/tests/unit/v2-orch-04-backpressure.test.ts`
- **comando:** `cd orchestrator && npx vitest run tests/unit/v2-*.test.ts` (ficheiro: v2-orch-04-backpressure.test.ts)
- **exit:** 0 (suite completa v2-*.test.ts)
- **log:** `docs/v2/evidence/20261121T222859Z/vitest-v2-unit.log` / tracked twin: `vitest-v2-unit.txt`
- **ts:** 20261121T222859Z

## Asserts cobertos (determinísticos / unit)

- Saturacão rate-limit → reduz `max_in_progress`.
- Telemetria VRAM/CPU alta → reduce.
- Recovery para ceiling com sinais saudáveis.
- Clamp floor/ceiling.
- `scheduleReadyTasks` respeita policy pós-backpressure.
- Mid-band rate-limit → hold.

## LIMITATION

§4.1 exige saturação real de rate-limit/VRAM e prova de **sem crashes OOM**. Unitário só injecta telemetria sintética — sem carga GPU/processo live.
