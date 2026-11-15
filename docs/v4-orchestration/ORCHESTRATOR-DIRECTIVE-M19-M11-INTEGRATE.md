# Orchestrator directive — M19 integrate M11 (Wave 5)

**To:** M19 (`feature/v4-integration`)  
**When:** only after orchestrator **ACCEPTED** M11 tip  
**Source:** `/home/gaab/Downloads/EvolveLoop-v4-m11` branch `feature/v4/m11-provenance`

## Pre-merge validation (orchestrator)

1. Tip is descendant of integration baseline ≥ `89b3c89`.
2. Ownership only `orchestrator/src/v4/provenance/**` + `orchestrator/tests/v4/provenance/**` (+ delivery note).
3. No contracts/catalog edits; no V3.7 cert; no other meta trees rewritten.
4. Implements all four `ProvenanceQueryPort` methods.
5. Fail-closed evidence: missing/mismatch/SELF_REPORTED-as-independent never fabricates ids.
6. Independent: `cd orchestrator && npx vitest run tests/v4/provenance` + full `tests/v4`.

## Procedure

1. PATH with nvm node; no `npm install`.
2. `git merge --no-ff <ACCEPTED_TIP>`.
3. Resolve conflicts without changing FROZEN contracts semantics.
4. Recheck `npx vitest run tests/v4`.
5. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`, registries; commit.
6. No APPROVED; no M09 launch; Phase 4 remains PARTIAL until observed baseline.

## After integrate

Prefer next Wave 5 cut: M18 adversarial RO refresh **or** M10-full / M06-authz — not M09 score-routing.
