# META M15 — Wave 5 F02 residual (V3 daemon actor)

| Field | Value |
|-------|-------|
| Meta | M15 — Control Center, CLI, SDK & APIs (F02 daemon residual only) |
| Wave | 5 — V4.3 Trust (RR-W5-01 remainder) |
| Worktree / branch | `/home/gaab/Downloads/EvolveLoop-v4-m15` · `feature/v4/m15-f02-daemon` |
| Baseline | `feature/v4-integration` ≥ `fb68396` (includes M10-full INTEGRATED `04a104b`) |
| Freeze | contracts **FROZEN** — `PolicyDecision` 1.0.0 not thawed; no `decided_by` RFC |
| Ownership | `orchestrator/src/v4/api/**`; narrow `approvals.approve` / `approvals.reject` in `orchestrator/src/v3/coordinator/daemon.ts` |
| Co-own | M10 CLI `applyCliApprovalStoreFallback` — **not regresssed** |
| Merge to `feature/v4-integration` | **Not done** (forbidden) |
| npm install | **Not run** (`orchestrator/node_modules` is a symlink) |
| V3.7 cert edits | **None** |
| Catalog / `contracts/**` edits | **None** |
| Self-assessed status | **DELIVERED for orchestrator / independent review** — M15 does not mark itself ACCEPTED or APPROVED |
| Knowledge | Wiki GAP (`WIKI_ROOT` / `RAG_REPO_ROOT` unset) |

## 1. Commits

On `feature/v4/m15-f02-daemon` (no merge to integration):

| Hash | Message |
|------|---------|
| *(engine SHA stamped after first landing)* | feat(v4/m15): refuse V3 daemon actor under V4 posture (F02) |

Engine commit above is the implementation + tests + this record as first landed. Follow-up stamps that SHA. Orchestrator tip = `git rev-parse feature/v4/m15-f02-daemon`.

## 2. What was implemented

| Piece | Role |
|-------|------|
| `F02_DAEMON_ACTOR_REFUSED` | Stable fail-closed code for daemon IPC approve/reject |
| `applyDaemonApprovalActorWrite` | Gate: when `V4_CLI_STORE_FALLBACK === false`, the V3 `write(actor)` callback is **never** invoked |
| Default `"cli"` | Treated as asserted-by-omission — omitting `params.actor` still refuses |
| Token path | `operator_token` without identity keys is routed to `V37PolicyAdapter` when an adapter is supplied; the live daemon does **not** construct a PDP and therefore still fail-closes (honest) |
| `daemon.ts` approve/reject | Narrow wrap only; rest of V3 daemon unchanged |
| CLI store fallback | Unchanged; still `applyCliApprovalStoreFallback` → `F02_STORE_FALLBACK_REFUSED` |

`decided_by` remains M10-local on V4 `Approval` from `AuthenticatedPrincipal`. Frozen `PolicyDecision` 1.0.0 is **not** extended.

## 3. Honesty pins

- No trust / reputation scores.
- No M09 Adaptive / score routing.
- No V3.7 certification edits.
- No contract thaw (R4).
- No APPROVED / self-ACCEPTED / merge.
- Privileged IPC token (`ipc.privileged.token`) is **not** treated as operator identity.

## 4. Tests

```bash
cd orchestrator && npx vitest run tests/v4/api tests/v4/policy/f02-self-approve.test.ts
# 2 files, 22 passed (10 F02 daemon + 12 M10 F02 CLI/policy)
cd orchestrator && npx vitest run tests/v4
# 56 files, 353 passed
# node_modules is a symlink — do not npm install
```

Recorded against this cut. Prior Wave 5 M10-full note was 55 files / 343 passed — delta is this file's 10 tests.

Locks: daemon approve with `actor` / default `"cli"` refused without invoking the writer; live IPC leaves V3 record `PENDING`; token-only + adapter records HUMAN `decided_by`; asserted identity keys refused even with token+adapter; CLI `applyCliApprovalStoreFallback` still present.

H02 privileged-method split (`tests/unit/sec-h02-ipc-privileged.test.ts`) still green (3 passed) — authorize-then-handler; handler now fail-closes F02 instead of writing `actor`.

## 5. Residual gaps (not closed)

| ID | Residual |
|----|----------|
| RR-W5-01 remainder (this cut) | Live V3 daemon is not wired to `V37PolicyAdapter`; token-only IPC still fail-closes rather than completing a V4 approve. Privileged IPC token path (same-UID file) is unchanged. |
| V3 e2e | `tests/integration/v35-op-e2e-engineering.test.ts` still calls `ipcCall(..., "approvals.approve", { actor: "operator-cli" })`. That path now returns `F02_DAEMON_ACTOR_REFUSED` — fail-closed is the control, not a V4 PDP regression. Not edited (outside M15 narrow ownership). |
| RR-W5-02 remainder | M11 `authorizationFor` still cites ledger `approval.decided` without HUMAN ≠ executor. Frozen port not extended. |
| F02 overall | **PARTIALLY MITIGATED** on V4 PDP + V4-posture CLI fallback + V4-posture daemon actor write. Not globally closed: no authenticated remote Control Center; daemon has no in-process V4 adapter. |

## 6. Delivery self-check

| Criterion | Status |
|-----------|--------|
| Daemon approve/reject with asserted actor refused when `V4_CLI_STORE_FALLBACK === false` | Met |
| `write(actor)` never invoked under V4 posture | Met |
| Token/authn path preferred over thawing `PolicyDecision.decided_by` | Met (adapter route in api helper; live daemon fail-closes without PDP) |
| `applyCliApprovalStoreFallback` not regresssed | Met |
| No contract thaw / M09 / V3.7 cert / trust scores / APPROVED / merge | Met |
| Wiki grounding | GAP (`WIKI_ROOT` unset) |

**Status: DELIVERED for orchestrator / independent review.** M15 does not mark this cut ACCEPTED.
