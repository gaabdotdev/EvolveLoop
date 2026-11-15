# M11 validation checklist (orchestrator)

Use when A-M11-1 reports DELIVERED.

| # | Check | Pass? |
|---|-------|-------|
| 1 | Tip on `feature/v4/m11-provenance`; worktree `/home/gaab/Downloads/EvolveLoop-v4-m11` | |
| 2 | Diff confined to `provenance/**` (+ tests) | |
| 3 | `ProvenanceQueryPort` realized (4 methods) | |
| 4 | Answers are verifiable refs (event/artifact/evidence/grant ids) | |
| 5 | Fail closed: unknown ref → empty / explicit fail; no invented ids | |
| 6 | SELF_REPORTED not treated as independent proof of requirement | |
| 7 | No trust score / L2/L3 routing API | |
| 8 | Contracts FROZEN untouched | |
| 9 | vitest `tests/v4/provenance` green (orch recheck) | |
| 10 | Full `tests/v4` green | |
| 11 | Delivery note present; status DELIVERED not self-ACCEPTED | |

**Outcome:** ACCEPTED → hand to M19 per `ORCHESTRATOR-DIRECTIVE-M19-M11-INTEGRATE.md` | REWORK | REJECTED
