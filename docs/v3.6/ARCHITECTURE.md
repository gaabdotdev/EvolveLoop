# EvolveLoop V3.6 — Architecture

**Version name:** Multi-Workflow Engineering Operations  
**Base:** V3.5 operational (`0992cd2`)

## Planes

```
Operations Center (CLI/TUI)
        │
GlobalOpsService  (--ops-dir)
  ├─ ProjectRegistry
  ├─ WorkflowRegistry + FSM
  ├─ DependencyCoordinator
  ├─ Scheduler (admission/fairness/aging)
  ├─ GlobalResourceManager
  ├─ TeamComposer
  ├─ QualityGateRunner
  └─ IsolationGuard
        │  admit → registerWork / GoalContract
        ▼
Per-project Execution Plane (V3.5)
  CoordinatorDaemon + Core + Sandbox + Harness + Approvals
```

## CLI

```
evolve project add|list|inspect|doctor --ops-dir …
evolve workflow submit|list|inspect|pause|resume|cancel|dependencies --ops-dir …
evolve scheduler status|queue|policy|tick|recover --ops-dir …
evolve resources status|reservations --ops-dir …
evolve operations tui|overview|gates-discover --ops-dir …
```

## Recovery

On restart: load ops state → expire leases → demote RUNNING/ADMITTED without live process/session → refresh deps → rebuild queue. Never trust persisted RUNNING alone.
