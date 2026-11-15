# M11 validation checklist (orchestrator)

Use when A-M11-1 reports DELIVERED.

| # | Check | Pass? |
|---|-------|-------|
| 1 | Tip on `feature/v4/m11-provenance`; worktree `/home/gaab/Downloads/EvolveLoop-v4-m11` | PASS `f1222f6` |
| 2 | Diff confined to `provenance/**` (+ tests) | PASS (14 files) |
| 3 | `ProvenanceQueryPort` realized (4 methods) | PASS `ProvenanceGraph` |
| 4 | Answers are verifiable refs (event/artifact/evidence/grant ids) | PASS |
| 5 | Fail closed: unknown ref → empty / explicit fail; no invented ids | PASS |
| 6 | SELF_REPORTED not treated as independent proof of requirement | PASS |
| 7 | No trust score / L2/L3 routing API | PASS honesty pins |
| 8 | Contracts FROZEN untouched | PASS |
| 9 | vitest `tests/v4/provenance` green (orch recheck) | PASS **31/31** |
| 10 | Full `tests/v4` green | PASS **337/337** |
| 11 | Delivery note present; status DELIVERED not self-ACCEPTED | PASS |

**Outcome:** **ACCEPTED** → M19 per `ORCHESTRATOR-DIRECTIVE-M19-M11-INTEGRATE.md`
