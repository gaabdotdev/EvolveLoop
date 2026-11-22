# V4.3 — Resultados automatizados

**Data (UTC):** 2026-11-22T18:40Z
**Comando:**

```bash
cd orchestrator && npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v43-*.ts tests/unit/v42-*.ts tests/unit/v41-*.ts
```

## Resultado

| Suite | Ficheiros | Testes | Exit |
|---|---:|---:|---|
| v41 + v42 + v43 | 12 | 124 passed (após ajuste limiar journey help) | **0** |

Notas:

- `v41-p2-nav-docs`: limiar de linhas do journey help actualizado para `<55` (bloco Credenciais V4.2 + superfícies V4.3) — §10: não cortar clareza para métrica de linhas.
- P2 novos: `v43-p2-e2e-resilience.test.ts` (12), `v43-p2-telemetry-regression.test.ts` (5).

Artefacto bruto: saída vitest na sessão V43-M4.

---

## APPEND — REMED-M6 (2026-11-22T21:04:19Z)

**HEAD:** `53ad05911118408d48f334bf991fb299e7c2d5b2`
**Node:** `v22.15.0`
**Comando:**

```bash
cd orchestrator && npm run build   # BUILD_EXIT=0
npm test 2>&1 | tee /tmp/remed-m6-full-test.txt
# FULL_TEST_EXIT=0
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/remed-m*.ts
# 57 passed / 6 files
npm run test:bench   # 18 passed / BENCH_EXIT=0
```

| Suite | Ficheiros | Testes | Exit |
|---|---:|---:|---|
| **npm test (completa)** | 252 | 1408 passed · 2 skipped | **0** |
| remed-m1…m6 | 6 | 57 passed | **0** |
| test:bench | 1 | 18 passed | **0** |

Correcções nesta corrida: assert Session copy (`v0-cli-grill`); re-pin `docs/v22/baseline/raw/p0-baseline-report.json` (`tree_sha`→HEAD).
Gate: [`../remediation/gate-report.md`](../remediation/gate-report.md).
