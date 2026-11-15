# V4 Benchmarks & Economic Proof (M17 — early / Wave 4)

| Field | Value |
|-------|-------|
| Owner | **M17** |
| Cut | Early fair-baseline documentation (Wave 4) |
| Status | **DELIVERED for orchestrator validation** — not ACCEPTED, not APPROVED |
| ADR | ADR-V4-0010 (disclosure frozen; formula deferred) |
| M08 methodology | `cprof-methodology.provisional.v0` @ `0.1.0` — still **PROVISIONAL** |
| Production scores | **ABSENT** (none invented in this cut) |

This package defines a **fair, comparable baseline** so:

1. M08 can later move methodology toward ACCEPTED (this cut does **not** stamp it).
2. M09 can later claim “measurable improvement” against a named baseline instead of a self-scored executor.

It does **not** run production workloads, invent numeric quality scores, rank executors, or drive L2/L3 routing.

## Documents

| Path | Role |
|------|------|
| [PROTOCOL.md](PROTOCOL.md) | Workload, harness identity, comparison scope, self-score ban |
| [SCHEMA.md](SCHEMA.md) | Reproducible `FairBaselineArtifact` shape + provenance rules |
| [IMPROVEMENT-BAR.md](IMPROVEMENT-BAR.md) | M09 “measurable improvement” bar (numeric floors UNAVAILABLE) |
| [M08-EVIDENCE.md](M08-EVIDENCE.md) | Evidence M08 still needs before methodology ACCEPTED |
| [artifacts/el-v4-fair-baseline.declared-unavailable.v0.json](artifacts/el-v4-fair-baseline.declared-unavailable.v0.json) | Canonical declared-UNAVAILABLE artifact (schema example, not a score) |
| [M17-DELIVERY.md](M17-DELIVERY.md) | Delivery record for orchestrator / M20 |

Optional executable harness (schema + honesty checks only): `orchestrator/src/v4/benchmarks/**`.

## Not this package

- Frozen contracts (`orchestrator/src/v4/contracts/**`) — M00
- Capability formula / ACTIVE profiles — M08 (still PROVISIONAL)
- Adaptive routing engine — M09 (blocked until this baseline exists **and** methodology can be independently accepted)
- V3 Measurement Plane smoke suite `benchmarks/bench-obs/**` — not a V4 fair economic baseline
- V3.7 cert evidence trees — forbidden to edit
