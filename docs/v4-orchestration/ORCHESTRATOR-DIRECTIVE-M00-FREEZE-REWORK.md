# Orchestrator directive — M00 FREEZE REWORK

**From:** V4 Master Orchestrator  
**To:** M00 owner (`feature/v4/m00-architecture`)  
**Trigger:** Independent freeze review `FREEZE_REJECTED` @ commit `e1b6764`  
**Reviewer:** Task `8cd94458-d2cb-4e30-9f93-79c4b7faeb30`  
**Doc:** `docs/v4/architecture/M00-FREEZE-REVIEW.md`

## Status

- M00 package remains **ACCEPTED as draft architecture** for documentation purposes.
- **Contract freeze** → **REWORK** (do not stamp FROZEN).
- Wave 2 implementers remain **READY but must not start** against tip `1dea128` as frozen API.

## Blocking fixes required (B1–B3)

Reproduce and fix with failing-then-passing tests in `orchestrator/tests/v4/`:

### B1 — Capsule denylist shallow (F01/F12)

`rejectForbiddenFields` only checks root keys. Nested `handoff.permissions` / `handoff.next_action` must fail `validateExecutionCapsule`. Prefer recursive denylist **and** allowlist-parse semantics (unknown keys not forwarded). Update ADR-V4-0006 / INV-CAP-07 notes if needed.

### B2 — `isIndependent` omit-subject = true

`if (!e.subject_executor_ref) return true` contradicts ADR-V4-0009 honesty. Missing subject must **not** qualify as independent (return false / require subject for independence). `validateEvidence` should require `subject_executor_ref` when result is used for PROVEN paths, or `isIndependent` must fail closed.

### B3 — `NOT_EXECUTED` without evidence

ADR-V4-0008: NOT_EXECUTED needs CP-side evidence. Include `NOT_EXECUTED` in INV-EFF-03 evidence requirement. Ensure `decideRetry` cannot create duplicate external dispatch from ambiguous NOT_EXECUTED without reconciliation evidence.

## Process

1. Fix only under M00 ownership (`orchestrator/src/v4/contracts/**`, tests, ADRs as needed).
2. Keep engines out of scope.
3. Do not merge to integration yourself.
4. Re-request freeze review after green tests (orchestrator will dispatch).

## Acceptance for rework

- New tests prove B1–B3 closed.
- Prior 23 tests still pass (or updated intentionally).
- Short `M00-FREEZE-REWORK-DELIVERY.md` with commits + reproduction.
