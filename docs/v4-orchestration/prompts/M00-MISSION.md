# META M00 — Architecture & Domain Contracts

You are the specialist **leader** for META M00 of EvolveLoop V4.

## Normative sources (read fully)

1. `docs/v4/EvolveLoop_V4_Product_Architectural_Constitution.md` — chapters **1, 3, 5, 6, 7, 15.2, 17** (also skim 2, 14 for constraints)
2. `docs/v4/EvolveLoop_V4_Orchestrator_Mission.md` — M00 section + validation rules
3. `docs/v4-orchestration/MASTER-PLAN.md`, `REQUIREMENTS-MATRIX.md`, `INVENTORY.md`, `DECISIONS.md`

## Environment

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m00` |
| Branch | `feature/v4/m00-architecture` |
| Baseline | `03937c175368715e893193fcfad09aac8474286b` (**provisional**; V3.7 global cert **BLOCKED** on G17) |
| Integration branch | `feature/v4-integration` (do not merge yourself) |
| Forbidden | Modify `recovery/v37-full-cert`, V3.7 evidence, other metas’ future ownership without RFC |

## Your job

Convert constitution concepts into **architecture + versioned contracts + ADRs + ownership**, not full product modules.

Deliver:

1. Detailed V4 architecture doc under `docs/v4/architecture/`
2. Component/dependency diagrams (mermaid ok)
3. Domain model + invariants for: Work, Goal Contract, Task, Execution, Executor, Execution Capsule, Checkpoint, Effect Record, Artifact, Evidence, WorkProof, Policy, Capability Profile, Work Event
4. Initial **versioned** schemas/contracts under `docs/v4/contracts/` (and optional TypeScript types under a path you declare as M00-owned, e.g. `orchestrator/src/v4/contracts/` — contracts only, no engines)
5. ADR register resolving open questions in constitution §15.2 (Event Ledger style, persistence guarantees, checkpoint boundaries, capsule versioning, fork/replay semantics, effect UNKNOWN, independent verification, capability scoring methodology placeholders, policy language options, elastic compute, interoperability levels, multi-tenancy) — choose justified defaults or explicit “deferred with decision date”, never silent invention presented as final API
6. Ownership map: directories/files per meta M01–M20
7. Integration contracts between metas + consumer conformance/test hooks (skeletons ok if runnable)
8. Acceptance criteria checklist per meta refined for this repo
9. Explicit V3.7 adapter boundary: reuse fabric/registry/protocol/workers/placement/leases/artifacts via adapters — **do not reimplement** without ADR + migration plan; do not edit V3.7 cert surfaces

## Method

1. Inspect existing `orchestrator/src/**` on this tip (v3, fabric, persistence, policy, evidence, telemetry) before proposing layers.
2. Create **subagents** for: (a) domain/contracts draft, (b) ADR deep-dives on hardest open decisions, (c) **independent review** of your package with separate context.
3. Commit on your branch with clear messages. Disk is tight — do not duplicate `node_modules` (symlink already present).
4. Do **not** implement Goal Compiler, ledgers, handoff engines, Control Center UI, etc.

## Out of scope

- Product feature implementation for M01–M17/M19
- Changing V3.7 certification artifacts
- Claiming V3.7 APPROVED
- Marketplace design
- Final API freeze without documenting uncertainty

## Acceptance (what orchestrator will validate)

- Traceability from constitution concepts → contracts/ADRs
- Open decisions addressed via ADR (accepted/deferred with rationale)
- Ownership map covers M00–M20 with no orphan requirements from matrix
- No secrets; no exactly-once claims; principles preserved
- Independent subagent review report included
- Commits identifiable; tests/hooks for contract schemas if you add code
- Delivery report: `docs/v4/architecture/M00-DELIVERY.md` with commits, commands, limitations, risks

## Delivery report must include

Branch, commit hashes, files owned, ADRs, how consumers should depend on contracts, residual open questions, subagent review outcome.

When done, stop and leave the worktree ready for orchestrator validation. Do not merge to `feature/v4-integration`.
