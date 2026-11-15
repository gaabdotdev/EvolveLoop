# META M12 — Init delivery record (V4.0)

| Field | Value |
|-------|-------|
| Meta | M12 — Predictive Observability init |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m12` · `feature/v4/m12-obs-init` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` status **FROZEN**; reservation **R15** honoured |
| Ownership | `orchestrator/src/v4/observability/**` wrapping `telemetry/measurement-plane` |
| Merge to `feature/v4-integration` | **Not done** (forbidden for this meta) |
| Self-assessed status | **DELIVERED for orchestrator validation** — M12 does not mark itself ACCEPTED |
| Knowledge | `WIKI_ROOT` unset → GAP; grounding = repo contracts + MP code + threat model |

## 1. Scope (Wave 2 init, not M12-pred / M12-final)

Mission `docs/v4-orchestration/prompts/M12-MISSION.md`:

- Events/traces with provenance labels OBSERVED / PROVIDER_REPORTED / ESTIMATED / UNAVAILABLE (plus MP kinds UNKNOWN / HARNESS_REPORTED / DERIVED preserved when explicit).
- Wire to existing Measurement Plane without inventing facts.
- Stagnation / cost-anomaly hooks as honest UNAVAILABLE stubs.

Out of scope this wave: continuous evaluation, versioned benchmarks, provider regression, predictive alerts (M12-pred / M17).

## 2. R15 / TM-V4-F10 behaviour

| Input | Channel | Result |
|-------|---------|--------|
| Missing event provenance | any | `UNKNOWN`, `reported_by=UNAVAILABLE` |
| Explicit `OBSERVED` | `emit` (unauthenticated) | downgraded to `UNKNOWN` |
| Explicit `OBSERVED` | `emitFromControlPlane` | retained; `reported_by` = observer identity, not the plane |
| Missing provenance | control plane | still `UNKNOWN` (R15: default is never OBSERVED) |
| Missing measurement value | any | `UNAVAILABLE`, `value=null` |
| Explicit `UNAVAILABLE` with a number | any | `value` forced to `null` |
| V3 `createMeasurementEvent` default `OBSERVED` / `evolveloop-measurement-plane` | wrap | not persisted |

V3 `envelope.ts` is **not** mutated (ADR-V4-0002: MP envelope reused unchanged). The wrap overrides the default at V4 ingest.

## 3. Other M18 hooks (init, not claimed complete)

| Id | Init behaviour | Not claimed |
|----|----------------|-------------|
| F11 | Wrap redacts arrays, nested objects, measurements, `sk-ant-` / `sk-proj-`, canary | Completeness of secret detection (R10 heuristic) |
| D07 | `computeUnknownProvenanceRate` counts accepted events (OBSERVED counts, DERIVED rate; empty → UNAVAILABLE) | Quarantine (M10) |
| D20 | `incidentSignal()` = UNAVAILABLE | Freeze / cascade revocation (M10/M02) |

## 4. Tests run (this worktree)

```text
npx vitest run tests/v4/observability tests/v4
```

Result: **59/59 passed** (31 M12 + 28 existing M00 contracts/conformance). No `npm install`. `orchestrator/node_modules` remains the existing symlink.

`npx tsc --noEmit` reports a pre-existing error in `src/v4/contracts/capsule.ts` (M00-owned, FROZEN — not modified). No errors under `src/v4/observability/**`.

## 5. Files

```
orchestrator/src/v4/observability/**
orchestrator/tests/v4/observability/**
```

Not modified: `orchestrator/src/telemetry/measurement-plane/**`, V3.7 cert surfaces, `orchestrator/src/v4/contracts/**`.

## 6. Composition note for M19

Wire `ObservabilitySink` as `MeasurementSinkPort`. Callers other than the Control Plane must use `emit`. Only in-process CP code may call `emitFromControlPlane`.
