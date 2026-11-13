# V3.7 Remote Execution Protocol

See ADR-V37-0002. Framing: `u32be` length + UTF-8 JSON. Channels: control|task|telemetry|artifact|health.

Default transport: TLS (`openssl` materials for lab CP). Lab-only plaintext via `startServer(..., { insecurePlaintext: true })` — never default in production CLI serve path without explicit flag.

Auth: `control.auth` with HMAC session token bound to `worker_node_id`. Idempotent `request_id`. Replies must set `ack_of`.
