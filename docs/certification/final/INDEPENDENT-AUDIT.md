# Independent Audits — EvolveLoop V3.7 recovery

## Historical audit (preserved)

**Auditor:** [Independent V3.7 security audit](0aa07618-d923-4145-9fcb-1df051431b31) (read-only)  
**Audited tip (at review):** `4142948`  
**Verdict:** `REJECT` (promotion to APPROVED / TRUE_FULL_PASS illegitimate)

Full findings from that review remain historically valid as the reason APPROVED was refused at that tip. Do **not** erase this REJECT.

---

## Re-audit B (this tip)

**AUDIT_ID:** `be8ca586-25b3-466b-afba-b6cb20769cc6`  
**Auditor:** Independent read-only re-audit (agent `1d367a0a-9d55-4cd2-b518-d126e2a8175d`)  
**AUDITED_COMMIT (code tip at review):** `ac1311626a1e389b2f9e4417c9a85951830e1d69`  
**VERDICT:** `ACCEPT_WITH_RESERVATIONS`  
**GLOBAL_CERT_RECOMMENDATION:** `BLOCKED`

### Claim validation (auditor)

| Claim | Result |
|-------|--------|
| 1 Delivery waits `result_accepted` | VALID |
| 2 `revokeWorker` destroys sockets | VALID (live CP path) |
| 3 Cert denylist isolated from session revoke | VALID |
| 4 mTLS + delivery coverage | VALID |
| 5 G17 `result_accepted` + post-revoke | PARTIAL at `ac13116` → hardened in follow-up packaging commit |
| 6 Host path no full `process.env` | VALID (test added post-audit) |
| 7 PROTOCOL/SECURITY denylist ≠ CRL | VALID |
| 8 SEC-H02 ADR-0003 honesty | VALID / ACCEPTED_BOUNDARY |
| 9 Mid-flight cancel + 7 scenarios | PARTIAL (unit-strong; not full protocol e2e) |
| 10 Clean suite 491/491 | PARTIAL vs tip packaging at review; evidence refreshed |

### Findings (re-audit B)

| ID | Sev | Status | Summary |
|----|-----|--------|---------|
| AUD-V37B-01 | HIGH | FIXED in packaging tip | Tip evidence must record current suite counts |
| AUD-V37B-02 | MEDIUM | FIXED in packaging tip | EXECUTIVE-VERDICT must pin audited/current tip |
| AUD-V37B-03 | MEDIUM | FIXED | G17 PASS requires post-revoke `result_accepted` on remaining host |
| AUD-V37B-04 | LOW | FIXED | Host scrub unit regression added |
| AUD-V37B-05 | MEDIUM | OPEN (accepted residual) | Cancel near-completion soft; fencing via lease API not full protocol e2e |
| AUD-V37B-06 | INFO | ACCEPTED_BOUNDARY | SEC-H02 same-UID documented; stolen-token privileged call succeeds by design |
| AUD-DEL-01 | CRITICAL | FIXED | `wait_for_result` → `result_accepted` |
| AUD-MTLS-02..04 | HIGH/MED | FIXED | denylist / destroy / mTLS delivery |
| AUD-SBX-01 | HIGH | FIXED | scrubbed host env |
| HIST-REJECT | CRITICAL | OPEN (historical) | Prior REJECT preserved |

### G17

**BLOCKED** — second independent Linux host (`gaab-1` / `100.121.169.97`) offline; live battery not executed. Script dry-run exits BLOCKED (not PASS).

### Auditor summary (abridged)

Most CRITICAL/HIGH code fixes from the historical audit are real at `ac13116`. Mid-flight cancel is substantially implemented. G17 remains externally blocked. Unit/integration green does **not** make V3.7 APPROVED. Do not promote.

---

## Audit C (final closure review)

**AUDIT_ID:** `0999f8bc-4686-43bd-8598-2baabd9302d2`  
**Auditor:** Independent read-only (agent `b4cd5d7e-1b50-4190-b789-6a3f7b7d97a0`)  
**AUDITED_COMMIT:** `8a09d22b57a8777aacee3c5af9b62b07d66b3bf0` (cancel code `ff78d45`)  
**DATE_UTC:** 2026-11-15T12:26:40Z  
**VERDICT:** `ACCEPT_WITH_RESERVATIONS`  
**GLOBAL_CERT_RECOMMENDATION:** `BLOCKED`

### Reservations tracking (Audit C)

| ID | Status | Notes |
|----|--------|-------|
| AUD-V37B-05 | **RESOLVED** | Protocol cancel E2E 7/7 reproduced by auditor |
| AUD-V37B-05-SOFT | ACCEPTED_LIMIT | Soft edges on scenarios 1/9 / near-completion race |
| AUD-V37C-01 | FIXED in packaging follow-up | Executive/summary/checksums sync |
| AUD-V37B-06 SEC-H02 | ACCEPTED_BOUNDARY | ADR-0003 |
| G17 | **OPEN / BLOCKED** | Second host offline |
| HIST-REJECT | Historical | Preserved |

### Claim validation (Audit C)

| Claim | Result |
|-------|--------|
| 1 Cancel protocol E2E | VALID |
| 2 Integration skip optional | VALID |
| 3 Suite counts 499/62+1/64 | VALID (reproduced); packaging refreshed |
| 4 SEC-H02 honesty | VALID |
| 5 G17 still BLOCKED | VALID |
| 6 Prior CRITICAL/HIGH holds | VALID |

**APPROVED illegitimate until G17 PASS + fresh audit.**
