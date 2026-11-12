# V3.5 Operational Acceptance Matrix

**Evidence commit base:** `07973fe` (tag `v3.5-runtime`) + subsequent hardening commits  
**Battery:** 57 tests PASS (`v35-*` + `v35-op-*`) on 2026-11-12

| Gate | Criterion | State | Evidence |
|------|-----------|-------|----------|
| **S** | Live bubblewrap isolation | PASS | `v35-op-sandbox-adversarial`, `sandbox.status.op.json` |
| **S** | Escape (path/symlink/outside write) | PASS | adversarial suite |
| **S** | Network deny | PASS | unshare-net tests |
| **S** | Fail-closed no host fallback | PASS | unavailable backend + missing workspace |
| **S** | Timeout / process tree cancel | PASS | timeout + cancelProcessTree grandchild |
| **S** | Resource limits honesty | PASS | RLIMIT_AS/CPU via prlimit; NPROC **not** claimed |
| **H** | Consent gate dry-run | PASS | `v35-op-harness-consent` |
| **H** | Contract matrix honest | PASS | harness inspect |
| **H** | Real LLM engineering body | **BLOCKED** | `harness.auth.probe.json` — Claude not logged in; no CURSOR_API_KEY |
| **C** | CLI close ≠ stop service | PASS | op-coordinator-crash |
| **C** | SIGKILL + restart reconcile | PASS | op-coordinator-crash |
| **C** | Invalid IPC token rejected | PASS | op-coordinator-crash / cross-component |
| **C** | Duplicate leader blocked | PASS | LEADER_EXISTS |
| **W** | Real git worktree lifecycle | PASS | `v35-op-git-worktrees` |
| **W** | Ownership concurrency | PASS | claim conflict |
| **W** | Merge + real post-merge tests | PASS | npm test/build discovery — **not** `node -e exit 0` |
| **W** | Rollback to checkpoint | PASS | git HEAD restored |
| **W** | Failed merge preserves tip | PASS | cross-component |
| **A** | Concurrent decideOnce | PASS | op-approvals-concurrency |
| **A** | Scope/replay/expire | PASS | op-approvals-concurrency |
| **A** | Pending survives restart | PASS | IPC list after restart |
| **E2E** | Integrated stack | PASS | `v35-op-e2e-engineering` + `evidence/v35-op-e2e.json` |
| **E2E** | LLM code gen | BLOCKED | auth; deterministic shout patch labeled simulated |
| **R** | Build/tsc | PASS | `npm run build` |
| **R** | Op battery | PASS | 57/57 |
| **R** | Tags preserved | PASS | `v3-complete`, `v3.5-runtime` untouched |

## Global verdict

Operational gates **S, C, W, A, E2E(stack), R** = **PASS**.  
Gate **H (real LLM body)** = **BLOCKED** on external auth — consent/contracts PASS.

Do **not** reclassify BLOCKED → PASS without authenticated harness evidence.
