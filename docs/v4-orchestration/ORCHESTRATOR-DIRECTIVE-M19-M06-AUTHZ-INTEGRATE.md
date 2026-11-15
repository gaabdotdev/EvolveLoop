# Orchestrator directive — M19 integrate M06-authz

**To:** M19 (`feature/v4-integration`)  
**ACCEPTED tip:** `a53419e89ee6f77139ed13018da9781ef59019ba`  
**Source:** `/home/gaab/Downloads/EvolveLoop-v4-m06` · `feature/v4/m06-authz`  
**Engine:** `57680fd7d58ce79da5ee9220ae3b06b25db0e7f1`

## Pre-merge (orchestrator verified)

- Ownership: `orchestrator/src/v4/proof/**` + `orchestrator/tests/v4/proof/**` only
- Orch vitest: proof **37/37**, full v4 **364/364**
- EXTERNAL without citeable authz refs cannot be PROVEN; empty `authorizationFor` ≠ authorized; `generated_by` == subject capped
- Residuals **OPEN** (do not invert): RR-W5-02 (`decided_by` absent), D13 remainder (stale hashes / unanchored `proof_id`), F02 still **PARTIALLY MITIGATED**

## Procedure

1. PATH + nvm node; no npm install.
2. `git merge --no-ff a53419e89ee6f77139ed13018da9781ef59019ba`
3. `cd orchestrator && npx vitest run tests/v4` (expect **364**).
4. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`; commit.
5. No APPROVED; no M09; no claim F02/D13 globally closed; no V3.7 edits.

## After

Report HEAD + merge. Next: Wave 5 **partial exit** (M09 still BLOCKED; F02 PARTIAL; G17 BLOCKED) — do not start M09.
