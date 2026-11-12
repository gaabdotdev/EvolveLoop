# V3.5 Harness Capability Matrix

Levels: `SUPPORTED` | `PARTIAL` | `PROBE_ONLY` | `DRY_RUN` | `BLOCKED` | `UNSUPPORTED`

Inspect live: `evolve harness inspect --adapter <id> --data-dir …`

| Adapter | Bridge | Typical execution_path | Notes |
|---------|--------|------------------------|-------|
| cursor | jobs_pickup | dry_run | ExecutionBridge/JobStore; **not** full IDE session control |
| claude-code | cli_process | dry_run / real_eligible* | Requires `claude` on PATH + `EVOLVELOOP_HARNESS_CONSENT=true` for real |
| codex | cli_process | blocked / dry_run | Requires `codex` on PATH |
| antigravity | cli_process | dry_run / probe | Probes `antigravity` or `agent` |

\* Real spawn is environment-dependent. Absence of credentials/CLI → classify honestly, never forge PASS.

## Process sessions

Core-owned sessions persist under `--data-dir/process-sessions` with pid/pgid/starttime. Cancel uses process group + starttime fencing.
