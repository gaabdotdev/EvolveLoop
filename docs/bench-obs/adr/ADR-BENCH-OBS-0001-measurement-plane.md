# ADR-BENCH-OBS-0001 — Measurement Plane placement

## Status

Accepted

## Context

Spec v1.0 proposes Event Contract, Collector, Event Store, Benchmark Runner, Evaluation Engine. The repo already has EventBus, JSONL persister, Evidence buses (engine + V3), Work Ledger, CoordinationEventLog, and eval battery.

## Decision

1. Place the product layer at `orchestrator/src/telemetry/measurement-plane/`.
2. Do **not** create a second EventBus or Evidence Bus.
3. Persist measurement facts under `{data-dir}/measurement/` (events JSONL, artifacts, experiments, reports).
4. Map Execution Plane events into a versioned measurement envelope (`schema_version: "1.0"`).
5. Reuse `v3/evaluation` for TRUE_FULL_PASS; Measurement Plane supplies traces/metrics only.
6. CLI surface: `evolve telemetry …` and `evolve benchmark …`.

## Consequences

- Clear ownership aligned with V3_COMPONENT_OWNERSHIP (Telemetry ≠ Evidence ≠ acceptance).
- Correlation must namespace `run_id` meanings (`engine_node_run_id`, `coordination_run_id`, `measurement_run_id`).
- Tokens/costs never invented; provenance required on every usage measure.
