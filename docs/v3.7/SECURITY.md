# Security

Extends V3.5 model.

- Untrusted until enroll + authorize.
- Authorize issues **mTLS client certificate** + HMAC session token.
- Revoke invalidates sessions **and** writes an **application-layer** cert denylist entry (`ca/crl/*.json`), checked on subsequent `control.auth` peer identity verification. This is **not** OpenSSL CRL/OCSP at the TLS stack.
- Live Control Plane `revokeWorker` destroys the worker protocol socket immediately.
- Fencing at result commit.
- Cross-project artifact deny default.
- No silent sandbox→host fallback when `sandbox_profile` requires OS isolation; host path (profile `none`) uses scrubbed env (no full `process.env` inherit).
- Plaintext protocol lab-only (`insecurePlaintext`).
- Coordinator IPC: privileged methods require privileged token + nonce anti-replay; `tick` is privileged (SEC-H02). **Residual:** same-UID processes that can read `ipc.privileged.token` still share authority (filesystem ACL model); not claimed as cross-user isolation.
- Fabric admin IPC: capability-scoped tokens bound to Control Plane epoch.
