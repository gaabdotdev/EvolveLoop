# Architecture Gap Analysis — Benchmark & Observability System

**Feature:** `bench-obs`  
**Date:** 2026-11-11  
**Spec:** EVOLVELOOP_BENCHMARK_OBSERVABILITY_SPEC_v1.0 (user-provided)  
**Branch:** `feature/bench-obs-v1`

## Decisions (spec §29.2)

| Question | Decision |
|----------|----------|
| Event source | Reuse `EventBus` + adapt into Measurement Plane envelope via `event-bus-adapter` |
| Persistence | Reuse JSONL append-only pattern; store under `--data-dir/measurement/` (new) without replacing `telemetry/events` or V3 `events/` |
| Critical durability | Benchmark mode: sync append + completeness check; Normal: buffered with overflow counters |
| Provider usage | Only `VendorCacheUsage` / explicit budget records → `PROVIDER_REPORTED`; estimates labeled `ESTIMATED` |
| Process↔agent attribution | Prefer explicit `agent_id` on events; otherwise `unattributed` |
| Useful work | Catalog of tool/artifact events; not “any tool call” |
| Context duplication | Exact payload hash reuse only by default (no full prompt capture) |
| Evaluation tools | Reuse `v3/evaluation` (TRUE_FULL_PASS, EvidenceStore, battery) |
| Manifest versioning | Versioned suites under `benchmarks/bench-obs/` |
| Held-out leakage | Reuse `benchmarks/v3/tasks.json` split; held-out solvers not exposed to runner config for adaptative tuning |

## Component matrix

| Component | Estado atual | Reutilização | Alteração | Lacuna |
|-----------|--------------|--------------|-----------|--------|
| EventBus | In-process tipado | MUST | Adapter → envelope bench-obs | Schema/provenance/privacy |
| JsonlEventPersister | Por feature_id | Pattern | Measurement EventStore separado | Índices/consulta multi-ID |
| MetricsAccumulator | Por run | Keep | Metrics Engine paralelo | Catálogo oficial / percentis |
| Evidence v2.1 | Gates engine | Keep | — | ≠ métricas |
| V3 EvidenceStore | TRUE_FULL_PASS | MUST for eval | Bridge | — |
| CoordinationEventLog | work_id JSONL | Adapter | Mirror → measurement | Schema solto |
| Work Ledger | Operacional | Correlacionar | — | Não é time-series |
| VendorCacheUsage | Tokens reportados | MUST | Provenance wrapper | Coverage parcial |
| Eval battery | Deterministic solvers | Runner strategies | Strategies A/B/C configs | Delegation hierarchy cases |
| CLI evolve | Grupos battery/eval/budget | Extender | `telemetry` + `benchmark` | Comandos spec §20 |
| TUI/Dashboard | Fora do escopo inicial pós-contrato | Contrato only | — | Após estabilidade |

## Integration map

```
Execution Plane                    Measurement Plane
─────────────────                  ─────────────────
EventBus ──────────────────────► event-bus-adapter ──► Collector
CoordinationEventLog ──────────► coordination-adapter ┘
VendorCacheUsage ──────────────► usage-adapter ───────► Event Store (JSONL)
AgentRegistry / hierarchy ─────► hierarchy-adapter ───► Trace Builder
V3 Evaluation / Evidence ──────► Evaluation Engine ◄── Benchmark Runner
                                                    └── Metrics / Reports / CLI
```

**Invariant:** Measurement Plane observes; does not alter PolicyEngine, canStartTask, provider selection, or TRUE_FULL_PASS.
