# EvolveLoop V3.5 — Acceptance Matrix

**Base commit:** `6b69c3f8dfde36b0f0282accff3aae3595dcc6fd` (`v3-complete`)  
**Evidence date:** 2026-11-12  
**States:** PASS | FAIL | BLOCKED | NOT_RUN

## Gate S — Secure Execution

| Criterion | State | Evidence |
|-----------|-------|----------|
| OS sandbox (Linux bubblewrap) | PASS | `tests/unit/v35-sandbox.test.ts`; ADR-V35-0002 |
| No silent host fallback | PASS | SandboxManager blocked path; unavailable backend test |
| Path/symlink/outside write blocked | PASS | sandbox adversarial tests |
| Network deny-by-default | PASS | `--unshare-net` + getent test |
| Env allowlist / clearenv | PASS | bubblewrap `--clearenv` args test |
| Worktree ≠ sandbox documented | PASS | ARCHITECTURE.md + WorktreeManager LIMITATIONS |

## Gate H — Harness Runtime

| Criterion | State | Evidence |
|-----------|-------|----------|
| Adapter contract + matrix levels | PASS | `normalizeCapabilityLevel`; harness inspect |
| Session lifecycle persisted | PASS | ProcessSessionStore starttime/pgid |
| Dry-run ≠ real spawn | PASS | CliProcess consent gate |
| ≥2 real harness paths when available | PASS* | cursor jobs_pickup + claude cli_process (host has `claude`+`cursor`); live LLM body may be BLOCKED without consent/API |
| IDE full control not claimed | PASS | catalog/docs limitations |

\* Live LLM execution remains consent/credential gated — probes PASS; forged PASS forbidden.

## Gate C — Coordinator

| Criterion | State | Evidence |
|-----------|-------|----------|
| Service independent of CLI | PASS | `v35-coordinator-daemon.test.ts` detached child |
| Durable state + heartbeat | PASS | daemon.json |
| IPC token-protected | PASS | ipc unauthorized path |
| Leader lock / no duplicate | PASS | LEADER_EXISTS test |
| Lifecycle FSM | PASS | `v35-lifecycle-approvals.test.ts` |
| Restart reconcile | PASS | E2E restart |

## Gate W — Workspace & Change Management

| Criterion | State | Evidence |
|-----------|-------|----------|
| Ownership / concurrent conflict | PASS | OwnershipLedger tests + E2E |
| Human dirty preserved | PASS | E2E HUMAN.md |
| Integration + rollback APIs | PASS | IntegrationCoordinator |
| Worktree remains non-sandbox | PASS | docs |

## Gate A — Approval & Policy

| Criterion | State | Evidence |
|-----------|-------|----------|
| Persistent requests | PASS | ApprovalStore |
| Scoped consume / no replay | PASS | unit tests |
| Expire/reject/cancel | PASS | unit tests |
| Policy require_approval | PASS | ApprovalBroker |

## Gate O — Operations

| Criterion | State | Evidence |
|-----------|-------|----------|
| CLI service/runtime/sandbox/harness/workspace/approvals | PASS | `v35-commands.ts` + help groups |
| runtime doctor | PASS | `runtime/doctor.ts` |
| TUI remains non-SSOT | PASS | still reads data-dir / IPC |

## Gate E2E — Integrated Engineering Runtime

| Criterion | State | Evidence |
|-----------|-------|----------|
| Scenario section 11 (fixture) | PASS | `tests/integration/v35-e2e-runtime.test.ts` |
| Real vs simulated labeled | PASS | evidence JSON fields |

## Gate R — Release

| Criterion | State | Evidence |
|-----------|-------|----------|
| build (tsc) | PASS | `npm run build` |
| V3.5 unit+integration tests | PASS | vitest suites above |
| ADRs | PASS | `docs/v3.5/adr/` |
| Gap analysis | PASS | IMPLEMENTATION_GAP_ANALYSIS.md |
| Tag v3.5 | PENDING | create only after this matrix all mandatory PASS on release commit |

## Overall mandatory gates

| Gate | State |
|------|-------|
| S | PASS |
| H | PASS |
| C | PASS |
| W | PASS |
| A | PASS |
| O | PASS |
| E2E | PASS |
| R | PASS (pre-tag) |
