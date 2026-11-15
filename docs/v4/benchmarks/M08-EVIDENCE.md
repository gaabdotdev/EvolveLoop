# Evidence M08 still needs before methodology ACCEPTED

M08 published `cprof-methodology.provisional.v0` @ `0.1.0` as **PROVISIONAL** (`orchestrator/src/v4/capability/METHODOLOGY.md`). ADR-V4-0010 defers the formula. WAVE4-COMMON: until methodology is ACCEPTED, profiles must not prefer an executor for L2/L3 work on score.

**M17 does not stamp M08 methodology ACCEPTED.** This file lists remaining evidence. It is a proposal to orchestrator / M20 / a later M08 RFC — not a self-ACCEPTED verdict.

## 1. What this M17 cut *does* provide

| Item | Status after this cut |
|------|----------------------|
| Named fair-baseline protocol (`el-v4-fair-baseline.protocol` @ `0.1.0`) | **Present** |
| Reproducible artifact schema + honesty invariants | **Present** |
| Canonical declared-UNAVAILABLE artifact | **Present** (not a score) |
| M09 measurable-improvement bar (numeric floors UNAVAILABLE) | **Present** |
| Explicit refusal to ACCEPTED-stamp methodology | **Present** |

M08’s gate text (“M17 fair baselines exist **and** an independent review accepts a later RFC”) is only **half** met: the baseline *definition* exists; observed baseline *runs* and the RFC review do not.

## 2. Still required (do not ACCEPTED without these)

### 2.1 Observed fair-baseline run (M17 later / workload executor)

At least one `FairBaselineArtifact` with:

- `harness.role = workload_executor`
- `production_scores` ≠ `ABSENT` for the axes the methodology will use
- quality-proof provenance ∈ {`OBSERVED`, `HARNESS_REPORTED`}
- independent verifier ≠ executor
- frozen case set actually **executed** (not `DECLARED_NOT_RUN`)

The canonical early artifact does **not** satisfy this. Inventing numbers to close the gap is forbidden.

### 2.2 ADR-V4-0010 residuals closed by RFC (M08)

M08 first cut correctly left these as GAP. ACCEPTED methodology cannot leave them silent:

| Residual | Required for ACCEPTED |
|----------|----------------------|
| Ranking / aggregation formula (Elo, Bradley-Terry, Bayesian, 0–100 — or an explicit rejection of all of them in favour of per-metric disclosure only) | Chosen and reviewed |
| Recency decay | Chosen or explicitly “none, window is the only recency control” |
| Provider-version identity beyond `ExecutorRef.executor_version` | Chosen |
| Minimum sample for *inference* (distinct from disclosure min = 1) | Chosen; must not pretend n=1 is comparative science |

M17 will not pick a formula. Picking one here would freeze fake science (ADR-V4-0010 context).

### 2.3 Provenance composition already required, still binding

These are implemented in M08 ingest + M12 wrap. ACCEPTED does not relax them:

- Missing event provenance → UNKNOWN, never OBSERVED (R15)
- Unauthenticated OBSERVED → UNKNOWN / refused as metric input (F10, D04)
- `SELF_REPORTED` / `UNKNOWN` / `ESTIMATED` / `UNAVAILABLE` cannot support a metric (INV-CPROF-01)
- No `global_score` / `rank` / `overall_score` (INV-CPROF-03)
- `ACTIVE` profiles only with ACCEPTED methodology (INV-CPROF-04)
- Sensitive routing remains Policy, not score (D04)

### 2.4 Independent review (orchestrator / M20)

METHODOLOGY.md: ACCEPTED requires **independent** review of a later RFC. M08 must not mark itself ACCEPTED. M17 must not mark M08 ACCEPTED. `methodologyIsAccepted()` remaining `false` in M08 code is **correct** until §2.1–§2.3 land **and** that review says so.

### 2.5 Routing still forbidden on score until ACCEPTED **and** Policy

Even after methodology ACCEPTED:

- L2/L3 preference by score stays forbidden unless Policy allows the action (D04).
- This M17 package never exposes a ranking API.

## 3. Explicit non-claims

- This document is not an ACCEPTED stamp.
- This document is not V4 APPROVED.
- `cprof-methodology.placeholder.v0` remains not evidence of quality (ADR-V4-0010).
- `cprof-methodology.provisional.v0` remains PROVISIONAL.
- Presence of `docs/v4/benchmarks/**` is not a measured economic proof (§13, §15.3, §16 economy question).

## 4. Suggested RFC sequence (not started)

1. Execute canonical suite with a `workload_executor` harness; persist quality-proof artifacts.
2. M08 RFC: residuals in §2.2 + how profiles consume M17 `benchmark_ref`.
3. Independent review vs ADR-V4-0010 + this protocol.
4. Only then: methodology status ACCEPTED, engine may emit ACTIVE profiles, M09 may evaluate improvement claims against **recorded** artifacts — still without L2/L3 score routing unless Policy agrees.
