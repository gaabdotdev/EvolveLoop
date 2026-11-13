# EvolveLoop V3.6 — Acceptance Matrix

**Cycle:** v36-20261112-001 → live extension 2026-11-12  
**Branch:** `feature/v3.6-multi-workflow`  
**Updated:** 2026-11-12 (live multi-workflow)

| Gate | Criterion | Impl | Test | Result | Evidence |
|------|-----------|------|------|--------|----------|
| G | Persistent admission/queue | GlobalOpsService | v36-ops-core | PASS | tests/unit/v36-ops-core.test.ts |
| G | Priority/fairness/aging | scheduler-policy | v36-ops-core | PASS | idem |
| G | Dependencies + cycle reject | dependency-coordinator | v36-ops-core | PASS | idem |
| G | Concurrency global/project | policy + tick | ops-core / e2e / live | PASS | live `04-admission-tick1.json` |
| G | Pause/resume/cancel | GlobalOpsService | v36-ops-core | PASS | idem |
| G | Restart reconcile | recovery | ops-core / live | PASS | live `12-recover.json`, `13-coordinator-restart.json` |
| P | ≥2 independent projects | ProjectRegistry + CLI | live | PASS | live `02-projects.json` |
| P | Isolation / no cross RW | IsolationGuard | ops-core + live | PASS | live `06-isolation.json`, `14-isolation-integrity.json` |
| P | Policy per project | ProjectRecord.policy | ops-core | PASS | idem |
| R | Hierarchical reserve/lease | GlobalResourceManager | ops-core + live | PASS | live `04-admission-tick1.json`, `15-resources-final.json` |
| R | No double-count / expire | resource-manager | ops-core | PASS | idem |
| R | UNAVAILABLE tokens | reserve guard | ops-core | PASS | idem |
| T | Root-only when appropriate | TeamComposer | ops-core | PASS | idem |
| T | Auditable plan | AgentTeamPlan | ops-core | PASS | idem |
| Q | Discover real commands | discoverQualityGates | ops-core | PASS | idem |
| Q | Required fail blocks | QualityGateRunner | ops-core | PASS | idem |
| O | CLI groups + TUI real state | v36-commands / ops-tui | e2e + live | PASS | live `05-ops-tui.json` |
| E2E-DET | Multi-project multi-workflow deterministic | e2e test | e2e | PASS | v36-multi-workflow.e2e |
| E2E-LIVE | ≥2 projects, ≥3 workflows, LLM overlap, capacity, isolated fail | live script | live | **PASS** | `docs/v3.6/evidence/live-multi-workflow/` + `LIVE-MULTI-WORKFLOW-VALIDATION.md` |
| S | Deny-by-default + fail-closed | isolation + admission | ops-core + live | PASS | idem |
| S | Priority ≠ authority | ADR-0001 | review | PASS | ADR |
| Release | build/typecheck/unit v36 + v35 daemon | tsc + vitest | commands | PASS | 8/8 regression after live |
| Release | Historical tags intact | git | verify | PASS | v3-complete, v3.5-runtime |
| Release | V3.6 tag | — | — | **NOT_RUN** | requires explicit human approval after this report |

## Global verdict

**Technically ready for release approval.** Deterministic + **E2E-LIVE PASS**.  
**Tag V3.6 remains NOT_RUN** until explicit human approval (no automatic tag).

### E2E-LIVE proof highlights

1. Two independent git projects registered via CLI.  
2. Three workflows submitted (A1, A2, B1).  
3. Real `cursor-agent` sessions for A1 and B1 (`PROCESS_COMPLETED`).  
4. Temporal overlap across projects (`09-concurrency-timeline.json`).  
5. Global/project capacity respected (A2 waited).  
6. Controlled failure of A2 while A1/B1 running.  
7. Peers completed; primaries clean; ops TUI against durable state.
