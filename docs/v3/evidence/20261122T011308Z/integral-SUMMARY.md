# V3 Integral Harness SUMMARY — §22.23

- **ts:** 2026-11-22T01:17:48.175Z
- **evidence_dir:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass/docs/v3/evidence/20261122T011308Z`
- **orchestrator:** `/home/gaab/orca/workspaces/EvolveLoop/seagrass/orchestrator`
- **overall_exit:** **0**
- **log:** `integral-harness.log`

| Step | Label | Exit | Duration ms | Command |
|------|-------|------|-------------|---------|
| a | build (tsc) | **0** | 5383 | `npm run build` |
| b | unit v0+v1+v2+v3 packs (89 files) | **0** | 137002 | `npx vitest run tests/unit/v0-adapt-memory.test.ts … (88 more)` |
| c | integration (v0-intent-flow) | **0** | 2847 | `npx vitest run tests/integration/v0-intent-flow.integration.test.ts` |
| d | security adversarial pack | **0** | 5032 | `npx vitest run tests/unit/security/audit-adversarial.test.ts tests/unit/verified-pass-adversarial.test.ts` |
| e | recovery/chaos (SIGKILL reconciler) | **0** | 5898 | `npx vitest run tests/unit/v0-chaos-reconciler.test.ts` |
| f | v3 regression (20 files) | **0** | 21580 | `npx vitest run tests/unit/v3-dist-01-ops.test.ts … (19 more)` |

**STATUS:** all steps exit 0 — conjunto integrado revalidado nesta sessão.
