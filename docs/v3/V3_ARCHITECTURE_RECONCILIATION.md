# V3 Architecture Reconciliation

**Date:** 2026-11-11  
**Against:** Master Document v0.6 §20 + live tree at `51e5bed` (+ local dirty worktree)  
**Purpose:** Prevent discarding useful V2 kernel code and prevent declaring V3 concepts as done because similar names exist.

---

## 1. One-line decision

**V2 Execution Engine is the governed runtime kernel of V3; it is not the V3 product.**  
Coordination plane (Goal Contract, TaskGraph, Agent Registry, Coordinator Service, Continuity Engine) is **additive** above the kernel.

```text
V3 PRODUCT / COORDINATION PLANE        ← mostly NOT_IMPLEMENTED
  Goal Contract → TaskGraph → Agent Registry → Coordinator
  Context Intelligence → Model/Agent Routing → Continuity
        ↓
V2 EXECUTION KERNEL (preserve/evolve)  ← largely IMPLEMENTED
  Capability IR → Policy/Authority → Scheduler → Registry → Providers
  Evidence + Events + Jobs/Checkpoints + Memory + Knowledge
```

---

## 2. Live baseline vs Master §20.1 ZIP note

| Field | Master v0.6 (ZIP 2026-11-09) | This session (2026-11-11) |
|-------|------------------------------|---------------------------|
| Provenance | ZIP without usable `.git` | Real git: branch `release/v2.1-freeze-preparation`, HEAD `51e5bed` |
| Build/tests | Not reproduced | `tsc` OK; unit 273/277; integration 20/21 |
| `src/jobs/` | Present | Present (+ local integrity edits) |
| Package | `@agents/orchestrator@2.0.0` | Same |

Historical claims that `src/jobs/` is missing remain **superseded** (see Master §20.8). Keep those docs as dated history.

---

## 3. Name collisions (do not equate)

| Existing symbol | Actual role | V3 concept that must stay separate |
|-----------------|-------------|-------------------------------------|
| `Orchestrator` (`orchestrator/orchestrator.ts`) | Run recovery FSM: continuar/corrigir/replan | Orquestrador-Mestre / Coordinator Service |
| `RegistryClient` / Capability Registry | Provider selection by capability | Agent Registry (instances, lineage, leases) |
| `GraphStore` | Capability IR node DAG for a run | Orchestration TaskGraph (engineering tasks) |
| `MemoryStore` | Feature preferences/decisions YAML | Shared Work Ledger |
| `EngineCheckpoint` | Graph snapshot for job-wait resume | Continuity Handoff Package |
| `LiveAnalysisCoordinator` | EvolveLoop V1 cadence | Persistent Coordinator Service |
| `MockProvider` | Simulated execution | Never silent substitute for `real` mode |
| Skills / `Agents/*.md` | Host assets | Runtime agent instances |

---

## 4. Preserve / evolve / add / do-not-claim

Aligned with Master §20.5 and confirmed against code:

### Preserve
Capability IR, GraphStore, Scheduler, Capability Registry, ProviderRouter, PluginLoader, MockProvider (tests/explicit mock), Evidence, EventBus/JSONL, JobStore/pickup/resume, MemoryStore, KnowledgeStore/Wiki backend, PolicyEngine, Evolution V1 (gated), skills/rules as assets, agent-setup outside Core.

### Evolve (before broad autonomy)
- CLI provider bootstrap → explicit `mock|real|discovery`
- CapabilityAuthority → fail-closed unknowns; workspace baseline read/create/edit
- Deterministic FS/shell → symlink-safe paths, scrubbed env, process controls
- Checkpoint/jobs → references to coordination IDs without becoming Work Ledger
- Telemetry → cost/tokens only when provider reports them
- CLI surface → keep `run-engine`/`run-jobs` as internal tools under product CLI

### Add (new ownership)
Goal Contract, Orchestration TaskGraph, Work Ledger, Agent Registry, Delegation Contracts, Coordinator Service, Continuity Engine + Handoff Package, Model Catalog, Agent adapters (Cursor/Claude Code/Codex/Antigravity), Context Intelligence productization, Nomic embeddings index, TRUE_FULL_PASS evaluator, Work locks/fencing, Subtree recovery, Git worktrees, Cancel+idempotency, Parallel TaskGraph scheduler, Failure-injection battery.

### Do not claim ready
OS sandbox (worktrees ≠ sandbox), exactly-once global execution, cross-provider auto-swap of live harness processes, cancel that kills external agent PIDs, full product TUI, OmniRoute/Jev as defaults, noncommercial LICENSE swap, Windows/macOS official support.

---

## 5. ID relationship (contract for implementers)

| ID | Owner | Meaning |
|----|-------|---------|
| `goal_contract_id` + `version` | Goal Contract store | Versioned acceptance criteria |
| `work_id` | Work Ledger | Global work / TRUE_FULL_PASS machine |
| `task_id` | Orchestration TaskGraph | Engineering task node |
| `agent_id` | Agent Registry | Live agent instance |
| `delegation_id` | Delegation Contract | Parent→child authority grant |
| `feature_id` | Memory / engine | Existing feature-scoped runs (V2) |
| `ir_id` / `run_id` | Capability IR / ExecutionEngine | Low-level capability run |
| `node_id` | GraphStore | Capability node within a run |
| `job_id` | JobStore | External skill job |
| `evidence_id` | Evidence | Proof bound to criterion/task/run |

Rule: GraphStore node success ≠ work `TRUE_FULL_PASS`. Global pass only after Goal Contract criteria verification.

---

## 6. Doc history policy

- Do **not** delete audit reports that disagree with today’s tree.
- Mark them with snapshot date / commit when citing.
- Master Document v0.6 stays the product reference; versioned revisions may follow as `v0.7+` after ADR approval.
- V2.3 docs under `docs/v23/` describe a different milestone (Orca readiness); they are not V3 completion evidence.

---

## 7. Conflicts: V2 behavior vs V3 requirement

| Conflict | Decision |
|----------|----------|
| Silent mock bootstrap vs “never present mock as real” | Prefer V3: explicit mode; `real` fail-closed (ADR-V3-0001) |
| Authority default allow vs fail-closed governance | Prefer V3: deny unknown; allowlist deterministic reads (ADR-V3-0002) |
| Lexical path checks vs symlink-safe workspace | Prefer V3: realpath-based confinement (ADR-V3-0002) |
| Full env inheritance to shell vs secret protection | Prefer V3: scrubbed env allowlist (ADR-V3-0002) |
| MIT vs intended noncommercial | **Do not change LICENSE** without legal ADR + approval (ADR-V3-0004) |
| Preserve old run-engine UX vs product CLI | Keep runners; add modes without breaking `--provider-mode mock` tests |
