# Measurable-improvement bar (for M09)

Constitution V4.2 exit: adaptive decisions demonstrate measurable improvement in **quality, cost, or completion** against a fair baseline.

M09 acceptance (M00): “Measurable improvement vs M17 baseline; sensitive routing constrained by Policy not score (D04).”

This document is the **bar**. Numeric floors are **UNAVAILABLE** because this cut has no observed production runs. Placeholders are labelled. Do not treat them as 0%, 10%, or any other invented threshold.

| Field | Value |
|-------|-------|
| Bar id | `el-v4-measurable-improvement.bar` |
| Bar version | `0.1.0` |
| Baseline | Canonical suite `el-v4-fair-baseline` @ `0.1.0` |
| Primary comparator | `v4_non_adaptive` (PROTOCOL.md §3.1) |
| Numeric floors | `{ value: null, provenance: "UNAVAILABLE" }` |

## 1. Claim object (what M09 must present)

An improvement claim is a comparison of two `FairBaselineArtifact` values:

- `baseline` — fair baseline (same suite/version/env/harness class)
- `candidate` — the adaptive / M09 run
- `claim_kind` — `measurable_improvement` (this bar) or `tradeoff_disclosure` (not an improvement claim)

M17’s harness evaluates the claim. It does **not** choose executors.

## 2. Structural gates (must all pass)

Before any number is looked at:

1. Both artifacts validate (`INV-FBA-*`).
2. Same `suite_id`, `suite_version`, case-id set, `work_category`, `task_kind`, `environment.class`.
3. Candidate does not drop baseline cases.
4. Neither artifact carries ranking fields.
5. Neither artifact is used to prefer L2/L3 executors.
6. Verifier ≠ executor on any RECORDED `verified_completion`.
7. Metrics cited by the claim have `quality_proof: true` and provenance ∈ {`OBSERVED`, `HARNESS_REPORTED`}.

Failure ⇒ verdict `INCOMPARABLE` or `INVALID`, never “improved”.

## 3. Primary axes (constitution)

| Axis | Metric | Direction | Source |
|------|--------|-----------|--------|
| Cost | `cost_per_verified_result` | lower is better | §4.9, §13.2 north metric |
| Quality | `validated_quality` | higher is better | V4.2 exit; §13 quality |
| Completion | `verified_completion` | higher is better | V4.2 exit; independently verified |

Secondary axes (must not be silently sacrificed; not required to improve): `latency_ms_p95`, `recovery_rate`, `handoff_success_rate`, `confirmed_state_loss` (lower better), `human_interventions_per_work` (lower better).

## 4. Verdicts

| Verdict | Meaning |
|---------|---------|
| `UNAVAILABLE` | A cited primary axis is not quality-proof (canonical early state) |
| `INCOMPARABLE` | Structural gates failed |
| `INVALID` | Artifact dishonest (self-score, invented UNAVAILABLE numbers, ranking fields, ACCEPTED stamp) |
| `IMPROVED` | At least one primary axis strictly better **and** no primary axis worse, on quality-proof values |
| `DEGRADED` | At least one primary axis worse and none better |
| `TRADEOFF_NOT_IMPROVEMENT` | Mixed primary axes — may be disclosed, must not be sold as “improvement” |
| `NO_MATERIAL_CHANGE` | Primary axes equal (within disclosed uncertainty overlap) |

`IMPROVED` is **unreachable** from the canonical declared-UNAVAILABLE artifact. Tests may use labelled **fixtures** (`harness.role = workload_executor`, `HARNESS_REPORTED`) to exercise the evaluator; those fixtures are not production scores.

## 5. Numeric floors (placeholders — UNAVAILABLE)

| Threshold | Value | Provenance | Why unset |
|-----------|-------|------------|-----------|
| Minimum relative improvement on a primary axis | `null` | `UNAVAILABLE` | No observed production sample |
| Maximum allowed degradation on other primary axes | `null` | `UNAVAILABLE` | Would be a fake tolerance |
| Minimum sample size for an improvement *claim* | `null` | `UNAVAILABLE` | M08 residual `minimum_sample_for_inference`; disclosure min remains 1 |

Until those floors are set by an independent RFC:

- The **protocol** bar is strict Pareto on quality-proof primary axes (§4).
- Publishing a percentage (“+15% cheaper”) without a quality-proof candidate artifact is forbidden.
- `ESTIMATED` deltas are `ESTIMATED_NOT_PROOF` and cannot yield `IMPROVED`.

## 6. What this bar does not authorize

- L2/L3 (or L0/L1) routing preference by CapabilityProfile score (ADR-V4-0010).
- Treating M08 `cprof-methodology.provisional.v0` as ACCEPTED science.
- Using `success_rate` self-reported by the executor as `verified_completion`.
- Skipping Policy on sensitive work (D04) because a bench “won”.

## 7. Honesty pins

```
NUMERIC_IMPROVEMENT_FLOORS = UNAVAILABLE
CANONICAL_ARTIFACT_VERDICT = UNAVAILABLE
M09_MUST_NOT_LAUNCH_ON_INVENTED_SCORES = true
```
