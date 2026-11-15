# ADR-V4-0014 — Multi-tenancy scope

| Field | Value |
|-------|-------|
| Status | DEFERRED — **out of scope for V4.0–V4.2**; revisit V4.3+ |
| Date | 2026-11-15 |
| Decision gate | Explicit M00 superseding ADR + M18 review covering ADV6, before any multi-tenant claim |
| Meta | M00 |
| Constitution | §15.2 Multi-tenancy |
| M18 | Threat model §8; ADV6 |
| Contracts | `ContractHeader.tenant_id`, `INV-TENANT-01` |

## Context

M18 proposes multi-tenancy out of scope for V4.0–V4.2: V3.7 is a single-user trusted host (ADR-V37-0003); stores have no tenant concept; constitution lists this as open.

Cross-**project** artifact isolation already exists in V3.7 and must be preserved. Project ≠ tenant.

## Decision

1. V4.0–V4.2 is **single-operator / single-tenant**. `tenant_id` is required on every contract object and **must be** `"local"` (`INV-TENANT-01`, `DEFAULT_TENANT_ID`).
2. The field is reserved so a future multi-tenant version can distinguish records without a rewrite. Using other values in V4.0–V4.2 is a validation error, not a feature.
3. **Still in scope without tenancy:** Control Plane vs executors (ADR-V4-0016 / F02); works vs works (ids, artifact ACLs, F08); executors in a handoff (F01/F12).
4. Any later multi-tenant claim requires: this ADR superseded; isolation of state, artifacts, telemetry, quotas, capability scores, approval queues (ADV6); M18 review.

## Consequences

- No tenant quota API, no tenant-scoped ledgers, no ADV6 tests in Phase 2/3.
- `Artifact.access.project_ids` remains the cross-project deny-by-default surface (M02).

## Alternatives rejected

- **Invent tenancy in V4.0 contracts as if it were real:** would claim isolation we cannot test (M18).
- **Omit `tenant_id`:** later multi-tenant migration would rewrite every row.

## Residual uncertainty

Team-vs-user vs org tenancy model: not decided. Decision date: not before V4.3 planning.
