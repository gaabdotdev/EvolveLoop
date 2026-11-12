# EvolveLoop V3.5 — Architecture

**Base:** `v3-complete` (`6b69c3f`)  
**Branch:** `feature/v3.5-runtime`

## Layers

```
CLI/TUI (client)
    │  Unix IPC + token
    ▼
CoordinatorDaemon (lifecycle, leases, reconcile, approvals IPC)
    │
    ├─ EvolveLoop Core (Goals, TaskGraph, Agents, Locks, Recovery) — unchanged contracts
    ├─ Harness Runtime (adapters + ProcessSessionStore)
    ├─ SandboxManager (bubblewrap backend)
    ├─ Workspace/IntegrationCoordinator + OwnershipLedger
    └─ ApprovalBroker
```

## Key modules

| Module | Path |
|--------|------|
| Security profiles | `orchestrator/src/v3/security/` |
| Sandbox | `orchestrator/src/v3/sandbox/` |
| Approvals | `orchestrator/src/v3/approvals/` |
| Daemon/IPC | `orchestrator/src/v3/coordinator/daemon.ts`, `ipc.ts`, `lifecycle.ts` |
| Workspace integration | `orchestrator/src/v3/workspace/` |
| Harness facade | `orchestrator/src/v3/harness/` |
| CLI V3.5 | `orchestrator/src/cli/v35-commands.ts` |

## Distinction: worktree ≠ sandbox

- **Worktree:** git isolation of changes.
- **Sandbox:** OS confinement via bubblewrap for process/FS/net.

## Persistence

All under `--data-dir`: `coordinator/`, `approvals/`, `workspaces/`, `process-sessions/`, Core stores.
