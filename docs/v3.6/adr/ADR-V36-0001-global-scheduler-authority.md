# ADR-V36-0001 — Global Scheduler authority vs Coordinator

**Status:** Accepted  
**Date:** 2026-11-12

## Context

V3.6 needs multi-workflow admission without duplicating the V3.5 CoordinatorDaemon.

## Decision

- **GlobalOpsService** owns admission, queue, fairness, deps, reservations, project registry.
- **CoordinatorService / CoordinatorDaemon** own execution ticks, agents, harness, sandbox, approvals.
- Ops persists under `--ops-dir`; each project has its own Core `--data-dir`.
- Scheduler never starts subprocesses/harnesses directly.

## Consequences

- Clear one-authority-per-concern.
- Closing CLI/TUI does not stop CoordinatorDaemon (unchanged V3.5 property).
