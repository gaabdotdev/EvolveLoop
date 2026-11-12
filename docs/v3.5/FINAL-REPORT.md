# EvolveLoop V3.5 — Final Report

## 1. Base preserved

| Item | Value |
|------|-------|
| Tag | `v3-complete` |
| Commit | `6b69c3f8dfde36b0f0282accff3aae3595dcc6fd` |
| Branch | `feature/v3.5-runtime` (worktree; does not incorporate `feature/bench-obs-v1`) |

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
| antigravity | CLI (`agent`/`antigravity`) | probe/dry_run |

## 5. Coordinator

- `CoordinatorDaemon` + Unix IPC + leader lock + lifecycle FSM
- Proof: detached `evolve service foreground` continues after client exit (`v35-coordinator-daemon.test.ts`)
- Restart recovery in E2E

## 6. Workspace

- OwnershipLedger conflict detection
- IntegrationCoordinator register/integrate/rollback
- Human dirty preserved in E2E

## 7. Approvals

- Persistent store + broker; scoped consume; expire/reject/replay denied

## 8. Tests

| Suite | Result |
|-------|--------|
| `v35-security` | PASS |
| `v35-sandbox` | PASS |
| `v35-lifecycle-approvals` | PASS |
| `v35-coordinator-daemon` | PASS |
| `v35-e2e-runtime` | PASS |
| Pre-existing `v22-p0-*` tiktoken | FAIL (env missing tiktoken — not V3.5 regression) |

## 9. Acceptance

See `ACCEPTANCE-MATRIX.md` — gates S/H/C/W/A/O/E2E/R = PASS (pre-tag).

## 10. Real vs mock (updated after operational validation)

| Real | Simulated / blocked |
|------|---------------------|
| bubblewrap exec (Debian mounts fixed) | LLM harness task body — **BLOCKED** (auth) |
| daemon IPC + SIGKILL recovery | — |
| git worktree create/merge/rollback | — |
| post-merge npm test/build discovery | — |
| approvals concurrency + restart | — |
| E2E engineering stack | shout() patch deterministic when LLM blocked |

## 11. Remaining limitations

See `LIMITATIONS.md`. Wiki grounding GAP (`WIKI_ROOT` unset).

## 12. Knowledge grounding

`knowledge_grounding: GAP — WIKI_ROOT unset; proceeded with repo ADRs + code audit.`
