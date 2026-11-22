# V4.2 — Automated test results

**Data (UTC):** 2026-11-22T18:07:34Z (vitest) / 18:07:50Z (build+bench)  
**Commands:**

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v42-*.ts tests/unit/v41-*.ts
```

---

## Vitest `v42-*` + regressão `v41-*`

| File | Tests | Result |
|---|---:|---|
| `tests/unit/v42-p0-operational.test.ts` | 15 | pass |
| `tests/unit/v42-p1-workspace-continuity.test.ts` | 12 | pass |
| `tests/unit/v42-p2-perf-a11y.test.ts` | 8 | pass |
| `tests/unit/v41-p0-tui.test.ts` | 13 | pass |
| `tests/unit/v41-p1-handles-approvals.test.ts` | 14 | pass |
| `tests/unit/v41-p2-nav-docs.test.ts` | 8 | pass |
| **Total** | **70** | **6 files passed** |

### Raw output (captura)

```text
 RUN  v2.1.9 /home/gaab/orca/workspaces/EvolveLoop/seagrass/orchestrator

 ✓ tests/unit/v42-p0-operational.test.ts (15 tests) 37ms
 ✓ tests/unit/v41-p1-handles-approvals.test.ts (14 tests) 14ms
 ✓ tests/unit/v42-p1-workspace-continuity.test.ts (12 tests) 23ms
 ✓ tests/unit/v41-p0-tui.test.ts (13 tests) 5ms
 ✓ tests/unit/v42-p2-perf-a11y.test.ts (8 tests) 2ms
 ✓ tests/unit/v41-p2-nav-docs.test.ts (8 tests) 3ms

 Test Files  6 passed (6)
      Tests  70 passed (70)
   Duration  1.68s
```

Build: `npm run build` → **exit 0**.

---

## Smoke CLI (M4)

| Comando | Exit | Nota |
|---|---:|---|
| `node dist/cli/evolve.js help` | 0 | credentials block presente |
| `node dist/cli/evolve.js config prefs` | 0 | Handles OFF |
| `node dist/cli/evolve.js history list` | 0 | vazio + limitações |
| `node dist/cli/evolve.js use list` | 0 | ativo + recentes |
