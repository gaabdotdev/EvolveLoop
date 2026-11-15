# META M08 — Capability Intelligence

Read `WAVE4-COMMON.md` first. **Primary ADR:** ADR-V4-0010.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m08` |
| Branch | `feature/v4/m08-capability` |
| Ownership | `orchestrator/src/v4/capability/**` + `orchestrator/tests/v4/capability/**` |
| Contracts | FROZEN — `capability-profile.ts`, `CapabilityProfilePort` |

## Implement

1. Realize `CapabilityProfilePort` / store for profiles with **disclosure shape** (context, sample_size, window, uncertainty, provenance, source_refs, methodology).
2. Publish a **PROVISIONAL** methodology document + id/version (not ACCEPTED until M17 baselines exist — do not claim production routing readiness).
3. Enforce INV-CPROF-*: no global_score/rank; SELF_REPORTED/UNKNOWN/ESTIMATED/UNAVAILABLE cannot support metrics; `ACTIVE` only if methodology ACCEPTED (so V4.2 first cut stays PROVISIONAL/PLACEHOLDER).
4. Do not prefer executors for L2/L3 work based on score in any helper you ship.
5. Compose M12 provenance defaults if reading measurements — never trust unauthenticated OBSERVED as capability input (F10/D04).

## Accept

Tests for disclosure + invariant refusals; delivery under `capability/`. Methodology status clearly PROVISIONAL. DELIVERED for orchestrator. No merge / npm install / V3.7 / self-ACCEPTED / APPROVED.
