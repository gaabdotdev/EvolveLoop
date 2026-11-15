# Wave 5 status — V4.3 Trust

**Context:** Wave 4 first-cut INTEGRATED (M07/M08/M17). M11 **INTEGRATED** @ `290b453` (337/337). M18 Wave5 **INTEGRATED** @ `0c6d1c91` (docs-only; 337/337 unchanged). M10-full **INTEGRATED** @ `04a104b` (343/343). Phase 4 **PARTIAL** — fair baseline exists but all primary metrics `DECLARED_UNAVAILABLE` (no observed harness run); M08 methodology still **PROVISIONAL**; M09 score-routing remains blocked.

| Meta | Focus | Status | Notes |
|------|-------|--------|-------|
| M11 | Trust & Provenance Graph | **INTEGRATED** | tip `f1222f6`; merge `290b453a32d54f38e89ea41a537b85be7365a966`; orch vitest **337/337** (55 files; provenance 31) |
| M10-full | Policy full (F02) | **INTEGRATED** | tip `fd8adf7`; merge `04a104b68efd46e5f3b127fbaa3839f595166de8`; orch vitest **343/343** (55 files). F02 **PARTIALLY MITIGATED** (CLI store fallback refused under V4 posture). V3 daemon actor residual **OPEN** (RR-W5-01 remainder). RR-W5-02 **OPEN**. Do not claim F02 globally closed. |
| M15 F02 daemon | V3 IPC actor residual | RUNNING | Task `d5a42771-…`; RR-W5-01 remainder |
| M06-authz | WorkProof authz | PENDING | after M15 F02 cut |
| M18 | Adversarial RO review | **INTEGRATED** | tip `5e8bc70`; merge `0c6d1c919eabce9e2065aec1d19efc0b0b048558`; docs-only `docs/v4/security/**`; orch vitest **337/337** (55 files, unchanged). OPEN residuals RR-W5-01..11 **not inverted** (F02 V3 CLI still OPEN at that cut; M10-full later refuses CLI fallback only). |
| M09 | Adaptive (no score routing) | BLOCKED | wait methodology ACCEPTED + observed baseline |

## Hard edges

- Provenance answers §4.12 questions with verifiable refs (FROZEN ports).
- No invented trust scores.
- G17 still blocks final APPROVED.
- M18 Wave 5 dispositions (OPEN / PARTIALLY MITIGATED / READ-MODEL ONLY / HONEST) are not closed by this integrate.
- M10-full F02 is **PARTIALLY MITIGATED** (V4 PDP + V4-posture CLI filesystem fallback). V3 daemon IPC actor residual remains **OPEN**. F02 is not globally closed.
