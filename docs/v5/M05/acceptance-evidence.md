# V5-M05 — Acceptance evidence

**Data:** 2026-11-22  
**Repo:** EvolveLoop  
**Canonical path:** `orchestrator/src/v3/governance/`

## Comandos

```bash
ls docs/v5/M05/
cd orchestrator && npm run build
cd orchestrator && npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m05-governance.test.ts \
  tests/unit/v5-m04-tool-registry.test.ts
git diff --check
```

## Resultados

| Comando | Exit | Notas |
|---------|------|-------|
| `npm run build` | **0** | `tsc` ok |
| `vitest … v5-m05-governance + v5-m04` (+ compat) | **0** | **22** tests passed (8+7+7) |
| `git diff --check` | **0** | sem erros de whitespace |

```
✓ tests/unit/v5-m05-governance.test.ts (8 tests)
✓ tests/unit/v5-m04-tool-registry.test.ts (7 tests)
✓ tests/unit/v5-m05-human-governance.test.ts (7 tests)
```

## Cobertura

| Caso | Resultado |
|------|-----------|
| Policy deny_tool_ids bloqueia tool assignada + audit | PASS |
| Approvals facade/bridge work_id + attempt_id | PASS |
| Budget tokens/attempts exceeded fail-closed + audit | PASS |
| Budget overlay bloqueia tool | PASS |
| Audit append-only | PASS |
| Policy deny pause → PolicyDenied (sem REMED) | PASS |
| Policy allow pause → REMED no_live_targets | PASS |

## REMED-M2 reuse

Lifecycle operacional permanece em `lifecycle/run-controls.ts`.  
Wrapper: `pauseOwnedRunsUnderPolicy` / `resumeOwnedRunsUnderPolicy` / `cancelOwnedRunsUnderPolicy`.
