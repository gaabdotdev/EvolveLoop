# ADR-V4-0012 — Elastic compute (V4.5)

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT (properties); implementation is M13 in Phase 7 |
| Date | 2026-11-15 |
| Meta | M00 (properties); M13 (fabric); M10 (placement policy) |
| Constitution | §4.14, §15.2 Elastic Compute |
| M18 | D11, D18, F02, F05 |
| Contracts | `Execution.lease`, `Artifact.residency`, `Executor.v37_refs` |

## Context

§15.2: how to model costs, trust, data residency, provision and discard of temporary workers?

V3.7 already has placement, leases/fencing, node registry, mTLS. V4 must not invent a second fabric (ADR-V4-0002). Ephemeral workers change the adversary model (ADV2).

## Decision

V4.0–V4.4 **do not ship** elastic provisioners. Contracts reserve the fields M13 will need:

1. **Placement** reuses `V37PlacementPort`. Policy may reject on `residency`, `trust_state`, cost quota.
2. **Trust:** ephemeral workers start `untrusted`/`pending` until enrollment is policy-gated (D18). Plaintext mode cannot be enabled in non-lab profiles.
3. **Credentials** are lease-scoped and revoked on discard (F05, D11). Workspace wipe evidence is an artifact.
4. **Cost** of a node-hour is a `CostRecord` with provenance (never invented). Quotas are Policy conditions.
5. **Discard** of a worker must: revoke lease (new fencing epoch), revoke delegated creds, record wipe evidence, leave Work State on the Control Plane.

CA key custody and enrollment UX are M13+M10. This ADR does not pick AWS vs bare metal.

## Consequences

- M09 may rank candidates; M13/M10 may hard-reject.
- Control Plane host is not an elastic worker (ADR-V4-0016).

## Alternatives rejected

- **Treat cloud VMs as trusted like the operator laptop:** ADV2.
- **Reimplement scheduling besides V3.7 placement:** §6.3.

## Residual uncertainty

Provider list, image attestation, and lab vs prod profile flags: M13 RFC. Decision date: Phase 7 start.
