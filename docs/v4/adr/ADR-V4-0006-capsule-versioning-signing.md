# ADR-V4-0006 — Execution Capsule versioning, signing, and authority

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (contract); M04 (seal/verify/accept); M10 (re-derive grants) |
| Constitution | §4.3, §5 Execution Capsule, §15.2 Capsule |
| M18 | **TM-V4-F01** (capsule ≠ grant), **F12**, D02, D03 |
| Contracts | `capsule.ts`, `CapsuleServicePort`, `field-class.ts` |

## Context

§15.2: how to version, sign, compatibilize and validate capsules across runtimes?

V3 `HandoffPackage` is unsigned JSON, embeds `permissions`, and `load()` only checks `kind`. Forged packages can inject permissions and write `verified_task_state` (F01). Free-text `next_action` becomes the next executor's objective (F12).

M18 required property: capsule carries **references** to authority, never authority itself; effective permissions re-derived at accept and can only narrow; Work State never written from capsule content.

## Decision

1. **Format version** `capsule_format_version` (semver). Compatibility = same major (`isCapsuleFormatCompatible`).
2. **Integrity:** `manifest_sha256 = sha256(canonical JSON of body excluding integrity)` using EvolveLoop canonical JSON v1 (not RFC 8785; producers avoid non-integer floats). Optional `Ed25519` signature over the manifest, using V3.7 identity primitives via `V37SignaturePort`. V4.1 Continuity **requires** a signature at `CapsuleServicePort.verify`; V4.0 substrate may seal unsigned capsules only for in-process tests.
3. **Capsule ≠ grant (INV-CAP-07).** Constant `authority_model = POLICY_REDERIVED_AT_ACCEPT`. Fields `permissions`, `verified_task_state`, `next_action`, `objective`, credentials/tokens are **forbidden**. `delegable_grants` are `grant_ref` + scope + expiry — references, not material.
4. **Accept protocol (`CapsuleServicePort.accept`):**
   - fail-closed if `verify` fails (digest, signature, expiry, format, secret scan, forbidden fields);
   - re-derive `effective_grant_refs` from **current** Policy (M10); result ⊆ current policy **and** ⊆ capsule grant refs (only narrows);
   - bind Work/Task state from Event Ledger at `base_checkpoint.event_seq` (INV-CAP-08) — `task_refs` are orientation snapshots, never written into Work State;
   - consume anti-replay / single-use `replay_id`; superseded capsules rejected (D03);
   - bind to current lease/epoch (D03).
5. **Secrets structurally excluded** (INV-CAP-02): grant refs only; heuristic `scanForSecrets` is defence-in-depth, not proof of absence (M18 leak gate).
6. **Expiry:** every `delegable_grants[].expires_at` checked at verify/accept (`INV-CAP-06`).
7. Canonicalization limitation is documented: cross-language verifiers must avoid non-integer floats in digested payloads.

## Consequences

- M04 owns seal/verify/accept. M10 owns grant re-derivation. M13 supplies the lease/epoch.
- V3 HandoffPackage is not a V4 capsule; a one-way importer (if ever needed) produces `SUCCEEDED_UNVERIFIED` work and empty grants.
- `CapsuleAcceptance.authority_source` is always `POLICY_REDERIVED`; `work_state_source` is always `EVENT_LEDGER`.

## Alternatives rejected

- **Copy V3 permissions into the capsule:** F01 critical.
- **JWT as the capsule:** couples to a token format; we need content-addressed artifacts + typed fields. Signature is a field, not the envelope.
- **RFC 8785 JCS:** correct long-term; V4.0 uses a simpler canonical JSON to ship without extra deps. Revisit if a non-TS verifier appears (M14). Decision date: Phase 7.

## Residual uncertainty

Key hierarchy for capsule signatures (which Control Plane key, rotation) is M10. Replay-id store is M04. Neither is an engine in this meta.
