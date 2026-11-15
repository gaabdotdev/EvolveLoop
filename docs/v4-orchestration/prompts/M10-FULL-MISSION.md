# META M10 — Policy full (Wave 5 Trust cut)

Read `WAVE5-COMMON.md`. Ground on M18 Wave5 RO (`docs/v4/security/M18-WAVE5-RO.md`) residuals **RR-W5-01 / RR-W5-02**.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m10` (create from integration HEAD after M18 INTEGRATED) |
| Branch | `feature/v4/m10-policy-full` |
| Ownership | `orchestrator/src/v4/policy/**` + `orchestrator/tests/v4/policy/**` (+ adapters if needed) |
| Contracts | FROZEN — do not add `decided_by` to PolicyDecision 1.0.0 without RFC |

## First-cut scope (this wave)

1. **RR-W5-01 / F02:** Isolate or refuse the V3 CLI `store.approve(actor)` fallback on any V4 operator path; keep token-derived identity on approve (`InMemoryOperatorAuthn` / V37 adapter posture). Prefer fail-closed documentation + code gate over deleting unrelated V3.5 surfaces wholesale.
2. Enforce HUMAN ≠ requesting executor on V4 approval resolution where tests already lock SELF_APPROVAL_DENIED — extend to the live CLI/adapter path M18 flagged.
3. Path deny: prefer realpath/symlink-canonical checks where M10 already owns deny lists (F14 residual — partial OK).
4. Do **not** invent trust scores; do not unblocking M09; do not thaw contracts.

## Accept

Tests for F02 path; delivery note. DELIVERED. No merge. No APPROVED.
