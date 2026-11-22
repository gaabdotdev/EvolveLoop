# §22.11 Adapters Runtime Probe — gate note

- **ts:** 2026-11-22T01:13:16.421Z
- **consent:** `False` (live spawn NOT claimed)
- **vitest:** `raw/adapters-vitest.txt` exit=`0`
- **probe:** `raw/adapters-runtime-probe.json` exit=`0`

## Inventory

| adapter | catalog bridge | can_invoke | invoke | code | honesty |
|---------|----------------|------------|--------|------|---------|
| `cursor` | `jobs_pickup` | True | `failed` | `IR_PATH_REQUIRED` | jobs_pickup (cursor-skill) — invoke without ir_path fails closed; no live IDE API claimed |
| `claude-code` | `cli_process` | True | `accepted` | `DRY_RUN_PROMPT_WRITTEN` | cli_process declared; dry-run prompt path exercised when CLI present, else blocked |
| `codex` | `none` | False | `blocked` | `ADAPTER_DRIVER_BLOCKED` | catalog bridge=none; driver blocked (CLI absent) — capabilities not over-claimed |
| `antigravity` | `none` | True | `accepted` | `DRY_RUN_PROMPT_WRITTEN` | catalog declares bridge=none (conservative/declared); driver can dry-run when CLI present  |

## CLI probes

| cli | available | path |
|-----|-----------|------|
| `claude` | True | `/home/gaab/.local/bin/claude` |
| `codex` | False | `—` |
| `antigravity` | True | `/home/gaab/.local/bin/agent` |
| `cursor-agent` | True | `/home/gaab/.local/bin/agent` |

## Verdict

**CONCLUÍDA** — capabilities distinguished in catalog; contract tests + honest dry-run/blocked probes for declared runtimes (no live consent).
