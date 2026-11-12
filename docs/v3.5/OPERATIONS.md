# V3.5 Operations

All commands require `--data-dir <path>`.

```bash
# Service
evolve service install --data-dir ./v35-data
evolve service start --data-dir ./v35-data
evolve service status --data-dir ./v35-data
evolve service logs --data-dir ./v35-data
evolve service stop --data-dir ./v35-data
evolve service restart --data-dir ./v35-data
# Foreground (no systemd)
evolve service foreground --data-dir ./v35-data

# Runtime
evolve runtime doctor --data-dir ./v35-data
evolve runtime status --data-dir ./v35-data
evolve runtime recover --data-dir ./v35-data

# Sandbox
evolve sandbox status --data-dir ./v35-data
evolve sandbox profiles --data-dir ./v35-data

# Harness
evolve harness list --data-dir ./v35-data
evolve harness inspect --adapter claude-code --data-dir ./v35-data
evolve harness sessions --run <work_id> --data-dir ./v35-data

# Approvals
evolve approvals list --data-dir ./v35-data
evolve approvals inspect --id <apr-…> --data-dir ./v35-data
evolve approvals approve --id <apr-…> --data-dir ./v35-data
evolve approvals reject --id <apr-…> --data-dir ./v35-data

# Workspace
evolve workspace list --run <work_id> --data-dir ./v35-data
evolve workspace inspect --id <ws> --data-dir ./v35-data
```

Closing CLI/TUI does not stop `service start` daemon.
