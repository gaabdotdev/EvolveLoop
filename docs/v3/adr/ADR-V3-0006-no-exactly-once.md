# ADR-V3-0006 — No exactly-once claim for local orchestration

**Status:** Accepted  
**Date:** 2026-11-11  
**Related:** V3.3 resilience; WorkLock fencing; subtree recovery

## Context

Operators may confuse durable state + locks with distributed exactly-once semantics. Local filesystem locks and fencing tokens reduce duplicate mutation risk but cannot eliminate crash races, dual writers, or external harness side effects outside Core mediation.

## Decision

1. EvolveLoop **must not** claim exactly-once execution for work, tasks, or provider jobs.
2. `WorkLock` + fencing tokens are **best-effort** mutual exclusion with stale-token rejection.
3. Subtree recovery is **explicit** (plan → apply); it does not auto-claim success of external agents.
4. Status docs and CLI output must keep the limitation visible.
5. Exactly-once (if ever required) would need a separate ADR with a different storage/consensus substrate.

## Consequences

- Failure-injection tests assert lock conflict, fencing reject, and recovery behaviour — not exactly-once.
- Duplicate work under rare races remains a documented residual risk.
