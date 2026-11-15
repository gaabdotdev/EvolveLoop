# V4 Contract Freeze — Wave 2 gate

| Field | Value |
|-------|-------|
| Status | **FROZEN** |
| Stamp | Orchestrator, 2026-11-15 |
| Freeze tip | `a78321e8934fe24a7db11cee50a40b95d209d192` (`feature/v4/m00-architecture`) |
| Contract code tip | `842c4c6129868e9ac3bcaeef5074fcfb28d82faa` (B1–B3 rework + pin) |
| Review | `M00-FREEZE-REVIEW-2.md` → **FREEZE_APPROVED_WITH_RESERVATIONS** (Task `4f992443-…`) |
| Prior reject | `M00-FREEZE-REVIEW.md` FREEZE_REJECTED (closed by `af118a0`) |
| Tests | `npx vitest run tests/v4` → **28/28** (orchestrator re-confirmed) |
| V3.7 | Provisional baseline `03937c1`; global cert still **BLOCKED** G17 |

## Binding reservations (Wave 2 MUST honor)

From `M00-FREEZE-REVIEW-2.md` §3 (R1–R16). Highlights:

- **R1:** Hash chain ≠ non-repudiation.
- **R2:** `WorkEvent.payload` may still contain F12 names; producers must type payloads; do not treat as CONTROL.
- **R3–R5:** Capsule expiry/replay, `PolicyDecision.decided_by`, grant/approval/lease id prefixes — optional minors OK; do not claim encoded on 1.0.0.
- **R6:** Capsule accept = validate raw + `allowlistParseExecutionCapsule`; `assertConforms` alone ≠ F01.
- **R15:** M12 must default missing measurement provenance to UNKNOWN/UNAVAILABLE (not OBSERVED).

## Catalog

`CONTRACT_CATALOG` stability for shared kinds → **FROZEN** at this tip (ADR-V4-0001). Semantic changes require RFC.

## Wave 2 authorization

Metas M01, M02, M03, M06-min, M10-fund, M12-init may implement against this freeze. Do not start M04+ until V4.0 vertical slice is green unless orchestrator waives.
