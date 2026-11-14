# V3.7 Remote Execution Protocol

See ADR-V37-0002. Framing: `u32be` length + UTF-8 JSON. Channels: control|task|telemetry|artifact|health.

## Transport

- **Production / `cp-start` default:** TLS **with mTLS** — Control Plane CA issues server + worker client certificates; `requestCert=true`, `rejectUnauthorized=true`.
- Peer client certificate CN **must** equal authenticated `worker_node_id`.
- **Certificate revocation:** application-layer denylist under `fabric-dir/ca/crl/*.json` checked in `verifyPeerIdentity` **after** TLS handshake (not OpenSSL CRL/OCSP stapling). Session revoke is separate. Live `revokeWorker` also destroys the protocol socket immediately.
- **Lab-only plaintext:** explicit `{ insecurePlaintext: true }` on `startServer` — cannot combine with `requireClientCert`. Never the CLI default.

## Auth layers

1. mTLS client certificate bound to `worker_node_id` (+ app-layer cert denylist)
2. `control.auth` HMAC session token (short TTL, revoke list under `credentials/`)

Idempotent `request_id`. Replies must set `ack_of` where applicable.

## Task delivery

Live Control Plane pushes `task.offer` to the connected worker socket. Worker replies `task.ack` | `task.reject`, may emit `task.progress`, then `task.result` (fencing checked at commit).

Certification path: `deliverTask({ wait_for_result: true })` (admin/CLI default) waits for `task.result_accepted` / `task.result_rejected`. Status `acked` alone is **not** completion.
