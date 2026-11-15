# Orchestrator directive — M19 integrate M15 F02 daemon

**To:** M19 (`feature/v4-integration`)  
**ACCEPTED tip:** `cbb38d2e0e28860f8f88adef5c2261cce3aa725e`  
**Source:** `/home/gaab/Downloads/EvolveLoop-v4-m15` · `feature/v4/m15-f02-daemon`  
**Engine:** `c34367d`

## Pre-merge (orchestrator verified)

- Files: `v4/api/daemon-approvals.ts`, `M15-F02-DELIVERY.md`, narrow `daemon.ts` approve/reject, `tests/v4/api/f02-daemon-actor.test.ts`
- CLI `applyCliApprovalStoreFallback` unchanged
- Orch vitest: api+f02 **22/22**, full v4 **353/353**
- F02 still **PARTIALLY MITIGATED** (live daemon has no in-process PDP; privileged IPC token not operator identity) — do not invert to CLOSED

## Procedure

1. PATH + nvm node; no npm install.
2. `git merge --no-ff cbb38d2e0e28860f8f88adef5c2261cce3aa725e`
3. `cd orchestrator && npx vitest run tests/v4` (expect **353**).
4. Update `INTEGRATION-STATUS.md`, `WAVE5-STATUS.md`; commit.
5. No APPROVED; no M09; no claim F02 globally closed; no V3.7 edits.

## After

Report HEAD + merge. Next: M06-authz (Wave 5 Trust) or document Wave 5 partial exit.
