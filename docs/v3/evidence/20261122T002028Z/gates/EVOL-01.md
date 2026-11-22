# V3-EVOL-01 — Self-Improvement Pipeline + Shadow Replay Histórico

- **STATUS:** PASS_UNIT
- **task:** M17-V3-EVOL-01-SHADOW-REPLAY (tentativa 1/3)
- **critério (plano §5.4):** 3 candidatos (benéfico, neutro, regressão sutil) → só benéfico passa; rollback em 1 comando
- **API:** `EvolutionPipeline.shadowReplay(candidates, historicalEvents)`
- **rollback_command:** `evolution.rollbackProduction()`
- **honesty:** fixture historical corpus (não event-store live)
- **PASS_LIVE:** not claimed
- **Vitest:** `npx vitest run tests/unit/v3-evol-01-shadow-replay.test.ts` EXIT=0 (7/7)
- **Regression EVOL:** v3 + v2 EXIT=0 (17 passed)
- **Probe:** `host-probe.json`
