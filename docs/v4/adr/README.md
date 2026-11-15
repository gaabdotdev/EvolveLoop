# EvolveLoop V4 — ADR register (M00)

| Field | Value |
|-------|-------|
| Owner | M00 |
| Status | PROPOSED until orchestrator marks M00 ACCEPTED |
| Date | 2026-11-15 |
| Baseline | `03937c1` (provisional; V3.7 **BLOCKED** on G17) |

ADRs resolve constitution §15.2 open questions and the six M18 Wave 1 items that must land before contract freeze. A `PROPOSED-DEFAULT` is a justified default that becomes binding after M00 ACCEPTED. A `DEFERRED` decision names the owner, the gate that will close it, and what consumers may assume until then. Silent invention presented as a frozen API is forbidden.

## Index

| ADR | Topic | Status | §15.2 / M18 |
|-----|-------|--------|-------------|
| [0001](ADR-V4-0001-contract-versioning.md) | Contract versioning, stability, RFC | PROPOSED-DEFAULT | evolution |
| [0002](ADR-V4-0002-v37-adapter-boundary.md) | V3.7 reuse via adapters; no reimplementation | PROPOSED-DEFAULT | §6.3 |
| [0003](ADR-V4-0003-event-ledger-semantics.md) | Event Ledger style, identity, order, tamper-evidence, retention | PROPOSED-DEFAULT | §15.2 Event Ledger; **F07** |
| [0004](ADR-V4-0004-persistence-guarantees.md) | Transactional guarantees across state/events/checkpoints/artifacts | PROPOSED-DEFAULT | §15.2 Persistência |
| [0005](ADR-V4-0005-checkpoint-boundaries.md) | Workflow vs workspace vs context | PROPOSED-DEFAULT | §15.2 Checkpoint |
| [0006](ADR-V4-0006-capsule-versioning-signing.md) | Capsule version, signature, **capsule ≠ grant** | PROPOSED-DEFAULT | §15.2 Capsule; **F01** |
| [0007](ADR-V4-0007-fork-replay-semantics.md) | Copy vs reference vs re-execute; effect neutralization | PROPOSED-DEFAULT | §15.2 Fork/replay |
| [0008](ADR-V4-0008-effect-unknown.md) | UNKNOWN, partial, compensation; no exactly-once | PROPOSED-DEFAULT | §15.2 Effect Ledger |
| [0009](ADR-V4-0009-independent-verification.md) | Executor ≠ verifier; honesty rule | PROPOSED-DEFAULT | §15.2 Verificação |
| [0010](ADR-V4-0010-capability-scoring.md) | Scoring methodology placeholders | DEFERRED (contract shape frozen) | §15.2 Capability |
| [0011](ADR-V4-0011-policy-language.md) | Policy language vs decision contract | DEFERRED language; PROPOSED-DEFAULT decision contract | §15.2 Policy |
| [0012](ADR-V4-0012-elastic-compute.md) | Cost, trust, residency, provision/discard | PROPOSED-DEFAULT (V4.5) | §15.2 Elastic Compute |
| [0013](ADR-V4-0013-interoperability-levels.md) | C0–C3 conformance | PROPOSED-DEFAULT | §15.2 Interop |
| [0014](ADR-V4-0014-multi-tenancy.md) | Multi-tenancy **out of scope V4.0–V4.2** | DEFERRED / OOS | §15.2 Multi-tenancy; **M18 §8** |
| [0015](ADR-V4-0015-identifier-grammar.md) | Canonical id grammar at trust boundaries | PROPOSED-DEFAULT | **F08** |
| [0016](ADR-V4-0016-v4-trust-domain.md) | V4 executor trust domain vs ADR-V37-0003 | PROPOSED-DEFAULT | **F02** |
| [0017](ADR-V4-0017-data-vs-control-typing.md) | Data vs control; no payload-asserted trust | PROPOSED-DEFAULT | **F09, F12** |

## How consumers depend

1. Import TypeScript contracts from `orchestrator/src/v4/contracts/index.ts` only.
2. Validate with `assertConforms` / per-kind `validate*`. Treat `PROPOSED` as freeze-candidate, not yet RFC-frozen.
3. Implement ports from `ports.ts`; never import another meta's concrete classes.
4. Reach V3.7 only through `orchestrator/src/v4/adapters/v37/*` (shapes in `adapters-v37.ts`).
5. Frozen (`FROZEN`) field/semantic changes require an RFC + new ADR superseding the relevant entry.

## M18 §9 coverage

See each ADR's "M18" row. Summary in `docs/v4/architecture/M00-DELIVERY.md`.
