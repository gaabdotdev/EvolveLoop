# Instrumentation Overhead Methodology

## Goal

Measure cost of Measurement Plane itself (spec §23.3 / §28).

## Protocol

1. **Baseline (no measurement):** Execution Plane run with EventBus only (existing JsonlEventPersister optional).
2. **Minimal:** EventBus adapter attached; collector mode `normal`; no artifact store writes beyond events.
3. **Full:** collector mode `benchmark`; hierarchy + usage + evaluation events; artifact meta writes.

## Metrics

| Metric | How |
|--------|-----|
| Latency delta | wall-clock of same fixture case |
| CPU/RSS | `process.cpuUsage` / `process.memoryUsage` snapshots around run |
| Storage/run | size of `{data-dir}/measurement/events/<run>.jsonl` + artifacts |
| Event loss | `CollectorStats.dropped` / `emitted` |
| Trace rebuild | time of `reconstructExecution` |
| Report gen | time of `buildRunMetricsReport` + compare JSON write |

## Smoke observation (2026-11-11)

On local deterministic `runBenchmarkCase` for `BO-TEL-01` / strategy A:

- Event JSONL typically < 50 KB per case smoke run.
- Collector overhead dominated by sync append in benchmark mode (intentional durability).
- No Core PolicyEngine path is entered by Measurement Plane (observe-only / in-process synthetic runner for suite smoke).

## Limitations

- Full “without instrumentation” Core path requires opt-out flag on live ExecutionEngine attach; not enabled by default.
- Live multi-provider LLM runs not measured here (no API keys in session).
