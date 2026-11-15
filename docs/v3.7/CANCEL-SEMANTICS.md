# Cancel semantics — Worker Runtime + leases

## Purpose

Define what EvolveLoop **guarantees** and **does not guarantee** when a lease/task is cancelled while a worker may be executing under `SandboxManager.exec` (bubblewrap) or the explicit host path.

## Model

```
Operator / CP cancelTask
        │
        ├─► LeaseManager.revoke(lease_id)     // fencing: late commit → lease_revoked
        ├─► pending deliver waiters → task.result_rejected
        └─► if worker socket live → push task.cancel
                    │
WorkerRuntime.cancel(task_id)
        │
        ├─► mark cancelledTasks
        └─► AbortController.abort()
                    │
        SandboxManager / host spawn
                    │
                    ├─► SIGTERM to process group
                    └─► after cancel_grace_ms / force_after_ms → SIGKILL
```

1. `WorkerRuntime.cancel(task_id)` marks the task cancelled and aborts the associated `AbortSignal`.
2. Sandbox path (`SandboxManager` / bubblewrap): abort → `SIGTERM` to process group, then `SIGKILL` after `cancel_grace_ms` (default from contract `cancel_policy`).
3. Host path (`sandbox_profile=none`): same signal escalation against the detached process group.
4. Control Plane `cancelTask` **revokes** the lease and optionally pushes `task.cancel` to a connected worker. Late `task.result` fails fencing with `lease_revoked`. A disconnected worker still loses commit authority even if `cancel_pushed=false`.

## Covered scenarios (tests)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Cancel before start (`AbortSignal` already aborted / pre-marked) | `status=cancelled`, no successful commit |
| 2 | Cancel during sandbox/host execution | Process group TERM→KILL; `status=cancelled`; `tree_state=killed` |
| 3 | Cancel near natural completion | Race: `cancelled` if abort wins; `completed` only if exit observed first (honest) |
| 4 | Process ignores first SIGTERM | Escalation to SIGKILL; still `cancelled` |
| 5 | Cancel force timeout | Kill lands within `force_after_ms` / `cancel_grace_ms` bound |
| 6 | Worker disconnected during cancel | `cancel_pushed=false`, lease `revoked`, fencing rejects submit |
| 7 | Publish result after cancel | `assertFencing` → `lease_revoked` (no successful commit) |

## Guarantees (Linux + bubblewrap / host path)

| Guarantee | Scope |
|-----------|--------|
| Cancel before spawn | `status=cancelled` / aborted_before_start |
| Cancel during exec | Process group receives TERM then KILL; result `cancelled` when cancel wins |
| Late result after lease revoke | Fencing → `lease_revoked` (no successful commit) |
| Offline worker | Lease revoke is authoritative; push is best-effort |
| Host env scrub | Host path does not inherit full `process.env` |

## Non-guarantees / platform limits

- Perfect kill of processes that escape the bwrap namespace / remount host PID namespace (requires kernel compromise or misconfigured profile).
- Cross-platform parity: macOS/Windows lack bubblewrap; cancel there is host-path only.
- Network-disconnected worker receiving `task.cancel` in real time — lease revoke still blocks commit when/if it reconnects with the revoked lease.
- Orphans outside the process group (e.g. double-fork that leaves the PGID) are not claimed killed; Linux bwrap + `detached` PGID is the intended containment.
- Race near natural exit: observing `completed` when the process exited milliseconds before kill is **honest**, not a fencing failure — CP revoke still blocks acceptance if the lease was already revoked before result commit.

## Platform note

Cancellation of sandboxed work is proven on Linux with bubblewrap available. Without bwrap and with `require_os_sandbox`, execution fail-closes before cancel applies.
