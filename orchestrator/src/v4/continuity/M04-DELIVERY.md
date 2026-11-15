# META M04 — Delivery record (Capsule, Handoff & Recovery)

| Field | Value |
|-------|-------|
| Meta | M04 — Capsule, Handoff & Recovery (V4.1 Continuity) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m04` · `feature/v4/m04-continuity` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (R1–R16; R3/R6 honored) |
| Contracts | import-only `orchestrator/src/v4/contracts/` (not edited) |
| ADRs | ADR-V4-0006 (primary), 0001, 0016, 0017 |
| Merge to `feature/v4-integration` | **Not done** (forbidden; M19 only) |
| npm install | **Not run** (`orchestrator/node_modules` already symlinked) |
| V3.7 cert edits | **None** |
| Self-assessed status | **DELIVERED for orchestrator validation** — M04 does not mark itself ACCEPTED or claim V4 APPROVED |

## Grounding

Wiki: GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset). Grounding = freeze + ADR-V4-0006 + `capsule.ts` / `ports.ts` (`CapsuleServicePort`) + constitution §4.3, §5 Capsule, §7.2, §15.2.

## 1. What was implemented

`CapsuleService` realizes frozen `CapsuleServicePort`. Wave 2 engines are composed via ports only.

| Piece | Role |
|-------|------|
| `seal` | Emit allowlisted fields only; `task_refs` / `open_effects` from Event Ledger at a **VERIFIED** checkpoint; `manifest_sha256`; Ed25519 via M10 `HandleSigningAdapter` (no PEM on the capsule path, R14). V4.1 requires a signer. |
| `verify` | Fail-closed on size (D09), `validateExecutionCapsule` on the **raw** object (digest, secrets, format major, grant expiry INV-CAP-06, recursive INV-CAP-07), then signature against **configured** `trusted_key_ids` (never the capsule's own key_id). |
| `accept` | verify raw → `allowlistParseExecutionCapsule` → re-derive `effective_grant_refs` via `PolicyDecisionPort` (result ⊆ policy ALLOW ∩ capsule refs; only narrows) → bind Work/Task from ledger at `base_checkpoint.event_seq` (INV-CAP-08; **never** writes Work from `task_refs`; no `WorkRepositoryPort` in the constructor) → consume store-side `replay_id` (= `capsule_id`, R3) → optional M13 lease bind, else fail-closed when `lease_required`. |
| `recoverAtVerifiedCheckpoint` | Resume from `latestConsistent` (VERIFIED) + `EffectLedgerPort.listOpen`; strip `context_hint`; do not invent CONFIRMED / COMMITTED; tombstones (D19); `retryDecision` observed, never dispatched. |
| `handoffAccept` | accept + recovery; executor context is allowlisted fields only; C2 conformance fail-closed when a named executor is supplied. |
| `InMemoryReplayStore` / `FileReplayStore` | Single-use anti-replay (D03). Path component = `work_id` only; `capsule_id` is an opaque field. |

## 2. Reservations honored

| ID | M04 action |
|----|------------|
| R1 | Ledger is not treated as non-repudiation; signature is Ed25519 over the manifest. |
| R3 | No `expires_at` / `replay_id` field claimed on ExecutionCapsule 1.0.0. Replay is store-side. Grant `expires_at` is INV-CAP-06 only. |
| R6 | `assertConforms` is not the F01 gate. Accept = verify raw + allowlist-parse. ★ tests cover forged `task_refs`, nested handoff, unknown-key forwarding, capsule ≠ grant material. |
| R14 | Signing uses M10 handles (`signerFromHandle`); `V37SignaturePort.sign(private_key_pem)` is not called. |

## 3. Tests

```bash
cd orchestrator && npx vitest run tests/v4/continuity
cd orchestrator && npx vitest run tests/v4
# node_modules is a symlink — do not npm install
```

| Suite | Result |
|-------|--------|
| `tests/v4/continuity/**` | **17 passed** |
| Full `tests/v4` | **219 passed** (33 files) |

★ F01 cases (M18 S1 / freeze R6):

- forged `task_refs` (VERIFIED) do not change ledger head/bytes; bound state stays RUNNING
- nested `{ handoff: { permissions, next_action } }` → INV-CAP-07 on the raw object; accept throws; ledger unchanged
- unknown keys (`handoff`, `v3_permissions`, `extra_control`) dropped; not present in `lastExecutorContext`
- capsule ≠ grant material (`grant_material` / `credentials` / nested `permissions` on grants rejected; `effective_grant_refs` are strings and only the policy-allowed subset)

## 4. Files owned by M04

```
orchestrator/src/v4/continuity/**
orchestrator/tests/v4/continuity/**
```

Not owned / not edited: `orchestrator/src/v4/contracts/**`, V3.7 cert surfaces, M01–M03/M06/M10/M12 trees, `feature/v4-integration`.

## 5. Gaps / limitations

- **Wiki** unset → GAP; no vault `log.md` update.
- **M13 lease/epoch** is a stub port (`CapsuleLeaseBindPort`). When `lease_required` and the port is missing, accept fail-closes. M19 must wire the real Execution Gateway / V37 leases.
- **F01(c) expiry/replay on the 1.0.0 object:** not claimed (R3). Replay is M04 store-side; capsule TTL is not a schema field.
- **Grant re-derivation** calls `PolicyDecisionPort.decide` per `delegable_grants[].scope` item. It does not copy grant rows from M10 `GrantRegistry` (that class is not on the frozen port).
- **Signature key hierarchy / rotation** remains M10 (ADR-V4-0006 residual).
- **Phase 3 exit** (handoff/recovery without confirmed-state loss as a vertical) is **not** this delivery; requires M04+M05 ACCEPTED + M19 integrate.
- Pre-existing `tsc` error in `contracts/capsule.ts` is M00; not touched.
- `scanForSecrets` is defence-in-depth, not proof of absence (INV-CAP-02 / F11).

## 6. Commands run

| Command | Result |
|---------|--------|
| `npx vitest run tests/v4/continuity` | 17 passed |
| `npx vitest run tests/v4` | 219 passed |
| `npm install` | **not run** |
| merge to integration | **not run** |
| V3.7 cert edits | **not done** |

## 7. Acceptance self-check

| Mission criterion | Status |
|-------------------|--------|
| seal allowlist + manifest_sha256 + V4.1 signature | Met |
| verify raw recursive INV-CAP-07, digest, secrets, grant expiry | Met |
| accept = verify → allowlist → M10 re-derive ⊆ ∩ → ledger bind → consume replay_id | Met |
| never write Work from `task_refs` | Met (no WorkRepository write path) |
| recovery from VERIFIED + open effects, no invented confirmed state | Met |
| ★ forged task_refs / nested handoff / unknown keys / capsule ≠ grant | Met |
| Tests + delivery report | Met |
| No merge / no npm install / no V3.7 cert / no self-ACCEPTED / no V4 APPROVED | Met |
