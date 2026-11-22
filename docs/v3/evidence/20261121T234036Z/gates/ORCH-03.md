# Gate V3-ORCH-03 — Orquestração Hierárquica Delimitada (Sub-MSOs)

| Field | Value |
|-------|-------|
| gate | V3-ORCH-03 |
| task | M10-V3-ORCH-03-SUB-MSO |
| attempt | 1/3 |
| status | **PASS** |
| vitest_orch03_exit | 0 |
| vitest_regression_orch_exit | 0 |
| tests_orch03 | 13/13 |
| tests_regression | 56/56 |

## Acceptance

- [x] `spawnSubMso(parentCaps, budget)` → capabilities atenuadas (⊆ parent)
- [x] Orçamento herdado; rejeita escalação acima de `parent_remaining_tokens`
- [x] `enforceSpend` rejeita token spend > budget (`BUDGET_EXCEEDED`)
- [x] `enforceCapability` rejeita capability fora do set atenuado (`CAPABILITY_NOT_DELEGATED`)
- [x] Nested Sub-MSO não escala permissões nem orçamento do pai
- [x] Vitest ORCH-03 exit 0; regressão ORCH exit 0
