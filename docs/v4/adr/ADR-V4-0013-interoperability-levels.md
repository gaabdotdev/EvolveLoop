# ADR-V4-0013 — Interoperability conformance levels

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (levels); M14 (suite) |
| Constitution | §3 interoperability without blind coupling, §4.15, §14 no premature marketplace, §15.2 Interop |
| M18 | D12, D17 |
| Contracts | `executor.ts` `ConformanceLevel` |

## Context

§15.2: which protocols/frameworks, at which conformance levels?

Marketplace is a non-goal. V3 loads any `provider.yaml` without pinning (D17). Manifests must not grant capabilities (D12).

## Decision

Four levels. An executor's `conformance_level` is **awarded by the suite**, never self-asserted in a way that Policy trusts.

| Level | Meaning | May |
|-------|---------|-----|
| **C0_OBSERVED** | External process observed by the platform (logs/artifacts harvested). | Contribute UNTRUSTED_DATA. Cannot append events, cannot receive capsules. |
| **C1_TASK** | Receives a task + inputs, returns artifacts + `result_claim`. | Run under Execution Gateway + Policy. Result is SUCCEEDED_UNVERIFIED until M06. |
| **C2_CONTINUITY** | Accepts `ExecutionCapsule`, produces a new capsule/checkpoint-compatible outputs. | Handoff (V4.1). Still cannot self-verify. |
| **C3_EFFECT_AWARE** | Declares integration capabilities; cooperates with Effect Ledger (idempotency keys, status query). | External effects under M03. Manifest still does not grant capabilities — Policy does. |

Official protocols in V4.0–V4.5:

- **In:** V3.7 fabric protocol (mTLS + session) for workers; Goal/Work contracts over CLI/API (M15).
- **Not in V4.0:** MCP-as-control-plane, A2A as authority, proprietary second protocol. MCP tools are untrusted content sources (TB4) until M14 pins them.

Negative suite (D12) is mandatory for C1+: capability over-declare, effect under-declare, unsigned/shadowing manifest (D17).

## Consequences

- Handoff requires C2. External git/deploy requires C3 plus Policy ALLOW.
- `declared_capabilities` are claims; `CapabilityProfile` is observed; Policy is authority.

## Alternatives rejected

- **Single "compatible" boolean:** hides whether handoff/effects work.
- **Marketplace + unsigned skills:** constitution §14, D17.
