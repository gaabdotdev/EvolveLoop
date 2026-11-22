# V5-M02 — Attempt Model + Agent Orchestration contracts (Foundation)

**Status:** implementado (slice verificável)  
**Depende de:** M01  
**Tese:** Attempt mediado; Agents replaceable; capability honesty (ADR-002/003/005)

---

## Objectivo

Fechar o LIMITATION de binding Attempt (M01) e expor contratos de orquestração **sem** Agent Studio / ACP completo.

## Entregas

| Item | Path | Notas |
|------|------|-------|
| Attempt binding | `work-runtime/runtime.ts` | `getAttempt`, `bindProcessSession`, `bindExecutionResult`, `failAttempt`, `supersedeAttempt`, `createAttemptForSession` |
| `executor_id` / `adapter_id` | StateDb schema **v8** | Aditivo; ALTER em DBs v7 |
| Capability profile | `agent-orchestration/capability-profile.ts` | Discovery sobre `AGENT_ADAPTER_CATALOG`; unsupported explícito |
| Scheduler | `agent-orchestration/scheduler.ts` | `selectExecutor` — capability + preferência, determinístico |
| Handoff/replace | `agent-orchestration/handoff-replace.ts` | Continuity REPLACED preserva Work; supersede Attempts |
| CLI | `cli/work-surface.ts` | `evolve work show\|attempts` |
| ACP | **GAP / defer** | [LIMITATION-acp-deferred.md](./LIMITATION-acp-deferred.md) |

## Aceitação mínima

- [x] Attempt create / list / get
- [x] Ligação Attempt ↔ ProcessSession (quando existe)
- [x] Fecho Attempt a partir de `ExecutionRunnerResult` (status map honest)
- [x] Estados + `executor_id` + mode `harness` \| `native`
- [x] Capability profile por `adapter_id` (unsupported explícito)
- [x] Handoff/replace: Work preservado; Attempt fail ≠ Work fail
- [x] Scheduler determinístico explicável
- [x] ACP não fingido — LIMITATION documentada
- [x] Sem PASS forjado

## Testes

```bash
cd orchestrator
npx vitest run --pool=forks --poolOptions.forks.singleFork \
  tests/unit/v5-m01*.ts tests/unit/v5-m02*.ts tests/unit/remed-m2*.ts
```

Evidência: [acceptance-evidence.md](./acceptance-evidence.md)

## O que NÃO foi feito (propositadamente)

- ACP server completo (→ M06 / LIMITATION)
- Agent Studio / SDK público amplo
- ML ranking de executores
- Rewrite de adapters / StateDb
- Declarar TRUE_FULL_PASS sem critérios
