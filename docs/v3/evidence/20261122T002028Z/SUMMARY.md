# V3-EVOL-01 Evidence — Shadow Replay Histórico (MSO M17)

- **ts:** 20261122T002028Z
- **task:** M17-V3-EVOL-01-SHADOW-REPLAY (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261122T002028Z`
- **wiki grounding:** pack EvolveLoop PACK_NOT_FOUND; search shadow-replay/EVOL-01 sem hits no vault. Contrato = metas V3 §2.4 + plano mestre §5.4 + brief MSO M17.

## Implementação

| Peça | Path |
|------|------|
| EvolutionPipeline.shadowReplay | `orchestrator/src/v3/evolution/pipeline.ts` |
| Export evolution | `orchestrator/src/v3/evolution/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-evol-01-shadow-replay.test.ts` |

### Contrato mínimo fechado

- `shadowReplay(candidates, historicalEvents)` — replay de corpus histórico vs projeções por candidato
- Gate estrito: só passa quem **supera** baseline (success↑ ou cost↓) **sem** regressão de segurança/custo
- 3 candidatos fixture: benéfico / neutro / regressão sutil → **só benéfico** em `passed`
- `promoteToProduction` recusado sem Shadow Replay pass
- Rollback em 1 comando: `evolution.rollbackProduction()` (`report.rollback()` / `pipeline.rollbackProduction()`)
- Honesty: corpus fixture shaped as historical events — **PASS_UNIT** (não claim de event-store live)

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-EVOL-01 | `npx vitest run tests/unit/v3-evol-01-shadow-replay.test.ts` | **0** | `vitest-v3-evol-01.txt` / `.log` / `.exit` |
| Regressão EVOL (v3 + v2) | `npx vitest run …v3-evol-01… …v2-evol-01…` | **0** | `vitest-regression-evol.txt` / `.exit` (17 passed) |

## STATUS

**PASS_UNIT** (3-candidate gate; rollback 1-command; fixture historical corpus)
