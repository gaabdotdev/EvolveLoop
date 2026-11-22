# V3-ORCH-01 Evidence — Critical Path + Prefetch

- **ts:** 20261121T233047Z
- **task:** M8-V3-ORCH-01-CRITICAL-PATH-PREFETCH (tentativa 1/3)
- **evidence_dir:** `docs/v3/evidence/20261121T233047Z`
- **wiki grounding:** PACK_NOT_FOUND EvolveLoop (pack CLI); vault `EvolveLoop/log.md` exists. Contrato = brief MSO M8-V3-ORCH-01.

## Implementação

| Peça | Path |
|------|------|
| Critical path + prefetch | `orchestrator/src/v3/parallel/critical-path.ts` |
| Exports | `orchestrator/src/v3/parallel/index.ts` |
| Unit tests | `orchestrator/tests/unit/v3-orch-01-critical-path.test.ts` |

### Contrato mínimo fechado

- `computeCriticalPath(dag)` — CPM determinístico (EF/LF/slack); path A→…→sink; `critical_node_ids` com slack 0
- `prefetchNext({ phase: "VALIDATING", … })` — prepara stubs determinísticos `worktree` / `deps` / `lsp_index` do próximo nó (preferência critical-path); no-op fora de VALIDATING
- `rankReadyNodes(…, "critical_path"|"fifo")` — escalonamento por least-slack vs FIFO
- `simulateDagWallClock` — wall-clock discreto; mede redução CP vs FIFO e prefetch-ahead (setup warm)

### Cenários cobertos

1. Diamond A→B(long)/C(short)→D → path A-B-D
2. Ciclo / dep missing → CriticalPathError
3. rankReadyNodes CP prefere B (slack 0)
4. prefetchNext RUNNING → SKIPPED; VALIDATING → stubs ahead em B
5. SHA stubs determinísticos across roots
6. Wall-clock contention DAG: `critical_path` < fat-first FIFO (max_concurrent=2)
7. Wall-clock chain+setup: prefetch VALIDATING reduz setup 80→5; prefetch_ahead_events≥2
8. Sink sem successors → ahead=false

## Vitest

| Suite | Command | Exit | Log |
|-------|---------|------|-----|
| V3-ORCH-01 | `npx vitest run tests/unit/v3-orch-01-critical-path.test.ts` | **0** | `vitest-v3-orch-01.txt` / `.log` / `.exit` |
| Regressão ORCH parallel (v2) | `npx vitest run tests/unit/v2-orch-{01-file-ownership,02-merge-queue,03-idempotency-saga,04-backpressure}.test.ts` | **0** | `vitest-regression-orch.txt` / `.exit` |

## STATUS

**PASS**
