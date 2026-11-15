# Wave 4 (V4.2 Adaptive Intel) — common constraints

**Gate:** Phase 3 Continuity vertical **ACCEPTED** (`CONTINUITY-SLICE-V41.md`). Contracts remain **FROZEN** (R1–R16).

**Baseline:** branch from `feature/v4-integration` HEAD (≥ `81abcbd`).

**Rules:**

1. Isolated worktree + `feature/v4/<id>-<slug>` from integration HEAD.
2. Import FROZEN contracts only — no catalog edits.
3. Own only `OWNERSHIP-MAP.md` paths.
4. No V3.7 cert edits; no `npm install` (symlink node_modules); no merge to integration; no self-ACCEPTED.
5. **No invented scores** — capability/adaptive metrics need declared methodology + provenance (ADR-V4-0010). Until methodology ACCEPTED, profiles are PROVISIONAL and must not drive L2/L3 routing preference.
6. M09 must not launch until M08 methodology + M17 baseline exist (DEPENDENCY-GRAPH).
7. Wiki may be GAP; ground on freeze + ADRs + contracts.

## First cut this wave

| Meta | Paths |
|------|-------|
| M07 | `orchestrator/src/v4/planning/**` |
| M08 | `orchestrator/src/v4/capability/**` |
