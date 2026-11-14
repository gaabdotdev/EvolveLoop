# ADR-V37-0002 — Remote Execution Protocol transport

**Status:** Accepted  
**Date:** 2026-11-13

## Context

V3.7 needs one authenticated, versioned, observable remote protocol between Control Plane and Worker Nodes. Options considered:

| Option | Pros | Cons |
|--------|------|------|
| gRPC (HTTP/2 + protobuf) | Streaming, mature auth story | New toolchain; heavier ops; TS codegen burden |
| HTTP/1.1 REST + SSE | Simple debug | Weak bidirectional control; awkward heartbeats/leases |
| WebSocket over TLS | Bidirectional, streaming, Node-native | Framing/schema must be owned by us |
| Custom TCP + TLS length-prefix JSON | Minimal deps, clear framing, easy versioning | Must implement backpressure/limits carefully |
| Two transports (control WS + artifact HTTP) | Separation of concerns | Violates “one transport purpose” unless strictly layered |

Constraints: existing TypeScript/Node orchestrator; private network first; mutual auth; reconnect; backpressure; observability; version negotiation; no DIY cryptography.

## Decision

1. **Control channel:** TLS TCP with **length-prefixed JSON frames** (`u32be` length + UTF-8 JSON), schema `protocol_version` negotiated at handshake.
2. **Auth:** mutual TLS using Node `tls` + short-lived node session tokens bound to `worker_node_id` (Ed25519 node identity keys via `node:crypto`; certs/tokens issued by Control Plane enrollment — **no custom crypto primitives**).
3. **Artifact transfer:** same TLS session multiplexes `artifact.*` messages (chunked, hash-verified). Optional later: negotiated side-channel still under the same protocol family — **not** a second competing stack in V3.7.1.
4. **Message classes:** `control.*`, `task.*`, `telemetry.*`, `artifact.*`, `health.*` — separated by `channel` field; not separate sockets required.
5. Reject gRPC for V3.7.1 to avoid dual ecosystems; revisit only with ADR if streaming/load demands it.

## Consequences

- One framing implementation in `orchestrator/src/v3/fabric/protocol/`.
- Operators can tcpdump/debug JSON with care; size/rate limits mandatory.
- Exactly-once is **not** claimed; idempotent `request_id` + fencing on commit.
