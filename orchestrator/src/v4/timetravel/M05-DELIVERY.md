# META M05 — Delivery record (Time Travel, Replay & Fork)

| Field | Value |
|-------|-------|
| Meta | M05 — Time Travel, Replay & Fork |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m05` · `feature/v4/m05-timetravel` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (R1–R16 binding) |
| Ownership | `orchestrator/src/v4/timetravel/**` + `orchestrator/tests/v4/timetravel/**` |
| Contracts | FROZEN import-only — `Work.forked_from`, `EffectRecord.fork_inherited`, `decideRetry`, Checkpoint |
| ADRs | ADR-V4-0007 (primary), 0003, 0008; constitution §4.6, §7.4, §14, §15.2 |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` already a symlink) |
| V3.7 cert edits | **None** |
| Self-assessed status | **DELIVERED for orchestrator validation** — M05 does not mark itself ACCEPTED and does not claim V4 APPROVED |

## Grounding

Wiki: GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset). Source of truth was freeze + ADR-V4-0007/0003/0008 + frozen contracts in this repo (WAVE3-COMMON).

## 1. What was implemented

Public engine `TimeTravelService` composing Wave 2 APIs (`ledger`, `checkpoint`, `artifacts`, `effects`, `work`, `goal`). M05 does not rewrite those aggregates.

| Piece | Role |
|-------|------|
| Inspect | Read-only view over the M02 per-work log + checkpoints. `InspectOnlyLedger.append` throws. Order key is `seq` (timestamps never order). |
| Fork | New `work_id` (`INV-WORK-05`) with `forked_from { work_id, checkpoint_id, event_seq }`. Base history/artifacts referenced (not copied as live fork events). Grants, credentials, leases **not** inherited (D08). Base EXTERNAL effects cloned via M03 `cloneAsInherited` (`fork_inherited=true` → `decideRetry` FORBIDDEN). Internal Work/Task projections rebuilt from referenced events, then live fork events. First fork checkpoint is a new id; origin cites the base seq. |
| Replay | Declared step mode `RECORDED` (reuse captured I/O) or `REEXECUTE` (new executor call / new EffectRecord). **Never** auto-reapplies EXTERNAL side effects. `REEXECUTE` of EXTERNAL creates a **new** EffectRecord (new id, fresh authorization) and does **not** `beginDispatch`. |
| Honesty pins | `REPLAY_IS_ABSOLUTE_DETERMINISM = false`, `EXACTLY_ONCE_CLAIMED = false`, `HASH_CHAIN_IS_NON_REPUDIATION = false` (constitution §14 / freeze R1). |

Catalog events owned by M05: `work.forked`, `replay.started`. Payloads are allowlisted; F12 names are not CONTROL.

## 2. Reservations honored (R1–R16)

| ID | M05 action |
|----|------------|
| R1 | Hash chain is tamper-evidence, not non-repudiation; pin exported |
| R2 | Typed allowlist payloads for `work.forked` / `replay.started`; F12 names rejected |
| R3–R5 | No capsule expiry, `decided_by`, or new id prefixes; grant/lease ids are not path components |
| R6 | Capsule accept is M04; not claimed here |
| R7 | Fork drafts carry no `fencing`; leases are not inherited |
| R8–R14 | No Grant/Approval kinds invented; Policy remains M10 |
| R15 | Measurement provenance is M12; not claimed |
| R16 | INV-WORK-05 enforced (fork identity ≠ base) |

## 3. Tests

```bash
cd orchestrator && npx vitest run tests/v4/timetravel
cd orchestrator && npx vitest run tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/timetravel/**` | **15 passed** (inspect read-only, fork identity, inherited EXTERNAL FORBIDDEN, RECORDED vs REEXECUTE, no grant copy, first-checkpoint origin) |
| Full `tests/v4` | **217 passed** |

Covered ADR-V4-0007 behaviours:

- Inspect does not append to the base log.
- Fork `work_id` ≠ base; `forked_from` set; base log unchanged.
- Inherited EXTERNAL `decideRetry` → `FORBIDDEN`; `beginDispatch` blocked.
- Grants consume on the fork `work_id` → `work_mismatch` (D08).
- Artifacts referenced by hash (`verify: VERIFIED`), not copied as new blobs.
- RECORDED reuses captured I/O; `auto_reapplied_external: false`; `determinism_claim: "none"`.
- REEXECUTE EXTERNAL → new EffectRecord + new authorization; state stays AUTHORIZED (not dispatched).

## 4. Files owned by M05

```
orchestrator/src/v4/timetravel/**
orchestrator/tests/v4/timetravel/**
```

Not owned / not edited: `orchestrator/src/v4/contracts/**`, V3.7 cert surfaces, `feature/v4-integration`, other metas' trees.

## 5. Commands run

| Command | Result |
|---------|--------|
| `npx vitest run tests/v4/timetravel` | 15 passed |
| `npx vitest run tests/v4` | 217 passed |
| `npm install` | **not run** |
| merge to integration | **not run** |
| V3.7 cert edits | **not done** |

## 6. Acceptance self-check (not ACCEPTED)

| Mission criterion | Status |
|-------------------|--------|
| Inspect + fork without mutating original | Met (tests) |
| Inherited EXTERNAL FORBIDDEN to re-dispatch | Met (`decideRetry` + `beginDispatch`) |
| Replay RECORDED vs REEXECUTE; no auto-reapply EXTERNAL | Met |
| REEXECUTE EXTERNAL → new EffectRecord + auth | Met |
| No absolute replay-determinism claim (§14) | Met (`determinism_claim: "none"`) |
| Tests + delivery report | Met |
| No merge / no npm install / no V3.7 cert / no contracts edits | Met |

Orchestrator / independent review must validate. This report is **DELIVERED**, not ACCEPTED.

## 7. Gaps / limitations

- Wiki grounding: `WIKI_ROOT` unset → GAP.
- M13 ExecutionGateway is not called; INTERNAL `REEXECUTE` without a callback returns `NEED_EXECUTOR`. EXTERNAL `REEXECUTE` authorizes a new effect but never dispatches.
- First fork checkpoint origin is recorded on `ForkResult` / `work.forked` payload; frozen `Checkpoint` has no origin field (cannot be added under freeze).
- Comparison of forks is a two-work-id inspect (`compare`); M17 metrics are out of scope.
- M19 owns process-wide wiring; this engine is constructed with injected ports.
- No exactly-once claim. Replay of models/external services is not deterministic.
