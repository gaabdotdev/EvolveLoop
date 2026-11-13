# ADR-V36-0008 — Operations Center CLI/TUI

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

CLI groups: `project`, `workflow`, `scheduler`, `resources`, `operations` via `evolve` + `--ops-dir`. TUI (`operations tui`) reads durable ops state — no parallel SSOT. Destructive cancel requires confirmation (`cancel!`). Closing TUI does not stop CoordinatorDaemon.
