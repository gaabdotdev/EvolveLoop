# ADR-V35-0003 — Persistent Coordinator daemon & IPC

**Status:** Accepted  
**Date:** 2026-11-12

## Context

V3 `CoordinatorService.start()` only persisted PID; CLI closing or process exit stopped work. Spec requires service independent of TUI/CLI.

## Decision

- `CoordinatorDaemon` owns lifecycle FSM: STOPPED→STARTING→RUNNING↔DEGRADED→STOPPING→STOPPED; CRASHED/RECOVERING on failure/restart.
- Unix domain socket IPC under `--data-dir/coordinator/ipc.sock` with token file mode 0600.
- Leader lock with PID + `/proc` starttime fencing.
- `evolve service start` spawns detached foreground child; `install` writes systemd --user unit template.
- Fallback: foreground supervision when systemd unavailable.

## Non-claims

- Does not run while machine is powered off/suspended.
- Exactly-once not promised (ADR-V3-0006 still holds).

## Tests

`tests/integration/v35-coordinator-daemon.test.ts` — IPC, duplicate leader, detached CLI child.
