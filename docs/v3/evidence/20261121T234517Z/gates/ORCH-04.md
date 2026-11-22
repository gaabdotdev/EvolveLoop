# Gate V3-ORCH-04 — Execução Especulativa Competitiva (Best-of-N)

| Field | Value |
|-------|-------|
| gate | V3-ORCH-04 |
| task | M11-V3-ORCH-04-BEST-OF-N |
| attempt | 1/3 |
| status | **PASS** |
| vitest_orch04_exit | 0 |
| vitest_regression_orch_exit | 0 |
| tests_orch04 | 12/12 |
| tests_regression | 78/78 |

## Acceptance

- [x] `triggerBestOfN(blockedTask, N, gate, hooks)` sob acionamento controlado (`gate.armed`)
- [x] Só tarefas criticamente bloqueadas (default); race N executors
- [x] Promove primeiro executor que passa validator determinístico
- [x] Cancela losers via AbortSignal
- [x] Distinto de V1 speculative-pipeline
- [x] Vitest ORCH-04 exit 0; regressão ORCH exit 0
