# V3.7 Component Ownership Map

**Rule:** one authoritative owner per concern. New modules must not fork EventBus, Approval Broker, Sandbox, Measurement Plane, or GlobalOps scheduler without an ADR proving necessity.

| Concern | Authoritative owner | Path | Notes |
|---------|---------------------|------|-------|
| Global workflow admission / project registry (single-host) | GlobalOps V3.6 | `orchestrator/src/v3/ops/` | Evolves into Control Plane APIs; not replaced |
| Distributed Control Plane (fleet authority) | Fabric Control Plane V3.7 | `orchestrator/src/v3/fabric/control-plane/` | Single active CP in V3.7 |
| Node Registry / trust / enrollment | Fabric Node Registry | `orchestrator/src/v3/fabric/node-registry/` | `worker_node_id` ≠ `agent_id` ≠ GraphStore `node_id` |
| Remote execution protocol | Fabric Protocol | `orchestrator/src/v3/fabric/protocol/` | One transport |
| Worker Node Runtime | Fabric Worker Runtime | `orchestrator/src/v3/fabric/worker-runtime/` | Subordinate executor |
| Local Coordinator / daemon | V3.5 Runtime | `orchestrator/src/v3/runtime/`, `coordinator/` | Local execution only |
| Sandbox (OS) | V3.5 Sandbox | `orchestrator/src/v3/sandbox/` | Worktree ≠ sandbox; TLS ≠ sandbox |
| Approval Broker | V3.5 Approvals | `orchestrator/src/v3/approvals/` | Unchanged ownership |
| Local work locks | V3 locks | `orchestrator/src/v3/locks/` | Best-effort; not global leases |
| Distributed leases / fencing | Fabric Leases | `orchestrator/src/v3/fabric/leases/` | CP-authoritative |
| Worker pools / placement | Fabric Scheduler | `orchestrator/src/v3/fabric/scheduler/` | Extends GlobalOps policy; no dual scheduler |
| Artifact Fabric | Fabric Artifacts | `orchestrator/src/v3/fabric/artifacts/` | Hash-verified transfer |
| Agent Registry (logical agents) | V3 Agent Registry | `orchestrator/src/v3/agent-registry/` | Distinct from Node Registry |
| Agent Teams / topologies | Fabric Teams | `orchestrator/src/v3/fabric/teams/` | Uses Agent Registry members |
| Work stealing / speculation | Fabric Redistribution | `orchestrator/src/v3/fabric/{steal,speculative}/` | Opt-in / eligibility gated |
| Measurement Plane | Telemetry MP | `orchestrator/src/telemetry/measurement-plane/` | Not a second EventBus |
| In-process EventBus | Core Events | `orchestrator/src/events/event-bus.ts` | Local only |
| Work Ledger | V3 Work Ledger | `orchestrator/src/v3/work-ledger/` | Preserved |
| Fleet Operations Center | Fabric Ops Center | `orchestrator/src/v3/fabric/ops-center/` | CLI/TUI view; not execution owner |
| Evidence Bus (PDA gates) | memory/`<feature>`/evidence | orchestration contract | Separate from MP & vault |

## Forbidden duplications (V3.7)

- Second EventBus for fleet messaging  
- Second Approval Broker  
- Second Sandbox implementation  
- Second Measurement Plane product layer  
- Second GlobalOps scheduler process claiming admission authority  
- Multi-master Control Plane  

## ID namespaces (non-interchangeable)

| ID | Meaning |
|----|---------|
| `worker_node_id` | Stable enrolled machine identity |
| `agent_id` | Logical agent/harness instance |
| `node_id` (GraphStore / MP legacy) | Scheduler/graph UUID — **must not** be reinterpreted as `worker_node_id` without versioned schema |
| `lease_id` | CP-issued distributed lease |
| `pool_id` | Logical worker pool |
| `control_plane_id` / epoch | Active CP instance identity |
