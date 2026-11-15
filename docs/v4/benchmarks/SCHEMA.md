# FairBaselineArtifact schema (M17 early)

Local M17 schema. **Not** a frozen `ContractKind`. Do not add it to `CONTRACT_CATALOG`. Do not invent an ADR-V4-0015 id prefix for it.

| Field | Value |
|-------|-------|
| `kind` | `FairBaselineArtifact` |
| `schema_version` | `0.1.0` |
| Quality-proof provenance | `OBSERVED` \| `HARNESS_REPORTED` only |
| Forbidden as quality proof | `SELF_REPORTED`, `UNKNOWN`, `ESTIMATED`, `UNAVAILABLE`, `PROVIDER_REPORTED` |
| Ranking fields | Forbidden at any depth (`global_score`, `rank`, `overall_score`) |

Executable checks: `orchestrator/src/v4/benchmarks/schema.ts`.

## 1. Object shape

```text
FairBaselineArtifact
├─ kind: "FairBaselineArtifact"
├─ schema_version: "0.1.0"
├─ artifact_id: string          # M17-local opaque id; not ID_PREFIX
├─ suite_id / suite_version
├─ workload                     # PROTOCOL.md §1
├─ harness                      # PROTOCOL.md §2
├─ environment
├─ metrics[]                    # slots: recorded XOR declared-absent
├─ cost                         # CostRecord-shaped; provenance mandatory
├─ comparison_scope             # compared / not_compared
├─ methodology_note             # never stamps M08 ACCEPTED
├─ production_scores            # ABSENT | PARTIAL
├─ computed_at                  # ISO-8601 UTC (disclosure, not identity)
└─ limitations[]
```

### 1.1 `workload`

| Field | Type | Rule |
|-------|------|------|
| `suite_id` | string | Canonical early: `el-v4-fair-baseline` |
| `suite_version` | string | Canonical early: `0.1.0` |
| `work_category` | string | Required (no context-free rank) |
| `task_kind` | string | Required |
| `comparator_class` | `v4_non_adaptive` \| `manual_traditional` \| `comparable_platform` | Required |
| `cases[]` | `{ case_id, description, run_status }` | `run_status` ∈ `DECLARED_NOT_RUN` \| `EXECUTED` |
| `acceptance_criteria[]` | non-empty strings | Versioned with the suite |

If any case is `DECLARED_NOT_RUN`, the artifact MUST NOT carry `quality_proof: true` metrics for that suite run (nothing was executed).

### 1.2 `harness`

| Field | Type | Rule |
|-------|------|------|
| `harness_id` | string | Canonical early: `el-v4-bench-harness` |
| `harness_version` | string | Canonical early: `0.1.0` |
| `role` | `schema_validator` \| `workload_executor` | `schema_validator` ⇒ no quality-proof metrics |
| `git_ref` | string? | Optional pin |

### 1.3 `environment`

| Field | Type | Rule |
|-------|------|------|
| `class` | string | Canonical early: `local-first` |
| `os` / `runtime` / `model_identity` | string **or** `{ value: null, provenance: "UNAVAILABLE" }` | Unpinned until a real run |

### 1.4 Metric slots

Two mutually exclusive shapes. Mixing a numeric `value` with `UNAVAILABLE` is invalid (M12: UNAVAILABLE ⇒ no invented number).

**Quality-proof (may support an M09 claim later):**

```json
{
  "metric": "cost_per_verified_result",
  "status": "RECORDED",
  "value": 12.5,
  "unit": "USD",
  "sample_size": 5,
  "window": { "from": "2026-11-15T00:00:00.000Z", "to": "2026-11-15T01:00:00.000Z" },
  "uncertainty": { "method": "point_interval.v0", "lower": 12.5, "upper": 12.5 },
  "provenance": "HARNESS_REPORTED",
  "source_refs": ["run_example"],
  "quality_proof": true
}
```

The JSON above is **illustrative of shape only**. This cut does not publish a recorded production metric. The canonical artifact uses declared-absent slots.

**Declared-absent / estimated (must not support a claim):**

```json
{
  "metric": "cost_per_verified_result",
  "status": "DECLARED_UNAVAILABLE",
  "value": null,
  "unit": "USD",
  "provenance": "UNAVAILABLE",
  "source_refs": ["el-v4-fair-baseline.protocol@0.1.0"],
  "quality_proof": false,
  "reason": "canonical suite has not been executed in this cut"
}
```

`ESTIMATED` uses `status: "ESTIMATED_NOT_PROOF"`, `value: null`, `quality_proof: false`. An estimated **number** presented as a baseline score is rejected.

`PROVIDER_REPORTED` / `DERIVED` / `UNKNOWN` may appear only as `status: "DISCLOSED_NOT_PROOF"` with `quality_proof: false`.

`SELF_REPORTED` is **never** a valid `provenance` on a baseline metric slot.

### 1.5 Metric names

CapabilityProfile names (frozen contract — reused, not extended there):

`success_rate`, `validated_quality`, `latency_ms_p50`, `latency_ms_p95`, `cost_per_verified_result`, `stability`, `recovery_rate`

Additional **baseline-only** product metrics (constitution §13; not CapabilityProfile fields):

`verified_completion`, `handoff_success_rate`, `confirmed_state_loss`, `recovery_time_ms`, `human_interventions_per_work`

Adding a name here does not change `capability-profile.ts`.

### 1.6 `cost`

Aligned with frozen `CostRecord`: `amount: number | null`, `currency`, `provenance`, optional `breakdown`.

Plus M17-only `includes[]` listing §13.2 components. If `amount` is a number used as quality proof, `provenance` must be `OBSERVED` or `HARNESS_REPORTED`. Otherwise `amount` must be `null` and provenance `UNAVAILABLE` / `ESTIMATED` / `UNKNOWN`.

`SELF_REPORTED` cost is refused.

### 1.7 `methodology_note`

```json
{
  "m08_methodology_id": "cprof-methodology.provisional.v0",
  "m08_methodology_version": "0.1.0",
  "m08_methodology_status": "PROVISIONAL",
  "this_artifact_stamps_methodology_accepted": false
}
```

A true `this_artifact_stamps_methodology_accepted` is invalid in every M17 early artifact. M17 does not ACCEPTED-stamp M08.

### 1.8 `production_scores`

| Value | When |
|-------|------|
| `ABSENT` | No quality-proof metric in the artifact (canonical early record) |
| `PARTIAL` | At least one quality-proof metric **and** `harness.role = workload_executor` |

`PARTIAL` still is not a claim of V4.2 exit. Full suite execution + independent review remain later work.

## 2. Invariants (harness-enforced)

| Id | Rule |
|----|------|
| INV-FBA-01 | Quality-proof provenance ∈ {OBSERVED, HARNESS_REPORTED}; SELF_REPORTED never |
| INV-FBA-02 | UNAVAILABLE/ESTIMATED ⇒ `value === null` and `quality_proof === false` |
| INV-FBA-03 | No `global_score` / `rank` / `overall_score` at any depth |
| INV-FBA-04 | `schema_validator` harness cannot emit quality-proof metrics |
| INV-FBA-05 | `DECLARED_NOT_RUN` cases ⇒ no quality-proof metrics on the artifact |
| INV-FBA-06 | M17 never sets methodology ACCEPTED |
| INV-FBA-07 | Independent verifier required for `verified_completion` when RECORDED (`executor ≠ verifier`) |
| INV-FBA-08 | Ranking / L2/L3 preference APIs are not provided by this schema |

## 3. Canonical example

`artifacts/el-v4-fair-baseline.declared-unavailable.v0.json` — every primary axis `DECLARED_UNAVAILABLE`. Valid schema, **zero** production scores.
