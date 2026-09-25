# EvolveLoop V3 — Capability Fabric (adapter)

**Status:** checkpoint V3-F3 — additive over existing `CapabilityRegistry`  
**Stack (IMMUTABLE):** Intent → Capability → Policy → Runtime → Provider → Evidence  
**Sources:** `EVOLVELOOP_V3.md` Meta 13, 45, 46; §204–210

## Purpose

Decide **with what** to act — discovery + composition planning + acquisition **stub** gate — without replacing the V2 registry or executing providers.

```
NEED (string)
    ↓
FabricDiscovery  →  CandidateCapability[]   (reads CapabilityRegistry)
    ↓
CompositionPlanner → CompositionPlan | unmet_need   (does NOT execute)
    ↓
(optional) AcquisitionGate → register | quarantine lifecycle annotation
    ↓
Agency bridge (optional): set capability_hint | needs_planner
    ↓
(downstream) Policy → Runtime → Provider → Evidence
```

## Additive layering

| Layer | Role |
|-------|------|
| V2 `CapabilityRegistry` / `RegistryClient` | **Single** registry — unchanged |
| `CapabilityLifecycleRecord` | Annotation beside registry ids — not a fork |
| V3 Fabric (`src/v3/fabric/`) | Adapter: discover / plan / gate stub |
| V3 Agency bridge | Optional enrich when `capability_hint` missing |

**Proibido:** second `CapabilityRegistry` class.  
**Proibido:** real download/install of capabilities.  
**Proibido:** OS sandbox implementation (schema depth S0–S5 only).  
**Proibido:** mutating provider handlers for `browser.*`.

## Modules

| Module | Responsibility |
|--------|----------------|
| `discoverCapabilities` / `FabricDiscovery` | Match `need` → candidates + lifecycle state |
| `planComposition` / `CompositionPlanner` | Ordered `steps` + rationale **or** `unmet_need` |
| `evaluateAcquisitionGate` / `AcquisitionGate` | Before REGISTER: `sandbox_depth >= required` **and** `validation_status=passed`; else QUARANTINE |
| `proposalToCapabilityIRWithFabric` | If hint missing: discover → plan → hint or `needs_planner` |
| Lifecycle helpers | Infer/annotate `CapabilityLifecycleRecord` from providers |

## Acquisition gate (stub)

Uses `SandboxDepthRequirement` / `sandboxDepthMeetsRequirement` (FW-H02).

| Condition | Action |
|-----------|--------|
| depth OK + `validation_status=passed` | lifecycle → `VALIDATED` (`action: register`) — **does not** mutate registry |
| otherwise | lifecycle → `QUARANTINED` |

## Agency integration

```ts
proposalToCapabilityIRWithFabric(proposal, "allow", { registry });
// without registry → same as proposalToCapabilityIR
```

## GAP (documented)

`CAPABILITY_PROFILES.research` lists `browser.navigate` / `browser.extract`, but **handlers for browser capabilities are not implemented** in this checkpoint. Fabric may surface them as registry/profile candidates when present in a registry snapshot; it must not invent handlers or mutate provider plugins.

## Non-goals (this checkpoint)

- Capability download / install / build
- OS / container sandbox
- Full composition compiler (data-flow pre/postconditions)
- Browser computer-use providers
- Self-evolution promote of new capabilities

## Code surface

- `orchestrator/src/v3/fabric/`
- `orchestrator/src/v3/adapters/agency-bridge.ts` (optional fabric wire re-export)
- Tests: `orchestrator/tests/unit/v3/fabric.test.ts`
- Docs: this file; `OWNERS.md`
