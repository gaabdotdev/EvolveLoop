# EvolveLoop Benchmark & Observability System

**Spec:** user-provided `EVOLVELOOP_BENCHMARK_OBSERVABILITY_SPEC_v1.0`  
**ADR:** [adr/ADR-BENCH-OBS-0001-measurement-plane.md](adr/ADR-BENCH-OBS-0001-measurement-plane.md)  
**Gap analysis:** [ARCHITECTURE-GAP-ANALYSIS.md](ARCHITECTURE-GAP-ANALYSIS.md)

## Purpose

Measurement Plane that observes the EvolveLoop Execution Plane without altering orchestration policy. Local-first; provenance on every usage/cost metric; never invent tokens.

## Layout

| Path | Role |
|------|------|
| `orchestrator/src/telemetry/measurement-plane/` | Event contract, collector, store, metrics, trace, eval, runner, CLI handlers |
| `benchmarks/bench-obs/` | Suites, cases, pricing table, strategies |
| `{data-dir}/measurement/` | Runtime events JSONL, artifacts, experiments, reports |

## CLI

```bash
evolve telemetry status --data-dir ./v3-data
evolve telemetry inspect --data-dir ./v3-data --run <run_id>
evolve telemetry events|trace|agents|usage|metrics --data-dir ./v3-data --run <run_id>
evolve telemetry export --data-dir ./v3-data --run <run_id> --format jsonl

evolve benchmark suite list
evolve benchmark suite inspect engineering-v1
evolve benchmark case list --suite engineering-v1
evolve benchmark run --data-dir ./v3-data --suite engineering-v1 --strategy A_single_agent
evolve benchmark run --data-dir ./v3-data --experiment <exp_id>
evolve benchmark doctor --data-dir ./v3-data
evolve benchmark validate-suite engineering-v1
```

Strategies: `A_single_agent` | `B_evolveloop_no_delegation` | `C_evolveloop_adaptive`.

## Reuse (do not duplicate)

- `EventBus` + `JsonlEventPersister` (engine) via `event-bus-adapter`
- `VendorCacheUsage` via `usage-adapter` (`PROVIDER_REPORTED` only when present)
- V3 `evaluation` / TRUE_FULL_PASS semantics mirrored in Measurement Evaluation Engine
- Evidence redaction helpers

## TUI / Dashboard

Deferred until contracts and collection are stable (spec §21). CLI + JSON reports are the first product surface.
