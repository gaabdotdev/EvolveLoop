# LIMITATION — Attempt binding parcial (V5-M01)

**Código:** `orchestrator/src/v3/work-runtime/` + `StateDb.createAttempt` / `listAttempts`  
**Fecho:** Meta **M02** — ver [../M02/README.md](../M02/README.md) e [../M02/LIMITATION-remaining.md](../M02/LIMITATION-remaining.md)

## O que M01 entregou

- Tipo domínio `Attempt` (≠ `FailedAttemptRecord` de token-economy)
- Persistência aditiva na **mesma** StateDb (`attempts`, schema v7 → v8 em M02)
- Campos opcionais de ligação: `agent_id`, `process_session_id`, `run_id`, `execution_mode`
- Create/list + idempotência (`idempotency_key`)
- Entrada de ledger `attempt_recorded` (JSONL + StateDb ledger)

## O que M01 deixou parcial (fechado / avançado em M02)

| Gap | Estado |
|-----|--------|
| Orquestração Attempt ↔ ProcessSession | **M02** — `bindProcessSession` / `createAttemptForSession` |
| Fecho de Attempt a partir de `ExecutionRunnerResult` | **M02** — `bindExecutionResult` |
| `execution_mode` em todos os reports | M04 |
| Substituição Agent cria/supersede Attempt | **M02** parcial — `replaceAgentPreservingWork` |

## Honesty

M01 foi **núcleo + API**. Binding profundo está em M02; auto-wiring de todos os spawns CLI permanece LIMITATION residual (M02 `LIMITATION-remaining.md`).
