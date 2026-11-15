# EvolveLoop V4 — Contract catalog (M00)

| Field | Value |
|-------|-------|
| Catalog version | `1.0.0` (`CONTRACT_CATALOG_VERSION`) |
| Canonical source | `orchestrator/src/v4/contracts/` (TypeScript) |
| Stability | **FROZEN** at tip `e4fb8ad` / CONTRACT-FREEZE.md (ADR-V4-0001) |
| Consumer import | `import { assertConforms, type Work } from "<repo>/orchestrator/src/v4/contracts/index.js"` |

This document is a **catalog**, not a second schema. If it disagrees with TypeScript, TypeScript wins and this file is a GAP.

## How to consume

1. Depend on `orchestrator/src/v4/contracts/index.ts` only (types + validators + normative functions).
2. Validate every object crossing a trust boundary with `assertConforms` or the per-kind `validate*`.
3. Implement ports from `ports.ts`. Do not import another meta's concrete classes.
4. Reach V3.7 only through adapters whose shapes are in `adapters-v37.ts` (ADR-V4-0002).
5. Same major is readable; ignore unknown optional fields for readability (ADR-V4-0001). Capsules are the exception at the *forwarding* boundary: `allowlistParseExecutionCapsule` drops unknown keys (INV-CAP-07).

Conformance tests (skeletons, runnable): `orchestrator/tests/v4/contracts/` and `orchestrator/tests/v4/conformance/`.

```bash
cd orchestrator && npx vitest run tests/v4
```

No `npm install` in V4 worktrees (`node_modules` is a symlink).

## Kinds

| Kind | Schema | Producer | Validator | ADR |
|------|--------|----------|-----------|-----|
| GoalContract | 1.0.0 | M01 | `validateGoalContract` | 0009 (methods) |
| Work | 1.0.0 | M01 | `validateWork` | 0007 (fork) |
| Task | 1.0.0 | M01 / M07 | `validateTask`, `validateTaskGraph` | — |
| Execution | 1.0.0 | M13 | `validateExecution` | 0002 (lease) |
| Executor | 1.0.0 | M14 / M13 | `validateExecutor` | 0013 |
| ExecutionCapsule | 1.0.0 | M04 | `validateExecutionCapsule` | 0006, 0017 |
| Checkpoint | 1.0.0 | M02 | `validateCheckpoint` | 0005 |
| EffectRecord | 1.0.0 | M03 | `validateEffectRecord`, `decideRetry` | 0008 |
| Artifact | 1.0.0 | M02 | `validateArtifact` | 0002, 0004 |
| Evidence | 1.0.0 | M06 | `validateEvidence`, `isIndependent` | 0009, 0017 |
| WorkProof | 1.0.0 | M06 | `validateWorkProof`, `deriveFinalStatus` | 0009 |
| Policy | 1.0.0 | M10 | `validatePolicy` | 0011 |
| PolicyDecision | 1.0.0 | M10 | `validatePolicyDecision` | 0011 |
| CapabilityProfile | 1.0.0 | M08 | `validateCapabilityProfile` | 0010 |
| WorkEvent | 1.0.0 | M02 (log) | `validateWorkEvent`, `checkEventStream` | 0003, 0015 |

Header on every object: `{ kind, schema_version, tenant_id }` with `tenant_id = "local"` (ADR-V4-0014).

## Identifier grammar (ADR-V4-0015)

`ID_PREFIX[kind] + [A-Za-z0-9][A-Za-z0-9_-]{5,127}`. Path separators and `..` are unrepresentable. Call `isValidId` at every trust boundary before using an id as a path.

## Event types (`EVENT_TYPE_CATALOG`)

Each type has exactly one producing meta. Experimental: `x.mNN.name` (non-authoritative).

`work.*` M01; `work.forked` M05; `goal_contract.*` M01; `task.*` M01; `plan.revised` M07; `execution.scheduled/state_changed` M13; `execution.failure_classified` M04; `checkpoint.created` / `artifact.registered` M02; `capsule.*` / `handoff.*` / `recovery.*` M04; `effect.*` M03; `evidence.recorded` / `proof.issued` M06; `policy.*` / `approval.*` / `grant.revoked` M10; `replay.started` M05; `operator.command` M15.

## Normative functions (not optional helpers)

| Function | Invariant |
|----------|-----------|
| `decideRetry` | UNKNOWN/DISPATCHED retry policy; no exactly-once |
| `deriveFinalStatus` / `deriveRequirementStatus` | honesty rule |
| `isIndependent` | executor ≠ verifier; missing subject fails closed |
| `allowlistParseExecutionCapsule` | unknown keys never forwarded (F01) |
| `computeCapsuleDigest` / `computeEventDigest` | integrity |
| `checkEventStream` | seq + uniqueness + hash chain |
| `validateTaskGraph` | acyclic, same work |
| `combineRuleEffects` | DENY > REQUIRE_APPROVAL > ALLOW |
| `assertConforms` | catalog entrypoint |

## Integration ports

See `ports.ts` and `docs/v4/architecture/INTEGRATION-CONTRACTS.md`. `CapsuleServicePort.accept` is mandatory for F01.

## V3.7 mapping

See ADR-V4-0002. `TRUE_PASS` ≠ `VERIFIED`.
