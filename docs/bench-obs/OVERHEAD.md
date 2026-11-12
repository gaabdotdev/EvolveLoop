# Instrumentation Overhead — Measured

**Method:** `measureInstrumentationOverhead` / `evolve benchmark overhead`  
**Evidence:** `docs/bench-obs/evidence/overhead-report.json`  
**Date:** 2026-11-11

## Protocol

| Label | Meaning |
|-------|---------|
| `none` | CPU loop without Measurement Plane |
| `minimal` | normal-mode collector ≈20 events |
| `full` | benchmark-mode ≈80 events + reconstruct + metrics report |

## Results (5 iterations, local process)

| Label | wall_ms_mean | storage_bytes_mean | events/iter |
|-------|--------------|--------------------|-------------|
| none | ~0.02 | 0 | 0 |
| minimal | ~0.96 | ~14 KB | 20 |
| full | ~2.87 | ~57 KB | 80 |

Exact numbers are in the JSON evidence file (machine-readable).

## Limitations

- Measures Measurement Plane synthetic path, not live ExecutionEngine + LLM network.
- RSS deltas are process-noisy on small samples.
- Does not replace suite benchmarks.

## Conclusion

Full instrumentation adds low single-digit milliseconds and tens of KB per synthetic burst on this machine. It must not be confused with product end-to-end latency.
