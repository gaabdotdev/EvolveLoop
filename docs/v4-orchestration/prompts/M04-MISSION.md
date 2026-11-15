# META M04 — Capsule, Handoff & Recovery

Leader for V4.1 Continuity (capsule path). Read `WAVE3-COMMON.md` first.

| Field | Value |
|-------|-------|
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m04` |
| Branch | `feature/v4/m04-continuity` |
| Ownership | `orchestrator/src/v4/continuity/**` + `orchestrator/tests/v4/continuity/**` |
| Contracts | FROZEN import only — `capsule.ts`, `ports.ts` (`CapsuleServicePort`), related |
| ADRs | ADR-V4-0006 (primary), 0001, 0016, 0017; freeze R3/R6 |
| Chapters | §4.3, §5 Capsule, §7 recovery/handoff, §15.2 Capsule |

## Implement (`CapsuleServicePort`)

1. **seal** — emit allowlisted fields only; compute `manifest_sha256`; optional Ed25519 via `V37SignaturePort` / M10 identity adapter (V4.1 **requires** signature at verify for non-test seals).
2. **verify** — fail-closed on digest, signature, format major, secret scan, **recursive** INV-CAP-07 on the **raw** object; grant ref expiry (INV-CAP-06).
3. **accept** — verify raw → `allowlistParseExecutionCapsule` → re-derive `effective_grant_refs` via M10 `PolicyDecisionPort` (result ⊆ policy ∩ capsule refs; only narrows) → bind Work/Task from Event Ledger at `base_checkpoint.event_seq` (INV-CAP-08; **never** write Work State from `task_refs`) → consume anti-replay `replay_id` (store owned by M04) → bind lease/epoch if M13 port available, else document stub + fail-closed when lease required.
4. **Recovery / handoff** — resume from VERIFIED checkpoint + open effects via M02/M03 ports; do not invent confirmed state; respect tombstones (D19).
5. ★ tests (M18 S1 / freeze R6): forged task state does not change ledger; nested `{ handoff: { permissions, next_action } }` rejected; **unknown keys not forwarded** after allowlist-parse; capsule ≠ grant material.

## Do not

- Edit `contracts/**`, V3.7 cert, M01–M03/M06/M10/M12 ownership trees (compose via ports).
- Claim F01(c) expiry/replay fully encoded on 1.0.0 object if fields absent (R3) — implement accept-time checks with optional minors only if orchestrator allows; otherwise store-side replay_id without schema change.
- Merge to `feature/v4-integration`. Self-ACCEPTED. `npm install`.

## Accept (orchestrator)

Seal/verify/accept round-trip; F01 ★ tests green; recovery without dropping confirmed ledger state; delivery report under `continuity/`. Status = DELIVERED for validation.
