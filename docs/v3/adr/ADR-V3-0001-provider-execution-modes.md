# ADR-V3-0001 — Explicit provider execution modes

**Status:** Accepted  
**Date:** 2026-11-11  
**Related:** Master v0.6 §20.3.1, §20.7 R1, §21.1

## Context

`run-engine` `setupProviders()` registers `createMockProvider(id)` for every provider that is not `cursor-skill` with a `jobsDir`. Runs can appear successful while executing mocks. Master requires unambiguous `mock` / `real` / `discovery` behavior and fail-closed real mode.

## Decision

1. Introduce `--provider-mode mock|real` on `run-engine`.
2. `--discovery` remains an orthogonal flag (runtime manifest discovery) and does not imply mock.
3. **mock:** may register MockProvider; registry may be supplemented for simulation; summary MUST include `provider_mode: "mock"`.
4. **real:** load manifests via `PluginLoader`:
   - `deterministic` / `shell` → real DeterministicProvider
   - `cursor-skill` → requires `jobsDir` + JobFileExecutor; else fail closed
   - `mock` plugin type → only if manifest explicitly declares mock
   - missing/unsupported adapter → **exit with error**, never silent MockProvider
5. When `--provider-mode` omitted: default **`mock`** for backward compatibility with existing scripts/tests, but emit stderr warning that execution is simulated.
6. Summary JSON always includes `provider_mode` and `providers_registered` classification counts.

## Consequences

- Callers wanting real deterministic FS/shell must pass `--provider-mode real`.
- CI/docs must stop treating default `run-engine` as production execution.
- Discovery + real can coexist; discovery still cannot invent mock success for missing adapters in real mode.

## Non-goals

- Full product CLI/TUI
- Claiming external harnesses are governed merely because jobs exist
