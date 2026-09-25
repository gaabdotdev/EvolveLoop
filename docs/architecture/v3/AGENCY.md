# EvolveLoop V3 — Agency Layer (minimal)

**Status:** checkpoint V3-F2 start — additive over V2 substrate  
**Stack (IMMUTABLE):** Intent → Capability → Policy → Runtime → Provider → Evidence

## Purpose

The Agency Layer **proposes** what should happen next. It does **not** execute providers, call `ExecutionEngine.run`, or bypass Policy/Runtime.

```
GoalPortfolio + WorldSnapshot + PolicySnapshot
        ↓
   AgencyLoop (single-step)
        ↓
   AgencyProposal[]
        ↓
   AutonomyGovernor (allow|deny|confirm|degrade)
        ↓
   proposalToCapabilityIR → CapabilityIR skeleton | needs_planner
        ↓
   (downstream, outside Agency) Policy → Runtime → Provider → Evidence
```

## Additive layering

| Layer | Role |
|-------|------|
| V2 ExecutionEngine / Policy / Registry / Evidence | Substrate — unchanged |
| V3 contracts (`src/v3/contracts`) | Schema + validators |
| V3 goals (`src/v3/goals`) | GoalStore lifecycle + SuccessOracle |
| V3 agency (`src/v3/agency`) | Propose + govern + bridge stub |
| V3 world-model (`src/v3/world-model`) | Observation/Belief store → `WorldSnapshot` via `toSnapshot()` |
| V3 adapters (`src/v3/adapters`) | Bridge (non-executing) + `agency-runtime` (wires Engine under Policy) |

Never: discard V2 and rewrite a parallel runtime. Agency core still proposes only; execution is adapter-owned.

## Modules

| Module | Responsibility |
|--------|----------------|
| `GoalStore` | create / accept / transition / supersede; version mutations; **refuse silent delete** |
| `SuccessOracle` | PASS/FAIL/uncertain via stub types: `presence_of_evidence`, `boolean_predicate`, `external_callback_ref` (no LLM) |
| `AgencyLoop` | One step → `AgencyProposal[]` (accepts stub or `WorldModelStore.toSnapshot()`) |
| `AutonomyGovernor` | Deterministic action from `proposal.risk` + `safety_state`; emits `AutonomyGovernorDecision` |
| `proposalToCapabilityIR` | Map one allowed/degraded proposal to minimal `CapabilityIR` or `needs_planner` |

## Governor mapping

| Action | Contract level |
|--------|----------------|
| `allow` | `AUTONOMOUS` |
| `confirm` | `HUMAN_GATE` |
| `degrade` | `AUTONOMOUS_WITH_REVIEW` |
| `deny` | `BLOCK` |

Governor does not replace Policy Engine.

## Non-goals (this checkpoint)

- Persistent heartbeat daemon
- Long-horizon 10k loops
- Sandbox OS / multi-agent / self-evolution
- Browser or computer use
- Forking the Capability Registry

## Code surface

- `orchestrator/src/v3/agency/`
- `orchestrator/src/v3/goals/`
- `orchestrator/src/v3/adapters/agency-bridge.ts` (IR skeleton only)
- `orchestrator/src/v3/adapters/agency-runtime.ts` (Governor → Engine → Oracle)
- Tests: `orchestrator/tests/unit/v3/agency.test.ts`, `goals.test.ts`, `agency-runtime.test.ts`
- Docs: `AGENCY-RUNTIME.md`
