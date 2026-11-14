# Security

Extends V3.5 model.

- Untrusted until enroll + authorize.
- Authorize issues **mTLS client certificate** + HMAC session token.
- Revoke invalidates sessions **and** certificates (CRL).
- Fencing at result commit.
- Cross-project artifact deny default.
- No silent sandbox→host fallback (V3.5); fabric WorkerRuntime uses SandboxManager when `sandbox_profile` ≠ `none`.
- Plaintext protocol lab-only (`insecurePlaintext`).
- Coordinator IPC: privileged methods require privileged token + nonce anti-replay; `tick` is privileged (SEC-H02).
- Fabric admin IPC: capability-scoped tokens (`fabric.deliver`, `fabric.revoke`, …) bound to Control Plane epoch.
