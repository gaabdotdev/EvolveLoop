# META M17 — Delivery record (Benchmarks & Economic Proof, early)

| Field | Value |
|-------|-------|
| Meta | M17 — Benchmarks & Economic Proof (V4.2 early / Wave 4) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m17` · `feature/v4/m17-benchmarks-early` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (R1–R16 honored) |
| Ownership | `docs/v4/benchmarks/**` (primary); `orchestrator/src/v4/benchmarks/**` + `orchestrator/tests/v4/benchmarks/**` (optional harness) |
| Primary ADR | ADR-V4-0010 (disclosure frozen; formula deferred; M17 owns fair baselines) |
| M08 methodology | `cprof-methodology.provisional.v0` @ `0.1.0` — still **PROVISIONAL** (not ACCEPTED by this cut) |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` already a symlink) |
| V3.7 cert edits | **None** |
| Contracts edits | **None** (FROZEN import-only) |
| Self-assessed status | **DELIVERED for orchestrator / independent review** — M17 does not mark itself ACCEPTED or APPROVED |

## Grounding

Wiki: GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset). WAVE4-COMMON allows this. Source of truth was freeze + ADR-V4-0010 + M08 `METHODOLOGY.md` / `M08-DELIVERY.md` (PROVISIONAL) + M12 provenance (R15 / F10) + constitution §4.8, §4.9, §13, §15.3, §16 economy + ACCEPTANCE-CRITERIA M09/M17.

## 1. What was implemented

Early fair-baseline **definition**, not a measured scoreboard.

| Piece | Role |
|-------|------|
| `PROTOCOL.md` | Workload identity, harness roles, comparison scope, self-score ban |
| `SCHEMA.md` + canonical JSON | Reproducible `FairBaselineArtifact` (not a ContractKind) |
| `IMPROVEMENT-BAR.md` | M09 measurable-improvement bar; numeric floors **UNAVAILABLE** |
| `M08-EVIDENCE.md` | What M08 still needs before methodology ACCEPTED — **no stamp** |
| Schema harness | Validate honesty; evaluate claims; refuse L2/L3 ranking |

Canonical artifact `artifacts/el-v4-fair-baseline.declared-unavailable.v0.json`: every primary axis `DECLARED_UNAVAILABLE`, `production_scores: ABSENT`, `this_artifact_stamps_methodology_accepted: false`.

Honesty pins: `PRODUCTION_SCORES_EXIST = false`, `METHODOLOGY_ACCEPTED_BY_M17 = false`, `BASELINE_MAY_DRIVE_L2_L3_ROUTING = false`.

## 2. Invariants and honesty

- INV-FBA-01: quality-proof provenance ∈ {OBSERVED, HARNESS_REPORTED}; SELF_REPORTED never ground truth.
- INV-FBA-02: UNAVAILABLE/ESTIMATED ⇒ `value === null` and `quality_proof === false`.
- INV-FBA-03: no `global_score` / `rank` / `overall_score`.
- INV-FBA-04: `schema_validator` cannot emit quality-proof metrics.
- INV-FBA-05: `DECLARED_NOT_RUN` cases cannot share an artifact with quality-proof metrics.
- INV-FBA-06: M17 never stamps M08 methodology ACCEPTED.
- INV-FBA-07: RECORDED `verified_completion` requires verifier ≠ executor.
- INV-FBA-08: no ranking / L2/L3 preference API.

Test fixtures that carry numbers are labelled `workload_executor` + `HARNESS_REPORTED` and `limitations: test fixture; not a production score`. They are not production baselines.

## 3. Reservations honored (R1–R16)

| ID | M17 action |
|----|------------|
| R1 | No hash-chain non-repudiation claim |
| R2 | No new catalog event types; no untyped CONTROL payloads |
| R3–R5 | No new `ID_PREFIX` / catalog kind (`FairBaselineArtifact` is M17-local) |
| R6 | Capsule accept is M04 |
| R7 | No ledger append / fencing |
| R8 | No Grant/Approval kinds |
| R9 | No `adapters/v37/identity.ts` |
| R10 | No secret canaries added |
| R11 | Canonical JSON left as v1 |
| R12 | Capability **formula still deferred**; this cut does not pick Elo/BT/Bayesian |
| R13–R14 | Policy language / signature handles are M10 |
| R15 | Missing measurements stay UNAVAILABLE; never default OBSERVED |
| R16 | Hygiene only |

## 4. Tests

```bash
cd orchestrator && npx vitest run tests/v4/benchmarks tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/benchmarks/**` | **22 passed** (4 files) |
| full `tests/v4` | **306 passed** (50 files) |

No `npm install`. No V3.7 cert paths modified. `npx tsc --noEmit` reports no errors under `src/v4/benchmarks/**`.

## 5. Files

```
docs/v4/benchmarks/**
orchestrator/src/v4/benchmarks/**
orchestrator/tests/v4/benchmarks/**
```

Not modified: `orchestrator/src/v4/contracts/**`, `orchestrator/src/v4/capability/**`, V3.7 cert surfaces, `feature/v4-integration`, `docs/v4-orchestration/**`.

## 6. Gaps / not in this first cut

- No executed workload run — canonical artifact is DECLARED_UNAVAILABLE (**GAP** for economic proof).
- Numeric improvement floors UNAVAILABLE (**GAP** until observed sample + RFC).
- M08 residuals (formula, recency decay, provider-version identity, minimum sample for inference) still **GAP**; listed in `M08-EVIDENCE.md`.
- Methodology **not ACCEPTED**; must not be cited as quality evidence or production routing readiness.
- No L2/L3 routing by score; Policy still owns sensitive work (D04).
- V3 `benchmarks/bench-obs` is not this suite.
- Wiki grounding: `WIKI_ROOT` unset → GAP.
- Impossible Handoff remains M16.

## 7. Independent review

This delivery is **not** self-ACCEPTED. Orchestrator / M20 should reassess via the test suite, ADR-V4-0010, and `M08-EVIDENCE.md`, not via this report's claims. M09 may use the protocol/bar only against **recorded** quality-proof artifacts; none exist yet.
