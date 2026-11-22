# Gate V3-ORCH-01 — Critical Path + Prefetch

| Field | Value |
|-------|-------|
| gate | V3-ORCH-01 |
| task | M8-V3-ORCH-01-CRITICAL-PATH-PREFETCH |
| attempt | 1/3 |
| status | **PASS** |
| vitest_orch01_exit | 0 |
| vitest_regression_orch_exit | 0 |
| tests_orch01 | 8/8 |
| tests_regression | 30/30 |

## Acceptance

- [x] `computeCriticalPath(dag)` → nós no caminho crítico (CPM / slack 0)
- [x] `prefetchNext(node)` durante VALIDATING prepara stubs worktree/deps/lsp_index determinísticos
- [x] Prefetch no-op fora de VALIDATING
- [x] Wall-clock simulado: critical_path < FIFO em DAG de contenção **ou** evidência prefetch-ahead (ambos)
- [x] Vitest ORCH-01 exit 0; regressão parallel v2 exit 0
