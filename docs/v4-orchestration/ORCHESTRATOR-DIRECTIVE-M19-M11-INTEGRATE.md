# Orchestrator directive — M19 integrate M11 (Wave 5)

**To:** M19 (`feature/v4-integration`)  
**ACCEPTED tip:** `f1222f6d518dffc030991a992cdcc9e5e5b5acfb` on `feature/v4/m11-provenance`  
**Source worktree:** `/home/gaab/Downloads/EvolveLoop-v4-m11`  
**Engine commit:** `9b56c81` (delivery stamp `f1222f6`)

## Pre-merge (orchestrator already verified)

- Ownership only `orchestrator/src/v4/provenance/**` + `tests/v4/provenance/**`
- Contracts/V3.7 untouched
- Orch vitest: provenance **31/31**, full v4 **337/337**

## Procedure

1. PATH with nvm node; no `npm install`.
2. Work ONLY in `/home/gaab/Downloads/EvolveLoop-v4-integration`.
3. `git merge --no-ff f1222f6` (full hash above).
4. `cd orchestrator && npx vitest run tests/v4` must pass (expect ≥337).
5. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`; commit orch record.
6. Do **not** launch M09; Phase 4 remains PARTIAL; no APPROVED; no V3.7 edits.

## After

Report HEAD, merge hash, vitest counts. Next Wave 5 cut left to orchestrator (M18 RO / M10-full).
