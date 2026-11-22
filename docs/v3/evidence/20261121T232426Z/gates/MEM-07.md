# Gate V3-MEM-07 — Federated Sanitize (META-WS-006)

| Field | Value |
|-------|-------|
| gate | V3-MEM-07 |
| task | M7-V3-MEM-07-FEDERATED-SANITIZE |
| attempt | 1/3 |
| status | **PASS** |
| vitest_mem07_exit | 0 |
| vitest_regression_mem01_06_exit | 0 |
| tests_mem07 | 9/9 |
| tests_regression | 46/46 |

## Acceptance

- [x] `sanitizeForFederation(text, policy)` strips secrets, paths, private vars, domain names
- [x] `promoteToGlobal(memory, policy)` only after sanitize; refuses on residual
- [x] Explicit `allow_federation=true` required (fail-closed)
- [x] Adversarial payloads (PEM, keys, paths, domains, canaries) → 0% leak
- [x] Misconfig `strip_paths=false` still blocks promote via residual gate
- [x] Regressão MEM-01..06 exit 0
