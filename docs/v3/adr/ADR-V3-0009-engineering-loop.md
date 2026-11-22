# ADR-V3-0009 — V3.4 Engineering Loop

**Status:** Accepted  
**Date:** 2026-11-11  
**Depends on:** V3.3 freeze (`v3.3-freeze` / `422132d`)

## Context

V3.4 requires an integrated engineering cycle: contract → plan → implement → test → review → replan/fix → verify → deterministic `TRUE_FULL_PASS`.

## Decision

1. Implement `EngineeringLoopService` under `orchestrator/src/v3/engineering/`.
2. Stages are recorded on an `EngineeringRun` snapshot; not every objective must run every stage, but the default path covers the Master Document cycle.
3. Workspace mutations use `EngineeringWorkspace` with realpath confinement (not OS sandbox).
4. Implement/fix/review workers in Core are **deterministic** file/test/review agents suitable for CI — LLM harnesses remain classified via `harness matrix` and are not required for the loop gate.
5. `TRUE_FULL_PASS` only via `GoalContractStore.evaluate` after criteria receive evidence IDs.
6. Harness classes: `SUPPORTED|PARTIAL|PROBE_ONLY|DRY_RUN|BLOCKED|UNSUPPORTED` — never call dry-run `SUPPORTED`.

## Consequences

- V3.4 gate can be proven without paid API keys.
- Live harness control remains partial/dry-run until consented real spawn is verified per adapter.
- Held-out LLM quality benchmarks remain optional follow-up, not a substitute for the loop gate.
