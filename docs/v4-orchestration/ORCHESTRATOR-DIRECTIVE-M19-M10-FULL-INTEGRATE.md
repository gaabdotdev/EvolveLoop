# Orchestrator directive — M19 integrate M10-full (F02)

**To:** M19 (`feature/v4-integration`)  
**ACCEPTED tip:** `fd8adf730ef3789b1f1ef4f9a8110661f09664e5`  
**Source:** `/home/gaab/Downloads/EvolveLoop-v4-m10` · `feature/v4/m10-policy-full`  
**Engine:** `52b555c`

## Pre-merge (orchestrator verified)

- Ownership: `policy/**`, `adapters/v37/policy.ts`, narrow `cli/v35-commands.ts`, `tests/v4/policy/**`
- Orch vitest: policy **41/41**, full v4 **343/343**
- F02 CLI store fallback refused; residuals (V3 daemon actor, RR-W5-02) remain OPEN — do not invert

## Procedure

1. PATH + nvm node; no npm install.
2. `git merge --no-ff fd8adf730ef3789b1f1ef4f9a8110661f09664e5`
3. `cd orchestrator && npx vitest run tests/v4` (expect **343**).
4. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`; commit.
5. No APPROVED; no M09; Phase 4 PARTIAL; do not claim F02 globally closed.

## After

Report HEAD + merge. Next: M06-authz or M15 IPC daemon actor residual (orchestrator chooses).
