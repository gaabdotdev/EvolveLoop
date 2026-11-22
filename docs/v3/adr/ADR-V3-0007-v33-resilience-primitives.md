# ADR-V3-0007 — V3.3 resilience primitives (worktree, cancel, idempotency, parallel)

**Status:** Accepted  
**Date:** 2026-11-11  
**Related:** ADR-V3-0006 (no exactly-once), Continuity Engine, Subtree Recovery, Work locks

## Context

V3.3 requires handoff, recovery, leases/locks/fencing, worktrees, cancel, controlled parallelism, and failure-injection evidence. Several of these could be over-promised (OS sandbox, exactly-once, killing foreign harnesses).

## Decision

1. **Worktrees** are git worktree helpers under `--data-dir/worktrees/`. They are not an OS sandbox and do not prevent edits to the primary checkout.
2. **Cancel** mutates Core coordination state (agents, non-verified tasks, held locks, pending handoffs). It does not claim to SIGKILL Cursor/Claude/Codex processes unless a future adapter explicitly supports cancel.
3. **Idempotency keys** dedupe coordination mutations (cancel first). Same key + same payload → replay; same key + different payload → conflict (fail-closed).
4. **Parallel scheduler** only advances TaskGraph `PENDING`→`IN_PROGRESS` under `max_in_progress` / optional `max_per_domain`. It does not spawn adapters.
5. **Failure battery** (`evolve battery run`) exercises in-process scenarios only; it is the V3.3 gate evidence for Core resilience, not live multi-process chaos.

## Consequences

- V3.3 gate can be marked met for Core coordination without inventing harness control.
- Operators must still use adapter-specific cancel/supervision for external processes.
- Exactly-once remains explicitly non-claimed (ADR-V3-0006).
