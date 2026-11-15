# EvolveLoop V4 — Acceptance criteria per meta (M00 refinement)

Mission one-liners, refined against this repo's contracts, V3.7 adapter boundary, and M18 Wave 1. These are **exit criteria for the owner meta**, not a claim that the meta is done.

| Meta | Refined acceptance (this repo) | Contract/ADR hooks | M18 must-not-regress |
|------|-------------------------------|--------------------|----------------------|
| **M00** | Domain model, versioned contracts, ADR register for §15.2 + six M18 items, ownership map covering matrix, consumer conformance tests green, independent review attached, no V3.7 cert edits, no merge to integration | this package | F01, F02, F07, F08, F09, F12, tenancy |
| **M01** | Intent → versioned Goal Contract; Work queryable via `WorkRepositoryPort` without chat memory; ambiguities/assumptions visible; executors cannot version the contract | GoalContract, Work, Task, INV-GC-*, D15 | D01 intake marking, D15 |
| **M02** | Recovered projection = log; crash preserves CONFIRMED progress within ADR-V4-0004; `checkEventStream` clean; ids enforced; epoch watermark durable; restore does not resurrect grants/effects | WorkEvent, Checkpoint, Artifact, EventLedgerPort | F07, F08, F11, F13, D09, D16, D19 |
| **M03** | Kill between dispatch and confirm ⇒ UNKNOWN not blind retry; one in-flight per key; executor lie ≤ UNKNOWN; `retryDecision` ≡ `decideRetry` | EffectRecord, EffectLedgerPort | F04, F05, F06, D05, D07, D08, D19 |
| **M04** | Compatible C2 executor assumes work from a verified capsule; accept re-derives grants; state from ledger; no improper effect dup; secrets excluded | ExecutionCapsule, CapsuleServicePort | F01, F11, F12, F15, D02, D03, D09 |
| **M05** | Inspect + fork without mutating original; inherited EXTERNAL effects FORBIDDEN to re-dispatch | Work.forked_from, fork_inherited | D08 |
| **M06** | Third party evaluates WorkProof; SELF_REPORTED/stale/wrong version ≠ PROVEN; no payload trust; no confidence constants; no secrets in proof | Evidence, WorkProof, isIndependent, deriveFinalStatus | F09, F11, F16, D05, D13, D15, D16 |
| **M07** | Plan adapts with `plan.revised` justification; cannot request autonomy levels | Task, plan.revised | D06, D15 |
| **M08** | Profiles from observed contextual data + uncertainty; no global rank; ACTIVE only with ACCEPTED methodology | CapabilityProfile | F10, D04 |
| **M09** | Measurable improvement vs M17 baseline; sensitive routing constrained by Policy not score | CapabilityProfilePort, PolicyDecisionPort | D04 |
| **M10** | Deny-by-default; authenticated approvers ≠ executors; grants expire/revoke; atomic consume; no content-as-authority; no F02 store fallback | Policy, PolicyDecisionPort | F02–F05, F11, F12, F14, D01, D06, D14, D18, D20 |
| **M11** | Four §4.12 queries return verifiable refs anchored to the hash-chained log | ProvenanceQueryPort | F02, F07, F14, D13, D16, D17 |
| **M12** | Metrics do not invent facts; missing provenance ≠ OBSERVED; redaction includes arrays | MeasurementSinkPort | F10, F11, D07, D20 |
| **M13** | Ephemeral compute without breaking Work State; executors cannot reach CP data-dir; lease-scoped creds; residency | ExecutionGatewayPort, ADR-V4-0012/0016 | F02, F05, D09, D11, D18 |
| **M14** | Third-party C1–C3 without breaking guarantees; capabilities from Policy not manifest; no silent name shadowing | Executor, ADR-V4-0013 | D12, D17 |
| **M15** | Operate by goals/results; untrusted text rendered as data; authenticated remote approval | ports only; no invented backend fields | F02, F12, D10 |
| **M16** | Impossible Handoff PASS on a real workload (six failure cases); mocks not E2E proof | uses all continuity/effect/proof contracts | suite S1, S3, S4, S10 |
| **M17** | Fair comparable baselines; no cherry-picks; cost per verified result | CostRecord provenance | — |
| **M18** | Independent rejection authority; Wave 1 threat model ACCEPTED; later waves vs frozen contracts | docs/v4/security | all |
| **M19** | Integrated candidate + regressions; only merger to `feature/v4-integration` | composition | — |
| **M20** | Independent audit tries to invalidate APPROVED | contracts + ADRs + evidence | — |

Orchestrator mission one-liners remain the official short form; this table is the repo-specific refinement M00 owes.
