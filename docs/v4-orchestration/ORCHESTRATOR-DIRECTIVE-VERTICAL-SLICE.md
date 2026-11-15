# Orchestrator directive — V4.0 vertical Intent→WorkProof

**To:** M19 (integration worktree) — may use helpers from ACCEPTED ownership trees read-only  
**From:** V4 Master Orchestrator  
**When:** 2026-11-15T14:22Z  
**Gate:** Phase 2 → Phase 3 (MASTER-PLAN)

## Goal

Prove on `feature/v4-integration` HEAD a **single automated vertical slice**:

```text
Intent (marked) → Goal Contract → Work (events on M02 ledger)
  → Effect records (M03) → Evidence/WorkProof (M06) → status ≠ self-reported PROVEN abuse
```

Optional touches (if already ACCEPTED APIs allow without new product metas):

- M10 deny-default / grant check on one decision path
- M12 redaction or CE event on one log line

## Constraints

- Work **only** in `/home/gaab/Downloads/EvolveLoop-v4-integration`
- New test file under `orchestrator/tests/v4/vertical/` (M19 integration ownership)
- **Do not** edit `contracts/**` (FROZEN)
- **Do not** invent cross-meta APIs — compose public exports from `goal/`, `work/`, `ledger/`, `checkpoint/`, `artifacts/`, `effects/`, `proof/`, `policy/`, `observability/`, `adapters/v37/`
- Prefer in-memory / temp-dir stores already used by unit tests
- M01’s `IsolatedEventBuffer` is **not** M02 — vertical slice MUST use M02 `EventLedger` (or equivalent public runtime)
- Honesty: verifier ≠ subject executor; open effects must cap PROVEN at PARTIAL if that rule is frozen
- No V3.7 cert edits; no `npm install` unless broken symlink
- Do **not** claim V4 APPROVED

## Done when

1. `npx vitest run tests/v4/vertical` passes
2. Full `npx vitest run tests/v4` still green
3. Short delivery note: `docs/v4-orchestration/VERTICAL-SLICE-V40.md` with steps exercised + tip hash
4. Self-status: DELIVERED for orchestrator validation (not self-ACCEPTED)

## Out of scope

Capsule handoff (M04), replay/fork (M05), Impossible Handoff, marketplace, CLI product surface beyond the test.
