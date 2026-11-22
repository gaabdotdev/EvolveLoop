# ADR-V3-0002 — Authority, workspace, and shell hardening

**Status:** Accepted  
**Date:** 2026-11-11  
**Related:** Master v0.6 §5.5, §5.10, §20.7 R2–R4

## Context

Static audit confirmed:

- Unknown capabilities can fall through to permissive allow paths.
- Workspace confinement is lexical (`path.resolve` prefix); FS APIs follow symlinks.
- `shellExecute` uses `shell: true` and inherits full `process.env`.

## Decision

### Authority

1. Deny unknown / unclassified capabilities (`unknown_capability_denied`).
2. Explicit allowlist for deterministic read-only capabilities (e.g. `filesystem.read`, `filesystem.list`, `filesystem.search`, `git.inspect`, and other documented inspect caps).
3. Keep shell/write/network/host-inspect behind explicit context grants.
4. If `targetPath` is provided without `workspaceRoot` → deny (`workspace_root_required`).

### Workspace paths

1. Resolve workspace root with `realpath` when it exists.
2. For existing targets, compare `realpath(target)` against real workspace root.
3. For non-existent targets, validate parent realpath confinement (no symlink escape via final component).
4. Apply the same helpers in `paths.ts` used by deterministic FS/shell.

### Shell

1. Default environment is a **scrubbed allowlist** (PATH, locale, temp, user identity basics) — not a full copy of `process.env`.
2. Optional explicit `env` overlay may add keys only when caller passes an allowlist-approved map (no silent merge of secrets).
3. Retain timeout kill of the spawned process; document that full process-tree isolation remains a later milestone (not claimed done here).
4. Keep `shell: true` for compatibility of the existing capability contract, but treat broader sandbox (namespaces/cgroups) as follow-up — do not advertise OS sandbox.

## Consequences

- Some previously “accidentally allowed” capabilities will deny until listed.
- Tests must cover symlink escape and env scrubbing.
- External agent harnesses remain incompletely mediated; adapters must declare that limitation.

## Follow-ups (not in this ADR’s first patch)

- TOCTOU-resistant open (`O_NOFOLLOW` / `openat`) on all stores
- Process group kill on timeout
- Network policy enforcement beyond capability flags
