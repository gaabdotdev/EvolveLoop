# META M12 — Predictive Observability init (V4.0)

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m12` |
| Branch | `feature/v4/m12-obs-init` |
| Ownership | `orchestrator/src/v4/observability/**` (wrap Measurement Plane) |
| Chapters | 4.13, 6.1 |

## Implement

- Events/traces with provenance labels: OBSERVED / PROVIDER_REPORTED / ESTIMATED / UNAVAILABLE
- Wire to existing measurement-plane without inventing facts
- Minimal stagnation/cost anomaly hooks (can be stubs with honest UNAVAILABLE)

## Accept

Metrics do not invent facts; provenance explicit; reproducible unit tests.
