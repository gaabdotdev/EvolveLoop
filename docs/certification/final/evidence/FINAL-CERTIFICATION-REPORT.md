# Final Certification Report — EvolveLoop V3.7

**Global verdict:** `BLOCKED`  
**Not APPROVED.** Only remaining mandatory blocker: **G17** (second independent Linux host offline).

| Field | Value |
|-------|--------|
| Branch | `recovery/v37-full-cert` |
| Audited code tip (cancel E2E) | `ff78d4577ab8cc1cd8fc5ef954d7842032fb3dbb` |
| Docs HEAD (this packaging) | see `git rev-parse HEAD` after packaging commit |
| Environment | Linux · Node 20+ · bubblewrap 0.11.0 · host `gaab` |
| Lockfile restore | `npm ci` |

## Historical audits (preserved)

| ID | Tip | Verdict |
|----|-----|---------|
| Historical | `4142948` | `REJECT` |
| Re-audit B `be8ca586-…` | `ac13116` | `ACCEPT_WITH_RESERVATIONS` / global BLOCKED |
| Audit C `0999f8bc-4686-43bd-8598-2baabd9302d2` | `8a09d22` / code `ff78d45` | `ACCEPT_WITH_RESERVATIONS` / global **BLOCKED** |

## Mandatory criteria checklist

| # | Criterion | State |
|---|-----------|--------|
| 1 | Unit tests | PASS **499/499** |
| 2 | Integration mandatory | PASS **62**; 1 optional skip (graphify) |
| 3 | Skip investigated | PASS — optional / out of fabric gates |
| 4 | Fabric+IPC+cancel+SEC-H02 | PASS **64/64** |
| 5 | Cancel mid-flight E2E | PASS — AUD-V37B-05 **RESOLVED** |
| 6 | Process/descendants killed | PASS — PID `/proc` checks in E2E |
| 7 | mTLS + revoke | PASS (unit) |
| 8 | Delivery `result_accepted` | PASS (unit) |
| 9 | G17 two hosts | **BLOCKED** |
| 10 | V3.5 / V3.6 on tip | PASS (integration) |
| 11 | Measurement provenance | PASS units; G18 −30% still UNVERIFIED (meta, not fabric G17) |
| 12 | No mandatory BLOCKED/PARTIAL/… | **FAIL** — G17 BLOCKED |
| 13 | Independent audit final | Audit C: ACCEPT_WITH_RESERVATIONS; recommends BLOCKED |
| 14 | Evidence ↔ code hash | Cancel E2E pinned to `ff78d45` |
| 15 | Docs aligned | Updated this packaging pass |

## SEC-H02

Preserved: single-user trusted host ([ADR-V37-0003](../../../v3.7/adr/ADR-V37-0003-ipc-trust-boundary.md)). Not multi-user isolation.

## External action for APPROVED

Bring `gaab-1` (or peer) online → run `EVOLVELOOP_MULTIHOST_LIVE=1` G17 battery → archive evidence → fresh audit → only then APPROVED.
