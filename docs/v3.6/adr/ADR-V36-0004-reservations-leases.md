# ADR-V36-0004 — Reservations and hierarchical budgets

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

Reservations are leases with owner, scope, quantity, expiry, provenance. Host rollup counts top-level held reservations (no parent_reservation_id) to avoid double counting. Tokens/cost require measured provenance; `UNAVAILABLE` cannot reserve as real usage. Release blocked if active process without force/reconcile.

## Consequences

Fail-closed under saturation → WAITING_RESOURCE.
