# ADR-V35-0004 — Process supervision & PID reuse

**Status:** Accepted  
**Date:** 2026-11-12

## Decision

- Core-owned spawns use `detached: true` (own PGID).
- Persist `pid`, `pgid`, `/proc/<pid>/stat` starttime.
- Cancel: `kill(-pgid, SIGTERM)` then SIGKILL if still same identity.
- Refuse kill when starttime mismatches (PID reuse).
- Reconcile loop marks gone/reused sessions.

## Limitation

IDE-attached sessions remain host-owned — not claimed.
