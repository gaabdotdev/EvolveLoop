# Gate V3-ORCH-05 — Verificação Formal / Property-Based Fuzzing

| Field | Value |
|-------|-------|
| gate | V3-ORCH-05 |
| task | M12-V3-ORCH-05-PBT-FUZZ |
| attempt | 1/3 |
| status | **PASS** |
| vitest_orch05_exit | 0 |
| vitest_regression_orch_exit | 0 |
| tests_orch05 | 10/10 |
| tests_regression | 91/91 |
| generator | seeded Mulberry32 (`PBT_DEFAULT_SEED`) — no fast-check |

## Acceptance

- [x] PBT cobrindo transições MSO: só edges válidas; rejeição de ilegais
- [x] PBT cobrindo leases/`fencing_token`: writer com token obsoleto rejeitado
- [x] Helper em `mso/pbt-fuzz.ts` + teste `v3-orch-05-pbt-fuzz.test.ts`
- [x] Evidência `docs/v3/evidence/20261121T235036Z/`
- [x] Vitest ORCH-05 exit 0; regressão ORCH exit 0
