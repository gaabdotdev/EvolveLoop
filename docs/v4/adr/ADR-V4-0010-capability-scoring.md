# ADR-V4-0010 — Capability scoring methodology (placeholders)

| Field | Value |
|-------|-------|
| Status | DEFERRED (methodology); PROPOSED-DEFAULT (disclosure contract) |
| Date | 2026-11-15 |
| Decision gate | M08 + M17 before V4.2 Phase 4 exit |
| Meta | M00 (placeholders); M08 (methodology); M17 (baselines) |
| Constitution | §4.8, §15.1 scoring enviesado, §15.2 Capability Intelligence |
| M18 | F10, D04 |
| Contracts | `capability-profile.ts` |

## Context

§15.2: which evaluation methodology, and how to control recency, sample, variance and provider change?

Inventing a scoring formula now would freeze a fake science. Constitution §4.8 forbids self-assessment and context-free rankings.

## Decision

**Defer the formula. Freeze the disclosure shape.**

Every `CapabilityProfile` MUST carry: context (`work_category`, `task_kind`, environment), per-metric `sample_size`, window, uncertainty interval, provenance ∈ {OBSERVED, DERIVED, PROVIDER_REPORTED, HARNESS_REPORTED}, `source_refs`, methodology `{id, version, status}`.

- `methodology.status = PLACEHOLDER | PROVISIONAL | ACCEPTED`.
- `profile.status = ACTIVE` only if methodology is `ACCEPTED` (INV-CPROF-04).
- No `global_score` / `rank` / `overall_score` (INV-CPROF-03).
- SELF_REPORTED / UNKNOWN / ESTIMATED / UNAVAILABLE cannot support a metric (INV-CPROF-01).
- Scores for **sensitive** work are constrained by Policy, not by score alone (D04) — M09/M10.

Until M08 publishes an ACCEPTED methodology, production routing MUST treat profiles as PROVISIONAL and must not prefer an executor for L2/L3 work on score.

Placeholder methodology id: `cprof-methodology.placeholder.v0` (not to be cited as evidence of quality).

## Consequences

- M00 does not pick Elo, Bradley-Terry, or Bayesian models.
- M17 owns fair baselines that any later methodology must beat.

## Alternatives rejected

- **Ship a global 0–100 score for V4.0:** constitution forbids it; would poison M09 (D04).
- **Omit uncertainty until we know the formula:** then we cannot even store honest data.

## Residual uncertainty

Formula, recency decay, provider-version identity, and minimum sample: M08 RFC. Decision date: Phase 4 exit (V4.2).
