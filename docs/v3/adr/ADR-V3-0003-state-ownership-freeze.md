# ADR-V3-0003 — State ownership freeze for V3 coordination plane

**Status:** Accepted  
**Date:** 2026-11-11  
**Related:** Master v0.6 §20.4; `docs/v3/V3_COMPONENT_OWNERSHIP.md`; historical ADR-DR-0005 / ADR-0013

## Context

Multiple stores already exist (GraphStore, MemoryStore, KnowledgeStore, EventBus, Evidence, Checkpoint). V3 adds Goal Contract, TaskGraph, Agent Registry, Work Ledger. Without a freeze, implementers will overload MemoryStore or Capability Registry.

## Decision

Adopt `V3_COMPONENT_OWNERSHIP.md` as normative for V3 implementation. Especially:

- Capability Registry ≠ Agent Registry
- GraphStore ≠ Orchestration TaskGraph
- MemoryStore ≠ Work Ledger
- EngineCheckpoint ≠ Handoff Package
- Evidence ≠ Telemetry ≠ Event Log

Compaction/reinject may only produce disposable Context Views regenerable from canonical stores. No compaction implementation may delete Evidence, Events, Checkpoints, or Goal Contract versions.

## Consequences

- New modules must declare owner + store path in docs before merge.
- PRs that store task progress only inside MemoryStore YAML are rejected for V3 coordination features.
