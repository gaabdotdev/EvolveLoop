# ADR-V4-0009 — Independent verification

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (rules); M06 (verifiers, WorkProof) |
| Constitution | §8, §15.2 Verificação independente |
| M18 | F09, F16, D13, D15 |
| Contracts | `evidence.ts`, `work-proof.ts`, `isIndependent`, `deriveFinalStatus` |

## Context

§15.2: how to separate executor and verifier? When to use deterministic rules, tests, another model, or a human?

Honesty rule (§8.3): nothing may promote PARTIAL/UNVERIFIED to PROVEN from opinion, absence of errors, or self-declaration. V3 evidence builders attach confidence constants (F16) and gate files self-label trust (F09).

## Decision

1. **Independence (INV-EVD-01):** evidence is independent iff `method.kind ≠ SELF_REPORTED` **and** `produced_by.executor_id ≠ subject_executor_ref.executor_id`. Version changes do not create independence. `SELF_REPORTED` exists so self-assessment is recorded and **never qualifies**.
2. **Trust is not a payload field** (ADR-V4-0017). No `trust` / `gate_source_kind` on Evidence.
3. **No confidence constants or thresholds as proof** (F16). Status ∈ {PASS, FAIL, INCONCLUSIVE, ERROR} plus WorkProof `{PROVEN, PARTIAL, FAILED, UNVERIFIED}` derived by `deriveRequirementStatus` / `deriveFinalStatus`. Implementations may only be *more conservative*.
4. **Method selection** is per `AcceptanceCriterion.verification_methods` (Goal Contract). Allowed kinds: DETERMINISTIC_RULE, AUTOMATED_TEST, STATIC_ANALYSIS, INDEPENDENT_MODEL_REVIEW, HUMAN_REVIEW, OBSERVATION. SELF_REPORTED is not acceptable on the Goal Contract.
5. **When to use which** (default policy, M10 may tighten):
   | Risk / criterion | Default method |
   |------------------|----------------|
   | Deterministic invariant, lint, typecheck | DETERMINISTIC_RULE / STATIC_ANALYSIS |
   | Behaviour of code | AUTOMATED_TEST |
   | Subjective quality, design | INDEPENDENT_MODEL_REVIEW and/or HUMAN_REVIEW |
   | External effect confirmation | OBSERVATION (CP-side, D05) |
   | L2/L3 sensitive | HUMAN_REVIEW required in addition |
6. **Staleness:** evidence cites `tested_artifacts[]` by hash; different current hashes → stale (D13). Goal Contract version must match (D15).
7. **Verifier identity ≠ executor identity**, authenticated (M10/M13). `VerifierPort.verifier_id` is checked by M06 against the subject.
8. WorkProof is immutable (`INV-PROOF-05`); a new proof `supersedes_proof_id`.

## Consequences

- V3 `TRUE_PASS` imports as unverified (ADR-V4-0002).
- M08/M09 must not treat SELF_REPORTED or unauthenticated OBSERVED as capability input (F10/D04 — M12 defaults).

## Alternatives rejected

- **Numeric confidence ≥ 0.9 ⇒ PROVEN:** F16.
- **Same agent, new prompt, counts as independent:** identity is `executor_id`.
- **Quorum of models as a substitute for tests:** allowed as INDEPENDENT_MODEL_REVIEW only when the criterion lists it; never silently.
