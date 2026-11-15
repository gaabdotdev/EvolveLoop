# EvolveLoop V4 — Integration contracts between metas (M00)

Consumers depend on **ports + catalog**, never on another meta's classes. Composition (wiring) is M19.

Skeletons: TypeScript interfaces in `orchestrator/src/v4/contracts/ports.ts`. Runnable hooks: `orchestrator/tests/v4/conformance/conformance.test.ts` (catalog, versions, port names). Owner metas add behavioural tests in `orchestrator/tests/v4/<module>/` that import the same ports.

## Port → implementer → callers

| Port | Implementer | Callers | Notes |
|------|-------------|---------|-------|
| `EventLedgerPort` | M02 | all writers | atomic batch, fencing, hash chain |
| `WorkRepositoryPort` | M01 | M07, M15, M04, M06 | projection; mutated only by projecting events |
| `CheckpointStorePort` | M02 | M04, M05, M15 | `latestConsistent` = VERIFIED only |
| `ArtifactStorePort` | M02 over V37 ArtifactFabric | M04, M06, M13 | write-then-reference |
| `EffectLedgerPort` | M03 | M04, M05, M06, M13 | `retryDecision` ≡ `decideRetry` |
| `CapsuleServicePort` | M04 | M13, M05 | `accept` re-derives grants (F01) |
| `PolicyDecisionPort` | M10 | M13, M03, M04 accept, M15 | deny-by-default; TTL |
| `VerifierPort` / `WorkProofPort` | M06 | M01 completion path, M16 | independent |
| `CapabilityProfilePort` | M08 | M07, M09, M15 | PROVISIONAL until methodology ACCEPTED |
| `ProvenanceQueryPort` | M11 | M15, M20 | four §4.12 questions |
| `ExecutionGatewayPort` | M13 | M09, M04, M15 | never bypasses Policy |
| `MeasurementSinkPort` | M12 | all (observe) | fire-and-forget; no invented facts |

## Sequence constraints (must not invert)

1. Artifact bytes durable → then `artifact.registered`.
2. Policy ALLOW/REQUIRE_APPROVAL (and human decision if required) → then effect AUTHORIZED → then DISPATCHED durable → then external call.
3. Capsule `verify` pass on the *raw* object (recursive INV-CAP-07) → `allowlistParseExecutionCapsule` → `accept` (re-derive + ledger state) → then dispatch. Unknown keys are never forwarded.
4. Independent evidence → then task VERIFIED → then `proof.issued`. `deriveFinalStatus` is the oracle.
5. Fork: new work id → inherited effects `fork_inherited` → no grant copy.

## Conformance hooks for later metas

Owner metas SHOULD (V4.0 MUST for M01–M03, M06, M10, M12):

- Reject objects that fail `assertConforms`.
- Use `isValidId` at their external boundary.
- Use `decideRetry` / `deriveFinalStatus` / `isIndependent` rather than reimplementing.
- Golden fixtures may be added under `orchestrator/tests/v4/contracts/fixtures.ts`.

Negative cases required by M18 §10 (★) are owned by the implementing meta, reviewed by M18 — M00 only provides the predicates.

## V3.7 adapter ports

`V37LeaseFencingPort`, `V37ArtifactPort`, `V37PlacementPort`, `V37NodeRegistryPort`, `V37SignaturePort` — type-only picks. Implementations delegate. See ADR-V4-0002 and OWNERSHIP-MAP adapter files.
