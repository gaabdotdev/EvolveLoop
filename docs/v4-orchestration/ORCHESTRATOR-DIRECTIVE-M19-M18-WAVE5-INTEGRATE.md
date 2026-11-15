# Orchestrator directive — M19 integrate M18 Wave 5 RO

**To:** M19 (`feature/v4-integration`)  
**When:** after orchestrator **ACCEPTED** M18 Wave5 tip  
**Source:** `/home/gaab/Downloads/EvolveLoop-v4-m18` · `feature/v4/m18-wave5-ro`

## Procedure

1. No npm install; PATH with nvm node.
2. `git merge --no-ff <ACCEPTED_TIP>` (expect `docs/v4/security/**` only).
3. No need for full vitest if docs-only — still run `npx vitest run tests/v4` smoke if merge touches nothing under `orchestrator/` (should be no-op / still green).
4. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`; commit.
5. No APPROVED; no M09; Phase 4 remains PARTIAL.

## After

Prefer M10-full or M06-authz next Wave 5 product cut.
