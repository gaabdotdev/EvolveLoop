# V3.5 Operational Acceptance Matrix

**Evidence commit base:** `07973fe` (tag `v3.5-runtime`) + hardening `6fa971f` + live-E2E follow-up commits  
**Battery:** 57 tests PASS (`v35-*` + `v35-op-*`) on 2026-11-12  
**Live E2E run:** `live-e2e-1794526866904` — evidence under `docs/v3.5/evidence/live-e2e/`

| Gate | Criterion | State | Evidence |
|------|-----------|-------|----------|
| **S** | Live bubblewrap isolation | PASS | `v35-op-sandbox-adversarial`, `live-e2e/02-sandbox.json` |
| **S** | Escape (path/symlink/outside write) | PASS | adversarial suite + live primary write denied |
| **S** | Network deny | PASS | unshare-net tests |
| **S** | Fail-closed no host fallback | PASS | unavailable backend + missing workspace |
| **S** | Timeout / process tree cancel | PASS | timeout + cancelProcessTree grandchild |
| **S** | Resource limits honesty | PASS | RLIMIT_AS/CPU via prlimit; NPROC **not** claimed |
| **H** | Consent gate dry-run | PASS | `v35-op-harness-consent` |
| **H** | Contract matrix honest | PASS | harness inspect |
| **H** | Real LLM engineering body | **PASS** | `cursor-agent` session auth; implement session `sess-fd89575d-…`; real `applyDiscounts` diff; `live-e2e/03-harness-implement.json`, `04-implement-verify.json` |
| **C** | CLI close ≠ stop service | PASS | op-coordinator-crash + `live-e2e/05-continuity.json` |
| **C** | SIGKILL + restart reconcile | PASS | op-coordinator-crash |
| **C** | Invalid IPC token rejected | PASS | op-coordinator-crash / cross-component |
| **C** | Duplicate leader blocked | PASS | LEADER_EXISTS |
| **W** | Real git worktree lifecycle | PASS | `v35-op-git-worktrees` + live worktree |
| **W** | Ownership concurrency | PASS | claim conflict |
| **W** | Merge + real post-merge tests | PASS | npm test/build/typecheck discovery — **not** `node -e exit 0` |
| **W** | Rollback to checkpoint | PASS | git HEAD restored (`live-e2e/10-rollback.json`) |
| **W** | Failed merge preserves tip | PASS | cross-component |
| **A** | Concurrent decideOnce | PASS | op-approvals-concurrency |
| **A** | Scope/replay/expire | PASS | op-approvals + live scope/replay deny |
| **A** | Pending survives restart / CLI reconnect | PASS | IPC list after reconnect (`08-approval-decision.json`) |
| **E2E** | Integrated stack | PASS | prior op-e2e + **live** `FINAL.json` gates E2E=PASS |
| **E2E** | LLM code gen | **PASS** | authenticated `agent`/`cursor-agent`; no deterministic solver on live path |
| **R** | Build/tsc | PASS | `npm run build` |
| **R** | Op battery | PASS | 57/57 |
| **R** | Live post-merge + criteria | PASS | integrated `f796fc88…`; post_merge overall PASS |
| **R** | Tags preserved | PASS | `v3-complete`, `v3.5-runtime` untouched |

## Global verdict

Operational gates **S, H, C, W, A, E2E, R** = **PASS** after live authenticated harness run.

Do **not** reclassify without correlated evidence under `docs/v3.5/evidence/live-e2e/`.
