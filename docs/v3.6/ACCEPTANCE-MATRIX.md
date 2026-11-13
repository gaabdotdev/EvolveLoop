# EvolveLoop V3.6 — Acceptance Matrix

**Cycle:** v36-20261112-001  
**Branch:** feature/v3.6-multi-workflow  
**Updated:** 2026-11-12

| Gate | Criterion | Impl | Test | Result | Evidence |
|------|-----------|------|------|--------|----------|
| G | Persistent admission/queue | GlobalOpsService | v36-ops-core | PASS | tests/unit/v36-ops-core.test.ts |
| G | Priority/fairness/aging | scheduler-policy | v36-ops-core | PASS | idem |
| G | Dependencies + cycle reject | dependency-coordinator | v36-ops-core | PASS | idem |
| G | Concurrency global/project | policy + tick | v36-ops-core / e2e | PASS | idem |
| G | Pause/resume/cancel | GlobalOpsService | v36-ops-core | PASS | idem |
| G | Restart reconcile | recovery + recover() | v36-ops-core / e2e | PASS | idem |
| P | ≥3 projects registered | ProjectRegistry | e2e | PASS | v36-multi-workflow.e2e |
| P | Isolation / no cross RW | IsolationGuard | ops-core + e2e | PASS | idem |
| P | Policy per project | ProjectRecord.policy | ops-core | PASS | idem |
| R | Hierarchical reserve/lease | GlobalResourceManager | ops-core | PASS | idem |
| R | No double-count / expire | resource-manager | ops-core | PASS | idem |
| R | UNAVAILABLE tokens | reserve guard | ops-core | PASS | idem |
| T | Root-only when appropriate | TeamComposer | ops-core | PASS | idem |
| T | Auditable plan | AgentTeamPlan | ops-core | PASS | idem |
| Q | Discover real commands | discoverQualityGates | ops-core | PASS | idem |
| Q | Required fail blocks | QualityGateRunner | ops-core | PASS | idem |
| O | CLI groups + TUI real state | v36-commands / ops-tui | e2e | PASS | e2e |
| E2E | Multi-project multi-workflow deterministic | e2e test | e2e | PASS | v36-multi-workflow.e2e |
| E2E | Live LLM harness | harness consent | — | **BLOCKED** | needs EVOLVELOOP_HARNESS_CONSENT + credential |
| S | Deny-by-default + fail-closed | isolation + admission | ops-core | PASS | idem |
| S | Priority ≠ authority | ADR-0001 | review | PASS | ADR |
| Release | build/typecheck/unit v36 | tsc + vitest | commands | PASS | evidence/gate.testing.json |
| Release | Historical tags intact | git | verify | PASS | v3-complete, v3.5-runtime |
| Release | V3.6 tag | — | — | **NOT_RUN** | requires explicit human approval after global PASS |

## Global verdict

**CONDITIONAL** — deterministic gates PASS; live LLM E2E **BLOCKED**; V3.6 git tag **NOT_RUN** until live unblocked or explicit accept of BLOCKED live portion per release policy.

Per spec: *do not declare E2E integral complete if live auth absent*. Do not declare V3.6 complete while any mandatory gate is BLOCKED/FAIL/NOT_RUN.
