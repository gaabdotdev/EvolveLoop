# ADR-V35-0002 — Sandbox backend: bubblewrap (Linux)

**Status:** Accepted  
**Date:** 2026-11-12

## Context

Need OS sandbox without inventing kernel isolation. Host audit found `/usr/bin/bwrap`, cgroup v2, unprivileged process.

## Decision

- Primary Linux backend: **bubblewrap** (`bwrap`).
- Composition: `--die-with-parent`, `--new-session`, `--unshare-net` (deny), RO binds for `/usr`/`/bin`/`/lib`/`/etc`, RW bind for workspace only, `--clearenv` + allowlist, `--proc`/`--dev`/`tmpfs`.
- Interface `SandboxBackend` allows future OS backends; unsupported platforms use `unavailable` (fail-closed).
- Do **not** announce Windows/macOS support.

## Alternatives considered

| Option | Why not now |
|--------|-------------|
| Rootless OCI (podman) | Heavier dependency; optional later |
| Landlock alone | Incomplete FS+net coverage alone |
| Custom seccomp filter | High maintenance; compose via bwrap later if needed |
| realpath-only | Explicitly insufficient |

## Failure mode

If `bwrap` missing and `require_os_sandbox`: return `blocked` with `sandbox_required_unavailable_no_host_fallback`.

## Tests

`tests/unit/v35-sandbox.test.ts` — exec, net deny, outside write, symlink, unavailable backend.
