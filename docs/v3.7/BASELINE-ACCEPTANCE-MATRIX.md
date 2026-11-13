# V3.7 Gate 0 — Canonical Lineage Baseline Acceptance Matrix

**Branch tip under test:** `feature/v3.7-lineage-integration`  
**Base:** `feature/v3.6-multi-workflow` @ `5c1df88`  
**Ported:** Measurement Plane commits `da02ea9`, `253a76b`, `92a8f3e` (cherry-picked)

States: `PASS` | `FAIL` | `BLOCKED` | `NOT_RUN` | `PARTIAL`

| ID | Criterion | Evidence | State |
|----|-----------|----------|-------|
| G0-01 | Tags `v3-complete`, `v3.5-runtime`, `v3.6-multi-workflow` unchanged | `git rev-parse` peels recorded in LINEAGE report | PASS |
| G0-02 | Integration branch contains V3.5 tip ancestry | `merge-base --is-ancestor 0992cd2 HEAD` | PASS |
| G0-03 | Integration branch contains V3.6 tip ancestry | `merge-base --is-ancestor 5c1df88 HEAD` | PASS |
| G0-04 | Measurement Plane sources present | `orchestrator/src/telemetry/measurement-plane/**` | PASS |
| G0-05 | GlobalOps sources present | `orchestrator/src/v3/ops/**` | PASS |
| G0-06 | CLI merges v35/v36/telemetry without dropping groups | `evolve.ts` imports + usage map | PASS |
| G0-07 | Typecheck (`tsc --noEmit`) | orchestrator | PASS |
| G0-08 | Unit: measurement-plane | vitest 20 tests in suite run subset | PASS |
| G0-09 | Unit: v36-ops-core | vitest 4/4 | PASS |
| G0-10 | Unit: v35-sandbox + v35-security | vitest 13/13 | PASS |
| G0-11 | Combined selected battery | 37/37 PASS | PASS |
| G0-12 | No second EventBus introduced by port | ADR-BENCH-OBS-0001 respected; single `events/event-bus.ts` | PASS |
| G0-13 | Ownership map published | `COMPONENT-OWNERSHIP.md` | PASS |
| G0-14 | ADR canonical baseline published | `docs/v3.7/adr/ADR-V37-0001-canonical-baseline.md` | PASS |
| G0-15 | Dirty bench-obs worktree preserved | original WT status unchanged during integration | PASS |
| G0-16 | Full V3.5/V3.6 live harness re-run on integrated tip | deferred to fabric validation / capacity | NOT_RUN |
| G0-17 | Wiki vault retrieve | `WIKI_ROOT` unset | PARTIAL (`applied_with_gap`) |

**Gate 0 verdict:** **PASS** for lineage consolidation prerequisites (G0-16/G0-17 do not block baseline tip creation; they remain tracked).

**Non-claims:** Gate 0 PASS ≠ V3.7 distributed fabric PASS. GlobalOps is still single-host.
