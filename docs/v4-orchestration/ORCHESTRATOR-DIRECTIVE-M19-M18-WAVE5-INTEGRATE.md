# Orchestrator directive — M19 integrate M18 Wave 5 RO

**To:** M19 (`feature/v4-integration`)  
**ACCEPTED tip:** `5e8bc7022f3f5403a34d98932785586ff4b23f17`  
**Source:** `/home/gaab/Downloads/EvolveLoop-v4-m18` · `feature/v4/m18-wave5-ro`

## Pre-merge (orchestrator verified)

- Diff only `docs/v4/security/**` (3 files)
- No product code; covers F02/F07/F14/D13/D16/D17 + score honesty + Phase4/M09
- Tip `5e8bc70`

## Procedure

1. PATH with nvm node; no npm install.
2. Work ONLY in `/home/gaab/Downloads/EvolveLoop-v4-integration`.
3. `git merge --no-ff 5e8bc7022f3f5403a34d98932785586ff4b23f17`
4. Optional smoke: `cd orchestrator && npx vitest run tests/v4` (docs-only — expect still **337/337**).
5. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`; commit.
6. No APPROVED; no M09; Phase 4 PARTIAL; do not invert M18 OPEN residuals into “closed”.

## After

Report HEAD + merge hash. Orchestrator opens M10-full next (F02 V3 CLI residual RR-W5-01).
