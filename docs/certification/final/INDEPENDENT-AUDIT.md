# Independent Audit — EvolveLoop V3.7 recovery

**Auditor:** [Independent V3.7 security audit](0aa07618-d923-4145-9fcb-1df051431b31) (read-only)  
**Audited tip (at review):** `4142948`  
**Verdict:** `REJECT` (promotion to APPROVED / TRUE_FULL_PASS illegitimate)

Full findings table preserved from auditor output. Implementer follow-up addresses CRITICAL/HIGH items in subsequent commits on `recovery/v37-full-cert`.

## Auditor verdict summary

- G17 BLOCKED externally **and** automation unsafe for certification (false PASS on `"acked"`).
- mTLS CRL claim overstated (JSON store not TLS-stack CRL; revoke test conflates session revoke).
- `deliverTask` stops at offer→ack; full cycle not awaited.
- SEC-H02 same-UID filesystem token residual remains.
- WorkerRuntime host fallback / cancel-under-sandbox gaps.

## Follow-up disposition (implementer)

| ID | Severity | Disposition |
|----|----------|-------------|
| AUD-MTLS-01 | HIGH | Docs narrowed: app-layer denylist ≠ OpenSSL CRL |
| AUD-MTLS-02 | HIGH | Fixed: cert-only denylist test with valid session |
| AUD-MTLS-03 | HIGH | Fixed: `revokeWorker` destroys live sockets |
| AUD-MTLS-04 | MEDIUM | Fixed: mTLS+delivery combined unit test |
| AUD-DEL-01 | CRITICAL | Fixed: `wait_for_result` default → `result_accepted` |
| AUD-DEL-02 | HIGH | Fixed: tests assert result_accepted; no error swallow |
| AUD-G17-01..02 | CRITICAL/HIGH | Fixed: script requires `result_accepted` + post-revoke asserts |
| AUD-SBX-01 | HIGH | Fixed: host path scrubbed env (no full process.env) |
| AUD-SBX-02 | MEDIUM | Documented: mid-flight sandbox cancel needs async handle (open residual) |
| AUD-H02-01 | HIGH | Documented residual same-UID; not claimed as cross-user isolation |
| AUD-CERT-01 | CRITICAL | Unchanged: global verdict stays **BLOCKED** (G17 host) |

Post-fix fabric+IPC unit: **46 PASS**. Global certification status remains **`BLOCKED`**. Auditor `REJECT` of APPROVED still correct until G17 live + residual closeout.
