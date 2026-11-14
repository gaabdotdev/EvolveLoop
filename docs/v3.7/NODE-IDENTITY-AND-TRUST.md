# Node Identity & Trust

- Primary ID: `worker_node_id` derived at enrollment from public key hash (stable), Ed25519 SPKI.
- States: PENDING_ENROLLMENT → ONLINE / DEGRADED / DRAINING / OFFLINE / QUARANTINED / REVOKED.
- Fail-closed incomplete enrollment; revoked nodes reject heartbeat and session verify.
- Session tokens: HMAC-SHA256, short TTL, revoke list under `credentials/`.
