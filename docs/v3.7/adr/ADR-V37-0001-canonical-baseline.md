# ADR-V37-0001 — Canonical baseline for V3.7

**Status:** Accepted  
**Date:** 2026-11-13  
**Supersedes:** none (establishes V3.7 lineage)

## Context

Three divergent lines existed after V3:

1. `feature/bench-obs-v1` — Measurement Plane on V3 core (`92a8f3e`)
2. `feature/v3.5-runtime` — sandbox, daemon, approvals, hardening (`0992cd2`)
3. `feature/v3.6-multi-workflow` — includes V3.5 + GlobalOps (`5c1df88`)

A ZIP snapshot of bench-obs lacked `.git`, V3.5/V3.6 docs, and `ops/`. Blind-merging bench-obs into anything would risk losing runtime/ops contracts or inventing ancestry.

## Decision

1. **Canonical base tip:** `feature/v3.6-multi-workflow` @ `5c1df88` (contains V3.5 tip).
2. **Port Measurement Plane** via ordered cherry-pick of `da02ea9`, `253a76b`, `92a8f3e` onto an integration branch `feature/v3.7-lineage-integration`.
3. Resolve CLI/history conflicts by **union of owned surfaces** (GlobalOps + Measurement Plane), not discard.
4. Historical tags `v3-complete`, `v3.5-runtime`, `v3.6-multi-workflow` remain immutable.
5. Distributed work proceeds only on `feature/v3.7-distributed-fabric` created from the integrated baseline tip.
6. GlobalOps V3.6 is **not** declared multi-host Control Plane until fabric gates pass.

## Consequences

- Single tree with Ops + Runtime + Measurement Plane before distributed features.
- Cherry-pick SHAs ≠ original bench SHAs; content equivalence is the contract.
- Full live V3.5/V3.6 harness revalidation on the integrated tip may remain NOT_RUN until capacity; tracked in Gate 0 matrix.
- Wiki vault may be PARTIAL until `WIKI_ROOT` is set.
