# Fair baseline protocol (M17 early)

Constitution §13.1: every improvement claim must name an explicit baseline and use comparable workload, criteria, environment, model, configuration, and sample. Cherry-picked benches that only favour EvolveLoop are forbidden.

This protocol is the **comparison contract**. It does not contain production scores.

| Field | Value |
|-------|-------|
| Protocol id | `el-v4-fair-baseline.protocol` |
| Protocol version | `0.1.0` |
| Canonical suite | `el-v4-fair-baseline` @ `0.1.0` |
| Harness (this cut) | `el-v4-bench-harness` @ `0.1.0` — **schema validator**, not a workload executor |
| Ground-truth rule | Executor self-scores are never ground truth (§4.8, TM-V4-D04, INV-CPROF-01) |

## 1. Workload definition

A comparable run is identified by **all** of:

| Field | Canonical early value | Why it exists |
|-------|----------------------|---------------|
| `suite_id` | `el-v4-fair-baseline` | Stable identity for M09 claims |
| `suite_version` | `0.1.0` | Versioned criteria; changing cases is a new version |
| `work_category` | `software.engineering` | Capability profiles are contextual (§4.8, INV-CPROF-03) |
| `task_kind` | `verified_delivery` | Independent verification required (ADR-V4-0009) |
| `comparator_class` | see §3 | What the candidate is measured against |
| `cases[]` | declared identities below | Dropping failing cases is cherry-picking |
| `acceptance_criteria` | versioned strings | “Done” is not a metric |

### 1.1 Declared cases (not executed in this cut)

These names define the suite. `run_status` on the canonical artifact is `DECLARED_NOT_RUN`. Inventing pass/fail for them is forbidden.

| case_id | Intent | Independent check |
|---------|--------|-------------------|
| `FBC-SE-01` | Small verified code change against a Goal Contract | Tests + WorkProof; executor ≠ verifier |
| `FBC-SE-02` | Same change after a controlled executor kill / handoff | Confirmed state preserved; no improper effect dup |
| `FBC-SE-03` | Same change with cost ledger including retries + verification | `cost_per_verified_result` uses CostRecord provenance |

Full Impossible Handoff (six failures, real providers) remains **M16**. This suite is the **fair-comparison skeleton** M09 needs; it is not a substitute for M16.

### 1.2 Acceptance criteria (suite-level)

1. Goal Contract criteria are independently evaluated (ADR-V4-0009). SELF_REPORTED completion is not verified completion.
2. Cost includes execution, retries, coordination, verification, recovery, and platform overhead (constitution §13.2).
3. Missing measurements are UNAVAILABLE, never OBSERVED (M12 / R15 / TM-V4-F10).
4. Case set is frozen for `suite_version`; post-hoc removal of cases invalidates the comparison.

## 2. Harness identity

Every artifact MUST record who measured, with which code, in which role.

| Field | This cut |
|-------|----------|
| `harness_id` | `el-v4-bench-harness` |
| `harness_version` | `0.1.0` |
| `role` | `schema_validator` |

Roles:

| Role | May emit quality-proof metrics? | Meaning |
|------|--------------------------------|---------|
| `schema_validator` | **No** | Checks honesty of artifacts; does not run the workload |
| `workload_executor` | Yes, as `HARNESS_REPORTED` | A later runner that actually executes declared cases |

A `schema_validator` artifact that carries `quality_proof: true` metrics is invalid: the validator did not observe the work.

Optional `git_ref` pins the tree that produced the artifact. Timestamps are disclosure, not identity (ADR-V4-0015).

This harness is **not** the V3 Measurement Plane runner (`orchestrator/src/telemetry/measurement-plane/benchmark/runner.ts`) and **not** `benchmarks/bench-obs`.

## 3. What is compared

A candidate (M09 adaptive decisions, or any later claim) is comparable to a baseline **only if** all of the following match:

1. `suite_id` + `suite_version`
2. Identical `cases[].case_id` set (no extras silently dropped)
3. Same `work_category` + `task_kind`
4. Same `environment.class` (and disclosed model/provider/version when models are used)
5. Same sample policy, declared **before** the run (repetitions are not chosen after seeing results)
6. Same cost inclusion list (§13.2)
7. Metrics used in the claim have `quality_proof: true` and provenance ∈ {`OBSERVED`, `HARNESS_REPORTED`}

### 3.1 Comparator classes (constitution §13.1)

| Class | Meaning | Early-cut status |
|-------|---------|------------------|
| `v4_non_adaptive` | EvolveLoop with planning/capability **disclosure** but **no** M09 score-driven adaptation | **Primary V4.2 bar** — declared, not yet executed |
| `manual_traditional` | Human-operated / traditional pipeline on the same cases | Declared as allowed class; no numbers |
| `comparable_platform` | Another platform, only with the same workload/env disclosed | Declared as allowed class; no numbers |

Primary early comparator for M09 is `v4_non_adaptive`, not a mock V3 suite and not an executor’s self-rank.

## 4. What is not compared

The following are **out of comparison** and cannot support an improvement claim:

- Different `work_category` / `task_kind` (no global rank — INV-CPROF-03)
- Different model, provider, or `executor_version` without disclosing the change
- Post-hoc case filtering, “best of N” without reporting N and the failed runs
- V3 `benchmarks/bench-obs/**` (mock providers, MP smoke — not V4 cost-per-verified-result proof)
- V3.7 certification evidence / G17 hash (product cert baseline, not this suite)
- CapabilityProfile `PROVIDER_REPORTED` numbers treated as CP-observed
- `SELF_REPORTED` / `UNKNOWN` / `ESTIMATED` / `UNAVAILABLE` as quality proof (INV-CPROF-01)
- Context-free `global_score` / `rank` / `overall_score`
- L2/L3 routing preference by score (ADR-V4-0010, D04) — Policy owns sensitive work
- Marketplace / third-party leaderboards (M14 conformance only)

## 5. Ground truth: independent observation, not self-score

Constitution §4.8: do not accept agent self-assessment as a sufficient source.

| Source | May be stored? | May prove quality / improvement? |
|--------|----------------|----------------------------------|
| Control-plane `OBSERVED` (M12 `emitFromControlPlane`, F10 attestation) | Yes | Yes |
| Harness `HARNESS_REPORTED` from a `workload_executor` whose identity is pinned | Yes | Yes |
| `DERIVED` from quality-proof inputs, derivation disclosed | Yes (disclosure) | **No** for the M09 bar unless a later RFC says otherwise |
| `PROVIDER_REPORTED` | Yes (disclosure) | **No** |
| `ESTIMATED` / `UNAVAILABLE` / `UNKNOWN` | Yes as labelled slots | **No** |
| `SELF_REPORTED` (executor scores itself) | Not on baseline metrics | **No** — refused as ground truth |

Verifier ≠ executor (ADR-V4-0009). A baseline case whose only completion signal is the executing agent’s claim is not a verified result; its `cost_per_verified_result` must be UNAVAILABLE, not a fabricated denominator.

Unauthenticated / payload-asserted `OBSERVED` is downgraded by M12 and **cannot** enter a quality-proof slot (same rule as M08 ingest).

## 6. Sample, window, uncertainty

- `sample_size ≥ 1` is valid **disclosure** (M08). It is **not** a claim that n=1 supports inference (M08 residual).
- Every recorded quality-proof metric MUST carry `window` `{from,to}` and `uncertainty` with `lower <= upper`.
- `point_interval.v0` (M08) means “no interval was computed”, not a 95% CI.
- Recency decay and minimum sample for inference remain **GAP** (ADR-V4-0010 residuals). This protocol does not fill them with invented constants.

## 7. Honesty pins (this cut)

```
PRODUCTION_SCORES_EXIST = false
METHODOLOGY_ACCEPTED_BY_M17 = false
BASELINE_MAY_DRIVE_L2_L3_ROUTING = false
```

The canonical artifact under `artifacts/` is a **declared-UNAVAILABLE** record of the suite, not a measured scoreboard.
