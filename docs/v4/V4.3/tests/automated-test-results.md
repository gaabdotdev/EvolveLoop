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
