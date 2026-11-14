# Install / CLI / Doctor / Operations (G19)

## Doctor smoke (local tip)

Summary sample: pass=16, fail=0, warning=2+, blocked=1+, unavailable=2+

Non-PASS expected in this environment:

| Check | Status | Reason |
|-------|--------|--------|
| wiki_vault | BLOCKED | WIKI_ROOT unset |
| graphify_cli | UNAVAILABLE | CLI absent |
| harness_os_sandbox | WARNING | harness outside bwrap by default |
| control_plane_dual_evolve | WARNING unless env/CLI set | dual surfaces |
| harness_claude_auth | BLOCKED | not logged in |
| coordinator_ipc | UNAVAILABLE | daemon not started |

`approval_broker_production` = **PASS** via live probe.

## Hard gates

- Wiki unset → BLOCKED (never PASS)
- Graphify absent → UNAVAILABLE / test skip (never empty PASS)
- Grill-me / image-to-code remain in matrix; not removed

## Local-first

Core/daemon/sandbox paths operate without remote APIs. Live harness requires consent + provider auth — dry-run default.
