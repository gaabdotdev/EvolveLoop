# M10 Wave 2 — Policy foundations delivery

| Field | Value |
|-------|-------|
| Meta | M10 |
| Branch | `feature/v4/m10-policy-foundations` |
| Worktree | `/home/gaab/Downloads/EvolveLoop-v4-m10` |
| Freeze | `docs/v4/architecture/CONTRACT-FREEZE.md` **FROZEN** (reservations R1–R16) |
| Scope | `orchestrator/src/v4/policy/**`, `orchestrator/src/v4/adapters/v37/policy.ts`, `adapters/v37/identity.ts` (handle signing only) |
| Not done | merge to integration; npm install; V3.7 cert edits; Cedar/Rego language (ADR-V4-0011 deferred) |

## Grounding

Wiki: **GAP** — `WIKI_ROOT` / `RAG_REPO_ROOT` unset. Contracts taken from this repo (TypeScript source of truth, ADR-V4-0001).

## What shipped

- Deny-by-default `PolicyDecisionPort` (`DenyByDefaultPolicyEngine`): no match ⇒ DENY; `combineRuleEffects` unchanged.
- L0–L3 applied as **work-scoped** vocabulary (`WorkPolicyContext.autonomy` ∩ `Policy.autonomy_ceiling`). Missing work context ⇒ L0. Work cannot raise the ceiling. L1 does not escalate to L2.
- Versioned decisions: `policy_ref {policy_id, version, epoch}`, TTL ≤ 5 min, `decided_at` / `valid_until`.
- **R4:** `decided_by` is an optional extra on the 1.0.0 object (readers ignore unknown fields). Derived from `POLICY_ENGINE` or authenticated HUMAN — never from request `actor` / `decided_by` / `approver`. Frozen `PolicyDecision` type **not** edited (M00-owned).
- **R8:** Grant/Approval are M10-local types, not catalog kinds, not `V37ApprovalRecord`.
- **R13:** ACTIVE ALLOW rules with `*` in subjects, actions, or resources are rejected at load (`INV-POL-04-TIGHT`).
- **R14:** `HandleSigningAdapter` signs by `KeyHandle`; PEM stays in an in-process vault; `V37SignaturePort.sign(pem)` is not implemented.
- **F02:** `V37PolicyAdapter` requires `operator_token`; `V4_CLI_STORE_FALLBACK = false`; `v3StoreApproveFallbackForbidden` always throws. Self-approval by `executor_*` id is denied.
- **F03/F04 foundations:** grants expire at consume, are revocable, epoch-bound, single-use CAS in-memory, bound to exact action/resource/work.

## Tests

```bash
cd orchestrator && npx vitest run tests/v4/policy tests/v4/contracts tests/v4/conformance
```

63 passed (35 M10 + 28 frozen contracts/conformance). No `npm install`.

## Non-claims

- Not a Cedar/Rego engine.
- Not M13 isolation (executors vs Control Plane OS user).
- Not a durable grant ledger.
- Frozen catalog still has no `Grant`/`Approval` kind (R8 residual for a later minor/RFC).
- `decided_by` is not a required 1.0.0 field (R4 residual unless M00 adds the optional minor to the type).
