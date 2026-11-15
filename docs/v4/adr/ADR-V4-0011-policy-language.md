# ADR-V4-0011 — Policy language and decision contract

| Field | Value |
|-------|-------|
| Status | DEFERRED (language); PROPOSED-DEFAULT (decision contract + deny-by-default) |
| Date | 2026-11-15 |
| Decision gate | M10 before V4.3 Phase 5 (adversarial policy suites) |
| Meta | M00 (decision contract); M10 (language + engine) |
| Constitution | §4.10, §9, §15.2 Policy Engine |
| M18 | F02, F03, F04, F14, D01, D06, D14, D20 |
| Contracts | `policy.ts`, `PolicyDecisionPort` |

## Context

§15.2: which policy language, decision model, cache, and change/revocation semantics?

Choosing Cedar vs OPA/Rego vs a bespoke DSL now would couple every meta to an unproven engine. The constitution already fixes deny-by-default, L0–L3 vocabulary, least privilege, and revocation.

## Decision

1. **Language is deferred.** M10 may adopt Cedar, Rego, or a constrained in-house DSL after a written comparison (expressiveness, auditability, embeddability, existing V3 `CapabilityAction` mapping). Until then, `Policy.rules` is the **interchange** shape (subjects, actions, resources, conditions, obligations) — not a claim that this JSON is the runtime language.
2. **Decision contract is frozen now:** `PolicyDecision` with `policy_ref {id, version, epoch}`, TTL cap `MAX_DECISION_TTL_MS = 5 minutes` (INV-POL-02), `combineRuleEffects`: DENY > REQUIRE_APPROVAL > ALLOW, no match ⇒ DENY (INV-POL-01/03).
3. **Deny-by-default** is structural (`default_effect` must be DENY).
4. **L3 ALLOW rules** require explicit cost and time limits (INV-POL-05). L0 forbids writes (`autonomyPermitsWrite`).
5. **Cache key** includes policy epoch. Revocation/change bumps epoch; cached ALLOW older than TTL or with stale epoch is invalid (D14). Change semantics field: `APPLY_TO_NEW_ACTIONS | REEVALUATE_IN_FLIGHT | INTERRUPT_IN_FLIGHT` — M10 picks per policy.
6. **V3.5 CapabilityAction** names are valid V4 actions (ADR-V4-0002). M10 may extend.
7. Path matching (F14) and grant expiry/revocation/atomic consume (F03/F04) are M10 implementation requirements, not language choice.

## Consequences

- Every enforcement point calls `PolicyDecisionPort.decide` and re-checks before external dispatch.
- Capsule accept (ADR-V4-0006) uses this port; it does not parse capsule text as policy (ADR-V4-0017).

## Alternatives rejected

- **Freeze Cedar (or Rego) in M00 without a prototype:** premature; M10 owns the engine.
- **Let each meta embed ad-hoc allowlists:** un-auditable; breaks §9.4 versioning.

## Residual uncertainty

Language choice + path canonicalization library. Decision date: Phase 5 start (V4.3).
