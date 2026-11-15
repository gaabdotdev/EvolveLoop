# Requirements Traceability Matrix — EvolveLoop V4

**Legend status:** `UNMAPPED` | `OWNED` | `IN_PROGRESS` | `IMPLEMENTED` | `TESTED` | `ACCEPTED` | `INTEGRATED` | `N/A_FORMAL`  
**Baseline:** provisional `03937c1` — V3.7 not certified  
**Rule:** no silent disappearance; `N/A_FORMAL` needs decision + independent approval

## Constitution chapters → owners

| Chapter | Topic | Primary meta | Supporting | Status |
|---------|-------|--------------|------------|--------|
| 1 | Vision & thesis | M00 | All | OWNED |
| 2 | Problem / differentiation | M00 | M16, M17 | OWNED |
| 3 | Non-negotiable principles | M00 | M18 | OWNED |
| 4.1 | Work Continuity Engine | M01, M02, M04 | M03, M05 | OWNED |
| 4.2 | Goal Compiler | M01 | M10 | OWNED |
| 4.3 | Execution Capsule / Handoff | M04 | M10, M18 | OWNED |
| 4.4 | Effect Ledger | M03 | M04, M18 | OWNED |
| 4.5 | Self-Healing Execution | M04 | M07, M09 | OWNED |
| 4.6 | Time Travel Execution | M05 | M02, M03 | OWNED |
| 4.7 | Dynamic Planning | M07 | M01, M09 | OWNED |
| 4.8 | Capability Intelligence | M08 | M17, M12 | OWNED |
| 4.9 | Adaptive Execution | M09 | M08, M07, M17 | OWNED |
| 4.10 | Autonomous Policy Engine | M10 | M18 | OWNED |
| 4.11 | Proof-Carrying Work | M06 | M16 | OWNED |
| 4.12 | Trust & Provenance Graph | M11 | M06, M10 | OWNED |
| 4.13 | Predictive Observability | M12 | M17 | OWNED |
| 4.14 | Elastic Compute Fabric | M13 | M10, M04 | OWNED |
| 4.15 | Agent/Runtime Ecosystem | M14 | M00, M18 | OWNED |
| 4.16 | Unified Control Center | M15 | M19 | OWNED |
| 5 | Domain conceptual model | M00 | All | OWNED |
| 6 | Target architecture | M00 | M19 | OWNED |
| 6.3 | Relation to V3.7 | M00, M19 | Adapters | OWNED (provisional) |
| 7 | Fundamental flows | M00 | M01–M06, M16 | OWNED |
| 8 | WorkProof structure | M06 | M11 | OWNED |
| 9 | Autonomy, security, governance | M10, M18 | M11 | OWNED |
| 10 | DX / ops experience | M15 | M12 | OWNED |
| 11 | Roadmap V4.0–V4.5 | Orchestrator | M19 | OWNED |
| 12 | Impossible Handoff Test | M16 | M04, M03, M06, M17 | OWNED |
| 13 | Metrics & success | M17 | M12 | OWNED |
| 14 | Non-goals / traps | Orchestrator + M00 | M18 | OWNED |
| 15.1 | Risks | M00, M18 | All | OWNED |
| 15.2 | Open technical decisions | M00 (ADRs) | Domain metas | OWNED |
| 15.3 | Hypotheses to prove | M17, M16 | M08, M09 | OWNED |
| 16 | Excellence & readiness | M20 | M19, M18 | OWNED |
| 17 | Glossary | M00 | Docs | OWNED |

## Metas M00–M20

| Meta | Accept criterion (summary) | Impl | Tests | Evidence | Status |
|------|----------------------------|------|-------|----------|--------|
| M00 | Domain+contracts+ADRs+ownership+conformance hooks | — | — | — | RUNNING |
| M01 | Intent→Goal Contract; Work queryable without chat memory | tip `f72ad76` | merge `e815407` | 44 unit + wave2 suite | **INTEGRATED** |
| M02 | Recovered state consistent; crash preserves confirmed progress | — | — | — | PENDING |
| M03 | No blind external replay; UNKNOWN reconciled/blocked | — | — | — | PENDING |
| M04 | Compatible executor assumes work; no improper effect dup | — | — | — | PENDING |
| M05 | Inspect+fork without mutating original / auto external effects | — | — | — | PENDING |
| M06 | Third party can assess proof; no opinion→PROVEN | — | — | — | PENDING |
| M07 | Plan adapts with traceable justification | — | — | — | PENDING |
| M08 | Profiles from observed contextual data + uncertainty | — | — | — | PENDING |
| M09 | Measurable improvement vs fair baseline | — | — | — | PENDING |
| M10 | Deny-by-default; limited/revocable; adversarial pass | — | — | — | PENDING |
| M11 | Provenance queries answerable with refs | — | — | — | PENDING |
| M12 | Metrics honest provenance; reproducible evals | — | — | — | PENDING |
| M13 | Ephemeral compute without breaking state/security | — | — | — | PENDING |
| M14 | Third-party executors without breaking guarantees | — | — | — | PENDING |
| M15 | Operate by goals/results; debug without fighting platform | — | — | — | PENDING |
| M16 | Impossible Handoff PASS on real workload | — | — | — | PENDING |
| M17 | Fair comparable baselines; no cherry-picked claims | — | — | — | PENDING |
| M18 | Independent security rejection authority | — | — | — | RUNNING |
| M19 | Integrated candidate + regressions | — | — | — | READY |
| M20 | Independent audit tries to invalidate APPROVED | — | — | — | PENDING |

## Roadmap exit criteria

| Milestone | Exit criterion | Gate owner | Status |
|-----------|----------------|------------|--------|
| V4.0 | Structured work persist/recover/audit vertical slice | M19+Orch | **IN_PROGRESS** (directive VERTICAL-SLICE) |
| V4.1 | Survive failures + executor change w/o confirmed loss / improper effects | M16/M04 | PENDING |
| V4.2 | Adaptive decisions improve quality/cost/completion vs baseline | M09/M17 | PENDING |
| V4.3 | Sensitive actions authorized/limited/audited/revocable adversarially | M10/M18 | PENDING |
| V4.4 | Real software workloads with WorkProof + reproducible comparisons | M16 | PENDING |
| V4.5 | Third parties integrate without breaking guarantees | M14/M15 | PENDING |

## APPROVED checklist (§15 mission) — all must be true

Tracked in `FINAL-VERDICT.md`. Currently **none** satisfied for release. Item 22 (certified V3.7) currently **BLOCKED** externally (G17).
