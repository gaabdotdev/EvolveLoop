# V3 Implementation Roadmap

**Date:** 2026-11-11  
**North star:** lowest reasonable cost per verified task toward `TRUE_FULL_PASS`, without sacrificing security or evidence quality.  
**Rule:** a milestone is done only when gates pass with real behavior + tests + documented limitations — not when code compiles.

---

## Phase Zero — Baseline & critical hardening (NOW)

**Objective:** reproducible baseline + close validity/security blockers that poison later work.

| Deliverable | Acceptance |
|-------------|------------|
| Status / Reconciliation / Ownership / Roadmap + ADRs | Files under `docs/v3/` |
| Provider modes `mock` / `real` / `discovery` | No silent mock in `real`; summary declares mode |
| Authority fail-closed + symlink-aware workspace paths | Unit tests for deny-unknown, symlink escape |
| Shell env scrubbing | Unit/integration proof secrets not inherited by default |
| Baseline metrics recorded | Build/test counts in `V3_IMPLEMENTATION_STATUS.md` |

**Out of scope for Phase Zero:** TUI, Agent Registry, Goal Contract product flow, Nomic, OmniRoute, LICENSE change.

---

## V3.0 — Persistent foundation & Goal Contract

**Objective:** objective → contract → verifiable execution path that survives UI close (state persisted; coordinator process skeleton).

Deliveries:
- Goal Contract schema + versioning + criterion states
- Grill-Me intake bridge (host skill → Core artefact)
- Orchestration TaskGraph (minimal) linked to `feature_id`/`task_id`/`run_id`
- Durable Event Log for coordination events
- Evidence binding to criteria
- Policy profiles for workspace file baseline vs configurable caps
- CLI non-interactive commands for start/status/resume (TUI can be thin)
- Coordinator Service MVP (local daemon/supervised process; document OS sleep/power limits)

**Gate:** one objective traverses intake→contract→(engine or PDA)→evidence; state survives closing the interface; recoverable failure leaves work paused, not lost.

---

## V3.1 — Hierarchy & interoperability

- Master / domain leaders / mandatory planner / workers / auxiliaries
- Agent Registry + heartbeats/leases
- Delegation Contracts
- Priority adapters: Cursor, Claude Code, Antigravity, Codex (declare real capabilities only)
- Shared Work Ledger MVP

**Gate:** real hierarchy demo, `PLAN_APPROVED` before domain exec, worker recovery via registry.

---

## V3.2 — Context Intelligence & routing

- Memory layers + Nomic Embed Text
- Hybrid retrieval + Context Views
- Budgeter, compaction, reinject (loss criteria + tests)
- Model Catalog; Jev/Jev-style decision path; OmniRoute investigation
- Efficiency telemetry (no invented tokens)

**Gate:** paired benchmark shows efficiency without material quality regression (or documents failure honestly).

---

## V3.3 — Resilient orchestration

- Cross-provider handoff packages
- Subtree recovery
- Leases / locks / fencing / worktrees as needed
- Hierarchical budgets; stuck detection
- Explicit non-claims for exactly-once
- Coordinated cancel + idempotency keys
- Controlled parallel TaskGraph scheduling
- In-process failure-injection battery (`evolve battery run`)

**Gate:** failure-injection tests for worker/leader loss and quota exhaustion — **met** (`v33-resilience` + `v33-integral` + `v33-multiagent-resilience` E2E + `gate.v33-integral.json`). Includes hierarchical budgets, aux spawn, limit→handoff, cross-provider Core apply, CLI harness dry-run, TUI actions. Declared non-claims: exactly-once, IDE session kill, OS sandbox.

---

## V3.4 — Engineering loop advanced

- Investigation→spec→implement→test→review→security→replan
- Deterministic `TRUE_FULL_PASS` evaluator
- Held-out benchmarks + independent evidence
- Harness capability matrix (honest classes)
- CLI: `evolve engineering run`, `evolve harness matrix`

**Gate:** Engineering Loop E2E with real workspace mutations + independent review + evaluator `TRUE_FULL_PASS` — **met** (`engineering-loop` unit + `v34-engineering-loop` integration + `docs/v3/evidence/gate.v34-engineering.json`). Live LLM harness quality benchmarks remain optional follow-up (not falsely claimed).

---

## Immediate execution order after docs

1. ADR-V3-0001 provider modes + implement + tests  
2. ADR-V3-0002 security hardening (authority/path/shell) + tests  
3. ADR-V3-0003 ownership freeze (already in ownership doc)  
4. ADR-V3-0004 license hold  
5. Fix/document tiktoken + session-continuity integrity failure for green baseline  
6. Begin V3.0 Goal Contract types in Core (no fake CLI success)

---

## Tracking

Update `V3_IMPLEMENTATION_STATUS.md` per capability after each cycle. Never use arbitrary percent-complete.
