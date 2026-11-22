# V3 Integral Harness SUMMARY — §22.23

- **ts:** 2026-11-22T01:13:43.263Z
- **evidence_dir:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass/20261122T011308Z`
- **orchestrator:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass/orchestrator`
- **overall_exit:** **1**
- **log:** `integral-harness.log`

| Step | Label | Exit | Duration ms | Command |
|------|-------|------|-------------|---------|
| a | build (tsc) | **2** | 5590 | `npm run build` |
| b | unit v0+v1+v2+v3 packs | **1** | 492 | `npx vitest run tests/unit/v0-*.test.ts tests/unit/v1-*.test.ts tests/unit/v2-*.test.ts tests/unit/v3-*.test.ts` |
| c | integration (v0-intent-flow) | **0** | 974 | `npx vitest run tests/integration/v0-intent-flow.integration.test.ts` |
| d | security adversarial pack | **0** | 1521 | `npx vitest run tests/unit/security/audit-adversarial.test.ts tests/unit/verified-pass-adversarial.test.ts` |
| e | recovery/chaos (SIGKILL reconciler) | **0** | 3275 | `npx vitest run tests/unit/v0-chaos-reconciler.test.ts` |
| f | v3 regression | **1** | 487 | `npx vitest run tests/unit/v3-*.test.ts` |

**STATUS:** FAIL — one or more steps non-zero; see log.
