# Acceptance Matrix — Benchmark & Observability (Gates A–G)

Status legend: `PASS` | `PARTIAL` | `BLOCKED` | `FAIL`

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| A | Envelope versionado | PASS | `envelope.ts` `schema_version=1.0` + unit tests |
| A | Correlation IDs | PASS | `CorrelationIds`; empties omitted (no invented IDs) |
| A | Eventos críticos | PASS | `isCriticalEventName` + benchmark durability |
| A | Collector | PASS | `TelemetryCollector` modes normal/benchmark |
| A | Persistência local | PASS | `{data-dir}/measurement/events/*.jsonl` |
| A | Export JSONL | PASS | `MeasurementEventStore.exportJsonl` + CLI |
| A | Validação schema | PASS | `validateMeasurementEvent` |
| A | Duplicação/atraso | PASS | duplicate annotation + `quality.delayed` |
| A | Perda detectável | PASS | `collector.event_dropped` + incomplete run |
| A | Cobertura reportada | PASS | `coverage_gaps` in metrics report |
| B | Trace reconstruível | PASS | `reconstructExecution` |
| B | Árvore de agentes | PASS | `buildAgentTree` + tests |
| B | Tasks ≠ hierarchy | PASS | separate task_* vs agent_* events |
| B | Parent/child | PASS | hierarchy adapter + tree builder |
| B | Spawn requested ≠ real | PASS | distinct event names + flags |
| B | Delegação ≠ sessão | PASS | `delegation.*` events |
| B | Direct vs coordination | PASS | work share metrics |
| B | Trabalho delegado | PASS | `delegated_engineering_share` |
| B | Subagentes recursivos | PASS | BO-ORCH-03/04 + depth |
| B | Spawn bloqueado | PASS | `agent.spawn_blocked` BO-ORCH-05 |
| C | Reportado ≠ estimado | PASS | provenance kinds + usage aggregate |
| C | Usage dedup | PASS | request_id family key |
| C | Tabela de preços | PASS | `benchmarks/bench-obs/pricing/prices.v1.json` |
| C | Latência por etapa | PASS | timing metrics + latency stats |
| C | Percentis + amostra | PASS | `summarizeLatency` reliability flag |
| C | Agent time ≠ wall-clock | PASS | separate fields in timing report |
| C | Context utilization | PARTIAL | `context.snapshot` mapped from EventBus; full utilization needs provider limits |
| C | UNAVAILABLE explícito | PASS | provenance UNAVAILABLE |
| D | Suites/cases versionados | PASS | `engineering-v1` + 16 cases |
| D | Experimentos | PASS | create/run/status/cancel |
| D | Workspaces isolados | PASS | copy fixture per run under measurement/workspaces |
| D | Estratégias A/B/C | PASS | `strategies.ts` + runner |
| D | Repetições | PASS | experiment.repetitions |
| D | Ambiente/commit | PASS | attributes on case_started |
| D | Cases inválidos | PASS | fixture missing → invalidated |
| D | Falhas registradas | PASS | experiment status failed/cancelled |
| E | Critérios/evidências | PASS | Evaluation Engine |
| E | Avaliação independente | PASS | ignores agent declaration alone |
| E | Falsos positivos | PASS | adversarial checks unit-tested |
| E | Falsos negativos | PARTIAL | requires held-out ground truth corpus beyond deterministic fixtures |
| E | TRUE_FULL_PASS | PASS | granted/rejected events + reasons |
| F | Relatórios run/agent/strategy | PASS | reports JSON + CLI |
| F | Comparação | PASS | `compareStrategies` |
| F | Cost per verified completion | PASS | with price table; else UNAVAILABLE |
| F | Delegation ROI decomposto | PARTIAL | components via hierarchy+timing+cost; no opaque single score |
| F | Falhas/recuperações visíveis | PARTIAL | event names supported; fault-injection suite thin beyond spawn_denied |
| F | Export machine-readable | PASS | JSON/JSONL |
| G | Local-first | PASS | no third-party ship; doctor reports local root |
| G | Secrets ausentes | PASS | redaction on persist + validation |
| G | Retenção configurável | PARTIAL | suite privacy.retention_days declared; sweeper not automated |
| G | Overhead medido | PARTIAL | see OVERHEAD.md methodology; full A/B/C instrumentation bench smoke only |
| G | Falha collector não altera exec | PASS | observe-only adapters; ingest failures don't throw into Core |
| G | Perda crítica em benchmark | PASS | incomplete validity |
| G | Migrações schema | PARTIAL | version field enforced; migration toolkit deferred |
| G | Documentação | PASS | docs/bench-obs/* |

## External BLOCKED items

| Item | Reason |
|------|--------|
| Live provider token streams beyond VendorCacheUsage parsers | Requires live API keys / provider sessions |
| Wiki register of this feature | `WIKI_ROOT` unset in session |
| Graphify subset | CLI hardgate blocked (venv binary absent) |
| Full TUI/dashboard | Explicitly post-stability per spec §21 |
