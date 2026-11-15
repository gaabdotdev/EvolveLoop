# META M07 — Delivery record (Dynamic Planning Engine)

| Field | Value |
|-------|-------|
| Meta | M07 — Dynamic Planning Engine |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m07` · `feature/v4/m07-planning` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (R1–R16 binding) |
| Ownership | `orchestrator/src/v4/planning/**` + `orchestrator/tests/v4/planning/**` |
| Contracts | FROZEN import-only — Task graph, Goal Contract, Work events, ports |
| ADRs | ADR-V4-0010 (no score routing), 0003 (append-only), 0017 (R2 payloads) |
| Constitution | §4.7, §7.1 step 03, §7.2 step 05, §13 |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` already a symlink) |
| V3.7 cert edits | **None** |
| Engine commit | `812c4efbe9b27c2d133b902eb2714f07ceb22c08` |
| Self-assessed status | **DELIVERED for orchestrator validation** — M07 does not mark itself ACCEPTED and does not claim V4 APPROVED |

## Grounding

Wiki: GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset). WAVE4-COMMON allows this. Source of truth was freeze + ADR-V4-0010 + frozen contracts (`task.ts`, `goal-contract.ts`, `ports.ts`, `EVENT_TYPE_CATALOG.plan.revised`) + constitution §4.7.

## 1. What was implemented

Public engine `PlanningEngine` composing M01 `GoalWorkEngine` command paths and M02 `EventLedgerPort`. M07 does not rewrite those aggregates and does not own a parallel Work store.

| Piece | Role |
|-------|------|
| Propose | Read-only Task graph from an **ACCEPTED** Goal Contract + current Work projection. Status is a proposal until `accept`. |
| Accept | Apply via M01 `planTasks` / `changeTaskState` (obsolete / interrupt RUNNING→SUSPENDED→OBSOLETE), then append `plan.revised`. |
| Replan | Triggers: INITIAL, NEW_EVIDENCE, DEPENDENCY_FAILED, RESOURCE_CHANGED, STRATEGY_STALLED, TASK_BLOCKED, RECOVERY. Preserves VERIFIED/CONFIRMED work. Rewrites FAILED + non-verified transitive dependents. |
| Analysis | Critical path, independent tasks, risks, remaining cost (never invented), change impact. |
| Events | Typed allowlist payload for `plan.revised` (R2). F12 names and autonomy/score fields are dropped, never CONTROL. |
| Capability | Optional `CapabilityProfilePort` may be *requested*; `profiles_used_for_routing` is pinned `false` (ADR-V4-0010). |

Honesty pins: `ROUTING_BY_CAPABILITY_SCORE = false`, `PLAN_IS_PROPOSAL_UNTIL_ACCEPTED = true`, `PLANNER_MAY_SET_VERIFIED = false`, `HASH_CHAIN_IS_NON_REPUDIATION = false`.

## 2. Reservations honored (R1–R16)

| ID | M07 action |
|----|------------|
| R1 | Hash chain is tamper-evidence; pin exported |
| R2 | Typed allowlist for `plan.revised`; F12 names ignored |
| R3–R5 | No new id prefixes; no capsule/policy fields invented |
| R6 | Capsule accept is M04; not claimed |
| R7 | Drafts carry no `fencing` |
| R8–R14 | No Grant/Approval kinds; Policy remains M10; autonomy not requested (D06) |
| R15 | Measurement provenance is M12; remaining cost is UNAVAILABLE or DERIVED with `amount: null` |
| R16 | INV-TASK-* enforced on proposals; no fake coverage |

## 3. Tests

```bash
cd orchestrator && npx vitest run tests/v4/planning
cd orchestrator && npx vitest run tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/planning/**` | **18 passed** (initial plan, replan preserve/obsolete, invariant refusals, no score routing) |
| Full `tests/v4` | **254 passed** |

## 4. Files owned by M07

```
orchestrator/src/v4/planning/**
orchestrator/tests/v4/planning/**
```

Not owned / not edited: `orchestrator/src/v4/contracts/**`, V3.7 cert surfaces, `feature/v4-integration`, other metas' trees.

## 5. Commands run

| Command | Result |
|---------|--------|
| `npx vitest run tests/v4/planning` | 18 passed |
| `npx vitest run tests/v4` | 254 passed |
| `npm install` | **not run** |
| merge to integration | **not run** |
| V3.7 cert edits | **not done** |

## 6. Acceptance self-check (not ACCEPTED)

| Mission criterion | Status |
|-------------------|--------|
| Plan / replan from ACCEPTED Goal Contract + Work projection | Met |
| Compose M01/M02 ports; do not rewrite their trees | Met (`GoalWorkEngine` + `FileEventLedger`) |
| INV-TASK-* (deps, cycles, progress honesty; executors cannot VERIFIED) | Met |
| Dynamic replan appends typed `plan.revised`; never mutates history | Met |
| Plans are proposals until M01 command paths | Met |
| No capability-score routing | Met |
| Tests + delivery report | Met |
| No merge / no npm install / no V3.7 cert / no contracts edits / no self-ACCEPTED | Met |

Orchestrator / independent review must validate. This report is **DELIVERED**, not ACCEPTED.

## 7. Gaps / limitations

- Wiki grounding: `WIKI_ROOT` unset → GAP.
- M01 `planTasks` always stamps `Task.plan_version = 1`. Authoritative plan version lives on `plan.revised.payload.plan_version` until M01 is extended (RFC).
- M01 cannot mutate `depends_on` on an existing live task. A BLOCKED task is preserved; M07 may add a RESEARCH task. Unblocking is not a rewritten edge.
- M01 Work projector does not skip non-M01 types. `plan.revised` is stored on the M02 log and is **not** applied to the M01 projection. M19 must multiplex when rebuilding Work from the full stream.
- Crash between M01 apply and `plan.revised` append can leave Work changed without the justification event (no joint transaction across metas).
- Remaining cost: budget max may be DERIVED; spent/remaining amount is `null` / `remaining_unknown: true` (M07 does not invent spend).
- Capability methodology is not ACCEPTED; inspecting profiles never ranks executors for L2/L3 (ADR-V4-0010).
- M19 owns process-wide wiring.
