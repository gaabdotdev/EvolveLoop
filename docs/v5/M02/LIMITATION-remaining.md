# LIMITATION — remanescentes após M02 binding

**Código:** `work-runtime/` + `agent-orchestration/`

## Fechado em M02

| Item M01 LIMITATION | Estado |
|---------------------|--------|
| Attempt ↔ ProcessSession (quando existe) | **fechado** — `bindProcessSession` / `createAttemptForSession` |
| Fecho a partir de `ExecutionRunnerResult` | **fechado** — `bindExecutionResult` |
| create/list/get + estados + executor_id + mode | **fechado** |
| Substituição Agent + Attempt | **parcial** — `replaceAgentPreservingWork` supersede Attempts; spawn automático de Attempt no substitute → M03 |

## Ainda parcial / fora

| Gap | Porquê |
|-----|--------|
| Orquestração automática spawn→Attempt em todos os paths CLI/harness | Integração gradual; lifecycle REMED continua a controlar sessions sem forçar Attempt em cada SIG |
| `execution_mode` imposto em todos os reports doctor/harness | M04 |
| Cross-provider auto-swap | Continua `unsupported` no catalog (ADR-005) |
| ACP server | [LIMITATION-acp-deferred.md](./LIMITATION-acp-deferred.md) |

## Honesty

Binding existe e é testável. Não afirmar que **todo** harness spawn do produto já cria Attempt automaticamente — apenas que a API e contratos para o fazer estão fechados.
