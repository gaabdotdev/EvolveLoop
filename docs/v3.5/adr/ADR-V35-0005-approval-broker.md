# ADR-V35-0005 — Approval Broker

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

- Persistent `ApprovalRequest` records with states PENDING|APPROVED|REJECTED|EXPIRED|CANCELLED.
- Approval authorizes exact operation + resource (+ optional path_prefix) for `max_uses` and TTL.
- `consume()` is mandatory before sensitive side effects; replay after uses exhausted fails.
- Test provider flag marks synthetic approvals (`test_provider: true`).
- Defaults: workspace R/W + sandboxed tests allowed; network/install/deploy/secrets require approval or deny.

## Tests

`tests/unit/v35-lifecycle-approvals.test.ts`
