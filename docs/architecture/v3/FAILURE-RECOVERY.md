# EvolveLoop V3 — Failure Containment & Recovery (V3-F5 start)

**Status:** checkpoint V3-F5 start — helpers only  
**Fontes:** EVOLVELOOP_V3 Meta 36, 61–64, §243–245, §253–256  
**Stack (IMMUTABLE):** Intent → Capability → Policy → Runtime → Provider → Evidence

## Purpose

Explicit outcome classification, narrowest-safe-boundary containment, progressive recovery hierarchy, anti-stagnation detection, and SafetyState transition rules.

**Inegociável (Zero Silent Failure):** `UNKNOWN` / `null` / missing evidence **must not** map to `PASS`.

## Flow

```text
raw outcome
    ↓
classifyOutcome (fail-closed)
    ↓
OutcomeStatus ∈ {PASS, FAIL, BLOCKED, UNCERTAIN, PARTIAL, DEGRADED, NOT_MEASURED}
    ↓
selectContainment(domain, status)  →  ContainmentAction + safety_hint
    ↓
RecoveryHierarchy (retry → replan → rollback_checkpoint → quarantine → human_gate)
    ↓
StagnationDetector (repeated action/hypothesis/failure / no state progress)
    ↓
transitionSafetyState (§254 / §256 progressive restore)
```

## Modules

| Module | Responsibility |
|--------|----------------|
| `classifyOutcome` | Meta 36 fail-closed classification; aliases SUCCESS→PASS, FAILURE→FAIL |
| `selectContainment` / `escalateContainment` | Meta 61 / §243 narrowest boundary |
| `RecoveryHierarchy` | Meta 62 ordered recovery steps (strategy only) |
| `StagnationDetector` | Meta 64 / §245 anti-loop signals |
| `transitionSafetyState` | §254 machine + §256 no QUARANTINED→NORMAL jump |

## ContainmentAction

`quarantine_goal` · `quarantine_capability` · `pause_agency` · `escalate_human` · `degrade_autonomy`

## SafetyState transitions

Uses existing `SAFETY_STATES`: NORMAL · SUSPECT · RESTRICTED · QUARANTINED · RECOVERING · RESTORED.

- Degradation may escalate quickly (e.g. NORMAL → QUARANTINED).
- Recovery is progressive: **QUARANTINED → RECOVERING → RESTORED → NORMAL**.
- **Proibido:** QUARANTINED → NORMAL / RESTORED without RECOVERING.

## Non-goals (this checkpoint)

- Real OS kill recovery
- Disaster DR / cloud failover
- Chaos runners
- Automatic Agency pause wiring (helpers emit decisions only)

## Code surface

- `orchestrator/src/v3/failure/`
- Tests: `orchestrator/tests/unit/v3/failure.test.ts`
- Barrel: exported from `orchestrator/src/v3/index.ts`
