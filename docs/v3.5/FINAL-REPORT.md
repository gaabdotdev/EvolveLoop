# EvolveLoop V3.5 — Final Report

## 1. Base preserved

| Item | Value |
|------|-------|
| Tag | `v3-complete` |
| Commit | `6b69c3f8dfde36b0f0282accff3aae3595dcc6fd` |
| Branch | `feature/v3.5-runtime` (worktree; does not incorporate `feature/bench-obs-v1`) |
| Tag `v3.5-runtime` | `07973fe…` (immutable) |
| Hardening | `6fa971f` + subsequent live-E2E commits |

## 2. Architecture implemented

See `ARCHITECTURE.md`. Core V3 contracts reused; new runtime layers: security profiles, bubblewrap sandbox, daemon+IPC, approvals, workspace ownership/integration, harness facade, CLI groups.

## 3. Sandbox

- Backend: **bubblewrap** (ADR-V35-0002)
- Threats covered: path escape, symlink content leak, outside write, network deny, env clear, missing backend fail-closed
- Not claimed: perfect kernel security, Windows/macOS

## 4. Harnesses

| Adapter | Path | Classification |
|---------|------|----------------|
| cursor | ExecutionBridge/jobs | PARTIAL / dry_run — not full IDE control |
| claude-code | CLI process | dry_run default; real_eligible with consent+CLI |
| codex | CLI | blocked if absent |
| antigravity | CLI (`agent`/`cursor-agent`) | **real_eligible** with session auth + consent; argv fixed for cursor-agent |

## 5. Coordinator

- `CoordinatorDaemon` + Unix IPC + leader lock + lifecycle FSM
- Proof: detached `evolve service start` continues after client exit; live E2E reconnect

## 6. Workspace

- OwnershipLedger conflict detection
- IntegrationCoordinator register/integrate/rollback
- Human dirty preserved in E2E

## 7. Approvals

- Persistent store + broker; scoped consume; expire/reject/replay denied
- Live: `git.mutate` integrate approval with CLI close/reconnect

## 8. Tests

| Suite | Result |
|-------|--------|
| `v35-security` | PASS |
| `v35-sandbox` | PASS |
| `v35-lifecycle-approvals` | PASS |
| `v35-coordinator-daemon` | PASS |
| `v35-e2e-runtime` | PASS |
| `v35-op-*` | PASS |
| **Total** | **57/57 PASS** |

## 9. Acceptance

See `OPERATIONAL-ACCEPTANCE-MATRIX.md` — gates **S/H/C/W/A/E2E/R = PASS** after live LLM E2E.

## 10. Real vs mock (updated after live E2E)

| Real | Simulated / blocked |
|------|---------------------|
| bubblewrap exec | — |
| daemon IPC + SIGKILL recovery | — |
| git worktree create/merge/rollback | — |
| post-merge npm test/build/typecheck | — |
| approvals concurrency + restart | — |
| **cursor-agent LLM implement + ask review** | Claude auth still loggedOut (unused) |
| E2E engineering stack with LLM body | deterministic shout patch only in *non-live* op-e2e fallback |

## 11. Remaining limitations

See `LIMITATIONS.md`. Wiki corpus still lacks indexed V3.5 notes (`GAP: no_hits`).

## 12. Knowledge grounding

`knowledge_grounding: applied with GAP — karpathyWiki hybrid search no_hits for V3.5; proceeded with ADRs + code + live evidence.`
