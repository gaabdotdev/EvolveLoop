# V3.7 Acceptance Matrix

States: PASS | FAIL | BLOCKED | NOT_RUN | PARTIAL

| Gate | Criterion | State | Evidence |
|------|-----------|-------|----------|
| Gate 0 | Canonical lineage integrated | PASS | `LINEAGE-INTEGRATION-REPORT.md`, `BASELINE-ACCEPTANCE-MATRIX.md` |
| Gate I | Node identity & trust/enroll/revoke | PASS | `tests/unit/fabric/fabric-core.test.ts` |
| Gate W | Worker runtime contract + supervision | PASS | fabric-core worker runtime test |
| Gate S | Hard/soft placement + pools | PASS | fabric-core placement/pools |
| Gate A | Artifact hash + ACL | PASS | fabric-core artifact test |
| Gate F | Lease fencing / steal revoke | PASS | fabric-core + protocol-flow |
| Gate T | Team topology versioning | PASS | fabric-core teams |
| Gate R | Work steal + speculative policy | PASS | fabric-core |
| Gate O | Doctor + MP correlation fields | PARTIAL | `fabric fleet-report` emits control_plane_id/worker_node_id/lease/fencing/remote_trace (+ unit); LIVE cross-host still G17 BLOCKED |
| Gate E2E | ≥2 real Linux hosts concurrent | BLOCKED | Tailscale `gaab-1` offline at run time |
| Gate Release | All required gates PASS | NOT_RUN | blocked on E2E |

## Test battery (local)

- `npx vitest run tests/unit/fabric` — 19 PASS (2026-11-13)
- `tsc --noEmit` — PASS on integrated tree
- Multi-host live harness — NOT_RUN / BLOCKED
