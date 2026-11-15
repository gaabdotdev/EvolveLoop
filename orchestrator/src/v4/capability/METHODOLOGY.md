# cprof-methodology.provisional.v0 — Capability scoring methodology

| Field | Value |
|-------|-------|
| id | `cprof-methodology.provisional.v0` |
| version | `0.1.0` |
| status | **PROVISIONAL** |
| ADR | ADR-V4-0010 |
| Gate to ACCEPTED | M17 fair baselines exist **and** an independent review accepts a later RFC |
| Must not be cited as | evidence of executor quality, production ranking, or L2/L3 routing readiness |

Placeholder id `cprof-methodology.placeholder.v0` remains documented by ADR-V4-0010. It is **not** this methodology and is **not** evidence of quality.

## 1. What this cut freezes

The **disclosure shape** already frozen in `capability-profile.ts`:

- context (`work_category`, `task_kind`, optional `environment`)
- per-metric `sample_size` (integer ≥ 1)
- `window` `{from, to}` (ISO-8601 UTC)
- `uncertainty` `{method, lower, upper}` with `lower <= upper`
- `provenance` ∈ {OBSERVED, DERIVED, PROVIDER_REPORTED, HARNESS_REPORTED}
- `source_refs` (non-empty)
- `methodology` `{id, version, status}`

No `global_score` / `rank` / `overall_score`. Profile `status = ACTIVE` only if methodology `status = ACCEPTED`. This published methodology is **not** ACCEPTED, so this engine **never** emits ACTIVE.

## 2. What this cut does **not** freeze (residuals → M08 RFC at Phase 4 exit)

These remain **GAP**. This document does not pick a formula:

| Residual | Status |
|----------|--------|
| Ranking / aggregation formula (Elo, Bradley-Terry, Bayesian, 0–100) | **not chosen** |
| Recency decay | **not chosen** |
| Provider-version identity beyond `ExecutorRef.executor_version` | **not chosen** |
| Minimum sample for *inference* (contract minimum is 1 for disclosure) | **not chosen** |

`sample_size = 1` is structurally valid so honest single observations can be stored. It is **not** a claim that n=1 supports comparative inference.

## 3. Provenance composition (F10 / D04 / R15)

Measurements are normalized with **M12** defaults before they can become metric input:

- Missing event provenance → UNKNOWN, never OBSERVED.
- Unauthenticated / payload-asserted OBSERVED → UNKNOWN (downgraded).
- UNKNOWN, UNAVAILABLE, ESTIMATED, SELF_REPORTED **cannot** support a metric (INV-CPROF-01).
- OBSERVED is accepted only on the in-process `control_plane` channel (same pattern as `emitFromControlPlane`).

SELF_REPORTED executor claims are recorded nowhere as capability metrics.

## 4. Point interval (disclosure, not a confidence interval)

When a single authenticated observation has no variance estimate, uncertainty method `point_interval.v0` sets `lower = upper = value`. That discloses “no interval was computed”. It is **not** a 95% CI and must not be treated as one.

## 5. Routing

Until this methodology is **ACCEPTED** (not now):

- Production routing MUST treat profiles as PROVISIONAL.
- Helpers in this package **must not** prefer an executor for L2/L3 work on score.
- This cut also refuses score preference at L0/L1 so callers cannot “preview” a ranking.
- Sensitive work is constrained by Policy, not by score (D04). M09/M10 own that gate.

## 6. Honesty

- Do not invent numeric scores.
- Do not treat PROVIDER_REPORTED as CP-observed.
- Do not treat this PROVISIONAL document as a completed science.
- M17 owns fair baselines that any later methodology must beat.
