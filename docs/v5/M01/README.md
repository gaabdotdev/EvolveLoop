# V5-M01 — Persistent Work Runtime (Foundation)

**Status:** implementado (mínimo mas real)  
**Depende de:** M00  
**Tese:** Work-first — Agents replaceable / Work persistent (ADR-001)

---

## Objectivo

Fundar o **Persistent Work Runtime (PWR)** sobre infra existente (`work_id`, Coordinator, WorkLedger, TaskGraph, StateDb, continuity), **sem** apagar Task UX V4 nem reescrever StateDb.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| Tipo canónico `Work` | `orchestrator/src/v3/work-runtime/types.ts` | Aggregate read; reutiliza `work_id` |
| API PWR | `orchestrator/src/v3/work-runtime/runtime.ts` | `open` / `read` / `graph` / `createAttempt` / `pause` / `simulateTuiExit` |
| Work Graph | `graph()` → `TaskGraphStore` | `source: "TaskGraphStore"` — não segundo motor |
| Attempt (núcleo) | StateDb tabela `attempts` (schema v7) | Aditivo; idempotência por `(work_id, idempotency_key)` |
| Dual-label | `ux_dual_label` | `Work` infra + `Task` produto V4 |
| Liveness | `Work.liveness` | Distingue durável vs processo vivo |

## Aceitação mínima (roadmap M01)

- [x] Work legível por `work_id`
- [x] Work legível após Agent `REPLACED`
- [x] Work legível após “TUI exit” (`simulateTuiExit` / coordinator `stop`)
- [x] Tasks listáveis sob Work (TaskGraph)
- [x] Attempt create/list (núcleo)
- [x] Isolamento por workspace
- [x] Sem PASS forjado

## LIMITATION parcial

Ver [LIMITATION-attempt-binding.md](./LIMITATION-attempt-binding.md) — binding completo Attempt ↔ ProcessSession/ExecutionRunner fica para **M02**.

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork tests/unit/v5-m01*.ts
```

Evidência: [acceptance-evidence.md](./acceptance-evidence.md)

## O que NÃO foi feito (propositadamente)

- Apagar journey Task / ADR Q2
- Segundo SQLite / microserviços / filas
- Rewrite StateDb
- Agent Studio / SDK / ACP
- Declarar TRUE_FULL_PASS sem critérios/evidência
