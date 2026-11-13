# V3.6 Live Multi-Workflow Validation Report

**Run id:** `v36-live-1794532225705` (see `evidence/live-multi-workflow/FINAL.json`)  
**Branch:** `feature/v3.6-multi-workflow`  
**Harness:** `cursor-agent` / adapter `antigravity` (session auth)  
**Consent:** process-scoped `EVOLVELOOP_HARNESS_CONSENT=true`  
**Script:** `orchestrator/scripts/v36-live-multi-workflow.mjs`

## Verdict

| Gate | Result |
|------|--------|
| P — Projects | **PASS** |
| Q — Queue/Scheduler | **PASS** |
| R — Resources | **PASS** |
| O — Operations TUI | **PASS** |
| S — Security/isolation | **PASS** |
| E2E-LIVE | **PASS** |

Global V3.6 tag: **NOT_RUN** (awaits explicit human approval).

## Projects

| Label | project_id | Fixture | Initial commit |
|-------|------------|---------|----------------|
| shop-a (A) | `proj-dc79e8ca74d4` | disposable git shop (`discount` + `inventory` modules) | recorded in `01-fixtures.json` |
| board-b (B) | `proj-8b34dfd4e596` | disposable git taskboard (`sortTasks`) | recorded in `01-fixtures.json` |

- Separate `data_dir`, worktrees, ownership, and Coordinator service per project.
- Cross-project path access denied (`06-isolation.json`).
- Primary checkouts remained clean (`14-isolation-integrity.json`).

## Workflows

| Label | workflow_id | Project | Goal |
|-------|-------------|---------|------|
| A1 | `wf-b4868cba-…` | A | Implement `applyPercentDiscount` |
| A2 | `wf-614df707-…` | A | Implement inventory reserve (queued → controlled FAIL) |
| B1 | `wf-0b8757a2-…` | B | Implement `sortTasks` |

Submitted via `evolve workflow submit` (not hand-edited stores).

## Admission & capacity

- Policy: `max_global_workflows=2`, `max_per_project=1`.
- Tick 1 admitted **A1 + B1**; **A2** remained `WAITING_RESOURCE` (`scheduler_tick_capacity`).
- Reservations held = 2 (`04-admission-tick1.json`).

## Live LLM execution

| Label | session_id | code | Focused tests | Commit |
|-------|------------|------|---------------|--------|
| A1 | `sess-8ec5a744-…` | `PROCESS_COMPLETED` | `test/discount.test.js` exit 0 | `e632e10` applyPercentDiscount |
| B1 | `sess-de931908-…` | `PROCESS_COMPLETED` | `test/sort.test.js` exit 0 | `1ab5c52` sortTasks |

- Provider usage/tokens: **UNAVAILABLE** (not invented).
- No `DETERMINISTIC_SOLVER` on live path.
- Harness stdout excerpts under project `harness-prompts/`.

## Concurrency (overlap)

Intervals (`09-concurrency-timeline.json`):

- A1: `2026-11-13T01:10:38.573Z` → `2026-11-13T01:12:29.157Z`
- B1: `2026-11-13T01:10:39.631Z` → `2026-11-13T01:12:32.601Z`

**overlap = true** (A1 and B1 active simultaneously across projects).

## Controlled failure

- Mode: `queue_sibling_fail` on **A2** while A1 and B1 sessions were **RUNNING**.
- Peers preserved (`07-failure.json`).
- A1/B1 completed successfully afterward.

## Operations TUI

- `evolve operations tui` programmatic session against durable ops state (`05-ops-tui.json`).
- Overview showed projects, queue wait reason, resource holds.

## Coordinator

- Per-project `evolve service start` before harness.
- Restart of project A coordinator recorded (`13-coordinator-restart.json`).
- GlobalOps recover recorded (`12-recover.json`).

## Attempt history

- `attempt-1/`: agent registration bug (fixed).
- `attempt-2/`: B1 cancelled too early; A1 full-suite false negative (fixed focused tests + sibling fail).
- Current: PASS.

## Limitations remaining

- A2 did not complete live engineering (intentionally failed while queued).
- Independent reviewer session not required for these minimal fixtures (implementation-only goals).
- Token/cost budgets remain UNAVAILABLE.
- Release tag not created.
