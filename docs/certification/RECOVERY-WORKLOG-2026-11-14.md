# V3.7 recovery worklog — 2026-11-14

## Scope

This worklog records changes made against the uploaded recovery snapshot `7468a40f876bddb50d6b4c06016cd6dda9cede13`. The ZIP does not contain `.git`, so branch ancestry, commit identity, and pre-existing uncommitted changes cannot be independently verified from this artifact.

## Changes in this recovery pass

1. **Live session revocation enforcement**
   - `FabricProtocolServer` can now use the Control Plane's session verifier.
   - The Control Plane verifier checks HMAC validity, expiry, Control Plane identity, persisted session revocation, and worker trust state.
   - The server revalidates the authenticated session before every subsequent message, so a connection cannot continue using a revoked token.
   - Re-authentication on an already authenticated socket is rejected.

2. **Protocol envelope validation and connection handling**
   - Incoming envelopes are checked for object shape, protocol version, channel, bounded identifiers, timestamp fields, sequence number, and payload presence before dispatch.
   - Per-connection message processing is serialized to avoid concurrent handlers racing over shared socket/session state.
   - Request-ID replay cache entries are expired; the server rejects new traffic if the bounded cache is full rather than silently evicting still-live replay protection.
   - Client pending requests now clear timers and reject on socket errors, close, malformed responses, and explicit close.
   - Socket data chunks are normalized to Buffer for current Node type definitions.

3. **Control Plane lifecycle and fencing**
   - Added an `attach` construction mode for CLI operations that must inspect or mutate registry data without incrementing the active Control Plane epoch.
   - Only active-mode services can start the listener.
   - Starting a listener acquires a per-fabric-directory PID lock; a second live Control Plane process is rejected.
   - Epoch is advanced and persisted only after lock acquisition and listener startup.
   - Listener startup failure releases the lock.

4. **Measurement Plane provenance**
   - Removed fabricated `remote_trace_id`, `remote_span_id`, and `artifact_transfer_id` values from the local fleet report.
   - `correlation_fields_emitted` now lists only fields actually emitted by this local report.
   - Report limitations explicitly state that remote trace/span and artifact-transfer correlation require real worker/transfer events.

5. **CLI truthfulness**
   - `fabric dispatch --deliver true` now fails explicitly because this snapshot's dispatch path creates a contract and lease but does not yet deliver the contract to a remote worker. It no longer silently implies delivery.

## Validation performed in this environment

- TypeScript check/build completed using the globally available TypeScript compiler, the globally available Node type definitions, and a temporary local declaration stub for the missing `yaml` package. This is **not** equivalent to a clean dependency install from the repository lockfile.
- A direct Node smoke test against compiled output passed:
  - Control Plane starts and binds a local listener.
  - Worker enrollment and token authentication succeed.
  - Heartbeat succeeds before revocation.
  - A live connection is rejected after its session is revoked.
  - Attach mode preserves the active epoch.
  - A second active Control Plane cannot acquire the same fabric directory lock.
  - Fleet report does not advertise synthetic remote trace/span/artifact IDs.
- Full Vitest suite was **not run**: dependency installation timed out and the local npm cache lacks the locked `yaml@2.9.0` package and Vitest executable.

## Still open — do not mark as PASS

- **G17 multi-host E2E remains BLOCKED.** The supplied G17 script checks SSH reachability and distinct machine IDs, then explicitly stops because remote worker enrollment/execution is not automated end-to-end.
- **mTLS is not implemented by this recovery pass.** The protocol server still does not require and validate worker client certificates. The smoke test used the test-only plaintext transport; it does not prove production TLS or mTLS.
- **Remote task delivery is not implemented.** Dispatch still creates a contract/lease; no complete remote offer/ack/execute/result cycle is available through the CLI.
- **Worker sandbox execution was not proved.** A local control-plane smoke test is not a remote worker execution test; the full runtime needs a real worker host and required sandbox dependencies.
- **G16 remains PARTIAL.** Local correlation fields are now honest, but real remote trace/span and artifact-transfer correlation require actual worker events.
- Full regression, adversarial, security, and cross-version suites remain pending until dependencies are restored.

## Certification rule

No G17, G16, mTLS, remote delivery, sandbox, or overall TRUE_FULL_PASS status is promoted by this worklog. Keep merge, release, and certification blocked until each applicable item has reproducible evidence from the required environment.
