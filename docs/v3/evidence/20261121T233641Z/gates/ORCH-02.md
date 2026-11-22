# Gate V3-ORCH-02 — Dynamic DAG Auto-Replanning

| Field | Value |
|-------|-------|
| gate | V3-ORCH-02 |
| task | M9-V3-ORCH-02-DYNAMIC-DAG |
| attempt | 1/3 |
| status | **PASS** |
| vitest_orch02_exit | 0 |
| vitest_regression_orch_exit | 0 |
| tests_orch02 | 15/15 |
| tests_regression | 38/38 |

## Acceptance

- [x] `proposeDagMutation` — tarefas propõem mutações estruturais no TaskGraph (`proposal_id` determinístico)
- [x] `validateMutationDeterministic` — MSO rejeita ciclos
- [x] Rejeita orçamento excedido (tasks / depth / fan-out / mutations / tokens)
- [x] Rejeita permissões inválidas (role / op / subtree scope)
- [x] Vitest ORCH-02 exit 0; regressão ORCH exit 0
