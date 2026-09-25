# EvolveLoop V3 — Agency Runtime Adapter

**Status:** V3 integration path (Agency → ExecutionEngine) — thin tick runner  
**Stack (IMMUTABLE):** Intent → Capability → Policy → Runtime → Provider → Evidence  
**Autonomy proven:** **NO** — see Remaining limits

## Purpose

Wire one Agency tick through Governor into the existing V2 `ExecutionEngine` **without** rewriting the engine, forking Policy, or inventing IR when the planner is unavailable.

```text
GoalPortfolio + WorldSnapshot/WorldModelStore + PolicySnapshot
        ↓
   AgencyLoop.step → AgencyProposal[]  (open_signals / belief_ids → rationale + risk bump)
        ↓
   AutonomyGovernor.decide (each)
        ↓
   deny → BLOCKED
   confirm∅approval → UNCERTAIN + human_gates
   degrade → DEGRADED (skip ExecutionEngine — no full allow path)
   allow | confirm✓approval
        ↓
   proposalToCapabilityIR[WithFabric]
        ↓
   multi-step fabric → PARTIAL + composition_pending (needs_planner)
   ir → ExecutionEngine.run (Policy owns execution)
   needs_planner → NOT_MEASURED  OR  explicit ir_fixture
        ↓
   eligible evidence refs only (no synthetic run:*) → SuccessOracle
        ↓
   classifyOutcome + StagnationDetector + selectContainment
   quarantine hint → SafetyState transition when allowed
        ↓
   AgencyRunReport { proposals, decisions, runs, oracle, human_gates,
                     containment, stagnation, safety_state_after }
```

## Non-negotiables

| Rule | Enforcement |
|------|-------------|
| Policy still owns execution | Only `ExecutionEngine.run` invokes providers; adapter never calls providers directly |
| No invented IR | `needs_planner` without `ir_fixtures` → `NOT_MEASURED`; fixture is caller-supplied |
| No PASS without verifiable oracle | Engine `success` alone → provisional `PARTIAL`; `PASS` only after SuccessOracle on **eligible** evidence (rejects synthetic `run:*`) |
| Degrade constrains execution | `degrade` **skips** `ExecutionEngine.run` → `DEGRADED` (OS sandbox still absent — cannot lower sandbox_depth) |
| Sandbox attestation (SEC-001 partial) | Before `engine.run`, high/critical risk OR LOCAL_WRITE/DESTRUCTIVE/NETWORK hints require `sandbox_attestation=true` (or env `EVOLVELOOP_SANDBOX_ATTESTATION`) **or** `SafetySandboxContext` depth ≥ `DEFAULT_SANDBOX_DEPTH_REQUIREMENTS`. Missing → `BLOCKED` / `sandbox_attestation_required`. **Host-declared only — NOT OS isolation** |
| Agency layer remains propose-only | Execution lives in `adapters/agency-runtime.ts`, not `agency/*` |
| Failure module on path | `classifyOutcome` / `StagnationDetector` / `selectContainment` / safety transition recorded on report |

## OutcomeStatus

Uses canonical `OutcomeStatus` from `src/v3/failure/types.ts` (Meta 36):

`PASS | FAIL | BLOCKED | UNCERTAIN | PARTIAL | DEGRADED | NOT_MEASURED`

| Situation | Status |
|-----------|--------|
| Governor `deny` | `BLOCKED` |
| Governor `confirm` without approval | `UNCERTAIN` + `human_gates` |
| Governor `degrade` | `DEGRADED` (not executed) |
| `needs_planner`, no fixture | `NOT_MEASURED` |
| Fabric multi-step (`steps.length > 1`) | `PARTIAL` + `composition_pending` |
| Engine ran; no eligible evidence | `PARTIAL` (never oracle PASS) |
| Engine ran; oracle `success` on eligible refs | `PASS` |
| Engine ran; oracle `failure` | `FAIL` |

## Remaining limits (honesty)

| Gap | Status |
|-----|--------|
| OS / process sandbox | **Absent / NOT_IMPLEMENTED** — SEC-001 uses host-declared `sandbox_attestation` flag/env or `SafetySandboxContext` depth schema only; does **not** claim OS isolation |
| Planner LLM | **Absent** — multi-step fabric → `needs_planner` / `composition_pending`; fixtures are harness-only |
| World-aware agency | **Partial** — open_signals / belief_ids feed rationale + contradiction risk bump; no planner grounded in World Model |
| Closed recovery loop | **Partial** — containment + stagnation land on the report; no automatic RecoveryHierarchy replan tick |
| AcquisitionGate | **Not invoked** by agency-runtime (fabric enrichment only) |
| Dual adapter surface | `agency-bridge` (propose-only) vs `agency-runtime` (executes) — callers must not confuse them |
| Autonomy / V3 complete | **Not claimed** — unit PASS ≠ autonomy proven |

## Code surface

| Path | Role |
|------|------|
| `orchestrator/src/v3/adapters/agency-runtime.ts` | `runAgencyRuntime` / `AgencyRuntime` |
| `orchestrator/src/v3/adapters/index.ts` | Barrel (runtime + bridge re-exports) |
| `orchestrator/src/v3/agency/agency-loop.ts` | World-grounded proposals (rationale / risk bump) |
| `orchestrator/src/v3/goals/success-oracle.ts` | Eligible-evidence filter (`run:*` rejected) |
| `orchestrator/src/v3/fabric/bridge.ts` | Multi-step → `needs_planner` (`composition_pending`) |
| `orchestrator/tests/unit/v3/agency-runtime.test.ts` | Unit coverage incl. AR-C01/C02/H01–H03 |

## Inputs (`AgencyRuntimeOptions`)

- `portfolio`, `world` (`WorldSnapshot` \| `WorldModelStore`), `policy`
- `safety_state`, `engine`, optional `registry` (fabric)
- `criteriaById` for oracle
- `approvals` for confirm gates
- `ir_fixtures` keyed by `proposal_id` or `goal_id` (explicit only)
- optional shared `stagnation` detector across ticks
- `sandbox_attestation` / `safety_sandbox` (SEC-001 host-declared; not OS sandbox)

## Related

- `AGENCY.md` — propose-only Agency Layer
- `CAPABILITY-FABRIC.md` — optional hint enrichment (multi-step refused at bridge)
- `FAILURE-RECOVERY.md` — helpers now wired into AgencyRunReport (still no OS kill / DR)
- `agency-bridge.ts` — non-executing bridge surface (still valid for propose-only callers)
