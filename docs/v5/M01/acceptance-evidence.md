# V5-M01 — Acceptance evidence

**Data:** 2026-11-22  
**Repo:** EvolveLoop

## Comandos

```bash
cd orchestrator && npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m01*.ts tests/unit/remed-m1*.ts
git diff --check
git diff --stat -- orchestrator/src/v3 docs/v5/M01
git status --short | head -80
```

## Resultados

| Comando | Exit | Notas |
|---------|------|-------|
| `npm run build` | **0** | `tsc` OK |
| `vitest … v5-m01*.ts remed-m1*.ts` | **0** | 2 files, **11** tests passed |
| `git diff --check` | **0** | sem whitespace errors |
| `git diff --stat …` | **0** | ver abaixo; ficheiros **novos** (`work-runtime/`, `docs/v5/M01/`) aparecem como `??` no status |
| `git status --short \| head -80` | **0** | WIP REMED + V5 preservados |

### Vitest (resumo)

```
✓ tests/unit/v5-m01-work-runtime.test.ts (7 tests)
✓ tests/unit/remed-m1-statedb-runtime.test.ts (4 tests)
Test Files  2 passed (2)
Tests  11 passed (11)
```

### Diff relevante M01 (tracked edits em v3)

- `orchestrator/src/v3/state-db/{schema,store,types,index}.ts` — tabela `attempts`, schema v7
- `orchestrator/src/v3/work-ledger/types.ts` — `attempt_recorded`
- `orchestrator/src/v3/coordinator/service.ts` — `pauseWork`
- **Novos (untracked):** `orchestrator/src/v3/work-runtime/*`, `docs/v5/M01/*`, `tests/unit/v5-m01-work-runtime.test.ts`

## Cobertura de testes

| Caso | Resultado |
|------|-----------|
| open/read por `work_id` | PASS |
| sobrevive REPLACED | PASS |
| grafo/tasks sob Work | PASS |
| Attempt create/list + idempotency | PASS |
| isolamento workspace | PASS |
| TUI exit | PASS |
| pause | PASS |
| sem PASS forjado | PASS (`work_state !== TRUE_FULL_PASS`) |
