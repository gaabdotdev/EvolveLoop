# EVOLVELOOP-BENCH-OBS-SPEC v1.0

**Status:** Canonical reference for this implementation branch.  
**Source:** User-provided technical specification in `/evolve` invocation (2026-11-11).  
**Implementation branch:** `feature/bench-obs-v1`

The full normative text was supplied in the session prompt (`EVOLVELOOP-BENCH-OBS-SPEC` / Master Implementation Prompt). This repository file is the **index + binding pointer** so agents and CI can locate the contract without inventing requirements.

## Binding documents in-repo

| Doc | Role |
|-----|------|
| [ARCHITECTURE-GAP-ANALYSIS.md](ARCHITECTURE-GAP-ANALYSIS.md) | Phase 0 reconciliation vs existing Core |
| [adr/ADR-BENCH-OBS-0001-measurement-plane.md](adr/ADR-BENCH-OBS-0001-measurement-plane.md) | Placement & non-duplication decisions |
| [ACCEPTANCE-MATRIX.md](ACCEPTANCE-MATRIX.md) | Gates A–G status |
| [README.md](README.md) | Operator surface |
| [OVERHEAD.md](OVERHEAD.md) | Self-measurement methodology |

## Implementation map

| Spec component | Code |
|----------------|------|
| Event Contract | `orchestrator/src/telemetry/measurement-plane/envelope.ts` |
| Collector | `…/collector.ts` |
| Event/Artifact Store | `…/event-store.ts` |
| Trace & Hierarchy | `…/trace/builder.ts` |
| Metrics Engine + catalog | `…/metrics/*` |
| Evaluation Engine | `…/evaluation/engine.ts` |
| Benchmark Runner + strategies | `…/benchmark/*` |
| CLI | `evolve telemetry|benchmark` via `…/cli/commands.ts` |
| Dataset | `benchmarks/bench-obs/` |

## Non-negotiables preserved

- Local-first; no automatic third-party telemetry.
- Measurement Plane does not silently change orchestration policy.
- Tokens/costs never invented; provenance required.
- Append-only facts; corrections via new events.
- TRUE_FULL_PASS requires verified evidence, not agent declaration.
