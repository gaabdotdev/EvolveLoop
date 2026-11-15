# ADR-V4-0017 — Data vs control typing

| Field | Value |
|-------|-------|
| Status | PROPOSED-DEFAULT |
| Date | 2026-11-15 |
| Meta | M00 (typing); M04 (capsule); M06 (evidence); M10 (authority never from content); M15 (render) |
| Constitution | §9.2 data/control separation; §8 honesty |
| M18 | **TM-V4-F12**, **TM-V4-F09**, D01, D10 |
| Contracts | `field-class.ts`, `capsule.ts`, `evidence.ts`, `work-event.ts` |

## Context

F12: V3 copies executor free-text (`reason`, `decisions`, `next_action`) into the substitute's **objective** — cross-executor injection, then second-order injection via the ledger.

F09: `classifyGateSource` reads `gate_source_kind: "controlled_fixture"` from the payload being classified — producers self-label as trusted.

Constitution §9.2 requires separation of observed data and control instructions. Authority is never derived from content (D01).

## Decision

1. **Field classes** (`FieldClass`):
   - `CONTROL` — platform/Goal Contract/Policy authored. May affect scope or authority.
   - `DATA` — structured observations (hashes, states, refs) that are not instructions.
   - `UNTRUSTED_DATA` — executor- or content-authored text. Quoted. Cannot alter scope, objective, grants, or Task/Work state.

2. **Capsule map** (`CAPSULE_FIELD_CLASS`): `decisions.summary` and `pending_items` are UNTRUSTED_DATA. `goal_contract_ref`, `base_checkpoint`, `delegable_grants`, `constraints`, `compatibility` are CONTROL (platform-sealed). `task_refs` are DATA snapshots (INV-CAP-08 — never written to Work State). Forbidden V3 field *names* (`next_action`, `objective`, `permissions`, …) fail INV-CAP-07 **at any depth**. `seal`/`accept` allowlist-parse known fields; unknown keys are never forwarded.

3. **Evidence and WorkEvent MUST NOT carry** `trust`, `trust_level`, `gate_source_kind`, `controlled_fixture`, `trusted_fixture` (INV-EVD-04, INV-EVT-05). Trust of a record is a property of the **authenticated channel** that delivered it (ADR-V4-0016) and of Policy, assigned by the Control Plane, not by the producer.

4. **Control fields** (objective, scope, permissions, acceptance, autonomy) come only from Goal Contract + Policy + Work State. Executor text never becomes `Execution` objective or Policy input.

5. **Rendering (M15):** UNTRUSTED_DATA is displayed as data (quoted). Approval UI shows exact action/resource/policy (D10), not model prose as the action.

6. **Intake (M01):** untrusted repo/issue/web/wiki content is marked at ingestion (D01). Out of M00 engine scope; the contract is that such marks are DATA, not CONTROL.

## Consequences

- M04 `accept` ignores `task_refs` as authority and ignores `decisions.summary` as instructions.
- M06 independence uses executor ids, not a trust field.
- Measurement Plane (M12) must not default unlabeled data to OBSERVED (F10) — M12 owns the envelope; V4 evidence already requires explicit provenance.

## Alternatives rejected

- **A single `untrusted: boolean` on the capsule:** too coarse; mixed fields.
- **Let the model "know" to ignore injected instructions:** not a control (D01).
- **Keep `gate_source_kind` as optional telemetry:** F09 repeats.

## Residual uncertainty

Prompt-assembly rules for how UNTRUSTED_DATA is wrapped in executor context are M14/M04 implementation, reviewed by M18 S7. Not an API freeze item.
