# LIMITATION — Custom Workbench / full Ink redesign (M07)

**Status:** deferred  
**Why:** M07 delivers Work-centric CLI + shared state bridge. A visual Custom Workbench or full Ink TUI redesign would imply product UX maturity that is not evidenced (human usability N=0 from V4.3).

## What exists instead

- `evolve work list|status|show|attempts`
- `evolve mode simple|advanced` preference
- `readSharedWorkState` / `workStatusForTui` for CLI+TUI parity on Work projections
- Help layers: Simple = `evolve help`; Advanced = `evolve help advanced`

## Forbidden claims

- Do not claim a Custom Workbench UI shipped in M07
- Do not claim usability validated with human subjects (N=0)
- Do not invent a second Work store for the TUI
