# V4.1 — Automated test results

**Data (UTC):** 2026-11-22T17:34Z
**Command:**

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v41-*.ts
```

---

## Vitest files `v41-*`

| File | Tests | Result |
|---|---|---|
| `tests/unit/v41-p0-tui.test.ts` | 13 | pass |
| `tests/unit/v41-p1-handles-approvals.test.ts` | 14 | pass |
| `tests/unit/v41-p2-nav-docs.test.ts` | 8 | pass |
| **Total** | **35** | **3 files passed** |

### Raw output (captura)

```text
 RUN  v2.1.9 /home/gaab/orca/workspaces/EvolveLoop/seagrass/orchestrator

 ✓ tests/unit/v41-p1-handles-approvals.test.ts (14 tests) 24ms
 ✓ tests/unit/v41-p0-tui.test.ts (13 tests) 5ms
 ✓ tests/unit/v41-p2-nav-docs.test.ts (8 tests) 4ms

 Test Files  3 passed (3)
      Tests  35 passed (35)
   Start at  14:34:34
   Duration  1.26s (transform 753ms, setup 21ms, collect 1.05s, tests 33ms, environment 0ms, prepare 45ms)
```

Build: `npm run build` → **exit 0**.

---

## Regressão slash relacionada (não-v41, mesma fatia P2)

```bash
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/m13-m14-m15-tui.test.ts \
  tests/unit/v0-tui-ergonomics.test.ts
```

| File | Tests | Result |
|---|---|---|
| `v0-tui-ergonomics.test.ts` | 14 | pass |
| `m13-m14-m15-tui.test.ts` | 11 | pass |
| **Total** | **25** | **pass** |

---

## Smoke CLI

| Comando | Exit | Nota |
|---|---|---|
| `node dist/cli/evolve.js --help` | 0 | help curto jornada |
| `node dist/cli/evolve.js help advanced` | 0 | JSON `layer: advanced` |
| `node dist/cli/evolve.js agents` | 0 | Handles OFF (profile) |
| `node dist/cli/evolve.js agents --help` | 0 | trata como list produto (cmd=help) |

---

*Fim — automated-test-results.md*


---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

```bash
cd orchestrator && npm test  # FULL_TEST_EXIT=0 · 252 files · 1408 passed
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/remed-m*.ts  # 57 passed
```

HEAD `53ad059…` · Node `v22.15.0` · ver `docs/v4/V4.3/remediation/gate-report.md`.
