# V3 Component Ownership

**Date:** 2026-11-11  
**Rule:** No two modules may claim the same authoritative state. Projections are reconstructible; they are not sources of truth.

---

## 1. Ownership table

| Component | Responsibility (only) | Canonical store (target) | Existing code (if any) | Must not own |
|-----------|------------------------|--------------------------|------------------------|--------------|
| **Goal Contract** | Objectives, scope, exclusions, NFRs, acceptance criteria, verification methods, evidence requirements; versioned | `goal_contracts/<id>/vN.json` (TBD) | Host grill-me skill only | Task assignment, agent sessions |
| **Orchestration TaskGraph** | Engineering tasks, deps, owners, domain plans, PLAN_APPROVED, task state machine | Work Ledger task projection | — | Capability DAG dispatch |
| **GraphStore** | Capability IR nodes for a single engine run | In-memory + checkpoint graph snapshot | `orchestrator/src/graph/graph-store.ts` | TRUE_FULL_PASS, agent lineage |
| **Agent Registry** | Agent instances, roles, parent/child, heartbeat, lease, session, permissions, budget | Agent registry store (TBD) | — (Capability Registry is different) | Provider capability catalogs |
| **Capability Registry** | Available providers/capabilities/manifests | Registry built from manifests | `registry/registry-client.ts` | Live agent instances |
| **Model Catalog** | Models, windows, cost/latency metadata, local/remote | `orchestrator/src/v3/model-catalog/` | `--data-dir/model-catalog/` | Agent hierarchy / live telemetry |
| **ProviderRouter** | Map `provider_id` → `ProviderRuntime` for execution | Process-local router | `providers/mock-provider.ts` (`ProviderRouter`) | Model selection policy |
| **Model/Agent Router** | Choose eligible model/agent under policy | Decision + deterministic filters (TBD) | — | Capability IR validation |
| **Event Log** | Append-only facts of coordination/execution | Durable event log (evolve JSONL) | `events/`, `persistence/jsonl-event-persister.ts` | Semantic “truth” of criteria pass |
| **Evidence** | Observable proofs bound to criteria/tasks/runs | Evidence store + engine `evidence[]` | `evidence/` | Telemetry aggregates |
| **Context Views** | Disposable role-scoped projections + compact/reinject | `orchestrator/src/v3/context/` | regenerated on demand | Canonical stores (Goal/Task/Ledger/…) |
| **Embeddings / hybrid retrieve** | Nomic vectors + durable per-work index + hybrid rank | `orchestrator/src/v3/embeddings/` | `--data-dir/vector-index/` + Ollama | OmniRoute / multi-tenant vector DB |
| **Budget / stuck** | Reported consumption vs delegation limits; stuck heuristics | `orchestrator/src/v3/budget/` | agent `budget_consumed` | Invented telemetry |
| **Deterministic routing** | Hard-constraint candidate selection + optional decision model | `orchestrator/src/v3/routing/` | model-catalog + adapters | OpenRouter Jev / OmniRoute product defaults |
| **Telemetry** | Tokens/cost/latency when reported; never invent | Metrics/traces | `telemetry/` | Acceptance decisions |
| **Memory** | Preferences, episodic/contextual notes with provenance | MemoryStore | `memory/` | Work Ledger / Goal Contract |
| **Knowledge** | Curated reusable knowledge (wiki/backend) | KnowledgeStore / Wiki | `knowledge/` | Live task progress |
| **Semantic Index** | Derived embeddings/retrieval over authorized sources | Rebuildable index (Nomic) | Wiki CLI hybrid only; no Core Nomic | Source of truth |
| **Checkpoint** | Minimal resume state for a run/session | `jobs/checkpoints` + session continuity | `jobs/checkpoint.ts`, `session/` | Full project history |
| **Coordinator Service** | Persistent process: schedules work, survives TUI close | OS service + durable state | — (`LiveAnalysisCoordinator` ≠ this) | Implementing worker code |
| **Work locks / fencing** | Best-effort mutual exclusion + fencing tokens | `orchestrator/src/v3/locks/` | `--data-dir/locks/` | Exactly-once / distributed consensus |
| **Subtree recovery** | Leader-loss orphan/cancel/adopt/handoff plans | `orchestrator/src/v3/recovery/` | Agent Registry + TaskGraph | Auto harness swap |
| **Worktrees** | Git worktree create/list/remove metadata for agent isolation | `orchestrator/src/v3/worktrees/` | `--data-dir/worktrees/` | OS sandbox / primary checkout enforcement |
| **Cancel service** | Coordinated cancel of agents/tasks/locks/pending handoffs | `orchestrator/src/v3/cancel/` | Agent Registry + TaskGraph + locks + handoffs | Killing external harness PIDs |
| **Idempotency store** | Keyed replay/conflict for coordination mutations | `orchestrator/src/v3/idempotency/` | `--data-dir/idempotency/` | Exactly-once across processes |
| **Parallel scheduler** | Cap READY→IN_PROGRESS transitions | `orchestrator/src/v3/parallel/` | TaskGraph only | Adapter/harness spawn |
| **Failure battery** | Deterministic in-process resilience scenarios | `orchestrator/src/v3/failure-injection/` | uses Continuity/Recovery/Locks/Cancel/Parallel | Live multi-host chaos |
| **Limits classifier** | Map provider/quota/rate-limit signals → agent session state + handoff | `orchestrator/src/v3/limits/` | ContinuityEngine | Invented token quotas |
| **Hierarchical budgets** | Subtree consumption rollup vs parent max_* | `orchestrator/src/v3/budget/hierarchical.ts` | Agent Registry delegations | Telemetry invention |
| **CLI harness drivers** | Probe/spawn external CLIs with dry-run default | `orchestrator/src/v3/adapters/drivers/cli-*.ts` | process-sessions under `--data-dir` | IDE-attached session control |
| **Cross-provider apply** | Continuity apply + provider rebind + optional driver invoke | `AdapterHandoffBridge.applyCrossProvider` | Continuity + Agent Registry | Silent auto_swap without Core ownership transfer |
| **Engineering Loop** | Stage machine for contract→plan→implement→test→review→replan→verify | `orchestrator/src/v3/engineering/` | Goal Contract + TaskGraph + Agent Registry + workspace | LLM authorship of code (deterministic workers in Core gate) |
| **Harness matrix** | Honest capability classification per adapter | `engineering/harness-matrix.ts` | Adapter catalog + CLI probe | Claiming SUPPORTED for dry-run |
| **Work Ledger** | Versioned shared operational state + event history for a work_id | `orchestrator/src/v3/work-ledger/` (JSONL + meta snapshot) | `--data-dir/work-ledger/` | Preference memory |
| **Delegation Contract** | Scoped authority transfer parent→child | Contract records (TBD) | IR DoD / manifests are not substitutes | Global policy definition |
| **CapabilityAuthority** | allow/deny/confirm for operations | Policy flags + workspace root | `authority/capability-authority.ts` | Retry/gate strategy (PolicyEngine) |
| **PolicyEngine** | Retries, gates, provider strategy, timeouts | Policy YAML | `policies/`, `policy/` | Authorization decisions |
| **ExecutionEngine** | Run Capability IR under policy/providers | RunResult | `engine/execution-engine.ts` | Product Goal Contract |
| **Evolution V1** | Longitudinal observe/propose gated evolution | evolveloop stores | `evolveloop/` | Daily coordination |

---

## 2. State machines (owners)

### Criteria (Goal Contract)
`NOT_STARTED | IN_PROGRESS | PASS | FAIL | NOT_PASS | BLOCKED | NOT_APPLICABLE`  
Only verifiers + deterministic evaluator may set PASS/FAIL. Agent prose cannot.

### Tasks (TaskGraph)
`PENDING | IN_PROGRESS | PARTIAL_PASS | TRUE_PASS | BLOCKED | FAILED | CANCELLED`

### Global work (Work Ledger)
`NOT_PASS | IN_PROGRESS | VERIFICATION | RECOVERY | BLOCKED | CANCELLED | TRUE_FULL_PASS`  
`TRUE_FULL_PASS` requires all applicable mandatory criteria PASS + valid evidence + no mandatory BLOCKED/FAIL pending.

### Agents (Agent Registry)
`INITIALIZING | ACTIVE | WAITING | YIELDING | LIMIT_REACHED | FAILED | STALE | ORPHANED | REPLACED | COMPLETED | CANCELLED`  
`LIMIT_REACHED` is a **session** event, not task terminal success/failure.

---

## 3. Integrity rules

1. Projections (Context Views, compacted prompts) are disposable and regenerable.
2. Event Log is append-only; corrections are new events.
3. Evidence keeps provenance to original artefacts.
4. Child permissions ⊆ parent permissions.
5. No active agent without owner, task, Delegation Contract, permissions, budget, escalation path.
6. GraphStore completion does not mutate Goal Contract criteria.

---

## 4. Interim mapping during migration

Work Ledger MVP exists (`WorkLedgerStore` under `--data-dir/work-ledger/`):

- Continue using `feature_id` + `memory/<feature_id>/` for host PDA evidence bus (engine runs).
- Engine runs remain keyed by `feature_id` / `ir_id` / `run_id`; ledger records execution links without absorbing MemoryStore.
- Do **not** overload MemoryStore YAML as TaskGraph.
- Do **not** rename Capability Registry into Agent Registry.
- Do **not** treat Work Ledger projections as disposable UI views — JSONL is append-only SSOT; meta snapshot is rebuildable.
