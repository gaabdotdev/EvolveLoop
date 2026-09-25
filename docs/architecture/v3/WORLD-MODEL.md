# EvolveLoop V3 — World Model (minimal substrate)

**Status:** checkpoint V3-F3 start — additive intelligence layer  
**Stack (IMMUTABLE):** Intent → Capability → Policy → Runtime → Provider → Evidence  
**Sources:** `EVOLVELOOP_V3.md` Meta 11–12, §182–188

## Purpose

Hold a **hypothesis about relevant reality** as separated channels:

| Channel | Contract | Meaning |
|---------|----------|---------|
| Observation | `Observation` | Raw sensing facts — never inference |
| Belief | `Belief` | Interpretive statements with status + confidence |

Reconciliation diffs observations against beliefs and emits drift for Agency `open_signals`.

## Additive layering

```
KnowledgeBackend (Wiki/Fake)     ← retrieval seam — UNCHANGED
MemoryStore V2                   ← UNCHANGED
        ↑
WorldModelStore (this layer)     ← Observation[] + Belief[] + BeliefRevision
        ↓
WorldSnapshot (AgencyLoop input)
```

**Proibido:** second knowledge store competing with `KnowledgeBackend`.  
**Proibido:** writing Belief/inference into the Observation channel (§184).

## Modules

| Module | Responsibility |
|--------|----------------|
| `WorldModelStore` | put/get Observation & Belief; `reconcile()`; `toSnapshot()` |
| `assertObservationVsBelief` | Reject Belief-shaped payloads on Observation writes |
| `reconcile` | Drift: `missing` \| `contradictory` \| `stale` → `ReconciliationReport` |
| `BeliefRevisionGraph` | Edges `supports` \| `contradicts` \| `invalidates` (§188) |

## Drift semantics (minimal)

| Type | Trigger |
|------|---------|
| `missing` | Supporting observation ref absent; or supported belief with zero refs |
| `contradictory` | Active beliefs linked by `contradicts`; or active belief depends on `invalidates` from an invalidated parent |
| `stale` | Belief older than `staleAfterMs`; or supporting observation newer than `belief.updated_at` |

## Agency integration

```ts
const wm = new WorldModelStore();
// ... putObservation / putBelief ...
const world = wm.toSnapshot({ snapshot_id: "w1" });
agency.step({ portfolio, world, policy });
```

`toSnapshot()` fills optional `observation_ids` / `belief_ids` and maps drifts into `open_signals`. Existing Agency tests that pass a stub `WorldSnapshot` remain valid.

## Non-goals (this checkpoint)

- Full digital twin
- Active perception / Value of Information
- LLM world modeling
- Browser / OS sensors
- MemoryTrust runtime (schema only in first-wave)

## Code surface

- `orchestrator/src/v3/world-model/`
- Tests: `orchestrator/tests/unit/v3/world-model.test.ts`
- Docs: this file; `OWNERS.md`
