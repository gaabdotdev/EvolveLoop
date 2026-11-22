# V4.3 — Regressão (§6)

**Data:** 2026-11-22  
**Spec:** `V4-Tests-and-Benchmarks.md` §6 — Testes de regressão  
**Harness:** `v43-p0-regression-handles.test.ts`, `v43-p1-consolidation.test.ts`, `v43-p2-telemetry-regression.test.ts`, suites v41/v42  
**Regra:** não confundir unit com prova de jornada humana.

---

## Matriz

| Bloco | Cobertura | Evidência | Status |
|---|---|---|---|
| Comandos públicos | `--help`, journey help, status, pause/resume, agents, config, history, use, delivery | `v43-p0-regression-handles.test.ts`; `v43-p1-consolidation.test.ts` | **PASS** (unit) |
| Automações / scripts | Grupos L3 preservados no advanced help; JSON groups estáveis | `help-usage.ts` + P0-4 | **PASS** (unit) |
| Configuração e migração | prefs/validate; migration-notes; engines ≥20 | `compat-matrix.md`; `migration-notes.md`; v42-p0 | **PASS** (doc+unit) |
| Permissões / sandbox / workspace | workspace use; layout narrow; Handles OFF default | v42-p1; v43-p0-5 | **PASS** (unit) |
| Telemetria e ledger | HonestMetric; sem inventar consumo; rollup MSO+Workers | `v43-p2-telemetry-regression.test.ts`; M19 | **PASS** (unit) |
| Continuidade / recovery / supervisão | REPLACED → 3 linhas; replace ≠ active; closeViewer ≠ kill | P2-4 + P0-5 | **PASS** (unit) |
| Credenciais | Duas casas documentadas (LIMITATION; sem unificar) | `credentials-paths.ts`; help; known-limits L-CREDS | **PASS** (LIMITATION documentada) |

---

## Comandos

```bash
cd orchestrator
npm run build
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v43-*.ts tests/unit/v42-*.ts tests/unit/v41-*.ts
```

---

*MSO TASK V43-M4 — P2-1 / P2-4 / P2-5*
