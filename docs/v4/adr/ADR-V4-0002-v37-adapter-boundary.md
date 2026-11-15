# ADR-V4-0002 — V3.7 adapter boundary

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (shapes); implementations owned per OWNERSHIP-MAP |
| Constitution | §6.3 |
| Contracts | `adapters-v37.ts` |

## Context

Constitution §6.3: V4 reuses V3.7 registry/trust, protocol, workers, placement, leases/fencing and artifacts. Reimplementation without ADR + migration plan is forbidden. Real V3.7 status is **BLOCKED** (G17). Baseline `03937c1` is provisional.

V3.7 ADR-V37-0003 defines a single-user trusted-host IPC boundary. That assumption is **not** the V4 executor trust domain (see ADR-V4-0016).

## Decision

1. V4 reaches V3.7 **only** through `orchestrator/src/v4/adapters/v37/*`. Port *shapes* live in `contracts/adapters-v37.ts` as type-only picks from V3.7 classes so signature drift fails the compiler.
2. Adapters **delegate**; they do not reimplement lease fencing, ArtifactFabric, placement, node registry, or the fabric protocol.
3. V4 modules other than adapters **must not** import `orchestrator/src/v3/**` runtime modules.
4. Vocabulary mapping is explicit and **lossy on purpose**:
   - V3 `TRUE_PASS` / `TRUE_FULL_PASS` → V4 `SUCCEEDED_UNVERIFIED` / `VERIFYING`. They are **not** `VERIFIED` / `PROVEN` (no independence or staleness checks).
   - V3 `TrustState` = V4 `ExecutorTrustState` (compile-time `Equal<>` guard).
   - V3.5 `CapabilityAction` names are the initial V4 policy action vocabulary (M10 may extend, not rename).
5. Measurement Plane envelope (`telemetry/measurement-plane`) is reused unchanged; V4 adds `SELF_REPORTED` only on V4 evidence, not by mutating the MP type.
6. Adapter contract tests must be re-run on the **certified** V3.7 hash once published. Until then, this ADR is provisional with the baseline.

## Migration plan (when V3.7 certifies)

1. Pin certified hash in this ADR (superseding `03937c1`).
2. Re-run adapter type-check + any M02/M13 adapter tests.
3. If signatures drifted, fix adapters — not V3.7 cert surfaces (forbidden).
4. Do not import V3 continuity `HandoffPackage` as a V4 capsule (see ADR-V4-0006); write a one-way importer into `SUCCEEDED_UNVERIFIED` if a live V3 work must continue.

## Alternatives rejected

- **Reimplement fabric in V4:** duplicates fencing/mTLS/artifacts; constitution forbids it.
- **Direct V3 imports from every meta:** couples V4 domain to V3 modules and makes a certified-hash swap a cross-repo rewrite.

## Residual uncertainty

G17 may change line-level V3 APIs. Adapter ports are picks of methods we actually need (`get/issue/renew/revoke/release`, `putLocalFile/get/verify/authorizeRead`, `place`). Additional methods are added by RFC, not by silent widening.
