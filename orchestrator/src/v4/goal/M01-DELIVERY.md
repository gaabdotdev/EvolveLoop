# META M01 — Delivery record

| Field | Value |
|-------|-------|
| Meta | M01 — Goal Compiler & Work State |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m01` · `feature/v4/m01-goal-work` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (R1–R16 binding) |
| Contracts | import-only `orchestrator/src/v4/contracts/` (not edited) |
| Merge to `feature/v4-integration` | **Not done** |
| Self-assessed status | **DELIVERED for orchestrator validation** — M01 does not mark itself ACCEPTED |
| Knowledge | `WIKI_ROOT` unset → GAP; grounding = freeze + contracts + constitution §4.1, §4.2, §5, §7.1 |

## 1. Commits

On `feature/v4/m01-goal-work` (no merge to integration). Hashes filled after `git log`.

## 2. Files owned by M01

```
orchestrator/src/v4/goal/**
orchestrator/src/v4/work/**
orchestrator/tests/v4/goal/**
orchestrator/tests/v4/work/**
```

Not owned / not edited: `orchestrator/src/v4/contracts/**`, V3.7 cert surfaces, `feature/v4-integration`.

## 3. What was implemented

### Goal Compiler (`goal/`)

- Intent ingest with D01 source marks (`USER_DIRECT` → CONTROL; repo/issue/web/wiki/tool → UNTRUSTED_DATA).
- Deterministic ambiguity/contradiction detection; minimal blocking questions; visible ASSUMED premises (`INV-GC-03`).
- Untrusted text is never copied into Goal Contract CONTROL fields (objective/scope/criteria).
- Versioning: only HUMAN/PLATFORM; executors rejected (D15); autonomy raise / mandatory-criteria weakening on an ACCEPTED contract require `policy_decision_id` (M10 validates the decision object later).

### Work State (`work/`)

- Typed allowlisted payloads for M01 event types (R2). Top-level `next_action` / `objective` / `permissions` are ignored, never CONTROL.
- Projector + `InMemoryWorkRepository` (`WorkRepositoryPort`). Mutations only by projecting events. Capsule `task_refs` are not an input (INV-CAP-08).
- Task graph via `validateTaskGraph` (INV-TASK-02/05). Progress CONFIRMED is not an executor claim (INV-TASK-04).
- Snapshot persist/hydrate so Work is queryable without chat memory (`persist.ts`).
- `IsolatedEventBuffer` implements `EventLedgerPort` **only** for M01 isolation. It is **not** the Event Ledger (M02). Caller-supplied `fencing` is dropped (R7). Hash chain is tamper-evidence, not non-repudiation (R1). M19 must inject M02.

## 4. Reservations honored (R1–R16)

| ID | M01 action |
|----|------------|
| R1 | Isolation buffer uses `computeEventDigest`; delivery does not claim non-repudiation |
| R2 | Typed allowlist payloads; F12 names ignored |
| R3–R5 | No capsule expiry, `decided_by`, or new id prefixes invented |
| R6 | Capsule accept is M04; M01 does not treat `assertConforms` as F01 |
| R7 | Isolation buffer strips caller `fencing` |
| R8 | No Grant/Approval kinds |
| R9 | No `adapters/v37/identity.ts` edits |
| R10 | No secret canaries added |
| R11 | Canonical JSON left as v1 (contracts) |
| R12–R14 | Policy language / capability formula / signature handles are M10 |
| R15 | Measurement provenance is M12; not claimed here |
| R16 | Hygiene only; no fake INV-WORK-02 |

## 5. Tests

```bash
cd orchestrator && npx vitest run tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/contracts` + `conformance` (M00) | 28 passed |
| `tests/v4/goal` + `tests/v4/work` (M01) | 16 passed |
| **Total `tests/v4`** | **44 passed** |

## 6. Commands run

| Command | Result |
|---------|--------|
| `npx vitest run tests/v4/goal tests/v4/work tests/v4/contracts tests/v4/conformance` | 44 passed |
| `npm install` | **not run** |
| merge to integration | **not run** |
| V3.7 cert edits | **not done** |

## 7. Acceptance self-check

| Mission criterion | Status |
|-------------------|--------|
| Intent → versioned Goal Contract | Met |
| Ambiguity/contradiction + visible premises + minimal questions | Met |
| Work aggregate, stable id, owner=`platform` | Met |
| Progress CONFIRMED/ATTEMPTED/HYPOTHESIS/UNKNOWN/UNVERIFIED | Met (task `progress_status`) |
| Task graph + dependencies | Met |
| Work queryable without chat memory | Met (`WorkRepositoryPort` + snapshot) |
| Executors cannot version the contract (D15) | Met |
| Untrusted intake marked (D01) | Met |
| Tests + delivery report | Met |
| No merge / no npm install / no V3.7 cert edits | Met |

## 8. Limitations

- Durable crash-consistent log, fencing epochs, and restore-from-log are **M02**. Isolation buffer is in-process.
- `policy_decision_id` is format-checked (`pdec_`); M10 must prove the decision exists and is ALLOW.
- Independent VERIFIED/PROVEN remains **M06**. M01 refuses executor VERIFIED and COMPLETED without a WorkProof `outcome`.
- Wiki log not updated (`WIKI_ROOT` unset).
- Pre-existing `tsc` error in `contracts/capsule.ts` is M00; not touched.
