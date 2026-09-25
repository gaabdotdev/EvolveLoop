# EvolveLoop V3 — First-Wave Contracts

**Status:** draft — schemas Phase 0/1 + minimal Agency Layer (V3-F2 start)  
**Schema version:** `0.1.0`  
**API version:** `evolveloop.io/v3`  
**Stack (IMMUTABLE):** Intent → Capability → Policy → Runtime → Provider → Evidence

This index lists formalized first-wave contract artifacts. See [AGENCY.md](./AGENCY.md) for the additive proposal layer. Superpowers and Self-Evolution promote remain **out of scope**.

## Contract catalog

| # | Schema | YAML | TS kinds | Owners |
|---|--------|------|----------|--------|
| 1 | GoalContract + GoalLifecycleState + GoalVersion | [`goal-contract.yaml`](../../../orchestrator/contracts/v3/goal-contract.yaml) | `GoalContract` | see [OWNERS.md](./OWNERS.md) |
| 2 | SuccessOracleCriterion + GoalSatisfactionProof | [`success-oracle.yaml`](../../../orchestrator/contracts/v3/success-oracle.yaml) | `SuccessOracleCriterion`, `GoalSatisfactionProof` | OWNERS |
| 3 | AutonomyGovernorDecision | [`autonomy-governor.yaml`](../../../orchestrator/contracts/v3/autonomy-governor.yaml) | `AutonomyGovernorDecision` | OWNERS |
| 4 | EvidenceLineage | [`evidence-lineage.yaml`](../../../orchestrator/contracts/v3/evidence-lineage.yaml) | `EvidenceLineage` | OWNERS |
| 5 | CapabilityLifecycleState | [`capability-lifecycle.yaml`](../../../orchestrator/contracts/v3/capability-lifecycle.yaml) | `CapabilityLifecycleRecord` | OWNERS |
| 6 | EffectClassification + IdempotencyClass | [`effect-idempotency.yaml`](../../../orchestrator/contracts/v3/effect-idempotency.yaml) | `EffectIdempotencyDeclaration` | OWNERS |
| 7 | CheckpointSchemaV3 | [`checkpoint-v3.yaml`](../../../orchestrator/contracts/v3/checkpoint-v3.yaml) | `CheckpointSchemaV3` | OWNERS |
| 8 | SafetyState + SandboxDepth S0–S5 | [`safety-sandbox.yaml`](../../../orchestrator/contracts/v3/safety-sandbox.yaml) | `SafetySandboxContext` | OWNERS |
| 9 | Belief + Observation | [`belief-observation.yaml`](../../../orchestrator/contracts/v3/belief-observation.yaml) | `Belief`, `Observation` | OWNERS |
| 10 | MemoryTrustClass | [`memory-trust.yaml`](../../../orchestrator/contracts/v3/memory-trust.yaml) | `MemoryTrustAnnotation` | OWNERS |
| 11 | EvolutionCandidateStub | [`evolution-candidate-stub.yaml`](../../../orchestrator/contracts/v3/evolution-candidate-stub.yaml) | `EvolutionCandidateStub` | OWNERS |
| 12 | DelegationContractStub | [`delegation-contract-stub.yaml`](../../../orchestrator/contracts/v3/delegation-contract-stub.yaml) | `DelegationContractStub` | OWNERS |
| 13 | Meta0 EvidencePackageManifest + DemoManifest | [`meta0-evidence-demo.yaml`](../../../orchestrator/contracts/v3/meta0-evidence-demo.yaml) | `EvidencePackageManifest`, `DemoManifest` | OWNERS |
| 14 | InstructionHierarchy | [`instruction-hierarchy.yaml`](../../../orchestrator/contracts/v3/instruction-hierarchy.yaml) | `InstructionHierarchyBinding` | OWNERS |

## Code surface

- Types + validators: `orchestrator/src/v3/contracts/`
- Goals + Oracle: `orchestrator/src/v3/goals/`
- Agency (propose only): `orchestrator/src/v3/agency/`
- Barrel: `orchestrator/src/v3/index.ts`
- Main re-export: `orchestrator/src/index.ts` behind `// V3 additive`
- Unit tests: `orchestrator/tests/unit/v3/`
- Agency architecture: [AGENCY.md](./AGENCY.md)
- Meta0 demos: [META0-DEMOS.md](./META0-DEMOS.md) (`orchestrator/demos/v3`, `src/v3/meta0`)

## Invariants

- EvidenceLineage **points to** Evidence v2.1 (`capability-orchestrator.io/v2`); does not replace builders.
- CapabilityLifecycle annotates existing registry IDs; **no second registry**.
- CheckpointSchemaV3 may reference EngineCheckpoint via `engine_checkpoint_ref`; **must not** change v2 `apiVersion`.
- MemoryTrustClass uses namespace `v3_memory_trust`; separate from V2 MemoryStore.
- EvolutionCandidateStub is **schema only** — no promote.

## GAP

- Meta0 content lives in `v3-metas-topo.md`, not in `EVOLVELOOP_V3.md` body.
- No EvolveLoop wiki pack yet (register via vault `EvolveLoop/log.md` handoff).
