# Benchmark & Observability (complementary to V3 freeze)

This directory holds **complementary** acceptance evidence for the Measurement Plane and Live LLM validation path.

## Preserved history

- Tag `v3-complete` and `docs/v3/evidence/gate.v3-global.json` are **not** rewritten.
- Deterministic evaluation battery remains `DETERMINISTIC_SOLVER` for CI.
- The ~25.9% token figure in historical `gate.v3-benchmarks.json` is a **proxy**, not live economy.

## Spec & implementation

| Item | Location |
|------|----------|
| Spec index | `docs/bench-obs/EVOLVELOOP_BENCHMARK_OBSERVABILITY_SPEC_v1.0.md` |
| Measurement Plane | `orchestrator/src/telemetry/measurement-plane/` |
| Live LLM path | `orchestrator/src/v3/evaluation/live/` |
| Suites/cases | `benchmarks/bench-obs/` |
| Gate script | `scripts/v3/run-bench-obs-gate.mjs` |
| Acceptance matrix | `docs/benchmark/BENCHMARK_ACCEPTANCE_MATRIX.md` |
| Evidence | `docs/benchmark/evidence/gate.v3-benchmark-observability.json` |

## Reproduce

```bash
cd orchestrator && npx tsc
cd .. && node scripts/v3/run-bench-obs-gate.mjs
```

Live Gate L requires:

```bash
export EVOLVELOOP_HARNESS_CONSENT=true
# plus authenticated Claude CLI or provider API key
evolve eval live-suite --data-dir /tmp/el-live
```

Without consent/auth, Gate L is honestly `BLOCKED` (dry plumbing only).
