# Benchmark & Efficiency (G8 / G18)

**Candidate:** `recovery/pre-v37-cert`  
**Status:** Measurement Plane wired (PARTIAL); token efficiency meta **UNVERIFIED**

## What was done

1. EventBus → Measurement Plane auto-wire on `ExecutionEngine` when `dataPaths` set (ISSUE-MP-WIRING-001).
2. V22 P0 baseline freeze regenerated with local tiktoken (`V22_P0_WRITE_REPORT=1`) after observed drift on task `curta` (145816 → 136657 under prior freeze vs current tokenizer/env).
3. Clean-checkout `npm run build` **PASS** (`CLEAN_BUILD_OK`).

## What was NOT proven

- V3 v0.5 proposed **median ≥30% token reduction** vs naive baseline without quality regression — **not measured** as a certification claim.
- Provider-reported costs often `UNAVAILABLE`.
- Gate L live LLM evidence remains historical on older lines; not re-claimed here as integrated-tip LIVE_E2E.

## Provenance classes in use

`OBSERVED` | `PROVIDER_REPORTED` | `ESTIMATED` | `UNAVAILABLE` — respect Measurement Plane contracts; do not invent tokens.

## Clean CI unit note

Prior clean run: 2 failures (catalog expectation stale; baseline freeze drift). Both addressed on tip. Full clean re-run pending after this commit.
