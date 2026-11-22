# V5-M02 — Acceptance evidence

**Data:** 2026-11-22  
**Repo:** EvolveLoop

## Comandos

```bash
cd orchestrator && npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m01*.ts tests/unit/v5-m02*.ts tests/unit/remed-m2*.ts
git diff --check
git diff --stat -- orchestrator/src/v3/state-db orchestrator/src/cli/evolve.ts \
  orchestrator/src/cli/help-usage.ts
# novos (untracked): work-runtime/, agent-orchestration/, work-surface.ts, docs/v5/M02/, v5-m02*.ts
git status --short | head -80
```

## Resultados

| Comando | Exit | Notas |
|---------|------|-------|
| `npm run build` | **0** | `tsc` OK |
| `vitest … v5-m01 + v5-m02 + remed-m2` | **0** | 4 files, **20** tests passed |
| `git diff --check` | **0** | sem whitespace errors |
| `git diff --stat` (tracked state-db/cli) | **0** | +351/−5 nas paths tracked listadas |
| Untracked M02 | — | `agent-orchestration/`, `work-surface.ts`, `docs/v5/M02/`, `v5-m02*.ts` (+ PWR M01) |

### Vitest (resumo)

```
✓ tests/unit/v5-m01-work-runtime.test.ts (7 tests)
✓ tests/unit/v5-m02-attempt-binding.test.ts (5 tests)
✓ tests/unit/v5-m02-orchestration-contracts.test.ts (3 tests)
✓ tests/unit/remed-m2-lifecycle-controls.test.ts (5 tests)
Test Files  4 passed (4)
Tests  20 passed (20)
```

## Cobertura de testes

| Caso | Resultado |
|------|-----------|
| Attempt create/list/get + executor_id/mode + schema v8 | PASS |
| bindProcessSession (ProcessSessionStore real) | PASS |
| bindProcessSession + processo vivo (/proc) | PASS |
| bindExecutionResult; Attempt fail ≠ Work fail | PASS |
| SESSION_NOT_FOUND / TASK_MISMATCH | PASS |
| Capability unsupported explícito | PASS |
| Scheduler determinístico + rank | PASS |
| Handoff REPLACED preserva Work; supersede Attempts | PASS |
| M01 regressão | PASS |
| REMED-M2 lifecycle | PASS |

## Diff relevante (tracked)

- `state-db/{schema,store,types,index}.ts` — schema **v8**, `executor_id`/`adapter_id`, migrateAttemptsV8
- `cli/evolve.ts` + `help-usage.ts` — `evolve work show|attempts`
- **Novos:** `work-runtime/*` (M01+M02 APIs), `agent-orchestration/*`, `cli/work-surface.ts`, `docs/v5/M02/*`, `tests/unit/v5-m02*.ts`
