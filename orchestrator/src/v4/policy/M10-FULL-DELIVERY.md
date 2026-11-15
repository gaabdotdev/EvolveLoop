# META M10 — Policy full (Wave 5 Trust cut — F02)

| Field | Value |
|-------|-------|
| Meta | M10 — Policy Engine full cut |
| Wave | 5 — V4.3 Trust (F02 / RR-W5-01, RR-W5-02 partial, F14 partial) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m10` · `feature/v4/m10-policy-full` |
| Baseline | `feature/v4-integration` ≥ `ff32c09` (M18 Wave5 RO INTEGRATED) |
| Freeze | contracts **FROZEN** — `PolicyDecision` 1.0.0 not thawed; no `decided_by` RFC |
| Ownership | `orchestrator/src/v4/policy/**`, `orchestrator/src/v4/adapters/v37/policy.ts`, `orchestrator/tests/v4/policy/**` |
| Narrow CLI exception | `orchestrator/src/cli/v35-commands.ts` approve/reject store-fallback only (M15 co-own) |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` is a symlink) |
| V3.7 cert edits | **None** |
| Catalog / `contracts/**` edits | **None** |
| Self-assessed status | **DELIVERED for orchestrator / independent review** — M10 does not mark itself ACCEPTED or APPROVED |
| Knowledge | Wiki GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset) |

## 1. Commits

On `feature/v4/m10-policy-full` (no merge to integration):

| Hash | Message |
|------|---------|
| *(implementation SHA stamped after first landing)* | feat(v4/m10): refuse V3 CLI store fallback under V4 posture (F02) |

Orchestrator tip = `git rev-parse feature/v4/m10-policy-full` (stamped in a follow-up docs commit if present).

## 2. What was implemented

| Piece | Role |
|-------|------|
| `V4_CLI_STORE_FALLBACK = false` | Unchanged marker: V4 posture refuses the V3 local-store write |
| `applyCliApprovalStoreFallback` | Gate: when fallback is refused, the `write` callback is **never** invoked |
| `v35-commands.ts` approve/reject | After IPC failure, call the gate instead of `store.approve` / `store.reject` with `args.actor ?? "cli"`; fail closed (`F02_STORE_FALLBACK_REFUSED`, exit 1) |
| `V37PolicyAdapter.approve/reject` | Token-only credential; `CALLER_ASSERTED_IDENTITY_REJECTED` for `actor` / `decided_by` / `approver` / `approver_id` |
| `canonicalizeResource` | Partial F14: absolute non-glob paths realpath (symlink-aware); logical resources stay lexical |

`decided_by` on approvals remains M10-local (`Approval.decided_by` from `AuthenticatedPrincipal`). Frozen `PolicyDecision` 1.0.0 is **not** extended.

## 3. Honesty pins

- No trust / reputation scores.
- No M09 Adaptive / score routing.
- No V3.7 certification edits.
- No contract thaw (R4: `decided_by` is not a required 1.0.0 field).
- No APPROVED / self-ACCEPTED / merge.

## 4. Tests

```bash
cd orchestrator && npx vitest run tests/v4/policy
# 5 files, 41 passed
cd orchestrator && npx vitest run tests/v4
# 55 files, 343 passed
# node_modules is a symlink — do not npm install
```

Locks: `SELF_APPROVAL_DENIED`, `CALLER_ASSERTED_IDENTITY_REJECTED` (all four keys, approve+reject), refused store fallback without invoking the writer, CLI source uses `applyCliApprovalStoreFallback`.

## 5. Residual gaps (not closed)

| ID | Residual |
|----|----------|
| RR-W5-01 remainder | V3 daemon `approvals.approve` still takes `actor` from IPC payload (`daemon.ts`). Privileged IPC token path is unchanged. This cut closes the **CLI filesystem fallback** only. |
| RR-W5-02 remainder | M11 `authorizationFor` still cites ledger `approval.decided` without HUMAN ≠ executor. Frozen port not extended. |
| RR-W5-04 / F14 | Glob prefixes are not realpath'd. V3 `denied_paths` `startsWith` unchanged. Provenance still cites policy **id** not version/epoch. |
| F02 overall | **PARTIALLY MITIGATED** on the V4 PDP + V4-posture CLI fallback. Not closed wherever the V3 daemon actor string remains authoritative. |

## 6. Delivery self-check

| Criterion | Status |
|-----------|--------|
| RR-W5-01 CLI store fallback refused when `V4_CLI_STORE_FALLBACK === false` | Met |
| Token-derived operator identity; SELF_APPROVAL_DENIED tests kept/extended | Met |
| Caller-asserted `actor` not treated as authority; no frozen `decided_by` | Met |
| Optional partial F14 realpath on M10 path checks | Met (partial) |
| No contract thaw / M09 / V3.7 cert / trust scores / APPROVED / merge | Met |
| Wiki grounding | GAP (`WIKI_ROOT` unset) |

**Status: DELIVERED for orchestrator / independent review.** M10 does not mark this cut ACCEPTED.
