# META M17 — Benchmarks & Economic Proof (early / Wave 4)

Read `WAVE4-COMMON.md`. Purpose: **fair baselines** so M08 methodology can move toward ACCEPTED and M09 can measure improvement without invented scores.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m17` |
| Branch | `feature/v4/m17-benchmarks-early` |
| Ownership | `docs/v4/benchmarks/**` (primary); optional `orchestrator/src/v4/benchmarks/**` + tests if harness needed |
| Depends | M07/M08 INTEGRATED; M12 provenance rules |

## Implement (early cut)

1. Document fair baseline protocol: workload definition, harness identity, what is/isn't compared, prohibition on self-scored executors as ground truth.
2. Record at least one **reproducible** baseline artifact schema (inputs, env, metrics with provenance ∈ OBSERVED/HARNESS_REPORTED — never SELF_REPORTED as quality proof).
3. Define acceptance bar for “measurable improvement” vs this baseline (used later by M09) — numbers may be placeholders only if labeled UNAVAILABLE/ESTIMATED with provenance.
4. Explicitly **do not** ACCEPTED-stamp M08 methodology; propose what evidence M08 still needs.
5. No L2/L3 routing by score. No marketplace. No V3.7 cert edits. No contracts catalog edits.

## Accept

Delivery under `docs/v4/benchmarks/` (+ code harness if any). Tests if code. DELIVERED for orchestrator. No merge / self-ACCEPTED / APPROVED.
