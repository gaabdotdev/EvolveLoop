# META M08 — Delivery record (Capability Intelligence)

| Field | Value |
|-------|-------|
| Meta | M08 — Capability Intelligence (V4.2 first cut) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m08` · `feature/v4/m08-capability` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (reservations R1–R16 honored) |
| Ownership | `orchestrator/src/v4/capability/**` + `orchestrator/tests/v4/capability/**` |
| Primary ADR | ADR-V4-0010 (disclosure frozen; formula deferred) |
| Methodology | `cprof-methodology.provisional.v0` @ `0.1.0` — **PROVISIONAL** (not ACCEPTED) |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` already symlinked) |
| V3.7 cert edits | **None** |
| Contracts edits | **None** (FROZEN import-only) |
| Self-assessed status | **DELIVERED for orchestrator / independent review** — M08 does not mark itself ACCEPTED or APPROVED |

## 1. What was implemented

| Piece | Role |
|-------|------|
| `CapabilityProfileStore` | `CapabilityProfilePort.profilesFor` — in-memory, insertion order, never score-sorted |
| `assembleProfile` / `put` | Disclosure + INV-CPROF-01..04; OBSERVED requires control-plane attestation (F10) |
| `estimateFromMeasurement` | Compose M12 provenance defaults; refuse unsupported kinds |
| `adviseExecutorPreference` | Always `preference: FORBIDDEN`; empty `ranked_executor_ids` |
| `METHODOLOGY.md` | Published PROVISIONAL methodology + residuals (no formula) |

Profiles carry the frozen disclosure shape: context, sample_size, window, uncertainty, provenance, source_refs, methodology. Engine status in this cut is **PROVISIONAL** or **STALE** (expired), never **ACTIVE**.

## 2. Invariants and honesty

- INV-CPROF-01: SELF_REPORTED / UNKNOWN / ESTIMATED / UNAVAILABLE cannot support a metric.
- INV-CPROF-02: sample_size ≥ 1; uncertainty interval required (`lower <= upper`).
- INV-CPROF-03: no `global_score` / `rank` / `overall_score` (walked at any depth).
- INV-CPROF-04: ACTIVE requires ACCEPTED methodology — this cut recognizes **no** ACCEPTED methodology (M17 baselines absent).
- Unauthenticated / payload-asserted OBSERVED is not capability input (M12 defaults, F10/D04).
- No helper prefers an executor by score for L2/L3 (or L0/L1 in this cut). Sensitive routing remains Policy (D04), not score.

## 3. Reservations honored (R1–R16)

| ID | M08 action |
|----|------------|
| R1 | No hash-chain non-repudiation claim |
| R2 | No new catalog event types; no untyped CONTROL payloads |
| R3–R5 | No capsule expiry / `decided_by` / new id prefixes invented |
| R6 | Capsule accept is M04 |
| R7 | No ledger append / fencing |
| R8 | No Grant/Approval kinds |
| R9 | No `adapters/v37/identity.ts` |
| R10 | No secret canaries added |
| R11 | Canonical JSON left as v1 |
| R12 | Capability **formula still deferred**; only disclosure + PROVISIONAL methodology |
| R13–R14 | Policy language / signature handles are M10 |
| R15 | Measurement provenance composed via M12 (UNKNOWN/UNAVAILABLE, never default OBSERVED) |
| R16 | Hygiene only |

## 4. Tests

```bash
cd orchestrator && npx vitest run tests/v4/capability tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/capability/**` | **30 passed** (6 files) |
| full `tests/v4` | **266 passed** (43 files) |

No `npm install`. No V3.7 cert paths modified.

## 5. Files

```
orchestrator/src/v4/capability/**
orchestrator/tests/v4/capability/**
```

Not modified: `orchestrator/src/v4/contracts/**`, V3.7 cert surfaces, `feature/v4-integration`.

## 6. Gaps / not in this first cut

- Ranking/aggregation formula, recency decay, provider-version identity, minimum sample for inference — **GAP** (ADR-V4-0010 residuals; Phase 4 RFC after M17).
- Methodology **not ACCEPTED**; must not be cited as quality evidence or production routing readiness.
- No `CapabilityProfile` event types in the FROZEN catalog; M19/RFC if persistence via Event Ledger is required.
- Store is in-memory; M19 wires durability.
- Wiki grounding: `WIKI_ROOT` unset → GAP; source of truth was freeze + ADR-V4-0010 + contracts + M12 provenance.
- Percentile/Elo computation is not implemented (would be invented science).

## 7. Independent review

This delivery is **not** self-ACCEPTED. Orchestrator / M20 should reassess via the test suite and ADR-V4-0010, not via this report's claims.
