# V3.7 Remote Execution Protocol

See ADR-V37-0002. Framing: `u32be` length + UTF-8 JSON. Channels: control|task|telemetry|artifact|health.

## Transport

- **Production / `cp-start` default:** TLS **with mTLS** — Control Plane CA issues server + worker client certificates; `requestCert=true`, `rejectUnauthorized=true`.
- Peer client certificate CN **must** equal authenticated `worker_node_id`.
- Revoked worker certificates are rejected (CRL under `fabric-dir/ca/crl/`).
- **Lab-only plaintext:** explicit `{ insecurePlaintext: true }` on `startServer` — cannot combine with `requireClientCert`. Never the CLI default.

## Auth layers

1. mTLS client certificate bound to `worker_node_id`
2. `control.auth` HMAC session token (short TTL, revoke list under `credentials/`)

Idempotent `request_id`. Replies must set `ack_of` where applicable.

## Task delivery

Live Control Plane pushes `task.offer` to the connected worker socket. Worker replies `task.ack` | `task.reject`, may emit `task.progress`, then `task.result` (fencing checked at commit).
