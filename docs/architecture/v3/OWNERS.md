# EvolveLoop V3 Contract Owners (stub)

| Area | Owner | Contact / role |
|------|-------|----------------|
| `orchestrator/contracts/v3/*` | orchestrator-v3 | Backend / contract steward |
| `orchestrator/src/v3/contracts/*` | orchestrator-v3 | Backend / TypeScript steward |
| `orchestrator/src/v3/goals/*` | orchestrator-v3 | GoalStore + SuccessOracle |
| `orchestrator/src/v3/agency/*` | orchestrator-v3 | AgencyLoop + Governor + bridge |
| `orchestrator/src/v3/world-model/*` | orchestrator-v3 | WorldModelStore + reconcile + BeliefRevision |
| `orchestrator/src/v3/fabric/*` | orchestrator-v3 | Capability Fabric adapter (discovery/compose/acquisition stub) |
| `orchestrator/src/v3/failure/*` | orchestrator-v3 | Failure Containment + Recovery + Anti-Stagnation (V3-F5) |
| `orchestrator/src/v3/adapters/*` | orchestrator-v3 | Thin adapters (bridge non-executing; agency-runtime wires Engine) |
| `docs/architecture/v3/*` | orchestrator-v3 | Architecture docs |
| `docs/architecture/v3/AGENCY.md` | orchestrator-v3 | Agency Layer additive contract |
| `docs/architecture/v3/AGENCY-RUNTIME.md` | orchestrator-v3 | Agency→ExecutionEngine integration adapter |
| `docs/architecture/v3/WORLD-MODEL.md` | orchestrator-v3 | World Model substrate (V3-F3 start) |
| `docs/architecture/v3/CAPABILITY-FABRIC.md` | orchestrator-v3 | Capability Fabric adapter (V3-F3) |
| `docs/architecture/v3/FAILURE-RECOVERY.md` | orchestrator-v3 | Failure/Recovery helpers (V3-F5 start) |
| Meta0 EvidencePackage / Demo | orchestrator-v3 | Public proof schemas |
| Evidence lineage ↔ v2.1 | evidence-maintainers | Must not break builders |
| Capability lifecycle ↔ registry | registry-maintainers | No second registry |

## Change policy

1. Schema bumps: patch for additive optional fields; minor for new kinds; major for breaking renames.
2. First wave locked at `0.1.1`; Agency Layer (V3-F2) is additive **proposal** surface only — does not execute.
3. World Model (V3-F3 start) is additive Observation/Belief substrate — **must not** fork KnowledgeBackend or MemoryStore V2.
4. Capability Fabric (V3-F3) is an **adapter** over existing `CapabilityRegistry` — **must not** create a second registry or install capabilities.
5. PRs touching V3 contracts, Agency, World Model, Fabric, Agency Runtime, or Failure/Recovery require update to this OWNERS stub and applicable `CONTRACTS.md` / `AGENCY.md` / `AGENCY-RUNTIME.md` / `WORLD-MODEL.md` / `CAPABILITY-FABRIC.md` / `FAILURE-RECOVERY.md`.
6. `agency-runtime` may call `ExecutionEngine.run` once per allowed proposal; it **must not** bypass Policy inside providers or claim PASS without SuccessOracle.
