# Cancel mid-flight protocol E2E — AUD-V37B-05

**Status:** PASS (protocol E2E reproduced)  
**Date (UTC):** 2026-11-15T12:21:36Z  
**Branch:** recovery/v37-full-cert  
**Pre-commit tip at evidence draft:** `d6b3f8410afb3debb1ca7c41ddeae038337c5f08` (evidence re-pinned after commit)  
**Test file:** `orchestrator/tests/unit/fabric/cancel-protocol-e2e.test.ts`  
**Implementation:** `orchestrator/src/v3/fabric/worker-runtime/protocol-loop.ts` + `cancelTask` + SandboxManager AbortSignal

## Environment

- OS: Linux 6.12.88+deb13-amd64
- Node: v22.15.0
- bubblewrap: bubblewrap 0.11.0
- Host: gaab

## Flow proven

`Control Plane.cancelTask` → protocol `task.cancel` → `WorkerRuntime.cancel` → AbortSignal → SandboxManager/host TERM→KILL → `task.result` / pending `result_rejected` → lease `revoked` → fencing denies late `submit_result`

## Commands

```bash
cd orchestrator
npm run build
npx vitest run tests/unit/fabric/cancel-protocol-e2e.test.ts
```

## Scenario results (2026-11-15 local run)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Cancel before start | PASS |
| 2+5+7+8 | Mid-flight + ignore TERM + late fence + double cancel | PASS (PID gone from /proc) |
| 3 | Near completion (honest race) | PASS |
| 4 | Ignore SIGTERM → force kill | PASS |
| 6 | Worker disconnect during cancel | PASS (`cancel_pushed=false`, fence holds) |
| sandbox | bubblewrap SandboxManager cancel over protocol | PASS |
| 9 | Cancel sibling; other task `result_accepted` | PASS |

**Vitest:** 7 passed / 0 failed / 0 unhandled errors (post safeSend fix)

## Integrity checks

- Late commit after revoke → `lease_revoked`
- Unrelated lease not corrupted (scenario 9)
- Double cancel stays `revoked`
- Real Node child processes (not mocked AbortSignal-only)

## Residual / limits

See `docs/v3.7/CANCEL-SEMANTICS.md` non-guarantees (namespace escape, platform parity).
