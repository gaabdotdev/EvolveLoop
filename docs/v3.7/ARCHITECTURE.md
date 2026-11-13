# V3.7 Architecture — Adaptive Distributed Agent Fabric

**Baseline:** `feature/v3.7-lineage-integration` @ see `evidence/canonical-baseline-commit.txt`  
**Implementation branch:** `feature/v3.7-distributed-fabric`  
**Charter:** `EVOLVELOOP_V3.7_GOALS_AND_ARCHITECTURE_v1.0.md`

## Authority model

```text
Control Plane (single active)
  ├── Node Registry / Trust / Enrollment
  ├── Distributed Leases + Fencing
  ├── Placement (hard → soft) + Worker Pools
  ├── Artifact Fabric
  ├── Team / Topology Registry
  ├── Work Stealing / Speculative (policy-gated)
  └── Protocol Server (TLS default; plaintext lab-only)
        │
        ▼
Worker Node Runtime (subordinate)
  ├── validate ExecutionContract + lease/fencing
  ├── slots / workspace / process supervision
  ├── sandbox via V3.5 (no silent host fallback)
  └── outbox / result submit (fencing checked at CP)
```

Local Coordinator V3.5 remains the **local** execution authority inside a node. GlobalOps V3.6 remains the single-host admission ancestor; fabric placement **extends** it and does not fork a second scheduler.

## Entity separation

| Entity | ID namespace | Role |
|--------|-------------|------|
| Worker Node | `worker_node_id` (`wn_…`) | Machine identity |
| Agent Worker | `agent_id` | Logical harness instance |
| Agent Team | `team_id` | Topology-bound group |
| Worker Pool | `pool_id` | Capability selector group |
| GraphStore/MP `node_id` | legacy | **Not** a Worker Node |

## Non-negotiables (enforced in code/tests)

- One active Control Plane (`control-plane.json` epoch on restart)
- Hard constraints never overridden by soft score
- Stale fencing rejected at result commit
- Lease expiry ≠ process death
- Measurement Plane is not a second EventBus
- Plaintext protocol only via explicit `insecurePlaintext` lab flag
